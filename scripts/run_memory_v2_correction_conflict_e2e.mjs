#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runId = `memory-correction-e2e-${Date.now().toString(36)}`;
const scopeA = `${runId}-initial`;
const scopeB = `${runId}-correction`;
const scopeC = `${runId}-retrieval`;
const now = new Date();
const isoNow = now.toISOString();
const sinceIso = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
const ACTION_FAMILY = "habit:pompes_matin";

function readLocalEnv() {
  const envPath = path.join(cwd, "supabase", ".env");
  const out = {};
  const raw = readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    out[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

function readStatus() {
  try {
    const raw = execFileSync("supabase", ["status", "--output", "json"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

const env = readLocalEnv();
const status = readStatus();
const apiUrl = status.API_URL ?? env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const functionsUrl = status.FUNCTIONS_URL ?? `${apiUrl}/functions/v1`;
const anonKey = status.ANON_KEY ?? env.SUPABASE_ANON_KEY;
const serviceRoleKey = status.SERVICE_ROLE_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
const internalSecret = env.INTERNAL_FUNCTION_SECRET ?? env.SECRET_KEY;

if (!anonKey || !serviceRoleKey || !internalSecret) {
  throw new Error("Missing Supabase keys/internal secret in supabase/.env or supabase status.");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalize(text) {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

async function requestJson(url, opts = {}) {
  const { timeoutMs = 120000, ...fetchOpts } = opts;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...fetchOpts, signal: controller.signal });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text };
    }
    if (!response.ok) {
      const error = new Error(`${opts.method ?? "GET"} ${url} -> ${response.status}`);
      error.status = response.status;
      error.body = body;
      throw error;
    }
    return { status: response.status, body };
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`${opts.method ?? "GET"} ${url} timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function adminRequest(pathname, opts = {}) {
  return await requestJson(`${apiUrl}${pathname}`, {
    ...opts,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      ...(opts.body ? { "content-type": "application/json" } : {}),
      ...(opts.headers ?? {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
}

async function rest(pathname, opts = {}) {
  const { body } = await adminRequest(`/rest/v1/${pathname}`, {
    method: opts.method ?? "GET",
    body: opts.body,
    headers: {
      ...(opts.prefer ? { prefer: opts.prefer } : {}),
      ...(opts.headers ?? {}),
    },
  });
  return body;
}

async function createUser() {
  const email = `${runId}@example.com`;
  const password = `MemoryCorrection-${Date.now()}!`;
  const { body: created } = await adminRequest("/auth/v1/admin/users", {
    method: "POST",
    body: {
      email,
      password,
      email_confirm: true,
      user_metadata: { fixture: runId, full_name: "Memory Correction E2E" },
    },
  });
  const userId = created?.id;
  if (!userId) throw new Error("Could not create auth user.");
  await rest("profiles?on_conflict=id", {
    method: "POST",
    body: {
      id: userId,
      full_name: "Memory Correction E2E",
      onboarding_completed: true,
      timezone: "Europe/Paris",
    },
    prefer: "resolution=merge-duplicates,return=minimal",
  });
  const { body: session } = await requestJson(`${apiUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  if (!session?.access_token) throw new Error("Could not sign in created user.");
  return { id: userId, email, accessToken: session.access_token };
}

async function seedPlan(userId) {
  const ids = {
    cycleId: randomUUID(),
    transformationId: randomUUID(),
    planId: randomUUID(),
    pushups: randomUUID(),
  };
  await rest("user_cycles", {
    method: "POST",
    body: {
      id: ids.cycleId,
      user_id: userId,
      status: "active",
      raw_intake_text: "Fixture E2E correction de souvenir action.",
      intake_language: "fr",
      duration_months: 1,
      version: 1,
    },
    prefer: "return=minimal",
  });
  await rest("user_transformations", {
    method: "POST",
    body: {
      id: ids.transformationId,
      cycle_id: ids.cycleId,
      priority_order: 1,
      status: "active",
      title: "Routine pompes",
      internal_summary: "Fixture E2E pour verifier les corrections de memoire.",
      user_summary: "Routine pompes progressive.",
      success_definition: "Un souvenir corrige remplace l'ancien sans doublon actif contradictoire.",
      activated_at: isoNow,
    },
    prefer: "return=minimal",
  });
  await rest(`user_cycles?id=eq.${ids.cycleId}`, {
    method: "PATCH",
    body: { active_transformation_id: ids.transformationId },
    prefer: "return=minimal",
  });
  await rest("user_plans_v2", {
    method: "POST",
    body: {
      id: ids.planId,
      user_id: userId,
      cycle_id: ids.cycleId,
      transformation_id: ids.transformationId,
      status: "active",
      version: 1,
      title: "Plan E2E correction memory",
      content: { fixture: runId },
      activated_at: isoNow,
    },
    prefer: "return=minimal",
  });
  await rest("user_plan_items", {
    method: "POST",
    body: {
      id: ids.pushups,
      user_id: userId,
      cycle_id: ids.cycleId,
      transformation_id: ids.transformationId,
      plan_id: ids.planId,
      dimension: "habits",
      kind: "habit",
      status: "active",
      title: "Faire 12 pompes",
      description: "Habitude progressive de pompes le matin.",
      tracking_type: "count",
      activation_order: 1,
      current_habit_state: "active_building",
      target_reps: 12,
      current_reps: 12,
      cadence_label: "12 repetitions, trois fois cette semaine",
      scheduled_days: ["mon", "wed", "fri"],
      time_of_day: "morning",
      payload: {
        fixture: runId,
        action_family_key: ACTION_FAMILY,
        aliases: ["pompes", "pompes matin", "pushups", "faire 12 pompes"],
        variant: "week_1_12_reps",
      },
      activated_at: isoNow,
    },
    prefer: "return=minimal",
  });
  await rest("user_plan_item_entries", {
    method: "POST",
    body: {
      id: randomUUID(),
      user_id: userId,
      cycle_id: ids.cycleId,
      transformation_id: ids.transformationId,
      plan_id: ids.planId,
      plan_item_id: ids.pushups,
      entry_kind: "progress",
      outcome: "done",
      value_numeric: 12,
      difficulty_level: "medium",
      blocker_hint: "timing encore a stabiliser",
      effective_at: isoNow,
      metadata: { fixture: runId },
    },
    prefer: "return=minimal",
  });
  return ids;
}

async function callBrain(user, scope, message, index, phase) {
  const requestBase = `${runId}-${phase}-${index}`;
  console.error(`[${runId}] ${phase} turn ${index + 1}`);
  let body = null;
  let requestId = requestBase;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      requestId = `${requestBase}-attempt-${attempt}`;
      const result = await requestJson(`${functionsUrl}/sophia-brain`, {
        method: "POST",
        timeoutMs: 300000,
        headers: {
          apikey: anonKey,
          authorization: `Bearer ${user.accessToken}`,
          "content-type": "application/json",
          "x-request-id": requestId,
        },
        body: JSON.stringify({
          message,
          scope,
          channel: "web",
          logMessages: true,
          messageMetadata: {
            correction_e2e_run_id: runId,
            phase,
            turn_index: index,
            attempt,
            force_full_ai: true,
          },
        }),
      });
      body = result.body;
      break;
    } catch (error) {
      const retryable = error?.status === 502 ||
        String(error?.message ?? "").includes("timed out");
      if (!retryable || attempt === 3) throw error;
      console.error(`[${runId}] retry brain after ${error.message}`);
      await sleep(2000 * attempt);
    }
  }
  return {
    request_id: requestId,
    message,
    response_text: String(body?.content ?? body?.message ?? body?.raw ?? "").trim(),
    response_body: body,
  };
}

async function triggerMemorizer(userId, phase) {
  console.error(`[${runId}] trigger memorizer ${phase}`);
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { body } = await requestJson(`${functionsUrl}/trigger-memorizer-daily`, {
        method: "POST",
        timeoutMs: 300000,
        headers: {
          authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
          "content-type": "application/json",
          "x-internal-secret": internalSecret,
          "x-request-id": `${runId}-memorizer-${phase}-attempt-${attempt}`,
        },
        body: JSON.stringify({
          user_id: userId,
          hours: 24,
          since_iso: sinceIso,
        }),
      });
      return body;
    } catch (error) {
      const retryable = error?.status === 502 ||
        String(error?.message ?? "").includes("timed out");
      if (!retryable || attempt === 3) throw error;
      console.error(`[${runId}] retry memorizer after ${error.message}`);
      await sleep(3000 * attempt);
    }
  }
}

async function getTrace(userId, scope) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const { body } = await requestJson(`${functionsUrl}/get-memory-trace`, {
        method: "POST",
        timeoutMs: 60000,
        headers: {
          apikey: anonKey,
          authorization: `Bearer ${anonKey}`,
          "content-type": "application/json",
          "x-internal-secret": internalSecret,
          "x-request-id": `${runId}-trace-${scope}-attempt-${attempt}`,
        },
        body: JSON.stringify({ user_id: userId, hours: 6, scope }),
      });
      return body?.trace ?? null;
    } catch (error) {
      const retryable = error?.status === 502 ||
        String(error?.message ?? "").includes("timed out");
      if (!retryable || attempt === 3) throw error;
      await sleep(1000 * attempt);
    }
  }
}

