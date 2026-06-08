import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildInitialDailyActionReviewState,
  type DailyActionReviewTarget,
} from "./daily_action_review.ts";
import {
  buildDailyActionReviewLastExitMemo,
  runDailyActionReviewLocalFlow,
  sanitizeDailyActionReviewLocalDispatcherOutput,
} from "./daily_action_review/local_flow.ts";

function target(id: string, title: string): DailyActionReviewTarget {
  return {
    occurrence_id: id,
    cycle_id: "cycle",
    transformation_id: "transformation",
    plan_id: "plan",
    plan_item_id: `item-${id}`,
    title,
    dimension: "habits",
    kind: "habit",
    tracking_type: "boolean",
    planned_day: "mon",
    original_planned_day: null,
    week_start_date: "2026-06-08",
  };
}

const NO_EXIT_MEMO = {
  needed: false,
  reason: "none",
  user_intent_summary: null,
  local_flow_context: {
    skill_id: "daily_action_review_v1",
    targets: [],
    current_daily_state: null,
    collected_updates_summary: null,
    missing_slots: [],
    committed_effects: [],
  },
  handoff_hint_for_global_dispatcher: {
    likely_intent: "unknown",
    why: null,
    constraints: [],
  },
};

Deno.test("daily action review local dispatcher complete answer becomes commit-ready without visible precommit wording", async () => {
  const targets = [target("a1", "Marcher 10 min")];
  const state = buildInitialDailyActionReviewState(targets);

  const result = await runDailyActionReviewLocalFlow({
    text: "Oui, j'ai marché 10 minutes.",
    targets,
    previousState: state,
    dispatcherRunner: async () => ({
      flow_action: "answer_review",
      confidence: "high",
      risk_score: 0,
      target_resolution: {
        resolved_occurrence_ids: ["a1"],
        ambiguous: false,
        why: "Single target answered.",
      },
      item_updates: {
        a1: {
          update_mode: "set",
          outcome: "completed",
          reason_category: "none",
          reason_text: null,
          still_relevant: true,
          evidence_text: "j'ai marché 10 minutes",
          matched_user_text: "Oui, j'ai marché 10 minutes.",
          confidence: "high",
          missing_slots: [],
        },
      },
      daily_intent: {
        kind: "daily_answer",
        summary: "Action completed.",
      },
      state_updates: {
        status_hint: "complete",
        turn_count_increment: 1,
        close_after_visible: false,
      },
      visible_task: {
        kind: "commit_success",
        instruction: "Confirm only after writer commit.",
      },
      exit_memo: NO_EXIT_MEMO,
      evidence: ["completed single target"],
    }),
    visibleRunner: async () => {
      throw new Error("visible_agent_should_wait_for_commit");
    },
  });

  assertEquals(result.shouldApplyEffects, true);
  assertEquals(result.state.effect_plan.allowed, true);
  assertEquals(result.state.effect_plan.effects[0]?.occurrence_id, "a1");
  assertEquals(result.generatedUserMessage, null);
});

Deno.test("daily action review local dispatcher asks which action when two targets are ambiguous", async () => {
  const targets = [
    target("a1", "Marcher 10 min"),
    target("a2", "Ranger le bureau"),
  ];
  const state = buildInitialDailyActionReviewState(targets);

  const result = await runDailyActionReviewLocalFlow({
    text: "Je l'ai fait.",
    targets,
    previousState: state,
    dispatcherRunner: async () => ({
      flow_action: "clarify_which_action",
      confidence: "high",
      risk_score: 0,
      target_resolution: {
        resolved_occurrence_ids: [],
        ambiguous: true,
        why: "Two active targets and singular reference.",
      },
      item_updates: {},
      daily_intent: {
        kind: "daily_clarification",
        summary: "Ambiguous target.",
      },
      state_updates: {
        status_hint: "needs_clarification",
        turn_count_increment: 1,
        close_after_visible: false,
      },
      visible_task: {
        kind: "clarify_which_action",
        instruction: "Ask which target.",
      },
      exit_memo: NO_EXIT_MEMO,
      evidence: ["ambiguous reference"],
    }),
    visibleRunner: async () =>
      "Tu parles de la marche ou du rangement du bureau ?",
  });

  assertEquals(result.shouldApplyEffects, false);
  assertEquals(result.state.effect_plan.allowed, false);
  assertEquals(
    result.generatedUserMessage,
    "Tu parles de la marche ou du rangement du bureau ?",
  );
});

Deno.test("daily action review local dispatcher exit requires memo and ignores unknown item ids", () => {
  const targets = [target("a1", "Marcher 10 min")];
  const output = sanitizeDailyActionReviewLocalDispatcherOutput({
    targets,
    raw: {
      flow_action: "exit_to_global_dispatcher",
      confidence: "high",
      risk_score: 0,
      target_resolution: {
        resolved_occurrence_ids: ["unknown"],
        ambiguous: false,
        why: "Tool request.",
      },
      item_updates: {
        unknown: {
          update_mode: "set",
          outcome: "completed",
          reason_category: "none",
          reason_text: null,
          still_relevant: true,
          evidence_text: "bad id",
          matched_user_text: "bad id",
          confidence: "high",
          missing_slots: [],
        },
      },
      daily_intent: {
        kind: "explicit_tool_request",
        summary: "User asks for a defense card.",
      },
      state_updates: {
        status_hint: "collecting",
        turn_count_increment: 1,
        close_after_visible: false,
      },
      visible_task: {
        kind: "exit_or_cancel",
        instruction: "No local visible message.",
      },
      exit_memo: {
        needed: true,
        reason: "explicit_tool_request",
        user_intent_summary: "User asks for a defense card.",
        local_flow_context: {
          skill_id: "daily_action_review_v1",
          targets: [{ occurrence_id: "a1" }],
          current_daily_state: "collecting",
          collected_updates_summary: null,
          missing_slots: ["outcome"],
          committed_effects: [],
        },
        handoff_hint_for_global_dispatcher: {
          likely_intent: "prepare_defense_card",
          why: "Explicit card request.",
          constraints: [
            "Do not mark daily as completed unless daily_action_review later commits an entry.",
          ],
        },
      },
      evidence: ["tool request"],
    },
  });
  const memo = buildDailyActionReviewLastExitMemo({
    output,
    at: "2026-06-08T10:00:00.000Z",
  });

  assertEquals(Object.keys(output.item_updates), []);
  assertEquals(output.exit_memo.needed, true);
  assertEquals(
    output.exit_memo.handoff_hint_for_global_dispatcher.likely_intent,
    "prepare_defense_card",
  );
  assertEquals(memo.at, "2026-06-08T10:00:00.000Z");
});
