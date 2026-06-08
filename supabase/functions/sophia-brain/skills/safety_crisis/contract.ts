export type SafetyCrisisPhase =
  | "entry"
  | "immediate_risk_check"
  | "acute_grounding"
  | "support_contact"
  | "stabilizing"
  | "exit_check"
  | "resolved";

export type SafetyRiskBand =
  | "none"
  | "low"
  | "medium"
  | "high"
  | "critical";

export type SafetySignal = {
  suicidal_ideation: boolean;
  self_harm_intent: boolean;
  immediate_danger: boolean | null;
  has_means_nearby: boolean | null;
  means_moved_away: boolean | null;
  user_currently_alone: boolean | null;
  human_support_available: boolean | null;
  emergency_help_contacted: boolean | null;
  clarified_non_immediate: boolean;
  deescalation_evidence: boolean;
  uncertainty: "low" | "medium" | "high";
};

export type SafetyCrisisLocalFlowAction =
  | "answer_safety_check"
  | "provide_means_status"
  | "provide_alone_status"
  | "provide_support_status"
  | "provide_emergency_status"
  | "provide_deescalation_evidence"
  | "needs_grounding"
  | "repeat_current_step"
  | "product_or_tool_attempt"
  | "wants_to_exit"
  | "safety_escalate";

export type SafetyCrisisVisibleTaskKind =
  | "immediate_risk_check"
  | "acute_grounding"
  | "support_contact"
  | "stabilizing"
  | "exit_check"
  | "resolved_exit"
  | "repeat_current_step"
  | "product_tool_boundary"
  | "safety_escalation";

export type SafetyCrisisProductToolAttemptKind =
  | "product_question"
  | "tool_creation"
  | "plan_work"
  | "status_request"
  | "none";

export type SafetyCrisisResolutionFact =
  | "immediate_danger_absent"
  | "means_safe"
  | "human_support_available"
  | "not_alone"
  | "no_fresh_risk_signal";

export type SafetyCrisisLocalDispatcherOutput = {
  flow_action: SafetyCrisisLocalFlowAction;
  confidence: "low" | "medium" | "high";
  risk_score: number;
  safety_signals: SafetySignal;
  user_state_summary: {
    paraphrase: string | null;
    current_need:
      | "immediate_risk_check"
      | "grounding"
      | "move_means_away"
      | "contact_human"
      | "stay_with_support"
      | "exit_request"
      | "unclear";
    what_changed_since_previous_turn: string | null;
  };
  product_tool_boundary: {
    attempted: boolean;
    attempt_kind: SafetyCrisisProductToolAttemptKind;
    defer_reason: string | null;
  };
  exit_request: {
    requested: boolean;
    why_user_thinks_safe: string | null;
    missing_resolution_facts: SafetyCrisisResolutionFact[];
  };
  state_hints: {
    suggested_trigger_summary: string | null;
    suggested_last_user_safety_signal: string | null;
  };
  no_tooling: {
    product_help_called: false;
    status_recap_called: false;
    tool_skill_called: false;
    operation_suggestion_created: false;
    pending_confirmation_created: false;
    db_write_committed: false;
  };
  evidence: string[];
};

export type SafetyCrisisVisibleTask = {
  kind: SafetyCrisisVisibleTaskKind;
  required_data: {
    risk_band: Exclude<SafetyRiskBand, "none"> | "none";
    phase: SafetyCrisisPhase;
    emergency_numbers: string;
    suicide_prevention_number: string;
    must_include_emergency_numbers: boolean;
    must_prioritize_human_support: boolean;
    max_questions: 1 | 2;
    known_facts: {
      immediate_danger: boolean | null;
      has_means_nearby: boolean | null;
      user_not_alone: boolean | null;
      human_support_available: boolean | null;
      emergency_help_contacted: boolean | null;
    };
    current_step: string | null;
    deferred_product_or_tool_request: string | null;
  };
};

export type SafetyCrisisExitMemo = {
  reason: "resolved";
  flow_summary: string;
  handoff_hint_for_global_dispatcher: {
    likely_intent: "normal_coaching" | "previous_flow_resume" | "unknown";
    constraints: string[];
  };
};

export type SafetyCrisisWorkingState = {
  phase?: SafetyCrisisPhase;
  risk_band?: SafetyRiskBand | string;
  trigger_summary?: string | null;
  immediate_danger?: boolean | null;
  has_means_nearby?: boolean | null;
  user_not_alone?: boolean | null;
  emergency_help_mentioned?: boolean;
  human_support_mentioned?: boolean;
  consecutive_deescalated_turns?: number;
  last_user_safety_signal?: string | null;
  last_assistant_safety_step?: string | null;
  exit_memo?: SafetyCrisisExitMemo | null;
};

