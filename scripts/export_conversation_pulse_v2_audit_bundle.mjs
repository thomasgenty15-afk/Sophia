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
    hours: 168,
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
      out.hours = Number.isFinite(hours) && hours > 0 ? hours : 168;
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

async function loadPulseSnapshots(baseUrl, serviceKey, userId, fromIso, toIso) {
  return supabaseGet(baseUrl, serviceKey,
    `system_runtime_snapshots?user_id=eq.${userId}&snapshot_type=eq.conversation_pulse&created_at=gte.${fromIso}&created_at=lte.${toIso}&select=id,payload,created_at&order=created_at.asc`);
}

const PULSE_EVENT_TYPES = [
  "conversation_pulse_generated_v2",
  "daily_bilan_decided_v2",
  "weekly_bilan_decided_v2",
  "morning_nudge_generated_v2",
  "proactive_window_decided_v2",
  "momentum_state_updated_v2",
];

async function loadRelatedSnapshots(baseUrl, serviceKey, userId, fromIso, toIso) {
  const typeFilter = PULSE_EVENT_TYPES.map((t) => `"${t}"`).join(",");
  return supabaseGet(baseUrl, serviceKey,
    `system_runtime_snapshots?user_id=eq.${userId}&snapshot_type=in.(${typeFilter})&created_at=gte.${fromIso}&created_at=lte.${toIso}&select=id,snapshot_type,payload,created_at&order=created_at.asc`);
}

async function loadEventMemories(baseUrl, serviceKey, userId, fromIso, toIso) {
  return supabaseGet(baseUrl, serviceKey,
    `user_event_memories?user_id=eq.${userId}&created_at=gte.${fromIso}&created_at=lte.${toIso}&select=id,event_key,title,summary,event_type,starts_at,ends_at,relevance_until,status,confidence,metadata,created_at,updated_at&order=created_at.asc`);
}

// ---------------------------------------------------------------------------
// Trace builders
// ---------------------------------------------------------------------------

const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

function flattenPulseOutput(pulse) {
  const tone = pulse?.tone ?? {};
  const trajectory = pulse?.trajectory ?? {};
  const highlights = pulse?.highlights ?? {};
  const signals = pulse?.signals ?? {};

  return {
    tone_dominant: tone.dominant ?? null,
    emotional_load: tone.emotional_load ?? null,
    relational_openness: tone.relational_openness ?? null,
    direction: trajectory.direction ?? null,
    confidence: trajectory.confidence ?? null,
    summary: trajectory.summary ?? null,
    highlights,
    wins: highlights.wins ?? [],
    friction_points: highlights.friction_points ?? [],
    support_that_helped: highlights.support_that_helped ?? [],
    unresolved_tensions: highlights.unresolved_tensions ?? [],
    likely_need: signals.likely_need ?? null,
    top_blocker: signals.top_blocker ?? null,
    upcoming_event: signals.upcoming_event ?? null,
    proactive_risk: signals.proactive_risk ?? null,
    evidence_refs: pulse?.evidence_refs ?? null,
    last_72h_weight: pulse?.last_72h_weight ?? null,
  };
}

function normalizeEventMemory(eventMemory) {
  return {
    id: eventMemory.id,
    event_key: eventMemory.event_key,
    title: eventMemory.title,
    summary: eventMemory.summary,
    event_type: eventMemory.event_type,
    starts_at: eventMemory.starts_at ?? null,
    ends_at: eventMemory.ends_at ?? null,
    relevance_until: eventMemory.relevance_until ?? null,
    event_date: eventMemory.starts_at ?? eventMemory.relevance_until ?? eventMemory.created_at,
    status: eventMemory.status ?? null,
    confidence: eventMemory.confidence ?? null,
    metadata: eventMemory.metadata ?? {},
    details: eventMemory.metadata ?? {},
    created_at: eventMemory.created_at,
    updated_at: eventMemory.updated_at ?? null,
  };
}

