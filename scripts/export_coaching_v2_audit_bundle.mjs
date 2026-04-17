import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import process from "node:process";

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
    const arg = argv[i];
    if (arg === "--user-id") {
      out.userId = String(argv[++i] ?? "").trim() || null;
    } else if (arg === "--scope") {
      out.scope = String(argv[++i] ?? "").trim() || "whatsapp";
    } else if (arg === "--scope-all") out.scopeAll = true;
    else if (arg === "--from") {
      out.from = String(argv[++i] ?? "").trim() || null;
    } else if (arg === "--to") out.to = String(argv[++i] ?? "").trim() || null;
    else if (arg === "--hours") {
      const hours = Number(argv[++i] ?? "");
      out.hours = Number.isFinite(hours) && hours > 0 ? hours : 72;
    } else if (arg === "--out") {
      out.outFile = String(argv[++i] ?? "").trim() || null;
    } else if (arg === "--help" || arg === "-h") out.help = true;
  }

  return out;
}

function isIsoLike(value) {
  const raw = String(value ?? "").trim();
  return raw ? Number.isFinite(new Date(raw).getTime()) : false;
}

function toIsoOrNull(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const dt = new Date(raw);
  return Number.isFinite(dt.getTime()) ? dt.toISOString() : null;
}

function getLocalSupabaseStatus(repoRoot) {
  const supabaseCli = String(process.env.SOPHIA_SUPABASE_CLI ?? "supabase")
    .trim();
  const raw = execSync(`${supabaseCli} status --output json`, {
    encoding: "utf8",
    cwd: repoRoot,
  });
  return JSON.parse(raw);
}

function isLocalUrl(url) {
  const normalized = String(url ?? "").toLowerCase();
  return normalized.includes("localhost") || normalized.includes("127.0.0.1") ||
    normalized.includes("0.0.0.0");
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

  const status = getLocalSupabaseStatus(repoRoot);
  const url = String(status?.API_URL ?? "").trim();
  const serviceKey = String(status?.SECRET_KEY ?? "").trim() || null;
  if (!url) {
    throw new Error(
      "Missing SUPABASE_URL env and no local `supabase status --output json` available.",
    );
  }
  return { url, serviceKey, source: "local" };
}

function getInternalSecret(connection) {
  const explicit = String(process.env.INTERNAL_FUNCTION_SECRET ?? "").trim();
  if (explicit) return explicit;

  const fallback = String(process.env.SECRET_KEY ?? "").trim();
  if (fallback) return fallback;

  if (isLocalUrl(connection.url) && connection.serviceKey) {
    return connection.serviceKey;
  }

  throw new Error(
    "Missing INTERNAL_FUNCTION_SECRET. Set it in env for remote/staging usage.",
  );
}

function buildFunctionsBaseUrl(rawUrl) {
  const base = String(rawUrl ?? "").trim().replace(/\/+$/, "");
  if (!base) throw new Error("Missing SUPABASE_URL");
  if (base.endsWith("/functions/v1")) return base;
  if (base.includes("/functions/v1/")) {
    return base.replace(/\/functions\/v1\/.*/, "/functions/v1");
  }
  return `${base}/functions/v1`;
}

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
    throw new Error(`GET ${tablePath} → ${res.status}: ${text.slice(0, 800)}`);
  }
  return JSON.parse(text);
}

