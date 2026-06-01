import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { getUserTimeContext } from "../../_shared/user_time_context.ts";
import { generatePlanV2ForTransformation } from "../../generate-plan-v2/index.ts";
import type { RouteDecision } from "../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";
import { runSafetyPregate } from "../safety/safety_pregate.ts";
import {
  reviewToolSkillConfirmationWithAi,
  type ToolSkillConfirmationKind,
} from "../tools/operations/_shared/confirmation_review.ts";
import {
  maybeRunAdjustPlanItemOperation as maybeRunAdjustPlanItemOperationInSkill,
} from "../tools/operations/adjust_plan_item/router.ts";
import { isPendingAdjustPlanItemRecommendationOperation } from "../tools/operations/adjust_plan_item/state.ts";
import { writePlanAdjustmentPatch } from "../tools/operations/adjust_plan_item/materializer.ts";
import {
  isCopyForwardWeeklyRequest,
  isExplicitPendingApplyConfirmation,
  isVagueWholePlanWeeklyAdjustmentRequest,
  isWeeklyLightRepeatRequest,
  isWeeklyMissionCarryOverRequest,
  operationInputFromPlanAdjustmentScope,
  weeklyAdaptiveReviewStateForTurn,
  weeklyMissionCarryOverContext,
} from "../skills/weekly_review/runtime.ts";
import type { OperationRuntimeResult } from "./effect_ledger_adapter.ts";
import { operationRouteIsSelected } from "./operation_route_selection.ts";
import type { V2PlanItemSnapshotItem } from "./plan_snapshot_runtime.ts";
import {
  normalizePlanTargetText,
  operationInputFromLastPlanItem,
  planItemTitleFromOperationInput,
  readLastResolvedPlanItem,
  resolvePlanItemTargetFromToolSkillIntent,
  writeLastResolvedPlanItem,
} from "./plan_targeting_support.ts";
import { normalizeRecommendationText } from "./recommendation_runtime_support.ts";

export function isOperationCorrectionOrSafetyInterruption(
  message: string,
): boolean {
  const text = normalizePlanTargetText(message);
  if (!text) return false;
  return (
    /\bje n ai pas demande\b|\bje nai pas demande\b|\bpas demande de rappel\b|\bje voulais surtout\b|\bje parle surtout\b/
      .test(text) ||
    /\bdisparaitre\b|\bdisparaitre ferait une pause\b|\bplus la\b|\bplus là\b|\bme faire du mal\b|\bsuicid|\ben finir\b|\bmourir\b/
      .test(text)
  );
}

function envString(name: string, fallback = ""): string {
  let raw = "";
  try {
    const denoEnv = (globalThis as any)?.Deno?.env;
    raw = String(denoEnv?.get?.(name) ?? "").trim();
  } catch {
    return fallback;
  }
  return raw || fallback;
}

export async function detectConfirmationKind(args: {
  userMessage: string;
  operationType?: string;
  pendingContext?: unknown;
  requestId?: string | null;
  structuredOnly?: boolean;
}): Promise<ToolSkillConfirmationKind> {
  void args.structuredOnly;
  return await reviewToolSkillConfirmationWithAi({
    operation_type: args.operationType ?? "pending_operation",
    message: args.userMessage,
    pending_context: args.pendingContext ?? null,
    request_id: args.requestId ?? null,
  });
}

function isBroaderPlanAdjustmentInput(value: Record<string, unknown> | null) {
  const scopeKind = String((value as any)?.scope?.kind ?? "").trim();
  const granularity = String(
    (value as any)?.target_granularity?.value ??
      (value as any)?.target_granularity ??
      "",
  ).trim();
  return scopeKind === "current_level" || scopeKind === "whole_plan" ||
    granularity === "action_cluster" || granularity === "current_level" ||
    granularity === "whole_plan";
}

function adjustPlanScopeKindFromOperationInput(
  value: Record<string, unknown> | null,
): string {
  if (!value || typeof value !== "object") return "";
  return String((value as any)?.scope?.kind ?? "").trim();
}

