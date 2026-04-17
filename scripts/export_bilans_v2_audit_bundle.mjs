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

const BILAN_EVENT_TYPES = [
  "daily_bilan_decided_v2",
  "daily_bilan_completed_v2",
  "weekly_bilan_decided_v2",
  "weekly_bilan_completed_v2",
  "momentum_state_updated_v2",
  "active_load_recomputed_v2",
  "conversation_pulse_generated_v2",
];

async function loadSnapshots(baseUrl, serviceKey, userId, fromIso, toIso) {
  const typeFilter = BILAN_EVENT_TYPES.map((t) => `"${t}"`).join(",");
  return supabaseGet(baseUrl, serviceKey,
    `system_runtime_snapshots?user_id=eq.${userId}&snapshot_type=in.(${typeFilter})&created_at=gte.${fromIso}&created_at=lte.${toIso}&select=id,snapshot_type,payload,created_at&order=created_at.asc`);
}

async function loadPulseSnapshots(baseUrl, serviceKey, userId, fromIso, toIso) {
  return supabaseGet(baseUrl, serviceKey,
    `system_runtime_snapshots?user_id=eq.${userId}&snapshot_type=eq.conversation_pulse&created_at=gte.${fromIso}&created_at=lte.${toIso}&select=id,payload,created_at&order=created_at.asc`);
}

async function loadScheduledCheckins(baseUrl, serviceKey, userId, fromIso, toIso) {
  return supabaseGet(baseUrl, serviceKey,
    `scheduled_checkins?user_id=eq.${userId}&scheduled_for=gte.${fromIso}&scheduled_for=lte.${toIso}&select=*&order=scheduled_for.asc`);
}

async function loadWeeklyRecaps(baseUrl, serviceKey, userId, fromIso, toIso) {
  return supabaseGet(baseUrl, serviceKey,
    `weekly_bilan_recaps?user_id=eq.${userId}&created_at=gte.${fromIso}&created_at=lte.${toIso}&select=*&order=created_at.asc`);
}

async function loadActiveCycle(baseUrl, serviceKey, userId) {
  const rows = await supabaseGet(baseUrl, serviceKey,
    `user_cycles?user_id=eq.${userId}&status=eq.active&select=*&order=created_at.desc&limit=1`);
  return rows[0] ?? null;
}

async function loadActivePlan(baseUrl, serviceKey, cycleId) {
  if (!cycleId) return null;
  const rows = await supabaseGet(baseUrl, serviceKey,
    `user_plans_v2?cycle_id=eq.${cycleId}&status=eq.active&select=*&order=version.desc&limit=1`);
  return rows[0] ?? null;
}

async function loadPlanItems(baseUrl, serviceKey, planId) {
  if (!planId) return [];
  return supabaseGet(baseUrl, serviceKey,
    `user_plan_items?plan_id=eq.${planId}&select=*&order=activation_order.asc.nullslast`);
}

async function loadEntries(baseUrl, serviceKey, planId, fromIso, toIso) {
  if (!planId) return [];
  return supabaseGet(baseUrl, serviceKey,
    `user_plan_item_entries?plan_id=eq.${planId}&created_at=gte.${fromIso}&created_at=lte.${toIso}&select=*&order=effective_at.asc`);
}

// ---------------------------------------------------------------------------
// Trace builders
// ---------------------------------------------------------------------------

function buildDailyDecisions(snapshots, checkins) {
  const decided = snapshots
    .filter((s) => s.snapshot_type === "daily_bilan_decided_v2")
    .map((s) => {
      const p = s.payload ?? {};
      const metadata = p.metadata ?? {};
      const output = metadata.output ?? metadata.daily_bilan_output ?? {};
      const momentum = metadata.momentum_state_v2 ?? null;
      return {
        at: s.created_at,
        type: "decided",
        mode: output.mode ?? null,
        items_targeted: output.target_items ?? metadata.target_item_ids ?? [],
        tone: output.prompt_shape?.tone ?? null,
        momentum_state: momentum?.current_state ?? null,
        metadata,
      };
    });

  const completed = snapshots
    .filter((s) => s.snapshot_type === "daily_bilan_completed_v2")
    .map((s) => {
      const p = s.payload ?? {};
      return {
        at: s.created_at,
        type: "completed",
        entries_created: p.entries_created ?? 0,
        momentum_update_triggered: p.momentum_update_triggered ?? false,
        items_affected: p.items_affected ?? [],
        metadata: p.metadata ?? {},
      };
    });

  const checkinDecisions = checkins.map((c) => ({
    at: c.scheduled_for,
    checkin_id: c.id,
    status: c.status,
    event_context: c.event_context,
    message_mode: c.message_mode ?? "static",
    processed_at: c.processed_at ?? null,
  }));

  return { decided, completed, checkins: checkinDecisions };
}

