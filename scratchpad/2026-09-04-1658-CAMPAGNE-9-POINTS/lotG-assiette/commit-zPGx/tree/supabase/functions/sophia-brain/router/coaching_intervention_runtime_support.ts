import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { AgentMode } from "../state-manager.ts";
import type { DispatcherSignals } from "./dispatcher.ts";
import {
  buildCoachingInterventionRuntimeAddon,
  buildKnownCoachingBlockersFromTempMemory,
  type CoachingInterventionRuntimeAddon,
  type CoachingInterventionSelectorInput,
  type CoachingInterventionTriggerDetection,
  type CoachingV2MomentumContext,
  type CoachingV2PlanItemContext,
  detectCoachingInterventionTrigger,
  runCoachingInterventionSelector,
} from "../coaching_intervention_selector.ts";
import {
  buildTechniqueHistoryForSelector,
} from "../coaching_intervention_tracking.ts";
import {
  type ActiveTransformationRuntime,
  getPlanItemRuntime,
  type PlanItemRuntimeRow,
} from "../../_shared/v2-runtime.ts";
import { readMomentumStateV2 } from "../momentum_state.ts";
import {
  resolveActiveTransformationRuntime,
  type V2PlanItemSnapshotItem,
} from "./plan_snapshot_runtime.ts";
import { resolvePlanItemTitleFromSnapshot } from "./turn_context_runtime.ts";

function buildRecentContextSummaryForSelector(history: any[]): string | null {
  const lines = (history ?? [])
    .slice(-4)
    .map((item: any) => {
      const role = String(item?.role ?? "").trim();
      const content = String(item?.content ?? "").trim().slice(0, 180);
      if (!role || !content) return "";
      return `${role}: ${content}`;
    })
    .filter(Boolean);
  return lines.length > 0 ? lines.join("\n") : null;
}

