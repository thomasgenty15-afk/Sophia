import fs from "node:fs";
import crypto from "node:crypto";

const root = "/Users/ahmedamara/Dev/Sophia 2";
const persona = "qa-skill";
const connectionName = process.env.SOPHIA_QA_CONNECTION_NAME ??
  "status_recap_status_recap_20260612_r4";
const runId = process.env.SOPHIA_QA_RUN_ID ?? "status-recap-real-r4";
const runSlug = process.env.SOPHIA_QA_RUN_SLUG ??
  "2026-06-12-status-recap-real-r4";
const scope = `qa-status-recap-${runSlug}`;
const connectionPath =
  `${root}/tests/real-personas/${persona}/connections/${connectionName}.json`;
const outDir = `${root}/tests/real-personas/${persona}/runs/status_recap`;
const rawPath = `${outDir}/${runSlug}.raw.json`;
const durablePath = `${outDir}/${runSlug}.durable.json`;
const cleanupPath = `${outDir}/${runSlug}.cleanup.json`;

function statusEnv() {
  const status = {
    ANON_KEY: process.env.SOPHIA_QA_SUPABASE_ANON_KEY ?? "",
    SERVICE_ROLE_KEY: process.env.SOPHIA_QA_SUPABASE_SERVICE_ROLE_KEY ?? "",
    API_URL: process.env.SOPHIA_QA_SUPABASE_API_URL ??
      "http://127.0.0.1:54321",
    REST_URL: process.env.SOPHIA_QA_SUPABASE_REST_URL ??
      "http://127.0.0.1:54321/rest/v1",
    FUNCTIONS_URL: process.env.SOPHIA_QA_SUPABASE_FUNCTIONS_URL ??
      "http://127.0.0.1:54321/functions/v1",
  };
  if (!status.ANON_KEY || !status.SERVICE_ROLE_KEY) {
    throw new Error("missing QA Supabase env keys");
  }
  return status;
}

async function jsonFetch(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
  const response = await fetch(url, { ...options, signal: controller.signal });
  clearTimeout(timeout);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { response, body, text };
}

function restHeaders(key, extra = {}) {
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    "content-type": "application/json",
    ...extra,
  };
}

async function restSelect(status, table, query) {
  const { response, body } = await jsonFetch(
    `${status.REST_URL}/${table}${query}`,
    { headers: restHeaders(status.SERVICE_ROLE_KEY) },
  );
  return response.ok ? body : body;
}

async function restInsert(status, table, rows) {
  const { response, body, text } = await jsonFetch(`${status.REST_URL}/${table}`, {
    method: "POST",
    headers: restHeaders(status.SERVICE_ROLE_KEY, {
      prefer: "return=representation",
    }),
    body: JSON.stringify(rows),
  });
  if (!response.ok) {
    throw new Error(`insert ${table} failed: ${response.status} ${text}`);
  }
  return body;
}

async function restDeleteQuery(status, table, query) {
  const { response, text } = await jsonFetch(
    `${status.REST_URL}/${table}${query}`,
    {
      method: "DELETE",
      headers: restHeaders(status.SERVICE_ROLE_KEY, {
        prefer: "return=minimal",
      }),
    },
  );
  return { status: response.status, ok: response.ok, text };
}

