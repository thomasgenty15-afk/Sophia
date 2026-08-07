/**
 * Context Optimization Types
 *
 * Ce module définit les profils de contexte par agent pour optimiser
 * les tokens envoyés aux LLM. Chaque agent a un profil qui spécifie
 * exactement quels éléments de contexte il nécessite.
 */

import type { AgentMode } from "../state-manager.ts";
import { RECENT_MESSAGE_LIMITS } from "./recent_messages_policy.ts";

type ContextProfileMode = AgentMode | "dispatcher" | "watcher";

/**
 * Profil de contexte pour un agent.
 * Définit quels éléments de contexte charger.
 */
export interface ContextProfile {
  /** Repères temporels (heure, jour, timezone) */
  temporal: boolean;

  /** Identité profonde (Temple) */
  identity: boolean;

  /** Topic memories (mémoire thématique vivante) */
  topic_memories: boolean;

  /** Global memories (sous-thèmes génériques durables) */
  global_memories: boolean;

  /** Event memories (événements spécifiques datés) */
  event_memories: boolean;

  /** User facts structurés pour personnaliser la forme de réponse */
  facts: boolean;

  /** Fil rouge synthétisé à partir des derniers échanges */
  short_term: boolean;

  /** Nombre de messages d'historique à inclure */
  history_depth: number;
}

/**
 * Signaux du dispatcher qui peuvent déclencher le chargement "on_demand"
 */
export interface OnDemandTriggers {
  plan_item_discussion_detected?: boolean;
  plan_item_discussion_hint?: string | null;
  plan_feedback_detected?: boolean;
}

/**
 * Contexte chargé par le loader
 *
 * Frontiere memoire:
 * - le dispatcher produit TurnFrame.memory_plan;
 * - le loader transforme ce plan en blocs concrets;
 * - les skills lisent ce LoadedContext sans charger/ecrire la memoire durable.
 */
export interface LoadedContext {
  temporal?: string;
  rendezVousSummary?: string;
  weeklyRecapContext?: string;
  dailyConversationPulseContext?: string;
  currentWeekPlanContext?: string;
  planItemIndicators?: string;
  memoryV2Payload?: string;
  identity?: string;
  eventMemories?: string;
  globalMemories?: string;
  topicMemories?: string;
  facts?: string;
  whatsappFilRouge?: string;
  shortTerm?: string;
  recentTurns?: string;
  trackProgressAddon?: string;
  momentumBlockersAddon?: string;
  coachingInterventionAddon?: string;
  planFeedbackAddon?: string;
  dashboardRedirectAddon?: string;
  dashboardCapabilitiesLiteAddon?: string;
  dashboardCapabilitiesAddon?: string;
  dashboardPreferencesIntentAddon?: string;
  surfaceOpportunityAddon?: string;
  deferredUserPref?: string;
  injectedContext?: string;
  expiredBilanContext?: string;
  onboardingAddon?: string;
  checkupNotTriggerableAddon?: string;
  bilanJustStoppedAddon?: string;
  /**
   * Résumé compact des effets durables en cours côté DB (carte d'attaque
   * active, carte de défense active, rappels ponctuels en attente,
   * préférences coach actives). Injecté en mode `companion` pour empêcher
   * le LLM d'halluciner "on n'a pas validé/créé X" alors que la DB confirme
   * X. Voir chantier 2 phase B, 2026-05-28.
   */
  durableEffectsSummary?: string;
  /**
   * Timeline compacte des effets persistés par l'EffectLedger sur les derniers
   * tours. Source d'exécution récente uniquement; l'état courant reste porté
   * par les tables métier.
   */
  recentEffectsSummary?: string;
  /**
   * P10-D (alex-hard24 R1-B05): segments explicitement rétractés en session
   * (« oublie ça »), nommés au composeur avec l'interdit de restitution —
   * renforcé P12-E (eva-hard25 R1-B05) en interdit de MENTION spontanée du
   * topic. Injecté de façon déterministe, sans dépendance LLM ni règle de
   * prompt.
   */
  retractedInSession?: string;
  /**
   * P12-E (alex-untested24 R1-B11): intentions mémoire explicites de la
   * session (« garde ça en tête »), pas encore consolidées par le batch
   * memorizer — servies au composeur pour qu'un récap in-session ne nie
   * jamais un fait confié quelques minutes plus tôt. Les intentions
   * rétractées en session sont exclues (croisement retraction_guard).
   */
  sessionMemoryIntents?: string;
}

/**
 * Profils de contexte par mode d'agent.
 *
 * Principes:
 * - Companion: contexte conversationnel le plus riche
 * - Dispatcher / watcher / sentry: contexte minimal ou nul
 */
export const CONTEXT_PROFILES: Partial<
  Record<ContextProfileMode, ContextProfile>
> = {
  companion: {
    temporal: true,
    identity: true,
    event_memories: true,
    global_memories: true,
    topic_memories: true,
    facts: true,
    short_term: true,
    history_depth: RECENT_MESSAGE_LIMITS.normalReplyContext,
  },

  sentry: {
    temporal: false,
    identity: false,
    event_memories: false,
    global_memories: false,
    topic_memories: false,
    facts: false,
    short_term: false,
    history_depth: 0,
  },

  // Modes avec profil minimal (pas de contexte lourd)
  dispatcher: {
    temporal: false,
    identity: false,
    event_memories: false,
    global_memories: false,
    topic_memories: false,
    facts: false,
    short_term: false,
    history_depth: RECENT_MESSAGE_LIMITS.dispatcher,
  },

  watcher: {
    temporal: false,
    identity: false,
    event_memories: false,
    global_memories: false,
    topic_memories: false,
    facts: false,
    short_term: false,
    history_depth: 0,
  },
};

/**
 * Profil par défaut pour les modes non définis
 */
export const DEFAULT_CONTEXT_PROFILE: ContextProfile = {
  temporal: true,
  identity: false,
  event_memories: false,
  global_memories: false,
  topic_memories: false,
  facts: false,
  short_term: false,
  history_depth: 5,
};

/**
 * Récupère le profil de contexte pour un mode donné
 */
export function getContextProfile(mode: AgentMode): ContextProfile {
  return CONTEXT_PROFILES[mode] ?? DEFAULT_CONTEXT_PROFILE;
}

/**
 * Détermine si le plan JSON doit être chargé en fonction des signaux
 */
export function shouldLoadActionsDetails(
  profile: ContextProfile,
  triggers?: OnDemandTriggers,
): boolean {
  return Boolean(
    profile && triggers &&
      (triggers.plan_item_discussion_detected ||
        triggers.plan_feedback_detected),
  );
}
