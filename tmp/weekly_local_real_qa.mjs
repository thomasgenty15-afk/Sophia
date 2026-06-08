import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const command = String(process.argv[2] ?? "").trim();
const persona = process.env.QA_PERSONA || "alex";
const runId = process.env.QA_RUN_ID ||
  `weekly-local-dispatcher-real-${new Date().toISOString().replace(/[:.]/g, "")}`;
const date = process.env.QA_DATE || new Date().toISOString().slice(0, 10);
const apiUrl = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const scope = `qa-${persona}-${date}-weekly-local-dispatcher-${runId}`;
const runDir = path.join(root, "tests/real-personas", persona, "runs", "weekly");
fs.mkdirSync(runDir, { recursive: true });

const filePrefix = `${date}-weekly-local-dispatcher-${runId}`;
const snapshotPath = path.join(runDir, `${filePrefix}.snapshot.json`);
const rawPath = path.join(runDir, `${filePrefix}.raw.json`);
const summaryPath = path.join(runDir, `${filePrefix}.summary.json`);
const durablePath = path.join(runDir, `${filePrefix}.durable.json`);
const cleanupPath = path.join(runDir, `${filePrefix}.cleanup.json`);

const connectionPath = path.join(root, "tests/real-personas", persona, "connection.json");
const connection = JSON.parse(fs.readFileSync(connectionPath, "utf8"));

function isoDateFromUtc(dateValue) {
  return dateValue.toISOString().slice(0, 10);
}

function previousCompletedWeek(referenceDate) {
  const ref = new Date(`${referenceDate}T12:00:00.000Z`);
  if (Number.isNaN(ref.getTime())) throw new Error(`invalid QA_DATE ${referenceDate}`);
  const day = ref.getUTCDay() || 7;
  const start = new Date(ref);
  start.setUTCDate(ref.getUTCDate() - day - 6);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return {
    startDate: isoDateFromUtc(start),
    endDate: isoDateFromUtc(end),
    clientNowIso: `${referenceDate}T10:00:00.000Z`,
  };
}

const reviewWindow = previousCompletedWeek(date);

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
  const raw = safeExec("supabase", ["status", "--output", "json"], { cwd: root });
  if (!raw) return {};
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  return JSON.parse(start >= 0 && end >= start ? raw.slice(start, end + 1) : raw);
}

const env = readEnvFile(path.join(root, "supabase/.env"));
const status = localStatus();
const anonKey = process.env.SUPABASE_ANON_KEY || status.ANON_KEY ||
  env.SUPABASE_ANON_KEY || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  status.SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!anonKey) throw new Error("missing anon key");
if (!serviceRoleKey) throw new Error("missing service role key");

async function jsonFetch(url, options, timeoutMs = 180000) {
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
    return { response, body, text };
  } finally {
    clearTimeout(timeout);
  }
}

