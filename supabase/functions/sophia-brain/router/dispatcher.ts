import type { AgentMode } from "../state-manager.ts";
import { generateWithGemini, getGlobalAiModel } from "../../_shared/gemini.ts";
import {
  normalizePendingResolutionSignal,
  type PendingResolutionSignal,
  type PendingResolutionType,
} from "./pending_resolution.ts";

// ═══════════════════════════════════════════════════════════════════════════════
// DISPATCHER V2: STRUCTURED SIGNALS
// Goal: IA interprets the turn → produces signals → Supervisor applies deterministic policy
// ═══════════════════════════════════════════════════════════════════════════════

export type SafetyLevel = "NONE" | "SENTRY";
export type InterruptKind =
  | "NONE"
  | "EXPLICIT_STOP"
  | "BORED"
  | "SWITCH_TOPIC"
  | "DIGRESSION";

export interface DispatcherSignals {
  safety: {
    level: SafetyLevel;
    confidence: number; // 0..1
    immediacy?: "acute" | "non_acute" | "unknown";
  };
  interrupt: {
    kind: InterruptKind;
    confidence: number; // 0..1
    /** If DIGRESSION or SWITCH_TOPIC, the formalized topic to defer (e.g., "la situation avec ton boss") */
    deferred_topic_formalized?: string | null;
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
  create_action: {
    detected: boolean;
  };
  update_action: {
    detected: boolean;
  };
  breakdown_action: {
    detected: boolean;
  };
  track_progress_action: {
    detected: boolean;
    target_hint?: string;
    status_hint?: "completed" | "missed" | "partial" | "unknown";
  };
  track_progress_vital_sign: {
    detected: boolean;
    target_hint?: string;
    value_hint?: number;
  };
  track_progress_north_star: {
    detected: boolean;
    value_hint?: number;
  };
  action_discussion: {
    detected: boolean;
    action_hint?: string;
  };
  activate_action: {
    detected: boolean;
  };
  delete_action: {
    detected: boolean;
  };
  deactivate_action: {
    detected: boolean;
  };
  dashboard_preferences_intent: {
    detected: boolean;
    /**
     * Preference keys user wants to change in dashboard settings.
     * Canonical keys expected by product:
     * coaching_style, chatty_level, question_tendency
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
  // deferred_signal: REMOVED (R2 simplification - deferred topics system disabled)
  // consent_to_relaunch: REMOVED (R2 simplification - relaunch consent system disabled)
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
  /** Lightweight snapshot of plan actions for better action-name detection */
  actionSnapshot?: Array<{
    title: string;
    status: "active" | "paused" | "completed" | "other";
    kind?: "action" | "framework" | "vital_sign" | "north_star";
    description?: string;
  }>;
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
  wants_to_continue_bilan?: boolean; // Implicit continuation after stale bilan (>4h)
  dont_want_continue_bilan?: boolean; // User switched topic / unrelated while stale bilan active
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
  interrupt: { kind: "NONE", confidence: 0.9 },
  needs_explanation: { value: false, confidence: 0.9 },
  needs_research: { value: false, confidence: 0.9 },
  create_action: {
    detected: false,
  },
  update_action: {
    detected: false,
  },
  breakdown_action: {
    detected: false,
  },
  track_progress_action: {
    detected: false,
    status_hint: "unknown",
  },
  track_progress_vital_sign: {
    detected: false,
  },
  track_progress_north_star: {
    detected: false,
  },
  action_discussion: {
    detected: false,
  },
  activate_action: {
    detected: false,
  },
  delete_action: {
    detected: false,
  },
  deactivate_action: {
    detected: false,
  },
  dashboard_preferences_intent: {
    detected: false,
    confidence: 0.5,
  },
  dashboard_recurring_reminder_intent: {
    detected: false,
    confidence: 0.5,
  },
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
- safety (NONE / SENTRY)
- interrupt (NONE / EXPLICIT_STOP / BORED / SWITCH_TOPIC / DIGRESSION)
- track_progress_action / track_progress_vital_sign / track_progress_north_star (section TOOLS)
- needs_explanation (si l'utilisateur demande d'expliquer / clarifier)
- needs_research (si question factuelle fraîche / web)
- CRUD action intents (create/update/breakdown/activate/delete/deactivate) pour redirection dashboard
- dashboard_preferences_intent (si user veut modifier les préférences UX/UI Sophia)
- dashboard_recurring_reminder_intent (si user veut régler ses rappels récurrents)
- risk_score (0-10)

IMPORTANT:
- Les signaux CRUD servent à COMPRENDRE l'intention et déclencher une redirection dashboard.
- Les 2 signaux dashboard_*_intent servent à orienter vers les bons écrans réglages dashboard.
- Tu ne décides jamais d'exécution d'outil ici.
`;

const TOOLS_SIGNALS_SECTION = `
=== SECTION TOOLS ===
Objectif: détecter les intentions de tracking exploitables par les outils, hors bilan comme en conversation normale.

1) track_progress_action
- Cas: user dit avoir fait / raté / partiellement fait une action ou framework.
- Renseigne: detected + target_hint + status_hint (completed|missed|partial|unknown).
- Exemples:
  * "je viens de faire ma séance de sport" -> detected=true, status_hint=completed
  * "j'ai raté la méditation hier" -> detected=true, status_hint=missed

2) track_progress_vital_sign
- Cas: user donne une mesure d'un signe vital (sommeil, poids, humeur notée, etc.).
- Renseigne: detected + target_hint + value_hint (numérique).
- Exemples:
  * "j'ai dormi 6h30" -> detected=true, target_hint="sommeil", value_hint=6.5
  * "mon stress est à 7" -> detected=true, target_hint="stress", value_hint=7

3) track_progress_north_star
- Cas: user donne une nouvelle valeur actuelle de son étoile polaire.
- Renseigne: detected + value_hint (numérique).
- Exemples:
  * "mon étoile polaire est à 42" -> detected=true, value_hint=42
