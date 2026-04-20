import {
  ChevronDown,
  Check,
  Compass,
  FileText,
  Flag,
  Loader2,
  Lock,
  PenLine,
  Repeat,
  ShieldAlert,
  Target,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { DashboardV2PlanItemRuntime } from "../../hooks/useDashboardV2Data";
import { getClarificationExerciseDetails } from "../../lib/clarificationExercises";
import { buildPlanItemMetaLabel } from "../../lib/planItemTiming";
import type { PlanWeekCalendar } from "../../lib/planSchedule";
import {
  resolveAttackPreview,
  resolveDefensePreview,
} from "../../lib/actionCardsPreview";
import type { DashboardV2UnlockState } from "../../hooks/useDashboardV2Logic";
import { ClarificationExerciseModal } from "./ClarificationExerciseModal";
import { HabitWeekModal } from "./HabitWeekModal";

type PlanItemCardProps = {
  item: DashboardV2PlanItemRuntime;
  weekCalendar?: PlanWeekCalendar | null;
  weekStatus?: "completed" | "current" | "upcoming" | null;
  weekOrder?: number | null;
  recommendedDays?: string[] | null;
  onOpenWeekPlanning?: (() => void) | null;
  unlockState?: DashboardV2UnlockState | null;
  isBusy: boolean;
  onComplete: (item: DashboardV2PlanItemRuntime) => void;
  onActivate: (item: DashboardV2PlanItemRuntime) => void;
  onPrepareCards: (item: DashboardV2PlanItemRuntime) => void;
  onOpenDefenseResourceEditor: (item: DashboardV2PlanItemRuntime) => void;
  onBlocker: (item: DashboardV2PlanItemRuntime) => void;
  onDeactivate: (item: DashboardV2PlanItemRuntime) => void;
  onRemove: (item: DashboardV2PlanItemRuntime) => void;
  onAdapt: (item: DashboardV2PlanItemRuntime) => void;
};

function labelFromKind(item: DashboardV2PlanItemRuntime) {
  if (item.kind === "milestone") return "Validation";
  if (item.dimension === "clarifications" || item.dimension === "support") {
    return item.kind === "framework" ? "Clarification" : "Exercice de clarification";
  }
  if (item.dimension === "habits") return "Habitude";
  if (item.dimension === "missions") return "Mission";
  return "Action";
}

function renderIcon(item: DashboardV2PlanItemRuntime, className: string) {
  if (item.dimension === "clarifications" || item.dimension === "support") {
    return <Compass className={className} />;
  }
  if (item.kind === "milestone") return <Flag className={className} />;
  if (item.dimension === "missions") return <Target className={className} />;
  if (item.status === "stalled") return <ShieldAlert className={className} />;
  return <Repeat className={className} />;
}

export function PlanItemCard({
  item,
  weekCalendar,
  weekStatus = null,
  weekOrder = null,
  recommendedDays,
  onOpenWeekPlanning,
  unlockState,
  isBusy,
  onComplete,
  onPrepareCards,
  onOpenDefenseResourceEditor,
}: PlanItemCardProps) {
  const [exerciseOpen, setExerciseOpen] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [descriptionOverflowing, setDescriptionOverflowing] = useState(false);
  const [cardsInfoExpanded, setCardsInfoExpanded] = useState(false);
  const [habitModalOpen, setHabitModalOpen] = useState(false);
  const descriptionRef = useRef<HTMLParagraphElement | null>(null);
  const targetReps = item.target_reps ?? (item.dimension === "habits" ? 5 : null);
  const currentReps = item.current_reps ?? 0;
  const progressPercent = targetReps
    ? Math.min(Math.round((currentReps / targetReps) * 100), 100)
    : null;
  const scheduleLabel = item.scheduled_days?.length
    ? item.scheduled_days.join(" • ").toUpperCase()
    : item.cadence_label;
  const metaLabel = buildPlanItemMetaLabel({
    item,
    weekCalendar,
    preferredDays: recommendedDays,
    kindLabel: labelFromKind(item),
  });
  const finalMetaLabel = !metaLabel && scheduleLabel
    ? `${labelFromKind(item)} • ${scheduleLabel}`
    : metaLabel || labelFromKind(item);

  const isPending = item.status === "pending";
  const isCompleted = item.status === "completed" || item.status === "in_maintenance";
  const isStalled = item.status === "stalled";
  const isHabit = item.dimension === "habits";
  const isMission = item.dimension === "missions";
  const isClarification =
    item.dimension === "clarifications" || item.dimension === "support";
  const isMilestone = item.kind === "milestone";
  const clarificationDetails = isClarification
    ? getClarificationExerciseDetails(item.payload)
    : null;
  const cardsRequired = item.cards_required;
  const cardsStatus = item.cards_status ?? (cardsRequired ? "not_started" : "not_required");
  const cardsReady = Boolean(item.linked_defense_card && item.linked_attack_card);
  const defensePreview = resolveDefensePreview(item.linked_defense_card);
  const attackPreview = resolveAttackPreview(item.linked_attack_card);
  const showPendingLock = isPending && !unlockState?.isReady;
  const futureWeekLocked = weekStatus === "upcoming";
  const futureWeekLabel = weekOrder != null
    ? `Disponible semaine ${weekOrder}`
    : "Disponible pendant sa semaine";
  const canPrepareCards = !isPending && cardsRequired && !cardsReady;
  useEffect(() => {
    if (descriptionExpanded) return;
    const element = descriptionRef.current;
    if (!element) return;

    const measure = () => {
      setDescriptionOverflowing(element.scrollHeight > element.clientHeight + 1);
    };

    measure();

    if (typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      measure();
    });
    observer.observe(element);

    return () => observer.disconnect();
  }, [descriptionExpanded, item.description]);

  return (
    <article
      className={`group relative rounded-2xl border p-4 transition-all bg-white shadow-sm flex flex-col h-full ${
        isPending
          ? "border-stone-200 bg-stone-50/80"
          : isHabit
          ? "border-stone-200 hover:border-emerald-200 hover:shadow-md"
          : isMission
          ? "border-stone-200 hover:border-amber-200 hover:shadow-md"
          : isClarification
          ? "border-stone-200 hover:border-sky-200 hover:shadow-md"
          : "border-stone-200 hover:border-sky-200 hover:shadow-md"
        }`}
    >
      {/* Top row: Status */}
      <div className="mb-3 flex items-start justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {isStalled && (
            <span className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold bg-rose-50 text-rose-700">
              <ShieldAlert className="w-3 h-3" /> Besoin d'aide
            </span>
          )}
          {isPending ? (
            <span className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold bg-stone-100 text-stone-600">
              <Lock className="w-3 h-3" />
              {unlockState?.isReady ? "Deblocage automatique" : "En attente"}
            </span>
          ) : null}
        </div>
      </div>

      {/* Title & Description */}
      <div className="mb-2 flex items-center gap-2">
        <div
          className={`rounded-lg p-1.5 ${
            isMilestone
              ? "bg-blue-50 text-blue-700"
              : isHabit
              ? "bg-emerald-50 text-emerald-700"
              : isMission
              ? "bg-amber-50 text-amber-700"
              : "bg-sky-50 text-sky-700"
          }`}
        >
          {renderIcon(item, "w-3.5 h-3.5")}
        </div>
        <p className="text-[10px] font-semibold uppercase leading-4 tracking-[0.16em] text-stone-500">
          {finalMetaLabel}
        </p>
      </div>
      <h3
        className={`mb-2 text-sm font-bold leading-5 ${
          isPending ? "text-stone-500" : "text-stone-900"
        }`}
      >
        {item.title}
      </h3>
      {item.description && (
        <div className="mb-4">
          <p
            ref={descriptionRef}
            className={`text-xs text-stone-500 leading-relaxed ${
              descriptionExpanded ? "" : "line-clamp-2"
            }`}
          >
            {item.description}
          </p>
          {descriptionOverflowing ? (
            <button
              type="button"
              onClick={() => setDescriptionExpanded((value) => !value)}
              className="mt-1.5 text-[11px] font-semibold text-stone-500 transition-colors hover:text-stone-800"
            >
              {descriptionExpanded ? "Voir moins" : "Voir plus"}
            </button>
          ) : null}
        </div>
      )}
      {clarificationDetails ? (
        <div className="mb-3 rounded-xl border border-sky-100 bg-sky-50/70 px-3 py-2.5">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-700">
            <FileText className="h-3 w-3" />
            {clarificationDetails.type === "recurring" ? "Exercice structure" : "Fiche guidee"}
            <span className="text-sky-600">• {clarificationDetails.sections.length} champs guides</span>
          </div>
          <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-sky-950">
            {clarificationDetails.intro}
          </p>
        </div>
      ) : null}

      {showPendingLock ? (
        <div className="mb-3 rounded-2xl border border-stone-200 bg-white px-3 py-3">
          <div className="flex items-start gap-2">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-stone-500" />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">
                Deblocage automatique
              </p>
              <p className="mt-1 text-xs leading-5 text-stone-700">
                {unlockState?.reason || "Cet element deviendra disponible automatiquement quand les prerequis seront valides."}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {!isPending && cardsRequired && (cardsStatus === "ready" || cardsReady) ? (
        <div className="mb-3 space-y-2">
          {defensePreview ? (
            <details className="rounded-2xl border border-emerald-100 bg-emerald-50/70 px-3 py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                    Carte de defense
                  </p>
                  <p className="mt-1 text-xs font-semibold text-stone-900">
                    {defensePreview.title}
                  </p>
                </div>
                <ChevronDown className="h-4 w-4 shrink-0 text-emerald-700" />
              </summary>
              <div className="mt-3 border-t border-emerald-100/80 pt-3">
                <div className="mb-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => onOpenDefenseResourceEditor(item)}
                    aria-label="Modifier cette carte dans Ressources"
                    title="Modifier dans Ressources"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-emerald-200 bg-white text-emerald-700 transition hover:bg-emerald-50"
                  >
                    <PenLine className="h-3 w-3" />
                  </button>
                </div>
                <p className="text-xs font-semibold text-stone-900">
                  Le moment: {defensePreview.moment}
                </p>
                <p className="mt-1 text-xs leading-5 text-stone-700">
                  Le piege: {defensePreview.trap}
                </p>
                <p className="mt-1 text-xs leading-5 text-emerald-950">
                  Mon geste: {defensePreview.move}
                </p>
                {defensePreview.planB ? (
                  <p className="mt-1 text-xs leading-5 text-stone-600">
                    Plan B: {defensePreview.planB}
                  </p>
                ) : null}
              </div>
            </details>
          ) : null}
          {attackPreview ? (
            <details className="rounded-2xl border border-amber-100 bg-amber-50/70 px-3 py-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                    Carte d'attaque
                  </p>
                  <p className="mt-1 text-xs font-semibold text-stone-900">
                    {attackPreview.title}
                  </p>
                </div>
                <ChevronDown className="h-4 w-4 shrink-0 text-amber-700" />
              </summary>
              <div className="mt-3 border-t border-amber-100/80 pt-3">
                {attackPreview.title !== attackPreview.techniqueTitle ? (
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-amber-700">
                    Technique: {attackPreview.techniqueTitle}
                  </p>
                ) : null}
                <p className="mt-1 text-xs leading-5 text-stone-700">
                  {attackPreview.generatedAsset ?? attackPreview.summary}
                </p>
                <p className="mt-1 text-xs leading-5 text-stone-600">
                  Mode d'emploi: {attackPreview.modeEmploi}
                </p>
              </div>
            </details>
          ) : null}
        </div>
      ) : null}

      {canPrepareCards && !futureWeekLocked ? (
        <div className={`mb-3 rounded-2xl border px-3 py-3 ${
          cardsStatus === "failed"
            ? "border-rose-200 bg-rose-50"
            : "border-amber-200/80 bg-amber-50/70"
        }`}>
          <div className="flex items-center justify-between gap-3">
            <p className={`truncate text-xs font-semibold ${
              cardsStatus === "failed" ? "text-rose-700" : "text-amber-900/80"
            }`}>
              Ressources
            </p>
            <button
              type="button"
              onClick={() => setCardsInfoExpanded((value) => !value)}
              className={`inline-flex items-center gap-1 text-[11px] font-medium transition-colors ${
                cardsStatus === "failed"
                  ? "text-rose-700 hover:text-rose-900"
                  : "text-amber-900/60 hover:text-amber-900"
              }`}
            >
              {cardsInfoExpanded ? "Voir moins" : "Voir plus"}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${
                  cardsInfoExpanded ? "rotate-180" : ""
                }`}
              />
            </button>
          </div>

          {cardsInfoExpanded ? (
            <div className="mt-3 border-t border-white/80 pt-3">
              <p className={`text-xs leading-5 ${
                cardsStatus === "failed" ? "text-rose-900" : "text-amber-950/80"
              }`}>
                {cardsStatus === "failed"
                  ? "La preparation des cartes a echoue. Tu peux relancer la creation pour cette action."
                  : "Tu peux faire cette action sans cartes. Si tu veux un appui en plus, Sophia peut te preparer une carte de defense et une carte d'attaque."}
              </p>
              <button
                type="button"
                onClick={() => onPrepareCards(item)}
                disabled={isBusy}
                className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white px-3 py-2 text-xs font-semibold text-stone-900 transition hover:bg-amber-50 disabled:cursor-wait disabled:opacity-70"
              >
                {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {cardsStatus === "failed" ? "Relancer" : "Generer"}
              </button>
            </div>
          ) : null}
          {isBusy && !cardsInfoExpanded ? (
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-900/60">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>{cardsStatus === "failed" ? "Relance..." : "Generation..."}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Progress / Actions */}
      <div className="mt-auto pt-2">
        {targetReps && isHabit && !isCompleted && (
          <div className="mb-3">
            <div className="flex justify-between text-[11px] font-bold mb-1">
              <span className="text-emerald-700">Ancrage</span>
              <span className="text-emerald-600">
                {currentReps} / {targetReps}
              </span>
            </div>
            <div className="h-1.5 w-full bg-emerald-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-500 ease-out rounded-full"
                style={{ width: `${progressPercent ?? 0}%` }}
              />
            </div>
          </div>
        )}

        {!isPending && (
          <div>
            {isCompleted ? (
              <div className="flex items-center gap-2 text-emerald-700 font-bold text-sm bg-emerald-50 px-3 py-2.5 rounded-xl border border-emerald-100">
                <Check className="w-4 h-4" />
                {item.status === "completed" ? "Terminé" : "En maintien"}
              </div>
            ) : futureWeekLocked ? (
              <button
                type="button"
                disabled
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-stone-50 text-stone-400 text-sm font-bold border border-stone-200 cursor-not-allowed disabled:opacity-100"
              >
                <Lock className="w-4 h-4" />
                {futureWeekLabel}
              </button>
            ) : isMission ? (
              <button
                type="button"
                onClick={() => onComplete(item)}
                disabled={isBusy}
                className="w-full flex items-center justify-between p-2.5 rounded-xl bg-stone-50 hover:bg-amber-50 text-stone-600 hover:text-amber-700 text-sm font-bold transition-colors border border-stone-100 hover:border-amber-200 disabled:opacity-70"
              >
                <span>Marquer comme fait</span>
                <div className="w-5 h-5 rounded border border-stone-300 bg-white flex items-center justify-center">
                  <Check className="w-3 h-3 text-transparent" />
                </div>
              </button>
            ) : isHabit ? (
              <button
                type="button"
                onClick={() => setHabitModalOpen(true)}
                disabled={isBusy}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-stone-50 hover:bg-emerald-50 text-stone-600 hover:text-emerald-700 text-sm font-bold transition-colors border border-stone-100 hover:border-emerald-200 disabled:opacity-70"
              >
                <Check className="w-4 h-4" /> Valider
              </button>
            ) : isClarification && clarificationDetails ? (
              <button
                type="button"
                onClick={() => setExerciseOpen(true)}
                disabled={isBusy}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-stone-50 hover:bg-sky-50 text-stone-600 hover:text-sky-700 text-sm font-bold transition-colors border border-stone-100 hover:border-sky-200 disabled:opacity-70"
              >
                <FileText className="w-4 h-4" />
                {item.target_reps && item.target_reps > 1
                  ? "Ouvrir l'exercice"
                  : "Ouvrir la fiche"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onComplete(item)}
                disabled={isBusy}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-stone-50 hover:bg-sky-50 text-stone-600 hover:text-sky-700 text-sm font-bold transition-colors border border-stone-100 hover:border-sky-200 disabled:opacity-70"
              >
                <Check className="w-4 h-4" />
                {item.target_reps && item.target_reps > 1
                  ? "J'ai utilisé l'outil"
                  : "Marquer utilisé"}
              </button>
            )}
          </div>
        )}
      </div>

      {clarificationDetails ? (
        <ClarificationExerciseModal
          item={item}
          isOpen={exerciseOpen}
          onClose={() => setExerciseOpen(false)}
          onSaved={async () => {
            await onComplete(item);
          }}
        />
      ) : null}

      {isHabit ? (
        <HabitWeekModal
          item={item}
          weekCalendar={weekCalendar}
          isOpen={habitModalOpen}
          onClose={() => setHabitModalOpen(false)}
          onOpenWeekPlanning={onOpenWeekPlanning}
          onHabitDone={async () => {
            await onComplete(item);
          }}
        />
      ) : null}
    </article>
  );
}
