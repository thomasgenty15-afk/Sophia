import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { computeScheduledForFromLocal } from "./scheduled_checkins.ts";

export const ONBOARDING_WEEK1_VALIDATION_PROMPT_EVENT_CONTEXT =
  "onboarding_week1_validation_prompt_v1";
export const ONBOARDING_WEEK1_AUTO_VALIDATION_EVENT_CONTEXT =
  "onboarding_week1_auto_validation_v1";

export const ONBOARDING_WEEK1_PROMPT_DELAY_MS = 2 * 60 * 60 * 1000;
export const ONBOARDING_WEEK1_SILENCE_MS = 20 * 60 * 1000;
export const ONBOARDING_WEEK1_AUTO_VALIDATE_LOCAL_TIME = "07:00";

const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type DayCode = typeof DAY_ORDER[number];

type WeekPlanRow = {
  id: string;
  user_id: string;
  cycle_id: string;
  transformation_id: string;
  plan_id: string;
  plan_item_id: string;
  week_start_date: string;
  status: string;
  confirmed_at?: string | null;
  user_plan_items?: UserPlanItemRow | UserPlanItemRow[] | null;
};

type UserPlanItemRow = {
  id?: string | null;
  title?: string | null;
  kind?: string | null;
  dimension?: string | null;
};

type OccurrenceRow = {
  id: string;
  plan_item_id: string;
  planned_day: DayCode | string;
  status: string;
};

