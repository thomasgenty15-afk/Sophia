import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "jsr:@supabase/supabase-js@2";

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
  buildPotionActivationPrompt,
  getPotionDefinition,
  POTION_SYSTEM_PROMPT,
  validatePotionActivationOutput,
  validatePotionAnswers,
} from "../_shared/v2-potions.ts";
import { getRequestContext } from "../_shared/request_context.ts";
import { loadLabScopeContext } from "../_shared/v2-lab-context.ts";
import type {
  LabScopeKind,
  PotionType,
  UserPotionSessionRow,
} from "../_shared/v2-types.ts";

const REQUEST_SCHEMA = z.object({
  transformation_id: z.string().uuid().nullable().optional(),
  scope_kind: z.enum(["transformation", "out_of_plan"]).optional(),
  potion_type: z.enum([
    "rappel",
    "courage",
    "guerison",
    "clarte",
    "amour",
    "apaisement",
  ]),
  answers: z.record(z.string()).default({}),
  free_text: z.string().nullable().optional(),
});

class ActivatePotionError extends Error {
  status: number;

  constructor(status: number, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ActivatePotionError";
    this.status = status;
  }
}

async function activatePotion(args: {
  userId: string;
  transformationId: string | null;
  scopeKind: LabScopeKind;
  potionType: PotionType;
  answers: Record<string, string>;
  freeText: string | null;
  requestId?: string;
}): Promise<UserPotionSessionRow> {
  const env = getSupabaseEnv();
  const admin = createClient(env.url, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const context = await loadLabScopeContext({
    admin,
    userId: args.userId,
    transformationId: args.transformationId,
    scopeKind: args.scopeKind,
  });
  const definition = getPotionDefinition(args.potionType);
  const issues = validatePotionAnswers(definition, args.answers, args.freeText);
  if (issues.length > 0) {
    throw new ActivatePotionError(400, `Invalid potion activation: ${issues.join(", ")}`);
  }

  const raw = await generateWithGemini(
    POTION_SYSTEM_PROMPT,
    buildPotionActivationPrompt({
      context,
      definition,
      answers: args.answers,
      freeText: args.freeText,
    }),
    0.45,
    true,
    [],
    "auto",
    {
      requestId: args.requestId,
      source: "activate-potion-v1",
      userId: args.userId,
      model: getGlobalAiModel("gemini-2.5-flash"),
      maxRetries: 2,
      httpTimeoutMs: 30_000,
    },
  );

  if (typeof raw !== "string") {
    throw new ActivatePotionError(500, "LLM returned tool call instead of JSON");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim());
  } catch (error) {
    throw new ActivatePotionError(500, "LLM returned invalid JSON", { cause: error });
  }

  const validation = validatePotionActivationOutput(parsed);
  if (!validation.valid || !validation.content) {
    throw new ActivatePotionError(
      500,
      `Validation failed: ${validation.issues.join(", ")}`,
    );
  }

  const now = new Date().toISOString();
  const row = {
    user_id: args.userId,
    cycle_id: context.cycle_id,
    scope_kind: context.scope_kind,
    transformation_id: context.transformation_id,
    phase_id: null,
    potion_type: args.potionType,
    source: "manual",
    status: "completed",
    questionnaire_schema: definition.questionnaire,
    questionnaire_answers: args.answers,
    free_text: args.freeText?.trim() || null,
    content: validation.content,
    follow_up_strategy: definition.default_follow_up_strategy,
    metadata: {
      classification_type_key: context.classification?.type_key ?? null,
      potion_title: definition.title,
    },
    generated_at: now,
    last_updated_at: now,
  };

  const { data, error } = await admin
    .from("user_potion_sessions")
    .insert(row)
    .select("*")
    .single();

  if (error) {
    throw new ActivatePotionError(500, `Insert failed: ${error.message}`, { cause: error });
  }

  return data as UserPotionSessionRow;
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

    const authHeader = String(req.headers.get("Authorization") ?? "").trim();
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
      return jsonResponse(req, { error: "Unauthorized", request_id: requestId }, { status: 401 });
    }

    const session = await activatePotion({
      userId: authData.user.id,
      transformationId: parsed.data.transformation_id ?? null,
      scopeKind: parsed.data.scope_kind ?? "transformation",
      potionType: parsed.data.potion_type,
      answers: parsed.data.answers ?? {},
      freeText: parsed.data.free_text ?? null,
      requestId,
    });

    return jsonResponse(req, {
      request_id: requestId,
      transformation_id: parsed.data.transformation_id,
      potion_type: parsed.data.potion_type,
      session,
    });
  } catch (error) {
    const ctx = getRequestContext(req);
    await logEdgeFunctionError({
      functionName: "activate-potion-v1",
      error,
      requestId,
      userId: ctx.userId,
      source: "edge",
      metadata: { route: "activate-potion-v1" },
    });

    if (error instanceof ActivatePotionError) {
      if (error.status === 400) return badRequest(req, requestId, error.message);
      return jsonResponse(req, { error: error.message, request_id: requestId }, { status: error.status });
    }

    return serverError(req, requestId, "Failed to activate potion");
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
    throw new ActivatePotionError(500, "Supabase environment variables are not configured");
  }
  return { url, anonKey, serviceRoleKey };
}