async function fetchMemoryState(userId) {
  const encodedUser = encodeURIComponent(userId);
  const [items, links, changeLog, runs] = await Promise.all([
    rest(`memory_items?user_id=eq.${encodedUser}&select=id,kind,status,content_text,normalized_summary,domain_keys,metadata,superseded_by_item_id,created_at&order=created_at.asc`),
    rest(`memory_item_actions?user_id=eq.${encodedUser}&select=id,memory_item_id,plan_item_id,aggregation_kind,confidence,metadata,created_at,memory_items(id,kind,status,content_text,normalized_summary,metadata)&order=created_at.asc`),
    rest(`memory_change_log?user_id=eq.${encodedUser}&select=id,operation_type,target_type,target_id,replacement_id,reason,metadata,created_at&order=created_at.asc`),
    rest(`memory_extraction_runs?user_id=eq.${encodedUser}&select=id,status,trigger_type,proposed_item_count,accepted_item_count,rejected_item_count,metadata,started_at,finished_at&order=started_at.desc&limit=5`),
  ]);
  return {
    items: Array.isArray(items) ? items : [],
    actionLinks: Array.isArray(links) ? links : [],
    changeLog: Array.isArray(changeLog) ? changeLog : [],
    runs: Array.isArray(runs) ? runs : [],
  };
}

