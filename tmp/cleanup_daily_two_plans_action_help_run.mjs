import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const runDirArg = process.argv[2];
if (!runDirArg) throw new Error("usage: node tmp/cleanup_daily_two_plans_action_help_run.mjs <run-dir>");
const runDir = path.isAbsolute(runDirArg) ? runDirArg : path.join(root, runDirArg);
const before = JSON.parse(fs.readFileSync(path.join(runDir, "before.json"), "utf8"));
const touched = JSON.parse(fs.readFileSync(path.join(runDir, "touched.json"), "utf8"));
const runId = String(before.runId ?? "").trim();

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
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRoleKey) throw new Error("missing SUPABASE_SERVICE_ROLE_KEY");

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
    throw new Error(`${response.status} ${url}: ${text}`);
  }
  return { status: response.status, body };
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

async function removeByIds(log, table, ids) {
  for (const id of [...new Set((ids ?? []).filter(Boolean))]) {
    const res = await del(table, `id=eq.${encode(id)}`);
    log.push({ table, id, status: res.status, body: res.body });
  }
}

const log = [];
await removeByIds(log, "whatsapp_inbound_dedup", touched.dedupWamids);
await removeByIds(log, "user_plan_item_entries", touched.entryIds);
await removeByIds(log, "whatsapp_pending_actions", touched.pendingIds);
if (runId) {
  const qaPending = await select(
    `whatsapp_pending_actions?payload->>qa_run_id=eq.${encode(runId)}&select=id`,
  );
  await removeByIds(log, "whatsapp_pending_actions", qaPending.map((row) => row.id));
  if (touched.checkinId) {
    const qaMessages = await select(
      `chat_messages?metadata->>original_checkin_id=eq.${encode(touched.checkinId)}&select=id`,
    );
    await removeByIds(log, "chat_messages", qaMessages.map((row) => row.id));
  }
}
await removeByIds(log, "scheduled_checkins", touched.checkinId ? [touched.checkinId] : []);
await removeByIds(log, "user_habit_week_occurrences", touched.occurrenceIds);
await removeByIds(log, "user_plan_items", touched.itemIds);
await removeByIds(log, "user_plans_v2", touched.planIds);
await removeByIds(log, "chat_messages", touched.chatMessageIds);

await patch("profiles", `id=eq.${encode(before.userId)}`, {
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

for (const row of before.dueRows ?? []) {
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
  log.push({ table: "scheduled_checkins", id: row.id, restored: true });
}

const verification = {
  qaCheckin: touched.checkinId
    ? await select(`scheduled_checkins?id=eq.${encode(touched.checkinId)}&select=id`)
    : [],
  qaPending: touched.pendingIds?.length
    ? await select(`whatsapp_pending_actions?id=in.(${touched.pendingIds.join(",")})&select=id`)
    : [],
  qaEntries: touched.entryIds?.length
    ? await select(`user_plan_item_entries?id=in.(${touched.entryIds.join(",")})&select=id`)
    : [],
  qaPlans: touched.planIds?.length
    ? await select(`user_plans_v2?id=in.(${touched.planIds.join(",")})&select=id`)
    : [],
  qaMessages: touched.chatMessageIds?.length
    ? await select(`chat_messages?id=in.(${touched.chatMessageIds.join(",")})&select=id`)
    : [],
  qaPendingByRunId: runId
    ? await select(`whatsapp_pending_actions?payload->>qa_run_id=eq.${encode(runId)}&select=id`)
    : [],
  qaMessagesByCheckin: touched.checkinId
    ? await select(`chat_messages?metadata->>original_checkin_id=eq.${encode(touched.checkinId)}&select=id`)
    : [],
};

const out = { runDir, log, verification };
fs.writeFileSync(path.join(runDir, "cleanup-after-interrupt.json"), `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify(out, null, 2));
