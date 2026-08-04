import { useEffect, useMemo, useRef, useState } from "react";

import { supabase } from "../lib/supabase";
import {
  getPlanWeekCalendar,
  parsePlanScheduleAnchor,
} from "../lib/planSchedule";
import type {
  CurrentLevelRuntime,
  HeartbeatMetric,
  HabitState,
  PlanBlueprint,
  PlanBlueprintLevel,
  PlanContentV3,
  PlanDimension,
  PlanLevelWeek,
  PlanItemStatus,
  PlanPhase,
  UserCycleRow,
  UserPlanItemEntryRow,
  UserPlanV2Row,
  UserTransformationRow,
} from "../types/v2";
import type { DashboardV2PlanItemRuntime } from "./useDashboardV2Data";

type EntryKind = UserPlanItemEntryRow["entry_kind"];

export type DashboardV2UnlockState = {
  itemId: string;
  isReady: boolean;
  reason: string;
  remainingCount: number | null;
  dependsOnItems: DashboardV2PlanItemRuntime[];
};

export type DashboardV2UnlockPreview = DashboardV2UnlockState & {
  item: DashboardV2PlanItemRuntime;
};

export type DashboardV2DimensionGroup = {
  all: DashboardV2PlanItemRuntime[];
  active: DashboardV2PlanItemRuntime[];
  pending: DashboardV2PlanItemRuntime[];
  maintenance: DashboardV2PlanItemRuntime[];
  completed: DashboardV2PlanItemRuntime[];
};

export type PhaseRuntimeData = {
  phase_id: string;
  phase_order: number;
  title: string;
  rationale: string;
  phase_objective: string;
  intention?: string | null;
  duration_guidance?: string;
  duration_weeks?: number | null;
  what_this_phase_targets?: string | null;
  why_this_now?: string | null;
  how_this_phase_works?: string | null;
  phase_metric_target?: string | null;
  maintained_foundation: string[];
  heartbeat: HeartbeatMetric;
  weeks: PlanLevelWeek[];
  review_focus: string[];
  items: DashboardV2PlanItemRuntime[];
  state: "completed" | "active" | "future";
  transition_ready: boolean;
  summary_mode: "full" | "preview";
};

type DashboardV2LogicParams = {
  cycle: UserCycleRow | null;
  transformation: UserTransformationRow | null;
  plan: UserPlanV2Row | null;
  planItems: DashboardV2PlanItemRuntime[];
  planContentV3?: PlanContentV3 | null;
  refetch: () => Promise<void>;
};

type LogItemEntryParams = {
  entryKind?: EntryKind;
  outcome?: string;
  difficultyLevel?: UserPlanItemEntryRow["difficulty_level"];
  valueNumeric?: number | null;
  valueText?: string | null;
  incrementRepsBy?: number;
  markComplete?: boolean;
};

const DIMENSION_ORDER: PlanDimension[] = [
  "clarifications",
  "missions",
  "habits",
];

function canonicalPlanDimension(dimension: PlanDimension): PlanDimension {
  return dimension === "support" ? "clarifications" : dimension;
}

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function getGeneratedTempId(item: DashboardV2PlanItemRuntime): string | null {
  const generation = isRecordValue(item.payload?._generation)
    ? item.payload._generation
    : null;
  return generation && typeof generation.temp_id === "string"
    ? generation.temp_id
    : null;
}

// Déblocage par semaine: plus aucune condition entre items. Un item pending
// est prêt dès que sa première semaine assignée est commencée (ou qu'aucune
// information de semaine n'existe — fail-open, jamais de friction).
export type WeekUnlockContext = {
  activePhaseId: string | null;
  currentWeekOrder: number | null;
  firstWeekByTempId: Map<string, number>;
};

