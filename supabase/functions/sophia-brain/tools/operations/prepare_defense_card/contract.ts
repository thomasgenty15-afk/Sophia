export type DefenseCardPlatformFieldId = "support_need";

export type DefenseCardPlatformFieldProgress = {
  field_id: DefenseCardPlatformFieldId;
  question_label: string;
  required: true;
  status: "missing" | "proposed" | "locked";
  proposed_value: string | null;
  locked_value: string | null;
  user_evidence: string[];
  needs_user_confirmation: boolean;
  evidence: string[];
};

export type DefenseCardPlatformFieldState = {
  route_kind: "free_card" | "plan_item_card";
  status: "missing" | "partial" | "complete";
  missing_field_ids: DefenseCardPlatformFieldId[];
  fields: DefenseCardPlatformFieldProgress[];
};

export type DefenseCardHandoffStatus =
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

export type DefenseCardHandoffDraft = {
  operation_type: "prepare_defense_card";
  mode: "platform_handoff";
  executable_from_chat: false;
  target_summary: string;
  risk_summary: string;
  prepared_fields?: {
    risk_context: string | null;
    defense_action: string | null;
    ritual_phrase: string | null;
  } | null;
  platform_flow: {
    route_kind: "free_card" | "plan_item_card";
    route_label: string;
    questionnaire_answers: Array<{
      field_id: DefenseCardPlatformFieldId;
      question_label: string;
      value: string;
      status: "locked" | "proposed";
    }>;
  };
  platform_fields?: DefenseCardPlatformFieldState | null;
  recommendation: {
    platform_destination: string;
    platform_steps: string[];
    defense_strategy_label?: string;
    why_this_strategy?: string;
    card_draft_summary?: string;
    preserve?: string[];
    avoid?: string[];
  };
  missing_decisions: string[];
};

export type DefenseCardHandoffState = {
  operation_type?: "prepare_defense_card";
  skill_id: "prepare_defense_card";
  mode: "platform_handoff";
  status: DefenseCardHandoffStatus;
  draft?: DefenseCardHandoffDraft | null;
  local_state?: unknown;
  turn_count: number;
  max_turns: number;
  created_at: string;
  updated_at: string;
  executable_from_chat: false;
  operation_input?: Record<string, unknown> | null;
};

export function isDefenseCardHandoffState(
  value: unknown,
): value is DefenseCardHandoffState {
  const record = value as any;
  return Boolean(
    record &&
      typeof record === "object" &&
      record.skill_id === "prepare_defense_card" &&
      record.mode === "platform_handoff" &&
      record.executable_from_chat === false,
  );
}
