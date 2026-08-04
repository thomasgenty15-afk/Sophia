import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import {
  mondayWeekStartForLocalDate,
  weekdayKeyForLocalDate,
} from "./action_occurrences.ts";

/**
 * Crédit hors-planning: quand l'utilisateur dit avoir fait une action un jour
 * où elle n'était pas prévue (ou la valide en avance/en retard dans la
 * semaine), l'entry seule ne suffit pas — le bilan hebdomadaire compte par
 * occurrences. Ce module rattache une complétion réelle à une occurrence
 * ouverte de la même semaine: le jour exact d'abord, sinon la première
 * occurrence ouverte de la semaine, avec `actual_day` = jour réellement fait
 * (même contrat d'écriture que la validation dashboard, habit-week-planning
 * validateOccurrence).
 *
 * Aucune occurrence ouverte (item non planifié cette semaine, ou déjà tout
 * validé) → aucun write: l'entry reste la trace, et le bilan hebdo la compte
 * via les complétions hors-planning.
 */

const DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

type OpenOccurrenceRow = {
  id: string;
  planned_day: string;
  actual_day: string | null;
  status: string;
};

export type OffScheduleCreditResult = {
  credited: "exact_day" | "same_week" | "none";
  occurrence_id: string | null;
  warning?: string;
};

function dayOffset(day: string): number {
  const index = (DAY_ORDER as readonly string[]).indexOf(day);
  return index >= 0 ? index : DAY_ORDER.length;
}

/**
 * Marque done l'occurrence de la semaine correspondant à une complétion
 * réelle datée de `effectiveLocalDate` (YMD, calendrier local user).
 * Ne lève jamais: résultat `none` + warning en cas d'erreur — l'entry
 * committée reste la source de vérité.
 */
export async function creditCompletedEntryToWeekOccurrence(args: {
  supabase: SupabaseClient;
  userId: string;
  planItemId: string;
  effectiveLocalDate: string;
  nowIso?: string;
}): Promise<OffScheduleCreditResult> {
  const nowIso = args.nowIso ?? new Date().toISOString();
  const effectiveDate = String(args.effectiveLocalDate ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
    return {
      credited: "none",
      occurrence_id: null,
      warning: `invalid effectiveLocalDate: ${args.effectiveLocalDate}`,
    };
  }

  const weekStart = mondayWeekStartForLocalDate(effectiveDate);
  const actualDay = weekdayKeyForLocalDate(effectiveDate);

  const { data, error } = await args.supabase
    .from("user_habit_week_occurrences")
    .select("id,planned_day,actual_day,status")
    .eq("user_id", args.userId)
    .eq("plan_item_id", args.planItemId)
    .eq("week_start_date", weekStart)
    .in("status", ["planned", "rescheduled"]);
  if (error) {
    return {
      credited: "none",
      occurrence_id: null,
      warning: `occurrence load failed: ${error.message}`,
    };
  }

  const open = ((data ?? []) as OpenOccurrenceRow[])
    .slice()
    .sort((left, right) =>
      dayOffset(left.actual_day ?? left.planned_day) -
      dayOffset(right.actual_day ?? right.planned_day)
    );
  if (open.length === 0) {
    return { credited: "none", occurrence_id: null };
  }

  const exact = open.find((row) =>
    (row.actual_day ?? row.planned_day) === actualDay
  );
  const target = exact ?? open[0];

  const { error: updateError } = await args.supabase
    .from("user_habit_week_occurrences")
    .update({
      status: "done",
      actual_day: actualDay,
      validated_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", target.id)
    .eq("user_id", args.userId)
    .in("status", ["planned", "rescheduled"]);
  if (updateError) {
    return {
      credited: "none",
      occurrence_id: null,
      warning: `occurrence update failed: ${updateError.message}`,
    };
  }

  return {
    credited: exact ? "exact_day" : "same_week",
    occurrence_id: target.id,
  };
}
