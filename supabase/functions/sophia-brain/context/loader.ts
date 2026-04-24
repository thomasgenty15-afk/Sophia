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
import { logV2Event, V2_EVENT_TYPES } from "../../_shared/v2-events.ts";
import {
  buildRetrievalExecutedPayload,
  resolveV2RetrievalPlan,
} from "../../_shared/v2-memory-retrieval.ts";
import {
  type ActiveTransformationRuntime,
  getActiveTransformationRuntime,
  getPlanItemRuntime,
  type PlanItemRuntimeRow,
} from "../../_shared/v2-runtime.ts";
import type {
  MemoryLayerScope,
  MemoryRetrievalIntent,
  SystemRuntimeSnapshotRow,
  UserMetricRow,
  UserPlanItemEntryRow,
} from "../../_shared/v2-types.ts";
import type { AgentMode } from "../state-manager.ts";
import {
  getCoreIdentity,
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
  type EventSearchResult,
  formatEventMemoriesForPrompt,
  retrieveEventMemories,
} from "../event_memory.ts";
import {
  formatGlobalMemoriesForPrompt,
  type GlobalMemorySearchResult,
  retrieveGlobalMemories,
  retrieveGlobalMemoriesByFullKeys,
  retrieveGlobalMemoriesByThemes,
} from "../global_memory.ts";
import {
  isScopeMemoryEligible,
  loadScopeMemoryPromptContext,
} from "../scope_memory.ts";
import type { DispatcherMemoryPlan } from "../router/dispatcher.ts";
import type { SurfaceRuntimeAddon } from "../surface_state.ts";
import { getSurfaceDefinition } from "../surface_registry.ts";
// R2: getActiveTopicSession removed (topic sessions disabled)
import type {
  ContextProfile,
  LoadedContext,
  OnDemandTriggers,
} from "./types.ts";
import {
  getContextProfile,
} from "./types.ts";
import {
  readMomentumStateV2,
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
  source: "historical" | "dispatcher" | "v2_intent" | "dispatcher_capped";
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
  globalScopeFilter: MemoryLayerScope[] | null;
  topicFilterTransformation: boolean;
  v2Intent?: MemoryRetrievalIntent;
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
  v2Intent?: MemoryRetrievalIntent;
  v2CycleId?: string | null;
  v2TransformationId?: string | null;
  v2Runtime?: ActiveTransformationRuntime | null;
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
      source: "historical",
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
      globalScopeFilter: null,
      topicFilterTransformation: false,
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
    source: "dispatcher",
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
    fallbackSemanticTopicMax: params.profile.topic_memories &&
        (
          (semanticFallbackAllowed && !hasExplicitGlobalTargets &&
            nonInventoryIntent) ||
          (hasExplicitGlobalTargets && wantsTopicSupport)
        )
      ? budget.semanticTopicMax
      : 0,
    fallbackSemanticEventMax: params.profile.event_memories &&
        (
          (semanticFallbackAllowed && !hasExplicitGlobalTargets &&
            plan.context_need === "targeted" && nonInventoryIntent) ||
          (hasExplicitGlobalTargets && wantsEventSupport)
        )
      ? budget.semanticEventMax
      : 0,
    globalScopeFilter: null,
    topicFilterTransformation: false,
    budget,
  };
}

function capDispatcherBudgetWithV2(
  dispatcherBudget: DispatcherMemoryBudget,
  v2Budget: { global_max: number; topic_max: number; event_max: number },
): DispatcherMemoryBudget {
  return {
    globalThemeMax: Math.min(
      dispatcherBudget.globalThemeMax,
      v2Budget.global_max,
    ),
    explicitTopicQueriesMax: dispatcherBudget.explicitTopicQueriesMax,
    explicitEventQueriesMax: dispatcherBudget.explicitEventQueriesMax,
    explicitTopicResultsPerQuery: Math.min(
      dispatcherBudget.explicitTopicResultsPerQuery,
      Math.max(1, v2Budget.topic_max),
    ),
    explicitEventResultsPerQuery: Math.min(
      dispatcherBudget.explicitEventResultsPerQuery,
      Math.max(1, v2Budget.event_max),
    ),
    semanticGlobalMax: Math.min(
      dispatcherBudget.semanticGlobalMax,
      v2Budget.global_max,
    ),
    semanticTopicMax: Math.min(
      dispatcherBudget.semanticTopicMax,
      v2Budget.topic_max,
    ),
    semanticEventMax: Math.min(
      dispatcherBudget.semanticEventMax,
      v2Budget.event_max,
    ),
  };
}

