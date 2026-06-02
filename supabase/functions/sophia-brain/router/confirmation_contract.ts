export type ConfirmationDecisionKind =
  | "approve"
  | "reject"
  | "revise"
  | "explain"
  | "unrelated"
  | "topic_change"
  | "unclear";

export type ConfirmationTarget = {
  operation_id?: string | null;
  operation_type?: string | null;
  effect_type?: string | null;
  source?: "pending_confirmation" | "active_flow" | "agenda" | "unknown";
};

export type ConfirmationDecision = {
  decision: ConfirmationDecisionKind;
  pending_operation_id: string | null;
  pending_operation_type: string | null;
  applies_to_pending: boolean;
  target: ConfirmationTarget | null;
  confidence: "low" | "medium" | "high";
  evidence: string[];
  reason_code: string;
  user_text_span?: string | null;
  // Backward-compatible aliases while legacy tools are migrated.
  applies_to_pending_effect: boolean;
  should_clear_pending?: boolean;
  should_execute?: boolean;
  should_revise?: boolean;
  should_explain?: boolean;
};

export type PendingConfirmationSnapshot = {
  operation_id?: string | null;
  operation_type?: string | null;
  effect_type?: string | null;
  summary?: string | null;
  draft?: unknown;
  expires_after_turns?: number | null;
};

export type SkillConfirmationReview = {
  decision:
    | "approve"
    | "reject"
    | "revise"
    | "explain"
    | "preview"
    | "status"
    | "topic_change"
    | "unclear";
  confidence?: "low" | "medium" | "high" | null;
  evidence?: string[] | null;
  generated_user_message?: string | null;
};

export const PLATFORM_HANDOFF_OPERATIONS = new Set([
  "adjust_plan_item",
  "prepare_attack_card",
  "prepare_defense_card",
  "select_state_potion",
  "create_recurring_reminder",
  "update_coach_preferences",
]);

const REVIEW_DECISIONS: SkillConfirmationReview["decision"][] = [
  "approve",
  "reject",
  "revise",
  "explain",
  "preview",
  "status",
  "topic_change",
  "unclear",
];

function targetFromPending(
  pending: PendingConfirmationSnapshot | null,
): ConfirmationTarget | null {
  if (!pending) return null;
  return {
    operation_id: pending.operation_id ?? null,
    operation_type: pending.operation_type ?? null,
    effect_type: pending.effect_type ?? null,
    source: "pending_confirmation",
  };
}

function normalizeReviewDecision(
  decision: SkillConfirmationReview["decision"],
): ConfirmationDecisionKind {
  if (decision === "topic_change") return "topic_change";
  if (decision === "unclear") return "unclear";
  if (decision === "preview" || decision === "status") return "explain";
  return decision;
}

function decisionFlags(args: {
  decision: ConfirmationDecisionKind;
  applies: boolean;
  confidence: ConfirmationDecision["confidence"];
  pendingOperationType?: string | null;
}) {
  const isPlatformHandoff = PLATFORM_HANDOFF_OPERATIONS.has(
    String(args.pendingOperationType ?? "").trim(),
  );
  const shouldExecute = !isPlatformHandoff && args.decision === "approve" &&
    args.applies &&
    args.confidence !== "low";
  return {
    should_clear_pending:
      args.decision === "reject" || args.decision === "topic_change"
        ? true
        : undefined,
    should_execute: shouldExecute,
    should_revise: args.decision === "revise" ? true : undefined,
    should_explain: args.decision === "explain" ? true : undefined,
  };
}

function buildDecision(args: {
  decision: ConfirmationDecisionKind;
  applies: boolean;
  target: ConfirmationTarget | null;
  confidence: ConfirmationDecision["confidence"];
  evidence: string[];
  reason_code: string;
  user_text_span?: string | null;
}): ConfirmationDecision {
  const pendingOperationId = args.target?.operation_id ?? null;
  const pendingOperationType = args.target?.operation_type ?? null;
  const isPlatformHandoffApplyAttempt = args.decision === "approve" &&
    args.applies &&
    PLATFORM_HANDOFF_OPERATIONS.has(String(pendingOperationType ?? "").trim());
  return {
    decision: args.decision,
    pending_operation_id: pendingOperationId,
    pending_operation_type: pendingOperationType,
    applies_to_pending: args.applies,
    applies_to_pending_effect: args.applies,
    target: args.target,
    confidence: args.confidence,
    evidence: args.evidence,
    reason_code: isPlatformHandoffApplyAttempt
      ? "platform_handoff_apply_attempt"
      : args.reason_code,
    user_text_span: args.user_text_span ?? null,
    ...decisionFlags({
      decision: args.decision,
      applies: args.applies,
      confidence: args.confidence,
      pendingOperationType,
    }),
  };
}

