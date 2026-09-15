import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

function argValue(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const persona = "qa-skill";
const connectionName =
  "product_help_dashboard_dashhelp1_c4_initiatives-preferences-base";
const runId = argValue("run-id") || process.env.QA_RUN_ID || "prefarch1-r1";
const date = argValue("date") || process.env.QA_DATE || "2026-05-17";
const scope = `qa-update-coach-preferences-${date}-${runId}`;
const runDir = path.join(root, "tests/real-personas", persona, "runs", "operations");
const baseName = `${date}-update-coach-preferences-${runId}`;
const rawPath = path.join(runDir, `${baseName}.raw.json`);
const summaryPath = path.join(runDir, `${baseName}.summary.json`);
const durablePath = path.join(runDir, `${baseName}.durable.json`);
fs.mkdirSync(runDir, { recursive: true });

const connectionPath = path.join(
  root,
  "tests/real-personas",
  persona,
  "connections",
  `${connectionName}.json`,
);
const baseConnection = JSON.parse(fs.readFileSync(connectionPath, "utf8"));
let connection = { ...baseConnection };
let tempAuthUserId = null;
let tempAuthPassword = null;

function readEnvFile(filePath) {
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    out[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = readEnvFile(path.join(root, "supabase/.env"));
function localStatus() {
  try {
    const raw = execFileSync("/usr/local/bin/supabase", [
      "status",
      "--output",
      "json",
    ], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    return JSON.parse(start >= 0 && end >= start ? raw.slice(start, end + 1) : raw);
  } catch {
    return {};
  }
}
const status = localStatus();
const apiUrl = status.API_URL || env.SUPABASE_URL || "http://127.0.0.1:54321";
const anonKey = status.ANON_KEY || env.SUPABASE_ANON_KEY;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || status.SECRET_KEY ||
  status.SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY;
const jwtSecret = status.JWT_SECRET || env.JWT_SECRET ||
  "super-secret-jwt-token-with-at-least-32-characters-long";
if (!anonKey || !serviceRoleKey) throw new Error("missing local Supabase keys");

async function jsonFetch(url, options, timeoutMs = 180_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw_text: text };
    }
    return { response, body, text };
  } finally {
    clearTimeout(timeout);
  }
}

async function getJwt() {
  const result = tempAuthPassword
    ? await jsonFetch(`${apiUrl}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: connection.email,
        password: tempAuthPassword,
      }),
    })
    : await jsonFetch(`${apiUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({ refresh_token: connection.refresh_token }),
  });
  if (result?.response.ok && result.body?.access_token) {
    return result.body.access_token;
  }
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    aud: "authenticated",
    exp: now + 60 * 60,
    iat: now,
    iss: "supabase-demo",
    sub: connection.user_id,
    email: connection.email ?? "",
    phone: "",
    role: "authenticated",
    aal: "aal1",
    session_id: crypto.randomUUID(),
    app_metadata: {
      provider: "email",
      providers: ["email"],
      is_test_persona: true,
    },
    user_metadata: {
      is_test_persona: true,
    },
  };
  const unsigned = `${Buffer.from(JSON.stringify(header)).toString("base64url")}.${
    Buffer.from(JSON.stringify(payload)).toString("base64url")
  }`;
  const signature = crypto.createHmac("sha256", jwtSecret)
    .update(unsigned)
    .digest("base64url");
  return `${unsigned}.${signature}`;
}

async function ensureTemporaryAuthUser() {
  const email =
    `qa-qa-skill-update-coach-preferences-${runId}@example.com`;
  const password = `Qa1!${crypto.randomUUID()}`;
  const metadata = {
    is_test_persona: true,
    temporary_qa_connection: true,
    persona,
    base_connection: connectionName,
    run_id: runId,
    created_by: "run_update_coach_preferences_qa",
  };
  const created = await jsonFetch(`${apiUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      app_metadata: metadata,
      user_metadata: metadata,
    }),
  });
  if (!created.response.ok || !created.body?.id) {
    throw new Error(
      `temp auth create failed: status=${created.response.status} body=${JSON.stringify(created.body)}`,
    );
  }
  tempAuthUserId = created.body.id;
  tempAuthPassword = password;
  connection = {
    ...connection,
    user_id: tempAuthUserId,
    email,
    refresh_token: null,
  };
}

function encodedUserId() {
  return encodeURIComponent(connection.user_id);
}

async function restGet(table, query) {
  const result = await jsonFetch(`${apiUrl}/rest/v1/${table}?${query}`, {
    method: "GET",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      accept: "application/json",
    },
  });
  return {
    status: result.response.status,
    ok: result.response.ok,
    body: result.body,
  };
}

async function restPatch(table, query, payload) {
  const result = await jsonFetch(`${apiUrl}/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify(payload),
  });
  return { status: result.response.status, ok: result.response.ok };
}

