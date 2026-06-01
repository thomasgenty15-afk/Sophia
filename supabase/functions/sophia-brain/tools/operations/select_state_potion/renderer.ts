import type { SelectStatePotionSkillResult } from "./contract.ts";
import { renderNonCommittedReply } from "../_shared/committed_effect_renderer_guard.ts";

export function renderSelectStatePotionSkillResult(
  result: SelectStatePotionSkillResult,
): string {
  if (result.status === "executed" && result.committed_effects.length === 0) {
    return "Je n'ai pas de confirmation DB pour cette potion, donc je ne la marque pas comme activée.";
  }
  if (result.committed_effects.length === 0) {
    return renderNonCommittedReply(
      result.reply,
      result.status === "blocked"
        ? "Je ne peux pas activer cette potion dans cet état."
        : result.status === "cancelled"
        ? "Ok, je ne l'active pas."
        : "",
    );
  }
  return result.reply ?? "";
}
