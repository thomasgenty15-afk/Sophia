import {
  isExplicitWeeklyAdjustPlanRequest,
  operationInputFromPlanAdjustmentScope,
  weeklyBridgeDoesNotApplyDirectly,
  weeklyReviewAllowsAdjustPlanBridge,
} from "./bridges.ts";
import { assert, assertEquals } from "jsr:@std/assert@1";

Deno.test("weekly_adjust_bridge_requires_structured_explicit_adjust_intent", () => {
  assertEquals(
    weeklyReviewAllowsAdjustPlanBridge({
      routeDecision: {
        response_owner: "tool_skill",
        selected_handler: "adjust_plan_item",
      } as any,
      userMessage: "applique cette organisation de la semaine prochaine",
      turnFrame: {
        tool_skill_intents: [{
          operation_type: "adjust_plan_item",
          explicitness: "explicit",
          confidence_band: "high",
          ambiguity: "none",
          operation_input: {
            scope: { kind: "specific_item" },
          },
        }],
      } as any,
    }),
    true,
  );
  assertEquals(
    weeklyReviewAllowsAdjustPlanBridge({
      routeDecision: {
        response_owner: "tool_skill",
        selected_handler: "adjust_plan_item",
      } as any,
      userMessage: "applique cette organisation de la semaine prochaine",
      turnFrame: null,
    }),
    false,
  );
});

Deno.test("weekly_adjust_bridge_blocked_for_unrelated_tool", () => {
  assertEquals(
    weeklyReviewAllowsAdjustPlanBridge({
      routeDecision: {
        response_owner: "tool_skill",
        selected_handler: "prepare_attack_card",
      } as any,
      userMessage: "prépare une carte d'attaque",
      turnFrame: null,
    }),
    false,
  );
});

Deno.test("weekly_bridge_does_not_apply_directly", () => {
  assertEquals(weeklyBridgeDoesNotApplyDirectly(), true);
});

Deno.test("weekly_bridge_outputs_adjust_plan_structured_input", () => {
  const input = operationInputFromPlanAdjustmentScope(
    "prépare une proposition pour le plan global",
    {
      tool_skill_intents: [{
        operation_type: "adjust_plan_item",
        confidence_band: "high",
        operation_input: {
          scope: { kind: "whole_plan" },
          constraints: ["max_two_actions_next_step"],
        },
      }],
    } as any,
  );
  assertEquals((input as any)?.scope?.kind, "whole_plan");
  assert((input as any)?.constraints.includes("max_two_actions_next_step"));
  assertEquals(
    isExplicitWeeklyAdjustPlanRequest(
      "si je demande à changer le plan, tu peux ?",
    ),
    false,
  );
});
