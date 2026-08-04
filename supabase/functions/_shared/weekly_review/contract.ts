import type { WeeklyProgressReviewV2 } from "../weekly_progress_review.ts";

export type WeeklyReviewIntent =
  | "open_weekly_review"
  | "answer_weekly_question"
  | "confirm_plan_patch"
  | "reject_plan_patch"
  | "revise_plan_patch"
  | "explain_plan_patch"
  | "recap"
  | "level_review_needed"
  | "user_stopped"
  | "safety"
  | "off_topic"
  | "unclear";

export type WeeklyHabitVerdictStatus =
  | "validated"
  | "partial_validatable"
  | "failed"
  | "no_signal";

export type WeeklyStrategyDecision =
  | "advance"
  | "advance_with_caution"
  | "advance_with_watch"
  | "repeat_week"
  | "bridge_week"
  | "level_review"
  | "hold";

export type WeeklyReviewStatus =
  | "opening"
  | "ask_question"
  | "ready_for_confirmation"
  | "pending_confirmation"
  | "applied"
  | "no_change"
  | "escalate_level_review"
  | "stopped"
  | "blocked";

export type WeeklyReviewConstraint =
  | "requires_confirmation"
  | "do_not_modify_level_objective"
  | "do_not_reschedule_completed_non_habit"
  | "do_not_apply_without_user_confirmation"
  | "do_not_include_support_items"
  | "do_not_overfit_low_confidence_daily"
  | "one_question_max"
  | "no_tool_suggestion_during_opening"
  | "no_done_language_without_commit";

export type WeeklyReviewAction =
  WeeklyProgressReviewV2["transformations"][number]["actions"][number];

export type WeeklyDailyEvidenceSnapshot = {
  source: "daily_action_review_v1" | "conversation" | "dashboard" | "none";
  reason_category: string | null;
  reason_text: string | null;
  still_relevant: boolean | null;
  reschedule_decision: string | null;
  confidence: "high" | "medium" | "low" | "none";
};

export type WeeklyEvidenceSummary = {
  source: "weekly_progress_review_v2";
  daily_coverage: "complete" | "partial" | "low" | "none";
  confidence: "high" | "medium" | "low";
  planned_count: number;
  done_count: number;
  partial_count: number;
  missed_count: number;
  unanswered_count: number;
  rescheduled_count: number;
  dominant_blockers: string[];
  covered_count: number;
};

export type WeeklyHumanSignals = {
  objective_delta:
    | "clear_progress"
    | "slight_progress"
    | "stable"
    | "regression"
    | "unclear"
    | "unknown";
  felt_state:
    | "energized"
    | "stable"
    | "tired_but_ok"
    | "frustrated"
    | "overloaded"
    | "lost"
    | "unknown";
};

export type WeeklyReviewPlanPatch = {
  requires_confirmation: true;
  operations: Array<{
    op:
      | "advance_week"
      | "repeat_week"
      | "insert_bridge_week"
      | "mark_item_completed"
      | "carry_over_item"
      | "drop_item"
      | "open_level_review";
    plan_item_id?: string;
    occurrence_id?: string;
    details: Record<string, unknown>;
  }>;
};

export type WeeklyReviewDecision = {
  skill_id: "weekly_review_v1";
  intent: WeeklyReviewIntent;
  status: WeeklyReviewStatus;
  week_start_date: string;
  week_end_date: string;
  evidence: WeeklyEvidenceSummary;
  habit_verdict: {
    status: WeeklyHabitVerdictStatus;
    completion_rate: number;
    planned_count: number;
    done_points: number;
    reason: string;
  };
  human_signals: WeeklyHumanSignals;
  week_strategy: {
    decision: WeeklyStrategyDecision;
    reason: string;
    preserve_level_objective: true;
    preserve_level_architecture: true;
  };
  question: {
    id: string;
    text: string;
    blocks_decision: boolean;
    targets: string[];
  } | null;
  item_decisions: Array<{
    plan_item_id: string;
    occurrence_id: string;
    title: string;
    family: "habit" | "mission" | "clarification" | "other";
    current_week_status:
      | "done"
      | "partial"
      | "missed"
      | "rescheduled"
      | "not_answered"
      | "unknown";
    evidence_done: boolean;
    daily_evidence_confidence: "high" | "medium" | "low" | "none";
    daily_evidence: WeeklyDailyEvidenceSnapshot;
    decision:
      | "keep"
      | "mark_completed"
      | "carry_over"
      | "drop"
      | "repeat_with_week"
      | "bridge_with_week"
      | "split_or_replace"
      | "escalate_level_review";
    reason: string;
  }>;
  plan_patch: WeeklyReviewPlanPatch;
  effect_plan: {
    allowed: boolean;
    effects: Array<{
      type:
        | "apply_weekly_plan_patch"
        | "open_level_review"
        | "write_weekly_summary";
      requires_confirmation: true;
      payload: Record<string, unknown>;
    }>;
  };
  constraints: WeeklyReviewConstraint[];
  reply: string | null;
  state_patch: Record<string, unknown>;
};
