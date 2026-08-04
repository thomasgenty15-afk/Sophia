import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const runBatchId = "qa-daily-two-runs-20260618-r1";
const outDir = path.join(root, "tmp", runBatchId);
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
const ordinal = 4;
const timezone = "Europe/Paris";
const qaPhone = "+336" +
  crypto.createHash("sha256").update(`${runBatchId}:${userId}`).digest("hex")
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

function dayOffset(day) {
  return { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 }[day] ?? 0;
}

async function loadGrounding() {
  const plans = await select(
    `user_plans_v2?user_id=eq.${encodeURIComponent(userId)}&status=eq.active&select=id,cycle_id,transformation_id,status,title,created_at,updated_at&order=updated_at.desc&limit=1`,
  );
  const plan = plans?.[0];
  if (!plan) throw new Error(`No active plan for ${persona}`);
  const items = await select(
    `user_plan_items?user_id=eq.${encodeURIComponent(userId)}&plan_id=eq.${plan.id}&status=eq.active&select=id,plan_id,cycle_id,transformation_id,dimension,kind,status,title,description,tracking_type,scheduled_days,time_of_day,payload,created_at&order=created_at.asc`,
  );
  if (!items?.length) throw new Error(`No active items for ${persona}`);
  return { plan, items };
}

function itemKindForPayload(item) {
  if (item.dimension === "habits") return "habit";
  if (item.dimension === "missions") return "task";
  if (item.dimension === "clarifications") return "framework";
  return item.kind ?? "task";
}

async function createDailyOpening(runId, targetItems) {
  const createdOccurrenceIds = [];
  const existingOccurrenceSnapshots = [];
  const startIso = new Date().toISOString();

  for (const item of targetItems) {
    const existing = await select(
      `user_habit_week_occurrences?user_id=eq.${encodeURIComponent(userId)}&plan_item_id=eq.${item.id}&week_start_date=eq.${weekStartDate}&ordinal=eq.${ordinal}&select=*&limit=1`,
    );
    if (existing?.[0]) {
      existingOccurrenceSnapshots.push(existing[0]);
      await patch(
        "user_habit_week_occurrences",
        `id=eq.${existing[0].id}`,
        {
          planned_day: plannedDay,
          original_planned_day: null,
          actual_day: null,
          status: "planned",
          source: "manual_change",
          validated_at: null,
          updated_at: startIso,
          default_day: plannedDay,
        },
      );
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
    scheduled_for: new Date(Date.now() - 60_000).toISOString(),
    status: "pending",
    message_mode: "dynamic",
    origin: "action_review",
    message_payload: {
      qa_run_id: runId,
      event_context: "action_evening_review_v2",
      chat_capability: "daily_action_review",
      reminder_kind: "one_shot",
      qa_note: "min_gap_bypass_for_isolated_daily_qa_only",
      local_date: localDate,
      week_start_date: weekStartDate,
      timezone,
      occurrence_ids: occurrenceIds,
    },
  }))?.[0];
  const checkin = (await patch(
    "scheduled_checkins",
    `id=eq.${insertedCheckin.id}`,
    {
      status: "pending",
      scheduled_for: new Date(Date.now() - 120_000).toISOString(),
    },
  ))?.[0] ?? insertedCheckin;

  const processed = await invokeFunction(
    "process-checkins",
    { force: true },
    `${runId}-process-checkins`,
  );

  const pending = await select(
    `whatsapp_pending_actions?user_id=eq.${encodeURIComponent(userId)}&kind=eq.scheduled_checkin&scheduled_checkin_id=eq.${checkin.id}&select=id,scheduled_checkin_id,status,payload,created_at,processed_at&limit=1`,
  );
  const messages = await select(
    `chat_messages?user_id=eq.${encodeURIComponent(userId)}&scope=eq.whatsapp&role=eq.assistant&metadata->>original_checkin_id=eq.${checkin.id}&select=id,role,content,metadata,created_at,agent_used&order=created_at.asc`,
  );
  if (!pending?.[0]) throw new Error(`No pending generated for ${runId}`);
  return {
    run_id: runId,
    start_iso: startIso,
    checkin,
    process_checkins: processed,
    pending_initial: pending[0],
    opening_messages: messages,
    opening_text: String(messages?.at(-1)?.content ?? pending[0]?.payload?.draft_message ?? ""),
    created_occurrence_ids: occurrenceIds,
    existing_occurrence_snapshots: existingOccurrenceSnapshots,
  };
}

