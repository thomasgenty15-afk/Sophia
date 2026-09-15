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
// Supabase connection (same pattern as plan-exec / plan-gen audit)
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
    return {
      url: envUrl,
      serviceKey: envService || null,
      source: "env",
    };
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

function daysBetween(a, b) {
  return Math.abs(new Date(b) - new Date(a)) / (1000 * 60 * 60 * 24);
}

function parseIsoMs(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return -1;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : -1;
}

function daysSince(refIso, nowIso) {
  const refMs = parseIsoMs(refIso);
  const nowMs = parseIsoMs(nowIso);
  if (refMs < 0 || nowMs < 0 || refMs > nowMs) return null;
  return (nowMs - refMs) / (1000 * 60 * 60 * 24);
}

function overlapsWindow(startIso, endIso, fromIso, toIso) {
  const startMs = parseIsoMs(startIso);
  const fromMs = parseIsoMs(fromIso);
  const toMs = parseIsoMs(toIso);
  if (startMs < 0 || fromMs < 0 || toMs < 0) return false;

  const endMs = parseIsoMs(endIso);
  const effectiveEndMs = endMs >= 0 ? endMs : Number.POSITIVE_INFINITY;
  return startMs <= toMs && effectiveEndMs >= fromMs;
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

const MOMENTUM_V2_EVENT_TYPES = [
  "momentum_state_updated_v2",
  "active_load_recomputed_v2",
  "daily_bilan_decided_v2",
  "daily_bilan_completed_v2",
  "weekly_bilan_decided_v2",
  "weekly_bilan_completed_v2",
  "morning_nudge_generated_v2",
  "proactive_window_decided_v2",
  "repair_mode_entered_v2",
  "repair_mode_exited_v2",
];

async function loadSnapshots(baseUrl, serviceKey, userId, fromIso, toIso) {
  const typeFilter = MOMENTUM_V2_EVENT_TYPES.map((t) => `"${t}"`).join(",");
  return supabaseGet(baseUrl, serviceKey,
    `system_runtime_snapshots?user_id=eq.${userId}&snapshot_type=in.(${typeFilter})&created_at=gte.${fromIso}&created_at=lte.${toIso}&select=id,cycle_id,transformation_id,snapshot_type,payload,created_at&order=created_at.asc`);
}

async function loadCycle(baseUrl, serviceKey, cycleId) {
  if (!cycleId) return null;
  const rows = await supabaseGet(baseUrl, serviceKey,
    `user_cycles?id=eq.${cycleId}&select=*&limit=1`);
  return rows[0] ?? null;
}

async function loadTransformation(baseUrl, serviceKey, transformationId) {
  if (!transformationId) return null;
  const rows = await supabaseGet(baseUrl, serviceKey,
    `user_transformations?id=eq.${transformationId}&select=*&limit=1`);
  return rows[0] ?? null;
}

async function loadCandidatePlans(baseUrl, serviceKey, userId, toIso) {
  return supabaseGet(baseUrl, serviceKey,
    `user_plans_v2?user_id=eq.${userId}&created_at=lte.${toIso}&select=*&order=created_at.asc`);
}

async function loadPlanItems(baseUrl, serviceKey, planId) {
  if (!planId) return [];
  return supabaseGet(baseUrl, serviceKey,
    `user_plan_items?plan_id=eq.${planId}&select=*&order=activation_order.asc.nullslast`);
}

async function loadEntries(baseUrl, serviceKey, planId, fromIso, toIso) {
  if (!planId) return [];
  return supabaseGet(baseUrl, serviceKey,
    `user_plan_item_entries?plan_id=eq.${planId}&effective_at=gte.${fromIso}&effective_at=lte.${toIso}&select=*&order=effective_at.asc&order=created_at.asc`);
}

async function loadEntriesUntil(baseUrl, serviceKey, planId, toIso) {
  if (!planId) return [];
  return supabaseGet(baseUrl, serviceKey,
    `user_plan_item_entries?plan_id=eq.${planId}&effective_at=lte.${toIso}&select=*&order=effective_at.asc&order=created_at.asc`);
}

async function loadWindowEntriesForUser(baseUrl, serviceKey, userId, fromIso, toIso) {
  return supabaseGet(baseUrl, serviceKey,
    `user_plan_item_entries?user_id=eq.${userId}&effective_at=gte.${fromIso}&effective_at=lte.${toIso}&select=id,cycle_id,transformation_id,plan_id,plan_item_id,entry_kind,outcome,difficulty_level,blocker_hint,effective_at,created_at&order=effective_at.asc&order=created_at.asc`);
}

// ---------------------------------------------------------------------------
// Trace builders
// ---------------------------------------------------------------------------

function getPayloadString(payload, ...keys) {
  let current = payload;
  for (const key of keys) {
    if (current == null || typeof current !== "object") return null;
    current = current[key];
  }
  return typeof current === "string" && current.trim() ? current.trim() : null;
}

function getSnapshotPlanId(snapshot) {
  return getPayloadString(snapshot.payload, "plan_id") ??
    getPayloadString(snapshot.payload, "metadata", "plan_id");
}

function resolveAuditContext({ snapshots, windowEntries, candidatePlans, fromIso, toIso }) {
  const planEvidence = new Map();
  const recordPlanEvidence = (planId, source) => {
    if (!planId) return;
    const current = planEvidence.get(planId) ?? {
      plan_id: planId,
      snapshot_hits: 0,
      entry_hits: 0,
      sources: new Set(),
    };
    if (source === "snapshot") current.snapshot_hits++;
    if (source === "entry") current.entry_hits++;
    current.sources.add(source);
    planEvidence.set(planId, current);
  };

  for (const snapshot of snapshots) {
    recordPlanEvidence(getSnapshotPlanId(snapshot), "snapshot");
  }
  for (const entry of windowEntries) {
    recordPlanEvidence(entry.plan_id ?? null, "entry");
  }

  const latestSnapshotWithCycle = [...snapshots].reverse().find((row) => row.cycle_id);
  const latestSnapshotWithTransformation = [...snapshots].reverse().find((row) => row.transformation_id);

  const latestCycleId = latestSnapshotWithCycle?.cycle_id ?? null;
  const latestTransformationId = latestSnapshotWithTransformation?.transformation_id ?? null;

  const overlappingPlans = candidatePlans.filter((plan) =>
    overlapsWindow(plan.activated_at ?? plan.created_at, plan.archived_at ?? plan.completed_at, fromIso, toIso)
  );

  const chooseMostRelevantPlan = (plans) => {
    if (plans.length === 0) return null;

    const ranked = plans
      .map((plan) => {
        const evidence = planEvidence.get(plan.id);
        const score = (evidence?.snapshot_hits ?? 0) * 10 +
          (evidence?.entry_hits ?? 0) * 5 +
          (latestTransformationId && plan.transformation_id === latestTransformationId ? 2 : 0) +
          (latestCycleId && plan.cycle_id === latestCycleId ? 1 : 0);

        return {
          plan,
          score,
          anchorMs: Math.max(parseIsoMs(plan.activated_at), parseIsoMs(plan.created_at)),
        };
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.anchorMs - a.anchorMs;
      });

    return ranked[0]?.plan ?? null;
  };

  const selectedPlan = chooseMostRelevantPlan(overlappingPlans) ??
    chooseMostRelevantPlan(candidatePlans);

  const selectedEvidence = selectedPlan ? planEvidence.get(selectedPlan.id) ?? null : null;
  const resolutionReason = selectedPlan
    ? selectedEvidence?.snapshot_hits
      ? "snapshot_plan_id_within_window"
      : selectedEvidence?.entry_hits
      ? "entries_plan_id_within_window"
      : overlappingPlans.some((plan) => plan.id === selectedPlan.id)
      ? "latest_plan_overlapping_window"
      : "latest_plan_before_window_end"
    : latestTransformationId || latestCycleId
    ? "snapshot_cycle_transformation_only"
    : "no_runtime_context_found";

  return {
    cycleId: selectedPlan?.cycle_id ?? latestCycleId,
    transformationId: selectedPlan?.transformation_id ?? latestTransformationId,
    plan: selectedPlan,
    resolution: {
      reason: resolutionReason,
      candidate_plan_ids: candidatePlans.map((plan) => plan.id),
      overlapping_plan_ids: overlappingPlans.map((plan) => plan.id),
      snapshot_plan_ids: snapshots.map((snapshot) => getSnapshotPlanId(snapshot)).filter(Boolean),
      entry_plan_ids: windowEntries.map((entry) => entry.plan_id).filter(Boolean),
    },
  };
}

function derivePlanItemStatusAtWindowEnd(item, toIso) {
  const toMs = parseIsoMs(toIso);
  const createdMs = parseIsoMs(item.created_at);
  if (toMs < 0 || createdMs < 0 || createdMs > toMs) return null;

  const completedMs = parseIsoMs(item.completed_at);
  if (completedMs > 0 && completedMs <= toMs) {
    return "completed";
  }

  const activatedMs = parseIsoMs(item.activated_at);
  const updatedMs = parseIsoMs(item.updated_at);
  const wasActivated = activatedMs > 0 && activatedMs <= toMs;
  const isImmediate = item.activation_condition == null ||
    item.activation_condition?.type === "immediate";

  if (!wasActivated) {
    return isImmediate ? "active" : "pending";
  }

  if (
    (item.status === "stalled" || item.status === "in_maintenance" || item.status === "deactivated") &&
    updatedMs > toMs
  ) {
    return "active";
  }

  if (item.status === "pending") return "active";
  if (item.status === "completed" && completedMs > toMs) return "active";
  return item.status;
}

function buildAuditPlanItems(planItems, entriesByItem, toIso) {
  return planItems
    .map((item) => {
      const status = derivePlanItemStatusAtWindowEnd(item, toIso);
      if (status === null) return null;

      const itemEntries = entriesByItem.get(item.id) ?? [];
      const lastEntry = itemEntries.length > 0 ? itemEntries[itemEntries.length - 1] : null;

      return {
        ...item,
        status,
        status_current: item.status,
        last_entry_at: lastEntry?.effective_at ?? null,
      };
    })
    .filter(Boolean);
}

function buildStateTimeline(snapshots) {
  return snapshots
    .filter((s) => s.snapshot_type === "momentum_state_updated_v2")
    .map((s) => {
      const p = s.payload ?? {};
      return {
        at: s.created_at,
        snapshot_type: s.snapshot_type,
        state: p.current_state ?? null,
        state_reason: p.state_reason ?? null,
        dimensions: p.dimensions ?? null,
        posture: p.posture ?? null,
        active_load: p.active_load ?? null,
        assessment: p.assessment ?? null,
        blockers: p.blockers ?? null,
      };
    });
}

function buildActiveLoadTimeline(snapshots) {
  return snapshots
    .filter((s) => s.snapshot_type === "active_load_recomputed_v2")
    .map((s) => {
      const p = s.payload ?? {};
      return {
        at: s.created_at,
        current_load_score: p.current_load_score ?? null,
        mission_slots_used: p.mission_slots_used ?? null,
        habit_building_slots_used: p.habit_building_slots_used ?? null,
        support_slots_used: p.support_slots_used ?? null,
        needs_reduce: p.needs_reduce ?? null,
        needs_consolidate: p.needs_consolidate ?? null,
      };
    });
}

function buildPostureTimeline(stateTimeline) {
  return stateTimeline
    .filter((s) => s.posture)
    .map((s) => ({
      at: s.at,
      recommended_posture: s.posture?.recommended_posture ?? null,
      confidence: s.posture?.confidence ?? null,
      state: s.state,
    }));
}

function buildProactiveEvents(snapshots) {
  const proactiveTypes = new Set([
    "daily_bilan_decided_v2",
    "daily_bilan_completed_v2",
    "weekly_bilan_decided_v2",
    "weekly_bilan_completed_v2",
    "morning_nudge_generated_v2",
    "proactive_window_decided_v2",
    "repair_mode_entered_v2",
    "repair_mode_exited_v2",
  ]);

  return snapshots
    .filter((s) => proactiveTypes.has(s.snapshot_type))
    .map((s) => ({
      at: s.created_at,
      type: s.snapshot_type,
      payload: s.payload ?? {},
    }));
}

function buildPlanItemsSnapshot(planItems, entriesByItem, windowEntries) {
  const windowEntriesByItem = new Map();
  for (const e of windowEntries) {
    if (!windowEntriesByItem.has(e.plan_item_id)) windowEntriesByItem.set(e.plan_item_id, []);
    windowEntriesByItem.get(e.plan_item_id).push(e);
  }

  return planItems.map((item) => {
    const allItemEntries = entriesByItem.get(item.id) ?? [];
    const windowItemEntries = windowEntriesByItem.get(item.id) ?? [];
    const lastEntry = allItemEntries.length > 0 ? allItemEntries[allItemEntries.length - 1] : null;
    const recentEntries = windowItemEntries.slice(-5).map((e) => ({
      id: e.id,
      entry_kind: e.entry_kind,
      outcome: e.outcome,
      difficulty_level: e.difficulty_level,
      effective_at: e.effective_at,
    }));

    return {
      id: item.id,
      dimension: item.dimension,
      kind: item.kind,
      title: item.title,
      status: item.status,
      status_current: item.status_current ?? item.status,
      current_habit_state: item.current_habit_state ?? null,
      activation_order: item.activation_order,
      support_mode: item.support_mode ?? null,
      support_function: item.support_function ?? null,
      activated_at: item.activated_at ?? null,
      completed_at: item.completed_at ?? null,
      last_entry_at: lastEntry?.effective_at ?? null,
      entry_count_in_window: windowItemEntries.length,
      recent_entries: recentEntries,
    };
  });
}

function buildEntriesTimeline(entries, itemsById) {
  return entries.map((e) => ({
    id: e.id,
    plan_item_id: e.plan_item_id,
    item_title: itemsById.get(e.plan_item_id)?.title ?? "unknown",
    entry_kind: e.entry_kind,
    outcome: e.outcome,
    difficulty_level: e.difficulty_level,
    blocker_hint: e.blocker_hint,
    effective_at: e.effective_at,
    created_at: e.created_at,
  }));
}

// ---------------------------------------------------------------------------
// Scorecard
// ---------------------------------------------------------------------------

const ZOMBIE_THRESHOLD_DAYS = 7;

function computeScorecard(stateTimeline, activeLoadTimeline, postureTimeline, proactiveEvents, planItems, entriesByItem, windowEntries, now) {
  const stateDistribution = {};
  for (const s of stateTimeline) {
    if (!s.state) continue;
    stateDistribution[s.state] = (stateDistribution[s.state] ?? 0) + 1;
  }
  const currentState = stateTimeline.length > 0
    ? stateTimeline[stateTimeline.length - 1].state
    : null;

  const transitions = [];
  for (let i = 1; i < stateTimeline.length; i++) {
    const prev = stateTimeline[i - 1].state;
    const curr = stateTimeline[i].state;
    if (prev && curr && prev !== curr) {
      transitions.push({ from: prev, to: curr, at: stateTimeline[i].at });
    }
  }
  const transitionMatrix = {};
  for (const t of transitions) {
    const key = `${t.from} → ${t.to}`;
    transitionMatrix[key] = (transitionMatrix[key] ?? 0) + 1;
  }

  const dimensionDistributions = {
    engagement: {},
    execution_traction: {},
    emotional_load: {},
    consent: {},
    plan_fit: {},
    load_balance: {},
  };
  for (const s of stateTimeline) {
    if (!s.dimensions) continue;
    for (const [dim, val] of Object.entries(s.dimensions)) {
      if (dimensionDistributions[dim] && val?.level) {
        dimensionDistributions[dim][val.level] = (dimensionDistributions[dim][val.level] ?? 0) + 1;
      }
    }
  }

  const planFitLevels = dimensionDistributions.plan_fit;
  const planFitTotal = Object.values(planFitLevels).reduce((a, b) => a + b, 0) || 1;
  const planFitAnalysis = {
    good_pct: Math.round(((planFitLevels.good ?? 0) / planFitTotal) * 100),
    uncertain_pct: Math.round(((planFitLevels.uncertain ?? 0) / planFitTotal) * 100),
    poor_pct: Math.round(((planFitLevels.poor ?? 0) / planFitTotal) * 100),
    zombie_count: 0,
    stalled_count: 0,
  };

  for (const item of planItems) {
    if (item.status === "stalled") {
      planFitAnalysis.stalled_count++;
      continue;
    }
    if (item.status !== "active") continue;
    const itemEntries = entriesByItem.get(item.id) ?? [];
    const lastEntry = itemEntries.length > 0 ? itemEntries[itemEntries.length - 1] : null;
    const refDate = lastEntry?.effective_at ?? item.activated_at ?? item.created_at;
    const ageDays = daysSince(refDate, now);
    if (ageDays != null && ageDays > ZOMBIE_THRESHOLD_DAYS) {
      planFitAnalysis.zombie_count++;
    }
  }

  const loadLevels = dimensionDistributions.load_balance;
  const loadTotal = Object.values(loadLevels).reduce((a, b) => a + b, 0) || 1;
  const loadScores = activeLoadTimeline.map((a) => a.current_load_score).filter((s) => s != null);
  const loadBalanceAnalysis = {
    balanced_pct: Math.round(((loadLevels.balanced ?? 0) / loadTotal) * 100),
    slightly_heavy_pct: Math.round(((loadLevels.slightly_heavy ?? 0) / loadTotal) * 100),
    overloaded_pct: Math.round(((loadLevels.overloaded ?? 0) / loadTotal) * 100),
    active_load_min: loadScores.length > 0 ? Math.min(...loadScores) : null,
    active_load_max: loadScores.length > 0 ? Math.max(...loadScores) : null,
    active_load_avg: loadScores.length > 0
      ? Math.round((loadScores.reduce((a, b) => a + b, 0) / loadScores.length) * 10) / 10
      : null,
    needs_reduce_count: activeLoadTimeline.filter((a) => a.needs_reduce === true).length,
  };

  const postureDistribution = {};
  for (const p of postureTimeline) {
    if (!p.recommended_posture) continue;
    postureDistribution[p.recommended_posture] = (postureDistribution[p.recommended_posture] ?? 0) + 1;
  }

  const decisions = {
    daily_bilans: { decided: 0, completed: 0 },
    weekly_bilans: { decided: 0, completed: 0 },
    morning_nudges: { generated: 0 },
    proactive_windows: { decided: 0 },
    repair_mode: { entered: 0, exited: 0 },
  };
  for (const e of proactiveEvents) {
    if (e.type === "daily_bilan_decided_v2") decisions.daily_bilans.decided++;
    else if (e.type === "daily_bilan_completed_v2") decisions.daily_bilans.completed++;
    else if (e.type === "weekly_bilan_decided_v2") decisions.weekly_bilans.decided++;
    else if (e.type === "weekly_bilan_completed_v2") decisions.weekly_bilans.completed++;
    else if (e.type === "morning_nudge_generated_v2") decisions.morning_nudges.generated++;
    else if (e.type === "proactive_window_decided_v2") decisions.proactive_windows.decided++;
    else if (e.type === "repair_mode_entered_v2") decisions.repair_mode.entered++;
    else if (e.type === "repair_mode_exited_v2") decisions.repair_mode.exited++;
  }

  const alerts = [];

  const pairCounts = {};
  for (const t of transitions) {
    const pair = [t.from, t.to].sort().join("↔");
    pairCounts[pair] = (pairCounts[pair] ?? 0) + 1;
  }
  for (const [pair, count] of Object.entries(pairCounts)) {
    if (count > 3) alerts.push(`oscillating_transitions: ${pair} (${count}x)`);
  }

  for (const s of stateTimeline) {
    if (!s.state || !s.dimensions) continue;
    const pf = s.dimensions.plan_fit?.level;
    const lb = s.dimensions.load_balance?.level;
    const posture = s.posture?.recommended_posture;

    if (pf === "poor" && (s.state === "momentum" || s.state === "friction_legere")) {
      alerts.push(`plan_fit_poor_ignored: state=${s.state} at ${s.at}`);
    }
    if (lb === "overloaded" && posture && posture !== "reduce_load" && posture !== "simplify") {
      alerts.push(`load_overloaded_no_reduce: posture=${posture} at ${s.at}`);
    }
    if (s.state === "evitement" && lb === "overloaded") {
      alerts.push(`accused_user_while_plan_overloaded at ${s.at}`);
    }
  }

  for (const a of activeLoadTimeline) {
    if (a.current_load_score != null && a.current_load_score > 7 && a.needs_reduce !== true) {
      alerts.push(`needs_reduce_false_despite_high_load: score=${a.current_load_score} at ${a.at}`);
    }
  }

  if (planFitAnalysis.zombie_count > 0) {
    alerts.push(`${planFitAnalysis.zombie_count} zombie item(s) detected`);
  }

  return {
    states: {
      distribution: stateDistribution,
      current_state: currentState,
      state_count: stateTimeline.length,
    },
    transitions: {
      total: transitions.length,
      matrix: transitionMatrix,
    },
    dimensions: dimensionDistributions,
    plan_fit_analysis: planFitAnalysis,
    load_balance_analysis: loadBalanceAnalysis,
    posture_distribution: postureDistribution,
    decisions,
    entries_total: windowEntries.length,
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
          row?.metadata?.router_decision_v2?.request_id ??
          "",
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
      "  node ./scripts/export_momentum_v2_audit_bundle.mjs --user-id <uuid> --hours 72",
      "  node ./scripts/export_momentum_v2_audit_bundle.mjs --user-id <uuid> --from <ISO> --to <ISO>",
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
  console.error(`Loading momentum V2 audit for user=${args.userId.slice(0, 8)}… window=${args.hours}h scope=${effectiveScope ?? "all"}`);

  const [messages, snapshots, candidatePlans, userWindowEntries] = await Promise.all([
    loadMessages(baseUrl, connection.serviceKey, args.userId, fromIso, toIso, effectiveScope),
    loadSnapshots(baseUrl, connection.serviceKey, args.userId, fromIso, toIso),
    loadCandidatePlans(baseUrl, connection.serviceKey, args.userId, toIso),
    loadWindowEntriesForUser(baseUrl, connection.serviceKey, args.userId, fromIso, toIso),
  ]);

  const resolvedContext = resolveAuditContext({
    snapshots,
    windowEntries: userWindowEntries,
    candidatePlans,
    fromIso,
    toIso,
  });

  const [cycle, transformation, planItemsCurrent, windowEntries, allEntriesUntilWindowEnd] = await Promise.all([
    loadCycle(baseUrl, connection.serviceKey, resolvedContext.cycleId),
    loadTransformation(baseUrl, connection.serviceKey, resolvedContext.transformationId),
    loadPlanItems(baseUrl, connection.serviceKey, resolvedContext.plan?.id),
    loadEntries(baseUrl, connection.serviceKey, resolvedContext.plan?.id, fromIso, toIso),
    loadEntriesUntil(baseUrl, connection.serviceKey, resolvedContext.plan?.id, toIso),
  ]);

  const entriesByItem = new Map();
  for (const e of allEntriesUntilWindowEnd) {
    if (!entriesByItem.has(e.plan_item_id)) entriesByItem.set(e.plan_item_id, []);
    entriesByItem.get(e.plan_item_id).push(e);
  }

  const auditPlanItems = buildAuditPlanItems(planItemsCurrent, entriesByItem, toIso);
  const itemsById = new Map(auditPlanItems.map((i) => [i.id, i]));

  const stateTimeline = buildStateTimeline(snapshots);
  const activeLoadTimeline = buildActiveLoadTimeline(snapshots);
  const postureTimeline = buildPostureTimeline(stateTimeline);
  const proactiveEvents = buildProactiveEvents(snapshots);
  const planItemsSnapshot = buildPlanItemsSnapshot(auditPlanItems, entriesByItem, windowEntries);
  const entriesTimeline = buildEntriesTimeline(windowEntries, itemsById);

  const unassignedEvents = snapshots.filter((s) =>
    !s.snapshot_type.startsWith("momentum_state_updated") &&
    !s.snapshot_type.startsWith("active_load_recomputed") &&
    !s.snapshot_type.startsWith("daily_bilan_") &&
    !s.snapshot_type.startsWith("weekly_bilan_") &&
    !s.snapshot_type.startsWith("morning_nudge_") &&
    !s.snapshot_type.startsWith("proactive_window_") &&
    !s.snapshot_type.startsWith("repair_mode_"),
  ).map((s) => ({
    at: s.created_at,
    type: s.snapshot_type,
    payload: s.payload ?? {},
  }));

  const userMessages = messages.filter((m) => m.role === "user").length;
  const assistantMessages = messages.filter((m) => m.role === "assistant").length;

  const trace = {
    window: {
      from: fromIso,
      to: toIso,
      scope: effectiveScope,
      hours: args.hours,
    },
    summary: {
      messages_total: messages.length,
      user_messages: userMessages,
      assistant_messages: assistantMessages,
      state_events_total: stateTimeline.length,
      active_load_events_total: activeLoadTimeline.length,
      proactive_events_total: proactiveEvents.length,
      plan_items_total: auditPlanItems.length,
      entries_total: windowEntries.length,
    },
    context: {
      cycle_id: cycle?.id ?? null,
      cycle_status: cycle?.status ?? null,
      transformation_id: transformation?.id ?? null,
      transformation_status: transformation?.status ?? null,
      plan_id: resolvedContext.plan?.id ?? null,
      plan_status: resolvedContext.plan?.status ?? null,
      plan_version: resolvedContext.plan?.version ?? null,
      context_resolution: resolvedContext.resolution,
    },
    messages,
    state_timeline: stateTimeline,
    active_load_timeline: activeLoadTimeline,
    posture_timeline: postureTimeline,
    plan_items_snapshot: planItemsSnapshot,
    entries_timeline: entriesTimeline,
    proactive_events: proactiveEvents,
    unassigned_events: unassignedEvents,
  };

  const scorecard = computeScorecard(
    stateTimeline, activeLoadTimeline, postureTimeline,
    proactiveEvents, auditPlanItems, entriesByItem, windowEntries, toIso,
  );

  const bundle = {
    ok: true,
    exported_at: now,
    source: {
      supabase_url: baseUrl,
      connection_type: connection.source,
    },
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
    `momentum_v2_audit_${args.userId.slice(0, 8)}_${scopeLabel}_${compactTs(fromIso)}_${compactTs(toIso)}.json`,
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
    window: {
      from: fromIso,
      to: toIso,
      scope: effectiveScope,
    },
    counts: {
      messages: messages.length,
      state_events: stateTimeline.length,
      active_load_events: activeLoadTimeline.length,
      proactive_events: proactiveEvents.length,
      plan_items: auditPlanItems.length,
      entries_window: windowEntries.length,
      entries_total: allEntriesUntilWindowEnd.length,
    },
    scorecard_summary: {
      states: scorecard.states,
      alerts: scorecard.alerts,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
