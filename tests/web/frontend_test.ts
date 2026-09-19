import { createWebHandler } from "../../src/web/server.ts";
import { ApiClient, ApiError } from "../../src/web/api-client.js";
import {
  checklistProgress,
  createRequestMetadata,
  demoPersonReference,
  displayLabel,
  displayTaskTitle,
  formatDateTime,
  intakeInput,
  rejectionReason,
  showRemovalSummary,
  syncPreview,
  workflowStep,
} from "../../src/web/state.js";

Deno.test("demo person references follow the current employee with safe deterministic normalization", () => {
  for (
    const [first, last, expected] of [
      ["Jordan", "Rivera", "demo-person-jordan-rivera"],
      ["Alex", "Morgan", "demo-person-alex-morgan"],
      ["  ALEX  ", " Morgan ", "demo-person-alex-morgan"],
      ["Aléx / Demo", "O'Morgan", "demo-person-alex-demo-o-morgan"],
      ["Alex__Demo", "--Morgan--", "demo-person-alex-demo-morgan"],
      ["<>", "   ", "demo-person-unnamed"],
    ]
  ) {
    assertEquals(demoPersonReference(first, last), expected);
    assertEquals(
      demoPersonReference(first, last),
      demoPersonReference(first, last),
    );
  }
});

Deno.test("timestamp presentation uses local formatting and preserves the source ISO string", () => {
  const record = Object.freeze({ timestamp: "2026-09-19T04:13:26.782Z" });
  const date = new Date(record.timestamp);
  const expected = `${
    new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date)
  } · ${
    new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" })
      .format(date)
  }`;
  assertEquals(formatDateTime(record.timestamp), expected);
  assertEquals(record.timestamp, "2026-09-19T04:13:26.782Z");
  for (
    const value of [
      undefined,
      null,
      "",
      "invalid",
      "2026-99-99T25:00:00Z",
      "2026-09-19",
      {},
    ]
  ) assertEquals(formatDateTime(value), "—");
});

Deno.test("Accounts is a display label and rejection reasons come only from recorded notes", () => {
  const task = Object.freeze({ category: "account" });
  assertEquals(displayLabel(task.category), "Accounts");
  assertEquals(task.category, "account");
  const review = {
    status: "rejected" as const,
    verifiedBy: "demo-user",
    verifiedAt: "2026-10-01T12:00:00Z",
  };
  assertEquals(
    rejectionReason({
      ...review,
      notes: "Hardware requirements need additional review.",
    }),
    "Hardware requirements need additional review.",
  );
  assertEquals(rejectionReason(review), undefined);
  assertEquals(rejectionReason({ ...review, notes: "  " }), undefined);
  assertEquals(
    rejectionReason({ ...review, status: "approved", notes: "Approved" }),
    undefined,
  );
});

Deno.test("manual-access summary omission leaves submitted access unchanged", () => {
  const data = new FormData();
  data.append("addedApplicationIds", "analytics");
  data.append("removedApplicationIds", "example-removal");
  const metadata = createRequestMetadata(new Date("2026-10-01T12:00:00Z"));
  const before = intakeInput(data, metadata);
  assertEquals(showRemovalSummary(undefined), false);
  assertEquals(
    showRemovalSummary({
      id: "demo-package",
      displayName: "Demo",
      defaultApplicationIds: ["analytics"],
    }),
    true,
  );
  assertEquals(
    showRemovalSummary({
      id: "demo-empty",
      displayName: "Demo",
      defaultApplicationIds: [],
    }),
    false,
  );
  assertEquals(intakeInput(data, metadata), before);
  assertEquals(before.removedApplicationIds, ["example-removal"]);
});

Deno.test("friendly labels preserve internal workspace IDs submitted by intake", () => {
  assertEquals(
    [
      "onsite",
      "hybrid",
      "remote",
      "google_workspace",
      "slack",
      "custom/high-performance",
      "salary",
    ].map(displayLabel),
    [
      "Onsite",
      "Hybrid",
      "Remote",
      "Google Workspace",
      "Slack",
      "Higher Performance / Custom",
      "Salary",
    ],
  );
  assertEquals(displayLabel("demo-workspace"), "Workspace A");
  assertEquals(displayLabel("demo-workspace-b"), "Workspace B");
  assertEquals(
    displayTaskTitle("Create Slack account — demo-workspace-b"),
    "Create Slack account — Workspace B",
  );
  const data = new FormData();
  data.append("google_workspace", "demo-workspace");
  data.append("slack", "demo-workspace-b");
  const input = intakeInput(data);
  assertEquals(input.coreAccountRequests, [{
    service: "google_workspace",
    workspaceIds: ["demo-workspace"],
  }, { service: "slack", workspaceIds: ["demo-workspace-b"] }]);
});

