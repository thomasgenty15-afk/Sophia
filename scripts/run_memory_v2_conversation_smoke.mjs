#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const keepUser = process.argv.includes("--keep-user");
const runId = `memory-v2-smoke-${Date.now().toString(36)}`;
const scope = `memory-v2-smoke-${Date.now().toString(36)}`;
const createdUserIds = [];
const seededItemIds = new Set();

function readLocalEnv() {
  const envPath = path.join(cwd, "supabase", ".env");
  const out = {};
  try {
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!match) continue;
      out[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // The weekly review smoke will report a skipped internal call if missing.
  }
  return out;
}

const localEnv = readLocalEnv();
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

const status = readStatus();
const apiUrl = status.API_URL ?? localEnv.SUPABASE_URL ??
  "http://127.0.0.1:54321";
const functionsUrl = status.FUNCTIONS_URL ?? `${apiUrl}/functions/v1`;
const anonKey = status.ANON_KEY ?? localEnv.SUPABASE_ANON_KEY;
const serviceRoleKey = status.SERVICE_ROLE_KEY ??
  localEnv.SUPABASE_SERVICE_ROLE_KEY;
const internalSecret = localEnv.INTERNAL_FUNCTION_SECRET ?? localEnv.SECRET_KEY;

if (!anonKey || !serviceRoleKey) {
  throw new Error(
    "Missing local Supabase ANON_KEY or SERVICE_ROLE_KEY from `supabase status` or `supabase/.env`.",
  );
}

function memoryV2RolloutBucket(userId) {
  let hash = 2166136261;
  for (const char of String(userId ?? "")) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % 100;
}

async function requestJson(url, opts = {}) {
  const response = await fetch(url, opts);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!response.ok) {
    const err = new Error(
      `${opts.method ?? "GET"} ${url} -> ${response.status}`,
    );
    err.status = response.status;
    err.body = body;
    throw err;
  }
  return { status: response.status, body };
}

async function adminRequest(pathname, opts = {}) {
  return requestJson(`${apiUrl}${pathname}`, {
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
  const headers = {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    ...(opts.body ? { "content-type": "application/json" } : {}),
    ...(opts.prefer ? { prefer: opts.prefer } : {}),
  };
  const { body } = await requestJson(`${apiUrl}/rest/v1/${pathname}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return body;
}

async function insertRow(table, row) {
  const body = await rest(`${table}?select=*`, {
    method: "POST",
    body: row,
    prefer: "return=representation",
  });
  return Array.isArray(body) ? body[0] : body;
}

async function upsertProfile(userId, email) {
  const base = {
    id: userId,
    full_name: "Memory V2 Smoke",
    onboarding_completed: true,
    timezone: "Europe/Paris",
  };
  try {
    await rest("profiles?on_conflict=id", {
      method: "POST",
      body: base,
      prefer: "resolution=merge-duplicates,return=minimal",
    });
  } catch {
    await rest("profiles?on_conflict=id", {
      method: "POST",
      body: {
        id: userId,
        full_name: `Memory V2 Smoke ${email}`,
        onboarding_completed: true,
      },
      prefer: "resolution=merge-duplicates,return=minimal",
    });
  }
}

async function createUser(index) {
  const email = `memory-smoke-${Date.now()}-${index}@example.com`;
  const password = `MemorySmoke-${Date.now()}-${index}!`;
  const { body: created } = await adminRequest("/auth/v1/admin/users", {
    method: "POST",
    body: {
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: "Memory V2 Smoke" },
    },
    headers: { "content-type": "application/json" },
  });
  const userId = created?.id;
  if (!userId) throw new Error("Auth admin create user did not return an id.");
  createdUserIds.push(userId);
  await upsertProfile(userId, email);
  const { body: session } = await requestJson(
    `${apiUrl}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: anonKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    },
  );
  if (!session?.access_token) throw new Error("Could not sign in smoke user.");
  return {
    id: userId,
    email,
    password,
    accessToken: session.access_token,
    rolloutBucket: memoryV2RolloutBucket(userId),
  };
}

async function deleteUser(userId) {
  try {
    await adminRequest(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: "DELETE",
    });
  } catch {
    // Best effort cleanup; the final report exposes whether cleanup was requested.
  }
}

async function createRolloutUser() {
  const attempts = [];
  for (let i = 0; i < 80; i++) {
    const user = await createUser(i);
    attempts.push({ user_id: user.id, rollout_bucket: user.rolloutBucket });
    if (user.rolloutBucket < 5) return { user, attempts };
    await deleteUser(user.id);
  }
  throw new Error(
    "Could not create a local user in Memory V2 5% rollout bucket after 80 attempts.",
  );
}

