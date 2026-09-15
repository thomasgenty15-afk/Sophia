import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

const args = process.argv.slice(2);
const command = args[0] ?? "";

function argValue(name, fallback = "") {
  const prefixed = `--${name}=`;
  const direct = args.find((arg) => arg.startsWith(prefixed));
  if (direct) return direct.slice(prefixed.length);
  const index = args.indexOf(`--${name}`);
  if (index >= 0) return args[index + 1] ?? fallback;
  return fallback;
}

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

function personaConfig(persona) {
  if (!persona) throw new Error("--persona is required");
  const connectionPath = path.join(
    root,
    "tests/real-personas",
    persona,
    "connection.json",
  );
  const connection = JSON.parse(fs.readFileSync(connectionPath, "utf8"));
  const userId = String(connection.user_id ?? "").trim();
  if (!userId) throw new Error(`missing user_id in ${connectionPath}`);
  return { connectionPath, connection, userId };
}

const env = readEnvFile(path.join(root, "supabase/.env"));
const apiUrl =
  (process.env.SUPABASE_URL || env.SUPABASE_URL || "http://127.0.0.1:54321")
    .replace(/\/+$/, "");
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceRoleKey) throw new Error("missing SUPABASE_SERVICE_ROLE_KEY");

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
    const err = new Error(`${response.status} ${url}: ${text}`);
    err.status = response.status;
    err.body = body;
    throw err;
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

async function insert(table, row) {
  return (await rest(table, {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify(row),
  })).body?.[0] ?? null;
}

async function patch(table, query, row) {
  return await rest(`${table}?${query}`, {
    method: "PATCH",
    headers: { prefer: "return=representation" },
    body: JSON.stringify(row),
  });
}

