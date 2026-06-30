import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { initialDailyActionCoachingState } from "./local_flow.ts";
import { runDailyActionCoachingRecommendationSkill } from "./skill.ts";
import type { DailyActionCoachingHandoffContext } from "./contract.ts";

function handoffContext(): DailyActionCoachingHandoffContext {
  return {
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
      reason_text: "j'oublie au moment de lancer",
    },
    help_request_summary: "User asks for help succeeding with the daily action.",
  };
}

function skillInput(overrides: Record<string, unknown> = {}) {
  const localState = initialDailyActionCoachingState(handoffContext());
  return {
    user_message: "tu peux m'aider pour celle-la ?",
    context: {
      skill_id: "daily_action_coaching_recommendation_v1",
      user_id: "user-1",
      recent_messages: [],
      active_skill_working_state: {
        version: 1,
        skill_id: "daily_action_coaching_recommendation_v1",
        status: "active",
        turn_count: 0,
        started_at: "2026-06-29T00:00:00.000Z",
        updated_at: "2026-06-29T00:00:00.000Z",
        user_id: "user-1",
        scope: "whatsapp",
        working_state: {
          daily_action_coaching_recommendation_state: localState,
        },
      },
      turn_frame: {
        turn_id: "turn-1",
        source_message_id: "msg-1",
        user_id: "user-1",
        channel: "whatsapp",
        safety: { risk_band: "none", reason_codes: [], evidence: [] },
        direct_effects: [],
        skill_signals: { entry: {}, lifecycle: {}, exit: {} },
        memory_plan: {
          context_need: "minimal",
          memory_mode: "none",
          context_budget_tier: "tiny",
          targets: [],
          retrieval_policy: "semantic_first",
        },
      },
      relevant_memory_items: [],
      plan_items: [],
      product_surfaces: [],
      exclusions: [],
    },
    ...overrides,
  } as any;
}

Deno.test("daily action coaching skill recommends and emits parent return note", async () => {
  const output = await runDailyActionCoachingRecommendationSkill(skillInput({
    local_dispatcher: async () => ({
      flow_action: "recommend_and_return",
      confidence: "high",
      recommendation: {
        primary_feature: "attack_card",
        secondary_feature: null,
        why_primary: "The blocker is forgetting the start cue.",
        user_facing_next_step: "Prepare a launch cue.",
      },
      visible_task: { kind: "action_plan_coaching" },
      evidence: ["j'oublie"],
    }),
    visible_agent: async () => ({
      message: "Utilise une carte d'attaque pour préparer le premier geste.",
      visible_decision: null,
    }),
  }));

  assertEquals(output.skill_id, "daily_action_coaching_recommendation_v1");
  assertEquals(output.status, "complete");
  assertEquals(
    output.state_patch?.daily_action_coaching_recommendation_state,
    null,
  );
  assertEquals(
    (output.state_patch?.daily_action_coaching_recommendation_note_information as any)
      ?.target_dispatcher,
    "daily_action_review_v1",
  );
  assertEquals(
    (output.state_patch?.daily_action_coaching_recommendation_note_information as any)
      ?.structured_context?.bridge_kind,
    "daily_action_coaching_to_parent",
  );
});

Deno.test("daily action coaching skill does not mutate daily state", async () => {
  const output = await runDailyActionCoachingRecommendationSkill(skillInput({
    local_dispatcher: async () => ({
      flow_action: "recommend_and_return",
      confidence: "medium",
      recommendation: {
        primary_feature: "adjust_plan",
        why_primary: "The action is too heavy.",
      },
      visible_task: { kind: "action_plan_coaching" },
      evidence: ["trop lourd"],
    }),
    visible_agent: async () => "Regarde l'ajustement du plan pour cette action.",
  }));

  assertEquals(output.effects?.committed, []);
  assertEquals(
    (output.state_patch?.daily_action_coaching_recommendation_note_information as any)
      ?.structured_context?.no_daily_mutation,
    true,
  );
});
