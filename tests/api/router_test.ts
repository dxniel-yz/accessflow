import { createApiHandler } from "../../src/api/router.ts";
import { InMemoryOnboardingSessionRepository } from "../../src/infrastructure/in-memory-onboarding-session-repository.ts";
import { DemoIdentityInventoryConnector } from "../../src/connectors/demo-identity-inventory-connector.ts";
import type { OnboardingSession } from "../../src/application/index.ts";
import type { InventoryPerson } from "../../src/connectors/identity-inventory-connector.ts";
import { fixture } from "../application/fixtures.ts";
import { assertEquals } from "../services/test_helpers.ts";

function setup(connector = new DemoIdentityInventoryConnector()) {
  const repository = new InMemoryOnboardingSessionRepository();
  const { input, configuration } = fixture();
  const handler = createApiHandler({ repository, connector, configuration });
  let sequence = 0;
  function send(path: string, body?: unknown, raw = false) {
    return handler(
      new Request(
        `http://localhost${path}`,
        body === undefined ? {} : {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-event-id": `demo-event-${++sequence}`,
            "x-actor": "demo-user",
            "x-timestamp": "2026-10-01T12:00:00Z",
          },
          body: raw ? String(body) : JSON.stringify(body),
        },
      ),
    );
  }
  const base = `/api/onboardings/${input.id}`;
  async function create(): Promise<OnboardingSession> {
    const response = await send("/api/onboardings", input);
    assertEquals(response.status, 201);
    return response.json();
  }
  async function approved(): Promise<OnboardingSession> {
    const session = await create();
    for (const path of ["submit", "provisioning/start"]) {
      assertEquals((await send(`${base}/${path}`, {})).status, 200);
    }
    for (const item of session.checklist) {
      assertEquals(
        (await send(`${base}/checklist/${encodeURIComponent(item.id)}`, {
          status: "completed",
        })).status,
        200,
      );
    }
    assertEquals((await send(`${base}/verification/prepare`, {})).status, 200);
    const response = await send(`${base}/verification`, {
      decision: "approved",
    });
    assertEquals(response.status, 200);
    return response.json();
  }
  return {
    repository,
    connector,
    input,
    handler,
    send,
    base,
    create,
    approved,
  };
}

Deno.test("API creates, saves and retrieves draft sessions and preserves health", async () => {
  const api = setup();
  const session = await api.create();
  assertEquals(session.onboarding.status, "draft");
  assertEquals(session.auditEvents[0].eventType, "onboarding_created");
  assertEquals(session.auditEvents[0].actor, "demo-user");
  assertEquals(await (await api.send(api.base)).json(), session);
  assertEquals(api.repository.getById(session.onboarding.id), session);
  assertEquals((await api.send("/api/onboardings/missing")).status, 404);
  assertEquals((await api.send("/unknown")).status, 404);
  assertEquals(await (await api.send("/health")).json(), { status: "healthy" });
  assertEquals((await api.send("/api/onboardings", api.input)).status, 409);
  assertEquals(await (await api.send(api.base)).json(), session);
});

Deno.test("API happy path completes onboarding and synchronizes only demo inventory", async () => {
  const api = setup();
  await api.approved();
  const response = await api.send(`${api.base}/sync`, {
    personReference: "demo-person",
  });
  assertEquals(response.status, 200);
  const result = await response.json();
  assertEquals(result.ok, true);
  assertEquals(result.session.onboarding.status, "complete");
  assertEquals(result.session.onboarding.verification.status, "approved");
  assertEquals(
    result.session.auditEvents.slice(-2).map((event: { eventType: string }) =>
      event.eventType
    ),
    ["sync_started", "sync_completed"],
  );
  const records = await (await api.send("/api/demo/inventory")).json();
  assertEquals(records.length, 1);
  assertEquals(records[0].person.firstName, "Alex");
  assertEquals(records[0].managerReference, "demo-manager");
  assertEquals(records[0].applicationIds, ["password-manager", "analytics"]);
  assertEquals(api.repository.getById(api.input.id), result.session);
});

Deno.test("API maps workflow conflicts to 409 without changing stored sessions", async () => {
  const api = setup();
  await api.create();
  for (
    const [suffix, body] of [["provisioning/start", {}], ["sync", {
      personReference: "demo-person",
    }]] as const
  ) {
    const response = await api.send(`${api.base}/${suffix}`, body);
    assertEquals(response.status, 409);
    assertEquals((await response.json()).error.code, "WORKFLOW_CONFLICT");
  }
  await api.send(`${api.base}/submit`, {});
  await api.send(`${api.base}/provisioning/start`, {});
  const before = api.repository.getById(api.input.id);
  assertEquals(
    (await api.send(`${api.base}/verification/prepare`, {})).status,
    409,
  );
  assertEquals(api.repository.getById(api.input.id), before);
});

