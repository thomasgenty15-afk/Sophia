/**
 * Context Module - Modular context loading for Sophia agents.
 *
 * The current system is profile-based: each agent mode declares the context
 * blocks it can load, and the loader assembles only the relevant ones.
 */

// Types
export type {
  ContextProfile,
  OnDemandTriggers,
  LoadedContext,
  PlanMetadata,
} from "./types.ts"

// Profile utilities
export {
  CONTEXT_PROFILES,
  DEFAULT_CONTEXT_PROFILE,
  getContextProfile,
  shouldLoadPlanJson,
  shouldLoadActionsDetails,
} from "./types.ts"

// Loader
export {
  loadContextForMode,
  buildContextString,
  type ContextLoaderOptions,
  type ContextLoadResult,
} from "./loader.ts"



