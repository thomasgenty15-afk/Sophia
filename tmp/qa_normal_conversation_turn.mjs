import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const BASE_URL = process.env.SOPHIA_LOCAL_URL || "http://127.0.0.1:54321";
const FUNCTION_BASE_URL = process.env.SOPHIA_FUNCTION_URL || BASE_URL;
const PASSWORD = "1234567";
const mode = process.argv[2] || "";
const runId = argValue("run-id");
const message = argValue("message");
const scope = argValue("scope", runId ? `qa-normal-conversation-${runId}` : "");
const outDir = runId
  ? path.join(root, "tmp", "qa-normal-conversation", runId)
  : "";
const stateFile = outDir ? path.join(outDir, "state.json") : "";

function argValue(name, fallback = "") {
  const eq = `--${name}=`;
  const byEq = process.argv.find((arg) => arg.startsWith(eq));
  if (byEq) return byEq.slice(eq.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1] ?? fallback;
  return fallback;
}

function base64url(input) {
  return Buffer.from(input).toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function signJwt(payload, secret) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const sig = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64");
  return `${header}.${body}.${sig.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")}`;
}

function localJwt(role) {
  const now = Math.floor(Date.now() / 1000);
  return signJwt({
    iss: "supabase",
    ref: "local",
    role,
    iat: now - 60,
    exp: now + 60 * 60 * 24 * 365,
  }, "super-secret-jwt-token-with-at-least-32-characters-long");
}

function loadSupabaseStatus() {
  try {
    return JSON.parse(execFileSync("supabase", ["status", "--output", "json"], {
      encoding: "utf8",
      cwd: root,
      stdio: ["ignore", "pipe", "ignore"],
    }));
  } catch {
    return {};
  }
}

async function request(pathname, options = {}, baseUrl = BASE_URL) {
  const res = await fetch(`${baseUrl}${pathname}`, options);
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw_text: text };
  }
  return { status: res.status, ok: res.ok, body, text };
}

function headers(key, bearer = key, extra = {}) {
  return {
    apikey: key,
    authorization: `Bearer ${bearer}`,
    "content-type": "application/json",
    ...extra,
  };
}

function readState() {
  if (!stateFile || !fs.existsSync(stateFile)) return null;
  return JSON.parse(fs.readFileSync(stateFile, "utf8"));
}

