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

Deno.test("hasActiveStateMachine: ignores non-active supervisor sessions", () => {
  const result = hasActiveStateMachine({
    temp_memory: {
      supervisor: {
        stack: [{ type: "create_action_flow", status: "completed" }],
      },
    },
  });
  assertEquals(result, { active: false, machineLabel: null, interruptible: false });
});

Deno.test("hasActiveStateMachine: detects active supervisor session", () => {
  const result = hasActiveStateMachine({
    temp_memory: {
      supervisor: {
        stack: [{ type: "create_action_flow", status: "active" }],
      },
    },
  });
  assertEquals(result, {
    active: true,
    machineLabel: "create_action_flow",
    interruptible: true,
  });
});

Deno.test("hasActiveStateMachine: detects pending checkup confirmation", () => {
  const result = hasActiveStateMachine({
    temp_memory: { __checkup_entry_pending: true },
  });
  assertEquals(result, {
    active: true,
    machineLabel: "checkup_entry_pending",
    interruptible: true,
  });
});

Deno.test("hasActiveStateMachine: detects pending relaunch consent", () => {
  const result = hasActiveStateMachine({
    temp_memory: { __pending_relaunch_consent: { machine_type: "checkup" } },
  });
  assertEquals(result, {
    active: true,
    machineLabel: "relaunch_consent",
    interruptible: true,
  });
});

Deno.test("isMachineInterruptible: safety and active bilan are non-interruptible", () => {
  assertEquals(isMachineInterruptible("safety_sentry"), false);
  assertEquals(isMachineInterruptible("safety_firefighter"), false);
  assertEquals(isMachineInterruptible("bilan_in_progress"), false);
  assertEquals(isMachineInterruptible("create_action_flow"), true);
});

Deno.test("cleanupHardExpiredStateMachines: removes stale investigation and supervisor sessions", () => {
  const now = new Date("2026-02-11T20:00:00.000Z");
  const fiveHoursAgo = new Date(now.getTime() - 5 * 60 * 60 * 1000).toISOString();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

  const input = {
    investigation_state: { status: "checking", started_at: fiveHoursAgo },
    temp_memory: {
      supervisor: {
        stack: [
          { type: "create_action_flow", status: "active", last_active_at: fiveHoursAgo },
          { type: "topic_light", status: "active", last_active_at: oneHourAgo },
        ],
      },
      __safety_sentry_flow: { phase: "acute", started_at: fiveHoursAgo },
    },
  };

  const out = cleanupHardExpiredStateMachines(input, { now });
  assertEquals(out.changed, true);
  assertEquals(Boolean(out.chatState?.investigation_state), false);
  assertEquals((out.chatState?.temp_memory?.supervisor?.stack ?? []).length, 1);
});

Deno.test("clearActiveMachineForDailyBilan: clears active supervisor session", () => {
  const input = {
    investigation_state: null,
    temp_memory: {
      supervisor: {
        stack: [
          { type: "create_action_flow", status: "active" },
          { type: "topic_light", status: "active" },
        ],
      },
    },
  };
  const out = clearActiveMachineForDailyBilan(input, "create_action_flow");
  assertEquals(out.changed, true);
  assertEquals((out.chatState?.temp_memory?.supervisor?.stack ?? []).length, 1);
  assertEquals(out.chatState?.temp_memory?.supervisor?.stack?.[0]?.type, "topic_light");
});
