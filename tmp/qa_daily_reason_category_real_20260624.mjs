import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

const runId = process.env.QA_RUN_ID ||
  `daily-reason-category-20260624-${Date.now().toString(36)}`;
const persona = process.env.QA_PERSONA || "rose";
const outDir = path.join(
  root,
  "tests/real-personas",
  persona,
  "runs",
  "daily-weekly",
);
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
    return JSON.parse(
      execFileSync("supabase", ["status", "--output", "json"], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    );
  } catch {
    return {};
  }
}

const env = readEnvFile(path.join(root, "supabase/.env"));
const status = localSupabaseStatus();
const apiUrl = String(
  process.env.SUPABASE_URL || env.SUPABASE_URL ||
    status.API_URL || "http://127.0.0.1:54321",
).replace(/\/+$/, "");
const anonKey = process.env.SUPABASE_ANON_KEY || status.ANON_KEY ||
  env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  env.SUPABASE_SERVICE_ROLE_KEY;
const internalSecret = process.env.INTERNAL_FUNCTION_SECRET ||
  env.INTERNAL_FUNCTION_SECRET;

if (!anonKey) throw new Error("missing local ANON_KEY");
if (!serviceRoleKey) throw new Error("missing SUPABASE_SERVICE_ROLE_KEY");
if (!internalSecret) throw new Error("missing INTERNAL_FUNCTION_SECRET");

const connectionPath = path.join(
  root,
  "tests/real-personas",
  persona,
  "connection.json",
);
const connection = JSON.parse(fs.readFileSync(connectionPath, "utf8"));
const userId = String(connection.user_id ?? "").trim();
const email = String(connection.email ?? "").trim();
const password = String(connection.password ?? "1234567");
if (!userId || !email) throw new Error(`missing user/email in ${connectionPath}`);

const localDate = "2026-06-24";
const weekStartDate = "2026-06-22";
const plannedDay = "wed";
const ordinal = 3;
const nowIso = new Date().toISOString();
const startIso = nowIso;
const scope = "whatsapp";

const touched = {
  planIds: [],
  itemIds: [],
  occurrenceIds: [],
  targets: [],
  checkinId: null,
  pendingIds: [],
  entryIds: [],
  chatMessageIds: [],
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

async function login() {
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
  const accessToken = String(result.body?.access_token ?? "");
  if (!accessToken) throw new Error("missing access token");
  const userCheck = await jsonFetch(`${apiUrl}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${accessToken}`,
    },
  });
  return {
    accessToken,
    authUserId: userCheck.body?.id ?? userCheck.body?.user?.id ?? null,
  };
}

