import type { DashboardV2PlanItemRuntime } from "../hooks/useDashboardV2Data";
import type { PlanContentV3 } from "../types/v2";
import {
  formatPlanDateRange,
  formatPlanDateWithWeekday,
  normalizeWeekdayTokens,
  parseWeekdayToken,
  resolveFrenchWeekdayDates,
  UnknownWeekdayTokenError,
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

// KEEL W1.3 bug 2 — this normaliser used to lowercase and de-duplicate raw
// strings, which let canonical DB tokens (`mon..sun`) reach a French-only
// index and vanish. It now maps through the single fail-loud token parser
// (R7): canonical tokens win, FR aliases stay accepted, unknown throws.
//
// Used ONLY on `scheduled_days`, which is a CHECK-protected column
// (user_plan_items_scheduled_days_check: subset of mon..sun). An unknown token
// there is a genuine contract violation and must surface.
function normalizeFrenchWeekdays(values: string[] | null | undefined): string[] {
  return normalizeWeekdayTokens(values);
}

// The untrusted boundary, kept separate on purpose.
//
// `preferredDays` comes from `week.mission_days` — the jsonb field CONTRACT R5
// names as the one no CHECK can reach ("carries live French that no CHECK can
// reach"). Letting the fail-loud parser throw here would take the whole
// dashboard down through React render on a single malformed LLM day label,
// which trades a missing date hint for a blank screen.
//
// This is NOT the silent `[]` R7 forbids: each rejected token is named in the
// console, the drop is explicit and local to one untrusted source, and the
// mapping itself still throws for every trusted caller. Delete this quarantine
// when mission_days is either dropped (W2.C) or CHECK-protected.
function quarantineUntrustedWeekdays(
  values: string[] | null | undefined,
): string[] {
  const kept: string[] = [];
  const rejected: string[] = [];
  for (const value of values ?? []) {
    const raw = String(value ?? "").trim();
    if (!raw) continue;
    try {
      parseWeekdayToken(raw);
      kept.push(raw);
    } catch (error) {
      if (!(error instanceof UnknownWeekdayTokenError)) throw error;
      rejected.push(raw);
    }
  }
  if (rejected.length > 0) {
    console.warn(
      "[planItemTiming] mission_days carries unknown weekday tokens, dropped:",
      rejected,
    );
  }
  return normalizeWeekdayTokens(kept);
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

  const explicitDays = quarantineUntrustedWeekdays(args.preferredDays);
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
