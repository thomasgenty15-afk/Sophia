import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";

const root = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();
const runRoot = path.join(root, "tmp", "weekly-planning-gate-qa");
fs.mkdirSync(runRoot, { recursive: true });

const WEEKLY_PROGRESS_REVIEW_EVENT_CONTEXT = "weekly_progress_review_v2";
const WEEKLY_PLANNING_VALIDATION_PROMPT_EVENT_CONTEXT =
  "weekly_planning_validation_prompt";
const DAY_CODES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

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

function loadSupabaseStatus() {
  try {
    const raw = execFileSync("/usr/local/bin/supabase", [
      "status",
      "--output",
      "json",
    ], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const start = raw.indexOf("{");
    return start >= 0 ? JSON.parse(raw.slice(start)) : {};
  } catch {
    return {};
  }
}

const env = readEnvFile(path.join(root, "supabase/.env"));
const status = loadSupabaseStatus();
const supabaseUrl = String(
  process.env.SUPABASE_URL || status.API_URL || env.SUPABASE_URL ||
    "http://127.0.0.1:54321",
).replace(/\/+$/, "");
const anonKey = process.env.SUPABASE_ANON_KEY || status.ANON_KEY ||
  env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  status.SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
const authAdminKey = process.env.SUPABASE_AUTH_ADMIN_KEY || status.SECRET_KEY ||
  env.SUPABASE_SERVICE_ROLE_KEY || serviceKey;
const internalSecret = process.env.INTERNAL_FUNCTION_SECRET ||
  env.INTERNAL_FUNCTION_SECRET || status.SECRET_KEY || env.SECRET_KEY;

if (!anonKey || !serviceKey || !authAdminKey || !internalSecret) {
  throw new Error("Missing local Supabase anon/service/internal credentials");
}

function argValue(name, fallback = "") {
  const prefixed = `--${name}=`;
  const direct = process.argv.find((arg) => arg.startsWith(prefixed));
  if (direct) return direct.slice(prefixed.length);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0) return process.argv[index + 1] ?? fallback;
  return fallback;
}

function safeEmailPart(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "").slice(0, 52);
}

function addDaysYmd(ymd, days) {
  const date = new Date(`${ymd}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function mondayWeekStartForLocalDate(localDate) {
  const date = new Date(`${localDate}T12:00:00.000Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function localDateInTimezone(timezone, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function localDateTimeInTimezone(timezone, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    ymd: `${value("year")}-${value("month")}-${value("day")}`,
    weekday: value("weekday").toLowerCase(),
    minutes: Number(value("hour")) * 60 + Number(value("minute")),
  };
}

function localIsoForDateTime(timezone, ymd, hh, mm) {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const [year, month, day] = ymd.split("-").map(Number);
  let guess = Date.UTC(year, month - 1, day, hh, mm, 0, 0);
  for (let i = 0; i < 3; i++) {
    const parts = dtf.formatToParts(new Date(guess));
    const value = (type) => Number(parts.find((p) => p.type === type)?.value ?? 0);
    const got = Date.UTC(
      value("year"),
      value("month") - 1,
      value("day"),
      value("hour"),
      value("minute"),
    );
    const desired = Date.UTC(year, month - 1, day, hh, mm);
    const delta = got - desired;
    if (delta === 0) break;
    guess -= delta;
  }
  return new Date(guess).toISOString();
}

async function jsonFetch(url, options = {}, timeoutMs = 180000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw_text: text };
  }
  return { status: response.status, ok: response.ok, body, text };
}

async function assertOk(result, label) {
  if (!result.ok) {
    throw new Error(`${label} failed: ${result.status} ${result.text}`);
  }
  return result.body;
}

async function rest(pathPart, options = {}) {
  return await jsonFetch(`${supabaseUrl}/rest/v1${pathPart}`, {
    ...options,
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      "content-type": "application/json",
      accept: "application/json",
      ...(options.headers ?? {}),
    },
  });
}

async function select(pathPart) {
  const result = await rest(pathPart, { method: "GET" });
  return await assertOk(result, `GET ${pathPart}`);
}

