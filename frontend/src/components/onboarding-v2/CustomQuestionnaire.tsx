import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";

import type { QuestionnaireSchemaV2 } from "../../lib/onboardingV2";

type QuestionnaireAnswerValue = string | string[];
const OTHER_PREFIX = "__other__:";
const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):(00|30)$/;
const TIME_HOUR_OPTIONS = Array.from({ length: 24 }, (_, index) =>
  String(index).padStart(2, "0")
);
const TIME_MINUTE_OPTIONS = ["00", "30"] as const;

function extractOtherText(value: QuestionnaireAnswerValue | undefined): string {
  if (typeof value === "string") {
    return value.startsWith(OTHER_PREFIX) ? value.slice(OTHER_PREFIX.length) : "";
  }
  if (Array.isArray(value)) {
    const match = value.find((item) => item.startsWith(OTHER_PREFIX));
    return match ? match.slice(OTHER_PREFIX.length) : "";
  }
  return "";
}

function hasOtherSelected(value: QuestionnaireAnswerValue | undefined): boolean {
  if (typeof value === "string") {
    return value.startsWith(OTHER_PREFIX);
  }
  if (Array.isArray(value)) {
    return value.some((item) => item.startsWith(OTHER_PREFIX));
  }
  return false;
}

type CustomQuestionnaireProps = {
  schema: QuestionnaireSchemaV2;
  initialAnswers?: Record<string, unknown>;
  onSubmit: (answers: Record<string, QuestionnaireAnswerValue>) => void;
  onChange?: (answers: Record<string, QuestionnaireAnswerValue>) => void;
  onBack?: () => void;
  isSubmitting: boolean;
  allowBackwardNavigation?: boolean;
};

function answersEqual(
  left: Record<string, QuestionnaireAnswerValue>,
  right: Record<string, QuestionnaireAnswerValue>,
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;

  for (const key of leftKeys) {
    const leftValue = left[key];
    const rightValue = right[key];

    if (typeof leftValue === "string" || typeof rightValue === "string") {
      if (leftValue !== rightValue) return false;
      continue;
    }

    const normalizedLeft = Array.isArray(leftValue) ? leftValue : [];
    const normalizedRight = Array.isArray(rightValue) ? rightValue : [];
    if (normalizedLeft.length !== normalizedRight.length) return false;
    if (normalizedLeft.some((value, index) => value !== normalizedRight[index])) {
      return false;
    }
  }

  return true;
}

