import type { AgentMode } from "../state-manager.ts"
import type { BrainTracePhase } from "../../_shared/brain-trace.ts"
import type { ProfileFactToConfirm } from "../supervisor.ts"
import type { DeferredTopicV2, DeferredMachineType } from "./deferred_topics_v2.ts"
import {
  getNextDeferredToProcess,
  hasPendingDeferredTopics,
  isDeferredPaused,
  removeDeferredTopicV2,
} from "./deferred_topics_v2.ts"
import {
  upsertBreakdownActionFlow,
  upsertUpdateActionFlow,
  upsertCreateActionFlow,
  upsertTopicLight,
  upsertTopicSerious,
  upsertDeepReasonsExploration,
  upsertProfileConfirmation,
} from "../supervisor.ts"
import { createActionCandidate } from "../agents/architect/action_candidate_types.ts"
import { createUpdateCandidate } from "../agents/architect/update_action_candidate_types.ts"
import { createBreakdownCandidate } from "../agents/architect/breakdown_candidate_types.ts"

// ═══════════════════════════════════════════════════════════════════════════════
// PENDING RELAUNCH CONSENT STATE
// ═══════════════════════════════════════════════════════════════════════════════

export interface PendingRelaunchConsent {
  machine_type: DeferredMachineType
  action_target?: string
  summaries: string[]
  created_at: string
}

/**
 * Store pending relaunch consent - machine won't start until user confirms.
 */
export function setPendingRelaunchConsent(opts: {
  tempMemory: any
  topic: DeferredTopicV2
}): { tempMemory: any } {
  const pending: PendingRelaunchConsent = {
    machine_type: opts.topic.machine_type,
    action_target: opts.topic.action_target,
    summaries: opts.topic.signal_summaries.map(s => s.summary),
    created_at: new Date().toISOString(),
  }
  return {
    tempMemory: {
      ...(opts.tempMemory ?? {}),
      __pending_relaunch_consent: pending,
    },
  }
}

/**
 * Get pending relaunch consent if exists.
 */
export function getPendingRelaunchConsent(tempMemory: any): PendingRelaunchConsent | null {
  const pending = (tempMemory as any)?.__pending_relaunch_consent
  if (!pending || typeof pending !== "object") return null
  if (!pending.machine_type) return null
  return pending as PendingRelaunchConsent
}

/**
 * Clear pending relaunch consent (after user responds).
 */
export function clearPendingRelaunchConsent(tempMemory: any): { tempMemory: any } {
  const next = { ...(tempMemory ?? {}) }
  delete next.__pending_relaunch_consent
  return { tempMemory: next }
}

/**
 * Check if user consents to relaunch (FALLBACK - prefer dispatcher signal).
 */
export function looksLikeConsentsToRelaunch(message: string): boolean {
  const s = String(message ?? "").trim().toLowerCase()
  if (!s) return false
  
  // Positive consent patterns
  if (/^(oui|ok|d['']accord|vas[-\s]?y|go|on\s+y\s+va|allez|c['']est\s+bon|carrément|avec\s+plaisir|volontiers)/i.test(s)) return true
  if (/\b(oui|ok|d['']accord)\b/i.test(s) && s.length < 30) return true
  
  return false
}

/**
 * Check if user declines relaunch (FALLBACK - prefer dispatcher signal).
 */
export function looksLikeDeclinesRelaunch(message: string): boolean {
  const s = String(message ?? "").trim().toLowerCase()
  if (!s) return false
  
  // Negative patterns
  if (/^(non|nan|nope|pas\s+maintenant|plus\s+tard|laisse|pas\s+envie|une\s+autre\s+fois)/i.test(s)) return true
  if (/\b(non|pas\s+maintenant|plus\s+tard)\b/i.test(s) && s.length < 40) return true
  
  return false
}

/**
 * Consent signal from dispatcher (preferred over regex fallback).
 */
