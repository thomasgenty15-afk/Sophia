import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const date = "2026-05-06";
const apiUrl = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
function localStatus() {
  try {
    return JSON.parse(
      execFileSync("supabase", ["status", "--output", "json"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
  } catch {
    return {};
  }
}
const statusJson = localStatus();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  statusJson.SERVICE_ROLE_KEY || statusJson.SECRET_KEY || "";
const connectionName = process.env.QA_CONNECTION_NAME;
const runId = process.env.QA_RUN_ID;
const turn = Number(process.env.QA_TURN || 0);
const content = String(process.env.QA_CONTENT || "").trim();
const jwtFile = process.env.QA_JWT_FILE;
const familyId = process.env.QA_FAMILY_ID || "fstress1";
const scope = `qa-all-skills-ai-stress-${date}-${familyId}-${runId}`;

if (!connectionName || !runId || !turn || !content || !jwtFile) {
  throw new Error(
    "missing QA_CONNECTION_NAME, QA_RUN_ID, QA_TURN, QA_CONTENT or QA_JWT_FILE",
  );
}

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const runDir = path.join(root, "tests/real-personas/qa-skill/runs/all_skills");
const connectionPath = path.join(
  root,
  `tests/real-personas/qa-skill/connections/${connectionName}.json`,
);
const connection = JSON.parse(fs.readFileSync(connectionPath, "utf8"));
const jwt = fs.readFileSync(jwtFile, "utf8").trim();

const rawPath = path.join(
  runDir,
  `${date}-ai-stress-${familyId}-${runId}.raw.json`,
);
const summaryPath = path.join(
  runDir,
  `${date}-ai-stress-${familyId}-${runId}.summary.json`,
);
const durablePath = path.join(
  runDir,
  `${date}-ai-stress-${familyId}-${runId}.durable.json`,
);

function readJsonArray(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Array.isArray(parsed) ? parsed : [];
}

async function jsonFetch(url, options, timeoutMs = 90_000) {
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

function detectedSkillIds(record) {
  if (!record || typeof record !== "object") return [];
  return Object.entries(record)
    .filter(([, value]) => value && typeof value === "object" && value.detected)
    .map(([key]) => key);
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
for (const item of existingSummary.slice(-10)) {
  if (item.user) history.push({ role: "user", content: item.user });
  if (item.assistant) {
    history.push({ role: "assistant", content: item.assistant });
  }
}

const requestId = `qa-all-skills-ai-stress-${date}-${familyId}-${runId}-t${
  String(turn).padStart(2, "0")
}`;
const result = await jsonFetch(`${apiUrl}/functions/v1/test-send-message`, {
  method: "POST",
  headers: {
    authorization: `Bearer ${jwt}`,
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
  response_owner: trace?.response_owner ?? routeDecision?.response_owner ??
    null,
  selected_handler: routeDecision?.selected_handler ?? null,
  route_reason_code: routeDecision?.reason_code ?? null,
  route_decision: routeDecision,
  safety_pregate: trace?.safety_pregate ?? null,
  direct_effects: trace?.direct_effects ?? turnFrame?.direct_effects ?? null,
  turn_frame_direct_effects: turnFrame?.direct_effects ?? null,
  skill_entry_ids: detectedSkillIds(turnFrame?.skill_signals?.entry),
  skill_lifecycle_ids: detectedSkillIds(turnFrame?.skill_signals?.lifecycle),
  tool_skill_run: trace?.tool_skill_run ?? null,
  pending_tool_skill_confirmation: trace?.pending_tool_skill_confirmation ??
    turnFrame?.pending_tool_skill_confirmation ??
    null,
  recommendation: trace?.recommendation ?? null,
  memory_write_candidates_emitted: trace?.memory_write_candidates_emitted ??
    null,
  trace_error: body.trace_error ?? null,
});
fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);

const userId = encodeURIComponent(connection.user_id);
const durable = {
  memory_items: await restSelect(
    "memory_items",
    `user_id=eq.${userId}&select=id,kind,content_text,sensitivity_level,should_persist_default,created_at&order=created_at.desc`,
  ),
  user_plan_items: await restSelect(
    "user_plan_items",
    `user_id=eq.${userId}&select=id,title,status,tracking_type,updated_at&order=activation_order.asc`,
  ),
  user_plan_item_entries: await restSelect(
    "user_plan_item_entries",
    `user_id=eq.${userId}&select=id,plan_item_id,entry_kind,outcome,value_numeric,effective_at,metadata,created_at&order=created_at.desc`,
  ),
  scheduled_checkins: await restSelect(
    "scheduled_checkins",
    `user_id=eq.${userId}&select=id,status,scheduled_for,event_context,message_payload,created_at&order=created_at.desc`,
  ),
  user_recurring_reminders: await restSelect(
    "user_recurring_reminders",
    `user_id=eq.${userId}&select=id,status,scheduled_days,local_time_hhmm,message_instruction,created_at&order=created_at.desc`,
  ),
};
fs.writeFileSync(durablePath, `${JSON.stringify(durable, null, 2)}\n`);

console.log(JSON.stringify(
  {
    turn,
    status: result.response.status,
    empty_response: text.trim().length === 0,
    aborted: body.aborted ?? response.aborted ?? false,
    abort_reason: body.abort_reason ?? response.abort_reason ?? null,
    tool_execution: response.tool_execution ?? null,
    executed_tools: response.executed_tools ?? [],
    response_owner: trace?.response_owner ?? routeDecision?.response_owner ??
      null,
    selected_handler: routeDecision?.selected_handler ?? null,
    reason_code: routeDecision?.reason_code ?? null,
    safety_risk_band: trace?.safety_pregate?.risk_band ?? null,
    safety_allow_side_effects: trace?.safety_pregate?.allow_side_effects ??
      null,
    tool_skill_type: trace?.tool_skill_run?.operation_type ?? null,
    has_pending_confirmation: Boolean(trace?.pending_tool_skill_confirmation) ||
      Boolean(turnFrame?.pending_tool_skill_confirmation),
    content_preview: text.replace(/\s+/g, " ").slice(0, 700),
    rawPath,
    summaryPath,
    durablePath,
  },
  null,
  2,
));
