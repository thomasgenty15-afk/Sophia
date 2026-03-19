import { generateWithGemini, getGlobalAiModel } from "../../_shared/gemini.ts";
import {
  GLOBAL_MEMORY_TAXONOMY_PROMPT_BLOCK,
  isAllowedGlobalMemoryFullKey,
  isAllowedGlobalMemoryThemeKey,
} from "../global_memory.ts";
import {
  getSurfaceDefinition,
  isAllowedSurfaceId,
  SURFACE_REGISTRY_PROMPT_BLOCK,
  type SurfaceId,
} from "../surface_registry.ts";

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
  checkup_intent: {
    detected: boolean;
    confidence: number;
    trigger_phrase?: string;
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
    operation_hint?: "add" | "set";
    value_hint?: number;
    date_hint?: string;
  };
  track_progress_vital_sign: {
    detected: boolean;
    target_hint?: string;
    value_hint?: number;
    operation_hint?: "add" | "set";
    date_hint?: string;
  };
  track_progress_north_star: {
    detected: boolean;
    value_hint?: number;
    note_hint?: string;
    date_hint?: string;
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
     * coach.tone, coach.challenge_level, coach.talk_propensity,
     * coach.message_length, coach.question_tendency
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
  /** Brief description of the detected signal (max 100 chars) */
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
 * Machine-specific signals still consumed by router logic in R2.
 * Removed machine-specific branches stay out of the dispatcher schema.
 */
export interface MachineSignals {
  // Bilan stale continuation signals
  wants_to_continue_bilan?: boolean; // Implicit continuation after stale bilan (>4h)
  dont_want_continue_bilan?: boolean; // User switched topic / unrelated while stale bilan active
}

export type DispatcherResponseIntent =
  | "direct_answer"
  | "inventory"
  | "problem_solving"
  | "reflection"
  | "support"
  | "planning"
  | "tooling";

export type DispatcherReasoningComplexity = "low" | "medium" | "high";
export type DispatcherContextNeed = "minimal" | "targeted" | "broad" | "dossier";
export type DispatcherMemoryMode = "none" | "light" | "targeted" | "broad" | "dossier";
export type DispatcherModelTierHint = "lite" | "standard" | "deep";
export type DispatcherContextBudgetTier = "tiny" | "small" | "medium" | "large";
export type DispatcherMemoryTargetType =
  | "event"
  | "topic"
  | "global_subtheme"
  | "global_theme"
  | "core_identity";
export type DispatcherMemoryTimeScope =
  | "recent"
  | "all_time"
  | "specific_window";
export type DispatcherMemoryTargetPriority = "high" | "medium" | "low";
export type DispatcherMemoryRetrievalPolicy =
  | "force_taxonomy"
  | "taxonomy_first"
  | "semantic_first"
  | "semantic_only";
export type DispatcherMemoryExpansionPolicy =
  | "exact_only"
  | "add_supporting_topics"
  | "add_topics_and_events"
  | "expand_theme_subthemes";
export type DispatcherSurfaceMode =
  | "none"
  | "light"
  | "opportunistic"
  | "guided"
  | "push";
export type DispatcherSurfacePlanningHorizon =
  | "this_turn"
  | "watch_next_turns"
  | "multi_turn";
export type DispatcherSurfaceOpportunityType =
  | "utility"
  | "support"
  | "reflection"
  | "identity"
  | "habit"
  | "activation";
export type DispatcherSurfaceEvidenceWindow =
  | "current_turn"
  | "recent_turns"
  | "both";
export type DispatcherSurfacePersistenceHorizon =
  | "1_turn"
  | "3_turns"
  | "session";
export type DispatcherSurfaceCtaStyle = "none" | "soft" | "direct";
export type DispatcherSurfaceContentNeed =
  | "none"
  | "light"
  | "ranked"
  | "full";

export interface DispatcherMemoryTarget {
  type: DispatcherMemoryTargetType;
  key?: string;
  query_hint?: string;
  time_scope?: DispatcherMemoryTimeScope;
  priority: DispatcherMemoryTargetPriority;
  retrieval_policy: DispatcherMemoryRetrievalPolicy;
  expansion_policy: DispatcherMemoryExpansionPolicy;
  why?: string;
}

export interface DispatcherMemoryPlan {
  response_intent: DispatcherResponseIntent;
  reasoning_complexity: DispatcherReasoningComplexity;
  context_need: DispatcherContextNeed;
  memory_mode: DispatcherMemoryMode;
  model_tier_hint: DispatcherModelTierHint;
  context_budget_tier: DispatcherContextBudgetTier;
  targets: DispatcherMemoryTarget[];
  plan_confidence: number;
}

export interface DispatcherSurfaceCandidate {
  surface_id: SurfaceId;
  opportunity_type: DispatcherSurfaceOpportunityType;
  confidence: number;
  suggested_level: number;
  reason: string;
  evidence_window: DispatcherSurfaceEvidenceWindow;
  persistence_horizon: DispatcherSurfacePersistenceHorizon;
  cta_style: DispatcherSurfaceCtaStyle;
  content_need: DispatcherSurfaceContentNeed;
  content_query_hint?: string;
}

export interface DispatcherSurfacePlan {
  surface_mode: DispatcherSurfaceMode;
  planning_horizon: DispatcherSurfacePlanningHorizon;
  candidates: DispatcherSurfaceCandidate[];
  plan_confidence: number;
}

/**
 * Enhanced dispatcher output with new signals and enrichments.
 */
export interface DispatcherOutputV2 {
  /** Existing signals (backward compatible) */
  signals: DispatcherSignals;
  /** NEW: memory routing plan for later context selection/model choice */
  memory_plan: DispatcherMemoryPlan;
  /** NEW: surface opportunity plan for product feature pushes */
  surface_plan: DispatcherSurfacePlan;
  /** NEW: Signals detected on last turn only (not already in history) */
  new_signals: NewSignalEntry[];
  /** NEW: Enrichments for existing signals in history */
  enrichments: SignalEnrichment[];
  /** NEW: Machine-specific signals (only present if a machine is active) */
  machine_signals?: MachineSignals;
  /** Model used for dispatch analysis */
  model_used?: string;
}

export const DEFAULT_SIGNALS: DispatcherSignals = {
  safety: { level: "NONE", confidence: 0.9 },
  interrupt: { kind: "NONE", confidence: 0.9 },
  needs_explanation: { value: false, confidence: 0.9 },
  needs_research: { value: false, confidence: 0.9 },
  checkup_intent: { detected: false, confidence: 0.5 },
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

const RESPONSE_INTENTS = [
  "direct_answer",
  "inventory",
  "problem_solving",
  "reflection",
  "support",
  "planning",
  "tooling",
] as const;
const REASONING_COMPLEXITIES = ["low", "medium", "high"] as const;
const CONTEXT_NEEDS = ["minimal", "targeted", "broad", "dossier"] as const;
const MEMORY_MODES = ["none", "light", "targeted", "broad", "dossier"] as const;
const MODEL_TIER_HINTS = ["lite", "standard", "deep"] as const;
const CONTEXT_BUDGET_TIERS = ["tiny", "small", "medium", "large"] as const;
const MEMORY_TARGET_TYPES = [
  "event",
  "topic",
  "global_subtheme",
  "global_theme",
  "core_identity",
] as const;
const MEMORY_TIME_SCOPES = ["recent", "all_time", "specific_window"] as const;
const MEMORY_TARGET_PRIORITIES = ["high", "medium", "low"] as const;
const MEMORY_RETRIEVAL_POLICIES = [
  "force_taxonomy",
  "taxonomy_first",
  "semantic_first",
  "semantic_only",
] as const;
const MEMORY_EXPANSION_POLICIES = [
  "exact_only",
  "add_supporting_topics",
  "add_topics_and_events",
  "expand_theme_subthemes",
] as const;
const SURFACE_MODES = [
  "none",
  "light",
  "opportunistic",
  "guided",
  "push",
] as const;
const SURFACE_PLANNING_HORIZONS = [
  "this_turn",
  "watch_next_turns",
  "multi_turn",
] as const;
const SURFACE_OPPORTUNITY_TYPES = [
  "utility",
  "support",
  "reflection",
  "identity",
  "habit",
  "activation",
] as const;
const SURFACE_EVIDENCE_WINDOWS = [
  "current_turn",
  "recent_turns",
  "both",
] as const;
const SURFACE_PERSISTENCE_HORIZONS = [
  "1_turn",
  "3_turns",
  "session",
] as const;
const SURFACE_CTA_STYLES = ["none", "soft", "direct"] as const;
const SURFACE_CONTENT_NEEDS = ["none", "light", "ranked", "full"] as const;

export const DEFAULT_MEMORY_PLAN: DispatcherMemoryPlan = {
  response_intent: "direct_answer",
  reasoning_complexity: "low",
  context_need: "minimal",
  memory_mode: "none",
  model_tier_hint: "lite",
  context_budget_tier: "tiny",
  targets: [],
  plan_confidence: 0.5,
};

export const DEFAULT_SURFACE_PLAN: DispatcherSurfacePlan = {
  surface_mode: "none",
  planning_horizon: "watch_next_turns",
  candidates: [],
  plan_confidence: 0.35,
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
- checkup_intent (si l'utilisateur veut lancer le bilan maintenant, hors bilan actif)
- CRUD action intents (create/update/breakdown/activate/delete/deactivate) pour redirection dashboard
- dashboard_preferences_intent (si user veut modifier les préférences UX/UI Sophia)
- dashboard_recurring_reminder_intent (si user veut régler ses rendez-vous planifiés)
- risk_score (0-10)

IMPORTANT:
- Les signaux CRUD servent à COMPRENDRE l'intention et déclencher une redirection dashboard.
- Les 2 signaux dashboard_*_intent servent à orienter vers les bons écrans réglages dashboard.
- Si le besoin est que Sophia envoie un message planifié au bon moment, privilégie dashboard_recurring_reminder_intent.
- Si le besoin est que le user fasse une habitude ou une tâche récurrente lui-même, privilégie les intents CRUD d'action.
- Si un message contient à la fois du tracking et une demande CRUD: garde les DEUX familles de signaux.
- Tu ne décides jamais d'exécution d'outil ici.
`;

const TOOLS_SIGNALS_SECTION = `
=== SECTION TOOLS ===
Objectif: détecter les intentions de tracking exploitables par les outils, hors bilan comme en conversation normale.

REGLE DE CIBLE (CRITIQUE):
- Si le SNAPSHOT PLAN contient deja la cible exacte, recopie le TITRE EXACT du snapshot dans "target_hint".
- N'invente pas un synonyme si le snapshot fournit deja un titre canonique.
- Si plusieurs cibles du snapshot sont plausibles, mets "target_hint" a null.
- Si tu reconnais l'intention de tracking mais que la cible reste ambigue, garde detected=true et mets "target_hint" a null.
- "target_hint" doit idealement etre soit un titre exact du snapshot, soit null.

1) track_progress_action
- Cas: user dit avoir fait / raté / partiellement fait une action ou framework.
- Renseigne: detected + target_hint + status_hint (completed|missed|partial|unknown) + operation_hint + value_hint + date_hint.
- operation_hint:
  * "add" par defaut pour une validation ponctuelle ("j'ai fait", "j'ai raté")
  * "set" seulement si le user donne clairement une valeur absolue
- value_hint:
  * 1 pour "fait"
  * 0 pour "raté"
  * valeur numerique si explicite
- date_hint:
  * YYYY-MM-DD si une date est explicitement inferrable de façon fiable
  * sinon null
- Exemples:
  * "je viens de faire ma séance de sport" -> detected=true, status_hint=completed, operation_hint=add, value_hint=1
  * "j'ai raté la méditation hier" -> detected=true, status_hint=missed, operation_hint=add, value_hint=0

2) track_progress_vital_sign
- Cas: user donne une mesure d'un signe vital (sommeil, poids, humeur notée, etc.).
- Renseigne: detected + target_hint + value_hint (numérique) + operation_hint + date_hint.
- operation_hint:
  * "set" par defaut pour une mesure instantanee
  * "add" seulement si le user parle explicitement d'un cumul / increment
- Exemples:
  * "j'ai dormi 6h30" -> detected=true, target_hint="sommeil", value_hint=6.5, operation_hint=set
  * "mon stress est à 7" -> detected=true, target_hint="stress", value_hint=7, operation_hint=set

3) track_progress_north_star
- Cas: user donne une nouvelle valeur actuelle de son étoile polaire.
- Renseigne: detected + value_hint (numérique) + note_hint + date_hint.
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
  * coach.tone: soft | warm_direct | direct
  * coach.challenge_level: low | balanced | high
  * coach.talk_propensity: light | balanced | high
  * coach.message_length: short | medium | long
  * coach.question_tendency: low | normal | high
- Exemples:
  * "sois plus douce" -> coach.tone
  * "challenge-moi plus" -> coach.challenge_level
  * "sois moins bavarde" -> coach.talk_propensity
  * "fais plus court" -> coach.message_length
  * "pose moi moins de questions" -> coach.question_tendency

3) dashboard_recurring_reminder_intent (redirection Rendez-vous)
- Détecte quand le user veut configurer/éditer des rendez-vous planifiés où Sophia vient vers lui au bon moment.
- Renseigne "reminder_fields" avec les infos à paramétrer si présentes:
  * mode (daily|weekly|custom), days, time, timezone,
    channel (app|whatsapp), start_date, end_date, pause, message
