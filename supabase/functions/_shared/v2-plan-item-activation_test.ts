import { assertEquals } from "jsr:@std/assert@1";

import { evaluateActivationReadiness } from "./v2-plan-item-activation.ts";

Deno.test("evaluateActivationReadiness allows immediate items", () => {
  const result = evaluateActivationReadiness({
    condition: null,
    dependencies: [],
  });

  assertEquals(result.isReady, true);
  assertEquals(result.remainingCount, 0);
});

Deno.test("evaluateActivationReadiness blocks missing prerequisite items", () => {
  const result = evaluateActivationReadiness({
    condition: {
      type: "after_item_completion",
      depends_on: ["item-1"],
    },
    dependencies: [],
  });

  assertEquals(result.isReady, false);
  assertEquals(result.remainingCount, 1);
});

Deno.test("evaluateActivationReadiness accepts maintenance as prerequisite satisfied", () => {
  const result = evaluateActivationReadiness({
    condition: {
      type: "after_milestone",
      depends_on: ["habit-1"],
    },
    dependencies: [{
      id: "habit-1",
      title: "Routine du soir",
      status: "in_maintenance",
      current_habit_state: "in_maintenance",
      current_reps: 6,
    }],
  });

  assertEquals(result.isReady, true);
  assertEquals(result.remainingCount, 0);
});

Deno.test("evaluateActivationReadiness enforces habit traction threshold", () => {
  const result = evaluateActivationReadiness({
    condition: {
      type: "after_habit_traction",
      depends_on: ["habit-1"],
      min_completions: 3,
    },
    dependencies: [{
      id: "habit-1",
      title: "Respiration",
      status: "active",
      current_habit_state: "active_building",
      current_reps: 2,
    }],
    positiveCountByDependencyId: new Map([["habit-1", 2]]),
  });

  assertEquals(result.isReady, false);
  assertEquals(result.remainingCount, 1);
});
