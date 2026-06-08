import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  const key = process.argv[i];
  if (!key.startsWith("--")) continue;
  const next = process.argv[i + 1];
  if (next && !next.startsWith("--")) {
    args.set(key.slice(2), next);
    i += 1;
  } else {
    args.set(key.slice(2), "true");
  }
}

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

const persona = args.get("persona") || "qa-skill";
const baseConnection = args.get("base-connection") || "flow-opportunity-verification";
const runId = args.get("run-id") || "flow-opportunity-verification-r1-20260608";
const connectionName = args.get("connection-name") || `${baseConnection}_${runId}`;
const scope = args.get("scope") || `qa-${runId}`;
const turn = Number(args.get("turn") || "1");
const message = args.get("message") || "";
const rawDir = path.join(root, "tests/real-personas", persona, "runs", "flow_opportunity_verification");
const rawPath = args.get("raw-path") || path.join(rawDir, `${runId}.raw.json`);
const summaryPath = args.get("summary-path") || path.join(rawDir, `${runId}.summary.json`);

if (!/^[A-Za-z0-9_-]+$/.test(runId)) throw new Error(`Invalid run id: ${runId}`);
if (!/^[A-Za-z0-9_-]+$/.test(baseConnection)) throw new Error(`Invalid base connection: ${baseConnection}`);
if (!/^[A-Za-z0-9_-]+$/.test(connectionName)) throw new Error(`Invalid connection name: ${connectionName}`);
function statusJson() {
  const output = execFileSync("supabase", ["status", "--output", "json"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Could not locate JSON in supabase status output");
  }
  return JSON.parse(output.slice(start, end + 1));
}

function cleanupConnections(status, names) {
  const serviceRoleKey = status.SERVICE_ROLE_KEY || status.SECRET_KEY;
  const outputs = [];
  for (const name of names) {
    if (!/^[A-Za-z0-9_-]+$/.test(name)) {
      throw new Error(`Invalid cleanup connection name: ${name}`);
    }
    const output = execFileSync(
      "bash",
      ["scripts/qa-cleanup-run-connection.sh", persona, name],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          SUPABASE_URL: status.API_URL,
          SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
        },
      },
    );
    outputs.push(output.trim());
  }
  return outputs;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value, mode) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, mode ? { mode } : undefined);
}

function safeEmailPart(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { response, body };
}

async function restSelect(supabaseUrl, serviceRoleKey, table, query) {
  const { response, body } = await jsonFetch(
    `${supabaseUrl}/rest/v1/${table}?${query}`,
    {
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
      },
    },
  );
  return {
    ok: response.ok,
    status: response.status,
    body,
  };
}