function runDirFor(persona) {
  const dir = path.join(
    root,
    "tests/real-personas",
    persona,
    "runs",
    "daily-weekly",
  );
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function statePathFor(persona, runId) {
  return path.join(runDirFor(persona), `${runId}.state.json`);
}

function rawPathFor(persona, runId) {
  return path.join(runDirFor(persona), `${runId}.raw.json`);
}

function reportPathFor(persona, runId) {
  return path.join(runDirFor(persona), `${runId}.md`);
}

function saveState(persona, runId, state) {
  fs.writeFileSync(
    statePathFor(persona, runId),
    `${JSON.stringify(state, null, 2)}\n`,
  );
  fs.writeFileSync(
    rawPathFor(persona, runId),
    `${JSON.stringify(state, null, 2)}\n`,
  );
}

function loadState(persona, runId) {
  return JSON.parse(fs.readFileSync(statePathFor(persona, runId), "utf8"));
}

function dayIndex(day) {
  return { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 }[day] ?? 9;
}

function localDateFromWeekStart(weekStart, day) {
  const date = new Date(`${weekStart}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + dayIndex(day) - 1);
  return date.toISOString().slice(0, 10);
}

function qaWaFrom(userId, runId) {
  const digits = crypto.createHash("sha256").update(`${userId}:${runId}`)
    .digest("hex")
    .replace(/[a-f]/g, "")
    .padEnd(10, "0")
    .slice(0, 10);
  return `1555${digits}`;
}

async function findOrCreateDailyPending({ persona, runId, userId }) {
  const existing = await select(
    `whatsapp_pending_actions?user_id=eq.${
      encodeURIComponent(userId)
    }&kind=eq.scheduled_checkin&status=eq.pending&payload->>chat_capability=eq.daily_action_review&select=id,scheduled_checkin_id,status,payload,created_at&order=created_at.desc&limit=1`,
  );
  if (existing?.[0]) return { pending: existing[0], generated: false };

  throw new Error(
    `No system-generated pending daily_action_review found for persona=${persona}. ` +
      `Run the real scheduler/process-checkins first; this runner no longer fabricates a hardcoded daily opening.`,
  );
}

async function prepare() {
  const persona = argValue("persona");
  const runId = argValue("run-id") ||
    `daily-manual-${persona}-${new Date().toISOString().replace(/[:.]/g, "")}`;
  const { userId, connectionPath } = personaConfig(persona);
  const { pending, generated } = await findOrCreateDailyPending({
    persona,
    runId,
    userId,
  });
  const opening = String(pending.payload?.draft_message ?? "");
  const state = {
    run_id: runId,
    persona,
    user_id: userId,
    connection_path: path.relative(root, connectionPath),
    created_at: new Date().toISOString(),
    qa_mode: "manual_adaptive_turn_by_turn",
    anti_hardcoding: {
      ids_discovered_at_runtime: true,
      user_replies_pre_scripted: false,
      dynamic_daily_generated_if_needed: generated,
    },
    whatsapp: {
      from: qaWaFrom(userId, runId),
      display_phone: qaWaFrom(userId, `${runId}:display`),
      phone_number_id: crypto.createHash("sha256").update(`${runId}:phone`)
        .digest("hex").slice(0, 16),
    },
    pending_initial: pending,
    turns: [
      {
        turn: 0,
        role: "assistant",
        text: opening,
        source: generated ? "dynamic_pending_fixture" : "existing_pending",
      },
    ],
  };
  saveState(persona, runId, state);
  console.log(JSON.stringify(
    {
      run_id: runId,
      state: path.relative(root, statePathFor(persona, runId)),
      raw: path.relative(root, rawPathFor(persona, runId)),
      pending_id: pending.id,
      generated,
      opening,
    },
    null,
    2,
  ));
}

async function callWebhook(state, text, turn) {
  const startedAt = new Date().toISOString();
  const payload = {
    object: "whatsapp_business_account",
    entry: [{
      id: `qa-entry-${state.run_id}`,
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: {
            display_phone_number: state.whatsapp.display_phone,
            phone_number_id: state.whatsapp.phone_number_id,
          },
          contacts: [{
            profile: { name: `${state.persona} QA` },
            wa_id: state.whatsapp.from,
          }],
          messages: [{
            from: state.whatsapp.from,
            id: `wamid_${state.run_id}_${turn}_${crypto.randomUUID()}`,
            timestamp: String(Math.floor(Date.now() / 1000)),
            type: "text",
            sophia_user_id: state.user_id,
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
      "x-request-id": `${state.run_id}-t${String(turn).padStart(2, "0")}`,
    },
    body: JSON.stringify(payload),
  });
  const assistant = await select(
    `chat_messages?user_id=eq.${
      encodeURIComponent(state.user_id)
    }&scope=eq.whatsapp&role=eq.assistant&created_at=gte.${
      encodeURIComponent(startedAt)
    }&select=id,content,metadata,created_at,agent_used&order=created_at.asc&limit=10`,
  );
  const pendingAfter = await select(
    `whatsapp_pending_actions?id=eq.${state.pending_initial.id}&select=id,status,payload,processed_at`,
  );
  const targetIds = Array.isArray(state.pending_initial?.payload?.targets)
    ? state.pending_initial.payload.targets.map((target) => target.plan_item_id)
      .filter(Boolean)
    : [];
  const occurrenceIds = Array.isArray(state.pending_initial?.payload?.targets)
    ? state.pending_initial.payload.targets.map((target) =>
      target.occurrence_id
    ).filter(Boolean)
    : [];
  const entries = targetIds.length
    ? await select(
      `user_plan_item_entries?user_id=eq.${
        encodeURIComponent(state.user_id)
      }&plan_item_id=in.(${
        targetIds.join(",")
      })&select=id,plan_item_id,entry_kind,outcome,value_text,blocker_hint,difficulty_level,metadata,effective_at,created_at&order=created_at.desc&limit=20`,
    )
    : [];
  const occurrences = occurrenceIds.length
    ? await select(
      `user_habit_week_occurrences?id=in.(${
        occurrenceIds.join(",")
      })&select=id,plan_item_id,planned_day,status,source,validated_at,updated_at`,
    )
    : [];
  return { response, assistant, pendingAfter, entries, occurrences };
}

async function send() {
  const persona = argValue("persona");
  const runId = argValue("run-id");
  const text = argValue("text");
  if (!runId) throw new Error("--run-id is required");
  if (!text) throw new Error("--text is required");
  personaConfig(persona);
  const state = loadState(persona, runId);
  const turn = state.turns.filter((entry) => entry.role === "user").length + 1;
  const result = await callWebhook(state, text, turn);
  const assistantText = result.assistant.map((msg) => String(msg.content ?? ""))
    .join("\n\n").trim();
  state.turns.push({
    turn,
    role: "user",
    text,
  });
  state.turns.push({
    turn,
    role: "assistant",
    text: assistantText,
    trace_short: {
      http_status: result.response.status,
      assistant_message_count: result.assistant.length,
      assistant_metadata: result.assistant.map((msg) => msg.metadata ?? {}),
      pending_status: result.pendingAfter?.[0]?.status ?? null,
      entries_count: result.entries?.length ?? 0,
      occurrence_statuses: result.occurrences?.map((row) => ({
        id: row.id,
        status: row.status,
      })) ?? [],
    },
  });
  state.latest = {
    pending_after: result.pendingAfter,
    entries: result.entries,
    occurrences: result.occurrences,
  };
  saveState(persona, runId, state);
  console.log(JSON.stringify(
    {
      run_id: runId,
      turn,
      http_status: result.response.status,
      assistant: assistantText,
      pending_status: result.pendingAfter?.[0]?.status ?? null,
      entries_count: result.entries?.length ?? 0,
    },
    null,
    2,
  ));
}

function renderReport(state) {
  const targetCount = Array.isArray(state.pending_initial?.payload?.targets)
    ? state.pending_initial.payload.targets.length
    : 0;
  const turns = state.turns.map((entry) => {
    const title = entry.turn === 0 ? "### Tour 0" : `### Tour ${entry.turn}`;
    const speaker = entry.role === "assistant" ? "Sophia" : "User";
    const trace = entry.trace_short
      ? [
        "",
        "**Trace courte**",
        `- http_status: \`${entry.trace_short.http_status ?? ""}\``,
        `- pending_status: \`${entry.trace_short.pending_status ?? ""}\``,
        `- entries_count: \`${entry.trace_short.entries_count ?? 0}\``,
        `- assistant_message_count: \`${
          entry.trace_short.assistant_message_count ?? 0
        }\``,
      ].join("\n")
      : "";
    return `${title}\n\n**${speaker}**\n> ${
      String(entry.text ?? "").replace(/\n/g, "\n> ")
    }${trace}`;
  }).join("\n\n");
  return `# QA Run Report - Daily D1.1 Manual Adaptive\n\n` +
    `## 1. Contexte Du Test\n\n` +
    `- Date: ${new Date().toISOString().slice(0, 10)}\n` +
    `- Run: \`${state.run_id}\`\n` +
    `- Persona: ${state.persona}\n` +
    `- Objectif: Test D1.1 daily minimal, une seule action, conversation ouverte par Sophia puis conduite manuellement tour par tour.\n` +
    `- Trajectoire: daily action review avec ${targetCount} target, puis continuation conversationnelle minimum 5 tours user.\n` +
    `- Surfaces visees: \`whatsapp_pending_actions\`, \`whatsapp-webhook\`, \`daily_action_review_v1\`, reponse conversationnelle WhatsApp apres pending.\n` +
    `- Cadre IA reel: Supabase local, webhook WhatsApp local, pending existant ou genere dynamiquement, aucune reponse user pre-ecrite.\n` +
    `- Validite QA: valide si les tours ci-dessous ont ete choisis apres lecture de la reponse Sophia precedente.\n\n` +
    `Reference encart: \`Encart QA - Daily / Weekly > Regle anti-hardcoding obligatoire\` appliquee.\n\n` +
    `Grounding dynamique:\n\n` +
    `- connection: \`${state.connection_path}\`\n` +
    `- daily genere dynamiquement: \`${state.anti_hardcoding.dynamic_daily_generated_if_needed}\`\n` +
    `- pending_id decouvert/genere au runtime: \`${state.pending_initial.id}\`\n` +
    `- targets.length: \`${targetCount}\`\n` +
    `- local_date: \`${state.pending_initial.payload?.local_date ?? ""}\`\n\n` +
    `Raw: \`${
      path.relative(root, rawPathFor(state.persona, state.run_id))
    }\`\n\n` +
    `## 2. Tours De Conversation\n\n${turns}\n\n` +
    `## 3. Analyse De Fluidite Humaine\n\n` +
    `**Verdict: A remplir apres analyse finale**\n\n` +
    `**Ce qui marche**\n- A remplir.\n\n` +
    `**Problemes**\n- A remplir.\n\n` +
    `**Fix propose**\n- A remplir.\n\n` +
    `## 4. Analyse Systeme\n\n` +
    `**Verdict: A remplir apres analyse finale**\n\n` +
    `**Routage**\n- A remplir.\n\n` +
    `**Skills / Operations / Tools**\n- A remplir.\n\n` +
    `**Memory / Effets durables**\n- A remplir.\n\n` +
    `**Problemes**\n- A remplir.\n\n` +
    `**Fix propose**\n- A remplir.\n\n` +
    `## Verdict Global\n\n` +
    `- Verdict: A remplir\n` +
    `- Raison principale: A remplir\n` +
    `- Follow-up prioritaire: A remplir\n`;
}

async function report() {
  const persona = argValue("persona");
  const runId = argValue("run-id");
  personaConfig(persona);
  const state = loadState(persona, runId);
  const report = renderReport(state);
  const out = reportPathFor(persona, runId);
  fs.writeFileSync(out, report);
  console.log(
    JSON.stringify(
      {
        report: path.relative(root, out),
        raw: path.relative(root, rawPathFor(persona, runId)),
      },
      null,
      2,
    ),
  );
}

if (command === "prepare") await prepare();
else if (command === "send") await send();
else if (command === "report") await report();
else {
  console.error(
    "usage: node tests/real-personas/run_daily_review_manual_qa.mjs <prepare|send|report> --persona paul --run-id id [--text message]",
  );
  process.exit(2);
}
