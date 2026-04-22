import type {
  TransformationClosureHelpfulnessArea,
  TransformationClosureImprovementReason,
} from "../types/v2";

export const transformationClosureImprovementReasonOptions: Array<{
  value: TransformationClosureImprovementReason;
  label: string;
}> = [
  { value: "plan_unclear", label: "Le plan n'était pas assez clair" },
  { value: "pace_too_intense", label: "Le rythme était trop intense" },
  { value: "actions_too_hard", label: "Les actions étaient trop difficiles à tenir" },
  { value: "actions_not_real_life", label: "Les actions ne collaient pas assez à ma vraie vie" },
  { value: "sophia_not_helpful_moment", label: "Sophia ne m'a pas assez aidé au bon moment" },
  { value: "progress_not_visible", label: "Je ne voyais pas assez clairement mes progrès" },
  { value: "need_more_support", label: "J'aurais eu besoin de plus de soutien" },
  { value: "other", label: "Autre" },
];

export const transformationClosureHelpfulnessAreaOptions: Array<{
  value: TransformationClosureHelpfulnessArea;
  label: string;
}> = [
  { value: "habits", label: "Les habitudes du plan" },
  { value: "one_off_actions", label: "Les actions ponctuelles" },
  { value: "sophia_messages", label: "Les échanges avec Sophia" },
  { value: "plan_structure", label: "Le cadre global du plan" },
  { value: "progress_tracking", label: "Le suivi de mes progrès" },
  { value: "other", label: "Autre" },
];

export function getTransformationClosureImprovementReasonLabel(
  value: TransformationClosureImprovementReason,
): string {
  return transformationClosureImprovementReasonOptions.find((option) => option.value === value)?.label ??
    value;
}

export function getTransformationClosureHelpfulnessAreaLabel(
  value: TransformationClosureHelpfulnessArea,
): string {
  return transformationClosureHelpfulnessAreaOptions.find((option) => option.value === value)?.label ??
    value;
}
