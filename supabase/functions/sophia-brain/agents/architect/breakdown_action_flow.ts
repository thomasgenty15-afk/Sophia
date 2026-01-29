/**
 * Breakdown Action Flow v2 - Core logic
 * 
 * Handles the state machine for breaking down an action into a micro-step
 * with explicit user consent and preview validation.
 */

import type {
  BreakdownCandidate,
  BreakdownCandidateStatus,
  ProposedStep,
} from "./breakdown_candidate_types.ts"
import {
  updateBreakdownCandidate,
  shouldAbandonBreakdownCandidate,
  hasProposedStep,
} from "./breakdown_candidate_types.ts"
import { looksLikeYesToProceed, looksLikeNoToCancel } from "./consent.ts"

// ═══════════════════════════════════════════════════════════════════════════
// Message generation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Ask user which action they want to break down
 */
export function generateAskTargetMessage(): string {
  return "Ok, quelle action tu veux débloquer exactement ?"
}

/**
 * Ask user what's blocking them
 */
export function generateAskBlockerMessage(candidate: BreakdownCandidate): string {
  const title = candidate.target_action.title
  return `Ok pour "${title}". Qu'est-ce qui bloque exactement ? (en 1 phrase)`
}

/**
 * Show the proposed micro-step for validation
 */
export function generateBreakdownPreviewMessage(candidate: BreakdownCandidate): string {
  const step = candidate.proposed_step
  if (!step?.title) {
    return "Je n'ai pas réussi à générer une micro-étape. Tu veux réessayer ?"
  }

  const targetTitle = candidate.target_action.title
  const stepTitle = step.title
  const stepDesc = step.description?.trim()
  const tip = step.tip?.trim()

  const lines: string[] = [
    `Ok. Micro-étape (2 min) pour débloquer "${targetTitle}" :`,
    `→ ${stepTitle}${stepDesc ? ` — ${stepDesc}` : ""}`,
  ]

  if (tip) {
    lines.push("")
    lines.push(`Tip: ${tip}`)
  }

  lines.push("")
  lines.push("Ça te va ?")

  return lines.join("\n")
}

/**
 * Generate abandonment message based on reason
 */
export function generateBreakdownAbandonmentMessage(
  candidate: BreakdownCandidate,
  reason: "user_declined" | "max_clarifications" | "no_step_generated"
): string {
  const title = candidate.target_action.title

  switch (reason) {
    case "user_declined":
      return `Ok, on laisse "${title}" comme ça pour l'instant. Dis-moi si tu veux retenter plus tard.`
    case "max_clarifications":
      return `Ok, je vois qu'on n'arrive pas à trouver la bonne micro-étape pour "${title}". On peut reprendre plus tard si tu veux.`
    case "no_step_generated":
      return `Désolé, je n'ai pas réussi à générer une micro-étape pour "${title}". Tu veux qu'on essaie autrement ?`
  }
}

/**
 * Ask for clarification when user wants modification
 */
export function generateBreakdownClarificationQuestion(candidate: BreakdownCandidate): string {
  const step = candidate.proposed_step
  if (!step?.title) {
    return "Qu'est-ce qui te bloquerait de moins avec cette action ?"
  }
  return `Tu voudrais quoi comme micro-étape à la place de "${step.title}" ?`
}

// ═══════════════════════════════════════════════════════════════════════════
// Response processing
// ═══════════════════════════════════════════════════════════════════════════

export interface BreakdownFlowResult {
  response: string
  candidate: BreakdownCandidate
  shouldApply: boolean
  shouldAbandon: boolean
  needsNewProposal: boolean  // If user wants different micro-step
  toolExecution: "success" | "blocked" | "none"
}

/**
 * Detect if user wants to abandon the breakdown
 */
export function looksLikeAbandonBreakdown(message: string): boolean {
  const s = String(message ?? "").trim().toLowerCase()
  if (!s) return false
  
  // Explicit abandonment
  if (/^(non|nan|nope|pas maintenant|laisse|laisse tomber|oublie|annule|stop)/i.test(s)) return true
  if (/\b(pas envie|pas besoin|on arr[êe]te|c['']est bon)\b/i.test(s)) return true
  
  return looksLikeNoToCancel(message)
}

/**
 * Detect if user wants a different micro-step
 */
export function looksLikeWantsDifferentStep(message: string): boolean {
  const s = String(message ?? "").trim().toLowerCase()
  if (!s) return false
  
  // "non mais..." or "ok mais..." patterns
  const yesBut = /^(oui|ok|d['']accord)\s+(mais|sauf|par\s+contre)\b/i.test(s)
  if (yesBut) return true
  
  // "non, plutôt..." patterns
  const noPrefer = /^non[\s,]+(plut[oô]t|je\s+pr[ée]f[èe]re|je\s+voudrais|autre)/i.test(s)
  if (noPrefer) return true
  
  // Explicit different request
  if (/\b(autre\s+chose|diff[ée]rent|autrement|plus\s+simple|encore\s+plus\s+petit)\b/i.test(s)) return true
  
  return false
}

/**
 * Process user response to the preview
 */