async function sendWhatsapp(run, text) {
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
      "x-request-id": `${run.run_id}-t${String(turn).padStart(2, "0")}`,
    },
    body: JSON.stringify(payload),
  });
  const assistant = await select(
    `chat_messages?user_id=eq.${encodeURIComponent(userId)}&scope=eq.whatsapp&role=eq.assistant&created_at=gte.${encodeURIComponent(startedAt)}&select=id,content,metadata,created_at,agent_used&order=created_at.asc&limit=10`,
  );
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

function nextTextForScenario(run) {
  const lastAssistant = run.turns.at(-1)?.text ?? run.opening_text ?? "";
  const userTurns = run.turns.filter((entry) => entry.role === "user").length;
  if (run.scenario === "direct_all_done") {
    if (userTurns === 0) {
      return "Oui, j’ai fait les trois aujourd’hui : le sas en rentrant, le matériel est rangé, et j’ai identifié que le joint réflexe arrive surtout juste après le dîner.";
    }
    if (/lesqu|quelle|précise|préciser|action/i.test(lastAssistant)) {
      return "Je parle bien des trois actions du check : sas fait, matériel rangé, et joint réflexe ciblé après le dîner.";
    }
    if (/raison|pas faite|reste|pertinent|pertinente/i.test(lastAssistant)) {
      return "Il n’y a pas d’action manquée ici, elles sont faites toutes les trois.";
    }
    return "Pour clôturer : les trois actions du daily sont faites aujourd’hui.";
  }
  if (userTurns === 0) {
    return "Le sas sans fumer, c’est fait. Par contre je ne suis pas sûre de ce que tu attends par « cibler le joint réflexe », et pour le matériel j’ai commencé mais je ne sais pas si ça compte.";
  }
  if (/cibler|joint|veux dire|attends|quoi/i.test(lastAssistant)) {
    return "Ok, dans ce cas je l’ai fait : le moment réflexe, c’est juste après le dîner quand je range la cuisine.";
  }
  if (/matériel|ranger|fait|pas fait|termin/i.test(lastAssistant)) {
    return "Je viens de finir le matériel aussi : grinder, feuilles et pochon sont dans une boîte fermée.";
  }
  if (/lesqu|quelle|action|précise/i.test(lastAssistant)) {
    return "Pour être claire : sas fait, joint réflexe identifié après le dîner, et matériel maintenant rangé.";
  }
  return "On peut clôturer le daily : les trois actions sont faites maintenant.";
}