- Exemples:
  * "fais-moi un rendez-vous tous les lundis à 8h" -> mode+days+time
  * "pause mes rendez-vous cette semaine" -> pause
  * "mets ce rendez-vous sur WhatsApp" -> channel
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
- Non-sticky: si le dernier message n'est PAS une demande factuelle web, mets needs_research.value=false
`;

const CHECKUP_INTENT_DETECTION_SECTION = `
=== DETECTION CHECKUP_INTENT ===
Detecte si l'utilisateur veut faire son BILAN maintenant (hors bilan actif).

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

const MEMORY_PLAN_SECTION = `
=== MEMORY PLAN (OBLIGATOIRE) ===
En plus de "signals", tu dois produire un objet "memory_plan" qui servira PLUS TARD a choisir:
- quelle memoire charger
- combien de contexte injecter
- quel tier de modele utiliser

Le memory_plan n'exécute rien. Il donne seulement un PLAN DE CONTEXTE.

1) CHAMPS OBLIGATOIRES
- response_intent: direct_answer | inventory | problem_solving | reflection | support | planning | tooling
- reasoning_complexity: low | medium | high
- context_need: minimal | targeted | broad | dossier
- memory_mode: none | light | targeted | broad | dossier
- model_tier_hint: lite | standard | deep
- context_budget_tier: tiny | small | medium | large
- targets: liste de cibles mémoire
- plan_confidence: 0..1

2) TYPES DE MEMOIRE
- event: fait ponctuel, date/contextualise, recent ou localise dans le temps
- topic: sujet concret ou dossier vivant (projet, personne, conflit, sujet recurrent)
- global_subtheme: dynamique durable ciblee dans la taxonomie globale
- global_theme: vue large sur plusieurs sous-themes d'un meme theme global
- core_identity: synthese identitaire lente et rare, JAMAIS memoire primaire

3) REGLES
- Si aucune memoire n'est utile: memory_mode=none et targets=[]
- Pour une question "que sais-tu sur..." / "resume moi..." / "dis-moi tout sur..." -> souvent inventory + global_theme
- Pour un probleme concret localise -> souvent problem_solving + global_subtheme puis topic en support
- Pour topic/event: si tu n'as pas de slug canonique fiable, mets key=null et utilise query_hint
- Pour global_subtheme: key DOIT etre une cle canonique complete "theme.sous_theme"
- Pour global_theme: key DOIT etre uniquement la cle du theme parent
- N'invente jamais une cle hors taxonomie
- core_identity doit rester rare et de priorite basse, seulement comme overlay identitaire
- Si le message est simple mais demande un gros inventaire memoire, mets reasoning_complexity bas/moyen mais context_need=broad ou dossier

4) TAXONOMIE GLOBALE AUTORISEE
${GLOBAL_MEMORY_TAXONOMY_PROMPT_BLOCK}

5) EXEMPLES
- "Qu'est-ce que tu sais sur ma psychologie ?" -> inventory + global_theme(psychologie)
- "Je galere avec mes relations au travail" -> problem_solving + global_subtheme(travail.relations_professionnelles)
- "J'ai mal dormi cette semaine" -> support + global_subtheme(sante.sommeil)
- "Aide-moi a repondre a ce message" -> souvent memory_mode=none ou light
- "Dis-moi tout ce que tu sais sur mon travail" -> inventory + global_theme(travail)
`;

