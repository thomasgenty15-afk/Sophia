import type { RecurringReminderDraftV1 } from "./generator.ts";
import type { RecurringReminderIntakeState } from "./intake.ts";
import type { NoteInformation } from "../../../contracts/note_information.v1.ts";

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

export type CreateRecurringReminderLocalFlowAction =
  | "answer_or_update_slots"
  | "ask_recurrence"
  | "ask_time"
  | "ask_content"
  | "ask_destination_binding"
  | "clarify_one_shot_vs_recurring"
  | "handoff_ready"
  | "revise_handoff"
  | "repeat_handoff"
  | "platform_destination_followup"
  | "apply_attempt"
  | "handoff_to_one_shot"
  | "get_info_product"
  | "get_info_db"
  | "exit_to_global_dispatcher"
  | "cancel_flow"
  | "exit_to_global_dispatcher"
  | "safety_preempt";

export type CreateRecurringReminderVisibleTaskKind =
  | "ask_recurrence"
  | "ask_time"
  | "ask_content"
  | "ask_destination_binding"
  | "clarify_one_shot_vs_recurring"
  | "handoff_ready"
  | "revise_handoff"
  | "repeat_handoff"
  | "platform_destination_followup"
  | "apply_attempt"
  | "handoff_to_one_shot"
  | "inline_tool_return"
  | "stop_or_cancel"
  | "exit_ack"
  | "safety"
  | "contract_recovery";

export type CreateRecurringReminderNoteInformation =
  & Omit<
    NoteInformation,
    | "source_flow_id"
    | "handoff_reason"
    | "target_dispatcher"
    | "handoff_context_for_next_dispatcher"
  >
  & {
    needed: boolean;
    source_flow_id: "create_recurring_reminder";
    handoff_reason:
      | "topic_change"
      | "safety"
      | "inline_tool"
      | "one_shot_boundary"
      | "flow_interruption"
      | "none";
    target_dispatcher:
      | "global"
      | "safety_crisis"
      | "one_shot_reminder"
      | "product_help"
      | "status_recap"
      | null;
    handoff_context_for_next_dispatcher: string | null;
  };

export type CreateRecurringReminderFieldStatus =
  | "missing"
  | "ambiguous"
  | "identified";

export type CreateRecurringReminderLocalFields = {
  recurrence: {
    status: CreateRecurringReminderFieldStatus;
    frequency:
      | "daily"
      | "weekly"
      | "specific_days"
      | "weekdays"
      | "custom"
      | null;
    days: string[];
    time: string | null;
    timezone: string | null;
    cadence_label: string | null;
    confidence: "low" | "medium" | "high";
    evidence: string[];
  };
  reminder_content: {
    status: CreateRecurringReminderFieldStatus;
    message: string | null;
    subject_hint: string | null;
    confidence: "low" | "medium" | "high";
    evidence: string[];
  };
  destination: {
    status: CreateRecurringReminderFieldStatus;
    value: "base_de_vie" | "current_plan" | null;
    related_plan_item_id: string | null;
    target_kind:
      | "none"
      | "transformation"
      | "plan_item"
      | "action_family"
      | null;
    target_plan_item_id: string | null;
    target_action_family_key: string | null;
    target_generated_temp_id: string | null;
    target_binding_policy:
      | "none"
      | "snapshot"
      | "live_action"
      | "live_action_family"
      | null;
    target_lifecycle_policy:
      | "independent"
      | "while_target_active"
      | "while_family_in_current_plan"
      | null;
    target_label: string | null;
    confidence: "low" | "medium" | "high";
    evidence: string[];
  };
};

export type CreateRecurringReminderConversationContext = {
  source_flow: "create_recurring_reminder";
  stage_goal: string;
  current_user_message_summary: string | null;
  active_flow_summary: string;
  collected_state: Record<string, unknown>;
  known_values: Record<string, unknown>;
  missing_or_weak_values: string[];
  question_to_ask: string | null;
  handoff: Record<string, unknown>;
  inline_tool_result: Record<string, unknown> | null;
  note_information_summary: Record<string, unknown> | null;
  unresolved_questions: string[];
  evidence_used: string[];
  tone_constraints: string[];
  do_not_say: string[];
};

export type CreateRecurringReminderVisibleTask = {
  kind: CreateRecurringReminderVisibleTaskKind;
  conversation_context: CreateRecurringReminderConversationContext;
};

export type CreateRecurringReminderLocalDispatcherOutput = {
  flow_action: CreateRecurringReminderLocalFlowAction;
  confidence: "low" | "medium" | "high";
  risk_score: number;
  recurring_state: {
    phase:
      | "intake"
      | "recurrence_resolution"
      | "content_intake"
      | "destination_binding"
      | "handoff_ready"
      | "handoff_delivered"
      | "revision"
      | "inline_tool"
      | "exit";
    user_intent: CreateRecurringReminderUserIntent;
    summary: string;
    user_words: string[];
    one_shot_conflict: "none" | "ambiguous" | "clear_one_shot";
    minimum_fields_ready: boolean;
  };
  fields: CreateRecurringReminderLocalFields;
  missing_fields: Array<
    "recurrence" | "time" | "message" | "destination" | "binding_boundary"
  >;
  handoff_draft: {
    ready: boolean;
    reminder_summary: string | null;
    cadence_summary: string | null;
    time_summary: string | null;
    content_summary: string | null;
    platform_destination: string | null;
    preserve: string[];
    avoid: string[];
  };
  inline_tool: {
    requested: boolean;
    tool_name: "get_info_product" | "get_info_db" | null;
    question_to_answer: string | null;
    active_flow_context: string | null;
  };
  visible_task: CreateRecurringReminderVisibleTask;
  note_information: CreateRecurringReminderNoteInformation;
  evidence: string[];
};

export type RecurringReminderHandoffDraft = {
  operation_type: "create_recurring_reminder";
  mode: "platform_handoff";
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
  fields?: CreateRecurringReminderLocalFields | null;
  last_visible_task?: CreateRecurringReminderVisibleTask | null;
  note_information?: CreateRecurringReminderNoteInformation | null;
  turn_count: number;
  max_turns: number;
  created_at: string;
  updated_at: string;
  executable_from_chat: false;
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
