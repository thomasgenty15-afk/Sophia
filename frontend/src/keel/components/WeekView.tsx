import React from "react";
import { localDateIn, weekDatesFrom, weekStartFor } from "../api/dates";
import {
  commitmentAmount,
  deviationKindLabel,
  messageKey,
  slotLabel,
  statusLabel,
  unitLabel,
} from "../api/labels";
import { LOGGED_DAY_MIN_EVENTS, WEEK_DAYS } from "../api/progressModel";
import {
  buildWeekModel,
  isoWeekLabelFor,
  nextWeekStart,
  previousWeekStart,
  type WeekDayCell,
  type WeekLineSummary,
  type WeekModel,
  type WeekSource,
} from "../api/weekModel";
import type { DayToken, EvalStatus } from "../api/types";
import { Card, SectionLabel } from "./ui/Card";
import { t } from "../i18n/t";

// KEEL — ONE week, ONE component, TWO readers.
//
// THE REQUIREMENT, verbatim from the founder: "there is no need for a different
// interface: what the student sees, the coach must see too. And it can be week
// by week. But there also has to be a kind of summary with interesting metrics
// at the end of each week, and the weeks have to be reachable."
//
// SO THE DIFFERENCE BETWEEN THE TWO SCREENS IS NOT IN THIS FILE. There is no
// `viewer` prop, no `isCoach` branch, no copy that changes person. The only
// thing a page injects is `loadWeek` — i.e. WHERE the rows come from, which is
// exactly where the security boundary already lives: the student reads their
// own rows, the coach reads the same week through `coached_student_ids()` and
// the `coach_student_events` view. RLS decides what a reader may see; this
// component decides how a week LOOKS, and there is only one answer.
//
// WHAT THIS MEANS IN PRACTICE, for the coach: they get no privileged number.
// The 4/7 coverage gate closes on both screens at once, the same lines are
// ranked, the same day is blank. And they get no verbatim: `WeekFact` and
// `WeekDeviation` (weekModel.ts) carry no `note`, no `media_path` — there is
// no field here to leak.
//
// ORDER OF THE PAGE, and why: coverage FIRST (the only metric with predictive
// validity early on), then the week's shape day by day, then what held and what
// slipped, then the gated percentage, then the lines, then the raw facts. Never
// weight, never a calorie: nothing below reads an `energy` measure or a macro,
// by construction.

export interface WeekViewProps {
  /** the plan's timezone — every local date on screen is resolved in it */
  timezone: string;
  weekStartsOn: DayToken;
  /**
   * The ONE injected difference between the student's page and the coach's.
   * Must be stable across renders (wrap it in `useCallback`) or memoised by the
   * caller; it is read through a ref so an inline arrow cannot loop the effect.
   */
  loadWeek: (args: {
    weekStart: string;
    weekDates: string[];
  }) => Promise<WeekSource>;
  /** identity of the subject; a change refetches and returns to this week */
  subjectKey: string;
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; model: WeekModel };

