import { useMemo, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  X,
  Plus,
  Sparkles,
} from "lucide-react";

import type { TransformationPreviewV2 } from "../../lib/onboardingV2";

type ConfirmPayload = {
  selectedTransformationId: string;
  transformations: TransformationPreviewV2[];
};

type AlternatePayload = {
  selectedTransformationId: string | null;
  transformations: TransformationPreviewV2[];
};

type TransformationFocusStepProps = {
  transformations: TransformationPreviewV2[];
  initialSelectedId: string | null;
  onConfirm: (payload: ConfirmPayload) => void;
  isSubmitting: boolean;
  badgeLabel?: string;
  title?: string;
  description?: string;
  primaryActionLabel?: string;
  allowManualAdd?: boolean;
  alternateActionLabel?: string | null;
  alternateActionDescription?: string | null;
  onAlternateAction?: (payload: AlternatePayload) => void;
};

function sortByPriority(items: TransformationPreviewV2[]) {
  return [...items].sort((a, b) => {
    const left = a.priority_order ?? Number.MAX_SAFE_INTEGER;
    const right = b.priority_order ?? Number.MAX_SAFE_INTEGER;
    if (left !== right) return left - right;
    return (a.title ?? "").localeCompare(b.title ?? "");
  });
}

function recommendedTransformation(items: TransformationPreviewV2[]) {
  return [...items].sort((a, b) => {
    const left = a.recommended_order ?? a.priority_order ?? Number.MAX_SAFE_INTEGER;
    const right = b.recommended_order ?? b.priority_order ?? Number.MAX_SAFE_INTEGER;
    if (left !== right) return left - right;
    return (a.title ?? "").localeCompare(b.title ?? "");
  })[0] ?? null;
}

function buildManualTransformation(
  title: string,
  context: string,
): TransformationPreviewV2 {
  const cleanTitle = title.trim();
  const cleanContext = context.trim();
  return {
    id: `manual-${crypto.randomUUID()}`,
    cycle_id: "",
    priority_order: Number.MAX_SAFE_INTEGER,
    recommended_order: null,
    recommended_progress_indicator: null,
    status: "pending",
    title: cleanTitle,
    internal_summary:
      cleanContext
        ? `Transformation ajoutée manuellement par l'utilisateur : ${cleanTitle}. Contexte ajouté : ${cleanContext}.`
        : `Transformation ajoutée manuellement par l'utilisateur : ${cleanTitle}.`,
    user_summary:
      cleanContext ||
      `Tu as ajouté ce sujet manuellement pour pouvoir t'y atteler ensuite : ${cleanTitle}.`,
    questionnaire_context: [],
    questionnaire_schema: null,
    questionnaire_answers: null,
    source_group_index: null,
    ordering_rationale: null,
    selection_context: cleanContext || null,
    is_manual: true,
  };
}

