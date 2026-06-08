import { assertEquals } from "jsr:@std/assert@1";
import {
  normalizeWeeklyReviewLocalDispatcherOutput,
  reduceWeeklyReviewLocalDispatcherOutput,
} from "./local_flow.ts";

function weeklyState() {
  return {
    skill_id: "weekly_adaptive_review_v1",
    status: "open",
    weekly_progress_review: {
      week_start_date: "2026-06-01",
      week_end_date: "2026-06-07",
      transformations: [],
    },
    weekly_adaptive_review: {
      week_strategy: { decision: "bridge_week", reason: "charge forte" },
      question: { text: "Comment tu ressors de la semaine ?" },
      item_decisions: [],
    },
    weekly_flow_state: {
      stage: "strategy_ready",
      proposal_status: "none",
      validation_unlock_status: "locked_until_weekly_complete",
      human_signals: {
        objective_delta: "unknown",
        felt_state: "unknown",
      },
      last_visible_summary: "Semaine chargee, alleger serait prudent.",
      last_handoff_summary: null,
      turn_count: 1,
      max_turns: 6,
      updated_at: "2026-06-08T08:00:00.000Z",
    },
  };
}

function baseOutput(overrides: Record<string, unknown> = {}) {
  return {
    flow_action: "answer_weekly_question",
    confidence: "high",
    risk_score: 0,
    weekly_intent: {
      kind: "weekly_answer",
      summary: "User confirme fatigue mais progression legere.",
    },
    human_signal_updates: {
      objective_delta: "slight_progress",
      felt_state: "tired_but_ok",
      dominant_blocker_confirmation: "confirmed",
      user_summary: "fatigue mais progression legere",
    },
    handoff_updates: {
      status: "none",
      requested_adjustment_summary: null,
      revision_summary: null,
      platform_destination: null,
      scope: {
        kind: "none",
        plan_id: null,
        plan_title: null,
        plan_item_ids: [],
        scope_summary: null,
        needs_scope_clarification: false,
      },
    },
    forgotten_progress: {
      status: "none",
      target_hint: null,
      outcome_hint: null,
      evidence: null,
    },
    state_updates: {
      status: "open",
      weekly_stage: "strategy_ready",
      validation_unlock_status: "locked_until_weekly_complete",
      turn_count_increment: 1,
      close_after_visible: false,
    },
    visible_task: {
      kind: "weekly_reading",
      instruction: "Donner la lecture weekly.",
    },
    exit_memo: {
      needed: false,
      reason: "none",
      user_intent_summary: null,
      local_flow_context: {
        skill_id: "weekly_adaptive_review_v1",
        weekly_stage: null,
        week_strategy: null,
        last_weekly_question: null,
        last_visible_summary: null,
        last_handoff_summary: null,
        validation_unlock_status: null,
        committed_effects: [],
      },
      handoff_hint_for_global_dispatcher: {
        likely_intent: "unknown",
        why: null,
        constraints: [],
      },
    },
    evidence: ["test"],
    ...overrides,
  };
}

Deno.test("weekly local reducer prepares Plan handoff without plan mutation", () => {
  const output = normalizeWeeklyReviewLocalDispatcherOutput(
    baseOutput({
      flow_action: "prepare_plan_handoff",
      weekly_intent: {
        kind: "plan_handoff_request",
        summary: "User wants a lighter next week.",
      },
      handoff_updates: {
        status: "ready",
        requested_adjustment_summary:
          "Alleger la semaine prochaine dans Plan.",
        revision_summary: null,
        platform_destination: "Plan",
        scope: {
          kind: "whole_week",
          plan_id: null,
          plan_title: null,
          plan_item_ids: [],
          scope_summary: "Toute la semaine",
          needs_scope_clarification: false,
        },
      },
      state_updates: {
        status: "handoff_ready",
        weekly_stage: "plan_handoff",
        validation_unlock_status: "locked_until_weekly_complete",
        turn_count_increment: 1,
        close_after_visible: false,
      },
      visible_task: {
        kind: "plan_handoff_ready",
        instruction: "Redonner la proposition Plan.",
      },
    }),
  );
  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: weeklyState(),
    output,
  });
  assertEquals(reduced.tool_execution, "platform_handoff");
  assertEquals(reduced.weekly_state?.status, "open");
  assertEquals(
    (reduced.weekly_state?.weekly_flow_state as any).proposal_status,
    "handoff_delivered",
  );
  assertEquals((reduced.weekly_state as any).executedTools, undefined);
});

Deno.test("weekly local reducer blocks global exit without memo", () => {
  const output = normalizeWeeklyReviewLocalDispatcherOutput(
    baseOutput({
      flow_action: "exit_to_global_dispatcher",
      weekly_intent: {
        kind: "explicit_tool_request",
        summary: "User asks for a card.",
      },
      exit_memo: {
        needed: false,
        reason: "none",
        user_intent_summary: null,
        local_flow_context: {
          skill_id: "weekly_adaptive_review_v1",
          weekly_stage: null,
          week_strategy: null,
          last_weekly_question: null,
          last_visible_summary: null,
          last_handoff_summary: null,
          validation_unlock_status: null,
          committed_effects: [],
        },
        handoff_hint_for_global_dispatcher: {
          likely_intent: "prepare_attack_card",
          why: null,
          constraints: [],
        },
      },
      visible_task: {
        kind: "exit_or_cancel",
        instruction: "Exit.",
      },
    }),
  );
  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: weeklyState(),
    output,
  });
  assertEquals(reduced.status, "blocked");
  assertEquals(reduced.exit_to_global_dispatcher, false);
  assertEquals(reduced.tool_execution, "blocked");
});

Deno.test("weekly local completion unlocks validation and stays non executable", () => {
  const output = normalizeWeeklyReviewLocalDispatcherOutput(
    baseOutput({
      flow_action: "complete_weekly_no_change",
      weekly_intent: {
        kind: "weekly_confirmation",
        summary: "User confirms no change is needed.",
      },
      state_updates: {
        status: "completed",
        weekly_stage: "closing",
        validation_unlock_status: "available",
        turn_count_increment: 1,
        close_after_visible: true,
      },
      visible_task: {
        kind: "complete_no_change",
        instruction: "Close weekly.",
      },
    }),
  );
  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: weeklyState(),
    output,
  });
  assertEquals(reduced.status, "closed");
  assertEquals(reduced.tool_execution, "none");
  assertEquals(reduced.weekly_state?.status, "completed");
  assertEquals(
    (reduced.weekly_state?.weekly_flow_state as any).validation_unlock_status,
    "available",
  );
  assertEquals(
    (reduced.weekly_state?.validation_unlock as any).status,
    "available",
  );
});
