import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "jsr:@supabase/supabase-js@2";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import {
  jsonResponse,
  parseJsonBody,
  serverError,
  z,
} from "../_shared/http.ts";
import { getRequestContext } from "../_shared/request_context.ts";
import {
  buildWeeklyPlanningConfirmationMessage,
  buildWeeklyPlanningConfirmationPayload,
  type PlanningBundleSnapshot,
  WEEKLY_PLANNING_CONFIRMATION_EVENT_CONTEXT,
} from "../_shared/weekly_planning_confirmation.ts";
import {
  WEEKLY_PLANNING_VALIDATION_PROMPT_EVENT_CONTEXT,
  weeklyPlanningDashboardUrl,
} from "../_shared/weekly_progress_review.ts";

const DAY_CODES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type DayCode = typeof DAY_CODES[number];

type HabitWeekPlanRow = {
  id: string;
  user_id: string;
  cycle_id: string;
  transformation_id: string;
  plan_id: string;
  plan_item_id: string;
  week_start_date: string;
  status: "pending_confirmation" | "confirmed" | "auto_applied";
  default_days?: DayCode[];
  planned_days?: DayCode[];
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
};

type HabitWeekOccurrenceRow = {
  id: string;
  user_id: string;
  cycle_id: string;
  transformation_id: string;
  plan_id: string;
  plan_item_id: string;
  week_start_date: string;
  ordinal: number;
  default_day: DayCode;
  planned_day: DayCode;
  original_planned_day: DayCode | null;
  actual_day: DayCode | null;
  status: "planned" | "done" | "partial" | "missed" | "rescheduled";
  source:
    | "default_generated"
    | "weekly_confirmed"
    | "auto_rescheduled"
    | "manual_change";
  validated_at: string | null;
  created_at: string;
  updated_at: string;
};

function getErrorText(error: unknown): string {
  if (!error || typeof error !== "object") return String(error ?? "");
  const parts = [
    "message",
    "details",
    "hint",
    "code",
  ].map((key) => String((error as Record<string, unknown>)[key] ?? "").trim())
    .filter(Boolean);
  return parts.join(" | ").toLowerCase();
}

function errorMentions(error: unknown, token: string): boolean {
  return getErrorText(error).includes(token.toLowerCase());
}

function normalizePlanRow(
  row: Record<string, unknown> | null,
): HabitWeekPlanRow | null {
  if (!row) return null;
  return {
    ...(row as unknown as HabitWeekPlanRow),
    default_days: normalizeDayCodes(
      row.default_days as string[] | null | undefined,
    ),
    planned_days: normalizeDayCodes(
      row.planned_days as string[] | null | undefined,
    ),
  };
}

function normalizeOccurrenceRows(
  rows: Array<Record<string, unknown>>,
  plan: HabitWeekPlanRow | null,
): HabitWeekOccurrenceRow[] {
  return rows.map((row) => {
    const ordinal = Number(row.ordinal ?? 0);
    const plannedDay = normalizeDayCodes([String(row.planned_day ?? "")])[0] ??
      "mon";
    const defaultDay = normalizeDayCodes([String(row.default_day ?? "")])[0] ??
      plan?.default_days?.[Math.max(0, ordinal - 1)] ??
      plannedDay;
    return {
      ...(row as unknown as HabitWeekOccurrenceRow),
      ordinal,
      default_day: defaultDay,
      planned_day: plannedDay,
      original_planned_day:
        normalizeDayCodes([String(row.original_planned_day ?? "")])[0] ?? null,
      actual_day: normalizeDayCodes([String(row.actual_day ?? "")])[0] ?? null,
    };
  });
}

async function upsertOccurrences(
  admin: SupabaseClient,
  rows: Array<Record<string, unknown>>,
): Promise<void> {
  const { error } = await admin
    .from("user_habit_week_occurrences")
    .upsert(rows, {
      onConflict: "user_id,plan_item_id,week_start_date,ordinal",
    });
  if (!error) return;
  if (errorMentions(error, "default_day")) {
    const legacyRows = rows.map(({ default_day: _defaultDay, ...rest }) =>
      rest
    );
    const { error: legacyError } = await admin
      .from("user_habit_week_occurrences")
      .upsert(legacyRows, {
        onConflict: "user_id,plan_item_id,week_start_date,ordinal",
      });
    if (!legacyError) return;
    throw legacyError;
  }
  throw error;
}

async function insertRescheduleEvent(
  admin: SupabaseClient,
  row: Record<string, unknown>,
): Promise<void> {
  const { error } = await admin
    .from("user_habit_week_reschedule_events")
    .insert(row);
  if (!error) return;
  if (errorMentions(error, "user_habit_week_reschedule_events")) return;
  throw error;
}

