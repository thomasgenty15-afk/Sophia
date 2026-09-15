import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { computeActiveLoad } from "./v2-active-load.ts";
import { logV2Event, V2_EVENT_TYPES } from "./v2-events.ts";

import type {
  MomentumStateV2,
  PlanContentV3,
  PlanDimension,
  PlanItemStatus,
  UserCycleRow,
  UserMetricRow,
  UserPlanItemEntryRow,
  UserPlanItemRow,
  UserPlanV2Row,
  UserTransformationRow,
} from "./v2-types.ts";

const PLAN_DIMENSIONS: readonly PlanDimension[] = [
  "clarifications",
  "missions",
  "habits",
];

const PLAN_ITEM_STATUSES: readonly PlanItemStatus[] = [
  "pending",
  "active",
  "in_maintenance",
  "completed",
  "deactivated",
  "cancelled",
  "stalled",
];

const UNIVERSAL_PHASE_OFFSET = 1;

function getDisplayPhaseOrder(phaseOrder: number | null | undefined): number | null {
  return typeof phaseOrder === "number" ? phaseOrder + UNIVERSAL_PHASE_OFFSET : null;
}

function getDisplayTotalPhases(phaseCount: number): number {
  return phaseCount > 0 ? phaseCount + UNIVERSAL_PHASE_OFFSET : 0;
}

export type PlanItemCountsByDimensionStatus = Record<
  PlanDimension,
  Record<PlanItemStatus, number>
>;

export type ActiveTransformationRuntime = {
  cycle: UserCycleRow | null;
  transformation: UserTransformationRow | null;
  plan: UserPlanV2Row | null;
  progress_markers: UserMetricRow[];
  plan_item_counts: PlanItemCountsByDimensionStatus;
};

export type PlanItemRuntimeRow = UserPlanItemRow & {
  last_entry_at: string | null;
  recent_entries: UserPlanItemEntryRow[];
};

export type ActiveLoadRuntime = MomentumStateV2["active_load"];

export type PlanRuntimeScope = "all" | "current_phase";

type PhaseScopedPlanItem = Pick<
  UserPlanItemRow,
  "id" | "phase_id" | "dimension" | "status" | "current_habit_state"
>;

export type CurrentPhaseRuntimeContext = {
  current_phase_id: string | null;
  current_phase_order: number | null;
  current_phase_title: string | null;
  total_phases: number;
  completed_phase_ids: string[];
  current_phase_item_ids: string[];
  maintenance_habit_item_ids: string[];
  heartbeat_title: string | null;
  heartbeat_unit: string | null;
  heartbeat_current: number | null;
  heartbeat_target: number | null;
  heartbeat_tracking_mode: "manual" | "inferred" | null;
  heartbeat_progress_ratio: number | null;
  heartbeat_reached: boolean;
  heartbeat_almost_reached: boolean;
  current_phase_completion_ratio: number | null;
  transition_ready: boolean;
};

export type ScopedPlanItemRuntime = {
  planItems: PlanItemRuntimeRow[];
  phaseContext: CurrentPhaseRuntimeContext | null;
};

function emptyPlanItemCounts(): PlanItemCountsByDimensionStatus {
  const counts = {} as PlanItemCountsByDimensionStatus;

  for (const dimension of PLAN_DIMENSIONS) {
    const byStatus = {} as Record<PlanItemStatus, number>;
    for (const status of PLAN_ITEM_STATUSES) {
      byStatus[status] = 0;
    }
    counts[dimension] = byStatus;
  }

  return counts;
}

function computePlanItemCounts(
  planItems: UserPlanItemRow[],
): PlanItemCountsByDimensionStatus {
  const counts = emptyPlanItemCounts();

  for (const item of planItems) {
    const dimension = item.dimension === "support"
      ? "clarifications"
      : item.dimension;
    counts[dimension][item.status] += 1;
  }

  return counts;
}




function mapEntriesByPlanItem(
  entries: UserPlanItemEntryRow[],
  maxEntriesPerItem = 5,
): Map<string, UserPlanItemEntryRow[]> {
  const entriesByItem = new Map<string, UserPlanItemEntryRow[]>();

  for (const entry of entries) {
    const itemEntries = entriesByItem.get(entry.plan_item_id) ?? [];
    if (maxEntriesPerItem < 0 || itemEntries.length < maxEntriesPerItem) {
      itemEntries.push(entry);
    }
    entriesByItem.set(entry.plan_item_id, itemEntries);
  }

  return entriesByItem;
}

function isPlanContentV3(
  content: Record<string, unknown> | null | undefined,
): content is PlanContentV3 {
  return Boolean(
    content &&
      typeof content === "object" &&
      content.version === 3 &&
      Array.isArray((content as PlanContentV3).phases),
  );
}

function isCompletedPhaseItem(item: PhaseScopedPlanItem): boolean {
  return item.status === "completed" ||
    item.status === "in_maintenance" ||
    item.status === "deactivated" ||
    item.status === "cancelled";
}

