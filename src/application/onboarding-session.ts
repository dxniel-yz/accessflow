import type {
  AuditEvent,
  ChecklistItem,
  OnboardingRequest,
} from "../domain/index.ts";

/** In-memory snapshot; no persistence or external synchronization is implied. */
export interface OnboardingSession {
  onboarding: OnboardingRequest;
  checklist: ChecklistItem[];
  auditEvents: AuditEvent[];
}
