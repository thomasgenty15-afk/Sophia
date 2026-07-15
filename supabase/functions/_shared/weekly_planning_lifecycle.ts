import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { computeScheduledForFromLocal } from "./scheduled_checkins.ts";

export const WEEKLY_PLANNING_AUTO_VALIDATION_EVENT_CONTEXT =
  "weekly_planning_auto_validation_v2";
export const WEEKLY_PLANNING_AVAILABLE_DELAY_MS = 2 * 60 * 60 * 1000;
export const WEEKLY_PLANNING_AUTO_VALIDATE_LOCAL_TIME = "07:00";

const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type DayCode = typeof DAY_ORDER[number];

type ActivePlanRow = {
  id: string;
  title?: string | null;
  cycle_id?: string | null;
  transformation_id?: string | null;
};

export type WeekPlanRow = {
  id: string;
  user_id: string;
  cycle_id: string;
  transformation_id: string;
  plan_id: string;
  plan_item_id: string;
  week_start_date: string;
  status: string;
  confirmed_at?: string | null;
  user_plan_items?: WeeklyPlanningItemRow | WeeklyPlanningItemRow[] | null;
};

export type WeeklyPlanningItemRow = {
  id?: string | null;
  title?: string | null;
  kind?: string | null;
  dimension?: string | null;
  description?: string | null;
  target_reps?: number | null;
  scheduled_days?: string[] | null;
  time_of_day?: string | null;
  activation_condition?: Record<string, unknown> | null;
};

export type WeeklyPlanningOccurrenceRow = {
  id: string;
  plan_id: string;
  plan_item_id: string;
  planned_day: DayCode | string;
  ordinal?: number | null;
  status: string;
  source?: string | null;
};

export type WeeklyPlanningSnapshot = {
  week_start_date: string;
  week_end_date: string;
  active_plan_ids: string[];
  plans: WeekPlanRow[];
  pending_plans: WeekPlanRow[];
  confirmed_plans: WeekPlanRow[];
  occurrences: WeeklyPlanningOccurrenceRow[];
  summary_lines: string[];
  has_planning: boolean;
  has_pending: boolean;
  already_confirmed: boolean;
};

