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
    return "Je ne peux pas créer cette carte de défense : le brouillon est incomplet.";
  }
  return "Je n'ai pas réussi à créer cette carte techniquement. Je préfère ne pas te dire que c'est calé tant que la DB ne l'a pas confirmé.";
}

export function renderDefenseCardFallbackFailed(): string {
  return "Je n'ai pas pu préparer cette carte de défense depuis le chat pour l'instant.";
}

function lines(items: string[]): string {
  return items.filter(Boolean).map((item) => `- ${item}`).join("\n");
}

function fieldLine(label: string, value: string): string {
  return `- ${label} : ${String(value ?? "").trim() || "à compléter"}`;
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
  const steps = handoff.recommendation.platform_steps.length > 0
    ? handoff.recommendation.platform_steps
    : target?.platform_steps ?? [];
  const platformFields = (handoff as any).platform_fields ?? {};
  const platformFlow = (handoff as any).platform_flow ?? {};
  const finalFields = {
    label: String(platformFields.label ?? "").trim(),
    situation: String(platformFields.situation ?? "").trim(),
    signal: String(platformFields.signal ?? "").trim(),
    defense_response: String(platformFields.defense_response ?? "").trim(),
    plan_b: String(platformFields.plan_b ?? "").trim(),
  };
  const hasFinalFields = Object.values(finalFields).some(Boolean);
  const questionnaireAnswers = Array.isArray(platformFlow.questionnaire_answers)
    ? platformFlow.questionnaire_answers
    : [];
  const intro = args.status === "apply_attempt"
    ? `Je ne crée pas la carte depuis le chat. Voici la version à reprendre ${destination}.`
    : `Je ne crée pas la carte depuis le chat. Voici la version à reprendre ${destination}.`;
  return [
    intro,
    "",
    `1. Situation / action comprise : ${handoff.target_summary}`,
    `2. Risque identifié : ${handoff.risk_summary}`,
    `3. Stratégie de défense recommandée : ${handoff.recommendation.defense_strategy_label}`,
    `Pourquoi : ${handoff.recommendation.why_this_strategy}`,
    "",
    `4. Parcours plateforme : ${String(platformFlow.route_label ?? "Carte de défense").trim()}`,
    String(platformFlow.entry_need ?? "").trim()
      ? `Besoin libre à renseigner : ${String(platformFlow.entry_need).trim()}`
      : "",
    questionnaireAnswers.length > 0
      ? `Réponses aux 3 questions :\n${questionnaireAnswers.map((
        answer: any,
      ) =>
        fieldLine(
          String(answer.question_label ?? answer.field ?? "Question").trim(),
          String(answer.answer ?? "").trim(),
        )
      ).join("\n")}`
      : "",
    "",
    hasFinalFields
      ? [
        "5. Champs finaux à recopier :",
        fieldLine("Nom de la carte", finalFields.label),
        fieldLine("Le moment", finalFields.situation),
        fieldLine("Le piège", finalFields.signal),
        fieldLine("Mon geste", finalFields.defense_response),
        fieldLine("Plan B", finalFields.plan_b),
      ].join("\n")
      : `5. Brouillon de carte : ${handoff.recommendation.card_draft_summary}`,
    "",
    `6. À préserver :\n${lines(handoff.recommendation.preserve)}`,
    "",
    `7. À éviter :\n${lines(handoff.recommendation.avoid)}`,
    "",
    `8. Destination plateforme : ${destination}`,
    lines(steps),
    "",
    "Je ne crée ni ne modifie aucune carte depuis ce chat.",
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
