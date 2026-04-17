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
import { getRequestContext } from "../_shared/request_context.ts";
import type {
  PlanTypeClassificationV1,
  UserCycleRow,
  UserTransformationRow,
} from "../_shared/v2-types.ts";

const REQUEST_SCHEMA = z.object({
  transformation_id: z.string().uuid(),
});

const PLAN_TYPE_CLASSIFICATION_SCHEMA = z.object({
  type_key: z.string().min(1),
  confidence: z.number().min(0).max(1),
  duration_guidance: z.object({
    min_months: z.number().int().min(1).max(4),
    default_months: z.number().int().min(1).max(4),
    max_months: z.number().int().min(1).max(4),
  }).superRefine((value, ctx) => {
    if (value.min_months > value.default_months) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "duration_guidance.min_months must be <= default_months",
      });
    }
    if (value.default_months > value.max_months) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "duration_guidance.default_months must be <= max_months",
      });
    }
  }),
  transformation_length_level: z.number().int().min(1).max(6),
  recommended_phase_count: z.object({
    min: z.number().int().min(2).max(12),
    max: z.number().int().min(2).max(12),
  }).superRefine((value, ctx) => {
    if (value.min > value.max) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "recommended_phase_count.min must be <= max",
      });
    }
  }),
  intensity_profile: z.object({
    pace: z.enum(["gentle", "steady", "assertive"]),
    rationale: z.string().min(1).max(400),
  }),
  journey_strategy: z.object({
    mode: z.enum(["single_transformation", "two_transformations"]),
    rationale: z.string().min(1).max(500),
    total_estimated_duration_months: z.number().int().min(1).max(8),
    transformation_1_title: z.string().min(1).max(200),
    transformation_1_goal: z.string().min(1).max(300),
    transformation_2_title: z.string().min(1).max(200).nullable(),
    transformation_2_goal: z.string().min(1).max(300).nullable(),
  }).superRefine((value, ctx) => {
    if (value.mode === "single_transformation") {
      if (value.transformation_2_title !== null || value.transformation_2_goal !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "journey_strategy second transformation fields must be null for single_transformation",
        });
      }
      return;
    }

    if (value.transformation_2_title == null || value.transformation_2_goal == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "journey_strategy second transformation fields are required for two_transformations",
      });
    }
    if (value.total_estimated_duration_months < 4) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "journey_strategy total_estimated_duration_months must be at least 4 for two_transformations",
      });
    }
  }),
  split_metric_guidance: z.object({
    metric_label: z.string().min(1).max(120).nullable(),
    transformation_1: z.object({
      baseline_text: z.string().min(1).max(120),
      target_text: z.string().min(1).max(120),
      success_definition: z.string().min(1).max(300),
    }),
    transformation_2: z.object({
      baseline_text: z.string().min(1).max(120),
      target_text: z.string().min(1).max(120),
      success_definition: z.string().min(1).max(300),
    }).nullable(),
  }).nullable().optional(),
  sequencing_notes: z.array(z.string().min(1)).min(1).max(6),
  plan_style: z.array(z.string().min(1)).min(1).max(6),
  recommended_metrics: z.array(z.string().min(1)).min(1).max(6),
  framing_to_avoid: z.array(z.string().min(1)).min(1).max(6),
  first_steps_examples: z.array(z.string().min(1)).min(1).max(6),
  secondary_type_keys: z.array(z.string().min(1)).max(4).optional(),
  difficulty_patterns: z.array(z.string().min(1)).max(6).optional(),
  support_bias: z.array(z.string().min(1)).max(6).optional(),
  forbidden_actions: z.array(z.string().min(1)).max(6).optional(),
}).superRefine((value, ctx) => {
  if (value.journey_strategy.mode === "two_transformations") {
    if (!value.split_metric_guidance) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "split_metric_guidance is required for two_transformations",
        path: ["split_metric_guidance"],
      });
      return;
    }
    if (value.split_metric_guidance.transformation_2 == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "split_metric_guidance.transformation_2 is required for two_transformations",
        path: ["split_metric_guidance", "transformation_2"],
      });
    }
    return;
  }

  if (value.split_metric_guidance != null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "split_metric_guidance must be null or omitted for single_transformation",
      path: ["split_metric_guidance"],
    });
  }
});

type ClassificationContext = {
  cycle: UserCycleRow;
  transformation: UserTransformationRow;
};

class ClassifyPlanTypeV1Error extends Error {
  status: number;

