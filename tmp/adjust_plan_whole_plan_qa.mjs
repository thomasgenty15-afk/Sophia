import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const persona = "rose";
const date = String(process.env.QA_DATE || "2026-05-19").trim();
const family = String(process.env.QA_FAMILY || "adjust-plan-whole-plan").trim();
const runId = String(process.env.QA_RUN_ID || "whole-plan-r34-postfix").trim();
const action = String(process.env.QA_ACTION || "send").trim();
const turn = Number(process.env.QA_TURN || 0);
const content = String(process.env.QA_CONTENT || "").trim();
const channel = process.env.QA_CHANNEL || "web";
const fetchTimeoutMs = Number(process.env.QA_FETCH_TIMEOUT_MS || 240_000);

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
const connection = JSON.parse(
  fs.readFileSync(
    path.join(root, "tests/real-personas", persona, "connection.json"),
    "utf8",
  ),
);
const userId = String(connection.user_id || "").trim();
const scope = `qa-rose-${date}-${family}-${runId}`;
const baseName = `${date}-${family}-${runId}`;
const rawPath = path.join(runDir, `${baseName}.raw.json`);
const summaryPath = path.join(runDir, `${baseName}.summary.json`);
const snapshotPath = path.join(runDir, `${baseName}.snapshot.json`);
const durablePath = path.join(runDir, `${baseName}.durable.json`);
const cleanupPath = path.join(runDir, `${baseName}.cleanup.json`);

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
  if (
    process.env.QA_SUPABASE_API_URL &&
    process.env.QA_SUPABASE_ANON_KEY &&
    process.env.QA_SUPABASE_SERVICE_ROLE_KEY
  ) {
    return {
      API_URL: process.env.QA_SUPABASE_API_URL,
      ANON_KEY: process.env.QA_SUPABASE_ANON_KEY,
      SERVICE_ROLE_KEY: process.env.QA_SUPABASE_SERVICE_ROLE_KEY,
    };
  }
  const raw = safeExec("/usr/local/bin/supabase", [
    "status",
    "--output",
    "json",
  ], {
    cwd: root,
    timeout: 10_000,
  });
  if (!raw) throw new Error("missing local supabase status");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  return JSON.parse(
    start >= 0 && end >= start ? raw.slice(start, end + 1) : raw,
  );
}

const status = localStatus();
const apiUrl = status.API_URL || "http://127.0.0.1:54321";
const functionApiUrl = String(process.env.QA_FUNCTION_API_URL || apiUrl).trim();
const anonKey = status.ANON_KEY;
const serviceRoleKey = status.SERVICE_ROLE_KEY || status.SECRET_KEY;
if (!userId || !anonKey || !serviceRoleKey) {
  throw new Error("missing userId, anonKey or serviceRoleKey");
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
    return { response, body, text };
  } finally {
    clearTimeout(timeout);
  }
}

async function loginJwt() {
  const body = {
    email: connection.email,
    password: connection.password || "1234567",
  };
  const result = await jsonFetch(
    `${apiUrl}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: anonKey,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );
  const token = String(result.body?.access_token || "").trim();
  if (!token) {
    throw new Error(`login_failed:${result.response.status}:${result.text}`);
  }

  const verify = await jsonFetch(`${apiUrl}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${token}`,
    },
  });
  if (!verify.response.ok || verify.body?.id !== userId) {
    throw new Error(
      `jwt_verify_failed:${verify.response.status}:${verify.text}`,
    );
  }
  return token;
}

function restHeaders({ service = true, prefer } = {}) {
  const key = service ? serviceRoleKey : anonKey;
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    ...(prefer ? { prefer } : {}),
    "content-type": "application/json",
    accept: "application/json",
  };
}

async function restSelect(table, query) {
  const result = await jsonFetch(`${apiUrl}/rest/v1/${table}?${query}`, {
    method: "GET",
    headers: restHeaders(),
  });
  if (!result.response.ok) {
    throw new Error(
      `rest_select_failed:${table}:${result.response.status}:${result.text}`,
    );
  }
  return result.body ?? [];
}

async function restPatch(table, query, patch) {
  const result = await jsonFetch(`${apiUrl}/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: restHeaders({ prefer: "return=representation" }),
    body: JSON.stringify(patch),
  });
  if (!result.response.ok) {
    throw new Error(
      `rest_patch_failed:${table}:${result.response.status}:${result.text}`,
    );
  }
  return result.body ?? [];
}

