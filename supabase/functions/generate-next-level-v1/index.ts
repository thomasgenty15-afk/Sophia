import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "jsr:@supabase/supabase-js@2";

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { enforceRateLimit, RATE_PRESETS } from "../_shared/rate-limit.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import {
  badRequest,
  jsonResponse,
  parseJsonBody,
  serverError,
  z,
} from "../_shared/http.ts";
import { getRequestContext } from "../_shared/request_context.ts";
import { generateWithGemini } from "../_shared/gemini.ts";
import {
  buildNextLevelGenerationUserPrompt,
  NEXT_LEVEL_GENERATION_SYSTEM_PROMPT,
} from "../_shared/v2-prompts/next-level-generation.ts";
import {
  castNextLevelGenerationPatch,
  type NextLevelGenerationPatch,
  type NextLevelGenerationPromptContext,
  type NextLevelGenerationValidationContext,
  validateNextLevelGenerationPatch,
} from "../_shared/v2-next-level-generation.ts";

const REQUEST_SCHEMA = z.object({
  context: z.record(z.string(), z.unknown()),
  validation_context: z.record(z.string(), z.unknown()),
});

export class GenerateNextLevelV1Error extends Error {
  status: number;

  constructor(status: number, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "GenerateNextLevelV1Error";
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
    throw new GenerateNextLevelV1Error(
      500,
      "Supabase environment is not configured",
    );
  }
  return { url, anonKey, serviceRoleKey };
}

function parsePatchJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new GenerateNextLevelV1Error(500, "LLM returned invalid JSON", {
      cause: error,
    });
  }
}

function validationIssuesFromError(error: unknown): string[] {
  if (!(error instanceof GenerateNextLevelV1Error)) return [];
  const prefix = "Generated next level failed validation:";
  if (error.message === "LLM returned invalid JSON") {
    return [
      "La sortie précédente n'était pas un JSON valide.",
      "Retourne un objet JSON complet sans markdown, sans texte hors JSON.",
    ];
  }
  if (!error.message.startsWith(prefix)) return [];
  return error.message
    .slice(prefix.length)
    .split(";")
    .map((issue) => issue.trim())
    .filter(Boolean);
}

async function generateNextLevelPatchWithLlm(args: {
  context: NextLevelGenerationPromptContext;
  validationContext: NextLevelGenerationValidationContext;
  requestId: string;
  userId: string;
}): Promise<NextLevelGenerationPatch> {
  let validationFeedback: string[] | null = null;

  const maxStructuredAttempts = 3;
  for (let attempt = 1; attempt <= maxStructuredAttempts; attempt += 1) {
    const raw = await generateWithGemini(
      NEXT_LEVEL_GENERATION_SYSTEM_PROMPT,
      buildNextLevelGenerationUserPrompt({
        ...args.context,
        systemValidationFeedback: validationFeedback,
      }),
      0.25,
      true,
      [],
      "auto",
      {
        requestId: `${args.requestId}:generate-next-level-v1`,
        source: "generate-next-level-v1",
        model: "gemini-3.1-pro-preview",
        forceInitialModel: true,
        disableFallbackChain: true,
        userId: args.userId,
        maxRetries: 3,
        httpTimeoutMs: 120_000,
      },
    );

    if (typeof raw !== "string") {
      throw new GenerateNextLevelV1Error(
        500,
        "LLM returned a tool call instead of a JSON next-level patch",
      );
    }

    try {
      const parsed = parsePatchJson(raw);
      const validation = validateNextLevelGenerationPatch(
        parsed,
        args.validationContext,
      );
      if (!validation.valid) {
        throw new GenerateNextLevelV1Error(
          500,
          `Generated next level failed validation: ${
            validation.issues.join("; ")
          }`,
        );
      }
      return castNextLevelGenerationPatch(parsed);
    } catch (error) {
      const shouldRetry = attempt < maxStructuredAttempts &&
        error instanceof GenerateNextLevelV1Error &&
        (
          error.message === "LLM returned invalid JSON" ||
          error.message.startsWith("Generated next level failed validation:")
        );
      if (!shouldRetry) throw error;

      validationFeedback = validationIssuesFromError(error);
      console.warn("[generate-next-level-v1] retrying after invalid output", {
        request_id: args.requestId,
        issues: validationFeedback,
      });
    }
  }

  throw new GenerateNextLevelV1Error(
    500,
    "Next-level generation retry loop ended unexpectedly",
  );
}

export async function generateNextLevelForPlan(args: {
  requestId: string;
  userId: string;
  context: NextLevelGenerationPromptContext;
  validationContext: NextLevelGenerationValidationContext;
}): Promise<NextLevelGenerationPatch> {
  console.info("[generate-next-level-v1][started]", {
    request_id: args.requestId,
    from_level_order: args.validationContext.currentLevelOrder,
    target_level_order: args.validationContext.currentLevelOrder + 1,
    target_phase_id: args.validationContext.expectedNextBlueprint.phase_id,
  });

  const patch = await generateNextLevelPatchWithLlm({
    context: args.context,
    validationContext: args.validationContext,
    requestId: args.requestId,
    userId: args.userId,
  });

  console.info("[generate-next-level-v1][succeeded]", {
    request_id: args.requestId,
    decision: patch.decision,
    target_level_order: patch.next_level.level_order,
    future_blueprint_count: patch.future_blueprint_levels.length,
  });
  return patch;
}

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return handleCorsOptions(req);
  const corsError = enforceCors(req);
  if (corsError) return corsError;

  const requestId = getRequestContext(req).requestId;
  try {
    if (req.method !== "POST") {
      return jsonResponse(req, {
        error: "Method Not Allowed",
        request_id: requestId,
      }, { status: 405 });
    }

    const parsedBody = await parseJsonBody(req, REQUEST_SCHEMA, requestId);
    if (!parsedBody.ok) return parsedBody.response;

    const env = getSupabaseEnv();
    const authHeader = String(
      req.headers.get("Authorization") ?? req.headers.get("authorization") ??
        "",
    ).trim();
    if (!authHeader) {
      return jsonResponse(req, {
        error: "Missing Authorization header",
        request_id: requestId,
      }, { status: 401 });
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

    const rateLimited = await enforceRateLimit(req, requestId, {
      key: `generate-next-level-v1:${authData.user.id}`,
      windows: RATE_PRESETS.llmStandard,
    });
    if (rateLimited) return rateLimited;

    const patch = await generateNextLevelForPlan({
      requestId,
      userId: authData.user.id,
      context: parsedBody.data
        .context as unknown as NextLevelGenerationPromptContext,
      validationContext: parsedBody.data
        .validation_context as unknown as NextLevelGenerationValidationContext,
    });

    return jsonResponse(req, { request_id: requestId, patch });
  } catch (error) {
    await logEdgeFunctionError({
      functionName: "generate-next-level-v1",
      error,
      requestId,
      source: "edge",
      metadata: { route: "generate-next-level-v1" },
    });

    if (error instanceof GenerateNextLevelV1Error) {
      if (error.status === 400) {
        return badRequest(req, requestId, error.message);
      }
      return jsonResponse(
        req,
        { error: error.message, request_id: requestId },
        { status: error.status },
      );
    }

    return serverError(req, requestId, "Failed to generate next level");
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
