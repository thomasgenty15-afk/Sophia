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
  buildLabSurfaceUserPrompt,
  INSPIRATION_SYSTEM_PROMPT,
  validateInspirationOutput,
} from "../_shared/v2-prompts/lab-surfaces.ts";
import { getRequestContext } from "../_shared/request_context.ts";
import { loadLabScopeContext } from "../_shared/v2-lab-context.ts";
import type { LabScopeKind, UserInspirationItemRow } from "../_shared/v2-types.ts";

const REQUEST_SCHEMA = z.object({
  transformation_id: z.string().uuid().optional(),
  scope_kind: z.enum(["transformation", "out_of_plan"]).optional(),
});

class GenerateInspirationError extends Error {
  status: number;

  constructor(status: number, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "GenerateInspirationError";
    this.status = status;
  }
}

export async function generateInspirationsForTransformation(args: {
  admin: SupabaseClient;
  userId: string;
  transformationId?: string | null;
  scopeKind?: LabScopeKind;
  requestId?: string;
}): Promise<{ items: UserInspirationItemRow[] }> {
  const scopeKind = args.scopeKind ?? "transformation";
  const context = await loadLabScopeContext({
    admin: args.admin,
    userId: args.userId,
    transformationId: args.transformationId,
    scopeKind,
  });

  let existingQuery = args.admin
    .from("user_inspiration_items")
    .select("*")
    .eq("user_id", args.userId)
    .eq("cycle_id", context.cycle_id)
    .eq("scope_kind", scopeKind)
    .in("status", ["suggested", "active"]);
  existingQuery = scopeKind === "transformation"
    ? existingQuery.eq("transformation_id", String(args.transformationId))
    : existingQuery.is("transformation_id", null);
  const { data: existing, error: existingError } = await existingQuery
    .order("generated_at", { ascending: false });

  if (existingError) {
    throw new GenerateInspirationError(500, `Load failed: ${existingError.message}`, {
      cause: existingError,
    });
  }

  if ((existing ?? []).length > 0) {
    return { items: existing as UserInspirationItemRow[] };
  }

  const raw = await generateWithGemini(
    INSPIRATION_SYSTEM_PROMPT,
    buildLabSurfaceUserPrompt(context),
    0.45,
    true,
    [],
    "auto",
    {
      requestId: args.requestId,
      source: "generate-inspiration-v1",
      userId: args.userId,
      model: getGlobalAiModel("gemini-2.5-flash"),
      maxRetries: 2,
      httpTimeoutMs: 30_000,
    },
  );

  if (typeof raw !== "string") {
    throw new GenerateInspirationError(500, "LLM returned tool call instead of JSON");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim());
  } catch (error) {
    throw new GenerateInspirationError(500, "LLM returned invalid JSON", { cause: error });
  }

  const validation = validateInspirationOutput(parsed);
  if (!validation.valid) {
    throw new GenerateInspirationError(
      500,
      `Validation failed: ${validation.issues.join(", ")}`,
    );
  }

  const now = new Date().toISOString();
  const rows = validation.items.map((item) => ({
    user_id: args.userId,
    cycle_id: context.cycle_id,
    scope_kind: scopeKind,
    transformation_id: context.transformation_id,
    phase_id: null,
    source: context.classification ? "prefill_classification" : "system",
    status: "suggested",
    inspiration_type: item.inspiration_type,
    angle: item.angle,
    title: item.title,
    body: item.body,
    cta_label: item.cta_label,
    cta_payload: item.cta_payload,
    tags: item.tags,
    effort_level: item.effort_level,
    context_window: item.context_window,
    metadata: {
      classification_type_key: context.classification?.type_key ?? null,
    },
    generated_at: now,
    last_updated_at: now,
  }));

  const { data, error } = await args.admin
    .from("user_inspiration_items")
    .insert(rows)
    .select("*");

  if (error) {
    throw new GenerateInspirationError(500, `Insert failed: ${error.message}`, {
      cause: error,
    });
  }

  return { items: (data ?? []) as UserInspirationItemRow[] };
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

    const scopeKind = parsed.data.scope_kind ?? "transformation";
    if (scopeKind === "transformation" && !parsed.data.transformation_id) {
      throw new GenerateInspirationError(400, "transformation_id is required");
    }

    const result = await generateInspirationsForTransformation({
      admin,
      userId: authData.user.id,
      transformationId: parsed.data.transformation_id,
      scopeKind,
      requestId,
    });

    return jsonResponse(req, {
      request_id: requestId,
      transformation_id: parsed.data.transformation_id,
      scope_kind: scopeKind,
      items: result.items,
    });
  } catch (error) {
    const ctx = getRequestContext(req);
    await logEdgeFunctionError({
      functionName: "generate-inspiration-v1",
      error,
      requestId,
      userId: ctx.userId,
      source: "edge",
      metadata: { route: "generate-inspiration-v1" },
    });

    if (error instanceof GenerateInspirationError) {
      if (error.status === 400) return badRequest(req, requestId, error.message);
      return jsonResponse(req, { error: error.message, request_id: requestId }, { status: error.status });
    }

    return serverError(req, requestId, "Failed to generate inspirations");
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
    throw new GenerateInspirationError(500, "Supabase environment variables are not configured");
  }
  return { url, anonKey, serviceRoleKey };
}
