import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const runId = "qa-daily-queue-rerun-20260618-r1";
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

const env = readEnvFile(path.join(root, "supabase/.env"));
const apiUrl = (process.env.SUPABASE_URL || env.SUPABASE_URL ||
  "http://127.0.0.1:54321").replace(/\/+$/, "");
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  env.SUPABASE_SERVICE_ROLE_KEY;
const internalSecret = process.env.INTERNAL_FUNCTION_SECRET ||
  env.INTERNAL_FUNCTION_SECRET;
if (!serviceRoleKey) throw new Error("missing SUPABASE_SERVICE_ROLE_KEY");
if (!internalSecret) throw new Error("missing INTERNAL_FUNCTION_SECRET");

const persona = "rose";
const connection = JSON.parse(
  fs.readFileSync(
    path.join(root, "tests/real-personas", persona, "connection.json"),
    "utf8",
  ),
);
const userId = String(connection.user_id ?? "");
const localDate = "2026-06-18";
const weekStartDate = "2026-06-15";
const plannedDay = "thu";
const ordinal = 6;
const timezone = "Europe/Paris";
const qaPhone = "+336" +
  crypto.createHash("sha256").update(`${runId}:${userId}`).digest("hex")
    .replace(/[a-f]/g, "").padEnd(9, "0").slice(0, 9);

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
  return { plan, items };
}

async function createDailyOpening(targetItems) {
  await cleanupQaRunId();
  const createdOccurrenceIds = [];
  const existingOccurrenceSnapshots = [];
  const startIso = new Date().toISOString();

  for (const item of targetItems) {
    const existing = await select(
      `user_habit_week_occurrences?user_id=eq.${encodeURIComponent(userId)}&plan_item_id=eq.${item.id}&week_start_date=eq.${weekStartDate}&ordinal=eq.${ordinal}&select=*&limit=1`,
    );
    if (existing?.[0]) {
      existingOccurrenceSnapshots.push(existing[0]);
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
      createdOccurrenceIds.push(existing[0].id);
      continue;
    }
    const inserted = await insert("user_habit_week_occurrences", {
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
    });
    createdOccurrenceIds.push(inserted?.[0]?.id);
  }

  const occurrenceIds = createdOccurrenceIds.filter(Boolean);
  const insertedCheckin = (await insert("scheduled_checkins", {
    user_id: userId,
    event_context: "action_evening_review_v2",
    draft_message: null,
    scheduled_for: "2026-06-18T00:00:00.000Z",
    status: "pending",
    message_mode: "dynamic",
    origin: "action_review",
    message_payload: {
      qa_run_id: runId,
      event_context: "action_evening_review_v2",
      chat_capability: "daily_action_review",
      reminder_kind: "one_shot",
      qa_note: "queue_remaining_target_full_run",
      local_date: localDate,
      week_start_date: weekStartDate,
      timezone,
      occurrence_ids: occurrenceIds,
    },
  }))?.[0];

  const processed = await invokeFunction(
    "process-checkins",
    { force: true },
    `${runId}-process-checkins`,
  );
  const pending = await select(
    `whatsapp_pending_actions?user_id=eq.${encodeURIComponent(userId)}&kind=eq.scheduled_checkin&scheduled_checkin_id=eq.${insertedCheckin.id}&select=id,scheduled_checkin_id,status,payload,created_at,processed_at&limit=1`,
  );
  const messages = await select(
    `chat_messages?user_id=eq.${encodeURIComponent(userId)}&scope=eq.whatsapp&role=eq.assistant&metadata->>original_checkin_id=eq.${insertedCheckin.id}&select=id,role,content,metadata,created_at,agent_used&order=created_at.asc`,
  );
  if (!pending?.[0]) {
    throw new Error(
      `No pending generated: ${JSON.stringify({ processed, checkin: insertedCheckin })}`,
    );
  }
  return {
    run_id: runId,
    start_iso: startIso,
    checkin: insertedCheckin,
    process_checkins: processed,
    pending_initial: pending[0],
    opening_messages: messages,
    opening_text: String(messages?.at(-1)?.content ?? pending[0]?.payload?.draft_message ?? ""),
    created_occurrence_ids: occurrenceIds,
    existing_occurrence_snapshots: existingOccurrenceSnapshots,
    message_ids_for_cleanup: messages.map((msg) => msg.id).filter(Boolean),
  };
}

