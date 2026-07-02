export type OneShotReminderIntent =
  | "create"
  | "cancel"
  | "replace"
  | "status"
  | "status_question"
  | "modify_request"
  | "answer_product_question"
  | "product_help"
  | "ignore"
  | "off_topic"
  | "unclear";

export type OneShotReminderStatus =
  | "collecting"
  | "ready_to_execute"
  | "blocked"
  | "executed"
  | "cancelled"
  | "failed"
  | "no_reminder_found";

export type OneShotReminderConstraint =
  | "requires_explicit_time"
  | "requires_instruction"
  | "do_not_mutate"
  | "no_tool"
  | "status_only"
  | "product_help"
  | "safety_blocks"
  | "no_done_language_without_commit";

export type OneShotReminderDirectEffectTool =
  | "create_one_shot_reminder"
  | "cancel_one_shot_reminder"
  | "replace_one_shot_reminder";

export type OneShotReminderEffect = {
  type: OneShotReminderDirectEffectTool;
  reason_code?: string;
  scheduled_for?: string;
  local_label?: string;
  reminder_instruction?: string;
  target_reminder_ids?: string[];
  target_local_labels?: string[];
  request_text?: string;
};

export type OneShotReminderCommittedEffect = {
  type: OneShotReminderDirectEffectTool;
  id?: string;
  ids?: string[];
  scheduled_for?: string;
  local_label?: string;
  reminder_instruction?: string;
  target_reminder_ids?: string[];
  target_local_labels?: string[];
};

export type OneShotReminderFailedEffect = {
  type: OneShotReminderDirectEffectTool;
  reason_code: string;
  error_message?: string;
};

export type OneShotReminderBlockedEffect = {
  type: OneShotReminderDirectEffectTool | string;
  reason_code: string;
};

export type OneShotReminderEffectPlan = {
  requested_effects: OneShotReminderEffect[];
  allowed_effects: OneShotReminderEffect[];
  blocked_effects: OneShotReminderBlockedEffect[];
  reason_code: string;
};

export type OneShotReminderState = {
  intent: OneShotReminderIntent;
  status: OneShotReminderStatus;
  scheduled_for: string | null;
  local_label: string | null;
  reminder_instruction: string | null;
  target_reminder_ids: string[];
  target_local_labels: string[];
  missing_slots: Array<
    "scheduled_for" | "reminder_instruction" | "target_reminder"
  >;
  constraints: OneShotReminderConstraint[];
  effect_plan: OneShotReminderEffectPlan;
  committed_effects: OneShotReminderCommittedEffect[];
  blocked_effects: OneShotReminderBlockedEffect[];
  reply: string | null;
};

export type OneShotReminderDirectEffectResult = {
  detected: boolean;
  intent: OneShotReminderIntent;
  status:
    | "success"
    | "cancelled"
    | "replaced"
    | "needs_clarify"
    | "blocked"
    | "no_reminder"
    | "failed"
    | "ignored";
  reply: string | null;
  requested_effects: OneShotReminderEffect[];
  allowed_effects: OneShotReminderEffect[];
  attempted_effects: OneShotReminderDirectEffectTool[];
  /**
   * Backward-compatible committed tool list. New code should prefer
   * attempted_effects for attempts and committed_effects for durable writes.
   */
  executed_tools: OneShotReminderDirectEffectTool[];
  committed_effects: OneShotReminderCommittedEffect[];
  blocked_effects: OneShotReminderBlockedEffect[];
  constraints: OneShotReminderConstraint[];
  scheduled_for: string | null;
  local_label: string | null;
  reminder_instruction: string | null;
  target_reminder_ids: string[];
  missing_slots: OneShotReminderState["missing_slots"];
  debug: {
    reason_code: string;
    parse_source?: string;
  };
};

export type OneShotReminderToolOutcome =
  | {
    detected: false;
  }
  | {
    detected: true;
    status: "needs_clarify";
    reason:
      | "missing_time"
      | "past_time"
      | "unsupported_time"
      | "duplicate_pending";
    user_message: string;
  }
  | {
    detected: true;
    status: "failed";
    reason: "insert_failed";
    user_message: string;
    error_message: string;
  }
  | {
    detected: true;
    status: "success";
    user_message: string;
    scheduled_for: string;
    scheduled_for_local_label: string;
    reminder_instruction: string;
    event_context: string;
    inserted_checkin_id: string;
    parse_source?:
      | "strict_absolute"
      | "local_parser"
      | "ai_fallback"
      | "payload"
      | "payload_utc_time"
      | "unknown";
  };

export type CancelOneShotReminderOutcome =
  | { detected: false }
  | {
    detected: true;
    status: "no_reminder";
    user_message: string;
  }
  | {
    detected: true;
    status: "failed";
    reason: string;
    user_message: string;
    error_message: string;
  }
  | {
    detected: true;
    status: "cancelled";
    cancelled_count: number;
    cancelled_local_labels: string[];
    cancelled_ids?: string[];
    user_message: string;
  };

export type CreateOneShotReminderV2Outcome =
  | OneShotReminderToolOutcome
  | {
    detected: true;
    status: "blocked";
    reason:
      | "safety_high"
      | "pending_confirmation_active"
      | "duplicate_source_message"
      | "duplicate_db";
    user_message: string;
  };

export type CreateOneShotReminderV2Write = (input: {
  user_id: string;
  scheduled_for: string;
  reminder_instruction: string;
  event_context: string;
  request_text: string;
  timezone: string;
  idempotency_key: string;
}) => Promise<{
  inserted_checkin_id: string;
  scheduled_for?: string;
  event_context?: string;
}>;
