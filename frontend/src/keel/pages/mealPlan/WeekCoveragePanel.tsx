import React from "react";

import { foodGroupLabel, messageKey, slotLabel } from "../../api/labels";
import { t } from "../../i18n/t";
import type { DayCoverage } from "../../api/mealPlanModel";
import { Badge } from "../../components/ui/Badge";
import { Card, SectionLabel } from "../../components/ui/Card";
import { c } from "./copy";

// KEEL — what the composed week covers of the coach's OWN nutrition lines.
//
// READ THIS BEFORE CHANGING ANYTHING HERE.
//
// This panel is the single most misreadable surface in the meal layer: it shows
// counts, ratios and green ticks, and it sits next to a product whose central
// number is an adherence percentage. Three rules keep the two apart, and all
// three are about what this panel is NOT:
//
//   1. IT IS THE COACH'S MIRROR, NOT THE STUDENT'S GRADE. It is rendered on a
//      coach screen only. `mealPlanModel` has no student path to coverage, and
//      the server does not compute it on the student's behalf.
//   2. IT DESCRIBES A PLAN, NOT A PERSON. Every number here comes from dishes
//      the coach placed and lines the coach wrote. Nothing the student did is
//      an input, so a full week shows full coverage on a Sunday nobody has
//      lived yet. That is correct, and it is why there is no percentage.
//   3. IT NEVER CLAIMS MORE THAN IT KNOWS. Lines with no food group are LISTED,
//      not silently dropped; a same-family dish is shown as "plus 1 similar"
//      beside the count, never inside it.

export function WeekCoveragePanel({ coverage }: { coverage: DayCoverage[] }) {
  const hasAnyLine = coverage.some(
    (d) => d.covers.length > 0 || d.conflicts.length > 0,
  );
  // Union across the week, NOT `coverage[0].not_shown`. A line scheduled only
  // on Saturday appears in Saturday's list and nowhere else; reading Monday
  // alone would quietly drop exactly the lines this block exists to name.
  const notShown = React.useMemo(() => {
    const seen = new Map<string, { commitment_id: string; title: string }>();
    for (const day of coverage) {
      for (const line of day.not_shown) seen.set(line.commitment_id, line);
    }
    return [...seen.values()];
  }, [coverage]);

  return (
    <Card>
      <SectionLabel className="mb-1">{c("meals.coverage.title")}</SectionLabel>
      <p className="mb-4 text-sm text-gray-500">{c("meals.coverage.subtitle")}</p>

      {!hasAnyLine && (
        <p className="text-sm text-gray-500">{c("meals.coverage.no_lines")}</p>
      )}

      {hasAnyLine && (
        <ul className="divide-y divide-gray-100">
          {coverage.map((day) => (
            <li key={day.day_token} className="flex flex-wrap gap-x-4 gap-y-2 py-2.5">
              <span className="w-24 shrink-0 text-sm font-medium text-gray-900">
                {t(messageKey(`day.long.${day.day_token}`))}
              </span>
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1.5">
                {day.meals_placed === 0 && (
                  <span className="text-sm text-gray-400">
                    {c("meals.coverage.empty_day")}
                  </span>
                )}
                {day.covers.map((line) => (
                  <span
                    key={line.commitment_id}
                    className="inline-flex items-center gap-1.5 text-sm"
                    title={line.title}
                  >
                    <span className={line.met ? "text-emerald-700" : "text-gray-600"}>
                      {foodGroupLabel(line.food_group_ref)}
                      {line.slot_key ? ` (${slotLabel(line.slot_key)})` : ""}
                    </span>
                    <span
                      className={[
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        line.met
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-gray-100 text-gray-600",
                      ].join(" ")}
                    >
                      {c("meals.coverage.count", {
                        placed: line.placed,
                        required: line.required,
                      })}
                    </span>
                    {line.equivalent > 0 && (
                      <span
                        className="text-xs text-gray-400"
                        title={c("meals.coverage.equivalent_hint")}
                      >
                        {line.equivalent === 1
                          ? c("meals.coverage.equivalent_one")
                          : c("meals.coverage.equivalent_many", {
                            count: line.equivalent,
                          })}
                      </span>
                    )}
                  </span>
                ))}
                {day.conflicts.map((conflict) => (
                  <Badge key={conflict.commitment_id} tone="caution">
                    {conflict.placed === 1
                      ? c("meals.coverage.conflict", {
                        title: conflict.title,
                        count: conflict.placed,
                      })
                      : c("meals.coverage.conflict_many", {
                        title: conflict.title,
                        count: conflict.placed,
                      })}
                  </Badge>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      {notShown.length > 0 && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <p className="text-sm font-medium text-gray-700">
            {notShown.length === 1
              ? c("meals.coverage.not_shown_one")
              : c("meals.coverage.not_shown_many", { count: notShown.length })}
          </p>
          <ul className="mt-1 list-disc pl-5 text-sm text-gray-600">
            {notShown.map((line) => <li key={line.commitment_id}>{line.title}</li>)}
          </ul>
          <p className="mt-1 text-xs text-gray-500">
            {c("meals.coverage.not_shown_hint")}
          </p>
        </div>
      )}
    </Card>
  );
}

export default WeekCoveragePanel;
