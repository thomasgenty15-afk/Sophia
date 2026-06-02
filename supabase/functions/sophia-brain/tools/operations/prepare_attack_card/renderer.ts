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
  `Je ne crée pas la carte depuis le chat. Voici la version à reprendre ${ATTACK_CARD_PLATFORM_DESTINATION}.`;

function draftLines(draft: AttackCardDraftV1): string[] {
  return [
    draft.draft.title,
    `Technique : ${draft.draft.technique_title}`,
    draft.draft.generated_asset,
    `Mode d'emploi : ${draft.draft.mode_emploi}`,
  ].filter((line) => String(line ?? "").trim());
}

export function renderAttackCardDraftOnlyReply(
  draft: AttackCardDraftV1,
): string {
  return [
    "Voici le brouillon complet à reprendre dans la plateforme.",
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
  const expected = platform?.expected_result;
  const expectedLines = expected
    ? [
      `Titre proposé : ${expected.output_title}`,
      expected.generated_asset,
      ...(expected.supporting_points.length > 0
        ? [
          "Points d'appui :",
          ...expected.supporting_points.map((item) => `- ${item}`),
        ]
        : []),
      `Mode d'emploi : ${expected.mode_emploi}`,
      ...(expected.keyword_trigger
        ? [
          "Mot de bascule à renseigner :",
          `- Mot-clé : ${expected.keyword_trigger.activation_keyword}`,
          `- Situation à risque : ${expected.keyword_trigger.risk_situation}`,
          `- Ancrage de force : ${expected.keyword_trigger.strength_anchor}`,
          `- Première réponse : ${expected.keyword_trigger.first_response_intent}`,
          `- Prompt Sophia : ${expected.keyword_trigger.assistant_prompt}`,
        ]
        : []),
    ]
    : [draft.recommendation.card_draft_summary];
  return [
    `Cible/action comprise : ${draft.target_summary}`,
    "",
    `Obstacle ou piège identifié : ${draft.blocker_summary}`,
    "",
    `Technique recommandée : ${draft.recommendation.technique_label}`,
    `Pourquoi : ${draft.recommendation.why_this_technique}`,
    "",
    `Destination plateforme : ${destination}`,
    ...(platform?.surface_label
      ? [`Surface UI : ${platform.surface_label}`]
      : []),
    ...steps.map((step, index) => `${index + 1}. ${step}`),
    ...(platform?.plan_action_note ? ["", platform.plan_action_note] : []),
    "",
    "Champs à renseigner dans la plateforme :",
    ...(inputs.length > 0
      ? inputs.flatMap((input, index) => [
        `${index + 1}. Question plateforme : ${input.question}`,
        `Réponse proposée : ${input.suggested_answer}`,
      ])
      : platform?.flow_kind === "plan_action_cards"
      ? [
        "Aucun champ manuel à remplir dans ce parcours : la plateforme génère la carte depuis l'action du plan. Utilise l'aperçu ci-dessous pour contrôler le résultat.",
      ]
      : [
        "Sélectionne la technique recommandée, puis renseigne les champs avec la cible, le piège et le brouillon ci-dessous.",
      ]),
    "",
    "Brouillon de carte :",
    draft.recommendation.card_draft_summary,
    "",
    "Aperçu du résultat attendu :",
    ...expectedLines,
    "",
    "À préserver :",
    ...draft.recommendation.preserve.map((item) => `- ${item}`),
    "",
    "À éviter :",
    ...draft.recommendation.avoid.map((item) => `- ${item}`),
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
        "Version à reprendre dans la plateforme :",
        draft.recommendation.card_draft_summary,
        "",
        `Destination plateforme : ${destination}`,
        ...(steps.length > 0
          ? [
            "Parcours plateforme :",
            ...steps.map((step, index) => `${index + 1}. ${step}`),
          ]
          : []),
        ...(inputs.length > 0
          ? [
            "Champs à renseigner :",
            ...inputs.flatMap((input, index) => [
              `${index + 1}. ${input.question}`,
              `Réponse : ${input.suggested_answer}`,
            ]),
          ]
          : draft.platform_handoff?.flow_kind === "plan_action_cards"
          ? [
            "Aucun champ manuel à remplir dans ce parcours : passe par le bloc Ressources de l'action du plan.",
          ]
          : [
            "Sélectionne la technique recommandée, puis renseigne les champs avec la cible, le piège et le brouillon ci-dessus.",
          ]),
      ]
      : []),
  ].join("\n");
}
