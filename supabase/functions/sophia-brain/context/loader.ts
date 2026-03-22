/**
 * Context Loader - Chargement modulaire du contexte par agent
 *
 * Ce module centralise le chargement du contexte pour tous les agents,
 * en utilisant les profils définis dans types.ts pour charger uniquement
 * ce qui est nécessaire.
 */

declare const Deno: any;

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { logMemoryObservabilityEvent } from "../../_shared/memory-observability.ts";
import type { AgentMode } from "../state-manager.ts";
import {
  formatActionsSummary,
  formatPlanJson,
  formatPlanMetadata,
  getActionDetailsByHint,
  getActionsDetails,
  getActionsSummary,
  getCoreIdentity,
  getPlanFullJson,
  getPlanMetadata,
  getVitalSignsContext,
  type PlanMetadataResult,
} from "../state-manager.ts";
import {
  formatUserProfileFactsForPrompt,
  getUserProfileFacts,
} from "../profile_facts.ts";
import {
  formatTopicMemoriesForPrompt,
  retrieveTopicMemories,
  type TopicSearchResult,
} from "../topic_memory.ts";
import {
  formatEventMemoriesForPrompt,
  retrieveEventMemories,
  type EventSearchResult,
} from "../event_memory.ts";
import {
  formatGlobalMemoriesForPrompt,
  retrieveGlobalMemories,
  retrieveGlobalMemoriesByFullKeys,
  retrieveGlobalMemoriesByThemes,
  type GlobalMemorySearchResult,
} from "../global_memory.ts";
import type { DispatcherMemoryPlan } from "../router/dispatcher.ts";
import type { SurfaceRuntimeAddon } from "../surface_state.ts";
import {
  getSurfaceDefinition,
} from "../surface_registry.ts";
// R2: getActiveTopicSession removed (topic sessions disabled)
import type {
  ContextProfile,
  LoadedContext,
  OnDemandTriggers,
} from "./types.ts";
import {
  getContextProfile,
  shouldLoadActionsDetails,
  shouldLoadPlanJson,
} from "./types.ts";
import {
  readMomentumState,
  summarizeMomentumBlockersForPrompt,
} from "../momentum_state.ts";
import { formatCoachingInterventionAddon } from "../coaching_intervention_selector.ts";

const IDENTITY_MAX_ITEMS = 2;
const IDENTITY_MAX_BLOCK_TOKENS = 280;

type DispatcherMemoryBudget = {
  globalThemeMax: number;
  explicitTopicQueriesMax: number;
  explicitEventQueriesMax: number;
  explicitTopicResultsPerQuery: number;
  explicitEventResultsPerQuery: number;
  semanticGlobalMax: number;
  semanticTopicMax: number;
  semanticEventMax: number;
};

type DispatcherMemoryLoadStrategy = {
  usePlan: boolean;
  skipAllMemory: boolean;
  loadIdentity: boolean;
  globalThemeKeys: string[];
  globalSubthemeKeys: string[];
  topicQueries: string[];
  eventQueries: string[];
  fallbackSemanticGlobalMax: number;
  fallbackSemanticTopicMax: number;
  fallbackSemanticEventMax: number;
  budget: DispatcherMemoryBudget;
};

const DISPATCHER_MEMORY_BUDGETS: Record<
  NonNullable<DispatcherMemoryPlan["context_budget_tier"]>,
  DispatcherMemoryBudget
> = {
  tiny: {
    globalThemeMax: 2,
    explicitTopicQueriesMax: 1,
    explicitEventQueriesMax: 1,
    explicitTopicResultsPerQuery: 1,
    explicitEventResultsPerQuery: 1,
    semanticGlobalMax: 1,
    semanticTopicMax: 1,
    semanticEventMax: 1,
  },
  small: {
    globalThemeMax: 3,
    explicitTopicQueriesMax: 1,
    explicitEventQueriesMax: 1,
    explicitTopicResultsPerQuery: 1,
    explicitEventResultsPerQuery: 1,
    semanticGlobalMax: 2,
    semanticTopicMax: 1,
    semanticEventMax: 1,
  },
  medium: {
    globalThemeMax: 4,
    explicitTopicQueriesMax: 2,
    explicitEventQueriesMax: 2,
    explicitTopicResultsPerQuery: 2,
    explicitEventResultsPerQuery: 1,
    semanticGlobalMax: 3,
    semanticTopicMax: 2,
    semanticEventMax: 2,
  },
  large: {
    globalThemeMax: 6,
    explicitTopicQueriesMax: 3,
    explicitEventQueriesMax: 2,
    explicitTopicResultsPerQuery: 2,
    explicitEventResultsPerQuery: 2,
    semanticGlobalMax: 4,
    semanticTopicMax: 3,
    semanticEventMax: 2,
  },
};

/**
 * Options pour le chargement du contexte
 */
export interface ContextLoaderOptions {
  supabase: SupabaseClient;
  userId: string;
  requestId?: string;
  channel?: "web" | "whatsapp";
  mode: AgentMode;
  message: string;
  history: any[];
  state: any;
  scope: string;
  tempMemory?: any;
  userTime?: { prompt_block?: string };
  triggers?: OnDemandTriggers;
  injectedContext?: string;
  deferredUserPrefContext?: string;
  memoryPlan?: DispatcherMemoryPlan;
}

/**
 * Résultat du chargement avec métriques
 */
export interface ContextLoadResult {
  context: LoadedContext;
  profile: ContextProfile;
  metrics: {
    elements_loaded: string[];
    load_ms: number;
    estimated_tokens: number;
  };
}

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const value = String(raw ?? "").trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function dedupeTopicResults(results: TopicSearchResult[]): TopicSearchResult[] {
  const byId = new Map<string, TopicSearchResult>();
  for (const row of results) {
    const id = String(row?.topic_id ?? "").trim();
    if (!id || byId.has(id)) continue;
    byId.set(id, row);
  }
  return [...byId.values()];
}

function dedupeEventResults(results: EventSearchResult[]): EventSearchResult[] {
  const byId = new Map<string, EventSearchResult>();
  for (const row of results) {
    const id = String(row?.event_id ?? "").trim();
    if (!id || byId.has(id)) continue;
    byId.set(id, row);
  }
  return [...byId.values()];
}

function dedupeGlobalResults(
  results: GlobalMemorySearchResult[],
): GlobalMemorySearchResult[] {
  const byId = new Map<string, GlobalMemorySearchResult>();
  for (const row of results) {
    const id = String(row?.id ?? "").trim();
    if (!id || byId.has(id)) continue;
    byId.set(id, row);
  }
  return [...byId.values()];
}

function summarizeTopicResults(
  results: TopicSearchResult[],
): Array<Record<string, unknown>> {
  return results.map((row) => ({
    topic_id: row.topic_id,
    slug: row.slug,
    title: row.title,
    keyword_matched: row.keyword_matched ?? null,
    keyword_similarity: row.keyword_similarity ?? null,
    synthesis_similarity: row.synthesis_similarity ?? null,
    title_similarity: row.title_similarity ?? null,
    mention_count: row.mention_count ?? null,
  }));
}

function summarizeEventResults(
  results: EventSearchResult[],
): Array<Record<string, unknown>> {
  return results.map((row) => ({
    event_id: row.event_id,
    event_key: row.event_key,
    title: row.title,
    event_type: row.event_type,
    status: row.status,
    starts_at: row.starts_at ?? null,
    event_similarity: row.event_similarity ?? null,
    confidence: row.confidence ?? null,
  }));
}

function summarizeGlobalResults(
  results: GlobalMemorySearchResult[],
): Array<Record<string, unknown>> {
  return results.map((row) => ({
    id: row.id,
    full_key: row.full_key,
    theme: row.theme,
    subtheme_key: row.subtheme_key,
    match_score: row.match_score ?? null,
    lexical_score: row.lexical_score ?? null,
    semantic_similarity: row.semantic_similarity ?? null,
    confidence: row.confidence ?? null,
  }));
}

function summarizeInjectedMemoryBlock(
  text: string | undefined,
  extra?: Record<string, unknown>,
): Record<string, unknown> | null {
  if (!text) return null;
  return {
    chars: text.length,
    preview: text.slice(0, 500),
    ...(extra ?? {}),
  };
}

export function deriveDispatcherMemoryLoadStrategy(params: {
  mode: AgentMode;
  profile: ContextProfile;
  message: string;
  memoryPlan?: DispatcherMemoryPlan | null;
}): DispatcherMemoryLoadStrategy {
  const plan = params.memoryPlan ?? null;
  const fallbackBudget = DISPATCHER_MEMORY_BUDGETS.small;

  if (!plan || params.mode !== "companion") {
    return {
      usePlan: false,
      skipAllMemory: false,
      loadIdentity: params.profile.identity,
      globalThemeKeys: [],
      globalSubthemeKeys: [],
      topicQueries: [],
      eventQueries: [],
      fallbackSemanticGlobalMax: 0,
      fallbackSemanticTopicMax: 0,
      fallbackSemanticEventMax: 0,
      budget: fallbackBudget,
    };
  }

  const budget = DISPATCHER_MEMORY_BUDGETS[plan.context_budget_tier] ??
    fallbackBudget;
  const skipAllMemory = plan.memory_mode === "none";
  const targets = Array.isArray(plan.targets) ? plan.targets : [];
  const globalThemeKeys = uniqueStrings(
    targets
      .filter((target) => target.type === "global_theme")
      .map((target) => target.key),
  );
  const globalSubthemeKeys = uniqueStrings(
    targets
      .filter((target) => target.type === "global_subtheme")
      .map((target) => target.key),
  );
  const topicQueries = uniqueStrings(
    targets
      .filter((target) => target.type === "topic")
      .map((target) => target.query_hint ?? target.key),
  );
  const eventQueries = uniqueStrings(
    targets
      .filter((target) => target.type === "event")
      .map((target) => target.query_hint ?? target.key),
  );
  const loadIdentity = !skipAllMemory &&
    targets.some((target) => target.type === "core_identity");
  const hasExplicitGlobalTargets = globalThemeKeys.length > 0 ||
    globalSubthemeKeys.length > 0;
  const wantsTopicSupport = targets.some((target) =>
    target.expansion_policy === "add_supporting_topics" ||
    target.expansion_policy === "add_topics_and_events"
  );
  const wantsEventSupport = targets.some((target) =>
    target.expansion_policy === "add_topics_and_events"
  );
  const nonInventoryIntent = plan.response_intent !== "inventory";
  const semanticFallbackAllowed = !skipAllMemory &&
    plan.context_need !== "minimal";

  return {
    usePlan: true,
    skipAllMemory,
    loadIdentity,
    globalThemeKeys,
    globalSubthemeKeys,
    topicQueries,
    eventQueries,
    fallbackSemanticGlobalMax:
      semanticFallbackAllowed && !hasExplicitGlobalTargets &&
        params.profile.global_memories
        ? budget.semanticGlobalMax
        : 0,
    fallbackSemanticTopicMax:
      params.profile.topic_memories &&
        (
            (semanticFallbackAllowed && !hasExplicitGlobalTargets &&
              nonInventoryIntent) ||
            (hasExplicitGlobalTargets && wantsTopicSupport)
          )
        ? budget.semanticTopicMax
        : 0,
    fallbackSemanticEventMax:
      params.profile.event_memories &&
        (
            (semanticFallbackAllowed && !hasExplicitGlobalTargets &&
              plan.context_need === "targeted" && nonInventoryIntent) ||
            (hasExplicitGlobalTargets && wantsEventSupport)
          )
        ? budget.semanticEventMax
        : 0,
    budget,
  };
}

