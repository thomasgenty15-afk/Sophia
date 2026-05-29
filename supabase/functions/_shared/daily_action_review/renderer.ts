import type { DailyReviewEffectsResult } from "./contract.ts";
import { dailyReviewEffectsFullyCommitted } from "./executor.ts";
import type { DailyReviewEffectPlan } from "./contract.ts";

function hasDoneLanguage(value: string): boolean {
  return /(c['’]?est\s+not[eé]|not[eé]|enregistr[eé]|marqu[eé]|pris en compte)/i
    .test(value);
}

export function renderDailyReviewCommitFailureMessage(
  result: DailyReviewEffectsResult,
): string {
  if (result.committed_effects.length > 0 && result.failed_effects.length > 0) {
    return "J'ai enregistré une partie du bilan, mais pas tout. Je ne marque donc pas le daily comme entièrement noté.";
  }
  return "Je n'ai pas réussi à enregistrer ce bilan, donc je ne le marque pas comme noté.";
}

export function dailyReviewFinalMessageRequiresCommit(params: {
  message: string | null;
  effect_plan: DailyReviewEffectPlan;
  result: DailyReviewEffectsResult;
}): string | null {
  const message = String(params.message ?? "").trim();
  if (!message) return null;
  if (!hasDoneLanguage(message)) return message;
  return dailyReviewEffectsFullyCommitted({
      effect_plan: params.effect_plan,
      result: params.result,
    })
    ? message
    : renderDailyReviewCommitFailureMessage(params.result);
}