export interface ConsentSignal {
  value: true | false | "unclear"
  confidence: number
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSENT QUESTION MESSAGES (vraies questions, pas d'entrée directe)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a TRUE consent question for relaunch (user must say yes/no).
 */
export function generateRelaunchConsentQuestion(topic: DeferredTopicV2): string {
  const target = topic.action_target
  const machineType = topic.machine_type
  const latestSummary = topic.signal_summaries.length > 0
    ? topic.signal_summaries[topic.signal_summaries.length - 1].summary
    : null

  switch (machineType) {
    case "breakdown_action":
      if (target && latestSummary) {
        return `Tout à l'heure tu me parlais de ${target} (${latestSummary.toLowerCase()}). Tu veux qu'on s'en occupe maintenant ?`
      }
      return target
        ? `Tu voulais qu'on simplifie "${target}". On s'y met ?`
        : `Tu voulais qu'on débloque une action. Tu veux qu'on en parle maintenant ?`

    case "create_action":
      return target
        ? `Tu voulais créer "${target}". On le fait maintenant ?`
        : `Tu avais une idée d'action à créer. Tu veux qu'on s'y mette ?`

    case "update_action":
      return target
        ? `Tu voulais modifier "${target}". On fait ça maintenant ?`
        : `Tu voulais modifier une action. Tu veux qu'on s'en occupe ?`

    case "track_progress":
      return `Tu voulais noter un progrès. On le fait maintenant ?`

    case "deep_reasons":
      return target
        ? `Tu voulais qu'on creuse un peu plus ${target}. Tu veux qu'on en parle ?`
        : `Tu voulais explorer quelque chose de plus profond. Tu veux en parler maintenant ?`

    case "topic_serious":
      return target
        ? `Tu voulais parler de ${target}. Tu veux qu'on en discute maintenant ?`
        : `Tu avais un sujet important à aborder. Tu veux en parler ?`

    case "topic_light":
      return target
        ? `Au fait, tu voulais parler de ${target}. On y va ?`
        : `Tu voulais qu'on discute de quelque chose. Tu veux en parler ?`

    case "checkup":
      return `Tu voulais faire le bilan. On s'y met maintenant ?`

    case "user_profile_confirmation":
      return `J'ai noté quelques infos te concernant. Je peux te poser quelques questions rapides pour confirmer ?`

    default:
      return target
        ? `On avait noté "${target}". Tu veux qu'on s'en occupe maintenant ?`
        : `On avait noté quelque chose. Tu veux qu'on en parle ?`
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTO-RELAUNCH FROM DEFERRED (now with consent)
// ═══════════════════════════════════════════════════════════════════════════════

export async function applyAutoRelaunchFromDeferred(opts: {
  tempMemory: any
  responseContent: string
  nextMode: AgentMode
  profileConfirmDeferredKey: string
  trace: (event: string, phase: BrainTracePhase, payload?: Record<string, unknown>, level?: "debug" | "info" | "warn" | "error") => Promise<void>
}): Promise<{ tempMemory: any; responseContent: string; nextMode: AgentMode }> {
  let { tempMemory, responseContent, nextMode } = opts
  const flowJustClosed = (tempMemory as any)?.__flow_just_closed_normally
  if (!flowJustClosed) return { tempMemory, responseContent, nextMode }

  try { delete (tempMemory as any).__flow_just_closed_normally } catch {}

  if (!isDeferredPaused(tempMemory) && hasPendingDeferredTopics(tempMemory)) {
    const nextDeferred = getNextDeferredToProcess(tempMemory)
    if (nextDeferred) {
      // Store pending consent state (machine will only start if user says yes)
      // The AGENT will ask the question via add-on at next turn (not a template!)
      const consentResult = setPendingRelaunchConsent({ tempMemory, topic: nextDeferred })
      tempMemory = consentResult.tempMemory

      // Store flag for agent add-on to be injected at next turn
      ;(tempMemory as any).__ask_relaunch_consent = {
        machine_type: nextDeferred.machine_type,
        action_target: nextDeferred.action_target,
        summaries: nextDeferred.signal_summaries.map(s => s.summary),
      }

      // Remove from deferred queue (we're asking about it now)
      const removeResult = removeDeferredTopicV2({ tempMemory, topicId: nextDeferred.id })
      tempMemory = removeResult.tempMemory

      await opts.trace("brain:relaunch_consent_pending", "routing", {
        machine_type: nextDeferred.machine_type,
        action_target: nextDeferred.action_target,
        from_deferred_id: nextDeferred.id,
        trigger_count: nextDeferred.trigger_count,
      })
    }
  }

  return { tempMemory, responseContent, nextMode }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROCESS USER RESPONSE TO CONSENT QUESTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Process user's response to a relaunch consent question.
 * Called AFTER the dispatcher has analyzed the message.
 * 
 * Uses dispatcher's consent_to_relaunch signal if available, falls back to regex.
 * 
 * Returns:
 * - { handled: true, ... } if consent was processed
 * - { handled: false } if no pending consent or response unclear
 */
export function processRelaunchConsentResponse(opts: {
  tempMemory: any
  userMessage: string
  profileConfirmDeferredKey: string
  /** Signal from dispatcher (preferred) - if not provided, uses regex fallback */
  dispatcherConsentSignal?: ConsentSignal | undefined
}): {
  handled: boolean
  tempMemory: any
  shouldInitMachine: boolean
  machineType?: DeferredMachineType
  actionTarget?: string
  nextMode?: AgentMode
  declineMessage?: string
} {
  const pending = getPendingRelaunchConsent(opts.tempMemory)
  if (!pending) {
    return { handled: false, tempMemory: opts.tempMemory, shouldInitMachine: false }
  }

  // Clear pending state
  let tempMemory = clearPendingRelaunchConsent(opts.tempMemory).tempMemory

  // Determine consent: use dispatcher signal if available, otherwise fallback to regex
  const consentValue = (() => {
    // Prefer dispatcher signal (analyzed by AI)
    if (opts.dispatcherConsentSignal && opts.dispatcherConsentSignal.confidence >= 0.6) {
      return opts.dispatcherConsentSignal.value
    }
    // Fallback to regex patterns
    if (looksLikeConsentsToRelaunch(opts.userMessage)) return true
    if (looksLikeDeclinesRelaunch(opts.userMessage)) return false
    return "unclear"
  })()

  // Process based on consent value
  if (consentValue === true) {
    // User says YES → initialize the machine
    const initResult = initializeMachineFromConsent({
      tempMemory,
      machineType: pending.machine_type,
      actionTarget: pending.action_target,
      summaries: pending.summaries,
      profileConfirmDeferredKey: opts.profileConfirmDeferredKey,
    })
    return {
      handled: true,
      tempMemory: initResult.tempMemory,
      shouldInitMachine: true,
      machineType: pending.machine_type,
      actionTarget: pending.action_target,
      nextMode: initResult.nextMode,
    }
  }

  if (consentValue === false) {
    // User says NO → don't initialize, provide graceful decline
    return {
      handled: true,
      tempMemory,
      shouldInitMachine: false,
      declineMessage: generateDeclineRelaunchMessage(pending),
    }
  }

  // Unclear response → treat as implicit decline, let conversation flow naturally
  // The pending is already cleared, so the topic is dropped
  return {
    handled: true,
    tempMemory,
    shouldInitMachine: false,
    // No decline message - just continue naturally with whatever user said
  }
}

/**
 * Generate message when user declines relaunch.
 */
function generateDeclineRelaunchMessage(pending: PendingRelaunchConsent): string {
  const target = pending.action_target
  
  switch (pending.machine_type) {
    case "breakdown_action":
    case "update_action":
    case "create_action":
      return target
        ? `Ok, pas de souci. Tu pourras me redemander pour "${target}" quand tu veux.`
        : `Ok, pas de souci. Tu pourras me redemander quand tu veux.`
    
    case "deep_reasons":
      return `Ok, on laisse ça pour l'instant. Tu pourras en reparler quand tu te sentiras prêt.`
    
    case "topic_serious":
    case "topic_light":
      return target
        ? `Ok, on reparlera de ${target} une autre fois si tu veux.`
        : `Ok, on en reparlera une autre fois.`
    
    case "checkup":
      return `Ok, on fera le bilan une autre fois.`
    
    default:
      return `Ok, pas de souci. On peut en reparler quand tu veux.`
  }
}

/**
 * Initialize the machine after user consent.
 */
function initializeMachineFromConsent(opts: {
  tempMemory: any
  machineType: DeferredMachineType
  actionTarget?: string
  summaries: string[]
  profileConfirmDeferredKey: string
}): { tempMemory: any; nextMode: AgentMode } {
  let { tempMemory } = opts
  let nextMode: AgentMode = "companion"

  switch (opts.machineType) {
    case "breakdown_action": {
      const candidate = createBreakdownCandidate({
        target_action: opts.actionTarget ? { title: opts.actionTarget } : undefined,
      })
      const updated = upsertBreakdownActionFlow({ tempMemory, candidate })
      tempMemory = updated.tempMemory
      nextMode = "architect"
      break
    }

    case "update_action": {
      const candidate = createUpdateCandidate({
        target_action: { title: opts.actionTarget ?? "une action" },
        proposed_changes: {},
      })
      const updated = upsertUpdateActionFlow({ tempMemory, candidate })
      tempMemory = updated.tempMemory
      nextMode = "architect"
      break
    }

    case "create_action": {
      const candidate = createActionCandidate({
        label: opts.actionTarget ?? "Nouvelle action",
        proposed_by: "sophia",
        status: "exploring", // Start in exploring, not awaiting_confirm
      })
      const updated = upsertCreateActionFlow({ tempMemory, candidate })
      tempMemory = updated.tempMemory
      nextMode = "architect"
      break
    }

    case "track_progress": {
      nextMode = "architect"
      break
    }

    case "topic_light": {
      const topic = opts.actionTarget ?? opts.summaries[0] ?? "un sujet"
      const updated = upsertTopicLight({ tempMemory, topic, phase: "opening" })
      tempMemory = updated.tempMemory
      nextMode = "companion"
      break
    }

    case "topic_serious": {
      const topic = opts.actionTarget ?? opts.summaries[0] ?? "un sujet important"
      const updated = upsertTopicSerious({ tempMemory, topic, phase: "opening" })
      tempMemory = updated.tempMemory
      nextMode = "architect"
      break
    }

    case "deep_reasons": {
      const topic = opts.actionTarget ?? opts.summaries[0] ?? "un blocage motivationnel"
      const updated = upsertDeepReasonsExploration({
        tempMemory,
        topic,
        phase: "exploring", // User already consented, go to exploring
        source: "deferred",
      })
      tempMemory = updated.tempMemory
      nextMode = "architect"
      break
    }

    case "user_profile_confirmation": {
      const queuedFacts = Array.isArray((tempMemory as any)?.[opts.profileConfirmDeferredKey])
        ? (tempMemory as any)[opts.profileConfirmDeferredKey] as ProfileFactToConfirm[]
        : []
      if (queuedFacts.length > 0) {
        const result = upsertProfileConfirmation({
          tempMemory,
          factsToAdd: queuedFacts,
          now: new Date(),
        })
        tempMemory = result.tempMemory
      }
      const next = { ...(tempMemory ?? {}) }
      delete next[opts.profileConfirmDeferredKey]
      tempMemory = next
      nextMode = "companion"
      break
    }

    case "checkup": {
      ;(tempMemory as any).__checkup_entry_pending = true
      ;(tempMemory as any).__ask_checkup_confirmation = false // Already got consent
      nextMode = "investigator"
      break
    }
  }

  return { tempMemory, nextMode }
}
