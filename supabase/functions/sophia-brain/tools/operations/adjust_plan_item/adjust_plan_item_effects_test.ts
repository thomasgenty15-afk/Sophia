import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { applyAdjustPlanEffects } from "./effects.ts";
import type { AdjustPlanDecision } from "./contract.ts";

function effectPlan(
  allowed: boolean,
): AdjustPlanDecision["effect_plan"] {
  return {
    allowed,
    effects: allowed
      ? [{
        type: "adjust_plan_item",
        operation_id: "op1",
        scope_kind: "specific_plan_item",
        patch: { description: "Version courte" },
        requires_confirmation: true,
      }]
      : [],
    blocked_reason: allowed ? null : "requires_confirmation",
  };
}

Deno.test("approve_pending_draft_applies", async () => {
  let writerCalled = 0;
  const result = await applyAdjustPlanEffects({
    effect_plan: effectPlan(true),
    writer: async () => {
      writerCalled += 1;
      return { plan_patch_id: "patch1" };
    },
  });

  assertEquals(writerCalled, 1);
  assertEquals(result.committed_effects.length, 1);
  assertEquals(result.committed_effects[0].plan_patch_id, "patch1");
});

Deno.test("committed_effect_required_for_executed_tool", async () => {
  let writerCalled = 0;
  const result = await applyAdjustPlanEffects({
    effect_plan: effectPlan(false),
    writer: async () => {
      writerCalled += 1;
      return { plan_patch_id: "patch1" };
    },
  });

  const executedTools = result.committed_effects.length > 0
    ? ["adjust_plan_item"]
    : [];
  assertEquals(writerCalled, 0);
  assertEquals(result.committed_effects, []);
  assertEquals(executedTools, []);
});

Deno.test("writer_failure_no_done_language", async () => {
  const result = await applyAdjustPlanEffects({
    effect_plan: effectPlan(true),
    writer: async () => {
      throw new Error("writer_failed");
    },
  });

  assertEquals(result.committed_effects, []);
  assertEquals(result.failed_effects[0].reason_code, "writer_failed");
});