export type SafetyCrisisLocalState = {
  skill_id: "safety_crisis";
  status: "active" | "resolving" | "exiting";
  mode: "local_safety_flow";
  turn_count: number;
  max_turns: number;
  created_at: string;
  updated_at: string;
  working_state: SafetyCrisisWorkingState;
};

export type SafetyCrisisResponseContract = {
  allow_product_reference: false;
  allow_tool_suggestion: false;
  allow_memory_persistence_default: false;
  max_questions: 1 | 2;
  must_include_emergency_numbers: boolean;
  must_prioritize_human_support: boolean;
  must_avoid_dashboard_or_plan: true;
};

export type SafetyCrisisStatePatch = {
  phase: SafetyCrisisPhase;
  risk_band: SafetyRiskBand;
  immediate_danger: boolean | null;
  has_means_nearby: boolean | null;
  user_not_alone: boolean | null;
  emergency_help_mentioned: boolean;
  human_support_mentioned: boolean;
  consecutive_deescalated_turns: number;
  last_user_safety_signal?: string | null;
  last_assistant_safety_step?: string | null;
  trigger_summary?: string | null;
  visible_task?: SafetyCrisisVisibleTask;
  exit_memo?: SafetyCrisisExitMemo | null;
  summary?: string;
};

export type SafetyCrisisDecision = {
  skill_id: "safety_crisis";
  phase: SafetyCrisisPhase;
  risk_band: SafetyRiskBand;
  safety_signals: SafetySignal;
  response_contract: SafetyCrisisResponseContract;
  reply: string;
  state_patch: SafetyCrisisStatePatch;
};

export type SafetyCrisisSnapshot = {
  user_message: string;
  normalized_user_message: string;
  source_message_id: string;
  source_risk_band: SafetyRiskBand;
  previous_state: SafetyCrisisWorkingState;
};

export type SafetyCrisisReduction = {
  phase: SafetyCrisisPhase;
  riskBand: SafetyRiskBand;
  statePatch: SafetyCrisisStatePatch;
  visibleTask: SafetyCrisisVisibleTask;
  exitMemo: SafetyCrisisExitMemo | null;
  reasonCode: string;
};

export const SAFETY_CRISIS_INVARIANTS = [
  "resolved_requires_no_immediate_danger",
  "resolved_requires_means_absent_or_away",
  "resolved_requires_human_support_or_recall_path",
  "resolved_requires_prior_exit_check",
  "deterministic_overrides_escalate_only",
  "operation_suggestions_always_empty",
] as const;

export function emptySafetySignal(
  patch: Partial<SafetySignal> = {},
): SafetySignal {
  const signal: SafetySignal = {
    suicidal_ideation: false,
    self_harm_intent: false,
    immediate_danger: null,
    has_means_nearby: null,
    means_moved_away: null,
    user_currently_alone: null,
    human_support_available: null,
    emergency_help_contacted: null,
    clarified_non_immediate: false,
    deescalation_evidence: false,
    uncertainty: "high",
  };
  return { ...signal, ...patch };
}

export function normalizeSafetyRiskBand(value: unknown): SafetyRiskBand {
  return value === "critical" || value === "high" || value === "medium" ||
      value === "low" || value === "none"
    ? value
    : "none";
}

export function normalizeSafetyPhase(value: unknown): SafetyCrisisPhase {
  return value === "entry" ||
      value === "immediate_risk_check" ||
      value === "acute_grounding" ||
      value === "support_contact" ||
      value === "stabilizing" ||
      value === "exit_check" ||
      value === "resolved"
    ? value
    : "entry";
}

export function safetyResponseContract(args: {
  phase: SafetyCrisisPhase;
  riskBand: SafetyRiskBand;
  signals: SafetySignal;
}): SafetyCrisisResponseContract {
  return {
    allow_product_reference: false,
    allow_tool_suggestion: false,
    allow_memory_persistence_default: false,
    max_questions: args.phase === "immediate_risk_check" ? 2 : 1,
    must_include_emergency_numbers: args.riskBand === "critical" ||
      args.signals.immediate_danger === true,
    must_prioritize_human_support: args.phase === "acute_grounding" ||
      args.phase === "support_contact" ||
      args.riskBand === "critical",
    must_avoid_dashboard_or_plan: true,
  };
}