async function restDelete(table, query) {
  const result = await jsonFetch(`${apiUrl}/rest/v1/${table}?${query}`, {
    method: "DELETE",
    headers: restHeaders({ prefer: "return=representation" }),
  });
  if (!result.response.ok) {
    throw new Error(
      `rest_delete_failed:${table}:${result.response.status}:${result.text}`,
    );
  }
  return result.body ?? [];
}

async function snapshot(label) {
  const encodedUser = encodeURIComponent(userId);
  const encodedScope = encodeURIComponent(scope);
  const [
    plans,
    userPlanItems,
    chatMessages,
    userChatStates,
    snapshots,
    entries,
  ] = await Promise.all([
    restSelect(
      "user_plans_v2",
      `user_id=eq.${encodedUser}&select=*&order=created_at.asc`,
    ),
    restSelect(
      "user_plan_items",
      `user_id=eq.${encodedUser}&select=*&order=activation_order.asc`,
    ),
    restSelect(
      "chat_messages",
      `user_id=eq.${encodedUser}&scope=eq.${encodedScope}&select=*&order=created_at.asc`,
    ),
    restSelect(
      "user_chat_states",
      `user_id=eq.${encodedUser}&scope=eq.${encodedScope}&select=*`,
    ),
    restSelect(
      "system_runtime_snapshots",
      `user_id=eq.${encodedUser}&select=id,snapshot_type,payload,created_at&order=created_at.desc&limit=20`,
    ),
    restSelect(
      "user_plan_item_entries",
      `user_id=eq.${encodedUser}&select=*&order=created_at.desc&limit=50`,
    ),
  ]);
  return {
    label,
    captured_at: new Date().toISOString(),
    persona,
    run_id: runId,
    user_id: userId,
    scope,
    plans,
    user_plan_items: userPlanItems,
    chat_messages: chatMessages,
    user_chat_states: userChatStates,
    system_runtime_snapshots: snapshots,
    user_plan_item_entries: entries,
  };
}

function itemRestorePatch(item) {
  const allowed = [
    "cycle_id",
    "transformation_id",
    "plan_id",
    "dimension",
    "kind",
    "status",
    "title",
    "description",
    "tracking_type",
    "activation_order",
    "activation_condition",
    "current_habit_state",
    "support_mode",
    "support_function",
    "target_reps",
    "current_reps",
    "cadence_label",
    "scheduled_days",
    "time_of_day",
    "start_after_item_id",
    "phase_id",
    "phase_order",
    "cards_status",
    "payload",
    "activated_at",
    "updated_at",
  ];
  return Object.fromEntries(allowed.map((key) => [key, item[key] ?? null]));
}

function planRestorePatch(plan) {
  return {
    cycle_id: plan.cycle_id ?? null,
    transformation_id: plan.transformation_id ?? null,
    status: plan.status ?? null,
    version: plan.version ?? null,
    title: plan.title ?? null,
    content: plan.content ?? null,
    updated_at: plan.updated_at ?? null,
  };
}

async function writeSnapshot() {
  const before = await snapshot("before");
  fs.writeFileSync(snapshotPath, `${JSON.stringify(before, null, 2)}\n`);
  console.log(JSON.stringify(
    {
      ok: true,
      action: "snapshot",
      snapshotPath,
      plans: before.plans.length,
      user_plan_items: before.user_plan_items.length,
      scope,
    },
    null,
    2,
  ));
}

