import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { computeScheduledForFromLocal } from "./scheduled_checkins.ts";

export const ACTION_MORNING_EVENT_CONTEXT = "action_morning_encouragement_v2";
export const MORNING_LIGHT_GREETING_EVENT_CONTEXT = "morning_light_greeting_v2";
export const ACTION_EVENING_REVIEW_EVENT_CONTEXT = "action_evening_review_v2";

export const ACTION_EVENING_DONE_ID = "ACTION_DONE";
export const ACTION_EVENING_PARTIAL_ID = "ACTION_PARTIAL";
export const ACTION_EVENING_MISSED_ID = "ACTION_MISSED";

export const ACTION_EVENING_REVIEW_BUTTONS = [
  { id: ACTION_EVENING_DONE_ID, title: "Fait" },
  { id: ACTION_EVENING_PARTIAL_ID, title: "Partiel" },
  { id: ACTION_EVENING_MISSED_ID, title: "Pas fait" },
] as const;

const DAY_CODES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type DayCode = typeof DAY_CODES[number];

const ACTION_ITEM_STATUSES = new Set(["active", "in_maintenance", "stalled"]);
const OPEN_OCCURRENCE_STATUSES = new Set(["planned", "rescheduled"]);
const CONFIRMED_WEEK_STATUSES = new Set(["confirmed", "auto_applied"]);

type ActiveCycleRow = {
  id: string;
  active_transformation_id?: string | null;
};

type TransformationRow = {
  id: string;
  title?: string | null;
  priority_order?: number | null;
  activated_at?: string | null;
  updated_at?: string | null;
};

type PlanRow = {
  id: string;
  cycle_id: string;
  transformation_id: string;
  title?: string | null;
  activated_at?: string | null;
  updated_at?: string | null;
};

type PlanItemRow = {
  id: string;
  plan_id: string;
  transformation_id: string;
  title: string;
  dimension: string;
  kind: string;
  status: string;
  time_of_day?: string | null;
};

type OccurrenceRow = {
  id: string;
  cycle_id: string;
  transformation_id: string;
  plan_id: string;
  plan_item_id: string;
  week_start_date: string;
  ordinal: number;
  planned_day: string;
  status: string;
  source: string;
  validated_at?: string | null;
};

export type TodayActionOccurrence = {
  occurrence_id: string;
  cycle_id: string;
  transformation_id: string;
  plan_id: string;
  plan_item_id: string;
  title: string;
  dimension: string;
  kind: string;
  planned_day: DayCode;
  status: string;
  source: string;
};

export type TodayActionTransformation = {
  transformation_id: string;
  transformation_title: string;
  plan_id: string;
  plan_title: string;
  occurrences: TodayActionOccurrence[];
};

export type TodayActionOccurrenceSchedule = {
  local_date: string;
  week_start_date: string;
  weekday: DayCode;
  timezone: string;
  scheduled_for: string;
  transformations: TodayActionTransformation[];
};

