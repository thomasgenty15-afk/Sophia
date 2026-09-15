export interface MemoryV2ObservabilityEvent {
  id?: number | string;
  created_at?: string | null;
  user_id?: string | null;
  event_name: string;
  source_component?: string | null;
  payload?: Record<string, unknown> | null;
}

export type MemoryV2AlertSeverity = "warning" | "critical";

export interface MemoryV2Alert {
  key: string;
  severity: MemoryV2AlertSeverity;
  value: number;
  threshold: number;
  message: string;
}

export interface MemoryV2OpsScorecard {
  window: {
    from: string | null;
    to: string | null;
    event_count: number;
  };
  runtime: {
    active_load_count: number;
    retrieval_mode_distribution: Record<string, number>;
    topic_decision_distribution: Record<string, number>;
    topic_router_skipped_count: number;
    dispatcher_plan_missing_count: number;
    memory_none_item_count: number;
    payload_item_count_avg: number | null;
    payload_item_count_max: number;
    loader_ms_p95: number | null;
    total_ms_p95: number | null;
    cross_topic_fallback_count: number;
    cross_topic_fallback_rate: number | null;
  };
  memorizer: {
    run_count: number;
    failed_run_count: number;
    failed_runs_per_hour: number | null;
    runs_per_user_day: number | null;
    proposed_item_count: number;
    accepted_item_count: number;
    rejected_item_count: number;
    pre_filter_skip_count: number;
    pre_filter_skip_rate: number | null;
    statement_as_fact_violation_count: number;
    idempotent_skip_count: number;
  };
  compaction: {
    run_count: number;
    failed_validation_count: number;
    unsupported_claim_count: number;
    unsupported_claim_rate: number | null;
    latency_ms_p95: number | null;
  };
  privacy: {
    invalid_injection_count: number;
    sensitive_excluded_count: number;
    deleted_item_in_payload_count: number;
    cross_user_memory_access_count: number;
  };
  cost: {
    observed_cost_eur: number | null;
    cost_per_user_eur: number | null;
    total_cost_per_user_day_p50: number | null;
    total_cost_per_user_day_p95: number | null;
    total_cost_per_user_day_p99: number | null;
    extraction_tokens_per_user_day: number | null;
    cross_topic_lookup_calls_per_user_day: number | null;
  };
  alerts: MemoryV2Alert[];
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function bool(value: unknown): boolean {
  return value === true || String(value ?? "").toLowerCase() === "true";
}

function incr(map: Record<string, number>, raw: unknown): void {
  const key = String(raw ?? "").trim() || "unknown";
  map[key] = (map[key] ?? 0) + 1;
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

function p95(values: number[]): number | null {
  return percentile(values, 0.95);
}

function percentile(values: number[], pct: number): number | null {
  const sorted = values.filter(Number.isFinite).slice().sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const index = Math.min(
    sorted.length - 1,
    Math.ceil(sorted.length * pct) - 1,
  );
  return round2(sorted[index]);
}

function payload(event: MemoryV2ObservabilityEvent): Record<string, unknown> {
  return event.payload && typeof event.payload === "object"
    ? event.payload
    : {};
}

function firstIso(events: MemoryV2ObservabilityEvent[]): string | null {
  const values = events.map((event) =>
    Date.parse(String(event.created_at ?? ""))
  )
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  return values.length ? new Date(values[0]).toISOString() : null;
}

function lastIso(events: MemoryV2ObservabilityEvent[]): string | null {
  const values = events.map((event) =>
    Date.parse(String(event.created_at ?? ""))
  )
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  return values.length
    ? new Date(values[values.length - 1]).toISOString()
    : null;
}

function eventCostEur(eventPayload: Record<string, unknown>): number {
  const cost = eventPayload.cost;
  if (cost && typeof cost === "object") {
    return num((cost as Record<string, unknown>).eur);
  }
  return num(eventPayload.cost_eur ?? eventPayload.llm_cost_eur);
}

export function buildMemoryV2OpsScorecard(
  eventsRaw: MemoryV2ObservabilityEvent[],
): MemoryV2OpsScorecard {
  const events = Array.isArray(eventsRaw) ? eventsRaw : [];
  const retrievalModes: Record<string, number> = {};
  const topicDecisions: Record<string, number> = {};
  const payloadCounts: number[] = [];
  const loaderMs: number[] = [];
  const totalMs: number[] = [];
  const compactionLatencies: number[] = [];
  const userIds = new Set<string>();
  const costByUser = new Map<string, number>();
  const extractionTokensByUser = new Map<string, number>();
  const crossTopicByUser = new Map<string, number>();

  let activeLoads = 0;
  let topicRouterSkipped = 0;
  let dispatcherPlanMissing = 0;
  let memoryNoneItemCount = 0;
  let crossTopicLoads = 0;
  let crossTopicFallback = 0;
  let invalidInjection = 0;
  let sensitiveExcluded = 0;
  let deletedItemInPayload = 0;
  let crossUserMemoryAccess = 0;
  let memorizerRuns = 0;
  let memorizerFailedRuns = 0;
  let proposedItems = 0;
  let acceptedItems = 0;
  let rejectedItems = 0;
  let preFilterSkips = 0;
  let statementAsFact = 0;
  let idempotentSkips = 0;
  let compactionRuns = 0;
  let failedValidation = 0;
  let unsupportedClaims = 0;
  let observedCost = 0;

  for (const event of events) {
    const userId = String(event.user_id ?? "").trim();
    if (userId) userIds.add(userId);
    const p = payload(event);
    const costEur = eventCostEur(p);
    observedCost += costEur;
    if (userId && costEur > 0) {
      costByUser.set(userId, (costByUser.get(userId) ?? 0) + costEur);
    }

    if (event.event_name === "memory.runtime.active.loaded") {
      activeLoads++;
      const retrievalMode = String(p.retrieval_mode ?? "unknown");
      incr(retrievalModes, retrievalMode);
      incr(topicDecisions, p.topic_decision);
      const payloadItemCount = num(p.payload_item_count);
      payloadCounts.push(payloadItemCount);
      loaderMs.push(num(p.loader_ms));
      totalMs.push(num(p.total_ms));
      if (bool(p.topic_router_skipped)) topicRouterSkipped++;
      if (p.dispatcher_memory_plan_applied !== true) dispatcherPlanMissing++;
      if (
        String(p.dispatcher_memory_mode ?? "") === "none" &&
        payloadItemCount > 0
      ) {
        memoryNoneItemCount += payloadItemCount;
      }
      if (retrievalMode === "cross_topic_lookup") {
        crossTopicLoads++;
        if (userId) {
          crossTopicByUser.set(userId, (crossTopicByUser.get(userId) ?? 0) + 1);
        }
        if (bool(p.fallback_used)) crossTopicFallback++;
      }
      invalidInjection += num(p.invalid_injection_count);
      sensitiveExcluded += num(p.sensitive_excluded_count);
      deletedItemInPayload += num(p.deleted_item_in_payload_count);
      crossUserMemoryAccess += num(p.cross_user_memory_access_count);
    }

    if (
      event.event_name === "memorizer.persistence_completed" ||
      event.event_name === "memory.memorizer.completed"
    ) {
      memorizerRuns++;
      proposedItems += num(
        p.proposed_item_count ?? (p.counts as any)?.proposed_item_count,
      );
      acceptedItems += num(
        p.accepted_item_count ?? (p.counts as any)?.accepted_item_count,
      );
      rejectedItems += num(
        p.rejected_item_count ?? (p.counts as any)?.rejected_item_count,
      );
      statementAsFact += num(
        p.statement_as_fact_violation_count ??
          (p.counts as any)?.statement_as_fact_violation_count,
      );
      preFilterSkips += num(
        p.pre_filter_skip_count ?? (p.counts as any)?.pre_filter_skip_count,
      );
      const extractionTokens = num(
        p.extraction_tokens ?? p.total_tokens ?? (p.cost as any)?.total_tokens,
      );
      if (userId && extractionTokens > 0) {
        extractionTokensByUser.set(
          userId,
          (extractionTokensByUser.get(userId) ?? 0) + extractionTokens,
        );
      }
    }
    if (
      event.event_name === "memory.memorizer.failed" ||
      event.event_name === "memorizer.persistence_failed"
    ) {
      memorizerFailedRuns++;
    }
    if (
      event.event_name === "memory.memorizer.skipped" ||
      event.event_name === "memorizer.idempotent_skipped"
    ) {
      idempotentSkips++;
    }

    if (event.event_name === "memory.compaction.topic.completed") {
      compactionRuns++;
      unsupportedClaims += num(p.unsupported_claim_count);
      failedValidation +=
        Array.isArray(p.issues) && (p.issues as unknown[]).length > 0 ? 1 : 0;
      compactionLatencies.push(num(p.latency_ms));
    }
    if (event.event_name === "memory.compaction.topic.failed") {
      compactionRuns++;
      failedValidation++;
      unsupportedClaims += num(p.unsupported_claim_count);
      compactionLatencies.push(num(p.latency_ms));
    }
  }

  const windowHours = (() => {
    const from = Date.parse(firstIso(events) ?? "");
    const to = Date.parse(lastIso(events) ?? "");
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return 24;
    return Math.max(1 / 60, (to - from) / 3_600_000);
  })();
  const dayFactor = 24 / windowHours;
  const usersDenominator = Math.max(1, userIds.size);
  const costPerUserDay = [...costByUser.values()].map((value) =>
    value * dayFactor
  );
  const scorecard: MemoryV2OpsScorecard = {
    window: {
      from: firstIso(events),
      to: lastIso(events),
      event_count: events.length,
    },
    runtime: {
      active_load_count: activeLoads,
      retrieval_mode_distribution: retrievalModes,
      topic_decision_distribution: topicDecisions,
      topic_router_skipped_count: topicRouterSkipped,
      dispatcher_plan_missing_count: dispatcherPlanMissing,
      memory_none_item_count: memoryNoneItemCount,
      payload_item_count_avg: avg(payloadCounts),
      payload_item_count_max: payloadCounts.length
        ? Math.max(...payloadCounts)
        : 0,
      loader_ms_p95: p95(loaderMs),
      total_ms_p95: p95(totalMs),
      cross_topic_fallback_count: crossTopicFallback,
      cross_topic_fallback_rate: ratio(crossTopicFallback, crossTopicLoads),
    },
    memorizer: {
      run_count: memorizerRuns,
      failed_run_count: memorizerFailedRuns,
      failed_runs_per_hour: round2(memorizerFailedRuns / windowHours),
      runs_per_user_day: userIds.size > 0
        ? round2((memorizerRuns / usersDenominator) * dayFactor)
        : null,
      proposed_item_count: proposedItems,
      accepted_item_count: acceptedItems,
      rejected_item_count: rejectedItems,
      pre_filter_skip_count: preFilterSkips,
      pre_filter_skip_rate: ratio(preFilterSkips, rejectedItems),
      statement_as_fact_violation_count: statementAsFact,
      idempotent_skip_count: idempotentSkips,
    },
    compaction: {
      run_count: compactionRuns,
      failed_validation_count: failedValidation,
      unsupported_claim_count: unsupportedClaims,
      unsupported_claim_rate: ratio(unsupportedClaims, compactionRuns),
      latency_ms_p95: p95(compactionLatencies),
    },
    privacy: {
      invalid_injection_count: invalidInjection,
      sensitive_excluded_count: sensitiveExcluded,
      deleted_item_in_payload_count: deletedItemInPayload,
      cross_user_memory_access_count: crossUserMemoryAccess,
    },
    cost: {
      observed_cost_eur: observedCost > 0 ? round2(observedCost) : null,
      cost_per_user_eur: observedCost > 0 && userIds.size > 0
        ? round2(observedCost / userIds.size)
        : null,
      total_cost_per_user_day_p50: percentile(costPerUserDay, 0.50),
      total_cost_per_user_day_p95: percentile(costPerUserDay, 0.95),
      total_cost_per_user_day_p99: percentile(costPerUserDay, 0.99),
      extraction_tokens_per_user_day: extractionTokensByUser.size > 0
        ? round2(
          ([...extractionTokensByUser.values()].reduce((sum, value) =>
            sum + value
          , 0) / usersDenominator) * dayFactor,
        )
        : null,
      cross_topic_lookup_calls_per_user_day: crossTopicByUser.size > 0
        ? round2(
          ([...crossTopicByUser.values()].reduce((sum, value) =>
            sum + value
          , 0) / usersDenominator) * dayFactor,
        )
        : null,
    },
    alerts: [],
  };
  scorecard.alerts = evaluateMemoryV2CriticalAlerts(scorecard);
  return scorecard;
}

function alert(args: {
  key: string;
  severity?: MemoryV2AlertSeverity;
  value: number | null;
  threshold: number;
  message: string;
}): MemoryV2Alert | null {
  const value = args.value ?? 0;
  if (value <= args.threshold) return null;
  return {
    key: args.key,
    severity: args.severity ?? "critical",
    value,
    threshold: args.threshold,
    message: args.message,
  };
}

export function evaluateMemoryV2CriticalAlerts(
  scorecard: MemoryV2OpsScorecard,
): MemoryV2Alert[] {
  return [
    alert({
      key: "invalid_injection_count",
      value: scorecard.privacy.invalid_injection_count,
      threshold: 0,
      message: "Memory V2 injected an invalid item.",
    }),
    alert({
      key: "statement_as_fact_violation_count",
      value: scorecard.memorizer.statement_as_fact_violation_count,
      threshold: 0,
      message: "Memory V2 memorizer produced statement-as-fact violations.",
    }),
    alert({
      key: "deleted_item_in_payload",
      value: scorecard.privacy.deleted_item_in_payload_count,
      threshold: 0,
      message: "A deleted or hidden memory item reached a payload.",
    }),
    alert({
      key: "cross_user_memory_access",
      value: scorecard.privacy.cross_user_memory_access_count,
      threshold: 0,
      message: "Potential cross-user memory access detected.",
    }),
    alert({
      key: "compaction_unsupported_claim_rate",
      value: scorecard.compaction.unsupported_claim_rate,
      threshold: 0.05,
      message: "Compaction unsupported claim rate exceeded 5%.",
    }),
    alert({
      key: "memory_none_item_count",
      value: scorecard.runtime.memory_none_item_count,
      threshold: 0,
      message: "Dispatcher memory_mode=none still produced memory items.",
    }),
    alert({
      key: "dispatcher_plan_missing_count",
      severity: "warning",
      value: scorecard.runtime.dispatcher_plan_missing_count,
      threshold: 0,
      message: "Active loader ran without dispatcher memory plan metadata.",
    }),
    alert({
      key: "cost_per_user_day_p95",
      value: scorecard.cost.total_cost_per_user_day_p95,
      threshold: 0.60,
      message: "Memory V2 p95 cost per user per day exceeded 0.60 EUR.",
    }),
    alert({
      key: "loader_latency_p95",
      value: scorecard.runtime.loader_ms_p95,
      threshold: 2000,
      message: "Memory V2 loader p95 latency exceeded 2000ms.",
    }),
    alert({
      key: "memorizer_failed_runs_per_hour",
      value: scorecard.memorizer.failed_runs_per_hour,
      threshold: 5,
      message: "Memory V2 memorizer failures exceeded 5 per hour.",
    }),
  ].filter((entry): entry is MemoryV2Alert => Boolean(entry));
}