function normalizePlanItemTitle(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function coachingDimensionForLog(
  dimension: PlanItemRuntimeRow["dimension"] | string | null | undefined,
): "mission" | "habit" | "support" | null {
  const normalized = String(dimension ?? "").trim();
  if (normalized === "missions" || normalized === "mission") return "mission";
  if (normalized === "habits" || normalized === "habit") return "habit";
  if (normalized === "support") return "support";
  return null;
}

function toCoachingPlanItemContext(
  item: PlanItemRuntimeRow,
): CoachingV2PlanItemContext {
  return {
    id: item.id,
    dimension: item.dimension,
    kind: item.kind,
    title: item.title,
    status: item.status,
  };
}

function findUniquePlanItemMatch(
  items: PlanItemRuntimeRow[],
  hint: string,
): CoachingV2PlanItemContext | null {
  const normalizedHint = normalizePlanItemTitle(hint);
  if (!normalizedHint) return null;

  const preferredStatuses = new Set([
    "active",
    "pending",
    "in_maintenance",
    "stalled",
  ]);
  const preferredItems = items.filter((item) =>
    preferredStatuses.has(item.status)
  );
  const searchPools = preferredItems.length > 0
    ? [preferredItems, items]
    : [items];

  for (const pool of searchPools) {
    const exactMatches = pool.filter((item) =>
      normalizePlanItemTitle(item.title) === normalizedHint
    );
    if (exactMatches.length === 1) {
      return toCoachingPlanItemContext(exactMatches[0]);
    }
  }

  for (const pool of searchPools) {
    const partialMatches = pool.filter((item) => {
      const normalizedTitle = normalizePlanItemTitle(item.title);
      return normalizedTitle.includes(normalizedHint) ||
        normalizedHint.includes(normalizedTitle);
    });
    if (partialMatches.length === 1) {
      return toCoachingPlanItemContext(partialMatches[0]);
    }
  }

  return null;
}

export function resolveCoachingTargetPlanItem(args: {
  planItems: PlanItemRuntimeRow[];
  actionHint?: string | null;
  fallbackTitle?: string | null;
}): CoachingV2PlanItemContext | null {
  const hint = String(args.actionHint ?? "").trim();
  if (hint) {
    const fromHint = findUniquePlanItemMatch(args.planItems, hint);
    if (fromHint) return fromHint;
  }

  const fallbackTitle = String(args.fallbackTitle ?? "").trim();
  if (fallbackTitle) {
    return findUniquePlanItemMatch(args.planItems, fallbackTitle);
  }

  return null;
}

export function mapMomentumStateV2ToCoachingContext(
  tempMemory: any,
): CoachingV2MomentumContext {
  const momentum = readMomentumStateV2(tempMemory);
  return {
    plan_fit: momentum.dimensions.plan_fit.level,
    load_balance: momentum.dimensions.load_balance.level,
    active_load_score: momentum.active_load.current_load_score,
    needs_reduce: momentum.active_load.needs_reduce,
    blocker_kind: momentum.blockers.blocker_kind,
    top_risk: momentum.assessment.top_risk,
    posture: momentum.posture.recommended_posture,
  };
}

async function loadCoachingSelectorV2Context(args: {
  supabase: SupabaseClient;
  userId: string;
  tempMemory: any;
  actionHint?: string | null;
  runtime?: ActiveTransformationRuntime | null;
}): Promise<{
  v2Momentum: CoachingV2MomentumContext;
  targetPlanItem: CoachingV2PlanItemContext | null;
}> {
  const v2Momentum = mapMomentumStateV2ToCoachingContext(args.tempMemory);
  const fallbackTitle = String(
    readMomentumStateV2(args.tempMemory).assessment?.top_blocker ?? "",
  ).trim();

  if (!String(args.actionHint ?? "").trim() && !fallbackTitle) {
    return { v2Momentum, targetPlanItem: null };
  }

  try {
    const resolvedRuntime = await resolveActiveTransformationRuntime({
      supabase: args.supabase,
      userId: args.userId,
      runtime: args.runtime,
    });
    if (!resolvedRuntime.plan) {
      return { v2Momentum, targetPlanItem: null };
    }
    const planItems = await getPlanItemRuntime(
      args.supabase,
      resolvedRuntime.plan.id,
    );
    return {
      v2Momentum,
      targetPlanItem: resolveCoachingTargetPlanItem({
        planItems,
        actionHint: args.actionHint,
        fallbackTitle,
      }),
    };
  } catch (error) {
    console.warn(
      "[Router] coaching V2 context load failed (non-blocking):",
      error,
    );
    return { v2Momentum, targetPlanItem: null };
  }
}

export type CoachingAddonAttempt = {
  trigger: CoachingInterventionTriggerDetection;
  input: CoachingInterventionSelectorInput;
  selector: Awaited<ReturnType<typeof runCoachingInterventionSelector>>;
  addon: CoachingInterventionRuntimeAddon | null;
};

export async function maybeAttachCoachingInterventionAddon(args: {
  supabase: SupabaseClient;
  userId: string;
  userMessage: string;
  history: any[];
  tempMemory: any;
  dispatcherSignals: DispatcherSignals;
  planItemSnapshot?: V2PlanItemSnapshotItem[];
  v2Runtime?: ActiveTransformationRuntime | null;
  targetMode: AgentMode;
  meta?: { requestId?: string; forceRealAi?: boolean; model?: string };
}): Promise<CoachingAddonAttempt | null> {
  const {
    supabase,
    userId,
    userMessage,
    history,
    tempMemory,
    dispatcherSignals,
    planItemSnapshot,
    v2Runtime,
    targetMode,
    meta,
  } = args;

  if (targetMode !== "companion") {
    try {
      delete (tempMemory as any).__coaching_intervention_addon;
    } catch {
      // best effort
    }
    return null;
  }

  const momentumV2 = readMomentumStateV2(tempMemory);
  const blockerRepeatScore = momentumV2.blockers.blocker_repeat_score ?? 0;
  const actionHint = String(
    dispatcherSignals.plan_item_discussion?.item_hint ??
      resolvePlanItemTitleFromSnapshot(
        planItemSnapshot,
        dispatcherSignals.plan_item_discussion?.target_item_id,
      ) ??
      dispatcherSignals.track_progress_plan_item?.target_title ??
      resolvePlanItemTitleFromSnapshot(
        planItemSnapshot,
        dispatcherSignals.track_progress_plan_item?.target_item_id,
      ) ?? "",
  )
    .trim()
    .slice(0, 120);
  const trigger = detectCoachingInterventionTrigger({
    userMessage,
    actionHint: actionHint || null,
    progressStatusHint: dispatcherSignals.track_progress_plan_item?.status_hint,
    topBlockerStage: blockerRepeatScore >= 6 ? "chronic" : null,
  });

  if (!trigger) {
    try {
      delete (tempMemory as any).__coaching_intervention_addon;
    } catch {
      // best effort
    }
    return null;
  }

  const coachingV2Context = await loadCoachingSelectorV2Context({
    supabase,
    userId,
    tempMemory,
    actionHint: actionHint || null,
    runtime: v2Runtime,
  });

  const knownBlockers = buildKnownCoachingBlockersFromTempMemory(tempMemory);
  const orderedKnownBlockers = trigger.blocker_hint
    ? [
      { blocker_type: trigger.blocker_hint, confidence: "medium" as const },
      ...knownBlockers.filter((item) =>
        item.blocker_type !== trigger.blocker_hint
      ),
    ].slice(0, 3)
    : knownBlockers;

  const selectorInput: CoachingInterventionSelectorInput = {
    momentum_state: momentumV2.current_state ?? null,
    explicit_help_request: trigger.explicit_help_request,
    trigger_kind: trigger.trigger_kind,
    last_user_message: userMessage,
    recent_context_summary: buildRecentContextSummaryForSelector(history),
    target_action_title: actionHint || null,
    target_plan_item: coachingV2Context.targetPlanItem,
    v2_momentum: coachingV2Context.v2Momentum,
    known_blockers: orderedKnownBlockers,
    technique_history: buildTechniqueHistoryForSelector(tempMemory),
    safety: {
      distress_detected: Number(dispatcherSignals.risk_score ?? 0) >= 8,
      pause_requested: momentumV2.current_state === "pause_consentie",
    },
  };

  const selector = await runCoachingInterventionSelector({
    input: selectorInput,
    meta: {
      requestId: meta?.requestId,
      forceRealAi: meta?.forceRealAi,
      model: meta?.model,
      userId,
    },
  });

  const addon = buildCoachingInterventionRuntimeAddon({
    input: selectorInput,
    output: selector.output,
    source: selector.source,
  });

  if (addon) {
    (tempMemory as any).__coaching_intervention_addon = addon;
  } else {
    try {
      delete (tempMemory as any).__coaching_intervention_addon;
    } catch {
      // best effort
    }
  }

  return {
    trigger,
    input: selectorInput,
    selector,
    addon,
  };
}