function mergeActiveAdjustPlanOperationInput(args: {
  active: Record<string, unknown> | null;
  scoped: Record<string, unknown> | null;
}): Record<string, unknown> | null {
  if (!args.active) return args.scoped;
  if (!args.scoped) return args.active;
  const activeScope = adjustPlanScopeKindFromOperationInput(args.active);
  const scopedScope = adjustPlanScopeKindFromOperationInput(args.scoped);
  const activeIsBroad = activeScope === "current_level" ||
    activeScope === "whole_plan";
  const scopedIsSpecific = scopedScope === "specific_plan_item";
  if (activeIsBroad && scopedIsSpecific) {
    return {
      ...args.active,
      latest_turn_operation_input: args.scoped,
      latest_turn_affected_item_hint: (args.scoped as any).scope ??
        (args.scoped as any).target ?? null,
    };
  }
  return {
    ...args.active,
    ...args.scoped,
    intake_state: (args.active as any).intake_state ??
      (args.scoped as any).intake_state,
    payload: (args.active as any).payload ?? (args.scoped as any).payload,
    latest_turn_operation_input: args.scoped,
  };
}

function adjustPlanIntentUserIntent(
  turnFrame: TurnFrame | null,
): TurnFrame["tool_skill_intents"][number]["user_intent"] | null {
  const intent = (turnFrame?.tool_skill_intents ?? []).find((candidate) =>
    candidate.operation_type === "adjust_plan_item" &&
    candidate.confidence_band !== "low"
  );
  return intent?.user_intent ?? null;
}

function isAdjustPlanExplainOnlyIntent(turnFrame: TurnFrame | null): boolean {
  return adjustPlanIntentUserIntent(turnFrame) === "explain_only";
}

function isAdjustPlanRevisionIntent(turnFrame: TurnFrame | null): boolean {
  return adjustPlanIntentUserIntent(turnFrame) === "adjust";
}

export function hasStrongToolSkillIntent(
  turnFrame: TurnFrame | null,
  operationType?: string,
): boolean {
  return (turnFrame?.tool_skill_intents ?? []).some((intent) =>
    (!operationType || intent.operation_type === operationType) &&
    intent.confidence_band !== "low" &&
    intent.user_intent !== "explain_only" &&
    intent.ambiguity === "none"
  );
}

