import type { DeepReasonsPattern } from "../architect/deep_reasons_types.ts"

export interface CheckupItem {
  id: string
  type: "action" | "vital" | "framework"
  title: string
  description?: string
  tracking_type: "boolean" | "counter"
  target?: number
  current?: number
  unit?: string
  // Habitudes: planification optionnelle (jours) + contexte de bilan
  scheduled_days?: string[]
  is_scheduled_day?: boolean
  day_scope?: "today" | "yesterday"
  is_habit?: boolean
}

/**
 * @deprecated Use deferred_topics_v2 system instead.
 * Deep reasons deferred during bilan - will be explored after.
 */
export interface DeepReasonsDeferred {
  action_id: string
  action_title: string
  detected_pattern: DeepReasonsPattern
  user_words: string
  created_at: string
}

/**
 * Consents for machines that will be launched after the bilan.
 * Each machine has its own indicator for whether the user confirmed.
 */
export interface BilanDeferConsents {
  /** Deep reasons exploration consent */
  explore_deep_reasons?: {
    action_id: string
    action_title: string
    user_words?: string
    confirmed: boolean | null  // null = awaiting confirmation
  }
  /** Breakdown action consent (one per action) */
  breakdown_action?: {
    [action_id: string]: {
      action_title: string
      streak_days: number
      confirmed: boolean | null
    }
  }
  /** Topic exploration consent */
  topic_exploration?: {
    topic_hint: string
    confirmed: boolean | null
  }
}

/**
 * Pending defer question to be asked in the next investigator message.
 */
export interface PendingDeferQuestion {
  machine_type: "deep_reasons" | "breakdown" | "topic"
  action_id?: string
  action_title?: string
  streak_days?: number
  topic_hint?: string
}

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
  deferred_topics?: unknown[]
  /** @deprecated Breakdown flow removed from Investigator */
  breakdown?: {
    stage: string
    action_id: string
    action_title?: string
    streak_days?: number
    problem?: string
    proposed_action?: unknown
    apply_to_plan?: boolean
  }
  /** @deprecated Breakdown flow removed from Investigator */
  breakdown_declined_action_ids?: string[]
  /** @deprecated Use deferred_topics_v2 with machine_type="deep_reasons" instead */
  deep_reasons_deferred?: DeepReasonsDeferred
  /** Pending post-bilan consent offer (micro-étape / exploration) */
  bilan_defer_offer?: {
    stage: "awaiting_consent"
    kind: "breakdown" | "deep_reasons"
    action_id: string
    action_title?: string
    streak_days?: number
    last_note?: string
    last_item_log?: unknown
  }
  /** Cache of missed streaks by action id for the current bilan */
  missed_streaks_by_action?: Record<string, number>
  /** Consents collected during bilan for machines to launch after */
  bilan_defer_consents?: BilanDeferConsents
  /** Pending defer question to inject into next investigator prompt */
  pending_defer_question?: PendingDeferQuestion
  /** Other fields... */
  [key: string]: unknown
}

export interface InvestigationState {
  status: "init" | "checking" | "closing"
  pending_items: CheckupItem[]
  current_item_index: number
  temp_memory: InvestigationTempMemory
}

export type InvestigatorTurnResult = {
  content: string
  investigationComplete: boolean
  newState: any
}



