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
  | "platform_destination_followup"
  | "apply_attempt"
  | "repeat_handoff"
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
  | "safety";

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

export type ClarteDispatcherOutput = {
  flow_action: ClarteFlowAction;
  confidence: "low" | "medium" | "high";
  selected_potion: "clarte";
  field_id: "plan_meaning_loss_reason";
  field_state: ClarteFieldState;
  revision: ClarteRevisionState;
  visible_task: {
    kind: ClarteVisibleTaskKind;
    required_data: {
      potion_name: "Potion de clarté";
      field_label:
        "Pourquoi est-ce que tu as l’impression que ton plan n’a plus de sens pour toi aujourd’hui ?";
      field_value: string | null;
      platform_destination: "section État / Potions";
    };
  };
  exit_memo: {
    needed: boolean;
    reason: "none" | "topic_change" | "cancelled" | "safety";
    flow_summary: string | null;
    collected_value: string | null;
    handoff_hint_for_global_dispatcher: string | null;
  };
  no_chat_mutation: {
    potion_session_created: false;
    recurring_reminder_created: false;
    scheduled_checkin_created: false;
    executable_confirmation_generated: false;
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
  field_state: ClarteFieldState;
  last_visible_task: ClarteVisibleTaskKind | null;
  last_handoff_delivered: boolean;
};

export type StatePotionHandoffDraft = {
  operation_type: "select_state_potion";
  mode: "platform_handoff";
  no_chat_mutation: true;
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
