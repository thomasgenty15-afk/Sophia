import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const command = String(process.argv[2] || "").trim();
const persona = String(process.env.QA_PERSONA || "rose").trim();
const runId = String(process.env.QA_RUN_ID || "").trim();
const date = String(process.env.QA_DATE || "2026-05-20").trim();
const turn = Number(process.env.QA_TURN || 0);
const content = String(process.env.QA_CONTENT || "").trim();
const apiUrl = String(process.env.SUPABASE_URL || "http://127.0.0.1:54321")
  .trim();
const fetchTimeoutMs = Number(process.env.QA_FETCH_TIMEOUT_MS || 180_000);

if (!command || !runId) {
  throw new Error(
    "usage: QA_RUN_ID=<run> node scripts/qa_adjust_plan_whole_plan_turn.mjs <snapshot|turn|inspect|cleanup>",
  );
}
if (command === "turn" && (!turn || !content)) {
  throw new Error("turn command requires QA_TURN and QA_CONTENT");
}

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const runDir = path.join(
  root,
  "tests/real-personas",
  persona,
  "runs",
  "operations",
);
fs.mkdirSync(runDir, { recursive: true });

const connectionPath = path.join(
  root,
  "tests/real-personas",
  persona,
  "connection.json",
);
const connection = JSON.parse(fs.readFileSync(connectionPath, "utf8"));
const scope = `qa-${persona}-${date}-adjust-plan-whole-plan-taxonomy-${runId}`;
const filePrefix = `${date}-adjust-plan-whole-plan-taxonomy-${runId}`;
const snapshotPath = path.join(runDir, `${filePrefix}.snapshot.json`);
const rawPath = path.join(runDir, `${filePrefix}.raw.json`);
const summaryPath = path.join(runDir, `${filePrefix}.summary.json`);
const durablePath = path.join(runDir, `${filePrefix}.durable.json`);
const cleanupPath = path.join(runDir, `${filePrefix}.cleanup.json`);

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
    }) || safeExec("supabase", ["status", "--output", "json"], { cwd: root });
  if (!raw) return {};
  try {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    const jsonText = start >= 0 && end >= start
      ? raw.slice(start, end + 1)
      : raw;
    return JSON.parse(jsonText);
  } catch {
    return {};
  }
}

const env = readEnvFile(path.join(root, "supabase/.env"));
const status = localStatus();
const anonKey = process.env.SOPHIA_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY || status.ANON_KEY || env.SUPABASE_ANON_KEY ||
  "";
const serviceRoleKey = process.env.SOPHIA_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY ||
  status.SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!anonKey) throw new Error("missing local anon key");
if (!serviceRoleKey) throw new Error("missing local service role key");

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

async function authToken() {
  const email = String(connection.email || "").trim();
  const password = String(connection.password || "1234567").trim();
  const result = await jsonFetch(
    `${apiUrl}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: anonKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    },
  );
  const token = String(result.body?.access_token || "");
  if (!result.response.ok || !token) {
    throw new Error(`auth failed: ${result.response.status} ${result.text}`);
  }
  const verify = await jsonFetch(`${apiUrl}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${token}`,
    },
  });
  if (!verify.response.ok) {
    throw new Error(
      `auth verify failed: ${verify.response.status} ${verify.text}`,
    );
  }
  return token;
}

async function rest(pathname, options = {}) {
  const response = await fetch(`${apiUrl}/rest/v1/${pathname}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      accept: "application/json",
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw_text: text };
  }
  return { status: response.status, ok: response.ok, body, text };
}

function readJsonArray(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return Array.isArray(parsed) ? parsed : [];
}

function ids(values) {
  return values.map((value) => String(value)).filter(Boolean);
}

function inFilter(values) {
  return `in.(${ids(values).map(encodeURIComponent).join(",")})`;
}

