import type { RecurringReminderDraftV1 } from "./generator.ts";
import type { RecurringReminderIntakeState } from "./intake.ts";

export type CreateRecurringReminderUserIntent =
  | "start"
  | "provide_slot"
  | "draft_only"
  | "create"
  | "cancel"
  | "reject"
  | "revise"
  | "explain"
  | "topic_change"
  | "status_question"
  | "one_shot_handoff"
  | "clarify"
  | "unknown";

export type CreateRecurringReminderConstraint = {
  kind:
    | "recurring_only"
    | "no_one_shot"
    | "no_create"
    | "draft_only"
    | "base_de_vie"
    | "current_plan"
    | "exact_text"
    | "no_plan_binding";
  value?: unknown;
  evidence: string[];
};

export type CreateRecurringReminderHandoffTarget =
  | "create_one_shot_reminder"
  | null;

export type RecurringReminderHandoffStatus =
  | "collecting"
  | "clarifying"
  | "handoff_ready"
  | "handoff_delivered"
  | "revise_handoff"
  | "repeat_handoff"
  | "apply_attempt"
  | "handoff_to_one_shot"
  | "cancelled"
  | "topic_change"
  | "blocked";

export type RecurringReminderHandoffDraft = {
  operation_type: "create_recurring_reminder";
  mode: "platform_handoff";
  no_chat_mutation: true;
  executable_from_chat: false;
  reminder_summary: string;
  cadence_summary: string;
  time_summary?: string | null;
  content_summary: string;
  recommendation: {
    platform_destination: string;
    platform_steps: string[];
    preserve: string[];
    avoid: string[];
  };
  missing_decisions: string[];
};

export type RecurringReminderHandoffState = {
  skill_id: "create_recurring_reminder";
  mode: "platform_handoff";
  status: RecurringReminderHandoffStatus;
  draft?: RecurringReminderHandoffDraft | null;
  turn_count: number;
  max_turns: number;
  created_at: string;
  updated_at: string;
  no_chat_mutation: true;
};

export type CreateRecurringReminderEffect = {
  type: "create_recurring_reminder";
  operation_id: string;
  draft: RecurringReminderDraftV1;
};

export type CreateRecurringReminderCommittedEffect = {
  type: "create_recurring_reminder";
  operation_id: string;
  recurring_reminder_id: string;
  message: string;
  frequency: RecurringReminderDraftV1["draft"]["frequency"];
  days: string[];
  time: string;
  timezone: string;
  destination: RecurringReminderDraftV1["draft"]["destination"];
  target_binding?: RecurringReminderDraftV1["draft"]["target_binding"];
};

export type CreateRecurringReminderSkillResult = {
  handled: boolean;
  status:
    | "ask_question"
    | "draft_ready"
    | "handoff_ready"
    | "handoff_delivered"
    | "revise_handoff"
    | "repeat_handoff"
    | "apply_attempt"
    | "cancelled"
    | "revised"
    | "explained"
    | "handoff_to_one_shot"
    | "blocked"
    | "executed"
    | "failed";
  user_intent: CreateRecurringReminderUserIntent;
  updated_state?: RecurringReminderIntakeState | null;
  reply: string | null;
  requested_effects: CreateRecurringReminderEffect[];
  allowed_effects: CreateRecurringReminderEffect[];
  committed_effects: CreateRecurringReminderCommittedEffect[];
  blocked_effects: Array<{ type: string; reason_code: string }>;
  pending_confirmation?: Record<string, unknown> | null;
  debug: {
    reason_code: string;
    evidence: string[];
  };
};
