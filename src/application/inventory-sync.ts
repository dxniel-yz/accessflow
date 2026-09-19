import type {
  IdentityInventoryConnector,
  InventorySyncSnapshot,
} from "../connectors/identity-inventory-connector.ts";
import {
  type ActionContext,
  createAuditEvent,
} from "../services/audit-events.ts";
import { WorkflowError } from "../services/workflow-error.ts";
import type { OnboardingSession } from "./onboarding-session.ts";
import { completeSync, failSync, startSync } from "./onboarding.ts";

export interface InventorySyncContexts {
  started: ActionContext;
  completed: ActionContext;
  failed: ActionContext;
}

export type InventorySyncResult =
  | { ok: true; session: OnboardingSession }
  | { ok: false; session: OnboardingSession; error: unknown };

/** Build a detached, runtime-frozen inventory projection, never a full session. */
export function prepareInventorySync(
  session: OnboardingSession,
  personReference: string,
): InventorySyncSnapshot {
  if (
    session.onboarding.status !== "verified" ||
    session.onboarding.verification.status !== "approved"
  ) {
    throw new WorkflowError(
      "Inventory synchronization requires verified onboarding with approved verification",
    );
  }
  if (!personReference.trim()) {
    throw new WorkflowError("Person reference must be non-empty");
  }
  const { employee, coreAccountRequests, accessRequest } = session.onboarding;
  return Object.freeze({
    person: Object.freeze({
      reference: personReference,
      firstName: employee.firstName,
      lastName: employee.lastName,
      ...(employee.preferredName === undefined
        ? {}
        : { preferredName: employee.preferredName }),
      jobTitle: employee.jobTitle,
      department: employee.department,
      employmentType: employee.employmentType,
      workLocation: employee.workLocation,
      startDate: employee.startDate,
      coreAccounts: Object.freeze(
        coreAccountRequests.map((account) =>
          Object.freeze({
            service: account.service,
            workspaceIds: Object.freeze([...account.workspaceIds]),
          })
        ),
      ),
    }),
    managerReference: employee.manager,
    applicationIds: Object.freeze([...accessRequest.finalApplicationIds]),
  });
}

/** Preconditions throw before connector calls; connector failures return failed state. */
export async function synchronizeInventory(
  session: OnboardingSession,
  personReference: string,
  connector: IdentityInventoryConnector,
  contexts: InventorySyncContexts,
): Promise<InventorySyncResult> {
  const snapshot = prepareInventorySync(session, personReference);
  // Capture caller contexts before awaits and validate all outcomes before side effects.
  const actions = structuredClone(contexts);
  const ids = new Set(session.auditEvents.map((event) => event.id));
  for (
    const [key, eventType] of [
      ["started", "sync_started"],
      ["completed", "sync_completed"],
      ["failed", "sync_failed"],
    ] as const
  ) {
    createAuditEvent(session.onboarding.id, eventType, actions[key]);
    if (ids.has(actions[key].eventId)) {
      throw new WorkflowError("Sync event IDs must be distinct and unused");
    }
    ids.add(actions[key].eventId);
  }
  const syncing = startSync(session, actions.started);
  try {
    await connector.upsertPerson(snapshot.person);
    await connector.setManager(
      snapshot.person.reference,
      snapshot.managerReference,
    );
    await connector.syncApplicationAccess(
      snapshot.person.reference,
      snapshot.applicationIds,
    );
  } catch (error) {
    return { ok: false, session: failSync(syncing, actions.failed), error };
  }
  return { ok: true, session: completeSync(syncing, actions.completed) };
}
