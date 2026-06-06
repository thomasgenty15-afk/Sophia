import type {
  AttackCardHandoffDraft,
  PrepareAttackCardCommittedEffect,
  PrepareAttackCardEffect,
} from "./contract.ts";
import type { AttackCardDraftV1 } from "./generator.ts";
import { getHandoffTargetForOperation } from "../../../product_surface_registry/contract.ts";

export const ATTACK_CARD_PLATFORM_DESTINATION =
  getHandoffTargetForOperation("prepare_attack_card")
    ?.user_facing_destination ?? "dans la section Cartes d’attaque";

export const ATTACK_CARD_NO_MUTATION_CLOSING_LINE =
  "Je ne crée pas la carte depuis le chat. Utilise ces réponses pour remplir la carte dans la plateforme.";

function draftLines(draft: AttackCardDraftV1): string[] {
  return [
    draft.draft.title,
    `Technique : ${draft.draft.technique_title}`,
    `Mode d'emploi : ${draft.draft.mode_emploi}`,
  ].filter((line) => String(line ?? "").trim());
}

function sanitizePlatformStep(step: string): string {
  return step
    .replace(/\bcopie le brouillon\b/gi, "renseigne les champs préparés")
    .replace(/\bbrouillon\b/gi, "champs préparés")
    .replace(/\baperçu\b/gi, "points à vérifier");
}

function platformInputValue(input: {
  suggested_answer?: string;
  value?: string;
  status?: string;
}): string {
  const value = String(input.value ?? input.suggested_answer ?? "").trim();
  if (!value) return "";
  return input.status === "proposed" ? `${value} (à valider)` : value;
}

export function renderAttackCardDraftOnlyReply(
  draft: AttackCardDraftV1,
): string {
  return [
    "Voici les éléments à renseigner dans la plateforme.",
    "",
    ...draftLines(draft),
    "",
    ATTACK_CARD_NO_MUTATION_CLOSING_LINE,
  ].join("\n");
}

export function renderAttackCardPendingConfirmationReply(
  draft: AttackCardDraftV1,
): string {
  return [
    ...draftLines(draft),
    "",
    ATTACK_CARD_NO_MUTATION_CLOSING_LINE,
  ].join("\n");
}

export function renderAttackCardExecutedReply(
  committed: PrepareAttackCardCommittedEffect,
): string {
  return [
    ...draftLines(committed.draft),
    "",
    ATTACK_CARD_NO_MUTATION_CLOSING_LINE,
  ].join("\n");
}

export function renderAttackCardFailedReply(): string {
  return "Je n'ai pas réussi à créer cette carte techniquement. Je préfère ne pas te dire que c'est fait tant que la DB ne l'a pas confirmé.";
}

export function renderAttackCardBlockedCreateReply(): string {
  return ATTACK_CARD_NO_MUTATION_CLOSING_LINE;
}

export function renderAttackCardCancelledReply(): string {
  return "Ok, je laisse cette carte d'attaque de côté.";
}

export function renderAttackCardExplanationReply(
  draft: AttackCardDraftV1,
): string {
  return [
    `Pourquoi cette technique : ${draft.draft.why_it_helps}`,
    "",
    `Mode d'emploi : ${draft.draft.mode_emploi}`,
    "",
    ATTACK_CARD_NO_MUTATION_CLOSING_LINE,
  ].join("\n");
}

export function renderAttackCardPendingFromEffect(
  effect: PrepareAttackCardEffect,
): string {
  return renderAttackCardPendingConfirmationReply(effect.draft);
}

export function renderAttackCardPlatformHandoff(
  draft: AttackCardHandoffDraft,
): string {
  const target = getHandoffTargetForOperation("prepare_attack_card");
  const platform = draft.platform_handoff;
  const destination = platform?.destination ??
    draft.recommendation.platform_destination ??
    target?.user_facing_destination ??
    ATTACK_CARD_PLATFORM_DESTINATION;
  const steps = platform?.steps?.length
    ? platform.steps
    : draft.recommendation.platform_steps?.length
    ? draft.recommendation.platform_steps
    : target?.platform_steps ?? [];
  const inputs = platform?.inputs ?? [];
  const keyword = platform?.expected_result?.keyword_trigger;
  return [
    `Cible/action : ${draft.target_summary}`,
    `Piège à contrer : ${draft.blocker_summary}`,
    "",
    `Technique à sélectionner : ${draft.recommendation.technique_label}`,
    `Raison : ${draft.recommendation.why_this_technique}`,
    "",
    `Où aller : ${destination}`,
    ...steps.map((step, index) =>
      `${index + 1}. ${sanitizePlatformStep(step)}`
    ),
    ...(platform?.plan_action_note ? ["", platform.plan_action_note] : []),
    "",
    "Champs à remplir :",
    ...(inputs.length > 0
      ? inputs.flatMap((input, index) => [
        `${index + 1}. ${input.question}`,
        `Réponse : ${platformInputValue(input)}`,
      ])
      : platform?.flow_kind === "plan_action_cards"
      ? [
        "Aucun champ manuel à remplir dans ce parcours : la plateforme génère la carte depuis l'action du plan.",
      ]
      : [
        "Sélectionne la technique recommandée, puis renseigne les champs avec la cible et le piège ci-dessus.",
      ]),
    ...(keyword
      ? [
        "",
        "Mot de bascule :",
        `Mot-clé : ${keyword.activation_keyword}`,
        `Situation à risque : ${keyword.risk_situation}`,
        `Ancrage de force : ${keyword.strength_anchor}`,
      ]
      : []),
    "",
    ATTACK_CARD_NO_MUTATION_CLOSING_LINE,
  ].join("\n");
}

export function renderAttackCardApplyAttemptReply(
  draft?: AttackCardHandoffDraft | null,
): string {
  const target = getHandoffTargetForOperation("prepare_attack_card");
  const destination = draft?.platform_handoff?.destination ??
    draft?.recommendation.platform_destination ??
    target?.user_facing_destination ??
    ATTACK_CARD_PLATFORM_DESTINATION;
  const steps = draft?.platform_handoff?.steps?.length
    ? draft.platform_handoff.steps
    : draft?.recommendation.platform_steps ?? [];
  const inputs = draft?.platform_handoff?.inputs ?? [];
  return [
    ATTACK_CARD_NO_MUTATION_CLOSING_LINE,
    ...(draft
      ? [
        "",
        `Destination plateforme : ${destination}`,
        ...(steps.length > 0
          ? [
            "Parcours plateforme :",
            ...steps.map((step, index) =>
              `${index + 1}. ${sanitizePlatformStep(step)}`
            ),
          ]
          : []),
        ...(inputs.length > 0
          ? [
            "Champs à renseigner :",
            ...inputs.flatMap((input, index) => [
              `${index + 1}. ${input.question}`,
              `Réponse : ${platformInputValue(input)}`,
            ]),
          ]
          : draft.platform_handoff?.flow_kind === "plan_action_cards"
          ? [
            "Aucun champ manuel à remplir dans ce parcours : passe par le bloc Ressources de l'action du plan.",
          ]
          : [
            "Sélectionne la technique recommandée, puis renseigne les champs avec la cible et le piège ci-dessus.",
          ]),
      ]
      : []),
  ].join("\n");
}