function cleanText(value: unknown, fallback = ""): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function cleanYmd(value: unknown): string | null {
  const text = cleanText(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  return text;
}

function parseIsoMs(value: unknown): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function parseDateYmd(ymd: string): Date {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function addDaysYmd(ymd: string, days: number): string {
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

function isConfirmedStatus(status: unknown): boolean {
  const value = cleanText(status);
  return value === "confirmed" || value === "auto_applied";
}

function firstPlanItem(
  value: WeekPlanRow["user_plan_items"],
): UserPlanItemRow | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function isOnboardingCompleteForWeek1Validation(profile: {
  onboarding_completed?: unknown;
  whatsapp_state?: unknown;
}): boolean {
  if (profile.onboarding_completed !== true) return false;
  const state = cleanText(profile.whatsapp_state);
  if (!state) return true;
  return !state.startsWith("onboarding_") &&
    !state.startsWith("awaiting_plan_finalization") &&
    !state.startsWith("awaiting_onboarding_") &&
    !state.startsWith("awaiting_plan_motivation") &&
    state !== "awaiting_personal_fact";
}

export function nextAllowedAfterRecentWhatsappInteraction(profile: {
  whatsapp_last_inbound_at?: unknown;
  whatsapp_last_outbound_at?: unknown;
}, now = new Date()): string | null {
  const inboundMs = parseIsoMs(profile.whatsapp_last_inbound_at);
  const outboundMs = parseIsoMs(profile.whatsapp_last_outbound_at);
  const lastMs = Math.max(inboundMs ?? -Infinity, outboundMs ?? -Infinity);
  if (!Number.isFinite(lastMs)) return null;
  const allowedAtMs = lastMs + ONBOARDING_WEEK1_SILENCE_MS;
  if (allowedAtMs <= now.getTime()) return null;
  return new Date(allowedAtMs).toISOString();
}

export async function loadOnboardingWeek1Planning(
  admin: SupabaseClient,
  params: {
    userId: string;
    planId: string;
    targetWeekStartDate?: string | null;
  },
): Promise<{
  week_start_date: string | null;
  week_end_date: string | null;
  plans: WeekPlanRow[];
  occurrences: OccurrenceRow[];
  already_confirmed: boolean;
  has_planning: boolean;
  summary_lines: string[];
}> {
  const { data: planRows, error: planError } = await admin
    .from("user_habit_week_plans")
    .select(
      "id,user_id,cycle_id,transformation_id,plan_id,plan_item_id,week_start_date,status,confirmed_at,user_plan_items(id,title,kind,dimension)",
    )
    .eq("user_id", params.userId)
    .eq("plan_id", params.planId)
    .order("week_start_date", { ascending: true });
  if (planError) throw planError;

  const allPlans = ((planRows ?? []) as unknown as WeekPlanRow[])
    .filter((row) => cleanText(row.week_start_date));
  const targetWeekStart = cleanYmd(params.targetWeekStartDate);
  const firstWeekStart = targetWeekStart ??
    cleanText(allPlans[0]?.week_start_date).slice(0, 10);
  if (!firstWeekStart) {
    return {
      week_start_date: null,
      week_end_date: null,
      plans: [],
      occurrences: [],
      already_confirmed: false,
      has_planning: false,
      summary_lines: [],
    };
  }

  const plans = allPlans.filter((row) =>
    cleanText(row.week_start_date).slice(0, 10) === firstWeekStart
  );
  const planItemIds = [...new Set(plans.map((row) => row.plan_item_id))];
  const { data: occurrenceRows, error: occurrenceError } = await admin
    .from("user_habit_week_occurrences")
    .select("id,plan_item_id,planned_day,status")
    .eq("user_id", params.userId)
    .eq("plan_id", params.planId)
    .eq("week_start_date", firstWeekStart)
    .in(
      "plan_item_id",
      planItemIds.length > 0
        ? planItemIds
        : ["00000000-0000-0000-0000-000000000000"],
    );
  if (occurrenceError) throw occurrenceError;

  const occurrences = ((occurrenceRows ?? []) as OccurrenceRow[])
    .filter((row) => cleanText(row.status) !== "rescheduled");
  const occurrencesByItem = new Map<string, OccurrenceRow[]>();
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

  return {
    week_start_date: firstWeekStart,
    week_end_date: addDaysYmd(firstWeekStart, 6),
    plans,
    occurrences,
    already_confirmed: plans.length > 0 &&
      plans.every((row) => isConfirmedStatus(row.status)),
    has_planning: plans.length > 0,
    summary_lines: summaryLines,
  };
}

export async function autoConfirmOnboardingWeek1Planning(
  admin: SupabaseClient,
  params: {
    userId: string;
    planId: string;
    nowIso?: string;
    targetWeekStartDate?: string | null;
  },
): Promise<{
  changed: boolean;
  planning: Awaited<ReturnType<typeof loadOnboardingWeek1Planning>>;
}> {
  const nowIso = params.nowIso ?? new Date().toISOString();
  const before = await loadOnboardingWeek1Planning(admin, params);
  if (
    !before.has_planning || before.already_confirmed || !before.week_start_date
  ) {
    return { changed: false, planning: before };
  }

  const { error: planError } = await admin
    .from("user_habit_week_plans")
    .update({
      status: "auto_applied",
      confirmed_at: nowIso,
      updated_at: nowIso,
    } as any)
    .eq("user_id", params.userId)
    .eq("plan_id", params.planId)
    .eq("week_start_date", before.week_start_date);
  if (planError) throw planError;

  const { error: occurrenceError } = await admin
    .from("user_habit_week_occurrences")
    .update({
      source: "weekly_confirmed",
      updated_at: nowIso,
    } as any)
    .eq("user_id", params.userId)
    .eq("plan_id", params.planId)
    .eq("week_start_date", before.week_start_date)
    .eq("source", "default_generated");
  if (occurrenceError) throw occurrenceError;

  const after = await loadOnboardingWeek1Planning(admin, params);
  return { changed: true, planning: after };
}

export function buildOnboardingWeek1ValidationPromptMessage(): string {
  return [
    "Ton plan est pret.",
    "",
    "Il te reste juste a valider ta premiere semaine sur la plateforme.",
    "Tu la trouveras dans le niveau 2 du plan, tout en haut de la semaine 1.",
  ].join("\n");
}

export function buildOnboardingWeek1AutoValidationMessage(params: {
  summaryLines: string[];
}): string {
  const summary = params.summaryLines.length > 0
    ? params.summaryLines.join("\n")
    : "- Planning de la semaine 1 valide.";
  return [
    "Je n'ai pas vu de validation du planning sur ton espace, donc j'ai pris la liberte de valider ta premiere semaine.",
    "",
    "Resume du planning :",
    summary,
    "",
    "Tu peux toujours le modifier dans ton espace si tu veux l'ajuster.",
  ].join("\n");
}

export function onboardingWeek1AutoValidationScheduledFor(params: {
  timezone: string;
  activatedAt: Date;
}): string {
  return computeScheduledForFromLocal({
    timezone: params.timezone,
    dayOffset: 1,
    localTimeHHMM: ONBOARDING_WEEK1_AUTO_VALIDATE_LOCAL_TIME,
    now: params.activatedAt,
  });
}
