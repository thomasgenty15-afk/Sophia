import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const date = process.env.QA_DATE || "2026-06-08";
const runId = process.env.QA_RUN_ID || `prepare-defense-local-rerun-${Date.now()}`;
const apiUrl = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const channel = process.env.QA_CHANNEL || "web";
const fetchTimeoutMs = Number(process.env.QA_FETCH_TIMEOUT_MS || 120_000);
const turnDelayMs = Number(process.env.QA_TURN_DELAY_MS || 2500);
const startTurn = Number(process.env.QA_START_TURN || 1);
const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const outDir = path.join(root, "tests/real-personas/alex/runs/operations");
fs.mkdirSync(outDir, { recursive: true });

const connection = JSON.parse(
  fs.readFileSync(path.join(root, "tests/real-personas/alex/connection.json"), "utf8"),
);

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

function localStatus() {
  const raw = safeExec("supabase", ["status", "--output", "json"], { cwd: root });
  if (!raw) return {};
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  try {
    return JSON.parse(start >= 0 && end >= start ? raw.slice(start, end + 1) : raw);
  } catch {
    return {};
  }
}

function base64url(input) {
  return Buffer.from(input).toString("base64url");
}

function makeLocalJwt(userId, jwtSecret) {
  if (!jwtSecret) return "";
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    aud: "authenticated",
    exp: now + 3600,
    iat: now,
    iss: "supabase-demo",
    sub: userId,
    email: connection.email ?? "",
    phone: "",
    role: "authenticated",
    aal: "aal1",
    session_id: crypto.randomUUID(),
    app_metadata: { provider: "email", providers: ["email"], is_test_persona: true },
    user_metadata: { is_test_persona: true },
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = crypto.createHmac("sha256", jwtSecret).update(unsigned).digest("base64url");
  return `${unsigned}.${signature}`;
}

const env = readEnvFile(path.join(root, "supabase/.env"));
const status = localStatus();
const anonKey = process.env.SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || status.ANON_KEY || "";
const jwtSecret = process.env.JWT_SECRET || env.JWT_SECRET || status.JWT_SECRET ||
  "super-secret-jwt-token-with-at-least-32-characters-long";
let authMethod = "get-jwt.sh";
let jwt = safeExec("bash", ["scripts/get-jwt.sh", "alex"], { cwd: root });
if (!jwt) {
  jwt = makeLocalJwt(connection.user_id, jwtSecret);
  authMethod = "local_jwt_secret_fallback";
}
if (!jwt) throw new Error("missing Alex JWT");

const scope = process.env.QA_SCOPE ||
  `qa-prepare-defense-local-rerun-alex-${date}-${runId}`;
const baseName = `${date}-prepare-defense-${runId}`;
const rawPath = path.join(outDir, `${baseName}.raw.json`);
const summaryPath = path.join(outDir, `${baseName}.summary.json`);

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
    return { response, body };
  } finally {
    clearTimeout(timeout);
  }
}

function traceFrom(body) {
  return body?.response?.conversation_turn_trace ?? body?.conversation_turn_trace ??
    body?.trace?.trace ?? body?.trace ?? null;
}

function assistantText(body) {
  return String(body?.response?.content ?? body?.response?.reply ?? body?.content ?? "");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function turnSummary(turn, requestId, user, response) {
  const body = response.body ?? {};
  const trace = traceFrom(body);
  const route = trace?.route_decision ?? {};
  const turnFrame = trace?.turn_frame ?? {};
  const op = trace?.operation_flow_run ?? trace?.operation ?? null;
  const localTrace = Array.isArray(op?.trace)
    ? op.trace.find((event) => event?.component === "prepare_defense_card.local_dispatcher")
    : null;
  return {
    turn,
    requestId,
    status: response.response.status,
    ok: body.ok ?? null,
    user,
    assistant: assistantText(body),
    response_owner: route.response_owner ?? trace?.response_owner ?? null,
    selected_handler: route.selected_handler ?? null,
    route_reason_code: route.reason_code ?? null,
    tool_skill_intents: turnFrame.tool_skill_intents ?? null,
    tool_skill_opportunity: turnFrame.tool_skill_opportunity ?? null,
    operation_status: op?.status ?? null,
    operation_reason: op?.reason ?? null,
    local_dispatcher: localTrace ?? null,
    ai_call_count: op?.ai_call_count ?? op?.metadata?.ai_call_count ?? null,
    executed_tools: body?.response?.executed_tools ?? [],
    tool_execution: body?.response?.tool_execution ?? null,
    direct_effects: turnFrame.direct_effects ?? trace?.direct_effects ?? null,
  };
}

const defaultTurns = [
  "Il me faudrait un filet de sécurité pour le moment où je rentre rincé et que je commande n’importe quoi au lieu de manger correctement.",
  "Oui, c’est exactement ça.",
  "Je la mets où exactement ?",
  "Reformule plutôt : quand je rentre vidé après le travail, j’ai besoin d’aide à ne pas commander compulsivement.",
  "Ok vas-y crée-la.",
  "Finalement je veux plutôt une carte d’attaque pour démarrer mon dossier demain matin.",
];
const turns = process.env.QA_TURNS_JSON
  ? JSON.parse(process.env.QA_TURNS_JSON)
  : defaultTurns;

const raw = [];
const summary = [];
const history = [];
if (process.env.QA_HISTORY_SUMMARY_PATH) {
  const previous = JSON.parse(
    fs.readFileSync(path.resolve(root, process.env.QA_HISTORY_SUMMARY_PATH), "utf8"),
  );
  for (const item of previous) {
    if (Number(item.turn) >= startTurn) continue;
    if (item.user) history.push({ role: "user", content: item.user });
    if (item.assistant) history.push({ role: "assistant", content: item.assistant });
  }
}

for (let index = 0; index < turns.length; index += 1) {
  const turn = startTurn + index;
  const content = turns[index];
  const requestId = `${scope}-t${String(turn).padStart(2, "0")}`;
  const response = await jsonFetch(`${apiUrl}/functions/v1/test-send-message`, {
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
      include_trace: true,
    }),
  });
  const body = response.body ?? {};
  raw.push({ turn, requestId, auth_method: authMethod, user: content, status: response.response.status, body });
  const item = turnSummary(turn, requestId, content, response);
  summary.push(item);
  history.push({ role: "user", content });
  if (item.assistant) history.push({ role: "assistant", content: item.assistant });
  if (turn < turns.length) await sleep(turnDelayMs);
}

fs.writeFileSync(rawPath, `${JSON.stringify(raw, null, 2)}\n`);
fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);

console.log(JSON.stringify({ scope, rawPath, summaryPath, summary }, null, 2));
