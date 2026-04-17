// NOTE: This endpoint is named "generate-plan-v2" for backward compatibility,
// but it generates V3 plans (phase-based with heartbeat). A rename would break
// existing frontend calls and Supabase deployment references.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "jsr:@supabase/supabase-js@2";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { classifyPlanTypeForTransformation } from "../classify-plan-type-v1/index.ts";
import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { distributePlanItemsV3 } from "../_shared/v2-plan-distribution.ts";
import { buildPhase1Context, mergePhase1Payload } from "../_shared/v2-phase1.ts";
import { classifyAndPersistProfessionalSupport } from "../_shared/professional-support-v2.ts";
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
import { logV2Event, V2_EVENT_TYPES } from "../_shared/v2-events.ts";
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
  mode: z.enum(["generate_and_activate", "preview", "confirm"]).optional(),
  feedback: z.string().trim().min(1).max(4000).optional(),
  force_regenerate: z.boolean().optional(),
  pace: z.enum(["cool", "normal", "intense"]).optional(),
  preserve_active_transformation_id: z.string().trim().min(1).optional(),
});

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

type GeneratePlanMode = "generate_and_activate" | "preview" | "confirm";

type PlanScheduleAnchor = {
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

const LOCKED_TRANSFORMATION_STATUSES: ReadonlySet<TransformationStatus> = new Set([
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
  const availableDays = fromPreferred.length > 0 ? fromPreferred : [...DAY_CODES];
  const target = Math.min(
    effectiveWeeklyTarget(args.item, args.targetRepsOverride),
    availableDays.length,
  );
  if (target === 0) return [];

  if (args.item.dimension !== "habits") {
    const candidate = availableDays.find((day) => fromPlan.includes(day))
      ?? availableDays[0]
      ?? fromPlan[0]
      ?? DAY_CODES[0];
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

function getVisibleWeekDays(anchor: PlanScheduleAnchor, weekOrder: number): DayCode[] {
  const fullWeekStart = addDaysYmd(anchor.anchor_week_start, (weekOrder - 1) * 7);
  const fullWeekEnd = addDaysYmd(anchor.anchor_week_end, (weekOrder - 1) * 7);
  const visibleStart = weekOrder === 1 ? anchor.anchor_display_start : fullWeekStart;
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

function getWeekStartDate(anchor: PlanScheduleAnchor, weekOrder: number): string {
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
          weeklyReps: typeof assignment.weekly_reps === "number" ? assignment.weekly_reps : null,
        };
      })
      .filter((entry): entry is { item: UserPlanItemRow; weeklyReps: number | null } => Boolean(entry));
  }

  const currentPhase = args.plan.phases.find((phase) => phase.phase_id === args.runtime.phase_id);
  if (!currentPhase) return [];

  const fallbackItems: Array<{ item: UserPlanItemRow; weeklyReps: number | null } | null> = currentPhase.items
    .map((planItem) => {
      const tempId = typeof planItem.temp_id === "string" ? planItem.temp_id : null;
      if (!tempId) return null;
      const item = args.itemsByTempId.get(tempId);
      if (!item) return null;
      return {
        item,
        weeklyReps: null,
      };
    });

  return fallbackItems.filter((entry): entry is { item: UserPlanItemRow; weeklyReps: number | null } =>
    Boolean(entry)
  );
}

async function materializeCurrentLevelWeekPlanning(args: {
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
  if (!runtime || !Array.isArray(runtime.weeks) || runtime.weeks.length === 0) return;

  const itemsById = new Map(args.distributedItems.map((item) => [item.id, item]));
  const itemsByTempId = new Map<string, UserPlanItemRow>();
  for (const [tempId, itemId] of Object.entries(args.tempIdMap)) {
    const item = itemsById.get(itemId);
    if (item) itemsByTempId.set(tempId, item);
  }

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
    const oneShotItems = weekItems.filter((entry) => entry.item.dimension !== "habits");
    const missionDays = normalizeDayCodes(week.mission_days);

    for (const [index, entry] of weekItems.entries()) {
      const preferredDays = entry.item.dimension === "habits"
        ? visibleDays
        : (() => {
          const oneShotIndex = oneShotItems.findIndex((candidate) => candidate.item.id === entry.item.id);
          const mapped = oneShotIndex >= 0 ? missionDays[oneShotIndex] : null;
          if (mapped && visibleDays.includes(mapped)) return [mapped];
          return visibleDays;
        })();

      const targetRepsOverride = entry.item.dimension === "habits"
        ? Math.min(
          visibleDays.length,
          effectiveWeeklyTarget(entry.item, entry.weeklyReps ?? undefined),
        )
        : 1;
      const defaultDays = buildDefaultDays({
        item: entry.item,
        preferredDays,
        targetRepsOverride,
      });

      const { data: existingPlanData, error: existingPlanError } = await args.admin
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

      const { data: existingOccurrences, error: existingOccurrencesError } = await args.admin
        .from("user_habit_week_occurrences")
        .select("id")
        .eq("user_id", args.userId)
        .eq("plan_item_id", entry.item.id)
        .eq("week_start_date", weekStartDate)
        .limit(1);
      if (existingOccurrencesError) {
        throw new GeneratePlanV2Error(500, "Failed to inspect week occurrences", {
          cause: existingOccurrencesError,
        });
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
          throw new GeneratePlanV2Error(500, "Failed to materialize week planning", {
            cause: insertPlanError,
          });
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
          throw new GeneratePlanV2Error(500, "Failed to materialize week occurrences", {
            cause: insertOccurrencesError,
          });
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
    const admin = createClient(env.url, env.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    console.info("[generate-plan-v2][request]", {
      request_id: requestId,
      user_id: userId,
      transformation_id: parsedBody.data.transformation_id,
      mode: parsedBody.data.mode ?? "generate_and_activate",
      has_feedback: Boolean(parsedBody.data.feedback?.trim()),
      force_regenerate: parsedBody.data.force_regenerate === true,
      pace: parsedBody.data.pace ?? null,
      preserve_active_transformation_id:
        parsedBody.data.preserve_active_transformation_id ?? null,
    });

    const result = await generatePlanV2ForTransformation({
      admin,
      requestId,
      userId,
      transformationId: parsedBody.data.transformation_id,
      mode: parsedBody.data.mode ?? "generate_and_activate",
      feedback: parsedBody.data.feedback ?? null,
      forceRegenerate: parsedBody.data.force_regenerate === true,
      pace: parsedBody.data.pace ?? null,
      preserveActiveTransformationId:
        parsedBody.data.preserve_active_transformation_id ?? null,
    });

    console.info("[generate-plan-v2][response_ready]", {
      request_id: requestId,
      transformation_id: result.transformation.id,
      plan_id: result.planRow.id,
      plan_status: result.planRow.status,
      distributed_items_count: result.distribution.items.length,
    });

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
    console.error("[generate-plan-v2][error]", {
      request_id: requestId,
      error_name: error instanceof Error ? error.name : "UnknownError",
      error_message: error instanceof Error ? error.message : String(error),
      error_stack: error instanceof Error ? error.stack : null,
    });
    const ctx = getRequestContext(req);
    await logEdgeFunctionError({
      functionName: "generate-plan-v2",
      error,
      requestId,
      userId: ctx.userId,
      source: "edge",
      metadata: { route: "generate-plan-v2" },
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
  const now = new Date().toISOString();
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

  const latestDraftPlan = await loadLatestDraftPlan({
    admin: params.admin,
    transformationId: params.transformationId,
  });
  const previousPlanPreview = latestDraftPlan?.content as PlanContentV3 | null;

  if (params.mode === "confirm") {
    console.info("[generate-plan-v2][confirm][precheck]", {
      request_id: params.requestId,
      user_id: params.userId,
      cycle_id: context.cycle.id,
      transformation_id: context.transformation.id,
      transformation_title: context.transformation.title ?? null,
      latest_draft_plan_id: latestDraftPlan?.id ?? null,
      latest_draft_plan_status: latestDraftPlan?.status ?? null,
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
    console.info("[generate-plan-v2][confirm][activate_draft]", {
      request_id: params.requestId,
      user_id: params.userId,
      transformation_id: params.transformationId,
      draft_plan_id: latestDraftPlan.id,
    });
    await deleteOtherPlansForTransformation({
      admin: params.admin,
      transformationId: params.transformationId,
      keepPlanId: latestDraftPlan.id,
    });

    return await activatePersistedPlan({
      admin: params.admin,
      userId: params.userId,
      context,
      planRow: latestDraftPlan,
      now,
      distributeIfMissing: true,
      preserveActiveTransformationId: params.preserveActiveTransformationId,
    });
  }

  // If a plan is already active or paused, the transformation is truly in use.
  const lockedPlan = context.existingPlans.find((plan) =>
    plan.status === "active" || plan.status === "paused"
  );
  if (lockedPlan) {
    if (params.mode === "confirm") {
      console.info("[generate-plan-v2][confirm][activate_locked_plan]", {
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
        distributeIfMissing: false,
        preserveActiveTransformationId: params.preserveActiveTransformationId,
      });
    }

    if (params.mode === "preview") {
      const persistedLockedPlan = await loadPlanById({
        admin: params.admin,
        planId: lockedPlan.id,
      });
      const lockedPreview = persistedLockedPlan.content as unknown as PlanContentV3;
      if (!lockedPreview || lockedPreview.version !== 3 ||
        !Array.isArray(lockedPreview.phases)) {
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

    throw new GeneratePlanV2Error(
      409,
      "Transformation already has an active V2 plan",
    );
  }

  // A "generated" plan that has no distributed items is a stuck artifact from a
  // previous timed-out attempt. Recover it if items exist; otherwise delete it
  // so a fresh generation can proceed without hitting the attempt cap.
  const partialPlan = context.existingPlans.find((plan) =>
    plan.status === "generated"
  );
  if (partialPlan) {
    if (params.mode === "confirm") {
      console.warn("[generate-plan-v2][confirm][partial_plan_found]", {
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
    console.warn("[generate-plan-v2][confirm][falling_back_to_full_generation]", {
      request_id: params.requestId,
      user_id: params.userId,
      cycle_id: context.cycle.id,
      transformation_id: context.transformation.id,
      transformation_title: context.transformation.title ?? null,
    });
  }

  const attemptNumber = computeNextGenerationAttempt(context.existingPlans);
  if (attemptNumber > 2) {
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
      console.warn("[generate-plan-v2][classification_fallback_failed]", {
        request_id: params.requestId,
        transformation_id: context.transformation.id,
        error_message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const transformationScopedGuidance = deriveTransformationScopedGuidance({
    transformation: context.transformation,
    calibrationFields,
    planTypeClassification,
  });
  const userTimeContext = await getUserTimeContext({
    supabase: params.admin,
    userId: params.userId,
    now: new Date(now),
  });
  const scheduleAnchor = buildScheduleAnchor({
    nowUtc: userTimeContext.now_utc,
    userTimezone: userTimeContext.user_timezone,
    userLocalDate: userTimeContext.user_local_date,
    userLocalHuman: userTimeContext.user_local_human,
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
    user_requested_pace: requestedPace,
    user_age: calculateAgeFromBirthDate(context.cycle.birth_date_snapshot, now),
    user_gender: context.cycle.gender_snapshot,
    user_timezone: userTimeContext.user_timezone,
    user_local_date: userTimeContext.user_local_date,
    user_local_human: userTimeContext.user_local_human,
    anchor_week_start: scheduleAnchor.anchor_week_start,
    anchor_week_end: scheduleAnchor.anchor_week_end,
    days_remaining_in_anchor_week: scheduleAnchor.days_remaining_in_anchor_week,
    is_partial_anchor_week: scheduleAnchor.is_partial_anchor_week,
    previous_plan_preview: params.forceRegenerate ? previousPlanPreview : null,
    regeneration_feedback: params.feedback?.trim() || null,
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
  });
  console.info("[generate-plan-v2][llm_plan_ready]", {
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
  const plan = applyScheduleAnchorToPlan(generatedPlan.plan, scheduleAnchor);

  const planId = crypto.randomUUID();
  const planRow = buildPlanRow({
    userId: params.userId,
    planId,
    attemptNumber,
    plan,
    now,
    status: params.mode === "preview" ? "draft" : "generated",
    generationFeedback,
    generationInputSnapshot,
  });

  const { error: insertPlanError } = await params.admin
    .from("user_plans_v2")
    .insert(planRow as any);
  if (insertPlanError) {
    throw new GeneratePlanV2Error(500, "Failed to persist generated plan", {
      cause: insertPlanError,
    });
  }
  console.info("[generate-plan-v2][plan_persisted]", {
    request_id: params.requestId,
    transformation_id: context.transformation.id,
    plan_id: planId,
    mode: params.mode,
    status: planRow.status,
  });

  if (params.mode === "preview") {
    console.info("[generate-plan-v2][preview_complete]", {
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
  return await activatePersistedPlan({
    admin: params.admin,
    userId: params.userId,
    context,
    planRow,
    now,
    distributeIfMissing: true,
    preserveActiveTransformationId: params.preserveActiveTransformationId,
  });
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
      onboarding_v2: extractOnboardingV2Payload(args.transformation.handoff_payload),
    },
    calibration_fields: args.calibrationFields as unknown as Record<string, unknown>,
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
    throw new GeneratePlanV2Error(500, "Failed to resolve preserved active transformation", {
      cause: error,
    });
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
  if (!classification || typeof classification !== "object" || Array.isArray(classification)) {
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

function shouldRefreshPlanTypeClassification(
  classification: PlanTypeClassificationV1 | null,
): boolean {
  if (!classification) return true;
  if (classification.journey_strategy?.mode !== "two_transformations") return false;
  return !classification.split_metric_guidance?.transformation_1 ||
    !classification.split_metric_guidance?.transformation_2;
}

function cleanOptionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
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
  const baseSuccessDefinition = cleanOptionalText(args.transformation.success_definition);
  const baseSuccessIndicator = cleanOptionalText(args.calibrationFields.success_indicator);
  const baseMetricTargetText = cleanOptionalText(args.calibrationFields.metric_target_text);
  const classification = args.planTypeClassification;
  const splitGuidance = classification?.split_metric_guidance?.transformation_1 ?? null;

  if (classification?.journey_strategy?.mode !== "two_transformations") {
    return {
      successDefinition: baseSuccessDefinition,
      successIndicator: baseSuccessIndicator,
      metricTargetText: baseMetricTargetText,
    };
  }

  const splitSuccessDefinition =
    cleanOptionalText(splitGuidance?.success_definition) ??
    cleanOptionalText(classification.journey_strategy.transformation_1_goal) ??
    baseSuccessDefinition;
  const splitTargetText =
    cleanOptionalText(splitGuidance?.target_text) ??
    cleanOptionalText(classification.journey_strategy.transformation_1_goal) ??
    baseMetricTargetText;

  return {
    successDefinition: splitSuccessDefinition,
    successIndicator: splitTargetText ?? splitSuccessDefinition ?? baseSuccessIndicator,
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

  const baseTitle = String(args.currentTitle ?? "").trim() || "Suite du parcours";
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
  return null;
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
  const { error } = await args.admin
    .from("user_plans_v2")
    .update({
      status: "archived",
      archived_at: args.now,
      updated_at: args.now,
    } as any)
    .eq("transformation_id", args.transformationId)
    .eq("status", "draft");

  if (error) {
    throw new GeneratePlanV2Error(
      500,
      "Failed to archive previous preview plan",
      { cause: error },
    );
  }
}

async function activatePersistedPlan(args: {
  admin: SupabaseClient;
  userId: string;
  context: TransformationContext;
  planRow: UserPlanV2Row;
  now: string;
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
  if (!persistedPlan || persistedPlan.version !== 3 || !Array.isArray(persistedPlan.phases)) {
    throw new GeneratePlanV2Error(500, "Persisted plan preview is invalid");
  }
  const userTimeContext = await getUserTimeContext({
    supabase: args.admin,
    userId: args.userId,
    now: new Date(args.now),
  });
  const refreshedScheduleAnchor = buildScheduleAnchor({
    nowUtc: userTimeContext.now_utc,
    userTimezone: userTimeContext.user_timezone,
    userLocalDate: userTimeContext.user_local_date,
    userLocalHuman: userTimeContext.user_local_human,
  });
  const plan = applyScheduleAnchorToPlan(persistedPlan, refreshedScheduleAnchor);

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
      const latestHandoffPayload = await loadLatestTransformationHandoffPayload({
        admin: args.admin,
        transformationId: args.context.transformation.id,
      });
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
        eventWarnings.push(`Failed to persist phase 1 context: ${phase1ContextError.message}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      eventWarnings.push(`Failed to initialize phase 1: ${message}`);
    }
  }

  try {
    await classifyAndPersistProfessionalSupport({
      admin: args.admin,
      requestId: `generate-plan-v2:${args.planRow.id}`,
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    eventWarnings.push(`Failed to classify professional support: ${message}`);
  }

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

  return {
    cycle: { ...args.context.cycle, ...cyclePatch },
    transformation: {
      ...args.context.transformation,
      ...transformationPatch,
    },
    plan,
    planRow: { ...args.planRow, ...planPatch },
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
  preserveActiveTransformationId: string | null;
}): Promise<{
  cycle: UserCycleRow;
  transformation: UserTransformationRow;
  plan: PlanContentV3;
  planRow: UserPlanV2Row;
  distribution: Awaited<ReturnType<typeof distributePlanItemsV3>>;
  roadmapChanged: boolean;
  journeyContext: JourneyContextResponse | null;
} | null> {
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

  return {
    transformation,
    cycle: cycleData as UserCycleRow,
    existingPlans:
      ((existingPlansData ?? []) as TransformationContext["existingPlans"]),
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
    throw new GeneratePlanV2Error(500, "Failed to reload transformation handoff payload", {
      cause: error,
    });
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
  return null;
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
      requestId: `${params.requestId}:generate-plan-v2`,
      source: "generate-plan-v2",
      userId: params.userId,
      model: "gemini-3.1-pro-preview",
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

  const fallbackNormalized = typeof fallback === "string" ? fallback.trim() : "";
  if (fallbackNormalized && VALID_PRIMARY_METRIC_MEASUREMENT_MODES.has(fallbackNormalized)) {
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
}): Promise<{
  plan: PlanContentV3;
  finalLlmInput: Record<string, unknown>;
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
      });
      return {
        plan,
        finalLlmInput: llmInput as unknown as Record<string, unknown>,
      };
    } catch (error) {
      const shouldRetry = attempt < 2 && shouldRetryPlanGeneration(error);
      if (!shouldRetry) {
        throw error;
      }

      validationFeedback = extractPlanValidationIssues(error);
      console.warn("[generate-plan-v2] retrying after invalid structured output", {
        request_id: params.requestId,
        issues: validationFeedback,
      });
    }
  }

  throw new GeneratePlanV2Error(500, "Plan generation retry loop ended unexpectedly");
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
  const months = typeof durationMonths === "number" && Number.isFinite(durationMonths)
    ? Math.min(4, Math.max(1, durationMonths))
    : safePhaseCount;
  const weeksPerPhase = Math.max(1, Math.round((months * 4) / safePhaseCount));

  if (weeksPerPhase >= 8) {
    const monthsPerPhase = Math.max(1, Math.round(weeksPerPhase / 4));
    return monthsPerPhase <= 1 ? "Environ 1 mois" : `Environ ${monthsPerPhase} mois`;
  }

  return weeksPerPhase <= 1 ? "Environ 1 semaine" : `Environ ${weeksPerPhase} semaines`;
}

const CANONICAL_FINAL_HABIT_WEEKLY_REPS = 6;

export function validateGeneratedPlanAgainstContext(
  raw: unknown,
  context: {
    cycleId: string;
    transformationId: string;
  },
): PlanContentV3 {
  const normalizedRaw = normalizeGeneratedPlanForValidation(raw);
  const validation = validatePlanV3Output(normalizedRaw);
  if (!validation.valid) {
    throw new GeneratePlanV2Error(
      500,
      `Generated plan failed validation: ${validation.issues.join("; ")}`,
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
    global_objective:
      typeof canonicalizedPlan.global_objective === "string" &&
        canonicalizedPlan.global_objective.trim().length > 0
        ? canonicalizedPlan.global_objective
        : canonicalizedPlan.strategy?.success_definition?.trim() || canonicalizedPlan.title,
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
        : canonicalizedPlan.strategy?.success_definition?.trim() || canonicalizedPlan.title,
    progression_logic:
      typeof canonicalizedPlan.progression_logic === "string" &&
        canonicalizedPlan.progression_logic.trim().length > 0
        ? canonicalizedPlan.progression_logic
        : canonicalizedPlan.timeline_summary,
    primary_metric:
      canonicalizedPlan.primary_metric &&
        typeof canonicalizedPlan.primary_metric === "object"
        ? canonicalizedPlan.primary_metric
      : {
        label: "Indicateur de réussite",
        unit: null,
        success_target: canonicalizedPlan.strategy?.success_definition?.trim() ||
          canonicalizedPlan.title,
        measurement_mode: "qualitative" as const,
      },
    phases: Array.isArray(canonicalizedPlan.phases)
      ? canonicalizedPlan.phases.map((phase) => ({
        ...phase,
        duration_guidance:
          typeof phase.duration_guidance === "string" && phase.duration_guidance.trim().length > 0
            ? phase.duration_guidance.trim()
            : buildFallbackPhaseDurationGuidance(
              canonicalizedPlan.duration_months,
              canonicalizedPlan.phases.length,
            ),
        what_this_phase_targets:
          typeof phase.what_this_phase_targets === "string" && phase.what_this_phase_targets.trim().length > 0
            ? phase.what_this_phase_targets
            : phase.phase_objective,
        why_this_now:
          typeof phase.why_this_now === "string" && phase.why_this_now.trim().length > 0
            ? phase.why_this_now
            : phase.rationale,
        how_this_phase_works:
          typeof phase.how_this_phase_works === "string" && phase.how_this_phase_works.trim().length > 0
            ? phase.how_this_phase_works
            : phase.phase_objective,
        phase_metric_target:
          typeof phase.phase_metric_target === "string" && phase.phase_metric_target.trim().length > 0
            ? phase.phase_metric_target.trim()
            : canonicalizedPlan.primary_metric?.success_target?.trim() || phase.phase_objective,
      }))
      : [],
    strategy: {
      ...canonicalizedPlan.strategy,
      identity_shift: typeof canonicalizedPlan.strategy?.identity_shift === "string"
        ? canonicalizedPlan.strategy.identity_shift
        : null,
      core_principle: typeof canonicalizedPlan.strategy?.core_principle === "string"
        ? canonicalizedPlan.strategy.core_principle
        : null,
    },
    journey_context: null,
  };
}

function enforceCanonicalFinalHabitWeeklyReps(plan: PlanContentV3): PlanContentV3 {
  const canonicalMainHabitByPhaseId = new Map<string, string>();

  const normalizedPhases = plan.phases.map((phase) => {
    if (!Array.isArray(phase.weeks) || phase.weeks.length === 0) return phase;

    const itemsByTempId = new Map(phase.items.map((item) => [item.temp_id, item]));
    const lastWeekIndex = phase.weeks.length - 1;
    const lastWeek = phase.weeks[lastWeekIndex];
    const assignments = Array.isArray(lastWeek.item_assignments) ? lastWeek.item_assignments : [];
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
  const primaryMetric = candidate.primary_metric && typeof candidate.primary_metric === "object" &&
      !Array.isArray(candidate.primary_metric)
    ? candidate.primary_metric as Record<string, unknown>
    : null;
  const primaryMetricLabel = typeof primaryMetric?.label === "string" && primaryMetric.label.trim().length > 0
    ? primaryMetric.label.trim()
    : "l'indicateur global";
  const primaryMetricSuccessTarget =
    typeof primaryMetric?.success_target === "string" && primaryMetric.success_target.trim().length > 0
      ? primaryMetric.success_target.trim()
      : null;
  const blueprint = candidate.plan_blueprint && typeof candidate.plan_blueprint === "object" &&
      !Array.isArray(candidate.plan_blueprint)
    ? candidate.plan_blueprint as Record<string, unknown>
    : null;
  const normalizedBlueprint = blueprint && Array.isArray(blueprint.levels)
    ? {
      ...blueprint,
      // This field is consumed as a denormalized count in the UI/data model.
      // Keep it mechanically aligned with the actual future levels array.
      estimated_levels_count: blueprint.levels.length,
    }
    : blueprint;
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
  const currentLevelPhaseItemsByTempId = buildPhaseItemsByTempId(
    isPlainObject(currentLevelPhase) ? currentLevelPhase : null,
  );
  const normalizedCurrentLevelRuntime = currentLevelRuntime && Array.isArray(currentLevelRuntime.weeks)
    ? {
      ...currentLevelRuntime,
      weeks: currentLevelRuntime.weeks.map((week) => {
        if (!week || typeof week !== "object" || Array.isArray(week)) {
          return week;
        }

        const weekRecord = week as Record<string, unknown>;
        const missionDays = Array.isArray(weekRecord.mission_days)
          ? weekRecord.mission_days
            .filter((day): day is string => typeof day === "string")
            .map((day) => day.trim())
            .filter((day, index, array) => day.length > 0 && array.indexOf(day) === index)
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
    : currentLevelRuntime;
  const metadata = candidate.metadata && typeof candidate.metadata === "object" &&
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
      const maintainedFoundation = Array.isArray(phaseRecord.maintained_foundation)
        ? phaseRecord.maintained_foundation
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter((value) => value.length > 0)
          .slice(0, 3)
        : phaseRecord.maintained_foundation;
      const durationGuidance =
        typeof phaseRecord.duration_guidance === "string" && phaseRecord.duration_guidance.trim().length > 0
          ? phaseRecord.duration_guidance.trim()
          : fallbackDurationGuidance;
      const phaseMetricTarget =
        typeof phaseRecord.phase_metric_target === "string" && phaseRecord.phase_metric_target.trim().length > 0
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

function trimNonEmptyStringArray(value: unknown, max?: number): string[] | unknown {
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
    const tempId = typeof assignment.temp_id === "string" ? assignment.temp_id.trim() : "";
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
      phase_objective: typeof metadata.phase_1_preview.phase_objective === "string"
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
            typeof adjustmentContext.global_reasoning.main_problem_model === "string"
              ? adjustmentContext.global_reasoning.main_problem_model.trim()
              : adjustmentContext.global_reasoning.main_problem_model,
          sequencing_logic:
            typeof adjustmentContext.global_reasoning.sequencing_logic === "string"
              ? adjustmentContext.global_reasoning.sequencing_logic.trim()
              : adjustmentContext.global_reasoning.sequencing_logic,
          why_not_faster_initially:
            typeof adjustmentContext.global_reasoning.why_not_faster_initially === "string"
              ? adjustmentContext.global_reasoning.why_not_faster_initially.trim()
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
              phase_id: typeof entry.phase_id === "string" ? entry.phase_id.trim() : entry.phase_id,
              role_in_plan: typeof entry.role_in_plan === "string"
                ? entry.role_in_plan.trim()
                : entry.role_in_plan,
              why_before_next: typeof entry.why_before_next === "string"
                ? entry.why_before_next.trim()
                : entry.why_before_next,
              prerequisite_for_next_phase: typeof entry.prerequisite_for_next_phase === "string"
                ? entry.prerequisite_for_next_phase.trim()
                : entry.prerequisite_for_next_phase,
              user_signals_used: trimNonEmptyStringArray(entry.user_signals_used, 6),
              acceleration_signals: trimNonEmptyStringArray(entry.acceleration_signals, 4),
              slowdown_signals: trimNonEmptyStringArray(entry.slowdown_signals, 4),
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

function buildPlanRow(params: {
  userId: string;
  planId: string;
  attemptNumber: number;
  plan: PlanContentV3;
  now: string;
  status?: UserPlanV2Row["status"];
  generationFeedback: string | null;
  generationInputSnapshot: Record<string, unknown>;
}): UserPlanV2Row {
  return {
    id: params.planId,
    user_id: params.userId,
    cycle_id: params.plan.cycle_id,
    transformation_id: params.plan.transformation_id,
    status: params.status ?? "generated",
    version: params.attemptNumber,
    title: params.plan.title,
    content: params.plan as unknown as Record<string, unknown>,
    generation_attempts: params.attemptNumber,
    last_generation_reason: params.attemptNumber === 1
      ? "initial_generation"
      : "regeneration",
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
