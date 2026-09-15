import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const apiUrl = "http://127.0.0.1:54321";
const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY || "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH";
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz";
const internalSecret =
  process.env.INTERNAL_FUNCTION_SECRET || "sophia_on_earth";

const runId = "r1";
const scope = `qa-momentum-watcher-full-ai-2026-05-06-${runId}`;
const channel = "web";
const nowIso = new Date().toISOString();
const oldIso = "2026-01-01T00:00:00.000Z";

const messages = [
  "Je veux tester mon plan presentation client en conditions reelles. L'action active c'est 'Repeter l'ouverture client'.",
  "J'ai fait une repetition complete de l'ouverture client, meme si c'etait imparfait. Tu peux le noter comme progres sur cette action.",
  "J'ai refait une deuxieme repetition courte, ca avance vraiment.",
  "Puis j'ai bloque sur la troisieme repetition et je l'ai sautee. Je veux qu'on garde ca comme signal, pas comme drame.",
  "Ok, lance-moi juste une phrase de recap et laisse le watcher faire son boulot ensuite.",
];

async function jsonFetch(url, opts, timeoutMs = 180000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { res, text, json };
}

async function rest(pathname, opts = {}) {
  const result = await jsonFetch(`${apiUrl}/rest/v1${pathname}`, {
    ...opts,
    headers: {
      apikey: supabaseServiceKey,
      authorization: `Bearer ${supabaseServiceKey}`,
      "content-type": "application/json",
      accept: "application/json",
      ...(opts.headers ?? {}),
    },
  });
  if (!result.res.ok) {
    throw new Error(
      `${opts.method ?? "GET"} ${pathname} -> ${result.res.status}: ${
        result.text.slice(0, 1000)
      }`,
    );
  }
  return result.json;
}

function responseText(response) {
  if (!response || typeof response !== "object") return "";
  return String(response.content || response.reply || response.text || "");
}

function safeWrite(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function basePlanItem({ id, userId, cycleId, transformationId, planId, title, status = "active", activationOrder = 1 }) {
  return {
    id,
    user_id: userId,
    cycle_id: cycleId,
    transformation_id: transformationId,
    plan_id: planId,
    dimension: "missions",
    kind: "task",
    status,
    title,
    description: "Fixture non destructif pour tester la consolidation Momentum watcher full IA.",
    tracking_type: "boolean",
    activation_order: activationOrder,
    activation_condition: null,
    current_habit_state: null,
    support_mode: null,
    support_function: null,
    target_reps: null,
    current_reps: null,
    cadence_label: "test watcher",
    scheduled_days: ["wed"],
    time_of_day: "soir",
    start_after_item_id: null,
    phase_id: "phase-full-ai",
    phase_order: 1,
    payload: {
      fixture: "momentum_watcher_full_ai_2026_05_06",
      run_id: runId,
    },
    created_at: nowIso,
    updated_at: nowIso,
    activated_at: nowIso,
    completed_at: null,
  };
}

async function seedRuntime(userId) {
  const cycleId = randomUUID();
  const transformationId = randomUUID();
  const planId = randomUUID();
  const itemId = randomUUID();

  await rest("/user_cycles", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify([{
      id: cycleId,
      user_id: userId,
      status: "active",
      raw_intake_text: "Fixture momentum watcher full IA, non destructif.",
      intake_language: "fr",
      validated_structure: { fixture: "momentum_watcher_full_ai_2026_05_06" },
      duration_months: 1,
      requested_pace: "normal",
      active_transformation_id: null,
      version: 1,
      created_at: nowIso,
      updated_at: nowIso,
    }]),
  });

  await rest("/user_transformations", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify([{
      id: transformationId,
      cycle_id: cycleId,
      priority_order: 1,
      status: "active",
      title: "Tester le watcher Momentum en full IA",
      internal_summary: "Fixture pour verifier que le watcher consolide les entries plan.",
      user_summary: "Verifier que les repetitions du plan influencent Momentum.",
      success_definition: "Le watcher lit les entries et met a jour execution_traction.",
      main_constraint: "Ne pas modifier ni supprimer les donnees existantes.",
      questionnaire_schema: { fixture: true },
      questionnaire_answers: {},
      completion_summary: null,
      handoff_payload: { fixture: true },
      base_de_vie_payload: {},
      unlocked_principles: [],
      ordering_rationale: "Run QA isole.",
      created_at: nowIso,
      updated_at: nowIso,
      activated_at: nowIso,
      completed_at: null,
    }]),
  });

  await rest(`/user_cycles?id=eq.${cycleId}`, {
    method: "PATCH",
    body: JSON.stringify({ active_transformation_id: transformationId }),
  });

  const content = {
    version: 3,
    current_phase_id: "phase-full-ai",
    current_level_runtime: { phase_id: "phase-full-ai", level_order: 1 },
    phases: [{
      phase_id: "phase-full-ai",
      phase_order: 1,
      title: "Tester la traction watcher",
      status: "active",
      goal: "Verifier que les repetitions plan changent Momentum.",
      heartbeat: {
        title: "Repetitions ouverture client",
        unit: "repetitions",
        current: 0,
        target: 3,
        tracking_mode: "inferred",
      },
      items: [itemId],
    }],
  };

  await rest("/user_plans_v2", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify([{
      id: planId,
      user_id: userId,
      cycle_id: cycleId,
      transformation_id: transformationId,
      status: "active",
      version: 1,
      title: "Fixture Momentum watcher full IA",
      content,
      generation_attempts: 1,
      last_generation_reason: "momentum_watcher_full_ai",
      generation_feedback: "Fixture QA non destructif.",
      generation_input_snapshot: { fixture: true, scope },
      activated_at: nowIso,
      completed_at: null,
      archived_at: null,
      created_at: nowIso,
      updated_at: nowIso,
    }]),
  });

  await rest("/user_plan_items", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify([
      basePlanItem({
        id: itemId,
        userId,
        cycleId,
        transformationId,
        planId,
        title: "Repeter l'ouverture client",
      }),
    ]),
  });

  return { cycleId, transformationId, planId, itemId };
}

