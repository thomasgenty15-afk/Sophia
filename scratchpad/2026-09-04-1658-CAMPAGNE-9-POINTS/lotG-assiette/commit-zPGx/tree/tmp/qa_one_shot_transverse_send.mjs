import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const persona = "qa-skill";

function usage() {
  console.error(
    "usage: node tmp/qa_one_shot_transverse_send.mjs <send|durable|cleanup> <connection_name> <run_id> [turn_no] [message...]",
  );
  process.exit(2);
}

const [command, connectionName, runId, turnNoRaw, ...messageParts] = process
  .argv.slice(2);
if (!command || !connectionName || !runId) usage();

const runDir = path.join(
  root,
  "tmp/qa-one-shot-transverse",
  runId,
);
fs.mkdirSync(runDir, { recursive: true });
const rawPath = path.join(runDir, "raw.jsonl");
const durablePath = path.join(runDir, "durable.json");
const cleanupPath = path.join(runDir, "cleanup.txt");
const connectionPath = path.join(
  root,
  "tests/real-personas/qa-skill/connections",
  `${connectionName}.json`,
);

function parseStatus() {
  const raw = execFileSync("supabase", ["status", "--output", "json"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  return JSON.parse(start >= 0 && end >= start ? raw.slice(start, end + 1) : raw);
}

async function jsonFetch(url, options = {}, timeoutMs = 180_000) {
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
    return { response, text, body };
  } finally {
    clearTimeout(timeout);
  }
}

function readConnection() {
  return JSON.parse(fs.readFileSync(connectionPath, "utf8"));
}

function headers(key) {
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    "content-type": "application/json",
    accept: "application/json",
  };
}

function encode(value) {
  return encodeURIComponent(String(value));
}

function assistantText(body) {
  return String(
    body?.response?.content ??
      body?.response?.reply ??
      body?.content ??
      body?.message ??
      "",
  ).trim();
}

function traceFromBody(body) {
  return body?.conversation_turn_trace ?? body?.trace?.trace ?? body?.trace ??
    null;
}

function operationFromTrace(trace, body) {
  return trace?.tool_skill_run ??
    trace?.operation_flow_run ??
    body?.response?.tool_skill_run ??
    body?.tool_skill_run ??
    null;
}

function shortTrace(body) {
  const trace = traceFromBody(body) ?? {};
  const route = trace.route_decision ?? {};
  const turnFrame = trace.turn_frame ?? {};
  const skillRun = trace.skill_run ?? {};
  const toolRun = operationFromTrace(trace, body) ?? {};
  return {
    response_owner: trace.response_owner ?? route.response_owner ?? null,
    selected_handler: route.selected_handler ?? null,
    route_reason: route.reason_code ?? null,
    safety: turnFrame.safety ?? null,
    direct_effects_to_run: route.direct_effects_to_run ?? [],
    direct_effect_lane: turnFrame.direct_effect_lane ?? toolRun.direct_effect_lane ??
      null,
    skill_run: skillRun,
    tool_skill_run: toolRun,
    executed_tools: body?.response?.executed_tools ??
      toolRun.executed_tools ??
      toolRun.executedTools ??
      [],
    tool_execution: body?.response?.tool_execution ?? toolRun.toolExecution ??
      null,
    memory_plan: turnFrame.memory_plan ?? null,
  };
}

async function accessToken(apiUrl, anonKey, connection) {
  const auth = await jsonFetch(`${apiUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: anonKey, "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: connection.refresh_token }),
  });
  if (!auth.response.ok || !auth.body?.access_token) {
    throw new Error(`auth failed ${auth.response.status}: ${auth.text}`);
  }
  const verify = await jsonFetch(`${apiUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, authorization: `Bearer ${auth.body.access_token}` },
  });
  if (!verify.response.ok) {
    throw new Error(`auth verify failed ${verify.response.status}: ${verify.text}`);
  }
  return auth.body.access_token;
}

