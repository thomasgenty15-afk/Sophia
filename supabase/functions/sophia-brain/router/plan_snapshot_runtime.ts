/// <reference path="../../tsserver-shims.d.ts" />
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  type ActiveTransformationRuntime,
  getActiveLoad,
  getActiveTransformationRuntime,
  getPlanItemRuntime,
} from "../../_shared/v2-runtime.ts";
import type {
  PlanDimension,
  PlanItemKind,
  PlanItemStatus,
  UserPlanItemEntryRow,
  UserPlanItemRow,
} from "../../_shared/v2-types.ts";

// Projection DB/runtime du plan actif pour un tour dispatcher.
export type V2PlanItemSnapshotItem = {
  id: string;
  title: string;
  description?: string | null;
  dimension: PlanDimension;
  item_type: PlanItemKind;
  status: PlanItemStatus;
  cadence_label?: string | null;
  target_reps?: number | null;
  current_reps?: number | null;
  scheduled_days?: string[] | null;
  time_of_day?: string | null;
  phase_id?: string | null;
  phase_order?: number | null;
  generated_temp_id?: string | null;
  source_kind?: "plan_generated" | "operation_bridge" | "unknown";
  item_nature?:
    | "recurring_habit"
    | "one_shot_mission"
    | "clarification"
    | "other";
  available_this_week?: boolean;
  availability_status?:
    | "available_this_week"
    | "available_past_week"
    | "available_upcoming_week"
    | "assigned_no_calendar"
    | "not_assigned_to_level_weeks";
  week_scope?: {
    level_order?: number | null;
    level_title?: string | null;
    week_order?: number | null;
    week_title?: string | null;
    week_status?: "completed" | "current" | "upcoming" | "unknown";
    week_start?: string | null;
    week_end?: string | null;
    weekly_reps?: number | null;
    weekly_cadence_label?: string | null;
    weekly_description_override?: string | null;
    mission_days?: string[];
  } | null;
  streak_current: number;
  last_entry_at: string | null;
  active_load_score?: number;
  payload?: Record<string, unknown> | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readPlanItemPayload(
  item: { payload?: unknown },
): Record<string, unknown> {
  return isRecord(item.payload) ? item.payload : {};
}

function readPlanItemGeneratedTempId(
  item: { payload?: unknown },
): string | null {
  const payload = readPlanItemPayload(item);
  const generation = isRecord(payload._generation)
    ? payload._generation
    : isRecord(payload.generation)
    ? payload.generation
    : null;
  const tempId = String(generation?.temp_id ?? "").trim();
  return tempId || null;
}

function readPlanItemSourceKind(
  item: { payload?: unknown },
): V2PlanItemSnapshotItem["source_kind"] {
  const payload = readPlanItemPayload(item);
  return isRecord(payload.operation_bridge)
    ? "operation_bridge"
    : "plan_generated";
}

function readPlanItemNature(item: {
  dimension?: unknown;
  kind?: unknown;
}): V2PlanItemSnapshotItem["item_nature"] {
  if (item.kind === "habit" || item.dimension === "habits") {
    return "recurring_habit";
  }
  if (item.dimension === "missions") return "one_shot_mission";
  if (item.dimension === "clarifications") return "clarification";
  return "other";
}

function parseYmdPartsForPlanSnapshot(
  ymd: string,
): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function dateFromYmdUtcForPlanSnapshot(ymd: string): Date | null {
  const parts = parseYmdPartsForPlanSnapshot(ymd);
  if (!parts) return null;
  const [year, month, day] = parts;
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function addDaysYmdForPlanSnapshot(ymd: string, days: number): string | null {
  const date = dateFromYmdUtcForPlanSnapshot(ymd);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function compareYmdForPlanSnapshot(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function getLocalYmdForPlanSnapshot(
  timezone: string,
  now = new Date(),
): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const map = new Map(parts.map((part) => [part.type, part.value]));
    const year = map.get("year");
    const month = map.get("month");
    const day = map.get("day");
    return year && month && day ? `${year}-${month}-${day}` : null;
  } catch {
    return null;
  }
}

function readScheduleAnchorForPlanSnapshot(
  content: unknown,
): Record<string, unknown> | null {
  if (!isRecord(content)) return null;
  const metadata = isRecord(content.metadata) ? content.metadata : {};
  const anchor = metadata.schedule_anchor;
  if (!isRecord(anchor)) return null;
  const timezone = String(anchor.timezone ?? "").trim();
  const anchorWeekStart = String(anchor.anchor_week_start ?? "").trim();
  const anchorWeekEnd = String(anchor.anchor_week_end ?? "").trim();
  if (!timezone || !anchorWeekStart || !anchorWeekEnd) return null;
  return anchor;
}

function getWeekStatusForPlanSnapshot(args: {
  anchor: Record<string, unknown> | null;
  weekOrder: number;
}): {
  status: "completed" | "current" | "upcoming" | "unknown";
  start: string | null;
  end: string | null;
} {
  if (!args.anchor || !Number.isInteger(args.weekOrder) || args.weekOrder < 1) {
    return { status: "unknown", start: null, end: null };
  }
  const timezone = String(args.anchor.timezone ?? "").trim();
  const anchorWeekStart = String(args.anchor.anchor_week_start ?? "").trim();
  const anchorWeekEnd = String(args.anchor.anchor_week_end ?? "").trim();
  const anchorDisplayStart = String(args.anchor.anchor_display_start ?? "")
    .trim();
  const offsetDays = (args.weekOrder - 1) * 7;
  const fullWeekStart = addDaysYmdForPlanSnapshot(anchorWeekStart, offsetDays);
  const fullWeekEnd = addDaysYmdForPlanSnapshot(anchorWeekEnd, offsetDays);
  if (!timezone || !fullWeekStart || !fullWeekEnd) {
    return { status: "unknown", start: null, end: null };
  }
  const start = args.weekOrder === 1 && anchorDisplayStart
    ? anchorDisplayStart
    : fullWeekStart;
  const localToday = getLocalYmdForPlanSnapshot(timezone);
  if (!localToday) return { status: "unknown", start, end: fullWeekEnd };
  if (compareYmdForPlanSnapshot(localToday, start) < 0) {
    return { status: "upcoming", start, end: fullWeekEnd };
  }
  if (compareYmdForPlanSnapshot(localToday, fullWeekEnd) > 0) {
    return { status: "completed", start, end: fullWeekEnd };
  }
  return { status: "current", start, end: fullWeekEnd };
}

function planSnapshotAvailabilityRank(
  status: NonNullable<V2PlanItemSnapshotItem["availability_status"]>,
): number {
  if (status === "available_this_week") return 4;
  if (status === "available_upcoming_week") return 3;
  if (status === "assigned_no_calendar") return 2;
  if (status === "available_past_week") return 1;
  return 0;
}

function buildWeeklyAvailabilityByTempIdForPlanSnapshot(
  content: unknown,
): Map<
  string,
  NonNullable<V2PlanItemSnapshotItem["week_scope"]> & {
    availability_status: NonNullable<
      V2PlanItemSnapshotItem["availability_status"]
    >;
  }
> {
  const out = new Map<
    string,
    NonNullable<V2PlanItemSnapshotItem["week_scope"]> & {
      availability_status: NonNullable<
        V2PlanItemSnapshotItem["availability_status"]
      >;
    }
  >();
  if (!isRecord(content) || !isRecord(content.current_level_runtime)) {
    return out;
  }
  const runtime = content.current_level_runtime;
  const weeks = Array.isArray(runtime.weeks) ? runtime.weeks : [];
  const anchor = readScheduleAnchorForPlanSnapshot(content);
  for (const week of weeks) {
    if (!isRecord(week)) continue;
    const weekOrder = Number(week.week_order);
    const calendar = getWeekStatusForPlanSnapshot({ anchor, weekOrder });
    const weekStatus = calendar.status;
    const assignments = Array.isArray(week.item_assignments)
      ? week.item_assignments
      : [];
    for (const assignment of assignments) {
      if (!isRecord(assignment)) continue;
      const tempId = String(assignment.temp_id ?? "").trim();
      if (!tempId) continue;
      const availabilityStatus: NonNullable<
        V2PlanItemSnapshotItem["availability_status"]
      > = weekStatus === "current"
        ? "available_this_week"
        : weekStatus === "completed"
        ? "available_past_week"
        : weekStatus === "upcoming"
        ? "available_upcoming_week"
        : "assigned_no_calendar";
      const previous = out.get(tempId);
      if (
        previous &&
        planSnapshotAvailabilityRank(previous.availability_status) >=
          planSnapshotAvailabilityRank(availabilityStatus)
      ) {
        continue;
      }
      out.set(tempId, {
        level_order: typeof runtime.level_order === "number"
          ? runtime.level_order
          : null,
        level_title: String(runtime.title ?? "").trim() || null,
        week_order: Number.isInteger(weekOrder) ? weekOrder : null,
        week_title: String(week.title ?? "").trim() || null,
        week_status: weekStatus,
        week_start: calendar.start,
        week_end: calendar.end,
        weekly_reps: typeof assignment.weekly_reps === "number"
          ? assignment.weekly_reps
          : null,
        weekly_cadence_label: String(assignment.weekly_cadence_label ?? "")
          .trim() ||
          null,
        weekly_description_override:
          String(assignment.weekly_description_override ?? "").trim() || null,
        mission_days: Array.isArray(week.mission_days)
          ? week.mission_days.map((day) => String(day)).filter(Boolean)
          : [],
        availability_status: availabilityStatus,
      });
    }
  }
  return out;
}


export async function resolveActiveTransformationRuntime(args: {
  supabase: SupabaseClient;
  userId: string;
  runtime?: ActiveTransformationRuntime | null;
}): Promise<ActiveTransformationRuntime> {
  if (args.runtime) return args.runtime;
  return await getActiveTransformationRuntime(args.supabase, args.userId);
}

const POSITIVE_ENTRY_KINDS = new Set<UserPlanItemEntryRow["entry_kind"]>([
  "checkin",
  "progress",
  "partial",
]);

export function computeStreakFromEntries(
  entries: UserPlanItemEntryRow[],
): number {
  let streak = 0;
  for (const entry of entries) {
    if (POSITIVE_ENTRY_KINDS.has(entry.entry_kind)) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

const SNAPSHOT_EXCLUDED_STATUSES = new Set<PlanItemStatus>([
  "cancelled",
  "deactivated",
]);

export async function buildV2PlanItemSnapshot(
  supabase: import("jsr:@supabase/supabase-js@2").SupabaseClient,
  userId: string,
  cycleId?: string | null,
  runtime?: ActiveTransformationRuntime | null,
): Promise<V2PlanItemSnapshotItem[]> {
  const resolvedRuntime = await resolveActiveTransformationRuntime({
    supabase,
    userId,
    runtime,
  });
  if (
    cycleId && resolvedRuntime.cycle?.id &&
    resolvedRuntime.cycle.id !== cycleId
  ) {
    return [];
  }
  if (!resolvedRuntime.plan) return [];

  const [planItems, activeLoad] = await Promise.all([
    getPlanItemRuntime(supabase, resolvedRuntime.plan.id, {
      maxEntriesPerItem: 5,
    }),
    getActiveLoad(supabase, resolvedRuntime.plan.id),
  ]);
  const weeklyAvailabilityByTempId =
    buildWeeklyAvailabilityByTempIdForPlanSnapshot(
      (resolvedRuntime.plan as any)?.content,
    );

  return planItems
    .filter((item) => !SNAPSHOT_EXCLUDED_STATUSES.has(item.status))
    .slice(0, 30)
    .map((item) => {
      const generatedTempId = readPlanItemGeneratedTempId(item);
      const weekScope = generatedTempId
        ? weeklyAvailabilityByTempId.get(generatedTempId) ?? null
        : null;
      const availabilityStatus = weekScope?.availability_status ??
        "not_assigned_to_level_weeks";
      return {
        id: item.id,
        title: item.title,
        description: item.description ?? null,
        dimension: item.dimension,
        item_type: item.kind,
        status: item.status,
        cadence_label: item.cadence_label ?? null,
        target_reps: item.target_reps ?? null,
        current_reps: item.current_reps ?? null,
        scheduled_days: Array.isArray(item.scheduled_days)
          ? item.scheduled_days
          : null,
        time_of_day: item.time_of_day ?? null,
        phase_id: item.phase_id ?? null,
        phase_order: item.phase_order ?? null,
        generated_temp_id: generatedTempId,
        source_kind: readPlanItemSourceKind(item),
        item_nature: readPlanItemNature(item),
        available_this_week: availabilityStatus === "available_this_week",
        availability_status: availabilityStatus,
        week_scope: weekScope
          ? {
            level_order: weekScope.level_order,
            level_title: weekScope.level_title,
            week_order: weekScope.week_order,
            week_title: weekScope.week_title,
            week_status: weekScope.week_status,
            week_start: weekScope.week_start,
            week_end: weekScope.week_end,
            weekly_reps: weekScope.weekly_reps,
            weekly_cadence_label: weekScope.weekly_cadence_label,
            weekly_description_override: weekScope.weekly_description_override,
            mission_days: weekScope.mission_days,
          }
          : null,
        streak_current: computeStreakFromEntries(item.recent_entries),
        last_entry_at: item.last_entry_at,
        active_load_score: activeLoad.current_load_score,
        payload: item.payload && typeof item.payload === "object"
          ? item.payload as Record<string, unknown>
          : null,
      };
    });
}

export async function loadDirectV2PlanItemSnapshotFallback(
  supabase: SupabaseClient,
  userId: string,
  runtime?: ActiveTransformationRuntime | null,
): Promise<V2PlanItemSnapshotItem[]> {
  let query = supabase
    .from("user_plan_items")
    .select(
      "id,title,description,dimension,kind,status,cadence_label,target_reps,current_reps,scheduled_days,time_of_day,phase_id,phase_order,payload,created_at,activation_order,updated_at",
    )
    .eq("user_id", userId);
  if (runtime?.plan?.id) {
    query = query.eq("plan_id", runtime.plan.id);
  } else if (runtime?.transformation?.id) {
    query = query.eq("transformation_id", runtime.transformation.id);
  }
  const { data, error } = await query
    .order("activation_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(30);
  if (error) throw error;
  const weeklyAvailabilityByTempId =
    buildWeeklyAvailabilityByTempIdForPlanSnapshot(
      (runtime?.plan as any)?.content,
    );
  return (((data as UserPlanItemRow[] | null) ?? [])
    .filter((item) => !SNAPSHOT_EXCLUDED_STATUSES.has(item.status))
    .map((item) => {
      const generatedTempId = readPlanItemGeneratedTempId(item);
      const weekScope = generatedTempId
        ? weeklyAvailabilityByTempId.get(generatedTempId) ?? null
        : null;
      const availabilityStatus = weekScope?.availability_status ??
        "not_assigned_to_level_weeks";
      return {
        id: item.id,
        title: item.title,
        description: item.description ?? null,
        dimension: item.dimension,
        item_type: item.kind,
        status: item.status,
        cadence_label: item.cadence_label ?? null,
        target_reps: item.target_reps ?? null,
        current_reps: item.current_reps ?? null,
        scheduled_days: Array.isArray((item as any).scheduled_days)
          ? (item as any).scheduled_days
          : null,
        time_of_day: (item as any).time_of_day ?? null,
        phase_id: (item as any).phase_id ?? null,
        phase_order: (item as any).phase_order ?? null,
        generated_temp_id: generatedTempId,
        source_kind: readPlanItemSourceKind(item),
        item_nature: readPlanItemNature(item),
        available_this_week: availabilityStatus === "available_this_week",
        availability_status: availabilityStatus,
        week_scope: weekScope
          ? {
            level_order: weekScope.level_order,
            level_title: weekScope.level_title,
            week_order: weekScope.week_order,
            week_title: weekScope.week_title,
            week_status: weekScope.week_status,
            week_start: weekScope.week_start,
            week_end: weekScope.week_end,
            weekly_reps: weekScope.weekly_reps,
            weekly_cadence_label: weekScope.weekly_cadence_label,
            weekly_description_override: weekScope.weekly_description_override,
            mission_days: weekScope.mission_days,
          }
          : null,
        streak_current: 0,
        last_entry_at: null,
        payload: item.payload && typeof item.payload === "object"
          ? item.payload as Record<string, unknown>
          : null,
      };
    }));
}



export async function loadPlanSnapshotForTurn(args: {
  supabase: SupabaseClient;
  userId: string;
  cycleId?: string | null;
  runtime?: ActiveTransformationRuntime | null;
  onError?: (phase: "primary" | "fallback", error: unknown) => void;
}): Promise<V2PlanItemSnapshotItem[] | undefined> {
  let snapshot: V2PlanItemSnapshotItem[] | undefined;
  try {
    snapshot = await buildV2PlanItemSnapshot(
      args.supabase,
      args.userId,
      args.cycleId,
      args.runtime,
    );
  } catch (error) {
    args.onError?.("primary", error);
  }
  if (!snapshot || snapshot.length === 0) {
    try {
      snapshot = await loadDirectV2PlanItemSnapshotFallback(
        args.supabase,
        args.userId,
        args.runtime,
      );
    } catch (error) {
      args.onError?.("fallback", error);
    }
  }
  return snapshot;
}
