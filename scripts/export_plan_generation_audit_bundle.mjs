import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import process from "node:process";

function parseArgs(argv) {
  const out = {
    userId: null,
    cycleId: null,
    outFile: null,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--user-id") out.userId = String(argv[++i] ?? "").trim() || null;
    else if (a === "--cycle-id") out.cycleId = String(argv[++i] ?? "").trim() || null;
    else if (a === "--out") out.outFile = String(argv[++i] ?? "").trim() || null;
    else if (a === "--help" || a === "-h") out.help = true;
  }

  return out;
}

function getLocalSupabaseStatus(repoRoot) {
  const supabaseCli = String(process.env.SOPHIA_SUPABASE_CLI ?? "supabase").trim();
  const raw = execSync(`${supabaseCli} status --output json`, {
    encoding: "utf8",
    cwd: repoRoot,
  });
  return JSON.parse(raw);
}

function isLocalUrl(u) {
  const s = String(u ?? "").toLowerCase();
  return s.includes("127.0.0.1") || s.includes("localhost") || s.includes("0.0.0.0");
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
      localStatus: null,
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
  return { url, serviceKey, source: "local", localStatus: st };
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function compactTsForFilename(iso) {
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

async function loadCycle(baseUrl, serviceKey, userId, cycleId) {
  const rows = await supabaseGet(
    baseUrl,
    serviceKey,
    `user_cycles?id=eq.${cycleId}&user_id=eq.${userId}&select=*`,
  );
  if (!rows.length) throw new Error(`Cycle ${cycleId} not found for user ${userId}`);
  return rows[0];
}

async function loadTransformations(baseUrl, serviceKey, cycleId) {
  return supabaseGet(
    baseUrl,
    serviceKey,
    `user_transformations?cycle_id=eq.${cycleId}&select=*&order=priority_order.asc`,
  );
}

async function loadAspects(baseUrl, serviceKey, cycleId) {
  if (!cycleId) return [];
  return supabaseGet(
    baseUrl,
    serviceKey,
    `user_transformation_aspects?cycle_id=eq.${cycleId}&select=*&order=source_rank.asc.nullslast`,
  );
}

async function loadPlans(baseUrl, serviceKey, cycleId) {
  return supabaseGet(
    baseUrl,
    serviceKey,
    `user_plans_v2?cycle_id=eq.${cycleId}&select=*&order=version.desc`,
  );
}

async function loadPlanItems(baseUrl, serviceKey, planIds) {
  if (!planIds.length) return [];
  const filter = planIds.map((id) => `"${id}"`).join(",");
  return supabaseGet(
    baseUrl,
    serviceKey,
    `user_plan_items?plan_id=in.(${filter})&select=*&order=activation_order.asc.nullslast`,
  );
}

async function loadNorthStarMetrics(baseUrl, serviceKey, cycleId) {
  return supabaseGet(
    baseUrl,
    serviceKey,
    `user_metrics?cycle_id=eq.${cycleId}&scope=eq.cycle&kind=eq.north_star&select=*&order=updated_at.desc`,
  );
}

const PLAN_GEN_EVENT_TYPES = [
  "cycle_created_v2",
  "cycle_structured_v2",
  "cycle_prioritized_v2",
  "cycle_profile_completed_v2",
  "plan_generated_v2",
  "plan_activated_v2",
  "transformation_activated_v2",
];

async function loadEvents(baseUrl, serviceKey, userId, cycleId) {
  const typeFilter = PLAN_GEN_EVENT_TYPES.map((t) => `"${t}"`).join(",");
  return supabaseGet(
    baseUrl,
    serviceKey,
    `system_runtime_snapshots?user_id=eq.${userId}&cycle_id=eq.${cycleId}&snapshot_type=in.(${typeFilter})&select=id,snapshot_type,payload,created_at&order=created_at.asc`,
  );
}

// ---------------------------------------------------------------------------
// Scorecard computation
// ---------------------------------------------------------------------------

function computeScorecard(cycle, transformations, aspects, plans, planItems, northStarMetrics) {
  const activePlan = plans.find((p) => p.status === "active") ?? plans[0] ?? null;
  const cycleLevelAspects = aspects.filter((a) => a.transformation_id == null);

  const itemsByDimension = { support: 0, missions: 0, habits: 0 };
  const kindsDist = {};
  const trackingDist = {};
  let initialActiveLoad = { support_recommended_now: 0, missions_active: 0, habits_active: 0 };
  let hasRescueSupport = false;
  let maxActivationDepth = 0;
  const distributionWarnings = [];

  for (const item of planItems) {
    const dim = item.dimension;
    if (dim in itemsByDimension) itemsByDimension[dim]++;

    const kind = item.kind ?? "unknown";
    kindsDist[kind] = (kindsDist[kind] ?? 0) + 1;

    const tt = item.tracking_type ?? "unknown";
    trackingDist[tt] = (trackingDist[tt] ?? 0) + 1;

    if (item.status === "active") {
      if (dim === "support" && item.support_mode === "recommended_now") {
        initialActiveLoad.support_recommended_now++;
      }
      if (dim === "missions") initialActiveLoad.missions_active++;
      if (dim === "habits") initialActiveLoad.habits_active++;
    }

    if (dim === "support" && item.support_mode === "always_available" && item.support_function === "rescue") {
      hasRescueSupport = true;
    }

    if (item.activation_order != null && item.activation_order > maxActivationDepth) {
      maxActivationDepth = item.activation_order;
    }
  }

  const totalActive =
    initialActiveLoad.support_recommended_now +
    initialActiveLoad.missions_active +
    initialActiveLoad.habits_active;

  const alerts = [];
  if (initialActiveLoad.missions_active > 2) alerts.push("more than 2 missions active at start");
  if (initialActiveLoad.habits_active > 2) alerts.push("more than 2 habits active at start");
  if (!hasRescueSupport) alerts.push("no rescue support found");
  if (totalActive === planItems.length && planItems.length > 3) {
    alerts.push("all items active at start — no progressive unlocking");
  }

  const planContent = activePlan?.content;
  const expectedItemCount = planContent?.dimensions
    ? planContent.dimensions.reduce((sum, d) => sum + (d.items?.length ?? 0), 0)
    : null;
  if (expectedItemCount != null && expectedItemCount !== planItems.length) {
    distributionWarnings.push(
      `plan content has ${expectedItemCount} items but ${planItems.length} were distributed`,
    );
  }

  return {
    cycle_id: cycle.id,
    cycle_status: cycle.status,
    duration_months: cycle.duration_months,
    transformations_count: transformations.length,
    cycle_level_aspects_count: cycleLevelAspects.length,
    aspects_per_transformation: transformations.map(
      (t) => aspects.filter((a) => a.transformation_id === t.id).length,
    ),
    plan_version: activePlan?.version ?? null,
    generation_attempts: activePlan?.generation_attempts ?? null,
    items_per_dimension: itemsByDimension,
    items_total: planItems.length,
    initial_active_load: { ...initialActiveLoad, total_active: totalActive },
    activation_condition_depth: maxActivationDepth,
    has_rescue_support: hasRescueSupport,
    has_north_star: northStarMetrics.length > 0,
    kinds_distribution: kindsDist,
    tracking_types_distribution: trackingDist,
    distribution_warnings: distributionWarnings,
    alerts,
  };
}

// ---------------------------------------------------------------------------
// Trace construction
// ---------------------------------------------------------------------------

function buildTrace(cycle, transformations, aspects, plans, planItems, northStarMetrics, events) {
  const transformationsWithAspects = transformations.map((t) => ({
    ...t,
    aspects: aspects.filter((a) => a.transformation_id === t.id),
  }));
  const cycleLevelAspects = aspects.filter((a) => a.transformation_id == null);

  const activePlan = plans.find((p) => p.status === "active") ?? plans[0] ?? null;
  const activePlanItems = activePlan
    ? planItems.filter((item) => item.plan_id === activePlan.id)
    : planItems;

  const enrichedItems = activePlanItems.map((item) => {
    const tempId =
      item.payload?._generation?.temp_id ??
      null;
    return { ...item, temp_id: tempId };
  });

  return {
    cycle: sanitizeCycle(cycle),
    cycle_level_aspects: cycleLevelAspects,
    transformations: transformationsWithAspects,
    plans: plans.map(sanitizePlan),
    plan: activePlan ? sanitizePlan(activePlan) : null,
    plan_items: enrichedItems,
    north_star_metric: northStarMetrics[0] ?? null,
    events,
  };
}

function sanitizeCycle(c) {
  return {
    id: c.id,
    user_id: c.user_id,
    status: c.status,
    duration_months: c.duration_months,
    birth_date_snapshot: c.birth_date_snapshot ?? null,
    gender_snapshot: c.gender_snapshot ?? null,
    active_transformation_id: c.active_transformation_id ?? null,
    created_at: c.created_at,
    updated_at: c.updated_at,
  };
}

function sanitizePlan(p) {
  return {
    id: p.id,
    status: p.status,
    version: p.version,
    generation_attempts: p.generation_attempts,
    title: p.title,
    content: p.content,
    last_generation_reason: p.last_generation_reason ?? null,
    created_at: p.created_at,
    activated_at: p.activated_at ?? null,
    updated_at: p.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const repoRoot = path.resolve(process.cwd());
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(
      [
        "Usage:",
        "  node ./scripts/export_plan_generation_audit_bundle.mjs --user-id <uuid> --cycle-id <uuid>",
        "",
        "Options:",
        "  --user-id <uuid>     Required. User UUID",
        "  --cycle-id <uuid>    Required. Cycle UUID",
        "  --out <path>         Output JSON path (default: tmp/)",
        "",
        "Environment:",
        "  SUPABASE_URL                  If set, uses remote. Otherwise falls back to local supabase.",
        "  SUPABASE_SERVICE_ROLE_KEY     Required for remote.",
      ].join("\n"),
    );
    return;
  }

  if (!args.userId) {
    console.error('Missing --user-id "<uuid>"');
    process.exit(1);
  }
  if (!args.cycleId) {
    console.error('Missing --cycle-id "<uuid>"');
    process.exit(1);
  }

  const connection = getSupabaseConnection(repoRoot);
  if (!connection.serviceKey) {
    throw new Error("Missing service key. Set SUPABASE_SERVICE_ROLE_KEY or use local supabase.");
  }

  const baseUrl = connection.url.replace(/\/+$/, "");

  console.error(`Connecting to ${baseUrl} (${connection.source})…`);
  console.error(`Loading audit data for user=${args.userId.slice(0, 8)}… cycle=${args.cycleId.slice(0, 8)}…`);

  const [cycle, transformations, plans, events] = await Promise.all([
    loadCycle(baseUrl, connection.serviceKey, args.userId, args.cycleId),
    loadTransformations(baseUrl, connection.serviceKey, args.cycleId),
    loadPlans(baseUrl, connection.serviceKey, args.cycleId),
    loadEvents(baseUrl, connection.serviceKey, args.userId, args.cycleId),
  ]);

  const planIds = plans.map((p) => p.id);

  const [aspects, planItems, northStarMetrics] = await Promise.all([
    loadAspects(baseUrl, connection.serviceKey, args.cycleId),
    loadPlanItems(baseUrl, connection.serviceKey, planIds),
    loadNorthStarMetrics(baseUrl, connection.serviceKey, args.cycleId),
  ]);

  const trace = buildTrace(cycle, transformations, aspects, plans, planItems, northStarMetrics, events);
  const scorecard = computeScorecard(cycle, transformations, aspects, plans, planItems, northStarMetrics);

  const bundle = {
    ok: true,
    exported_at: new Date().toISOString(),
    source: {
      supabase_url: baseUrl,
      connection_type: connection.source,
    },
    request: {
      user_id: args.userId,
      cycle_id: args.cycleId,
    },
    trace,
    scorecard,
    annotations: [],
  };

  const outDir = path.join(repoRoot, "tmp");
  fs.mkdirSync(outDir, { recursive: true });
  const defaultOutFile = path.join(
    outDir,
    `plan_gen_audit_${args.userId.slice(0, 8)}_${args.cycleId.slice(0, 8)}_${compactTsForFilename(new Date().toISOString())}.json`,
  );
  const outFile = args.outFile ? path.resolve(repoRoot, args.outFile) : defaultOutFile;
  fs.mkdirSync(path.dirname(outFile), { recursive: true });

  fs.writeFileSync(outFile, JSON.stringify(bundle, null, 2), "utf8");

  console.log(
    JSON.stringify(
      {
        ok: true,
        out: outFile,
        counts: {
          transformations: transformations.length,
          aspects: aspects.length,
          plans: plans.length,
          plan_items: planItems.length,
          north_star_metrics: northStarMetrics.length,
          events: events.length,
        },
        scorecard_summary: {
          items_total: scorecard.items_total,
          items_per_dimension: scorecard.items_per_dimension,
          initial_active_load: scorecard.initial_active_load,
          alerts: scorecard.alerts,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
