import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "jsr:@supabase/supabase-js@2";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import {
  buildLevelReviewSchema,
  buildLevelReviewSummary,
  buildNextLevelTransition,
  isLevelReviewWindowOpen,
  isLevelTransitionReady,
  normalizeLevelReviewAnswers,
} from "../_shared/v2-level-completion.ts";
import {
  LEVEL_REVIEW_REMINDER_EVENT_CONTEXT_PREFIX,
} from "../_shared/level_review_checkins.ts";
import {
  generateNextLevelForPlan,
  GenerateNextLevelV1Error,
} from "../generate-next-level-v1/index.ts";
import {
  buildScheduleAnchorFromUserTimeContext,
  GeneratePlanV2Error,
  materializeCurrentLevelWeekPlanning,
} from "../generate-plan-v2/index.ts";
import { logV2Event, V2_EVENT_TYPES } from "../_shared/v2-events.ts";
import {
  distributeMissingPlanPhaseItemsV3,
  PlanDistributionError,
} from "../_shared/v2-plan-distribution.ts";
import { activateDueWeekItems } from "../_shared/v2-week-activation.ts";
import {
  buildBlueprintFromNextLevelPatch,
  buildPhaseFromNextLevelPatch,
  buildRuntimeFromNextLevelPatch,
} from "../_shared/v2-next-level-generation.ts";
import {
  autoConfirmOnboardingWeek1Planning,
  buildOnboardingWeek1ValidationPromptMessage,
  loadOnboardingWeek1Planning,
  ONBOARDING_WEEK1_PROMPT_DELAY_MS,
  ONBOARDING_WEEK1_VALIDATION_PROMPT_EVENT_CONTEXT,
} from "../_shared/onboarding_week1_validation.ts";
import { getUserTimeContext } from "../_shared/user_time_context.ts";
import { badRequest, jsonResponse, parseJsonBody, z } from "../_shared/http.ts";
import { getRequestContext } from "../_shared/request_context.ts";
import type {
  PlanContentV3,
  UserCycleRow,
  UserPlanItemRow,
  UserPlanV2Row,
  UserTransformationRow,
} from "../_shared/v2-types.ts";

const REQUEST_SCHEMA = z.object({
  transformation_id: z.string().uuid(),
  plan_id: z.string().uuid().optional(),
  answers: z.record(z.string(), z.unknown()),
});

class CompleteLevelV1Error extends Error {
  status: number;

  constructor(status: number, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "CompleteLevelV1Error";
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function summarizeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const cause = (error as Error & { cause?: unknown }).cause;
    return {
      name: error.name,
      message: error.message,
      ...(cause ? { cause: summarizeError(cause) } : {}),
    };
  }
  if (isRecord(error)) {
    return {
      name: typeof error.name === "string" ? error.name : "Error",
      message: typeof error.message === "string"
        ? error.message
        : JSON.stringify(error),
      code: typeof error.code === "string" ? error.code : null,
      details: typeof error.details === "string" ? error.details : null,
      hint: typeof error.hint === "string" ? error.hint : null,
    };
  }
  return { name: "Error", message: String(error) };
}

function logCompleteLevelStep(
  requestId: string,
  step: string,
  payload: Record<string, unknown> = {},
) {
  console.info("[complete-level-v1][step]", {
    request_id: requestId,
    step,
    ...payload,
  });
}

function logCompleteLevelFailure(
  requestId: string,
  step: string,
  error: unknown,
  payload: Record<string, unknown> = {},
) {
  console.error("[complete-level-v1][failed]", {
    request_id: requestId,
    step,
    ...payload,
    error: summarizeError(error),
  });
}

async function runCompleteLevelStep<T>(
  args: {
    requestId: string;
    step: string;
    payload?: Record<string, unknown>;
    run: () => Promise<T>;
  },
): Promise<T> {
  logCompleteLevelStep(args.requestId, `${args.step}.started`, args.payload);
  try {
    const result = await args.run();
    logCompleteLevelStep(
      args.requestId,
      `${args.step}.succeeded`,
      args.payload,
    );
    return result;
  } catch (error) {
    logCompleteLevelFailure(args.requestId, args.step, error, args.payload);
    throw error;
  }
}

function shouldExposeDebugError(req: Request): boolean {
  if ((Deno.env.get("SOPHIA_DEBUG_EDGE_ERRORS") ?? "").trim() === "1") {
    return true;
  }
  try {
    const host = new URL(req.url).hostname;
    return host === "127.0.0.1" || host === "localhost";
  } catch {
    return false;
  }
}

