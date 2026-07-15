// adjust-plan-v1: dedicated adjustment frame for an ACTIVE V3 plan.
// Duplicated from generate-plan-v2 (which stays untouched and owns initial
// generation). This copy only accepts modes "preview" and "confirm" with a
// mandatory adjustment_context, and enforces adjustment invariants:
// - global_objective is copied from the base plan, never regenerated
// - scope "level": only current_level_runtime (+ its phase) is regenerated;
//   blueprint and future levels are copied verbatim from the base plan
// - an adjusted current level lasts at most ADJUSTED_LEVEL_MAX_WEEKS weeks and
//   must keep the original level's ambition (no absorbing future levels)
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "jsr:@supabase/supabase-js@2";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { classifyPlanTypeForTransformation } from "../classify-plan-type-v1/index.ts";
import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { enforceRateLimit, RATE_PRESETS } from "../_shared/rate-limit.ts";
import { distributePlanItemsV3 } from "../_shared/v2-plan-distribution.ts";
import {
  buildPhase1Context,
  mergePhase1Payload,
} from "../_shared/v2-phase1.ts";
import { classifyAndPersistProfessionalSupport } from "../_shared/professional-support-v2.ts";
import { classifyAndPersistLevelToolRecommendations } from "../_shared/level-tool-recommendations-v1.ts";
import {
  buildPlanGenerationV3UserPrompt,
  PLAN_GENERATION_V3_SYSTEM_PROMPT,
  validatePlanV3Output,
} from "../_shared/v2-prompts/plan-generation.ts";
import type {
  CurrentLevelRuntime,
  PlanContentV3,
  PlanLevelWeek,
  PlanTypeClassificationV1,
  TransformationStatus,
  UserCycleRow,
  UserPlanItemRow,
  UserPlanV2Row,
  UserTransformationRow,
} from "../_shared/v2-types.ts";
import { generateWithGemini } from "../_shared/gemini.ts";
import {
  ADJUST_CURRENT_LEVEL_SYSTEM_PROMPT,
  buildAdjustCurrentLevelUserPrompt,
  buildPlanContentWithAdjustedLevel,
  castAdjustCurrentLevelPatch,
  validateAdjustCurrentLevelPatch,
} from "../_shared/v2-adjust-level-generation.ts";
import { logV2Event, V2_EVENT_TYPES } from "../_shared/v2-events.ts";
import { archivePendingWeekPlansForPlans } from "../_shared/week_plan_lifecycle.ts";
import {
  daysAfterPlannedPrerequisites,
  spreadWeekDays,
} from "../_shared/week_day_distribution.ts";
import { autoApplyWeeklyPlanning } from "../_shared/weekly_planning_lifecycle.ts";
import {
  ONBOARDING_WEEK1_AUTO_VALIDATION_EVENT_CONTEXT,
  ONBOARDING_WEEK1_VALIDATION_PROMPT_EVENT_CONTEXT,
} from "../_shared/onboarding_week1_validation.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import {
  badRequest,
  jsonResponse,
  parseJsonBody,
  serverError,
  z,
} from "../_shared/http.ts";
import { getRequestContext } from "../_shared/request_context.ts";
import { getUserTimeContext } from "../_shared/user_time_context.ts";
import {
  extractStructuredCalibrationFields,
  type StructuredCalibrationFields,
} from "../_shared/v2-calibration-fields.ts";

export { extractStructuredCalibrationFields };

const REQUEST_SCHEMA = z.object({
  transformation_id: z.string().min(1),
  mode: z.enum(["preview", "confirm"]),
  feedback: z.string().trim().min(1).max(4000).optional(),
  force_regenerate: z.boolean().optional(),
  pace: z.enum(["cool", "normal", "intense"]).optional(),
  client_now_iso: z.string().trim().min(1).optional(),
  client_timezone: z.string().trim().min(1).optional(),
  preview_plan_id: z.string().uuid().optional(),
  preserve_active_transformation_id: z.string().trim().min(1).optional(),
  adjustment_context: z.object({
    review_id: z.string().uuid().optional(),
    scope: z.enum(["level", "plan"]),
    effective_start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    reason: z.string().trim().min(1).max(280),
    user_change_summary: z.string().trim().min(1).max(900).optional(),
    assistant_message: z.string().trim().min(1).max(3000).optional(),
  }),
});

const PLAN_ADJUSTMENT_CONFIRMED_PURPOSE = "plan_adjustment_confirmed";
const PLAN_ADJUSTMENT_CONFIRMED_TEXT =
  "C’est fait ✅\nTon plan est bien ajusté.";

function internalSecret(): string {
  return (Deno.env.get("INTERNAL_FUNCTION_SECRET")?.trim() ||
    Deno.env.get("SECRET_KEY")?.trim() || "");
}

function functionsBaseUrl(): string {
  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  if (!supabaseUrl) return "http://kong:8000";
  if (supabaseUrl.includes("http://kong:8000")) return "http://kong:8000";
  return supabaseUrl.replace(/\/+$/, "");
}

