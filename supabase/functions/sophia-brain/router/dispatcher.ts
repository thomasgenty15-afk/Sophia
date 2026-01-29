import type { AgentMode } from "../state-manager.ts"
import { generateWithGemini } from "../../_shared/gemini.ts"

// ═══════════════════════════════════════════════════════════════════════════════
// DISPATCHER V2: STRUCTURED SIGNALS
// Goal: IA interprets the turn → produces signals → Supervisor applies deterministic policy
// ═══════════════════════════════════════════════════════════════════════════════

export type SafetyLevel = "NONE" | "FIREFIGHTER" | "SENTRY"
export type UserIntentPrimary = "CHECKUP" | "PLAN" | "EMOTIONAL_SUPPORT" | "SMALL_TALK" | "PREFERENCE" | "BREAKDOWN" | "UNKNOWN"
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
   */
  topic_depth: {
    value: TopicDepth
    confidence: number // 0..1
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
                  "create_action" | "update_action" | "breakdown_action"
    action_target?: string
    summary: string
    deferred_action: "create" | "update" | "ignore"
    matching_deferred_id?: string
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
}

const DEFAULT_SIGNALS: DispatcherSignals = {
  safety: { level: "NONE", confidence: 0.9 },
  user_intent_primary: "UNKNOWN",
  user_intent_confidence: 0.5,
  interrupt: { kind: "NONE", confidence: 0.9 },
  flow_resolution: { kind: "NONE", confidence: 0.9 },
  topic_depth: { value: "NONE", confidence: 0.9 },
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
  wants_tools: false,
  risk_score: 0,
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTEXTUAL DISPATCHER V1: Dynamic prompt building
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Mother signals - always analyzed regardless of active machine.
 * These are high-level signals that can trigger new state machines.
 */
const MOTHER_SIGNALS_SECTION = `
=== SIGNAUX MERE (toujours actifs) ===
Ces signaux sont TOUJOURS analyses, meme si une machine a etat est active.
Ils servent a detecter de nouvelles intentions qui seront mises en attente (deferred).

- safety: Detecte detresse/danger (sentry/firefighter)
- create_action_intent: Signal mere pour creation d'action
- update_action_intent: Signal mere pour modification d'action
- breakdown_action_intent: Signal mere pour decomposition d'action
- topic_exploration_intent: Signal mere pour exploration de sujet (serious/light)
- deep_reasons_intent: Signal mere pour blocage motivationnel
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
 * Flow context for enriching machine-specific addons.
 */
export interface FlowContext {
  /** For create_action_flow: the action being created */
  actionLabel?: string
  actionType?: string
  actionStatus?: string
  /** For update_action_flow: the action being updated */
  targetActionTitle?: string
  proposedChanges?: string
  /** For breakdown_action_flow: the action being broken down */
  breakdownTarget?: string
  blocker?: string
  proposedStep?: string
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
  isBilan?: boolean
}

/**
 * Build machine-specific addon with flow context.
 */
function buildMachineAddonWithContext(activeMachine: string | null, flowContext?: FlowContext): string {
  if (!activeMachine) return ""
  
  if (activeMachine === "create_action_flow") {
    let addon = `
=== SIGNAUX SPECIFIQUES (create_action_flow actif) ===
Tu es dans un flow de CREATION D'ACTION.
`
    if (flowContext?.actionLabel) {
      addon += `
CONTEXTE DU FLOW:
- Action en cours de creation: "${flowContext.actionLabel}"
- Type: ${flowContext.actionType ?? "non defini"}
- Statut: ${flowContext.actionStatus ?? "en cours"}
`
    }
    addon += `
Analyse ces signaux en plus et AJOUTE-LES dans ta reponse JSON sous "machine_signals":

{
  "machine_signals": {
    "user_confirms_preview": "yes" | "no" | "modify" | "unclear" | null,
    "action_type_clarified": "habit" | "mission" | "framework" | null,
    "user_abandons": true | false,
    "modification_requested": "string decrivant la modification" | null
  }
}

Guide d'interpretation:
- user_confirms_preview: "yes" si acceptation claire ("ok", "ca me va", "parfait"), "no" si refus, "modify" si demande de changement, "unclear" si ambigu
- action_type_clarified: seulement si l'utilisateur mentionne explicitement le type
- user_abandons: true si "laisse tomber", "on oublie", "non finalement", "annule"
- modification_requested: texte de la modification demandee (ex: "changer le nom", "ajouter un rappel")
`
    return addon
  }
  
  if (activeMachine === "update_action_flow") {
    let addon = `
=== SIGNAUX SPECIFIQUES (update_action_flow actif) ===
Tu es dans un flow de MODIFICATION D'ACTION.
`
    if (flowContext?.targetActionTitle) {
      addon += `
CONTEXTE DU FLOW:
- Action a modifier: "${flowContext.targetActionTitle}"
- Changements proposes: ${flowContext.proposedChanges ?? "en attente"}
`
    }
    addon += `
Analyse ces signaux en plus et AJOUTE-LES dans ta reponse JSON sous "machine_signals":

{
  "machine_signals": {
    "user_confirms_change": "yes" | "no" | "modify" | "unclear" | null,
    "new_value_provided": "nouvelle valeur fournie par user" | null,
    "user_abandons": true | false
  }
}

Guide d'interpretation:
- user_confirms_change: "yes" si validation ("ok", "c'est bon"), "no" si refus, "modify" si autre modification
- new_value_provided: la valeur exacte fournie (ex: "3 fois", "lundi et mercredi", "le matin")
- user_abandons: true si abandon explicite
`
    return addon
  }
  
  if (activeMachine === "breakdown_action_flow") {
    let addon = `
=== SIGNAUX SPECIFIQUES (breakdown_action_flow actif) ===
Tu es dans un flow de DECOMPOSITION D'ACTION en micro-etape.
`
    if (flowContext?.breakdownTarget) {
      addon += `
CONTEXTE DU FLOW:
- Action a decomposer: "${flowContext.breakdownTarget}"
- Ce qui bloque: ${flowContext.blocker ?? "non precise"}
- Micro-etape proposee: ${flowContext.proposedStep ?? "en generation"}
`
    }
    addon += `
Analyse ces signaux en plus et AJOUTE-LES dans ta reponse JSON sous "machine_signals":

{
  "machine_signals": {
    "user_confirms_microstep": "yes" | "no" | null,
    "user_wants_different_step": true | false,
    "blocker_clarified": "description du blocage" | null,
    "user_abandons": true | false
  }
}

Guide d'interpretation:
- user_confirms_microstep: "yes" si acceptation de la micro-etape, "no" si refus
- user_wants_different_step: true si "autre chose", "trop dur", "plus simple"
- blocker_clarified: texte du blocage si l'utilisateur explique ce qui le bloque
- user_abandons: true si abandon
`
    return addon
  }
  
  if (activeMachine === "topic_serious" || activeMachine === "topic_light") {
    const topicType = activeMachine === "topic_serious" ? "SERIEUX" : "LEGER"
    let addon = `
=== SIGNAUX SPECIFIQUES (topic_exploration actif) ===
Tu es dans un flow d'EXPLORATION DE SUJET ${topicType}.
`
    if (flowContext?.topicLabel) {
      addon += `
CONTEXTE DU FLOW:
- Sujet explore: "${flowContext.topicLabel}"
- Phase: ${flowContext.topicPhase ?? "opening"}
`
    }
    addon += `
Analyse ces signaux en plus et AJOUTE-LES dans ta reponse JSON sous "machine_signals":

{
  "machine_signals": {
    "user_engagement": "HIGH" | "MEDIUM" | "LOW" | "DISENGAGED",
    "topic_satisfaction": { "detected": true | false },
    "wants_to_change_topic": true | false,
    "needs_deeper_exploration": true | false
  }
}

Guide d'interpretation:
- user_engagement: HIGH si reponses longues/enthousiastes, LOW si reponses courtes/evasives, DISENGAGED si changement de sujet
- topic_satisfaction: detected=true si "merci ca m'aide", "je comprends mieux"
- wants_to_change_topic: true si l'utilisateur introduit un autre sujet
- needs_deeper_exploration: true si emotions fortes ou sujet complexe non resolu
`
    return addon
  }
  
  if (activeMachine === "deep_reasons_exploration") {
    let addon = `
=== SIGNAUX SPECIFIQUES (deep_reasons_exploration actif) ===
Tu es dans un flow d'EXPLORATION DES RAISONS PROFONDES d'un blocage motivationnel.
`
    if (flowContext?.deepReasonsTopic) {
      addon += `
CONTEXTE DU FLOW:
- Sujet explore: "${flowContext.deepReasonsTopic}"
- Phase: ${flowContext.deepReasonsPhase ?? "re_consent"}
`
    }
    addon += `
Analyse ces signaux en plus et AJOUTE-LES dans ta reponse JSON sous "machine_signals":

{
  "machine_signals": {
    "user_opens_up": true | false,
    "resistance_detected": true | false,
    "insight_emerged": true | false,
    "wants_to_stop": true | false
  }
}

Guide d'interpretation:
- user_opens_up: true si partage personnel, emotions, vecu
- resistance_detected: true si "je sais pas", "c'est pas ca", deflection, changement de sujet
- insight_emerged: true si "ah oui", "je realise", "en fait c'est parce que"
- wants_to_stop: true si "on peut en rester la", "c'est bon", malaise explicite
`
    return addon
  }
  
  if (activeMachine === "user_profile_confirmation") {
    let addon = `
=== SIGNAUX SPECIFIQUES (user_profile_confirmation actif) ===
Tu es dans un flow de CONFIRMATION D'INFORMATION DE PROFIL.
`
    if (flowContext?.profileFactKey) {
      addon += `
CONTEXTE DU FLOW:
- Information a confirmer: ${flowContext.profileFactKey}
- Valeur proposee: ${flowContext.profileFactValue ?? "a determiner"}
`
    }
    addon += `
Analyse ces signaux en plus et AJOUTE-LES dans ta reponse JSON sous "machine_signals":

{
  "machine_signals": {
    "user_confirms_fact": "yes" | "no" | "nuance" | null,
    "user_provides_correction": "correction fournie" | null,
    "fact_type_detected": "work_schedule" | "energy_peaks" | "tone" | "verbosity" | "emojis" | "wake_time" | "sleep_time" | "job" | "hobbies" | "family" | null
  }
}

Guide d'interpretation:
- user_confirms_fact: "yes" si confirmation, "no" si refus, "nuance" si "oui mais..."
- user_provides_correction: valeur corrigee si l'utilisateur rectifie
- fact_type_detected: type de fait personnel detecte dans le message
`
    return addon
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
    "user_consents_defer": true | false
  }
}

Guide d'interpretation:
- breakdown_recommended: true si missed_streak >= 5 ET blocage PRATIQUE (oubli, temps, organisation, "trop dur")
- deep_reasons_opportunity: true si blocage MOTIVATIONNEL (pas envie, peur, sens, flemme, "je sais pas pourquoi")
- create_action_intent: true si l'utilisateur veut creer une NOUVELLE action (pas modifier l'actuelle)
- update_action_intent: true si l'utilisateur veut modifier une action EXISTANTE (frequence, jours, horaire)
- user_consents_defer: true si l'utilisateur dit "oui" a une proposition de faire quelque chose apres le bilan
  ("oui on fait ca apres", "ok apres le bilan", "oui je veux qu'on en parle", etc.)

DISTINCTION CRITIQUE (breakdown vs deep_reasons):
- breakdown = blocage PRATIQUE: "j'oublie", "pas le temps", "trop fatigue le soir" -> micro-etape
- deep_reasons = blocage MOTIVATIONNEL: "j'ai pas envie", "je sais pas pourquoi", "ca me saoule" -> exploration profonde
`
    return addon
  }
  
  return ""
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
   - "PLAN" (veut travailler sur son plan/actions)
   - "EMOTIONAL_SUPPORT" (veut parler émotions sans danger)
   - "SMALL_TALK" (bavardage, "salut", "ça va")
   - "PREFERENCE" (veut changer style/ton/emoji/préférences)
   - "BREAKDOWN" (demande de découper une action, micro-étapes)
   - "UNKNOWN"

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
   CRITÈRES:
   - "NEED_SUPPORT": L'utilisateur exprime un besoin de soutien émotionnel, de la vulnérabilité, de l'anxiété, du mal-être (sans danger vital). Détresse modérée.
   - "SERIOUS": Sujet profond qui touche la psyché — problèmes personnels, peurs, blocages, patterns de comportement, relations difficiles, introspection. PAS de détresse aiguë.
   - "LIGHT": Sujet léger — bavardage, anecdotes du quotidien, humour, discussions sans enjeu émotionnel profond.
   - "NONE": Aucun des cas ci-dessus (ou le message concerne le plan/bilan/préférences).

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
      "CHECKUP", "PLAN", "EMOTIONAL_SUPPORT", "SMALL_TALK", "PREFERENCE", "BREAKDOWN", "UNKNOWN"
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
      topic_depth: { value: topicDepthValue, confidence: topicDepthConf },
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
    "safety": { "level": "NONE|FIREFIGHTER|SENTRY", "confidence": 0.0-1.0 },
    "user_intent_primary": "CHECKUP|PLAN|EMOTIONAL_SUPPORT|SMALL_TALK|PREFERENCE|BREAKDOWN|UNKNOWN",
    "user_intent_confidence": 0.0-1.0,
    "interrupt": { "kind": "NONE|EXPLICIT_STOP|BORED|SWITCH_TOPIC|DIGRESSION", "confidence": 0.0-1.0 },
    "flow_resolution": { "kind": "NONE|ACK_DONE|WANTS_RESUME|DECLINES_RESUME|WANTS_PAUSE", "confidence": 0.0-1.0 },
    "topic_depth": { "value": "NONE|NEED_SUPPORT|SERIOUS|LIGHT", "confidence": 0.0-1.0 },
    "deep_reasons": { "opportunity": bool, "action_mentioned": bool, "action_hint": string|null, "confidence": 0.0-1.0 },
    "needs_explanation": { "value": bool, "confidence": 0.0-1.0 },
    "user_engagement": { "level": "HIGH|MEDIUM|LOW|DISENGAGED", "confidence": 0.0-1.0 },
    "topic_satisfaction": { "detected": bool, "confidence": 0.0-1.0 },
    "create_action": { "intent_strength": "explicit|implicit|exploration|none", "sophia_suggested": bool, "user_response": "yes|no|modify|unclear|none", "action_type_hint": "habit|mission|framework|unknown", "confidence": 0.0-1.0 },
    "update_action": { "detected": bool, "target_hint": string|null, "change_type": "frequency|days|time|title|mixed|unknown", "user_response": "yes|no|modify|unclear|none", "confidence": 0.0-1.0 },
    "breakdown_action": { "detected": bool, "target_hint": string|null, "blocker_hint": string|null, "user_response": "yes|no|unclear|none", "confidence": 0.0-1.0 },
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
      "CHECKUP", "PLAN", "EMOTIONAL_SUPPORT", "SMALL_TALK", "PREFERENCE", "BREAKDOWN", "UNKNOWN"
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
        topic_depth: { value: topicDepthValue, confidence: topicDepthConf },
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
        wants_tools: wantsTools,
        risk_score: riskScore,
      },
      new_signals: newSignals,
      enrichments,
      machine_signals: machineSignals,
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

