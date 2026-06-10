/// <reference path="../../tsserver-shims.d.ts" />

import type { RouteDecision } from "../contracts/route_decision.v1.ts";
import type { ConversationSkillOutput } from "../contracts/skill_output.v1.ts";
import type { EffectLedger } from "./effect_ledger.ts";
import {
  recordBlockedEffect,
  rewriteUncommittedEffectClaims,
  summarizeEffectLedgerForTrace,
} from "./effect_ledger.ts";

export type FinalResponsePipelineResult = {
  responseContent: string;
  effectLedger: EffectLedger;
  guardEvents: string[];
  effectLedgerTrace?: unknown;
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
  applyMemoryV2ResponseGroundingGuardrail: (args: {
    userMessage: string;
    responseContent: string;
    contextBlock: string;
  }) => string;
  applyNonDurableMemoryPromiseGuard: (args: {
    userMessage: string;
    responseContent: string;
    routeDecision: RouteDecision | null;
  }) => string;
  applyWeeklyForgottenProgressAckGuard: (args: any) => string;
  applyWeeklyRepeatedClarificationGuard: (args: {
    responseContent: string;
    userMessage: string;
    activeSkillState: unknown;
    tempMemory: any;
  }) => string;
  applyWeeklyConcreteOrganizationGuard: (args: {
    responseContent: string;
    userMessage: string;
    activeSkillState: unknown;
    tempMemory: any;
    history: any[];
  }) => string;
  applyWeeklyConclusionGuard: (args: {
    responseContent: string;
    userMessage: string;
    activeSkillState: unknown;
    tempMemory: any;
  }) => string;
  applyCompactStartGuard: (args: {
    userMessage: string;
    responseContent: string;
  }) => string;
  applyIncompleteRecapGuard: (args: {
    userMessage: string;
    responseContent: string;
  }) => string;
  applyUnexecutedEffectClaimGuard: (args: {
    responseContent: string;
    intendedTools: string[];
    executedTools: string[];
  }) => string;
  applyCoachResponseStylePreferences: (args: any) => string;
  userRequestsShortStyle: (message: string) => boolean;
  normalizeRouteText: (text: string) => string;
  ensureVisibleSophiaEmoji: (text: unknown) => string;
};

// Final response policy: contract validation, EffectLedger grounding and
// non-mutating visibility guards stay centralized outside run.ts.
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
  history: any[];
  memoryV2ActiveContextBlock: string;
  loggedMessageId?: string | null;
  planItemSnapshot?: unknown[] | null;
  stylePreferences: unknown;
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
  responseContent = args.deps.applyMemoryV2ResponseGroundingGuardrail({
    userMessage: args.userMessage,
    responseContent,
    contextBlock: args.memoryV2ActiveContextBlock,
  });
  responseContent = args.deps.applyNonDurableMemoryPromiseGuard({
    userMessage: args.userMessage,
    responseContent,
    routeDecision: args.routeDecision,
  });
  responseContent = args.deps.applyWeeklyForgottenProgressAckGuard({
    responseContent,
    tempMemory: args.tempMemory,
    loggedMessageId: args.loggedMessageId,
  });
  responseContent = args.deps.applyWeeklyRepeatedClarificationGuard({
    responseContent,
    userMessage: args.userMessage,
    activeSkillState: args.activeSkillState,
    tempMemory: args.tempMemory,
  });
  responseContent = args.deps.applyWeeklyConcreteOrganizationGuard({
    responseContent,
    userMessage: args.userMessage,
    activeSkillState: args.activeSkillState,
    tempMemory: args.tempMemory,
    history: args.history,
  });
  responseContent = args.deps.applyWeeklyConclusionGuard({
    responseContent,
    userMessage: args.userMessage,
    activeSkillState: args.activeSkillState,
    tempMemory: args.tempMemory,
  });
  responseContent = args.deps.applyCompactStartGuard({
    userMessage: args.userMessage,
    responseContent,
  });
  responseContent = args.deps.applyIncompleteRecapGuard({
    userMessage: args.userMessage,
    responseContent,
  });
  if (!routeIsOrientationClarification) {
    responseContent = args.deps.applyUnexecutedEffectClaimGuard({
      responseContent,
      intendedTools: [
        ...(args.routeDecision?.direct_effects_to_run ?? []),
        ...(args.routeDecision?.selected_handler
          ? [args.routeDecision.selected_handler]
          : []),
      ],
      executedTools: [],
    });
  }

  const normalClaimRewrite = routeIsOrientationClarification
    ? { reply: responseContent, changed: false, reason_codes: [] }
    : rewriteUncommittedEffectClaims({
      reply: responseContent,
      ledger: args.effectLedger,
    });
  let effectLedgerTrace: unknown;
  if (normalClaimRewrite.changed) {
    guardEvents.push(...normalClaimRewrite.reason_codes);
    responseContent = normalClaimRewrite.reply;
    recordBlockedEffect(args.effectLedger, {
      effect_id: `${args.effectLedger.turn_id}:guard:${
        normalClaimRewrite.reason_codes.join("+")
      }`,
      effect_type: "final_reply.claim",
      source: "guard",
      reason_code: normalClaimRewrite.reason_codes.join(","),
      payload_summary: {
        reason_codes: normalClaimRewrite.reason_codes,
      },
    });
    effectLedgerTrace = summarizeEffectLedgerForTrace(args.effectLedger);
  }

  responseContent = args.deps.applyCoachResponseStylePreferences({
    userMessage: args.userMessage,
    responseContent,
    preferences: args.stylePreferences,
  });
  if (!routeIsSafety) {
    responseContent = args.deps.ensureVisibleSophiaEmoji(responseContent);
  }

  return {
    responseContent,
    effectLedger: args.effectLedger,
    guardEvents,
    effectLedgerTrace,
  };
}
