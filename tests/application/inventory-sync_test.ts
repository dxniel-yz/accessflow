import {
  createOnboarding,
  prepareForVerification,
  prepareInventorySync,
  startProvisioning,
  submitOnboarding,
  synchronizeInventory,
  updateChecklistItem,
  verifyOnboarding,
} from "../../src/application/index.ts";
import { DemoIdentityInventoryConnector } from "../../src/connectors/demo-identity-inventory-connector.ts";
import type { IdentityInventoryConnector } from "../../src/connectors/identity-inventory-connector.ts";
import { WorkflowError } from "../../src/services/workflow-error.ts";
import { assertEquals, deepFreeze } from "../services/test_helpers.ts";
import { context, fixture } from "./fixtures.ts";

function verified() {
  const { input, configuration } = deepFreeze(fixture());
  let session = createOnboarding(input, configuration, context("created"));
  session = submitOnboarding(session, context("submitted"));
  session = startProvisioning(session, context("provisioning"));
  for (const item of session.checklist) {
    session = updateChecklistItem(
      session,
      item.id,
      "completed",
      context(`complete-${item.id}`),
    );
  }
  session = prepareForVerification(session, context("ready"));
  return verifyOnboarding(session, "approved", context("approved"));
}

function contexts() {
  return {
    started: context("sync-start"),
    completed: context("sync-complete"),
    failed: context("sync-failed"),
  };
}

Deno.test("inventory sync completes verified lifecycle and preserves original snapshot", async () => {
  const source = deepFreeze(verified());
  const before = JSON.stringify(source);
  const connector = new DemoIdentityInventoryConnector();
  const result = await synchronizeInventory(
    source,
    "demo-person",
    connector,
    contexts(),
  );
  assertEquals(result.ok, true);
  assertEquals(result.session.onboarding.status, "complete");
  assertEquals(
    result.session.auditEvents.slice(-2).map((
      event,
    ) => [event.id, event.eventType]),
    [["sync-start", "sync_started"], ["sync-complete", "sync_completed"]],
  );
  assertEquals(connector.getRecords(), [{
    person: prepareInventorySync(source, "demo-person").person,
    applicationIds: ["password-manager", "analytics"],
    managerReference: "demo-manager",
  }]);
  assertEquals(JSON.stringify(source), before);
});

for (
  const status of [
    "draft",
    "submitted",
    "provisioning",
    "ready_for_verification",
    "syncing",
    "complete",
    "sync_failed",
  ] as const
) {
  Deno.test(`inventory sync rejects ${status} before touching connector`, async () => {
    const source = verified();
    source.onboarding.status = status;
    deepFreeze(source);
    const before = JSON.stringify(source);
    const connector = new DemoIdentityInventoryConnector();
    let rejected = false;
    try {
      await synchronizeInventory(source, "demo-person", connector, contexts());
    } catch (error) {
      rejected = error instanceof WorkflowError;
    }
    assertEquals(rejected, true);
    assertEquals(connector.getRecords(), []);
    assertEquals(JSON.stringify(source), before);
  });
}

for (const stage of ["person", "manager", "applications"] as const) {
  Deno.test(`connector ${stage} failure returns failed session and original error`, async () => {
    const source = deepFreeze(verified());
    const before = JSON.stringify(source);
    const error = new Error("Demo connector failure");
    const calls: string[] = [];
    const call = (name: string) => {
      calls.push(name);
      return name === stage ? Promise.reject(error) : Promise.resolve();
    };
    const connector: IdentityInventoryConnector = {
      upsertPerson: () => call("person"),
      setManager: () => call("manager"),
      syncApplicationAccess: () => call("applications"),
    };
    const result = await synchronizeInventory(
      source,
      "demo-person",
      connector,
      contexts(),
    );
    assertEquals(result.ok, false);
    if (result.ok) throw new Error("Expected connector failure");
    assertEquals(result.error === error, true);
    assertEquals(result.session.onboarding.status, "sync_failed");
    assertEquals(
      result.session.auditEvents.slice(-2).map((event) => event.eventType),
      ["sync_started", "sync_failed"],
    );
    assertEquals(result.session.auditEvents.at(-1)?.id, "sync-failed");
    assertEquals(
      calls,
      ["person", "manager", "applications"].slice(
        0,
        ["person", "manager", "applications"].indexOf(stage) + 1,
      ),
    );
    assertEquals(JSON.stringify(source), before);
  });
}

