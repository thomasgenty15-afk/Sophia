export type AttackCardHandoffStatus =
  | "collecting"
  | "clarifying"
  | "handoff_ready"
  | "handoff_delivered"
  | "revise_handoff"
  | "repeat_handoff"
  | "apply_attempt"
  | "cancelled"
  | "topic_change"
  | "blocked";

export type AttackCardPlatformFlowKind =
  | "free_attack_card"
  | "plan_action_cards"
  | "adjust_existing_attack_card";

export type AttackCardTechniqueKey =
  | "texte_recadrage"
  | "mantra_force"
  | "ancre_visuelle"
  | "visualisation_matinale"
  | "preparer_terrain"
  | "pre_engagement";

export type AttackCardDraftV1 = {
  operation_type: "prepare_attack_card";
  output_schema: "attack_card_draft_v1";
  draft: {
    title: string;
    target_label: string;
    technique: AttackCardTechniqueKey;
    technique_title: string;
    instruction: string;
    generated_asset: string;
    activation_keyword?: string | null;
    supporting_points: string[];
    mode_emploi: string;
    why_it_helps: string;
  };
  confirmation_message: string;
  confirmation_actions: ["yes", "no"];
};

export type AttackCardPlatformFieldId =
  | "negotiated_action"
  | "recurring_excuse"
  | "desired_reframe_state"
  | "effort_target"
  | "importance_reason"
  | "mantra_tone"
  | "commitment_to_keep_alive"
  | "anchor_location"
  | "visual_phrase"
  | "visualized_action"
  | "morning_window"
  | "helpful_sensations"
  | "action_to_simplify"
  | "prep_in_advance"
  | "ready_environment"
  | "risk_situation"
  | "protected_value";

export type AttackCardPlatformFieldStatus =
  | "missing"
  | "proposed"
  | "locked";

export type AttackCardPlatformFieldProgress = {
  field_id: AttackCardPlatformFieldId;
  technique_key: AttackCardTechniqueKey;
  question: string;
  required: true;
  status: AttackCardPlatformFieldStatus;
  proposed_value?: string | null;
  locked_value?: string | null;
  user_evidence: string[];
  needs_user_confirmation: boolean;
  evidence: string[];
};

export type AttackCardPlatformFieldState = {
  technique_key: AttackCardTechniqueKey;
  status: "missing" | "partial" | "complete";
  fields: AttackCardPlatformFieldProgress[];
  missing_field_ids: AttackCardPlatformFieldId[];
};

export type AttackCardPlatformInput = {
  field_id?: AttackCardPlatformFieldId;
  question: string;
  suggested_answer: string;
  value?: string;
  status?: "locked" | "proposed";
};

export type AttackCardKeywordTriggerDraft = {
  activation_keyword: string;
  risk_situation: string;
  strength_anchor: string;
  first_response_intent: string;
  assistant_prompt: string;
};

export type AttackCardExpectedGeneratedResult = {
  output_title: string;
  generated_asset: string;
  supporting_points: string[];
  mode_emploi: string;
  keyword_trigger?: AttackCardKeywordTriggerDraft | null;
};

export type AttackCardPlatformHandoff = {
  flow_kind: AttackCardPlatformFlowKind;
  surface_label: string;
  destination: string;
  steps: string[];
  technique_key?: AttackCardTechniqueKey | null;
  technique_label?: string | null;
  inputs: AttackCardPlatformInput[];
  expected_result?: AttackCardExpectedGeneratedResult | null;
  plan_action_note?: string | null;
};

export type AttackCardHandoffDraft = {
  operation_type: "prepare_attack_card";
  mode: "platform_handoff";
  no_chat_mutation: true;
  executable_from_chat: false;
  target_summary: string;
  blocker_summary: string;
  recommendation: {
    technique_label: string;
    why_this_technique: string;
    card_draft_summary: string;
    preserve: string[];
    avoid: string[];
    platform_destination: string;
    platform_steps: string[];
  };
  platform_handoff?: AttackCardPlatformHandoff;
  missing_decisions: string[];
};
