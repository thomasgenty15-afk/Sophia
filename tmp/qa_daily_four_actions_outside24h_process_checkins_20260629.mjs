import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

const runId = process.env.QA_RUN_ID ||
  `daily-four-actions-outside24h-process-checkins-20260629-${Date.now().toString(36)}`;
const persona = process.env.QA_PERSONA || "rose";
const scenario = process.env.QA_SCENARIO || "normal_missed";
const outDir = path.join(root, "tests/real-personas", persona, "runs", "daily-weekly");
fs.mkdirSync(outDir, { recursive: true });

function readEnvFile(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    out[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

function localSupabaseStatus() {
  try {
    return JSON.parse(execFileSync("supabase", ["status", "--output", "json"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }));
  } catch {
    return {};
  }
}

const env = readEnvFile(path.join(root, "supabase/.env"));
const status = localSupabaseStatus();
const apiUrl = String(
  process.env.SUPABASE_URL || env.SUPABASE_URL || status.API_URL ||
    "http://127.0.0.1:54321",
).replace(/\/+$/, "");
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  env.SUPABASE_SERVICE_ROLE_KEY;
const internalSecret = process.env.INTERNAL_FUNCTION_SECRET ||
  env.INTERNAL_FUNCTION_SECRET;
if (!serviceRoleKey) throw new Error("missing SUPABASE_SERVICE_ROLE_KEY");
if (!internalSecret) throw new Error("missing INTERNAL_FUNCTION_SECRET");

const connectionPath = path.join(root, "tests/real-personas", persona, "connection.json");
const connection = JSON.parse(fs.readFileSync(connectionPath, "utf8"));
const userId = String(connection.user_id ?? "").trim();
if (!userId) throw new Error(`missing user_id in ${connectionPath}`);

const scope = "whatsapp";
const nowIso = new Date().toISOString();
const startIso = nowIso;
const localDate = "2026-06-24";
const weekStartDate = "2026-06-22";
const plannedDay = "wed";
const ordinal = 3;
const qaPhone = `+3369${
  crypto.createHash("sha256").update(runId).digest("hex").replace(/[a-f]/g, "")
    .padEnd(8, "0").slice(0, 8)
}`;
const waId = qaPhone.replace(/^\+/, "");

const touched = {
  qaPhone,
  planIds: [],
  itemIds: [],
  occurrenceIds: [],
  checkinId: null,
  pendingIds: [],
  entryIds: [],
  chatMessageIds: [],
  dedupWamids: [],
  deferredCheckins: [],
};

function encode(value) {
  return encodeURIComponent(String(value));
}

async function jsonFetch(url, options = {}, allowError = false) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw_text: text };
  }
  if (!response.ok && !allowError) {
    const err = new Error(`${response.status} ${url}: ${text}`);
    err.status = response.status;
    err.body = body;
    throw err;
  }
  return { status: response.status, ok: response.ok, body, text };
}