export function TransformationFocusStep({
  transformations: initialTransformations,
  initialSelectedId,
  onConfirm,
  isSubmitting,
  badgeLabel = "Choix du point de départ",
  title = "Par quoi veux-tu commencer ?",
  description = "Sophia te propose le sujet le plus pertinent pour démarrer. Tu peux garder cette proposition, en choisir un autre, ou ajouter un sujet si quelque chose manque.",
  primaryActionLabel = "Continuer avec cette transformation",
  allowManualAdd = true,
  alternateActionLabel = null,
  alternateActionDescription = null,
  onAlternateAction,
}: TransformationFocusStepProps) {
  const [transformations, setTransformations] = useState<TransformationPreviewV2[]>(
    () => sortByPriority(initialTransformations),
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedId ?? sortByPriority(initialTransformations)[0]?.id ?? null,
  );
  const [newTransformationTitle, setNewTransformationTitle] = useState("");
  const [newTransformationContext, setNewTransformationContext] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  const recommended = useMemo(
    () => recommendedTransformation(transformations),
    [transformations],
  );

  const selectedTransformation = useMemo(
    () => transformations.find((item) => item.id === selectedId) ?? null,
    [selectedId, transformations],
  );

  const otherTransformations = useMemo(
    () => sortByPriority(transformations.filter((item) => item.id !== selectedId)),
    [selectedId, transformations],
  );

  function updateSelectionContext(value: string) {
    if (!selectedTransformation) return;
    setTransformations((current) =>
      current.map((item) =>
        item.id === selectedTransformation.id
          ? { ...item, selection_context: value }
          : item
      )
    );
  }

  function selectTransformation(transformationId: string) {
    setSelectedId(transformationId);
  }

  function addTransformation() {
    const title = newTransformationTitle.trim();
    if (!title) return;

    const next = buildManualTransformation(title, newTransformationContext);
    setTransformations((current) => [...current, next]);
    setSelectedId(next.id);
    setNewTransformationTitle("");
    setNewTransformationContext("");
    setShowAddForm(false);
  }

  function removeTransformation(transformationId: string) {
    const target = transformations.find((item) => item.id === transformationId);
    if (!target) return;
    if (
      !window.confirm(
        `Supprimer "${target.title || "cette transformation"}" de la sélection ?`,
      )
    ) {
      return;
    }

    const nextTransformations = transformations.filter((item) => item.id !== transformationId);
    setTransformations(nextTransformations);

    if (selectedId === transformationId) {
      setSelectedId(nextTransformations[0]?.id ?? null);
    }
  }

  function handleConfirm() {
    if (!selectedTransformation) return;

    const selected = transformations.find((item) => item.id === selectedTransformation.id);
    if (!selected) return;

    const others = transformations.filter((item) => item.id !== selectedTransformation.id);
    const reordered = [selected, ...sortByPriority(others)].map((item, index) => ({
      ...item,
      priority_order: index + 1,
      status: index === 0 ? ("ready" as const) : ("pending" as const),
    }));

    onConfirm({
      selectedTransformationId: selectedTransformation.id,
      transformations: reordered,
    });
  }

  function handleAlternateAction() {
    onAlternateAction?.({
      selectedTransformationId: selectedId,
      transformations,
    });
  }

  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="text-center">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-xs font-bold uppercase tracking-wide text-blue-700">
          <Sparkles className="h-3.5 w-3.5" />
          {badgeLabel}
        </div>
        <h1 className="mb-3 text-3xl font-semibold tracking-tight text-gray-900 md:text-5xl">
          {title}
        </h1>
        <p className="mx-auto max-w-3xl text-base leading-relaxed text-gray-600 md:text-lg">
          {description}
        </p>
      </div>

      {recommended ? (
        <div className="rounded-3xl border border-blue-200 bg-gradient-to-br from-blue-50 to-cyan-50 p-5 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-700">
            Recommandation Sophia
          </p>
          <h2 className="mt-2 text-xl font-semibold text-gray-900">
            {recommended.title || "Transformation proposée"}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-700">
            {recommended.ordering_rationale ||
              "C'est le meilleur point d'entrée pour lancer le parcours de manière cohérente."}
          </p>
        </div>
      ) : null}

      {selectedTransformation ? (
        <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
                Transformation prioritaire
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-gray-900 md:text-3xl">
                {selectedTransformation.title || "Transformation"}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {recommended && selectedTransformation.id === recommended.id ? (
                <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Proposition recommandée
                </span>
              ) : null}
              {transformations.length > 1 ? (
                <button
                  type="button"
                  onClick={() => removeTransformation(selectedTransformation.id)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600 transition hover:bg-rose-100"
                  aria-label="Supprimer cette transformation"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                Contexte déjà connu
              </p>
              <p className="mt-3 text-sm leading-relaxed text-gray-700">
                {selectedTransformation.user_summary ||
                  "Sophia n'a pas encore assez de contexte sur ce sujet."}
              </p>
            </div>

            <label className="rounded-2xl border border-gray-200 bg-white p-4">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                Détails complémentaires
              </span>
              <textarea
                value={selectedTransformation.selection_context ?? ""}
                onChange={(event) => updateSelectionContext(event.target.value)}
                placeholder="Ajoute ici une nuance, ce qui te semble le plus difficile, ou un détail important pour cette transformation."
                className="mt-3 min-h-32 w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm leading-relaxed text-gray-700 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
              />
            </label>
          </div>
        </div>
      ) : null}

      <div className="rounded-3xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-500">
              Autres transformations identifiées
            </p>
            <p className="mt-1 text-sm text-gray-600">
              Tu peux changer de focus en un tap.
            </p>
          </div>
          {allowManualAdd ? (
            <button
              type="button"
              onClick={() => setShowAddForm((current) => !current)}
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-blue-200 hover:bg-white hover:text-gray-900"
            >
              <Plus className="h-4 w-4" />
              Ajouter une transformation
            </button>
          ) : null}
        </div>

        {allowManualAdd && showAddForm ? (
          <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4">
            <div className="flex items-start justify-between gap-3">
              <label className="block text-sm font-medium text-gray-700">
                Transformation à ajouter
              </label>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition hover:bg-white/80 hover:text-gray-600"
                aria-label="Fermer l'ajout de transformation"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 flex flex-col gap-3 md:flex-row">
              <input
                type="text"
                value={newTransformationTitle}
                onChange={(event) => setNewTransformationTitle(event.target.value)}
                placeholder="Ex: retrouver un meilleur sommeil"
                className="flex-1 rounded-full border border-blue-200 bg-white px-4 py-3 text-sm text-gray-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              />
              <button
                type="button"
                onClick={addTransformation}
                disabled={!newTransformationTitle.trim()}
                className="inline-flex items-center justify-center rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
              >
                Ajouter
              </button>
            </div>
            <textarea
              value={newTransformationContext}
              onChange={(event) => setNewTransformationContext(event.target.value)}
              placeholder="Ajoute ici le contexte important pour cette transformation."
              className="mt-3 min-h-28 w-full resize-none rounded-2xl border border-blue-200 bg-white px-4 py-3 text-sm leading-relaxed text-gray-700 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            />
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-3">
          {otherTransformations.map((transformation) => (
            <div
              key={transformation.id}
              className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 pl-4 pr-1 py-1"
            >
              <button
                type="button"
                onClick={() => selectTransformation(transformation.id)}
                className="text-sm font-medium text-gray-700 transition hover:text-gray-900"
              >
                {transformation.title || "Transformation"}
              </button>
              <button
                type="button"
                onClick={() => removeTransformation(transformation.id)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition hover:bg-white hover:text-rose-600"
                aria-label={`Supprimer ${transformation.title || "cette transformation"}`}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          {otherTransformations.length === 0 ? (
            <p className="text-sm text-gray-500">
              Aucune autre transformation à comparer pour le moment.
            </p>
          ) : null}
        </div>
      </div>

      {onAlternateAction && alternateActionLabel ? (
        <div className="rounded-3xl border border-stone-200 bg-stone-50 p-5 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
            Autre sujet prioritaire
          </p>
          {alternateActionDescription ? (
            <p className="mt-2 text-sm leading-6 text-stone-600">
              {alternateActionDescription}
            </p>
          ) : null}
          <div className="mt-4">
            <button
              type="button"
              onClick={handleAlternateAction}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:border-blue-200 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {alternateActionLabel}
            </button>
          </div>
        </div>
      ) : null}

      <div className="sticky bottom-4 z-20">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isSubmitting || !selectedTransformation}
          className="group flex w-full items-center justify-center gap-2 rounded-full bg-blue-600 py-3.5 text-base font-bold text-white shadow-md shadow-blue-200 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70 md:py-4"
        >
          {primaryActionLabel}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </button>
      </div>
    </section>
  );
}
