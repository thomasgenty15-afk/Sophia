import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "jsr:@supabase/supabase-js@2";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

import { enforceCors, handleCorsOptions } from "../_shared/cors.ts";
import { logEdgeFunctionError } from "../_shared/error-log.ts";
import {
  buildLevelReviewSchema,
  buildLevelReviewSummary,
  buildNextLevelTransition,
  isLevelReviewWindowOpen,
  isLevelTransitionReady,
  normalizeLevelReviewAnswers,
} from "../_shared/v2-level-completion.ts";
import {
  LEVEL_REVIEW_REMINDER_EVENT_CONTEXT_PREFIX,
} from "../_shared/level_review_checkins.ts";
import { generatePlanV2ForTransformation } from "../generate-plan-v2/index.ts";
import { logV2Event, V2_EVENT_TYPES } from "../_shared/v2-events.ts";
import { getUserTimeContext } from "../_shared/user_time_context.ts";
import {
  badRequest,
  jsonResponse,
  parseJsonBody,
  serverError,
  z,
} from "../_shared/http.ts";
import { getRequestContext } from "../_shared/request_context.ts";
import type {
  PlanContentV3,
  UserCycleRow,
  UserPlanItemRow,
  UserPlanV2Row,
  UserTransformationRow,
} from "../_shared/v2-types.ts";

const REQUEST_SCHEMA = z.object({
  transformation_id: z.string().uuid(),
  plan_id: z.string().uuid().optional(),
  answers: z.record(z.string(), z.unknown()),
});

class CompleteLevelV1Error extends Error {
  status: number;

  constructor(status: number, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "CompleteLevelV1Error";
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
    throw new CompleteLevelV1Error(500, "Supabase environment is not configured");
  }
  return { url, anonKey, serviceRoleKey };
}

function parsePlanContent(content: Record<string, unknown> | null): PlanContentV3 {
  if (!content || content.version !== 3 || !Array.isArray(content.phases)) {
    throw new CompleteLevelV1Error(409, "Le plan actif n'est pas un plan V3 compatible.");
  }
  return content as unknown as PlanContentV3;
}

async function loadTransformation(
  admin: SupabaseClient,
  transformationId: string,
): Promise<UserTransformationRow> {
  const { data, error } = await admin
    .from("user_transformations")
    .select("*")
    .eq("id", transformationId)
    .maybeSingle();

  if (error) {
    throw new CompleteLevelV1Error(500, "Failed to load transformation", {
      cause: error,
    });
  }
  if (!data) {
    throw new CompleteLevelV1Error(404, "Transformation not found");
  }

  return data as UserTransformationRow;
}

async function loadCycle(
  admin: SupabaseClient,
  cycleId: string,
): Promise<UserCycleRow> {
  const { data, error } = await admin
    .from("user_cycles")
    .select("*")
    .eq("id", cycleId)
    .maybeSingle();

  if (error) {
    throw new CompleteLevelV1Error(500, "Failed to load cycle", {
      cause: error,
    });
  }
  if (!data) {
    throw new CompleteLevelV1Error(404, "Cycle not found");
  }

  return data as UserCycleRow;
}

async function loadPlan(args: {
  admin: SupabaseClient;
  transformation: UserTransformationRow;
  planId: string | null;
}): Promise<UserPlanV2Row> {
  let query = args.admin
    .from("user_plans_v2")
    .select("*")
    .eq("cycle_id", args.transformation.cycle_id)
    .eq("transformation_id", args.transformation.id)
    .in("status", ["active", "paused", "completed"])
    .order("activated_at", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1);

  if (args.planId) {
    query = query.eq("id", args.planId);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    throw new CompleteLevelV1Error(500, "Failed to load plan", {
      cause: error,
    });
  }
  if (!data) {
    throw new CompleteLevelV1Error(404, "Plan not found");
  }

  return data as UserPlanV2Row;
}

