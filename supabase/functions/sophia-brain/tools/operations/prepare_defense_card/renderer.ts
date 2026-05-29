import type {
  PrepareDefenseCardCommittedEffect,
  PrepareDefenseCardSkillResult,
} from "./contract.ts";
import type { DefenseCardDraftV1 } from "./generator.ts";

export const DEFENSE_CARD_CREATED_LOCATION =
  "Tu peux la retrouver dans Ressources > Cartes de défense pour la relire, l'utiliser et l'ajuster depuis la plateforme quand l'option est disponible. Depuis le chat, je ne modifie pas une carte existante; si elle ne convient plus, je peux aussi en préparer une nouvelle version après confirmation.";

export function renderDefenseCardExecuted(args: {
  draft: DefenseCardDraftV1;
  committedEffects: PrepareDefenseCardCommittedEffect[];
}): string {
  const committed = args.committedEffects.find((effect) =>
    effect.type === "create_defense_card" && effect.defense_card_id
  );
  if (!committed) {
    return "Je n'ai pas de confirmation DB pour cette carte, donc je ne la marque pas comme créée.";
  }
  return `C'est fait. J'ai créé une carte de défense pour ${args.draft.draft.risk_situation} : ${args.draft.draft.defense_response}\n\n${DEFENSE_CARD_CREATED_LOCATION}`;
}

export function renderDefenseCardBlocked(reasonCode: string): string {
  if (reasonCode === "draft_invalid") {
    return "Je ne peux pas créer cette carte de défense : le brouillon est incomplet.";
  }
  return "Je n'ai pas réussi à créer cette carte techniquement. Je préfère ne pas te dire que c'est calé tant que la DB ne l'a pas confirmé.";
}

export function renderDefenseCardFallbackFailed(): string {
  return "Je n'ai pas pu préparer cette carte de défense depuis le chat pour l'instant.";
}

export function renderDefenseCardSkillResult(
  result: PrepareDefenseCardSkillResult,
): string {
  if (result.reply) return result.reply;
  if (result.status === "executed") {
    return result.committed_effects.length > 0
      ? "C'est fait. La carte de défense a été créée."
      : renderDefenseCardFallbackFailed();
  }
  if (result.status === "blocked") {
    return renderDefenseCardBlocked(result.debug.reason_code);
  }
  return renderDefenseCardFallbackFailed();
}