async function readDurable(apiUrl, serviceRoleKey, userId) {
  const [checkins, messages, state] = await Promise.all([
    jsonFetch(
      `${apiUrl}/rest/v1/scheduled_checkins?user_id=eq.${encode(userId)}&select=id,status,scheduled_for,event_context,message_payload,created_at&order=created_at.asc`,
      { headers: headers(serviceRoleKey) },
    ),
    jsonFetch(
      `${apiUrl}/rest/v1/chat_messages?user_id=eq.${encode(userId)}&select=id,role,content,metadata,created_at&order=created_at.asc`,
      { headers: headers(serviceRoleKey) },
    ),
    jsonFetch(
      `${apiUrl}/rest/v1/user_chat_states?user_id=eq.${encode(userId)}&select=user_id,current_mode,risk_level,temp_memory,updated_at`,
      { headers: headers(serviceRoleKey) },
    ),
  ]);
  return {
    scheduled_checkins: checkins.body,
    chat_messages_count: Array.isArray(messages.body) ? messages.body.length : null,
    chat_messages: Array.isArray(messages.body)
      ? messages.body.map((row) => ({
        role: row.role,
        content: row.content,
        created_at: row.created_at,
        metadata: {
          request_id: row.metadata?.request_id ?? null,
          route_owner: row.metadata?.route_owner ?? null,
          selected_handler: row.metadata?.selected_handler ?? null,
          tool_execution: row.metadata?.tool_execution ?? null,
        },
      }))
      : messages.body,
    user_chat_state: Array.isArray(state.body) ? state.body[0] ?? null : state.body,
  };
}

async function sendTurn() {
  const turnNo = Number(turnNoRaw);
  const content = messageParts.join(" ").trim();
  if (!Number.isFinite(turnNo) || turnNo <= 0 || !content) usage();
  const status = parseStatus();
  const connection = readConnection();
  const apiUrl = status.API_URL;
  const anonKey = status.ANON_KEY;
  const serviceRoleKey = status.SERVICE_ROLE_KEY || status.SECRET_KEY;
  const token = await accessToken(apiUrl, anonKey, connection);
  const scope = `qa-${runId}`;
  const requestId = `qa-${runId}-t${String(turnNo).padStart(2, "0")}`;
  const previous = fs.existsSync(rawPath)
    ? fs.readFileSync(rawPath, "utf8").trim().split("\n").filter(Boolean).map((
      line,
    ) => JSON.parse(line))
    : [];
  const history = previous.flatMap((turn) =>
    [
      { role: "user", content: turn.user },
      ...(turn.assistant ? [{ role: "assistant", content: turn.assistant }] : []),
    ]
  );
  const body = {
    user_id: connection.user_id,
    channel: "web",
    scope,
    content,
    history,
    disable_debounce: true,
    force_full_ai: true,
    client_timezone: process.env.QA_CLIENT_TIMEZONE || "Europe/Paris",
    include_trace: true,
    include_debug: true,
  };
  const result = await jsonFetch(`${apiUrl}/functions/v1/test-send-message`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${anonKey}`,
      "x-user-authorization": `Bearer ${token}`,
      "content-type": "application/json",
      "x-request-id": requestId,
    },
    body: JSON.stringify(body),
  });
  const assistant = assistantText(result.body);
  const durable = await readDurable(apiUrl, serviceRoleKey, connection.user_id);
  const record = {
    run_id: runId,
    connection_name: connectionName,
    user_id: connection.user_id,
    email: connection.email,
    scope,
    turn: turnNo,
    request_id: requestId,
    user: content,
    assistant,
    http_status: result.response.status,
    ok: result.response.ok,
    short_trace: shortTrace(result.body),
    raw_body: result.body,
    durable_after_turn: durable,
    created_at: new Date().toISOString(),
  };
  fs.appendFileSync(rawPath, `${JSON.stringify(record)}\n`);
  fs.writeFileSync(durablePath, `${JSON.stringify(durable, null, 2)}\n`);
  console.log(JSON.stringify({
    turn: turnNo,
    http_status: record.http_status,
    assistant,
    short_trace: record.short_trace,
    scheduled_checkins: durable.scheduled_checkins,
    raw_path: rawPath,
    durable_path: durablePath,
  }, null, 2));
}

async function durable() {
  const status = parseStatus();
  const connection = readConnection();
  const durable = await readDurable(
    status.API_URL,
    status.SERVICE_ROLE_KEY || status.SECRET_KEY,
    connection.user_id,
  );
  fs.writeFileSync(durablePath, `${JSON.stringify(durable, null, 2)}\n`);
  console.log(JSON.stringify({ durable_path: durablePath, durable }, null, 2));
}

function cleanup() {
  const output = execFileSync(
    "bash",
    ["scripts/qa-cleanup-run-connection.sh", persona, connectionName],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  fs.writeFileSync(cleanupPath, output);
  console.log(output.trim());
}

if (command === "send") {
  await sendTurn();
} else if (command === "durable") {
  await durable();
} else if (command === "cleanup") {
  cleanup();
} else {
  usage();
}
