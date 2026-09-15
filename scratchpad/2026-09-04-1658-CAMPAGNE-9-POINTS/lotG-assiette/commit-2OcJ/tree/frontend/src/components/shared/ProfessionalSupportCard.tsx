import { useState } from "react";
import { BriefcaseMedical, ChevronDown, Stethoscope } from "lucide-react";

import {
  getProfessionalDefinition,
  getProfessionalSupportLevelLabel,
} from "../../lib/professionalSupport";
import type { ProfessionalSupportV1 } from "../../types/v2";

type ProfessionalSupportCardProps = {
  support: ProfessionalSupportV1 | null;
  compact?: boolean;
};

export function ProfessionalSupportCard({
  support,
  compact = false,
}: ProfessionalSupportCardProps) {
  const [expanded, setExpanded] = useState(false);

  if (!support?.should_recommend || support.recommendations.length === 0) {
    return null;
  }

  if (compact) {
    return (
      <section className="mt-4">
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50/70 px-4 py-2 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-100/80"
        >
          <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
          {expanded ? "Masquer l'appui professionnel" : "Un professionnel peut aider"}
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}
          />
        </button>

        {expanded ? (
          <div className="mt-4 animate-in fade-in slide-in-from-top-2 rounded-2xl border border-amber-200 bg-[linear-gradient(180deg,rgba(255,251,235,1),rgba(255,255,255,1))] px-5 py-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <BriefcaseMedical className="h-4 w-4 text-amber-700" />
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-800">
                    Un professionnel peut aider
                  </p>
                </div>
                <p className="mt-2 text-sm leading-6 text-stone-700">
                  {support.summary ||
                    "Sur cette transformation, un appui externe ciblé peut rendre le changement plus simple à tenir."}
                </p>
              </div>
              <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-100/80 px-3 py-1 text-[11px] font-semibold text-amber-900">
                {getProfessionalSupportLevelLabel(support.recommendation_level)}
              </span>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {support.recommendations.map((recommendation) => {
                const definition = getProfessionalDefinition(recommendation.key);
                return (
                  <article
                    key={recommendation.key}
                    className="rounded-2xl border border-white/80 bg-white/90 px-4 py-4"
                  >
                    <div className="flex items-center gap-2">
                      <Stethoscope className="h-4 w-4 text-amber-700" />
                      <h3 className="text-sm font-semibold text-stone-950">
                        {definition.label}
                      </h3>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-stone-600">
                      {recommendation.reason}
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-amber-200 bg-[linear-gradient(180deg,rgba(255,251,235,1),rgba(255,255,255,1))] px-5 py-5 shadow-sm">
      <details className="group">
        <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <BriefcaseMedical className="h-4 w-4 text-amber-700" />
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-800">
                Un professionnel peut aider
              </p>
            </div>
            <p className="mt-2 text-sm leading-6 text-stone-700">
              {support.summary ||
                "Sur cette transformation, un appui externe ciblé peut rendre le changement plus simple à tenir."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-100/80 px-3 py-1 text-[11px] font-semibold text-amber-900">
              {getProfessionalSupportLevelLabel(support.recommendation_level)}
            </span>
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-amber-200 bg-white text-amber-900">
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
            </span>
          </div>
        </summary>

        <div className={`mt-4 grid gap-3 ${compact ? "" : "md:grid-cols-2 xl:grid-cols-3"}`}>
          {support.recommendations.map((recommendation) => {
            const definition = getProfessionalDefinition(recommendation.key);
            return (
              <article
                key={recommendation.key}
                className="rounded-2xl border border-white/80 bg-white/90 px-4 py-4"
              >
                <div className="flex items-center gap-2">
                  <Stethoscope className="h-4 w-4 text-amber-700" />
                  <h3 className="text-sm font-semibold text-stone-950">
                    {definition.label}
                  </h3>
                </div>
                <p className="mt-2 text-sm leading-6 text-stone-600">
                  {recommendation.reason}
                </p>
              </article>
            );
          })}
        </div>
      </details>
    </section>
  );
}
