import { ArrowRight } from "lucide-react";

import { getPhase1MandatoryProgress, isPhase1DeepWhyComplete } from "../../lib/phase1";
import type { Phase1Payload } from "../../types/v2";

type Phase1FoundationCardProps = {
  phase1: Phase1Payload | null;
  onOpenInspiration: () => void;
};

function ChecklistRow({
  done,
  title,
  detail,
  onClick,
}: {
  done: boolean;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors hover:border-stone-300 hover:bg-white ${done ? "border-emerald-200 bg-emerald-50" : "border-stone-200 bg-stone-50"}`}
    >
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${done ? "bg-emerald-600 text-white" : "bg-stone-200 text-stone-600"}`}>
          {done ? "✓" : "•"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-stone-900">{title}</p>
          <p className="mt-1 text-sm leading-6 text-stone-600">{detail}</p>
        </div>
        <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-stone-400" />
      </div>
    </button>
  );
}

export function Phase1FoundationCard({
  phase1,
  onOpenInspiration,
}: Phase1FoundationCardProps) {
  const progress = getPhase1MandatoryProgress(phase1);
  const deepWhyComplete = isPhase1DeepWhyComplete(phase1);
  const progressPercent = Math.round((progress.completed / progress.total) * 100);
  const phase1Status = progress.completed >= progress.total
    ? "completed"
    : progress.completed > 0
    ? "in_progress"
    : "pending";

  return (
    <section className="rounded-[30px] border border-stone-200 bg-white px-5 py-5 shadow-[0_24px_80px_-52px_rgba(15,23,42,0.32)]">
      <div className="max-w-2xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">
            Niveau de plan 1
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-semibold text-stone-950">Construire ton socle</h2>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-amber-800">
              {phase1Status === "completed"
                ? "Socle installe"
                : phase1Status === "in_progress"
                ? "En cours"
                : "A lancer"}
            </span>
          </div>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Ici, Sophia t'aide a vraiment commencer: clarifier d'abord ton pourquoi profond, puis poser ton appui narratif avant d'entrer dans l'execution du plan.
          </p>
          <div className="mt-4 rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">
                Objectif du niveau de plan
              </p>
              <p className="text-sm font-semibold text-stone-900">
                {progress.completed} / {progress.total} modules completes
              </p>
            </div>
            <p className="mt-2 text-sm text-stone-600">
              Completer les 2 briques du socle.
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
              <div
                className="h-full rounded-full bg-stone-900 transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <ChecklistRow
          done={deepWhyComplete}
          title="Pourquoi profond complete"
          detail="Toutes les formulations cle sont remplies pour te rappeler ce qui compte quand l'elan baisse."
          onClick={onOpenInspiration}
        />
        <ChecklistRow
          done={Boolean(phase1?.runtime.story_viewed_or_validated)}
          title="Ton histoire consultee"
          detail="Une histoire courte et utile, nourrie par ton pourquoi profond, pour te reconnecter au sens du parcours."
          onClick={onOpenInspiration}
        />
      </div>
    </section>
  );
}
