import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const persona = "qa-skill";
const date = process.env.QA_DATE || "2026-06-12";
const runId = String(process.env.QA_RUN_ID || "").trim();
const connectionName = String(process.env.QA_CONNECTION_NAME || "").trim();
const turn = Number(process.env.QA_TURN || 0);
const content = String(process.env.QA_CONTENT || "").trim();
let apiUrl = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
let anonKey = process.env.SUPABASE_ANON_KEY || "";
let serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const fetchTimeoutMs = Number(process.env.QA_FETCH_TIMEOUT_MS || 180_000);

if (!runId || !connectionName || !turn || !content) {
  throw new Error("missing QA_RUN_ID, QA_CONNECTION_NAME, QA_TURN or QA_CONTENT");
}
const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

if (!anonKey || !serviceRoleKey || !apiUrl) {
  const statusText = execFileSync("supabase", ["status", "--output", "json"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const status = JSON.parse(statusText);
  apiUrl = apiUrl || status.API_URL || "http://127.0.0.1:54321";
  anonKey = anonKey || status.ANON_KEY || "";
  serviceRoleKey = serviceRoleKey || status.SERVICE_ROLE_KEY ||
    status.SECRET_KEY || "";
}

if (!anonKey) {
  throw new Error("missing SUPABASE_ANON_KEY");
}
const runDir = path.join(root, "tests/real-personas/qa-skill/runs/clarification");
const connectionPath = path.join(
  root,
  "tests/real-personas/qa-skill/connections",
  `${connectionName}.json`,
);
const connection = JSON.parse(fs.readFileSync(connectionPath, "utf8"));

const baseName = `${date}-clarification-local-flow-${runId}`;
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

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function extractClarificationRun(trace) {
  return (
    trace?.clarification_flow_run ??
    trace?.orientation_clarification_run ??
    trace?.local_dispatcher_run ??
    null
  );
}

function extractToolSkillRun(trace) {
  return trace?.tool_skill_run ?? trace?.operation_flow_run ?? null;
}

function extractNoteInformation(trace, localRun, toolRun) {
  return (
    trace?.note_information ??
    localRun?.note_information ??
    localRun?.dispatcher_output?.note_information ??
    localRun?.reducer_output?.note_information ??
    toolRun?.note_information ??
    toolRun?.dispatcher_output?.note_information ??
    toolRun?.reducer_output?.note_information ??
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
const scope = `qa-clarification-local-${date}-${runId}`;
const requestId = `qa-clarification-local-${runId}-t${String(turn).padStart(2, "0")}`;

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
const clarificationRun = extractClarificationRun(trace);
const toolSkillRun = extractToolSkillRun(trace);
const noteInformation = extractNoteInformation(trace, clarificationRun, toolSkillRun);
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

const route = record(routeDecision);
const clarification = record(clarificationRun);
const tool = record(toolSkillRun);
const dispatcherOutput = record(clarification.dispatcher_output);
const reducerOutput = record(clarification.reducer_output);

const summary = existingSummary;
summary.push({
  turn,
  requestId,
  status: result.response.status,
  ok: body.ok ?? null,
  user: content,
  assistant: text,
  empty_response: text.trim().length === 0,
  aborted: body.aborted ?? response.aborted ?? false,
  abort_reason: body.abort_reason ?? response.abort_reason ?? null,
  response_owner: trace?.response_owner ?? route.response_owner ?? null,
  selected_handler:
    route.selected_handler ??
    route.skill_choisi ??
    tool.selected_handler ??
    clarification.selected_handler ??
    null,
  route_reason_code:
    route.reason_code ??
    route.reason ??
    route.route_reason ??
    null,
  active_flow_arbitration: trace?.active_flow_arbitration ?? route.active_flow_arbitration ?? null,
  clarification_flow_run: clarificationRun,
  clarification_status:
    clarification.status ??
    dispatcherOutput.status ??
    reducerOutput.status ??
    null,
  clarification_flow_action:
    clarification.flow_action ??
    dispatcherOutput.flow_action ??
    reducerOutput.flow_action ??
    null,
  clarification_visible_task:
    clarification.visible_task?.kind ??
    dispatcherOutput.visible_task?.kind ??
    reducerOutput.visible_task?.kind ??
    null,
  selected_candidate_id:
    clarification.selected_candidate_id ??
    dispatcherOutput.selected_candidate_id ??
    reducerOutput.selected_candidate_id ??
    null,
  candidate_signals:
    clarification.candidate_signals ??
    dispatcherOutput.candidate_signals ??
    reducerOutput.candidate_signals ??
    null,
  note_information: noteInformation,
  tool_skill_run: toolSkillRun,
  tool_selected_handler: tool.selected_handler ?? null,
  tool_flow_action:
    tool.flow_action ??
    tool.dispatcher_output?.flow_action ??
    tool.reducer_output?.flow_action ??
    null,
  tool_visible_task_kind:
    tool.visible_task?.kind ??
    tool.dispatcher_output?.visible_task?.kind ??
    tool.reducer_output?.visible_task?.kind ??
    null,
  safety: trace?.safety_pregate ?? turnFrame?.safety ?? null,
  direct_effects: trace?.direct_effects ?? turnFrame?.direct_effects ?? [],
  pending_confirmation:
    trace?.pending_tool_skill_confirmation ??
    turnFrame?.pending_tool_skill_confirmation ??
    null,
  response_tool_execution: response.tool_execution ?? trace?.tool_execution ?? null,
  response_executed_tools: response.executed_tools ?? trace?.executed_tools ?? [],
  effect_ledger: body.effect_ledger ?? trace?.effect_ledger ?? null,
  memory_plan: trace?.memory_plan ?? turnFrame?.memory_plan ?? null,
  raw_keys: Object.keys(record(trace)),
});
fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);

const userId = encodeURIComponent(connection.user_id);
const encodedScope = encodeURIComponent(scope);
const durable = {
  chat_messages: await restSelect(
    "chat_messages",
    `user_id=eq.${userId}&scope=eq.${encodedScope}&select=id,role,content,scope,metadata,created_at&order=created_at.asc`,
  ),
  user_chat_states: await restSelect(
    "user_chat_states",
    `user_id=eq.${userId}&select=user_id,current_mode,risk_level,temp_memory,updated_at`,
  ),
  scheduled_checkins: await restSelect(
    "scheduled_checkins",
    `user_id=eq.${userId}&select=*&limit=20`,
  ),
  user_recurring_reminders: await restSelect(
    "user_recurring_reminders",
    `user_id=eq.${userId}&select=*&limit=20`,
  ),
  attack_cards: await restSelect(
    "attack_cards",
    `user_id=eq.${userId}&select=*&limit=20`,
  ),
  defense_cards: await restSelect(
    "defense_cards",
    `user_id=eq.${userId}&select=*&limit=20`,
  ),
};
fs.writeFileSync(durablePath, `${JSON.stringify(durable, null, 2)}\n`);

console.log(JSON.stringify({
  turn,
  status: result.response.status,
  ok: body.ok ?? null,
  empty_response: text.trim().length === 0,
  aborted: body.aborted ?? response.aborted ?? false,
  response_owner: trace?.response_owner ?? route.response_owner ?? null,
  selected_handler: route.selected_handler ?? route.skill_choisi ?? null,
  route_reason_code: route.reason_code ?? route.reason ?? null,
  clarification_status:
    clarification.status ??
    dispatcherOutput.status ??
    reducerOutput.status ??
    null,
  clarification_flow_action:
    clarification.flow_action ??
    dispatcherOutput.flow_action ??
    reducerOutput.flow_action ??
    null,
  clarification_visible_task:
    clarification.visible_task?.kind ??
    dispatcherOutput.visible_task?.kind ??
    reducerOutput.visible_task?.kind ??
    null,
  selected_candidate_id:
    clarification.selected_candidate_id ??
    dispatcherOutput.selected_candidate_id ??
    reducerOutput.selected_candidate_id ??
    null,
  tool_selected_handler: tool.selected_handler ?? null,
  tool_flow_action:
    tool.flow_action ??
    tool.dispatcher_output?.flow_action ??
    tool.reducer_output?.flow_action ??
    null,
  has_note_information: Boolean(noteInformation),
  assistant_preview: text.replace(/\s+/g, " ").slice(0, 900),
  rawPath,
  summaryPath,
  durablePath,
}, null, 2));