function buildWeekUnlockContext(
  planContentV3: PlanContentV3 | null | undefined,
): WeekUnlockContext {
  const runtime = planContentV3?.current_level_runtime ?? null;
  const weeks = runtime?.weeks ?? [];
  const anchor = parsePlanScheduleAnchor(
    planContentV3?.metadata?.schedule_anchor,
  );

  const firstWeekByTempId = new Map<string, number>();
  for (const week of [...weeks].sort((a, b) => a.week_order - b.week_order)) {
    for (const assignment of week.item_assignments ?? []) {
      const tempId = assignment?.temp_id?.trim();
      if (!tempId || firstWeekByTempId.has(tempId)) continue;
      firstWeekByTempId.set(tempId, week.week_order);
    }
  }

  let currentWeekOrder: number | null = null;
  if (anchor && weeks.length > 0) {
    let maxCompleted = 0;
    let current: number | null = null;
    let allUpcoming = true;
    for (const week of weeks) {
      const calendar = getPlanWeekCalendar(anchor, week.week_order);
      if (!calendar) continue;
      if (calendar.status === "current") current = week.week_order;
      if (calendar.status === "completed") {
        maxCompleted = Math.max(maxCompleted, week.week_order);
      }
      if (calendar.status !== "upcoming") allUpcoming = false;
    }
    if (current != null) currentWeekOrder = current;
    else if (!allUpcoming) currentWeekOrder = maxCompleted + 1;
    else currentWeekOrder = 0;
  }

  return {
    activePhaseId: runtime?.phase_id ?? null,
    currentWeekOrder,
    firstWeekByTempId,
  };
}

function sortItems(items: DashboardV2PlanItemRuntime[]) {
  return [...items].sort((left, right) => {
    const leftOrder = left.activation_order ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = right.activation_order ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return left.created_at.localeCompare(right.created_at);
  });
}

function isMaintenanceItem(item: DashboardV2PlanItemRuntime) {
  return item.status === "in_maintenance" ||
    item.current_habit_state === "in_maintenance";
}

function formatWeeksLabel(weeks: number | null | undefined): string | undefined {
  if (!weeks || weeks < 1) return undefined;
  return `${weeks} semaine${weeks > 1 ? "s" : ""}`;
}

function buildPreviewPhaseStub(level: PlanBlueprintLevel): PlanPhase {
  return {
    phase_id: level.phase_id,
    phase_order: level.level_order,
    title: level.title,
    rationale: level.intention,
    phase_objective: level.preview_summary ?? level.intention,
    duration_guidance: formatWeeksLabel(level.estimated_duration_weeks),
    duration_weeks: level.estimated_duration_weeks,
    what_this_phase_targets: null,
    why_this_now: null,
    how_this_phase_works: null,
    phase_metric_target: null,
    maintained_foundation: [],
    heartbeat: {
      title: "Progression du niveau",
      unit: "étapes",
      current: null,
      target: 0,
      tracking_mode: "manual",
    },
    weeks: [],
    items: [],
  };
}

function evaluateUnlockState(
  item: DashboardV2PlanItemRuntime,
  context: WeekUnlockContext,
): DashboardV2UnlockState {
  if (
    context.activePhaseId && item.phase_id &&
    item.phase_id !== context.activePhaseId
  ) {
    return {
      itemId: item.id,
      isReady: false,
      reason: "Cet élément arrive dans un niveau de plan ultérieur.",
      remainingCount: null,
      dependsOnItems: [],
    };
  }

  const tempId = getGeneratedTempId(item);
  const firstWeek = tempId
    ? context.firstWeekByTempId.get(tempId) ?? null
    : null;

  if (
    firstWeek == null ||
    context.currentWeekOrder == null ||
    firstWeek <= Math.max(1, context.currentWeekOrder)
  ) {
    return {
      itemId: item.id,
      isReady: true,
      reason: "Disponible maintenant.",
      remainingCount: 0,
      dependsOnItems: [],
    };
  }

  return {
    itemId: item.id,
    isReady: false,
    reason: `Arrive en semaine ${firstWeek} — activation automatique au début de sa semaine.`,
    remainingCount: null,
    dependsOnItems: [],
  };
}

