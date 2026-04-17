import type { HabitState, UserPlanItemRow } from "./v2-types.ts";

export type ActivationCondition = Record<string, unknown> | null;

export type PlanItemActivationDependency = Pick<
  UserPlanItemRow,
  "id" | "title" | "status" | "current_habit_state" | "current_reps"
>;

export type ActivationReadiness = {
  isReady: boolean;
  reason: string;
  remainingCount: number | null;
  dependencyIds: string[];
};

export function normalizeDependsOn(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }
  return [];
}

export function getConditionType(
  condition: ActivationCondition,
): string | null {
  if (!condition) return null;
  return typeof condition.type === "string" ? condition.type : null;
}

export function getMinCompletions(
  condition: ActivationCondition,
): number | null {
  if (!condition) return null;
  const raw = condition.min_completions;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

export function isMaintenanceLike(item: {
  status: string;
  current_habit_state: HabitState | null;
}): boolean {
  return item.status === "in_maintenance" ||
    item.current_habit_state === "in_maintenance";
}

export function evaluateActivationReadiness(args: {
  condition: ActivationCondition;
  dependencies: PlanItemActivationDependency[];
  positiveCountByDependencyId?: Map<string, number>;
}): ActivationReadiness {
  const type = getConditionType(args.condition);

  if (!args.condition || type === "immediate") {
    return {
      isReady: true,
      reason: "Disponible maintenant.",
      remainingCount: 0,
      dependencyIds: [],
    };
  }

  const dependencyIds = normalizeDependsOn(args.condition.depends_on);
  const dependencyById = new Map(
    args.dependencies.map((dependency) => [dependency.id, dependency]),
  );
  const resolvedDependencies = dependencyIds
    .map((id) => dependencyById.get(id))
    .filter((value): value is PlanItemActivationDependency => Boolean(value));

  if (type === "after_item_completion" || type === "after_milestone") {
    const incompleteDependencies = resolvedDependencies.filter((dependency) =>
      dependency.status !== "completed" && !isMaintenanceLike(dependency)
    );

    if (
      incompleteDependencies.length === 0 &&
      resolvedDependencies.length === dependencyIds.length
    ) {
      return {
        isReady: true,
        reason: "Les prerequis sont valides.",
        remainingCount: 0,
        dependencyIds,
      };
    }

    const missingCount = Math.max(dependencyIds.length - resolvedDependencies.length, 0);
    const remaining = incompleteDependencies.length + missingCount;
    const lead = incompleteDependencies[0] ?? resolvedDependencies[0] ?? null;

    return {
      isReady: false,
      reason: lead
        ? remaining === 1
          ? `Terminer "${lead.title}" pour debloquer cet element.`
          : `Valider ${remaining} prerequis avant de debloquer cet element.`
        : "Les prerequis de cet element sont introuvables.",
      remainingCount: remaining,
      dependencyIds,
    };
  }

  if (type === "after_habit_traction") {
    const habit = resolvedDependencies[0];
    const required = getMinCompletions(args.condition) ?? 3;
    if (!habit) {
      return {
        isReady: false,
        reason: "L'habitude de reference est introuvable.",
        remainingCount: required,
        dependencyIds,
      };
    }

    const positiveCount = Math.max(
      Number(habit.current_reps ?? 0) || 0,
      args.positiveCountByDependencyId?.get(habit.id) ?? 0,
    );
    const remaining = Math.max(required - positiveCount, 0);
    return {
      isReady: remaining === 0,
      reason: remaining === 0
        ? `"${habit.title}" a atteint la traction requise.`
        : `Plus que ${remaining} validation${remaining > 1 ? "s" : ""} sur "${habit.title}".`,
      remainingCount: remaining,
      dependencyIds,
    };
  }

  return {
    isReady: false,
    reason: "Condition de deblocage non reconnue.",
    remainingCount: null,
    dependencyIds,
  };
}
