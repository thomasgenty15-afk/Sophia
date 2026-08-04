import type {
  MomentumStateV2,
  UserPlanItemEntryRow,
  UserPlanItemRow,
} from "./v2-types.ts";
import type { CurrentPhaseRuntimeContext } from "./v2-runtime.ts";

export type ActiveLoadResult = MomentumStateV2["active_load"];

const POSITIVE_ENTRY_KINDS = new Set<UserPlanItemEntryRow["entry_kind"]>([
  "checkin",
  "progress",
  "partial",
]);

const NEGATIVE_ENTRY_KINDS = new Set<UserPlanItemEntryRow["entry_kind"]>([
  "skip",
  "blocker",
]);

function hasPoorRecentTraction(entries: UserPlanItemEntryRow[]): boolean {
  if (entries.length === 0) return false;

  let positiveCount = 0;
  let negativeCount = 0;

  for (const entry of entries.slice(0, 5)) {
    if (POSITIVE_ENTRY_KINDS.has(entry.entry_kind)) {
      positiveCount += 1;
      continue;
    }

    if (NEGATIVE_ENTRY_KINDS.has(entry.entry_kind)) {
      negativeCount += 1;
    }
  }

  return negativeCount > positiveCount;
}

export function computeActiveLoad(
  planItems: UserPlanItemRow[],
  entriesByItem: ReadonlyMap<string, UserPlanItemEntryRow[]> = new Map(),
  phaseContext: CurrentPhaseRuntimeContext | null = null,
): ActiveLoadResult {
  const maintenanceHabitIds = new Set(
    phaseContext?.maintenance_habit_item_ids ?? [],
  );
  const scopedPlanItems = phaseContext?.current_phase_id
    ? planItems.filter((item) =>
      item.phase_id === phaseContext.current_phase_id ||
      maintenanceHabitIds.has(item.id)
    )
    : phaseContext
    ? planItems.filter((item) => maintenanceHabitIds.has(item.id))
    : planItems;
  const activePlanItems = scopedPlanItems.filter((item) =>
    item.status === "active"
  );
  const maintenanceHabits = scopedPlanItems.filter((item) =>
    maintenanceHabitIds.has(item.id) &&
    item.dimension === "habits"
  );

  const missionSlotsUsed =
    activePlanItems.filter((item) => item.dimension === "missions").length;
  const supportSlotsUsed =
    activePlanItems.filter((item) =>
      item.dimension === "clarifications" || item.dimension === "support"
    ).length;
  const activeBuildingHabits = activePlanItems.filter((item) =>
    item.dimension === "habits" &&
    item.current_habit_state === "active_building"
  );
  const habitBuildingSlotsUsed = activeBuildingHabits.length;

  const currentLoadScore = (missionSlotsUsed * 3) +
    (habitBuildingSlotsUsed * 2) +
    supportSlotsUsed +
    maintenanceHabits.length;

  const needsConsolidate = habitBuildingSlotsUsed > 2 &&
    activeBuildingHabits.some((habit) =>
      hasPoorRecentTraction(entriesByItem.get(habit.id) ?? [])
    );

  return {
    current_load_score: currentLoadScore,
    mission_slots_used: missionSlotsUsed,
    support_slots_used: supportSlotsUsed,
    habit_building_slots_used: habitBuildingSlotsUsed,
    needs_reduce: currentLoadScore > 7 || missionSlotsUsed > 2,
    needs_consolidate: needsConsolidate,
  };
}
