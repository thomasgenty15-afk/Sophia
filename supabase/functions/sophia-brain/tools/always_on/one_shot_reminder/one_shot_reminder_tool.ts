// Legacy compatibility facade. Do not add runtime logic here.
// Runtime source of truth is contract -> intake/parser -> reducer ->
// effect_plan -> executor -> renderer, wired by router.ts.

export type {
  CancelOneShotReminderOutcome,
  CreateOneShotReminderV2Outcome,
  CreateOneShotReminderV2Write,
  OneShotReminderToolOutcome,
} from "./contract.ts";

export {
  maybeCancelOneShotReminder,
  maybeCreateOneShotReminder,
  runCreateOneShotReminderV2,
} from "./executor.ts";

export {
  detectsReminderAnaphora,
  extractQuotedReminderInstruction,
  extractReminderInstruction,
  isDegenerateReminderInstruction,
  isDegenerateReminderInstruction as isDegenerateReminderInstructionForTest,
  loadLastReminderInstructionForUser,
} from "./instruction_parser.ts";

export {
  parseOneShotReminderRequest,
  parseReminderFromMessageDeterministic,
  parseScheduledForFromMessage,
} from "./time_parser.ts";

export {
  detectsExplicitOneShotReminderCancel,
  detectsExplicitOneShotReminderCancel as detectsExplicitOneShotReminderCancelForTest,
  isExistingOneShotReminderReferenceOnly,
  isExplicitOneShotReminderModificationRequest,
  isExplicitOneShotReminderModificationRequest as isExplicitOneShotReminderModificationRequestForTest,
  isLikelyOneShotReminderRequest,
  isOneShotReminderExactStatusRequest,
  isOneShotReminderExactStatusRequest as isOneShotReminderExactStatusRequestForTest,
  isOneShotReminderOperationCommand,
  isOneShotReminderOperationCommand as isOneShotReminderOperationCommandForTest,
  looksLikeReminderCreationCommand,
  looksLikeReminderCreationCommand as looksLikeReminderCreationCommandForTest,
  looksLikeReminderExecutionConfirmation,
  looksLikeReminderExecutionConfirmation as looksLikeReminderExecutionConfirmationForTest,
  looksLikeReminderSlotConfirmation,
  looksLikeReminderSlotConfirmation as looksLikeReminderSlotConfirmationForTest,
  oneShotReminderDirectEffectBlockForNonMutationContext,
  oneShotReminderDirectEffectBlockForNonMutationContext as oneShotReminderDirectEffectBlockForNonMutationContextForTest,
  oneShotReminderModificationRouteGuard,
  oneShotReminderModificationRouteGuard as oneShotReminderModificationRouteGuardForTest,
  oneShotReminderStatusBlocksToolFlow,
  oneShotReminderStatusBlocksToolFlow as oneShotReminderStatusBlocksToolFlowForTest,
  shouldPreferOneShotReminderOverRecurring,
  shouldPreferOneShotReminderOverRecurring as shouldPreferOneShotReminderOverRecurringForTest,
} from "./route_guards.ts";

export {
  buildMinuteByMinuteSequenceAddonForOneShotReminder as buildMinuteByMinuteSequenceAddonForTest,
  buildOneShotReminderAddon,
  localTextAddonForOneShotReminder as localTextAddonForOneShotReminderForTest,
  oneShotReminderManagementReply as oneShotReminderManagementReplyForTest,
  summarizeOneShotReminderOutcome,
} from "./renderer.ts";