function yesterdayWindow() {
  const start = new Date();
  start.setDate(start.getDate() - 1);
  start.setHours(9, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

async function seedMemory(userId) {
  const nowIso = new Date().toISOString();
  const { start, end } = yesterdayWindow();
  const sommeil = await insertRow("user_topic_memories", {
    user_id: userId,
    slug: "sommeil_energie",
    title: "Sommeil / Energie",
    status: "active",
    lifecycle_stage: "durable",
    search_doc: "sommeil dormi fatigue energie vide hier mal dormi",
    pending_changes_count: 0,
    metadata: { smoke_run_id: runId },
  });
  const travail = await insertRow("user_topic_memories", {
    user_id: userId,
    slug: "travail_manager",
    title: "Travail / Manager",
    status: "active",
    lifecycle_stage: "durable",
    search_doc: "travail manager reunion collegue humilie pression deadline",
    pending_changes_count: 0,
    metadata: { smoke_run_id: runId },
  });
  const event = await insertRow("memory_items", {
    user_id: userId,
    kind: "event",
    status: "active",
    content_text:
      "Hier, le user a tres mal dormi et s'est senti vide le lendemain.",
    normalized_summary: "Mauvaise nuit hier, energie tres basse ensuite.",
    domain_keys: ["sante.sommeil", "psychologie.emotions"],
    confidence: 0.86,
    importance_score: 0.74,
    sensitivity_level: "normal",
    source_scope: scope,
    observed_at: start,
    event_start_at: start,
    event_end_at: end,
    time_precision: "day",
    timezone: "Europe/Paris",
    canonical_key: `${runId}:event:sommeil-hier`,
    metadata: { smoke_run_id: runId, smoke_seed: true },
  });
  const work = await insertRow("memory_items", {
    user_id: userId,
    kind: "statement",
    status: "active",
    content_text:
      "Au travail, les reunions avec le manager donnent au user une impression d'humiliation et une forte pression.",
    normalized_summary: "Le manager en reunion active humiliation et pression.",
    domain_keys: ["travail.conflits", "travail.charge", "psychologie.emotions"],
    confidence: 0.84,
    importance_score: 0.8,
    sensitivity_level: "normal",
    source_scope: scope,
    observed_at: nowIso,
    canonical_key: `${runId}:statement:travail-manager`,
    metadata: { smoke_run_id: runId, smoke_seed: true },
  });
  const psych = await insertRow("memory_items", {
    user_id: userId,
    kind: "statement",
    status: "active",
    content_text:
      "Quand il est fatigue ou sous pression, le user se juge vite incapable ou nul.",
    normalized_summary: "Fatigue et pression amplifient l'autodevalorisation.",
    domain_keys: ["psychologie.estime_de_soi", "psychologie.emotions"],
    confidence: 0.82,
    importance_score: 0.78,
    sensitivity_level: "normal",
    source_scope: scope,
    observed_at: nowIso,
    canonical_key: `${runId}:statement:psychologie-autodevalorisation`,
    metadata: { smoke_run_id: runId, smoke_seed: true },
  });
  const action = await insertRow("memory_items", {
    user_id: userId,
    kind: "action_observation",
    status: "active",
    content_text:
      "La marche du soir est une action fragile: elle saute souvent quand la fatigue est haute.",
    normalized_summary: "Marche du soir fragile en periode de fatigue.",
    domain_keys: ["habitudes.execution", "sante.activite_physique"],
    confidence: 0.78,
    importance_score: 0.68,
    sensitivity_level: "normal",
    source_scope: scope,
    observed_at: nowIso,
    canonical_key: `${runId}:action:marche-soir`,
    metadata: { smoke_run_id: runId, smoke_seed: true },
  });
  for (const item of [event, work, psych, action]) seededItemIds.add(item.id);
  await insertRow("memory_item_topics", {
    user_id: userId,
    memory_item_id: event.id,
    topic_id: sommeil.id,
    relation_type: "about",
    confidence: 0.86,
    metadata: { smoke_run_id: runId },
  });
  await insertRow("memory_item_topics", {
    user_id: userId,
    memory_item_id: work.id,
    topic_id: travail.id,
    relation_type: "about",
    confidence: 0.86,
    metadata: { smoke_run_id: runId },
  });
  return {
    topics: { sommeil, travail },
    items: { event, work, psych, action },
  };
}

async function callBrain(user, turn, index) {
  const requestId = `${runId}-${turn.id}`;
  const { body } = await requestJson(`${functionsUrl}/sophia-brain`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${user.accessToken}`,
      "content-type": "application/json",
      "x-request-id": requestId,
    },
    body: JSON.stringify({
      message: turn.message,
      scope,
      channel: "web",
      logMessages: true,
      messageMetadata: {
        smoke_run_id: runId,
        smoke_turn_id: turn.id,
        smoke_turn_index: index,
      },
    }),
  });
  return {
    requestId,
    response: body,
    assistantChars: String(body?.content ?? body?.message ?? "").length,
  };
}

async function callWeeklyReview(userId) {
  if (!internalSecret) {
    return { skipped: true, reason: "missing_internal_secret" };
  }
  const { status, body } = await requestJson(
    `${functionsUrl}/trigger-weekly-memory-review`,
    {
      method: "POST",
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${anonKey}`,
        "content-type": "application/json",
        "x-internal-secret": internalSecret,
        "x-request-id": `${runId}-weekly`,
      },
      body: JSON.stringify({
        force: true,
        dry_run: false,
        user_id: userId,
        user_limit: 1,
        message_limit: 30,
        now_iso: new Date().toISOString(),
      }),
    },
  );
  return { status, body };
}

