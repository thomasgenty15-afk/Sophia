import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const persona = "qa-skill";
const skill = "demotivation_repair";
const date = process.env.QA_DATE || "2026-06-11";
const runId = String(process.env.QA_RUN_ID || "").trim();
const connectionName = String(process.env.QA_CONNECTION_NAME || skill).trim();
const turn = Number(process.env.QA_TURN || 0);
const content = String(process.env.QA_CONTENT || "").trim();
const apiUrl = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const anonKey = process.env.SUPABASE_ANON_KEY || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const fetchTimeoutMs = Number(process.env.QA_FETCH_TIMEOUT_MS || 180_000);

if (!runId || !turn || !content) {
  throw new Error("missing QA_RUN_ID, QA_TURN or QA_CONTENT");
}
if (!anonKey) {
  throw new Error("missing SUPABASE_ANON_KEY");
}

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const runDir = path.join(root, "tests/real-personas/qa-skill/runs/operations");
const connectionPath = path.join(
  root,
  "tests/real-personas/qa-skill/connections",
  `${connectionName}.json`,
);
const connection = JSON.parse(fs.readFileSync(connectionPath, "utf8"));

const baseName = `${date}-${runId}`;
const rawPath = path.join(runDir, `${baseName}.raw.json`);
const summaryPath = path.join(runDir, `${baseName}.summary.json`);
const durablePath = path.join(runDir, `${baseName}.durable.json`);

function readJsonArray(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Array.isArray(parsed) ? parsed : [];
}

async function jsonFetch(url, options, timeoutMs = fetchTimeoutMs) {
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

function assistantText(body) {
  return String(
    body?.response?.content ??
      body?.response?.reply ??
      body?.content ??
      "",
  );
}

async function getUserJwt() {
  if (connection.refresh_token) {
    const result = await jsonFetch(`${apiUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({ refresh_token: connection.refresh_token }),
    });
    if (result.response.ok && result.body?.access_token) {
      return { jwt: result.body.access_token, authMethod: "refresh_token" };
    }
  }

  if (!connection.email || !connection.password) {
    throw new Error("connection has no valid refresh_token or email/password");
  }
  const result = await jsonFetch(`${apiUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email: connection.email,
      password: connection.password,
    }),
  });
  if (!result.response.ok || !result.body?.access_token) {
    throw new Error(`password login failed: ${result.text}`);
  }
  return { jwt: result.body.access_token, authMethod: "password" };
}

async function restSelect(table, query) {
  if (!serviceRoleKey) return { skipped: "missing_service_role_key" };
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

function extractLocalDispatcherRun(trace) {
  return (
    trace?.operation_flow_run ??
    trace?.tool_skill_run ??
    trace?.local_dispatcher_run ??
    trace?.active_flow_run ??
    null
  );
}

function extractNoteInformation(operationFlowRun) {
  return (
    operationFlowRun?.note_information ??
    operationFlowRun?.dispatcher_output?.note_information ??
    operationFlowRun?.reducer_output?.note_information ??
    operationFlowRun?.handoff?.note_information ??
    null
  );
}

fs.mkdirSync(runDir, { recursive: true });

const existingSummary = readJsonArray(summaryPath);
const history = [];
for (const item of existingSummary.slice(-16)) {
  if (item.user) history.push({ role: "user", content: item.user });
  if (item.assistant) history.push({ role: "assistant", content: item.assistant });
}

const { jwt, authMethod } = await getUserJwt();
const scope = `qa-demotivation-repair-${date}-${runId}`;
const requestId = `qa-demotivation-repair-${date}-${runId}-t${
  String(turn).padStart(2, "0")
}`;

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
    include_trace: true,
  }),
});

const body = result.body ?? {};
const response = body.response ?? {};
const trace = body.conversation_turn_trace ?? body.trace?.trace ?? body.trace ?? null;
const routeDecision = trace?.route_decision ?? null;
const turnFrame = trace?.turn_frame ?? null;
const operationFlowRun = extractLocalDispatcherRun(trace);
const noteInformation = extractNoteInformation(operationFlowRun);
const text = assistantText(body);

const raw = readJsonArray(rawPath);
raw.push({
  turn,
  requestId,
  auth_method: authMethod,
  user: content,
  status: result.response.status,
  body,
});
fs.writeFileSync(rawPath, `${JSON.stringify(raw, null, 2)}\n`);

