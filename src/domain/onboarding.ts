import type { AccessRequest, CoreAccountRequest } from "./access.ts";
import type { Employee } from "./employee.ts";
import type { EquipmentRequest } from "./equipment.ts";
import type { OnboardingStatus, Verification } from "./workflow.ts";

export interface OnboardingRequest {
  id: string;
  employee: Employee;
  coreAccountRequests: readonly CoreAccountRequest[];
  accessRequest: AccessRequest;
  equipmentRequest: EquipmentRequest;
  /** Caller-provided actor reference. */
  requestedBy: string;
  /** ISO 8601 timestamp; runtime validation is deferred. */
  requestDate: string;
  additionalNotes?: string;
  status: OnboardingStatus;
  verification: Verification;
}