Deno.test("generated intake metadata requires no form fields and stays stable through review", () => {
  const metadata = createRequestMetadata(new Date("2026-10-01T12:00:00Z"));
  const data = new FormData();
  assertEquals(data.has("id"), false);
  assertEquals(data.has("requestDate"), false);
  const input = intakeInput(data, metadata);
  assertEquals(input.id, "demo-onboarding-1790856000000");
  assertEquals(input.requestDate, "2026-10-01T12:00:00.000Z");
  data.set("firstName", "Alex");
  const edited = intakeInput(data, metadata);
  assertEquals([edited.id, edited.requestDate], [input.id, input.requestDate]);
});
import { createOnboarding } from "../../src/application/index.ts";
import { context, fixture } from "../application/fixtures.ts";
import { assertEquals } from "../services/test_helpers.ts";

Deno.test("web server serves exact root and static asset routes with appropriate content types", async () => {
  const reads: string[] = [];
  const handler = createWebHandler(undefined, (url) => {
    reads.push(url.pathname.split("/").at(-1)!);
    return Promise.resolve("fixture asset");
  });
  for (
    const [path, type] of [
      ["/", "text/html"],
      ["/web/styles.css", "text/css"],
      ["/web/app.js", "text/javascript"],
      ["/web/api-client.js", "text/javascript"],
      ["/web/state.js", "text/javascript"],
    ]
  ) {
    const response = await handler(new Request(`http://localhost${path}`));
    assertEquals(response.status, 200);
    assertEquals(response.headers.get("content-type")?.startsWith(type), true);
    assertEquals(await response.text(), "fixture asset");
    assertEquals(
      response.headers.get("content-security-policy")?.includes(
        "script-src 'self'",
      ),
      true,
    );
  }
  assertEquals(reads, [
    "index.html",
    "styles.css",
    "app.js",
    "api-client.js",
    "state.js",
  ]);
  assertEquals(
    (await handler(new Request("http://localhost/web/secret.ts"))).status,
    404,
  );
  assertEquals(reads.length, 5);
});

Deno.test("web server preserves health and API routes and supplies backend demo configuration", async () => {
  const handler = createWebHandler();
  assertEquals(
    await (await handler(new Request("http://localhost/health"))).json(),
    { status: "healthy" },
  );
  const { input } = fixture();
  const response = await handler(
    new Request("http://localhost/api/onboardings", {
      method: "POST",
      headers: {
        "x-event-id": "created",
        "x-actor": "demo-user",
        "x-timestamp": "2026-10-01T12:00:00Z",
      },
      body: JSON.stringify(input),
    }),
  );
  assertEquals(response.status, 201);
  const fetched = await handler(
    new Request(`http://localhost/api/onboardings/${input.id}`),
  );
  assertEquals((await fetched.json()).onboarding.status, "draft");
  const config =
    await (await handler(new Request("http://localhost/web/config.json")))
      .json();
  assertEquals(config.accessPackages[0].id, "demo-engineering");
  assertEquals(config.workspaceIds, ["demo-workspace", "demo-workspace-b"]);
});

Deno.test("web asset failures are sanitized", async () => {
  const handler = createWebHandler(
    undefined,
    () => Promise.reject(new Error("private path")),
  );
  const response = await handler(new Request("http://localhost/"));
  assertEquals(response.status, 500);
  assertEquals(
    (await response.json()).error.message,
    "Frontend asset unavailable",
  );
});

Deno.test("workflow step mapping follows every backend status", () => {
  assertEquals(
    [
      undefined,
      "draft",
      "submitted",
      "provisioning",
      "ready_for_verification",
      "verified",
      "syncing",
      "sync_failed",
      "complete",
    ].map((status) =>
      workflowStep(status as Parameters<typeof workflowStep>[0])
    ),
    [0, 0, 1, 1, 2, 3, 3, 3, 3],
  );
});

Deno.test("UI progress counts required completion only", () => {
  const base = { id: "task", title: "Example", category: "equipment" };
  assertEquals(
    checklistProgress([
      {
        ...base,
        required: true,
        status: "completed",
        completion: {
          completedBy: "demo-user",
          completedAt: "2026-10-01T12:00:00Z",
        },
      },
      { ...base, required: true, status: "pending" },
      { ...base, required: false, status: "pending" },
    ]),
    { completed: 1, total: 2, percent: 50 },
  );
  assertEquals(checklistProgress([]), { completed: 0, total: 0, percent: 100 });
});