const SURFACE_PLAN_SECTION = `
=== SURFACE PLAN (OBLIGATOIRE) ===
En plus de "memory_plan", tu dois produire un objet "surface_plan".

Le surface_plan sert a detecter UNE opportunite produit potentiellement utile.
Il ne force rien. Il signale juste quelle surface du produit pourrait etre poussee de maniere progressive.

1) CHAMPS OBLIGATOIRES
- surface_mode: none | light | opportunistic | guided | push
- planning_horizon: this_turn | watch_next_turns | multi_turn
- candidates: liste de candidats surface (0 a 2 max)
- plan_confidence: 0..1

2) SURFACES AUTORISEES
${SURFACE_REGISTRY_PROMPT_BLOCK}

3) REGLES
- N'invente jamais une surface hors registre.
- Maximum 2 candidats, et 1 seul candidat fort dans la plupart des cas.
- Le surface_plan sert a pousser une feature si elle est pertinente, PAS a remplacer la reponse immediate.
- Si le besoin est deja une redirection dashboard explicite via CRUD/preferences/rendez-vous, ne sur-pousse pas la meme surface ici.
- Les surfaces utility sont pour le dashboard. Les surfaces transformational sont pour Architecte.
- Pour une opportunite faible ou naissante, prefere suggested_level=1 ou 2.
- Reserve suggested_level=4 ou 5 aux cas explicites ou tres pertinents.

4) CHAMPS D'UN CANDIDAT
- surface_id: une cle canonique exacte du registre
- opportunity_type: utility | support | reflection | identity | habit | activation
- confidence: 0..1
- suggested_level: entier 1..5
- reason: texte court, concret
- evidence_window: current_turn | recent_turns | both
- persistence_horizon: 1_turn | 3_turns | session
- cta_style: none | soft | direct
- content_need: none | light | ranked | full
- content_query_hint: texte libre optionnel pour aider a recuperer du contenu interne pertinent

5) EXEMPLES
- "Je ne sais plus ou je vais en ce moment" -> dashboard.north_star
- "J'oublie toujours de ne pas fumer apres le dejeuner" -> dashboard.reminders ou dashboard.personal_actions selon le sens
- "J'aimerais que tu sois plus cash avec moi" -> dashboard.preferences
- "J'ai vecu un truc fort hier, je sais pas comment le raconter" -> architect.stories
- "J'ai une idee sur pourquoi les gens sabotent leur discipline" -> architect.reflections
- "J'ai envie d'une vie plus alignee avec ce qui m'attire" -> architect.wishlist
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
2. Si un signal est deja dans la liste ci-dessus: NE PAS le re-emettre dans "new_signals" (mais garde "signals" complet)
3. Tu PEUX enrichir le brief d'un signal existant si le dernier message apporte du contexte NOUVEAU
4. Enrichissement = mettre a jour le brief dans "enrichments", PAS creer un nouveau signal
5. Si l'utilisateur parle de la MEME action mais avec un contexte different, c'est un enrichissement
`;
}

