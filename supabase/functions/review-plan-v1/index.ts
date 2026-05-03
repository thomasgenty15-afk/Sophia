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
  PlanAdjustmentContext,
  PlanAdjustmentScope,
  PlanContentV3,
  UserPlanV2Row,
  UserTransformationRow,
} from "../_shared/v2-types.ts";

const PLAN_REVIEW_THREAD_ENTRY_SCHEMA = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(4000),
});

const CURRENT_LEVEL_CONTEXT_SCHEMA = z.object({
  phase_id: z.string().trim().min(1),
  phase_order: z.number().int().min(1),
  title: z.string().trim().min(1).max(300),
  objective: z.string().trim().min(1).max(600),
});

const REQUEST_SCHEMA = z.object({
  review_id: z.string().uuid().optional(),
  transformation_id: z.string().uuid(),
  plan_id: z.string().uuid().optional(),
  scope: z.enum(["onboarding_preview", "active_plan"]),
  user_comment: z.string().trim().min(1).max(4000),
  prior_thread: z.array(PLAN_REVIEW_THREAD_ENTRY_SCHEMA).max(12).optional(),
  current_level_context: CURRENT_LEVEL_CONTEXT_SCHEMA.nullable().optional(),
  plan_content: z.unknown(),
});

const REVIEW_RESULT_SCHEMA = z.object({
  review_kind: z.enum([
    "clarification",
    "preference_change",
    "invalidating_fact",
  ]),
  adjustment_scope: z.enum([
    "current_level_only",
    "future_levels_only",
    "current_plus_future",
    "full_plan",
  ]),
  decision: z.enum([
    "no_change",
    "minor_adjustment",
    "partial_replan",
    "full_replan",
  ]),
  understanding: z.string().trim().min(1).max(600),
  impact: z.string().trim().min(1).max(600),
  user_change_summary: z.string().trim().min(1).max(900),
  proposed_changes: z.array(z.string().trim().min(1).max(300)).max(6),
  control_mode: z.enum([
    "clarify_only",
    "adjust_current_level",
    "adjust_future_levels",
    "advance_ready",
  ]),
  resistance_note: z.string().trim().min(1).max(400).nullable(),
  principle_reminder: z.string().trim().min(1).max(260).nullable(),
  offer_complete_level: z.boolean(),
  regeneration_feedback: z.string().trim().min(1).max(4000).nullable(),
  clarification_question: z.string().trim().min(1).max(300).nullable(),
});

type PlanReviewThreadEntry = z.infer<typeof PLAN_REVIEW_THREAD_ENTRY_SCHEMA>;
type PersistedPlanReviewThreadEntry = PlanReviewThreadEntry & { created_at: string };
type CurrentLevelContext = z.infer<typeof CURRENT_LEVEL_CONTEXT_SCHEMA>;
type ReviewResult = z.infer<typeof REVIEW_RESULT_SCHEMA>;
type ConversationMode =
  | "level_adjustment"
  | "plan_adjustment"
  | "explanation_chat"
  | "guardrail_chat";

type ReviewPlanSessionStatus =
  | "active"
  | "preview_ready"
  | "completed"
  | "expired"
  | "restarted";

type ReviewContext = {
  transformation: UserTransformationRow;
  plan: UserPlanV2Row | null;
};

class ReviewPlanV1Error extends Error {
  status: number;