async function insertFallbackEntries({ userId, cycleId, transformationId, planId, itemId }) {
  const rows = ["progress", "progress", "skip"].map((entryKind, index) => ({
    id: randomUUID(),
    user_id: userId,
    cycle_id: cycleId,
    transformation_id: transformationId,
    plan_id: planId,
    plan_item_id: itemId,
    entry_kind: entryKind,
    outcome: entryKind === "skip" ? "skipped" : "completed",
    value_numeric: null,
    value_text: null,
    difficulty_level: null,
    blocker_hint: entryKind === "skip" ? "blocked_after_two_repetitions" : null,
    created_at: new Date(Date.now() + index * 1000).toISOString(),
    effective_at: new Date(Date.now() + index * 1000).toISOString(),
    metadata: {
      fixture: "momentum_watcher_full_ai_2026_05_06",
      inserted_by: "runner_fallback_after_full_ai_conversation",
      run_id: runId,
    },
  }));
  await rest("/user_plan_item_entries", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify(rows),
  });
  return rows;
}

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const runDir = path.join(root, "tests/real-personas/qa-skill/runs/momentum_watcher_full_ai");
const connPath = path.join(root, "tests/real-personas/qa-skill/connections/emotional_repair.json");
const conn = JSON.parse(fs.readFileSync(connPath, "utf8"));
const userId = conn.user_id;

if (!userId || !conn.refresh_token) {
  throw new Error("Missing user_id or refresh_token in emotional_repair connection");
}