function cleanText(value: unknown, fallback = ""): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function parseDateYmd(ymd: string): Date {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

export function addDaysYmd(ymd: string, days: number): string {
  const date = parseDateYmd(ymd);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dayLabel(day: string): string {
  return {
    mon: "lundi",
    tue: "mardi",
    wed: "mercredi",
    thu: "jeudi",
    fri: "vendredi",
    sat: "samedi",
    sun: "dimanche",
  }[day] ?? day;
}

function sortDays(days: string[]): string[] {
  return [...new Set(days)].sort((left, right) =>
    DAY_ORDER.indexOf(left as DayCode) - DAY_ORDER.indexOf(right as DayCode)
  );
}

function listDays(days: string[]): string {
  const labels = sortDays(days).map(dayLabel);
  if (labels.length === 0) return "jour a confirmer";
  if (labels.length === 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} et ${labels.at(-1)}`;
}

function firstPlanItem(value: WeekPlanRow["user_plan_items"]) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function isConfirmedStatus(status: unknown): boolean {
  const value = cleanText(status);
  return value === "confirmed" || value === "auto_applied";
}

export function weeklyPlanningPromptScheduledFor(weeklySentAtIso: string) {
  const sentAtMs = new Date(weeklySentAtIso).getTime();
  const baseMs = Number.isFinite(sentAtMs) ? sentAtMs : Date.now();
  return new Date(baseMs + WEEKLY_PLANNING_AVAILABLE_DELAY_MS).toISOString();
}

export function weeklyPlanningAutoValidationScheduledFor(params: {
  timezone: string;
  promptSentAt: Date;
}): string {
  return computeScheduledForFromLocal({
    timezone: params.timezone,
    dayOffset: 1,
    localTimeHHMM: WEEKLY_PLANNING_AUTO_VALIDATE_LOCAL_TIME,
    now: params.promptSentAt,
  });
}

export async function loadActiveWeeklyPlanning(
  admin: SupabaseClient,
  params: {
    userId: string;
    weekStartDate: string;
  },
): Promise<WeeklyPlanningSnapshot> {
  const weekStartDate = cleanText(params.weekStartDate).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStartDate)) {
    return emptySnapshot(weekStartDate || params.weekStartDate);
  }

  const { data: activePlansData, error: activePlansError } = await admin
    .from("user_plans_v2")
    .select("id,title,cycle_id,transformation_id")
    .eq("user_id", params.userId)
    .eq("status", "active");
  if (activePlansError) throw activePlansError;

  const activePlans = ((activePlansData ?? []) as ActivePlanRow[])
    .filter((row) => cleanText(row.id));
  const activePlanIds = activePlans.map((row) => row.id);
  if (activePlanIds.length === 0) return emptySnapshot(weekStartDate);

  const { data: planRows, error: planError } = await admin
    .from("user_habit_week_plans")
    .select(
      "id,user_id,cycle_id,transformation_id,plan_id,plan_item_id,week_start_date,status,confirmed_at,user_plan_items(id,title,kind,dimension,description,target_reps,scheduled_days,time_of_day,activation_condition)",
    )
    .eq("user_id", params.userId)
    .eq("week_start_date", weekStartDate)
    .in("plan_id", activePlanIds)
    .order("plan_id", { ascending: true });
  if (planError) throw planError;

  const plans = ((planRows ?? []) as unknown as WeekPlanRow[])
    .filter((row) => cleanText(row.status) !== "archived");
  if (plans.length === 0) return emptySnapshot(weekStartDate, activePlanIds);

  const planItemIds = [...new Set(plans.map((row) => row.plan_item_id))];
  const { data: occurrenceRows, error: occurrenceError } = await admin
    .from("user_habit_week_occurrences")
    .select("id,plan_id,plan_item_id,planned_day,ordinal,status,source")
    .eq("user_id", params.userId)
    .eq("week_start_date", weekStartDate)
    .in("plan_id", activePlanIds)
    .in(
      "plan_item_id",
      planItemIds.length > 0
        ? planItemIds
        : ["00000000-0000-0000-0000-000000000000"],
    );
  if (occurrenceError) throw occurrenceError;

  const occurrences = ((occurrenceRows ?? []) as WeeklyPlanningOccurrenceRow[])
    .filter((row) => cleanText(row.status) !== "rescheduled");
  const occurrencesByItem = new Map<string, WeeklyPlanningOccurrenceRow[]>();
  for (const occurrence of occurrences) {
    const list = occurrencesByItem.get(occurrence.plan_item_id) ?? [];
    list.push(occurrence);
    occurrencesByItem.set(occurrence.plan_item_id, list);
  }

  const summaryLines = plans.map((plan) => {
    const planItem = firstPlanItem(plan.user_plan_items);
    const title = cleanText(planItem?.title, "Action");
    const days = (occurrencesByItem.get(plan.plan_item_id) ?? [])
      .map((occurrence) => cleanText(occurrence.planned_day))
      .filter(Boolean);
    return `- ${title} : ${listDays(days)}`;
  });

  const pendingPlans = plans.filter((row) =>
    cleanText(row.status) === "pending_confirmation"
  );
  const confirmedPlans = plans.filter((row) => isConfirmedStatus(row.status));

  return {
    week_start_date: weekStartDate,
    week_end_date: addDaysYmd(weekStartDate, 6),
    active_plan_ids: activePlanIds,
    plans,
    pending_plans: pendingPlans,
    confirmed_plans: confirmedPlans,
    occurrences,
    summary_lines: summaryLines,
    has_planning: plans.length > 0,
    has_pending: pendingPlans.length > 0,
    already_confirmed: plans.length > 0 &&
      plans.every((row) => isConfirmedStatus(row.status)),
  };
}

export async function autoApplyWeeklyPlanning(
  admin: SupabaseClient,
  params: {
    userId: string;
    weekStartDate: string;
    nowIso?: string;
  },
): Promise<{ changed: boolean; planning: WeeklyPlanningSnapshot }> {
  const nowIso = params.nowIso ?? new Date().toISOString();
  const before = await loadActiveWeeklyPlanning(admin, params);
  if (!before.has_planning || !before.has_pending) {
    return { changed: false, planning: before };
  }

  const pendingIds = before.pending_plans.map((row) => row.id);
  const { error: planError } = await admin
    .from("user_habit_week_plans")
    .update({
      status: "auto_applied",
      confirmed_at: nowIso,
      updated_at: nowIso,
    } as any)
    .eq("user_id", params.userId)
    .in("id", pendingIds);
  if (planError) throw planError;

  const { error: occurrenceError } = await admin
    .from("user_habit_week_occurrences")
    .update({
      source: "weekly_confirmed",
      updated_at: nowIso,
    } as any)
    .eq("user_id", params.userId)
    .eq("week_start_date", before.week_start_date)
    .in("plan_id", before.active_plan_ids)
    .eq("source", "default_generated");
  if (occurrenceError) throw occurrenceError;

  const after = await loadActiveWeeklyPlanning(admin, params);
  return { changed: true, planning: after };
}

export function buildWeeklyPlanningAutoValidationMessage(params: {
  summaryLines: string[];
}): string {
  const summary = params.summaryLines.length > 0
    ? params.summaryLines.join("\n")
    : "- Planning de la semaine valide.";
  return [
    "J'ai valide l'organisation proposee pour que tes rappels d'action puissent partir normalement.",
    "",
    "Resume du planning :",
    summary,
    "",
    "Tu peux toujours l'ajuster dans ton espace si besoin.",
  ].join("\n");
}

// Detail sent after the user taps "Oui!" on the auto_validation_v1 template.
// The template already announced the auto-validation, so no generic opener:
// we answer the "tu veux connaître le détail ?" question directly.
export function buildWeeklyPlanningAutoValidationDetailMessage(params: {
  summaryLines: string[];
}): string {
  const summary = params.summaryLines.length > 0
    ? params.summaryLines.join("\n")
    : "- Planning de la semaine valide.";
  return [
    "Voici le detail de ton planning de la semaine 👇",
    "",
    summary,
    "",
    "Tu peux toujours l'ajuster dans ton espace si besoin.",
  ].join("\n");
}

function emptySnapshot(
  weekStartDate: string,
  activePlanIds: string[] = [],
): WeeklyPlanningSnapshot {
  const safeWeekStart = cleanText(weekStartDate).slice(0, 10);
  return {
    week_start_date: safeWeekStart,
    week_end_date: /^\d{4}-\d{2}-\d{2}$/.test(safeWeekStart)
      ? addDaysYmd(safeWeekStart, 6)
      : "",
    active_plan_ids: activePlanIds,
    plans: [],
    pending_plans: [],
    confirmed_plans: [],
    occurrences: [],
    summary_lines: [],
    has_planning: false,
    has_pending: false,
    already_confirmed: false,
  };
}