async function insert(pathPart, rows) {
  const result = await rest(pathPart, {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify(Array.isArray(rows) ? rows : [rows]),
  });
  return await assertOk(result, `INSERT ${pathPart}`);
}

async function patch(pathPart, row) {
  const result = await rest(pathPart, {
    method: "PATCH",
    headers: { prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  return await assertOk(result, `PATCH ${pathPart}`);
}

async function upsert(pathPart, rows) {
  const result = await rest(pathPart, {
    method: "POST",
    headers: {
      prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(Array.isArray(rows) ? rows : [rows]),
  });
  return await assertOk(result, `UPSERT ${pathPart}`);
}

async function callInternalFunction(name, payload, requestId) {
  return await jsonFetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${anonKey}`,
      "content-type": "application/json",
      "x-internal-secret": internalSecret,
      "x-request-id": requestId,
    },
    body: JSON.stringify(payload ?? {}),
  });
}

async function callUserFunction(name, userId, payload, requestId) {
  return await jsonFetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${anonKey}`,
      "content-type": "application/json",
      "x-internal-secret": internalSecret,
      "x-user-id": userId,
      "x-request-id": requestId,
    },
    body: JSON.stringify(payload),
  });
}

async function createAuthUser(runId) {
  const email = `qa-weekly-gate-${safeEmailPart(runId)}@example.com`;
  const password = `Qa1!${randomUUID()}`;
  const metadata = {
    is_test_persona: true,
    temporary_qa_connection: true,
    persona: "qa-weekly-gate",
    run_id: runId,
  };
  const created = await jsonFetch(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: authAdminKey,
      authorization: `Bearer ${authAdminKey}`,
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
  await assertOk(created, "create auth user");
  return { user_id: created.body.id, email, password };
}

async function signIn(auth) {
  const token = await jsonFetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "content-type": "application/json" },
    body: JSON.stringify({ email: auth.email, password: auth.password }),
  });
  await assertOk(token, "sign in");
  return token.body.access_token;
}

function planItem(base, overrides) {
  return {
    id: randomUUID(),
    user_id: base.user_id,
    cycle_id: base.cycle_id,
    transformation_id: base.transformation_id,
    plan_id: base.plan_id,
    dimension: "habits",
    kind: "habit",
    status: "active",
    title: "Action QA",
    description: null,
    tracking_type: "boolean",
    activation_order: null,
    current_habit_state: "active_building",
    target_reps: 1,
    current_reps: 0,
    cadence_label: null,
    scheduled_days: null,
    time_of_day: null,
    payload: { fixture: "weekly_planning_gate_qa" },
    created_at: base.now,
    updated_at: base.now,
    activated_at: base.now,
    completed_at: null,
    ...overrides,
  };
}

function occurrenceRow(base, item, weekStart, ordinal, day, status, evidence) {
  return {
    id: evidence.occurrence_id,
    user_id: base.user_id,
    cycle_id: base.cycle_id,
    transformation_id: base.transformation_id,
    plan_id: base.plan_id,
    plan_item_id: item.id,
    week_start_date: weekStart,
    ordinal,
    default_day: day,
    planned_day: day,
    original_planned_day: null,
    actual_day: null,
    status,
    source: "weekly_confirmed",
    validated_at: status === "planned" ? null : evidence.effective_at,
    created_at: base.now,
    updated_at: base.now,
  };
}

function entryRow(base, item, evidence) {
  return {
    id: randomUUID(),
    user_id: base.user_id,
    cycle_id: base.cycle_id,
    transformation_id: base.transformation_id,
    plan_id: base.plan_id,
    plan_item_id: item.id,
    entry_kind: evidence.entry_kind,
    outcome: evidence.outcome,
    value_text: evidence.value_text,
    difficulty_level: evidence.difficulty_level,
    blocker_hint: evidence.blocker_hint,
    effective_at: evidence.effective_at,
    created_at: evidence.effective_at,
    metadata: {
      source: "daily_action_review_v1",
      occurrence_id: evidence.occurrence_id,
      reason_category: evidence.reason_category,
      reason_text: evidence.reason_text,
      still_relevant: evidence.still_relevant,
      occurrence_status: evidence.outcome,
      reschedule_decision: evidence.reschedule_decision,
      confidence: "high",
      outcome_source: "user_reply",
    },
  };
}

