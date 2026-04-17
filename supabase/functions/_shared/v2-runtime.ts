import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { computeActiveLoad } from "./v2-active-load.ts";
import {
  evaluateActivationReadiness,
  normalizeDependsOn,
} from "./v2-plan-item-activation.ts";
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
  north_star: UserMetricRow | null;
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

async function getActiveCycle(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserCycleRow | null> {
  const result = await supabase
    .from("user_cycles")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error) throw result.error;
  return (result.data as UserCycleRow | null) ?? null;
}

async function getCycleActiveTransformation(
  supabase: SupabaseClient,
  cycle: UserCycleRow,
): Promise<UserTransformationRow | null> {
  if (cycle.active_transformation_id) {
    const byIdResult = await supabase
      .from("user_transformations")
      .select("*")
      .eq("id", cycle.active_transformation_id)
      .eq("cycle_id", cycle.id)
      .limit(1)
      .maybeSingle();

    if (byIdResult.error) throw byIdResult.error;
    if (byIdResult.data) {
      return byIdResult.data as UserTransformationRow;
    }
  }

  const activeResult = await supabase
    .from("user_transformations")
    .select("*")
    .eq("cycle_id", cycle.id)
    .eq("status", "active")
    .order("activated_at", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeResult.error) throw activeResult.error;
  return (activeResult.data as UserTransformationRow | null) ?? null;
}

async function getActivePlanForTransformation(
  supabase: SupabaseClient,
  transformation: UserTransformationRow,
): Promise<UserPlanV2Row | null> {
  const result = await supabase
    .from("user_plans_v2")
    .select("*")
    .eq("transformation_id", transformation.id)
    .eq("cycle_id", transformation.cycle_id)
    .eq("status", "active")
    .order("activated_at", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error) throw result.error;
  return (result.data as UserPlanV2Row | null) ?? null;
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
  supabase: SupabaseClient,
  planId: string,
): Promise<UserPlanV2Row | null> {
  const result = await supabase
    .from("user_plans_v2")
    .select("*")
    .eq("id", planId)
    .limit(1)
    .maybeSingle();

  if (result.error) throw result.error;
  return (result.data as UserPlanV2Row | null) ?? null;
}

