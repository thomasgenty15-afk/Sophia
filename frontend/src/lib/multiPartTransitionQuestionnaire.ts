import type {
  QuestionnaireQuestionV2,
  QuestionnaireSchemaV2,
  QuestionnaireVisibilityRuleV2,
} from "./onboardingV2";

export const MULTI_PART_TRANSITION_QUESTIONNAIRE_SOURCE =
  "multi_part_transition_debrief";

function buildTextQuestion(args: {
  id: string;
  question: string;
  helperText: string;
  placeholder: string;
  required?: boolean;
  visibleIf?: QuestionnaireVisibilityRuleV2;
}): QuestionnaireQuestionV2 {
  return {
    id: args.id,
    kind: "text",
    question: args.question,
    helper_text: args.helperText,
    required: args.required ?? true,
    capture_goal: args.helperText,
    options: [],
    allow_other: false,
    placeholder: args.placeholder,
    max_selections: null,
    visible_if: args.visibleIf ?? null,
  };
}

function buildNumberQuestion(args: {
  id: string;
  question: string;
  helperText: string;
  minValue: number;
  maxValue: number;
  suggestedValue?: number;
  unit?: string | null;
}): QuestionnaireQuestionV2 {
  return {
    id: args.id,
    kind: "number",
    question: args.question,
    helper_text: args.helperText,
    required: true,
    capture_goal: args.helperText,
    options: [],
    allow_other: false,
    placeholder: null,
    max_selections: null,
    unit: args.unit ?? null,
    suggested_value: args.suggestedValue ?? null,
    min_value: args.minValue,
    max_value: args.maxValue,
    visible_if: null,
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
        id: "part_1_what_you_liked",
        question: "Qu'est-ce que tu as le plus aimé ou trouvé utile dans cette 1re partie ?",
        helperText: `On veut conserver dans "${nextLabel}" ce qui t'a vraiment aidé dans "${currentLabel}".`,
        placeholder: "Exemple : le ton, le rythme, certains outils, la structure, une habitude précise…",
      }),
      buildTextQuestion({
        id: "part_1_what_you_did_not_like",
        question: "Qu'est-ce que tu as moins aimé ou trouvé moins utile ?",
        helperText: "Dis ce qu'il vaut mieux alléger, retirer ou reformuler pour la suite.",
        placeholder: "Exemple : trop long, trop répétitif, pas assez concret, mal adapté à ton rythme…",
      }),
      buildNumberQuestion({
        id: "part_1_helpfulness_rating",
        question: "Sur 10, à quel point ce plan t'a aidé ?",
        helperText: "Donne une note simple et honnête, sans chercher la réponse idéale.",
        minValue: 0,
        maxValue: 10,
        suggestedValue: 8,
        unit: "/10",
      }),
      buildTextQuestion({
        id: "part_1_helpfulness_rating_why",
        question: "Pourquoi tu lui donnes cette note ?",
        helperText: "Cette question n'apparaît que si la note est en dessous de 8, pour comprendre ce qu'il faut corriger pour la suite.",
        placeholder: "Exemple : ce qui a manqué, ce qui a freiné, ce qui aurait rendu le plan plus utile pour toi…",
        visibleIf: {
          question_id: "part_1_helpfulness_rating",
          operator: "lt",
          value: 8,
        },
      }),
    ],
    metadata: {
      design_principle: "short_transition_temperature_check_before_second_part",
      measurement_hints: {
        metric_key: "multi_part_transition_readiness",
        metric_label: "Bilan de transition",
        unit: null,
        direction: "stabilize",
        measurement_mode: "score",
        baseline_prompt: "Comment la 1re partie t'a réellement aidé ?",
        target_prompt: "Que faut-il conserver ou corriger pour que la 2e partie soit mieux ajustée ?",
        suggested_target_value: 8,
        rationale: "Questionnaire de debrief court entre la partie 1 et la partie 2.",
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
