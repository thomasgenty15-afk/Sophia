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
    planId: null,
    hours: 336,
    outFile: null,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--user-id") out.userId = String(argv[++i] ?? "").trim() || null;
    else if (a === "--plan-id") out.planId = String(argv[++i] ?? "").trim() || null;
    else if (a === "--hours") out.hours = Number(argv[++i]) || 336;
    else if (a === "--out") out.outFile = String(argv[++i] ?? "").trim() || null;
    else if (a === "--help" || a === "-h") out.help = true;
  }

  return out;
}

// ---------------------------------------------------------------------------
// Supabase connection (same pattern as plan-gen audit)
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

async function loadPlan(baseUrl, serviceKey, planId) {
  const rows = await supabaseGet(baseUrl, serviceKey,
    `user_plans_v2?id=eq.${planId}&select=*`);
  if (!rows.length) throw new Error(`Plan ${planId} not found`);
  return rows[0];
}

async function loadCycle(baseUrl, serviceKey, cycleId, userId) {
  const rows = await supabaseGet(baseUrl, serviceKey,
    `user_cycles?id=eq.${cycleId}&user_id=eq.${userId}&select=*`);
  if (!rows.length) throw new Error(`Cycle ${cycleId} not found for user ${userId}`);
  return rows[0];
}

async function loadTransformation(baseUrl, serviceKey, transformationId) {
  const rows = await supabaseGet(baseUrl, serviceKey,
    `user_transformations?id=eq.${transformationId}&select=*`);
  if (!rows.length) throw new Error(`Transformation ${transformationId} not found`);
  return rows[0];
}

async function loadPlanItems(baseUrl, serviceKey, planId) {
  return supabaseGet(baseUrl, serviceKey,
    `user_plan_items?plan_id=eq.${planId}&select=*&order=activation_order.asc.nullslast`);
}

async function loadEntries(baseUrl, serviceKey, planId, fromIso) {
  return supabaseGet(baseUrl, serviceKey,
    `user_plan_item_entries?plan_id=eq.${planId}&created_at=gte.${fromIso}&select=*&order=effective_at.asc`);
}

async function loadAllEntries(baseUrl, serviceKey, planId) {
  return supabaseGet(baseUrl, serviceKey,
    `user_plan_item_entries?plan_id=eq.${planId}&select=*&order=effective_at.asc`);
}

async function loadMetrics(baseUrl, serviceKey, cycleId) {
  return supabaseGet(baseUrl, serviceKey,
    `user_metrics?cycle_id=eq.${cycleId}&select=*&order=scope.asc,kind.asc`);
}

const EXEC_EVENT_TYPES = [
  "plan_activated_v2",
  "transformation_activated_v2",
  "transformation_completed_v2",
  "weekly_bilan_completed_v2",
  "daily_bilan_completed_v2",
  "active_load_recomputed_v2",
  "momentum_state_updated_v2",
];

async function loadEvents(baseUrl, serviceKey, userId, cycleId, fromIso) {
  const typeFilter = EXEC_EVENT_TYPES.map((t) => `"${t}"`).join(",");
  return supabaseGet(baseUrl, serviceKey,
    `system_runtime_snapshots?user_id=eq.${userId}&cycle_id=eq.${cycleId}&snapshot_type=in.(${typeFilter})&created_at=gte.${fromIso}&select=id,snapshot_type,payload,created_at&order=created_at.asc`);
}

// ---------------------------------------------------------------------------
// Trace builders
// ---------------------------------------------------------------------------

function buildEntriesTimeline(entries, itemsById) {
  return entries.map((e) => ({
    id: e.id,
    plan_item_id: e.plan_item_id,
    item_title: itemsById.get(e.plan_item_id)?.title ?? "unknown",
    entry_kind: e.entry_kind,
    outcome: e.outcome,
    difficulty_level: e.difficulty_level,
    blocker_hint: e.blocker_hint,
    value_numeric: e.value_numeric,
    effective_at: e.effective_at,
    created_at: e.created_at,
  }));
}

