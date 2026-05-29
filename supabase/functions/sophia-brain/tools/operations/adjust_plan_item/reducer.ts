import type {
  AdjustPlanConstraint,
  AdjustPlanDecision,
  AdjustPlanDecisionDraft,
  AdjustPlanResolvedScope,
} from "./contract.ts";

const LEVEL_OBJECTIVE_KEYS = new Set([
  "objective",
  "goal",
  "level_objective",
  "level_goal",
  "success_objective",
]);

function constraintsWithDefaults(
  constraints: AdjustPlanConstraint[] | undefined,
): AdjustPlanConstraint[] {
  return [
    ...new Set([
      "requires_confirmation" as const,
      "do_not_modify_level_objective" as const,
      "do_not_touch_completed_items" as const,
      "do_not_touch_support_items" as const,
      "preserve_user_exact_constraints" as const,
      "no_done_language_without_commit" as const,
      ...(constraints ?? []),
    ]),
  ];
}

function missingSlots(decision: AdjustPlanDecisionDraft): string[] {
  return [
    ...new Set([
      ...decision.scope.missing_slots,
      ...decision.change.missing_slots,
    ]),
  ];
}

function sanitizedPatch(
  patch: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!patch) return null;
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (LEVEL_OBJECTIVE_KEYS.has(key)) continue;
    next[key] = value;
  }
  return next;
}

function blockReason(args: {
  decision: AdjustPlanDecisionDraft;
  scope: AdjustPlanResolvedScope;
  constraints: AdjustPlanConstraint[];
  patch: Record<string, unknown> | null;
}): string | null {
  if (args.decision.intent === "draft_only") return "draft_only";
  if (args.decision.intent !== "confirm_draft") return "requires_confirmation";
  if (args.constraints.includes("do_not_apply")) return "do_not_apply";
  if (missingSlots(args.decision).length > 0) return "missing_slots";
  if (args.scope.confidence === "low") return "scope_confidence_low";
  if (args.scope.blocked_reason) return args.scope.blocked_reason;
  if (!args.decision.draft.available || !args.patch) return "draft_missing";
  if (Object.keys(args.patch).length === 0) return "patch_empty";
  if (
    args.scope.blocked_item_reasons.some((reason) =>
      reason.startsWith("completed:")
    )
  ) {
    return "completed_item_blocked";
  }
  if (
    args.scope.blocked_item_reasons.some((reason) =>
      reason.startsWith("support:")
    )
  ) {
    return "support_item_blocked";
  }
  return null;
}

export function reduceAdjustPlanState(
  previousState: Record<string, unknown> | null | undefined,
  intakeDecision: AdjustPlanDecisionDraft,
  resolvedScope: AdjustPlanResolvedScope,
): AdjustPlanDecision {
  const constraints = constraintsWithDefaults(intakeDecision.constraints);
  const patch = sanitizedPatch(intakeDecision.draft.patch);
  const missing = missingSlots(intakeDecision);
  const blockedReason = blockReason({
    decision: intakeDecision,
    scope: resolvedScope,
    constraints,
    patch,
  });
  const allowed = blockedReason == null;
  const previousDraft = previousState?.pending_draft ?? null;
  const preserveDraft = intakeDecision.intent === "explain_draft" &&
    previousDraft != null;
  const clearDraft = intakeDecision.intent === "reject_draft";

  const draft = preserveDraft && typeof previousDraft === "object"
    ? intakeDecision.draft.available ? intakeDecision.draft : {
      available: true,
      requires_confirmation: true as const,
      summary: (previousDraft as Record<string, unknown>).summary == null
        ? null
        : String((previousDraft as Record<string, unknown>).summary),
      patch: (previousDraft as Record<string, unknown>).patch &&
          typeof (previousDraft as Record<string, unknown>).patch === "object"
        ? (previousDraft as Record<string, unknown>).patch as Record<
          string,
          unknown
        >
        : null,
    }
    : {
      ...intakeDecision.draft,
      patch,
    };

  const statePatch: Record<string, unknown> = {
    ...(intakeDecision.state_patch ?? {}),
    operation_id: intakeDecision.operation_id,
    scope: resolvedScope,
    missing_slots: missing,
    effect_blocked_reason: blockedReason,
  };
  if (clearDraft) {
    statePatch.pending_draft = null;
    statePatch.clear_pending_confirmation = true;
  } else if (draft.available) {
    statePatch.pending_draft = draft;
  }

  const status: AdjustPlanDecision["status"] = intakeDecision.intent ===
      "off_topic"
    ? "off_topic"
    : clearDraft
    ? "rejected"
    : allowed
    ? "pending_confirmation"
    : draft.available && missing.length === 0
    ? "draft_ready"
    : blockedReason
    ? "blocked"
    : "collecting";

  return {
    skill_id: "adjust_plan_item",
    operation_id: intakeDecision.operation_id,
    intent: intakeDecision.intent,
    status,
    scope: {
      kind: resolvedScope.kind,
      plan_item_ids: resolvedScope.plan_item_ids,
      target_hint: resolvedScope.target_hint,
      confidence: resolvedScope.confidence,
      missing_slots: resolvedScope.missing_slots,
    },
    change: intakeDecision.change,
    draft,
    effect_plan: {
      allowed,
      effects: allowed && patch
        ? [{
          type: "adjust_plan_item",
          operation_id: intakeDecision.operation_id,
          scope_kind: resolvedScope.kind,
          patch,
          requires_confirmation: true,
        }]
        : [],
      blocked_reason: blockedReason,
    },
    constraints,
    reply: intakeDecision.reply ?? "",
    state_patch: statePatch,
  };
}
