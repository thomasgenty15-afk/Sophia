import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

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

const env = readEnvFile(path.join(root, "supabase/.env"));
const apiUrl = (process.env.SUPABASE_URL || env.SUPABASE_URL ||
  "http://127.0.0.1:54321").replace(/\/+$/, "");
const functionsUrl = `${apiUrl}/functions/v1`;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const internalSecret = process.env.INTERNAL_FUNCTION_SECRET ||
  env.INTERNAL_FUNCTION_SECRET || "sophia_on_earth";

if (!serviceRoleKey) throw new Error("missing SUPABASE_SERVICE_ROLE_KEY");

const runId = process.env.QA_RUN_ID ||
  `daily-two-plans-action-help-full-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-r1`;
const runDir = path.join(root, "tmp", runId);
fs.mkdirSync(runDir, { recursive: true });

const persona = process.env.QA_PERSONA || "rose";
const connectionPath = path.join(
  root,
  "tests/real-personas",
  persona,
  "connection.json",
);
const connection = JSON.parse(fs.readFileSync(connectionPath, "utf8"));
const userId = String(connection.user_id ?? "").trim();
if (!userId) throw new Error(`missing user_id in ${connectionPath}`);

const qaPhone = `+3369${crypto.createHash("sha256").update(runId).digest("hex").replace(/[a-f]/g, "").padEnd(8, "0").slice(0, 8)}`;
const waId = qaPhone.replace(/^\+/, "");
const now = new Date();
const nowIso = now.toISOString();
const runStartIso = nowIso;
const localDate = "2026-06-12";
const weekStartDate = "2026-06-08";

