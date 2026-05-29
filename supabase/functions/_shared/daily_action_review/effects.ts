import type {
  DailyReviewEffectPlan,
  DailyReviewReasonCategory,
} from "./contract.ts";

type DailyReviewEffectTarget = {
  occurrence_id: string;
  plan_item_id: string;
};

type DailyReviewEffectItem = {
  outcome: "completed" | "partial" | "missed" | "unclear" | null;
  reason_category: DailyReviewReasonCategory | null;
  reason_text: string | null;
  still_relevant: boolean | "unknown";
  evidence_text: string | null;
  confidence: "high" | "medium" | "low";
  missing_slots: string[];
};

export type DailyReviewEffectState = {
  status: "collecting" | "needs_clarification" | "complete" | "stopped";
  stop_reason:
    | "all_required_slots_filled"
    | "user_stopped"
    | "safety"
    | "unclear_after_retries"
    | null;
  items: Record<string, DailyReviewEffectItem>;
};

function isAppliedDailyOutcome(
  value: unknown,
): value is "completed" | "partial" | "missed" {
  return value === "completed" || value === "partial" || value === "missed";
}

function hasUsableConfidence(value: unknown): boolean {
  return value === "high" || value === "medium";
}

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

export function buildDailyReviewEffectPlan(
  state: DailyReviewEffectState,
  targets: DailyReviewEffectTarget[],
): DailyReviewEffectPlan {
  if (state.status === "stopped" || state.stop_reason === "safety") {
    return { allowed: false, effects: [] };
  }

  const effects = targets.flatMap((target) => {
    const item = state.items[target.occurrence_id];
    if (!item || !isAppliedDailyOutcome(item.outcome)) return [];
    return [{
      type: "log_daily_action_review" as const,
      occurrence_id: target.occurrence_id,
      plan_item_id: target.plan_item_id,
      outcome: item.outcome,
      reason_category: item.reason_category ?? "unclear",
      reason_text: cleanText(item.reason_text) || null,
      still_relevant: item.outcome === "missed"
        ? item.still_relevant === "unknown" ? null : item.still_relevant
        : null,
      source: "daily_action_review_v1" as const,
    }];
  });

  const allTargetsReady = targets.length > 0 &&
    effects.length === targets.length &&
    targets.every((target) => {
      const item = state.items[target.occurrence_id];
      return item &&
        isAppliedDailyOutcome(item.outcome) &&
        item.missing_slots.length === 0 &&
        hasUsableConfidence(item.confidence) &&
        cleanText(item.evidence_text);
    });

  return {
    allowed: allTargetsReady,
    effects: allTargetsReady ? effects : [],
  };
}
