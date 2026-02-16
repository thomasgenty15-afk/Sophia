/**
 * Item Progress State Machine
 * 
 * Tracks the phase of each item during a checkup (bilan).
 * Ensures monotone progression (no backward transitions).
 */

import type { InvestigationState, ItemProgress, ItemProgressMap, CheckupItem } from "./types.ts"

// ═══════════════════════════════════════════════════════════════════════════════
// ITEM PROGRESS STATE MACHINE HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get item progress from state, initializing if needed.
 */
export function getItemProgress(state: InvestigationState, itemId: string): ItemProgress {
  const existing = state.temp_memory?.item_progress?.[itemId]
  if (existing) return existing
  return { phase: "not_started", digression_count: 0 }
}

/**
 * Update item progress in state (immutable).
 * Enforces monotone progression - cannot go backwards.
 */
export function updateItemProgress(
  state: InvestigationState,
  itemId: string,
  update: Partial<ItemProgress>,
): InvestigationState {
  const current = getItemProgress(state, itemId)
  const newProgress: ItemProgress = { ...current, ...update }
  
  // Enforce monotone progression
  const phaseOrder = ["not_started", "awaiting_answer", "awaiting_reason", "logged"]
  const currentIdx = phaseOrder.indexOf(current.phase)
  const newIdx = phaseOrder.indexOf(newProgress.phase)

  if (newIdx < currentIdx) {
    console.warn(`[Investigator] BLOCKED backward phase transition: ${current.phase} -> ${newProgress.phase}`)
    return state // Refuse backward transition
  }
  
  const newItemProgress: ItemProgressMap = {
    ...(state.temp_memory?.item_progress ?? {}),
    [itemId]: newProgress,
  }
  
  return {
    ...state,
    temp_memory: {
      ...(state.temp_memory ?? {}),
      item_progress: newItemProgress,
    },
  }
}

/**
 * Initialize item_progress for all items at bilan start.
 */
export function initializeItemProgress(items: CheckupItem[]): ItemProgressMap {
  const progress: ItemProgressMap = {}
  for (const item of items) {
    progress[item.id] = { phase: "not_started", digression_count: 0 }
  }
  return progress
}