async function sendTurn() {
  if (!turn || !content) throw new Error("missing QA_TURN or QA_CONTENT");
  if (!fs.existsSync(snapshotPath)) await writeSnapshot();
  const jwt = await loginJwt();
  const existingSummary = readJsonArray(summaryPath);
  const history = [];
  for (const item of existingSummary.slice(-16)) {
    if (item.user) history.push({ role: "user", content: item.user });
    if (item.assistant) {
      history.push({ role: "assistant", content: item.assistant });
    }
  }
  const requestId = `qa-rose-${date}-adjust-plan-whole-plan-${runId}-t${
    String(turn).padStart(2, "0")
  }`;
  const result = await jsonFetch(
    `${functionApiUrl}/functions/v1/test-send-message`,
    {
      method: "POST",
      headers: {
        apikey: anonKey,
        authorization: `Bearer ${anonKey}`,
        "x-user-authorization": `Bearer ${jwt}`,
        "content-type": "application/json",
        "x-request-id": requestId,
      },
      body: JSON.stringify({
        user_id: userId,
        channel,
        scope,
        content,
        history,
        disable_debounce: true,
        force_full_ai: true,
        enable_adjust_plan_coach_guidance:
          String(process.env.QA_ENABLE_ADJUST_PLAN_COACH || "1").trim() !== "0",
      }),
    },
  );
  const body = result.body ?? {};
  const response = body.response ?? {};
  const trace = body.conversation_turn_trace ?? null;
  const routeDecision = trace?.route_decision ?? null;
  const turnFrame = trace?.turn_frame ?? null;
  const operationFlowRun = trace?.operation_flow_run ?? null;
  const pendingConfirmation = trace?.pending_tool_skill_confirmation ??
    turnFrame?.pending_tool_skill_confirmation ?? null;
  const text = String(
    response?.content ?? response?.reply ?? body?.content ?? "",
  );
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
    selected_handler: operationFlowRun?.selected_handler ??
      routeDecision?.selected_handler ?? null,
    route_selected_handler: routeDecision?.selected_handler ?? null,
    route_reason_code: routeDecision?.reason_code ?? null,
    operation_flow_run: operationFlowRun,
    tool_skill_run: trace?.tool_skill_run ?? null,
    coaching_guidance_audit: trace?.tool_skill_run?.coaching_guidance_audit ??
      operationFlowRun?.coaching_guidance_audit ?? null,
    coaching_guidance: trace?.tool_skill_run?.coaching_guidance ??
      operationFlowRun?.coaching_guidance ?? null,
    pending_tool_skill_confirmation: pendingConfirmation,
    pending_operation_resolution: trace?.pending_operation_resolution ??
      turnFrame?.pending_operation_resolution ?? null,
    safety_pregate: trace?.safety_pregate ?? null,
    direct_effects: trace?.direct_effects ?? turnFrame?.direct_effects ?? null,
    memory_plan: trace?.memory_plan ?? null,
    trace_id: trace?.turn_id ?? requestId,
    trace_error: body.trace_error ?? null,
  });
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  const durable = await snapshot("durable_after_turn");
  fs.writeFileSync(durablePath, `${JSON.stringify(durable, null, 2)}\n`);
  console.log(JSON.stringify(
    {
      turn,
      status: result.response.status,
      empty_response: text.trim().length === 0,
      aborted: body.aborted ?? response.aborted ?? false,
      tool_execution: response.tool_execution ?? null,
      executed_tools: response.executed_tools ?? [],
      response_owner: trace?.response_owner ?? routeDecision?.response_owner ??
        null,
      selected_handler: operationFlowRun?.selected_handler ??
        routeDecision?.selected_handler ?? null,
      route_selected_handler: routeDecision?.selected_handler ?? null,
      reason_code: routeDecision?.reason_code ?? null,
      operation_flow_status: operationFlowRun?.status ?? null,
      operation_id: operationFlowRun?.operation_id ?? null,
      has_pending_confirmation: Boolean(pendingConfirmation),
      content_preview: text.replace(/\s+/g, " ").slice(0, 1200),
      rawPath,
      summaryPath,
      durablePath,
      auth_method: "password_login_verified",
    },
    null,
    2,
  ));
}

