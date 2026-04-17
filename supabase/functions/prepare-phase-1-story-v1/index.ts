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
  buildPhase1StoryUserPrompt,
  PHASE1_STORY_SYSTEM_PROMPT,
  validatePhase1StoryOutput,
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
  details_answer: z.string().trim().max(3000).optional(),
});

class PreparePhase1StoryError extends Error {
  status: number;

  constructor(status: number, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PreparePhase1StoryError";
    this.status = status;
  }
}

function hasDeepWhyAnswersNewerThanStory(args: {
  storyGeneratedAt: string | null | undefined;
  deepWhyAnswers: Array<{ answered_at: string }>;
}): boolean {
  if (!args.storyGeneratedAt) {
    return args.deepWhyAnswers.length > 0;
  }

  const storyGeneratedAtMs = Date.parse(args.storyGeneratedAt);
  if (!Number.isFinite(storyGeneratedAtMs)) {
    return args.deepWhyAnswers.length > 0;
  }

  return args.deepWhyAnswers.some((item) => {
    const answeredAtMs = Date.parse(item.answered_at);
    return Number.isFinite(answeredAtMs) && answeredAtMs >= storyGeneratedAtMs;
  });
}

export async function preparePhase1Story(args: {
  admin: SupabaseClient;
  userId: string;
  transformationId: string;
  requestId?: string;
  detailsAnswer?: string | null;
}) {
  const context = await loadPhase1GenerationContext({
    admin: args.admin,
    userId: args.userId,
    transformationId: args.transformationId,
  });
  const deepWhyAnswers = context.phase1?.deep_why?.answers ?? [];
  const shouldRefreshFromDeepWhy = hasDeepWhyAnswersNewerThanStory({
    storyGeneratedAt: context.phase1?.story?.generated_at,
    deepWhyAnswers,
  });

  if (
    context.phase1?.story?.status === "generated" &&
    !args.detailsAnswer &&
    !shouldRefreshFromDeepWhy
  ) {
    return {
      phase1: context.phase1,
      story: context.phase1.story,
    };
  }

  const raw = await generateWithGemini(
    PHASE1_STORY_SYSTEM_PROMPT,
    buildPhase1StoryUserPrompt({
      context: {
        transformation_title: context.plan.title || context.transformation.title || "Transformation",
        transformation_summary: context.transformation.user_summary,
        focus_context: buildTransformationFocusMaterial({
          transformation: context.transformation,
        }),
        questionnaire_context: null,
        user_first_name: context.profileFirstName,
        user_age: context.userAge,
        user_gender: context.userGender,
        phase_1_objective: context.plan.phases[0]?.phase_objective ?? null,
        phase_1_heartbeat: context.plan.phases[0]?.heartbeat?.title ?? null,
        plan_levels_count: context.planLevelsCount,
        success_definition: context.plan.strategy.success_definition ?? null,
        main_constraint: context.plan.strategy.main_constraint ?? null,
        inspiration_narrative: context.plan.inspiration_narrative,
        journey_part_number: context.journeyPartNumber,
        journey_total_parts: context.journeyTotalParts,
        journey_continuation_hint: context.journeyContinuationHint,
        previous_completed_transformation: context.previousCompletedTransformation,
      },
      deepWhyAnswers: deepWhyAnswers.map((item) =>
        `${item.question} => ${item.answer}`
      ),
      detailsAnswer: args.detailsAnswer ?? null,
    }),
    0.45,
    true,
    [],
    "auto",
    {
      requestId: args.requestId,
      source: "prepare-phase-1-story-v1",
      userId: args.userId,
      model: getGlobalAiModel("gemini-2.5-flash"),
      maxRetries: 2,
      httpTimeoutMs: 30_000,
    },
  );

  if (typeof raw !== "string") {
    throw new PreparePhase1StoryError(500, "LLM returned tool call instead of JSON");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim());
  } catch (error) {
    throw new PreparePhase1StoryError(500, "LLM returned invalid JSON", { cause: error });
  }

  const validation = validatePhase1StoryOutput(parsed);
  if (!validation.valid || !validation.story) {
    throw new PreparePhase1StoryError(
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
    throw new PreparePhase1StoryError(500, "Failed to build phase 1 context");
  }

  const nextStory = {
    ...validation.story,
    details_answer: args.detailsAnswer ?? null,
    status: validation.story.status === "ready_to_generate" ? "generated" : validation.story.status,
    generated_at: validation.story.status === "ready_to_generate" ? now : null,
  } as const;

  const handoffPayload = mergePhase1Payload({
    handoffPayload: context.transformation.handoff_payload,
    context: phase1Context,
    story: nextStory,
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
    throw new PreparePhase1StoryError(500, `Failed to persist phase 1 story: ${error.message}`, {
      cause: error,
    });
  }

  return {
    phase1: (data as { handoff_payload: Record<string, unknown> }).handoff_payload.phase_1,
    story: nextStory,
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

    const result = await preparePhase1Story({
      admin,
      userId: authData.user.id,
      transformationId: parsed.data.transformation_id,
      requestId,
      detailsAnswer: parsed.data.details_answer ?? null,
    });

    return jsonResponse(req, {
      request_id: requestId,
      transformation_id: parsed.data.transformation_id,
      story: result.story,
      phase_1: result.phase1,
    });
  } catch (error) {
    const ctx = getRequestContext(req);
    await logEdgeFunctionError({
      functionName: "prepare-phase-1-story-v1",
      error,
      requestId,
      userId: ctx.userId,
      source: "edge",
      metadata: { route: "prepare-phase-1-story-v1" },
    });

    if (error instanceof PreparePhase1StoryError) {
      if (error.status === 400) return badRequest(req, requestId, error.message);
      return jsonResponse(req, { error: error.message, request_id: requestId }, { status: error.status });
    }

    return serverError(req, requestId, "Failed to prepare phase 1 story");
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
    throw new PreparePhase1StoryError(500, "Supabase environment variables are not configured");
  }
  return { url, anonKey, serviceRoleKey };
}