const summary = existingSummary;
summary.push({
  turn,
  requestId,
  status: result.response.status,
  ok: body.ok ?? null,
  user: content,
  assistant: text,
  aborted: body.aborted ?? response.aborted ?? false,
  abort_reason: body.abort_reason ?? response.abort_reason ?? null,
  empty_response: text.trim().length === 0,
  response_owner: trace?.response_owner ?? routeDecision?.response_owner ?? null,
  selected_handler:
    operationFlowRun?.selected_handler ??
    routeDecision?.selected_handler ??
    routeDecision?.skill_choisi ??
    null,
  route_reason:
    routeDecision?.reason_code ??
    routeDecision?.reason ??
    routeDecision?.route_reason ??
    null,
  active_flow_arbitration: trace?.active_flow_arbitration ?? null,
  local_flow_action:
    operationFlowRun?.flow_action ??
    operationFlowRun?.dispatcher_output?.flow_action ??
    operationFlowRun?.reducer_output?.flow_action ??
    null,
  local_visible_task_kind:
    operationFlowRun?.visible_task?.kind ??
    operationFlowRun?.dispatcher_output?.visible_task?.kind ??
    operationFlowRun?.reducer_output?.visible_task?.kind ??
    null,
  note_information: noteInformation,
  safety_pregate: trace?.safety_pregate ?? null,
  tone_adjustment:
    turnFrame?.tone_adjustment ??
    routeDecision?.tone_adjustment ??
    null,
  direct_effects: trace?.direct_effects ?? turnFrame?.direct_effects ?? null,
  pending_confirmation:
    trace?.pending_tool_skill_confirmation ??
    turnFrame?.pending_tool_skill_confirmation ??
    null,
  memory_write_candidates_emitted:
    trace?.memory_write_candidates_emitted ?? null,
  memory_plan: trace?.memory_plan ?? null,
  response_executed_tools: response.executed_tools ?? trace?.executed_tools ?? [],
  tool_execution: response.tool_execution ?? trace?.tool_execution ?? null,
  trace_id: trace?.turn_id ?? trace?.trace_id ?? requestId,
  trace_error: body.trace_error ?? null,
  operation_flow_run: operationFlowRun,
});
fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);

const userId = encodeURIComponent(connection.user_id);
const encodedScope = encodeURIComponent(scope);
const durable = {
  chat_messages: await restSelect(
    "chat_messages",
    `user_id=eq.${userId}&scope=eq.${encodedScope}&select=id,role,content,scope,metadata,created_at&order=created_at.asc`,
  ),
  memory_items: await restSelect(
    "memory_items",
    `user_id=eq.${userId}&select=*&limit=20`,
  ),
  scheduled_checkins: await restSelect(
    "scheduled_checkins",
    `user_id=eq.${userId}&select=*&limit=20`,
  ),
  user_recurring_reminders: await restSelect(
    "user_recurring_reminders",
    `user_id=eq.${userId}&select=*&limit=20`,
  ),
};
fs.writeFileSync(durablePath, `${JSON.stringify(durable, null, 2)}\n`);

console.log(
  JSON.stringify(
    {
      turn,
      status: result.response.status,
      ok: body.ok ?? null,
      empty_response: text.trim().length === 0,
      aborted: body.aborted ?? response.aborted ?? false,
      response_owner: trace?.response_owner ?? routeDecision?.response_owner ?? null,
      selected_handler:
        operationFlowRun?.selected_handler ??
        routeDecision?.selected_handler ??
        routeDecision?.skill_choisi ??
        null,
      route_reason:
        routeDecision?.reason_code ??
        routeDecision?.reason ??
        routeDecision?.route_reason ??
        null,
      local_flow_action:
        operationFlowRun?.flow_action ??
        operationFlowRun?.dispatcher_output?.flow_action ??
        operationFlowRun?.reducer_output?.flow_action ??
        null,
      local_visible_task_kind:
        operationFlowRun?.visible_task?.kind ??
        operationFlowRun?.dispatcher_output?.visible_task?.kind ??
        operationFlowRun?.reducer_output?.visible_task?.kind ??
        null,
      has_note_information: Boolean(noteInformation),
      risk_band: trace?.safety_pregate?.risk_band ?? null,
      content_preview: text.replace(/\s+/g, " ").slice(0, 900),
      rawPath,
      summaryPath,
      durablePath,
    },
    null,
    2,
  ),
);