async function callWhatsappSend(payload: unknown) {
  const secret = internalSecret();
  if (!secret) throw new Error("Missing INTERNAL_FUNCTION_SECRET");
  const res = await fetch(`${functionsBaseUrl()}/functions/v1/whatsapp-send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Internal-Secret": secret,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(
      `whatsapp-send failed (${res.status}): ${JSON.stringify(data)}`,
    );
    (err as any).status = res.status;
    (err as any).data = data;
    throw err;
  }
  return data;
}

// Confirm a plan adjustment in Sophia's WhatsApp voice. whatsapp-send owns the
// gating: opt-in, paywall (Alliance/Architecte), and the 24h window — free text
// inside the window, else it falls back to the re-engagement template. Sent at
// most once per activated plan version (guards a confirm retry after a gateway
// timeout re-activated the same plan).
async function maybeSendPlanAdjustmentConfirmation(args: {
  admin: SupabaseClient;
  userId: string;
  planId: string;
}) {
  const { data: existing, error: existingErr } = await args.admin
    .from("chat_messages")
    .select("id")
    .eq("user_id", args.userId)
    .eq("role", "assistant")
    .filter("metadata->>purpose", "eq", PLAN_ADJUSTMENT_CONFIRMED_PURPOSE)
    .filter("metadata->>plan_id", "eq", args.planId)
    .limit(1);
  if (existingErr) throw existingErr;
  if ((existing ?? []).length > 0) return;

  await callWhatsappSend({
    user_id: args.userId,
    message: { type: "text", body: PLAN_ADJUSTMENT_CONFIRMED_TEXT },
    purpose: PLAN_ADJUSTMENT_CONFIRMED_PURPOSE,
    require_opted_in: true,
    metadata_extra: {
      source: "adjust_plan_confirm",
      plan_id: args.planId,
    },
  });
}

const ADJUSTED_LEVEL_MAX_WEEKS = 4;

const ACTIVE_OR_RESERVED_PLAN_STATUSES = [
  "generated",
  "active",
  "paused",
] as const;

type TransformationContext = {
  transformation: UserTransformationRow;
  cycle: UserCycleRow;
  existingPlans: Array<
    Pick<
      UserPlanV2Row,
      "id" | "status" | "version" | "generation_attempts" | "created_at"
    >
  >;
  previousTransformation: UserTransformationRow | null;
  previousTransformationPlan: PlanContentV3 | null;
};

// StructuredCalibrationFields, QuestionnaireOptionDescriptor, and
// QuestionnaireSystemQuestionDescriptor are now in _shared/v2-calibration-fields.ts

type JourneyPartResponse = {
  transformation_id: string;
  title: string | null;
  part_number: number;
  estimated_duration_months: number | null;
  status: TransformationStatus | null;
};

const WEEKDAY_ALIASES: Record<string, string> = {
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

const DAY_CODES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type DayCode = typeof DAY_CODES[number];

type JourneyContextResponse = NonNullable<PlanContentV3["journey_context"]> & {
  parts: JourneyPartResponse[];
};

type MultiPartJourneyPayload = {
  is_multi_part: true;
  part_number: number | null;
  estimated_total_parts: number | null;
  continuation_hint: string | null;
  estimated_total_duration_months: number | null;
  previous_transformation_id: string | null;
  next_transformation_id: string | null;
};

function isPlanContentV3(value: unknown): value is PlanContentV3 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.version === 3 && Array.isArray(candidate.phases);
}

type GeneratePlanMode = "preview" | "confirm";

type PlanAdjustmentGenerationContext = {
  reviewId: string | null;
  scope: "level" | "plan";
  effectiveStartDate: string;
  reason: string;
  userChangeSummary: string | null;
  assistantMessage: string | null;
};

export type PlanScheduleAnchor = {
  version: 1;
  timezone: string;
  generated_at_utc: string;
  anchor_local_date: string;
  anchor_local_human: string;
  anchor_week_start: string;
  anchor_week_end: string;
  anchor_display_start: string;
  days_remaining_in_anchor_week: number;
  is_partial_anchor_week: boolean;
  week_starts_on: "monday";
};

const LOCKED_TRANSFORMATION_STATUSES: ReadonlySet<TransformationStatus> =
  new Set([
    "active",
    "completed",
    "abandoned",
    "archived",
  ]);

function parseYmdParts(ymd: string): [number, number, number] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) {
    throw new GeneratePlanV2Error(500, `Invalid local date format: ${ymd}`);
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function dateFromYmdUtc(ymd: string): Date {
  const [year, month, day] = parseYmdParts(ymd);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function formatYmdUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDaysYmd(ymd: string, days: number): string {
  const date = dateFromYmdUtc(ymd);
  date.setUTCDate(date.getUTCDate() + days);
  return formatYmdUtc(date);
}

function isoDayNumberFromYmd(ymd: string): number {
  const day = dateFromYmdUtc(ymd).getUTCDay();
  return day === 0 ? 7 : day;
}

function buildScheduleAnchor(args: {
  nowUtc: string;
  userTimezone: string;
  userLocalDate: string;
  userLocalHuman: string;
}): PlanScheduleAnchor {
  const isoDay = isoDayNumberFromYmd(args.userLocalDate);
  const anchorWeekStart = addDaysYmd(args.userLocalDate, 1 - isoDay);
  const anchorWeekEnd = addDaysYmd(anchorWeekStart, 6);
  const daysRemaining = 8 - isoDay;
  const isPartial = args.userLocalDate !== anchorWeekStart;

  return {
    version: 1,
    timezone: args.userTimezone,
    generated_at_utc: args.nowUtc,
    anchor_local_date: args.userLocalDate,
    anchor_local_human: args.userLocalHuman,
    anchor_week_start: anchorWeekStart,
    anchor_week_end: anchorWeekEnd,
    anchor_display_start: isPartial ? args.userLocalDate : anchorWeekStart,
    days_remaining_in_anchor_week: daysRemaining,
    is_partial_anchor_week: isPartial,
    week_starts_on: "monday",
  };
}

export function buildScheduleAnchorFromUserTimeContext(args: {
  userTimeContext: Awaited<ReturnType<typeof getUserTimeContext>>;
  effectiveStartDate?: string | null;
}): PlanScheduleAnchor {
  const effectiveStartDate = args.effectiveStartDate?.trim() || null;
  return buildScheduleAnchor({
    nowUtc: args.userTimeContext.now_utc,
    userTimezone: args.userTimeContext.user_timezone,
    userLocalDate: effectiveStartDate ?? args.userTimeContext.user_local_date,
    userLocalHuman: effectiveStartDate ?? args.userTimeContext.user_local_human,
  });
}

function applyScheduleAnchorToPlan(
  plan: PlanContentV3,
  anchor: PlanScheduleAnchor,
): PlanContentV3 {
  return {
    ...plan,
    metadata: {
      ...(plan.metadata ?? {}),
      schedule_anchor: anchor,
    },
  };
}

function normalizeDayCodes(days: string[] | null | undefined): DayCode[] {
  const unique = new Set<DayCode>();
  for (const day of days ?? []) {
    const normalized = WEEKDAY_ALIASES[String(day ?? "").trim().toLowerCase()];
    if (normalized && (DAY_CODES as readonly string[]).includes(normalized)) {
      unique.add(normalized as DayCode);
    }
  }
  return [...unique];
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
  return spreadWeekDays({
    availableDays,
    target,
    preferredDays: alignedPlanDays,
  });
}

function getVisibleWeekDays(
  anchor: PlanScheduleAnchor,
  weekOrder: number,
): DayCode[] {
  const fullWeekStart = addDaysYmd(
    anchor.anchor_week_start,
    (weekOrder - 1) * 7,
  );
  const fullWeekEnd = addDaysYmd(anchor.anchor_week_end, (weekOrder - 1) * 7);
  const visibleStart = weekOrder === 1
    ? anchor.anchor_display_start
    : fullWeekStart;
  const days: DayCode[] = [];
  let cursor = dateFromYmdUtc(visibleStart);
  const end = dateFromYmdUtc(fullWeekEnd);
  while (cursor.getTime() <= end.getTime()) {
    const day = cursor.getUTCDay();
    days.push(day === 0 ? "sun" : DAY_CODES[day - 1]);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

function getWeekStartDate(
  anchor: PlanScheduleAnchor,
  weekOrder: number,
): string {
  return addDaysYmd(anchor.anchor_week_start, (weekOrder - 1) * 7);
}

function buildRuntimeWeekItems(args: {
  plan: PlanContentV3;
  runtime: CurrentLevelRuntime;
  week: PlanLevelWeek;
  itemsByTempId: Map<string, UserPlanItemRow>;
}): Array<{ item: UserPlanItemRow; weeklyReps: number | null }> {
  const assignments = Array.isArray(args.week.item_assignments)
    ? args.week.item_assignments
    : [];

  if (assignments.length > 0) {
    return assignments
      .map((assignment) => {
        const item = args.itemsByTempId.get(assignment.temp_id);
        if (!item) return null;
        return {
          item,
          weeklyReps: typeof assignment.weekly_reps === "number"
            ? assignment.weekly_reps
            : null,
        };
      })
      .filter((
        entry,
      ): entry is { item: UserPlanItemRow; weeklyReps: number | null } =>
        Boolean(entry)
      );
  }

  const currentPhase = args.plan.phases.find((phase) =>
    phase.phase_id === args.runtime.phase_id
  );
  if (!currentPhase) return [];

  const fallbackItems: Array<
    { item: UserPlanItemRow; weeklyReps: number | null } | null
  > = currentPhase.items
    .map((planItem) => {
      const tempId = typeof planItem.temp_id === "string"
        ? planItem.temp_id
        : null;
      if (!tempId) return null;
      const item = args.itemsByTempId.get(tempId);
      if (!item) return null;
      return {
        item,
        weeklyReps: null,
      };
    });

  return fallbackItems.filter((
    entry,
  ): entry is { item: UserPlanItemRow; weeklyReps: number | null } =>
    Boolean(entry)
  );
}

// Seuils (minutes locales) au-delà desquels le moment de la journée d'une action est
// considéré comme passé → on ne pose plus l'occurrence sur aujourd'hui, elle glisse au
// prochain jour disponible. "anytime", "night" et null ne sont jamais bloquants.
// "wake_up" (action au réveil même) est passé dès 10h: le lever du jour est derrière.
// NOTE: garder en phase avec generate-plan-v2/index.ts (carte de duplication).
const MOMENT_PASSED_THRESHOLDS_MIN: Record<string, number> = {
  wake_up: 10 * 60,
  morning: 12 * 60,
  afternoon: 18 * 60,
  evening: 22 * 60,
};

function isMomentPassed(
  timeOfDay: string | null,
  nowLocalMinutes: number,
): boolean {
  if (!timeOfDay) return false;
  const threshold = MOMENT_PASSED_THRESHOLDS_MIN[timeOfDay.trim().toLowerCase()];
  if (threshold === undefined) return false;
  return nowLocalMinutes >= threshold;
}

// Date locale ("YYYY-MM-DD") et minutes depuis minuit dans le fuseau donné, pour un
// instant UTC ISO. Sert à savoir si la semaine partielle démarre réellement aujourd'hui
// et quelle heure locale il est au moment de la matérialisation.
function localDateAndMinutesInTz(
  iso: string,
  timeZone: string,
): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const lookup: Record<string, string> = {};
  for (const part of parts) lookup[part.type] = part.value;
  const hour = lookup.hour === "24" ? 0 : Number(lookup.hour);
  return {
    date: `${lookup.year}-${lookup.month}-${lookup.day}`,
    minutes: hour * 60 + Number(lookup.minute),
  };
}

export async function materializeCurrentLevelWeekPlanning(args: {
  admin: SupabaseClient;
  userId: string;
  planId: string;
  plan: PlanContentV3;
  anchor: PlanScheduleAnchor;
  distributedItems: UserPlanItemRow[];
  tempIdMap: Record<string, string>;
  now: string;
}): Promise<void> {
  const runtime = args.plan.current_level_runtime;
  if (!runtime || !Array.isArray(runtime.weeks) || runtime.weeks.length === 0) {
    return;
  }

  const itemsById = new Map(
    args.distributedItems.map((item) => [item.id, item]),
  );
  const itemsByTempId = new Map<string, UserPlanItemRow>();
  for (const [tempId, itemId] of Object.entries(args.tempIdMap)) {
    const item = itemsById.get(itemId);
    if (item) itemsByTempId.set(tempId, item);
  }

  const { date: todayLocalDate, minutes: nowLocalMinutes } =
    localDateAndMinutesInTz(args.now, args.anchor.timezone);

  for (const week of runtime.weeks) {
    const weekOrder = Number(week.week_order);
    if (!Number.isInteger(weekOrder) || weekOrder < 1) continue;

    const weekStartDate = getWeekStartDate(args.anchor, weekOrder);
    const visibleDays = getVisibleWeekDays(args.anchor, weekOrder);
    const weekItems = buildRuntimeWeekItems({
      plan: args.plan,
      runtime,
      week,
      itemsByTempId,
    });
    const oneShotItems = weekItems.filter((entry) =>
      entry.item.dimension !== "habits"
    );
    const missionDays = normalizeDayCodes(week.mission_days);

    // La semaine partielle ne "démarre aujourd'hui" que si son premier jour visible est
    // réellement la date locale du jour (et pas un effective_start_date futur).
    const partialWeekStartsToday = weekOrder === 1 &&
      args.anchor.is_partial_anchor_week &&
      args.anchor.anchor_display_start === todayLocalDate;

    const plannedDayByOneShotItemId = new Map<string, DayCode>();
    oneShotItems.forEach((oneShotEntry, oneShotIndex) => {
      const dropToday = partialWeekStartsToday &&
        visibleDays.length > 0 &&
        isMomentPassed(oneShotEntry.item.time_of_day, nowLocalMinutes);
      const oneShotVisibleDays = dropToday ? visibleDays.slice(1) : visibleDays;
      const mappedDay = missionDays[oneShotIndex];
      const preferredDays = mappedDay && oneShotVisibleDays.includes(mappedDay)
        ? [mappedDay]
        : oneShotVisibleDays;
      const plannedDay = oneShotVisibleDays.length > 0
        ? buildDefaultDays({
          item: oneShotEntry.item,
          preferredDays,
          targetRepsOverride: 1,
        })[0]
        : null;
      if (plannedDay) {
        plannedDayByOneShotItemId.set(oneShotEntry.item.id, plannedDay);
      }
    });

    for (const entry of weekItems) {
      // Si le moment de la journée de l'action est déjà passé et que la semaine partielle
      // démarre aujourd'hui, on retire aujourd'hui (1er jour visible) des jours candidats
      // de CET item : l'occurrence glisse au prochain jour disponible.
      const dropToday = partialWeekStartsToday &&
        visibleDays.length > 0 &&
        isMomentPassed(entry.item.time_of_day, nowLocalMinutes);
      const itemVisibleDays = dropToday ? visibleDays.slice(1) : visibleDays;

      const schedulingDays = entry.item.dimension === "habits"
        ? daysAfterPlannedPrerequisites({
          availableDays: itemVisibleDays,
          activationCondition: entry.item.activation_condition,
          plannedDayByItemId: plannedDayByOneShotItemId,
        })
        : itemVisibleDays;
      const preferredDays = entry.item.dimension === "habits"
        ? schedulingDays
        : (() => {
          const oneShotIndex = oneShotItems.findIndex((candidate) =>
            candidate.item.id === entry.item.id
          );
          const mapped = oneShotIndex >= 0 ? missionDays[oneShotIndex] : null;
          if (mapped && itemVisibleDays.includes(mapped)) return [mapped];
          return itemVisibleDays;
        })();

      const targetRepsOverride = entry.item.dimension === "habits"
        ? Math.min(
          schedulingDays.length,
          effectiveWeeklyTarget(entry.item, entry.weeklyReps ?? undefined),
        )
        : 1;
      // itemVisibleDays vide (aujourd'hui était le seul jour restant de la semaine
      // partielle) → pas d'occurrence cette semaine, sans retomber sur les 7 jours.
      const defaultDays = schedulingDays.length === 0 ? [] : buildDefaultDays({
        item: entry.item,
        preferredDays,
        targetRepsOverride,
      });

      const { data: existingPlanData, error: existingPlanError } = await args
        .admin
        .from("user_habit_week_plans")
        .select("id,status")
        .eq("user_id", args.userId)
        .eq("plan_item_id", entry.item.id)
        .eq("week_start_date", weekStartDate)
        .maybeSingle();
      if (existingPlanError) {
        throw new GeneratePlanV2Error(500, "Failed to inspect week planning", {
          cause: existingPlanError,
        });
      }

      const { data: existingOccurrences, error: existingOccurrencesError } =
        await args.admin
          .from("user_habit_week_occurrences")
          .select("id")
          .eq("user_id", args.userId)
          .eq("plan_item_id", entry.item.id)
          .eq("week_start_date", weekStartDate)
          .limit(1);
      if (existingOccurrencesError) {
        throw new GeneratePlanV2Error(
          500,
          "Failed to inspect week occurrences",
          {
            cause: existingOccurrencesError,
          },
        );
      }

      if (!existingPlanData) {
        const { error: insertPlanError } = await args.admin
          .from("user_habit_week_plans")
          .insert({
            user_id: args.userId,
            cycle_id: entry.item.cycle_id,
            transformation_id: entry.item.transformation_id,
            plan_id: entry.item.plan_id,
            plan_item_id: entry.item.id,
            week_start_date: weekStartDate,
            status: "pending_confirmation",
            updated_at: args.now,
          });
        if (insertPlanError) {
          throw new GeneratePlanV2Error(
            500,
            "Failed to materialize week planning",
            {
              cause: insertPlanError,
            },
          );
        }
      }

      if ((existingOccurrences ?? []).length === 0 && defaultDays.length > 0) {
        const { error: insertOccurrencesError } = await args.admin
          .from("user_habit_week_occurrences")
          .insert(defaultDays.map((day, ordinal) => ({
            user_id: args.userId,
            cycle_id: entry.item.cycle_id,
            transformation_id: entry.item.transformation_id,
            plan_id: entry.item.plan_id,
            plan_item_id: entry.item.id,
            week_start_date: weekStartDate,
            ordinal: ordinal + 1,
            default_day: day,
            planned_day: day,
            status: "planned",
            source: "default_generated",
            updated_at: args.now,
          })));
        if (insertOccurrencesError) {
          throw new GeneratePlanV2Error(
            500,
            "Failed to materialize week occurrences",
            {
              cause: insertOccurrencesError,
            },
          );
        }
      }
    }
  }
}

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return handleCorsOptions(req);

  const corsError = enforceCors(req);
  if (corsError) return corsError;

  const requestId = getRequestContext(req).requestId;

  try {
    if (req.method !== "POST") {
      return jsonResponse(
        req,
        { error: "Method Not Allowed", request_id: requestId },
        { status: 405 },
      );
    }

    const parsedBody = await parseJsonBody(req, REQUEST_SCHEMA, requestId);
    if (!parsedBody.ok) return parsedBody.response;

    const env = getSupabaseEnv();
    const authHeader = String(
      req.headers.get("Authorization") ?? req.headers.get("authorization") ??
        "",
    ).trim();
    if (!authHeader) {
      return jsonResponse(
        req,
        { error: "Missing Authorization header", request_id: requestId },
        { status: 401 },
      );
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

    const userId = authData.user.id;

    const rateLimited = await enforceRateLimit(req, requestId, {
      key: `adjust-plan-v1:${userId}`,
      windows: RATE_PRESETS.llmStandard,
    });
    if (rateLimited) return rateLimited;

    const admin = createClient(env.url, env.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    console.info("[adjust-plan-v1][request]", {
      request_id: requestId,
      user_id: userId,
      transformation_id: parsedBody.data.transformation_id,
      mode: parsedBody.data.mode,
      has_feedback: Boolean(parsedBody.data.feedback?.trim()),
      force_regenerate: parsedBody.data.force_regenerate === true,
      pace: parsedBody.data.pace ?? null,
      preview_plan_id: parsedBody.data.preview_plan_id ?? null,
      preserve_active_transformation_id:
        parsedBody.data.preserve_active_transformation_id ?? null,
    });

    const result = await generatePlanV2ForTransformation({
      admin,
      requestId,
      userId,
      transformationId: parsedBody.data.transformation_id,
      mode: parsedBody.data.mode,
      feedback: parsedBody.data.feedback ?? null,
      forceRegenerate: parsedBody.data.force_regenerate === true,
      pace: parsedBody.data.pace ?? null,
      clientNowIso: parsedBody.data.client_now_iso ?? null,
      clientTimezone: parsedBody.data.client_timezone ?? null,
      previewPlanId: parsedBody.data.preview_plan_id ?? null,
      preserveActiveTransformationId:
        parsedBody.data.preserve_active_transformation_id ?? null,
      adjustmentContext: {
        reviewId: parsedBody.data.adjustment_context.review_id ?? null,
        scope: parsedBody.data.adjustment_context.scope,
        effectiveStartDate:
          parsedBody.data.adjustment_context.effective_start_date,
        reason: parsedBody.data.adjustment_context.reason,
        userChangeSummary:
          parsedBody.data.adjustment_context.user_change_summary ?? null,
        assistantMessage:
          parsedBody.data.adjustment_context.assistant_message ?? null,
      },
    });

    console.info("[adjust-plan-v1][response_ready]", {
      request_id: requestId,
      transformation_id: result.transformation.id,
      plan_id: result.planRow.id,
      plan_status: result.planRow.status,
      distributed_items_count: result.distribution.items.length,
    });

    // On a confirmed adjustment (the change is now live), let Sophia confirm it
    // on WhatsApp. Best-effort: never fail the request on a notification error.
    if (
      parsedBody.data.mode === "confirm" && result.planRow.status === "active"
    ) {
      try {
        await maybeSendPlanAdjustmentConfirmation({
          admin,
          userId,
          planId: result.planRow.id,
        });
      } catch (notifyErr) {
        console.warn(
          "[adjust-plan-v1][plan_adjustment_confirmation_whatsapp_failed]",
          notifyErr,
        );
        await logEdgeFunctionError({
          functionName: "adjust-plan-v1",
          error: notifyErr,
          severity: "warn",
          title: "plan_adjustment_confirmation_whatsapp_failed",
          requestId,
          userId,
          source: "edge",
          metadata: { plan_id: result.planRow.id },
        });
      }
    }

    return jsonResponse(req, {
      request_id: requestId,
      transformation_id: result.transformation.id,
      cycle_id: result.cycle.id,
      plan_id: result.planRow.id,
      plan_version: result.planRow.version,
      generation_attempts: result.planRow.generation_attempts,
      distributed_items_count: result.distribution.items.length,
      event_warnings: result.distribution.warnings,
      roadmap_changed: result.roadmapChanged,
      journey_context: result.journeyContext,
      plan_preview: result.plan,
      plan_status: result.planRow.status,
    });
  } catch (error) {
    console.error("[adjust-plan-v1][error]", {
      request_id: requestId,
      error_name: error instanceof Error ? error.name : "UnknownError",
      error_message: error instanceof Error ? error.message : String(error),
      error_stack: error instanceof Error ? error.stack : null,
    });
    const ctx = getRequestContext(req);
    await logEdgeFunctionError({
      functionName: "adjust-plan-v1",
      error,
      requestId,
      userId: ctx.userId,
      source: "edge",
      metadata: { route: "adjust-plan-v1" },
    });

    if (error instanceof GeneratePlanV2Error) {
      const status = error.status;
      if (status >= 400 && status < 500) {
        if (status === 400) {
          return badRequest(req, requestId, error.message);
        }
        return jsonResponse(
          req,
          { error: error.message, request_id: requestId },
          { status },
        );
      }
      if (status === 503) {
        // Classification unavailable — transient, the client should retry.
        return jsonResponse(
          req,
          { error: error.message, request_id: requestId },
          { status },
        );
      }
    }

    return serverError(req, requestId, "Failed to generate V2 plan");
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}

export class GeneratePlanV2Error extends Error {
  status: number;

  constructor(status: number, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "GeneratePlanV2Error";
    this.status = status;
  }
}

export async function generatePlanV2ForTransformation(params: {
  admin: SupabaseClient;
  requestId: string;
  userId: string;
  transformationId: string;
  mode: GeneratePlanMode;
  feedback: string | null;
  forceRegenerate: boolean;
  pace: "cool" | "normal" | "intense" | null;
  clientNowIso?: string | null;
  clientTimezone?: string | null;
  previewPlanId: string | null;
  preserveActiveTransformationId: string | null;
  adjustmentContext: PlanAdjustmentGenerationContext | null;
}): Promise<{
  cycle: UserCycleRow;
  transformation: UserTransformationRow;
  plan: PlanContentV3;
  planRow: UserPlanV2Row;
  distribution: Awaited<ReturnType<typeof distributePlanItemsV3>>;
  roadmapChanged: boolean;
  journeyContext: JourneyContextResponse | null;
}> {
  const clientNow = params.clientNowIso ? new Date(params.clientNowIso) : null;
  const now = clientNow && Number.isFinite(clientNow.getTime())
    ? clientNow.toISOString()
    : new Date().toISOString();
  const context = await loadTransformationContext(
    params.admin,
    params.userId,
    params.transformationId,
  );
  const requestedPace = normalizeRequestedPace(
    params.pace ?? context.cycle.requested_pace,
  );

  if (params.pace && requestedPace !== context.cycle.requested_pace) {
    const { error: updateCyclePaceError } = await params.admin
      .from("user_cycles")
      .update({
        requested_pace: requestedPace,
        updated_at: now,
      } as Partial<UserCycleRow>)
      .eq("id", context.cycle.id);
    if (updateCyclePaceError) {
      throw new GeneratePlanV2Error(500, "Failed to persist requested pace", {
        cause: updateCyclePaceError,
      });
    }

    context.cycle = {
      ...context.cycle,
      requested_pace: requestedPace,
      updated_at: now,
    };
  }

  const requestedPlanIsLocked = params.previewPlanId
    ? context.existingPlans.some((plan) =>
      plan.id === params.previewPlanId &&
      (plan.status === "active" || plan.status === "paused")
    )
    : false;
  const selectedDraftPlan = params.previewPlanId && !requestedPlanIsLocked
    ? await loadDraftPlanById({
      admin: params.admin,
      transformationId: params.transformationId,
      planId: params.previewPlanId,
    })
    : null;
  const latestDraftPlan = selectedDraftPlan ?? await loadLatestDraftPlan({
    admin: params.admin,
    transformationId: params.transformationId,
  });
  const previousPlanPreview = latestDraftPlan?.content as PlanContentV3 | null;
  const isActivePlanAdjustment = params.adjustmentContext != null;

  if (params.mode === "confirm") {
    console.info("[adjust-plan-v1][confirm][precheck]", {
      request_id: params.requestId,
      user_id: params.userId,
      cycle_id: context.cycle.id,
      transformation_id: context.transformation.id,
      transformation_title: context.transformation.title ?? null,
      latest_draft_plan_id: latestDraftPlan?.id ?? null,
      latest_draft_plan_status: latestDraftPlan?.status ?? null,
      requested_preview_plan_id: params.previewPlanId,
      existing_plans: context.existingPlans.map((plan) => ({
        id: plan.id,
        status: plan.status,
        version: plan.version,
        generation_attempts: plan.generation_attempts,
        created_at: plan.created_at,
      })),
    });
  }

  if (params.mode === "confirm" && latestDraftPlan) {
    console.info("[adjust-plan-v1][confirm][activate_draft]", {
      request_id: params.requestId,
      user_id: params.userId,
      transformation_id: params.transformationId,
      draft_plan_id: latestDraftPlan.id,
    });
    if (
      isActivePlanAdjustment ||
      latestDraftPlan.last_generation_reason === "plan_adjustment"
    ) {
      await archiveLockedPlansForTransformation({
        admin: params.admin,
        transformationId: params.transformationId,
        now,
      });
    } else {
      await deleteOtherPlansForTransformation({
        admin: params.admin,
        transformationId: params.transformationId,
        keepPlanId: latestDraftPlan.id,
      });
    }

    return await activatePersistedPlan({
      admin: params.admin,
      userId: params.userId,
      context,
      planRow: latestDraftPlan,
      now,
      clientTimezone: params.clientTimezone ?? null,
      distributeIfMissing: true,
      preserveActiveTransformationId: params.preserveActiveTransformationId,
    });
  }

  // If a plan is already active or paused, the transformation is truly in use.
  const lockedPlan = context.existingPlans.find((plan) =>
    plan.status === "active" || plan.status === "paused"
  );
  const shouldRegenerateFromLockedPlan = params.mode === "preview" &&
    lockedPlan != null &&
    (params.forceRegenerate || Boolean(params.feedback?.trim()));
  const isActivePlanReplacement = isActivePlanAdjustment ||
    shouldRegenerateFromLockedPlan;
  const activeAdjustmentBasePlanRow =
    (isActivePlanAdjustment || shouldRegenerateFromLockedPlan) && lockedPlan
      ? await loadPlanById({
        admin: params.admin,
        planId: lockedPlan.id,
      })
      : null;
  const activeAdjustmentBasePlan = activeAdjustmentBasePlanRow
    ?.content as unknown as PlanContentV3 | null;
  if (
    params.mode === "preview" &&
    (!lockedPlan || !isPlanContentV3(activeAdjustmentBasePlan))
  ) {
    throw new GeneratePlanV2Error(
      409,
      "No active plan to adjust for this transformation",
    );
  }
  if (
    params.mode === "preview" &&
    params.adjustmentContext?.scope === "level" &&
    lockedPlan &&
    activeAdjustmentBasePlan
  ) {
    if (activeAdjustmentBasePlan.current_level_runtime) {
      return await generateAdjustedCurrentLevelPreview({
        admin: params.admin,
        requestId: params.requestId,
        userId: params.userId,
        transformationId: params.transformationId,
        clientTimezone: params.clientTimezone ?? null,
        feedback: params.feedback?.trim() || null,
        context,
        lockedPlan,
        basePlan: activeAdjustmentBasePlan,
        adjustmentContext: params.adjustmentContext,
        now,
      });
    }
    // Old plans without a detailed current level cannot be adjusted level-only;
    // fall through to the full-plan adjustment frame.
    console.warn("[adjust-plan-v1][level_scope_fallback_to_plan]", {
      request_id: params.requestId,
      transformation_id: params.transformationId,
      locked_plan_id: lockedPlan.id,
    });
  }
  if (lockedPlan && !isActivePlanAdjustment) {
    if (params.mode === "confirm") {
      console.info("[adjust-plan-v1][confirm][activate_locked_plan]", {
        request_id: params.requestId,
        user_id: params.userId,
        transformation_id: params.transformationId,
        locked_plan_id: lockedPlan.id,
        locked_plan_status: lockedPlan.status,
      });
      const persistedLockedPlan = await loadPlanById({
        admin: params.admin,
        planId: lockedPlan.id,
      });
      return await activatePersistedPlan({
        admin: params.admin,
        userId: params.userId,
        context,
        planRow: persistedLockedPlan,
        now,
        clientTimezone: params.clientTimezone ?? null,
        distributeIfMissing: false,
        preserveActiveTransformationId: params.preserveActiveTransformationId,
      });
    }

    if (params.mode === "preview" && !shouldRegenerateFromLockedPlan) {
      const persistedLockedPlan = await loadPlanById({
        admin: params.admin,
        planId: lockedPlan.id,
      });
      const lockedPreview = persistedLockedPlan
        .content as unknown as PlanContentV3;
      if (
        !lockedPreview || lockedPreview.version !== 3 ||
        !Array.isArray(lockedPreview.phases)
      ) {
        throw new GeneratePlanV2Error(500, "Persisted active plan is invalid");
      }

      return {
        cycle: context.cycle,
        transformation: context.transformation,
        plan: lockedPreview,
        planRow: persistedLockedPlan,
        distribution: {
          items: [],
          tempIdMap: {},
          eventLogged: false,
          warnings: [],
        },
        roadmapChanged: false,
        journeyContext: null,
      };
    }

    if (!shouldRegenerateFromLockedPlan) {
      throw new GeneratePlanV2Error(
        409,
        "Transformation already has an active V2 plan",
      );
    }
  }

  // A "generated" plan that has no distributed items is a stuck artifact from a
  // previous timed-out attempt. Recover it if items exist; otherwise delete it
  // so a fresh generation can proceed without hitting the attempt cap.
  const partialPlan = context.existingPlans.find((plan) =>
    plan.status === "generated"
  );
  if (partialPlan) {
    if (params.mode === "confirm") {
      console.warn("[adjust-plan-v1][confirm][partial_plan_found]", {
        request_id: params.requestId,
        user_id: params.userId,
        transformation_id: params.transformationId,
        partial_plan_id: partialPlan.id,
      });
    }
    const recoveryResult = await tryRecoverPartialGeneration({
      admin: params.admin,
      userId: params.userId,
      planId: partialPlan.id,
      context,
      now,
      clientTimezone: params.clientTimezone ?? null,
      preserveActiveTransformationId: params.preserveActiveTransformationId,
    });
    if (recoveryResult) return recoveryResult;

    // No items — delete the stuck plan and fall through to fresh generation.
    const { error: deleteStuckError } = await params.admin
      .from("user_plans_v2")
      .delete()
      .eq("id", partialPlan.id);
    if (deleteStuckError) {
      throw new GeneratePlanV2Error(
        500,
        "Failed to clean up stuck partial plan",
        { cause: deleteStuckError },
      );
    }
    context.existingPlans = context.existingPlans.filter((p) =>
      p.id !== partialPlan.id
    );
  }

  if (
    params.mode === "preview" &&
    latestDraftPlan &&
    !params.feedback?.trim() &&
    !params.forceRegenerate &&
    extractRequestedPaceFromGenerationSnapshot(
        latestDraftPlan.generation_input_snapshot,
      ) === requestedPace
  ) {
    const draftPlan = latestDraftPlan.content as unknown as PlanContentV3;
    if (draftPlan?.version === 3 && Array.isArray(draftPlan.phases)) {
      return {
        cycle: context.cycle,
        transformation: context.transformation,
        plan: draftPlan,
        planRow: latestDraftPlan,
        distribution: {
          items: [],
          tempIdMap: {},
          eventLogged: false,
          warnings: [],
        },
        roadmapChanged: false,
        journeyContext: null,
      };
    }
  }

  if (params.mode === "preview" && latestDraftPlan) {
    await archiveDraftPlans({
      admin: params.admin,
      transformationId: params.transformationId,
      now,
    });
  }

  if (params.mode === "confirm") {
    console.warn(
      "[adjust-plan-v1][confirm][falling_back_to_full_generation]",
      {
        request_id: params.requestId,
        user_id: params.userId,
        cycle_id: context.cycle.id,
        transformation_id: context.transformation.id,
        transformation_title: context.transformation.title ?? null,
      },
    );
  }

  const attemptNumber = computeNextGenerationAttempt(context.existingPlans);
  if (!isActivePlanReplacement && attemptNumber > 2) {
    throw new GeneratePlanV2Error(
      409,
      "Maximum plan generation attempts reached for this transformation",
    );
  }

  const questionnaireAnswers =
    isRecord(context.transformation.questionnaire_answers)
      ? context.transformation.questionnaire_answers
      : {};
  const calibrationFields = extractStructuredCalibrationFields(
    questionnaireAnswers,
    context.transformation.questionnaire_schema,
  );
  let planTypeClassification = extractPlanTypeClassification(
    context.transformation.handoff_payload,
  );
  if (
    shouldRefreshPlanTypeClassification(planTypeClassification) &&
    Object.keys(questionnaireAnswers).length > 0
  ) {
    try {
      const classificationResult = await classifyPlanTypeForTransformation({
        admin: params.admin,
        requestId: params.requestId,
        userId: params.userId,
        transformationId: context.transformation.id,
      });
      planTypeClassification = classificationResult.classification;
      context.transformation = classificationResult.transformation;
    } catch (error) {
      // Hard guardrail: never generate a plan without a classification when
      // questionnaire answers exist. A missing classification silently falls
      // back to "single_transformation" scoping, which would target the
      // GLOBAL objective instead of tranche 1 on a split journey and skip
      // creating the second transformation. Fail loud so the client retries.
      console.error("[adjust-plan-v1][classification_unavailable]", {
        request_id: params.requestId,
        transformation_id: context.transformation.id,
        error_message: error instanceof Error ? error.message : String(error),
      });
      throw new GeneratePlanV2Error(
        503,
        "Plan type classification unavailable — retry plan generation",
        { cause: error },
      );
    }
  }

  const transformationScopedGuidance = deriveTransformationScopedGuidance({
    transformation: context.transformation,
    calibrationFields,
    planTypeClassification,
  });
  const currentJourney = extractMultiPartJourneyPayload(
    context.transformation.handoff_payload,
  );
  const userTimeContext = await getUserTimeContext({
    supabase: params.admin,
    userId: params.userId,
    now: new Date(now),
    timezoneOverride: params.clientTimezone ?? null,
  });
  const scheduleAnchor = buildScheduleAnchorFromUserTimeContext({
    userTimeContext,
    effectiveStartDate: params.adjustmentContext?.effectiveStartDate ?? null,
  });

  const planInput = {
    cycle_id: context.cycle.id,
    transformation_id: context.transformation.id,
    title: cleanRequiredText(
      context.transformation.title,
      "transformation.title",
    ),
    internal_summary: cleanRequiredText(
      context.transformation.internal_summary,
      "transformation.internal_summary",
    ),
    user_summary: cleanRequiredText(
      context.transformation.user_summary,
      "transformation.user_summary",
    ),
    success_definition: transformationScopedGuidance.successDefinition,
    main_constraint: context.transformation.main_constraint,
    questionnaire_answers: questionnaireAnswers,
    questionnaire_schema: context.transformation.questionnaire_schema,
    struggle_duration: calibrationFields.struggle_duration,
    starting_point: calibrationFields.starting_point,
    main_blocker: calibrationFields.main_blocker,
    priority_goal: calibrationFields.priority_goal,
    perceived_difficulty: calibrationFields.perceived_difficulty,
    probable_drivers: calibrationFields.probable_drivers,
    prior_attempts: calibrationFields.prior_attempts,
    self_confidence: calibrationFields.self_confidence,
    success_indicator: transformationScopedGuidance.successIndicator,
    metric_label: calibrationFields.metric_label,
    metric_unit: calibrationFields.metric_unit,
    metric_direction: calibrationFields.metric_direction,
    metric_measurement_mode: calibrationFields.metric_measurement_mode,
    metric_baseline_value: calibrationFields.metric_baseline_value,
    metric_target_value: calibrationFields.metric_target_value,
    metric_baseline_text: calibrationFields.metric_baseline_text,
    metric_target_text: transformationScopedGuidance.metricTargetText,
    previous_transformation_title: context.previousTransformation?.title ??
      null,
    previous_transformation_summary:
      context.previousTransformation?.user_summary ?? null,
    previous_transformation_success_definition:
      context.previousTransformation?.success_definition ?? null,
    previous_transformation_completion_summary:
      context.previousTransformation?.completion_summary ?? null,
    previous_transformation_questionnaire_answers:
      isRecord(context.previousTransformation?.questionnaire_answers)
        ? context.previousTransformation.questionnaire_answers
        : null,
    previous_transformation_questionnaire_schema:
      context.previousTransformation?.questionnaire_schema ?? null,
    previous_transformation_plan_preview: context.previousTransformationPlan,
    journey_part_number: currentJourney?.part_number ?? null,
    journey_total_parts: currentJourney?.estimated_total_parts ?? null,
    journey_continuation_hint: currentJourney?.continuation_hint ?? null,
    user_requested_pace: requestedPace,
    user_age: calculateAgeFromBirthDate(context.cycle.birth_date_snapshot, now),
    user_gender: context.cycle.gender_snapshot,
    user_timezone: userTimeContext.user_timezone,
    user_local_date: userTimeContext.user_local_date,
    user_local_human: userTimeContext.user_local_human,
    user_local_datetime: userTimeContext.user_local_datetime,
    user_local_time: userTimeContext.user_local_time,
    user_local_hour: userTimeContext.user_local_hour,
    user_day_part: userTimeContext.day_part,
    anchor_week_start: scheduleAnchor.anchor_week_start,
    anchor_week_end: scheduleAnchor.anchor_week_end,
    days_remaining_in_anchor_week: scheduleAnchor.days_remaining_in_anchor_week,
    is_partial_anchor_week: scheduleAnchor.is_partial_anchor_week,
    previous_plan_preview: activeAdjustmentBasePlan?.version === 3 &&
        Array.isArray(activeAdjustmentBasePlan.phases)
      ? activeAdjustmentBasePlan
      : params.forceRegenerate
      ? previousPlanPreview
      : null,
    regeneration_feedback: params.adjustmentContext
      ? buildAdjustmentFrameFeedback({
        adjustmentContext: params.adjustmentContext,
        basePlan: activeAdjustmentBasePlan,
        baseFeedback: params.feedback?.trim() || null,
      })
      : params.feedback?.trim() || null,
    plan_type_classification: planTypeClassification,
  } as const;
  const generationFeedback = params.feedback?.trim() || null;
  const generatedPlan = await generateValidatedPlanWithLlm({
    input: planInput,
    requestId: params.requestId,
    userId: params.userId,
    calibrationFields,
    cycleId: context.cycle.id,
    transformationId: context.transformation.id,
    adjustment: params.adjustmentContext
      ? { maxCurrentLevelWeeks: ADJUSTED_LEVEL_MAX_WEEKS }
      : null,
  });
  console.info("[adjust-plan-v1][llm_plan_ready]", {
    request_id: params.requestId,
    transformation_id: context.transformation.id,
    phase_count: generatedPlan.plan.phases.length,
    plan_title: generatedPlan.plan.title,
  });
  const generationInputSnapshot = buildGenerationInputSnapshot({
    now,
    mode: params.mode,
    forceRegenerate: params.forceRegenerate,
    feedback: generationFeedback,
    preserveActiveTransformationId: params.preserveActiveTransformationId,
    cycle: context.cycle,
    transformation: context.transformation,
    calibrationFields,
    requestedPace,
    planTypeClassification,
    llmInput: generatedPlan.finalLlmInput,
  });
  const plan = applyPlanAdjustmentMetadata(
    applyScheduleAnchorToPlan(
      enforceAdjustmentInvariants(generatedPlan.plan, activeAdjustmentBasePlan),
      scheduleAnchor,
    ),
    params.adjustmentContext,
    lockedPlan ?? null,
  );

  const planId = crypto.randomUUID();
  const planRow = buildPlanRow({
    userId: params.userId,
    planId,
    version: attemptNumber,
    llmAttempts: generatedPlan.llmAttempts,
    plan,
    now,
    status: params.mode === "preview" ? "draft" : "generated",
    generationFeedback,
    generationInputSnapshot,
    generationReason: isActivePlanReplacement ? "plan_adjustment" : null,
  });

  const { error: insertPlanError } = await params.admin
    .from("user_plans_v2")
    .insert(planRow as any);
  if (insertPlanError) {
    throw new GeneratePlanV2Error(500, "Failed to persist generated plan", {
      cause: insertPlanError,
    });
  }
  console.info("[adjust-plan-v1][plan_persisted]", {
    request_id: params.requestId,
    transformation_id: context.transformation.id,
    plan_id: planId,
    mode: params.mode,
    status: planRow.status,
  });

  if (params.mode === "preview") {
    console.info("[adjust-plan-v1][preview_complete]", {
      request_id: params.requestId,
      transformation_id: context.transformation.id,
      plan_id: planId,
    });
    return {
      cycle: context.cycle,
      transformation: context.transformation,
      plan,
      planRow,
      distribution: {
        items: [],
        tempIdMap: {},
        eventLogged: false,
        warnings: [],
      },
      roadmapChanged: false,
      journeyContext: null,
    };
  }
  if (isActivePlanAdjustment) {
    await archiveLockedPlansForTransformation({
      admin: params.admin,
      transformationId: params.transformationId,
      now,
    });
  }

  return await activatePersistedPlan({
    admin: params.admin,
    userId: params.userId,
    context,
    planRow,
    now,
    clientTimezone: params.clientTimezone ?? null,
    distributeIfMissing: true,
    preserveActiveTransformationId: params.preserveActiveTransformationId,
  });
}

// scope "level": regenerate ONLY the current level through a small dedicated
// LLM call (~one level of output instead of a full plan), then reassemble the
// plan content around it. The blueprint, future levels and global objective
// are copied verbatim from the base plan — frozen by construction, not by
// prompt goodwill.
async function generateAdjustedCurrentLevelPreview(args: {
  admin: SupabaseClient;
  requestId: string;
  userId: string;
  transformationId: string;
  clientTimezone: string | null;
  feedback: string | null;
  context: TransformationContext;
  lockedPlan: TransformationContext["existingPlans"][number];
  basePlan: PlanContentV3;
  adjustmentContext: PlanAdjustmentGenerationContext;
  now: string;
}): Promise<{
  cycle: UserCycleRow;
  transformation: UserTransformationRow;
  plan: PlanContentV3;
  planRow: UserPlanV2Row;
  distribution: {
    items: UserPlanItemRow[];
    tempIdMap: Record<string, string>;
    eventLogged: boolean;
    warnings: string[];
  };
  roadmapChanged: boolean;
  journeyContext: null;
}> {
  const runtime = args.basePlan.current_level_runtime;
  if (!runtime) {
    throw new GeneratePlanV2Error(
      500,
      "Base plan has no current_level_runtime to adjust",
    );
  }
  const currentPhase = args.basePlan.phases.find(
    (phase) => phase.phase_id === runtime.phase_id,
  );
  if (!currentPhase) {
    throw new GeneratePlanV2Error(
      500,
      `Base plan phase not found for current level (${runtime.phase_id})`,
    );
  }

  const userTimeContext = await getUserTimeContext({
    supabase: args.admin,
    userId: args.userId,
    now: new Date(args.now),
    timezoneOverride: args.clientTimezone,
  });
  const scheduleAnchor = buildScheduleAnchorFromUserTimeContext({
    userTimeContext,
    effectiveStartDate: args.adjustmentContext.effectiveStartDate,
  });

  await archiveDraftPlans({
    admin: args.admin,
    transformationId: args.transformationId,
    now: args.now,
  });
  const attemptNumber = computeNextGenerationAttempt(
    args.context.existingPlans,
  );

  const model = Deno.env.get("SOPHIA_ADJUST_PLAN_MODEL")?.trim() ||
    "gemini-3.1-pro-preview";
  let validationFeedback: string[] | null = null;
  let patch: ReturnType<typeof castAdjustCurrentLevelPatch> | null = null;
  let llmAttempts = 0;
  let finalUserPrompt = "";

  for (let attempt = 1; attempt <= 3 && !patch; attempt += 1) {
    const userPrompt = buildAdjustCurrentLevelUserPrompt({
      plan: args.basePlan,
      currentLevelRuntime: runtime,
      currentPhase,
      adjustmentReason: args.adjustmentContext.reason,
      userChangeSummary: args.adjustmentContext.userChangeSummary,
      assistantMessage: args.adjustmentContext.assistantMessage,
      regenerationFeedback: args.feedback,
      effectiveStartDate: args.adjustmentContext.effectiveStartDate,
      maxWeeks: ADJUSTED_LEVEL_MAX_WEEKS,
      userLocalHuman: userTimeContext.user_local_human ?? null,
      daysRemainingInAnchorWeek: scheduleAnchor.days_remaining_in_anchor_week ??
        null,
      isPartialAnchorWeek: scheduleAnchor.is_partial_anchor_week === true,
      systemValidationFeedback: validationFeedback,
    });
    finalUserPrompt = userPrompt;

    const raw = await generateWithGemini(
      ADJUST_CURRENT_LEVEL_SYSTEM_PROMPT,
      userPrompt,
      0.25,
      true,
      [],
      "auto",
      {
        requestId: `${args.requestId}:adjust-level`,
        source: "adjust-plan-v1.level",
        userId: args.userId,
        model,
        forceInitialModel: true,
        maxRetries: 3,
        httpTimeoutMs: 120_000,
      },
    );
    if (typeof raw !== "string") {
      validationFeedback = [
        "La sortie précédente n'était pas du JSON texte. Retourne uniquement l'objet JSON demandé.",
      ];
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      validationFeedback = [
        "La sortie précédente n'était pas un JSON valide.",
        "Régénère l'objet JSON complet sans texte hors JSON.",
      ];
      continue;
    }
    const validation = validateAdjustCurrentLevelPatch(parsed, {
      currentLevelOrder: runtime.level_order,
      currentPhaseId: runtime.phase_id,
      globalObjective: args.basePlan.global_objective,
      maxWeeks: ADJUSTED_LEVEL_MAX_WEEKS,
    });
    if (validation.valid) {
      patch = castAdjustCurrentLevelPatch(parsed);
      llmAttempts = attempt;
      break;
    }
    validationFeedback = validation.issues;
    console.warn("[adjust-plan-v1][level][retrying_after_invalid_output]", {
      request_id: args.requestId,
      attempt,
      issues: validation.issues,
    });
  }

  if (!patch) {
    throw new GeneratePlanV2Error(
      500,
      `Adjusted level generation failed validation after retries: ${
        (validationFeedback ?? []).join("; ")
      }`,
    );
  }

  const plan = applyPlanAdjustmentMetadata(
    applyScheduleAnchorToPlan(
      buildPlanContentWithAdjustedLevel({
        basePlan: args.basePlan,
        patch,
        adjustedAt: args.now,
      }),
      scheduleAnchor,
    ),
    args.adjustmentContext,
    args.lockedPlan,
  );

  const planId = crypto.randomUUID();
  const planRow = buildPlanRow({
    userId: args.userId,
    planId,
    version: attemptNumber,
    llmAttempts,
    plan,
    now: args.now,
    status: "draft",
    generationFeedback: args.feedback,
    generationInputSnapshot: {
      version: 1,
      mode: "preview",
      generated_at: args.now,
      adjustment_scope: "level",
      base_plan_id: args.lockedPlan.id,
      llm_input: {
        system_prompt: ADJUST_CURRENT_LEVEL_SYSTEM_PROMPT,
        user_prompt: finalUserPrompt,
        system_validation_feedback: validationFeedback,
      },
    },
    generationReason: "plan_adjustment",
  });

  const { error: insertPlanError } = await args.admin
    .from("user_plans_v2")
    .insert(planRow as any);
  if (insertPlanError) {
    throw new GeneratePlanV2Error(500, "Failed to persist adjusted plan", {
      cause: insertPlanError,
    });
  }
  console.info("[adjust-plan-v1][level][preview_complete]", {
    request_id: args.requestId,
    transformation_id: args.transformationId,
    plan_id: planId,
    adjusted_level_order: runtime.level_order,
    adjusted_duration_weeks: patch.adjusted_level.duration_weeks,
  });

  return {
    cycle: args.context.cycle,
    transformation: args.context.transformation,
    plan,
    planRow,
    distribution: {
      items: [],
      tempIdMap: {},
      eventLogged: false,
      warnings: [],
    },
    roadmapChanged: false,
    journeyContext: null,
  };
}

function extractOnboardingV2Payload(
  handoffPayload: UserTransformationRow["handoff_payload"],
): Record<string, unknown> {
  const onboardingV2 = (handoffPayload as
    | { onboarding_v2?: unknown }
    | null
    | undefined)?.onboarding_v2;
  return onboardingV2 && typeof onboardingV2 === "object" &&
      !Array.isArray(onboardingV2)
    ? onboardingV2 as Record<string, unknown>
    : {};
}

function normalizeRequestedPace(
  value: unknown,
): "cool" | "normal" | "intense" | null {
  return value === "cool" || value === "normal" || value === "intense"
    ? value
    : null;
}

function extractRequestedPaceFromGenerationSnapshot(
  snapshot: Record<string, unknown> | null,
): "cool" | "normal" | "intense" | null {
  if (!snapshot) return null;
  return normalizeRequestedPace(snapshot.user_requested_pace);
}

function buildGenerationInputSnapshot(args: {
  now: string;
  mode: GeneratePlanMode;
  forceRegenerate: boolean;
  feedback: string | null;
  preserveActiveTransformationId: string | null;
  cycle: UserCycleRow;
  transformation: UserTransformationRow;
  calibrationFields: StructuredCalibrationFields;
  requestedPace: "cool" | "normal" | "intense" | null;
  planTypeClassification: PlanTypeClassificationV1 | null;
  llmInput: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    version: 1,
    generated_at: args.now,
    mode: args.mode,
    force_regenerate: args.forceRegenerate,
    regeneration_feedback: args.feedback,
    preserve_active_transformation_id: args.preserveActiveTransformationId,
    user_requested_pace: args.requestedPace,
    cycle: {
      id: args.cycle.id,
      status: args.cycle.status,
      raw_intake_text: args.cycle.raw_intake_text,
      validated_structure: args.cycle.validated_structure,
      birth_date_snapshot: args.cycle.birth_date_snapshot,
      gender_snapshot: args.cycle.gender_snapshot,
      requested_pace: args.cycle.requested_pace,
    },
    transformation: {
      id: args.transformation.id,
      priority_order: args.transformation.priority_order,
      status: args.transformation.status,
      title: args.transformation.title,
      internal_summary: args.transformation.internal_summary,
      user_summary: args.transformation.user_summary,
      success_definition: args.transformation.success_definition,
      main_constraint: args.transformation.main_constraint,
      questionnaire_schema: args.transformation.questionnaire_schema,
      questionnaire_answers: args.transformation.questionnaire_answers,
      onboarding_v2: extractOnboardingV2Payload(
        args.transformation.handoff_payload,
      ),
    },
    calibration_fields: args.calibrationFields as unknown as Record<
      string,
      unknown
    >,
    plan_type_classification: args.planTypeClassification,
    llm_input: args.llmInput,
  };
}

async function resolveCycleActiveTransformationId(args: {
  admin: SupabaseClient;
  cycle: UserCycleRow;
  currentTransformation: UserTransformationRow;
  preserveActiveTransformationId: string | null;
}): Promise<string> {
  const requestedId = args.preserveActiveTransformationId?.trim() ?? "";
  if (!requestedId || requestedId === args.currentTransformation.id) {
    return args.currentTransformation.id;
  }

  const { data, error } = await args.admin
    .from("user_transformations")
    .select("id,status")
    .eq("id", requestedId)
    .eq("cycle_id", args.cycle.id)
    .maybeSingle();
  if (error) {
    throw new GeneratePlanV2Error(
      500,
      "Failed to resolve preserved active transformation",
      {
        cause: error,
      },
    );
  }

  if (!data || data.status !== "active") {
    return args.currentTransformation.id;
  }

  return String(data.id);
}

function extractPlanTypeClassification(
  handoffPayload: UserTransformationRow["handoff_payload"],
): PlanTypeClassificationV1 | null {
  const onboardingV2 = extractOnboardingV2Payload(handoffPayload);
  const classification = onboardingV2.plan_type_classification;
  if (
    !classification || typeof classification !== "object" ||
    Array.isArray(classification)
  ) {
    return null;
  }

  const candidate = classification as Record<string, unknown>;
  if (
    typeof candidate.type_key !== "string" ||
    typeof candidate.confidence !== "number" ||
    !candidate.duration_guidance ||
    typeof candidate.duration_guidance !== "object" ||
    Array.isArray(candidate.duration_guidance)
  ) {
    return null;
  }

  return classification as PlanTypeClassificationV1;
}

export function shouldRefreshPlanTypeClassification(
  classification: PlanTypeClassificationV1 | null,
): boolean {
  if (!classification) return true;
  if (classification.journey_strategy?.mode !== "two_transformations") {
    return false;
  }
  return !classification.split_metric_guidance?.transformation_1 ||
    !classification.split_metric_guidance?.transformation_2;
}

function cleanOptionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function parsePositiveInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.trunc(parsed);
    }
  }
  return null;
}

function parsePositiveNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function mergeOnboardingV2Payload(
  handoffPayload: UserTransformationRow["handoff_payload"],
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const current = isRecord(handoffPayload) ? { ...handoffPayload } : {};
  const onboardingV2 = extractOnboardingV2Payload(handoffPayload);
  return {
    ...current,
    onboarding_v2: {
      ...onboardingV2,
      ...patch,
    },
  };
}

function extractMultiPartJourneyPayload(
  handoffPayload: UserTransformationRow["handoff_payload"],
): MultiPartJourneyPayload | null {
  const onboardingV2 = extractOnboardingV2Payload(handoffPayload);
  const raw = onboardingV2.multi_part_journey;
  if (!isRecord(raw)) return null;

  const rawIsMultiPart = raw.is_multi_part;
  if (!(rawIsMultiPart === true || rawIsMultiPart === "true")) {
    return null;
  }

  return {
    is_multi_part: true,
    part_number: parsePositiveInteger(raw.part_number),
    estimated_total_parts: parsePositiveInteger(raw.estimated_total_parts),
    continuation_hint: cleanOptionalText(raw.continuation_hint),
    estimated_total_duration_months: parsePositiveNumber(
      raw.estimated_total_duration_months,
    ),
    previous_transformation_id: cleanOptionalText(
      raw.previous_transformation_id,
    ),
    next_transformation_id: cleanOptionalText(raw.next_transformation_id),
  };
}

function buildStoredMultiPartJourney(args: {
  partNumber: number;
  estimatedTotalParts: number;
  continuationHint: string | null;
  estimatedTotalDurationMonths: number | null;
  previousTransformationId: string | null;
  nextTransformationId: string | null;
}): MultiPartJourneyPayload {
  return {
    is_multi_part: true,
    part_number: args.partNumber,
    estimated_total_parts: args.estimatedTotalParts,
    continuation_hint: args.continuationHint,
    estimated_total_duration_months: args.estimatedTotalDurationMonths,
    previous_transformation_id: args.previousTransformationId,
    next_transformation_id: args.nextTransformationId,
  };
}

function deriveTransformationScopedGuidance(args: {
  transformation: UserTransformationRow;
  calibrationFields: StructuredCalibrationFields;
  planTypeClassification: PlanTypeClassificationV1 | null;
}): {
  successDefinition: string | null;
  successIndicator: string | null;
  metricTargetText: string | null;
} {
  const baseSuccessDefinition = cleanOptionalText(
    args.transformation.success_definition,
  );
  const baseSuccessIndicator = cleanOptionalText(
    args.calibrationFields.success_indicator,
  );
  const baseMetricTargetText = cleanOptionalText(
    args.calibrationFields.metric_target_text,
  );
  const classification = args.planTypeClassification;
  const journey = extractMultiPartJourneyPayload(
    args.transformation.handoff_payload,
  );
  const partNumber = journey?.part_number === 2 ? 2 : 1;
  const splitGuidance = partNumber === 2
    ? classification?.split_metric_guidance?.transformation_2 ?? null
    : classification?.split_metric_guidance?.transformation_1 ?? null;

  if (classification?.journey_strategy?.mode !== "two_transformations") {
    return {
      successDefinition: baseSuccessDefinition,
      successIndicator: baseSuccessIndicator,
      metricTargetText: baseMetricTargetText,
    };
  }

  const splitSuccessDefinition =
    cleanOptionalText(splitGuidance?.success_definition) ??
      cleanOptionalText(
        partNumber === 2
          ? classification.journey_strategy.transformation_2_goal
          : classification.journey_strategy.transformation_1_goal,
      ) ??
      baseSuccessDefinition;
  const splitTargetText = cleanOptionalText(splitGuidance?.target_text) ??
    cleanOptionalText(
      partNumber === 2
        ? classification.journey_strategy.transformation_2_goal
        : classification.journey_strategy.transformation_1_goal,
    ) ??
    baseMetricTargetText;

  return {
    successDefinition: splitSuccessDefinition,
    successIndicator: splitTargetText ?? splitSuccessDefinition ??
      baseSuccessIndicator,
    metricTargetText: splitTargetText,
  };
}

function deriveSplitTransformationTitle(args: {
  currentTitle: string | null;
  continuationHint: string | null;
  nextPartNumber: number;
}): string {
  const hint = String(args.continuationHint ?? "").trim();
  if (hint) {
    return hint.length <= 200 ? hint : `${hint.slice(0, 197).trimEnd()}...`;
  }

  const baseTitle = String(args.currentTitle ?? "").trim() ||
    "Suite du parcours";
  const title = `${baseTitle} — Partie ${args.nextPartNumber}`;
  return title.length <= 200 ? title : title.slice(0, 200).trimEnd();
}

function buildSplitTransformationSeed(args: {
  currentTitle: string | null;
  continuationHint: string | null;
  nextPartNumber: number;
}): {
  title: string;
  userSummary: string;
  internalSummary: string;
  orderingRationale: string;
  questionnaireContext: string[];
} {
  const title = deriveSplitTransformationTitle(args);
  const continuationHint = String(args.continuationHint ?? "").trim();
  const userSummary = continuationHint
    ? `Cette prochaine étape prolongera le travail engagé pour avancer sur "${continuationHint}".`
    : `Cette prochaine étape poursuivra le travail déjà engagé sur "${title}".`;
  const internalSummary = [
    "Transformation créée automatiquement après split du plan V3.",
    args.currentTitle ? `Transformation source: ${args.currentTitle}.` : null,
    continuationHint ? `Continuation hint: ${continuationHint}.` : null,
    `Partie suivante attendue: ${args.nextPartNumber}.`,
  ].filter(Boolean).join(" ");
  const orderingRationale = continuationHint
    ? `Cette étape vient juste après la transformation en cours pour prolonger "${continuationHint}" sans casser l'élan.`
    : "Cette étape vient immédiatement après la transformation en cours pour poursuivre le parcours en plusieurs tranches.";

  return {
    title,
    userSummary,
    internalSummary,
    orderingRationale,
    questionnaireContext: [
      continuationHint
        ? `Affiner ce qu'il reste à accomplir pour "${continuationHint}".`
        : `Préciser ce qu'il reste à accomplir dans "${title}".`,
      "Identifier ce qui a progressé dans la tranche précédente et ce qui bloque encore.",
      "Définir le prochain signe concret de réussite pour cette nouvelle tranche.",
    ],
  };
}

async function ensureSplitTransformation(args: {
  admin: SupabaseClient;
  userId: string;
  cycle: UserCycleRow;
  transformation: UserTransformationRow;
  plan: PlanContentV3;
  now: string;
}): Promise<string | null> {
  const classification = extractPlanTypeClassification(
    args.transformation.handoff_payload,
  );
  if (classification?.journey_strategy?.mode !== "two_transformations") {
    return null;
  }

  const currentJourney = extractMultiPartJourneyPayload(
    args.transformation.handoff_payload,
  );
  if (currentJourney?.part_number != null && currentJourney.part_number >= 2) {
    return null;
  }

  const continuationHint =
    cleanOptionalText(classification.journey_strategy.transformation_2_title) ??
      cleanOptionalText(
        classification.journey_strategy.transformation_2_goal,
      ) ??
      currentJourney?.continuation_hint ??
      null;
  const estimatedTotalDurationMonths = parsePositiveNumber(
    classification.journey_strategy.total_estimated_duration_months,
  ) ??
    currentJourney?.estimated_total_duration_months ??
    null;

  const nextPartNumber = 2;
  const nextTransformationTitle =
    cleanOptionalText(classification.journey_strategy.transformation_2_title) ??
      deriveSplitTransformationTitle({
        currentTitle: args.transformation.title,
        continuationHint,
        nextPartNumber,
      });
  const nextTransformationGoal = cleanOptionalText(
    classification.journey_strategy.transformation_2_goal,
  );
  const nextSuccessDefinition = cleanOptionalText(
    classification.split_metric_guidance?.transformation_2
      ?.success_definition,
  ) ??
    nextTransformationGoal;
  const seed = buildSplitTransformationSeed({
    currentTitle: args.transformation.title,
    continuationHint: nextTransformationTitle,
    nextPartNumber,
  });

  const { data, error } = await args.admin
    .from("user_transformations")
    .select("id, priority_order, status, title, handoff_payload")
    .eq("cycle_id", args.cycle.id)
    .order("priority_order", { ascending: true });
  if (error) {
    throw new GeneratePlanV2Error(
      500,
      "Failed to load transformations for split generation",
      {
        cause: error,
      },
    );
  }

  const rows = (data as
    | Array<
      Pick<
        UserTransformationRow,
        "id" | "priority_order" | "status" | "title" | "handoff_payload"
      >
    >
    | null) ?? [];
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  let nextTransformation = currentJourney?.next_transformation_id
    ? rowsById.get(currentJourney.next_transformation_id) ?? null
    : null;

  if (!nextTransformation) {
    nextTransformation = rows.find((row) => {
      const journey = extractMultiPartJourneyPayload(row.handoff_payload);
      return journey?.previous_transformation_id === args.transformation.id;
    }) ?? null;
  }

  const currentMaxPriority = Math.max(
    0,
    ...rows.map((row) => row.priority_order ?? 0),
  );

  if (!nextTransformation) {
    const nextTransformationId = crypto.randomUUID();
    const nextHandoffPayload = mergeOnboardingV2Payload(null, {
      plan_type_classification: classification,
      ordering_rationale: seed.orderingRationale,
      questionnaire_context: seed.questionnaireContext,
      multi_part_journey: buildStoredMultiPartJourney({
        partNumber: 2,
        estimatedTotalParts: 2,
        continuationHint,
        estimatedTotalDurationMonths,
        previousTransformationId: args.transformation.id,
        nextTransformationId: null,
      }),
      source: "generate_plan_split",
    });

    const { error: insertError } = await args.admin
      .from("user_transformations")
      .insert({
        id: nextTransformationId,
        cycle_id: args.cycle.id,
        priority_order: currentMaxPriority + 1,
        status: "pending",
        title: nextTransformationTitle,
        user_summary: nextTransformationGoal
          ? `Cette deuxième transformation vise ${nextTransformationGoal}.`
          : seed.userSummary,
        internal_summary: nextTransformationGoal
          ? `Transformation 2 du parcours en 2 parties. Objectif: ${nextTransformationGoal}.`
          : seed.internalSummary,
        success_definition: nextSuccessDefinition,
        main_constraint: null,
        questionnaire_schema: null,
        questionnaire_answers: null,
        completion_summary: null,
        handoff_payload: nextHandoffPayload,
        created_at: args.now,
        updated_at: args.now,
        activated_at: null,
        completed_at: null,
      } as any);

    if (insertError) {
      throw new GeneratePlanV2Error(
        500,
        "Failed to create split transformation",
        {
          cause: insertError,
        },
      );
    }

    nextTransformation = {
      id: nextTransformationId,
      priority_order: currentMaxPriority + 1,
      status: "pending",
      title: nextTransformationTitle,
      handoff_payload: nextHandoffPayload,
    };
    rows.push(nextTransformation);
  }

  const orderedIds = rows
    .sort((left, right) => left.priority_order - right.priority_order)
    .map((row) => row.id)
    .filter((id) => id !== nextTransformation.id);
  const currentIndex = orderedIds.indexOf(args.transformation.id);
  orderedIds.splice(
    currentIndex >= 0 ? currentIndex + 1 : orderedIds.length,
    0,
    nextTransformation.id,
  );

  const alreadyNormalized = orderedIds.every((id, index) => {
    const row = rowsById.get(id) ??
      (id === nextTransformation.id ? nextTransformation : null);
    return row?.priority_order === index + 1;
  });

  if (!alreadyNormalized) {
    const stagingBasePriority = Math.max(
      0,
      ...rows.map((row) => row.priority_order ?? 0),
    );
    for (const [index, id] of orderedIds.entries()) {
      const { error: stageError } = await args.admin
        .from("user_transformations")
        .update({
          priority_order: stagingBasePriority + index + 1,
          updated_at: args.now,
        })
        .eq("id", id)
        .eq("cycle_id", args.cycle.id);

      if (stageError) {
        throw new GeneratePlanV2Error(
          500,
          "Failed to stage split transformation ordering",
          {
            cause: stageError,
          },
        );
      }
    }

    for (const [index, id] of orderedIds.entries()) {
      const { error: normalizeError } = await args.admin
        .from("user_transformations")
        .update({
          priority_order: index + 1,
          updated_at: args.now,
        })
        .eq("id", id)
        .eq("cycle_id", args.cycle.id);

      if (normalizeError) {
        throw new GeneratePlanV2Error(
          500,
          "Failed to normalize split transformation ordering",
          {
            cause: normalizeError,
          },
        );
      }
    }
  }

  const currentPayload = mergeOnboardingV2Payload(
    args.transformation.handoff_payload,
    {
      plan_type_classification: classification,
      multi_part_journey: buildStoredMultiPartJourney({
        partNumber: 1,
        estimatedTotalParts: 2,
        continuationHint,
        estimatedTotalDurationMonths,
        previousTransformationId: null,
        nextTransformationId: nextTransformation.id,
      }),
    },
  );
  const nextPayload = mergeOnboardingV2Payload(
    nextTransformation.handoff_payload ?? null,
    {
      plan_type_classification: classification,
      ordering_rationale: seed.orderingRationale,
      questionnaire_context: seed.questionnaireContext,
      multi_part_journey: buildStoredMultiPartJourney({
        partNumber: 2,
        estimatedTotalParts: 2,
        continuationHint,
        estimatedTotalDurationMonths,
        previousTransformationId: args.transformation.id,
        nextTransformationId: null,
      }),
      source: "generate_plan_split",
    },
  );

  const [{ error: currentUpdateError }, { error: nextUpdateError }] =
    await Promise.all([
      args.admin
        .from("user_transformations")
        .update({
          handoff_payload: currentPayload,
          updated_at: args.now,
        })
        .eq("id", args.transformation.id)
        .eq("cycle_id", args.cycle.id),
      args.admin
        .from("user_transformations")
        .update({
          title: nextTransformationTitle,
          user_summary: nextTransformationGoal
            ? `Cette deuxième transformation vise ${nextTransformationGoal}.`
            : seed.userSummary,
          internal_summary: nextTransformationGoal
            ? `Transformation 2 du parcours en 2 parties. Objectif: ${nextTransformationGoal}.`
            : seed.internalSummary,
          success_definition: nextSuccessDefinition,
          handoff_payload: nextPayload,
          updated_at: args.now,
        })
        .eq("id", nextTransformation.id)
        .eq("cycle_id", args.cycle.id),
    ]);

  if (currentUpdateError) {
    throw new GeneratePlanV2Error(
      500,
      "Failed to persist current split journey metadata",
      {
        cause: currentUpdateError,
      },
    );
  }
  if (nextUpdateError) {
    throw new GeneratePlanV2Error(
      500,
      "Failed to persist next split transformation metadata",
      {
        cause: nextUpdateError,
      },
    );
  }

  return nextTransformation.id;
}

async function loadLatestDraftPlan(args: {
  admin: SupabaseClient;
  transformationId: string;
}): Promise<UserPlanV2Row | null> {
  const { data, error } = await args.admin
    .from("user_plans_v2")
    .select("*")
    .eq("transformation_id", args.transformationId)
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new GeneratePlanV2Error(
      500,
      "Failed to load draft preview plan",
      { cause: error },
    );
  }

  return (data as UserPlanV2Row | null) ?? null;
}

