import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Loader2, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useOnboardingAmbientAudio } from "../hooks/useOnboardingAmbientAudio";
import { useDashboardV2Data } from "../hooks/useDashboardV2Data";
import {
  createEmptyOnboardingV2Draft,
  persistOnboardingV2DraftLocally,
  type TransformationPreviewV2,
} from "../lib/onboardingV2";

function isVisibleTransformationStatus(status: string) {
  return status !== "abandoned" && status !== "cancelled" && status !== "archived";
}

function getOnboardingSelectionContext(
  handoffPayload: Record<string, unknown> | null,
): string | null {
  const onboardingV2 = (handoffPayload?.onboarding_v2 as Record<string, unknown> | undefined) ?? {};
  return typeof onboardingV2.selection_context === "string"
    ? onboardingV2.selection_context
    : null;
}

function toTransformationPreviewFromDashboard(
  transformation: {
    id: string;
    cycle_id: string;
    priority_order: number;
    status: TransformationPreviewV2["status"];
    title: string | null;
    internal_summary: string;
    user_summary: string;
    questionnaire_schema: Record<string, unknown> | null;
    questionnaire_answers: Record<string, unknown> | null;
    handoff_payload: Record<string, unknown> | null;
  },
): TransformationPreviewV2 {
  const onboardingV2 = (transformation.handoff_payload?.onboarding_v2 as
    | Record<string, unknown>
    | undefined) ?? {};

  return {
    id: transformation.id,
    cycle_id: transformation.cycle_id,
    priority_order: transformation.priority_order,
    recommended_order:
      typeof onboardingV2.recommended_order === "number"
        ? onboardingV2.recommended_order
        : null,
    recommended_progress_indicator:
      typeof onboardingV2.recommended_progress_indicator === "string"
        ? onboardingV2.recommended_progress_indicator
        : null,
    status: transformation.status,
    title: transformation.title,
    internal_summary: transformation.internal_summary,
    user_summary: transformation.user_summary,
    questionnaire_context: Array.isArray(onboardingV2.questionnaire_context)
      ? onboardingV2.questionnaire_context.filter(
          (entry): entry is string => typeof entry === "string",
        )
      : [],
    questionnaire_schema: (transformation.questionnaire_schema as any) ?? null,
    questionnaire_answers: transformation.questionnaire_answers,
    source_group_index:
      typeof onboardingV2.source_group_index === "number"
        ? onboardingV2.source_group_index
        : null,
    ordering_rationale:
      typeof onboardingV2.ordering_rationale === "string"
        ? onboardingV2.ordering_rationale
        : null,
    selection_context:
      typeof onboardingV2.selection_context === "string"
        ? onboardingV2.selection_context
        : null,
    is_manual: onboardingV2.is_manual === true,
  };
}

