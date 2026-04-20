import type { QuestionnaireSchemaV2 } from "./onboardingV2";

export const MULTI_PART_TRANSITION_QUESTIONNAIRE_SOURCE =
  "multi_part_transition_debrief";

function buildTextQuestion(args: {
  id: string;
  question: string;
  helperText: string;
  placeholder: string;
}): QuestionnaireSchemaV2["questions"][number] {
  return {
    id: args.id,
    kind: "text",
    question: args.question,
    helper_text: args.helperText,
    required: true,
    capture_goal: args.helperText,
    options: [],
    allow_other: false,
    placeholder: args.placeholder,
    max_selections: null,
  };
}

export function buildMultiPartTransitionQuestionnaireSchema(args: {
  transformationId: string;
  currentTransformationTitle: string | null;
  nextTransformationTitle: string | null;
  previousTransformationId: string | null;
}): QuestionnaireSchemaV2 {
  const currentLabel = args.currentTransformationTitle?.trim() || "la 1re partie";
  const nextLabel = args.nextTransformationTitle?.trim() || "la 2e partie";

  return {
    version: 1,
    transformation_id: args.transformationId,
    questions: [
      buildTextQuestion({
        id: "part_1_what_worked",
        question: "Qu'est-ce qui a le mieux marché pendant cette 1re partie ?",
        helperText: `Aide Sophia à comprendre ce qui t'a vraiment aidé dans "${currentLabel}".`,
        placeholder: "Exemple : le rythme, certains outils, une habitude, une façon de formuler les choses…",
      }),
      buildTextQuestion({
        id: "part_1_what_was_harder",
        question: "Qu'est-ce qui a moins bien marché ou a été plus difficile à tenir ?",
        helperText: "Décris les frottements réels, pas une version idéale.",
        placeholder: "Exemple : moments de la journée difficiles, consignes trop lourdes, rythme trop ambitieux…",
      }),
      buildTextQuestion({
        id: "part_1_what_you_liked",
        question: "Qu'est-ce que tu as aimé ou trouvé utile dans ce plan ?",
        helperText: "On veut conserver ce qui te convient vraiment pour la suite.",
        placeholder: "Exemple : ton du plan, structure, simplicité, concret, sensation d'élan…",
      }),
      buildTextQuestion({
        id: "part_1_what_you_did_not_like",
        question: "Qu'est-ce que tu as moins aimé, ou trouvé inutile ?",
        helperText: "Sophia doit aussi savoir ce qu'il ne faut pas reconduire tel quel.",
        placeholder: "Exemple : répétitif, culpabilisant, mal adapté à ton rythme, pas assez concret…",
      }),
      buildTextQuestion({
        id: "part_2_important_context",
        question: "Qu'est-ce qu'il est important que Sophia sache avant de construire la 2e partie ?",
        helperText: `Donne ici tout ce qui aidera à dessiner "${nextLabel}" de façon juste.`,
        placeholder: "Exemple : ce que tu veux préserver, éviter, ton contexte actuel, ton vrai niveau d'énergie…",
      }),
    ],
    metadata: {
      design_principle: "transition_temperature_check_before_second_part",
      measurement_hints: {
        metric_key: "multi_part_transition_readiness",
        metric_label: "Bilan de transition",
        unit: null,
        direction: "stabilize",
        measurement_mode: "score",
        baseline_prompt: "Comment s'est réellement passée la 1re partie ?",
        target_prompt: "Qu'est-ce qu'il faut intégrer pour que la 2e partie soit mieux ajustée ?",
        suggested_target_value: null,
        rationale: "Questionnaire fixe de debrief entre la partie 1 et la partie 2.",
        confidence: 0.95,
      },
      source: MULTI_PART_TRANSITION_QUESTIONNAIRE_SOURCE,
      previous_transformation_id: args.previousTransformationId,
      current_transformation_title: args.currentTransformationTitle,
      next_transformation_title: args.nextTransformationTitle,
    },
  };
}

export function isMultiPartTransitionQuestionnaireSchema(
  schema: QuestionnaireSchemaV2 | null | undefined,
): boolean {
  return schema?.metadata?.source === MULTI_PART_TRANSITION_QUESTIONNAIRE_SOURCE;
}