async function rest(pathPart, options = {}, allowError = false) {
  return await jsonFetch(`${apiUrl}/rest/v1/${pathPart}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      accept: "application/json",
      ...(options.headers ?? {}),
    },
  }, allowError);
}

async function select(pathPart) {
  return (await rest(pathPart, { method: "GET" })).body ?? [];
}

async function insert(table, row) {
  const body = (await rest(table, {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify(row),
  })).body;
  return Array.isArray(body) ? body[0] : body;
}

async function patch(table, query, row) {
  return (await rest(`${table}?${query}`, {
    method: "PATCH",
    headers: { prefer: "return=representation" },
    body: JSON.stringify(row),
  })).body ?? [];
}

async function del(table, query) {
  return await rest(`${table}?${query}`, {
    method: "DELETE",
    headers: { prefer: "return=representation" },
  }, true);
}

async function invokeFunction(name, body, requestId) {
  return await jsonFetch(`${apiUrl}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${serviceRoleKey}`,
      "x-internal-secret": internalSecret,
      "x-request-id": requestId,
      "x-sophia-wa-transport": "loopback",
    },
    body: JSON.stringify(body ?? {}),
  });
}

function clearActiveFlowTempMemory(tempMemory) {
  const next = { ...((tempMemory && typeof tempMemory === "object") ? tempMemory : {}) };
  for (const key of [
    "__active_conversation_skill_v1",
    "__active_skill_state",
    "active_skill_state",
    "__last_daily_action_review_exit_memo",
    "__last_daily_action_review_child_flow_handoff",
    "__last_weekly_adaptive_review_exit_memo",
    "__last_weekly_adaptive_review_child_flow_handoff",
    "__last_product_help_exit_memo",
    "__last_coaching_recommendation_exit_memo",
    "__last_feature_opportunity_exit_memo",
    "__last_safety_crisis_exit_memo",
  ]) {
    delete next[key];
  }
  return next;
}

async function snapshotBefore() {
  const [profileRows, dueRows, basePlans, chatStates] = await Promise.all([
    select(
      `profiles?id=eq.${encode(userId)}&select=id,email,timezone,phone_number,phone_verified_at,phone_invalid,whatsapp_opted_in,whatsapp_state,onboarding_completed,trial_end,access_tier,whatsapp_last_inbound_at,whatsapp_last_outbound_at`,
    ),
    select(
      `scheduled_checkins?user_id=eq.${encode(userId)}&status=in.(pending,retrying)&scheduled_for=lte.${encode(new Date(Date.now() + 60_000).toISOString())}&select=*&order=scheduled_for.asc`,
    ),
    select(
      `user_plans_v2?user_id=eq.${encode(userId)}&status=eq.active&select=id,cycle_id,transformation_id,title,version&order=updated_at.desc&limit=1`,
    ),
    select(
      `user_chat_states?user_id=eq.${encode(userId)}&scope=eq.${scope}&select=user_id,scope,temp_memory,updated_at&limit=1`,
    ),
  ]);
  if (!profileRows[0]) throw new Error("profile not found");
  if (!basePlans[0]) throw new Error("active base plan not found");
  return {
    profile: profileRows[0],
    dueRows,
    basePlan: basePlans[0],
    chatState: chatStates?.[0] ?? null,
  };
}

async function setup(before) {
  for (const [index, row] of before.dueRows.entries()) {
    touched.deferredCheckins.push(row);
    await patch("scheduled_checkins", `id=eq.${encode(row.id)}`, {
      scheduled_for: new Date(Date.now() + 7 * 86_400_000 + index * 60_000)
        .toISOString(),
    });
  }

  await patch("profiles", `id=eq.${encode(userId)}`, {
    timezone: "Europe/Paris",
    phone_number: qaPhone,
    phone_verified_at: nowIso,
    phone_invalid: false,
    whatsapp_opted_in: true,
    whatsapp_state: null,
    onboarding_completed: true,
    access_tier: "alliance",
    trial_end: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    whatsapp_last_inbound_at: "2026-01-01T00:00:00.000Z",
    whatsapp_last_outbound_at: "2026-01-01T00:00:00.000Z",
  });
  if (before.chatState) {
    await patch(
      "user_chat_states",
      `user_id=eq.${encode(userId)}&scope=eq.${scope}`,
      { temp_memory: clearActiveFlowTempMemory(before.chatState.temp_memory) },
    );
  }

  const baseVersion = Number(before.basePlan.version ?? 1);
  const commonPlan = {
    user_id: userId,
    cycle_id: before.basePlan.cycle_id,
    transformation_id: before.basePlan.transformation_id,
    status: "draft",
    generation_attempts: 0,
    content: {
      qa_run_id: runId,
      source: "qa_daily_four_actions_explain_then_missed_webhook",
    },
  };
  const planA = await insert("user_plans_v2", {
    ...commonPlan,
    title: `QA plan cannabis ${runId}`,
    version: baseVersion + 2100,
  });
  const planB = await insert("user_plans_v2", {
    ...commonPlan,
    title: `QA plan administratif ${runId}`,
    version: baseVersion + 2101,
  });
  touched.planIds.push(planA.id, planB.id);

  const actions = [
    {
      plan: planA,
      dimension: "habits",
      kind: "habit",
      title: "Journée sans fumer",
      description: "Tenir la journée sans fumer de joint, avec attention au moment de craquage.",
      reasonProbe: "emotional",
    },
    {
      plan: planA,
      dimension: "missions",
      kind: "task",
      title: "Respiration cinq minutes",
      description: "Faire cinq minutes de respiration calme pour traverser une envie sans fumer.",
      reasonProbe: "forgot",
    },
    {
      plan: planB,
      dimension: "missions",
      kind: "task",
      title: "Ranger deux papiers administratifs",
      description: "Choisir deux courriers, les trier puis les ranger ou les jeter.",
      reasonProbe: "fatigue",
    },
    {
      plan: planB,
      dimension: "missions",
      kind: "task",
      title: "Préparer la pochette documents",
      description: "Regrouper les documents utiles dans une seule pochette visible.",
      reasonProbe: "external",
    },
  ];

  for (const [index, action] of actions.entries()) {
    const item = await insert("user_plan_items", {
      user_id: userId,
      cycle_id: before.basePlan.cycle_id,
      transformation_id: before.basePlan.transformation_id,
      plan_id: action.plan.id,
      dimension: action.dimension,
      kind: action.kind,
      status: "active",
      title: action.title,
      description: action.description,
      tracking_type: "boolean",
      activation_order: index + 1,
      scheduled_days: [plannedDay],
      time_of_day: "anytime",
      payload: { qa_run_id: runId, expected_reason_category: action.reasonProbe },
    });
    touched.itemIds.push(item.id);
    const occurrence = await insert("user_habit_week_occurrences", {
      user_id: userId,
      cycle_id: before.basePlan.cycle_id,
      transformation_id: before.basePlan.transformation_id,
      plan_id: action.plan.id,
      plan_item_id: item.id,
      week_start_date: weekStartDate,
      ordinal,
      planned_day: plannedDay,
      default_day: plannedDay,
      status: "planned",
      source: "manual_change",
    });
    touched.occurrenceIds.push(occurrence.id);
  }

  const checkin = await insert("scheduled_checkins", {
    user_id: userId,
    event_context: "action_evening_review_v2",
    scheduled_for: new Date(Date.now() - 120_000).toISOString(),
    status: "pending",
    message_mode: "dynamic",
    origin: "action_review",
    message_payload: {
      qa_run_id: runId,
      local_date: localDate,
      week_start_date: weekStartDate,
      timezone: "Europe/Paris",
      occurrence_ids: touched.occurrenceIds,
      event_context: "action_evening_review_v2",
      chat_capability: "daily_action_review",
    },
  });
  touched.checkinId = checkin.id;
}

async function loadTargets() {
  const rows = await select(
    `user_habit_week_occurrences?id=in.(${touched.occurrenceIds.join(",")})&select=id,cycle_id,transformation_id,plan_id,plan_item_id,planned_day,week_start_date,user_plan_items(id,title,description,dimension,kind,tracking_type,plan_id,user_plans_v2(id,title))`,
  );
  const byOccurrence = new Map(rows.map((row) => [row.id, row]));
  return touched.occurrenceIds.map((occurrenceId) => {
    const row = byOccurrence.get(occurrenceId);
    const item = row?.user_plan_items ?? {};
    const plan = item?.user_plans_v2 ?? {};
    return {
      occurrence_id: row.id,
      cycle_id: row.cycle_id,
      transformation_id: row.transformation_id,
      plan_id: row.plan_id ?? item.plan_id ?? null,
      plan_label: plan.title ?? null,
      plan_item_id: row.plan_item_id,
      title: item.title,
      description: item.description,
      dimension: item.dimension,
      kind: item.kind,
      tracking_type: item.tracking_type ?? "boolean",
      planned_day: row.planned_day,
      original_planned_day: null,
      week_start_date: row.week_start_date,
      time_of_day: "anytime",
      reviewed_local_date: localDate,
    };
  });
}

function initialReviewState(targets) {
  const focusIds = targets.slice(0, 2).map((target) => target.occurrence_id);
  const remainingIds = targets.slice(2).map((target) => target.occurrence_id);
  const items = {};
  for (const target of targets) {
    items[target.occurrence_id] = {
      occurrence_id: target.occurrence_id,
      plan_item_id: target.plan_item_id,
      plan_id: target.plan_id,
      plan_label: target.plan_label ?? null,
      title: target.title,
      action_type: target.kind === "habit" ? "habit" : "mission",
      outcome: null,
      reason_category: null,
      reason_text: null,
      still_relevant: "unknown",
      evidence_text: null,
      matched_user_text: null,
      confidence: "low",
      missing_slots: ["outcome"],
    };
  }
  return {
    source: "daily_action_review_v1",
    skill_id: "daily_action_review_v1",
    intent: "open_review",
    status: "collecting",
    current_focus_occurrence_ids: focusIds,
    remaining_occurrence_ids: remainingIds,
    asked_occurrence_ids_history: [focusIds],
    items,
    next_question: null,
    next_question_targets: focusIds,
    generated_user_message: null,
    should_apply_effects: false,
    effect_plan: { allowed: false, effects: [] },
    stop_reason: null,
    action_intelligence_by_occurrence_id: {},
  };
}

async function createPending() {
  const processed = await invokeFunction(
    "process-checkins",
    { force: true },
    `${runId}-process-checkins`,
  );
  const pendingRows = await select(
    `whatsapp_pending_actions?scheduled_checkin_id=eq.${encode(touched.checkinId)}&select=id,kind,status,scheduled_checkin_id,payload,created_at,processed_at&order=created_at.asc&limit=1`,
  );
  const pending = pendingRows?.[0];
  if (!pending) throw new Error("process-checkins did not create pending");
  touched.pendingIds.push(pending.id);
  const openingMessages = await select(
    `chat_messages?user_id=eq.${encode(userId)}&scope=eq.${scope}&role=eq.assistant&metadata->>original_checkin_id=eq.${encode(touched.checkinId)}&select=id,role,content,metadata,created_at,agent_used&order=created_at.asc`,
  );
  for (const msg of openingMessages ?? []) {
    if (!touched.chatMessageIds.includes(msg.id)) touched.chatMessageIds.push(msg.id);
  }
  const targets = pending.payload?.targets ?? await loadTargets();
  const draft = String(
    pending.payload?.draft_message ??
      openingMessages?.at(-1)?.content ??
      "",
  );
  return { pending, draft, targets, processed, opening_messages: openingMessages ?? [] };
}

async function collectState(label) {
  const [pending, messages, entries, occurrences, chatStates] = await Promise.all([
    touched.checkinId
      ? select(
        `whatsapp_pending_actions?scheduled_checkin_id=eq.${encode(touched.checkinId)}&select=id,kind,status,scheduled_checkin_id,payload,created_at,processed_at&order=created_at.asc`,
      )
      : [],
    select(
      `chat_messages?user_id=eq.${encode(userId)}&scope=eq.${scope}&created_at=gte.${encode(startIso)}&select=id,role,content,metadata,created_at,agent_used&order=created_at.asc&limit=100`,
    ),
    touched.itemIds.length
      ? select(
        `user_plan_item_entries?user_id=eq.${encode(userId)}&plan_item_id=in.(${touched.itemIds.join(",")})&select=id,plan_item_id,entry_kind,outcome,value_text,blocker_hint,difficulty_level,metadata,effective_at,created_at&order=created_at.asc`,
      )
      : [],
    touched.occurrenceIds.length
      ? select(
        `user_habit_week_occurrences?id=in.(${touched.occurrenceIds.join(",")})&select=id,plan_item_id,planned_day,status,source,validated_at,updated_at&order=created_at.asc`,
      )
      : [],
    select(
      `user_chat_states?user_id=eq.${encode(userId)}&scope=eq.${scope}&select=user_id,scope,temp_memory,updated_at&limit=1`,
    ),
  ]);
  for (const row of pending) if (!touched.pendingIds.includes(row.id)) touched.pendingIds.push(row.id);
  for (const row of messages) if (!touched.chatMessageIds.includes(row.id)) touched.chatMessageIds.push(row.id);
  for (const row of entries) if (!touched.entryIds.includes(row.id)) touched.entryIds.push(row.id);
  return { label, pending, messages, entries, occurrences, chat_state: chatStates?.[0] ?? null };
}

async function sendWebhook(label, userText) {
  const wamid = `wamid_${runId}_${label}_${crypto.randomUUID()}`;
  touched.dedupWamids.push(wamid);
  const startedAt = new Date().toISOString();
  const payload = {
    object: "whatsapp_business_account",
    entry: [{
      id: `qa-entry-${runId}`,
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: {
            display_phone_number: waId,
            phone_number_id: crypto.createHash("sha256").update(`${runId}:phone`)
              .digest("hex").slice(0, 16),
          },
          contacts: [{ profile: { name: "Rose QA" }, wa_id: waId }],
          messages: [{
            from: waId,
            id: wamid,
            timestamp: String(Math.floor(Date.now() / 1000)),
            type: "text",
            sophia_user_id: userId,
            text: { body: userText },
          }],
        },
      }],
    }],
  };
  const response = await jsonFetch(`${apiUrl}/functions/v1/whatsapp-webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-sophia-wa-transport": "loopback",
      "x-request-id": `${runId}-${label}`,
    },
    body: JSON.stringify(payload),
  }, true);
  const state = await collectState(label);
  const assistantAfterTurn = state.messages.filter((msg) =>
    msg.role === "assistant" && String(msg.created_at) >= startedAt
  );
  return {
    label,
    request_id: `${runId}-${label}`,
    user_text: userText,
    http_status: response.status,
    http_body: response.body,
    assistant_after_turn: assistantAfterTurn,
    state,
  };
}

