import type { AgentMode } from "../state-manager.ts"
import { generateWithGemini } from "../../_shared/gemini.ts"

// ═══════════════════════════════════════════════════════════════════════════════
// DISPATCHER V2: STRUCTURED SIGNALS
// Goal: IA interprets the turn → produces signals → Supervisor applies deterministic policy
// ═══════════════════════════════════════════════════════════════════════════════

export type SafetyLevel = "NONE" | "FIREFIGHTER" | "SENTRY"
export type UserIntentPrimary = "CHECKUP" | "EMOTIONAL_SUPPORT" | "SMALL_TALK" | "PREFERENCE" | "UNKNOWN"
export type InterruptKind = "NONE" | "EXPLICIT_STOP" | "BORED" | "SWITCH_TOPIC" | "DIGRESSION"
export type FlowResolutionKind = "NONE" | "ACK_DONE" | "WANTS_RESUME" | "DECLINES_RESUME" | "WANTS_PAUSE"
export type TopicDepth = "NONE" | "NEED_SUPPORT" | "SERIOUS" | "LIGHT"
export type UserEngagementLevel = "HIGH" | "MEDIUM" | "LOW" | "DISENGAGED"

export interface DispatcherSignals {
  safety: {
    level: SafetyLevel
    confidence: number // 0..1
    immediacy?: "acute" | "non_acute" | "unknown"
  }
  user_intent_primary: UserIntentPrimary
  user_intent_confidence: number // 0..1
  interrupt: {
    kind: InterruptKind
    confidence: number // 0..1
    /** If DIGRESSION or SWITCH_TOPIC, the formalized topic to defer (e.g., "la situation avec ton boss") */
    deferred_topic_formalized?: string | null
  }
  flow_resolution: {
    kind: FlowResolutionKind
    confidence: number // 0..1
  }
  /**
   * Topic depth analysis for topic_exploration routing:
   * - NONE: no topic exploration needed
   * - NEED_SUPPORT: emotional support needed → firefighter
   * - SERIOUS: deep topic (psyche, problems, fears) → topic_exploration owner=architect
   * - LIGHT: casual topic (small talk, anecdotes) → topic_exploration owner=companion
   * - plan_focus: true if the discussion is about the plan/objectives (not tool operations)
   */
  topic_depth: {
    value: TopicDepth
    confidence: number // 0..1
    plan_focus?: boolean  // true if discussion is about plan/objectives (not tool operations)
  }
  /**
   * Deep reasons exploration signals:
   * - opportunity: user expresses a motivational blocker (not practical)
   * - action_mentioned: user mentions a specific action/habit from their plan
   * - deferred_ready: a deep_reasons deferred topic exists and moment is opportune
   * - in_bilan_context: true if during active bilan (Investigator handles)
   */
  deep_reasons: {
    opportunity: boolean
    action_mentioned: boolean  // true if blocker is about a specific action
    action_hint?: string       // extracted action name if mentioned (e.g., "méditation", "sport")
    deferred_ready: boolean
    in_bilan_context: boolean
    confidence: number // 0..1
  }
  /**
   * Needs detailed explanation (librarian escalation):
   * - value: true if user asks a complex question needing structured explanation
   * - reason: why explanation is needed (e.g., "question complexe", "demande de mécanisme")
   */
  needs_explanation: {
    value: boolean
    confidence: number // 0..1
    reason?: string
  }
  /**
   * User engagement level during topic exploration:
   * - HIGH: enthusiastic, asking follow-up questions, long responses
   * - MEDIUM: engaged but neutral
   * - LOW: short responses, declining interest
   * - DISENGAGED: one-word answers, wants to move on
   */
  user_engagement: {
    level: UserEngagementLevel
    confidence: number // 0..1
  }
  /**
   * Topic satisfaction detection:
   * - detected: user seems satisfied/understood ("merci", "je vois", "ok ça m'aide")
   */
  topic_satisfaction: {
    detected: boolean
    confidence: number // 0..1
  }
  /**
   * Create action flow signals (v2 simplified):
   * - intent_strength: how clearly the user wants to create an action
   * - sophia_suggested: true if Sophia suggested an action in her last message
   * - user_response: user's response to a preview/suggestion
   * - modification_info: whether user provided modification details
   * - action_type_hint: detected type of action
   */
  create_action: {
    intent_strength: "explicit" | "implicit" | "exploration" | "none"
    sophia_suggested: boolean
    user_response: "yes" | "no" | "modify" | "unclear" | "none"
    modification_info: "available" | "missing" | "none"
    action_type_hint: "habit" | "mission" | "framework" | "unknown"
    action_label_hint?: string  // extracted action label if detected
    confidence: number // 0..1
  }
  /**
   * Update action flow signals (v2 simplified):
   * - detected: user wants to modify an existing action
   * - target_hint: the action being modified
   * - change_type: what kind of change
   * - new_value_hint: the proposed new value
   * - user_response: response to a preview
   */
  update_action: {
    detected: boolean
    target_hint?: string                // "lecture", "sport"
    change_type: "frequency" | "days" | "time" | "title" | "mixed" | "unknown"
    new_value_hint?: string             // "5x", "lundi mercredi"
    user_response: "yes" | "no" | "modify" | "unclear" | "none"
    confidence: number // 0..1
  }
  /**
   * Breakdown action flow signals (v2):
   * - detected: user wants to break down an action into micro-steps
   * - target_hint: the action to break down
   * - blocker_hint: what's blocking them (if mentioned)
   * - sophia_suggested: Sophia proposed breakdown
   * - user_response: response to a preview
   */
  breakdown_action: {
    detected: boolean
    target_hint?: string                // "sport", "lecture"
    blocker_hint?: string               // "trop dur", "pas le temps"
    sophia_suggested: boolean
    user_response: "yes" | "no" | "unclear" | "none"
    confidence: number // 0..1
  }
  /**
   * Track progress flow signals:
   * - detected: user wants to log progress on an action (done, missed, partial)
   * - target_hint: the action being tracked
   * - status_hint: what happened (completed, missed, partial)
   * - value_hint: optional numeric value
   */
  track_progress: {
    detected: boolean
    target_hint?: string                // "sport", "méditation", "lecture"
    status_hint: "completed" | "missed" | "partial" | "unknown"
    value_hint?: number                 // optional: 1 for done, 0 for missed
    confidence: number // 0..1
  }
  /**
   * Activate action flow signals:
   * - detected: user wants to activate a dormant/future action from their plan
   * - target_hint: the action to activate
   * - exercise_type_hint: if it's a specific exercise (e.g., "attrape-reves")
   */
  activate_action: {
    detected: boolean
    target_hint?: string                // "sport", "méditation", "attrape-reves"
    exercise_type_hint?: string         // specific exercise name if detected
    confidence: number // 0..1
  }
  /**
   * Safety resolution signals (for active safety flows):
   * - user_confirms_safe: user explicitly confirms they are safe
   * - stabilizing_signal: user shows signs of calming ("ça va mieux", "merci", etc.)
   * - symptoms_still_present: user still mentions physical/emotional symptoms
   * - external_help_mentioned: user mentions contacting help (SAMU, ami, médecin)
   * - escalate_to_sentry: situation became life-threatening (firefighter → sentry)
   */
  safety_resolution: {
    user_confirms_safe: boolean
    stabilizing_signal: boolean
    symptoms_still_present: boolean
    external_help_mentioned: boolean
    escalate_to_sentry: boolean
    confidence: number // 0..1
  }
  /**
   * Deferred signal (computed by router when machine is active):
   * - should_defer: true if this signal should be deferred (machine active, not safety)
   * - machine_type: which machine type this signal would trigger
   * - action_target: for tool flows, the specific action
   * - summary: concise summary for deferred topic (max 100 chars)
   * - deferred_action: create new or update existing deferred topic
   * - matching_deferred_id: if updating, the ID of existing topic
   */
  deferred_signal?: {
    should_defer: boolean
    machine_type: "deep_reasons" | "topic_light" | "topic_serious" | 
                  "create_action" | "update_action" | "breakdown_action" |
                  "track_progress" | "activate_action"
    action_target?: string
    summary: string
    deferred_action: "create" | "update" | "ignore"
    matching_deferred_id?: string
  }
  /**
   * Consent to relaunch signal (when a pending relaunch consent exists):
   * - value: true if user consents, false if user declines, "unclear" if ambiguous
   * - This signal is PRIORITARY when a __pending_relaunch_consent exists
   */
  consent_to_relaunch?: {
    value: true | false | "unclear"
    confidence: number // 0..1
  }
  wants_tools: boolean
  risk_score: number // 0..10 (legacy compatibility)
}

// ═══════════════════════════════════════════════════════════════════════════════
// SIGNAL HISTORY V1: Contextual Dispatcher with deduplication
// ═══════════════════════════════════════════════════════════════════════════════

export type SignalHistoryStatus = "pending" | "in_machine" | "deferred" | "resolved"

/**
 * A signal that was detected in a previous turn.
 * Used to prevent duplication and allow brief enrichment.
 */
export interface SignalHistoryEntry {
  /** Signal type (e.g., "breakdown_intent", "create_action_intent") */
  signal_type: string
  /** Turn index relative to current (0 = current, -1 = previous, etc.) */
  turn_index: number
  /** Brief description of the signal context (max 100 chars) */
  brief: string
  /** Current status of this signal */
  status: SignalHistoryStatus
  /** For tool signals: the specific action target (e.g., "sport", "lecture") */
  action_target?: string
  /** ISO timestamp when the signal was first detected */
  detected_at: string
}

/**
 * Enhanced dispatcher input with context and history.
 */
export interface DispatcherInputV2 {
  /** Current user message */
  userMessage: string
  /** Last assistant message (for context) */
  lastAssistantMessage: string
  /** Last 10 messages (5 turns) for contextual understanding */
  last5Messages: Array<{ role: string; content: string }>
  /** Signals from last 5 turns (for deduplication) */
  signalHistory: SignalHistoryEntry[]
  /** Currently active state machine (null if none) */
  activeMachine: string | null
  /** State snapshot (existing fields) */
  stateSnapshot: {
    current_mode?: string
    investigation_active?: boolean
    investigation_status?: string
    toolflow_active?: boolean
    toolflow_kind?: string
    profile_confirm_pending?: boolean
    plan_confirm_pending?: boolean
    topic_exploration_phase?: string
    topic_exploration_type?: string
    risk_level?: string
  }
  /** Flow context for enriching machine-specific prompts */
  flowContext?: FlowContext
}

/**
 * New signal detected on the current turn.
 */
export interface NewSignalEntry {
  /** Signal type (mother signal identifier) */
  signal_type: string
  /** Brief description for deferred topic (max 100 chars) */
  brief: string
  /** Detection confidence (0..1) */
  confidence: number
  /** For tool signals: the specific action target */
  action_target?: string
}

/**
 * Enrichment for an existing signal (update brief with new context).
 */
export interface SignalEnrichment {
  /** Signal type to update */
  existing_signal_type: string
  /** Updated brief with new context */
  updated_brief: string
}

/**
 * Profile fact types for direct detection (10 types).
 * Each fact has a value (extracted from message) and confidence score.
 */
export type ProfileFactType =
  | "work_schedule"     // "9h-18h", "mi-temps", "freelance"
  | "energy_peaks"      // "matin", "soir", "après-midi"
  | "wake_time"         // "6h30", "7h"
  | "sleep_time"        // "23h", "minuit"
  | "job"               // "dev", "médecin", "prof"
  | "hobbies"           // "course, lecture"
  | "family"            // "2 enfants", "célibataire"
  | "tone_preference"   // "direct", "doux", "cash"
  | "emoji_preference"  // "avec emojis", "sans emojis"
  | "verbosity"         // "concis", "détaillé"

export interface ProfileFactDetected {
  value: string         // The extracted value to confirm
  confidence: number    // 0-1
}

export interface ProfileFactsDetected {
  work_schedule?: ProfileFactDetected
  energy_peaks?: ProfileFactDetected
  wake_time?: ProfileFactDetected
  sleep_time?: ProfileFactDetected
  job?: ProfileFactDetected
  hobbies?: ProfileFactDetected
  family?: ProfileFactDetected
  tone_preference?: ProfileFactDetected
  emoji_preference?: ProfileFactDetected
  verbosity?: ProfileFactDetected
}

/**
 * Machine-specific signals (varies by active machine).
 */
export interface MachineSignals {
  // create_action_flow
  user_confirms_preview?: "yes" | "no" | "modify" | "unclear" | null
  action_type_clarified?: "habit" | "mission" | "framework" | null
  user_abandons?: boolean
  modification_requested?: string | null
  
  // update_action_flow
  user_confirms_change?: "yes" | "no" | "modify" | "unclear" | null
  new_value_provided?: string | null
  
  // breakdown_action_flow
  user_confirms_microstep?: "yes" | "no" | null
  user_wants_different_step?: boolean
  blocker_clarified?: string | null
  
  // topic_exploration
  user_engagement?: "HIGH" | "MEDIUM" | "LOW" | "DISENGAGED"
  topic_satisfaction?: { detected: boolean }
  wants_to_change_topic?: boolean
  needs_deeper_exploration?: boolean
  
  // deep_reasons_exploration
  user_opens_up?: boolean
  resistance_detected?: boolean
  insight_emerged?: boolean
  wants_to_stop?: boolean
  
  // activate_action_flow
  user_confirms_activation?: boolean | null
  user_wants_different_action?: string | null
  activation_ready?: boolean
  
  // user_profile_confirmation (when machine is active)
  user_confirms_fact?: "yes" | "no" | "nuance" | null
  user_provides_correction?: string | null
  fact_type_detected?: string | null
  
  // Profile facts detection (direct, no mother signal)
  // Detected when NO profile confirmation is active - triggers confirmation flow
  profile_facts_detected?: ProfileFactsDetected
  
  // bilan/investigation (signals for post-bilan processing)
  breakdown_recommended?: boolean
  deep_reasons_opportunity?: boolean
  create_action_intent?: boolean
  update_action_intent?: boolean
  user_consents_defer?: boolean
  
  // bilan/investigation (confirmation signals for deferred machines)
  // These capture user's response to "tu veux qu'on en parle après le bilan ?"
  confirm_deep_reasons?: boolean | null    // User confirms/declines deep reasons exploration after bilan
  confirm_breakdown?: boolean | null       // User confirms/declines micro-step breakdown after bilan
  confirm_topic?: boolean | null           // User confirms/declines topic exploration after bilan
  
  // Checkup flow signals
  checkup_intent?: {
    detected: boolean
    confidence: number
    trigger_phrase?: string
  }
  wants_to_checkup?: boolean  // User response to "tu veux faire le bilan?"
  track_from_bilan_done_ok?: boolean  // User wants track_progress when bilan already done
}

/**
 * Enhanced dispatcher output with new signals and enrichments.
 */
export interface DispatcherOutputV2 {
  /** Existing signals (backward compatible) */
  signals: DispatcherSignals
  /** NEW: Signals detected on last turn only (not already in history) */
  new_signals: NewSignalEntry[]
  /** NEW: Enrichments for existing signals in history */
  enrichments: SignalEnrichment[]
  /** NEW: Machine-specific signals (only present if a machine is active) */
  machine_signals?: MachineSignals
  /** NEW: Enrichment for an existing deferred topic (instead of creating new signal) */
  deferred_enrichment?: {
    topic_id: string
    new_brief: string
  }
}