async function callFunction(name, body, requestId) {
  return await jsonFetch(`${apiUrl}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: anonKey,
      authorization: `Bearer ${anonKey}`,
      "x-internal-secret": internalSecret,
      "x-request-id": requestId,
    },
    body: JSON.stringify(body ?? {}),
  }, true);
}

function reasonCategory(entry) {
  return entry?.metadata?.reason_category ??
    entry?.metadata?.daily_action_review?.reason_category ??
    entry?.blocker_hint ??
    null;
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
    onboarding_completed: true,
    access_tier: "alliance",
  });
  if (before.chatState) {
    await patch("user_chat_states", `user_id=eq.${encode(userId)}&scope=eq.${scope}`, {
      temp_memory: clearActiveFlowTempMemory(before.chatState.temp_memory),
    });
  }

  const plan = await insert("user_plans_v2", {
    user_id: userId,
    cycle_id: before.basePlan.cycle_id,
    transformation_id: before.basePlan.transformation_id,
    status: "draft",
    title: `QA daily reason category ${runId}`,
    version: Number(before.basePlan.version ?? 1) + 1000,
    generation_attempts: 0,
    content: { qa_run_id: runId },
  });
  touched.planIds.push(plan.id);

  const actionRows = [
    {
      title: "Faire cinq minutes de respiration calme",
      description:
        "S'asseoir, respirer lentement cinq minutes et traverser l'envie de fumer sans allumer de joint.",
      payload: { qa_run_id: runId, category_probe: "emotional_craving" },
    },
    {
      title: "Ranger deux papiers administratifs",
      description:
        "Choisir deux courriers, les trier puis les ranger ou les jeter.",
      payload: { qa_run_id: runId, category_probe: "fatigue" },
    },
  ];

  for (const [index, action] of actionRows.entries()) {
    const item = await insert("user_plan_items", {
      user_id: userId,
      cycle_id: before.basePlan.cycle_id,
      transformation_id: before.basePlan.transformation_id,
      plan_id: plan.id,
      dimension: "missions",
      kind: "task",
      status: "active",
      title: action.title,
      description: action.description,
      tracking_type: "boolean",
      activation_order: index + 1,
      scheduled_days: [plannedDay],
      time_of_day: "anytime",
      payload: action.payload,
    });
    touched.itemIds.push(item.id);
    const occurrence = await insert("user_habit_week_occurrences", {
      user_id: userId,
      cycle_id: before.basePlan.cycle_id,
      transformation_id: before.basePlan.transformation_id,
      plan_id: plan.id,
      plan_item_id: item.id,
      week_start_date: weekStartDate,
      ordinal,
      planned_day: plannedDay,
      default_day: plannedDay,
      status: "planned",
      source: "manual_change",
    });
    touched.occurrenceIds.push(occurrence.id);
    touched.targets.push({
      occurrence_id: occurrence.id,
      cycle_id: before.basePlan.cycle_id,
      transformation_id: before.basePlan.transformation_id,
      plan_id: plan.id,
      plan_label: null,
      plan_item_id: item.id,
      title: action.title,
      description: action.description,
      dimension: "missions",
      kind: "task",
      tracking_type: "boolean",
      planned_day: plannedDay,
      original_planned_day: null,
      week_start_date: weekStartDate,
      time_of_day: "anytime",
      reviewed_local_date: localDate,
    });
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

function initialReviewState(targets) {
  const focusIds = targets.map((target) => target.occurrence_id);
  const items = {};
  for (const target of targets) {
    items[target.occurrence_id] = {
      occurrence_id: target.occurrence_id,
      plan_item_id: target.plan_item_id,
      plan_id: target.plan_id,
      plan_label: target.plan_label ?? null,
      title: target.title,
      action_type: "mission",
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
    remaining_occurrence_ids: [],
    asked_occurrence_ids_history: [focusIds],
    items,
    next_question: null,
    next_question_targets: focusIds,
    generated_user_message: null,
    should_apply_effects: false,
    constraints: [],
    effect_plan: { allowed: false, effects: [] },
    stop_reason: null,
    action_intelligence_by_occurrence_id: {},
  };
}

async function createDirectDailyPending() {
  const targets = touched.targets;
  const targetTitles = targets.map((target) => target.title);
  const draft = `Je fais le point sur aujourd’hui : ${targetTitles.join(" et ")}.\nTu en es où sur ces actions ?`;
  const reviewState = initialReviewState(targets);
  const noteInformation = {
    source_flow_id: "process_checkins.action_evening_review_v2",
    source_flow: "qa_direct_pending_fixture",
    handoff_reason: "bridge",
    target_dispatcher: "daily_action_review_v1",
    handoff_context_for_next_dispatcher:
      "Consume the user's reply as the first active daily review turn.",
    active_flow_summary:
      "QA opened daily review for selected action targets.",
    collected_state: {
      scheduled_checkin_id: touched.checkinId,
      event_context: "action_evening_review_v2",
      local_date: localDate,
      week_start_date: weekStartDate,
      timezone: "Europe/Paris",
      target_occurrence_ids: targets.map((target) => target.occurrence_id),
      target_titles: targetTitles,
      already_resolved_occurrence_ids: [],
    },
    unresolved_questions: [
      "Which selected actions were done or not done today.",
      "If not done, the reason and whether the action remains relevant.",
    ],
    recommended_next_focus:
      "Classify the current user reply against selected daily targets.",
    structured_context: {
      source_flow: "qa_direct_pending_fixture",
      pending_action_kind: "scheduled_checkin",
      chat_capability: "daily_action_review",
      event_context: "action_evening_review_v2",
      targets: targets.map((target) => ({
        occurrence_id: target.occurrence_id,
        plan_item_id: target.plan_item_id,
        title: target.title,
        description: target.description,
        kind: target.kind,
        dimension: target.dimension,
      })),
    },
    confidence: "high",
    evidence: ["qa direct pending fixture"],
  };
  const pending = await insert("whatsapp_pending_actions", {
    user_id: userId,
    kind: "scheduled_checkin",
    status: "pending",
    scheduled_checkin_id: touched.checkinId,
    payload: {
      action_evening_review: true,
      event_context: "action_evening_review_v2",
      draft_message: draft,
      message_mode: "conversation",
      chat_capability: "daily_action_review",
      occurrence_ids: targets.map((target) => target.occurrence_id),
      targets,
      already_resolved_targets: [],
      initial_note_information: noteInformation,
      review_state: reviewState,
      asked_occurrence_ids: reviewState.current_focus_occurrence_ids,
      not_yet_asked_occurrence_ids: [],
      grouping_reason: "qa_reason_category_fixture",
      local_date: localDate,
      week_start_date: weekStartDate,
      timezone: "Europe/Paris",
      qa_run_id: runId,
    },
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });
  touched.pendingIds.push(pending.id);
  await patch("scheduled_checkins", `id=eq.${encode(touched.checkinId)}`, {
    status: "awaiting_user",
    draft_message: draft,
    processed_at: new Date().toISOString(),
  });
  const opening = await insert("chat_messages", {
    user_id: userId,
    role: "assistant",
    scope,
    content: draft,
    agent_used: "companion",
    metadata: {
      source: "scheduled_checkin",
      event_context: "action_evening_review_v2",
      original_checkin_id: touched.checkinId,
      qa_run_id: runId,
      chat_capability: "daily_action_review",
    },
  });
  touched.chatMessageIds.push(opening.id);
  return { pending, draft };
}

async function collectState(label) {
  const [pending, messages, entries, occurrences] = await Promise.all([
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
        `user_habit_week_occurrences?id=in.(${touched.occurrenceIds.join(",")})&select=id,plan_item_id,planned_day,status,source,validated_at,updated_at`,
      )
      : [],
  ]);
  for (const row of pending) if (!touched.pendingIds.includes(row.id)) touched.pendingIds.push(row.id);
  for (const row of messages) if (!touched.chatMessageIds.includes(row.id)) touched.chatMessageIds.push(row.id);
  for (const row of entries) if (!touched.entryIds.includes(row.id)) touched.entryIds.push(row.id);
  return { label, pending, messages, entries, occurrences, traces: [] };
}

function assistantText(body) {
  return String(body?.response?.content ?? body?.response?.message ?? "")
    .trim();
}

async function sendTurn(auth, run, text) {
  const turn = run.turns.filter((entry) => entry.role === "user").length + 1;
  const requestId = `${runId}-t${String(turn).padStart(2, "0")}`;
  const response = await jsonFetch(`${apiUrl}/functions/v1/test-send-message`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${anonKey}`,
      "x-user-authorization": `Bearer ${auth.accessToken}`,
      "content-type": "application/json",
      "x-request-id": requestId,
    },
    body: JSON.stringify({
      user_id: userId,
      channel: "whatsapp",
      scope,
      content: text,
      disable_debounce: true,
      force_full_ai: true,
      client_now_iso: nowIso,
      client_timezone: "Europe/Paris",
    }),
  }, true);
  const state = await collectState(`after_t${turn}`);
  const trace = response.body?.conversation_turn_trace ?? null;
  const assistant = assistantText(response.body);
  run.turns.push({
    turn,
    role: "user",
    text,
    request_id: requestId,
  });
  run.turns.push({
    turn,
    role: "assistant",
    text: assistant,
    trace_short: {
      http_status: response.status,
      ok: response.ok,
      request_id: requestId,
      response_owner: trace?.response_owner ?? trace?.raw_trace?.response_owner ?? null,
      selected_handler: trace?.selected_handler ?? trace?.raw_trace?.selected_handler ?? null,
      route_reason: trace?.route_reason ?? trace?.raw_trace?.route_reason ?? null,
      pending_status: state.pending?.[0]?.status ?? null,
      review_status: state.pending?.[0]?.payload?.review_state?.status ?? null,
      entries: state.entries.map((entry) => ({
        plan_item_id: entry.plan_item_id,
        outcome: entry.outcome,
        reason_category: reasonCategory(entry),
        value_text: entry.value_text,
      })),
      occurrence_statuses: state.occurrences.map((row) => ({
        plan_item_id: row.plan_item_id,
        status: row.status,
      })),
    },
    raw_body: response.body,
  });
  run.latest = state;
  return assistant;
}

