import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type {
  MemoryTraceTurn,
  MemoryTraceWindow,
} from "./memory_trace.ts";

export type MemoryEvalDimension =
  | "overall"
  | "identification"
  | "persistence"
  | "retrieval"
  | "injection"
  | "surface";

export type MemoryEvalLabel = "good" | "partial" | "miss" | "harmful";

export type MemoryEvalAnnotation = {
  id?: string;
  reviewer_user_id?: string | null;
  user_id: string;
  scope?: string | null;
  window_from: string;
  window_to: string;
  target_type: "window" | "turn";
  target_key: string;
  turn_id?: string | null;
  request_id?: string | null;
  dimension: MemoryEvalDimension;
  label: MemoryEvalLabel;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
};

export type MemoryTraceScorecard = {
  window: {
    from: string;
    to: string;
    scope: string | null;
    duration_hours: number;
  };
  coverage: {
    turns_total: number;
    user_messages: number;
    assistant_messages: number;
    memorizer_runs_total: number;
    observability_events_total: number;
  };
  identification: {
    runs_total: number;
    extracted: { topics: number; events: number; globals: number };
    accepted: { topics: number; events: number; globals: number };
    acceptance_rate: { topics: number | null; events: number | null; globals: number | null };
  };
  persistence: {
    topics: { created: number; enriched: number; noop: number };
    events: { created: number; updated: number; noop: number };
    globals: { created: number; updated: number; noop: number; pending_compaction: number };
    change_rate: { topics: number | null; events: number | null; globals: number | null };
  };
  retrieval: {
    turns_with_memory_plan: number;
    turns_requesting_memory: number;
    turns_with_any_retrieval: number;
    turns_with_any_retrieval_hit: number;
    request_hit_rate: number | null;
    by_type: {
      events: { turns: number; hit_turns: number; hit_rate: number | null };
      globals: { turns: number; hit_turns: number; hit_rate: number | null };
      topics: { turns: number; hit_turns: number; hit_rate: number | null };
    };
    memory_mode_distribution: Record<string, number>;
  };
  injection: {
    turns_with_any_memory_injected: number;
    injection_rate_on_requested_turns: number | null;
    average_estimated_tokens: number | null;
    average_memory_chars: number | null;
    block_usage: {
      identity: number;
      events: number;
      globals: number;
      topics: number;
    };
  };
  surface: {
    turns_with_surface_plan: number;
    turns_with_surface_addon: number;
    push_rate: number | null;
    average_level: number | null;
    accepted_events: number;
    ignored_events: number;
    by_surface: Record<string, { shown: number; average_level: number | null }>;
  };
  reuse: {
    topics: { count: number; average_minutes: number | null };
    events: { count: number; average_minutes: number | null };
    globals: { count: number; average_minutes: number | null };
  };
  annotations: {
    total: number;
    by_dimension: Record<string, number>;
    by_label: Record<string, number>;
  };
};

export function buildMemoryAnnotationTargetKey(params: {
  userId: string;
  scope?: string | null;
  windowFrom: string;
  windowTo: string;
  targetType: "window" | "turn";
  turnId?: string | null;
  requestId?: string | null;
}): string {
  const scope = String(params.scope ?? "").trim() || "*";
  if (params.targetType === "turn") {
    const target = String(params.turnId ?? "").trim() ||
      String(params.requestId ?? "").trim();
    if (!target) throw new Error("missing_turn_or_request_target");
    return [
      "turn",
      params.userId,
      scope,
      params.windowFrom,
      params.windowTo,
      target,
    ].join(":");
  }
  return [
    "window",
    params.userId,
    scope,
    params.windowFrom,
    params.windowTo,
  ].join(":");
}

export async function loadMemoryEvalAnnotations(params: {
  supabase: SupabaseClient;
  userId: string;
  from: string;
  to: string;
  scope?: string | null;
}): Promise<MemoryEvalAnnotation[]> {
  const scope = String(params.scope ?? "").trim() || null;
  let query = params.supabase
    .from("memory_eval_annotations")
    .select(
      "id,created_at,updated_at,reviewer_user_id,user_id,scope,window_from,window_to,target_type,target_key,turn_id,request_id,dimension,label,notes,metadata",
    )
    .eq("user_id", params.userId)
    .gte("window_from", params.from)
    .lte("window_to", params.to)
    .order("created_at", { ascending: true });
  if (scope) query = query.eq("scope", scope);
  const { data, error } = await query;
  if (error) throw error;
  return Array.isArray(data) ? (data as MemoryEvalAnnotation[]) : [];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function ratio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(denominator) || denominator <= 0) return null;
  return round2(numerator / denominator);
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return round2(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function arrayFromPayload(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item) => item && typeof item === "object") as Array<Record<string, unknown>>
    : [];
}

