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
 * Extended temp_memory type for InvestigationState
 */
export interface InvestigationTempMemory {
  /** Topics deferred during bilan (can be string or EnrichedDeferredTopic) */
  deferred_topics?: unknown[]
  /** Breakdown flow state */
  breakdown?: {
    stage: string
    action_id: string
    action_title?: string
    streak_days?: number
    problem?: string
    proposed_action?: unknown
    apply_to_plan?: boolean
  }
  /** Action IDs where user declined breakdown */
  breakdown_declined_action_ids?: string[]
  /** Deep reasons exploration deferred for after bilan */
  deep_reasons_deferred?: DeepReasonsDeferred
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