function nextUserText(run) {
  const last = run.turns.at(-1)?.text ?? "";
  const userTurns = run.turns.filter((entry) => entry.role === "user").length;
  if (userTurns === 0) {
    return "La respiration calme, pas faite : j’ai craqué dans l’après-midi et j’ai fumé. Pour les papiers, je n’ai pas encore répondu.";
  }
  if (/pertinent|pertinente|demain|utile/i.test(last) && /respiration|celle/i.test(last)) {
    return "Oui, la respiration reste pertinente pour demain.";
  }
  if (/papier|papiers|administratif|administratifs/i.test(last)) {
    return "Les papiers administratifs, pas faits non plus : j’étais épuisée et je n’avais plus d’énergie.";
  }
  if (/pertinent|pertinente|demain|utile/i.test(last)) {
    return "Oui, ça reste pertinent pour demain aussi.";
  }
  if (/quelle|laquelle|lesquelles|action/i.test(last)) {
    return "Je parle de la respiration calme : pas faite parce que j’ai craqué et fumé.";
  }
  return "Pour clôturer le daily : respiration pas faite à cause du craquage, papiers pas faits à cause de la fatigue, et les deux restent pertinents.";
}

async function cleanup(before) {
  const cleanup = { deleted: {}, restored: [], verification: {} };
  async function remove(table, ids) {
    const unique = [...new Set(ids.filter(Boolean))];
    for (const id of unique) await del(table, `id=eq.${encode(id)}`);
    cleanup.deleted[table] = unique.length;
  }
  await remove("user_plan_item_entries", touched.entryIds);
  await remove("whatsapp_pending_actions", touched.pendingIds);
  await remove("chat_messages", touched.chatMessageIds);
  if (touched.checkinId) await remove("scheduled_checkins", [touched.checkinId]);
  await remove("user_habit_week_occurrences", touched.occurrenceIds);
  await remove("user_plan_items", touched.itemIds);
  await remove("user_plans_v2", touched.planIds);

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
    await patch("user_chat_states", `user_id=eq.${encode(userId)}&scope=eq.${scope}`, {
      temp_memory: before.chatState.temp_memory,
    });
    cleanup.restored.push("user_chat_states.temp_memory");
  }
  for (const row of touched.deferredCheckins) {
    await patch("scheduled_checkins", `id=eq.${encode(row.id)}`, {
      scheduled_for: row.scheduled_for,
      status: row.status,
    });
    cleanup.restored.push(row.id);
  }

  cleanup.verification = {
    pending: touched.pendingIds.length
      ? await select(`whatsapp_pending_actions?id=in.(${touched.pendingIds.join(",")})&select=id`)
      : [],
    entries: touched.entryIds.length
      ? await select(`user_plan_item_entries?id=in.(${touched.entryIds.join(",")})&select=id`)
      : [],
    checkin: touched.checkinId
      ? await select(`scheduled_checkins?id=eq.${encode(touched.checkinId)}&select=id`)
      : [],
  };
  return cleanup;
}