function itemText(item) {
  return normalize(`${item?.content_text ?? ""} ${item?.normalized_summary ?? ""}`);
}

function linkText(link) {
  return itemText(link?.memory_items);
}

function isPushupsLink(link, ids) {
  return link?.plan_item_id === ids.pushups ||
    link?.metadata?.action_family_key === ACTION_FAMILY ||
    link?.memory_items?.metadata?.action_family_key === ACTION_FAMILY;
}

function hasBreakfast(text) {
  return text.includes("petit-dejeuner") || text.includes("petit dejeuner") ||
    text.includes("dejeuner");
}

function hasShower(text) {
  return text.includes("douche") || text.includes("salle de bain") ||
    text.includes("tapis");
}

function hasCorrectionMarker(text) {
  return text.includes("plutot") || text.includes("pas ") ||
    text.includes("ne marche") || text.includes("oublie") ||
    text.includes("remplace") || text.includes("corrige");
}

function evaluateStateBeforeCorrection(state, ids) {
  const activePushups = state.actionLinks.filter((link) =>
    isPushupsLink(link, ids) && link?.memory_items?.status === "active"
  );
  const oldActive = activePushups.filter((link) => {
    const text = linkText(link);
    return hasBreakfast(text) && !hasShower(text);
  });
  return {
    active_pushups_links: activePushups.length,
    old_active_ids: oldActive.map((link) => link.memory_item_id),
    ok: oldActive.length >= 1,
  };
}

