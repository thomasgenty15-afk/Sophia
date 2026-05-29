import type { AdjustPlanDecision } from "./contract.ts";

export function shouldBuildAdjustPlanDraft(
  decision: AdjustPlanDecision,
): boolean {
  if (decision.intent === "reject_draft" || decision.intent === "off_topic") {
    return false;
  }
  if (decision.draft.available) return false;
  if (decision.scope.missing_slots.length > 0) return false;
  if (decision.change.missing_slots.length > 0) return false;
  return decision.intent === "start_adjustment" ||
    decision.intent === "draft_only" ||
    decision.intent === "revise_draft" ||
    decision.intent === "change_scope" ||
    decision.intent === "weekly_bridge";
}

export function mergeAdjustPlanDraftIntoDecision(args: {
  decision: AdjustPlanDecision;
  summary: string;
  patch: Record<string, unknown>;
}): AdjustPlanDecision {
  return {
    ...args.decision,
    status: "draft_ready",
    draft: {
      available: true,
      requires_confirmation: true,
      summary: args.summary,
      patch: args.patch,
    },
    effect_plan: {
      allowed: false,
      effects: [],
      blocked_reason: "requires_confirmation",
    },
    state_patch: {
      ...args.decision.state_patch,
      pending_draft: {
        summary: args.summary,
        patch: args.patch,
        requires_confirmation: true,
      },
    },
  };
}
