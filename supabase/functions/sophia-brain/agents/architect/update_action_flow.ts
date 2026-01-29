/**
 * Update Action Flow v2 - Simplified state machine
 * 
 * This module implements the "juste milieu" approach for updates:
 * - UpdateActionCandidate as single source of truth
 * - 2-3 turns max
 * - Preview with diff display
 * - 1 clarification round max before graceful abandonment
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2"
import {
  UpdateActionCandidate,
  ProposedChanges,
  TargetAction,
  createUpdateCandidate,
  updateUpdateCandidate,
  shouldAbandonUpdateCandidate,
  hasActualChanges,
  getChangeType,
} from "./update_action_candidate_types.ts"
import {
  looksLikeYesToProceed,
  looksLikeNoToProceed,
} from "./consent.ts"
import { formatDaysFrench } from "./dates.ts"
import { logToolLedgerEvent } from "../../lib/tool_ledger.ts"

// ═══════════════════════════════════════════════════════════════════════════════
// FLOW HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

export interface UpdateActionFlowResult {
  response: string
  candidate: UpdateActionCandidate | null
  shouldApply: boolean
  shouldAbandon: boolean
  toolExecution: "none" | "blocked" | "success" | "failed"
}

/**
 * Generate a preview message showing the diff of changes.
 */
export function generateUpdatePreviewMessage(candidate: UpdateActionCandidate): string {
  const target = candidate.target_action
  const changes = candidate.proposed_changes
  const title = target.title

  // Single change - simple format
  const changeLines: string[] = []

  if (changes.new_reps !== undefined && changes.new_reps !== target.current_reps) {
    const from = target.current_reps ?? "?"
    const to = changes.new_reps
    changeLines.push(`Fréquence: ${from}× → ${to}×/semaine`)
  }

  if (changes.new_days !== undefined && changes.new_days.length > 0) {
    const fromDays = target.current_days && target.current_days.length > 0
      ? formatDaysFrench(target.current_days)
      : "aucun"
    const toDays = formatDaysFrench(changes.new_days)
    if (fromDays !== toDays) {
      changeLines.push(`Jours: ${fromDays} → ${toDays}`)
    }
  }

  if (changes.new_time_of_day !== undefined && changes.new_time_of_day !== target.current_time_of_day) {
    const todFr: Record<string, string> = {
      morning: "le matin",
      afternoon: "l'après-midi",
      evening: "le soir",
      night: "la nuit",
      any_time: "n'importe quand",
    }
    const from = target.current_time_of_day ? (todFr[target.current_time_of_day] ?? target.current_time_of_day) : "?"
    const to = todFr[changes.new_time_of_day] ?? changes.new_time_of_day
    changeLines.push(`Moment: ${from} → ${to}`)
  }

  if (changes.new_title !== undefined && changes.new_title !== target.title) {
    changeLines.push(`Titre: "${target.title}" → "${changes.new_title}"`)
  }

  if (changeLines.length === 0) {
    return `Je n'ai pas de modification à faire sur "${title}".\n\nTu voulais changer quoi exactement ?`
  }

  if (changeLines.length === 1) {
    // Simple single-line format
    return `Je modifie "${title}" :\n→ ${changeLines[0]}\n\nÇa te va ?`
  }

  // Multiple changes - list format
  const lines = [`Je modifie "${title}" :`]
  for (const line of changeLines) {
    lines.push(`→ ${line}`)
  }
  lines.push("")
  lines.push("Ça te va ?")

  return lines.join("\n")
}

/**
 * Generate a clarification question when user says no/modify.
 */
export function generateUpdateClarificationQuestion(candidate: UpdateActionCandidate): string {
  const questions = [
    "Tu veux changer quoi exactement ?",
    "Qu'est-ce qui ne va pas ? La fréquence, les jours, ou autre chose ?",
    "Dis-moi ce qui coince, j'ajuste.",
  ]
  return questions[Math.floor(Math.random() * questions.length)]
}

/**
 * Generate a graceful abandonment message.
 */
export function generateUpdateAbandonmentMessage(candidate: UpdateActionCandidate, reason: "user_declined" | "max_clarifications" | "no_changes"): string {
  const title = candidate.target_action.title
  
  if (reason === "no_changes") {
    return `Ok, on laisse "${title}" comme c'est.`
  }
  
  if (reason === "user_declined") {
    return `Ok, on ne touche pas à "${title}" pour l'instant.`
  }
  
  // Max clarifications reached
  return `Ok, on laisse "${title}" tel quel. Dis-moi "modifie ${title}" quand tu seras prêt.`
}

/**
 * Detect if user wants to modify the proposed changes.
 */
