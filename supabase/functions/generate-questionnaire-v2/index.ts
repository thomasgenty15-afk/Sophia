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
import {
  buildQuestionnaireUserPrompt,
  QUESTIONNAIRE_SYSTEM_PROMPT,
  type QuestionnaireMeasurementHints,
  type QuestionnaireSchemaV2,
} from "../_shared/v2-prompts/questionnaire.ts";
import { logV2Event, V2_EVENT_TYPES } from "../_shared/v2-events.ts";
import type {
  UserCycleRow,
  UserTransformationRow,
} from "../_shared/v2-types.ts";

const REQUEST_SCHEMA = z.object({
  transformation_id: z.string().uuid(),
});

const QUESTIONNAIRE_SCHEMA = z.object({
  version: z.union([z.literal(1), z.number()]).transform(() => 1 as const),
  transformation_id: z.string().optional().default(""),
  questions: z.array(z.object({
    id: z.string().min(1),
    kind: z.enum(["single_choice", "multiple_choice", "number", "text", "time"]),
    question: z.string().min(1),
    helper_text: z.string().nullable().optional().default(null),
    required: z.boolean().optional().default(true),
    capture_goal: z.string().optional().default(""),
    options: z.array(
      z.union([
        z.object({ id: z.string().min(1), label: z.string().min(1) }),
        z.string().min(1).transform((s, ctx) => ({
          id: s.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "").slice(0, 40) ||
            `opt_${ctx.path[ctx.path.length - 1]}`,
          label: s,
        })),
      ])
    ).max(8).optional().default([]),
    allow_other: z.boolean().optional().default(false),
    placeholder: z.string().nullable().optional().default(null),
    max_selections: z.number().int().min(1).nullable().optional().default(null),
    unit: z.string().nullable().optional().default(null),
    suggested_value: z.number().finite().nullable().optional().default(null),
    min_value: z.number().finite().nullable().optional().default(null),
    max_value: z.number().finite().nullable().optional().default(null),
  })).length(12),
  metadata: z.object({
    design_principle: z.string().optional().default("court_adapte_utile_et_mesurable"),
    measurement_hints: z.object({
      metric_key: z.string().min(1),
      metric_label: z.string().min(1),
      unit: z.string().nullable().optional().default(null),
      direction: z.enum(["increase", "decrease", "reach_zero", "stabilize"]),
      measurement_mode: z.enum(["absolute_value", "count", "frequency", "duration", "score"]),
      baseline_prompt: z.string().min(1),
      target_prompt: z.string().min(1),
      suggested_target_value: z.number().finite().nullable().optional().default(null),
      rationale: z.string().min(1),
      confidence: z.number().min(0).max(1),
    }),
  }).passthrough().optional().default({
    design_principle: "court_adapte_utile_et_mesurable",
    measurement_hints: {
      metric_key: "weekly_aligned_days",
      metric_label: "Jours alignés par semaine",
      unit: "jours/semaine",
      direction: "increase",
      measurement_mode: "frequency",
      baseline_prompt: "Aujourd'hui, combien de jours alignés vis-tu en moyenne par semaine ?",
      target_prompt: "À combien de jours alignés par semaine veux-tu arriver ?",
      suggested_target_value: null,
      rationale: "Métrique de fallback utilisée quand la transformation n'est pas assez précise.",
      confidence: 0.3,
    },
  }),
});

type QuestionnaireContext = {
  cycle: UserCycleRow;
  transformation: UserTransformationRow;
};

class GenerateQuestionnaireV2Error extends Error {
  status: number;