  constructor(status: number, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ClassifyPlanTypeV1Error";
    this.status = status;
  }
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

    const admin = createClient(env.url, env.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const result = await classifyPlanTypeForTransformation({
      admin,
      requestId,
      userId: authData.user.id,
      transformationId: parsedBody.data.transformation_id,
    });

    return jsonResponse(req, {
      request_id: requestId,
      transformation_id: result.transformation.id,
      cycle_id: result.cycle.id,
      classification: result.classification,
    });
  } catch (error) {
    const ctx = getRequestContext(req);
    await logEdgeFunctionError({
      functionName: "classify-plan-type-v1",
      error,
      requestId,
      userId: ctx.userId,
      source: "edge",
      metadata: { route: "classify-plan-type-v1" },
    });

    if (error instanceof ClassifyPlanTypeV1Error) {
      if (error.status === 400) {
        return badRequest(req, requestId, error.message);
      }
      if (error.status >= 400 && error.status < 500) {
        return jsonResponse(
          req,
          { error: error.message, request_id: requestId },
          { status: error.status },
        );
      }
    }

    return serverError(req, requestId, "Failed to classify plan type");
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}

export async function classifyPlanTypeForTransformation(params: {
  admin: SupabaseClient;
  requestId: string;
  userId: string;
  transformationId: string;
}): Promise<{
  cycle: UserCycleRow;
  transformation: UserTransformationRow;
  classification: PlanTypeClassificationV1;
}> {
  const context = await loadClassificationContext(
    params.admin,
    params.userId,
    params.transformationId,
  );

  const questionnaireAnswers = isRecord(context.transformation.questionnaire_answers)
    ? context.transformation.questionnaire_answers
    : {};
  const questionnaireSchema = isRecord(context.transformation.questionnaire_schema)
    ? context.transformation.questionnaire_schema
    : {};

  if (Object.keys(questionnaireAnswers).length === 0) {
    throw new ClassifyPlanTypeV1Error(
      400,
      "Questionnaire answers are required before classifying the plan type",
    );
  }

  let classification: PlanTypeClassificationV1 | null = null;
  let validationIssues: string[] | null = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const raw = await generateWithGemini(
      PLAN_TYPE_CLASSIFICATION_SYSTEM_PROMPT,
      buildPlanTypeClassificationUserPrompt({
        cycle: context.cycle,
        transformation: context.transformation,
        questionnaireAnswers,
        questionnaireSchema,
        validationIssues,
      }),
      0.2,
      true,
      [],
      "auto",
      {
        requestId: `${params.requestId}:classify-plan-type-v1`,
        source: "classify-plan-type-v1",
        userId: params.userId,
        model: getGlobalAiModel(),
        maxRetries: 3,
        httpTimeoutMs: 90_000,
      },
    );

    if (typeof raw !== "string") {
      throw new ClassifyPlanTypeV1Error(
        500,
        "LLM returned an unsupported response while classifying the plan type",
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      console.error("[classify-plan-type-v1][invalid-json]", {
        request_id: params.requestId,
        transformation_id: params.transformationId,
        attempt,
        raw,
        error_name: error instanceof Error ? error.name : "UnknownError",
        error_message: error instanceof Error ? error.message : String(error),
      });

      if (attempt === 2) {
        throw new ClassifyPlanTypeV1Error(
          500,
          "LLM returned invalid JSON for the plan type classification",
          { cause: error },
        );
      }

      validationIssues = [
        "The previous response was not valid JSON.",
        "Return a single JSON object only, with no prose and no markdown.",
      ];
      continue;
    }

    const normalizedParsed = normalizePlanTypeClassificationCandidate(parsed);
    const validation = PLAN_TYPE_CLASSIFICATION_SCHEMA.safeParse(normalizedParsed);
    if (validation.success) {
      classification = validation.data;
      break;
    }

    const issues = validation.error.issues.map((issue) => ({
      path: issue.path,
      message: issue.message,
      code: issue.code,
    }));
    console.error("[classify-plan-type-v1][invalid-schema]", {
      request_id: params.requestId,
      transformation_id: params.transformationId,
      attempt,
      parsed: normalizedParsed,
      issues,
    });

    if (attempt === 2) {
      throw new ClassifyPlanTypeV1Error(
        500,
        "LLM returned a plan type classification that failed schema validation",
      );
    }

    validationIssues = issues.map((issue) =>
      `${issue.path.join(".") || "root"}: ${issue.message}`
    );
  }

  if (!classification) {
    throw new ClassifyPlanTypeV1Error(
      500,
      "Plan type classification could not be validated",
    );
  }

  const now = new Date().toISOString();
  const nextHandoffPayload = mergePlanTypeClassification(
    context.transformation.handoff_payload,
    classification,
  );

  const transformationPatch = {
    handoff_payload: nextHandoffPayload as unknown as Record<string, unknown>,
    updated_at: now,
  } satisfies Partial<UserTransformationRow>;

  const { data, error } = await params.admin
    .from("user_transformations")
    .update(transformationPatch as any)
    .eq("id", context.transformation.id)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    console.error("[classify-plan-type-v1][persist-failed]", {
      request_id: params.requestId,
      transformation_id: params.transformationId,
      error,
      handoff_payload: nextHandoffPayload,
    });
    throw new ClassifyPlanTypeV1Error(
      500,
      "Failed to persist plan type classification",
      { cause: error },
    );
  }