function evaluateStateAfterCorrection(state, ids, before) {
  const activePushups = state.actionLinks.filter((link) =>
    isPushupsLink(link, ids) && link?.memory_items?.status === "active"
  );
  const newActive = activePushups.filter((link) => hasShower(linkText(link)));
  const staleActive = activePushups.filter((link) => {
    const text = linkText(link);
    return hasBreakfast(text) && !hasShower(text) && !hasCorrectionMarker(text);
  });
  const oldItems = state.items.filter((item) =>
    before.old_active_ids.includes(item.id) ||
    (hasBreakfast(itemText(item)) && !hasShower(itemText(item)))
  );
  const oldStillActive = oldItems.filter((item) => item.status === "active");
  const supersedeLogs = state.changeLog.filter((row) =>
    row.operation_type === "supersede" || row.operation_type === "invalidate"
  );
  return {
    active_pushups_links: activePushups.length,
    new_active_ids: newActive.map((link) => link.memory_item_id),
    stale_active_ids: staleActive.map((link) => link.memory_item_id),
    old_item_statuses: oldItems.map((item) => ({
      id: item.id,
      status: item.status,
      text: item.content_text,
      superseded_by_item_id: item.superseded_by_item_id ?? null,
    })),
    correction_change_log_count: supersedeLogs.length,
    correction_change_logs: supersedeLogs,
    ok: newActive.length >= 1 &&
      staleActive.length === 0 &&
      oldStillActive.length === 0 &&
      supersedeLogs.length >= 1,
  };
}

function extractTurnTrace(trace, requestId) {
  const turn = (trace?.turns ?? []).find((row) => row.request_id === requestId);
  if (!turn) return null;
  const active = (turn.events ?? [])
    .filter((event) => event.event_name === "memory.runtime.active.loaded")
    .at(-1)?.payload ?? null;
  return {
    dispatcher_memory_plan: turn.dispatcher?.memory_plan ?? null,
    injected: Boolean(turn.injection),
    active_loader: active
      ? {
        retrieval_mode: active.retrieval_mode ?? null,
        requested_scopes: active.loader_plan_requested_scopes ?? [],
        action_targets: active.loader_plan_action_targets ?? [],
        payload_item_count: active.payload_item_count ?? null,
        payload_item_ids: active.payload_item_ids ?? [],
      }
      : null,
  };
}

function evaluateRetrieval(turn, trace) {
  const response = normalize(turn.response_text);
  const expected = ["pompes", "douche"];
  const matched = expected.filter((term) => response.includes(normalize(term)));
  const stale = hasBreakfast(response) && !hasCorrectionMarker(response);
  const payloadCount = Number(trace?.active_loader?.payload_item_count ?? 0);
  const scopes = trace?.active_loader?.requested_scopes ?? [];
  return {
    matched_terms: matched,
    stale_breakfast_claim: stale,
    payload_item_count: payloadCount,
    requested_scopes: scopes,
    action_targets: trace?.active_loader?.action_targets ?? [],
    dispatcher_memory_mode: trace?.dispatcher_memory_plan?.memory_mode ?? null,
    response_preview: turn.response_text.slice(0, 700),
    ok: matched.length === expected.length &&
      !stale &&
      payloadCount > 0 &&
      scopes.includes("action"),
  };
}

const initialConversation = [
  "Contexte test memoire: je veux que les apprentissages lies a mes actions soient retenus.",
  "Action active Faire 12 pompes: aujourd'hui j'ai fait les 12 repetitions.",
  "Observation importante pour l'action Faire 12 pompes: les pompes marchent mieux juste apres le petit-dejeuner.",
  "Garde ce souvenir pour l'action Faire 12 pompes: le declencheur utile est apres le petit-dejeuner.",
  "Ce n'est pas une remarque generale de sport, c'est bien un apprentissage de mon action active Faire 12 pompes.",
  "A cote, j'ai une idee de lecture sur le design, mais ce n'est pas une action active.",
];

const correctionConversation = [
  "Correction importante sur mon action Faire 12 pompes.",
  "Oublie l'ancien souvenir disant que les pompes marchent mieux apres le petit-dejeuner.",
  "En fait, remplace-le: pour Faire 12 pompes, ca marche mieux avant la douche, quand je pose le tapis dans la salle de bain.",
  "Garde la nouvelle version uniquement: pompes avant la douche, pas apres le petit-dejeuner.",
];

