import {
  buildSurfaceRuntimeDecision,
  readSurfaceState,
} from "./surface_state.ts";

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${msg ? `${msg} - ` : ""}expected ${JSON.stringify(expected)} but got ${
        JSON.stringify(actual)
      }`,
    );
  }
}

Deno.test("readSurfaceState: reads existing runtime state", () => {
  const state = readSurfaceState({
    __surface_runtime_state: {
      last_selected_surface_id: "dashboard.reminders",
      last_selected_at: "2026-03-18T10:00:00.000Z",
    },
  });

  assertEquals(state.last_selected_surface_id, "dashboard.reminders");
});

Deno.test("buildSurfaceRuntimeDecision: no surface addon by default", () => {
  const result = buildSurfaceRuntimeDecision({
    previousState: {
      last_selected_surface_id: "dashboard.reminders",
      last_selected_at: "2026-03-18T10:00:00.000Z",
    },
    surfacePlan: {
      surface_mode: "guided",
      candidates: [{ surface_id: "dashboard.reminders" }],
    },
  });

  assertEquals(result.addon, null);
  assertEquals(result.state.last_selected_surface_id, "dashboard.reminders");
});
