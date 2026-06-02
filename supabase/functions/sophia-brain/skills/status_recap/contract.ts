export type StatusRecapIntent =
  | "durable_status"
  | "object_status"
  | "recent_effects_recap"
  | "fait_prevu_fragile"
  | "cancelled_objects"
  | "coach_preferences_status"
  | "human_recap_no_db"
  | "unclear";

export type StatusRecapObjectType =
  | "attack_card"
  | "defense_card"
  | "one_shot_reminder"
  | "recurring_reminder"
  | "potion"
  | "coach_preference"
  | "plan_item"
  | "memory"
  | "unknown";

export type StatusRecapConstraint =
  | "non_mutating"
  | "db_grounded"
  | "do_not_execute_tool"
  | "do_not_claim_without_source"
  | "do_not_render_product_how_to"
  | "do_not_preempt_explicit_tool_command"
  | "short_reply"
  | "format_fait_prevu_fragile";

export type StatusRecapProjection = {
  attack_cards: Array<{
    id: string;
    title: string;
    status: string;
    generated_at: string | null;
  }>;
  defense_cards: Array<{
    id: string;
    title: string;
    status: string;
    generated_at: string | null;
  }>;
  one_shot_reminders: {
    pending: Array<{
      id: string;
      scheduled_for: string;
      local_time: string | null;
      instruction: string;
    }>;
    cancelled_recent: Array<{
      id: string;
      scheduled_for: string | null;
      local_time: string | null;
      instruction: string;
      updated_at: string | null;
    }>;
  };
  recurring_reminders: Array<{
    id: string;
    status: string;
    cadence_label: string | null;
    instruction: string | null;
  }>;
  potion_sessions: Array<{
    id: string;
    potion_type: string;
    status: string;
    created_at: string | null;
  }>;
  coach_preferences: Array<{
    key: string;
    value: unknown;
    reason: string | null;
    source_type: string | null;
    updated_at: string | null;
  }>;
  recent_effect_history: Array<{
    status:
      | "requested"
      | "allowed"
      | "committed"
      | "failed"
      | "blocked"
      | "proposed"
      | "delivered"
      | "cancelled"
      | "superseded"
      | "asked"
      | "resolved"
      | "topic_change";
    effect_type: string;
    created_at: string;
    reason_code: string | null;
  }>;
};

export type StatusRecapDecision = {
  skill_id: "status_recap";
  intent: StatusRecapIntent;
  target_objects: StatusRecapObjectType[];
  constraints: StatusRecapConstraint[];
  projection_used: boolean;
  missing_sources: string[];
  response_contract: {
    max_questions: 0 | 1;
    format: "compact" | "fait_prevu_fragile" | "object_answer" | "recap";
    allow_human_context_lines: boolean;
  };
  operation_suggestions: [];
  reply: string;
};

export type StatusRecapDecisionDraft = Omit<StatusRecapDecision, "reply">;

export const STATUS_RECAP_MIGRATION_STATUS = {
  standard_target:
    "contract -> structured_intake -> reducer -> response/effects -> renderer",
  current_shape:
    "contract -> DB/effect projection -> deterministic reducer -> renderer",
  documented_exception:
    "none: activation and target selection must come from structured routing signals, not deterministic message guards.",
  durable_effect_policy: "never_mutates",
} as const;