function cleanText(value: unknown, fallback = ""): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function parseDateYmd(ymd: string): Date {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function formatYmd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function localDateYmdInTimezone(
  timezoneRaw: unknown,
  now = new Date(),
): string {
  const timezone = cleanText(timezoneRaw, "Europe/Paris");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) =>
    String(parts.find((part) => part.type === type)?.value ?? "").padStart(
      2,
      "0",
    );
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function weekdayKeyForLocalDate(localDate: string): DayCode {
  const day = parseDateYmd(localDate).getUTCDay();
  if (day === 0) return "sun";
  return DAY_CODES[day - 1] ?? "mon";
}

export function mondayWeekStartForLocalDate(localDate: string): string {
  const date = parseDateYmd(localDate);
  const dow = date.getUTCDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  date.setUTCDate(date.getUTCDate() + mondayOffset);
  return formatYmd(date);
}

function localDateParity(localDate: string): number {
  const dayIndex = Math.floor(parseDateYmd(localDate).getTime() / 86_400_000);
  return Math.abs(dayIndex) % 2;
}

function sortTransformations(
  cycle: ActiveCycleRow,
  transformations: TransformationRow[],
): TransformationRow[] {
  return transformations.slice().sort((left, right) => {
    if (cycle.active_transformation_id) {
      if (left.id === cycle.active_transformation_id) return -1;
      if (right.id === cycle.active_transformation_id) return 1;
    }
    const orderDelta = Number(left.priority_order ?? 999) -
      Number(right.priority_order ?? 999);
    if (orderDelta !== 0) return orderDelta;
    return String(left.activated_at ?? left.updated_at ?? "").localeCompare(
      String(right.activated_at ?? right.updated_at ?? ""),
    );
  });
}

async function loadActivePlansForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  cycle: ActiveCycleRow | null;
  transformations: TransformationRow[];
  plans: PlanRow[];
}> {
  const cycleResult = await supabase
    .from("user_cycles")
    .select("id, active_transformation_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (cycleResult.error) throw cycleResult.error;

  const cycle = (cycleResult.data as ActiveCycleRow | null) ?? null;
  if (!cycle) return { cycle: null, transformations: [], plans: [] };

  const transformationsResult = await supabase
    .from("user_transformations")
    .select("id,title,priority_order,activated_at,updated_at")
    .eq("cycle_id", cycle.id)
    .eq("status", "active")
    .order("priority_order", { ascending: true });
  if (transformationsResult.error) throw transformationsResult.error;

  const transformations = sortTransformations(
    cycle,
    (transformationsResult.data as TransformationRow[] | null) ?? [],
  );
  if (transformations.length === 0) {
    return { cycle, transformations: [], plans: [] };
  }

  const transformationIds = transformations.map((row) => row.id);
  const plansResult = await supabase
    .from("user_plans_v2")
    .select("id,cycle_id,transformation_id,title,activated_at,updated_at")
    .eq("user_id", userId)
    .eq("cycle_id", cycle.id)
    .eq("status", "active")
    .in("transformation_id", transformationIds)
    .order("activated_at", { ascending: false });
  if (plansResult.error) throw plansResult.error;

  const plansByTransformation = new Map<string, PlanRow>();
  for (const plan of (plansResult.data as PlanRow[] | null) ?? []) {
    if (!plansByTransformation.has(plan.transformation_id)) {
      plansByTransformation.set(plan.transformation_id, plan);
    }
  }

  return {
    cycle,
    transformations,
    plans: transformations
      .map((transformation) => plansByTransformation.get(transformation.id))
      .filter((plan): plan is PlanRow => Boolean(plan)),
  };
}

export async function loadTodayActionOccurrences(
  supabase: SupabaseClient,
  params: {
    userId: string;
    timezone: string;
    localTimeHHMM?: string;
    now?: Date;
  },
): Promise<TodayActionOccurrenceSchedule> {
  const timezone = cleanText(params.timezone, "Europe/Paris");
  const now = params.now ?? new Date();
  const localDate = localDateYmdInTimezone(timezone, now);
  const weekday = weekdayKeyForLocalDate(localDate);
  const weekStart = mondayWeekStartForLocalDate(localDate);
  const scheduledFor = computeScheduledForFromLocal({
    timezone,
    dayOffset: 0,
    localTimeHHMM: params.localTimeHHMM ?? "07:00",
    now,
  });

  const { cycle, transformations, plans } = await loadActivePlansForUser(
    supabase,
    params.userId,
  );
  if (!cycle || plans.length === 0) {
    return {
      local_date: localDate,
      week_start_date: weekStart,
      weekday,
      timezone,
      scheduled_for: scheduledFor,
      transformations: [],
    };
  }

  const planIds = plans.map((plan) => plan.id);
  const occurrencesResult = await supabase
    .from("user_habit_week_occurrences")
    .select(
      "id,cycle_id,transformation_id,plan_id,plan_item_id,week_start_date,ordinal,planned_day,status,source,validated_at",
    )
    .eq("user_id", params.userId)
    .eq("week_start_date", weekStart)
    .eq("planned_day", weekday)
    .in("plan_id", planIds)
    .in("status", [...OPEN_OCCURRENCE_STATUSES]);
  if (occurrencesResult.error) throw occurrencesResult.error;

  const occurrences = (occurrencesResult.data as OccurrenceRow[] | null) ?? [];
  if (occurrences.length === 0) {
    return {
      local_date: localDate,
      week_start_date: weekStart,
      weekday,
      timezone,
      scheduled_for: scheduledFor,
      transformations: [],
    };
  }

  const itemIds = [...new Set(occurrences.map((row) => row.plan_item_id))];
  const [weekPlansResult, itemsResult, entriesResult] = await Promise.all([
    supabase
      .from("user_habit_week_plans")
      .select("plan_item_id,status")
      .eq("user_id", params.userId)
      .eq("week_start_date", weekStart)
      .in("plan_item_id", itemIds),
    supabase
      .from("user_plan_items")
      .select(
        "id,plan_id,transformation_id,title,dimension,kind,status,time_of_day",
      )
      .eq("user_id", params.userId)
      .in("id", itemIds),
    supabase
      .from("user_plan_item_entries")
      .select("plan_item_id,outcome,effective_at")
      .eq("user_id", params.userId)
      .in("plan_item_id", itemIds)
      .gte(
        "effective_at",
        computeScheduledForFromLocal({
          timezone,
          dayOffset: 0,
          localTimeHHMM: "00:00",
          now,
        }),
      )
      .lt(
        "effective_at",
        computeScheduledForFromLocal({
          timezone,
          dayOffset: 1,
          localTimeHHMM: "00:00",
          now,
        }),
      ),
  ]);
  if (weekPlansResult.error) throw weekPlansResult.error;
  if (itemsResult.error) throw itemsResult.error;
  if (entriesResult.error) throw entriesResult.error;

  const confirmedItemIds = new Set(
    ((weekPlansResult.data as
      | Array<{ plan_item_id: string; status: string }>
      | null) ??
      [])
      .filter((row) => CONFIRMED_WEEK_STATUSES.has(String(row.status ?? "")))
      .map((row) => row.plan_item_id),
  );
  const itemsById = new Map(
    ((itemsResult.data as PlanItemRow[] | null) ?? []).map((row) => [
      row.id,
      row,
    ]),
  );
  const alreadyLoggedItemIds = new Set(
    ((entriesResult.data as Array<{ plan_item_id: string }> | null) ?? [])
      .map((row) => row.plan_item_id),
  );

  const transformationById = new Map(
    transformations.map((row) => [row.id, row]),
  );
  const planById = new Map(plans.map((row) => [row.id, row]));
  const grouped = new Map<string, TodayActionTransformation>();

  for (const occurrence of occurrences) {
    if (!confirmedItemIds.has(occurrence.plan_item_id)) continue;
    if (alreadyLoggedItemIds.has(occurrence.plan_item_id)) continue;
    const item = itemsById.get(occurrence.plan_item_id);
    if (!item || !ACTION_ITEM_STATUSES.has(String(item.status ?? ""))) continue;
    const transformation = transformationById.get(occurrence.transformation_id);
    const plan = planById.get(occurrence.plan_id);
    if (!transformation || !plan) continue;

    const key = `${occurrence.transformation_id}:${occurrence.plan_id}`;
    const existing = grouped.get(key) ?? {
      transformation_id: occurrence.transformation_id,
      transformation_title: cleanText(transformation.title, "Transformation"),
      plan_id: occurrence.plan_id,
      plan_title: cleanText(
        plan.title,
        cleanText(transformation.title, "Plan"),
      ),
      occurrences: [],
    };
    existing.occurrences.push({
      occurrence_id: occurrence.id,
      cycle_id: occurrence.cycle_id,
      transformation_id: occurrence.transformation_id,
      plan_id: occurrence.plan_id,
      plan_item_id: occurrence.plan_item_id,
      title: cleanText(item.title, "Action"),
      dimension: cleanText(item.dimension),
      kind: cleanText(item.kind),
      planned_day: weekday,
      status: cleanText(occurrence.status),
      source: cleanText(occurrence.source),
    });
    grouped.set(key, existing);
  }

  return {
    local_date: localDate,
    week_start_date: weekStart,
    weekday,
    timezone,
    scheduled_for: scheduledFor,
    transformations: [...grouped.values()],
  };
}

export async function shouldScheduleLightMorningGreeting(
  supabase: SupabaseClient,
  params: {
    userId: string;
    timezone: string;
    localDate: string;
    now?: Date;
  },
): Promise<boolean> {
  if (localDateParity(params.localDate) !== 0) return false;

  const now = params.now ?? new Date();
  const startIso = computeScheduledForFromLocal({
    timezone: params.timezone,
    dayOffset: 0,
    localTimeHHMM: "00:00",
    now,
  });
  const endIso = computeScheduledForFromLocal({
    timezone: params.timezone,
    dayOffset: 1,
    localTimeHHMM: "00:00",
    now,
  });

  const { data, error } = await supabase
    .from("scheduled_checkins")
    .select("id")
    .eq("user_id", params.userId)
    .eq("event_context", MORNING_LIGHT_GREETING_EVENT_CONTEXT)
    .gte("scheduled_for", startIso)
    .lt("scheduled_for", endIso)
    .in("status", ["pending", "retrying", "awaiting_user", "sent"])
    .limit(1);
  if (error) throw error;
  return (data ?? []).length === 0;
}

function listTitles(schedule: TodayActionOccurrenceSchedule): string[] {
  return schedule.transformations.flatMap((entry) =>
    entry.occurrences.map((occurrence) => occurrence.title)
  );
}

export function buildActionMorningFallbackMessage(
  schedule: TodayActionOccurrenceSchedule,
): string {
  const titles = listTitles(schedule);
  if (titles.length === 0) return "Je te souhaite une bonne journée.";
  if (titles.length === 1) {
    return `Aujourd'hui, garde juste le cap sur "${
      titles[0]
    }". Petit pas propre, journée gagnée.`;
  }
  return `Aujourd'hui, tu as ${titles.length} actions prévues: ${
    titles.slice(0, 3).map((title) => `"${title}"`).join(", ")
  }. On garde ça simple et faisable.`;
}

export function buildActionMorningInstruction(
  schedule: TodayActionOccurrenceSchedule,
): string {
  const count = listTitles(schedule).length;
  return [
    "Message WhatsApp du matin.",
    "Objectif: encourager le user à réaliser les actions prévues aujourd'hui.",
    "Ton: court, concret, chaleureux, pas de bilan, pas de question lourde.",
    `Nombre d'actions prévues: ${count}.`,
    schedule.transformations.length > 1
      ? "Le user a plusieurs transformations actives: regroupe sans faire long."
      : "Le user a une transformation active.",
    "Une seule idée principale, 1 à 3 phrases maximum.",
  ].join("\n");
}

export function buildActionMorningGrounding(
  schedule: TodayActionOccurrenceSchedule,
): string {
  const lines = [
    `local_date=${schedule.local_date}`,
    `weekday=${schedule.weekday}`,
  ];
  for (const transformation of schedule.transformations) {
    lines.push(
      `transformation=${transformation.transformation_title} plan_id=${transformation.plan_id}`,
    );
    for (const occurrence of transformation.occurrences) {
      lines.push(
        `- occurrence_id=${occurrence.occurrence_id} item_id=${occurrence.plan_item_id} title=${occurrence.title}`,
      );
    }
  }
  return lines.join("\n");
}

export function buildLightMorningFallbackMessage(): string {
  return "Je te souhaite une bonne journée. Garde juste un petit point d'appui simple, et on avance.";
}

export function buildLightMorningInstruction(): string {
  return [
    "Message WhatsApp du matin, sans action prévue aujourd'hui.",
    "Objectif: souhaiter une bonne journée avec une présence légère.",
    "Ne propose pas de nouvelle action. Ne demande pas un bilan.",
    "1 à 2 phrases maximum.",
  ].join("\n");
}

export function buildActionEveningReviewMessage(
  schedule: TodayActionOccurrenceSchedule,
): string {
  return buildActionEveningReviewMessageFromTitles(listTitles(schedule));
}

export function buildActionEveningReviewMessageFromTitles(
  titles: string[],
): string {
  if (titles.length === 0) {
    return "Petit check du soir: tu as quelque chose à valider aujourd'hui ?";
  }
  if (titles.length === 1) {
    return `Petit check du soir: pour "${titles[0]}", tu en es où ?`;
  }
  const visible = titles.slice(0, 3).map((title) => `"${title}"`).join(", ");
  const suffix = titles.length > 3 ? ` + ${titles.length - 3} autre(s)` : "";
  return `Petit check du soir: pour tes actions du jour (${visible}${suffix}), tu en es où ?`;
}