function getSupabaseEnv() {
  const url = String(Deno.env.get("SUPABASE_URL") ?? "").trim();
  const anonKey = String(Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
  const serviceRoleKey = String(
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  ).trim();
  if (!url || !anonKey || !serviceRoleKey) {
    throw new CompleteLevelV1Error(
      500,
      "Supabase environment is not configured",
    );
  }
  return { url, anonKey, serviceRoleKey };
}

function parsePlanContent(
  content: Record<string, unknown> | null,
): PlanContentV3 {
  if (!content || content.version !== 3 || !Array.isArray(content.phases)) {
    throw new CompleteLevelV1Error(
      409,
      "Le plan actif n'est pas un plan V3 compatible.",
    );
  }
  return content as unknown as PlanContentV3;
}

async function loadTransformation(
  admin: SupabaseClient,
  transformationId: string,
): Promise<UserTransformationRow> {
  const { data, error } = await admin
    .from("user_transformations")
    .select("*")
    .eq("id", transformationId)
    .maybeSingle();

  if (error) {
    throw new CompleteLevelV1Error(500, "Failed to load transformation", {
      cause: error,
    });
  }
  if (!data) {
    throw new CompleteLevelV1Error(404, "Transformation not found");
  }

  return data as UserTransformationRow;
}

async function loadCycle(
  admin: SupabaseClient,
  cycleId: string,
): Promise<UserCycleRow> {
  const { data, error } = await admin
    .from("user_cycles")
    .select("*")
    .eq("id", cycleId)
    .maybeSingle();

  if (error) {
    throw new CompleteLevelV1Error(500, "Failed to load cycle", {
      cause: error,
    });
  }
  if (!data) {
    throw new CompleteLevelV1Error(404, "Cycle not found");
  }

  return data as UserCycleRow;
}

async function loadPlan(args: {
  admin: SupabaseClient;
  transformation: UserTransformationRow;
  planId: string | null;
}): Promise<UserPlanV2Row> {
  let query = args.admin
    .from("user_plans_v2")
    .select("*")
    .eq("cycle_id", args.transformation.cycle_id)
    .eq("transformation_id", args.transformation.id)
    .in("status", ["active", "paused", "completed"])
    .order("activated_at", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1);

  if (args.planId) {
    query = query.eq("id", args.planId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    throw new CompleteLevelV1Error(500, "Failed to load plan", {
      cause: error,
    });
  }
  if (!data) {
    throw new CompleteLevelV1Error(404, "Plan not found");
  }

  return data as UserPlanV2Row;
}

async function loadPlanItems(
  admin: SupabaseClient,
  planId: string,
): Promise<UserPlanItemRow[]> {
  const { data, error } = await admin
    .from("user_plan_items")
    .select("*")
    .eq("plan_id", planId)
    .order("phase_order", { ascending: true })
    .order("activation_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) {
    throw new CompleteLevelV1Error(500, "Failed to load plan items", {
      cause: error,
    });
  }

  return (data as UserPlanItemRow[] | null) ?? [];
}

async function loadRecentWeeklySignals(
  admin: SupabaseClient,
  args: {
    userId: string;
    cycleId: string;
    transformationId: string;
  },
): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await admin
    .from("system_runtime_snapshots")
    .select("payload")
    .eq("user_id", args.userId)
    .eq("cycle_id", args.cycleId)
    .eq("transformation_id", args.transformationId)
    .eq("snapshot_type", "weekly_bilan_decided_v2")
    .order("created_at", { ascending: false })
    .limit(3);

  if (error) return [];
  return ((data ?? []) as Array<{ payload: unknown }>)
    .map((row: { payload: unknown }) => row.payload)
    .filter((value: unknown): value is Record<string, unknown> =>
      Boolean(value) && typeof value === "object" && !Array.isArray(value)
    );
}

function findNextBlueprintLevel(
  plan: PlanContentV3,
  currentPhase: PlanContentV3["phases"][number],
): NonNullable<PlanContentV3["plan_blueprint"]>["levels"][number] | null {
  const levels = plan.plan_blueprint?.levels;
  if (!Array.isArray(levels)) return null;
  return levels
    .filter((level) => level.level_order > currentPhase.phase_order)
    .sort((left, right) => left.level_order - right.level_order)[0] ?? null;
}

function extractPlanItemTempId(item: UserPlanItemRow): string | null {
  const payload = item.payload && typeof item.payload === "object" &&
      !Array.isArray(item.payload)
    ? item.payload as Record<string, unknown>
    : null;
  const generation =
    payload?._generation && typeof payload._generation === "object" &&
      !Array.isArray(payload._generation)
      ? payload._generation as Record<string, unknown>
      : null;
  const tempId = typeof generation?.temp_id === "string"
    ? generation.temp_id.trim()
    : "";
  return tempId.length > 0 ? tempId : null;
}

function buildTransformationContextForNextLevel(args: {
  transformation: UserTransformationRow;
  cycle: UserCycleRow;
  plan: PlanContentV3;
}): Record<string, unknown> {
  const phase1 = args.plan.metadata && typeof args.plan.metadata === "object"
    ? (args.plan.metadata as Record<string, unknown>).phase_1
    : null;
  return {
    transformation: {
      id: args.transformation.id,
      title: args.transformation.title,
      user_summary: args.transformation.user_summary,
      internal_summary: args.transformation.internal_summary,
      success_definition: args.transformation.success_definition,
      main_constraint: args.transformation.main_constraint,
      questionnaire_schema: args.transformation.questionnaire_schema,
      questionnaire_answers: args.transformation.questionnaire_answers,
      handoff_payload: args.transformation.handoff_payload,
    },
    cycle: {
      id: args.cycle.id,
      requested_pace: args.cycle.requested_pace,
      birth_date_snapshot: args.cycle.birth_date_snapshot,
      gender_snapshot: args.cycle.gender_snapshot,
    },
    plan_metadata: {
      phase_1: phase1 ?? null,
      phase_1_preview: args.plan.metadata?.phase_1_preview ?? null,
      plan_adjustment_context: args.plan.metadata?.plan_adjustment_context ??
        null,
    },
  };
}

const AUTO_CLOSABLE_ITEM_STATUSES = new Set(["pending", "active", "stalled"]);

async function autoCloseUnfinishedLevelItems(args: {
  admin: SupabaseClient;
  planItems: UserPlanItemRow[];
  now: string;
  reason: string;
}): Promise<void> {
  const items = args.planItems.filter((item) =>
    AUTO_CLOSABLE_ITEM_STATUSES.has(item.status)
  );
  await Promise.all(items.map(async (item) => {
    const payload = item.payload && typeof item.payload === "object"
      ? item.payload
      : {};
    const { error } = await args.admin
      .from("user_plan_items")
      .update({
        status: "cancelled",
        payload: {
          ...payload,
          level_auto_closed: {
            reason: args.reason,
            closed_at: args.now,
            previous_status: item.status,
          },
        },
        updated_at: args.now,
      } as never)
      .eq("id", item.id);
    if (error) {
      throw new CompleteLevelV1Error(500, "Failed to auto-close level item", {
        cause: error,
      });
    }
  }));
}

async function cancelPendingLevelReviewReminders(args: {
  admin: SupabaseClient;
  userId: string;
  planId: string;
  phaseId: string;
  now: string;
}): Promise<void> {
  const { error } = await args.admin
    .from("scheduled_checkins")
    .update({
      status: "cancelled",
      processed_at: args.now,
    } as never)
    .eq("user_id", args.userId)
    .like(
      "event_context",
      `${LEVEL_REVIEW_REMINDER_EVENT_CONTEXT_PREFIX}:${args.planId}:${args.phaseId}%`,
    )
    .in("status", ["pending", "retrying", "awaiting_user"]);
  if (error) {
    throw new CompleteLevelV1Error(
      500,
      "Failed to cancel level review reminders",
      {
        cause: error,
      },
    );
  }
}

async function hasActiveWeekPlanningValidationPrompt(args: {
  admin: SupabaseClient;
  userId: string;
  planId: string;
  targetWeekStartDate: string | null;
}): Promise<boolean> {
  const { data, error } = await args.admin
    .from("scheduled_checkins")
    .select("id,message_payload")
    .eq("user_id", args.userId)
    .eq("event_context", ONBOARDING_WEEK1_VALIDATION_PROMPT_EVENT_CONTEXT)
    .filter("message_payload->>plan_id", "eq", args.planId)
    .in("status", ["pending", "retrying", "awaiting_user", "sent"])
    .limit(20);
  if (error) {
    throw new CompleteLevelV1Error(
      500,
      "Failed to inspect week planning validation prompts",
      {
        cause: error,
      },
    );
  }

  const targetWeekStartDate = String(args.targetWeekStartDate ?? "").trim();
  return ((data ?? []) as Array<Record<string, unknown>>).some((row) => {
    const payload =
      row.message_payload && typeof row.message_payload === "object"
        ? row.message_payload as Record<string, unknown>
        : {};
    const rowWeek = String(
      payload.target_week_start_date ?? payload.week_start_date ?? "",
    ).trim();
    return !targetWeekStartDate || rowWeek === targetWeekStartDate;
  });
}

async function scheduleNewLevelWeekPlanningValidation(args: {
  admin: SupabaseClient;
  userId: string;
  planId: string;
  planTitle: string | null;
  timezone: string;
  levelOrder: number;
  levelTitle: string;
  targetWeekStartDate: string | null;
  now: string;
}): Promise<void> {
  const { data: profile, error: profileError } = await args.admin
    .from("profiles")
    .select("id,whatsapp_opted_in")
    .eq("id", args.userId)
    .maybeSingle();
  if (profileError) {
    throw new CompleteLevelV1Error(
      500,
      "Failed to load profile for week planning validation",
      {
        cause: profileError,
      },
    );
  }
  if (
    !profile || (profile as Record<string, unknown>).whatsapp_opted_in !== true
  ) {
    return;
  }

  const planning = await loadOnboardingWeek1Planning(args.admin, {
    userId: args.userId,
    planId: args.planId,
    targetWeekStartDate: args.targetWeekStartDate,
  });
  if (!planning.has_planning || planning.already_confirmed) return;

  const effectiveTargetWeekStart = args.targetWeekStartDate ??
    planning.week_start_date;
  if (
    await hasActiveWeekPlanningValidationPrompt({
      admin: args.admin,
      userId: args.userId,
      planId: args.planId,
      targetWeekStartDate: effectiveTargetWeekStart,
    })
  ) {
    return;
  }

  const scheduledFor = new Date(
    new Date(args.now).getTime() + ONBOARDING_WEEK1_PROMPT_DELAY_MS,
  ).toISOString();
  const { error } = await args.admin
    .from("scheduled_checkins")
    .insert({
      user_id: args.userId,
      origin: "weekly_planning",
      event_context: ONBOARDING_WEEK1_VALIDATION_PROMPT_EVENT_CONTEXT,
      draft_message: buildOnboardingWeek1ValidationPromptMessage(),
      message_mode: "static",
      message_payload: {
        source: "complete_level_v1_next_level_generation",
        version: 1,
        user_id: args.userId,
        plan_id: args.planId,
        plan_title: args.planTitle ?? "ton plan",
        timezone: args.timezone,
        level_order: args.levelOrder,
        level_title: args.levelTitle,
        week_start_date: planning.week_start_date,
        week_end_date: planning.week_end_date,
        target_week_start_date: effectiveTargetWeekStart,
        summary_lines: planning.summary_lines,
        created_from: "next_level_generation",
        prompt_kind: "validation_prompt",
        planning_available_at_schedule_time: planning.has_planning,
        generated_at: args.now,
      },
      scheduled_for: scheduledFor,
      status: "pending",
    } as never);
  if (error) {
    throw new CompleteLevelV1Error(
      500,
      "Failed to schedule new level week planning validation",
      {
        cause: error,
      },
    );
  }
}

const NEW_LEVEL_WEEK1_AUTO_VALIDATION_EVENT_CONTEXT =
  "new_level_week1_auto_validation_v1";

function buildNewLevelWeek1AutoValidationMessage(args: {
  summaryLines: string[];
}): string {
  const summary = args.summaryLines.length > 0
    ? args.summaryLines.join("\n")
    : "- Premiere semaine du niveau validee.";
  return [
    "J'ai prepare ton nouveau niveau et valide ta premiere semaine pour que tes rappels d'action puissent partir normalement.",
    "",
    "Resume du planning :",
    summary,
    "",
    "Tu peux toujours l'ajuster dans ton espace si tu veux.",
  ].join("\n");
}

// Auto-timeout transition: the whole level jump happened without the user
// (they never answered the level review). Leaving week 1 pending behind a
// validation prompt would mean no action reminders until the next-day 07:00
// auto-validation. Since nothing asked for the user's input, validate week 1
// straight away so reminders start, then notify best-effort.
async function autoValidateNewLevelWeek1AndNotify(args: {
  admin: SupabaseClient;
  userId: string;
  planId: string;
  planTitle: string | null;
  timezone: string;
  levelOrder: number;
  levelTitle: string;
  targetWeekStartDate: string | null;
  now: string;
}): Promise<void> {
  const confirmation = await autoConfirmOnboardingWeek1Planning(args.admin, {
    userId: args.userId,
    planId: args.planId,
    targetWeekStartDate: args.targetWeekStartDate,
    nowIso: args.now,
  });
  // No pending planning to apply (nothing materialized, or already validated by
  // a prior run being retried): nothing to do, and no duplicate notification.
  if (!confirmation.changed) return;

  const { data: profile, error: profileError } = await args.admin
    .from("profiles")
    .select("id,whatsapp_opted_in")
    .eq("id", args.userId)
    .maybeSingle();
  if (profileError) {
    throw new CompleteLevelV1Error(
      500,
      "Failed to load profile for new level week1 auto-validation notice",
      { cause: profileError },
    );
  }
  if (
    !profile || (profile as Record<string, unknown>).whatsapp_opted_in !== true
  ) {
    return;
  }

  const effectiveTargetWeekStart = args.targetWeekStartDate ??
    confirmation.planning.week_start_date;
  const { error } = await args.admin
    .from("scheduled_checkins")
    .insert({
      user_id: args.userId,
      origin: "weekly_planning",
      event_context: NEW_LEVEL_WEEK1_AUTO_VALIDATION_EVENT_CONTEXT,
      draft_message: buildNewLevelWeek1AutoValidationMessage({
        summaryLines: confirmation.planning.summary_lines,
      }),
      message_mode: "static",
      message_payload: {
        source: "complete_level_v1_auto_timeout_week1_auto_validation",
        version: 1,
        user_id: args.userId,
        plan_id: args.planId,
        plan_title: args.planTitle ?? "ton plan",
        timezone: args.timezone,
        level_order: args.levelOrder,
        level_title: args.levelTitle,
        week_start_date: confirmation.planning.week_start_date,
        week_end_date: confirmation.planning.week_end_date,
        target_week_start_date: effectiveTargetWeekStart,
        summary_lines: confirmation.planning.summary_lines,
        created_from: "next_level_generation_auto",
        auto_validated: true,
        auto_validated_at: args.now,
        generated_at: args.now,
      },
      scheduled_for: args.now,
      status: "pending",
    } as never);
  if (error) {
    throw new CompleteLevelV1Error(
      500,
      "Failed to schedule new level week1 auto-validation notice",
      { cause: error },
    );
  }
}

// Route the new level's first week: an auto-timeout transition validates it
// immediately (mirrors the automatic nature of the transition); a user-driven
// review keeps the explicit "validate your week" prompt so the engaged user can
// still adjust the days before locking.
async function applyNewLevelWeekPlanning(args: {
  admin: SupabaseClient;
  reviewMode: "user_review" | "auto_timeout";
  userId: string;
  planId: string;
  planTitle: string | null;
  timezone: string;
  levelOrder: number;
  levelTitle: string;
  targetWeekStartDate: string | null;
  now: string;
}): Promise<void> {
  if (args.reviewMode === "auto_timeout") {
    await autoValidateNewLevelWeek1AndNotify(args);
    return;
  }
  await scheduleNewLevelWeekPlanningValidation(args);
}

export async function completeLevelV1(args: {
  admin: SupabaseClient;
  requestId: string;
  userId: string;
  transformationId: string;
  planId: string | null;
  answers: Record<string, unknown>;
  reviewMode?: "user_review" | "auto_timeout";
  autoReason?: string | null;
}): Promise<{
  reviewId: string;
  generationEventId: string;
  decision: string;
  decisionReason: string;
  summary: string;
  nextLevel: {
    phase_id: string;
    level_order: number;
    title: string;
    duration_weeks: number;
  } | null;
}> {
  const now = new Date().toISOString();
  logCompleteLevelStep(args.requestId, "started", {
    user_id: args.userId,
    transformation_id: args.transformationId,
    plan_id: args.planId,
    review_mode: args.reviewMode ?? "user_review",
  });
  const transformation = await loadTransformation(
    args.admin,
    args.transformationId,
  );
  const cycle = await loadCycle(args.admin, transformation.cycle_id);

  if (cycle.user_id !== args.userId) {
    throw new CompleteLevelV1Error(403, "Forbidden");
  }
  if (transformation.status !== "active") {
    throw new CompleteLevelV1Error(
      409,
      `La transformation n'est pas clôturable depuis l'état ${transformation.status}.`,
    );
  }

  const plan = await loadPlan({
    admin: args.admin,
    transformation,
    planId: args.planId,
  });
  const planContent = parsePlanContent(
    plan.content as Record<string, unknown> | null,
  );
  const currentLevelRuntime = planContent.current_level_runtime;
  if (!currentLevelRuntime) {
    throw new CompleteLevelV1Error(
      409,
      "Aucun niveau courant n'est disponible. Le plan est peut-être déjà arrivé au bout.",
    );
  }

  const currentPhase = planContent.phases.find((phase) =>
    phase.phase_id === currentLevelRuntime.phase_id ||
    phase.phase_order === currentLevelRuntime.level_order
  );
  if (!currentPhase) {
    throw new CompleteLevelV1Error(
      409,
      "Le niveau courant du plan est incohérent.",
    );
  }

  const planItems = await loadPlanItems(args.admin, plan.id);
  logCompleteLevelStep(args.requestId, "loaded_state", {
    user_id: args.userId,
    cycle_id: cycle.id,
    transformation_id: transformation.id,
    plan_id: plan.id,
    transformation_status: transformation.status,
    plan_status: plan.status,
    current_phase_id: currentPhase.phase_id,
    current_level_order: currentPhase.phase_order,
    plan_item_count: planItems.length,
  });
  const userTimeContext = await getUserTimeContext({
    supabase: args.admin,
    userId: args.userId,
    now: new Date(now),
  });
  const transitionReady = isLevelTransitionReady(
    currentPhase.phase_id,
    planItems,
  );
  const reviewWindowOpen = isLevelReviewWindowOpen({
    plan: planContent,
    currentLevel: currentLevelRuntime,
    userLocalDate: userTimeContext.user_local_date,
  });
  if (!transitionReady && !reviewWindowOpen) {
    throw new CompleteLevelV1Error(
      409,
      "Ce bilan se débloque deux jours avant la fin du niveau, ou quand toutes ses actions sont bouclées.",
    );
  }

  // Resume support: a review row without its generation event means a previous
  // run crashed mid-transition (e.g. edge timeout during the LLM call). Reuse
  // that review — its id, answers and mode — instead of inserting a duplicate,
  // so retries are idempotent and user answers survive the retry.
  const [existingReviewResult, existingEventResult] = await Promise.all([
    args.admin
      .from("user_plan_level_reviews")
      .select("id,answers,review_mode")
      .eq("plan_id", plan.id)
      .eq("phase_id", currentPhase.phase_id)
      .order("created_at", { ascending: false })
      .limit(1),
    args.admin
      .from("user_plan_level_generation_events")
      .select("id")
      .eq("plan_id", plan.id)
      .eq("from_phase_id", currentPhase.phase_id)
      .limit(1),
  ]);
  if (existingReviewResult.error) {
    throw new CompleteLevelV1Error(500, "Failed to load existing level review", {
      cause: existingReviewResult.error,
    });
  }
  if (existingEventResult.error) {
    throw new CompleteLevelV1Error(
      500,
      "Failed to load existing level generation event",
      { cause: existingEventResult.error },
    );
  }
  if ((existingEventResult.data ?? []).length > 0) {
    throw new CompleteLevelV1Error(
      409,
      "La transition de ce niveau est déjà terminée.",
    );
  }
  const existingReview = ((existingReviewResult.data ?? []) as Array<{
    id: string;
    answers?: Record<string, unknown> | null;
    review_mode?: string | null;
  }>)[0] ?? null;
  if (existingReview) {
    logCompleteLevelStep(args.requestId, "resume_orphan_level_review", {
      plan_id: plan.id,
      phase_id: currentPhase.phase_id,
      review_id: existingReview.id,
      review_mode: existingReview.review_mode ?? null,
    });
  }

  const schema = buildLevelReviewSchema({
    currentLevel: currentLevelRuntime,
    items: planItems.filter((item) => item.phase_id === currentPhase.phase_id),
    weeks: currentLevelRuntime.weeks,
    primaryMetricLabel: planContent.primary_metric?.label ?? null,
  });
  const reviewMode = existingReview
    ? (existingReview.review_mode === "auto_timeout"
      ? "auto_timeout"
      : "user_review")
    : args.reviewMode ?? "user_review";
  const rawAnswers = existingReview
    ? (existingReview.answers ?? {}) as Record<string, unknown>
    : reviewMode === "auto_timeout"
    ? {
      global_metric_state: "unclear",
      next_plan_coherence: "not_sure",
      coherence_reason:
        "Validation automatique: l'utilisateur n'a pas repondu au bilan avant la fin du niveau.",
      difficulty_signal: "minor",
      difficulty_details:
        "Aucun signal utilisateur direct. Generer la suite prudemment, sans augmenter brutalement la charge.",
      pride:
        "Aucun bilan utilisateur disponible. Conserver ce qui etait structurellement pertinent dans le niveau precedent.",
      ...args.answers,
    }
    : args.answers;
  const answers = normalizeLevelReviewAnswers(schema, rawAnswers);
  const summary = buildLevelReviewSummary({
    items: planItems.filter((item) => item.phase_id === currentPhase.phase_id),
    answers,
  });
  const weeklySignals = await loadRecentWeeklySignals(args.admin, {
    userId: args.userId,
    cycleId: cycle.id,
    transformationId: transformation.id,
  });

  const transition = buildNextLevelTransition({
    plan: planContent,
    summary,
    currentPhase,
  });

  const reviewId = existingReview?.id ?? crypto.randomUUID();
  const generationEventId = crypto.randomUUID();

  if (!existingReview) {
    const { error: reviewInsertError } = await args.admin
      .from("user_plan_level_reviews")
      .insert({
        id: reviewId,
        user_id: args.userId,
        cycle_id: cycle.id,
        transformation_id: transformation.id,
        plan_id: plan.id,
        phase_id: currentPhase.phase_id,
        level_order: currentPhase.phase_order,
        level_title: currentLevelRuntime.title,
        duration_weeks: currentLevelRuntime.duration_weeks,
        questionnaire_schema: schema,
        answers,
        review_summary: summary as unknown as Record<string, unknown>,
        notes: summary.free_text,
        review_mode: reviewMode,
        auto_reason: args.autoReason ?? null,
        created_at: now,
      } as never);

    if (reviewInsertError) {
      logCompleteLevelFailure(
        args.requestId,
        "persist_level_review",
        reviewInsertError,
        {
          plan_id: plan.id,
          phase_id: currentPhase.phase_id,
          review_id: reviewId,
        },
      );
      throw new CompleteLevelV1Error(500, "Failed to persist level review", {
        cause: reviewInsertError,
      });
    }
    logCompleteLevelStep(args.requestId, "persist_level_review.succeeded", {
      plan_id: plan.id,
      phase_id: currentPhase.phase_id,
      review_id: reviewId,
    });
  }

  const nextBlueprintLevel = findNextBlueprintLevel(planContent, currentPhase);
  const shouldGenerateNextLevel = Boolean(nextBlueprintLevel);
  const transitionDecisionReason = transition.nextRuntime
    ? transition.preview.reason
    : nextBlueprintLevel
    ? "Le niveau suivant est designé depuis le blueprint futur du plan, avec le bilan de fin de niveau comme signal de calibrage."
    : transition.preview.reason;
  let resultingPlanContent: PlanContentV3;
  let resultingPlanId = plan.id;
  let nextRuntime = transition.nextRuntime;
  let nextLevelGenerationDecision: string | null = null;
  let nextLevelGenerationReason: string | null = null;

  if (nextBlueprintLevel) {
    const futureBlueprintLevels = (planContent.plan_blueprint?.levels ?? [])
      .filter((level) => level.level_order > nextBlueprintLevel.level_order)
      .map((level) => ({ ...level }));
    const completedTempIds = [
      ...currentPhase.items.map((item) => item.temp_id),
      ...planItems
        .filter((item) => item.phase_id === currentPhase.phase_id)
        .map(extractPlanItemTempId)
        .filter((tempId): tempId is string => Boolean(tempId)),
    ];
    const nextLevelPatch = await runCompleteLevelStep({
      requestId: args.requestId,
      step: "generate_next_level",
      payload: {
        plan_id: plan.id,
        from_phase_id: currentPhase.phase_id,
        from_level_order: currentPhase.phase_order,
        target_phase_id: nextBlueprintLevel.phase_id,
        target_level_order: nextBlueprintLevel.level_order,
      },
      run: () =>
        generateNextLevelForPlan({
          requestId: args.requestId,
          userId: args.userId,
          context: {
            plan: planContent,
            currentLevelRuntime,
            completedPhase: currentPhase,
            completedLevelItems: planItems.filter((item) =>
              item.phase_id === currentPhase.phase_id
            ),
            nextBlueprintLevel,
            futureBlueprintLevels,
            reviewSchema: schema,
            answers,
            summary,
            weeklySignals,
            initialDecision: transition.preview.decision,
            initialDecisionReason: transitionDecisionReason,
            reviewMode,
            transformationContext: buildTransformationContextForNextLevel({
              transformation,
              cycle,
              plan: planContent,
            }),
          },
          validationContext: {
            currentLevelOrder: currentPhase.phase_order,
            completedPhaseId: currentPhase.phase_id,
            expectedNextBlueprint: nextBlueprintLevel,
            existingCompletedTempIds: [...new Set(completedTempIds)],
            globalObjective: planContent.global_objective,
          },
        }),
    });

    const generatedPhase = buildPhaseFromNextLevelPatch(nextLevelPatch);
    nextLevelGenerationDecision = nextLevelPatch.decision;
    nextLevelGenerationReason = nextLevelPatch.decision_reason;
    const generatedRuntime = buildRuntimeFromNextLevelPatch(nextLevelPatch);
    nextRuntime = generatedRuntime;
    const nextLevelScheduleAnchor = buildScheduleAnchorFromUserTimeContext({
      userTimeContext,
    });
    resultingPlanContent = {
      ...planContent,
      phases: [
        ...planContent.phases.filter((phase) =>
          phase.phase_id !== generatedPhase.phase_id &&
          phase.phase_order !== generatedPhase.phase_order
        ),
        generatedPhase,
      ].sort((left, right) => left.phase_order - right.phase_order),
      plan_blueprint: buildBlueprintFromNextLevelPatch(
        planContent,
        nextLevelPatch,
      ),
      current_level_runtime: generatedRuntime,
      metadata: {
        ...planContent.metadata,
        schedule_anchor: nextLevelScheduleAnchor,
        last_next_level_generation: {
          review_id: reviewId,
          generated_at: now,
          decision: nextLevelPatch.decision,
          decision_reason: nextLevelPatch.decision_reason,
          continuity_notes: nextLevelPatch.continuity_notes,
        },
      },
    };

    logCompleteLevelStep(args.requestId, "next_level_patch_ready", {
      plan_id: plan.id,
      decision: nextLevelPatch.decision,
      target_phase_id: generatedPhase.phase_id,
      target_level_order: generatedPhase.phase_order,
      generated_item_count: generatedPhase.items.length,
      generated_items: generatedPhase.items.map((item) => ({
        temp_id: item.temp_id,
        dimension: item.dimension,
        kind: item.kind,
        tracking_type: item.tracking_type,
        support_mode: item.support_mode ?? null,
        support_function: item.support_function ?? null,
      })),
    });

    const distribution = await runCompleteLevelStep({
      requestId: args.requestId,
      step: "distribute_next_level_items",
      payload: {
        plan_id: plan.id,
        phase_id: generatedRuntime.phase_id,
        phase_order: generatedRuntime.level_order,
        generated_item_count: generatedPhase.items.length,
      },
      run: () =>
        distributeMissingPlanPhaseItemsV3({
          supabase: args.admin,
          userId: args.userId,
          planId: plan.id,
          content: resultingPlanContent,
          now,
          reason: "next_level_generation",
          phaseId: generatedRuntime.phase_id,
          phaseOrder: generatedRuntime.level_order,
        }),
    });
    await runCompleteLevelStep({
      requestId: args.requestId,
      step: "materialize_week_planning",
      payload: {
        plan_id: plan.id,
        phase_id: generatedRuntime.phase_id,
        distributed_item_count: distribution.items.length,
        anchor_week_start: nextLevelScheduleAnchor.anchor_week_start,
      },
      run: () =>
        materializeCurrentLevelWeekPlanning({
          admin: args.admin,
          userId: args.userId,
          planId: plan.id,
          plan: resultingPlanContent,
          anchor: nextLevelScheduleAnchor,
          distributedItems: distribution.items,
          tempIdMap: distribution.tempIdMap,
          now,
        }),
    });
    await runCompleteLevelStep({
      requestId: args.requestId,
      step: "schedule_week_planning_validation",
      payload: {
        plan_id: plan.id,
        phase_id: generatedRuntime.phase_id,
        target_week_start_date: nextLevelScheduleAnchor.anchor_week_start,
      },
      run: () =>
        applyNewLevelWeekPlanning({
          admin: args.admin,
          reviewMode,
          userId: args.userId,
          planId: plan.id,
          planTitle: plan.title,
          timezone: nextLevelScheduleAnchor.timezone,
          levelOrder: generatedRuntime.level_order,
          levelTitle: generatedRuntime.title,
          targetWeekStartDate: nextLevelScheduleAnchor.anchor_week_start,
          now,
        }),
    });

    const { error: planUpdateError } = await runCompleteLevelStep({
      requestId: args.requestId,
      step: "update_plan_after_next_level",
      payload: {
        plan_id: plan.id,
        phase_id: generatedRuntime.phase_id,
        level_order: generatedRuntime.level_order,
      },
      run: async () =>
        await args.admin
          .from("user_plans_v2")
          .update({
            content: resultingPlanContent as unknown as Record<string, unknown>,
            status: "active",
            updated_at: now,
          })
          .eq("id", plan.id),
    });

    if (planUpdateError) {
      logCompleteLevelFailure(
        args.requestId,
        "update_plan_after_next_level",
        planUpdateError,
        {
          plan_id: plan.id,
          phase_id: generatedRuntime.phase_id,
        },
      );
      throw new CompleteLevelV1Error(
        500,
        "Failed to update plan after next level generation",
        {
          cause: planUpdateError,
        },
      );
    }
  } else if (nextRuntime) {
    const nextLevelScheduleAnchor = buildScheduleAnchorFromUserTimeContext({
      userTimeContext,
    });
    resultingPlanContent = {
      ...planContent,
      plan_blueprint: transition.nextBlueprint,
      current_level_runtime: nextRuntime,
      metadata: {
        ...planContent.metadata,
        schedule_anchor: nextLevelScheduleAnchor,
      },
    };

    const distribution = await distributeMissingPlanPhaseItemsV3({
      supabase: args.admin,
      userId: args.userId,
      planId: plan.id,
      content: resultingPlanContent,
      now,
      reason: "level_review_keep_transition",
      phaseId: nextRuntime.phase_id,
      phaseOrder: nextRuntime.level_order,
    });
    await materializeCurrentLevelWeekPlanning({
      admin: args.admin,
      userId: args.userId,
      planId: plan.id,
      plan: resultingPlanContent,
      anchor: nextLevelScheduleAnchor,
      distributedItems: distribution.items,
      tempIdMap: distribution.tempIdMap,
      now,
    });
    await applyNewLevelWeekPlanning({
      admin: args.admin,
      reviewMode,
      userId: args.userId,
      planId: plan.id,
      planTitle: plan.title,
      timezone: nextLevelScheduleAnchor.timezone,
      levelOrder: nextRuntime.level_order,
      levelTitle: nextRuntime.title,
      targetWeekStartDate: nextLevelScheduleAnchor.anchor_week_start,
      now,
    });

    const { error: planUpdateError } = await args.admin
      .from("user_plans_v2")
      .update({
        content: resultingPlanContent as unknown as Record<string, unknown>,
        status: "active",
        updated_at: now,
      })
      .eq("id", plan.id);

    if (planUpdateError) {
      throw new CompleteLevelV1Error(
        500,
        "Failed to update plan after level review",
        {
          cause: planUpdateError,
        },
      );
    }
  } else {
    resultingPlanContent = {
      ...planContent,
      plan_blueprint: transition.nextBlueprint,
      current_level_runtime: null,
    };

    const { error: planUpdateError } = await args.admin
      .from("user_plans_v2")
      .update({
        content: resultingPlanContent as unknown as Record<string, unknown>,
        status: "completed",
        completed_at: plan.completed_at ?? now,
        updated_at: now,
      })
      .eq("id", plan.id);

    if (planUpdateError) {
      throw new CompleteLevelV1Error(
        500,
        "Failed to update plan after level review",
        {
          cause: planUpdateError,
        },
      );
    }
  }

  // Déblocage par semaine: filet déterministe au passage de niveau — active
  // les items du nouveau niveau dont la semaine est commencée (couvre les
  // items matérialisés pending lors d'une génération antérieure ou d'un retry).
  if (resultingPlanContent.current_level_runtime) {
    await activateDueWeekItems({
      supabase: args.admin,
      userId: args.userId,
      planId: plan.id,
      planContent: resultingPlanContent,
      now: new Date(now),
    });
  }

  const { error: generationInsertError } = await args.admin
    .from("user_plan_level_generation_events")
    .insert({
      id: generationEventId,
      review_id: reviewId,
      user_id: args.userId,
      cycle_id: cycle.id,
      transformation_id: transformation.id,
      plan_id: plan.id,
      from_phase_id: currentPhase.phase_id,
      to_phase_id: nextRuntime?.phase_id ?? null,
      decision: transition.preview.decision,
      decision_reason: transitionDecisionReason,
      generation_input: {
        review_summary: summary,
        weekly_signals: weeklySignals,
        source_plan_id: plan.id,
        resulting_plan_id: resultingPlanId,
        used_ai_generation: shouldGenerateNextLevel,
        generation_scope: shouldGenerateNextLevel
          ? "next_level"
          : "existing_runtime",
        next_level_generation_decision: nextLevelGenerationDecision,
        next_level_generation_reason: nextLevelGenerationReason,
      },
      previous_current_level_runtime: currentLevelRuntime as unknown as Record<
        string,
        unknown
      >,
      next_current_level_runtime: nextRuntime as unknown as
        | Record<string, unknown>
        | null,
      previous_plan_blueprint: planContent.plan_blueprint as unknown as
        | Record<string, unknown>
        | null,
      next_plan_blueprint: resultingPlanContent.plan_blueprint as unknown as
        | Record<string, unknown>
        | null,
      created_at: now,
    } as never);

  if (generationInsertError) {
    throw new CompleteLevelV1Error(
      500,
      "Failed to persist level generation event",
      {
        cause: generationInsertError,
      },
    );
  }

  if (reviewMode === "auto_timeout") {
    await autoCloseUnfinishedLevelItems({
      admin: args.admin,
      planItems: planItems.filter((item) =>
        item.phase_id === currentPhase.phase_id
      ),
      now,
      reason: args.autoReason ?? "level_auto_closed",
    });
  }

  await cancelPendingLevelReviewReminders({
    admin: args.admin,
    userId: args.userId,
    planId: plan.id,
    phaseId: currentPhase.phase_id,
    now,
  });

  try {
    await logV2Event(args.admin, V2_EVENT_TYPES.PHASE_TRANSITION, {
      user_id: args.userId,
      cycle_id: cycle.id,
      transformation_id: transformation.id,
      plan_id: resultingPlanId,
      reason: nextRuntime
        ? shouldGenerateNextLevel
          ? "level_review_completed_ai"
          : "level_review_completed_keep"
        : "final_level_completed",
      metadata: {
        review_id: reviewId,
        generation_event_id: generationEventId,
        from_phase_id: currentPhase.phase_id,
        to_phase_id: nextRuntime?.phase_id ?? null,
        decision: transition.preview.decision,
        source_plan_id: plan.id,
        resulting_plan_id: resultingPlanId,
      },
    });
  } catch {
    // Non-blocking audit logging.
  }

  const summaryText = nextRuntime
    ? `Niveau suivant prêt: ${nextRuntime.title}. ${transitionDecisionReason}`
    : "Dernier niveau validé. Le plan est maintenant terminé.";

  return {
    reviewId,
    generationEventId,
    decision: transition.preview.decision,
    decisionReason: transitionDecisionReason,
    summary: summaryText,
    nextLevel: nextRuntime
      ? {
        phase_id: nextRuntime.phase_id,
        level_order: nextRuntime.level_order,
        title: nextRuntime.title,
        duration_weeks: nextRuntime.duration_weeks,
      }
      : null,
  };
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

    const admin = createClient(env.url, env.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const result = await completeLevelV1({
      admin,
      requestId,
      userId: authData.user.id,
      transformationId: parsedBody.data.transformation_id,
      planId: parsedBody.data.plan_id ?? null,
      answers: parsedBody.data.answers,
    });

    return jsonResponse(req, {
      request_id: requestId,
      review_id: result.reviewId,
      generation_event_id: result.generationEventId,
      decision: result.decision,
      decision_reason: result.decisionReason,
      summary: result.summary,
      next_level: result.nextLevel,
    });
  } catch (error) {
    const ctx = getRequestContext(req);
    const debugError = summarizeError(error);
    console.error("[complete-level-v1][request_failed]", {
      request_id: requestId,
      user_id: ctx.userId,
      error: debugError,
    });
    await logEdgeFunctionError({
      functionName: "complete-level-v1",
      error,
      requestId,
      userId: ctx.userId,
      source: "edge",
      metadata: { route: "complete-level-v1", debug_error: debugError },
    });

    if (error instanceof CompleteLevelV1Error) {
      const body = {
        error: error.message,
        request_id: requestId,
        ...(shouldExposeDebugError(req) ? { debug: debugError } : {}),
      };
      if (error.status === 400) {
        return badRequest(req, requestId, error.message);
      }
      return jsonResponse(
        req,
        body,
        { status: error.status },
      );
    }

    if (
      error instanceof PlanDistributionError ||
      error instanceof GeneratePlanV2Error ||
      error instanceof GenerateNextLevelV1Error
    ) {
      return jsonResponse(
        req,
        {
          error: error.message,
          request_id: requestId,
          ...(shouldExposeDebugError(req) ? { debug: debugError } : {}),
        },
        { status: 500 },
      );
    }

    return jsonResponse(
      req,
      {
        error: "Failed to complete current level",
        request_id: requestId,
        ...(shouldExposeDebugError(req) ? { debug: debugError } : {}),
      },
      { status: 500 },
    );
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
