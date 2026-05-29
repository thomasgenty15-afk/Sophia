import type { DailyReviewDecision, DailyReviewEffectPlan } from "./contract.ts";
import { buildDailyReviewEffectPlan } from "./effects.ts";

type ReducerTarget = {
  occurrence_id: string;
  plan_item_id: string;
};

type ReducerState = {
  status: "collecting" | "needs_clarification" | "complete" | "stopped";
  stop_reason:
    | "all_required_slots_filled"
    | "user_stopped"
    | "safety"
    | "unclear_after_retries"
    | null;
  items: Record<string, any>;
  should_apply_effects: boolean;
  effect_plan?: DailyReviewEffectPlan;
};

export function reduceDailyReviewState<
  TState extends ReducerState,
  TTarget extends ReducerTarget,
>(
  previousState: TState,
  decision: DailyReviewDecision,
  targets: TTarget[],
): TState {
  const targetIds = new Set(targets.map((target) => target.occurrence_id));
  const next: TState = {
    ...previousState,
    status: decision.status === "blocked" || decision.status === "opening"
      ? previousState.status
      : decision.status,
    stop_reason: decision.stop_reason,
    items: { ...previousState.items },
    should_apply_effects: false,
  };

  for (const [occurrenceId, update] of Object.entries(decision.item_updates)) {
    if (!targetIds.has(occurrenceId)) continue;
    next.items[occurrenceId] = {
      ...(next.items[occurrenceId] ?? {}),
      ...update,
    };
  }

  const effectPlan = buildDailyReviewEffectPlan(next, targets);
  next.effect_plan = effectPlan;
  next.should_apply_effects = effectPlan.allowed;
  if (effectPlan.allowed) {
    next.status = "complete";
    next.stop_reason = "all_required_slots_filled";
  }
  return next;
}
