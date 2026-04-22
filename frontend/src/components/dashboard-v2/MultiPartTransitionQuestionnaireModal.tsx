import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, Loader2, X } from "lucide-react";

import type { QuestionnaireSchemaV2 } from "../../lib/onboardingV2";

type QuestionnaireAnswerValue = string | string[];

type MultiPartTransitionQuestionnaireModalProps = {
  isOpen: boolean;
  currentTransformationTitle: string;
  nextTransformationTitle: string | null;
  schema: QuestionnaireSchemaV2 | null;
  initialAnswers?: Record<string, unknown> | null;
  busy: boolean;
  error: string | null;
  onBackToPlan: () => void;
  onClose: () => void;
  onSubmit: (answers: Record<string, QuestionnaireAnswerValue>) => Promise<void> | void;
};

function normalizeAnswers(
  initialAnswers: Record<string, unknown> | null | undefined,
  schema: QuestionnaireSchemaV2 | null,
): Record<string, QuestionnaireAnswerValue> {
  const normalized: Record<string, QuestionnaireAnswerValue> = {};

  if (initialAnswers) {
    for (const [key, value] of Object.entries(initialAnswers)) {
      if (typeof value === "string") normalized[key] = value;
      if (typeof value === "number" && Number.isFinite(value)) normalized[key] = String(value);
      if (Array.isArray(value)) {
        normalized[key] = value.filter((item): item is string => typeof item === "string");
      }
    }
  }

  if (schema) {
    for (const question of schema.questions) {
      if (
        question.kind === "number" &&
        normalized[question.id] == null &&
        typeof question.suggested_value === "number" &&
        Number.isFinite(question.suggested_value)
      ) {
        normalized[question.id] = String(question.suggested_value);
      }
    }
  }

  return normalized;
}

function evaluateVisibilityRule(
  rule: QuestionnaireSchemaV2["questions"][number]["visible_if"],
  answers: Record<string, QuestionnaireAnswerValue>,
): boolean {
  if (!rule) return true;

  const rawAnswer = answers[rule.question_id];
  if (rawAnswer == null) return false;
  const comparableValues = typeof rawAnswer === "string"
    ? [rawAnswer.trim()]
    : Array.isArray(rawAnswer)
    ? rawAnswer.map((value) => value.trim()).filter(Boolean)
    : [];
  const comparableValue = comparableValues[0] ?? "";

  if (typeof rule.value === "number") {
    const answerNumber = Number(comparableValue);
    if (!Number.isFinite(answerNumber)) return false;

    switch (rule.operator) {
      case "lt":
        return answerNumber < rule.value;
      case "lte":
        return answerNumber <= rule.value;
      case "gt":
        return answerNumber > rule.value;
      case "gte":
        return answerNumber >= rule.value;
      case "eq":
        return answerNumber === rule.value;
      case "neq":
        return answerNumber !== rule.value;
      default:
        return true;
    }
  }

  switch (rule.operator) {
    case "eq":
      return comparableValues.includes(String(rule.value));
    case "neq":
      return !comparableValues.includes(String(rule.value));
    default:
      return false;
  }
}

function getVisibleQuestions(
  schema: QuestionnaireSchemaV2 | null,
  answers: Record<string, QuestionnaireAnswerValue>,
) {
  if (!schema) return [];
  return schema.questions.filter((question) =>
    evaluateVisibilityRule(question.visible_if ?? null, answers) &&
    !question.id.includes("improvement_reasons")
  );
}

function pruneHiddenAnswers(
  schema: QuestionnaireSchemaV2 | null,
  answers: Record<string, QuestionnaireAnswerValue>,
): Record<string, QuestionnaireAnswerValue> {
  if (!schema) return answers;

  const visibleQuestionIds = new Set(
    schema.questions
      .filter((question) => evaluateVisibilityRule(question.visible_if ?? null, answers))
      .map((question) => question.id),
  );
  const next: Record<string, QuestionnaireAnswerValue> = {};

  for (const [key, value] of Object.entries(answers)) {
    if (
      visibleQuestionIds.has(key) ||
      key.endsWith("_other_text") ||
      key.includes("improvement_detail")
    ) {
      next[key] = value;
    }
  }

  return next;
}

