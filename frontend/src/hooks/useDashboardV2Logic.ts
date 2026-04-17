import { useEffect, useMemo, useRef, useState } from "react";

import { supabase } from "../lib/supabase";
import { getDisplayPhaseOrder } from "../lib/planPhases";
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

type ActivationCondition = Record<string, unknown> | null;

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
  stalled: DashboardV2PlanItemRuntime[];
  completed: DashboardV2PlanItemRuntime[];
};

function isHiddenItemStatus(item: DashboardV2PlanItemRuntime) {
  return item.status === "deactivated" || item.status === "cancelled";
}

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
  phase1Completed?: boolean;
  refetch: () => Promise<void>;
};

type LogItemEntryParams = {
  entryKind?: EntryKind;
  outcome?: string;
  difficultyLevel?: UserPlanItemEntryRow["difficulty_level"];
  blockerHint?: string | null;
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

function normalizeDependsOn(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }
  return [];
}

function getMinCompletions(condition: ActivationCondition) {
  if (!condition) return null;
  const raw = condition.min_completions;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

function getPositiveEntryCount(item: DashboardV2PlanItemRuntime) {
  const fromEntries = item.recent_entries.filter((entry) =>
    entry.entry_kind === "checkin" ||
    entry.entry_kind === "progress" ||
    entry.entry_kind === "partial"
  ).length;

  return Math.max(item.current_reps ?? 0, fromEntries);
}

function getConditionType(condition: ActivationCondition) {
  if (!condition) return null;
  return typeof condition.type === "string" ? condition.type : null;
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

function isStalledItem(item: DashboardV2PlanItemRuntime) {
  return item.status === "stalled" || item.current_habit_state === "stalled";
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
  itemsById: Map<string, DashboardV2PlanItemRuntime>,
): DashboardV2UnlockState {
  const condition = item.activation_condition;
  const type = getConditionType(condition);

  if (!condition || type === "immediate") {
    return {
      itemId: item.id,
      isReady: true,
      reason: "Disponible maintenant.",
      remainingCount: 0,
      dependsOnItems: [],
    };
  }

  const dependsOnIds = normalizeDependsOn(condition.depends_on);
  const dependsOnItems = dependsOnIds
    .map((id) => itemsById.get(id))
    .filter((value): value is DashboardV2PlanItemRuntime => Boolean(value));

  if (type === "after_item_completion" || type === "after_milestone") {
    const incompleteDependencies = dependsOnItems.filter((dependency) =>
      dependency.status !== "completed" && !isMaintenanceItem(dependency)
    );

    if (incompleteDependencies.length === 0) {
      return {
        itemId: item.id,
        isReady: true,
        reason: "Les prérequis sont validés.",
        remainingCount: 0,
        dependsOnItems,
      };
    }

    const lead = incompleteDependencies[0];
    return {
      itemId: item.id,
      isReady: false,
      reason:
        incompleteDependencies.length === 1
          ? `Terminer "${lead.title}" pour débloquer cet élément.`
          : `Valider ${incompleteDependencies.length} prérequis avant de débloquer cet élément.`,
      remainingCount: incompleteDependencies.length,
      dependsOnItems,
    };
  }

  if (type === "after_habit_traction") {
    const habit = dependsOnItems[0];
    const minCompletions = getMinCompletions(condition) ?? 3;

    if (!habit) {
      return {
        itemId: item.id,
        isReady: false,
        reason: "Une dépendance d'habitude est introuvable.",
        remainingCount: minCompletions,
        dependsOnItems: [],
      };
    }

    const completions = getPositiveEntryCount(habit);
    const remaining = Math.max(minCompletions - completions, 0);

    return {
      itemId: item.id,
      isReady: remaining === 0,
      reason: remaining === 0
        ? `"${habit.title}" a atteint la traction requise.`
        : `Plus que ${remaining} validation${remaining > 1 ? "s" : ""} sur "${habit.title}".`,
      remainingCount: remaining,
      dependsOnItems: [habit],
    };
  }

  return {
    itemId: item.id,
    isReady: false,
    reason: "Condition de déblocage non reconnue.",
    remainingCount: null,
    dependsOnItems,
  };
}

function buildPhaseRuntime(
  phases: PlanPhase[],
  planItems: DashboardV2PlanItemRuntime[],
  phase1Completed: boolean,
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
    if (isHiddenItemStatus(item)) continue;
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
    .sort((a, b) => a.phase_order - b.phase_order)
    .map((phase) => {
      const items = sortItems(itemsByPhase.get(phase.phase_id) ?? []);
      const allDone =
        items.length > 0 &&
        items.every(
          (i) =>
            i.status === "completed" ||
            i.status === "in_maintenance" ||
            i.status === "deactivated" ||
            i.status === "cancelled",
        );

      const blueprintLevel =
        blueprintByPhaseId.get(phase.phase_id) ??
        blueprintByOrder.get(phase.phase_order) ??
        null;
      const isCurrentLevel =
        currentLevelRuntime?.phase_id === phase.phase_id ||
        currentLevelRuntime?.level_order === phase.phase_order;
      const blueprintStatus = blueprintLevel?.status ?? null;

      let state: "completed" | "active" | "future";
      if (hasExplicitLevelState) {
        if (isCurrentLevel || blueprintStatus === "current") {
          state = "active";
        } else if (
          blueprintStatus === "completed" ||
          (explicitCurrentLevelOrder != null && phase.phase_order < explicitCurrentLevelOrder)
        ) {
          state = "completed";
        } else {
          state = "future";
        }
      } else if (allDone && !foundActive) {
        state = "completed";
      } else if (!foundActive && phase1Completed) {
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
        phase_order: getDisplayPhaseOrder(phase.phase_order),
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
  const visibleItems = planItems.filter((item) => !isHiddenItemStatus(item));

  for (const dimension of DIMENSION_ORDER) {
    const scoped = visibleItems.filter((item) =>
      canonicalPlanDimension(item.dimension) === dimension
    );
    const ordered = sortItems(scoped);

    byDimension.set(dimension, {
      all: ordered,
      active: ordered.filter((item) => item.status === "active"),
      pending: ordered.filter((item) => item.status === "pending"),
      maintenance: ordered.filter(isMaintenanceItem),
      stalled: ordered.filter(isStalledItem),
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
    if (entryKind === "skip" || entryKind === "blocker") {
      return {
        status: "stalled",
        habitState: "stalled",
        completedAt: null,
      };
    }

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
  phase1Completed = false,
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
      phase1Completed,
      planContentV3.plan_blueprint,
      planContentV3.current_level_runtime,
    );
  }, [planContentV3, planItems, phase1Completed]);

  const unlockStateByItemId = useMemo(() => {
    const map = new Map<string, DashboardV2UnlockState>();
    for (const item of planItems) {
      if (item.status !== "pending") continue;
      map.set(item.id, evaluateUnlockState(item, itemsById));
    }
    return map;
  }, [itemsById, planItems]);

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
      entryKind === "skip" || entryKind === "blocker" ? 0 : 1
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
          blocker_hint: params?.blockerHint ?? null,
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

  const activateItem = async (item: DashboardV2PlanItemRuntime) => {
    if (item.status !== "pending") return;

    setMutatingItemId(item.id);
    setActionError(null);

    try {
      const { error } = await supabase.functions.invoke("activate-plan-item-v2", {
        body: { plan_item_id: item.id },
      });
      if (error) throw error;
      await refetch();
    } catch (error) {
      console.error("[useDashboardV2Logic] activate item failed", error);
      setActionError(
        error instanceof Error
          ? error.message
          : "Impossible de débloquer cet élément.",
      );
    } finally {
      setMutatingItemId(null);
    }
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

  const prepareItemCards = async (item: DashboardV2PlanItemRuntime) => {
    if (
      item.dimension !== "missions" &&
      item.dimension !== "habits"
    ) {
      return;
    }
    if (
      item.status === "pending" ||
      item.status === "deactivated" ||
      item.status === "cancelled"
    ) {
      return;
    }

    setMutatingItemId(item.id);
    setActionError(null);

    try {
      const { error } = await supabase.functions.invoke("prepare-plan-item-cards-v2", {
        body: { plan_item_id: item.id },
      });
      if (error) throw error;
      await refetch();
    } catch (error) {
      console.error("[useDashboardV2Logic] prepare item cards failed", error);
      setActionError(
        error instanceof Error
          ? error.message
          : "Impossible de préparer les cartes pour cet élément.",
      );
    } finally {
      setMutatingItemId(null);
    }
  };

  const markItemBlocked = async (item: DashboardV2PlanItemRuntime) => {
    await logItemEntry(item, {
      entryKind: "blocker",
      outcome: "blocked",
      blockerHint: "Signalé depuis le dashboard",
    });
  };

  const setItemStatus = async (
    item: DashboardV2PlanItemRuntime,
    status: PlanItemStatus,
  ) => {
    setMutatingItemId(item.id);
    setActionError(null);

    try {
      await patchPlanItem(item, {
        status,
        current_habit_state: status === "deactivated" || status === "cancelled"
          ? null
          : item.current_habit_state,
        completed_at: status === "cancelled" ? new Date().toISOString() : item.completed_at,
      });
      await refetch();
    } catch (error) {
      console.error("[useDashboardV2Logic] set item status failed", error);
      setActionError(
        error instanceof Error
          ? error.message
          : "Impossible de mettre à jour cet élément.",
      );
    } finally {
      setMutatingItemId(null);
    }
  };

  const deactivateItem = async (item: DashboardV2PlanItemRuntime) => {
    await setItemStatus(item, "deactivated");
  };

  const removeItem = async (item: DashboardV2PlanItemRuntime) => {
    await setItemStatus(item, "cancelled");
  };

  return {
    dimensionGroups,
    phases,
    unlockStateByItemId,
    nextUnlock,
    mutatingItemId,
    actionError,
    completeItem,
    activateItem,
    prepareItemCards,
    markItemBlocked,
    deactivateItem,
    removeItem,
  };
}