  constructor(status: number, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "GenerateQuestionnaireV2Error";
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
      req.headers.get("Authorization") ?? req.headers.get("authorization") ??
        "",
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
    const { data: authData, error: authError } = await userClient.auth
      .getUser();
    if (authError || !authData?.user) {
      return jsonResponse(
        req,
        { error: "Unauthorized", request_id: requestId },
        { status: 401 },
      );
    }

    const userId = authData.user.id;
    const admin = createClient(env.url, env.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const result = await generateQuestionnaireV2({
      admin,
      requestId,
      userId,
      transformationId: parsedBody.data.transformation_id,
    });

    return jsonResponse(req, {
      request_id: requestId,
      transformation_id: result.transformation.id,
      cycle_id: result.cycle.id,
      cycle_status: result.cycle.status,
      schema: result.schema,
      questions: result.schema.questions,
      event_warnings: result.eventWarnings,
    });
  } catch (error) {
    const ctx = getRequestContext(req);
    await logEdgeFunctionError({
      functionName: "generate-questionnaire-v2",
      error,
      requestId,
      userId: ctx.userId,
      source: "edge",
      metadata: { route: "generate-questionnaire-v2" },
    });

    if (error instanceof GenerateQuestionnaireV2Error) {
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

    return serverError(req, requestId, "Failed to generate questionnaire");
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}

export async function generateQuestionnaireV2(params: {
  admin: SupabaseClient;
  requestId: string;
  userId: string;
  transformationId: string;
}): Promise<{
  cycle: UserCycleRow;
  transformation: UserTransformationRow;
  schema: QuestionnaireSchemaV2;
  eventWarnings: string[];
}> {
  const now = new Date().toISOString();
  const context = await loadQuestionnaireContext(
    params.admin,
    params.userId,
    params.transformationId,
  );
  assertQuestionnairePreconditions(context);

  const eventWarnings: string[] = [];
  const questionnaireContext = extractQuestionnaireContext(
    context.transformation.handoff_payload,
  );

  const rawSchema = await generateQuestionnaireWithLlm({
    requestId: params.requestId,
    userId: params.userId,
    transformation: context.transformation,
    questionnaireContext,
  });
  const schema = parseQuestionnaireSchema(
    rawSchema,
    context.transformation,
  );

  const transformationPatch = {
    questionnaire_schema: schema as unknown as Record<string, unknown>,
    updated_at: now,
  } satisfies Partial<UserTransformationRow>;
  const { error: updateTransformationError } = await params.admin
    .from("user_transformations")
    .update(transformationPatch as any)
    .eq("id", context.transformation.id);
  if (updateTransformationError) {
    throw new GenerateQuestionnaireV2Error(
      500,
      "Failed to persist questionnaire schema",
      { cause: updateTransformationError },
    );
  }

  const cyclePatch = {
    status: "questionnaire_in_progress",
    updated_at: now,
  } satisfies Partial<UserCycleRow>;
  const { error: updateCycleError } = await params.admin
    .from("user_cycles")
    .update(cyclePatch as any)
    .eq("id", context.cycle.id);
  if (updateCycleError) {
    throw new GenerateQuestionnaireV2Error(
      500,
      "Failed to update cycle questionnaire status",
      { cause: updateCycleError },
    );
  }

  try {
    await logV2Event(params.admin, V2_EVENT_TYPES.CYCLE_PRIORITIZED, {
      user_id: params.userId,
      cycle_id: context.cycle.id,
      transformation_id: context.transformation.id,
      reason: "questionnaire_generated",
      metadata: {
        source: "generate-questionnaire-v2",
        question_count: schema.questions.length,
        cycle_status: "questionnaire_in_progress",
      },
    });
  } catch (error) {
    eventWarnings.push(eventWarning(V2_EVENT_TYPES.CYCLE_PRIORITIZED, error));
  }

  return {
    cycle: { ...context.cycle, ...cyclePatch },
    transformation: { ...context.transformation, ...transformationPatch },
    schema,
    eventWarnings,
  };
}

export async function generateQuestionnaireDraft(params: {
  requestId: string;
  userId?: string | null;
  transformationId: string;
  title: string;
  internalSummary: string;
  userSummary: string;
  questionnaireContext: string[];
  existingAnswers?: Record<string, unknown>;
}): Promise<QuestionnaireSchemaV2> {
  const rawSchema = await generateQuestionnaireWithLlm({
    requestId: params.requestId,
    userId: params.userId ?? null,
    transformation: {
      id: params.transformationId,
      title: params.title,
      internal_summary: params.internalSummary,
      user_summary: params.userSummary,
      questionnaire_answers: params.existingAnswers ?? {},
    } as UserTransformationRow,
    questionnaireContext: params.questionnaireContext,
  });

  return parseQuestionnaireSchema(rawSchema, {
    id: params.transformationId,
    title: params.title,
    internal_summary: params.internalSummary,
    user_summary: params.userSummary,
  } as UserTransformationRow);
}

async function loadQuestionnaireContext(
  admin: SupabaseClient,
  userId: string,
  transformationId: string,
): Promise<QuestionnaireContext> {
  const { data: transformationData, error: transformationError } = await admin
    .from("user_transformations")
    .select("*")
    .eq("id", transformationId)
    .maybeSingle();
  if (transformationError) {
    throw new GenerateQuestionnaireV2Error(
      500,
      "Failed to load transformation",
      { cause: transformationError },
    );
  }
  if (!transformationData) {
    throw new GenerateQuestionnaireV2Error(404, "Transformation not found");
  }

  const transformation = transformationData as UserTransformationRow;
  const { data: cycleData, error: cycleError } = await admin
    .from("user_cycles")
    .select("*")
    .eq("id", transformation.cycle_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (cycleError) {
    throw new GenerateQuestionnaireV2Error(500, "Failed to load cycle", {
      cause: cycleError,
    });
  }
  if (!cycleData) {
    throw new GenerateQuestionnaireV2Error(
      404,
      "Cycle not found for this user",
    );
  }

  return {
    cycle: cycleData as UserCycleRow,
    transformation,
  };
}

function assertQuestionnairePreconditions(context: QuestionnaireContext): void {
  if (
    !["prioritized", "questionnaire_in_progress"].includes(context.cycle.status)
  ) {
    throw new GenerateQuestionnaireV2Error(
      409,
      `Cycle status ${context.cycle.status} cannot generate a questionnaire`,
    );
  }

  if (
    !["ready", "pending"].includes(context.transformation.status)
  ) {
    throw new GenerateQuestionnaireV2Error(
      409,
      `Transformation status ${context.transformation.status} cannot generate a questionnaire`,
    );
  }

  if (
    isRecord(context.transformation.questionnaire_answers) &&
    Object.keys(context.transformation.questionnaire_answers).length > 0
  ) {
    throw new GenerateQuestionnaireV2Error(
      409,
      "Questionnaire answers already exist for this transformation",
    );
  }
}

async function generateQuestionnaireWithLlm(params: {
  requestId: string;
  userId: string | null;
  transformation: UserTransformationRow;
  questionnaireContext: string[];
}): Promise<string> {
  const raw = await generateWithGemini(
    QUESTIONNAIRE_SYSTEM_PROMPT,
    buildQuestionnaireUserPrompt({
      transformation_id: params.transformation.id,
      title: cleanRequiredText(
        params.transformation.title,
        "transformation.title",
      ),
      internal_summary: cleanRequiredText(
        params.transformation.internal_summary,
        "transformation.internal_summary",
      ),
      user_summary: cleanRequiredText(
        params.transformation.user_summary,
        "transformation.user_summary",
      ),
      questionnaire_context: params.questionnaireContext,
      existing_answers: isRecord(params.transformation.questionnaire_answers)
        ? params.transformation.questionnaire_answers
        : {},
    }),
    0.35,
    true,
    [],
    "auto",
    {
      requestId: `${params.requestId}:generate-questionnaire-v2`,
      source: "generate-questionnaire-v2",
      ...(params.userId ? { userId: params.userId } : {}),
      model: "gemini-3-flash-preview",
      fallbackModel: "gpt-5.4-mini",
      secondFallbackModel: "gpt-5.4-nano",
      maxRetries: 1,
      httpTimeoutMs: 45_000,
      forceInitialModel: true,
      disableFallbackChain: false,
    },
  );

  if (typeof raw !== "string") {
    throw new GenerateQuestionnaireV2Error(
      500,
      "LLM returned a tool call instead of questionnaire JSON",
    );
  }

  return raw;
}

function parseQuestionnaireSchema(
  raw: string,
  transformation: UserTransformationRow,
): QuestionnaireSchemaV2 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error("[generate-questionnaire-v2] JSON.parse failed. raw preview:", raw.slice(0, 300));
    throw new GenerateQuestionnaireV2Error(500, "LLM returned invalid JSON", {
      cause: error,
    });
  }

  const result = QUESTIONNAIRE_SCHEMA.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((issue) =>
      `${issue.path.join(".") || "root"}: ${issue.message}`
    );
    console.error(
      "[generate-questionnaire-v2] Zod validation failed:",
      issues.join("; "),
      "| keys:",
      parsed && typeof parsed === "object" ? Object.keys(parsed as object).join(", ") : String(parsed).slice(0, 100),
    );
    throw new GenerateQuestionnaireV2Error(
      500,
      `Questionnaire output failed validation: ${issues.join("; ")}`,
    );
  }

  const fallbackMeasurementHints = inferMeasurementHintsFromTransformation(transformation);

  const schema = {
    ...result.data,
    transformation_id: transformation.id,
    metadata: {
      ...result.data.metadata,
      design_principle: "court_adapte_utile_et_mesurable",
      measurement_hints: normalizeMeasurementHints(
        result.data.metadata.measurement_hints,
        fallbackMeasurementHints,
      ),
    },
  } as QuestionnaireSchemaV2;

  const seenQuestionIds = new Set<string>();
  schema.questions = schema.questions.map((question, idx) => {
    let id = question.id;
    if (seenQuestionIds.has(id)) {
      id = `${id}_${idx}`;
      console.warn(`[generate-questionnaire-v2] Duplicate question id renamed to ${id}`);
    }
    seenQuestionIds.add(id);
    return { ...question, id };
  });

  schema.questions = schema.questions.map((question) => normalizeQuestion(question));

  if (schema.questions.length !== 12) {
    throw new GenerateQuestionnaireV2Error(
      500,
      `Questionnaire must contain exactly 12 questions, received ${schema.questions.length}`,
    );
  }

  const requiredSystemIds = [
    "sys_q1",
    "sys_q2",
    "sys_q3",
    "sys_q4",
    "sys_q5",
    "sys_q6",
    "sys_q7",
    "sys_q8",
    "sys_q9",
  ];
  const missingSystemIds = requiredSystemIds.filter((id) =>
    !schema.questions.some((question) => question.id === id)
  );
  if (missingSystemIds.length > 0) {
    throw new GenerateQuestionnaireV2Error(
      500,
      `Questionnaire missing mandatory system questions: ${missingSystemIds.join(", ")}`,
    );
  }

  const customQuestions = schema.questions.filter((question) => !question.id.startsWith("sys_q"));
  if (customQuestions.length !== 3) {
    throw new GenerateQuestionnaireV2Error(
      500,
      `Questionnaire must contain exactly 3 custom questions, received ${customQuestions.length}`,
    );
  }

  const byId = new Map(schema.questions.map((question) => [question.id, question] as const));
  const measurementHints = schema.metadata.measurement_hints;
  const orderedQuestions = [
    normalizeProbableDriversQuestion(byId.get("sys_q1")),
    normalizeMetricBaselineQuestion(byId.get("sys_q2"), measurementHints),
    normalizeMetricTargetQuestion(byId.get("sys_q3"), measurementHints),
    ...customQuestions.slice(0, 3).map((question, index) => normalizeCustomQuestion(question, index + 1)),
    normalizeMainBlockerQuestion(byId.get("sys_q4")),
    normalizeSubjectiveSuccessQuestion(byId.get("sys_q5"), transformation, measurementHints),
    normalizeStruggleDurationQuestion(byId.get("sys_q6"), transformation),
    normalizeDifficultyQuestion(byId.get("sys_q7")),
    normalizeExistingEffortsQuestion(byId.get("sys_q8"), transformation),
    normalizeOpenContextQuestion(byId.get("sys_q9")),
  ];

  const actualOrder = orderedQuestions.map((question) => question.id);
  const expectedOrder = [
    "sys_q1",
    "sys_q2",
    "sys_q3",
    "q1",
    "q2",
    "q3",
    "sys_q4",
    "sys_q5",
    "sys_q6",
    "sys_q7",
    "sys_q8",
    "sys_q9",
  ];
  if (actualOrder.join(",") !== expectedOrder.join(",")) {
    throw new GenerateQuestionnaireV2Error(500, "Questionnaire order normalization failed");
  }

  const successDefinitionQuestion = orderedQuestions.find((question) => question.id === "sys_q5");
  if (!successDefinitionQuestion || !successDefinitionQuestion.allow_other) {
    throw new GenerateQuestionnaireV2Error(
      500,
      "The success-definition question must allow an 'Autre' answer",
    );
  }

  schema.questions = orderedQuestions;
  return schema;
}

function normalizeQuestion(question: QuestionnaireSchemaV2["questions"][number]) {
  if (question.kind === "number") {
    return {
      ...question,
      options: [],
      allow_other: false,
      max_selections: null,
      unit: question.unit ?? null,
      suggested_value: question.suggested_value ?? null,
      min_value: question.min_value ?? null,
      max_value: question.max_value ?? null,
      placeholder: question.placeholder?.trim() || "Entre une valeur numerique concrete",
    };
  }

  if (question.kind === "time") {
    return {
      ...question,
      options: [],
      allow_other: false,
      max_selections: null,
      unit: null,
      suggested_value: null,
      min_value: null,
      max_value: null,
      placeholder: question.placeholder?.trim() || "Choisis une heure",
    };
  }

  if (question.kind === "text") {
    return {
      ...question,
      options: [],
      allow_other: false,
      max_selections: null,
      unit: null,
      suggested_value: null,
      min_value: null,
      max_value: null,
      placeholder: question.placeholder?.trim() || "Ecris ici ta reponse",
    };
  }

  const normalizedOptions = question.options.slice(0, 6);
  const safeOptions = normalizedOptions.length >= 2
    ? normalizedOptions
    : [
      { id: "opt_a", label: "Oui" },
      { id: "opt_b", label: "Non" },
    ];
  const maxSelections = question.kind === "multiple_choice"
    ? Math.min(
      Math.max(question.max_selections ?? 2, 2),
      Math.min(3, safeOptions.length),
    )
    : null;

  return {
    ...question,
    options: safeOptions,
    max_selections: maxSelections,
    unit: null,
    suggested_value: null,
    min_value: null,
    max_value: null,
  };
}

function normalizeMeasurementHints(
  candidate: QuestionnaireMeasurementHints | undefined,
  fallback: QuestionnaireMeasurementHints,
): QuestionnaireMeasurementHints {
  if (!candidate) return sanitizeMeasurementHints(fallback);
  return sanitizeMeasurementHints({
    metric_key: cleanText(candidate.metric_key) || fallback.metric_key,
    metric_label: cleanText(candidate.metric_label) || fallback.metric_label,
    unit: cleanOptionalText(candidate.unit) ?? fallback.unit,
    direction: candidate.direction,
    measurement_mode: candidate.measurement_mode,
    baseline_prompt: cleanText(candidate.baseline_prompt) || fallback.baseline_prompt,
    target_prompt: cleanText(candidate.target_prompt) || fallback.target_prompt,
    suggested_target_value:
      Number.isFinite(Number(candidate.suggested_target_value))
        ? Number(candidate.suggested_target_value)
        : fallback.suggested_target_value,
    rationale: cleanText(candidate.rationale) || fallback.rationale,
    confidence: typeof candidate.confidence === "number" ? candidate.confidence : fallback.confidence,
  });
}

function sanitizeMeasurementHints(
  hints: QuestionnaireMeasurementHints,
): QuestionnaireMeasurementHints {
  const metricKey = hints.metric_key.toLowerCase();
  const metricLabel = hints.metric_label.toLowerCase();
  const unit = (hints.unit ?? "").toLowerCase();

  let suggestedTargetValue = hints.suggested_target_value;

  const zeroTargetIsInvalidForAbsoluteDecrease =
    suggestedTargetValue === 0 &&
    hints.measurement_mode === "absolute_value" &&
    hints.direction === "decrease";

  const zeroTargetIsInvalidForIncreaseMetric =
    suggestedTargetValue === 0 &&
    hints.direction === "increase";

  const zeroTargetIsInvalidForWeightMetric =
    suggestedTargetValue === 0 &&
    (metricKey.includes("weight") ||
      metricLabel.includes("poids") ||
      unit === "kg");

  if (
    zeroTargetIsInvalidForAbsoluteDecrease ||
    zeroTargetIsInvalidForIncreaseMetric ||
    zeroTargetIsInvalidForWeightMetric
  ) {
    suggestedTargetValue = null;
  }

  return {
    ...hints,
    suggested_target_value: suggestedTargetValue,
  };
}

function normalizeProbableDriversQuestion(
  question: QuestionnaireSchemaV2["questions"][number] | undefined,
): QuestionnaireSchemaV2["questions"][number] {
  return {
    ...(question ?? baseChoiceQuestion("sys_q1", "multiple_choice", "_system_probable_drivers")),
    id: "sys_q1",
    kind: "multiple_choice",
    question: cleanText(question?.question) ||
      "Qu'est-ce qui semble le plus alimenter ce sujet aujourd'hui ?",
    helper_text: cleanOptionalText(question?.helper_text),
    required: true,
    capture_goal: "_system_probable_drivers",
    options: ensureOptionSet(question?.options, [
      "Des habitudes deja installees",
      "La charge mentale ou le stress",
      "La fatigue ou le manque d'energie",
      "L'environnement quotidien",
    ]),
    allow_other: question?.allow_other ?? true,
    placeholder: question?.placeholder ?? "Precise si un autre facteur semble dominant",
    max_selections: 2,
    unit: null,
    suggested_value: null,
    min_value: null,
    max_value: null,
  };
}

function normalizeMetricBaselineQuestion(
  question: QuestionnaireSchemaV2["questions"][number] | undefined,
  hints: QuestionnaireMeasurementHints,
): QuestionnaireSchemaV2["questions"][number] {
  return {
    ...(question ?? baseChoiceQuestion("sys_q2", "number", "_system_metric_baseline")),
    id: "sys_q2",
    kind: "number",
    question: hints.baseline_prompt,
    helper_text: `Metrice choisie automatiquement : ${hints.metric_label}.`,
    required: true,
    capture_goal: "_system_metric_baseline",
    options: [],
    allow_other: false,
    placeholder: buildNumericPlaceholder(hints.unit),
    max_selections: null,
    unit: hints.unit,
    suggested_value: null,
    min_value: 0,
    max_value: null,
  };
}

function normalizeMetricTargetQuestion(
  question: QuestionnaireSchemaV2["questions"][number] | undefined,
  hints: QuestionnaireMeasurementHints,
): QuestionnaireSchemaV2["questions"][number] {
  return {
    ...(question ?? baseChoiceQuestion("sys_q3", "number", "_system_metric_target")),
    id: "sys_q3",
    kind: "number",
    question: hints.target_prompt,
    helper_text: hints.suggested_target_value != null
      ? `Sophia te propose ${hints.suggested_target_value}${hints.unit ? ` ${hints.unit}` : ""} comme suggestion initiale, que tu peux corriger.`
      : `Entre la cible numerique la plus juste pour ${hints.metric_label.toLowerCase()}.`,
    required: true,
    capture_goal: "_system_metric_target",
    options: [],
    allow_other: false,
    placeholder: buildNumericPlaceholder(hints.unit),
    max_selections: null,
    unit: hints.unit,
    suggested_value: hints.suggested_target_value,
    min_value: 0,
    max_value: null,
  };
}

function normalizeCustomQuestion(
  question: QuestionnaireSchemaV2["questions"][number],
  index: number,
): QuestionnaireSchemaV2["questions"][number] {
  const normalized = normalizeQuestion(question);
  const preferredKind = normalized.kind === "single_choice" ? "multiple_choice" : normalized.kind;
  return {
    ...normalized,
    id: `q${index}`,
    kind: preferredKind,
    max_selections: preferredKind === "multiple_choice"
      ? Math.min(Math.max(normalized.max_selections ?? 2, 2), Math.min(3, normalized.options.length))
      : normalized.max_selections,
  };
}

function normalizeMainBlockerQuestion(
  question: QuestionnaireSchemaV2["questions"][number] | undefined,
): QuestionnaireSchemaV2["questions"][number] {
  return {
    ...(question ?? baseChoiceQuestion("sys_q4", "multiple_choice", "_system_main_blocker")),
    id: "sys_q4",
    kind: "multiple_choice",
    question: cleanText(question?.question) || "Quels blocages te freinent le plus aujourd'hui ?",
    helper_text: cleanOptionalText(question?.helper_text),
    required: true,
    capture_goal: "_system_main_blocker",
    options: ensureOptionSet(question?.options, [
      "Je manque de cadre clair",
      "Je decroche vite quand c'est difficile",
      "Mon environnement me tire en arriere",
      "Je manque d'elan pour agir",
    ]),
    allow_other: question?.allow_other ?? true,
    placeholder: question?.placeholder ?? "Precise un autre blocage si besoin",
    max_selections: 2,
    unit: null,
    suggested_value: null,
    min_value: null,
    max_value: null,
  };
}

function normalizeSubjectiveSuccessQuestion(
  question: QuestionnaireSchemaV2["questions"][number] | undefined,
  transformation: UserTransformationRow,
  hints: QuestionnaireMeasurementHints,
): QuestionnaireSchemaV2["questions"][number] {
  const title = cleanText(transformation.title) || "ce sujet";
  return {
    ...(question ?? baseChoiceQuestion("sys_q5", "multiple_choice", "_system_priority_goal_subjective")),
    id: "sys_q5",
    kind: "multiple_choice",
    question: cleanText(question?.question) || "Au-dela du chiffre, à quoi verras-tu que cette transformation est vraiment reussie ?",
    helper_text: cleanOptionalText(question?.helper_text),
    required: true,
    capture_goal: "_system_priority_goal_subjective",
    options: ensureOptionSet(question?.options, [
      `Voir une vraie progression mesurable sur ${hints.metric_label.toLowerCase()}`,
      `Ne plus vivre ${title.toLowerCase()} comme un combat permanent`,
      "Retrouver une sensation durable de stabilite",
      "Me sentir solide et en confiance dans la duree",
    ]),
    allow_other: true,
    placeholder: question?.placeholder?.trim() ||
      "Autre (si ton critere de reussite ne se trouve pas dans les choix ci-dessus)",
    max_selections: 2,
    unit: null,
    suggested_value: null,
    min_value: null,
    max_value: null,
  };
}

function normalizeStruggleDurationQuestion(
  question: QuestionnaireSchemaV2["questions"][number] | undefined,
  transformation: UserTransformationRow,
): QuestionnaireSchemaV2["questions"][number] {
  const subject = cleanText(transformation.title) || "ce sujet";
  return {
    ...(question ?? baseChoiceQuestion("sys_q6", "single_choice", "_system_struggle_duration")),
    id: "sys_q6",
    kind: "single_choice",
    question: cleanText(question?.question) || `Depuis combien de temps ${subject.toLowerCase()} est un vrai sujet pour toi ?`,
    helper_text: cleanOptionalText(question?.helper_text),
    required: true,
    capture_goal: "_system_struggle_duration",
    options: ensureOptionSet(question?.options, [
      "Quelques semaines",
      "Quelques mois",
      "1-2 ans",
      "Plus de 3 ans",
      "Aussi loin que je me souvienne",
    ]),
    allow_other: false,
    placeholder: null,
    max_selections: null,
    unit: null,
    suggested_value: null,
    min_value: null,
    max_value: null,
  };
}

function normalizeDifficultyQuestion(
  question: QuestionnaireSchemaV2["questions"][number] | undefined,
): QuestionnaireSchemaV2["questions"][number] {
  return {
    ...(question ?? baseChoiceQuestion("sys_q7", "single_choice", "_system_perceived_difficulty")),
    id: "sys_q7",
    kind: "single_choice",
    question: cleanText(question?.question) || "À quel point ce sujet est difficile pour toi aujourd'hui ?",
    helper_text: cleanOptionalText(question?.helper_text),
    required: true,
    capture_goal: "_system_perceived_difficulty",
    options: ensureOptionSet(question?.options, [
      "Tres facile",
      "Plutot facile",
      "Moyennement difficile",
      "Difficile",
      "Tres difficile",
    ]),
    allow_other: false,
    placeholder: null,
    max_selections: null,
    unit: null,
    suggested_value: null,
    min_value: null,
    max_value: null,
  };
}

function normalizeExistingEffortsQuestion(
  question: QuestionnaireSchemaV2["questions"][number] | undefined,
  transformation: UserTransformationRow,
): QuestionnaireSchemaV2["questions"][number] {
  const subject = cleanText(transformation.title) || "ce sujet";
  return {
    ...(question ?? baseChoiceQuestion("sys_q8", "text", "_system_existing_efforts")),
    id: "sys_q8",
    kind: "text",
    question: cleanText(question?.question) ||
      `Qu'est-ce que tu as deja mis en place aujourd'hui, meme de facon imparfaite, pour essayer d'avancer sur ${subject.toLowerCase()} ?`,
    helper_text: cleanOptionalText(question?.helper_text) ||
      "Meme les essais partiels, irréguliers ou un peu bancals nous interessent.",
    required: false,
    capture_goal: "_system_existing_efforts",
    options: [],
    allow_other: false,
    placeholder: question?.placeholder?.trim() ||
      "Ex: routines, regles perso, essais deja testes, outils utilises, choses que tu fais parfois",
    max_selections: null,
    unit: null,
    suggested_value: null,
    min_value: null,
    max_value: null,
  };
}

function normalizeOpenContextQuestion(
  question: QuestionnaireSchemaV2["questions"][number] | undefined,
): QuestionnaireSchemaV2["questions"][number] {
  return {
    ...(question ?? baseChoiceQuestion("sys_q9", "text", "_system_open_context")),
    id: "sys_q9",
    kind: "text",
    question: "Derniere verif avant qu'on ferme le carnet d'enquete : est-ce qu'on a rate un truc important ?",
    helper_text: cleanOptionalText(question?.helper_text) ||
      "Un detail utile, une nuance, un caillou dans la chaussure : c'est le bon moment.",
    required: false,
    capture_goal: "_system_open_context",
    options: [],
    allow_other: false,
    placeholder: question?.placeholder?.trim() ||
      "Ajoute ici tout ce qui te semble important, meme si ca parait secondaire",
    max_selections: null,
    unit: null,
    suggested_value: null,
    min_value: null,
    max_value: null,
  };
}

function ensureOptionSet(
  options: Array<{ id: string; label: string }> | undefined,
  fallbackLabels: string[],
) {
  const source = Array.isArray(options) && options.length >= 2
    ? options.slice(0, 6)
    : fallbackLabels.map((label, index) => ({
      id: `opt_${index + 1}`,
      label,
    }));
  return source.map((option, index) => ({
    id: cleanText(option.id) || `opt_${index + 1}`,
    label: cleanText(option.label) || fallbackLabels[index] || `Option ${index + 1}`,
  }));
}

function baseChoiceQuestion(
  id: string,
  kind: "single_choice" | "multiple_choice" | "number" | "text" | "time",
  captureGoal: string,
): QuestionnaireSchemaV2["questions"][number] {
  return {
    id,
    kind,
    question: "",
    helper_text: null,
    required: true,
    capture_goal: captureGoal,
    options: [],
    allow_other: false,
    placeholder: null,
    max_selections: null,
    unit: null,
    suggested_value: null,
    min_value: null,
    max_value: null,
  };
}

function buildNumericPlaceholder(unit: string | null): string {
  return unit ? `Entre une valeur numerique en ${unit}` : "Entre une valeur numerique";
}

function inferMeasurementHintsFromTransformation(
  transformation: Pick<UserTransformationRow, "title" | "internal_summary" | "user_summary">,
): QuestionnaireMeasurementHints {
  const source = [
    cleanText(transformation.title),
    cleanText(transformation.internal_summary),
    cleanText(transformation.user_summary),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const build = (value: QuestionnaireMeasurementHints): QuestionnaireMeasurementHints => value;

  if (/(poids|kg|surpoids|surcharge pond|maigr|gross)/.test(source)) {
    return build({
      metric_key: "weight_kg",
      metric_label: "Poids",
      unit: "kg",
      direction: "decrease",
      measurement_mode: "absolute_value",
      baseline_prompt: "Quel est ton poids actuel ?",
      target_prompt: "Quel poids veux-tu atteindre ?",
      suggested_target_value: null,
      rationale: "Le poids en kg est la metrique la plus directe pour suivre cette transformation.",
      confidence: 0.94,
    });
  }
  if (/(depress|depression|episode depressif|humeur tres basse)/.test(source)) {
    return build({
      metric_key: "depressive_episodes_per_day",
      metric_label: "Episodes depressifs marques par jour",
      unit: "episodes/jour",
      direction: "reach_zero",
      measurement_mode: "count",
      baseline_prompt: "Aujourd'hui, combien d'episodes depressifs marques vis-tu en moyenne par jour ?",
      target_prompt: "A combien d'episodes depressifs marques par jour veux-tu arriver ?",
      suggested_target_value: 0,
      rationale: "Une frequence quotidienne d'episodes lourds donne une direction concrete et actionnable.",
      confidence: 0.88,
    });
  }
  if (/(sommeil|dorm|insomn|reveil|endorm)/.test(source)) {
    return build({
      metric_key: "good_nights_per_week",
      metric_label: "Nuits correctes par semaine",
      unit: "nuits/semaine",
      direction: "increase",
      measurement_mode: "frequency",
      baseline_prompt: "Aujourd'hui, combien de nuits correctes vis-tu en moyenne par semaine ?",
      target_prompt: "A combien de nuits correctes par semaine veux-tu arriver ?",
      suggested_target_value: 5,
      rationale: "Le nombre de bonnes nuits par semaine est plus exploitable qu'un ressenti flou sur le sommeil.",
      confidence: 0.9,
    });
  }
  if (/(procrast|report|evite|evitement|repousse tout)/.test(source)) {
    return build({
      metric_key: "deep_work_sessions_per_week",
      metric_label: "Sessions de travail profond par semaine",
      unit: "sessions/semaine",
      direction: "increase",
      measurement_mode: "frequency",
      baseline_prompt: "Aujourd'hui, combien de vraies sessions de travail profond fais-tu en moyenne par semaine ?",
      target_prompt: "A combien de sessions de travail profond par semaine veux-tu arriver ?",
      suggested_target_value: 5,
      rationale: "Une metrique de sessions utiles donne une direction concrete pour sortir de l'evitement.",
      confidence: 0.85,
    });
  }
  if (/(cigarette|tabac|fumer|fumee|nicotine)/.test(source)) {
    return build({
      metric_key: "cigarettes_per_day",
      metric_label: "Cigarettes par jour",
      unit: "cigarettes/jour",
      direction: "reach_zero",
      measurement_mode: "count",
      baseline_prompt: "Aujourd'hui, combien de cigarettes fumes-tu en moyenne par jour ?",
      target_prompt: "A combien de cigarettes par jour veux-tu arriver ?",
      suggested_target_value: 0,
      rationale: "Le nombre de cigarettes quotidiennes est la metrique la plus directe.",
      confidence: 0.95,
    });
  }
  if (/(alcool|boire|alcoolisation)/.test(source)) {
    return build({
      metric_key: "alcohol_units_per_week",
      metric_label: "Consommations d'alcool par semaine",
      unit: "verres/semaine",
      direction: "decrease",
      measurement_mode: "count",
      baseline_prompt: "Aujourd'hui, combien de verres d'alcool bois-tu en moyenne par semaine ?",
      target_prompt: "A combien de verres d'alcool par semaine veux-tu arriver ?",
      suggested_target_value: 0,
      rationale: "Une frequence hebdomadaire permet de mesurer une progression concrete.",
      confidence: 0.87,
    });
  }
  if (/(sport|course|muscu|entrainement|se remettre en forme|activite physique)/.test(source)) {
    return build({
      metric_key: "training_sessions_per_week",
      metric_label: "Seances par semaine",
      unit: "seances/semaine",
      direction: "increase",
      measurement_mode: "frequency",
      baseline_prompt: "Aujourd'hui, combien de vraies seances fais-tu en moyenne par semaine ?",
      target_prompt: "A combien de seances par semaine veux-tu arriver ?",
      suggested_target_value: 3,
      rationale: "Le nombre de seances hebdomadaires est une metrique simple et exploitable.",
      confidence: 0.86,
    });
  }
  if (/(epargne|argent|budget|dette|financ)/.test(source)) {
    return build({
      metric_key: "monthly_savings",
      metric_label: "Epargne mensuelle",
      unit: "euros/mois",
      direction: "increase",
      measurement_mode: "absolute_value",
      baseline_prompt: "Aujourd'hui, combien arrives-tu a epargner en moyenne par mois ?",
      target_prompt: "Combien veux-tu epargner par mois ?",
      suggested_target_value: null,
      rationale: "Une valeur mensuelle d'epargne donne un cap concret pour une transformation financiere.",
      confidence: 0.82,
    });
  }

  return build({
    metric_key: "aligned_days_per_week",
    metric_label: "Jours alignes par semaine",
    unit: "jours/semaine",
    direction: "increase",
    measurement_mode: "frequency",
    baseline_prompt: "Aujourd'hui, combien de jours alignes vis-tu en moyenne par semaine sur ce sujet ?",
    target_prompt: "A combien de jours alignes par semaine veux-tu arriver ?",
    suggested_target_value: 5,
    rationale: "Fallback comportemental quand aucune metrique plus evidente ne ressort clairement.",
    confidence: 0.55,
  });
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function cleanOptionalText(value: unknown): string | null {
  const cleaned = cleanText(value);
  return cleaned || null;
}

function extractQuestionnaireContext(
  handoffPayload: Record<string, unknown> | null,
): string[] {
  const onboardingCandidate = isRecord(handoffPayload)
    ? handoffPayload.onboarding_v2
    : null;
  const onboardingContext = isRecord(onboardingCandidate) &&
      Array.isArray(onboardingCandidate.questionnaire_context)
    ? onboardingCandidate.questionnaire_context.filter((item): item is string =>
      typeof item === "string" && item.trim().length > 0
    )
    : [];
  return [...new Set(onboardingContext)].filter((item): item is string =>
    typeof item === "string" && item.trim().length > 0
  );
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
    throw new GenerateQuestionnaireV2Error(500, "Server misconfigured");
  }

  return { url, anonKey, serviceRoleKey };
}

function cleanRequiredText(value: string | null, field: string): string {
  const cleaned = String(value ?? "").trim();
  if (!cleaned) {
    throw new GenerateQuestionnaireV2Error(400, `Missing required ${field}`);
  }
  return cleaned;
}

function eventWarning(eventType: string, error: unknown): string {
  return `Failed to log ${eventType}: ${
    error instanceof Error ? error.message : String(error)
  }`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
