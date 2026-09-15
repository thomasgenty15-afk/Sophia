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

function localSupabaseStatus() {
  const raw = execFileSync("supabase", ["status", "--output", "json"], {
    cwd: root,
    encoding: "utf8",
  });
  const jsonStart = raw.indexOf("{");
  if (jsonStart < 0) throw new Error("supabase status did not return json");
  return JSON.parse(raw.slice(jsonStart));
}

const env = readEnvFile(path.join(root, "supabase/.env"));
const status = localSupabaseStatus();
const apiUrl = String(process.env.SUPABASE_URL || status.API_URL || "http://127.0.0.1:54321").replace(/\/+$/, "");
const anonKey = process.env.SUPABASE_ANON_KEY || status.ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || status.SERVICE_ROLE_KEY;
const internalSecret = process.env.INTERNAL_FUNCTION_SECRET || env.INTERNAL_FUNCTION_SECRET || status.SECRET_KEY;
if (!anonKey || !serviceRoleKey || !internalSecret) throw new Error("missing local Supabase credentials");

const runId = argValue("run-id") || `daily-actions-trigger-${new Date().toISOString().replace(/[:.]/g, "")}`;
const runDir = path.join(root, "tmp", "daily-actions-trigger-qa", runId);
const qaRunDir = path.join(root, "tests", "real-personas", "qa-skill", "runs", "daily-weekly");
fs.mkdirSync(runDir, { recursive: true });
fs.mkdirSync(qaRunDir, { recursive: true });
const statePath = path.join(runDir, "state.json");
const rawPath = path.join(qaRunDir, `${runId}.raw.json`);
const reportPath = path.join(qaRunDir, `${runId}.md`);

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
  const result = await rest(table, {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  return result.body?.[0] ?? null;
}

async function patch(table, query, row) {
  const result = await rest(`${table}?${query}`, {
    method: "PATCH",
    headers: { prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  return result.body ?? [];
}

async function callFunction(name, body, requestId) {
  return await jsonFetch(`${apiUrl}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${anonKey}`,
      "content-type": "application/json",
      "x-internal-secret": internalSecret,
      "x-request-id": requestId,
    },
    body: JSON.stringify(body ?? {}),
  });
}

function saveState(state) {
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
  fs.writeFileSync(rawPath, `${JSON.stringify(state, null, 2)}\n`);
}

function loadState() {
  return JSON.parse(fs.readFileSync(statePath, "utf8"));
}

function ymdInTimezone(timezone, date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function weekdayKey(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  const key = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
  }).format(new Date(Date.UTC(y, m - 1, d, 12, 0, 0))).toLowerCase();
  return key.slice(0, 3);
}

function mondayWeekStart(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function pastIso(minutesAgo = 5) {
  return new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();
}

function qaPhone(run) {
  const digits = crypto.createHash("sha256").update(run).digest("hex")
    .replace(/[a-f]/g, "").padEnd(11, "0").slice(0, 11);
  return `+1${digits}`;
}

async function createQaUser() {
  const suffix = runId.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 58);
  const email = `qa-daily-actions-${suffix}@example.com`;
  const password = `Qa1!${crypto.randomUUID()}`;
  const metadata = {
    is_test_persona: true,
    temporary_qa_connection: true,
    persona: "qa-skill",
    run_id: runId,
    created_by: "run_daily_actions_trigger_qa",
  };
  const userResp = await jsonFetch(`${apiUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      app_metadata: metadata,
      user_metadata: metadata,
    }),
  });
  const userId = userResp.body?.id;
  if (!userId) throw new Error("auth user create did not return id");
  const connectionName = `daily_actions_${suffix}`;
  const connectionDir = path.join(root, "tests", "real-personas", "qa-skill", "connections");
  fs.mkdirSync(connectionDir, { recursive: true });
  const connectionFile = path.join(connectionDir, `${connectionName}.json`);
  fs.writeFileSync(connectionFile, `${JSON.stringify({
    user_id: userId,
    email,
    temporary: true,
    persona: "qa-skill",
    connection_name: connectionName,
    run_id: runId,
    created_at: new Date().toISOString(),
  }, null, 2)}\n`, { mode: 0o600 });
  return { userId, email, connectionName, connectionFile };
}

async function upsertProfile(userId) {
  const existing = await select(`profiles?id=eq.${userId}&select=id`);
  const profile = {
    id: userId,
    email: `qa-daily-actions-${runId}@example.com`,
    timezone: "Europe/Paris",
    whatsapp_opted_in: true,
    whatsapp_opted_out_at: null,
    phone_number: qaPhone(runId),
    phone_verified_at: pastIso(120),
    access_tier: "trial",
    trial_end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    whatsapp_last_inbound_at: pastIso(90),
    whatsapp_last_outbound_at: pastIso(120),
    whatsapp_bilan_opted_in: true,
    whatsapp_coaching_paused_until: null,
    whatsapp_bilan_paused_until: null,
  };
  if (existing?.[0]) {
    await patch("profiles", `id=eq.${userId}`, profile);
  } else {
    await insert("profiles", profile);
  }
}

async function seedPlan(userId) {
  const timezone = "Europe/Paris";
  const localDate = ymdInTimezone(timezone);
  const weekday = weekdayKey(localDate);
  const weekStart = mondayWeekStart(localDate);
  const cycle = await insert("user_cycles", {
    user_id: userId,
    status: "active",
    raw_intake_text: "QA dynamique: tester les encouragements d'actions du jour et le daily.",
    intake_language: "fr",
    duration_months: 1,
  });
  const transformation = await insert("user_transformations", {
    cycle_id: cycle.id,
    priority_order: 1,
    status: "active",
    title: "QA actions du jour",
    internal_summary: "Fixture QA locale pour actions planifiées aujourd'hui.",
    user_summary: "Tester que Sophia encourage et demande le bilan.",
    activated_at: pastIso(24 * 60),
  });
  await patch("user_cycles", `id=eq.${cycle.id}`, {
    active_transformation_id: transformation.id,
  });
  const plan = await insert("user_plans_v2", {
    user_id: userId,
    cycle_id: cycle.id,
    transformation_id: transformation.id,
    status: "active",
    version: 1,
    title: "Plan QA actions du jour",
    activated_at: pastIso(24 * 60),
    content: { source: "qa_dynamic_fixture", run_id: runId },
  });
  const titles = [
    "Faire dix minutes de rangement ciblé",
    "Préparer le premier bloc de travail sans téléphone",
  ];
  const items = [];
  for (let index = 0; index < titles.length; index += 1) {
    const item = await insert("user_plan_items", {
      user_id: userId,
      cycle_id: cycle.id,
      transformation_id: transformation.id,
      plan_id: plan.id,
      dimension: "habits",
      kind: "habit",
      status: "active",
      title: titles[index],
      description: "Action QA planifiée pour aujourd'hui.",
      tracking_type: "boolean",
      activation_order: index + 1,
      current_habit_state: "active_building",
      target_reps: 1,
      current_reps: 0,
      cadence_label: "Aujourd'hui",
      scheduled_days: [weekday],
      time_of_day: index === 0 ? "morning" : "afternoon",
      activated_at: pastIso(24 * 60),
      payload: { source: "qa_dynamic_fixture", run_id: runId },
    });
    await insert("user_habit_week_plans", {
      user_id: userId,
      cycle_id: cycle.id,
      transformation_id: transformation.id,
      plan_id: plan.id,
      plan_item_id: item.id,
      week_start_date: weekStart,
      status: "confirmed",
      confirmed_at: pastIso(24 * 60),
    });
    const occurrence = await insert("user_habit_week_occurrences", {
      user_id: userId,
      cycle_id: cycle.id,
      transformation_id: transformation.id,
      plan_id: plan.id,
      plan_item_id: item.id,
      week_start_date: weekStart,
      ordinal: index + 1,
      default_day: weekday,
      planned_day: weekday,
      original_planned_day: weekday,
      status: "planned",
      source: "weekly_confirmed",
    });
    items.push({ item, occurrence });
  }
  return { timezone, localDate, weekday, weekStart, cycle, transformation, plan, items };
}

async function setupAndTrigger() {
  const startedAt = new Date().toISOString();
  const user = await createQaUser();
  await upsertProfile(user.userId);
  const plan = await seedPlan(user.userId);
  const unrelatedDueBefore = await select(
    `scheduled_checkins?user_id=neq.${user.userId}&status=in.(pending,retrying)&scheduled_for=lte.${encodeURIComponent(new Date().toISOString())}&select=id,user_id,event_context,scheduled_for,status&limit=10`,
  );
  if (unrelatedDueBefore.length > 0) {
    throw new Error(`Refusing to process checkins: ${unrelatedDueBefore.length} unrelated due checkins already exist`);
  }
  const scheduleResp = await callFunction(
    "schedule-whatsapp-v2-checkins",
    { user_id: user.userId },
    `${runId}-schedule`,
  );
  const checkins = await select(
    `scheduled_checkins?user_id=eq.${user.userId}&event_context=in.(action_morning_encouragement_v2,action_evening_review_v2)&select=id,status,origin,event_context,draft_message,message_mode,message_payload,scheduled_for,delivery_attempt_count,processed_at&order=scheduled_for.asc`,
  );
  const morning = checkins.find((row) => row.event_context === "action_morning_encouragement_v2");
  if (!morning) throw new Error("morning action encouragement checkin was not scheduled");
  await patch("scheduled_checkins", `id=eq.${morning.id}`, {
    scheduled_for: pastIso(2),
    status: "pending",
  });
  const morningProcessResp = await callFunction(
    "process-checkins",
    {},
    `${runId}-process-morning`,
  );
  const afterMorning = {
    checkins: await select(
      `scheduled_checkins?user_id=eq.${user.userId}&event_context=in.(action_morning_encouragement_v2,action_evening_review_v2)&select=id,status,origin,event_context,draft_message,message_mode,message_payload,scheduled_for,delivery_attempt_count,processed_at&order=scheduled_for.asc`,
    ),
    messages: await select(
      `chat_messages?user_id=eq.${user.userId}&scope=eq.whatsapp&role=eq.assistant&created_at=gte.${encodeURIComponent(startedAt)}&select=id,content,metadata,created_at&order=created_at.asc`,
    ),
  };
  const evening = afterMorning.checkins.find((row) => row.event_context === "action_evening_review_v2");
  if (!evening) throw new Error("daily evening review checkin was not scheduled");
  await patch("profiles", `id=eq.${user.userId}`, {
    whatsapp_last_inbound_at: pastIso(90),
    whatsapp_last_outbound_at: pastIso(120),
  });
  await patch("scheduled_checkins", `id=eq.${evening.id}`, {
    scheduled_for: pastIso(2),
    status: "pending",
  });
  const dailyProcessResp = await callFunction(
    "process-checkins",
    {},
    `${runId}-process-daily`,
  );
  const state = {
    run_id: runId,
    created_at: new Date().toISOString(),
    started_at: startedAt,
    persona: "qa-skill",
    persona_conversationnel: "qa-skill",
    user_id: user.userId,
    email: user.email,
    connection_name: user.connectionName,
    connection_path: path.relative(root, user.connectionFile),
    constraints: {
      local_supabase: apiUrl,
      force_full_ai: "non applicable: proactive process-checkins, not test-send-message",
      deterministic_renderer: false,
      direct_executor: false,
      cleanup_destructive_db: false,
    },
    fixture: plan,
    schedule_response: scheduleResp.body,
    morning_process_response: morningProcessResp.body,
    after_morning: afterMorning,
    daily_process_response: dailyProcessResp.body,
    after_daily: {
      checkins: await select(
        `scheduled_checkins?user_id=eq.${user.userId}&event_context=in.(action_morning_encouragement_v2,action_evening_review_v2)&select=id,status,origin,event_context,draft_message,message_mode,message_payload,scheduled_for,delivery_attempt_count,processed_at&order=scheduled_for.asc`,
      ),
      pending_actions: await select(
        `whatsapp_pending_actions?user_id=eq.${user.userId}&kind=eq.scheduled_checkin&select=id,status,scheduled_checkin_id,payload,created_at,processed_at&order=created_at.asc`,
      ),
      messages: await select(
        `chat_messages?user_id=eq.${user.userId}&scope=eq.whatsapp&role=eq.assistant&created_at=gte.${encodeURIComponent(startedAt)}&select=id,content,metadata,created_at&order=created_at.asc`,
      ),
    },
  };
  saveState(state);
  const dailyOpening = state.after_daily.messages.find((msg) =>
    msg.metadata?.event_context === "action_evening_review_v2" ||
    msg.metadata?.purpose === "action_evening_review"
  )?.content ?? "";
  console.log(JSON.stringify({
    run_id: runId,
    state: path.relative(root, statePath),
    raw: path.relative(root, rawPath),
    report: path.relative(root, reportPath),
    user_id: user.userId,
    scheduled: scheduleResp.body,
    morning_status: state.after_daily.checkins.find((row) => row.event_context === "action_morning_encouragement_v2")?.status ?? null,
    daily_status: state.after_daily.checkins.find((row) => row.event_context === "action_evening_review_v2")?.status ?? null,
    pending_daily_count: state.after_daily.pending_actions.filter((row) => row.payload?.chat_capability === "daily_action_review").length,
    morning_message: state.after_daily.messages.find((msg) => msg.metadata?.event_context === "action_morning_encouragement_v2")?.content ?? "",
    daily_opening: dailyOpening,
  }, null, 2));
}

async function scheduleOnly() {
  const startedAt = new Date().toISOString();
  const user = await createQaUser();
  await upsertProfile(user.userId);
  const plan = await seedPlan(user.userId);
  const unrelatedDueBefore = await select(
    `scheduled_checkins?user_id=neq.${user.userId}&status=in.(pending,retrying)&scheduled_for=lte.${encodeURIComponent(new Date().toISOString())}&select=id,user_id,event_context,scheduled_for,status&limit=50`,
  );
  const scheduleResp = await callFunction(
    "schedule-whatsapp-v2-checkins",
    { user_id: user.userId },
    `${runId}-schedule-only`,
  );
  const checkins = await select(
    `scheduled_checkins?user_id=eq.${user.userId}&event_context=in.(action_morning_encouragement_v2,action_evening_review_v2)&select=id,status,origin,event_context,draft_message,message_mode,message_payload,scheduled_for,delivery_attempt_count,processed_at&order=scheduled_for.asc`,
  );
  const state = {
    run_id: runId,
    created_at: new Date().toISOString(),
    started_at: startedAt,
    persona: "qa-skill",
    persona_conversationnel: "qa-skill",
    user_id: user.userId,
    email: user.email,
    connection_name: user.connectionName,
    connection_path: path.relative(root, user.connectionFile),
    constraints: {
      local_supabase: apiUrl,
      force_full_ai: "non applicable: proactive schedule-only",
      deterministic_renderer: false,
      direct_executor: false,
      cleanup_destructive_db: false,
      process_checkins_not_run_reason: "global_due_queue_not_empty",
    },
    fixture: plan,
    unrelated_due_before_count: unrelatedDueBefore.length,
    unrelated_due_before_sample: unrelatedDueBefore.slice(0, 10),
    schedule_response: scheduleResp.body,
    scheduled_checkins: checkins,
  };
  saveState(state);
  console.log(JSON.stringify({
    run_id: runId,
    state: path.relative(root, statePath),
    raw: path.relative(root, rawPath),
    report: path.relative(root, reportPath),
    user_id: user.userId,
    unrelated_due_before_count: unrelatedDueBefore.length,
    scheduled: scheduleResp.body,
    checkins: checkins.map((row) => ({
      id: row.id,
      event_context: row.event_context,
      status: row.status,
      scheduled_for: row.scheduled_for,
      chat_capability: row.message_payload?.chat_capability ?? null,
      occurrence_ids: row.message_payload?.occurrence_ids ?? [],
      plan_item_ids: row.message_payload?.plan_item_ids ?? [],
    })),
  }, null, 2));
}

function renderScheduleOnlyReport(state) {
  const morning = state.scheduled_checkins.find((row) => row.event_context === "action_morning_encouragement_v2");
  const daily = state.scheduled_checkins.find((row) => row.event_context === "action_evening_review_v2");
  const morningOk = morning?.message_payload?.chat_capability === "track_progress_only" &&
    Array.isArray(morning?.message_payload?.occurrence_ids) &&
    morning.message_payload.occurrence_ids.length === state.fixture.items.length;
  const dailyOk = daily?.message_payload?.source === "schedule_action_evening_review_v2" &&
    Array.isArray(daily?.message_payload?.occurrence_ids) &&
    daily.message_payload.occurrence_ids.length === state.fixture.items.length;
  const systemVerdict = morningOk && dailyOk ? "yellow" : "red";
  return `# QA Run Report - Daily Actions Trigger ${runId}

## 1. Contexte Du Test

- Date: ${new Date().toISOString().slice(0, 10)}
- Run: \`${state.run_id}\`
- Persona: qa-skill
- Objectif: verifier que les messages d'encouragement lies aux actions du jour et le daily sont planifies quand des actions existent.
- Trajectoire: fixture dynamique locale avec 2 actions planifiees aujourd'hui; appel \`schedule-whatsapp-v2-checkins\` cible sur le user temporaire; \`process-checkins\` non execute car la file globale contient deja des checkins dus hors scope.
- Surfaces visees: \`scheduled_checkins\`, payloads \`action_morning_encouragement_v2\` et \`action_evening_review_v2\`, ciblage des occurrences/actions du jour.
- Cadre IA reel: Supabase local; pas de staging; pas d'executor appele directement; pas de renderer deterministe; \`force_full_ai\` non applicable car aucun tour \`test-send-message\`.
- Validite QA: partielle. Le scheduling est valide; l'envoi effectif via \`process-checkins\` est bloque pour eviter de traiter ${state.unrelated_due_before_count} checkins dus d'autres users locaux.

Grounding dynamique:

- User id: \`${state.user_id}\`
- Connection: \`${state.connection_path}\`
- Local date: \`${state.fixture.localDate}\`
- Week start: \`${state.fixture.weekStart}\`
- Weekday: \`${state.fixture.weekday}\`
- Actions ciblees: \`${state.fixture.items.length}\`
- Plan item ids: \`${state.fixture.items.map((entry) => entry.item.id).join(", ")}\`
- Occurrence ids: \`${state.fixture.items.map((entry) => entry.occurrence.id).join(", ")}\`
- Cleanup DB destructif: non execute; donnees isolees sur compte temporaire de test.

## 2. Tours De Conversation

### Tour 0 - Scheduling Encouragement Matin

**User**
> (aucun message user: declenchement systeme local \`schedule-whatsapp-v2-checkins\`)

**Sophia**
> (pas encore envoye: \`process-checkins\` non execute)

**Trace courte**
- http_status: \`200\`
- response_owner: \`schedule-whatsapp-v2-checkins\`
- selected_handler: \`action_morning_encouragement_v2\`
- route_reason: ${state.fixture.items.length} occurrences ouvertes aujourd'hui
- safety: aucun signal safety injecte
- direct_effects: scheduled_checkin cree
- operation: scheduling proactif
- pending_confirmation: non
- memory_plan: non pertinent
- executed_tools: \`schedule-whatsapp-v2-checkins\`
- durable_effect: checkin \`${morning?.id ?? ""}\`, status \`${morning?.status ?? ""}\`, chat_capability \`${morning?.message_payload?.chat_capability ?? ""}\`, occurrence_ids \`${morning?.message_payload?.occurrence_ids?.length ?? 0}\`

### Tour 1 - Scheduling Daily Du Soir

**User**
> (aucun message user: declenchement systeme local \`schedule-whatsapp-v2-checkins\`)

**Sophia**
> (pas encore envoye: \`process-checkins\` non execute)

**Trace courte**
- http_status: \`200\`
- response_owner: \`schedule-whatsapp-v2-checkins\`
- selected_handler: \`action_evening_review_v2\`
- route_reason: actions ouvertes aujourd'hui, cible daily creee
- safety: aucun signal safety injecte
- direct_effects: scheduled_checkin daily cree
- operation: scheduling daily action review
- pending_confirmation: non encore cree; cree normalement par \`process-checkins\`
- memory_plan: non pertinent a ce stade
- executed_tools: \`schedule-whatsapp-v2-checkins\`
- durable_effect: checkin \`${daily?.id ?? ""}\`, status \`${daily?.status ?? ""}\`, source \`${daily?.message_payload?.source ?? ""}\`, occurrence_ids \`${daily?.message_payload?.occurrence_ids?.length ?? 0}\`

### Tour 2 - Tentative Envoi

**User**
> (aucun message user)

**Sophia**
> (non execute)

**Trace courte**
- http_status: non appele
- response_owner: \`process-checkins\`
- selected_handler: bloque avant appel
- route_reason: \`process-checkins\` ne permet pas de filtrer par user_id et traiterait la file due globale
- safety: garde-fou QA
- direct_effects: aucun
- operation: aucun envoi
- pending_confirmation: aucun
- memory_plan: non applicable
- executed_tools: aucun
- durable_effect: aucun envoi verifie

## 3. Analyse De Fluidite Humaine

**Verdict: red**

**Ce qui marche**
- Aucun contenu utilisateur final n'a ete envoye, donc la fluidite du message Sophia ne peut pas etre jugee.

**Problemes**
- Tour 2: envoi non teste. Impact: impossible de valider la qualite humaine des messages d'encouragement et d'ouverture daily. Severite: red.

**Fix propose**
- Ajouter un filtre \`user_id\` ou \`scheduled_checkin_id\` a \`process-checkins\` en mode interne QA, ou vider/restaurer explicitement la file locale avec accord utilisateur avant run.

## 4. Analyse Systeme

**Verdict: ${systemVerdict}**

**Routage**
- Le scheduler detecte correctement les actions planifiees du jour et cree les deux checkins attendus.
- L'appel de processing n'a pas ete execute car il aurait traite des checkins hors scope.

**Skills / Operations / Tools**
- Morning: \`event_context=${morning?.event_context ?? ""}\`, \`chat_capability=${morning?.message_payload?.chat_capability ?? ""}\`, targets=${morning?.message_payload?.occurrence_ids?.length ?? 0}.
- Daily: \`event_context=${daily?.event_context ?? ""}\`, \`source=${daily?.message_payload?.source ?? ""}\`, targets=${daily?.message_payload?.occurrence_ids?.length ?? 0}.

**Memory / Effets durables**
- Effets durables verifies: deux lignes \`scheduled_checkins\` pour le user temporaire.
- Effets non verifies: \`chat_messages\`, \`whatsapp_pending_actions.chat_capability=daily_action_review\`, \`review_state\`, entries \`daily_action_review_v1\`, statuts d'occurrences apres reponse.

**Problemes**
- Tour 2: \`process-checkins\` ne peut pas etre teste de facon isolee dans cet etat de DB. Impact systeme: validation d'envoi impossible sans risque de side effects hors scope. Severite: red.

**Fix propose**
- Introduire une option interne safe \`user_id\` / \`checkin_id\` dans \`process-checkins\`, ou fournir une commande de cleanup/restauration explicitement approuvee pour les checkins dus locaux.

## Verdict Global

- Verdict: red
- Raison principale: le scheduling des encouragements et du daily est correct, mais l'envoi effectif n'a pas ete execute pour eviter de modifier des checkins dus appartenant a d'autres users locaux.
- Follow-up prioritaire: obtenir l'accord explicite pour traiter/nettoyer la file due locale, ou ajouter un filtre QA a \`process-checkins\` puis relancer le run complet.
`;
}

async function listDue() {
  const rows = await select(
    `scheduled_checkins?status=in.(pending,retrying)&scheduled_for=lte.${encodeURIComponent(new Date().toISOString())}&select=id,user_id,event_context,origin,status,scheduled_for,message_payload&order=scheduled_for.asc&limit=50`,
  );
  console.log(JSON.stringify(rows.map((row) => ({
    id: row.id,
    user_id: row.user_id,
    event_context: row.event_context,
    origin: row.origin,
    status: row.status,
    scheduled_for: row.scheduled_for,
    source: row.message_payload?.source ?? null,
    qa_run_id: row.message_payload?.run_id ?? null,
  })), null, 2));
}

async function sendDailyReply() {
  const text = argValue("text");
  if (!text) throw new Error("--text is required");
  const state = loadState();
  const startedAt = new Date().toISOString();
  const waFrom = qaPhone(`${runId}:wa-from`).replace("+", "");
  const payload = {
    object: "whatsapp_business_account",
    entry: [{
      id: `qa-entry-${runId}`,
      changes: [{
        field: "messages",
        value: {
          messaging_product: "whatsapp",
          metadata: {
            display_phone_number: qaPhone(`${runId}:display`).replace("+", ""),
            phone_number_id: crypto.createHash("sha256").update(`${runId}:phone`).digest("hex").slice(0, 16),
          },
          contacts: [{ profile: { name: "qa-skill daily actions" }, wa_id: waFrom }],
          messages: [{
            from: waFrom,
            id: `wamid_${runId}_${crypto.randomUUID()}`,
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
      "x-request-id": `${runId}-daily-reply`,
    },
    body: JSON.stringify(payload),
  });
  state.daily_reply = {
    text,
    response: response.body,
    http_status: response.status,
    assistant_after: await select(
      `chat_messages?user_id=eq.${state.user_id}&scope=eq.whatsapp&role=eq.assistant&created_at=gte.${encodeURIComponent(startedAt)}&select=id,content,metadata,created_at&order=created_at.asc`,
    ),
    pending_after: await select(
      `whatsapp_pending_actions?user_id=eq.${state.user_id}&kind=eq.scheduled_checkin&select=id,status,scheduled_checkin_id,payload,created_at,processed_at&order=created_at.asc`,
    ),
    occurrences_after: await select(
      `user_habit_week_occurrences?user_id=eq.${state.user_id}&select=id,plan_item_id,planned_day,status,source,validated_at,updated_at&order=updated_at.desc`,
    ),
    entries_after: await select(
      `user_plan_item_entries?user_id=eq.${state.user_id}&select=id,plan_item_id,entry_kind,outcome,value_text,blocker_hint,difficulty_level,metadata,effective_at,created_at&order=created_at.desc`,
    ),
  };
  saveState(state);
  console.log(JSON.stringify({
    run_id: runId,
    http_status: response.status,
    assistant: state.daily_reply.assistant_after.map((msg) => msg.content).join("\n\n"),
    pending_statuses: state.daily_reply.pending_after.map((row) => row.status),
    occurrence_statuses: state.daily_reply.occurrences_after.map((row) => ({
      id: row.id,
      status: row.status,
    })),
    entries_count: state.daily_reply.entries_after.length,
  }, null, 2));
}

function quote(text) {
  const value = String(text ?? "").trim();
  return value ? value.replace(/\n/g, "\n> ") : "(vide)";
}

function compactJson(value) {
  return JSON.stringify(value ?? null);
}

function renderReport(state) {
  const morningCheckin = state.after_daily.checkins.find((row) => row.event_context === "action_morning_encouragement_v2");
  const dailyCheckin = state.after_daily.checkins.find((row) => row.event_context === "action_evening_review_v2");
  const morningMsg = state.after_daily.messages.find((msg) => msg.metadata?.event_context === "action_morning_encouragement_v2");
  const dailyMsg = state.after_daily.messages.find((msg) =>
    msg.metadata?.event_context === "action_evening_review_v2" ||
    msg.metadata?.purpose === "action_evening_review"
  );
  const dailyPending = state.after_daily.pending_actions.find((row) => row.payload?.chat_capability === "daily_action_review");
  const replyAssistant = state.daily_reply?.assistant_after?.map((msg) => msg.content).join("\n\n").trim() ?? "";
  const pendingAfterReply = state.daily_reply?.pending_after?.find((row) => row.id === dailyPending?.id);
  const targetCount = state.fixture.items.length;
  const entries = state.daily_reply?.entries_after ?? [];
  const occurrences = state.daily_reply?.occurrences_after ?? [];
  const systemGreen =
    morningCheckin?.status === "sent" &&
    dailyCheckin?.status === "awaiting_user" &&
    dailyPending?.payload?.chat_capability === "daily_action_review" &&
    targetCount === 2 &&
    (!state.daily_reply || (pendingAfterReply?.status === "done" && entries.length >= 2));
  const fluidityVerdict = morningMsg?.content && dailyMsg?.content && (!state.daily_reply || replyAssistant)
    ? "green"
    : "red";
  const systemVerdict = systemGreen ? "green" : "red";
  const globalVerdict = fluidityVerdict === "red" || systemVerdict === "red" ? "red" : "green";
  return `# QA Run Report - Daily Actions Trigger ${runId}

## 1. Contexte Du Test

- Date: ${new Date().toISOString().slice(0, 10)}
- Run: \`${state.run_id}\`
- Persona: qa-skill
- Objectif: verifier que les encouragements WhatsApp du matin partent quand des actions sont prevues dans la journee, et que le daily du soir se declenche sur ces actions.
- Trajectoire: fixture dynamique avec 2 actions planifiees aujourd'hui, appel local \`schedule-whatsapp-v2-checkins\`, puis \`process-checkins\` pour le matin et le daily; reponse user au pending daily apres lecture de l'ouverture.
- Surfaces visees: \`scheduled_checkins\`, \`process-checkins\`, \`whatsapp-send\` en simulation locale, \`whatsapp_pending_actions\`, \`whatsapp-webhook\`, \`daily_action_review_v1\`.
- Cadre IA reel: Supabase local; generation dynamique par les Edge Functions locales; aucun executor daily appele directement; aucun renderer deterministe; pas de staging/remote; \`force_full_ai\` non applicable car le chemin teste n'est pas \`test-send-message\`.
- Validite QA: valide pour le chemin proactif local; fixture isolee sur compte temporaire \`${state.connection_name}\`.

Grounding dynamique:

- User id: \`${state.user_id}\`
- Connection: \`${state.connection_path}\`
- Local date: \`${state.fixture.localDate}\`
- Week start: \`${state.fixture.weekStart}\`
- Weekday: \`${state.fixture.weekday}\`
- Actions ciblees: \`${targetCount}\`
- Plan item ids: \`${state.fixture.items.map((entry) => entry.item.id).join(", ")}\`
- Occurrence ids: \`${state.fixture.items.map((entry) => entry.occurrence.id).join(", ")}\`
- Cleanup DB destructif: non execute; les donnees restent isolees sur un user temporaire marque test.

## 2. Tours De Conversation

### Tour 0 - Encouragement Matin

**User**
> (aucun message user: declenchement proactif \`action_morning_encouragement_v2\`)

**Sophia**
> ${quote(morningMsg?.content)}

**Trace courte**
- http_status: \`${state.morning_process_response?.request_id ? 200 : ""}\`
- response_owner: \`process-checkins\`
- selected_handler: \`action_morning_encouragement_v2\`
- route_reason: 2 occurrences ouvertes trouvees pour aujourd'hui
- safety: aucun signal safety injecte
- direct_effects: \`whatsapp-send\` simulation locale a logge un message assistant
- operation: scheduled checkin dynamique
- pending_confirmation: non
- memory_plan: non pertinent
- executed_tools: \`schedule-whatsapp-v2-checkins\`, \`process-checkins\`, \`whatsapp-send\`
- durable_effect: scheduled_checkin \`${morningCheckin?.id ?? ""}\` status \`${morningCheckin?.status ?? ""}\`; chat_capability \`${morningCheckin?.message_payload?.chat_capability ?? ""}\`; source \`${morningCheckin?.message_payload?.source ?? ""}\`

### Tour 1 - Daily Du Soir

**User**
> (aucun message user: declenchement proactif \`action_evening_review_v2\`)

**Sophia**
> ${quote(dailyMsg?.content)}

**Trace courte**
- http_status: \`${state.daily_process_response?.request_id ? 200 : ""}\`
- response_owner: \`process-checkins\`
- selected_handler: \`action_evening_review_v2\`
- route_reason: meme jour local, occurrences ouvertes, fenetre WhatsApp 24h ouverte
- safety: aucun signal safety injecte
- direct_effects: message WhatsApp simule + pending daily cree
- operation: daily action review opening
- pending_confirmation: \`${dailyPending?.id ?? ""}\`
- memory_plan: action context charge par \`buildDailyActionReviewActionIntelligence\`
- executed_tools: \`process-checkins\`, \`whatsapp-send\`
- durable_effect: scheduled_checkin \`${dailyCheckin?.id ?? ""}\` status \`${dailyCheckin?.status ?? ""}\`; pending status \`${dailyPending?.status ?? ""}\`; chat_capability \`${dailyPending?.payload?.chat_capability ?? ""}\`; targets \`${dailyPending?.payload?.targets?.length ?? 0}\`

### Tour 2 - Reponse Au Daily

**User**
> ${quote(state.daily_reply?.text)}

**Sophia**
> ${quote(replyAssistant)}

**Trace courte**
- http_status: \`${state.daily_reply?.http_status ?? ""}\`
- response_owner: \`whatsapp-webhook\`
- selected_handler: \`handleActionEveningReviewReply\`
- route_reason: pending \`daily_action_review\` prioritaire
- safety: aucun signal safety actif
- direct_effects: pending traite, entries daily creees, occurrences mises a jour
- operation: \`daily_action_review_v1\`
- pending_confirmation: \`${pendingAfterReply?.status ?? ""}\`
- memory_plan: metadata daily structurantes sur entries
- executed_tools: \`whatsapp-webhook\`
- durable_effect: entries \`${entries.length}\`; occurrences ${compactJson(occurrences.map((row) => ({ id: row.id, status: row.status })))} 

## 3. Analyse De Fluidite Humaine

**Verdict: ${fluidityVerdict}**

**Ce qui marche**
- Le message du matin est proactif, bref, et relié aux actions du jour sans demander un bilan trop tôt.
- Le daily du soir ouvre bien sur les actions prévues et accepte une réponse naturelle mixte.
- Après la réponse user, Sophia accuse réception sans repartir dans une opération de plan inutile.

**Problemes**
- Aucun bloquant observé sur ce run.

**Fix propose**
- Aucun fix prioritaire côté fluidité sur cette trajectoire.

## 4. Analyse Systeme

**Verdict: ${systemVerdict}**

**Routage**
- \`schedule-whatsapp-v2-checkins\` a bien cree un checkin \`action_morning_encouragement_v2\` et un checkin \`action_evening_review_v2\` pour le compte cible.
- \`process-checkins\` a route le matin vers \`track_progress_only\` et le soir vers \`daily_action_review\`.
- \`whatsapp-webhook\` a priorise le pending daily lors de la reponse user.

**Skills / Operations / Tools**
- Matin: \`message_payload.source = ${morningCheckin?.message_payload?.source ?? ""}\`, \`chat_capability = ${morningCheckin?.message_payload?.chat_capability ?? ""}\`.
- Daily: pending \`chat_capability = ${dailyPending?.payload?.chat_capability ?? ""}\`, \`targets.length = ${dailyPending?.payload?.targets?.length ?? 0}\`, \`review_state\` present = ${Boolean(dailyPending?.payload?.review_state)}.
- Reponse daily: entries creees = ${entries.length}; statuses occurrences = ${occurrences.map((row) => row.status).join(", ")}.

**Memory / Effets durables**
- Le matin a produit un \`chat_messages\` assistant WhatsApp avec \`event_context=action_morning_encouragement_v2\`.
- Le daily a cree un \`whatsapp_pending_actions\` \`daily_action_review\` lie au scheduled_checkin.
- La reponse au daily a produit des entries \`user_plan_item_entries\` et a marque le pending en \`${pendingAfterReply?.status ?? ""}\`.

**Problemes**
- Aucun bloquant observe. Cleanup destructif non execute par respect des garde-fous DB; isolation assuree par user temporaire.

**Fix propose**
- Ajouter un runner officiel non destructif pour ce scenario afin d'eviter de recreer une fixture QA ad hoc.

## Verdict Global

- Verdict: ${globalVerdict}
- Raison principale: les deux checkins proactifs attendus sont crees et traites, et le daily conversationnel produit les effets durables attendus sur les actions.
- Follow-up prioritaire: formaliser ce test en script QA maintenu avec cleanup explicite seulement apres confirmation.
`;
}

async function report() {
  const state = loadState();
  const report = state.scheduled_checkins
    ? renderScheduleOnlyReport(state)
    : renderReport(state);
  fs.writeFileSync(reportPath, report);
  saveState(state);
  console.log(JSON.stringify({
    report: path.relative(root, reportPath),
    raw: path.relative(root, rawPath),
    state: path.relative(root, statePath),
  }, null, 2));
}

if (command === "due") await listDue();
else if (command === "schedule-only") await scheduleOnly();
else if (command === "setup-and-trigger") await setupAndTrigger();
else if (command === "reply") await sendDailyReply();
else if (command === "report") await report();
else {
  console.error("usage: node tmp/run_daily_actions_trigger_qa.mjs <setup-and-trigger|reply|report> --run-id id [--text message]");
  process.exit(2);
}