async function runScenario(runId, scenario, targetItems) {
  const opening = await createDailyOpening(runId, targetItems);
  const run = {
    ...opening,
    persona,
    user_id: userId,
    local_date: localDate,
    week_start_date: weekStartDate,
    planned_day: plannedDay,
    timezone,
    scenario,
    target_titles: targetItems.map((item) => item.title),
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

  for (let i = 0; i < 6; i++) {
    const text = nextTextForScenario(run);
    const assistant = await sendWhatsapp(run, text);
    const pendingStatus = run.latest?.pending_after?.[0]?.status;
    if (pendingStatus === "done") break;
    if (!assistant.trim()) break;
  }

  const rawPath = path.join(outDir, `${runId}.raw.json`);
  fs.writeFileSync(rawPath, `${JSON.stringify(run, null, 2)}\n`);
  return run;
}

async function runScenarioFromExistingOpening(runId, scenario, targetItems) {
  const checkins = await select(
    `scheduled_checkins?message_payload->>qa_run_id=eq.${runId}&select=*&order=created_at.desc&limit=1`,
  );
  const checkin = checkins?.[0];
  if (!checkin) throw new Error(`No existing checkin for ${runId}`);
  const pendingRows = await select(
    `whatsapp_pending_actions?scheduled_checkin_id=eq.${checkin.id}&select=id,scheduled_checkin_id,status,payload,created_at,processed_at&limit=1`,
  );
  const pending = pendingRows?.[0];
  if (!pending) throw new Error(`No existing pending for ${runId}`);
  const messages = await select(
    `chat_messages?user_id=eq.${encodeURIComponent(userId)}&scope=eq.whatsapp&role=eq.assistant&metadata->>original_checkin_id=eq.${checkin.id}&select=id,role,content,metadata,created_at,agent_used&order=created_at.asc`,
  );
  const occurrenceIds = Array.isArray(checkin?.message_payload?.occurrence_ids)
    ? checkin.message_payload.occurrence_ids.filter(Boolean)
    : [];
  const run = {
    run_id: runId,
    start_iso: String(checkin.created_at ?? new Date().toISOString()),
    checkin,
    process_checkins: {
      status: 200,
      body: { resumed_after_due: true, processed: 1 },
    },
    pending_initial: pending,
    opening_messages: messages,
    opening_text: String(messages?.at(-1)?.content ?? pending?.payload?.draft_message ?? ""),
    created_occurrence_ids: occurrenceIds,
    existing_occurrence_snapshots: [],
    persona,
    user_id: userId,
    local_date: localDate,
    week_start_date: weekStartDate,
    planned_day: plannedDay,
    timezone,
    scenario,
    target_titles: targetItems.map((item) => item.title),
    turns: [{
      turn: 0,
      role: "assistant",
      text: String(messages?.at(-1)?.content ?? pending?.payload?.draft_message ?? ""),
      trace_short: {
        http_status: 200,
        process_response: { resumed_after_due: true, processed: 1 },
        pending_status: pending.status,
        targets_count: pending?.payload?.targets?.length ?? 0,
        asked_occurrence_ids: pending?.payload?.asked_occurrence_ids ?? [],
        not_yet_asked_occurrence_ids:
          pending?.payload?.not_yet_asked_occurrence_ids ?? [],
      },
    }],
  };
  for (let i = 0; i < 6; i++) {
    const text = nextTextForScenario(run);
    const assistant = await sendWhatsapp(run, text);
    const pendingStatus = run.latest?.pending_after?.[0]?.status;
    if (pendingStatus === "done") break;
    if (!assistant.trim()) break;
  }
  fs.writeFileSync(
    path.join(outDir, `${runId}.raw.json`),
    `${JSON.stringify(run, null, 2)}\n`,
  );
  return run;
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
  await del(
    "chat_messages",
    `user_id=eq.${userId}&metadata->>original_checkin_id=eq.${run.checkin.id}`,
  );
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

async function cleanupQaRunId(runId) {
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

function renderReport(runs, cleanup) {
  const turnBlocks = runs.map((run, runIndex) => {
    const blocks = run.turns.map((entry) => {
      const title = `### Run ${runIndex + 1} - Tour ${entry.turn}`;
      const speaker = entry.role === "assistant" ? "Sophia" : "User";
      const trace = entry.trace_short
        ? "\n\n**Trace courte**\n" +
          Object.entries(entry.trace_short).map(([k, v]) =>
            `- ${k}: \`${typeof v === "string" ? v : JSON.stringify(v)}\``
          ).join("\n")
        : "";
      return `${title}\n\n**${speaker}**\n> ${
        String(entry.text ?? "").replace(/\n/g, "\n> ")
      }${trace}`;
    }).join("\n\n");
    return `## Run ${runIndex + 1} - ${run.scenario}\n\n` +
      `- run_id: \`${run.run_id}\`\n` +
      `- targets: ${run.target_titles.map((title) => `\`${title}\``).join(", ")}\n` +
      `- pending initial: \`${run.pending_initial.id}\`\n` +
      `- final pending: \`${run.latest?.pending_after?.[0]?.status ?? "unknown"}\`\n` +
      `- entries: \`${run.latest?.entries?.length ?? 0}\`\n\n` +
      blocks;
  }).join("\n\n");

  return `# QA Run Report - Daily Two Runs 2026-06-18\n\n` +
    `## 1. Contexte Du Test\n\n` +
    `- Date: 2026-06-18\n` +
    `- Run batch: \`${runBatchId}\`\n` +
    `- Persona: Rose locale\n` +
    `- Objectif: relancer deux runs daily reels, depuis l'ouverture proactive, autant de tours que necessaire.\n` +
    `- Trajectoire: occurrences QA ciblees depuis items actifs Rose -> scheduled_checkin action_evening_review_v2 -> process-checkins reel -> pending daily -> whatsapp-webhook local loopback -> verification DB -> cleanup cible.\n` +
    `- Surfaces visees: \`process-checkins\`, \`whatsapp_pending_actions\`, \`whatsapp-webhook\`, \`daily_action_review_v1\`, visibles daily, entries/occurrences.\n` +
    `- Cadre IA reel: Supabase local, fonctions locales, LLM/reducer reel, aucun renderer deterministe, aucun fallback direct, aucun code applicatif corrige pendant le run.\n` +
    `- Validite QA: valide si les sorties ci-dessous montrent bien pending daily + webhook + effets DB.\n\n` +
    `Grounding dynamique:\n\n` +
    `- connection: \`tests/real-personas/rose/connection.json\`\n` +
    `- local_date: \`${localDate}\`, week_start_date: \`${weekStartDate}\`, planned_day: \`${plannedDay}\`\n` +
    `- artefacts: \`tmp/${runBatchId}/\`\n` +
    `- cleanup cible: \`${JSON.stringify(cleanup)}\`\n\n` +
    `## 2. Tours De Conversation\n\n${turnBlocks}\n\n` +
    `## 3. Analyse De Fluidite Humaine\n\n` +
    `**Verdict: a analyser depuis les tours ci-dessus.**\n\n` +
    `## 4. Analyse Systeme\n\n` +
    `**Verdict: a analyser depuis les traces et DB ci-dessus.**\n\n` +
    `## Verdict Global\n\n` +
    `- Verdict: a analyser\n` +
    `- Raison principale: a analyser\n` +
    `- Follow-up prioritaire: a analyser\n`;
}

async function main() {
  const grounding = await loadGrounding();
  const targetItems = grounding.items;
  const mode = process.argv[2] ?? "all";
  if (mode === "clarify-only") {
    const runId = `${runBatchId}-clarify`;
    await cleanupQaRunId(runId);
    const run = await runScenario(runId, "clarify_then_done", targetItems);
    const cleanup = await cleanupRun(run);
    fs.writeFileSync(
      path.join(outDir, `${runId}.cleanup.json`),
      `${JSON.stringify(cleanup, null, 2)}\n`,
    );
    console.log(JSON.stringify({
      run_batch_id: runBatchId,
      run_id: run.run_id,
      raw: path.relative(root, path.join(outDir, `${run.run_id}.raw.json`)),
      final_pending: run.latest?.pending_after?.[0]?.status ?? null,
      entries: run.latest?.entries?.length ?? 0,
      turns: run.turns.filter((entry) => entry.role === "user").length,
      cleanup,
    }, null, 2));
    return;
  }
  if (mode === "clarify-existing") {
    const runId = `${runBatchId}-clarify`;
    const run = await runScenarioFromExistingOpening(
      runId,
      "clarify_then_done",
      targetItems,
    );
    const cleanup = await cleanupRun(run);
    fs.writeFileSync(
      path.join(outDir, `${runId}.cleanup.json`),
      `${JSON.stringify(cleanup, null, 2)}\n`,
    );
    console.log(JSON.stringify({
      run_batch_id: runBatchId,
      run_id: run.run_id,
      raw: path.relative(root, path.join(outDir, `${run.run_id}.raw.json`)),
      final_pending: run.latest?.pending_after?.[0]?.status ?? null,
      entries: run.latest?.entries?.length ?? 0,
      turns: run.turns.filter((entry) => entry.role === "user").length,
      cleanup,
    }, null, 2));
    return;
  }
  const runs = [];
  runs.push(await runScenario(`${runBatchId}-direct`, "direct_all_done", targetItems));
  const cleanup1 = await cleanupRun(runs[0]);
  runs.push(await runScenario(`${runBatchId}-clarify`, "clarify_then_done", targetItems));
  const cleanup2 = await cleanupRun(runs[1]);

  const cleanup = [cleanup1, cleanup2];
  fs.writeFileSync(
    path.join(outDir, "batch.raw.json"),
    `${JSON.stringify({ grounding, runs, cleanup }, null, 2)}\n`,
  );
  const report = renderReport(runs, cleanup);
  const reportPath = path.join(outDir, "report.md");
  fs.writeFileSync(reportPath, report);
  console.log(JSON.stringify({
    run_batch_id: runBatchId,
    report: path.relative(root, reportPath),
    raw: path.relative(root, path.join(outDir, "batch.raw.json")),
    runs: runs.map((run) => ({
      run_id: run.run_id,
      final_pending: run.latest?.pending_after?.[0]?.status ?? null,
      entries: run.latest?.entries?.length ?? 0,
      turns: run.turns.filter((entry) => entry.role === "user").length,
    })),
    cleanup,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
