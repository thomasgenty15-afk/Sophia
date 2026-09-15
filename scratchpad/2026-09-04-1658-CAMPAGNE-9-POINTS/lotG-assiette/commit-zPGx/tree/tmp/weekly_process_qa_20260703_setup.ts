// QA setup: seed a coherent weekly fixture user, then leave a PENDING weekly
// scheduled_checkin so that the REAL process-checkins path produces Tour 0.
// Does NOT pre-generate the opening, does NOT activate the skill state:
// process-checkins must do all of that (real AI proactive weekly opening).
import { createClient } from "jsr:@supabase/supabase-js@2.87.3";
import {
  currentWeekStartForTimezone,
  weekEndForWeekStart,
} from "../supabase/functions/_shared/weekly_progress_review.ts";

const root = new TextDecoder().decode(
  new Deno.Command("git", {
    args: ["rev-parse", "--show-toplevel"],
    stdout: "piped",
  }).outputSync().stdout,
).trim();

const runRoot = `${root}/tmp/weekly-real-conversation-qa`;
const connectionRoot = `${runRoot}/connections`;
const timezone = "Europe/Paris";
const password = "1234567";

function argValue(name: string, fallback = ""): string {
  const prefixed = `--${name}=`;
  const direct = Deno.args.find((a) => a.startsWith(prefixed));
  if (direct) return direct.slice(prefixed.length);
  const index = Deno.args.indexOf(`--${name}`);
  if (index >= 0) return Deno.args[index + 1] ?? fallback;
  return fallback;
}

function safeRunPart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 80);
}

function ymdAdd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10);
}

function dayOffset(day: string): number {
  return ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].indexOf(day);
}

