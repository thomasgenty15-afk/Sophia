import React from "react";

import { useAuth } from "../../../context/AuthContext";
import { dayTokenOf, localDateIn } from "../../api/dates";
import { loadPublishedPlanVersion } from "../../api/keelClient";
import { foodGroupLabel, messageKey, slotLabel } from "../../api/labels";
import {
  buildCellIndex,
  cellKey,
  DAY_TOKENS,
  type DayToken,
  gridSlots,
  loadStudentMealWeek,
  type MealIdea,
  type MealPlanEntry,
  type SlotRow,
} from "../../api/mealPlanModel";
import { loadSlotVocabulary } from "../../api/keelClient";
import KeelAppShell from "../../components/KeelAppShell";
import { Badge } from "../../components/ui/Badge";
import { Card, SectionLabel } from "../../components/ui/Card";
import { t } from "../../i18n/t";
import { c } from "./copy";

// KEEL — /app/meals. The student READS the week their coach composed.
//
// FRAMED AS A SUGGESTION, IN THE FIRST SENTENCE AND IN THE STRUCTURE.
// Everything about this screen is deliberately unlike /app/today: no checkbox,
// no badge, no status, no streak, nothing tappable that could be mistaken for
// logging. There is nothing to complete here, because there is nothing here
// that counts. The subtitle says so in words; the absence of a single control
// says so in a way words cannot be argued with.
//
// READ-ONLY BY THE DATABASE, NOT BY THIS FILE. Migration 20260728120000 gives
// the student SELECT on their own `meal_plan_entries` and on the ideas actually
// placed on their week — and no INSERT, UPDATE or DELETE policy anywhere. If
// this component tried to write, PostgREST would refuse it. That is the same
// posture the rest of the student app takes: RLS is the boundary, the component
// is only the view.

type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | {
    kind: "ready";
    entries: MealPlanEntry[];
    ideas: MealIdea[];
    slots: SlotRow[];
  };

export default function StudentMealPlanPage() {
  const { user } = useAuth();
  const [state, setState] = React.useState<LoadState>({ kind: "loading" });

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user?.id) return;
      try {
        const plan = await loadPublishedPlanVersion(user.id);
        if (!plan) {
          if (!cancelled) {
            setState({ kind: "ready", entries: [], ideas: [], slots: [] });
          }
          return;
        }
        const [week, slots] = await Promise.all([
          loadStudentMealWeek(plan.id),
          loadSlotVocabulary(),
        ]);
        if (cancelled) return;
        setState({
          kind: "ready",
          entries: week.entries,
          ideas: week.ideas,
          slots: slots as unknown as SlotRow[],
        });
      } catch (error) {
        if (cancelled) return;
        setState({
          kind: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const todayToken: DayToken | null = React.useMemo(() => {
    try {
      return dayTokenOf(localDateIn(Intl.DateTimeFormat().resolvedOptions().timeZone));
    } catch {
      return null;
    }
  }, []);

  return (
    <KeelAppShell
      variant="student"
      width="narrow"
      title={c("meals.student.title")}
      subtitle={c("meals.student.subtitle")}
    >
      {state.kind === "loading" && (
        <p className="text-sm text-gray-500">{c("meals.student.loading")}</p>
      )}

      {state.kind === "error" && (
        <Card tone="warning">
          <p className="text-sm text-amber-900">
            {c("meals.student.error", { message: state.message })}
          </p>
        </Card>
      )}

      {state.kind === "ready" && state.entries.length === 0 && (
        <Card tone="dashed">
          <p className="text-sm text-gray-600">{c("meals.student.empty")}</p>
        </Card>
      )}

      {state.kind === "ready" && state.entries.length > 0 && (
        <StudentWeek
          entries={state.entries}
          ideas={state.ideas}
          slots={state.slots}
          todayToken={todayToken}
        />
      )}
    </KeelAppShell>
  );
}

/**
 * Day by day, today first. A seven-by-nine table is a coach's tool: it is how
 * you COMPOSE. The student is not composing — they are answering "what do I eat
 * now", so the shape here is a short list per day with today at the top.
 */
function StudentWeek(props: {
  entries: MealPlanEntry[];
  ideas: MealIdea[];
  slots: SlotRow[];
  todayToken: DayToken | null;
}) {
  const cells = buildCellIndex(props.entries, props.ideas);
  const rows = gridSlots(props.slots, props.entries);

  const ordered: DayToken[] = React.useMemo(() => {
    if (!props.todayToken) return [...DAY_TOKENS];
    const start = DAY_TOKENS.indexOf(props.todayToken);
    return [...DAY_TOKENS.slice(start), ...DAY_TOKENS.slice(0, start)];
  }, [props.todayToken]);

  return (
    <div className="space-y-3">
      {ordered.map((day) => {
        const dayRows = rows
          .map((slot) => ({ slot, cell: cells.get(cellKey(day, slot.key)) }))
          .filter((r) => r.cell && r.cell.entries.length > 0);
        if (dayRows.length === 0) return null;
        return (
          <Card key={day}>
            <div className="mb-2 flex items-center gap-2">
              <SectionLabel className="mb-0">
                {t(messageKey(`day.long.${day}`))}
              </SectionLabel>
              {day === props.todayToken && (
                <Badge tone="info">{c("meals.student.today")}</Badge>
              )}
            </div>
            <ul className="divide-y divide-gray-100">
              {dayRows.map(({ slot, cell }) => (
                <li key={slot.key} className="py-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    {slotLabel(slot.key)}
                  </p>
                  {cell!.entries.map((entry) => (
                    <div key={entry.id} className="mt-1">
                      <p className="text-sm text-gray-900">
                        {entry.idea?.title ?? ""}
                      </p>
                      {entry.idea?.description && (
                        <p className="mt-0.5 text-sm text-gray-600">
                          {entry.idea.description}
                        </p>
                      )}
                      {entry.note && (
                        <p className="mt-0.5 text-sm italic text-gray-600">
                          {entry.note}
                        </p>
                      )}
                      {entry.idea && entry.idea.food_group_refs.length > 0 && (
                        <p className="mt-0.5 text-xs text-gray-400">
                          {entry.idea.food_group_refs.map(foodGroupLabel).join(" · ")}
                        </p>
                      )}
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}
