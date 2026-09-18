import type { Application, OnboardingRequest } from "../../src/domain/index.ts";
import { demoApplications } from "../../src/demo/applications.ts";
import { generateChecklist } from "../../src/services/checklist-generator.ts";
import { assertEquals, assertThrows, deepFreeze } from "./test_helpers.ts";

function request(): OnboardingRequest {
  return {
    id: "onboarding-demo-001",
    employee: {
      firstName: "Alex",
      lastName: "Morgan",
      jobTitle: "Engineer",
      department: "Engineering",
      manager: "demo-manager",
      employmentType: "salary",
      startDate: "2026-10-01",
      workLocation: "remote",
    },
    coreAccountRequests: [],
    accessRequest: {
      defaultApplicationIds: [],
      addedApplicationIds: [],
      removedApplicationIds: [],
      finalApplicationIds: [],
    },
    equipmentRequest: { platform: "macOS", deviceRequirements: "standard" },
    requestedBy: "demo-requester",
    requestDate: "2026-09-18T12:00:00Z",
    status: "draft",
    verification: { status: "pending" },
  };
}

Deno.test("checklist creates accounts per selected service and workspace, deduplicating selections", () => {
  const onboarding = request();
  onboarding.coreAccountRequests = [
    {
      service: "google_workspace",
      workspaceIds: ["workspace-a", "workspace-b", "workspace-a"],
    },
    { service: "slack", workspaceIds: ["workspace-a"] },
    { service: "slack", workspaceIds: ["workspace-a"] },
  ];
  assertEquals(
    generateChecklist(onboarding, []).filter((item) =>
      item.category === "account"
    ).map((item) => item.title),
    [
      "Create Google Workspace account — workspace-a",
      "Create Google Workspace account — workspace-b",
      "Create Slack account — workspace-a",
    ],
  );
});

Deno.test("checklist skips empty core workspace selections", () => {
  const onboarding = request();
  onboarding.coreAccountRequests = [
    { service: "google_workspace", workspaceIds: [] },
    { service: "slack", workspaceIds: [] },
  ];
  assertEquals(generateChecklist(onboarding, []).map((item) => item.category), [
    "equipment",
  ]);
});

Deno.test("checklist uses only final access and configured templates in their supplied order", () => {
  const onboarding = request();
  onboarding.accessRequest = {
    defaultApplicationIds: ["analytics"],
    addedApplicationIds: ["support-platform"],
    removedApplicationIds: [],
    finalApplicationIds: [
      "source-control",
      "password-manager",
      "source-control",
    ],
  };
  const tasks = generateChecklist(onboarding, demoApplications).filter((item) =>
    item.category === "application_access"
  );
  assertEquals(tasks.map((item) => item.title), [
    "Add required groups — Source Control",
    "Verify access — Source Control",
    "Create account — Password Manager",
    "Assign license — Password Manager",
  ]);
  assertEquals(tasks[3].description, "Assign the requested demo license.");
});

Deno.test("checklist falls back for omitted and empty application templates", () => {
  const onboarding = request();
  onboarding.accessRequest.finalApplicationIds = [
    "project-management",
    "example-empty",
  ];
  const catalog = [...demoApplications, {
    id: "example-empty",
    displayName: "Example Empty",
    active: true,
    provisioningTasks: [],
  }];
  assertEquals(
    generateChecklist(onboarding, catalog).filter((item) =>
      item.category === "application_access"
    ).map((item) => item.title),
    [
      "Provision access to Project Management",
      "Provision access to Example Empty",
    ],
  );
});

for (const platform of ["macOS", "Windows"] as const) {
  Deno.test(`checklist prepares exactly one standard ${platform} laptop without a workload review`, () => {
    const onboarding = request();
    onboarding.equipmentRequest.platform = platform;
    assertEquals(generateChecklist(onboarding, []).map((item) => item.title), [
      `Prepare company ${platform} laptop`,
    ]);
  });
}