/**
 * Charge le contexte pour un mode d'agent donné
 *
 * @example
 * const result = await loadContextForMode({
 *   supabase,
 *   userId,
 *   mode: "companion",
 *   message: userMessage,
 *   history,
 *   state,
 *   scope: "web",
 *   triggers: dispatcherSignals,
 * })
 */
export async function loadContextForMode(
  opts: ContextLoaderOptions,
): Promise<ContextLoadResult> {
  const startTime = Date.now();
  const profile = getContextProfile(opts.mode);
  const memoryStrategy = deriveDispatcherMemoryLoadStrategy({
    mode: opts.mode,
    profile,
    message: opts.message,
    memoryPlan: opts.memoryPlan,
  });
  const context: LoadedContext = {};
  const elementsLoaded: string[] = [];
  let observedEventResults: EventSearchResult[] = [];
  let observedGlobalResults: GlobalMemorySearchResult[] = [];
  let observedTopicResults: TopicSearchResult[] = [];

  // Plan metadata (needed for planId in subsequent queries)
  let planMeta: PlanMetadataResult | null = null;

  // Parallel loading of independent elements
  const promises: Promise<void>[] = [];

  // 1. Plan metadata (light, ~200 tokens)
  if (
    profile.plan_metadata || profile.plan_json || profile.actions_summary ||
    profile.actions_details
  ) {
    promises.push(
      getPlanMetadata(opts.supabase, opts.userId).then((meta) => {
        planMeta = meta;
        if (profile.plan_metadata) {
          context.planMetadata = formatPlanMetadata(meta);
          elementsLoaded.push("plan_metadata");
        }
      }),
    );
  }

  // 1b. North Star context (on-demand to keep prompt lean)
  const shouldInjectNorthStar = shouldInjectNorthStarContext({
    mode: opts.mode,
    message: opts.message,
    tempMemory: opts.tempMemory,
  });
  if (shouldInjectNorthStar) {
    promises.push(
      loadNorthStarContext(opts.supabase, opts.userId).then((block) => {
        if (block) {
          context.northStarContext = block;
          elementsLoaded.push("north_star_context");
        }
      }),
    );
  }

  const shouldInjectWeeklyRecap = shouldInjectWeeklyRecapContext({
    mode: opts.mode,
    state: opts.state,
  });
  if (shouldInjectWeeklyRecap) {
    promises.push(
      loadWeeklyRecapContext(opts.supabase, opts.userId).then((block) => {
        if (block) {
          context.weeklyRecapContext = block;
          elementsLoaded.push("weekly_recap_context");
        }
      }),
    );
  }

  // 2. Temporal context
  if (profile.temporal && opts.userTime?.prompt_block) {
    context.temporal =
      `=== REPÈRES TEMPORELS ===\n${opts.userTime.prompt_block}\n(Adapte tes salutations/conseils à ce moment de la journée)\n\n`;
    elementsLoaded.push("temporal");
  }

  // 2b. Rendez-vous configured in dashboard (inject only when explicitly relevant)
  if (shouldInjectRendezVousSummary(opts.mode, opts.message)) {
    promises.push(
      loadRendezVousSummary(opts.supabase, opts.userId).then((block) => {
        if (block) {
          context.rendezVousSummary = block;
          elementsLoaded.push("rendez_vous_summary");
        }
      }),
    );
  }

  // 3. Identity (Temple)
  if (profile.identity && !memoryStrategy.skipAllMemory && memoryStrategy.loadIdentity) {
    promises.push(
      getCoreIdentity(opts.supabase, opts.userId, {
        message: opts.message,
        maxItems: IDENTITY_MAX_ITEMS,
      }).then((identity) => {
        if (identity) {
          const block =
            `=== PILIERS DE L'IDENTITÉ (TEMPLE) ===\n${identity}\n\n`;
          context.identity = truncateToTokenEstimate(
            block,
            IDENTITY_MAX_BLOCK_TOKENS,
          );
          elementsLoaded.push("identity");
        }
      }),
    );
  }

  // 4. User facts
  if (profile.facts) {
    promises.push(
      getUserProfileFacts({
        supabase: opts.supabase,
        userId: opts.userId,
        scopes: ["global", opts.scope],
      }).then((factRows) => {
        const factsContext = formatUserProfileFactsForPrompt(
          factRows,
          opts.scope,
        );
        if (factsContext) {
          context.facts = `${factsContext}\n` +
            `=== CONSIGNE PERSONNALISATION FACTS ===\n` +
            `- Utilise ces facts comme support de connaissance pour personnaliser ton style de réponse.\n` +
            `- En priorité pour: ton du coach (coach.tone), niveau de challenge (coach.challenge_level), style de feedback (coach.feedback_style), propension à parler (coach.talk_propensity), longueur et format des messages (coach.message_length, coach.message_format), fréquence des questions (coach.question_tendency), focus principal (coach.primary_focus), personnalisation émotionnelle (coach.emotional_personalization).\n` +
            `- Des facts conversation.* historiques (ex: conversation.tone / conversation.verbosity / conversation.use_emojis) restent utilisables si présents.\n` +
            `- Ces facts orientent la forme de réponse (style/longueur), pas l'exécution d'actions.\n` +
            `- N'invente jamais un fact manquant; si absent, applique le style par défaut.\n\n`;
          elementsLoaded.push("facts");
        }
      }).catch((e) => {
        console.warn(
          "[ContextLoader] failed to load user_profile_facts (non-blocking):",
          e,
        );
      }),
    );
  }

  // 4b/4c/4d. Mémoire dynamique pilotée par memory_plan si disponible,
  // sinon fallback au comportement historique sémantique.
  if (memoryStrategy.usePlan) {
    const nowIsoForEvents = opts.userTime?.prompt_block
      ? String(
        opts.userTime.prompt_block.match(/now_utc=([^\n]+)/)?.[1] ?? "",
      )
      : undefined;

    if (
      profile.event_memories && !memoryStrategy.skipAllMemory &&
      (memoryStrategy.eventQueries.length > 0 ||
        memoryStrategy.fallbackSemanticEventMax > 0)
    ) {
      promises.push(
        (async () => {
          const eventResults: EventSearchResult[] = [];
          const explicitQueries = memoryStrategy.eventQueries.slice(
            0,
            memoryStrategy.budget.explicitEventQueriesMax,
          );
          if (explicitQueries.length > 0) {
            const batches = await Promise.all(
              explicitQueries.map((query) =>
                retrieveEventMemories({
                  supabase: opts.supabase,
                  userId: opts.userId,
                  message: query,
                  nowIso: nowIsoForEvents,
                  maxResults: memoryStrategy.budget.explicitEventResultsPerQuery,
                  requestId: opts.requestId,
                })
              ),
            );
            eventResults.push(...batches.flat());
          }
          if (
            eventResults.length === 0 && memoryStrategy.fallbackSemanticEventMax > 0 &&
            opts.message
          ) {
            eventResults.push(
              ...await retrieveEventMemories({
                supabase: opts.supabase,
                userId: opts.userId,
                message: opts.message,
                nowIso: nowIsoForEvents,
                maxResults: memoryStrategy.fallbackSemanticEventMax,
                requestId: opts.requestId,
              }),
            );
          }

          const dedupedEvents = dedupeEventResults(eventResults);
          observedEventResults = dedupedEvents;
          await logMemoryObservabilityEvent({
            supabase: opts.supabase,
            userId: opts.userId,
            requestId: opts.requestId,
            channel: opts.channel,
            scope: opts.scope,
            sourceComponent: "context_loader",
            eventName: "retrieval.event_completed",
            payload: {
              strategy: "memory_plan",
              explicit_queries: explicitQueries,
              fallback_semantic_max: memoryStrategy.fallbackSemanticEventMax,
              now_iso: nowIsoForEvents ?? null,
              results: summarizeEventResults(dedupedEvents),
            },
          });

          const eventContext = formatEventMemoriesForPrompt(dedupedEvents);
          if (eventContext) {
            context.eventMemories = eventContext;
            elementsLoaded.push("event_memories_planned");
          }
        })().catch((e) => {
          console.warn(
            "[ContextLoader] failed to load planned event_memories (non-blocking):",
            e,
          );
        }),
      );
    }

    if (
      profile.global_memories && !memoryStrategy.skipAllMemory &&
      (
        memoryStrategy.globalThemeKeys.length > 0 ||
        memoryStrategy.globalSubthemeKeys.length > 0 ||
        memoryStrategy.fallbackSemanticGlobalMax > 0
      )
    ) {
      promises.push(
        (async () => {
          const explicitGlobal: GlobalMemorySearchResult[] = [];
          if (memoryStrategy.globalSubthemeKeys.length > 0) {
            explicitGlobal.push(
              ...await retrieveGlobalMemoriesByFullKeys({
                supabase: opts.supabase,
                userId: opts.userId,
                fullKeys: memoryStrategy.globalSubthemeKeys,
              }),
            );
          }
          if (memoryStrategy.globalThemeKeys.length > 0) {
            explicitGlobal.push(
              ...await retrieveGlobalMemoriesByThemes({
                supabase: opts.supabase,
                userId: opts.userId,
                themes: memoryStrategy.globalThemeKeys,
                maxResults: memoryStrategy.budget.globalThemeMax *
                  Math.max(1, memoryStrategy.globalThemeKeys.length),
              }),
            );
          }

          let globalResults = dedupeGlobalResults(explicitGlobal);
          if (
            globalResults.length === 0 &&
            memoryStrategy.fallbackSemanticGlobalMax > 0 &&
            opts.message
          ) {
            globalResults = await retrieveGlobalMemories({
              supabase: opts.supabase,
              userId: opts.userId,
              message: opts.message,
              maxResults: memoryStrategy.fallbackSemanticGlobalMax,
              requestId: opts.requestId,
            });
          }

          observedGlobalResults = globalResults;
          await logMemoryObservabilityEvent({
            supabase: opts.supabase,
            userId: opts.userId,
            requestId: opts.requestId,
            channel: opts.channel,
            scope: opts.scope,
            sourceComponent: "context_loader",
            eventName: "retrieval.global_completed",
            payload: {
              strategy: "memory_plan",
              explicit_theme_keys: memoryStrategy.globalThemeKeys,
              explicit_subtheme_keys: memoryStrategy.globalSubthemeKeys,
              fallback_semantic_max: memoryStrategy.fallbackSemanticGlobalMax,
              results: summarizeGlobalResults(globalResults),
            },
          });

          const globalContext = formatGlobalMemoriesForPrompt(globalResults);
          if (globalContext) {
            context.globalMemories = globalContext;
            elementsLoaded.push("global_memories_planned");
          }
        })().catch((e) => {
          console.warn(
            "[ContextLoader] failed to load planned global_memories (non-blocking):",
            e,
          );
        }),
      );
    }

    if (
      profile.topic_memories && !memoryStrategy.skipAllMemory &&
      (memoryStrategy.topicQueries.length > 0 ||
        memoryStrategy.fallbackSemanticTopicMax > 0)
    ) {
      const topicDebug =
        (Deno.env.get("SOPHIA_TOPIC_DEBUG") ?? "").trim() === "1";
      promises.push(
        (async () => {
          const topicResults: TopicSearchResult[] = [];
          const explicitQueries = memoryStrategy.topicQueries.slice(
            0,
            memoryStrategy.budget.explicitTopicQueriesMax,
          );
          if (explicitQueries.length > 0) {
            const batches = await Promise.all(
              explicitQueries.map((query) =>
                retrieveTopicMemories({
                  supabase: opts.supabase,
                  userId: opts.userId,
                  message: query,
                  maxResults: memoryStrategy.budget.explicitTopicResultsPerQuery,
                  meta: { requestId: opts.requestId },
                })
              ),
            );
            topicResults.push(...batches.flat());
          }
          if (
            topicResults.length === 0 && memoryStrategy.fallbackSemanticTopicMax > 0 &&
            opts.message
          ) {
            topicResults.push(
              ...await retrieveTopicMemories({
                supabase: opts.supabase,
                userId: opts.userId,
                message: opts.message,
                maxResults: memoryStrategy.fallbackSemanticTopicMax,
                meta: { requestId: opts.requestId },
              }),
            );
          }

          const dedupedTopics = dedupeTopicResults(topicResults);
          observedTopicResults = dedupedTopics;
          await logMemoryObservabilityEvent({
            supabase: opts.supabase,
            userId: opts.userId,
            requestId: opts.requestId,
            channel: opts.channel,
            scope: opts.scope,
            sourceComponent: "context_loader",
            eventName: "retrieval.topic_completed",
            payload: {
              strategy: "memory_plan",
              explicit_queries: explicitQueries,
              fallback_semantic_max: memoryStrategy.fallbackSemanticTopicMax,
              results: summarizeTopicResults(dedupedTopics),
            },
          });
          const topicContext = formatTopicMemoriesForPrompt(dedupedTopics);
          if (topicContext) {
            context.topicMemories = topicContext;
            elementsLoaded.push("topic_memories_planned");
          } else if (topicDebug) {
            console.log(
              JSON.stringify({
                tag: "context_topic_memories_empty_planned",
                mode: opts.mode,
                user_id: opts.userId,
                message_preview: String(opts.message ?? "").slice(0, 120),
                topic_candidates: dedupedTopics.length,
                explicit_queries: explicitQueries,
                semantic_max: memoryStrategy.fallbackSemanticTopicMax,
              }),
            );
          }
        })().catch((e) => {
          console.warn(
            "[ContextLoader] failed to load planned topic_memories (non-blocking):",
            e,
          );
        }),
      );
    }
  } else {
    // 4b. Event memories (historical semantic fallback)
    if (profile.event_memories && opts.message) {
      promises.push(
        retrieveEventMemories({
          supabase: opts.supabase,
          userId: opts.userId,
          message: opts.message,
          nowIso: opts.userTime?.prompt_block
            ? String(
              opts.userTime.prompt_block.match(/now_utc=([^\n]+)/)?.[1] ?? "",
            )
            : undefined,
          maxResults: 2,
          requestId: opts.requestId,
        }).then((events) => {
          observedEventResults = events;
          return logMemoryObservabilityEvent({
            supabase: opts.supabase,
            userId: opts.userId,
            requestId: opts.requestId,
            channel: opts.channel,
            scope: opts.scope,
            sourceComponent: "context_loader",
            eventName: "retrieval.event_completed",
            payload: {
              strategy: "fallback_semantic",
              query: opts.message,
              results: summarizeEventResults(events),
            },
          }).then(() => events);
        }).then((events) => {
          const eventContext = formatEventMemoriesForPrompt(events);
          if (eventContext) {
            context.eventMemories = eventContext;
            elementsLoaded.push("event_memories");
          }
        }).catch((e) => {
          console.warn(
            "[ContextLoader] failed to load event_memories (non-blocking):",
            e,
          );
        }),
      );
    }

    // 4c. Global memories (historical semantic fallback)
    if (profile.global_memories && opts.message) {
      promises.push(
        retrieveGlobalMemories({
          supabase: opts.supabase,
          userId: opts.userId,
          message: opts.message,
          maxResults: 3,
          requestId: opts.requestId,
        }).then((memories) => {
          observedGlobalResults = memories;
          return logMemoryObservabilityEvent({
            supabase: opts.supabase,
            userId: opts.userId,
            requestId: opts.requestId,
            channel: opts.channel,
            scope: opts.scope,
            sourceComponent: "context_loader",
            eventName: "retrieval.global_completed",
            payload: {
              strategy: "fallback_semantic",
              query: opts.message,
              results: summarizeGlobalResults(memories),
            },
          }).then(() => memories);
        }).then((memories) => {
          const globalContext = formatGlobalMemoriesForPrompt(memories);
          if (globalContext) {
            context.globalMemories = globalContext;
            elementsLoaded.push("global_memories");
          }
        }).catch((e) => {
          console.warn(
            "[ContextLoader] failed to load global_memories (non-blocking):",
            e,
          );
        }),
      );
    }

    // 4d. Topic memories (historical semantic fallback)
    if (profile.topic_memories && opts.message) {
      const topicMaxResultsRaw =
        (Deno.env.get("SOPHIA_TOPIC_RETRIEVE_MAX_RESULTS") ?? "").trim();
      const topicMaxResultsParsed = Number(topicMaxResultsRaw);
      const topicMaxResults =
        Number.isFinite(topicMaxResultsParsed) && topicMaxResultsParsed >= 1
          ? Math.floor(topicMaxResultsParsed)
          : 3;
      const topicDebug =
        (Deno.env.get("SOPHIA_TOPIC_DEBUG") ?? "").trim() === "1";
      promises.push(
        retrieveTopicMemories({
          supabase: opts.supabase,
          userId: opts.userId,
          message: opts.message,
          maxResults: topicMaxResults,
          meta: { requestId: opts.requestId },
        }).then((topics) => {
          observedTopicResults = topics;
          return logMemoryObservabilityEvent({
            supabase: opts.supabase,
            userId: opts.userId,
            requestId: opts.requestId,
            channel: opts.channel,
            scope: opts.scope,
            sourceComponent: "context_loader",
            eventName: "retrieval.topic_completed",
            payload: {
              strategy: "fallback_semantic",
              query: opts.message,
              max_results: topicMaxResults,
              results: summarizeTopicResults(topics),
            },
          }).then(() => topics);
        }).then((topics) => {
          const topicContext = formatTopicMemoriesForPrompt(topics);
          if (topicContext) {
            context.topicMemories = topicContext;
            elementsLoaded.push("topic_memories");
          } else if (topicDebug) {
            console.log(
              JSON.stringify({
                tag: "context_topic_memories_empty",
                mode: opts.mode,
                user_id: opts.userId,
                message_preview: String(opts.message ?? "").slice(0, 120),
                topic_candidates: Array.isArray(topics) ? topics.length : 0,
                max_results: topicMaxResults,
              }),
            );
          }
        }).catch((e) => {
          console.warn(
            "[ContextLoader] failed to load topic_memories (non-blocking):",
            e,
          );
        }),
      );
    }
  }

  // Wait for plan metadata before loading dependent elements
  await Promise.all(promises);

  const planId = (planMeta as PlanMetadataResult | null)?.id ?? null;

  // 5. Plan JSON (heavy, on_demand)
  if (planId && shouldLoadPlanJson(profile, opts.triggers)) {
    const planContent = await getPlanFullJson(opts.supabase, planId);
    if (planContent) {
      context.planJson = formatPlanJson(planContent);
      elementsLoaded.push("plan_json");
    }
  }

  // 6. Actions summary or details
  if (planId) {
    let actionsDetailsLoaded = false;
    let actionsDetailsBlockedByAmbiguity = false;

    if (shouldLoadActionsDetails(profile, opts.triggers)) {
      const actionHint = String(opts.triggers?.action_discussion_hint ?? "")
        .trim();
      if (actionHint) {
        const targeted = await getActionDetailsByHint(
          opts.supabase,
          opts.userId,
          planId,
          actionHint,
        );
        if (targeted.status === "matched") {
          context.actionsDetails = targeted.details;
          elementsLoaded.push("actions_details_targeted");
          actionsDetailsLoaded = true;
        } else if (targeted.status === "ambiguous") {
          context.actionsDetails = `=== ACTION CIBLE AMBIGUE ===\n` +
            `Le message semble viser plusieurs actions proches: ${
              targeted.candidates.join(", ")
            }.\n` +
            `Demande une précision courte avant d'agir (ex: \"Tu parles de laquelle ?\").\n`;
          elementsLoaded.push("actions_details_ambiguous");
          actionsDetailsBlockedByAmbiguity = true;
        }
      }

      // Keep broad fallback for non-targeted operational requests.
      if (
        !actionsDetailsLoaded && !actionsDetailsBlockedByAmbiguity &&
        !actionHint
      ) {
        const actionsDetails = await getActionsDetails(
          opts.supabase,
          opts.userId,
          planId,
        );
        if (actionsDetails) {
          context.actionsDetails = actionsDetails;
          elementsLoaded.push("actions_details");
          actionsDetailsLoaded = true;
        }
      }
    }

    // Keep summary as fallback when targeted details are unavailable.
    if (profile.actions_summary && !actionsDetailsLoaded) {
      const actionsSummary = await getActionsSummary(
        opts.supabase,
        opts.userId,
        planId,
      );
      const formatted = formatActionsSummary(actionsSummary);
      if (formatted) {
        context.actionsSummary = formatted;
        elementsLoaded.push("actions_summary");
      }
    }

    // 6b. Lightweight coaching indicators (read-only)
    if (opts.mode === "companion" || opts.mode === "investigator") {
      const indicators = await loadActionIndicators(
        opts.supabase,
        opts.userId,
        planId,
      );
      if (indicators) {
        context.actionIndicators = indicators;
        elementsLoaded.push("action_indicators");
      }
    }
  }

  // 7. Vital signs
  if (profile.vitals) {
    const vitals = await getVitalSignsContext(opts.supabase, opts.userId);
    if (vitals) {
      context.vitals = vitals;
      elementsLoaded.push("vitals");
    }
  }

  // 8. Short-term context (fil rouge synthétisé)
  if (profile.short_term) {
    const shortTerm = (opts.state?.short_term_context ?? "").toString().trim();
    if (shortTerm) {
      context.shortTerm =
        `=== FIL ROUGE (CONTEXTE COURT TERME) ===\n${shortTerm}\n\n`;
      elementsLoaded.push("short_term");
    }
  }

  // 8b. Surface opportunity addon (feature push orchestration)
  const surfaceOpportunityAddon = (opts.tempMemory as any)
    ?.__surface_opportunity_addon as SurfaceRuntimeAddon | undefined;
  if (surfaceOpportunityAddon && opts.mode === "companion") {
    try {
      const block = await loadSurfaceOpportunityAddon({
        supabase: opts.supabase,
        userId: opts.userId,
        addon: surfaceOpportunityAddon,
        message: opts.message,
      });
      if (block) {
        context.surfaceOpportunityAddon = block;
        elementsLoaded.push("surface_opportunity_addon");
      }
    } catch (e) {
      console.warn(
        "[ContextLoader] failed to load surface opportunity addon (non-blocking):",
        e,
      );
    }
  }

  // 9. Recent turns (history)
  if (profile.history_depth > 0 && opts.history?.length) {
    const recentTurns = (opts.history ?? [])
      .slice(-profile.history_depth)
      .map((m: any) => {
        const role = String(m?.role ?? "").trim() || "unknown";
        const content = String(m?.content ?? "").trim().slice(0, 420);
        const ts = String((m as any)?.created_at ?? "").trim();
        return ts ? `[${ts}] ${role}: ${content}` : `${role}: ${content}`;
      })
      .join("\n");

    if (recentTurns) {
      context.recentTurns = `=== HISTORIQUE RÉCENT (${
        Math.min(profile.history_depth, opts.history.length)
      } DERNIERS MESSAGES) ===\n${recentTurns}\n\n`;
      elementsLoaded.push("recent_turns");
    }
  }

  // 10. Injected context (from UI modules)
  if (opts.injectedContext) {
    context.injectedContext =
      `=== CONTEXTE MODULE (UI) ===\n${opts.injectedContext}\n\n`;
    elementsLoaded.push("injected_context");
  }

  // 11. Deferred user pref context
  if (opts.deferredUserPrefContext) {
    context.deferredUserPref = opts.deferredUserPrefContext;
    elementsLoaded.push("deferred_user_pref");
  }

  // 12. Track progress addon (parallel tracking)
  const trackProgressAddon = (opts.tempMemory as any)
    ?.__track_progress_parallel;
  if (
    trackProgressAddon &&
    opts.mode === "companion"
  ) {
    context.trackProgressAddon = formatTrackProgressAddon(trackProgressAddon);
    if (context.trackProgressAddon) elementsLoaded.push("track_progress_addon");
  }

  if (
    opts.tempMemory &&
    (opts.mode === "companion" || opts.mode === "investigator")
  ) {
    context.momentumBlockersAddon = formatMomentumBlockersAddon(opts.tempMemory);
    if (context.momentumBlockersAddon) {
      elementsLoaded.push("momentum_blockers_addon");
    }
  }

  const coachingInterventionAddon = (opts.tempMemory as any)
    ?.__coaching_intervention_addon;
  if (
    coachingInterventionAddon &&
    opts.mode === "companion"
  ) {
    context.coachingInterventionAddon = formatCoachingInterventionAddon(
      coachingInterventionAddon,
    );
    if (context.coachingInterventionAddon) {
      elementsLoaded.push("coaching_intervention_addon");
    }
  }

  const dashboardRedirectAddon = (opts.tempMemory as any)
    ?.__dashboard_redirect_addon;
  const dashboardPreferencesIntentAddon = (opts.tempMemory as any)
    ?.__dashboard_preferences_intent_addon;
  const dashboardRecurringReminderIntentAddon = (opts.tempMemory as any)
    ?.__dashboard_recurring_reminder_intent_addon;
  const dashboardCapabilitiesAddon = (opts.tempMemory as any)
    ?.__dashboard_capabilities_addon;
  const hasSurfaceOpportunityAddon = Boolean(
    (opts.tempMemory as any)?.__surface_opportunity_addon,
  );

  // 13. Dashboard redirect addon (CRUD intent detected by dispatcher)
  if (
    dashboardRedirectAddon &&
    (opts.mode === "companion" || opts.mode === "investigator")
  ) {
    context.dashboardRedirectAddon = formatDashboardRedirectAddon(
      dashboardRedirectAddon,
    );
    if (context.dashboardRedirectAddon) {
      elementsLoaded.push("dashboard_redirect_addon");
    }
  }

  // 13b. Dashboard capabilities lite addon (only when no specific dashboard addon is active)
  const hasSpecificDashboardAddon = Boolean(
    dashboardRedirectAddon ||
      dashboardPreferencesIntentAddon ||
      dashboardRecurringReminderIntentAddon ||
      dashboardCapabilitiesAddon ||
      hasSurfaceOpportunityAddon,
  );
  if (
    (opts.mode === "companion" || opts.mode === "investigator") &&
    !hasSpecificDashboardAddon
  ) {
    context.dashboardCapabilitiesLiteAddon =
      formatDashboardCapabilitiesLiteAddon();
    if (context.dashboardCapabilitiesLiteAddon) {
      elementsLoaded.push("dashboard_capabilities_lite_addon");
    }
  }

  // 14. Safety active addon (dynamic tone/protocol guidance)
  const safetyActiveAddon = (opts.tempMemory as any)?.__safety_active_addon;
  if (
    safetyActiveAddon &&
    (opts.mode === "companion" || opts.mode === "investigator")
  ) {
    context.safetyActiveAddon = formatSafetyActiveAddon(safetyActiveAddon);
    if (context.safetyActiveAddon) elementsLoaded.push("safety_active_addon");
  }

  // 14b. Dashboard preferences intent addon (dedicated UX/UI settings redirect)
  if (
    dashboardPreferencesIntentAddon &&
    (opts.mode === "companion" || opts.mode === "investigator")
  ) {
    context.dashboardPreferencesIntentAddon =
      formatDashboardPreferencesIntentAddon(
        dashboardPreferencesIntentAddon,
      );
    if (context.dashboardPreferencesIntentAddon) {
      elementsLoaded.push("dashboard_preferences_intent_addon");
    }
  }

  // 14c. Dashboard recurring reminder intent addon (dedicated reminder settings redirect)
  if (
    dashboardRecurringReminderIntentAddon &&
    (opts.mode === "companion" || opts.mode === "investigator")
  ) {
    context.dashboardRecurringReminderIntentAddon =
      formatDashboardRecurringReminderIntentAddon(
        dashboardRecurringReminderIntentAddon,
      );
    if (context.dashboardRecurringReminderIntentAddon) {
      elementsLoaded.push("dashboard_recurring_reminder_intent_addon");
    }
  }

  // 14d. Dashboard capabilities addon (umbrella "can be related to dashboard")
  const shouldIncludeDashboardCapabilitiesAddon = Boolean(
    dashboardCapabilitiesAddon &&
      !dashboardRedirectAddon &&
      !dashboardPreferencesIntentAddon &&
      !dashboardRecurringReminderIntentAddon,
  );
  if (
    shouldIncludeDashboardCapabilitiesAddon &&
    (opts.mode === "companion" || opts.mode === "investigator")
  ) {
    context.dashboardCapabilitiesAddon = formatDashboardCapabilitiesAddon(
      dashboardCapabilitiesAddon,
    );
    if (context.dashboardCapabilitiesAddon) {
      elementsLoaded.push("dashboard_capabilities_addon");
    }
  }

  // 15. Lightweight onboarding addon — applies when __onboarding_active is set.
  const onboardingState = (opts.tempMemory as any)?.__onboarding_active;
  if (onboardingState && opts.mode === "companion") {
    context.onboardingAddon = formatOnboardingAddon(onboardingState);
    if (context.onboardingAddon) elementsLoaded.push("onboarding_addon");
  }

  // 16. Checkup intent addon (manual trigger requested, but bilan is cron-driven).
  const checkupNotTriggerableAddon = (opts.tempMemory as any)
    ?.__checkup_not_triggerable_addon;
  if (checkupNotTriggerableAddon && opts.mode === "companion") {
    context.checkupNotTriggerableAddon = formatCheckupNotTriggerableAddon(
      checkupNotTriggerableAddon,
    );
    if (context.checkupNotTriggerableAddon) {
      elementsLoaded.push("checkup_not_triggerable_addon");
    }
  }

  // 17. Bilan just stopped addon (one-shot guidance after explicit stop/bored).
  const bilanJustStopped = (opts.tempMemory as any)?.__bilan_just_stopped;
  if (bilanJustStopped && opts.mode === "companion") {
    context.bilanJustStoppedAddon = formatBilanJustStoppedAddon(
      bilanJustStopped,
    );
    if (context.bilanJustStoppedAddon) {
      elementsLoaded.push("bilan_just_stopped_addon");
    }
  }

  // Calculate metrics
  const totalLength = Object.values(context)
    .filter(Boolean)
    .reduce((sum, val) => sum + (val?.length ?? 0), 0);

  const loadMs = Date.now() - startTime;

  await logMemoryObservabilityEvent({
    supabase: opts.supabase,
    userId: opts.userId,
    requestId: opts.requestId,
    channel: opts.channel,
    scope: opts.scope,
    sourceComponent: "context_loader",
    eventName: "context.memory_injected",
    payload: {
      mode: opts.mode,
      elements_loaded: elementsLoaded,
      estimated_tokens: Math.ceil(totalLength / 4),
      memory_blocks: {
        identity: summarizeInjectedMemoryBlock(context.identity, {
          loaded: Boolean(context.identity),
        }),
        events: summarizeInjectedMemoryBlock(context.eventMemories, {
          loaded: Boolean(context.eventMemories),
          results: summarizeEventResults(observedEventResults),
        }),
        globals: summarizeInjectedMemoryBlock(context.globalMemories, {
          loaded: Boolean(context.globalMemories),
          results: summarizeGlobalResults(observedGlobalResults),
        }),
        topics: summarizeInjectedMemoryBlock(context.topicMemories, {
          loaded: Boolean(context.topicMemories),
          results: summarizeTopicResults(observedTopicResults),
        }),
      },
      surface_addon: summarizeInjectedMemoryBlock(
        context.surfaceOpportunityAddon,
        {
          loaded: Boolean(context.surfaceOpportunityAddon),
          surface_id: (opts.tempMemory as any)?.__surface_opportunity_addon
            ?.surface_id ?? null,
          level: (opts.tempMemory as any)?.__surface_opportunity_addon?.level ??
            null,
        },
      ),
    },
  });

  return {
    context,
    profile,
    metrics: {
      elements_loaded: elementsLoaded,
      load_ms: loadMs,
      estimated_tokens: Math.ceil(totalLength / 4),
    },
  };
}

