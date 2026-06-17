import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

export const PLAN_WEEK_DAY_CODES = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;
export type PlanWeekDayCode = typeof PLAN_WEEK_DAY_CODES[number];

type PlanContentRecord = Record<string, unknown>;

export type PlanWeekRecommendationItem = {
  id: string;
  plan_id: string;
  dimension?: string | null;
  target_reps?: number | null;
  scheduled_days?: string[] | null;
  payload?: Record<string, unknown> | null;
};

export type PlanWeekRecommendedEntry = {
  plan_item_id: string;
  recommended_days: PlanWeekDayCode[];
  target_reps_override: number | null;
  source_week_order: number;
};

const WEEKDAY_ALIASES: Record<string, PlanWeekDayCode> = {
  mon: "mon",
  monday: "mon",
  lundi: "mon",
  tue: "tue",
  tuesday: "tue",
  mardi: "tue",
  wed: "wed",
  wednesday: "wed",
  mercredi: "wed",
  thu: "thu",
  thursday: "thu",
  jeudi: "thu",
  fri: "fri",
  friday: "fri",
  vendredi: "fri",
  sat: "sat",
  saturday: "sat",
  samedi: "sat",
  sun: "sun",
  sunday: "sun",
  dimanche: "sun",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function cleanYmd(value: unknown): string | null {
  const text = cleanText(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
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

function dayCodeFromYmd(ymd: string): PlanWeekDayCode {
  const day = parseDateYmd(ymd).getUTCDay();
  return day === 0 ? "sun" : PLAN_WEEK_DAY_CODES[day - 1];
}

export function normalizePlanWeekDayCodes(
  days: unknown,
): PlanWeekDayCode[] {
  const values = Array.isArray(days) ? days : [days];
  const unique = new Set<PlanWeekDayCode>();
  for (const raw of values) {
    const normalized = WEEKDAY_ALIASES[cleanText(raw).toLowerCase()];
    if (normalized) unique.add(normalized);
  }
  return [...unique];
}

function targetRepsForItem(
  item: Pick<PlanWeekRecommendationItem, "dimension" | "target_reps">,
  override: number | null,
): number {
  if (typeof override === "number" && Number.isFinite(override)) {
    return Math.max(0, Math.min(7, override));
  }
  if (cleanText(item.dimension) === "habits") {
    return Math.max(0, Math.min(7, Number(item.target_reps ?? 0)));
  }
  return 1;
}

function scheduleAnchor(
  planContent: PlanContentRecord,
): Record<string, unknown> {
  const metadata = isRecord(planContent.metadata) ? planContent.metadata : {};
  return isRecord(metadata.schedule_anchor) ? metadata.schedule_anchor : {};
}

function weekStartForOrder(
  planContent: PlanContentRecord,
  weekOrder: number,
): string | null {
  const anchorWeekStart = cleanYmd(
    scheduleAnchor(planContent).anchor_week_start,
  );
  if (!anchorWeekStart || weekOrder < 1) return null;
  return addDaysYmd(anchorWeekStart, (weekOrder - 1) * 7);
}

function visibleDaysForWeek(
  planContent: PlanContentRecord,
  weekOrder: number,
): PlanWeekDayCode[] {
  const anchor = scheduleAnchor(planContent);
  const weekStart = weekStartForOrder(planContent, weekOrder);
  if (!weekStart) return [...PLAN_WEEK_DAY_CODES];
  const weekEnd = addDaysYmd(weekStart, 6);
  const visibleStart = weekOrder === 1
    ? cleanYmd(anchor.anchor_display_start) ?? weekStart
    : weekStart;

  const days: PlanWeekDayCode[] = [];
  let cursor = parseDateYmd(visibleStart);
  const end = parseDateYmd(weekEnd);
  while (cursor.getTime() <= end.getTime()) {
    days.push(dayCodeFromYmd(cursor.toISOString().slice(0, 10)));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days.length > 0 ? days : [...PLAN_WEEK_DAY_CODES];
}

function generatedTempId(item: PlanWeekRecommendationItem): string | null {
  const generation = isRecord(item.payload?._generation)
    ? item.payload._generation
    : null;
  const tempId = cleanText(generation?.temp_id);
  return tempId || null;
}

function itemDays(args: {
  item: PlanWeekRecommendationItem;
  preferredDays: PlanWeekDayCode[];
  targetRepsOverride: number | null;
}): PlanWeekDayCode[] {
  const preferredDays = normalizePlanWeekDayCodes(args.preferredDays);
  const scheduledDays = normalizePlanWeekDayCodes(args.item.scheduled_days);
  const availableDays = preferredDays.length > 0
    ? preferredDays
    : scheduledDays;
  const target = Math.min(
    targetRepsForItem(args.item, args.targetRepsOverride),
    availableDays.length,
  );
  if (target <= 0) return [];

  if (cleanText(args.item.dimension) !== "habits") {
    const scheduledCandidate = availableDays.find((day) =>
      scheduledDays.includes(day)
    );
    const candidate = scheduledCandidate ?? availableDays[0] ?? null;
    return candidate ? [candidate] : [];
  }

  const alignedScheduledDays = availableDays.filter((day) =>
    scheduledDays.includes(day)
  );
  const days = alignedScheduledDays.length > 0 ? [...alignedScheduledDays] : [];
  for (const day of availableDays) {
    if (days.length >= target) break;
    if (!days.includes(day)) days.push(day);
  }
  return days.slice(0, target);
}

export function recommendedWeekPlanningFromPlanContent(args: {
  planContent: PlanContentRecord | null | undefined;
  planItems: PlanWeekRecommendationItem[];
  targetWeekStartDate: string;
}): PlanWeekRecommendedEntry[] {
  const planContent = isRecord(args.planContent) ? args.planContent : null;
  if (!planContent) return [];
  const runtime = isRecord(planContent.current_level_runtime)
    ? planContent.current_level_runtime
    : null;
  const weeks = Array.isArray(runtime?.weeks) ? runtime.weeks : [];
  if (weeks.length === 0) return [];

  const itemsByTempId = new Map<string, PlanWeekRecommendationItem>();
  for (const item of args.planItems) {
    const tempId = generatedTempId(item);
    if (tempId) itemsByTempId.set(tempId, item);
  }

  const targetWeekStart = cleanYmd(args.targetWeekStartDate);
  if (!targetWeekStart) return [];

  const entries: PlanWeekRecommendedEntry[] = [];
  for (const weekValue of weeks) {
    if (!isRecord(weekValue)) continue;
    const weekOrder = Number(weekValue.week_order);
    if (!Number.isInteger(weekOrder) || weekOrder < 1) continue;
    if (weekStartForOrder(planContent, weekOrder) !== targetWeekStart) {
      continue;
    }

    const assignments = Array.isArray(weekValue.item_assignments)
      ? weekValue.item_assignments.filter(isRecord)
      : [];
    const visibleDays = visibleDaysForWeek(planContent, weekOrder);
    const missionDays = normalizePlanWeekDayCodes(weekValue.mission_days);
    const weekItems = assignments
      .map((assignment) => {
        const tempId = cleanText(assignment.temp_id);
        const item = tempId ? itemsByTempId.get(tempId) : null;
        if (!item) return null;
        return {
          item,
          weeklyReps: typeof assignment.weekly_reps === "number"
            ? Math.max(0, Math.min(7, assignment.weekly_reps))
            : null,
        };
      })
      .filter((
        entry,
      ): entry is {
        item: PlanWeekRecommendationItem;
        weeklyReps: number | null;
      } => Boolean(entry));
    const oneShotItems = weekItems.filter((entry) =>
      cleanText(entry.item.dimension) !== "habits"
    );

    for (const entry of weekItems) {
      const preferredDays = cleanText(entry.item.dimension) === "habits"
        ? visibleDays
        : (() => {
          const oneShotIndex = oneShotItems.findIndex((candidate) =>
            candidate.item.id === entry.item.id
          );
          const mappedDay = oneShotIndex >= 0
            ? missionDays[oneShotIndex]
            : null;
          if (mappedDay && visibleDays.includes(mappedDay)) return [mappedDay];
          const scheduledDays = normalizePlanWeekDayCodes(
            entry.item.scheduled_days,
          );
          return scheduledDays.filter((day) => visibleDays.includes(day));
        })();
      const recommendedDays = itemDays({
        item: entry.item,
        preferredDays,
        targetRepsOverride: entry.weeklyReps,
      });
      if (recommendedDays.length === 0) continue;
      entries.push({
        plan_item_id: entry.item.id,
        recommended_days: recommendedDays,
        target_reps_override: entry.weeklyReps,
        source_week_order: weekOrder,
      });
    }
  }

  return entries;
}

export async function loadRecommendedWeekPlanning(args: {
  admin: SupabaseClient;
  planId: string;
  targetWeekStartDate: string;
}): Promise<PlanWeekRecommendedEntry[]> {
  const { data: planRow, error: planError } = await args.admin
    .from("user_plans_v2")
    .select("content")
    .eq("id", args.planId)
    .maybeSingle();
  if (planError) throw planError;

  const { data: itemRows, error: itemError } = await args.admin
    .from("user_plan_items")
    .select("id,plan_id,dimension,target_reps,scheduled_days,payload")
    .eq("plan_id", args.planId);
  if (itemError) throw itemError;

  return recommendedWeekPlanningFromPlanContent({
    planContent: (planRow as { content?: unknown } | null)?.content as
      | PlanContentRecord
      | null
      | undefined,
    planItems: (itemRows ?? []) as PlanWeekRecommendationItem[],
    targetWeekStartDate: args.targetWeekStartDate,
  });
}
