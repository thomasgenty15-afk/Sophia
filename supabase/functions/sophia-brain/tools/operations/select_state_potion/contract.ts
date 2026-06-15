import type { NoteInformation } from "../../../contracts/note_information.v1.ts";
import type { SelectStatePotionIntakeState } from "./intake.ts";

export type SelectStatePotionUserIntent =
  | "start"
  | "choose_potion"
  | "provide_detail"
  | "draft_only"
  | "activate"
  | "cancel"
  | "reject"
  | "revise"
  | "explain"
  | "topic_change"
  | "forbid_potion"
  | "forbid_followup"
  | "one_shot_reminder_handoff"
  | "clarify"
  | "unknown";

export type SelectStatePotionConstraint = {
  kind:
    | "no_potion"
    | "no_tool"
    | "no_followup"
    | "no_recurring"
    | "no_weekly_series"
    | "instant_support_only"
    | "one_question_max"
    | "respect_existing_potion";
  value?: unknown;
  evidence: string[];
};

export type SelectStatePotionEffect = never;

export type SelectStatePotionCommittedEffect = never;

export type SelectStatePotionEffectLedger = {
  requested_effects: SelectStatePotionEffect[];
  allowed_effects: SelectStatePotionEffect[];
  blocked_effects: Array<{ type: string; reason_code: string }>;
  committed_effects: SelectStatePotionCommittedEffect[];
};

export type StatePotionHandoffStatus =
  | "collecting"
  | "clarifying"
  | "potion_selected"
  | "handoff_ready"
  | "handoff_delivered"
  | "revise_handoff"
  | "repeat_handoff"
  | "apply_attempt"
  | "cancelled"
  | "topic_change"
  | "blocked";

export type ClarteFlowAction =
  | "answer_current_field"
  | "confirm_proposed_field"
  | "revise_current_field"
  | "get_info_product"
  | "get_info_db"
  | "platform_destination_followup"
  | "apply_attempt"
  | "repeat_handoff"
  | "exit_to_global_dispatcher"
  | "handoff_to_local_flow"
  | "cancel_flow"
  | "exit_to_global_dispatcher"
  | "safety_preempt";

export type ClarteFieldStatus = "missing" | "proposed" | "locked";

export type ClarteVisibleTaskKind =
  | "ask_deeper"
  | "confirm_proposal"
  | "handoff_ready"
  | "revision_done"
  | "destination_short"
  | "apply_attempt"
  | "repeat_handoff"
  | "exit"
  | "safety"
  | "none";

export type StatePotionSubskillFlowAction =
  | "answer_current_field"
  | "confirm_proposed_field"
  | "revise_current_field"
  | "get_info_product"
  | "get_info_db"
  | "platform_destination_followup"
  | "apply_attempt"
  | "repeat_handoff"
  | "exit_to_global_dispatcher"
  | "handoff_to_local_flow"
  | "cancel_flow"
  | "exit_to_global_dispatcher"
  | "safety_preempt";

export type StatePotionSubskillFieldStatus = "missing" | "proposed" | "locked";

export type StatePotionSubskillFieldDetailSufficiency = {
  status: "unknown" | "sufficient" | "needs_more_detail";
  reason: string | null;
  followup_question: string | null;
  followup_asked: boolean;
  followup_answered: boolean;
  evidence: string[];
};

export type StatePotionVisibleFieldContext = {
  field_id: string;
  field_label: string;
  status: "missing" | "proposed" | "locked";
  value: string | null;
  candidate_value: string | null;
  locked_value: string | null;
  option_value: string | null;
  option_label: string | null;
  needs_user_confirmation: boolean;
  detail_sufficiency?: StatePotionSubskillFieldDetailSufficiency | null;
};

export type StatePotionConversationContext = {
  state_summary: string;
  user_words: string[];
  field_or_stage: string | null;
  known_values: Record<string, string>;
  missing_or_weak_values: Array<{
    field_id: string;
    field_label: string;
    reason: string;
    followup_question?: string | null;
  }>;
  selected_candidate: {
    potion_type: StatePotionSubskillPotionType | null;
    potion_name: string | null;
  };
  handoff_data: {
    potion_name: string | null;
    platform_destination: string;
    fields: StatePotionVisibleFieldContext[];
  };
  tone_constraints: string[];
  do_not_say: string[];
  context_summary: string | null;
  evidence_used: string[];
};

