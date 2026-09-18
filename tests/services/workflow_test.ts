import type {
  ChecklistItem,
  ChecklistStatus,
  OnboardingRequest,
  OnboardingStatus,
} from "../../src/domain/index.ts";
import {
  type ActionContext,
  createAuditEvent,
} from "../../src/services/audit-events.ts";
import {
  isReadyForVerification,
  transitionChecklistItem,
} from "../../src/services/checklist-lifecycle.ts";
import { transitionOnboarding } from "../../src/services/onboarding-workflow.ts";
import { verifyOnboarding } from "../../src/services/verification.ts";
import { WorkflowError } from "../../src/services/workflow-error.ts";
import { assertEquals, deepFreeze } from "./test_helpers.ts";

const context: ActionContext = deepFreeze({
  eventId: "demo-event-001",
  actor: "demo-technician",
  timestamp: "2026-10-01T12:00:00Z",
});

function onboarding(status: OnboardingStatus = "draft"): OnboardingRequest {
  return {
    id: "demo-onboarding-001",
    status,
    employee: {
      firstName: "Alex",
      lastName: "Morgan",
      jobTitle: "Engineer",
      department: "Engineering",
      manager: "demo-manager",
      employmentType: "salary",
      startDate: "2026-10-02",
      workLocation: "remote",
    },
    coreAccountRequests: [],
    accessRequest: {
      defaultApplicationIds: [],
      addedApplicationIds: [],
      removedApplicationIds: [],
      finalApplicationIds: [],
    },
    equipmentRequest: { platform: "macOS", deviceRequirements: "standard" },
    requestedBy: "demo-requester",
    requestDate: "2026-10-01T10:00:00Z",
    verification: { status: "pending" },
  };
}

function item(
  status: ChecklistStatus = "pending",
  required = true,
): ChecklistItem {
  const base = {
    id: "demo-task",
    title: "Prepare laptop",
    category: "equipment",
    required,
  };
  return status === "completed"
    ? {
      ...base,
      status,
      completion: {
        completedBy: context.actor,
        completedAt: context.timestamp,
      },
    }
    : { ...base, status };
}

function fails(action: () => unknown): void {
  try {
    action();
  } catch (error) {
    assertEquals(error instanceof WorkflowError, true);
    return;
  }
  throw new Error("Expected WorkflowError");
}

const allowed: [OnboardingStatus, OnboardingStatus, string][] = [
  ["draft", "submitted", "onboarding_submitted"],
  ["submitted", "provisioning", "provisioning_started"],
  ["provisioning", "ready_for_verification", "ready_for_verification"],
  ["verified", "syncing", "sync_started"],
  ["syncing", "complete", "sync_completed"],
  ["syncing", "sync_failed", "sync_failed"],
  ["sync_failed", "syncing", "sync_retry_started"],
];
for (const [from, to, eventType] of allowed) {
  Deno.test(`workflow ${from} -> ${to} produces audited immutable state`, () => {
    const source = deepFreeze(onboarding(from));
    const checklist = deepFreeze([item("completed")]);
    const before = JSON.stringify([source, checklist]);
    const result = transitionOnboarding(source, to, checklist, context);
    assertEquals(result.onboarding.status, to);
    assertEquals(result.event, {
      id: context.eventId,
      onboardingId: source.id,
      eventType,
      actor: context.actor,
      timestamp: context.timestamp,
      metadata: { fromStatus: from, toStatus: to },
    });
    assertEquals(JSON.stringify([source, checklist]), before);
    result.onboarding.employee.firstName = "Demo change";
    assertEquals(source.employee.firstName, "Alex");
  });
}

Deno.test("workflow rejects every unlisted state transition, including direct verification and rejection", () => {
  const statuses: OnboardingStatus[] = [
    "draft",
    "submitted",
    "provisioning",
    "ready_for_verification",
    "verified",
    "syncing",
    "complete",
    "sync_failed",
  ];
  for (const from of statuses) {
    for (const to of statuses) {
      if (!allowed.some(([a, b]) => a === from && b === to)) {
        fails(() =>
          transitionOnboarding(
            onboarding(from),
            to,
            [item("completed")],
            context,
          )
        );
      }
    }
  }
});