`;

const PLAN_SIGNALS_SECTION = `
=== SECTION PLAN ===
=== DÉTECTION CRUD + ACTION_DISCUSSION (REDIRECTION DASHBOARD) ===
1) CRUD intents (pour redirection dashboard, pas exécution)
- create_action: le user veut créer/ajouter une nouvelle action
- update_action: modifier fréquence/jours/heure/titre
- breakdown_action: découper une action en micro-étape
- activate_action / deactivate_action / delete_action

Exemples:
- "je veux changer les jours de mon sport" -> update_action.detected=true
- "supprime cette action" -> delete_action.detected=true
- "active l'exercice respiration" -> activate_action.detected=true
- "je veux ajouter une nouvelle habitude" -> create_action.detected=true

1.ter) action_discussion (discussion sur une action existante)
- Détecte si le user parle d'une action existante du plan sans forcément demander une opération CRUD.
- Renseigne: action_discussion.detected + action_discussion.action_hint.
- Utilise le snapshot (actions, signes vitaux, étoile polaire) pour mieux reconnaître l'élément visé.
- Tolère de petites fautes d'orthographe/accents/pluriels sur le nom d'action.
- Exemples:
  * "ma medittion du soir me saoule" -> action_discussion.detected=true, action_hint="méditation du soir"
  * "pour mon sport je bloque" -> action_discussion.detected=true, action_hint="sport"
  * "je veux parler de mon plan" -> action_discussion.detected=false

1.bis) breakdown_action (SOS blocage) — REGLES FORTES
- Détecte breakdown_action seulement pour un BLOCAGE D'EXÉCUTION sur une action déjà existante (Plan de transformation OU Actions personnelles), avec notion d'échecs répétés / difficulté persistante.
- Déclencheurs typiques:
  * "je galère encore sur [action]", "j'arrive toujours pas à [action]", "je bloque depuis plusieurs jours"
  * "j'ai besoin d'une étape intermédiaire", "micro-étape", "plus simple" (sur action existante)
  * mention explicite "SOS blocage" + action identifiable
- Si la cible n'est pas parfaitement nommée mais qu'une action existante est clairement visée, mets breakdown_action.detected=true.
- Si aucune action existante n'est identifiable, breakdown_action.detected=false (laisser create_action/update_action/action_discussion selon le cas).
- IMPORTANT anti-faux-positifs:
  * NE PAS déclencher breakdown_action pour une crise/pulsion/urgence émotionnelle ("quand ça chauffe", "je vais craquer", etc.) sans action existante précise.
  * NE PAS déclencher breakdown_action pour une difficulté générale de vie non liée à une action.
