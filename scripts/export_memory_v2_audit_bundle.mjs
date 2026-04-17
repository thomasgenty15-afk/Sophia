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
    scope: "whatsapp",
    scopeAll: false,
    from: null,
    to: null,
    hours: 72,
    outFile: null,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--user-id") out.userId = String(argv[++i] ?? "").trim() || null;
    else if (a === "--scope") out.scope = String(argv[++i] ?? "").trim() || "whatsapp";
    else if (a === "--scope-all") out.scopeAll = true;
    else if (a === "--from") out.from = String(argv[++i] ?? "").trim() || null;
    else if (a === "--to") out.to = String(argv[++i] ?? "").trim() || null;
    else if (a === "--hours") {
      const hours = Number(argv[++i] ?? "");
      out.hours = Number.isFinite(hours) && hours > 0 ? hours : 72;
    } else if (a === "--out") out.outFile = String(argv[++i] ?? "").trim() || null;
    else if (a === "--help" || a === "-h") out.help = true;
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
  const supabaseCli = String(process.env.SOPHIA_SUPABASE_CLI ?? "supabase").trim();
  const raw = execSync(`${supabaseCli} status --output json`, {
    encoding: "utf8",
    cwd: repoRoot,
  });
  return JSON.parse(raw);
}

function getSupabaseConnection(repoRoot) {
  const envUrl = String(process.env.SUPABASE_URL ?? "").trim();
  const envService = String(
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? "",
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
    dt.getUTCFullYear(), pad2(dt.getUTCMonth() + 1), pad2(dt.getUTCDate()),
    "T", pad2(dt.getUTCHours()), pad2(dt.getUTCMinutes()), pad2(dt.getUTCSeconds()), "Z",
  ].join("");
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
  if (!res.ok) throw new Error(`GET ${tablePath} → ${res.status}: ${text.slice(0, 800)}`);
  return JSON.parse(text);
}

// ---------------------------------------------------------------------------
// Data loaders
// ---------------------------------------------------------------------------

async function loadMessages(baseUrl, serviceKey, userId, fromIso, toIso, scope) {
  const scopeFilter = scope ? `&scope=eq.${scope}` : "";
  return supabaseGet(baseUrl, serviceKey,
    `chat_messages?user_id=eq.${userId}&created_at=gte.${fromIso}&created_at=lte.${toIso}${scopeFilter}&select=id,role,content,scope,created_at,metadata&order=created_at.asc`);
}

const MEMORY_V2_EVENT_TYPES = [
  "memory_retrieval_executed_v2",
  "memory_persisted_v2",
  "memory_handoff_v2",
];

async function loadMemorySnapshots(baseUrl, serviceKey, userId, fromIso, toIso) {
  const typeFilter = MEMORY_V2_EVENT_TYPES.map((t) => `"${t}"`).join(",");
  return supabaseGet(baseUrl, serviceKey,
    `system_runtime_snapshots?user_id=eq.${userId}&snapshot_type=in.(${typeFilter})&created_at=gte.${fromIso}&created_at=lte.${toIso}&select=id,snapshot_type,payload,created_at&order=created_at.asc`);
}

async function loadGlobalMemories(baseUrl, serviceKey, userId) {
  return supabaseGet(baseUrl, serviceKey,
    `user_global_memories?user_id=eq.${userId}&select=id,full_key,theme,subtheme_key,canonical_summary,status,scope,cycle_id,transformation_id,mention_count,confidence,last_observed_at,created_at,updated_at,metadata&order=updated_at.desc&limit=200`);
}

async function loadTopicMemories(baseUrl, serviceKey, userId) {
  return supabaseGet(baseUrl, serviceKey,
    `user_topic_memories?user_id=eq.${userId}&select=id,slug,title,synthesis,status,metadata,last_enriched_at,created_at,updated_at&order=updated_at.desc&limit=200`);
}

async function loadEventMemories(baseUrl, serviceKey, userId, fromIso, toIso) {
  return supabaseGet(baseUrl, serviceKey,
    `user_event_memories?user_id=eq.${userId}&created_at=gte.${fromIso}&created_at=lte.${toIso}&select=id,event_key,title,summary,event_type,starts_at,ends_at,relevance_until,status,confidence,metadata,created_at,updated_at&order=created_at.asc`);
}

async function loadCoreIdentity(baseUrl, serviceKey, userId) {
  return supabaseGet(baseUrl, serviceKey,
    `user_core_identity?user_id=eq.${userId}&select=*&limit=1`);
}

// ---------------------------------------------------------------------------
// Trace builders
// ---------------------------------------------------------------------------

