import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const runId = process.env.QA_RUN_ID ||
  "2026-06-08-safety-crisis-local-real-r1";
const persona = "qa-skill";
const baseConnection = "safety_crisis_local";
const connectionName = `${baseConnection}_${runId}`;
const runDir = path.join(root, "tests/real-personas/qa-skill/runs/safety_crisis");
fs.mkdirSync(runDir, { recursive: true });
const statePath = path.join(runDir, `${runId}.state.json`);
const rawPath = path.join(runDir, `${runId}.raw.json`);
const summaryPath = path.join(runDir, `${runId}.summary.json`);
const durablePath = path.join(runDir, `${runId}.durable.json`);
const cleanupPath = path.join(runDir, `${runId}.cleanup.json`);

function requireExec(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

function safeExec(command, args, options = {}) {
  try {
    return requireExec(command, args, options);
  } catch (error) {
    return String(error?.stderr ?? error?.message ?? "");
  }
}

function localStatus() {
  const raw = requireExec("supabase", ["status", "--output", "json"]);
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  return JSON.parse(start >= 0 && end >= start ? raw.slice(start, end + 1) : raw);
}

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

function restHeaders(key) {
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    accept: "application/json",
    "content-type": "application/json",
  };
}

function encode(value) {
  return encodeURIComponent(String(value));
}