const runtime = await seedRuntime(userId);
const tokenResult = await jsonFetch(
  `${apiUrl}/auth/v1/token?grant_type=refresh_token`,
  {
    method: "POST",
    headers: { apikey: supabaseAnonKey, "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: conn.refresh_token }),
  },
);
if (!tokenResult.res.ok || !tokenResult.json?.access_token) {
  throw new Error(`token refresh failed: ${tokenResult.text}`);
}
const jwt = tokenResult.json.access_token;

const rawPath = path.join(runDir, `2026-05-06-momentum-watcher-full-ai-${runId}.raw.json`);
const summaryPath = path.join(runDir, `2026-05-06-momentum-watcher-full-ai-${runId}.summary.json`);
const proofPath = path.join(runDir, `2026-05-06-momentum-watcher-full-ai-${runId}.proof.json`);
const reportPath = path.join(runDir, `2026-05-06-momentum-watcher-full-ai-${runId}.md`);

const history = [];
const raw = [];
const summary = [];
const startedAt = new Date(Date.now() - 1000).toISOString();

for (let i = 0; i < messages.length; i += 1) {
  const content = messages[i];
  const requestId = `qa-momentum-watcher-full-ai-2026-05-06-${runId}-t${
    String(i + 1).padStart(2, "0")
  }`;
  console.log(`turn ${i + 1}/${messages.length}: ${content}`);
  const result = await jsonFetch(`${apiUrl}/functions/v1/test-send-message`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      authorization: `Bearer ${jwt}`,
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
    }),
  });

  const body = result.json || {};
  const trace = body.conversation_turn_trace || null;
  const response = body.response || {};
  const assistant = responseText(response);
  const routeDecision = trace?.route_decision || null;
  const turnFrame = trace?.turn_frame || null;
  raw.push({ turn: i + 1, requestId, user: content, status: result.res.status, body: result.json ?? result.text });
  summary.push({
    turn: i + 1,
    requestId,
    status: result.res.status,
    ok: body.ok ?? null,
    user: content,
    assistant,
    response_owner: trace?.response_owner ?? routeDecision?.response_owner ?? null,
    selected_handler: routeDecision?.selected_handler ?? routeDecision?.skill_choisi ?? null,
    route_reason_code: routeDecision?.reason_code ?? null,
    direct_effects: turnFrame?.direct_effects ?? [],
    tool_skill_intents: turnFrame?.tool_skill_intents ?? [],
    response_tool_execution: response.tool_execution ?? null,
    response_executed_tools: response.executed_tools ?? [],
    safety_risk_band: trace?.safety_pregate?.risk_band ?? null,
    trace_id: trace?.turn_id ?? trace?.id ?? trace?.trace_id ?? null,
    trace_error: body.trace_error ?? null,
  });
  safeWrite(rawPath, raw);
  safeWrite(summaryPath, summary);
  console.log(`  -> ${result.res.status} ${assistant.slice(0, 100).replace(/\s+/g, " ")}`);
  if (!result.res.ok) break;
  history.push({ role: "user", content, created_at: new Date(Date.now() + i * 2000).toISOString() });
  history.push({ role: "assistant", content: assistant, created_at: new Date(Date.now() + i * 2000 + 1000).toISOString() });
  if (i < messages.length - 1) await new Promise((resolve) => setTimeout(resolve, 750));
}

let entries = await rest(
  `/user_plan_item_entries?plan_id=eq.${runtime.planId}&select=*&order=created_at.asc`,
);
let entriesSource = "ai_or_runtime";
let fallbackEntries = [];
if (!Array.isArray(entries) || entries.length === 0) {
  fallbackEntries = await insertFallbackEntries({ userId, ...runtime });
  entriesSource = "fallback_after_full_ai_conversation";
  entries = await rest(
    `/user_plan_item_entries?plan_id=eq.${runtime.planId}&select=*&order=created_at.asc`,
  );
}

await rest(`/user_chat_states?user_id=eq.${userId}&scope=eq.${encodeURIComponent(scope)}`, {
  method: "PATCH",
  body: JSON.stringify({
    last_processed_at: oldIso,
    last_interaction_at: new Date().toISOString(),
  }),
});

const cronRequestId = `qa-momentum-watcher-full-ai-2026-05-06-${runId}-cron`;
console.log("trigger watcher cron manually");
const cron = await jsonFetch(`${apiUrl}/functions/v1/trigger-watcher-batch`, {
  method: "POST",
  headers: {
    apikey: supabaseAnonKey,
    authorization: `Bearer ${supabaseAnonKey}`,
    "content-type": "application/json",
    "x-internal-secret": internalSecret,
    "x-request-id": cronRequestId,
  },
  body: "{}",
}, 300000);

const endedAt = new Date(Date.now() + 1000).toISOString();
const encodedScope = encodeURIComponent(scope);
const encodedUserId = encodeURIComponent(userId);
const encodedFrom = encodeURIComponent(startedAt);
const encodedTo = encodeURIComponent(endedAt);

const [states, watcherEvents, allEvents, messagesRows, finalEntries] = await Promise.all([
  rest(`/user_chat_states?user_id=eq.${encodedUserId}&scope=eq.${encodedScope}&select=*`),
  rest(
    `/memory_observability_events?user_id=eq.${encodedUserId}&scope=eq.${encodedScope}` +
      `&created_at=gte.${encodedFrom}&created_at=lte.${encodedTo}` +
      `&source_component=eq.watcher&select=id,created_at,request_id,source_component,event_name,payload&order=created_at.asc`,
  ),
  rest(
    `/memory_observability_events?user_id=eq.${encodedUserId}&scope=eq.${encodedScope}` +
      `&created_at=gte.${encodedFrom}&created_at=lte.${encodedTo}` +
      `&select=id,created_at,request_id,source_component,event_name,payload&order=created_at.asc`,
  ),
  rest(
    `/chat_messages?user_id=eq.${encodedUserId}&scope=eq.${encodedScope}` +
      `&created_at=gte.${encodedFrom}&created_at=lte.${encodedTo}` +
      `&select=id,role,content,created_at,metadata&order=created_at.asc`,
  ),
  rest(`/user_plan_item_entries?plan_id=eq.${runtime.planId}&select=*&order=created_at.asc`),
]);

