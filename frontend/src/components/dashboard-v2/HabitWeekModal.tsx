import { Loader2, Check, RotateCcw, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { supabase } from "../../lib/supabase";
import type { DashboardV2PlanItemRuntime } from "../../hooks/useDashboardV2Data";
import type { PlanWeekCalendar } from "../../lib/planSchedule";

const DAY_CODES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type DayCode = typeof DAY_CODES[number];

type HabitWeekPlan = {
  id: string;
  status: "pending_confirmation" | "confirmed" | "auto_applied";
  week_start_date: string;
  confirmed_at: string | null;
};

type HabitWeekOccurrence = {
  id: string;
  ordinal: number;
  default_day: DayCode;
  planned_day: DayCode;
  original_planned_day: DayCode | null;
  actual_day: DayCode | null;
  status: "planned" | "done" | "missed" | "rescheduled";
  source: "default_generated" | "weekly_confirmed" | "auto_rescheduled" | "manual_change";
};

type HabitWeekRescheduleEvent = {
  id: string;
  occurrence_id: string;
  from_day: DayCode;
  to_day: DayCode;
  reason: "auto_missed" | "manual_reschedule";
  created_at: string;
};

type HabitWeekDisplayEntry =
  | {
    key: string;
    day: DayCode;
    kind: "history";
    event: HabitWeekRescheduleEvent;
    fromDay: DayCode;
    toDay: DayCode;
  }
  | {
    key: string;
    day: DayCode;
    kind: "occurrence";
    occurrence: HabitWeekOccurrence;
  };

type HabitWeekStateResponse = {
  plan_item: {
    id: string;
    title: string;
    dimension: string;
    target_reps: number;
    scheduled_days: DayCode[];
    status: string;
  };
  current_week: {
    plan: HabitWeekPlan;
    occurrences: HabitWeekOccurrence[];
    reschedule_events: HabitWeekRescheduleEvent[];
  };
  next_week: {
    plan: HabitWeekPlan;
    occurrences: HabitWeekOccurrence[];
    reschedule_events: HabitWeekRescheduleEvent[];
  } | null;
  validation_result?: {
    rescheduled_to: DayCode | null;
  };
};

type HabitWeekModalProps = {
  item: DashboardV2PlanItemRuntime;
  weekCalendar?: PlanWeekCalendar | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenWeekPlanning?: (() => void) | null;
  onHabitDone: () => Promise<void>;
};

function dateToYmdLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getLocalWeekStart(date = new Date()): string {
  const copy = new Date(date);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return dateToYmdLocal(copy);
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

function getCurrentDayCode(date = new Date()): DayCode {
  const value = date.getDay();
  if (value === 0) return "sun";
  return DAY_CODES[value - 1];
}

function statusLabel(status: HabitWeekPlan["status"]) {
  if (status === "confirmed") return "Planning confirme";
  if (status === "auto_applied") return "Planning applique par defaut";
  return "Planning a confirmer";
}

function occurrenceStatusLabel(occurrence: HabitWeekOccurrence) {
  if (occurrence.status === "done") {
    return occurrence.actual_day && occurrence.actual_day !== occurrence.planned_day
      ? `Fait le ${dayLong(occurrence.actual_day)}`
      : "Fait";
  }
  if (occurrence.status === "missed") return "Pas fait";
  if (occurrence.status === "rescheduled") {
    return occurrence.original_planned_day
      ? `Reporte depuis ${dayLong(occurrence.original_planned_day)}`
      : "Reporte";
  }
  return "Jour prevu cette semaine";
}

function eventStatusLabel(event: HabitWeekRescheduleEvent) {
  return event.reason === "auto_missed"
    ? `Pas fait, reporte au ${dayLong(event.to_day)}.`
    : `Reporte au ${dayLong(event.to_day)}.`;
}

export function HabitWeekModal({
  item,
  weekCalendar,
  isOpen,
  onClose,
  onOpenWeekPlanning,
  onHabitDone,
}: HabitWeekModalProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [state, setState] = useState<HabitWeekStateResponse | null>(null);

  const currentWeekStart = useMemo(
    () => weekCalendar?.anchorWeekStart ?? getLocalWeekStart(),
    [weekCalendar],
  );
  const currentDayCode = useMemo(() => getCurrentDayCode(), []);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    setInfo(null);

    const loadState = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: invokeError } = await supabase.functions.invoke("habit-week-planning-v1", {
          body: {
            action: "get_state",
            plan_item_id: item.id,
            current_week_start: currentWeekStart,
            target_reps_override: item.target_reps ?? 0,
          },
        });
        if (invokeError) throw invokeError;
        if (cancelled) return;
        const next = data as HabitWeekStateResponse;
        setState(next);
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "Impossible de charger le planning hebdo.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadState();

    return () => {
      cancelled = true;
    };
  }, [isOpen, currentWeekStart, item.id, item.target_reps]);

  const currentOccurrences = useMemo(
    () => state?.current_week.occurrences ?? [],
    [state?.current_week.occurrences],
  );
  const currentRescheduleEvents = useMemo(
    () => state?.current_week.reschedule_events ?? [],
    [state?.current_week.reschedule_events],
  );
  const latestRescheduleEventByOccurrenceId = useMemo(() => {
    const mapping = new Map<string, HabitWeekRescheduleEvent>();
    for (const event of currentRescheduleEvents) {
      mapping.set(event.occurrence_id, event);
    }
    return mapping;
  }, [currentRescheduleEvents]);
  const displayEntries = useMemo(() => {
    const entries: HabitWeekDisplayEntry[] = [];
    for (const event of currentRescheduleEvents) {
      entries.push({
        key: `${event.id}:history`,
        day: event.from_day,
        kind: "history",
        event,
        fromDay: event.from_day,
        toDay: event.to_day,
      });
    }

    for (const occurrence of currentOccurrences) {
      entries.push({
        key: occurrence.id,
        day: occurrence.planned_day,
        kind: "occurrence",
        occurrence,
      });
    }

    return entries.sort((left, right) => {
      const dayDiff = DAY_CODES.indexOf(left.day) - DAY_CODES.indexOf(right.day);
      if (dayDiff !== 0) return dayDiff;
      if (left.kind !== right.kind) return left.kind === "history" ? -1 : 1;
      if (left.kind === "occurrence" && right.kind === "occurrence") {
        return left.occurrence.ordinal - right.occurrence.ordinal;
      }
      return 0;
    });
  }, [currentOccurrences, currentRescheduleEvents]);

  const handleOccurrenceAction = async (
    occurrence: HabitWeekOccurrence,
    decision: "done" | "missed" | "reschedule",
    options?: { targetDay?: DayCode; actualDay?: DayCode },
  ) => {
    setSaving(true);
    setError(null);
    setInfo(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("habit-week-planning-v1", {
        body: {
          action: "validate_occurrence",
          plan_item_id: item.id,
          occurrence_id: occurrence.id,
          decision,
          target_day: options?.targetDay,
          actual_day: options?.actualDay,
          current_day: currentDayCode,
          current_week_start: currentWeekStart,
          target_reps_override: item.target_reps ?? 0,
        },
      });
      if (invokeError) throw invokeError;
      const payload = data as HabitWeekStateResponse;
      setState(payload);
      if (decision === "done") {
        await onHabitDone();
        setInfo("Occurrence enregistree comme faite.");
      } else if (payload.validation_result?.rescheduled_to) {
        setInfo("Pas fait enregistre.");
      } else if (decision === "missed") {
        setInfo("Occurrence marquee comme non faite. Aucun autre spot libre cette semaine.");
      } else {
        setInfo("Jour de l'habitude modifie.");
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Impossible de mettre a jour ce jour.");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/45 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl overflow-hidden rounded-[28px] border border-stone-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-stone-200 px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
              Habitude
            </p>
            <h3 className="mt-1 text-lg font-bold text-stone-950">{item.title}</h3>
            <p className="mt-1 text-sm text-stone-600">
              {item.target_reps ?? 0} repetitions visees cette semaine. Ici tu renseignes seulement ce qui a ete fait ou non.
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
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-stone-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement du planning...
            </div>
          ) : null}

          {error ? (
            <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          {info ? (
            <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {info}
            </div>
          ) : null}

          {!loading && state ? (
            <div className="space-y-4">
                <div className="rounded-3xl border border-stone-200 bg-stone-50 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                        Cette semaine
                      </p>
                      <p className="mt-1 text-sm font-semibold text-stone-900">
                        {statusLabel(state.current_week.plan.status)}
                      </p>
                    </div>
                    <div className="text-sm text-stone-600">
                      {currentOccurrences.length} occurrence{currentOccurrences.length > 1 ? "s" : ""}
                    </div>
                  </div>
                </div>

                {currentOccurrences.length === 0 ? (
                  <div className="rounded-3xl border border-dashed border-stone-300 px-4 py-5 text-sm text-stone-600">
                    Aucun jour n'est planifie cette semaine.
                  </div>
                ) : null}

                {displayEntries.map((entry) => {
                  if (entry.kind === "history") {
                    return (
                      <div
                        key={entry.key}
                        className="rounded-3xl border border-stone-200/80 bg-stone-50 px-4 py-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                              Prevu initialement
                            </p>
                            <p className="mt-1 text-base font-bold text-stone-500 line-through decoration-2">
                              {dayLong(entry.fromDay)}
                            </p>
                            <p className="mt-1 text-sm text-stone-600">
                              {eventStatusLabel(entry.event)}
                            </p>
                          </div>
                          <span className="rounded-full bg-stone-200 px-3 py-1 text-xs font-semibold text-stone-600">
                            Passe
                          </span>
                        </div>
                      </div>
                    );
                  }

                  const occurrence = entry.occurrence;
                  const isFutureOccurrence =
                    DAY_CODES.indexOf(occurrence.planned_day) > DAY_CODES.indexOf(currentDayCode);

                  return (
                    <div
                      key={entry.key}
                      className="rounded-3xl border border-stone-200 bg-white px-4 py-4 shadow-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
                            Occurrence {occurrence.ordinal}
                          </p>
                          <p className="mt-1 text-base font-bold text-stone-950">
                            {dayLong(occurrence.planned_day)}
                          </p>
                          <p className="mt-1 text-sm text-stone-600">
                            {occurrence.status === "rescheduled" && latestRescheduleEventByOccurrenceId.has(occurrence.id)
                              ? `Reporte depuis ${dayLong(latestRescheduleEventByOccurrenceId.get(occurrence.id)!.from_day)}`
                              : occurrenceStatusLabel(occurrence)}
                          </p>
                        </div>
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          occurrence.status === "done"
                            ? "bg-emerald-50 text-emerald-700"
                            : occurrence.status === "missed"
                            ? "bg-rose-50 text-rose-700"
                            : occurrence.status === "rescheduled"
                            ? "bg-amber-50 text-amber-700"
                            : "bg-stone-100 text-stone-600"
                        }`}>
                          {occurrence.status === "done"
                            ? "Fait"
                            : occurrence.status === "missed"
                            ? "Pas fait"
                            : occurrence.status === "rescheduled"
                            ? "Reporte"
                            : "A valider"}
                        </span>
                      </div>

                      {occurrence.status !== "done" && !isFutureOccurrence ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void handleOccurrenceAction(occurrence, "done")}
                            disabled={saving}
                            className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60"
                          >
                            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            Fait
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleOccurrenceAction(occurrence, "missed")}
                            disabled={saving}
                            className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
                          >
                            <X className="h-3.5 w-3.5" />
                            Pas fait
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
            </div>
          ) : null}
        </div>

        <div className="border-t border-stone-200 px-5 py-4">
          <div className="flex items-center justify-between gap-3 text-xs text-stone-500">
            <div className="flex items-center gap-2">
              <RotateCcw className="h-3.5 w-3.5" />
              Si tu marques "Pas fait", Sophia essaie de replacer l'habitude plus tard dans la semaine.
            </div>
            <div className="flex items-center gap-4">
              {onOpenWeekPlanning ? (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenWeekPlanning();
                  }}
                  className="font-semibold text-stone-700 transition hover:text-stone-950"
                >
                  Modifier ma semaine
                </button>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="font-semibold text-stone-700 transition hover:text-stone-950"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
