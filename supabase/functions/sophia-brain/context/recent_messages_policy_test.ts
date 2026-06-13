import {
  recentChatMessagesFromHistory,
  trimRecentChatMessages,
} from "./recent_messages_policy.ts";

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(
      msg ??
        `Expected ${expectedJson}, got ${actualJson}`,
    );
  }
}

Deno.test("recentChatMessagesFromHistory keeps only recent user and assistant messages", () => {
  const result = recentChatMessagesFromHistory([
    { role: "system", content: "hidden" },
    { role: "user", content: "one" },
    { role: "assistant", content: "two" },
    { role: "tool", content: "ignored" },
    { role: "user", content: "three" },
    { role: "assistant", content: "four" },
  ], 3);

  assertEquals(result, [
    { role: "assistant", content: "two" },
    { role: "user", content: "three" },
    { role: "assistant", content: "four" },
  ]);
});

Deno.test("trimRecentChatMessages trims whitespace and drops empty content", () => {
  const result = trimRecentChatMessages([
    { role: "user", content: " alpha " },
    { role: "assistant", content: " " },
    { role: "assistant", content: "beta" },
    { role: "user", content: "gamma" },
  ], 2);

  assertEquals(result, [
    { role: "assistant", content: "beta" },
    { role: "user", content: "gamma" },
  ]);
});