- Exemples:
  * "j'arrive toujours pas à tenir mes 30 min de sport" -> breakdown_action.detected=true
  * "sur ma routine du soir je galère depuis une semaine" -> breakdown_action.detected=true
  * "quand je bloque sur une action je fais quoi ?" -> breakdown_action.detected=true
  * "quand ça chauffe le soir je fais quoi ?" -> breakdown_action.detected=false

2) dashboard_preferences_intent (redirection réglages UX/UI)
- Détecte quand le user veut changer ses préférences produit (pas une action du plan).
- Renseigne "preference_keys" avec les clés canoniques détectées parmi:
  * coaching_style: gentle | normal | challenging
  * chatty_level: light | normal | high
  * question_tendency: low | normal | high
- Exemples:
  * "sois plus challengeante" -> coaching_style
  * "sois moins bavarde" -> chatty_level
  * "pose moi moins de questions" -> question_tendency

3) dashboard_recurring_reminder_intent (redirection rappels récurrents)
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
`;

const CHECKUP_INTENT_DETECTION_SECTION = `
=== DETECTION CHECKUP_INTENT ===
Detecte si l'utilisateur veut faire son BILAN (checkup quotidien).

MOTS-CLES / EXPRESSIONS A DETECTER:
- Explicites: "bilan", "check", "checkup", "faire le point", "on check", "check du soir"
- Implicites: "comment ca s'est passe aujourd'hui", "je veux voir mes actions", "on fait le tour"
- Confirmation: "oui" apres proposition de bilan par Sophia ("tu veux qu'on fasse le bilan?")

ATTENTION - NE PAS CONFONDRE:
- "j'ai fait X" = track_progress_action, PAS checkup
- "je veux modifier mon plan" = update_action, PAS checkup
- Discussion sur une action specifique = PAS checkup
- "j'ai pas fait X" hors bilan = track_progress_action, PAS checkup
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

