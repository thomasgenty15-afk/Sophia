import type { WeeklyProgressActionDeviation } from "../weekly_progress_review.ts";
import type {
  WeeklyDailyEvidenceSnapshot,
  WeeklyEvidenceSummary,
  WeeklyReviewAction,
  WeeklyReviewDecision,
} from "./contract.ts";

export function flattenWeeklyReviewActions(
  review: { transformations: Array<{ actions: WeeklyReviewAction[] }> },
): WeeklyReviewAction[] {
  return review.transformations.flatMap((transformation) =>
    transformation.actions
  );
}

export function weeklyFamilyForAction(
  action: WeeklyReviewAction,
): "habit" | "mission" | "clarification" | "other" {
  if (action.dimension === "habits") return "habit";
  if (action.dimension === "missions") return "mission";
  if (action.dimension === "clarifications") return "clarification";
  return "other";
}

export function weeklyStatusForDeviation(
  deviation: WeeklyProgressActionDeviation,
): WeeklyReviewDecision["item_decisions"][number]["current_week_status"] {
  if (deviation === "on_plan") return "done";
  if (deviation === "partial") return "partial";
  if (deviation === "missed") return "missed";
  if (deviation === "rescheduled") return "rescheduled";
  if (deviation === "not_answered") return "not_answered";
  return "unknown";
}

export function weeklyActionEvidenceDone(action: WeeklyReviewAction): boolean {
  return action.deviation === "on_plan" || action.entry_outcome === "completed";
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function actionPoints(action: WeeklyReviewAction): number {
  if (action.deviation === "on_plan") return 1;
  if (action.deviation === "partial") return 0.5;
  return 0;
}

export function buildWeeklyHabitVerdict(
  actions: WeeklyReviewAction[],
): WeeklyReviewDecision["habit_verdict"] {
  const habits = actions.filter((action) =>
    weeklyFamilyForAction(action) === "habit"
  );
  if (habits.length === 0) {
    return {
      status: "no_signal",
      completion_rate: 0,
      planned_count: 0,
      done_points: 0,
      reason: "Aucune habitude confirmee dans la semaine.",
    };
  }
  const donePoints = habits.reduce(
    (sum, action) => sum + actionPoints(action),
    0,
  );
  const completionRate = round2(donePoints / habits.length);
  const answeredCount =
    habits.filter((action) => action.deviation !== "not_answered").length;
  if (answeredCount === 0) {
    return {
      status: "no_signal",
      completion_rate: completionRate,
      planned_count: habits.length,
      done_points: donePoints,
      reason:
        "Les habitudes existent, mais aucune reponse fiable n'est disponible.",
    };
  }
  if (completionRate >= 0.8) {
    return {
      status: "validated",
      completion_rate: completionRate,
      planned_count: habits.length,
      done_points: donePoints,
      reason: "La cible d'habitudes est atteinte ou suffisamment tenue.",
    };
  }
  if (completionRate >= 0.4) {
    return {
      status: "partial_validatable",
      completion_rate: completionRate,
      planned_count: habits.length,
      done_points: donePoints,
      reason: "Les habitudes ont cree une traction partielle.",
    };
  }
  return {
    status: "failed",
    completion_rate: completionRate,
    planned_count: habits.length,
    done_points: donePoints,
    reason: "La cible d'habitudes n'est pas atteinte.",
  };
}

export function buildWeeklyEvidenceSummary(
  actions: WeeklyReviewAction[],
): WeeklyEvidenceSummary {
  const covered = actions.filter((action) => action.daily_evidence);
  const blockerCounts = new Map<string, number>();
  let confidenceScore = 0;
  for (const action of covered) {
    const evidence = action.daily_evidence;
    if (!evidence) continue;
    if (evidence.confidence === "high") confidenceScore += 2;
    else if (evidence.confidence === "medium") confidenceScore += 1;
    const reason = String(evidence.reason_category ?? "").trim();
    if (reason && reason !== "none") {
      blockerCounts.set(reason, (blockerCounts.get(reason) ?? 0) + 1);
    }
  }

  const coverageRate = actions.length > 0 ? covered.length / actions.length : 0;
  const dailyCoverage = actions.length === 0
    ? "none"
    : coverageRate >= 0.9
    ? "complete"
    : coverageRate >= 0.4
    ? "partial"
    : coverageRate > 0
    ? "low"
    : "none";
  const dominantBlockers = [...blockerCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([reason]) => reason);
  const avgConfidence = covered.length > 0
    ? confidenceScore / covered.length
    : 0;

  return {
    source: "weekly_progress_review_v2",
    daily_coverage: dailyCoverage,
    covered_count: covered.length,
    planned_count: actions.length,
    done_count: actions.filter((action) => action.deviation === "on_plan")
      .length,
    partial_count: actions.filter((action) => action.deviation === "partial")
      .length,
    missed_count: actions.filter((action) => action.deviation === "missed")
      .length,
    unanswered_count:
      actions.filter((action) => action.deviation === "not_answered").length,
    rescheduled_count:
      actions.filter((action) => action.deviation === "rescheduled").length,
    dominant_blockers: dominantBlockers,
    confidence: avgConfidence >= 1.4
      ? "high"
      : avgConfidence >= 0.6
      ? "medium"
      : "low",
  };
}

export function weeklyDailyEvidenceSnapshotForAction(
  action: WeeklyReviewAction,
): WeeklyDailyEvidenceSnapshot {
  const evidence = action.daily_evidence ?? null;
  if (evidence) {
    return {
      source: "daily_action_review_v1",
      reason_category: evidence.reason_category,
      reason_text: evidence.reason_text,
      still_relevant: evidence.still_relevant,
      reschedule_decision: evidence.reschedule_decision,
      confidence: evidence.confidence,
    };
  }
  return {
    source: action.had_entry ? "dashboard" : "none",
    reason_category: null,
    reason_text: null,
    still_relevant: null,
    reschedule_decision: null,
    confidence: "none",
  };
}
