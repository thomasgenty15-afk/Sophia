import React from "react";
import { activityLabel, commitmentAmount } from "../api/labels";
import type { TodayLine } from "../api/todayModel";
import { t } from "../i18n/t";
import { PriorityBadge, StatusBadge, TimingNote } from "./KeelBadges";

// KEEL — one prescribed engagement, as the student sees it.
//
// TWO ROWS OF TRUTH, NEVER MERGED:
//   - the badge on the right is the DERIVED status, written server-side;
//   - "Logged 2x today" underneath counts FACTS this student recorded.
// Tapping "Log it" moves the second line immediately and leaves the first
// alone. That gap is not a latency bug to paper over: announcing `met` on a tap
// would be announcing an evaluation nobody computed.
//
// FAMILY IDENTITY (E1) also lives here. `activity_class` used to render as a
// grey word among four other grey words, which made it invisible: a student
// could not scan a screen and see "the nutrition lines held, the movement one
// did not". It is now a tinted chip with a glyph, and the SAME chip heads the
// family sections and the day tally on TodayPage — one family, one colour,
// one icon, everywhere.
//
// Why the chip is defined in this file rather than in `KeelBadges`: the badges
// module owns the DERIVED vocabulary (status, priority, timing). A family is
// not a grade, and giving it a home next to grades is how the two start looking
// alike. `ACTIVITY_TINT` deliberately avoids emerald and rose, the two colours
// StatusBadge uses to mean kept and missed.

/**
 * One tint per family. The classes are written out in full because Tailwind
 * scans source text: a template-built class name (`bg-${c}-50`) is a class that
 * does not exist in the stylesheet, and the chip would render colourless.
 */
const ACTIVITY_TINT: Record<string, string> = {
  nutrition: "bg-lime-50 text-lime-800 border-lime-200",
  supplement: "bg-amber-50 text-amber-800 border-amber-200",
  movement: "bg-orange-50 text-orange-800 border-orange-200",
  recovery: "bg-teal-50 text-teal-800 border-teal-200",
  exposure: "bg-cyan-50 text-cyan-800 border-cyan-200",
  sleep: "bg-indigo-50 text-indigo-800 border-indigo-200",
  mind: "bg-fuchsia-50 text-fuchsia-800 border-fuchsia-200",
  measurement: "bg-slate-50 text-slate-700 border-slate-200",
  other: "bg-gray-50 text-gray-600 border-gray-200",
};

/** The glyph of each family, as a stroked path on a 24x24 grid. */
const ACTIVITY_GLYPH: Record<string, string> = {
  nutrition: "M20 4c0 9-5 14-13 14M7 18c0-6 5-10 11-11",
  supplement: "M8 20a5 5 0 0 1-4-8l8-8a5 5 0 0 1 8 4 5 5 0 0 1-1 3l-8 8a5 5 0 0 1-3 1zM8 8l8 8",
  movement: "M3 13h4l3-8 4 16 3-8h4",
  recovery: "M20 12a8 8 0 1 1-3-6M20 3v4h-4",
  exposure: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19",
  sleep: "M20 14A8.5 8.5 0 0 1 10 4a8 8 0 1 0 10 10z",
  mind: "M12 3l2.2 4.8L19 10l-4.8 2.2L12 17l-2.2-4.8L5 10l4.8-2.2z",
  measurement: "M5 20v-7M12 20V4M19 20v-11",
  other: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z",
};

/**
 * The family of a line, as a chip. R7: an unknown `activity_class` throws here
 * exactly as it does in `todayModel` and in `activityLabel` — a family with no
 * colour is a family this build never heard of, and rendering it grey would
 * quietly file it under nothing.
 */
export function ActivityChip(
  { activityClass, size = "sm" }: { activityClass: string; size?: "sm" | "md" },
) {
  const tint = ACTIVITY_TINT[activityClass];
  const glyph = ACTIVITY_GLYPH[activityClass];
  if (!tint || !glyph) {
    throw new Error(
      `[keel/line] no visual identity for activity_class "${activityClass}" (R7)`,
    );
  }
  const box = size === "md" ? "gap-1.5 px-2 py-0.5 text-xs" : "gap-1 px-1.5 py-0.5 text-[11px]";
  const icon = size === "md" ? 14 : 12;
  return (
    <span
      className={`inline-flex items-center rounded border font-medium ${tint} ${box}`}
    >
      <svg
        width={icon}
        height={icon}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="shrink-0"
      >
        <path d={glyph} />
      </svg>
      {activityLabel(activityClass)}
    </span>
  );
}

export interface CommitmentLineProps {
  line: TodayLine;
  pending: boolean;
  onLog: (line: TodayLine) => void;
}

export function CommitmentLine({ line, pending, onLog }: CommitmentLineProps) {
  const c = line.commitment;
  // The student reads the SAME phrase the coach wrote and re-read at import
  // ("5000 IU", "none", "by 23:00"), not the storage triple. See
  // `commitmentAmount`: the previous renderer printed "<= 2300 time" and "0".
  const target = commitmentAmount(c);
  const loggedCount = line.loggedEvents.length;
  // A silent device feed is read, not ticked (CONTRACT R6: auto_source yields
  // `unknown`, never `missed` — and never a button asking the student to lie).
  //
  // An `avoid` line is NEVER tappable. Its default is inverted (CONTRACT R6:
  // "no fact => met"), so a tap is the ONE thing that can turn a kept promise
  // into a broken one. The review reproduced it on a real row: "no alcohol on
  // weekdays" scored `met` untouched and `missed` after a tap carrying
  // quantity=0 — and because that line is `grain='week'`, a single tap sank a
  // core commitment for the whole week. Breaking an avoid line is reported in
  // words (chat) or by a photo, never by a button that reads like a checkbox.
  const canLog = !line.isAutoSourced && c.polarity !== "avoid";

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-gray-900">{c.title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
            <ActivityChip activityClass={c.activity_class} />
            {target && <span className="tabular-nums text-gray-700">{target}</span>}
            <PriorityBadge priority={c.priority} />
            <TimingNote timing={line.timingStatus} />
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <StatusBadge status={line.status} />
          {canLog && (
            <button
              type="button"
              disabled={pending}
              onClick={() => onLog(line)}
              className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              {pending ? t("today.log_pending") : t("today.log_button")}
            </button>
          )}
        </div>
      </div>

      {c.student_instruction && (
        <p className="mt-2 border-l-2 border-gray-200 pl-2 text-xs italic text-gray-600">
          <span className="not-italic text-gray-400">
            {t("today.instruction_label")}
          </span>
          {" "}
          {c.student_instruction}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
        {loggedCount > 0 && (
          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700">
            {t("today.logged_count", { count: loggedCount })}
          </span>
        )}
        {line.isAutoSourced && c.auto_source && (
          <span>{t("today.auto_source", { source: c.auto_source })}</span>
        )}
        {!c.counts_toward_adherence && <span>{t("today.outcome_only")}</span>}
        {c.evidence_required && c.evidence_kind === "photo" && (
          <span className="text-amber-700">{t("today.evidence_photo")}</span>
        )}
        {line.coveredByDeviation && (
          <span className="text-violet-700">{t("today.covered_by_deviation")}</span>
        )}
      </div>
    </div>
  );
}

export default CommitmentLine;
