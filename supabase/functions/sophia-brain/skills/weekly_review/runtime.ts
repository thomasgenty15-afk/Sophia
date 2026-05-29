/// <reference path="../../../tsserver-shims.d.ts" />

export type { WeeklyOperationRuntimeResult } from "./contract.ts";

export {
  isCopyForwardWeeklyRequest,
  isWeeklyLightRepeatRequest,
  isWeeklyMissionCarryOverRequest,
  weeklyMissionCarryOverContext,
} from "../../tools/operations/adjust_plan_item/weekly_bridge.ts";

export {
  clearWeeklyReviewState,
  isWeeklyAdaptiveReviewActive,
  isWeeklyReviewActive,
  readWeeklyReviewState,
  updateWeeklyAdaptiveReviewStateAfterConversationTurn,
  updateWeeklyReviewStateAfterTurn,
  weeklyAdaptiveReviewStateForTurn,
  writeWeeklyReviewState,
} from "./state.ts";

export {
  buildWeeklyTurnSlotAddon,
  cleanWeeklyVisibleResponse,
  renderWeeklyResponseWithEffects,
  stripVisibleWeeklyInternalSummary,
  stripWeeklyInternalVocabulary,
  stripWeeklySupportItemsFromResponse,
  summarizeWeeklyAdaptiveReviewForAddon,
  weeklyReturnAfterAdjustmentMessage,
} from "./renderer.ts";

export {
  applyWeeklyConclusionGuard,
  applyWeeklyConcreteOrganizationGuard,
  applyWeeklyForgottenProgressAckGuard,
  applyWeeklyRepeatedClarificationGuard,
} from "./guards.ts";

export {
  hasPendingOrActiveAdjustPlanOperation,
  isExplicitWeeklyAdjustPlanRequest,
  isVagueWholePlanWeeklyAdjustmentRequest,
  operationInputFromPlanAdjustmentScope,
  shouldKeepWeeklyAdaptiveReviewInConversation,
  weeklyBridgeDoesNotApplyDirectly,
  weeklyReviewAllowsAdjustPlanBridge,
} from "./bridges.ts";

export {
  isEarlyWeeklyPlanningValidationRequest,
  isExplicitPendingApplyConfirmation,
  reviewWeeklyReviewConfirmation,
  weeklyPatchConfirmationClearsPending,
  weeklyReviewConfirmationClearsPending,
} from "./confirmation.ts";
export type { WeeklyReviewConfirmationDecision } from "./confirmation.ts";

export {
  maybeLogWeeklyForgottenProgressParallel,
  resolveWeeklyForgottenProgressCandidate,
  resolveWeeklyForgottenProgressCandidates,
  weeklyForgottenProgressHasClearTarget,
} from "./evidence.ts";

export {
  markWeeklyAdaptiveReviewAdjustPlanApplied,
  weeklyRuntimeEffectFromOperation,
} from "./effects.ts";
export type { WeeklyRuntimeEffectMarker } from "./effects.ts";
