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
import { getRequestContext } from "../_shared/request_context.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { generateWithGemini, getGlobalAiModel } from "../_shared/gemini.ts";
import {
  buildDefenseCardUserPrompt,
  DEFENSE_CARD_SYSTEM_PROMPT,
  validateDefenseCardOutput,
  type DefenseCardGenerationInput,
} from "../_shared/v2-prompts/defense-card.ts";
import type { DefenseCardContent, LabScopeKind } from "../_shared/v2-types.ts";
import { extractStructuredCalibrationFields } from "../_shared/v2-calibration-fields.ts";
import { reviewAndEnrichDefenseCard } from "../_shared/v2-defense-card-enrichment.ts";
import { buildTransformationFocusMaterial } from "../_shared/v2-transformation-focus.ts";

const REQUEST_SCHEMA = z.object({
  defense_card_id: z.string().uuid().optional(),
  transformation_id: z.string().uuid().optional(),
  scope_kind: z.enum(["transformation", "out_of_plan"]).optional(),
  force_regenerate: z.boolean().optional(),
});

class GenerateDefenseCardError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "GenerateDefenseCardError";
    this.status = status;
  }
}

function collapseToPrimaryDefenseCard(content: DefenseCardContent): DefenseCardContent {
  const primaryImpulse = content.impulses[0];
  const primaryTrigger = primaryImpulse?.triggers?.[0];

  if (!primaryImpulse || !primaryTrigger) {
    return content;
  }

  return {
    ...content,
    impulses: [{
      ...primaryImpulse,
      generic_defense: String(primaryImpulse.generic_defense ?? "").trim(),
      triggers: [{
        ...primaryTrigger,
        plan_b: String(primaryTrigger.plan_b ?? primaryImpulse.generic_defense ?? "").trim(),
      }],
    }],
  };
}

type TransformationContext = {
  scope_kind: LabScopeKind;
  id: string;
  cycle_id: string;
  title: string | null;
  internal_summary: string;
  user_summary: string;
  success_definition: string | null;
  main_constraint: string | null;
  questionnaire_answers: Record<string, unknown> | null;
  questionnaire_schema: Record<string, unknown> | null;
};

