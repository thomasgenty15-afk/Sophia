import type {
  QuestionnaireQuestionV2,
  QuestionnaireSchemaV2,
  QuestionnaireVisibilityRuleV2,
} from "./onboardingV2";
import {
  transformationClosureHelpfulnessAreaOptions,
  transformationClosureImprovementReasonOptions,
} from "./transformationClosure";

export const MULTI_PART_TRANSITION_QUESTIONNAIRE_SOURCE =
  "multi_part_transition_debrief";
export const SIMPLE_TRANSITION_QUESTIONNAIRE_SOURCE =
  "simple_transition_debrief";

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

function buildChoiceQuestion(args: {
  id: string;
  kind: "single_choice" | "multiple_choice";
  question: string;
  helperText: string;
  options: Array<{ id: string; label: string }>;
  required?: boolean;
  visibleIf?: QuestionnaireVisibilityRuleV2;
  maxSelections?: number | null;
}): QuestionnaireQuestionV2 {
  return {
    id: args.id,
    kind: args.kind,
    question: args.question,
    helper_text: args.helperText,
    required: args.required ?? true,
    capture_goal: args.helperText,
    options: args.options,
    allow_other: false,
    placeholder: null,
    max_selections: args.kind === "multiple_choice" ? (args.maxSelections ?? 3) : null,
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
      buildChoiceQuestion({
        id: "part_1_most_helpful_area",
        kind: "single_choice",
        question: "Qu'est-ce qui t'a le plus aidé dans cette 1re partie ?",
        helperText: "",
        options: transformationClosureHelpfulnessAreaOptions.map((option) => ({
          id: option.value,
          label: option.label,
        })),
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
      buildChoiceQuestion({
        id: "part_1_improvement_reasons",
        kind: "multiple_choice",
        question: "Qu'est-ce qu'on aurait pu mieux faire pour la suite ?",
        helperText: "",
        options: transformationClosureImprovementReasonOptions.map((option) => ({
          id: option.value,
          label: option.label,
        })),
        maxSelections: 4,
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

export function buildSimpleTransitionQuestionnaireSchema(args: {
  transformationId: string;
  currentTransformationTitle: string | null;
  nextTransformationTitle: string | null;
}): QuestionnaireSchemaV2 {
  const currentLabel = args.currentTransformationTitle?.trim() || "cette transformation";
  const nextLabel = args.nextTransformationTitle?.trim() || "la suite";

  return {
    version: 1,
    transformation_id: args.transformationId,
    questions: [
      buildChoiceQuestion({
        id: "most_helpful_area",
        kind: "single_choice",
        question: "Qu'est-ce qui t'a le plus aidé dans cette transformation ?",
        helperText: "",
        options: transformationClosureHelpfulnessAreaOptions.map((option) => ({
          id: option.value,
          label: option.label,
        })),
      }),
      buildNumberQuestion({
        id: "helpfulness_rating",
        question: "Sur 10, à quel point ce plan t'a aidé ?",
        helperText: "Donne une note simple et honnête, sans chercher la réponse idéale.",
        minValue: 0,
        maxValue: 10,
        suggestedValue: 8,
        unit: "/10",
      }),
      buildChoiceQuestion({
        id: "improvement_reasons",
        kind: "multiple_choice",
        question: "Qu'est-ce qu'on aurait pu mieux faire pour la suite ?",
        helperText: "",
        options: transformationClosureImprovementReasonOptions.map((option) => ({
          id: option.value,
          label: option.label,
        })),
        maxSelections: 4,
        visibleIf: {
          question_id: "helpfulness_rating",
          operator: "lt",
          value: 8,
        },
      }),
    ],
    metadata: {
      design_principle: "short_transition_temperature_check_before_next_transformation",
      measurement_hints: {
        metric_key: "simple_transition_readiness",
        metric_label: "Bilan de fin de transformation",
        unit: null,
        direction: "stabilize",
        measurement_mode: "score",
        baseline_prompt: "Comment cette transformation t'a réellement aidé ?",
        target_prompt: "Que faut-il conserver ou corriger pour la suite ?",
        suggested_target_value: 8,
        rationale: "Questionnaire de debrief court avant de choisir la prochaine transformation.",
        confidence: 0.95,
      },
      source: SIMPLE_TRANSITION_QUESTIONNAIRE_SOURCE,
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