async function writeJson(path: string, value: unknown) {
  await Deno.mkdir(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  await Deno.writeTextFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function loadSupabaseStatus(): Record<string, string> {
  const envText = [
    `${root}/frontend/.env.local`,
    `${root}/supabase/.env`,
  ].map((p) => {
    try {
      return Deno.readTextFileSync(p);
    } catch {
      return "";
    }
  }).join("\n");
  const env: Record<string, string> = {};
  for (const line of envText.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
  return {
    API_URL: Deno.env.get("SUPABASE_URL") ?? env.SUPABASE_URL ??
      env.VITE_SUPABASE_URL ?? "http://127.0.0.1:54321",
    SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
      env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  };
}

async function must<T>(
  label: string,
  promise: PromiseLike<{ data: T; error: unknown }>,
): Promise<T> {
  const { data, error } = await promise;
  if (error) throw new Error(`${label}: ${JSON.stringify(error)}`);
  return data;
}

// partial_habits_mission_partial variant: done / partial / missed mix.
type Spec = {
  itemKey: "habit_positive" | "habit_breath" | "mission_signal";
  day: string;
  outcome: "completed" | "partial" | "missed";
  reasonCategory: string;
  reasonText: string;
  stillRelevant: boolean;
  rescheduleDecision: string;
};
const specs: Spec[] = [
  { itemKey: "habit_positive", day: "mon", outcome: "completed", reasonCategory: "none", reasonText: "fait comme prevu", stillRelevant: true, rescheduleDecision: "none" },
  { itemKey: "habit_positive", day: "wed", outcome: "partial", reasonCategory: "fatigue", reasonText: "commence mais trop fatigue", stillRelevant: true, rescheduleDecision: "carry_over" },
  { itemKey: "habit_positive", day: "fri", outcome: "missed", reasonCategory: "too_hard", reasonText: "trop lourd en fin de semaine", stillRelevant: true, rescheduleDecision: "carry_over" },
  { itemKey: "habit_breath", day: "tue", outcome: "completed", reasonCategory: "none", reasonText: "fait comme prevu", stillRelevant: true, rescheduleDecision: "none" },
  { itemKey: "habit_breath", day: "thu", outcome: "missed", reasonCategory: "fatigue", reasonText: "zappe en rentrant tard", stillRelevant: true, rescheduleDecision: "carry_over" },
  { itemKey: "mission_signal", day: "fri", outcome: "partial", reasonCategory: "context", reasonText: "message brouillon fait mais pas envoye", stillRelevant: true, rescheduleDecision: "carry_over" },
];

function statusForOutcome(outcome: string): string {
  if (outcome === "completed") return "done";
  if (outcome === "missed") return "missed";
  return "planned";
}

const status = loadSupabaseStatus();
const serviceKey = status.SERVICE_ROLE_KEY;
if (!serviceKey) throw new Error("missing service role key");
const admin = createClient(status.API_URL, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const runPrefix = safeRunPart(argValue("run-prefix", "weekly-process-qa"));
const variant = "partial_habits_mission_partial";
const runId = `${runPrefix}-${variant}`;
const weekStartDate = argValue(
  "week-start",
  currentWeekStartForTimezone(timezone, new Date()),
);

const email = `qa-weekly-process-${runPrefix}-${variant}@example.com`;
const created = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: "QA Weekly Process", timezone, is_test_persona: true, temporary_qa_connection: true },
  app_metadata: { is_test_persona: true, temporary_qa_connection: true },
});
if (created.error) throw new Error(`auth_create_user_failed: ${created.error.message}`);
const userId = created.data?.user?.id;
if (!userId) throw new Error("auth_create_user_missing_id");

const now = new Date();
const nowIso = now.toISOString();
const lastInbound = new Date(now.getTime() - 30 * 60 * 1000).toISOString(); // 30 min ago -> in 24h window
const oldOutbound = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString();
const scope = "whatsapp"; // skill state is activated by process-checkins under scope=whatsapp
const phoneSuffix = Math.floor(Math.random() * 9000000 + 1000000);

await must("upsert_profile", admin.from("profiles").upsert({
  id: userId,
  full_name: "QA Weekly Process",
  onboarding_completed: true,
  timezone,
  locale: "fr-FR",
  access_tier: "alliance",
  whatsapp_opted_in: true,
  whatsapp_bilan_opted_in: true,
  whatsapp_last_inbound_at: lastInbound,
  whatsapp_last_outbound_at: oldOutbound,
  phone_number: `+1555${phoneSuffix}`,
  phone_verified_at: nowIso,
  updated_at: nowIso,
}, { onConflict: "id" }).select("id").single());

const cycleId = crypto.randomUUID();
const transformationId = crypto.randomUUID();
const planId = crypto.randomUUID();

await must("insert_cycle", admin.from("user_cycles").insert({
  id: cycleId,
  user_id: userId,
  status: "active",
  raw_intake_text: "QA weekly process fixture: retrouver un rythme plus stable sans surcharger la semaine.",
  intake_language: "fr",
  duration_months: 1,
  version: 1,
  created_at: nowIso,
  updated_at: nowIso,
}).select("id").single());

await must("insert_transformation", admin.from("user_transformations").insert({
  id: transformationId,
  cycle_id: cycleId,
  priority_order: 1,
  status: "active",
  title: "Stabiliser le rythme de fin de journee",
  internal_summary: "Fixture QA pour weekly adaptive review (process-checkins).",
  user_summary: "Installer un rythme simple en fin de journee.",
  success_definition: "Tenir deux habitudes legeres et une mission de coordination.",
  main_constraint: "Fatigue et charge du soir.",
  activated_at: nowIso,
  created_at: nowIso,
  updated_at: nowIso,
}).select("id").single());

await must("update_cycle_active_transformation", admin.from("user_cycles")
  .update({ active_transformation_id: transformationId, updated_at: nowIso })
  .eq("id", cycleId).select("id").single());

await must("insert_plan", admin.from("user_plans_v2").insert({
  id: planId,
  user_id: userId,
  cycle_id: cycleId,
  transformation_id: transformationId,
  status: "active",
  version: 1,
  title: "Semaine 1 - rythme simple",
  content: { source: "weekly_process_qa_setup", week_start_date: weekStartDate },
  activated_at: nowIso,
  created_at: nowIso,
  updated_at: nowIso,
}).select("id").single());

const itemIds: Record<string, string> = {
  habit_positive: crypto.randomUUID(),
  habit_breath: crypto.randomUUID(),
  mission_signal: crypto.randomUUID(),
  support_context: crypto.randomUUID(),
};
const items = [
  { id: itemIds.habit_positive, dimension: "habits", kind: "habit", title: "Partager un point positif", tracking_type: "boolean", target_reps: 3, scheduled_days: ["mon", "wed", "fri"], cadence_label: "3x/semaine", current_habit_state: "active_building", support_mode: null, support_function: null },
  { id: itemIds.habit_breath, dimension: "habits", kind: "habit", title: "Respiration de pause", tracking_type: "boolean", target_reps: 2, scheduled_days: ["tue", "thu"], cadence_label: "2x/semaine", current_habit_state: "active_building", support_mode: null, support_function: null },
  { id: itemIds.mission_signal, dimension: "missions", kind: "task", title: "Convenir d'un signal de pause", tracking_type: "milestone", target_reps: 1, scheduled_days: ["fri"], cadence_label: "mission ponctuelle", current_habit_state: null, support_mode: null, support_function: null },
  { id: itemIds.support_context, dimension: "support", kind: "framework", title: "Fiche support: repere de fatigue", tracking_type: "text", target_reps: null, scheduled_days: null, cadence_label: null, current_habit_state: null, support_mode: "always_available", support_function: "understanding" },
];
await must("insert_plan_items", admin.from("user_plan_items").insert(items.map((item, index) => ({
  id: item.id,
  user_id: userId,
  cycle_id: cycleId,
  transformation_id: transformationId,
  plan_id: planId,
  dimension: item.dimension,
  kind: item.kind,
  status: "active",
  title: item.title,
  description: item.title,
  tracking_type: item.tracking_type,
  activation_order: index + 1,
  current_habit_state: item.current_habit_state,
  support_mode: item.support_mode,
  support_function: item.support_function,
  target_reps: item.target_reps,
  current_reps: 0,
  cadence_label: item.cadence_label,
  scheduled_days: item.scheduled_days,
  payload: { source: "weekly_process_qa_setup", variant },
  activated_at: nowIso,
  created_at: nowIso,
  updated_at: nowIso,
}))).select("id"));

const confirmedItems = items.filter((i) => i.dimension !== "support");
await must("insert_week_plans", admin.from("user_habit_week_plans").insert(
  confirmedItems.map((item) => ({
    user_id: userId,
    cycle_id: cycleId,
    transformation_id: transformationId,
    plan_id: planId,
    plan_item_id: item.id,
    week_start_date: weekStartDate,
    status: "confirmed",
    confirmed_at: nowIso,
    created_at: nowIso,
    updated_at: nowIso,
  })),
).select("id"));

const occurrenceRows = specs.map((spec, index) => ({
  id: crypto.randomUUID(),
  user_id: userId,
  cycle_id: cycleId,
  transformation_id: transformationId,
  plan_id: planId,
  plan_item_id: itemIds[spec.itemKey],
  week_start_date: weekStartDate,
  ordinal: index + 1,
  default_day: spec.day,
  planned_day: spec.day,
  original_planned_day: spec.day,
  actual_day: spec.day,
  status: statusForOutcome(spec.outcome),
  source: "weekly_confirmed",
  validated_at: spec.outcome === "completed" ? nowIso : null,
  created_at: nowIso,
  updated_at: nowIso,
}));
await must("insert_occurrences", admin.from("user_habit_week_occurrences")
  .insert(occurrenceRows).select("id"));

const entryRows = specs.map((spec, index) => {
  const effectiveDate = ymdAdd(weekStartDate, dayOffset(spec.day));
  return {
    user_id: userId,
    cycle_id: cycleId,
    transformation_id: transformationId,
    plan_id: planId,
    plan_item_id: itemIds[spec.itemKey],
    entry_kind: "checkin",
    outcome: spec.outcome,
    value_text: spec.reasonText,
    difficulty_level: spec.outcome === "completed" ? "low" : "medium",
    blocker_hint: spec.reasonCategory,
    effective_at: `${effectiveDate}T19:00:00.000Z`,
    created_at: nowIso,
    metadata: {
      source: "daily_action_review_v1",
      skill_id: "daily_action_review_v1",
      occurrence_id: occurrenceRows[index].id,
      occurrence_status: occurrenceRows[index].status,
      reason_category: spec.reasonCategory,
      reason_text: spec.reasonText,
      matched_user_text: spec.reasonText,
      still_relevant: spec.stillRelevant,
      reschedule_decision: spec.rescheduleDecision,
      confidence: "high",
      outcome_source: "qa_fixture",
    },
  };
});
await must("insert_entries", admin.from("user_plan_item_entries").insert(entryRows).select("id"));

// Leave a PENDING weekly checkin so process-checkins produces Tour 0.
const scheduledCheckinId = crypto.randomUUID();
await must("insert_scheduled_checkin", admin.from("scheduled_checkins").insert({
  id: scheduledCheckinId,
  user_id: userId,
  event_context: "weekly_progress_review_v2",
  origin: "weekly_review",
  status: "pending",
  scheduled_for: new Date(now.getTime() - 2 * 60 * 1000).toISOString(),
  message_mode: "static",
  draft_message: "",
  message_payload: {
    source: "weekly_process_qa_setup",
    week_start_date: weekStartDate,
    dashboard_url: "http://localhost:5173/dashboard",
  },
  delivery_attempt_count: 0,
}).select("id").single());

const connectionPath = `${connectionRoot}/${runId}.json`;
await writeJson(connectionPath, {
  user_id: userId,
  email,
  password,
  scope,
  persona: "qa-weekly-process",
  is_temporary_qa_connection: true,
});

const setupPath = `${runRoot}/${runId}/setup.json`;
await writeJson(setupPath, {
  run_id: runId,
  variant,
  user_id: userId,
  email,
  scope,
  connection_file: connectionPath.replace(`${root}/`, ""),
  week_start_date: weekStartDate,
  week_end_date: weekEndForWeekStart(weekStartDate),
  scheduled_checkin_id: scheduledCheckinId,
  cycle_id: cycleId,
  transformation_id: transformationId,
  plan_id: planId,
  item_ids: itemIds,
  seeded_actions: specs.map((s) => ({ item: s.itemKey, day: s.day, outcome: s.outcome, reason: s.reasonCategory })),
});

console.log(JSON.stringify({
  run_id: runId,
  user_id: userId,
  email,
  scope,
  week_start_date: weekStartDate,
  week_end_date: weekEndForWeekStart(weekStartDate),
  scheduled_checkin_id: scheduledCheckinId,
  connection_file: connectionPath.replace(`${root}/`, ""),
  setup_file: setupPath.replace(`${root}/`, ""),
}, null, 2));