async function loadTransformationContext(
  admin: SupabaseClient,
  userId: string,
  args: {
    transformationId?: string | null;
    scopeKind: LabScopeKind;
  },
): Promise<TransformationContext> {
  if (args.scopeKind === "out_of_plan") {
    const { data: cycle, error: cycleError } = await admin
      .from("user_cycles")
      .select("id, user_id, raw_intake_text")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (cycleError) throw new GenerateDefenseCardError(500, `DB error: ${cycleError.message}`);
    if (!cycle) throw new GenerateDefenseCardError(404, "Active cycle not found");

    const { data: transformations } = await admin
      .from("user_transformations")
      .select("title, user_summary, status")
      .eq("cycle_id", (cycle as any).id)
      .order("priority_order", { ascending: true });

    const visible = ((transformations ?? []) as any[]).filter((row) =>
      row.status !== "abandoned" && row.status !== "cancelled" && row.status !== "archived"
    );

    return {
      scope_kind: "out_of_plan",
      id: "out_of_plan",
      cycle_id: String((cycle as any).id),
      title: "Hors transformations",
      internal_summary: "",
      user_summary: visible
        .map((row) => String(row.user_summary ?? "").trim())
        .filter(Boolean)
        .slice(0, 2)
        .join(" ") || "Contexte general hors transformation.",
      success_definition: null,
      main_constraint: null,
      questionnaire_answers: null,
      questionnaire_schema: null,
    };
  }

  const transformationId = String(args.transformationId ?? "").trim();
  if (!transformationId) {
    throw new GenerateDefenseCardError(400, "transformation_id is required");
  }

  const { data, error } = await admin
    .from("user_transformations")
    .select("id, cycle_id, title, internal_summary, user_summary, success_definition, main_constraint, questionnaire_answers, questionnaire_schema")
    .eq("id", transformationId)
    .maybeSingle();

  if (error) throw new GenerateDefenseCardError(500, `DB error: ${error.message}`);
  if (!data) throw new GenerateDefenseCardError(404, "Transformation not found");

  const { data: cycle, error: cycleError } = await admin
    .from("user_cycles")
    .select("id, user_id, raw_intake_text")
    .eq("id", (data as any).cycle_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (cycleError || !cycle) {
    throw new GenerateDefenseCardError(403, "Cycle not found or not owned by user");
  }

  return {
    scope_kind: "transformation",
    id: data.id,
    cycle_id: data.cycle_id,
    title: data.title ?? null,
    internal_summary: String(data.internal_summary ?? "").trim(),
    user_summary: data.user_summary ?? "",
    success_definition: typeof data.success_definition === "string"
      ? data.success_definition
      : null,
    main_constraint: typeof data.main_constraint === "string"
      ? data.main_constraint
      : null,
    questionnaire_answers: data.questionnaire_answers as Record<string, unknown> | null,
    questionnaire_schema: data.questionnaire_schema as Record<string, unknown> | null,
  };
}

async function loadPlanStrategy(
  admin: SupabaseClient,
  transformationId: string,
): Promise<{ identity_shift: string | null; core_principle: string | null }> {
  const { data } = await admin
    .from("user_plans_v2")
    .select("content")
    .eq("transformation_id", transformationId)
    .eq("status", "active")
    .order("activated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const content = (data as any)?.content;
  if (!content || typeof content !== "object") {
    return { identity_shift: null, core_principle: null };
  }

  const strategy = (content as any).strategy;
  return {
    identity_shift: typeof strategy?.identity_shift === "string" ? strategy.identity_shift : null,
    core_principle: typeof strategy?.core_principle === "string" ? strategy.core_principle : null,
  };
}

export async function generateDefenseCardForTransformation(args: {
  admin: SupabaseClient;
  userId: string;
  defenseCardId?: string | null;
  transformationId?: string | null;
  scopeKind?: LabScopeKind;
  planItemId?: string | null;
  phaseId?: string | null;
  actionContext?: {
    phase_label: string | null;
    item_title: string;
    item_description: string | null;
    item_kind: string;
    time_of_day: string | null;
    cadence_label: string | null;
    activation_hint: string | null;
  } | null;
  requestId?: string;
  forceRegenerate?: boolean;
}): Promise<{ card_id: string; content: DefenseCardContent }> {
  const { admin, userId, requestId } = args;
  const scopeKind = args.scopeKind ?? "transformation";
  const context = await loadTransformationContext(admin, userId, {
    transformationId: args.transformationId,
    scopeKind,
  });

  let existing:
    | { id: string; content: DefenseCardContent; metadata: Record<string, unknown> }
    | null = null;
  if (args.defenseCardId) {
    const { data, error } = await admin
      .from("user_defense_cards")
      .select("id, content, metadata, user_id")
      .eq("id", args.defenseCardId)
      .maybeSingle();
    if (error) throw new GenerateDefenseCardError(500, `DB error: ${error.message}`);
    if (data) {
      if ((data as any).user_id !== userId) {
        throw new GenerateDefenseCardError(403, "Not authorized for this defense card");
      }
      existing = {
        id: String((data as any).id),
        content: (data as any).content as DefenseCardContent,
        metadata: (((data as any).metadata) ?? {}) as Record<string, unknown>,
      };
    }
  } else {
    let existingQuery = admin
      .from("user_defense_cards")
      .select("id, content, metadata")
      .eq("user_id", userId)
      .eq("cycle_id", context.cycle_id)
      .order("generated_at", { ascending: false })
      .limit(1);
    if (args.planItemId) {
      existingQuery = existingQuery.eq("plan_item_id", args.planItemId);
    } else {
      existingQuery = existingQuery.eq("scope_kind", scopeKind);
      existingQuery = existingQuery.is("plan_item_id", null);
      existingQuery = scopeKind === "transformation"
        ? existingQuery.eq("transformation_id", String(args.transformationId))
        : existingQuery.is("transformation_id", null);
    }
    const { data } = await existingQuery.maybeSingle();
    existing = data
      ? {
        id: String((data as any).id),
        content: (data as any).content as DefenseCardContent,
        metadata: (((data as any).metadata) ?? {}) as Record<string, unknown>,
      }
      : null;
  }

  if (existing && !args.forceRegenerate) {
    return { card_id: existing.id, content: existing.content as DefenseCardContent };
  }

  const [planStrategy] = await Promise.all([
    scopeKind === "transformation" && args.transformationId
      ? loadPlanStrategy(admin, args.transformationId)
      : Promise.resolve({ identity_shift: null, core_principle: null }),
  ]);

  const calibration = extractStructuredCalibrationFields(
    context.questionnaire_answers ?? {},
    context.questionnaire_schema ?? null,
  );

  const input: DefenseCardGenerationInput = {
    transformation_title: context.title || "Transformation",
    user_summary: context.user_summary,
    focus_context: buildTransformationFocusMaterial({
      transformation: {
        title: context.title,
        internal_summary: context.internal_summary,
        user_summary: context.user_summary,
        success_definition: context.success_definition,
        main_constraint: context.main_constraint,
      },
    }),
    action_context: args.actionContext ?? null,
    questionnaire_answers: context.questionnaire_answers,
    calibration: {
      struggle_duration: calibration.struggle_duration ?? null,
      main_blocker: calibration.main_blocker ?? null,
      perceived_difficulty: calibration.perceived_difficulty ?? null,
      probable_drivers: calibration.probable_drivers ?? null,
      prior_attempts: calibration.prior_attempts ?? null,
      self_confidence: calibration.self_confidence ?? null,
    },
    plan_strategy: planStrategy,
  };

  const model = Deno.env.get("DEFENSE_CARD_MODEL") ??
    getGlobalAiModel("gemini-2.5-flash");

  const raw = await generateWithGemini(
    DEFENSE_CARD_SYSTEM_PROMPT,
    buildDefenseCardUserPrompt(input),
    0.4,
    true,
    [],
    "auto",
    {
      requestId,
      source: "generate-defense-card-v3",
      userId,
      model,
      maxRetries: 2,
      httpTimeoutMs: 30_000,
    },
  );

  if (typeof raw !== "string") {
    throw new GenerateDefenseCardError(500, "LLM returned tool call instead of JSON");
  }

  let parsed: unknown;
  try {
    const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    throw new GenerateDefenseCardError(500, "LLM returned invalid JSON");
  }

  const validation = validateDefenseCardOutput(parsed);
  if (!validation.valid || !validation.content) {
    console.warn("[generate-defense-card-v3] validation issues:", validation.issues);
    throw new GenerateDefenseCardError(500, `Validation failed: ${validation.issues.join(", ")}`);
  }

  const primaryContent = collapseToPrimaryDefenseCard(validation.content);

  const enrichedContent = collapseToPrimaryDefenseCard(await reviewAndEnrichDefenseCard(primaryContent, {
    transformation_title: input.transformation_title,
    transformation_summary: input.user_summary,
    request_id: requestId,
    user_id: userId,
    model,
  }));

  const now = new Date().toISOString();
  if (existing?.id) {
    const { data: card, error: updateError } = await admin
      .from("user_defense_cards")
      .update({
        content: enrichedContent,
        metadata: {
          ...(existing.metadata ?? {}),
          plan_item_id: args.planItemId ?? null,
          phase_id: args.phaseId ?? null,
        },
        plan_item_id: args.planItemId ?? null,
        phase_id: args.phaseId ?? null,
        source: "prefill_plan",
        status: "active",
        generated_at: now,
        last_updated_at: now,
      })
      .eq("id", existing.id)
      .select("id")
      .single();

    if (updateError) {
      throw new GenerateDefenseCardError(500, `Update failed: ${updateError.message}`);
    }

    return { card_id: (card as any).id, content: enrichedContent };
  }

  const { data: card, error: insertError } = await admin
    .from("user_defense_cards")
    .insert({
      user_id: userId,
      cycle_id: context.cycle_id,
      scope_kind: scopeKind,
      transformation_id: scopeKind === "transformation"
        ? String(args.transformationId ?? "")
        : null,
      plan_item_id: args.planItemId ?? null,
      phase_id: args.phaseId ?? null,
      source: "prefill_plan",
      status: "active",
      content: enrichedContent,
      metadata: {
        plan_item_id: args.planItemId ?? null,
        phase_id: args.phaseId ?? null,
      },
      generated_at: now,
      last_updated_at: now,
    })
    .select("id")
    .single();

  if (insertError) {
    throw new GenerateDefenseCardError(500, `Insert failed: ${insertError.message}`);
  }

  return { card_id: (card as any).id, content: enrichedContent };
}

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return handleCorsOptions(req);

  const corsError = enforceCors(req);
  if (corsError) return corsError;

  const ctx = getRequestContext(req);
  const requestId = ctx.requestId;

  try {
    if (req.method !== "POST") {
      return jsonResponse(req, { error: "Method Not Allowed", request_id: requestId }, { status: 405 });
    }

    const authHeader = String(req.headers.get("Authorization") ?? "").trim();
    if (!authHeader) {
      return jsonResponse(req, { error: "Missing Authorization header", request_id: requestId }, { status: 401 });
    }

    const url = (Deno.env.get("SUPABASE_URL") ?? "").trim();
    const anonKey = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
    const serviceRoleKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
    if (!url || !anonKey || !serviceRoleKey) {
      return serverError(req, requestId, "Server misconfigured");
    }

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData?.user) {
      return jsonResponse(req, { error: "Unauthorized", request_id: requestId }, { status: 401 });
    }

    const parsed = await parseJsonBody(req, REQUEST_SCHEMA, requestId);
    if (!parsed.ok) return parsed.response;

    const admin = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const scopeKind = parsed.data.scope_kind ?? "transformation";
    if (scopeKind === "transformation" && !parsed.data.transformation_id) {
      throw new GenerateDefenseCardError(400, "transformation_id is required");
    }

    const result = await generateDefenseCardForTransformation({
      admin,
      userId: authData.user.id,
      defenseCardId: parsed.data.defense_card_id ?? null,
      transformationId: parsed.data.transformation_id,
      scopeKind,
      requestId,
      forceRegenerate: parsed.data.force_regenerate ?? false,
    });

    return jsonResponse(req, {
      ...result,
      request_id: requestId,
      transformation_id: parsed.data.transformation_id ?? null,
      scope_kind: scopeKind,
    });
  } catch (error) {
    await logEdgeFunctionError({
      functionName: "generate-defense-card-v3",
      error,
      requestId,
      userId: ctx.userId,
      source: "edge",
      metadata: {},
    });

    if (error instanceof GenerateDefenseCardError) {
      return jsonResponse(
        req,
        { error: error.message, request_id: requestId },
        { status: error.status },
      );
    }

    return serverError(req, requestId, "Failed to generate defense card");
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