function buildStatusTransitions(planItems, allEntries) {
  const transitions = [];

  for (const item of planItems) {
    if (item.activated_at && item.activation_condition != null) {
      transitions.push({
        item_id: item.id,
        item_title: item.title,
        from_status: "pending",
        to_status: "active",
        at: item.activated_at,
        trigger: "activation_condition_met",
      });
    }

    if (item.completed_at) {
      transitions.push({
        item_id: item.id,
        item_title: item.title,
        from_status: "active",
        to_status: "completed",
        at: item.completed_at,
        trigger: "completion",
      });
    }

    if (item.status === "in_maintenance" && item.kind === "habit") {
      transitions.push({
        item_id: item.id,
        item_title: item.title,
        from_status: "active",
        to_status: "in_maintenance",
        at: item.updated_at,
        trigger: "habit_anchoring_3_5",
      });
    }

    if (item.status === "stalled") {
      transitions.push({
        item_id: item.id,
        item_title: item.title,
        from_status: "active",
        to_status: "stalled",
        at: item.updated_at,
        trigger: "no_traction",
      });
    }

    if (item.status === "deactivated") {
      transitions.push({
        item_id: item.id,
        item_title: item.title,
        from_status: "active",
        to_status: "deactivated",
        at: item.updated_at,
        trigger: "weekly_or_coaching",
      });
    }
  }

  transitions.sort((a, b) => new Date(a.at) - new Date(b.at));
  return transitions;
}

function buildUnlockEvents(planItems) {
  const itemsById = new Map(planItems.map((i) => [i.id, i]));
  const events = [];

  for (const item of planItems) {
    if (!item.activation_condition || !item.activated_at) continue;
    const cond = item.activation_condition;
    const dependsOn = Array.isArray(cond.depends_on)
      ? cond.depends_on
      : cond.depends_on ? [cond.depends_on] : [];

    for (const depId of dependsOn) {
      const dep = itemsById.get(depId);
      events.push({
        unlocked_item_id: item.id,
        unlocked_item_title: item.title,
        condition_type: cond.type ?? "unknown",
        depends_on_item_id: depId,
        depends_on_item_title: dep?.title ?? "unknown",
        at: item.activated_at,
      });
    }
  }

  events.sort((a, b) => new Date(a.at) - new Date(b.at));
  return events;
}

const ZOMBIE_THRESHOLD_DAYS = 7;

function detectZombies(planItems, entriesByItem, now) {
  const zombies = [];

  for (const item of planItems) {
    if (item.status !== "active") continue;

    const itemEntries = entriesByItem.get(item.id) ?? [];
    const lastEntry = itemEntries.length > 0
      ? itemEntries[itemEntries.length - 1]
      : null;
    const lastEntryAt = lastEntry?.created_at ?? null;

    const daysSince = lastEntryAt
      ? daysBetween(lastEntryAt, now)
      : (item.activated_at ? daysBetween(item.activated_at, now) : null);

    if (daysSince != null && daysSince > ZOMBIE_THRESHOLD_DAYS) {
      zombies.push({
        item_id: item.id,
        item_title: item.title,
        dimension: item.dimension,
        kind: item.kind,
        status: item.status,
        last_entry_at: lastEntryAt,
        days_since_last_entry: Math.round(daysSince * 10) / 10,
      });
    }
  }

  return zombies;
}

function buildLoadTimeline(planItems) {
  const snapshot = {
    missions_active: 0,
    habits_building: 0,
    support_recommended_now: 0,
    total_active: 0,
  };

  for (const item of planItems) {
    if (item.status === "active" || item.status === "in_maintenance") {
      if (item.dimension === "missions" && item.status === "active") snapshot.missions_active++;
      if (item.dimension === "habits" && item.current_habit_state === "active_building") snapshot.habits_building++;
      if (item.dimension === "support" && item.support_mode === "recommended_now" && item.status === "active") snapshot.support_recommended_now++;
    }
  }

  snapshot.total_active = snapshot.missions_active + snapshot.habits_building + snapshot.support_recommended_now;

  return [{
    at: new Date().toISOString(),
    ...snapshot,
  }];
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
      current_habit_state: item.current_habit_state,
      activation_order: item.activation_order,
      activation_condition: item.activation_condition,
      support_mode: item.support_mode,
      support_function: item.support_function,
      target_reps: item.target_reps,
      current_reps: item.current_reps,
      activated_at: item.activated_at,
      completed_at: item.completed_at,
      last_entry_at: lastEntry?.created_at ?? null,
      entry_count_in_window: windowItemEntries.length,
      recent_entries: recentEntries,
    };
  });
}

