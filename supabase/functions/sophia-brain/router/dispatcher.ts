import type { AgentMode } from "../state-manager.ts";
import { generateWithGemini } from "../../_shared/gemini.ts";
import {
  normalizePendingResolutionSignal,
  type PendingResolutionSignal,
  type PendingResolutionType,
} from "./pending_resolution.ts";

// ═══════════════════════════════════════════════════════════════════════════════
// DISPATCHER V2: STRUCTURED SIGNALS
// Goal: IA interprets the turn → produces signals → Supervisor applies deterministic policy
// ═══════════════════════════════════════════════════════════════════════════════

export type SafetyLevel = "NONE" | "FIREFIGHTER" | "SENTRY";
export type UserIntentPrimary =
  | "CHECKUP"
  | "SMALL_TALK"
  | "PREFERENCE"
  | "UNKNOWN";
export type InterruptKind =
  | "NONE"
  | "EXPLICIT_STOP"
  | "BORED"
  | "SWITCH_TOPIC"
  | "DIGRESSION";
export type FlowResolutionKind =
  | "NONE"
  | "ACK_DONE"
  | "WANTS_RESUME"
  | "DECLINES_RESUME"
  | "WANTS_PAUSE";
export type TopicDepth = "NONE" | "NEED_SUPPORT" | "SERIOUS" | "LIGHT";
export type UserEngagementLevel = "HIGH" | "MEDIUM" | "LOW" | "DISENGAGED";

export interface DispatcherSignals {
  safety: {
    level: SafetyLevel;
    confidence: number; // 0..1
    immediacy?: "acute" | "non_acute" | "unknown";
  };
  user_intent_primary: UserIntentPrimary;
  user_intent_confidence: number; // 0..1
  interrupt: {
    kind: InterruptKind;
    confidence: number; // 0..1
    /** If DIGRESSION or SWITCH_TOPIC, the formalized topic to defer (e.g., "la situation avec ton boss") */
    deferred_topic_formalized?: string | null;
  };
  flow_resolution: {
    kind: FlowResolutionKind;
    confidence: number; // 0..1
  };
  // Transverse overlays and action intent signals.
  // They are consumed by routing/add-ons (dashboard redirect, research, explanation, tracking).
  topic_depth: {
    value: TopicDepth;
    confidence: number;
    plan_focus?: boolean;
  };
  deep_reasons: {
    opportunity: boolean;
    action_mentioned: boolean;
    action_hint?: string;
    deferred_ready: boolean;
    in_bilan_context: boolean;
    confidence: number;
  };
  needs_explanation: {
    value: boolean;
    confidence: number;
    reason?: string;
  };
  needs_research: {
    value: boolean;
    confidence: number;
    query?: string;
    domain_hint?: string;
  };
  user_engagement: {
    level: UserEngagementLevel;
    confidence: number;
  };
  topic_satisfaction: {
    detected: boolean;
    confidence: number;
  };
  create_action: {
    intent_strength: "explicit" | "implicit" | "exploration" | "none";
    sophia_suggested: boolean;
    user_response: "yes" | "no" | "modify" | "unclear" | "none";
    modification_info: "available" | "missing" | "none";
    action_type_hint: "habit" | "mission" | "framework" | "unknown";
    action_label_hint?: string;
    confidence: number;
  };
  update_action: {
    detected: boolean;
    target_hint?: string;
    change_type: "frequency" | "days" | "time" | "title" | "mixed" | "unknown";
    new_value_hint?: string;
    user_response: "yes" | "no" | "modify" | "unclear" | "none";
    confidence: number;
  };
  breakdown_action: {
    detected: boolean;
    target_hint?: string;
    blocker_hint?: string;
    sophia_suggested: boolean;
    user_response: "yes" | "no" | "unclear" | "none";
    confidence: number;
  };
  track_progress: {
    detected: boolean;
    target_hint?: string;
    status_hint: "completed" | "missed" | "partial" | "unknown";
    value_hint?: number;
    confidence: number;
  };
  activate_action: {
    detected: boolean;
    target_hint?: string;
    exercise_type_hint?: string;
    confidence: number;
  };
  delete_action: {
    detected: boolean;
    target_hint?: string;
    reason_hint?: string;
    confidence: number;
  };
  deactivate_action: {
    detected: boolean;
    target_hint?: string;
    confidence: number;
  };
  dashboard_preferences_intent: {
    detected: boolean;
    /**
     * Preference keys user wants to change in dashboard settings.
     * Canonical keys expected by product:
     * language, tone, response_length, emoji_level, voice_style,
     * proactivity_level, timezone, daily_summary_time, coach_intensity
     */
    preference_keys?: string[];
    confidence: number;
  };
  dashboard_recurring_reminder_intent: {
    detected: boolean;
    /**
     * Reminder configuration hints to prepare dashboard redirect:
     * mode, days, time, timezone, channel, start_date, end_date, pause, message
     */
    reminder_fields?: string[];
    confidence: number;
  };
  /**
   * Safety resolution signals (for active safety flows):
   * - user_confirms_safe: user explicitly confirms they are safe
   * - stabilizing_signal: user shows signs of calming ("ça va mieux", "merci", etc.)
   * - symptoms_still_present: user still mentions physical/emotional symptoms
   * - external_help_mentioned: user mentions contacting help (SAMU, ami, médecin)
   * - escalate_to_sentry: situation became life-threatening (firefighter → sentry)
   */
  safety_resolution: {
    user_confirms_safe: boolean;
    stabilizing_signal: boolean;
    symptoms_still_present: boolean;
    external_help_mentioned: boolean;
    escalate_to_sentry: boolean;
    confidence: number; // 0..1
  };
  safety_stabilization: {
    stabilizing_turn: boolean;
    confidence: number; // 0..1
  };
  // deferred_signal: REMOVED (R2 simplification - deferred topics system disabled)
  // consent_to_relaunch: REMOVED (R2 simplification - relaunch consent system disabled)
  wants_tools: boolean;
  risk_score: number; // 0..10 (compatibility)
}

// ═══════════════════════════════════════════════════════════════════════════════
// SIGNAL HISTORY: Contextual Dispatcher with deduplication
// ═══════════════════════════════════════════════════════════════════════════════

export type SignalHistoryStatus =
  | "pending"
  | "in_machine"
  | "deferred"
  | "resolved";

/**
 * A signal that was detected in a previous turn.
 * Used to prevent duplication and allow brief enrichment.
 */
export interface SignalHistoryEntry {
  /** Signal type (e.g., "breakdown_intent", "create_action_intent") */
  signal_type: string;
  /** Turn index relative to current (0 = current, -1 = previous, etc.) */
  turn_index: number;
  /** Brief description of the signal context (max 100 chars) */
  brief: string;
  /** Current status of this signal */
  status: SignalHistoryStatus;
  /** For tool signals: the specific action target (e.g., "sport", "lecture") */
  action_target?: string;
  /** ISO timestamp when the signal was first detected */
  detected_at: string;
}

/**
 * Enhanced dispatcher input with context and history.
 */
export interface DispatcherInputV2 {
  /** Current user message */
  userMessage: string;
  /** Last assistant message (for context) */
  lastAssistantMessage: string;
  /** Last 10 messages (5 turns) for contextual understanding */
  last5Messages: Array<{ role: string; content: string }>;
  /** Signals from last 5 turns (for deduplication) */
  signalHistory: SignalHistoryEntry[];
  /** Currently active state machine (null if none) */
  activeMachine: string | null;
  /** State snapshot (existing fields) */
  stateSnapshot: {
    current_mode?: string;
    investigation_active?: boolean;
    investigation_status?: string;
    toolflow_active?: boolean;
    toolflow_kind?: string;
    plan_confirm_pending?: boolean;
    topic_exploration_phase?: string;
    topic_exploration_type?: string;
    risk_level?: number;
  };
  /** Flow context for enriching machine-specific prompts */
  flowContext?: FlowContext;
}

/**
 * New signal detected on the current turn.
 */
export interface NewSignalEntry {
  /** Signal type (mother signal identifier) */
  signal_type: string;
  /** Brief description for deferred topic (max 100 chars) */
  brief: string;
  /** Detection confidence (0..1) */
  confidence: number;
  /** For tool signals: the specific action target */
  action_target?: string;
}

/**
 * Enrichment for an existing signal (update brief with new context).
 */
export interface SignalEnrichment {
  /** Signal type to update */
  existing_signal_type: string;
  /** Updated brief with new context */
  updated_brief: string;
}

/**
 * Machine-specific signals (varies by active machine).
 */
export interface MachineSignals {
  // create_action_flow
  user_confirms_preview?: "yes" | "no" | "modify" | "unclear" | null;
  action_type_clarified?: "habit" | "mission" | "framework" | null;
  user_abandons?: boolean;
  modification_requested?: string | null;

  // update_action_flow
  user_confirms_change?: "yes" | "no" | "modify" | "unclear" | null;
  new_value_provided?: string | null;

  // breakdown_action_flow
  user_confirms_microstep?: "yes" | "no" | null;
  user_wants_different_step?: boolean;
  blocker_clarified?: string | null;

  // topic_exploration
  user_engagement?: "HIGH" | "MEDIUM" | "LOW" | "DISENGAGED";
  topic_satisfaction?: { detected: boolean };
  wants_to_change_topic?: boolean;
  needs_deeper_exploration?: boolean;

  // deep_reasons_exploration
  user_opens_up?: boolean;
  resistance_detected?: boolean;
  insight_emerged?: boolean;
  wants_to_stop?: boolean;

  // activate_action_flow
  user_confirms_activation?: boolean | null;
  user_wants_different_action?: string | null;
  activation_ready?: boolean;

  // delete_action_flow
  user_confirms_deletion?: boolean | null;
  deletion_ready?: boolean;

  // deactivate_action_flow
  user_confirms_deactivation?: boolean | null;
  deactivation_ready?: boolean;

  // bilan/investigation (signals for post-bilan processing)
  breakdown_recommended?: boolean;
  deep_reasons_opportunity?: boolean;
  create_action_intent?: boolean;
  update_action_intent?: boolean;
  activate_action_intent?: boolean;
  delete_action_intent?: boolean;
  deactivate_action_intent?: boolean;
  user_consents_defer?: boolean;

