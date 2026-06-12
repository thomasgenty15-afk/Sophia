/// <reference path="../../tsserver-shims.d.ts" />

import type { RouteDecision } from "../contracts/route_decision.v1.ts";
import type { ConversationSkillOutput } from "../contracts/skill_output.v1.ts";
import type { EffectLedger } from "./effect_ledger.ts";

export type FinalResponsePipelineResult = {
  responseContent: string;
  effectLedger: EffectLedger;
  guardEvents: string[];
};

export type FinalResponsePipelineDeps = {
  directSafetyCrisisReplyOverride: (args: {
    routeDecision: RouteDecision | null;
    skillOutput: ConversationSkillOutput | null;
  }) => string | null;
  directConversationSkillReplyOverride: (args: {
    routeDecision: RouteDecision | null;
    skillOutput: ConversationSkillOutput | null;
  }) => string | null;
  oneShotReminderManagementReply: (message: string) => string | null;
  enforceRecommendationToolVisibleReply: (args: any) => string;
  stripHiddenHtmlComments: (text: unknown) => string;
  stripDeprecatedProductVocabulary: (text: string) => string;
  weeklyAdaptiveReviewStateForTurn: (args: {
    activeSkillState: unknown;
    tempMemory: any;
  }) => unknown;
  cleanWeeklyVisibleResponse: (text: string) => string;
  ensureVisibleSophiaEmoji: (text: unknown) => string;
};

// Final response policy: visible rendering guards stay centralized outside
// run.ts. Durable mutation guarantees belong to the operation/sflow contracts.
export function runFinalResponsePipeline(args: {
  baseResponseContent: string;
  userMessage: string;
  routeDecision: RouteDecision | null;
  skillOutput: ConversationSkillOutput | null;
  recommendation: unknown;
  recommendationSurfaceLabel?: string | null;
  effectLedger: EffectLedger;
  activeSkillState: unknown;
  tempMemory: any;
  planItemSnapshot?: unknown[] | null;
  deps: FinalResponsePipelineDeps;
}): FinalResponsePipelineResult {
  const guardEvents: string[] = [];
  const routeIsOrientationClarification =
    args.routeDecision?.response_owner === "orientation_clarification";
  const routeIsSafety = args.routeDecision?.response_owner === "safety" ||
    args.routeDecision?.selected_handler === "safety_crisis";
  const baseResponseContent = String(args.baseResponseContent ?? "").trim();
  let responseContent = args.deps.directSafetyCrisisReplyOverride({
    routeDecision: args.routeDecision,
    skillOutput: args.skillOutput,
  }) ?? args.deps.directConversationSkillReplyOverride({
    routeDecision: args.routeDecision,
    skillOutput: args.skillOutput,
  }) ??
    (routeIsOrientationClarification
      ? baseResponseContent
      : args.deps.oneShotReminderManagementReply(args.userMessage) ??
        baseResponseContent);

  if (
    args.routeDecision?.response_owner !== "product_help" &&
    !routeIsOrientationClarification
  ) {
    responseContent = args.deps.enforceRecommendationToolVisibleReply({
      responseContent,
      userMessage: args.userMessage,
      recommendation: args.recommendation,
      surfaceLabel: args.recommendationSurfaceLabel,
      tempMemory: args.tempMemory,
      planItemSnapshot: args.planItemSnapshot,
    });
  }
  responseContent = args.deps.stripHiddenHtmlComments(responseContent);
  responseContent = args.deps.stripDeprecatedProductVocabulary(responseContent);
  if (
    args.deps.weeklyAdaptiveReviewStateForTurn({
      activeSkillState: args.activeSkillState,
      tempMemory: args.tempMemory,
    })
  ) {
    responseContent = args.deps.cleanWeeklyVisibleResponse(responseContent);
  }
  if (!routeIsSafety) {
    responseContent = args.deps.ensureVisibleSophiaEmoji(responseContent);
  }

  return {
    responseContent,
    effectLedger: args.effectLedger,
    guardEvents,
  };
}
