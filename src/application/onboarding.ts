import type {
  AccessPackage,
  Application,
  AuditEvent,
  ChecklistStatus,
  CoreAccountRequest,
  Employee,
  EquipmentRequest,
  OnboardingRequest,
  OnboardingStatus,
} from "../domain/index.ts";
import { resolveApplicationAccess } from "../services/access-resolver.ts";
import {
  type ActionContext,
  createAuditEvent,
} from "../services/audit-events.ts";
import { generateChecklist } from "../services/checklist-generator.ts";
import { transitionChecklistItem } from "../services/checklist-lifecycle.ts";
import { transitionOnboarding } from "../services/onboarding-workflow.ts";
import { verifyOnboarding as verifyRequest } from "../services/verification.ts";
import { WorkflowError } from "../services/workflow-error.ts";
import type { OnboardingSession } from "./onboarding-session.ts";

export interface CreateOnboardingInput {
  id: string;
  employee: Employee;
  coreAccountRequests: readonly CoreAccountRequest[];
  equipmentRequest: EquipmentRequest;
  accessPackageId?: string;
  addedApplicationIds: readonly string[];
  removedApplicationIds: readonly string[];
  requestedBy: string;
  requestDate: string;
  additionalNotes?: string;
}

export interface OnboardingConfiguration {
  accessPackages: readonly AccessPackage[];
  applications: readonly Application[];
}

export function createOnboarding(
  input: CreateOnboardingInput,
  configuration: OnboardingConfiguration,
  context: ActionContext,
): OnboardingSession {
  let selectedPackage: AccessPackage | undefined;
  if (input.accessPackageId !== undefined) {
    const matches = configuration.accessPackages.filter((entry) =>
      entry.id === input.accessPackageId
    );
    if (matches.length !== 1) {
      throw new WorkflowError(
        `Expected exactly one access package: ${input.accessPackageId}`,
      );
    }
    selectedPackage = matches[0];
  }
  const defaults = selectedPackage?.defaultApplicationIds ?? [];
  const onboarding: OnboardingRequest = structuredClone({
    id: input.id,
    employee: input.employee,
    coreAccountRequests: input.coreAccountRequests,
    equipmentRequest: input.equipmentRequest,
    requestedBy: input.requestedBy,
    requestDate: input.requestDate,
    ...(input.additionalNotes === undefined
      ? {}
      : { additionalNotes: input.additionalNotes }),
    accessRequest: {
      ...(selectedPackage === undefined
        ? {}
        : { accessPackageId: selectedPackage.id }),
      defaultApplicationIds: defaults,
      addedApplicationIds: input.addedApplicationIds,
      removedApplicationIds: input.removedApplicationIds,
      finalApplicationIds: resolveApplicationAccess(
        defaults,
        input.addedApplicationIds,
        input.removedApplicationIds,
      ),
    },
    status: "draft",
    verification: { status: "pending" },
  });
  const checklist = generateChecklist(onboarding, configuration.applications);
  const event = createAuditEvent(onboarding.id, "onboarding_created", context, {
    toStatus: "draft",
  });
  return { onboarding, checklist, auditEvents: [event] };
}

/** Clone the combined result so returned snapshots share no mutable history/state. */
function appendResult(
  session: OnboardingSession,
  changes: Partial<Pick<OnboardingSession, "onboarding" | "checklist">>,
  event: AuditEvent,
): OnboardingSession {
  return structuredClone({
    ...session,
    ...changes,
    auditEvents: [...session.auditEvents, event],
  });
}

function transition(
  session: OnboardingSession,
  target: OnboardingStatus,
  context: ActionContext,
): OnboardingSession {
  const result = transitionOnboarding(
    session.onboarding,
    target,
    session.checklist,
    context,
  );
  return appendResult(session, { onboarding: result.onboarding }, result.event);
}

export function submitOnboarding(
  session: OnboardingSession,
  context: ActionContext,
): OnboardingSession {
  return transition(session, "submitted", context);
}

export function startProvisioning(
  session: OnboardingSession,
  context: ActionContext,
): OnboardingSession {
  return transition(session, "provisioning", context);
}

export function updateChecklistItem(
  session: OnboardingSession,
  itemId: string,
  target: ChecklistStatus,
  context: ActionContext,
): OnboardingSession {
  const result = transitionChecklistItem(
    session.checklist,
    itemId,
    target,
    session.onboarding.id,
    context,
  );
  return appendResult(session, { checklist: result.checklist }, result.event);
}

export function prepareForVerification(
  session: OnboardingSession,
  context: ActionContext,
): OnboardingSession {
  return transition(session, "ready_for_verification", context);
}

export function verifyOnboarding(
  session: OnboardingSession,
  decision: "approved" | "rejected",
  context: ActionContext,
  notes?: string,
): OnboardingSession {
  const result = verifyRequest(
    session.onboarding,
    session.checklist,
    decision,
    context,
    notes,
  );
  return appendResult(session, { onboarding: result.onboarding }, result.event);
}

/** State only. Distinguish initial sync from retry, which share a target status. */
export function startSync(
  session: OnboardingSession,
  context: ActionContext,
): OnboardingSession {
  if (session.onboarding.status === "sync_failed") {
    throw new WorkflowError("Use retrySync after sync failure");
  }
  return transition(session, "syncing", context);
}

/** State only; no external synchronization is performed. */
export function completeSync(
  session: OnboardingSession,
  context: ActionContext,
): OnboardingSession {
  return transition(session, "complete", context);
}

/** State only; no external synchronization is performed. */
export function failSync(
  session: OnboardingSession,
  context: ActionContext,
): OnboardingSession {
  return transition(session, "sync_failed", context);
}

/** State only. The transition service remains responsible for transition rules. */
export function retrySync(
  session: OnboardingSession,
  context: ActionContext,
): OnboardingSession {
  if (session.onboarding.status === "verified") {
    throw new WorkflowError("Use startSync for initial sync");
  }
  return transition(session, "syncing", context);
}
