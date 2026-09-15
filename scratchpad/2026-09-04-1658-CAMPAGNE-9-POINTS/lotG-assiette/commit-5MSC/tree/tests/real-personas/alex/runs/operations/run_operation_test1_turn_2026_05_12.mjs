import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const date = process.env.QA_DATE || "2026-05-12";
const runId = process.env.QA_RUN_ID || "attack-card-direct-r1";
const turn = Number(process.env.QA_TURN || 0);
const content = String(process.env.QA_CONTENT || "").trim();
const apiUrl = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const fetchTimeoutMs = Number(process.env.QA_FETCH_TIMEOUT_MS || 120_000);
const channel = process.env.QA_CHANNEL || "web";

if (!turn || !content) {
  throw new Error("missing QA_TURN or QA_CONTENT");
}

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const runDir = path.join(root, "tests/real-personas/alex/runs/operations");
fs.mkdirSync(runDir, { recursive: true });

const connectionPath = path.join(root, "tests/real-personas/alex/connection.json");
const connection = JSON.parse(fs.readFileSync(connectionPath, "utf8"));

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    out[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

function safeExec(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    }).trim();
  } catch {
    return "";
  }
}

function localStatus() {
  const raw = safeExec("/usr/local/bin/supabase", ["status", "--output", "json"], {
    cwd: root,
  }) || safeExec("supabase", ["status", "--output", "json"], { cwd: root });
  if (!raw) return {};
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    const jsonText = start >= 0 && end >= start ? raw.slice(start, end + 1) : raw;
    return JSON.parse(jsonText);
  } catch {
    return {};
  }
}

const env = readEnvFile(path.join(root, "supabase/.env"));
const status = localStatus();
const anonKey = process.env.SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY ||
  status.ANON_KEY || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY ||
  status.SERVICE_ROLE_KEY || status.SECRET_KEY || "";
const jwtSecret = process.env.JWT_SECRET || env.JWT_SECRET || status.JWT_SECRET ||
  (apiUrl.includes("127.0.0.1") || apiUrl.includes("localhost")
    ? "super-secret-jwt-token-with-at-least-32-characters-long"
    : "");

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function makeLocalJwt(userId) {
  if (!jwtSecret) return "";
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    aud: "authenticated",
    exp: now + 60 * 60,
    iat: now,
    iss: "supabase-demo",
    sub: userId,
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
  const unsigned = `${base64url(JSON.stringify(header))}.${
    base64url(JSON.stringify(payload))
  }`;
  const signature = crypto.createHmac("sha256", jwtSecret)
    .update(unsigned)
    .digest("base64url");
  return `${unsigned}.${signature}`;
}

let authMethod = "get-jwt.sh";
let jwt = safeExec("bash", ["scripts/get-jwt.sh", "alex"], { cwd: root });
if (!jwt) {
  jwt = makeLocalJwt(connection.user_id);
  authMethod = "local_jwt_secret_fallback";
}
if (!jwt) throw new Error("missing Alex JWT");

const scope = `qa-operation-suggestion-test1-alex-${date}-${runId}`;
const rawPath = path.join(runDir, `${date}-test1-${runId}.raw.json`);
const summaryPath = path.join(runDir, `${date}-test1-${runId}.summary.json`);
const durablePath = path.join(runDir, `${date}-test1-${runId}.durable.json`);

function readJsonArray(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Array.isArray(parsed) ? parsed : [];
}

async function jsonFetch(url, options, timeoutMs = fetchTimeoutMs) {
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

function assistantText(body) {
  return String(
    body?.response?.content ?? body?.response?.reply ?? body?.content ?? "",
  );
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

const existingSummary = readJsonArray(summaryPath);
const history = [];
for (const item of existingSummary.slice(-12)) {
  if (item.user) history.push({ role: "user", content: item.user });
  if (item.assistant) history.push({ role: "assistant", content: item.assistant });
}

const requestId = `qa-operation-suggestion-test1-alex-${date}-${runId}-t${
  String(turn).padStart(2, "0")
}`;
const result = await jsonFetch(`${apiUrl}/functions/v1/test-send-message`, {
  method: "POST",
  headers: {
    ...(anonKey ? { apikey: anonKey } : {}),
    authorization: `Bearer ${jwt}`,
    "content-type": "application/json",
    "x-request-id": requestId,
  },
  body: JSON.stringify({
    user_id: connection.user_id,
    channel,
    scope,
    content,
    history,
    disable_debounce: true,
    force_full_ai: true,
  }),
});

const body = result.body ?? {};
const response = body.response ?? {};
const trace = body.conversation_turn_trace ?? body.trace?.trace ?? body.trace ??
  null;
const routeDecision = trace?.route_decision ?? null;
const turnFrame = trace?.turn_frame ?? null;
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
  response_tool_execution: response.tool_execution ?? null,
  response_executed_tools: response.executed_tools ?? [],
  response_owner: trace?.response_owner ?? routeDecision?.response_owner ?? null,
  selected_handler: routeDecision?.selected_handler ?? null,
  route_reason_code: routeDecision?.reason_code ?? null,
  safety_pregate: trace?.safety_pregate ?? null,
  direct_effects: trace?.direct_effects ?? turnFrame?.direct_effects ?? null,
  operation_flow_run: trace?.operation_flow_run ?? null,
  pending_tool_skill_confirmation: trace?.pending_tool_skill_confirmation ??
    turnFrame?.pending_tool_skill_confirmation ?? null,
  pending_operation_resolution: trace?.pending_operation_resolution ??
    turnFrame?.pending_operation_resolution ?? null,
  memory_plan: trace?.memory_plan ?? null,
  trace_error: body.trace_error ?? null,
});
fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);

const userId = encodeURIComponent(connection.user_id);
const durable = {
  user_attack_cards: await restSelect(
    "user_attack_cards",
    `user_id=eq.${userId}&select=id,plan_item_id,status,content,metadata,generated_at,last_updated_at&order=generated_at.desc&limit=20`,
  ),
  user_plan_items: await restSelect(
    "user_plan_items",
    `user_id=eq.${userId}&select=id,title,dimension,kind,status,cards_status,attack_card_id,updated_at&order=activation_order.asc`,
  ),
  chat_messages: await restSelect(
    "chat_messages",
    `user_id=eq.${userId}&scope=eq.${encodeURIComponent(scope)}&select=id,role,content,scope,metadata,created_at&order=created_at.asc`,
  ),
};
fs.writeFileSync(durablePath, `${JSON.stringify(durable, null, 2)}\n`);

console.log(JSON.stringify({
  turn,
  status: result.response.status,
  empty_response: text.trim().length === 0,
  aborted: body.aborted ?? response.aborted ?? false,
  tool_execution: response.tool_execution ?? null,
  executed_tools: response.executed_tools ?? [],
  response_owner: trace?.response_owner ?? routeDecision?.response_owner ?? null,
  selected_handler: routeDecision?.selected_handler ?? null,
  reason_code: routeDecision?.reason_code ?? null,
  operation_flow_status: trace?.operation_flow_run?.status ?? null,
  operation_id: trace?.operation_flow_run?.operation_id ?? null,
  attack_card_id: trace?.operation_flow_run?.attack_card_id ?? null,
  has_pending_confirmation: Boolean(
    trace?.pending_tool_skill_confirmation ??
      turnFrame?.pending_tool_skill_confirmation,
  ),
  content_preview: text.replace(/\s+/g, " ").slice(0, 700),
  rawPath,
  summaryPath,
  durablePath,
  auth_method: authMethod,
}, null, 2));
