import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";

import {
  getTransformationClosureHelpfulnessAreaLabel,
  getTransformationClosureImprovementReasonLabel,
  transformationClosureHelpfulnessAreaOptions,
  transformationClosureImprovementReasonOptions,
} from "../../lib/transformationClosure";
import type {
  BaseDeVieLineEntry,
  TransformationClosureFeedback,
  TransformationClosureHelpfulnessArea,
  TransformationClosureImprovementReason,
} from "../../types/v2";

type TransformationClosureModalProps = {
  isOpen: boolean;
  mode: "create" | "edit";
  transformationTitle: string;
  initialLineGreenEntry: BaseDeVieLineEntry | null;
  initialLineRedEntry: BaseDeVieLineEntry | null;
  initialFeedback: TransformationClosureFeedback | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    lineGreenEntry: BaseDeVieLineEntry;
    lineRedEntry: BaseDeVieLineEntry;
    feedback: TransformationClosureFeedback;
  }) => Promise<void> | void;
};

const STEP_TITLES = [
  "Retour de fin",
  "Ta Ligne Verte",
  "Ta Ligne Rouge",
  "Validation finale",
] as const;

function normalizeLineEntry(value: BaseDeVieLineEntry): BaseDeVieLineEntry {
  return {
    action: value.action.trim(),
    why: value.why.trim(),
  };
}

function normalizeFeedback(value: {
  helpfulnessRating: number | null;
  improvementReasons: TransformationClosureImprovementReason[];
  improvementDetail: string;
  mostHelpfulArea: TransformationClosureHelpfulnessArea | null;
}): TransformationClosureFeedback | null {
  if (
    value.helpfulnessRating == null ||
    value.helpfulnessRating < 1 ||
    value.helpfulnessRating > 10 ||
    !value.mostHelpfulArea
  ) {
    return null;
  }

  return {
    helpfulness_rating: value.helpfulnessRating,
    improvement_reasons: [...new Set(value.improvementReasons)],
    improvement_detail: value.improvementDetail.trim() || null,
    most_helpful_area: value.mostHelpfulArea,
  };
}