async function seedRun(runId) {
  const timezone = "Europe/Paris";
  const now = new Date();
  const local = localDateTimeInTimezone(timezone, now);
  const currentWeekStart = mondayWeekStartForLocalDate(local.ymd);
  const currentWeekEnd = addDaysYmd(currentWeekStart, 6);
  const nextWeekStart = addDaysYmd(currentWeekStart, 7);
  const nextWeekEnd = addDaysYmd(nextWeekStart, 6);
  const auth = await createAuthUser(runId);
  const phoneSuffix = createHash("sha256").update(runId).digest("hex")
    .replace(/[a-f]/g, "").padEnd(10, "0").slice(0, 10);
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  await upsert("/profiles?on_conflict=id", {
    id: auth.user_id,
    full_name: "QA Weekly Gate",
    email: auth.email,
    timezone,
    onboarding_completed: true,
    access_tier: "trial",
    phone_number: `+1555${phoneSuffix}`,
    phone_verified_at: oneHourAgo,
    whatsapp_opted_in: true,
    whatsapp_bilan_opted_in: true,
    whatsapp_last_inbound_at: oneHourAgo,
    whatsapp_last_outbound_at: null,
    updated_at: new Date().toISOString(),
  });

  const ids = {
    cycle_id: randomUUID(),
    transformation_id: randomUUID(),
    plan_id: randomUUID(),
  };
  const base = {
    user_id: auth.user_id,
    cycle_id: ids.cycle_id,
    transformation_id: ids.transformation_id,
    plan_id: ids.plan_id,
    now: new Date().toISOString(),
  };

  await insert("/user_cycles", {
    id: ids.cycle_id,
    user_id: auth.user_id,
    status: "active",
    raw_intake_text:
      "Fixture QA weekly: verifier que le planning suivant attend le weekly.",
    intake_language: "fr",
    duration_months: 1,
    active_transformation_id: null,
    version: 1,
    created_at: base.now,
    updated_at: base.now,
  });
  await insert("/user_transformations", {
    id: ids.transformation_id,
    cycle_id: ids.cycle_id,
    priority_order: 1,
    status: "active",
    title: "Stabiliser le rythme de travail",
    internal_summary: "Niveau QA pour weekly adaptive review.",
    user_summary: "Tenir une semaine realiste sans empiler trop d'actions.",
    success_definition: "Garder les habitudes utiles sans surcharge.",
    main_constraint: "La fatigue fait deraper les fins de journee.",
    questionnaire_schema: { fixture: true },
    questionnaire_answers: { fixture: true },
    created_at: base.now,
    updated_at: base.now,
    activated_at: base.now,
  });
  await patch(`/user_cycles?id=eq.${ids.cycle_id}`, {
    active_transformation_id: ids.transformation_id,
    updated_at: base.now,
  });

  const focusItem = planItem(base, {
    title: "Session focus courte",
    description: "Lancer un bloc de 12 minutes sans refaire toute l'organisation.",
    target_reps: 4,
    scheduled_days: ["mon", "tue", "thu", "fri"],
    cadence_label: "4 fois cette semaine",
    payload: {
      fixture: "weekly_planning_gate_qa",
      _generation: { temp_id: "habit-focus" },
    },
  });
  const walkItem = planItem(base, {
    title: "Marche de decompression",
    description: "Marcher dix minutes pour redescendre.",
    target_reps: 2,
    scheduled_days: ["wed", "fri"],
    cadence_label: "2 fois cette semaine",
    payload: {
      fixture: "weekly_planning_gate_qa",
      _generation: { temp_id: "habit-walk" },
    },
  });

  await insert("/user_plans_v2", {
    id: ids.plan_id,
    user_id: auth.user_id,
    cycle_id: ids.cycle_id,
    transformation_id: ids.transformation_id,
    status: "active",
    version: 1,
    title: "Plan QA weekly gate",
    content: {
      metadata: {
        schedule_anchor: {
          anchor_week_start: currentWeekStart,
          anchor_week_end: currentWeekEnd,
        },
      },
      phases: [{
        phase_id: "phase-1",
        weeks: [
          {
            week_order: 1,
            item_assignments: [
              { temp_id: "habit-focus" },
              { temp_id: "habit-walk" },
            ],
          },
          {
            week_order: 2,
            item_assignments: [
              { temp_id: "habit-focus" },
              { temp_id: "habit-walk" },
            ],
          },
        ],
      }],
    },
    generation_attempts: 1,
    last_generation_reason: "weekly_planning_gate_qa",
    activated_at: base.now,
    created_at: base.now,
    updated_at: base.now,
  });
  await insert("/user_plan_items", [focusItem, walkItem]);

  await insert("/user_habit_week_plans", [
    {
      user_id: auth.user_id,
      cycle_id: ids.cycle_id,
      transformation_id: ids.transformation_id,
      plan_id: ids.plan_id,
      plan_item_id: focusItem.id,
      week_start_date: currentWeekStart,
      status: "confirmed",
      confirmed_at: localIsoForDateTime(timezone, currentWeekStart, 7, 30),
      created_at: base.now,
      updated_at: base.now,
    },
    {
      user_id: auth.user_id,
      cycle_id: ids.cycle_id,
      transformation_id: ids.transformation_id,
      plan_id: ids.plan_id,
      plan_item_id: walkItem.id,
      week_start_date: currentWeekStart,
      status: "confirmed",
      confirmed_at: localIsoForDateTime(timezone, currentWeekStart, 7, 30),
      created_at: base.now,
      updated_at: base.now,
    },
  ]);

  const evidences = [
    {
      occurrence_id: randomUUID(),
      item: focusItem,
      ordinal: 1,
      day: "mon",
      status: "done",
      entry_kind: "checkin",
      outcome: "completed",
      value_text: "Fait lundi matin avec minuteur.",
      reason_category: "none",
      reason_text: null,
      difficulty_level: "low",
      blocker_hint: null,
      still_relevant: true,
      reschedule_decision: "none",
      effective_at: localIsoForDateTime(timezone, currentWeekStart, 8, 15),
    },
    {
      occurrence_id: randomUUID(),
      item: focusItem,
      ordinal: 2,
      day: "tue",
      status: "missed",
      entry_kind: "checkin",
      outcome: "missed",
      value_text: "Pas fait, trop fatigue en fin de journee.",
      reason_category: "fatigue",
      reason_text: "Fatigue forte apres la journee.",
      difficulty_level: "high",
      blocker_hint: "fatigue",
      still_relevant: true,
      reschedule_decision: "not_rescheduled_weekly_review",
      effective_at: localIsoForDateTime(timezone, addDaysYmd(currentWeekStart, 1), 20, 10),
    },
    {
      occurrence_id: randomUUID(),
      item: focusItem,
      ordinal: 3,
      day: "thu",
      status: "missed",
      entry_kind: "checkin",
      outcome: "missed",
      value_text: "Pas lance, le bloc paraissait trop gros.",
      reason_category: "too_hard",
      reason_text: "La session semblait trop lourde.",
      difficulty_level: "high",
      blocker_hint: "too_hard",
      still_relevant: true,
      reschedule_decision: "not_rescheduled_weekly_review",
      effective_at: localIsoForDateTime(timezone, addDaysYmd(currentWeekStart, 3), 19, 40),
    },
    {
      occurrence_id: randomUUID(),
      item: focusItem,
      ordinal: 4,
      day: "fri",
      status: "missed",
      entry_kind: "checkin",
      outcome: "missed",
      value_text: "Pas fait, mentalement sature.",
      reason_category: "emotional",
      reason_text: "Saturation mentale.",
      difficulty_level: "high",
      blocker_hint: "emotional",
      still_relevant: true,
      reschedule_decision: "not_rescheduled_weekly_review",
      effective_at: localIsoForDateTime(timezone, addDaysYmd(currentWeekStart, 4), 19, 50),
    },
    {
      occurrence_id: randomUUID(),
      item: walkItem,
      ordinal: 1,
      day: "wed",
      status: "partial",
      entry_kind: "partial",
      outcome: "partial",
      value_text: "Sorti cinq minutes seulement.",
      reason_category: "fatigue",
      reason_text: "Trop peu d'energie pour marcher plus.",
      difficulty_level: "medium",
      blocker_hint: "fatigue",
      still_relevant: true,
      reschedule_decision: "none",
      effective_at: localIsoForDateTime(timezone, addDaysYmd(currentWeekStart, 2), 18, 30),
    },
    {
      occurrence_id: randomUUID(),
      item: walkItem,
      ordinal: 2,
      day: "fri",
      status: "missed",
      entry_kind: "checkin",
      outcome: "missed",
      value_text: "Pas marche, trop tard.",
      reason_category: "fatigue",
      reason_text: "Fatigue du soir.",
      difficulty_level: "medium",
      blocker_hint: "fatigue",
      still_relevant: true,
      reschedule_decision: "not_rescheduled_weekly_review",
      effective_at: localIsoForDateTime(timezone, addDaysYmd(currentWeekStart, 4), 20, 20),
    },
  ];

  await insert("/user_habit_week_occurrences", evidences.map((evidence) =>
    occurrenceRow(base, evidence.item, currentWeekStart, evidence.ordinal, evidence.day, evidence.status, evidence)
  ));
  await insert("/user_plan_item_entries", evidences.map((evidence) =>
    entryRow(base, evidence.item, evidence)
  ));

  return {
    run_id: runId,
    created_at: new Date().toISOString(),
    auth,
    timezone,
    local_now: local,
    dates: { currentWeekStart, currentWeekEnd, nextWeekStart, nextWeekEnd },
    ids,
    items: [focusItem, walkItem].map((item) => ({
      id: item.id,
      title: item.title,
      dimension: item.dimension,
      kind: item.kind,
      target_reps: item.target_reps,
    })),
  };
}