export function MultiPartTransitionQuestionnaireModal({
  isOpen,
  currentTransformationTitle,
  nextTransformationTitle,
  schema,
  initialAnswers,
  busy,
  error,
  onBackToPlan,
  onClose,
  onSubmit,
}: MultiPartTransitionQuestionnaireModalProps) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, QuestionnaireAnswerValue>>({});
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setIndex(0);
    setLocalError(null);
    setAnswers(normalizeAnswers(initialAnswers, schema));
  }, [initialAnswers, isOpen, schema]);

  const prunedAnswers = useMemo(
    () => pruneHiddenAnswers(schema, answers),
    [answers, schema],
  );
  const questions = useMemo(
    () => getVisibleQuestions(schema, prunedAnswers),
    [prunedAnswers, schema],
  );
  const currentQuestion = questions[index] ?? null;
  const progress = questions.length > 0 ? ((index + 1) / questions.length) * 100 : 0;

  useEffect(() => {
    if (index < questions.length) return;
    setIndex(Math.max(questions.length - 1, 0));
  }, [index, questions.length]);

  if (!isOpen || !schema || !currentQuestion) return null;

  const currentAnswer = prunedAnswers[currentQuestion.id];
  const inlineImprovementQuestion = currentQuestion.kind === "number" &&
      currentQuestion.id.includes("helpfulness_rating")
    ? schema.questions.find((question) =>
      question.id === currentQuestion.id.replace("helpfulness_rating", "improvement_reasons") &&
      evaluateVisibilityRule(question.visible_if ?? null, answers)
    ) ?? null
    : null;
  const inlineImprovementAnswer = inlineImprovementQuestion
    ? answers[inlineImprovementQuestion.id]
    : undefined;
  const inlineDetailQuestionId = currentQuestion.id.includes("improvement_reasons")
    ? currentQuestion.id.replace("improvement_reasons", "improvement_detail")
    : inlineImprovementQuestion
    ? inlineImprovementQuestion.id.replace("improvement_reasons", "improvement_detail")
    : currentQuestion.id.includes("most_helpful_area")
    ? `${currentQuestion.id}_other_text`
    : null;
  const inlineDetailValue = inlineDetailQuestionId != null && typeof answers[inlineDetailQuestionId] === "string"
    ? answers[inlineDetailQuestionId] as string
    : "";
  const isOtherSelected = inlineImprovementQuestion
    ? Array.isArray(inlineImprovementAnswer) && inlineImprovementAnswer.includes("other")
    : currentQuestion.kind === "multiple_choice"
    ? Array.isArray(currentAnswer) && currentAnswer.includes("other")
    : currentQuestion.kind === "single_choice"
    ? currentAnswer === "other"
    : false;
  const numericCurrentAnswer = typeof currentAnswer === "string" ? Number(currentAnswer) : NaN;
  const sliderMin = typeof currentQuestion.min_value === "number" ? currentQuestion.min_value : 0;
  const sliderMax = typeof currentQuestion.max_value === "number" ? currentQuestion.max_value : 10;
  const sliderValue = Number.isFinite(numericCurrentAnswer)
    ? numericCurrentAnswer
    : typeof currentQuestion.suggested_value === "number"
    ? currentQuestion.suggested_value
    : sliderMin;

  function updateAnswer(value: string | string[]) {
    setAnswers((current) => ({
      ...current,
      [currentQuestion.id]: value,
    }));
    setLocalError(null);
  }

  function validateCurrentQuestion() {
    if (!currentQuestion.required) return true;
    if (currentQuestion.kind === "number") {
      if (typeof currentAnswer !== "string" || !currentAnswer.trim()) return false;
      const numericValue = Number(currentAnswer);
      if (!Number.isFinite(numericValue)) return false;
      if (typeof currentQuestion.min_value === "number" && numericValue < currentQuestion.min_value) {
        return false;
      }
      if (typeof currentQuestion.max_value === "number" && numericValue > currentQuestion.max_value) {
        return false;
      }
      if (inlineImprovementQuestion) {
        if (!Array.isArray(inlineImprovementAnswer)) return false;
        const selectedCount = inlineImprovementAnswer.filter((value) => value.trim().length > 0).length;
        if (selectedCount === 0) return false;
        if (
          typeof inlineImprovementQuestion.max_selections === "number" &&
          selectedCount > inlineImprovementQuestion.max_selections
        ) {
          return false;
        }
        if (isOtherSelected && inlineDetailQuestionId != null && !inlineDetailValue.trim()) {
          return false;
        }
      }
      return true;
    }

    if (currentQuestion.kind === "single_choice") {
      if (!(typeof currentAnswer === "string" && currentAnswer.trim().length > 0)) return false;
      if (isOtherSelected && inlineDetailQuestionId != null && !inlineDetailValue.trim()) {
        return false;
      }
      return true;
    }

    if (currentQuestion.kind === "multiple_choice") {
      if (!Array.isArray(currentAnswer)) return false;
      const selectedCount = currentAnswer.filter((value) => value.trim().length > 0).length;
      if (selectedCount === 0) return false;
      if (
        typeof currentQuestion.max_selections === "number" &&
        selectedCount > currentQuestion.max_selections
      ) {
        return false;
      }
      if (isOtherSelected && inlineDetailQuestionId != null && !inlineDetailValue.trim()) {
        return false;
      }
      return true;
    }

    return typeof currentAnswer === "string" && currentAnswer.trim().length > 0;
  }

  function toggleChoice(
    optionId: string,
    question = currentQuestion,
    answer = currentAnswer,
  ) {
    if (question.kind === "single_choice") {
      setAnswers((current) => {
        const nextAnswers: Record<string, QuestionnaireAnswerValue> = {
          ...current,
          [question.id]: optionId,
        };
        if (optionId !== "other" && inlineDetailQuestionId != null) {
          delete nextAnswers[inlineDetailQuestionId];
        }
        return nextAnswers;
      });
      setLocalError(null);
      return;
    }

    if (question.kind !== "multiple_choice") return;

    const currentValues = Array.isArray(answer) ? answer : [];
    const exists = currentValues.includes(optionId);
    const nextValues = exists
      ? currentValues.filter((value) => value !== optionId)
      : [...currentValues, optionId];

    if (
      !exists &&
      typeof question.max_selections === "number" &&
      nextValues.length > question.max_selections
    ) {
      setLocalError(`Choisis jusqu'à ${question.max_selections} réponses.`);
      return;
    }

    setAnswers((current) => {
      const nextAnswers: Record<string, QuestionnaireAnswerValue> = {
        ...current,
        [question.id]: nextValues,
      };
      if (optionId === "other" && exists && inlineDetailQuestionId != null) {
        delete nextAnswers[inlineDetailQuestionId];
      }
      return nextAnswers;
    });
    setLocalError(null);
  }

  function handleNext() {
    if (!validateCurrentQuestion()) {
      setLocalError("Réponds à cette question pour continuer.");
      return;
    }
    setLocalError(null);
    if (index === questions.length - 1) {
      void onSubmit(prunedAnswers);
      return;
    }
    setIndex((current) => current + 1);
  }

  function handlePrevious() {
    if (index === 0) {
      onBackToPlan();
      return;
    }
    setLocalError(null);
    setIndex((current) => Math.max(0, current - 1));
  }

  return createPortal(
    <div className="fixed inset-0 z-[99] flex items-center justify-center bg-stone-950/55 p-4 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={busy ? undefined : onClose} />

      <div className="relative z-[1] flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-[32px] border border-blue-100 bg-white shadow-[0_36px_120px_-48px_rgba(17,24,39,0.55)]">
        <div className="border-b border-blue-100 bg-[linear-gradient(180deg,rgba(239,246,255,1),rgba(255,255,255,1))] px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-blue-700">
                Fin de transformation
              </p>
              <h3 className="mt-2 text-2xl font-semibold text-stone-950">
                Bilan avant d'ouvrir la suite
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-600">
                On prend 30 secondes pour comprendre ce qui t'a vraiment aidé dans{" "}
                "{currentTransformationTitle}" et mieux calibrer la façon de t'accompagner ensuite.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 text-stone-500 transition hover:text-stone-900 disabled:opacity-50"
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-blue-50">
            <div
              className="h-full rounded-full bg-blue-600 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          <div className="space-y-6">
          <div className="rounded-[24px] border border-stone-200 bg-stone-50 px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
              Question {index + 1} / {questions.length}
            </p>
            <h4 className="mt-2 text-xl font-semibold text-stone-950">
              {currentQuestion.question}
            </h4>
            {currentQuestion.helper_text ? (
              <p className="mt-2 text-sm leading-6 text-stone-600">
                {currentQuestion.helper_text}
              </p>
            ) : null}
          </div>

          {currentQuestion.kind === "number" ? (
            <div className="rounded-[24px] border border-stone-200 bg-white px-5 py-5">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                    {currentQuestion.unit ? `Valeur (${currentQuestion.unit})` : "Valeur"}
                  </p>
                  <p className="mt-2 text-4xl font-semibold text-stone-950">
                    {sliderValue}
                    {currentQuestion.unit ? (
                      <span className="ml-1 text-lg font-medium text-stone-500">{currentQuestion.unit}</span>
                    ) : null}
                  </p>
                </div>
                <div className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                  Fais glisser pour ajuster
                </div>
              </div>

              <div className="mt-6 px-1">
                <input
                  type="range"
                  value={sliderValue}
                  min={sliderMin}
                  max={sliderMax}
                  step={1}
                  onChange={(event) => updateAnswer(event.target.value)}
                  className="w-full accent-blue-600"
                />
                <div className="mt-3 flex items-center justify-between text-xs font-medium text-stone-500">
                  <span>{sliderMin}</span>
                  <span>{sliderMax}</span>
                </div>
                <div className="mt-4 grid grid-cols-11 gap-2">
                  {Array.from({ length: sliderMax - sliderMin + 1 }, (_, index) => sliderMin + index).map((value) => {
                    const selected = sliderValue === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => updateAnswer(String(value))}
                        className={`rounded-xl border px-0 py-2 text-sm font-semibold transition ${
                          selected
                            ? "border-blue-600 bg-blue-600 text-white"
                            : "border-stone-200 bg-stone-50 text-stone-700 hover:border-blue-200"
                        }`}
                      >
                        {value}
                      </button>
                    );
                  })}
                </div>
              </div>

              {inlineImprovementQuestion ? (
                <div className="mt-6 space-y-3 border-t border-blue-100 pt-6">
                  <div>
                    <p className="text-sm font-semibold text-stone-950">
                      {inlineImprovementQuestion.question}
                    </p>
                    {inlineImprovementQuestion.helper_text ? (
                      <p className="mt-2 text-sm leading-6 text-stone-600">
                        {inlineImprovementQuestion.helper_text}
                      </p>
                    ) : null}
                  </div>

                  {inlineImprovementQuestion.options.map((option) => {
                    const selected = Array.isArray(inlineImprovementAnswer) &&
                      inlineImprovementAnswer.includes(option.id);
                    const isOtherOption = option.id === "other";
                    const showInlineOtherField =
                      isOtherOption && isOtherSelected && inlineDetailQuestionId != null;

                    return (
                      <div
                        key={option.id}
                        className={`rounded-[24px] border px-5 py-4 text-left text-sm leading-6 transition ${
                          selected
                            ? "border-blue-600 bg-blue-50 text-stone-950"
                            : "border-stone-200 bg-white text-stone-700 hover:border-blue-200"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            toggleChoice(
                              option.id,
                              inlineImprovementQuestion,
                              inlineImprovementAnswer,
                            )}
                          className="block w-full text-left"
                        >
                          {option.label}
                        </button>

                        {showInlineOtherField ? (
                          <div className="mt-4 border-t border-blue-100 pt-4">
                            <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                              Précise ici
                            </label>
                            <textarea
                              rows={4}
                              value={inlineDetailValue}
                              onChange={(event) =>
                                setAnswers((current) => ({
                                  ...current,
                                  [inlineDetailQuestionId]: event.target.value,
                                }))}
                              placeholder="Exemple : ce qui a manqué, ce qui a freiné, ce qui aurait rendu le plan plus utile pour toi…"
                              className="mt-3 w-full rounded-[22px] border border-stone-200 bg-white px-4 py-3 text-sm leading-6 text-stone-900 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                            />
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : currentQuestion.kind === "single_choice" || currentQuestion.kind === "multiple_choice" ? (
            <div className="grid gap-3">
              {currentQuestion.options.map((option) => {
                const selected = currentQuestion.kind === "multiple_choice"
                  ? Array.isArray(currentAnswer) && currentAnswer.includes(option.id)
                  : currentAnswer === option.id;
                const isOtherOption = option.id === "other";
                const showInlineOtherField = isOtherOption && isOtherSelected && inlineDetailQuestionId != null;

                return (
                  <div
                    key={option.id}
                    className={`rounded-[24px] border px-5 py-4 text-left text-sm leading-6 transition ${
                      selected
                        ? "border-blue-600 bg-blue-50 text-stone-950"
                        : "border-stone-200 bg-white text-stone-700 hover:border-blue-200"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleChoice(option.id)}
                      className="block w-full text-left"
                    >
                      {option.label}
                    </button>

                    {showInlineOtherField ? (
                      <div className="mt-4 border-t border-blue-100 pt-4">
                        <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                          Précise ici
                        </label>
                        <textarea
                          rows={4}
                          value={inlineDetailValue}
                          onChange={(event) =>
                            setAnswers((current) => ({
                              ...current,
                              [inlineDetailQuestionId]: event.target.value,
                            }))}
                          placeholder={
                            currentQuestion.id.includes("most_helpful_area")
                              ? "Exemple : ce qui t'a le plus aidé si ce n'était dans aucune des catégories proposées."
                              : "Exemple : ce qui a manqué, ce qui a freiné, ce qui aurait rendu le plan plus utile pour toi…"
                          }
                          className="mt-3 w-full rounded-[22px] border border-stone-200 bg-white px-4 py-3 text-sm leading-6 text-stone-900 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-[24px] border border-stone-200 bg-white px-5 py-4">
              <textarea
                rows={6}
                value={typeof currentAnswer === "string" ? currentAnswer : ""}
                onChange={(event) => updateAnswer(event.target.value)}
                placeholder={currentQuestion.placeholder ?? "Écris ici ta réponse"}
                className="w-full rounded-[22px] border border-stone-200 bg-stone-50 px-4 py-3 text-sm leading-6 text-stone-900 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          )}

          {localError || error ? (
            <div className="rounded-[20px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {localError ?? error}
            </div>
          ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 bg-white px-6 py-4">
          <button
            type="button"
            onClick={handlePrevious}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-full border border-stone-200 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-300 disabled:opacity-50"
          >
            <ArrowLeft className="h-4 w-4" />
            {index === 0 ? "Retour au plan" : "Question précédente"}
          </button>

          <button
            type="button"
            onClick={handleNext}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Préparation...
              </>
            ) : (
              <>
                {index === questions.length - 1 ? "Continuer vers la suite" : "Continuer"}
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