async function postInternalJson(url, internalSecret, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Secret": internalSecret,
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0, 1200)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response from ${url}`);
  }
}

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

function cleanText(value) {
  return String(value ?? "").trim();
}

function strOrNull(value) {
  const text = cleanText(value);
  return text || null;
}

function boolOrNull(value) {
  return typeof value === "boolean" ? value : null;
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function stringArray(value) {
  return toArray(value).map((item) => cleanText(item)).filter(Boolean);
}

function normalizeDimension(value) {
  const raw = cleanText(value);
  if (raw === "missions" || raw === "mission") return "mission";
  if (raw === "habits" || raw === "habit") return "habit";
  if (raw === "support") return "support";
  return null;
}

function uniqueStrings(items) {
  return [...new Set(items.filter(Boolean))];
}

async function loadActiveCycle(baseUrl, serviceKey, userId) {
  const rows = await supabaseGet(
    baseUrl,
    serviceKey,
    `user_cycles?user_id=eq.${userId}&status=eq.active&select=*&order=created_at.desc&limit=1`,
  );
  return rows[0] ?? null;
}

async function loadActivePlan(baseUrl, serviceKey, cycleId) {
  if (!cycleId) return null;
  const rows = await supabaseGet(
    baseUrl,
    serviceKey,
    `user_plans_v2?cycle_id=eq.${cycleId}&status=eq.active&select=*&order=version.desc&limit=1`,
  );
  return rows[0] ?? null;
}

async function loadPlanItems(baseUrl, serviceKey, planId) {
  if (!planId) return [];
  return supabaseGet(
    baseUrl,
    serviceKey,
    `user_plan_items?plan_id=eq.${planId}&select=*&order=activation_order.asc.nullslast`,
  );
}

async function loadMomentumSnapshots(
  baseUrl,
  serviceKey,
  userId,
  fromIso,
  toIso,
) {
  return supabaseGet(
    baseUrl,
    serviceKey,
    `system_runtime_snapshots?user_id=eq.${userId}&snapshot_type=eq.momentum_state_updated_v2&created_at=gte.${fromIso}&created_at=lte.${toIso}&select=id,snapshot_type,payload,created_at&order=created_at.asc`,
  );
}

function momentumContextFromSnapshots(snapshots) {
  return snapshots.map((row) => ({
    at: row.created_at,
    current_state: row.payload?.current_state ?? null,
    posture: row.payload?.posture ?? null,
    dimensions: row.payload?.dimensions ?? null,
    assessment: row.payload?.assessment ?? null,
    active_load: row.payload?.active_load ?? null,
  }));
}

function enrichSelectorRun(run) {
  const payload = run?.payload ?? {};
  return {
    ...run,
    blocker_kind: strOrNull(payload.blocker_kind),
    dimension_detected: normalizeDimension(
      payload.dimension_detected ?? payload.target_plan_item_dimension,
    ),
    item_kind: strOrNull(payload.item_kind),
    coaching_scope: strOrNull(payload.coaching_scope),
    simplify_instead: Boolean(payload.simplify_instead),
    dimension_strategy: strOrNull(payload.dimension_strategy),
    plan_fit_level: strOrNull(payload.plan_fit_level),
    load_balance_level: strOrNull(payload.load_balance_level),
    target_plan_item_id: strOrNull(payload.target_plan_item_id),
    target_plan_item_title: strOrNull(payload.target_plan_item_title),
    target_plan_item_dimension: strOrNull(payload.target_plan_item_dimension),
  };
}

function enrichIntervention(intervention) {
  const payload = intervention?.proposal?.payload ?? {};
  return {
    ...intervention,
    blocker_kind: strOrNull(payload.blocker_kind),
    dimension_detected: normalizeDimension(
      payload.dimension_detected ?? payload.target_plan_item_dimension,
    ),
    item_kind: strOrNull(payload.item_kind),
    coaching_scope: strOrNull(payload.coaching_scope),
    simplify_instead: Boolean(payload.simplify_instead),
    dimension_strategy: strOrNull(payload.dimension_strategy),
    plan_fit_level: strOrNull(payload.plan_fit_level),
    load_balance_level: strOrNull(payload.load_balance_level),
    target_plan_item_id: strOrNull(payload.target_plan_item_id),
    target_plan_item_title: strOrNull(payload.target_plan_item_title),
    target_plan_item_dimension: strOrNull(payload.target_plan_item_dimension),
  };
}

function enrichFollowUp(followUp, interventionsById) {
  const intervention = interventionsById.get(
    cleanText(followUp?.intervention_id),
  );
  return {
    ...followUp,
    dimension_detected: intervention?.dimension_detected ?? null,
    item_kind: intervention?.item_kind ?? null,
    coaching_scope: intervention?.coaching_scope ?? null,
    simplify_instead: intervention?.simplify_instead ?? null,
    dimension_strategy: intervention?.dimension_strategy ?? null,
    plan_fit_level: intervention?.plan_fit_level ?? null,
    load_balance_level: intervention?.load_balance_level ?? null,
    target_plan_item_title: intervention?.target_plan_item_title ?? null,
  };
}

function enrichWeeklySurface(entry) {
  const payload = entry?.payload ?? {};
  return {
    ...entry,
    coaching_scope_at_weekly: strOrNull(payload.coaching_scope_at_weekly),
  };
}

function computeEnrichedScorecard(trace, legacyScorecard) {
  const selectorRuns = toArray(trace.selector_runs);
  const interventions = toArray(trace.interventions);
  const followUps = toArray(trace.follow_ups);

  const dimensionDistribution = {
    mission: 0,
    habit: 0,
    support: 0,
    unknown: 0,
  };
  for (const run of selectorRuns) {
    const dimension = run.dimension_detected;
    if (dimension === "mission") dimensionDistribution.mission++;
    else if (dimension === "habit") dimensionDistribution.habit++;
    else if (dimension === "support") dimensionDistribution.support++;
    else dimensionDistribution.unknown++;
  }

  const coachingScopeDistribution = { micro: 0, structural: 0, unknown: 0 };
  for (const intervention of interventions) {
    const scope = intervention.coaching_scope;
    if (scope === "micro") coachingScopeDistribution.micro++;
    else if (scope === "structural") coachingScopeDistribution.structural++;
    else coachingScopeDistribution.unknown++;
  }

  let simplifyTotal = 0;
  let simplifyWithOverloaded = 0;
  let simplifyWithPoorFit = 0;
  let simplifyIgnoredDespiteOverload = 0;
  let dimensionMismatch = 0;
  let structuralNeededButMicroGiven = 0;

  const techniquesByDimension = {};
  for (const intervention of interventions) {
    const technique = intervention.recommended_technique ?? "none";
    const dimension = intervention.dimension_detected ?? "unknown";
    if (!techniquesByDimension[dimension]) {
      techniquesByDimension[dimension] = {};
    }
    techniquesByDimension[dimension][technique] =
      (techniquesByDimension[dimension][technique] ?? 0) + 1;

    if (intervention.simplify_instead === true) {
      simplifyTotal++;
      if (intervention.load_balance_level === "overloaded") {
        simplifyWithOverloaded++;
      }
      if (intervention.plan_fit_level === "poor") {
        simplifyWithPoorFit++;
      }
    } else if (
      intervention.load_balance_level === "overloaded" ||
      intervention.plan_fit_level === "poor"
    ) {
      simplifyIgnoredDespiteOverload++;
    }

    const expectedDimension = normalizeDimension(
      intervention.target_plan_item_dimension,
    );
    if (
      intervention.dimension_detected && expectedDimension &&
      intervention.dimension_detected !== expectedDimension
    ) {
      dimensionMismatch++;
    }

    if (
      intervention.coaching_scope === "micro" &&
      (
        intervention.plan_fit_level === "poor" ||
        intervention.load_balance_level === "overloaded"
      )
    ) {
      structuralNeededButMicroGiven++;
    }
  }

  const legacyAlerts = legacyScorecard?.alerts ?? {};
  const alertList = [];
  if (dimensionMismatch > 0) {
    alertList.push(`dimension_mismatch: ${dimensionMismatch} case(s)`);
  }
  if (simplifyIgnoredDespiteOverload > 0) {
    alertList.push(
      `simplify_ignored_despite_overload: ${simplifyIgnoredDespiteOverload} case(s)`,
    );
  }
  if (structuralNeededButMicroGiven > 0) {
    alertList.push(
      `structural_needed_but_micro_given: ${structuralNeededButMicroGiven} case(s)`,
    );
  }
  if (Number(legacyAlerts.low_confidence_selector_runs ?? 0) > 0) {
    alertList.push(
      `low_confidence_selector_runs: ${legacyAlerts.low_confidence_selector_runs}`,
    );
  }
  if (Number(legacyAlerts.repeated_failed_technique_signals ?? 0) > 0) {
    alertList.push(
      `repeated_failed_technique_signals: ${legacyAlerts.repeated_failed_technique_signals}`,
    );
  }

  return {
    coverage: legacyScorecard?.coverage ?? {
      turns_total: trace.summary?.turns_total ?? null,
      user_messages: trace.summary?.user_messages ?? null,
      assistant_messages: trace.summary?.assistant_messages ?? null,
      selector_runs_total: trace.summary?.selector_runs_total ?? null,
      interventions_total: trace.summary?.interventions_total ?? null,
      follow_ups_total: trace.summary?.follow_ups_total ?? null,
      weekly_surfaces_total: trace.summary?.weekly_surfaces_total ?? null,
      observability_events_total: trace.summary?.observability_events_total ??
        null,
    },
    triggers: legacyScorecard?.triggers ?? { distribution: {} },
    gating: legacyScorecard?.gating ?? null,
    blockers: legacyScorecard?.blockers ?? null,
    dimension_distribution: dimensionDistribution,
    coaching_scope_distribution: coachingScopeDistribution,
    simplify_conclusions: {
      total: simplifyTotal,
      with_overloaded_load: simplifyWithOverloaded,
      with_poor_plan_fit: simplifyWithPoorFit,
      ignored_despite_overload: simplifyIgnoredDespiteOverload,
    },
    techniques: {
      ...(legacyScorecard?.techniques ?? {}),
      proposed_by_dimension: techniquesByDimension,
    },
    effectiveness: legacyScorecard?.effectiveness ?? null,
    weekly: legacyScorecard?.weekly ?? null,
    alerts: {
      list: alertList,
      dimension_mismatch: dimensionMismatch,
      simplify_ignored_despite_overload: simplifyIgnoredDespiteOverload,
      structural_needed_but_micro_given: structuralNeededButMicroGiven,
      low_confidence_selector_runs: Number(
        legacyAlerts.low_confidence_selector_runs ?? 0,
      ),
      repeated_failed_technique_signals: Number(
        legacyAlerts.repeated_failed_technique_signals ?? 0,
      ),
    },
  };
}

function transcriptWrite(filePath, messages) {
  const fd = fs.openSync(filePath, "w");
  try {
    for (const row of messages ?? []) {
      const ts = String(row?.created_at ?? "");
      const scope = String(row?.scope ?? "");
      const role = String(row?.role ?? "");
      const requestId = cleanText(
        row?.metadata?.request_id ??
          row?.metadata?.router_decision_v2?.request_id ??
          "",
      );
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

async function main() {
  const repoRoot = path.resolve(process.cwd());
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log([
      "Usage:",
      "  node ./scripts/export_coaching_v2_audit_bundle.mjs --user-id <uuid> --hours 72",
      "  node ./scripts/export_coaching_v2_audit_bundle.mjs --user-id <uuid> --from <ISO> --to <ISO>",
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
    throw new Error(
      "Missing service key. Set SUPABASE_SERVICE_ROLE_KEY or use local supabase.",
    );
  }

  const baseUrl = connection.url.replace(/\/+$/, "");
  const now = new Date().toISOString();
  const fromIso = toIsoOrNull(args.from) ??
    new Date(Date.now() - args.hours * 3600 * 1000).toISOString();
  const toIso = toIsoOrNull(args.to) ?? now;
  const effectiveScope = args.scopeAll ? null : args.scope;

  console.error(`Connecting to ${baseUrl} (${connection.source})…`);
  console.error(
    `Loading coaching V2 audit for user=${
      args.userId.slice(0, 8)
    }… window=${args.hours}h scope=${effectiveScope ?? "all"}`,
  );

  const functionsBase = buildFunctionsBaseUrl(connection.url);
  const internalSecret = getInternalSecret(connection);
  const traceBody = {
    user_id: args.userId,
    ...(effectiveScope ? { scope: effectiveScope } : {}),
    ...(args.from ? { from: fromIso, to: toIso } : { hours: args.hours }),
  };

  const cycle = await loadActiveCycle(
    baseUrl,
    connection.serviceKey,
    args.userId,
  );
  const plan = cycle
    ? await loadActivePlan(baseUrl, connection.serviceKey, cycle.id)
    : null;

  const [traceRes, scorecardRes, momentumSnapshots, planItems] = await Promise
    .all([
      postInternalJson(
        `${functionsBase}/get-coaching-intervention-trace`,
        internalSecret,
        traceBody,
      ),
      postInternalJson(
        `${functionsBase}/get-coaching-intervention-scorecard`,
        internalSecret,
        traceBody,
      ),
      loadMomentumSnapshots(
        baseUrl,
        connection.serviceKey,
        args.userId,
        fromIso,
        toIso,
      ),
      loadPlanItems(baseUrl, connection.serviceKey, plan?.id),
    ]);

  const baseTrace = traceRes?.trace ?? {};
  const legacyScorecard = scorecardRes?.scorecard ?? null;
  const enrichedSelectorRuns = toArray(baseTrace.selector_runs).map(
    enrichSelectorRun,
  );
  const enrichedInterventions = toArray(baseTrace.interventions).map(
    enrichIntervention,
  );
  const interventionsById = new Map(
    enrichedInterventions
      .filter((item) => cleanText(item.intervention_id))
      .map((item) => [cleanText(item.intervention_id), item]),
  );
  const enrichedFollowUps = toArray(baseTrace.follow_ups).map((row) =>
    enrichFollowUp(row, interventionsById)
  );
  const enrichedWeeklySurfaces = toArray(baseTrace.weekly_surfaces).map(
    enrichWeeklySurface,
  );
  const momentumContext = momentumContextFromSnapshots(momentumSnapshots);

  const trace = {
    ...baseTrace,
    context: {
      cycle_id: cycle?.id ?? null,
      plan_id: plan?.id ?? null,
      plan_status: plan?.status ?? null,
    },
    selector_runs: enrichedSelectorRuns,
    interventions: enrichedInterventions,
    follow_ups: enrichedFollowUps,
    weekly_surfaces: enrichedWeeklySurfaces,
    momentum_context: momentumContext,
    plan_items_snapshot: planItems.map((item) => ({
      id: item.id,
      dimension: item.dimension,
      kind: item.kind,
      title: item.title,
      status: item.status,
      current_habit_state: item.current_habit_state ?? null,
      activation_order: item.activation_order ?? null,
    })),
  };

  const scorecard = computeEnrichedScorecard(trace, legacyScorecard);

  const bundle = {
    ok: true,
    exported_at: now,
    source: {
      supabase_url: baseUrl,
      connection_type: connection.source,
      trace_endpoint: "get-coaching-intervention-trace",
      scorecard_endpoint: "get-coaching-intervention-scorecard",
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
    legacy_scorecard: legacyScorecard,
    annotations: [],
  };

  const outDir = path.join(repoRoot, "tmp");
  fs.mkdirSync(outDir, { recursive: true });
  const scopeLabel = effectiveScope ?? "all";
  const defaultOutFile = path.join(
    outDir,
    `coaching_v2_audit_${args.userId.slice(0, 8)}_${scopeLabel}_${
      compactTs(fromIso)
    }_${compactTs(toIso)}.json`,
  );
  const outFile = args.outFile
    ? path.resolve(repoRoot, args.outFile)
    : defaultOutFile;
  fs.mkdirSync(path.dirname(outFile), { recursive: true });

  const transcriptPath = outFile.replace(/\.json$/i, ".transcript.txt");
  fs.writeFileSync(outFile, JSON.stringify(bundle, null, 2), "utf8");
  transcriptWrite(transcriptPath, toArray(trace.messages));

  console.log(JSON.stringify(
    {
      ok: true,
      out: outFile,
      transcript: transcriptPath,
      window: { from: fromIso, to: toIso, scope: effectiveScope },
      counts: {
        messages: toArray(trace.messages).length,
        selector_runs: enrichedSelectorRuns.length,
        interventions: enrichedInterventions.length,
        follow_ups: enrichedFollowUps.length,
        weekly_surfaces: enrichedWeeklySurfaces.length,
        plan_items: planItems.length,
        momentum_snapshots: momentumSnapshots.length,
      },
      scorecard_summary: {
        coverage: scorecard.coverage,
        dimension_distribution: scorecard.dimension_distribution,
        coaching_scope_distribution: scorecard.coaching_scope_distribution,
        simplify_conclusions: scorecard.simplify_conclusions,
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
