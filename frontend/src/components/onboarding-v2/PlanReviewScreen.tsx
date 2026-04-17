import {
  ChevronDown,
  Loader2,
  Map,
  MessageSquareQuote,
  RefreshCcw,
  Rocket,
  Shield,
  Swords,
  Timer,
} from "lucide-react";

import { ProfessionalSupportCard } from "../shared/ProfessionalSupportCard";
import { getClarificationExerciseDetails } from "../../lib/clarificationExercises";
import { buildPlanPreviewItemMetaLabel } from "../../lib/planItemTiming";
import {
  formatPlanDateRange,
  getPlanWeekCalendar,
  parsePlanScheduleAnchor,
} from "../../lib/planSchedule";
import { getDisplayPhaseOrder } from "../../lib/planPhases";
import type { PlanContentV3, ProfessionalSupportV1 } from "../../types/v2";

type PlanReviewScreenProps = {
  plan: PlanContentV3;
  professionalSupport: ProfessionalSupportV1 | null;
  feedback: string;
  isBusy: boolean;
  onFeedbackChange: (value: string) => void;
  onRegenerate: (variant?: "shorter" | "longer") => void;
  onConfirm: () => void;
};

type Phase1Preview = {
  title: string;
  rationale: string;
  phase_objective: string;
};

type FutureLevelPreview = {
  phase_id: string;
  display_order: number;
  title: string;
  intention: string;
  duration_label: string;
  preview_summary: string | null;
};

function durationLabel(value: number) {
  return value <= 1 ? "1 mois" : `${value} mois`;
}

function approximatePhaseDurationLabel(totalMonths: number, phaseCount: number) {
  const safePhaseCount = Math.max(1, phaseCount);
  const weeksPerPhase = Math.max(1, Math.round((Math.max(1, totalMonths) * 4) / safePhaseCount));

  if (weeksPerPhase >= 8) {
    const monthsPerPhase = Math.max(1, Math.round(weeksPerPhase / 4));
    return monthsPerPhase <= 1 ? "Environ 1 mois" : `Environ ${monthsPerPhase} mois`;
  }

  return weeksPerPhase <= 1 ? "Environ 1 semaine" : `Environ ${weeksPerPhase} semaines`;
}

function phaseDurationLabel(
  plan: PlanContentV3,
  phase: PlanContentV3["phases"][number],
) {
  if (typeof phase.duration_guidance === "string" && phase.duration_guidance.trim()) {
    return phase.duration_guidance.trim();
  }

  return approximatePhaseDurationLabel(plan.duration_months, plan.phases.length);
}

function blueprintDurationLabel(weeks: number) {
  if (weeks >= 8) {
    const months = Math.max(1, Math.round(weeks / 4));
    return months <= 1 ? "Environ 1 mois" : `Environ ${months} mois`;
  }
  return weeks <= 1 ? "Environ 1 semaine" : `Environ ${weeks} semaines`;
}

function levelTargetLabel(durationLabel: string) {
  const trimmed = durationLabel.trim();
  if (!trimmed) return "Objectif de niveau";
  if (trimmed.toLowerCase().startsWith("environ ")) {
    return `Objectif de niveau (à la fin du niveau, ${trimmed.toLowerCase()})`;
  }
  return `Objectif de niveau (à la fin des ${trimmed})`;
}

function itemTypeLabel(
  item: PlanContentV3["phases"][number]["items"][number],
): string {
  if (item.dimension === "habits") return "Habitude";
  if (item.dimension === "missions") return item.kind === "milestone" ? "Validation" : "Mission";
  if (item.dimension === "clarifications") {
    return item.kind === "framework" ? "Clarification" : "Exercice de clarification";
  }
  return item.kind === "framework" ? "Clarification" : "Exercice";
}

