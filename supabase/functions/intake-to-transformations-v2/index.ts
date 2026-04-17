import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "jsr:@supabase/supabase-js@2";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import {
  badRequest,
  jsonResponse,
  parseJsonBody,
  serverError,
  z,
} from "../_shared/http.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { getRequestContext } from "../_shared/request_context.ts";
import type { UserTransformationRow } from "../_shared/v2-types.ts";
import {
  materializeCycleTransformationsFromIntake,
  previewTransformationsFromIntake,
} from "../_shared/v2-intake-core.ts";
import { IntakeStructuringError } from "../_shared/v2-intake-structuring.ts";
import { TransformationMaterializationError } from "../_shared/v2-transformation-materialization.ts";

const REQUEST_SCHEMA = z.object({
  raw_intake_text: z.string().min(1),
  cycle_id: z.string().uuid().optional(),
});

function serializeTransformation(
  transformation: UserTransformationRow,
) {
  return {
    id: transformation.id,
    cycle_id: transformation.cycle_id,
    priority_order: transformation.priority_order,
    status: transformation.status,
    title: transformation.title,
    internal_summary: transformation.internal_summary,
    user_summary: transformation.user_summary,
    source_group_index:
      (transformation.handoff_payload?.onboarding_v2 as { source_group_index?: unknown } | undefined)
        ?.source_group_index ?? null,
    questionnaire_context:
      (transformation.handoff_payload?.onboarding_v2 as { questionnaire_context?: unknown } | undefined)
        ?.questionnaire_context ?? [],
    recommended_order:
      (transformation.handoff_payload?.onboarding_v2 as { recommended_order?: unknown } | undefined)
        ?.recommended_order ?? transformation.priority_order,
    recommended_progress_indicator:
      (transformation.handoff_payload?.onboarding_v2 as { recommended_progress_indicator?: unknown } | undefined)
        ?.recommended_progress_indicator ?? null,
    ordering_rationale:
      (transformation.handoff_payload?.onboarding_v2 as { ordering_rationale?: unknown } | undefined)
        ?.ordering_rationale ?? null,
  };
}

function getSupabaseEnv() {
  const url = String(Deno.env.get("SUPABASE_URL") ?? "").trim();
  const anonKey = String(Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
  const serviceRoleKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();

  if (!url || !anonKey || !serviceRoleKey) {
    throw new Error("Server misconfigured");
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

    const rawIntakeText = String(parsedBody.data.raw_intake_text ?? "").trim();
    if (!rawIntakeText) {
      return badRequest(req, requestId, "raw_intake_text is required");
    }

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

    const result = await materializeCycleTransformationsFromIntake({
      admin,
      requestId,
      userId: authData.user.id,
      rawIntakeText,
      cycleId: parsedBody.data.cycle_id ?? null,
    });

    if (result.needsClarification) {
      console.log(JSON.stringify({
        tag: "before_http_response",
        stage: "intake_to_transformations",
        request_id: requestId,
        response_kind: "clarification",
        cycle_id: result.cycle.id,
        at: new Date().toISOString(),
      }));
      return jsonResponse(req, {
        request_id: requestId,
        cycle_id: result.cycle.id,
        status: result.cycle.status,
        needs_clarification: true,
        clarification_prompt: result.clarificationPrompt,
        transformations: [],
        event_warnings: result.eventWarnings,
      });
    }

    console.log(JSON.stringify({
      tag: "before_http_response",
      stage: "intake_to_transformations",
      request_id: requestId,
      response_kind: "transformations",
      cycle_id: result.cycle.id,
      transformations_count: result.transformations.length,
      at: new Date().toISOString(),
    }));
    return jsonResponse(req, {
      request_id: requestId,
      cycle_id: result.cycle.id,
      status: result.cycle.status,
      needs_clarification: false,
      clarification_prompt: null,
      transformations: result.transformations.map(serializeTransformation),
      event_warnings: result.eventWarnings,
    });
  } catch (error) {
    console.error("[intake-to-transformations-v2] request failed", {
      request_id: requestId,
      error_name: error instanceof Error ? error.name : typeof error,
      error_message: error instanceof Error ? error.message : String(error),
      error_stack: error instanceof Error ? error.stack : null,
    });

    await logEdgeFunctionError({
      functionName: "intake-to-transformations-v2",
      error,
      requestId,
      userId: getRequestContext(req).userId,
      source: "edge",
      metadata: { route: "intake-to-transformations-v2" },
    });

    if (
      error instanceof IntakeStructuringError ||
      error instanceof TransformationMaterializationError
    ) {
      return jsonResponse(
        req,
        { error: error.message, request_id: requestId },
        { status: error.status >= 400 && error.status < 600 ? error.status : 500 },
      );
    }

    return serverError(req, requestId, "Failed to structure intake into transformations");
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}

export async function intakeToTransformationsDraft(params: {
  requestId: string;
  userId?: string | null;
  rawIntakeText: string;
}) {
  return previewTransformationsFromIntake(params);
}