function buildRetrievalByIntent(snapshots) {
  return snapshots
    .filter((s) => s.snapshot_type === "memory_retrieval_executed_v2")
    .map((s) => {
      const p = s.payload ?? {};
      return {
        at: s.created_at,
        intent: p.intent ?? null,
        layers_loaded: p.layers_loaded ?? [],
        budget_tier: p.budget_tier ?? null,
        tokens_used: p.tokens_used ?? 0,
        hit_count: p.hit_count ?? 0,
        cycle_id: p.cycle_id ?? null,
        transformation_id: p.transformation_id ?? null,
      };
    });
}

function buildPersistenceEvents(snapshots) {
  return snapshots
    .filter((s) => s.snapshot_type === "memory_persisted_v2")
    .map((s) => {
      const p = s.payload ?? {};
      return {
        at: s.created_at,
        layer: p.layer ?? null,
        action: p.action ?? null,
        memory_type: p.memory_type ?? null,
        memory_id: p.memory_id ?? null,
        cycle_id: p.cycle_id ?? null,
        transformation_id: p.transformation_id ?? null,
      };
    });
}

function buildHandoffEvents(snapshots) {
  return snapshots
    .filter((s) => s.snapshot_type === "memory_handoff_v2")
    .map((s) => {
      const p = s.payload ?? {};
      return {
        at: s.created_at,
        from_transformation_id: p.from_transformation_id ?? null,
        to_transformation_id: p.to_transformation_id ?? null,
        wins_count: p.wins_count ?? 0,
        supports_kept_count: p.supports_kept_count ?? 0,
        techniques_failed_count: p.techniques_failed_count ?? 0,
      };
    });
}

function buildMemorySnapshot(globals, topics, events, identity) {
  const globalsByScope = {};
  for (const g of globals) {
    const scope = g.scope ?? "transformation";
    if (!globalsByScope[scope]) globalsByScope[scope] = [];
    globalsByScope[scope].push({
      id: g.id,
      full_key: g.full_key,
      theme: g.theme,
      subtheme_key: g.subtheme_key,
      sub_theme: g.subtheme_key,
      canonical_summary: g.canonical_summary,
      value: g.canonical_summary,
      status: g.status ?? null,
      scope: g.scope,
      cycle_id: g.cycle_id,
      transformation_id: g.transformation_id,
      mention_count: g.mention_count ?? null,
      confidence: g.confidence ?? null,
      last_observed_at: g.last_observed_at ?? null,
      updated_at: g.updated_at,
    });
  }

  return {
    globals_total: globals.length,
    globals_by_scope: globalsByScope,
    topics_total: topics.length,
    topics: topics.slice(0, 50).map((t) => ({
      id: t.id,
      slug: t.slug,
      topic: t.slug,
      title: t.title,
      synthesis: t.synthesis,
      summary: t.synthesis,
      status: t.status ?? null,
      last_enriched_at: t.last_enriched_at ?? null,
      updated_at: t.updated_at,
    })),
    events_in_window: events.length,
    events: events.slice(0, 50).map((e) => ({
      id: e.id,
      event_key: e.event_key,
      title: e.title,
      summary: e.summary,
      event_type: e.event_type,
      starts_at: e.starts_at ?? null,
      ends_at: e.ends_at ?? null,
      relevance_until: e.relevance_until ?? null,
      event_date: e.starts_at ?? e.relevance_until ?? e.created_at,
      status: e.status ?? null,
      confidence: e.confidence ?? null,
      metadata: e.metadata ?? {},
      details: e.metadata ?? {},
      created_at: e.created_at,
      updated_at: e.updated_at ?? null,
    })),
    identity: identity[0] ?? null,
  };
}

// ---------------------------------------------------------------------------
// Scorecard
// ---------------------------------------------------------------------------

