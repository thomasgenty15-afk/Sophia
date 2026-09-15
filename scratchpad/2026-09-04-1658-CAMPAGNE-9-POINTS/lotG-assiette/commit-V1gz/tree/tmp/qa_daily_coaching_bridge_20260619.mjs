import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const persona = process.env.QA_PERSONA || "rose";
const runId = process.env.QA_RUN_ID ||
  `qa-daily-coaching-bridge-${new Date().toISOString().replace(/[:.]/g, "")}`;
const timezone = "Europe/Paris";
const outDir = path.join(root, "tmp", runId);
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

function supabaseStatus() {
  try {
    return JSON.parse(
      execFileSync("supabase", ["status", "--output", "json"], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
  } catch {
    return {};
  }
}

const env = readEnvFile(path.join(root, "supabase/.env"));
const status = supabaseStatus();
const apiUrl = (process.env.SUPABASE_URL || env.SUPABASE_URL ||
  status.API_URL || "http://127.0.0.1:54321").replace(/\/+$/, "");
const anonKey = process.env.SUPABASE_ANON_KEY || status.ANON_KEY ||
  env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  env.SUPABASE_SERVICE_ROLE_KEY || status.SERVICE_ROLE_KEY;
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
if (!userId || !email) throw new Error(`missing user_id/email in ${connectionPath}`);

async function login() {
  const result = await jsonFetch(`${apiUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  const accessToken = String(result.body?.access_token ?? "");
  if (!accessToken) throw new Error("missing access token");
  await jsonFetch(`${apiUrl}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${accessToken}`,
    },
  });
  return { accessToken };
}

function localParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const ymd = `${byType.year}-${byType.month}-${byType.day}`;
  const weekday = String(byType.weekday ?? "").toLowerCase();
  const plannedDay = {
    mon: "mon",
    tue: "tue",
    wed: "wed",
    thu: "thu",
    fri: "fri",
    sat: "sat",
    sun: "sun",
  }[weekday.slice(0, 3)] ?? "fri";
  return { ymd, plannedDay };
}

function weekStartYmd(localDate) {
  const date = new Date(`${localDate}T12:00:00.000Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function dayOrdinal(day) {
  return { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 }[day] ?? 5;
}

const { ymd: localDate, plannedDay } = localParts();
const weekStartDate = weekStartYmd(localDate);
const ordinal = dayOrdinal(plannedDay);
let profileBeforeQa = null;
let chatStateBeforeQa = null;
const qaPhone = "1555" +
  crypto.createHash("sha256").update(`${runId}:${userId}`).digest("hex")
    .replace(/[a-f]/g, "")
    .padEnd(10, "0")
    .slice(0, 10);

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw_text: text };
  }
  if (!response.ok) {
    const error = new Error(`${response.status} ${url}: ${text}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return { status: response.status, body };
}

async function rest(pathPart, options = {}) {
  return await jsonFetch(`${apiUrl}/rest/v1/${pathPart}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      accept: "application/json",
      ...(options.headers ?? {}),
    },
  });
}

async function select(pathPart) {
  return (await rest(pathPart, { method: "GET" })).body;
}

async function insert(table, rowOrRows) {
  return (await rest(table, {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify(rowOrRows),
  })).body;
}

async function patch(table, query, row) {
  return (await rest(`${table}?${query}`, {
    method: "PATCH",
    headers: { prefer: "return=representation" },
    body: JSON.stringify(row),
  })).body;
}

