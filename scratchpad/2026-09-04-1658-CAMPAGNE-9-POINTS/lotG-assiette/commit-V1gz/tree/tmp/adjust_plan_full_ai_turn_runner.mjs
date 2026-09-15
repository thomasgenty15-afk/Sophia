import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const command = String(process.argv[2] ?? "").trim();
const runId = String(process.env.QA_RUN_ID ?? "").trim();
const persona = String(process.env.QA_PERSONA ?? "rose").trim();
const connectionName = String(process.env.QA_CONNECTION_NAME ?? "").trim();
const turn = Number(process.env.QA_TURN ?? 0);
const content = String(process.env.QA_CONTENT ?? "").trim();
const apiUrl = String(process.env.SUPABASE_URL ?? "http://127.0.0.1:54321");
const clientNowIso = String(
  process.env.SOPHIA_CLIENT_NOW_ISO ?? "2026-06-01T10:00:00.000+02:00",
);
const timeoutMs = Number(process.env.QA_FETCH_TIMEOUT_MS ?? 180000);

if (!command || !runId) {
  throw new Error(
    "usage: QA_RUN_ID=<id> node tmp/adjust_plan_full_ai_turn_runner.mjs <plan|turn|inspect>",
  );
}
if (command === "turn" && (!turn || !content)) {
  throw new Error("turn requires QA_TURN and QA_CONTENT");
}

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const runDir = path.join(
  root,
  "tmp",
  "qa-adjust-plan-handoff-real-20260601",
  runId,
);
fs.mkdirSync(runDir, { recursive: true });

const connectionPath = path.join(
  root,
  "tests",
  "real-personas",
  persona,
  ...(connectionName ? ["connections", `${connectionName}.json`] : []),
);
const defaultConnectionPath = path.join(
  root,
  "tests",
  "real-personas",
  persona,
  "connection.json",
);
const connection = JSON.parse(
  fs.readFileSync(connectionName ? connectionPath : defaultConnectionPath, "utf8"),
);
const summaryPath = path.join(runDir, "summary.json");
const rawPath = path.join(runDir, "raw.json");
const scope = `qa-adjust-plan-handoff-real-20260601-${runId}`;

function safeExec(commandName, args, options = {}) {
  try {
    return execFileSync(commandName, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    }).trim();
  } catch {
    return "";
  }
}

function localStatus() {
  const raw =
    safeExec("/usr/local/bin/supabase", ["status", "--output", "json"], {
      cwd: root,
    }) ||
    safeExec("supabase", ["status", "--output", "json"], { cwd: root });
  if (!raw) return {};
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  return JSON.parse(
    start >= 0 && end >= start ? raw.slice(start, end + 1) : raw,
  );
}

const status = localStatus();
const anonKey = process.env.SUPABASE_ANON_KEY ?? status.ANON_KEY ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ??
  status.SERVICE_ROLE_KEY ?? "";
if (!anonKey) throw new Error("missing local ANON_KEY");