// ---------------------------------------------------------------------------
// Scorecard
// ---------------------------------------------------------------------------

function computeScorecard(plan, planItems, windowEntries, allEntries, metrics, zombies, unlockEvents, now, hours) {
  const itemsByStatus = {};
  const itemsByDimension = {};

  for (const item of planItems) {
    itemsByStatus[item.status] = (itemsByStatus[item.status] ?? 0) + 1;

    if (!itemsByDimension[item.dimension]) itemsByDimension[item.dimension] = {};
    itemsByDimension[item.dimension][item.status] =
      (itemsByDimension[item.dimension][item.status] ?? 0) + 1;
  }

  const completedItems = planItems.filter((i) => i.status === "completed" && i.completed_at && i.activated_at);
  const completionRate = planItems.length > 0
    ? completedItems.length / planItems.length
    : 0;

  const avgTimeByKind = {};
  for (const item of completedItems) {
    const days = daysBetween(item.activated_at, item.completed_at);
    if (!avgTimeByKind[item.kind]) avgTimeByKind[item.kind] = [];
    avgTimeByKind[item.kind].push(days);
  }
  const averageTimeToCompleteDays = {};
  for (const [kind, times] of Object.entries(avgTimeByKind)) {
    averageTimeToCompleteDays[kind] = Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 10) / 10;
  }

  const pendingWithCondition = planItems.filter(
    (i) => i.activation_condition != null && i.activation_condition.type !== "immediate",
  );
  const unlocksPotential = pendingWithCondition.length;
  const unlocksTriggered = unlockEvents.length;
  const unlockTriggerRate = unlocksPotential > 0 ? unlocksTriggered / unlocksPotential : null;

  const habits = planItems.filter((i) => i.kind === "habit");
  const habitsInMaintenance = habits.filter((i) => i.status === "in_maintenance").length;
  const habitAnchoringRate = habits.length > 0 ? habitsInMaintenance / habits.length : null;

  const loadCurrent = buildLoadTimeline(planItems)[0] ?? {};

  const loadCapsExceeded =
    loadCurrent.missions_active > 2 ||
    loadCurrent.habits_building > 2 ||
    loadCurrent.support_recommended_now > 2;

  const supportItems = planItems.filter((i) => i.dimension === "support");
  const entriesByItemId = new Map();
  for (const e of allEntries) {
    if (!entriesByItemId.has(e.plan_item_id)) entriesByItemId.set(e.plan_item_id, []);
    entriesByItemId.get(e.plan_item_id).push(e);
  }

  const recNowItems = supportItems.filter((i) => i.support_mode === "recommended_now");
  const alwaysAvItems = supportItems.filter((i) => i.support_mode === "always_available");
  const rescueItems = supportItems.filter((i) => i.support_function === "rescue");

  const supportEffectiveness = {
    recommended_now_used: recNowItems.filter((i) => (entriesByItemId.get(i.id) ?? []).length > 0).length,
    recommended_now_ignored: recNowItems.filter((i) => (entriesByItemId.get(i.id) ?? []).length === 0).length,
    always_available_used: alwaysAvItems.filter((i) => (entriesByItemId.get(i.id) ?? []).length > 0).length,
    rescue_used: rescueItems.filter((i) => (entriesByItemId.get(i.id) ?? []).length > 0).length,
  };

  const entriesWithDifficulty = windowEntries.filter((e) => e.difficulty_level != null).length;
  const entriesWithBlocker = windowEntries.filter((e) => e.blocker_hint != null && e.blocker_hint !== "").length;

  const northStar = metrics.find((m) => m.scope === "cycle" && m.kind === "north_star") ?? null;
  const northStarProgress = northStar ? {
    current: northStar.current_value,
    target: northStar.target_value,
    percent: (northStar.current_value && northStar.target_value)
      ? Math.round((parseFloat(northStar.current_value) / parseFloat(northStar.target_value)) * 100)
      : null,
  } : null;

  const alerts = [];
  if (loadCapsExceeded) alerts.push("load caps exceeded");
  if (zombies.length > 0) alerts.push(`${zombies.length} zombie item(s) detected`);
  if (habitAnchoringRate != null && habitAnchoringRate === 0 && habits.length > 0) {
    const oldestHabitAge = habits
      .filter((h) => h.activated_at)
      .map((h) => daysBetween(h.activated_at, now))
      .sort((a, b) => b - a)[0];
    if (oldestHabitAge > 14) alerts.push("no habits anchored after 14+ days");
  }
  if (unlockTriggerRate != null && unlockTriggerRate === 0 && unlocksPotential > 0) {
    alerts.push("no unlocks triggered despite pending items with conditions");
  }
  if (northStar && northStar.current_value === "0" && hours > 168) {
    alerts.push("north star still at 0 after 7+ days");
  }

  return {
    plan_id: plan.id,
    plan_status: plan.status,
    window_hours: hours,
    items_total: planItems.length,
    items_by_dimension: itemsByDimension,
    items_by_status: itemsByStatus,
    completion_rate: Math.round(completionRate * 100) / 100,
    average_time_to_complete_days: averageTimeToCompleteDays,
    unlock_trigger_rate: unlockTriggerRate != null ? Math.round(unlockTriggerRate * 100) / 100 : null,
    unlocks_triggered: unlocksTriggered,
    unlocks_potential: unlocksPotential,
    zombie_count: zombies.length,
    zombie_items: zombies.map((z) => z.item_id),
    weekly_adjustment_count: 0,
    load_current: loadCurrent,
    load_caps_exceeded: loadCapsExceeded,
    habit_anchoring_rate: habitAnchoringRate != null ? Math.round(habitAnchoringRate * 100) / 100 : null,
    habits_in_maintenance: habitsInMaintenance,
    habits_total: habits.length,
    support_effectiveness: supportEffectiveness,
    entries_total: windowEntries.length,
    entries_with_difficulty: entriesWithDifficulty,
    entries_with_blocker_hint: entriesWithBlocker,
    north_star_progress: northStarProgress,
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
      "  node ./scripts/export_plan_execution_audit_bundle.mjs --user-id <uuid> --plan-id <uuid> [--hours <N>]",
      "",
      "Options:",
      "  --user-id <uuid>     Required. User UUID",
      "  --plan-id <uuid>     Required. Plan UUID",
      "  --hours <N>          Window in hours (default: 336 = 14 days)",
      "  --out <path>         Output JSON path (default: tmp/)",
      "",
      "Environment:",
      "  SUPABASE_URL                  If set, uses remote. Otherwise falls back to local supabase.",
      "  SUPABASE_SERVICE_ROLE_KEY     Required for remote.",
    ].join("\n"));
    return;
  }

  if (!args.userId) { console.error('Missing --user-id "<uuid>"'); process.exit(1); }
  if (!args.planId) { console.error('Missing --plan-id "<uuid>"'); process.exit(1); }

  const connection = getSupabaseConnection(repoRoot);
  if (!connection.serviceKey) {
    throw new Error("Missing service key. Set SUPABASE_SERVICE_ROLE_KEY or use local supabase.");
  }

  const baseUrl = connection.url.replace(/\/+$/, "");
  const now = new Date().toISOString();
  const fromIso = new Date(Date.now() - args.hours * 3600 * 1000).toISOString();

  console.error(`Connecting to ${baseUrl} (${connection.source})…`);
  console.error(`Loading execution audit for user=${args.userId.slice(0, 8)}… plan=${args.planId.slice(0, 8)}… window=${args.hours}h`);

  const plan = await loadPlan(baseUrl, connection.serviceKey, args.planId);

  if (plan.user_id !== args.userId) {
    throw new Error(`Plan ${args.planId} does not belong to user ${args.userId}`);
  }

  const [cycle, transformation, planItems, windowEntries, allEntries, metrics] = await Promise.all([
    loadCycle(baseUrl, connection.serviceKey, plan.cycle_id, args.userId),
    loadTransformation(baseUrl, connection.serviceKey, plan.transformation_id),
    loadPlanItems(baseUrl, connection.serviceKey, args.planId),
    loadEntries(baseUrl, connection.serviceKey, args.planId, fromIso),
    loadAllEntries(baseUrl, connection.serviceKey, args.planId),
    loadMetrics(baseUrl, connection.serviceKey, plan.cycle_id),
  ]);

  const events = await loadEvents(baseUrl, connection.serviceKey, args.userId, plan.cycle_id, fromIso);

  const entriesByItem = new Map();
  for (const e of allEntries) {
    if (!entriesByItem.has(e.plan_item_id)) entriesByItem.set(e.plan_item_id, []);
    entriesByItem.get(e.plan_item_id).push(e);
  }

  const itemsById = new Map(planItems.map((i) => [i.id, i]));
  const zombies = detectZombies(planItems, entriesByItem, now);
  const unlockEvents = buildUnlockEvents(planItems);
  const statusTransitions = buildStatusTransitions(planItems, allEntries);
  const loadTimeline = buildLoadTimeline(planItems);
  const entriesTimeline = buildEntriesTimeline(windowEntries, itemsById);
  const planItemsSnapshot = buildPlanItemsSnapshot(planItems, entriesByItem, windowEntries);

  const northStar = metrics.find((m) => m.scope === "cycle" && m.kind === "north_star") ?? null;
  const progressMarkers = metrics.filter((m) => m.scope === "transformation" && m.kind === "progress_marker");

  const trace = {
    window: { from: fromIso, to: now, hours: args.hours },
    plan: {
      id: plan.id,
      status: plan.status,
      version: plan.version,
      generation_attempts: plan.generation_attempts,
      created_at: plan.created_at,
      activated_at: plan.activated_at ?? null,
    },
    cycle: {
      id: cycle.id,
      status: cycle.status,
      duration_months: cycle.duration_months,
    },
    transformation: {
      id: transformation.id,
      title: transformation.title,
      status: transformation.status,
    },
    plan_items_snapshot: planItemsSnapshot,
    status_transitions: statusTransitions,
    unlock_events: unlockEvents,
    entries_timeline: entriesTimeline,
    weekly_adjustments: [],
    zombie_candidates: zombies,
    load_timeline: loadTimeline,
    metrics_snapshot: {
      north_star: northStar ? {
        title: northStar.title,
        unit: northStar.unit,
        current_value: northStar.current_value,
        target_value: northStar.target_value,
        status: northStar.status,
      } : null,
      progress_markers: progressMarkers.map((m) => ({
        title: m.title,
        unit: m.unit,
        current_value: m.current_value,
        target_value: m.target_value,
        status: m.status,
      })),
    },
    events,
  };

  const scorecard = computeScorecard(
    plan, planItems, windowEntries, allEntries, metrics, zombies, unlockEvents, now, args.hours,
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
      plan_id: args.planId,
      from: fromIso,
      to: now,
    },
    trace,
    scorecard,
    annotations: [],
  };

  const outDir = path.join(repoRoot, "tmp");
  fs.mkdirSync(outDir, { recursive: true });
  const defaultOutFile = path.join(
    outDir,
    `plan_exec_audit_${args.userId.slice(0, 8)}_${args.planId.slice(0, 8)}_${compactTs(now)}.json`,
  );
  const outFile = args.outFile ? path.resolve(repoRoot, args.outFile) : defaultOutFile;
  fs.mkdirSync(path.dirname(outFile), { recursive: true });

  fs.writeFileSync(outFile, JSON.stringify(bundle, null, 2), "utf8");

  console.log(JSON.stringify({
    ok: true,
    out: outFile,
    counts: {
      plan_items: planItems.length,
      entries_window: windowEntries.length,
      entries_total: allEntries.length,
      metrics: metrics.length,
      events: events.length,
      zombies: zombies.length,
      unlocks: unlockEvents.length,
    },
    scorecard_summary: {
      items_total: scorecard.items_total,
      items_by_status: scorecard.items_by_status,
      completion_rate: scorecard.completion_rate,
      zombie_count: scorecard.zombie_count,
      load_caps_exceeded: scorecard.load_caps_exceeded,
      alerts: scorecard.alerts,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