async function queryByUser(table, userId, extra = "") {
  const suffix = extra ? `&${extra}` : "";
  return rest(`${table}?user_id=eq.${encodeURIComponent(userId)}${suffix}`);
}

function pickLatest(events, name, requestId) {
  return events
    .filter((event) =>
      event.event_name === name &&
      (!requestId || event.request_id === requestId)
    )
    .at(-1) ?? null;
}

function includesId(event, id) {
  const ids = event?.payload?.payload_item_ids;
  return Array.isArray(ids) && ids.includes(id);
}

function assertion(results, ok, name, details = {}) {
  results.push({ ok: Boolean(ok), name, details });
}

async function main() {
  let selected = null;
  const assertions = [];
  try {
    const rollout = await createRolloutUser();
    selected = rollout.user;
    const seeded = await seedMemory(selected.id);
    const turns = [
      { id: "hello", message: "Salut" },
      {
        id: "dated_distress",
        message:
          "Hier je me sentais vraiment pas bien, j'avais super mal dormi et aujourd'hui je suis vide.",
      },
      {
        id: "work_topic",
        message:
          "Au boulot, mon manager m'a encore humilie en reunion, ca me met une pression enorme.",
      },
      {
        id: "global_profile",
        message: "Tu peux me parler de ma psychologie ?",
      },
      {
        id: "action_signal",
        message: "Je n'ai pas fait ma marche hier soir non plus.",
      },
    ];

    const turnResults = [];
    for (let i = 0; i < turns.length; i++) {
      const result = await callBrain(selected, turns[i], i);
      turnResults.push({ ...turns[i], ...result });
    }

    const weeklyReview = await callWeeklyReview(selected.id);
    const events = await queryByUser(
      "memory_observability_events",
      selected.id,
      "select=event_name,source_component,request_id,turn_id,payload,created_at&order=created_at.asc",
    );
    const chatMessages = await queryByUser(
      "chat_messages",
      selected.id,
      `scope=eq.${
        encodeURIComponent(scope)
      }&select=id,role,content,metadata,agent_used,created_at&order=created_at.asc`,
    );
    const memoryItems = await queryByUser(
      "memory_items",
      selected.id,
      "select=id,kind,status,content_text,domain_keys,sensitivity_level,metadata,created_at&order=created_at.asc",
    );
    const extractionRuns = await queryByUser(
      "memory_extraction_runs",
      selected.id,
      "select=id,status,input_message_ids,proposed_item_count,accepted_item_count,rejected_item_count,proposed_entity_count,accepted_entity_count,metadata,started_at,finished_at&order=started_at.asc",
    );
    const processingRows = await queryByUser(
      "memory_message_processing",
      selected.id,
      "select=id,message_id,extraction_run_id,processing_role,processing_status,created_at&order=created_at.asc",
    );

    const byTurn = Object.fromEntries(turnResults.map((turn) => {
      const dispatcher = pickLatest(
        events,
        "dispatcher.memory_plan_generated",
        turn.requestId,
      );
      const active = pickLatest(
        events,
        "memory.runtime.active.loaded",
        turn.requestId,
      );
      return [turn.id, {
        request_id: turn.requestId,
        assistant_chars: turn.assistantChars,
        response_mode: turn.response?.mode ?? null,
        memory_mode: dispatcher?.payload?.memory_plan?.memory_mode ?? null,
        context_need: dispatcher?.payload?.memory_plan?.context_need ?? null,
        retrieval_mode: active?.payload?.retrieval_mode ?? null,
        requested_scopes: active?.payload?.loader_plan_requested_scopes ?? [],
        retrieval_hints: active?.payload?.retrieval_hints ?? [],
        topic_decision: active?.payload?.topic_decision ?? null,
        active_topic_id: active?.payload?.active_topic_id ?? null,
        payload_item_count: active?.payload?.payload_item_count ?? null,
        payload_item_ids: active?.payload?.payload_item_ids ?? [],
        loader_reason: active?.payload?.loader_plan_reason ?? null,
      }];
    }));

    assertion(
      assertions,
      chatMessages.length >= turns.length * 2,
      "chat turns are persisted",
      { chat_messages: chatMessages.length },
    );
    assertion(
      assertions,
      Boolean(pickLatest(events, "dispatcher.memory_plan_generated")),
      "dispatcher memory plans are observable",
      {
        event_count: events.filter((e) =>
          e.event_name === "dispatcher.memory_plan_generated"
        ).length,
      },
    );
    assertion(
      assertions,
      Boolean(pickLatest(events, "memory.runtime.active.loaded")),
      "active loader events are observable",
      {
        event_count: events.filter((e) =>
          e.event_name === "memory.runtime.active.loaded"
        ).length,
      },
    );
    assertion(
      assertions,
      byTurn.hello.memory_mode === "none" ||
        byTurn.hello.payload_item_count === 0,
      "greeting stays low-memory",
      byTurn.hello,
    );
    assertion(
      assertions,
      includesId(
        pickLatest(
          events,
          "memory.runtime.active.loaded",
          byTurn.dated_distress.request_id,
        ),
        seeded.items.event.id,
      ),
      "dated distress loads yesterday event",
      byTurn.dated_distress,
    );
    assertion(
      assertions,
      byTurn.work_topic.requested_scopes.includes("topic") &&
        includesId(
          pickLatest(
            events,
            "memory.runtime.active.loaded",
            byTurn.work_topic.request_id,
          ),
          seeded.items.work.id,
        ),
      "work message loads work memory through V2 retrieval",
      byTurn.work_topic,
    );
    assertion(
      assertions,
      byTurn.global_profile.retrieval_mode === "cross_topic_lookup" &&
        includesId(
          pickLatest(
            events,
            "memory.runtime.active.loaded",
            byTurn.global_profile.request_id,
          ),
          seeded.items.psych.id,
        ),
      "global profile query uses cross-topic memory",
      byTurn.global_profile,
    );
    assertion(
      assertions,
      byTurn.action_signal.requested_scopes.includes("action") &&
        includesId(
          pickLatest(
            events,
            "memory.runtime.active.loaded",
            byTurn.action_signal.request_id,
          ),
          seeded.items.action.id,
        ),
      "action signal loads action observation memory",
      byTurn.action_signal,
    );

    const weeklyUser = weeklyReview?.body?.processed?.find?.((row) =>
      row.user_id === selected.id
    );
    assertion(
      assertions,
      weeklyReview?.body?.ok === true && weeklyUser &&
        weeklyUser.skipped === false,
      "weekly review/memorizer processes smoke user",
      { weekly_review: weeklyReview?.body ?? weeklyReview },
    );
    assertion(
      assertions,
      extractionRuns.length > 0 || processingRows.length > 0 ||
        events.some((event) =>
          String(event.event_name).startsWith("memorizer.")
        ),
      "memorizer leaves persistence traces",
      {
        extraction_runs: extractionRuns.length,
        processing_rows: processingRows.length,
        memorizer_events: events.filter((event) =>
          String(event.event_name).startsWith("memorizer.")
        ).length,
      },
    );

    const memorizerCreatedItems = memoryItems.filter((item) =>
      !seededItemIds.has(item.id)
    );
    const report = {
      ok: assertions.every((item) =>
        item.ok
      ),
      run_id: runId,
      scope,
      user: {
        id: selected.id,
        rollout_bucket: selected.rolloutBucket,
        created_attempts: rollout.attempts.length,
      },
      turns: byTurn,
      db_counts: {
        chat_messages: chatMessages.length,
        memory_items_total: memoryItems.length,
        seeded_memory_items: seededItemIds.size,
        memorizer_created_items: memorizerCreatedItems.length,
        memory_observability_events: events.length,
        extraction_runs: extractionRuns.length,
        memory_message_processing_rows: processingRows.length,
      },
      weekly_review: weeklyReview?.body ?? weeklyReview,
      assertions,
      cleanup: { requested: !keepUser, completed: false },
    };

    if (!keepUser) {
      for (const userId of createdUserIds) await deleteUser(userId);
      report.cleanup.completed = true;
    }

    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
  } catch (error) {
    if (!keepUser) {
      for (const userId of createdUserIds) await deleteUser(userId);
    }
    console.error(JSON.stringify(
      {
        ok: false,
        run_id: runId,
        error: error instanceof Error ? error.message : String(error),
        status: error?.status ?? null,
        body: error?.body ?? null,
        user_id: selected?.id ?? null,
        cleanup: { requested: !keepUser, completed: !keepUser },
      },
      null,
      2,
    ));
    process.exitCode = 1;
  }
}

await main();
