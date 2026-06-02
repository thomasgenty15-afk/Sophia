import type {
  AdjustPlanCommittedEffect,
  AdjustPlanEffect,
  AdjustPlanOperationRuntimeResult,
  AdjustPlanSkillResult,
  AdjustPlanUserIntent,
} from "./contract.ts";
import type { PlanAdjustmentDraftV1 } from "./generator.ts";

type RuntimeAdapterInput = {
  content: string;
  additionalContents?: string[];
  nextTempMemory: any;
  skillResult: AdjustPlanSkillResult;
  toolSkillRun?: Record<string, unknown>;
  toolExecution?: AdjustPlanOperationRuntimeResult["toolExecution"];
};

export function adjustPlanEffect(args: {
  operationId: string;
  draft: PlanAdjustmentDraftV1;
}): AdjustPlanEffect {
  return {
    type: "adjust_plan_item",
    operation_id: args.operationId,
    draft: args.draft,
  };
}

export function adjustPlanSkillResult(args: {
  handled?: boolean;
  status: AdjustPlanSkillResult["status"];
  userIntent: AdjustPlanUserIntent;
  reply: string | null;
  reasonCode: string;
  draft?: PlanAdjustmentDraftV1 | null;
  operationId?: string | null;
  requestedEffects?: AdjustPlanEffect[];
  allowedEffects?: AdjustPlanEffect[];
  blockedEffects?: Array<{ type: string; reason_code: string }>;
  committedEffects?: AdjustPlanCommittedEffect[];
  pendingConfirmation?: Record<string, unknown> | null;
  subSkillTrace?: unknown;
  updatedState?: AdjustPlanSkillResult["updated_state"];
}): AdjustPlanSkillResult {
  const requestedEffects = args.requestedEffects ??
    (args.draft && args.operationId
      ? [adjustPlanEffect({ operationId: args.operationId, draft: args.draft })]
      : []);
  return {
    handled: args.handled ?? true,
    status: args.status,
    user_intent: args.userIntent,
    updated_state: args.updatedState,
    reply: args.reply,
    requested_effects: requestedEffects,
    allowed_effects: args.allowedEffects ?? [],
    blocked_effects: args.blockedEffects ?? [],
    committed_effects: args.committedEffects ?? [],
    pending_confirmation: args.pendingConfirmation ?? null,
    debug: {
      reason_code: args.reasonCode,
      sub_skill_trace: args.subSkillTrace,
    },
  };
}

export function adaptSkillResultToRuntime(
  input: RuntimeAdapterInput,
): AdjustPlanOperationRuntimeResult {
  const committed = input.skillResult.committed_effects;
  const toolExecution = input.toolExecution ??
    (committed.length > 0
      ? "success"
      : input.skillResult.status === "failed"
      ? "failed"
      : input.skillResult.status === "blocked" ||
          input.skillResult.status === "cancelled" ||
          input.skillResult.status === "revised"
      ? "blocked"
      : "none");
  return {
    content: input.content,
    additionalContents: input.additionalContents,
    nextTempMemory: input.nextTempMemory,
    toolExecution,
    executedTools: committed.length > 0 ? ["adjust_plan_item"] : [],
    toolSkillRun: {
      selected_handler: "adjust_plan_item",
      status: input.skillResult.status,
      reason_code: input.skillResult.debug.reason_code,
      requested_effects: input.skillResult.requested_effects,
      allowed_effects: input.skillResult.allowed_effects,
      blocked_effects: input.skillResult.blocked_effects,
      committed_effects: committed,
      skill_result: input.skillResult,
      user_intent: input.skillResult.user_intent,
      ...(input.toolSkillRun ?? {}),
    },
  };
}

function skillStatusFromRuntimeStatus(
  value: unknown,
  toolExecution: AdjustPlanOperationRuntimeResult["toolExecution"],
): AdjustPlanSkillResult["status"] {
  const status = String(value ?? "");
  if (
    status === "draft_review" || status === "draft_review_from_recommendation"
  ) {
    return "draft_review";
  }
  if (status === "draft_review_updated") return "revised";
  if (
    status === "draft_review_details" ||
    status === "answered_last_adjustment_details"
  ) {
    return "explained";
  }
  if (
    status === "draft_review_cancelled" ||
    status === "recommendation_cancelled"
  ) return "cancelled";
  if (status === "pending_confirmation") return "pending_confirmation";
  if (status === "handoff_ready") return "handoff_ready";
  if (status === "handoff_delivered") return "handoff_delivered";
  if (status === "ask_question" || status === "collecting") {
    return "ask_question";
  }
  if (toolExecution === "failed") return "failed";
  if (toolExecution === "success") return "executed";
  if (toolExecution === "blocked") return "blocked";
  return "ask_question";
}

export function ensureRuntimeHasSkillResult(
  result: AdjustPlanOperationRuntimeResult,
): AdjustPlanOperationRuntimeResult {
  const existing = (result.toolSkillRun as any)?.skill_result;
  if (existing && typeof existing === "object") return result;
  const committed =
    Array.isArray((result.toolSkillRun as any)?.committed_effects)
      ? (result.toolSkillRun as any).committed_effects
      : [];
  const skillResult = adjustPlanSkillResult({
    status: skillStatusFromRuntimeStatus(
      (result.toolSkillRun as any)?.status,
      result.toolExecution,
    ),
    userIntent: "unknown",
    reply: result.content,
    reasonCode: String(
      (result.toolSkillRun as any)?.reason_code ?? "runtime_adapter",
    ),
    committedEffects: committed,
  });
  return adaptSkillResultToRuntime({
    content: result.content,
    additionalContents: result.additionalContents,
    nextTempMemory: result.nextTempMemory,
    skillResult,
    toolExecution: result.toolExecution,
    toolSkillRun: result.toolSkillRun,
  });
}
