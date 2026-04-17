import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "jsr:@supabase/supabase-js@2";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import { generateWithGemini, getGlobalAiModel } from "../_shared/gemini.ts";
import {
  extractOnboardingV2Payload,
  mergeProfessionalSupport,
  PROFESSIONAL_SUPPORT_CATALOG_DESCRIPTION,
  PROFESSIONAL_SUPPORT_KEYS,
} from "../_shared/professional-support.ts";
import {
  badRequest,
  jsonResponse,
  parseJsonBody,
  serverError,
  z,
} from "../_shared/http.ts";
import { getRequestContext } from "../_shared/request_context.ts";
import type {
  ProfessionalSupportKey,
  ProfessionalSupportV1,
  UserCycleRow,
  UserTransformationRow,
} from "../_shared/v2-types.ts";

const REQUEST_SCHEMA = z.object({
  transformation_id: z.string().uuid(),
});

const PROFESSIONAL_SUPPORT_KEY_ENUM = z.enum(
  PROFESSIONAL_SUPPORT_KEYS as [ProfessionalSupportKey, ...ProfessionalSupportKey[]],
);

const PROFESSIONAL_SUPPORT_SCHEMA = z.object({
  should_recommend: z.boolean(),
  recommendation_level: z.enum(["optional", "recommended"]),
  summary: z.string().min(1).max(320).nullable(),
  recommendations: z.array(z.object({
    key: PROFESSIONAL_SUPPORT_KEY_ENUM,
    reason: z.string().min(1).max(220),
  })).max(3),
}).superRefine((value, ctx) => {
  const uniqueKeys = new Set<string>();
  for (const recommendation of value.recommendations) {
    if (uniqueKeys.has(recommendation.key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Duplicate professional key ${recommendation.key}`,
        path: ["recommendations"],
      });
    }
    uniqueKeys.add(recommendation.key);
  }

  if (!value.should_recommend) {
    if (value.summary !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "summary must be null when should_recommend is false",
        path: ["summary"],
      });
    }
    if (value.recommendations.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "recommendations must be empty when should_recommend is false",
        path: ["recommendations"],
      });
    }
    return;
  }

  if (!value.summary) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "summary is required when should_recommend is true",
      path: ["summary"],
    });
  }
  if (value.recommendations.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "recommendations must contain at least one item when should_recommend is true",
      path: ["recommendations"],
    });
  }
});

type ClassificationContext = {
  cycle: UserCycleRow;
  transformation: UserTransformationRow;
};

class ClassifyProfessionalSupportV1Error extends Error {
  status: number;

  constructor(status: number, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ClassifyProfessionalSupportV1Error";
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

    const result = await classifyProfessionalSupportForTransformation({
      admin,
      requestId,
      userId: authData.user.id,
      transformationId: parsedBody.data.transformation_id,
    });

    return jsonResponse(req, {
      request_id: requestId,
      transformation_id: result.transformation.id,
      cycle_id: result.cycle.id,
      professional_support: result.professionalSupport,
    });
  } catch (error) {
    const ctx = getRequestContext(req);
    await logEdgeFunctionError({
      functionName: "classify-professional-support-v1",
      error,
      requestId,
      userId: ctx.userId,
      source: "edge",
      metadata: { route: "classify-professional-support-v1" },
    });

    if (error instanceof ClassifyProfessionalSupportV1Error) {
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

    return serverError(req, requestId, "Failed to classify professional support");
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}

export async function classifyProfessionalSupportForTransformation(params: {
  admin: SupabaseClient;
  requestId: string;
  userId: string;
  transformationId: string;
}): Promise<{
  cycle: UserCycleRow;
  transformation: UserTransformationRow;
  professionalSupport: ProfessionalSupportV1;
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
    throw new ClassifyProfessionalSupportV1Error(
      400,
      "Questionnaire answers are required before classifying professional support",
    );
  }

  const raw = await generateWithGemini(
    PROFESSIONAL_SUPPORT_SYSTEM_PROMPT,
    buildProfessionalSupportUserPrompt({
      cycle: context.cycle,
      transformation: context.transformation,
      questionnaireAnswers,
      questionnaireSchema,
    }),
    0.2,
    true,
    [],
    "auto",
    {
      requestId: `${params.requestId}:classify-professional-support-v1`,
      source: "classify-professional-support-v1",
      userId: params.userId,
      model: getGlobalAiModel(),
      maxRetries: 3,
      httpTimeoutMs: 90_000,
    },
  );

  if (typeof raw !== "string") {
    throw new ClassifyProfessionalSupportV1Error(
      500,
      "LLM returned an unsupported response while classifying professional support",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error("[classify-professional-support-v1][invalid-json]", {
      request_id: params.requestId,
      transformation_id: params.transformationId,
      raw,
      error_name: error instanceof Error ? error.name : "UnknownError",
      error_message: error instanceof Error ? error.message : String(error),
    });
    throw new ClassifyProfessionalSupportV1Error(
      500,
      "LLM returned invalid JSON for the professional support classification",
      { cause: error },
    );
  }

  parsed = normalizeProfessionalSupportCandidate(parsed);

  const validation = PROFESSIONAL_SUPPORT_SCHEMA.safeParse(parsed);
  if (!validation.success) {
    console.error("[classify-professional-support-v1][invalid-schema]", {
      request_id: params.requestId,
      transformation_id: params.transformationId,
      parsed,
      issues: validation.error.issues.map((issue) => ({
        path: issue.path,
        message: issue.message,
        code: issue.code,
      })),
    });
    throw new ClassifyProfessionalSupportV1Error(
      500,
      "LLM returned a professional support classification that failed schema validation",
    );
  }

  const professionalSupport = validation.data;
  const now = new Date().toISOString();
  const latestHandoffPayload = await loadLatestTransformationHandoffPayload({
    admin: params.admin,
    transformationId: context.transformation.id,
  });
  const nextHandoffPayload = mergeProfessionalSupport(
    latestHandoffPayload,
    professionalSupport,
  );

  const { data, error } = await params.admin
    .from("user_transformations")
    .update({
      handoff_payload: nextHandoffPayload as unknown as Record<string, unknown>,
      updated_at: now,
    } as any)
    .eq("id", context.transformation.id)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    console.error("[classify-professional-support-v1][persist-failed]", {
      request_id: params.requestId,
      transformation_id: params.transformationId,
      error,
      handoff_payload: nextHandoffPayload,
    });
    throw new ClassifyProfessionalSupportV1Error(
      500,
      "Failed to persist professional support classification",
      { cause: error },
    );
  }

  return {
    cycle: context.cycle,
    transformation: data as UserTransformationRow,
    professionalSupport,
  };
}

async function loadLatestTransformationHandoffPayload(args: {
  admin: SupabaseClient;
  transformationId: string;
}): Promise<UserTransformationRow["handoff_payload"]> {
  const { data, error } = await args.admin
    .from("user_transformations")
    .select("handoff_payload")
    .eq("id", args.transformationId)
    .maybeSingle();
  if (error) {
    throw new ClassifyProfessionalSupportV1Error(
      500,
      "Failed to reload transformation handoff payload",
      { cause: error },
    );
  }
  return (data as { handoff_payload?: Record<string, unknown> | null } | null)
    ?.handoff_payload ?? null;
}

function buildProfessionalSupportUserPrompt(input: {
  cycle: UserCycleRow;
  transformation: UserTransformationRow;
  questionnaireAnswers: Record<string, unknown>;
  questionnaireSchema: Record<string, unknown>;
}): string {
  const ageYears = calculateAgeFromBirthDate(input.cycle.birth_date_snapshot);
  const biologicalSexSnapshot = normalizeBiologicalSex(input.cycle.gender_snapshot);
  const profileLines = [
    ageYears != null ? `- Age years: ${ageYears}` : null,
    input.cycle.birth_date_snapshot
      ? `- Birth date snapshot: ${input.cycle.birth_date_snapshot}`
      : null,
    biologicalSexSnapshot
      ? `- Biological sex snapshot: ${biologicalSexSnapshot}`
      : null,
    input.cycle.gender_snapshot && !biologicalSexSnapshot
      ? `- Stored sex/gender raw value: ${input.cycle.gender_snapshot}`
      : null,
  ].filter(Boolean).join("\n");

  const onboardingV2 = extractOnboardingV2Payload(input.transformation.handoff_payload);

  return `## Transformation

- Title: ${String(input.transformation.title ?? "").trim() || "Untitled transformation"}
- Internal summary: ${input.transformation.internal_summary}
- User summary: ${input.transformation.user_summary}
- Success definition: ${String(input.transformation.success_definition ?? "").trim() || "Not provided"}
- Main constraint: ${String(input.transformation.main_constraint ?? "").trim() || "Not provided"}

## Profile

${profileLines || "- No profile snapshot"}

## Existing classification hints

${JSON.stringify({
    plan_type_classification: onboardingV2.plan_type_classification ?? null,
    questionnaire_context: onboardingV2.questionnaire_context ?? null,
  }, null, 2)}

## Questionnaire schema

${JSON.stringify(input.questionnaireSchema, null, 2)}

## Questionnaire answers

${JSON.stringify(input.questionnaireAnswers, null, 2)}

Return the JSON classification only.`;
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
    throw new ClassifyProfessionalSupportV1Error(500, "Failed to load transformation", {
      cause: transformationError,
    });
  }
  if (!transformationData) {
    throw new ClassifyProfessionalSupportV1Error(404, "Transformation not found");
  }

  const transformation = transformationData as UserTransformationRow;
  const { data: cycleData, error: cycleError } = await admin
    .from("user_cycles")
    .select("*")
    .eq("id", transformation.cycle_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (cycleError) {
    throw new ClassifyProfessionalSupportV1Error(500, "Failed to load cycle", {
      cause: cycleError,
    });
  }
  if (!cycleData) {
    throw new ClassifyProfessionalSupportV1Error(404, "Cycle not found for this user");
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
    throw new ClassifyProfessionalSupportV1Error(
      500,
      "Supabase environment variables are not configured",
    );
  }

  return { url, anonKey, serviceRoleKey };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

const PROFESSIONAL_SUPPORT_SYSTEM_PROMPT =
  `You classify whether a Sophia transformation would benefit from a stable recommendation to seek help from one or more professionals.

This is NOT triage, diagnosis, or emergency guidance.
Your goal is to produce a calm, product-safe recommendation block for the UI.

Available professional keys:
${PROFESSIONAL_SUPPORT_CATALOG_DESCRIPTION}

Rules:
- Recommend between 0 and 3 professionals.
- Only recommend a professional if there is a concrete reason tied to the transformation.
- Prefer precision over breadth.
- When age or biological sex is relevant to the recommendation, explicitly take into account the provided age_years and biological_sex_snapshot.
- For sex-specific professionals such as urologist, andrologist, gynecologist, midwife, fertility specialist, or pelvic floor physio, only recommend them when the transformation and profile context justify it.
- If the case does not clearly benefit from external professional help, return should_recommend=false.
- recommendation_level:
  - optional: could help but not central
  - recommended: likely to materially improve the user's chances
- summary must be short, concrete, and personalized to the transformation.
- Each recommendation.reason must explain why this professional is relevant in this specific case.
- Each recommendation object MUST use the property name "key" exactly.
- Never use "professional_key" or any other field name variant.
- Do not mention links, products, marketplaces, brands, or clinics.
- Do not mention emergencies, danger, crisis, or urgent warnings.
- Do not over-medicalize routine self-improvement topics.
- Output shape:
{
  "should_recommend": true,
  "recommendation_level": "recommended",
  "summary": "Short personalized summary",
  "recommendations": [
    {
      "key": "general_practitioner",
      "reason": "Concrete reason"
    }
  ]
}
- Return JSON only.`;

function normalizeProfessionalSupportCandidate(value: unknown): unknown {
  if (!isRecord(value) || !Array.isArray(value.recommendations)) {
    return value;
  }

  return {
    ...value,
    recommendations: value.recommendations.map((entry) => {
      if (!isRecord(entry)) return entry;

      const key = typeof entry.key === "string"
        ? entry.key
        : typeof entry.professional_key === "string"
        ? entry.professional_key
        : entry.key;

      return {
        ...entry,
        key,
      };
    }),
  };
}

function normalizeBiologicalSex(value: string | null): "male" | "female" | null {
  if (value === "male" || value === "female") return value;
  return null;
}

function calculateAgeFromBirthDate(birthDate: string | null): number | null {
  if (!birthDate) return null;

  const birth = new Date(`${birthDate}T00:00:00.000Z`);
  if (Number.isNaN(birth.getTime())) return null;

  const now = new Date();
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - birth.getUTCMonth();
  const dayDiff = now.getUTCDate() - birth.getUTCDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1;
  }
  return age >= 0 && age <= 120 ? age : null;
}
