import type { DashboardV2PlanItemRuntime } from "../hooks/useDashboardV2Data";
import type { PlanContentV3 } from "../types/v2";
import {
  formatPlanDateRange,
  formatPlanDateWithWeekday,
  resolveFrenchWeekdayDates,
  type PlanWeekCalendar,
} from "./planSchedule";

type TimingTarget = Pick<
  DashboardV2PlanItemRuntime,
  "dimension" | "kind" | "time_of_day" | "scheduled_days"
> | Pick<
  PlanContentV3["phases"][number]["items"][number],
  "dimension" | "kind" | "time_of_day" | "scheduled_days"
>;

function translateTimeOfDay(value: string | null | undefined): string | null {
  switch ((value ?? "").trim()) {
    case "morning":
      return "le matin";
    case "afternoon":
      return "l'apres-midi";
    case "evening":
      return "le soir";
    case "anytime":
      return "quand tu veux";
    default:
      return null;
  }
}

function normalizeFrenchWeekdays(values: string[] | null | undefined): string[] {
  return (values ?? [])
    .map((value) => value.trim().toLowerCase())
    .filter((value, index, array) => value.length > 0 && array.indexOf(value) === index);
}

function buildDateRecommendationLabel(
  args: {
    item: TimingTarget;
    weekCalendar?: PlanWeekCalendar | null;
    preferredDays?: string[] | null;
  },
): string | null {
  const weekCalendar = args.weekCalendar;
  if (!weekCalendar) return null;

  const explicitDays = normalizeFrenchWeekdays(args.preferredDays);
  const scheduledDays = normalizeFrenchWeekdays(args.item.scheduled_days);
  const candidateDays = explicitDays.length > 0 ? explicitDays : scheduledDays;

  const resolvedDates = candidateDays.length > 0
    ? resolveFrenchWeekdayDates(weekCalendar, candidateDays)
    : [];
  const isOneShotItem = args.item.dimension === "missions" ||
    args.item.dimension === "clarifications" ||
    args.item.kind === "milestone";
  const selectedDates = isOneShotItem
    ? resolvedDates.slice(0, 1)
    : resolvedDates;

  if (selectedDates.length === 1) {
    if (args.item.dimension === "habits") {
      return `a demarrer le ${formatPlanDateWithWeekday(selectedDates[0])}`;
    }
    return `recommande le ${formatPlanDateWithWeekday(selectedDates[0])}`;
  }

  if (selectedDates.length > 1) {
    const renderedDates = selectedDates.map((date) => formatPlanDateWithWeekday(date));
    return `recommande ${renderedDates.map((date) => `le ${date}`).join(" et ")}`;
  }

  if (args.item.dimension === "habits") {
    return `a demarrer du ${formatPlanDateRange(weekCalendar.startDate, weekCalendar.endDate)}`;
  }

  if (args.item.dimension === "missions" || args.item.dimension === "clarifications") {
    return `a faire du ${formatPlanDateRange(weekCalendar.startDate, weekCalendar.endDate)}`;
  }

  return null;
}

export function buildPlanItemMetaLabel(args: {
  item: TimingTarget;
  weekCalendar?: PlanWeekCalendar | null;
  preferredDays?: string[] | null;
  kindLabel: string;
}): string {
  const parts = [args.kindLabel];
  const translatedTime = translateTimeOfDay(args.item.time_of_day);
  const recommendation = buildDateRecommendationLabel({
    item: args.item,
    weekCalendar: args.weekCalendar,
    preferredDays: args.preferredDays,
  });

  if (translatedTime && !(translatedTime === "quand tu veux" && recommendation)) {
    parts.push(translatedTime);
  }
  if (recommendation) {
    parts.push(recommendation);
  } else if (!translatedTime && args.item.time_of_day === "anytime") {
    parts.push("quand tu veux");
  }

  return parts.join(" • ");
}

export function buildPlanPreviewItemMetaLabel(args: {
  plan: PlanContentV3;
  item: PlanContentV3["phases"][number]["items"][number];
  kindLabel: string;
}): string {
  void args.plan;
  const translatedTime = translateTimeOfDay(args.item.time_of_day);
  const parts = [args.kindLabel];
  if (translatedTime && translatedTime !== "quand tu veux") {
    parts.push(translatedTime);
  }
  return parts.join(" • ");
}
