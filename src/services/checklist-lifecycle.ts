import type {
  AuditEvent,
  ChecklistItem,
  ChecklistStatus,
} from "../domain/index.ts";
import { type ActionContext, createAuditEvent } from "./audit-events.ts";
import { WorkflowError } from "./workflow-error.ts";

/** Optional items never block readiness, including pending/in-progress items. */
export function isReadyForVerification(
  checklist: readonly ChecklistItem[],
): boolean {
  return checklist.every((item) =>
    !item.required || item.status === "completed"
  );
}

/** Context actor/timestamp become completedBy/completedAt on completion. */
export function transitionChecklistItem(
  checklist: readonly ChecklistItem[],
  itemId: string,
  target: ChecklistStatus,
  onboardingId: string,
  context: ActionContext,
): { checklist: ChecklistItem[]; event: AuditEvent } {
  const matches = checklist.filter((item) => item.id === itemId);
  if (matches.length !== 1) {
    throw new WorkflowError(`Expected exactly one checklist item: ${itemId}`);
  }
  const item = matches[0];
  const valid = (item.status === "pending" && target === "in_progress") ||
    ((item.status === "pending" || item.status === "in_progress") &&
      (target === "completed" || (target === "skipped" && !item.required)));
  if (!valid) {
    throw new WorkflowError(
      `Invalid checklist transition: ${item.status} -> ${target}`,
    );
  }
  const eventTypes = {
    in_progress: "checklist_item_started",
    completed: "checklist_item_completed",
    skipped: "checklist_item_skipped",
  };
  const event = createAuditEvent(onboardingId, eventTypes[target], context, {
    checklistItemId: itemId,
    fromStatus: item.status,
    toStatus: target,
  });
  const updated = structuredClone([...checklist]);
  const index = updated.findIndex((entry) => entry.id === itemId);
  updated[index] = target === "completed"
    ? {
      ...item,
      status: target,
      completion: {
        completedBy: context.actor,
        completedAt: context.timestamp,
      },
    }
    : { ...item, status: target, completion: undefined };
  // Non-completed items carry no completion metadata, including no undefined key.
  if (updated[index].status !== "completed") delete updated[index].completion;
  return { checklist: updated, event };
}
