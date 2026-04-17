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
  ATTACK_TECHNIQUE_ADJUSTMENT_SYSTEM_PROMPT,
  buildAttackTechniqueAdjustmentPrompt,
} from "../_shared/v2-prompts/lab-surfaces.ts";
import { getRequestContext } from "../_shared/request_context.ts";
import { loadLabScopeContext } from "../_shared/v2-lab-context.ts";
import type { AttackCardContent, LabScopeKind } from "../_shared/v2-types.ts";

const TECHNIQUE_KEY_SCHEMA = z.enum([
  "texte_recadrage",
  "mantra_force",
  "ancre_visuelle",
  "visualisation_matinale",
  "preparer_terrain",
  "pre_engagement",
]);

const REQUEST_SCHEMA = z.object({
  attack_card_id: z.string().uuid(),
  current_technique_key: TECHNIQUE_KEY_SCHEMA,
  failure_reason_key: z.enum([
    "forgot",
    "too_abstract",
    "too_hard",
    "did_not_resonate",
    "wrong_problem",
    "other",
  ]),
  failure_notes: z.string().max(1200).nullable().optional(),
});

const RESPONSE_SCHEMA = z.object({
  decision: z.enum(["refine", "change"]),
  recommended_technique_key: TECHNIQUE_KEY_SCHEMA,
  recommendation_reason: z.string().min(1).max(280),
  diagnostic_questions: z.array(z.string().min(1).max(220)).max(2),
});

type AttackCardRow = {
  id: string;
  user_id: string;
  cycle_id: string;
  scope_kind: LabScopeKind;
  transformation_id: string | null;
  content: AttackCardContent;
};

class AnalyzeAttackTechniqueAdjustmentError extends Error {
  status: number;

  constructor(status: number, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "AnalyzeAttackTechniqueAdjustmentError";
    this.status = status;
  }
}

async function loadAttackCard(
  admin: SupabaseClient,
  attackCardId: string,
): Promise<AttackCardRow> {
  const { data, error } = await admin
    .from("user_attack_cards")
    .select("id, user_id, cycle_id, scope_kind, transformation_id, content")
    .eq("id", attackCardId)
    .maybeSingle();

  if (error) {
    throw new AnalyzeAttackTechniqueAdjustmentError(500, `DB error: ${error.message}`, { cause: error });
  }
  if (!data) {
    throw new AnalyzeAttackTechniqueAdjustmentError(404, "Attack card not found");
  }

  return {
    id: data.id,
    user_id: data.user_id,
    cycle_id: data.cycle_id,
    scope_kind: data.scope_kind,
    transformation_id: data.transformation_id,
    content: data.content as AttackCardContent,
  };
}

async function analyzeAdjustment(args: {
  admin: SupabaseClient;
  userId: string;
  attackCardId: string;
  currentTechniqueKey: AttackCardContent["techniques"][number]["technique_key"];
  failureReasonKey: string;
  failureNotes: string | null;
  requestId?: string;
}) {
  const card = await loadAttackCard(args.admin, args.attackCardId);
  if (card.user_id !== args.userId) {
    throw new AnalyzeAttackTechniqueAdjustmentError(403, "Not authorized to modify this attack card");
  }

  const technique = card.content.techniques.find((entry) => entry.technique_key === args.currentTechniqueKey);
  if (!technique) {
    throw new AnalyzeAttackTechniqueAdjustmentError(404, "Technique not found on this attack card");
  }
  if (!technique.generated_result) {
    throw new AnalyzeAttackTechniqueAdjustmentError(400, "Technique has not been generated yet");
  }

  const context = await loadLabScopeContext({
    admin: args.admin,
    userId: args.userId,
    transformationId: card.transformation_id,
    scopeKind: card.scope_kind,
  });

  const raw = await generateWithGemini(
    ATTACK_TECHNIQUE_ADJUSTMENT_SYSTEM_PROMPT,
    buildAttackTechniqueAdjustmentPrompt({
      ...context,
      current_technique_key: technique.technique_key,
      current_technique_title: technique.title,
      current_technique_pour_quoi: technique.pour_quoi,
      current_generated_asset: technique.generated_result.generated_asset,
      current_mode_emploi: technique.generated_result.mode_emploi,
      failure_reason_key: args.failureReasonKey,
      failure_notes: args.failureNotes,
    }),
    0.3,
    true,
    [],
    "auto",
    {
      requestId: args.requestId,
      source: "analyze-attack-technique-adjustment-v1",
      userId: args.userId,
      model: getGlobalAiModel("gemini-2.5-flash"),
      maxRetries: 2,
      httpTimeoutMs: 30_000,
    },
  );

  if (typeof raw !== "string") {
    throw new AnalyzeAttackTechniqueAdjustmentError(500, "LLM returned tool call instead of JSON");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim());
  } catch (error) {
    throw new AnalyzeAttackTechniqueAdjustmentError(500, "LLM returned invalid JSON", { cause: error });
  }

  const validation = RESPONSE_SCHEMA.safeParse(parsed);
  if (!validation.success) {
    throw new AnalyzeAttackTechniqueAdjustmentError(500, "LLM returned invalid payload");
  }

  return validation.data;
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

    const result = await analyzeAdjustment({
      admin,
      userId: authData.user.id,
      attackCardId: parsed.data.attack_card_id,
      currentTechniqueKey: parsed.data.current_technique_key,
      failureReasonKey: parsed.data.failure_reason_key,
      failureNotes: parsed.data.failure_notes ?? null,
      requestId,
    });

    return jsonResponse(req, {
      request_id: requestId,
      ...result,
    });
  } catch (error) {
    const ctx = getRequestContext(req);
    await logEdgeFunctionError({
      functionName: "analyze-attack-technique-adjustment-v1",
      error,
      requestId,
      userId: ctx.userId,
      source: "edge",
      metadata: { route: "analyze-attack-technique-adjustment-v1" },
    });

    if (error instanceof AnalyzeAttackTechniqueAdjustmentError) {
      if (error.status === 400) return badRequest(req, requestId, error.message);
      return jsonResponse(req, { error: error.message, request_id: requestId }, { status: error.status });
    }

    return serverError(req, requestId, "Failed to analyze attack technique adjustment");
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
    throw new AnalyzeAttackTechniqueAdjustmentError(500, "Supabase environment variables are not configured");
  }
  return { url, anonKey, serviceRoleKey };
}
