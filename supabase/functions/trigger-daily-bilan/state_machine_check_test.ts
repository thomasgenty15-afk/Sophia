import {
  cleanupHardExpiredStateMachines,
  clearActiveMachineForDailyBilan,
  hasActiveStateMachine,
  isMachineInterruptible,
} from "./state_machine_check.ts";

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${msg ? `${msg} - ` : ""}expected ${JSON.stringify(expected)} but got ${
        JSON.stringify(actual)
      }`,
    );
  }
}

Deno.test("hasActiveStateMachine: detects active bilan", () => {
  const result = hasActiveStateMachine({
    investigation_state: { status: "checking", started_at: "2026-02-10T20:00:00Z" },
    temp_memory: {},
  });
  assertEquals(result, {
    active: true,
    machineLabel: "bilan_in_progress",
    interruptible: false,
  });
});

Deno.test("hasActiveStateMachine: detects safety flow", () => {
  const result = hasActiveStateMachine({
    temp_memory: {
      __safety_firefighter_flow: { phase: "acute" },
    },
  });
  assertEquals(result, {
    active: true,
    machineLabel: "safety_firefighter",
    interruptible: false,
  });
});

Deno.test("hasActiveStateMachine: detects onboarding flag", () => {
  const result = hasActiveStateMachine({
    temp_memory: {
      __onboarding_active: { started_at: "2026-02-10T20:00:00Z" },
    },
  });
  assertEquals(result, {
    active: true,
    machineLabel: "onboarding",
    interruptible: true,
  });
});

Deno.test("hasActiveStateMachine: ignores tool/supervisor flows in simplified mode", () => {
  const result = hasActiveStateMachine({
    temp_memory: {
      supervisor: {
        stack: [{ type: "create_action_flow", status: "active" }],
      },
      create_action_flow: { phase: "confirm" },
      __pending_relaunch_consent: { machine_type: "topic_light" },
    },
  });
  assertEquals(result, {
    active: false,
    machineLabel: null,
    interruptible: false,
  });
});

Deno.test("isMachineInterruptible: safety and active bilan are non-interruptible", () => {
  assertEquals(isMachineInterruptible("safety_sentry"), false);
  assertEquals(isMachineInterruptible("safety_firefighter"), false);
  assertEquals(isMachineInterruptible("bilan_in_progress"), false);
  assertEquals(isMachineInterruptible("onboarding"), true);
});

Deno.test("cleanupHardExpiredStateMachines: removes stale investigation + safety", () => {
  const now = new Date("2026-02-11T20:00:00.000Z");
  const fiveHoursAgo = new Date(now.getTime() - 5 * 60 * 60 * 1000)
    .toISOString();

  const input = {
    investigation_state: { status: "checking", started_at: fiveHoursAgo },
    temp_memory: {
      __safety_sentry_flow: { phase: "acute", started_at: fiveHoursAgo },
    },
  };

  const out = cleanupHardExpiredStateMachines(input, { now });
  assertEquals(out.changed, true);
  assertEquals(Boolean(out.chatState?.investigation_state), false);
  assertEquals(Boolean(out.chatState?.temp_memory?.__safety_sentry_flow), false);
});

Deno.test("clearActiveMachineForDailyBilan: clears onboarding", () => {
  const input = {
    investigation_state: null,
    temp_memory: {
      __onboarding_active: { started_at: "2026-02-10T20:00:00.000Z" },
    },
  };
  const out = clearActiveMachineForDailyBilan(input, "onboarding");
  assertEquals(out.changed, true);
  assertEquals(Boolean(out.chatState?.temp_memory?.__onboarding_active), false);
});