function extractMemoryMode(turn: MemoryTraceTurn): string {
  return String((turn.dispatcher.memory_plan as any)?.memory_mode ?? "").trim() || "unknown";
}

function hasAnyRetrieval(turn: MemoryTraceTurn): boolean {
  return Boolean(turn.retrieval.events || turn.retrieval.globals || turn.retrieval.topics);
}

function hasAnyRetrievalHit(turn: MemoryTraceTurn): boolean {
  const eventResults = arrayFromPayload((turn.retrieval.events as any)?.results);
  const globalResults = arrayFromPayload((turn.retrieval.globals as any)?.results);
  const topicResults = arrayFromPayload((turn.retrieval.topics as any)?.results);
  return eventResults.length > 0 || globalResults.length > 0 || topicResults.length > 0;
}

function hasAnyInjectedMemory(turn: MemoryTraceTurn): boolean {
  const blocks = (turn.injection as any)?.memory_blocks ?? {};
  return Boolean(
    blocks?.identity?.loaded ||
      blocks?.events?.loaded ||
      blocks?.globals?.loaded ||
      blocks?.topics?.loaded,
  );
}

function pushReuseMinutes(
  store: number[],
  persistedAtByKey: Map<string, number>,
  retrievedKeys: string[],
  retrievedAtIso: string,
): void {
  const retrievedAt = new Date(retrievedAtIso).getTime();
  if (!Number.isFinite(retrievedAt)) return;
  for (const key of retrievedKeys) {
    const persistedAt = persistedAtByKey.get(key);
    if (!persistedAt || persistedAt > retrievedAt) continue;
    store.push((retrievedAt - persistedAt) / 60000);
  }
}

