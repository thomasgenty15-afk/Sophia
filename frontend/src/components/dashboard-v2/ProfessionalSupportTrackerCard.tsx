import { useMemo, useState } from "react";
import { BriefcaseMedical, CheckCircle2, Clock3, Stethoscope, XCircle } from "lucide-react";

import {
  getProfessionalDefinition,
  getProfessionalSupportLevelLabel,
  getProfessionalSupportStatusLabel,
  getProfessionalSupportTimingLabel,
} from "../../lib/professionalSupport";
import { getDisplayPhaseOrder } from "../../lib/planPhases";
import { supabase } from "../../lib/supabase";
import type { UserProfessionalSupportRecommendationRow } from "../../types/v2";

type ProfessionalSupportTrackerCardProps = {
  recommendations: UserProfessionalSupportRecommendationRow[];
  currentLevelOrder: number | null;
  phase1Completed: boolean;
  onChanged: () => Promise<void>;
};

type ModalState =
  | {
      kind: "not_needed";
      recommendation: UserProfessionalSupportRecommendationRow;
    }
  | {
      kind: "completed";
      recommendation: UserProfessionalSupportRecommendationRow;
    }
  | null;

function shouldRevealRecommendation(
  recommendation: UserProfessionalSupportRecommendationRow,
  currentLevelOrder: number | null,
  phase1Completed: boolean,
) {
  if (recommendation.timing_kind === "now") return true;
  if (recommendation.timing_kind === "if_blocked") return true;
  if (recommendation.timing_kind === "after_phase1") return phase1Completed;
  if (recommendation.target_level_order == null || currentLevelOrder == null) {
    return phase1Completed;
  }
  if (recommendation.timing_kind === "before_next_level") {
    return currentLevelOrder + 1 >= recommendation.target_level_order;
  }
  return currentLevelOrder >= recommendation.target_level_order || phase1Completed;
}

