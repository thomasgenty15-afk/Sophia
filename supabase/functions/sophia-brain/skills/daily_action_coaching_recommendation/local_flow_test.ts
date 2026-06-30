import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  initialDailyActionCoachingState,
  normalizeDailyActionCoachingDispatcherOutput,
  normalizeDailyActionCoachingHandoffContext,
  reduceDailyActionCoachingOutput,
} from "./local_flow.ts";

function context(reasonText = "j'oublie au moment de lancer") {
  const normalized = normalizeDailyActionCoachingHandoffContext({
    source_flow_id: "daily_action_review_v1",
    parent_flow_id: "daily_action_review_v1",
    return_focus: "resume_daily_after_action_coaching",
    action_context: {
      occurrence_id: "occ-1",
      plan_item_id: "item-1",
      plan_id: "plan-1",
      title: "Ranger le materiel hors de vue",
      description: "Retirer le materiel visible avant le soir.",
      action_type: "mission",
      outcome: "missed",
      reason_category: "forgot",
      reason_text: reasonText,
    },
    help_request_summary: "User asks for help succeeding with the action.",
  });
  if (!normalized) throw new Error("test_context_invalid");
  return initialDailyActionCoachingState(normalized);
}

Deno.test("daily action coaching returns attack card and parent note", () => {
  const state = context();
  const output = normalizeDailyActionCoachingDispatcherOutput({
    flow_action: "recommend_and_return",
    confidence: "high",
    recommendation: {
      primary_feature: "attack_card",
      secondary_feature: null,
      why_primary: "The blocker is forgetting the launch cue.",
      user_facing_next_step: "Prepare a launch cue from the plan action.",
    },
    visible_task: { kind: "action_plan_coaching" },
    evidence: ["j'oublie"],
  });

  const reduced = reduceDailyActionCoachingOutput({ previous: state, output });

  assertEquals(reduced.status, "complete");
  assertEquals(reduced.recommendation.primary_feature, "attack_card");
  assertEquals(
    reduced.note_information?.target_dispatcher,
    "daily_action_review_v1",
  );
  assertEquals(
    reduced.note_information?.structured_context.bridge_kind,
    "daily_action_coaching_to_parent",
  );
  assertEquals(
    reduced.note_information?.structured_context.no_daily_mutation,
    true,
  );
});

Deno.test("daily action coaching keeps recommendations inside allowed features", () => {
  const output = normalizeDailyActionCoachingDispatcherOutput({
    flow_action: "recommend_and_return",
    confidence: "high",
    recommendation: {
      primary_feature: "state_potion",
      secondary_feature: "no_plan_action",
      why_primary: "Invalid feature.",
    },
    visible_task: { kind: "action_plan_coaching" },
  });

  assertEquals(output.flow_action, "clarify_help_need");
  assertEquals(output.recommendation.primary_feature, null);
  assertEquals(JSON.stringify(output).includes("state_potion"), false);
  assertEquals(JSON.stringify(output).includes("no_plan_action"), false);
});

Deno.test("daily action coaching can recommend defense card or adjust plan", () => {
  const defense = normalizeDailyActionCoachingDispatcherOutput({
    flow_action: "recommend_and_return",
    confidence: "medium",
    recommendation: {
      primary_feature: "defense_card",
      why_primary: "The blocker is a risk moment.",
    },
  });
  const adjust = normalizeDailyActionCoachingDispatcherOutput({
    flow_action: "recommend_and_return",
    confidence: "medium",
    recommendation: {
      primary_feature: "adjust_plan",
      why_primary: "The action is too heavy.",
    },
  });

  assertEquals(defense.recommendation.primary_feature, "defense_card");
  assertEquals(adjust.recommendation.primary_feature, "adjust_plan");
});

Deno.test("daily action coaching note names exact action ids", () => {
  const state = context("trop lourd ce soir");
  const output = normalizeDailyActionCoachingDispatcherOutput({
    flow_action: "recommend_and_return",
    confidence: "high",
    recommendation: {
      primary_feature: "adjust_plan",
      why_primary: "The action is too heavy.",
    },
  });
  const reduced = reduceDailyActionCoachingOutput({ previous: state, output });
  const serialized = JSON.stringify(reduced.note_information);

  assertStringIncludes(serialized, "occ-1");
  assertStringIncludes(serialized, "item-1");
  assertEquals(serialized.includes("target_switch"), false);
  assertEquals(serialized.includes("emotion_coaching"), false);
});
