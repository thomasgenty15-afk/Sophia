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
  ATTACK_TECHNIQUE_SYSTEM_PROMPT,
  buildAttackTechniqueUserPrompt,
  validateAttackTechniqueOutput,
} from "../_shared/v2-prompts/lab-surfaces.ts";
import { getRequestContext } from "../_shared/request_context.ts";
import { normalizeAttackKeyword } from "../_shared/attack_keyword.ts";
import { loadLabScopeContext } from "../_shared/v2-lab-context.ts";
import type { AttackCardContent, LabScopeKind } from "../_shared/v2-types.ts";

const REQUEST_SCHEMA = z.object({
  attack_card_id: z.string().uuid(),
  technique_key: z.enum([
    "texte_recadrage",
    "mantra_force",
    "ancre_visuelle",
    "visualisation_matinale",
    "preparer_terrain",
    "pre_engagement",
  ]),
  answers: z.array(z.string().min(1).max(500)).min(1).max(5),
  adjustment_context: z.object({
    current_technique_key: z.enum([
      "texte_recadrage",
      "mantra_force",
      "ancre_visuelle",
      "visualisation_matinale",
      "preparer_terrain",
      "pre_engagement",
    ]),
    failure_reason_key: z.enum([
      "forgot",
      "too_abstract",
      "too_hard",
      "did_not_resonate",
      "wrong_problem",
      "other",
    ]),
    failure_notes: z.string().max(1200).nullable().optional(),
    recommendation_reason: z.string().max(500).nullable().optional(),
    diagnostic_questions: z.array(z.string().min(1).max(220)).max(2).optional().default([]),
    diagnostic_answers: z.array(z.string().min(1).max(500)).max(2).optional().default([]),
  }).optional(),
});

class GenerateAttackTechniqueError extends Error {
  status: number;