async function cleanup() {
  if (!fs.existsSync(snapshotPath)) {
    throw new Error(`missing snapshot ${snapshotPath}`);
  }
  const before = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  const afterBeforeCleanup = await snapshot("after_before_cleanup");
  const initialPlanIds = new Set(before.plans.map((plan) => plan.id));
  const initialItemIds = new Set(before.user_plan_items.map((item) => item.id));
  const deleted = {
    user_plan_items: [],
    user_plans: [],
    chat_messages: [],
    user_chat_states: [],
  };
  for (const item of afterBeforeCleanup.user_plan_items) {
    if (!initialItemIds.has(item.id)) {
      const rows = await restDelete(
        "user_plan_items",
        `id=eq.${encodeURIComponent(item.id)}&user_id=eq.${
          encodeURIComponent(userId)
        }`,
      );
      deleted.user_plan_items.push(...rows.map((row) => row.id));
    }
  }
  const restoredItems = [];
  for (const item of before.user_plan_items) {
    const rows = await restPatch(
      "user_plan_items",
      `id=eq.${encodeURIComponent(item.id)}&user_id=eq.${
        encodeURIComponent(userId)
      }`,
      itemRestorePatch(item),
    );
    restoredItems.push({ id: item.id, ok: rows.length > 0 });
  }
  for (const plan of afterBeforeCleanup.plans) {
    if (!initialPlanIds.has(plan.id)) {
      const rows = await restDelete(
        "user_plans_v2",
        `id=eq.${encodeURIComponent(plan.id)}&user_id=eq.${
          encodeURIComponent(userId)
        }`,
      );
      deleted.user_plans.push(...rows.map((row) => row.id));
    }
  }
  const restoredPlans = [];
  for (const plan of before.plans) {
    const rows = await restPatch(
      "user_plans_v2",
      `id=eq.${encodeURIComponent(plan.id)}&user_id=eq.${
        encodeURIComponent(userId)
      }`,
      planRestorePatch(plan),
    );
    restoredPlans.push({
      id: plan.id,
      ok: rows.length > 0,
      status: plan.status,
    });
  }
  deleted.chat_messages.push(
    ...(
      await restDelete(
        "chat_messages",
        `user_id=eq.${encodeURIComponent(userId)}&scope=eq.${
          encodeURIComponent(scope)
        }`,
      )
    ).map((row) => row.id),
  );
  deleted.user_chat_states.push(
    ...(
      await restDelete(
        "user_chat_states",
        `user_id=eq.${encodeURIComponent(userId)}&scope=eq.${
          encodeURIComponent(scope)
        }`,
      )
    ).map((row) => row.id ?? `${row.user_id}:${row.scope}`),
  );
  const after = await snapshot("after_cleanup");
  const cleanupPayload = {
    persona,
    run_id: runId,
    user_id: userId,
    scope,
    before_counts: {
      plans: before.plans.length,
      user_plan_items: before.user_plan_items.length,
    },
    after_before_cleanup: afterBeforeCleanup,
    restored_items: restoredItems,
    restored_plans: restoredPlans,
    deleted,
    after,
  };
  fs.writeFileSync(cleanupPath, `${JSON.stringify(cleanupPayload, null, 2)}\n`);
  console.log(JSON.stringify(
    {
      ok: true,
      action: "cleanup",
      restored_items: restoredItems,
      restored_plans: restoredPlans,
      deleted,
      cleanupPath,
    },
    null,
    2,
  ));
}

if (action === "snapshot") await writeSnapshot();
else if (action === "send") await sendTurn();
else if (action === "cleanup") await cleanup();
else throw new Error(`unknown QA_ACTION ${action}`);