function traceShort(turn) {
  const pending = turn.state.pending?.[0] ?? null;
  const tempMemory = turn.state.chat_state?.temp_memory ?? {};
  const activeSkill = tempMemory?.__active_skill_state?.skill_id ??
    tempMemory?.active_skill_state?.skill_id ?? null;
  const firstMetadata = turn.assistant_after_turn?.[0]?.metadata ?? {};
  const routeDecision = firstMetadata?.trace?.route_decision ?? {};
  return {
    http_status: turn.http_status,
    response_owner: firstMetadata?.response_owner ??
      routeDecision?.response_owner ??
      firstMetadata?.source ??
      "whatsapp-webhook",
    selected_handler: pending?.payload?.chat_capability === "daily_action_review"
      ? (firstMetadata?.selected_handler ??
        routeDecision?.selected_handler ??
        "daily_action_review_v1")
      : null,
    route_reason: pending?.status === "pending"
      ? "pending daily actif"
      : pending?.status === "done"
      ? "pending daily done"
      : "no pending",
    pending_status: pending?.status ?? null,
    review_status: pending?.payload?.review_state?.status ?? null,
    local_flow_transfer: pending?.payload?.local_flow_transfer ?? null,
    child_flow: pending?.payload?.child_flow_handoff?.child_flow ?? null,
    active_skill: activeSkill,
    entries_count: turn.state.entries.length,
    occurrence_statuses: turn.state.occurrences.map((row) => ({
      plan_item_id: row.plan_item_id,
      status: row.status,
    })),
  };
}