export function resolveContextMemoryLoadStrategy(params: {
  mode: AgentMode;
  profile: ContextProfile;
  message: string;
  memoryPlan?: DispatcherMemoryPlan | null;
  v2Intent?: MemoryRetrievalIntent;
}): DispatcherMemoryLoadStrategy {
  const dispatcherStrategy = deriveDispatcherMemoryLoadStrategy(params);
  if (!params.v2Intent) return dispatcherStrategy;

  const v2Plan = resolveV2RetrievalPlan(params.v2Intent);
  if (params.mode === "companion" && params.v2Intent === "answer_user_now") {
    return {
      ...dispatcherStrategy,
      source: "dispatcher_capped",
      loadIdentity: dispatcherStrategy.loadIdentity && v2Plan.load_identity,
      fallbackSemanticGlobalMax: Math.min(
        dispatcherStrategy.fallbackSemanticGlobalMax,
        v2Plan.budget.global_max,
      ),
      fallbackSemanticTopicMax: Math.min(
        dispatcherStrategy.fallbackSemanticTopicMax,
        v2Plan.budget.topic_max,
      ),
      fallbackSemanticEventMax: Math.min(
        dispatcherStrategy.fallbackSemanticEventMax,
        v2Plan.budget.event_max,
      ),
      globalScopeFilter: v2Plan.global_scope_filter,
      topicFilterTransformation: v2Plan.topic_filter_transformation,
      v2Intent: params.v2Intent,
      budget: capDispatcherBudgetWithV2(
        dispatcherStrategy.budget,
        v2Plan.budget,
      ),
    };
  }

  const fallbackBudget = DISPATCHER_MEMORY_BUDGETS.small;
  return {
    source: "v2_intent",
    usePlan: true,
    skipAllMemory: false,
    loadIdentity: params.profile.identity && v2Plan.load_identity,
    globalThemeKeys: [],
    globalSubthemeKeys: [],
    topicQueries: [],
    eventQueries: [],
    fallbackSemanticGlobalMax: v2Plan.load_global_memories
      ? v2Plan.budget.global_max
      : 0,
    fallbackSemanticTopicMax: v2Plan.load_topic_memories
      ? v2Plan.budget.topic_max
      : 0,
    fallbackSemanticEventMax: v2Plan.load_event_memories
      ? v2Plan.budget.event_max
      : 0,
    globalScopeFilter: v2Plan.global_scope_filter,
    topicFilterTransformation: v2Plan.topic_filter_transformation,
    v2Intent: params.v2Intent,
    budget: {
      ...fallbackBudget,
      semanticGlobalMax: v2Plan.budget.global_max,
      semanticTopicMax: v2Plan.budget.topic_max,
      semanticEventMax: v2Plan.budget.event_max,
    },
  };
}

async function resolveV2RuntimeRefs(opts: ContextLoaderOptions): Promise<{
  cycleId: string | null;
  transformationId: string | null;
}> {
  if (opts.v2CycleId || opts.v2TransformationId) {
    return {
      cycleId: opts.v2CycleId ?? null,
      transformationId: opts.v2TransformationId ?? null,
    };
  }
  if (opts.v2Runtime) {
    return {
      cycleId: opts.v2Runtime.cycle?.id ?? null,
      transformationId: opts.v2Runtime.transformation?.id ?? null,
    };
  }
  if (!opts.v2Intent) {
    return { cycleId: null, transformationId: null };
  }
  try {
    const runtime = await getActiveTransformationRuntime(
      opts.supabase,
      opts.userId,
    );
    return {
      cycleId: runtime.cycle?.id ?? null,
      transformationId: runtime.transformation?.id ?? null,
    };
  } catch (error) {
    console.warn("[ContextLoader] failed to resolve V2 runtime refs", {
      user_id: opts.userId,
      v2_intent: opts.v2Intent,
      error: error instanceof Error ? error.message : String(error),
    });
    return { cycleId: null, transformationId: null };
  }
}

