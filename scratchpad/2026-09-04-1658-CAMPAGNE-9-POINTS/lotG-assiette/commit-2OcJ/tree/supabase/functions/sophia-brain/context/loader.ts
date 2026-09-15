/**
 * Context Loader - Chargement modulaire du contexte par agent
 *
 * Ce module centralise le chargement du contexte pour tous les agents,
 * en utilisant les profils définis dans types.ts pour charger uniquement
 * ce qui est nécessaire.
 */

declare const Deno: any;

import { createClient } from "jsr:@supabase/supabase-js@2";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { logMemoryObservabilityEvent } from "../../_shared/memory-observability.ts";
import {
  filterRetractedMemoryItems,
  retractedContentSegments,
} from "../../_shared/memory/memorizer/retraction_guard.ts";

let cachedServiceRoleLedgerClient: SupabaseClient | null | undefined = undefined;

/**
 * `turn_summary_logs` holds the EffectLedger and is not exposed to end users via
 * RLS. The WhatsApp path already runs the brain with a service-role client, but
 * the web/test paths use a user-scoped client, so recent-effect reads come back
 * empty and visible agents lose the proof that a durable effect was committed.
 * Build a service-role client (when the key is present) that callers pass to the
 * loaders as `ledgerReadClient` so proofs are consistent across channels.
 * Returns undefined when no service-role key is available; callers then fall
 * back to their user-scoped client.
 *
 * Kept separate from the loaders (which only consume the explicit param) so unit
 * tests can inject a mock client without an env-derived client shadowing it.
 */
export function serviceRoleLedgerReadClient(): SupabaseClient | undefined {
  if (cachedServiceRoleLedgerClient !== undefined) {
    return cachedServiceRoleLedgerClient ?? undefined;
  }
  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    cachedServiceRoleLedgerClient = url && serviceKey
      ? createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      }) as unknown as SupabaseClient
      : null;
  } catch {
    cachedServiceRoleLedgerClient = null;
  }
  return cachedServiceRoleLedgerClient ?? undefined;
}
import { logV2Event, V2_EVENT_TYPES } from "../../_shared/v2-events.ts";
// FF-023 — écrivain UNIQUE des lignes d'historique récent, partagé avec le
// bloc visible du composeur (`agents/companion.ts`).
import { formatRecentHistoryLine } from "../../_shared/chat/recent_history.ts";
import { isFrenchLocale } from "../../_shared/keel/locale.ts";
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
  UserPlanItemEntryRow,
} from "../../_shared/v2-types.ts";
import type { AgentMode } from "../state-manager.ts";
import { getCoreIdentity } from "../state-manager.ts";
import {
  formatUserProfileFactsForPrompt,
  getUserProfileFacts,
} from "../profile_facts.ts";
import type { DispatcherMemoryPlan } from "../router/dispatcher.ts";
import type { PersistedEffectLedgerEntry } from "../router/effect_ledger.ts";
import { loadRecentEffectHistory } from "../router/effect_ledger_reader.ts";
import type { SurfaceRuntimeAddon } from "../surface_state.ts";
import { getSurfaceDefinition } from "../surface_registry.ts";
import { DAILY_CONVERSATION_PULSE_V2_SNAPSHOT_TYPE } from "../conversation_pulse_builder.ts";
// R2: getActiveTopicSession removed (topic sessions disabled)
import type {
  ContextProfile,
  LoadedContext,
  OnDemandTriggers,
} from "./types.ts";
import { getContextProfile } from "./types.ts";
import {
  readMomentumStateV2,
  summarizeMomentumBlockersForPrompt,
} from "../momentum_state.ts";
import { formatCoachingInterventionAddon } from "../coaching_intervention_selector.ts";

const IDENTITY_MAX_ITEMS = 2;
const IDENTITY_MAX_BLOCK_TOKENS = 280;
const CORE_IDENTITY_RETRIEVAL_ENABLED = false;