async function restPost(table, payload) {
  const result = await jsonFetch(`${apiUrl}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify(payload),
  });
  return { status: result.response.status, ok: result.response.ok };
}

async function restDelete(table, query) {
  const result = await jsonFetch(`${apiUrl}/rest/v1/${table}?${query}`, {
    method: "DELETE",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      prefer: "return=minimal",
    },
  });
  return { status: result.response.status, ok: result.response.ok };
}

async function deleteTempAuthUser() {
  if (!tempAuthUserId) return { skipped: true };
  const result = await jsonFetch(`${apiUrl}/auth/v1/admin/users/${tempAuthUserId}`, {
    method: "DELETE",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
  });
  return { status: result.response.status, ok: result.response.ok };
}

async function loadPrefs() {
  return await restGet(
    "user_profile_facts",
    `user_id=eq.${encodedUserId()}&scope=eq.global&key=in.(coach.tone,coach.challenge_level,coach.question_tendency)&select=key,value,status,confidence,source_type,reason,updated_at,last_source_message_id`,
  );
}

function valueOf(rows, key) {
  const row = Array.isArray(rows) ? rows.find((item) => item.key === key) : null;
  return row?.value?.value == null ? null : String(row.value.value);
}

function chooseTarget(beforeRows) {
  const requestedKey = argValue("pref-key") || process.env.QA_PREF_KEY;
  const requestedValue = argValue("pref-value") || process.env.QA_PREF_VALUE;
  const requestedUser = argValue("user-message") || process.env.QA_USER_MESSAGE;
  if (requestedKey && requestedValue && requestedUser) {
    return {
      key: requestedKey,
      value: requestedValue,
      user: requestedUser,
    };
  }
  if (valueOf(beforeRows, "coach.tone") !== "direct") {
    return {
      key: "coach.tone",
      value: "direct",
      user: "A partir de maintenant, sois plus directe avec moi, moins arrondie.",
    };
  }
  if (valueOf(beforeRows, "coach.question_tendency") !== "low") {
    return {
      key: "coach.question_tendency",
      value: "low",
      user: "A partir de maintenant, pose-moi beaucoup moins de questions.",
    };
  }
  return {
    key: "coach.challenge_level",
    value: "low",
    user: "A partir de maintenant, challenge-moi moins fort.",
  };
}

function assistantText(body) {
  return String(
    body?.response?.content ?? body?.response?.reply ?? body?.content ?? "",
  );
}

function shortTrace(body) {
  const trace = body.conversation_turn_trace ?? body.trace?.trace ?? body.trace ?? null;
  const routeDecision = trace?.route_decision ?? null;
  const operationFlowRun = trace?.operation_flow_run ?? null;
  const turnFrame = trace?.turn_frame ?? null;
  return {
    http_status: body.__http_status ?? null,
    ok: body.ok ?? null,
    empty_response: body.empty_response ?? null,
    aborted: body.aborted ?? body.response?.aborted ?? false,
    abort_reason: body.abort_reason ?? body.response?.abort_reason ?? null,
    response_owner: trace?.response_owner ?? routeDecision?.response_owner ?? null,
    selected_handler: operationFlowRun?.selected_handler ??
      routeDecision?.selected_handler ?? null,
    route_selected_handler: routeDecision?.selected_handler ?? null,
    route_reason: routeDecision?.reason_code ?? null,
    safety: trace?.safety_pregate ?? null,
    direct_effects: trace?.direct_effects ?? turnFrame?.direct_effects ?? null,
    operation: operationFlowRun ?? null,
    pending_confirmation: trace?.pending_tool_skill_confirmation ??
      turnFrame?.pending_tool_skill_confirmation ?? null,
    memory_plan: trace?.memory_plan ?? null,
    executed_tools: body.response?.executed_tools ?? [],
    tool_execution: body.response?.tool_execution ?? null,
    trace_error: body.trace_error ?? null,
    trace_id: trace?.turn_id ?? null,
  };
}

async function sendTurn(jwt, turn, content, history) {
  const requestId = `qa-update-coach-preferences-${date}-${runId}-t${String(turn).padStart(2, "0")}`;
  const result = await jsonFetch(`${apiUrl}/functions/v1/test-send-message`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${anonKey}`,
      "x-user-authorization": `Bearer ${jwt}`,
      "content-type": "application/json",
      "x-request-id": requestId,
    },
    body: JSON.stringify({
      user_id: connection.user_id,
      channel: "web",
      scope,
      content,
      history,
      disable_debounce: true,
      force_full_ai: true,
    }),
  });
  const body = result.body ?? {};
  body.__http_status = result.response.status;
  const assistant = assistantText(body);
  return {
    turn,
    requestId,
    user: content,
    assistant,
    status: result.response.status,
    body,
    trace: shortTrace(body),
  };
}

function restorePayloadFromBefore(row) {
  return {
    value: row.value,
    status: row.status ?? "active",
    confidence: row.confidence ?? 1,
    source_type: row.source_type ?? "explicit_user",
    reason: row.reason ?? null,
    last_source_message_id: row.last_source_message_id ?? null,
  };
}