function buildPhaseRuntime(
  phases: PlanPhase[],
  planItems: DashboardV2PlanItemRuntime[],
  blueprint: PlanBlueprint | null | undefined,
  currentLevelRuntime: CurrentLevelRuntime | null | undefined,
): PhaseRuntimeData[] {
  const phaseMap = new Map<string, PlanPhase>();
  for (const phase of phases) {
    phaseMap.set(phase.phase_id, phase);
  }
  for (const level of blueprint?.levels ?? []) {
    if (!phaseMap.has(level.phase_id)) {
      phaseMap.set(level.phase_id, buildPreviewPhaseStub(level));
    }
  }
  const mergedPhases = [...phaseMap.values()];

  const itemsByPhase = new Map<string, DashboardV2PlanItemRuntime[]>();
  for (const item of planItems) {
    if (!item.phase_id) continue;
    const existing = itemsByPhase.get(item.phase_id) ?? [];
    existing.push(item);
    itemsByPhase.set(item.phase_id, existing);
  }

  const blueprintByPhaseId = new Map<string, PlanBlueprintLevel>();
  const blueprintByOrder = new Map<number, PlanBlueprintLevel>();
  for (const level of blueprint?.levels ?? []) {
    blueprintByPhaseId.set(level.phase_id, level);
    blueprintByOrder.set(level.level_order, level);
  }

  const explicitCurrentLevelPhaseId = currentLevelRuntime?.phase_id ?? null;
  const explicitCurrentLevelOrder = currentLevelRuntime?.level_order ?? null;
  const hasExplicitLevelState = Boolean(
    explicitCurrentLevelPhaseId ||
      explicitCurrentLevelOrder != null ||
      (blueprint?.levels ?? []).some((level) => typeof level.status === "string"),
  );

  let foundActive = false;
  return mergedPhases
    .sort((a, b) => {
      const leftOrder =
        currentLevelRuntime?.phase_id === a.phase_id &&
          typeof currentLevelRuntime.level_order === "number"
          ? currentLevelRuntime.level_order
          : a.phase_order;
      const rightOrder =
        currentLevelRuntime?.phase_id === b.phase_id &&
          typeof currentLevelRuntime.level_order === "number"
          ? currentLevelRuntime.level_order
          : b.phase_order;
      return leftOrder - rightOrder;
    })
    .map((phase) => {
      const effectivePhaseOrder =
        currentLevelRuntime?.phase_id === phase.phase_id &&
          typeof currentLevelRuntime.level_order === "number"
          ? currentLevelRuntime.level_order
          : phase.phase_order;
      const items = sortItems(itemsByPhase.get(phase.phase_id) ?? []);
      const allDone =
        items.length > 0 &&
        items.every(
          (i) =>
            i.status === "completed" ||
            i.status === "in_maintenance",
        );

      const blueprintLevel =
        blueprintByPhaseId.get(phase.phase_id) ??
        blueprintByOrder.get(effectivePhaseOrder) ??
        null;
      const isCurrentLevel =
        currentLevelRuntime?.phase_id === phase.phase_id ||
        currentLevelRuntime?.level_order === effectivePhaseOrder;
      const blueprintStatus = blueprintLevel?.status ?? null;

      let state: "completed" | "active" | "future";
      if (hasExplicitLevelState) {
        if (isCurrentLevel || blueprintStatus === "current") {
          state = "active";
        } else if (
          blueprintStatus === "completed" ||
          (explicitCurrentLevelOrder != null && effectivePhaseOrder < explicitCurrentLevelOrder)
        ) {
          state = "completed";
        } else {
          state = "future";
        }
      } else if (allDone && !foundActive) {
        state = "completed";
      } else if (!foundActive) {
        state = "active";
        foundActive = true;
      } else {
        state = "future";
      }

      const weeks = isCurrentLevel
        ? currentLevelRuntime?.weeks ?? phase.weeks ?? []
        : phase.weeks ?? [];
      const reviewFocus = isCurrentLevel
        ? currentLevelRuntime?.review_focus ?? []
        : [];
      const title = isCurrentLevel
        ? currentLevelRuntime?.title ?? phase.title
        : blueprintLevel?.title ?? phase.title;
      const rationale = isCurrentLevel
        ? currentLevelRuntime?.rationale ?? phase.rationale
        : blueprintLevel?.intention ?? phase.rationale;
      const phaseObjective = isCurrentLevel
        ? currentLevelRuntime?.phase_objective ?? phase.phase_objective
        : blueprintLevel?.preview_summary ?? phase.phase_objective;
      const durationWeeks = isCurrentLevel
        ? currentLevelRuntime?.duration_weeks ?? phase.duration_weeks ?? null
        : blueprintLevel?.estimated_duration_weeks ?? phase.duration_weeks ?? null;
      const summaryMode = state === "future" && blueprintLevel ? "preview" : "full";

      return {
        phase_id: phase.phase_id,
        phase_order: effectivePhaseOrder,
        title,
        rationale,
        phase_objective: phaseObjective,
        intention: blueprintLevel?.intention ?? null,
        duration_guidance: phase.duration_guidance,
        duration_weeks: durationWeeks,
        what_this_phase_targets: isCurrentLevel
          ? currentLevelRuntime?.what_this_phase_targets ?? phase.what_this_phase_targets ?? null
          : phase.what_this_phase_targets ?? null,
        why_this_now: isCurrentLevel
          ? currentLevelRuntime?.why_this_now ?? phase.why_this_now ?? null
          : phase.why_this_now ?? null,
        how_this_phase_works: isCurrentLevel
          ? currentLevelRuntime?.how_this_phase_works ?? phase.how_this_phase_works ?? null
          : phase.how_this_phase_works ?? null,
        phase_metric_target: isCurrentLevel
          ? currentLevelRuntime?.phase_metric_target ?? phase.phase_metric_target ?? null
          : phase.phase_metric_target ?? null,
        maintained_foundation: isCurrentLevel
          ? currentLevelRuntime?.maintained_foundation ?? phase.maintained_foundation
          : phase.maintained_foundation,
        heartbeat: isCurrentLevel
          ? currentLevelRuntime?.heartbeat ?? phase.heartbeat
          : phase.heartbeat,
        weeks,
        review_focus: reviewFocus,
        items,
        state,
        transition_ready: isCurrentLevel && allDone,
        summary_mode: summaryMode,
      };
    });
}

