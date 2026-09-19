import type { OnboardingConfiguration } from "../application/index.ts";
import { demoApplications } from "./applications.ts";

/** Fictional local demo configuration only. */
export const demoConfiguration: OnboardingConfiguration = {
  applications: demoApplications,
  accessPackages: [{
    id: "demo-engineering",
    displayName: "Demo Engineering",
    department: "Engineering",
    defaultApplicationIds: ["password-manager", "project-management"],
  }],
};
