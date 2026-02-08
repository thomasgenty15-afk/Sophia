import { hasActiveStateMachine } from "./state_machine_check.ts";

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
  assertEquals(result, { active: false, machineLabel: null });
});

Deno.test("hasActiveStateMachine: detects active supervisor session", () => {
  const result = hasActiveStateMachine({
    temp_memory: {
      supervisor: {
        stack: [{ type: "create_action_flow", status: "active" }],
      },
    },
  });
  assertEquals(result, { active: true, machineLabel: "create_action_flow" });
});

Deno.test("hasActiveStateMachine: detects pending checkup confirmation", () => {
  const result = hasActiveStateMachine({
    temp_memory: { __checkup_entry_pending: true },
  });
  assertEquals(result, { active: true, machineLabel: "checkup_entry_pending" });
});

Deno.test("hasActiveStateMachine: detects pending relaunch consent", () => {
  const result = hasActiveStateMachine({
    temp_memory: { __pending_relaunch_consent: { machine_type: "checkup" } },
  });
  assertEquals(result, { active: true, machineLabel: "relaunch_consent" });
});