  // bilan/investigation (confirmation signals for deferred machines)
  // These capture user's response to "tu veux qu'on en parle après le bilan ?"
  confirm_deep_reasons?: boolean | null; // User confirms/declines deep reasons exploration after bilan
  confirm_breakdown?: boolean | null; // User confirms/declines micro-step breakdown after bilan
  confirm_topic?: boolean | null; // User confirms/declines topic exploration after bilan
  confirm_increase_target?: boolean | null; // User confirms/declines increasing weekly habit target
  confirm_delete_action?: boolean | null; // User confirms/declines deleting an action after bilan
  confirm_deactivate_action?: boolean | null; // User confirms/declines deactivating an action after bilan

  // Checkup flow signals
  checkup_intent?: {
    detected: boolean;
    confidence: number;
    trigger_phrase?: string;
  };
  wants_to_checkup?: boolean; // User response to "tu veux faire le bilan?"
  track_from_bilan_done_ok?: boolean; // User wants track_progress when bilan already done

  // Generic pending intent resolution (hybrid model: common wrapper + typed decisions)
  pending_resolution?: PendingResolutionSignal;
}

/**
 * Enhanced dispatcher output with new signals and enrichments.
 */
export interface DispatcherOutputV2 {
  /** Existing signals (backward compatible) */
  signals: DispatcherSignals;
  /** NEW: Signals detected on last turn only (not already in history) */
  new_signals: NewSignalEntry[];
  /** NEW: Enrichments for existing signals in history */
  enrichments: SignalEnrichment[];
  /** NEW: Machine-specific signals (only present if a machine is active) */
  machine_signals?: MachineSignals;
  /** NEW: Enrichment for an existing deferred topic (instead of creating new signal) */
  deferred_enrichment?: {
    topic_id: string;
    new_brief: string;
  };
  /** Model used for dispatch analysis */
  model_used?: string;
}

export const DEFAULT_SIGNALS: DispatcherSignals = {
  safety: { level: "NONE", confidence: 0.9 },
  user_intent_primary: "UNKNOWN",
  user_intent_confidence: 0.5,
  interrupt: { kind: "NONE", confidence: 0.9 },
  flow_resolution: { kind: "NONE", confidence: 0.9 },
  topic_depth: { value: "NONE", confidence: 0.9, plan_focus: false },
  deep_reasons: {
    opportunity: false,
    action_mentioned: false,
    deferred_ready: false,
    in_bilan_context: false,
    confidence: 0.9,
  },
  needs_explanation: { value: false, confidence: 0.9 },
  needs_research: { value: false, confidence: 0.9 },
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
  delete_action: {
    detected: false,
    confidence: 0.5,
  },
  deactivate_action: {
    detected: false,
    confidence: 0.5,
  },
  dashboard_preferences_intent: {
    detected: false,
    confidence: 0.5,
  },
  dashboard_recurring_reminder_intent: {
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
  safety_stabilization: {
    stabilizing_turn: false,
    confidence: 0.5,
  },
  wants_tools: false,
  risk_score: 0,
};

// ═══════════════════════════════════════════════════════════════════════════════
// CONTEXTUAL DISPATCHER: Dynamic prompt building
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Mother signals - always analyzed regardless of active machine.
 * We keep these signals broad and orthogonal:
 * - routing/safety
 * - coaching overlays
 * - action tracking and dashboard redirection intents
 */
const MOTHER_SIGNALS_SECTION = `
=== SIGNAUX MÈRES (OBLIGATOIRES) ===
Tu détectes TOUJOURS:
- safety (NONE / FIREFIGHTER / SENTRY)
- user_intent_primary (CHECKUP / SMALL_TALK / PREFERENCE / UNKNOWN)
- interrupt (NONE / EXPLICIT_STOP / BORED / SWITCH_TOPIC / DIGRESSION)
- track_progress (si l'utilisateur dit avoir fait / raté une action)
- needs_explanation (si l'utilisateur demande d'expliquer / clarifier)
- needs_research (si question factuelle fraîche / web)
- CRUD action intents (create/update/breakdown/activate/delete/deactivate) pour redirection dashboard
- dashboard_preferences_intent (si user veut modifier les préférences UX/UI Sophia)
- dashboard_recurring_reminder_intent (si user veut régler ses rappels récurrents)
- user_engagement (HIGH / MEDIUM / LOW / DISENGAGED)
- risk_score (0-10)
- safety_resolution (uniquement si safety != NONE)

IMPORTANT:
- Les signaux CRUD servent à COMPRENDRE l'intention et déclencher une redirection dashboard.
- Les 2 signaux dashboard_*_intent servent à orienter vers les bons écrans réglages dashboard.
- Tu ne décides jamais d'exécution d'outil ici.
`;

const TRACK_AND_DASHBOARD_SIGNALS_SECTION = `
=== DÉTECTION TRACK_PROGRESS + CRUD (REDIRECTION DASHBOARD) ===
1) track_progress
- Détecte quand le user dit qu'une action/habitude a été faite, ratée, partielle.
- Renseigne: target_hint, status_hint, value_hint, confidence.
- Exemples:
  * "j'ai fait ma méditation" -> completed
  * "j'ai raté le sport" -> missed
  * "j'ai fait à moitié" -> partial

2) CRUD intents (pour redirection dashboard, pas exécution)
- create_action: le user veut créer/ajouter une nouvelle action
- update_action: modifier fréquence/jours/heure/titre
- breakdown_action: découper une action en micro-étape
- activate_action / deactivate_action / delete_action

Exemples:
- "je veux changer les jours de mon sport" -> update_action.detected=true
- "supprime cette action" -> delete_action.detected=true
- "active l'exercice respiration" -> activate_action.detected=true
- "je veux ajouter une nouvelle habitude" -> create_action.intent_strength=explicit

3) dashboard_preferences_intent (redirection réglages UX/UI)
- Détecte quand le user veut changer ses préférences produit (pas une action du plan).
- Renseigne "preference_keys" avec les clés canoniques détectées parmi:
  * language: fr | en
  * tone: friendly | neutral | direct
  * response_length: short | medium | long
  * emoji_level: none | low | medium | high
  * voice_style: coach | companion | concise
  * proactivity_level: low | medium | high
  * timezone: ex "Europe/Paris"
  * daily_summary_time: ex "20:00"
  * coach_intensity: gentle | balanced | challenge
- Exemples:
  * "parle plus court" -> response_length
  * "mets moins d'emojis" -> emoji_level
  * "je veux un ton plus direct" -> tone

4) dashboard_recurring_reminder_intent (redirection rappels récurrents)
- Détecte quand le user veut configurer/éditer des rappels planifiés.
- Renseigne "reminder_fields" avec les infos à paramétrer si présentes:
  * mode (daily|weekly|custom), days, time, timezone,
    channel (app|whatsapp), start_date, end_date, pause, message
- Exemples:
  * "rappelle-moi tous les lundis à 8h" -> mode+days+time
  * "pause mes rappels cette semaine" -> pause
  * "mets le rappel sur WhatsApp" -> channel
`;

const LAST_MESSAGE_PROTOCOL_SECTION = `
=== PROTOCOLE DERNIER MESSAGE (CRITIQUE) ===
- Le FLAG doit toujours refléter le DERNIER message utilisateur.
- Les 4-5 messages précédents servent UNIQUEMENT de contexte de désambiguïsation.
- Exemple: "oui" seul -> utilise le contexte récent pour savoir à quoi le "oui" répond.
- N'invente pas de signaux depuis un ancien message si le dernier message ne les confirme pas.
`;

/**
 * Flow resolution detection - detect user's intent to resume, pause, or finish a topic.
 */
const FLOW_RESOLUTION_SECTION = `
=== DETECTION FLOW_RESOLUTION ===
Detecte si l'utilisateur veut REPRENDRE, PAUSER ou TERMINER un sujet.

VALEURS POSSIBLES:
- "WANTS_RESUME": L'utilisateur veut REPRENDRE un sujet defere ou mis de cote
  * "je veux en parler maintenant", "non mais je veux en parler", "bah je veux !"
  * "on peut en parler ?", "j'aimerais qu'on en discute", "revenons-y"
  * "non je veux" (= pas un refus, c'est une demande de reprendre!)
- "DECLINES_RESUME": L'utilisateur REFUSE de reprendre un sujet propose
  * "non", "plus tard", "pas maintenant", "on verra"
- "ACK_DONE": L'utilisateur confirme avoir TERMINE quelque chose
  * "c'est fait", "j'ai fini", "ok c'est bon"
- "WANTS_PAUSE": L'utilisateur veut faire une PAUSE
  * "pause", "on fait une pause", "je reviens"
- "NONE": Aucun des cas ci-dessus

REGLE CRITIQUE - ATTENTION AU "NON" SUIVI DE "JE VEUX":
- "non" seul = DECLINES_RESUME
- "non je veux en parler" = WANTS_RESUME (l'utilisateur VEUT discuter!)
- "bah je veux" = WANTS_RESUME
- "mais si" = WANTS_RESUME

SORTIE JSON:
{
  "flow_resolution": { "kind": "NONE|ACK_DONE|WANTS_RESUME|DECLINES_RESUME|WANTS_PAUSE", "confidence": 0.0-1.0 }
}
`;

/**
 * Interrupt detection - user explicitly wants to stop/pause the current flow or change topic.
 * Used by the router for hard-guard interruptions (notably active checkup/bilan).
 */
const INTERRUPT_SECTION = `
=== DETECTION INTERRUPT ===
But: detecter si l'utilisateur veut ARRETER net / FAIRE UNE PAUSE / CHANGER DE SUJET.

VALEURS POSSIBLES:
- "EXPLICIT_STOP": l'utilisateur demande explicitement d'arreter / stop / "on s'arrete la"
  Exemples: "arrête", "stop", "on arrête", "on s'arrête là", "je veux arrêter"
  ⚠️ IMPORTANT (bilan/checkup): si un bilan est ACTIF, considerer aussi comme EXPLICIT_STOP
  les demandes de REPORT explicites du bilan, ex:
  - "je veux le faire plus tard"
  - "je veux le faire ce soir"
  - "je veux le faire demain"
  - "on fera ça ce soir/demain", "on le fait plus tard"
  (meme si le mot "bilan" n'est pas répété, si le contexte est clairement le bilan en cours)
  ⚠️ ANTI-FAUX-POSITIFS: ne pas mettre EXPLICIT_STOP si "arrête de ..." vise autre chose
  (ex: "arrête de me tutoyer", "arrête de me poser des questions") sauf si l'utilisateur dit clairement qu'il veut arrêter le BILAN.
- "BORED": desinteret/ennui ("bof", "ok...", "laisse tomber", "on s'en fout") sans forcement changer de sujet
- "SWITCH_TOPIC": l'utilisateur introduit un autre sujet ("sinon", "au fait") → nouveau sujet clair
- "DIGRESSION": petit ecart temporaire (anecdote, question rapide) sans intention de changer durablement
- "NONE": aucun des cas

SORTIE JSON:
{
  "interrupt": { "kind": "NONE|EXPLICIT_STOP|BORED|SWITCH_TOPIC|DIGRESSION", "confidence": 0.0-1.0 }
}
`;

/**
 * Topic depth detection - distinguish light vs serious vs needs immediate support.
 */
const TOPIC_DEPTH_SECTION = `
=== DETECTION TOPIC_DEPTH ===
Objectif: classer le SUJET du message (si topic_exploration) en:
- "LIGHT": discussion légère (small-talk, anecdotes, recommandations, humour, séries, etc.)
- "SERIOUS": sujet sérieux (problèmes, peurs, travail, relations, confiance, stress) MAIS sans urgence
- "NEED_SUPPORT": l'utilisateur a besoin d'un soutien émotionnel IMMÉDIAT (sans forcément danger vital)
- "NONE": pas de sujet à explorer

plan_focus (bool):
- true UNIQUEMENT si l'utilisateur parle de SON PLAN / objectifs / phases / règles / actions (discussion sur le plan, pas une opération outil)
- false sinon (travail, relations, émotions, séries, etc.)
Exemples plan_focus=true: "dans mon plan", "ma phase 2", "mes actions", "mon grimoire", "mon objectif", "je doute de la stratégie"
Exemples plan_focus=false: "au boulot…", "j'ose pas parler", "j'ai peur du jugement", "reco de série"

RÈGLE CLÉ (anti-surclassement):
- "NEED_SUPPORT" = seulement si le message indique une détresse/overwhelm actuelle et un besoin d'être soutenu maintenant.
- Sinon, par défaut, préfère "SERIOUS" (pas firefighter).

CRITÈRES "NEED_SUPPORT" (exemples):
- panique/angoisse présente, souffle court, "je craque", "je suis au bout", "je n'en peux plus"
- pleurs incontrôlables / crise émotionnelle en cours
- demande explicite de soutien: "j'ai besoin d'aide", "aide-moi là", "j'ai besoin qu'on parle maintenant"
- sentiment d'insécurité émotionnelle immédiate (mais sans éléments de danger vital → safety reste séparé)

CRITÈRES "SERIOUS" (exemples):
- peur du jugement, manque de confiance, stress au travail, "j'ose pas parler en réunion"
- tristesse ou inquiétude exprimée calmement, sans urgence
- problèmes relationnels / décisions importantes / blocages

IMPORTANT:
- "peur d'avoir l'air bête", "peur du jugement", "manque de confiance" = SERIOUS (PAS NEED_SUPPORT).
- Si l'utilisateur dit explicitement "c'est pas une crise", c'est un signal fort pour SERIOUS (PAS NEED_SUPPORT).

SORTIE JSON:
{
  "topic_depth": { "value": "NONE|NEED_SUPPORT|SERIOUS|LIGHT", "confidence": 0.0-1.0, "plan_focus": bool }
}
`;

const NEEDS_EXPLANATION_SECTION = `
=== DETECTION NEEDS_EXPLANATION ===
But: activer "needs_explanation" UNIQUEMENT si l'utilisateur demande explicitement une explication/clarification.

METTRE true (exemples):
- "Pourquoi tu dis ça ?"
- "Tu peux expliquer / détailler ?"
- "Comment ça marche ?"
- "C'est quoi exactement X ?" / "Ça veut dire quoi ?"
- "Reformule, j'ai pas compris."

METTRE false (exemples):
- expression émotionnelle simple ("ça m'énerve", "je suis stressé") sans demande d'explication
- discussion SERIOUS normale ("c'est pas une crise") → PAS besoin d'overlay
- préférence de longueur implicite non demandée (ne pas deviner)

SORTIE JSON:
{
  "needs_explanation": { "value": bool, "confidence": 0.0-1.0, "reason": "string (optionnel, <=100)" }
}
`;

const NEEDS_RESEARCH_SECTION = `
=== DETECTION NEEDS_RESEARCH (overlay transverse) ===
But: activer "needs_research" si l'utilisateur pose une question factuelle nécessitant des informations fraîches/en temps réel que le modèle ne peut pas connaître de mémoire.

METTRE true (exemples):
- "C'est quoi le score du match PSG ?"
- "Qui a gagné hier soir ?"
- "C'est quoi les news aujourd'hui ?"
- "Il fait combien dehors ?" / "Quelle météo demain ?"
- "Cherche sur internet..." / "Vérifie sur le web..."
- "C'est quoi le dernier album de X ?"
- "Quand est le prochain match de Y ?"
- Questions sur des événements récents, résultats sportifs, actualités, prix actuels

METTRE false (exemples):
- Questions introspectives / émotionnelles ("comment je me sens", "pourquoi je procrastine")
- Questions sur le plan / actions / habitudes de l'utilisateur
- Questions de culture générale intemporelle ("c'est quoi la photosynthèse")
- Demandes d'explication / reformulation (→ needs_explanation, pas needs_research)
- Discussion normale / small talk sans besoin d'info fraîche

IMPORTANT:
- Extraire une "query" optimisée pour la recherche web (courte, factuelle, en français ou anglais selon le sujet)
- Indiquer un "domain_hint" si possible (sports, news, weather, entertainment, general)
- Ne PAS activer si le LLM peut répondre de mémoire (connaissances générales stables)

SORTIE JSON:
{
  "needs_research": { "value": bool, "confidence": 0.0-1.0, "query": "string (optionnel, <=120)", "domain_hint": "string (optionnel)" }
}
`;

// wants_tools is legacy/backward-compatible. Keep it conservative.
const WANTS_TOOLS_SECTION = ``;

const SAFETY_RESOLUTION_SECTION = `
=== DETECTION SAFETY_RESOLUTION ===
But: "safety_resolution" ne sert QUE si un sujet de SÉCURITÉ est actif dans le message (ou si safety.level != NONE).

RÈGLE DURE:
- Si safety.level == "NONE" => safety_resolution doit rester neutre:
  user_confirms_safe=false, stabilizing_signal=false, symptoms_still_present=false,
  external_help_mentioned=false, escalate_to_sentry=false, confidence <= 0.3

METTRE des valeurs non-neutres uniquement si safety.level est FIREFIGHTER ou SENTRY
et que l'utilisateur dit explicitement qu'il va mieux / pas mieux / symptômes / aide externe.
`;

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
`;

/**
 * Build the anti-duplication section from signal history.
 * Tells the LLM which signals have already been detected.
 */
function buildAntiDuplicationSection(history: SignalHistoryEntry[]): string {
  if (!history || history.length === 0) return "";

  const lines = history.map((h) =>
    `- ${h.signal_type}: "${
      h.brief.slice(0, 60)
    }" (tour ${h.turn_index}, status=${h.status}${
      h.action_target ? `, action=${h.action_target}` : ""
    })`
  );

  return `