async function restorePreference(beforeRows, targetKey) {
  const before = Array.isArray(beforeRows)
    ? beforeRows.find((row) => row.key === targetKey)
    : null;
  const query =
    `user_id=eq.${encodedUserId()}&scope=eq.global&key=eq.${encodeURIComponent(targetKey)}`;
  if (before) {
    return await restPatch("user_profile_facts", query, restorePayloadFromBefore(before));
  }
  return await restPost("user_profile_facts", {
    user_id: connection.user_id,
    scope: "global",
    key: targetKey,
    value: { value: targetKey === "coach.tone" ? "warm_direct" : "normal" },
    status: "active",
    confidence: 1,
    source_type: "qa_restore",
    reason: "QA restore fallback for temporary update_coach_preferences run",
  });
}

const raw = [];
const summary = [];
const history = [];
await ensureTemporaryAuthUser();
const jwt = await getJwt();
const before = await loadPrefs();
const beforeRows = before.body ?? [];
const target = chooseTarget(beforeRows);

const t1 = await sendTurn(jwt, 1, target.user, history);
raw.push(t1);
summary.push({
  turn: t1.turn,
  requestId: t1.requestId,
  user: t1.user,
  assistant: t1.assistant,
  status: t1.status,
  trace: t1.trace,
});
history.push({ role: "user", content: t1.user });
history.push({ role: "assistant", content: t1.assistant });

function appendTurn(turn) {
  raw.push(turn);
  summary.push({
    turn: turn.turn,
    requestId: turn.requestId,
    user: turn.user,
    assistant: turn.assistant,
    status: turn.status,
    trace: turn.trace,
  });
  history.push({ role: "user", content: turn.user });
  history.push({ role: "assistant", content: turn.assistant });
}

function needsConfirmation(turn) {
  return Boolean(turn.trace.pending_confirmation) ||
    turn.trace.operation?.status === "pending_confirmation" ||
    (
      turn.assistant.toLowerCase().includes("applique") &&
      !turn.trace.executed_tools.includes("update_coach_preferences")
    );
}

let latest = t1;
let nextTurn = 2;
const clarifyMessage = argValue("clarify-message") ||
  process.env.QA_CLARIFY_MESSAGE;
if (!needsConfirmation(latest) && clarifyMessage) {
  if (latest.status === 200 && latest.assistant.trim()) {
    latest = await sendTurn(jwt, nextTurn++, clarifyMessage, history);
    appendTurn(latest);
  }
}
if (needsConfirmation(latest)) {
  latest = await sendTurn(
    jwt,
    nextTurn++,
    argValue("confirm-message") || process.env.QA_CONFIRM_MESSAGE ||
      "Oui, applique cette préférence maintenant.",
    history,
  );
  appendTurn(latest);
}
const postConfirmMessage = argValue("post-confirm-message") ||
  process.env.QA_POST_CONFIRM_MESSAGE;
if (
  postConfirmMessage &&
  latest.status === 200 &&
  latest.assistant.trim() &&
  !latest.trace.executed_tools.includes("update_coach_preferences")
) {
  latest = await sendTurn(jwt, nextTurn++, postConfirmMessage, history);
  appendTurn(latest);
}
const finalMessage = argValue("final-message") || process.env.QA_FINAL_MESSAGE;
if (
  finalMessage &&
  latest.status === 200 &&
  latest.assistant.trim() &&
  !latest.trace.executed_tools.includes("update_coach_preferences")
) {
  latest = await sendTurn(jwt, nextTurn++, finalMessage, history);
  appendTurn(latest);
}

const after = await loadPrefs();
const restore = await restorePreference(beforeRows, target.key);
const restored = await loadPrefs();

const durable = {
  connection: {
    persona,
    connection_name: connectionName,
    user_id: connection.user_id,
    scope,
  },
  target,
  before,
  after,
  restore,
  restored,
  chat_messages: await restGet(
    "chat_messages",
    `user_id=eq.${encodedUserId()}&scope=eq.${encodeURIComponent(scope)}&select=id,role,content,metadata,created_at&order=created_at.asc`,
  ),
};

durable.cleanup = {
  chat_messages: await restDelete("chat_messages", `user_id=eq.${encodedUserId()}`),
  user_profile_facts: await restDelete(
    "user_profile_facts",
    `user_id=eq.${encodedUserId()}&source_type=eq.explicit_user`,
  ),
  auth_user: await deleteTempAuthUser(),
};

fs.writeFileSync(rawPath, `${JSON.stringify(raw, null, 2)}\n`);
fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
fs.writeFileSync(durablePath, `${JSON.stringify(durable, null, 2)}\n`);

console.log(JSON.stringify({
  run_id: runId,
  scope,
  target,
  turns: summary.map((turn) => ({
    turn: turn.turn,
    status: turn.status,
    selected_handler: turn.trace.selected_handler,
    response_owner: turn.trace.response_owner,
    tool_execution: turn.trace.tool_execution,
    executed_tools: turn.trace.executed_tools,
    has_pending_confirmation: Boolean(turn.trace.pending_confirmation),
    assistant_preview: turn.assistant.replace(/\s+/g, " ").slice(0, 500),
  })),
  before_value: valueOf(beforeRows, target.key),
  after_value: valueOf(after.body ?? [], target.key),
  restored_value: valueOf(restored.body ?? [], target.key),
  restore_ok: restore.ok,
  rawPath,
  summaryPath,
  durablePath,
}, null, 2));