function itemMetaLabel(
  plan: PlanContentV3,
  item: PlanContentV3["phases"][number]["items"][number],
): string {
  return buildPlanPreviewItemMetaLabel({
    plan,
    item,
    kindLabel: itemTypeLabel(item),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function extractPhase1Preview(plan: PlanContentV3): Phase1Preview {
  const preview = isRecord(plan.metadata) && isRecord(plan.metadata.phase_1_preview)
    ? plan.metadata.phase_1_preview
    : null;

  return {
    title: typeof preview?.title === "string" && preview.title.trim()
      ? preview.title.trim()
      : "Poser ton socle de départ",
    rationale:
      "Ici, tu ne changes encore rien. Tu prends du recul sur ton histoire et tu mets au clair pourquoi cette transformation compte vraiment pour toi.",
    phase_objective:
      "Te donner une base solide pour la suite : savoir d’où tu pars, ce que tu veux vraiment retrouver ou protéger, et avoir une raison claire à laquelle te raccrocher quand ce sera plus difficile.",
  };
}

function buildStartWindowLabel(plan: PlanContentV3): string | null {
  const anchor = parsePlanScheduleAnchor(plan.metadata?.schedule_anchor);
  if (!anchor) return null;
  const firstWeek = getPlanWeekCalendar(anchor, 1);
  if (!firstWeek) return null;

  const range = formatPlanDateRange(firstWeek.startDate, firstWeek.endDate);
  if (firstWeek.isPartial) {
    return `Semaine 1 partielle : du ${range}, soit ${firstWeek.dayCount} jours utiles pour demarrer legerement.`;
  }
  return `Repere de demarrage : du ${range}.`;
}

function buildFutureLevelPreviews(plan: PlanContentV3): FutureLevelPreview[] {
  const blueprintLevels = Array.isArray(plan.plan_blueprint?.levels)
    ? plan.plan_blueprint.levels
    : [];
  const currentLevelOrder = plan.current_level_runtime?.level_order
    ?? plan.phases[0]?.phase_order
    ?? 1;

  if (blueprintLevels.length > 0) {
    return blueprintLevels
      // Accept both contracts during rollout:
      // - new plans: blueprint only contains future levels
      // - old plans: blueprint may still include the current generated level
      .filter((level) => level.level_order > currentLevelOrder)
      .sort((a, b) => a.level_order - b.level_order)
      .map((level) => ({
        phase_id: level.phase_id,
        display_order: getDisplayPhaseOrder(level.level_order),
        title: level.title,
        intention: level.intention,
        duration_label: blueprintDurationLabel(level.estimated_duration_weeks),
        preview_summary: level.preview_summary,
      }));
  }

  return plan.phases.slice(1).map((phase) => ({
    phase_id: phase.phase_id,
    display_order: getDisplayPhaseOrder(phase.phase_order),
    title: phase.title,
    intention: phase.phase_objective,
    duration_label: phaseDurationLabel(plan, phase),
    preview_summary: phase.rationale ?? null,
  }));
}

export function PlanReviewScreen({
  plan,
  professionalSupport,
  feedback,
  isBusy,
  onFeedbackChange,
  onRegenerate,
  onConfirm,
}: PlanReviewScreenProps) {
  const canRegenerate = !isBusy;
  const phase1Preview = extractPhase1Preview(plan);
  const currentGeneratedLevel = plan.phases[0] ?? null;
  const futureLevels = buildFutureLevelPreviews(plan);
  const startWindowLabel = buildStartWindowLabel(plan);

  return (
    <section className="mx-auto w-full max-w-4xl space-y-6">
      <div className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-blue-600 sm:text-xs">
              Validation du plan
            </p>
            <h1 className="mt-1 font-serif text-3xl font-bold tracking-tight text-gray-900 md:text-4xl">
              Voici la première version de ton plan.
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-gray-600">
              Tu vois ici en détail ton socle de départ et ton niveau de plan 2. Le reste du
              parcours apparaît seulement dans ses grandes lignes pour garder la suite lisible.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={onRegenerate}
              disabled={!canRegenerate}
              className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:border-blue-200 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isBusy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Regénération…
                </>
              ) : (
                <>
                  <RefreshCcw className="h-4 w-4" />
                  Régénérer
                </>
              )}
            </button>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-800">
              <Timer className="h-4 w-4" />
              {durationLabel(plan.duration_months)}
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
              Transformation
            </p>
            <h2 className="mt-2 text-xl font-semibold text-gray-900">{plan.title}</h2>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              {plan.situation_context || plan.user_summary}
            </p>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
              Ce qui se passe vraiment
            </p>
            <p className="mt-2 text-sm leading-6 text-gray-700">
              {plan.mechanism_analysis || plan.internal_summary}
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
              Ce que tu dois comprendre
            </p>
            <p className="mt-2 text-sm leading-6 text-gray-700">
              {plan.key_understanding || plan.strategy.success_definition}
            </p>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
              Direction mesurable
            </p>
            <p className="mt-2 text-sm leading-6 text-gray-700">
              Depart : {plan.primary_metric?.baseline_value ?? "Non renseigne"}
            </p>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              Cible : {plan.primary_metric?.success_target ?? plan.strategy.success_definition}
            </p>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              Mesuré par : {plan.primary_metric?.label ?? "Objectif de réussite"}
            </p>
            <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
              Logique de progression
            </p>
            <p className="mt-2 text-sm leading-6 text-gray-700">
              {plan.progression_logic || plan.timeline_summary}
            </p>
          </div>
        </div>
      </div>

      <ProfessionalSupportCard support={professionalSupport} />

      <div className="space-y-4">
        <article className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5 shadow-sm">
          <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                  Niveau 1
                </p>
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-100/50 px-3 py-1 text-[11px] font-semibold text-amber-900">
                  <Timer className="h-3.5 w-3.5" />
                  Lancement
                </span>
              </div>
              <h3 className="mt-2 text-xl font-semibold text-gray-900">{phase1Preview.title}</h3>
              <p className="mt-2 text-sm leading-6 text-gray-700">{phase1Preview.rationale}</p>
              <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                Objectif du niveau
              </p>
              <p className="mt-2 text-sm leading-6 text-gray-700">
                {phase1Preview.phase_objective}
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-amber-200 bg-white/80 px-4 py-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                    Ton histoire
                  </p>
                  <p className="mt-2 text-sm leading-6 text-gray-700">
                    Elle te permet de te projeter sur le chemin, de voir ce que tu es en train de
                    traverser avec plus de recul, et de sentir que cette transformation a un fil
                    conducteur au lieu d&apos;être juste une suite d&apos;efforts.
                  </p>
                </div>
                <div className="rounded-xl border border-amber-200 bg-white/80 px-4 py-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700">
                    Pourquoi profond
                  </p>
                  <p className="mt-2 text-sm leading-6 text-gray-700">
                    Il sert à figer pourquoi c&apos;est important d&apos;avancer pour toi, pour que tu
                    aies un repère clair auquel revenir quand la motivation baisse ou que les vieux
                    automatismes reviennent.
                  </p>
                </div>
              </div>
          </div>
        </article>

        {currentGeneratedLevel ? (
          <article
            key={currentGeneratedLevel.phase_id}
            className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
          >
            <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
                    Niveau {getDisplayPhaseOrder(currentGeneratedLevel.phase_order)}
                  </p>
                  <span className="inline-flex items-center gap-1 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-semibold text-blue-800">
                    <Timer className="h-3.5 w-3.5" />
                    {phaseDurationLabel(plan, currentGeneratedLevel)}
                  </span>
                </div>
                <h3 className="mt-1 text-xl font-semibold text-gray-900">
                  {currentGeneratedLevel.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-gray-600">
                  {currentGeneratedLevel.rationale}
                </p>
                {startWindowLabel ? (
                  <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-medium text-blue-800">
                    <Timer className="h-3.5 w-3.5" />
                    {startWindowLabel}
                  </div>
                ) : null}
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {currentGeneratedLevel.phase_metric_target ? (
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 px-4 py-4">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                        Progression vers l&apos;objectif final
                      </p>
                      <p className="mt-2 text-sm font-semibold text-emerald-950">
                        {plan.primary_metric?.label ?? "Objectif de réussite"}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-emerald-900">
                        {currentGeneratedLevel.phase_metric_target}
                      </p>
                    </div>
                  ) : null}
                  <div className="rounded-2xl border border-sky-100 bg-sky-50/40 px-4 py-4 text-sm text-sky-900">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-700">
                      {levelTargetLabel(phaseDurationLabel(plan, currentGeneratedLevel))}
                    </p>
                    <p className="mt-2 text-[15px] font-semibold leading-6 text-gray-950">
                      {currentGeneratedLevel.heartbeat.title} : {currentGeneratedLevel.heartbeat.target}{" "}
                      {currentGeneratedLevel.heartbeat.unit}
                    </p>
                  </div>
                </div>
                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                  Objectif du niveau
                </p>
                <p className="mt-2 text-sm leading-6 text-gray-700">
                  {currentGeneratedLevel.phase_objective}
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">
                      Ce qu&apos;on tacle
                    </p>
                    <p className="mt-2 text-sm leading-6 text-gray-700">
                      {currentGeneratedLevel.what_this_phase_targets || currentGeneratedLevel.phase_objective}
                    </p>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">
                      Pourquoi maintenant
                    </p>
                    <p className="mt-2 text-sm leading-6 text-gray-700">
                      {currentGeneratedLevel.why_this_now || currentGeneratedLevel.rationale}
                    </p>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">
                      Comment
                    </p>
                    <p className="mt-2 text-sm leading-6 text-gray-700">
                      {currentGeneratedLevel.how_this_phase_works || currentGeneratedLevel.phase_objective}
                    </p>
                  </div>
                </div>
                {currentGeneratedLevel.maintained_foundation.length > 0 ? (
                  <>
                    <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                      Socle maintenu
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {currentGeneratedLevel.maintained_foundation.map((foundation) => (
                        <span
                          key={foundation}
                          className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700"
                        >
                          {foundation}
                        </span>
                      ))}
                    </div>
                  </>
                ) : null}
            </div>

            <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
              Tes actions
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {currentGeneratedLevel.items.map((item) => (
                <div
                  key={item.temp_id}
                  className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-4"
                >
                  {(() => {
                    const clarificationDetails = item.dimension === "clarifications"
                      ? getClarificationExerciseDetails(item.payload)
                      : null;
                    return (
                      <>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">
                    {itemMetaLabel(plan, item)}
                  </p>
                  <h4 className="mt-3 text-base font-semibold text-gray-900">{item.title}</h4>
                  <p className="mt-2 text-sm leading-6 text-gray-600">{item.description}</p>
                  {clarificationDetails ? (
                    <p className="mt-3 text-xs font-medium text-sky-700">
                      Exercice structure • {clarificationDetails.sections.length} champs guides
                    </p>
                  ) : null}
                      </>
                    );
                  })()}
                </div>
              ))}
            </div>

            {currentGeneratedLevel.items.some((item) =>
              item.dimension === "missions" || item.dimension === "habits"
            ) ? (
              <details className="group mt-5 rounded-2xl border border-gray-200 bg-gray-50/70 px-4 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                      Ressources optionnelles liées au niveau
                    </p>
                    <p className="mt-2 text-sm font-semibold text-gray-900">
                      Sophia peut t'équiper pour certaines actions du plan
                    </p>
                  </div>
                  <ChevronDown className="h-4 w-4 shrink-0 text-gray-400 transition-transform group-open:rotate-180" />
                </summary>

                <div className="mt-4 space-y-3 border-t border-gray-200 pt-4">
                  <p className="text-sm leading-6 text-gray-700">
                    Si tu le souhaites, Sophia pourra générer automatiquement des ressources liées
                    à certaines missions et habitudes du plan. Pas besoin de tout comprendre
                    maintenant : tu verras très concrètement à quoi elles servent quand tu arriveras
                    sur les actions concernées.
                  </p>

                  <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-violet-100 bg-violet-50/60 px-4 py-4">
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-violet-700" />
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-violet-800">
                        Carte de défense
                      </p>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-violet-950">
                      Elle sert quand quelque chose frotte sur le moment : évitement, envie,
                      friction ou décrochage. Elle te donne une réponse simple, claire et
                      applicable tout de suite pour protéger l'action.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-rose-100 bg-rose-50/60 px-4 py-4">
                    <div className="flex items-center gap-2">
                      <Swords className="h-4 w-4 text-rose-700" />
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-800">
                        Carte d'attaque
                      </p>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-rose-950">
                      Elle sert plus en amont, pour préparer le terrain, réduire la friction et
                      rendre le bon geste plus naturel à déclencher au bon moment.
                    </p>
                  </div>
                  </div>
                </div>
              </details>
            ) : null}
          </article>
        ) : null}

        {futureLevels.length > 0 ? (
          <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Map className="h-4 w-4 text-gray-500" />
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-600">
                    Grandes lignes de la suite
                  </p>
                </div>
                <h3 className="mt-2 text-xl font-semibold text-gray-900">
                  Les prochains niveaux restent visibles sans tout détailler
                </h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
                  Après le niveau de plan 2, tu vois surtout l’intention de la progression. Les
                  actions détaillées des niveaux suivants apparaîtront plus tard, au bon moment.
                </p>
              </div>
              {plan.plan_blueprint?.global_objective ? (
                <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">
                    Cap global
                  </p>
                  <p className="mt-2 font-semibold text-gray-900">
                    {plan.plan_blueprint.global_objective}
                  </p>
                </div>
              ) : null}
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {futureLevels.map((level) => (
                <div
                  key={level.phase_id}
                  className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-600">
                      Niveau {level.display_order}
                    </span>
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">
                      {level.duration_label}
                    </span>
                  </div>
                  <h4 className="mt-3 text-base font-semibold text-gray-900">
                    {level.title}
                  </h4>
                  <p className="mt-2 text-sm leading-6 text-gray-700">
                    {level.intention}
                  </p>
                  {level.preview_summary ? (
                    <p className="mt-2 text-sm leading-6 text-gray-600">
                      {level.preview_summary}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </article>
        ) : null}
      </div>

      <div className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm md:p-8">
        <div className="flex items-center gap-2 text-blue-700">
          <MessageSquareQuote className="h-5 w-5" />
          <h2 className="text-lg font-semibold text-gray-900">Ajuster avant de commencer</h2>
        </div>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Exemple: “l&apos;étape 1 est trop abstraite”, “commence plutôt par éteindre la lampe à 23h”,
          “ce plan est trop long”, “je veux un premier pas plus simple”.
        </p>
        <p className="mt-2 text-xs leading-5 text-gray-500">
          Tu peux régénérer directement le plan, ou laisser un feedback précis pour orienter la
          prochaine version.
        </p>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => onRegenerate("shorter")}
            disabled={!canRegenerate}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-700 transition hover:border-blue-200 hover:bg-white hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCcw className="h-4 w-4" />
            Je veux un plan plus court
          </button>
          <button
            type="button"
            onClick={() => onRegenerate("longer")}
            disabled={!canRegenerate}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-700 transition hover:border-blue-200 hover:bg-white hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCcw className="h-4 w-4" />
            Je veux un plan plus long
          </button>
        </div>

        <textarea
          value={feedback}
          onChange={(event) => onFeedbackChange(event.target.value)}
          rows={5}
          placeholder="Dis ce que tu veux corriger avant validation finale."
          className="mt-4 w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
        />

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onRegenerate}
            disabled={!canRegenerate}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 bg-white px-6 py-4 text-sm font-semibold text-gray-700 shadow-sm transition-all hover:border-blue-200 hover:bg-gray-50 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isBusy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Ajustement en cours…
              </>
            ) : (
              <>
                <RefreshCcw className="h-4 w-4" />
                Régénérer le plan
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={isBusy}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-8 py-4 text-base font-bold text-white shadow-lg shadow-blue-200/50 transition-all hover:bg-blue-700 hover:shadow-blue-300/50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isBusy ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Activation…
              </>
            ) : (
              <>
                <Rocket className="h-5 w-5" />
                Valider et commencer
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
