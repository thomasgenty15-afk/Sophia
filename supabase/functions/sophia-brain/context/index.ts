/**
 * Context Module - Modular context loading for Sophia agents
 * 
 * This module provides a profile-based context loading system that optimizes
 * the tokens sent to each agent by loading only what's needed.
 * 
 * ## Usage
 * 
 * ```typescript
 * import { loadContextForMode, buildContextString, getContextProfile } from "./context/index.ts"
 * 
 * const result = await loadContextForMode({
 *   supabase,
 *   userId,
 *   mode: "companion",
 *   message: userMessage,
 *   history,
 *   state,
 *   scope: "web",
 * })
 * 
 * const context = buildContextString(result.context)
 * console.log(`Loaded ${result.metrics.elements_loaded.length} elements, ~${result.metrics.estimated_tokens} tokens`)
 * ```
 * 
 * ## Token Savings by Mode
 * 
 * | Mode         | Before (tokens) | After (tokens) | Savings |
 * |--------------|-----------------|----------------|---------|
 * | Companion    | ~4000           | ~1200          | 70%     |
 * | Architect    | ~4500           | ~1500-3000     | 33-67%  |
 * | Firefighter  | ~4000           | ~600           | 85%     |
 * | Investigator | ~2500           | ~1500          | 40%     |
 * | Sentry       | 0               | 0              | -       |
 * 
 * ## Architecture
 * 
 * - `types.ts`: Context profiles and type definitions
 * - `loader.ts`: Main loading logic with parallel fetching
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
  getVectorResultsCount,
} from "./types.ts"

// Loader
export {
  loadContextForMode,
  buildContextString,
  type ContextLoaderOptions,
  type ContextLoadResult,
} from "./loader.ts"