async function readRows(apiUrl, serviceRoleKey, userId, scope) {
  const [messages, state] = await Promise.all([
    jsonFetch(
      `${apiUrl}/rest/v1/chat_messages?user_id=eq.${encode(userId)}&scope=eq.${encode(scope)}&select=id,role,content,created_at,scope,metadata&order=created_at.asc`,
      { headers: restHeaders(serviceRoleKey) },
    ),
    jsonFetch(
      `${apiUrl}/rest/v1/user_chat_states?user_id=eq.${encode(userId)}&scope=eq.${encode(scope)}&select=user_id,scope,temp_memory,updated_at`,
      { headers: restHeaders(serviceRoleKey) },
    ),
  ]);
  return {
    chat_messages: messages.body,
    user_chat_states: state.body,
  };
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

function committedEffectsFromLedger(trace) {
  const entries = Array.isArray(trace?.effect_ledger?.entries)
    ? trace.effect_ledger.entries
    : [];
  return entries
    .filter((entry) =>
      entry &&
      (entry.kind ?? "durable_effect") === "durable_effect" &&
      entry.status === "committed"
    )
    .map((entry) => ({
      effect_type: entry.effect_type ?? null,
      operation_type: entry.operation_type ?? null,
      committed_id: entry.committed_id ?? null,
      db_ref: entry.db_ref ?? null,
      reason_code: entry.reason_code ?? null,
      payload_summary: entry.payload_summary ?? null,
    }));
}

function committedEffectsFromTrace(trace) {
  const ledgerEffects = committedEffectsFromLedger(trace);
  if (ledgerEffects.length > 0) return ledgerEffects;
  const toolRun = trace?.tool_skill_run ?? {};
  if (Array.isArray(toolRun.committed_effects)) {
    return toolRun.committed_effects;
  }
  const skill = trace?.recommendation_skill_run ?? {};
  const output = skill.output ?? {};
  return Array.isArray(output.effects?.committed)
    ? output.effects.committed
    : [];
}

function shortTrace(turn) {
  const trace = turn.trace ?? {};
  const routeDecision = trace.route_decision ?? {};
  const turnFrame = trace.turn_frame ?? {};
  const skill = trace.recommendation_skill_run ?? {};
  const output = skill.output ?? {};
  const diagnosis = output.diagnosis ?? {};
  return {
    http_status: turn.http_status,
    response_owner: trace.response_owner ?? routeDecision.response_owner ?? null,
    selected_handler: routeDecision.selected_handler ??
      skill.selected_skill_id ?? null,
    route_reason: routeDecision.reason_code ?? null,
    safety: trace.safety_pregate?.risk_band ?? turnFrame.safety?.risk_band ??
      null,
    direct_effects: trace.direct_effects ?? turnFrame.direct_effects ?? [],
    skill: {
      selected_skill_id: skill.selected_skill_id ?? null,
      status: output.status ?? null,
      phase: output.state_patch?.phase ?? diagnosis.phase ?? null,
      risk_band: output.state_patch?.risk_band ?? diagnosis.risk_band ?? null,
      visible_task: output.state_patch?.visible_task?.kind ??
        diagnosis.visible_task?.kind ?? null,
      exit_memo: output.state_patch?.exit_memo ?? diagnosis.exit_memo ?? null,
    },
    pending_confirmation: trace.pending_tool_skill_confirmation ?? null,
    memory_plan: trace.memory_plan ?? turnFrame.memory_plan ?? null,
    executed_tools: turn.response_executed_tools ?? [],
    durable_effect: committedEffectsFromTrace(trace),
  };
}

function loadState() {
  return JSON.parse(fs.readFileSync(statePath, "utf8"));
}

function saveState(state) {
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
  fs.writeFileSync(rawPath, `${JSON.stringify(state, null, 2)}\n`);
  const summary = (state.turns ?? []).map((turn) => ({
    turn: turn.turn,
    user: turn.user,
    assistant: turn.assistant,
    short_trace: shortTrace(turn),
  }));
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
}

async function authContext(status, connection) {
  const apiUrl = status.API_URL || "http://127.0.0.1:54321";
  const anonKey = status.ANON_KEY;
  const auth = await jsonFetch(`${apiUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: anonKey, "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: connection.refresh_token }),
  });
  if (!auth.response.ok || !auth.body?.access_token) {
    throw new Error(`auth failed ${auth.response.status}: ${auth.text}`);
  }
  const verify = await jsonFetch(`${apiUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${auth.body.access_token}`,
    },
  });
  if (!verify.response.ok) {
    throw new Error(`auth verify failed ${verify.response.status}: ${verify.text}`);
  }
  return {
    apiUrl,
    anonKey,
    serviceRoleKey: status.SERVICE_ROLE_KEY,
    accessToken: auth.body.access_token,
    verifyStatus: verify.response.status,
  };
}

async function init() {
  const status = localStatus();
  requireExec("bash", [
    "scripts/qa-create-run-connection.sh",
    persona,
    baseConnection,
    runId,
  ]);
  const connectionFile = path.join(
    root,
    "tests/real-personas/qa-skill/connections",
    `${connectionName}.json`,
  );
  const connection = JSON.parse(fs.readFileSync(connectionFile, "utf8"));
  const auth = await authContext(status, connection);
  const state = {
    run_id: runId,
    persona,
    connection_name: connectionName,
    connection_file: path.relative(root, connectionFile),
    user_id: connection.user_id,
    email: connection.email,
    scope: `qa-safety-crisis-${runId}`,
    endpoint: `${auth.apiUrl}/functions/v1/test-send-message`,
    force_full_ai: true,
    disable_debounce: true,
    auth: {
      method: "refresh_token_login",
      verify_status: auth.verifyStatus,
      jwt_redacted: true,
    },
    created_at: new Date().toISOString(),
    turns: [],
  };
  saveState(state);
  console.log(JSON.stringify({
    run_id: runId,
    connection_name: connectionName,
    user_id: connection.user_id,
    email: connection.email,
    scope: state.scope,
    auth_verify_status: auth.verifyStatus,
  }, null, 2));
}

async function send(text) {
  if (!text) throw new Error("missing text");
  const state = loadState();
  const status = localStatus();
  const connectionFile = path.join(root, state.connection_file);
  const connection = JSON.parse(fs.readFileSync(connectionFile, "utf8"));
  const auth = await authContext(status, connection);
  const history = [];
  for (const turn of state.turns) {
    history.push({ role: "user", content: turn.user });
    if (turn.assistant) history.push({ role: "assistant", content: turn.assistant });
  }
  const turnNo = state.turns.length + 1;
  const requestId = `qa-${runId}-t${String(turnNo).padStart(2, "0")}`;
  const result = await jsonFetch(`${auth.apiUrl}/functions/v1/test-send-message`, {
    method: "POST",
    headers: {
      apikey: auth.anonKey,
      authorization: `Bearer ${auth.anonKey}`,
      "x-user-authorization": `Bearer ${auth.accessToken}`,
      "content-type": "application/json",
      "x-request-id": requestId,
    },
    body: JSON.stringify({
      user_id: state.user_id,
      channel: "web",
      scope: state.scope,
      content: text,
      history,
      disable_debounce: true,
      force_full_ai: true,
    }),
  });
  const assistant = assistantText(result.body);
  const trace = traceFromBody(result.body);
  const rows = await readRows(auth.apiUrl, auth.serviceRoleKey, state.user_id, state.scope);
  const turn = {
    turn: turnNo,
    request_id: requestId,
    user: text,
    assistant,
    http_status: result.response.status,
    ok: result.response.ok,
    raw_body: result.body,
    trace,
    response_tool_execution: result.body?.response?.tool_execution ?? null,
    response_executed_tools: result.body?.response?.executed_tools ?? [],
    state_after: rows,
  };
  state.turns.push(turn);
  state.updated_at = new Date().toISOString();
  saveState(state);
  console.log(JSON.stringify({
    turn: turnNo,
    http_status: turn.http_status,
    ok: turn.ok,
    assistant,
    short_trace: shortTrace(turn),
  }, null, 2));
}

async function inspect() {
  const state = loadState();
  fs.writeFileSync(durablePath, `${JSON.stringify({
    run_id: state.run_id,
    user_id: state.user_id,
    scope: state.scope,
    turns: state.turns.map((turn) => ({
      turn: turn.turn,
      short_trace: shortTrace(turn),
      state_after: turn.state_after,
    })),
  }, null, 2)}\n`);
  console.log(JSON.stringify({
    run_id: state.run_id,
    turns: state.turns.length,
    summary_path: path.relative(root, summaryPath),
    raw_path: path.relative(root, rawPath),
    durable_path: path.relative(root, durablePath),
  }, null, 2));
}

async function cleanup() {
  const state = loadState();
  const status = localStatus();
  const apiUrl = status.API_URL || "http://127.0.0.1:54321";
  const serviceRoleKey = status.SERVICE_ROLE_KEY;
  const cleanup = {
    run_id: state.run_id,
    user_id: state.user_id,
    scope: state.scope,
    deleted: {},
    connection_cleanup: null,
    errors: [],
  };
  for (const [table, query] of [
    ["chat_messages", `user_id=eq.${encode(state.user_id)}&scope=eq.${encode(state.scope)}`],
    ["user_chat_states", `user_id=eq.${encode(state.user_id)}&scope=eq.${encode(state.scope)}`],
  ]) {
    const result = await jsonFetch(`${apiUrl}/rest/v1/${table}?${query}`, {
      method: "DELETE",
      headers: restHeaders(serviceRoleKey),
    });
    cleanup.deleted[table] = result.response.status;
    if (!result.response.ok) {
      cleanup.errors.push(`${table} delete failed ${result.response.status}`);
    }
  }
  cleanup.connection_cleanup = safeExec("bash", [
    "scripts/qa-cleanup-run-connection.sh",
    persona,
    state.connection_name,
  ]);
  fs.writeFileSync(cleanupPath, `${JSON.stringify(cleanup, null, 2)}\n`);
  console.log(JSON.stringify({
    cleanup_path: path.relative(root, cleanupPath),
    errors: cleanup.errors,
    connection_cleanup: cleanup.connection_cleanup,
  }, null, 2));
}

const command = process.argv[2] ?? "";
if (command === "init") await init();
else if (command === "send") await send(process.argv.slice(3).join(" "));
else if (command === "inspect") await inspect();
else if (command === "cleanup") await cleanup();
else {
  throw new Error("usage: node tmp/safety_crisis_local_real_qa.mjs init|send <text>|inspect|cleanup");
}