function compatible(
  target: ConfirmationTarget | null,
  pending: PendingConfirmationSnapshot | null,
): boolean {
  if (!target || !pending) return false;
  if (target.operation_id && pending.operation_id) {
    return target.operation_id === pending.operation_id;
  }
  if (target.operation_type && pending.operation_type) {
    return target.operation_type === pending.operation_type;
  }
  if (target.effect_type && pending.effect_type) {
    return target.effect_type === pending.effect_type;
  }
  return target.source === "pending_confirmation";
}

function normalizeEvidence(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function normalizeConfidence(
  value: unknown,
): ConfirmationDecision["confidence"] {
  return value === "low" || value === "medium" || value === "high"
    ? value
    : "medium";
}

export function normalizeSkillConfirmationReview(
  value: unknown,
): SkillConfirmationReview | null {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  if (!record) return null;
  const decision = String(record.decision ?? "").trim();
  if (
    !REVIEW_DECISIONS.includes(decision as SkillConfirmationReview["decision"])
  ) {
    return null;
  }
  return {
    decision: decision as SkillConfirmationReview["decision"],
    confidence: normalizeConfidence(record.confidence),
    evidence: normalizeEvidence(record.evidence),
    generated_user_message: record.generated_user_message == null
      ? null
      : String(record.generated_user_message).trim() || null,
  };
}

export function buildConfirmationDecisionFromSkillReview(args: {
  review: SkillConfirmationReview | null | undefined;
  pending: PendingConfirmationSnapshot | null;
  reason_code_prefix?: string;
}): ConfirmationDecision {
  const review = args.review;
  const target = targetFromPending(args.pending);
  if (!review) {
    return buildDecision({
      decision: "unclear",
      applies: false,
      target,
      confidence: "low",
      evidence: [],
      reason_code: `${args.reason_code_prefix ?? "skill"}_review_missing`,
    });
  }
  const applies = compatible(target, args.pending);
  const confidence = normalizeConfidence(review.confidence);
  const evidence = normalizeEvidence(review.evidence);
  const prefix = args.reason_code_prefix ?? "skill";
  const decision = normalizeReviewDecision(review.decision);
  return buildDecision({
    decision,
    applies: decision === "topic_change" ? false : applies,
    target: decision === "topic_change" ? null : target,
    confidence: decision === "unclear" ? "low" : confidence,
    evidence,
    reason_code: `${prefix}_${review.decision}`,
  });
}

export function assertConfirmationCanExecute(
  decision: ConfirmationDecision,
): { ok: true } | { ok: false; reason_code: string } {
  if (decision.decision !== "approve") {
    return { ok: false, reason_code: "confirmation_not_approve" };
  }
  if (!decision.applies_to_pending_effect || !decision.target) {
    return { ok: false, reason_code: "confirmation_target_incompatible" };
  }
  if (decision.confidence === "low") {
    return { ok: false, reason_code: "confirmation_confidence_low" };
  }
  if (
    PLATFORM_HANDOFF_OPERATIONS.has(
      String(decision.pending_operation_type ?? "").trim(),
    )
  ) {
    return { ok: false, reason_code: "platform_handoff_apply_attempt" };
  }
  if (!decision.should_execute) {
    return { ok: false, reason_code: "confirmation_not_executable" };
  }
  return { ok: true };
}

/**
 * Deprecated compatibility shim.
 *
 * Confirmation semantics must be produced by the active L5 skill intake or
 * draft_validation step. The global router may validate a structured decision,
 * but must not classify raw user text such as "ok" or "non" into approve/reject.
 */
export function decideConfirmation(..._args: unknown[]): ConfirmationDecision {
  return {
    decision: "unclear",
    pending_operation_id: null,
    pending_operation_type: null,
    applies_to_pending: false,
    applies_to_pending_effect: false,
    target: null,
    confidence: "low",
    evidence: [],
    reason_code: "global_confirmation_classifier_disabled",
    should_execute: false,
  };
}
