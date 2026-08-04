import { ArrowRight, Compass, Flag, SplitSquareVertical } from "lucide-react";

import type { RoadmapTransitionDraft } from "../../lib/onboardingV2";

type RoadmapTransitionProps = {
  value: RoadmapTransitionDraft;
  onContinue: () => void;
};

function formatDurationLabel(value: number | null): string {
  if (value == null || value <= 0) return "Durée à préciser";
  return value === 1 ? "~1 mois" : `~${value} mois`;
}

export function RoadmapTransition({
  value,
  onContinue,
}: RoadmapTransitionProps) {
  const totalParts = value.journey_context.estimated_total_parts ?? value.journey_context.parts.length;
  const currentPart = value.journey_context.part_number ?? 1;

  return (
    <section className="mx-auto w-full max-w-3xl">
      <div className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm md:p-8">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-amber-50 px-4 py-2 text-xs font-bold uppercase tracking-wide text-amber-700">
          <SplitSquareVertical className="h-3.5 w-3.5" />
          Parcours affiné
        </div>

        <h1 className="font-serif text-3xl font-bold tracking-tight text-gray-900 md:text-4xl">
          Ton parcours a été affiné
        </h1>
        <p className="mt-3 text-base leading-relaxed text-gray-600">
          D’après tes réponses, {value.transformation_title ?? "cette transformation"} est un parcours
          en {totalParts} étapes. Voici le plan mis à jour :
        </p>

        <div className="mt-6 rounded-[1.5rem] border border-amber-100 bg-amber-50 p-4 text-sm text-amber-950">
          <div className="flex items-center gap-2 font-semibold">
            <Flag className="h-4 w-4" />
            Partie {currentPart} sur {totalParts} — {formatDurationLabel(value.current_part_duration_months)}
          </div>
          {value.journey_context.continuation_hint && (
            <p className="mt-2 leading-relaxed text-amber-900">
              Suite prévue : {value.journey_context.continuation_hint}
            </p>
          )}
        </div>

        <div className="mt-6 space-y-3">
          {value.journey_context.parts.map((part) => {
            const isCurrent = part.part_number === currentPart;
            return (
              <div
                key={part.transformation_id}
                className={`rounded-xl border p-4 ${
                  isCurrent
                    ? "border-blue-200 bg-blue-50/50"
                    : "border-gray-200 bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Partie {part.part_number}
                    </p>
                    <h2 className="mt-1 text-lg font-semibold text-gray-900">
                      {part.title ?? "Transformation à venir"}
                    </h2>
                  </div>
                  <div className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
                    {formatDurationLabel(part.estimated_duration_months)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-8 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-gray-800">
            <Compass className="h-4 w-4" />
            On démarre avec la première tranche, puis Sophia préparera la suite au bon moment.
          </p>
        </div>

        <button
          type="button"
          onClick={onContinue}
          className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-4 text-base font-bold text-white shadow-md shadow-blue-200 transition hover:bg-blue-700"
        >
          C&apos;est parti
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}