/**
 * Assemble le contexte final en string pour le prompt
 */
export function buildContextString(loaded: LoadedContext): string {
  let ctx = "";

  // Order matters for prompt coherence
  if (loaded.deferredUserPref) ctx += loaded.deferredUserPref;
  if (loaded.injectedContext) ctx += loaded.injectedContext;
  if (loaded.rendezVousSummary) ctx += loaded.rendezVousSummary + "\n\n";
  if (loaded.temporal) ctx += loaded.temporal;
  if (loaded.facts) ctx += loaded.facts;
  if (loaded.shortTerm) ctx += loaded.shortTerm;
  if (loaded.recentTurns) ctx += loaded.recentTurns;
  if (loaded.planMetadata) ctx += loaded.planMetadata + "\n\n";
  if (loaded.northStarContext) ctx += loaded.northStarContext + "\n\n";
  if (loaded.weeklyRecapContext) ctx += loaded.weeklyRecapContext + "\n\n";
  if (loaded.planJson) ctx += loaded.planJson + "\n\n";
  if (loaded.actionsSummary) ctx += loaded.actionsSummary + "\n\n";
  if (loaded.actionIndicators) ctx += loaded.actionIndicators + "\n\n";
  if (loaded.actionsDetails) ctx += loaded.actionsDetails + "\n\n";
  if (loaded.vitals) ctx += loaded.vitals + "\n\n";
  if (loaded.identity) ctx += loaded.identity;
  if (loaded.eventMemories) ctx += loaded.eventMemories;
  if (loaded.globalMemories) ctx += loaded.globalMemories;
  if (loaded.topicMemories) ctx += loaded.topicMemories;
  if (loaded.surfaceOpportunityAddon) ctx += loaded.surfaceOpportunityAddon;
  if (loaded.onboardingAddon) ctx += loaded.onboardingAddon;
  if (loaded.trackProgressAddon) ctx += loaded.trackProgressAddon;
  if (loaded.momentumBlockersAddon) ctx += loaded.momentumBlockersAddon;
  if (loaded.coachingInterventionAddon) ctx += loaded.coachingInterventionAddon;
  if (loaded.dashboardRedirectAddon) ctx += loaded.dashboardRedirectAddon;
  if (loaded.dashboardCapabilitiesLiteAddon) {
    ctx += loaded.dashboardCapabilitiesLiteAddon;
  }
  if (loaded.dashboardPreferencesIntentAddon) {
    ctx += loaded.dashboardPreferencesIntentAddon;
  }
  if (loaded.dashboardRecurringReminderIntentAddon) {
    ctx += loaded.dashboardRecurringReminderIntentAddon;
  }
  if (loaded.dashboardCapabilitiesAddon) {
    ctx += loaded.dashboardCapabilitiesAddon;
  }
  if (loaded.safetyActiveAddon) ctx += loaded.safetyActiveAddon;
  if (loaded.expiredBilanContext) ctx += loaded.expiredBilanContext;
  if (loaded.checkupNotTriggerableAddon) {
    ctx += loaded.checkupNotTriggerableAddon;
  }
  if (loaded.bilanJustStoppedAddon) ctx += loaded.bilanJustStoppedAddon;

  return ctx.trim();
}

