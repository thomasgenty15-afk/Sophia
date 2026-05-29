import type { TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import {
  assertConfirmationCanExecute,
  buildConfirmationDecisionFromSkillReview,
  normalizeSkillConfirmationReview,
  type ConfirmationDecision,
  type ConfirmationDecisionKind,
  type PendingConfirmationSnapshot,
  type SkillConfirmationReview,
} from "../../../router/confirmation_contract.ts";
import { blocksToolSkills } from "../../../safety/safety_thresholds.ts";

export type ToolConfirmationDecision = ConfirmationDecision & {
  executable: boolean;
  source: "turn_frame" | "local_review" | "missing";
  legacy_local_review_used: boolean;
  blocked_by: string[];
};

type LegacyConfirmationKind =
  | "yes"
  | "no"
  | "correction_to_pending"
  | "topic_change"
  | "unknown";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function confidenceFromTurnFrame(value: unknown): "low" | "medium" | "high" {
  return value === "high" || value === "medium" || value === "low"
    ? value
    : "medium";
}

function reviewFromConfirmationKind(
  kind: unknown,
  confidence: unknown,
): SkillConfirmationReview | null {
  const confidenceBand = confidenceFromTurnFrame(confidence);
  switch (kind) {
    case "yes":
      return {
        decision: "approve",
        confidence: confidenceBand,
        evidence: ["turn_frame.confirmation_response.yes"],
      };
    case "no":
      return {
        decision: "reject",
        confidence: confidenceBand,
        evidence: ["turn_frame.confirmation_response.no"],
      };
    case "correction_to_pending":
      return {
        decision: "revise",
        confidence: confidenceBand,
        evidence: ["turn_frame.confirmation_response.correction_to_pending"],
      };
    case "topic_change":
      return {
        decision: "topic_change",
        confidence: confidenceBand,
        evidence: ["turn_frame.confirmation_response.topic_change"],
      };
    case "unknown":
      return {
        decision: "unclear",
        confidence: "low",
        evidence: ["turn_frame.confirmation_response.unknown"],
      };
    default:
      return null;
  }
}

function reviewFromLegacyLocal(value: unknown): SkillConfirmationReview | null {
  if (typeof value === "string") {
    const kind = value as LegacyConfirmationKind;
    return reviewFromConfirmationKind(kind, "medium");
  }
  return normalizeSkillConfirmationReview(value);
}

function pendingSnapshot(args: {
  pending_confirmation: unknown;
  operation_type: string;
}): PendingConfirmationSnapshot | null {
  const pending = isRecord(args.pending_confirmation)
    ? args.pending_confirmation
    : null;
  if (!pending) return null;
  const draft = isRecord(pending.draft) ? pending.draft : null;
  const operationType = String(
    pending.operation_type ?? draft?.operation_type ?? args.operation_type,
  ).trim();
  return {
    operation_id: typeof pending.operation_id === "string"
      ? pending.operation_id
      : null,
    operation_type: operationType || args.operation_type,
    effect_type: operationType || args.operation_type,
    summary: typeof pending.summary === "string" ? pending.summary : null,
    draft: pending.draft ?? null,
    expires_after_turns: typeof pending.expires_after_turns === "number"
      ? pending.expires_after_turns
      : null,
  };
}

function noToolRequested(turnFrame: TurnFrame | null | undefined): boolean {
  const explicit = isRecord(turnFrame) &&
    isRecord((turnFrame as Record<string, unknown>).explicit_constraints)
    ? (turnFrame as any).explicit_constraints
    : null;
  return explicit?.no_tool === true || explicit?.no_mutation === true;
}

function withBlocks(
  decision: ConfirmationDecision,
  source: ToolConfirmationDecision["source"],
  legacyLocalReviewUsed: boolean,
  blockedBy: string[],
): ToolConfirmationDecision {
  const executable = blockedBy.length === 0 &&
    assertConfirmationCanExecute(decision).ok;
  return {
    ...decision,
    executable,
    should_execute: executable,
    source,
    legacy_local_review_used: legacyLocalReviewUsed,
    blocked_by: blockedBy,
  };
}

export function buildToolConfirmationDecision(args: {
  user_message: string;
  turn_frame: TurnFrame | null;
  pending_confirmation: unknown;
  operation_type: string;
  local_review?: unknown;
  request_id?: string | null;
  no_tool_requested?: boolean;
}): ToolConfirmationDecision {
  void args.user_message;
  void args.request_id;
  const pending = pendingSnapshot({
    pending_confirmation: args.pending_confirmation,
    operation_type: args.operation_type,
  });
  const turnReview = reviewFromConfirmationKind(
    args.turn_frame?.confirmation_response?.kind,
    args.turn_frame?.confirmation_response?.confidence_band,
  );
  const localReview = reviewFromLegacyLocal(args.local_review);
  const review = turnReview ?? localReview;
  const source = turnReview
    ? "turn_frame"
    : localReview
    ? "local_review"
    : "missing";
  const decision = buildConfirmationDecisionFromSkillReview({
    review,
    pending,
    reason_code_prefix: `${args.operation_type}_confirmation`,
  });
  const blockedBy: string[] = [];
  if (args.turn_frame?.safety?.risk_band &&
    blocksToolSkills(args.turn_frame.safety.risk_band)) {
    blockedBy.push("safety_blocks_confirmation");
  }
  if (args.no_tool_requested || noToolRequested(args.turn_frame)) {
    blockedBy.push("no_tool_blocks_confirmation");
  }
  if (decision.decision !== "approve") {
    blockedBy.push(`decision_${decision.decision}_not_executable`);
  }
  if (!decision.applies_to_pending) {
    blockedBy.push("confirmation_missing_or_incompatible_pending");
  }
  if (decision.confidence === "low") {
    blockedBy.push("confirmation_confidence_low");
  }
  return withBlocks(
    decision,
    source,
    !turnReview && Boolean(localReview),
    [...new Set(blockedBy)],
  );
}

export function confirmationDecisionKindFromTool(
  decision: ToolConfirmationDecision,
): ConfirmationDecisionKind {
  return decision.decision;
}