export async function getActiveTransformationRuntime(
  supabase: SupabaseClient,
  userId: string,
): Promise<ActiveTransformationRuntime> {
  const cycle = await getActiveCycle(supabase, userId);

  if (!cycle) {
    return {
      cycle: null,
      transformation: null,
      plan: null,
      north_star: null,
      progress_markers: [],
      plan_item_counts: emptyPlanItemCounts(),
    };
  }

  const [transformation, northStarResult] = await Promise.all([
    getCycleActiveTransformation(supabase, cycle),
    supabase
      .from("user_metrics")
      .select("*")
      .eq("user_id", userId)
      .eq("cycle_id", cycle.id)
      .eq("scope", "cycle")
      .eq("kind", "north_star")
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (northStarResult.error) throw northStarResult.error;

  if (!transformation) {
    return {
      cycle,
      transformation: null,
      plan: null,
      north_star: (northStarResult.data as UserMetricRow | null) ?? null,
      progress_markers: [],
      plan_item_counts: emptyPlanItemCounts(),
    };
  }

  const [plan, progressMarkersResult] = await Promise.all([
    getActivePlanForTransformation(supabase, transformation),
    supabase
      .from("user_metrics")
      .select("*")
      .eq("user_id", userId)
      .eq("cycle_id", cycle.id)
      .eq("transformation_id", transformation.id)
      .eq("scope", "transformation")
      .eq("kind", "progress_marker")
      .eq("status", "active")
      .order("updated_at", { ascending: false }),
  ]);

  if (progressMarkersResult.error) throw progressMarkersResult.error;

  let planItemCounts = emptyPlanItemCounts();

  if (plan) {
    const planItemsResult = await supabase
      .from("user_plan_items")
      .select("*")
      .eq("plan_id", plan.id);

    if (planItemsResult.error) throw planItemsResult.error;
    const planItems = (planItemsResult.data as UserPlanItemRow[] | null) ?? [];
    planItemCounts = computePlanItemCounts(planItems);
  }

  return {
    cycle,
    transformation,
    plan,
    north_star: (northStarResult.data as UserMetricRow | null) ?? null,
    progress_markers: (progressMarkersResult.data as UserMetricRow[] | null) ??
      [],
    plan_item_counts: planItemCounts,
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
  const scoped = await getScopedPlanItemRuntime(supabase, planId, options);
  return scoped.planItems;
}

export async function getScopedPlanItemRuntime(
  supabase: SupabaseClient,
  planId: string,
  options?: {
    maxEntriesPerItem?: number | null;
    scope?: PlanRuntimeScope | null;
  },
): Promise<ScopedPlanItemRuntime> {
  const [planItemsResult, entriesResult] = await Promise.all([
    supabase
      .from("user_plan_items")
      .select("*")
      .eq("plan_id", planId)
      .order("dimension", { ascending: true })
      .order("activation_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
    supabase
      .from("user_plan_item_entries")
      .select("*")
      .eq("plan_id", planId)
      .order("effective_at", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  if (planItemsResult.error) throw planItemsResult.error;
  if (entriesResult.error) throw entriesResult.error;

  const planItems = (planItemsResult.data as UserPlanItemRow[] | null) ?? [];
  const entries = (entriesResult.data as UserPlanItemEntryRow[] | null) ?? [];
  const maxEntriesPerItem = options?.maxEntriesPerItem == null
    ? 5
    : Math.max(-1, Math.floor(options.maxEntriesPerItem));
  const entriesByItem = mapEntriesByPlanItem(entries, maxEntriesPerItem);

  const planItemsRuntime = planItems.map((item) => {
    const recentEntries = entriesByItem.get(item.id) ?? [];
    return {
      ...item,
      last_entry_at: recentEntries[0]?.effective_at ?? null,
      recent_entries: recentEntries,
    };
  });

  if ((options?.scope ?? "all") !== "current_phase") {
    return { planItems: planItemsRuntime, phaseContext: null };
  }

  const plan = await loadPlanRow(supabase, planId);
  return scopePlanItemsToCurrentPhase(plan, planItemsRuntime);
}

export async function getWeeklyPlanItemRuntime(
  supabase: SupabaseClient,
  planId: string,
): Promise<PlanItemRuntimeRow[]> {
  return await getPlanItemRuntime(supabase, planId, {
    // Weekly bilan needs the full rolling week, not the default 5-entry cap.
    maxEntriesPerItem: Number.MAX_SAFE_INTEGER,
    scope: "current_phase",
  });
}

export async function getActiveLoad(
  supabase: SupabaseClient,
  planId: string,
): Promise<ActiveLoadRuntime> {
  const [planItemsResult, entriesResult, plan] = await Promise.all([
    supabase
      .from("user_plan_items")
      .select("*")
      .eq("plan_id", planId),
    supabase
      .from("user_plan_item_entries")
      .select("*")
      .eq("plan_id", planId)
      .order("effective_at", { ascending: false })
      .order("created_at", { ascending: false }),
    loadPlanRow(supabase, planId),
  ]);

  if (planItemsResult.error) throw planItemsResult.error;
  if (entriesResult.error) throw entriesResult.error;

  const planItems = (planItemsResult.data as UserPlanItemRow[] | null) ?? [];
  const entries = (entriesResult.data as UserPlanItemEntryRow[] | null) ?? [];
  const phaseContext = resolveCurrentPhaseRuntimeContext(plan, planItems);

  return computeActiveLoad(
    planItems,
    mapEntriesByPlanItem(entries),
    phaseContext,
  );
}

/**
 * P0-4: Activate pending items in the current phase.
 * When a phase becomes current (e.g. after the previous phase was completed),
 * its items remain "pending". This function activates items whose activation
 * conditions are satisfied, preventing the "dead zone" with 0 active items.
 *
 * P0-6: Also serves as the sole entry-point for phase progression, ensuring
 * items in future phases cannot be activated prematurely.
 */
export async function tryAdvancePhaseItems(
  supabase: SupabaseClient,
  planId: string,
  userId: string,
): Promise<{ activatedCount: number; phaseId: string | null }> {
  const plan = await loadPlanRow(supabase, planId);
  if (!plan || !isPlanContentV3(plan.content)) {
    return { activatedCount: 0, phaseId: null };
  }

  const itemsResult = await supabase
    .from("user_plan_items")
    .select("*")
    .eq("plan_id", planId)
    .eq("user_id", userId);

  if (itemsResult.error) throw itemsResult.error;
  const items = (itemsResult.data as UserPlanItemRow[] | null) ?? [];

  const phaseContext = resolveCurrentPhaseRuntimeContext(plan, items);
  if (!phaseContext?.current_phase_id) {
    return { activatedCount: 0, phaseId: null };
  }

  const pendingInCurrentPhase = items.filter(
    (item) =>
      item.phase_id === phaseContext.current_phase_id &&
      item.status === "pending",
  );

  if (pendingInCurrentPhase.length === 0) {
    return { activatedCount: 0, phaseId: phaseContext.current_phase_id };
  }

  const now = new Date().toISOString();
  let activatedCount = 0;

  for (const item of pendingInCurrentPhase) {
    const dependencyIds = normalizeDependsOn(
      item.activation_condition?.depends_on,
    );
    const dependencies = dependencyIds.length > 0
      ? items.filter((i) => dependencyIds.includes(i.id))
      : [];

    const readiness = evaluateActivationReadiness({
      condition: item.activation_condition,
      dependencies,
    });

    if (readiness.isReady) {
      const { error: updateError } = await supabase
        .from("user_plan_items")
        .update({
          status: "active" as PlanItemStatus,
          activated_at: now,
          updated_at: now,
          current_habit_state: item.dimension === "habits"
            ? "active_building"
            : item.current_habit_state,
        })
        .eq("id", item.id)
        .eq("user_id", userId);

      if (!updateError) activatedCount++;
    }
  }

  if (activatedCount > 0) {
    const cycleId = items[0]?.cycle_id;
    const transformationId = items[0]?.transformation_id;
    if (cycleId && transformationId) {
      try {
        await logV2Event(supabase, V2_EVENT_TYPES.PHASE_ITEMS_ACTIVATED, {
          user_id: userId,
          cycle_id: cycleId,
          transformation_id: transformationId,
          plan_id: planId,
          reason: "phase_advance",
          metadata: {
            phase_id: phaseContext.current_phase_id,
            activated_count: activatedCount,
          },
        });
      } catch {
        // Non-blocking event logging
      }

      if (phaseContext.completed_phase_ids.length > 0) {
        try {
          await logV2Event(supabase, V2_EVENT_TYPES.PHASE_TRANSITION, {
            user_id: userId,
            cycle_id: cycleId,
            transformation_id: transformationId,
            plan_id: planId,
            reason: "phase_completed",
            metadata: {
              completed_phase_ids: phaseContext.completed_phase_ids,
              new_current_phase_id: phaseContext.current_phase_id,
            },
          });
        } catch {
          // Non-blocking event logging
        }
      }
    }
  }

  return { activatedCount, phaseId: phaseContext.current_phase_id };
}

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
