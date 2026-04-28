import { CalendarDays, Check, Loader2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { supabase } from "../../lib/supabase";
import type { PlanWeekCalendar } from "../../lib/planSchedule";
import type { DashboardV2PlanItemRuntime } from "../../hooks/useDashboardV2Data";

const DAY_CODES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type DayCode = typeof DAY_CODES[number];

type WeekPlanningItemState = {
  plan_item: {
    id: string;
    title: string;
    dimension: string;
    target_reps: number;
    scheduled_days: DayCode[];
    status: string;
  };
  preferred_days: DayCode[];
  week: {
    plan: {
      id: string;
      status: "pending_confirmation" | "confirmed" | "auto_applied";
      week_start_date: string;
      confirmed_at: string | null;
    };
    occurrences: Array<{
      id: string;
      ordinal: number;
      default_day: DayCode;
      planned_day: DayCode;
      status: "planned" | "done" | "partial" | "missed" | "rescheduled";
    }>;
  };
};

type WeekPlanningBundleResponse = {
  week_start_date: string;
  bundle_status: "pending_confirmation" | "confirmed";
  items: WeekPlanningItemState[];
};

type WeekPlanningModalProps = {
  isOpen: boolean;
  weekTitle: string;
  weekCalendar: PlanWeekCalendar;
  items: DashboardV2PlanItemRuntime[];
  preferredDaysByItemId: Map<string, string[]>;
  onClose: () => void;
  onSaved: (status: "pending_confirmation" | "confirmed") => void;
};

const inflightBundleLoads = new Map<
  string,
  Promise<WeekPlanningBundleResponse>
>();

function frenchLabel(day: DayCode) {
  return {
    mon: "Lun",
    tue: "Mar",
    wed: "Mer",
    thu: "Jeu",
    fri: "Ven",
    sat: "Sam",
    sun: "Dim",
  }[day];
}

function dayLong(day: DayCode) {
  return {
    mon: "lundi",
    tue: "mardi",
    wed: "mercredi",
    thu: "jeudi",
    fri: "vendredi",
    sat: "samedi",
    sun: "dimanche",
  }[day];
}

function normalizeDayCodes(days: string[] | null | undefined): DayCode[] {
  const seen = new Set<DayCode>();
  for (const day of days ?? []) {
    const normalized = String(day ?? "").trim().toLowerCase() as DayCode;
    if ((DAY_CODES as readonly string[]).includes(normalized)) {
      seen.add(normalized);
    }
  }
  return [...seen];
}

function sameDayCodes(left: DayCode[], right: DayCode[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((day, index) => day === right[index]);
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

function getAllowedDays(weekCalendar: PlanWeekCalendar): DayCode[] {
  const days: DayCode[] = [];
  let cursor = dateFromYmdUtc(weekCalendar.startDate);
  const end = dateFromYmdUtc(weekCalendar.endDate);
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

function cardLabel(item: DashboardV2PlanItemRuntime) {
  if (item.dimension === "habits") return "Habitude";
  if (item.dimension === "missions") return "Mission";
  if (item.dimension === "clarifications") return "Clarification";
  return "Action";
}

function buildBundleLoadKey(
  weekStartDate: string,
  requestItems: WeekPlanningModalRequestItem[],
) {
  return JSON.stringify({
    week_start_date: weekStartDate,
    items: requestItems,
  });
}

type WeekPlanningModalRequestItem = {
  plan_item_id: string;
  preferred_days: DayCode[];
  target_reps_override: number;
};

export function WeekPlanningModal({
  isOpen,
  weekTitle,
  weekCalendar,
  items,
  preferredDaysByItemId,
  onClose,
  onSaved,
}: WeekPlanningModalProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [bundle, setBundle] = useState<WeekPlanningBundleResponse | null>(null);
  const [selectedDaysByItemId, setSelectedDaysByItemId] = useState<
    Record<string, DayCode[]>
  >({});

  const allowedDays = useMemo(() => getAllowedDays(weekCalendar), [
    weekCalendar,
  ]);

  const requestItems = useMemo<WeekPlanningModalRequestItem[]>(
    () =>
      items.map((item) => {
        const preferred = item.dimension === "habits"
          ? allowedDays
          : normalizeDayCodes(preferredDaysByItemId.get(item.id));
        return {
          plan_item_id: item.id,
          preferred_days: preferred.length > 0 ? preferred : allowedDays,
          target_reps_override: weeklyTargetForItem(item, allowedDays.length),
        };
      }),
    [allowedDays, items, preferredDaysByItemId],
  );

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      setInfo(null);
      try {
        const requestKey = buildBundleLoadKey(
          weekCalendar.anchorWeekStart,
          requestItems,
        );
        const pending = inflightBundleLoads.get(requestKey) ??
          supabase.functions
            .invoke("habit-week-planning-v1", {
              body: {
                action: "get_bundle_state",
                week_start_date: weekCalendar.anchorWeekStart,
                items: requestItems,
              },
            })
            .then(({ data, error: invokeError }) => {
              if (invokeError) throw invokeError;
              return data as WeekPlanningBundleResponse;
            })
            .finally(() => {
              inflightBundleLoads.delete(requestKey);
            });
        inflightBundleLoads.set(requestKey, pending);
        const payload = await pending;
        if (cancelled) return;
        setBundle(payload);
        setSelectedDaysByItemId(
          Object.fromEntries(payload.items.map((entry) => [
            entry.plan_item.id,
            normalizeDayCodes(
              entry.week.occurrences.map((occurrence) =>
                occurrence.planned_day
              ),
            ),
          ])),
        );
      } catch (loadError) {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Impossible de charger le planning de la semaine.",
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [isOpen, requestItems, weekCalendar.anchorWeekStart]);

  if (!isOpen) return null;

  const toggleHabitDay = (itemId: string, day: DayCode, target: number) => {
    setSelectedDaysByItemId((current) => {
      const selected = normalizeDayCodes(current[itemId]);
      if (selected.includes(day)) {
        return {
          ...current,
          [itemId]: selected.filter((entry) => entry !== day),
        };
      }
      if (selected.length >= target) return current;
      return {
        ...current,
        [itemId]: [...selected, day].sort((left, right) =>
          DAY_CODES.indexOf(left) - DAY_CODES.indexOf(right)
        ),
      };
    });
  };

  const selectSingleDay = (itemId: string, day: DayCode) => {
    setSelectedDaysByItemId((current) => ({
      ...current,
      [itemId]: [day],
    }));
  };

  const allItemsReady = items.every((item) => {
    const selected = normalizeDayCodes(selectedDaysByItemId[item.id]);
    const target = weeklyTargetForItem(item, allowedDays.length);
    return selected.length === target;
  });

  const confirmPlanning = async () => {
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        "habit-week-planning-v1",
        {
          body: {
            action: "confirm_bundle",
            week_start_date: weekCalendar.anchorWeekStart,
            items: items.map((item) => ({
              plan_item_id: item.id,
              planned_days: normalizeDayCodes(selectedDaysByItemId[item.id]),
              target_reps_override: weeklyTargetForItem(
                item,
                allowedDays.length,
              ),
            })),
          },
        },
      );
      if (invokeError) throw invokeError;
      const payload = data as WeekPlanningBundleResponse;
      setBundle(payload);
      setInfo("Planning enregistre pour cette semaine.");
      onSaved(payload.bundle_status);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Impossible d'enregistrer le planning.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 p-4 backdrop-blur-sm">
      <div className="w-full max-w-4xl overflow-hidden rounded-[28px] border border-stone-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-stone-200 px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-700">
              Planning de semaine
            </p>
            <h3 className="mt-1 text-lg font-bold text-stone-950">
              {weekTitle}
            </h3>
            <p className="mt-1 text-sm text-stone-600">
              Tu choisis ici quels jours porteront chaque action de la semaine.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-stone-200 text-stone-600 transition hover:bg-stone-50 hover:text-stone-950"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-5">
          {loading
            ? (
              <div className="flex items-center gap-2 text-sm text-stone-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                Chargement du planning...
              </div>
            )
            : null}

          {error
            ? (
              <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            )
            : null}

          {info
            ? (
              <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                {info}
              </div>
            )
            : null}

          {!loading && bundle
            ? (
              <div className="space-y-4">
                <div className="rounded-3xl border border-stone-200 bg-stone-50 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                        Statut
                      </p>
                      <p className="mt-1 text-sm font-semibold text-stone-900">
                        {bundle.bundle_status === "confirmed"
                          ? "Planning confirme"
                          : "Planning a confirmer"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                        Fenetre visible
                      </p>
                      <p className="mt-1 text-sm text-stone-600">
                        {allowedDays.map((day) => dayLong(day)).join(", ")}
                      </p>
                    </div>
                  </div>
                </div>

                {bundle.items.map((entry) => {
                  const item = items.find((candidate) =>
                    candidate.id === entry.plan_item.id
                  );
                  if (!item) {
                    return null;
                  }

                  const selected = normalizeDayCodes(
                    selectedDaysByItemId[item.id],
                  );
                  const target = weeklyTargetForItem(item, allowedDays.length);
                  const isHabit = item.dimension === "habits";
                  const suggestedDays = normalizeDayCodes(
                    entry.week.occurrences.map((occurrence) =>
                      occurrence.default_day
                    ),
                  );
                  const showSuggestedDays = suggestedDays.length > 0 &&
                    !sameDayCodes(suggestedDays, selected);

                  return (
                    <div
                      key={item.id}
                      className="rounded-3xl border border-stone-200 bg-white px-4 py-4 shadow-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                            {cardLabel(item)}
                          </p>
                          <p className="mt-1 text-base font-bold text-stone-950">
                            {item.title}
                          </p>
                          <p className="mt-1 text-sm text-stone-600">
                            {isHabit
                              ? `${target} repetition${
                                target > 1 ? "s" : ""
                              } a placer cette semaine`
                              : "1 jour a confirmer cette semaine"}
                          </p>
                        </div>
                        <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-700">
                          {selected.length} / {target}
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-7 gap-2">
                        {allowedDays.map((day) => {
                          const daySelected = selected.includes(day);
                          return (
                            <button
                              key={`${item.id}:${day}`}
                              type="button"
                              onClick={() =>
                                isHabit
                                  ? toggleHabitDay(item.id, day, target)
                                  : selectSingleDay(item.id, day)}
                              disabled={saving}
                              className={`rounded-2xl border px-2 py-3 text-center transition ${
                                daySelected
                                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                                  : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"
                              } disabled:cursor-not-allowed disabled:opacity-50`}
                            >
                              <div className="text-[11px] font-semibold uppercase tracking-[0.16em]">
                                {frenchLabel(day)}
                              </div>
                              <div className="mt-2 flex justify-center">
                                <span
                                  className={`inline-flex h-5 w-5 items-center justify-center rounded-full border text-[11px] ${
                                    daySelected
                                      ? "border-emerald-300 bg-emerald-100 text-emerald-700"
                                      : "border-stone-200 text-stone-400"
                                  }`}
                                >
                                  {daySelected
                                    ? <Check className="h-3 w-3" />
                                    : ""}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>

                      {showSuggestedDays
                        ? (
                          <div className="mt-3 text-xs text-stone-500">
                            Proposition initiale: {suggestedDays.map((day) =>
                              dayLong(day)
                            ).join(
                              ", ",
                            )}
                          </div>
                        )
                        : null}
                    </div>
                  );
                })}
              </div>
            )
            : null}
        </div>

        <div className="border-t border-stone-200 px-5 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-stone-500">
              <CalendarDays className="h-3.5 w-3.5" />
              Le planning de la semaine suivante se debloque quand elle devient
              la semaine courante.
            </div>
            <button
              type="button"
              onClick={() => void confirmPlanning()}
              disabled={saving || !allItemsReady}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-stone-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-stone-950 disabled:opacity-60"
            >
              {saving
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <CalendarDays className="h-4 w-4" />}
              {bundle?.bundle_status === "confirmed"
                ? "Modifier le planning"
                : "Valider le planning"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
