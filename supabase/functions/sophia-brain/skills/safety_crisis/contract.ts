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