function normalizeAnswers(
  initialAnswers: Record<string, unknown> | undefined,
  schema?: QuestionnaireSchemaV2,
): Record<string, QuestionnaireAnswerValue> {
  const normalized: Record<string, QuestionnaireAnswerValue> = {};
  if (initialAnswers) {
    for (const [key, value] of Object.entries(initialAnswers)) {
      if (typeof value === "string") normalized[key] = value;
      if (typeof value === "number" && Number.isFinite(value)) {
        normalized[key] = String(value);
      }
      if (Array.isArray(value)) {
        normalized[key] = value.filter((item): item is string =>
          typeof item === "string"
        );
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

  const compareAsNumber = typeof rule.value === "number";
  const comparableValue = typeof rawAnswer === "string"
    ? rawAnswer.trim()
    : Array.isArray(rawAnswer)
    ? rawAnswer[0]?.trim() ?? ""
    : "";

  if (compareAsNumber) {
    const answerNumber = Number(comparableValue);
    if (!Number.isFinite(answerNumber)) return false;

    switch (rule.operator) {
      case "lt":
        return answerNumber < (rule.value as number);
      case "lte":
        return answerNumber <= (rule.value as number);
      case "gt":
        return answerNumber > (rule.value as number);
      case "gte":
        return answerNumber >= (rule.value as number);
      case "eq":
        return answerNumber === (rule.value as number);
      case "neq":
        return answerNumber !== (rule.value as number);
      default:
        return true;
    }
  }

  switch (rule.operator) {
    case "eq":
      return comparableValue === String(rule.value);
    case "neq":
      return comparableValue !== String(rule.value);
    default:
      return false;
  }
}

function getVisibleQuestions(
  questions: QuestionnaireSchemaV2["questions"],
  answers: Record<string, QuestionnaireAnswerValue>,
) {
  return questions.filter((question) =>
    evaluateVisibilityRule(question.visible_if ?? null, answers)
  );
}

function pruneHiddenAnswers(
  questions: QuestionnaireSchemaV2["questions"],
  answers: Record<string, QuestionnaireAnswerValue>,
): Record<string, QuestionnaireAnswerValue> {
  const visibleQuestionIds = new Set(
    getVisibleQuestions(questions, answers).map((question) => question.id),
  );
  let changed = false;
  const next: Record<string, QuestionnaireAnswerValue> = {};

  for (const [key, value] of Object.entries(answers)) {
    const question = questions.find((candidate) => candidate.id === key);
    if (question && !visibleQuestionIds.has(key)) {
      changed = true;
      continue;
    }
    next[key] = value;
  }

  return changed ? next : answers;
}

function isClockTimeQuestion(question: QuestionnaireSchemaV2["questions"][number]): boolean {
  if (question.kind === "time") return true;
  if (question.kind !== "number") return false;

  const haystack = [
    question.question,
    question.helper_text,
    question.placeholder,
    question.unit,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .join(" ")
    .toLowerCase();

  if (!haystack) return false;

  const mentionsDuration =
    haystack.includes("minute") ||
    haystack.includes("minutes") ||
    haystack.includes("min avant") ||
    haystack.includes("heure avant") ||
    haystack.includes("heures avant") ||
    haystack.includes("dur") ||
    haystack.includes("combien de temps");

  if (mentionsDuration) return false;

  return (
    haystack.includes("quelle heure") ||
    haystack.includes("à quelle heure") ||
    haystack.includes("a quelle heure") ||
    haystack.includes("heure precise") ||
    haystack.includes("heure précise") ||
    haystack.includes("format hh:mm") ||
    haystack.includes("22:30")
  );
}

function isValidTimeValue(value: string): boolean {
  return TIME_OF_DAY_PATTERN.test(value.trim());
}

function getTimeParts(value: QuestionnaireAnswerValue | undefined): {
  hour: string;
  minute: string;
} {
  if (typeof value !== "string") {
    return { hour: "", minute: "" };
  }

  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{0,2})(?::(\d{0,2}))?$/);
  if (!match) {
    return { hour: "", minute: "" };
  }

  const hour = TIME_HOUR_OPTIONS.includes(match[1]) ? match[1] : "";
  const minute = TIME_MINUTE_OPTIONS.includes(match[2] as typeof TIME_MINUTE_OPTIONS[number])
    ? match[2] ?? ""
    : "";

  return { hour, minute };
}

function getSelectionHint(question: QuestionnaireSchemaV2["questions"][number]): string {
  if (question.kind === "time" || isClockTimeQuestion(question)) {
    return "Heure precise attendue";
  }

  if (question.kind === "number") {
    return question.unit
      ? `Valeur numerique attendue (${question.unit})`
      : "Valeur numerique attendue";
  }

  if (question.kind === "text") {
    return question.required ? "Reponse libre attendue" : "Reponse libre optionnelle";
  }

  if (question.kind === "single_choice") {
    return "1 reponse attendue";
  }

  if (
    typeof question.max_selections === "number" &&
    Number.isFinite(question.max_selections) &&
    question.max_selections > 1
  ) {
    return "Plusieurs reponses possibles";
  }

  return "Plusieurs reponses possibles";
}

export function CustomQuestionnaire({
  schema,
  initialAnswers,
  onSubmit,
  onChange,
  onBack,
  isSubmitting,
  allowBackwardNavigation = true,
}: CustomQuestionnaireProps) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<
    Record<string, QuestionnaireAnswerValue>
  >(
    () => normalizeAnswers(initialAnswers, schema),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const normalized = normalizeAnswers(initialAnswers, schema);
    setAnswers((current) => answersEqual(current, normalized) ? current : normalized);
  }, [initialAnswers, schema]);

  useEffect(() => {
    onChange?.(answers);
  }, [answers, onChange]);

  const questions = useMemo(
    () => getVisibleQuestions(schema.questions, answers),
    [schema.questions, answers],
  );
  useEffect(() => {
    setIndex((current) => Math.min(current, Math.max(questions.length - 1, 0)));
  }, [questions.length]);

  const currentQuestion = questions[index];
  useEffect(() => {
    setAnswers((current) => {
      const pruned = pruneHiddenAnswers(schema.questions, current);
      return answersEqual(current, pruned) ? current : pruned;
    });
  }, [schema.questions, answers]);

  if (!currentQuestion) return null;
  const currentAnswer = answers[currentQuestion.id];
  const currentQuestionUsesTimeInput = isClockTimeQuestion(currentQuestion);

  const progress = useMemo(
    () => ((index + 1) / Math.max(questions.length, 1)) * 100,
    [index, questions.length],
  );
  const currentOtherText = extractOtherText(currentAnswer);
  const otherSelected = hasOtherSelected(currentAnswer);
  const currentTimeParts = currentQuestionUsesTimeInput
    ? getTimeParts(currentAnswer)
    : { hour: "", minute: "" };

  function updateSingleValue(value: string) {
    setAnswers((current) => ({ ...current, [currentQuestion.id]: value }));
    setError(null);
    if (
      currentQuestion.kind === "single_choice" && index < questions.length - 1
      && value !== `${OTHER_PREFIX}`
    ) {
      window.setTimeout(
        () => setIndex((currentIndex) => currentIndex + 1),
        150,
      );
    }
  }

  function toggleMultiValue(value: string) {
    const current = Array.isArray(currentAnswer) ? currentAnswer : [];
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];
    setAnswers((all) => ({ ...all, [currentQuestion.id]: next }));
    setError(null);
  }

  function toggleOtherValue() {
    if (currentQuestion.kind === "single_choice") {
      if (otherSelected) {
        setAnswers((current) => {
          const next = { ...current };
          delete next[currentQuestion.id];
          return next;
        });
      } else {
        setAnswers((current) => ({
          ...current,
          [currentQuestion.id]: `${OTHER_PREFIX}`,
        }));
      }
      setError(null);
      return;
    }

    const current = Array.isArray(currentAnswer) ? currentAnswer : [];
    const next = otherSelected
      ? current.filter((item) => !item.startsWith(OTHER_PREFIX))
      : [...current, `${OTHER_PREFIX}`];
    setAnswers((all) => ({ ...all, [currentQuestion.id]: next }));
    setError(null);
  }

  function updateOtherText(value: string) {
    const encoded = `${OTHER_PREFIX}${value}`;
    if (currentQuestion.kind === "single_choice") {
      setAnswers((current) => ({
        ...current,
        [currentQuestion.id]: encoded,
      }));
      setError(null);
      return;
    }

    const current = Array.isArray(currentAnswer) ? currentAnswer : [];
    const withoutOther = current.filter((item) => !item.startsWith(OTHER_PREFIX));
    setAnswers((all) => ({
      ...all,
      [currentQuestion.id]: [...withoutOther, encoded],
    }));
    setError(null);
  }

  function validateQuestion(): boolean {
    if (!currentQuestion.required) return true;
    if (currentQuestionUsesTimeInput) {
      return typeof currentAnswer === "string" && isValidTimeValue(currentAnswer);
    }
    if (currentQuestion.kind === "number") {
      if (typeof currentAnswer !== "string" || currentAnswer.trim().length === 0) {
        return false;
      }
      const numericValue = Number(currentAnswer);
      if (!Number.isFinite(numericValue)) return false;
      if (
        typeof currentQuestion.min_value === "number" &&
        numericValue < currentQuestion.min_value
      ) {
        return false;
      }
      if (
        typeof currentQuestion.max_value === "number" &&
        numericValue > currentQuestion.max_value
      ) {
        return false;
      }
      return true;
    }
    if (currentQuestion.kind === "text") {
      return typeof currentAnswer === "string" && currentAnswer.trim().length > 0;
    }
    if (currentQuestion.kind === "single_choice") {
      return typeof currentAnswer === "string" &&
        currentAnswer.trim().length > 0 &&
        (!otherSelected || currentOtherText.trim().length > 0);
    }
    return Array.isArray(currentAnswer) &&
      currentAnswer.length > 0 &&
      (!otherSelected || currentOtherText.trim().length > 0);
  }

  function handleNext() {
    if (!validateQuestion()) {
      setError("Réponds à cette question pour continuer.");
      return;
    }
    setError(null);
    if (index === questions.length - 1) {
      onSubmit(answers);
      return;
    }
    setIndex((current) => current + 1);
  }

  function handlePrevious() {
    if (!allowBackwardNavigation) {
      return;
    }
    if (index === 0) {
      onBack?.();
      return;
    }
    setIndex((current) => Math.max(0, current - 1));
  }

  return (
    <section className="mx-auto w-full max-w-3xl">
      <div className="mb-6 h-2 overflow-hidden rounded-full bg-gray-200">
        <div
          className="h-full rounded-full bg-blue-600 transition-all"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="rounded-2xl border border-blue-100 bg-white p-6 pb-24 shadow-sm md:p-8 md:pb-8">
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-blue-600">
          Question {index + 1} / {questions.length}
        </p>
        <h1 className="mb-3 font-serif text-2xl font-bold tracking-tight text-gray-900 md:text-4xl">
          {currentQuestion.question}
        </h1>
        <p className="mb-4 text-xs font-medium uppercase tracking-[0.18em] text-gray-400">
          {getSelectionHint(currentQuestion)}
        </p>
        {currentQuestion.helper_text && (
          <p className="mb-5 text-base leading-relaxed text-gray-600">
            {currentQuestion.helper_text}
          </p>
        )}

        <div className="space-y-3">
          {currentQuestionUsesTimeInput ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-[11px] font-medium tracking-[0.08em] text-gray-500">
                  Heure
                  <select
                    value={currentTimeParts.hour}
                    onChange={(event) => {
                      const nextHour = event.target.value;
                      const nextMinute = currentTimeParts.minute;
                      const nextValue = nextHour && nextMinute
                        ? `${nextHour}:${nextMinute}`
                        : nextHour
                        ? `${nextHour}:`
                        : "";
                      setAnswers((current) => ({
                        ...current,
                        [currentQuestion.id]: nextValue,
                      }));
                      setError(null);
                    }}
                    className="mt-3 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">Choisis l'heure</option>
                    {TIME_HOUR_OPTIONS.map((hour) => (
                      <option key={hour} value={hour}>
                        {hour}h
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-[11px] font-medium tracking-[0.08em] text-gray-500">
                  Minutes
                  <select
                    value={currentTimeParts.minute}
                    onChange={(event) => {
                      const nextMinute = event.target.value;
                      const nextHour = currentTimeParts.hour;
                      const nextValue = nextHour && nextMinute
                        ? `${nextHour}:${nextMinute}`
                        : nextMinute
                        ? `:${nextMinute}`
                        : "";
                      setAnswers((current) => ({
                        ...current,
                        [currentQuestion.id]: nextValue,
                      }));
                      setError(null);
                    }}
                    className="mt-3 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">Choisis les minutes</option>
                    {TIME_MINUTE_OPTIONS.map((minute) => (
                      <option key={minute} value={minute}>
                        {minute}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button
                type="button"
                onClick={() => {
                  setAnswers((current) => ({
                    ...current,
                    [currentQuestion.id]: "",
                  }));
                  setError(null);
                }}
                className="mt-3 inline-flex items-center rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700"
              >
                Effacer
              </button>
              <p className="mt-3 text-xs text-gray-500">
                Choisis uniquement une heure pile ou une demi-heure, par exemple 22:00 ou 22:30.
              </p>
            </div>
          ) : currentQuestion.kind === "number" ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                {currentQuestion.unit ? `Valeur (${currentQuestion.unit})` : "Valeur"}
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={typeof currentAnswer === "string" ? currentAnswer : ""}
                min={typeof currentQuestion.min_value === "number" ? currentQuestion.min_value : undefined}
                max={typeof currentQuestion.max_value === "number" ? currentQuestion.max_value : undefined}
                onChange={(event) => {
                  setAnswers((current) => ({
                    ...current,
                    [currentQuestion.id]: event.target.value,
                  }));
                  setError(null);
                }}
                placeholder={currentQuestion.placeholder ?? "Entre une valeur numerique"}
                className="mt-3 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              />
              {typeof currentQuestion.suggested_value === "number" ? (
                <button
                  type="button"
                  onClick={() => {
                    setAnswers((current) => ({
                      ...current,
                      [currentQuestion.id]: String(currentQuestion.suggested_value),
                    }));
                    setError(null);
                  }}
                  className="mt-3 inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-800"
                >
                  Utiliser la suggestion : {currentQuestion.suggested_value}
                  {currentQuestion.unit ? ` ${currentQuestion.unit}` : ""}
                </button>
              ) : null}
            </div>
          ) : currentQuestion.kind === "text" ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <textarea
                value={typeof currentAnswer === "string" ? currentAnswer : ""}
                onChange={(event) => {
                  setAnswers((current) => ({
                    ...current,
                    [currentQuestion.id]: event.target.value,
                  }));
                  setError(null);
                }}
                placeholder={currentQuestion.placeholder ?? "Ecris ici ta reponse"}
                className="min-h-[160px] w-full rounded-xl border border-gray-200 bg-white p-4 text-base text-gray-900 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          ) : (
            currentQuestion.options.map((option) => {
              const selected = currentQuestion.kind === "multiple_choice"
                ? Array.isArray(currentAnswer) &&
                  currentAnswer.includes(option.id)
                : currentAnswer === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() =>
                    currentQuestion.kind === "multiple_choice"
                      ? toggleMultiValue(option.id)
                      : updateSingleValue(option.id)}
                  className={`w-full rounded-xl border px-4 py-4 text-left transition ${
                    selected
                      ? "border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-200"
                      : "border-gray-200 bg-gray-50 text-gray-900 hover:border-blue-200"
                  }`}
                >
                  {option.label}
                </button>
              );
            })
          )}

          {currentQuestion.kind !== "number" && currentQuestion.kind !== "time" && currentQuestion.allow_other && (
            <>
              <button
                type="button"
                onClick={toggleOtherValue}
                className={`w-full rounded-xl border px-4 py-4 text-left transition ${
                  otherSelected
                    ? "border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-200"
                    : "border-gray-200 bg-gray-50 text-gray-900 hover:border-blue-200"
                }`}
              >
                Autre
              </button>
              {otherSelected && (
                <textarea
                  value={currentOtherText}
                  onChange={(event) => updateOtherText(event.target.value)}
                  placeholder={currentQuestion.placeholder ?? "Précise ici ta réponse"}
                  className="min-h-[140px] w-full rounded-xl border border-gray-200 bg-white p-4 text-base text-gray-900 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                />
              )}
            </>
          )}
        </div>

        {error && (
          <p className="mt-4 text-sm font-medium text-rose-700">{error}</p>
        )}

        <div className="fixed bottom-0 left-0 right-0 z-10 flex items-center justify-between gap-3 border-t border-gray-200 bg-white/95 p-4 backdrop-blur md:static md:mt-8 md:border-none md:bg-transparent md:p-0">
          <div>
            {allowBackwardNavigation && index > 0 && (
              <button
                type="button"
                onClick={handlePrevious}
                className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-600 shadow-sm transition hover:border-blue-200 hover:text-gray-900"
              >
                <ArrowLeft className="h-4 w-4" />
                Précédent
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={handleNext}
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-md shadow-blue-200 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Chargement…
              </>
            ) : (
              <>
                {index === questions.length - 1 ? "Continuer" : "Suivant"}
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
