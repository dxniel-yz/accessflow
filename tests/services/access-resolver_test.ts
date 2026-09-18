import { resolveApplicationAccess } from "../../src/services/access-resolver.ts";
import { assertEquals } from "./test_helpers.ts";

const cases: {
  name: string;
  defaults: string[];
  added: string[];
  removed: string[];
  expected: string[];
}[] = [
  {
    name: "defaults only preserve order",
    defaults: ["chat", "workspace"],
    added: [],
    removed: [],
    expected: ["chat", "workspace"],
  },
  {
    name: "additions follow defaults",
    defaults: ["workspace", "chat", "password-manager", "project-management"],
    added: ["analytics", "chat"],
    removed: ["project-management"],
    expected: ["workspace", "chat", "password-manager", "analytics"],
  },
  {
    name: "removals exclude defaults and ignore absent IDs",
    defaults: ["chat", "workspace"],
    added: [],
    removed: ["chat", "absent"],
    expected: ["workspace"],
  },
  {
    name: "duplicates retain their first occurrence",
    defaults: ["chat", "chat"],
    added: ["chat", "analytics", "analytics"],
    removed: [],
    expected: ["chat", "analytics"],
  },
  {
    name: "removal wins over both defaults and additions",
    defaults: ["chat"],
    added: ["chat", "analytics"],
    removed: ["chat", "analytics", "chat"],
    expected: [],
  },
  { name: "empty arrays", defaults: [], added: [], removed: [], expected: [] },
  {
    name: "additions without defaults",
    defaults: [],
    added: ["analytics"],
    removed: [],
    expected: ["analytics"],
  },
];

for (const testCase of cases) {
  Deno.test(`access resolution: ${testCase.name}`, () => {
    assertEquals(
      resolveApplicationAccess(
        testCase.defaults,
        testCase.added,
        testCase.removed,
      ),
      testCase.expected,
    );
  });
}

Deno.test("access resolution leaves frozen inputs unchanged and returns fresh results", () => {
  const defaults = Object.freeze(["chat", "workspace"]);
  const added = Object.freeze(["analytics", "chat"]);
  const removed = Object.freeze(["workspace"]);
  const first = resolveApplicationAccess(defaults, added, removed);
  assertEquals(first, resolveApplicationAccess(defaults, added, removed));
  first.push("local-change");
  assertEquals(resolveApplicationAccess(defaults, added, removed), [
    "chat",
    "analytics",
  ]);
  assertEquals([defaults, added, removed], [["chat", "workspace"], [
    "analytics",
    "chat",
  ], ["workspace"]]);
});
