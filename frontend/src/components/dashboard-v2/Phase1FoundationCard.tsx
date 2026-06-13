import { ArrowRight, ChevronDown, Layers3 } from "lucide-react";

import { getPhase1MandatoryProgress, isPhase1DeepWhyComplete } from "../../lib/phase1";
import type { Phase1Payload } from "../../types/v2";

type Phase1FoundationCardProps = {
  phase1: Phase1Payload | null;
  onOpenDeepWhy: () => void;
  onOpenStory: () => void;
};

function ChecklistRow({
  index,
  done,
  title,
  detail,
  onClick,
}: {
  index: number;
  done: boolean;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors hover:border-stone-300 hover:bg-white ${done ? "border-emerald-200 bg-emerald-50" : "border-amber-100 bg-white"}`}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${done ? "bg-emerald-600 text-white" : "border border-amber-200 bg-amber-50 text-amber-900"}`}>
          {done ? "✓" : index}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-stone-900">{title}</p>
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${done ? "bg-emerald-100 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
              {done ? "Fait" : "A faire"}
            </span>
          </div>
          <p className="mt-1 text-sm leading-6 text-stone-600">{detail}</p>
        </div>
        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-stone-400" />
      </div>
    </button>
  );
}

export function Phase1FoundationCard({
  phase1,
  onOpenDeepWhy,
  onOpenStory,
}: Phase1FoundationCardProps) {
  const progress = getPhase1MandatoryProgress(phase1);
  const deepWhyComplete = isPhase1DeepWhyComplete(phase1);
  const storyViewed = Boolean(phase1?.runtime.story_viewed_or_validated);
  const progressPercent = Math.round((progress.completed / progress.total) * 100);
  const renderChecklist = () => (
    <div className="grid gap-3 md:grid-cols-2">
      <ChecklistRow
        index={1}
        done={deepWhyComplete}
        title={deepWhyComplete ? "Pourquoi profond complete" : "Faire ton pourquoi profond"}
        detail="Les mots qui te rappellent ce que tu veux proteger, retrouver et ne plus laisser t'echapper."
        onClick={onOpenDeepWhy}
      />
      <ChecklistRow
        index={2}
        done={storyViewed}
        title={storyViewed ? "Ton histoire consultee" : "Consulter ton histoire"}
        detail="Une histoire a relire quand tu as besoin de retrouver de la force et du sens."
        onClick={onOpenStory}
      />
    </div>
  );

  return (
    <section className="min-w-0 max-w-full rounded-[14px] border border-stone-200/80 bg-white/90 px-3 py-2 shadow-sm sm:rounded-[30px] sm:border-stone-200 sm:bg-white sm:px-5 sm:py-5 sm:shadow-[0_24px_80px_-52px_rgba(15,23,42,0.32)]">
      <details className="group sm:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-[12px] outline-none focus-visible:ring-2 focus-visible:ring-stone-300 focus-visible:ring-offset-2">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <Layers3 className="h-3.5 w-3.5 shrink-0 text-stone-400" />
            <div className="min-w-0">
              <p className="min-w-0 truncate text-[9px] font-semibold uppercase tracking-[0.16em] text-stone-500">
                Niveau de plan 1
              </p>
              <h2 className="mt-0.5 min-w-0 truncate text-[13px] font-semibold text-stone-950">
                Construire ton socle
              </h2>
            </div>
          </div>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-stone-500 transition-transform group-open:rotate-180" />
        </summary>

        <div className="mt-4 border-t border-stone-100 pt-4">
          <p className="text-sm leading-6 text-stone-600">
            Ici, tu reviens a ce qui te guide quand ca tangue: ton pourquoi profond, ton histoire,
            et les reperes qui remettent du sens sur le chemin.
          </p>
          <div className="mt-4 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                Objectif du niveau de plan
              </p>
              <p className="text-sm font-semibold text-stone-900">
                {progress.completed} / {progress.total} etapes faites
              </p>
            </div>
            <p className="mt-2 text-sm text-stone-600">
              Ces deux reperes restent disponibles quand tu veux avancer sur ton socle.
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
              <div
                className="h-full rounded-full bg-stone-900 transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
          <div className="mt-4">{renderChecklist()}</div>
        </div>
      </details>

      <div className="hidden sm:block">
        <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">
            Niveau de plan 1
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-semibold text-stone-950">Construire ton socle</h2>
          </div>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Ici, tu reviens a ce qui te guide quand ca tangue: ton pourquoi profond, ton histoire,
            et les reperes qui remettent du sens sur le chemin.
          </p>
          <div className="mt-4 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                Objectif du niveau de plan
              </p>
              <p className="text-sm font-semibold text-stone-900">
                {progress.completed} / {progress.total} etapes faites
              </p>
            </div>
            <p className="mt-2 text-sm text-stone-600">
              Ces deux reperes restent disponibles quand tu veux avancer sur ton socle.
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
              <div
                className="h-full rounded-full bg-stone-900 transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>

        <div className="mt-5">{renderChecklist()}</div>
      </div>
    </section>
  );
}