function formatSignalHistoryInline(history: SignalHistoryEntry[]): string {
  if (!Array.isArray(history) || history.length === 0) return "";
  const lines = history
    .slice(-5)
    .map((h) => {
      const sig = String(h.signal_type ?? "").trim().slice(0, 40);
      if (!sig) return null;
      const target = String(h.action_target ?? "").trim().slice(0, 40);
      const brief = String(h.brief ?? "").trim().slice(0, 70);
      const parts = [`- ${sig}`];
      if (target) parts.push(`(${target})`);
      if (brief) parts.push(`: ${brief}`);
      return parts.join(" ");
    })
    .filter(Boolean);
  if (lines.length === 0) return "";
  return `\n=== SIGNAUX RECENTS (COURT) ===\n${lines.join("\n")}\n`;
}

function buildSignalsByTurnIndex(
  history: SignalHistoryEntry[],
): Map<number, SignalHistoryEntry[]> {
  const map = new Map<number, SignalHistoryEntry[]>();
  for (const h of history ?? []) {
    const idx = Number(h?.turn_index);
    if (!Number.isFinite(idx) || idx > 0 || idx < -10) continue;
    const current = map.get(idx) ?? [];
    if (current.length >= 3) continue;
    current.push(h);
    map.set(idx, current);
  }
  return map;
}

function formatSignalsForMessage(entries: SignalHistoryEntry[]): string {
  if (!entries || entries.length === 0) return "";
  const bits = entries
    .map((e) => {
      const sig = String(e.signal_type ?? "").trim().slice(0, 32);
      if (!sig) return null;
      const target = String(e.action_target ?? "").trim().slice(0, 28);
      return target ? `${sig}(${target})` : sig;
    })
    .filter(Boolean)
    .slice(0, 3);
  if (bits.length === 0) return "";
  return `\n  ↳ signaux(${bits.join(" | ")})`;
}

function buildContextMessagesWithSignals(
  last5Messages: Array<{ role: string; content: string }>,
  signalHistory: SignalHistoryEntry[],
): string {
  const signalsByTurn = buildSignalsByTurnIndex(signalHistory);
  let userTurnIdx = 0;
  const out: string[] = [];
  for (let i = last5Messages.length - 1; i >= 0; i--) {
    const m = last5Messages[i];
    const msgIndex = i - last5Messages.length + 1;
    const marker = msgIndex === 0 ? "[DERNIER - ANALYSER]" : `[Msg ${msgIndex}]`;
    let line = `${marker} ${m.role}: ${String(m.content ?? "").slice(0, 200)}`;
    if (String(m.role ?? "").toLowerCase() === "user") {
      const signalsForTurn = signalsByTurn.get(userTurnIdx) ?? [];
      line += formatSignalsForMessage(signalsForTurn);
      userTurnIdx -= 1;
    }
    out.push(line);
  }
  return out.reverse().join("\n");
}

function buildActionSnapshotSection(
  actionSnapshot?: DispatcherInputV2["actionSnapshot"],
): string {
  if (!Array.isArray(actionSnapshot) || actionSnapshot.length === 0) return "";
  const lines = actionSnapshot
    .slice(0, 20)
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
  return `\n=== SNAPSHOT PLAN (ACTIONS + VITALS + ETOILE POLAIRE) ===
Utilise ce snapshot pour les cibles de tracking et de discussion.
Si une cible correspond clairement, recopie exactement le titre du snapshot dans "target_hint" / "action_hint".
Si tu hesites entre plusieurs lignes, mets le hint a null plutot que d'inventer.
${lines.join("\n")}\n`;
}

