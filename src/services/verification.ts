import type {
  AuditEvent,
  ChecklistItem,
  OnboardingRequest,
} from "../domain/index.ts";
import { type ActionContext, createAuditEvent } from "./audit-events.ts";
import { isReadyForVerification } from "./checklist-lifecycle.ts";
import { WorkflowError } from "./workflow-error.ts";

/** Context actor/timestamp become verifiedBy/verifiedAt for either decision. */
export function verifyOnboarding(
  onboarding: OnboardingRequest,
  checklist: readonly ChecklistItem[],
  decision: "approved" | "rejected",
  context: ActionContext,
  notes?: string,
): { onboarding: OnboardingRequest; event: AuditEvent } {
  if (onboarding.status !== "ready_for_verification") {
    throw new WorkflowError(
      "Verification requires ready_for_verification status",
    );
  }
  if (!isReadyForVerification(checklist)) {
    throw new WorkflowError("Required checklist items are incomplete");
  }
  if (decision !== "approved" && decision !== "rejected") {
    throw new WorkflowError("Invalid verification decision");
  }
  const status = decision === "approved" ? "verified" : "provisioning";
  const event = createAuditEvent(
    onboarding.id,
    `verification_${decision}`,
    context,
    {
      fromStatus: onboarding.status,
      toStatus: status,
      ...(notes === undefined ? {} : { notes }),
    },
  );
  return {
    onboarding: {
      ...structuredClone(onboarding),
      status,
      verification: {
        status: decision,
        verifiedBy: context.actor,
        verifiedAt: context.timestamp,
        ...(notes === undefined ? {} : { notes }),
      },
    },
    event,
  };
}
