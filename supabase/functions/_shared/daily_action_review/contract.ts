export type DailyReviewIntent =
  | "open_review"
  | "answer_review"
  | "clarify_outcome"
  | "clarify_reason"
  | "clarify_still_relevant"
  | "recap"
  | "correction"
  | "user_stopped"
  | "safety"
  | "off_topic"
  | "unclear";

export type DailyReviewOutcome =
  | "completed"
  | "partial"
  | "missed"
  | "unclear";

export type DailyReviewAppliedOutcome =
  | "completed"
  | "partial"
  | "missed";

export type DailyReviewReasonCategory =
  | "fatigue"
  | "forgot"
  | "external"
  | "too_hard"
  | "not_relevant"
  | "emotional"
  | "no_need"
  | "other"
  | "unclear"
  | "none";

export type DailyReviewConstraint =
  | "one_question_max"
  | "no_solution_first"
  | "no_tool_suggestion"
  | "no_plan_adjustment"
  | "no_potion"
  | "no_guilt"
  | "respect_user_stopped"
  | "do_not_mark_without_evidence"
  | "do_not_apply_without_complete_slots";

export type DailyReviewStatus =
  | "opening"
  | "collecting"
  | "needs_clarification"
  | "complete"
  | "stopped"
  | "blocked";

export type DailyReviewMissingSlot =
  | "outcome"
  | "reason"
  | "still_relevant"
  | "which_action"
  | "completion_level";

export type DailyReviewStopReason =
  | "all_required_slots_filled"
  | "user_stopped"
  | "safety"
  | "unclear_after_retries"
  | null;

export type DailyReviewReducerReasonCode =
  | "missing_previous_offer"
  | "pending_confirmation_missing"
  | "direct_handoff_flag_missing"
  | "selected_option_missing"
  | "durable_need_missing"
  | "candidate_missing"
  | "blocked_by_constraint"
  | "not_stabilized_enough"
  | "invalid_status_transition";

export type DailyReviewStateMutationAudit = {
  server_owned_fields: string[];
  modified_fields_declared: string[];
  clear_fields_declared: string[];
  applied_fields: string[];
  preserved_fields: string[];
  restored_fields: string[];
  cleared_fields: string[];
  rejected_changes: Array<{
    field: string;
    reason_code: DailyReviewReducerReasonCode;
  }>;
};

export type DailyReviewBlockedEffect = {
  type: "daily_action_review_commit" | "daily_action_review_state_mutation";
  reason_code: DailyReviewReducerReasonCode;
  field?: string;
};

export type DailyReviewItemUpdate = {
  outcome: DailyReviewOutcome | null;
  reason_category: DailyReviewReasonCategory | null;
  reason_text: string | null;
  still_relevant: boolean | "unknown";
  evidence_text: string | null;
  matched_user_text: string | null;
  confidence: "high" | "medium" | "low";
  missing_slots: DailyReviewMissingSlot[];
};

export type DailyReviewEffect = {
  type: "log_daily_action_review";
  occurrence_id: string;
  plan_item_id: string;
  outcome: DailyReviewAppliedOutcome;
  reason_category: DailyReviewReasonCategory;
  reason_text: string | null;
  still_relevant: boolean | null;
  source: "daily_action_review_v1";
};

export type DailyReviewEffectPlan = {
  allowed: boolean;
  effects: DailyReviewEffect[];
};

export type DailyReviewCommittedEffect = {
  type: "log_daily_action_review";
  occurrence_id: string;
  plan_item_id: string;
  entry_id: string;
  outcome: DailyReviewAppliedOutcome;
  reason_category: DailyReviewReasonCategory;
  source: "daily_action_review_v1";
  commit_status: "inserted" | "already_existing";
};

export type DailyReviewFailedEffect = {
  type: "log_daily_action_review";
  occurrence_id: string;
  plan_item_id: string;
  error: string;
};

export type DailyReviewEffectsResult = {
  committed_effects: DailyReviewCommittedEffect[];
  failed_effects: DailyReviewFailedEffect[];
};

export type DailyReviewDecision = {
  skill_id: "daily_action_review_v1";
  intent: DailyReviewIntent;
  status: DailyReviewStatus;
  target_occurrence_ids: string[];
  item_updates: Record<string, DailyReviewItemUpdate>;
  item_update_modes?: Record<string, "set" | "revise" | "clear" | "none">;
  state_change_intent?: {
    modified_fields?: string[];
    clear_fields?: string[];
  };
  constraints: DailyReviewConstraint[];
  next_question: string | null;
  next_question_targets: string[];
  generated_user_message: string | null;
  should_apply_effects: boolean;
  stop_reason: DailyReviewStopReason;
  effect_plan: DailyReviewEffectPlan;
};

export const DAILY_REVIEW_DEFAULT_CONSTRAINTS: DailyReviewConstraint[] = [
  "one_question_max",
  "no_solution_first",
  "no_tool_suggestion",
  "no_plan_adjustment",
  "no_potion",
  "no_guilt",
  "respect_user_stopped",
  "do_not_mark_without_evidence",
  "do_not_apply_without_complete_slots",
];
