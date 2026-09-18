import type {
  AccessPackage,
  Application,
  AuditEvent,
  ChecklistItem,
  CoreAccountRequest,
  Employee,
  EquipmentRequest,
  OnboardingRequest,
  OnboardingStatus,
  Verification,
} from "../../src/domain/index.ts";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("onboarding represents defaults and exceptions as separate snapshots", () => {
  const application: Application = {
    id: "app-example-editor",
    displayName: "Example Editor",
    active: true,
  };
  const accessPackage: AccessPackage = {
    id: "package-example-engineering",
    displayName: "Engineering defaults",
    department: "Engineering",
    defaultApplicationIds: [application.id, "app-example-planning"],
  };
  const employee: Employee = {
    firstName: "Alex",
    lastName: "Morgan",
    jobTitle: "Software Engineer",
    department: "Engineering",
    manager: "actor-example-manager",
    employmentType: "salary",
    startDate: "2026-10-01",
    workLocation: "remote",
  };
  const request: OnboardingRequest = {
    id: "onboarding-example-001",
    employee,
    coreAccountRequests: [
      { service: "google_workspace", workspaceIds: ["workspace-a"] },
      { service: "slack", workspaceIds: ["workspace-a", "workspace-b"] },
    ],
    accessRequest: {
      accessPackageId: accessPackage.id,
      defaultApplicationIds: [...accessPackage.defaultApplicationIds],
      addedApplicationIds: ["app-example-design"],
      removedApplicationIds: ["app-example-planning"],
      finalApplicationIds: [application.id, "app-example-design"],
    },
    equipmentRequest: { platform: "macOS", deviceRequirements: "standard" },
    requestedBy: "actor-example-requester",
    requestDate: "2026-09-18T12:00:00Z",
    status: "draft",
    verification: { status: "pending" },
  };

  // A later package edit must not erase the recorded onboarding defaults.
  accessPackage.defaultApplicationIds = ["app-example-replacement"];
  assert(
    request.accessRequest.defaultApplicationIds.includes(
      "app-example-planning",
    ),
    "The request should retain its original inherited defaults",
  );
  assert(
    request.accessRequest.removedApplicationIds.includes(
      "app-example-planning",
    ) &&
      !request.accessRequest.finalApplicationIds.includes(
        "app-example-planning",
      ),
    "A removal should remain recorded separately from final access",
  );
  assert(
    request.accessRequest.addedApplicationIds.includes("app-example-design") &&
      request.accessRequest.finalApplicationIds.includes("app-example-design"),
    "A manual addition should retain its provenance",
  );
  assert(
    JSON.stringify(JSON.parse(JSON.stringify(request))) ===
      JSON.stringify(request),
    "The representative request should round-trip through JSON",
  );
});

Deno.test("core accounts support no, single, or multiple configured environments", () => {
  for (const service of ["google_workspace", "slack"] as const) {
    const requests: CoreAccountRequest[] = [
      { service, workspaceIds: [] },
      { service, workspaceIds: ["environment-example"] },
      { service, workspaceIds: ["workspace-a", "workspace-b"] },
    ];
    assert(
      requests.map((request) => request.workspaceIds.length).join(",") ===
        "0,1,2",
      "Selections should use explicit configured IDs without special sentinel values",
    );
  }
});

Deno.test("completion and verification records expose their actors and timestamps", () => {
  const item: ChecklistItem = {
    id: "check-example-001",
    title: "Confirm laptop is prepared",
    category: "equipment",
    required: true,
    status: "completed",
    completion: {
      completedBy: "actor-example-technician",
      completedAt: "2026-09-30T10:00:00Z",
    },
  };
  const verification: Verification = {
    status: "approved",
    verifiedBy: "actor-example-reviewer",
    verifiedAt: "2026-09-30T11:00:00Z",
    notes: "Example review completed",
  };
  const event: AuditEvent = {
    id: "event-example-001",
    onboardingId: "onboarding-example-001",
    eventType: "verification.approved",
    actor: verification.verifiedBy,
    timestamp: verification.verifiedAt,
    metadata: {
      checklist: { id: item.id, required: item.required },
      tags: ["example", 1, true, null],
    },
  };
  assert(
    item.completion.completedBy !== event.actor,
    "Completion and verification can record different actors",
  );
  assert(
    JSON.stringify(JSON.parse(JSON.stringify(event))) === JSON.stringify(event),
    "Nested audit metadata should round-trip through JSON",
  );
});

Deno.test("domain types reject unsupported values and incomplete review metadata", () => {
  // These assertions are checked by TypeScript during deno test, not at runtime.
  // @ts-expect-error Unsupported employment type.
  const employment: Employee["employmentType"] = "intern";
  // @ts-expect-error Unsupported work location.
  const location: Employee["workLocation"] = "anywhere";
  // @ts-expect-error Unsupported core account service.
  const service: CoreAccountRequest["service"] = "example_provider";
  // @ts-expect-error Unsupported laptop platform.
  const platform: EquipmentRequest["platform"] = "Linux";
  // @ts-expect-error Unsupported device requirements.
  const requirements: EquipmentRequest["deviceRequirements"] = "gaming";
  // @ts-expect-error Unsupported onboarding status.
  const status: OnboardingStatus = "finished";
  // @ts-expect-error Approval requires an actor and timestamp.
  const verification: Verification = { status: "approved" };
  // @ts-expect-error Completed checklist items require completion metadata.
  const item: ChecklistItem = {
    id: "example",
    title: "Example",
    category: "equipment",
    required: true,
    status: "completed",
  };
  // @ts-expect-error Audit metadata cannot contain functions.
  const metadata: AuditEvent["metadata"] = { callback: () => "example" };
  void [
    employment,
    location,
    service,
    platform,
    requirements,
    status,
    verification,
    item,
    metadata,
  ];
});