// ============================================================================
// Helper functions
// ============================================================================

function normalizeSurfaceRankText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreSurfaceText(text: string, query: string): number {
  const haystack = normalizeSurfaceRankText(text);
  const needle = normalizeSurfaceRankText(query);
  if (!needle) return 0;
  let score = 0;
  if (haystack.includes(needle)) score += 3;
  const tokens = needle.split(" ").filter((token) => token.length >= 3);
  for (const token of tokens) {
    if (haystack.includes(token)) score += 1;
  }
  return score;
}

function rankSurfaceItems<T>(
  items: T[],
  query: string,
  toText: (item: T) => string,
  limit: number,
): T[] {
  const ranked = [...items].sort((a, b) =>
    scoreSurfaceText(toText(b), query) - scoreSurfaceText(toText(a), query)
  );
  return ranked.slice(0, limit);
}

function describeSurfaceLevel(level: number): string {
  if (level <= 2) {
    return "Allusion légère seulement. Pas de gros bloc ni de CTA appuyé.";
  }
  if (level === 3) {
    return "Suggestion légère, naturelle, 1 phrase utile maximum.";
  }
  if (level === 4) {
    return "Bloc compact ou CTA clair si cela s'intègre naturellement.";
  }
  return "Mise en avant explicite autorisée si cela aide vraiment le user maintenant.";
}

