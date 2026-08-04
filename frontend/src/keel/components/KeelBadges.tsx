import React from "react";
import { priorityLabel, statusLabel, timingLabel } from "../api/labels";
import type { EvalStatus, TimingStatus } from "../api/types";

// KEEL — the small typed badges shared by the student screens.
//
// Visual vocabulary matches PlanImportPage: rounded rectangles, one tint per
// token, no UI framework. The tints carry meaning and it is a deliberate one:
// `unknown` is NEUTRAL, not red. A day not logged is not a day failed, and the
// colour must not say otherwise before the evaluator has spoken.

const STATUS_STYLE: Record<EvalStatus, string> = {
  unknown: "bg-gray-100 text-gray-600",
  met: "bg-emerald-100 text-emerald-800",
  partial: "bg-sky-100 text-sky-800",
  missed: "bg-rose-100 text-rose-700",
  not_applicable: "bg-violet-100 text-violet-700",
  flex_used: "bg-violet-100 text-violet-700",
};

export function StatusBadge({ status }: { status: EvalStatus }) {
  const style = STATUS_STYLE[status];
  if (!style) {
    // R7: an unstyled status is a status we did not think about.
    throw new Error(`[keel/badges] no style for status "${status}"`);
  }
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${style}`}>
      {statusLabel(status)}
    </span>
  );
}

const PRIORITY_STYLE: Record<string, string> = {
  core: "bg-emerald-50 text-emerald-700 border-emerald-200",
  secondary: "bg-sky-50 text-sky-700 border-sky-200",
  optional: "bg-gray-50 text-gray-500 border-gray-200",
};

export function PriorityBadge({ priority }: { priority: string }) {
  const style = PRIORITY_STYLE[priority];
  if (!style) throw new Error(`[keel/badges] no style for priority "${priority}"`);
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[11px] ${style}`}>
      {priorityLabel(priority)}
    </span>
  );
}

/**
 * "Done, but at the wrong time" must be expressible (CONTRACT R6). Only
 * `off_window` is worth showing: the other three are either the default or the
 * absence of a question.
 */
export function TimingNote({ timing }: { timing: TimingStatus }) {
  if (timing !== "off_window") return null;
  return (
    <span className="text-[11px] text-amber-700">{timingLabel(timing)}</span>
  );
}