async function restPatchChatState(status, userId) {
  const { response, text } = await jsonFetch(
    `${status.REST_URL}/user_chat_states?user_id=eq.${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: restHeaders(status.SERVICE_ROLE_KEY, {
        prefer: "return=minimal",
      }),
      body: JSON.stringify({
        current_mode: "companion",
        risk_level: 0,
        investigation_state: null,
        short_term_context: "",
        unprocessed_msg_count: 0,
        temp_memory: {},
      }),
    },
  );
  return { status: response.status, ok: response.ok, text };
}

function fixtureUuid(label) {
  const hex = crypto.createHash("sha256").update(label).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${
    hex.slice(17, 20)
  }-${hex.slice(20, 32)}`;
}

function fixtureCleanupQueries(userId) {
  const encodedUser = encodeURIComponent(userId);
  const encodedScope = encodeURIComponent(scope);
  return {
    chat_messages:
      `?user_id=eq.${encodedUser}&scope=eq.${encodedScope}`,
    scheduled_checkins:
      `?user_id=eq.${encodedUser}&event_context=like.${encodeURIComponent(`one_shot_reminder:${runSlug}:%`)}`,
    user_recurring_reminders:
      `?user_id=eq.${encodedUser}&id=eq.${fixtureUuid(`${runSlug}:recurring`)}`,
    user_profile_facts:
      `?user_id=eq.${encodedUser}&key=eq.coach.tone`,
  };
}

async function cleanupRunFixtures(status, userId) {
  const queries = fixtureCleanupQueries(userId);
  return {
    chat_messages: await restDeleteQuery(
      status,
      "chat_messages",
      queries.chat_messages,
    ),
    scheduled_checkins: await restDeleteQuery(
      status,
      "scheduled_checkins",
      queries.scheduled_checkins,
    ),
    user_recurring_reminders: await restDeleteQuery(
      status,
      "user_recurring_reminders",
      queries.user_recurring_reminders,
    ),
    user_profile_facts: await restDeleteQuery(
      status,
      "user_profile_facts",
      queries.user_profile_facts,
    ),
  };
}

async function login(status, connection) {
  const { response, body } = await jsonFetch(
    `${status.API_URL}/auth/v1/token?grant_type=refresh_token`,
    {
      method: "POST",
      headers: {
        apikey: status.ANON_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({ refresh_token: connection.refresh_token }),
    },
  );
  if (!response.ok || !body?.access_token) {
    throw new Error(`refresh login failed: ${JSON.stringify(body)}`);
  }
  return body.access_token;
}

function traceShort(body) {
  const response = body?.response ?? {};
  const trace = response?.conversation_turn_trace ?? {};
  const route = trace.route_decision ?? {};
  const skill = trace.tool_skill_run ?? {};
  return {
    response_owner: route.response_owner ?? null,
    selected_handler: route.selected_handler ?? skill.selected_handler ?? null,
    route_reason: route.reason_code ?? null,
    blocked_paths: route.blocked_paths ?? [],
    safety: trace.turn_frame?.safety ?? null,
    direct_effects: route.direct_effects_to_run ?? [],
    operation: skill.selected_handler ?? null,
    pending_confirmation: response.pending_confirmation ?? null,
    memory_plan: trace.memory_plan ?? null,
    executed_tools: response.executed_tools ?? [],
    durable_effect: response.durable_effect ?? null,
    flow_action: skill.flow_action ?? null,
    visible_task: skill.visible_task_kind ?? skill.visible_task?.kind ?? null,
    reason_code: skill.reason_code ?? null,
    projection_summary: skill.projection_summary ??
      skill.conversation_context?.projection_summary ?? null,
  };
}

async function sendTurn(status, accessToken, turn, user) {
  const requestId = `qa-${runSlug}-t${String(turn).padStart(2, "0")}`;
  const { response, body, text } = await jsonFetch(
    `${status.FUNCTIONS_URL}/test-send-message`,
    {
      method: "POST",
      headers: {
        apikey: status.ANON_KEY,
        authorization: `Bearer ${status.ANON_KEY}`,
        "x-user-authorization": `Bearer ${accessToken}`,
        "content-type": "application/json",
        "x-request-id": requestId,
      },
      body: JSON.stringify({
        message: user,
        channel: "web",
        scope,
        request_id: requestId,
        force_full_ai: true,
        disable_debounce: true,
        include_trace: true,
        client_now_iso: "2026-06-12T10:00:00.000+02:00",
      }),
      timeoutMs: 120_000,
    },
  );
  return {
    turn,
    request_id: requestId,
    user,
    assistant: body?.response?.content ?? body?.content ?? "",
    http_status: response.status,
    ok: response.ok && body?.ok !== false,
    raw_body: body,
    raw_text_if_unparsed: body?.raw ? text : undefined,
    trace_short: traceShort(body),
  };
}

async function main() {
  console.log(JSON.stringify({ stage: "start", run_id: runId }));
  fs.mkdirSync(outDir, { recursive: true });
  const status = statusEnv();
  const connection = JSON.parse(fs.readFileSync(connectionPath, "utf8"));
  const userId = connection.user_id;

  console.log(JSON.stringify({ stage: "cleanup_before_seed" }));
  await cleanupRunFixtures(status, userId);
  await restPatchChatState(status, userId);

  const now = "2026-06-12T08:00:00.000Z";
  const pendingId = fixtureUuid(`${runSlug}:pending`);
  const cancelledId = fixtureUuid(`${runSlug}:cancelled`);
  const recurringId = fixtureUuid(`${runSlug}:recurring`);

  console.log(JSON.stringify({ stage: "seed" }));
  const seed = {
    checkins: await restInsert(status, "scheduled_checkins", [
      {
        id: pendingId,
        user_id: userId,
        event_context: `one_shot_reminder:${runSlug}:pending`,
        scheduled_for: "2026-06-13T07:30:00.000Z",
        status: "pending",
        message_mode: "static",
        message_payload: {
          source: runSlug,
          reminder_instruction: "relire le dossier budget",
        },
        origin: "unknown",
      },
      {
        id: cancelledId,
        user_id: userId,
        event_context: `one_shot_reminder:${runSlug}:cancelled`,
        scheduled_for: "2026-06-11T15:00:00.000Z",
        status: "cancelled",
        message_mode: "static",
        message_payload: {
          source: runSlug,
          reminder_instruction: "ancien rappel annulé de devis",
        },
        origin: "unknown",
      },
    ]),
    recurring: await restInsert(status, "user_recurring_reminders", [{
      id: recurringId,
      user_id: userId,
      status: "active",
      message_instruction: "faire le point hebdo",
      local_time_hhmm: "08:45",
      scheduled_days: ["mon"],
      created_at: now,
      updated_at: now,
    }]),
    prefs: await restInsert(status, "user_profile_facts", [{
      user_id: userId,
      scope: "global",
      key: "coach.tone",
      value: { value: "warm_direct" },
      status: "active",
      confidence: 0.98,
      source_type: "explicit_user",
      reason: `QA fixture ${runSlug}`,
      created_at: now,
      updated_at: now,
      version: 1,
      previous_values: [],
    }]),
  };

  const beforeRows = {
    scheduled_checkins: await restSelect(status, "scheduled_checkins", `?user_id=eq.${encodeURIComponent(userId)}&select=id,event_context,scheduled_for,status,message_payload&order=scheduled_for.asc`),
    recurring: await restSelect(status, "user_recurring_reminders", `?user_id=eq.${encodeURIComponent(userId)}&select=id,status,message_instruction,local_time_hhmm,scheduled_days,updated_at`),
    coach_preferences: await restSelect(status, "user_profile_facts", `?user_id=eq.${encodeURIComponent(userId)}&select=key,value,status,source_type,reason,updated_at`),
    chat_state: await restSelect(status, "user_chat_states", `?user_id=eq.${encodeURIComponent(userId)}&select=temp_memory,current_mode,risk_level`),
  };

  console.log(JSON.stringify({ stage: "login" }));
  const accessToken = await login(status, connection);
  const messages = [
    "Tu peux me dire simplement ce qui est vraiment enregistré dans mon espace, sans rien changer ?",
    "Oui, fais-moi le point maintenant, en restant juste factuel.",
    "Et pour les rappels annulés, tu vois quelque chose ou pas ?",
    "Sur quoi tu t'appuies pour ce récap ?",
  ];
  const turns = [];
  for (let i = 0; i < messages.length; i += 1) {
    const turn = await sendTurn(status, accessToken, i + 1, messages[i]);
    turns.push(turn);
    console.log(JSON.stringify({
      turn: turn.turn,
      http_status: turn.http_status,
      selected_handler: turn.trace_short.selected_handler,
      route_reason: turn.trace_short.route_reason,
      flow_action: turn.trace_short.flow_action,
      visible_task: turn.trace_short.visible_task,
      assistant: turn.assistant.slice(0, 240),
    }));
  }

  const afterRows = {
    scheduled_checkins: await restSelect(status, "scheduled_checkins", `?user_id=eq.${encodeURIComponent(userId)}&select=id,event_context,scheduled_for,status,message_payload&order=scheduled_for.asc`),
    recurring: await restSelect(status, "user_recurring_reminders", `?user_id=eq.${encodeURIComponent(userId)}&select=id,status,message_instruction,local_time_hhmm,scheduled_days,updated_at`),
    coach_preferences: await restSelect(status, "user_profile_facts", `?user_id=eq.${encodeURIComponent(userId)}&select=key,value,status,source_type,reason,updated_at`),
    chat_messages: await restSelect(status, "chat_messages", `?user_id=eq.${encodeURIComponent(userId)}&select=role,content,scope,created_at&order=created_at.asc`),
    chat_state: await restSelect(status, "user_chat_states", `?user_id=eq.${encodeURIComponent(userId)}&select=temp_memory,current_mode,risk_level`),
  };

  const raw = {
    run_id: runId,
    date: "2026-06-12",
    persona,
    connection_name: connectionName,
    user_id: userId,
    email: connection.email,
    scope,
    endpoint: "/functions/v1/test-send-message",
    force_full_ai: true,
    auth: {
      method: "refresh_token_to_access_token",
      token_verified: true,
      jwt_redacted: true,
    },
    seed,
    before_rows: beforeRows,
    turns,
    after_rows: afterRows,
  };
  fs.writeFileSync(rawPath, `${JSON.stringify(raw, null, 2)}\n`);
  fs.writeFileSync(durablePath, `${JSON.stringify({ seed, before_rows: beforeRows, after_rows: afterRows }, null, 2)}\n`);

  const cleanup = {
    ...(await cleanupRunFixtures(status, userId)),
    user_chat_states_patch: await restPatchChatState(status, userId),
  };
  cleanup.verify = {
    chat_messages: await restSelect(status, "chat_messages", `?user_id=eq.${encodeURIComponent(userId)}&select=id`),
    scheduled_checkins: await restSelect(status, "scheduled_checkins", `?user_id=eq.${encodeURIComponent(userId)}&select=id`),
    user_recurring_reminders: await restSelect(status, "user_recurring_reminders", `?user_id=eq.${encodeURIComponent(userId)}&select=id`),
    user_profile_facts: await restSelect(status, "user_profile_facts", `?user_id=eq.${encodeURIComponent(userId)}&select=key`),
    user_chat_states: await restSelect(status, "user_chat_states", `?user_id=eq.${encodeURIComponent(userId)}&select=temp_memory,current_mode,risk_level`),
  };
  fs.writeFileSync(cleanupPath, `${JSON.stringify(cleanup, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
