import {
  completeSync,
  createOnboarding,
  failSync,
  type OnboardingSession,
  prepareForVerification,
  retrySync,
  startProvisioning,
  startSync,
  submitOnboarding,
  updateChecklistItem,
  verifyOnboarding,
} from "../../src/application/index.ts";
import { WorkflowError } from "../../src/services/workflow-error.ts";
import { assertEquals, deepFreeze } from "../services/test_helpers.ts";
import { context, fixture } from "./fixtures.ts";

function created(): OnboardingSession {
  const { input, configuration } = fixture();
  return createOnboarding(input, configuration, context("created"));
}

function provisioning(): OnboardingSession {
  return startProvisioning(
    submitOnboarding(created(), context("submitted")),
    context("provisioning"),
  );
}

function ready(): OnboardingSession {
  let session = provisioning();
  for (const item of session.checklist) {
    if (item.required) {
      session = updateChecklistItem(
        session,
        item.id,
        "completed",
        context(`complete-${item.id}`),
      );
    }
  }
  return prepareForVerification(session, context("ready"));
}

function verified(): OnboardingSession {
  return verifyOnboarding(ready(), "approved", context("approved"));
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

Deno.test("creation resolves package defaults and exceptions into a draft session", () => {
  const session = created();
  assertEquals(session.onboarding.status, "draft");
  assertEquals(session.onboarding.verification, { status: "pending" });
  assertEquals(session.onboarding.accessRequest, {
    accessPackageId: "demo-engineering",
    defaultApplicationIds: ["password-manager", "project-management"],
    addedApplicationIds: ["analytics", "password-manager"],
    removedApplicationIds: ["project-management"],
    finalApplicationIds: ["password-manager", "analytics"],
  });
  assertEquals(session.checklist.map((item) => item.title), [
    "Create Slack account — demo-workspace",
    "Create account — Password Manager",
    "Assign license — Password Manager",
    "Provision access to Analytics",
    "Prepare company macOS laptop",
  ]);
  assertEquals(
    session.checklist.every((item) =>
      item.status === "pending" && item.required
    ),
    true,
  );
  assertEquals(session.auditEvents, [{
    id: "created",
    onboardingId: session.onboarding.id,
    eventType: "onboarding_created",
    actor: "demo-technician",
    timestamp: "2026-10-01T10:00:00Z",
    metadata: { toStatus: "draft" },
  }]);
  assertEquals(session.onboarding.requestedBy, "demo-requester");
  assertEquals(session.onboarding.requestDate, "2026-10-01T09:00:00Z");
  assertEquals(
    session.onboarding.additionalNotes,
    "Fictional onboarding example",
  );
});

Deno.test("creation without package retains manual access and omits package reference", () => {
  const { input, configuration } = fixture();
  delete input.accessPackageId;
  configuration.accessPackages = [];
  const session = createOnboarding(input, configuration, context("created"));
  assertEquals(session.onboarding.accessRequest.defaultApplicationIds, []);
  assertEquals(session.onboarding.accessRequest.finalApplicationIds, [
    "analytics",
    "password-manager",
  ]);
  assertEquals("accessPackageId" in session.onboarding.accessRequest, false);
});

Deno.test("creation rejects unknown and ambiguous selected packages", () => {
  const { input, configuration } = fixture();
  input.accessPackageId = "missing";
  fails(() => createOnboarding(input, configuration, context("created")));
  input.accessPackageId = "demo-engineering";
  configuration.accessPackages = [
    ...configuration.accessPackages,
    ...configuration.accessPackages,
  ];
  fails(() => createOnboarding(input, configuration, context("created")));
});

Deno.test("creation preserves frozen caller input and configuration and produces independent snapshots", () => {
  const { input, configuration } = deepFreeze(fixture());
  const before = JSON.stringify([input, configuration]);
  const session = createOnboarding(input, configuration, context("created"));
  session.onboarding.employee.firstName = "Changed";
  session.onboarding.accessRequest.defaultApplicationIds = [];
  session.onboarding.coreAccountRequests[0].workspaceIds = [];
  session.checklist[1].title = "Changed";
  assertEquals(JSON.stringify([input, configuration]), before);
  assertEquals(
    createOnboarding(input, configuration, context("created")),
    created(),
  );
});

Deno.test("happy path composes creation through completion with ordered audit history", () => {
  let session = created();
  const snapshots: { session: OnboardingSession; serialized: string }[] = [];
  function advance(
    operation: (current: OnboardingSession) => OnboardingSession,
  ): void {
    snapshots.push({
      session: deepFreeze(session),
      serialized: JSON.stringify(session),
    });
    const previous = session;
    session = operation(session);
    assertEquals(session === previous, false);
    assertEquals(session.auditEvents === previous.auditEvents, false);
    assertEquals(session.auditEvents.slice(0, -1), previous.auditEvents);
  }
  advance((s) => submitOnboarding(s, context("submitted")));
  advance((s) => startProvisioning(s, context("provisioning")));
  const firstId = session.checklist[0].id;
  advance((s) =>
    updateChecklistItem(s, firstId, "in_progress", context("task-started"))
  );
  const taskIds = session.checklist.filter((item) => item.required).map((
    item,
  ) => item.id);
  for (const id of taskIds) {
    advance((s) =>
      updateChecklistItem(s, id, "completed", context(`complete-${id}`))
    );
  }
  advance((s) => prepareForVerification(s, context("ready")));
  advance((s) =>
    verifyOnboarding(s, "approved", context("approved"), "Demo review passed")
  );
  advance((s) => startSync(s, context("sync-started")));
  advance((s) => completeSync(s, context("sync-completed")));
  assertEquals(session.onboarding.status, "complete");
  assertEquals(session.onboarding.verification.status, "approved");
  assertEquals(
    session.checklist.every((item) => item.status === "completed"),
    true,
  );
  assertEquals(session.auditEvents.map((event) => event.eventType), [
    "onboarding_created",
    "onboarding_submitted",
    "provisioning_started",
    "checklist_item_started",
    ...taskIds.map(() => "checklist_item_completed"),
    "ready_for_verification",
    "verification_approved",
    "sync_started",
    "sync_completed",
  ]);
  assertEquals(
    new Set(session.auditEvents.map((event) => event.id)).size,
    session.auditEvents.length,
  );
  assertEquals(
    session.auditEvents.every((event) =>
      event.onboardingId === session.onboarding.id &&
      event.actor === "demo-technician"
    ),
    true,
  );
  session.auditEvents[0].metadata = { changed: true };
  session.onboarding.employee.firstName = "Changed";
  session.checklist[0].title = "Changed";
  for (const snapshot of snapshots) {
    assertEquals(JSON.stringify(snapshot.session), snapshot.serialized);
  }
});

Deno.test("verification rejection returns to provisioning and supports later approval", () => {
  const source = deepFreeze(ready());
  const before = JSON.stringify(source);
  const rejected = verifyOnboarding(
    source,
    "rejected",
    context("rejected"),
    "Demo correction required",
  );
  assertEquals(rejected.onboarding.status, "provisioning");
  assertEquals(rejected.onboarding.verification, {
    status: "rejected",
    verifiedBy: "demo-technician",
    verifiedAt: "2026-10-01T10:00:00Z",
    notes: "Demo correction required",
  });
  assertEquals(rejected.auditEvents.at(-1)?.eventType, "verification_rejected");
  assertEquals(JSON.stringify(source), before);
  const approved = verifyOnboarding(
    prepareForVerification(rejected, context("ready-again")),
    "approved",
    context("approved"),
  );
  assertEquals(approved.onboarding.status, "verified");
  assertEquals(approved.auditEvents.slice(-3).map((event) => event.eventType), [
    "verification_rejected",
    "ready_for_verification",
    "verification_approved",
  ]);
});

Deno.test("modeled sync failure and retry append events without changing prior snapshots", () => {
  const initial = deepFreeze(verified());
  const syncing = deepFreeze(startSync(initial, context("sync")));
  const failed = deepFreeze(failSync(syncing, context("failed")));
  const retried = deepFreeze(retrySync(failed, context("retry")));
  const complete = completeSync(retried, context("complete"));
  assertEquals(
    [initial, syncing, failed, retried, complete].map((s) =>
      s.onboarding.status
    ),
    ["verified", "syncing", "sync_failed", "syncing", "complete"],
  );
  assertEquals(complete.auditEvents.slice(-4).map((event) => event.eventType), [
    "sync_started",
    "sync_failed",
    "sync_retry_started",
    "sync_completed",
  ]);
  assertEquals(complete.checklist, initial.checklist);
});

Deno.test("orchestration preserves workflow gates and failed operations leave history unchanged", () => {
  const draft = deepFreeze(created());
  const submitted = deepFreeze(submitOnboarding(draft, context("submit")));
  const active = deepFreeze(startProvisioning(submitted, context("start")));
  const before = JSON.stringify([draft, submitted, active]);
  fails(() => submitOnboarding(submitted, context("again")));
  fails(() => startProvisioning(draft, context("early")));
  fails(() => prepareForVerification(active, context("incomplete")));
  fails(() => startSync(active, context("early-sync")));
  fails(() => verifyOnboarding(active, "approved", context("early-approval")));
  fails(() => completeSync(active, context("early-complete")));
  fails(() => failSync(active, context("early-failure")));
  assertEquals(JSON.stringify([draft, submitted, active]), before);
});

Deno.test("initial sync and retry operations cannot substitute for one another", () => {
  const approved = verified();
  fails(() => retrySync(approved, context("not-a-retry")));
  const failed = failSync(
    startSync(approved, context("sync")),
    context("failure"),
  );
  fails(() => startSync(failed, context("must-retry")));
});

Deno.test("checklist orchestration permits optional skipping and rejects forbidden updates", () => {
  const source = provisioning();
  source.checklist.push({
    id: "demo-optional",
    title: "Optional demo review",
    category: "example",
    required: false,
    status: "pending",
  });
  deepFreeze(source);
  const skipped = updateChecklistItem(
    source,
    "demo-optional",
    "skipped",
    context("skip"),
  );
  assertEquals(skipped.checklist.at(-1)?.status, "skipped");
  assertEquals(skipped.auditEvents.at(-1)?.eventType, "checklist_item_skipped");
  assertEquals(source.checklist.at(-1)?.status, "pending");
  fails(() =>
    updateChecklistItem(
      source,
      source.checklist[0].id,
      "skipped",
      context("required"),
    )
  );
  fails(() =>
    updateChecklistItem(
      skipped,
      "demo-optional",
      "completed",
      context("terminal"),
    )
  );
  fails(() =>
    updateChecklistItem(source, "missing", "completed", context("missing"))
  );
  const completed = updateChecklistItem(
    source,
    source.checklist[0].id,
    "completed",
    context("done"),
  );
  fails(() =>
    updateChecklistItem(
      completed,
      completed.checklist[0].id,
      "completed",
      context("again"),
    )
  );
});

Deno.test("audit insertion order follows operations rather than sorting caller timestamps", () => {
  const source = created();
  const result = submitOnboarding(source, {
    ...context("submitted"),
    timestamp: "2026-09-01T10:00:00Z",
  });
  assertEquals(result.auditEvents.map((event) => event.id), [
    "created",
    "submitted",
  ]);
  assertEquals(source.auditEvents.length, 1);
});