export function looksLikeUpdateModificationRequest(message: string): boolean {
  const s = String(message ?? "").trim().toLowerCase()
  if (!s) return false

  // "oui mais..." or "ok mais..." patterns
  const yesBut = /^(oui|ok|d['']accord|ça\s+marche)\s+(mais|sauf|par\s+contre)\b/i.test(s)
  if (yesBut) return true

  // "non, plutôt..." or "non, je préfère..." patterns
  const noPrefer = /^non[\s,]+(plut[oô]t|je\s+pr[ée]f[èe]re|je\s+voudrais|mets|change)/i.test(s)
  if (noPrefer) return true

  // Explicit modification verbs with parameter context
  const hasModVerb = /\b(change|modifie|ajuste|mets|met|passe|préfère|voudrais|plutôt)\b/i.test(s)
  const hasParamContext = /\b(fréquence|fois|jour|jours|matin|soir|nuit|après[-\s]?midi|semaine|titre|nom)\b/i.test(s)
  if (hasModVerb && hasParamContext) return true

  // Specific frequency change patterns
  if (/\b(\d+)\s*(fois|x)\s*(par\s+semaine|\/\s*semaine)?\b/i.test(s)) {
    const notJustNumber = s.length > 10 || /\b(plutôt|préfère|change|mets|met)\b/i.test(s)
    if (notJustNumber) return true
  }

  return false
}

/**
 * Extract modification info from user message for updates.
 */
export function extractUpdateModificationInfo(message: string): {
  field?: "frequency" | "days" | "time_of_day" | "title"
  value?: string | number | string[]
  raw_modification?: string
} | null {
  const s = String(message ?? "").trim().toLowerCase()
  if (!s) return null

  // Frequency extraction: "3 fois par semaine", "plutôt 2x"
  const freqMatch = s.match(/(\d+)\s*(?:fois|x)\s*(?:par\s*semaine|\/\s*semaine)?/i)
  if (freqMatch) {
    const freq = Math.max(1, Math.min(7, parseInt(freqMatch[1], 10)))
    return { field: "frequency", value: freq, raw_modification: freqMatch[0] }
  }

  // Time of day extraction
  const todPatterns: Record<string, string> = {
    matin: "morning",
    soir: "evening",
    nuit: "night",
    "après-midi": "afternoon",
    "apres-midi": "afternoon",
    "après midi": "afternoon",
    "apres midi": "afternoon",
  }
  for (const [fr, en] of Object.entries(todPatterns)) {
    if (s.includes(fr)) {
      return { field: "time_of_day", value: en, raw_modification: fr }
    }
  }

  // Days extraction
  const dayMap: Record<string, string> = {
    lundi: "mon", lun: "mon",
    mardi: "tue", mar: "tue",
    mercredi: "wed", mer: "wed",
    jeudi: "thu", jeu: "thu",
    vendredi: "fri", ven: "fri",
    samedi: "sat", sam: "sat",
    dimanche: "sun", dim: "sun",
  }
  const mentionedDays: string[] = []
  for (const [fr, en] of Object.entries(dayMap)) {
    if (new RegExp(`\\b${fr}\\b`, "i").test(s) && !mentionedDays.includes(en)) {
      mentionedDays.push(en)
    }
  }
  if (mentionedDays.length > 0) {
    return { field: "days", value: mentionedDays, raw_modification: mentionedDays.join(", ") }
  }

  // If we detect modification intent but can't extract specific info
  if (looksLikeUpdateModificationRequest(message)) {
    return { raw_modification: s.slice(0, 100) }
  }

  return null
}

/**
 * Detect if user is abandoning the update flow.
 */
export function looksLikeAbandonUpdate(message: string): boolean {
  const s = String(message ?? "").trim().toLowerCase()
  if (!s) return false

  const abandonPatterns = [
    /^(non|nan|nope)\s*[.!]?\s*$/i,
    /\b(laisse\s+tomber|oublie|on\s+oublie|pas\s+maintenant|annule|laisse\s+comme\s+[çc]a)\b/i,
    /\b(je\s+veux\s+pas|je\s+ne\s+veux\s+pas|touche\s+pas)\b/i,
    /\b(finalement\s+non|en\s+fait\s+non|non\s+merci)\b/i,
  ]

  return abandonPatterns.some((p) => p.test(s))
}

/**
 * Apply modification info to candidate proposed changes.
 */
export function applyUpdateModification(
  candidate: UpdateActionCandidate,
  modInfo: ReturnType<typeof extractUpdateModificationInfo>
): UpdateActionCandidate {
  if (!modInfo || !modInfo.field) return candidate

  const changes = { ...candidate.proposed_changes }

  switch (modInfo.field) {
    case "frequency":
      changes.new_reps = modInfo.value as number
      break
    case "time_of_day":
      changes.new_time_of_day = modInfo.value as string
      break
    case "days":
      changes.new_days = modInfo.value as string[]
      break
    case "title":
      changes.new_title = modInfo.value as string
      break
  }

  return updateUpdateCandidate(candidate, {
    proposed_changes: changes,
    last_clarification_reason: modInfo.raw_modification,
  })
}

/**
 * Process user response in the preview phase.
 */