function buildDispatcherStablePromptV1(): string {
  return `Tu es le Dispatcher de Sophia (V2 simplifie). Ton role est d'analyser le message utilisateur et produire des SIGNAUX structures.
${MOTHER_SIGNALS_SECTION}
${LAST_MESSAGE_PROTOCOL_SECTION}
${INTERRUPT_SECTION}
${NEEDS_EXPLANATION_SECTION}
${NEEDS_RESEARCH_SECTION}
${TOOLS_SIGNALS_SECTION}
${PLAN_SIGNALS_SECTION}
${MEMORY_PLAN_SECTION}
${SURFACE_PLAN_SECTION}`;
}

function buildDispatcherSemiStableSection(opts: {
  activeMachine: string | null;
  stateSnapshot: DispatcherInputV2["stateSnapshot"];
  lastAssistantMessage: string;
  flowContext?: FlowContext;
}): string {
  const {
    activeMachine,
    stateSnapshot,
    lastAssistantMessage,
    flowContext,
  } = opts;

  let prompt =
    `DERNIER MESSAGE ASSISTANT:
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

  if (!stateSnapshot.investigation_active) {
    prompt += CHECKUP_INTENT_DETECTION_SECTION;
  }

  prompt += buildMachineAddonWithContext(activeMachine, flowContext);
  return prompt;
}

function buildDispatcherVolatileSection(opts: {
  userMessage: string;
  last5Messages: Array<{ role: string; content: string }>;
  signalHistory: SignalHistoryEntry[];
  actionSnapshot?: DispatcherInputV2["actionSnapshot"];
}): string {
  const contextMessages = buildContextMessagesWithSignals(
    opts.last5Messages,
    opts.signalHistory,
  );

  return `${buildActionSnapshotSection(opts.actionSnapshot)}${
    formatSignalHistoryInline(opts.signalHistory)
  }${buildAntiDuplicationSection(opts.signalHistory)}

=== CONTEXTE DES 10 DERNIERS MESSAGES (5 TOURS) ===
${contextMessages}

=== MESSAGE A ANALYSER (dernier message utilisateur) ===
"${(opts.userMessage ?? "").slice(0, 500)}"`;
}

function simplePromptHash(input: string): string {
  let hash = 2166136261;
  const text = String(input ?? "");
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Flow context for enriching machine-specific addons.
 */
export interface FlowContext {
  /** For bilan (investigation): the current item being checked */
  currentItemTitle?: string;
  missedStreak?: number;
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

// R2 simplification: dispatcher machine addons are limited to safety + bilan only.

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
  userMessage: string;
  last5Messages: Array<{ role: string; content: string }>;
  signalHistory: SignalHistoryEntry[];
  stateSnapshot: DispatcherInputV2["stateSnapshot"];
  lastAssistantMessage: string;
  flowContext?: FlowContext;
  actionSnapshot?: DispatcherInputV2["actionSnapshot"];
}): {
  stablePrompt: string;
  semiStablePrompt: string;
  volatilePrompt: string;
  fullPrompt: string;
} {
  const {
    activeMachine,
    userMessage,
    last5Messages,
    stateSnapshot,
    lastAssistantMessage,
    flowContext,
    actionSnapshot,
  } = opts;

  const stablePrompt = buildDispatcherStablePromptV1();
  const semiStablePrompt = buildDispatcherSemiStableSection({
    activeMachine,
    stateSnapshot,
    lastAssistantMessage,
    flowContext,
  });
  const volatilePrompt = buildDispatcherVolatileSection({
    userMessage,
    last5Messages,
    signalHistory: opts.signalHistory,
    actionSnapshot,
  });
  const fullPrompt = `${stablePrompt}

${semiStablePrompt}

${volatilePrompt}`;

  return {
    stablePrompt,
    semiStablePrompt,
    volatilePrompt,
    fullPrompt,
  };
}

function readEnum<T extends readonly string[]>(
  raw: unknown,
  allowed: T,
  fallback: T[number],
): T[number] {
  const value = String(raw ?? "").trim().toLowerCase();
  return (allowed as readonly string[]).includes(value) ? value as T[number] : fallback;
}

function readMaybeString(raw: unknown, maxLen: number): string | undefined {
  if (typeof raw !== "string") return undefined;
  const value = raw.trim().slice(0, maxLen);
  return value.length > 0 ? value : undefined;
}

function clamp01(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function sanitizeDispatcherMemoryPlan(raw: unknown): DispatcherMemoryPlan {
  const row = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const targetsRaw = Array.isArray(row.targets) ? row.targets : [];
  const targets: DispatcherMemoryTarget[] = [];

  for (const targetRaw of targetsRaw.slice(0, 5)) {
    if (!targetRaw || typeof targetRaw !== "object") continue;
    const target = targetRaw as Record<string, unknown>;
    const type = readEnum(
      target.type,
      MEMORY_TARGET_TYPES,
      "topic",
    ) as DispatcherMemoryTargetType;
    const key = readMaybeString(target.key, 120);
    const queryHint = readMaybeString(target.query_hint, 140);
    const why = readMaybeString(target.why, 160);
    const timeScope = readEnum(
      target.time_scope,
      MEMORY_TIME_SCOPES,
      "all_time",
    ) as DispatcherMemoryTimeScope;
    const priority = readEnum(
      target.priority,
      MEMORY_TARGET_PRIORITIES,
      "medium",
    ) as DispatcherMemoryTargetPriority;
    const retrievalPolicy = readEnum(
      target.retrieval_policy,
      MEMORY_RETRIEVAL_POLICIES,
      type === "global_theme" ? "force_taxonomy" : "taxonomy_first",
    ) as DispatcherMemoryRetrievalPolicy;
    const expansionPolicy = readEnum(
      target.expansion_policy,
      MEMORY_EXPANSION_POLICIES,
      type === "global_theme" ? "expand_theme_subthemes" : "exact_only",
    ) as DispatcherMemoryExpansionPolicy;

    if (type === "global_subtheme") {
      if (!key || !isAllowedGlobalMemoryFullKey(key)) continue;
    } else if (type === "global_theme") {
      if (!key || !isAllowedGlobalMemoryThemeKey(key)) continue;
    } else if (type === "core_identity") {
      if (key && key !== "core_identity") continue;
    } else if (!key && !queryHint) {
      continue;
    }

    targets.push({
      type,
      key: key ?? (type === "core_identity" ? "core_identity" : undefined),
      query_hint: queryHint,
      time_scope: timeScope,
      priority,
      retrieval_policy: retrievalPolicy,
      expansion_policy: expansionPolicy,
      why,
    });
  }

  return {
    response_intent: readEnum(
      row.response_intent,
      RESPONSE_INTENTS,
      DEFAULT_MEMORY_PLAN.response_intent,
    ) as DispatcherResponseIntent,
    reasoning_complexity: readEnum(
      row.reasoning_complexity,
      REASONING_COMPLEXITIES,
      DEFAULT_MEMORY_PLAN.reasoning_complexity,
    ) as DispatcherReasoningComplexity,
    context_need: readEnum(
      row.context_need,
      CONTEXT_NEEDS,
      DEFAULT_MEMORY_PLAN.context_need,
    ) as DispatcherContextNeed,
    memory_mode: readEnum(
      row.memory_mode,
      MEMORY_MODES,
      DEFAULT_MEMORY_PLAN.memory_mode,
    ) as DispatcherMemoryMode,
    model_tier_hint: readEnum(
      row.model_tier_hint,
      MODEL_TIER_HINTS,
      DEFAULT_MEMORY_PLAN.model_tier_hint,
    ) as DispatcherModelTierHint,
    context_budget_tier: readEnum(
      row.context_budget_tier,
      CONTEXT_BUDGET_TIERS,
      DEFAULT_MEMORY_PLAN.context_budget_tier,
    ) as DispatcherContextBudgetTier,
    targets,
    plan_confidence: clamp01(
      row.plan_confidence,
      DEFAULT_MEMORY_PLAN.plan_confidence,
    ),
  };
}

export function sanitizeDispatcherSurfacePlan(raw: unknown): DispatcherSurfacePlan {
  const row = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const rawPlanConfidence = clamp01(
    row.plan_confidence,
    DEFAULT_SURFACE_PLAN.plan_confidence,
  );
  let surfaceMode = readEnum(
    row.surface_mode,
    SURFACE_MODES,
    DEFAULT_SURFACE_PLAN.surface_mode,
  ) as DispatcherSurfaceMode;
  const planningHorizon = readEnum(
    row.planning_horizon,
    SURFACE_PLANNING_HORIZONS,
    DEFAULT_SURFACE_PLAN.planning_horizon,
  ) as DispatcherSurfacePlanningHorizon;

  if (rawPlanConfidence < 0.55) {
    surfaceMode = "none";
  } else if (rawPlanConfidence < 0.72 && surfaceMode === "push") {
    surfaceMode = "guided";
  }

  const candidatesRaw = Array.isArray(row.candidates) ? row.candidates : [];
  const candidates: DispatcherSurfaceCandidate[] = [];

  if (surfaceMode === "none") {
    return {
      surface_mode: "none",
      planning_horizon: planningHorizon,
      candidates: [],
      plan_confidence: rawPlanConfidence,
    };
  }

  for (const candidateRaw of candidatesRaw.slice(0, 2)) {
    if (!candidateRaw || typeof candidateRaw !== "object") continue;
    const candidate = candidateRaw as Record<string, unknown>;
    const surfaceId = readMaybeString(candidate.surface_id, 80);
    const reason = readMaybeString(candidate.reason, 200);
    if (!surfaceId || !isAllowedSurfaceId(surfaceId) || !reason) continue;
    const surface = getSurfaceDefinition(surfaceId);
    if (!surface) continue;

    let suggestedLevel = clamp(
      Math.round(Number(candidate.suggested_level ?? 2)),
      1,
      surface.defaultLevelCap,
    );
    if (surfaceMode === "light") {
      suggestedLevel = Math.min(suggestedLevel, 2);
    } else if (surfaceMode === "opportunistic") {
      suggestedLevel = Math.min(suggestedLevel, 3);
    } else if (surfaceMode === "guided") {
      suggestedLevel = Math.min(suggestedLevel, 4);
    }

    let persistenceHorizon = readEnum(
      candidate.persistence_horizon,
      SURFACE_PERSISTENCE_HORIZONS,
      "3_turns",
    ) as DispatcherSurfacePersistenceHorizon;
    if (planningHorizon === "this_turn") {
      persistenceHorizon = "1_turn";
    } else if (
      planningHorizon === "watch_next_turns" &&
      persistenceHorizon === "session"
    ) {
      persistenceHorizon = "3_turns";
    }

    let ctaStyle = readEnum(
      candidate.cta_style,
      SURFACE_CTA_STYLES,
      "soft",
    ) as DispatcherSurfaceCtaStyle;
    if (suggestedLevel <= 2) {
      ctaStyle = "none";
    } else if (suggestedLevel === 3 && ctaStyle === "direct") {
      ctaStyle = "soft";
    }

    let contentNeed = readEnum(
      candidate.content_need,
      SURFACE_CONTENT_NEEDS,
      "light",
    ) as DispatcherSurfaceContentNeed;
    if (surface.contentSource === "none" || suggestedLevel <= 2) {
      contentNeed = "none";
    } else if (
      suggestedLevel === 3 &&
      (contentNeed === "ranked" || contentNeed === "full")
    ) {
      contentNeed = "light";
    }

    const contentQueryHint = contentNeed === "none"
      ? undefined
      : readMaybeString(candidate.content_query_hint, 140);

    candidates.push({
      surface_id: surfaceId,
      opportunity_type: readEnum(
        candidate.opportunity_type,
        SURFACE_OPPORTUNITY_TYPES,
        "support",
      ) as DispatcherSurfaceOpportunityType,
      confidence: clamp01(candidate.confidence, 0.5),
      suggested_level: suggestedLevel,
      reason,
      evidence_window: readEnum(
        candidate.evidence_window,
        SURFACE_EVIDENCE_WINDOWS,
        "current_turn",
      ) as DispatcherSurfaceEvidenceWindow,
      persistence_horizon: persistenceHorizon,
      cta_style: ctaStyle,
      content_need: contentNeed,
      content_query_hint: contentQueryHint,
    });
  }

  return {
    surface_mode: surfaceMode,
    planning_horizon: planningHorizon,
    candidates,
    plan_confidence: rawPlanConfidence,
  };
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
      memory_plan: { ...DEFAULT_MEMORY_PLAN },
      surface_plan: { ...DEFAULT_SURFACE_PLAN },
      new_signals: [],
      enrichments: [],
    };
  }

  // Build prompt blocks explicitly so the stable prefix can be cached later.
  const promptParts = buildDispatcherPromptV2({
    activeMachine: input.activeMachine,
    userMessage: input.userMessage,
    last5Messages: input.last5Messages,
    signalHistory: input.signalHistory,
    stateSnapshot: input.stateSnapshot,
    lastAssistantMessage: input.lastAssistantMessage,
    flowContext: input.flowContext,
    actionSnapshot: input.actionSnapshot,
  });

  // Add the full signal output specification
  const fullPrompt = `${promptParts.fullPrompt}

=== FORMAT DE SORTIE JSON ===
{
  "signals": {
    "safety": { "level": "string", "confidence": "number", "immediacy": "string" },
    "interrupt": { "kind": "string", "confidence": "number" },
    "needs_explanation": { "value": "boolean", "confidence": "number" },
    "needs_research": { "value": "boolean", "confidence": "number", "query": "string|null", "domain_hint": "string|null" },
    "checkup_intent": { "detected": "boolean", "confidence": "number", "trigger_phrase": "string|null" },
    "create_action": { "detected": "boolean" },
    "update_action": { "detected": "boolean" },
    "breakdown_action": { "detected": "boolean" },
    "track_progress_action": { "detected": "boolean", "target_hint": "string|null", "status_hint": "completed|missed|partial|unknown", "operation_hint": "add|set|null", "value_hint": "number|null", "date_hint": "YYYY-MM-DD|null" },
    "track_progress_vital_sign": { "detected": "boolean", "target_hint": "string|null", "value_hint": "number|null", "operation_hint": "add|set|null", "date_hint": "YYYY-MM-DD|null" },
    "track_progress_north_star": { "detected": "boolean", "value_hint": "number|null", "note_hint": "string|null", "date_hint": "YYYY-MM-DD|null" },
    "action_discussion": { "detected": "boolean", "action_hint": "string|null" },
    "activate_action": { "detected": "boolean" },
    "delete_action": { "detected": "boolean" },
    "deactivate_action": { "detected": "boolean" },
    "dashboard_preferences_intent": { "detected": "boolean", "preference_keys": ["string"], "confidence": "number" },
    "dashboard_recurring_reminder_intent": { "detected": "boolean", "reminder_fields": ["string"], "confidence": "number" },
    "risk_score": "number"
  },
  "memory_plan": {
    "response_intent": "direct_answer|inventory|problem_solving|reflection|support|planning|tooling",
    "reasoning_complexity": "low|medium|high",
    "context_need": "minimal|targeted|broad|dossier",
    "memory_mode": "none|light|targeted|broad|dossier",
    "model_tier_hint": "lite|standard|deep",
    "context_budget_tier": "tiny|small|medium|large",
    "targets": [
      {
        "type": "event|topic|global_subtheme|global_theme|core_identity",
        "key": "string|null",
        "query_hint": "string|null",
        "time_scope": "recent|all_time|specific_window|null",
        "priority": "high|medium|low",
        "retrieval_policy": "force_taxonomy|taxonomy_first|semantic_first|semantic_only",
        "expansion_policy": "exact_only|add_supporting_topics|add_topics_and_events|expand_theme_subthemes",
        "why": "string|null"
      }
    ],
    "plan_confidence": "number"
  },
  "surface_plan": {
    "surface_mode": "none|light|opportunistic|guided|push",
    "planning_horizon": "this_turn|watch_next_turns|multi_turn",
    "candidates": [
      {
        "surface_id": "string",
        "opportunity_type": "utility|support|reflection|identity|habit|activation",
        "confidence": "number",
        "suggested_level": "number",
        "reason": "string",
        "evidence_window": "current_turn|recent_turns|both",
        "persistence_horizon": "1_turn|3_turns|session",
        "cta_style": "none|soft|direct",
        "content_need": "none|light|ranked|full",
        "content_query_hint": "string|null"
      }
    ],
    "plan_confidence": "number"
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
    "dont_want_continue_bilan": "boolean|null"
  }
}

REGLES:
- "signals": contient l'analyse complete comme avant (backward compatible)
- "memory_plan": DOIT toujours etre present, meme si targets=[]
- "surface_plan": DOIT toujours etre present, meme si candidates=[]
- "new_signals": UNIQUEMENT pour les signaux detectes dans le DERNIER message qui ne sont PAS dans l'historique
- "enrichments": UNIQUEMENT pour mettre a jour le brief d'un signal existant avec du contexte NOUVEAU
- Ne pas re-emettre un signal deja dans l'historique!
- "signals" DOIT toujours etre complet, meme si "new_signals" est vide.
- "machine_signals": INCLURE UNIQUEMENT si une machine est active (voir SIGNAUX SPECIFIQUES ci-dessus)
- Tous les booleens doivent etre de vrais booleens JSON (true/false), jamais des strings.
- Si aucune machine n'est active: omets entierement "machine_signals".

Reponds UNIQUEMENT avec le JSON:`;

  try {
    console.log(JSON.stringify({
      tag: "dispatcher_prompt_cache_ready",
      request_id: meta?.requestId ?? null,
      stable_hash: simplePromptHash(promptParts.stablePrompt),
      semi_stable_hash: simplePromptHash(promptParts.semiStablePrompt),
      stable_chars: promptParts.stablePrompt.length,
      semi_stable_chars: promptParts.semiStablePrompt.length,
      volatile_chars: promptParts.volatilePrompt.length,
      full_chars: fullPrompt.length,
    }));
  } catch {
    // non-blocking
  }

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
    const memoryPlan = sanitizeDispatcherMemoryPlan(obj?.memory_plan);
    const surfacePlan = sanitizeDispatcherSurfacePlan(obj?.surface_plan);

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
    const checkupIntentDetected = Boolean(signalsObj?.checkup_intent?.detected);
    const checkupIntentConf = Math.max(
      0,
      Math.min(1, Number(signalsObj?.checkup_intent?.confidence ?? 0.5) || 0.5),
    );
    const checkupIntentTriggerPhrase =
      (typeof signalsObj?.checkup_intent?.trigger_phrase === "string" &&
          signalsObj.checkup_intent.trigger_phrase.trim())
        ? signalsObj.checkup_intent.trigger_phrase.trim().slice(0, 100)
        : undefined;

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
    const trackProgressActionOperationHintRaw = String(
      signalsObj?.track_progress_action?.operation_hint ?? "",
    ).toLowerCase();
    const trackProgressActionOperationHint =
      (["add", "set"] as const).includes(trackProgressActionOperationHintRaw as any)
        ? trackProgressActionOperationHintRaw as "add" | "set"
        : undefined;
    const trackProgressActionValueHint =
      (typeof signalsObj?.track_progress_action?.value_hint === "number" &&
          !isNaN(signalsObj.track_progress_action.value_hint))
        ? signalsObj.track_progress_action.value_hint
        : undefined;
    const trackProgressActionDateHint =
      (typeof signalsObj?.track_progress_action?.date_hint === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(signalsObj.track_progress_action.date_hint.trim()))
        ? signalsObj.track_progress_action.date_hint.trim()
        : undefined;
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
    const trackProgressVitalOperationHintRaw = String(
      signalsObj?.track_progress_vital_sign?.operation_hint ?? "",
    ).toLowerCase();
    const trackProgressVitalOperationHint =
      (["add", "set"] as const).includes(trackProgressVitalOperationHintRaw as any)
        ? trackProgressVitalOperationHintRaw as "add" | "set"
        : undefined;
    const trackProgressVitalDateHint =
      (typeof signalsObj?.track_progress_vital_sign?.date_hint === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(signalsObj.track_progress_vital_sign.date_hint.trim()))
        ? signalsObj.track_progress_vital_sign.date_hint.trim()
        : undefined;
    const trackProgressNorthStarDetected = Boolean(
      signalsObj?.track_progress_north_star?.detected,
    );
    const trackProgressNorthStarValueHint =
      (typeof signalsObj?.track_progress_north_star?.value_hint === "number" &&
          !isNaN(signalsObj.track_progress_north_star.value_hint))
        ? signalsObj.track_progress_north_star.value_hint
        : undefined;
    const trackProgressNorthStarNoteHint =
      (typeof signalsObj?.track_progress_north_star?.note_hint === "string" &&
          signalsObj.track_progress_north_star.note_hint.trim())
        ? signalsObj.track_progress_north_star.note_hint.trim().slice(0, 200)
        : undefined;
    const trackProgressNorthStarDateHint =
      (typeof signalsObj?.track_progress_north_star?.date_hint === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(signalsObj.track_progress_north_star.date_hint.trim()))
        ? signalsObj.track_progress_north_star.date_hint.trim()
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
      "coach.tone",
      "coach.challenge_level",
      "coach.talk_propensity",
      "coach.message_length",
      "coach.question_tendency",
    ]);
    const dashboardPreferenceKeys = dashboardPreferencesKeysRaw
      .map((v: unknown) => String(v ?? "").trim().toLowerCase())
      .filter((v: string) => dashboardPreferenceAllowed.has(v))
      .slice(0, 5);
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

      // Only include if there's at least one defined signal
      const hasAny = Object.values(machineSignals).some((v) => v !== undefined);
      if (!hasAny) machineSignals = undefined;
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
        checkup_intent: {
          detected: checkupIntentDetected,
          confidence: checkupIntentConf,
          trigger_phrase: checkupIntentTriggerPhrase,
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
          operation_hint: trackProgressActionOperationHint,
          value_hint: trackProgressActionValueHint,
          date_hint: trackProgressActionDateHint,
        },
        track_progress_vital_sign: {
          detected: trackProgressVitalDetected,
          target_hint: trackProgressVitalTargetHint,
          value_hint: trackProgressVitalValueHint,
          operation_hint: trackProgressVitalOperationHint,
          date_hint: trackProgressVitalDateHint,
        },
        track_progress_north_star: {
          detected: trackProgressNorthStarDetected,
          value_hint: trackProgressNorthStarValueHint,
          note_hint: trackProgressNorthStarNoteHint,
          date_hint: trackProgressNorthStarDateHint,
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
      memory_plan: memoryPlan,
      surface_plan: surfacePlan,
      new_signals: newSignals,
      enrichments,
      machine_signals: machineSignals,
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
      memory_plan: { ...DEFAULT_MEMORY_PLAN },
      surface_plan: { ...DEFAULT_SURFACE_PLAN },
      new_signals: [],
      enrichments: [],
      machine_signals: undefined,
      model_used: dispatcherModel,
    };
  }
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