async function ensureConnection(status) {
  const connectionFile = path.join(
    root,
    "tests/real-personas",
    persona,
    "connections",
    `${connectionName}.json`,
  );
  if (fs.existsSync(connectionFile)) {
    return { connectionFile, connection: readJson(connectionFile), created: false };
  }

  const supabaseUrl = status.API_URL;
  const anonKey = status.ANON_KEY;
  const serviceRoleKey = status.SERVICE_ROLE_KEY || status.SECRET_KEY;
  const email =
    `qa-${safeEmailPart(persona)}-${safeEmailPart(baseConnection)}-${safeEmailPart(runId)}@example.com`;
  const password = `Qa1!${crypto.randomUUID()}`;
  const metadata = {
    is_test_persona: true,
    temporary_qa_connection: true,
    persona,
    base_connection: baseConnection,
    connection_name: connectionName,
    run_id: runId,
    created_by: "tmp/qa_flow_opportunity_turn.mjs",
  };

  const users = await jsonFetch(`${supabaseUrl}/auth/v1/admin/users?per_page=1000`, {
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
    },
  });
  if (!users.response.ok) throw new Error(`List users failed: ${JSON.stringify(users.body)}`);
  const existing = (Array.isArray(users.body?.users) ? users.body.users : []).find(
    (user) => String(user.email || "").toLowerCase() === email.toLowerCase(),
  );
  const endpoint = existing?.id
    ? `${supabaseUrl}/auth/v1/admin/users/${existing.id}`
    : `${supabaseUrl}/auth/v1/admin/users`;
  const method = existing?.id ? "PUT" : "POST";
  const upsert = await jsonFetch(endpoint, {
    method,
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
  if (!upsert.response.ok || !upsert.body?.id) {
    throw new Error(`Auth user upsert failed: ${JSON.stringify(upsert.body)}`);
  }

  const token = await jsonFetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  if (!token.response.ok || !token.body?.refresh_token) {
    throw new Error(`Token setup failed: ${JSON.stringify(token.body)}`);
  }

  const connection = {
    user_id: upsert.body.id,
    email,
    refresh_token: token.body.refresh_token,
    temporary: true,
    persona,
    base_connection: baseConnection,
    connection_name: connectionName,
    run_id: runId,
    created_at: new Date().toISOString(),
  };
  writeJson(connectionFile, connection, 0o600);
  fs.chmodSync(connectionFile, 0o600);
  return { connectionFile, connection, created: true };
}

async function login(status, connection) {
  const supabaseUrl = status.API_URL;
  const anonKey = status.ANON_KEY;
  const grantType = connection.refresh_token ? "refresh_token" : "password";
  const payload = connection.refresh_token
    ? { refresh_token: connection.refresh_token }
    : { email: connection.email, password: connection.password };
  const token = await jsonFetch(`${supabaseUrl}/auth/v1/token?grant_type=${grantType}`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!token.response.ok || !token.body?.access_token) {
    throw new Error(`Login failed: ${JSON.stringify(token.body)}`);
  }
  const user = await jsonFetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${token.body.access_token}`,
    },
  });
  if (!user.response.ok || user.body?.id !== connection.user_id) {
    throw new Error(`Auth user verify failed: ${JSON.stringify(user.body)}`);
  }
  return token.body.access_token;
}

function extractTrace(body) {
  return body?.conversation_turn_trace ?? body?.trace?.trace ?? body?.trace ?? null;
}

function extractAssistant(body) {
  return (
    body?.response?.content ??
    body?.response?.reply ??
    body?.content ??
    body?.message ??
    body?.assistant ??
    ""
  );
}

function summarizeTrace(trace, body) {
  const operationFlowRun =
    trace?.operation_flow_run ??
    trace?.tool_skill_run ??
    body?.response?.operation_flow_run ??
    body?.response?.tool_skill_run ??
    body?.operation_flow_run ??
    body?.tool_skill_run ??
    null;
  return {
    response_owner:
      trace?.response_owner ??
      trace?.route_decision?.response_owner ??
      body?.response_owner ??
      null,
    selected_handler:
      operationFlowRun?.selected_handler ??
      trace?.route_decision?.selected_handler ??
      body?.selected_handler ??
      null,
    selected_action:
      operationFlowRun?.selected_action ??
      operationFlowRun?.flow_action ??
      operationFlowRun?.action ??
      null,
    target_flow: operationFlowRun?.target_flow ?? operationFlowRun?.targetFlow ?? null,
    reason_code:
      operationFlowRun?.reason_code ??
      trace?.route_decision?.reason_code ??
      body?.reason_code ??
      null,
    active_skill_after:
      trace?.active_skill_after ??
      trace?.state?.active_skill_after ??
      null,
    executed_tools:
      body?.response?.executed_tools ??
      body?.executed_tools ??
      trace?.executed_tools ??
      [],
  };
}

function extractFlowState(stateRows) {
  const row = Array.isArray(stateRows?.body) ? stateRows.body[0] : null;
  const tempMemory = row?.temp_memory || row?.state?.temp_memory || {};
  return {
    row_exists: Boolean(row),
    active_skill_state: tempMemory.__active_skill_state ?? null,
    flow_opportunity_state: tempMemory.__flow_opportunity_verification_state_v1 ?? null,
  };
}

async function main() {
  const status = statusJson();
  if (!String(status.API_URL || "").startsWith("http://127.0.0.1:")) {
    throw new Error(`Refusing non-local Supabase URL: ${status.API_URL}`);
  }
  const cleanupRaw = args.get("cleanup-connections");
  if (cleanupRaw) {
    const names = cleanupRaw.split(",").map((item) => item.trim()).filter(Boolean);
    const outputs = cleanupConnections(status, names);
    console.log(JSON.stringify({ cleanup: outputs }, null, 2));
    return;
  }
  if (!message) throw new Error("Missing --message");
  const serviceRoleKey = status.SERVICE_ROLE_KEY || status.SECRET_KEY;
  const { connectionFile, connection, created } = await ensureConnection(status);
  const accessToken = await login(status, connection);

  const requestId = `qa-${runId}-t${String(turn).padStart(2, "0")}`;
  const sentAt = new Date().toISOString();
  const response = await jsonFetch(`${status.API_URL}/functions/v1/test-send-message`, {
    method: "POST",
    headers: {
      apikey: status.ANON_KEY,
      authorization: `Bearer ${status.ANON_KEY}`,
      "x-user-authorization": `Bearer ${accessToken}`,
      "content-type": "application/json",
      "x-request-id": requestId,
    },
    body: JSON.stringify({
      user_id: connection.user_id,
      channel: "web",
      scope,
      content: message,
      disable_debounce: true,
      force_full_ai: true,
    }),
  });
  const trace = extractTrace(response.body);
  const assistant = extractAssistant(response.body);

  const stateAfter = await restSelect(
    status.API_URL,
    serviceRoleKey,
    "user_chat_states",
    `user_id=eq.${connection.user_id}&scope=eq.${encodeURIComponent(scope)}&select=*`,
  );
  const messagesAfter = await restSelect(
    status.API_URL,
    serviceRoleKey,
    "chat_messages",
    `user_id=eq.${connection.user_id}&scope=eq.${encodeURIComponent(scope)}&select=id,role,content,created_at,metadata,agent_used&order=created_at.asc`,
  );

  const previous = fs.existsSync(rawPath)
    ? readJson(rawPath)
    : {
        run_id: runId,
        persona,
        connection_name: connectionName,
        connection_file: connectionFile,
        user_id: connection.user_id,
        email: connection.email,
        scope,
        started_at: sentAt,
        constraints: {
          endpoint: "/functions/v1/test-send-message",
          force_full_ai: true,
          local_supabase_only: true,
          no_code_changes_during_run: true,
        },
        supabase_services_note:
          "supabase status reported some stopped ancillary services before the run; API/auth/functions/db were reachable.",
        turns: [],
      };
  previous.connection_created_this_run = Boolean(previous.connection_created_this_run || created);
  previous.updated_at = new Date().toISOString();
  previous.turns = previous.turns.filter((item) => item.turn !== turn);
  previous.turns.push({
    turn,
    request_id: requestId,
    sent_at: sentAt,
    user_message: message,
    http_status: response.response.status,
    assistant_message: assistant,
    short_trace: summarizeTrace(trace, response.body),
    flow_state_after: extractFlowState(stateAfter),
    state_after: stateAfter,
    messages_after: messagesAfter,
    response_body: response.body,
  });
  previous.turns.sort((a, b) => a.turn - b.turn);
  writeJson(rawPath, previous);

  const summary = {
    run_id: runId,
    persona,
    connection_name: connectionName,
    user_id: connection.user_id,
    email: connection.email,
    scope,
    updated_at: previous.updated_at,
    raw_path: rawPath,
    turns: previous.turns.map((item) => ({
      turn: item.turn,
      request_id: item.request_id,
      user_message: item.user_message,
      http_status: item.http_status,
      assistant_message: item.assistant_message,
      short_trace: item.short_trace,
      flow_state_after: item.flow_state_after,
      persisted_messages_count: Array.isArray(item.messages_after?.body)
        ? item.messages_after.body.length
        : null,
    })),
  };
  writeJson(summaryPath, summary);

  console.log(JSON.stringify({
    turn,
    connection_name: connectionName,
    connection_created: created,
    user_id: connection.user_id,
    email: connection.email,
    scope,
    http_status: response.response.status,
    assistant_message: assistant,
    short_trace: summary.turns.at(-1).short_trace,
    flow_state_after: summary.turns.at(-1).flow_state_after,
    persisted_messages_count: summary.turns.at(-1).persisted_messages_count,
    raw_path: rawPath,
    summary_path: summaryPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
