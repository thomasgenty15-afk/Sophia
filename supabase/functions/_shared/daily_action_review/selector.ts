export type DailyActionReviewSelectorTarget = {
  occurrence_id: string;
  plan_id: string;
  dimension?: string | null;
  kind?: string | null;
};

export type DailyActionReviewSelectorState = {
  current_focus_occurrence_ids: string[];
};

export type DailyActionReviewGroupingReason =
  | "single_action"
  | "same_plan"
  | "same_type"
  | "priority";

type DailyActionType = "habit" | "mission" | "clarification";

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function actionTypeForTarget(
  target: DailyActionReviewSelectorTarget,
): DailyActionType {
  const dimension = cleanText(target.dimension);
  const kind = cleanText(target.kind);
  if (dimension === "habits" || kind === "habit") return "habit";
  if (dimension === "clarifications" || kind === "clarification") {
    return "clarification";
  }
  return "mission";
}

function actionTypeRank(type: DailyActionType): number {
  if (type === "habit") return 0;
  if (type === "mission") return 1;
  return 2;
}

export function selectInitialDailyActionReviewFocus<
  T extends DailyActionReviewSelectorTarget,
>(
  targets: T[],
): {
  targets: T[];
  groupingReason: DailyActionReviewGroupingReason;
} {
  if (targets.length <= 1) {
    return { targets: targets.slice(0, 1), groupingReason: "single_action" };
  }

  const sorted = [...targets].sort((a, b) =>
    actionTypeRank(actionTypeForTarget(a)) -
    actionTypeRank(actionTypeForTarget(b))
  );
  if (targets.length <= 2) {
    return { targets: sorted.slice(0, 2), groupingReason: "priority" };
  }

  const byPlan = new Map<string, T[]>();
  for (const target of sorted) {
    const key = cleanText(target.plan_id) || "unknown";
    byPlan.set(key, [...(byPlan.get(key) ?? []), target]);
  }
  const planGroup = [...byPlan.values()]
    .filter((group) => group.length >= 2)
    .sort((a, b) => b.length - a.length)[0];
  if (planGroup) {
    return {
      targets: planGroup.slice(0, 2),
      groupingReason: "same_plan",
    };
  }

  const byType = new Map<DailyActionType, T[]>();
  for (const target of sorted) {
    const key = actionTypeForTarget(target);
    byType.set(key, [...(byType.get(key) ?? []), target]);
  }
  const typeGroup = [...byType.values()]
    .filter((group) => group.length >= 2)
    .sort((a, b) => b.length - a.length)[0];
  if (typeGroup) {
    return {
      targets: typeGroup.slice(0, 2),
      groupingReason: "same_type",
    };
  }

  return { targets: sorted.slice(0, 2), groupingReason: "priority" };
}

export function dailyActionReviewFocusTargets<
  T extends DailyActionReviewSelectorTarget,
>(
  targets: T[],
  state: DailyActionReviewSelectorState,
): T[] {
  const ids = new Set(state.current_focus_occurrence_ids);
  const selected = targets.filter((target) => ids.has(target.occurrence_id));
  return selected.length
    ? selected.slice(0, 2)
    : targets.slice(0, Math.min(2, targets.length));
}