// ═══════════════════════════════════════════════════════════════════════════════
// DISPATCHER V1 (LEGACY) — kept for backward compatibility
// ═══════════════════════════════════════════════════════════════════════════════

export async function analyzeIntentAndRisk(
  message: string,
  currentState: any,
  lastAssistantMessage: string,
  meta?: { requestId?: string; forceRealAi?: boolean; model?: string },
): Promise<{ targetMode: AgentMode; riskScore: number; nCandidates: 1 | 3 }> {
  // Multi-candidate is expensive (extra LLM calls). We only enable it for truly complex inputs.
  // This is an enforced heuristic (not left to the model), to keep WhatsApp latency stable.
  function isVeryComplexMessage(m: string): boolean {
    const s = (m ?? "").toString().trim();
    if (!s) return false;
    const len = s.length;
    const q = (s.match(/\?/g) ?? []).length;
    const lines = s.split("\n").filter((x) => x.trim()).length;
    const hasList = /(^|\n)\s*([-*]|\d+\.)\s+\S/.test(s);
    const askedForDeep = /\b(en\s+d[ée]tail|d[ée]taille|guide|pas[- ]?à[- ]?pas|analyse|nuance|compar(?:e|aison)|avantages|inconv[ée]nients)\b/i.test(s);
    // Strict thresholds:
    // - long message OR multiple questions OR multi-line/list content OR explicit request for deep explanation.
    return len >= 260 || q >= 2 || lines >= 4 || hasList || askedForDeep;
  }

  function looksLikeCheckupIntent(m: string, lastAssistant: string): boolean {
    const s = (m ?? "").toString();
    const last = (lastAssistant ?? "").toString();
    // Explicit bilan/checkup keywords
    if (/\b(bilan|checkup|check)\b/i.test(s)) return true;
    // If the assistant explicitly asked to do a checkup/bilan, "oui" can be a checkup confirmation.
    if (/\b(bilan|checkup|check)\b/i.test(last) && /\b(oui|ok|d['’]accord)\b/i.test(s)) return true;
    return false;
  }

  function looksLikeBreakdownIntent(m: string): boolean {
    const s = (m ?? "").toString().toLowerCase()
    if (!s.trim()) return false
    return /\b(micro[-\s]?etape|d[ée]compos|d[ée]coup|d[ée]taill|petit\s+pas|[ée]tape\s+minuscule|je\s+bloqu|j['’]y\s+arrive\s+pas|trop\s+dur|insurmontable)\b/i
      .test(s)
  }

  // User preference confirmation intents should always route to Companion (unless safety overrides).
  // This prevents the dispatcher from sending "plan" preference messages to Architect.
  function looksLikePreferenceChangeIntent(m: string): boolean {
    const s = (m ?? "").toString().toLowerCase().trim()
    if (!s) return false
    // Direct/soft tone
    if (/\b(plus\s+direct|plut[oô]t\s+direct|sois\s+direct|ton\s+direct|direct\s+(?:avec|stp|s'il\s+te\s+pla[iî]t)|plut[oô]t\s+doux|plus\s+doux)\b/i.test(s)) return true
    // Short/detailed verbosity
    if (/\b(r[ée]ponses?\s+(?:plus\s+)?courtes?|r[ée]ponses?\s+courtes|fais\s+court|fais\s+des\s+r[ée]ponses?\s+courtes|r[ée]ponses?\s+br[èe]ves?|plus\s+concis|plus\s+succinct|moins\s+long|moins\s+d[ée]taill[ée])\b/i.test(s)) return true
    // Emojis preference
    if (/\b(emoji|emojis|smiley|smileys)\b/i.test(s)) return true
    // Plan push preference (wording varies; keep broad but still "preference-y")
    if (/\b(ne\s+me\s+ram[eè]ne\s+pas|arr[êe]te\s+de\s+me\s+ramener|[ée]vite\s+de\s+me\s+ramener)\b[\s\S]{0,40}\b(plan|objectifs?|actions?)\b/i.test(s)) return true
    // Explicit confirmation framing
    if (/\b(on\s+confirme|tu\s+peux\s+confirmer|je\s+valide|je\s+veux\s+valider)\b/i.test(s)) return true
    return false
  }

  // Deterministic test mode: avoid LLM dependency and avoid writing invalid risk levels.
  const mega =
    (((globalThis as any)?.Deno?.env?.get?.("MEGA_TEST_MODE") ?? "") as string).trim() === "1" &&
    !meta?.forceRealAi
  if (mega) {
    const m = (message ?? "").toString().toLowerCase()
    // If an investigation is already active, ALWAYS keep investigator unless explicit stop.
    const hasStop = /\b(stop|arr[êe]te|on arr[êe]te|pause)\b/i.test(message ?? "")
    if (currentState?.investigation_state && !hasStop) return { targetMode: "investigator", riskScore: 0, nCandidates: 1 }
    // Trigger investigator on common checkup intents.
    if (/\b(check|checkup|bilan)\b/i.test(m)) return { targetMode: "investigator", riskScore: 0, nCandidates: 1 }
    return { targetMode: "companion", riskScore: 0, nCandidates: 1 }
  }

  const basePrompt = `
    Tu es le "Chef de Gare" (Dispatcher) du système Sophia.
    Ton rôle est d'analyser le message de l'utilisateur pour décider QUEL AGENT doit répondre.
    
    DERNIER MESSAGE DE L'ASSISTANT (Contexte) :
    "${lastAssistantMessage.substring(0, 200)}..."
    
    LES AGENTS DISPONIBLES :
    1. sentry (DANGER VITAL) : Suicide, automutilation, violence immédiate. PRIORITÉ ABSOLUE.
    2. firefighter (URGENCE ÉMOTIONNELLE) : Panique, angoisse, craving fort, pleurs.
    3. investigator (DATA & BILAN) : L'utilisateur veut faire son bilan ("Check du soir", "Bilan") OU répond à un prompt de bilan/check.
       IMPORTANT: hors bilan, ne déclenche PAS investigator juste parce que l'utilisateur parle d'une action ("j'ai fait / pas fait").
       Dans ce cas, route plutôt companion (par défaut) ou architect si on doit ajuster le plan.
    4. architect (DEEP WORK & AIDE MODULE) : L'utilisateur parle de ses Valeurs, Vision, Identité, ou demande de l'aide pour un exercice. C'est AUSSI lui qui gère la création/modification du plan.
    5. librarian (EXPLICATION LONGUE) : L'utilisateur demande explicitement une explication détaillée, un mécanisme ("comment ça marche"), une réponse longue structurée, ou un guide pas-à-pas.
       Exemples: "Explique-moi en détail", "Tu peux développer ?", "Décris le mécanisme", "Fais-moi un guide complet".
    6. assistant (TECHNIQUE PUR) : BUGS DE L'APPLICATION (Crash, écran blanc, login impossible). ATTENTION : Si l'utilisateur dit "Tu n'as pas créé l'action" ou "Je ne vois pas le changement", C'EST ENCORE DU RESSORT DE L'ARCHITECTE. Ne passe à 'assistant' que si l'app est cassée techniquement.
    7. companion (DÉFAUT) : Tout le reste. Discussion, "Salut", "Ça va", partage de journée.
    
    ÉTAT ACTUEL :
    Mode en cours : "${currentState.current_mode}"
    Checkup en cours : ${currentState.investigation_state ? "OUI" : "NON"}
    Risque précédent : ${currentState.risk_level}
    
    RÈGLE DE STABILITÉ (CRITIQUE) :
    1. Si un CHECKUP est en cours (investigation_state = OUI) :
       - RESTE sur 'investigator' si l'utilisateur répond à la question, même s'il râle, se plaint du budget ou fait une remarque.
       - L'investigateur doit finir son travail.
       - Ne change de mode que si l'utilisateur demande EXPLICITEMENT d'arrêter ("Stop", "Je veux parler d'autre chose").

    STABILITÉ CHECKUP (RENFORCÉE) :
    - Si \`investigation_state\` est actif (bilan en cours), tu renvoies \`investigator\` dans 100% des cas.
    - SEULE EXCEPTION: l’utilisateur demande explicitement d’arrêter le bilan / changer de sujet (ex: "stop le bilan", "arrête le check", "on arrête", "on change de sujet").
    - "plus tard", "pas maintenant", "on en reparlera" NE sont PAS des stops.

    POST-BILAN (PARKING LOT) :
    RÈGLE "BESOIN DE DÉCOUPER" (HORS BILAN) :
    - Si l'utilisateur exprime qu'il est bloqué sur une action / n'arrive pas à démarrer / que c'est trop dur
      (ex: "je bloque", "j'y arrive pas", "c'est trop dur", "ça me demande trop d'effort", "insurmontable", "je repousse"),
      OU s'il demande une version plus simple (ex: "un petit pas", "une étape minuscule", "encore plus simple"),
      OU s'il demande explicitement de "découper / décomposer / micro-étape" une action,
      ALORS route vers ARCHITECT (outil break_down_action) plutôt que companion.
      Cela ne doit PAS être traité comme un bilan.

    - Si \`investigation_state.status = post_checkup\`, le bilan est terminé.
    - Tu ne dois JAMAIS proposer de "continuer/reprendre le bilan".
    - Tu dois router vers l’agent adapté au sujet reporté (companion par défaut, architect si organisation/planning/priorités, firefighter si détresse).
    
    2. Si le mode en cours est 'architect' :
       - RESTE en 'architect' sauf si c'est une URGENCE VITALE (Sentry).
       - Même si l'utilisateur râle ("ça marche pas", "je ne vois rien"), l'Architecte est le mieux placé pour réessayer. L'assistant technique ne sert à rien pour le contenu du plan.
    
    MULTI-CANDIDATE (QUALITÉ PREMIUM) :
    - Tu peux demander 3 candidates (nCandidates=3) UNIQUEMENT pour: companion, architect, librarian.
    - RÈGLE DURCIE: nCandidates=3 UNIQUEMENT si le message est VRAIMENT complexe (très long, plusieurs questions, multi-sujets, ou demande explicite d'analyse/guide).
    - Sinon nCandidates=1 (par défaut) pour limiter la latence.

    SORTIE JSON ATTENDUE :
    {
      "targetMode": "le_nom_du_mode",
      "riskScore": (0 = calme, 10 = danger vital),
      "nCandidates": 1 ou 3
    }
  `

  try {
    const response = await generateWithGemini(basePrompt, message, 0.0, true, [], "auto", {
      requestId: meta?.requestId,
      model: meta?.model ?? "gemini-2.5-flash",
      source: "sophia-brain:dispatcher",
    })
    const obj = JSON.parse(response as string) as any
    // IMPORTANT: dispatcher must never return internal worker modes (watcher/dispatcher).
    const allowed: AgentMode[] = ["sentry", "firefighter", "investigator", "architect", "librarian", "assistant", "companion"]
    const rawMode = String(obj?.targetMode ?? "").trim() as AgentMode
    let targetMode = (allowed as string[]).includes(rawMode) ? rawMode : "companion"
    const riskScore = Math.max(0, Math.min(10, Number(obj?.riskScore ?? 0) || 0))
    const rawN = Number(obj?.nCandidates ?? 1)
    const candidateAllowed = targetMode === "companion" || targetMode === "architect" || targetMode === "librarian"
    const wantsMulti = candidateAllowed && rawN === 3
    const nCandidates = (wantsMulti && isVeryComplexMessage(message)) ? 3 : 1

    // HARD GUARD: if we're already in architect mode, keep architect unless there is acute distress (firefighter/sentry).
    // This prevents mid-flow bouncing to companion which causes tool/consent loops.
    //
    // EXCEPTION: preference confirmations MUST route to companion, even if the current mode is architect.
    // Otherwise user_profile_confirm gets stuck (common when the preference mentions "plan").
    if (currentState?.current_mode === "architect" && !looksLikePreferenceChangeIntent(message)) {
      const acute = looksLikeAcuteDistress(message)
      const wantsCheckup = looksLikeCheckupIntent(message, lastAssistantMessage)
      // Checkup intent should override "stay in architect" stability.
      if (!acute && !wantsCheckup && targetMode !== "architect") {
        targetMode = "architect"
      }
    }

    // HARD FORCE: explicit checkup intent always routes to investigator (unless user asked to stop a checkup).
    // This is critical for eval scenarios (and for real UX) where "on fait le bilan" must not be ignored.
    if (!currentState?.investigation_state && looksLikeCheckupIntent(message, lastAssistantMessage)) {
      targetMode = "investigator"
    }

    // HARD FORCE: preference change / confirmation is Companion work (unless investigator/safety).
    if (
      targetMode !== "sentry" &&
      targetMode !== "firefighter" &&
      targetMode !== "investigator" &&
      looksLikePreferenceChangeIntent(message)
    ) {
      targetMode = "companion"
    }

    // HARD GUARD: investigator is ONLY for active checkups or explicit checkup intent.
    // This prevents "investigator" from hijacking normal WhatsApp onboarding / small-talk.
    if (
      targetMode === "investigator" &&
      !currentState?.investigation_state &&
      !looksLikeCheckupIntent(message, lastAssistantMessage)
    ) {
      targetMode = "companion"
    }

    // If the user clearly asks for a micro-step breakdown and there is no acute distress,
    // do not route to firefighter just because the message is emotional.
    if (!looksLikeAcuteDistress(message) && looksLikeBreakdownIntent(message) && targetMode === "firefighter") {
      targetMode = "architect"
    }
    return { targetMode, riskScore, nCandidates }
  } catch (e) {
    console.error("Erreur Dispatcher Gemini:", e)
    // Fallback de sécurité
    return { targetMode: "companion", riskScore: 0, nCandidates: 1 }
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