  constructor(status: number, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ReviewPlanV1Error";
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

    const plan = parsePlanContent(parsedBody.data.plan_content);
    const admin = createClient(env.url, env.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const result = await reviewPlan({
      admin,
      requestId,
      userId: authData.user.id,
      reviewId: parsedBody.data.review_id ?? null,
      transformationId: parsedBody.data.transformation_id,
      planId: parsedBody.data.plan_id ?? null,
      scope: parsedBody.data.scope,
      userComment: parsedBody.data.user_comment,
      priorThread: parsedBody.data.prior_thread ?? [],
      currentLevelContext: parsedBody.data.current_level_context ?? null,
      plan,
    });

    return jsonResponse(req, {
      request_id: requestId,
      review_id: result.reviewId,
      review_kind: result.review.review_kind,
      adjustment_scope: result.review.adjustment_scope,
      decision: result.review.decision,
      understanding: result.review.understanding,
      impact: result.review.impact,
      user_change_summary: result.review.user_change_summary,
      proposed_changes: result.review.proposed_changes,
      control_mode: result.review.control_mode,
      resistance_note: result.review.resistance_note,
      principle_reminder: result.review.principle_reminder,
      offer_complete_level: result.review.offer_complete_level,
      regeneration_feedback: result.review.regeneration_feedback,
      clarification_question: result.review.clarification_question,
      assistant_summary: result.assistantMessage,
      assistant_message: result.assistantMessage,
      conversation_mode: result.conversationMode,
      conversation_thread: result.conversationThread,
      precision_count: result.precisionCount,
      message_count: result.messageCount,
      session_status: result.sessionStatus,
      session_expires_at: result.sessionExpiresAt,
    });
  } catch (error) {
    const ctx = getRequestContext(req);
    await logEdgeFunctionError({
      functionName: "review-plan-v1",
      error,
      requestId,
      userId: ctx.userId,
      source: "edge",
      metadata: { route: "review-plan-v1" },
    });

    if (error instanceof ReviewPlanV1Error) {
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

    return serverError(req, requestId, "Failed to review plan");
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}

export async function reviewPlan(args: {
  admin: SupabaseClient;
  requestId: string;
  userId: string;
  reviewId: string | null;
  transformationId: string;
  planId: string | null;
  scope: "onboarding_preview" | "active_plan";
  userComment: string;
  priorThread: PlanReviewThreadEntry[];
  currentLevelContext: CurrentLevelContext | null;
  plan: PlanContentV3;
}): Promise<{
  reviewId: string;
  review: ReviewResult;
  assistantMessage: string;
  conversationMode: ConversationMode;
  conversationThread: PersistedPlanReviewThreadEntry[];
  precisionCount: number;
  messageCount: number;
  sessionStatus: ReviewPlanSessionStatus;
  sessionExpiresAt: string;
}> {
  const context = await loadReviewContext(
    args.admin,
    args.userId,
    args.transformationId,
    args.planId,
  );

  const review = isMegaTestEnabled()
    ? buildMegaTestReview(args.userComment)
    : await runReviewWithLlm({
      requestId: args.requestId,
      userId: args.userId,
      transformation: context.transformation,
      scope: args.scope,
      userComment: args.userComment,
      priorThread: args.priorThread,
      currentLevelContext: args.currentLevelContext,
      plan: args.plan,
    });

  const conversationMode = deriveConversationMode(review);
  const assistantMessage = buildAssistantSummary(review, conversationMode);
  const conversationThread: PersistedPlanReviewThreadEntry[] = [
    ...args.priorThread.map((entry) => ({
      role: entry.role,
      content: entry.content,
      created_at: new Date().toISOString(),
    })),
    { role: "user" as const, content: args.userComment, created_at: new Date().toISOString() },
    { role: "assistant" as const, content: assistantMessage, created_at: new Date().toISOString() },
  ];
  const precisionCount = Math.max(
    0,
    conversationThread.filter((entry) => entry.role === "user").length - 1,
  );
  const messageCount = conversationThread.length;
  const reviewId = args.reviewId ?? crypto.randomUUID();
  const now = new Date().toISOString();
  const sessionExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const payload = {
    id: reviewId,
    user_id: args.userId,
    transformation_id: args.transformationId,
    plan_id: context.plan?.id ?? null,
    surface: args.scope,
    user_comment: args.userComment,
    prior_thread: args.priorThread,
    plan_snapshot: args.plan,
    review_kind: review.review_kind,
    adjustment_scope: review.adjustment_scope,
    decision: review.decision,
    understanding: review.understanding,
    impact: review.impact,
    user_change_summary: review.user_change_summary,
    proposed_changes: review.proposed_changes,
    control_mode: review.control_mode,
    resistance_note: review.resistance_note,
    principle_reminder: review.principle_reminder,
    offer_complete_level: review.offer_complete_level,
    regeneration_feedback: review.regeneration_feedback,
    clarification_question: review.clarification_question,
    conversation_mode: conversationMode,
    assistant_message: assistantMessage,
    conversation_thread: conversationThread,
    session_status: "active" as ReviewPlanSessionStatus,
    message_count: messageCount,
    precision_count: precisionCount,
    session_expires_at: sessionExpiresAt,
    status: "proposed",
    updated_at: now,
  };

  const persistResult = args.reviewId
    ? await args.admin
      .from("user_plan_review_requests")
      .update(payload as never)
      .eq("id", reviewId)
      .eq("user_id", args.userId)
    : await args.admin
      .from("user_plan_review_requests")
      .insert({
        ...payload,
        created_at: now,
      } as never);

  if (persistResult.error) {
    throw new ReviewPlanV1Error(
      500,
      "Failed to persist plan review request",
      { cause: persistResult.error },
    );
  }

  return {
    reviewId,
    review,
    assistantMessage,
    conversationMode,
    conversationThread,
    precisionCount,
    messageCount,
    sessionStatus: "active",
    sessionExpiresAt,
  };
}

export function buildAssistantSummary(
  review: ReviewResult,
  conversationMode: ConversationMode,
): string {
  const caution = review.resistance_note ? ` ${review.resistance_note}` : "";
  const principle = review.principle_reminder ? ` ${review.principle_reminder}` : "";

  if (conversationMode === "explanation_chat") {
    return [
      review.understanding,
      review.impact,
      review.clarification_question
        ? `Si tu veux, tu peux m'ajouter une précision: ${review.clarification_question}`
        : "Si tu veux, tu peux m'ajouter ce qui te paraît encore flou et je te réponds simplement.",
    ].join(" ");
  }

  if (conversationMode === "guardrail_chat") {
    return [
      review.understanding,
      review.impact,
      caution.trim(),
      principle.trim(),
      "Si tu veux, on peut en parler rapidement pour trouver une version qui protège mieux la logique du plan.",
    ].filter(Boolean).join(" ");
  }

  if (conversationMode === "level_adjustment") {
    return [
      `Oui, ça change quelque chose pour le niveau actuel. ${review.user_change_summary}`,
      caution.trim(),
      principle.trim(),
      "Si tu veux, je peux te montrer une version ajustée du niveau à partir d'aujourd'hui.",
    ].filter(Boolean).join(" ");
  }

  return [
    `Oui, ça change quelque chose pour la suite du plan. ${review.user_change_summary}`,
    caution.trim(),
    principle.trim(),
    "Si tu veux, je peux te montrer une version ajustée du plan à partir d'aujourd'hui.",
  ].filter(Boolean).join(" ");
}

function deriveConversationMode(review: ReviewResult): ConversationMode {
  if (review.control_mode === "clarify_only") {
    return review.review_kind === "clarification"
      ? "explanation_chat"
      : "guardrail_chat";
  }

  if (review.decision === "no_change" && review.offer_complete_level) {
    return review.adjustment_scope === "current_level_only"
      ? "level_adjustment"
      : "plan_adjustment";
  }

  if (review.decision === "no_change") {
    return review.review_kind === "clarification"
      ? "explanation_chat"
      : "guardrail_chat";
  }

  return review.adjustment_scope === "current_level_only"
    ? "level_adjustment"
    : "plan_adjustment";
}

export function buildMegaTestReview(userComment: string): ReviewResult {
  const comment = userComment.toLowerCase();
  if (
    comment.includes("pourquoi") ||
    comment.includes("explique") ||
    comment.includes("clarifie")
  ) {
    return {
      review_kind: "clarification",
      adjustment_scope: "current_level_only",
      decision: "no_change",
      understanding:
        "Tu demandes surtout à mieux comprendre la logique du plan avant de le changer.",
      impact:
        "Le plan peut rester identique tant qu'on n'a pas découvert de nouveau fait bloquant.",
      user_change_summary:
        "Rien n'est ajusté dans le plan pour l'instant: ta demande porte surtout sur la compréhension de la logique actuelle. Sophia peut clarifier pourquoi ce niveau arrive maintenant avant de proposer une vraie modification.",
      proposed_changes: [
        "Garder la structure actuelle",
        "Expliquer plus clairement pourquoi le premier niveau de plan vient avant le reste",
      ],
      control_mode: "clarify_only",
      resistance_note: null,
      principle_reminder: null,
      offer_complete_level: false,
      regeneration_feedback: null,
      clarification_question: null,
    };
  }

  if (
    comment.includes("fini") ||
    comment.includes("termin") ||
    comment.includes("deja fait") ||
    comment.includes("déjà fait") ||
    comment.includes("plus vite") ||
    comment.includes("accél") ||
    comment.includes("acceler") ||
    comment.includes("pret pour la suite") ||
    comment.includes("prêt pour la suite")
  ) {
    return {
      review_kind: "preference_change",
      adjustment_scope: "current_plus_future",
      decision: "no_change",
      understanding:
        "Tu sembles dire que ce niveau est déjà bien absorbé ou que tu avances plus vite que prévu.",
      impact:
        "La logique du plan n'est pas forcément à changer, mais on peut soit consolider un peu, soit ouvrir le passage au niveau suivant.",
      user_change_summary:
        "Le plan n'est pas réécrit automatiquement, mais Sophia traite ton retour comme un signal d'avance: on vérifie d'abord si le niveau actuel est vraiment consolidé, puis on peut ouvrir la suite au lieu de continuer au même rythme.",
      proposed_changes: [
        "Vérifier si l'appui du niveau est déjà assez stable pour tenir dans le réel",
        "Proposer le passage au niveau suivant si tu veux capitaliser sur l'élan",
      ],
      control_mode: "advance_ready",
      resistance_note:
        "L'élan est précieux, mais il vaut mieux sécuriser un appui réel plutôt que courir et devoir reconstruire juste après.",
      principle_reminder:
        "Quand quelque chose commence à marcher, le plus fort n'est pas d'aller vite, mais de le rendre assez solide pour tenir.",
      offer_complete_level: true,
      regeneration_feedback: null,
      clarification_question: null,
    };
  }

  if (
    comment.includes("plus simple") ||
    comment.includes("trop long") ||
    comment.includes("trop ambit")
  ) {
    return {
      review_kind: "preference_change",
      adjustment_scope: "current_level_only",
      decision: "minor_adjustment",
      understanding:
        "Tu veux garder la direction générale mais démarrer avec une version plus simple et plus faisable.",
      impact:
        "Il faut alléger le premier niveau de plan sans remettre en cause l'objectif global ni la logique du plan.",
      user_change_summary:
        "Sophia garde le cap du plan, mais transforme le démarrage: le niveau actuel doit devenir plus court, plus concret et plus facile à exécuter cette semaine au lieu de rester trop ambitieux ou abstrait.",
      proposed_changes: [
        "Raccourcir le premier niveau de plan",
        "Remplacer les actions trop abstraites par un micro-pas visible",
      ],
      control_mode: "adjust_current_level",
      resistance_note: null,
      principle_reminder: null,
      offer_complete_level: false,
      regeneration_feedback:
        "Conserve la meme direction generale du plan, mais simplifie fortement le premier niveau de plan. Remplace les actions trop abstraites, trop ambitieuses ou trop longues par un premier pas visible, concret et plus facile a executer cette semaine.",
      clarification_question: null,
    };
  }

  return {
    review_kind: "invalidating_fact",
    adjustment_scope: "full_plan",
    decision: "partial_replan",
    understanding:
      "Tu apportes une information nouvelle qui semble changer la cause principale du probleme.",
    impact:
      "La logique actuelle du plan doit etre recalibree sur ce nouveau diagnostic plutot que sur l'hypothese precedente.",
    user_change_summary:
      "Sophia traite ton message comme un fait nouveau: le plan doit être recalibré sur cette cause principale, et les actions qui répondaient à l'ancienne hypothèse doivent être remplacées.",
    proposed_changes: [
      "Reformuler ce qui se passe vraiment",
      "Regenere le plan a partir de cette nouvelle cause principale",
    ],
    control_mode: "adjust_future_levels",
    resistance_note: null,
    principle_reminder: null,
    offer_complete_level: false,
    regeneration_feedback:
      `Le user apporte une information nouvelle qui invalide une partie du diagnostic initial: "${userComment}". Recalibre le plan sur cette nouvelle cause principale, mets a jour l'analyse mecanique et remplace les actions qui ne s'attaquent plus au bon probleme.`,
    clarification_question: null,
  };
}

function parsePlanContent(value: unknown): PlanContentV3 {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ReviewPlanV1Error(400, "plan_content must be an object");
  }

  const candidate = value as Record<string, unknown>;
  if (candidate.version !== 3 || !Array.isArray(candidate.phases)) {
    throw new ReviewPlanV1Error(400, "plan_content must be a V3 plan");
  }

  return candidate as unknown as PlanContentV3;
}

async function loadReviewContext(
  admin: SupabaseClient,
  userId: string,
  transformationId: string,
  planId: string | null,
): Promise<ReviewContext> {
  const { data: transformation, error: transformationError } = await admin
    .from("user_transformations")
    .select("*")
    .eq("id", transformationId)
    .maybeSingle();

  if (transformationError) {
    throw new ReviewPlanV1Error(500, "Failed to load transformation", {
      cause: transformationError,
    });
  }

  if (!transformation) {
    throw new ReviewPlanV1Error(404, "Transformation not found for this user");
  }

  const { data: cycleRow, error: cycleError } = await admin
    .from("user_cycles")
    .select("id, user_id")
    .eq("id", transformation.cycle_id)
    .maybeSingle();

  if (cycleError) {
    throw new ReviewPlanV1Error(500, "Failed to load transformation cycle", {
      cause: cycleError,
    });
  }

  if (!cycleRow || cycleRow.user_id !== userId) {
    throw new ReviewPlanV1Error(404, "Transformation not found for this user");
  }

  let plan: UserPlanV2Row | null = null;
  if (planId) {
    const { data: planRow, error: planError } = await admin
      .from("user_plans_v2")
      .select("*")
      .eq("id", planId)
      .eq("transformation_id", transformationId)
      .eq("user_id", userId)
      .maybeSingle();

    if (planError) {
      throw new ReviewPlanV1Error(500, "Failed to load V3 plan", {
        cause: planError,
      });
    }

    if (!planRow) {
      throw new ReviewPlanV1Error(404, "Plan not found for this user");
    }

    plan = planRow as UserPlanV2Row;
  }

  return {
    transformation: transformation as unknown as UserTransformationRow,
    plan,
  };
}

async function runReviewWithLlm(args: {
  requestId: string;
  userId: string;
  transformation: UserTransformationRow;
  scope: "onboarding_preview" | "active_plan";
  userComment: string;
  priorThread: PlanReviewThreadEntry[];
  currentLevelContext: CurrentLevelContext | null;
  plan: PlanContentV3;
}): Promise<ReviewResult> {
  const raw = await generateWithGemini(
    PLAN_REVIEW_SYSTEM_PROMPT,
    buildPlanReviewUserPrompt(args),
    0.2,
    true,
    [],
    "auto",
    {
      requestId: args.requestId,
      model: getGlobalAiModel("gemini-2.5-flash"),
      source: "review-plan-v1",
      userId: args.userId,
    },
  );

  if (typeof raw !== "string") {
    throw new ReviewPlanV1Error(
      500,
      "LLM returned a tool call instead of a structured plan review",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim());
  } catch (error) {
    throw new ReviewPlanV1Error(500, "LLM returned invalid JSON", {
      cause: error,
    });
  }

  const result = REVIEW_RESULT_SCHEMA.safeParse(parsed);
  if (!result.success) {
    throw new ReviewPlanV1Error(
      500,
      `LLM returned an invalid review payload: ${
        result.error.issues.map((issue) => issue.message).join(", ")
      }`,
    );
  }

  return normalizeReviewResult(result.data);
}

export function normalizeReviewResult(review: ReviewResult): ReviewResult {
  const proposedChanges = review.proposed_changes
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 6);

  return {
    ...review,
    user_change_summary: review.user_change_summary.trim(),
    proposed_changes: proposedChanges,
    resistance_note: review.resistance_note?.trim() || null,
    principle_reminder: review.principle_reminder?.trim() || null,
    regeneration_feedback: review.decision === "no_change"
      ? null
      : review.regeneration_feedback?.trim() || null,
    clarification_question: review.clarification_question?.trim() || null,
  };
}

export function buildPlanReviewUserPrompt(args: {
  transformation: UserTransformationRow;
  scope: "onboarding_preview" | "active_plan";
  userComment: string;
  priorThread: PlanReviewThreadEntry[];
  currentLevelContext: CurrentLevelContext | null;
  plan: PlanContentV3;
}): string {
  const planAdjustmentContext = extractPlanAdjustmentContext(args.plan);
  const principleAnchor = buildPrincipleAnchor(args.transformation, args.plan);
  const priorThreadBlock = args.priorThread.length > 0
    ? args.priorThread
      .slice(-6)
      .map((entry) =>
        `${entry.role === "assistant" ? "Sophia" : "Utilisateur"}: ${entry.content}`
      )
      .join("\n")
    : "Aucun échange précédent.";

  return `## Surface
- scope: ${args.scope}

## Transformation
- titre: ${args.transformation.title ?? args.plan.title}
- resume utilisateur: ${args.transformation.user_summary}
- definition de reussite: ${args.transformation.success_definition ?? args.plan.strategy.success_definition}
- contrainte principale: ${args.transformation.main_constraint ?? args.plan.strategy.main_constraint}

## Historique recent de revue
${priorThreadBlock}

## Commentaire utilisateur a traiter
${args.userComment}

## Niveau de plan actuellement visible
${args.currentLevelContext
    ? `- niveau: ${args.currentLevelContext.phase_order}
- titre: ${args.currentLevelContext.title}
- objectif: ${args.currentLevelContext.objective}
- instruction: Utilise ce niveau comme point d'ancrage, mais determine explicitement si la demande vise seulement ce niveau, la suite, les deux, ou le plan entier.`
    : "- Aucun niveau de plan courant explicite n'a été fourni."}

## Logique interne du plan pour les futurs ajustements
${summarizePlanAdjustmentContext(planAdjustmentContext)}

## Principe d'ancrage disponible
${principleAnchor}

## Plan actuel
${summarizePlan(args.plan)}

Retourne le JSON demande.`;
}

function summarizePlan(plan: PlanContentV3): string {
  const topLevel = [
    `- titre: ${plan.title}`,
    `- duree: ${plan.duration_months} mois`,
    `- situation: ${cleanPromptText(plan.situation_context ?? plan.user_summary, 280)}`,
    `- mecanisme: ${cleanPromptText(plan.mechanism_analysis ?? plan.internal_summary, 280)}`,
    `- cle a comprendre: ${cleanPromptText(plan.key_understanding ?? plan.strategy.success_definition, 220)}`,
    `- logique de progression: ${cleanPromptText(plan.progression_logic ?? plan.timeline_summary, 220)}`,
  ];
  if (plan.current_level_runtime) {
    topLevel.push(
      `- niveau courant detaille: ${cleanPromptText(plan.current_level_runtime.title, 140)} | objectif: ${cleanPromptText(plan.current_level_runtime.phase_objective, 180)}`,
    );
  }
  if (plan.plan_blueprint?.levels?.length) {
    topLevel.push(
      `- blueprint restant: ${
        plan.plan_blueprint.levels.map((level) =>
          `N${level.level_order} ${cleanPromptText(level.title, 80)} (${level.estimated_duration_weeks} sem.)`
        ).join(" | ")
      }`,
    );
  }

  const phases = plan.phases.map((phase) => {
    const items = phase.items
      .slice(0, 8)
      .map((item) => `  - [${item.dimension}] ${item.title}: ${cleanPromptText(item.description ?? "", 140)}`)
      .join("\n");
    return [
      `Niveau de plan ${phase.phase_order}: ${phase.title}`,
      `- objectif: ${cleanPromptText(phase.phase_objective, 180)}`,
      `- pourquoi maintenant: ${cleanPromptText(phase.why_this_now ?? phase.rationale, 180)}`,
      `- items:`,
      items || "  - aucun",
    ].join("\n");
  }).join("\n\n");

  return `${topLevel.join("\n")}\n\n${phases}`;
}

function extractPlanAdjustmentContext(plan: PlanContentV3): PlanAdjustmentContext | null {
  const metadata = plan.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const raw = (metadata as Record<string, unknown>).plan_adjustment_context;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as PlanAdjustmentContext;
}

function summarizePlanAdjustmentContext(context: PlanAdjustmentContext | null): string {
  if (!context) return "- Aucun contexte interne d'ajustement disponible.";

  const global = [
    `- probleme central: ${cleanPromptText(context.global_reasoning?.main_problem_model, 220)}`,
    `- logique d'enchainement: ${cleanPromptText(context.global_reasoning?.sequencing_logic, 220)}`,
    `- pourquoi pas plus vite au depart: ${cleanPromptText(context.global_reasoning?.why_not_faster_initially, 220)}`,
    `- signaux d'acceleration: ${formatPromptList(context.global_reasoning?.acceleration_signals)}`,
    `- signaux de ralentissement: ${formatPromptList(context.global_reasoning?.slowdown_signals)}`,
  ];
  const phases = Array.isArray(context.phase_reasoning) && context.phase_reasoning.length > 0
    ? context.phase_reasoning.map((phase) =>
      [
        `- niveau ${phase.phase_order} (${phase.phase_id})`,
        `  role: ${cleanPromptText(phase.role_in_plan, 160)}`,
        `  avant la suite: ${cleanPromptText(phase.why_before_next, 170)}`,
        `  signaux user utilises: ${formatPromptList(phase.user_signals_used)}`,
        `  pre-requis pour la suite: ${cleanPromptText(phase.prerequisite_for_next_phase, 120)}`,
        `  acceleration: ${formatPromptList(phase.acceleration_signals)}`,
        `  ralentissement: ${formatPromptList(phase.slowdown_signals)}`,
      ].join("\n")
    ).join("\n")
    : "- Aucun raisonnement par niveau disponible.";

  return `${global.join("\n")}\n${phases ? `\n${phases}` : ""}`;
}