async function loadPlanItems(
  admin: SupabaseClient,
  planId: string,
): Promise<UserPlanItemRow[]> {
  const { data, error } = await admin
    .from("user_plan_items")
    .select("*")
    .eq("plan_id", planId)
    .order("phase_order", { ascending: true })
    .order("activation_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });

  if (error) {
    throw new CompleteLevelV1Error(500, "Failed to load plan items", {
      cause: error,
    });
  }

  return (data as UserPlanItemRow[] | null) ?? [];
}

async function loadRecentWeeklySignals(
  admin: SupabaseClient,
  args: {
    userId: string;
    cycleId: string;
    transformationId: string;
  },
): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await admin
    .from("system_runtime_snapshots")
    .select("payload")
    .eq("user_id", args.userId)
    .eq("cycle_id", args.cycleId)
    .eq("transformation_id", args.transformationId)
    .eq("snapshot_type", "weekly_bilan_decided_v2")
    .order("created_at", { ascending: false })
    .limit(3);

  if (error) return [];
  return ((data ?? []) as Array<{ payload: unknown }>)
    .map((row: { payload: unknown }) => row.payload)
    .filter((value: unknown): value is Record<string, unknown> =>
      Boolean(value) && typeof value === "object" && !Array.isArray(value)
    );
}

function cleanPromptText(value: unknown, max = 240): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "Non renseigné";
  return text.length <= max ? text : `${text.slice(0, max - 3).trimEnd()}...`;
}

function summarizePhaseForPrompt(phase: PlanContentV3["phases"][number] | null): string {
  if (!phase) return "Aucun niveau suivant dans le plan actuel.";
  const items = phase.items
    .slice(0, 8)
    .map((item) =>
      `- [${item.dimension}] ${cleanPromptText(item.title, 90)}: ${cleanPromptText(item.description, 160)}`
    )
    .join("\n");
  return [
    `Niveau ${phase.phase_order}: ${cleanPromptText(phase.title, 120)}`,
    `Objectif: ${cleanPromptText(phase.phase_objective, 220)}`,
    `Pourquoi maintenant: ${cleanPromptText(phase.why_this_now ?? phase.rationale, 220)}`,
    `Items:\n${items || "- Aucun item"}`,
  ].join("\n");
}

function findNextBlueprintLevel(
  plan: PlanContentV3,
  currentPhase: PlanContentV3["phases"][number],
): NonNullable<PlanContentV3["plan_blueprint"]>["levels"][number] | null {
  const levels = plan.plan_blueprint?.levels;
  if (!Array.isArray(levels)) return null;
  return levels
    .filter((level) => level.level_order > currentPhase.phase_order)
    .sort((left, right) => left.level_order - right.level_order)[0] ?? null;
}

function summarizeNextLevelForPrompt(args: {
  plan: PlanContentV3;
  currentPhase: PlanContentV3["phases"][number];
  nextPhase: PlanContentV3["phases"][number] | null;
}): string {
  if (args.nextPhase) return summarizePhaseForPrompt(args.nextPhase);

  const blueprintLevel = findNextBlueprintLevel(args.plan, args.currentPhase);
  if (!blueprintLevel) return summarizePhaseForPrompt(null);

  return [
    `Niveau ${blueprintLevel.level_order} (blueprint): ${cleanPromptText(blueprintLevel.title, 120)}`,
    `Objectif prévu: ${cleanPromptText(blueprintLevel.preview_summary ?? blueprintLevel.intention, 220)}`,
    `Pourquoi maintenant: ${cleanPromptText(blueprintLevel.intention, 220)}`,
    `Durée estimée: ${blueprintLevel.estimated_duration_weeks} semaines`,
    "Items: à générer maintenant par l'IA à partir du bilan et du plan précédent.",
  ].join("\n");
}

function summarizeLevelItemsForPrompt(items: UserPlanItemRow[]): string {
  if (items.length === 0) return "- Aucun item matériel retrouvé pour ce niveau.";

  return items
    .slice(0, 20)
    .map((item) => {
      const progress = item.target_reps
        ? `, progression ${item.current_reps ?? 0}/${item.target_reps}`
        : item.current_reps != null
        ? `, progression ${item.current_reps}`
        : "";
      const cadence = item.cadence_label ? `, cadence ${item.cadence_label}` : "";
      const completed = item.completed_at ? `, terminé le ${item.completed_at}` : "";
      return `- [${item.dimension}/${item.kind}] ${
        cleanPromptText(item.title, 90)
      }: statut ${item.status}${progress}${cadence}${completed}. ${
        cleanPromptText(item.description, 180)
      }`;
    })
    .join("\n");
}

function summarizeWeeklySignalsForPrompt(signals: Array<Record<string, unknown>>): string {
  if (signals.length === 0) return "- Aucun bilan hebdo récent disponible.";

  return signals.slice(0, 3).map((signal, index) => {
    const compact = JSON.stringify(signal);
    return `- Bilan hebdo ${index + 1}: ${cleanPromptText(compact, 900)}`;
  }).join("\n");
}