export function TransformationClosureModal({
  isOpen,
  mode,
  transformationTitle,
  initialLineGreenEntry,
  initialLineRedEntry,
  initialFeedback,
  busy,
  onClose,
  onSubmit,
}: TransformationClosureModalProps) {
  const [step, setStep] = useState(0);
  const [helpfulnessRating, setHelpfulnessRating] = useState<number | null>(null);
  const [improvementReasons, setImprovementReasons] = useState<TransformationClosureImprovementReason[]>([]);
  const [improvementDetail, setImprovementDetail] = useState("");
  const [mostHelpfulArea, setMostHelpfulArea] = useState<TransformationClosureHelpfulnessArea | null>(null);
  const [lineGreenEntry, setLineGreenEntry] = useState<BaseDeVieLineEntry>({
    action: "",
    why: "",
  });
  const [lineRedEntry, setLineRedEntry] = useState<BaseDeVieLineEntry>({
    action: "",
    why: "",
  });

  useEffect(() => {
    if (!isOpen) return;
    setStep(0);
    setHelpfulnessRating(initialFeedback?.helpfulness_rating ?? null);
    setImprovementReasons(initialFeedback?.improvement_reasons ?? []);
    setImprovementDetail(initialFeedback?.improvement_detail ?? "");
    setMostHelpfulArea(initialFeedback?.most_helpful_area ?? null);
    setLineGreenEntry(initialLineGreenEntry ?? { action: "", why: "" });
    setLineRedEntry(initialLineRedEntry ?? { action: "", why: "" });
  }, [initialFeedback, initialLineGreenEntry, initialLineRedEntry, isOpen]);

  const normalizedLineGreenEntry = useMemo(() => normalizeLineEntry(lineGreenEntry), [lineGreenEntry]);
  const normalizedLineRedEntry = useMemo(() => normalizeLineEntry(lineRedEntry), [lineRedEntry]);
  const normalizedFeedback = useMemo(
    () =>
      normalizeFeedback({
        helpfulnessRating,
        improvementReasons,
        improvementDetail,
        mostHelpfulArea,
      }),
    [helpfulnessRating, improvementDetail, improvementReasons, mostHelpfulArea],
  );

  if (!isOpen) return null;

  const selectedOtherReason = improvementReasons.includes("other");
  const isImprovementStepValid = Boolean(
    normalizedFeedback &&
      (normalizedFeedback.helpfulness_rating >= 8 ||
        normalizedFeedback.improvement_reasons.length > 0) &&
      (!selectedOtherReason || normalizedFeedback.improvement_detail),
  );
  const isLineGreenStepValid = Boolean(
    normalizedLineGreenEntry.action && normalizedLineGreenEntry.why,
  );
  const isLineRedStepValid = Boolean(
    normalizedLineRedEntry.action && normalizedLineRedEntry.why,
  );
  const canSubmit = Boolean(normalizedFeedback && isLineGreenStepValid && isLineRedStepValid);

  const toggleImprovementReason = (value: TransformationClosureImprovementReason) => {
    setImprovementReasons((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  };

  const stepTitle = STEP_TITLES[step] ?? STEP_TITLES[0];

  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-stone-950/55 p-4 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={busy ? undefined : onClose} />

      <div className="relative z-[1] w-full max-w-4xl overflow-hidden rounded-[32px] border border-emerald-200 bg-[linear-gradient(180deg,rgba(244,247,240,0.98),rgba(255,255,255,0.98))] shadow-[0_36px_120px_-48px_rgba(17,24,39,0.55)]">
        <div className="border-b border-emerald-100 bg-emerald-950 px-6 py-5 text-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-200">
                {mode === "create" ? "Fin de transformation" : "Base de vie"}
              </p>
              <h3 className="mt-2 text-2xl font-semibold">{stepTitle}</h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50/85">
                {mode === "create"
                  ? "Ta transformation est terminée. Ce que tu valides ici entrera dans ta Base de vie, et ton retour aidera Sophia à améliorer la suite."
                  : "Tu ajustes ce que cette transformation laisse dans ta Base de vie."}
              </p>
              <p className="mt-3 text-sm font-medium text-white">{transformationTitle}</p>
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

          <div className="mt-5 flex gap-2">
            {STEP_TITLES.map((_, index) => (
              <div
                key={index}
                className={`h-1.5 flex-1 rounded-full ${
                  index <= step ? "bg-emerald-200" : "bg-white/15"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="space-y-5 px-6 py-6">
          {step === 0 ? (
            <section className="space-y-6">
              <div className="rounded-[24px] border border-emerald-100 bg-white/80 p-5">
                <p className="text-sm leading-6 text-stone-700">
                  D'abord, dis-nous ce que cette transformation t'a vraiment apporté, et où on peut faire mieux.
                </p>
              </div>

              <div>
                <p className="text-sm font-semibold text-stone-950">
                  À quel point Sophia et ce plan t'ont aidé dans cette transformation ?
                </p>
                <div className="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-10">
                  {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => {
                    const selected = helpfulnessRating === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setHelpfulnessRating(value)}
                        className={`rounded-2xl border px-3 py-3 text-sm font-semibold transition ${
                          selected
                            ? "border-emerald-700 bg-emerald-700 text-white"
                            : "border-stone-200 bg-white text-stone-700 hover:border-emerald-300"
                        }`}
                      >
                        {value}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold text-stone-950">
                  Qu'est-ce qui t'a le plus aidé concrètement ?
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {transformationClosureHelpfulnessAreaOptions.map((option) => {
                    const selected = mostHelpfulArea === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setMostHelpfulArea(option.value)}
                        className={`rounded-[22px] border px-4 py-4 text-left text-sm transition ${
                          selected
                            ? "border-emerald-700 bg-emerald-50 text-emerald-950"
                            : "border-stone-200 bg-white text-stone-700 hover:border-emerald-200"
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {helpfulnessRating != null && helpfulnessRating < 8 ? (
                <div className="space-y-4 rounded-[24px] border border-amber-100 bg-amber-50/80 p-5">
                  <div>
                    <p className="text-sm font-semibold text-stone-950">
                      Qu'est-ce qu'on aurait pu mieux faire ?
                    </p>
                    <p className="mt-1 text-sm leading-6 text-stone-600">
                      Choisis une ou plusieurs réponses. Ça nous donne une donnée claire, et tu peux ajouter du détail juste après.
                    </p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    {transformationClosureImprovementReasonOptions.map((option) => {
                      const selected = improvementReasons.includes(option.value);
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => toggleImprovementReason(option.value)}
                          className={`rounded-[22px] border px-4 py-4 text-left text-sm transition ${
                            selected
                              ? "border-amber-500 bg-white text-stone-950"
                              : "border-amber-100 bg-white/70 text-stone-700 hover:border-amber-300"
                          }`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>

                  <label className="block space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                      Si tu veux, donne un exemple ou un détail
                    </span>
                    <textarea
                      rows={4}
                      value={improvementDetail}
                      onChange={(event) => setImprovementDetail(event.target.value)}
                      placeholder="Exemple: le plan était bon dans l'idée, mais trop chargé le soir."
                      className="w-full rounded-[24px] border border-stone-200 bg-white px-4 py-3 text-sm leading-6 text-stone-800 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                    />
                    {selectedOtherReason ? (
                      <p className="text-xs text-amber-700">
                        Le détail devient nécessaire quand tu choisis "Autre".
                      </p>
                    ) : null}
                  </label>
                </div>
              ) : null}
            </section>
          ) : null}

          {step === 1 ? (
            <section className="space-y-4">
              <div className="rounded-[24px] border border-emerald-100 bg-white/80 p-5">
                <p className="text-sm leading-6 text-stone-700">
                  La ligne verte, c'est ce que tu veux refaire souvent parce que tu sais que ça te fait du bien. Tu retrouveras ça dans ta Base de vie.
                </p>
              </div>

              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                  Quoi ?
                </span>
                <textarea
                  rows={3}
                  value={lineGreenEntry.action}
                  onChange={(event) =>
                    setLineGreenEntry((current) => ({ ...current, action: event.target.value }))}
                  placeholder="Ex: marcher 20 minutes chaque matin avant de regarder mon téléphone."
                  className="w-full rounded-[24px] border border-stone-200 bg-white px-4 py-3 text-sm leading-6 text-stone-800 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                  Pourquoi ?
                </span>
                <textarea
                  rows={4}
                  value={lineGreenEntry.why}
                  onChange={(event) =>
                    setLineGreenEntry((current) => ({ ...current, why: event.target.value }))}
                  placeholder="Ex: parce que ça m'apaise, me remet dans mon axe et améliore le reste de ma journée."
                  className="w-full rounded-[24px] border border-stone-200 bg-white px-4 py-3 text-sm leading-6 text-stone-800 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                />
              </label>
            </section>
          ) : null}

          {step === 2 ? (
            <section className="space-y-4">
              <div className="rounded-[24px] border border-rose-100 bg-rose-50/70 p-5">
                <p className="text-sm leading-6 text-stone-700">
                  La ligne rouge, c'est ce que tu ne veux plus refaire parce que tu as changé et que tu en connais maintenant les conséquences négatives. Tu retrouveras ça aussi dans ta Base de vie.
                </p>
              </div>

              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                  Quoi ?
                </span>
                <textarea
                  rows={3}
                  value={lineRedEntry.action}
                  onChange={(event) =>
                    setLineRedEntry((current) => ({ ...current, action: event.target.value }))}
                  placeholder="Ex: accepter encore des journées où je m'abandonne complètement."
                  className="w-full rounded-[24px] border border-stone-200 bg-white px-4 py-3 text-sm leading-6 text-stone-800 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                  Pourquoi ?
                </span>
                <textarea
                  rows={4}
                  value={lineRedEntry.why}
                  onChange={(event) =>
                    setLineRedEntry((current) => ({ ...current, why: event.target.value }))}
                  placeholder="Ex: parce que je sais maintenant ce que ça déclenche en cascade chez moi."
                  className="w-full rounded-[24px] border border-stone-200 bg-white px-4 py-3 text-sm leading-6 text-stone-800 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                />
              </label>
            </section>
          ) : null}

          {step === 3 ? (
            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-[28px] border border-stone-200 bg-white p-5 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-500">
                  Retour produit
                </p>
                {normalizedFeedback ? (
                  <div className="mt-4 space-y-4 text-sm leading-6 text-stone-700">
                    <div>
                      <p className="font-semibold text-stone-950">Note</p>
                      <p>{normalizedFeedback.helpfulness_rating}/10</p>
                    </div>
                    <div>
                      <p className="font-semibold text-stone-950">Le plus utile</p>
                      <p>{getTransformationClosureHelpfulnessAreaLabel(normalizedFeedback.most_helpful_area)}</p>
                    </div>
                    {normalizedFeedback.improvement_reasons.length > 0 ? (
                      <div>
                        <p className="font-semibold text-stone-950">À améliorer</p>
                        <ul className="mt-2 space-y-2">
                          {normalizedFeedback.improvement_reasons.map((reason) => (
                            <li key={reason} className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
                              {getTransformationClosureImprovementReasonLabel(reason)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {normalizedFeedback.improvement_detail ? (
                      <div>
                        <p className="font-semibold text-stone-950">Détail</p>
                        <p>{normalizedFeedback.improvement_detail}</p>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="space-y-4">
                <div className="rounded-[28px] border border-emerald-100 bg-white p-5 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">
                    Ligne Verte
                  </p>
                  <div className="mt-4 space-y-3 text-sm leading-6 text-stone-700">
                    <div>
                      <p className="font-semibold text-stone-950">Quoi</p>
                      <p>{normalizedLineGreenEntry.action}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-stone-950">Pourquoi</p>
                      <p>{normalizedLineGreenEntry.why}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[28px] border border-rose-100 bg-white p-5 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-rose-700">
                    Ligne Rouge
                  </p>
                  <div className="mt-4 space-y-3 text-sm leading-6 text-stone-700">
                    <div>
                      <p className="font-semibold text-stone-950">Quoi</p>
                      <p>{normalizedLineRedEntry.action}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-stone-950">Pourquoi</p>
                      <p>{normalizedLineRedEntry.why}</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 bg-white px-6 py-4">
          <button
            type="button"
            onClick={step === 0 ? onClose : () => setStep((current) => current - 1)}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-full border border-stone-200 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-300 disabled:opacity-50"
          >
            <ArrowLeft className="h-4 w-4" />
            {step === 0 ? "Fermer" : "Retour"}
          </button>

          {step < 3 ? (
            <button
              type="button"
              onClick={() => setStep((current) => current + 1)}
              disabled={
                busy ||
                (step === 0 && !isImprovementStepValid) ||
                (step === 1 && !isLineGreenStepValid) ||
                (step === 2 && !isLineRedStepValid)
              }
              className="inline-flex items-center gap-2 rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-50"
            >
              Continuer
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() =>
                normalizedFeedback &&
                void onSubmit({
                  lineGreenEntry: normalizedLineGreenEntry,
                  lineRedEntry: normalizedLineRedEntry,
                  feedback: normalizedFeedback,
                })}
              disabled={!canSubmit || busy}
              className="inline-flex items-center gap-2 rounded-full bg-stone-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
              {busy
                ? "Enregistrement..."
                : mode === "create"
                ? "Entrer dans ma Base de vie"
                : "Enregistrer"}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
