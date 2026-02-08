import type { DeepReasonsPattern } from "../architect/deep_reasons_types.ts";

export interface CheckupItem {
  id: string;
  type: "action" | "vital" | "framework";
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

/**
 * @deprecated Use deferred_topics_v2 system instead.
 * Deep reasons deferred during bilan - will be explored after.
 */
export interface DeepReasonsDeferred {
  action_id: string;
  action_title: string;
  detected_pattern: DeepReasonsPattern;
  user_words: string;
  created_at: string;
}

/**
 * Consents for machines that will be launched after the bilan.
 * Each machine has its own indicator for whether the user confirmed.
 */
export interface BilanDeferConsents {
  /** Deep reasons exploration consent */
  explore_deep_reasons?: {
    action_id: string;
    action_title: string;
    user_words?: string;
    confirmed: boolean | null; // null = awaiting confirmation
  };
  /** Breakdown action consent (one per action) */
  breakdown_action?: {
    [action_id: string]: {
      action_title: string;
      streak_days: number;
      confirmed: boolean | null;
    };
  };
  /** Topic exploration consent */
  topic_exploration?: {
    topic_hint: string;
    confirmed: boolean | null;
  };
}

/**
 * Pending defer question to be asked in the next investigator message.
 */
export interface PendingDeferQuestion {
  machine_type: "deep_reasons" | "breakdown" | "topic";
  action_id?: string;
  action_title?: string;
  streak_days?: number;
  topic_hint?: string;
}

/**
 * Phase of an individual item in the checkup state machine.
 * Progression is strictly monotone (no backward transitions allowed).
 *
 * Flow: not_started -> awaiting_answer -> (awaiting_reason) -> logged
 * With optional "parenthesis" states for breakdown offers.
 */
export type ItemPhase =
  | "not_started"
  | "awaiting_answer"
  | "awaiting_reason"
  | "logged"
  | "breakdown_offer_pending";

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

/**
 * Extended temp_memory type for InvestigationState
 *
 * NOTE: Several fields are deprecated as of the Investigator Deferred Unification refactor:
 * - deferred_topics: Now uses global deferred_topics_v2 system
 * - breakdown: Breakdown flow removed from Investigator, handled post-bilan by Architect
 * - deep_reasons_deferred: Now uses global deferred_topics_v2 system
 */
export interface InvestigationTempMemory {
  /** @deprecated Use deferred_topics_v2 in global temp_memory instead */
  deferred_topics?: unknown[];
  /** @deprecated Breakdown flow removed from Investigator */
  breakdown?: {
    stage: string;
    action_id: string;
    action_title?: string;
    streak_days?: number;
    problem?: string;
    proposed_action?: unknown;
    apply_to_plan?: boolean;
  };
  /** @deprecated Breakdown flow removed from Investigator */
  breakdown_declined_action_ids?: string[];
  /** @deprecated Use deferred_topics_v2 with machine_type="deep_reasons" instead */
  deep_reasons_deferred?: DeepReasonsDeferred;
  /** Pending post-bilan consent offer (micro-étape / exploration / increase target / activate action) */
  bilan_defer_offer?: {
    stage: "awaiting_consent";
    kind:
      | "breakdown"
      | "deep_reasons"
      | "increase_target"
      | "activate_action"
      | "delete_action"
      | "deactivate_action";
    action_id: string;
    action_title?: string;
    streak_days?: number;
    current_target?: number;
    last_note?: string;
    last_item_log?: unknown;
  };
  /** Router-provided override for pending offer consent (hybrid with dispatcher signals). */
  bilan_offer_resolution_override?: {
    kind:
      | "breakdown"
      | "deep_reasons"
      | "increase_target"
      | "activate_action"
      | "delete_action"
      | "deactivate_action";
    confirmed: boolean;
    source: "dispatcher";
    set_at: string;
  };
  /** Cache of missed streaks by action id for the current bilan */
  missed_streaks_by_action?: Record<string, number>;
  /** Snapshot of vital progression context captured at bilan start */
  vital_progression?: Record<
    string,
    { previous_value?: string; target_value?: string }
  >;
  /** Consents collected during bilan for machines to launch after */
  bilan_defer_consents?: BilanDeferConsents;
  /** Pending defer question to inject into next investigator prompt */
  pending_defer_question?: PendingDeferQuestion;
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
