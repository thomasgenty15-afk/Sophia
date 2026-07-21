import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "jsr:@supabase/supabase-js@2";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import {
  computeCurrentWeekOrder,
  firstAssignedWeekForTempId,
  firstAssignedWeekOrderByTempId,
  isWeekUnlocked,
  readGeneratedTempId,
} from "../_shared/v2-week-activation.ts";
import {
  isItemInActivatablePhase,
  resolveCurrentPhaseRuntimeContext,
} from "../_shared/v2-runtime.ts";
import type { UserPlanItemRow } from "../_shared/v2-types.ts";
import {
  jsonResponse,
  parseJsonBody,
  serverError,
  z,
} from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { getRequestContext } from "../_shared/request_context.ts";

const REQUEST_SCHEMA = z.object({
  plan_item_id: z.string().uuid(),
});

class ActivatePlanItemV2Error extends Error {
  status: number;
  details?: Record<string, unknown>;

  constructor(
    status: number,
    message: string,
    details?: Record<string, unknown>,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ActivatePlanItemV2Error";
    this.status = status;
    this.details = details;
  }
}

function getSupabaseEnv() {
  const url = String(Deno.env.get("SUPABASE_URL") ?? "").trim();
  const anonKey = String(Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
  const serviceRoleKey = String(
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  ).trim();
  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error("Missing Supabase environment for activate-plan-item-v2");
  }
  return { url, anonKey, serviceRoleKey };
}

export async function activatePlanItemV2(args: {
  admin: SupabaseClient;
  userId: string;
  planItemId: string;
  requestId: string;
}): Promise<UserPlanItemRow> {
  const { data, error } = await args.admin
    .from("user_plan_items")
    .select("*")
    .eq("id", args.planItemId)
    .eq("user_id", args.userId)
    .maybeSingle();
  if (error) {
    throw new ActivatePlanItemV2Error(500, "Failed to load V2 plan item", undefined, {
      cause: error,
    });
  }
  if (!data) {
    throw new ActivatePlanItemV2Error(404, "Plan item not found");
  }

  const item = data as UserPlanItemRow;
  if (item.status !== "pending") {
    throw new ActivatePlanItemV2Error(
      409,
      "Plan item is not pending",
      { current_status: item.status },
    );
  }

  const { data: planRow, error: planError } = await args.admin
    .from("user_plans_v2")
    .select("content")
    .eq("id", item.plan_id)
    .maybeSingle();
  if (planError) {
    throw new ActivatePlanItemV2Error(500, "Failed to load plan content", undefined, {
      cause: planError,
    });
  }
  const planContent = planRow?.content ?? null;

  // P0-6: Reject activation of items in future phases
  if (item.phase_id && planContent) {
    const { data: siblings, error: siblingsError } = await args.admin
      .from("user_plan_items")
      .select("id, phase_id, dimension, status, current_habit_state")
      .eq("plan_id", item.plan_id)
      .eq("user_id", args.userId);
    if (!siblingsError && siblings) {
      const phaseCtx = resolveCurrentPhaseRuntimeContext(
        { content: planContent as Record<string, unknown> },
        siblings as UserPlanItemRow[],
      );
      if (phaseCtx && !isItemInActivatablePhase(item, phaseCtx)) {
        throw new ActivatePlanItemV2Error(
          409,
          "Cet élément appartient à un niveau de plan futur. Complète d'abord le niveau de plan actuel.",
          { phase_id: item.phase_id, current_phase_id: phaseCtx.current_phase_id },
        );
      }
    }
  }

  // Déblocage par semaine: un item devient activable dès que sa première
  // semaine assignée est commencée. Aucune condition inter-items n'est
  // évaluée; les activation_condition héritées sont ignorées.
  const currentWeekOrder = computeCurrentWeekOrder(planContent);
  const firstAssignedWeekOrder = firstAssignedWeekForTempId(
    readGeneratedTempId(item),
    firstAssignedWeekOrderByTempId(planContent, item.phase_id ?? null),
  );
  if (!isWeekUnlocked({ firstAssignedWeekOrder, currentWeekOrder })) {
    throw new ActivatePlanItemV2Error(
      409,
      `Cette action arrive en semaine ${firstAssignedWeekOrder} du niveau. Elle se débloquera automatiquement au début de sa semaine.`,
      {
        first_assigned_week_order: firstAssignedWeekOrder,
        current_week_order: currentWeekOrder,
      },
    );
  }

  const now = new Date().toISOString();
  const patch = {
    status: "active",
    activated_at: now,
    updated_at: now,
    current_habit_state: item.dimension === "habits"
      ? "active_building"
      : item.current_habit_state,
  } satisfies Partial<UserPlanItemRow>;

  const { data: updated, error: updateError } = await args.admin
    .from("user_plan_items")
    .update(patch as any)
    .eq("id", item.id)
    .eq("user_id", args.userId)
    .select("*")
    .single();
  if (updateError) {
    throw new ActivatePlanItemV2Error(500, "Failed to activate V2 plan item", undefined, {
      cause: updateError,
    });
  }

  return updated as UserPlanItemRow;
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

    const item = await activatePlanItemV2({
      admin,
      userId: authData.user.id,
      planItemId: parsedBody.data.plan_item_id,
      requestId,
    });

    return jsonResponse(req, {
      request_id: requestId,
      plan_item: item,
    });
  } catch (error) {
    const ctx = getRequestContext(req);
    await logEdgeFunctionError({
      functionName: "activate-plan-item-v2",
      error,
      requestId,
      userId: ctx.userId,
      source: "edge",
      metadata: { route: "activate-plan-item-v2" },
    });

    if (error instanceof ActivatePlanItemV2Error) {
      return jsonResponse(
        req,
        {
          error: error.message,
          details: error.details ?? null,
          request_id: requestId,
        },
        { status: error.status },
      );
    }

    return serverError(req, requestId, "Failed to activate V2 plan item");
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