function buildPulseGenerations(pulseSnapshots, relatedSnapshots) {
  const generationEvents = relatedSnapshots.filter(
    (s) => s.snapshot_type === "conversation_pulse_generated_v2",
  );

  return pulseSnapshots.map((ps) => {
    const pulse = ps.payload ?? {};
    const matchingEvent = generationEvents.find((e) => {
      const p = e.payload ?? {};
      return p.snapshot_id === ps.id ||
        Math.abs(new Date(e.created_at) - new Date(ps.created_at)) < 5000;
    });

    const eventPayload = matchingEvent?.payload ?? {};

    return {
      generated_at: ps.created_at,
      snapshot_id: ps.id,
      output: flattenPulseOutput(pulse),
      tokens_used: eventPayload.tokens_used ?? null,
      latency_ms: eventPayload.latency_ms ?? null,
      model_used: eventPayload.model_used ?? null,
    };
  });
}

function buildSourceMessages(pulseSnapshots, messages) {
  return pulseSnapshots.map((ps) => {
    const pulse = ps.payload ?? {};
    const pulseTime = new Date(ps.created_at).getTime();
    const recentMessages = messages.filter((m) => {
      const msgTime = new Date(m.created_at).getTime();
      return msgTime <= pulseTime;
    });

    const sourceMessages = recentMessages.slice(-80).map((m) => {
      const msgTime = new Date(m.created_at).getTime();
      const ageMs = pulseTime - msgTime;
      return {
        message_id: m.id,
        role: m.role,
        created_at: m.created_at,
        is_within_72h: ageMs <= SEVENTY_TWO_HOURS_MS,
        age_hours: Math.round((ageMs / (60 * 60 * 1000)) * 10) / 10,
      };
    });

    const referencedIds = new Set(pulse.evidence_refs?.message_ids ?? []);

    return {
      pulse_at: ps.created_at,
      source_count: sourceMessages.length,
      within_72h_count: sourceMessages.filter((m) => m.is_within_72h).length,
      referenced_message_ids: [...referencedIds],
      messages: sourceMessages,
    };
  });
}

function buildDownstreamUsage(pulseSnapshots, relatedSnapshots) {
  const downstreamTypes = new Set([
    "daily_bilan_decided_v2",
    "weekly_bilan_decided_v2",
    "morning_nudge_generated_v2",
    "proactive_window_decided_v2",
  ]);

  const consumers = relatedSnapshots.filter((s) => downstreamTypes.has(s.snapshot_type));

  return consumers.map((c) => {
    const consumerTime = new Date(c.created_at).getTime();
    const closestPulse = pulseSnapshots.reduce((best, ps) => {
      const diff = consumerTime - new Date(ps.created_at).getTime();
      if (diff < 0) return best;
      return (!best || diff < best.diff) ? { snapshot: ps, diff } : best;
    }, null);

    const pulseAgeHours = closestPulse
      ? Math.round((closestPulse.diff / (60 * 60 * 1000)) * 10) / 10
      : null;

    return {
      consumer: c.snapshot_type.replace(/_v2$/, ""),
      read_at: c.created_at,
      pulse_snapshot_id: closestPulse?.snapshot?.id ?? null,
      pulse_age_hours: pulseAgeHours,
      pulse_was_stale: pulseAgeHours != null && pulseAgeHours > 12,
      decision_payload: c.payload ?? {},
    };
  });
}

function buildFreshnessViolations(downstreamUsage) {
  return downstreamUsage.filter((u) => u.pulse_was_stale).map((u) => ({
    consumer: u.consumer,
    read_at: u.read_at,
    pulse_age_hours: u.pulse_age_hours,
  }));
}

function buildRegenerationWasted(pulseSnapshots) {
  const wasted = [];
  for (let i = 1; i < pulseSnapshots.length; i++) {
    const prev = pulseSnapshots[i - 1];
    const curr = pulseSnapshots[i];
    const gapMs = new Date(curr.created_at) - new Date(prev.created_at);
    if (gapMs < TWELVE_HOURS_MS) {
      wasted.push({
        previous_pulse_at: prev.created_at,
        new_pulse_at: curr.created_at,
        gap_hours: Math.round((gapMs / (60 * 60 * 1000)) * 10) / 10,
      });
    }
  }
  return wasted;
}

