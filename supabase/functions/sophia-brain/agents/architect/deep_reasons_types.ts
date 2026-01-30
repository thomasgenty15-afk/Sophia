/**
 * Deep Reasons Exploration - Types
 * 
 * This module defines the types for the "Deep Reasons Stimulation" flow,
 * which helps users explore motivational/identity-level blockers (not just practical ones).
 */

// ═══════════════════════════════════════════════════════════════════════════════
// STATE MACHINE PHASES
// ═══════════════════════════════════════════════════════════════════════════════

export type DeepReasonsPhase =
  | "re_consent"     // S0: Verify user is still OK to explore (used when resuming deferred)
  | "clarify"        // S1: "What happens just before you disengage?"
  | "hypotheses"     // S2: Propose hypotheses (fear, cost, identity, meaning, energy)
  | "resonance"      // S3: "Which one resonates most?"
  | "intervention"   // S4: Adapt intervention (friction, meaning, reframing, ambivalence)
  | "closing"        // S5: Micro-commitment + safe close

// ═══════════════════════════════════════════════════════════════════════════════
// DETECTED PATTERNS
// ═══════════════════════════════════════════════════════════════════════════════

export type DeepReasonsPattern =
  | "fear"           // Peur (de l'échec, du jugement, de ne pas être à la hauteur)
  | "meaning"        // Manque de sens (je sais pas pourquoi je fais ça)
  | "energy"         // Manque d'énergie (flemme chronique, épuisement)
  | "ambivalence"    // Ambivalence (partie de moi veut, partie ne veut pas)
  | "identity"       // Identité (je ne suis pas quelqu'un qui fait ça)
  | "unknown"        // Pattern pas encore identifié

// ═══════════════════════════════════════════════════════════════════════════════
// INTERVENTION TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type DeepReasonsInterventionType =
  | "reduce_friction"      // Design d'habitude, enlever les obstacles
  | "reconnect_meaning"    // Reconnecter au sens / valeurs / "pourquoi"
  | "reframe_fear"         // Recadrage + micro-expériences
  | "negotiate_ambivalence" // Style motivational interviewing

// ═══════════════════════════════════════════════════════════════════════════════
// OUTCOMES
// ═══════════════════════════════════════════════════════════════════════════════

export type DeepReasonsOutcome =
  | "resolved"            // On a trouvé une raison + micro-plan
  | "defer_continue"      // Trop lourd maintenant → replanifier
  | "user_stop"           // L'utilisateur veut arrêter
  | "needs_human_support" // Signaux de détresse détectés → escalade firefighter

// ═══════════════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════════════

export interface DeepReasonsActionContext {
  id?: string
  title: string
}

export interface DeepReasonsState {
  /** Current phase of the exploration */
  phase: DeepReasonsPhase
  /** Action context (can be empty if general blocker) */
  action_context?: DeepReasonsActionContext
  /** Initially detected pattern (can be refined) */
  detected_pattern: DeepReasonsPattern
  /** What the user said verbatim (short) */
  user_words: string
  /** Hypothesis selected by user during resonance phase */
  selected_hypothesis?: string
  /** Type of intervention chosen based on resonance */
  intervention_type?: DeepReasonsInterventionType
  /** Micro-commitment proposed during closing */
  micro_commitment?: string
  /** Source of the exploration (deferred from bilan or direct) */
  source: "deferred" | "direct"
  /** Timestamp when the exploration started */
  started_at: string
  /** Number of turns in this exploration */
  turn_count: number
  /** User can always stop - this is always true (design principle) */
  user_can_stop_anytime: true
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEFERRED TOPIC EXTENSION (for deep_reasons type)
// ═══════════════════════════════════════════════════════════════════════════════

export interface DeepReasonsDeferredContext {
  action_id?: string
  action_title?: string
  detected_pattern: DeepReasonsPattern
  user_words: string
}

export interface EnrichedDeferredTopic {
  /** The topic description (e.g., "ton blocage sur la méditation") */
  topic: string
  /** Type of deferred topic */
  type: "standard" | "deep_reasons"
  /** Source of the deferral */
  source: "user_digression" | "user_explicit_defer" | "assistant_defer" | "investigator_deep"
  /** Additional context (only for deep_reasons type) */
  context?: DeepReasonsDeferredContext
  /** When the topic was deferred */
  created_at: string
  /** Priority for reprise */
  priority: "low" | "medium" | "high"
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export function createDeepReasonsState(opts: {
  phase?: DeepReasonsPhase
  action_context?: DeepReasonsActionContext
  detected_pattern: DeepReasonsPattern
  user_words: string
  source: "deferred" | "direct"
}): DeepReasonsState {
  return {
    phase: opts.phase ?? (opts.source === "deferred" ? "re_consent" : "clarify"),
    action_context: opts.action_context,
    detected_pattern: opts.detected_pattern,
    user_words: opts.user_words,
    source: opts.source,
    started_at: new Date().toISOString(),
    turn_count: 0,
    user_can_stop_anytime: true,
  }
}

export function createDeepReasonsDeferredTopic(opts: {
  action_id?: string
  action_title: string
  detected_pattern: DeepReasonsPattern
  user_words: string
}): EnrichedDeferredTopic {
  return {
    topic: `ton blocage sur ${opts.action_title}`,
    type: "deep_reasons",
    source: "investigator_deep",
    context: {
      action_id: opts.action_id,
      action_title: opts.action_title,
      detected_pattern: opts.detected_pattern,
      user_words: opts.user_words,
    },
    created_at: new Date().toISOString(),
    priority: "high",
  }
}

/**
 * Check if a deferred topic is a deep_reasons type
 */
export function isDeepReasonsDeferredTopic(topic: unknown): topic is EnrichedDeferredTopic {
  if (!topic || typeof topic !== "object") return false
  const t = topic as any
  return t.type === "deep_reasons" && typeof t.topic === "string"
}

/**
 * Get the next phase in the state machine (for normal progression)
 */
export function getNextDeepReasonsPhase(current: DeepReasonsPhase): DeepReasonsPhase | null {
  const progression: Record<DeepReasonsPhase, DeepReasonsPhase | null> = {
    re_consent: "clarify",
    clarify: "hypotheses",
    hypotheses: "resonance",
    resonance: "intervention",
    intervention: "closing",
    closing: null, // End of flow
  }
  return progression[current]
}

/**
 * Determine intervention type based on detected pattern
 */
export function suggestInterventionType(pattern: DeepReasonsPattern): DeepReasonsInterventionType {
  const mapping: Record<DeepReasonsPattern, DeepReasonsInterventionType> = {
    fear: "reframe_fear",
    meaning: "reconnect_meaning",
    energy: "reduce_friction",
    ambivalence: "negotiate_ambivalence",
    identity: "reconnect_meaning",
    unknown: "reduce_friction",
  }
  return mapping[pattern]
}