function writeState(state) {
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`);
}

function traceShort(body) {
  const trace = body?.conversation_turn_trace ?? body?.trace?.trace ?? body?.trace ?? null;
  const frame = trace?.turn_frame ?? body?.debug?.turn_frame ?? {};
  const route = trace?.route_decision ?? body?.debug?.route_decision ?? {};
  const skillRun = trace?.skill_run ?? null;
  const toolRun = trace?.tool_skill_run ?? null;
  const intents = Array.isArray(frame?.tool_skill_intents)
    ? frame.tool_skill_intents.map((intent) => intent?.operation_type).filter(Boolean)
    : [];
  const entry = frame?.skill_signals?.entry && typeof frame.skill_signals.entry === "object"
    ? Object.entries(frame.skill_signals.entry)
      .filter(([, value]) => value?.detected !== false)
      .map(([key]) => key)
    : [];
  return {
    response_owner: route?.response_owner ?? trace?.response_owner ?? null,
    selected_handler: route?.selected_handler ?? null,
    route_reason: route?.reason_code ?? null,
    safety: frame?.safety?.risk_band ?? trace?.safety_pregate?.risk_band ?? null,
    skill_entry_ids: entry,
    tool_skill_intents: intents,
    opportunity: frame?.tool_skill_opportunity?.type ?? null,
    opportunity_operation: frame?.tool_skill_opportunity?.operation_type ?? null,
    direct_effects: Array.isArray(frame?.direct_effects)
      ? frame.direct_effects.map((effect) => effect?.effect_type).filter(Boolean)
      : [],
    direct_effects_to_run: route?.direct_effects_to_run ?? [],
    confirmation_kind: frame?.confirmation_response?.kind ?? null,
    selected_skill_id: skillRun?.selected_skill_id ?? null,
    tool_status: toolRun?.output?.status ?? null,
    tool_operation: toolRun?.output?.operation_type ?? null,
    executed_tools: body?.response?.executed_tools ?? [],
    tool_execution: body?.response?.tool_execution ?? null,
  };
}

async function restSelect(serviceKey, table, query) {
  const result = await request(`/rest/v1/${table}?${query}`, {
    method: "GET",
    headers: headers(serviceKey, serviceKey, { accept: "application/json" }),
  });
  return {
    table,
    status: result.status,
    ok: result.ok,
    body: result.body,
  };
}

async function deleteRows(serviceKey, table, query) {
  const result = await request(`/rest/v1/${table}?${query}`, {
    method: "DELETE",
    headers: headers(serviceKey, serviceKey, { prefer: "return=minimal" }),
  });
  return { table, status: result.status, ok: result.ok };
}

async function init() {
  if (!runId) throw new Error("--run-id is required");
  const status = loadSupabaseStatus();
  const anonKey = status.ANON_KEY || status.anon_key || localJwt("anon");
  const serviceKey = status.SERVICE_ROLE_KEY || status.service_role_key || localJwt("service_role");
  const email = `qa-normal-${runId}-${Date.now()}@example.com`;
  const signup = await request("/auth/v1/signup", {
    method: "POST",
    headers: headers(anonKey),
    body: JSON.stringify({
      email,
      password: PASSWORD,
      data: { is_test_persona: true, qa_run_id: runId },
    }),
  });
  if (!signup.ok && !String(signup.body?.message ?? signup.body?.msg ?? "").includes("already")) {
    throw new Error(`signup_failed ${signup.status} ${JSON.stringify(signup.body)}`);
  }
  const login = await request("/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: headers(anonKey),
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!login.ok || !login.body?.access_token) {
    throw new Error(`login_failed ${login.status} ${JSON.stringify(login.body)}`);
  }
  const authCheck = await request("/auth/v1/user", {
    headers: headers(anonKey, login.body.access_token),
  });
  if (!authCheck.ok) {
    throw new Error(`auth_check_failed ${authCheck.status} ${JSON.stringify(authCheck.body)}`);
  }
  const state = {
    run_id: runId,
    scope,
    base_url: BASE_URL,
    email,
    user_id: login.body.user?.id,
    anon_key: anonKey,
    service_key: serviceKey,
    access_token: login.body.access_token,
    auth_check: { status: authCheck.status, ok: authCheck.ok },
    force_full_ai: true,
    created_at: new Date().toISOString(),
    turns: [],
  };
  writeState(state);
  console.log(JSON.stringify({
    run_id: state.run_id,
    scope: state.scope,
    email: state.email,
    user_id: state.user_id,
    auth_check: state.auth_check,
    state_file: path.relative(root, stateFile),
  }, null, 2));
}

async function send() {
  if (!runId || !message) throw new Error("--run-id and --message are required");
  const state = readState();
  if (!state) throw new Error(`missing state for ${runId}`);
  const turnNumber = state.turns.length + 1;
  const response = await request("/functions/v1/test-send-message", {
    method: "POST",
    headers: headers(state.anon_key, state.anon_key, {
      "x-user-authorization": `Bearer ${state.access_token}`,
      "x-request-id": `${runId}-t${String(turnNumber).padStart(2, "0")}`,
    }),
    body: JSON.stringify({
      message,
      scope: state.scope,
      force_full_ai: true,
      include_debug: true,
      include_trace: true,
      disable_debounce: true,
      client_now_iso: process.env.SOPHIA_CLIENT_NOW_ISO ||
        "2026-05-22T10:00:00.000+02:00",
    }),
  }, FUNCTION_BASE_URL);
  const assistant = String(response.body?.response?.content ?? response.body?.content ?? "").trim();
  const short = traceShort(response.body);
  const dbSnapshot = {
    user_chat_states: await restSelect(
      state.service_key,
      "user_chat_states",
      `user_id=eq.${state.user_id}&scope=eq.${encodeURIComponent(state.scope)}&select=current_mode,risk_level,temp_memory,updated_at`,
    ),
    scheduled_checkins: await restSelect(
      state.service_key,
      "scheduled_checkins",
      `user_id=eq.${state.user_id}&select=id,status,event_context,draft_message,scheduled_for,created_at&order=created_at.desc&limit=5`,
    ),
  };
  const turn = {
    turn: turnNumber,
    sent_at: new Date().toISOString(),
    user: message,
    http_status: response.status,
    ok: response.ok,
    empty_response: response.body?.empty_response ?? assistant.length === 0,
    aborted: response.body?.aborted ?? false,
    abort_reason: response.body?.abort_reason ?? null,
    assistant,
    trace_short: short,
    db_snapshot: dbSnapshot,
    raw_response: response.body,
  };
  state.turns.push(turn);
  state.updated_at = new Date().toISOString();
  writeState(state);
  console.log(JSON.stringify({
    run_id: runId,
    turn: turnNumber,
    http_status: response.status,
    ok: response.ok,
    assistant,
    trace_short: short,
    state_file: path.relative(root, stateFile),
  }, null, 2));
}

async function cleanup() {
  if (!runId) throw new Error("--run-id is required");
  const state = readState();
  if (!state) throw new Error(`missing state for ${runId}`);
  const tables = [
    "chat_messages",
    "scheduled_checkins",
    "user_chat_states",
    "user_memories",
    "user_topic_memories",
    "memory_items",
  ];
  const cleanupResults = [];
  for (const table of tables) {
    cleanupResults.push(await deleteRows(
      state.service_key,
      table,
      `user_id=eq.${state.user_id}`,
    ));
  }
  const authDelete = await request(`/auth/v1/admin/users/${state.user_id}`, {
    method: "DELETE",
    headers: headers(state.service_key, state.service_key),
  });
  cleanupResults.push({
    table: "auth.users",
    status: authDelete.status,
    ok: authDelete.ok,
  });
  state.cleanup = cleanupResults;
  state.cleaned_at = new Date().toISOString();
  writeState(state);
  console.log(JSON.stringify({ run_id: runId, cleanup: cleanupResults }, null, 2));
}

if (mode === "init") {
  await init();
} else if (mode === "send") {
  await send();
} else if (mode === "cleanup") {
  await cleanup();
} else {
  throw new Error("usage: node tmp/qa_normal_conversation_turn.mjs <init|send|cleanup> --run-id <id> [--message <text>]");
}
