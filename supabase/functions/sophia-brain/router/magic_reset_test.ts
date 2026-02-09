import {
  clearMachineStateTempMemory,
  detectMagicResetCommand,
} from "./magic_reset.ts";

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(
      `${msg ? `${msg} — ` : ""}Assertion failed.\nExpected: ${e}\nActual:   ${a}`,
    );
  }
}

Deno.test("detectMagicResetCommand: matches abracadabra variants", () => {
  assertEquals(detectMagicResetCommand("abracadabra"), "abracadabra");
  assertEquals(detectMagicResetCommand("ABRACADABRA"), "abracadabra");
  assertEquals(detectMagicResetCommand("  AbrakaDabra  "), "abrakadabra");
  assertEquals(detectMagicResetCommand("abrakadabra!"), "abrakadabra");
});

Deno.test("detectMagicResetCommand: requires single word", () => {
  assertEquals(detectMagicResetCommand("abracadabra stp"), null);
  assertEquals(detectMagicResetCommand("on dit abrakadabra"), null);
  assertEquals(detectMagicResetCommand(""), null);
});

Deno.test("clearMachineStateTempMemory: clears machine-related keys only", () => {
  const profileKey = "__profile_confirm_deferred_facts";
  const input = {
    global_machine: { v: 1, stack: [] },
    deferred_topics_v2: { topics: [] },
    __pending_relaunch_consent: { machine_type: "create_action" },
    __onboarding_flow: { step: "q1" },
    [profileKey]: [{ key: "conversation.use_emojis", proposed_value: "yes" }],
    soft_cap: { count: 8, date: "2026-02-09" },
    user_pref_tone: "direct",
  };

  const result = clearMachineStateTempMemory({
    tempMemory: input,
    profileConfirmDeferredKey: profileKey,
  });

  assertEquals(
    Object.prototype.hasOwnProperty.call(result.tempMemory, "global_machine"),
    false,
  );
  assertEquals(
    Object.prototype.hasOwnProperty.call(result.tempMemory, "deferred_topics_v2"),
    false,
  );
  assertEquals(
    Object.prototype.hasOwnProperty.call(
      result.tempMemory,
      "__pending_relaunch_consent",
    ),
    false,
  );
  assertEquals(
    Object.prototype.hasOwnProperty.call(result.tempMemory, "__onboarding_flow"),
    false,
  );
  assertEquals(
    Object.prototype.hasOwnProperty.call(result.tempMemory, profileKey),
    false,
  );
  assertEquals((result.tempMemory as any).soft_cap?.count, 8);
  assertEquals((result.tempMemory as any).user_pref_tone, "direct");
  assertEquals(result.clearedKeys.includes("global_machine"), true);
  assertEquals(result.clearedKeys.includes(profileKey), true);
});