async function selectState(label = "inspect") {
  const userId = encodeURIComponent(connection.user_id);
  const [
    plans,
    planItems,
    entries,
    messages,
    states,
    snapshots,
    traces,
  ] = await Promise.all([
    rest(`user_plans_v2?user_id=eq.${userId}&select=*&order=created_at.asc`),
    rest(
      `user_plan_items?user_id=eq.${userId}&select=*&order=activation_order.asc`,
    ),
    rest(
      `user_plan_item_entries?user_id=eq.${userId}&select=*&order=created_at.asc&limit=500`,
    ),
    rest(
      `chat_messages?user_id=eq.${userId}&scope=eq.${
        encodeURIComponent(scope)
      }&select=*&order=created_at.asc`,
    ),
    rest(`user_chat_states?user_id=eq.${userId}&select=*`),
    rest(
      `system_runtime_snapshots?user_id=eq.${userId}&select=id,snapshot_type,payload,created_at&order=created_at.desc&limit=80`,
    ),
    rest(
      `conversation_turn_traces?user_id=eq.${userId}&request_id=like.${
        encodeURIComponent(
          `qa-${persona}-${date}-adjust-plan-whole-plan-taxonomy-${runId}-%`,
        )
      }&select=*&order=ts.asc`,
    ),
  ]);
  return {
    label,
    captured_at: new Date().toISOString(),
    persona,
    run_id: runId,
    user_id: connection.user_id,
    scope,
    plans: Array.isArray(plans.body) ? plans.body : [],
    user_plan_items: Array.isArray(planItems.body) ? planItems.body : [],
    user_plan_item_entries: Array.isArray(entries.body) ? entries.body : [],
    chat_messages: Array.isArray(messages.body) ? messages.body : [],
    user_chat_states: Array.isArray(states.body) ? states.body : [],
    system_runtime_snapshots: Array.isArray(snapshots.body)
      ? snapshots.body
      : [],
    conversation_turn_traces: Array.isArray(traces.body) ? traces.body : [],
    rest_status: {
      plans: plans.status,
      user_plan_items: planItems.status,
      user_plan_item_entries: entries.status,
      chat_messages: messages.status,
      user_chat_states: states.status,
      system_runtime_snapshots: snapshots.status,
      conversation_turn_traces: traces.status,
    },
  };
}

function assistantText(body) {
  return String(
    body?.response?.content ?? body?.response?.reply ?? body?.content ?? "",
  );
}

function compactGuidance(trace) {
  const candidates = [
    trace?.tool_skill_run?.coaching_guidance,
    trace?.tool_skill_run?.draft?.coaching_guidance,
    trace?.operation_flow_run?.coaching_guidance,
    trace?.operation_flow_run?.coach_guidance,
    trace?.turn_frame?.coaching_guidance,
  ].filter(Boolean);
  return candidates[0] ?? null;
}

function compactTrace(body) {
  const trace = body?.conversation_turn_trace ?? body?.trace?.trace ??
    body?.trace ?? null;
  const routeDecision = trace?.route_decision ?? null;
  const turnFrame = trace?.turn_frame ?? null;
  const operationFlowRun = trace?.operation_flow_run ?? null;
  const toolSkillRun = trace?.tool_skill_run ?? null;
  const pendingAdjustPlanDraftReview =
    trace?.pending_adjust_plan_draft_review ??
      turnFrame?.pending_adjust_plan_draft_review ??
      (toolSkillRun?.draft_review &&
          ["draft_review", "pending_confirmation", "ask_question"].includes(
            String(toolSkillRun?.status ?? ""),
          )
        ? {
          operation_type: "adjust_plan_item",
          source: "tool_skill_run.draft_review",
          status: toolSkillRun?.status ?? null,
        }
        : null);
  const pendingConfirmation = trace?.pending_tool_skill_confirmation ??
    turnFrame?.pending_tool_skill_confirmation ??
    pendingAdjustPlanDraftReview ??
    null;
  return {
    response_owner: trace?.response_owner ?? routeDecision?.response_owner ??
      null,
    selected_handler: routeDecision?.selected_handler ?? null,
    route_reason_code: routeDecision?.reason_code ?? null,
    safety_pregate: trace?.safety_pregate ?? null,
    operation_intents: turnFrame?.operation_intents ?? [],
    direct_effects: trace?.direct_effects ?? turnFrame?.direct_effects ?? [],
    operation_flow_run: operationFlowRun,
    tool_skill_run: toolSkillRun,
    coaching_guidance: compactGuidance(trace),
    pending_tool_skill_confirmation: pendingConfirmation,
    pending_adjust_plan_draft_review: pendingAdjustPlanDraftReview,
    pending_operation_resolution: trace?.pending_operation_resolution ??
      turnFrame?.pending_operation_resolution ?? null,
    memory_plan: trace?.memory_plan ?? null,
    trace_id: trace?.turn_id ?? null,
  };
}