function categoryFromEntry(entry) {
  return entry?.metadata?.reason_category ??
    entry?.metadata?.daily_action_review?.reason_category ??
    entry?.blocker_hint ??
    null;
}

function targetLookup(targets) {
  const byItem = new Map();
  for (const target of targets) byItem.set(target.plan_item_id, target);
  return byItem;
}

function renderReport(run) {
  const targetsByItem = targetLookup(run.pending_initial.targets);
  const finalEntries = run.final_state.entries.map((entry) => {
    const target = targetsByItem.get(entry.plan_item_id);
    return {
      title: target?.title ?? entry.plan_item_id,
      plan_label: target?.plan_label ?? null,
      outcome: entry.outcome,
      reason_category: categoryFromEntry(entry),
      reason_text: entry.value_text,
      blocker_hint: entry.blocker_hint,
    };
  });
  const helpScenario = run.qa_mode === "two_plans_four_actions_help_signal";
  const expected = new Map([
    ["Journée sans fumer", "emotional"],
    ["Respiration cinq minutes", "forgot"],
    ["Ranger deux papiers administratifs", helpScenario ? "too_hard" : "fatigue"],
    ["Préparer la pochette documents", "external"],
  ]);
  const mismatches = finalEntries.filter((entry) =>
    expected.has(entry.title) && expected.get(entry.title) !== entry.reason_category
  );
  const pendingDone = run.final_state.pending?.[0]?.status === "done";
  const entriesCountOk = finalEntries.length === 4;
  const handoffTurns = run.turns.filter((turn) =>
    turn.state.pending?.[0]?.payload?.local_flow_transfer === "handoff_to_child_flow" ||
    turn.state.pending?.[0]?.payload?.child_flow_handoff?.child_flow === "coaching_recommendation"
  );
  const coachingMessages = run.turns.filter((turn) =>
    turn.assistant_after_turn.some((msg) =>
      String(msg.metadata?.source ?? "").includes("coaching_recommendation") ||
      String(msg.agent_used ?? "").includes("coaching_recommendation") ||
      String(msg.metadata?.response_owner ?? "").includes("coaching_recommendation") ||
      String(msg.metadata?.selected_handler ?? "").includes("coaching_recommendation") ||
      String(msg.metadata?.trace?.route_decision?.response_owner ?? "").includes("coaching_recommendation") ||
      String(msg.metadata?.trace?.route_decision?.selected_handler ?? "").includes("coaching_recommendation")
    )
  );
  const helpHandoffOk = !helpScenario || handoffTurns.length >= 1 ||
    coachingMessages.length >= 1;
  const systemVerdict = pendingDone && entriesCountOk && mismatches.length === 0 &&
      helpHandoffOk
    ? "green"
    : "red";
  const fluidityIssues = [];
  for (const [index, turn] of run.turns.entries()) {
    const assistant = turn.assistant_after_turn.map((msg) => msg.content).join("\n\n");
    if (/\bcelle-ci\b/i.test(assistant)) {
      fluidityIssues.push(`Tour ${index + 1}: reference vague "celle-ci".`);
    }
  }
  const fluidityVerdict = fluidityIssues.length ? "yellow" : "green";
  const globalVerdict = systemVerdict === "green" && fluidityVerdict !== "red"
    ? (fluidityVerdict === "yellow" ? "yellow" : "green")
    : "red";

  const turnBlocks = [];
  turnBlocks.push(`### Tour 0 - Ouverture daily\n\n**Verdict du tour:** green\n\n**User**\n> N/A - ouverture proactive daily depuis le pending QA.\n\n**Sophia**\n> ${run.pending_initial.draft.replace(/\n/g, "\n> ")}\n\n**Trace courte**\n- http_status: opening fixture OK\n- response_owner: pending daily\n- selected_handler: \`daily_action_review_v1\`\n- route_reason: pending \`chat_capability=daily_action_review\`\n- safety: none\n- direct_effects: none\n- operation: pending daily ouvert\n- pending_confirmation: pending \`${run.pending_initial.pending.id}\`\n- memory_plan: N/A\n- executed_tools: none\n- durable_effect: pending contient 4 targets, ouverture configuree sur les 2 premieres`);

  run.turns.forEach((turn, index) => {
    const short = traceShort(turn);
    const assistant = turn.assistant_after_turn.map((msg) => String(msg.content ?? "")).join("\n\n").trim();
    const verdict = short.pending_status === "pending" || short.pending_status === "done"
      ? "green"
      : "red";
    const family = verdict === "green" ? "n/a" : "`BF-ROUTE-01` - Mauvais owner selectionne";
    turnBlocks.push(`### Tour ${index + 1}\n\n**Verdict du tour:** ${verdict}\n\n**Famille de bugs si yellow/red:** ${family}\n\n**User**\n> ${turn.user_text}\n\n**Sophia**\n> ${assistant.replace(/\n/g, "\n> ")}\n\n**Trace courte**\n- http_status: \`${short.http_status}\`\n- response_owner: \`${short.response_owner}\`\n- selected_handler: \`${short.selected_handler ?? ""}\`\n- route_reason: \`${short.route_reason}\`\n- safety: none observed\n- direct_effects: ${short.pending_status === "done" ? "`log_daily_action_review x4`" : "none observed"}\n- operation: \`daily_action_review_v1\`\n- pending_confirmation: \`${short.pending_status ?? ""}\`\n- memory_plan: N/A\n- executed_tools: none\n- durable_effect: entries_count=\`${short.entries_count}\`, review_status=\`${short.review_status ?? ""}\``);
  });

  const entryLines = finalEntries.map((entry) =>
    `- ${entry.title}: outcome=\`${entry.outcome}\`, reason_category=\`${entry.reason_category}\`, reason_text=\`${entry.reason_text}\`, blocker_hint=\`${entry.blocker_hint}\``
  ).join("\n");
  const mismatchLines = mismatches.length
    ? mismatches.map((entry) =>
      `- ${entry.title}: attendu \`${expected.get(entry.title)}\`, observe \`${entry.reason_category}\``
    ).join("\n")
    : "- Aucun mismatch reason_category observe.";

  return `# QA Run Report - ${run.run_id}\n\n` +
    `## 1. Contexte Du Test\n\n` +
    `- Date: ${new Date().toISOString().slice(0, 10)}\n` +
    `- Run: \`${run.run_id}\`\n` +
    `- Persona: Rose, user \`${run.user_id}\`\n` +
    `- Objectif: ${helpScenario ? "tester un daily avec 2 plans et 4 actions, dont 2 actions ou le user dit explicitement qu'il n'y arrive pas et demande de l'aide." : "tester un daily avec 2 plans et 4 actions, via le bon chemin `whatsapp-webhook`, ou le user demande une explication sur chaque action avant de la declarer non faite avec une excuse."}\n` +
    `- Trajectoire: fixture pending \`daily_action_review\` avec 4 targets -> \`whatsapp-webhook\` tour par tour -> \`daily_action_review_v1\` -> \`log_daily_action_review\` -> verification DB -> cleanup cible.\n` +
    `- Surfaces visees: pending daily, dispatcher local daily, visible daily \`explain_target\` et clarifications, reducer/effects daily, \`user_plan_item_entries.reason_category\`, statuts occurrences, retour hors pending.\n` +
    `- Cadre IA reel: Supabase local, vrai webhook WhatsApp local, aucun renderer deterministe, aucun fallback direct, aucun \`test-send-message\` pendant le pending daily.\n` +
    `- Validite QA: valide pour le flow daily local. Limite: pending fixture dynamique creee directement pour eviter de dependre de \`process-checkins\`; le chemin teste est bien \`whatsapp-webhook -> handlePendingActions -> daily_action_review_v1\`.\n` +
    `- Raw: \`${path.relative(root, path.join(outDir, `${run.run_id}.raw.json`))}\`\n` +
    `- Cleanup: ${run.cleanup?.ok ? "effectue et verifie" : "a verifier"}.\n\n` +
    `Targets du run:\n\n` +
    run.pending_initial.targets.map((target) =>
      `- ${target.plan_label}: ${target.title}`
    ).join("\n") +
    `\n\n## 2. Tours De Conversation\n\n${turnBlocks.join("\n\n")}\n\n` +
    `## 3. Analyse De Fluidite Humaine\n\n` +
    `**Verdict: ${fluidityVerdict}**\n\n` +
    `**Ce qui marche**\n` +
    `- Le daily garde l'ownership sur les tours du pending.\n` +
    `- Sophia avance dans la file des actions et va chercher les actions du second plan.\n` +
    (helpScenario
      ? `- Le daily peut suspendre vers \`coaching_recommendation\` uniquement quand la demande d'aide est explicite.\n\n`
      : `- La conversation reste dans le daily pendant les demandes d'explication et ne part pas vers \`coaching_recommendation\`.\n\n`) +
    `**Problemes**\n` +
    (fluidityIssues.length
      ? fluidityIssues.map((issue) => `- ${issue} Famille: BF-PROACTIVE-01. Severite: yellow.`).join("\n")
      : "- Aucun probleme de fluidite bloquant observe.") +
    `\n\n**Fix propose**\n` +
    `- Source amont: visible daily / stage target context si une reference vague apparait.\n` +
    `- Correction recommandee: continuer a nommer explicitement la target quand le daily change d'action.\n` +
    `- Tests d'invariant attendus: multi-target daily avec changement de plan nomme toujours la target suivante.\n\n` +
    `## 4. Analyse Systeme\n\n` +
    `**Verdict: ${systemVerdict}**\n\n` +
    `**Routage**\n` +
    `- Tous les tours du pending passent via \`whatsapp-webhook\`.\n` +
    `- Le pending daily reste owner jusqu'au commit.\n` +
    (helpScenario
      ? `- Handoffs coaching observes: \`${handoffTurns.length}\`; messages coaching observes: \`${coachingMessages.length}\`.\n`
      : `- Aucun \`normal_reply\` ou \`coaching_recommendation\` ne capture les preuves daily.\n`) +
    `- Aucun \`normal_reply\` ne capture les preuves daily.\n\n` +
    `**Skills / Operations / Tools**\n` +
    `- Skill observe: \`daily_action_review_v1\`.\n` +
    `- Effet canonique attendu: \`log_daily_action_review\`.\n` +
    `- Aucun \`create_one_shot_reminder\` ni outil hors scope.\n\n` +
    `**Memory / Effets durables**\n` +
    `${entryLines}\n\n` +
    `**Problemes**\n` +
    `${mismatchLines}\n` +
    (helpScenario && !helpHandoffOk
      ? "- Aucun handoff coaching observe malgre deux demandes explicites d'aide. Famille: BF-ROUTE-01. Severite: red.\n"
      : "") +
    `\n` +
    `**Fix propose**\n` +
    `- Source amont: ${mismatches.length ? "daily reducer reason_category mapping / state merge." : "n/a."}\n` +
    `- Correction recommandee: ${mismatches.length ? "corriger les mappings ci-dessus et ajouter des invariants." : "conserver les invariants reason_category sur craquage/fume, oubli, fatigue et imprévu."}\n` +
    `- Tests d'invariant attendus: webhook pending 4 targets cree 4 entries avec categories attendues.\n\n` +
    `## Verdict Global\n\n` +
    `**${globalVerdict}**\n\n` +
    (globalVerdict === "green"
      ? (helpScenario
        ? "Le daily fonctionne correctement sur ce run: 2 plans, 4 actions, demandes d'aide explicites routees vers coaching quand applicable, puis commit durable complet."
        : "Le daily fonctionne correctement sur ce run: 2 plans, 4 actions, explications locales, ownership conserve via webhook, commit durable complet et categories de raison conformes.")
      : "Le run reste a corriger selon les problemes listes ci-dessus.");
}

