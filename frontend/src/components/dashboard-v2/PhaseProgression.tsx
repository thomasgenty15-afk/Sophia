import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Lock,
  PartyPopper,
  Target,
} from "lucide-react";

import type { DashboardV2PlanItemRuntime } from "../../hooks/useDashboardV2Data";
import type {
  DashboardV2UnlockState,
  PhaseRuntimeData,
} from "../../hooks/useDashboardV2Logic";
import {
  formatPlanDateRange,
  getPlanWeekCalendar,
  type PlanScheduleAnchor,
} from "../../lib/planSchedule";
import { supabase } from "../../lib/supabase";
import type { UserLevelToolRecommendationRow } from "../../types/v2";
import { LevelToolRecommendationsCard } from "./LevelToolRecommendationsCard";
import { PlanItemCard } from "./PlanItemCard";
import { WeekPlanningModal } from "./WeekPlanningModal";
type JourneyContext = {
  is_multi_part: boolean;
  part_number: number | null;
  estimated_total_parts: number | null;
};

type WeekItemAssignment = NonNullable<
  PhaseRuntimeData["weeks"][number]["item_assignments"]
>[number];

type WeekPlanningStatus = "pending_confirmation" | "confirmed";
type DayCode = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

const DAY_CODES: DayCode[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

type PhaseProgressionProps = {
  phases: PhaseRuntimeData[];
  scheduleAnchor?: PlanScheduleAnchor | null;
  planAdjustmentRevision?: {
    effective_start_date: string;
    reason: string;
    scope: "level" | "plan";
    assistant_message?: string | null;
  } | null;
  phase1Node?: React.ReactNode;
  activePhaseFooterNode?: React.ReactNode;
  renderPhaseFooterNode?: (phase: PhaseRuntimeData) => React.ReactNode;
  /**
   * Recos d'outils par niveau, indexees par phase_id BRUT (ex: "phase-2"),
   * pas par phase_order affiche (qui est decale via getDisplayPhaseOrder).
   * Source de verite: table user_level_tool_recommendations.
   */
  levelToolRecommendationsByPhaseId?: Map<string, UserLevelToolRecommendationRow[]>;
  onLevelToolRecommendationChanged?: () => Promise<void>;
  primaryMetricLabel?: string | null;
  unlockStateByItemId: Map<string, DashboardV2UnlockState>;
  busyItemId: string | null;
  onComplete: (item: DashboardV2PlanItemRuntime) => void;
  onActivate: (item: DashboardV2PlanItemRuntime) => void;
  onPrepareCards: (item: DashboardV2PlanItemRuntime) => void;
  onOpenDefenseResourceEditor: (item: DashboardV2PlanItemRuntime) => void;
  onBlocker: (item: DashboardV2PlanItemRuntime) => void;
  onDeactivate: (item: DashboardV2PlanItemRuntime) => void;
  onRemove: (item: DashboardV2PlanItemRuntime) => void;
  onAdapt: (item: DashboardV2PlanItemRuntime) => void;
  onLogHeartbeat?: () => void;
  onCompleteLevel?: () => void;
  completeLevelBusy?: boolean;
  onCompletionAction?: () => void;
  completionActionLabel?: string | null;
  completionActionHint?: string | null;
  journeyContext?: JourneyContext | null;
};

function getPhaseCompletedDate(phase: PhaseRuntimeData): string | null {
  const dates = phase.items
    .map((item) => item.completed_at)
    .filter((d): d is string => d != null);
  if (dates.length === 0) return null;
  return dates.sort().pop()!;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatDurationWeeks(durationWeeks: number | null | undefined): string | null {
  if (!durationWeeks || durationWeeks < 1) return null;
  return `${durationWeeks} semaine${durationWeeks > 1 ? "s" : ""}`;
}

function formatMissionDays(days: string[]): string | null {
  if (days.length === 0) return null;
  return days.join(", ");
}

function formatMetricValue(value: number | null | undefined, unit: string | null | undefined): string {
  return [value ?? 0, unit].filter((part) => part != null && String(part).trim().length > 0).join(" ");
}

function buildWeekTargetText(
  week: PhaseRuntimeData["weeks"][number] | null | undefined,
  unit: string | null | undefined,
): string | null {
  if (!week) return null;
  if (week.weekly_target_label?.trim()) return week.weekly_target_label.trim();
  if (week.weekly_target_value != null) {
    return formatMetricValue(week.weekly_target_value, unit);
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function getGeneratedTempId(item: DashboardV2PlanItemRuntime): string | null {
  const generation = isRecord(item.payload?._generation)
    ? item.payload._generation
    : null;
  return generation && typeof generation.temp_id === "string"
    ? generation.temp_id
    : null;
}

function applyWeekItemAssignment(
  item: DashboardV2PlanItemRuntime,
  assignment: WeekItemAssignment,
): DashboardV2PlanItemRuntime {
  return {
    ...item,
    target_reps: assignment.weekly_reps ?? item.target_reps,
    cadence_label: assignment.weekly_cadence_label?.trim()
      ? assignment.weekly_cadence_label.trim()
      : item.cadence_label,
    description: assignment.weekly_description_override?.trim()
      ? assignment.weekly_description_override.trim()
      : item.description,
  };
}

function normalizeWeekdays(days: string[] | null | undefined): string[] {
  return (days ?? [])
    .map((day) => day.trim().toLowerCase())
    .filter((day, index, array) => day.length > 0 && array.indexOf(day) === index);
}

function normalizeDayCodes(days: string[] | null | undefined): DayCode[] {
  return normalizeWeekdays(days).filter((day): day is DayCode =>
    DAY_CODES.includes(day as DayCode)
  );
}

function dateFromYmdUtc(ymd: string): Date {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function addDay(date: Date, days: number): Date {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function dayCodeFromUtc(date: Date): DayCode {
  const day = date.getUTCDay();
  if (day === 0) return "sun";
  return DAY_CODES[day - 1];
}

function getAllowedDaysForWeek(startDate: string, endDate: string): DayCode[] {
  const days: DayCode[] = [];
  let cursor = dateFromYmdUtc(startDate);
  const end = dateFromYmdUtc(endDate);
  while (cursor.getTime() <= end.getTime()) {
    days.push(dayCodeFromUtc(cursor));
    cursor = addDay(cursor, 1);
  }
  return days;
}

function weeklyTargetForItem(
  item: DashboardV2PlanItemRuntime,
  allowedDayCount: number,
): number {
  if (item.dimension === "habits") {
    return Math.max(0, Math.min(allowedDayCount, item.target_reps ?? 0));
  }
  return 1;
}

function isOneShotWeekItem(item: DashboardV2PlanItemRuntime) {
  return item.dimension !== "habits";
}

function buildWeekItems(
  phase: PhaseRuntimeData,
  week: PhaseRuntimeData["weeks"][number],
) {
  const assignments = Array.isArray(week.item_assignments)
    ? week.item_assignments
    : [];

  if (assignments.length === 0) {
    return phase.items;
  }

  const itemsByTempId = new Map<string, DashboardV2PlanItemRuntime>();
  for (const item of phase.items) {
    const tempId = getGeneratedTempId(item);
    if (tempId) itemsByTempId.set(tempId, item);
  }

  return assignments
    .map((assignment) => {
      const item = itemsByTempId.get(assignment.temp_id);
      if (!item) return null;
      return applyWeekItemAssignment(item, assignment);
    })
    .filter((item): item is DashboardV2PlanItemRuntime => Boolean(item));
}

function buildSections(items: DashboardV2PlanItemRuntime[]) {
  return [
    {
      key: "habits" as const,
      items: items.filter((item) => item.dimension === "habits"),
    },
    {
      key: "missions" as const,
      items: items.filter((item) => item.dimension === "missions"),
    },
    {
      key: "clarifications" as const,
      items: items.filter((item) => item.dimension === "clarifications"),
    },
  ].filter((section) => section.items.length > 0);
}

function buildWeekMissionTiming(
  phase: PhaseRuntimeData,
  week: PhaseRuntimeData["weeks"][number],
) {
  const weekItems = buildWeekItems(phase, week);
  const oneShotItems = weekItems.filter((item) => isOneShotWeekItem(item));
  const summaryDays = normalizeWeekdays(week.mission_days).slice(0, oneShotItems.length);
  const recommendedDaysByItemId = new Map<string, string[]>();

  oneShotItems.forEach((item, index) => {
    const assignedDay = summaryDays[index];
    if (!assignedDay) return;
    recommendedDaysByItemId.set(item.id, [assignedDay]);
  });

  return {
    summaryDays,
    recommendedDaysByItemId,
  };
}

function PhaseFocusSummary({ phase }: { phase: PhaseRuntimeData }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="rounded-2xl border border-stone-200 bg-white/70 p-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-500">
          Ce qu&apos;on tacle
        </p>
        <p className="mt-2 text-sm leading-relaxed text-stone-700">
          {phase.what_this_phase_targets || phase.phase_objective}
        </p>
      </div>
      <div className="rounded-2xl border border-stone-200 bg-white/70 p-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-500">
          Pourquoi maintenant
        </p>
        <p className="mt-2 text-sm leading-relaxed text-stone-700">
          {phase.why_this_now || phase.rationale}
        </p>
      </div>
      <div className="rounded-2xl border border-stone-200 bg-white/70 p-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-500">
          Comment
        </p>
        <p className="mt-2 text-sm leading-relaxed text-stone-700">
          {phase.how_this_phase_works || phase.phase_objective}
        </p>
      </div>
    </div>
  );
}

function CompletedPhase({
  phase,
  primaryMetricLabel,
  levelToolRecommendations,
  onLevelToolRecommendationChanged,
}: {
  phase: PhaseRuntimeData;
  primaryMetricLabel?: string | null;
  levelToolRecommendations: UserLevelToolRecommendationRow[];
  onLevelToolRecommendationChanged: () => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const completedDate = getPhaseCompletedDate(phase);

  return (
    <div className="rounded-3xl border border-emerald-100 bg-emerald-50/40 px-6 py-5 transition-all hover:bg-emerald-50/60">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center justify-between gap-4"
      >
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div className="text-left">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-600">
              Niveau de plan {phase.phase_order} — Terminé
            </p>
            <div className="flex items-center gap-2">
              <h4 className="text-base font-bold text-emerald-950">
                {phase.title}
              </h4>
              {phase.duration_guidance ? (
                <>
                  <span className="hidden text-emerald-300 sm:inline">•</span>
                  <span className="text-sm font-medium text-emerald-700/70">
                    {phase.duration_guidance}
                  </span>
                </>
              ) : null}
            </div>
            {completedDate ? (
              <p className="mt-1 text-xs text-emerald-700/70">
                Le {formatDate(completedDate)}
              </p>
            ) : null}
          </div>
        </div>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-emerald-400 transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      <div
        ref={contentRef}
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: expanded ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="mt-5 space-y-4">
            {phase.phase_metric_target ? (
              <div className="rounded-2xl border border-emerald-100 bg-white/70 px-4 py-3 text-sm font-medium text-emerald-800">
                Progression vers l&apos;objectif final
                {primaryMetricLabel ? ` (${primaryMetricLabel})` : ""} : {phase.phase_metric_target}
              </div>
            ) : null}
            <PhaseFocusSummary phase={phase} />
            <div className="grid gap-2">
              {phase.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 rounded-xl border border-emerald-100/50 bg-white/50 px-4 py-3"
                >
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                  <span className="text-sm text-emerald-900/60 line-through decoration-emerald-200">
                    {item.title}
                  </span>
                </div>
              ))}
            </div>
            {levelToolRecommendations.length > 0 ? (
              <LevelToolRecommendationsCard
                recommendations={levelToolRecommendations}
                onChanged={onLevelToolRecommendationChanged}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function ActivePhase({
  phase,
  scheduleAnchor,
  planAdjustmentRevision,
  primaryMetricLabel,
  unlockStateByItemId,
  busyItemId,
  onComplete,
  onActivate,
  onPrepareCards,
  onOpenDefenseResourceEditor,
  onBlocker,
  onDeactivate,
  onRemove,
  onAdapt,
  onCompleteLevel,
  completeLevelBusy = false,
  levelToolRecommendations,
  onLevelToolRecommendationChanged,
}: {
  phase: PhaseRuntimeData;
  scheduleAnchor?: PlanScheduleAnchor | null;
  planAdjustmentRevision?: {
    effective_start_date: string;
    reason: string;
    scope: "level" | "plan";
    assistant_message?: string | null;
  } | null;
  primaryMetricLabel?: string | null;
  unlockStateByItemId: Map<string, DashboardV2UnlockState>;
  busyItemId: string | null;
  onComplete: (item: DashboardV2PlanItemRuntime) => void;
  onActivate: (item: DashboardV2PlanItemRuntime) => void;
  onPrepareCards: (item: DashboardV2PlanItemRuntime) => void;
  onOpenDefenseResourceEditor: (item: DashboardV2PlanItemRuntime) => void;
  onBlocker: (item: DashboardV2PlanItemRuntime) => void;
  onDeactivate: (item: DashboardV2PlanItemRuntime) => void;
  onRemove: (item: DashboardV2PlanItemRuntime) => void;
  onAdapt: (item: DashboardV2PlanItemRuntime) => void;
  onLogHeartbeat?: () => void;
  onCompleteLevel?: () => void;
  completeLevelBusy?: boolean;
  levelToolRecommendations: UserLevelToolRecommendationRow[];
  onLevelToolRecommendationChanged: () => Promise<void>;
}) {
  const sections = buildSections(phase.items);
  const [showLevelDetails, setShowLevelDetails] = useState(false);
  const [weekPlanningStatusByKey, setWeekPlanningStatusByKey] = useState<Record<string, WeekPlanningStatus>>({});
  const [planningModalWeekKey, setPlanningModalWeekKey] = useState<string | null>(null);
  const weekEntries = useMemo(() =>
    phase.weeks.map((week) => {
      const weekCalendar = scheduleAnchor
        ? getPlanWeekCalendar(scheduleAnchor, week.week_order)
        : null;
      const status = weekCalendar?.status ??
        week.status ??
        (week.week_order === 1 ? "current" : "upcoming");
      const weekTarget = buildWeekTargetText(week, phase.heartbeat.unit);
      const weekItems = buildWeekItems(phase, week);
      const weekSections = buildSections(weekItems);
      const weekMissionTiming = buildWeekMissionTiming(phase, week);

      return {
        week,
        weekCalendar,
        status,
        weekTarget,
        weekItems,
        weekSections,
        weekMissionTiming,
      };
    }), [phase, scheduleAnchor]);
  const highlightedWeekCalendar = weekEntries.find((entry) => entry.status === "current")?.weekCalendar ??
    weekEntries[0]?.weekCalendar ??
    null;
  const planningModalEntry = weekEntries.find((entry) =>
    entry.weekCalendar?.anchorWeekStart === planningModalWeekKey
  ) ?? null;

  useEffect(() => {
    const currentEntries = weekEntries.filter((entry) =>
      entry.status === "current" &&
      entry.weekCalendar &&
      entry.weekItems.length > 0
    );

    if (currentEntries.length === 0) return;

    let cancelled = false;

    void (async () => {
      const nextStatuses: Record<string, WeekPlanningStatus> = {};

      await Promise.all(currentEntries.map(async (entry) => {
        const weekCalendar = entry.weekCalendar;
        if (!weekCalendar) return;

        const allowedDays = getAllowedDaysForWeek(
          weekCalendar.startDate,
          weekCalendar.endDate,
        );

        const items = entry.weekItems.map((item) => {
          const preferred = item.dimension === "habits"
            ? allowedDays
            : normalizeDayCodes(entry.weekMissionTiming.recommendedDaysByItemId.get(item.id));
          return {
            plan_item_id: item.id,
            preferred_days: preferred.length > 0 ? preferred : allowedDays,
            target_reps_override: weeklyTargetForItem(item, allowedDays.length),
          };
        });

        try {
          const { data, error } = await supabase.functions.invoke("habit-week-planning-v1", {
            body: {
              action: "get_bundle_state",
              week_start_date: weekCalendar.anchorWeekStart,
              items,
            },
          });
          if (error) throw error;
          const bundle = data as { bundle_status?: WeekPlanningStatus };
          nextStatuses[weekCalendar.anchorWeekStart] =
            bundle.bundle_status === "confirmed" ? "confirmed" : "pending_confirmation";
        } catch (error) {
          console.error("[PhaseProgression] week planning hydration failed", error);
        }
      }));

      if (cancelled || Object.keys(nextStatuses).length === 0) return;

      setWeekPlanningStatusByKey((current) => ({
        ...current,
        ...nextStatuses,
      }));
    })();

    return () => {
      cancelled = true;
    };
  }, [weekEntries]);

  return (
    <div className="relative overflow-hidden rounded-3xl border border-stone-200 bg-white p-6 shadow-[0_24px_80px_-52px_rgba(15,23,42,0.32)] md:p-8">
      {/* Header */}
      <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-stone-100 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-stone-600">
            Niveau de plan {phase.phase_order} — En cours
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-stone-900">
              {phase.title}
            </h3>
            {phase.duration_guidance ? (
              <>
                <span className="hidden text-stone-300 sm:inline">•</span>
                <span className="text-sm font-medium text-stone-500">
                  {phase.duration_guidance}
                </span>
              </>
            ) : null}
            {!phase.duration_guidance && phase.duration_weeks ? (
              <>
                <span className="hidden text-stone-300 sm:inline">•</span>
                <span className="text-sm font-medium text-stone-500">
                  {formatDurationWeeks(phase.duration_weeks)}
                </span>
              </>
            ) : null}
          </div>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-stone-700">
            {phase.rationale}
          </p>
        </div>
      </div>

      <div className="mb-10 grid gap-6 lg:grid-cols-3">
        {/* 1. Cap du niveau */}
        <div className="flex flex-col gap-5 rounded-2xl border border-stone-100 bg-stone-50/80 p-6 lg:col-span-2">
          <div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-500">
                Cap du niveau
              </span>
              <p className="mt-1.5 text-sm leading-relaxed text-stone-700">
                {phase.phase_objective}
              </p>
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setShowLevelDetails((prev) => !prev)}
                className="inline-flex shrink-0 items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-xs font-semibold text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900"
              >
                {showLevelDetails ? "Masquer le détail" : "Voir le détail"}
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform duration-300 ${showLevelDetails ? "rotate-180" : ""}`}
                />
              </button>
            </div>

            {showLevelDetails ? (
              <div className="mt-5 space-y-4 border-t border-stone-200/60 pt-5">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-500">
                    Ce qu&apos;on tacle
                  </span>
                  <p className="mt-1.5 text-sm leading-relaxed text-stone-700">
                    {phase.what_this_phase_targets || phase.phase_objective}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-500">
                    Comment
                  </span>
                  <p className="mt-1.5 text-sm leading-relaxed text-stone-700">
                    {phase.how_this_phase_works || phase.phase_objective}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-500">
                    Pourquoi maintenant
                  </span>
                  <p className="mt-1.5 text-sm leading-relaxed text-stone-700">
                    {phase.why_this_now || phase.rationale}
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* 2. Objectif métrique globale */}
        <div className="flex flex-col rounded-2xl border border-stone-200 bg-white p-6 shadow-sm lg:col-span-1">
          <div className="mb-2 flex items-center gap-2">
            <Target className="h-4 w-4 text-stone-500" />
            <span className="text-[11px] font-bold uppercase tracking-widest text-stone-500">
              Lien avec l&apos;objectif global
            </span>
          </div>
          {primaryMetricLabel ? (
            <p className="mt-2 text-sm font-semibold text-stone-900">
              {primaryMetricLabel}
            </p>
          ) : null}
          <p className="mt-2 text-sm leading-relaxed text-stone-600">
            {phase.phase_metric_target || "Pas de cible directe pour le moment. Ce niveau prépare le terrain."}
          </p>
        </div>
      </div>

      {/* 4. Semaines */}
      {phase.weeks.length > 0 ? (
        <div className="mb-10 rounded-2xl border border-stone-200 bg-stone-50/70 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-stone-500">
                Semaine par semaine
              </p>
              {highlightedWeekCalendar ? (
                <p className="mt-1 text-xs text-stone-500">
                  {highlightedWeekCalendar.weekOrder === 1 && highlightedWeekCalendar.isPartial
                    ? `La semaine 1 est partielle: du ${formatPlanDateRange(highlightedWeekCalendar.startDate, highlightedWeekCalendar.endDate)}.`
                    : `Repere actuel: semaine ${highlightedWeekCalendar.weekOrder}, du ${formatPlanDateRange(highlightedWeekCalendar.startDate, highlightedWeekCalendar.endDate)}.`}
                </p>
              ) : null}
            </div>
            {phase.duration_weeks ? (
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-stone-700">
                {formatDurationWeeks(phase.duration_weeks)}
              </span>
            ) : null}
          </div>
          {planAdjustmentRevision ? (
            <div className="mt-4 rounded-2xl border border-dashed border-blue-200 bg-blue-50/70 px-4 py-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-700">
                Plan ajusté le {planAdjustmentRevision.effective_start_date}
              </p>
              <p className="mt-2 text-sm leading-6 text-stone-700">
                {planAdjustmentRevision.reason}
              </p>
              <p className="mt-2 text-xs text-stone-500">
                La partie précédente reste figée. À partir d&apos;ici, tu vois la version ajustée.
              </p>
            </div>
          ) : null}
          <div className="mt-4 space-y-3">
            {weekEntries.map((entry) => {
              const { week, weekCalendar, status, weekTarget, weekSections, weekItems, weekMissionTiming } = entry;
              const planningWeekKey = weekCalendar?.anchorWeekStart ?? `${phase.phase_id}:${week.week_order}`;
              const planningStatus = weekCalendar
                ? (weekPlanningStatusByKey[planningWeekKey] ?? "pending_confirmation")
                : "pending_confirmation";
              const planningLoading = false;
              const borderClass = status === "completed"
                ? "border-emerald-200 bg-emerald-50/60"
                : status === "current"
                ? "border-stone-300 bg-white shadow-sm"
                : "border-stone-200 bg-white/70";
              return (
                <details
                  key={`${phase.phase_id}-week-${week.week_order}`}
                  className={`rounded-2xl border px-5 py-4 ${borderClass}`}
                  open={status === "current"}
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-sm font-bold text-stone-900">
                        Semaine {week.week_order}
                      </p>
                      {weekCalendar ? (
                        <span className="rounded-full bg-white px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-700">
                          {formatPlanDateRange(weekCalendar.startDate, weekCalendar.endDate)}
                        </span>
                      ) : null}
                      <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-stone-600">
                        {status === "completed"
                          ? "tenue"
                          : status === "current"
                          ? "maintenant"
                          : "à venir"}
                      </span>
                      {weekCalendar ? (
                        <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-800">
                          {status === "current" && weekCalendar.daysRemaining != null
                            ? `${weekCalendar.daysRemaining} jour${weekCalendar.daysRemaining > 1 ? "s" : ""} restant${weekCalendar.daysRemaining > 1 ? "s" : ""}`
                            : `${weekCalendar.dayCount} jour${weekCalendar.dayCount > 1 ? "s" : ""}`}
                        </span>
                      ) : null}
                      {weekTarget ? (
                        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-900">
                          Cible: {weekTarget}
                        </span>
                      ) : null}
                    </div>
                    <ChevronDown className="h-4 w-4 shrink-0 text-stone-400" />
                  </summary>
                  <div className="mt-4 border-t border-stone-100 pt-4">
                    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
                      <div className="flex flex-wrap gap-8">
                        {week.reps_summary ? (
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-500">
                              Répétitions
                            </p>
                            <p className="mt-1 text-sm font-medium text-stone-700">
                              {week.reps_summary}
                            </p>
                          </div>
                        ) : null}
                        {weekMissionTiming.summaryDays.length > 0 ? (
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-500">
                              Jours des missions
                            </p>
                            <p className="mt-1 text-sm font-medium text-stone-700">
                              {formatMissionDays(weekMissionTiming.summaryDays)}
                            </p>
                          </div>
                        ) : null}
                      </div>

                      {status === "current" && weekCalendar && weekItems.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => setPlanningModalWeekKey(weekCalendar.anchorWeekStart)}
                          disabled={planningLoading}
                          className={`relative inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-medium transition-all disabled:opacity-60 ${
                            planningStatus === "confirmed"
                              ? "border-stone-200 bg-white text-stone-600 shadow-sm hover:border-stone-300 hover:bg-stone-50"
                              : "border-amber-200/80 bg-amber-50/70 text-amber-900/80 hover:bg-amber-100/80 hover:border-amber-300/80 active:scale-[0.98]"
                          }`}
                        >
                          <CalendarDays className={`h-4 w-4 ${planningStatus === "confirmed" ? "text-stone-500" : "text-amber-900/60"}`} />
                          <span className={planningStatus !== "confirmed" && !planningLoading ? "animate-pulse" : ""}>
                            {planningLoading
                              ? "Chargement..."
                              : planningStatus === "confirmed"
                              ? "Modifier le planning"
                              : "Valider le planning"}
                          </span>
                        </button>
                      ) : null}
                    </div>

                    {weekSections.length > 0 ? (
                      <div className="grid gap-3 md:grid-cols-2">
                        {weekSections.flatMap((section) =>
                          section.items.map((item) => (
                            <PlanItemCard
                              key={`${phase.phase_id}-week-${week.week_order}-${item.id}`}
                              item={item}
                              weekCalendar={weekCalendar}
                              weekStatus={status}
                              weekOrder={week.week_order}
                              recommendedDays={weekMissionTiming.recommendedDaysByItemId.get(item.id) ?? null}
                              onOpenWeekPlanning={status === "current" && weekCalendar
                                ? () => setPlanningModalWeekKey(weekCalendar.anchorWeekStart)
                                : null}
                              unlockState={unlockStateByItemId.get(item.id) ?? null}
                              isBusy={busyItemId === item.id}
                              onComplete={onComplete}
                              onActivate={onActivate}
                              onPrepareCards={onPrepareCards}
                              onOpenDefenseResourceEditor={onOpenDefenseResourceEditor}
                              onBlocker={onBlocker}
                              onDeactivate={onDeactivate}
                              onRemove={onRemove}
                              onAdapt={onAdapt}
                            />
                          ))
                        )}
                      </div>
                    ) : null}
                  </div>
                </details>
              );
            })}
          </div>
        </div>
      ) : null}

      {planningModalEntry?.weekCalendar ? (
        <WeekPlanningModal
          isOpen={planningModalWeekKey === planningModalEntry.weekCalendar.anchorWeekStart}
          weekTitle={`Semaine ${planningModalEntry.week.week_order}`}
          weekCalendar={planningModalEntry.weekCalendar}
          items={planningModalEntry.weekItems}
          preferredDaysByItemId={planningModalEntry.weekMissionTiming.recommendedDaysByItemId}
          onClose={() => setPlanningModalWeekKey(null)}
          onSaved={(status) => {
            setWeekPlanningStatusByKey((current) => ({
              ...current,
              [planningModalEntry.weekCalendar!.anchorWeekStart]: status,
            }));
          }}
        />
      ) : null}

      {phase.transition_ready ? (
        <div className="mb-10 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700">
                Bilan de fin de niveau
              </p>
              <p className="mt-2 text-sm leading-6 text-stone-700">
                Tu as bouclé les actions de ce niveau. Prends 2 minutes pour dire comment il s&apos;est
                passé avant de lancer la suite.
              </p>
            </div>
            {onCompleteLevel ? (
              <button
                type="button"
                onClick={onCompleteLevel}
                disabled={completeLevelBusy}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {completeLevelBusy ? "Préparation..." : "Terminer ce niveau"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Sections (Fallbacks if no weeks are defined) */}
      {phase.weeks.length === 0 && sections.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2">
          {sections.flatMap((section) =>
            section.items.map((item) => (
              <PlanItemCard
                key={item.id}
                item={item}
                weekCalendar={null}
                weekStatus={null}
                weekOrder={null}
                recommendedDays={null}
                onOpenWeekPlanning={null}
                unlockState={unlockStateByItemId.get(item.id) ?? null}
                isBusy={busyItemId === item.id}
                onComplete={onComplete}
                onActivate={onActivate}
                onPrepareCards={onPrepareCards}
                onOpenDefenseResourceEditor={onOpenDefenseResourceEditor}
                onBlocker={onBlocker}
                onDeactivate={onDeactivate}
                onRemove={onRemove}
                onAdapt={onAdapt}
              />
            ))
          )}
        </div>
      ) : null}

      {levelToolRecommendations.length > 0 ? (
        <div className="mt-8">
          <LevelToolRecommendationsCard
            recommendations={levelToolRecommendations}
            onChanged={onLevelToolRecommendationChanged}
          />
        </div>
      ) : null}
    </div>
  );
}

function FuturePhase({
  phase,
  primaryMetricLabel,
}: {
  phase: PhaseRuntimeData;
  primaryMetricLabel?: string | null;
}) {
  const durationLabel = phase.duration_guidance ?? formatDurationWeeks(phase.duration_weeks);

  if (phase.summary_mode === "preview") {
    return (
      <div className="rounded-3xl border border-stone-200 bg-stone-50/50 px-6 py-5 opacity-80">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stone-200 text-stone-400">
            <Lock className="h-5 w-5" />
          </div>
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500">
              Niveau de plan {phase.phase_order} — À venir
            </p>
            <div className="flex items-center gap-2">
              <h4 className="text-base font-bold text-stone-700">
                {phase.title}
              </h4>
              {durationLabel ? (
                <>
                  <span className="hidden text-stone-300 sm:inline">•</span>
                  <span className="text-sm font-medium text-stone-500">
                    {durationLabel}
                  </span>
                </>
              ) : null}
            </div>
            <p className="mt-3 text-sm leading-relaxed text-stone-600">
              {phase.intention || phase.phase_objective}
            </p>
            {phase.phase_objective && phase.phase_objective !== phase.intention ? (
              <p className="mt-2 text-sm leading-relaxed text-stone-500">
                {phase.phase_objective}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-stone-200 bg-stone-50/50 px-6 py-5 opacity-70">
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-stone-200 text-stone-400">
          <Lock className="h-5 w-5" />
        </div>
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-stone-500">
            Niveau de plan {phase.phase_order} — À venir
          </p>
          <div className="flex items-center gap-2">
            <h4 className="text-base font-bold text-stone-700">
              {phase.title}
            </h4>
            {durationLabel ? (
              <>
                <span className="hidden text-stone-300 sm:inline">•</span>
                <span className="text-sm font-medium text-stone-500">
                  {durationLabel}
                </span>
              </>
            ) : null}
          </div>
          {phase.phase_metric_target ? (
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
              Progression vers l&apos;objectif final
              {primaryMetricLabel ? ` (${primaryMetricLabel})` : ""} : {phase.phase_metric_target}
            </p>
          ) : null}
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <p className="text-sm leading-relaxed text-stone-600">
              <span className="font-semibold text-stone-700">Ce qu&apos;on tacle :</span>{" "}
              {phase.what_this_phase_targets || phase.phase_objective}
            </p>
            <p className="text-sm leading-relaxed text-stone-600">
              <span className="font-semibold text-stone-700">Pourquoi maintenant :</span>{" "}
              {phase.why_this_now || phase.rationale}
            </p>
            <p className="text-sm leading-relaxed text-stone-600">
              <span className="font-semibold text-stone-700">Comment :</span>{" "}
              {phase.how_this_phase_works || phase.phase_objective}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PhaseProgressionSkeleton() {
  return (
    <section className="space-y-4 animate-pulse">
      <div className="rounded-[28px] border border-gray-100 bg-white px-5 py-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-blue-100" />
          <div className="space-y-2">
            <div className="h-3 w-28 rounded bg-blue-100" />
            <div className="h-5 w-48 rounded bg-gray-200" />
          </div>
        </div>
        <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-4 space-y-3">
          <div className="h-3 w-20 rounded bg-gray-200" />
          <div className="h-5 w-36 rounded bg-gray-200" />
          <div className="h-2.5 rounded-full bg-gray-200" />
        </div>
        <div className="mt-3 h-11 rounded-xl bg-blue-100" />
        <div className="mt-4 space-y-3">
          <div className="h-16 rounded-xl bg-gray-100" />
          <div className="h-16 rounded-xl bg-gray-100" />
        </div>
      </div>
      <div className="rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4 opacity-60">
        <div className="flex items-center gap-3">
          <div className="h-4 w-4 rounded bg-gray-200" />
          <div className="h-4 w-40 rounded bg-gray-200" />
        </div>
      </div>
    </section>
  );
}

export function PhaseProgression({
  phases,
  scheduleAnchor,
  planAdjustmentRevision,
  phase1Node,
  activePhaseFooterNode,
  renderPhaseFooterNode,
  levelToolRecommendationsByPhaseId,
  onLevelToolRecommendationChanged,
  primaryMetricLabel,
  unlockStateByItemId,
  busyItemId,
  onComplete,
  onActivate,
  onPrepareCards,
  onOpenDefenseResourceEditor,
  onBlocker,
  onDeactivate,
  onRemove,
  onAdapt,
  onLogHeartbeat,
  onCompleteLevel,
  completeLevelBusy,
  onCompletionAction,
  completionActionLabel,
  completionActionHint,
  journeyContext,
}: PhaseProgressionProps) {
  const noopRefetch = async () => {};
  const recosFor = (phaseId: string) =>
    levelToolRecommendationsByPhaseId?.get(phaseId) ?? [];
  const handleRecoChanged = onLevelToolRecommendationChanged ?? noopRefetch;
  const showTimeline = phases.length > 1 || (phases.length > 0 && !!phase1Node);
  const allCompleted = phases.length > 0 && phases.every((p) => p.state === "completed");
  const isMultiPart = journeyContext?.is_multi_part === true;
  const currentPart = journeyContext?.part_number ?? 1;
  const totalParts = journeyContext?.estimated_total_parts;

  const [prevPhaseKey, setPrevPhaseKey] = useState("");
  const phaseKey = phases.map((p) => `${p.phase_id}:${p.state}`).join(",");
  const isTransitioning = prevPhaseKey !== "" && prevPhaseKey !== phaseKey;
  
  useEffect(() => {
    setPrevPhaseKey(phaseKey);
  }, [phaseKey]);

  return (
    <section className="space-y-4">
      {allCompleted ? (
        <div className="mb-5 rounded-3xl border border-emerald-300 bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 px-6 py-6 text-center shadow-sm">
          <PartyPopper className="mx-auto h-8 w-8 text-emerald-500" />
          <h3 className="mt-3 text-xl font-semibold text-emerald-900">
            {isMultiPart
              ? `Niveau ${currentPart} terminé ! Prêt pour la suite ?`
              : "Transformation achevée !"}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-emerald-700">
            {completionActionHint
              ? completionActionHint
              : isMultiPart && totalParts
                ? `Tu as complété le niveau ${currentPart} sur ${totalParts}.`
                : "Tu as complété tous les niveaux de ce plan."}
          </p>
          {onCompletionAction && completionActionLabel ? (
            <button
              type="button"
              onClick={onCompletionAction}
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-[0.97]"
            >
              {completionActionLabel}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className={`relative ${showTimeline ? "pl-0 lg:pl-0" : ""}`}>
        {showTimeline ? (
          <div className="absolute bottom-4 left-3 lg:-left-8 top-10 w-px bg-gray-200 transition-all duration-700 hidden sm:block" />
        ) : null}

        <div className="grid gap-3 lg:pl-0 sm:pl-10">
          {phase1Node ? (
            <div className="relative transition-all duration-500 mb-2">
              {showTimeline ? (
                <div className="absolute -left-10 lg:-left-[43px] top-10 z-10 hidden sm:grid h-6 w-6 place-items-center rounded-full border-[1.5px] border-emerald-400 bg-white text-emerald-500 scale-100">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                </div>
              ) : null}
              {phase1Node}
            </div>
          ) : null}

          {phases.map((phase) => (
            <div
              key={phase.phase_id}
              className={`relative transition-all duration-500 ${isTransitioning ? "animate-in fade-in slide-in-from-bottom-2" : ""}`}
            >
              {showTimeline ? (
                <div
                  className={`absolute -left-10 lg:-left-[43px] top-10 z-10 hidden sm:grid h-6 w-6 place-items-center rounded-full border-[1.5px] transition-all duration-500 bg-white ${
                    phase.state === "completed"
                      ? "border-emerald-400 text-emerald-500 scale-100"
                      : phase.state === "active"
                        ? "border-blue-500 text-blue-500 scale-110 shadow-[0_0_0_3px_rgba(59,130,246,0.1)]"
                        : "border-gray-300 text-gray-400 scale-90"
                  }`}
                >
                  {phase.state === "completed" ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : phase.state === "active" ? (
                    <Target className="h-3.5 w-3.5" />
                  ) : (
                    <Lock className="h-3 w-3" />
                  )}
                </div>
              ) : null}

              {phase.state === "completed" ? (
                <div className="space-y-4">
                  <CompletedPhase
                    phase={phase}
                    primaryMetricLabel={primaryMetricLabel}
                    levelToolRecommendations={recosFor(phase.phase_id)}
                    onLevelToolRecommendationChanged={handleRecoChanged}
                  />
                  {renderPhaseFooterNode?.(phase)}
                </div>
              ) : phase.state === "active" ? (
                <div className="space-y-4">
                  <ActivePhase
                    phase={phase}
                    scheduleAnchor={scheduleAnchor}
                    planAdjustmentRevision={planAdjustmentRevision}
                    primaryMetricLabel={primaryMetricLabel}
                    unlockStateByItemId={unlockStateByItemId}
                    busyItemId={busyItemId}
                    onComplete={onComplete}
                    onActivate={onActivate}
                    onPrepareCards={onPrepareCards}
                    onOpenDefenseResourceEditor={onOpenDefenseResourceEditor}
                    onBlocker={onBlocker}
                    onDeactivate={onDeactivate}
                    onRemove={onRemove}
                    onAdapt={onAdapt}
                    onLogHeartbeat={onLogHeartbeat}
                    onCompleteLevel={onCompleteLevel}
                    completeLevelBusy={completeLevelBusy}
                    levelToolRecommendations={recosFor(phase.phase_id)}
                    onLevelToolRecommendationChanged={handleRecoChanged}
                  />
                  {renderPhaseFooterNode?.(phase)}
                  {activePhaseFooterNode}
                </div>
              ) : (
                <div className="space-y-4">
                  <FuturePhase
                    phase={phase}
                    primaryMetricLabel={primaryMetricLabel}
                  />
                  {renderPhaseFooterNode?.(phase)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