export function ProfessionalSupportTrackerCard({
  recommendations,
  currentLevelOrder,
  phase1Completed,
  onChanged,
}: ProfessionalSupportTrackerCardProps) {
  const visibleRecommendations = useMemo(
    () =>
      recommendations.filter((recommendation) =>
        shouldRevealRecommendation(recommendation, currentLevelOrder, phase1Completed)
      ),
    [currentLevelOrder, phase1Completed, recommendations],
  );
  const [modalState, setModalState] = useState<ModalState>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notNeededReason, setNotNeededReason] = useState("already_supported");
  const [notNeededNote, setNotNeededNote] = useState("");
  const [completionAction, setCompletionAction] = useState<"booked" | "completed" | "already_followed">("completed");
  const [completionHelp, setCompletionHelp] = useState("");

  if (visibleRecommendations.length === 0) {
    return null;
  }

  async function handleSubmitModal() {
    if (!modalState || submitting) return;
    if (modalState.kind === "not_needed" && !notNeededReason.trim()) return;
    if (modalState.kind === "completed" && !completionHelp.trim()) return;

    setSubmitting(true);
    try {
      if (modalState.kind === "not_needed") {
        const { error: updateError } = await supabase
          .from("user_professional_support_recommendations")
          .update({
            status: "not_needed",
            updated_at: new Date().toISOString(),
          })
          .eq("id", modalState.recommendation.id);
        if (updateError) throw updateError;

        const { error: eventError } = await supabase
          .from("user_professional_support_events")
          .insert({
            recommendation_id: modalState.recommendation.id,
            user_id: modalState.recommendation.user_id,
            cycle_id: modalState.recommendation.cycle_id,
            transformation_id: modalState.recommendation.transformation_id,
            plan_id: modalState.recommendation.plan_id,
            event_type: "dismissed_not_needed",
            payload: {
              reason_key: notNeededReason,
              note: notNeededNote.trim() || null,
            },
          });
        if (eventError) throw eventError;
      } else {
        const nextStatus = completionAction === "booked" ? "booked" : "completed";
        const eventType = nextStatus === "booked"
          ? "marked_booked"
          : "marked_completed";

        const { error: updateError } = await supabase
          .from("user_professional_support_recommendations")
          .update({
            status: nextStatus,
            updated_at: new Date().toISOString(),
          })
          .eq("id", modalState.recommendation.id);
        if (updateError) throw updateError;

        const { error: eventError } = await supabase
          .from("user_professional_support_events")
          .insert({
            recommendation_id: modalState.recommendation.id,
            user_id: modalState.recommendation.user_id,
            cycle_id: modalState.recommendation.cycle_id,
            transformation_id: modalState.recommendation.transformation_id,
            plan_id: modalState.recommendation.plan_id,
            event_type: eventType,
            payload: {
              action: completionAction,
              help_text: completionHelp.trim(),
            },
          });
        if (eventError) throw eventError;
      }

      await onChanged();
      closeModal();
    } catch (error) {
      console.error("[ProfessionalSupportTrackerCard] submit failed", error);
    } finally {
      setSubmitting(false);
    }
  }

  function openModal(
    kind: NonNullable<ModalState>["kind"],
    recommendation: UserProfessionalSupportRecommendationRow,
  ) {
    setModalState({ kind, recommendation } as ModalState);
    setNotNeededReason("already_supported");
    setNotNeededNote("");
    setCompletionAction("completed");
    setCompletionHelp("");
  }

  function closeModal() {
    setModalState(null);
    setSubmitting(false);
  }

  return (
    <>
      <section className="rounded-[30px] border border-amber-200 bg-[linear-gradient(180deg,rgba(255,251,235,1),rgba(255,255,255,1))] px-5 py-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <BriefcaseMedical className="h-4 w-4 text-amber-700" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-800">
                Appui professionnel
              </p>
            </div>
            <h3 className="mt-3 text-2xl font-semibold text-stone-950">
              Si besoin, un appui externe peut t'aider a mieux tenir ce parcours
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-700">
              Ces recommandations ne font pas partie de ton plan d'execution. Elles servent a te dire
              qui peut t'aider, a quel moment du parcours, et a garder une trace de ce qui t'a aide ou non.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4">
          {visibleRecommendations.map((recommendation) => {
            const definition = getProfessionalDefinition(recommendation.professional_key);
            const displayLevelOrder = recommendation.target_level_order != null
              ? getDisplayPhaseOrder(recommendation.target_level_order)
              : null;
            const canMarkCompleted = recommendation.status === "pending" ||
              recommendation.status === "booked";

            return (
              <article
                key={recommendation.id}
                className="rounded-[26px] border border-white/80 bg-white/90 px-5 py-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Stethoscope className="h-4 w-4 text-amber-700" />
                      <h4 className="text-lg font-semibold text-stone-950">
                        {recommendation.priority_rank}. {definition.label}
                      </h4>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-stone-700">
                      {recommendation.reason}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-900">
                      {getProfessionalSupportLevelLabel(recommendation.recommendation_level)}
                    </span>
                    <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-[11px] font-semibold text-stone-700">
                      {getProfessionalSupportStatusLabel(recommendation.status)}
                    </span>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Clock3 className="h-4 w-4 text-stone-500" />
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                        Moment recommande
                      </p>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-stone-900">
                      {getProfessionalSupportTimingLabel(
                        recommendation.timing_kind,
                        displayLevelOrder,
                      )}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-stone-600">
                      {recommendation.timing_reason}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                      Ce que Sophia retient
                    </p>
                    <p className="mt-2 text-sm leading-6 text-stone-700">
                      {recommendation.summary ||
                        "Un appui externe cible peut rendre ce parcours plus simple a tenir."}
                    </p>
                  </div>
                </div>

                {recommendation.status === "completed" || recommendation.status === "not_needed" ? null : (
                  <div className="mt-4 flex flex-wrap gap-3">
                    {recommendation.status === "pending" ? (
                      <button
                        type="button"
                        onClick={() => openModal("not_needed", recommendation)}
                        className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-300 hover:text-stone-900"
                      >
                        <XCircle className="h-4 w-4" />
                        Je n'en ai pas besoin
                      </button>
                    ) : null}
                    {canMarkCompleted ? (
                      <button
                        type="button"
                        onClick={() => openModal("completed", recommendation)}
                        className="inline-flex items-center gap-2 rounded-full bg-amber-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-800"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        C'est fait
                      </button>
                    ) : null}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      {modalState ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 px-4">
          <div className="w-full max-w-lg rounded-[28px] border border-stone-200 bg-white p-6 shadow-2xl">
            <h4 className="text-xl font-semibold text-stone-950">
              {modalState.kind === "not_needed"
                ? "Pourquoi tu n'en as pas besoin ?"
                : "Comment ca t'a aide ?"}
            </h4>
            <p className="mt-2 text-sm leading-6 text-stone-600">
              {modalState.kind === "not_needed"
                ? "Ca nous aide a comprendre si cette recommandation etait mal timée, inutile, ou deja couverte."
                : "Le but est de comprendre ce qui a ete concretement utile pour toi."}
            </p>

            {modalState.kind === "not_needed" ? (
              <div className="mt-5 space-y-4">
                <label className="block">
                  <span className="text-sm font-semibold text-stone-900">
                    Raison principale
                  </span>
                  <select
                    value={notNeededReason}
                    onChange={(event) => setNotNeededReason(event.target.value)}
                    className="mt-2 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-stone-400"
                  >
                    <option value="already_supported">J'ai deja ce suivi</option>
                    <option value="not_useful">Je ne pense pas que ce soit utile</option>
                    <option value="not_the_right_moment">Ce n'est pas le bon moment</option>
                    <option value="prefer_other_way">Je prefere gerer autrement</option>
                    <option value="other">Autre</option>
                  </select>
                </label>

                <label className="block">
                  <span className="text-sm font-semibold text-stone-900">
                    Si tu veux, tu peux preciser
                  </span>
                  <textarea
                    value={notNeededNote}
                    onChange={(event) => setNotNeededNote(event.target.value)}
                    rows={4}
                    className="mt-2 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-stone-400"
                    placeholder="Exemple: j'ai deja un suivi regulier, ou je prefere d'abord voir comment se passe ce niveau."
                  />
                </label>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <label className="block">
                  <span className="text-sm font-semibold text-stone-900">
                    Tu as fait quoi exactement ?
                  </span>
                  <select
                    value={completionAction}
                    onChange={(event) =>
                      setCompletionAction(event.target.value as typeof completionAction)}
                    className="mt-2 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-stone-400"
                  >
                    <option value="completed">J'ai deja eu le rendez-vous</option>
                    <option value="booked">J'ai pris rendez-vous</option>
                    <option value="already_followed">Je suis deja suivi</option>
                  </select>
                </label>

                <label className="block">
                  <span className="text-sm font-semibold text-stone-900">
                    Comment ca t'a aide ?
                  </span>
                  <textarea
                    value={completionHelp}
                    onChange={(event) => setCompletionHelp(event.target.value)}
                    rows={4}
                    className="mt-2 w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition focus:border-stone-400"
                    placeholder="Exemple: ca m'a aide a clarifier quoi suivre, a mieux comprendre le probleme, ou a ajuster mon rythme."
                  />
                </label>
              </div>
            )}

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={closeModal}
                className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-300 hover:text-stone-900"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void handleSubmitModal()}
                disabled={submitting}
                className="rounded-full bg-stone-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? "Enregistrement..." : "Valider"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