Deno.test("intake transformation retains requested exceptions without resolving access", () => {
  const data = new FormData();
  for (
    const [key, value] of Object.entries({
      id: "demo-request",
      firstName: " Alex ",
      lastName: "Morgan",
      jobTitle: "Engineer",
      department: "Engineering",
      manager: "demo-manager",
      employmentType: "salary",
      startDate: "2026-10-01",
      workLocation: "remote",
      platform: "macOS",
      deviceRequirements: "standard",
      workloadRequirements: "Hidden stale notes",
      requestedBy: "demo-user",
      requestDate: "2026-10-01T12:00:00Z",
      accessPackageId: "demo-engineering",
    })
  ) data.set(key, value);
  data.append("addedApplicationIds", "analytics");
  data.append("removedApplicationIds", "analytics");
  data.append("google_workspace", "demo-workspace");
  const input = intakeInput(data);
  assertEquals(input.employee.firstName, "Alex");
  assertEquals(input.employee.personalEmail, undefined);
  assertEquals(input.coreAccountRequests[0].workspaceIds, ["demo-workspace"]);
  assertEquals(input.coreAccountRequests[1].workspaceIds, []);
  assertEquals(input.addedApplicationIds, ["analytics"]);
  assertEquals(input.removedApplicationIds, ["analytics"]);
  assertEquals("finalApplicationIds" in input, false);
  assertEquals(input.equipmentRequest.workloadRequirements, undefined);
  data.set("deviceRequirements", "custom/high-performance");
  assertEquals(
    intakeInput(data).equipmentRequest.workloadRequirements,
    "Hidden stale notes",
  );
});

Deno.test("sync preview uses final backend access snapshot and returns independent arrays", () => {
  const { input, configuration } = fixture();
  const session = createOnboarding(input, configuration, context("create"));
  const preview = syncPreview(session);
  assertEquals(preview.applications, ["password-manager", "analytics"]);
  assertEquals(preview.employee, "Alex Morgan");
  preview.applications.push("local-change");
  assertEquals(session.onboarding.accessRequest.finalApplicationIds, [
    "password-manager",
    "analytics",
  ]);
});

Deno.test("API client generates testable boundary headers and encodes task IDs", async () => {
  const requests: { path: string; init?: RequestInit }[] = [];
  const transport: typeof fetch = (path, init) => {
    requests.push({ path: String(path), init });
    return Promise.resolve(Response.json({}));
  };
  const client = new ApiClient(
    transport,
    () => new Date("2026-10-01T12:00:00Z"),
  );
  await client.checklist("demo/id", "task/id", "completed");
  await client.action("demo/id", "submit");
  assertEquals(
    requests[0].path,
    "/api/onboardings/demo%2Fid/checklist/task%2Fid",
  );
  const headers = new Headers(requests[0].init?.headers);
  assertEquals(headers.get("x-actor"), "demo-user");
  assertEquals(headers.get("x-timestamp"), "2026-10-01T12:00:00.000Z");
  assertEquals(headers.get("x-event-id"), "web:2026-10-01T12:00:00.000Z:1");
  assertEquals(
    new Headers(requests[1].init?.headers).get("x-event-id"),
    "web:2026-10-01T12:00:00.000Z:2",
  );
});

Deno.test("API client exposes safe workflow errors and preserves failed sync sessions", async () => {
  const { input, configuration } = fixture();
  const session = createOnboarding(input, configuration, context("create"));
  session.onboarding.status = "sync_failed";
  const client = new ApiClient(() =>
    Promise.resolve(
      Response.json({
        ok: false,
        session,
        error: {
          code: "SYNC_FAILED",
          message: "Demo inventory synchronization failed",
        },
      }, { status: 500 }),
    )
  );
  try {
    await client.sync("demo", "demo-person");
    throw new Error("Expected failure");
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    assertEquals(error.code, "SYNC_FAILED");
    assertEquals(error.session?.onboarding.status, "sync_failed");
    assertEquals(error.message, "Demo inventory synchronization failed");
  }
});

Deno.test("API client handles missing sessions and network or non-JSON failures", async () => {
  for (
    const [transport, code] of [
      [() =>
        Promise.resolve(
          Response.json(
            { error: { code: "NOT_FOUND", message: "Not found" } },
            { status: 404 },
          ),
        ), "NOT_FOUND"],
      [() => Promise.reject(new Error("private detail")), "NETWORK_ERROR"],
      [
        () => Promise.resolve(new Response("bad response", { status: 500 })),
        "INVALID_RESPONSE",
      ],
    ] as const
  ) {
    const client = new ApiClient(transport);
    try {
      await client.get("demo");
      throw new Error("Expected failure");
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      assertEquals(error.code, code);
      assertEquals(error.message.includes("private detail"), false);
    }
  }
});