async function jsonFetch(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
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

async function authToken() {
  const token = safeExec("bash", ["scripts/get-jwt.sh", persona], {
    cwd: root,
  });
  const namedToken = connectionName
    ? safeExec("bash", ["scripts/get-jwt.sh", persona, connectionName], {
      cwd: root,
    })
    : "";
  if (namedToken) return namedToken;
  if (token) return token;
  const email = String(connection.email ?? "").trim();
  const password = String(connection.password ?? "1234567").trim();
  const result = await jsonFetch(
    `${apiUrl}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: { apikey: anonKey, "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    },
  );
  const accessToken = String(result.body?.access_token ?? "");
  if (!result.response.ok || !accessToken) {
    throw new Error(`auth failed ${result.response.status}: ${result.text}`);
  }
  return accessToken;
}

async function rest(pathname) {
  if (!serviceRoleKey) return { status: 0, body: [] };
  const response = await fetch(`${apiUrl}/rest/v1/${pathname}`, {
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      accept: "application/json",
    },
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : [] };
}

function readArray(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Array.isArray(parsed) ? parsed : [];
}

function assistantText(body) {
  return String(
    body?.response?.content ?? body?.response?.reply ?? body?.content ?? "",
  );
}

function compactTrace(body) {
  const trace = body?.conversation_turn_trace ?? body?.trace?.trace ??
    body?.trace ?? {};
  const route = trace?.route_decision ?? {};
  const response = body?.response ?? {};
  const toolRun = trace?.tool_skill_run ?? trace?.operation_flow_run ??
    response?.toolSkillRun ?? null;
  return {
    response_owner: trace?.response_owner ?? route?.response_owner ?? null,
    selected_handler: route?.selected_handler ?? trace?.selected_handler ??
      null,
    route_reason: route?.reason_code ?? trace?.reason_code ?? null,
    safety: trace?.safety_pregate?.risk_band ?? trace?.safety?.risk_band ??
      null,
    direct_effects: trace?.direct_effects ??
      trace?.turn_frame?.direct_effects ?? [],
    operation: toolRun?.selected_handler ?? toolRun?.operation_type ?? null,
    pending_confirmation: trace?.pending_tool_skill_confirmation ?? null,
    memory_plan: trace?.memory_plan?.action ?? trace?.memory_plan ?? null,
    executed_tools: response?.executed_tools ?? response?.executedTools ?? [],
    durable_effect: response?.tool_execution ?? response?.toolExecution ?? null,
    tool_skill_run: toolRun,
    trace_error: body?.trace_error ?? null,
  };
}

if (command === "plan") {
  const userId = encodeURIComponent(connection.user_id);
  const items = await rest(
    `user_plan_items?user_id=eq.${userId}&select=*&limit=20`,
  );
  const output = {
    run_id: runId,
    persona,
    user_id: connection.user_id,
    scope,
    status: items.status,
    items: Array.isArray(items.body) ? items.body.slice(0, 20) : [],
  };
  fs.writeFileSync(
    path.join(runDir, "plan.json"),
    `${JSON.stringify(output, null, 2)}\n`,
  );
  console.log(JSON.stringify(output, null, 2));
  process.exit(0);
}

if (command === "inspect") {
  console.log(JSON.stringify(
    {
      run_id: runId,
      persona,
      scope,
      summary: readArray(summaryPath),
    },
    null,
    2,
  ));
  process.exit(0);
}

const previous = readArray(summaryPath);
const history = [];
for (const item of previous.slice(-12)) {
  if (item.user) history.push({ role: "user", content: item.user });
  if (item.assistant) {
    history.push({ role: "assistant", content: item.assistant });
  }
}

const token = await authToken();
const requestId = `${scope}-t${String(turn).padStart(2, "0")}`;
const result = await jsonFetch(`${apiUrl}/functions/v1/test-send-message`, {
  method: "POST",
  headers: {
    apikey: anonKey,
    authorization: `Bearer ${anonKey}`,
    "x-user-authorization": `Bearer ${token}`,
    "x-request-id": requestId,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    user_id: connection.user_id,
    channel: "web",
    scope,
    content,
    history,
    force_full_ai: true,
    disable_debounce: true,
    include_trace: true,
    client_now_iso: clientNowIso,
  }),
});

const body = result.body ?? {};
const assistant = assistantText(body);
const trace = compactTrace(body);
const row = {
  turn,
  request_id: requestId,
  http_status: result.response.status,
  ok: body?.ok ?? null,
  user: content,
  assistant,
  empty_response: assistant.trim().length === 0,
  aborted: body?.aborted ?? body?.response?.aborted ?? false,
  abort_reason: body?.abort_reason ?? body?.response?.abort_reason ?? null,
  trace,
};

const raw = readArray(rawPath);
raw.push({ ...row, body });
fs.writeFileSync(rawPath, `${JSON.stringify(raw, null, 2)}\n`);
previous.push(row);
fs.writeFileSync(summaryPath, `${JSON.stringify(previous, null, 2)}\n`);

console.log(JSON.stringify(row, null, 2));