function buildPrincipleAnchor(
  transformation: UserTransformationRow,
  plan: PlanContentV3,
): string {
  const directPrinciple = cleanPromptText(plan.strategy.core_principle, 140);
  const handoff = transformation.handoff_payload;
  if (
    handoff &&
    typeof handoff === "object" &&
    !Array.isArray(handoff) &&
    typeof (handoff as Record<string, unknown>).phase_1 === "object" &&
    (handoff as Record<string, unknown>).phase_1 &&
    !Array.isArray((handoff as Record<string, unknown>).phase_1)
  ) {
    const phase1 = (handoff as Record<string, unknown>).phase_1 as Record<string, unknown>;
    const story = phase1.story;
    if (story && typeof story === "object" && !Array.isArray(story)) {
      const rawSections = (story as Record<string, unknown>).principle_sections;
      const sections: unknown[] = Array.isArray(rawSections)
        ? rawSections
        : [];
      const titles = sections.flatMap((item: unknown) =>
        item && typeof item === "object" && !Array.isArray(item) &&
            typeof (item as Record<string, unknown>).title === "string"
          ? [String((item as Record<string, unknown>).title).trim()]
          : []
      ).slice(0, 3);
      if (titles.length > 0) {
        return `Principe directeur: ${directPrinciple}. Principes de l'histoire: ${titles.join(" | ")}.`;
      }
    }
  }

  return directPrinciple !== "Non precise"
    ? `Principe directeur: ${directPrinciple}.`
    : "Aucun principe explicite disponible.";
}

