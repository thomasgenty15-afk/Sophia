import React from "react";
import { useAuth } from "../../context/AuthContext";
import {
  addDays,
  localDateIn,
  weekStartFor,
} from "../api/dates";
import {
  loadProgressSnapshot,
  loadPublishedPlanVersion,
  loadTodaySnapshot,
} from "../api/keelClient";
import { deviationKindLabel } from "../api/labels";
import {
  computeObstaclesCleared,
  computeRegularity,
  computeStreaks,
  countMet,
  eventCountsByDate,
  type ObstacleCleared,
  type Streaks,
  WEEK_DAYS,
  type WeekRegularity,
} from "../api/progressModel";
import type { WeekFact, WeekSource } from "../api/weekModel";
import type { DayToken, PlanVersionRow } from "../api/types";
import KeelAppShell from "../components/KeelAppShell";
import WeekView from "../components/WeekView";
import { t } from "../i18n/t";

// KEEL — /app/progress.
//
// THE WEEK IS FIRST, AND IT IS THE SHARED ONE. `WeekView` is the same component
// the coach mounts on /coach/clients/:id: same layout, same model, same gate.
// This page injects nothing but a loader — the student's own rows, read under
// their own JWT. That is the whole difference between the two screens, and it
// lives in `loadWeek` below, not in the component.
//
// BELOW IT, THE TREND, which is this page's own: four weeks of regularity,
// streaks, obstacles cleared, and — last, folded, on purpose — the weight. It
// is the most demotivating number a nutrition product can show, because it
// stalls for weeks and swings two kilos on water while the behaviour is already
// changing.
//
// NO CALORIE FIGURES ANYWHERE ON THIS PAGE, by construction: nothing here reads
// a `measure='energy'` value or any macro. The counts below are counts of ROWS
// (days logged, evaluations resolved `met`, deviations navigated).
//
// NO ADHERENCE PERCENTAGE unless two conditions hold at once: the week passes
// the 4/7 logging gate AND a `weekly_reviews` row exists to be read. The client
// never computes adherence itself — the formula lives once, server-side.

const WINDOW_WEEKS = 4;
const WINDOW_DAYS = WINDOW_WEEKS * WEEK_DAYS;

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "no_plan" }
  | { kind: "ready"; data: ReadyData };

interface ReadyData {
  planVersion: PlanVersionRow;
  today: string;
  regularity: WeekRegularity[];
  currentWeekStart: string;
  streaks: Streaks;
  metCount: number;
  obstacles: ObstacleCleared[];
  weightAverage: string | null;
}

function readWeightAverage(outcomes: Record<string, unknown> | null): string | null {
  if (!outcomes) return null;
  // Render-layer read of a jsonb payload. R5 forbids the EVALUATOR from doing
  // this; display material is exactly what `outcomes` is for.
  const raw = outcomes["weight_7d_avg"];
  if (typeof raw === "number") return String(raw);
  if (typeof raw === "string" && raw.trim() !== "") return raw;
  return null;
}

