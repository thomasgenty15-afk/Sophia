import type { NewSignalEntry, SignalEnrichment, SignalHistoryEntry } from "./dispatcher.ts"

export interface SignalHistoryState {
  entries: SignalHistoryEntry[]
  last_turn_index: number
}

export function getSignalHistory(tempMemory: any, key: string): SignalHistoryEntry[] {
  const state = (tempMemory as any)?.[key] as SignalHistoryState | undefined
  return state?.entries ?? []
}

export function updateSignalHistory(opts: {
  tempMemory: any
  key: string
  minTurnIndex: number
  newSignals: NewSignalEntry[]
  enrichments: SignalEnrichment[]
  activeMachine: string | null
  machineMatchesSignalType: (machineType: string | null, signalType: string) => boolean
}): { tempMemory: any; prunedCount: number } {
  const state = (opts.tempMemory as any)?.[opts.key] as SignalHistoryState | undefined
  const current = state?.entries ?? []
  const turnIndex = (state?.last_turn_index ?? 0) + 1

  // Age existing entries (decrement turn_index)
  let entries = current.map(e => ({ ...e, turn_index: e.turn_index - 1 }))

  // Prune old entries (keep last N turns)
  const beforeCount = entries.length
  entries = entries.filter(e => e.turn_index >= opts.minTurnIndex)
  const prunedCount = beforeCount - entries.length

  // Apply enrichments to existing entries
  for (const enrich of opts.enrichments) {
    const existing = entries.find(e => e.signal_type === enrich.existing_signal_type)
    if (existing) {
      existing.brief = enrich.updated_brief.slice(0, 100)
    }
  }

  // Add new signals at turn_index = 0
  for (const sig of opts.newSignals) {
    // Don't add duplicates
    const alreadyExists = entries.some(e =>
      e.signal_type === sig.signal_type &&
      (e.action_target === sig.action_target || (!e.action_target && !sig.action_target))
    )
    if (!alreadyExists) {
      entries.push({
        signal_type: sig.signal_type,
        turn_index: 0,
        brief: sig.brief.slice(0, 100),
        status: opts.activeMachine ? "deferred" : "pending",
        action_target: sig.action_target,
        detected_at: new Date().toISOString(),
      })
    }
  }

  // Update status for signals that match the active machine
  if (opts.activeMachine) {
    for (const e of entries) {
      if (opts.machineMatchesSignalType(opts.activeMachine, e.signal_type)) {
        e.status = "in_machine"
      }
    }
  }

  return {
    tempMemory: {
      ...opts.tempMemory,
      [opts.key]: { entries, last_turn_index: turnIndex },
    },
    prunedCount,
  }
}

export function resolveSignalInHistory(opts: {
  tempMemory: any
  key: string
  signalType: string
  actionTarget?: string
}): { tempMemory: any } {
  const state = (opts.tempMemory as any)?.[opts.key] as SignalHistoryState | undefined
  if (!state?.entries) return { tempMemory: opts.tempMemory }

  const entries = state.entries.map(e => {
    if (e.signal_type === opts.signalType &&
        (e.action_target === opts.actionTarget || (!e.action_target && !opts.actionTarget))) {
      return { ...e, status: "resolved" as const }
    }
    return e
  })

  return {
    tempMemory: {
      ...opts.tempMemory,
      [opts.key]: { ...state, entries },
    },
  }
}