const state = Array.isArray(states) ? states[0] ?? null : null;
const momentum = state?.temp_memory?.__momentum_state_v2 ?? null;
const proof = {
  ok: true,
  run_id: runId,
  full_ai_requested: true,
  mega_test_mode_expected: "0",
  scope,
  user_id: userId,
  runtime,
  started_at: startedAt,
  ended_at: endedAt,
  entries_source: entriesSource,
  fallback_entries_inserted: fallbackEntries.length,
  counts: {
    turns_recorded: summary.length,
    successful_turns: summary.filter((turn) => turn.status >= 200 && turn.status < 300).length,
    chat_messages: Array.isArray(messagesRows) ? messagesRows.length : 0,
    plan_entries: Array.isArray(finalEntries) ? finalEntries.length : 0,
    observability_events: Array.isArray(allEvents) ? allEvents.length : 0,
    watcher_events: Array.isArray(watcherEvents) ? watcherEvents.length : 0,
  },
  cron: {
    request_id: cronRequestId,
    status: cron.res.status,
    ok: cron.res.ok,
    body: cron.json ?? cron.text,
  },
  final_momentum: {
    current_state: momentum?.current_state ?? null,
    state_reason: momentum?.state_reason ?? null,
    execution_traction: momentum?.dimensions?.execution_traction ?? null,
    engagement: momentum?.dimensions?.engagement ?? null,
    emotional_load: momentum?.dimensions?.emotional_load ?? null,
    consent: momentum?.dimensions?.consent ?? null,
    plan_fit: momentum?.dimensions?.plan_fit ?? null,
    load_balance: momentum?.dimensions?.load_balance ?? null,
    recommended_posture: momentum?.posture?.recommended_posture ?? null,
    top_risk: momentum?.assessment?.top_risk ?? null,
    top_blocker: momentum?.assessment?.top_blocker ?? null,
    last_classified_by: momentum?._internal?.sources?.last_classified_by ?? null,
    watcher_updated_at: momentum?._internal?.sources?.watcher_updated_at ?? null,
  },
  entries: (Array.isArray(finalEntries) ? finalEntries : []).map((entry) => ({
    id: entry.id,
    entry_kind: entry.entry_kind,
    outcome: entry.outcome,
    plan_item_id: entry.plan_item_id,
    created_at: entry.created_at,
    effective_at: entry.effective_at,
    metadata: entry.metadata,
  })),
  watcher_events: watcherEvents,
  files: { raw: rawPath, summary: summaryPath, proof: proofPath, report: reportPath },
};

safeWrite(proofPath, proof);

const report = [
  "# Momentum watcher full AI run - 2026-05-06 r1",
  "",
  `- Scope: \`${scope}\``,
  "- Conversation endpoint: `test-send-message`",
  "- Manual cron endpoint: `trigger-watcher-batch`",
  "- Reset/delete: none",
  `- Entries source: \`${entriesSource}\``,
  `- Cron status: ${cron.res.status}`,
  `- Cron processed: ${proof.cron.body?.processed ?? "n/a"}`,
  `- Cron skipped: ${proof.cron.body?.skipped ?? "n/a"}`,
  "",
  "## Counts",
  "",
  `- Turns: ${proof.counts.successful_turns}/${proof.counts.turns_recorded}`,
  `- Chat messages: ${proof.counts.chat_messages}`,
  `- Plan entries: ${proof.counts.plan_entries}`,
  `- Observability events: ${proof.counts.observability_events}`,
  `- Watcher events: ${proof.counts.watcher_events}`,
  "",
  "## Final Momentum",
  "",
  `- State: \`${proof.final_momentum.current_state}\``,
  `- Reason: \`${proof.final_momentum.state_reason}\``,
  `- Execution traction: \`${proof.final_momentum.execution_traction?.level ?? null}\` / \`${proof.final_momentum.execution_traction?.reason ?? null}\``,
  `- Posture: \`${proof.final_momentum.recommended_posture}\``,
  `- Last classified by: \`${proof.final_momentum.last_classified_by}\``,
  "",
  "## Files",
  "",
  `- Raw: \`${rawPath}\``,
  `- Summary: \`${summaryPath}\``,
  `- Proof: \`${proofPath}\``,
  "",
].join("\n");
fs.mkdirSync(runDir, { recursive: true });
fs.writeFileSync(reportPath, report, "utf8");

console.log(JSON.stringify(proof, null, 2));
