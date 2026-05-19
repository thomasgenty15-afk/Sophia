import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const runRoot = path.join(root, "tmp", "weekly-real-conversation-qa");

function argValue(name, fallback = "") {
  const prefixed = `--${name}=`;
  const direct = process.argv.find((arg) => arg.startsWith(prefixed));
  if (direct) return direct.slice(prefixed.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1] ?? fallback;
  return fallback;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadSupabaseStatus() {
  const envText = [
    path.join(root, "frontend", ".env.local"),
    path.join(root, "supabase", ".env"),
  ].map((filePath) => {
    try {
      return fs.readFileSync(filePath, "utf8");
    } catch {
      return "";
    }
  }).join("\n");
  const env = {};
  for (const line of envText.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return {
    API_URL: env.VITE_SUPABASE_URL ?? env.SUPABASE_URL ??
      "http://127.0.0.1:54321",
    ANON_KEY: env.VITE_SUPABASE_ANON_KEY ?? env.SUPABASE_ANON_KEY ?? "",
    SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    SECRET_KEY: env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  };
}

async function jsonFetch(url, options = {}, timeoutMs = 180000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw_text: text };
  }
  return { status: response.status, ok: response.ok, body, text };
}

async function signIn(status, connection) {
  const token = await jsonFetch(
    `${status.API_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: status.ANON_KEY,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: connection.email,
        password: connection.password,
      }),
    },
  );
  if (!token.ok || !token.body?.access_token) {
    throw new Error(`sign_in_failed: ${token.status} ${token.text}`);
  }
  return String(token.body.access_token);
}

function statePath(runId) {
  return path.join(runRoot, runId, "state.json");
}

function rawPath(runId) {
  return path.join(runRoot, runId, "raw.json");
}

function loadState(runId) {
  const filePath = statePath(runId);
  if (fs.existsSync(filePath)) return readJson(filePath);
  return null;
}

function saveState(state) {
  fs.mkdirSync(path.dirname(statePath(state.run_id)), { recursive: true });
  const text = `${JSON.stringify(state, null, 2)}\n`;
  fs.writeFileSync(statePath(state.run_id), text);
  fs.writeFileSync(rawPath(state.run_id), text);
}

function traceShort(trace) {
  const payload = trace?.payload && typeof trace.payload === "object"
    ? trace.payload
    : {};
  return {
    trace_id: trace?.id ?? null,
    response_owner: payload.response_owner ?? trace?.response_owner ?? null,
    selected_handler: payload.selected_handler ?? null,
    route_reason: payload.route_reason ?? null,
    safety: payload.safety ?? payload.safety_state ?? null,
    memory_plan: payload.memory_plan ?? null,
    executed_tools: payload.executed_tools ?? payload.tools ?? null,
    active_skill_state: payload.active_skill_state ?? null,
    pending_confirmation: payload.pending_confirmation ?? null,
  };
}

const runId = argValue("run-id");
const persona = argValue("persona", "paul");
const text = argValue("text");
const variant = argValue("variant", "");
const scope = argValue("scope", `weekly-real-${runId}`);
if (!runId || !text) {
  throw new Error("--run-id and --text are required");
}

const status = loadSupabaseStatus();
const connectionFileArg = argValue(
  "connection-file",
  path.join("tests", "real-personas", persona, "connection.json"),
);
const connectionPath = path.isAbsolute(connectionFileArg)
  ? connectionFileArg
  : path.join(root, connectionFileArg);
const connection = readJson(connectionPath);
const accessToken = await signIn(status, connection);
const state = loadState(runId) ?? {
  run_id: runId,
  variant,
  persona,
  user_id: connection.user_id,
  email: connection.email,
  scope,
  created_at: new Date().toISOString(),
  force_full_ai: true,
  turns: [],
};

const turnNumber = state.turns.length + 1;
const startedAt = new Date().toISOString();
const result = await jsonFetch(`${status.API_URL}/functions/v1/test-send-message`, {
  method: "POST",
  headers: {
    apikey: status.ANON_KEY,
    authorization: `Bearer ${status.ANON_KEY}`,
    "x-user-authorization": `Bearer ${accessToken}`,
    "content-type": "application/json",
    "x-request-id": `${runId}-t${String(turnNumber).padStart(2, "0")}`,
  },
  body: JSON.stringify({
    user_id: connection.user_id,
    channel: "web",
    scope,
    content: text,
    force_full_ai: true,
    disable_debounce: true,
  }),
});

const assistant = String(result.body?.response?.content ?? "").trim();
const turn = {
  turn: turnNumber,
  started_at: startedAt,
  user: text,
  http_status: result.status,
  ok: result.ok,
  assistant,
  empty_response: result.body?.empty_response ?? null,
  aborted: result.body?.aborted ?? null,
  abort_reason: result.body?.abort_reason ?? null,
  request_id: result.body?.request_id ?? null,
  trace_short: traceShort(result.body?.conversation_turn_trace ?? null),
  raw_response: result.body,
};
state.turns.push(turn);
state.updated_at = new Date().toISOString();
saveState(state);

console.log(JSON.stringify({
  run_id: runId,
  turn: turnNumber,
  http_status: result.status,
  ok: result.ok,
  assistant,
  trace_short: turn.trace_short,
  state: path.relative(root, statePath(runId)),
  raw: path.relative(root, rawPath(runId)),
}, null, 2));