Deno.test("inventory projection is minimal, detached and deeply frozen", () => {
  const source = verified();
  source.onboarding.employee.preferredName = "Alex";
  source.onboarding.employee.personalEmail = "alex@example.invalid";
  const snapshot = prepareInventorySync(source, "demo-person");
  assertEquals(Object.keys(snapshot), [
    "person",
    "managerReference",
    "applicationIds",
  ]);
  assertEquals(Object.keys(snapshot.person), [
    "reference",
    "firstName",
    "lastName",
    "preferredName",
    "jobTitle",
    "department",
    "employmentType",
    "workLocation",
    "startDate",
    "coreAccounts",
  ]);
  assertEquals(snapshot.person.preferredName, "Alex");
  assertEquals(
    snapshot.person.coreAccounts,
    source.onboarding.coreAccountRequests,
  );
  for (
    const value of [
      snapshot,
      snapshot.person,
      snapshot.applicationIds,
      snapshot.person.coreAccounts,
      snapshot.person.coreAccounts[0],
      snapshot.person.coreAccounts[0].workspaceIds,
    ]
  ) assertEquals(Object.isFrozen(value), true);
  source.onboarding.employee.firstName = "Changed";
  source.onboarding.coreAccountRequests[0].workspaceIds = [];
  assertEquals(snapshot.person.firstName, "Alex");
  assertEquals(snapshot.person.coreAccounts[0].workspaceIds, [
    "demo-workspace",
  ]);
});

Deno.test("demo connector upserts stable person identity and replaces desired access", async () => {
  const connector = new DemoIdentityInventoryConnector();
  const snapshot = prepareInventorySync(verified(), "demo-person");
  for (let i = 0; i < 2; i++) {
    await connector.upsertPerson(snapshot.person);
    await connector.setManager(
      snapshot.person.reference,
      snapshot.managerReference,
    );
    await connector.syncApplicationAccess(snapshot.person.reference, [
      ...snapshot.applicationIds,
      ...snapshot.applicationIds,
    ]);
  }
  assertEquals(connector.getRecords().length, 1);
  assertEquals(connector.getRecords()[0].applicationIds, [
    "password-manager",
    "analytics",
  ]);
  await connector.upsertPerson({
    ...snapshot.person,
    jobTitle: "Senior Demo Engineer",
  });
  await connector.setManager("demo-person", "demo-manager-two");
  await connector.syncApplicationAccess("demo-person", [
    "analytics",
    "analytics",
  ]);
  assertEquals(connector.getRecords().length, 1);
  assertEquals(
    connector.getRecords()[0].person.jobTitle,
    "Senior Demo Engineer",
  );
  assertEquals(connector.getRecords()[0].managerReference, "demo-manager-two");
  assertEquals(connector.getRecords()[0].applicationIds, ["analytics"]);
  const records = connector.getRecords();
  records[0].applicationIds.push("inspection-change");
  assertEquals(connector.getRecords()[0].applicationIds, ["analytics"]);
  await connector.syncApplicationAccess("demo-person", []);
  assertEquals(connector.getRecords()[0].applicationIds, []);
});

Deno.test("sync validates all audit outcomes before connector calls", async () => {
  for (
    const invalid of [
      { ...contexts(), failed: { ...context("failure"), actor: " " } },
      { ...contexts(), completed: context("sync-start") },
      { ...contexts(), started: context("created") },
    ]
  ) {
    const connector = new DemoIdentityInventoryConnector();
    let rejected = false;
    try {
      await synchronizeInventory(verified(), "demo-person", connector, invalid);
    } catch (error) {
      rejected = error instanceof WorkflowError;
    }
    assertEquals(rejected, true);
    assertEquals(connector.getRecords(), []);
  }
});

Deno.test("sync rejects inconsistent verification and blank person references", async () => {
  for (const approved of [true, false]) {
    const source = verified();
    if (!approved) source.onboarding.verification = { status: "pending" };
    const connector = new DemoIdentityInventoryConnector();
    let rejected = false;
    try {
      await synchronizeInventory(
        source,
        approved ? " " : "demo-person",
        connector,
        contexts(),
      );
    } catch (error) {
      rejected = error instanceof WorkflowError;
    }
    assertEquals(rejected, true);
    assertEquals(connector.getRecords(), []);
  }
});