function isAmbivalentAdjustPlanReflectionRequest(text: string): boolean {
  const normalized = normalizeRecommendationText(text).replace(/\s+/g, " ")
    .trim();
  if (!normalized) return false;

  const hasAmbivalence =
    /\b(je ne suis pas sur|je suis pas sur|pas sur|pas sure|pas certain|pas certaine|j'hesite|j hesite|je me demande|une partie de moi|je me dis|reaction de fatigue)\b/
      .test(normalized);
  const asksForReflection =
    /\b(aide[- ]?moi a reflechir|reflechir|bonne idee|est ce que c'est|est-ce que c'est|plutot)\b/
      .test(normalized);
  const mentionsAdjustment =
    /\b(ajuster|modifier|changer|baisser|descendre|diminuer|reduire|alleger|laisser tomber|retirer|supprimer|rythme|fois|jour)\b/
      .test(normalized);
  const directAdjustmentCommand =
    /\b(je veux|passe|mets|met|applique|valide|confirme|modifie|change|ajuste|baisse|descends|diminue|reduis|allege|prepare un brouillon|propose[- ]?moi un brouillon)\b/
      .test(normalized);

  return mentionsAdjustment && (hasAmbivalence || asksForReflection) &&
    !directAdjustmentCommand;
}

export function isOperationEscapeMessage(message: string): boolean {
  const text = normalizePlanTargetText(message);
  if (!text) return false;
  return (
    /\b(resume|recap|recapitule|qu est ce qui existe|ce qui existe|dans mon plan|sans inventer)\b/
      .test(text) ||
    /\b(pas maintenant|annule|annuler|laisse tomber|oublie|stop|stop carte|pas de carte|pas une carte|pas d action|pas de plan|pas envie qu on me fasse un plan|je veux juste rester|juste une phrase|une seule phrase|rester sur l apaisement|apaisement|fond de honte)\b/
      .test(text)
  );
}

export function isImplicitWholePlanRepairAdjustmentRequest(
  message: string,
): boolean {
  const text = normalizeRecommendationText(message);
  const planTrajectoryContext =
    /\b(plan|suite du plan|prochaine partie|partie suivante|prochaine etape|prochaine étape|niveau suivant|trajectoire)\b/
      .test(text);
  const repairBridge =
    /\b(mini marche|petite marche|marche|etape|étape|palier|transition|pont)\b/
      .test(text) ||
    /\b(avant de reparler du fond|avant de reparler|avant d analyser|avant d'analyser)\b/
      .test(text);
  const reconnectionNeed =
    /\b(revenir en lien|retour en lien|retour au lien|retour au contact|se retrouver|reconnexion|reconnecter|reparer|réparer|reparation|réparation)\b/
      .test(text) &&
    /\b(apres un accrochage|apres accrochage|apres une dispute|apres dispute|apres tension|apres une tension|après un accrochage|après une dispute|après tension|fond|dispute|tension|accrochage)\b/
      .test(text);
  return planTrajectoryContext && repairBridge && reconnectionNeed;
}

export async function maybeRunAdjustPlanItemOperation(args: {
  supabase: SupabaseClient;
  userId: string;
  userMessage: string;
  channel: "web" | "whatsapp";
  userTimezone: string;
  history: any[];
  tempMemory: any;
  planItemSnapshot?: V2PlanItemSnapshotItem[];
  turnFrame: TurnFrame | null;
  routeDecision: RouteDecision | null;
  safetyPregateOutput: ReturnType<typeof runSafetyPregate>;
  sourceMessageId: string | null;
  requestId?: string | null;
  forceFullAi?: boolean;
  enableAdjustPlanCoachGuidance?: boolean;
}): Promise<OperationRuntimeResult | null> {
  return await maybeRunAdjustPlanItemOperationInSkill({
    context: {
      userId: args.userId,
      userMessage: args.userMessage,
      channel: args.channel,
      userTimezone: args.userTimezone,
      history: args.history,
      tempMemory: args.tempMemory,
      planItemSnapshot: args.planItemSnapshot,
      turnFrame: args.turnFrame,
      routeDecision: args.routeDecision,
      safetyPregateOutput: args.safetyPregateOutput,
      sourceMessageId: args.sourceMessageId,
      requestId: args.requestId ?? null,
      forceFullAi: args.forceFullAi,
      enableAdjustPlanCoachGuidance: args.enableAdjustPlanCoachGuidance,
      confirmationSecret: envString(
        "CONFIRMATION_TOKEN_SECRET",
        envString("INTERNAL_FUNCTION_SECRET", "local-confirmation-secret"),
      ),
    },
    deps: {
      writePlanPatch: async (input) =>
        await writePlanAdjustmentPatch({
          supabase: args.supabase,
          userId: args.userId,
          draft: input.draft,
          operationInput: input.operationInput ?? null,
          operationId: input.operationId,
          requestId: input.requestId ?? null,
          sourceMessageId: input.sourceMessageId ?? null,
          regenerateAdjustedPlan: async (regenerationInput) => {
            const userTime = await getUserTimeContext({
              supabase: args.supabase,
              userId: args.userId,
            }).catch(() => null);
            const result = await generatePlanV2ForTransformation({
              admin: args.supabase,
              requestId: args.requestId ?? crypto.randomUUID(),
              userId: args.userId,
              transformationId: regenerationInput.transformationId,
              mode: "generate_and_activate",
              feedback: regenerationInput.feedback,
              forceRegenerate: true,
              pace: null,
              preserveActiveTransformationId:
                regenerationInput.transformationId,
              adjustmentContext: {
                reviewId: input.operationId,
                scope: regenerationInput.scopeKind === "current_level"
                  ? "level"
                  : "plan",
                effectiveStartDate: userTime?.user_local_date ??
                  new Date().toISOString().slice(0, 10),
                reason: regenerationInput.reason,
                userChangeSummary: regenerationInput.userChangeSummary,
                assistantMessage: regenerationInput.assistantMessage,
              },
            });
            return {
              plan_id: result.planRow.id,
              roadmap_changed: result.roadmapChanged,
            };
          },
        }),
      isExplicitPendingApplyConfirmation,
      isWeeklyMissionCarryOverRequest,
      weeklyMissionCarryOverContext,
      isCopyForwardWeeklyRequest,
      isWeeklyLightRepeatRequest,
      weeklyAdaptiveReviewStateForTurn: ({ activeSkillState, tempMemory }) =>
        weeklyAdaptiveReviewStateForTurn({ activeSkillState, tempMemory }),
      normalizeRecommendationText,
      isAdjustPlanExplainOnlyIntent,
      isAdjustPlanRevisionIntent,
      operationRouteIsSelected,
      operationInputFromPlanAdjustmentScope,
      isVagueWholePlanWeeklyAdjustmentRequest,
      isPendingAdjustPlanItemRecommendationOperation,
      isBroaderPlanAdjustmentInput,
      isAmbivalentAdjustPlanReflectionRequest,
      isOperationEscapeMessage,
      hasStrongToolSkillIntent,
      readLastResolvedPlanItem,
      resolvePlanItemTargetFromToolSkillIntent,
      writeLastResolvedPlanItem,
      mergeActiveAdjustPlanOperationInput,
      operationInputFromLastPlanItem,
      planItemTitleFromOperationInput,
    },
  }) as OperationRuntimeResult | null;
}