Deno.test("API rejects malformed JSON, missing fields, invalid enums and blank references", async () => {
  const api = setup();
  for (
    const body of [
      "{",
      "null",
      "[]",
      "{}",
      JSON.stringify({ ...api.input, id: " " }),
      JSON.stringify({
        ...api.input,
        employee: { ...api.input.employee, employmentType: "invalid" },
      }),
    ]
  ) {
    const response = await api.send("/api/onboardings", body, true);
    assertEquals(response.status, 400);
    assertEquals((await response.json()).error.code, "BAD_REQUEST");
  }
  const session = await api.create();
  assertEquals(
    (await api.send(`${api.base}/verification`, { decision: "maybe" })).status,
    400,
  );
  assertEquals(
    (await api.send(
      `${api.base}/checklist/${encodeURIComponent(session.checklist[0].id)}`,
      { status: "unknown" },
    )).status,
    400,
  );
  assertEquals(
    (await api.send(`${api.base}/sync`, { personReference: " " })).status,
    400,
  );
  const response = await api.handler(
    new Request(`http://localhost${api.base}/submit`, {
      method: "POST",
      body: "{}",
    }),
  );
  assertEquals(response.status, 400);
});

Deno.test("API saves failed sync state and returns safe observable error", async () => {
  class FailingDemoConnector extends DemoIdentityInventoryConnector {
    override upsertPerson(_person: InventoryPerson): Promise<void> {
      return Promise.reject(new Error("Internal diagnostic must not escape"));
    }
  }
  const api = setup(new FailingDemoConnector());
  await api.approved();
  const response = await api.send(`${api.base}/sync`, {
    personReference: "demo-person",
  });
  assertEquals(response.status, 500);
  const result = await response.json();
  assertEquals(result.ok, false);
  assertEquals(result.error, {
    code: "SYNC_FAILED",
    message: "Demo inventory synchronization failed",
  });
  assertEquals(result.session.onboarding.status, "sync_failed");
  assertEquals(
    result.session.auditEvents.slice(-2).map((event: { eventType: string }) =>
      event.eventType
    ),
    ["sync_started", "sync_failed"],
  );
  assertEquals(api.repository.getById(api.input.id), result.session);
});

Deno.test("repository clones saved and retrieved snapshots, replaces IDs, and reports missing IDs", async () => {
  const api = setup();
  const session = await api.create();
  const repository = new InMemoryOnboardingSessionRepository();
  repository.save(session);
  session.onboarding.employee.firstName = "Changed";
  assertEquals(
    repository.getById(session.onboarding.id)?.onboarding.employee.firstName,
    "Alex",
  );
  const retrieved = repository.getById(session.onboarding.id)!;
  retrieved.auditEvents.length = 0;
  retrieved.checklist[0].title = "Changed";
  assertEquals(
    repository.getById(session.onboarding.id)?.auditEvents.length,
    1,
  );
  assertEquals(
    repository.getById(session.onboarding.id)?.checklist[0].title === "Changed",
    false,
  );
  repository.save(session);
  assertEquals(
    repository.getById(session.onboarding.id)?.onboarding.employee.firstName,
    "Changed",
  );
  assertEquals(repository.getById("missing"), undefined);
});

Deno.test("API serializes concurrent mutations and does not overwrite audit history", async () => {
  const api = setup();
  await api.create();
  const responses = await Promise.all([
    api.send(`${api.base}/submit`, {}),
    api.send(`${api.base}/submit`, {}),
  ]);
  assertEquals(responses.map((response) => response.status), [200, 409]);
  assertEquals(api.repository.getById(api.input.id)?.auditEvents.length, 2);
});

Deno.test("API sanitizes unexpected repository failures", async () => {
  const handler = createApiHandler({
    repository: {
      save: () => {},
      getById: () => {
        throw new Error("private diagnostics");
      },
    },
    connector: new DemoIdentityInventoryConnector(),
    configuration: fixture().configuration,
  });
  const response = await handler(
    new Request("http://localhost/api/onboardings/demo"),
  );
  assertEquals(response.status, 500);
  assertEquals(await response.json(), {
    error: { code: "INTERNAL_ERROR", message: "Internal server error" },
  });
});
