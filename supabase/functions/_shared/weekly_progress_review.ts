import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import {
  localDateYmdInTimezone,
  mondayWeekStartForLocalDate,
  weekdayKeyForLocalDate,
} from "./action_occurrences.ts";
import { computeScheduledForFromLocal } from "./scheduled_checkins.ts";

export const WEEKLY_PROGRESS_REVIEW_EVENT_CONTEXT = "weekly_progress_review_v2";
export const WEEKLY_PLANNING_VALIDATION_PROMPT_EVENT_CONTEXT =
  "weekly_planning_validation_prompt";

const DAY_CODES = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
type DayCode = typeof DAY_CODES[number];

type ActiveCycleRow = {
  id: string;
  active_transformation_id?: string | null;
};

type TransformationRow = {
  id: string;
  title?: string | null;
  priority_order?: number | null;
  activated_at?: string | null;
  updated_at?: string | null;
};

type PlanRow = {
  id: string;
  cycle_id: string;
  transformation_id: string;
  title?: string | null;
  content?: unknown;
};

type PlanItemRow = {
  id: string;
  cycle_id: string;
  transformation_id: string;
  plan_id: string;
  title: string;
  dimension: string;
  kind: string;
  status: string;
  tracking_type?: string | null;
};

type WeekPlanRow = {
  plan_item_id: string;
  status: "pending_confirmation" | "confirmed" | "auto_applied";
  planned_days?: DayCode[] | null;
  default_days?: DayCode[] | null;
  confirmed_at?: string | null;
};

type OccurrenceRow = {
  id: string;
  cycle_id: string;
  transformation_id: string;
  plan_id: string;
  plan_item_id: string;
  week_start_date: string;
  ordinal: number;
  planned_day: DayCode;
  original_planned_day?: DayCode | null;
  actual_day?: DayCode | null;
  status: "planned" | "done" | "partial" | "missed" | "rescheduled";
  source: string;
  validated_at?: string | null;
};

type EntryRow = {
  id: string;
  cycle_id: string;
  transformation_id: string;
  plan_id: string;
  plan_item_id: string;
  entry_kind: string;
  outcome: "completed" | "partial" | "missed" | string;
  effective_at: string;
  created_at: string;
  metadata?: Record<string, unknown> | null;
};

export type WeeklyProgressActionDeviation =
  | "on_plan"
  | "missed"
  | "partial"
  | "not_answered"
  | "rescheduled";

export type WeeklyProgressReviewV2 = {
  version: 1;
  user_id: string;
  timezone: string;
  week_start_date: string;
  week_end_date: string;
  generated_at: string;
  transformations: Array<{
    transformation_id: string;
    transformation_title: string;
    plan_id: string;
    plan_title: string;
    summary: {
      planned_count: number;
      done_count: number;
      partial_count: number;
      missed_count: number;
      unanswered_count: number;
      rescheduled_count: number;
      adherence_rate: number;
    };
    actions: Array<{
      occurrence_id: string;
      plan_item_id: string;
      title: string;
      dimension: string;
      kind: string;
      planned_day: DayCode;
      status: OccurrenceRow["status"];
      had_entry: boolean;
      entry_outcome: "completed" | "partial" | "missed" | null;
      deviation: WeeklyProgressActionDeviation;
    }>;
    observation: {
      what_worked: string[];
      friction_points: string[];
      pattern: string | null;
      confidence: "low" | "medium" | "high";
    };
    dashboard_recommendations: Array<{
      kind:
        | "adjust_next_week_planning"
        | "create_defense_card"
        | "create_attack_card"
        | "review_action_scope"
        | "use_state_potion"
        | "no_action_needed";
      priority: "low" | "medium" | "high";
      title: string;
      reason: string;
      dashboard_path: string;
    }>;
  }>;
  global_synthesis: {
    message_intent: "celebrate" | "encourage" | "repair" | "redirect";
    short_observation: string;
    whatsapp_message: string;
    dashboard_cta?: {
      label: string;
      url: string;
    };
  };
};

