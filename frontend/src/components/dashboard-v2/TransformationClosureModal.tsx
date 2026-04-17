import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ArrowRight, Check, Plus, X } from "lucide-react";

import type { BaseDeVieDeclics } from "../../types/v2";

type TransformationClosureModalProps = {
  isOpen: boolean;
  mode: "create" | "edit";
  transformationTitle: string;
  initialLineRedEntries: string[];
  initialDeclicsDraft: BaseDeVieDeclics | null;
  initialDeclicsUser: BaseDeVieDeclics | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    lineRedEntries: string[];
    declicsDraft: BaseDeVieDeclics | null;
    declicsUser: BaseDeVieDeclics;
  }) => Promise<void> | void;
};

function normalizeLines(lines: string[]) {
  return lines.map((line) => line.trim()).filter(Boolean);
}

function normalizeDeclics(value: BaseDeVieDeclics): BaseDeVieDeclics {
  return {
    why: value.why.trim(),
    insight: value.insight.trim(),
    identity_shift: value.identity_shift.trim(),
  };
}

export function TransformationClosureModal({
  isOpen,
  mode,
  transformationTitle,
  initialLineRedEntries,
  initialDeclicsDraft,
  initialDeclicsUser,
  busy,
  onClose,
  onSubmit,
}: TransformationClosureModalProps) {
  const [step, setStep] = useState(0);
  const [lineRedEntries, setLineRedEntries] = useState<string[]>(["", ""]);
  const [declicsUser, setDeclicsUser] = useState<BaseDeVieDeclics>({
    why: "",
    insight: "",
    identity_shift: "",
  });

  const draft = useMemo(
    () => initialDeclicsDraft ?? initialDeclicsUser,
    [initialDeclicsDraft, initialDeclicsUser],
  );

  useEffect(() => {
    if (!isOpen) return;
    setStep(0);
    setLineRedEntries(
      initialLineRedEntries.length > 0
        ? [...initialLineRedEntries, ""]
        : ["", ""],
    );
    setDeclicsUser(
      initialDeclicsUser ??
        draft ?? {
          why: "",
          insight: "",
          identity_shift: "",
        },
    );
  }, [draft, initialDeclicsUser, initialLineRedEntries, isOpen]);

  if (!isOpen) return null;

  const normalizedLineRedEntries = normalizeLines(lineRedEntries);
  const normalizedDeclicsUser = normalizeDeclics(declicsUser);
  const canAdvanceFromStep1 = normalizedLineRedEntries.length > 0;
  const canSubmit = Boolean(
    normalizedDeclicsUser.why &&
      normalizedDeclicsUser.insight &&
      normalizedDeclicsUser.identity_shift,
  );

  const stepTitle = mode === "create"
    ? ["Ta Ligne Rouge", "Tes Déclics", "Entrer dans ta Base de vie"][step]
    : ["Ta Ligne Rouge", "Tes Déclics", "Valider les changements"][step];

  return createPortal(
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-stone-950/55 p-4 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={busy ? undefined : onClose} />

      <div className="relative z-[1] w-full max-w-3xl overflow-hidden rounded-[32px] border border-emerald-200 bg-[linear-gradient(180deg,rgba(244,247,240,0.98),rgba(255,255,255,0.98))] shadow-[0_36px_120px_-48px_rgba(17,24,39,0.55)]">
        <div className="border-b border-emerald-100 bg-emerald-950 px-6 py-5 text-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-200">
                {mode === "create" ? "Clôture de transformation" : "Base de vie"}
              </p>
              <h3 className="mt-2 text-2xl font-semibold">
                {stepTitle}
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-emerald-50/85">
                {transformationTitle}
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

          <div className="mt-5 flex gap-2">
            {[0, 1, 2].map((index) => (
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
            <section className="space-y-4">
              <div className="rounded-[24px] border border-emerald-100 bg-white/80 p-5">
                <p className="text-sm leading-6 text-stone-700">
                  Note une ou plusieurs phrases courtes sur ce que tu ne veux plus
                  normaliser pour toi.
                </p>
              </div>

              <div className="space-y-3">
                {lineRedEntries.map((entry, index) => (
                  <input
                    key={index}
                    type="text"
                    value={entry}
                    onChange={(event) => {
                      const next = [...lineRedEntries];
                      next[index] = event.target.value;
                      setLineRedEntries(next);
                    }}
                    placeholder="Ex: Je n'accepte plus de m'effondrer en silence."
                    className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-800 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={() => setLineRedEntries((current) => [...current, ""])}
                className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-emerald-200 hover:text-emerald-700"
              >
                <Plus className="h-4 w-4" />
                Ajouter une ligne
              </button>
            </section>
          ) : null}

          {step === 1 ? (
            <section className="space-y-4">
              <div className="rounded-[24px] border border-amber-100 bg-amber-50/80 p-5">
                <p className="text-sm leading-6 text-stone-700">
                  Voici le brouillon Sophia. Ajuste les mots pour qu’ils sonnent juste
                  pour toi avant de l’ancrer dans ta Base de vie.
                </p>
              </div>

              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                  Pourquoi
                </span>
                <textarea
                  rows={4}
                  value={declicsUser.why}
                  onChange={(event) =>
                    setDeclicsUser((current) => ({ ...current, why: event.target.value }))}
                  placeholder={draft?.why ?? "Ce que cette transformation servait profondément."}
                  className="w-full rounded-[24px] border border-stone-200 bg-white px-4 py-3 text-sm leading-6 text-stone-800 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                  Ce que j'ai compris
                </span>
                <textarea
                  rows={4}
                  value={declicsUser.insight}
                  onChange={(event) =>
                    setDeclicsUser((current) => ({ ...current, insight: event.target.value }))}
                  placeholder={draft?.insight ?? "Le déclic concret qui reste après cette étape."}
                  className="w-full rounded-[24px] border border-stone-200 bg-white px-4 py-3 text-sm leading-6 text-stone-800 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                  Ce qui a bougé dans mon identité
                </span>
                <textarea
                  rows={4}
                  value={declicsUser.identity_shift}
                  onChange={(event) =>
                    setDeclicsUser((current) => ({
                      ...current,
                      identity_shift: event.target.value,
                    }))}
                  placeholder={
                    draft?.identity_shift ?? "La manière dont je me vois désormais face à ce sujet."
                  }
                  className="w-full rounded-[24px] border border-stone-200 bg-white px-4 py-3 text-sm leading-6 text-stone-800 outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                />
              </label>
            </section>
          ) : null}

          {step === 2 ? (
            <section className="space-y-4">
              <div className="rounded-[28px] border border-emerald-100 bg-white p-5 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">
                  Ligne Rouge
                </p>
                <ul className="mt-3 space-y-2">
                  {normalizedLineRedEntries.map((entry) => (
                    <li
                      key={entry}
                      className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-700"
                    >
                      {entry}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-[28px] border border-amber-100 bg-white p-5 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-700">
                  Déclics
                </p>
                <div className="mt-4 space-y-4 text-sm leading-6 text-stone-700">
                  <div>
                    <p className="font-semibold text-stone-900">Pourquoi</p>
                    <p>{normalizedDeclicsUser.why}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-stone-900">Ce que j'ai compris</p>
                    <p>{normalizedDeclicsUser.insight}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-stone-900">Identité</p>
                    <p>{normalizedDeclicsUser.identity_shift}</p>
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

          {step < 2 ? (
            <button
              type="button"
              onClick={() => setStep((current) => current + 1)}
              disabled={(step === 0 && !canAdvanceFromStep1) || (step === 1 && !canSubmit) || busy}
              className="inline-flex items-center gap-2 rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-50"
            >
              Continuer
              <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() =>
                void onSubmit({
                  lineRedEntries: normalizedLineRedEntries,
                  declicsDraft: draft,
                  declicsUser: normalizedDeclicsUser,
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