async function sendWhatsapp(run, text, label) {
  const turn = run.turns.filter((entry) => entry.role === "user").length + 1;
  const startedAt = new Date().toISOString();
  const payload = {
    object: "whatsapp_business_account",
    entry: [{
      id: `qa-entry-${run.run_id}`,
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: {
            display_phone_number: qaPhone,
            phone_number_id: crypto.createHash("sha256").update(run.run_id)
              .digest("hex").slice(0, 16),
          },
          contacts: [{
            profile: { name: "Rose QA" },
            wa_id: qaPhone.replace(/^\+/, ""),
          }],
          messages: [{
            from: qaPhone.replace(/^\+/, ""),
            id: `wamid_${run.run_id}_${turn}_${crypto.randomUUID()}`,
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
      "x-request-id": `${run.run_id}-t${String(turn).padStart(2, "0")}-${label}`,
    },
    body: JSON.stringify(payload),
  });
  const messages = await select(
    `chat_messages?user_id=eq.${encodeURIComponent(userId)}&scope=eq.whatsapp&created_at=gte.${encodeURIComponent(startedAt)}&select=id,role,content,metadata,created_at,agent_used&order=created_at.asc&limit=20`,
  );
  run.message_ids_for_cleanup.push(
    ...messages.map((msg) => msg.id).filter(Boolean),
  );
  const assistant = messages.filter((msg) => msg.role === "assistant");
  const pendingAfter = await select(
    `whatsapp_pending_actions?id=eq.${run.pending_initial.id}&select=id,status,payload,processed_at`,
  );
  const entries = await select(
    `user_plan_item_entries?user_id=eq.${encodeURIComponent(userId)}&metadata->>source=eq.daily_action_review_v1&created_at=gte.${encodeURIComponent(run.start_iso)}&select=id,plan_item_id,entry_kind,outcome,value_text,blocker_hint,difficulty_level,metadata,effective_at,created_at&order=created_at.asc`,
  );
  const occurrences = await select(
    `user_habit_week_occurrences?id=in.(${run.created_occurrence_ids.join(",")})&select=id,plan_item_id,planned_day,status,source,validated_at,updated_at&order=plan_item_id.asc`,
  );
  const assistantText = assistant.map((msg) => String(msg.content ?? ""))
    .join("\n\n").trim();
  run.turns.push({ turn, role: "user", text });
  run.turns.push({
    turn,
    role: "assistant",
    text: assistantText,
    trace_short: {
      http_status: response.status,
      assistant_message_count: assistant.length,
      assistant_metadata: assistant.map((msg) => msg.metadata ?? {}),
      pending_status: pendingAfter?.[0]?.status ?? null,
      review_status: pendingAfter?.[0]?.payload?.review_state?.status ?? null,
      current_focus_occurrence_ids:
        pendingAfter?.[0]?.payload?.review_state?.current_focus_occurrence_ids ?? null,
      remaining_occurrence_ids:
        pendingAfter?.[0]?.payload?.review_state?.remaining_occurrence_ids ?? null,
      next_question_targets:
        pendingAfter?.[0]?.payload?.review_state?.next_question_targets ?? null,
      entries_count: entries?.length ?? 0,
      occurrence_statuses: occurrences?.map((row) => ({
        id: row.id,
        plan_item_id: row.plan_item_id,
        status: row.status,
      })) ?? [],
    },
  });
  run.latest = { pending_after: pendingAfter, entries, occurrences };
  return assistantText;
}

function chooseNextDailyText(run) {
  const userTurns = run.turns.filter((entry) => entry.role === "user").length;
  const lastAssistant = String(run.turns.at(-1)?.text ?? run.opening_text ?? "");
  if (userTurns === 0) {
    return "Pour les deux dont tu me parles là : le sas sans fumer est fait en rentrant, et le matériel est rangé dans une boîte. Je réponds juste sur ces deux-là.";
  }
  if (/joint|réflexe|reflexe|cibler|automatisme|moment/i.test(lastAssistant)) {
    return "Oui, pour le joint réflexe je l’ai fait aussi : le moment précis, c’est juste après le dîner quand je range la cuisine.";
  }
  if (/laquelle|lesquelles|quelle action|précise/i.test(lastAssistant)) {
    return "Les deux premières sont faites : le sas et le rangement du matériel. Je n’ai pas encore répondu au joint réflexe.";
  }
  if (/fait|pas fait|faite|termin|valid/i.test(lastAssistant)) {
    return "Il reste le joint réflexe : lui aussi est fait, je l’ai situé juste après le dîner.";
  }
  return "Le point restant est fait aussi : le joint réflexe arrive juste après le dîner.";
}

async function cleanupRun(run) {
  const cleanup = { run_id: run.run_id, deleted: {}, restored: [] };
  const entryIds = (run.latest?.entries ?? []).map((entry) => entry.id).filter(Boolean);
  if (entryIds.length) {
    await del("user_plan_item_entries", `id=in.(${entryIds.join(",")})`);
    cleanup.deleted.entries = entryIds.length;
  }
  await del("whatsapp_pending_actions", `scheduled_checkin_id=eq.${run.checkin.id}`);
  cleanup.deleted.pending = 1;
  if (run.message_ids_for_cleanup.length) {
    await del("chat_messages", `id=in.(${run.message_ids_for_cleanup.join(",")})`);
    cleanup.deleted.chat_messages = run.message_ids_for_cleanup.length;
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
  const toDelete = (run.created_occurrence_ids ?? []).filter((id) =>
    !restoredIds.has(id)
  );
  if (toDelete.length) {
    await del("user_habit_week_occurrences", `id=in.(${toDelete.join(",")})`);
    cleanup.deleted.occurrences = toDelete.length;
  }
  return cleanup;
}

async function main() {
  const grounding = await loadGrounding();
  const targetItems = grounding.items;
  const opening = await createDailyOpening(targetItems);
  const run = {
    ...opening,
    persona,
    user_id: userId,
    local_date: localDate,
    week_start_date: weekStartDate,
    planned_day: plannedDay,
    timezone,
    target_titles: targetItems.map((item) => item.title),
    target_descriptions: targetItems.map((item) => item.description ?? null),
    turns: [{
      turn: 0,
      role: "assistant",
      text: opening.opening_text,
      trace_short: {
        http_status: opening.process_checkins.status,
        process_response: opening.process_checkins.body,
        pending_status: opening.pending_initial.status,
        targets_count: opening.pending_initial?.payload?.targets?.length ?? 0,
        asked_occurrence_ids: opening.pending_initial?.payload?.asked_occurrence_ids ?? [],
        not_yet_asked_occurrence_ids:
          opening.pending_initial?.payload?.not_yet_asked_occurrence_ids ?? [],
      },
    }],
  };

  for (let i = 0; i < 10; i += 1) {
    const pendingStatus = run.latest?.pending_after?.[0]?.status ??
      run.pending_initial.status;
    if (pendingStatus === "done") break;
    const text = chooseNextDailyText(run);
    await sendWhatsapp(run, text, "daily");
  }

  const finalPendingStatus = run.latest?.pending_after?.[0]?.status ?? null;
  if (finalPendingStatus === "done") {
    await sendWhatsapp(
      run,
      "Maintenant que le check est fini, tu peux me rappeler rapidement ce que tu peux faire dans Sophia ?",
      "post-daily-global-probe",
    );
  }

  const rawPath = path.join(outDir, `${runId}.raw.json`);
  fs.writeFileSync(rawPath, `${JSON.stringify(run, null, 2)}\n`);
  const cleanup = await cleanupRun(run);
  const cleanupPath = path.join(outDir, `${runId}.cleanup.json`);
  fs.writeFileSync(cleanupPath, `${JSON.stringify(cleanup, null, 2)}\n`);
  console.log(JSON.stringify({
    run_id: run.run_id,
    raw: path.relative(root, rawPath),
    cleanup: path.relative(root, cleanupPath),
    final_pending_before_global_probe: finalPendingStatus,
    turns: run.turns.filter((entry) => entry.role === "user").length,
    entries_before_cleanup: run.latest?.entries?.length ?? 0,
    cleanup_summary: cleanup,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
