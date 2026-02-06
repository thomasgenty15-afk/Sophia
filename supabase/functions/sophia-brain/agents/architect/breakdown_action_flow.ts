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
// Consent detection is now AI-driven via dispatcher signals (no regex imports needed)

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
 * Process user response to the preview.
 * Classification (yes/no/different/abandon) is AI-driven via dispatcher signals.
 */
export function processBreakdownPreviewResponse(
  candidate: BreakdownCandidate,
  userMessage: string,
  aiSignals?: { confirmed?: boolean; abandoned?: boolean; differentStep?: boolean }
): BreakdownFlowResult {
  // ── AI-driven classification (dispatcher machine_signals) ──────────────

  // User confirmed the micro-step → apply
  if (aiSignals?.confirmed) {
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
      response: "",
      candidate: updateBreakdownCandidate(candidate, { status: "applied" }),
      shouldApply: true,
      shouldAbandon: false,
      needsNewProposal: false,
      toolExecution: "success",
    }
  }

  // User abandoned → graceful exit
  if (aiSignals?.abandoned) {
    return {
      response: generateBreakdownAbandonmentMessage(candidate, "user_declined"),
      candidate: updateBreakdownCandidate(candidate, { status: "abandoned" }),
      shouldApply: false,
      shouldAbandon: true,
      needsNewProposal: false,
      toolExecution: "none",
    }
  }

  // User wants a different step → request new proposal
  if (aiSignals?.differentStep) {
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
    return {
      response: generateBreakdownClarificationQuestion(candidate),
      candidate: updateBreakdownCandidate(candidate, {
        clarification_count: candidate.clarification_count + 1,
        last_clarification_reason: userMessage.slice(0, 200),
        status: "awaiting_blocker",
      }),
      shouldApply: false,
      shouldAbandon: false,
      needsNewProposal: true,
      toolExecution: "blocked",
    }
  }

  // ── No AI signal (unclear) ─────────────────────────────────────────────

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

  // Max clarifications → abandon gracefully
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