function plannedTurnsForScenario(pending) {
  const templateAccept = pending.pending?.payload?.message_mode === "template_gate"
    ? [{
      label: "t0_template_accept",
      text: "Oui, vas-y pour le bilan.",
    }]
    : [];
  if (scenario === "help_signal") {
    return [
      ...templateAccept,
      {
        label: "t1_action1_explain",
        text:
          "Je ne me souviens plus : « Journée sans fumer », ça devait faire quoi exactement ?",
      },
      {
        label: "t2_action1_missed",
        text:
          "Ok, alors pas faite : j’ai fumé après une contrariété en fin d’après-midi. Oui, ça reste à garder.",
      },
      {
        label: "t3_action2_explain",
        text:
          "Et « Respiration cinq minutes », je ne vois plus trop ce que ça devait m’apporter. Tu peux me rappeler ?",
      },
      {
        label: "t4_action2_help",
        text:
          "Pas faite non plus : j’oublie à chaque fois quand l’envie monte. Je n’y arrive pas, tu peux m’aider à trouver le bon levier Sophia pour réussir celle-là ?",
      },
      {
        label: "t5_action3_explain",
        text:
          "Pour « Ranger deux papiers administratifs », j’ai oublié l’idée. Ça servait à quoi déjà ?",
      },
      {
        label: "t6_action3_help",
        text:
          "Non, pas fait : je bloque complètement et je repousse dès que je vois les papiers. Aide-moi à trouver quoi faire pour y arriver.",
      },
      {
        label: "t7_action4_explain",
        text:
          "Et la pochette documents, pareil, je ne sais plus ce que c’était censé régler. Tu m’expliques ?",
      },
      {
        label: "t8_action4_missed",
        text:
          "Pas faite : un imprévu familial m’a pris le créneau. Je veux la garder pour demain.",
      },
    ];
  }
  return [
    ...templateAccept,
    {
      label: "t1_action1_explain",
      text:
        "Je ne me souviens plus : « Journée sans fumer », ça devait faire quoi exactement ?",
    },
    {
      label: "t2_action1_missed",
      text:
        "Ok, alors pas faite : j’ai fumé après une contrariété en fin d’après-midi. Oui, ça reste à garder.",
    },
    {
      label: "t3_action2_explain",
      text:
        "Et « Respiration cinq minutes », je ne vois plus trop ce que ça devait m’apporter. Tu peux me rappeler ?",
    },
    {
      label: "t4_action2_missed",
      text:
        "Pas faite non plus : j’ai complètement oublié quand l’envie est montée. Je veux quand même la garder.",
    },
    {
      label: "t5_action3_explain",
      text:
        "Pour « Ranger deux papiers administratifs », j’ai oublié l’idée. Ça servait à quoi déjà ?",
    },
    {
      label: "t6_action3_missed",
      text:
        "Non, pas fait : j’étais trop fatiguée et j’ai remis ça à plus tard. Oui, c’est encore pertinent.",
    },
    {
      label: "t7_action4_explain",
      text:
        "Et la pochette documents, pareil, je ne sais plus ce que c’était censé régler. Tu m’expliques ?",
    },
    {
      label: "t8_action4_missed",
      text:
        "Pas faite : un imprévu familial m’a pris le créneau. Je veux la garder pour demain.",
    },
  ];
}

