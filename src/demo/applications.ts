import type { Application } from "../domain/index.ts";

/** Fictional demo configuration only; not production provisioning procedures. */
export const demoApplications: readonly Application[] = [
  {
    id: "password-manager",
    displayName: "Password Manager",
    active: true,
    provisioningTasks: [
      { id: "account", title: "Create account" },
      {
        id: "license",
        title: "Assign license",
        description: "Assign the requested demo license.",
      },
    ],
  },
  { id: "project-management", displayName: "Project Management", active: true },
  {
    id: "source-control",
    displayName: "Source Control",
    active: true,
    provisioningTasks: [
      { id: "groups", title: "Add required groups" },
      { id: "verify", title: "Verify access" },
    ],
  },
  { id: "analytics", displayName: "Analytics", active: true },
  { id: "support-platform", displayName: "Support Platform", active: true },
];