type DispatcherMemoryBudget = {
  domainMax: number;
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
  domainPrefixKeys: string[];
  domainKeys: string[];
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
    domainMax: 2,
    explicitTopicQueriesMax: 1,
    explicitEventQueriesMax: 1,
    explicitTopicResultsPerQuery: 1,
    explicitEventResultsPerQuery: 1,
    semanticGlobalMax: 1,
    semanticTopicMax: 1,
    semanticEventMax: 1,
  },
  small: {
    domainMax: 3,
    explicitTopicQueriesMax: 1,
    explicitEventQueriesMax: 1,
    explicitTopicResultsPerQuery: 1,
    explicitEventResultsPerQuery: 1,
    semanticGlobalMax: 2,
    semanticTopicMax: 1,
    semanticEventMax: 1,
  },
  medium: {
    domainMax: 4,
    explicitTopicQueriesMax: 2,
    explicitEventQueriesMax: 2,
    explicitTopicResultsPerQuery: 2,
    explicitEventResultsPerQuery: 1,
    semanticGlobalMax: 3,
    semanticTopicMax: 2,
    semanticEventMax: 2,
  },
  large: {
    domainMax: 6,
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
  turnId?: string;
  channel?: "web" | "whatsapp";
  mode: AgentMode;
  message: string;
  history: any[];
  state: any;
  scope: string;
  tempMemory?: any;
  /**
   * `UserTimeContext` (`_shared/user_time_context.ts`). Les trois champs
   * au-delà de `prompt_block` sont ceux que FF-023 consomme pour dater
   * l'historique récent: l'horloge du tour, le fuseau DE LA PERSONNE
   * (`profiles.timezone`) et sa langue. Ils étaient déjà passés par
   * `router/run.ts`; seul le type les ignorait — et un type qui ignore un
   * champ le rend invisible au prochain qui en a besoin.
   */
  userTime?: {
    prompt_block?: string;
    now_utc?: string;
    user_timezone?: string;
    user_locale?: string;
  };
  triggers?: OnDemandTriggers;
  injectedContext?: string;
  deferredUserPrefContext?: string;
  memoryPlan?: DispatcherMemoryPlan;
  v2Intent?: MemoryRetrievalIntent;
  v2CycleId?: string | null;
  v2TransformationId?: string | null;
  v2Runtime?: ActiveTransformationRuntime | null;
  /**
   * Élève d'un coach KEEL (`keelTurn.is_student`). Sert à NE PAS lui décrire
   * un tableau de bord qu'il n'a pas — voir `formatDashboardCapabilitiesLiteAddon`.
   *
   * Le défaut `false` est VOULU, pas un oubli: c'est l'assemblage du produit
   * grand public, qui tourne encore depuis ce code sur un autre projet
   * Supabase et doit rester identique. Même patron que
   * `DispatcherPromptAudience.keelStudent` et que `run.ts` W4.7 sur le bloc
   * plan. Un seul appelant en production (`router/run.ts`), et il le passe.
   */
  keelStudent?: boolean;
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
      loadIdentity: params.profile.identity && CORE_IDENTITY_RETRIEVAL_ENABLED,
      domainPrefixKeys: [],
      domainKeys: [],
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
  const domainPrefixKeys = uniqueStrings(
    targets
      .filter((target) => target.type === "domain_prefix")
      .map((target) => target.key),
  );
  const domainKeys = uniqueStrings(
    targets
      .filter((target) => target.type === "domain_key")
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
  const loadIdentity = CORE_IDENTITY_RETRIEVAL_ENABLED && !skipAllMemory;
  const hasExplicitDomainTargets = domainPrefixKeys.length > 0 ||
    domainKeys.length > 0;
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
    domainPrefixKeys,
    domainKeys,
    topicQueries,
    eventQueries,
    fallbackSemanticGlobalMax:
      semanticFallbackAllowed && !hasExplicitDomainTargets &&
        params.profile.global_memories
        ? budget.semanticGlobalMax
        : 0,
    fallbackSemanticTopicMax: params.profile.topic_memories &&
        (
          (semanticFallbackAllowed && !hasExplicitDomainTargets &&
            nonInventoryIntent) ||
          (hasExplicitDomainTargets && wantsTopicSupport)
        )
      ? budget.semanticTopicMax
      : 0,
    fallbackSemanticEventMax: params.profile.event_memories &&
        (
          (semanticFallbackAllowed && !hasExplicitDomainTargets &&
            plan.context_need === "targeted" && nonInventoryIntent) ||
          (hasExplicitDomainTargets && wantsEventSupport)
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
    domainMax: Math.min(
      dispatcherBudget.domainMax,
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
      loadIdentity: CORE_IDENTITY_RETRIEVAL_ENABLED &&
        dispatcherStrategy.loadIdentity && v2Plan.load_identity,
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
    loadIdentity: CORE_IDENTITY_RETRIEVAL_ENABLED &&
      params.profile.identity && v2Plan.load_identity,
    domainPrefixKeys: [],
    domainKeys: [],
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

export function describeContextLoaderMemoryBoundary(params: {
  memoryPlan?: DispatcherMemoryPlan | null;
}): Record<string, unknown> {
  return {
    consumes_memory_plan: Boolean(params.memoryPlan),
    owns: ["LoadedContext", "materialized_memory"],
    must_not: ["choose_route_owner", "write_memory"],
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
 * FF-023 — LES LIGNES DU BLOC « HISTORIQUE RÉCENT », DATÉES.
 *
 * Ce bloc datait déjà chaque ligne, mais en ISO UTC brut
 * (`[2026-08-09T14:02:11.123Z] user: …`). Deux défauts, qu'un écrivain unique
 * (`formatRecentHistoryLine`) corrige tous les deux:
 *   · un ISO oblige le modèle à faire une soustraction de dates pour savoir si
 *     c'est vieux, et il la fait mal — cicatrice
 *     `named-day-calendar-vs-model-prior`: on NOMME la conclusion au lieu de
 *     livrer la donnée brute;
 *   · il est en UTC, donc « hier soir » pour la personne pouvait s'y lire
 *     « aujourd'hui ». Le fuseau vient de `profiles.timezone`, porté par
 *     `opts.userTime.user_timezone`.
 *
 * EXPORTÉE POUR ÊTRE TESTABLE: câblée en ligne dans `loadContextForMode`, la
 * seule façon de vérifier qu'elle reçoit bien l'horloge et le fuseau aurait
 * été de monter un faux client Supabase complet — c'est-à-dire de ne pas la
 * tester du tout.
 */
export function formatRecentTurnsLines(
  history: unknown[],
  depth: number,
  userTime?: { now_utc?: string; user_timezone?: string; user_locale?: string },
): string {
  const french = isFrenchLocale(userTime?.user_locale ?? "fr-FR");
  const window = Math.max(0, Math.floor(depth));
  // `slice(-0)` rend le tableau ENTIER: une profondeur nulle doit rendre vide.
  return (window === 0 ? [] : (Array.isArray(history) ? history : []).slice(-window))
    .map((m) => {
      const row = (m ?? {}) as {
        role?: unknown;
        content?: unknown;
        created_at?: string | null;
      };
      return formatRecentHistoryLine({
        role: String(row.role ?? ""),
        content: String(row.content ?? ""),
        createdAt: row.created_at ?? null,
        nowIso: userTime?.now_utc ?? null,
        timezone: userTime?.user_timezone ?? null,
        french,
        roleLabel: String(row.role ?? "").trim() || "unknown",
        maxContentChars: 420,
      });
    })
    .filter(Boolean)
    .join("\n");
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
  const scopedMemoryEligible = false;
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
  const attemptedLayers = {
    identity: false,
  };

  // Parallel loading of independent elements
  const promises: Promise<void>[] = [];

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

  if (memoryPlanRequestsDailyPulse(opts.memoryPlan)) {
    promises.push(
      loadDailyConversationPulseContext({
        supabase: opts.supabase,
        userId: opts.userId,
      }).then((block) => {
        if (block) {
          context.dailyConversationPulseContext = block;
          elementsLoaded.push("daily_conversation_pulse_context");
        }
      }),
    );
  }

  // Durable effects summary (chantier 2 phase B): injecté uniquement en mode
  // companion (où vit normal_reply). Empêche le LLM d'halluciner l'absence
  // d'effets durables qui existent vraiment côté DB (cartes, rappels,
  // préférences coach). Voir A2-r4 Tour 9.
  if (opts.mode === "companion") {
    promises.push(
      loadDurableEffectsSummary(opts.supabase, opts.userId).then((block) => {
        if (block) {
          context.durableEffectsSummary = block;
          elementsLoaded.push("durable_effects_summary");
        }
      }),
    );
    promises.push(
      loadRecentEffectsLedgerSummary({
        supabase: opts.supabase,
        userId: opts.userId,
        scope: opts.scope,
        userTimePromptBlock: opts.userTime?.prompt_block,
        // rose-r7 B03 / eva-r9 B03: turn_summary_logs est un log interne non
        // expose par RLS — sans client service-role, ce bloc etait
        // silencieusement VIDE sur le chemin web (le seul call site sans),
        // et les recaps de session omettaient les effets crees/annules.
        ledgerReadClient: serviceRoleLedgerReadClient(),
      }).then((block) => {
        if (block) {
          context.recentEffectsSummary = block;
          elementsLoaded.push("recent_effects_summary");
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

  // 2b. RETRAIT RÉSIDUS GRAND PUBLIC (2026-08-08) — le bloc « RAPPELS
  // RÉCURRENTS CONFIGURÉS » est parti avec `user_recurring_reminders`
  // (migration 20260808080000). Les rappels PONCTUELS restent portés par
  // « ÉTAT DURABLE ACTUEL » (scheduled_checkins), qui couvre déjà les
  // questions d'inventaire — la garde BF-STATUS-01 vivait ici parce que ce
  // bloc-ci était partiel; sans lui, la section unique redevient complète.

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

  // Durable memory is V2-only. Legacy event/global/topic/scope loaders are not
  // called here; router/run.ts injects memoryV2Payload after the active loader.

  // Wait for plan metadata before loading dependent elements
  await Promise.all(promises);

  // RETRAIT RÉSIDUS (2026-08-08): la projection « semaine de plan V2 »
  // (currentWeekPlanContext + planItemIndicators) est partie avec le
  // système de plan grand public — 0 utilisateur, tables supprimées.

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
  if (
    !scopedMemoryEligible && profile.history_depth > 0 && opts.history?.length
  ) {
    const recentTurns = formatRecentTurnsLines(
      opts.history ?? [],
      profile.history_depth,
      opts.userTime,
    );

    if (recentTurns) {
      context.recentTurns = `=== HISTORIQUE RÉCENT (${
        Math.min(profile.history_depth, opts.history.length)
      } DERNIERS MESSAGES) ===\n${recentTurns}\n\n`;
      elementsLoaded.push("recent_turns");
    }
    // P10-D (alex-hard24 R1-B05): RÉTRACTATION EN SESSION — un fait
    // explicitement rétracté dans le fil (« oublie ça, garde surtout pas
    // ça ») était restitué 4 tours plus tard par le composeur qui lit
    // l'historique (« ton nouvel objectif te motive… ») alors que le
    // memorizer durable l'honorait. Injection DÉTERMINISTE (mêmes marqueurs
    // que le verrou memorizer P10-D) : les segments rétractés sont nommés au
    // composeur avec l'interdit de restitution. Zéro règle générique de
    // prompt (budget companion), zéro dépendance LLM.
    try {
      const retractedBlock = formatRetractedInSessionBlock(opts.history ?? []);
      if (retractedBlock) {
        context.retractedInSession = retractedBlock;
        elementsLoaded.push("retracted_in_session");
      }
    } catch (_error) {
      // best-effort: l'absence du bloc ne casse jamais le chargement.
    }
  }

  // 9b. P12-E (alex-untested24 R1-B11 volet 2): CONFIÉ EN SESSION — les
  // intentions mémoire explicites (« garde ça en tête »), bufferisées par le
  // router (P6-H, __session_memory_intents) mais jamais servies au récap
  // in-session : un fait confié 80 minutes avant le batch nocturne était NIÉ
  // (« pas d'autre projet explicitement chargé »). Un fait confié PUIS
  // rétracté en session n'est jamais servi (croisement retraction_guard).
  // Companion seulement : c'est le composeur du récap ; les autres modes
  // gardent leur contexte minimal.
  if (opts.mode === "companion") {
    try {
      const sessionIntentsBlock = formatSessionMemoryIntentsBlock(
        opts.tempMemory,
        opts.history ?? [],
      );
      if (sessionIntentsBlock) {
        context.sessionMemoryIntents = sessionIntentsBlock;
        elementsLoaded.push("session_memory_intents");
      }
    } catch (_error) {
      // best-effort: l'absence du bloc ne casse jamais le chargement.
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

  if (opts.tempMemory && opts.mode === "companion") {
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
  const dashboardCapabilitiesAddon = (opts.tempMemory as any)
    ?.__dashboard_capabilities_addon;
  const hasSurfaceOpportunityAddon = Boolean(
    (opts.tempMemory as any)?.__surface_opportunity_addon,
  );

  // 13. Dashboard redirect addon (CRUD intent detected by dispatcher)
  if (dashboardRedirectAddon && opts.mode === "companion") {
    context.dashboardRedirectAddon = formatDashboardRedirectAddon(
      dashboardRedirectAddon,
    );
    if (context.dashboardRedirectAddon) {
      elementsLoaded.push("dashboard_redirect_addon");
    }
  }

  // 13b. Dashboard capabilities lite addon (only when no specific dashboard addon is active)
  //
  // PAS POUR UN ÉLÈVE KEEL. Ce bloc part à CHAQUE tour companion et décrit un
  // tableau de bord grand public que l'élève d'un coach n'a pas: « Ressources:
  // cartes d'attaque, cartes de défense, potions », « Inspirations »,
  // « Initiatives », « Missions », et l'ordre « toute reconfiguration du plan
  // doit être faite dans le dashboard ». La carte de défense qu'il nomme a été
  // supprimée le 2026-08-08 (`20260808030000_drop_defense_card.sql`): le bloc
  // décrivait donc au modèle une capacité qui n'existe plus.
  //
  // ASSEMBLAGE CONDITIONNEL, PAS SUPPRESSION — même raison que
  // `dispatcher.prompts.ts`: le produit grand public tourne encore depuis ce
  // code sur un autre projet Supabase, et son assemblage reste identique.
  const hasSpecificDashboardAddon = Boolean(
    dashboardRedirectAddon ||
      dashboardPreferencesIntentAddon ||
      dashboardCapabilitiesAddon ||
      hasSurfaceOpportunityAddon,
  );
  if (
    opts.mode === "companion" && !hasSpecificDashboardAddon && !opts.keelStudent
  ) {
    context.dashboardCapabilitiesLiteAddon =
      formatDashboardCapabilitiesLiteAddon();
    if (context.dashboardCapabilitiesLiteAddon) {
      elementsLoaded.push("dashboard_capabilities_lite_addon");
    }
  }

  // 14b. Dashboard preferences intent addon (dedicated UX/UI settings redirect)
  if (dashboardPreferencesIntentAddon && opts.mode === "companion") {
    context.dashboardPreferencesIntentAddon =
      formatDashboardPreferencesIntentAddon(
        dashboardPreferencesIntentAddon,
      );
    if (context.dashboardPreferencesIntentAddon) {
      elementsLoaded.push("dashboard_preferences_intent_addon");
    }
  }

  // 14d. Dashboard capabilities addon (umbrella "can be related to dashboard")
  const shouldIncludeDashboardCapabilitiesAddon = Boolean(
    dashboardCapabilitiesAddon &&
      !dashboardRedirectAddon &&
      !dashboardPreferencesIntentAddon,
  );
  if (shouldIncludeDashboardCapabilitiesAddon && opts.mode === "companion") {
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
    if (
      context.shortTerm ||
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
    turnId: opts.turnId,
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
        }),
        globals: summarizeInjectedMemoryBlock(context.globalMemories, {
          loaded: Boolean(context.globalMemories),
        }),
        topics: summarizeInjectedMemoryBlock(context.topicMemories, {
          loaded: Boolean(context.topicMemories),
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
    hitCount: context.identity ? 1 : 0,
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

function historyAsMemorizerMessages(
  history: unknown,
): Array<{ role: "user" | "assistant" | "system"; content: string }> {
  return (Array.isArray(history) ? history : []).map((m: any) => ({
    role: (String(m?.role ?? "") === "user"
      ? "user"
      : String(m?.role ?? "") === "assistant"
      ? "assistant"
      : "system") as "user" | "assistant" | "system",
    content: String(m?.content ?? ""),
  }));
}

/**
 * P10-D + P12-E (eva-hard25 R1-B05): bloc des segments rétractés en session.
 * Le libellé porte l'interdit de RESTITUTION **et de MENTION spontanée** —
 * au run réel le contenu ne fuyait plus mais le composeur nommait
 * spontanément le topic rétracté au récap suivant (« je n'ai pas gardé
 * l'info sur la céramique ») sans y être invité. Pure et exportée pour être
 * testable ; pas de nouvelle règle générique au prompt companion (budget).
 */
export function formatRetractedInSessionBlock(history: unknown): string | null {
  const retractedSegments = retractedContentSegments(
    historyAsMemorizerMessages(history),
  );
  if (retractedSegments.length === 0) return null;
  const lines = retractedSegments
    .slice(0, 3)
    .map((segment) => `- « ${segment.slice(0, 90)} »`)
    .join("\n");
  return `=== RÉTRACTÉ EN SESSION (INTERDIT DE RESTITUTION ET DE MENTION SPONTANÉE) ===\n` +
    `L'utilisateur a explicitement demandé d'oublier ces éléments dans cette conversation. ` +
    `Ne JAMAIS les restituer, les reformuler, ni t'y référer (même « avec la nuance ») — ni comme objectif, ni comme fait, ni comme rappel de ce qui a été dit. ` +
    `N'en mentionne même pas le SUJET spontanément (jamais de « je n'ai pas gardé l'info sur X »). ` +
    // P12-V (probe P12-3 passe 1): l'exception « si l'utilisateur rouvre le
    // sujet » était trop lâche — une question de recall GÉNÉRIQUE (« tu te
    // souviens de ce que je t'ai dit que je voulais faire ? ») se lisait
    // comme une réouverture et l'objectif rétracté ressortait mot pour mot.
    // La réouverture est NOMINATIVE ou n'est pas.
    `SEULE exception : l'utilisateur RENOMME lui-même ce contenu par ses propres mots dans un message POSTÉRIEUR à la rétractation. Une question de recall générique (« tu te souviens de ce que je t'ai dit ? », « qu'est-ce que je voulais faire déjà ? ») ne rouvre RIEN : réponds depuis le reste, sans mentionner ces éléments :\n${lines}\n\n`;
}

/**
 * P12-E (alex-untested24 R1-B11 volet 2): intentions mémoire explicites de
 * la session (« garde ça en tête », buffer __session_memory_intents posé par
 * le router P6-H au tour d'accusé), servies au composeur AVANT le batch
 * memorizer nocturne — sinon un récap « ce que tu sais de moi / mes
 * projets » nie un fait confié 80 minutes plus tôt. Bloc court (≤ 3
 * entrées, tronquées) ; une intention rétractée en session est EXCLUE
 * (croisement retraction_guard : confié puis « oublie ça » ⇒ jamais servi).
 */
export function formatSessionMemoryIntentsBlock(
  tempMemory: unknown,
  history: unknown,
): string | null {
  const rawIntents = Array.isArray(
      (tempMemory as Record<string, unknown>)?.__session_memory_intents,
    )
    ? (tempMemory as Record<string, unknown>)
      .__session_memory_intents as Array<Record<string, unknown>>
    : [];
  const intents = rawIntents
    .map((entry) => String(entry?.text ?? "").trim())
    .filter(Boolean);
  if (intents.length === 0) return null;
  const { kept } = filterRetractedMemoryItems(
    intents.map((text) => ({ content: text })),
    historyAsMemorizerMessages(history),
  );
  if (kept.length === 0) return null;
  const lines = kept
    .slice(-3)
    .map((entry) => `- « ${String(entry.content).slice(0, 200)} »`)
    .join("\n");
  return `=== CONFIÉ EN SESSION (pas encore en mémoire longue) ===\n` +
    `L'utilisateur a explicitement demandé de retenir ces éléments dans CETTE conversation ; la consolidation en mémoire durable se fait la nuit. ` +
    `Dans un récap « ce que tu sais de moi / mes projets », inclus-les — ne les nie JAMAIS :\n${lines}\n\n`;
}

/**
 * Assemble le contexte final en string pour le prompt
 */
export function buildContextString(loaded: LoadedContext): string {
  let ctx = "";

  // Order matters for prompt coherence
  if (loaded.deferredUserPref) ctx += loaded.deferredUserPref;
  if (loaded.injectedContext) ctx += loaded.injectedContext;
  if (loaded.temporal) ctx += loaded.temporal;
  if (loaded.facts) ctx += loaded.facts;
  // Source de vérité DB des effets durables en cours: placée tôt et avant
  // memoryV2Payload pour que le LLM la voie quand il s'apprête à parler
  // d'une carte/rappel/préférence. Voir chantier 2 phase B.
  if (loaded.durableEffectsSummary) ctx += loaded.durableEffectsSummary;
  if (loaded.recentEffectsSummary) ctx += loaded.recentEffectsSummary;
  // Memoire durable V2 placée AVANT les blocs conversationnels volumineux:
  // l'ordre d'assemblage est l'ordre de survie sous le budget prompt du
  // companion (troncature par la queue, ~5k tokens). Les faits durables
  // chargés pour ce tour ne doivent jamais être amputés au profit de
  // shortTerm/recentTurns, déjà largement portés par l'history du modèle.
  if (loaded.memoryV2Payload) ctx += loaded.memoryV2Payload;
  // P12-E (alex-untested24 R1-B11): les faits confiés en session (pas encore
  // batchés) survivent au budget AVANT les blocs volumineux, comme
  // l'interdit de rétractation — un récap qui les nie est un désaveu.
  if (loaded.sessionMemoryIntents) ctx += loaded.sessionMemoryIntents;
  // P10-D: l'interdit de restitution des faits rétractés en session survit
  // au budget AVANT les blocs volumineux — un interdit tronqué = un fait
  // rétracté restitué.
  if (loaded.retractedInSession) ctx += loaded.retractedInSession;
  if (loaded.whatsappFilRouge) ctx += loaded.whatsappFilRouge;
  if (loaded.shortTerm) ctx += loaded.shortTerm;
  if (loaded.recentTurns) ctx += loaded.recentTurns;
  if (loaded.weeklyRecapContext) ctx += loaded.weeklyRecapContext + "\n\n";
  if (loaded.dailyConversationPulseContext) {
    ctx += loaded.dailyConversationPulseContext;
  }
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
  if (loaded.dashboardCapabilitiesAddon) {
    ctx += loaded.dashboardCapabilitiesAddon;
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

// RETRAIT ARCHITECTE — `loadWishlistSurfaceSummary`,
// `loadStoriesSurfaceSummary` et `loadReflectionsSurfaceSummary` sont parties
// avec les surfaces `architect.*`. Leurs tables (`user_architect_wishes`,
// `_stories`, `_reflections`) avaient déjà été droppées le 2026-08-03 par
// `20260803140000_pivot_drop_non_spine_legacy.sql`: ces trois lectures
// interrogeaient des tables inexistantes et rendaient `null` en silence.

async function loadSurfaceSupportingContent(args: {
  supabase: SupabaseClient;
  userId: string;
  addon: SurfaceRuntimeAddon;
  message: string;
  runtime?: ActiveTransformationRuntime | null;
}): Promise<string> {
  const definition = getSurfaceDefinition(args.addon.surface_id);
  // RETRAIT ARCHITECTE — c'est CE test qui porte l'absence des surfaces
  // `architect.*` (wishlist/stories/reflections/quotes), retirées du registre
  // avec leurs tables. Un `surface_id` d'avant le pivot peut encore arriver
  // d'un état conversationnel persisté: il ne résout plus aucune définition et
  // s'arrête ici, avant tout accès DB. Ne remplace pas ce garde par un
  // `default:` du switch — le switch ne serait jamais atteint.
  if (!definition) return "";

  switch (definition.contentSource) {
    case "none":
      return "";
    case "preferences":
      return await loadPreferencesSurfaceSummary(args.supabase, args.userId) ??
        "";
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
    `- Rappel produit à formuler en première personne si nécessaire: dans le chat, je peux comprendre, clarifier et aider l'exécution. Je ne crée pas, ne modifie pas et ne reconfigure pas une action dans le chat.\n`
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
    `- Règle produit forte à formuler en première personne si nécessaire: dans le chat, je peux clarifier le besoin et aider l'exécution. Les changements de plan se font dans le dashboard.\n` +
    `- Anti-répétition: ne répète jamais la même redirection dashboard sur 2 tours consécutifs.\n` +
    `- Si la redirection vient d'être donnée, continue sur le contenu (paramètres, clarifications) sans renvoyer encore vers l'UI.\n` +
    `- Guide dashboard: parle seulement des surfaces produit explicitement connues. Ne mentionne pas d'ancienne surface supprimée.\n` +
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
    `- Cartographie dashboard:\n` +
    `  - Plan: actions, missions, habitudes, ajustements du plan, statut/progression.\n` +
    `  - Ressources: cartes d'attaque, cartes de défense, potions/état et outils consultables/préparables selon disponibilité.\n` +
    `  - Inspirations: contenus ou idées utiles pour nourrir la transformation.\n` +
    `  - Initiatives: messages récurrents Sophia, avec contenu, contexte, horaire, jours actifs/rythme, destination et statut.\n` +
    `- Règles d'usage:\n` +
    `  - Réponds d'abord au besoin immédiat du user, sans réciter toute la liste.\n` +
    `  - Si la demande concerne une action, une mission, une habitude ou un ajustement du plan, oriente vers Plan.\n` +
    `  - Si la demande concerne une carte, une potion ou un outil consultable/préparable, oriente vers Ressources.\n` +
    `  - Si la demande concerne un soutien ou message récurrent, utilise Initiatives.\n` +
    `  - Ne présente pas Soutien, Missions ou Habitudes comme des sections de destination actuelles.\n` +
    `  - Toute reconfiguration du plan doit être faite dans le dashboard.\n` +
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
    `- CARTOGRAPHIE DASHBOARD:\n` +
    `  1) Plan: actions, missions, habitudes, ajustements du plan, statut/progression.\n` +
    `  2) Ressources: cartes d'attaque, cartes de défense, potions/état et outils consultables/préparables selon disponibilité.\n` +
    `  3) Inspirations: contenus ou idées utiles pour nourrir la transformation.\n` +
    `  4) Initiatives: messages récurrents Sophia, avec contenu, contexte, horaire, jours actifs/rythme, destination et statut.\n` +
    `  5) Préférences coach: ton, niveau de challenge, tendance à poser des questions.\n` +
    `\n` +
    `- DÉTAILS PAR SURFACE:\n` +
    `  - Plan: pour actions, missions, habitudes et ajustements.\n` +
    `  - Ressources: pour cartes d'attaque, cartes de défense, potions/état et outils.\n` +
    `  - Inspirations: pour contenus/idees de transformation.\n` +
    `  - Initiatives: pour planifier un message récurrent Sophia; ne pas appeler cela Soutien ou Habitudes.\n` +
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
    `  - Dans le chat, n'affirme pas qu'une progression ou un bilan a été enregistré sans confirmation runtime explicite.\n` +
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


type CurrentWeekPlanRow = {
  plan_item_id: string;
  week_start_date?: string | null;
  status?: string | null;
  confirmed_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type CurrentWeekOccurrenceRow = {
  plan_item_id: string;
  week_start_date?: string | null;
  ordinal?: number | null;
  planned_day?: string | null;
  original_planned_day?: string | null;
  actual_day?: string | null;
  default_day?: string | null;
  status?: string | null;
  source?: string | null;
  validated_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type CurrentWeekEntryRow = {
  plan_item_id: string;
  entry_kind?: string | null;
  outcome?: string | null;
  value_numeric?: number | string | null;
  value_text?: string | null;
  difficulty_level?: string | null;
  blocker_hint?: string | null;
  created_at?: string | null;
  effective_at?: string | null;
};



const CURRENT_WEEK_VISIBLE_ITEM_STATUSES = new Set([
  "active",
  "in_maintenance",
  "stalled",
  "completed",
]);

const DAY_LABELS: Record<string, string> = {
  mon: "lundi",
  tue: "mardi",
  wed: "mercredi",
  thu: "jeudi",
  fri: "vendredi",
  sat: "samedi",
  sun: "dimanche",
};

function compactContextValue(value: unknown, max = 180): string {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function dayLabel(value: unknown): string {
  const key = String(value ?? "").trim();
  return DAY_LABELS[key] ?? key;
}

function formatDayList(days: unknown): string {
  if (!Array.isArray(days) || days.length === 0) return "";
  return days.map(dayLabel).filter(Boolean).join(", ");
}

function formatOccurrenceDayList(
  occurrences: CurrentWeekOccurrenceRow[],
): string {
  const days: string[] = [];
  const seen = new Set<string>();
  for (const occurrence of occurrences) {
    const day = String(occurrence.planned_day ?? "").trim();
    if (!day || seen.has(day)) continue;
    seen.add(day);
    days.push(dayLabel(day));
  }
  return days.join(", ");
}

function formatPayloadForPrompt(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  try {
    const json = JSON.stringify(payload);
    if (!json || json === "{}") return "";
    return compactContextValue(json, 320);
  } catch {
    return "";
  }
}

function extractTimezoneFromUserTimeBlock(block?: string): string {
  const fallback = "Europe/Paris";
  const lines = String(block ?? "").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("user_timezone=")) continue;
    const value = trimmed.slice("user_timezone=".length).trim();
    return value || fallback;
  }
  return fallback;
}


function groupByPlanItemId<T extends { plan_item_id: string }>(
  rows: T[],
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const id = String(row.plan_item_id ?? "").trim();
    if (!id) continue;
    const list = map.get(id) ?? [];
    list.push(row);
    map.set(id, list);
  }
  return map;
}

function formatOccurrenceForPrompt(row: CurrentWeekOccurrenceRow): string {
  const parts = [
    `${dayLabel(row.planned_day)}: status=${row.status ?? "unknown"}`,
    row.source ? `source=${row.source}` : "",
    row.validated_at ? `occurrence_validated_at=${row.validated_at}` : "",
    row.actual_day ? `actual_day=${dayLabel(row.actual_day)}` : "",
  ].filter(Boolean);
  return `    - ${parts.join(" | ")}`;
}

function formatEntryForPrompt(row: CurrentWeekEntryRow): string {
  const parts = [
    row.effective_at ? `effective_at=${row.effective_at}` : "",
    row.entry_kind ? `entry_kind=${row.entry_kind}` : "",
    row.outcome ? `outcome=${row.outcome}` : "",
    row.value_numeric !== null && row.value_numeric !== undefined
      ? `value_numeric=${row.value_numeric}`
      : "",
    row.value_text
      ? `value_text=${compactContextValue(row.value_text, 120)}`
      : "",
    row.difficulty_level ? `difficulty=${row.difficulty_level}` : "",
    row.blocker_hint
      ? `blocker=${compactContextValue(row.blocker_hint, 120)}`
      : "",
    row.created_at ? `created_at=${row.created_at}` : "",
  ].filter(Boolean);
  return `    - ${parts.join(" | ")}`;
}


function shouldInjectWeeklyRecapContext(args: {
  mode: AgentMode;
  state: any;
}): boolean {
  return args.mode === "companion";
}

function memoryPlanRequestsDailyPulse(
  memoryPlan?: DispatcherMemoryPlan | null,
): boolean {
  return Boolean(
    memoryPlan?.targets?.some((target) =>
      target?.type === "runtime_snapshot" &&
      String(target.key ?? "").trim() ===
        "daily_conversation_pulse:current_week"
    ),
  );
}

function formatDailyConversationPulseSnapshots(
  snapshots: SystemRuntimeSnapshotRow[],
): string | null {
  const lines = snapshots
    .map((snapshot) => {
      const payload = snapshot.payload as Record<string, any>;
      const window = payload?.window && typeof payload.window === "object"
        ? payload.window as Record<string, unknown>
        : {};
      const day = String(window.end ?? snapshot.created_at ?? "").slice(0, 10);
      const tone = payload?.tone ?? {};
      const trajectory = payload?.trajectory ?? {};
      const signals = payload?.signals ?? {};
      const anchors = Array.isArray(payload?.emotional_anchors)
        ? payload.emotional_anchors
          .map((anchor: any) => String(anchor?.topic_summary ?? "").trim())
          .filter(Boolean)
          .slice(0, 2)
        : [];
      return [
        `- ${day}`,
        `tone=${String(tone.dominant ?? "unknown")}`,
        `load=${String(tone.emotional_load ?? "unknown")}`,
        `need=${String(signals.likely_need ?? "unknown")}`,
        `risk=${String(signals.proactive_risk ?? "unknown")}`,
        `trajectory=${String(trajectory.direction ?? "unknown")}`,
        `summary=${
          String(trajectory.summary ?? "").replace(/\s+/g, " ").trim().slice(
            0,
            180,
          )
        }`,
        anchors.length > 0 ? `anchors=${anchors.join(" | ")}` : "",
      ].filter(Boolean).join("; ");
    })
    .filter(Boolean);
  if (lines.length === 0) return null;
  return `\n[Daily conversation pulses - runtime snapshots dates, non durables]\n${
    lines.join("\n")
  }\nUtilisation: contexte recent seulement; ne pas le transformer en fait permanent ni en diagnostic.\n\n`;
}

async function loadDailyConversationPulseContext(args: {
  supabase: SupabaseClient;
  userId: string;
}): Promise<string | null> {
  const { data, error } = await args.supabase
    .from("system_runtime_snapshots")
    .select(
      "id,user_id,cycle_id,transformation_id,snapshot_type,payload,created_at",
    )
    .eq("user_id", args.userId)
    .eq("snapshot_type", DAILY_CONVERSATION_PULSE_V2_SNAPSHOT_TYPE)
    .order("created_at", { ascending: false })
    .limit(7);
  if (error || !data || data.length === 0) return null;
  return formatDailyConversationPulseSnapshots(
    (data as SystemRuntimeSnapshotRow[]).reverse(),
  );
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

// RETRAIT RÉSIDUS GRAND PUBLIC (2026-08-08) — `shouldInjectRendezVousSummary`
// et `loadRendezVousSummary` sont partis avec `user_recurring_reminders`.

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

// ===========================================================================
// Durable effects summary (chantier 2 phase B, 2026-05-28)
//
// Injecte dans le prompt companion un mini résumé de l'état durable côté DB:
// rappels ponctuels en attente, préférences coach actives. (Retrait résidus
// 2026-08-08: cartes d'attaque et potions parties avec leurs tables,
// migration 20260808090000.) Sert de "source de vérité" pour empêcher le
// LLM d'halluciner "on n'a pas validé/créé X" alors que la DB confirme X.
//
// Voir docs/agent-playbook/New/runtime-contracts/00-architecture-doctrine.md, chantier 2 phase B.
// ===========================================================================


// Chantier 12 (2026-05-28) — Affichage des heures de rappel dans la
// timezone utilisateur. Sans ça, le summary affiche le ISO UTC brut
// (ex: "2026-05-28T09:21:00+00:00") et le LLM le reproduit tel quel
// dans les récaps/status, alors que l'utilisateur attend "11:21 (heure
// France)". Voir A4-r6 T15.
function formatScheduledForUserTimezone(
  iso: string,
  timezone: string,
): string {
  if (!iso) return "";
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return iso;
  try {
    const fmt = new Intl.DateTimeFormat("fr-FR", {
      timeZone: timezone,
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    return `${fmt.format(new Date(ts))} (${timezone})`;
  } catch {
    return iso;
  }
}

function extractReminderInstruction(payload: any): string {
  return String(
    payload?.reminder_instruction ??
      payload?.instruction ??
      payload?.text ??
      "rappel ponctuel",
  )
    .replace(
      /^Rappel ponctuel demandé explicitement par l'utilisateur\. Rappelle-lui de\s*/i,
      "",
    )
    .trim();
}

function recentEffectStatusLabel(status: string): string {
  if (status === "committed") return "exécuté et persisté";
  if (status === "failed") return "tenté mais non persisté";
  if (status === "blocked") return "bloqué, non persisté";
  return status;
}

function recentEffectTypeLabel(entry: PersistedEffectLedgerEntry): string {
  const effectType = String(entry.effect_type ?? "").trim();
  const operationType = String(entry.operation_type ?? "").trim();
  if (effectType === "one_shot_reminder.create") {
    return "Rappel ponctuel créé";
  }
  if (effectType === "one_shot_reminder.cancel") {
    return "Rappel ponctuel annulé";
  }
  if (effectType === "plan_item_progress.track") {
    return "Progression d'action notée";
  }
  if (
    effectType === "coach_preferences.update" ||
    operationType === "update_coach_preferences" ||
    entry.db_ref?.table === "user_profile_facts"
  ) {
    return "Préférence utilisateur mise à jour";
  }
  return effectType || operationType || "Effet durable";
}

function recentEffectInstruction(entry: PersistedEffectLedgerEntry): string {
  const payload = entry.payload_summary ?? {};
  const value = String(
    payload.reminder_instruction ??
      payload.instruction ??
      payload.target_title ??
      payload.title ??
      payload.status_hint ??
      payload.key ??
      "",
  ).replace(/\s+/g, " ").trim();
  return value ? value.slice(0, 140) : "";
}

async function loadScheduledCheckinsById(args: {
  supabase: SupabaseClient;
  userId: string;
  ids: string[];
}): Promise<Map<string, any>> {
  const ids = [
    ...new Set(
      args.ids.map((id) => String(id).trim()).filter(
        Boolean,
      ),
    ),
  ].slice(0, 12);
  const out = new Map<string, any>();
  if (ids.length === 0) return out;
  try {
    let query: any = args.supabase
      .from("scheduled_checkins")
      .select("id,scheduled_for,status,message_payload")
      .eq("user_id", args.userId);
    if (typeof query.in !== "function") return out;
    query = query.in("id", ids);
    const res = await query;
    if (res?.error) return out;
    for (const row of (res?.data ?? []) as any[]) {
      const id = String(row?.id ?? "").trim();
      if (id) out.set(id, row);
    }
  } catch {
    return out;
  }
  return out;
}

function formatRecentEffectLine(args: {
  entry: PersistedEffectLedgerEntry;
  scheduledCheckins: Map<string, any>;
  timezone: string;
}): string {
  const entry = args.entry;
  const label = recentEffectTypeLabel(entry);
  const status = recentEffectStatusLabel(String(entry.status ?? ""));
  const detail = recentEffectInstruction(entry);
  const pieces: string[] = [`- ${label}: ${status}`];
  if (detail) pieces.push(`détail: ${detail}`);

  const table = String(entry.db_ref?.table ?? "").trim();
  const id = String(entry.db_ref?.id ?? "").trim();
  if (table === "scheduled_checkins" && id) {
    const checkin = args.scheduledCheckins.get(id);
    if (checkin) {
      const currentStatus = String(checkin?.status ?? "").trim() || "inconnu";
      const scheduledRaw = String(checkin?.scheduled_for ?? "").trim();
      const scheduledLocal = scheduledRaw
        ? formatScheduledForUserTimezone(scheduledRaw, args.timezone)
        : "";
      const instruction = extractReminderInstruction(checkin?.message_payload);
      // nina-r6 B04: lifecycle en langage user — un rappel deja delivre se
      // dit « cree puis declenche », jamais omis d'un recap.
      const lifecycleLabel = currentStatus === "pending"
        ? "programmé (pas encore déclenché)"
        : ["awaiting_user", "delivered", "sent", "completed"].includes(
            currentStatus,
          )
        ? "créé puis déjà déclenché"
        : currentStatus === "cancelled"
        ? "créé puis annulé"
        : currentStatus;
      pieces.push(`état DB actuel: ${lifecycleLabel}`);
      if (scheduledLocal) pieces.push(`prévu: ${scheduledLocal}`);
      if (instruction && instruction !== detail) {
        pieces.push(`instruction DB: ${instruction.slice(0, 140)}`);
      }
    } else {
      pieces.push("référence DB actuelle introuvable");
    }
  } else if (table) {
    pieces.push(`référence DB: ${table}${id ? `/${id}` : ""}`);
  }

  return `${pieces.join("; ")}.`;
}

/**
 * Timeline courte des effets réellement observés par le runtime.
 * L'état courant reste porté par les tables métier; ce bloc sert à répondre
 * aux questions de continuité immédiate ("qu'est-ce que tu viens de faire ?").
 */
export async function loadRecentEffectsLedgerSummary(args: {
  supabase: SupabaseClient;
  userId: string;
  scope?: string | null;
  userTimePromptBlock?: string;
  /**
   * Optional privileged client for reading `turn_summary_logs`. That table is an
   * internal execution log not exposed to end users via RLS, so the user-scoped
   * client used by the web/test paths reads it empty. Callers pass a service-role
   * client here to keep recent-effect proofs consistent across channels; falls
   * back to `supabase` when omitted (e.g. WhatsApp already passes service-role).
   */
  ledgerReadClient?: SupabaseClient;
}): Promise<string | null> {
  try {
    const ledgerClient = args.ledgerReadClient ?? args.supabase;
    // eva-r8 B04: fenetre etendue a la SESSION (15 tours) — un track commite
    // en debut de soiree doit exister encore au recap de fin de soiree.
    const entries = await loadRecentEffectHistory({
      supabase: ledgerClient,
      userId: args.userId,
      limit: 60,
      scope: args.scope ?? null,
      turnLimit: 15,
    });
    const relevant = entries.filter((entry) => {
      const status = String(entry.status ?? "");
      if (
        status !== "committed" && status !== "failed" && status !== "blocked"
      ) {
        return false;
      }
      if (String(entry.effect_type ?? "") === "final_reply.claim") return false;
      return String(entry.kind ?? "durable_effect") === "durable_effect";
    }).slice(0, 12);
    if (relevant.length === 0) return null;

    const timezone = extractTimezoneFromUserTimeBlock(args.userTimePromptBlock);
    const scheduledCheckinIds = relevant
      .filter((entry) => entry.db_ref?.table === "scheduled_checkins")
      .map((entry) => String(entry.db_ref?.id ?? "").trim())
      .filter(Boolean);
    const scheduledCheckins = await loadScheduledCheckinsById({
      supabase: args.supabase,
      userId: args.userId,
      ids: scheduledCheckinIds,
    });

    const lines = [
      "=== EFFETS RÉCENTS (EffectLedger, fenêtre session — 15 tours) ===",
      "Usage: utiliser si le user demande ce qui vient d'être fait, programmé, noté, validé, annulé, OU fait un point/récap de session ('on a fait quoi ce soir', 'qu'est-ce qui est enregistré', 'j'ai quoi de prévu'), ou si nécessaire pour ne pas contredire un effet récent. Ne pas le mentionner spontanément hors de ces cas.",
      `Récap de session: cette liste contient ${relevant.length} effet(s) — chacun se mentionne avec son état ('programmé', 'créé puis déjà déclenché', 'créé puis annulé') — un effet de la session ne s'OMET jamais d'un récap, même déjà déclenché ou annulé.`,
      "Source: timeline d'exécution récente. Pour dire si un objet existe encore maintenant, l'état DB actuel est prioritaire.",
      ...relevant.map((entry) =>
        formatRecentEffectLine({ entry, scheduledCheckins, timezone })
      ),
      "Consigne: ne révèle pas le nom EffectLedger. Si l'effet est marqué bloqué/failed, ne dis pas que c'est fait. Si une ligne committed a une référence DB actuelle, tu peux répondre sobrement que cela a été fait, avec l'état DB indiqué.",
    ];
    return lines.join("\n") + "\n\n";
  } catch (err) {
    console.warn(
      "[ContextLoader] loadRecentEffectsLedgerSummary failed (non-blocking):",
      err,
    );
    return null;
  }
}

export async function loadRecentDirectEffectConfirmationContext(args: {
  supabase: SupabaseClient;
  userId: string;
  scope?: string | null;
  /** See loadRecentEffectsLedgerSummary.ledgerReadClient. */
  ledgerReadClient?: SupabaseClient;
}): Promise<Record<string, unknown> | null> {
  try {
    const ledgerClient = args.ledgerReadClient ?? args.supabase;
    const entries = await loadRecentEffectHistory({
      supabase: ledgerClient,
      userId: args.userId,
      limit: 40,
      scope: args.scope ?? null,
      turnLimit: 5,
    });
    const committedReminder = entries.find((entry) => {
      if (entry.status !== "committed") return false;
      if (entry.effect_type !== "one_shot_reminder.create") return false;
      if (entry.db_ref?.table !== "scheduled_checkins") return false;
      return true;
    });
    if (!committedReminder) return null;

    const dbId = String(committedReminder.db_ref?.id ?? "").trim();
    const scheduledCheckins = await loadScheduledCheckinsById({
      supabase: args.supabase,
      userId: args.userId,
      ids: dbId ? [dbId] : [],
    });
    const checkin = dbId ? scheduledCheckins.get(dbId) : null;
    const currentStatus = String(checkin?.status ?? "").trim();
    if (checkin && currentStatus && currentStatus !== "pending") return null;
    // Write-through (P0-1, ALEX-CPR-B01): un committed du ledger dont la
    // ligne DB n'existe PLUS (id introuvable) ne se re-présente JAMAIS comme
    // vérité — c'était la fabrique du « c'est noté » fantôme au tour de
    // sortie de flow. Sans ligne relue, pas de confirmation.
    if (dbId && !checkin) return null;
    if (!dbId) return null;

    const payload = committedReminder.payload_summary ?? {};
    const reminderInstruction = checkin
      ? extractReminderInstruction(checkin?.message_payload)
      : String(payload.reminder_instruction ?? payload.instruction ?? "")
        .trim();
    const scheduledFor = String(
      checkin?.scheduled_for ?? payload.scheduled_for ?? "",
    ).trim();
    const localLabel = String(payload.local_label ?? "").trim();

    return {
      has_committed_one_shot_reminder: true,
      has_requested_one_shot_reminder: true,
      one_shot_reminder: {
        committed: true,
        local_label: localLabel || null,
        reminder_instruction: reminderInstruction || null,
      },
      blocked_one_shot_reminder: null,
      track_progress: null,
      committed_effects: [{
        type: "create_one_shot_reminder",
        id: dbId || committedReminder.committed_id || null,
        scheduled_for: scheduledFor || null,
        local_label: localLabel || null,
        reminder_instruction: reminderInstruction || null,
      }],
      requested_effects: [],
      blocked_effects: [],
      confirmation_text: null,
      do_not_recreate: true,
      do_not_reroute: true,
      do_not_redemand: true,
      do_not_confirm_without_commit: true,
      remaining_user_need_must_continue: true,
      source: "recent_effect_ledger",
    };
  } catch (err) {
    console.warn(
      "[ContextLoader] loadRecentDirectEffectConfirmationContext failed (non-blocking):",
      err,
    );
    return null;
  }
}

/**
 * Charge un résumé compact des effets durables en cours pour ce user.
 * Retourne null si rien à dire (aucun durable, pas de risque d'hallucination).
 */
export async function loadDurableEffectsSummary(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  try {
    // Chantier 12 (2026-05-28): on fetch la timezone user en même temps
    // que les effets durables pour formater les heures de rappel en local.
    const profileTzPromise = (async () => {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("timezone")
          .eq("id", userId)
          .maybeSingle();
        const tz = String((data as any)?.timezone ?? "").trim();
        return tz || "Europe/Paris";
      } catch {
        return "Europe/Paris";
      }
    })();
    const [
      checkinsRes,
      cancelledRes,
      prefsRes,
      userTimezone,
    ] = await Promise.all([
      // C3 (2026-07-03, rose-r2 T15 / BF-STATUS-01) — le cap silencieux à 5
      // faisait annoncer "5 rappels" comme total exhaustif alors que 6 étaient
      // pending. On charge large + count exact pour que le rendu ne puisse
      // jamais affirmer l'exhaustivité sur une liste tronquée.
      supabase
        .from("scheduled_checkins")
        .select("id,scheduled_for,status,message_payload", { count: "exact" })
        .eq("user_id", userId)
        .eq("status", "pending")
        // P0-3 (nina R1-B03): seuls les RAPPELS user sont des « rappels
        // ponctuels ». Sans ce filtre, un checkin cron (night-prep 21:35,
        // reviews) apparaissait ici comme un rappel SANS instruction — le
        // composeur lui inventait un objet (« sortir le chien à 21:35 »)
        // tout en niant le vrai rappel.
        .like("event_context", "one_shot_reminder:%")
        .order("scheduled_for", { ascending: true })
        .limit(50),
      // Chantier V6 (harness S3 T5): les one-shots ANNULES recemment restent
      // visibles — sans eux, une verification post-annulation ('il est encore
      // actif ?') routee hors lane status se rabat sur une habitude du plan
      // au nom proche et repond 'encore actif' sur un rappel annule.
      // P12-G (paul-p9reval R1-B02): fix C3 porté à la branche CANCELLED —
      // le .limit(5) silencieux tronquait la 6e ligne et le composeur
      // affirmait « exactement ces 5 et aucun autre » (récidive exacte du
      // cap pending fixé le 03/07). Charge large + count exact: la troncature
      // devient détectable et l'exhaustivité interdite sur liste tronquée.
      supabase
        .from("scheduled_checkins")
        .select("id,scheduled_for,status,message_payload", {
          count: "exact",
        })
        .eq("user_id", userId)
        .eq("status", "cancelled")
        .like("event_context", "one_shot_reminder%")
        .gte("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString())
        .order("scheduled_for", { ascending: true })
        .limit(50),
      // CHANTIER E6 (2026-05-28) — On récupère source_type pour distinguer les
      // préférences définies par l'utilisateur (explicit_user/ui/...) des
      // réglages par défaut système (system_default). Voir A11 T13 où les 9
      // defaults étaient annoncés comme "préférences coach : oui".
      supabase
        .from("user_profile_facts")
        .select("key,value,status,source_type,updated_at")
        .eq("user_id", userId)
        .eq("scope", "global")
        .eq("status", "active")
        .like("key", "coach.%")
        .order("updated_at", { ascending: false })
        .limit(12),
      profileTzPromise,
    ]);

    const checkins = (checkinsRes.data ?? []) as any[];
    // Total DB réel (count exact), potentiellement > lignes chargées: le
    // rendu ne doit jamais annoncer un total dérivé d'une liste tronquée.
    const checkinsTotal = Number.isFinite(Number((checkinsRes as any).count))
      ? Math.max(Number((checkinsRes as any).count), checkins.length)
      : checkins.length;
    const prefs = (prefsRes.data ?? []) as any[];
    // E6: une préférence est "explicite" si elle n'a pas été semée par défaut.
    const explicitPrefs = prefs.filter((row) =>
      String(row?.source_type ?? "") !== "system_default"
    );
    const defaultPrefs = prefs.filter((row) =>
      String(row?.source_type ?? "") === "system_default"
    );

    const hasAnything = checkins.length > 0 || prefs.length > 0;
    if (!hasAnything) return null;

    const lines: string[] = [];
    lines.push("=== ÉTAT DURABLE ACTUEL (DB, source de vérité) ===");
    // paul-r5 B01: au T14 le modèle a nié un rappel pourtant listé ici, parce
    // qu'un tour PRÉCÉDENT de la conversation affirmait « pas créé ». La
    // priorité doit être explicite: la DB actuelle bat l'historique.
    lines.push(
      "Cette liste PRIME sur tout ce que la conversation a pu dire avant (y compris un ancien tour niant une création): un rappel listé ici EXISTE — ne nie jamais son existence; un élément absent d'ici n'existe pas.",
    );
    lines.push(
      "Question d'inventaire ('j'ai quoi comme rappels ?'): la réponse couvre les rappels PONCTUELS en attente listés ici. Ne dis JAMAIS 'pas d'autre rappel' si cette section liste encore une entrée non mentionnée.",
    );
    lines.push(
      "Recap POST-ANNULATION (P8-G, alex-hard23 T15): « redis-moi ce qu'il me reste de programmé/prévu » juste après un cancel de rappel répond D'ABORD depuis l'inventaire des rappels et check-ins encore actifs (ponctuels en attente), avant tout glissement vers les items du plan — omettre une entrée encore active laisse croire que tout est éteint.",
    );


    if (checkinsRes.error) {
      // R-1 (BF-STATUS-01): une lecture echouee n'est JAMAIS rendue comme une
      // absence — « aucun » sur une erreur ferait nier des rappels reels.
      console.warn(
        "[ContextLoader] durable checkins read failed (non-blocking):",
        checkinsRes.error,
      );
      lines.push(
        "- Rappels ponctuels en attente: lecture indisponible ce tour — n'affirme NI présence NI absence de rappel ponctuel; renvoie vers l'app si on te demande.",
      );
    } else if (checkins.length === 0) {
      lines.push("- Rappels ponctuels en attente: aucun.");
    } else {
      // Chantier 6 (2026-05-28) — Détailler TOUS les rappels en attente,
      // pas seulement le premier. Sinon, sur une question multi-rappels
      // ("11h18 confirmé ? 11h32 confirmé ?"), le LLM ne voit qu'un seul
      // rappel détaillé et répond à tort "non confirmé" pour les autres.
      // Voir A4-r5 T11.
      lines.push(`- Rappels ponctuels en attente (${checkinsTotal}):`);
      for (const checkin of checkins) {
        const instruction = extractReminderInstruction(
          checkin?.message_payload,
        );
        const scheduledRaw = String(checkin?.scheduled_for ?? "").trim();
        // CHANTIER C3 (2026-05-28) — On n'expose QUE l'heure locale au LLM.
        // L'ISO UTC est de la traçabilité, pas de l'affichage: chantier 12
        // le gardait entre crochets ("[iso: ...T09:21:00Z]") et le LLM
        // recopiait le "09:21" UTC au lieu du "11:21" local (A4-r6 T15,
        // toujours rouge malgré la consigne anti-UTC). On remplace l'ISO par
        // une réf non-horaire (l'id du checkin) pour garder la traçabilité
        // sans aucun chiffre d'horloge UTC dans le prompt.
        const scheduledLocal = scheduledRaw
          ? formatScheduledForUserTimezone(scheduledRaw, userTimezone)
          : "";
        const traceRef = String(checkin?.id ?? "").trim();
        const scheduledLabel = scheduledLocal
          ? `${scheduledLocal}${traceRef ? ` [ref: ${traceRef}]` : ""}`
          : "";
        lines.push(
          `  • ${scheduledLabel ? `${scheduledLabel} — ` : ""}${instruction}.`,
        );
      }
      if (checkinsTotal > checkins.length) {
        // No silent caps: si la liste est tronquée, le LLM doit le savoir
        // pour ne jamais affirmer l'exhaustivité.
        lines.push(
          `  • … et ${
            checkinsTotal - checkins.length
          } autre(s) rappel(s) en attente non listé(s) ici — ne présente jamais cette liste comme complète, renvoie vers la plateforme pour le détail.`,
        );
      }
    }

    // Chantier V6 (harness S3 T5): le lifecycle des annulations reste visible.
    // Sans cette ligne, « il est encore actif ? » après un cancel se rabat sur
    // une habitude du plan au nom proche et affirme « encore actif » sur un
    // rappel annulé.
    const cancelled = (cancelledRes?.data ?? []) as any[];
    if (cancelled.length > 0) {
      // P12-G (paul-p9reval R1-B02): count exact affiché — interdiction
      // contractuelle d'affirmer l'exhaustivité quand la liste chargée est
      // plus courte que le count (miroir du fix C3 pending).
      const cancelledExactCount =
        typeof (cancelledRes as { count?: number | null })?.count ===
            "number" &&
          (cancelledRes as { count?: number | null }).count !== null
          ? Number((cancelledRes as { count?: number | null }).count)
          : cancelled.length;
      lines.push(
        `- Rappels ponctuels ANNULÉS (dernières 24h, ${cancelledExactCount} au total${
          cancelledExactCount > cancelled.length
            ? `, ${cancelled.length} affichés — liste NON exhaustive, ne dis jamais « et aucun autre »`
            : ""
        }) — ils ne partiront PAS; à une question « il est encore actif ? » sur l'un d'eux, réponds qu'il est annulé; ne le confonds pas avec une action ou habitude du plan au nom proche:`,
      );
      for (const row of cancelled) {
        const instruction = extractReminderInstruction(row?.message_payload);
        const scheduledRaw = String(row?.scheduled_for ?? "").trim();
        const scheduledLocal = scheduledRaw
          ? formatScheduledForUserTimezone(scheduledRaw, userTimezone)
          : "";
        lines.push(
          `  • ${scheduledLocal ? `${scheduledLocal} — ` : ""}${instruction} (ANNULÉ).`,
        );
      }
    }

    // CHANTIER E6 (2026-05-28) — On distingue explicitement les préférences
    // DÉFINIES PAR L'UTILISATEUR des réglages PAR DÉFAUT système. Sinon le LLM
    // annonce les 9 defaults comme une "préférence coach: oui" (A11 T13).
    const prefValue = (row: any) => {
      const raw = row?.value;
      if (raw && typeof raw === "object") {
        const v = (raw as any).value ?? (raw as any).label;
        if (v !== undefined) return String(v).slice(0, 60);
      }
      return String(raw).slice(0, 60);
    };
    const explicitPrefLines = explicitPrefs
      .filter((row) => typeof row?.key === "string" && row?.value !== undefined)
      .map((row) => `${row.key}=${prefValue(row)}`);
    if (explicitPrefLines.length === 0) {
      lines.push(
        "- Préférences coach définies par l'utilisateur: aucune (aucune préférence explicite enregistrée pendant ce parcours).",
      );
      if (defaultPrefs.length > 0) {
        lines.push(
          `  • Note: ${defaultPrefs.length} réglage(s) coach par défaut (système) sont actifs, mais ce ne sont PAS des préférences choisies par l'utilisateur.`,
        );
      }
    } else {
      const head = explicitPrefLines.slice(0, 4).join("; ");
      const rest = explicitPrefLines.length > 4
        ? `; (+${explicitPrefLines.length - 4})`
        : "";
      lines.push(
        `- Préférences coach définies par l'utilisateur (${explicitPrefLines.length}): ${head}${rest}.`,
      );
      if (defaultPrefs.length > 0) {
        lines.push(
          `  • (${defaultPrefs.length} autre(s) réglage(s) restent sur la valeur par défaut système.)`,
        );
      }
    }


    lines.push(
      "Consigne: ces lignes décrivent ce qui existe vraiment côté DB. " +
        'Ne dis JAMAIS "on n\'a pas validé/créé X" si la ligne correspondante est présente. ' +
        'Pour une question "X confirmé ?" sur un rappel précis, dis "oui" si l\'heure et l\'instruction matchent une ligne ci-dessus, sinon "non vérifiable depuis ce chat". ' +
        'Ne dis jamais "non" pour un rappel listé ci-dessus. ' +
        "Pour décrire ou pointer un effet durable, base-toi sur ces lignes. " +
        "Distingue toujours une préférence coach DÉFINIE PAR L'UTILISATEUR d'un réglage PAR DÉFAUT système: si aucune préférence explicite n'est enregistrée, réponds clairement \"aucune préférence coach enregistrée\" et ne présente jamais les valeurs par défaut comme des préférences choisies. " +
        "Quand tu cites un horaire de rappel à l'utilisateur, utilise UNIQUEMENT l'heure locale fournie ci-dessus (ex: \"11:21\"). Le \"[ref: ...]\" est un identifiant technique, jamais une heure: ne l'affiche pas et n'en déduis aucun horaire.",
    );
    return lines.join("\n") + "\n\n";
  } catch (err) {
    console.warn(
      "[ContextLoader] loadDurableEffectsSummary failed (non-blocking):",
      err,
    );
    return null;
  }
}

// Re-export types for convenience
export type {
  ContextProfile,
  LoadedContext,
  OnDemandTriggers,
} from "./types.ts";