=== SIGNAUX DEJA DETECTES (NE PAS RE-EMETTRE) ===
${lines.join("\n")}

REGLES ANTI-DUPLICATION:
1. Tu analyses UNIQUEMENT le DERNIER message utilisateur pour les nouveaux signaux
2. Si un signal est deja dans la liste ci-dessus: NE PAS le re-emettre dans new_signals
3. Tu PEUX enrichir le brief d'un signal existant si le dernier message apporte du contexte NOUVEAU
4. Enrichissement = mettre a jour le brief dans "enrichments", PAS creer un nouveau signal
5. Si l'utilisateur parle de la MEME action mais avec un contexte different, c'est un enrichissement
`;
}

/**
 * Build the deferred topics section for dispatcher awareness.
 * Shows the dispatcher what topics are waiting in the queue so it can:
 * 1. Avoid re-flagging signals for topics that already exist
 * 2. Produce enrichments for existing topics instead of new signals
 */
function buildDeferredTopicsSection(flowContext?: FlowContext): string {
  // Release 1/2 simplification: deferred topics orchestration disabled.
  // Keep dispatcher prompt focused on current-turn analysis only.
  return "";
}

/**
 * Flow context for enriching machine-specific addons.
 */
export interface FlowContext {
  /** For create_action_flow: the action being created */
  actionLabel?: string;
  actionType?: string;
  actionStatus?: string; // exploring | awaiting_confirm | previewing | created | abandoned
  clarificationCount?: number;
  /** For update_action_flow: the action being updated */
  targetActionTitle?: string;
  proposedChanges?: string;
  updateStatus?: string; // exploring | previewing | updated | abandoned
  updateClarificationCount?: number;
  /** For breakdown_action_flow: the action being broken down */
  breakdownTarget?: string;
  blocker?: string;
  proposedStep?: string;
  breakdownStatus?: string; // exploring | previewing | applied | abandoned
  breakdownClarificationCount?: number;
  /** For topic exploration: the topic being explored */
  topicLabel?: string;
  topicPhase?: string;
  topicTurnCount?: number;
  topicEngagement?: string;
  /** For deep_reasons: the exploration context */
  deepReasonsPhase?: string;
  deepReasonsTopic?: string;
  deepReasonsTurnCount?: number;
  deepReasonsPattern?: string;
  /** For profile confirmation: the fact being confirmed */
  profileFactKey?: string;
  profileFactValue?: string;
  /** For bilan (investigation): the current item being checked */
  currentItemTitle?: string;
  currentItemId?: string;
  missedStreak?: number;
  missedStreaksByAction?: Record<string, number>;
  isBilan?: boolean;
  /** For safety flows (firefighter/sentry): crisis context */
  isSafetyFlow?: boolean;
  safetyFlowType?: "firefighter" | "sentry";
  safetyPhase?:
    | "acute"
    | "grounding"
    | "stabilizing"
    | "confirming"
    | "resolved";
  safetyTurnCount?: number;
  /** Firefighter-specific: counts of stabilization vs distress signals */
  stabilizationSignals?: number;
  distressSignals?: number;
  lastTechnique?: string;
  /** Sentry-specific: safety confirmation status */
  safetyConfirmed?: boolean;
  externalHelpMentioned?: boolean;
  /** Generic pending resolution context (priority over regular machine addons). */
  pendingSignalResolution?: {
    pending_type: PendingResolutionType;
    dual_tool?: {
      tool1_verb: string;
      tool1_target?: string;
      tool2_verb: string;
      tool2_target?: string;
    };
    relaunch_consent?: {
      machine_type: string;
      action_target?: string;
    };
    resume_prompt?: {
      kind: "toolflow" | "safety_recovery";
    };
  };
  /** Pending relaunch consent: if set, dispatcher must detect consent_to_relaunch */
  pendingRelaunchConsent?: {
    machine_type: string;
    action_target?: string;
    summaries: string[];
  };
  /** Deferred topics summary for dispatcher awareness */
  deferredTopicsSummary?: Array<{
    id: string;
    machine_type: string;
    action_target?: string;
    briefs: string[]; // signal_summaries (max 3)
    trigger_count: number;
    age_hours: number;
  }>;
  /** For activate_action_flow: the action being activated */
  activateActionTarget?: string;
  activateExerciseType?: string;
  activateStatus?: string; // exploring | confirming | activated | abandoned
  /** For delete_action_flow: the action being deleted */
  deleteActionTarget?: string;
  deleteActionReason?: string;
  deleteActionStatus?: string; // exploring | confirming | deleted | abandoned
  /** For deactivate_action_flow: the action being deactivated */
  deactivateActionTarget?: string;
  deactivateActionStatus?: string; // exploring | confirming | deactivated | abandoned
  /** For track_progress: consent flow context */
  trackProgressTarget?: string;
  trackProgressStatusHint?: string;
  trackProgressAwaiting?: boolean;
  /** For legacy update_action_structure consent */
  updateActionOldTarget?: string;
  updateActionOldAwaiting?: boolean;
  /** For profile confirmation: additional context */
  profileConfirmPhase?: string; // presenting | awaiting_confirm | processing | completed
  profileConfirmQueueSize?: number;
  profileConfirmCurrentIndex?: number;
}

/**
 * Build machine-specific addon with flow context.
 * R2 simplification: Most machine addons disabled. Only safety + bilan kept.
 */
function buildMachineAddonWithContext(
  _activeMachine: string | null,
  flowContext?: FlowContext,
): string {
  // R2: Pending resolution (dual_tool, relaunch_consent, resume_prompt) disabled.
  // Skip directly to safety/bilan addons.

  // SAFETY FLOWS (kept)
  if (flowContext?.isSafetyFlow) {
    const safetyType = flowContext.safetyFlowType ?? "firefighter";
    const phase = flowContext.safetyPhase ?? "acute";
    const turnCount = flowContext.safetyTurnCount ?? 0;
    return `