function buildDimensionGroups(planItems: DashboardV2PlanItemRuntime[]) {
  const byDimension = new Map<PlanDimension, DashboardV2DimensionGroup>();

  for (const dimension of DIMENSION_ORDER) {
    const scoped = planItems.filter((item) =>
      canonicalPlanDimension(item.dimension) === dimension
    );
    const ordered = sortItems(scoped);

    byDimension.set(dimension, {
      all: ordered,
      active: ordered.filter((item) => item.status === "active"),
      pending: ordered.filter((item) => item.status === "pending"),
      maintenance: ordered.filter(isMaintenanceItem),
      completed: ordered.filter((item) => item.status === "completed"),
    });
  }

  return byDimension;
}

function nextStatusForEntry(
  item: DashboardV2PlanItemRuntime,
  entryKind: EntryKind,
  nextReps: number | null,
  markComplete: boolean,
): { status: PlanItemStatus; habitState: HabitState | null; completedAt: string | null } {
  const now = new Date().toISOString();

  if (item.dimension === "habits") {
    const target = item.target_reps ?? 5;
    if ((nextReps ?? 0) >= target || markComplete) {
      return {
        status: "in_maintenance",
        habitState: "in_maintenance",
        completedAt: now,
      };
    }

    return {
      status: "active",
      habitState: "active_building",
      completedAt: null,
    };
  }

  const target = item.target_reps ?? 1;
  if ((nextReps ?? 0) >= target || markComplete || item.tracking_type === "boolean") {
    return {
      status: "completed",
      habitState: item.current_habit_state,
      completedAt: now,
    };
  }

  return {
    status: "active",
    habitState: item.current_habit_state,
    completedAt: null,
  };
}

