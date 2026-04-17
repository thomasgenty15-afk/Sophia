import { useState } from "react";
import { ChevronDown, Flag, Glasses, Brain, Lightbulb, TrendingUp } from "lucide-react";
import { ProfessionalSupportCard } from "../shared/ProfessionalSupportCard";
import type { PlanContentV3, ProfessionalSupportV1 } from "../../types/v2";
import { MetricProgressRail } from "./MetricProgressRail";

type JourneyContext = {
  is_multi_part: boolean;
  part_number: number | null;
  estimated_total_parts: number | null;
  continuation_hint: string | null;
  estimated_total_duration_months: number | null;
};

type StrategyHeaderProps = {
  title: string;
  summary: string;
  situationContext?: string | null;
  mechanismAnalysis?: string | null;
  keyUnderstanding?: string | null;
  progressionLogic?: string | null;
  primaryMetric?: PlanContentV3["primary_metric"];
  successDefinition?: string | null;
  journeyContext?: JourneyContext | null;
  professionalSupport?: ProfessionalSupportV1 | null;
};

export function StrategyHeader({
  title,
  summary,
  situationContext,
  mechanismAnalysis,
  keyUnderstanding,
  progressionLogic,
  primaryMetric,
  successDefinition,
  journeyContext,
  professionalSupport,
}: StrategyHeaderProps) {
  const contextText = situationContext?.trim() || summary;
  const rawPartNumber = journeyContext?.part_number ?? null;
  const rawTotalParts = journeyContext?.estimated_total_parts ?? null;
  const hasValidProgress =
    typeof rawPartNumber === "number" &&
    Number.isFinite(rawPartNumber) &&
    rawPartNumber > 0 &&
    typeof rawTotalParts === "number" &&
    Number.isFinite(rawTotalParts) &&
    rawTotalParts > 0;
  const currentPart = hasValidProgress ? rawPartNumber : null;
  const totalParts = hasValidProgress ? rawTotalParts : null;
  const isMultiPart = journeyContext?.is_multi_part === true;
  const [expanded, setExpanded] = useState(false);
  const globalMetricHelper = primaryMetric?.label
    ? `Mesuré par : ${primaryMetric.label}`
    : successDefinition ?? null;

  const [showMultiPartExplainer, setShowMultiPartExplainer] = useState(() => {
    if (!isMultiPart) return false;
    const key = "sophia:multipart_explainer_shown";
    try {
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        return true;
      }
    } catch { /* private mode */ }
    return false;
  });

  return (
    <section className="mb-6 rounded-[30px] border border-stone-200 bg-white px-5 py-6 shadow-sm">
      <div className="flex flex-col items-start gap-4">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <Glasses className="h-4 w-4 text-stone-400" />
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-500">
              Le contexte
            </h2>
          </div>
          <p className="text-sm leading-relaxed text-stone-700 sm:text-base">
            {contextText}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-4 py-2 text-xs font-semibold text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900"
        >
          {expanded ? "Masquer la stratégie détaillée" : "Voir la stratégie détaillée"}
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {expanded ? (
        <div className="mt-6 animate-in fade-in slide-in-from-top-2 border-t border-stone-100 pt-6">
          <div className="space-y-4">
            {isMultiPart ? (
              <div className="rounded-2xl border border-blue-100 bg-blue-50/50 px-5 py-4">
                {currentPart != null && totalParts != null ? (
                  <div className="flex gap-1.5">
                    {Array.from({ length: totalParts }).map((_, i) => (
                      <div
                        key={`part-${i}`}
                        className={`h-2 flex-1 rounded-full transition-colors ${
                          i + 1 < currentPart
                            ? "bg-blue-600"
                            : i + 1 === currentPart
                              ? "bg-blue-400"
                              : "bg-blue-100"
                        }`}
                      />
                    ))}
                  </div>
                ) : null}
                {showMultiPartExplainer ? (
                  <p className="mt-3 text-[13px] font-medium text-blue-900">
                    {totalParts != null
                      ? `Ce parcours est divisé en ${totalParts} étapes pour maximiser tes chances de réussite.`
                      : "Ce parcours est découpé en plusieurs étapes pour maximiser tes chances de réussite."}
                  </p>
                ) : null}
                {journeyContext?.estimated_total_duration_months ? (
                  <p className="mt-1 text-xs font-semibold text-blue-700">
                    Parcours total estimé: ~{journeyContext.estimated_total_duration_months} mois
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              {mechanismAnalysis ? (
                <div className="rounded-2xl border border-stone-200 bg-stone-50/70 px-5 py-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Brain className="h-4 w-4 text-stone-500" />
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-stone-600">
                      Ce qui se passe vraiment
                    </p>
                  </div>
                  <p className="text-sm leading-relaxed text-stone-700">
                    {mechanismAnalysis}
                  </p>
                </div>
              ) : null}

              {keyUnderstanding ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/60 px-5 py-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-amber-600" />
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-800">
                      Ce que tu dois comprendre
                    </p>
                  </div>
                  <p className="text-sm leading-relaxed text-amber-950">
                    {keyUnderstanding}
                  </p>
                </div>
              ) : null}

              {primaryMetric || successDefinition ? (
                <div className="rounded-2xl">
                  <MetricProgressRail
                    tone="emerald"
                    eyebrow="Objectif global"
                    title={primaryMetric?.label ?? "Direction mesurable"}
                    subtitle={successDefinition ?? null}
                    currentLabel="Point de départ"
                    currentValue={primaryMetric?.baseline_value ?? "Non renseigné"}
                    targetLabel="Cible"
                    targetValue={primaryMetric?.success_target ?? successDefinition ?? "Objectif de réussite"}
                    helperText={globalMetricHelper}
                  />
                </div>
              ) : null}

              {progressionLogic ? (
                <div className="rounded-2xl border border-sky-100/60 bg-sky-50/40 px-5 py-4">
                  <div className="mb-2 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-sky-600" />
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-sky-800">
                      Logique de progression
                    </p>
                  </div>
                  <p className="text-sm leading-relaxed text-sky-950">
                    {progressionLogic}
                  </p>
                </div>
              ) : null}
            </div>

            {successDefinition ? (
              <div className="grid gap-4">
                <div className="rounded-2xl border border-emerald-100/50 bg-emerald-50/30 px-5 py-4 transition-colors hover:bg-emerald-50/50">
                  <div className="flex items-center gap-2 mb-2">
                    <Flag className="h-4 w-4 text-emerald-600" />
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-800">
                      Réussite
                    </p>
                  </div>
                  <p className="text-[13px] leading-relaxed text-emerald-950">
                    {successDefinition}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <ProfessionalSupportCard support={professionalSupport ?? null} compact />
    </section>
  );
}
