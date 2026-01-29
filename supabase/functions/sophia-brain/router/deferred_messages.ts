/**
 * Message templates for deferred topics system.
 * 
 * These generate natural, contextual messages for:
 * - Acknowledging deferred signals
 * - Post-parenthesis resume questions
 * - Context when resuming
 */

import type { DeferredTopicV2, DeferredMachineType, PausedMachineState } from "./deferred_topics_v2.ts"
import type { PausedMachineStateV2 } from "../supervisor.ts"

// ═══════════════════════════════════════════════════════════════════════════════
// ACKNOWLEDGMENT PREFIXES (injected before agent response)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate acknowledgment prefix when a signal is deferred.
 * This is prepended to the agent's response.
 */
export function generateAcknowledgmentPrefix(opts: {
  machine_type: DeferredMachineType
  action_target?: string
  isUpdate?: boolean
}): string {
  const target = opts.action_target?.trim()
  
  // If it's an UPDATE (same topic mentioned again), be subtle
  if (opts.isUpdate) {
    return target 
      ? `Je note aussi pour ${target}. ` 
      : `Je note. `
  }
  
  // Different phrasing based on machine type
  switch (opts.machine_type) {
    case "breakdown_action":
      return target
        ? `J'ai noté pour ${target}, on s'en occupe juste après ! `
        : `J'ai noté, on voit ça juste après ! `
    
    case "create_action":
      return target
        ? `J'ai bien noté pour "${target}", on crée ça ensuite ! `
        : `J'ai noté ton idée d'action, on en reparle juste après ! `
    
    case "update_action":
      return target
        ? `J'ai noté la modif pour ${target}, on fait ça ensuite ! `
        : `J'ai noté la modification, on s'en occupe juste après ! `
    
    case "deep_reasons":
      return target
        ? `J'ai noté qu'on devrait creuser ${target}, on en parlera après. `
        : `J'ai noté qu'il y a quelque chose à explorer, on en reparlera. `
    
    case "topic_serious":
      return target
        ? `J'ai noté qu'on devrait parler de ${target}, on y reviendra. `
        : `J'ai noté ce sujet, on y reviendra après. `
    
    case "topic_light":
      return target
        ? `Ah oui ${target} ! On en reparle juste après. `
        : `Bien noté, on en reparle après ! `
    
    default:
      return target
        ? `J'ai noté pour ${target}, on en reparle après. `
        : `J'ai noté, on en reparle après. `
  }
}

/**
 * Generate a very subtle acknowledgment for UPDATE (same subject mentioned again).
 * Returns empty string if we should stay completely silent.
 */
