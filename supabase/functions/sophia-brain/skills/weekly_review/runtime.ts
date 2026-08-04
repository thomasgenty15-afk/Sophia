/// <reference path="../../../tsserver-shims.d.ts" />

export type { WeeklyOperationRuntimeResult } from "./contract.ts";

export {
  isCopyForwardWeeklyRequest,
  isExplicitPendingApplyConfirmation,
  isWeeklyLightRepeatRequest,
  isWeeklyMissionCarryOverRequest,
  weeklyMissionCarryOverContext,
} from "./bridges.ts";

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
  hasPendingOrActiveAdjustPlanOperation,
  isExplicitWeeklyAdjustPlanRequest,
  isVagueWholePlanWeeklyAdjustmentRequest,
  operationInputFromPlanAdjustmentScope,
  shouldKeepWeeklyAdaptiveReviewInConversation,
  weeklyBridgeDoesNotApplyDirectly,
  weeklyReviewAllowsAdjustPlanBridge,
} from "./bridges.ts";

export {
  markWeeklyAdaptiveReviewAdjustPlanApplied,
  weeklyRuntimeEffectFromOperation,
} from "./effects.ts";
export type { WeeklyRuntimeEffectMarker } from "./effects.ts";

export {
  normalizeWeeklyReviewLocalDispatcherOutput,
  oneShotDirectEffectFromWeeklyReviewLocalDispatcherOutput,
  recentMessagesFromHistory,
  reduceWeeklyReviewLocalDispatcherOutput,
  runWeeklyReviewLocalDispatcher,
  runWeeklyReviewLocalRuntime,
  WEEKLY_REVIEW_EXIT_MEMO_KEY,
} from "./local_flow.ts";
export type {
  WeeklyReviewExitMemo,
  WeeklyReviewLocalDispatcherOutput,
  WeeklyReviewLocalFlowAction,
  WeeklyReviewLocalFlowState,
  WeeklyReviewReducerResult,
  WeeklyReviewVisibleTaskKind,
} from "./local_flow.ts";