type HabitWeekRescheduleEventRow = {
  id: string;
  user_id: string;
  cycle_id: string;
  transformation_id: string;
  plan_id: string;
  plan_item_id: string;
  week_start_date: string;
  occurrence_id: string;
  from_day: DayCode;
  to_day: DayCode;
  reason: "auto_missed" | "manual_reschedule";
  created_at: string;
};

type UserPlanItemRow = {
  id: string;
  user_id: string;
  cycle_id: string;
  transformation_id: string;
  plan_id: string;
  dimension: string;
  target_reps: number | null;
  scheduled_days: string[] | null;
  title: string;
  status: string;
};

const BUNDLE_ITEM_SCHEMA = z.object({
  plan_item_id: z.string().uuid(),
  preferred_days: z.array(z.enum(DAY_CODES)).max(7).optional(),
  target_reps_override: z.number().int().min(0).max(7).optional(),
});

const REQUEST_SCHEMA = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("get_state"),
    plan_item_id: z.string().uuid(),
    current_week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    next_week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    preferred_days: z.array(z.enum(DAY_CODES)).max(7).optional(),
    target_reps_override: z.number().int().min(0).max(7).optional(),
  }),
  z.object({
    action: z.literal("confirm_week"),
    plan_item_id: z.string().uuid(),
    week_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    planned_days: z.array(z.enum(DAY_CODES)).max(7),
    target_reps_override: z.number().int().min(0).max(7).optional(),
  }),
  z.object({
    action: z.literal("validate_occurrence"),
    plan_item_id: z.string().uuid(),
    occurrence_id: z.string().uuid(),
    decision: z.enum(["done", "missed", "reschedule"]),
    target_day: z.enum(DAY_CODES).optional(),
    actual_day: z.enum(DAY_CODES).optional(),
    current_day: z.enum(DAY_CODES).optional(),
    current_week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    next_week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    target_reps_override: z.number().int().min(0).max(7).optional(),
  }),
  z.object({
    action: z.literal("get_bundle_state"),
    week_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    items: z.array(BUNDLE_ITEM_SCHEMA).min(1).max(24),
  }),
  z.object({
    action: z.literal("confirm_bundle"),
    week_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    items: z.array(z.object({
      plan_item_id: z.string().uuid(),
      planned_days: z.array(z.enum(DAY_CODES)).max(7),
      target_reps_override: z.number().int().min(0).max(7).optional(),
    })).min(1).max(24),
  }),
]);

class HabitWeekPlanningError extends Error {
  status: number;
  details?: Record<string, unknown>;

  constructor(
    status: number,
    message: string,
    details?: Record<string, unknown>,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "HabitWeekPlanningError";
    this.status = status;
    this.details = details;
  }
}

function getSupabaseEnv() {
  const url = String(Deno.env.get("SUPABASE_URL") ?? "").trim();
  const anonKey = String(Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
  const serviceRoleKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "")
    .trim();
  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error("Missing Supabase environment for habit-week-planning-v1");
  }
  return { url, anonKey, serviceRoleKey };
}

function normalizeDayCodes(days: string[] | null | undefined): DayCode[] {
  const unique = new Set<DayCode>();
  for (const day of days ?? []) {
    const normalized = String(day ?? "").trim().toLowerCase() as DayCode;
    if ((DAY_CODES as readonly string[]).includes(normalized)) {
      unique.add(normalized);
    }
  }
  return [...unique];
}

function publicSiteUrl(): string {
  const raw = String(
    Deno.env.get("SITE_URL") ?? Deno.env.get("PUBLIC_SITE_URL") ?? "",
  ).trim();
  return raw || "https://app.sophia.app";
}

function effectiveWeeklyTarget(
  item: Pick<UserPlanItemRow, "dimension" | "target_reps">,
  override?: number,
): number {
  if (typeof override === "number" && Number.isFinite(override)) {
    return Math.max(0, Math.min(7, override));
  }
  if (item.dimension === "habits") {
    return Math.max(0, Math.min(7, item.target_reps ?? 0));
  }
  return 1;
}