async function loadDraftPlanById(args: {
  admin: SupabaseClient;
  transformationId: string;
  planId: string;
}): Promise<UserPlanV2Row> {
  const { data, error } = await args.admin
    .from("user_plans_v2")
    .select("*")
    .eq("id", args.planId)
    .eq("transformation_id", args.transformationId)
    .eq("status", "draft")
    .maybeSingle();

  if (error) {
    throw new GeneratePlanV2Error(
      500,
      "Failed to load requested draft preview plan",
      { cause: error },
    );
  }

  if (!data) {
    throw new GeneratePlanV2Error(
      404,
      "Requested draft preview plan not found",
    );
  }

  return data as UserPlanV2Row;
}

async function deleteOtherPlansForTransformation(args: {
  admin: SupabaseClient;
  transformationId: string;
  keepPlanId: string;
}): Promise<void> {
  const { error } = await args.admin
    .from("user_plans_v2")
    .delete()
    .eq("transformation_id", args.transformationId)
    .neq("id", args.keepPlanId);

  if (error) {
    throw new GeneratePlanV2Error(
      500,
      "Failed to replace previous plans for this transformation",
      { cause: error },
    );
  }
}

async function loadPlanById(args: {
  admin: SupabaseClient;
  planId: string;
}): Promise<UserPlanV2Row> {
  const { data, error } = await args.admin
    .from("user_plans_v2")
    .select("*")
    .eq("id", args.planId)
    .maybeSingle();

  if (error) {
    throw new GeneratePlanV2Error(
      500,
      "Failed to load existing persisted plan",
      { cause: error },
    );
  }

  if (!data) {
    throw new GeneratePlanV2Error(404, "Existing persisted plan not found");
  }

  return data as UserPlanV2Row;
}

