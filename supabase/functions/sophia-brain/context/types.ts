/**
 * Context Optimization Types
 * 
 * Ce module définit les profils de contexte par agent pour optimiser
 * les tokens envoyés aux LLM. Chaque agent a un profil qui spécifie
 * exactement quels éléments de contexte il nécessite.
 */

import type { AgentMode } from "../state-manager.ts"

/**
 * Profil de contexte pour un agent.
 * Définit quels éléments de contexte charger.
 */
export interface ContextProfile {
  /** Repères temporels (heure, jour, timezone) */
  temporal: boolean
  
  /** Métadonnées du plan (titre, deep_why, phase, status) - ~200 tokens */
  plan_metadata: boolean
  
  /** JSON complet du plan - lourd, à la demande uniquement */
  plan_json: boolean | "on_demand"
  
  /** Résumé des actions (titres + status) - ~100-300 tokens */
  actions_summary: boolean
  
  /** Détails complets des actions pour opérations */
  actions_details: boolean | "on_demand"
  
  /** Identité profonde (Temple) */
  identity: boolean
  
  /** Mémoires vectorielles (Forge/RAG) - "minimal" = 2-3 résultats */
  vectors: boolean | "minimal"
  
  /** User facts (préférences structurées) */
  facts: boolean
  
  /** Candidats de confirmation (user model) */
  candidates: boolean
  
  /** Fil rouge (short_term_context du Watcher) */
  short_term: boolean
  
  /** Nombre de messages d'historique à inclure */
  history_depth: number
  
  /** Signes vitaux */
  vitals: boolean
}

/**
 * Signaux du dispatcher qui peuvent déclencher le chargement "on_demand"
 */
export interface OnDemandTriggers {
  create_action_intent?: boolean
  update_action_intent?: boolean
  plan_discussion_intent?: boolean
  breakdown_recommended?: boolean
  topic_depth?: "shallow" | "medium" | "deep"
}

/**
 * Contexte chargé par le loader
 */
export interface LoadedContext {
  temporal?: string
  planMetadata?: string
  planJson?: string
  actionsSummary?: string
  actionsDetails?: string
  identity?: string
  vectors?: string
  facts?: string
  candidates?: string
  shortTerm?: string
  recentTurns?: string
  vitals?: string
  topicSession?: string
  checkupAddon?: string
  trackProgressAddon?: string
  deferredUserPref?: string
  injectedContext?: string
  expiredBilanContext?: string
  onboardingAddon?: string
}

/**
 * Métadonnées du plan (version légère)
 */
export interface PlanMetadata {
  id: string
  title: string | null
  status: string
  current_phase: number | null
  deep_why: string | null
  inputs_context: string | null
  inputs_blockers: string | null
  recraft_reason: string | null
}

/**
 * Profils de contexte par mode d'agent.
 * 
 * Principes:
 * - Companion: contexte conversationnel, pas besoin du plan JSON
 * - Architect: plan JSON seulement si opération détectée
 * - Firefighter: contexte minimal pour réponse rapide en crise
 * - Investigator: RAG spécifique à l'item en cours
 * - Sentry: zéro contexte, réponse déterministe
 */