function computeScorecard(retrievalByIntent, persistenceEvents, handoffEvents, globals, messages) {
  const intentDistribution = {};
  let totalTokens = 0;
  let totalHits = 0;
  const layerLoadDistribution = {};

  for (const r of retrievalByIntent) {
    if (r.intent) {
      intentDistribution[r.intent] = (intentDistribution[r.intent] ?? 0) + 1;
    }
    totalTokens += r.tokens_used ?? 0;
    totalHits += r.hit_count ?? 0;
    for (const layer of r.layers_loaded) {
      layerLoadDistribution[layer] = (layerLoadDistribution[layer] ?? 0) + 1;
    }
  }

  const avgTokensPerRetrieval = retrievalByIntent.length > 0
    ? Math.round(totalTokens / retrievalByIntent.length)
    : null;
  const avgHitsPerRetrieval = retrievalByIntent.length > 0
    ? Math.round((totalHits / retrievalByIntent.length) * 10) / 10
    : null;

  const actionDistribution = {};
  const layerPersistDistribution = {};
  const scopeDistribution = {};

  for (const p of persistenceEvents) {
    if (p.action) actionDistribution[p.action] = (actionDistribution[p.action] ?? 0) + 1;
    if (p.layer) layerPersistDistribution[p.layer] = (layerPersistDistribution[p.layer] ?? 0) + 1;
  }

  for (const g of globals) {
    const scope = g.scope ?? "transformation";
    scopeDistribution[scope] = (scopeDistribution[scope] ?? 0) + 1;
  }

  const totalPersisted = persistenceEvents.length;
  const createCount = actionDistribution.create ?? 0;
  const enrichCount = actionDistribution.enrich ?? 0;
  const noopCount = actionDistribution.noop ?? 0;
  const acceptanceRate = totalPersisted > 0
    ? Math.round(((createCount + enrichCount) / totalPersisted) * 100)
    : null;

  const handoffCount = handoffEvents.length;
  const handoffVolume = handoffEvents.reduce(
    (acc, h) => acc + h.wins_count + h.supports_kept_count, 0,
  );

  const alerts = [];

  for (const r of retrievalByIntent) {
    if (r.intent === "daily_bilan" && r.layers_loaded.length > 4) {
      alerts.push(`budget_overrun_layers: daily_bilan loaded ${r.layers_loaded.length} layers at ${r.at}`);
    }
    if (r.intent === "nudge_decision" && r.tokens_used > 1500) {
      alerts.push(`budget_overrun_tokens: nudge_decision used ${r.tokens_used} tokens at ${r.at}`);
    }
  }

  const layersNeverLoaded = ["cycle", "transformation", "execution", "coaching", "relational", "event"]
    .filter((l) => !layerLoadDistribution[l]);
  if (layersNeverLoaded.length > 0) {
    alerts.push(`layer_never_loaded: ${layersNeverLoaded.join(", ")}`);
  }

  if (noopCount > 0 && noopCount > createCount + enrichCount) {
    alerts.push(`high_noop_rate: ${noopCount} noop vs ${createCount + enrichCount} meaningful writes`);
  }

  return {
    coverage: {
      messages: messages.length,
      retrieval_events: retrievalByIntent.length,
      persistence_events: persistenceEvents.length,
      handoff_events: handoffCount,
    },
    identification: {
      total_persisted: totalPersisted,
      creates: createCount,
      enriches: enrichCount,
      updates: actionDistribution.update ?? 0,
      noops: noopCount,
      acceptance_rate: acceptanceRate,
    },
    tagging: {
      scope_distribution: scopeDistribution,
    },
    persistence: {
      action_distribution: actionDistribution,
      layer_distribution: layerPersistDistribution,
    },
    retrieval: {
      intent_distribution: intentDistribution,
      avg_tokens_per_retrieval: avgTokensPerRetrieval,
      avg_hits_per_retrieval: avgHitsPerRetrieval,
      layer_load_distribution: layerLoadDistribution,
      total_retrievals: retrievalByIntent.length,
    },
    handoff: {
      count: handoffCount,
      total_volume: handoffVolume,
    },
    alerts,
  };
}

// ---------------------------------------------------------------------------
// Transcript writer
// ---------------------------------------------------------------------------