async function archiveDraftPlans(args: {
  admin: SupabaseClient;
  transformationId: string;
  now: string;
}): Promise<void> {
  const { data, error } = await args.admin
    .from("user_plans_v2")
    .update({
      status: "archived",
      archived_at: args.now,
      updated_at: args.now,
    } as any)
    .eq("transformation_id", args.transformationId)
    .eq("status", "draft")
    .select("id");

  if (error) {
    throw new GeneratePlanV2Error(
      500,
      "Failed to archive previous preview plan",
      { cause: error },
    );
  }

  await archivePendingWeekPlansForPlans(args.admin, {
    planIds: ((data ?? []) as Array<{ id?: string | null }>).map((row) =>
      String(row.id ?? "")
    ),
    nowIso: args.now,
  });
}

async function archiveLockedPlansForTransformation(args: {
  admin: SupabaseClient;
  transformationId: string;
  now: string;
}): Promise<void> {
  const { data, error } = await args.admin
    .from("user_plans_v2")
    .update({
      status: "archived",
      archived_at: args.now,
      updated_at: args.now,
    } as any)
    .eq("transformation_id", args.transformationId)
    .in("status", ["active", "paused"])
    .select("id");

  if (error) {
    throw new GeneratePlanV2Error(
      500,
      "Failed to archive current active plan before adjustment",
      { cause: error },
    );
  }

  await archivePendingWeekPlansForPlans(args.admin, {
    planIds: ((data ?? []) as Array<{ id?: string | null }>).map((row) =>
      String(row.id ?? "")
    ),
    nowIso: args.now,
  });
}