const DEFAULT_SIGNALS: DispatcherSignals = {
  safety: { level: "NONE", confidence: 0.9 },
  user_intent_primary: "UNKNOWN",
  user_intent_confidence: 0.5,
  interrupt: { kind: "NONE", confidence: 0.9 },
  flow_resolution: { kind: "NONE", confidence: 0.9 },
  topic_depth: { value: "NONE", confidence: 0.9, plan_focus: false },
  deep_reasons: { opportunity: false, action_mentioned: false, deferred_ready: false, in_bilan_context: false, confidence: 0.9 },
  needs_explanation: { value: false, confidence: 0.9 },
  user_engagement: { level: "MEDIUM", confidence: 0.5 },
  topic_satisfaction: { detected: false, confidence: 0.5 },
  create_action: {
    intent_strength: "none",
    sophia_suggested: false,
    user_response: "none",
    modification_info: "none",
    action_type_hint: "unknown",
    confidence: 0.5,
  },
  update_action: {
    detected: false,
    change_type: "unknown",
    user_response: "none",
    confidence: 0.5,
  },
  breakdown_action: {
    detected: false,
    sophia_suggested: false,
    user_response: "none",
    confidence: 0.5,
  },
  track_progress: {
    detected: false,
    status_hint: "unknown",
    confidence: 0.5,
  },
  activate_action: {
    detected: false,
    confidence: 0.5,
  },
  safety_resolution: {
    user_confirms_safe: false,
    stabilizing_signal: false,
    symptoms_still_present: false,
    external_help_mentioned: false,
    escalate_to_sentry: false,
    confidence: 0.5,
  },
  wants_tools: false,
  risk_score: 0,
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTEXTUAL DISPATCHER V1: Dynamic prompt building
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Mother signals - always analyzed regardless of active machine.
 * These are high-level signals that can trigger new state machines.
 * RULE: Only ONE mother signal per message (except safety).
 */
const MOTHER_SIGNALS_SECTION = `
=== SIGNAUX MERE ===
Ces signaux detectent de nouvelles intentions (mises en attente si machine active).

╔════════════════════════════════════════════════════════════════════════════════╗
║  REGLE D'OR: UN SEUL signal mere par message (hors safety)                     ║
╠════════════════════════════════════════════════════════════════════════════════╣
║  Si tu detectes plusieurs intentions, CHOISIS la plus pertinente selon:        ║
║  1. L'impact emotionnel le plus fort                                           ║
║  2. Ce qui repond le plus directement au message                               ║
║  Les autres intentions seront detectees aux tours suivants si l'utilisateur    ║
║  y revient.                                                                    ║
╚════════════════════════════════════════════════════════════════════════════════╝

EXCEPTION ABSOLUE: safety (firefighter/sentry) est TOUJOURS detecte, meme si 
un autre signal mere est present. La securite prime sur tout.

SIGNAUX MERE DISPONIBLES (1 seul parmi ceux-ci):
- create_action_intent: Intention de creer une action
- update_action_intent: Intention de modifier une action existante
- breakdown_action_intent: Intention de decomposer/simplifier une action
- topic_exploration_intent: Envie de parler d'un sujet (serious ou light)
- deep_reasons_intent: Blocage motivationnel profond detecte
- checkup_intent: Demande de bilan/checkup quotidien
- activate_action_intent: Veut activer une action dormante/future

RAPPEL: Tu ne peux en flaguer qu'UN SEUL par message (+ safety si danger).
`

/**
 * Checkup intent detection - detect when user wants to do their daily checkup.
 * This is a mother signal that triggers the checkup flow.
 */
const CHECKUP_INTENT_DETECTION_SECTION = `
=== DETECTION CHECKUP_INTENT ===
Detecte si l'utilisateur veut faire son BILAN (checkup quotidien).

MOTS-CLES / EXPRESSIONS A DETECTER:
- Explicites: "bilan", "check", "checkup", "faire le point", "on check", "check du soir"
- Implicites: "comment ca s'est passe aujourd'hui", "je veux voir mes actions", "on fait le tour"
- Confirmation: "oui" apres proposition de bilan par Sophia ("tu veux qu'on fasse le bilan?")

ATTENTION - NE PAS CONFONDRE:
- "j'ai fait X" = track_progress, PAS checkup
- "je veux modifier mon plan" = update_action, PAS checkup
- Discussion sur une action specifique = PAS checkup
- "j'ai pas fait X" hors bilan = track_progress, PAS checkup

SORTIE JSON (dans machine_signals):
{
  "checkup_intent": {
    "detected": true | false,
    "confidence": 0.0-1.0,
    "trigger_phrase": "phrase exacte qui a declenche" | null
  }
}
`

/**
 * Profile facts detection - direct detection of 10 fact types.
 * No mother signal - we detect specific facts directly for immediate confirmation.
 */
const PROFILE_FACTS_DETECTION_SECTION = `
=== DETECTION FAITS PERSONNELS (10 types) ===
Si le message revele UN OU PLUSIEURS faits personnels, signale-les DIRECTEMENT dans profile_facts_detected.
Ces signaux sont SILENCIEUX (pas d'ack a l'utilisateur) et declenchent une confirmation si confidence >= 0.7.

FAITS A DETECTER:
1. work_schedule: horaires de travail ("je bosse de 9h a 18h", "mi-temps", "teletravail")
2. energy_peaks: moments d'energie ("plus efficace le matin", "creve le soir", "sieste l'aprem")
3. wake_time: heure de reveil ("je me leve a 6h30", "debout a 7h")
4. sleep_time: heure de coucher ("je me couche vers 23h", "au lit a minuit")
5. job: metier/profession ("je suis dev", "je travaille dans le medical", "prof de maths")
6. hobbies: loisirs/passions ("j'aime courir", "fan de lecture", "je fais du yoga")
7. family: situation familiale ("j'ai 2 enfants", "je vis seul", "marie depuis 5 ans")
8. tone_preference: preference de ton ("sois direct avec moi", "j'aime quand c'est cash", "doux")
9. emoji_preference: preference emojis ("pas d'emoji stp", "j'adore les emojis", "sans smiley")
10. verbosity: preference longueur ("fais court", "j'aime les explications detaillees", "concis")

REGLE CRITIQUE: Ne signale QUE si c'est EXPLICITE dans le message.
- "je suis fatigue" ≠ energy_peaks (pas de pattern permanent)
- "je me leve tot demain" ≠ wake_time (ponctuel, pas habituel)
- "j'ai couru ce matin" ≠ hobbies (sauf si "j'aime courir", "je fais du running")

SORTIE JSON (dans machine_signals):
{
  "profile_facts_detected": {
    "wake_time": { "value": "6h30", "confidence": 0.9 },
    "job": { "value": "developpeur", "confidence": 0.85 }
  }
}
// Ou omis / {} si aucun fait detecte
`

/**
 * Build the anti-duplication section from signal history.
 * Tells the LLM which signals have already been detected.
 */
function buildAntiDuplicationSection(history: SignalHistoryEntry[]): string {
  if (!history || history.length === 0) return ""
  
  const lines = history.map(h => 
    `- ${h.signal_type}: "${h.brief.slice(0, 60)}" (tour ${h.turn_index}, status=${h.status}${h.action_target ? `, action=${h.action_target}` : ""})`
  )
  
  return `

=== SIGNAUX DEJA DETECTES (NE PAS RE-EMETTRE) ===
${lines.join("\n")}

REGLES ANTI-DUPLICATION:
1. Tu analyses UNIQUEMENT le DERNIER message utilisateur pour les nouveaux signaux
2. Si un signal est deja dans la liste ci-dessus: NE PAS le re-emettre dans new_signals
3. Tu PEUX enrichir le brief d'un signal existant si le dernier message apporte du contexte NOUVEAU
4. Enrichissement = mettre a jour le brief dans "enrichments", PAS creer un nouveau signal
5. Si l'utilisateur parle de la MEME action mais avec un contexte different, c'est un enrichissement
`
}

/**
 * Build the deferred topics section for dispatcher awareness.
 * Shows the dispatcher what topics are waiting in the queue so it can:
 * 1. Avoid re-flagging signals for topics that already exist
 * 2. Produce enrichments for existing topics instead of new signals
 */
function buildDeferredTopicsSection(flowContext?: FlowContext): string {
  const topics = flowContext?.deferredTopicsSummary
  if (!topics || topics.length === 0) return ""
  
  const getMachineLabel = (type: string): string => {
    switch (type) {
      case "topic_serious": return "🎭 Sujet serieux"
      case "topic_light": return "💬 Sujet leger"
      case "deep_reasons": return "🔍 Exploration profonde"
      case "create_action": return "➕ Creation action"
      case "update_action": return "✏️ Modification action"
      case "breakdown_action": return "📋 Decomposition action"
      case "track_progress": return "📊 Suivi progres"
      case "checkup": return "📝 Bilan"
      default: return type
    }
  }
  
  let section = `

=== SUJETS EN ATTENTE (deferred_topics) ===
AVANT de flaguer un nouveau signal, VERIFIE si le sujet existe deja ci-dessous.

`
  
  for (const t of topics) {
    const briefsFormatted = t.briefs.slice(0, 3).map(b => `"${b.slice(0, 80)}"`).join(" / ")
    section += `┌─ ${getMachineLabel(t.machine_type)}${t.action_target ? ` - "${t.action_target}"` : ""} ─┐
│ ID: ${t.id}
│ Briefs (${t.briefs.length}/3): ${briefsFormatted}
│ Detections: ${t.trigger_count} | Age: ${t.age_hours}h
└────────────────────────────────────────────────────┘

`
  }
  
  section += `╔════════════════════════════════════════════════════════════════════════════════╗
║  REGLES DEFERRED TOPICS                                                        ║
╠════════════════════════════════════════════════════════════════════════════════╣
║  1. Si le message ENRICHIT un sujet existant ci-dessus:                        ║
║     → Produis "deferred_enrichment" avec topic_id + new_brief                  ║
║     → NE CREE PAS de nouveau signal                                            ║
║  2. Si le message aborde un sujet VRAIMENT DIFFERENT:                          ║
║     → Tu peux creer un nouveau signal (respecte la regle 1 signal max)         ║
║  3. Le dispatcher NE MODIFIE JAMAIS directement les topics                     ║
║     → Il produit des enrichissements que le router appliquera                  ║
╚════════════════════════════════════════════════════════════════════════════════╝

FORMAT pour enrichissement (dans la sortie JSON):
{
  "deferred_enrichment": {
    "topic_id": "dt_xxx",
    "new_brief": "Nouveau contexte apporte par ce message"
  }
}
`
  
  return section
}

/**
 * Flow context for enriching machine-specific addons.
 */
export interface FlowContext {
  /** For create_action_flow: the action being created */
  actionLabel?: string
  actionType?: string
  actionStatus?: string  // exploring | awaiting_confirm | previewing | created | abandoned
  clarificationCount?: number
  /** For update_action_flow: the action being updated */
  targetActionTitle?: string
  proposedChanges?: string
  updateStatus?: string  // exploring | previewing | updated | abandoned
  updateClarificationCount?: number
  /** For breakdown_action_flow: the action being broken down */
  breakdownTarget?: string
  blocker?: string
  proposedStep?: string
  breakdownStatus?: string  // exploring | previewing | applied | abandoned
  breakdownClarificationCount?: number
  /** For topic exploration: the topic being explored */
  topicLabel?: string
  topicPhase?: string
  /** For deep_reasons: the exploration context */
  deepReasonsPhase?: string
  deepReasonsTopic?: string
  /** For profile confirmation: the fact being confirmed */
  profileFactKey?: string
  profileFactValue?: string
  /** For bilan (investigation): the current item being checked */
  currentItemTitle?: string
  currentItemId?: string
  missedStreak?: number
  missedStreaksByAction?: Record<string, number>
  isBilan?: boolean
  /** Checkup flow addons */
  checkupAddon?: "BILAN_ALREADY_DONE" | "CHECKUP_ENTRY_CONFIRM" | "CHECKUP_DEFERRED"
  checkupDeferredTopic?: string  // The topic that caused deferral
  /** For safety flows (firefighter/sentry): crisis context */
  isSafetyFlow?: boolean
  safetyFlowType?: "firefighter" | "sentry"
  safetyPhase?: "acute" | "stabilizing" | "confirming" | "resolved"
  safetyTurnCount?: number
  /** Firefighter-specific: counts of stabilization vs distress signals */
  stabilizationSignals?: number
  distressSignals?: number
  lastTechnique?: string
  /** Sentry-specific: safety confirmation status */
  safetyConfirmed?: boolean
  externalHelpMentioned?: boolean
  /** Pending relaunch consent: if set, dispatcher must detect consent_to_relaunch */
  pendingRelaunchConsent?: {
    machine_type: string
    action_target?: string
    summaries: string[]
  }
  /** Deferred topics summary for dispatcher awareness */
  deferredTopicsSummary?: Array<{
    id: string
    machine_type: string
    action_target?: string
    briefs: string[]        // signal_summaries (max 3)
    trigger_count: number
    age_hours: number
  }>
  /** For activate_action_flow: the action being activated */
  activateActionTarget?: string
  activateExerciseType?: string
  activateStatus?: string  // exploring | confirming | activated | abandoned
  /** For profile confirmation: additional context */
  profileConfirmPhase?: string  // presenting | awaiting_confirm | processing | completed
  profileConfirmQueueSize?: number
  profileConfirmCurrentIndex?: number
}

/**
 * Build machine-specific addon with flow context.
 */
function buildMachineAddonWithContext(activeMachine: string | null, flowContext?: FlowContext): string {
  // ═══════════════════════════════════════════════════════════════════════════════
  // PENDING RELAUNCH CONSENT - HIGHEST PRIORITY
  // If a consent question was asked, we must detect the user's response
  // ═══════════════════════════════════════════════════════════════════════════════
  if (flowContext?.pendingRelaunchConsent) {
    const pending = flowContext.pendingRelaunchConsent
    const machineLabel = (() => {
      switch (pending.machine_type) {
        case "breakdown_action": return "Simplification d'action"
        case "create_action": return "Création d'action"
        case "update_action": return "Modification d'action"
        case "deep_reasons": return "Exploration profonde"
        case "topic_serious": return "Sujet sérieux"
        case "topic_light": return "Sujet de discussion"
        case "checkup": return "Bilan"
        default: return "Sujet en attente"
      }
    })()
    
    return `
═══════════════════════════════════════════════════════════════════════════════
🎯 ANALYSE DE CONSENTEMENT DE REPRISE (PRIORITAIRE)
═══════════════════════════════════════════════════════════════════════════════

Sophia vient de demander à l'utilisateur s'il veut reprendre un sujet mis en attente.
Tu dois analyser la réponse pour extraire le signal consent_to_relaunch.

SUJET PROPOSÉ: ${machineLabel}
${pending.action_target ? `CIBLE: "${pending.action_target}"` : ""}

SIGNAL À EXTRAIRE (OBLIGATOIRE):
{
  "consent_to_relaunch": { "value": true | false | "unclear", "confidence": 0.0-1.0 }
}

RÈGLES D'INTERPRÉTATION:

value = true si:
• "oui", "ok", "d'accord", "vas-y", "go", "on y va", "allez"
• "avec plaisir", "carrément", "volontiers", "bien sûr"
• "c'est bon", "oui on fait ça", "ok on s'y met"
• Réponse courte positive (< 30 caractères) avec "oui" ou "ok"

value = false si:
• "non", "nan", "nope", "pas maintenant", "plus tard"
• "laisse", "pas envie", "une autre fois", "on verra"
• "j'ai pas le temps", "pas aujourd'hui"
• Réponse courte négative (< 40 caractères) avec "non" ou refus

value = "unclear" si:
• L'utilisateur parle d'autre chose sans répondre à la question
• Réponse ambiguë qui n'est ni oui ni non
• "je sais pas", "peut-être", "hmm"

IMPORTANT:
• Ce signal est PRIORITAIRE - analyse-le en PREMIER
• Si la réponse est claire (oui/non), mets confidence >= 0.8
• Si "unclear", mets confidence < 0.5 et continue l'analyse des autres signaux
`
  }

  const checkupAddon = (() => {
    if (flowContext?.checkupAddon === "BILAN_ALREADY_DONE") {
      return `
=== CONTEXTE: BILAN DEJA FAIT AUJOURD'HUI ===
L'utilisateur veut faire le bilan mais il a DEJA ete fait aujourd'hui.

TON ROLE:
1. Signaler gentiment que le bilan du jour est deja fait
2. Proposer: "Par contre, si tu veux noter un progres sur une action, je peux le faire maintenant. Ca t'interesse?"

ANALYSE de la reponse utilisateur:
{
  "machine_signals": {
    "track_from_bilan_done_ok": true | false
  }
}
- true si: "oui", "ok", "vas-y", acceptation claire
- false si: "non", "pas besoin", refus, pas clair
`
    }
    
    if (flowContext?.checkupAddon === "CHECKUP_ENTRY_CONFIRM") {
      return `
=== CONFIRMATION ENTREE BILAN ===
L'utilisateur a exprime une intention de faire le bilan (checkup quotidien).
Tu dois CONFIRMER avant de le lancer.

TON ROLE:
1. Message personnalise (mentionne un element recent si possible)
2. Demande clairement: "Tu veux qu'on fasse le bilan maintenant?"

ANALYSE de la reponse utilisateur:
{
  "machine_signals": {
    "wants_to_checkup": true | false
  }
}
- true si: "oui", "ok", "vas-y", "on y va", acceptation claire
- false si: "non", "pas maintenant", "plus tard", hesitation claire
`
    }
    
    if (flowContext?.checkupAddon === "CHECKUP_DEFERRED") {
      const topic = flowContext.checkupDeferredTopic || "le sujet en cours"
      return `
=== CONTEXTE: BILAN MIS EN ATTENTE ===
L'utilisateur veut faire le bilan, mais une autre machine a etat est active.
Le bilan sera fait APRES avoir termine ${topic}.

TON ROLE:
1. Signaler que tu as note l'envie de faire le bilan
2. Expliquer qu'on y reviendra apres ${topic}
3. Continuer avec la machine a etat actuelle

PAS DE SIGNAL SPECIFIQUE A PRODUIRE - ce contexte est juste informatif.
`
    }
    
    return ""
  })()
  
  if (!activeMachine) return checkupAddon
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // SAFETY FLOWS - HIGHEST PRIORITY
  // These addons unlock specific signals for crisis resolution
  // ═══════════════════════════════════════════════════════════════════════════════
  
  if (activeMachine === "safety_firefighter_flow") {
    const phase = flowContext?.safetyPhase ?? "acute"
    const turnCount = flowContext?.safetyTurnCount ?? 0
    const stabilizationSignals = flowContext?.stabilizationSignals ?? 0
    const distressSignals = flowContext?.distressSignals ?? 0
    const lastTechnique = flowContext?.lastTechnique ?? "inconnu"
    
    // Build visual state machine representation
    const phaseEmoji = (p: string, current: string) => p === current ? "▶" : (
      ["acute", "stabilizing", "confirming", "resolved"].indexOf(p) < ["acute", "stabilizing", "confirming", "resolved"].indexOf(current) ? "✓" : "○"
    )
    
    let addon = `
=== SIGNAUX SPECIFIQUES (safety_firefighter_flow actif) ===
Tu es dans un flow de DESAMORCAGE DE CRISE EMOTIONNELLE.

╔═══════════════════════════════════════════════════════════════════════════════╗
║                    MACHINE A ETAT - FIREFIGHTER                               ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  ${phaseEmoji("acute", phase)} ACUTE         →  ${phaseEmoji("stabilizing", phase)} STABILIZING  →  ${phaseEmoji("confirming", phase)} CONFIRMING  →  ${phaseEmoji("resolved", phase)} RESOLVED     ║
║  (desamorcage)      (apaisement)      (verification)    (sortie)        ║
║                                                                               ║
║  ETAPE ACTUELLE: [ ${phase.toUpperCase()} ]                                              ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝

REGLE FONDAMENTALE - VERROUILLAGE DES PALIERS:
- Une fois un palier atteint, on NE REVIENT JAMAIS en arriere
- Tant qu'il n'y a pas de signal EXPLICITE pour passer au palier suivant, ON RESTE sur le palier actuel
- Le passage au palier suivant necessite des conditions STRICTES (voir ci-dessous)

CONTEXTE DE LA CRISE:
- Nombre de tours depuis le debut: ${turnCount}
- Signaux de stabilisation cumules: ${stabilizationSignals}
- Signaux de detresse cumules: ${distressSignals}
- Derniere technique utilisee: ${lastTechnique}

SIGNAUX A DETECTER (pour determiner si on peut avancer):
{
  "machine_signals": {
    "still_in_distress": true | false,
    "physical_symptoms_present": true | false,
    "calming_signs": true | false,
    "user_confirms_safe": true | false,
    "wants_to_continue_exercise": true | false,
    "ready_for_next_phase": true | false,
    "needs_different_approach": true | false,
    "escalate_to_sentry": true | false
  }
}

CONDITIONS DE TRANSITION (strictes, non negociables):

┌─────────────────────────────────────────────────────────────────────────────┐
│ ACUTE → STABILIZING                                                         │
│ Conditions TOUTES requises:                                                 │
│   • calming_signs = true (premiers signes d'apaisement)                     │
│   • escalate_to_sentry = false (pas de danger vital)                        │
│   • L'utilisateur coopere avec au moins un exercice                         │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ STABILIZING → CONFIRMING                                                    │
│ Conditions TOUTES requises:                                                 │
│   • physical_symptoms_present = false (plus de symptomes physiques)         │
│   • stabilizationSignals >= 2 (au moins 2 signaux de stabilisation)         │
│   • still_in_distress = false                                               │
│   • L'utilisateur dit explicitement que ca va mieux                         │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ CONFIRMING → RESOLVED                                                       │
│ Conditions TOUTES requises:                                                 │
│   • user_confirms_safe = true (confirmation explicite)                      │
│   • physical_symptoms_present = false                                       │
│   • still_in_distress = false                                               │
│   • L'utilisateur est pret a passer a autre chose                           │
└─────────────────────────────────────────────────────────────────────────────┘

GUIDE D'INTERPRETATION PAR PHASE ACTUELLE:
`
    // Add phase-specific guidance
    if (phase === "acute") {
      addon += `
--- TU ES EN PHASE ACUTE ---
Objectif: Desamorcer la crise immediate, ancrer l'utilisateur dans le present.

Signaux a surveiller:
- still_in_distress: true si panique/angoisse actifs ("je panique", "je craque", coeur qui bat)
- physical_symptoms_present: true si symptomes physiques ("tremblements", "souffle court", "vertige")
- calming_signs: true si PREMIERS signes d'apaisement ("ok", "je respire", cooperation)
- escalate_to_sentry: true si danger vital ("envie de me faire du mal", "idees noires")

Pour passer a STABILIZING:
- ready_for_next_phase = true SEULEMENT si calming_signs = true ET escalate_to_sentry = false
- Sinon, on RESTE en ACUTE
`
    } else if (phase === "stabilizing") {
      addon += `
--- TU ES EN PHASE STABILIZING ---
Objectif: Consolider l'apaisement, verifier que ca tient. NE PAS RUSHER.

Signaux a surveiller:
- still_in_distress: true si ENCORE des signes de crise (meme si "ca va mieux" + symptomes)
- physical_symptoms_present: CRITIQUE - tant que present, on reste ici
- calming_signs: true si retour au calme progressif ("ca va un peu mieux", "je respire mieux")
- needs_different_approach: true si les exercices ne marchent pas

Pour passer a CONFIRMING:
- ready_for_next_phase = true SEULEMENT si:
  * physical_symptoms_present = false
  * still_in_distress = false  
  * stabilizationSignals >= 2
  * Message EXPLICITE de l'utilisateur que ca va mieux
- Un simple "merci" ou "ok" N'EST PAS suffisant
`
    } else if (phase === "confirming") {
      addon += `
--- TU ES EN PHASE CONFIRMING ---
Objectif: Verifier que l'utilisateur est vraiment stable avant de sortir.

Signaux a surveiller:
- user_confirms_safe: true UNIQUEMENT si confirmation EXPLICITE ("oui ca va", "je suis ok")
- still_in_distress: si true, on RESTE en confirming (pas de retour arriere)
- physical_symptoms_present: si true, on RESTE en confirming

Pour passer a RESOLVED:
- ready_for_next_phase = true SEULEMENT si:
  * user_confirms_safe = true (confirmation explicite)
  * physical_symptoms_present = false
  * still_in_distress = false
`
    }

    addon += `

REGLE ANTI-RUSH (CRITIQUE):
- NE JAMAIS mettre ready_for_next_phase = true si:
  * physical_symptoms_present = true
  * Le message contient ENCORE des mots de detresse
- En cas de doute, privilegie still_in_distress = true et ready_for_next_phase = false
- Le temps n'est pas un facteur - on avance UNIQUEMENT sur signaux explicites
`
    return checkupAddon ? `${addon}\n${checkupAddon}` : addon
  }
  
  if (activeMachine === "safety_sentry_flow") {
    const phase = flowContext?.safetyPhase ?? "acute"
    const turnCount = flowContext?.safetyTurnCount ?? 0
    const safetyConfirmed = flowContext?.safetyConfirmed ?? false
    const externalHelpMentioned = flowContext?.externalHelpMentioned ?? false
    
    // Build visual state machine representation
    const phaseEmoji = (p: string, current: string) => p === current ? "▶" : (
      ["acute", "stabilizing", "confirming", "resolved"].indexOf(p) < ["acute", "stabilizing", "confirming", "resolved"].indexOf(current) ? "✓" : "○"
    )
    
    let addon = `
=== SIGNAUX SPECIFIQUES (safety_sentry_flow actif) ===
Tu es dans un flow de CRISE VITALE (danger de mort potentiel).

╔═══════════════════════════════════════════════════════════════════════════════╗
║                      MACHINE A ETAT - SENTRY                                  ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  ${phaseEmoji("acute", phase)} ACUTE         →  ${phaseEmoji("confirming", phase)} CONFIRMING   →  ${phaseEmoji("resolved", phase)} RESOLVED                    ║
║  (danger actif)      (verification)      (securise)                     ║
║                                                                               ║
║  ETAPE ACTUELLE: [ ${phase.toUpperCase()} ]                                              ║
║                                                                               ║
║  ⚠️  FLOW CRITIQUE - SECURITE ABSOLUE                                        ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝

REGLE FONDAMENTALE - VERROUILLAGE DES PALIERS:
- Une fois un palier atteint, on NE REVIENT JAMAIS en arriere
- Tant qu'il n'y a pas de signal EXPLICITE de securite, ON RESTE sur le palier actuel
- En cas de DOUTE, on reste sur le palier le plus securitaire

CONTEXTE DE LA CRISE:
- Nombre de tours: ${turnCount}
- Securite confirmee: ${safetyConfirmed ? "OUI" : "NON"}
- Aide externe mentionnee: ${externalHelpMentioned ? "OUI" : "NON"}

SIGNAUX A DETECTER (ULTRA-PRIORITAIRE):
{
  "machine_signals": {
    "immediate_danger": true | false,
    "user_confirms_safe": true | false,
    "external_help_contacted": true | false,
    "still_at_risk": true | false,
    "ready_for_next_phase": true | false,
    "de_escalate_to_firefighter": true | false
  }
}

CONDITIONS DE TRANSITION (strictes, securite absolue):

┌─────────────────────────────────────────────────────────────────────────────┐
│ ACUTE → CONFIRMING                                                          │
│ Conditions TOUTES requises:                                                 │
│   • immediate_danger = false (plus de danger immediat)                      │
│   • user_confirms_safe = true OU external_help_contacted = true             │
│   • L'utilisateur montre des signes de desescalade                          │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ CONFIRMING → RESOLVED                                                       │
│ Conditions TOUTES requises:                                                 │
│   • user_confirms_safe = true (confirmation EXPLICITE)                      │
│   • still_at_risk = false                                                   │
│   • Engagement vers une aide externe OU plan de securite                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ TRANSITION SPECIALE: SENTRY → FIREFIGHTER                                   │
│ de_escalate_to_firefighter = true si:                                       │
│   • Danger vital ecarte ("je ne vais pas le faire")                         │
│   • MAIS detresse emotionnelle presente                                     │
│   • Passe en mode firefighter pour desamorcage emotionnel                   │
└─────────────────────────────────────────────────────────────────────────────┘
`
    // Add phase-specific guidance
    if (phase === "acute") {
      addon += `
--- TU ES EN PHASE ACUTE ---
Objectif: Evaluer le danger immediat, securiser, orienter vers aide.

Signaux a surveiller:
- immediate_danger: true si action IMMINENTE ("je vais le faire", "j'ai un moyen")
- user_confirms_safe: true UNIQUEMENT si EXPLICITE ("non je ne vais pas me faire de mal")
- external_help_contacted: true si aide externe ("j'ai appele le 15", "quelqu'un est avec moi")
- still_at_risk: true si pensees presentes mais pas d'action imminente

Pour passer a CONFIRMING:
- ready_for_next_phase = true SEULEMENT si:
  * immediate_danger = false
  * (user_confirms_safe = true OU external_help_contacted = true)
- Sinon, on RESTE en ACUTE

REGLE DE SECURITE: En cas de doute sur immediate_danger → true
`
    } else if (phase === "confirming") {
      addon += `
--- TU ES EN PHASE CONFIRMING ---
Objectif: Verifier que la securite est etablie, planifier le suivi.

Signaux a surveiller:
- user_confirms_safe: confirmation explicite de securite
- still_at_risk: si true, on RESTE en confirming
- de_escalate_to_firefighter: si danger vital ecarte mais detresse presente

Pour passer a RESOLVED:
- ready_for_next_phase = true SEULEMENT si:
  * user_confirms_safe = true
  * still_at_risk = false
  * Plan de suivi mentionne (aide externe, rendez-vous, etc.)
`
    }

    addon += `

REGLE DE SECURITE ABSOLUE:
- En cas de doute sur immediate_danger, TOUJOURS mettre true
- Ne JAMAIS mettre user_confirms_safe = true sans confirmation EXPLICITE textuelle
- Ne JAMAIS mettre ready_for_next_phase = true si still_at_risk = true
- Privilegier la securite a la fluidite de conversation
`
    return checkupAddon ? `${addon}\n${checkupAddon}` : addon
  }
  
  if (activeMachine === "create_action_flow") {
    const status = flowContext?.actionStatus ?? "exploring"
    const actionLabel = flowContext?.actionLabel ?? "action"
    const actionType = flowContext?.actionType ?? "non défini"
    const clarificationCount = flowContext?.clarificationCount ?? 0
    
    // Build visual state machine representation
    const statusEmoji = (s: string, current: string) => {
      const order = ["exploring", "awaiting_confirm", "previewing", "created", "abandoned"]
      return s === current ? "▶" : (order.indexOf(s) < order.indexOf(current) ? "✓" : "○")
    }
    
    let addon = `
=== SIGNAUX SPECIFIQUES (create_action_flow actif) ===
Tu es dans un flow de CREATION D'ACTION.

╔═══════════════════════════════════════════════════════════════════════════════╗
║                    MACHINE A ETAT - CREATE ACTION                             ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  ${statusEmoji("exploring", status)} EXPLORING  →  ${statusEmoji("awaiting_confirm", status)} AWAITING  →  ${statusEmoji("previewing", status)} PREVIEWING  →  ${statusEmoji("created", status)} CREATED        ║
║  (exploration)   (confirmation)  (validation)    (termine)        ║
║                                        ↓                                      ║
║                                   ${statusEmoji("abandoned", status)} ABANDONED (si refus/max clarif)          ║
║                                                                               ║
║  ETAPE ACTUELLE: [ ${status.toUpperCase()} ]                                             ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝

REGLE FONDAMENTALE - VERROUILLAGE DES PALIERS:
- Une fois un palier atteint, on NE REVIENT JAMAIS en arriere
- Tant qu'il n'y a pas de signal EXPLICITE pour passer au palier suivant, ON RESTE sur le palier actuel
- Maximum 1 clarification avant abandon gracieux

CONTEXTE DU FLOW:
- Action en cours: "${actionLabel}"
- Type: ${actionType}
- Clarifications: ${clarificationCount}/1 (max)

SIGNAUX A DETECTER:
{
  "machine_signals": {
    "user_confirms_intent": true | false | null,
    "user_confirms_preview": "yes" | "no" | "modify" | "unclear" | null,
    "action_type_clarified": "habit" | "mission" | "framework" | null,
    "user_abandons": true | false,
    "modification_requested": "string decrivant la modification" | null,
    "ready_for_next_phase": true | false
  }
}

CONDITIONS DE TRANSITION (strictes):

┌─────────────────────────────────────────────────────────────────────────────┐
│ EXPLORING → AWAITING_CONFIRM                                                │
│ Conditions:                                                                 │
│   • Sophia a suggere une action (sophia_suggested = true)                   │
│   • OU user exprime une intention implicite ("je devrais faire X")          │
│   • ready_for_next_phase = true quand intention detectee                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ AWAITING_CONFIRM → PREVIEWING                                               │
│ Conditions TOUTES requises:                                                 │
│   • user_confirms_intent = true ("oui", "ok", "vas-y", "je veux")           │
│   • user_abandons = false                                                   │
│   • ready_for_next_phase = true quand confirmation explicite                │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ PREVIEWING → CREATED                                                        │
│ Conditions TOUTES requises:                                                 │
│   • user_confirms_preview = "yes" (acceptation claire)                      │
│   • user_abandons = false                                                   │
│   • ready_for_next_phase = true                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ PREVIEWING → PREVIEWING (clarification)                                     │
│ Si user_confirms_preview = "modify":                                        │
│   • Appliquer la modification                                               │
│   • Re-montrer le preview                                                   │
│   • clarification_count += 1                                                │
│   • Si clarification_count >= 1 et ENCORE modify → ABANDONED                │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ * → ABANDONED                                                               │
│ Si user_abandons = true OU (clarification_count >= 1 ET unclear/modify)     │
│   • "laisse tomber", "on oublie", "non", "annule"                           │
│   • Message gracieux, on peut reprendre plus tard                           │
└─────────────────────────────────────────────────────────────────────────────┘
`

    // Add phase-specific guidance
    if (status === "exploring") {
      addon += `
--- TU ES EN PHASE EXPLORING ---
L'utilisateur explore l'idee de creer une action, pas encore engage.

Signaux a surveiller:
- user_confirms_intent: true si "oui je veux", "ok on fait ca", acceptation claire
- user_abandons: true si "non", "pas maintenant", "on verra"

ready_for_next_phase = true SEULEMENT si intention claire detectee.
`
    } else if (status === "awaiting_confirm") {
      addon += `
--- TU ES EN PHASE AWAITING_CONFIRM ---
Sophia a suggere une action, on attend la confirmation de l'utilisateur.

Signaux a surveiller:
- user_confirms_intent: true si "oui", "ok", "vas-y", "je veux bien"
- user_abandons: true si "non", "pas envie", "laisse tomber"

ready_for_next_phase = true SEULEMENT si acceptation claire de l'intention.
`
    } else if (status === "previewing") {
      addon += `
--- TU ES EN PHASE PREVIEWING ---
Les parametres de l'action sont proposes, on attend la validation.

Signaux a surveiller:
- user_confirms_preview: 
  * "yes" si "ok", "ca me va", "parfait", "c'est bon"
  * "no" si refus clair sans alternative
  * "modify" si "change X", "plutot Y", demande de modification
  * "unclear" si ambigu, ni oui ni non clair
- modification_requested: extraire la modification demandee (ex: "3 fois", "le matin")
- user_abandons: true si abandon explicite

ready_for_next_phase = true SEULEMENT si user_confirms_preview = "yes"
`
    }

    addon += `

GUIDE D'INTERPRETATION:
- user_confirms_preview: "yes" si acceptation claire ("ok", "ca me va", "parfait"), "no" si refus, "modify" si demande de changement, "unclear" si ambigu
- action_type_clarified: seulement si l'utilisateur mentionne explicitement le type
- user_abandons: true si "laisse tomber", "on oublie", "non finalement", "annule"
- modification_requested: texte de la modification demandee (ex: "changer le nom", "3 fois par semaine")
`
    return checkupAddon ? `${addon}\n${checkupAddon}` : addon
  }
  
  if (activeMachine === "update_action_flow") {
    const status = flowContext?.updateStatus ?? "exploring"
    const targetAction = flowContext?.targetActionTitle ?? "action"
    const changes = flowContext?.proposedChanges ?? "en attente"
    const clarificationCount = flowContext?.updateClarificationCount ?? 0
    
    const statusEmoji = (s: string, current: string) => {
      const order = ["exploring", "previewing", "updated", "abandoned"]
      return s === current ? "▶" : (order.indexOf(s) < order.indexOf(current) ? "✓" : "○")
    }
    
    let addon = `
=== SIGNAUX SPECIFIQUES (update_action_flow actif) ===
Tu es dans un flow de MODIFICATION D'ACTION.

╔═══════════════════════════════════════════════════════════════════════════════╗
║                    MACHINE A ETAT - UPDATE ACTION                             ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  ${statusEmoji("exploring", status)} EXPLORING  →  ${statusEmoji("previewing", status)} PREVIEWING  →  ${statusEmoji("updated", status)} UPDATED                       ║
║  (clarification)  (validation)     (termine)                      ║
║                        ↓                                                      ║
║                   ${statusEmoji("abandoned", status)} ABANDONED (si refus)                               ║
║                                                                               ║
║  ETAPE ACTUELLE: [ ${status.toUpperCase()} ]                                             ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝

REGLE FONDAMENTALE - VERROUILLAGE DES PALIERS:
- Une fois un palier atteint, on NE REVIENT JAMAIS en arriere
- Maximum 1 clarification avant abandon gracieux

CONTEXTE DU FLOW:
- Action a modifier: "${targetAction}"
- Changements proposes: ${changes}
- Clarifications: ${clarificationCount}/1

SIGNAUX A DETECTER:
{
  "machine_signals": {
    "user_confirms_change": "yes" | "no" | "modify" | "unclear" | null,
    "new_value_provided": "nouvelle valeur fournie par user" | null,
    "user_abandons": true | false,
    "ready_for_next_phase": true | false
  }
}

CONDITIONS DE TRANSITION:
- EXPLORING → PREVIEWING: quand on a la nouvelle valeur exacte
- PREVIEWING → UPDATED: user_confirms_change = "yes"
- PREVIEWING → PREVIEWING: user_confirms_change = "modify" (1 fois max)
- * → ABANDONED: user_abandons = true OU max clarifications atteint
`

    if (status === "exploring") {
      addon += `
--- TU ES EN PHASE EXPLORING ---
Objectif: Comprendre exactement ce que l'utilisateur veut modifier.

Signaux a surveiller:
- new_value_provided: la valeur exacte ("3 fois", "le matin", "lundi mercredi")
- user_abandons: true si "laisse tomber", "finalement non"

ready_for_next_phase = true SEULEMENT si nouvelle valeur fournie.
`
    } else if (status === "previewing") {
      addon += `
--- TU ES EN PHASE PREVIEWING ---
Objectif: L'utilisateur doit valider la modification proposee.

Signaux a surveiller:
- user_confirms_change: "yes" si validation, "no" si refus, "modify" si ajustement
- user_abandons: true si abandon

ready_for_next_phase = true SEULEMENT si user_confirms_change = "yes"
`
    }

    addon += `

Guide d'interpretation:
- user_confirms_change: "yes" si validation ("ok", "c'est bon"), "no" si refus, "modify" si autre modification
- new_value_provided: la valeur exacte fournie (ex: "3 fois", "lundi et mercredi", "le matin")
- user_abandons: true si abandon explicite
`
    return checkupAddon ? `${addon}\n${checkupAddon}` : addon
  }
  
  if (activeMachine === "breakdown_action_flow") {
    const status = flowContext?.breakdownStatus ?? "exploring"
    const targetAction = flowContext?.breakdownTarget ?? "action"
    const blocker = flowContext?.blocker ?? "non précisé"
    const proposedStep = flowContext?.proposedStep ?? "en génération"
    const clarificationCount = flowContext?.breakdownClarificationCount ?? 0
    
    const statusEmoji = (s: string, current: string) => {
      const order = ["exploring", "previewing", "applied", "abandoned"]
      return s === current ? "▶" : (order.indexOf(s) < order.indexOf(current) ? "✓" : "○")
    }
    
    let addon = `
=== SIGNAUX SPECIFIQUES (breakdown_action_flow actif) ===
Tu es dans un flow de DECOMPOSITION D'ACTION en micro-etape.

╔═══════════════════════════════════════════════════════════════════════════════╗
║                    MACHINE A ETAT - BREAKDOWN ACTION                          ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  ${statusEmoji("exploring", status)} EXPLORING  →  ${statusEmoji("previewing", status)} PREVIEWING  →  ${statusEmoji("applied", status)} APPLIED                        ║
║  (blocage)       (micro-etape)    (termine)                       ║
║                        ↓                                                      ║
║                   ${statusEmoji("abandoned", status)} ABANDONED (si refus)                               ║
║                                                                               ║
║  ETAPE ACTUELLE: [ ${status.toUpperCase()} ]                                             ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝

REGLE FONDAMENTALE - VERROUILLAGE DES PALIERS:
- Une fois un palier atteint, on NE REVIENT JAMAIS en arriere
- Maximum 1 clarification avant abandon gracieux

CONTEXTE DU FLOW:
- Action a decomposer: "${targetAction}"
- Ce qui bloque: ${blocker}
- Micro-etape proposee: ${proposedStep}
- Clarifications: ${clarificationCount}/1

IMPORTANT - DISTINCTION BREAKDOWN vs DEEP_REASONS:
- breakdown_action = blocage PRATIQUE (temps, oubli, organisation) → micro-etape
- deep_reasons = blocage MOTIVATIONNEL (flemme, peur, sens) → exploration profonde
Si le blocage semble MOTIVATIONNEL, signal deep_reasons_opportunity = true

SIGNAUX A DETECTER:
{
  "machine_signals": {
    "user_confirms_microstep": "yes" | "no" | null,
    "user_wants_different_step": true | false,
    "blocker_clarified": "description du blocage" | null,
    "user_abandons": true | false,
    "deep_reasons_opportunity": true | false,
    "ready_for_next_phase": true | false
  }
}

CONDITIONS DE TRANSITION:
- EXPLORING → PREVIEWING: quand le blocage est compris et micro-etape generee
- PREVIEWING → APPLIED: user_confirms_microstep = "yes"
- PREVIEWING → PREVIEWING: user_wants_different_step = true (1 fois max)
- * → ABANDONED: user_abandons = true OU max clarifications atteint
`

    if (status === "exploring") {
      addon += `
--- TU ES EN PHASE EXPLORING ---
Objectif: Comprendre ce qui bloque l'utilisateur.

Signaux a surveiller:
- blocker_clarified: la raison du blocage ("pas le temps", "j'oublie", "trop long")
- deep_reasons_opportunity: true si blocage MOTIVATIONNEL ("flemme", "pas envie", "je sais pas pourquoi")
- user_abandons: true si "laisse tomber"

ready_for_next_phase = true SEULEMENT si blocage PRATIQUE identifie.
Si blocage MOTIVATIONNEL → deep_reasons_opportunity = true, pas de micro-etape.
`
    } else if (status === "previewing") {
      addon += `
--- TU ES EN PHASE PREVIEWING ---
Objectif: L'utilisateur doit valider la micro-etape proposee.

Signaux a surveiller:
- user_confirms_microstep: "yes" si acceptation, "no" si refus
- user_wants_different_step: true si "autre chose", "trop dur", "plus simple"
- user_abandons: true si abandon

ready_for_next_phase = true SEULEMENT si user_confirms_microstep = "yes"
`
    }

    addon += `

Guide d'interpretation:
- user_confirms_microstep: "yes" si acceptation de la micro-etape, "no" si refus
- user_wants_different_step: true si "autre chose", "trop dur", "plus simple"
- blocker_clarified: texte du blocage si l'utilisateur explique ce qui le bloque
- user_abandons: true si abandon
- deep_reasons_opportunity: true si le blocage semble MOTIVATIONNEL (pas pratique)
`
    return checkupAddon ? `${addon}\n${checkupAddon}` : addon
  }
  
  if (activeMachine === "topic_serious" || activeMachine === "topic_light") {
    const isSerious = activeMachine === "topic_serious"
    const topicType = isSerious ? "SÉRIEUX" : "LÉGER"
    const phase = flowContext?.topicPhase ?? "opening"
    const topic = flowContext?.topicLabel ?? "sujet"
    const turnCount = flowContext?.topicTurnCount ?? 0
    const engagement = flowContext?.topicEngagement ?? "MEDIUM"
    const maxTurns = isSerious ? 8 : 4
    
    // Build visual state machine representation
    const phaseEmoji = (p: string, current: string) => {
      const order = ["opening", "exploring", "converging", "closing"]
      return p === current ? "▶" : (order.indexOf(p) < order.indexOf(current) ? "✓" : "○")
    }
    
    let addon = `
=== SIGNAUX SPECIFIQUES (${activeMachine} actif) ===
Tu es dans un flow d'EXPLORATION DE SUJET ${topicType}.

╔═══════════════════════════════════════════════════════════════════════════════╗
║                    MACHINE A ETAT - TOPIC ${topicType}                            ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  ${phaseEmoji("opening", phase)} OPENING     →  ${phaseEmoji("exploring", phase)} EXPLORING   →  ${phaseEmoji("converging", phase)} CONVERGING  →  ${phaseEmoji("closing", phase)} CLOSING       ║
║  (accueil)       (exploration)   (convergence)    (cloture)        ║
║                                                                               ║
║  ETAPE ACTUELLE: [ ${phase.toUpperCase()} ]                                               ║
║                                                                               ║
║  ${isSerious ? "🎯 SUJET SÉRIEUX - Architect gère (max 8 tours)" : "💬 SUJET LÉGER - Companion gère (max 4 tours)"}                         ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝

REGLE FONDAMENTALE - VERROUILLAGE DES PALIERS:
- Une fois un palier atteint, on NE REVIENT JAMAIS en arriere
- L'utilisateur peut TOUJOURS changer de sujet ou abandonner (user_abandons)
- Engagement LOW persistant = accelerer vers closing

CONTEXTE DU FLOW:
- Sujet explore: "${topic}"
- Tour: ${turnCount}/${maxTurns} (max)
- Engagement actuel: ${engagement}
- Agent proprietaire: ${isSerious ? "architect" : "companion"}

SIGNAUX A DETECTER:
{
  "machine_signals": {
    "user_engagement": "HIGH" | "MEDIUM" | "LOW" | "DISENGAGED",
    "topic_satisfaction": true | false,
    "wants_to_change_topic": true | false,
    "needs_deeper_exploration": true | false,
    "user_abandons": true | false,
    "ready_for_next_phase": true | false
  }
}

CONDITIONS DE TRANSITION (strictes):

┌─────────────────────────────────────────────────────────────────────────────┐
│ OPENING → EXPLORING                                                         │
│ Conditions:                                                                 │
│   • L'utilisateur a repondu et montre de l'interet (engagement != DISENGAGED)│
│   • ready_for_next_phase = true apres premiere reponse engagee              │
│   • Si DISENGAGED des le debut → CLOSING directement                        │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ EXPLORING → CONVERGING                                                      │
│ Conditions TOUTES requises:                                                 │
│   • turn_count >= ${Math.floor(maxTurns / 2)} (mi-parcours) OU topic_satisfaction = true           │
│   • OU engagement passe a LOW (on accelere)                                 │
│   • OU needs_deeper_exploration = false (sujet epuise)                      │
│   • ready_for_next_phase = true quand pret a conclure                       │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ CONVERGING → CLOSING                                                        │
│ Conditions:                                                                 │
│   • L'utilisateur reagit a la synthese/proposition de cloture               │
│   • OU topic_satisfaction = true                                            │
│   • OU turn_count >= ${maxTurns}                                                     │
│   • ready_for_next_phase = true quand pret a fermer                         │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ * → CLOSING (acceleration)                                                  │
│ Si a n'importe quel moment:                                                 │
│   • wants_to_change_topic = true (l'utilisateur change de sujet)            │
│   • user_engagement = DISENGAGED (desengagement total)                      │
│   • user_abandons = true (abandon explicite)                                │
│   → On ferme proprement et on passe a autre chose                           │
└─────────────────────────────────────────────────────────────────────────────┘
`

    // Add phase-specific guidance
    if (phase === "opening") {
      addon += `
--- TU ES EN PHASE OPENING ---
Objectif: Accueillir le sujet, montrer de l'interet, poser le cadre.

Signaux a surveiller:
- user_engagement: PREMIER signal critique - HIGH/MEDIUM = bon, LOW/DISENGAGED = probleme
- wants_to_change_topic: true si l'utilisateur rebondit ailleurs

ready_for_next_phase = true APRES premiere reponse engagee de l'utilisateur.
Si DISENGAGED → proposer de changer de sujet ou fermer.
`
    } else if (phase === "exploring") {
      addon += `
--- TU ES EN PHASE EXPLORING ---
Objectif: Creuser le sujet, poser des questions, ecouter, apporter de la valeur.

Signaux a surveiller:
- user_engagement: suivre l'evolution (HIGH → bon, descente vers LOW → accelerer)
- needs_deeper_exploration: true si le sujet merite plus, false si epuise
- topic_satisfaction: true si l'utilisateur dit "ca m'aide", "je comprends"

ready_for_next_phase = true si:
- topic_satisfaction = true (objectif atteint)
- OU engagement = LOW (on perd l'utilisateur, faut conclure)
- OU turn_count >= ${Math.floor(maxTurns / 2)} et sujet bien explore
`
    } else if (phase === "converging") {
      addon += `
--- TU ES EN PHASE CONVERGING ---
Objectif: Synthetiser, proposer une conclusion, preparer la sortie.

Signaux a surveiller:
- topic_satisfaction: true si l'utilisateur valide la synthese
- wants_to_change_topic: true si l'utilisateur veut passer a autre chose
- user_engagement: si remonte = bien, si reste bas = fermer

ready_for_next_phase = true apres reaction a la synthese/conclusion.
`
    } else if (phase === "closing") {
      addon += `
--- TU ES EN PHASE CLOSING ---
Objectif: Fermer proprement, proposer la suite, laisser une bonne impression.

Signaux a surveiller:
- wants_to_change_topic: le prochain sujet eventuel
- user_abandons: si l'utilisateur veut juste arreter

ready_for_next_phase = true - on peut fermer et passer a autre chose.
Message de cloture: court, positif, porte ouverte pour revenir sur le sujet.
`
    }

    addon += `

GUIDE D'INTERPRETATION DES SIGNAUX:

user_engagement:
- HIGH: reponses longues, questions, enthousiasme, "interessant", "ah oui"
- MEDIUM: reponses normales, suit la conversation
- LOW: reponses courtes, "ok", "oui", "hmm", desinteret visible
- DISENGAGED: changement de sujet, "bon...", "sinon...", ignorance du sujet

topic_satisfaction:
- true: "merci", "ca m'aide", "je comprends mieux", "c'est clair maintenant"
- false: pas de signal de satisfaction

wants_to_change_topic:
- true: introduit un autre sujet, "au fait", "sinon", "autre chose"

needs_deeper_exploration:
- true: emotions fortes, complexite non resolue, questions profondes restantes
- false: sujet bien couvert, pas de tension residuelle

${isSerious ? `
SPECIFICITE SUJET SERIEUX:
- Plus de tours autorises (8 max)
- Prise en charge par Architect (plus structuré)
- Peut escalader vers Librarian si besoin de recherche
- Emotions/problemes importants = prendre le temps
` : `
SPECIFICITE SUJET LEGER:
- Moins de tours (4 max)
- Prise en charge par Companion (plus decontracte)
- Pas d'escalade vers Librarian normalement
- Ton leger, pas besoin de resolution profonde
`}
`
    return addon
  }
  
  if (activeMachine === "deep_reasons_exploration") {
    const phase = flowContext?.deepReasonsPhase ?? "re_consent"
    const topic = flowContext?.deepReasonsTopic ?? "blocage motivationnel"
    const turnCount = flowContext?.deepReasonsTurnCount ?? 0
    const detectedPattern = flowContext?.deepReasonsPattern ?? "unknown"
    
    // Build visual state machine representation
    const phaseEmoji = (p: string, current: string) => {
      const order = ["re_consent", "clarify", "hypotheses", "resonance", "intervention", "closing"]
      return p === current ? "▶" : (order.indexOf(p) < order.indexOf(current) ? "✓" : "○")
    }
    
    let addon = `
=== SIGNAUX SPECIFIQUES (deep_reasons_exploration actif) ===
Tu es dans un flow d'EXPLORATION DES RAISONS PROFONDES d'un blocage motivationnel.

╔═══════════════════════════════════════════════════════════════════════════════╗
║                    MACHINE A ETAT - DEEP REASONS                              ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║                                                                               ║
║  ${phaseEmoji("re_consent", phase)} RE_CONSENT  →  ${phaseEmoji("clarify", phase)} CLARIFY  →  ${phaseEmoji("hypotheses", phase)} HYPOTHESES  →  ${phaseEmoji("resonance", phase)} RESONANCE    ║
║  (consentement)  (exploration)  (propositions)    (validation)       ║
║                                        ↓                                      ║
║                    ${phaseEmoji("intervention", phase)} INTERVENTION  →  ${phaseEmoji("closing", phase)} CLOSING                           ║
║                     (accompagnement)    (micro-engagement)             ║
║                                                                               ║
║  ETAPE ACTUELLE: [ ${phase.toUpperCase()} ]                                               ║
║                                                                               ║
║  ⚡ FLOW SENSIBLE - EMPATHIE ET RESPECT ABSOLUS                              ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝

REGLE FONDAMENTALE - VERROUILLAGE DES PALIERS:
- Une fois un palier atteint, on NE REVIENT JAMAIS en arriere
- L'utilisateur peut TOUJOURS abandonner (signal wants_to_stop)
- Jamais forcer l'exploration si resistance detectee

CONTEXTE DU FLOW:
- Sujet explore: "${topic}"
- Pattern detecte: ${detectedPattern}
- Tour: ${turnCount}

SIGNAUX A DETECTER:
{
  "machine_signals": {
    "user_opens_up": true | false,
    "resistance_detected": true | false,
    "insight_emerged": true | false,
    "user_consents_exploration": true | false | null,
    "user_abandons": true | false,
    "ready_for_next_phase": true | false
  }
}

CONDITIONS DE TRANSITION (strictes):

┌─────────────────────────────────────────────────────────────────────────────┐
│ RE_CONSENT → CLARIFY                                                        │
│ Conditions TOUTES requises:                                                 │
│   • user_consents_exploration = true ("oui", "ok", "je veux bien")          │
│   • user_abandons = false                                                   │
│   • ready_for_next_phase = true quand consentement clair                    │
│ Si "non" ou "pas maintenant" → exploration annulee                          │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ CLARIFY → HYPOTHESES                                                        │
│ Conditions:                                                                 │
│   • L'utilisateur a partage quelque chose (user_opens_up = true)            │
│   • OU resistance_detected = true (on avance quand meme avec prudence)      │
│   • ready_for_next_phase = true apres partage ou 2 tours                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ HYPOTHESES → RESONANCE                                                      │
│ Conditions:                                                                 │
│   • L'utilisateur a reagi aux hypotheses                                    │
│   • ready_for_next_phase = true apres reaction                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ RESONANCE → INTERVENTION                                                    │
│ Conditions:                                                                 │
│   • insight_emerged = true (l'utilisateur a identifie ce qui resonne)       │
│   • ready_for_next_phase = true quand identification claire                 │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ INTERVENTION → CLOSING                                                      │
│ Conditions:                                                                 │
│   • L'utilisateur a reagi a l'intervention                                  │
│   • ready_for_next_phase = true apres reaction                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ * → ABANDONNE (a tout moment)                                               │
│ Si user_abandons = true:                                                    │
│   • "stop", "arrete", "c'est bon", "trop dur", "pas envie d'en parler"      │
│   • Message respectueux, porte ouverte pour plus tard                       │
└─────────────────────────────────────────────────────────────────────────────┘
`

    // Add phase-specific guidance
    if (phase === "re_consent") {
      addon += `
--- TU ES EN PHASE RE_CONSENT ---
Objectif: Verifier que l'utilisateur veut bien explorer ce sujet sensible.

Signaux a surveiller:
- user_consents_exploration: true si "oui", "ok", "je veux bien", "vas-y"
- user_abandons: true si "non", "pas maintenant", "plus tard", "c'est bon"

ready_for_next_phase = true SEULEMENT si consentement EXPLICITE.
Si pas de reponse claire, reposer la question une fois maximum.
`
    } else if (phase === "clarify") {
      addon += `
--- TU ES EN PHASE CLARIFY ---
Objectif: Comprendre ce qui se passe pour l'utilisateur. Ecoute active.

Signaux a surveiller:
- user_opens_up: true si partage personnel, emotions, description du vecu
- resistance_detected: true si "je sais pas", deflection, changement de sujet
- user_abandons: true si malaise explicite, veut arreter

ready_for_next_phase = true si:
- user_opens_up = true (partage reel)
- OU turn_count >= 2 (on avance meme avec peu d'infos)

Si resistance_detected = true, ne pas insister. Avancer avec douceur.
`
    } else if (phase === "hypotheses") {
      addon += `
--- TU ES EN PHASE HYPOTHESES ---
Objectif: Sophia propose des pistes possibles pour aider a identifier.

Signaux a surveiller:
- user_opens_up: true si reaction aux hypotheses
- resistance_detected: true si rejet de toutes les hypotheses
- user_abandons: true si veut arreter

ready_for_next_phase = true apres reaction de l'utilisateur aux hypotheses.
`
    } else if (phase === "resonance") {
      addon += `
--- TU ES EN PHASE RESONANCE ---
Objectif: L'utilisateur identifie ce qui lui parle le plus.

Signaux a surveiller:
- insight_emerged: true si "c'est ca", "effectivement", "ah oui", identification claire
- resistance_detected: true si "rien de tout ca", "je sais pas"
- user_abandons: true si veut arreter

ready_for_next_phase = true si insight_emerged = true ou reaction claire.
`
    } else if (phase === "intervention") {
      addon += `
--- TU ES EN PHASE INTERVENTION ---
Objectif: Sophia propose une intervention adaptee au pattern identifie.

Signaux a surveiller:
- user_opens_up: true si reaction positive/constructive
- resistance_detected: true si rejet de l'intervention
- user_abandons: true si veut arreter

ready_for_next_phase = true apres reaction a l'intervention.
`
    } else if (phase === "closing") {
      addon += `
--- TU ES EN PHASE CLOSING ---
Objectif: Proposer un micro-engagement et fermer l'exploration avec soin.

Signaux a surveiller:
- user_consents_exploration: true si accepte le micro-engagement
- user_abandons: true si refuse ou veut arreter

ready_for_next_phase = true quand l'exploration peut se conclure.
Meme si l'utilisateur refuse le micro-engagement, fermer avec bienveillance.
`
    }

    addon += `

REGLE EMPATHIE (CRITIQUE):
- NE JAMAIS forcer ou insister si resistance_detected = true
- Toujours laisser une porte de sortie
- Valider les emotions, pas les analyser cliniquement
- Si user_abandons = true, respecter IMMEDIATEMENT
`
    return addon
  }
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // ACTIVATE ACTION FLOW - Action activation machine
  // ═══════════════════════════════════════════════════════════════════════════════
  if (activeMachine === "activate_action_flow") {
    const target = flowContext?.activateActionTarget ?? "une action"
    const exercise = flowContext?.activateExerciseType
    
    return `
═══════════════════════════════════════════════════════════════════════════════
🎯 activate_action_flow ACTIF - Machine d'Activation d'Action
═══════════════════════════════════════════════════════════════════════════════

ACTION CIBLE: "${target}"
${exercise ? `EXERCICE SPECIFIQUE: "${exercise}"` : ""}
STATUT: ${flowContext?.activateStatus ?? "exploring"}

┌─────────────────────────────────────────────────────────────────────────────┐
│  DIAGRAMME DE PHASES                                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [exploring] ────► [confirming] ────► [activated] ✓                         │
│       │                  │                                                  │
│       │                  │                                                  │
│       └──────────────────┴────────► [abandoned] ✗                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

TRANSITIONS:
- exploring → confirming: L'utilisateur a identifie l'action a activer
- confirming → activated: user_confirms_activation = true
- * → abandoned: user_abandons = true OU user_wants_different_action detecte

SIGNAUX A DETECTER (dans machine_signals):
{
  "machine_signals": {
    "user_confirms_activation": true | false | null,
    "user_wants_different_action": "nom de l'action alternative" | null,
    "activation_ready": true | false,
    "user_abandons": true | false
  }
}

INTERPRETATION:
- user_confirms_activation: true si "oui", "go", "on fait ca", "je m'y mets"
- user_wants_different_action: si l'utilisateur veut activer une AUTRE action
- activation_ready: true si l'action est clairement identifiee et prete a etre activee
- user_abandons: true si "non", "laisse", "pas maintenant", "on verra"

IMPORTANT:
- L'activation concerne des actions DORMANTES ou FUTURES du plan
- Ne pas confondre avec track_progress (qui enregistre une action FAITE)
- Si l'utilisateur mentionne un exercice specifique (attrape-reves, etc.), le noter
`
  }
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // USER PROFILE CONFIRMATION - Profile fact confirmation machine
  // ═══════════════════════════════════════════════════════════════════════════════
  if (activeMachine === "user_profile_confirmation") {
    const phase = flowContext?.profileConfirmPhase ?? "awaiting_confirm"
    const queueSize = flowContext?.profileConfirmQueueSize ?? 1
    const currentIdx = flowContext?.profileConfirmCurrentIndex ?? 0
    const remaining = queueSize - currentIdx - 1
    
    return `
═══════════════════════════════════════════════════════════════════════════════
📋 user_profile_confirmation ACTIF - Machine de Confirmation de Profil
═══════════════════════════════════════════════════════════════════════════════

FAIT EN COURS: "${flowContext?.profileFactKey ?? "inconnu"}" = "${flowContext?.profileFactValue ?? "?"}"
PHASE ACTUELLE: ${phase}
QUEUE: ${currentIdx + 1}/${queueSize} (${remaining > 0 ? `${remaining} restant(s)` : "dernier"})

┌─────────────────────────────────────────────────────────────────────────────┐
│  DIAGRAMME DE PHASES                                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  [presenting] ────► [awaiting_confirm] ────► [processing]                   │
│                            │                      │                         │
│                            │                      ├──► [presenting] (next)  │
│                            │                      └──► [completed] ✓        │
│                            │                                                │
│                            └──────────────────────► [abandoned] ✗           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

TRANSITIONS STRICTES:
- presenting → awaiting_confirm: Question de confirmation posee
- awaiting_confirm → processing: Reponse de l'utilisateur recue (yes/no/nuance)
- processing → presenting: Si queue non vide, passer au fait suivant
- processing → completed: Si queue vide, terminer
- * → abandoned: user_abandons = true

SIGNAUX A DETECTER (dans machine_signals):
{
  "machine_signals": {
    "user_confirms_fact": "yes" | "no" | "nuance" | null,
    "user_provides_correction": "correction fournie" | null,
    "fact_type_detected": "work_schedule" | "energy_peaks" | ... | null,
    "user_abandons": true | false
  }
}

INTERPRETATION:
- user_confirms_fact:
  • "yes" = "oui", "c'est ca", "exact", "yep", "ouep"
  • "no" = "non", "pas vraiment", "nan", "c'est pas ca"
  • "nuance" = "oui mais...", "plutot...", "en fait c'est..."
- user_provides_correction: la valeur corrigee si nuance
- user_abandons: true si "laisse tomber", "on verra plus tard", "stop"

TYPES DE FAITS:
work_schedule, energy_peaks, wake_time, sleep_time, job, 
hobbies, family, tone_preference, emoji_preference, verbosity

IMPORTANT:
- ${remaining > 0 ? `Il reste ${remaining} fait(s) a confirmer apres celui-ci` : "C'est le DERNIER fait"}
- Ne pas forcer la confirmation
- Accepter les corrections/nuances avec bienveillance
`
  }
  
  // Bilan (investigation) active - detect signals for post-bilan processing
  if (activeMachine === "investigation" || flowContext?.isBilan) {
    let addon = `
=== SIGNAUX SPECIFIQUES (bilan/investigation actif) ===
Tu es dans un BILAN (checkup quotidien). L'Investigator pose des questions sur les actions du jour.
`
    if (flowContext?.currentItemTitle) {
      addon += `
CONTEXTE DU BILAN:
- Action en cours de verification: "${flowContext.currentItemTitle}"
- Jours rates consecutifs (missed_streak): ${flowContext.missedStreak ?? 0}
`
    }
    if (flowContext?.missedStreaksByAction && Object.keys(flowContext.missedStreaksByAction).length > 0) {
      addon += `
- Streaks par action: ${JSON.stringify(flowContext.missedStreaksByAction)}
`
    }
    addon += `
IMPORTANT: Pendant le bilan, on NE LANCE PAS de nouvelles machines a etat.
Les signaux detectes sont INFORMATIFS pour l'Investigator et seront STOCKES dans deferred_topics
pour etre traites APRES le bilan.

Analyse ces signaux et AJOUTE-LES dans ta reponse JSON sous "machine_signals":

{
  "machine_signals": {
    "breakdown_recommended": true | false,
    "deep_reasons_opportunity": true | false,
    "create_action_intent": true | false,
    "update_action_intent": true | false,
    "user_consents_defer": true | false,
    "confirm_deep_reasons": true | false | null,
    "confirm_breakdown": true | false | null,
    "confirm_topic": true | false | null
  }
}

Guide d'interpretation - SIGNAUX DE DETECTION:
- breakdown_recommended: true si missed_streak >= 5 ET blocage PRATIQUE (oubli, temps, organisation, "trop dur")
- deep_reasons_opportunity: true si blocage MOTIVATIONNEL (pas envie, peur, sens, flemme, "je sais pas pourquoi")
- create_action_intent: true si l'utilisateur veut creer une NOUVELLE action (pas modifier l'actuelle)
- update_action_intent: true si l'utilisateur veut modifier une action EXISTANTE (frequence, jours, horaire)
- user_consents_defer: true si l'utilisateur dit "oui" a une proposition de faire quelque chose apres le bilan
  ("oui on fait ca apres", "ok apres le bilan", "oui je veux qu'on en parle", etc.)

Guide d'interpretation - SIGNAUX DE CONFIRMATION (reponse a "tu veux qu'on en parle apres le bilan ?"):
- confirm_deep_reasons: 
  - true si l'utilisateur dit "oui" a une proposition d'explorer un blocage motivationnel apres le bilan
  - false si l'utilisateur dit "non", "pas besoin", "ca va"
  - null si pas de reponse a cette question specifique
- confirm_breakdown:
  - true si l'utilisateur dit "oui" a une proposition de micro-etape apres le bilan
  - false si l'utilisateur dit "non", "ca va", "pas la peine"
  - null si pas de reponse a cette question specifique
- confirm_topic:
  - true si l'utilisateur dit "oui" a une proposition de parler d'un sujet apres le bilan
  - false si l'utilisateur dit "non", "pas maintenant"
  - null si pas de reponse a cette question specifique

DISTINCTION CRITIQUE (breakdown vs deep_reasons):
- breakdown = blocage PRATIQUE: "j'oublie", "pas le temps", "trop fatigue le soir" -> micro-etape
- deep_reasons = blocage MOTIVATIONNEL: "j'ai pas envie", "je sais pas pourquoi", "ca me saoule" -> exploration profonde
`
    return checkupAddon ? `${addon}\n${checkupAddon}` : addon
  }
  
  return checkupAddon
}

/**
 * Build the dynamic dispatcher prompt based on active machine and history.
 */
function buildDispatcherPromptV2(opts: {
  activeMachine: string | null
  signalHistory: SignalHistoryEntry[]
  stateSnapshot: DispatcherInputV2["stateSnapshot"]
  lastAssistantMessage: string
  flowContext?: FlowContext
}): string {
  const { activeMachine, signalHistory, stateSnapshot, lastAssistantMessage, flowContext } = opts
  
  let prompt = `Tu es le Dispatcher de Sophia (V2 contextuel). Ton role est d'analyser le message utilisateur et produire des SIGNAUX structures.

DERNIER MESSAGE ASSISTANT:
"${(lastAssistantMessage ?? "").slice(0, 300)}"

ETAT ACTUEL:
- Mode en cours: ${stateSnapshot.current_mode ?? "unknown"}
- Bilan actif: ${stateSnapshot.investigation_active ? "OUI" : "NON"}${stateSnapshot.investigation_status ? ` (${stateSnapshot.investigation_status})` : ""}
- Machine active: ${activeMachine ?? "AUCUNE"}
- Confirmation profil en attente: ${stateSnapshot.profile_confirm_pending ? "OUI" : "NON"}
- Topic exploration phase: ${stateSnapshot.topic_exploration_phase ?? "none"}
`

  // Add mother signals (always)
  prompt += MOTHER_SIGNALS_SECTION
  
  // Add deferred topics section (for dispatcher awareness of queued topics)
  prompt += buildDeferredTopicsSection(flowContext)
  
  // Add checkup intent detection (always, unless already in bilan)
  // This allows users to trigger their daily checkup via LLM detection
  if (!stateSnapshot.investigation_active) {
    prompt += CHECKUP_INTENT_DETECTION_SECTION
  }
  
  // Add profile facts detection (only when no profile confirmation is pending)
  // This allows direct detection of 10 fact types without a mother signal
  if (!stateSnapshot.profile_confirm_pending) {
    prompt += PROFILE_FACTS_DETECTION_SECTION
  }
  
  // Add machine-specific addon with context if applicable
  prompt += buildMachineAddonWithContext(activeMachine, flowContext)
  
  // Add anti-duplication section
  prompt += buildAntiDuplicationSection(signalHistory)
  
  return prompt
}

/**
 * Check if a machine type matches a signal type.
 * Used to update signal status when entering a machine.
 */
function machineMatchesSignalType(machineType: string | null, signalType: string): boolean {
  if (!machineType || !signalType) return false
  const mappings: Record<string, string[]> = {
    "create_action_flow": ["create_action_intent", "create_action"],
    "update_action_flow": ["update_action_intent", "update_action"],
    "breakdown_action_flow": ["breakdown_action_intent", "breakdown_action", "breakdown_intent"],
    "topic_serious": ["topic_exploration_intent", "topic_serious"],
    "topic_light": ["topic_exploration_intent", "topic_light"],
    "deep_reasons_exploration": ["deep_reasons_intent", "deep_reasons"],
    "user_profile_confirmation": ["profile_info_detected", "profile_confirmation"],
    "investigation": ["checkup_intent", "checkup", "bilan"],
  }
  return mappings[machineType]?.includes(signalType) ?? false
}

/**
 * Dispatcher v2: produces structured signals instead of directly choosing a mode.
 * The supervisor then applies deterministic policies based on these signals.
 */
export async function analyzeSignals(
  message: string,
  stateSnapshot: {
    current_mode?: string
    investigation_active?: boolean
    investigation_status?: string
    toolflow_active?: boolean
    toolflow_kind?: string
    profile_confirm_pending?: boolean
    plan_confirm_pending?: boolean
    topic_exploration_phase?: string
    risk_level?: string
  },
  lastAssistantMessage: string,
  meta?: { requestId?: string; forceRealAi?: boolean; model?: string },
): Promise<DispatcherSignals> {
  // Deterministic test mode
  const mega =
    (((globalThis as any)?.Deno?.env?.get?.("MEGA_TEST_MODE") ?? "") as string).trim() === "1" &&
    !meta?.forceRealAi
  if (mega) {
    return { ...DEFAULT_SIGNALS }
  }

  const prompt = `Tu es le Dispatcher de Sophia. Ton rôle est d'analyser le message utilisateur et produire des SIGNAUX structurés (pas de décision de routage).

DERNIER MESSAGE ASSISTANT:
"${(lastAssistantMessage ?? "").slice(0, 300)}"

ÉTAT ACTUEL (snapshot):
- Mode en cours: ${stateSnapshot.current_mode ?? "unknown"}
- Bilan actif: ${stateSnapshot.investigation_active ? "OUI" : "NON"}${stateSnapshot.investigation_status ? ` (${stateSnapshot.investigation_status})` : ""}
- Toolflow actif: ${stateSnapshot.toolflow_active ? `OUI (${stateSnapshot.toolflow_kind ?? "unknown"})` : "NON"}
- Confirmation profil en attente: ${stateSnapshot.profile_confirm_pending ? "OUI" : "NON"}
- Confirmation plan en attente (WhatsApp onboarding): ${stateSnapshot.plan_confirm_pending ? "OUI" : "NON"}
- Topic exploration phase: ${stateSnapshot.topic_exploration_phase ?? "none"}

SIGNAUX À PRODUIRE (JSON strict):

1. **safety** — Détresse/danger?
   - level: "NONE" | "FIREFIGHTER" (détresse émotionnelle aiguë) | "SENTRY" (danger vital)
   - confidence: 0.0 à 1.0
   - immediacy: "acute" | "non_acute" | "unknown" (si safety != NONE)

2. **user_intent_primary** — Intention principale?
   - "CHECKUP" (veut faire/continuer un bilan)
   - "EMOTIONAL_SUPPORT" (veut parler émotions sans danger)
   - "SMALL_TALK" (bavardage, "salut", "ça va")
   - "PREFERENCE" (veut changer style/ton/emoji/préférences)
   - "UNKNOWN"
   
   NOTE: Les discussions sur le plan/objectifs passent par topic_depth (LIGHT ou SERIOUS selon profondeur).
   Les demandes de création/modification d'action passent par create_action/update_action/breakdown_action.

3. **user_intent_confidence**: 0.0 à 1.0

4. **interrupt** — L'utilisateur interrompt le flow actuel?
   - kind: "NONE" | "EXPLICIT_STOP" | "BORED" | "SWITCH_TOPIC" | "DIGRESSION"
   - confidence: 0.0 à 1.0
   - deferred_topic_formalized: SI kind="DIGRESSION" ou "SWITCH_TOPIC", extrait le VRAI sujet (pas "je sais pas") et reformule-le en 3-8 mots avec "ton/ta/tes" (ex: "la situation avec ton boss", "ton stress au travail"). Si le message ne contient pas de vrai sujet concret, mets null.

5. **flow_resolution** — L'utilisateur indique un état de flow?
   - kind: "NONE" | "ACK_DONE" (confirme avoir fini) | "WANTS_RESUME" | "DECLINES_RESUME" | "WANTS_PAUSE"
   - confidence: 0.0 à 1.0

RÈGLE SPÉCIALE (plan_confirm_pending):
- Si "Confirmation plan en attente" = OUI, utilise ACK_DONE UNIQUEMENT si l'utilisateur confirme avoir finalisé/activé son plan sur le site/dashboard.
- Si tu n'es pas sûr que ça parle du plan (ex: "j'ai fini ma journée", "ok" ambigu), laisse flow_resolution.kind="NONE".

6. **topic_depth** — Profondeur du sujet abordé (pour topic_exploration)?
   - value: "NONE" | "NEED_SUPPORT" | "SERIOUS" | "LIGHT"
   - confidence: 0.0 à 1.0
   - plan_focus: true/false (true si la discussion porte sur le plan/objectifs, false sinon)
   CRITÈRES:
   - "NEED_SUPPORT": L'utilisateur exprime un besoin de soutien émotionnel, de la vulnérabilité, de l'anxiété, du mal-être (sans danger vital). Détresse modérée.
   - "SERIOUS": Sujet profond qui touche la psyché — problèmes personnels, peurs, blocages, patterns de comportement, relations difficiles, introspection. PAS de détresse aiguë.
   - "LIGHT": Sujet léger — bavardage, anecdotes du quotidien, humour, discussions sans enjeu émotionnel profond.
   - "NONE": Aucun des cas ci-dessus (bilan en cours, préférences techniques, ou opérations tools explicites).
   
   IMPORTANT - DISCUSSIONS SUR LE PLAN:
   - Si l'utilisateur DISCUTE de son plan/objectifs (réflexion, clarification, questions sur le sens):
     * Discussion légère (questions simples, clarifications) → "LIGHT" + plan_focus=true
     * Discussion profonde (doutes, blocages, sens de l'objectif) → "SERIOUS" + plan_focus=true
   - Si l'utilisateur demande une OPÉRATION outil (créer/modifier/supprimer action) → "NONE" (les tool signals gèrent)
   - Exemples:
     * "Je me demande si mon objectif est le bon" → SERIOUS + plan_focus=true
     * "C'est quoi la prochaine étape ?" → LIGHT + plan_focus=true  
     * "Ajoute-moi une action sport" → NONE (c'est une opération tool, pas une discussion)

7. **wants_tools**: true si l'utilisateur demande explicitement d'activer/créer/modifier une action

8. **risk_score**: 0 (calme) à 10 (danger vital)

9. **deep_reasons** — Blocage motivationnel détecté?
   - opportunity: true si le message exprime un blocage MOTIVATIONNEL (pas pratique):
     * "j'ai pas envie", "j'y crois pas", "je sais pas pourquoi je fais ça"
     * "ça me saoule", "flemme chronique", "aucune motivation"
     * "j'évite", "je repousse sans raison", "j'arrive vraiment pas"
     * "ça me fait peur", "je me sens nul", "c'est trop pour moi"
     * "une partie de moi veut pas", "je suis pas fait pour ça"
   - action_mentioned: true si le blocage concerne une ACTION SPÉCIFIQUE (méditation, sport, sommeil, etc.)
     * "j'arrive pas à faire ma méditation" → action_mentioned=true, action_hint="méditation"
     * "j'ai la flemme en général" → action_mentioned=false
     * "c'est trop dur le sport" → action_mentioned=true, action_hint="sport"
   - action_hint: si action_mentioned=true, extrais le nom de l'action (ex: "méditation", "sport", "lecture")
   - deferred_ready: laisse à false (sera déterminé côté router avec l'état)
   - in_bilan_context: true si "Bilan actif" = OUI ci-dessus
   - confidence: 0.0 à 1.0

   NOTE: opportunity=true pour blocages MOTIVATIONNELS uniquement.
   PAS pour blocages pratiques (oubli, temps, organisation) → ceux-ci restent dans BREAKDOWN.

10. **needs_explanation** — Besoin d'explication détaillée?
   - value: true si l'utilisateur pose une question complexe qui nécessite une explication structurée
   - confidence: 0.0 à 1.0
   - reason: raison courte (ex: "question sur mécanisme", "demande de guide")
   EXEMPLES déclencheurs:
   - "Comment ça marche exactement ?"
   - "Tu peux m'expliquer en détail ?"
   - "Pourquoi c'est comme ça ?"
   - "C'est quoi la différence entre X et Y ?"
   - Toute question qui demande une réponse structurée de plusieurs paragraphes.

11. **user_engagement** — Niveau d'engagement utilisateur?
   - level: "HIGH" | "MEDIUM" | "LOW" | "DISENGAGED"
   - confidence: 0.0 à 1.0
   CRITÈRES:
   - "HIGH": Enthousiaste, pose des questions de suivi, réponses longues, curiosité.
   - "MEDIUM": Engagé mais neutre, répond normalement.
   - "LOW": Réponses courtes, intérêt déclinant, "ok", "ouais".
   - "DISENGAGED": Monosyllabes, veut passer à autre chose, "bref", "bon".

12. **topic_satisfaction** — Satisfaction sur le sujet?
   - detected: true si l'utilisateur semble satisfait/a compris
   - confidence: 0.0 à 1.0
   EXEMPLES déclencheurs:
   - "Merci, je comprends mieux"
   - "Ok ça m'aide"
   - "Je vois"
   - "Parfait, c'est clair"
   - Toute expression de gratitude ou compréhension après explication.

13. **create_action** — Création d'action détectée?
   - intent_strength: "explicit" | "implicit" | "exploration" | "none"
   - sophia_suggested: true/false
   - user_response: "yes" | "no" | "modify" | "unclear" | "none"
   - modification_info: "available" | "missing" | "none"
   - action_type_hint: "habit" | "mission" | "framework" | "unknown"
   - action_label_hint: string ou null (label de l'action si détecté)
   - confidence: 0.0 à 1.0

   RÈGLES intent_strength:
   - "explicit": L'utilisateur demande explicitement de créer/ajouter une action
     * "Crée-moi une action pour...", "Ajoute ça à mon plan", "Mets X dans mon plan"
     * Contient un verbe de création + mention du plan/action
   - "implicit": L'utilisateur répond positivement à une suggestion de Sophia
     * Sophia a suggéré une action ET user dit "oui", "ok", "d'accord", "ça marche"
     * NE PAS confondre avec un simple acquiescement sans contexte d'action
   - "exploration": L'utilisateur explore une idée mais n'est pas engagé
     * "Ce serait bien de...", "J'y pense", "Tu en penses quoi ?", "Et si je faisais..."
     * Contient de l'hésitation ou une question ouverte
   - "none": Pas de signal de création d'action

   RÈGLES sophia_suggested:
   - true SI le DERNIER MESSAGE ASSISTANT contient une proposition d'action/habitude
     * "Tu veux que je l'ajoute ?", "On la crée ?", "Je te propose de créer..."
     * Mention explicite d'une action avec question de confirmation
   - false sinon

   RÈGLES user_response (si sophia_suggested=true OU on est dans un flow de création):
   - "yes": L'utilisateur accepte clairement
     * "oui", "ok", "vas-y", "d'accord", "ça marche", "parfait"
   - "no": L'utilisateur refuse clairement
     * "non", "pas maintenant", "laisse tomber", "on oublie"
   - "modify": L'utilisateur veut modifier les paramètres
     * "oui mais...", "plutôt X fois", "non le soir plutôt", "change ça"
   - "unclear": Réponse ambiguë
     * "hmm", "bof", "je sais pas", "peut-être"
   - "none": Pas de contexte de réponse

   RÈGLES modification_info (si user_response="modify" ou "no"):
   - "available": L'utilisateur a donné une info précise pour modifier
     * "plutôt 3 fois par semaine", "le matin pas le soir", "change le nom en X"
   - "missing": L'utilisateur a refusé/modifié sans donner de détails
     * "non ça va pas", "change ça" (sans précision)
   - "none": Pas applicable

   RÈGLES action_type_hint:
   - "habit": Action récurrente (sport, méditation, lecture quotidienne)
   - "mission": Action one-shot (acheter X, appeler Y, finir un projet)
   - "framework": Exercice de réflexion/journaling
   - "unknown": Pas clair

14. **update_action** — Modification d'action existante détectée?
   - detected: true/false
   - target_hint: string ou null (nom de l'action à modifier)
   - change_type: "frequency" | "days" | "time" | "title" | "mixed" | "unknown"
   - new_value_hint: string ou null (nouvelle valeur proposée)
   - user_response: "yes" | "no" | "modify" | "unclear" | "none"
   - confidence: 0.0 à 1.0

   RÈGLES detected:
   - true SI l'utilisateur demande de MODIFIER une action EXISTANTE
     * "passe lecture à 5 fois", "change sport en 3x/semaine"
     * "mets méditation le matin", "renomme l'action en X"
     * "enlève le vendredi", "ajoute le lundi"
   - false sinon (création = signal 13, pas update)

   RÈGLES target_hint:
   - Extrais le NOM de l'action mentionnée
     * "passe lecture à 5x" → target_hint = "lecture"
     * "change sport" → target_hint = "sport"
   - null si pas clair

   RÈGLES change_type:
   - "frequency": changement de fréquence (X fois/semaine)
   - "days": changement de jours (lundi, mercredi...)
   - "time": changement de moment (matin, soir...)
   - "title": renommage de l'action
   - "mixed": plusieurs changements à la fois
   - "unknown": pas clair

   RÈGLES new_value_hint:
   - Extrais la NOUVELLE VALEUR demandée
     * "5 fois" → "5x"
     * "lundi et mercredi" → "lundi, mercredi"
     * "le matin" → "matin"
   - null si pas clair

   RÈGLES user_response (si Sophia a proposé une modification):
   - "yes": Accepte la modification proposée
   - "no": Refuse la modification
   - "modify": Veut une autre valeur
   - "unclear": Réponse ambiguë
   - "none": Pas de contexte de réponse à une proposition

15. **breakdown_action** — Décomposition d'action en micro-étapes détectée?
   - detected: true/false
   - target_hint: string ou null (nom de l'action à débloquer)
   - blocker_hint: string ou null (ce qui bloque l'utilisateur)
   - sophia_suggested: true/false (Sophia a proposé de décomposer)
   - user_response: "yes" | "no" | "unclear" | "none"
   - confidence: 0.0 à 1.0

   RÈGLES detected:
   - true SI l'utilisateur veut DÉBLOQUER ou DÉCOMPOSER une action
     * "je bloque sur X", "j'arrive pas à faire X", "X c'est trop dur"
     * "micro-étape pour X", "découpe X", "simplifie X"
     * "insurmontable", "je repousse", "je procrastine sur X"
   - false sinon (création = signal 13, modification = signal 14)

   RÈGLES target_hint:
   - Extrais le NOM de l'action mentionnée
     * "je bloque sur le sport" → target_hint = "sport"
     * "j'arrive pas à méditer" → target_hint = "méditation"
   - null si pas clair

   RÈGLES blocker_hint:
   - Extrais la RAISON du blocage si mentionnée
     * "trop fatigué le soir" → blocker_hint = "trop fatigué le soir"
     * "pas assez de temps" → blocker_hint = "manque de temps"
   - null si pas mentionné

   RÈGLES sophia_suggested:
   - true SI le DERNIER MESSAGE ASSISTANT contient une proposition de décomposition
     * "Tu veux qu'on la découpe ?", "Je te propose une micro-étape"
     * "On simplifie ?", "Tu veux une version plus facile ?"
   - false sinon

   RÈGLES user_response (si sophia_suggested=true OU en flow de breakdown):
   - "yes": L'utilisateur accepte la micro-étape proposée
   - "no": L'utilisateur refuse
   - "unclear": Réponse ambiguë
   - "none": Pas de contexte de réponse

16. **track_progress** — Enregistrement de progression détecté?
   - detected: true/false
   - target_hint: string ou null (nom de l'action concernée)
   - status_hint: "completed" | "missed" | "partial" | "unknown"
   - value_hint: number ou null (valeur numérique si mentionnée)
   - confidence: 0.0 à 1.0

   RÈGLES detected:
   - true SI l'utilisateur rapporte une progression sur une action
     * "J'ai fait mon sport", "J'ai médité", "J'ai pas fait ma lecture"
     * "J'ai raté/loupé/zappé X", "J'ai tenu", "J'ai réussi"
     * "Fait !", "Done", "Validé", "Coché"
     * "J'ai fait 3 fois cette semaine"
   - false sinon

   RÈGLES target_hint:
   - Extrais le NOM de l'action mentionnée
     * "j'ai fait mon sport" → target_hint = "sport"
     * "j'ai médité ce matin" → target_hint = "méditation"
   - null si pas clair ou action non mentionnée

   RÈGLES status_hint:
   - "completed": L'utilisateur a fait l'action
     * "j'ai fait", "j'ai réussi", "fait !", "validé"
   - "missed": L'utilisateur n'a pas fait l'action
     * "j'ai pas fait", "j'ai raté", "j'ai loupé", "zappé"
   - "partial": L'utilisateur a fait partiellement
     * "j'ai fait à moitié", "un peu", "pas complètement"
   - "unknown": Pas clair

   RÈGLES value_hint:
   - Extrais un nombre si mentionné
     * "j'ai fait 3 fois" → value_hint = 3
     * "j'ai bu 2 litres d'eau" → value_hint = 2
   - null si pas de valeur numérique

17. **activate_action** — Activation d'action détectée?
   - detected: true/false
   - target_hint: string ou null (nom de l'action à activer)
   - exercise_type_hint: string ou null (type d'exercice si spécifique)
   - confidence: 0.0 à 1.0

   RÈGLES detected:
   - true SI l'utilisateur veut ACTIVER une action dormante/future
     * "Active-moi X", "Lance X", "Démarre X"
     * "Je veux commencer X", "On active X ?"
     * "Attrape-rêves go !", "Lance l'exercice"
   - false sinon (création = signal 13, c'est différent)

   RÈGLES target_hint:
   - Extrais le NOM de l'action à activer
     * "active le sport" → target_hint = "sport"
     * "lance l'attrape-rêves" → target_hint = "attrape-rêves"
   - null si pas clair

   RÈGLES exercise_type_hint:
   - Si c'est un exercice spécifique connu, extrais le type
     * "attrape-rêves", "bilan quotidien", "journal de gratitude"
   - null si c'est une action simple

18. **safety_resolution** — Signaux de résolution de crise (si safety flow actif)?
   - user_confirms_safe: true/false (l'utilisateur confirme être en sécurité)
   - stabilizing_signal: true/false (signes d'apaisement)
   - symptoms_still_present: true/false (symptômes physiques/émotionnels encore présents)
   - external_help_mentioned: true/false (aide externe mentionnée)
   - escalate_to_sentry: true/false (situation devient vitale)
   - confidence: 0.0 à 1.0

   RÈGLES user_confirms_safe:
   - true SI l'utilisateur confirme EXPLICITEMENT être en sécurité
     * "oui je suis en sécurité", "je suis chez moi", "je suis avec quelqu'un"
     * "non je ne vais pas me faire de mal", "non pas de danger"
   - false sinon

   RÈGLES stabilizing_signal:
   - true SI l'utilisateur montre des signes d'apaisement
     * "ça va mieux", "je me calme", "merci", "je respire mieux"
     * "ok j'ai fait l'exercice", "ça redescend"
     * "c'est bon", "ça passe", "je gère"
   - false sinon

   RÈGLES symptoms_still_present:
   - true SI l'utilisateur mentionne ENCORE des symptômes physiques/émotionnels
     * "j'ai encore le cœur qui bat", "je tremble encore"
     * "j'ai toujours du mal à respirer", "j'ai des vertiges"
     * "je pleure encore", "j'ai toujours peur"
   - false si aucun symptôme mentionné ou symptômes résolus

   RÈGLES external_help_mentioned:
   - true SI l'utilisateur mentionne avoir contacté/être avec de l'aide externe
     * "j'ai appelé le SAMU", "je suis avec mon ami", "j'ai prévenu ma sœur"
     * "je vais voir un médecin", "j'ai un rdv psy"
   - false sinon

   RÈGLES escalate_to_sentry:
   - true SI la situation firefighter devient VITALE (danger de mort)
     * "j'ai envie de me faire du mal", "j'ai des idées noires"
     * "je veux mourir", "je vais sauter"
     * TOUTE mention de danger vital alors qu'on était en crise émotionnelle
   - false sinon (rester en firefighter)

RÈGLES:
- Produis UNIQUEMENT le JSON, pas de prose.
- Sois conservateur sur safety (confidence >= 0.75 pour FIREFIGHTER/SENTRY).
- "stop", "arrête", "on arrête" = EXPLICIT_STOP (confidence élevée).
- "ok.", "bon.", réponses très courtes après question = potentiellement BORED.
- "plus tard", "pas maintenant" = DIGRESSION ou WANTS_PAUSE, PAS un stop.
- Pour topic_depth: si intent est PLAN/CHECKUP/BREAKDOWN/PREFERENCE, mets "NONE". Analyse le sujet UNIQUEMENT si c'est une digression ou un changement de sujet.

MESSAGE UTILISATEUR:
"${(message ?? "").slice(0, 800)}"

Réponds UNIQUEMENT avec le JSON:`

  try {
    const response = await generateWithGemini(prompt, "", 0.0, true, [], "auto", {
      requestId: meta?.requestId,
      model: meta?.model ?? "gemini-2.5-flash",
      source: "sophia-brain:dispatcher-v2",
    })
    const obj = JSON.parse(response as string) as any

    // Parse and validate signals
    const safetyLevel = (["NONE", "FIREFIGHTER", "SENTRY"] as SafetyLevel[]).includes(obj?.safety?.level)
      ? obj.safety.level as SafetyLevel
      : "NONE"
    const safetyConf = Math.max(0, Math.min(1, Number(obj?.safety?.confidence ?? 0.9) || 0.9))
    const immediacy = (["acute", "non_acute", "unknown"] as const).includes(obj?.safety?.immediacy)
      ? obj.safety.immediacy
      : "unknown"

    const intentPrimary = ([
      "CHECKUP", "EMOTIONAL_SUPPORT", "SMALL_TALK", "PREFERENCE", "UNKNOWN"
    ] as UserIntentPrimary[]).includes(obj?.user_intent_primary)
      ? obj.user_intent_primary as UserIntentPrimary
      : "UNKNOWN"
    const intentConf = Math.max(0, Math.min(1, Number(obj?.user_intent_confidence ?? 0.5) || 0.5))

    const interruptKind = (["NONE", "EXPLICIT_STOP", "BORED", "SWITCH_TOPIC", "DIGRESSION"] as InterruptKind[])
      .includes(obj?.interrupt?.kind)
      ? obj.interrupt.kind as InterruptKind
      : "NONE"
    const interruptConf = Math.max(0, Math.min(1, Number(obj?.interrupt?.confidence ?? 0.9) || 0.9))
    // Extract formalized deferred topic if present (for DIGRESSION/SWITCH_TOPIC)
    const deferredTopicRaw = obj?.interrupt?.deferred_topic_formalized
    const deferredTopicFormalized = (
      typeof deferredTopicRaw === "string" && 
      deferredTopicRaw.trim().length >= 3 && 
      deferredTopicRaw.trim().length <= 120 &&
      !/^(je\s+sais?\s+pas|null|undefined|none)$/i.test(deferredTopicRaw.trim())
    ) ? deferredTopicRaw.trim() : null

    const flowKind = (["NONE", "ACK_DONE", "WANTS_RESUME", "DECLINES_RESUME", "WANTS_PAUSE"] as FlowResolutionKind[])
      .includes(obj?.flow_resolution?.kind)
      ? obj.flow_resolution.kind as FlowResolutionKind
      : "NONE"
    const flowConf = Math.max(0, Math.min(1, Number(obj?.flow_resolution?.confidence ?? 0.9) || 0.9))

    // Parse topic_depth signal
    const topicDepthValue = (["NONE", "NEED_SUPPORT", "SERIOUS", "LIGHT"] as TopicDepth[])
      .includes(obj?.topic_depth?.value)
      ? obj.topic_depth.value as TopicDepth
      : "NONE"
    const topicDepthConf = Math.max(0, Math.min(1, Number(obj?.topic_depth?.confidence ?? 0.9) || 0.9))
    const topicDepthPlanFocus = Boolean(obj?.topic_depth?.plan_focus)

    // Parse deep_reasons signal
    const deepReasonsOpportunity = Boolean(obj?.deep_reasons?.opportunity)
    const deepReasonsActionMentioned = Boolean(obj?.deep_reasons?.action_mentioned)
    const deepReasonsActionHint = (typeof obj?.deep_reasons?.action_hint === "string" && obj.deep_reasons.action_hint.trim())
      ? obj.deep_reasons.action_hint.trim().slice(0, 50)
      : undefined
    const deepReasonsInBilanContext = Boolean(obj?.deep_reasons?.in_bilan_context) || Boolean(stateSnapshot.investigation_active)
    const deepReasonsConf = Math.max(0, Math.min(1, Number(obj?.deep_reasons?.confidence ?? 0.5) || 0.5))
    // deferred_ready is computed at router level, not by LLM

    // Parse needs_explanation signal
    const needsExplanationValue = Boolean(obj?.needs_explanation?.value)
    const needsExplanationConf = Math.max(0, Math.min(1, Number(obj?.needs_explanation?.confidence ?? 0.5) || 0.5))
    const needsExplanationReason = typeof obj?.needs_explanation?.reason === "string" 
      ? obj.needs_explanation.reason.slice(0, 100) 
      : undefined

    // Parse user_engagement signal
    const engagementLevelRaw = String(obj?.user_engagement?.level ?? "MEDIUM").toUpperCase()
    const engagementLevel = (["HIGH", "MEDIUM", "LOW", "DISENGAGED"] as UserEngagementLevel[]).includes(engagementLevelRaw as UserEngagementLevel)
      ? engagementLevelRaw as UserEngagementLevel
      : "MEDIUM"
    const engagementConf = Math.max(0, Math.min(1, Number(obj?.user_engagement?.confidence ?? 0.5) || 0.5))

    // Parse topic_satisfaction signal
    const satisfactionDetected = Boolean(obj?.topic_satisfaction?.detected)
    const satisfactionConf = Math.max(0, Math.min(1, Number(obj?.topic_satisfaction?.confidence ?? 0.5) || 0.5))

    // Parse create_action signal
    const createActionIntentRaw = String(obj?.create_action?.intent_strength ?? "none").toLowerCase()
    const createActionIntent = (["explicit", "implicit", "exploration", "none"] as const).includes(createActionIntentRaw as any)
      ? createActionIntentRaw as "explicit" | "implicit" | "exploration" | "none"
      : "none"
    const createActionSophiaSuggested = Boolean(obj?.create_action?.sophia_suggested)
    const createActionUserResponseRaw = String(obj?.create_action?.user_response ?? "none").toLowerCase()
    const createActionUserResponse = (["yes", "no", "modify", "unclear", "none"] as const).includes(createActionUserResponseRaw as any)
      ? createActionUserResponseRaw as "yes" | "no" | "modify" | "unclear" | "none"
      : "none"
    const createActionModInfoRaw = String(obj?.create_action?.modification_info ?? "none").toLowerCase()
    const createActionModInfo = (["available", "missing", "none"] as const).includes(createActionModInfoRaw as any)
      ? createActionModInfoRaw as "available" | "missing" | "none"
      : "none"
    const createActionTypeRaw = String(obj?.create_action?.action_type_hint ?? "unknown").toLowerCase()
    const createActionType = (["habit", "mission", "framework", "unknown"] as const).includes(createActionTypeRaw as any)
      ? createActionTypeRaw as "habit" | "mission" | "framework" | "unknown"
      : "unknown"
    const createActionLabel = (typeof obj?.create_action?.action_label_hint === "string" && obj.create_action.action_label_hint.trim())
      ? obj.create_action.action_label_hint.trim().slice(0, 120)
      : undefined
    const createActionConf = Math.max(0, Math.min(1, Number(obj?.create_action?.confidence ?? 0.5) || 0.5))

    // Parse update_action signal
    const updateActionDetected = Boolean(obj?.update_action?.detected)
    const updateActionTargetHint = (typeof obj?.update_action?.target_hint === "string" && obj.update_action.target_hint.trim())
      ? obj.update_action.target_hint.trim().slice(0, 80)
      : undefined
    const updateActionChangeTypeRaw = String(obj?.update_action?.change_type ?? "unknown").toLowerCase()
    const updateActionChangeType = (["frequency", "days", "time", "title", "mixed", "unknown"] as const).includes(updateActionChangeTypeRaw as any)
      ? updateActionChangeTypeRaw as "frequency" | "days" | "time" | "title" | "mixed" | "unknown"
      : "unknown"
    const updateActionNewValueHint = (typeof obj?.update_action?.new_value_hint === "string" && obj.update_action.new_value_hint.trim())
      ? obj.update_action.new_value_hint.trim().slice(0, 80)
      : undefined
    const updateActionUserResponseRaw = String(obj?.update_action?.user_response ?? "none").toLowerCase()
    const updateActionUserResponse = (["yes", "no", "modify", "unclear", "none"] as const).includes(updateActionUserResponseRaw as any)
      ? updateActionUserResponseRaw as "yes" | "no" | "modify" | "unclear" | "none"
      : "none"
    const updateActionConf = Math.max(0, Math.min(1, Number(obj?.update_action?.confidence ?? 0.5) || 0.5))

    // Parse breakdown_action signal
    const breakdownActionDetected = Boolean(obj?.breakdown_action?.detected)
    const breakdownActionTargetHint = (typeof obj?.breakdown_action?.target_hint === "string" && obj.breakdown_action.target_hint.trim())
      ? obj.breakdown_action.target_hint.trim().slice(0, 80)
      : undefined
    const breakdownActionBlockerHint = (typeof obj?.breakdown_action?.blocker_hint === "string" && obj.breakdown_action.blocker_hint.trim())
      ? obj.breakdown_action.blocker_hint.trim().slice(0, 200)
      : undefined
    const breakdownActionSophiaSuggested = Boolean(obj?.breakdown_action?.sophia_suggested)
    const breakdownActionUserResponseRaw = String(obj?.breakdown_action?.user_response ?? "none").toLowerCase()
    const breakdownActionUserResponse = (["yes", "no", "unclear", "none"] as const).includes(breakdownActionUserResponseRaw as any)
      ? breakdownActionUserResponseRaw as "yes" | "no" | "unclear" | "none"
      : "none"
    const breakdownActionConf = Math.max(0, Math.min(1, Number(obj?.breakdown_action?.confidence ?? 0.5) || 0.5))

    // Parse track_progress signal
    const trackProgressDetected = Boolean(obj?.track_progress?.detected)
    const trackProgressTargetHint = (typeof obj?.track_progress?.target_hint === "string" && obj.track_progress.target_hint.trim())
      ? obj.track_progress.target_hint.trim().slice(0, 80)
      : undefined
    const trackProgressStatusHintRaw = String(obj?.track_progress?.status_hint ?? "unknown").toLowerCase()
    const trackProgressStatusHint = (["completed", "missed", "partial", "unknown"] as const).includes(trackProgressStatusHintRaw as any)
      ? trackProgressStatusHintRaw as "completed" | "missed" | "partial" | "unknown"
      : "unknown"
    const trackProgressValueHint = (typeof obj?.track_progress?.value_hint === "number" && !isNaN(obj.track_progress.value_hint))
      ? obj.track_progress.value_hint
      : undefined
    const trackProgressConf = Math.max(0, Math.min(1, Number(obj?.track_progress?.confidence ?? 0.5) || 0.5))

    // Parse activate_action signal
    const activateActionDetected = Boolean(obj?.activate_action?.detected)
    const activateActionTargetHint = (typeof obj?.activate_action?.target_hint === "string" && obj.activate_action.target_hint.trim())
      ? obj.activate_action.target_hint.trim().slice(0, 80)
      : undefined
    const activateActionExerciseHint = (typeof obj?.activate_action?.exercise_type_hint === "string" && obj.activate_action.exercise_type_hint.trim())
      ? obj.activate_action.exercise_type_hint.trim().slice(0, 80)
      : undefined
    const activateActionConf = Math.max(0, Math.min(1, Number(obj?.activate_action?.confidence ?? 0.5) || 0.5))

    // Parse safety_resolution signal
    const safetyResolutionUserConfirmsSafe = Boolean(obj?.safety_resolution?.user_confirms_safe)
    const safetyResolutionStabilizingSignal = Boolean(obj?.safety_resolution?.stabilizing_signal)
    const safetyResolutionSymptomsStillPresent = Boolean(obj?.safety_resolution?.symptoms_still_present)
    const safetyResolutionExternalHelpMentioned = Boolean(obj?.safety_resolution?.external_help_mentioned)
    const safetyResolutionEscalateToSentry = Boolean(obj?.safety_resolution?.escalate_to_sentry)
    const safetyResolutionConf = Math.max(0, Math.min(1, Number(obj?.safety_resolution?.confidence ?? 0.5) || 0.5))

    const wantsTools = Boolean(obj?.wants_tools)
    const riskScore = Math.max(0, Math.min(10, Number(obj?.risk_score ?? 0) || 0))

    return {
      safety: { level: safetyLevel, confidence: safetyConf, immediacy: safetyLevel !== "NONE" ? immediacy : undefined },
      user_intent_primary: intentPrimary,
      user_intent_confidence: intentConf,
      interrupt: { 
        kind: interruptKind, 
        confidence: interruptConf,
        deferred_topic_formalized: (interruptKind === "DIGRESSION" || interruptKind === "SWITCH_TOPIC") ? deferredTopicFormalized : undefined,
      },
      flow_resolution: { kind: flowKind, confidence: flowConf },
      topic_depth: { value: topicDepthValue, confidence: topicDepthConf, plan_focus: topicDepthPlanFocus },
      deep_reasons: { 
        opportunity: deepReasonsOpportunity,
        action_mentioned: deepReasonsActionMentioned,
        action_hint: deepReasonsActionHint,
        deferred_ready: false, // Computed at router level
        in_bilan_context: deepReasonsInBilanContext,
        confidence: deepReasonsConf,
      },
      needs_explanation: {
        value: needsExplanationValue,
        confidence: needsExplanationConf,
        reason: needsExplanationReason,
      },
      user_engagement: {
        level: engagementLevel,
        confidence: engagementConf,
      },
      topic_satisfaction: {
        detected: satisfactionDetected,
        confidence: satisfactionConf,
      },
      create_action: {
        intent_strength: createActionIntent,
        sophia_suggested: createActionSophiaSuggested,
        user_response: createActionUserResponse,
        modification_info: createActionModInfo,
        action_type_hint: createActionType,
        action_label_hint: createActionLabel,
        confidence: createActionConf,
      },
      update_action: {
        detected: updateActionDetected,
        target_hint: updateActionTargetHint,
        change_type: updateActionChangeType,
        new_value_hint: updateActionNewValueHint,
        user_response: updateActionUserResponse,
        confidence: updateActionConf,
      },
      breakdown_action: {
        detected: breakdownActionDetected,
        target_hint: breakdownActionTargetHint,
        blocker_hint: breakdownActionBlockerHint,
        sophia_suggested: breakdownActionSophiaSuggested,
        user_response: breakdownActionUserResponse,
        confidence: breakdownActionConf,
      },
      track_progress: {
        detected: trackProgressDetected,
        target_hint: trackProgressTargetHint,
        status_hint: trackProgressStatusHint,
        value_hint: trackProgressValueHint,
        confidence: trackProgressConf,
      },
      activate_action: {
        detected: activateActionDetected,
        target_hint: activateActionTargetHint,
        exercise_type_hint: activateActionExerciseHint,
        confidence: activateActionConf,
      },
      safety_resolution: {
        user_confirms_safe: safetyResolutionUserConfirmsSafe,
        stabilizing_signal: safetyResolutionStabilizingSignal,
        symptoms_still_present: safetyResolutionSymptomsStillPresent,
        external_help_mentioned: safetyResolutionExternalHelpMentioned,
        escalate_to_sentry: safetyResolutionEscalateToSentry,
        confidence: safetyResolutionConf,
      },
      wants_tools: wantsTools,
      risk_score: riskScore,
    }
  } catch (e) {
    console.error("[Dispatcher v2] JSON parse error:", e)
    return { ...DEFAULT_SIGNALS }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DISPATCHER V2 CONTEXTUAL: Enhanced version with signal history
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Dispatcher v2 contextual: Enhanced version with signal history and deduplication.
 * Uses dynamic prompts based on active machine and prevents signal duplication.
 */
export async function analyzeSignalsV2(
  input: DispatcherInputV2,
  meta?: { requestId?: string; forceRealAi?: boolean; model?: string },
): Promise<DispatcherOutputV2> {
  // Deterministic test mode
  const mega =
    (((globalThis as any)?.Deno?.env?.get?.("MEGA_TEST_MODE") ?? "") as string).trim() === "1" &&
    !meta?.forceRealAi
  if (mega) {
    return { 
      signals: { ...DEFAULT_SIGNALS },
      new_signals: [],
      enrichments: [],
    }
  }

  // Build dynamic prompt with context and history
  const basePrompt = buildDispatcherPromptV2({
    activeMachine: input.activeMachine,
    signalHistory: input.signalHistory,
    stateSnapshot: input.stateSnapshot,
    lastAssistantMessage: input.lastAssistantMessage,
    flowContext: input.flowContext,
  })

  // Build message context (last 5 turns / 10 messages for understanding, analyze only last)
  const contextMessages = input.last5Messages
    .map((m, i) => {
      const msgIndex = i - input.last5Messages.length + 1
      const marker = msgIndex === 0 ? "[DERNIER - ANALYSER]" : `[Msg ${msgIndex}]`
      return `${marker} ${m.role}: ${m.content.slice(0, 200)}`
    })
    .join("\n")

  // Add the full signal output specification
  const fullPrompt = `${basePrompt}

=== CONTEXTE DES 10 DERNIERS MESSAGES (5 TOURS) ===
${contextMessages}

=== MESSAGE A ANALYSER (dernier message utilisateur) ===
"${(input.userMessage ?? "").slice(0, 800)}"

=== FORMAT DE SORTIE JSON ===
{
  "signals": {
    "safety": { "level": "NONE|FIREFIGHTER|SENTRY", "confidence": 0.0-1.0, "immediacy": "acute|non_acute|unknown" },
    "user_intent_primary": "CHECKUP|EMOTIONAL_SUPPORT|SMALL_TALK|PREFERENCE|UNKNOWN",
    "user_intent_confidence": 0.0-1.0,
    "interrupt": { "kind": "NONE|EXPLICIT_STOP|BORED|SWITCH_TOPIC|DIGRESSION", "confidence": 0.0-1.0 },
    "flow_resolution": { "kind": "NONE|ACK_DONE|WANTS_RESUME|DECLINES_RESUME|WANTS_PAUSE", "confidence": 0.0-1.0 },
    "topic_depth": { "value": "NONE|NEED_SUPPORT|SERIOUS|LIGHT", "confidence": 0.0-1.0, "plan_focus": bool },
    "deep_reasons": { "opportunity": bool, "action_mentioned": bool, "action_hint": string|null, "confidence": 0.0-1.0 },
    "needs_explanation": { "value": bool, "confidence": 0.0-1.0 },
    "user_engagement": { "level": "HIGH|MEDIUM|LOW|DISENGAGED", "confidence": 0.0-1.0 },
    "topic_satisfaction": { "detected": bool, "confidence": 0.0-1.0 },
    "create_action": { "intent_strength": "explicit|implicit|exploration|none", "sophia_suggested": bool, "user_response": "yes|no|modify|unclear|none", "action_type_hint": "habit|mission|framework|unknown", "confidence": 0.0-1.0 },
    "update_action": { "detected": bool, "target_hint": string|null, "change_type": "frequency|days|time|title|mixed|unknown", "user_response": "yes|no|modify|unclear|none", "confidence": 0.0-1.0 },
    "breakdown_action": { "detected": bool, "target_hint": string|null, "blocker_hint": string|null, "user_response": "yes|no|unclear|none", "confidence": 0.0-1.0 },
    "track_progress": { "detected": bool, "target_hint": string|null, "status_hint": "completed|missed|partial|unknown", "value_hint": number|null, "confidence": 0.0-1.0 },
    "activate_action": { "detected": bool, "target_hint": string|null, "exercise_type_hint": string|null, "confidence": 0.0-1.0 },
    "safety_resolution": { "user_confirms_safe": bool, "stabilizing_signal": bool, "symptoms_still_present": bool, "external_help_mentioned": bool, "escalate_to_sentry": bool, "confidence": 0.0-1.0 },
    "wants_tools": bool,
    "risk_score": 0-10
  },
  "new_signals": [
    { "signal_type": "string", "brief": "description max 100 chars", "confidence": 0.0-1.0, "action_target": "string|null" }
  ],
  "enrichments": [
    { "existing_signal_type": "string", "updated_brief": "new description with added context" }
  ],
  "machine_signals": { /* VOIR SECTION SIGNAUX SPECIFIQUES - inclure seulement si une machine est active */ }
}

REGLES:
- "signals": contient l'analyse complete comme avant (backward compatible)
- "new_signals": UNIQUEMENT pour les signaux detectes dans le DERNIER message qui ne sont PAS dans l'historique
- "enrichments": UNIQUEMENT pour mettre a jour le brief d'un signal existant avec du contexte NOUVEAU
- Ne pas re-emettre un signal deja dans l'historique!
- "machine_signals": INCLURE UNIQUEMENT si une machine est active (voir SIGNAUX SPECIFIQUES ci-dessus)

Reponds UNIQUEMENT avec le JSON:`

  try {
    const response = await generateWithGemini(fullPrompt, "", 0.0, true, [], "auto", {
      requestId: meta?.requestId,
      model: meta?.model ?? "gemini-2.5-flash",
      source: "sophia-brain:dispatcher-v2-contextual",
    })
    const obj = JSON.parse(response as string) as any
    
    // Parse the classic signals (reuse existing parsing logic from analyzeSignals)
    const signalsObj = obj?.signals ?? obj
    
    // Parse safety
    const safetyLevel = (["NONE", "FIREFIGHTER", "SENTRY"] as SafetyLevel[]).includes(signalsObj?.safety?.level)
      ? signalsObj.safety.level as SafetyLevel
      : "NONE"
    const safetyConf = Math.max(0, Math.min(1, Number(signalsObj?.safety?.confidence ?? 0.9) || 0.9))
    const immediacy = (["acute", "non_acute", "unknown"] as const).includes(signalsObj?.safety?.immediacy)
      ? signalsObj.safety.immediacy
      : "unknown"

    // Parse intent
    const intentPrimary = ([
      "CHECKUP", "EMOTIONAL_SUPPORT", "SMALL_TALK", "PREFERENCE", "UNKNOWN"
    ] as UserIntentPrimary[]).includes(signalsObj?.user_intent_primary)
      ? signalsObj.user_intent_primary as UserIntentPrimary
      : "UNKNOWN"
    const intentConf = Math.max(0, Math.min(1, Number(signalsObj?.user_intent_confidence ?? 0.5) || 0.5))

    // Parse interrupt
    const interruptKind = (["NONE", "EXPLICIT_STOP", "BORED", "SWITCH_TOPIC", "DIGRESSION"] as InterruptKind[])
      .includes(signalsObj?.interrupt?.kind)
      ? signalsObj.interrupt.kind as InterruptKind
      : "NONE"
    const interruptConf = Math.max(0, Math.min(1, Number(signalsObj?.interrupt?.confidence ?? 0.9) || 0.9))
    const deferredTopicRaw = signalsObj?.interrupt?.deferred_topic_formalized
    const deferredTopicFormalized = (
      typeof deferredTopicRaw === "string" && 
      deferredTopicRaw.trim().length >= 3 && 
      deferredTopicRaw.trim().length <= 120 &&
      !/^(je\s+sais?\s+pas|null|undefined|none)$/i.test(deferredTopicRaw.trim())
    ) ? deferredTopicRaw.trim() : null

    // Parse flow_resolution
    const flowKind = (["NONE", "ACK_DONE", "WANTS_RESUME", "DECLINES_RESUME", "WANTS_PAUSE"] as FlowResolutionKind[])
      .includes(signalsObj?.flow_resolution?.kind)
      ? signalsObj.flow_resolution.kind as FlowResolutionKind
      : "NONE"
    const flowConf = Math.max(0, Math.min(1, Number(signalsObj?.flow_resolution?.confidence ?? 0.9) || 0.9))

    // Parse topic_depth
    const topicDepthValue = (["NONE", "NEED_SUPPORT", "SERIOUS", "LIGHT"] as TopicDepth[])
      .includes(signalsObj?.topic_depth?.value)
      ? signalsObj.topic_depth.value as TopicDepth
      : "NONE"
    const topicDepthConf = Math.max(0, Math.min(1, Number(signalsObj?.topic_depth?.confidence ?? 0.9) || 0.9))
    const topicDepthPlanFocus = Boolean(signalsObj?.topic_depth?.plan_focus)

    // Parse deep_reasons
    const deepReasonsOpportunity = Boolean(signalsObj?.deep_reasons?.opportunity)
    const deepReasonsActionMentioned = Boolean(signalsObj?.deep_reasons?.action_mentioned)
    const deepReasonsActionHint = (typeof signalsObj?.deep_reasons?.action_hint === "string" && signalsObj.deep_reasons.action_hint.trim())
      ? signalsObj.deep_reasons.action_hint.trim().slice(0, 50)
      : undefined
    const deepReasonsInBilanContext = Boolean(signalsObj?.deep_reasons?.in_bilan_context) || Boolean(input.stateSnapshot.investigation_active)
    const deepReasonsConf = Math.max(0, Math.min(1, Number(signalsObj?.deep_reasons?.confidence ?? 0.5) || 0.5))

    // Parse needs_explanation
    const needsExplanationValue = Boolean(signalsObj?.needs_explanation?.value)
    const needsExplanationConf = Math.max(0, Math.min(1, Number(signalsObj?.needs_explanation?.confidence ?? 0.5) || 0.5))
    const needsExplanationReason = typeof signalsObj?.needs_explanation?.reason === "string" 
      ? signalsObj.needs_explanation.reason.slice(0, 100) 
      : undefined

    // Parse user_engagement
    const engagementLevelRaw = String(signalsObj?.user_engagement?.level ?? "MEDIUM").toUpperCase()
    const engagementLevel = (["HIGH", "MEDIUM", "LOW", "DISENGAGED"] as UserEngagementLevel[]).includes(engagementLevelRaw as UserEngagementLevel)
      ? engagementLevelRaw as UserEngagementLevel
      : "MEDIUM"
    const engagementConf = Math.max(0, Math.min(1, Number(signalsObj?.user_engagement?.confidence ?? 0.5) || 0.5))

    // Parse topic_satisfaction
    const satisfactionDetected = Boolean(signalsObj?.topic_satisfaction?.detected)
    const satisfactionConf = Math.max(0, Math.min(1, Number(signalsObj?.topic_satisfaction?.confidence ?? 0.5) || 0.5))

    // Parse create_action
    const createActionIntentRaw = String(signalsObj?.create_action?.intent_strength ?? "none").toLowerCase()
    const createActionIntent = (["explicit", "implicit", "exploration", "none"] as const).includes(createActionIntentRaw as any)
      ? createActionIntentRaw as "explicit" | "implicit" | "exploration" | "none"
      : "none"
    const createActionSophiaSuggested = Boolean(signalsObj?.create_action?.sophia_suggested)
    const createActionUserResponseRaw = String(signalsObj?.create_action?.user_response ?? "none").toLowerCase()
    const createActionUserResponse = (["yes", "no", "modify", "unclear", "none"] as const).includes(createActionUserResponseRaw as any)
      ? createActionUserResponseRaw as "yes" | "no" | "modify" | "unclear" | "none"
      : "none"
    const createActionModInfoRaw = String(signalsObj?.create_action?.modification_info ?? "none").toLowerCase()
    const createActionModInfo = (["available", "missing", "none"] as const).includes(createActionModInfoRaw as any)
      ? createActionModInfoRaw as "available" | "missing" | "none"
      : "none"
    const createActionTypeRaw = String(signalsObj?.create_action?.action_type_hint ?? "unknown").toLowerCase()
    const createActionType = (["habit", "mission", "framework", "unknown"] as const).includes(createActionTypeRaw as any)
      ? createActionTypeRaw as "habit" | "mission" | "framework" | "unknown"
      : "unknown"
    const createActionLabel = (typeof signalsObj?.create_action?.action_label_hint === "string" && signalsObj.create_action.action_label_hint.trim())
      ? signalsObj.create_action.action_label_hint.trim().slice(0, 120)
      : undefined
    const createActionConf = Math.max(0, Math.min(1, Number(signalsObj?.create_action?.confidence ?? 0.5) || 0.5))

    // Parse update_action
    const updateActionDetected = Boolean(signalsObj?.update_action?.detected)
    const updateActionTargetHint = (typeof signalsObj?.update_action?.target_hint === "string" && signalsObj.update_action.target_hint.trim())
      ? signalsObj.update_action.target_hint.trim().slice(0, 80)
      : undefined
    const updateActionChangeTypeRaw = String(signalsObj?.update_action?.change_type ?? "unknown").toLowerCase()
    const updateActionChangeType = (["frequency", "days", "time", "title", "mixed", "unknown"] as const).includes(updateActionChangeTypeRaw as any)
      ? updateActionChangeTypeRaw as "frequency" | "days" | "time" | "title" | "mixed" | "unknown"
      : "unknown"
    const updateActionNewValueHint = (typeof signalsObj?.update_action?.new_value_hint === "string" && signalsObj.update_action.new_value_hint.trim())
      ? signalsObj.update_action.new_value_hint.trim().slice(0, 80)
      : undefined
    const updateActionUserResponseRaw = String(signalsObj?.update_action?.user_response ?? "none").toLowerCase()
    const updateActionUserResponse = (["yes", "no", "modify", "unclear", "none"] as const).includes(updateActionUserResponseRaw as any)
      ? updateActionUserResponseRaw as "yes" | "no" | "modify" | "unclear" | "none"
      : "none"
    const updateActionConf = Math.max(0, Math.min(1, Number(signalsObj?.update_action?.confidence ?? 0.5) || 0.5))

    // Parse breakdown_action
    const breakdownActionDetected = Boolean(signalsObj?.breakdown_action?.detected)
    const breakdownActionTargetHint = (typeof signalsObj?.breakdown_action?.target_hint === "string" && signalsObj.breakdown_action.target_hint.trim())
      ? signalsObj.breakdown_action.target_hint.trim().slice(0, 80)
      : undefined
    const breakdownActionBlockerHint = (typeof signalsObj?.breakdown_action?.blocker_hint === "string" && signalsObj.breakdown_action.blocker_hint.trim())
      ? signalsObj.breakdown_action.blocker_hint.trim().slice(0, 200)
      : undefined
    const breakdownActionSophiaSuggested = Boolean(signalsObj?.breakdown_action?.sophia_suggested)
    const breakdownActionUserResponseRaw = String(signalsObj?.breakdown_action?.user_response ?? "none").toLowerCase()
    const breakdownActionUserResponse = (["yes", "no", "unclear", "none"] as const).includes(breakdownActionUserResponseRaw as any)
      ? breakdownActionUserResponseRaw as "yes" | "no" | "unclear" | "none"
      : "none"
    const breakdownActionConf = Math.max(0, Math.min(1, Number(signalsObj?.breakdown_action?.confidence ?? 0.5) || 0.5))

    // Parse track_progress signal
    const trackProgressDetected = Boolean(signalsObj?.track_progress?.detected)
    const trackProgressTargetHint = (typeof signalsObj?.track_progress?.target_hint === "string" && signalsObj.track_progress.target_hint.trim())
      ? signalsObj.track_progress.target_hint.trim().slice(0, 80)
      : undefined
    const trackProgressStatusHintRaw = String(signalsObj?.track_progress?.status_hint ?? "unknown").toLowerCase()
    const trackProgressStatusHint = (["completed", "missed", "partial", "unknown"] as const).includes(trackProgressStatusHintRaw as any)
      ? trackProgressStatusHintRaw as "completed" | "missed" | "partial" | "unknown"
      : "unknown"
    const trackProgressValueHint = (typeof signalsObj?.track_progress?.value_hint === "number" && !isNaN(signalsObj.track_progress.value_hint))
      ? signalsObj.track_progress.value_hint
      : undefined
    const trackProgressConf = Math.max(0, Math.min(1, Number(signalsObj?.track_progress?.confidence ?? 0.5) || 0.5))

    // Parse activate_action signal
    const activateActionDetected = Boolean(signalsObj?.activate_action?.detected)
    const activateActionTargetHint = (typeof signalsObj?.activate_action?.target_hint === "string" && signalsObj.activate_action.target_hint.trim())
      ? signalsObj.activate_action.target_hint.trim().slice(0, 80)
      : undefined
    const activateActionExerciseHint = (typeof signalsObj?.activate_action?.exercise_type_hint === "string" && signalsObj.activate_action.exercise_type_hint.trim())
      ? signalsObj.activate_action.exercise_type_hint.trim().slice(0, 80)
      : undefined
    const activateActionConf = Math.max(0, Math.min(1, Number(signalsObj?.activate_action?.confidence ?? 0.5) || 0.5))

    // Parse safety_resolution signal
    const safetyResolutionUserConfirmsSafe = Boolean(signalsObj?.safety_resolution?.user_confirms_safe)
    const safetyResolutionStabilizingSignal = Boolean(signalsObj?.safety_resolution?.stabilizing_signal)
    const safetyResolutionSymptomsStillPresent = Boolean(signalsObj?.safety_resolution?.symptoms_still_present)
    const safetyResolutionExternalHelpMentioned = Boolean(signalsObj?.safety_resolution?.external_help_mentioned)
    const safetyResolutionEscalateToSentry = Boolean(signalsObj?.safety_resolution?.escalate_to_sentry)
    const safetyResolutionConf = Math.max(0, Math.min(1, Number(signalsObj?.safety_resolution?.confidence ?? 0.5) || 0.5))

    const wantsTools = Boolean(signalsObj?.wants_tools)
    const riskScore = Math.max(0, Math.min(10, Number(signalsObj?.risk_score ?? 0) || 0))

    // Parse new_signals
    const newSignals: NewSignalEntry[] = []
    if (Array.isArray(obj?.new_signals)) {
      for (const sig of obj.new_signals.slice(0, 5)) {
        const signalType = String(sig?.signal_type ?? "").trim()
        const brief = String(sig?.brief ?? "").trim().slice(0, 100)
        const confidence = Math.max(0, Math.min(1, Number(sig?.confidence ?? 0.5) || 0.5))
        const actionTarget = (typeof sig?.action_target === "string" && sig.action_target.trim())
          ? sig.action_target.trim().slice(0, 80)
          : undefined
        if (signalType && brief) {
          newSignals.push({ signal_type: signalType, brief, confidence, action_target: actionTarget })
        }
      }
    }

    // Parse enrichments
    const enrichments: SignalEnrichment[] = []
    if (Array.isArray(obj?.enrichments)) {
      for (const enrich of obj.enrichments.slice(0, 5)) {
        const existingSignalType = String(enrich?.existing_signal_type ?? "").trim()
        const updatedBrief = String(enrich?.updated_brief ?? "").trim().slice(0, 100)
        if (existingSignalType && updatedBrief) {
          enrichments.push({ existing_signal_type: existingSignalType, updated_brief: updatedBrief })
        }
      }
    }

    // Parse machine_signals (only if present)
    let machineSignals: MachineSignals | undefined = undefined
    if (obj?.machine_signals && typeof obj.machine_signals === "object") {
      const ms = obj.machine_signals
      machineSignals = {}
      
      // create_action_flow signals
      if (ms.user_confirms_preview !== undefined) {
        const valid = ["yes", "no", "modify", "unclear", null]
        machineSignals.user_confirms_preview = valid.includes(ms.user_confirms_preview) 
          ? ms.user_confirms_preview 
          : null
      }
      if (ms.action_type_clarified !== undefined) {
        const valid = ["habit", "mission", "framework", null]
        machineSignals.action_type_clarified = valid.includes(ms.action_type_clarified) 
          ? ms.action_type_clarified 
          : null
      }
      if (ms.user_abandons !== undefined) {
        machineSignals.user_abandons = Boolean(ms.user_abandons)
      }
      if (ms.modification_requested !== undefined) {
        machineSignals.modification_requested = typeof ms.modification_requested === "string" 
          ? ms.modification_requested.slice(0, 200) 
          : null
      }
      
      // update_action_flow signals
      if (ms.user_confirms_change !== undefined) {
        const valid = ["yes", "no", "modify", "unclear", null]
        machineSignals.user_confirms_change = valid.includes(ms.user_confirms_change) 
          ? ms.user_confirms_change 
          : null
      }
      if (ms.new_value_provided !== undefined) {
        machineSignals.new_value_provided = typeof ms.new_value_provided === "string" 
          ? ms.new_value_provided.slice(0, 200) 
          : null
      }
      
      // breakdown_action_flow signals
      if (ms.user_confirms_microstep !== undefined) {
        const valid = ["yes", "no", null]
        machineSignals.user_confirms_microstep = valid.includes(ms.user_confirms_microstep) 
          ? ms.user_confirms_microstep 
          : null
      }
      if (ms.user_wants_different_step !== undefined) {
        machineSignals.user_wants_different_step = Boolean(ms.user_wants_different_step)
      }
      if (ms.blocker_clarified !== undefined) {
        machineSignals.blocker_clarified = typeof ms.blocker_clarified === "string" 
          ? ms.blocker_clarified.slice(0, 200) 
          : null
      }
      
      // topic_exploration signals
      if (ms.user_engagement !== undefined) {
        const valid = ["HIGH", "MEDIUM", "LOW", "DISENGAGED"]
        machineSignals.user_engagement = valid.includes(ms.user_engagement) 
          ? ms.user_engagement 
          : "MEDIUM"
      }
      if (ms.topic_satisfaction !== undefined && typeof ms.topic_satisfaction === "object") {
        machineSignals.topic_satisfaction = { detected: Boolean(ms.topic_satisfaction?.detected) }
      }
      if (ms.wants_to_change_topic !== undefined) {
        machineSignals.wants_to_change_topic = Boolean(ms.wants_to_change_topic)
      }
      if (ms.needs_deeper_exploration !== undefined) {
        machineSignals.needs_deeper_exploration = Boolean(ms.needs_deeper_exploration)
      }
      
      // deep_reasons_exploration signals
      if (ms.user_opens_up !== undefined) {
        machineSignals.user_opens_up = Boolean(ms.user_opens_up)
      }
      if (ms.resistance_detected !== undefined) {
        machineSignals.resistance_detected = Boolean(ms.resistance_detected)
      }
      if (ms.insight_emerged !== undefined) {
        machineSignals.insight_emerged = Boolean(ms.insight_emerged)
      }
      if (ms.wants_to_stop !== undefined) {
        machineSignals.wants_to_stop = Boolean(ms.wants_to_stop)
      }
      
      // activate_action_flow signals
      if (ms.user_confirms_activation !== undefined) {
        machineSignals.user_confirms_activation = ms.user_confirms_activation === null ? null : Boolean(ms.user_confirms_activation)
      }
      if (ms.user_wants_different_action !== undefined) {
        machineSignals.user_wants_different_action = typeof ms.user_wants_different_action === "string" 
          ? ms.user_wants_different_action.slice(0, 100) 
          : null
      }
      if (ms.activation_ready !== undefined) {
        machineSignals.activation_ready = Boolean(ms.activation_ready)
      }
      
      // user_profile_confirmation signals
      if (ms.user_confirms_fact !== undefined) {
        const valid = ["yes", "no", "nuance", null]
        machineSignals.user_confirms_fact = valid.includes(ms.user_confirms_fact) 
          ? ms.user_confirms_fact 
          : null
      }
      if (ms.user_provides_correction !== undefined) {
        machineSignals.user_provides_correction = typeof ms.user_provides_correction === "string" 
          ? ms.user_provides_correction.slice(0, 200) 
          : null
      }
      if (ms.fact_type_detected !== undefined) {
        machineSignals.fact_type_detected = typeof ms.fact_type_detected === "string" 
          ? ms.fact_type_detected.slice(0, 50) 
          : null
      }
      
      // bilan/investigation signals
      if (ms.breakdown_recommended !== undefined) {
        machineSignals.breakdown_recommended = Boolean(ms.breakdown_recommended)
      }
      if (ms.deep_reasons_opportunity !== undefined) {
        machineSignals.deep_reasons_opportunity = Boolean(ms.deep_reasons_opportunity)
      }
      if (ms.create_action_intent !== undefined) {
        machineSignals.create_action_intent = Boolean(ms.create_action_intent)
      }
      if (ms.update_action_intent !== undefined) {
        machineSignals.update_action_intent = Boolean(ms.update_action_intent)
      }
      if (ms.user_consents_defer !== undefined) {
        machineSignals.user_consents_defer = Boolean(ms.user_consents_defer)
      }
      
      // bilan/investigation confirmation signals (response to "tu veux qu'on en parle après le bilan ?")
      if (ms.confirm_deep_reasons !== undefined && ms.confirm_deep_reasons !== null) {
        machineSignals.confirm_deep_reasons = Boolean(ms.confirm_deep_reasons)
      }
      if (ms.confirm_breakdown !== undefined && ms.confirm_breakdown !== null) {
        machineSignals.confirm_breakdown = Boolean(ms.confirm_breakdown)
      }
      if (ms.confirm_topic !== undefined && ms.confirm_topic !== null) {
        machineSignals.confirm_topic = Boolean(ms.confirm_topic)
      }
      
      // Checkup flow signals
      if (ms.checkup_intent && typeof ms.checkup_intent === "object") {
        const ci = ms.checkup_intent
        machineSignals.checkup_intent = {
          detected: Boolean(ci.detected),
          confidence: Math.min(1, Math.max(0, Number(ci.confidence ?? 0))),
          trigger_phrase: typeof ci.trigger_phrase === "string" 
            ? ci.trigger_phrase.slice(0, 100) 
            : undefined,
        }
      }
      if (ms.wants_to_checkup !== undefined) {
        machineSignals.wants_to_checkup = Boolean(ms.wants_to_checkup)
      }
      if (ms.track_from_bilan_done_ok !== undefined) {
        machineSignals.track_from_bilan_done_ok = Boolean(ms.track_from_bilan_done_ok)
      }
      
      // Profile facts detection (direct, 10 types)
      if (ms.profile_facts_detected && typeof ms.profile_facts_detected === "object") {
        const pf = ms.profile_facts_detected
        const validFactTypes = [
          "work_schedule", "energy_peaks", "wake_time", "sleep_time", "job",
          "hobbies", "family", "tone_preference", "emoji_preference", "verbosity"
        ]
        const parsedFacts: ProfileFactsDetected = {}
        let hasAnyFact = false
        
        for (const factType of validFactTypes) {
          const fact = (pf as any)[factType]
          if (fact && typeof fact === "object" && typeof fact.value === "string") {
            const value = String(fact.value ?? "").trim().slice(0, 100)
            const confidence = Math.min(1, Math.max(0, Number(fact.confidence ?? 0.5)))
            if (value && confidence >= 0.5) {
              (parsedFacts as any)[factType] = { value, confidence }
              hasAnyFact = true
            }
          }
        }
        
        if (hasAnyFact) {
          machineSignals.profile_facts_detected = parsedFacts
        }
      }
      
      // Only include if there's at least one defined signal
      const hasAny = Object.values(machineSignals).some(v => v !== undefined)
      if (!hasAny) machineSignals = undefined
    }

    // Parse deferred_enrichment (if dispatcher identified enrichment for existing deferred topic)
    let deferredEnrichment: { topic_id: string; new_brief: string } | undefined = undefined
    if (obj?.deferred_enrichment && typeof obj.deferred_enrichment === "object") {
      const de = obj.deferred_enrichment
      const topicId = typeof de.topic_id === "string" ? de.topic_id.trim() : ""
      const newBrief = typeof de.new_brief === "string" ? de.new_brief.trim().slice(0, 150) : ""
      if (topicId && newBrief) {
        deferredEnrichment = { topic_id: topicId, new_brief: newBrief }
      }
    }

    return {
      signals: {
        safety: { level: safetyLevel, confidence: safetyConf, immediacy: safetyLevel !== "NONE" ? immediacy : undefined },
        user_intent_primary: intentPrimary,
        user_intent_confidence: intentConf,
        interrupt: { 
          kind: interruptKind, 
          confidence: interruptConf,
          deferred_topic_formalized: (interruptKind === "DIGRESSION" || interruptKind === "SWITCH_TOPIC") ? deferredTopicFormalized : undefined,
        },
        flow_resolution: { kind: flowKind, confidence: flowConf },
        topic_depth: { value: topicDepthValue, confidence: topicDepthConf, plan_focus: topicDepthPlanFocus },
        deep_reasons: { 
          opportunity: deepReasonsOpportunity,
          action_mentioned: deepReasonsActionMentioned,
          action_hint: deepReasonsActionHint,
          deferred_ready: false,
          in_bilan_context: deepReasonsInBilanContext,
          confidence: deepReasonsConf,
        },
        needs_explanation: {
          value: needsExplanationValue,
          confidence: needsExplanationConf,
          reason: needsExplanationReason,
        },
        user_engagement: {
          level: engagementLevel,
          confidence: engagementConf,
        },
        topic_satisfaction: {
          detected: satisfactionDetected,
          confidence: satisfactionConf,
        },
        create_action: {
          intent_strength: createActionIntent,
          sophia_suggested: createActionSophiaSuggested,
          user_response: createActionUserResponse,
          modification_info: createActionModInfo,
          action_type_hint: createActionType,
          action_label_hint: createActionLabel,
          confidence: createActionConf,
        },
        update_action: {
          detected: updateActionDetected,
          target_hint: updateActionTargetHint,
          change_type: updateActionChangeType,
          new_value_hint: updateActionNewValueHint,
          user_response: updateActionUserResponse,
          confidence: updateActionConf,
        },
        breakdown_action: {
          detected: breakdownActionDetected,
          target_hint: breakdownActionTargetHint,
          blocker_hint: breakdownActionBlockerHint,
          sophia_suggested: breakdownActionSophiaSuggested,
          user_response: breakdownActionUserResponse,
          confidence: breakdownActionConf,
        },
        track_progress: {
          detected: trackProgressDetected,
          target_hint: trackProgressTargetHint,
          status_hint: trackProgressStatusHint,
          value_hint: trackProgressValueHint,
          confidence: trackProgressConf,
        },
        activate_action: {
          detected: activateActionDetected,
          target_hint: activateActionTargetHint,
          exercise_type_hint: activateActionExerciseHint,
          confidence: activateActionConf,
        },
        safety_resolution: {
          user_confirms_safe: safetyResolutionUserConfirmsSafe,
          stabilizing_signal: safetyResolutionStabilizingSignal,
          symptoms_still_present: safetyResolutionSymptomsStillPresent,
          external_help_mentioned: safetyResolutionExternalHelpMentioned,
          escalate_to_sentry: safetyResolutionEscalateToSentry,
          confidence: safetyResolutionConf,
        },
        // Parse consent_to_relaunch (only present when pending consent exists)
        consent_to_relaunch: (() => {
          const ctr = signalsObj?.consent_to_relaunch ?? obj?.consent_to_relaunch
          if (!ctr) return undefined
          const valueRaw = ctr.value
          const value = valueRaw === true || valueRaw === "true" ? true
            : valueRaw === false || valueRaw === "false" ? false
            : valueRaw === "unclear" ? "unclear"
            : undefined
          if (value === undefined) return undefined
          const confidence = Math.max(0, Math.min(1, Number(ctr.confidence ?? 0.5) || 0.5))
          return { value, confidence }
        })(),
        wants_tools: wantsTools,
        risk_score: riskScore,
      },
      new_signals: newSignals,
      enrichments,
      machine_signals: machineSignals,
      deferred_enrichment: deferredEnrichment,
    }
  } catch (e) {
    console.error("[Dispatcher v2 contextual] JSON parse error:", e)
    return { 
      signals: { ...DEFAULT_SIGNALS },
      new_signals: [],
      enrichments: [],
      machine_signals: undefined,
    }
  }
}

export function looksLikeAcuteDistress(message: string): boolean {
  const s = (message ?? "").toString().toLowerCase()
  if (!s.trim()) return false
  // Keep conservative: route to firefighter on clear acute distress signals (panic/overwhelm/physical stress cues),
  // but avoid over-triggering on generic "stress" talk.
  return /\b(panique|crise|je\s+craque|je\s+n['']en\s+peux\s+plus|au\s+bout|d[ée]tresse|angoisse\s+(?:forte|intense)|aide\s+vite|urgence|envie\s+de\s+pleurer|j['']ai\s+envie\s+de\s+pleurer|boule\s+au\s+ventre|poitrine\s+serr[ée]e|serrement\s+dans\s+la\s+poitrine|difficile\s+de\s+respirer|mal\s+à\s+respirer|souffle\s+court|c[œo]ur\s+qui\s+s['']emballe|c[œo]ur\s+qui\s+cogne|submerg[ée]?|d[ée]bord[ée]?|je\s+n['']arrive\s+plus\s+à\s+me\s+concentrer|j['']arrive\s+pas\s+à\s+me\s+concentrer|pression\s+non\s+stop|pression\s+impossible)\b/i
    .test(s)
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEFERRED SIGNAL HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

export type DeferredMachineType = "deep_reasons" | "topic_light" | "topic_serious" | 
                                   "create_action" | "update_action" | "breakdown_action"

/**
 * Determine which machine type a signal would trigger (if any).
 * Returns null if the signals don't indicate any new machine.
 */
export function detectMachineTypeFromSignals(signals: DispatcherSignals): {
  machine_type: DeferredMachineType
  action_target?: string
  summary_hint?: string
} | null {
  // Priority order: tool flows > deep_reasons > topic exploration
  
  // 1. Breakdown action
  if (signals.breakdown_action.detected && signals.breakdown_action.confidence >= 0.6) {
    return {
      machine_type: "breakdown_action",
      action_target: signals.breakdown_action.target_hint,
      summary_hint: signals.breakdown_action.blocker_hint 
        ? `Blocage sur ${signals.breakdown_action.target_hint ?? "une action"}: ${signals.breakdown_action.blocker_hint}`
        : `Veut débloquer ${signals.breakdown_action.target_hint ?? "une action"}`,
    }
  }
  
  // 2. Create action
  if (signals.create_action.intent_strength === "explicit" || 
      signals.create_action.intent_strength === "implicit") {
    if (signals.create_action.confidence >= 0.6) {
      return {
        machine_type: "create_action",
        action_target: signals.create_action.action_label_hint,
        summary_hint: signals.create_action.action_label_hint
          ? `Veut créer: ${signals.create_action.action_label_hint}`
          : "Veut créer une nouvelle action",
      }
    }
  }
  
  // 3. Update action
  if (signals.update_action.detected && signals.update_action.confidence >= 0.6) {
    const changeDesc = signals.update_action.change_type !== "unknown" 
      ? ` (${signals.update_action.change_type})`
      : ""
    return {
      machine_type: "update_action",
      action_target: signals.update_action.target_hint,
      summary_hint: signals.update_action.target_hint
        ? `Veut modifier ${signals.update_action.target_hint}${changeDesc}`
        : `Veut modifier une action${changeDesc}`,
    }
  }
  
  // 4. Deep reasons
  if (signals.deep_reasons.opportunity && signals.deep_reasons.confidence >= 0.6) {
    return {
      machine_type: "deep_reasons",
      action_target: signals.deep_reasons.action_hint,
      summary_hint: signals.deep_reasons.action_hint
        ? `Blocage motivationnel sur ${signals.deep_reasons.action_hint}`
        : "Blocage motivationnel à explorer",
    }
  }
  
  // 5. Topic exploration (serious or light)
  if (signals.topic_depth.value !== "NONE" && signals.topic_depth.confidence >= 0.6) {
    if (signals.topic_depth.value === "SERIOUS" || signals.topic_depth.value === "NEED_SUPPORT") {
      return {
        machine_type: "topic_serious",
        action_target: signals.interrupt.deferred_topic_formalized ?? undefined,
        summary_hint: signals.interrupt.deferred_topic_formalized
          ? `Sujet profond: ${signals.interrupt.deferred_topic_formalized}`
          : "Sujet profond à explorer",
      }
    }
    if (signals.topic_depth.value === "LIGHT") {
      return {
        machine_type: "topic_light",
        action_target: signals.interrupt.deferred_topic_formalized ?? undefined,
        summary_hint: signals.interrupt.deferred_topic_formalized
          ? `Discussion: ${signals.interrupt.deferred_topic_formalized}`
          : "Sujet de conversation",
      }
    }
  }
  
  return null
}

/**
 * Generate a concise summary for a deferred signal (max 100 chars).
 * Uses rule-based extraction from signals, no LLM needed.
 */
export function generateDeferredSignalSummary(opts: {
  signals: DispatcherSignals
  userMessage: string
  machine_type: DeferredMachineType
  action_target?: string
}): string {
  const { signals, userMessage, machine_type, action_target } = opts
  const msgSnippet = String(userMessage ?? "").trim().slice(0, 60)
  
  // Try to use signal hints first
  switch (machine_type) {
    case "breakdown_action": {
      if (signals.breakdown_action.blocker_hint && action_target) {
        return `${action_target}: ${signals.breakdown_action.blocker_hint}`.slice(0, 100)
      }
      if (action_target) {
        return `Bloque sur ${action_target}`.slice(0, 100)
      }
      break
    }
    case "create_action": {
      if (action_target) {
        return `Veut créer: ${action_target}`.slice(0, 100)
      }
      break
    }
    case "update_action": {
      const change = signals.update_action.new_value_hint
      if (action_target && change) {
        return `Modifier ${action_target}: ${change}`.slice(0, 100)
      }
      if (action_target) {
        return `Modifier ${action_target}`.slice(0, 100)
      }
      break
    }
    case "deep_reasons": {
      if (action_target) {
        return `Blocage motivationnel: ${action_target}`.slice(0, 100)
      }
      break
    }
    case "topic_serious":
    case "topic_light": {
      if (signals.interrupt.deferred_topic_formalized) {
        return signals.interrupt.deferred_topic_formalized.slice(0, 100)
      }
      break
    }
  }
  
  // Fallback: use message snippet
  if (msgSnippet.length >= 10) {
    return msgSnippet.slice(0, 100)
  }
  
  // Last resort
  return `Signal ${machine_type}`.slice(0, 100)
}

/**
 * Check if a signal is a safety signal (sentry/firefighter).
 * These are the only signals that can interrupt active machines.
 */
export function isSafetySignal(signals: DispatcherSignals): boolean {
  return signals.safety.level === "SENTRY" || signals.safety.level === "FIREFIGHTER"
}

/**
 * Check if a safety signal is high-confidence enough to interrupt.
 */
export function shouldInterruptForSafety(signals: DispatcherSignals): boolean {
  if (signals.safety.level === "SENTRY" && signals.safety.confidence >= 0.7) {
    return true
  }
  if (signals.safety.level === "FIREFIGHTER" && signals.safety.confidence >= 0.75) {
    return true
  }
  return false
}