function describeSurfaceCtaStyle(style: SurfaceRuntimeAddon["cta_style"]): string {
  if (style === "direct") {
    return "CTA direct autorisé si la surface colle vraiment au besoin.";
  }
  if (style === "soft") {
    return "Préférer une invitation douce plutôt qu'une injonction.";
  }
  return "Pas de CTA explicite. Rester dans une allusion ou une proposition implicite.";
}

async function loadPersonalActionsSurfaceSummary(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("user_personal_actions")
    .select("title,status,target_reps,current_reps")
    .eq("user_id", userId)
    .in("status", ["active", "pending", "completed", "deactivated"])
    .order("created_at", { ascending: false })
    .limit(6);
  if (error) return null;
  const rows = Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
  if (rows.length === 0) {
    return "- Aucune action personnelle configurée actuellement.\n";
  }
  const active = rows.filter((row) => {
    const status = String(row.status ?? "");
    return status === "active" || status === "pending";
  });
  const lines = [
    `- Actions personnelles connues: ${rows.length} (${active.length} actives/pending).`,
  ];
  for (const row of active.slice(0, 3)) {
    lines.push(
      `- ${String(row.title ?? "").trim().slice(0, 80)} | progression ${
        String(row.current_reps ?? 0)
      }/${String(row.target_reps ?? 1)}`,
    );
  }
  return `${lines.join("\n")}\n`;
}

async function loadPreferencesSurfaceSummary(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const keys = [
    "coach.tone",
    "coach.challenge_level",
    "coach.talk_propensity",
    "coach.message_length",
    "coach.question_tendency",
  ];
  const { data, error } = await supabase
    .from("user_profile_facts")
    .select("key,value")
    .eq("user_id", userId)
    .eq("scope", "global")
    .in("key", keys);
  if (error) return null;
  const rows = Array.isArray(data) ? data as Array<Record<string, any>> : [];
  if (rows.length === 0) {
    return "- Aucune préférence coach explicite enregistrée pour l'instant.\n";
  }
  const lines = rows.slice(0, 5).map((row) => {
    const label = String(row?.key ?? "").trim();
    const value = String(row?.value?.label ?? row?.value?.value ?? "")
      .trim()
      .slice(0, 60);
    return `- ${label}: ${value || "non défini"}`;
  });
  return `${lines.join("\n")}\n`;
}