async function main() {
  console.error(`[${runId}] create user`);
  const user = await createUser();
  console.error(`[${runId}] seed plan`);
  const ids = await seedPlan(user.id);

  const initialTurns = [];
  for (let i = 0; i < initialConversation.length; i++) {
    initialTurns.push(await callBrain(user, scopeA, initialConversation[i], i, "initial"));
  }
  const memorizerA = await triggerMemorizer(user.id, "initial");
  const stateA = await fetchMemoryState(user.id);
  const beforeEvaluation = evaluateStateBeforeCorrection(stateA, ids);

  const correctionTurns = [];
  for (let i = 0; i < correctionConversation.length; i++) {
    correctionTurns.push(await callBrain(user, scopeB, correctionConversation[i], i, "correction"));
  }
  const traceB = await getTrace(user.id, scopeB);
  const memorizerB = await triggerMemorizer(user.id, "correction");
  const stateB = await fetchMemoryState(user.id);
  const afterEvaluation = evaluateStateAfterCorrection(stateB, ids, beforeEvaluation);

  const retrievalMessage = "Pour mon action Faire 12 pompes, d'apres mes souvenirs memorises uniquement, quel est le bon declencheur maintenant ? Reponds concretement.";
  const retrievalTurn = await callBrain(user, scopeC, retrievalMessage, 0, "retrieval");
  const traceC = await getTrace(user.id, scopeC);
  const retrievalTrace = extractTurnTrace(traceC, retrievalTurn.request_id);
  const retrievalEvaluation = evaluateRetrieval(retrievalTurn, retrievalTrace);

  const checks = {
    initial_memory_created_active: beforeEvaluation.ok,
    correction_memorizer_completed: memorizerB?.processed?.some((row) =>
      row.user_id === user.id && row.memorizer?.status === "completed"
    ) ?? false,
    no_contradictory_active_memory_after_correction: afterEvaluation.ok,
    retrieval_uses_corrected_memory: retrievalEvaluation.ok,
  };

  const report = {
    ok: Object.values(checks).every(Boolean),
    run_id: runId,
    user: { id: user.id, email: user.email },
    scopes: { initial: scopeA, correction: scopeB, retrieval: scopeC },
    plan_ids: ids,
    initial_conversation: { turns: initialTurns },
    correction_conversation: {
      turns: correctionTurns,
      trace_summary: traceB?.summary ?? null,
    },
    retrieval_conversation: {
      turn: retrievalTurn,
      trace_summary: traceC?.summary ?? null,
      trace: retrievalTrace,
      evaluation: retrievalEvaluation,
    },
    memorizer: { initial: memorizerA, correction: memorizerB },
    memory_state_before_correction: stateA,
    memory_state_after_correction: stateB,
    evaluations: {
      before_correction: beforeEvaluation,
      after_correction: afterEvaluation,
      retrieval: retrievalEvaluation,
    },
    checks,
  };

  mkdirSync(path.join(cwd, "tmp"), { recursive: true });
  const outPath = path.join(cwd, "tmp", `${runId}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({
    report_path: outPath,
    ok: report.ok,
    run_id: runId,
    user: report.user,
    checks,
    memory_counts: {
      before_items: stateA.items.length,
      after_items: stateB.items.length,
      after_active_items: stateB.items.filter((item) => item.status === "active").length,
      after_action_links: stateB.actionLinks.length,
      change_logs: stateB.changeLog.length,
    },
    before_evaluation: beforeEvaluation,
    after_evaluation: afterEvaluation,
    retrieval_evaluation: retrievalEvaluation,
    memorizer_summary: {
      initial: memorizerA?.processed?.find((row) => row.user_id === user.id)?.memorizer ?? null,
      correction: memorizerB?.processed?.find((row) => row.user_id === user.id)?.memorizer ?? null,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  if (error?.body) console.error(JSON.stringify(error.body, null, 2));
  process.exitCode = 1;
});