const touched = {
  qaPhone,
  planIds: [],
  itemIds: [],
  occurrenceIds: [],
  checkinId: null,
  pendingIds: [],
  entryIds: [],
  dedupWamids: [],
  chatMessageIds: [],
  deferredDueCheckinIds: [],
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
  return { status: response.status, body, text };
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

async function callFunction(name, body, headers = {}) {
  return await jsonFetch(`${functionsUrl}/${name}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apikey: anonKey,
      authorization: `Bearer ${anonKey}`,
      "x-internal-secret": internalSecret,
      "x-request-id": `${runId}-${name}`,
      ...headers,
    },
    body: JSON.stringify(body ?? {}),
  }, true);
}

function uuid() {
  return crypto.randomUUID();
}

async function snapshotBefore() {
  const [profileRows, dueRows, activePlans, maxVersionRows] = await Promise.all([
    select(
      `profiles?id=eq.${encode(userId)}&select=id,email,timezone,phone_number,phone_verified_at,phone_invalid,whatsapp_opted_in,whatsapp_state,onboarding_completed,trial_end,access_tier,whatsapp_last_inbound_at,whatsapp_last_outbound_at`,
    ),
    select(
      `scheduled_checkins?user_id=eq.${encode(userId)}&status=in.(pending,retrying)&scheduled_for=lte.${encode(new Date(Date.now() + 60_000).toISOString())}&select=*&order=scheduled_for.asc`,
    ),
    select(
      `user_plans_v2?user_id=eq.${encode(userId)}&status=eq.active&select=id,cycle_id,transformation_id,status,title,version&order=updated_at.desc&limit=1`,
    ),
    select(
      `user_plans_v2?user_id=eq.${encode(userId)}&select=id,version&order=version.desc&limit=1`,
    ),
  ]);
  const profile = profileRows[0];
  if (!profile) throw new Error(`profile not found for ${userId}`);
  const base = activePlans[0];
  if (!base) throw new Error(`active base plan not found for ${userId}`);
  return {
    runId,
    userId,
    runStart: runStartIso,
    profile,
    dueRows,
    base,
    maxVersion: Number(maxVersionRows[0]?.version ?? base.version ?? 1),
  };
}

async function setup(before) {
  for (const [index, row] of before.dueRows.entries()) {
    const futureIso = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000 + index * 60_000,
    ).toISOString();
    await patch("scheduled_checkins", `id=eq.${encode(row.id)}`, {
      scheduled_for: futureIso,
    });
    touched.deferredDueCheckinIds.push(row.id);
  }

  await patch("profiles", `id=eq.${encode(userId)}`, {
    phone_number: qaPhone,
    phone_verified_at: nowIso,
    phone_invalid: false,
    whatsapp_opted_in: true,
    whatsapp_state: null,
    whatsapp_last_inbound_at: new Date(Date.now() - 60 * 60 * 1000)
      .toISOString(),
    whatsapp_last_outbound_at: new Date(Date.now() - 8 * 60 * 60 * 1000)
      .toISOString(),
    timezone: "Europe/Paris",
    onboarding_completed: true,
  });

  const commonPlan = {
    user_id: userId,
    cycle_id: before.base.cycle_id,
    transformation_id: before.base.transformation_id,
    status: "draft",
    generation_attempts: 0,
    content: { qa_run_id: runId, source: "daily_two_plans_action_help" },
  };
  const planA = await insert("user_plans_v2", {
    ...commonPlan,
    version: Number(before.maxVersion ?? before.base.version ?? 1) + 1,
    title: `QA respiration ${runId}`,
  });
  const planB = await insert("user_plans_v2", {
    ...commonPlan,
    version: Number(before.maxVersion ?? before.base.version ?? 1) + 2,
    title: `QA administratif ${runId}`,
  });
  touched.planIds.push(planA.id, planB.id);

  const itemA = await insert("user_plan_items", {
    user_id: userId,
    cycle_id: before.base.cycle_id,
    transformation_id: before.base.transformation_id,
    plan_id: planA.id,
    dimension: "missions",
    kind: "task",
    status: "active",
    title: "Faire cinq minutes de respiration calme",
    description:
      "S'asseoir, respirer lentement pendant cinq minutes et ne pas fumer pendant ce sas.",
    tracking_type: "boolean",
    activation_order: 1,
    scheduled_days: ["fri"],
    time_of_day: "anytime",
    payload: { qa_run_id: runId, action_detail: "sas de decompression" },
  });
  const itemB = await insert("user_plan_items", {
    user_id: userId,
    cycle_id: before.base.cycle_id,
    transformation_id: before.base.transformation_id,
    plan_id: planB.id,
    dimension: "missions",
    kind: "task",
    status: "active",
    title: "Ranger deux papiers administratifs",
    description:
      "Choisir deux courriers ou papiers, les trier puis les ranger ou les jeter.",
    tracking_type: "boolean",
    activation_order: 1,
    scheduled_days: ["fri"],
    time_of_day: "anytime",
    payload: { qa_run_id: runId, action_detail: "tri administratif minimal" },
  });
  touched.itemIds.push(itemA.id, itemB.id);

  const occA = await insert("user_habit_week_occurrences", {
    user_id: userId,
    cycle_id: before.base.cycle_id,
    transformation_id: before.base.transformation_id,
    plan_id: planA.id,
    plan_item_id: itemA.id,
    week_start_date: weekStartDate,
    ordinal: 5,
    planned_day: "fri",
    default_day: "fri",
    status: "planned",
    source: "manual_change",
  });
  const occB = await insert("user_habit_week_occurrences", {
    user_id: userId,
    cycle_id: before.base.cycle_id,
    transformation_id: before.base.transformation_id,
    plan_id: planB.id,
    plan_item_id: itemB.id,
    week_start_date: weekStartDate,
    ordinal: 5,
    planned_day: "fri",
    default_day: "fri",
    status: "planned",
    source: "manual_change",
  });
  touched.occurrenceIds.push(occA.id, occB.id);

  const checkin = await insert("scheduled_checkins", {
    user_id: userId,
    event_context: "action_evening_review_v2",
    scheduled_for: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    status: "pending",
    message_mode: "dynamic",
    origin: "action_review",
    message_payload: {
      qa_run_id: runId,
      local_date: localDate,
      week_start_date: weekStartDate,
      timezone: "Europe/Paris",
      occurrence_ids: [occA.id, occB.id],
      event_context: "action_evening_review_v2",
      chat_capability: "daily_action_review",
    },
  });
  touched.checkinId = checkin.id;
  fs.writeFileSync(
    path.join(runDir, "touched.json"),
    `${JSON.stringify(touched, null, 2)}\n`,
  );
}

async function fetchState(label) {
  const [pending, messages, entries, occurrences, checkins] = await Promise.all([
    touched.checkinId
      ? select(
        `whatsapp_pending_actions?scheduled_checkin_id=eq.${encode(touched.checkinId)}&select=id,kind,status,scheduled_checkin_id,payload,created_at,processed_at&order=created_at.asc`,
      )
      : [],
    select(
      `chat_messages?user_id=eq.${encode(userId)}&scope=eq.whatsapp&created_at=gte.${encode(runStartIso)}&select=id,role,content,metadata,created_at,agent_used&order=created_at.asc&limit=50`,
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
    touched.checkinId
      ? select(
        `scheduled_checkins?id=eq.${encode(touched.checkinId)}&select=id,status,draft_message,processed_at,delivery_last_error,delivery_last_request_id,message_payload`,
      )
      : [],
  ]);
  for (const p of pending) {
    if (!touched.pendingIds.includes(p.id)) touched.pendingIds.push(p.id);
  }
  for (const entry of entries) {
    if (!touched.entryIds.includes(entry.id)) touched.entryIds.push(entry.id);
  }
  for (const msg of messages) {
    if (!touched.chatMessageIds.includes(msg.id)) {
      touched.chatMessageIds.push(msg.id);
    }
  }
  return { label, pending, messages, entries, occurrences, checkins };
}

async function sendWebhook(label, userText) {
  const wamid = `wamid_${runId}_${label}_${uuid()}`;
  touched.dedupWamids.push(wamid);
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
  const startedAt = new Date().toISOString();
  const http = await jsonFetch(`${functionsUrl}/whatsapp-webhook`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-sophia-wa-transport": "loopback",
      "x-request-id": `${runId}-${label}`,
    },
    body: JSON.stringify(payload),
  }, true);
  const state = await fetchState(label);
  const assistantAfterTurn = state.messages.filter((msg) =>
    msg.role === "assistant" && String(msg.created_at) >= startedAt
  );
  return {
    label,
    requestId: `${runId}-${label}`,
    userText,
    http: { status: http.status, body: http.body },
    assistantAfterTurn,
    state,
  };
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

  for (const row of before.dueRows) {
    await patch("scheduled_checkins", `id=eq.${encode(row.id)}`, {
      event_context: row.event_context,
      draft_message: row.draft_message,
      scheduled_for: row.scheduled_for,
      status: row.status,
      processed_at: row.processed_at,
      message_mode: row.message_mode,
      message_payload: row.message_payload,
      origin: row.origin,
      delivery_attempt_count: row.delivery_attempt_count,
      delivery_last_error: row.delivery_last_error,
      delivery_last_error_at: row.delivery_last_error_at,
      delivery_last_request_id: row.delivery_last_request_id,
      recurring_reminder_id: row.recurring_reminder_id,
    });
    cleanupLog.push({ table: "scheduled_checkins", id: row.id, restored: true });
  }

  const verification = {
    qaCheckin: touched.checkinId
      ? await select(`scheduled_checkins?id=eq.${encode(touched.checkinId)}&select=id`)
      : [],
    qaPending: touched.pendingIds.length
      ? await select(`whatsapp_pending_actions?id=in.(${touched.pendingIds.join(",")})&select=id`)
      : [],
    qaEntries: touched.entryIds.length
      ? await select(`user_plan_item_entries?id=in.(${touched.entryIds.join(",")})&select=id`)
      : [],
    qaPlans: touched.planIds.length
      ? await select(`user_plans_v2?id=in.(${touched.planIds.join(",")})&select=id`)
      : [],
    qaMessages: touched.chatMessageIds.length
      ? await select(`chat_messages?id=in.(${touched.chatMessageIds.join(",")})&select=id`)
      : [],
  };
  return { cleanupLog, verification };
}

async function main() {
  const before = await snapshotBefore();
  fs.writeFileSync(
    path.join(runDir, "before.json"),
    `${JSON.stringify(before, null, 2)}\n`,
  );

  let result;
  try {
    await setup(before);
    const processCheckins = await callFunction("process-checkins", {
      force: true,
      user_limit: 1,
    }, { "x-request-id": `${runId}-process-checkins` });
    const afterOpening = await fetchState("after_opening");

    const turns = [];
    const plannedTurns = [
      {
        label: "t1_help_respiration",
        text:
          "J’ai oublié l’action respiration. C’est quoi exactement ? Ça consiste en quoi, concrètement ?",
      },
      {
        label: "t2_help_papers",
        text:
          "Et pour les deux papiers administratifs, j’ai oublié aussi : c’est quoi l’action, je dois faire quoi précisément ?",
      },
      {
        label: "t3_done_both",
        text:
          "Ok merci, je viens de faire les deux : cinq minutes de respiration calme sans fumer, puis j’ai trié et rangé deux papiers.",
      },
      {
        label: "t4_post_close",
        text: "Parfait, merci. On peut s’arrêter là pour aujourd’hui.",
      },
    ];
    for (const planned of plannedTurns) {
      const turn = await sendWebhook(planned.label, planned.text);
      turns.push(turn);
      const hasAssistant = turn.assistantAfterTurn.length > 0;
      const stillBoots = turn.http.status >= 200 && turn.http.status < 300;
      if (!stillBoots || !hasAssistant) break;
    }
    const finalState = await fetchState("final");

    result = {
      runId,
      runDir,
      userId,
      processCheckins: { status: processCheckins.status, body: processCheckins.body },
      afterOpening,
      turns,
      finalState,
      touched,
    };
    fs.writeFileSync(
      path.join(runDir, "result-before-cleanup.json"),
      `${JSON.stringify({ result }, null, 2)}\n`,
    );
  } finally {
    const cleanupResult = await cleanup(before);
    const output = { result, cleanup: cleanupResult };
    fs.writeFileSync(
      path.join(runDir, "result.json"),
      `${JSON.stringify(output, null, 2)}\n`,
    );
    fs.writeFileSync(
      path.join(runDir, "touched.json"),
      `${JSON.stringify(touched, null, 2)}\n`,
    );
    console.log(JSON.stringify({
      runId,
      runDir,
      processStatus: result?.processCheckins?.status ?? null,
      opening: result?.afterOpening?.messages?.find((msg) => msg.role === "assistant")?.content ?? null,
      turns: result?.turns?.map((turn) => ({
        label: turn.label,
        http_status: turn.http.status,
        assistant: turn.assistantAfterTurn.map((msg) => msg.content),
        pending_status: turn.state.pending?.[0]?.status ?? null,
        entries_count: turn.state.entries?.length ?? 0,
        occurrence_statuses: turn.state.occurrences?.map((row) => ({
          id: row.id,
          status: row.status,
        })) ?? [],
      })) ?? [],
      finalPendingStatus: result?.finalState?.pending?.[0]?.status ?? null,
      finalEntriesCount: result?.finalState?.entries?.length ?? 0,
      cleanupVerification: cleanupResult.verification,
    }, null, 2));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