Deno.test("workflow readiness transition blocks incomplete required tasks", () => {
  for (const status of ["pending", "in_progress", "skipped"] as const) {
    fails(() =>
      transitionOnboarding(
        onboarding("provisioning"),
        "ready_for_verification",
        [item(status)],
        context,
      )
    );
  }
});

for (const required of [true, false]) {
  for (
    const from of ["pending", "in_progress", "completed", "skipped"] as const
  ) {
    for (
      const to of ["pending", "in_progress", "completed", "skipped"] as const
    ) {
      Deno.test(`checklist ${required ? "required" : "optional"} ${from} -> ${to}`, () => {
        const source = deepFreeze([item(from, required)]);
        const before = JSON.stringify(source);
        const valid = (from === "pending" && to === "in_progress") ||
          ((from === "pending" || from === "in_progress") &&
            (to === "completed" || (to === "skipped" && !required)));
        if (!valid) {
          fails(() =>
            transitionChecklistItem(
              source,
              "demo-task",
              to,
              "demo-onboarding-001",
              context,
            )
          );
        } else {
          const result = transitionChecklistItem(
            source,
            "demo-task",
            to,
            "demo-onboarding-001",
            context,
          );
          assertEquals(result.checklist[0].status, to);
          assertEquals(
            result.event.eventType,
            to === "completed"
              ? "checklist_item_completed"
              : to === "skipped"
              ? "checklist_item_skipped"
              : "checklist_item_started",
          );
          assertEquals(result.event.metadata, {
            checklistItemId: "demo-task",
            fromStatus: from,
            toStatus: to,
          });
          assertEquals([
            result.event.id,
            result.event.actor,
            result.event.timestamp,
            result.event.onboardingId,
          ], [
            context.eventId,
            context.actor,
            context.timestamp,
            "demo-onboarding-001",
          ]);
          if (to === "completed") {
            assertEquals(result.checklist[0].completion, {
              completedBy: context.actor,
              completedAt: context.timestamp,
            });
          } else assertEquals("completion" in result.checklist[0], false);
        }
        assertEquals(JSON.stringify(source), before);
      });
    }
  }
}

Deno.test("checklist rejects missing or ambiguous task IDs", () => {
  fails(() =>
    transitionChecklistItem(
      [],
      "missing",
      "completed",
      "demo-onboarding",
      context,
    )
  );
  fails(() =>
    transitionChecklistItem(
      [item(), item()],
      "demo-task",
      "completed",
      "demo-onboarding",
      context,
    )
  );
});

Deno.test("checklist preserves unrelated tasks without sharing mutable completion metadata", () => {
  const other = { ...item("completed"), id: "other" };
  const source = deepFreeze([item(), other]);
  const result = transitionChecklistItem(
    source,
    "demo-task",
    "completed",
    "demo-onboarding",
    context,
  );
  assertEquals(result.checklist[1], other);
  if (result.checklist[1].status === "completed") {
    result.checklist[1].completion.completedBy = "changed";
  }
  assertEquals(other.completion?.completedBy, context.actor);
});

Deno.test("readiness considers only required completion, including empty and optional-only lists", () => {
  assertEquals(isReadyForVerification([]), true);
  for (
    const status of ["pending", "in_progress", "completed", "skipped"] as const
  ) {
    assertEquals(
      isReadyForVerification([item(status)]),
      status === "completed",
    );
    assertEquals(isReadyForVerification([item(status, false)]), true);
    assertEquals(
      isReadyForVerification([item("completed"), item(status, false)]),
      true,
    );
    assertEquals(
      isReadyForVerification([item("pending"), item(status, false)]),
      false,
    );
  }
});

