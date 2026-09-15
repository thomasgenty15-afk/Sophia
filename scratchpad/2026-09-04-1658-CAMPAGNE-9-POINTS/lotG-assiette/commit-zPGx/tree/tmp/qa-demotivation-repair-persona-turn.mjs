#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

const persona = String(process.env.QA_PERSONA || "nina").trim();
const date = String(process.env.QA_DATE || "2026-06-02").trim();
const runId = String(process.env.QA_RUN_ID || "").trim();
const turn = Number(process.env.QA_TURN || 0);
const content = String(process.env.QA_CONTENT || "").trim();
const fetchTimeoutMs = Number(process.env.QA_FETCH_TIMEOUT_MS || 180000);
const connectionName = String(process.env.QA_CONNECTION_NAME || "").trim();

if (!persona || !runId || !turn || !content) {
  throw new Error("missing QA_PERSONA, QA_RUN_ID, QA_TURN or QA_CONTENT");
}

const connectionPath = connectionName
  ? path.join(
    root,
    "tests",
    "real-personas",
    persona,
    "connections",
    `${connectionName}.json`,
  )
  : path.join(root, "tests", "real-personas", persona, "connection.json");
const connection = JSON.parse(fs.readFileSync(connectionPath, "utf8"));

function localStatus() {
  const candidates = ["/usr/local/bin/supabase", "supabase"];
  for (const command of candidates) {
    try {
      const raw = execFileSync(command, ["status", "--output", "json"], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      return JSON.parse(
        start >= 0 && end >= start ? raw.slice(start, end + 1) : raw,
      );
    } catch {
      // Try the next candidate.
    }
  }
  throw new Error("local Supabase status unavailable");
}

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

async function restSelect(status, table, query) {
  const serviceRoleKey = status.SERVICE_ROLE_KEY || status.SECRET_KEY || "";
  if (!serviceRoleKey) return { skipped: "missing_service_role_key" };
  const result = await jsonFetch(
    `${status.API_URL}/rest/v1/${table}?${query}`,
    {
      method: "GET",
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
        accept: "application/json",
      },
    },
  );
  return {
    status: result.response.status,
    ok: result.response.ok,
    body: result.body,
  };
}

async function getUserJwt(status) {
  const anonKey = status.ANON_KEY;
  if (connection.refresh_token) {
    const result = await jsonFetch(
      `${status.API_URL}/auth/v1/token?grant_type=refresh_token`,
      {
        method: "POST",
        headers: {
          apikey: anonKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({ refresh_token: connection.refresh_token }),
      },
    );
    if (result.response.ok && result.body?.access_token) {
      return { jwt: result.body.access_token, auth_method: "refresh_token" };
    }
  }

  if (!connection.email || !connection.password) {
    throw new Error("connection has no valid refresh_token or email/password");
  }
  const result = await jsonFetch(
    `${status.API_URL}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: anonKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        email: connection.email,
        password: connection.password,
      }),
    },
  );
  if (!result.response.ok || !result.body?.access_token) {
    throw new Error(`password login failed: ${result.text}`);
  }
  return { jwt: result.body.access_token, auth_method: "password" };
}

const runDir = path.join(
  root,
  "tests",
  "real-personas",
  persona,
  "runs",
  "operations",
);
fs.mkdirSync(runDir, { recursive: true });

const baseName = `${date}-demotivation-repair-${runId}`;
const rawPath = path.join(runDir, `${baseName}.raw.json`);
const summaryPath = path.join(runDir, `${baseName}.summary.json`);
const durablePath = path.join(runDir, `${baseName}.durable.json`);
const scope = `qa-demotivation-repair-${persona}-${date}-${runId}`;

const existingSummary = readJsonArray(summaryPath);
const history = [];
for (const item of existingSummary.slice(-16)) {
  if (item.user) history.push({ role: "user", content: item.user });
  if (item.assistant) {
    history.push({ role: "assistant", content: item.assistant });
  }
}

const status = localStatus();
const { jwt, auth_method: authMethod } = await getUserJwt(status);
const anonKey = status.ANON_KEY;
const requestId = `qa-demotivation-repair-${persona}-${date}-${runId}-t${
  String(turn).padStart(2, "0")
}`;

const result = await jsonFetch(`${status.FUNCTIONS_URL}/test-send-message`, {
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
    channel: connection.channel || "web",
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
const trace = body.conversation_turn_trace ?? body.trace?.trace ?? body.trace ??
  null;
const routeDecision = trace?.route_decision ?? null;
const turnFrame = trace?.turn_frame ?? null;
const operationFlowRun = trace?.operation_flow_run ?? trace?.tool_skill_run ??
  null;
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
  response_owner: trace?.response_owner ?? routeDecision?.response_owner ??
    null,
  selected_handler: operationFlowRun?.selected_handler ??
    routeDecision?.selected_handler ??
    routeDecision?.skill_choisi ??
    null,
  route_reason: routeDecision?.reason_code ??
    routeDecision?.reason ??
    routeDecision?.route_reason ??
    null,
  safety_pregate: trace?.safety_pregate ?? null,
  turn_agenda_summary: trace?.turn_agenda_summary ?? null,
  effect_ledger: trace?.effect_ledger ?? null,
  direct_effects: trace?.direct_effects ?? turnFrame?.direct_effects ?? null,
  pending_confirmation: trace?.pending_tool_skill_confirmation ??
    turnFrame?.pending_tool_skill_confirmation ??
    null,
  memory_plan: trace?.memory_plan ?? null,
  memory_write_candidates_emitted: trace?.memory_write_candidates_emitted ??
    null,
  response_executed_tools: response.executed_tools ?? trace?.executed_tools ??
    [],
  tool_execution: response.tool_execution ?? trace?.tool_execution ?? null,
  trace_id: trace?.turn_id ?? trace?.trace_id ?? requestId,
  trace_error: body.trace_error ?? null,
  operation_flow_run: operationFlowRun,
});
fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);

const userId = encodeURIComponent(connection.user_id);
const encodedScope = encodeURIComponent(scope);
const durable = {
  scope,
  user_id: connection.user_id,
  chat_messages: await restSelect(
    status,
    "chat_messages",
    `user_id=eq.${userId}&scope=eq.${encodedScope}&select=id,role,content,scope,metadata,created_at&order=created_at.asc`,
  ),
  memory_items_recent: await restSelect(
    status,
    "memory_items",
    `user_id=eq.${userId}&select=*&limit=20`,
  ),
  scheduled_checkins_recent: await restSelect(
    status,
    "scheduled_checkins",
    `user_id=eq.${userId}&select=*&limit=20`,
  ),
  turn_summary_logs: await restSelect(
    status,
    "turn_summary_logs",
    `user_id=eq.${userId}&request_id=like.${
      encodeURIComponent(`qa-demotivation-repair-${persona}-${date}-${runId}-%`)
    }&select=*`,
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
      response_owner: trace?.response_owner ?? routeDecision?.response_owner ??
        null,
      selected_handler: operationFlowRun?.selected_handler ??
        routeDecision?.selected_handler ??
        routeDecision?.skill_choisi ??
        null,
      route_reason: routeDecision?.reason_code ??
        routeDecision?.reason ??
        routeDecision?.route_reason ??
        null,
      risk_band: trace?.safety_pregate?.risk_band ?? null,
      executed_tools: response.executed_tools ?? trace?.executed_tools ?? [],
      tool_execution: response.tool_execution ?? trace?.tool_execution ?? null,
      content_preview: text.replace(/\s+/g, " ").slice(0, 900),
      rawPath,
      summaryPath,
      durablePath,
    },
    null,
    2,
  ),
);
