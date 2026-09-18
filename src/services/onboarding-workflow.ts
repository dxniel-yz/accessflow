import type {
  AuditEvent,
  ChecklistItem,
  OnboardingRequest,
  OnboardingStatus,
} from "../domain/index.ts";
import { type ActionContext, createAuditEvent } from "./audit-events.ts";
import { isReadyForVerification } from "./checklist-lifecycle.ts";
import { WorkflowError } from "./workflow-error.ts";

const transitions: Partial<
  Record<OnboardingStatus, Partial<Record<OnboardingStatus, string>>>
> = {
  draft: { submitted: "onboarding_submitted" },
  submitted: { provisioning: "provisioning_started" },
  provisioning: { ready_for_verification: "ready_for_verification" },
  verified: { syncing: "sync_started" },
  syncing: { complete: "sync_completed", sync_failed: "sync_failed" },
  sync_failed: { syncing: "sync_retry_started" },
};

export function transitionOnboarding(
  onboarding: OnboardingRequest,
  target: OnboardingStatus,
  checklist: readonly ChecklistItem[],
  context: ActionContext,
): { onboarding: OnboardingRequest; event: AuditEvent } {
  const eventType = transitions[onboarding.status]?.[target];
  if (!eventType) {
    throw new WorkflowError(
      `Invalid onboarding transition: ${onboarding.status} -> ${target}`,
    );
  }
  if (
    target === "ready_for_verification" && !isReadyForVerification(checklist)
  ) {
    throw new WorkflowError("Required checklist items are incomplete");
  }
  const event = createAuditEvent(onboarding.id, eventType, context, {
    fromStatus: onboarding.status,
    toStatus: target,
  });
  return {
    onboarding: { ...structuredClone(onboarding), status: target },
    event,
  };
}