async function authToken() {
  const email = String(connection.email || "").trim();
  const password = String(connection.password || "1234567").trim();
  const result = await jsonFetch(`${apiUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const token = String(result.body?.access_token || "");
  if (!result.response.ok || !token) {
    throw new Error(`auth failed ${result.response.status}: ${result.text}`);
  }
  const verify = await jsonFetch(`${apiUrl}/auth/v1/user`, {
    method: "GET",
    headers: { apikey: anonKey, authorization: `Bearer ${token}` },
  });
  if (!verify.response.ok) {
    throw new Error(`auth verify failed ${verify.response.status}: ${verify.text}`);
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

async function selectState(label) {
  const userId = encodeURIComponent(connection.user_id);
  const [
    chatStates,
    plans,
    items,
    messages,
    traces,
    entries,
  ] = await Promise.all([
    rest(`user_chat_states?user_id=eq.${userId}&select=*`),
    rest(`user_plans_v2?user_id=eq.${userId}&select=*&order=created_at.asc`),
    rest(`user_plan_items?user_id=eq.${userId}&select=*&order=activation_order.asc`),
    rest(`chat_messages?user_id=eq.${userId}&scope=eq.${encodeURIComponent(scope)}&select=*&order=created_at.asc`),
    rest(`conversation_turn_traces?user_id=eq.${userId}&request_id=like.${encodeURIComponent(`qa-${persona}-${date}-weekly-local-dispatcher-${runId}-%`)}&select=*&order=ts.asc`),
    rest(`user_plan_item_entries?user_id=eq.${userId}&select=*&order=created_at.desc&limit=120`),
  ]);
  return {
    label,
    captured_at: new Date().toISOString(),
    persona,
    run_id: runId,
    user_id: connection.user_id,
    scope,
    user_chat_states: Array.isArray(chatStates.body) ? chatStates.body : [],
    plans: Array.isArray(plans.body) ? plans.body : [],
    user_plan_items: Array.isArray(items.body) ? items.body : [],
    chat_messages: Array.isArray(messages.body) ? messages.body : [],
    conversation_turn_traces: Array.isArray(traces.body) ? traces.body : [],
    user_plan_item_entries: Array.isArray(entries.body) ? entries.body : [],
    rest_status: {
      chatStates: chatStates.status,
      plans: plans.status,
      items: items.status,
      messages: messages.status,
      traces: traces.status,
      entries: entries.status,
    },
  };
}

function pickWeeklyActions(snapshot) {
  const planById = new Map(snapshot.plans.map((plan) => [String(plan.id), plan]));
  return snapshot.user_plan_items
    .filter((item) => String(item.title || "").trim())
    .slice(0, 3)
    .map((item, index) => {
      const plan = planById.get(String(item.user_plan_id || item.plan_id || ""));
      return {
        transformation_id: String(plan?.transformation_id || plan?.id || "qa-transformation"),
        plan_id: String(item.user_plan_id || item.plan_id || plan?.id || ""),
        plan_title: String(plan?.title || plan?.name || "Plan actuel"),
        plan_item_id: String(item.id),
        occurrence_id: `qa-weekly-${runId}-occ-${index + 1}`,
        title: String(item.title),
        family: String(item.item_type || "habit").includes("mission") ? "mission" : "habit",
        deviation: index === 0 ? "done" : index === 1 ? "partial" : "missed",
        daily_evidence: {
          source: "daily_action_review_v1",
          reason_category: index === 2 ? "fatigue" : "none",
          reason_text: index === 2 ? "fatigue fin de semaine" : null,
          still_relevant: true,
          reschedule_decision: null,
          confidence: "medium",
        },
      };
    });
}

async function prepare() {
  const before = await selectState("before");
  const actions = pickWeeklyActions(before);
  if (actions.length < 2) {
    throw new Error("not enough discovered plan items to build weekly QA state");
  }
  fs.writeFileSync(snapshotPath, `${JSON.stringify(before, null, 2)}\n`);
  const firstPlan = actions[0];
  const existing = before.user_chat_states.find((row) => row.scope === scope) ?? null;
  const tempMemory = {
    ...((existing?.temp_memory || {})),
    __active_skill_state: {
      skill_id: "weekly_adaptive_review_v1",
      status: "open",
      weekly_progress_review: {
        source: "weekly_progress_review_v2",
        week_start_date: reviewWindow.startDate,
        week_end_date: reviewWindow.endDate,
        transformations: [{
          transformation_id: firstPlan.transformation_id,
          plan_id: firstPlan.plan_id,
          plan_title: firstPlan.plan_title,
          actions,
        }],
      },
      weekly_adaptive_review: {
        skill_id: "weekly_review_v1",
        status: "ask_question",
        week_start_date: reviewWindow.startDate,
        week_end_date: reviewWindow.endDate,
        evidence: {
          source: "weekly_progress_review_v2",
          daily_coverage: "partial",
          confidence: "medium",
          planned_count: actions.length,
          done_count: 1,
          partial_count: 1,
          missed_count: Math.max(0, actions.length - 2),
          unanswered_count: 0,
          rescheduled_count: 0,
          dominant_blockers: ["fatigue"],
          covered_count: actions.length,
        },
        habit_verdict: {
          status: "partial_validatable",
          completion_rate: 0.5,
          planned_count: actions.length,
          done_points: 1,
          reason: "Signal partiel et fatigue.",
        },
        human_signals: {
          objective_delta: "unknown",
          felt_state: "unknown",
        },
        week_strategy: {
          decision: "bridge_week",
          reason: "La traction existe mais la charge doit etre allegee.",
          preserve_level_objective: true,
          preserve_level_architecture: true,
        },
        question: {
          id: "weekly_confirm_dominant_blocker",
          text: "Je vois surtout la fatigue comme blocage cette semaine. Tu confirmes que c'est ca qui doit guider la suite ?",
          blocks_decision: true,
          targets: ["dominant_blocker", "felt_state"],
        },
        item_decisions: actions.map((action) => ({
          plan_item_id: action.plan_item_id,
          occurrence_id: action.occurrence_id,
          title: action.title,
          family: action.family === "mission" ? "mission" : "habit",
          current_week_status: action.deviation === "done" ? "done" : action.deviation === "partial" ? "partial" : "missed",
          evidence_done: action.deviation === "done",
          daily_evidence_confidence: "medium",
          daily_evidence: action.daily_evidence,
          decision: action.deviation === "done" ? "keep" : "bridge_with_week",
          reason: action.deviation === "done" ? "Action deja tenue." : "A alleger pour la semaine pont.",
        })),
        plan_patch: { requires_confirmation: true, operations: [] },
        effect_plan: { allowed: false, effects: [] },
        constraints: [
          "requires_confirmation",
          "do_not_apply_without_user_confirmation",
          "no_done_language_without_commit",
        ],
        reply: null,
        state_patch: {},
      },
      weekly_flow_state: {
        stage: "collecting_human_signal",
        proposal_status: "none",
        validation_unlock_status: "locked_until_weekly_complete",
        human_signals: { objective_delta: "unknown", felt_state: "unknown" },
        last_user_signal: null,
        last_visible_summary: "Point weekly ouvert: fatigue probable, semaine pont a discuter.",
        last_handoff_summary: null,
        turn_count: 0,
        max_turns: 6,
        updated_at: new Date().toISOString(),
      },
      validation_unlock: {
        status: "locked_until_weekly_complete",
        meaning: "Validation locked until weekly is completed.",
      },
    },
  };
  let result;
  if (existing) {
    result = await rest(`user_chat_states?user_id=eq.${encodeURIComponent(connection.user_id)}&scope=eq.${encodeURIComponent(scope)}`, {
      method: "PATCH",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({ temp_memory: tempMemory }),
    });
  } else {
    result = await rest("user_chat_states", {
      method: "POST",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({
        user_id: connection.user_id,
        scope,
        current_mode: "companion",
        temp_memory: tempMemory,
      }),
    });
  }
  if (!result.ok) throw new Error(`state setup failed ${result.status}: ${result.text}`);
  fs.writeFileSync(rawPath, "[]\n");
  fs.writeFileSync(summaryPath, "[]\n");
  const after = await selectState("after_prepare");
  fs.writeFileSync(durablePath, `${JSON.stringify(after, null, 2)}\n`);
  console.log(JSON.stringify({
    run_id: runId,
    persona,
    scope,
    actions: actions.map((item) => ({
      plan_id: item.plan_id,
      plan_title: item.plan_title,
      plan_item_id: item.plan_item_id,
      title: item.title,
    })),
    snapshotPath,
    rawPath,
    summaryPath,
    durablePath,
  }, null, 2));
}

function compactTrace(body) {
  const trace = body?.conversation_turn_trace ?? null;
  const route = trace?.route_decision ?? null;
  const tool = trace?.tool_skill_run ?? null;
  const frame = trace?.turn_frame ?? null;
  return {
    response_owner: trace?.response_owner ?? route?.response_owner ?? null,
    selected_handler: route?.selected_handler ?? null,
    route_reason_code: route?.reason_code ?? null,
    safety: trace?.safety_pregate ?? frame?.safety ?? null,
    direct_effects: trace?.direct_effects ?? frame?.direct_effects ?? [],
    operation: tool ? {
      selected_handler: tool.selected_handler ?? null,
      status: tool.status ?? null,
      reason_code: tool.reason_code ?? null,
      flow_action: tool.flow_action ?? null,
      visible_task: tool.visible_task ?? null,
      toolExecution: tool.toolExecution ?? null,
      executedTools: tool.executedTools ?? [],
      platform_handoff: tool.platform_handoff ?? null,
      committed_effects: tool.committed_effects ?? [],
      blocked_effects: tool.blocked_effects ?? [],
    } : null,
    pending_confirmation: trace?.pending_tool_skill_confirmation ?? null,
    memory_plan: trace?.memory_plan ?? null,
    trace_id: trace?.turn_id ?? null,
  };
}

async function sendTurn() {
  const token = await authToken();
  const turn = Number(process.env.QA_TURN || "0");
  const content = String(process.env.QA_CONTENT || "").trim();
  if (!turn || !content) throw new Error("QA_TURN and QA_CONTENT are required");
  const existingSummary = fs.existsSync(summaryPath)
    ? JSON.parse(fs.readFileSync(summaryPath, "utf8"))
    : [];
  const history = [];
  for (const item of existingSummary.slice(-12)) {
    if (item.user) history.push({ role: "user", content: item.user });
    if (item.assistant) history.push({ role: "assistant", content: item.assistant });
  }
  const requestId = `qa-${persona}-${date}-weekly-local-dispatcher-${runId}-t${String(turn).padStart(2, "0")}`;
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
      client_now_iso: reviewWindow.clientNowIso,
    }),
  });
  const body = result.body ?? {};
  const response = body.response ?? {};
  const assistant = String(response.content ?? response.reply ?? body.content ?? "").trim();
  const trace = compactTrace(body);
  const raw = fs.existsSync(rawPath) ? JSON.parse(fs.readFileSync(rawPath, "utf8")) : [];
  raw.push({ turn, requestId, user: content, status: result.response.status, body });
  fs.writeFileSync(rawPath, `${JSON.stringify(raw, null, 2)}\n`);
  const summary = existingSummary;
  summary.push({
    turn,
    requestId,
    status: result.response.status,
    ok: body.ok ?? null,
    user: content,
    assistant,
    empty_response: assistant.length === 0,
    aborted: body.aborted ?? response.aborted ?? false,
    abort_reason: body.abort_reason ?? response.abort_reason ?? null,
    response_tool_execution: response.tool_execution ?? null,
    response_executed_tools: response.executed_tools ?? [],
    trace,
  });
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  const durable = await selectState(`durable_t${turn}`);
  fs.writeFileSync(durablePath, `${JSON.stringify(durable, null, 2)}\n`);
  console.log(JSON.stringify({
    turn,
    status: result.response.status,
    ok: body.ok ?? null,
    empty_response: assistant.length === 0,
    response_owner: trace.response_owner,
    selected_handler: trace.selected_handler,
    route_reason_code: trace.route_reason_code,
    operation: trace.operation,
    content_preview: assistant.replace(/\s+/g, " ").slice(0, 1600),
    summaryPath,
    durablePath,
  }, null, 2));
}

async function cleanup() {
  if (!fs.existsSync(snapshotPath)) throw new Error(`missing snapshot ${snapshotPath}`);
  const before = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  const current = await selectState("before_cleanup");
  const beforeByScope = new Map(
    before.user_chat_states.map((row) => [String(row.scope ?? ""), row]),
  );
  const currentScopes = new Set(
    current.user_chat_states.map((row) => String(row.scope ?? "")),
  );
  const stateRestores = [];
  for (const row of before.user_chat_states) {
    const rowScope = String(row.scope ?? "");
    const target = `user_chat_states?user_id=eq.${encodeURIComponent(connection.user_id)}&scope=eq.${encodeURIComponent(rowScope)}`;
    const result = currentScopes.has(rowScope)
      ? await rest(target, {
      method: "PATCH",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({
            current_mode: row.current_mode,
            risk_level: row.risk_level,
            investigation_state: row.investigation_state,
            short_term_context: row.short_term_context,
            last_interaction_at: row.last_interaction_at,
            unprocessed_msg_count: row.unprocessed_msg_count,
            last_processed_at: row.last_processed_at,
            temp_memory: row.temp_memory ?? {},
      }),
        })
      : await rest("user_chat_states", {
        method: "POST",
        headers: { prefer: "return=representation" },
        body: JSON.stringify(row),
      });
    stateRestores.push({ scope: rowScope, ok: result.ok, status: result.status });
  }
  const createdScopes = [...currentScopes].filter((rowScope) =>
    !beforeByScope.has(rowScope)
  );
  const stateDeletes = [];
  for (const rowScope of createdScopes) {
    const result = await rest(`user_chat_states?user_id=eq.${encodeURIComponent(connection.user_id)}&scope=eq.${encodeURIComponent(rowScope)}`, {
      method: "DELETE",
      headers: { prefer: "return=representation" },
    });
    stateDeletes.push({ scope: rowScope, ok: result.ok, status: result.status });
  }
  const messageDelete = await rest(`chat_messages?user_id=eq.${encodeURIComponent(connection.user_id)}&scope=eq.${encodeURIComponent(scope)}`, {
    method: "DELETE",
    headers: { prefer: "return=representation" },
  });
  const after = await selectState("after_cleanup");
  const report = {
    run_id: runId,
    persona,
    scope,
    restored_user_chat_states: stateRestores,
    deleted_created_user_chat_states: stateDeletes,
    deleted_scope_messages: { ok: messageDelete.ok, status: messageDelete.status },
    remaining_scope_messages: after.chat_messages.length,
    after_cleanup: after,
  };
  fs.writeFileSync(cleanupPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ cleanupPath, ...report }, null, 2));
}

if (command === "prepare") await prepare();
else if (command === "turn") await sendTurn();
else if (command === "inspect") {
  const state = await selectState("inspect");
  console.log(JSON.stringify(state, null, 2));
}
else if (command === "cleanup") await cleanup();
else {
  console.error("usage: node tmp/weekly_local_real_qa.mjs <prepare|turn|inspect|cleanup>");
  process.exit(2);
}
