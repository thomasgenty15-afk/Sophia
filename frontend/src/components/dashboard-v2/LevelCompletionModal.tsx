import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Loader2, Sparkles, X } from "lucide-react";

import { getDisplayPhaseOrder } from "../../lib/planPhases";
import type {
  LevelReviewAnswerMap,
  LevelReviewQuestion,
} from "../../types/v2";

type LevelCompletionModalProps = {
  isOpen: boolean;
  levelOrder: number | null;
  levelTitle: string;
  questions: LevelReviewQuestion[];
  busy: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (answers: LevelReviewAnswerMap) => Promise<void> | void;
};

const LEVEL_DESIGN_PROGRESS_INTERVAL_MS = 10_000;
const LEVEL_DESIGN_PROGRESS_LABELS = [
  "5% - Validation du bilan...",
  "15% - Lecture des signaux...",
  "25% - Cadrage du niveau...",
  "35% - Design des actions...",
  "45% - Réglage du rythme...",
  "55% - Construction des semaines...",
  "65% - Ajustement du cap...",
  "75% - Vérification du niveau...",
  "90% - Préparation de l'affichage...",
  "Finalisation du niveau...",
];

export function LevelCompletionModal({
  isOpen,
  levelOrder,
  levelTitle,
  questions,
  busy,
  error,
  onClose,
  onSubmit,
}: LevelCompletionModalProps) {
  if (!isOpen) return null;

  const resetKey = questions.map((question) => question.id).join("|");

  return createPortal(
    <LevelCompletionModalContent
      key={resetKey}
      levelOrder={levelOrder}
      levelTitle={levelTitle}
      questions={questions}
      busy={busy}
      error={error}
      onClose={onClose}
      onSubmit={onSubmit}
    />,
    document.body,
  );
}

function BusyProgressLabel() {
  const [busyProgressStep, setBusyProgressStep] = useState(0);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setBusyProgressStep((current) =>
        Math.min(current + 1, LEVEL_DESIGN_PROGRESS_LABELS.length - 1)
      );
    }, LEVEL_DESIGN_PROGRESS_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <span className="truncate">
      {LEVEL_DESIGN_PROGRESS_LABELS[busyProgressStep] ??
        LEVEL_DESIGN_PROGRESS_LABELS[0]}
    </span>
  );
}

function LevelCompletionModalContent({
  levelOrder,
  levelTitle,
  questions,
  busy,
  error,
  onClose,
  onSubmit,
}: Omit<LevelCompletionModalProps, "isOpen">) {
  const [answers, setAnswers] = useState<LevelReviewAnswerMap>({});

  const visibleQuestions = useMemo(
    () =>
      questions.filter((question) =>
        (
          question.id !== "coherence_reason" ||
          answers.next_plan_coherence === "no"
        ) &&
        (
          question.id !== "difficulty_details" ||
          answers.difficulty_signal === "blocking"
        )
      ),
    [answers.difficulty_signal, answers.next_plan_coherence, questions],
  );

  const visibleAnswers = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(answers).filter(([questionId]) =>
          visibleQuestions.some((question) => question.id === questionId)
        ),
      ) as LevelReviewAnswerMap,
    [answers, visibleQuestions],
  );

  const isValid = useMemo(
    () =>
      visibleQuestions.every((question) =>
        !question.required || String(answers[question.id] ?? "").trim().length > 0
      ),
    [answers, visibleQuestions],
  );

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-stone-950/55 p-4 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={busy ? undefined : onClose} />

      <div className="relative z-[1] flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-[32px] border border-blue-100 bg-white shadow-[0_36px_120px_-48px_rgba(17,24,39,0.55)]">
        <div className="shrink-0 border-b border-blue-100 bg-gradient-to-r from-blue-950 to-stone-900 px-6 py-5 text-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-blue-200">
                Prochain niveau
              </p>
              <h3 className="mt-2 text-2xl font-semibold">
                {levelOrder ? `Niveau de plan ${getDisplayPhaseOrder(levelOrder)}` : "Niveau actuel"}
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/80">
                {levelTitle}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-white/75 transition hover:text-white disabled:opacity-50"
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-6">
          <div className="rounded-[24px] border border-blue-100 bg-blue-50/70 p-5">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-0.5 h-5 w-5 text-blue-600" />
              <p className="text-sm leading-6 text-stone-700">
                Ce bilan sert à valider le prochain niveau. Sophia garde le cap et ajuste la suite si besoin.
              </p>
            </div>
          </div>

          {visibleQuestions.map((question) => (
            <section
              key={question.id}
              className="rounded-[24px] border border-stone-200 bg-stone-50/60 p-5"
            >
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-stone-900">{question.label}</p>
                {question.required ? (
                  <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-400">
                    requis
                  </span>
                ) : null}
              </div>
              {question.helper_text ? (
                <p className="mt-2 text-sm leading-6 text-stone-600">{question.helper_text}</p>
              ) : null}

              {question.input_type === "single_select" ? (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {question.options.map((option) => {
                    const isSelected = answers[question.id] === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          setAnswers((current) => {
                            const next = { ...current, [question.id]: option.value };
                            if (question.id === "next_plan_coherence" && option.value !== "no") {
                              delete next.coherence_reason;
                            }
                            if (question.id === "difficulty_signal" && option.value !== "blocking") {
                              delete next.difficulty_details;
                            }
                            return next;
                          })}
                        className={`rounded-2xl border px-4 py-3 text-left text-sm font-medium transition ${
                          isSelected
                            ? "border-blue-500 bg-blue-50 text-blue-900"
                            : "border-stone-200 bg-white text-stone-700 hover:border-blue-200 hover:bg-blue-50/40"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <textarea
                  rows={4}
                  value={answers[question.id] ?? ""}
                  onChange={(event) =>
                    setAnswers((current) => ({
                      ...current,
                      [question.id]: event.target.value,
                    }))}
                  placeholder={question.placeholder ?? ""}
                  className="mt-4 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                />
              )}
            </section>
          ))}

          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {error}
            </div>
          ) : null}
        </div>

        <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 bg-white px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-full border border-stone-200 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-300 disabled:opacity-50"
          >
            Plus tard
          </button>

          <button
            type="button"
            onClick={() => void onSubmit(visibleAnswers)}
            disabled={!isValid || busy}
            className="inline-flex max-w-full items-center justify-center gap-2 rounded-full bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:opacity-50"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <BusyProgressLabel />
              </>
            ) : (
              <>
                Valider le prochain niveau
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