export function generateSubtleUpdateAck(opts: {
  machine_type: DeferredMachineType
  action_target?: string
  triggerCount: number
}): string {
  // If mentioned 3+ times, stay silent to avoid being annoying
  if (opts.triggerCount >= 3) {
    return ""
  }
  
  // Second mention: subtle acknowledgment
  if (opts.triggerCount === 2) {
    return opts.action_target 
      ? `(Noté aussi pour ${opts.action_target}) ` 
      : ""
  }
  
  return ""
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST-PARENTHESIS MESSAGES (after sentry/firefighter)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate the "do you want to resume?" question after sentry/firefighter.
 */
export function generatePostParenthesisQuestion(opts: {
  pausedMachine: PausedMachineStateV2
  reason: "sentry" | "firefighter"
}): string {
  const context = opts.pausedMachine.action_target 
    ? ` (on travaillait sur ${opts.pausedMachine.action_target})`
    : ""
  
  // Softer phrasing after emotional support
  if (opts.reason === "firefighter") {
    return `Tu as l'air d'aller un peu mieux. Tu veux qu'on reprenne ce qu'on faisait${context}, ou tu preferes souffler un peu ?`
  }
  
  // After sentry (more serious)
  return `Je suis content qu'on ait pu en parler. Si tu te sens pret, on peut reprendre ce qu'on faisait${context}. Sinon, prends ton temps, je suis la. Qu'est-ce que tu preferes ?`
}

/**
 * Generate message when user declines to resume after parenthesis.
 */
export function generateDeclineResumeMessage(): string {
  return `Ok, prends soin de toi. Je serai la quand tu voudras reprendre.`
}

/**
 * Generate message when resuming after parenthesis.
 */
export function generateResumeMessage(opts: {
  pausedMachine: PausedMachineStateV2
}): string {
  const machineType = opts.pausedMachine.machine_type
  const target = opts.pausedMachine.action_target
  
  switch (machineType) {
    case "breakdown_action_flow":
      return target
        ? `Ok, on reprend ! Pour ${target}, tu me disais que ça bloquait. Où est-ce qu'on en était ?`
        : `Ok, on reprend ! Tu voulais qu'on débloque une action. On en était où ?`
    
    case "create_action_flow":
      return target
        ? `Ok, on reprend ! On créait "${target}". Tu confirmes les paramètres ?`
        : `Ok, on reprend la création d'action. Où on en était ?`
    
    case "update_action_flow":
      return target
        ? `Ok, on reprend ! On modifiait ${target}. Tu veux toujours faire ce changement ?`
        : `Ok, on reprend la modification. Tu veux toujours la faire ?`
    
    case "deep_reasons_exploration":
      return target
        ? `Ok, on reprend notre exploration sur ${target}. Qu'est-ce qui te revient ?`
        : `Ok, on reprend notre discussion. Qu'est-ce qui te revient ?`
    
    case "topic_serious":
    case "topic_light":
      return target
        ? `Ok, on reprend ! On parlait de ${target}.`
        : `Ok, on reprend notre discussion !`
    
    default:
      return `Ok, on reprend là où on en était !`
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUTO-RELAUNCH MESSAGES (when processing deferred after machine ends)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate transition message when auto-relaunching from deferred.
 * Since auto-resume is "silent", this is a short, natural transition.
 */
export function generateAutoRelaunchIntro(opts: {
  topic: DeferredTopicV2
}): string {
  const target = opts.topic.action_target
  const machineType = opts.topic.machine_type
  
  // Get the most recent summary if available
  const latestSummary = opts.topic.signal_summaries.length > 0
    ? opts.topic.signal_summaries[opts.topic.signal_summaries.length - 1].summary
    : null
  
  switch (machineType) {
    case "breakdown_action":
      if (target && latestSummary) {
        return `Maintenant pour ${target} — tu me disais ${latestSummary.toLowerCase()}. Qu'est-ce qui bloque exactement ?`
      }
      return target
        ? `Maintenant pour ${target}, qu'est-ce qui bloque ?`
        : `Tu voulais qu'on débloque une action. Laquelle ?`
    
    case "create_action":
      return target
        ? `Maintenant, tu voulais créer "${target}". On s'y met ?`
        : `Tu voulais créer une action. Laquelle ?`
    
    case "update_action":
      return target
        ? `Maintenant pour modifier ${target} — qu'est-ce que tu veux changer ?`
        : `Tu voulais modifier une action. Laquelle ?`
    
    case "deep_reasons":
      return target
        ? `Tu voulais qu'on creuse un peu plus ${target}. Tu veux qu'on en parle ?`
        : `Tu voulais qu'on explore quelque chose de plus profond. Tu veux en parler ?`
    
    case "topic_serious":
    case "topic_light":
      return target
        ? `Au fait, tu voulais parler de ${target}. On y va ?`
        : `Tu voulais qu'on discute de quelque chose. C'était quoi ?`
    
    default:
      return target
        ? `On avait noté ${target}. Tu veux qu'on s'en occupe ?`
        : `On avait noté quelque chose. Tu veux qu'on en parle ?`
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUMMARY MERGING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a simple merged summary from multiple signal summaries.
 * This is a fallback when LLM is not available.
 */
export function generateSimpleMergedSummary(summaries: string[]): string {
  if (summaries.length === 0) return ""
  if (summaries.length === 1) return summaries[0]
  
  // Take the most recent (last) as primary, mention count
  const primary = summaries[summaries.length - 1]
  const count = summaries.length
  
  return `${primary} (mentionné ${count} fois)`
}

// ═══════════════════════════════════════════════════════════════════════════════
// DETECTION HELPERS (for user responses)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if user's response to post-parenthesis question is "yes" (wants to resume).
 */
export function looksLikeWantsToResume(message: string): boolean {
  const s = String(message ?? "").trim().toLowerCase()
  if (!s) return false
  
  // Positive signals
  return /\b(oui|ok|d['']accord|vas[-\s]?y|go|on\s+reprend|on\s+continue|je\s+veux\s+reprendre|allez|c['']est\s+bon)\b/i.test(s)
}

/**
 * Check if user's response to post-parenthesis question is "no" (wants to rest).
 */
export function looksLikeWantsToRest(message: string): boolean {
  const s = String(message ?? "").trim().toLowerCase()
  if (!s) return false
  
  // Negative signals / want to rest
  return /\b(non|pas\s+maintenant|plus\s+tard|je\s+souffle|je\s+me\s+repose|je\s+préfère\s+(?:souffler|me\s+reposer|attendre)|laisse\s+tomber|on\s+verra|une\s+autre\s+fois)\b/i.test(s)
}

/**
 * Check if last assistant message asked the resume question.
 */
export function lastAssistantAskedResumeQuestion(lastAssistantMessage: string): boolean {
  const s = String(lastAssistantMessage ?? "").toLowerCase()
  if (!s) return false
  
  // Check for characteristic phrases from generatePostParenthesisQuestion
  return (
    (/tu\s+veux\s+qu['']on\s+reprenne/i.test(s) && /souffler/i.test(s)) ||
    (/on\s+peut\s+reprendre/i.test(s) && /prends?\s+ton\s+temps/i.test(s)) ||
    /qu['']est[-\s]ce\s+que\s+tu\s+préfères/i.test(s)
  )
}

