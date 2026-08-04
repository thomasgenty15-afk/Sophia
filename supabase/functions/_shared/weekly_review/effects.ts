import type { WeeklyReviewPlanPatch } from "./contract.ts";

type WeeklyReviewOperation = WeeklyReviewPlanPatch["operations"][number];
type WeeklyReviewWriteResult = {
  committed: boolean;
  id?: string;
  error?: string;
};

export type WeeklyReviewEffectWriter = {
  applyWeeklyPlanPatch: (args: {
    user_id: string;
    week_start_date: string;
    operation: WeeklyReviewOperation;
  }) => Promise<WeeklyReviewWriteResult>;
  openLevelReview?: (args: {
    user_id: string;
    week_start_date: string;
    operation: WeeklyReviewOperation;
  }) => Promise<WeeklyReviewWriteResult>;
  writeWeeklySummary?: (args: {
    user_id: string;
    week_start_date: string;
    payload: Record<string, unknown>;
  }) => Promise<WeeklyReviewWriteResult>;
};

export type WeeklyReviewEffectsResult = {
  committed_effects: Array<{
    op: WeeklyReviewOperation["op"];
    id?: string;
  }>;
  failed_effects: Array<{
    op: WeeklyReviewOperation["op"];
    error: string;
  }>;
};

function weeklyEffectError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function committedWeeklyEffect(
  operation: WeeklyReviewOperation,
  writeResult: WeeklyReviewWriteResult,
): WeeklyReviewEffectsResult["committed_effects"][number] {
  return { op: operation.op, id: writeResult.id };
}

function failedWeeklyEffect(
  operation: WeeklyReviewOperation,
  error: string,
): WeeklyReviewEffectsResult["failed_effects"][number] {
  return { op: operation.op, error };
}

async function writeWeeklyOperation(args: {
  operation: WeeklyReviewOperation;
  user_id: string;
  week_start_date: string;
  writer: WeeklyReviewEffectWriter;
}): Promise<WeeklyReviewWriteResult> {
  const writeArgs = {
    user_id: args.user_id,
    week_start_date: args.week_start_date,
    operation: args.operation,
  };
  if (
    args.operation.op === "open_level_review" && args.writer.openLevelReview
  ) {
    return await args.writer.openLevelReview(writeArgs);
  }
  return await args.writer.applyWeeklyPlanPatch(writeArgs);
}

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
      const writeResult = await writeWeeklyOperation({
        operation,
        user_id: args.user_id,
        week_start_date: args.week_start_date,
        writer: args.writer,
      });
      if (writeResult.committed) {
        result.committed_effects.push(
          committedWeeklyEffect(operation, writeResult),
        );
      } else {
        result.failed_effects.push(
          failedWeeklyEffect(
            operation,
            writeResult.error ?? "writer_not_committed",
          ),
        );
      }
    } catch (err) {
      result.failed_effects.push(
        failedWeeklyEffect(operation, weeklyEffectError(err)),
      );
    }
  }

  return result;
}

export function weeklyReviewAppliedStatusForEffects(
  result: WeeklyReviewEffectsResult,
): "applied" | "blocked" {
  return result.committed_effects.length > 0 ? "applied" : "blocked";
}