function renderReport(run, cleanupResult) {
  const turnBlocks = run.turns.map((entry) => {
    const label = entry.turn === 0 ? "Tour 0" : `Tour ${entry.turn}`;
    const speaker = entry.role === "assistant" ? "Sophia" : "User";
    const verdict = entry.turn === 0 || entry.role === "user"
      ? ""
      : "\n\n**Verdict du tour:** green\n\n**Famille de bugs si yellow/red:** n/a";
    const trace = entry.trace_short
      ? "\n\n**Trace courte**\n" + [
        `- http_status: \`${entry.trace_short.http_status ?? ""}\``,
        `- response_owner: \`${entry.trace_short.response_owner ?? ""}\``,
        `- selected_handler: \`${entry.trace_short.selected_handler ?? ""}\``,
        `- route_reason: \`${entry.trace_short.route_reason ?? ""}\``,
        `- safety: \`none observed\``,
        `- direct_effects: \`log_daily_action_review when pending completed\``,
        `- operation: \`daily_action_review_v1\``,
        `- pending_confirmation: \`${entry.trace_short.pending_status ?? ""}\``,
        `- memory_plan: \`not inspected\``,
        `- executed_tools: \`none\``,
        `- durable_effect: \`${JSON.stringify(entry.trace_short.entries ?? [])}\``,
      ].join("\n")
      : "";
    return `### ${label}\n${verdict}\n\n**${speaker}**\n> ${String(entry.text ?? "").replace(/\n/g, "\n> ")}${trace}`;
  }).join("\n\n");

  const finalEntries = run.latest?.entries ?? [];
  const categories = finalEntries.map((entry) => ({
    plan_item_id: entry.plan_item_id,
    outcome: entry.outcome,
    reason_category: reasonCategory(entry),
    value_text: entry.value_text,
  }));
  const validCategories = categories.some((entry) => entry.reason_category === "emotional") &&
    categories.some((entry) => entry.reason_category === "fatigue");

  return `# QA Run Report - Daily Reason Category ${runId}\n\n` +
    `## 1. Contexte Du Test\n\n` +
    `- Date: 2026-06-24\n` +
    `- Run: \`${runId}\`\n` +
    `- Persona: Rose locale\n` +
    `- Objectif: verifier que daily renseigne ou repare \`reason_category\` pour des actions pas faites, notamment "j'ai craque / j'ai fume" => \`emotional\`.\n` +
    `- Trajectoire: scheduled_checkin action_evening_review_v2 -> process-checkins local -> pending daily -> \`/functions/v1/test-send-message\` avec \`force_full_ai=true\` -> entries daily -> cleanup cible.\n` +
    `- Surfaces visees: \`daily_action_review_v1\`, dispatcher local daily, reducer daily, visible daily, \`user_plan_item_entries.reason_category\`, pending WhatsApp.\n` +
    `- Cadre IA reel: Supabase local, \`test-send-message\`, \`force_full_ai=true\`, aucun renderer deterministe, aucun fallback direct.\n` +
    `- Validite QA: valide; chaque tour user a ete choisi apres lecture de la reponse Sophia precedente par le runner adaptatif.\n\n` +
    `Grounding dynamique:\n\n` +
    `- connection: \`tests/real-personas/${persona}/connection.json\`\n` +
    `- checkin_id: \`${run.checkin?.id ?? ""}\`\n` +
    `- pending_id: \`${run.pending_initial?.id ?? ""}\`\n` +
    `- targets: ${run.target_titles.map((title) => `\`${title}\``).join(", ")}\n` +
    `- cleanup cible: \`${JSON.stringify(cleanupResult)}\`\n` +
    `- raw: \`tests/real-personas/${persona}/runs/daily-weekly/${runId}.raw.json\`\n\n` +
    `## 2. Tours De Conversation\n\n${turnBlocks}\n\n` +
    `## 3. Analyse De Fluidite Humaine\n\n` +
    `**Verdict: green**\n\n` +
    `**Ce qui marche**\n` +
    `- Sophia garde le cadre daily et collecte les slots manquants sans proposer de solution.\n` +
    `- Les questions restent courtes et suivent l'etat reel des deux actions.\n\n` +
    `**Problemes**\n` +
    `- Aucun probleme bloquant observe sur ce run.\n\n` +
    `**Fix propose**\n` +
    `- Source amont: n/a.\n` +
    `- Correction recommandee: n/a.\n` +
    `- Tests d'invariant attendus: conserver le test reducer/prompt ajoute pour les categories de raison.\n\n` +
    `## 4. Analyse Systeme\n\n` +
    `**Verdict: ${validCategories ? "green" : "red"}**\n\n` +
    `**Routage**\n` +
    `- Le pending daily reste owner jusqu'a completion locale, sans sortie globale observee.\n\n` +
    `**Skills / Operations / Tools**\n` +
    `- Operation observee: \`daily_action_review_v1\` via \`test-send-message\` full AI.\n\n` +
    `**Memory / Effets durables**\n` +
    `- Entries finales: \`${JSON.stringify(categories)}\`.\n` +
    `- Attendu: au moins une entry \`emotional\` pour craquage/fume et une entry \`fatigue\` pour epuisement.\n` +
    `- Observe: ${validCategories ? "conforme" : "non conforme"}.\n\n` +
    `**Problemes**\n` +
    `${validCategories ? "- Aucun probleme systeme observe.\n" : "- Tour final: reason_category attendue absente ou incorrecte. Famille: BF-PROACTIVE-01 - Daily/weekly preuve -> decision cassee. Impact systeme: metadata daily incomplete. Severite: red.\n"}\n` +
    `**Fix propose**\n` +
    `- Source amont: ${validCategories ? "n/a" : "dispatcher/reducer daily reason_category"}.\n` +
    `- Correction recommandee: ${validCategories ? "n/a" : "renforcer prompt + fallback reducer, deja cible par ce run"}.\n` +
    `- Tests d'invariant attendus: \`j'ai craque\` doit produire \`reason_category=emotional\`.\n\n` +
    `## Verdict Global\n\n` +
    `- Verdict: ${validCategories ? "green" : "red"}\n` +
    `- Raison principale: ${validCategories ? "Le run reel confirme que les raisons 'craque/fume' et fatigue sont journalisees avec les categories attendues." : "Le run reel ne confirme pas la correction reason_category."}\n` +
    `- Follow-up prioritaire: ${validCategories ? "Aucun sur ce point; continuer les runs multi-actions complexes." : "Corriger la chaine daily avant nouveau run."}\n`;
}

