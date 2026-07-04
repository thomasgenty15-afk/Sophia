import type { NoteInformation } from "../../contracts/note_information.v1.ts";
import type { LocalOneShotDirectEffectRequest } from "../../router/one_shot_local_direct_effect.ts";

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
  | "exit_to_global_dispatcher"
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
  | "stop_or_cancel"
  | "safety_transition"
  | "safety_escalation";

export type SafetyCrisisProductToolAttemptKind =
  | "product_question"
  | "tool_creation"
  | "plan_work"
  | "status_request"
  | "none";

export type SafetyCrisisDirectEffectRequest = LocalOneShotDirectEffectRequest;

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
  direct_effect_request: SafetyCrisisDirectEffectRequest;
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
    status_lookup_called: false;
    legacy_operation_called: false;
    operation_route_created: false;
    pending_confirmation_created: false;
    db_write_committed: false;
  };
  modified_fields?: string[];
  clear_fields?: string[];
  note_information?: NoteInformation | null;
  evidence: string[];
};

export type SafetyCrisisConversationContext = {
  state_summary: string;
  user_words: string[];
  field_or_stage: SafetyCrisisPhase | SafetyCrisisVisibleTaskKind | null;
  known_values: {
    immediate_danger: boolean | null;
    has_means_nearby: boolean | null;
    user_not_alone: boolean | null;
    human_support_available: boolean | null;
    emergency_help_contacted: boolean | null;
    risk_band: SafetyRiskBand;
    phase: SafetyCrisisPhase;
    direct_effect_lane?: Record<string, unknown> | null;
    direct_effect_confirmation_context?: Record<string, unknown> | null;
  };
  missing_or_weak_values: string[];
  selected_candidate: Record<string, never>;
  handoff_data: {
    deferred_product_or_tool_request: string | null;
    current_step: string | null;
    inbound_note_summary: string | null;
  };
  next_focus: string;
  safety_resources: {
    emergency_numbers: string;
    suicide_prevention_number: string;
    must_include_emergency_numbers: boolean;
    must_prioritize_human_support: boolean;
  };
  tone_constraints: string[];
  do_not_say: string[];
  context_summary: string | null;
  evidence_used: string[];
  max_questions: 1 | 2;
};

export type SafetyCrisisVisibleTask = {
  kind: SafetyCrisisVisibleTaskKind;
  conversation_context: SafetyCrisisConversationContext;
};

export type SafetyCrisisExitMemo = {
  reason: "resolved";
  flow_summary: string;
  note_information: NoteInformation;
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
  // true une fois que les numeros d'urgence ont ete delivres dans cette crise.
  // Sert a ne pas re-reciter la hotline a chaque tour (transition vers soutien
  // emotionnel soutenu); remis a false lors d'une desescalade pour qu'une
  // re-escalade re-delivre les numeros.
  emergency_numbers_delivered?: boolean;
  consecutive_deescalated_turns?: number;
  last_user_safety_signal?: string | null;
  last_assistant_safety_step?: string | null;
  exit_memo?: SafetyCrisisExitMemo | null;
  pending_offer?: unknown;
  pending_confirmation?: unknown;
  last_selected_option?: unknown;
  active_subflow_context?: unknown;
  handoff_note?: NoteInformation | Record<string, unknown> | null;
  note_information?: NoteInformation | Record<string, unknown> | null;
  local_state_summary?: string | null;
  previous_flow_summary?: string | null;
};

export type SafetyCrisisStateMutationRejectedChange = {
  field: string;
  requested_action: "modify" | "clear";
  reason_code:
    | "transition_not_authorized"
    | "invalid_status_transition"
    | "pending_confirmation_missing"
    | "direct_handoff_flag_missing"
    | "missing_previous_offer"
    | "selected_option_missing"
    | "blocked_by_constraint"
    | "not_stabilized_enough"
    | "missing_previous_exit_check"
    | "missing_resolution_facts";
};

export type SafetyCrisisStateMutationAudit = {
  server_owned_fields: string[];
  modified_fields_declared: string[];
  clear_fields_declared: string[];
  applied_fields: string[];
  preserved_fields: string[];
  restored_fields: string[];
  cleared_fields: string[];
  rejected_changes: SafetyCrisisStateMutationRejectedChange[];
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
  emergency_numbers_delivered: boolean;
  consecutive_deescalated_turns: number;
  last_user_safety_signal?: string | null;
  last_assistant_safety_step?: string | null;
  trigger_summary?: string | null;
  visible_task?: SafetyCrisisVisibleTask;
  exit_memo?: SafetyCrisisExitMemo | null;
  summary?: string;
  pending_offer?: unknown;
  pending_confirmation?: unknown;
  last_selected_option?: unknown;
  active_subflow_context?: unknown;
  handoff_note?: NoteInformation | Record<string, unknown> | null;
  note_information?: NoteInformation | Record<string, unknown> | null;
  local_state_summary?: string | null;
  previous_flow_summary?: string | null;
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
  stateMutationAudit: SafetyCrisisStateMutationAudit;
};

export const SAFETY_CRISIS_INVARIANTS = [
  "resolved_requires_no_immediate_danger",
  "resolved_requires_means_absent_or_away",
  "resolved_requires_human_support_or_recall_path",
  "resolved_requires_prior_exit_check",
  "risk_score_or_local_dispatcher_escalate_only",
  "no_operation_suggestion_runtime",
  "global_dispatcher_skipped_while_safety_active",
  "visible_agent_uses_conversation_context_only",
  "visible_fallback_not_nominal",
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
