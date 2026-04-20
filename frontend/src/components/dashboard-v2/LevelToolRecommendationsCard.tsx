import { useEffect, useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  Package2,
  ShoppingBag,
  Wrench,
  XCircle,
} from "lucide-react";

import { supabase } from "../../lib/supabase";
import {
  getToolRecommendationCategoryLabel,
  getToolRecommendationStatusLabel,
} from "../../lib/toolRecommendations";
import type { ToolRecommendationStatus, UserLevelToolRecommendationRow } from "../../types/v2";

type LevelToolRecommendationsCardProps = {
  recommendations: UserLevelToolRecommendationRow[];
  onChanged: () => Promise<void>;
};

export function LevelToolRecommendationsCard({
  recommendations,
  onChanged,
}: LevelToolRecommendationsCardProps) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sectionExpanded, setSectionExpanded] = useState(false);
  const [expandedIds, setExpandedIds] = useState<string[]>([]);

  useEffect(() => {
    setExpandedIds((current) =>
      current.filter((id) => recommendations.some((recommendation) => recommendation.id === id))
    );
  }, [recommendations]);

  if (recommendations.length === 0) {
    return null;
  }

  async function handleStatusChange(
    recommendation: UserLevelToolRecommendationRow,
    nextStatus: ToolRecommendationStatus,
  ) {
    if (busyId) return;

    const eventType = nextStatus === "installed"
      ? "marked_installed"
      : nextStatus === "purchased"
      ? "marked_purchased"
      : nextStatus === "already_owned"
      ? "marked_already_owned"
      : "marked_not_relevant";

    setBusyId(recommendation.id);
    try {
      const { error: updateError } = await supabase
        .from("user_level_tool_recommendations")
        .update({
          status: nextStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", recommendation.id);
      if (updateError) throw updateError;

      const { error: eventError } = await supabase
        .from("user_level_tool_recommendation_events")
        .insert({
          recommendation_id: recommendation.id,
          user_id: recommendation.user_id,
          cycle_id: recommendation.cycle_id,
          transformation_id: recommendation.transformation_id,
          plan_id: recommendation.plan_id,
          event_type: eventType,
          payload: {
            target_level_order: recommendation.target_level_order,
            previous_status: recommendation.status,
            next_status: nextStatus,
          },
        });
      if (eventError) throw eventError;

      await onChanged();
    } catch (error) {
      console.error("[LevelToolRecommendationsCard] update failed", error);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-[30px] border border-amber-200 bg-[linear-gradient(180deg,rgba(255,251,235,1),rgba(255,255,255,1))] px-5 py-5 shadow-sm">
      <button
        type="button"
        onClick={() => setSectionExpanded((current) => !current)}
        className="flex w-full items-start justify-between gap-4 text-left"
        aria-expanded={sectionExpanded}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-amber-700">
            <Wrench className="h-4 w-4 shrink-0" />
            <h3 className="text-sm font-semibold text-stone-950">Outils recommandés pour ce niveau</h3>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-600">
            Sophia te propose ici des outils externes qui peuvent aider ce niveau précis.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-900">
            {recommendations.length} recommandation{recommendations.length > 1 ? "s" : ""}
          </span>
          <ChevronDown
            className={`mt-1 h-5 w-5 shrink-0 text-stone-400 transition-transform duration-300 ${sectionExpanded ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {sectionExpanded ? (
        <div className="mt-5 grid gap-4">
          {recommendations.map((recommendation) => {
            const isBusy = busyId === recommendation.id;
            const isResolved = recommendation.status !== "recommended";
            const isExpanded = expandedIds.includes(recommendation.id);
            const primaryLabel = recommendation.tool_type === "app"
              ? "J'ai installé !"
              : "J'ai acheté !";
            const primaryStatus = recommendation.tool_type === "app"
              ? "installed"
              : "purchased";

            return (
              <article
                key={recommendation.id}
                className="rounded-[26px] border border-white/80 bg-white/90 px-5 py-5 shadow-sm"
              >
                <button
                  type="button"
                  onClick={() =>
                    setExpandedIds((current) =>
                      current.includes(recommendation.id)
                        ? current.filter((id) => id !== recommendation.id)
                        : [...current, recommendation.id]
                    )}
                  className="flex w-full items-start justify-between gap-4 text-left"
                  aria-expanded={isExpanded}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {recommendation.tool_type === "app" ? (
                        <Package2 className="h-4 w-4 shrink-0 text-amber-700" />
                      ) : (
                        <ShoppingBag className="h-4 w-4 shrink-0 text-amber-700" />
                      )}
                      <h4 className="text-sm font-semibold text-stone-950">
                        {recommendation.priority_rank}. {recommendation.display_name}
                      </h4>
                    </div>
                    {recommendation.brand_name ? (
                      <p className="mt-1 text-xs font-medium uppercase tracking-[0.16em] text-stone-500">
                        {recommendation.brand_name}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-900">
                        {getToolRecommendationCategoryLabel(recommendation.category_key)}
                      </span>
                      <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-[11px] font-semibold text-stone-700">
                        {getToolRecommendationStatusLabel(recommendation.status)}
                      </span>
                    </div>
                  </div>
                  <ChevronDown
                    className={`mt-1 h-5 w-5 shrink-0 text-stone-400 transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`}
                  />
                </button>

                {isExpanded ? (
                  <div className="mt-4 grid gap-4 border-t border-amber-100 pt-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl border border-amber-100 bg-amber-50/70 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                          Pourquoi ici
                        </p>
                        <p className="mt-2 text-sm leading-6 text-stone-700">
                          {recommendation.why_this_level}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-amber-100 bg-amber-50/70 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                          Comment ça marche
                        </p>
                        <p className="mt-2 text-sm leading-6 text-stone-700">
                          {recommendation.reason}
                        </p>
                      </div>
                    </div>

                    {isResolved ? (
                      <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900">
                        <CheckCircle2 className="h-4 w-4" />
                        {getToolRecommendationStatusLabel(recommendation.status)}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => void handleStatusChange(recommendation, primaryStatus)}
                          disabled={isBusy}
                          className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 transition hover:bg-amber-100 disabled:opacity-60"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          {primaryLabel}
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleStatusChange(recommendation, "already_owned")}
                          disabled={isBusy}
                          className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-300 hover:text-stone-900 disabled:opacity-60"
                        >
                          <Package2 className="h-4 w-4" />
                          Je l'avais déjà
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleStatusChange(recommendation, "not_relevant")}
                          disabled={isBusy}
                          className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-semibold text-stone-700 transition hover:border-stone-300 hover:text-stone-900 disabled:opacity-60"
                        >
                          <XCircle className="h-4 w-4" />
                          Pas pertinent
                        </button>
                      </div>
                    )}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
