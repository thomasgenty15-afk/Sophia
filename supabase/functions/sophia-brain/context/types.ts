/**
 * Context Optimization Types
 *
 * Ce module définit les profils de contexte par agent pour optimiser
 * les tokens envoyés aux LLM. Chaque agent a un profil qui spécifie
 * exactement quels éléments de contexte il nécessite.
 */

import type { AgentMode } from "../state-manager.ts";

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
  plan_item_discussion_hint?: string;
  plan_feedback_detected?: boolean;
}

/**
 * Contexte chargé par le loader
 */
export interface LoadedContext {
  temporal?: string;
  rendezVousSummary?: string;
  northStarContext?: string;
  weeklyRecapContext?: string;
  planItemIndicators?: string;
  identity?: string;
  eventMemories?: string;
  globalMemories?: string;
  topicMemories?: string;
  facts?: string;
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
  dashboardRecurringReminderIntentAddon?: string;
  surfaceOpportunityAddon?: string;
  safetyActiveAddon?: string;
  deferredUserPref?: string;
  injectedContext?: string;
  expiredBilanContext?: string;
  onboardingAddon?: string;
  checkupNotTriggerableAddon?: string;
  bilanJustStoppedAddon?: string;
  defenseCardWinAddon?: string;
  defenseCardPendingTriggersAddon?: string;
}

/**
 * Profils de contexte par mode d'agent.
 *
 * Principes:
 * - Companion: contexte conversationnel le plus riche
 * - Investigator: focalisé sur le suivi guidé / bilan, sans mémoire durable large
 * - Dispatcher / watcher / sentry: contexte minimal ou nul
 */
export const CONTEXT_PROFILES: Partial<Record<ContextProfileMode, ContextProfile>> = {
  companion: {
    temporal: true,
    identity: true,
    event_memories: true,
    global_memories: true,
    topic_memories: true,
    facts: true,
    short_term: true,
    history_depth: 15,
  },

  investigator: {
    temporal: true,
    identity: false,
    event_memories: false,
    global_memories: false,
    topic_memories: false,
    facts: false,
    short_term: false,
    history_depth: 15,
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
    history_depth: 5,
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
