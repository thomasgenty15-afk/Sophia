import React from "react";

import { messageKey, slotLabel } from "../../api/labels";
import { t } from "../../i18n/t";
import {
  buildCellIndex,
  cellKey,
  DAY_TOKENS,
  type DayToken,
  gridSlots,
  type MealIdea,
  type MealPlanEntry,
  type SlotRow,
  WEEKDAY_TOKENS,
} from "../../api/mealPlanModel";
import { Card, SectionLabel } from "../../components/ui/Card";
import { c } from "./copy";

// KEEL — the week, seven days by the coach's own slot vocabulary.
//
// THE ROWS COME FROM THE DATABASE. `slot_vocabulary` decides which moments
// exist; adding one there adds a row here. There is no list of meal times in
// this file, which is the point — a second vocabulary in the frontend is how
// the coach's grid and the student's day start disagreeing.
//
// TWO CLICKS TO REPEAT. Place a dish once, then `Repeat -> Monday to Friday`.
// That is the whole ergonomic requirement of this screen, and it is why the
// fan-out lives in one server call rather than five: the coach gets ONE result
// line, and it states what was actually written, not what was requested.

export interface MealWeekGridProps {
  entries: MealPlanEntry[];
  ideas: MealIdea[];
  slots: SlotRow[];
  selectedIdea: MealIdea | null;
  busy: boolean;
  /** Highlight, for the coach's eye only; never a claim about the student. */
  todayToken: DayToken | null;
  onPlace: (slotKey: string, days: readonly DayToken[]) => Promise<void>;
  onRemove: (entryId: string) => Promise<void>;
  onRepeat: (entry: MealPlanEntry, days: readonly DayToken[]) => Promise<void>;
}

export function MealWeekGrid(props: MealWeekGridProps) {
  const [repeatFor, setRepeatFor] = React.useState<string | null>(null);

  const rows = gridSlots(props.slots, props.entries);
  const cells = buildCellIndex(props.entries, props.ideas);

  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-start justify-between gap-3 p-4 pb-3">
        <SectionLabel className="mb-0">{c("meals.grid.title")}</SectionLabel>
        <p className="text-sm text-gray-500">
          {props.selectedIdea
            ? c("meals.grid.hint_holding", { title: props.selectedIdea.title })
            : c("meals.grid.hint_idle")}
        </p>
      </div>

      {/* Seven columns never fit a narrow viewport; the table scrolls inside
          its own box so the page itself never scrolls sideways. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] border-t border-gray-200 text-sm">
          <thead>
            <tr>
              <th className="w-32 border-b border-r border-gray-200 bg-gray-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                {c("meals.grid.slot_column")}
              </th>
              {DAY_TOKENS.map((day) => (
                <th
                  key={day}
                  className={[
                    "border-b border-gray-200 px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide",
                    day === props.todayToken
                      ? "bg-gray-900 text-white"
                      : "bg-gray-50 text-gray-500",
                  ].join(" ")}
                >
                  {t(messageKey(`day.long.${day}`))}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((slot) => (
              <tr key={slot.key} className="align-top">
                <th className="border-b border-r border-gray-200 bg-gray-50 px-3 py-2 text-left text-xs font-medium text-gray-700">
                  {slotLabel(slot.key)}
                </th>
                {DAY_TOKENS.map((day) => {
                  const cell = cells.get(cellKey(day, slot.key));
                  const placed = cell?.entries ?? [];
                  return (
                    <td
                      key={day}
                      className="min-w-[9rem] border-b border-gray-100 px-2 py-2"
                    >
                      <div className="space-y-1.5">
                        {placed.map((entry) => (
                          <div
                            key={entry.id}
                            className="rounded-lg border border-gray-200 bg-white px-2 py-1.5"
                          >
                            <p className="text-xs font-medium text-gray-900">
                              {entry.idea?.title ?? c("meals.grid.unknown_dish")}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                className="text-[11px] text-gray-500 underline underline-offset-2"
                                disabled={props.busy}
                                onClick={() =>
                                  setRepeatFor(
                                    repeatFor === entry.id ? null : entry.id,
                                  )}
                              >
                                {c("meals.grid.repeat")}
                              </button>
                              <button
                                type="button"
                                className="text-[11px] text-gray-500 underline underline-offset-2"
                                disabled={props.busy}
                                onClick={() => void props.onRemove(entry.id)}
                              >
                                {c("meals.grid.remove")}
                              </button>
                            </div>
                            {repeatFor === entry.id && (
                              <div className="mt-1.5 flex flex-col gap-1">
                                <button
                                  type="button"
                                  className="rounded-full border border-gray-300 px-2 py-0.5 text-[11px] hover:bg-gray-50"
                                  disabled={props.busy}
                                  onClick={async () => {
                                    await props.onRepeat(entry, WEEKDAY_TOKENS);
                                    setRepeatFor(null);
                                  }}
                                >
                                  {c("meals.grid.repeat_weekdays")}
                                </button>
                                <button
                                  type="button"
                                  className="rounded-full border border-gray-300 px-2 py-0.5 text-[11px] hover:bg-gray-50"
                                  disabled={props.busy}
                                  onClick={async () => {
                                    await props.onRepeat(entry, DAY_TOKENS);
                                    setRepeatFor(null);
                                  }}
                                >
                                  {c("meals.grid.repeat_week")}
                                </button>
                              </div>
                            )}
                          </div>
                        ))}

                        {props.selectedIdea ? (
                          <button
                            type="button"
                            className="w-full rounded-lg border border-dashed border-gray-300 px-2 py-1.5 text-[11px] text-gray-500 hover:border-gray-900 hover:text-gray-900"
                            disabled={props.busy}
                            onClick={() => void props.onPlace(slot.key, [day])}
                          >
                            {c("meals.grid.add_here")}
                          </button>
                        ) : (
                          placed.length === 0 && (
                            <span className="text-xs text-gray-300">
                              {c("meals.grid.empty_cell")}
                            </span>
                          )
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default MealWeekGrid;
