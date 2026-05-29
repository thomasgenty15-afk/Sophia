import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { parseAdjustPlanTurn } from "./structured_intake.ts";

Deno.test("adjust_plan_item contract exposes mandatory dimensions", () => {
  const decision = parseAdjustPlanTurn({
    user_message: "allège la marche",
    structured_decision: {
      skill_id: "adjust_plan_item",
      operation_id: "op1",
      intent: "draft_only",
      status: "draft_ready",
      scope: {
        kind: "specific_plan_item",
        plan_item_ids: ["walk"],
        target_hint: "Marche",
        confidence: "high",
        missing_slots: [],
      },
      change: {
        kind: "reduce",
        user_problem: "trop lourd",
        requested_change: "version plus courte",
        exact_constraints: ["sans créneau fixe"],
        missing_slots: [],
      },
      draft: {
        available: true,
        summary: "Réduire la marche.",
        patch: { description: "Marcher 5 minutes." },
      },
      constraints: ["draft_only"],
    },
  });

  assertEquals(decision.skill_id, "adjust_plan_item");
  assertEquals(decision.intent, "draft_only");
  assertEquals(decision.scope.kind, "specific_plan_item");
  assertEquals(decision.change.kind, "reduce");
  assertEquals(decision.draft.requires_confirmation, true);
  assertEquals(decision.effect_plan?.allowed, false);
  assertEquals(decision.constraints.includes("requires_confirmation"), true);
});

Deno.test("no_regex_fallback_on_intake_failure", () => {
  const decision = parseAdjustPlanTurn({
    user_message: "oui applique la marche plus légère",
  });

  assertEquals(decision.intent, "unclear");
  assertEquals(decision.scope.kind, "unknown");
  assertEquals(decision.scope.plan_item_ids, []);
  assertEquals(decision.change.kind, "unknown");
  assertEquals(decision.effect_plan?.allowed, false);
  assertEquals(decision.state_patch?.technical_blocked, true);
});