export default function ProgressPage() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [state, setState] = React.useState<LoadState>({ kind: "loading" });
  const [showOutcomes, setShowOutcomes] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    if (!userId) return;

    (async () => {
      try {
        const planVersion = await loadPublishedPlanVersion(userId);
        if (!planVersion) {
          if (!cancelled) setState({ kind: "no_plan" });
          return;
        }
        const today = localDateIn(planVersion.timezone);
        const weekStartsOn = (planVersion.week_starts_on || "mon") as DayToken;
        const currentWeekStart = weekStartFor(today, weekStartsOn);
        const firstWeekStart = addDays(
          currentWeekStart,
          -(WINDOW_WEEKS - 1) * WEEK_DAYS,
        );
        const snapshot = await loadProgressSnapshot({
          userId,
          fromDate: firstWeekStart,
          toDate: today,
        });

        const counts = eventCountsByDate(snapshot.events);
        const weekStarts = Array.from(
          { length: WINDOW_WEEKS },
          (_, i) => addDays(firstWeekStart, i * WEEK_DAYS),
        );

        const streakDates: string[] = [];
        for (let i = WINDOW_DAYS - 1; i >= 0; i--) streakDates.push(addDays(today, -i));

        const data: ReadyData = {
          planVersion,
          today,
          regularity: computeRegularity(weekStarts, counts),
          currentWeekStart,
          streaks: computeStreaks(streakDates, counts),
          metCount: countMet(snapshot.evaluations),
          obstacles: computeObstaclesCleared({
            deviations: snapshot.deviations,
            evaluations: snapshot.evaluations,
          }),
          weightAverage: snapshot.reviews
            .map((r) => readWeightAverage(r.outcomes))
            .find((v) => v !== null) ?? null,
        };
        if (!cancelled) setState({ kind: "ready", data });
      } catch (err) {
        if (!cancelled) {
          setState({
            kind: "error",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const planVersionId = state.kind === "ready" ? state.data.planVersion.id : null;

  /**
   * The ONE thing this page injects into the shared week.
   *
   * Two grouped reads rather than one: `loadTodaySnapshot` is the client's only
   * function that returns the WEEK'S COMMITMENTS, and `loadProgressSnapshot` is
   * the only one that returns `weekly_reviews`. Three of their queries overlap;
   * merging them would mean a new function in `keelClient.ts`, outside this
   * lot's file perimeter. The redundancy is visible and cheap (one student, one
   * week); a second hand-rolled query that drifts from the first is not.
   */
  const loadWeek = React.useCallback(
    async (args: { weekStart: string; weekDates: string[] }): Promise<WeekSource> => {
      if (!userId || !planVersionId) {
        throw new Error("[keel/progress] no published plan to read a week from");
      }
      const [week, snapshot] = await Promise.all([
        loadTodaySnapshot({ userId, planVersionId, weekDates: args.weekDates }),
        loadProgressSnapshot({
          userId,
          fromDate: args.weekDates[0],
          toDate: args.weekDates[args.weekDates.length - 1],
        }),
      ]);
      return {
        lines: week.commitments,
        evaluations: week.evaluations,
        // `has_media: null` means "this read does not expose it", never "no
        // photo": the student's own `protocol_events` select carries no
        // `media_path` (W1 arbitration — storage is reached through an edge
        // function, never from this client).
        facts: week.events.map((e): WeekFact => ({
          id: e.id,
          occurred_at: e.occurred_at,
          local_date: e.local_date,
          slot_key: e.slot_key,
          source: e.source,
          quantity: e.quantity,
          unit: e.unit,
          has_media: null,
        })),
        deviations: week.deviations,
        review: snapshot.reviews.find(
          (r) => r.week_start_date === args.weekStart,
        ) ?? null,
      };
    },
    [userId, planVersionId],
  );

  if (state.kind === "loading") {
    return (
      <KeelAppShell title={t("progress.title")}>
        <p className="text-sm text-gray-500">{t("progress.loading")}</p>
      </KeelAppShell>
    );
  }

  if (state.kind === "error") {
    return (
      <KeelAppShell title={t("progress.title")}>
        <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">
          {t("progress.error")}
        </p>
        <p className="mt-2 font-mono text-xs text-gray-400">{state.message}</p>
      </KeelAppShell>
    );
  }

  if (state.kind === "no_plan") {
    return (
      <KeelAppShell title={t("progress.title")}>
        <div className="rounded-lg border border-dashed border-gray-300 p-6">
          <h2 className="text-sm font-medium text-gray-900">
            {t("today.no_plan_title")}
          </h2>
          <p className="mt-1 text-sm text-gray-500">{t("today.no_plan_body")}</p>
        </div>
      </KeelAppShell>
    );
  }

  const { data } = state;

  return (
    <KeelAppShell title={t("progress.title")} subtitle={t("progress.subtitle")}>
      {/* 1 — THE WEEK. The same component, the same rendering, the same numbers
          the coach reads on /coach/clients/:id. Weeks are navigable inside it. */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-gray-400">
          {t("progress.week_title")}
        </h2>
        <WeekView
          timezone={data.planVersion.timezone}
          weekStartsOn={(data.planVersion.week_starts_on || "mon") as DayToken}
          loadWeek={loadWeek}
          subjectKey={data.planVersion.id}
        />
      </section>

      <h2 className="mb-3 border-t border-gray-100 pt-6 text-sm font-medium uppercase tracking-wide text-gray-400">
        {t("progress.trend_title", { weeks: WINDOW_WEEKS })}
      </h2>

      {/* 2 — REGULARITY, first of the trend because it is the thing that moves. */}
      <section className="mb-6">
        <h3 className="text-sm font-medium uppercase tracking-wide text-gray-400">
          {t("progress.regularity_title")}
        </h3>
        <p className="mt-0.5 text-xs text-gray-400">
          {t("progress.regularity_caption")}
        </p>
        <div className="mt-3 space-y-2">
          {data.regularity.map((week) => (
            <div key={week.weekStart} className="flex items-center gap-3">
              <span className="w-36 shrink-0 text-xs text-gray-500">
                {week.weekStart === data.currentWeekStart
                  ? t("progress.week_current")
                  : t("progress.week_label", { date: week.weekStart })}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-emerald-500"
                  style={{ width: `${week.pct}%` }}
                />
              </div>
              <span className="w-24 shrink-0 text-right text-xs tabular-nums text-gray-600">
                {t("progress.regularity_days", {
                  count: week.loggedDays,
                  total: WEEK_DAYS,
                })}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* 3 — STREAKS. */}
      <section className="mb-6">
        <h3 className="text-sm font-medium uppercase tracking-wide text-gray-400">
          {t("progress.streaks_title")}
        </h3>
        <div className="mt-3 flex gap-3">
          <StatCard
            label={t("progress.streak_current")}
            value={dayCount(data.streaks.current)}
          />
          <StatCard
            label={t("progress.streak_best")}
            value={dayCount(data.streaks.best)}
          />
        </div>
        <p className="mt-3 text-xs text-gray-500">
          {t("progress.kept_title")}: {t("progress.kept_value", {
            count: data.metCount,
            days: WINDOW_DAYS,
          })}
        </p>
        <p className="mt-0.5 text-xs text-gray-400">
          {t("progress.kept_caption")}
        </p>
      </section>

      {/* 4 — OBSTACLES CLEARED. */}
      <section className="mb-6">
        <h3 className="text-sm font-medium uppercase tracking-wide text-gray-400">
          {t("progress.obstacles_title")}
        </h3>
        <p className="mt-0.5 text-xs text-gray-400">
          {t("progress.obstacles_caption")}
        </p>
        {data.obstacles.length === 0
          ? (
            <p className="mt-3 rounded-lg border border-dashed border-violet-200 bg-violet-50 p-3 text-xs text-violet-800">
              {t("progress.obstacles_empty")}
            </p>
          )
          : (
            <ul className="mt-3 space-y-1.5">
              {data.obstacles.map((o) => (
                <li
                  key={`${o.localDate}-${o.kind}`}
                  className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900"
                >
                  {t("progress.obstacles_entry", {
                    kind: deviationKindLabel(o.kind),
                    date: o.localDate,
                    count: o.keptCount,
                  })}
                </li>
              ))}
            </ul>
          )}
      </section>

      {/* 5 — BODY MEASURES, last and folded. */}
      <section className="border-t border-gray-100 pt-4">
        <button
          type="button"
          onClick={() => setShowOutcomes((v) => !v)}
          className="text-xs text-gray-500 underline"
        >
          {showOutcomes ? t("progress.outcomes_hide") : t("progress.outcomes_show")}
        </button>
        {showOutcomes && (
          <div className="mt-3">
            <h3 className="text-sm font-medium uppercase tracking-wide text-gray-400">
              {t("progress.outcomes_title")}
            </h3>
            <p className="mt-0.5 text-xs text-gray-400">
              {t("progress.outcomes_caption")}
            </p>
            <p className="mt-2 text-sm text-gray-700">
              {data.weightAverage === null
                ? t("progress.outcomes_empty")
                : t("progress.outcomes_weight", { value: data.weightAverage })}
            </p>
          </div>
        )}
      </section>
    </KeelAppShell>
  );
}

function dayCount(count: number): string {
  return count === 1
    ? t("progress.day_value", { count })
    : t("progress.days_value", { count });
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 rounded-lg bg-gray-50 p-3">
      <div className="text-xl font-semibold tabular-nums text-gray-900">
        {value}
      </div>
      <div className="mt-0.5 text-xs text-gray-500">{label}</div>
    </div>
  );
}