=== SIGNAUX SPECIFIQUES (safety_${safetyType}_flow actif — phase: ${phase}) ===
Phase actuelle: ${phase} | Tour: ${turnCount}
Analyse safety_resolution: l'utilisateur va-t-il mieux ? Confirme safe ? Aide externe ?

SORTIE (dans machine_signals):
{
  "machine_signals": {
    "pending_resolution": null
  }
}
`;
  }

  // BILAN ACTIVE (kept)
  if (flowContext?.isBilan) {
    const currentItem = flowContext.currentItemTitle ?? "un item";
    const missedStreak = flowContext.missedStreak ?? 0;
    let addon = `
=== SIGNAUX SPECIFIQUES (bilan actif) ===
Item en cours: "${currentItem}"`;
    if (missedStreak > 0) {
      addon += `\nStreak de ratés: ${missedStreak} jours`;
    }
    addon +=
      `\nReste focalisé sur l'item en cours et les signaux utiles au bilan.`;
    return addon;
  }

  // No active machine or unknown machine: no addon
  return "";
}

// R2 cleanup: ~2100 lines of legacy machine addon code removed.
// (dual_tool, relaunch_consent, create/update/breakdown/activate/delete/deactivate/
//  deep_reasons/topic_session/profile_confirm machine addons, plus matchesSignalType helpers)

// ═══════════════════════════════════════════════════════════════════════════════
// DISPATCHER PROMPT BUILDER
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build the dispatcher system prompt.
 * Includes transverse overlays (needs_explanation / needs_research),
 * tracking, CRUD intent detection for dashboard redirect, checkup intent, and safety signals.
 */
function buildDispatcherPromptV2(opts: {
  activeMachine: string | null;
  signalHistory: SignalHistoryEntry[];
  stateSnapshot: DispatcherInputV2["stateSnapshot"];
  lastAssistantMessage: string;
  flowContext?: FlowContext;
}): string {
  const { activeMachine, stateSnapshot, lastAssistantMessage, flowContext } =
    opts;

  let prompt =
    `Tu es le Dispatcher de Sophia (V2 simplifie). Ton role est d'analyser le message utilisateur et produire des SIGNAUX structures.

DERNIER MESSAGE ASSISTANT:
"${(lastAssistantMessage ?? "").slice(0, 220)}"

ETAT ACTUEL:
- Mode en cours: ${stateSnapshot.current_mode ?? "unknown"}
- Bilan actif: ${stateSnapshot.investigation_active ? "OUI" : "NON"}${
      stateSnapshot.investigation_status
        ? ` (${stateSnapshot.investigation_status})`
        : ""
    }
- Machine active: ${activeMachine ?? "AUCUNE"}
`;

  prompt += MOTHER_SIGNALS_SECTION;
  prompt += LAST_MESSAGE_PROTOCOL_SECTION;
  prompt += FLOW_RESOLUTION_SECTION;
  prompt += INTERRUPT_SECTION;
  prompt += TOPIC_DEPTH_SECTION;
  prompt += NEEDS_EXPLANATION_SECTION;
  prompt += NEEDS_RESEARCH_SECTION;
  prompt += TRACK_AND_DASHBOARD_SIGNALS_SECTION;
  prompt += SAFETY_RESOLUTION_SECTION;

  if (!stateSnapshot.investigation_active) {
    prompt += CHECKUP_INTENT_DETECTION_SECTION;
  }

  // Machine-specific addon (safety/bilan only in R2)
  prompt += buildMachineAddonWithContext(activeMachine, flowContext);

  return prompt;
}

// ═══════════════════════════════════════════════════════════════════════════════
// DISPATCHER V2 CONTEXTUAL: Enhanced version with signal history
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Dispatcher v2 contextual: enhanced version with signal history and deduplication.
 */