function scheduleActivationEnrichment(args: {
  admin: SupabaseClient;
  requestId: string;
  userId: string;
  cycle: UserCycleRow;
  transformation: UserTransformationRow;
  planRow: UserPlanV2Row;
  plan: PlanContentV3;
}): void {
  const task = (async () => {
    console.info("[adjust-plan-v1][activation_enrichment][start]", {
      request_id: args.requestId,
      user_id: args.userId,
      transformation_id: args.transformation.id,
      plan_id: args.planRow.id,
    });

    const [supportResult, toolsResult] = await Promise.allSettled([
      classifyAndPersistProfessionalSupport({
        admin: args.admin,
        requestId: `adjust-plan-v1:${args.planRow.id}`,
        userId: args.userId,
        cycle: args.cycle,
        transformation: args.transformation,
        planRow: args.planRow,
        plan: args.plan,
      }),
      classifyAndPersistLevelToolRecommendations({
        admin: args.admin,
        requestId: `adjust-plan-v1:${args.planRow.id}`,
        userId: args.userId,
        cycle: args.cycle,
        transformation: args.transformation,
        planRow: args.planRow,
        plan: args.plan,
      }),
    ]);

    if (supportResult.status === "rejected") {
      console.warn(
        "[adjust-plan-v1][activation_enrichment][support_failed]",
        {
          request_id: args.requestId,
          user_id: args.userId,
          transformation_id: args.transformation.id,
          plan_id: args.planRow.id,
          error: supportResult.reason instanceof Error
            ? supportResult.reason.message
            : String(supportResult.reason),
        },
      );
    }
    if (toolsResult.status === "rejected") {
      console.warn("[adjust-plan-v1][activation_enrichment][tools_failed]", {
        request_id: args.requestId,
        user_id: args.userId,
        transformation_id: args.transformation.id,
        plan_id: args.planRow.id,
        error: toolsResult.reason instanceof Error
          ? toolsResult.reason.message
          : String(toolsResult.reason),
      });
    }
    console.info("[adjust-plan-v1][activation_enrichment][done]", {
      request_id: args.requestId,
      user_id: args.userId,
      transformation_id: args.transformation.id,
      plan_id: args.planRow.id,
      support_status: supportResult.status,
      tools_status: toolsResult.status,
    });
  })().catch((error) => {
    console.warn("[adjust-plan-v1][activation_enrichment][failed]", {
      request_id: args.requestId,
      user_id: args.userId,
      transformation_id: args.transformation.id,
      plan_id: args.planRow.id,
      error: error instanceof Error ? error.message : String(error),
    });
  });

  const edgeRuntime = (
    globalThis as typeof globalThis & {
      EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void };
    }
  ).EdgeRuntime;

  if (typeof edgeRuntime?.waitUntil === "function") {
    edgeRuntime.waitUntil(task);
    return;
  }

  void task;
}

// Auto-validate the effective week of a confirmed adjustment and suppress the
// now-redundant "validate your week" prompt.
//
// autoApplyWeeklyPlanning only flips pending -> auto_applied (and occurrences
// default_generated -> weekly_confirmed): it does NOT reapply recommended days,
// so the days the user just chose in the adjustment are preserved as-is.
//
// The plan->active update already fired trg_request_onboarding_week1_validation_schedule
// before the week was materialized here. Once the week is auto_applied the
// scheduler edge function sees already_confirmed and skips; the explicit cancel
// below closes the race where it enqueued a prompt in the meantime.
async function autoValidateAdjustedWeek(args: {
  admin: SupabaseClient;
  userId: string;
  planId: string;
  weekStartDate: string;
  nowIso: string;
}): Promise<void> {
  const result = await autoApplyWeeklyPlanning(args.admin, {
    userId: args.userId,
    weekStartDate: args.weekStartDate,
    nowIso: args.nowIso,
  });
  if (!result.changed) return;

  const { error } = await args.admin
    .from("scheduled_checkins")
    .update({
      status: "cancelled",
      processed_at: args.nowIso,
      delivery_last_error: "superseded_by_adjustment_auto_validation",
      delivery_last_error_at: args.nowIso,
    } as any)
    .eq("user_id", args.userId)
    .in("event_context", [
      ONBOARDING_WEEK1_VALIDATION_PROMPT_EVENT_CONTEXT,
      ONBOARDING_WEEK1_AUTO_VALIDATION_EVENT_CONTEXT,
    ])
    .in("status", ["pending", "retrying", "awaiting_user"])
    .filter("message_payload->>plan_id", "eq", args.planId);
  if (error) throw error;
}