async function loadWishlistSurfaceSummary(
  supabase: SupabaseClient,
  userId: string,
  query: string,
  limit: number,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("user_architect_wishes")
    .select("title,description,category,status,completed_at,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(12);
  if (error) return null;
  const rows = Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
  if (rows.length === 0) return null;
  const ranked = rankSurfaceItems(
    rows,
    query,
    (row) =>
      `${String(row.title ?? "")} ${String(row.description ?? "")} ${
        String(row.category ?? "")
      }`,
    limit,
  );
  const lines = ranked.map((row) =>
    `- ${String(row.title ?? "").trim().slice(0, 90)}${
      String(row.description ?? "").trim()
        ? ` — ${String(row.description ?? "").trim().slice(0, 120)}`
        : ""
    }`
  );
  return lines.length > 0 ? `${lines.join("\n")}\n` : null;
}

async function loadStoriesSurfaceSummary(
  supabase: SupabaseClient,
  userId: string,
  query: string,
  limit: number,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("user_architect_stories")
    .select("title,duration_label,bullet_points,speech_map,topic_tags,updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(12);
  if (error) return null;
  const rows = Array.isArray(data) ? data as Array<Record<string, any>> : [];
  if (rows.length === 0) return null;
  const ranked = rankSurfaceItems(
    rows,
    query,
    (row) =>
      `${String(row.title ?? "")} ${String(row.speech_map ?? "")} ${
        Array.isArray(row.topic_tags) ? row.topic_tags.join(" ") : ""
      } ${Array.isArray(row.bullet_points) ? row.bullet_points.join(" ") : ""}`,
    limit,
  );
  const lines = ranked.map((row) => {
    const title = String(row.title ?? "").trim().slice(0, 90);
    const tags = Array.isArray(row.topic_tags)
      ? row.topic_tags.slice(0, 4).join(", ")
      : "";
    return `- ${title}${tags ? ` | tags: ${tags}` : ""}`;
  });
  return lines.length > 0 ? `${lines.join("\n")}\n` : null;
}

async function loadReflectionsSurfaceSummary(
  supabase: SupabaseClient,
  userId: string,
  query: string,
  limit: number,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("user_architect_reflections")
    .select("title,content,tags,updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(12);
  if (error) return null;
  const rows = Array.isArray(data) ? data as Array<Record<string, any>> : [];
  if (rows.length === 0) return null;
  const ranked = rankSurfaceItems(
    rows,
    query,
    (row) =>
      `${String(row.title ?? "")} ${String(row.content ?? "")} ${
        Array.isArray(row.tags) ? row.tags.join(" ") : ""
      }`,
    limit,
  );
  const lines = ranked.map((row) => {
    const title = String(row.title ?? "").trim().slice(0, 90);
    const preview = String(row.content ?? "").trim().replace(/\s+/g, " ")
      .slice(0, 120);
    return `- ${title}${preview ? ` — ${preview}` : ""}`;
  });
  return lines.length > 0 ? `${lines.join("\n")}\n` : null;
}

async function loadQuotesSurfaceSummary(
  supabase: SupabaseClient,
  userId: string,
  query: string,
  limit: number,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("user_architect_quotes")
    .select("quote_text,author,source_context,tags,updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(12);
  if (error) return null;
  const rows = Array.isArray(data) ? data as Array<Record<string, any>> : [];
  if (rows.length === 0) return null;
  const ranked = rankSurfaceItems(
    rows,
    query,
    (row) =>
      `${String(row.quote_text ?? "")} ${String(row.author ?? "")} ${
        String(row.source_context ?? "")
      } ${Array.isArray(row.tags) ? row.tags.join(" ") : ""}`,
    limit,
  );
  const lines = ranked.map((row) => {
    const quote = String(row.quote_text ?? "").trim().replace(/\s+/g, " ")
      .slice(0, 140);
    const author = String(row.author ?? "").trim().slice(0, 60);
    return `- "${quote}"${author ? ` — ${author}` : ""}`;
  });
  return lines.length > 0 ? `${lines.join("\n")}\n` : null;
}

async function loadSurfaceSupportingContent(args: {
  supabase: SupabaseClient;
  userId: string;
  addon: SurfaceRuntimeAddon;
  message: string;
}): Promise<string> {
  const query = String(args.addon.query_hint ?? args.message ?? "").trim();
  const contentLimit = args.addon.level >= 4 ? 2 : 1;
  const definition = getSurfaceDefinition(args.addon.surface_id);
  if (!definition) return "";

  switch (definition.contentSource) {
    case "none":
      return "";
    case "north_star": {
      const block = await loadNorthStarContext(args.supabase, args.userId);
      return block ? `${block.trim()}\n` : "- Aucune étoile polaire active connue.\n";
    }
    case "reminders": {
      const block = await loadRendezVousSummary(args.supabase, args.userId);
      return block ? `${block.trim()}\n` : "";
    }
    case "personal_actions":
      return await loadPersonalActionsSurfaceSummary(args.supabase, args.userId) ?? "";
    case "preferences":
      return await loadPreferencesSurfaceSummary(args.supabase, args.userId) ?? "";
    case "wishlist":
      return await loadWishlistSurfaceSummary(
        args.supabase,
        args.userId,
        query,
        contentLimit,
      ) ?? "";
    case "stories":
      return await loadStoriesSurfaceSummary(
        args.supabase,
        args.userId,
        query,
        contentLimit,
      ) ?? "";
    case "reflections":
      return await loadReflectionsSurfaceSummary(
        args.supabase,
        args.userId,
        query,
        contentLimit,
      ) ?? "";
    case "quotes":
      return await loadQuotesSurfaceSummary(
        args.supabase,
        args.userId,
        query,
        contentLimit,
      ) ?? "";
    default:
      return "";
  }
}

export async function loadSurfaceOpportunityAddon(args: {
  supabase: SupabaseClient;
  userId: string;
  addon: SurfaceRuntimeAddon;
  message: string;
}): Promise<string | null> {
  const definition = getSurfaceDefinition(args.addon.surface_id);
  if (!definition) return null;
  const supportingContent = args.addon.content_need === "none"
    ? ""
    : await loadSurfaceSupportingContent(args);
  const blocks = [
    "=== ADDON SURFACE OPPORTUNITY ===",
    `- Surface cible: ${definition.label} (${definition.id}).`,
    `- Famille: ${definition.family}.`,
    `- Raison actuelle: ${args.addon.reason}`,
    `- Niveau actuel: ${args.addon.level}/5.`,
    `- Règle d'expression: ${describeSurfaceLevel(args.addon.level)}`,
    `- Style de suggestion: ${describeSurfaceCtaStyle(args.addon.cta_style)}`,
    `- Priorité: réponds d'abord au besoin immédiat du user, puis seulement si c'est naturel tu peux activer cette surface.`,
    `- Garde-fou: ne pousse jamais plus d'une surface sur ce tour et n'en fais rien si cela crée du bruit.`,
    `- Finalité produit: ${definition.goal}`,
  ];
  if (args.addon.query_hint) {
    blocks.push(`- Indice de contenu: ${args.addon.query_hint}`);
  }
  if (supportingContent.trim()) {
    blocks.push("Supports internes utiles:");
    blocks.push(supportingContent.trimEnd());
  }
  return `\n\n${blocks.join("\n")}\n`;
}

/**
 * Format topic session for context
 */
function formatTopicSession(session: any): string {
  const topicType = session.type;
  const focusMode = session.focus_mode ?? "discussion";
  const phase = session.phase ?? "exploring";
  const topicLabel = session.topic ?? "conversation";
  const handoffTo = session.handoff_to ? String(session.handoff_to) : "";

  let ctx = `\n\n=== SESSION TOPIC ACTIVE ===\n`;
  ctx += `- Type: ${topicType}\n`;
  ctx += `- Sujet: ${topicLabel}\n`;
  ctx += `- Phase: ${phase}\n`;
  ctx += `- Focus: ${focusMode}\n`;
  if (handoffTo) {
    ctx += `- Handoff souhaité: ${handoffTo}\n`;
  }

  ctx += `\nCONSIGNE PHASE (CRITIQUE):\n`;
  ctx +=
    `- opening: cadrer le sujet + valider ce qui compte, 1 question courte.\n`;
  ctx +=
    `- exploring: approfondir (1 question ouverte max), rester sur le sujet.\n`;
  ctx +=
    `- converging: synthèse brève + prochaine étape concrète ou angle clair.\n`;
  ctx += `- closing: conclure clairement + proposer transition douce.\n`;
  if (handoffTo) {
    ctx += `- Si possible, prépare un passage fluide vers ${handoffTo}.\n`;
  }

  if (focusMode === "plan") {
    ctx += `\nCONSIGNE FOCUS PLAN:\n`;
    ctx +=
      `- L'utilisateur DISCUTE de son plan/objectifs (pas une opération outil).\n`;
    ctx +=
      `- Aide-le à réfléchir, clarifier, explorer ses doutes ou questions.\n`;
    ctx +=
      `- Si tu détectes qu'il veut une OPÉRATION (créer/modifier/supprimer action), utilise les outils appropriés.\n`;
    ctx +=
      `- Sinon, reste dans la discussion sans pousser vers des actions concrètes.\n`;
  }

  return ctx;
}

function truncateToTokenEstimate(text: string, maxTokens: number): string {
  const maxChars = Math.max(80, Math.floor(maxTokens * 4));
  if (text.length <= maxChars) return text;
  const truncated = text.slice(0, Math.max(0, maxChars - 24)).trimEnd();
  return `${truncated}\n[...]\n`;
}

/**
 * Format track progress addon (parallel tracking)
 */
function formatTrackProgressAddon(addon: any): string {
  const mode = String(addon?.mode ?? "logged");
  const msg = String(addon?.message ?? "").trim();
  if (!msg) return "";
  if (mode === "needs_clarify") {
    return `\n\n=== ADDON TRACK_PROGRESS (PARALLELE) ===\n- Le user a parlé de progression, mais le log auto n'a pas pu être confirmé.\n- Le chat peut seulement TRACKER le progrès, pas créer/modifier/breakdown une action.\n- Si possible, demande une précision courte (quelle action + fait/raté/partiel).\n- Si ça reste ambigu, propose 2 options: mise à jour directe dans le dashboard OU attendre le prochain bilan.\n- Indice interne: ${msg}\n`;
  }
  return `\n\n=== ADDON TRACK_PROGRESS (PARALLELE) ===\n- Le progrès a été loggé automatiquement (ne relance pas le tool).\n- Le chat peut seulement TRACKER le progrès, pas créer/modifier/breakdown une action.\n- Tu peux continuer le flow normalement et acquiescer si besoin.\n- Résultat: ${msg}\n`;
}

function formatMomentumBlockersAddon(tempMemory: any): string {
  const momentum = readMomentumState(tempMemory);
  const lines = summarizeMomentumBlockersForPrompt(momentum, 3);
  if (lines.length === 0) return "";
  return (
    `\n\n=== ADDON BLOCKERS MOMENTUM ===\n` +
    `- Blockers connus récents sur actions:\n` +
    lines.map((line) => `  - ${line}\n`).join("") +
    `- Si un blocker est déjà connu, ne repose pas la question depuis zéro.\n` +
    `- Utilise ce contexte pour confirmer, nuancer ou préparer une redirection dashboard si un ajustement d'action devient nécessaire.\n` +
    `- Rappel produit: dans le chat, Sophia peut seulement comprendre, clarifier et tracker le progrès. Elle ne crée pas, ne modifie pas et ne breakdown pas une action dans le chat.\n`
  );
}

function formatDashboardRedirectAddon(addon: any): string {
  const intents = Array.isArray(addon?.intents)
    ? addon.intents.filter((v: unknown) => typeof v === "string").slice(0, 4)
    : [];
  const intentText = intents.length > 0 ? intents.join(", ") : "CRUD action";
  const fromBilan = Boolean(addon?.from_bilan);
  const isBreakdownIntent = intents.includes("breakdown_action");
  const highMissedStreakMeta = addon?.high_missed_streak_breakdown;
  const highMissedStreakDaysRaw = Number(
    highMissedStreakMeta?.streak_days ?? 0,
  );
  const highMissedStreakDays = Number.isFinite(highMissedStreakDaysRaw)
    ? Math.max(0, Math.floor(highMissedStreakDaysRaw))
    : 0;
  const highMissedActionTitle = String(highMissedStreakMeta?.action_title ?? "")
    .trim()
    .slice(0, 80);
  const hasHighMissedStreakBreakdown = isBreakdownIntent &&
    highMissedStreakDays >= 5;
  return (
    `\n\n=== ADDON DASHBOARD REDIRECT ===\n` +
    `- Intention détectée: ${intentText}.\n` +
    `- Cet add-on est un support de connaissance pour bien orienter l'utilisateur (pas un exécuteur).\n` +
    `- Réponds utilement et naturellement, puis redirige vers le tableau de bord.\n` +
    `- Règle produit forte: dans le chat, Sophia peut seulement tracker le progrès et clarifier le besoin. Toute création/modification/breakdown d'action se fait par le user dans le dashboard.\n` +
    `- Anti-répétition: ne répète jamais la même redirection dashboard sur 2 tours consécutifs.\n` +
    `- Si la redirection vient d'être donnée, continue sur le contenu (paramètres, clarifications) sans renvoyer encore vers l'UI.\n` +
    `- Rappel dashboard possible plus tard si utile (ordre de grandeur: ~5 tours) ou si l'utilisateur redemande explicitement l'exécution UI.\n` +
    (isBreakdownIntent
      ? `- Mode SOS blocage: ne le propose QUE pour une action déjà existante (Plan de transformation OU Actions personnelles) qui échoue de manière répétée. Pas pour un blocage personnel général.\n`
      : "") +
    (isBreakdownIntent
      ? `- Exemples de questions utiles: "Qu'est-ce qui bloque exactement ?", "À quel moment ça coince le plus ?", "Quelle version ultra-simple (2 min) serait faisable ?"\n`
      : "") +
    (isBreakdownIntent
      ? `- Interdit: présenter SOS blocage comme un bouton "quand ça chauffe", "pulsion", "crack" ou urgence émotionnelle.\n`
      : "") +
    (hasHighMissedStreakBreakdown
      ? `- Contexte bilan: l'action ${
        highMissedActionTitle ? `"${highMissedActionTitle}"` : "en cours"
      } coince depuis ~${highMissedStreakDays} jours.\n`
      : "") +
    (hasHighMissedStreakBreakdown
      ? `- Formulation attendue: empathie courte ("je vois que c'est pas facile") + proposition claire d'utiliser SOS blocage dans le dashboard pour cette action.\n`
      : "") +
    (hasHighMissedStreakBreakdown
      ? `- Puis reprends le fil du bilan (ne transforme pas ce tour en tutoriel long).\n`
      : "") +
    (fromBilan
      ? `- Le bilan reste prioritaire: confirme la redirection dashboard puis reprends l'item du bilan.\n`
      : "") +
    `- Interdiction d'annoncer qu'une action a été créée/modifiée/activée/supprimée depuis le chat.\n` +
    `- Aucune création/modification n'est exécutée dans le chat: tout se fait dans le dashboard.\n`
  );
}

function formatDashboardCapabilitiesLiteAddon(): string {
  return (
    `\n\n=== ADDON TABLEAU DE BORD (LITE / ALWAYS-ON) ===\n` +
    `- Support de connaissance global: utilise ces infos seulement si c'est pertinent pour la question du user.\n` +
    `- Cartographie produit:\n` +
    `  - Tableau de bord Action:\n` +
    `    1) Plan de Transformation: pilotage des actions du plan (activer, mettre en pause, supprimer, modifier). SOS blocage possible sur action existante en échec répété.\n` +
    `    2) Actions Personnelles: habitudes hors plan principal (créer, modifier, activer, pause, supprimer, suivi d'avancement) + Étoile Polaire (valeurs numériques départ/actuel/cible).\n` +
    `    3) Rendez-vous: configure les rendez-vous où Sophia vient vers le user au bon moment avec le bon ton (ex: citation du matin, message de soutien planifié, relance douce avant un passage important). C'est une vraie personnalisation de l'accompagnement (créer, modifier, activer, pause, supprimer; paramètres message/jours/heure).\n` +
    `    4) Préférences: personnalisation fine du coach Sophia (ton global, niveau de challenge, bavardage, longueur de réponse, fréquence des questions).\n` +
    `  - Tableau de bord Architecte:\n` +
    `    1) Construction du Temple: fondations identitaires.\n` +
    `    2) Amélioration du Temple: phase avancée débloquée après la construction.\n` +
    `- Règles d'usage:\n` +
    `  - Réponds d'abord au besoin immédiat du user, sans réciter toute la liste.\n` +
    `  - Règle de choix: si Sophia doit envoyer un message planifié au bon moment, parle de Rendez-vous. Si le user doit faire une habitude ou une tâche récurrente lui-même, parle d'Actions Personnelles.\n` +
    `  - Dans le chat, seule l'action TRACK_PROGRESS peut être exécutée. Toute création/modification/suppression/breakdown doit être préparée en conversation puis faite dans le dashboard.\n` +
    `  - Si c'est pertinent ET confiance > 0.9, tu peux pousser UNE fonctionnalité du dashboard complémentaire.\n` +
    `- Interdiction: aucune création/modification réelle n'est exécutée dans le chat.\n`
  );
}

function formatDashboardPreferencesIntentAddon(addon: any): string {
  const confidence = Number(addon?.confidence ?? 0);
  const confidenceText = Number.isFinite(confidence)
    ? ` (confidence=${confidence.toFixed(2)})`
    : "";
  const keys = Array.isArray(addon?.keys)
    ? addon.keys
      .filter((v: unknown) => typeof v === "string")
      .slice(0, 5)
    : [];
  const keysText = keys.length > 0 ? keys.join(", ") : "non précisé";
  const fromBilan = Boolean(addon?.from_bilan);

  return (
    `\n\n=== ADDON DASHBOARD PREFERENCES INTENT ===\n` +
    `- L'utilisateur veut modifier des préférences produit UX/UI${confidenceText}.\n` +
    `- Clés détectées: ${keysText}.\n` +
    `- Cet add-on sert de support de connaissance pour guider correctement l'utilisateur.\n` +
    `- Réponds brièvement puis redirige vers l'écran Préférences du dashboard.\n` +
    `- Anti-répétition: évite la même redirection sur 2 tours d'affilée; entre-temps, traite les préférences demandées en conversation.\n` +
    `- Les 5 catégories possibles à expliciter si utile: coach.tone, coach.challenge_level, coach.talk_propensity, coach.message_length, coach.question_tendency.\n` +
    `- Donne des exemples de valeurs rapides (ex: coach.tone=warm_direct, coach.challenge_level=high, coach.talk_propensity=light, coach.message_length=short, coach.question_tendency=low).\n` +
    `- Interdiction de créer/appliquer un réglage depuis le chat: toute modification se fait dans le dashboard.\n` +
    (fromBilan
      ? `- Le bilan reste prioritaire: confirme la redirection puis reprends l'item du bilan.\n`
      : "") +
    `- N'annonce aucune modification comme déjà appliquée depuis le chat.\n`
  );
}

function formatDashboardCapabilitiesAddon(addon: any): string {
  const intents = Array.isArray(addon?.intents)
    ? addon.intents.filter((v: unknown) => typeof v === "string").slice(0, 8)
    : [];
  const fromBilan = Boolean(addon?.from_bilan);
  const intentsText = intents.length > 0
    ? intents.join(", ")
    : "general_dashboard_intent";
  return (
    `\n\n=== ADDON DASHBOARD CAPABILITIES (CAN_BE_RELATED_TO_DASHBOARD) ===\n` +
    `- Signal synthétique détecté: la demande peut relever du tableau de bord (${intentsText}).\n` +
    `- Objectif: réponse CONSISTANTE, fidèle à l'UI réelle, sans exécution dans le chat.\n` +
    `\n` +
    `- CARTOGRAPHIE PRODUIT (SOURCE DE VÉRITÉ):\n` +
    `  A) Tableau de bord ACTION\n` +
    `    1) Plan de Transformation\n` +
    `    2) Actions Personnelles (inclut l'Étoile Polaire)\n` +
    `    3) Rendez-vous\n` +
    `    4) Préférences\n` +
    `  B) Tableau de bord ARCHITECTE\n` +
    `    1) Construction du Temple\n` +
    `    2) Amélioration du Temple (débloquée une fois la Construction du Temple terminée)\n` +
    `\n` +
    `- DÉTAILS TABLEAU DE BORD ACTION (intérêt + ce qui est possible):\n` +
    `  1) Plan de Transformation:\n` +
    `     - Intérêt: exécuter la transformation active, phase par phase.\n` +
    `     - Possibilités clés sur une action: modifier, supprimer, mettre en pause (désactiver), activer, marquer la progression, SOS blocage (découpage micro-étapes).\n` +
    `     - Important: SOS blocage n'est PAS un bouton de crise/pulsion. Il s'applique à une action existante en échec répété.\n` +
    `  2) Actions Personnelles:\n` +
    `     - Intérêt: gérer des habitudes perso en parallèle du plan principal.\n` +
    `     - Possibilités clés: créer, modifier, activer, mettre en pause, supprimer, suivre la progression, SOS blocage sur action existante en échec répété.\n` +
    `     - Étoile Polaire: définir/mettre à jour un indicateur chiffré (valeurs numériques: départ, actuel, cible) pour garder le cap.\n` +
    `  3) Rendez-vous:\n` +
    `     - Intérêt: autoriser Sophia à venir vers le user de façon proactive (rappels/messages planifiés).\n` +
    `     - Possibilités clés: créer, modifier, activer, mettre en pause (inactive), supprimer (soft-delete/inactive).\n` +
    `     - Paramètres typiques: message, pourquoi/rationale, heure locale (HH:MM), jours (lun→dim).\n` +
    `  4) Préférences:\n` +
    `     - Intérêt: personnaliser précisément le style du coach.\n` +
    `     - Reprendre EXACTEMENT les catégories/labels du dashboard:\n` +
    `       * Ton global: Doux | Bienveillant ferme | Très direct\n` +
    `       * Niveau de challenge: Léger | Équilibré | Élevé\n` +
    `       * Niveau de bavardage: Léger | Équilibré | Élevé\n` +
    `       * Longueur de réponse: Courte | Moyenne | Longue\n` +
    `       * Tendance à poser des questions: Faible | Normale | Élevée\n` +
    `\n` +
    `- DÉTAILS TABLEAU DE BORD ARCHITECTE (overview bref):\n` +
    `  - Logique fondatrice: cet espace repose sur l'idée que pour changer durablement, il faut travailler l'identité en parallèle des actions.\n` +
    `  1) Construction du Temple: parcours de fondations identitaires (les 12 semaines de base).\n` +
    `  2) Amélioration du Temple: phase avancée débloquée après la Construction du Temple, avec notamment la Table Ronde (alignement hebdo) et la Forge (évolution identitaire progressive).\n` +
    `\n` +
    `- STRATÉGIE DE LONGUEUR (anti-réponse trop longue):\n` +
    `  - Niveau 1 (par défaut): donner une vue d'ensemble courte et structurée (Action vs Architecte + sections du tableau de bord).\n` +
    `  - Niveau 2 (si demandé): détailler uniquement la/les section(s) ciblée(s) avec possibilités concrètes.\n` +
    `  - Ne pas réciter tout le catalogue si le user pose une question précise sur une seule section.\n` +
    `\n` +
    `- Protocole de réponse:\n` +
    `  A) Réponds d'abord à la question exacte du user.\n` +
    `  B) Creuse avec 1 question diagnostique ciblée pour mieux aider (pourquoi, blocage concret, contrainte, résultat attendu).\n` +
    `  C) Donne les paramètres utiles (champs précis) si la demande touche une config/dashboard feature.\n` +
    `  D) Propose ensuite le bon chemin dashboard (section/fonction) en restant concret.\n` +
    `  E) Si pertinent, ajoute UNE suggestion produit complémentaire à forte valeur (pas plus d'une).\n` +
    `- Interdictions:\n` +
    `  - Dans le chat, seule l'action TRACK_PROGRESS peut être exécutée.\n` +
    `  - N'affirme jamais qu'une modification dashboard est déjà appliquée depuis le chat.\n` +
    `  - N'invente pas de features non supportées.\n` +
    (fromBilan
      ? `- Si un bilan est actif, garde le bilan prioritaire après l'orientation dashboard.\n`
      : "")
  );
}

function ymdInTz(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function isoWeekStartYmdInTz(d: Date, timeZone: string): string {
  const ymd = ymdInTz(d, timeZone);
  const [y, m, dd] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, dd ?? 1));
  const isoDayIndex = (dt.getUTCDay() + 6) % 7;
  dt.setUTCDate(dt.getUTCDate() - isoDayIndex);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const ddd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${ddd}`;
}

function addDaysYmd(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + delta);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function shouldInjectWeeklyRecapContext(args: {
  mode: AgentMode;
  state: any;
}): boolean {
  if (args.mode === "companion") return true;
  if (args.mode !== "investigator") return false;
  const inv = args.state?.investigation_state;
  return String(inv?.mode ?? "") === "weekly_bilan";
}

async function loadWeeklyRecapContext(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("timezone")
      .eq("id", userId)
      .maybeSingle();

    const tz = String((profile as any)?.timezone ?? "").trim() ||
      "Europe/Paris";
    const weekStart = isoWeekStartYmdInTz(new Date(), tz);
    const previousWeekStart = addDaysYmd(weekStart, -7);

    const { data: recap, error } = await supabase
      .from("weekly_bilan_recaps")
      .select(
        "execution,etoile_polaire,decisions_next_week,coach_note,week_start",
      )
      .eq("user_id", userId)
      .eq("week_start", previousWeekStart)
      .maybeSingle();

    if (error || !recap) return null;

    const execution = (recap as any).execution ?? {};
    const etoile = (recap as any).etoile_polaire ?? {};
    const decisions = Array.isArray((recap as any).decisions_next_week)
      ? (recap as any).decisions_next_week.map((x: unknown) => String(x))
        .filter(Boolean).slice(0, 5)
      : [];
    const coachNote = String((recap as any).coach_note ?? "").trim();

    let block = "=== RECAP BILAN HEBDO PRECEDENT ===\n";
    block += `- Semaine: ${
      String((recap as any).week_start ?? previousWeekStart)
    }\n`;
    block += `- Exécution: ${Number(execution?.rate_pct ?? 0)}% (${
      Number(execution?.completed ?? 0)
    }/${Number(execution?.total ?? 0)})\n`;
    if (
      etoile && typeof etoile === "object" && Object.keys(etoile).length > 0
    ) {
      block += `- Etoile Polaire: ${
        String(etoile?.title ?? "Etoile Polaire")
      } | actuel=${String(etoile?.current ?? "?")} | cible=${
        String(etoile?.target ?? "?")
      }\n`;
    }
    if (decisions.length > 0) {
      block += `- Décisions prises: ${decisions.join(" ; ")}\n`;
    }
    if (coachNote) {
      block += `- Note coach: ${coachNote.slice(0, 500)}\n`;
    }
    block +=
      "- Utilise ce recap pour assurer la continuité, sans le réciter mot à mot.\n";
    return block;
  } catch {
    return null;
  }
}

function shouldInjectNorthStarContext(args: {
  mode: AgentMode;
  message: string;
  tempMemory?: any;
}): boolean {
  const isEligibleMode = args.mode === "companion" ||
    args.mode === "investigator";
  if (!isEligibleMode) return false;

  const hasDashboardCapabilitiesSignal = Boolean(
    (args.tempMemory as any)?.__dashboard_capabilities_addon,
  );
  if (hasDashboardCapabilitiesSignal) return true;

  const msg = String(args.message ?? "").toLowerCase();
  return /north\s*star|etoile|étoile|cap|vision|priorit/.test(msg);
}

async function loadNorthStarContext(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from("user_north_stars")
      .select(
        "title, metric_type, unit, start_value, current_value, target_value, status, updated_at",
      )
      .eq("user_id", userId)
      .in("status", ["active", "completed"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    const title = String((data as any).title ?? "North Star").trim();
    const metricType = String((data as any).metric_type ?? "number").trim();
    const unit = String((data as any).unit ?? "").trim();
    const status = String((data as any).status ?? "unknown").trim();
    const startValue = Number((data as any).start_value);
    const currentValue = Number((data as any).current_value);
    const targetValue = Number((data as any).target_value);

    let progress = "";
    if (
      Number.isFinite(startValue) &&
      Number.isFinite(currentValue) &&
      Number.isFinite(targetValue) &&
      targetValue !== startValue
    ) {
      const pct = Math.max(
        -100,
        Math.min(
          300,
          ((currentValue - startValue) / (targetValue - startValue)) * 100,
        ),
      );
      progress = `\n- Progression estimée: ${pct.toFixed(0)}%`;
    }

    return (
      `=== NORTH STAR ACTIVE ===\n` +
      `- Titre: ${title}\n` +
      `- Type métrique: ${metricType}\n` +
      `- Valeurs: départ=${String((data as any).start_value)} | actuel=${
        String((data as any).current_value)
      } | cible=${String((data as any).target_value)}${
        unit ? ` ${unit}` : ""
      }\n` +
      `- Statut: ${status}` +
      `${progress}\n` +
      `- Consigne: si tu proposes/modifies des actions, relie-les explicitement à cette North Star.\n`
    );
  } catch {
    // Backward compatibility: environments without the table should not break context loading.
    return null;
  }
}

function formatDashboardRecurringReminderIntentAddon(addon: any): string {
  const confidence = Number(addon?.confidence ?? 0);
  const confidenceText = Number.isFinite(confidence)
    ? ` (confidence=${confidence.toFixed(2)})`
    : "";
  const fields = Array.isArray(addon?.fields)
    ? addon.fields
      .filter((v: unknown) => typeof v === "string")
      .slice(0, 9)
    : [];
  const fieldsText = fields.length > 0 ? fields.join(", ") : "non précisé";
  const fromBilan = Boolean(addon?.from_bilan);

  return (
    `\n\n=== ADDON DASHBOARD RENDEZ-VOUS INTENT ===\n` +
    `- L'utilisateur veut configurer des rendez-vous WhatsApp planifiés${confidenceText}.\n` +
    `- Paramètres détectés: ${fieldsText}.\n` +
    `- Cet add-on sert de support de connaissance pour orienter la configuration correctement.\n` +
    `- Réponds clairement puis redirige vers la section Rendez-vous du dashboard.\n` +
    `- Anti-répétition: n'enchaîne pas la même redirection dashboard sur des messages consécutifs.\n` +
    `- Si la redirection vient d'être faite, continue la discussion sur le rendez-vous (heure/jours/message) sans re-rediriger immédiatement.\n` +
    `- Si besoin, précise les paramètres configurables: mode (daily/weekly/custom), days, time, timezone, channel (app/whatsapp), start_date, end_date, pause, message.\n` +
    `- Règle de choix: si Sophia doit venir vers le user à un moment précis, c'est un Rendez-vous, pas une Action Personnelle.\n` +
    `- Demande seulement l'info manquante critique avant redirection si la demande est ambiguë.\n` +
    `- Interdiction de programmer/éditer un rendez-vous depuis le chat: toute création/modification se fait dans le dashboard.\n` +
    (fromBilan
      ? `- Le bilan reste prioritaire: confirme la redirection puis reprends l'item du bilan.\n`
      : "") +
    `- N'annonce aucune programmation de rendez-vous comme déjà faite dans le chat.\n`
  );
}

function shouldInjectRendezVousSummary(
  mode: AgentMode,
  message: string,
): boolean {
  if (mode !== "companion" && mode !== "investigator") return false;
  const normalized = String(message ?? "").trim();
  if (!normalized) return false;
  return /\brappels?\b|\brendez[\s-]?vous\b/i.test(normalized);
}

async function loadRendezVousSummary(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  try {
    const { data, error } = await supabase
      .from("user_recurring_reminders")
      .select(
        "message_instruction, local_time_hhmm, scheduled_days, status, rationale, updated_at",
      )
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(8);

    if (error || !data || data.length === 0) {
      return (
        "=== RENDEZ-VOUS CONFIGURÉS (SOURCE DE VÉRITÉ) ===\n" +
        "- Aucun rendez-vous configuré actuellement dans user_recurring_reminders.\n" +
        "- Si le user demande s'il en a déjà, réponds non.\n" +
        "- N'invente jamais un rendez-vous existant.\n"
      );
    }

    const active = data.filter((row: any) =>
      String(row?.status ?? "") === "active"
    );
    const inactive = data.filter((row: any) =>
      String(row?.status ?? "") !== "active"
    );
    let block = "=== RENDEZ-VOUS CONFIGURÉS (SOURCE DE VÉRITÉ) ===\n";
    block +=
      `- Total: ${data.length} | actifs: ${active.length} | inactifs: ${inactive.length}\n`;
    block +=
      "- Cette section reflète UNIQUEMENT user_recurring_reminders (configuration générique), pas les occurrences scheduled_checkins.\n";
    block +=
      "- Si le user demande s'il a déjà des rendez-vous, base-toi UNIQUEMENT sur cette section.\n";

    if (active.length > 0) {
      block += "Actifs:\n";
      for (const row of active.slice(0, 5) as any[]) {
        const instruction =
          String(row?.message_instruction ?? "").trim().slice(0, 120) ||
          "Message non précisé";
        const time = String(row?.local_time_hhmm ?? "").trim() || "?";
        const days =
          Array.isArray(row?.scheduled_days) && row.scheduled_days.length > 0
            ? row.scheduled_days.join(", ")
            : "jours non précisés";
        block += `- ${instruction} | ${days} | ${time}\n`;
      }
    }

    if (inactive.length > 0) {
      block += "Inactifs:\n";
      for (const row of inactive.slice(0, 3) as any[]) {
        const instruction =
          String(row?.message_instruction ?? "").trim().slice(0, 100) ||
          "Message non précisé";
        const time = String(row?.local_time_hhmm ?? "").trim() || "?";
        block += `- ${instruction} | ${time} [inactif]\n`;
      }
    }

    block += "- N'invente jamais d'autre rendez-vous que ceux listés ici.\n";
    return block;
  } catch {
    return "";
  }
}

function formatSafetyActiveAddon(addon: any): string {
  const level = "sentry";
  const phase = String(addon?.phase ?? "active").trim().slice(0, 40) ||
    "active";

  return (
    `\n\n=== ADDON SAFETY ACTIVE ===\n` +
    `- Niveau safety actif: ${level} (phase=${phase}).\n` +
    `- Priorité: sécurité + apaisement, ton calme, validation émotionnelle, une seule micro-étape à la fois.\n` +
    `- Tant que le niveau safety est actif, ne sors pas du protocole safety.\n`
  );
}

/**
 * Format lightweight onboarding addon for the Companion agent.
 * State is stored in temp_memory.__onboarding_active and expires in router.
 */
function formatOnboardingAddon(onboardingState: any): string {
  const planTitle = String(onboardingState?.plan_title ?? "ton plan").trim() ||
    "ton plan";
  const turns = Math.max(
    0,
    Number(
      onboardingState?.user_turn_count ?? onboardingState?.turn_count ?? 0,
    ) ||
      0,
  );
  const remainingTurns = Math.max(0, 10 - turns);
  const startedAt = String(onboardingState?.started_at ?? "").trim();

  return (
    `\n\n=== ADDON ONBOARDING (LÉGER) ===\n` +
    `Plan: "${planTitle}"\n` +
    (startedAt ? `Started_at: ${startedAt}\n` : "") +
    `Tours onboarding: ${turns}/10 (restants: ${remainingTurns})\n` +
    `MISSION:\n` +
    `- L'utilisateur vient de finaliser son plan: c'est le premier contact onboarding.\n` +
    `- Sois fun, pro, posée, naturelle: parle comme une vraie coach humaine.\n` +
    `- Intéresse-toi à son plan, ses motivations, ses blocages habituels.\n` +
    `- Pas de script figé Q1/Q2/Q3, pas d'effet formulaire.\n` +
    `- Une seule question claire à la fois, conversation fluide.\n` +
    `- Si urgence safety, la sécurité reste prioritaire.\n`
  );
}

function formatCheckupNotTriggerableAddon(addon: any): string {
  const phrase = String(addon?.trigger_phrase ?? "").trim().slice(0, 80);
  const confidence = Number(addon?.confidence ?? 0);
  const confidenceText = Number.isFinite(confidence)
    ? ` (confidence=${confidence.toFixed(2)})`
    : "";

  return (
    `\n\n=== ADDON BILAN NON DÉCLENCHABLE ===\n` +
    `- L'utilisateur demande à faire le bilan maintenant${confidenceText}.\n` +
    `- Réponds naturellement: le bilan arrive automatiquement chaque soir vers 20h sur WhatsApp.\n` +
    `- Précise que le bilan n'est pas encore déclenchable sur commande.\n` +
    `- Ton chaleureux, 1-2 phrases, sans jargon.\n` +
    (phrase ? `- Formulation user repérée: "${phrase}".\n` : "")
  );
}

function formatBilanJustStoppedAddon(addon: any): string {
  const reason = String(addon?.reason ?? "").trim().slice(0, 40) || "stop";
  return (
    `\n\n=== ADDON BILAN STOPPÉ ===\n` +
    `- Le bilan vient d'être arrêté (raison=${reason}).\n` +
    `- Dis que c'est ok et que vous le ferez demain soir.\n` +
    `- 1 phrase max, bienveillante.\n` +
    `- Ne relance pas le bilan maintenant.\n`
  );
}

// Re-export types for convenience
export type {
  ContextProfile,
  LoadedContext,
  OnDemandTriggers,
} from "./types.ts";

async function loadActionIndicators(
  supabase: SupabaseClient,
  userId: string,
  planId: string,
): Promise<string> {
  try {
    const { data: activeActions, error: actionsErr } = await supabase
      .from("user_actions")
      .select("id,title")
      .eq("user_id", userId)
      .eq("plan_id", planId)
      .eq("status", "active")
      .limit(12);

    if (actionsErr || !activeActions || activeActions.length === 0) return "";

    const actionIds = activeActions.map((a: any) => String(a.id)).filter(
      Boolean,
    );
    if (actionIds.length === 0) return "";

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: entries, error: entriesErr } = await supabase
      .from("user_action_entries")
      .select("action_id,status,performed_at")
      .eq("user_id", userId)
      .gte("performed_at", since)
      .in("action_id", actionIds)
      .order("performed_at", { ascending: false })
      .limit(200);

    if (entriesErr || !entries || entries.length === 0) return "";

    const titleById = new Map<string, string>();
    for (const a of activeActions as any[]) {
      titleById.set(String(a.id), String(a.title ?? "Action"));
    }

    const missedByAction = new Map<string, number>();
    for (const e of entries as any[]) {
      const actionId = String(e.action_id ?? "");
      if (!actionId) continue;
      const st = String(e.status ?? "").toLowerCase();
      if (st === "missed" || st === "skipped" || st === "failed") {
        missedByAction.set(actionId, (missedByAction.get(actionId) ?? 0) + 1);
      }
    }

    const top = [...missedByAction.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2);

    if (top.length === 0) return "";

    let block = "=== INDICATEURS COACHING (7 DERNIERS JOURS) ===\n";
    for (const [actionId, missedCount] of top) {
      const title = titleById.get(actionId) ?? "Action";
      block += `- ${title}: ${missedCount} raté(s) cette semaine.\n`;
    }
    block +=
      "- Utilise ces indicateurs en coaching, sans dramatiser, et propose des pistes concrètes.\n";
    return block;
  } catch (e) {
    console.warn(
      "[ContextLoader] failed to load action indicators (non-blocking):",
      e,
    );
    return "";
  }
}
