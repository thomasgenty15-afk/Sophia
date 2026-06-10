import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
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
import {
  isCopyForwardWeeklyRequest,
  isExplicitPendingApplyConfirmation,
  isVagueWholePlanWeeklyAdjustmentRequest,
  isWeeklyLightRepeatRequest,
  isWeeklyMissionCarryOverRequest,
  weeklyAdaptiveReviewStateForTurn,
  weeklyMissionCarryOverContext,
} from "../skills/weekly_review/runtime.ts";
import type { OperationRuntimeResult } from "./effect_ledger_adapter.ts";
import { operationRouteIsSelected } from "./operation_route_selection.ts";
import type { V2PlanItemSnapshotItem } from "./plan_snapshot_runtime.ts";
import {
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
  void message;
  return false;
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
      supabase: args.supabase,
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
      isExplicitPendingApplyConfirmation,
      isWeeklyMissionCarryOverRequest,
      weeklyMissionCarryOverContext,
      isCopyForwardWeeklyRequest,
      isWeeklyLightRepeatRequest,
      weeklyAdaptiveReviewStateForTurn: (
        { activeSkillState, tempMemory }: {
          activeSkillState: unknown;
          tempMemory: any;
        },
      ) => weeklyAdaptiveReviewStateForTurn({ activeSkillState, tempMemory }),
      normalizeRecommendationText,
      isAdjustPlanExplainOnlyIntent,
      isAdjustPlanRevisionIntent,
      operationRouteIsSelected,
      isVagueWholePlanWeeklyAdjustmentRequest,
      isBroaderPlanAdjustmentInput,
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
