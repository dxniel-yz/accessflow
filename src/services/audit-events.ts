import type { AuditEvent } from "../domain/index.ts";
import { WorkflowError } from "./workflow-error.ts";

export interface ActionContext {
  eventId: string;
  actor: string;
  /** Caller-supplied ISO 8601 timestamp; no clock is read by the services. */
  timestamp: string;
}

export function createAuditEvent(
  onboardingId: string,
  eventType: string,
  context: ActionContext,
  metadata?: AuditEvent["metadata"],
): AuditEvent {
  for (
    const [field, value] of Object.entries({
      onboardingId,
      eventType,
      eventId: context.eventId,
      actor: context.actor,
      timestamp: context.timestamp,
    })
  ) {
    if (typeof value !== "string" || !value.trim()) {
      throw new WorkflowError(`${field} must be a non-empty string`);
    }
  }
  return {
    id: context.eventId,
    onboardingId,
    eventType,
    actor: context.actor,
    timestamp: context.timestamp,
    ...(metadata === undefined ? {} : { metadata: structuredClone(metadata) }),
  };
}