  return {
    cycle: context.cycle,
    transformation: data as UserTransformationRow,
    classification,
  };
}

function buildPlanTypeClassificationUserPrompt(input: {
  cycle: UserCycleRow;
  transformation: UserTransformationRow;
  questionnaireAnswers: Record<string, unknown>;
  questionnaireSchema: Record<string, unknown>;
  validationIssues?: string[] | null;
}): string {
  const profileLines = [
    input.cycle.birth_date_snapshot
      ? `- Birth date snapshot: ${input.cycle.birth_date_snapshot}`
      : null,
    input.cycle.gender_snapshot
      ? `- Gender snapshot: ${input.cycle.gender_snapshot}`
      : null,
  ].filter(Boolean).join("\n");

  const validationIssuesBlock = Array.isArray(input.validationIssues) &&
      input.validationIssues.length > 0
    ? `
## Required correction

The previous response failed schema validation. Regenerate the JSON from scratch and fix these exact issues:
${input.validationIssues.map((issue) => `- ${issue}`).join("\n")}
`
    : "";

  return `## Transformation

- Title: ${String(input.transformation.title ?? "").trim() || "Untitled transformation"}
- Internal summary: ${input.transformation.internal_summary}
- User summary: ${input.transformation.user_summary}
- Success definition: ${String(input.transformation.success_definition ?? "").trim() || "Not provided"}
- Main constraint: ${String(input.transformation.main_constraint ?? "").trim() || "Not provided"}

## Profile

${profileLines || "- No profile snapshot"}

## Questionnaire schema

${JSON.stringify(input.questionnaireSchema, null, 2)}

## Questionnaire answers

${JSON.stringify(input.questionnaireAnswers, null, 2)}

## Output contract reminders

- Return JSON only.
- If journey_strategy.mode = "two_transformations", total_estimated_duration_months must stay between 4 and 8.
- If journey_strategy.mode = "two_transformations", split_metric_guidance is REQUIRED and must use this exact shape:
{
  "metric_label": "Body weight",
  "transformation_1": {
    "baseline_text": "105 kg",
    "target_text": "95 kg",
    "success_definition": "Reach 95 kg with eating patterns stable enough to continue."
  },
  "transformation_2": {
    "baseline_text": "95 kg",
    "target_text": "80 kg",
    "success_definition": "Reach 80 kg and make the new routine sustainable."
  }
}
- Do NOT use keys like metric, start_value, or target_value.
- Do NOT omit success_definition inside split_metric_guidance.
${validationIssuesBlock}

Return the JSON classification only.`;
}

function normalizePlanTypeClassificationCandidate(value: unknown): unknown {
  if (!isRecord(value)) return value;

  const candidate = { ...value };
  const rawSplit = isRecord(candidate.split_metric_guidance)
    ? { ...candidate.split_metric_guidance }
    : candidate.split_metric_guidance;

  if (isRecord(rawSplit)) {
    const normalizeSplitPart = (part: unknown): unknown => {
      if (!isRecord(part)) return part;
      return {
        ...part,
        baseline_text: typeof part.baseline_text === "string"
          ? part.baseline_text
          : typeof part.start_value === "string"
          ? part.start_value
          : part.baseline_text,
        target_text: typeof part.target_text === "string"
          ? part.target_text
          : typeof part.target_value === "string"
          ? part.target_value
          : part.target_text,
      };
    };

    const transformation1 = normalizeSplitPart(rawSplit.transformation_1);
    const transformation2 = normalizeSplitPart(rawSplit.transformation_2);
    const inferredMetricLabel =
      typeof rawSplit.metric_label === "string" || rawSplit.metric_label === null
        ? rawSplit.metric_label
        : isRecord(rawSplit.transformation_1) &&
            typeof rawSplit.transformation_1.metric === "string"
        ? rawSplit.transformation_1.metric
        : isRecord(rawSplit.transformation_2) &&
            typeof rawSplit.transformation_2.metric === "string"
        ? rawSplit.transformation_2.metric
        : rawSplit.metric_label;

    candidate.split_metric_guidance = {
      ...rawSplit,
      metric_label: inferredMetricLabel,
      transformation_1: transformation1,
      transformation_2: transformation2,
    };
  }

  return candidate;
}