function formatAnswerForPrompt(
  schema: ReturnType<typeof buildLevelReviewSchema>,
  answers: Record<string, string>,
): string {
  return schema
    .map((question) => {
      const raw = answers[question.id];
      if (!raw) return null;
      const selected = question.options.find((option) => option.value === raw);
      return `- ${question.label}: ${selected?.label ?? raw}`;
    })
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function buildLevelCompletionRegenerationFeedback(args: {
  plan: PlanContentV3;
  currentPhase: PlanContentV3["phases"][number];
  nextPhase: PlanContentV3["phases"][number] | null;
  levelItems: UserPlanItemRow[];
  schema: ReturnType<typeof buildLevelReviewSchema>;
  answers: Record<string, string>;
  summary: Record<string, unknown>;
  weeklySignals: Array<Record<string, unknown>>;
  decision: string;
  decisionReason: string;
  reviewMode: "user_review" | "auto_timeout";
}): string {
  const futureBlueprint = args.plan.plan_blueprint?.levels?.length
    ? args.plan.plan_blueprint.levels
      .map((level) =>
        `- N${level.level_order} ${cleanPromptText(level.title, 90)} (${level.estimated_duration_weeks} sem.): ${cleanPromptText(level.preview_summary ?? level.intention, 160)}`
      )
      .join("\n")
    : "Aucun blueprint futur explicite.";

  return `Bilan de fin de niveau: le niveau courant est considéré comme terminé et ne doit pas être régénéré comme niveau courant.

Objectif de cet appel IA:
- décider si les réponses imposent de garder, alléger, accélérer ou réorienter la suite
- générer le prochain niveau comme nouveau current_level_runtime
- modifier les niveaux suivants dans le même plan si les informations du bilan l'exigent
- ne pas repartir de zéro: utiliser le plan précédent comme base, conserver ce qui reste pertinent, et changer uniquement ce que le bilan justifie
- raisonner comme un coach: préserver ce qui a donné de la traction, simplifier ce qui a créé de la friction, et ne jamais augmenter la charge si la disponibilité réelle du user baisse

Niveau terminé:
${summarizePhaseForPrompt(args.currentPhase)}

État réel des actions du niveau terminé:
${summarizeLevelItemsForPrompt(args.levelItems)}

Prochain niveau prévu avant bilan:
${summarizeNextLevelForPrompt({
    plan: args.plan,
    currentPhase: args.currentPhase,
    nextPhase: args.nextPhase,
  })}

Blueprint futur avant bilan:
${futureBlueprint}

Mode de bilan: ${args.reviewMode === "auto_timeout" ? "validation automatique sans questionnaire utilisateur direct" : "questionnaire utilisateur complété"}.

Réponses de bilan:
${formatAnswerForPrompt(args.schema, args.answers)}

Synthèse structurée du bilan:
${JSON.stringify(args.summary, null, 2)}

Signaux hebdo récents à utiliser comme contexte secondaire:
${summarizeWeeklySignalsForPrompt(args.weeklySignals)}

Décision initiale de Sophia avant génération: ${args.decision}.
Raison: ${args.decisionReason}

Contraintes de génération:
- le nouveau current_level_runtime doit commencer après le niveau ${args.currentPhase.phase_order}
- l'objectif du prochain niveau doit faire avancer explicitement l'objectif global de transformation, via la primary_metric ou un prérequis clairement relié à cette métrique
- le prochain niveau doit rester cohérent avec la logique globale du plan: il ajoute une couche à ce qui précède, prépare correctement ce qui suit, et ne change pas de direction sans signal fort dans le bilan
- si la suite paraît cohérente et les difficultés sont faibles, garde la logique globale et ajuste seulement le dosage
- si la suite ne paraît pas cohérente, explique implicitement ce qui change via le nouveau niveau et le blueprint futur
- réutilise explicitement la fierté déclarée comme signal de ce qui doit être conservé
- si une difficulté bloquante apparaît, simplifie la charge du prochain niveau avant d'ajouter de nouvelles exigences`;
}

const AUTO_CLOSABLE_ITEM_STATUSES = new Set(["pending", "active", "stalled"]);

async function autoCloseUnfinishedLevelItems(args: {
  admin: SupabaseClient;
  planItems: UserPlanItemRow[];
  now: string;
  reason: string;
}): Promise<void> {
  const items = args.planItems.filter((item) =>
    AUTO_CLOSABLE_ITEM_STATUSES.has(item.status)
  );
  await Promise.all(items.map(async (item) => {
    const payload = item.payload && typeof item.payload === "object"
      ? item.payload
      : {};
    const { error } = await args.admin
      .from("user_plan_items")
      .update({
        status: "cancelled",
        payload: {
          ...payload,
          level_auto_closed: {
            reason: args.reason,
            closed_at: args.now,
            previous_status: item.status,
          },
        },
        updated_at: args.now,
      } as never)
      .eq("id", item.id);
    if (error) {
      throw new CompleteLevelV1Error(500, "Failed to auto-close level item", {
        cause: error,
      });
    }
  }));
}

async function cancelPendingLevelReviewReminders(args: {
  admin: SupabaseClient;
  userId: string;
  planId: string;
  phaseId: string;
  now: string;
}): Promise<void> {
  const { error } = await args.admin
    .from("scheduled_checkins")
    .update({
      status: "cancelled",
      processed_at: args.now,
    } as never)
    .eq("user_id", args.userId)
    .like(
      "event_context",
      `${LEVEL_REVIEW_REMINDER_EVENT_CONTEXT_PREFIX}:${args.planId}:${args.phaseId}%`,
    )
    .in("status", ["pending", "retrying", "awaiting_user"]);
  if (error) {
    throw new CompleteLevelV1Error(500, "Failed to cancel level review reminders", {
      cause: error,
    });
  }
}

export async function completeLevelV1(args: {
  admin: SupabaseClient;
  requestId: string;
  userId: string;
  transformationId: string;
  planId: string | null;
  answers: Record<string, unknown>;
  reviewMode?: "user_review" | "auto_timeout";
  autoReason?: string | null;
}): Promise<{
  reviewId: string;
  generationEventId: string;
  decision: string;
  decisionReason: string;
  summary: string;
  nextLevel: {
    phase_id: string;
    level_order: number;
    title: string;
    duration_weeks: number;
  } | null;
}> {
  const now = new Date().toISOString();
  const transformation = await loadTransformation(args.admin, args.transformationId);
  const cycle = await loadCycle(args.admin, transformation.cycle_id);

  if (cycle.user_id !== args.userId) {
    throw new CompleteLevelV1Error(403, "Forbidden");
  }
  if (transformation.status !== "active") {
    throw new CompleteLevelV1Error(
      409,
      `La transformation n'est pas clôturable depuis l'état ${transformation.status}.`,
    );
  }

  const plan = await loadPlan({
    admin: args.admin,
    transformation,
    planId: args.planId,
  });
  const planContent = parsePlanContent(plan.content as Record<string, unknown> | null);
  const currentLevelRuntime = planContent.current_level_runtime;
  if (!currentLevelRuntime) {
    throw new CompleteLevelV1Error(
      409,
      "Aucun niveau courant n'est disponible. Le plan est peut-être déjà arrivé au bout.",
    );
  }

  const currentPhase = planContent.phases.find((phase) =>
    phase.phase_id === currentLevelRuntime.phase_id ||
    phase.phase_order === currentLevelRuntime.level_order
  );
  if (!currentPhase) {
    throw new CompleteLevelV1Error(409, "Le niveau courant du plan est incohérent.");
  }

  const planItems = await loadPlanItems(args.admin, plan.id);
  const userTimeContext = await getUserTimeContext({
    supabase: args.admin,
    userId: args.userId,
    now: new Date(now),
  });
  const transitionReady = isLevelTransitionReady(currentPhase.phase_id, planItems);
  const reviewWindowOpen = isLevelReviewWindowOpen({
    plan: planContent,
    currentLevel: currentLevelRuntime,
    userLocalDate: userTimeContext.user_local_date,
  });
  if (!transitionReady && !reviewWindowOpen) {
    throw new CompleteLevelV1Error(
      409,
      "Ce bilan se débloque deux jours avant la fin du niveau, ou quand toutes ses actions sont bouclées.",
    );
  }

  const schema = buildLevelReviewSchema({
    currentLevel: currentLevelRuntime,
    items: planItems.filter((item) => item.phase_id === currentPhase.phase_id),
    weeks: currentLevelRuntime.weeks,
    primaryMetricLabel: planContent.primary_metric?.label ?? null,
  });
  const reviewMode = args.reviewMode ?? "user_review";
  const rawAnswers = reviewMode === "auto_timeout"
    ? {
      global_metric_state: "unclear",
      next_plan_coherence: "not_sure",
      coherence_reason:
        "Validation automatique: l'utilisateur n'a pas repondu au bilan avant la fin du niveau.",
      difficulty_signal: "minor",
      difficulty_details:
        "Aucun signal utilisateur direct. Generer la suite prudemment, sans augmenter brutalement la charge.",
      pride:
        "Aucun bilan utilisateur disponible. Conserver ce qui etait structurellement pertinent dans le niveau precedent.",
      ...args.answers,
    }
    : args.answers;
  const answers = normalizeLevelReviewAnswers(schema, rawAnswers);
  const summary = buildLevelReviewSummary({
    items: planItems.filter((item) => item.phase_id === currentPhase.phase_id),
    answers,
  });
  const weeklySignals = await loadRecentWeeklySignals(args.admin, {
    userId: args.userId,
    cycleId: cycle.id,
    transformationId: transformation.id,
  });

  const transition = buildNextLevelTransition({
    plan: planContent,
    summary,
    currentPhase,
  });

  const reviewId = crypto.randomUUID();
  const generationEventId = crypto.randomUUID();

  const { error: reviewInsertError } = await args.admin
    .from("user_plan_level_reviews")
    .insert({
      id: reviewId,
      user_id: args.userId,
      cycle_id: cycle.id,
      transformation_id: transformation.id,
      plan_id: plan.id,
      phase_id: currentPhase.phase_id,
      level_order: currentPhase.phase_order,
      level_title: currentLevelRuntime.title,
      duration_weeks: currentLevelRuntime.duration_weeks,
      questionnaire_schema: schema,
      answers,
      review_summary: summary as unknown as Record<string, unknown>,
      notes: summary.free_text,
      review_mode: reviewMode,
      auto_reason: args.autoReason ?? null,
      created_at: now,
    } as never);

  if (reviewInsertError) {
    throw new CompleteLevelV1Error(500, "Failed to persist level review", {
      cause: reviewInsertError,
    });
  }

  const nextPhase = [...planContent.phases]
    .sort((left, right) => left.phase_order - right.phase_order)
    .find((phase) => phase.phase_order > currentPhase.phase_order) ?? null;
  const nextBlueprintLevel = findNextBlueprintLevel(planContent, currentPhase);
  const shouldGenerateNextLevel = Boolean(transition.nextRuntime || nextBlueprintLevel);
  const transitionDecisionReason = transition.nextRuntime
    ? transition.preview.reason
    : nextBlueprintLevel
    ? "Le niveau suivant est généré depuis le blueprint futur du plan, puis recalibré avec le bilan de fin de niveau."
    : transition.preview.reason;
  let resultingPlanContent: PlanContentV3;
  let resultingPlanId = plan.id;
  let nextRuntime = transition.nextRuntime;

  if (shouldGenerateNextLevel) {
    const regenerationFeedback = buildLevelCompletionRegenerationFeedback({
      plan: planContent,
      currentPhase,
      nextPhase,
      levelItems: planItems.filter((item) =>
        item.phase_id === currentPhase.phase_id
      ),
      schema,
      answers,
      summary: summary as unknown as Record<string, unknown>,
      weeklySignals,
      decision: transition.preview.decision,
      decisionReason: transitionDecisionReason,
      reviewMode,
    });

    const generated = await generatePlanV2ForTransformation({
      admin: args.admin,
      requestId: args.requestId,
      userId: args.userId,
      transformationId: transformation.id,
      mode: "generate_and_activate",
      feedback: regenerationFeedback,
      forceRegenerate: true,
      pace: null,
      previewPlanId: null,
      preserveActiveTransformationId: transformation.id,
      adjustmentContext: {
        reviewId,
        scope: "plan",
        effectiveStartDate: userTimeContext.user_local_date,
        reason: reviewMode === "auto_timeout"
          ? `Passage automatique apres le niveau ${currentPhase.phase_order}`
          : `Bilan de fin du niveau ${currentPhase.phase_order}`,
        userChangeSummary: reviewMode === "auto_timeout"
          ? "Validation automatique sans bilan utilisateur."
          : null,
        assistantMessage: transitionDecisionReason,
      },
    });

    resultingPlanContent = generated.plan;
    resultingPlanId = generated.planRow.id;
    nextRuntime = generated.plan.current_level_runtime ?? transition.nextRuntime;
  } else {
    resultingPlanContent = {
      ...planContent,
      plan_blueprint: transition.nextBlueprint,
      current_level_runtime: null,
    };

    const { error: planUpdateError } = await args.admin
      .from("user_plans_v2")
      .update({
        content: resultingPlanContent as unknown as Record<string, unknown>,
        status: "completed",
        completed_at: plan.completed_at ?? now,
        updated_at: now,
      })
      .eq("id", plan.id);

    if (planUpdateError) {
      throw new CompleteLevelV1Error(500, "Failed to update plan after level review", {
        cause: planUpdateError,
      });
    }
  }

  const { error: generationInsertError } = await args.admin
    .from("user_plan_level_generation_events")
    .insert({
      id: generationEventId,
      review_id: reviewId,
      user_id: args.userId,
      cycle_id: cycle.id,
      transformation_id: transformation.id,
      plan_id: plan.id,
      from_phase_id: currentPhase.phase_id,
      to_phase_id: nextRuntime?.phase_id ?? null,
      decision: transition.preview.decision,
      decision_reason: transitionDecisionReason,
      generation_input: {
        review_summary: summary,
        weekly_signals: weeklySignals,
        source_plan_id: plan.id,
        resulting_plan_id: resultingPlanId,
        used_ai_generation: shouldGenerateNextLevel,
      },
      previous_current_level_runtime: currentLevelRuntime as unknown as Record<string, unknown>,
      next_current_level_runtime: nextRuntime as unknown as Record<string, unknown> | null,
      previous_plan_blueprint:
        planContent.plan_blueprint as unknown as Record<string, unknown> | null,
      next_plan_blueprint:
        resultingPlanContent.plan_blueprint as unknown as Record<string, unknown> | null,
      created_at: now,
    } as never);

  if (generationInsertError) {
    throw new CompleteLevelV1Error(500, "Failed to persist level generation event", {
      cause: generationInsertError,
    });
  }

  if (reviewMode === "auto_timeout") {
    await autoCloseUnfinishedLevelItems({
      admin: args.admin,
      planItems: planItems.filter((item) => item.phase_id === currentPhase.phase_id),
      now,
      reason: args.autoReason ?? "level_auto_closed",
    });
  }

  await cancelPendingLevelReviewReminders({
    admin: args.admin,
    userId: args.userId,
    planId: plan.id,
    phaseId: currentPhase.phase_id,
    now,
  });

  try {
    await logV2Event(args.admin, V2_EVENT_TYPES.PHASE_TRANSITION, {
      user_id: args.userId,
      cycle_id: cycle.id,
      transformation_id: transformation.id,
      plan_id: resultingPlanId,
      reason: nextRuntime ? "level_review_completed_ai" : "final_level_completed",
      metadata: {
        review_id: reviewId,
        generation_event_id: generationEventId,
        from_phase_id: currentPhase.phase_id,
        to_phase_id: nextRuntime?.phase_id ?? null,
        decision: transition.preview.decision,
        source_plan_id: plan.id,
        resulting_plan_id: resultingPlanId,
      },
    });
  } catch {
    // Non-blocking audit logging.
  }

  const summaryText = nextRuntime
    ? `Niveau suivant prêt: ${nextRuntime.title}. ${transitionDecisionReason}`
    : "Dernier niveau validé. Le plan est maintenant terminé.";

  return {
    reviewId,
    generationEventId,
    decision: transition.preview.decision,
    decisionReason: transitionDecisionReason,
    summary: summaryText,
    nextLevel: nextRuntime
      ? {
          phase_id: nextRuntime.phase_id,
          level_order: nextRuntime.level_order,
          title: nextRuntime.title,
          duration_weeks: nextRuntime.duration_weeks,
        }
      : null,
  };
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

    const result = await completeLevelV1({
      admin,
      requestId,
      userId: authData.user.id,
      transformationId: parsedBody.data.transformation_id,
      planId: parsedBody.data.plan_id ?? null,
      answers: parsedBody.data.answers,
    });

    return jsonResponse(req, {
      request_id: requestId,
      review_id: result.reviewId,
      generation_event_id: result.generationEventId,
      decision: result.decision,
      decision_reason: result.decisionReason,
      summary: result.summary,
      next_level: result.nextLevel,
    });
  } catch (error) {
    const ctx = getRequestContext(req);
    await logEdgeFunctionError({
      functionName: "complete-level-v1",
      error,
      requestId,
      userId: ctx.userId,
      source: "edge",
      metadata: { route: "complete-level-v1" },
    });

    if (error instanceof CompleteLevelV1Error) {
      if (error.status === 400) return badRequest(req, requestId, error.message);
      return jsonResponse(
        req,
        { error: error.message, request_id: requestId },
        { status: error.status },
      );
    }

    return serverError(req, requestId, "Failed to complete current level");
  }
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
