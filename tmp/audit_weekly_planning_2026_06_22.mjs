import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const OUT_DIR = path.resolve(
  "tmp/investigation_weekly_planning_2026-06-22",
);
const FROM = "2026-06-21T00:00:00.000Z";
const TO = "2026-06-24T23:59:59.999Z";
const WEEK_START = "2026-06-22";
const TARGET_USERS = new Set([
  "1b7b4127-a0fd-4d3c-ab5b-b33a1cc7c0e9",
  "f40c3cb9-0acf-4afa-8ba5-76e973ffa946",
]);
const PROFILE_SELECT =
  "id,updated_at,timezone,whatsapp_state,whatsapp_opted_in,whatsapp_last_inbound_at,whatsapp_last_outbound_at,onboarding_completed";

function clean(value) {
  return String(value ?? "").trim();
}

function uniq(values) {
  return [...new Set(values.map(clean).filter(Boolean))];
}

function tableUrl(table, params = {}) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

async function rest(table, params = {}) {
  const url = tableUrl(table, params);
  const res = await fetch(url, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      accept: "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${table} ${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : [];
}

async function restMaybe(table, params = {}) {
  try {
    return await rest(table, params);
  } catch (error) {
    return {
      __error: error instanceof Error ? error.message : String(error),
    };
  }
}

function inFilter(values) {
  const ids = uniq(values);
  if (ids.length === 0) return "(00000000-0000-0000-0000-000000000000)";
  return `(${ids.join(",")})`;
}

function eventSet(rows, userId, eventContext) {
  return rows.filter((row) =>
    row.user_id === userId && row.event_context === eventContext
  );
}

function outboundEvents(rows, userId, eventContext) {
  return rows.filter((row) =>
    row.user_id === userId &&
    (row.metadata?.event_context === eventContext ||
      row.metadata?.purpose === eventContext ||
      row.metadata?.purpose === eventContext.replace(/_v2$/, ""))
  );
}

function countBy(rows, keyFn) {
  const out = {};
  for (const row of rows) {
    const key = keyFn(row);
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

function summarizeUser(userId, data) {
  const weekPlans = data.weekPlans.filter((row) => row.user_id === userId);
  const plansById = new Map(data.plans.map((row) => [row.id, row]));
  const activePlanIds = weekPlans
    .map((row) => plansById.get(row.plan_id))
    .filter((plan) => plan?.status === "active")
    .map((plan) => plan.id);
  const confirmedWeekPlans = weekPlans.filter((row) =>
    row.status === "confirmed" || row.status === "auto_applied"
  );
  const activeConfirmedWeekPlans = confirmedWeekPlans.filter((row) =>
    activePlanIds.includes(row.plan_id)
  );
  const occurrences = data.occurrences.filter((row) => row.user_id === userId);
  const activeOccurrences = occurrences.filter((row) =>
    activePlanIds.includes(row.plan_id)
  );

  return {
    user_id: userId,
    profile: data.profiles.find((row) => row.id === userId) ?? null,
    week_plans_count: weekPlans.length,
    week_plans_by_status: countBy(weekPlans, (row) => row.status),
    active_parent_plan_ids: activePlanIds,
    confirmed_week_plans_count: confirmedWeekPlans.length,
    active_confirmed_week_plans_count: activeConfirmedWeekPlans.length,
    occurrence_count: occurrences.length,
    active_occurrence_count: activeOccurrences.length,
    occurrence_statuses: countBy(occurrences, (row) => row.status),
    weekly_progress_review_checkins: eventSet(
      data.checkins,
      userId,
      "weekly_progress_review_v2",
    ),
    weekly_planning_confirmation_checkins: eventSet(
      data.checkins,
      userId,
      "weekly_planning_confirmation_v2",
    ),
    action_morning_checkins: data.checkins.filter((row) =>
      row.user_id === userId &&
      ["action_morning_encouragement_v2", "action_morning_followup_v2"]
        .includes(row.event_context)
    ),
    action_evening_checkins: eventSet(
      data.checkins,
      userId,
      "action_evening_review_v2",
    ),
    weekly_progress_review_outbounds: outboundEvents(
      data.outbounds,
      userId,
      "weekly_progress_review_v2",
    ),
    weekly_planning_confirmation_outbounds: outboundEvents(
      data.outbounds,
      userId,
      "weekly_planning_confirmation_v2",
    ),
  };
}

await mkdir(OUT_DIR, { recursive: true });

const [
  checkins,
  outbounds,
  weekPlans,
  occurrences,
  profilesSeed,
  runtimeEvents,
  systemErrors,
] = await Promise.all([
  rest("scheduled_checkins", {
    select:
      "id,user_id,event_context,origin,status,scheduled_for,created_at,processed_at,delivery_attempt_count,delivery_last_error,delivery_last_error_at,delivery_last_request_id,message_mode,message_payload,draft_message",
    scheduled_for: `gte.${FROM}`,
    and: `(scheduled_for.lte.${TO})`,
    order: "scheduled_for.asc",
    limit: "20000",
  }),
  rest("whatsapp_outbound_messages", {
    select:
      "id,user_id,created_at,updated_at,request_id,message_type,content_preview,status,provider_message_id,attempt_count,last_attempt_at,next_retry_at,last_error_code,last_error_message,metadata",
    created_at: `gte.${FROM}`,
    and: `(created_at.lte.${TO})`,
    order: "created_at.asc",
    limit: "20000",
  }),
  rest("user_habit_week_plans", {
    select:
      "id,user_id,cycle_id,transformation_id,plan_id,plan_item_id,week_start_date,status,confirmed_at,created_at,updated_at",
    week_start_date: `eq.${WEEK_START}`,
    order: "updated_at.asc",
    limit: "20000",
  }),
  rest("user_habit_week_occurrences", {
    select:
      "id,user_id,cycle_id,transformation_id,plan_id,plan_item_id,week_start_date,ordinal,planned_day,actual_day,status,source,validated_at,created_at,updated_at",
    week_start_date: `eq.${WEEK_START}`,
    order: "created_at.asc",
    limit: "30000",
  }),
  rest("profiles", {
    select: PROFILE_SELECT,
    order: "updated_at.asc",
    limit: "20000",
  }),
  restMaybe("conversation_runtime_events", {
    select: "id,user_id,event_type,created_at,metadata,payload",
    created_at: `gte.${FROM}`,
    and: `(created_at.lte.${TO})`,
    order: "created_at.asc",
    limit: "20000",
  }),
  restMaybe("system_errors", {
    select: "*",
    created_at: `gte.${FROM}`,
    and: `(created_at.lte.${TO})`,
    order: "created_at.asc",
    limit: "20000",
  }),
]);

const userIds = uniq([
  ...TARGET_USERS,
  ...checkins.map((row) => row.user_id),
  ...weekPlans.map((row) => row.user_id),
  ...outbounds.map((row) => row.user_id),
]);

const planIds = uniq(weekPlans.map((row) => row.plan_id));
const transformationIds = uniq(weekPlans.map((row) => row.transformation_id));
const cycleIds = uniq(weekPlans.map((row) => row.cycle_id));

const [plans, transformations, cycles, profiles] = await Promise.all([
  rest("user_plans_v2", {
    select:
      "id,user_id,cycle_id,transformation_id,status,title,activated_at,archived_at,created_at,updated_at,content",
    id: `in.${inFilter(planIds)}`,
    limit: "20000",
  }),
  rest("user_transformations", {
    select: "id,cycle_id,status,title,priority_order,activated_at,created_at,updated_at",
    id: `in.${inFilter(transformationIds)}`,
    limit: "20000",
  }),
  rest("user_cycles", {
    select: "id,user_id,status,active_transformation_id,created_at,updated_at",
    id: `in.${inFilter(cycleIds)}`,
    limit: "20000",
  }),
  rest("profiles", {
    select: PROFILE_SELECT,
    id: `in.${inFilter(userIds)}`,
    limit: "20000",
  }).catch(() => profilesSeed.filter((row) => userIds.includes(row.id))),
]);

const data = {
  checkins,
  outbounds,
  weekPlans,
  occurrences,
  profiles,
  plans,
  transformations,
  cycles,
  runtimeEvents,
  systemErrors,
};

const summaries = userIds.map((userId) => summarizeUser(userId, data));
const usersWithWeekPlan = summaries.filter((row) => row.week_plans_count > 0);

const global = {
  generated_at: new Date().toISOString(),
  window: { from: FROM, to: TO, week_start: WEEK_START },
  counts: {
    users_seen: userIds.length,
    users_with_week_plans: usersWithWeekPlan.length,
    scheduled_checkins: checkins.length,
    outbounds: outbounds.length,
    week_plans: weekPlans.length,
    occurrences: occurrences.length,
  },
  checkins_by_event_and_status: countBy(
    checkins,
    (row) => `${row.event_context}:${row.status}`,
  ),
  outbounds_by_purpose_status: countBy(
    outbounds,
    (row) =>
      `${row.metadata?.event_context ?? row.metadata?.purpose ?? "unknown"}:${row.status}`,
  ),
  week_plans_by_status: countBy(weekPlans, (row) => row.status),
  users_missing_weekly_review_checkin: usersWithWeekPlan
    .filter((row) => row.weekly_progress_review_checkins.length === 0)
    .map((row) => row.user_id),
  users_missing_planning_confirmation_checkin: usersWithWeekPlan
    .filter((row) => row.weekly_planning_confirmation_checkins.length === 0)
    .map((row) => row.user_id),
  users_with_weekly_review_cancelled_no_confirmed_occurrences: summaries
    .filter((row) =>
      row.weekly_progress_review_checkins.some((checkin) =>
        checkin.status === "cancelled" &&
        clean(checkin.delivery_last_error) ===
          "weekly_progress_review_no_confirmed_occurrences"
      )
    )
    .map((row) => row.user_id),
};

await Promise.all([
  writeFile(
    path.join(OUT_DIR, "summary.json"),
    JSON.stringify(global, null, 2),
  ),
  writeFile(
    path.join(OUT_DIR, "user_summaries.json"),
    JSON.stringify(summaries, null, 2),
  ),
  writeFile(
    path.join(OUT_DIR, "scheduled_checkins.json"),
    JSON.stringify(checkins, null, 2),
  ),
  writeFile(
    path.join(OUT_DIR, "whatsapp_outbound_messages.json"),
    JSON.stringify(outbounds, null, 2),
  ),
  writeFile(
    path.join(OUT_DIR, "week_plans.json"),
    JSON.stringify(weekPlans, null, 2),
  ),
  writeFile(
    path.join(OUT_DIR, "occurrences.json"),
    JSON.stringify(occurrences, null, 2),
  ),
  writeFile(
    path.join(OUT_DIR, "plans.json"),
    JSON.stringify(plans, null, 2),
  ),
  writeFile(
    path.join(OUT_DIR, "runtime_events.json"),
    JSON.stringify(runtimeEvents, null, 2),
  ),
  writeFile(
    path.join(OUT_DIR, "system_errors.json"),
    JSON.stringify(systemErrors, null, 2),
  ),
]);

console.log(JSON.stringify(global, null, 2));