  constructor(status: number, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "GenerateAttackTechniqueError";
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

type AttackCardRow = {
  id: string;
  user_id: string;
  cycle_id: string;
  scope_kind: LabScopeKind;
  transformation_id: string | null;
  metadata: Record<string, unknown>;
  content: AttackCardContent;
};

async function loadAttackCard(
  admin: SupabaseClient,
  attackCardId: string,
): Promise<AttackCardRow> {
  const { data, error } = await admin
    .from("user_attack_cards")
    .select("id, user_id, cycle_id, scope_kind, transformation_id, metadata, content")
    .eq("id", attackCardId)
    .maybeSingle();

  if (error) {
    throw new GenerateAttackTechniqueError(500, `DB error: ${error.message}`, { cause: error });
  }
  if (!data) {
    throw new GenerateAttackTechniqueError(404, "Attack card not found");
  }

  return {
    id: data.id,
    user_id: data.user_id,
    cycle_id: data.cycle_id,
    scope_kind: data.scope_kind,
    transformation_id: data.transformation_id,
    metadata: (data.metadata ?? {}) as Record<string, unknown>,
    content: data.content as AttackCardContent,
  };
}

export async function generateAttackTechnique(args: {
  admin: SupabaseClient;
  userId: string;
  attackCardId: string;
  techniqueKey: NonNullable<AttackCardContent["techniques"][number]["technique_key"]>;
  answers: string[];
  adjustmentContext?: {
    currentTechniqueKey: NonNullable<AttackCardContent["techniques"][number]["technique_key"]>;
    failureReasonKey: string;
    failureNotes: string | null;
    recommendationReason: string | null;
    diagnosticQuestions: string[];
    diagnosticAnswers: string[];
  } | null;
  requestId?: string;
}): Promise<{
  card_id: string;
  content: AttackCardContent;
}> {
  const card = await loadAttackCard(args.admin, args.attackCardId);
  if (card.user_id !== args.userId) {
    throw new GenerateAttackTechniqueError(403, "Not authorized to modify this attack card");
  }

  const technique = card.content.techniques.find((entry) => entry.technique_key === args.techniqueKey);
  if (!technique) {
    throw new GenerateAttackTechniqueError(404, "Technique not found on this attack card");
  }

  const currentTechnique = args.adjustmentContext
    ? card.content.techniques.find((entry) => entry.technique_key === args.adjustmentContext?.currentTechniqueKey) ?? null
    : null;
  if (args.adjustmentContext && (!currentTechnique || !currentTechnique.generated_result)) {
    throw new GenerateAttackTechniqueError(400, "Current generated technique not found for adjustment");
  }

  const context = await loadLabScopeContext({
    admin: args.admin,
    userId: args.userId,
    transformationId: card.transformation_id,
    scopeKind: card.scope_kind,
  });

  const raw = await generateWithGemini(
    ATTACK_TECHNIQUE_SYSTEM_PROMPT,
    buildAttackTechniqueUserPrompt({
      ...context,
      action_context: isRecord(card.metadata.action_context)
        ? {
          phase_label: typeof card.metadata.action_context.phase_label === "string"
            ? card.metadata.action_context.phase_label
            : null,
          item_title: typeof card.metadata.action_context.item_title === "string"
            ? card.metadata.action_context.item_title
            : "Action du plan",
          item_description: typeof card.metadata.action_context.item_description === "string"
            ? card.metadata.action_context.item_description
            : null,
          item_kind: typeof card.metadata.action_context.item_kind === "string"
            ? card.metadata.action_context.item_kind
            : "action",
          time_of_day: typeof card.metadata.action_context.time_of_day === "string"
            ? card.metadata.action_context.time_of_day
            : null,
          cadence_label: typeof card.metadata.action_context.cadence_label === "string"
            ? card.metadata.action_context.cadence_label
            : null,
          activation_hint: typeof card.metadata.action_context.activation_hint === "string"
            ? card.metadata.action_context.activation_hint
            : null,
          phase_items_summary: Array.isArray(card.metadata.action_context.phase_items_summary)
            ? card.metadata.action_context.phase_items_summary
              .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
            : null,
        }
        : null,
      technique_key: technique.technique_key,
      technique_title: technique.title,
      technique_pour_quoi: technique.pour_quoi,
      technique_objet_genere: technique.objet_genere,
      technique_mode_emploi: technique.mode_emploi,
      user_answers: args.answers,
      adjustment_context: args.adjustmentContext && currentTechnique?.generated_result
        ? {
          current_technique_key: currentTechnique.technique_key,
          current_technique_title: currentTechnique.title,
          current_generated_asset: currentTechnique.generated_result.generated_asset,
          current_mode_emploi: currentTechnique.generated_result.mode_emploi,
          failure_reason_key: args.adjustmentContext.failureReasonKey,
          failure_notes: args.adjustmentContext.failureNotes,
          recommendation_reason: args.adjustmentContext.recommendationReason,
          diagnostic_questions: args.adjustmentContext.diagnosticQuestions,
          diagnostic_answers: args.adjustmentContext.diagnosticAnswers,
        }
        : null,
    }),
    0.35,
    true,
    [],
    "auto",
    {
      requestId: args.requestId,
      source: "generate-attack-technique-v1",
      userId: args.userId,
      model: getGlobalAiModel("gemini-2.5-flash"),
      maxRetries: 2,
      httpTimeoutMs: 30_000,
    },
  );

  if (typeof raw !== "string") {
    throw new GenerateAttackTechniqueError(500, "LLM returned tool call instead of JSON");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim());
  } catch (error) {
    throw new GenerateAttackTechniqueError(500, "LLM returned invalid JSON", { cause: error });
  }

  const validation = validateAttackTechniqueOutput(parsed);
  if (!validation.valid || !validation.content) {
    throw new GenerateAttackTechniqueError(
      500,
      `Validation failed: ${validation.issues.join(", ")}`,
    );
  }
  const generatedContent = validation.content;
  const keywordTrigger = generatedContent.keyword_trigger
    ? {
      ...generatedContent.keyword_trigger,
      activation_keyword_normalized: normalizeAttackKeyword(
        generatedContent.keyword_trigger.activation_keyword_normalized ||
          generatedContent.keyword_trigger.activation_keyword,
      ),
    }
    : null;

  if (args.techniqueKey === "pre_engagement") {
    if (!keywordTrigger) {
      throw new GenerateAttackTechniqueError(
        500,
        "Validation failed: keyword trigger is required for pre_engagement",
      );
    }
    if (
      !keywordTrigger.activation_keyword ||
      !keywordTrigger.activation_keyword_normalized ||
      !keywordTrigger.risk_situation ||
      !keywordTrigger.strength_anchor ||
      !keywordTrigger.first_response_intent ||
      !keywordTrigger.assistant_prompt
    ) {
      throw new GenerateAttackTechniqueError(
        500,
        "Validation failed: keyword trigger payload is incomplete",
      );
    }
    if (keywordTrigger.activation_keyword_normalized.includes(" ")) {
      throw new GenerateAttackTechniqueError(
        500,
        "Validation failed: keyword trigger must be a single short word",
      );
    }
  }

  const now = new Date().toISOString();
  const updatedContent: AttackCardContent = {
    ...card.content,
    techniques: card.content.techniques.map((entry) =>
      entry.technique_key === args.techniqueKey
        ? {
            ...entry,
            generated_result: {
              output_title: generatedContent.output_title,
              generated_asset: generatedContent.generated_asset,
              supporting_points: generatedContent.supporting_points,
              mode_emploi: generatedContent.mode_emploi,
              generated_at: now,
              keyword_trigger: keywordTrigger,
            },
          }
        : entry
    ),
  };

  const { error: updateError } = await args.admin
    .from("user_attack_cards")
    .update({
      content: updatedContent,
      last_updated_at: now,
      status: "active",
    })
    .eq("id", card.id);

  if (updateError) {
    throw new GenerateAttackTechniqueError(500, `Update failed: ${updateError.message}`, {
      cause: updateError,
    });
  }

  return {
    card_id: card.id,
    content: updatedContent,
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

    const result = await generateAttackTechnique({
      admin,
      userId: authData.user.id,
      attackCardId: parsed.data.attack_card_id,
      techniqueKey: parsed.data.technique_key,
      answers: parsed.data.answers,
      adjustmentContext: parsed.data.adjustment_context
        ? {
          currentTechniqueKey: parsed.data.adjustment_context.current_technique_key,
          failureReasonKey: parsed.data.adjustment_context.failure_reason_key,
          failureNotes: parsed.data.adjustment_context.failure_notes ?? null,
          recommendationReason: parsed.data.adjustment_context.recommendation_reason ?? null,
          diagnosticQuestions: parsed.data.adjustment_context.diagnostic_questions ?? [],
          diagnosticAnswers: parsed.data.adjustment_context.diagnostic_answers ?? [],
        }
        : null,
      requestId,
    });

    return jsonResponse(req, {
      request_id: requestId,
      card_id: result.card_id,
      content: result.content,
    });
  } catch (error) {
    const ctx = getRequestContext(req);
    await logEdgeFunctionError({
      functionName: "generate-attack-technique-v1",
      error,
      requestId,
      userId: ctx.userId,
      source: "edge",
      metadata: { route: "generate-attack-technique-v1" },
    });

    if (error instanceof GenerateAttackTechniqueError) {
      if (error.status === 400) return badRequest(req, requestId, error.message);
      return jsonResponse(req, { error: error.message, request_id: requestId }, { status: error.status });
    }

    return serverError(req, requestId, "Failed to generate attack technique");
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
    throw new GenerateAttackTechniqueError(500, "Supabase environment variables are not configured");
  }
  return { url, anonKey, serviceRoleKey };
}