// ---------------------------------------------------------------------------
// Scorecard
// ---------------------------------------------------------------------------

function computeScorecard(pulseGenerations, downstreamUsage, freshnessViolations, regenerationWasted, relatedSnapshots) {
  const toneDistribution = {};
  const trajectoryDistribution = {};
  const likelyNeedDistribution = {};
  const confidenceDistribution = {};

  for (const p of pulseGenerations) {
    const out = p.output;
    if (out.tone_dominant) toneDistribution[out.tone_dominant] = (toneDistribution[out.tone_dominant] ?? 0) + 1;
    if (out.direction) trajectoryDistribution[out.direction] = (trajectoryDistribution[out.direction] ?? 0) + 1;
    if (out.likely_need) likelyNeedDistribution[out.likely_need] = (likelyNeedDistribution[out.likely_need] ?? 0) + 1;
    if (out.confidence) confidenceDistribution[out.confidence] = (confidenceDistribution[out.confidence] ?? 0) + 1;
  }

  const tokenCosts = pulseGenerations
    .map((p) => p.tokens_used)
    .filter((t) => t != null);
  const avgCost = tokenCosts.length > 0
    ? Math.round(tokenCosts.reduce((a, b) => a + b, 0) / tokenCosts.length)
    : null;

  const readAges = downstreamUsage
    .map((u) => u.pulse_age_hours)
    .filter((a) => a != null);
  const avgFreshness = readAges.length > 0
    ? Math.round((readAges.reduce((a, b) => a + b, 0) / readAges.length) * 10) / 10
    : null;

  const downstreamReadCount = {};
  for (const u of downstreamUsage) {
    downstreamReadCount[u.consumer] = (downstreamReadCount[u.consumer] ?? 0) + 1;
  }

  const momentumStates = relatedSnapshots
    .filter((s) => s.snapshot_type === "momentum_state_updated_v2");

  let coherentCount = 0;
  let totalCoherence = 0;
  const postureToNeed = {
    push_lightly: "push",
    simplify: "simplify",
    hold: "silence",
    support: "support",
    reopen_door: "repair",
    reduce_load: "simplify",
    repair: "repair",
  };

  for (const p of pulseGenerations) {
    const pulseTime = new Date(p.generated_at).getTime();
    const closestMomentum = momentumStates.reduce((best, s) => {
      const diff = pulseTime - new Date(s.created_at).getTime();
      if (diff < 0) return best;
      return (!best || diff < best.diff) ? { event: s, diff } : best;
    }, null);

    if (closestMomentum && p.output.likely_need) {
      totalCoherence++;
      const posture = closestMomentum.event.payload?.posture;
      const expectedNeed = postureToNeed[posture] ?? null;
      if (expectedNeed === p.output.likely_need) coherentCount++;
    }
  }

  const coherenceWithMomentum = totalCoherence > 0
    ? Math.round((coherentCount / totalCoherence) * 100)
    : null;

  const lowSignalCount = pulseGenerations.filter(
    (p) => p.output.confidence === "low",
  ).length;

  const alerts = [];

  if (pulseGenerations.length > 0 && downstreamUsage.length === 0) {
    alerts.push("pulse_never_read");
  }
  if (freshnessViolations.length > 0) {
    alerts.push(`pulse_stale_at_decision: ${freshnessViolations.length} violation(s)`);
  }
  if (regenerationWasted.length > 0) {
    alerts.push(`wasted_regeneration: ${regenerationWasted.length} case(s)`);
  }
  if (lowSignalCount > 0 && lowSignalCount === pulseGenerations.length) {
    alerts.push("confidence_always_low");
  }

  return {
    generation_count: pulseGenerations.length,
    average_generation_cost_tokens: avgCost,
    average_freshness_at_read_hours: avgFreshness,
    tone_distribution: toneDistribution,
    trajectory_distribution: trajectoryDistribution,
    likely_need_distribution: likelyNeedDistribution,
    confidence_distribution: confidenceDistribution,
    downstream_read_count: downstreamReadCount,
    coherence_with_momentum: coherenceWithMomentum,
    low_signal_caution_applied: lowSignalCount,
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
      "  node ./scripts/export_conversation_pulse_v2_audit_bundle.mjs --user-id <uuid> --hours 168",
      "  node ./scripts/export_conversation_pulse_v2_audit_bundle.mjs --user-id <uuid> --from <ISO> --to <ISO>",
      "",
      "Options:",
      "  --user-id <uuid>     Required. User UUID",
      "  --hours <N>          Window in hours (default: 168 = 7 days)",
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
  console.error(`Loading pulse V2 audit for user=${args.userId.slice(0, 8)}… window=${args.hours}h scope=${effectiveScope ?? "all"}`);

  const [messages, pulseSnapshots, relatedSnapshots, eventMemories] = await Promise.all([
    loadMessages(baseUrl, connection.serviceKey, args.userId, fromIso, toIso, effectiveScope),
    loadPulseSnapshots(baseUrl, connection.serviceKey, args.userId, fromIso, toIso),
    loadRelatedSnapshots(baseUrl, connection.serviceKey, args.userId, fromIso, toIso),
    loadEventMemories(baseUrl, connection.serviceKey, args.userId, fromIso, toIso),
  ]);

  const normalizedEventMemories = eventMemories.map(normalizeEventMemory);

  const pulseGenerations = buildPulseGenerations(pulseSnapshots, relatedSnapshots);
  const sourceMessages = buildSourceMessages(pulseSnapshots, messages);
  const downstreamUsage = buildDownstreamUsage(pulseSnapshots, relatedSnapshots);
  const freshnessViolations = buildFreshnessViolations(downstreamUsage);
  const regenerationWasted = buildRegenerationWasted(pulseSnapshots);

  const unassignedEvents = relatedSnapshots.filter((s) =>
    !s.snapshot_type.startsWith("conversation_pulse_generated") &&
    !s.snapshot_type.startsWith("daily_bilan_") &&
    !s.snapshot_type.startsWith("weekly_bilan_") &&
    !s.snapshot_type.startsWith("morning_nudge_") &&
    !s.snapshot_type.startsWith("proactive_window_") &&
    !s.snapshot_type.startsWith("momentum_state_"),
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
      pulses_generated: pulseGenerations.length,
      downstream_reads_total: downstreamUsage.length,
      freshness_violations: freshnessViolations.length,
      wasted_regenerations: regenerationWasted.length,
      event_memories_total: normalizedEventMemories.length,
    },
    messages,
    pulse_generations: pulseGenerations,
    source_messages: sourceMessages,
    downstream_usage: downstreamUsage,
    freshness_violations: freshnessViolations,
    regeneration_wasted: regenerationWasted,
    event_memories: normalizedEventMemories,
    unassigned_events: unassignedEvents,
  };

  const scorecard = computeScorecard(
    pulseGenerations, downstreamUsage, freshnessViolations,
    regenerationWasted, relatedSnapshots,
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
    `pulse_v2_audit_${args.userId.slice(0, 8)}_${scopeLabel}_${compactTs(fromIso)}_${compactTs(toIso)}.json`,
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
      pulses: pulseGenerations.length,
      downstream_reads: downstreamUsage.length,
      freshness_violations: freshnessViolations.length,
      wasted_regenerations: regenerationWasted.length,
      event_memories: normalizedEventMemories.length,
    },
    scorecard_summary: {
      tone_distribution: scorecard.tone_distribution,
      likely_need_distribution: scorecard.likely_need_distribution,
      coherence_with_momentum: scorecard.coherence_with_momentum,
      alerts: scorecard.alerts,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