function arraysEqual<T>(left: T[], right: T[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function occurrenceDefaultDays(
  occurrences: HabitWeekOccurrenceRow[],
): DayCode[] {
  return occurrences
    .slice()
    .sort((left, right) => left.ordinal - right.ordinal)
    .map((occurrence) => occurrence.default_day);
}

function occurrencePlannedDays(
  occurrences: HabitWeekOccurrenceRow[],
): DayCode[] {
  return occurrences
    .slice()
    .sort((left, right) => left.ordinal - right.ordinal)
    .map((occurrence) => occurrence.planned_day);
}

function buildDefaultDays(args: {
  item: Pick<UserPlanItemRow, "dimension" | "target_reps" | "scheduled_days">;
  preferredDays?: DayCode[];
  targetRepsOverride?: number;
}): DayCode[] {
  const fromPreferred = normalizeDayCodes(args.preferredDays);
  const fromPlan = normalizeDayCodes(args.item.scheduled_days);
  const availableDays = fromPreferred.length > 0
    ? fromPreferred
    : [...DAY_CODES];
  const target = Math.min(
    effectiveWeeklyTarget(args.item, args.targetRepsOverride),
    availableDays.length,
  );
  if (target === 0) return [];

  if (args.item.dimension !== "habits") {
    const candidate = availableDays.find((day) => fromPlan.includes(day)) ??
      availableDays[0] ??
      fromPlan[0] ??
      DAY_CODES[0];
    return candidate ? [candidate] : [];
  }

  const alignedPlanDays = availableDays.filter((day) => fromPlan.includes(day));
  const completed = alignedPlanDays.length > 0 ? [...alignedPlanDays] : [];

  for (const day of availableDays) {
    if (completed.length >= target) break;
    if (!completed.includes(day)) completed.push(day);
  }

  return completed.slice(0, target);
}

function compareDayCode(left: DayCode, right: DayCode): number {
  return DAY_CODES.indexOf(left) - DAY_CODES.indexOf(right);
}

function nextAvailableDay(
  plannedDay: DayCode,
  currentDay: DayCode,
  occupied: Set<DayCode>,
): DayCode | null {
  const startIndex = Math.max(
    DAY_CODES.indexOf(plannedDay) + 1,
    DAY_CODES.indexOf(currentDay),
  );
  for (let index = startIndex; index < DAY_CODES.length; index += 1) {
    const candidate = DAY_CODES[index];
    if (!occupied.has(candidate)) return candidate;
  }
  return null;
}

async function loadHabitItem(
  admin: SupabaseClient,
  userId: string,
  planItemId: string,
): Promise<UserPlanItemRow> {
  const { data, error } = await admin
    .from("user_plan_items")
    .select(
      "id,user_id,cycle_id,transformation_id,plan_id,dimension,target_reps,scheduled_days,title,status",
    )
    .eq("id", planItemId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw new HabitWeekPlanningError(
      500,
      "Impossible de charger cet item de plan",
      undefined,
      {
        cause: error,
      },
    );
  }
  if (!data) throw new HabitWeekPlanningError(404, "Item de plan introuvable");
  return data as UserPlanItemRow;
}

async function loadWeekState(
  admin: SupabaseClient,
  userId: string,
  item: UserPlanItemRow,
  weekStartDate: string,
): Promise<{
  plan: HabitWeekPlanRow | null;
  occurrences: HabitWeekOccurrenceRow[];
  rescheduleEvents: HabitWeekRescheduleEventRow[];
}> {
  const [planResult, occurrencesResult, rescheduleEventsResult] = await Promise
    .all([
      admin
        .from("user_habit_week_plans")
        .select("*")
        .eq("user_id", userId)
        .eq("plan_item_id", item.id)
        .eq("week_start_date", weekStartDate)
        .maybeSingle(),
      admin
        .from("user_habit_week_occurrences")
        .select("*")
        .eq("user_id", userId)
        .eq("plan_item_id", item.id)
        .eq("week_start_date", weekStartDate)
        .order("ordinal", { ascending: true }),
      admin
        .from("user_habit_week_reschedule_events")
        .select("*")
        .eq("user_id", userId)
        .eq("plan_item_id", item.id)
        .eq("week_start_date", weekStartDate)
        .order("created_at", { ascending: true }),
    ]);

  if (planResult.error) {
    throw new HabitWeekPlanningError(
      500,
      "Impossible de charger le planning hebdo",
      undefined,
      {
        cause: planResult.error,
      },
    );
  }
  if (occurrencesResult.error) {
    throw new HabitWeekPlanningError(
      500,
      "Impossible de charger les occurrences de l'habitude",
      undefined,
      {
        cause: occurrencesResult.error,
      },
    );
  }
  if (
    rescheduleEventsResult.error &&
    !errorMentions(
      rescheduleEventsResult.error,
      "user_habit_week_reschedule_events",
    )
  ) {
    throw new HabitWeekPlanningError(
      500,
      "Impossible de charger l'historique des reports",
      undefined,
      {
        cause: rescheduleEventsResult.error,
      },
    );
  }

  const normalizedPlan = normalizePlanRow(
    planResult.data as Record<string, unknown> | null,
  );
  const normalizedOccurrences = normalizeOccurrenceRows(
    (occurrencesResult.data as Array<Record<string, unknown>> | null) ?? [],
    normalizedPlan,
  );

  return {
    plan: normalizedPlan,
    occurrences: normalizedOccurrences,
    rescheduleEvents:
      (rescheduleEventsResult.data as HabitWeekRescheduleEventRow[] | null) ??
        [],
  };
}

async function seedWeekIfMissing(
  admin: SupabaseClient,
  userId: string,
  item: UserPlanItemRow,
  weekStartDate: string,
  options?: {
    preferredDays?: DayCode[];
    targetRepsOverride?: number;
  },
): Promise<{
  plan: HabitWeekPlanRow;
  occurrences: HabitWeekOccurrenceRow[];
  rescheduleEvents: HabitWeekRescheduleEventRow[];
}> {
  const existing = await loadWeekState(admin, userId, item, weekStartDate);
  if (existing.plan && existing.occurrences.length > 0) {
    return {
      plan: existing.plan,
      occurrences: existing.occurrences,
      rescheduleEvents: existing.rescheduleEvents,
    };
  }

  const defaultDays = buildDefaultDays({
    item,
    preferredDays: options?.preferredDays,
    targetRepsOverride: options?.targetRepsOverride,
  });
  const planPayload = {
    user_id: userId,
    cycle_id: item.cycle_id,
    transformation_id: item.transformation_id,
    plan_id: item.plan_id,
    plan_item_id: item.id,
    week_start_date: weekStartDate,
    status: "pending_confirmation",
    updated_at: new Date().toISOString(),
  };

  const { data: upsertedPlan, error: planError } = await admin
    .from("user_habit_week_plans")
    .upsert(planPayload, {
      onConflict: "user_id,plan_item_id,week_start_date",
    })
    .select("*")
    .single();
  if (planError) {
    throw new HabitWeekPlanningError(
      500,
      "Impossible de creer le planning hebdo",
      undefined,
      {
        cause: planError,
      },
    );
  }

  if (existing.occurrences.length === 0) {
    const now = new Date().toISOString();
    const occurrencesPayload = defaultDays.map((day, index) => ({
      user_id: userId,
      cycle_id: item.cycle_id,
      transformation_id: item.transformation_id,
      plan_id: item.plan_id,
      plan_item_id: item.id,
      week_start_date: weekStartDate,
      ordinal: index + 1,
      default_day: day,
      planned_day: day,
      status: "planned",
      source: "default_generated",
      updated_at: now,
    }));

    if (occurrencesPayload.length > 0) {
      try {
        await upsertOccurrences(admin, occurrencesPayload);
      } catch (occurrencesError) {
        throw new HabitWeekPlanningError(
          500,
          "Impossible de creer les occurrences de la semaine",
          undefined,
          {
            cause: occurrencesError,
          },
        );
      }
    }
  }

  const seeded = await loadWeekState(admin, userId, item, weekStartDate);
  if (!seeded.plan) {
    throw new HabitWeekPlanningError(
      500,
      "Le planning hebdo n'a pas pu etre initialise",
    );
  }
  return {
    plan: seeded.plan,
    occurrences: seeded.occurrences,
    rescheduleEvents: seeded.rescheduleEvents,
  };
}

async function syncWeekPlanning(args: {
  admin: SupabaseClient;
  userId: string;
  item: UserPlanItemRow;
  weekStartDate: string;
  plannedDays: DayCode[];
  status: HabitWeekPlanRow["status"];
  targetRepsOverride?: number;
  defaultDaysOverride?: DayCode[];
}): Promise<{
  plan: HabitWeekPlanRow;
  occurrences: HabitWeekOccurrenceRow[];
  rescheduleEvents: HabitWeekRescheduleEventRow[];
}> {
  const { admin, userId, item, weekStartDate } = args;
  const plannedDays = normalizeDayCodes(args.plannedDays);
  const defaultDaysOverride = args.defaultDaysOverride
    ? normalizeDayCodes(args.defaultDaysOverride)
    : null;
  const target = effectiveWeeklyTarget(item, args.targetRepsOverride);
  if (plannedDays.length > target) {
    throw new HabitWeekPlanningError(
      400,
      "Tu ne peux pas planifier plus de jours que la frequence cible.",
      {
        target_reps: target,
        planned_count: plannedDays.length,
      },
    );
  }
  if (
    defaultDaysOverride && defaultDaysOverride.length !== plannedDays.length
  ) {
    throw new HabitWeekPlanningError(
      400,
      "Les jours proposes doivent correspondre au nombre de jours planifies.",
    );
  }

  const existing = await seedWeekIfMissing(admin, userId, item, weekStartDate, {
    targetRepsOverride: args.targetRepsOverride,
  });
  const now = new Date().toISOString();

  const { data: planData, error: planError } = await admin
    .from("user_habit_week_plans")
    .update({
      status: args.status,
      confirmed_at: args.status === "confirmed"
        ? now
        : existing.plan.confirmed_at,
      updated_at: now,
    })
    .eq("id", existing.plan.id)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (planError) {
    throw new HabitWeekPlanningError(
      500,
      "Impossible de sauvegarder ce planning",
      undefined,
      {
        cause: planError,
      },
    );
  }

  const lockedOccurrences = existing.occurrences.filter((occurrence) =>
    occurrence.status === "done" || occurrence.status === "partial"
  );
  const editableOccurrences = existing.occurrences
    .filter((occurrence) =>
      occurrence.status !== "done" && occurrence.status !== "partial"
    )
    .sort((left, right) => left.ordinal - right.ordinal);

  const desiredOrdinals = plannedDays.map((_, index) => index + 1);
  const toDelete = editableOccurrences.filter((occurrence) =>
    !desiredOrdinals.includes(occurrence.ordinal)
  );
  if (toDelete.length > 0) {
    const { error: deleteError } = await admin
      .from("user_habit_week_occurrences")
      .delete()
      .in("id", toDelete.map((occurrence) => occurrence.id))
      .eq("user_id", userId);
    if (deleteError) {
      throw new HabitWeekPlanningError(
        500,
        "Impossible de nettoyer les jours retires",
        undefined,
        {
          cause: deleteError,
        },
      );
    }
  }

  const rowsToUpsert = plannedDays.map((day, index) => {
    const ordinal = index + 1;
    const existingOccurrence = editableOccurrences.find((occurrence) =>
      occurrence.ordinal === ordinal
    );
    return {
      id: existingOccurrence?.id,
      user_id: userId,
      cycle_id: item.cycle_id,
      transformation_id: item.transformation_id,
      plan_id: item.plan_id,
      plan_item_id: item.id,
      week_start_date: weekStartDate,
      ordinal,
      default_day: defaultDaysOverride?.[index] ??
        existingOccurrence?.default_day ?? day,
      planned_day: day,
      original_planned_day: existingOccurrence?.original_planned_day ?? null,
      actual_day: existingOccurrence?.actual_day ?? null,
      status: existingOccurrence?.status === "rescheduled"
        ? "rescheduled"
        : "planned",
      source: args.status === "confirmed"
        ? "weekly_confirmed"
        : existingOccurrence?.source ?? "manual_change",
      validated_at: existingOccurrence?.validated_at ?? null,
      updated_at: now,
    };
  });

  if (rowsToUpsert.length > 0) {
    try {
      await upsertOccurrences(admin, rowsToUpsert);
    } catch (upsertError) {
      throw new HabitWeekPlanningError(
        500,
        "Impossible de mettre a jour les jours de l'habitude",
        undefined,
        {
          cause: upsertError,
        },
      );
    }
  }

  const refreshed = await loadWeekState(admin, userId, item, weekStartDate);
  return {
    plan: (planData as HabitWeekPlanRow),
    occurrences: [
      ...lockedOccurrences,
      ...refreshed.occurrences.filter((occurrence) =>
        occurrence.status !== "done" && occurrence.status !== "partial"
      ),
    ]
      .sort((left, right) => left.ordinal - right.ordinal),
    rescheduleEvents: refreshed.rescheduleEvents,
  };
}

async function getState(args: {
  admin: SupabaseClient;
  userId: string;
  item: UserPlanItemRow;
  currentWeekStart: string;
  nextWeekStart?: string;
  preferredDays?: DayCode[];
  targetRepsOverride?: number;
}) {
  const currentWeek = await seedWeekIfMissing(
    args.admin,
    args.userId,
    args.item,
    args.currentWeekStart,
    {
      preferredDays: args.preferredDays,
      targetRepsOverride: args.targetRepsOverride,
    },
  );
  const nextWeek = args.nextWeekStart
    ? await seedWeekIfMissing(
      args.admin,
      args.userId,
      args.item,
      args.nextWeekStart,
      {
        preferredDays: args.preferredDays,
        targetRepsOverride: args.targetRepsOverride,
      },
    )
    : null;

  return {
    plan_item: {
      id: args.item.id,
      title: args.item.title,
      dimension: args.item.dimension,
      target_reps: effectiveWeeklyTarget(args.item, args.targetRepsOverride),
      scheduled_days: normalizeDayCodes(args.item.scheduled_days),
      status: args.item.status,
    },
    current_week: currentWeek,
    next_week: nextWeek,
  };
}

async function getBundleState(args: {
  admin: SupabaseClient;
  userId: string;
  weekStartDate: string;
  items: Array<{
    item: UserPlanItemRow;
    preferredDays?: DayCode[];
    targetRepsOverride?: number;
  }>;
}) {
  const weekItems = await Promise.all(args.items.map(async (entry) => {
    let week = await seedWeekIfMissing(
      args.admin,
      args.userId,
      entry.item,
      args.weekStartDate,
      {
        preferredDays: entry.preferredDays,
        targetRepsOverride: entry.targetRepsOverride,
      },
    );
    const expectedDays = buildDefaultDays({
      item: entry.item,
      preferredDays: entry.preferredDays,
      targetRepsOverride: entry.targetRepsOverride,
    });
    const currentDefaultDays = occurrenceDefaultDays(week.occurrences);
    const currentPlannedDays = occurrencePlannedDays(week.occurrences);

    if (
      week.plan.status === "pending_confirmation" &&
      (!arraysEqual(currentPlannedDays, expectedDays) ||
        !arraysEqual(currentDefaultDays, expectedDays))
    ) {
      week = await syncWeekPlanning({
        admin: args.admin,
        userId: args.userId,
        item: entry.item,
        weekStartDate: args.weekStartDate,
        plannedDays: expectedDays,
        defaultDaysOverride: expectedDays,
        status: "pending_confirmation",
        targetRepsOverride: entry.targetRepsOverride,
      });
    }

    return {
      plan_item: {
        id: entry.item.id,
        title: entry.item.title,
        dimension: entry.item.dimension,
        target_reps: effectiveWeeklyTarget(
          entry.item,
          entry.targetRepsOverride,
        ),
        scheduled_days: normalizeDayCodes(entry.item.scheduled_days),
        status: entry.item.status,
      },
      preferred_days: normalizeDayCodes(entry.preferredDays),
      week,
    };
  }));

  const bundleStatus =
    weekItems.every((entry) =>
        entry.week.plan.status === "confirmed" ||
        entry.week.plan.status === "auto_applied"
      )
      ? "confirmed"
      : "pending_confirmation";

  return {
    week_start_date: args.weekStartDate,
    bundle_status: bundleStatus,
    items: weekItems,
  };
}

async function confirmBundle(args: {
  admin: SupabaseClient;
  userId: string;
  weekStartDate: string;
  items: Array<{
    item: UserPlanItemRow;
    plannedDays: DayCode[];
    targetRepsOverride?: number;
  }>;
}) {
  const beforeState = await getBundleState({
    admin: args.admin,
    userId: args.userId,
    weekStartDate: args.weekStartDate,
    items: args.items.map((entry) => ({
      item: entry.item,
      preferredDays: entry.plannedDays,
      targetRepsOverride: entry.targetRepsOverride,
    })),
  });

  await Promise.all(args.items.map((entry) =>
    syncWeekPlanning({
      admin: args.admin,
      userId: args.userId,
      item: entry.item,
      weekStartDate: args.weekStartDate,
      plannedDays: entry.plannedDays,
      status: "confirmed",
      targetRepsOverride: entry.targetRepsOverride,
    })
  ));

  const afterState = await getBundleState({
    admin: args.admin,
    userId: args.userId,
    weekStartDate: args.weekStartDate,
    items: args.items.map((entry) => ({
      item: entry.item,
      preferredDays: entry.plannedDays,
      targetRepsOverride: entry.targetRepsOverride,
    })),
  });

  const dashboardUrl = weeklyPlanningDashboardUrl(publicSiteUrl());
  const confirmationPayload = buildWeeklyPlanningConfirmationPayload({
    userId: args.userId,
    weekStartDate: args.weekStartDate,
    dashboardUrl,
    before: beforeState as PlanningBundleSnapshot,
    after: afterState as PlanningBundleSnapshot,
  });
  await args.admin
    .from("scheduled_checkins")
    .delete()
    .eq("user_id", args.userId)
    .eq("event_context", WEEKLY_PLANNING_VALIDATION_PROMPT_EVENT_CONTEXT)
    .filter("message_payload->>next_week_start_date", "eq", args.weekStartDate)
    .in("status", ["pending", "retrying", "awaiting_user"]);

  if (confirmationPayload.confirmation_kind === "no_change") {
    return afterState;
  }

  const draftMessage = buildWeeklyPlanningConfirmationMessage(
    confirmationPayload,
  );

  const { error: checkinError } = await args.admin
    .from("scheduled_checkins")
    .insert({
      user_id: args.userId,
      origin: "weekly_planning",
      event_context: WEEKLY_PLANNING_CONFIRMATION_EVENT_CONTEXT,
      draft_message: draftMessage,
      message_mode: "static",
      message_payload: confirmationPayload,
      scheduled_for: new Date().toISOString(),
      status: "pending",
    } as any);
  if (checkinError) {
    console.warn(
      "[habit-week-planning-v1] weekly planning confirmation enqueue failed",
      checkinError,
    );
  }

  return afterState;
}

async function validateOccurrence(args: {
  admin: SupabaseClient;
  userId: string;
  item: UserPlanItemRow;
  occurrenceId: string;
  decision: "done" | "missed" | "reschedule";
  targetDay?: DayCode;
  actualDay?: DayCode;
  currentDay?: DayCode;
}) {
  const { data, error } = await args.admin
    .from("user_habit_week_occurrences")
    .select("*")
    .eq("id", args.occurrenceId)
    .eq("user_id", args.userId)
    .eq("plan_item_id", args.item.id)
    .maybeSingle();
  if (error) {
    throw new HabitWeekPlanningError(
      500,
      "Impossible de charger cette occurrence",
      undefined,
      {
        cause: error,
      },
    );
  }
  if (!data) throw new HabitWeekPlanningError(404, "Occurrence introuvable");

  const occurrence =
    normalizeOccurrenceRows([data as Record<string, unknown>], null)[0];
  const weekState = await loadWeekState(
    args.admin,
    args.userId,
    args.item,
    occurrence.week_start_date,
  );
  const siblings = weekState.occurrences.filter((row) =>
    row.id !== occurrence.id
  );
  const occupiedDays = new Set<DayCode>(
    siblings
      .filter((row) => row.status !== "missed")
      .map((row) => row.planned_day),
  );
  const now = new Date().toISOString();
  const currentDay = args.currentDay ?? occurrence.planned_day;

  if (args.decision === "done") {
    const actualDay = args.actualDay ?? occurrence.actual_day ??
      occurrence.planned_day;
    if (DAY_CODES.indexOf(actualDay) > DAY_CODES.indexOf(currentDay)) {
      throw new HabitWeekPlanningError(
        400,
        "Tu ne peux pas valider un jour futur comme deja fait.",
      );
    }
    const { error: updateError } = await args.admin
      .from("user_habit_week_occurrences")
      .update({
        status: "done",
        actual_day: actualDay,
        validated_at: now,
        updated_at: now,
      })
      .eq("id", occurrence.id)
      .eq("user_id", args.userId);
    if (updateError) {
      throw new HabitWeekPlanningError(
        500,
        "Impossible de valider ce jour",
        undefined,
        {
          cause: updateError,
        },
      );
    }
    return { rescheduled_to: null };
  }

  if (args.decision === "reschedule") {
    const targetDay = args.targetDay;
    if (!targetDay) {
      throw new HabitWeekPlanningError(400, "Choisis un jour de report.");
    }
    if (DAY_CODES.indexOf(targetDay) < DAY_CODES.indexOf(currentDay)) {
      throw new HabitWeekPlanningError(
        400,
        "Le report ne peut se faire que vers aujourd'hui ou un jour futur.",
      );
    }
    if (occupiedDays.has(targetDay)) {
      throw new HabitWeekPlanningError(
        409,
        "Ce jour est deja pris par une autre repetition.",
      );
    }
    try {
      await insertRescheduleEvent(args.admin, {
        user_id: args.userId,
        cycle_id: occurrence.cycle_id,
        transformation_id: occurrence.transformation_id,
        plan_id: occurrence.plan_id,
        plan_item_id: occurrence.plan_item_id,
        week_start_date: occurrence.week_start_date,
        occurrence_id: occurrence.id,
        from_day: occurrence.planned_day,
        to_day: targetDay,
        reason: "manual_reschedule",
        created_at: now,
      });
    } catch (historyError) {
      throw new HabitWeekPlanningError(
        500,
        "Impossible d'enregistrer l'historique du report",
        undefined,
        {
          cause: historyError,
        },
      );
    }
    const { error: updateError } = await args.admin
      .from("user_habit_week_occurrences")
      .update({
        planned_day: targetDay,
        original_planned_day: occurrence.original_planned_day ??
          occurrence.planned_day,
        status: "rescheduled",
        source: "manual_change",
        updated_at: now,
      })
      .eq("id", occurrence.id)
      .eq("user_id", args.userId);
    if (updateError) {
      throw new HabitWeekPlanningError(
        500,
        "Impossible de deplacer ce jour",
        undefined,
        {
          cause: updateError,
        },
      );
    }
    return { rescheduled_to: targetDay };
  }

  const fallbackDay = nextAvailableDay(
    occurrence.planned_day,
    currentDay,
    occupiedDays,
  );
  if (!fallbackDay) {
    const { error: updateError } = await args.admin
      .from("user_habit_week_occurrences")
      .update({
        status: "missed",
        validated_at: now,
        updated_at: now,
      })
      .eq("id", occurrence.id)
      .eq("user_id", args.userId);
    if (updateError) {
      throw new HabitWeekPlanningError(
        500,
        "Impossible de marquer ce jour comme non fait",
        undefined,
        {
          cause: updateError,
        },
      );
    }
    return { rescheduled_to: null };
  }

  try {
    await insertRescheduleEvent(args.admin, {
      user_id: args.userId,
      cycle_id: occurrence.cycle_id,
      transformation_id: occurrence.transformation_id,
      plan_id: occurrence.plan_id,
      plan_item_id: occurrence.plan_item_id,
      week_start_date: occurrence.week_start_date,
      occurrence_id: occurrence.id,
      from_day: occurrence.planned_day,
      to_day: fallbackDay,
      reason: "auto_missed",
      created_at: now,
    });
  } catch (historyError) {
    throw new HabitWeekPlanningError(
      500,
      "Impossible d'enregistrer l'historique du report",
      undefined,
      {
        cause: historyError,
      },
    );
  }

  const { error: updateError } = await args.admin
    .from("user_habit_week_occurrences")
    .update({
      planned_day: fallbackDay,
      original_planned_day: occurrence.original_planned_day ??
        occurrence.planned_day,
      status: "rescheduled",
      source: "auto_rescheduled",
      updated_at: now,
    })
    .eq("id", occurrence.id)
    .eq("user_id", args.userId);
  if (updateError) {
    throw new HabitWeekPlanningError(
      500,
      "Impossible de reporter ce jour",
      undefined,
      {
        cause: updateError,
      },
    );
  }
  return { rescheduled_to: fallbackDay };
}

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return handleCorsOptions(req);

  const corsError = enforceCors(req);
  if (corsError) return corsError;

  const requestId = getRequestContext(req).requestId;

  try {
    if (req.method !== "POST") {
      return jsonResponse(req, {
        error: "Method Not Allowed",
        request_id: requestId,
      }, { status: 405 });
    }

    const parsedBody = await parseJsonBody(req, REQUEST_SCHEMA, requestId);
    if (!parsedBody.ok) return parsedBody.response;

    const env = getSupabaseEnv();
    const authHeader = String(
      req.headers.get("Authorization") ?? req.headers.get("authorization") ??
        "",
    ).trim();
    if (!authHeader) {
      return jsonResponse(req, {
        error: "Missing Authorization header",
        request_id: requestId,
      }, { status: 401 });
    }

    const userClient = createClient(env.url, env.anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await userClient.auth
      .getUser();
    if (authError || !authData?.user) {
      return jsonResponse(
        req,
        { error: "Unauthorized", request_id: requestId },
        { status: 401 },
      );
    }

    const admin = createClient(env.url, env.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const body = parsedBody.data;

    if (body.action === "get_state") {
      const item = await loadHabitItem(
        admin,
        authData.user.id,
        body.plan_item_id,
      );
      const state = await getState({
        admin,
        userId: authData.user.id,
        item,
        currentWeekStart: body.current_week_start,
        nextWeekStart: body.next_week_start,
        preferredDays: body.preferred_days,
        targetRepsOverride: body.target_reps_override,
      });
      return jsonResponse(req, { request_id: requestId, ...state });
    }

    if (body.action === "confirm_week") {
      const item = await loadHabitItem(
        admin,
        authData.user.id,
        body.plan_item_id,
      );
      const week = await syncWeekPlanning({
        admin,
        userId: authData.user.id,
        item,
        weekStartDate: body.week_start_date,
        plannedDays: body.planned_days,
        status: "confirmed",
        targetRepsOverride: body.target_reps_override,
      });
      return jsonResponse(req, {
        request_id: requestId,
        week,
      });
    }

    if (body.action === "get_bundle_state") {
      const items = await Promise.all(body.items.map(async (entry) => ({
        item: await loadHabitItem(admin, authData.user.id, entry.plan_item_id),
        preferredDays: entry.preferred_days,
        targetRepsOverride: entry.target_reps_override,
      })));
      const state = await getBundleState({
        admin,
        userId: authData.user.id,
        weekStartDate: body.week_start_date,
        items,
      });
      return jsonResponse(req, { request_id: requestId, ...state });
    }

    if (body.action === "confirm_bundle") {
      const items = await Promise.all(body.items.map(async (entry) => ({
        item: await loadHabitItem(admin, authData.user.id, entry.plan_item_id),
        plannedDays: entry.planned_days,
        targetRepsOverride: entry.target_reps_override,
      })));
      const state = await confirmBundle({
        admin,
        userId: authData.user.id,
        weekStartDate: body.week_start_date,
        items,
      });
      return jsonResponse(req, { request_id: requestId, ...state });
    }

    const item = await loadHabitItem(
      admin,
      authData.user.id,
      body.plan_item_id,
    );

    const validationResult = await validateOccurrence({
      admin,
      userId: authData.user.id,
      item,
      occurrenceId: body.occurrence_id,
      decision: body.decision,
      targetDay: body.target_day,
      actualDay: body.actual_day,
      currentDay: body.current_day,
    });
    const state = await getState({
      admin,
      userId: authData.user.id,
      item,
      currentWeekStart: body.current_week_start,
      nextWeekStart: body.next_week_start,
      targetRepsOverride: body.target_reps_override,
    });
    return jsonResponse(req, {
      request_id: requestId,
      ...state,
      validation_result: validationResult,
    });
  } catch (error) {
    const ctx = getRequestContext(req);
    await logEdgeFunctionError({
      functionName: "habit-week-planning-v1",
      error,
      requestId,
      userId: ctx.userId,
      source: "edge",
      metadata: { route: "habit-week-planning-v1" },
    });

    if (error instanceof HabitWeekPlanningError) {
      return jsonResponse(req, {
        error: error.message,
        details: error.details ?? null,
        request_id: requestId,
      }, { status: error.status });
    }

    return serverError(req, requestId, "Impossible de gerer le planning hebdo");
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
