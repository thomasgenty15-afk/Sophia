import type {
  DefenseCardHandoffDraft,
  PrepareDefenseCardCommittedEffect,
  PrepareDefenseCardSkillResult,
} from "./contract.ts";
import type { DefenseCardDraftV1 } from "./generator.ts";
import { renderNonCommittedReply } from "../_shared/committed_effect_renderer_guard.ts";
import { getHandoffTargetForOperation } from "../../../product_surface_registry/contract.ts";

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
    return "Je ne peux pas préparer cette carte de défense : le contenu est incomplet.";
  }
  return "Je n'ai pas réussi à créer cette carte techniquement. Je préfère ne pas te dire que c'est calé tant que la DB ne l'a pas confirmé.";
}

export function renderDefenseCardFallbackFailed(): string {
  return "Je n'ai pas pu préparer cette carte de défense depuis le chat pour l'instant.";
}

function fieldLabel(fieldId: string | undefined, fallback: string): string {
  if (fieldId === "support_need") {
    return "Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ?";
  }
  return fallback;
}

function destinationForImperative(destination: string): string {
  return destination.replace(/^dans\s+/i, "");
}

export function renderDefenseCardHandoff(args: {
  handoff: DefenseCardHandoffDraft;
  status?:
    | "handoff_delivered"
    | "repeat_handoff"
    | "revise_handoff"
    | "apply_attempt";
}): string {
  const { handoff } = args;
  const target = getHandoffTargetForOperation("prepare_defense_card");
  const destination = handoff.recommendation.platform_destination ||
    target?.user_facing_destination ||
    "dans la section Cartes de défense";
  if (args.status === "apply_attempt") {
    return [
      "Je ne crée pas la carte depuis le chat.",
      `Va dans ${
        destinationForImperative(destination)
      }; reprends la phrase préparée juste au-dessus dans la plateforme.`,
    ].join("\n");
  }
  const platformFlow = (handoff as any).platform_flow ?? {};
  const entryNeed = platformFlow.entry_need &&
      typeof platformFlow.entry_need === "object"
    ? platformFlow.entry_need as { question_label?: string; value?: string }
    : null;
  const questionnaireAnswers = Array.isArray(platformFlow.questionnaire_answers)
    ? platformFlow.questionnaire_answers
    : [];
  const supportAnswer = questionnaireAnswers.find((answer: any) =>
    String(answer?.field_id ?? "").trim() === "support_need"
  );
  const supportField = [
    ...(entryNeed?.value
      ? [{
        field_id: "support_need",
        question_label: entryNeed.question_label ??
          "Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ?",
        value: entryNeed.value,
      }]
      : []),
    ...(!entryNeed?.value && supportAnswer
      ? [{
        field_id: "support_need",
        question_label: String(supportAnswer.question_label ?? "Champ").trim(),
        value: String(supportAnswer.value ?? supportAnswer.answer ?? "").trim(),
      }]
      : []),
  ][0] ?? null;
  const supportLabel = supportField
    ? fieldLabel(supportField.field_id, supportField.question_label)
    : "Avec quelle situation / contexte / environnement / pulsion as-tu besoin d'aide ?";
  const supportValue = String(supportField?.value ?? "").trim();
  return [
    `Où aller : ${destination}`,
    "",
    "Dans la plateforme, le champ à préparer est :",
    `« ${supportLabel} »`,
    supportValue ? "" : "",
    supportValue ? "Je te proposerais d'écrire :" : "",
    supportValue ? `« ${supportValue} »` : "",
    "",
    "Je ne crée pas la carte depuis le chat.",
  ].filter((line) => line !== "").join("\n");
}

export function renderDefenseCardSkillResult(
  result: PrepareDefenseCardSkillResult,
): string {
  if (result.reply) {
    return result.committed_effects.length > 0
      ? result.reply
      : renderNonCommittedReply(
        result.reply,
        renderDefenseCardFallbackFailed(),
      );
  }
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
