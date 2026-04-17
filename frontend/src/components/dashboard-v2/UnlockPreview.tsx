import { LockKeyhole, Sparkles } from "lucide-react";

import type { DashboardV2UnlockPreview } from "../../hooks/useDashboardV2Logic";

type UnlockPreviewProps = {
  preview: DashboardV2UnlockPreview | null;
};

export function UnlockPreview({
  preview,
}: UnlockPreviewProps) {
  if (!preview) {
    return (
      <section className="rounded-[30px] border border-stone-200 bg-white px-5 py-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">
          Anticipation
        </p>
        <p className="mt-3 text-sm leading-6 text-stone-600">
          Aucun autre élément n'attend d'être débloqué pour le moment.
        </p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-[30px] border border-stone-200 bg-[linear-gradient(155deg,#151515_0%,#2a2723_48%,#7c5c2f_100%)] px-5 py-5 text-stone-50 shadow-[0_30px_90px_-54px_rgba(0,0,0,0.8)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-300">
            Bientôt disponible
          </p>
          <h3 className="mt-2 text-2xl font-semibold">{preview.item.title}</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-200">
            {preview.reason}
          </p>
        </div>
        <div className="rounded-full bg-white/10 p-2">
          {preview.isReady ? (
            <Sparkles className="h-5 w-5 text-amber-300" />
          ) : (
            <LockKeyhole className="h-5 w-5 text-stone-200" />
          )}
        </div>
      </div>

      {preview.item.description ? (
        <p className="mt-4 text-sm leading-6 text-stone-200/90">
          {preview.item.description}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-stone-100">
          {preview.item.dimension}
        </span>
        <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-stone-100">
          {preview.item.kind}
        </span>
        {preview.remainingCount != null && preview.remainingCount > 0 ? (
          <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-stone-100">
            reste {preview.remainingCount}
          </span>
        ) : null}
      </div>

      {preview.isReady ? (
        <p className="mt-5 text-sm font-semibold text-amber-200">
          Sophia le debloque automatiquement des que la place se libere dans le plan.
        </p>
      ) : null}
    </section>
  );
}