function buildActionSnapshotSection(
  actionSnapshot?: DispatcherInputV2["actionSnapshot"],
): string {
  if (!Array.isArray(actionSnapshot) || actionSnapshot.length === 0) return "";
  const lines = actionSnapshot
    .slice(0, 30)
    .map((a) => {
      const title = String(a?.title ?? "").trim().slice(0, 80);
      if (!title) return null;
      const status = String(a?.status ?? "other").trim().slice(0, 20) || "other";
      const kind = String(a?.kind ?? "action").trim().slice(0, 20) || "action";
      const description = String(a?.description ?? "").trim().slice(0, 140);
      return description
        ? `- [${kind}|${status}] ${title} — ${description}`
        : `- [${kind}|${status}] ${title}`;
    })
    .filter(Boolean);
  if (lines.length === 0) return "";
  return `\n=== SNAPSHOT PLAN (ACTIONS + VITALS + ETOILE POLAIRE) ===\n${lines.join("\n")}\n`;
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
  bilanStale?: boolean;
  bilanAgeHours?: number;
  bilanStaleAfterHours?: number;
  /** For safety flows (sentry): crisis context */
  isSafetyFlow?: boolean;
  safetyFlowType?: "sentry";
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
    const safetyType = flowContext.safetyFlowType ?? "sentry";
    const phase = flowContext.safetyPhase ?? "acute";
    const turnCount = flowContext.safetyTurnCount ?? 0;
    return `
=== SIGNAUX SPECIFIQUES (safety_${safetyType}_flow actif — phase: ${phase}) ===
Phase actuelle: ${phase} | Tour: ${turnCount}
Conserve le contexte safety actif et reste prudent tant que safety.level reste SENTRY.

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
    const bilanStale = flowContext.bilanStale === true;
    const bilanAgeHours = Number(flowContext.bilanAgeHours ?? 0);
    const staleAfterHours = Number(flowContext.bilanStaleAfterHours ?? 4);
    let addon = `
=== SIGNAUX SPECIFIQUES (bilan actif) ===
Item en cours: "${currentItem}"`;
    if (missedStreak > 0) {
      addon += `\nStreak de ratés: ${missedStreak} jours`;
    }
    if (bilanStale) {
      addon += `\nBilan stale: OUI (age ~${bilanAgeHours}h, seuil ${staleAfterHours}h)`;
      addon +=
        `\nSi le message répond à la question bilan en cours, mets "wants_to_continue_bilan": true.`;
      addon +=
        `\nSi le message lance un nouveau sujet (non lié à la question bilan), mets "dont_want_continue_bilan": true.`;
      addon +=
        `\nNe demande PAS de consentement explicite ici; classification implicite uniquement.`;
    } else {
      addon += `\nBilan stale: NON`;
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
  actionSnapshot?: DispatcherInputV2["actionSnapshot"];
}): string {
  const {
    activeMachine,
    stateSnapshot,
    lastAssistantMessage,
    flowContext,
    actionSnapshot,
  } =
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
  prompt += buildActionSnapshotSection(actionSnapshot);

  prompt += MOTHER_SIGNALS_SECTION;
  prompt += LAST_MESSAGE_PROTOCOL_SECTION;
  prompt += INTERRUPT_SECTION;
  prompt += NEEDS_EXPLANATION_SECTION;
  prompt += NEEDS_RESEARCH_SECTION;
  prompt += TOOLS_SIGNALS_SECTION;
  prompt += PLAN_SIGNALS_SECTION;

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
    actionSnapshot: input.actionSnapshot,
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
    "safety": { "level": "string", "confidence": "number", "immediacy": "string" },
    "interrupt": { "kind": "string", "confidence": "number" },
    "needs_explanation": { "value": "boolean", "confidence": "number" },
    "needs_research": { "value": "boolean", "confidence": "number", "query": "string|null", "domain_hint": "string|null" },
    "create_action": { "detected": "boolean" },
    "update_action": { "detected": "boolean" },
    "breakdown_action": { "detected": "boolean" },
    "track_progress_action": { "detected": "boolean", "target_hint": "string|null", "status_hint": "completed|missed|partial|unknown" },
    "track_progress_vital_sign": { "detected": "boolean", "target_hint": "string|null", "value_hint": "number|null" },
    "track_progress_north_star": { "detected": "boolean", "value_hint": "number|null" },
    "action_discussion": { "detected": "boolean", "action_hint": "string|null" },
    "activate_action": { "detected": "boolean" },
    "delete_action": { "detected": "boolean" },
    "deactivate_action": { "detected": "boolean" },
    "dashboard_preferences_intent": { "detected": "boolean", "preference_keys": ["string"], "confidence": "number" },
    "dashboard_recurring_reminder_intent": { "detected": "boolean", "reminder_fields": ["string"], "confidence": "number" },
    "risk_score": "number"
  },
  "new_signals": [
    { "signal_type": "string", "brief": "description max 100 chars", "confidence": "number", "action_target": "string|null" }
  ],
  "enrichments": [
    { "existing_signal_type": "string", "updated_brief": "new description with added context" }
  ],
  "machine_signals": {
    /* VOIR SECTION SIGNAUX SPECIFIQUES - inclure seulement si une machine est active */
    "wants_to_continue_bilan": "boolean|null",
    "dont_want_continue_bilan": "boolean|null",
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
      getGlobalAiModel("gemini-2.5-flash");
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
      (["NONE", "SENTRY"] as SafetyLevel[]).includes(
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

    // Parse plan CRUD/discussion signals (simplified: binary detection)
    const createActionDetected = Boolean(signalsObj?.create_action?.detected);
    const updateActionDetected = Boolean(signalsObj?.update_action?.detected);
    const breakdownActionDetected = Boolean(signalsObj?.breakdown_action?.detected);
    const trackProgressActionDetected = Boolean(signalsObj?.track_progress_action?.detected);
    const trackProgressActionTargetHint =
      (typeof signalsObj?.track_progress_action?.target_hint === "string" &&
          signalsObj.track_progress_action.target_hint.trim())
        ? signalsObj.track_progress_action.target_hint.trim().slice(0, 80)
        : undefined;
    const trackProgressActionStatusHintRaw = String(
      signalsObj?.track_progress_action?.status_hint ?? "unknown",
    ).toLowerCase();
    const trackProgressActionStatusHint =
      (["completed", "missed", "partial", "unknown"] as const).includes(
          trackProgressActionStatusHintRaw as any,
        )
        ? trackProgressActionStatusHintRaw as
          | "completed"
          | "missed"
          | "partial"
          | "unknown"
        : "unknown";
    const trackProgressVitalDetected = Boolean(
      signalsObj?.track_progress_vital_sign?.detected,
    );
    const trackProgressVitalTargetHint =
      (typeof signalsObj?.track_progress_vital_sign?.target_hint === "string" &&
          signalsObj.track_progress_vital_sign.target_hint.trim())
        ? signalsObj.track_progress_vital_sign.target_hint.trim().slice(0, 80)
        : undefined;
    const trackProgressVitalValueHint =
      (typeof signalsObj?.track_progress_vital_sign?.value_hint === "number" &&
          !isNaN(signalsObj.track_progress_vital_sign.value_hint))
        ? signalsObj.track_progress_vital_sign.value_hint
        : undefined;
    const trackProgressNorthStarDetected = Boolean(
      signalsObj?.track_progress_north_star?.detected,
    );
    const trackProgressNorthStarValueHint =
      (typeof signalsObj?.track_progress_north_star?.value_hint === "number" &&
          !isNaN(signalsObj.track_progress_north_star.value_hint))
        ? signalsObj.track_progress_north_star.value_hint
        : undefined;
    const actionDiscussionDetected = Boolean(
      signalsObj?.action_discussion?.detected,
    );
    const actionDiscussionHint =
      (typeof signalsObj?.action_discussion?.action_hint === "string" &&
          signalsObj.action_discussion.action_hint.trim())
        ? signalsObj.action_discussion.action_hint.trim().slice(0, 80)
        : undefined;
    const activateActionDetected = Boolean(signalsObj?.activate_action?.detected);
    const deleteActionDetected = Boolean(signalsObj?.delete_action?.detected);
    const deactivateActionDetected = Boolean(signalsObj?.deactivate_action?.detected);

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
      "coaching_style",
      "chatty_level",
      "question_tendency",
    ]);
    const dashboardPreferenceKeys = dashboardPreferencesKeysRaw
      .map((v: unknown) => String(v ?? "").trim().toLowerCase())
      .filter((v: string) => dashboardPreferenceAllowed.has(v))
      .slice(0, 3);
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
      if (ms.wants_to_continue_bilan !== undefined) {
        machineSignals.wants_to_continue_bilan = Boolean(
          ms.wants_to_continue_bilan,
        );
      }
      if (ms.dont_want_continue_bilan !== undefined) {
        machineSignals.dont_want_continue_bilan = Boolean(
          ms.dont_want_continue_bilan,
        );
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
        interrupt: {
          kind: interruptKind,
          confidence: interruptConf,
          deferred_topic_formalized:
            (interruptKind === "DIGRESSION" || interruptKind === "SWITCH_TOPIC")
              ? deferredTopicFormalized
              : undefined,
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
        create_action: {
          detected: createActionDetected,
        },
        update_action: {
          detected: updateActionDetected,
        },
        breakdown_action: {
          detected: breakdownActionDetected,
        },
        track_progress_action: {
          detected: trackProgressActionDetected,
          target_hint: trackProgressActionTargetHint,
          status_hint: trackProgressActionStatusHint,
        },
        track_progress_vital_sign: {
          detected: trackProgressVitalDetected,
          target_hint: trackProgressVitalTargetHint,
          value_hint: trackProgressVitalValueHint,
        },
        track_progress_north_star: {
          detected: trackProgressNorthStarDetected,
          value_hint: trackProgressNorthStarValueHint,
        },
        action_discussion: {
          detected: actionDiscussionDetected,
          action_hint: actionDiscussionHint,
        },
        activate_action: {
          detected: activateActionDetected,
        },
        delete_action: {
          detected: deleteActionDetected,
        },
        deactivate_action: {
          detected: deactivateActionDetected,
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
      getGlobalAiModel("gemini-2.5-flash");
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
 * Check if a signal is a safety signal (sentry).
 * These are the only signals that can interrupt active machines.
 */
export function isSafetySignal(signals: DispatcherSignals): boolean {
  return signals.safety.level === "SENTRY";
}

/**
 * Check if a safety signal is high-confidence enough to interrupt.
 */
export function shouldInterruptForSafety(signals: DispatcherSignals): boolean {
  if (signals.safety.level === "SENTRY" && signals.safety.confidence >= 0.7) {
    return true;
  }
  return false;
}