function mergePlanTypeClassification(
  handoffPayload: UserTransformationRow["handoff_payload"],
  classification: PlanTypeClassificationV1,
): Record<string, unknown> {
  const current = isRecord(handoffPayload) ? { ...handoffPayload } : {};
  const onboardingV2 = isRecord(current.onboarding_v2)
    ? { ...current.onboarding_v2 }
    : {};

  return {
    ...current,
    onboarding_v2: {
      ...onboardingV2,
      plan_type_classification: classification,
    },
  };
}

async function loadClassificationContext(
  admin: SupabaseClient,
  userId: string,
  transformationId: string,
): Promise<ClassificationContext> {
  const { data: transformationData, error: transformationError } = await admin
    .from("user_transformations")
    .select("*")
    .eq("id", transformationId)
    .maybeSingle();

  if (transformationError) {
    throw new ClassifyPlanTypeV1Error(500, "Failed to load transformation", {
      cause: transformationError,
    });
  }
  if (!transformationData) {
    throw new ClassifyPlanTypeV1Error(404, "Transformation not found");
  }

  const transformation = transformationData as UserTransformationRow;
  const { data: cycleData, error: cycleError } = await admin
    .from("user_cycles")
    .select("*")
    .eq("id", transformation.cycle_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (cycleError) {
    throw new ClassifyPlanTypeV1Error(500, "Failed to load cycle", {
      cause: cycleError,
    });
  }
  if (!cycleData) {
    throw new ClassifyPlanTypeV1Error(404, "Cycle not found for this user");
  }

  return {
    cycle: cycleData as UserCycleRow,
    transformation,
  };
}

function getSupabaseEnv(): {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
} {
  const url = String(Deno.env.get("SUPABASE_URL") ?? "").trim();
  const anonKey = String(Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
  const serviceRoleKey = String(
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  ).trim();

  if (!url || !anonKey || !serviceRoleKey) {
    throw new ClassifyPlanTypeV1Error(
      500,
      "Supabase environment variables are not configured",
    );
  }

  return { url, anonKey, serviceRoleKey };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

const PLAN_TYPE_CLASSIFICATION_SYSTEM_PROMPT =
  `You classify Sophia onboarding transformations into a broad plan type.

Choose the single best primary type_key among:
- addiction_compulsion
- sleep_recovery
- physical_fitness
- emotional_regulation
- grief_repair
- relationships_social
- confidence_identity
- career_positioning
- money_stability
- project_creation_business

Your job is not to produce the plan itself.
Your job is to produce guidance that will help a later plan-generation model.

Rules:
- Return exactly one primary type_key.
- Use the summaries plus questionnaire answers.
- Keep the output pragmatic and product-oriented.
- Prefer broad types over niche labels.
- duration_guidance must stay within 1..4 months for the current transformation.
- transformation_length_level must be an integer from 1 to 6.
- recommended_phase_count must stay within 2..12 phases.
- intensity_profile must express how intense or gradual the plan should feel for this specific user.
- Use intensity_profile and questionnaire signals to decide where this user sits inside the plausible duration range.
- Prefer plans that fit in 1..3 months.
- Use 4 months only when the objective is too large to treat proprely in 3 months.
- If even 4 months would create a blurry or overloaded transformation, switch to a journey_strategy.mode = "two_transformations".
- Never recommend more than 2 transformations.
- Default to "single_transformation" when the problem stays on one dominant axis, one dominant success indicator, and one coherent behavior-change logic, even if the issue has existed for years.
- Do NOT choose "two_transformations" only because the user says the issue is old, deeply rooted, emotionally painful, or will probably take time.
- A long-standing sleep problem usually remains "single_transformation": the plan can progress in phases inside one transformation instead of being split into two separate transformations.
- More generally, if phase 1 and phase 2 still serve the same core outcome with the same dominant metric, keep one transformation.
- Choose "two_transformations" only when one transformation would become structurally blurry because it would need two clearly different rebuilds, two different dominant metrics, or two different success states that should be completed sequentially.
- journey_strategy.rationale must be personalized to this user and explain explicitly why the split is useful.
- If journey_strategy.mode = "two_transformations", transformation_1_title / goal and transformation_2_title / goal must be concrete, explicit and clearly linked to the final success indicator.
- If journey_strategy.mode = "two_transformations", you must also return split_metric_guidance with a measurable start and target for EACH transformation.
- In split_metric_guidance, transformation_1 must describe the first visible tranche only, with an intermediate target that is ambitious but realistic before the final target.
- In split_metric_guidance, transformation_2 must start from where transformation_1 ends and point toward the final objective.
- If journey_strategy.mode = "two_transformations", total_estimated_duration_months must stay within 4..8.
- If journey_strategy.mode = "two_transformations", split_metric_guidance must use exactly:
  - metric_label
  - transformation_1.baseline_text
  - transformation_1.target_text
  - transformation_1.success_definition
  - transformation_2.baseline_text
  - transformation_2.target_text
  - transformation_2.success_definition
- Do not use alternative keys such as metric, start_value, or target_value.
- If the metric is numeric, make the target_text concrete and user-facing (example: "95 kg"), not vague.
- If the metric is not numeric, still make each transformation's success_definition concrete and measurable in plain language.
- Keep phase 2 realistic and baby-step friendly when the user looks fragile, discouraged, overloaded or inconsistent.
- Prefer fewer phases when the problem can be solved with a short focused sequence, and more phases only when the transformation clearly needs a longer rebuild.
- Examples that should usually stay "single_transformation":
  - sleep onset / insomnia / irregular sleep, even if chronic: one sleep recovery transformation with internal phases
  - reduce rumination at bedtime and improve sleep onset: still one sleep transformation, not two
  - rebuild confidence in social situations: one transformation unless another truly separate axis exists
- Examples that can justify "two_transformations":
  - lose 30 kg: first tranche to create adherence and meaningful early loss, second tranche to complete and stabilize
  - depression / burnout / very degraded functioning over years: first rebuild basic stability and daily functioning, second rebuild expansion / projection / consolidation
  - a user trying to solve both a major addiction and a separate relationship repair at the same time: two distinct transformations rather than one blurred journey
- confidence is a float between 0 and 1.
- plan_style, recommended_metrics, framing_to_avoid, first_steps_examples must be concrete and specific enough to guide plan generation.
- Do not output markdown. Output JSON only.

Return this JSON shape exactly:
{
  "type_key": "sleep_recovery",
  "confidence": 0.88,
  "duration_guidance": {
    "min_months": 1,
    "default_months": 2,
    "max_months": 4
  },
  "transformation_length_level": 3,
  "recommended_phase_count": {
    "min": 3,
    "max": 4
  },
  "intensity_profile": {
    "pace": "steady",
    "rationale": "Le user a besoin d'un vrai mouvement mais sans surcharge initiale."
  },
  "journey_strategy": {
    "mode": "single_transformation",
    "rationale": "L'objectif peut rester lisible et tenable dans une seule transformation sans perdre en clarté.",
    "total_estimated_duration_months": 3,
    "transformation_1_title": "Retrouver un rythme de sommeil plus stable",
    "transformation_1_goal": "Créer un réveil plus régulier et avancer progressivement vers l'heure cible.",
    "transformation_2_title": null,
    "transformation_2_goal": null
  },
  "split_metric_guidance": null,
  "sequencing_notes": [
    "Commencer par un premier palier tres accessible.",
    "Monter progressivement la charge seulement apres adhesion."
  ],
  "plan_style": ["apaiser", "reguler", "recaler_progressivement"],
  "recommended_metrics": ["heure moyenne d'endormissement"],
  "framing_to_avoid": ["forcer le sommeil"],
  "first_steps_examples": ["reduire la stimulation tardive"]
}

If you choose "two_transformations", the split_metric_guidance block must instead look like:
{
  "metric_label": "Body weight",
  "transformation_1": {
    "baseline_text": "105 kg",
    "target_text": "95 kg",
    "success_definition": "Reach 95 kg with stable anti-snacking habits."
  },
  "transformation_2": {
    "baseline_text": "95 kg",
    "target_text": "80 kg",
    "success_definition": "Reach 80 kg and stabilize the new lifestyle."
  }
}`;