async function activatePersistedPlan(args: {
  admin: SupabaseClient;
  userId: string;
  context: TransformationContext;
  planRow: UserPlanV2Row;
  now: string;
  clientTimezone?: string | null;
  distributeIfMissing: boolean;
  preserveActiveTransformationId: string | null;
}): Promise<{
  cycle: UserCycleRow;
  transformation: UserTransformationRow;
  plan: PlanContentV3;
  planRow: UserPlanV2Row;
  distribution: Awaited<ReturnType<typeof distributePlanItemsV3>>;
  roadmapChanged: boolean;
  journeyContext: JourneyContextResponse | null;
}> {
  const persistedPlan = args.planRow.content as unknown as PlanContentV3;
  if (
    !persistedPlan || persistedPlan.version !== 3 ||
    !Array.isArray(persistedPlan.phases)
  ) {
    throw new GeneratePlanV2Error(500, "Persisted plan preview is invalid");
  }
  const userTimeContext = await getUserTimeContext({
    supabase: args.admin,
    userId: args.userId,
    now: new Date(args.now),
    timezoneOverride: args.clientTimezone ?? null,
  });
  const adjustmentRevision =
    isPlainObject(persistedPlan.metadata?.plan_adjustment_revision)
      ? persistedPlan.metadata?.plan_adjustment_revision as Record<
        string,
        unknown
      >
      : null;
  const effectiveStartDate =
    typeof adjustmentRevision?.effective_start_date === "string"
      ? adjustmentRevision.effective_start_date
      : null;
  const refreshedScheduleAnchor = buildScheduleAnchorFromUserTimeContext({
    userTimeContext,
    effectiveStartDate,
  });
  const plan = applyScheduleAnchorToPlan(
    persistedPlan,
    refreshedScheduleAnchor,
  );

  const distribution = args.distributeIfMissing
    ? await distributePlanItemsV3({
      supabase: args.admin,
      userId: args.userId,
      planId: args.planRow.id,
      content: plan,
      now: args.now,
      reason: args.planRow.generation_attempts === 1
        ? "initial_generation"
        : "regeneration",
    })
    : {
      items: [],
      tempIdMap: {},
      eventLogged: false,
      warnings: [],
    };

  const planPatch = {
    status: "active",
    activated_at: args.now,
    content: plan as unknown as Record<string, unknown>,
    updated_at: args.now,
  } satisfies Partial<UserPlanV2Row>;
  const { error: activatePlanError } = await args.admin
    .from("user_plans_v2")
    .update(planPatch as any)
    .eq("id", args.planRow.id);
  if (activatePlanError) {
    throw new GeneratePlanV2Error(500, "Failed to activate generated plan", {
      cause: activatePlanError,
    });
  }

  const scopedSuccessDefinition =
    typeof plan.strategy?.success_definition === "string" &&
      plan.strategy.success_definition.trim().length > 0
      ? plan.strategy.success_definition.trim()
      : args.context.transformation.success_definition;
  const transformationPatch = {
    status: "active",
    activated_at: args.now,
    updated_at: args.now,
    success_definition: scopedSuccessDefinition,
  } satisfies Partial<UserTransformationRow>;
  const { error: activateTransformationError } = await args.admin
    .from("user_transformations")
    .update(transformationPatch as any)
    .eq("id", args.context.transformation.id);
  if (activateTransformationError) {
    throw new GeneratePlanV2Error(500, "Failed to activate transformation", {
      cause: activateTransformationError,
    });
  }

  await materializeCurrentLevelWeekPlanning({
    admin: args.admin,
    userId: args.userId,
    planId: args.planRow.id,
    plan,
    anchor: refreshedScheduleAnchor,
    distributedItems: distribution.items,
    tempIdMap: distribution.tempIdMap,
    now: args.now,
  });

  // A plan adjustment is user-initiated and user-approved (they saw the preview
  // and confirmed): the effective week IS what they just decided, so validate it
  // straight away instead of re-asking them to validate it. Only the effective
  // week is auto-applied; future weeks of the level keep the normal weekly
  // validation cadence.
  if (adjustmentRevision) {
    await autoValidateAdjustedWeek({
      admin: args.admin,
      userId: args.userId,
      planId: args.planRow.id,
      weekStartDate: refreshedScheduleAnchor.anchor_week_start,
      nowIso: args.now,
    });
  }

  const splitTransformationId = await ensureSplitTransformation({
    admin: args.admin,
    userId: args.userId,
    cycle: args.context.cycle,
    transformation: {
      ...args.context.transformation,
      ...transformationPatch,
    },
    plan,
    now: args.now,
  });

  const cycleActiveTransformationId = await resolveCycleActiveTransformationId({
    admin: args.admin,
    cycle: args.context.cycle,
    currentTransformation: {
      ...args.context.transformation,
      ...transformationPatch,
    },
    preserveActiveTransformationId: args.preserveActiveTransformationId,
  });

  const cyclePatch = {
    status: "active",
    active_transformation_id: cycleActiveTransformationId,
    duration_months: plan.duration_months,
    updated_at: args.now,
  } satisfies Partial<UserCycleRow>;
  const { error: activateCycleError } = await args.admin
    .from("user_cycles")
    .update(cyclePatch as any)
    .eq("id", args.context.cycle.id);
  if (activateCycleError) {
    throw new GeneratePlanV2Error(500, "Failed to activate cycle", {
      cause: activateCycleError,
    });
  }

  const eventWarnings = [...distribution.warnings];

  const phase1Now = new Date().toISOString();
  const phase1Context = buildPhase1Context({
    cycle: args.context.cycle,
    transformation: args.context.transformation,
    planRow: args.planRow,
    now: phase1Now,
  });

  if (phase1Context) {
    try {
      const latestHandoffPayload = await loadLatestTransformationHandoffPayload(
        {
          admin: args.admin,
          transformationId: args.context.transformation.id,
        },
      );
      const nextHandoffPayload = mergePhase1Payload({
        handoffPayload: latestHandoffPayload,
        context: phase1Context,
        now: phase1Now,
      });
      const { error: phase1ContextError } = await args.admin
        .from("user_transformations")
        .update({
          handoff_payload: nextHandoffPayload,
          updated_at: phase1Now,
        })
        .eq("id", args.context.transformation.id);

      if (phase1ContextError) {
        eventWarnings.push(
          `Failed to persist phase 1 context: ${phase1ContextError.message}`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      eventWarnings.push(`Failed to initialize phase 1: ${message}`);
    }
  }

  scheduleActivationEnrichment({
    admin: args.admin,
    requestId: args.planRow.id,
    userId: args.userId,
    cycle: args.context.cycle,
    transformation: {
      ...args.context.transformation,
      ...transformationPatch,
    },
    planRow: {
      ...args.planRow,
      ...planPatch,
    },
    plan,
  });

  for (
    const [eventType, reason] of [
      [V2_EVENT_TYPES.PLAN_ACTIVATED, "plan_status_active"],
      [V2_EVENT_TYPES.TRANSFORMATION_ACTIVATED, "transformation_status_active"],
    ] as const
  ) {
    try {
      await logV2Event(args.admin, eventType, {
        user_id: args.userId,
        cycle_id: args.context.cycle.id,
        transformation_id: args.context.transformation.id,
        plan_id: args.planRow.id,
        reason,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      eventWarnings.push(`Failed to log ${eventType}: ${message}`);
    }
  }

  const journeyContext = await buildJourneyContextResponse({
    admin: args.admin,
    cycleId: args.context.cycle.id,
    currentTransformationId: args.context.transformation.id,
    currentTransformationTitle: args.context.transformation.title,
    currentPlanDurationMonths: plan.duration_months,
    plan,
  });
  const planWithJourneyContext = journeyContext
    ? {
      ...plan,
      journey_context: {
        is_multi_part: journeyContext.is_multi_part,
        part_number: journeyContext.part_number,
        estimated_total_parts: journeyContext.estimated_total_parts,
        continuation_hint: journeyContext.continuation_hint,
        estimated_total_duration_months:
          journeyContext.estimated_total_duration_months,
      },
    }
    : plan;

  if (journeyContext) {
    const { error: planJourneyContextError } = await args.admin
      .from("user_plans_v2")
      .update({
        content: planWithJourneyContext as unknown as Record<string, unknown>,
        updated_at: args.now,
      })
      .eq("id", args.planRow.id);

    if (planJourneyContextError) {
      throw new GeneratePlanV2Error(
        500,
        "Failed to persist journey context on active plan",
        {
          cause: planJourneyContextError,
        },
      );
    }
  }

  return {
    cycle: { ...args.context.cycle, ...cyclePatch },
    transformation: {
      ...args.context.transformation,
      ...transformationPatch,
    },
    plan: planWithJourneyContext,
    planRow: {
      ...args.planRow,
      ...planPatch,
      content: planWithJourneyContext as unknown as Record<string, unknown>,
    },
    distribution: {
      ...distribution,
      warnings: eventWarnings,
    },
    roadmapChanged: splitTransformationId != null,
    journeyContext,
  };
}

async function tryRecoverPartialGeneration(params: {
  admin: SupabaseClient;
  userId: string;
  planId: string;
  context: TransformationContext;
  now: string;
  clientTimezone?: string | null;
  preserveActiveTransformationId: string | null;
}): Promise<
  {
    cycle: UserCycleRow;
    transformation: UserTransformationRow;
    plan: PlanContentV3;
    planRow: UserPlanV2Row;
    distribution: Awaited<ReturnType<typeof distributePlanItemsV3>>;
    roadmapChanged: boolean;
    journeyContext: JourneyContextResponse | null;
  } | null
> {
  const { admin, userId, planId, context, now } = params;

  const [planResult, itemsResult] = await Promise.all([
    admin.from("user_plans_v2").select("*").eq("id", planId).maybeSingle(),
    admin.from("user_plan_items").select("id").eq("plan_id", planId).limit(1),
  ]);

  if (planResult.error || !planResult.data) return null;
  if (itemsResult.error || !itemsResult.data?.length) return null;

  const planRow = planResult.data as UserPlanV2Row;
  const plan = planRow.content as unknown as PlanContentV3;
  if (!plan || plan.version !== 3 || !Array.isArray(plan.phases)) return null;

  const result = await activatePersistedPlan({
    admin,
    userId,
    context,
    planRow,
    now,
    clientTimezone: params.clientTimezone ?? null,
    distributeIfMissing: false,
    preserveActiveTransformationId: params.preserveActiveTransformationId,
  });
  const { data: distItems } = await admin
    .from("user_plan_items")
    .select("*")
    .eq("plan_id", planId);

  return {
    ...result,
    distribution: {
      items: (distItems ?? []) as any[],
      tempIdMap: result.distribution.tempIdMap,
      eventLogged: result.distribution.eventLogged,
      warnings: result.distribution.warnings,
    },
  };
}

async function loadTransformationContext(
  admin: SupabaseClient,
  userId: string,
  transformationId: string,
): Promise<TransformationContext> {
  const { data: transformationData, error: transformationError } = await admin
    .from("user_transformations")
    .select("*")
    .eq("id", transformationId)
    .maybeSingle();
  if (transformationError) {
    throw new GeneratePlanV2Error(500, "Failed to load transformation", {
      cause: transformationError,
    });
  }
  if (!transformationData) {
    throw new GeneratePlanV2Error(404, "Transformation not found");
  }

  const transformation = transformationData as UserTransformationRow;
  const { data: cycleData, error: cycleError } = await admin
    .from("user_cycles")
    .select("*")
    .eq("id", transformation.cycle_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (cycleError) {
    throw new GeneratePlanV2Error(500, "Failed to load cycle", {
      cause: cycleError,
    });
  }
  if (!cycleData) {
    throw new GeneratePlanV2Error(404, "Cycle not found for this user");
  }

  const { data: existingPlansData, error: existingPlansError } = await admin
    .from("user_plans_v2")
    .select("id,status,version,generation_attempts,created_at")
    .eq("transformation_id", transformationId)
    .order("version", { ascending: false });
  if (existingPlansError) {
    throw new GeneratePlanV2Error(500, "Failed to load existing plans", {
      cause: existingPlansError,
    });
  }

  let previousTransformation: UserTransformationRow | null = null;
  let previousTransformationPlan: PlanContentV3 | null = null;

  const journey = extractMultiPartJourneyPayload(
    transformation.handoff_payload,
  );
  const previousTransformationId =
    journey?.part_number === 2 && journey.previous_transformation_id
      ? journey.previous_transformation_id
      : null;

  if (previousTransformationId) {
    const {
      data: previousTransformationData,
      error: previousTransformationError,
    } = await admin
      .from("user_transformations")
      .select("*")
      .eq("id", previousTransformationId)
      .eq("cycle_id", transformation.cycle_id)
      .maybeSingle();
    if (previousTransformationError) {
      throw new GeneratePlanV2Error(
        500,
        "Failed to load previous transformation",
        {
          cause: previousTransformationError,
        },
      );
    }

    previousTransformation =
      (previousTransformationData as UserTransformationRow | null) ?? null;

    if (previousTransformation) {
      const { data: previousPlanData, error: previousPlanError } = await admin
        .from("user_plans_v2")
        .select("content,status,updated_at,activated_at,completed_at")
        .eq("transformation_id", previousTransformation.id)
        .in("status", ["active", "paused", "completed"])
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (previousPlanError) {
        throw new GeneratePlanV2Error(
          500,
          "Failed to load previous transformation plan",
          {
            cause: previousPlanError,
          },
        );
      }

      const previousPlanContent =
        (previousPlanData as { content?: unknown } | null)?.content;
      if (isPlanContentV3(previousPlanContent)) {
        previousTransformationPlan = previousPlanContent;
      }
    }
  }

  return {
    transformation,
    cycle: cycleData as UserCycleRow,
    existingPlans:
      ((existingPlansData ?? []) as TransformationContext["existingPlans"]),
    previousTransformation,
    previousTransformationPlan,
  };
}

async function loadLatestTransformationHandoffPayload(args: {
  admin: SupabaseClient;
  transformationId: string;
}): Promise<UserTransformationRow["handoff_payload"]> {
  const { data, error } = await args.admin
    .from("user_transformations")
    .select("handoff_payload")
    .eq("id", args.transformationId)
    .maybeSingle();
  if (error) {
    throw new GeneratePlanV2Error(
      500,
      "Failed to reload transformation handoff payload",
      {
        cause: error,
      },
    );
  }
  return (data as { handoff_payload?: Record<string, unknown> | null } | null)
    ?.handoff_payload ?? null;
}

async function buildJourneyContextResponse(args: {
  admin: SupabaseClient;
  cycleId: string;
  currentTransformationId: string;
  currentTransformationTitle: string | null;
  currentPlanDurationMonths: number;
  plan: PlanContentV3;
}): Promise<JourneyContextResponse | null> {
  const { data, error } = await args.admin
    .from("user_transformations")
    .select("id, title, status, priority_order, handoff_payload")
    .eq("cycle_id", args.cycleId)
    .order("priority_order", { ascending: true });
  if (error) {
    throw new GeneratePlanV2Error(
      500,
      "Failed to load transformations for journey context",
      {
        cause: error,
      },
    );
  }

  const rows = (data as
    | Array<
      Pick<
        UserTransformationRow,
        "id" | "title" | "status" | "priority_order" | "handoff_payload"
      >
    >
    | null) ?? [];
  const currentTransformation =
    rows.find((row) => row.id === args.currentTransformationId) ?? null;
  if (!currentTransformation) return null;

  const currentJourney = extractMultiPartJourneyPayload(
    currentTransformation.handoff_payload,
  );
  const classification = extractPlanTypeClassification(
    currentTransformation.handoff_payload,
  );
  const isMultiPart = currentJourney?.is_multi_part === true ||
    classification?.journey_strategy?.mode === "two_transformations";
  if (!isMultiPart) return null;

  const currentPartNumber = currentJourney?.part_number ?? 1;
  const estimatedTotalParts = currentJourney?.estimated_total_parts ?? 2;
  const continuationHint = currentJourney?.continuation_hint ??
    cleanOptionalText(
      classification?.journey_strategy?.transformation_2_title,
    ) ??
    cleanOptionalText(
      classification?.journey_strategy?.transformation_2_goal,
    ) ??
    null;
  const estimatedTotalDurationMonths =
    currentJourney?.estimated_total_duration_months ??
      parsePositiveNumber(
        classification?.journey_strategy?.total_estimated_duration_months,
      ) ??
      null;

  const byId = new Map(rows.map((row) => [row.id, row]));
  const previousTransformation = currentJourney?.previous_transformation_id
    ? byId.get(currentJourney.previous_transformation_id) ?? null
    : currentPartNumber === 2
    ? rows.find((row) =>
      row.priority_order === currentTransformation.priority_order - 1
    ) ?? null
    : null;
  const nextTransformation = currentJourney?.next_transformation_id
    ? byId.get(currentJourney.next_transformation_id) ?? null
    : currentPartNumber === 1
    ? rows.find((row) =>
      row.priority_order === currentTransformation.priority_order + 1
    ) ?? null
    : null;

  const remainingDuration = estimatedTotalDurationMonths != null
    ? Math.max(estimatedTotalDurationMonths - args.currentPlanDurationMonths, 1)
    : null;

  const parts: JourneyPartResponse[] = [];
  if (currentPartNumber === 2 && previousTransformation) {
    parts.push({
      transformation_id: previousTransformation.id,
      title: previousTransformation.title,
      part_number: 1,
      estimated_duration_months: remainingDuration,
      status: previousTransformation.status,
    });
  }

  parts.push({
    transformation_id: currentTransformation.id,
    title: currentTransformation.title ?? args.currentTransformationTitle,
    part_number: currentPartNumber,
    estimated_duration_months: args.currentPlanDurationMonths,
    status: currentTransformation.status,
  });

  if (currentPartNumber === 1 && nextTransformation) {
    parts.push({
      transformation_id: nextTransformation.id,
      title: nextTransformation.title,
      part_number: 2,
      estimated_duration_months: remainingDuration,
      status: nextTransformation.status,
    });
  }

  return {
    is_multi_part: true,
    part_number: currentPartNumber,
    estimated_total_parts: estimatedTotalParts,
    continuation_hint: continuationHint,
    estimated_total_duration_months: estimatedTotalDurationMonths,
    parts,
  };
}

const VALID_PRIMARY_METRIC_MEASUREMENT_MODES: ReadonlySet<string> = new Set([
  "absolute_value",
  "count",
  "frequency",
  "duration",
  "score",
  "milestone",
  "qualitative",
]);

const DIRECTIONAL_PRIMARY_METRIC_TOKENS: ReadonlySet<string> = new Set([
  "increase",
  "decrease",
  "reach_zero",
  "stabilize",
]);

// The shared prompt builder (owned by generate-plan-v2) cannot be modified,
// so the adjustment frame travels inside regeneration_feedback, which the
// prompt renders verbatim. Hard rules are then re-enforced in code after
// generation (enforceAdjustmentInvariants + validator adjustment checks).
function buildAdjustmentFrameFeedback(args: {
  adjustmentContext: PlanAdjustmentGenerationContext;
  basePlan: PlanContentV3 | null;
  baseFeedback: string | null;
}): string {
  const originalLevel = args.basePlan?.current_level_runtime ?? null;
  const lines = [
    "CADRE D'AJUSTEMENT (règles dures, non négociables) :",
    "- Ceci est un AJUSTEMENT d'un plan actif, pas une génération initiale.",
    `- La modification s'applique à partir du ${args.adjustmentContext.effectiveStartDate} ; tout ce qui précède reste figé.`,
    "- L'objectif global (`global_objective`) est IMMUABLE : recopie-le strictement à l'identique depuis le plan existant.",
    `- Le niveau courant ajusté dure AU MAXIMUM ${ADJUSTED_LEVEL_MAX_WEEKS} semaines.`,
    "- Le niveau courant ajusté CONSERVE l'ambition et la place du niveau d'origine : un incrément de progression comparable, recalé sur la réalité actuelle du user. Il n'absorbe JAMAIS les objectifs des niveaux suivants ; le reliquat de progression appartient aux niveaux futurs.",
    originalLevel
      ? `- Niveau d'origine pour référence d'ambition : "${originalLevel.title}" (objectif : ${originalLevel.phase_objective}).`
      : null,
    "- Si le niveau courant dure plusieurs semaines, émets le tableau `weeks` COMPLET (une entrée par semaine) et garde le nombre d'items du niveau ≤ 2 × nombre de semaines.",
    "- Chaque niveau détaillé contient au moins 1 habitude, 1 mission et 1 clarification.",
    "- La suite du plan recomposée reste cohérente et progressive avec la direction globale existante.",
  ].filter((line): line is string => Boolean(line));
  const feedbackBlock = args.baseFeedback
    ? `\n\nDemande d'ajustement du user :\n${args.baseFeedback}`
    : "";
  return `${lines.join("\n")}${feedbackBlock}`;
}

// Hard invariants applied in code after generation, regardless of what the
// LLM produced: the global objective can never drift during an adjustment.
function enforceAdjustmentInvariants(
  plan: PlanContentV3,
  basePlan: PlanContentV3 | null,
): PlanContentV3 {
  if (!basePlan) return plan;
  return {
    ...plan,
    global_objective: basePlan.global_objective,
    plan_blueprint: plan.plan_blueprint
      ? {
        ...plan.plan_blueprint,
        global_objective: basePlan.global_objective,
      }
      : plan.plan_blueprint,
  };
}

async function generatePlanWithLlm(params: {
  input: Parameters<typeof buildPlanGenerationV3UserPrompt>[0];
  requestId: string;
  userId: string;
}): Promise<string> {
  const raw = await generateWithGemini(
    PLAN_GENERATION_V3_SYSTEM_PROMPT,
    buildPlanGenerationV3UserPrompt(params.input),
    0.35,
    true,
    [],
    "auto",
    {
      requestId: `${params.requestId}:adjust-plan-v1`,
      source: "adjust-plan-v1",
      userId: params.userId,
      model: Deno.env.get("SOPHIA_ADJUST_PLAN_MODEL")?.trim() ||
        "gemini-3.1-pro-preview",
      forceInitialModel: true,
      maxRetries: 3,
      httpTimeoutMs: 120_000,
    },
  );

  if (typeof raw !== "string") {
    throw new GeneratePlanV2Error(
      500,
      "LLM returned a tool call instead of a JSON plan",
    );
  }

  return raw;
}

function normalizePrimaryMetricMeasurementMode(
  value: unknown,
  fallback: unknown,
): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (VALID_PRIMARY_METRIC_MEASUREMENT_MODES.has(normalized)) {
    return normalized;
  }

  const fallbackNormalized = typeof fallback === "string"
    ? fallback.trim()
    : "";
  if (
    fallbackNormalized &&
    VALID_PRIMARY_METRIC_MEASUREMENT_MODES.has(fallbackNormalized)
  ) {
    return fallbackNormalized;
  }

  if (normalized && DIRECTIONAL_PRIMARY_METRIC_TOKENS.has(normalized)) {
    return "absolute_value";
  }

  return null;
}

function applyCalibrationToGeneratedPlan(
  parsedPlan: Record<string, unknown>,
  calibrationFields: StructuredCalibrationFields,
): Record<string, unknown> {
  const parsedPrimaryMetric = isRecord(parsedPlan.primary_metric)
    ? parsedPlan.primary_metric as Record<string, unknown>
    : null;
  if (!parsedPrimaryMetric) {
    return parsedPlan;
  }

  if (
    calibrationFields.metric_baseline_text &&
    typeof parsedPrimaryMetric.baseline_value !== "string"
  ) {
    parsedPrimaryMetric.baseline_value = calibrationFields.metric_baseline_text;
  }
  if (
    calibrationFields.metric_target_text &&
    typeof parsedPrimaryMetric.success_target !== "string"
  ) {
    parsedPrimaryMetric.success_target = calibrationFields.metric_target_text;
  }
  if (
    calibrationFields.metric_label &&
    typeof parsedPrimaryMetric.label !== "string"
  ) {
    parsedPrimaryMetric.label = calibrationFields.metric_label;
  }
  if (
    calibrationFields.metric_unit &&
    parsedPrimaryMetric.unit == null
  ) {
    parsedPrimaryMetric.unit = calibrationFields.metric_unit;
  }

  const normalizedMeasurementMode = normalizePrimaryMetricMeasurementMode(
    parsedPrimaryMetric.measurement_mode,
    calibrationFields.metric_measurement_mode,
  );
  if (normalizedMeasurementMode) {
    parsedPrimaryMetric.measurement_mode = normalizedMeasurementMode;
  }

  return parsedPlan;
}

// Adjustment-only checks layered on top of the shared validator: an adjusted
// current level must stay within ADJUSTED_LEVEL_MAX_WEEKS so it keeps the
// original level's footprint instead of absorbing the rest of the plan.
export function collectAdjustmentValidationIssues(
  raw: unknown,
  maxCurrentLevelWeeks: number,
): string[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const runtime = (raw as Record<string, unknown>).current_level_runtime;
  if (!runtime || typeof runtime !== "object" || Array.isArray(runtime)) {
    return [];
  }
  const issues: string[] = [];
  const candidate = runtime as Record<string, unknown>;
  const durationWeeks = Number(candidate.duration_weeks);
  if (Number.isFinite(durationWeeks) && durationWeeks > maxCurrentLevelWeeks) {
    issues.push(
      `current_level_runtime.duration_weeks must be <= ${maxCurrentLevelWeeks} for a plan adjustment (got ${durationWeeks}); keep the adjusted level within the original level's footprint and leave the remaining progression to future levels`,
    );
  }
  if (
    Array.isArray(candidate.weeks) &&
    candidate.weeks.length > maxCurrentLevelWeeks
  ) {
    issues.push(
      `current_level_runtime.weeks must contain at most ${maxCurrentLevelWeeks} weeks for a plan adjustment (got ${candidate.weeks.length})`,
    );
  }
  return issues;
}

function shouldRetryPlanGeneration(error: unknown): boolean {
  if (!(error instanceof GeneratePlanV2Error)) return false;
  return error.message === "LLM returned invalid JSON" ||
    error.message.startsWith("Generated plan failed validation:");
}

function extractPlanValidationIssues(error: unknown): string[] {
  if (!(error instanceof GeneratePlanV2Error)) return [];
  if (error.message === "LLM returned invalid JSON") {
    return [
      "La sortie précédente n'était pas un JSON valide.",
      "Régénère un objet JSON complet sans texte hors JSON, sans coupure et sans fragments corrompus.",
    ];
  }
  const prefix = "Generated plan failed validation:";
  if (!error.message.startsWith(prefix)) return [];
  return error.message
    .slice(prefix.length)
    .split(";")
    .map((issue) => issue.trim())
    .filter((issue) => issue.length > 0);
}

async function generateValidatedPlanWithLlm(params: {
  input: Parameters<typeof buildPlanGenerationV3UserPrompt>[0];
  requestId: string;
  userId: string;
  calibrationFields: StructuredCalibrationFields;
  cycleId: string;
  transformationId: string;
  adjustment: { maxCurrentLevelWeeks: number } | null;
}): Promise<{
  plan: PlanContentV3;
  finalLlmInput: Record<string, unknown>;
  llmAttempts: number;
}> {
  let validationFeedback: string[] | null = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const llmInput = {
      ...params.input,
      system_validation_feedback: validationFeedback,
    };

    const rawPlan = await generatePlanWithLlm({
      input: llmInput,
      requestId: params.requestId,
      userId: params.userId,
    });

    try {
      const parsedPlan = parseGeneratedPlan(rawPlan) as Record<string, unknown>;
      const hydratedPlan = applyCalibrationToGeneratedPlan(
        parsedPlan,
        params.calibrationFields,
      );
      const plan = validateGeneratedPlanAgainstContext(hydratedPlan, {
        cycleId: params.cycleId,
        transformationId: params.transformationId,
        adjustment: params.adjustment,
      });
      return {
        plan,
        finalLlmInput: llmInput as unknown as Record<string, unknown>,
        llmAttempts: attempt,
      };
    } catch (error) {
      const shouldRetry = attempt < 2 && shouldRetryPlanGeneration(error);
      if (!shouldRetry) {
        throw error;
      }

      validationFeedback = extractPlanValidationIssues(error);
      console.warn(
        "[adjust-plan-v1] retrying after invalid structured output",
        {
          request_id: params.requestId,
          issues: validationFeedback,
        },
      );
    }
  }

  throw new GeneratePlanV2Error(
    500,
    "Plan generation retry loop ended unexpectedly",
  );
}

export function parseGeneratedPlan(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new GeneratePlanV2Error(500, "LLM returned invalid JSON", {
      cause: error,
    });
  }
}

function buildFallbackPhaseDurationGuidance(
  durationMonths: unknown,
  phaseCount: number,
): string {
  const safePhaseCount = Math.max(1, phaseCount);
  const months =
    typeof durationMonths === "number" && Number.isFinite(durationMonths)
      ? Math.min(4, Math.max(1, durationMonths))
      : safePhaseCount;
  const weeksPerPhase = Math.max(1, Math.round((months * 4) / safePhaseCount));

  if (weeksPerPhase >= 8) {
    const monthsPerPhase = Math.max(1, Math.round(weeksPerPhase / 4));
    return monthsPerPhase <= 1
      ? "Environ 1 mois"
      : `Environ ${monthsPerPhase} mois`;
  }

  return weeksPerPhase <= 1
    ? "Environ 1 semaine"
    : `Environ ${weeksPerPhase} semaines`;
}

const CANONICAL_FINAL_HABIT_WEEKLY_REPS = 6;

export function validateGeneratedPlanAgainstContext(
  raw: unknown,
  context: {
    cycleId: string;
    transformationId: string;
    adjustment?: { maxCurrentLevelWeeks: number } | null;
  },
): PlanContentV3 {
  const normalizedRaw = normalizeGeneratedPlanForValidation(raw);
  const validation = validatePlanV3Output(normalizedRaw);
  const issues = [...validation.issues];
  if (context.adjustment) {
    issues.push(
      ...collectAdjustmentValidationIssues(
        normalizedRaw,
        context.adjustment.maxCurrentLevelWeeks,
      ),
    );
  }
  if (!validation.valid || issues.length > 0) {
    throw new GeneratePlanV2Error(
      500,
      `Generated plan failed validation: ${issues.join("; ")}`,
    );
  }

  const plan = normalizedRaw as PlanContentV3;
  if (plan.cycle_id !== context.cycleId) {
    throw new GeneratePlanV2Error(
      500,
      `Generated plan cycle_id mismatch: ${plan.cycle_id} !== ${context.cycleId}`,
    );
  }
  if (plan.transformation_id !== context.transformationId) {
    throw new GeneratePlanV2Error(
      500,
      "Generated plan transformation_id mismatch",
    );
  }

  const canonicalizedPlan = enforceCanonicalFinalHabitWeeklyReps(plan);

  return {
    ...canonicalizedPlan,
    duration_months: Math.min(4, Math.max(1, Math.trunc(plan.duration_months))),
    global_objective: typeof canonicalizedPlan.global_objective === "string" &&
        canonicalizedPlan.global_objective.trim().length > 0
      ? canonicalizedPlan.global_objective
      : canonicalizedPlan.strategy?.success_definition?.trim() ||
        canonicalizedPlan.title,
    situation_context:
      typeof canonicalizedPlan.situation_context === "string" &&
        canonicalizedPlan.situation_context.trim().length > 0
        ? canonicalizedPlan.situation_context
        : canonicalizedPlan.user_summary,
    mechanism_analysis:
      typeof canonicalizedPlan.mechanism_analysis === "string" &&
        canonicalizedPlan.mechanism_analysis.trim().length > 0
        ? canonicalizedPlan.mechanism_analysis
        : canonicalizedPlan.internal_summary,
    key_understanding:
      typeof canonicalizedPlan.key_understanding === "string" &&
        canonicalizedPlan.key_understanding.trim().length > 0
        ? canonicalizedPlan.key_understanding
        : canonicalizedPlan.strategy?.success_definition?.trim() ||
          canonicalizedPlan.title,
    progression_logic:
      typeof canonicalizedPlan.progression_logic === "string" &&
        canonicalizedPlan.progression_logic.trim().length > 0
        ? canonicalizedPlan.progression_logic
        : canonicalizedPlan.timeline_summary,
    primary_metric: canonicalizedPlan.primary_metric &&
        typeof canonicalizedPlan.primary_metric === "object"
      ? canonicalizedPlan.primary_metric
      : {
        label: "Indicateur de réussite",
        unit: null,
        success_target:
          canonicalizedPlan.strategy?.success_definition?.trim() ||
          canonicalizedPlan.title,
        measurement_mode: "qualitative" as const,
      },
    phases: Array.isArray(canonicalizedPlan.phases)
      ? canonicalizedPlan.phases.map((phase) => ({
        ...phase,
        duration_guidance: typeof phase.duration_guidance === "string" &&
            phase.duration_guidance.trim().length > 0
          ? phase.duration_guidance.trim()
          : buildFallbackPhaseDurationGuidance(
            canonicalizedPlan.duration_months,
            canonicalizedPlan.phases.length,
          ),
        what_this_phase_targets:
          typeof phase.what_this_phase_targets === "string" &&
            phase.what_this_phase_targets.trim().length > 0
            ? phase.what_this_phase_targets
            : phase.phase_objective,
        why_this_now: typeof phase.why_this_now === "string" &&
            phase.why_this_now.trim().length > 0
          ? phase.why_this_now
          : phase.rationale,
        how_this_phase_works: typeof phase.how_this_phase_works === "string" &&
            phase.how_this_phase_works.trim().length > 0
          ? phase.how_this_phase_works
          : phase.phase_objective,
        phase_metric_target: typeof phase.phase_metric_target === "string" &&
            phase.phase_metric_target.trim().length > 0
          ? phase.phase_metric_target.trim()
          : canonicalizedPlan.primary_metric?.success_target?.trim() ||
            phase.phase_objective,
      }))
      : [],
    strategy: {
      ...canonicalizedPlan.strategy,
      identity_shift:
        typeof canonicalizedPlan.strategy?.identity_shift === "string"
          ? canonicalizedPlan.strategy.identity_shift
          : null,
      core_principle:
        typeof canonicalizedPlan.strategy?.core_principle === "string"
          ? canonicalizedPlan.strategy.core_principle
          : null,
    },
    journey_context: null,
  };
}

function enforceCanonicalFinalHabitWeeklyReps(
  plan: PlanContentV3,
): PlanContentV3 {
  const canonicalMainHabitByPhaseId = new Map<string, string>();

  const normalizedPhases = plan.phases.map((phase) => {
    if (!Array.isArray(phase.weeks) || phase.weeks.length === 0) return phase;

    const itemsByTempId = new Map(
      phase.items.map((item) => [item.temp_id, item]),
    );
    const lastWeekIndex = phase.weeks.length - 1;
    const lastWeek = phase.weeks[lastWeekIndex];
    const assignments = Array.isArray(lastWeek.item_assignments)
      ? lastWeek.item_assignments
      : [];
    const mainHabitAssignment = assignments.find((assignment) => {
      const item = itemsByTempId.get(assignment.temp_id);
      return item?.dimension === "habits";
    });

    if (!mainHabitAssignment) return phase;

    const mainHabitTempId = mainHabitAssignment.temp_id;
    canonicalMainHabitByPhaseId.set(phase.phase_id, mainHabitTempId);

    return {
      ...phase,
      heartbeat: {
        ...phase.heartbeat,
        target: CANONICAL_FINAL_HABIT_WEEKLY_REPS,
      },
      items: phase.items.map((item) =>
        item.temp_id === mainHabitTempId
          ? {
            ...item,
            target_reps: CANONICAL_FINAL_HABIT_WEEKLY_REPS,
            cadence_label: replaceFirstStandaloneInteger(
              item.cadence_label,
              CANONICAL_FINAL_HABIT_WEEKLY_REPS,
            ) ?? item.cadence_label,
          }
          : item
      ),
      weeks: phase.weeks.map((week, index) =>
        index === lastWeekIndex
          ? {
            ...week,
            weekly_target_value: CANONICAL_FINAL_HABIT_WEEKLY_REPS,
            weekly_target_label: replaceFirstStandaloneInteger(
              week.weekly_target_label,
              CANONICAL_FINAL_HABIT_WEEKLY_REPS,
            ) ?? week.weekly_target_label ?? null,
            reps_summary: replaceFirstStandaloneInteger(
              week.reps_summary,
              CANONICAL_FINAL_HABIT_WEEKLY_REPS,
            ) ?? week.reps_summary ?? null,
            item_assignments: Array.isArray(week.item_assignments)
              ? week.item_assignments.map((assignment) =>
                assignment.temp_id === mainHabitTempId
                  ? {
                    ...assignment,
                    weekly_reps: CANONICAL_FINAL_HABIT_WEEKLY_REPS,
                    weekly_cadence_label: replaceFirstStandaloneInteger(
                      assignment.weekly_cadence_label,
                      CANONICAL_FINAL_HABIT_WEEKLY_REPS,
                    ) ?? assignment.weekly_cadence_label ?? null,
                    weekly_description_override: replaceFirstStandaloneInteger(
                      assignment.weekly_description_override,
                      CANONICAL_FINAL_HABIT_WEEKLY_REPS,
                    ) ?? assignment.weekly_description_override ?? null,
                  }
                  : assignment
              )
              : week.item_assignments,
          }
          : week
      ),
    };
  });

  const normalizedCurrentLevelRuntime = plan.current_level_runtime
    ? (() => {
      const phaseId = plan.current_level_runtime?.phase_id;
      if (!phaseId) return plan.current_level_runtime;
      const mainHabitTempId = canonicalMainHabitByPhaseId.get(phaseId);
      if (!mainHabitTempId) return plan.current_level_runtime;
      const runtimeWeeks = Array.isArray(plan.current_level_runtime.weeks)
        ? plan.current_level_runtime.weeks
        : [];
      const lastWeekIndex = runtimeWeeks.length - 1;
      return {
        ...plan.current_level_runtime,
        heartbeat: {
          ...plan.current_level_runtime.heartbeat,
          target: CANONICAL_FINAL_HABIT_WEEKLY_REPS,
        },
        weeks: runtimeWeeks.map((week, index) =>
          index === lastWeekIndex
            ? {
              ...week,
              weekly_target_value: CANONICAL_FINAL_HABIT_WEEKLY_REPS,
              weekly_target_label: replaceFirstStandaloneInteger(
                week.weekly_target_label,
                CANONICAL_FINAL_HABIT_WEEKLY_REPS,
              ) ?? week.weekly_target_label ?? null,
              reps_summary: replaceFirstStandaloneInteger(
                week.reps_summary,
                CANONICAL_FINAL_HABIT_WEEKLY_REPS,
              ) ?? week.reps_summary ?? null,
              item_assignments: Array.isArray(week.item_assignments)
                ? week.item_assignments.map((assignment) =>
                  assignment.temp_id === mainHabitTempId
                    ? {
                      ...assignment,
                      weekly_reps: CANONICAL_FINAL_HABIT_WEEKLY_REPS,
                      weekly_cadence_label: replaceFirstStandaloneInteger(
                        assignment.weekly_cadence_label,
                        CANONICAL_FINAL_HABIT_WEEKLY_REPS,
                      ) ?? assignment.weekly_cadence_label ?? null,
                      weekly_description_override:
                        replaceFirstStandaloneInteger(
                          assignment.weekly_description_override,
                          CANONICAL_FINAL_HABIT_WEEKLY_REPS,
                        ) ?? assignment.weekly_description_override ?? null,
                    }
                    : assignment
                )
                : week.item_assignments,
            }
            : week
        ),
      };
    })()
    : plan.current_level_runtime;

  return {
    ...plan,
    phases: normalizedPhases,
    current_level_runtime: normalizedCurrentLevelRuntime,
  };
}

function normalizeGeneratedPlanForValidation(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return raw;
  }

  const candidate = raw as Record<string, unknown>;
  if (!Array.isArray(candidate.phases)) {
    return raw;
  }

  const phaseCount = candidate.phases.length;
  const fallbackDurationGuidance = buildFallbackPhaseDurationGuidance(
    candidate.duration_months,
    phaseCount,
  );
  const primaryMetric =
    candidate.primary_metric && typeof candidate.primary_metric === "object" &&
      !Array.isArray(candidate.primary_metric)
      ? candidate.primary_metric as Record<string, unknown>
      : null;
  const primaryMetricLabel = typeof primaryMetric?.label === "string" &&
      primaryMetric.label.trim().length > 0
    ? primaryMetric.label.trim()
    : "l'indicateur global";
  const primaryMetricSuccessTarget =
    typeof primaryMetric?.success_target === "string" &&
      primaryMetric.success_target.trim().length > 0
      ? primaryMetric.success_target.trim()
      : null;
  const blueprint =
    candidate.plan_blueprint && typeof candidate.plan_blueprint === "object" &&
      !Array.isArray(candidate.plan_blueprint)
      ? candidate.plan_blueprint as Record<string, unknown>
      : null;
  const currentLevelRuntime = candidate.current_level_runtime &&
      typeof candidate.current_level_runtime === "object" &&
      !Array.isArray(candidate.current_level_runtime)
    ? candidate.current_level_runtime as Record<string, unknown>
    : null;
  const currentLevelPhaseId = typeof currentLevelRuntime?.phase_id === "string"
    ? currentLevelRuntime.phase_id.trim()
    : "";
  const currentLevelPhase = currentLevelPhaseId
    ? candidate.phases.find((phase) =>
      isPlainObject(phase) &&
      typeof phase.phase_id === "string" &&
      phase.phase_id.trim() === currentLevelPhaseId
    ) ?? null
    : null;
  const currentLevelPhaseOrder = isPlainObject(currentLevelPhase) &&
      typeof currentLevelPhase.phase_order === "number" &&
      Number.isInteger(currentLevelPhase.phase_order) &&
      currentLevelPhase.phase_order >= 1
    ? currentLevelPhase.phase_order
    : null;
  const currentLevelPhaseItemsByTempId = buildPhaseItemsByTempId(
    isPlainObject(currentLevelPhase) ? currentLevelPhase : null,
  );
  const runtimeLevelOrder = currentLevelPhaseOrder ??
    (typeof currentLevelRuntime?.level_order === "number" &&
        Number.isInteger(currentLevelRuntime.level_order) &&
        currentLevelRuntime.level_order >= 1
      ? currentLevelRuntime.level_order
      : null);
  const normalizedBlueprint = blueprint && Array.isArray(blueprint.levels)
    ? normalizePlanBlueprintLevels({
      blueprint,
      currentLevelOrder: runtimeLevelOrder,
      currentPhaseId: currentLevelPhaseId || null,
    })
    : blueprint;
  const normalizedCurrentLevelRuntime = currentLevelRuntime
    ? {
      ...currentLevelRuntime,
      ...(runtimeLevelOrder != null ? { level_order: runtimeLevelOrder } : {}),
      ...(Array.isArray(currentLevelRuntime.weeks)
        ? {
          weeks: currentLevelRuntime.weeks.map((week) => {
            if (!week || typeof week !== "object" || Array.isArray(week)) {
              return week;
            }

            const weekRecord = week as Record<string, unknown>;
            const missionDays = Array.isArray(weekRecord.mission_days)
              ? weekRecord.mission_days
                .filter((day): day is string => typeof day === "string")
                .map((day) => day.trim())
                .filter((day, index, array) =>
                  day.length > 0 && array.indexOf(day) === index
                )
              : [];
            const oneShotAssignmentCount = countOneShotAssignments({
              week: weekRecord,
              phaseItemsByTempId: currentLevelPhaseItemsByTempId,
            });

            return {
              ...weekRecord,
              mission_days: oneShotAssignmentCount > 0
                ? missionDays.slice(0, oneShotAssignmentCount)
                : [],
            };
          }),
        }
        : {}),
    }
    : currentLevelRuntime;
  const metadata =
    candidate.metadata && typeof candidate.metadata === "object" &&
      !Array.isArray(candidate.metadata)
      ? candidate.metadata as Record<string, unknown>
      : candidate.metadata;
  const normalizedMetadata = isPlainObject(metadata)
    ? normalizePlanMetadata(metadata)
    : metadata;

  return {
    ...candidate,
    ...(normalizedMetadata ? { metadata: normalizedMetadata } : {}),
    ...(normalizedBlueprint ? { plan_blueprint: normalizedBlueprint } : {}),
    ...(normalizedCurrentLevelRuntime
      ? { current_level_runtime: normalizedCurrentLevelRuntime }
      : {}),
    phases: candidate.phases.map((phase) => {
      if (!phase || typeof phase !== "object" || Array.isArray(phase)) {
        return phase;
      }

      const phaseRecord = phase as Record<string, unknown>;
      const maintainedFoundation =
        Array.isArray(phaseRecord.maintained_foundation)
          ? phaseRecord.maintained_foundation
            .filter((value): value is string => typeof value === "string")
            .map((value) => value.trim())
            .filter((value) => value.length > 0)
            .slice(0, 3)
          : phaseRecord.maintained_foundation;
      const durationGuidance =
        typeof phaseRecord.duration_guidance === "string" &&
          phaseRecord.duration_guidance.trim().length > 0
          ? phaseRecord.duration_guidance.trim()
          : fallbackDurationGuidance;
      const phaseMetricTarget =
        typeof phaseRecord.phase_metric_target === "string" &&
          phaseRecord.phase_metric_target.trim().length > 0
          ? phaseRecord.phase_metric_target.trim()
          : primaryMetricSuccessTarget
          ? `Cible du niveau de plan sur ${primaryMetricLabel} : ${primaryMetricSuccessTarget}`
          : `Cible du niveau de plan sur ${primaryMetricLabel}`;

      return {
        ...phaseRecord,
        duration_guidance: durationGuidance,
        phase_metric_target: phaseMetricTarget,
        maintained_foundation: maintainedFoundation,
      };
    }),
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function trimNonEmptyStringArray(
  value: unknown,
  max?: number,
): string[] | unknown {
  if (!Array.isArray(value)) return value;
  const normalized = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return typeof max === "number" ? normalized.slice(0, max) : normalized;
}

function replaceFirstStandaloneInteger(
  value: string | null | undefined,
  replacement: number,
): string | null {
  if (typeof value !== "string") return value ?? null;
  let replaced = false;
  const next = value.replace(/\b\d+\b/, (match) => {
    if (replaced) return match;
    replaced = true;
    return String(replacement);
  });
  return next;
}

function buildPhaseItemsByTempId(
  phase: Record<string, unknown> | null,
): Map<string, Record<string, unknown>> {
  const itemsByTempId = new Map<string, Record<string, unknown>>();
  if (!phase || !Array.isArray(phase.items)) return itemsByTempId;

  for (const item of phase.items) {
    if (!isPlainObject(item)) continue;
    const tempId = typeof item.temp_id === "string" ? item.temp_id.trim() : "";
    if (!tempId) continue;
    itemsByTempId.set(tempId, item);
  }

  return itemsByTempId;
}

function normalizePlanBlueprintLevels(args: {
  blueprint: Record<string, unknown>;
  currentLevelOrder: number | null;
  currentPhaseId: string | null;
}): Record<string, unknown> {
  const rawLevels = Array.isArray(args.blueprint.levels)
    ? args.blueprint.levels
    : [];
  const currentLevelOrder = args.currentLevelOrder ?? 1;
  const levels = rawLevels
    .filter(isPlainObject)
    .filter((level) => {
      const phaseId = typeof level.phase_id === "string"
        ? level.phase_id.trim()
        : "";
      return !args.currentPhaseId || phaseId !== args.currentPhaseId;
    })
    .sort((a, b) => {
      const aOrder = Number(a.level_order);
      const bOrder = Number(b.level_order);
      if (Number.isInteger(aOrder) && Number.isInteger(bOrder)) {
        return aOrder - bOrder;
      }
      if (Number.isInteger(aOrder)) return -1;
      if (Number.isInteger(bOrder)) return 1;
      return 0;
    })
    .map((level, index) => ({
      ...level,
      level_order: currentLevelOrder + index + 1,
    }));

  return {
    ...args.blueprint,
    // This field is consumed as a denormalized count in the UI/data model.
    // Keep it mechanically aligned with the actual future levels array.
    estimated_levels_count: levels.length,
    levels,
  };
}

function countOneShotAssignments(args: {
  week: Record<string, unknown>;
  phaseItemsByTempId: Map<string, Record<string, unknown>>;
}): number {
  const assignments = Array.isArray(args.week.item_assignments)
    ? args.week.item_assignments
    : [];
  let count = 0;

  for (const assignment of assignments) {
    if (!isPlainObject(assignment)) continue;
    const tempId = typeof assignment.temp_id === "string"
      ? assignment.temp_id.trim()
      : "";
    if (!tempId) continue;
    const phaseItem = args.phaseItemsByTempId.get(tempId);
    if (!phaseItem) continue;
    if (phaseItem.dimension !== "habits") count += 1;
  }

  return count;
}

function normalizePlanMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  const phase1Preview = isPlainObject(metadata.phase_1_preview)
    ? {
      ...metadata.phase_1_preview,
      title: typeof metadata.phase_1_preview.title === "string"
        ? metadata.phase_1_preview.title.trim()
        : metadata.phase_1_preview.title,
      rationale: typeof metadata.phase_1_preview.rationale === "string"
        ? metadata.phase_1_preview.rationale.trim()
        : metadata.phase_1_preview.rationale,
      phase_objective:
        typeof metadata.phase_1_preview.phase_objective === "string"
          ? metadata.phase_1_preview.phase_objective.trim()
          : metadata.phase_1_preview.phase_objective,
      heartbeat: typeof metadata.phase_1_preview.heartbeat === "string"
        ? metadata.phase_1_preview.heartbeat.trim()
        : metadata.phase_1_preview.heartbeat,
    }
    : metadata.phase_1_preview;

  const adjustmentContext = isPlainObject(metadata.plan_adjustment_context)
    ? metadata.plan_adjustment_context
    : metadata.plan_adjustment_context;
  const normalizedAdjustmentContext = isPlainObject(adjustmentContext)
    ? {
      ...adjustmentContext,
      global_reasoning: isPlainObject(adjustmentContext.global_reasoning)
        ? {
          ...adjustmentContext.global_reasoning,
          main_problem_model:
            typeof adjustmentContext.global_reasoning.main_problem_model ===
                "string"
              ? adjustmentContext.global_reasoning.main_problem_model.trim()
              : adjustmentContext.global_reasoning.main_problem_model,
          sequencing_logic:
            typeof adjustmentContext.global_reasoning.sequencing_logic ===
                "string"
              ? adjustmentContext.global_reasoning.sequencing_logic.trim()
              : adjustmentContext.global_reasoning.sequencing_logic,
          why_not_faster_initially: typeof adjustmentContext.global_reasoning
              .why_not_faster_initially === "string"
            ? adjustmentContext.global_reasoning.why_not_faster_initially
              .trim()
            : adjustmentContext.global_reasoning.why_not_faster_initially,
          acceleration_signals: trimNonEmptyStringArray(
            adjustmentContext.global_reasoning.acceleration_signals,
            5,
          ),
          slowdown_signals: trimNonEmptyStringArray(
            adjustmentContext.global_reasoning.slowdown_signals,
            5,
          ),
        }
        : adjustmentContext.global_reasoning,
      phase_reasoning: Array.isArray(adjustmentContext.phase_reasoning)
        ? adjustmentContext.phase_reasoning.map((entry) =>
          isPlainObject(entry)
            ? {
              ...entry,
              phase_id: typeof entry.phase_id === "string"
                ? entry.phase_id.trim()
                : entry.phase_id,
              role_in_plan: typeof entry.role_in_plan === "string"
                ? entry.role_in_plan.trim()
                : entry.role_in_plan,
              why_before_next: typeof entry.why_before_next === "string"
                ? entry.why_before_next.trim()
                : entry.why_before_next,
              prerequisite_for_next_phase:
                typeof entry.prerequisite_for_next_phase === "string"
                  ? entry.prerequisite_for_next_phase.trim()
                  : entry.prerequisite_for_next_phase,
              user_signals_used: trimNonEmptyStringArray(
                entry.user_signals_used,
                6,
              ),
              acceleration_signals: trimNonEmptyStringArray(
                entry.acceleration_signals,
                4,
              ),
              slowdown_signals: trimNonEmptyStringArray(
                entry.slowdown_signals,
                4,
              ),
            }
            : entry
        )
        : adjustmentContext.phase_reasoning,
    }
    : adjustmentContext;

  return {
    ...metadata,
    phase_1_preview: phase1Preview,
    plan_adjustment_context: normalizedAdjustmentContext,
  };
}

export function computeNextGenerationAttempt(
  existingPlans: Array<Pick<UserPlanV2Row, "version" | "generation_attempts">>,
): number {
  if (existingPlans.length === 0) return 1;

  const maxAttempt = existingPlans.reduce(
    (max, plan) => Math.max(max, plan.generation_attempts, plan.version),
    0,
  );
  return maxAttempt + 1;
}

function applyPlanAdjustmentMetadata(
  plan: PlanContentV3,
  adjustmentContext: PlanAdjustmentGenerationContext | null,
  previousPlan: Pick<UserPlanV2Row, "id" | "version"> | null,
): PlanContentV3 {
  if (!adjustmentContext) return plan;

  return {
    ...plan,
    metadata: {
      ...(plan.metadata ?? {}),
      plan_adjustment_revision: {
        version: 1,
        source: "dashboard_adjustment",
        review_id: adjustmentContext.reviewId,
        scope: adjustmentContext.scope,
        effective_start_date: adjustmentContext.effectiveStartDate,
        reason: adjustmentContext.reason,
        user_change_summary: adjustmentContext.userChangeSummary,
        assistant_message: adjustmentContext.assistantMessage,
        previous_plan_id: previousPlan?.id ?? null,
        previous_plan_version: previousPlan?.version ?? null,
        adjusted_at: new Date().toISOString(),
      },
    },
  };
}

export function buildPlanRow(params: {
  userId: string;
  planId: string;
  version: number;
  llmAttempts: number;
  plan: PlanContentV3;
  now: string;
  status?: UserPlanV2Row["status"];
  generationFeedback: string | null;
  generationInputSnapshot: Record<string, unknown>;
  generationReason?: string | null;
}): UserPlanV2Row {
  return {
    id: params.planId,
    user_id: params.userId,
    cycle_id: params.plan.cycle_id,
    transformation_id: params.plan.transformation_id,
    status: params.status ?? "generated",
    // version is the plan's unique, ever-growing ordering key (one per
    // generation) — it legitimately climbs with each adjustment.
    version: params.version,
    title: params.plan.title,
    content: params.plan as unknown as Record<string, unknown>,
    // generation_attempts is the retry count of THIS generation only (1-3), a
    // small anti-loop counter — it must NOT track version, or it would blow the
    // DB CHECK (<= 50) after enough adjustments. Clamped defensively.
    generation_attempts: Math.min(Math.max(params.llmAttempts, 1), 50),
    last_generation_reason: params.generationReason ?? (
      params.version === 1 ? "initial_generation" : "regeneration"
    ),
    generation_feedback: params.generationFeedback,
    generation_input_snapshot: params.generationInputSnapshot,
    activated_at: null,
    completed_at: null,
    archived_at: null,
    created_at: params.now,
    updated_at: params.now,
  };
}

function getSupabaseEnv(): {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
} {
  const url = String(Deno.env.get("SUPABASE_URL") ?? "").trim();
  const anonKey = String(Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
  const serviceRoleKey = String(
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  ).trim();

  if (!url || !anonKey || !serviceRoleKey) {
    throw new GeneratePlanV2Error(500, "Server misconfigured");
  }

  return { url, anonKey, serviceRoleKey };
}

function cleanRequiredText(value: string | null, field: string): string {
  const cleaned = String(value ?? "").trim();
  if (!cleaned) {
    throw new GeneratePlanV2Error(400, `Missing required ${field}`);
  }
  return cleaned;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function calculateAgeFromBirthDate(
  birthDate: string | null,
  nowIso: string,
): number | null {
  if (!birthDate) return null;

  const birth = new Date(`${birthDate}T00:00:00.000Z`);
  const now = new Date(nowIso);
  if (Number.isNaN(birth.getTime()) || Number.isNaN(now.getTime())) return null;

  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday = now.getUTCMonth() < birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() &&
      now.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}
