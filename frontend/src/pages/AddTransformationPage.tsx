import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { TransformationFocusStep } from "../components/onboarding-v2/TransformationFocusStep";
import { useOnboardingAmbientAudio } from "../hooks/useOnboardingAmbientAudio";
import { useDashboardV2Data } from "../hooks/useDashboardV2Data";
import {
  createEmptyOnboardingV2Draft,
  persistOnboardingV2DraftLocally,
  type TransformationPreviewV2,
} from "../lib/onboardingV2";

type DashboardTransformationPreviewInput = {
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
};

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return ((error as { message: string }).message || fallback).trim() || fallback;
  }
  return fallback;
}

function toTransformationPreviewFromDashboard(
  transformation: DashboardTransformationPreviewInput,
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
    questionnaire_schema:
      (transformation.questionnaire_schema as TransformationPreviewV2["questionnaire_schema"]) ??
      null,
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
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"continue" | "reprioritize" | null>(null);

  const activeTransformations = useMemo(
    () => transformations.filter((item) => item.status === "active"),
    [transformations],
  );
  const remainingTransformations = useMemo(
    () => transformations.filter((item) => item.status === "ready" || item.status === "pending"),
    [transformations],
  );
  const remainingTransformationPreviews = useMemo(
    () =>
      remainingTransformations.map((item) =>
        toTransformationPreviewFromDashboard(item as DashboardTransformationPreviewInput)
      ),
    [remainingTransformations],
  );
  const recommendedTransformation = nextTransformation ?? remainingTransformations[0] ?? null;
  const hasReachedLimit = activeTransformations.length >= 2;

  function buildDraftTransformations(nextTransformations: TransformationPreviewV2[]) {
    return nextTransformations.map((item, index) => ({
      ...item,
      cycle_id: cycle?.id ?? item.cycle_id,
      priority_order: index + 1,
    }));
  }

  async function handleContinue(payload: {
    selectedTransformationId: string;
    transformations: TransformationPreviewV2[];
  }) {
    if (!cycle) return;

    setActionError(null);
    setBusyAction("continue");

    try {
      const draftTransformations = buildDraftTransformations(payload.transformations);
      const selectedTransformation = draftTransformations.find((item) =>
        item.id === payload.selectedTransformationId
      );

      if (!selectedTransformation) {
        throw new Error("Transformation introuvable.");
      }

      const baseDraft = createEmptyOnboardingV2Draft();

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
        transformations: draftTransformations,
        active_transformation_id: selectedTransformation.id,
        questionnaire_schema: selectedTransformation.questionnaire_schema ?? null,
        questionnaire_answers: selectedTransformation.questionnaire_answers ?? {},
        plan_review: null,
        roadmap_transition: null,
      });

      startSession();
      navigate("/onboarding-v2");
    } catch (submitError) {
      setActionError(
        getErrorMessage(
          submitError,
          "Impossible de préparer cette transformation pour le moment.",
        ),
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleOtherPriority(params: {
    selectedTransformationId: string | null;
    transformations: TransformationPreviewV2[];
  }) {
    if (!cycle) return;

    setActionError(null);
    setBusyAction("reprioritize");

    try {
      const draftTransformations = buildDraftTransformations(params.transformations);
      const baseDraft = createEmptyOnboardingV2Draft();

      persistOnboardingV2DraftLocally({
        ...baseDraft,
        entry_mode: "add_transformation",
        preserved_active_transformation_id: activeTransformation?.id ?? null,
        cycle_id: cycle.id,
        cycle_status: cycle.status,
        stage: "capture",
        raw_intake_text: "",
        transformations: draftTransformations,
        active_transformation_id: null,
        questionnaire_schema: null,
        questionnaire_answers: {},
        plan_review: null,
        roadmap_transition: null,
      });

      startSession();
      navigate("/onboarding-v2");
    } catch (submitError) {
      setActionError(
        getErrorMessage(
          submitError,
          "Impossible de préparer la réanalyse du cycle pour le moment.",
        ),
      );
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="min-h-screen bg-stone-50 px-4 py-6 md:px-6 md:py-10">
      <div className="mx-auto w-full max-w-5xl">
        {loading ? (
          <div className="mt-8 flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-4 text-sm text-stone-600 shadow-sm">
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
            Chargement des transformations...
          </div>
        ) : null}

        {!loading && error ? (
          <div className="mt-8 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-800">
            {error}
          </div>
        ) : null}

        {!loading && actionError ? (
          <div className="mt-8 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-800">
            {actionError}
          </div>
        ) : null}

        {!loading && !error && hasIncompleteCycle && !cycle ? (
          <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-5 text-sm text-amber-950">
            Un onboarding est deja en cours. Termine-le avant de relancer une transformation.
          </div>
        ) : null}

        {!loading && !error && cycle && hasReachedLimit ? (
          <div className="mt-8 rounded-3xl border border-amber-200 bg-amber-50 px-5 py-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-800">
              Limite atteinte
            </p>
            <h2 className="mt-2 text-xl font-semibold text-stone-950">
              Tu es limite a 2 transformations actives en parallele
            </h2>
            <p className="mt-3 text-sm leading-6 text-stone-700">
              Si tu veux en lancer une autre, il faut d'abord mettre fin a l'une des
              transformations actives.
            </p>
          </div>
        ) : null}

        {!loading && !error && cycle && !hasReachedLimit && remainingTransformationPreviews.length > 0 ? (
          <div className="mt-6">
            <TransformationFocusStep
              key={remainingTransformationPreviews.map((item) => item.id).join(",")}
              transformations={remainingTransformationPreviews}
              initialSelectedId={recommendedTransformation?.id ?? remainingTransformationPreviews[0]?.id ?? null}
              onConfirm={(payload) => void handleContinue(payload)}
              isSubmitting={busyAction !== null}
              badgeLabel="Suite du cycle"
              title="Choisir la prochaine transformation a lancer"
              description="Tu peux garder la transformation recommandee, en choisir une autre, retirer celles que tu ne veux plus garder dans la suite du cycle, ou repartir d'un texte libre si un autre sujet doit passer devant."
              primaryActionLabel="Continuer avec cette transformation"
              allowManualAdd={false}
              alternateActionLabel="J'ai un autre sujet que je souhaite aborder en priorité"
              alternateActionDescription="Sophia repartira du cycle actuel, relira les transformations deja connues, evitera les doublons et integrera ce que tu ajoutes dans un nouveau texte libre."
              onAlternateAction={(payload) => void handleOtherPriority(payload)}
            />
          </div>
        ) : null}

        {!loading && !error && cycle && !hasReachedLimit && remainingTransformationPreviews.length === 0 ? (
          <section className="mt-6 rounded-[32px] border border-stone-200 bg-white p-6 shadow-[0_24px_80px_-52px_rgba(15,23,42,0.32)] md:p-8">
            <div className="max-w-3xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                Suite du cycle
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-stone-950 md:text-4xl">
                Aucun autre sujet n'est encore pret a etre lance
              </h1>
              <p className="mt-3 text-sm leading-6 text-stone-600 md:text-base">
                Si un autre besoin doit maintenant passer en priorite, tu peux repartir d'un
                texte libre. Sophia reanalysiera la suite du cycle sans repartir de zero.
              </p>
            </div>

            <div className="mt-6">
              <button
                type="button"
                onClick={() =>
                  void handleOtherPriority({
                    selectedTransformationId: null,
                    transformations: [],
                  })}
                disabled={busyAction !== null}
                className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm font-semibold text-stone-700 transition hover:border-blue-200 hover:bg-white hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                J'ai un autre sujet que je souhaite aborder en priorité
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