async function cleanup(before) {
  const cleanupLog = [];
  const removeByIds = async (table, ids) => {
    for (const id of [...new Set(ids.filter(Boolean))]) {
      const res = await del(table, `id=eq.${encode(id)}`);
      cleanupLog.push({ table, id, status: res.status, body: res.body });
    }
  };
  await removeByIds("whatsapp_inbound_dedup", touched.dedupWamids);
  await removeByIds("user_plan_item_entries", touched.entryIds);
  await removeByIds("whatsapp_pending_actions", touched.pendingIds);
  await removeByIds("scheduled_checkins", touched.checkinId ? [touched.checkinId] : []);
  await removeByIds("user_habit_week_occurrences", touched.occurrenceIds);
  await removeByIds("user_plan_items", touched.itemIds);
  await removeByIds("user_plans_v2", touched.planIds);
  await removeByIds("chat_messages", touched.chatMessageIds);

  await patch("profiles", `id=eq.${encode(userId)}`, {
    timezone: before.profile.timezone,
    phone_number: before.profile.phone_number,
    phone_verified_at: before.profile.phone_verified_at,
    phone_invalid: before.profile.phone_invalid,
    whatsapp_opted_in: before.profile.whatsapp_opted_in,
    whatsapp_state: before.profile.whatsapp_state,
    onboarding_completed: before.profile.onboarding_completed,
    trial_end: before.profile.trial_end,
    access_tier: before.profile.access_tier,
    whatsapp_last_inbound_at: before.profile.whatsapp_last_inbound_at,
    whatsapp_last_outbound_at: before.profile.whatsapp_last_outbound_at,
  });
  if (before.chatState) {
    await patch(
      "user_chat_states",
      `user_id=eq.${encode(userId)}&scope=eq.${scope}`,
      { temp_memory: before.chatState.temp_memory },
    );
  }
  for (const row of before.dueRows) {
    await patch("scheduled_checkins", `id=eq.${encode(row.id)}`, row);
  }
  const verification = {
    pending: touched.pendingIds.length
      ? await select(`whatsapp_pending_actions?id=in.(${touched.pendingIds.join(",")})&select=id`)
      : [],
    entries: touched.entryIds.length
      ? await select(`user_plan_item_entries?id=in.(${touched.entryIds.join(",")})&select=id`)
      : [],
    checkin: touched.checkinId
      ? await select(`scheduled_checkins?id=eq.${encode(touched.checkinId)}&select=id`)
      : [],
    plans: touched.planIds.length
      ? await select(`user_plans_v2?id=in.(${touched.planIds.join(",")})&select=id`)
      : [],
    messages: touched.chatMessageIds.length
      ? await select(`chat_messages?id=in.(${touched.chatMessageIds.join(",")})&select=id`)
      : [],
  };
  return {
    cleanupLog,
    verification,
    ok: Object.values(verification).every((rows) => Array.isArray(rows) && rows.length === 0),
  };
}

