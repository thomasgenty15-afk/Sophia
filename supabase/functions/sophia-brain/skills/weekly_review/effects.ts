import type { WeeklyOperationRuntimeResult } from "./contract.ts";

export type WeeklyRuntimeEffectMarker = {
  status: "not_committed";
  reason: string;
};

export function weeklyRuntimeEffectFromOperation(
  operationRuntime: WeeklyOperationRuntimeResult,
): WeeklyRuntimeEffectMarker {
  return {
    status: "not_committed",
    reason: `tool_execution_${operationRuntime.toolExecution}`,
  };
}

export function markWeeklyAdaptiveReviewAdjustPlanApplied(args: {
  tempMemory: any;
  weeklyState: unknown;
  operationRuntime: WeeklyOperationRuntimeResult;
  userMessage?: string;
  assistantSummary?: string;
}): any {
  void args.weeklyState;
  void args.operationRuntime;
  void args.userMessage;
  void args.assistantSummary;
  return args.tempMemory;
}
