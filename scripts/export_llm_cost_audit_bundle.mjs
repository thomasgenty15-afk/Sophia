import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import process from "node:process";

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = {
    userId: null,
    allUsers: false,
    from: null,
    to: null,
    hours: 168,
    outFile: null,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--user-id") out.userId = String(argv[++i] ?? "").trim() || null;
    else if (a === "--all-users") out.allUsers = true;
    else if (a === "--from") out.from = String(argv[++i] ?? "").trim() || null;
    else if (a === "--to") out.to = String(argv[++i] ?? "").trim() || null;
    else if (a === "--hours") {
      const hours = Number(argv[++i] ?? "");
      out.hours = Number.isFinite(hours) && hours > 0 ? hours : 168;
    } else if (a === "--out") {
      out.outFile = String(argv[++i] ?? "").trim() || null;
    } else if (a === "--help" || a === "-h") out.help = true;
  }

  return out;
}

function isIsoLike(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return false;
  return Number.isFinite(new Date(raw).getTime());
}

function toIsoOrNull(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const dt = new Date(raw);
  return Number.isFinite(dt.getTime()) ? dt.toISOString() : null;
}

// ---------------------------------------------------------------------------
// Supabase connection
// ---------------------------------------------------------------------------

function getLocalSupabaseStatus(repoRoot) {
  const supabaseCli = String(process.env.SOPHIA_SUPABASE_CLI ?? "supabase")
    .trim();
  const raw = execSync(`${supabaseCli} status --output json`, {
    encoding: "utf8",
    cwd: repoRoot,
  });
  return JSON.parse(raw);
}

function getSupabaseConnection(repoRoot) {
  const envUrl = String(process.env.SUPABASE_URL ?? "").trim();
  const envService = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ??
      "",
  ).trim();

  if (envUrl) {
    return { url: envUrl, serviceKey: envService || null, source: "env" };
  }

  const st = getLocalSupabaseStatus(repoRoot);
  const url = String(st?.API_URL ?? "").trim();
  const serviceKey = String(st?.SECRET_KEY ?? "").trim() || null;
  if (!url) {
    throw new Error(
      "Missing SUPABASE_URL env and no local `supabase status --output json` available.",
    );
  }
  return { url, serviceKey, source: "local" };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pad2(n) {
  return String(n).padStart(2, "0");
}

function compactTs(iso) {
  const dt = new Date(iso);
  if (!Number.isFinite(dt.getTime())) return "unknown";
  return [
    dt.getUTCFullYear(),
    pad2(dt.getUTCMonth() + 1),
    pad2(dt.getUTCDate()),
    "T",
    pad2(dt.getUTCHours()),
    pad2(dt.getUTCMinutes()),
    pad2(dt.getUTCSeconds()),
    "Z",
  ].join("");
}

