import type { PotionSessionDraftV1 } from "./generator.ts";
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

export type SelectStatePotionEffect = {
  type: "activate_state_potion";
  operation_id: string;
  draft: PotionSessionDraftV1;
  suppress_follow_up_scheduling: boolean;
};

export type SelectStatePotionCommittedEffect = {
  type: "activate_state_potion";
  operation_id: string;
  potion_session_id: string;
  recurring_reminder_id: string | null;
  scheduled_checkin_ids: string[];
};

export type SelectStatePotionEffectLedger = {
  requested_effects: SelectStatePotionEffect[];
  allowed_effects: SelectStatePotionEffect[];
  blocked_effects: Array<{ type: string; reason_code: string }>;
  committed_effects: SelectStatePotionCommittedEffect[];
};

export type SelectStatePotionSkillResult = {
  handled: boolean;
  status:
    | "ask_question"
    | "pending_confirmation"
    | "cancelled"
    | "revised"
    | "explained"
    | "handoff"
    | "blocked"
    | "executed"
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
  pending_confirmation?: Record<string, unknown> | null;
  handoff?: { target: string } | null;
  debug: {
    reason_code: string;
    evidence: string[];
  };
};