function buildDailyOutcomes(snapshots, entries, itemsById) {
  const completed = snapshots.filter((s) => s.snapshot_type === "daily_bilan_completed_v2");
  return completed.map((s) => {
    const p = s.payload ?? {};
    const affectedIds = new Set(p.items_affected ?? []);
    const relatedEntries = entries.filter(
      (e) => affectedIds.has(e.plan_item_id) &&
        Math.abs(new Date(e.created_at) - new Date(s.created_at)) < 3600 * 1000,
    );
    return {
      at: s.created_at,
      entries_created: p.entries_created ?? relatedEntries.length,
      momentum_update_triggered: p.momentum_update_triggered ?? false,
      entries: relatedEntries.map((e) => ({
        plan_item_id: e.plan_item_id,
        item_title: itemsById.get(e.plan_item_id)?.title ?? "unknown",
        entry_kind: e.entry_kind,
        outcome: e.outcome,
      })),
    };
  });
}

function buildWeeklyDecisions(snapshots) {
  return snapshots
    .filter((s) => s.snapshot_type === "weekly_bilan_decided_v2")
    .map((s) => {
      const p = s.payload ?? {};
      const metadata = p.metadata ?? {};
      const output = metadata.output ?? {};
      return {
        at: s.created_at,
        decision: p.decision ?? output.decision ?? null,
        adjustment_count: p.adjustment_count ?? 0,
        load_adjustments: output.load_adjustments ?? p.load_adjustments ?? p.adjustments ?? [],
        coaching_note: output.coaching_note ?? p.coaching_note ?? null,
        suggested_posture_next_week:
          p.suggested_posture_next_week ?? output.suggested_posture_next_week ?? null,
        reasoning: p.reasoning ?? output.reasoning ?? null,
        metadata,
      };
    });
}

function buildWeeklyInputsSnapshot(weeklyRecaps, pulseSnapshots) {
  return weeklyRecaps.map((r) => {
    const closestPulse = pulseSnapshots.reduce((best, p) => {
      const diff = Math.abs(new Date(p.created_at) - new Date(r.created_at));
      return (!best || diff < best.diff) ? { snapshot: p, diff } : best;
    }, null);

    return {
      at: r.created_at,
      week_start: r.week_start,
      execution: r.execution,
      etoile_polaire: r.etoile_polaire,
      action_load: r.action_load,
      decisions_next_week: r.decisions_next_week,
      coach_note: r.coach_note,
      raw_summary: r.raw_summary,
      pulse_at_decision: closestPulse?.snapshot?.payload ?? null,
    };
  });
}

function buildWeeklyMaterializations(snapshots) {
  return snapshots
    .filter((s) => s.snapshot_type === "weekly_bilan_completed_v2")
    .map((s) => {
      const p = s.payload ?? {};
      const metadata = p.metadata ?? {};
      const applied = metadata.applied ?? p.adjustments_applied ?? p.materializations ?? [];
      const output = metadata.output ?? {};
      return {
        at: s.created_at,
        adjustments_applied: applied,
        items_changed: applied.map((entry) => entry?.target_item_id).filter(Boolean),
        decision: metadata.decision ?? output.decision ?? null,
        errors: metadata.errors ?? [],
        metadata,
      };
    });
}

function buildCorrelation(snapshots) {
  const stateEvents = snapshots.filter((s) => s.snapshot_type === "momentum_state_updated_v2");
  const loadEvents = snapshots.filter((s) => s.snapshot_type === "active_load_recomputed_v2");
  const dailyDecided = snapshots.filter((s) => s.snapshot_type === "daily_bilan_decided_v2");
  const weeklyDecided = snapshots.filter((s) => s.snapshot_type === "weekly_bilan_decided_v2");

  function findClosestState(events, refTime) {
    return events.reduce((best, e) => {
      const diff = new Date(refTime) - new Date(e.created_at);
      if (diff < 0) return best;
      return (!best || diff < best.diff) ? { event: e, diff } : best;
    }, null)?.event ?? null;
  }

  const dailyCorrelation = dailyDecided.map((d) => {
    const closestState = findClosestState(stateEvents, d.created_at);
    return {
      daily_at: d.created_at,
      daily_mode: d.payload?.metadata?.output?.mode ??
        d.payload?.metadata?.daily_bilan_output?.mode ?? null,
      momentum_state: closestState?.payload?.current_state ?? null,
      momentum_posture: closestState?.payload?.posture ?? null,
    };
  });

  const weeklyCorrelation = weeklyDecided.map((w) => {
    const closestLoad = findClosestState(loadEvents, w.created_at);
    return {
      weekly_at: w.created_at,
      weekly_decision: w.payload?.decision ?? null,
      active_load_score: closestLoad?.payload?.current_load_score ?? null,
      needs_reduce: closestLoad?.payload?.needs_reduce ?? null,
    };
  });

  return { daily_vs_momentum: dailyCorrelation, weekly_vs_load: weeklyCorrelation };
}

