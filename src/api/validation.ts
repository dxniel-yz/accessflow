import type {
  ActionContext,
  CreateOnboardingInput,
} from "../application/index.ts";
import {
  array,
  choice,
  object,
  optionalString,
  string,
  strings,
} from "./http.ts";

export function actionContext(request: Request): ActionContext {
  return {
    eventId: string(request.headers.get("x-event-id"), "x-event-id"),
    actor: string(request.headers.get("x-actor"), "x-actor"),
    timestamp: string(request.headers.get("x-timestamp"), "x-timestamp"),
  };
}

export function createInput(
  body: Record<string, unknown>,
): CreateOnboardingInput {
  const employee = object(body.employee);
  const equipment = object(body.equipmentRequest);
  return {
    id: string(body.id, "id"),
    employee: {
      firstName: string(employee.firstName, "firstName"),
      lastName: string(employee.lastName, "lastName"),
      preferredName: optionalString(employee.preferredName, "preferredName"),
      personalEmail: optionalString(employee.personalEmail, "personalEmail"),
      jobTitle: string(employee.jobTitle, "jobTitle"),
      department: string(employee.department, "department"),
      manager: string(employee.manager, "manager"),
      employmentType: choice(employee.employmentType, [
        "salary",
        "hourly",
        "contractor",
      ], "employmentType"),
      workLocation: choice(employee.workLocation, [
        "onsite",
        "hybrid",
        "remote",
      ], "workLocation"),
      startDate: string(employee.startDate, "startDate"),
    },
    equipmentRequest: {
      platform: choice(equipment.platform, ["macOS", "Windows"], "platform"),
      deviceRequirements: choice(equipment.deviceRequirements, [
        "standard",
        "custom/high-performance",
      ], "deviceRequirements"),
      workloadRequirements: optionalString(
        equipment.workloadRequirements,
        "workloadRequirements",
      ),
    },
    coreAccountRequests: array(body.coreAccountRequests, "coreAccountRequests")
      .map((entry) => {
        const account = object(entry);
        return {
          service: choice(
            account.service,
            ["google_workspace", "slack"],
            "service",
          ),
          workspaceIds: strings(account.workspaceIds, "workspaceIds"),
        };
      }),
    accessPackageId: optionalString(body.accessPackageId, "accessPackageId"),
    addedApplicationIds: strings(
      body.addedApplicationIds,
      "addedApplicationIds",
    ),
    removedApplicationIds: strings(
      body.removedApplicationIds,
      "removedApplicationIds",
    ),
    requestedBy: string(body.requestedBy, "requestedBy"),
    requestDate: string(body.requestDate, "requestDate"),
    additionalNotes: optionalString(body.additionalNotes, "additionalNotes"),
  };
}
