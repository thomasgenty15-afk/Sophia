import {
  computeScopeMemoryRecentMessageCount,
  isScopeMemoryEligible,
} from "./scope_memory.ts";

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${msg ? `${msg} - ` : ""}expected ${JSON.stringify(expected)} but got ${
        JSON.stringify(actual)
      }`,
    );
  }
}

Deno.test("isScopeMemoryEligible isolates supported scopes only", () => {
  assertEquals(isScopeMemoryEligible("whatsapp"), true);
  assertEquals(isScopeMemoryEligible("module:week_1"), true);
  assertEquals(isScopeMemoryEligible("story:draft:abc"), true);
  assertEquals(isScopeMemoryEligible("story:123"), true);
  assertEquals(isScopeMemoryEligible("reflection:draft:def"), true);
  assertEquals(isScopeMemoryEligible("reflection:456"), true);
  assertEquals(isScopeMemoryEligible("web"), false);
  assertEquals(isScopeMemoryEligible("roadmap_review"), false);
});

Deno.test("computeScopeMemoryRecentMessageCount keeps 5-message overlap then grows", () => {
  assertEquals(computeScopeMemoryRecentMessageCount(0), 5);
  assertEquals(computeScopeMemoryRecentMessageCount(1), 5);
  assertEquals(computeScopeMemoryRecentMessageCount(5), 5);
  assertEquals(computeScopeMemoryRecentMessageCount(6), 6);
  assertEquals(computeScopeMemoryRecentMessageCount(10), 10);
  assertEquals(computeScopeMemoryRecentMessageCount(14), 14);
  assertEquals(computeScopeMemoryRecentMessageCount(99), 14);
});