for (const decision of ["approved", "rejected"] as const) {
  Deno.test(`verification ${decision} records decision, audit, actor and timestamp immutably`, () => {
    const source = deepFreeze(onboarding("ready_for_verification"));
    const checklist = deepFreeze([item("completed"), {
      ...item("pending", false),
      id: "optional",
    }]);
    const before = JSON.stringify([source, checklist]);
    const result = verifyOnboarding(
      source,
      checklist,
      decision,
      context,
      "Demo review notes",
    );
    assertEquals(
      result.onboarding.status,
      decision === "approved" ? "verified" : "provisioning",
    );
    assertEquals(result.onboarding.verification, {
      status: decision,
      verifiedBy: context.actor,
      verifiedAt: context.timestamp,
      notes: "Demo review notes",
    });
    assertEquals(result.event, {
      id: context.eventId,
      onboardingId: source.id,
      eventType: `verification_${decision}`,
      actor: context.actor,
      timestamp: context.timestamp,
      metadata: {
        fromStatus: source.status,
        toStatus: result.onboarding.status,
        notes: "Demo review notes",
      },
    });
    assertEquals(JSON.stringify([source, checklist]), before);
  });

  Deno.test(`verification ${decision} rejects wrong states and incomplete required tasks`, () => {
    for (
      const status of [
        "draft",
        "submitted",
        "provisioning",
        "verified",
        "syncing",
        "complete",
        "sync_failed",
      ] as const
    ) {
      fails(() =>
        verifyOnboarding(
          onboarding(status),
          [item("completed")],
          decision,
          context,
        )
      );
    }
    for (const status of ["pending", "in_progress", "skipped"] as const) {
      fails(() =>
        verifyOnboarding(
          onboarding("ready_for_verification"),
          [item(status)],
          decision,
          context,
        )
      );
    }
  });
}

Deno.test("rejected onboarding can return to readiness and later be approved", () => {
  const checklist = [item("completed")];
  const rejected = verifyOnboarding(
    onboarding("ready_for_verification"),
    checklist,
    "rejected",
    context,
  ).onboarding;
  const ready =
    transitionOnboarding(rejected, "ready_for_verification", checklist, {
      ...context,
      eventId: "demo-event-002",
    }).onboarding;
  assertEquals(ready.verification.status, "rejected");
  const approved = verifyOnboarding(ready, checklist, "approved", {
    ...context,
    eventId: "demo-event-003",
  }).onboarding;
  assertEquals(approved.status, "verified");
  assertEquals(approved.verification.status, "approved");
  assertEquals("notes" in approved.verification, false);
});

Deno.test("audit factory preserves caller IDs and nested metadata without reading a clock", () => {
  const metadata = deepFreeze({
    task: { id: "demo-task" },
    values: [1, true, null],
  });
  const first = createAuditEvent(
    "demo-onboarding",
    "demo_action",
    context,
    metadata,
  );
  assertEquals(
    first,
    createAuditEvent("demo-onboarding", "demo_action", context, metadata),
  );
  assertEquals(first.metadata, metadata);
  assertEquals(first.id, context.eventId);
  assertEquals(
    createAuditEvent("demo-onboarding", "demo_action", {
      ...context,
      eventId: "demo-event-002",
    }).id,
    "demo-event-002",
  );
  assertEquals(
    "metadata" in createAuditEvent("demo-onboarding", "demo_action", context),
    false,
  );
});

Deno.test("actions require nonblank actor, timestamp and caller-controlled event ID", () => {
  for (const field of ["actor", "timestamp", "eventId"] as const) {
    const invalid = { ...context, [field]: " " };
    fails(() => createAuditEvent("demo-onboarding", "demo_action", invalid));
    fails(() => transitionOnboarding(onboarding(), "submitted", [], invalid));
    fails(() =>
      transitionChecklistItem(
        [item()],
        "demo-task",
        "completed",
        "demo-onboarding",
        invalid,
      )
    );
    for (const decision of ["approved", "rejected"] as const) {
      fails(() =>
        verifyOnboarding(
          onboarding("ready_for_verification"),
          [item("completed")],
          decision,
          invalid,
        )
      );
    }
  }
});