function cleanPromptText(value: string | null | undefined, max = 240): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "Non precise";
  return text.length <= max ? text : `${text.slice(0, max - 3).trimEnd()}...`;
}

function formatPromptList(values: string[] | null | undefined): string {
  return Array.isArray(values) && values.length > 0
    ? values.map((value) => cleanPromptText(value, 90)).join(" | ")
    : "Non precise";
}

function formatAdjustmentScope(scope: PlanAdjustmentScope): string {
  switch (scope) {
    case "current_level_only":
      return "le niveau actuel seulement";
    case "future_levels_only":
      return "surtout les niveaux suivants";
    case "current_plus_future":
      return "le niveau actuel et la suite";
    case "full_plan":
      return "le plan complet";
  }
}

function isMegaTestEnabled(): boolean {
  const megaRaw = (Deno.env.get("MEGA_TEST_MODE") ?? "").trim();
  const isLocalSupabase =
    (Deno.env.get("SUPABASE_INTERNAL_HOST_PORT") ?? "").trim() === "54321" ||
    (Deno.env.get("SUPABASE_URL") ?? "").includes("http://kong:8000");
  return megaRaw === "1" || (megaRaw === "" && isLocalSupabase);
}

function getSupabaseEnv() {
  const url = String(Deno.env.get("SUPABASE_URL") ?? "").trim();
  const anonKey = String(Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
  const serviceRoleKey = String(
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  ).trim();

  if (!url || !anonKey || !serviceRoleKey) {
    throw new ReviewPlanV1Error(500, "Supabase environment is not configured");
  }

  return { url, anonKey, serviceRoleKey };
}

const PLAN_REVIEW_SYSTEM_PROMPT = `Tu es le module de revue de plan de Sophia.

Tu ne modifies PAS directement le plan. Tu analyses un commentaire utilisateur et tu proposes une revision encadree.

But:
- comprendre ce que le user veut vraiment dire
- distinguer ce qui releve d'une clarification, d'une preference, ou d'un fait nouveau qui invalide le plan
- decider si le plan doit rester tel quel, etre ajuste legerement, etre replannifie partiellement, ou etre replannifie completement

Definitions:
- review_kind = "clarification": le user demande surtout a mieux comprendre, ou le besoin ne justifie pas encore de changer le plan
- review_kind = "preference_change": le user veut une autre forme d'execution, sans changer le vrai probleme
- review_kind = "invalidating_fact": le user apporte un fait nouveau qui change le diagnostic ou la cause principale

- adjustment_scope = "current_level_only": la demande vise surtout le niveau de plan actuel
- adjustment_scope = "future_levels_only": la demande vise surtout les niveaux suivants ou la vitesse de la suite
- adjustment_scope = "current_plus_future": le niveau actuel et la suite doivent etre recoordonnés ensemble
- adjustment_scope = "full_plan": la logique globale du plan doit etre reconsidérée

- decision = "no_change": on garde le plan
- decision = "minor_adjustment": meme direction generale, mais on simplifie ou reformule des actions
- decision = "partial_replan": certaines parties doivent changer
- decision = "full_replan": le diagnostic ou la logique globale du plan doit etre refait

- control_mode = "clarify_only": on explique surtout la logique
- control_mode = "adjust_current_level": on agit surtout sur le niveau actuel
- control_mode = "adjust_future_levels": on agit surtout sur les niveaux suivants
- control_mode = "advance_ready": le user semble en avance ou pret a cloturer ce niveau; on ajoute une resistance legere puis on peut proposer le passage au niveau suivant

Règles:
- reste concrete, concise et intelligible
- n'autorise pas de micro-management libre des steps
- si le user conteste seulement la forme du demarrage, prefere "minor_adjustment"
- si le user dit qu'il avance plus vite que prevu, qu'il veut accelerer, raccourcir ou modifier surtout la suite, utilise plutot "future_levels_only" ou "current_plus_future"
- si le user dit qu'il a deja termine ce niveau, qu'il va plus vite, ou qu'il est deja pret pour la suite:
  - ajoute une petite resistance intelligente dans \`resistance_note\`
  - appuie-toi si possible sur le principe directeur ou les principes de l'histoire dans \`principle_reminder\`
  - rappelle que consolider un appui reel peut etre plus utile que courir
  - mais si la demande reste legitime, mets \`control_mode = "advance_ready"\` et \`offer_complete_level = true\`
- si le user apporte une cause nouvelle credibile, prefere "partial_replan" ou "full_replan"
- si aucun changement n'est justifie, dis-le clairement
- regeneration_feedback doit etre null si decision = "no_change"
- si decision != "no_change", regeneration_feedback doit etre un bloc clair en francais destine au generateur de plan, qui explique quoi garder, quoi changer, et pourquoi
- dans regeneration_feedback, precise explicitement si on garde le niveau courant, si on modifie seulement les niveaux futurs, ou si on revoit aussi le niveau actuel
- user_change_summary est le "Résumé pour le user de ce qui a été changé" par rapport a son input:
  - 2 a 4 phrases maximum, en francais naturel
  - compare explicitement le commentaire utilisateur avec l'effet concret sur le plan
  - dis clairement ce qui est garde, ce qui change, et ce qui ne change pas encore
  - ne repete pas seulement l'input; ne fais pas une phrase generique du type "le plan est ajuste"
  - si decision = "no_change", explique pourquoi rien n'est modifie et quelle clarification ou verification est proposee a la place
- utilise le contexte interne du plan pour eviter de casser un niveau utile sans raison, et pour expliquer ce qui peut etre accelere ou non
- clarification_question ne doit etre renseignee que s'il manque vraiment une precision utile avant de revoir le plan
- proposed_changes doit contenir 1 a 4 changements concrets, pas de phrases vagues
- \`resistance_note\` doit etre courte, concrete, jamais culpabilisante
- \`principle_reminder\` doit etre courte, ancree dans un principe reel si disponible, jamais mystique ou abstraite
- \`offer_complete_level\` doit valoir \`true\` uniquement si le commentaire ressemble a "j'ai fini", "je suis deja pret", "je vais plus vite", "on peut passer a la suite"

Retourne UNIQUEMENT ce JSON:
{
  "review_kind": "clarification" | "preference_change" | "invalidating_fact",
  "adjustment_scope": "current_level_only" | "future_levels_only" | "current_plus_future" | "full_plan",
  "decision": "no_change" | "minor_adjustment" | "partial_replan" | "full_replan",
  "understanding": "ce que tu as compris du commentaire",
  "impact": "ce que cela change ou ne change pas dans le plan",
  "user_change_summary": "résumé user-ready de ce qui change concrètement par rapport au commentaire",
  "proposed_changes": ["..."],
  "control_mode": "clarify_only" | "adjust_current_level" | "adjust_future_levels" | "advance_ready",
  "resistance_note": "..." | null,
  "principle_reminder": "..." | null,
  "offer_complete_level": true | false,
  "regeneration_feedback": "..." | null,
  "clarification_question": "..." | null
}`;