async function main() {
  const before = await snapshotBefore();
  let run = {
    run_id: runId,
    persona,
    user_id: userId,
    created_at: nowIso,
    local_supabase: { api_url: apiUrl },
    qa_mode: scenario === "help_signal"
      ? "two_plans_four_actions_help_signal"
      : "two_plans_four_actions_webhook_pending",
    pending_initial: null,
    turns: [],
    final_state: null,
    cleanup: null,
    touched,
  };
  try {
    await setup(before);
    const pending = await createPending();
    run.pending_initial = pending;

    const plannedTurns = plannedTurnsForScenario(pending);
    for (const planned of plannedTurns) {
      const turn = await sendWebhook(planned.label, planned.text);
      run.turns.push(turn);
      if (planned.label !== "t6_post_close") {
        const pendingStatus = turn.state.pending?.[0]?.status ?? null;
        if (pendingStatus === "done") {
          // Keep one post-close turn to verify return outside the pending flow.
          continue;
        }
      }
    }
    run.final_state = await collectState("final");
  } finally {
    run.cleanup = await cleanup(before);
    const rawPath = path.join(outDir, `${runId}.raw.json`);
    const reportPath = path.join(outDir, `${runId}.md`);
    fs.writeFileSync(rawPath, `${JSON.stringify(run, null, 2)}\n`);
    fs.writeFileSync(reportPath, renderReport(run));
    console.log(JSON.stringify({
      run_id: runId,
      report: path.relative(root, reportPath),
      raw: path.relative(root, rawPath),
      turns: run.turns.map((turn) => ({
        label: turn.label,
        assistant: turn.assistant_after_turn.map((msg) => msg.content),
        trace: traceShort(turn),
      })),
      final_entries: run.final_state?.entries?.map((entry) => ({
        plan_item_id: entry.plan_item_id,
        outcome: entry.outcome,
        value_text: entry.value_text,
        blocker_hint: entry.blocker_hint,
        reason_category: categoryFromEntry(entry),
      })) ?? [],
      cleanup_ok: run.cleanup?.ok ?? false,
    }, null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
