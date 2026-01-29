/**
 * Create Action Flow v2 - Simplified state machine
 * 
 * This module implements the "juste milieu" approach:
 * - ActionCandidate as single source of truth
 * - 3-4 turns max
 * - 2 checkpoints: intent confirmation + preview validation
 * - 1 clarification round max before graceful abandonment
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2"
import {
  ActionCandidate,
  ActionCandidateParams,
  createActionCandidate,
  updateActionCandidate,
  shouldAbandonCandidate,
  formatCandidatePreview,
} from "./action_candidate_types.ts"
import {
  looksLikeYesToProceed,
  looksLikeModificationRequest,
  extractModificationInfo,
  looksLikeAbandonActionCreation,
  detectPositiveResponseStrength,
} from "./consent.ts"
import { logToolLedgerEvent } from "../../lib/tool_ledger.ts"

// ═══════════════════════════════════════════════════════════════════════════════
// FLOW HANDLERS
// ═══════════════════════════════════════════════════════════════════════════════

export interface CreateActionFlowResult {
  response: string
  candidate: ActionCandidate | null
  shouldCreate: boolean
  shouldAbandon: boolean
  toolExecution: "none" | "blocked" | "success" | "failed"
}

/**
 * Generate a preview message for the action candidate.
 * This is the single checkpoint before DB insert.
 */
export function generatePreviewMessage(candidate: ActionCandidate): string {
  const p = candidate.params_to_validate
  if (!p) {
    return `Ok je crée "${candidate.label}".\n\nÇa te va ?`
  }

  const lines: string[] = [`Ok je crée "${p.title ?? candidate.label}" :`]
  
  if (p.target_reps) {
    const freq = candidate.type === "mission" ? "1 fois" : `${p.target_reps}×/semaine`
    lines.push(`→ Fréquence: ${freq}`)
  }
  
  if (p.time_of_day && p.time_of_day !== "any_time") {
    const todFr: Record<string, string> = {
      morning: "le matin",
      afternoon: "l'après-midi",
      evening: "le soir",
      night: "la nuit",
    }
    lines.push(`→ Moment: ${todFr[p.time_of_day] ?? p.time_of_day}`)
  }
  
  if (p.scheduled_days && p.scheduled_days.length > 0) {
    const dayMap: Record<string, string> = {
      mon: "Lundi", tue: "Mardi", wed: "Mercredi", thu: "Jeudi",
      fri: "Vendredi", sat: "Samedi", sun: "Dimanche",
    }
    const days = p.scheduled_days.map((d) => dayMap[d] ?? d).join(", ")
    lines.push(`→ Jours: ${days}`)
  }

  lines.push("")
  lines.push("Ça te va ?")

  return lines.join("\n")
}

/**
 * Generate a clarification question when user says no/modify.
 */
export function generateClarificationQuestion(candidate: ActionCandidate, modInfo: ReturnType<typeof extractModificationInfo>): string {
  if (modInfo?.field) {
    // User gave specific modification info, apply and re-preview
    return `Ok, je note. Tu veux autre chose à changer, ou c'est bon comme ça ?`
  }

  // User said no but didn't specify what to change
  const questions = [
    "Qu'est-ce qui ne va pas ? La fréquence, le moment, ou autre chose ?",
    "Tu veux changer quoi exactement ?",
    "Dis-moi ce qui coince, je ajuste.",
  ]
  return questions[Math.floor(Math.random() * questions.length)]
}

/**
 * Generate a graceful abandonment message.
 */
export function generateAbandonmentMessage(candidate: ActionCandidate, reason: "user_declined" | "max_clarifications"): string {
  if (reason === "user_declined") {
    return `Ok, on laisse tomber pour l'instant. Tu pourras me redemander quand tu veux créer "${candidate.label}".`
  }
  
  // Max clarifications reached
  return `Ok, on verra ça plus tard. Dis-moi "crée ${candidate.label}" quand tu seras prêt.`
}

/**
 * Apply modification info to candidate params.
 */
export function applyModificationToCandidate(
  candidate: ActionCandidate,
  modInfo: ReturnType<typeof extractModificationInfo>
): ActionCandidate {
  if (!modInfo || !modInfo.field) return candidate

  const params = { ...(candidate.params_to_validate ?? {}) }

  switch (modInfo.field) {
    case "frequency":
      params.target_reps = modInfo.value as number
      break
    case "time_of_day":
      params.time_of_day = modInfo.value as ActionCandidateParams["time_of_day"]
      break
    case "days":
      params.scheduled_days = modInfo.value as string[]
      break
    case "title":
      params.title = modInfo.value as string
      break
    case "description":
      params.description = modInfo.value as string
      break
  }

  return updateActionCandidate(candidate, {
    params_to_validate: params,
    last_clarification_reason: modInfo.raw_modification,
  })
}

/**
 * Process user response in the preview phase.
 * Returns updated candidate and response to send.
 */
