import {
  flowEntryWindow,
  RECENT_MESSAGE_LIMITS,
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

function longHistory(pairs: number): Array<{ role: string; content: string }> {
  const out: Array<{ role: string; content: string }> = [];
  for (let i = 0; i < pairs; i++) {
    out.push({ role: "user", content: `u${i}` });
    out.push({ role: "assistant", content: `a${i}` });
  }
  return out;
}

Deno.test("flowEntryWindow: cold entry widens to flowEntryColdContext + framing", () => {
  const history = longHistory(15); // 30 messages
  const win = flowEntryWindow({
    recent_messages: history,
    user_message: "dernier message",
    is_cold_entry: true,
    continuation_limit: RECENT_MESSAGE_LIMITS.subskillHistory,
  });

  assertEquals(
    win.messages.length,
    RECENT_MESSAGE_LIMITS.flowEntryColdContext,
    "cold entry should serve the wide window",
  );
  // Le message courant est en queue, une seule fois.
  assertEquals(win.messages[win.messages.length - 1], {
    role: "user",
    content: "dernier message",
  });
  if (win.framing.length !== 1) {
    throw new Error(`expected framing on cold entry, got ${win.framing.length}`);
  }
});

Deno.test("flowEntryWindow: continuation keeps rolling window, no framing", () => {
  const history = longHistory(15);
  const win = flowEntryWindow({
    recent_messages: history,
    user_message: "dernier message",
    is_cold_entry: false,
    continuation_limit: RECENT_MESSAGE_LIMITS.subskillHistory,
  });

  assertEquals(
    win.messages.length,
    RECENT_MESSAGE_LIMITS.subskillHistory,
    "continuation should keep the rolling window",
  );
  assertEquals(win.framing, []);
});

Deno.test("flowEntryWindow: does not duplicate current message already in queue", () => {
  const history: Array<{ role: string; content: string }> = [
    { role: "user", content: "a" },
    { role: "assistant", content: "b" },
    { role: "user", content: "courant" },
  ];
  const win = flowEntryWindow({
    recent_messages: history,
    user_message: "courant",
    is_cold_entry: true,
    continuation_limit: RECENT_MESSAGE_LIMITS.subskillHistory,
  });

  assertEquals(win.messages, [
    { role: "user", content: "a" },
    { role: "assistant", content: "b" },
    { role: "user", content: "courant" },
  ]);
});