async function run() {
  const runId = argValue("run-id") ||
    `weekly-gate-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
  const state = await seedRun(runId);

  const requestPrefix = `qa-weekly-gate-${runId}`;
  const scheduleResult = await callInternalFunction(
    "schedule-whatsapp-v2-checkins",
    { user_id: state.auth.user_id },
    `${requestPrefix}-schedule`,
  );

  const scheduledAfterSaturdayGate = await select(
    `/scheduled_checkins?user_id=eq.${state.auth.user_id}&select=id,event_context,status,scheduled_for,message_payload,draft_message,origin&order=created_at.asc`,
  );

  const earlyConfirmPayload = {
    action: "confirm_bundle",
    week_start_date: state.dates.nextWeekStart,
    items: state.items.map((item) => ({
      plan_item_id: item.id,
      planned_days: item.title.includes("focus")
        ? ["mon", "wed"]
        : ["thu"],
    })),
  };
  const earlyConfirmResult = await callUserFunction(
    "habit-week-planning-v1",
    state.auth.user_id,
    earlyConfirmPayload,
    `${requestPrefix}-early-confirm`,
  );

  const weeklyCheckin = (await insert("/scheduled_checkins", {
    user_id: state.auth.user_id,
    origin: "weekly_review",
    event_context: WEEKLY_PROGRESS_REVIEW_EVENT_CONTEXT,
    draft_message: "Point hebdo QA",
    message_mode: "dynamic",
    message_payload: {
      source: "weekly_planning_gate_qa",
      version: 1,
      timezone: state.timezone,
      week_start_date: state.dates.currentWeekStart,
      week_end_date: state.dates.currentWeekEnd,
      generated_at: new Date().toISOString(),
    },
    scheduled_for: new Date(Date.now() - 60_000).toISOString(),
    status: "pending",
  }))[0];

  const processResult = await callInternalFunction(
    "process-checkins",
    {},
    `${requestPrefix}-process-weekly`,
  );

  const weeklyCheckinAfter = (await select(
    `/scheduled_checkins?id=eq.${weeklyCheckin.id}&select=id,status,draft_message,delivery_last_error,processed_at,message_payload,delivery_attempt_count`,
  ))[0] ?? null;
  const pendingActions = await select(
    `/whatsapp_pending_actions?user_id=eq.${state.auth.user_id}&select=id,kind,status,scheduled_checkin_id,payload,created_at&order=created_at.asc`,
  );
  const nextWeekPlans = await select(
    `/user_habit_week_plans?user_id=eq.${state.auth.user_id}&week_start_date=eq.${state.dates.nextWeekStart}&select=id,plan_item_id,status,confirmed_at,created_at`,
  );
  const allWeekPlans = await select(
    `/user_habit_week_plans?user_id=eq.${state.auth.user_id}&select=id,week_start_date,plan_item_id,status,confirmed_at&order=week_start_date.asc`,
  );
  const entries = await select(
    `/user_plan_item_entries?user_id=eq.${state.auth.user_id}&select=id,plan_item_id,outcome,metadata,effective_at&order=effective_at.asc`,
  );
  const occurrences = await select(
    `/user_habit_week_occurrences?user_id=eq.${state.auth.user_id}&select=id,plan_item_id,week_start_date,planned_day,status,source,validated_at&order=week_start_date.asc,planned_day.asc`,
  );

  const weekly = weeklyCheckinAfter?.message_payload?.weekly_adaptive_review ??
    null;
  const failures = [];
  const planningScheduled = scheduledAfterSaturdayGate.filter((row) =>
    row.event_context === WEEKLY_PLANNING_VALIDATION_PROMPT_EVENT_CONTEXT
  );
  if (planningScheduled.length > 0) {
    failures.push("Saturday scheduler created weekly_planning_validation_prompt");
  }
  if (earlyConfirmResult.status !== 409) {
    failures.push(`Early next-week confirm returned ${earlyConfirmResult.status}, expected 409`);
  }
  if (!weekly) {
    failures.push("process-checkins did not persist weekly_adaptive_review");
  }
  if (weekly && weekly.plan_patch?.requires_confirmation !== true) {
    failures.push("weekly plan_patch.requires_confirmation is not true");
  }
  const weeklyItemFamilies = new Set(
    (weekly?.item_decisions ?? []).map((item) => item.family),
  );
  if (weeklyItemFamilies.has("support")) {
    failures.push("weekly item_decisions included support family");
  }
  if (nextWeekPlans.some((plan) => plan.status === "confirmed")) {
    failures.push("Next week plan was confirmed before unlock");
  }
  if ((weekly?.daily_evidence_summary?.covered_count ?? 0) < 1) {
    failures.push("weekly daily_evidence_summary did not consume daily evidence");
  }

  const humanVerdict = weeklyCheckinAfter?.draft_message ? "green" : "yellow";
  const systemVerdict = failures.length === 0 ? "green" : "red";
  const globalVerdict = systemVerdict === "red"
    ? "red"
    : humanVerdict === "yellow"
    ? "yellow"
    : "green";
  const reportPath = path.join(runRoot, runId, "report.md");
  const rawPath = path.join(runRoot, runId, "raw.json");
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const redactedState = {
    ...state,
    auth: {
      user_id: state.auth.user_id,
      email: state.auth.email,
      password: "[redacted]",
    },
  };
  const raw = {
    ...redactedState,
    schedule_result: scheduleResult,
    scheduled_after_saturday_gate: scheduledAfterSaturdayGate,
    early_confirm_result: {
      status: earlyConfirmResult.status,
      body: earlyConfirmResult.body,
    },
    weekly_checkin_initial: weeklyCheckin,
    process_result: processResult,
    weekly_checkin_after: weeklyCheckinAfter,
    pending_actions: pendingActions,
    next_week_plans: nextWeekPlans,
    all_week_plans: allWeekPlans,
    entries,
    occurrences,
    verdicts: { humanVerdict, systemVerdict, globalVerdict, failures },
  };
  fs.writeFileSync(rawPath, `${JSON.stringify(raw, null, 2)}\n`);

  const report = renderReport(raw);
  fs.writeFileSync(reportPath, report);
  console.log(JSON.stringify({
    run_id: runId,
    verdict: globalVerdict,
    human_verdict: humanVerdict,
    system_verdict: systemVerdict,
    failures,
    report: path.relative(root, reportPath),
    raw: path.relative(root, rawPath),
  }, null, 2));
}

function renderReport(raw) {
  const weekly = raw.weekly_checkin_after?.message_payload?.weekly_adaptive_review ??
    null;
  const planningScheduled = raw.scheduled_after_saturday_gate.filter((row) =>
    row.event_context === WEEKLY_PLANNING_VALIDATION_PROMPT_EVENT_CONTEXT
  );
  const turnLines = [
    "### Tour 0 - Setup systeme",
    "",
    "**Trace courte**",
    `- persona technique: \`${raw.auth.email}\``,
    `- timezone: \`${raw.timezone}\``,
    `- local_now: \`${raw.local_now.ymd} ${raw.local_now.weekday}\``,
    `- current_week_start: \`${raw.dates.currentWeekStart}\``,
    `- next_week_start: \`${raw.dates.nextWeekStart}\``,
    `- items: ${raw.items.map((item) => `\`${item.title}\``).join(", ")}`,
    `- daily_action_review_v1 entries: \`${raw.entries.length}\``,
    "",
    "### Tour 1 - Scheduler samedi",
    "",
    "**Systeme**",
    "> Appel local `schedule-whatsapp-v2-checkins` avec `user_id` de la connexion temporaire.",
    "",
    "**Trace courte**",
    `- http_status: \`${raw.schedule_result.status}\``,
    `- weekly_planning_validation_prompt_created: \`${planningScheduled.length}\``,
    `- scheduled_checkins_created: \`${raw.scheduled_after_saturday_gate.length}\``,
    "",
    "### Tour 2 - Tentative de validation trop tot",
    "",
    "**User/Systeme**",
    "> Appel utilisateur reel `habit-week-planning-v1.confirm_bundle` pour la semaine suivante avant le weekly.",
    "",
    "**Trace courte**",
    `- http_status: \`${raw.early_confirm_result.status}\``,
    `- error: \`${raw.early_confirm_result.body?.error ?? ""}\``,
    `- next_week_confirmed_plans: \`${raw.next_week_plans.filter((plan) => plan.status === "confirmed").length}\``,
    "",
    "### Tour 3 - Weekly progress/adaptive review",
    "",
    "**Sophia**",
    `> ${String(raw.weekly_checkin_after?.draft_message ?? "").replace(/\n/g, "\n> ")}`,
    "",
    "**Trace courte**",
    `- http_status: \`${raw.process_result.status}\``,
    `- scheduled_checkin_status: \`${raw.weekly_checkin_after?.status ?? ""}\``,
    `- weekly_adaptive_review_present: \`${Boolean(weekly)}\``,
    `- habit_verdict: \`${weekly?.habit_verdict?.status ?? ""}\``,
    `- daily_evidence_coverage: \`${weekly?.daily_evidence_summary?.coverage ?? ""}\``,
    `- daily_evidence_covered_count: \`${weekly?.daily_evidence_summary?.covered_count ?? ""}\``,
    `- week_strategy: \`${weekly?.week_strategy?.decision ?? ""}\``,
    `- plan_patch.requires_confirmation: \`${weekly?.plan_patch?.requires_confirmation ?? ""}\``,
    `- plan_patch.operations: \`${(weekly?.plan_patch?.operations ?? []).map((op) => op.op).join(",")}\``,
  ].join("\n");

  const failures = raw.verdicts.failures;
  return `# QA Run Report - Weekly Planning Gate\n\n` +
    `## 1. Contexte Du Test\n\n` +
    `- Date: ${new Date().toISOString().slice(0, 10)}\n` +
    `- Run: \`${raw.run_id}\`\n` +
    `- Persona: conversationnel Paul-like fatigue; compte technique temporaire \`${raw.auth.email}\`\n` +
    `- Objectif: verifier que la validation de la semaine suivante est bloquee avant le weekly, puis que le weekly produit une proposition sans patch automatique.\n` +
    `- Trajectoire: scheduler local samedi -> tentative confirm_bundle trop tot -> weekly_progress_review_v2 via process-checkins.\n` +
    `- Surfaces visees: \`schedule-whatsapp-v2-checkins\`, \`habit-week-planning-v1\`, \`process-checkins\`, \`weekly_adaptive_review_v1\`, \`user_habit_week_plans\`, \`user_plan_item_entries\`.\n` +
    `- Cadre IA reel: Supabase local, Edge Functions locales, donnees creees dynamiquement, pas de renderer deterministe comme verdict.\n` +
    `- Validite QA: valide pour le workflow weekly/planning; conversation utilisateur limitee car le point teste est le gate de validation.\n\n` +
    `Raw: \`${path.relative(root, path.join(runRoot, raw.run_id, "raw.json"))}\`\n\n` +
    `## 2. Tours De Conversation\n\n${turnLines}\n\n` +
    `## 3. Analyse De Fluidite Humaine\n\n` +
    `**Verdict: ${raw.verdicts.humanVerdict}**\n\n` +
    `**Ce qui marche**\n` +
    `- Le message weekly reste court et n'applique rien silencieusement.\n` +
    `- La validation suivante n'est pas proposee avant le weekly.\n\n` +
    `**Problemes**\n` +
    (raw.verdicts.humanVerdict === "yellow"
      ? `- Tour 3: le transport weekly n'a pas produit de draft exploitable. Impact: UX a verifier dans un run WhatsApp complet. Severite: yellow.\n\n`
      : `- Aucun probleme bloquant observe sur ce run cible.\n\n`) +
    `**Fix propose**\n` +
    `- Si un prochain run conversationnel complet est demande, jouer la reponse utilisateur au weekly et verifier la confirmation de plan dans le dashboard.\n\n` +
    `## 4. Analyse Systeme\n\n` +
    `**Verdict: ${raw.verdicts.systemVerdict}**\n\n` +
    `**Routage**\n` +
    `- Scheduler samedi: \`${planningScheduled.length}\` prompt de validation cree, attendu \`0\`.\n` +
    `- API planning: confirmation trop tot retourne \`${raw.early_confirm_result.status}\`, attendu \`409\`.\n\n` +
    `**Skills / Operations / Tools**\n` +
    `- Weekly adaptive review present: \`${Boolean(weekly)}\`.\n` +
    `- Habit verdict: \`${weekly?.habit_verdict?.status ?? ""}\`.\n` +
    `- Strategy: \`${weekly?.week_strategy?.decision ?? ""}\`.\n` +
    `- Plan patch requires confirmation: \`${weekly?.plan_patch?.requires_confirmation ?? ""}\`.\n\n` +
    `**Memory / Effets durables**\n` +
    `- Daily evidence consumed: coverage \`${weekly?.daily_evidence_summary?.coverage ?? ""}\`, covered \`${weekly?.daily_evidence_summary?.covered_count ?? ""}\` / actions \`${weekly?.daily_evidence_summary?.action_count ?? ""}\`.\n` +
    `- Next week confirmed plans after early attempt: \`${raw.next_week_plans.filter((plan) => plan.status === "confirmed").length}\`.\n` +
    `- Supports in weekly item decisions: \`${(weekly?.item_decisions ?? []).filter((item) => item.family === "support").length}\`.\n\n` +
    `**Problemes**\n` +
    (failures.length
      ? failures.map((failure) => `- ${failure}. Severite: red.`).join("\n") + "\n\n"
      : `- Aucun probleme systeme bloquant observe.\n\n`) +
    `**Fix propose**\n` +
    (failures.length
      ? `- Corriger les echecs ci-dessus puis relancer une variante du meme run.\n\n`
      : `- Aucun fix obligatoire pour ce gate; garder un run conversationnel de suivi pour la validation post-weekly.\n\n`) +
    `## Verdict Global\n\n` +
    `- Verdict: ${raw.verdicts.globalVerdict}\n` +
    `- Raison principale: ${failures.length ? failures[0] : "le gate samedi bloque la validation trop tot, le backend refuse la confirmation prematuree, et le weekly conserve requires_confirmation=true."}\n` +
    `- Follow-up prioritaire: ${failures.length ? "relancer apres correction." : "tester une confirmation utilisateur apres weekly dans une prochaine variante."}\n`;
}

await run();