export type StatePotionSubskillVisibleTaskKind =
  | "ask_deeper"
  | "confirm_proposal"
  | "handoff_ready"
  | "revision_done"
  | "destination_short"
  | "apply_attempt"
  | "repeat_handoff"
  | "exit"
  | "safety"
  | "none";

export type StatePotionSubskillFieldState = {
  field_id: string;
  field_label: string;
  input_type: "free_text" | "single_select";
  status: StatePotionSubskillFieldStatus;
  candidate_value: string | null;
  locked_value: string | null;
  option_value: string | null;
  option_label: string | null;
  previous_value: string | null;
  needs_user_confirmation: boolean;
  why_status: string;
  detail_sufficiency: StatePotionSubskillFieldDetailSufficiency;
};

export type StatePotionSubskillRevisionState = {
  is_revision: boolean;
  field_id: string | null;
  replacement_value: string | null;
  option_value: string | null;
  option_label: string | null;
  replaces_previous_value: boolean;
};

export type StatePotionStateMutationRejectedChange = {
  field: string;
  reason_code: string;
  attempted_action?: string | null;
};

export type StatePotionStateMutationAudit = {
  server_owned_fields: string[];
  modified_fields_declared: string[];
  clear_fields_declared: string[];
  applied_fields: string[];
  preserved_fields: string[];
  restored_fields: string[];
  cleared_fields: string[];
  rejected_changes: StatePotionStateMutationRejectedChange[];
};

export type ClarteFieldState = {
  status: ClarteFieldStatus;
  candidate_value: string | null;
  locked_value: string | null;
  previous_value: string | null;
  needs_user_confirmation: boolean;
  why_status: string;
};

export type ClarteRevisionState = {
  is_revision: boolean;
  replacement_value: string | null;
  replaces_previous_value: boolean;
};

export type SelectStatePotionRiskAssessment = {
  risk_score: number;
  risk_band: "none" | "low" | "medium" | "high" | "critical";
  safety_preempt: boolean;
  reason_codes: string[];
};

export type StatePotionSubskillPotionType =
  | "rappel"
  | "courage"
  | "guerison"
  | "clarte"
  | "amour"
  | "apaisement";

export type StatePotionSubskillId =
  | "select_state_potion.rappel"
  | "select_state_potion.courage"
  | "select_state_potion.guerison"
  | "select_state_potion.clarte"
  | "select_state_potion.amour"
  | "select_state_potion.apaisement";

export function statePotionSubskillId(
  potionType: string | null | undefined,
): StatePotionSubskillId | null {
  switch (potionType) {
    case "rappel":
      return "select_state_potion.rappel";
    case "courage":
      return "select_state_potion.courage";
    case "guerison":
      return "select_state_potion.guerison";
    case "clarte":
      return "select_state_potion.clarte";
    case "amour":
      return "select_state_potion.amour";
    case "apaisement":
      return "select_state_potion.apaisement";
    default:
      return null;
  }
}

export type StatePotionSubskillDispatcherOutput = {
  flow_action: StatePotionSubskillFlowAction;
  confidence: "low" | "medium" | "high";
  selected_potion: StatePotionSubskillPotionType;
  current_field_id: string | null;
  field_states: StatePotionSubskillFieldState[];
  modified_fields?: string[];
  clear_fields?: string[];
  revision: StatePotionSubskillRevisionState;
  visible_task: {
    kind: StatePotionSubskillVisibleTaskKind;
    conversation_context?: StatePotionConversationContext;
  };
  subskill_call?: {
    needed: boolean;
    skill_id: "product_help" | "status_recap" | null;
    reason: string | null;
    context_for_subskill: Record<string, unknown>;
  };
  exit_memo: {
    needed: boolean;
    reason: "none" | "topic_change" | "cancelled" | "safety";
    flow_summary: string | null;
    collected_value: string | null;
    handoff_hint_for_global_dispatcher: string | null;
  };
  note_information?: {
    needed: boolean;
    value: NoteInformation | null;
  };
  risk_assessment: SelectStatePotionRiskAssessment;
  evidence: string[];
};

