import type { WeeklyOperationRuntimeResult } from "./contract.ts";

export type WeeklyRuntimeEffectMarker =
  | {
    status: "committed";
    effect: "adjust_plan_item";
    operation_id?: unknown;
  }
  | { status: "not_committed"; reason: string };

export function weeklyRuntimeEffectFromOperation(
  operationRuntime: WeeklyOperationRuntimeResult,
): WeeklyRuntimeEffectMarker {
  return {
    status: "not_committed",
    reason: operationRuntime.toolExecution === "platform_handoff"
      ? "adjust_plan_item_platform_input_only"
      : `tool_execution_${operationRuntime.toolExecution}`,
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
