import type {
  DailyReviewCommittedEffect,
  DailyReviewEffect,
  DailyReviewEffectPlan,
  DailyReviewEffectsResult,
} from "./contract.ts";

export type DailyReviewEffectWriteResult = {
  entry_id: string;
  commit_status?: DailyReviewCommittedEffect["commit_status"];
};

export async function executeDailyReviewEffectPlan(params: {
  effect_plan: DailyReviewEffectPlan;
  writeEffect: (
    effect: DailyReviewEffect,
  ) => Promise<DailyReviewEffectWriteResult>;
}): Promise<DailyReviewEffectsResult> {
  if (!params.effect_plan.allowed) {
    return { committed_effects: [], failed_effects: [] };
  }

  const committed_effects: DailyReviewCommittedEffect[] = [];
  const failed_effects: DailyReviewEffectsResult["failed_effects"] = [];

  for (const effect of params.effect_plan.effects) {
    try {
      const result = await params.writeEffect(effect);
      if (!String(result.entry_id ?? "").trim()) {
        failed_effects.push({
          type: "log_daily_action_review",
          occurrence_id: effect.occurrence_id,
          plan_item_id: effect.plan_item_id,
          error: "missing_entry_id",
        });
        continue;
      }
      committed_effects.push({
        type: "log_daily_action_review",
        occurrence_id: effect.occurrence_id,
        plan_item_id: effect.plan_item_id,
        entry_id: result.entry_id,
        outcome: effect.outcome,
        reason_category: effect.reason_category,
        source: effect.source,
        commit_status: result.commit_status ?? "inserted",
      });
    } catch (error) {
      failed_effects.push({
        type: "log_daily_action_review",
        occurrence_id: effect.occurrence_id,
        plan_item_id: effect.plan_item_id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { committed_effects, failed_effects };
}

export function dailyReviewEffectsFullyCommitted(params: {
  effect_plan: DailyReviewEffectPlan;
  result: DailyReviewEffectsResult;
}): boolean {
  return params.effect_plan.allowed &&
    params.effect_plan.effects.length > 0 &&
    params.result.failed_effects.length === 0 &&
    params.result.committed_effects.length ===
      params.effect_plan.effects.length;
}