export function processUpdatePreviewResponse(
  candidate: UpdateActionCandidate,
  userMessage: string
): UpdateActionFlowResult {
  // Check for abandonment first
  if (looksLikeAbandonUpdate(userMessage)) {
    return {
      response: generateUpdateAbandonmentMessage(candidate, "user_declined"),
      candidate: updateUpdateCandidate(candidate, { status: "abandoned" }),
      shouldApply: false,
      shouldAbandon: true,
      toolExecution: "none",
    }
  }

  // Check for modification request
  if (looksLikeUpdateModificationRequest(userMessage)) {
    const modInfo = extractUpdateModificationInfo(userMessage)

    // Check if max clarifications reached
    if (shouldAbandonUpdateCandidate(candidate)) {
      return {
        response: generateUpdateAbandonmentMessage(candidate, "max_clarifications"),
        candidate: updateUpdateCandidate(candidate, { status: "abandoned" }),
        shouldApply: false,
        shouldAbandon: true,
        toolExecution: "none",
      }
    }

    // Apply modification if available
    if (modInfo?.field) {
      const updatedCandidate = applyUpdateModification(candidate, modInfo)
      // Re-show preview with new changes
      return {
        response: generateUpdatePreviewMessage(updatedCandidate),
        candidate: updateUpdateCandidate(updatedCandidate, {
          clarification_count: candidate.clarification_count + 1,
          status: "awaiting_confirm",
        }),
        shouldApply: false,
        shouldAbandon: false,
        toolExecution: "blocked",
      }
    }

    // No specific modification info, ask for clarification
    return {
      response: generateUpdateClarificationQuestion(candidate),
      candidate: updateUpdateCandidate(candidate, {
        clarification_count: candidate.clarification_count + 1,
        last_clarification_reason: userMessage.slice(0, 200),
      }),
      shouldApply: false,
      shouldAbandon: false,
      toolExecution: "blocked",
    }
  }

  // Check for positive response
  if (looksLikeYesToProceed(userMessage)) {
    // Verify there are actual changes
    if (!hasActualChanges(candidate)) {
      return {
        response: generateUpdateAbandonmentMessage(candidate, "no_changes"),
        candidate: updateUpdateCandidate(candidate, { status: "abandoned" }),
        shouldApply: false,
        shouldAbandon: true,
        toolExecution: "none",
      }
    }

    return {
      response: "", // Will be filled by caller after DB update
      candidate: updateUpdateCandidate(candidate, { status: "applied" }),
      shouldApply: true,
      shouldAbandon: false,
      toolExecution: "success",
    }
  }

  // Unclear response - ask for confirmation if first time
  if (candidate.clarification_count === 0) {
    return {
      response: "Je suis pas sûr de comprendre. Tu veux que je fasse cette modification, oui ou non ?",
      candidate: updateUpdateCandidate(candidate, {
        clarification_count: candidate.clarification_count + 1,
      }),
      shouldApply: false,
      shouldAbandon: false,
      toolExecution: "blocked",
    }
  }

  // Second unclear response - abandon gracefully
  return {
    response: generateUpdateAbandonmentMessage(candidate, "max_clarifications"),
    candidate: updateUpdateCandidate(candidate, { status: "abandoned" }),
    shouldApply: false,
    shouldAbandon: true,
    toolExecution: "none",
  }
}

/**
 * Create a new UpdateActionCandidate from tool args and current action data.
 */
export function createUpdateCandidateFromToolArgs(
  args: {
    target_name?: string
    new_title?: string
    new_target_reps?: number
    new_scheduled_days?: string[]
    new_time_of_day?: string
  },
  currentAction: {
    id?: string
    title: string
    target_reps?: number
    scheduled_days?: string[]
    time_of_day?: string
  }
): UpdateActionCandidate {
  return createUpdateCandidate({
    target_action: {
      id: currentAction.id,
      title: currentAction.title,
      current_reps: currentAction.target_reps,
      current_days: currentAction.scheduled_days,
      current_time_of_day: currentAction.time_of_day,
    },
    proposed_changes: {
      new_reps: args.new_target_reps,
      new_days: args.new_scheduled_days,
      new_time_of_day: args.new_time_of_day,
      new_title: args.new_title,
    },
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGING HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

export async function logUpdateActionFlowEvent(opts: {
  supabase: SupabaseClient
  requestId?: string
  evalRunId?: string | null
  userId: string
  event: "flow_started" | "preview_shown" | "clarification_asked" | "flow_completed" | "flow_abandoned"
  candidate: UpdateActionCandidate
  metadata?: Record<string, unknown>
}): Promise<void> {
  const { supabase, requestId, evalRunId, userId, event, candidate, metadata } = opts

  if (!requestId) return

  await logToolLedgerEvent({
    supabase,
    requestId,
    evalRunId: evalRunId ?? null,
    userId,
    source: "sophia-brain:architect:update_action_flow",
    event: `tool_call_${event === "flow_completed" ? "succeeded" : event === "flow_abandoned" ? "blocked" : "attempted"}` as any,
    level: event === "flow_abandoned" ? "warn" : "info",
    toolName: "update_action_flow",
    toolArgs: {
      status: candidate.status,
      target_title: candidate.target_action.title,
      change_type: getChangeType(candidate),
      clarification_count: candidate.clarification_count,
    },
    toolResult: event === "flow_completed" ? { applied: true } : undefined,
    metadata: {
      flow_event: event,
      ...metadata,
    },
  })
}