export async function analyzeSignalsV2(
  input: DispatcherInputV2,
  meta?: { requestId?: string; forceRealAi?: boolean; model?: string },
): Promise<DispatcherOutputV2> {
  // Deterministic test mode
  const mega =
    (((globalThis as any)?.Deno?.env?.get?.("MEGA_TEST_MODE") ?? "") as string)
        .trim() === "1" &&
    !meta?.forceRealAi;
  if (mega) {
    return {
      signals: { ...DEFAULT_SIGNALS },
      new_signals: [],
      enrichments: [],
    };
  }

  // Build dynamic prompt with context and history
  const basePrompt = buildDispatcherPromptV2({
    activeMachine: input.activeMachine,
    signalHistory: input.signalHistory,
    stateSnapshot: input.stateSnapshot,
    lastAssistantMessage: input.lastAssistantMessage,
    flowContext: input.flowContext,
  });

  // Build message context (last 5 turns / 10 messages for disambiguation, analyze only last)
  const contextMessages = input.last5Messages
    .map((m, i) => {
      const msgIndex = i - input.last5Messages.length + 1;
      const marker = msgIndex === 0
        ? "[DERNIER - ANALYSER]"
        : `[Msg ${msgIndex}]`;
      return `${marker} ${m.role}: ${m.content.slice(0, 200)}`;
    })
    .join("\n");

  // Add the full signal output specification
  const fullPrompt = `${basePrompt}

=== CONTEXTE DES 10 DERNIERS MESSAGES (5 TOURS) ===
${contextMessages}

=== MESSAGE A ANALYSER (dernier message utilisateur) ===
"${(input.userMessage ?? "").slice(0, 500)}"

=== FORMAT DE SORTIE JSON ===
{
  "signals": {
    "safety": { "level": "NONE|FIREFIGHTER|SENTRY", "confidence": 0.0-1.0, "immediacy": "acute|non_acute|unknown" },
    "user_intent_primary": "CHECKUP|SMALL_TALK|PREFERENCE|UNKNOWN",
    "user_intent_confidence": 0.0-1.0,
    "interrupt": { "kind": "NONE|EXPLICIT_STOP|BORED|SWITCH_TOPIC|DIGRESSION", "confidence": 0.0-1.0 },
    "flow_resolution": { "kind": "NONE|ACK_DONE|WANTS_RESUME|DECLINES_RESUME|WANTS_PAUSE", "confidence": 0.0-1.0 },
    "topic_depth": { "value": "NONE|NEED_SUPPORT|SERIOUS|LIGHT", "confidence": 0.0-1.0, "plan_focus": bool },
    "deep_reasons": { "opportunity": bool, "action_mentioned": bool, "action_hint": string|null, "confidence": 0.0-1.0 },
    "needs_explanation": { "value": bool, "confidence": 0.0-1.0 },
    "needs_research": { "value": bool, "confidence": 0.0-1.0, "query": "string|null", "domain_hint": "string|null" },
    "user_engagement": { "level": "HIGH|MEDIUM|LOW|DISENGAGED", "confidence": 0.0-1.0 },
    "topic_satisfaction": { "detected": bool, "confidence": 0.0-1.0 },
    "create_action": { "intent_strength": "explicit|implicit|exploration|none", "sophia_suggested": bool, "user_response": "yes|no|modify|unclear|none", "action_type_hint": "habit|mission|framework|unknown", "confidence": 0.0-1.0 },
    "update_action": { "detected": bool, "target_hint": string|null, "change_type": "frequency|days|time|title|mixed|unknown", "user_response": "yes|no|modify|unclear|none", "confidence": 0.0-1.0 },
    "breakdown_action": { "detected": bool, "target_hint": string|null, "blocker_hint": string|null, "user_response": "yes|no|unclear|none", "confidence": 0.0-1.0 },
    "track_progress": { "detected": bool, "target_hint": string|null, "status_hint": "completed|missed|partial|unknown", "value_hint": number|null, "confidence": 0.0-1.0 },
    "activate_action": { "detected": bool, "target_hint": string|null, "exercise_type_hint": string|null, "confidence": 0.0-1.0 },
    "delete_action": { "detected": bool, "target_hint": string|null, "reason_hint": string|null, "confidence": 0.0-1.0 },
    "deactivate_action": { "detected": bool, "target_hint": string|null, "confidence": 0.0-1.0 },
    "dashboard_preferences_intent": { "detected": bool, "preference_keys": ["language|tone|response_length|emoji_level|voice_style|proactivity_level|timezone|daily_summary_time|coach_intensity"], "confidence": 0.0-1.0 },
    "dashboard_recurring_reminder_intent": { "detected": bool, "reminder_fields": ["mode|days|time|timezone|channel|start_date|end_date|pause|message"], "confidence": 0.0-1.0 },
    "safety_resolution": { "user_confirms_safe": bool, "stabilizing_signal": bool, "symptoms_still_present": bool, "external_help_mentioned": bool, "escalate_to_sentry": bool, "confidence": 0.0-1.0 },
    "safety_stabilization": { "stabilizing_turn": bool, "confidence": 0.0-1.0 },
    "wants_tools": bool,
    "risk_score": 0-10
  },
  "new_signals": [
    { "signal_type": "string", "brief": "description max 100 chars", "confidence": 0.0-1.0, "action_target": "string|null" }
  ],
  "enrichments": [
    { "existing_signal_type": "string", "updated_brief": "new description with added context" }
  ],
  "machine_signals": {
    /* VOIR SECTION SIGNAUX SPECIFIQUES - inclure seulement si une machine est active */
    "pending_resolution": {
      "status": "resolved|unresolved|unrelated",
      "pending_type": "dual_tool|relaunch_consent|checkup_entry|resume_prompt",
      "decision_code": "string enum selon pending_type",
      "confidence": 0.0-1.0,
      "reason_short": "string courte optionnelle"
    }
  }
}

REGLES:
- Le DERNIER message utilisateur est la source de vérité pour tous les flags.
- Les messages précédents sont uniquement du contexte.
- "signals": contient l'analyse complete comme avant (backward compatible)
- "new_signals": UNIQUEMENT pour les signaux detectes dans le DERNIER message qui ne sont PAS dans l'historique
- "enrichments": UNIQUEMENT pour mettre a jour le brief d'un signal existant avec du contexte NOUVEAU
- Ne pas re-emettre un signal deja dans l'historique!
- "machine_signals": INCLURE UNIQUEMENT si une machine est active (voir SIGNAUX SPECIFIQUES ci-dessus)
- Si un pending de resolution est actif, "machine_signals.pending_resolution" est OBLIGATOIRE.

Reponds UNIQUEMENT avec le JSON:`;

  try {
    const dispatcherModel =
      ((globalThis as any)?.Deno?.env?.get?.("GEMINI_DISPATCHER_MODEL") ?? "")
        .toString().trim() ||
      "gemini-2.5-flash";
    // Helpful runtime breadcrumb (lets us confirm quickly in logs that the override is active).
    try {
      console.log(JSON.stringify({
        tag: "dispatcher_model_selected",
        request_id: meta?.requestId ?? null,
        model: dispatcherModel,
      }));
    } catch { /* ignore */ }
    const response = await generateWithGemini(
      fullPrompt,
      "",
      0.0,
      true,
      [],
      "auto",
      {
        requestId: meta?.requestId,
        // Dispatcher: prioritize low-latency routing. Hard-force Gemini Flash by default.
        // (We intentionally ignore meta.model here to avoid accidentally inheriting chat model config.)
        model: dispatcherModel,
        source: "sophia-brain:dispatcher-v2-contextual",
      },
    );
    const obj = JSON.parse(response as string) as any;

    // Parse the classic signals (reuse existing parsing logic)
    const signalsObj = obj?.signals ?? obj;

    // Parse safety
    const safetyLevel =
      (["NONE", "FIREFIGHTER", "SENTRY"] as SafetyLevel[]).includes(
          signalsObj?.safety?.level,
        )
        ? signalsObj.safety.level as SafetyLevel
        : "NONE";
    const safetyConf = Math.max(
      0,
      Math.min(1, Number(signalsObj?.safety?.confidence ?? 0.9) || 0.9),
    );
    const immediacy = (["acute", "non_acute", "unknown"] as const).includes(
        signalsObj?.safety?.immediacy,
      )
      ? signalsObj.safety.immediacy
      : "unknown";

    // Parse intent
    const intentPrimary = ([
        "CHECKUP",
        "SMALL_TALK",
        "PREFERENCE",
        "UNKNOWN",
      ] as UserIntentPrimary[]).includes(signalsObj?.user_intent_primary)
      ? signalsObj.user_intent_primary as UserIntentPrimary
      : "UNKNOWN";
    const intentConf = Math.max(
      0,
      Math.min(1, Number(signalsObj?.user_intent_confidence ?? 0.5) || 0.5),
    );

    // Parse interrupt
    const interruptKind = ([
        "NONE",
        "EXPLICIT_STOP",
        "BORED",
        "SWITCH_TOPIC",
        "DIGRESSION",
      ] as InterruptKind[])
        .includes(signalsObj?.interrupt?.kind)
      ? signalsObj.interrupt.kind as InterruptKind
      : "NONE";
    const interruptConf = Math.max(
      0,
      Math.min(1, Number(signalsObj?.interrupt?.confidence ?? 0.9) || 0.9),
    );
    const deferredTopicRaw = signalsObj?.interrupt?.deferred_topic_formalized;
    const deferredTopicFormalized = (
        typeof deferredTopicRaw === "string" &&
        deferredTopicRaw.trim().length >= 3 &&
        deferredTopicRaw.trim().length <= 120 &&
        !/^(je\s+sais?\s+pas|null|undefined|none)$/i.test(
          deferredTopicRaw.trim(),
        )
      )
      ? deferredTopicRaw.trim()
      : null;

    // Parse flow_resolution
    const flowKind = ([
        "NONE",
        "ACK_DONE",
        "WANTS_RESUME",
        "DECLINES_RESUME",
        "WANTS_PAUSE",
      ] as FlowResolutionKind[])
        .includes(signalsObj?.flow_resolution?.kind)
      ? signalsObj.flow_resolution.kind as FlowResolutionKind
      : "NONE";
    const flowConf = Math.max(
      0,
      Math.min(
        1,
        Number(signalsObj?.flow_resolution?.confidence ?? 0.9) || 0.9,
      ),
    );

    // Parse topic_depth
    const topicDepthValue =
      (["NONE", "NEED_SUPPORT", "SERIOUS", "LIGHT"] as TopicDepth[])
          .includes(signalsObj?.topic_depth?.value)
        ? signalsObj.topic_depth.value as TopicDepth
        : "NONE";
    const topicDepthConf = Math.max(
      0,
      Math.min(1, Number(signalsObj?.topic_depth?.confidence ?? 0.9) || 0.9),
    );
    const topicDepthPlanFocus = Boolean(signalsObj?.topic_depth?.plan_focus);

    // Parse deep_reasons
    let deepReasonsOpportunity = Boolean(signalsObj?.deep_reasons?.opportunity);
    let deepReasonsActionMentioned = Boolean(
      signalsObj?.deep_reasons?.action_mentioned,
    );
    let deepReasonsActionHint =
      (typeof signalsObj?.deep_reasons?.action_hint === "string" &&
          signalsObj.deep_reasons.action_hint.trim())
        ? signalsObj.deep_reasons.action_hint.trim().slice(0, 50)
        : undefined;
    const deepReasonsInBilanContext =
      Boolean(signalsObj?.deep_reasons?.in_bilan_context) ||
      Boolean(input.stateSnapshot.investigation_active);
    let deepReasonsConf = Math.max(
      0,
      Math.min(1, Number(signalsObj?.deep_reasons?.confidence ?? 0.5) || 0.5),
    );

    // Parse needs_explanation
    const needsExplanationValue = Boolean(signalsObj?.needs_explanation?.value);
    const needsExplanationConf = Math.max(
      0,
      Math.min(
        1,
        Number(signalsObj?.needs_explanation?.confidence ?? 0.5) || 0.5,
      ),
    );
    const needsExplanationReason =
      typeof signalsObj?.needs_explanation?.reason === "string"
        ? signalsObj.needs_explanation.reason.slice(0, 100)
        : undefined;

    // Parse needs_research (transverse overlay)
    const needsResearchRawValue = signalsObj?.needs_research?.value;
    const needsResearchValue = needsResearchRawValue === true ||
      needsResearchRawValue === 1 ||
      String(needsResearchRawValue ?? "").trim().toLowerCase() === "true" ||
      String(needsResearchRawValue ?? "").trim() === "1";
    const needsResearchConfRaw = Number(signalsObj?.needs_research?.confidence);
    const needsResearchConf = Math.max(
      0,
      Math.min(
        1,
        Number.isFinite(needsResearchConfRaw) ? needsResearchConfRaw : 0.5,
      ),
    );
    const needsResearchQuery = (() => {
      if (typeof signalsObj?.needs_research?.query !== "string") {
        return undefined;
      }
      const q = signalsObj.needs_research.query.trim().slice(0, 120);
      return q.length > 0 ? q : undefined;
    })();
    const needsResearchDomainHint = (() => {
      if (typeof signalsObj?.needs_research?.domain_hint !== "string") {
        return undefined;
      }
      const d = signalsObj.needs_research.domain_hint.trim().slice(0, 30);
      return d.length > 0 ? d : undefined;
    })();

    // Parse user_engagement
    const engagementLevelRaw = String(
      signalsObj?.user_engagement?.level ?? "MEDIUM",
    ).toUpperCase();
    const engagementLevel =
      (["HIGH", "MEDIUM", "LOW", "DISENGAGED"] as UserEngagementLevel[])
          .includes(engagementLevelRaw as UserEngagementLevel)
        ? engagementLevelRaw as UserEngagementLevel
        : "MEDIUM";
    const engagementConf = Math.max(
      0,
      Math.min(
        1,
        Number(signalsObj?.user_engagement?.confidence ?? 0.5) || 0.5,
      ),
    );

    // Parse topic_satisfaction
    const satisfactionDetected = Boolean(
      signalsObj?.topic_satisfaction?.detected,
    );
    const satisfactionConf = Math.max(
      0,
      Math.min(
        1,
        Number(signalsObj?.topic_satisfaction?.confidence ?? 0.5) || 0.5,
      ),
    );

    // Parse create_action
    const createActionIntentRaw = String(
      signalsObj?.create_action?.intent_strength ?? "none",
    ).toLowerCase();
    const createActionIntent =
      (["explicit", "implicit", "exploration", "none"] as const).includes(
          createActionIntentRaw as any,
        )
        ? createActionIntentRaw as
          | "explicit"
          | "implicit"
          | "exploration"
          | "none"
        : "none";
    const createActionSophiaSuggested = Boolean(
      signalsObj?.create_action?.sophia_suggested,
    );
    const createActionUserResponseRaw = String(
      signalsObj?.create_action?.user_response ?? "none",
    ).toLowerCase();
    const createActionUserResponse =
      (["yes", "no", "modify", "unclear", "none"] as const).includes(
          createActionUserResponseRaw as any,
        )
        ? createActionUserResponseRaw as
          | "yes"
          | "no"
          | "modify"
          | "unclear"
          | "none"
        : "none";
    const createActionModInfoRaw = String(
      signalsObj?.create_action?.modification_info ?? "none",
    ).toLowerCase();
    const createActionModInfo =
      (["available", "missing", "none"] as const).includes(
          createActionModInfoRaw as any,
        )
        ? createActionModInfoRaw as "available" | "missing" | "none"
        : "none";
    const createActionTypeRaw = String(
      signalsObj?.create_action?.action_type_hint ?? "unknown",
    ).toLowerCase();
    const createActionType =
      (["habit", "mission", "framework", "unknown"] as const).includes(
          createActionTypeRaw as any,
        )
        ? createActionTypeRaw as "habit" | "mission" | "framework" | "unknown"
        : "unknown";
    const createActionLabel =
      (typeof signalsObj?.create_action?.action_label_hint === "string" &&
          signalsObj.create_action.action_label_hint.trim())
        ? signalsObj.create_action.action_label_hint.trim().slice(0, 120)
        : undefined;
    const createActionConf = Math.max(
      0,
      Math.min(1, Number(signalsObj?.create_action?.confidence ?? 0.5) || 0.5),
    );

    // Parse update_action
    const updateActionDetected = Boolean(signalsObj?.update_action?.detected);
    const updateActionTargetHint =
      (typeof signalsObj?.update_action?.target_hint === "string" &&
          signalsObj.update_action.target_hint.trim())
        ? signalsObj.update_action.target_hint.trim().slice(0, 80)
        : undefined;
    const updateActionChangeTypeRaw = String(
      signalsObj?.update_action?.change_type ?? "unknown",
    ).toLowerCase();
    const updateActionChangeType =
      (["frequency", "days", "time", "title", "mixed", "unknown"] as const)
          .includes(updateActionChangeTypeRaw as any)
        ? updateActionChangeTypeRaw as
          | "frequency"
          | "days"
          | "time"
          | "title"
          | "mixed"
          | "unknown"
        : "unknown";
    const updateActionNewValueHint =
      (typeof signalsObj?.update_action?.new_value_hint === "string" &&
          signalsObj.update_action.new_value_hint.trim())
        ? signalsObj.update_action.new_value_hint.trim().slice(0, 80)
        : undefined;
    const updateActionUserResponseRaw = String(
      signalsObj?.update_action?.user_response ?? "none",
    ).toLowerCase();
    const updateActionUserResponse =
      (["yes", "no", "modify", "unclear", "none"] as const).includes(
          updateActionUserResponseRaw as any,
        )
        ? updateActionUserResponseRaw as
          | "yes"
          | "no"
          | "modify"
          | "unclear"
          | "none"
        : "none";
    const updateActionConf = Math.max(
      0,
      Math.min(1, Number(signalsObj?.update_action?.confidence ?? 0.5) || 0.5),
    );

    // Parse breakdown_action
    const breakdownActionDetected = Boolean(
      signalsObj?.breakdown_action?.detected,
    );
    const breakdownActionTargetHint =
      (typeof signalsObj?.breakdown_action?.target_hint === "string" &&
          signalsObj.breakdown_action.target_hint.trim())
        ? signalsObj.breakdown_action.target_hint.trim().slice(0, 80)
        : undefined;
    const breakdownActionBlockerHint =
      (typeof signalsObj?.breakdown_action?.blocker_hint === "string" &&
          signalsObj.breakdown_action.blocker_hint.trim())
        ? signalsObj.breakdown_action.blocker_hint.trim().slice(0, 200)
        : undefined;
    const breakdownActionSophiaSuggested = Boolean(
      signalsObj?.breakdown_action?.sophia_suggested,
    );
    const breakdownActionUserResponseRaw = String(
      signalsObj?.breakdown_action?.user_response ?? "none",
    ).toLowerCase();
    const breakdownActionUserResponse =
      (["yes", "no", "unclear", "none"] as const).includes(
          breakdownActionUserResponseRaw as any,
        )
        ? breakdownActionUserResponseRaw as "yes" | "no" | "unclear" | "none"
        : "none";
    const breakdownActionConf = Math.max(
      0,
      Math.min(
        1,
        Number(signalsObj?.breakdown_action?.confidence ?? 0.5) || 0.5,
      ),
    );

    // Parse track_progress signal
    const trackProgressDetected = Boolean(signalsObj?.track_progress?.detected);
    const trackProgressTargetHint =
      (typeof signalsObj?.track_progress?.target_hint === "string" &&
          signalsObj.track_progress.target_hint.trim())
        ? signalsObj.track_progress.target_hint.trim().slice(0, 80)
        : undefined;
    const trackProgressStatusHintRaw = String(
      signalsObj?.track_progress?.status_hint ?? "unknown",
    ).toLowerCase();
    const trackProgressStatusHint =
      (["completed", "missed", "partial", "unknown"] as const).includes(
          trackProgressStatusHintRaw as any,
        )
        ? trackProgressStatusHintRaw as
          | "completed"
          | "missed"
          | "partial"
          | "unknown"
        : "unknown";
    const trackProgressValueHint =
      (typeof signalsObj?.track_progress?.value_hint === "number" &&
          !isNaN(signalsObj.track_progress.value_hint))
        ? signalsObj.track_progress.value_hint
        : undefined;
    const trackProgressConf = Math.max(
      0,
      Math.min(1, Number(signalsObj?.track_progress?.confidence ?? 0.5) || 0.5),
    );

    // Parse activate_action signal
    const activateActionDetected = Boolean(
      signalsObj?.activate_action?.detected,
    );
    const activateActionTargetHint =
      (typeof signalsObj?.activate_action?.target_hint === "string" &&
          signalsObj.activate_action.target_hint.trim())
        ? signalsObj.activate_action.target_hint.trim().slice(0, 80)
        : undefined;
    const activateActionExerciseHint =
      (typeof signalsObj?.activate_action?.exercise_type_hint === "string" &&
          signalsObj.activate_action.exercise_type_hint.trim())
        ? signalsObj.activate_action.exercise_type_hint.trim().slice(0, 80)
        : undefined;
    const activateActionConf = Math.max(
      0,
      Math.min(
        1,
        Number(signalsObj?.activate_action?.confidence ?? 0.5) || 0.5,
      ),
    );

    // Parse delete_action signal
    const deleteActionDetected = Boolean(signalsObj?.delete_action?.detected);
    const deleteActionTargetHint =
      (typeof signalsObj?.delete_action?.target_hint === "string" &&
          signalsObj.delete_action.target_hint.trim())
        ? signalsObj.delete_action.target_hint.trim().slice(0, 80)
        : undefined;
    const deleteActionReasonHint =
      (typeof signalsObj?.delete_action?.reason_hint === "string" &&
          signalsObj.delete_action.reason_hint.trim())
        ? signalsObj.delete_action.reason_hint.trim().slice(0, 120)
        : undefined;
    const deleteActionConf = Math.max(
      0,
      Math.min(1, Number(signalsObj?.delete_action?.confidence ?? 0.5) || 0.5),
    );

    // Parse deactivate_action signal
    const deactivateActionDetected = Boolean(
      signalsObj?.deactivate_action?.detected,
    );
    const deactivateActionTargetHint =
      (typeof signalsObj?.deactivate_action?.target_hint === "string" &&
          signalsObj.deactivate_action.target_hint.trim())
        ? signalsObj.deactivate_action.target_hint.trim().slice(0, 80)
        : undefined;
    const deactivateActionConfRaw = Number(
      signalsObj?.deactivate_action?.confidence,
    );
    const deactivateActionConf = Math.max(
      0,
      Math.min(
        1,
        Number.isFinite(deactivateActionConfRaw)
          ? deactivateActionConfRaw
          : 0.5,
      ),
    );

    // Parse dashboard_preferences_intent signal
    const dashboardPreferencesDetected = Boolean(
      signalsObj?.dashboard_preferences_intent?.detected,
    );
    const dashboardPreferencesKeysRaw = Array.isArray(
      signalsObj?.dashboard_preferences_intent?.preference_keys,
    )
      ? signalsObj.dashboard_preferences_intent.preference_keys
      : [];
    const dashboardPreferenceAllowed = new Set([
      "language",
      "tone",
      "response_length",
      "emoji_level",
      "voice_style",
      "proactivity_level",
      "timezone",
      "daily_summary_time",
      "coach_intensity",
    ]);
    const dashboardPreferenceKeys = dashboardPreferencesKeysRaw
      .map((v: unknown) => String(v ?? "").trim().toLowerCase())
      .filter((v: string) => dashboardPreferenceAllowed.has(v))
      .slice(0, 9);
    const dashboardPreferencesConf = Math.max(
      0,
      Math.min(
        1,
        Number(signalsObj?.dashboard_preferences_intent?.confidence ?? 0.5) ||
          0.5,
      ),
    );

    // Parse dashboard_recurring_reminder_intent signal
    const dashboardRecurringReminderDetected = Boolean(
      signalsObj?.dashboard_recurring_reminder_intent?.detected,
    );
    const dashboardReminderFieldsRaw = Array.isArray(
      signalsObj?.dashboard_recurring_reminder_intent?.reminder_fields,
    )
      ? signalsObj.dashboard_recurring_reminder_intent.reminder_fields
      : [];
    const dashboardReminderAllowed = new Set([
      "mode",
      "days",
      "time",
      "timezone",
      "channel",
      "start_date",
      "end_date",
      "pause",
      "message",
    ]);
    const dashboardReminderFields = dashboardReminderFieldsRaw
      .map((v: unknown) => String(v ?? "").trim().toLowerCase())
      .filter((v: string) => dashboardReminderAllowed.has(v))
      .slice(0, 9);
    const dashboardRecurringReminderConf = Math.max(
      0,
      Math.min(
        1,
        Number(
          signalsObj?.dashboard_recurring_reminder_intent?.confidence ?? 0.5,
        ) || 0.5,
      ),
    );

    // Parse safety_resolution signal
    let safetyResolutionUserConfirmsSafe = Boolean(
      signalsObj?.safety_resolution?.user_confirms_safe,
    );
    let safetyResolutionStabilizingSignal = Boolean(
      signalsObj?.safety_resolution?.stabilizing_signal,
    );
    let safetyResolutionSymptomsStillPresent = Boolean(
      signalsObj?.safety_resolution?.symptoms_still_present,
    );
    let safetyResolutionExternalHelpMentioned = Boolean(
      signalsObj?.safety_resolution?.external_help_mentioned,
    );
    let safetyResolutionEscalateToSentry = Boolean(
      signalsObj?.safety_resolution?.escalate_to_sentry,
    );
    let safetyResolutionConf = Math.max(
      0,
      Math.min(
        1,
        Number(signalsObj?.safety_resolution?.confidence ?? 0.5) || 0.5,
      ),
    );

    // Hard guard: safety_resolution is only meaningful when safety != NONE.
    if (safetyLevel === "NONE") {
      safetyResolutionUserConfirmsSafe = false;
      safetyResolutionStabilizingSignal = false;
      safetyResolutionSymptomsStillPresent = false;
      safetyResolutionExternalHelpMentioned = false;
      safetyResolutionEscalateToSentry = false;
      safetyResolutionConf = Math.min(safetyResolutionConf, 0.3);
    }

    // Parse safety_stabilization signal (single-turn indicator used by router counter overlay).
    let safetyStabilizationTurn = Boolean(
      signalsObj?.safety_stabilization?.stabilizing_turn,
    );
    let safetyStabilizationConf = Math.max(
      0,
      Math.min(
        1,
        Number(signalsObj?.safety_stabilization?.confidence ?? 0.5) || 0.5,
      ),
    );
    if (safetyLevel === "NONE") {
      safetyStabilizationTurn = false;
      safetyStabilizationConf = Math.min(safetyStabilizationConf, 0.3);
    }

    let wantsTools = Boolean(signalsObj?.wants_tools);
    // Hard guard: do not set wants_tools=true unless there is actual tool intent evidence.
    // This prevents "wants_tools" from flipping on emotional support turns.
    const anyToolIntentDetected = (signalsObj?.create_action?.intent_strength &&
      String(signalsObj.create_action.intent_strength) !== "none") ||
      Boolean(signalsObj?.update_action?.detected) ||
      Boolean(signalsObj?.breakdown_action?.detected) ||
      Boolean(signalsObj?.track_progress?.detected) ||
      Boolean(signalsObj?.activate_action?.detected) ||
      Boolean(signalsObj?.delete_action?.detected) ||
      Boolean(signalsObj?.deactivate_action?.detected);
    if (wantsTools && !anyToolIntentDetected) {
      wantsTools = false;
    }
    const riskScore = Math.max(
      0,
      Math.min(10, Number(signalsObj?.risk_score ?? 0) || 0),
    );

    // Parse new_signals
    const newSignals: NewSignalEntry[] = [];
    if (Array.isArray(obj?.new_signals)) {
      for (const sig of obj.new_signals.slice(0, 5)) {
        const signalType = String(sig?.signal_type ?? "").trim();
        const brief = String(sig?.brief ?? "").trim().slice(0, 100);
        const confidence = Math.max(
          0,
          Math.min(1, Number(sig?.confidence ?? 0.5) || 0.5),
        );
        const actionTarget =
          (typeof sig?.action_target === "string" && sig.action_target.trim())
            ? sig.action_target.trim().slice(0, 80)
            : undefined;
        if (signalType && brief) {
          newSignals.push({
            signal_type: signalType,
            brief,
            confidence,
            action_target: actionTarget,
          });
        }
      }
    }

    // Parse enrichments
    const enrichments: SignalEnrichment[] = [];
    if (Array.isArray(obj?.enrichments)) {
      for (const enrich of obj.enrichments.slice(0, 5)) {
        const existingSignalType = String(enrich?.existing_signal_type ?? "")
          .trim();
        const updatedBrief = String(enrich?.updated_brief ?? "").trim().slice(
          0,
          100,
        );
        if (existingSignalType && updatedBrief) {
          enrichments.push({
            existing_signal_type: existingSignalType,
            updated_brief: updatedBrief,
          });
        }
      }
    }

    // Parse machine_signals (only if present)
    let machineSignals: MachineSignals | undefined = undefined;
    if (obj?.machine_signals && typeof obj.machine_signals === "object") {
      const ms = obj.machine_signals;
      machineSignals = {};

      // create_action_flow signals
      if (ms.user_confirms_preview !== undefined) {
        const valid = ["yes", "no", "modify", "unclear", null];
        machineSignals.user_confirms_preview =
          valid.includes(ms.user_confirms_preview)
            ? ms.user_confirms_preview
            : null;
      }
      if (ms.action_type_clarified !== undefined) {
        const valid = ["habit", "mission", "framework", null];
        machineSignals.action_type_clarified =
          valid.includes(ms.action_type_clarified)
            ? ms.action_type_clarified
            : null;
      }
      if (ms.user_abandons !== undefined) {
        machineSignals.user_abandons = Boolean(ms.user_abandons);
      }
      if (ms.modification_requested !== undefined) {
        machineSignals.modification_requested =
          typeof ms.modification_requested === "string"
            ? ms.modification_requested.slice(0, 200)
            : null;
      }

      // update_action_flow signals
      if (ms.user_confirms_change !== undefined) {
        const valid = ["yes", "no", "modify", "unclear", null];
        machineSignals.user_confirms_change =
          valid.includes(ms.user_confirms_change)
            ? ms.user_confirms_change
            : null;
      }
      if (ms.new_value_provided !== undefined) {
        machineSignals.new_value_provided =
          typeof ms.new_value_provided === "string"
            ? ms.new_value_provided.slice(0, 200)
            : null;
      }

      // breakdown_action_flow signals
      if (ms.user_confirms_microstep !== undefined) {
        const valid = ["yes", "no", null];
        machineSignals.user_confirms_microstep =
          valid.includes(ms.user_confirms_microstep)
            ? ms.user_confirms_microstep
            : null;
      }
      if (ms.user_wants_different_step !== undefined) {
        machineSignals.user_wants_different_step = Boolean(
          ms.user_wants_different_step,
        );
      }
      if (ms.blocker_clarified !== undefined) {
        machineSignals.blocker_clarified =
          typeof ms.blocker_clarified === "string"
            ? ms.blocker_clarified.slice(0, 200)
            : null;
      }

      // topic_exploration signals
      if (ms.user_engagement !== undefined) {
        const valid = ["HIGH", "MEDIUM", "LOW", "DISENGAGED"];
        machineSignals.user_engagement = valid.includes(ms.user_engagement)
          ? ms.user_engagement
          : "MEDIUM";
      }
      if (
        ms.topic_satisfaction !== undefined &&
        typeof ms.topic_satisfaction === "object"
      ) {
        machineSignals.topic_satisfaction = {
          detected: Boolean(ms.topic_satisfaction?.detected),
        };
      }
      if (ms.wants_to_change_topic !== undefined) {
        machineSignals.wants_to_change_topic = Boolean(
          ms.wants_to_change_topic,
        );
      }
      if (ms.needs_deeper_exploration !== undefined) {
        machineSignals.needs_deeper_exploration = Boolean(
          ms.needs_deeper_exploration,
        );
      }

      // deep_reasons_exploration signals
      if (ms.user_opens_up !== undefined) {
        machineSignals.user_opens_up = Boolean(ms.user_opens_up);
      }
      if (ms.resistance_detected !== undefined) {
        machineSignals.resistance_detected = Boolean(ms.resistance_detected);
      }
      if (ms.insight_emerged !== undefined) {
        machineSignals.insight_emerged = Boolean(ms.insight_emerged);
      }
      if (ms.wants_to_stop !== undefined) {
        machineSignals.wants_to_stop = Boolean(ms.wants_to_stop);
      }

      // activate_action_flow signals
      if (ms.user_confirms_activation !== undefined) {
        machineSignals.user_confirms_activation =
          ms.user_confirms_activation === null
            ? null
            : Boolean(ms.user_confirms_activation);
      }
      if (ms.user_wants_different_action !== undefined) {
        machineSignals.user_wants_different_action =
          typeof ms.user_wants_different_action === "string"
            ? ms.user_wants_different_action.slice(0, 100)
            : null;
      }
      if (ms.activation_ready !== undefined) {
        machineSignals.activation_ready = Boolean(ms.activation_ready);
      }

      // delete_action_flow signals
      if (ms.user_confirms_deletion !== undefined) {
        machineSignals.user_confirms_deletion =
          ms.user_confirms_deletion === null
            ? null
            : Boolean(ms.user_confirms_deletion);
      }
      if (ms.deletion_ready !== undefined) {
        machineSignals.deletion_ready = Boolean(ms.deletion_ready);
      }

      // deactivate_action_flow signals
      if (ms.user_confirms_deactivation !== undefined) {
        machineSignals.user_confirms_deactivation =
          ms.user_confirms_deactivation === null
            ? null
            : Boolean(ms.user_confirms_deactivation);
      }
      if (ms.deactivation_ready !== undefined) {
        machineSignals.deactivation_ready = Boolean(ms.deactivation_ready);
      }

      // bilan/investigation signals
      if (ms.breakdown_recommended !== undefined) {
        machineSignals.breakdown_recommended = Boolean(
          ms.breakdown_recommended,
        );
      }
      if (ms.deep_reasons_opportunity !== undefined) {
        machineSignals.deep_reasons_opportunity = Boolean(
          ms.deep_reasons_opportunity,
        );
      }
      if (ms.create_action_intent !== undefined) {
        machineSignals.create_action_intent = Boolean(ms.create_action_intent);
      }
      if (ms.update_action_intent !== undefined) {
        machineSignals.update_action_intent = Boolean(ms.update_action_intent);
      }
      if (ms.activate_action_intent !== undefined) {
        machineSignals.activate_action_intent = Boolean(
          ms.activate_action_intent,
        );
      }
      if (ms.delete_action_intent !== undefined) {
        machineSignals.delete_action_intent = Boolean(ms.delete_action_intent);
      }
      if (ms.deactivate_action_intent !== undefined) {
        machineSignals.deactivate_action_intent = Boolean(
          ms.deactivate_action_intent,
        );
      }
      if (ms.user_consents_defer !== undefined) {
        machineSignals.user_consents_defer = Boolean(ms.user_consents_defer);
      }

      // bilan/investigation confirmation signals (response to "tu veux qu'on en parle après le bilan ?")
      if (
        ms.confirm_deep_reasons !== undefined &&
        ms.confirm_deep_reasons !== null
      ) {
        machineSignals.confirm_deep_reasons = Boolean(ms.confirm_deep_reasons);
      }
      if (ms.confirm_breakdown !== undefined && ms.confirm_breakdown !== null) {
        machineSignals.confirm_breakdown = Boolean(ms.confirm_breakdown);
      }
      if (ms.confirm_topic !== undefined && ms.confirm_topic !== null) {
        machineSignals.confirm_topic = Boolean(ms.confirm_topic);
      }
      if (
        ms.confirm_increase_target !== undefined &&
        ms.confirm_increase_target !== null
      ) {
        machineSignals.confirm_increase_target = Boolean(
          ms.confirm_increase_target,
        );
      }
      if (
        ms.confirm_delete_action !== undefined &&
        ms.confirm_delete_action !== null
      ) {
        machineSignals.confirm_delete_action = Boolean(
          ms.confirm_delete_action,
        );
      }
      if (
        ms.confirm_deactivate_action !== undefined &&
        ms.confirm_deactivate_action !== null
      ) {
        machineSignals.confirm_deactivate_action = Boolean(
          ms.confirm_deactivate_action,
        );
      }

      // Checkup flow signals
      if (ms.checkup_intent && typeof ms.checkup_intent === "object") {
        const ci = ms.checkup_intent;
        machineSignals.checkup_intent = {
          detected: Boolean(ci.detected),
          confidence: Math.min(1, Math.max(0, Number(ci.confidence ?? 0))),
          trigger_phrase: typeof ci.trigger_phrase === "string"
            ? ci.trigger_phrase.slice(0, 100)
            : undefined,
        };
      }
      if (ms.wants_to_checkup !== undefined) {
        machineSignals.wants_to_checkup = Boolean(ms.wants_to_checkup);
      }
      if (ms.track_from_bilan_done_ok !== undefined) {
        machineSignals.track_from_bilan_done_ok = Boolean(
          ms.track_from_bilan_done_ok,
        );
      }

      // Generic pending resolution signal (structured, typed by pending_type)
      const parsedPendingResolution = normalizePendingResolutionSignal(
        ms.pending_resolution,
      );
      if (parsedPendingResolution) {
        machineSignals.pending_resolution = parsedPendingResolution;
      }

      // Only include if there's at least one defined signal
      const hasAny = Object.values(machineSignals).some((v) => v !== undefined);
      if (!hasAny) machineSignals = undefined;
    }

    // Parse deferred_enrichment (if dispatcher identified enrichment for existing deferred topic)
    let deferredEnrichment:
      | { topic_id: string; new_brief: string }
      | undefined = undefined;
    if (
      obj?.deferred_enrichment && typeof obj.deferred_enrichment === "object"
    ) {
      const de = obj.deferred_enrichment;
      const topicId = typeof de.topic_id === "string" ? de.topic_id.trim() : "";
      const newBrief = typeof de.new_brief === "string"
        ? de.new_brief.trim().slice(0, 150)
        : "";
      if (topicId && newBrief) {
        deferredEnrichment = { topic_id: topicId, new_brief: newBrief };
      }
    }

    return {
      signals: {
        safety: {
          level: safetyLevel,
          confidence: safetyConf,
          immediacy: safetyLevel !== "NONE" ? immediacy : undefined,
        },
        user_intent_primary: intentPrimary,
        user_intent_confidence: intentConf,
        interrupt: {
          kind: interruptKind,
          confidence: interruptConf,
          deferred_topic_formalized:
            (interruptKind === "DIGRESSION" || interruptKind === "SWITCH_TOPIC")
              ? deferredTopicFormalized
              : undefined,
        },
        flow_resolution: { kind: flowKind, confidence: flowConf },
        topic_depth: {
          value: topicDepthValue,
          confidence: topicDepthConf,
          plan_focus: topicDepthPlanFocus,
        },
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
        needs_research: {
          value: needsResearchValue,
          confidence: needsResearchConf,
          query: needsResearchQuery,
          domain_hint: needsResearchDomainHint,
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
        delete_action: {
          detected: deleteActionDetected,
          target_hint: deleteActionTargetHint,
          reason_hint: deleteActionReasonHint,
          confidence: deleteActionConf,
        },
        deactivate_action: {
          detected: deactivateActionDetected,
          target_hint: deactivateActionTargetHint,
          confidence: deactivateActionConf,
        },
        dashboard_preferences_intent: {
          detected: dashboardPreferencesDetected,
          preference_keys: dashboardPreferenceKeys,
          confidence: dashboardPreferencesConf,
        },
        dashboard_recurring_reminder_intent: {
          detected: dashboardRecurringReminderDetected,
          reminder_fields: dashboardReminderFields,
          confidence: dashboardRecurringReminderConf,
        },
        safety_resolution: {
          user_confirms_safe: safetyResolutionUserConfirmsSafe,
          stabilizing_signal: safetyResolutionStabilizingSignal,
          symptoms_still_present: safetyResolutionSymptomsStillPresent,
          external_help_mentioned: safetyResolutionExternalHelpMentioned,
          escalate_to_sentry: safetyResolutionEscalateToSentry,
          confidence: safetyResolutionConf,
        },
        safety_stabilization: {
          stabilizing_turn: safetyStabilizationTurn,
          confidence: safetyStabilizationConf,
        },
        // consent_to_relaunch: REMOVED (R2 simplification)
        wants_tools: false, // R2: always false, tool flows disabled
        risk_score: riskScore,
      },
      new_signals: newSignals,
      enrichments,
      machine_signals: machineSignals,
      deferred_enrichment: deferredEnrichment,
      model_used: dispatcherModel,
    };
  } catch (e) {
    console.error("[Dispatcher v2 contextual] JSON parse error:", e);
    const dispatcherModel =
      ((globalThis as any)?.Deno?.env?.get?.("GEMINI_DISPATCHER_MODEL") ?? "")
        .toString().trim() ||
      "gemini-2.5-flash";
    return {
      signals: { ...DEFAULT_SIGNALS },
      new_signals: [],
      enrichments: [],
      machine_signals: undefined,
      model_used: dispatcherModel,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEFERRED SIGNAL HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

type DeferredMachineType = string;

/**
 * Determine which machine type a signal would trigger (if any).
 * R2 simplification: always returns null (tool flow machines disabled).
 * Kept for backward compat with callers that check the return value.
 */
export function detectMachineTypeFromSignals(_signals: DispatcherSignals): {
  machine_type: DeferredMachineType;
  action_target?: string;
  summary_hint?: string;
} | null {
  // R2: All tool flow machines disabled. No machine detection needed.
  return null;
}

// R2 cleanup: detectMachineTypeFromSignals dead code removed (~140 lines).
// Compatibility shim: kept for legacy deferred helpers still present in codebase.
export function generateDeferredSignalSummary(args: {
  signals: DispatcherSignals;
  userMessage: string;
  machine_type: DeferredMachineType;
  action_target?: string;
}): string {
  const target = String(args.action_target ?? "").trim();
  const topicHint = String(args.signals.interrupt?.deferred_topic_formalized ?? "")
    .trim();
  const direct = String(args.userMessage ?? "").trim().slice(0, 120);
  const base = target || topicHint || direct || "sujet évoqué";
  return `${args.machine_type}: ${base}`.slice(0, 180);
}

/**
 * Check if a signal is a safety signal (sentry/firefighter).
 * These are the only signals that can interrupt active machines.
 */
export function isSafetySignal(signals: DispatcherSignals): boolean {
  return signals.safety.level === "SENTRY" ||
    signals.safety.level === "FIREFIGHTER";
}

/**
 * Check if a safety signal is high-confidence enough to interrupt.
 */
export function shouldInterruptForSafety(signals: DispatcherSignals): boolean {
  if (signals.safety.level === "SENTRY" && signals.safety.confidence >= 0.7) {
    return true;
  }
  if (
    signals.safety.level === "FIREFIGHTER" && signals.safety.confidence >= 0.75
  ) {
    return true;
  }
  return false;
}
