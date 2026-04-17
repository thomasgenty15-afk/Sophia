import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "jsr:@supabase/supabase-js@2";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import {
  buildLevelReviewSchema,
  buildLevelReviewSummary,
  buildNextLevelTransition,
  isLevelTransitionReady,
  normalizeLevelReviewAnswers,
} from "../_shared/v2-level-completion.ts";
import { tryAdvancePhaseItems } from "../_shared/v2-runtime.ts";
import { logV2Event, V2_EVENT_TYPES } from "../_shared/v2-events.ts";
import {
  badRequest,
  jsonResponse,
  parseJsonBody,
  serverError,
  z,
} from "../_shared/http.ts";
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

function getSupabaseEnv() {
  const url = String(Deno.env.get("SUPABASE_URL") ?? "").trim();
  const anonKey = String(Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
  const serviceRoleKey = String(
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  ).trim();
  if (!url || !anonKey || !serviceRoleKey) {
    throw new CompleteLevelV1Error(500, "Supabase environment is not configured");
  }
  return { url, anonKey, serviceRoleKey };
}

function parsePlanContent(content: Record<string, unknown> | null): PlanContentV3 {
  if (!content || content.version !== 3 || !Array.isArray(content.phases)) {
    throw new CompleteLevelV1Error(409, "Le plan actif n'est pas un plan V3 compatible.");
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
  return (data ?? [])
    .map((row) => row.payload)
    .filter((value): value is Record<string, unknown> =>
      Boolean(value) && typeof value === "object" && !Array.isArray(value)
    );
}

export async function completeLevelV1(args: {
  admin: SupabaseClient;
  requestId: string;
  userId: string;
  transformationId: string;
  planId: string | null;
  answers: Record<string, unknown>;
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
  const transformation = await loadTransformation(args.admin, args.transformationId);
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
  const planContent = parsePlanContent(plan.content as Record<string, unknown> | null);
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
    throw new CompleteLevelV1Error(409, "Le niveau courant du plan est incohérent.");
  }

  const planItems = await loadPlanItems(args.admin, plan.id);
  if (!isLevelTransitionReady(currentPhase.phase_id, planItems)) {
    throw new CompleteLevelV1Error(
      409,
      "Ce niveau n'est pas encore prêt pour son bilan de fin.",
    );
  }

  const schema = buildLevelReviewSchema({
    currentLevel: currentLevelRuntime,
    items: planItems.filter((item) => item.phase_id === currentPhase.phase_id),
    weeks: currentLevelRuntime.weeks,
  });
  const answers = normalizeLevelReviewAnswers(schema, args.answers);
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

  const reviewId = crypto.randomUUID();
  const generationEventId = crypto.randomUUID();

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
      created_at: now,
    } as never);

  if (reviewInsertError) {
    throw new CompleteLevelV1Error(500, "Failed to persist level review", {
      cause: reviewInsertError,
    });
  }

  const nextPlanContent: PlanContentV3 = {
    ...planContent,
    plan_blueprint: transition.nextBlueprint,
    current_level_runtime: transition.nextRuntime,
  };

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
      to_phase_id: transition.nextRuntime?.phase_id ?? null,
      decision: transition.preview.decision,
      decision_reason: transition.preview.reason,
      generation_input: {
        review_summary: summary,
        weekly_signals: weeklySignals,
      },
      previous_current_level_runtime: currentLevelRuntime as unknown as Record<string, unknown>,
      next_current_level_runtime: transition.nextRuntime as unknown as Record<string, unknown> | null,
      previous_plan_blueprint:
        planContent.plan_blueprint as unknown as Record<string, unknown> | null,
      next_plan_blueprint:
        transition.nextBlueprint as unknown as Record<string, unknown>,
      created_at: now,
    } as never);

  if (generationInsertError) {
    throw new CompleteLevelV1Error(500, "Failed to persist level generation event", {
      cause: generationInsertError,
    });
  }

  const planStatus = transition.nextRuntime ? "active" : "completed";
  const { error: planUpdateError } = await args.admin
    .from("user_plans_v2")
    .update({
      content: nextPlanContent as unknown as Record<string, unknown>,
      status: planStatus,
      completed_at: transition.nextRuntime ? null : (plan.completed_at ?? now),
      updated_at: now,
    })
    .eq("id", plan.id);

  if (planUpdateError) {
    throw new CompleteLevelV1Error(500, "Failed to update plan after level review", {
      cause: planUpdateError,
    });
  }

  if (transition.nextRuntime) {
    await tryAdvancePhaseItems(args.admin, plan.id, args.userId);
  }

  try {
    await logV2Event(args.admin, V2_EVENT_TYPES.PHASE_TRANSITION, {
      user_id: args.userId,
      cycle_id: cycle.id,
      transformation_id: transformation.id,
      plan_id: plan.id,
      reason: transition.nextRuntime ? "level_review_completed" : "final_level_completed",
      metadata: {
        review_id: reviewId,
        generation_event_id: generationEventId,
        from_phase_id: currentPhase.phase_id,
        to_phase_id: transition.nextRuntime?.phase_id ?? null,
        decision: transition.preview.decision,
      },
    });
  } catch {
    // Non-blocking audit logging.
  }

  const summaryText = transition.nextRuntime
    ? `Niveau suivant prêt: ${transition.nextRuntime.title}. ${transition.preview.reason}`
    : "Dernier niveau validé. Le plan est maintenant terminé.";

  return {
    reviewId,
    generationEventId,
    decision: transition.preview.decision,
    decisionReason: transition.preview.reason,
    summary: summaryText,
    nextLevel: transition.nextRuntime
      ? {
          phase_id: transition.nextRuntime.phase_id,
          level_order: transition.nextRuntime.level_order,
          title: transition.nextRuntime.title,
          duration_weeks: transition.nextRuntime.duration_weeks,
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
      req.headers.get("Authorization") ?? req.headers.get("authorization") ?? "",
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
    await logEdgeFunctionError({
      functionName: "complete-level-v1",
      error,
      requestId,
      userId: ctx.userId,
      source: "edge",
      metadata: { route: "complete-level-v1" },
    });

    if (error instanceof CompleteLevelV1Error) {
      if (error.status === 400) return badRequest(req, requestId, error.message);
      return jsonResponse(
        req,
        { error: error.message, request_id: requestId },
        { status: error.status },
      );
    }

    return serverError(req, requestId, "Failed to complete current level");
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
