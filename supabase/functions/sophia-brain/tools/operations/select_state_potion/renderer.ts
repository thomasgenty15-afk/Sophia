import type { SelectStatePotionSkillResult } from "./contract.ts";

export function renderSelectStatePotionSkillResult(
  result: SelectStatePotionSkillResult,
): string {
  if (result.status === "executed" && result.committed_effects.length === 0) {
    return "Je n'ai pas de confirmation DB pour cette potion, donc je ne la marque pas comme activée.";
  }
  return result.reply ?? "";
}