Deno.test("checklist places required custom workload review before laptop preparation", () => {
  const onboarding = request();
  onboarding.equipmentRequest = {
    platform: "Windows",
    deviceRequirements: "custom/high-performance",
    workloadRequirements: "Demo large dataset analysis",
  };
  const items = generateChecklist(onboarding, []);
  assertEquals(items.map((item) => item.title), [
    "Review workload/hardware requirements",
    "Prepare company Windows laptop",
  ]);
  assertEquals(items[0].description, "Demo large dataset analysis");
  assertEquals(items[0].required, true);
  delete onboarding.equipmentRequest.workloadRequirements;
  assertEquals(generateChecklist(onboarding, []).length, 2);
});

Deno.test("checklist IDs are deterministic, unique, scoped to onboarding, and delimiter safe", () => {
  const onboarding = request();
  onboarding.accessRequest.finalApplicationIds = ["a:b", "a"];
  const catalog: Application[] = [
    {
      id: "a:b",
      displayName: "Example One",
      active: true,
      provisioningTasks: [{ id: "c", title: "Create account" }],
    },
    {
      id: "a",
      displayName: "Example Two",
      active: true,
      provisioningTasks: [{ id: "b:c", title: "Create account" }],
    },
  ];
  const ids = generateChecklist(onboarding, catalog).map((item) => item.id);
  assertEquals(
    ids,
    generateChecklist(onboarding, catalog).map((item) => item.id),
  );
  assertEquals(new Set(ids).size, ids.length);
  assertEquals(
    generateChecklist(onboarding, [...catalog].reverse()).map((item) =>
      item.id
    ),
    ids,
  );
  onboarding.id = "onboarding-demo-002";
  assertEquals(
    generateChecklist(onboarding, catalog).some((item) =>
      ids.includes(item.id)
    ),
    false,
  );
});

Deno.test("checklist generates fresh pending required items without completion metadata or input mutation", () => {
  const onboarding = request();
  onboarding.coreAccountRequests = [{
    service: "slack",
    workspaceIds: ["workspace-a"],
  }];
  onboarding.accessRequest.finalApplicationIds = ["password-manager"];
  onboarding.equipmentRequest.deviceRequirements = "custom/high-performance";
  const before = JSON.stringify([onboarding, demoApplications]);
  deepFreeze(onboarding);
  const catalog = deepFreeze(structuredClone(demoApplications));
  const items = generateChecklist(onboarding, catalog);
  for (const item of items) {
    assertEquals(item.status, "pending");
    assertEquals(item.required, true);
    assertEquals("completion" in item, false);
  }
  assertEquals(JSON.stringify([onboarding, catalog]), before);
  items[0].title = "Local change";
  assertEquals(
    generateChecklist(onboarding, catalog)[0].title,
    "Create Slack account — workspace-a",
  );
});

Deno.test("checklist rejects unknown and inactive requested applications", () => {
  const onboarding = request();
  onboarding.accessRequest.finalApplicationIds = ["example-app"];
  assertThrows(
    () => generateChecklist(onboarding, []),
    "Unknown application ID: example-app",
  );
  assertThrows(
    () =>
      generateChecklist(onboarding, [{
        id: "example-app",
        displayName: "Example",
        active: false,
      }]),
    "Inactive application ID: example-app",
  );
});

Deno.test("checklist rejects ambiguous catalog and provisioning template IDs", () => {
  const onboarding = request();
  const app: Application = {
    id: "example-app",
    displayName: "Example",
    active: true,
  };
  assertThrows(
    () => generateChecklist(onboarding, [app, app]),
    "Duplicate application ID: example-app",
  );
  onboarding.accessRequest.finalApplicationIds = [app.id];
  app.provisioningTasks = [{ id: "create", title: "Create account" }, {
    id: "create",
    title: "Assign license",
  }];
  assertThrows(
    () => generateChecklist(onboarding, [app]),
    "Duplicate provisioning task ID: example-app/create",
  );
});
