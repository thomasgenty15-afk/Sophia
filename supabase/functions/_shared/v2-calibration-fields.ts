/**
 * Extracted from generate-plan-v2/index.ts to break the cross-function
 * import from generate-defense-card-v3 -> generate-plan-v2.
 */

export type StructuredCalibrationFields = {
  struggle_duration: string | null;
  starting_point: string | null;
  main_blocker: string | null;
  priority_goal: string | null;
  perceived_difficulty: string | null;
  probable_drivers: string | null;
  prior_attempts: string | null;
  self_confidence: number | null;
  success_indicator: string | null;
  metric_label: string | null;
  metric_unit: string | null;
  metric_direction: string | null;
  metric_measurement_mode: string | null;
  metric_baseline_value: number | null;
  metric_target_value: number | null;
  metric_baseline_text: string | null;
  metric_target_text: string | null;
};

type QuestionnaireOptionDescriptor = {
  id: string;
  label: string;
};

type QuestionnaireSystemQuestionDescriptor = {
  id: string;
  capture_goal: string;
  options: QuestionnaireOptionDescriptor[];
};

type QuestionnaireMeasurementHintsDescriptor = {
  metric_label: string | null;
  unit: string | null;
  direction: string | null;
  measurement_mode: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function extractSystemQuestionDescriptors(
  questionnaireSchema: Record<string, unknown> | null,
): Map<string, QuestionnaireSystemQuestionDescriptor> {
  const descriptors = new Map<string, QuestionnaireSystemQuestionDescriptor>();
  const questions = questionnaireSchema?.questions;
  if (!Array.isArray(questions)) return descriptors;

  for (const candidate of questions) {
    if (!isRecord(candidate)) continue;
    const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
    const captureGoal = typeof candidate.capture_goal === "string"
      ? candidate.capture_goal.trim()
      : "";
    if (!id || !captureGoal.startsWith("_system_")) continue;

    const rawOptions = Array.isArray(candidate.options) ? candidate.options : [];
    const options = rawOptions.flatMap((option): QuestionnaireOptionDescriptor[] => {
      if (!isRecord(option)) return [];
      const optionId = typeof option.id === "string" ? option.id.trim() : "";
      const label = typeof option.label === "string" ? option.label.trim() : "";
      return optionId && label ? [{ id: optionId, label }] : [];
    });

    descriptors.set(captureGoal, {
      id,
      capture_goal: captureGoal,
      options,
    });
  }

  return descriptors;
}

function getSystemAnswerValue(
  questionnaireAnswers: Record<string, unknown>,
  descriptor: QuestionnaireSystemQuestionDescriptor | null,
  captureGoal: string,
): unknown {
  if (captureGoal in questionnaireAnswers) {
    return questionnaireAnswers[captureGoal];
  }
  if (descriptor && descriptor.id in questionnaireAnswers) {
    return questionnaireAnswers[descriptor.id];
  }
  return null;
}

function normalizeSingleValueToLabel(
  rawValue: unknown,
  descriptor: QuestionnaireSystemQuestionDescriptor | null,
): string | null {
  const scalarValue = Array.isArray(rawValue) ? rawValue[0] : rawValue;
  if (typeof scalarValue !== "string") return null;

  const trimmed = scalarValue.trim();
  if (!trimmed) return null;

  const matchedOption = descriptor?.options.find((option) => option.id === trimmed);
  return matchedOption?.label ?? trimmed;
}

function extractSystemSingleChoiceLabel(
  questionnaireAnswers: Record<string, unknown>,
  systemQuestions: Map<string, QuestionnaireSystemQuestionDescriptor>,
  captureGoal:
    | "_system_struggle_duration"
    | "_system_main_blocker"
    | "_system_priority_goal"
    | "_system_priority_goal_subjective"
    | "_system_perceived_difficulty"
    | "_system_probable_drivers"
    | "_system_prior_attempts",
): string | null {
  const descriptor = systemQuestions.get(captureGoal) ?? null;
  const rawValue = getSystemAnswerValue(
    questionnaireAnswers,
    descriptor,
    captureGoal,
  );
  return normalizeSingleValueToLabel(rawValue, descriptor);
}

function extractSystemMultiChoiceLabel(
  questionnaireAnswers: Record<string, unknown>,
  systemQuestions: Map<string, QuestionnaireSystemQuestionDescriptor>,
  captureGoal:
    | "_system_probable_drivers"
    | "_system_main_blocker"
    | "_system_priority_goal_subjective",
): string | null {
  const descriptor = systemQuestions.get(captureGoal) ?? null;
  const rawValue = getSystemAnswerValue(questionnaireAnswers, descriptor, captureGoal);

  if (Array.isArray(rawValue)) {
    const labels = rawValue
      .flatMap((item) => normalizeSingleValueToLabel(item, descriptor) ? [normalizeSingleValueToLabel(item, descriptor)!] : [])
      .filter((value, index, array) => array.indexOf(value) === index);
    return labels.length > 0 ? labels.join(" | ") : null;
  }

  return normalizeSingleValueToLabel(rawValue, descriptor);
}

function extractSystemNumericValue(
  questionnaireAnswers: Record<string, unknown>,
  systemQuestions: Map<string, QuestionnaireSystemQuestionDescriptor>,
  captureGoal: "_system_metric_baseline" | "_system_metric_target",
): number | null {
  const descriptor = systemQuestions.get(captureGoal) ?? null;
  const rawValue = getSystemAnswerValue(questionnaireAnswers, descriptor, captureGoal);
  const scalarValue = Array.isArray(rawValue) ? rawValue[0] : rawValue;
  if (typeof scalarValue === "number" && Number.isFinite(scalarValue)) return scalarValue;
  if (typeof scalarValue !== "string") return null;
  const normalized = scalarValue.replace(",", ".").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractSystemConfidenceValue(
  questionnaireAnswers: Record<string, unknown>,
  systemQuestions: Map<string, QuestionnaireSystemQuestionDescriptor>,
): number | null {
  const captureGoal = "_system_self_confidence";
  const descriptor = systemQuestions.get(captureGoal) ?? null;
  const rawValue = getSystemAnswerValue(
    questionnaireAnswers,
    descriptor,
    captureGoal,
  );
  const normalized = normalizeSingleValueToLabel(rawValue, descriptor);
  if (!normalized) return null;

  const directNumeric = Number(normalized);
  if (Number.isInteger(directNumeric) && directNumeric >= 1 && directNumeric <= 5) {
    return directNumeric;
  }

  const match = normalized.match(/\b([1-5])\b/);
  return match ? Number(match[1]) : null;
}

function inferConfidenceFromDifficulty(
  perceivedDifficulty: string | null,
): number | null {
  const normalized = String(perceivedDifficulty ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("très facile") || normalized.includes("tres facile")) return 5;
  if (normalized.includes("facile")) return 4;
  if (
    normalized.includes("moyen") || normalized.includes("mitig") ||
    normalized.includes("partag") || normalized.includes("ça dépend") ||
    normalized.includes("ca depend")
  ) return 3;
  if (normalized.includes("très difficile") || normalized.includes("tres difficile")) return 1;
  if (normalized.includes("difficile")) return 2;
  return null;
}

function extractSystemFreeTextValue(
  questionnaireAnswers: Record<string, unknown>,
  systemQuestions: Map<string, QuestionnaireSystemQuestionDescriptor>,
  captureGoal: "_system_success_indicator",
): string | null {
  const descriptor = systemQuestions.get(captureGoal) ?? null;
  const rawValue = getSystemAnswerValue(
    questionnaireAnswers,
    descriptor,
    captureGoal,
  );
  if (typeof rawValue === "string") {
    const trimmed = rawValue.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (Array.isArray(rawValue)) {
    const firstString = rawValue.find((item): item is string =>
      typeof item === "string" && item.trim().length > 0
    );
    return firstString?.trim() ?? null;
  }
  return null;
}

function extractMeasurementHints(
  questionnaireSchema: Record<string, unknown> | null,
): QuestionnaireMeasurementHintsDescriptor {
  const metadata = questionnaireSchema?.metadata;
  if (!isRecord(metadata) || !isRecord(metadata.measurement_hints)) {
    return {
      metric_label: null,
      unit: null,
      direction: null,
      measurement_mode: null,
    };
  }

  const hints = metadata.measurement_hints;
  return {
    metric_label: typeof hints.metric_label === "string" ? hints.metric_label.trim() || null : null,
    unit: typeof hints.unit === "string" ? hints.unit.trim() || null : null,
    direction: typeof hints.direction === "string" ? hints.direction.trim() || null : null,
    measurement_mode: typeof hints.measurement_mode === "string"
      ? hints.measurement_mode.trim() || null
      : null,
  };
}

function formatMetricValue(
  value: number | null,
  unit: string | null,
): string | null {
  if (value == null) return null;
  return unit ? `${value} ${unit}` : String(value);
}

export function extractStructuredCalibrationFields(
  questionnaireAnswers: Record<string, unknown>,
  questionnaireSchema: Record<string, unknown> | null,
): StructuredCalibrationFields {
  const systemQuestions = extractSystemQuestionDescriptors(questionnaireSchema);
  const measurementHints = extractMeasurementHints(questionnaireSchema);

  const struggleDuration = extractSystemSingleChoiceLabel(
    questionnaireAnswers,
    systemQuestions,
    "_system_struggle_duration",
  );
  const mainBlocker = extractSystemMultiChoiceLabel(
    questionnaireAnswers,
    systemQuestions,
    "_system_main_blocker",
  );
  const priorityGoal = extractSystemMultiChoiceLabel(
    questionnaireAnswers,
    systemQuestions,
    "_system_priority_goal_subjective",
  );
  const perceivedDifficulty = extractSystemSingleChoiceLabel(
    questionnaireAnswers,
    systemQuestions,
    "_system_perceived_difficulty",
  );
  const probableDrivers = extractSystemMultiChoiceLabel(
    questionnaireAnswers,
    systemQuestions,
    "_system_probable_drivers",
  );
  const metricBaselineValue = extractSystemNumericValue(
    questionnaireAnswers,
    systemQuestions,
    "_system_metric_baseline",
  );
  const metricTargetValue = extractSystemNumericValue(
    questionnaireAnswers,
    systemQuestions,
    "_system_metric_target",
  );

  const priorAttempts = extractSystemSingleChoiceLabel(
    questionnaireAnswers,
    systemQuestions,
    "_system_prior_attempts",
  );
  const successIndicator = extractSystemFreeTextValue(
    questionnaireAnswers,
    systemQuestions,
    "_system_success_indicator",
  );
  const extractedSelfConfidence = extractSystemConfidenceValue(
    questionnaireAnswers,
    systemQuestions,
  );

  return {
    struggle_duration: struggleDuration,
    starting_point: formatMetricValue(metricBaselineValue, measurementHints.unit),
    main_blocker: mainBlocker,
    priority_goal: priorityGoal,
    perceived_difficulty: perceivedDifficulty,
    probable_drivers: probableDrivers,
    prior_attempts: priorAttempts,
    self_confidence:
      extractedSelfConfidence ?? inferConfidenceFromDifficulty(perceivedDifficulty),
    success_indicator: successIndicator ?? formatMetricValue(metricTargetValue, measurementHints.unit) ?? priorityGoal,
    metric_label: measurementHints.metric_label,
    metric_unit: measurementHints.unit,
    metric_direction: measurementHints.direction,
    metric_measurement_mode: measurementHints.measurement_mode,
    metric_baseline_value: metricBaselineValue,
    metric_target_value: metricTargetValue,
    metric_baseline_text: formatMetricValue(metricBaselineValue, measurementHints.unit),
    metric_target_text: formatMetricValue(metricTargetValue, measurementHints.unit),
  };
}