export default function AddTransformationPage() {
  const navigate = useNavigate();
  const { startSession } = useOnboardingAmbientAudio();
  const {
    loading,
    error,
    cycle,
    transformations,
    activeTransformation,
    nextTransformation,
    hasIncompleteCycle,
  } = useDashboardV2Data(null);
  const [selectedTransformationId, setSelectedTransformationId] = useState<string | null>(null);

  const engagedTransformations = useMemo(
    () =>
      transformations.filter((item) =>
        item.status === "active" || item.status === "ready" || item.status === "pending"
      ),
    [transformations],
  );
  const remainingTransformations = useMemo(
    () => transformations.filter((item) => item.status === "ready" || item.status === "pending"),
    [transformations],
  );
  const recommendedTransformation = nextTransformation ?? remainingTransformations[0] ?? null;
  const selectedTransformation = remainingTransformations.find((item) => item.id === selectedTransformationId) ??
    recommendedTransformation ??
    null;
  const hasReachedLimit = engagedTransformations.length >= 2;

  useEffect(() => {
    if (!recommendedTransformation) {
      setSelectedTransformationId(null);
      return;
    }
    setSelectedTransformationId((current) =>
      current && remainingTransformations.some((item) => item.id === current)
        ? current
        : recommendedTransformation.id
    );
  }, [recommendedTransformation, remainingTransformations]);

  function handleContinue() {
    if (!cycle || !selectedTransformation || hasReachedLimit) return;

    const baseDraft = createEmptyOnboardingV2Draft();
    const visibleTransformations = transformations
      .filter((item) => isVisibleTransformationStatus(item.status))
      .map((item) => toTransformationPreviewFromDashboard(item));

    persistOnboardingV2DraftLocally({
      ...baseDraft,
      entry_mode: "add_transformation",
      preserved_active_transformation_id: activeTransformation?.id ?? null,
      cycle_id: cycle.id,
      cycle_status: "questionnaire_in_progress",
      stage: selectedTransformation.questionnaire_schema
        ? "questionnaire"
        : "questionnaire_setup",
      raw_intake_text: cycle.raw_intake_text,
      transformations: visibleTransformations,
      active_transformation_id: selectedTransformation.id,
      questionnaire_schema: (selectedTransformation.questionnaire_schema as any) ?? null,
      questionnaire_answers:
        (selectedTransformation.questionnaire_answers as Record<string, unknown> | null) ?? {},
      plan_review: null,
      roadmap_transition: null,
    });

    startSession();
    navigate("/onboarding-v2");
  }

  return (
    <div className="min-h-screen bg-stone-50 px-4 py-6 md:px-6 md:py-10">
      <div className="mx-auto w-full max-w-4xl">
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-600 shadow-sm transition hover:border-blue-200 hover:text-stone-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour au dashboard
        </button>

        <section className="mt-5 rounded-[32px] border border-stone-200 bg-white p-6 shadow-[0_24px_80px_-52px_rgba(15,23,42,0.32)] md:p-8">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-700">
              <Sparkles className="h-3.5 w-3.5" />
              Ajouter une transformation
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-stone-950 md:text-4xl">
              Choisis la prochaine transformation à lancer
            </h1>
            <p className="mt-3 text-sm leading-6 text-stone-600 md:text-base">
              Cette page sert uniquement a lancer une transformation deja preparee dans ton cycle,
              sans ecraser celle qui est deja en cours.
            </p>
          </div>

          {loading ? (
            <div className="mt-8 flex items-center gap-3 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-4 text-sm text-stone-600">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              Chargement des transformations...
            </div>
          ) : null}

          {!loading && error ? (
            <div className="mt-8 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-800">
              {error}
            </div>
          ) : null}

          {!loading && !error && hasIncompleteCycle && !cycle ? (
            <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-5 text-sm text-amber-950">
              Un onboarding est deja en cours. Termine-le avant d'ajouter une nouvelle transformation.
            </div>
          ) : null}

          {!loading && !error && cycle && hasReachedLimit ? (
            <div className="mt-8 rounded-3xl border border-amber-200 bg-amber-50 px-5 py-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-800">
                Limite atteinte
              </p>
              <h2 className="mt-2 text-xl font-semibold text-stone-950">
                Tu es limite a 2 transformations en parallele
              </h2>
              <p className="mt-3 text-sm leading-6 text-stone-700">
                Si tu veux en lancer une autre, il faut d'abord mettre en pause ou supprimer
                une transformation active.
              </p>
            </div>
          ) : null}

          {!loading && !error && cycle && !hasReachedLimit && remainingTransformations.length > 0 ? (
            <>
              {recommendedTransformation ? (
                <div className="mt-8 rounded-3xl border border-blue-200 bg-blue-50 p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-700">
                    Recommandation Sophia
                  </p>
                  <p className="mt-2 text-lg font-semibold text-stone-950">
                    {recommendedTransformation.title ||
                      `Transformation ${recommendedTransformation.priority_order}`}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-stone-600">
                    {getOnboardingSelectionContext(recommendedTransformation.handoff_payload) ||
                      recommendedTransformation.user_summary}
                  </p>
                </div>
              ) : null}

              <div className="mt-6 grid gap-3 lg:grid-cols-2">
                {remainingTransformations.map((item) => {
                  const isSelected = selectedTransformation?.id === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedTransformationId(item.id)}
                      className={`rounded-3xl border p-5 text-left transition ${
                        isSelected
                          ? "border-blue-300 bg-blue-50/60 shadow-sm"
                          : "border-stone-200 bg-white hover:border-blue-200"
                      }`}
                    >
                      <p className="text-base font-semibold text-stone-950">
                        {item.title || `Transformation ${item.priority_order}`}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-stone-600">
                        {getOnboardingSelectionContext(item.handoff_payload) || item.user_summary}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleContinue}
                  disabled={!selectedTransformation}
                  className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-blue-200 transition hover:bg-blue-700 disabled:opacity-60"
                >
                  Continuer avec cette transformation
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </>
          ) : null}

          {!loading && !error && cycle && !hasReachedLimit && remainingTransformations.length === 0 ? (
            <div className="mt-8 rounded-3xl border border-dashed border-stone-300 bg-stone-50 px-5 py-5">
              <p className="text-sm leading-6 text-stone-600">
                Aucune autre transformation prete a etre lancee dans ce cycle pour le moment.
              </p>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