export function processBreakdownPreviewResponse(
  candidate: BreakdownCandidate,
  userMessage: string
): BreakdownFlowResult {
  // Check for abandonment first
  if (looksLikeAbandonBreakdown(userMessage)) {
    return {
      response: generateBreakdownAbandonmentMessage(candidate, "user_declined"),
      candidate: updateBreakdownCandidate(candidate, { status: "abandoned" }),
      shouldApply: false,
      shouldAbandon: true,
      needsNewProposal: false,
      toolExecution: "none",
    }
  }

  // Check for modification request (wants different step)
  if (looksLikeWantsDifferentStep(userMessage)) {
    // Check if max clarifications reached
    if (shouldAbandonBreakdownCandidate(candidate)) {
      return {
        response: generateBreakdownAbandonmentMessage(candidate, "max_clarifications"),
        candidate: updateBreakdownCandidate(candidate, { status: "abandoned" }),
        shouldApply: false,
        shouldAbandon: true,
        needsNewProposal: false,
        toolExecution: "none",
      }
    }

    // Ask for clarification and request new proposal
    return {
      response: generateBreakdownClarificationQuestion(candidate),
      candidate: updateBreakdownCandidate(candidate, {
        clarification_count: candidate.clarification_count + 1,
        last_clarification_reason: userMessage.slice(0, 200),
        status: "awaiting_blocker", // Go back to collect new blocker
      }),
      shouldApply: false,
      shouldAbandon: false,
      needsNewProposal: true,
      toolExecution: "blocked",
    }
  }

  // Check for positive response
  if (looksLikeYesToProceed(userMessage)) {
    // Verify we have a proposed step
    if (!hasProposedStep(candidate)) {
      return {
        response: generateBreakdownAbandonmentMessage(candidate, "no_step_generated"),
        candidate: updateBreakdownCandidate(candidate, { status: "abandoned" }),
        shouldApply: false,
        shouldAbandon: true,
        needsNewProposal: false,
        toolExecution: "none",
      }
    }

    return {
      response: "", // Will be filled by caller after DB insert
      candidate: updateBreakdownCandidate(candidate, { status: "applied" }),
      shouldApply: true,
      shouldAbandon: false,
      needsNewProposal: false,
      toolExecution: "success",
    }
  }

  // Unclear response - ask for confirmation if first time
  if (candidate.clarification_count === 0) {
    return {
      response: "Je suis pas sûr de comprendre. Tu veux que j'ajoute cette micro-étape, oui ou non ?",
      candidate: updateBreakdownCandidate(candidate, {
        clarification_count: candidate.clarification_count + 1,
      }),
      shouldApply: false,
      shouldAbandon: false,
      needsNewProposal: false,
      toolExecution: "blocked",
    }
  }

  // Second unclear response - abandon gracefully
  return {
    response: generateBreakdownAbandonmentMessage(candidate, "max_clarifications"),
    candidate: updateBreakdownCandidate(candidate, { status: "abandoned" }),
    shouldApply: false,
    shouldAbandon: true,
    needsNewProposal: false,
    toolExecution: "none",
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Target extraction from user message
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract action target from user message (when in awaiting_target status)
 */
export function extractTargetFromMessage(message: string): string | null {
  const s = String(message ?? "").trim()
  if (!s || s.length < 2) return null
  
  // If message is short and looks like a title, use it directly
  if (s.length <= 50 && !/\s{2,}/.test(s)) {
    // Remove common prefixes
    const cleaned = s
      .replace(/^(l['']?action\s+|l['']?habitude\s+|le\s+|la\s+|mon\s+|ma\s+)/i, "")
      .replace(/[""«»]/g, "")
      .trim()
    if (cleaned.length >= 2) return cleaned
  }
  
  // Try to extract quoted title
  const quotedMatch = s.match(/[""«]([^""»]{2,80})[""»]/i)
  if (quotedMatch?.[1]) return quotedMatch[1].trim()
  
  // Try to extract from "je bloque sur X" pattern
  const blockerMatch = s.match(/\b(?:bloque|coince|d[ée]bloquer|simplifier|d[ée]couper)\s+(?:sur\s+)?(?:l['']?|le\s+|la\s+|mon\s+|ma\s+)?([^,.!?]{2,50})/i)
  if (blockerMatch?.[1]) return blockerMatch[1].trim()
  
  return null
}

/**
 * Extract blocker description from user message (when in awaiting_blocker status)
 */
export function extractBlockerFromMessage(message: string): string | null {
  const s = String(message ?? "").trim()
  if (!s || s.length < 3) return null
  
  // Most of the time, the whole message is the blocker description
  // Just clean it up a bit
  const cleaned = s
    .replace(/^(en fait|bah|ben|euh|hum)\s*,?\s*/i, "")
    .replace(/^(c['']est que|le truc c['']est que)\s*/i, "")
    .trim()
  
  if (cleaned.length >= 3) return cleaned.slice(0, 300)
  return null
}

// ═══════════════════════════════════════════════════════════════════════════
// Logging helper
// ═══════════════════════════════════════════════════════════════════════════

export interface BreakdownFlowLogEvent {
  supabase: any
  requestId?: string
  evalRunId?: string
  userId: string
  event: "flow_started" | "target_collected" | "blocker_collected" | "preview_shown" | "clarification_asked" | "flow_completed" | "flow_abandoned"
  candidate: BreakdownCandidate
  metadata?: Record<string, unknown>
}

export async function logBreakdownFlowEvent(opts: BreakdownFlowLogEvent): Promise<void> {
  try {
    const { supabase, requestId, evalRunId, userId, event, candidate, metadata } = opts
    await supabase.from("tool_execution_logs").insert({
      request_id: requestId ?? null,
      eval_run_id: evalRunId ?? null,
      user_id: userId,
      tool_name: "breakdown_action_flow",
      event_type: event,
      status: candidate.status,
      metadata: {
        candidate_id: candidate.id,
        target_action: candidate.target_action.title,
        blocker: candidate.blocker?.slice(0, 100),
        proposed_step_title: candidate.proposed_step?.title,
        clarification_count: candidate.clarification_count,
        ...metadata,
      },
    })
  } catch (e) {
    console.error("[BreakdownFlow] Failed to log event:", e)
  }
}