export function processPreviewResponse(
  candidate: ActionCandidate,
  userMessage: string
): CreateActionFlowResult {
  // Check for abandonment first
  if (looksLikeAbandonActionCreation(userMessage)) {
    return {
      response: generateAbandonmentMessage(candidate, "user_declined"),
      candidate: updateActionCandidate(candidate, { status: "abandoned" }),
      shouldCreate: false,
      shouldAbandon: true,
      toolExecution: "none",
    }
  }

  // Check for modification request
  if (looksLikeModificationRequest(userMessage)) {
    const modInfo = extractModificationInfo(userMessage)
    
    // Check if max clarifications reached (unless user provides concrete modification after unclear)
    if (shouldAbandonCandidate(candidate) && candidate.last_clarification_reason !== "unclear" && !modInfo?.field) {
      return {
        response: generateAbandonmentMessage(candidate, "max_clarifications"),
        candidate: updateActionCandidate(candidate, { status: "abandoned" }),
        shouldCreate: false,
        shouldAbandon: true,
        toolExecution: "none",
      }
    }

    // Apply modification if available
    let updatedCandidate = candidate
    if (modInfo?.field) {
      updatedCandidate = applyModificationToCandidate(candidate, modInfo)
      // Re-show preview with new params
      return {
        response: generatePreviewMessage(updatedCandidate),
        candidate: updateActionCandidate(updatedCandidate, {
          clarification_count: Math.min(candidate.clarification_count + 1, 1),
          status: "previewing",
        }),
        shouldCreate: false,
        shouldAbandon: false,
        toolExecution: "blocked",
      }
    }

    // No specific modification info, ask for clarification
    return {
      response: generateClarificationQuestion(candidate, modInfo),
      candidate: updateActionCandidate(candidate, {
        clarification_count: candidate.clarification_count + 1,
        status: "previewing",
        last_clarification_reason: userMessage.slice(0, 200),
      }),
      shouldCreate: false,
      shouldAbandon: false,
      toolExecution: "blocked",
    }
  }

  // Check for positive response
  const positiveStrength = detectPositiveResponseStrength(userMessage)
  if (positiveStrength || looksLikeYesToProceed(userMessage)) {
    return {
      response: "", // Will be filled by caller after DB insert
      candidate: updateActionCandidate(candidate, { status: "created" }),
      shouldCreate: true,
      shouldAbandon: false,
      toolExecution: "success",
    }
  }

  // Unclear response - treat as weak yes if in preview phase
  // (User didn't say no explicitly, so we proceed cautiously)
  if (candidate.status === "previewing" && candidate.clarification_count === 0) {
    // First unclear response - ask for confirmation
    return {
      response: "Je suis pas sûr de comprendre. Tu veux que je crée cette action, oui ou non ?",
      candidate: updateActionCandidate(candidate, {
        clarification_count: candidate.clarification_count + 1,
        last_clarification_reason: "unclear",
      }),
      shouldCreate: false,
      shouldAbandon: false,
      toolExecution: "blocked",
    }
  }

  // Second unclear response - abandon gracefully
  return {
    response: generateAbandonmentMessage(candidate, "max_clarifications"),
    candidate: updateActionCandidate(candidate, { status: "abandoned" }),
    shouldCreate: false,
    shouldAbandon: true,
    toolExecution: "none",
  }
}

/**
 * Create a new ActionCandidate from tool args.
 */
export function createCandidateFromToolArgs(args: {
  title?: string
  description?: string
  type?: string
  targetReps?: number
  time_of_day?: string
  tips?: string
}, proposedBy: "sophia" | "user"): ActionCandidate {
  return createActionCandidate({
    label: args.title ?? "Action",
    type: (args.type === "mission" ? "mission" : args.type === "framework" ? "framework" : "habit") as any,
    proposed_by: proposedBy,
    status: "previewing",
    params: {
      title: args.title,
      description: args.description,
      target_reps: args.targetReps ?? (args.type === "mission" ? 1 : 3),
      time_of_day: args.time_of_day as ActionCandidateParams["time_of_day"],
      tips: args.tips,
    },
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOGGING HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

export async function logCreateActionFlowEvent(opts: {
  supabase: SupabaseClient
  requestId?: string
  evalRunId?: string | null
  userId: string
  event: "flow_started" | "preview_shown" | "clarification_asked" | "flow_completed" | "flow_abandoned"
  candidate: ActionCandidate
  metadata?: Record<string, unknown>
}): Promise<void> {
  const { supabase, requestId, evalRunId, userId, event, candidate, metadata } = opts
  
  if (!requestId) return

  await logToolLedgerEvent({
    supabase,
    requestId,
    evalRunId: evalRunId ?? null,
    userId,
    source: "sophia-brain:architect:create_action_flow",
    event: `tool_call_${event === "flow_completed" ? "succeeded" : event === "flow_abandoned" ? "blocked" : "attempted"}` as any,
    level: event === "flow_abandoned" ? "warn" : "info",
    toolName: "create_action_flow",
    toolArgs: {
      status: candidate.status,
      label: candidate.label,
      type: candidate.type,
      clarification_count: candidate.clarification_count,
    },
    toolResult: event === "flow_completed" ? { created: true } : undefined,
    metadata: {
      flow_event: event,
      proposed_by: candidate.proposed_by,
      ...metadata,
    },
  })
}