async function tryLogV2MemoryRetrieval(args: {
  supabase: SupabaseClient;
  userId: string;
  cycleId: string | null;
  transformationId: string | null;
  strategy: DispatcherMemoryLoadStrategy;
  layersLoaded: MemoryLayerScope[];
  hitCount: number;
}): Promise<void> {
  if (!args.strategy.v2Intent) return;
  try {
    await logV2Event(
      args.supabase,
      V2_EVENT_TYPES.MEMORY_RETRIEVAL_EXECUTED,
      buildRetrievalExecutedPayload({
        userId: args.userId,
        cycleId: args.cycleId,
        transformationId: args.transformationId,
        plan: resolveV2RetrievalPlan(args.strategy.v2Intent),
        tokensUsed: 0,
        hitCount: args.hitCount,
        layersLoaded: args.layersLoaded,
      }),
    );
  } catch (error) {
    console.warn("[ContextLoader] memory_retrieval_executed_v2 log failed", {
      user_id: args.userId,
      v2_intent: args.strategy.v2Intent,
      error: error instanceof Error ? error.message : String(error),
    });
  }
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
  const scopedMemoryEligible = isScopeMemoryEligible(opts.scope);
  const memoryStrategy = resolveContextMemoryLoadStrategy({
    mode: opts.mode,
    profile,
    message: opts.message,
    memoryPlan: opts.memoryPlan,
    v2Intent: opts.v2Intent,
  });
  const v2RuntimeRefs = await resolveV2RuntimeRefs(opts);
  const context: LoadedContext = {};
  const elementsLoaded: string[] = [];
  let observedEventResults: EventSearchResult[] = [];
  let observedGlobalResults: GlobalMemorySearchResult[] = [];
  let observedTopicResults: TopicSearchResult[] = [];
  const attemptedLayers = {
    identity: false,
    event: false,
    global: false,
    topic: false,
  };

  // Parallel loading of independent elements
  const promises: Promise<void>[] = [];

  // 1b. North Star context (on-demand to keep prompt lean)
  const shouldInjectNorthStar = shouldInjectNorthStarContext({
    mode: opts.mode,
    message: opts.message,
    tempMemory: opts.tempMemory,
  });
  if (shouldInjectNorthStar) {
    promises.push(
      loadNorthStarContext(opts.supabase, opts.userId, opts.v2Runtime).then(
        (block) => {
          if (block) {
            context.northStarContext = block;
            elementsLoaded.push("north_star_context");
          }
        },
      ),
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
  if (
    profile.identity && !memoryStrategy.skipAllMemory &&
    memoryStrategy.loadIdentity
  ) {
    attemptedLayers.identity = true;
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

  if (opts.channel === "whatsapp") {
    const whatsappFilRouge = String(
      (opts.tempMemory as any)?.__whatsapp_fil_rouge?.text ?? "",
    ).trim();
    if (whatsappFilRouge) {
      context.whatsappFilRouge =
        `=== FIL ROUGE WHATSAPP (COURT TERME) ===\n${whatsappFilRouge}\n\n`;
      elementsLoaded.push("whatsapp_fil_rouge");
    }
  }

  if (scopedMemoryEligible) {
    promises.push(
      loadScopeMemoryPromptContext({
        supabase: opts.supabase,
        userId: opts.userId,
        scopeRaw: opts.scope,
      }).then((scopeMemoryContext) => {
        if (!scopeMemoryContext) return;
        if (scopeMemoryContext.summaryBlock) {
          context.shortTerm = scopeMemoryContext.summaryBlock;
          elementsLoaded.push("scope_memory_summary");
        }
        if (scopeMemoryContext.recentTurnsBlock) {
          context.recentTurns = scopeMemoryContext.recentTurnsBlock;
          elementsLoaded.push("scope_memory_recent_turns");
        }
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
      attemptedLayers.event = true;
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
                  maxResults:
                    memoryStrategy.budget.explicitEventResultsPerQuery,
                  requestId: opts.requestId,
                })
              ),
            );
            eventResults.push(...batches.flat());
          }
          if (
            eventResults.length === 0 &&
            memoryStrategy.fallbackSemanticEventMax > 0 &&
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
      attemptedLayers.global = true;
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
              scope: memoryStrategy.globalScopeFilter ?? undefined,
              cycleId: v2RuntimeRefs.cycleId,
              transformationId: v2RuntimeRefs.transformationId,
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
      attemptedLayers.topic = true;
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
                  maxResults:
                    memoryStrategy.budget.explicitTopicResultsPerQuery,
                  meta: { requestId: opts.requestId },
                  transformationId: memoryStrategy.topicFilterTransformation
                    ? v2RuntimeRefs.transformationId
                    : null,
                })
              ),
            );
            topicResults.push(...batches.flat());
          }
          if (
            topicResults.length === 0 &&
            memoryStrategy.fallbackSemanticTopicMax > 0 &&
            opts.message
          ) {
            topicResults.push(
              ...await retrieveTopicMemories({
                supabase: opts.supabase,
                userId: opts.userId,
                message: opts.message,
                maxResults: memoryStrategy.fallbackSemanticTopicMax,
                meta: { requestId: opts.requestId },
                transformationId: memoryStrategy.topicFilterTransformation
                  ? v2RuntimeRefs.transformationId
                  : null,
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
      attemptedLayers.event = true;
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
      attemptedLayers.global = true;
      promises.push(
        retrieveGlobalMemories({
          supabase: opts.supabase,
          userId: opts.userId,
          message: opts.message,
          maxResults: 3,
          requestId: opts.requestId,
          scope: memoryStrategy.globalScopeFilter ?? undefined,
          cycleId: v2RuntimeRefs.cycleId,
          transformationId: v2RuntimeRefs.transformationId,
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
      attemptedLayers.topic = true;
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
          transformationId: memoryStrategy.topicFilterTransformation
            ? v2RuntimeRefs.transformationId
            : null,
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

  const activePlanId = opts.v2Runtime?.plan?.id ?? null;

  if (activePlanId && (opts.mode === "companion" || opts.mode === "investigator")) {
    const indicators = await loadPlanItemIndicators(
      opts.supabase,
      opts.userId,
      activePlanId,
    );
    if (indicators) {
      context.planItemIndicators = indicators;
      elementsLoaded.push("plan_item_indicators");
    }
  }

  // 8. Short-term context (fil rouge synthétisé)
  if (profile.short_term && !scopedMemoryEligible) {
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
        runtime: opts.v2Runtime,
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
  if (!scopedMemoryEligible && profile.history_depth > 0 && opts.history?.length) {
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
    context.momentumBlockersAddon = formatMomentumBlockersAddon(
      opts.tempMemory,
    );
    if (context.momentumBlockersAddon) {
      elementsLoaded.push("momentum_blockers_addon");
    }
  }

  const coachingInterventionAddon = (opts.tempMemory as any)
    ?.__coaching_intervention_addon;
  const planFeedbackAddon = (opts.tempMemory as any)?.__plan_feedback_addon;
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

  if (
    planFeedbackAddon &&
    opts.mode === "companion"
  ) {
    context.planFeedbackAddon = formatPlanFeedbackAddon(planFeedbackAddon);
    if (context.planFeedbackAddon) {
      elementsLoaded.push("plan_feedback_addon");
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

  // 14a. Defense card win addon (victory acknowledged by dispatcher)
  const defenseCardWinAddon = (opts.tempMemory as any)
    ?.__defense_card_win_addon;
  if (
    defenseCardWinAddon &&
    opts.mode === "companion"
  ) {
    context.defenseCardWinAddon = formatDefenseCardWinAddon(defenseCardWinAddon);
    if (context.defenseCardWinAddon) {
      elementsLoaded.push("defense_card_win_addon");
    }
  }

  // 14b. Defense card pending triggers (detected by watcher batch)
  const defenseCardPendingTriggers = (opts.tempMemory as any)
    ?.__defense_card_pending_triggers;
  if (
    defenseCardPendingTriggers &&
    opts.mode === "companion"
  ) {
    context.defenseCardPendingTriggersAddon =
      formatDefenseCardPendingTriggersAddon(defenseCardPendingTriggers);
    if (context.defenseCardPendingTriggersAddon) {
      elementsLoaded.push("defense_card_pending_triggers_addon");
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
  const v2LayersLoaded = new Set<MemoryLayerScope>();
  if (memoryStrategy.v2Intent) {
    if (attemptedLayers.identity && memoryStrategy.loadIdentity) {
      v2LayersLoaded.add("relational");
    }
    if (attemptedLayers.event) v2LayersLoaded.add("event");
    if (attemptedLayers.topic) v2LayersLoaded.add("execution");
    if (attemptedLayers.global) {
      const observedScopes = observedGlobalResults
        .map((row) => row.scope)
        .filter((scope): scope is "cycle" | "transformation" | "relational" =>
          scope === "cycle" || scope === "transformation" ||
          scope === "relational"
        );
      if (observedScopes.length > 0) {
        for (const scope of observedScopes) v2LayersLoaded.add(scope);
      } else if (memoryStrategy.globalScopeFilter) {
        for (const scope of memoryStrategy.globalScopeFilter) {
          if (
            scope === "cycle" || scope === "transformation" ||
            scope === "relational"
          ) {
            v2LayersLoaded.add(scope);
          }
        }
      }
    }
    if (
      context.shortTerm || context.planItemIndicators ||
      context.momentumBlockersAddon ||
      context.coachingInterventionAddon
    ) {
      v2LayersLoaded.add("coaching");
    }
  }

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
  await tryLogV2MemoryRetrieval({
    supabase: opts.supabase,
    userId: opts.userId,
    cycleId: v2RuntimeRefs.cycleId,
    transformationId: v2RuntimeRefs.transformationId,
    strategy: memoryStrategy,
    layersLoaded: [...v2LayersLoaded],
    hitCount: observedEventResults.length + observedGlobalResults.length +
      observedTopicResults.length + (context.identity ? 1 : 0),
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
  if (loaded.whatsappFilRouge) ctx += loaded.whatsappFilRouge;
  if (loaded.shortTerm) ctx += loaded.shortTerm;
  if (loaded.recentTurns) ctx += loaded.recentTurns;
  if (loaded.northStarContext) ctx += loaded.northStarContext + "\n\n";
  if (loaded.weeklyRecapContext) ctx += loaded.weeklyRecapContext + "\n\n";
  if (loaded.planItemIndicators) ctx += loaded.planItemIndicators + "\n\n";
  if (loaded.identity) ctx += loaded.identity;
  if (loaded.eventMemories) ctx += loaded.eventMemories;
  if (loaded.globalMemories) ctx += loaded.globalMemories;
  if (loaded.topicMemories) ctx += loaded.topicMemories;
  if (loaded.surfaceOpportunityAddon) ctx += loaded.surfaceOpportunityAddon;
  if (loaded.onboardingAddon) ctx += loaded.onboardingAddon;
  if (loaded.trackProgressAddon) ctx += loaded.trackProgressAddon;
  if (loaded.momentumBlockersAddon) ctx += loaded.momentumBlockersAddon;
  if (loaded.coachingInterventionAddon) ctx += loaded.coachingInterventionAddon;
  if (loaded.planFeedbackAddon) ctx += loaded.planFeedbackAddon;
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
  if (loaded.defenseCardWinAddon) ctx += loaded.defenseCardWinAddon;
  if (loaded.defenseCardPendingTriggersAddon) {
    ctx += loaded.defenseCardPendingTriggersAddon;
  }
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

function describeSurfaceCtaStyle(
  style: SurfaceRuntimeAddon["cta_style"],
): string {
  if (style === "direct") {
    return "CTA direct autorisé si la surface colle vraiment au besoin.";
  }
  if (style === "soft") {
    return "Préférer une invitation douce plutôt qu'une injonction.";
  }
  return "Pas de CTA explicite. Rester dans une allusion ou une proposition implicite.";
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
  const rows = Array.isArray(data)
    ? data as Array<Record<string, unknown>>
    : [];
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
    .select(
      "title,duration_label,bullet_points,speech_map,topic_tags,updated_at",
    )
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
  runtime?: ActiveTransformationRuntime | null;
}): Promise<string> {
  const query = String(args.addon.query_hint ?? args.message ?? "").trim();
  const contentLimit = args.addon.level >= 4 ? 2 : 1;
  const definition = getSurfaceDefinition(args.addon.surface_id);
  if (!definition) return "";

  switch (definition.contentSource) {
    case "none":
      return "";
    case "north_star": {
      const block = await loadNorthStarContext(
        args.supabase,
        args.userId,
        args.runtime,
      );
      return block
        ? `${block.trim()}\n`
        : "- Aucune étoile polaire active connue.\n";
    }
    case "reminders": {
      const block = await loadRendezVousSummary(args.supabase, args.userId);
      return block ? `${block.trim()}\n` : "";
    }
    case "preferences":
      return await loadPreferencesSurfaceSummary(args.supabase, args.userId) ??
        "";
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
  runtime?: ActiveTransformationRuntime | null;
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
    return `\n\n=== ADDON TRACK_PROGRESS (PARALLELE) ===\n- Le user a parlé de progression, mais le log auto n'a pas pu être confirmé.\n- Le chat peut seulement TRACKER le progrès, pas reconfigurer le plan.\n- Si possible, demande une précision courte (quel item + fait/raté/partiel).\n- Si ça reste ambigu, propose 2 options: mise à jour directe dans le dashboard OU attendre le prochain bilan.\n- Indice interne: ${msg}\n`;
  }
  return `\n\n=== ADDON TRACK_PROGRESS (PARALLELE) ===\n- Le progrès a été loggé automatiquement (ne relance pas le tool).\n- Le chat peut seulement TRACKER le progrès, pas reconfigurer le plan.\n- Tu peux continuer le flow normalement et acquiescer si besoin.\n- Résultat: ${msg}\n`;
}

function formatPlanFeedbackAddon(addon: any): string {
  const sentiment = String(addon?.sentiment ?? "neutral").trim().toLowerCase();
  const targetTitle = String(addon?.target_title ?? "").trim().slice(0, 120);
  const detail = String(addon?.detail ?? "").trim().slice(0, 160);
  const fromBilan = Boolean(addon?.from_bilan);
  const sentimentLine = sentiment === "positive"
    ? "positif"
    : sentiment === "negative"
    ? "négatif"
    : "mitigé/neutre";
  const targetLine = targetTitle ? `- Item concerné: ${targetTitle}.\n` : "";
  const detailLine = detail ? `- Détail remonté: ${detail}.\n` : "";
  return (
    `\n\n=== ADDON PLAN FEEDBACK ===\n` +
    `- L'utilisateur donne un feedback ${sentimentLine} sur son plan.\n` +
    targetLine +
    detailLine +
    `- Réponds d'abord sur le fond: reconnaître le ressenti, clarifier si utile, aider à interpréter ce que ça dit du plan.\n` +
    `- Le chat ne modifie pas le plan en direct. Si une adaptation UI devient utile, propose ensuite le dashboard sans annoncer qu'un changement a déjà été fait.\n` +
    (fromBilan
      ? `- Le bilan reste prioritaire: intègre ce feedback brièvement puis reprends le fil.\n`
      : "")
  );
}

function formatMomentumBlockersAddon(tempMemory: any): string {
  const momentum = readMomentumStateV2(tempMemory);
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

export function formatDashboardRedirectAddon(addon: any): string {
  const intents = Array.isArray(addon?.intents)
    ? addon.intents.filter((v: unknown) => typeof v === "string").slice(0, 4)
    : [];
  const intentText = intents.length > 0 ? intents.join(", ") : "plan_item";
  const fromBilan = Boolean(addon?.from_bilan);
  return (
    `\n\n=== ADDON DASHBOARD REDIRECT ===\n` +
    `- Intention détectée: ${intentText}.\n` +
    `- Cet add-on sert à orienter vers le dashboard V2 réel, sans exécution dans le chat.\n` +
    `- Réponds utilement et naturellement, puis redirige vers le tableau de bord.\n` +
    `- Règle produit forte: dans le chat, Sophia peut seulement tracker le progrès et clarifier le besoin. Les changements de plan se font dans le dashboard.\n` +
    `- Anti-répétition: ne répète jamais la même redirection dashboard sur 2 tours consécutifs.\n` +
    `- Si la redirection vient d'être donnée, continue sur le contenu (paramètres, clarifications) sans renvoyer encore vers l'UI.\n` +
    `- Guide dashboard V2: pense en cartes North Star, sections Soutien / Missions / Habitudes, cartes de plan item, habitudes ancrées et aperçus de déblocage.\n` +
    (fromBilan
      ? `- Le bilan reste prioritaire: confirme la redirection dashboard puis reprends l'item du bilan.\n`
      : "") +
    `- Interdiction d'annoncer qu'un plan item a été créé, modifié, activé ou désactivé depuis le chat.\n` +
    `- Aucune reconfiguration du plan n'est exécutée dans le chat: tout se fait dans le dashboard.\n`
  );
}

export function formatDashboardCapabilitiesLiteAddon(): string {
  return (
    `\n\n=== ADDON TABLEAU DE BORD (LITE / ALWAYS-ON) ===\n` +
    `- Support de connaissance global: utilise ces infos seulement si c'est pertinent pour la question du user.\n` +
    `- Cartographie dashboard V2:\n` +
    `  - Header & stratégie: focus actuel, intention identitaire, mantra.\n` +
    `  - Carte North Star: objectif du cycle + progression actuelle.\n` +
    `  - Sections dimensions: Soutien, Missions, Habitudes.\n` +
    `  - Cartes plan item: statut, progression, accès au détail.\n` +
    `  - Habit maintenance strip: habitudes déjà ancrées, repliées par défaut.\n` +
    `  - Unlock preview: aperçu discret de ce qui se débloquera ensuite.\n` +
    `- Règles d'usage:\n` +
    `  - Réponds d'abord au besoin immédiat du user, sans réciter toute la liste.\n` +
    `  - Si la demande concerne l'objectif global, parle de la carte North Star.\n` +
    `  - Si la demande concerne un item du plan, oriente vers la bonne section dimensionnelle (Soutien, Missions, Habitudes).\n` +
    `  - Dans le chat, seul le tracking de progression peut être exécuté. Toute reconfiguration du plan doit être faite dans le dashboard.\n` +
    `  - Si c'est pertinent ET confiance > 0.9, tu peux pousser UNE surface dashboard complémentaire.\n` +
    `- Interdiction: aucune modification réelle du plan n'est exécutée dans le chat.\n`
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

export function formatDashboardCapabilitiesAddon(addon: any): string {
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
    `- CARTOGRAPHIE DASHBOARD V2 (SOURCE DE VÉRITÉ):\n` +
    `  1) Header & stratégie: titre de transformation, user summary, intention identitaire, mantra.\n` +
    `  2) North Star & Progress: carte cycle-level + indicateurs secondaires.\n` +
    `  3) Soutien: boîte à outils, avec cartes useful now / always available / unlockable.\n` +
    `  4) Missions: cartes de missions actives et jalons clés.\n` +
    `  5) Habitudes: en construction, à adapter, habitudes ancrées.\n` +
    `  6) Anticipation & suite: aperçus de déblocage / prochain focus.\n` +
    `\n` +
    `- DÉTAILS PAR SURFACE:\n` +
    `  - North Star card: explique l'objectif du cycle, la valeur actuelle, la cible et l'historique récent.\n` +
    `  - Support section: pour les outils utiles maintenant, les ressources toujours disponibles et les supports déblocables.\n` +
    `  - Mission cards: pour les tâches/jalons actifs et leur progression.\n` +
    `  - Habit cards: pour suivre l'ancrage, voir ce qui est à adapter, ou ouvrir le strip de maintenance.\n` +
    `  - Unlock preview: pour montrer ce qui arrive ensuite sans surcharger.\n` +
    `\n` +
    `- STRATÉGIE DE LONGUEUR (anti-réponse trop longue):\n` +
    `  - Niveau 1 (par défaut): donner une vue d'ensemble courte et structurée des surfaces V2.\n` +
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
    `  - Dans le chat, seule la progression peut être enregistrée.\n` +
    `  - N'affirme jamais qu'une modification du plan est déjà appliquée depuis le chat.\n` +
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

const POSITIVE_PLAN_ITEM_ENTRY_KINDS = new Set<
  UserPlanItemEntryRow["entry_kind"]
>([
  "checkin",
  "progress",
  "partial",
]);

const NEGATIVE_PLAN_ITEM_ENTRY_KINDS = new Set<
  UserPlanItemEntryRow["entry_kind"]
>([
  "skip",
  "blocker",
]);

function formatDimensionLabel(
  dimension: PlanItemRuntimeRow["dimension"],
): string {
  switch (dimension) {
    case "support":
      return "soutien";
    case "missions":
      return "missions";
    case "habits":
      return "habitudes";
    default:
      return String(dimension);
  }
}

function computePlanItemStreak(entries: UserPlanItemEntryRow[]): number {
  let streak = 0;
  for (const entry of entries) {
    if (POSITIVE_PLAN_ITEM_ENTRY_KINDS.has(entry.entry_kind)) {
      streak += 1;
      continue;
    }
    break;
  }
  return streak;
}

function computePlanItemTrend(
  entries: UserPlanItemEntryRow[],
): "en hausse" | "stable" | "en baisse" {
  const sample = entries.slice(0, 5);
  if (sample.length === 0) return "stable";

  let positiveCount = 0;
  let negativeCount = 0;
  for (const entry of sample) {
    if (POSITIVE_PLAN_ITEM_ENTRY_KINDS.has(entry.entry_kind)) {
      positiveCount += 1;
    }
    if (NEGATIVE_PLAN_ITEM_ENTRY_KINDS.has(entry.entry_kind)) {
      negativeCount += 1;
    }
  }

  if (positiveCount >= negativeCount + 1) return "en hausse";
  if (negativeCount >= positiveCount + 1) return "en baisse";
  return "stable";
}

function formatRecentMetricHistory(
  payload: Record<string, unknown> | null | undefined,
  unit: string | null,
): string {
  const history = Array.isArray(payload?.history)
    ? (payload?.history as Record<string, unknown>[]).slice(-3).reverse()
    : [];
  if (history.length === 0) return "- Historique récent: indisponible\n";

  const lines = history.map((row) => {
    const at = String(row?.at ?? "").trim().slice(0, 10) || "date inconnue";
    const value = row?.value == null ? "?" : String(row.value);
    return `  - ${at}: ${value}${unit ? ` ${unit}` : ""}`;
  });
  return `- Historique récent:\n${lines.join("\n")}\n`;
}

function extractWeeklySnapshotWeekStart(
  snapshot: Pick<SystemRuntimeSnapshotRow, "payload">,
): string {
  const payload = snapshot.payload ?? {};
  const metadata = payload.metadata;
  const weekStart = typeof payload.week_start === "string" && payload.week_start
    ? payload.week_start
    : typeof metadata === "object" && metadata &&
        typeof (metadata as Record<string, unknown>).week_start === "string"
    ? String((metadata as Record<string, unknown>).week_start)
    : "";
  return weekStart.trim();
}

export function formatWeeklyRecapSnapshot(
  snapshot: Pick<
    SystemRuntimeSnapshotRow,
    "snapshot_type" | "payload" | "created_at"
  >,
): string | null {
  const payload = snapshot.payload ?? {};
  const metadata = typeof payload.metadata === "object" && payload.metadata
    ? payload.metadata as Record<string, unknown>
    : {};
  const output = typeof metadata.output === "object" && metadata.output
    ? metadata.output as Record<string, unknown>
    : {};

  const weekStart = extractWeeklySnapshotWeekStart(snapshot) ||
    String(payload.created_at ?? snapshot.created_at ?? "").slice(0, 10);
  const decision = String(
    payload.decision ?? metadata.decision ?? output.decision ?? "",
  ).trim();
  const adjustmentCountRaw = Number(
    payload.adjustment_count ??
      metadata.adjustment_count ??
      (Array.isArray(output.load_adjustments)
        ? output.load_adjustments.length
        : 0),
  );
  const adjustmentCount = Number.isFinite(adjustmentCountRaw)
    ? Math.max(0, Math.floor(adjustmentCountRaw))
    : 0;
  const posture = String(
    payload.suggested_posture_next_week ??
      output.suggested_posture_next_week ??
      "",
  ).trim();
  const summary = String(
    payload.summary ??
      payload.reasoning ??
      output.coaching_note ??
      output.reasoning ??
      metadata.summary ??
      "",
  ).trim();

  if (!decision && !summary && adjustmentCount === 0) return null;

  let block = "=== RECAP BILAN HEBDO PRÉCÉDENT (V2) ===\n";
  if (weekStart) block += `- Semaine: ${weekStart}\n`;
  if (decision) block += `- Décision: ${decision}\n`;
  block += `- Ajustements retenus: ${adjustmentCount}\n`;
  if (posture) block += `- Posture semaine suivante: ${posture}\n`;
  if (summary) block += `- Synthèse: ${summary.slice(0, 500)}\n`;
  block +=
    "- Utilise ce recap pour garder la continuité, sans le réciter mot à mot.\n";
  return block;
}

export function formatNorthStarMetricContext(
  metric: Pick<
    UserMetricRow,
    "title" | "unit" | "current_value" | "target_value" | "status" | "payload"
  >,
): string {
  const title = String(metric.title ?? "North Star").trim() || "North Star";
  const unit = String(metric.unit ?? "").trim() || null;
  const status = String(metric.status ?? "unknown").trim() || "unknown";
  const currentValue = metric.current_value == null
    ? "?"
    : String(metric.current_value);
  const targetValue = metric.target_value == null
    ? "?"
    : String(metric.target_value);

  return (
    `=== NORTH STAR ACTIVE (V2) ===\n` +
    `- Titre: ${title}\n` +
    `- Valeur actuelle: ${currentValue}${unit ? ` ${unit}` : ""}\n` +
    `- Cible: ${targetValue}${unit ? ` ${unit}` : ""}\n` +
    `- Statut: ${status}\n` +
    formatRecentMetricHistory(metric.payload, unit) +
    `- Consigne: relie les conseils et les ajustements de plan à cette North Star.\n`
  );
}

export function formatPlanItemIndicatorsBlock(
  planItems: PlanItemRuntimeRow[],
): string {
  const relevantItems = planItems
    .filter((item) =>
      item.status === "active" || item.status === "in_maintenance" ||
      item.status === "stalled"
    )
    .slice(0, 8);

  if (relevantItems.length === 0) return "";

  let block = "=== INDICATEURS PLAN ITEMS (V2) ===\n";
  for (const item of relevantItems) {
    const streak = computePlanItemStreak(item.recent_entries);
    const trend = computePlanItemTrend(item.recent_entries);
    const lastEntry = item.last_entry_at
      ? String(item.last_entry_at).slice(0, 10)
      : "jamais";
    block += `- ${item.title} [${
      formatDimensionLabel(item.dimension)
    }] | streak=${streak} | dernier=${lastEntry} | tendance=${trend}\n`;
  }
  block +=
    "- Utilise ces indicateurs comme repères de traction et d'ajustement, sans dramatiser.\n";
  return block;
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

    const { data: snapshots, error } = await supabase
      .from("system_runtime_snapshots")
      .select("snapshot_type,payload,created_at")
      .eq("user_id", userId)
      .in("snapshot_type", [
        "weekly_bilan_completed_v2",
        "weekly_bilan_decided_v2",
        "weekly_bilan",
        "weekly_digest",
      ])
      .order("created_at", { ascending: false })
      .limit(12);

    if (error || !snapshots || snapshots.length === 0) return null;

    const matching =
      (snapshots as SystemRuntimeSnapshotRow[]).find((snapshot) =>
        extractWeeklySnapshotWeekStart(snapshot) === previousWeekStart
      ) ?? (snapshots as SystemRuntimeSnapshotRow[])[0];

    return matching ? formatWeeklyRecapSnapshot(matching) : null;
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
  runtime?: ActiveTransformationRuntime | null,
): Promise<string | null> {
  try {
    const resolvedRuntime = runtime ??
      await getActiveTransformationRuntime(supabase, userId);
    if (!resolvedRuntime.cycle) return null;

    const { data, error } = await supabase
      .from("user_metrics")
      .select("*")
      .eq("user_id", userId)
      .eq("cycle_id", resolvedRuntime.cycle.id)
      .eq("scope", "cycle")
      .eq("kind", "north_star")
      .in("status", ["active", "completed"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return formatNorthStarMetricContext(data as UserMetricRow);
  } catch {
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

function formatDefenseCardPendingTriggersAddon(addon: any): string {
  if (!addon || typeof addon !== "object") return "";

  const triggers = Array.isArray(addon.triggers) ? addon.triggers : [];
  if (triggers.length === 0) return "";

  const detectedAt = String(addon.detected_at ?? "").trim();
  if (detectedAt) {
    const ageMs = Date.now() - new Date(detectedAt).getTime();
    if (ageMs > 48 * 60 * 60 * 1000) return "";
  }

  const triggerLines = triggers
    .slice(0, 3)
    .map((t: any, i: number) => {
      const situation = String(t.situation ?? "").trim().slice(0, 160);
      const signal = String(t.signal ?? "").trim().slice(0, 160);
      const impulseId = String(t.impulse_id ?? "").trim();
      return `${i + 1}. Pulsion "${impulseId}" — Situation: "${situation}" | Signal: "${signal}"`;
    })
    .join("\n");

  return (
    `\n\n=== ADDON NOUVELLES SITUATIONS DÉTECTÉES (carte de défense) ===\n` +
    `Le veilleur a détecté de nouvelles situations à risque dans les conversations récentes.\n` +
    `Tu peux PROPOSER (sans forcer) à l'utilisateur de les ajouter à sa carte de défense.\n` +
    `Formule la proposition naturellement, ex: "J'ai remarqué que tu as mentionné [situation]. Tu veux qu'on l'ajoute à ta carte de défense ?"\n` +
    `Ne propose que si le moment s'y prête (pas en plein sujet émotionnel).\n` +
    `${triggerLines}\n`
  );
}

function formatDefenseCardWinAddon(addon: any): string {
  if (!addon || typeof addon !== "object") return "";

  const situationHint = String(addon.situation_hint ?? "").trim().slice(0, 160);
  const winLogged = Boolean(addon.win_logged);
  const impulseId = String(addon.impulse_id ?? "").trim().slice(0, 80);
  const cardSummary = String(addon.card_summary ?? "").trim().slice(0, 400);

  const lines = [
    "\n\n=== ADDON VICTOIRE CARTE DE DEFENSE ===",
    "Le dispatcher a détecté que l'utilisateur a RÉSISTÉ à une pulsion/tentation.",
  ];

  if (situationHint) {
    lines.push(`Situation décrite: "${situationHint}"`);
  }

  if (winLogged && impulseId) {
    lines.push(
      `Victoire loguée automatiquement pour la pulsion "${impulseId}".`,
    );
    lines.push(
      "Confirme brièvement et chaleureusement cette victoire (ex: 'Bien joué ! Je note cette victoire dans ta carte.').",
    );
  } else {
    lines.push(
      "La victoire n'a pas encore pu être loguée — félicite quand même l'utilisateur pour sa résistance.",
    );
  }

  if (cardSummary) {
    lines.push(`Carte de défense: ${cardSummary}`);
  }

  lines.push(
    "Reste naturelle, concise, empathique. Ne mentionne pas les termes techniques (dispatcher, addon, signal).\n",
  );

  return lines.join("\n");
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

async function loadPlanItemIndicators(
  supabase: SupabaseClient,
  userId: string,
  planId: string,
): Promise<string> {
  try {
    const runtime = await getPlanItemRuntime(supabase, planId, {
      maxEntriesPerItem: 5,
    });
    return formatPlanItemIndicatorsBlock(runtime);
  } catch (e) {
    console.warn(
      "[ContextLoader] failed to load plan item indicators (non-blocking):",
      e,
    );
    return "";
  }
}