// ---------------------------------------------------------------------------
// Scorecard
// ---------------------------------------------------------------------------

function computeScorecard(dailyDecisions, dailyOutcomes, weeklyDecisions, weeklyMaterializations, correlation, windowDays) {
  const modeDistribution = {};
  for (const d of dailyDecisions.decided) {
    if (!d.mode) continue;
    modeDistribution[d.mode] = (modeDistribution[d.mode] ?? 0) + 1;
  }

  const itemCounts = dailyDecisions.decided.map((d) => (d.items_targeted ?? []).length);
  const dailyItemsTargetedAvg = itemCounts.length > 0
    ? Math.round((itemCounts.reduce((a, b) => a + b, 0) / itemCounts.length) * 10) / 10
    : null;

  const dailyCaptureRate = dailyOutcomes.length > 0
    ? Math.round((dailyOutcomes.filter((o) => o.entries_created > 0).length / dailyOutcomes.length) * 100)
    : null;

  const expectedDailys = Math.max(1, Math.round(windowDays));
  const dailySkipRate = Math.round(
    Math.max(0, 1 - dailyDecisions.decided.length / expectedDailys) * 100,
  );

  const weeklyDecisionDistribution = {};
  for (const w of weeklyDecisions) {
    if (!w.decision) continue;
    weeklyDecisionDistribution[w.decision] = (weeklyDecisionDistribution[w.decision] ?? 0) + 1;
  }

  const adjCounts = weeklyDecisions.map((w) => w.adjustment_count);
  const weeklyAdjustmentCountAvg = adjCounts.length > 0
    ? Math.round((adjCounts.reduce((a, b) => a + b, 0) / adjCounts.length) * 10) / 10
    : null;

  const materialisedCount = weeklyMaterializations.filter(
    (m) => (m.adjustments_applied ?? []).length > 0,
  ).length;
  const weeklyMaterialisationRate = weeklyDecisions.length > 0
    ? Math.round((materialisedCount / weeklyDecisions.length) * 100)
    : null;

  let coherentCount = 0;
  let totalWeeklyCorr = 0;
  for (const c of correlation.weekly_vs_load) {
    totalWeeklyCorr++;
    const decision = c.weekly_decision;
    const needsReduce = c.needs_reduce;
    if (decision === "expand" && needsReduce === true) continue;
    if (decision === "reduce" && needsReduce !== true) continue;
    coherentCount++;
  }
  const weeklyCoherenceRate = totalWeeklyCorr > 0
    ? Math.round((coherentCount / totalWeeklyCorr) * 100)
    : null;

  const alerts = [];

  for (const c of correlation.weekly_vs_load) {
    if (c.weekly_decision === "expand" && c.needs_reduce === true) {
      alerts.push(`expand_with_needs_reduce at ${c.weekly_at}`);
    }
  }

  for (const w of weeklyDecisions) {
    if (w.adjustment_count > 4) {
      alerts.push(`weekly_5plus_adjustments: ${w.adjustment_count} at ${w.at}`);
    }
  }

  if (dailyDecisions.decided.length === 0 && windowDays >= 2) {
    alerts.push("no_daily_bilans_in_window");
  }

  if (weeklyDecisions.length === 0 && windowDays >= 7) {
    alerts.push("no_weekly_bilans_in_window");
  }

  return {
    daily_mode_distribution: modeDistribution,
    daily_items_targeted_avg: dailyItemsTargetedAvg,
    daily_capture_rate: dailyCaptureRate,
    daily_skip_rate: dailySkipRate,
    daily_bilans_count: dailyDecisions.decided.length,
    weekly_decision_distribution: weeklyDecisionDistribution,
    weekly_adjustment_count_avg: weeklyAdjustmentCountAvg,
    weekly_materialisation_rate: weeklyMaterialisationRate,
    weekly_coherence_rate: weeklyCoherenceRate,
    weekly_bilans_count: weeklyDecisions.length,
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
      "  node ./scripts/export_bilans_v2_audit_bundle.mjs --user-id <uuid> --hours 168",
      "  node ./scripts/export_bilans_v2_audit_bundle.mjs --user-id <uuid> --from <ISO> --to <ISO>",
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
  const windowDays = (new Date(toIso) - new Date(fromIso)) / (1000 * 60 * 60 * 24);

  console.error(`Connecting to ${baseUrl} (${connection.source})…`);
  console.error(`Loading bilans V2 audit for user=${args.userId.slice(0, 8)}… window=${args.hours}h scope=${effectiveScope ?? "all"}`);

  const cycle = await loadActiveCycle(baseUrl, connection.serviceKey, args.userId);
  const plan = cycle
    ? await loadActivePlan(baseUrl, connection.serviceKey, cycle.id)
    : null;

  const [messages, snapshots, pulseSnapshots, checkins, weeklyRecaps, planItems, windowEntries] =
    await Promise.all([
      loadMessages(baseUrl, connection.serviceKey, args.userId, fromIso, toIso, effectiveScope),
      loadSnapshots(baseUrl, connection.serviceKey, args.userId, fromIso, toIso),
      loadPulseSnapshots(baseUrl, connection.serviceKey, args.userId, fromIso, toIso),
      loadScheduledCheckins(baseUrl, connection.serviceKey, args.userId, fromIso, toIso),
      loadWeeklyRecaps(baseUrl, connection.serviceKey, args.userId, fromIso, toIso),
      loadPlanItems(baseUrl, connection.serviceKey, plan?.id),
      loadEntries(baseUrl, connection.serviceKey, plan?.id, fromIso, toIso),
    ]);

  const itemsById = new Map(planItems.map((i) => [i.id, i]));

  const dailyDecisions = buildDailyDecisions(snapshots, checkins);
  const dailyOutcomes = buildDailyOutcomes(snapshots, windowEntries, itemsById);
  const weeklyDecisions = buildWeeklyDecisions(snapshots);
  const weeklyInputsSnapshot = buildWeeklyInputsSnapshot(weeklyRecaps, pulseSnapshots);
  const weeklyMaterializations = buildWeeklyMaterializations(snapshots);
  const correlation = buildCorrelation(snapshots);

  const unassignedEvents = snapshots.filter((s) =>
    !s.snapshot_type.startsWith("daily_bilan_") &&
    !s.snapshot_type.startsWith("weekly_bilan_") &&
    !s.snapshot_type.startsWith("momentum_state_updated") &&
    !s.snapshot_type.startsWith("active_load_recomputed") &&
    !s.snapshot_type.startsWith("conversation_pulse_generated"),
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
      daily_bilans_decided: dailyDecisions.decided.length,
      daily_bilans_completed: dailyOutcomes.length,
      weekly_bilans_count: weeklyDecisions.length,
      weekly_materializations_count: weeklyMaterializations.length,
      entries_total: windowEntries.length,
      checkins_total: checkins.length,
    },
    context: {
      cycle_id: cycle?.id ?? null,
      cycle_status: cycle?.status ?? null,
      plan_id: plan?.id ?? null,
      plan_status: plan?.status ?? null,
    },
    messages,
    daily_decisions: dailyDecisions,
    daily_outcomes: dailyOutcomes,
    weekly_decisions: weeklyDecisions,
    weekly_inputs_snapshot: weeklyInputsSnapshot,
    weekly_materializations: weeklyMaterializations,
    correlation,
    unassigned_events: unassignedEvents,
  };

  const scorecard = computeScorecard(
    dailyDecisions, dailyOutcomes, weeklyDecisions,
    weeklyMaterializations, correlation, windowDays,
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
    `bilans_v2_audit_${args.userId.slice(0, 8)}_${scopeLabel}_${compactTs(fromIso)}_${compactTs(toIso)}.json`,
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
      daily_decided: dailyDecisions.decided.length,
      daily_completed: dailyOutcomes.length,
      weekly_decided: weeklyDecisions.length,
      weekly_materialized: weeklyMaterializations.length,
      entries: windowEntries.length,
      checkins: checkins.length,
    },
    scorecard_summary: {
      daily_mode_distribution: scorecard.daily_mode_distribution,
      weekly_decision_distribution: scorecard.weekly_decision_distribution,
      alerts: scorecard.alerts,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