export function buildMemoryTraceScorecard(params: {
  trace: MemoryTraceWindow;
  annotations?: MemoryEvalAnnotation[];
}): MemoryTraceScorecard {
  const trace = params.trace;
  const annotations = Array.isArray(params.annotations) ? params.annotations : [];
  const durationHours = round2(
    Math.max(
      0,
      (new Date(trace.window.to).getTime() - new Date(trace.window.from).getTime()) /
        (60 * 60 * 1000),
    ),
  );

  let extractedTopics = 0;
  let extractedEvents = 0;
  let extractedGlobals = 0;
  let acceptedTopics = 0;
  let acceptedEvents = 0;
  let acceptedGlobals = 0;
  let topicsCreated = 0;
  let topicsEnriched = 0;
  let topicsNoop = 0;
  let eventsCreated = 0;
  let eventsUpdated = 0;
  let eventsNoop = 0;
  let globalsCreated = 0;
  let globalsUpdated = 0;
  let globalsNoop = 0;
  let globalsPendingCompaction = 0;

  const persistedTopicTimes = new Map<string, number>();
  const persistedEventTimes = new Map<string, number>();
  const persistedGlobalTimes = new Map<string, number>();
  const topicReuseMinutes: number[] = [];
  const eventReuseMinutes: number[] = [];
  const globalReuseMinutes: number[] = [];

  for (const run of trace.memorizer_runs) {
    const extraction = run.stages.extraction ?? {};
    const validation = run.stages.validation ?? {};
    const persistence = run.stages.persistence ?? {};

    extractedTopics += num((extraction as any)?.extracted_counts?.durable_topics);
    extractedEvents += num((extraction as any)?.extracted_counts?.event_candidates);
    extractedGlobals += num((extraction as any)?.extracted_counts?.global_memory_candidates);

    acceptedTopics += num((validation as any)?.accepted_counts?.topics);
    acceptedEvents += num((validation as any)?.accepted_counts?.events);
    acceptedGlobals += num((validation as any)?.accepted_counts?.globals);

    topicsCreated += num((persistence as any)?.counts?.topics_created);
    topicsEnriched += num((persistence as any)?.counts?.topics_enriched);
    topicsNoop += num((persistence as any)?.counts?.topics_noop);
    eventsCreated += num((persistence as any)?.counts?.events_created);
    eventsUpdated += num((persistence as any)?.counts?.events_updated);
    eventsNoop += num((persistence as any)?.counts?.events_noop);
    globalsCreated += num((persistence as any)?.counts?.global_memories_created);
    globalsUpdated += num((persistence as any)?.counts?.global_memories_updated);
    globalsNoop += num((persistence as any)?.counts?.global_memories_noop);
    globalsPendingCompaction += num(
      (persistence as any)?.counts?.global_memories_pending_compaction,
    );

    const persistedAt = new Date(run.started_at).getTime();
    if (Number.isFinite(persistedAt)) {
      for (const topic of arrayFromPayload((persistence as any)?.outcomes?.topics)) {
        const slug = String(topic.slug ?? "").trim();
        const outcome = String(topic.outcome ?? "").trim();
        if (slug && outcome && outcome !== "noop" && outcome !== "error") {
          if (!persistedTopicTimes.has(slug)) persistedTopicTimes.set(slug, persistedAt);
        }
      }
      for (const event of arrayFromPayload((persistence as any)?.outcomes?.events)) {
        const key = String(event.event_key ?? "").trim();
        const outcome = String(event.outcome ?? "").trim();
        if (key && outcome && outcome !== "noop" && outcome !== "error") {
          if (!persistedEventTimes.has(key)) persistedEventTimes.set(key, persistedAt);
        }
      }
      for (const global of arrayFromPayload((persistence as any)?.outcomes?.globals)) {
        const key = String(global.full_key ?? "").trim();
        const outcome = String(global.outcome ?? "").trim();
        if (key && outcome && outcome !== "noop" && outcome !== "error") {
          if (!persistedGlobalTimes.has(key)) persistedGlobalTimes.set(key, persistedAt);
        }
      }
    }
  }

  let turnsWithMemoryPlan = 0;
  let turnsRequestingMemory = 0;
  let turnsWithAnyRetrieval = 0;
  let turnsWithAnyRetrievalHit = 0;
  let eventRetrievalTurns = 0;
  let eventRetrievalHitTurns = 0;
  let globalRetrievalTurns = 0;
  let globalRetrievalHitTurns = 0;
  let topicRetrievalTurns = 0;
  let topicRetrievalHitTurns = 0;
  let turnsWithAnyMemoryInjected = 0;
  const injectedTokenValues: number[] = [];
  const injectedMemoryCharValues: number[] = [];
  let identityInjectedCount = 0;
  let eventInjectedCount = 0;
  let globalInjectedCount = 0;
  let topicInjectedCount = 0;
  let turnsWithSurfacePlan = 0;
  let turnsWithSurfaceAddon = 0;
  const surfaceLevels: number[] = [];
  let surfaceAcceptedEvents = 0;
  let surfaceIgnoredEvents = 0;
  const bySurfaceShown = new Map<string, number>();
  const bySurfaceLevels = new Map<string, number[]>();
  const memoryModeDistribution: Record<string, number> = {};

  for (const turn of trace.turns) {
    if (turn.dispatcher.memory_plan) {
      turnsWithMemoryPlan += 1;
      const memoryMode = extractMemoryMode(turn);
      memoryModeDistribution[memoryMode] = (memoryModeDistribution[memoryMode] ?? 0) + 1;
      if (memoryMode !== "none") turnsRequestingMemory += 1;
    }

    if (hasAnyRetrieval(turn)) turnsWithAnyRetrieval += 1;
    if (hasAnyRetrievalHit(turn)) turnsWithAnyRetrievalHit += 1;

    const eventResults = arrayFromPayload((turn.retrieval.events as any)?.results);
    const globalResults = arrayFromPayload((turn.retrieval.globals as any)?.results);
    const topicResults = arrayFromPayload((turn.retrieval.topics as any)?.results);
    if (turn.retrieval.events) {
      eventRetrievalTurns += 1;
      if (eventResults.length > 0) eventRetrievalHitTurns += 1;
    }
    if (turn.retrieval.globals) {
      globalRetrievalTurns += 1;
      if (globalResults.length > 0) globalRetrievalHitTurns += 1;
    }
    if (turn.retrieval.topics) {
      topicRetrievalTurns += 1;
      if (topicResults.length > 0) topicRetrievalHitTurns += 1;
    }

    const retrievalAt = turn.started_at;
    pushReuseMinutes(
      topicReuseMinutes,
      persistedTopicTimes,
      topicResults.map((row) => String(row.slug ?? "").trim()).filter(Boolean),
      retrievalAt,
    );
    pushReuseMinutes(
      eventReuseMinutes,
      persistedEventTimes,
      eventResults.map((row) => String(row.event_key ?? "").trim()).filter(Boolean),
      retrievalAt,
    );
    pushReuseMinutes(
      globalReuseMinutes,
      persistedGlobalTimes,
      globalResults.map((row) => String(row.full_key ?? "").trim()).filter(Boolean),
      retrievalAt,
    );

    if (hasAnyInjectedMemory(turn)) turnsWithAnyMemoryInjected += 1;
    const injection = (turn.injection as any) ?? {};
    if (Number.isFinite(Number(injection.estimated_tokens))) {
      injectedTokenValues.push(Number(injection.estimated_tokens));
    }
    const memoryBlocks = injection.memory_blocks ?? {};
    const memoryChars =
      num(memoryBlocks.identity?.chars) +
      num(memoryBlocks.events?.chars) +
      num(memoryBlocks.globals?.chars) +
      num(memoryBlocks.topics?.chars);
    if (memoryChars > 0) injectedMemoryCharValues.push(memoryChars);
    if (memoryBlocks.identity?.loaded) identityInjectedCount += 1;
    if (memoryBlocks.events?.loaded) eventInjectedCount += 1;
    if (memoryBlocks.globals?.loaded) globalInjectedCount += 1;
    if (memoryBlocks.topics?.loaded) topicInjectedCount += 1;

    if (turn.dispatcher.surface_plan) turnsWithSurfacePlan += 1;
    const surfaceTransition = (turn.surface.state_transition as any) ?? {};
    const addon = (turn.surface.addon as any) ?? null;
    if (addon?.surface_id) {
      turnsWithSurfaceAddon += 1;
      const surfaceId = String(addon.surface_id);
      const level = num(addon.level);
      if (level > 0) surfaceLevels.push(level);
      bySurfaceShown.set(surfaceId, (bySurfaceShown.get(surfaceId) ?? 0) + 1);
      const levels = bySurfaceLevels.get(surfaceId) ?? [];
      if (level > 0) levels.push(level);
      bySurfaceLevels.set(surfaceId, levels);
    }
    const beforeEntries = (surfaceTransition.before as any)?.entries ?? {};
    const afterEntries = (surfaceTransition.after as any)?.entries ?? {};
    const surfaceIds = new Set([
      ...Object.keys(beforeEntries),
      ...Object.keys(afterEntries),
    ]);
    for (const surfaceId of surfaceIds) {
      const before = beforeEntries[surfaceId] ?? {};
      const after = afterEntries[surfaceId] ?? {};
      if (num(after.accepted_count) > num(before.accepted_count)) {
        surfaceAcceptedEvents += num(after.accepted_count) - num(before.accepted_count);
      }
      if (num(after.ignored_count) > num(before.ignored_count)) {
        surfaceIgnoredEvents += num(after.ignored_count) - num(before.ignored_count);
      }
    }
  }

  const annotationsByDimension: Record<string, number> = {};
  const annotationsByLabel: Record<string, number> = {};
  for (const annotation of annotations) {
    const dimension = String(annotation.dimension ?? "").trim() || "unknown";
    const label = String(annotation.label ?? "").trim() || "unknown";
    annotationsByDimension[dimension] = (annotationsByDimension[dimension] ?? 0) + 1;
    annotationsByLabel[label] = (annotationsByLabel[label] ?? 0) + 1;
  }

  const bySurface: Record<string, { shown: number; average_level: number | null }> = {};
  for (const [surfaceId, shown] of bySurfaceShown.entries()) {
    bySurface[surfaceId] = {
      shown,
      average_level: avg(bySurfaceLevels.get(surfaceId) ?? []),
    };
  }

  return {
    window: {
      from: trace.window.from,
      to: trace.window.to,
      scope: trace.window.scope,
      duration_hours: durationHours,
    },
    coverage: {
      turns_total: trace.summary.turns_total,
      user_messages: trace.summary.user_messages,
      assistant_messages: trace.summary.assistant_messages,
      memorizer_runs_total: trace.summary.memorizer_runs_total,
      observability_events_total: trace.summary.observability_events_total,
    },
    identification: {
      runs_total: trace.memorizer_runs.length,
      extracted: {
        topics: extractedTopics,
        events: extractedEvents,
        globals: extractedGlobals,
      },
      accepted: {
        topics: acceptedTopics,
        events: acceptedEvents,
        globals: acceptedGlobals,
      },
      acceptance_rate: {
        topics: ratio(acceptedTopics, extractedTopics),
        events: ratio(acceptedEvents, extractedEvents),
        globals: ratio(acceptedGlobals, extractedGlobals),
      },
    },
    persistence: {
      topics: {
        created: topicsCreated,
        enriched: topicsEnriched,
        noop: topicsNoop,
      },
      events: {
        created: eventsCreated,
        updated: eventsUpdated,
        noop: eventsNoop,
      },
      globals: {
        created: globalsCreated,
        updated: globalsUpdated,
        noop: globalsNoop,
        pending_compaction: globalsPendingCompaction,
      },
      change_rate: {
        topics: ratio(topicsCreated + topicsEnriched, acceptedTopics),
        events: ratio(eventsCreated + eventsUpdated, acceptedEvents),
        globals: ratio(globalsCreated + globalsUpdated, acceptedGlobals),
      },
    },
    retrieval: {
      turns_with_memory_plan: turnsWithMemoryPlan,
      turns_requesting_memory: turnsRequestingMemory,
      turns_with_any_retrieval: turnsWithAnyRetrieval,
      turns_with_any_retrieval_hit: turnsWithAnyRetrievalHit,
      request_hit_rate: ratio(turnsWithAnyRetrievalHit, turnsRequestingMemory),
      by_type: {
        events: {
          turns: eventRetrievalTurns,
          hit_turns: eventRetrievalHitTurns,
          hit_rate: ratio(eventRetrievalHitTurns, eventRetrievalTurns),
        },
        globals: {
          turns: globalRetrievalTurns,
          hit_turns: globalRetrievalHitTurns,
          hit_rate: ratio(globalRetrievalHitTurns, globalRetrievalTurns),
        },
        topics: {
          turns: topicRetrievalTurns,
          hit_turns: topicRetrievalHitTurns,
          hit_rate: ratio(topicRetrievalHitTurns, topicRetrievalTurns),
        },
      },
      memory_mode_distribution: memoryModeDistribution,
    },
    injection: {
      turns_with_any_memory_injected: turnsWithAnyMemoryInjected,
      injection_rate_on_requested_turns: ratio(
        turnsWithAnyMemoryInjected,
        turnsRequestingMemory,
      ),
      average_estimated_tokens: avg(injectedTokenValues),
      average_memory_chars: avg(injectedMemoryCharValues),
      block_usage: {
        identity: identityInjectedCount,
        events: eventInjectedCount,
        globals: globalInjectedCount,
        topics: topicInjectedCount,
      },
    },
    surface: {
      turns_with_surface_plan: turnsWithSurfacePlan,
      turns_with_surface_addon: turnsWithSurfaceAddon,
      push_rate: ratio(turnsWithSurfaceAddon, trace.summary.turns_total),
      average_level: avg(surfaceLevels),
      accepted_events: surfaceAcceptedEvents,
      ignored_events: surfaceIgnoredEvents,
      by_surface: bySurface,
    },
    reuse: {
      topics: {
        count: topicReuseMinutes.length,
        average_minutes: avg(topicReuseMinutes),
      },
      events: {
        count: eventReuseMinutes.length,
        average_minutes: avg(eventReuseMinutes),
      },
      globals: {
        count: globalReuseMinutes.length,
        average_minutes: avg(globalReuseMinutes),
      },
    },
    annotations: {
      total: annotations.length,
      by_dimension: annotationsByDimension,
      by_label: annotationsByLabel,
    },
  };
}
