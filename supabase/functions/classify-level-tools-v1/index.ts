import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "jsr:@supabase/supabase-js@2";

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
import {
  classifyAndPersistLevelToolRecommendations,
  LevelToolRecommendationsV1Error,
  loadLevelToolRecommendationPlanContext,
} from "../_shared/level-tool-recommendations-v1.ts";

const REQUEST_SCHEMA = z.object({
  transformation_id: z.string().uuid(),
});

function getSupabaseEnv() {
  const url = String(Deno.env.get("SUPABASE_URL") ?? "").trim();
  const anonKey = String(Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
  const serviceRoleKey = String(
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  ).trim();

  if (!url || !anonKey || !serviceRoleKey) {
    throw new LevelToolRecommendationsV1Error(
      500,
      "Supabase environment variables are not configured",
    );
  }

  return { url, anonKey, serviceRoleKey };
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

    console.info("[classify-level-tools-v1][request]", {
      request_id: requestId,
      user_id: authData.user.id,
      transformation_id: parsedBody.data.transformation_id,
    });

    const admin = createClient(env.url, env.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const context = await loadLevelToolRecommendationPlanContext({
      admin,
      userId: authData.user.id,
      transformationId: parsedBody.data.transformation_id,
    });
    const result = await classifyAndPersistLevelToolRecommendations({
      admin,
      requestId,
      userId: authData.user.id,
      cycle: context.cycle,
      transformation: context.transformation,
      planRow: context.planRow,
      plan: context.plan,
    });

    console.info("[classify-level-tools-v1][response_ready]", {
      request_id: requestId,
      user_id: authData.user.id,
      transformation_id: context.transformation.id,
      plan_id: context.planRow.id,
      plan_version: context.planRow.version,
      recommendations_count: result.recommendations.length,
      level_count: result.state.levels.length,
    });

    return jsonResponse(req, {
      request_id: requestId,
      transformation_id: context.transformation.id,
      plan_id: context.planRow.id,
      plan_version: context.planRow.version,
      recommendations_count: result.recommendations.length,
      state: result.state,
    });
  } catch (error) {
    const ctx = getRequestContext(req);
    await logEdgeFunctionError({
      functionName: "classify-level-tools-v1",
      error,
      requestId,
      userId: ctx.userId,
      source: "edge",
      metadata: { route: "classify-level-tools-v1" },
    });

    if (error instanceof LevelToolRecommendationsV1Error) {
      if (error.status === 400) {
        return badRequest(req, requestId, error.message);
      }
      return jsonResponse(
        req,
        { error: error.message, request_id: requestId },
        { status: error.status },
      );
    }

    return serverError(req, requestId, "Failed to classify level tools");
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
