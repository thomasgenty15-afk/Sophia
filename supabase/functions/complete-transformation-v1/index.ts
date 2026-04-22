import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "jsr:@supabase/supabase-js@2";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import {
  badRequest,
  jsonResponse,
  parseJsonBody,
  serverError,
  z,
} from "../_shared/http.ts";
import { getRequestContext } from "../_shared/request_context.ts";
import { logV2Event, V2_EVENT_TYPES } from "../_shared/v2-events.ts";
import { executeTransformationHandoff } from "../sophia-brain/transformation_handoff.ts";
import type {
  BaseDeVieLineEntry,
  BaseDeVieDeclics,
  PlanItemStatus,
  TransformationClosureFeedback,
  UserCycleRow,
  UserPlanItemRow,
  UserPlanV2Row,
  UserTransformationBaseDeViePayload,
  UserTransformationRow,
} from "../_shared/v2-types.ts";

const DECLICS_SCHEMA = z.object({
  why: z.string().trim().min(1).max(1600),
  insight: z.string().trim().min(1).max(1600),
  identity_shift: z.string().trim().min(1).max(1600),
});

const LINE_ENTRY_SCHEMA = z.object({
  action: z.string().trim().min(1).max(220),
  why: z.string().trim().min(1).max(1600),
});

const IMPROVEMENT_REASON_VALUES = [
  "plan_unclear",
  "pace_too_intense",
  "actions_too_hard",
  "actions_not_real_life",
  "sophia_not_helpful_moment",
  "progress_not_visible",
  "need_more_support",
  "other",
] as const;

const MOST_HELPFUL_AREA_VALUES = [
  "habits",
  "one_off_actions",
  "sophia_messages",
  "plan_structure",
  "progress_tracking",
  "other",
] as const;

const FEEDBACK_SCHEMA = z.object({
  helpfulness_rating: z.number().int().min(1).max(10),
  improvement_reasons: z.array(z.enum(IMPROVEMENT_REASON_VALUES)).max(8),
  improvement_detail: z.string().trim().max(1600).nullable().optional(),
  most_helpful_area: z.enum(MOST_HELPFUL_AREA_VALUES),
});

const REQUEST_SCHEMA = z.object({
  transformation_id: z.string().uuid(),
  line_green_entry: LINE_ENTRY_SCHEMA,
  line_red_entry: LINE_ENTRY_SCHEMA,
  feedback: FEEDBACK_SCHEMA,
  declics_draft: DECLICS_SCHEMA.nullable().optional(),
  declics_user: DECLICS_SCHEMA.nullable().optional(),
});

const TERMINAL_PLAN_ITEM_STATUSES = new Set<PlanItemStatus>([
  "completed",
  "in_maintenance",
  "deactivated",
  "cancelled",
]);

class CompleteTransformationV1Error extends Error {
  status: number;

  constructor(status: number, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "CompleteTransformationV1Error";
    this.status = status;
  }
}