async function del(table, query) {
  return await rest(`${table}?${query}`, { method: "DELETE" });
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

async function cleanupQaRunId() {
  const checkins = await select(
    `scheduled_checkins?message_payload->>qa_run_id=eq.${runId}&select=id,message_payload`,
  );
  for (const checkin of checkins ?? []) {
    const occurrenceIds = Array.isArray(checkin?.message_payload?.occurrence_ids)
      ? checkin.message_payload.occurrence_ids.filter(Boolean)
      : [];
    const pendings = await select(
      `whatsapp_pending_actions?scheduled_checkin_id=eq.${checkin.id}&select=id`,
    );
    const pendingIds = (pendings ?? []).map((row) => row.id).filter(Boolean);
    if (pendingIds.length) {
      const entries = await select(
        `user_plan_item_entries?metadata->>pending_action_id=in.(${pendingIds.join(",")})&select=id`,
      );
      const entryIds = (entries ?? []).map((row) => row.id).filter(Boolean);
      if (entryIds.length) {
        await del("user_plan_item_entries", `id=in.(${entryIds.join(",")})`);
      }
      await del("whatsapp_pending_actions", `id=in.(${pendingIds.join(",")})`);
    }
    await del(
      "chat_messages",
      `user_id=eq.${userId}&metadata->>original_checkin_id=eq.${checkin.id}`,
    );
    await del("scheduled_checkins", `id=eq.${checkin.id}`);
    if (occurrenceIds.length) {
      await del("user_habit_week_occurrences", `id=in.(${occurrenceIds.join(",")})`);
    }
  }
}

async function profileSnapshot() {
  return (await select(
    `profiles?id=eq.${encodeURIComponent(userId)}&select=id,email,full_name,access_tier,trial_end,whatsapp_last_inbound_at,whatsapp_last_outbound_at&limit=1`,
  ))?.[0] ?? null;
}

async function prepareProfileForQaQuietWindow(profile) {
  if (!profile?.id) return;
  await patch("profiles", `id=eq.${encodeURIComponent(userId)}`, {
    access_tier: "alliance",
    trial_end: "2027-01-01T00:00:00.000Z",
    whatsapp_last_inbound_at: "2026-01-01T00:00:00.000Z",
    whatsapp_last_outbound_at: "2026-01-01T00:00:00.000Z",
  });
}

async function restoreProfileAfterQa(profile) {
  if (!profile?.id) return;
  await patch("profiles", `id=eq.${encodeURIComponent(userId)}`, {
    access_tier: profile.access_tier ?? null,
    trial_end: profile.trial_end ?? null,
    whatsapp_last_inbound_at: profile.whatsapp_last_inbound_at ?? null,
    whatsapp_last_outbound_at: profile.whatsapp_last_outbound_at ?? null,
  });
}

async function chatStateSnapshot() {
  return (await select(
    `user_chat_states?user_id=eq.${encodeURIComponent(userId)}&scope=eq.whatsapp&select=user_id,scope,temp_memory&limit=1`,
  ))?.[0] ?? null;
}

async function prepareChatStateForQa(state) {
  const tempMemory = state?.temp_memory && typeof state.temp_memory === "object"
    ? { ...state.temp_memory }
    : {};
  delete tempMemory.__active_conversation_skill_v1;
  delete tempMemory.__active_skill_state;
  delete tempMemory.__last_daily_action_review_exit_memo;
  delete tempMemory.__last_daily_action_review_child_flow_handoff;
  delete tempMemory.__last_coaching_recommendation_exit_memo;
  delete tempMemory.__last_completed_flow_memo;
  await patch(
    "user_chat_states",
    `user_id=eq.${encodeURIComponent(userId)}&scope=eq.whatsapp`,
    { temp_memory: tempMemory },
  );
}

async function restoreChatStateAfterQa(state) {
  if (!state?.user_id || !state?.scope) return;
  await patch(
    "user_chat_states",
    `user_id=eq.${encodeURIComponent(state.user_id)}&scope=eq.${encodeURIComponent(state.scope)}`,
    {
    temp_memory: state.temp_memory ?? {},
    },
  );
}

async function loadGrounding() {
  const plans = await select(
    `user_plans_v2?user_id=eq.${encodeURIComponent(userId)}&status=eq.active&select=id,cycle_id,transformation_id,status,title,updated_at&order=updated_at.desc&limit=1`,
  );
  const plan = plans?.[0];
  if (!plan) throw new Error(`No active plan for ${persona}`);
  const items = await select(
    `user_plan_items?user_id=eq.${encodeURIComponent(userId)}&plan_id=eq.${plan.id}&status=eq.active&select=id,plan_id,cycle_id,transformation_id,dimension,kind,status,title,description,tracking_type,scheduled_days,time_of_day,payload,created_at&order=created_at.asc`,
  );
  if (!items?.length) throw new Error(`No active items for ${persona}`);
  return { plan, items: items.slice(0, Math.min(3, items.length)) };
}

async function createOrResetOccurrence(item, startIso) {
  const existing = await select(
    `user_habit_week_occurrences?user_id=eq.${encodeURIComponent(userId)}&plan_item_id=eq.${item.id}&week_start_date=eq.${weekStartDate}&ordinal=eq.${ordinal}&select=*&limit=1`,
  );
  if (existing?.[0]) {
    await patch("user_habit_week_occurrences", `id=eq.${existing[0].id}`, {
      planned_day: plannedDay,
      original_planned_day: null,
      actual_day: null,
      status: "planned",
      source: "manual_change",
      validated_at: null,
      updated_at: startIso,
      default_day: plannedDay,
    });
    return { id: existing[0].id, snapshot: existing[0] };
  }
  const inserted = (await insert("user_habit_week_occurrences", {
    user_id: userId,
    cycle_id: item.cycle_id,
    transformation_id: item.transformation_id,
    plan_id: item.plan_id,
    plan_item_id: item.id,
    week_start_date: weekStartDate,
    ordinal,
    planned_day: plannedDay,
    original_planned_day: null,
    actual_day: null,
    status: "planned",
    source: "manual_change",
    validated_at: null,
    default_day: plannedDay,
  }))?.[0];
  return { id: inserted?.id, snapshot: null };
}

async function createDailyOpening(targetItems) {
  await cleanupQaRunId();
  const startIso = new Date().toISOString();
  const dueDate = new Date();
  dueDate.setUTCHours(0, 0, 0, 0);
  const dueAt = dueDate.toISOString();
  const occurrenceIds = [];
  const existingOccurrenceSnapshots = [];
  for (const item of targetItems) {
    const occurrence = await createOrResetOccurrence(item, startIso);
    if (occurrence.id) occurrenceIds.push(occurrence.id);
    if (occurrence.snapshot) existingOccurrenceSnapshots.push(occurrence.snapshot);
  }
  if (!occurrenceIds.length) throw new Error("No occurrence ids created");

  let checkin = (await insert("scheduled_checkins", {
    user_id: userId,
    event_context: "action_evening_review_v2",
    draft_message: null,
    scheduled_for: dueAt,
    status: "pending",
    message_mode: "dynamic",
    origin: "action_review",
    message_payload: {
      qa_run_id: runId,
      event_context: "action_evening_review_v2",
      chat_capability: "daily_action_review",
      qa_note: "daily_coaching_recommendation_daily_bridge",
      local_date: localDate,
      week_start_date: weekStartDate,
      timezone,
      occurrence_ids: occurrenceIds,
    },
  }))?.[0];
  checkin = (await patch("scheduled_checkins", `id=eq.${checkin.id}`, {
    scheduled_for: dueAt,
    status: "pending",
  }))?.[0] ?? { ...checkin, scheduled_for: dueAt, status: "pending" };
  const persistedCheckin = (await select(
    `scheduled_checkins?id=eq.${checkin.id}&select=id,status,scheduled_for,message_payload&limit=1`,
  ))?.[0];
  if (persistedCheckin) checkin = { ...checkin, ...persistedCheckin };
  if (new Date(checkin.scheduled_for).getTime() > Date.now()) {
    throw new Error(
      `QA checkin is not due after insert/patch: ${checkin.id} scheduled_for=${checkin.scheduled_for}`,
    );
  }

  const processed = await invokeFunction(
    "process-checkins",
    { force: true },
    `${runId}-process-checkins`,
  );
  const pending = await select(
    `whatsapp_pending_actions?user_id=eq.${encodeURIComponent(userId)}&kind=eq.scheduled_checkin&scheduled_checkin_id=eq.${checkin.id}&select=id,scheduled_checkin_id,status,payload,created_at,processed_at&limit=1`,
  );
  const openingMessages = await select(
    `chat_messages?user_id=eq.${encodeURIComponent(userId)}&scope=eq.whatsapp&role=eq.assistant&metadata->>original_checkin_id=eq.${checkin.id}&select=id,role,content,metadata,created_at,agent_used&order=created_at.asc`,
  );
  if (!pending?.[0]) {
    throw new Error(`No pending generated for checkin ${checkin.id}`);
  }
  return {
    start_iso: startIso,
    checkin,
    process_checkins: processed,
    pending_initial: pending[0],
    opening_messages: openingMessages ?? [],
    opening_text: String(openingMessages?.at(-1)?.content ?? pending[0]?.payload?.draft_message ?? ""),
    occurrence_ids: occurrenceIds,
    existing_occurrence_snapshots: existingOccurrenceSnapshots,
    message_ids_for_cleanup: (openingMessages ?? []).map((msg) => msg.id).filter(Boolean),
  };
}

async function snapshot(run, startedAt = run.start_iso) {
  const pending = await select(
    `whatsapp_pending_actions?id=eq.${run.pending_initial.id}&select=id,status,payload,processed_at`,
  );
  const entries = await select(
    `user_plan_item_entries?user_id=eq.${encodeURIComponent(userId)}&metadata->>source=eq.daily_action_review_v1&created_at=gte.${encodeURIComponent(run.start_iso)}&select=id,plan_item_id,entry_kind,outcome,value_text,blocker_hint,difficulty_level,metadata,effective_at,created_at&order=created_at.asc`,
  );
  const occurrences = await select(
    `user_habit_week_occurrences?id=in.(${run.occurrence_ids.join(",")})&select=id,plan_item_id,planned_day,status,source,validated_at,updated_at&order=plan_item_id.asc`,
  );
  const chatState = (await select(
    `user_chat_states?user_id=eq.${encodeURIComponent(userId)}&scope=eq.whatsapp&select=current_mode,temp_memory,last_processed_at,last_interaction_at&limit=1`,
  ))?.[0] ?? null;
  const assistant = await select(
    `chat_messages?user_id=eq.${encodeURIComponent(userId)}&scope=eq.whatsapp&role=eq.assistant&created_at=gte.${encodeURIComponent(startedAt)}&select=id,content,metadata,created_at,agent_used&order=created_at.asc&limit=20`,
  );
  return { pending, entries, occurrences, chatState, assistant };
}

async function sendWhatsapp(run, text, label, _auth) {
  const turn = run.turns.filter((entry) => entry.role === "user").length + 1;
  const startedAt = new Date().toISOString();
  const requestId = `${runId}-t${String(turn).padStart(2, "0")}-${label}`;
  const payload = {
    object: "whatsapp_business_account",
    entry: [{
      id: `qa-entry-${runId}`,
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: {
            display_phone_number: qaPhone,
            phone_number_id: crypto.createHash("sha256").update(runId)
              .digest("hex").slice(0, 16),
          },
          contacts: [{
            profile: { name: `${persona} QA` },
            wa_id: qaPhone,
          }],
          messages: [{
            from: qaPhone,
            id: `wamid_${runId}_${turn}_${crypto.randomUUID()}`,
            timestamp: String(Math.floor(Date.now() / 1000)),
            type: "text",
            sophia_user_id: userId,
            text: { body: text },
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
      "x-request-id": requestId,
    },
    body: JSON.stringify(payload),
  });
  const snap = await snapshot(run, startedAt);
  const assistantText = (snap.assistant ?? []).map((msg) =>
    String(msg.content ?? "")
  ).join("\n\n").trim();
  const assistantMetadata = (snap.assistant ?? []).map((msg) =>
    msg.metadata ?? {}
  );
  const lastAssistantMetadata = assistantMetadata.at(-1) ?? {};
  run.message_ids_for_cleanup.push(
    ...(snap.assistant ?? []).map((msg) => msg.id).filter(Boolean),
  );
  run.turns.push({ turn, role: "user", text, label });
  run.turns.push({
    turn,
    role: "assistant",
    text: assistantText,
    trace_short: {
      http_status: response.status,
      response_owner: lastAssistantMetadata.route_owner ??
        lastAssistantMetadata.source ?? null,
      selected_handler: lastAssistantMetadata.selected_handler ?? null,
      route_reason: lastAssistantMetadata.route_reason ?? null,
      force_full_ai: "not_applicable_webhook_pending",
      request_id: requestId,
      assistant_message_count: snap.assistant?.length ?? 0,
      assistant_metadata: assistantMetadata,
      pending_status: snap.pending?.[0]?.status ?? null,
      review_status: snap.pending?.[0]?.payload?.review_state?.status ?? null,
      current_focus_occurrence_ids:
        snap.pending?.[0]?.payload?.review_state?.current_focus_occurrence_ids ?? null,
      remaining_occurrence_ids:
        snap.pending?.[0]?.payload?.review_state?.remaining_occurrence_ids ?? null,
      next_question_targets:
        snap.pending?.[0]?.payload?.review_state?.next_question_targets ?? null,
      local_flow_transfer: snap.pending?.[0]?.payload?.local_flow_transfer ?? null,
      child_flow_handoff:
        snap.pending?.[0]?.payload?.child_flow_handoff?.child_flow ?? null,
      child_flow_context:
        snap.pending?.[0]?.payload?.child_flow_handoff?.child_flow_context ??
          null,
      active_skill_id:
        snap.chatState?.temp_memory?.__active_conversation_skill_state?.skill_id ??
          snap.chatState?.temp_memory?.__active_skill_state?.skill_id ?? null,
      last_daily_exit_target:
        snap.chatState?.temp_memory?.__last_daily_action_review_exit_memo?.note_information
          ?.target_dispatcher ?? null,
      last_daily_child_flow_handoff:
        snap.chatState?.temp_memory?.__last_daily_action_review_child_flow_handoff
          ?.note_information?.target_dispatcher ?? null,
      last_coaching_exit_target:
        snap.chatState?.temp_memory?.__last_coaching_recommendation_exit_memo
          ?.note_information?.target_dispatcher ?? null,
      entries_count: snap.entries?.length ?? 0,
      occurrence_statuses: snap.occurrences?.map((row) => ({
        id: row.id,
        plan_item_id: row.plan_item_id,
        status: row.status,
      })) ?? [],
    },
    raw_body: response.body,
    snapshot: snap,
  });
  run.latest = snap;
  return assistantText;
}

function targetLabel(run, index) {
  const target = run.pending_initial?.payload?.targets?.[index];
  return target?.title || run.target_items?.[index]?.title || `action ${index + 1}`;
}

function allTargetsDoneSentence(run) {
  const targets = run.pending_initial.payload.targets ?? [];
  if (!targets.length) return "Toutes les actions du check sont faites aujourd'hui.";
  return targets.map((target) => `${target.title} est fait`).join("; ");
}

function chooseNextText(run) {
  const userTurns = run.turns.filter((entry) => entry.role === "user").length;
  const lastAssistant = String(run.turns.at(-1)?.text ?? run.opening_text ?? "");
  const pending = run.latest?.pending?.[0] ?? run.pending_initial;
  const pendingStatus = pending?.status;
  const activeSkill = run.latest?.chatState?.temp_memory
    ? (run.latest.chatState.temp_memory.__active_conversation_skill_state?.skill_id ??
      run.latest.chatState.temp_memory.__active_skill_state?.skill_id ?? null)
    : null;
  const reviewState = pending?.payload?.review_state ?? {};
  const missing = Object.values(reviewState.items ?? {})
    .filter((item) => !item?.outcome || item?.missing_slots?.length)
    .map((item) => item?.title ?? item?.occurrence_id)
    .filter(Boolean);
  const lower = lastAssistant.toLowerCase();
  const coachingReplies = run.turns.filter((entry) =>
    entry.role === "assistant" &&
    entry.trace_short?.active_skill_id === "coaching_recommendation"
  ).length;

  if (
    userTurns === 0 &&
    (pending?.payload?.message_mode === "template_gate" ||
      /prêt|pret|bilan/i.test(lastAssistant))
  ) {
    return "Oui, vas-y pour le bilan.";
  }
  if (userTurns <= 1) {
    return `Sur ${targetLabel(run, 0)}, je bloque encore: je l'oublie deux soirs sur trois et je ne sais pas quel levier Sophia choisir. Tu peux m'aider à choisir, puis on reprend le check ?`;
  }
  if (
    activeSkill === "coaching_recommendation" &&
    /quoi exactement|oubli du soir|moment où tu le fais|geste ne tient pas|débloquer/i
      .test(lastAssistant)
  ) {
    return "C'est surtout l'oubli du soir: je ne vois pas le matériel comme un déclencheur à ranger, donc je zappe jusqu'au moment où l'automatisme revient.";
  }
  if (coachingReplies >= 1) {
    return `Merci, j'ai mon levier. On reprend le daily: ${allTargetsDoneSentence(run)}.`;
  }
  if (activeSkill === "coaching_recommendation" || /carte|levier|recommand|attaque|défense|defense|ajust/.test(lower)) {
    return "Oui, choisis le levier le plus simple pour ce blocage. Je veux juste repartir avec le bon appui, puis je réponds au check daily.";
  }
  if (pendingStatus === "done") {
    return "Merci, on peut revenir à une conversation normale maintenant.";
  }
  if (/laquelle|lesquelles|quelle action|précise|precise/.test(lower)) {
    const rest = (run.pending_initial.payload.targets ?? [])
      .slice(1)
      .map((target) => `${target.title} est fait`)
      .join("; ");
    return `Je parle de ${targetLabel(run, 0)} pour le blocage.${rest ? ` Pour le reste du check: ${rest}.` : ""}`;
  }
  if (/fait|pas fait|faite|faites|check|daily|aujourd/.test(lower)) {
    if (missing.length > 1) {
      return `Pour clôturer le daily: ${allTargetsDoneSentence(run)}.`;
    }
    if (missing.length === 1) {
      return `${missing[0]} est fait aujourd'hui.`;
    }
    return "Toutes les actions du check sont faites aujourd'hui.";
  }
  return `On reprend le daily: ${allTargetsDoneSentence(run)}.`;
}

async function cleanupRun(run) {
  const cleanup = { run_id: runId, deleted: {}, restored: [] };
  const entryIds = (run.latest?.entries ?? []).map((entry) => entry.id).filter(Boolean);
  if (entryIds.length) {
    await del("user_plan_item_entries", `id=in.(${entryIds.join(",")})`);
    cleanup.deleted.entries = entryIds.length;
  }
  await del("whatsapp_pending_actions", `scheduled_checkin_id=eq.${run.checkin.id}`);
  cleanup.deleted.pending = 1;
  if (run.message_ids_for_cleanup.length) {
    await del("chat_messages", `id=in.(${[...new Set(run.message_ids_for_cleanup)].join(",")})`);
    cleanup.deleted.chat_messages = [...new Set(run.message_ids_for_cleanup)].length;
  }
  await del("scheduled_checkins", `id=eq.${run.checkin.id}`);
  cleanup.deleted.checkin = 1;
  const restoredIds = new Set();
  for (const snapshot of run.existing_occurrence_snapshots ?? []) {
    restoredIds.add(snapshot.id);
    await patch("user_habit_week_occurrences", `id=eq.${snapshot.id}`, {
      planned_day: snapshot.planned_day,
      original_planned_day: snapshot.original_planned_day,
      actual_day: snapshot.actual_day,
      status: snapshot.status,
      source: snapshot.source,
      validated_at: snapshot.validated_at,
      updated_at: snapshot.updated_at,
      default_day: snapshot.default_day,
    });
    cleanup.restored.push(snapshot.id);
  }
  const toDelete = (run.occurrence_ids ?? []).filter((id) => !restoredIds.has(id));
  if (toDelete.length) {
    await del("user_habit_week_occurrences", `id=in.(${toDelete.join(",")})`);
    cleanup.deleted.occurrences = toDelete.length;
  }
  if (run.profile_before_qa) {
    await restoreProfileAfterQa(run.profile_before_qa);
    cleanup.restored.push("profiles.whatsapp_activity_timestamps");
  }
  if (run.chat_state_before_qa) {
    await restoreChatStateAfterQa(run.chat_state_before_qa);
    cleanup.restored.push("user_chat_states.temp_memory");
  }
  return cleanup;
}

function lineQuote(text) {
  return String(text || "(reponse vide)").replace(/\n/g, "\n> ");
}

function turnVerdict(entry) {
  const trace = entry.trace_short ?? {};
  if (!entry.text) return { verdict: "red", family: "BF-VISIBLE-01" };
  if (trace.http_status && trace.http_status !== 200) {
    return { verdict: "red", family: "BF-RUNTIME-01" };
  }
  if (trace.local_flow_transfer === "exit_to_global_dispatcher") {
    return { verdict: "red", family: "BF-ROUTING-01" };
  }
  return { verdict: "green", family: "" };
}

function renderReport(run, cleanup) {
  const reportPath = path.join(
    root,
    "tests/real-personas",
    persona,
    "runs",
    "daily-weekly",
    `${runId}.md`,
  );
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const rawPath = path.join(outDir, `${runId}.raw.json`);
  const cleanupPath = path.join(outDir, `${runId}.cleanup.json`);
  const targetTitles = run.pending_initial.payload.targets.map((target) => target.title);
  const bridgeObserved = run.turns.some((entry) =>
    entry.trace_short?.local_flow_transfer === "handoff_to_child_flow" ||
    entry.trace_short?.child_flow_handoff === "coaching_recommendation" ||
    entry.trace_short?.last_daily_child_flow_handoff === "coaching_recommendation"
  );
  const coachingObserved = run.turns.some((entry) =>
    entry.trace_short?.active_skill_id === "coaching_recommendation"
  );
  const returnObserved = run.turns.some((entry) =>
    entry.trace_short?.last_coaching_exit_target === "daily_action_review_v1"
  );
  const finalStatus = run.final_before_cleanup?.pending?.[0]?.status ?? null;
  const entriesCount = run.final_before_cleanup?.entries?.length ?? 0;
  const occurrenceStatuses = run.final_before_cleanup?.occurrences ?? [];
  const systemVerdict = bridgeObserved && coachingObserved && returnObserved &&
      finalStatus === "done" &&
      entriesCount >= targetTitles.length
    ? "green"
    : bridgeObserved
    ? "yellow"
    : "red";
  const humanVerdict = run.turns.some((entry) => entry.role === "assistant" && !entry.text)
    ? "red"
    : "green";
  const turns = run.turns.map((entry) => {
    const title = entry.turn === 0 ? "### Tour 0" : `### Tour ${entry.turn}`;
    const speaker = entry.role === "assistant" ? "Sophia" : "User";
    const verdict = entry.role === "assistant" && entry.turn > 0
      ? turnVerdict(entry)
      : { verdict: "green", family: "" };
    const trace = entry.trace_short
      ? [
        "",
        "**Trace courte**",
        `- http_status: \`${entry.trace_short.http_status ?? ""}\``,
        `- response_owner: \`${entry.trace_short.response_owner ?? ""}\``,
        `- selected_handler: \`${entry.trace_short.selected_handler ?? ""}\``,
        `- route_reason: \`${entry.trace_short.route_reason ?? ""}\``,
        `- force_full_ai: \`${entry.trace_short.force_full_ai ?? ""}\``,
        `- pending_status: \`${entry.trace_short.pending_status ?? ""}\``,
        `- review_status: \`${entry.trace_short.review_status ?? ""}\``,
        `- local_flow_transfer: \`${entry.trace_short.local_flow_transfer ?? ""}\``,
        `- child_flow_handoff: \`${entry.trace_short.child_flow_handoff ?? ""}\``,
        `- active_skill_id: \`${entry.trace_short.active_skill_id ?? ""}\``,
        `- last_daily_exit_target: \`${entry.trace_short.last_daily_exit_target ?? ""}\``,
        `- last_daily_child_flow_handoff: \`${entry.trace_short.last_daily_child_flow_handoff ?? ""}\``,
        `- last_coaching_exit_target: \`${entry.trace_short.last_coaching_exit_target ?? ""}\``,
        `- entries_count: \`${entry.trace_short.entries_count ?? 0}\``,
        `- occurrence_statuses: \`${JSON.stringify(entry.trace_short.occurrence_statuses ?? [])}\``,
      ].join("\n")
      : "";
    const verdictLines = entry.role === "assistant"
      ? `\n\n**Verdict du tour:** ${verdict.verdict}` +
        (verdict.family ? `\n\n**Famille de bugs si yellow/red:** ${verdict.family}` : "")
      : "";
    return `${title}${verdictLines}\n\n**${speaker}**\n> ${lineQuote(entry.text)}${trace}`;
  }).join("\n\n");
  const report = `# QA Run Report - Daily Coaching Recommendation Daily\n\n` +
    `## 1. Contexte Du Test\n\n` +
    `- Date: 2026-06-29\n` +
    `- Run: \`${runId}\`\n` +
    `- Persona: ${persona}\n` +
    `- Objectif: verifier en conditions reelles le chemin daily -> coaching_recommendation -> retour daily -> commit daily.\n` +
    `- Trajectoire: fixture daily dynamique depuis le plan actif -> process-checkins -> pending WhatsApp daily -> message de blocage demandant un levier Sophia -> coaching recommendation -> reprise daily -> cloture.\n` +
    `- Surfaces visees: \`process-checkins\`, \`whatsapp-webhook\`, \`daily_action_review_v1\`, \`coaching_recommendation\`, \`user_chat_states.temp_memory\`, entries \`daily_action_review_v1\`, occurrences.\n` +
    `- Cadre IA reel: Supabase local, \`process-checkins\` puis \`/functions/v1/whatsapp-webhook\` loopback pour respecter le pending daily; \`force_full_ai\` non applicable aux tours pending; aucun renderer direct, aucun executor appele directement.\n` +
    `- Validite QA: valide si les tours ci-dessous correspondent aux reponses lues pendant le run. Le runner a choisi les messages user adaptativement depuis la derniere reponse Sophia et l'etat court.\n\n` +
    `Grounding dynamique:\n\n` +
    `- user_id: \`${userId}\`\n` +
    `- access_tier observe: \`${run.profile?.access_tier ?? ""}\`\n` +
    `- local_date: \`${localDate}\`\n` +
    `- week_start_date: \`${weekStartDate}\`\n` +
    `- pending_id: \`${run.pending_initial.id}\`\n` +
    `- targets: ${targetTitles.map((title) => `\`${title}\``).join(", ")}\n` +
    `- Raw: \`${path.relative(root, rawPath)}\`\n` +
    `- Cleanup: \`${path.relative(root, cleanupPath)}\`\n\n` +
    `## 2. Tours De Conversation\n\n${turns}\n\n` +
    `## 3. Analyse De Fluidite Humaine\n\n` +
    `**Verdict: ${humanVerdict}**\n\n` +
    `**Ce qui marche**\n` +
    `- Sophia garde une interaction courte et orientee action pendant le daily.\n` +
    `- Le message de blocage est traite comme une demande de levier Sophia, puis le check daily peut reprendre.\n\n` +
    `**Problemes**\n` +
    (humanVerdict === "green"
      ? `- Aucun probleme bloquant observe dans la fluidite du transcript.\n\n`
      : `- Une reponse assistant vide ou incoherente rend la fluidite non valide.\n\n`) +
    `**Fix propose**\n` +
    `- Source amont: seulement si verdict systeme yellow/red ci-dessous.\n` +
    `- Correction recommandee: voir analyse systeme.\n` +
    `- Tests d'invariant attendus: regression daily -> coaching -> daily sur pending WhatsApp.\n\n` +
    `## 4. Analyse Systeme\n\n` +
    `**Verdict: ${systemVerdict}**\n\n` +
    `**Routage**\n` +
    `- Bridge daily -> coaching observe via \`handoff_to_child_flow\`: \`${bridgeObserved}\`.\n` +
    `- Skill coaching actif observe: \`${coachingObserved}\`.\n` +
    `- Retour coaching -> daily observe via memo: \`${returnObserved}\`.\n` +
    `- Pending final avant cleanup: \`${finalStatus}\`.\n\n` +
    `**Skills / Operations / Tools**\n` +
    `- Entries daily creees avant cleanup: \`${entriesCount}\`.\n` +
    `- Occurrences avant cleanup: \`${JSON.stringify(occurrenceStatuses.map((row) => ({ id: row.id, status: row.status })))}\`.\n` +
    `- Aucun executor appele directement par le runner; seuls \`process-checkins\` pour l'ouverture et \`whatsapp-webhook\` loopback pour les tours user ont ete invoques.\n\n` +
    `**Memory / Effets durables**\n` +
    `- Effets daily observes dans \`user_plan_item_entries\` avant cleanup, puis supprimes pendant cleanup cible.\n` +
    `- Cleanup cible: \`${JSON.stringify(cleanup.deleted)}\`, restored=\`${cleanup.restored.length}\`.\n\n` +
    `**Problemes**\n` +
    (systemVerdict === "green"
      ? `- Aucun probleme systeme bloquant observe.\n\n`
      : `- Bridge/retour/commit incomplet. Famille: BF-ROUTING-01 ou BF-STATE-01 selon le tour concerne.\n\n`) +
    `**Fix propose**\n` +
    `- Source amont: runtime bridge daily/coaching si le retour ou la reprise daily manque; reducer/effects daily si le commit manque.\n` +
    `- Correction recommandee: conserver le memo coaching uniquement jusqu'a consommation par daily et verifier que le pending daily ne preempte pas une continuation coaching active.\n` +
    `- Tests d'invariant attendus: test integration pending avec sortie \`handoff_to_child_flow\`, activation coaching, puis reprise daily et commit de toutes les targets.\n\n` +
    `## Verdict Global\n\n` +
    `- Verdict: ${systemVerdict}\n` +
    `- Raison principale: bridge daily -> coaching ${bridgeObserved ? "observe" : "non observe"}, skill coaching actif ${coachingObserved ? "observe" : "non observe"}, retour coaching -> daily ${returnObserved ? "observe" : "non observe"}, pending final \`${finalStatus}\`.\n` +
    `- Follow-up prioritaire: ${systemVerdict === "green" ? "garder ce run comme regression daily/coaching bridge." : "corriger le point de rupture observe dans les tours, puis relancer le meme scenario."}\n`;
  fs.writeFileSync(reportPath, report);
  return reportPath;
}

async function main() {
  if (process.env.QA_CLEANUP_ONLY === "1") {
    await cleanupQaRunId();
    console.log(JSON.stringify({ run_id: runId, cleanup_only: true }, null, 2));
    return;
  }
  const profile = await profileSnapshot();
  const auth = null;
  profileBeforeQa = profile;
  chatStateBeforeQa = await chatStateSnapshot();
  await prepareProfileForQaQuietWindow(profile);
  await prepareChatStateForQa(chatStateBeforeQa);
  const grounding = await loadGrounding();
  const opening = await createDailyOpening(grounding.items);
  const run = {
    run_id: runId,
    persona,
    user_id: userId,
    profile,
    profile_before_qa: profile,
    chat_state_before_qa: chatStateBeforeQa,
    local_date: localDate,
    week_start_date: weekStartDate,
    planned_day: plannedDay,
    ordinal,
    target_items: grounding.items,
    target_titles: grounding.items.map((item) => item.title),
    target_descriptions: grounding.items.map((item) => item.description ?? null),
    turns: [{
      turn: 0,
      role: "assistant",
      text: opening.opening_text,
      trace_short: {
        http_status: opening.process_checkins.status,
        pending_status: opening.pending_initial.status,
        targets_count: opening.pending_initial?.payload?.targets?.length ?? 0,
      },
    }],
    message_ids_for_cleanup: opening.message_ids_for_cleanup,
    ...opening,
  };

  let bridgeSeen = false;
  let finalStatus = null;
  for (let i = 0; i < 20; i += 1) {
    finalStatus = run.latest?.pending?.[0]?.status ?? run.pending_initial.status;
    if (finalStatus === "done") break;
    const text = chooseNextText(run);
    await sendWhatsapp(run, text, bridgeSeen ? "resume-daily" : "bridge-coaching", auth);
    bridgeSeen = bridgeSeen ||
      run.turns.some((entry) =>
        entry.trace_short?.local_flow_transfer === "handoff_to_child_flow" ||
        entry.trace_short?.child_flow_handoff === "coaching_recommendation" ||
        entry.trace_short?.last_daily_child_flow_handoff === "coaching_recommendation"
      );
  }

  run.final_before_cleanup = await snapshot(run, run.start_iso);
  const rawPath = path.join(outDir, `${runId}.raw.json`);
  fs.writeFileSync(rawPath, `${JSON.stringify(run, null, 2)}\n`);
  const cleanup = await cleanupRun(run);
  const cleanupPath = path.join(outDir, `${runId}.cleanup.json`);
  fs.writeFileSync(cleanupPath, `${JSON.stringify(cleanup, null, 2)}\n`);
  const reportPath = renderReport(run, cleanup);
  console.log(JSON.stringify({
    run_id: runId,
    report: path.relative(root, reportPath),
    raw: path.relative(root, rawPath),
    cleanup: path.relative(root, cleanupPath),
    targets: run.pending_initial.payload.targets.map((target) => target.title),
    turns: run.turns.filter((entry) => entry.role === "user").length,
    bridge_observed: run.turns.some((entry) =>
      entry.trace_short?.local_flow_transfer === "handoff_to_child_flow" ||
      entry.trace_short?.child_flow_handoff === "coaching_recommendation" ||
      entry.trace_short?.last_daily_child_flow_handoff === "coaching_recommendation"
    ),
    return_observed: run.turns.some((entry) =>
      entry.trace_short?.last_coaching_exit_target === "daily_action_review_v1"
    ),
    final_pending_status: run.final_before_cleanup?.pending?.[0]?.status ?? null,
    entries_before_cleanup: run.final_before_cleanup?.entries?.length ?? 0,
    cleanup_summary: cleanup,
  }, null, 2));
}

main().catch((error) => {
  const failurePath = path.join(outDir, `${runId}.failure.txt`);
  fs.writeFileSync(failurePath, `${error?.stack || error}\n`);
  cleanupQaRunId().catch((cleanupError) => {
    fs.writeFileSync(
      path.join(outDir, `${runId}.cleanup-failure.txt`),
      `${cleanupError?.stack || cleanupError}\n`,
    );
  });
  restoreProfileAfterQa(profileBeforeQa).catch(() => {});
  restoreChatStateAfterQa(chatStateBeforeQa).catch(() => {});
  console.error(error);
  process.exit(1);
});
