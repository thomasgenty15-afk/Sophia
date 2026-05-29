import type { WeeklyReviewPlanPatch } from "./contract.ts";

export type WeeklyReviewEffectWriter = {
  applyWeeklyPlanPatch: (args: {
    user_id: string;
    week_start_date: string;
    operation: WeeklyReviewPlanPatch["operations"][number];
  }) => Promise<{ committed: boolean; id?: string; error?: string }>;
  openLevelReview?: (args: {
    user_id: string;
    week_start_date: string;
    operation: WeeklyReviewPlanPatch["operations"][number];
  }) => Promise<{ committed: boolean; id?: string; error?: string }>;
  writeWeeklySummary?: (args: {
    user_id: string;
    week_start_date: string;
    payload: Record<string, unknown>;
  }) => Promise<{ committed: boolean; id?: string; error?: string }>;
};

export type WeeklyReviewEffectsResult = {
  committed_effects: Array<{
    op: WeeklyReviewPlanPatch["operations"][number]["op"];
    id?: string;
  }>;
  failed_effects: Array<{
    op: WeeklyReviewPlanPatch["operations"][number]["op"];
    error: string;
  }>;
};

export async function applyWeeklyReviewEffects(args: {
  plan_patch: WeeklyReviewPlanPatch;
  user_id: string;
  week_start_date: string;
  confirmed: boolean;
  writer: WeeklyReviewEffectWriter;
}): Promise<WeeklyReviewEffectsResult> {
  const result: WeeklyReviewEffectsResult = {
    committed_effects: [],
    failed_effects: [],
  };
  if (!args.confirmed || !args.plan_patch.requires_confirmation) {
    return result;
  }

  for (const operation of args.plan_patch.operations) {
    try {
      const writeResult = operation.op === "open_level_review" &&
          args.writer.openLevelReview
        ? await args.writer.openLevelReview({
          user_id: args.user_id,
          week_start_date: args.week_start_date,
          operation,
        })
        : await args.writer.applyWeeklyPlanPatch({
          user_id: args.user_id,
          week_start_date: args.week_start_date,
          operation,
        });
      if (writeResult.committed) {
        result.committed_effects.push({ op: operation.op, id: writeResult.id });
      } else {
        result.failed_effects.push({
          op: operation.op,
          error: writeResult.error ?? "writer_not_committed",
        });
      }
    } catch (err) {
      result.failed_effects.push({
        op: operation.op,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return result;
}

export function weeklyReviewAppliedStatusForEffects(
  result: WeeklyReviewEffectsResult,
): "applied" | "blocked" {
  return result.committed_effects.length > 0 ? "applied" : "blocked";
}