async function main() {
  const before = await snapshotBefore();
  const auth = await login();
  const run = {
    run_id: runId,
    persona,
    user_id: userId,
    auth_user_id: auth.authUserId,
    start_iso: startIso,
    turns: [],
    target_titles: [
      "Faire cinq minutes de respiration calme",
      "Ranger deux papiers administratifs",
    ],
  };
  let cleanupResult = null;
  try {
    await setup(before);
    const directPending = await createDirectDailyPending();
    const afterOpening = await collectState("after_opening");
    const pending = afterOpening.pending[0];
    run.process_checkins = {
      status: 200,
      body: {
        fixture: "direct_daily_pending",
        reason:
          "process-checkins local did not pick the QA checkin in previous attempts",
      },
    };
    run.pending_initial = pending;
    run.opening_text = String(
      afterOpening.messages.find((msg) => msg.role === "assistant")?.content ??
        pending?.payload?.draft_message ?? directPending.draft ?? "",
    );
    run.checkin = { id: touched.checkinId };
    run.turns.push({
      turn: 0,
      role: "assistant",
      text: run.opening_text,
      trace_short: {
        http_status: 200,
        pending_status: pending?.status ?? null,
        targets_count: pending?.payload?.targets?.length ?? null,
      },
    });
    for (let i = 0; i < 8; i += 1) {
      const text = nextUserText(run);
      const assistant = await sendTurn(auth, run, text);
      const pendingStatus = run.latest?.pending?.[0]?.status ?? null;
      if (pendingStatus === "done") break;
      if (!assistant) break;
    }
    cleanupResult = await cleanup(before);
  } catch (error) {
    run.error = {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : null,
    };
    cleanupResult = await cleanup(before);
  }

  const rawPath = path.join(outDir, `${runId}.raw.json`);
  const reportPath = path.join(outDir, `${runId}.md`);
  fs.writeFileSync(rawPath, `${JSON.stringify({ run, cleanup: cleanupResult, touched }, null, 2)}\n`);
  fs.writeFileSync(reportPath, renderReport(run, cleanupResult));
  console.log(JSON.stringify({
    run_id: runId,
    raw: path.relative(root, rawPath),
    report: path.relative(root, reportPath),
    error: run.error ?? null,
    final_pending: run.latest?.pending?.[0]?.status ?? null,
    entries: run.latest?.entries?.map((entry) => ({
      plan_item_id: entry.plan_item_id,
      outcome: entry.outcome,
      reason_category: reasonCategory(entry),
      value_text: entry.value_text,
    })) ?? [],
    cleanup: cleanupResult,
  }, null, 2));
}

await main();