function isMaintenanceHabit(item: PhaseScopedPlanItem): boolean {
  return item.dimension === "habits" &&
    (item.status === "in_maintenance" ||
      item.current_habit_state === "in_maintenance");
}

export function resolveCurrentPhaseRuntimeContext(
  plan: Pick<UserPlanV2Row, "content"> | null,
  planItems: PhaseScopedPlanItem[],
): CurrentPhaseRuntimeContext | null {
  if (!plan || !isPlanContentV3(plan.content)) {
    return null;
  }

  const phases = [...plan.content.phases].sort((a, b) =>
    a.phase_order - b.phase_order
  );
  if (phases.length === 0) {
    return null;
  }

  const itemsByPhase = new Map<string, PhaseScopedPlanItem[]>();
  for (const item of planItems) {
    if (!item.phase_id) continue;
    const existing = itemsByPhase.get(item.phase_id) ?? [];
    existing.push(item);
    itemsByPhase.set(item.phase_id, existing);
  }

  const runtimePhaseId = typeof plan.content.current_level_runtime?.phase_id === "string" &&
      plan.content.current_level_runtime.phase_id.trim().length > 0
    ? plan.content.current_level_runtime.phase_id
    : null;
  const runtimeLevelOrder = typeof plan.content.current_level_runtime?.level_order === "number"
    ? plan.content.current_level_runtime.level_order
    : null;

  let currentPhase = runtimePhaseId
    ? phases.find((phase) => phase.phase_id === runtimePhaseId) ?? null
    : null;
  const completedPhaseIds: string[] = [];

  if (currentPhase) {
    for (const phase of phases) {
      if (phase.phase_id === currentPhase.phase_id) break;
      completedPhaseIds.push(phase.phase_id);
    }
  } else if (runtimeLevelOrder != null) {
    currentPhase = phases.find((phase) => phase.phase_order === runtimeLevelOrder) ?? null;
    if (currentPhase) {
      for (const phase of phases) {
        if (phase.phase_id === currentPhase.phase_id) break;
        completedPhaseIds.push(phase.phase_id);
      }
    }
  }

  if (!currentPhase) {
    for (const phase of phases) {
      const phaseItems = itemsByPhase.get(phase.phase_id) ?? [];
      const allDone = phaseItems.length > 0 &&
        phaseItems.every(isCompletedPhaseItem);

      if (!currentPhase && allDone) {
        completedPhaseIds.push(phase.phase_id);
        continue;
      }

      if (!currentPhase) {
        currentPhase = phase;
        break;
      }
    }
  }

  const currentPhaseItems = currentPhase
    ? itemsByPhase.get(currentPhase.phase_id) ?? []
    : [];
  const completedPhaseSet = new Set(completedPhaseIds);
  const maintenanceHabitItemIds = planItems
    .filter((item) =>
      item.phase_id &&
      completedPhaseSet.has(item.phase_id) &&
      isMaintenanceHabit(item)
    )
    .map((item) => item.id);

  const completedItemsInCurrentPhase = currentPhaseItems.filter(
    isCompletedPhaseItem,
  ).length;
  const completionRatio = currentPhaseItems.length > 0
    ? completedItemsInCurrentPhase / currentPhaseItems.length
    : null;

  const heartbeatTarget = currentPhase?.heartbeat.target ?? null;
  const trackingMode = currentPhase?.heartbeat.tracking_mode ?? null;

  // P0-5: Derive heartbeat.current from entries when tracking_mode is "inferred"
  let heartbeatCurrent: number | null;
  if (trackingMode === "inferred" && currentPhaseItems.length > 0) {
    heartbeatCurrent = completedItemsInCurrentPhase;
  } else {
    heartbeatCurrent = currentPhase?.heartbeat.current ?? null;
  }

  const heartbeatProgressRatio =
    heartbeatCurrent != null &&
      heartbeatTarget != null &&
      heartbeatTarget > 0
      ? heartbeatCurrent / heartbeatTarget
      : null;
  const heartbeatReached = heartbeatProgressRatio != null
    ? heartbeatProgressRatio >= 1
    : completionRatio === 1;
  const heartbeatAlmostReached = !heartbeatReached &&
    ((heartbeatProgressRatio != null && heartbeatProgressRatio >= 0.8) ||
      (completionRatio != null && completionRatio >= 0.75));

  return {
    current_phase_id: currentPhase?.phase_id ?? null,
    current_phase_order: getDisplayPhaseOrder(currentPhase?.phase_order),
    current_phase_title: currentPhase?.title ?? null,
    total_phases: getDisplayTotalPhases(phases.length),
    completed_phase_ids: completedPhaseIds,
    current_phase_item_ids: currentPhaseItems.map((item) => item.id),
    maintenance_habit_item_ids: maintenanceHabitItemIds,
    heartbeat_title: currentPhase?.heartbeat.title ?? null,
    heartbeat_unit: currentPhase?.heartbeat.unit ?? null,
    heartbeat_current: heartbeatCurrent,
    heartbeat_target: heartbeatTarget,
    heartbeat_tracking_mode: currentPhase?.heartbeat.tracking_mode ?? null,
    heartbeat_progress_ratio: heartbeatProgressRatio,
    heartbeat_reached: heartbeatReached,
    heartbeat_almost_reached: heartbeatAlmostReached,
    current_phase_completion_ratio: completionRatio,
    transition_ready: heartbeatReached || completionRatio === 1,
  };
}

