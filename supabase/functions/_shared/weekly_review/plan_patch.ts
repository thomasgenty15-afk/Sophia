import type {
  WeeklyReviewDecision,
  WeeklyReviewPlanPatch,
  WeeklyStrategyDecision,
} from "./contract.ts";

export function buildWeeklyPlanPatch(args: {
  strategy: WeeklyReviewDecision["week_strategy"];
  items: WeeklyReviewDecision["item_decisions"];
}): WeeklyReviewPlanPatch {
  const operations: WeeklyReviewPlanPatch["operations"] = [];
  const decision = args.strategy.decision;
  if (
    decision === "advance" ||
    decision === "advance_with_caution" ||
    decision === "advance_with_watch"
  ) {
    operations.push({
      op: "advance_week",
      details: { decision },
    });
  } else if (decision === "repeat_week") {
    operations.push({
      op: "repeat_week",
      details: { reason: args.strategy.reason },
    });
  } else if (decision === "bridge_week") {
    operations.push({
      op: "insert_bridge_week",
      details: { reason: args.strategy.reason },
    });
  } else if (decision === "level_review") {
    operations.push({
      op: "open_level_review",
      details: { reason: args.strategy.reason },
    });
  }

  for (const item of args.items) {
    if (item.evidence_done && item.decision !== "mark_completed") continue;
    if (item.decision === "mark_completed") {
      operations.push({
        op: "mark_item_completed",
        plan_item_id: item.plan_item_id,
        occurrence_id: item.occurrence_id,
        details: { reason: item.reason },
      });
    } else if (item.decision === "carry_over") {
      operations.push({
        op: "carry_over_item",
        plan_item_id: item.plan_item_id,
        occurrence_id: item.occurrence_id,
        details: { reason: item.reason },
      });
    } else if (item.decision === "drop") {
      operations.push({
        op: "drop_item",
        plan_item_id: item.plan_item_id,
        occurrence_id: item.occurrence_id,
        details: { reason: item.reason },
      });
    }
  }
  return { requires_confirmation: true, operations };
}

export function weeklyStrategyRequiresQuestion(args: {
  strategy: WeeklyStrategyDecision;
  dailyCoverage: "complete" | "partial" | "low" | "none";
  confidence: "high" | "medium" | "low";
}): boolean {
  if (args.strategy === "hold") return true;
  if (args.dailyCoverage === "low" || args.dailyCoverage === "none") {
    return true;
  }
  if (args.confidence === "low" && args.strategy !== "level_review") {
    return true;
  }
  return false;
}