export const CONTEXT_PROFILES: Partial<Record<AgentMode, ContextProfile>> = {
  companion: {
    temporal: true,
    plan_metadata: true,
    plan_json: false,
    actions_summary: true,
    actions_details: false,
    identity: false,
    vectors: true,
    facts: true,
    candidates: true,
    short_term: true,
    history_depth: 15,
    vitals: true,
  },
  
  architect: {
    temporal: true,
    plan_metadata: true,
    plan_json: "on_demand",
    actions_summary: true,
    actions_details: "on_demand",
    identity: false,
    vectors: true,
    facts: true,
    candidates: false,
    short_term: true,
    history_depth: 10,
    vitals: false,
  },
  
  firefighter: {
    temporal: true,
    plan_metadata: false,
    plan_json: false,
    actions_summary: false,
    actions_details: false,
    identity: false,
    vectors: "minimal",
    facts: false,
    candidates: false,
    short_term: true,
    history_depth: 5,
    vitals: false,
  },
  
  investigator: {
    temporal: true,
    plan_metadata: true,
    plan_json: false,
    actions_summary: true,
    actions_details: false,
    identity: false,
    vectors: false,  // RAG spécifique à l'item, géré par investigator/run.ts
    facts: false,
    candidates: false,
    short_term: false,
    history_depth: 15,
    vitals: true,
  },
  
  sentry: {
    temporal: false,
    plan_metadata: false,
    plan_json: false,
    actions_summary: false,
    actions_details: false,
    identity: false,
    vectors: false,
    facts: false,
    candidates: false,
    short_term: false,
    history_depth: 0,
    vitals: false,
  },
  
  // Modes avec profil minimal (pas de contexte lourd)
  dispatcher: {
    temporal: false,
    plan_metadata: false,
    plan_json: false,
    actions_summary: false,
    actions_details: false,
    identity: false,
    vectors: false,
    facts: false,
    candidates: false,
    short_term: false,
    history_depth: 5,
    vitals: false,
  },
  
  watcher: {
    temporal: false,
    plan_metadata: false,
    plan_json: false,
    actions_summary: false,
    actions_details: false,
    identity: false,
    vectors: false,
    facts: false,
    candidates: false,
    short_term: false,
    history_depth: 0,
    vitals: false,
  },
  
  assistant: {
    temporal: true,
    plan_metadata: false,
    plan_json: false,
    actions_summary: false,
    actions_details: false,
    identity: false,
    vectors: false,
    facts: false,
    candidates: false,
    short_term: false,
    history_depth: 5,
    vitals: false,
  },
  
  librarian: {
    temporal: false,
    plan_metadata: false,
    plan_json: false,
    actions_summary: false,
    actions_details: false,
    identity: false,
    vectors: true,
    facts: false,
    candidates: false,
    short_term: false,
    history_depth: 3,
    vitals: false,
  },
}

/**
 * Profil par défaut pour les modes non définis
 */
export const DEFAULT_CONTEXT_PROFILE: ContextProfile = {
  temporal: true,
  plan_metadata: false,
  plan_json: false,
  actions_summary: false,
  actions_details: false,
  identity: false,
  vectors: false,
  facts: false,
  candidates: false,
  short_term: false,
  history_depth: 5,
  vitals: false,
}

/**
 * Récupère le profil de contexte pour un mode donné
 */
export function getContextProfile(mode: AgentMode): ContextProfile {
  return CONTEXT_PROFILES[mode] ?? DEFAULT_CONTEXT_PROFILE
}

/**
 * Détermine si le plan JSON doit être chargé en fonction des signaux
 */
export function shouldLoadPlanJson(
  profile: ContextProfile,
  triggers?: OnDemandTriggers
): boolean {
  if (profile.plan_json === true) return true
  if (profile.plan_json === false) return false
  
  // "on_demand" - vérifier les triggers
  if (!triggers) return false
  
  return Boolean(
    triggers.create_action_intent ||
    triggers.update_action_intent ||
    triggers.plan_discussion_intent ||
    triggers.breakdown_recommended
  )
}

/**
 * Détermine si les détails des actions doivent être chargés
 */
export function shouldLoadActionsDetails(
  profile: ContextProfile,
  triggers?: OnDemandTriggers
): boolean {
  if (profile.actions_details === true) return true
  if (profile.actions_details === false) return false
  
  // "on_demand" - vérifier les triggers
  if (!triggers) return false
  
  return Boolean(
    triggers.create_action_intent ||
    triggers.update_action_intent ||
    triggers.breakdown_recommended
  )
}

/**
 * Nombre de résultats RAG selon le profil
 */
export function getVectorResultsCount(profile: ContextProfile): number {
  if (profile.vectors === false) return 0
  if (profile.vectors === "minimal") return 2
  return 5  // default pour true
}

