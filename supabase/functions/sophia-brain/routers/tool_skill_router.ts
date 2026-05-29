import type { RiskBand, TurnFrame } from "../contracts/turn_frame.v1.ts";
import {
  assertConfirmationCanExecute,
  buildConfirmationDecisionFromSkillReview,
  type PendingConfirmationSnapshot,
  type SkillConfirmationReview,
} from "../router/confirmation_contract.ts";
import { blocksToolSkills } from "../safety/safety_thresholds.ts";

export type ToolSkillRouterStatus =
  | "start"
  | "continue"
  | "execute_confirmed"
  | "cancel"
  | "wait_for_confirmation"
  | "blocked"
  | "none";

export type ToolSkillRouterDecision = {
  status: ToolSkillRouterStatus;
  operation_type?: string;
  reason_code: string;
  blocked_paths: Array<{ path: string; reason_code: string }>;
};

function isSafetyBlocking(risk: RiskBand): boolean {
  return blocksToolSkills(risk);
}

function activeOperationType(state: unknown): string | null {
  return typeof (state as any)?.operation_type === "string"
    ? String((state as any).operation_type)
    : null;
}

function pendingOperationId(state: unknown): string | null {
  return typeof (state as any)?.operation_id === "string"
    ? String((state as any).operation_id)
    : null;
}

function confirmationReviewFromTurnFrameKind(
  kind: unknown,
): SkillConfirmationReview | null {
  switch (kind) {
    case "yes":
      return {
        decision: "approve",
        confidence: "medium",
        evidence: ["turn_frame.confirmation_response.yes"],
      };
    case "no":
      return {
        decision: "reject",
        confidence: "medium",
        evidence: ["turn_frame.confirmation_response.no"],
      };
    case "correction_to_pending":
      return {
        decision: "revise",
        confidence: "medium",
        evidence: ["turn_frame.confirmation_response.correction_to_pending"],
      };
    case "topic_change":
      return {
        decision: "topic_change",
        confidence: "medium",
        evidence: ["turn_frame.confirmation_response.topic_change"],
      };
    default:
      return null;
  }
}

export function runToolSkillRouter(input: {
  turn_frame: TurnFrame;
  active_tool_skill_intake?: unknown;
  pending_tool_skill_confirmation?: unknown;
  safety_pregate_risk_band: RiskBand;
}): ToolSkillRouterDecision {
  if (input.pending_tool_skill_confirmation) {
    if (isSafetyBlocking(input.safety_pregate_risk_band)) {
      return {
        status: "blocked",
        reason_code: "safety_blocks_tool_skill",
        blocked_paths: [{ path: "tool_skills", reason_code: "safety_high" }],
      };
    }
    const operationType =
      activeOperationType(input.pending_tool_skill_confirmation) ??
        activeOperationType(
          (input.pending_tool_skill_confirmation as any)?.draft,
        );
    const pendingSnapshot: PendingConfirmationSnapshot = {
      operation_id: pendingOperationId(input.pending_tool_skill_confirmation),
      operation_type: operationType,
      effect_type: operationType,
      summary: typeof (input.pending_tool_skill_confirmation as any)?.summary ===
          "string"
        ? String((input.pending_tool_skill_confirmation as any).summary)
        : null,
      draft: (input.pending_tool_skill_confirmation as any)?.draft ?? null,
    };
    const confirmationDecision = buildConfirmationDecisionFromSkillReview({
      review: confirmationReviewFromTurnFrameKind(
        input.turn_frame.confirmation_response?.kind,
      ),
      pending: pendingSnapshot,
      reason_code_prefix: "global_confirmation_contract",
    });
    const canExecute = assertConfirmationCanExecute(confirmationDecision);
    if (canExecute.ok) {
      return {
        status: "execute_confirmed",
        operation_type: operationType ?? undefined,
        reason_code: confirmationDecision.reason_code,
        blocked_paths: [],
      };
    }
    if (confirmationDecision.decision === "revise") {
      return {
        status: "continue",
        operation_type: operationType ?? undefined,
        reason_code: confirmationDecision.reason_code,
        blocked_paths: [],
      };
    }
    if (
      confirmationDecision.decision === "reject" ||
      confirmationDecision.decision === "unrelated" ||
      confirmationDecision.decision === "topic_change"
    ) {
      return {
        status: "cancel",
        operation_type: operationType ?? undefined,
        reason_code: confirmationDecision.reason_code,
        blocked_paths: [],
      };
    }
    return {
      status: "wait_for_confirmation",
      operation_type: operationType ?? undefined,
      reason_code: confirmationDecision.reason_code,
      blocked_paths: [],
    };
  }

  const active = activeOperationType(input.active_tool_skill_intake);
  if (active) {
    if (isSafetyBlocking(input.safety_pregate_risk_band)) {
      return {
        status: "blocked",
        operation_type: active,
        reason_code: "safety_blocks_tool_skill",
        blocked_paths: [{ path: "tool_skills", reason_code: "safety_high" }],
      };
    }
    return {
      status: "continue",
      operation_type: active,
      reason_code: "active_tool_skill_continue",
      blocked_paths: [],
    };
  }

  const intent =
    input.turn_frame.tool_skill_intents.find((candidate) =>
      candidate.confidence_band === "high" &&
      candidate.user_intent !== "explain_only"
    ) ?? input.turn_frame.tool_skill_intents[0];
  if (!intent) {
    return {
      status: "none",
      reason_code: "no_tool_skill_intent",
      blocked_paths: [],
    };
  }
  if (isSafetyBlocking(input.safety_pregate_risk_band)) {
    return {
      status: "blocked",
      operation_type: intent.operation_type,
      reason_code: "safety_blocks_tool_skill",
      blocked_paths: [{ path: "tool_skills", reason_code: "safety_high" }],
    };
  }
  if (intent.ambiguity !== "none") {
    return {
      status: "blocked",
      operation_type: intent.operation_type,
      reason_code: "tool_skill_target_ambiguous",
      blocked_paths: [{ path: "tool_skills", reason_code: intent.ambiguity }],
    };
  }
  return {
    status: "start",
    operation_type: intent.operation_type,
    reason_code: "tool_skill_intent_start",
    blocked_paths: [],
  };
}