function transcriptWrite(filePath, messages) {
  const fd = fs.openSync(filePath, "w");
  try {
    for (const row of messages ?? []) {
      const ts = String(row?.created_at ?? "");
      const scope = String(row?.scope ?? "");
      const role = String(row?.role ?? "");
      const requestId = String(
        row?.metadata?.request_id ??
          row?.metadata?.router_decision_v2?.request_id ?? "",
      ).trim();
      const content = String(row?.content ?? "")
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n");
      const header = `[${ts}]${scope ? ` [${scope}]` : ""} ${role}${
        requestId ? ` (request_id=${requestId})` : ""
      }:`;
      fs.writeSync(fd, `${header}\n${content}\n\n`, null, "utf8");
    }
  } finally {
    fs.closeSync(fd);
  }
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
      "  node ./scripts/export_memory_v2_audit_bundle.mjs --user-id <uuid> --hours 72",
      "  node ./scripts/export_memory_v2_audit_bundle.mjs --user-id <uuid> --from <ISO> --to <ISO>",
      "",
      "Options:",
      "  --user-id <uuid>     Required. User UUID",
      "  --hours <N>          Window in hours (default: 72)",
      "  --from <ISO>         Start datetime (alternative to --hours)",
      "  --to <ISO>           End datetime",
      "  --scope <name>       Default: whatsapp",
      "  --scope-all          Do not filter by scope",
      "  --out <path>         Output JSON path (default: tmp/)",
      "",
      "Environment:",
      "  SUPABASE_URL                  If set, uses remote. Otherwise falls back to local supabase.",
      "  SUPABASE_SERVICE_ROLE_KEY     Required for remote.",
    ].join("\n"));
    return;
  }

  if (!args.userId) {
    console.error('Missing --user-id "<uuid>"');
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
    throw new Error("Missing service key. Set SUPABASE_SERVICE_ROLE_KEY or use local supabase.");
  }

  const baseUrl = connection.url.replace(/\/+$/, "");
  const now = new Date().toISOString();
  const fromIso = toIsoOrNull(args.from) ?? new Date(Date.now() - args.hours * 3600 * 1000).toISOString();
  const toIso = toIsoOrNull(args.to) ?? now;
  const effectiveScope = args.scopeAll ? null : args.scope;

  console.error(`Connecting to ${baseUrl} (${connection.source})…`);
  console.error(`Loading memory V2 audit for user=${args.userId.slice(0, 8)}… window=${args.hours}h scope=${effectiveScope ?? "all"}`);

  const [messages, memorySnapshots, globals, topics, events, identity] = await Promise.all([
    loadMessages(baseUrl, connection.serviceKey, args.userId, fromIso, toIso, effectiveScope),
    loadMemorySnapshots(baseUrl, connection.serviceKey, args.userId, fromIso, toIso),
    loadGlobalMemories(baseUrl, connection.serviceKey, args.userId),
    loadTopicMemories(baseUrl, connection.serviceKey, args.userId),
    loadEventMemories(baseUrl, connection.serviceKey, args.userId, fromIso, toIso),
    loadCoreIdentity(baseUrl, connection.serviceKey, args.userId),
  ]);

  const retrievalByIntent = buildRetrievalByIntent(memorySnapshots);
  const persistenceEvents = buildPersistenceEvents(memorySnapshots);
  const handoffEvents = buildHandoffEvents(memorySnapshots);
  const memorySnapshot = buildMemorySnapshot(globals, topics, events, identity);

  const unassignedEvents = memorySnapshots.filter((s) =>
    !MEMORY_V2_EVENT_TYPES.includes(s.snapshot_type),
  ).map((s) => ({
    at: s.created_at,
    type: s.snapshot_type,
    payload: s.payload ?? {},
  }));

  const userMessages = messages.filter((m) => m.role === "user").length;
  const assistantMessages = messages.filter((m) => m.role === "assistant").length;

  const trace = {
    window: { from: fromIso, to: toIso, scope: effectiveScope, hours: args.hours },
    summary: {
      messages_total: messages.length,
      user_messages: userMessages,
      assistant_messages: assistantMessages,
      retrieval_events_total: retrievalByIntent.length,
      persistence_events_total: persistenceEvents.length,
      handoff_events_total: handoffEvents.length,
    },
    messages,
    retrieval_by_intent: retrievalByIntent,
    persistence_events: persistenceEvents,
    handoff_events: handoffEvents,
    memory_snapshot: memorySnapshot,
    unassigned_events: unassignedEvents,
  };

  const scorecard = computeScorecard(
    retrievalByIntent, persistenceEvents, handoffEvents, globals, messages,
  );

  const bundle = {
    ok: true,
    exported_at: now,
    source: { supabase_url: baseUrl, connection_type: connection.source },
    request: {
      user_id: args.userId,
      scope: effectiveScope,
      from: fromIso,
      to: toIso,
      used_hours: args.from ? null : args.hours,
    },
    trace,
    scorecard,
    annotations: [],
  };

  const outDir = path.join(repoRoot, "tmp");
  fs.mkdirSync(outDir, { recursive: true });
  const scopeLabel = effectiveScope ?? "all";
  const defaultOutFile = path.join(
    outDir,
    `memory_v2_audit_${args.userId.slice(0, 8)}_${scopeLabel}_${compactTs(fromIso)}_${compactTs(toIso)}.json`,
  );
  const outFile = args.outFile ? path.resolve(repoRoot, args.outFile) : defaultOutFile;
  fs.mkdirSync(path.dirname(outFile), { recursive: true });

  const transcriptPath = outFile.replace(/\.json$/i, ".transcript.txt");

  fs.writeFileSync(outFile, JSON.stringify(bundle, null, 2), "utf8");
  transcriptWrite(transcriptPath, messages);

  console.log(JSON.stringify({
    ok: true,
    out: outFile,
    transcript: transcriptPath,
    window: { from: fromIso, to: toIso, scope: effectiveScope },
    counts: {
      messages: messages.length,
      retrievals: retrievalByIntent.length,
      persisted: persistenceEvents.length,
      handoffs: handoffEvents.length,
      globals: globals.length,
      topics: topics.length,
      events: events.length,
    },
    scorecard_summary: {
      retrieval: scorecard.retrieval,
      tagging: scorecard.tagging,
      alerts: scorecard.alerts,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
