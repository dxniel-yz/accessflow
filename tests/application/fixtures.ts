import type {
  ActionContext,
  CreateOnboardingInput,
  OnboardingConfiguration,
} from "../../src/application/index.ts";
import { demoApplications } from "../../src/demo/applications.ts";

/** Fictional, fresh test inputs; not production configuration. */
export function fixture(): {
  input: CreateOnboardingInput;
  configuration: OnboardingConfiguration;
} {
  return {
    input: {
      id: "demo-onboarding-001",
      employee: {
        firstName: "Alex",
        lastName: "Morgan",
        jobTitle: "Software Engineer",
        department: "Engineering",
        manager: "demo-manager",
        employmentType: "salary",
        startDate: "2026-10-02",
        workLocation: "remote",
      },
      coreAccountRequests: [{
        service: "slack",
        workspaceIds: ["demo-workspace"],
      }],
      equipmentRequest: { platform: "macOS", deviceRequirements: "standard" },
      accessPackageId: "demo-engineering",
      addedApplicationIds: ["analytics", "password-manager"],
      removedApplicationIds: ["project-management"],
      requestedBy: "demo-requester",
      requestDate: "2026-10-01T09:00:00Z",
      additionalNotes: "Fictional onboarding example",
    },
    configuration: {
      accessPackages: [{
        id: "demo-engineering",
        displayName: "Demo Engineering",
        defaultApplicationIds: ["password-manager", "project-management"],
      }],
      applications: structuredClone(demoApplications),
    },
  };
}

export function context(eventId: string): ActionContext {
  return {
    eventId,
    actor: "demo-technician",
    timestamp: "2026-10-01T10:00:00Z",
  };
}