function cleanText(value: unknown, fallback = ""): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function parseDateYmd(ymd: string): Date {
  const [year, month, day] = ymd.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function formatYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDaysYmd(ymd: string, days: number): string {
  const date = parseDateYmd(ymd);
  date.setUTCDate(date.getUTCDate() + days);
  return formatYmd(date);
}

export function weekEndForWeekStart(weekStartDate: string): string {
  return addDaysYmd(weekStartDate, 6);
}

export function nextWeekStartForLocalDate(localDate: string): string {
  return addDaysYmd(mondayWeekStartForLocalDate(localDate), 7);
}

export function currentWeekStartForTimezone(
  timezone: string,
  now = new Date(),
): string {
  return mondayWeekStartForLocalDate(localDateYmdInTimezone(timezone, now));
}

export function localWeekdayForTimezone(
  timezone: string,
  now = new Date(),
): DayCode {
  return weekdayKeyForLocalDate(localDateYmdInTimezone(timezone, now));
}

export function weeklyPlanningDashboardUrl(siteUrlRaw: unknown): string {
  const siteUrl = cleanText(siteUrlRaw, "https://app.sophia.app").replace(
    /\/+$/,
    "",
  );
  return `${siteUrl}/dashboard`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, key: string): string {
  return typeof record[key] === "string" ? record[key].trim() : "";
}

export function planContentHasPlanifiableWeekStart(
  content: unknown,
  weekStartDate: string,
): boolean {
  if (!isRecord(content)) return false;
  const metadata = isRecord(content.metadata) ? content.metadata : null;
  const anchor = metadata && isRecord(metadata.schedule_anchor)
    ? metadata.schedule_anchor
    : isRecord(content.schedule_anchor)
    ? content.schedule_anchor
    : null;
  if (!anchor) return false;
  const anchorWeekStart = stringField(anchor, "anchor_week_start");
  if (!anchorWeekStart) return false;

  const phases = Array.isArray(content.phases) ? content.phases : [];
  for (const phase of phases) {
    if (!isRecord(phase)) continue;
    const weeks = Array.isArray(phase.weeks) ? phase.weeks : [];
    for (const week of weeks) {
      if (!isRecord(week)) continue;
      const weekOrder = Number(week.week_order);
      if (!Number.isInteger(weekOrder) || weekOrder < 1) continue;
      const assignments = Array.isArray(week.item_assignments)
        ? week.item_assignments
        : [];
      const hasExplicitAssignments = assignments.length > 0;
      const computedWeekStart = addDaysYmd(
        anchorWeekStart,
        (weekOrder - 1) * 7,
      );
      if (computedWeekStart === weekStartDate && hasExplicitAssignments) {
        return true;
      }
    }
  }
  return false;
}

function dayOffset(day: DayCode): number {
  return Math.max(0, DAY_CODES.indexOf(day));
}

function occurrenceLocalDate(weekStartDate: string, plannedDay: DayCode) {
  return addDaysYmd(weekStartDate, dayOffset(plannedDay));
}

function entryLocalDate(entry: EntryRow): string {
  return String(entry.effective_at ?? "").slice(0, 10);
}

function entryOutcomeForOccurrence(
  occurrence: OccurrenceRow,
  entries: EntryRow[],
): "completed" | "partial" | "missed" | null {
  const targetDate = occurrenceLocalDate(
    occurrence.week_start_date,
    occurrence.actual_day ?? occurrence.planned_day,
  );
  const match = entries.find((entry) =>
    entry.plan_item_id === occurrence.plan_item_id &&
    entryLocalDate(entry) === targetDate &&
    ["completed", "partial", "missed"].includes(String(entry.outcome ?? ""))
  );
  if (!match) return null;
  return match.outcome === "completed" || match.outcome === "partial" ||
      match.outcome === "missed"
    ? match.outcome
    : null;
}

function deviationFor(
  occurrence: OccurrenceRow,
  entryOutcome: "completed" | "partial" | "missed" | null,
): WeeklyProgressActionDeviation {
  if (entryOutcome === "completed" || occurrence.status === "done") {
    return "on_plan";
  }
  if (entryOutcome === "partial" || occurrence.status === "partial") {
    return "partial";
  }
  if (entryOutcome === "missed" || occurrence.status === "missed") {
    return "missed";
  }
  if (occurrence.status === "rescheduled") return "rescheduled";
  return "not_answered";
}

function buildObservation(args: {
  titlesDone: string[];
  titlesPartial: string[];
  titlesMissed: string[];
  unanswered: number;
}) {
  const whatWorked = args.titlesDone.slice(0, 3).map((title) =>
    `${title} a ete cochee cette semaine.`
  );
  const frictionPoints = [
    ...args.titlesMissed.slice(0, 3).map((title) =>
      `${title} n'a pas ete faite.`
    ),
    ...args.titlesPartial.slice(0, 2).map((title) =>
      `${title} avance seulement partiellement.`
    ),
  ];
  if (args.unanswered > 0) {
    frictionPoints.push(`${args.unanswered} action(s) restent sans reponse.`);
  }
  const totalSignals = whatWorked.length + frictionPoints.length;
  return {
    what_worked: whatWorked,
    friction_points: frictionPoints,
    pattern: args.titlesMissed.length > args.titlesDone.length
      ? "La semaine semble trop chargee ou pas assez ajustee au reel."
      : args.titlesDone.length > 0
      ? "La planification a cree de la traction sur au moins une action."
      : null,
    confidence: totalSignals >= 3
      ? "high"
      : totalSignals >= 1
      ? "medium"
      : "low",
  } as const;
}

function buildRecommendations(args: {
  missed: number;
  partial: number;
  unanswered: number;
  done: number;
}) {
  if (args.missed === 0 && args.partial === 0 && args.unanswered === 0) {
    return [{
      kind: "no_action_needed" as const,
      priority: "low" as const,
      title: "Garder le rythme",
      reason: "La semaine est bien tenue, pas besoin de complexifier.",
      dashboard_path: "/dashboard",
    }];
  }
  if (args.missed + args.partial >= Math.max(2, args.done + 1)) {
    return [{
      kind: "adjust_next_week_planning" as const,
      priority: "high" as const,
      title: "Alleger ou deplacer le planning",
      reason:
        "Les echecs/partiels dominent: la semaine suivante doit etre plus realiste.",
      dashboard_path: "/dashboard",
    }];
  }
  return [{
    kind: "review_action_scope" as const,
    priority: "medium" as const,
    title: "Ajuster une action fragile",
    reason:
      "Il y a assez de traction pour continuer, mais une action merite d'etre simplifiee.",
    dashboard_path: "/dashboard",
  }];
}

export function buildWeeklyProgressReviewFromRows(params: {
  userId: string;
  timezone: string;
  weekStartDate: string;
  generatedAt: string;
  transformations: TransformationRow[];
  plans: PlanRow[];
  planItems: PlanItemRow[];
  weekPlans: WeekPlanRow[];
  occurrences: OccurrenceRow[];
  entries: EntryRow[];
  dashboardUrl?: string | null;
}): WeeklyProgressReviewV2 {
  const transformationById = new Map(
    params.transformations.map((row) => [row.id, row]),
  );
  const planById = new Map(params.plans.map((row) => [row.id, row]));
  const itemById = new Map(params.planItems.map((row) => [row.id, row]));
  const confirmedItemIds = new Set(
    params.weekPlans
      .filter((row) =>
        row.status === "confirmed" || row.status === "auto_applied"
      )
      .map((row) => row.plan_item_id),
  );
  const grouped = new Map<string, OccurrenceRow[]>();

  for (const occurrence of params.occurrences) {
    if (!confirmedItemIds.has(occurrence.plan_item_id)) continue;
    const key = `${occurrence.transformation_id}:${occurrence.plan_id}`;
    const list = grouped.get(key) ?? [];
    list.push(occurrence);
    grouped.set(key, list);
  }

  const transformations = [...grouped.entries()].flatMap(
    ([key, occurrences]) => {
      const [transformationId, planId] = key.split(":");
      const transformation = transformationById.get(transformationId);
      const plan = planById.get(planId);
      if (!transformation || !plan) return [];

      const actions = occurrences
        .slice()
        .sort((left, right) => left.ordinal - right.ordinal)
        .flatMap((occurrence) => {
          const item = itemById.get(occurrence.plan_item_id);
          if (!item) return [];
          const entryOutcome = entryOutcomeForOccurrence(
            occurrence,
            params.entries,
          );
          const deviation = deviationFor(occurrence, entryOutcome);
          return [{
            occurrence_id: occurrence.id,
            plan_item_id: occurrence.plan_item_id,
            title: cleanText(item.title, "Action"),
            dimension: cleanText(item.dimension),
            kind: cleanText(item.kind),
            planned_day: occurrence.planned_day,
            status: occurrence.status,
            had_entry: Boolean(entryOutcome),
            entry_outcome: entryOutcome,
            deviation,
          }];
        });

      const done = actions.filter((action) => action.deviation === "on_plan");
      const partial = actions.filter((action) =>
        action.deviation === "partial"
      );
      const missed = actions.filter((action) => action.deviation === "missed");
      const unanswered = actions.filter((action) =>
        action.deviation === "not_answered"
      );
      const rescheduled = actions.filter((action) =>
        action.deviation === "rescheduled"
      );
      const plannedCount = actions.length;
      const adherenceRate = plannedCount > 0
        ? Math.round(
          ((done.length + partial.length * 0.5) / plannedCount) * 100,
        ) /
          100
        : 0;
      const observation = buildObservation({
        titlesDone: done.map((action) => action.title),
        titlesPartial: partial.map((action) => action.title),
        titlesMissed: missed.map((action) => action.title),
        unanswered: unanswered.length,
      });
      const recommendations = buildRecommendations({
        missed: missed.length,
        partial: partial.length,
        unanswered: unanswered.length + rescheduled.length,
        done: done.length,
      });

      return [{
        transformation_id: transformationId,
        transformation_title: cleanText(transformation.title, "Transformation"),
        plan_id: planId,
        plan_title: cleanText(plan.title, "Plan"),
        summary: {
          planned_count: plannedCount,
          done_count: done.length,
          partial_count: partial.length,
          missed_count: missed.length,
          unanswered_count: unanswered.length,
          rescheduled_count: rescheduled.length,
          adherence_rate: adherenceRate,
        },
        actions,
        observation,
        dashboard_recommendations: recommendations,
      }];
    },
  );

  const totals = transformations.reduce(
    (acc, transformation) => {
      acc.planned += transformation.summary.planned_count;
      acc.done += transformation.summary.done_count;
      acc.partial += transformation.summary.partial_count;
      acc.missed += transformation.summary.missed_count;
      acc.unanswered += transformation.summary.unanswered_count;
      return acc;
    },
    { planned: 0, done: 0, partial: 0, missed: 0, unanswered: 0 },
  );
  const messageIntent = totals.planned === 0
    ? "encourage"
    : totals.missed > totals.done
    ? "repair"
    : totals.done > 0 && totals.missed === 0
    ? "celebrate"
    : "redirect";
  const shortObservation = totals.planned === 0
    ? "Aucune action confirmee n'est disponible pour cette semaine."
    : `${totals.done}/${totals.planned} action(s) faites, ${totals.partial} partielle(s), ${totals.missed} non faite(s).`;
  const dashboardUrl = cleanText(params.dashboardUrl);

  return {
    version: 1,
    user_id: params.userId,
    timezone: params.timezone,
    week_start_date: params.weekStartDate,
    week_end_date: weekEndForWeekStart(params.weekStartDate),
    generated_at: params.generatedAt,
    transformations,
    global_synthesis: {
      message_intent: messageIntent,
      short_observation: shortObservation,
      whatsapp_message: buildWeeklyProgressReviewFallbackMessage({
        done: totals.done,
        partial: totals.partial,
        missed: totals.missed,
        planned: totals.planned,
      }),
      ...(dashboardUrl
        ? { dashboard_cta: { label: "Voir le dashboard", url: dashboardUrl } }
        : {}),
    },
  };
}

async function loadActivePlansForWeeklyReview(
  supabase: SupabaseClient,
  userId: string,
) {
  const cycleResult = await supabase
    .from("user_cycles")
    .select("id,active_transformation_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (cycleResult.error) throw cycleResult.error;
  const cycle = (cycleResult.data as ActiveCycleRow | null) ?? null;
  if (!cycle) return { cycle: null, transformations: [], plans: [] };

  const transformationsResult = await supabase
    .from("user_transformations")
    .select("id,title,priority_order,activated_at,updated_at")
    .eq("cycle_id", cycle.id)
    .eq("status", "active")
    .order("priority_order", { ascending: true });
  if (transformationsResult.error) throw transformationsResult.error;
  const transformations =
    ((transformationsResult.data ?? []) as TransformationRow[])
      .sort((left, right) => {
        if (cycle.active_transformation_id) {
          if (left.id === cycle.active_transformation_id) return -1;
          if (right.id === cycle.active_transformation_id) return 1;
        }
        return Number(left.priority_order ?? 999) -
          Number(right.priority_order ?? 999);
      });
  if (transformations.length === 0) {
    return { cycle, transformations: [], plans: [] };
  }

  const plansResult = await supabase
    .from("user_plans_v2")
    .select("id,cycle_id,transformation_id,title,content")
    .eq("user_id", userId)
    .eq("cycle_id", cycle.id)
    .eq("status", "active")
    .in("transformation_id", transformations.map((row) => row.id));
  if (plansResult.error) throw plansResult.error;

  return {
    cycle,
    transformations,
    plans: (plansResult.data ?? []) as PlanRow[],
  };
}

export async function hasPlanifiableWeekStart(
  supabase: SupabaseClient,
  params: {
    userId: string;
    weekStartDate: string;
  },
): Promise<boolean> {
  const { plans } = await loadActivePlansForWeeklyReview(
    supabase,
    params.userId,
  );
  return plans.some((plan) =>
    planContentHasPlanifiableWeekStart(plan.content, params.weekStartDate)
  );
}

export async function loadWeeklyProgressReview(
  supabase: SupabaseClient,
  params: {
    userId: string;
    timezone: string;
    weekStartDate?: string | null;
    now?: Date;
    dashboardUrl?: string | null;
  },
): Promise<WeeklyProgressReviewV2> {
  const now = params.now ?? new Date();
  const generatedAt = now.toISOString();
  const timezone = cleanText(params.timezone, "Europe/Paris");
  const weekStartDate = cleanText(params.weekStartDate) ||
    currentWeekStartForTimezone(timezone, now);
  const weekEndDate = weekEndForWeekStart(weekStartDate);
  const { transformations, plans } = await loadActivePlansForWeeklyReview(
    supabase,
    params.userId,
  );
  if (plans.length === 0) {
    return buildWeeklyProgressReviewFromRows({
      userId: params.userId,
      timezone,
      weekStartDate,
      generatedAt,
      transformations,
      plans,
      planItems: [],
      weekPlans: [],
      occurrences: [],
      entries: [],
      dashboardUrl: params.dashboardUrl,
    });
  }

  const planIds = plans.map((plan) => plan.id);
  const [itemsResult, weekPlansResult, occurrencesResult, entriesResult] =
    await Promise.all([
      supabase
        .from("user_plan_items")
        .select(
          "id,cycle_id,transformation_id,plan_id,title,dimension,kind,status,tracking_type",
        )
        .eq("user_id", params.userId)
        .in("plan_id", planIds)
        .in("status", ["active", "in_maintenance", "stalled"]),
      supabase
        .from("user_habit_week_plans")
        .select("plan_item_id,status,planned_days,default_days,confirmed_at")
        .eq("user_id", params.userId)
        .eq("week_start_date", weekStartDate),
      supabase
        .from("user_habit_week_occurrences")
        .select(
          "id,cycle_id,transformation_id,plan_id,plan_item_id,week_start_date,ordinal,planned_day,original_planned_day,actual_day,status,source,validated_at",
        )
        .eq("user_id", params.userId)
        .eq("week_start_date", weekStartDate)
        .in("plan_id", planIds),
      supabase
        .from("user_plan_item_entries")
        .select(
          "id,cycle_id,transformation_id,plan_id,plan_item_id,entry_kind,outcome,effective_at,created_at,metadata",
        )
        .eq("user_id", params.userId)
        .gte(
          "effective_at",
          computeScheduledForFromLocal({
            timezone,
            dayOffset: 0,
            localTimeHHMM: "00:00",
            now: parseDateYmd(weekStartDate),
          }),
        )
        .lt(
          "effective_at",
          computeScheduledForFromLocal({
            timezone,
            dayOffset: 0,
            localTimeHHMM: "00:00",
            now: parseDateYmd(addDaysYmd(weekEndDate, 1)),
          }),
        ),
    ]);
  if (itemsResult.error) throw itemsResult.error;
  if (weekPlansResult.error) throw weekPlansResult.error;
  if (occurrencesResult.error) throw occurrencesResult.error;
  if (entriesResult.error) throw entriesResult.error;

  return buildWeeklyProgressReviewFromRows({
    userId: params.userId,
    timezone,
    weekStartDate,
    generatedAt,
    transformations,
    plans,
    planItems: (itemsResult.data ?? []) as PlanItemRow[],
    weekPlans: (weekPlansResult.data ?? []) as WeekPlanRow[],
    occurrences: (occurrencesResult.data ?? []) as OccurrenceRow[],
    entries: (entriesResult.data ?? []) as EntryRow[],
    dashboardUrl: params.dashboardUrl,
  });
}

export function buildWeeklyProgressReviewFallbackMessage(args: {
  done: number;
  partial: number;
  missed: number;
  planned: number;
}): string {
  if (args.planned === 0) {
    return "Petit point de fin de semaine: je n'ai pas assez de planning confirme pour faire une vraie lecture.";
  }
  if (args.missed === 0 && args.partial === 0) {
    return `Petit point de fin de semaine: ${args.done}/${args.planned} action(s) faites. C'est propre, on garde ce qui marche.`;
  }
  return `Petit point de fin de semaine: ${args.done}/${args.planned} action(s) faites, ${args.partial} partielle(s), ${args.missed} non faite(s). On ajuste la suite sans dramatiser.`;
}

export function buildWeeklyProgressReviewInstruction(
  review: WeeklyProgressReviewV2,
): string {
  return [
    "Nouveau weekly_progress_review_v2, pas l'ancien weekly_bilan.",
    "Objectif: faire une observation courte de fin de semaine et, seulement si utile, pointer vers une recommandation dashboard.",
    "Ne lance pas un questionnaire. Ne fais pas plus de 4 phrases.",
    "Si deux transformations actives existent, fais une phrase par transformation puis une synthese courte.",
    `Transformations analysees: ${review.transformations.length}.`,
    `Synthese brute: ${review.global_synthesis.short_observation}`,
  ].join("\n");
}

export function buildWeeklyProgressReviewGrounding(
  review: WeeklyProgressReviewV2,
): string {
  return JSON.stringify(review);
}

export function buildWeeklyPlanningValidationMessage(args: {
  nextWeekStartDate: string;
  dashboardUrl: string;
}): string {
  return `Ton planning de la semaine prochaine est pret a valider. Tu peux le verifier ici: ${args.dashboardUrl}`;
}