export type StatePotionSubskillHandoffState = {
  flow_id: StatePotionSubskillId;
  selected_potion: StatePotionSubskillPotionType;
  potion_name: string;
  platform_destination: "section État / Potions";
  origin_bridge_context?: Record<string, unknown> | null;
  field_order: string[];
  field_states: Record<string, StatePotionSubskillFieldState>;
  current_field_id: string | null;
  last_visible_task: StatePotionSubskillVisibleTaskKind | null;
  last_handoff_delivered: boolean;
  subskill_history: Array<Record<string, unknown>>;
};

export type ClarteDispatcherOutput = {
  flow_action: ClarteFlowAction;
  confidence: "low" | "medium" | "high";
  selected_potion: "clarte";
  field_id: "plan_meaning_loss_reason";
  modified_fields?: string[];
  clear_fields?: string[];
  field_state: ClarteFieldState;
  revision: ClarteRevisionState;
  visible_task: {
    kind: ClarteVisibleTaskKind;
    conversation_context?: StatePotionConversationContext;
  };
  subskill_call?: {
    needed: boolean;
    skill_id: "product_help" | "status_recap" | null;
    reason: string | null;
    context_for_subskill: Record<string, unknown>;
  };
  exit_memo: {
    needed: boolean;
    reason: "none" | "topic_change" | "cancelled" | "safety";
    flow_summary: string | null;
    collected_value: string | null;
    handoff_hint_for_global_dispatcher: string | null;
  };
  note_information?: {
    needed: boolean;
    value: NoteInformation | null;
  };
  risk_assessment: SelectStatePotionRiskAssessment;
  evidence: string[];
};

export type ClarteHandoffState = {
  flow_id: "select_state_potion.clarte";
  selected_potion: "clarte";
  field_id: "plan_meaning_loss_reason";
  field_label:
    "Pourquoi est-ce que tu as l’impression que ton plan n’a plus de sens pour toi aujourd’hui ?";
  potion_name: "Potion de clarté";
  platform_destination: "section État / Potions";
  origin_bridge_context?: Record<string, unknown> | null;
  field_state: ClarteFieldState;
  last_visible_task: ClarteVisibleTaskKind | null;
  last_handoff_delivered: boolean;
  subskill_history: Array<Record<string, unknown>>;
};

export type StatePotionHandoffDraft = {
  operation_type: "select_state_potion";
  mode: "platform_handoff";
  executable_from_chat: false;
  user_state_summary: string;
  desired_shift_summary: string;
  recommendation: {
    potion_label: string;
    why_this_potion: string;
    immediate_step?: string | null;
    preserve: string[];
    avoid: string[];
    platform_destination: string;
    platform_steps: string[];
    platform_inputs?: {
      potion_type: string;
      potion_title: string;
      answers: Array<{
        question_id: string;
        question_label: string;
        value: string;
        option_value?: string | null;
        option_label?: string | null;
      }>;
      optional_free_text: {
        label: string;
        value: string;
      } | null;
    };
  };
  missing_decisions: string[];
};

export type SelectStatePotionSkillResult = {
  handled: boolean;
  status:
    | "ask_question"
    | "cancelled"
    | "revised"
    | "explained"
    | "handoff"
    | "blocked"
    | "failed";
  user_intent: SelectStatePotionUserIntent;
  constraints: SelectStatePotionConstraint[];
  updated_state?: SelectStatePotionIntakeState | null;
  reply: string | null;
  additional_replies?: string[];
  requested_effects: SelectStatePotionEffect[];
  allowed_effects: SelectStatePotionEffect[];
  blocked_effects: Array<{ type: string; reason_code: string }>;
  committed_effects: SelectStatePotionCommittedEffect[];
  effect_ledger: SelectStatePotionEffectLedger;
  handoff?: { target: string } | null;
  debug: {
    reason_code: string;
    evidence: string[];
  };
};
