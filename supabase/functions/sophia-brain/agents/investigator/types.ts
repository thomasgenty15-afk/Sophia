export interface CheckupItem {
  id: string;
  type: "action" | "vital" | "framework";
  action_source?: "plan" | "personal";
  title: string;
  description?: string;
  tracking_type: "boolean" | "counter";
  target?: number;
  current?: number;
  unit?: string;
  // Habitudes: planification optionnelle (jours) + contexte de bilan
  scheduled_days?: string[];
  is_scheduled_day?: boolean;
  day_scope?: "today" | "yesterday";
  is_habit?: boolean;
  // Moment de la journée pour l'action (utilisé pour calculer day_scope)
  time_of_day?: string; // "morning" | "afternoon" | "evening" | "night" | "any_time"
  // Weekly target status for habits (set during getPendingItems)
  weekly_target_status?: "below" | "at_target" | "exceeded";
  // Vital signs progression context
  previous_vital_value?: string;
  target_vital_value?: string;
}

export interface PendingIncreaseTargetOffer {
  stage: "awaiting_consent" | "awaiting_day_choice";
  action_id: string;
  action_title?: string;
  current_target?: number;
  last_item_log?: unknown;
  has_scheduled_days?: boolean;
  current_scheduled_days?: string[];
}

/**
 * Phase of an individual item in the checkup state machine.
 * Progression is strictly monotone (no backward transitions allowed).
 *
 * Flow: not_started -> awaiting_answer -> (awaiting_reason) -> logged
 */
export type ItemPhase =
  | "not_started"
  | "awaiting_answer"
  | "awaiting_reason"
  | "logged";

/**
 * Progress state for an individual checkup item.
 * Stored in investigation_state.temp_memory.item_progress[item_id]
 */
export interface ItemProgress {
  /** Current phase in the item's state machine */
  phase: ItemPhase;
  /** Type of the last question asked (for context) */
  last_question_kind?: "did_it" | "vital_value" | "ask_reason" | "clarify";
  /** Number of digressions absorbed while in awaiting_answer */
  digression_count: number;
  /** ISO timestamp when the item was logged (for idempotency) */
  logged_at?: string;
  /** Status that was logged (completed/missed/value) */
  logged_status?: string;
}

/**
 * Map of item_id to its progress state.
 */
export type ItemProgressMap = Record<string, ItemProgress>;

export interface InvestigationTempMemory {
  /** Pending offer dedicated to the weekly target increase flow. */
  pending_increase_target_offer?: PendingIncreaseTargetOffer;
  /** Cache of missed streaks by action id for the current bilan */
  missed_streaks_by_action?: Record<string, number>;
  /** Snapshot of vital progression context captured at bilan start */
  vital_progression?: Record<
    string,
    { previous_value?: string; target_value?: string }
  >;
  /**
   * Per-item progress state for the checkup state machine.
   * Tracks phase, digression count, and logged status for each item.
   * Ensures monotone progression (no backward transitions).
   */
  item_progress?: ItemProgressMap;
  /** Other fields... */
  [key: string]: unknown;
}

export interface InvestigationState {
  status: "init" | "checking" | "closing";
  pending_items: CheckupItem[];
  current_item_index: number;
  temp_memory: InvestigationTempMemory;
  /** ISO timestamp of when the bilan was started (used for auto-expiration). */
  started_at?: string;
}

export type InvestigatorTurnResult = {
  content: string;
  investigationComplete: boolean;
  newState: any;
};