async function sendTurn() {
  const token = await authToken();
  const existingSummary = readJsonArray(summaryPath);
  const history = [];
  for (const item of existingSummary.slice(-14)) {
    if (item.user) history.push({ role: "user", content: item.user });
    if (item.assistant) {
      history.push({ role: "assistant", content: item.assistant });
    }
  }
  const requestId =
    `qa-${persona}-${date}-adjust-plan-whole-plan-taxonomy-${runId}-t${
      String(turn).padStart(2, "0")
    }`;
  const result = await jsonFetch(`${apiUrl}/functions/v1/test-send-message`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${anonKey}`,
      "x-user-authorization": `Bearer ${token}`,
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
      enable_adjust_plan_coach_guidance: true,
    }),
  });

  const body = result.body ?? {};
  const response = body.response ?? {};
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

  const trace = compactTrace(body);
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
    response_owner: trace.response_owner,
    selected_handler: trace.selected_handler,
    route_reason_code: trace.route_reason_code,
    operation_intents: trace.operation_intents,
    direct_effects: trace.direct_effects,
    operation_flow_run: trace.operation_flow_run,
    tool_skill_run: trace.tool_skill_run,
    coaching_guidance: trace.coaching_guidance,
    pending_tool_skill_confirmation: trace.pending_tool_skill_confirmation,
    pending_operation_resolution: trace.pending_operation_resolution,
    safety_pregate: trace.safety_pregate,
    memory_plan: trace.memory_plan,
    trace_id: trace.trace_id ?? requestId,
    trace_error: body.trace_error ?? null,
  });
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);

  const durable = await selectState("durable");
  fs.writeFileSync(durablePath, `${JSON.stringify(durable, null, 2)}\n`);

  console.log(JSON.stringify(
    {
      turn,
      status: result.response.status,
      ok: body.ok ?? null,
      empty_response: text.trim().length === 0,
      aborted: body.aborted ?? response.aborted ?? false,
      response_owner: trace.response_owner,
      selected_handler: trace.selected_handler,
      reason_code: trace.route_reason_code,
      operation_flow_status: trace.operation_flow_run?.status ?? null,
      operation_type: trace.operation_flow_run?.operation_type ?? null,
      operation_id: trace.operation_flow_run?.operation_id ?? null,
      has_pending_confirmation: Boolean(trace.pending_tool_skill_confirmation),
      direct_effects_count: Array.isArray(trace.direct_effects)
        ? trace.direct_effects.length
        : null,
      content_preview: text.replace(/\s+/g, " ").slice(0, 1200),
      summaryPath,
      durablePath,
    },
    null,
    2,
  ));
}

async function restoreRows(
  table,
  beforeRows,
  currentRows,
  matchColumns = ["id"],
) {
  const currentById = new Map(
    (currentRows || []).map((row) => [String(row.id), row]),
  );
  const restored = [];
  for (const row of beforeRows || []) {
    const existing = currentById.get(String(row.id));
    if (existing) {
      const result = await rest(
        `${table}?id=eq.${encodeURIComponent(row.id)}&user_id=eq.${
          encodeURIComponent(connection.user_id)
        }`,
        {
          method: "PATCH",
          headers: { prefer: "return=representation" },
          body: JSON.stringify(row),
        },
      );
      restored.push({
        table,
        id: row.id,
        action: "patch",
        ok: result.ok,
        status: result.status,
      });
    } else {
      const conflict = matchColumns.join(",");
      const result = await rest(
        `${table}?on_conflict=${encodeURIComponent(conflict)}`,
        {
          method: "POST",
          headers: {
            prefer: "resolution=merge-duplicates,return=representation",
          },
          body: JSON.stringify(row),
        },
      );
      restored.push({
        table,
        id: row.id,
        action: "insert",
        ok: result.ok,
        status: result.status,
      });
    }
  }
  return restored;
}

async function cleanup() {
  if (!fs.existsSync(snapshotPath)) {
    throw new Error(`missing snapshot: ${snapshotPath}`);
  }
  const before = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  const current = await selectState("after_before_cleanup");
  const beforePlanIds = new Set(ids(before.plans?.map((row) => row.id) ?? []));
  const beforeItemIds = new Set(
    ids(before.user_plan_items?.map((row) => row.id) ?? []),
  );
  const beforeEntryIds = new Set(
    ids(before.user_plan_item_entries?.map((row) => row.id) ?? []),
  );
  const currentPlanIds = ids(current.plans.map((row) => row.id));
  const currentItemIds = ids(current.user_plan_items.map((row) => row.id));
  const currentEntryIds = ids(
    current.user_plan_item_entries.map((row) => row.id),
  );

  const createdPlanIds = currentPlanIds.filter((id) => !beforePlanIds.has(id));
  const createdItemIds = currentItemIds.filter((id) => !beforeItemIds.has(id));
  const createdEntryIds = currentEntryIds.filter((id) =>
    !beforeEntryIds.has(id)
  );

  const deleted = [];
  if (createdEntryIds.length) {
    const result = await rest(
      `user_plan_item_entries?user_id=eq.${
        encodeURIComponent(connection.user_id)
      }&id=${inFilter(createdEntryIds)}`,
      { method: "DELETE", headers: { prefer: "return=representation" } },
    );
    deleted.push({
      table: "user_plan_item_entries",
      ids: createdEntryIds,
      ok: result.ok,
      status: result.status,
    });
  }
  if (createdItemIds.length) {
    const result = await rest(
      `user_plan_items?user_id=eq.${
        encodeURIComponent(connection.user_id)
      }&id=${inFilter(createdItemIds)}`,
      { method: "DELETE", headers: { prefer: "return=representation" } },
    );
    deleted.push({
      table: "user_plan_items",
      ids: createdItemIds,
      ok: result.ok,
      status: result.status,
    });
  }
  if (createdPlanIds.length) {
    const result = await rest(
      `user_plans_v2?user_id=eq.${encodeURIComponent(connection.user_id)}&id=${
        inFilter(createdPlanIds)
      }`,
      { method: "DELETE", headers: { prefer: "return=representation" } },
    );
    deleted.push({
      table: "plans",
      ids: createdPlanIds,
      ok: result.ok,
      status: result.status,
    });
  }

  const restored = [
    ...await restoreRows(
      "user_plans_v2",
      before.plans ?? [],
      current.plans ?? [],
    ),
    ...await restoreRows(
      "user_plan_items",
      before.user_plan_items ?? [],
      current.user_plan_items ?? [],
    ),
    ...await restoreRows(
      "user_plan_item_entries",
      before.user_plan_item_entries ?? [],
      current.user_plan_item_entries ?? [],
    ),
  ];

  const messageDelete = await rest(
    `chat_messages?user_id=eq.${
      encodeURIComponent(connection.user_id)
    }&scope=eq.${encodeURIComponent(scope)}`,
    { method: "DELETE", headers: { prefer: "return=representation" } },
  );
  deleted.push({
    table: "chat_messages",
    scope,
    ok: messageDelete.ok,
    status: messageDelete.status,
  });

  const beforeSnapshotIds = new Set(
    ids(before.system_runtime_snapshots?.map((row) => row.id) ?? []),
  );
  const runtimeIds = ids(
    current.system_runtime_snapshots
      .filter((row) => !beforeSnapshotIds.has(String(row.id)))
      .map((row) => row.id),
  );
  if (runtimeIds.length) {
    const result = await rest(
      `system_runtime_snapshots?user_id=eq.${
        encodeURIComponent(connection.user_id)
      }&id=${inFilter(runtimeIds)}`,
      { method: "DELETE", headers: { prefer: "return=representation" } },
    );
    deleted.push({
      table: "system_runtime_snapshots",
      ids: runtimeIds,
      ok: result.ok,
      status: result.status,
    });
  }

  const after = await selectState("after_cleanup");
  const cleanupReport = {
    persona,
    run_id: runId,
    user_id: connection.user_id,
    scope,
    before_counts: {
      plans: before.plans?.length ?? null,
      user_plan_items: before.user_plan_items?.length ?? null,
      user_plan_item_entries: before.user_plan_item_entries?.length ?? null,
    },
    after_before_cleanup: current,
    deleted,
    restored,
    after_cleanup: after,
    remaining_scope_messages: after.chat_messages.length,
    remaining_created_plan_ids: ids(after.plans.map((row) => row.id)).filter((
      id,
    ) => !beforePlanIds.has(id)),
    remaining_created_item_ids: ids(after.user_plan_items.map((row) => row.id))
      .filter((id) => !beforeItemIds.has(id)),
  };
  fs.writeFileSync(cleanupPath, `${JSON.stringify(cleanupReport, null, 2)}\n`);
  console.log(JSON.stringify(
    {
      cleanupPath,
      remaining_scope_messages: cleanupReport.remaining_scope_messages,
      remaining_created_plan_ids: cleanupReport.remaining_created_plan_ids,
      remaining_created_item_ids: cleanupReport.remaining_created_item_ids,
      deleted: deleted.map((row) => ({
        table: row.table,
        count: row.ids?.length ?? (row.scope ? "scope" : 0),
        ok: row.ok,
        status: row.status,
      })),
      restored_count: restored.length,
    },
    null,
    2,
  ));
}

if (command === "snapshot") {
  const state = await selectState("before");
  fs.writeFileSync(snapshotPath, `${JSON.stringify(state, null, 2)}\n`);
  console.log(JSON.stringify(
    {
      snapshotPath,
      scope,
      plans: state.plans.length,
      user_plan_items: state.user_plan_items.length,
      user_plan_item_entries: state.user_plan_item_entries.length,
    },
    null,
    2,
  ));
} else if (command === "turn") {
  await sendTurn();
} else if (command === "inspect") {
  const state = await selectState("inspect");
  fs.writeFileSync(durablePath, `${JSON.stringify(state, null, 2)}\n`);
  console.log(JSON.stringify(
    {
      durablePath,
      scope_messages: state.chat_messages.length,
      plans: state.plans.map((row) => ({
        id: row.id,
        status: row.status,
        version: row.version,
        title: row.title,
      })),
      items: state.user_plan_items.map((row) => ({
        id: row.id,
        plan_id: row.plan_id,
        status: row.status,
        title: row.title,
      })),
    },
    null,
    2,
  ));
} else if (command === "cleanup") {
  await cleanup();
} else {
  throw new Error(`unknown command: ${command}`);
}