export default function WeekView(props: WeekViewProps) {
  const { timezone, weekStartsOn, subjectKey } = props;

  const currentWeekStart = React.useMemo(
    () => weekStartFor(localDateIn(timezone), weekStartsOn),
    [timezone, weekStartsOn],
  );
  const [weekStart, setWeekStart] = React.useState(currentWeekStart);
  const [state, setState] = React.useState<LoadState>({ kind: "loading" });
  const [reloadNonce, setReloadNonce] = React.useState(0);

  const loadRef = React.useRef(props.loadWeek);
  loadRef.current = props.loadWeek;

  // A different student is a different week history: go back to this week.
  React.useEffect(() => setWeekStart(currentWeekStart), [subjectKey, currentWeekStart]);

  React.useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    const weekDates = weekDatesFrom(weekStart);
    (async () => {
      try {
        const source = await loadRef.current({ weekStart, weekDates });
        if (cancelled) return;
        // `today` is resolved AT LOAD TIME, in the plan's timezone: a tab left
        // open across midnight must not keep calling yesterday "today" and
        // greying out a day the student can still log.
        const model = buildWeekModel({
          weekStart,
          weekDates,
          today: localDateIn(timezone),
          source,
        });
        setState({ kind: "ready", model });
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
  }, [subjectKey, weekStart, timezone, reloadNonce]);

  const label = isoWeekLabelFor(weekStart);
  const weekDates = weekDatesFrom(weekStart);
  const canGoNext = weekStart < currentWeekStart;

  return (
    <div>
      <nav className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
        <NavButton
          label={t("week.nav.previous")}
          glyph="<"
          onClick={() => setWeekStart(previousWeekStart(weekStart))}
          disabled={false}
        />
        <div className="text-center">
          <p className="text-sm font-semibold text-gray-900">
            {t("week.label", { week: label.isoWeek, year: label.isoYear })}
          </p>
          <p className="text-xs tabular-nums text-gray-500">
            {t("week.range", {
              from: weekDates[0],
              to: weekDates[WEEK_DAYS - 1],
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {weekStart !== currentWeekStart && (
            <button
              type="button"
              onClick={() => setWeekStart(currentWeekStart)}
              className="rounded-full px-3 py-1 text-xs text-gray-600 underline"
            >
              {t("week.nav.current")}
            </button>
          )}
          <NavButton
            label={t("week.nav.next")}
            glyph=">"
            onClick={() => setWeekStart(nextWeekStart(weekStart))}
            disabled={!canGoNext}
          />
        </div>
      </nav>

      {state.kind === "loading" && (
        <p className="text-sm text-gray-500">{t("week.loading")}</p>
      )}

      {state.kind === "error" && (
        <Card tone="warning">
          <p className="text-sm text-amber-900">{t("week.error")}</p>
          <p className="mt-1 font-mono text-xs text-amber-800">{state.message}</p>
          <button
            type="button"
            onClick={() => setReloadNonce((n) => n + 1)}
            className="mt-2 text-xs text-amber-900 underline"
          >
            {t("week.retry")}
          </button>
        </Card>
      )}

      {state.kind === "ready" && <WeekBody model={state.model} />}
    </div>
  );
}

function WeekBody({ model }: { model: WeekModel }) {
  return (
    <>
      {model.isCurrent && (
        <p className="mb-4 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
          {t("week.in_progress")}
        </p>
      )}

      {!model.hasAnyRecord && (
        <p className="mb-4 rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-400">
          {t("week.empty")}
        </p>
      )}

      {/* 1 — THE SUMMARY. Coverage first, on purpose. */}
      <SectionLabel className="mb-2">{t("week.summary_title")}</SectionLabel>
      <div className="mb-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric
          label={t("week.coverage_label")}
          value={t("week.coverage_value", {
            count: model.coverage.loggedDays,
            total: WEEK_DAYS,
          })}
        />
        <Metric
          label={t("week.run_label")}
          value={dayCount(model.longestRunDays)}
        />
        <Metric
          label={t("week.facts_label")}
          value={String(model.factCount)}
        />
        <Metric
          label={t("week.deviations_label")}
          value={String(model.deviations.length)}
        />
      </div>
      <p className="mb-6 text-xs text-gray-400">
        {t("week.coverage_caption", { min: LOGGED_DAY_MIN_EVENTS })}
      </p>

      {/* 2 — THE WEEK'S SHAPE, day by day. */}
      <section className="mb-6">
        <SectionLabel className="mb-2">{t("week.days_title")}</SectionLabel>
        <div className="grid grid-cols-7 gap-1">
          {model.days.map((day) => (
            <div
              key={day.date}
              title={`${day.date} - ${t("week.day_facts", { count: day.factCount })}`}
              className={[
                "rounded-lg border px-1 py-2 text-center",
                day.isFuture
                  ? "border-dashed border-gray-200 bg-white"
                  : day.countsForCoverage
                  ? "border-emerald-200 bg-emerald-50"
                  : day.factCount > 0
                  ? "border-emerald-100 bg-emerald-50/40"
                  : "border-gray-200 bg-gray-50",
              ].join(" ")}
            >
              <div className="text-[11px] uppercase tracking-wide text-gray-500">
                {dayLabel(day.dayToken)}
              </div>
              <div className="text-sm font-semibold tabular-nums text-gray-900">
                {day.isFuture ? "-" : day.factCount}
              </div>
              {day.deviationKinds.length > 0 && (
                <div className="mt-0.5 text-[10px] text-violet-700">
                  {t("week.day_declared")}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* 3 — WHAT HELD, WHAT SLIPPED. Behind the SAME gate as the percentage. */}
      <section className="mb-6">
        <SectionLabel className="mb-2">{t("week.highlights_title")}</SectionLabel>
        {model.highlights.kind === "insufficient_data"
          ? (
            <p className="rounded-lg bg-gray-50 p-3 text-xs leading-5 text-gray-500">
              {t("week.highlight_locked", {
                min: model.highlights.minLoggedDays,
                logged: model.highlights.loggedDays,
              })}
            </p>
          )
          : model.highlights.mostHeld === null &&
              model.highlights.mostDropped === null
          ? (
            <p className="rounded-lg bg-gray-50 p-3 text-xs leading-5 text-gray-500">
              {t("week.highlight_none")}
            </p>
          )
          : (
            <div className="grid gap-3 sm:grid-cols-2">
              {model.highlights.mostHeld && (
                <Highlight
                  title={t("week.highlight_held")}
                  tone="held"
                  summary={model.highlights.mostHeld}
                />
              )}
              {model.highlights.mostDropped && (
                <Highlight
                  title={t("week.highlight_dropped")}
                  tone="dropped"
                  summary={model.highlights.mostDropped}
                />
              )}
            </div>
          )}
      </section>

      {/* 4 — ADHERENCE. The refusal variant carries no percentage field, so
          there is nothing here to forget to hide. */}
      <section className="mb-6">
        <SectionLabel className="mb-2">{t("week.adherence_label")}</SectionLabel>
        {model.adherence.kind === "insufficient_data"
          ? (
            <div className="rounded-lg bg-gray-50 p-3">
              <span className="rounded bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700">
                {t("week.adherence_locked")}
              </span>
              <p className="mt-2 text-xs leading-5 text-gray-500">
                {model.adherence.reason === "logging_coverage_below_gate"
                  ? t("week.adherence_gate", {
                    min: model.adherence.minLoggedDays,
                    logged: model.adherence.loggedDays,
                  })
                  : t("week.adherence_no_review")}
              </p>
            </div>
          )
          : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Metric
                label={t("progress.adherence_overall")}
                value={`${model.adherence.overallPct}%`}
              />
              {model.adherence.corePct !== null && (
                <Metric
                  label={t("progress.adherence_core")}
                  value={`${model.adherence.corePct}%`}
                />
              )}
              <Metric
                label={t("week.coverage_label")}
                value={t("week.coverage_value", {
                  count: model.adherence.loggedDays,
                  total: WEEK_DAYS,
                })}
              />
            </div>
          )}
      </section>

      {/* 5 — LINE BY LINE. The grid IS the shared view: rows are the coach's
          prescription, columns are the seven days, cells are DERIVED statuses
          read from `commitment_evaluations` — never computed here. */}
      <section className="mb-6">
        <SectionLabel className="mb-2">{t("week.lines_title")}</SectionLabel>
        {model.lines.length === 0
          ? <p className="text-sm text-gray-500">{t("week.lines_empty")}</p>
          : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] border-separate border-spacing-y-1">
                <thead>
                  <tr>
                    <th className="w-1/2 px-1 text-left text-[11px] font-medium uppercase tracking-wide text-gray-400">
                      {t("week.lines_col_line")}
                    </th>
                    {model.days.map((day) => (
                      <th
                        key={day.date}
                        className="px-1 text-center text-[11px] font-medium uppercase tracking-wide text-gray-400"
                      >
                        {dayLabel(day.dayToken)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {model.lines.map((summary) => (
                    <tr key={summary.line.id} className="align-top">
                      <td className="px-1 py-1">
                        <p className="text-sm text-gray-900">{summary.line.title}</p>
                        <p className="text-[11px] text-gray-500">
                          {[
                            summary.line.slot_key
                              ? slotLabel(summary.line.slot_key)
                              : null,
                            commitmentAmount(summary.line) || null,
                            summary.line.evaluation_grain === "week"
                              ? t("week.line_weekly")
                              : null,
                            summary.line.counts_toward_adherence
                              ? null
                              : t("today.outcome_only"),
                          ]
                            .filter(Boolean)
                            .join(" - ")}
                        </p>
                        {summary.line.student_instruction && (
                          <p className="text-[11px] italic text-gray-500">
                            {summary.line.student_instruction}
                          </p>
                        )}
                      </td>
                      {summary.cells.map((cell) => (
                        <td key={cell.date} className="px-1 py-1 text-center">
                          <StatusDot cell={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        <Legend />
      </section>

      {/* 6 — DECLARED IN ADVANCE. Out of the denominator, not out of the week. */}
      <section className="mb-6">
        <SectionLabel className="mb-2">{t("week.deviations_title")}</SectionLabel>
        <p className="mb-2 text-xs text-gray-400">{t("week.deviations_caption")}</p>
        {model.deviations.length === 0
          ? <p className="text-sm text-gray-500">{t("week.deviations_empty")}</p>
          : (
            <ul className="space-y-1.5">
              {model.deviations.map((d) => (
                <li
                  key={d.id}
                  className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900"
                >
                  {t("week.deviation_entry", {
                    kind: deviationKindLabel(d.kind),
                    date: d.local_date,
                  })}
                  {d.consumed_flex && (
                    <span className="ml-2 rounded bg-violet-200 px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
                      {t("week.deviation_flex")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
      </section>

      {/* 7 — THE RAW FACTS, last: the evidence the rest of the page stands on. */}
      <section>
        <SectionLabel className="mb-2">{t("week.facts_title")}</SectionLabel>
        {model.factCount === 0
          ? <p className="text-sm text-gray-500">{t("week.facts_empty")}</p>
          : (
            <ul className="divide-y divide-gray-100">
              {model.facts.map((f) => (
                <li
                  key={f.id}
                  className="flex flex-wrap items-center gap-2 py-2 text-sm"
                >
                  <span className="w-24 shrink-0 text-xs tabular-nums text-gray-500">
                    {f.local_date}
                  </span>
                  <span className="text-xs text-gray-500">
                    {f.slot_key ? slotLabel(f.slot_key) : "-"}
                  </span>
                  <span className="flex-1 text-gray-800">
                    {f.quantity !== null
                      ? `${f.quantity}${f.unit ? ` ${unitLabel(f.unit)}` : ""}`
                      : t("week.facts_logged")}
                  </span>
                  <span className="text-[11px] text-gray-400">
                    {t(messageKey(`event.source.${f.source}`))}
                  </span>
                  {f.has_media === true && (
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">
                      {t("week.facts_photo")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

/**
 * The cell tints mirror `KeelBadges.STATUS_STYLE` deliberately: the same status
 * must not be emerald in a badge and blue in a grid. `unknown` stays NEUTRAL —
 * a day not logged is not a day failed, and the colour must not say otherwise
 * before the evaluator has spoken.
 */
const DOT_STYLE: Record<EvalStatus, string> = {
  unknown: "bg-gray-200",
  met: "bg-emerald-500",
  partial: "bg-sky-400",
  missed: "bg-rose-400",
  not_applicable: "bg-violet-300",
  flex_used: "bg-violet-400",
};

function StatusDot({ cell }: { cell: WeekDayCell }) {
  if (cell.status === null) {
    // No evaluation row. Three different silences, three different marks —
    // collapsing them into one grey square would make "not on the plan" look
    // like "not done".
    if (!cell.scheduled) {
      return (
        <span
          title={`${cell.date} - ${t("week.line_off")}`}
          className="inline-block h-3 w-3 text-gray-300"
        >
          -
        </span>
      );
    }
    return (
      <span
        title={`${cell.date} - ${
          cell.isFuture ? t("week.line_future") : t("week.line_no_row")
        }`}
        className={`inline-block h-3 w-3 rounded-full border ${
          cell.isFuture ? "border-dashed border-gray-300" : "border-gray-300 bg-white"
        }`}
      />
    );
  }
  const style = DOT_STYLE[cell.status];
  // R7: an unstyled status is a status we did not think about.
  if (!style) throw new Error(`[keel/WeekView] no dot style for "${cell.status}"`);
  return (
    <span
      title={`${cell.date} - ${statusLabel(cell.status)}${
        cell.timingStatus === "off_window" ? ` (${t("timing.off_window")})` : ""
      }`}
      className={`inline-block h-3 w-3 rounded-full ${style}`}
    />
  );
}

function Legend() {
  // Every tint that can appear in the grid is named here. A colour on screen
  // with no entry in the legend is a colour the reader has to guess at.
  const shown: EvalStatus[] = [
    "met",
    "partial",
    "missed",
    "flex_used",
    "not_applicable",
    "unknown",
  ];
  return (
    <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-gray-500">
      {shown.map((s) => (
        <span key={s} className="flex items-center gap-1">
          <span className={`inline-block h-2 w-2 rounded-full ${DOT_STYLE[s]}`} />
          {statusLabel(s)}
        </span>
      ))}
    </div>
  );
}

function Highlight({
  title,
  tone,
  summary,
}: {
  title: string;
  tone: "held" | "dropped";
  summary: WeekLineSummary;
}) {
  const border = tone === "held"
    ? "border-emerald-200 bg-emerald-50"
    : "border-amber-200 bg-amber-50";
  return (
    <div className={`rounded-xl border p-3 ${border}`}>
      <p className="text-[11px] uppercase tracking-wide text-gray-500">{title}</p>
      <p className="mt-0.5 text-sm font-medium text-gray-900">
        {summary.line.title}
      </p>
      {/* COUNTS, never a rate: a percentage computed here would be a second
          adherence implementation on the client. */}
      <p className="mt-1 text-xs tabular-nums text-gray-600">
        {t("week.highlight_counts", {
          met: summary.met + summary.flexUsed,
          partial: summary.partial,
          missed: summary.missed,
        })}
      </p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-50 p-3">
      <div className="text-xl font-semibold tabular-nums text-gray-900">{value}</div>
      <div className="mt-0.5 text-xs text-gray-500">{label}</div>
    </div>
  );
}

function NavButton({
  label,
  glyph,
  onClick,
  disabled,
}: {
  label: string;
  glyph: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full border px-3 py-1 text-sm ${
        disabled
          ? "cursor-not-allowed border-gray-200 text-gray-300"
          : "border-gray-300 text-gray-700 hover:bg-white"
      }`}
    >
      {glyph}
    </button>
  );
}

function dayLabel(token: DayToken): string {
  return t(messageKey(`day.${token}`));
}

function dayCount(count: number): string {
  return count === 1
    ? t("progress.day_value", { count })
    : t("progress.days_value", { count });
}