export function scopePlanItemsToCurrentPhase<T extends PhaseScopedPlanItem>(
  plan: Pick<UserPlanV2Row, "content"> | null,
  planItems: T[],
): { planItems: T[]; phaseContext: CurrentPhaseRuntimeContext | null } {
  const phaseContext = resolveCurrentPhaseRuntimeContext(plan, planItems);
  if (!phaseContext || !phaseContext.current_phase_id) {
    return {
      planItems: phaseContext
        ? planItems.filter((item) =>
          phaseContext.maintenance_habit_item_ids.includes(item.id)
        )
        : planItems,
      phaseContext,
    };
  }

  const maintenanceHabitIds = new Set(phaseContext.maintenance_habit_item_ids);
  return {
    planItems: planItems.filter((item) =>
      item.phase_id === phaseContext.current_phase_id ||
      maintenanceHabitIds.has(item.id)
    ),
    phaseContext,
  };
}

async function loadPlanRow(
  _supabase: SupabaseClient,
  _planId: string,
): Promise<UserPlanV2Row | null> {
  // RETRAIT RÉSIDUS (2026-08-08): user_plans_v2 supprimée.
  return null;
}

export async function getActiveTransformationRuntime(
  _supabase: SupabaseClient,
  _userId: string,
): Promise<ActiveTransformationRuntime> {
  // RETRAIT RÉSIDUS (2026-08-08): le runtime de transformation B2C est
  // ÉTRANGLÉ ICI, à son unique point d'entrée — 0 utilisateur grand public,
  // tables de la cascade plan/transformation supprimées. Chaque consommateur
  // (loader, checkin_scope, momentum, snapshot) reçoit le runtime vide
  // qu'un élève KEEL a toujours reçu; aucun ne touche plus la base.
  return {
    cycle: null,
    transformation: null,
    plan: null,
    progress_markers: [],
    plan_item_counts: emptyPlanItemCounts(),
  };
}

export async function getPlanItemRuntime(
  supabase: SupabaseClient,
  planId: string,
  options?: {
    maxEntriesPerItem?: number | null;
    scope?: PlanRuntimeScope | null;
  },
): Promise<PlanItemRuntimeRow[]> {
  // RETRAIT RÉSIDUS (2026-08-08): plus de plan V2 — liste vide, même motif
  // que getActiveTransformationRuntime ci-dessus.
  return [];
}

export async function getScopedPlanItemRuntime(
  supabase: SupabaseClient,
  planId: string,
  options?: {
    maxEntriesPerItem?: number | null;
    scope?: PlanRuntimeScope | null;
  },
): Promise<ScopedPlanItemRuntime> {
  // RETRAIT RÉSIDUS (2026-08-08): plan V2 supprimé — runtime scopé vide.
  return {
    planItems: [],
    phaseContext: resolveCurrentPhaseRuntimeContext(null, []),
  };
}

export async function getWeeklyPlanItemRuntime(
  supabase: SupabaseClient,
  planId: string,
): Promise<PlanItemRuntimeRow[]> {
  // RETRAIT RÉSIDUS (2026-08-08): plan V2 supprimé — voir le choke de
  // getActiveTransformationRuntime plus haut.
  return [];
}

export async function getActiveLoad(
  supabase: SupabaseClient,
  planId: string,
): Promise<ActiveLoadRuntime> {
  // RETRAIT RÉSIDUS (2026-08-08): plan V2 supprimé — voir le choke de
  // getActiveTransformationRuntime plus haut.
  return computeActiveLoad([], new Map(), null);
}


// RETRAIT RÉSIDUS (2026-08-08): tryAdvancePhaseItems est parti avec le
// rollover et la distribution de plan (aucun appelant vivant).

/**
 * P0-6: Check whether a plan item belongs to the current (or completed) phase.
 * Items in future phases must not be activated manually.
 */
export function isItemInActivatablePhase(
  item: Pick<UserPlanItemRow, "phase_id" | "phase_order">,
  phaseContext: CurrentPhaseRuntimeContext | null,
): boolean {
  if (!phaseContext || !item.phase_id) return true;
  if (item.phase_id === phaseContext.current_phase_id) return true;
  if (phaseContext.completed_phase_ids.includes(item.phase_id)) return true;
  return false;
}