function dayKey(iso) {
  const dt = new Date(iso);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${
    pad2(dt.getUTCDate())
  }`;
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

// ---------------------------------------------------------------------------
// Tier classification
// ---------------------------------------------------------------------------

const TIER_BY_FAMILY = {
  plan_generation: 1,
  summary_generation: 2,
  summarize_context: 2,
  dispatcher: 3,
  message_generation: 3,
  memorizer: 3,
  embedding: 3,
  watcher: 3,
  scheduling: 3,
  ethics_check: 3,
  duplicate_check: 3,
  other: 3,
};

const TIER2_SOURCE_PATTERNS = [
  "conversation_pulse",
  "generate-questionnaire",
  "momentum_outreach",
];

function classifyTier(event) {
  const src = String(event.source ?? "").toLowerCase();
  for (const pat of TIER2_SOURCE_PATTERNS) {
    if (src.includes(pat)) return 2;
  }
  const family = String(event.operation_family ?? "other").toLowerCase();
  return TIER_BY_FAMILY[family] ?? 3;
}

// ---------------------------------------------------------------------------
// Freshness windows for redundancy detection (in ms)
// ---------------------------------------------------------------------------

const FRESHNESS_WINDOWS = {
  conversation_pulse: 12 * 3600_000,
  momentum_morning_nudge: 20 * 3600_000,
  schedule_morning_nudge: 20 * 3600_000,
  topic_compaction: 3600_000,
};

function getFreshnessKey(source) {
  const src = String(source ?? "").toLowerCase();
  for (const [pattern, _window] of Object.entries(FRESHNESS_WINDOWS)) {
    if (src.includes(pattern)) return pattern;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Supabase REST helpers
// ---------------------------------------------------------------------------

async function supabaseGet(baseUrl, serviceKey, tablePath) {
  const url = `${baseUrl}/rest/v1/${tablePath}`;
  const res = await fetch(url, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `GET ${tablePath.slice(0, 80)} → ${res.status}: ${text.slice(0, 800)}`,
    );
  }
  return JSON.parse(text);
}

// ---------------------------------------------------------------------------
// Data loaders
// ---------------------------------------------------------------------------

async function loadLlmEvents(baseUrl, serviceKey, userId, fromIso, toIso) {
  const userFilter = userId ? `&user_id=eq.${userId}` : "";
  const select = [
    "id",
    "created_at",
    "request_id",
    "user_id",
    "source",
    "provider",
    "model",
    "kind",
    "prompt_tokens",
    "output_tokens",
    "total_tokens",
    "cost_usd",
    "operation_family",
    "operation_name",
    "channel",
    "status",
    "latency_ms",
    "cost_unpriced",
    "currency",
    "step_index",
  ].join(",");
  return supabaseGet(
    baseUrl,
    serviceKey,
    `llm_usage_events?created_at=gte.${fromIso}&created_at=lte.${toIso}${userFilter}&select=${select}&order=created_at.asc&limit=10000`,
  );
}

async function loadActiveUserIds(baseUrl, serviceKey, fromIso, toIso) {
  const events = await supabaseGet(
    baseUrl,
    serviceKey,
    `llm_usage_events?created_at=gte.${fromIso}&created_at=lte.${toIso}&user_id=not.is.null&select=user_id&limit=10000`,
  );
  return [...new Set(events.map((e) => e.user_id).filter(Boolean))];
}

// ---------------------------------------------------------------------------
// Analysis: timeline
// ---------------------------------------------------------------------------

function buildCallsTimeline(events) {
  return events.map((e) => ({
    at: e.created_at,
    source: e.source,
    operation_family: e.operation_family,
    operation_name: e.operation_name,
    provider: e.provider,
    model: e.model,
    kind: e.kind,
    prompt_tokens: Number(e.prompt_tokens ?? 0) || 0,
    output_tokens: Number(e.output_tokens ?? 0) || 0,
    total_tokens: Number(e.total_tokens ?? 0) || 0,
    cost_usd: round4(Number(e.cost_usd ?? 0) || 0),
    latency_ms: Number(e.latency_ms ?? 0) || 0,
    status: e.status ?? "success",
    channel: e.channel ?? "system",
    cost_unpriced: e.cost_unpriced === true,
    tier: classifyTier(e),
    user_id: e.user_id,
  }));
}

// ---------------------------------------------------------------------------
// Analysis: aggregations
// ---------------------------------------------------------------------------

function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const k = keyFn(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return map;
}

function aggregateGroup(items) {
  let costUsd = 0,
    promptTokens = 0,
    outputTokens = 0,
    totalTokens = 0,
    latencySum = 0,
    latencyCount = 0;
  for (const it of items) {
    costUsd += it.cost_usd;
    promptTokens += it.prompt_tokens;
    outputTokens += it.output_tokens;
    totalTokens += it.total_tokens;
    if (it.latency_ms > 0) {
      latencySum += it.latency_ms;
      latencyCount++;
    }
  }
  return {
    calls: items.length,
    cost_usd: round4(costUsd),
    prompt_tokens: promptTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens,
    avg_latency_ms: latencyCount > 0
      ? Math.round(latencySum / latencyCount)
      : null,
  };
}

function buildCallsByTier(timeline) {
  const byTier = groupBy(timeline, (t) => t.tier);
  const result = {};
  for (const tier of [1, 2, 3]) {
    const items = byTier.get(tier) ?? [];
    result[`tier_${tier}`] = aggregateGroup(items);
  }
  return result;
}

function buildCallsByFunction(timeline) {
  const byFamily = groupBy(timeline, (t) => t.operation_family ?? "other");
  const result = {};
  for (const [family, items] of byFamily) {
    result[family] = aggregateGroup(items);
  }
  return Object.fromEntries(
    Object.entries(result).sort((a, b) => b[1].cost_usd - a[1].cost_usd),
  );
}

function buildCallsByModel(timeline) {
  const byModel = groupBy(timeline, (t) => `${t.provider}/${t.model}`);
  const result = {};
  for (const [model, items] of byModel) {
    result[model] = aggregateGroup(items);
  }
  return Object.fromEntries(
    Object.entries(result).sort((a, b) => b[1].cost_usd - a[1].cost_usd),
  );
}

function buildDailyCostSeries(timeline) {
  const byDay = groupBy(timeline, (t) => dayKey(t.at));
  const days = [...byDay.keys()].sort();
  return days.map((day) => {
    const items = byDay.get(day) ?? [];
    const userIds = new Set(items.map((i) => i.user_id).filter(Boolean));
    return {
      day,
      cost_usd: round4(items.reduce((s, i) => s + i.cost_usd, 0)),
      calls: items.length,
      unique_users: userIds.size,
      tokens: items.reduce((s, i) => s + i.total_tokens, 0),
    };
  });
}

// ---------------------------------------------------------------------------
// Analysis: redundancy detection
// ---------------------------------------------------------------------------

function detectRedundantCalls(timeline) {
  const candidates = timeline.filter((t) => getFreshnessKey(t.source) !== null);
  const byUserAndSource = groupBy(
    candidates,
    (t) => `${t.user_id}::${getFreshnessKey(t.source)}`,
  );
  const redundant = [];

  for (const [_key, items] of byUserAndSource) {
    if (items.length < 2) continue;
    const sorted = items.sort((a, b) => new Date(a.at) - new Date(b.at));
    const freshnessKey = getFreshnessKey(sorted[0].source);
    const window = FRESHNESS_WINDOWS[freshnessKey];
    if (!window) continue;

    for (let i = 1; i < sorted.length; i++) {
      const delta = new Date(sorted[i].at) - new Date(sorted[i - 1].at);
      if (delta < window) {
        redundant.push({
          at: sorted[i].at,
          source: sorted[i].source,
          user_id: sorted[i].user_id,
          delta_ms: delta,
          freshness_window_ms: window,
          freshness_key: freshnessKey,
          cost_usd: sorted[i].cost_usd,
        });
      }
    }
  }

  return redundant;
}

// ---------------------------------------------------------------------------
// Analysis: fallbacks
// ---------------------------------------------------------------------------

function detectFallbacks(timeline) {
  return timeline
    .filter((t) => t.status !== "success" || t.cost_unpriced)
    .map((t) => ({
      at: t.at,
      source: t.source,
      status: t.status,
      cost_unpriced: t.cost_unpriced,
      model: t.model,
      provider: t.provider,
      user_id: t.user_id,
    }));
}

// ---------------------------------------------------------------------------
// Scorecard
// ---------------------------------------------------------------------------

function computeScorecard(timeline, dailySeries, redundantCalls, fallbacks) {
  const totalCost = round4(timeline.reduce((s, t) => s + t.cost_usd, 0));
  const totalCalls = timeline.length;
  const totalTokens = timeline.reduce((s, t) => s + t.total_tokens, 0);

  const uniqueUsers = new Set(timeline.map((t) => t.user_id).filter(Boolean));
  const activeDays = dailySeries.length || 1;
  const costPerUserPerDay = uniqueUsers.size > 0
    ? round4(totalCost / uniqueUsers.size / activeDays)
    : 0;

  const byTier = buildCallsByTier(timeline);
  const byFunction = buildCallsByFunction(timeline);

  const topCostFunctions = Object.entries(byFunction)
    .slice(0, 5)
    .map(([fn, agg]) => ({ function: fn, ...agg }));

  const unpricedCount = timeline.filter((t) => t.cost_unpriced).length;
  const failedCount = timeline.filter((t) => t.status !== "success").length;

  // Cost trend: second half vs first half
  let costTrend = null;
  if (dailySeries.length >= 4) {
    const mid = Math.floor(dailySeries.length / 2);
    const firstHalf = dailySeries.slice(0, mid).reduce(
      (s, d) => s + d.cost_usd,
      0,
    );
    const secondHalf = dailySeries.slice(mid).reduce(
      (s, d) => s + d.cost_usd,
      0,
    );
    if (firstHalf > 0) {
      costTrend = {
        first_half_cost: round4(firstHalf),
        second_half_cost: round4(secondHalf),
        ratio: round4(secondHalf / firstHalf),
        drift_detected: secondHalf / firstHalf > 1.2,
      };
    }
  }

  // Latency by tier
  const avgLatencyByTier = {};
  for (const tier of [1, 2, 3]) {
    const items = timeline.filter((t) => t.tier === tier && t.latency_ms > 0);
    avgLatencyByTier[`tier_${tier}`] = items.length > 0
      ? Math.round(items.reduce((s, i) => s + i.latency_ms, 0) / items.length)
      : null;
  }

  // Alerts
  const alerts = [];

  if (costPerUserPerDay > 0.50) {
    alerts.push({
      type: "daily_budget_exceeded",
      detail: `$${costPerUserPerDay}/user/day exceeds $0.50 budget`,
    });
  }

  if (redundantCalls.length > 0) {
    const pulseRedundant = redundantCalls.filter((r) =>
      r.freshness_key === "conversation_pulse"
    );
    if (pulseRedundant.length > 0) {
      alerts.push({
        type: "redundant_pulse_generation",
        count: pulseRedundant.length,
      });
    }
  }

  // Tier 3 using expensive model
  const expensiveTier3 = timeline.filter((t) =>
    t.tier === 3 && !/flash/i.test(t.model) && !/embed/i.test(t.model)
  );
  if (expensiveTier3.length > 0) {
    const models = [...new Set(expensiveTier3.map((t) => t.model))];
    alerts.push({
      type: "tier3_using_expensive_model",
      count: expensiveTier3.length,
      models,
    });
  }

  if (costTrend?.drift_detected) {
    alerts.push({ type: "cost_drift_detected", ratio: costTrend.ratio });
  }

  if (totalCalls > 0 && failedCount / totalCalls > 0.05) {
    alerts.push({
      type: "high_fallback_rate",
      rate: round4(failedCount / totalCalls),
    });
  }

  if (totalCalls > 0 && unpricedCount / totalCalls > 0.10) {
    alerts.push({
      type: "high_unpriced_rate",
      rate: round4(unpricedCount / totalCalls),
    });
  }

  // Tier 1 calls outside onboarding context
  const tier1Calls = timeline.filter((t) => t.tier === 1);
  if (tier1Calls.length > 6) {
    alerts.push({
      type: "tier1_high_volume",
      count: tier1Calls.length,
      note: "Expected 1-3 per cycle",
    });
  }

  return {
    total_cost_period: totalCost,
    cost_per_user_per_day: costPerUserPerDay,
    unique_users: uniqueUsers.size,
    active_days: activeDays,
    calls_total: totalCalls,
    tokens_total: totalTokens,
    cost_by_tier: {
      tier_1: byTier.tier_1?.cost_usd ?? 0,
      tier_2: byTier.tier_2?.cost_usd ?? 0,
      tier_3: byTier.tier_3?.cost_usd ?? 0,
    },
    calls_by_tier: {
      tier_1: byTier.tier_1?.calls ?? 0,
      tier_2: byTier.tier_2?.calls ?? 0,
      tier_3: byTier.tier_3?.calls ?? 0,
    },
    cost_by_function: Object.fromEntries(
      Object.entries(byFunction).map(([k, v]) => [k, v.cost_usd]),
    ),
    top_cost_functions: topCostFunctions,
    redundant_call_rate: totalCalls > 0
      ? round4(redundantCalls.length / totalCalls)
      : 0,
    redundant_call_count: redundantCalls.length,
    fallback_rate: totalCalls > 0 ? round4(failedCount / totalCalls) : 0,
    unpriced_rate: totalCalls > 0 ? round4(unpricedCount / totalCalls) : 0,
    cost_trend: costTrend,
    avg_latency_ms_by_tier: avgLatencyByTier,
    alerts,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const repoRoot = path.resolve(process.cwd());
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log([
      "Usage:",
      "  node ./scripts/export_llm_cost_audit_bundle.mjs --user-id <uuid> --hours 168",
      "  node ./scripts/export_llm_cost_audit_bundle.mjs --all-users --hours 168",
      "  node ./scripts/export_llm_cost_audit_bundle.mjs --user-id <uuid> --from <ISO> --to <ISO>",
      "",
      "Options:",
      "  --user-id <uuid>     Audit a single user",
      "  --all-users          Audit all users with LLM events in window",
      "  --hours <N>          Window in hours (default: 168 = 7 days)",
      "  --from <ISO>         Start datetime (alternative to --hours)",
      "  --to <ISO>           End datetime",
      "  --out <path>         Output JSON path (default: tmp/)",
      "",
      "Environment:",
      "  SUPABASE_URL                  If set, uses remote. Otherwise falls back to local supabase.",
      "  SUPABASE_SERVICE_ROLE_KEY     Required for remote.",
    ].join("\n"));
    return;
  }

  if (!args.userId && !args.allUsers) {
    console.error('Specify --user-id "<uuid>" or --all-users');
    process.exit(1);
  }
  if (args.from && !isIsoLike(args.from)) {
    console.error(`Invalid --from value: ${args.from}`);
    process.exit(1);
  }
  if (args.to && !isIsoLike(args.to)) {
    console.error(`Invalid --to value: ${args.to}`);
    process.exit(1);
  }

  const connection = getSupabaseConnection(repoRoot);
  if (!connection.serviceKey) {
    throw new Error(
      "Missing service key. Set SUPABASE_SERVICE_ROLE_KEY or use local supabase.",
    );
  }

  const baseUrl = connection.url.replace(/\/+$/, "");
  const now = new Date().toISOString();
  const fromIso = toIsoOrNull(args.from) ??
    new Date(Date.now() - args.hours * 3600 * 1000).toISOString();
  const toIso = toIsoOrNull(args.to) ?? now;

  const targetLabel = args.allUsers
    ? "all-users"
    : `user=${args.userId.slice(0, 8)}…`;
  console.error(`Connecting to ${baseUrl} (${connection.source})…`);
  console.error(
    `Loading LLM cost audit for ${targetLabel} window=${args.hours}h`,
  );

  // Load events
  const events = await loadLlmEvents(
    baseUrl,
    connection.serviceKey,
    args.allUsers ? null : args.userId,
    fromIso,
    toIso,
  );

  console.error(`Loaded ${events.length} LLM usage events`);

  // Build analysis
  const timeline = buildCallsTimeline(events);
  const callsByTier = buildCallsByTier(timeline);
  const callsByFunction = buildCallsByFunction(timeline);
  const callsByModel = buildCallsByModel(timeline);
  const dailyCostSeries = buildDailyCostSeries(timeline);
  const redundantCalls = detectRedundantCalls(timeline);
  const fallbacks = detectFallbacks(timeline);
  const scorecard = computeScorecard(
    timeline,
    dailyCostSeries,
    redundantCalls,
    fallbacks,
  );

  const trace = {
    window: { from: fromIso, to: toIso, hours: args.hours },
    summary: {
      events_total: events.length,
      unique_users: scorecard.unique_users,
      total_cost_usd: scorecard.total_cost_period,
      total_tokens: scorecard.tokens_total,
    },
    llm_calls_timeline: timeline,
    calls_by_tier: callsByTier,
    calls_by_function: callsByFunction,
    calls_by_model: callsByModel,
    daily_cost_series: dailyCostSeries,
    redundant_calls: redundantCalls,
    fallback_activations: fallbacks,
  };

  const bundle = {
    ok: true,
    exported_at: now,
    source: {
      supabase_url: baseUrl,
      connection_type: connection.source,
    },
    request: {
      user_id: args.userId ?? "all",
      from: fromIso,
      to: toIso,
      used_hours: args.from ? null : args.hours,
    },
    trace,
    scorecard,
    annotations: [],
  };

  // Write output
  const outDir = path.join(repoRoot, "tmp");
  fs.mkdirSync(outDir, { recursive: true });
  const userLabel = args.allUsers ? "all" : args.userId.slice(0, 8);
  const defaultOutFile = path.join(
    outDir,
    `llm_cost_audit_${userLabel}_${compactTs(fromIso)}_${
      compactTs(toIso)
    }.json`,
  );
  const outFile = args.outFile
    ? path.resolve(repoRoot, args.outFile)
    : defaultOutFile;
  fs.mkdirSync(path.dirname(outFile), { recursive: true });

  fs.writeFileSync(outFile, JSON.stringify(bundle, null, 2), "utf8");

  console.log(JSON.stringify(
    {
      ok: true,
      out: outFile,
      window: { from: fromIso, to: toIso },
      counts: {
        events: events.length,
        unique_users: scorecard.unique_users,
        redundant_calls: redundantCalls.length,
        fallback_activations: fallbacks.length,
      },
      scorecard_summary: {
        total_cost_period: scorecard.total_cost_period,
        cost_per_user_per_day: scorecard.cost_per_user_per_day,
        calls_by_tier: scorecard.calls_by_tier,
        cost_by_tier: scorecard.cost_by_tier,
        redundant_call_rate: scorecard.redundant_call_rate,
        fallback_rate: scorecard.fallback_rate,
        alerts: scorecard.alerts,
      },
    },
    null,
    2,
  ));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