function getSupabaseEnv() {
  const url = String(Deno.env.get("SUPABASE_URL") ?? "").trim();
  const anonKey = String(Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
  const serviceRoleKey = String(
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  ).trim();
  if (!url || !anonKey || !serviceRoleKey) {
    throw new CompleteTransformationV1Error(
      500,
      "Supabase environment variables are not configured",
    );
  }
  return { url, anonKey, serviceRoleKey };
}

function sanitizeLineRedEntries(entries: string[]): string[] {
  return [...new Set(
    entries
      .map((entry) => entry.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .slice(0, 8),
  )];
}

function sanitizeLineEntry(input: BaseDeVieLineEntry | null | undefined): BaseDeVieLineEntry | null {
  if (!input) return null;

  const action = input.action.replace(/\s+/g, " ").trim();
  const why = input.why.replace(/\s+/g, " ").trim();

  if (!action || !why) return null;

  return {
    action,
    why,
  };
}

function sanitizeDeclics(input: BaseDeVieDeclics | null | undefined): BaseDeVieDeclics | null {
  if (!input) return null;

  const why = input.why.replace(/\s+/g, " ").trim();
  const insight = input.insight.replace(/\s+/g, " ").trim();
  const identityShift = input.identity_shift.replace(/\s+/g, " ").trim();

  if (!why || !insight || !identityShift) return null;

  return {
    why,
    insight,
    identity_shift: identityShift,
  };
}

function sanitizeFeedback(
  input: TransformationClosureFeedback | null | undefined,
): TransformationClosureFeedback | null {
  if (!input) return null;

  const helpfulnessRating = Number(input.helpfulness_rating);
  const mostHelpfulArea = String(input.most_helpful_area ?? "").trim();
  if (
    !Number.isInteger(helpfulnessRating) ||
    helpfulnessRating < 1 ||
    helpfulnessRating > 10 ||
    !MOST_HELPFUL_AREA_VALUES.includes(
      mostHelpfulArea as typeof MOST_HELPFUL_AREA_VALUES[number],
    )
  ) {
    return null;
  }

  const improvementReasons = [...new Set(
    (Array.isArray(input.improvement_reasons) ? input.improvement_reasons : [])
      .map((reason) => String(reason ?? "").trim())
      .filter((reason): reason is typeof IMPROVEMENT_REASON_VALUES[number] =>
        IMPROVEMENT_REASON_VALUES.includes(reason as typeof IMPROVEMENT_REASON_VALUES[number])
      )
      .slice(0, 8),
  )];

  return {
    helpfulness_rating: helpfulnessRating,
    improvement_reasons: improvementReasons,
    improvement_detail: String(input.improvement_detail ?? "").replace(/\s+/g, " ").trim() || null,
    most_helpful_area: mostHelpfulArea as TransformationClosureFeedback["most_helpful_area"],
  };
}

function assertFeedbackIsCoherent(feedback: TransformationClosureFeedback | null) {
  if (!feedback) {
    throw new CompleteTransformationV1Error(
      400,
      "Le feedback de fin de transformation est incomplet.",
    );
  }

  if (feedback.helpfulness_rating < 8 && feedback.improvement_reasons.length === 0) {
    throw new CompleteTransformationV1Error(
      400,
      "Choisis au moins une piste d'amélioration quand la note est inférieure à 8.",
    );
  }

  if (
    feedback.improvement_reasons.includes("other") &&
    !String(feedback.improvement_detail ?? "").trim()
  ) {
    throw new CompleteTransformationV1Error(
      400,
      "Ajoute un détail quand tu choisis \"Autre\" comme piste d'amélioration.",
    );
  }
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
    throw new CompleteTransformationV1Error(500, "Failed to load transformation", {
      cause: error,
    });
  }
  if (!data) {
    throw new CompleteTransformationV1Error(404, "Transformation not found");
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
    throw new CompleteTransformationV1Error(500, "Failed to load cycle", {
      cause: error,
    });
  }
  if (!data) {
    throw new CompleteTransformationV1Error(404, "Cycle not found");
  }

  return data as UserCycleRow;
}

async function loadPlanForTransformation(
  admin: SupabaseClient,
  transformation: UserTransformationRow,
): Promise<UserPlanV2Row> {
  const { data, error } = await admin
    .from("user_plans_v2")
    .select("*")
    .eq("cycle_id", transformation.cycle_id)
    .eq("transformation_id", transformation.id)
    .in("status", ["active", "paused", "completed"])
    .order("activated_at", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new CompleteTransformationV1Error(500, "Failed to load plan", {
      cause: error,
    });
  }
  if (!data) {
    throw new CompleteTransformationV1Error(
      409,
      "Aucun plan actif ou complété n'est disponible pour cette transformation.",
    );
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
    .eq("plan_id", planId);

  if (error) {
    throw new CompleteTransformationV1Error(500, "Failed to load plan items", {
      cause: error,
    });
  }

  return (data as UserPlanItemRow[] | null) ?? [];
}

function assertPlanIsReadyForCompletion(planItems: UserPlanItemRow[]) {
  if (planItems.length === 0) {
    throw new CompleteTransformationV1Error(
      409,
      "Cette transformation n'a encore aucun item à clôturer.",
    );
  }

  const blockingItems = planItems.filter((item) => !TERMINAL_PLAN_ITEM_STATUSES.has(item.status));
  if (blockingItems.length > 0) {
    throw new CompleteTransformationV1Error(
      409,
      "Tous les éléments du plan doivent être terminés avant la clôture.",
    );
  }
}

function buildBaseDeViePayload(args: {
  nowIso: string;
  lineGreenEntry: BaseDeVieLineEntry;
  lineRedEntry: BaseDeVieLineEntry;
  declicsDraft: BaseDeVieDeclics | null;
  declicsUser: BaseDeVieDeclics | null;
  feedback: TransformationClosureFeedback;
}): UserTransformationBaseDeViePayload {
  const lineGreenEntry = sanitizeLineEntry(args.lineGreenEntry);
  const lineRedEntry = sanitizeLineEntry(args.lineRedEntry);

  return {
    line_red_entries: sanitizeLineRedEntries(lineRedEntry ? [lineRedEntry.action] : []),
    line_green_entry: lineGreenEntry,
    line_red_entry: lineRedEntry,
    declics_draft: sanitizeDeclics(args.declicsDraft),
    declics_user: sanitizeDeclics(args.declicsUser ?? args.declicsDraft),
    closure_feedback: sanitizeFeedback(args.feedback),
    validated_at: args.nowIso,
    last_edited_at: args.nowIso,
  };
}

export async function completeTransformationV1(args: {
  admin: SupabaseClient;
  requestId: string;
  userId: string;
  transformationId: string;
  lineGreenEntry: BaseDeVieLineEntry;
  lineRedEntry: BaseDeVieLineEntry;
  feedback: TransformationClosureFeedback;
  declicsDraft: BaseDeVieDeclics | null;
  declicsUser: BaseDeVieDeclics | null;
}) {
  const nowIso = new Date().toISOString();
  const transformation = await loadTransformation(args.admin, args.transformationId);
  const cycle = await loadCycle(args.admin, transformation.cycle_id);

  if (cycle.user_id !== args.userId) {
    throw new CompleteTransformationV1Error(403, "Forbidden");
  }
  if (transformation.status !== "active") {
    throw new CompleteTransformationV1Error(
      409,
      `La transformation ne peut pas être clôturée depuis l'état ${transformation.status}.`,
    );
  }

  const plan = await loadPlanForTransformation(args.admin, transformation);
  const planItems = await loadPlanItems(args.admin, plan.id);
  assertPlanIsReadyForCompletion(planItems);

  const baseDeViePayload = buildBaseDeViePayload({
    nowIso,
    lineGreenEntry: args.lineGreenEntry,
    lineRedEntry: args.lineRedEntry,
    declicsDraft: args.declicsDraft,
    declicsUser: args.declicsUser,
    feedback: args.feedback,
  });
  assertFeedbackIsCoherent(baseDeViePayload.closure_feedback);

  const { error: planError } = await args.admin
    .from("user_plans_v2")
    .update({
      status: "completed",
      completed_at: plan.completed_at ?? nowIso,
      updated_at: nowIso,
    })
    .eq("id", plan.id);

  if (planError) {
    throw new CompleteTransformationV1Error(500, "Failed to update plan", {
      cause: planError,
    });
  }

  const { data: updatedTransformation, error: transformationError } = await args.admin
    .from("user_transformations")
    .update({
      status: "completed",
      completed_at: transformation.completed_at ?? nowIso,
      base_de_vie_payload: baseDeViePayload as unknown as Record<string, unknown>,
      updated_at: nowIso,
    })
    .eq("id", transformation.id)
    .select("*")
    .single();

  if (transformationError) {
    throw new CompleteTransformationV1Error(500, "Failed to update transformation", {
      cause: transformationError,
    });
  }

  const closureFeedback = baseDeViePayload.closure_feedback;
  const { error: feedbackError } = await args.admin
    .from("user_transformation_closure_feedback")
    .upsert({
      user_id: args.userId,
      cycle_id: cycle.id,
      transformation_id: transformation.id,
      plan_id: plan.id,
      helpfulness_rating: closureFeedback?.helpfulness_rating ?? null,
      improvement_reasons: closureFeedback?.improvement_reasons ?? [],
      improvement_detail: closureFeedback?.improvement_detail ?? null,
      most_helpful_area: closureFeedback?.most_helpful_area ?? null,
      updated_at: nowIso,
    } as never, {
      onConflict: "transformation_id",
    });

  if (feedbackError) {
    throw new CompleteTransformationV1Error(500, "Failed to save closure feedback", {
      cause: feedbackError,
    });
  }

  const { data: completedInitiatives, error: initiativesError } = await args.admin
    .from("user_recurring_reminders")
    .update({
      status: "completed",
      ended_reason: "plan_completed",
      deactivated_at: nowIso,
      updated_at: nowIso,
    } as any)
    .eq("user_id", args.userId)
    .eq("transformation_id", transformation.id)
    .eq("initiative_kind", "plan_free")
    .in("status", ["active", "inactive"])
    .select("id");

  if (initiativesError) {
    throw new CompleteTransformationV1Error(500, "Failed to complete initiatives", {
      cause: initiativesError,
    });
  }

  const completedInitiativeIds = ((completedInitiatives ?? []) as Array<{ id: string }>).map((row) =>
    row.id
  );

  if (completedInitiativeIds.length > 0) {
    const { error: cancelCheckinsError } = await args.admin
      .from("scheduled_checkins")
      .update({
        status: "cancelled",
        processed_at: nowIso,
      } as any)
      .in("recurring_reminder_id", completedInitiativeIds)
      .in("status", ["pending", "retrying", "awaiting_user"]);

    if (cancelCheckinsError) {
      throw new CompleteTransformationV1Error(500, "Failed to cancel pending initiative checkins", {
        cause: cancelCheckinsError,
      });
    }
  }

  if (cycle.active_transformation_id === transformation.id) {
    const { error: cycleError } = await args.admin
      .from("user_cycles")
      .update({
        active_transformation_id: null,
        updated_at: nowIso,
      })
      .eq("id", cycle.id);

    if (cycleError) {
      throw new CompleteTransformationV1Error(500, "Failed to update cycle", {
        cause: cycleError,
      });
    }
  }

  try {
    await logV2Event(args.admin, V2_EVENT_TYPES.TRANSFORMATION_COMPLETED, {
      user_id: args.userId,
      cycle_id: cycle.id,
      transformation_id: transformation.id,
      plan_id: plan.id,
      reason: "base_de_vie_closure",
      metadata: {
        line_red_count: baseDeViePayload.line_red_entries.length,
        has_line_green_entry: Boolean(baseDeViePayload.line_green_entry),
        has_declics_draft: Boolean(baseDeViePayload.declics_draft),
        helpfulness_rating: baseDeViePayload.closure_feedback?.helpfulness_rating ?? null,
      },
    });
  } catch {
    // Non-blocking event logging.
  }

  const warnings: string[] = [];
  try {
    const handoffResult = await executeTransformationHandoff(
      args.admin,
      args.userId,
      transformation.id,
      {
        requestId: args.requestId,
        nowIso,
      },
    );
    warnings.push(...handoffResult.eventWarnings);
  } catch (error) {
    warnings.push(
      error instanceof Error
        ? error.message
        : "Transformation completed without handoff generation.",
    );
  }

  return {
    transformation: updatedTransformation as UserTransformationRow,
    planId: plan.id,
    warnings,
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

    const parsed = await parseJsonBody(req, REQUEST_SCHEMA, requestId);
    if (!parsed.ok) return parsed.response;

    const authHeader = String(
      req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "",
    ).trim();
    if (!authHeader) {
      return jsonResponse(
        req,
        { error: "Missing Authorization header", request_id: requestId },
        { status: 401 },
      );
    }

    const env = getSupabaseEnv();
    const userClient = createClient(env.url, env.anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
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

    const result = await completeTransformationV1({
      admin,
      requestId,
      userId: authData.user.id,
      transformationId: parsed.data.transformation_id,
      lineGreenEntry: parsed.data.line_green_entry,
      lineRedEntry: parsed.data.line_red_entry,
      feedback: {
        helpfulness_rating: parsed.data.feedback.helpfulness_rating,
        improvement_reasons: parsed.data.feedback.improvement_reasons,
        improvement_detail: parsed.data.feedback.improvement_detail ?? null,
        most_helpful_area: parsed.data.feedback.most_helpful_area,
      },
      declicsDraft: parsed.data.declics_draft ?? null,
      declicsUser: parsed.data.declics_user ?? null,
    });

    return jsonResponse(req, {
      request_id: requestId,
      transformation_id: result.transformation.id,
      plan_id: result.planId,
      warnings: result.warnings,
    });
  } catch (error) {
    const ctx = getRequestContext(req);
    await logEdgeFunctionError({
      functionName: "complete-transformation-v1",
      error,
      requestId,
      userId: ctx.userId,
      source: "edge",
      metadata: { route: "complete-transformation-v1" },
    });

    if (error instanceof CompleteTransformationV1Error) {
      if (error.status === 400) return badRequest(req, requestId, error.message);
      return jsonResponse(
        req,
        { error: error.message, request_id: requestId },
        { status: error.status },
      );
    }

    return serverError(req, requestId, "Failed to complete transformation");
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
