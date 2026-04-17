import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "jsr:@supabase/supabase-js@2";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { generateWithGemini, getGlobalAiModel } from "../_shared/gemini.ts";
import {
  badRequest,
  jsonResponse,
  parseJsonBody,
  serverError,
  z,
} from "../_shared/http.ts";
import {
  buildPhase1DeepWhyUserPrompt,
  PHASE1_DEEP_WHY_SYSTEM_PROMPT,
  validatePhase1DeepWhyOutput,
} from "../_shared/v2-prompts/phase1.ts";
import { getRequestContext } from "../_shared/request_context.ts";
import {
  buildPhase1Context,
  loadPhase1GenerationContext,
  mergePhase1Payload,
} from "../_shared/v2-phase1.ts";
import { buildTransformationFocusMaterial } from "../_shared/v2-transformation-focus.ts";

const REQUEST_SCHEMA = z.object({
  transformation_id: z.string().uuid(),
});

class PreparePhase1DeepWhyError extends Error {
  status: number;

  constructor(status: number, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PreparePhase1DeepWhyError";
    this.status = status;
  }
}

function buildQuestionnaireContext(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  try {
    const serialized = JSON.stringify(value, null, 2)?.trim();
    if (!serialized) return null;
    return serialized.length <= 4_000
      ? serialized
      : `${serialized.slice(0, 3_999).trim()}…`;
  } catch {
    return null;
  }
}

export async function preparePhase1DeepWhy(args: {
  admin: SupabaseClient;
  userId: string;
  transformationId: string;
  requestId?: string;
}) {
  const context = await loadPhase1GenerationContext({
    admin: args.admin,
    userId: args.userId,
    transformationId: args.transformationId,
  });

  if (context.phase1?.deep_why?.questions?.length) {
    return {
      phase1: context.phase1,
      questions: context.phase1.deep_why.questions,
    };
  }

  const raw = await generateWithGemini(
    PHASE1_DEEP_WHY_SYSTEM_PROMPT,
    buildPhase1DeepWhyUserPrompt({
      transformation_title: context.plan.title || context.transformation.title || "Transformation",
      transformation_summary: context.transformation.user_summary,
      focus_context: buildTransformationFocusMaterial({
        transformation: context.transformation,
      }),
      questionnaire_context: buildQuestionnaireContext(
        context.transformation.questionnaire_answers,
      ),
      user_first_name: context.profileFirstName,
      user_age: context.userAge,
      user_gender: context.userGender,
      phase_1_objective: context.plan.phases[0]?.phase_objective ?? null,
      phase_1_heartbeat: context.plan.phases[0]?.heartbeat?.title ?? null,
      success_definition: context.plan.strategy.success_definition ?? null,
      main_constraint: context.plan.strategy.main_constraint ?? null,
      inspiration_narrative: context.plan.inspiration_narrative,
    }),
    0.4,
    true,
    [],
    "auto",
    {
      requestId: args.requestId,
      source: "prepare-phase-1-deep-why-v1",
      userId: args.userId,
      model: getGlobalAiModel("gemini-2.5-flash"),
      maxRetries: 2,
      httpTimeoutMs: 30_000,
    },
  );

  if (typeof raw !== "string") {
    throw new PreparePhase1DeepWhyError(500, "LLM returned tool call instead of JSON");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim());
  } catch (error) {
    throw new PreparePhase1DeepWhyError(500, "LLM returned invalid JSON", { cause: error });
  }

  const validation = validatePhase1DeepWhyOutput(parsed);
  if (!validation.valid) {
    throw new PreparePhase1DeepWhyError(
      500,
      `Validation failed: ${validation.issues.join(", ")}`,
    );
  }

  const now = new Date().toISOString();
  const phase1Context = context.phase1?.context ?? buildPhase1Context({
    cycle: context.cycle,
    transformation: context.transformation,
    planRow: context.planRow,
    now,
  });

  if (!phase1Context) {
    throw new PreparePhase1DeepWhyError(500, "Failed to build phase 1 context");
  }

  const handoffPayload = mergePhase1Payload({
    handoffPayload: context.transformation.handoff_payload,
    context: phase1Context,
    deepWhy: {
      prepared_at: now,
      questions: validation.questions,
      answers: context.phase1?.deep_why?.answers ?? [],
    },
    runtime: {
      deep_why_answered: false,
    },
    now,
  });

  const { data, error } = await args.admin
    .from("user_transformations")
    .update({
      handoff_payload: handoffPayload,
      updated_at: now,
    })
    .eq("id", args.transformationId)
    .select("handoff_payload")
    .single();

  if (error) {
    throw new PreparePhase1DeepWhyError(500, `Failed to persist phase 1 deep why: ${error.message}`, {
      cause: error,
    });
  }

  return {
    phase1: (data as { handoff_payload: Record<string, unknown> }).handoff_payload.phase_1,
    questions: validation.questions,
  };
}

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return handleCorsOptions(req);

  const corsError = enforceCors(req);
  if (corsError) return corsError;

  const requestId = getRequestContext(req).requestId;

  try {
    if (req.method !== "POST") {
      return jsonResponse(req, { error: "Method Not Allowed", request_id: requestId }, { status: 405 });
    }

    const parsed = await parseJsonBody(req, REQUEST_SCHEMA, requestId);
    if (!parsed.ok) return parsed.response;

    const authHeader = String(req.headers.get("Authorization") ?? "").trim();
    if (!authHeader) {
      return jsonResponse(req, { error: "Missing Authorization header", request_id: requestId }, { status: 401 });
    }

    const env = getSupabaseEnv();
    const userClient = createClient(env.url, env.anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData?.user) {
      return jsonResponse(req, { error: "Unauthorized", request_id: requestId }, { status: 401 });
    }

    const admin = createClient(env.url, env.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const result = await preparePhase1DeepWhy({
      admin,
      userId: authData.user.id,
      transformationId: parsed.data.transformation_id,
      requestId,
    });

    return jsonResponse(req, {
      request_id: requestId,
      transformation_id: parsed.data.transformation_id,
      questions: result.questions,
      phase_1: result.phase1,
    });
  } catch (error) {
    const ctx = getRequestContext(req);
    await logEdgeFunctionError({
      functionName: "prepare-phase-1-deep-why-v1",
      error,
      requestId,
      userId: ctx.userId,
      source: "edge",
      metadata: { route: "prepare-phase-1-deep-why-v1" },
    });

    if (error instanceof PreparePhase1DeepWhyError) {
      if (error.status === 400) return badRequest(req, requestId, error.message);
      return jsonResponse(req, { error: error.message, request_id: requestId }, { status: error.status });
    }

    return serverError(req, requestId, "Failed to prepare phase 1 deep why");
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}

function getSupabaseEnv(): {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
} {
  const url = String(Deno.env.get("SUPABASE_URL") ?? "").trim();
  const anonKey = String(Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
  const serviceRoleKey = String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!url || !anonKey || !serviceRoleKey) {
    throw new PreparePhase1DeepWhyError(500, "Supabase environment variables are not configured");
  }
  return { url, anonKey, serviceRoleKey };
}
