/**
 * Selects `target` days across the whole available window instead of filling
 * Monday, Tuesday, Wednesday... first. Explicitly preferred days stay pinned;
 * missing days are chosen to maximise the distance between occurrences.
 */
export function spreadWeekDays<T extends string>(params: {
  availableDays: readonly T[];
  target: number;
  preferredDays?: readonly T[];
}): T[] {
  const available = [...new Set(params.availableDays)];
  const target = Math.max(
    0,
    Math.min(
      available.length,
      Math.floor(Number.isFinite(params.target) ? params.target : 0),
    ),
  );
  if (target === 0) return [];

  const availableSet = new Set<T>(available);
  const preferred = [...new Set(params.preferredDays ?? [])]
    .filter((day) => availableSet.has(day));
  if (preferred.length >= target) {
    return available.filter((day) => preferred.slice(0, target).includes(day));
  }

  // With no pinned day, use the centre of equal-width buckets. Examples on a
  // full week: 1x -> Thu, 2x -> Tue/Sat, 3x -> Tue/Thu/Sat.
  if (preferred.length === 0) {
    const selected = new Set<T>();
    for (let slot = 0; slot < target; slot++) {
      const index = Math.min(
        available.length - 1,
        Math.floor(((slot + 0.5) * available.length) / target),
      );
      selected.add(available[index]);
    }
    return available.filter((day) => selected.has(day));
  }

  const selected = new Set<T>(preferred);
  while (selected.size < target) {
    const selectedIndexes = available
      .map((day, index) => selected.has(day) ? index : -1)
      .filter((index) => index >= 0);
    let bestIndex = -1;
    let bestDistance = -1;

    for (let index = 0; index < available.length; index++) {
      if (selected.has(available[index])) continue;
      const distance = Math.min(
        ...selectedIndexes.map((selectedIndex) =>
          Math.abs(index - selectedIndex)
        ),
      );
      if (distance > bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }

    if (bestIndex < 0) break;
    selected.add(available[bestIndex]);
  }

  return available.filter((day) => selected.has(day));
}

/**
 * Narrows a habit window when it explicitly depends on a one-shot setup item.
 * Unknown dependencies are ignored; only prerequisites planned in this same
 * week can affect its day distribution.
 */
export function daysAfterPlannedPrerequisites<T extends string>(params: {
  availableDays: readonly T[];
  activationCondition: Record<string, unknown> | null | undefined;
  plannedDayByItemId: ReadonlyMap<string, T>;
}): T[] {
  const condition = params.activationCondition;
  const type = String(condition?.type ?? "").trim();
  if (type !== "after_item_completion" && type !== "after_milestone") {
    return [...params.availableDays];
  }

  const rawDependencies = condition?.depends_on;
  const dependencyIds =
    (Array.isArray(rawDependencies)
      ? rawDependencies
      : typeof rawDependencies === "string"
      ? [rawDependencies]
      : [])
      .map((id) => String(id ?? "").trim())
      .filter(Boolean);
  const prerequisiteIndexes = dependencyIds
    .map((id) => params.plannedDayByItemId.get(id))
    .filter((day): day is T => Boolean(day))
    .map((day) => params.availableDays.indexOf(day))
    .filter((index) => index >= 0);
  if (prerequisiteIndexes.length === 0) return [...params.availableDays];

  const latestPrerequisiteIndex = Math.max(...prerequisiteIndexes);
  return params.availableDays.slice(latestPrerequisiteIndex + 1);
}