export function useDashboardV2Logic({
  cycle,
  transformation,
  plan,
  planItems,
  planContentV3,
  refetch,
}: DashboardV2LogicParams) {
  const [mutatingItemId, setMutatingItemId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const autoActivationSignatureRef = useRef<string>("");

  const itemsById = useMemo(
    () => new Map(planItems.map((item) => [item.id, item])),
    [planItems],
  );

  const dimensionGroups = useMemo(
    () => planContentV3 ? new Map() : buildDimensionGroups(planItems),
    [planItems, planContentV3],
  );

  const phases = useMemo<PhaseRuntimeData[]>(() => {
    if (!planContentV3?.phases) return [];
    return buildPhaseRuntime(
      planContentV3.phases,
      planItems,
      planContentV3.plan_blueprint,
      planContentV3.current_level_runtime,
    );
  }, [planContentV3, planItems]);

  const weekUnlockContext = useMemo(
    () => buildWeekUnlockContext(planContentV3),
    [planContentV3],
  );

  const unlockStateByItemId = useMemo(() => {
    const map = new Map<string, DashboardV2UnlockState>();
    for (const item of planItems) {
      if (item.status !== "pending") continue;
      map.set(item.id, evaluateUnlockState(item, weekUnlockContext));
    }
    return map;
  }, [planItems, weekUnlockContext]);

  const nextUnlock = useMemo<DashboardV2UnlockPreview | null>(() => {
    if (planContentV3) return null;
    const pending = sortItems(planItems.filter((item) => item.status === "pending"));
    if (pending.length === 0) return null;

    const ready = pending.find((item) => unlockStateByItemId.get(item.id)?.isReady);
    const candidate = ready ?? pending[0];
    const unlockState = unlockStateByItemId.get(candidate.id);

    if (!unlockState) return null;

    return {
      ...unlockState,
      item: candidate,
    };
  }, [planItems, unlockStateByItemId]);

  const autoActivatablePendingSignature = useMemo(() => {
    const scopedPending = planContentV3
      ? phases
        .find((phase) => phase.state === "active")
        ?.items.filter((item) => item.status === "pending") ?? []
      : planItems.filter((item) => item.status === "pending");

    const readyIds = sortItems(
      scopedPending.filter((item) => unlockStateByItemId.get(item.id)?.isReady),
    ).map((item) => item.id);

    return readyIds.join(",");
  }, [phases, planContentV3, planItems, unlockStateByItemId]);

  const tryAdvancePhase = async (planId: string) => {
    try {
      const { error } = await supabase.functions.invoke("advance-phase-v2", {
        body: { plan_id: planId },
      });
      if (!error) await refetch();
    } catch {
      // Non-blocking: phase advance retried on next visit or backend trigger
    }
  };

  const patchPlanItem = async (
    item: DashboardV2PlanItemRuntime,
    patch: Partial<DashboardV2PlanItemRuntime>,
  ) => {
    const { error } = await supabase
      .from("user_plan_items")
      .update({
        ...patch,
        updated_at: new Date().toISOString(),
      })
      .eq("id", item.id);

    if (error) throw error;
  };

  const logItemEntry = async (
    item: DashboardV2PlanItemRuntime,
    params?: LogItemEntryParams,
  ) => {
    if (!cycle || !transformation || !plan) return;

    const entryKind = params?.entryKind ?? (
      item.dimension === "habits" ? "checkin" : "progress"
    );
    const incrementRepsBy = params?.incrementRepsBy ?? (
      entryKind === "skip" ? 0 : 1
    );
    const nextReps = item.target_reps == null && item.dimension !== "habits"
      ? item.current_reps
      : Math.max((item.current_reps ?? 0) + incrementRepsBy, 0);
    const nextStatus = nextStatusForEntry(
      item,
      entryKind,
      nextReps ?? null,
      params?.markComplete ?? false,
    );

    setMutatingItemId(item.id);
    setActionError(null);

    try {
      const now = new Date().toISOString();

      const { error: entryError } = await supabase
        .from("user_plan_item_entries")
        .insert({
          user_id: item.user_id,
          cycle_id: cycle.id,
          transformation_id: transformation.id,
          plan_id: plan.id,
          plan_item_id: item.id,
          entry_kind: entryKind,
          outcome: params?.outcome ?? entryKind,
          value_numeric: params?.valueNumeric ?? nextReps ?? null,
          value_text: params?.valueText ?? null,
          difficulty_level: params?.difficultyLevel ?? null,
          effective_at: now,
          metadata: {
            source: "dashboard_v2",
          },
        });

      if (entryError) throw entryError;

      await patchPlanItem(item, {
        current_reps: nextReps ?? item.current_reps,
        status: nextStatus.status,
        current_habit_state: nextStatus.habitState,
        activated_at: item.activated_at ?? now,
        completed_at: nextStatus.completedAt,
      });

      await refetch();

      // P0-4: After completing/maintaining an item, try to advance phase
      if (
        plan &&
        planContentV3 &&
        (nextStatus.status === "completed" || nextStatus.status === "in_maintenance")
      ) {
        tryAdvancePhase(plan.id);
      }
    } catch (error) {
      console.error("[useDashboardV2Logic] log item entry failed", error);
      setActionError(
        error instanceof Error
          ? error.message
          : "Impossible d'enregistrer cette action.",
      );
    } finally {
      setMutatingItemId(null);
    }
  };

  const completeItem = async (item: DashboardV2PlanItemRuntime) => {
    await logItemEntry(item, {
      entryKind: item.dimension === "habits" ? "checkin" : "progress",
      outcome: item.dimension === "habits" ? "habit_checked" : "item_progressed",
      markComplete: item.dimension !== "habits" &&
        ((item.target_reps ?? 1) <= ((item.current_reps ?? 0) + 1)),
    });
  };

  useEffect(() => {
    if (mutatingItemId) return;
    if (!autoActivatablePendingSignature) {
      autoActivationSignatureRef.current = "";
      return;
    }
    if (autoActivationSignatureRef.current === autoActivatablePendingSignature) return;

    const nextItemId = autoActivatablePendingSignature.split(",")[0]?.trim();
    if (!nextItemId) {
      autoActivationSignatureRef.current = "";
      return;
    }

    const nextItem = itemsById.get(nextItemId);
    if (!nextItem || nextItem.status !== "pending") {
      autoActivationSignatureRef.current = "";
      return;
    }

    autoActivationSignatureRef.current = autoActivatablePendingSignature;
    setMutatingItemId(nextItem.id);
    setActionError(null);

    void (async () => {
      try {
        const { error } = await supabase.functions.invoke("activate-plan-item-v2", {
          body: { plan_item_id: nextItem.id },
        });
        if (error) throw error;
        await refetch();
      } catch (error) {
        console.error("[useDashboardV2Logic] auto activate item failed", error);
        autoActivationSignatureRef.current = "";
        setActionError(
          error instanceof Error
            ? error.message
            : "Impossible de débloquer cet élément.",
        );
      } finally {
        setMutatingItemId(null);
      }
    })();
  }, [autoActivatablePendingSignature, itemsById, mutatingItemId, refetch]);

  return {
    dimensionGroups,
    phases,
    unlockStateByItemId,
    nextUnlock,
    mutatingItemId,
    actionError,
    completeItem,
  };
}
