export type PlanScheduleAnchor = {
  version: 1;
  timezone: string;
  generated_at_utc: string;
  anchor_local_date: string;
  anchor_local_human: string;
  anchor_week_start: string;
  anchor_week_end: string;
  anchor_display_start: string;
  days_remaining_in_anchor_week: number;
  is_partial_anchor_week: boolean;
  week_starts_on: "monday";
};

export type PlanWeekCalendar = {
  weekOrder: number;
  anchorWeekStart: string;
  anchorWeekEnd: string;
  startDate: string;
  endDate: string;
  dayCount: number;
  isPartial: boolean;
  status: "completed" | "current" | "upcoming";
  daysRemaining: number | null;
};

const FRENCH_WEEKDAY_INDEX: Record<string, number> = {
  lundi: 0,
  mardi: 1,
  mercredi: 2,
  jeudi: 3,
  vendredi: 4,
  samedi: 5,
  dimanche: 6,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseYmdParts(ymd: string): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function dateFromYmdUtc(ymd: string): Date | null {
  const parts = parseYmdParts(ymd);
  if (!parts) return null;
  const [year, month, day] = parts;
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function formatYmdUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDaysYmd(ymd: string, days: number): string | null {
  const date = dateFromYmdUtc(ymd);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return formatYmdUtc(date);
}

function diffDaysInclusive(startYmd: string, endYmd: string): number | null {
  const start = dateFromYmdUtc(startYmd);
  const end = dateFromYmdUtc(endYmd);
  if (!start || !end) return null;
  const diffMs = end.getTime() - start.getTime();
  return Math.floor(diffMs / 86_400_000) + 1;
}

function compareYmd(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

export function getLocalYmdInTimezone(
  timezone: string,
  now = new Date(),
): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const map = new Map(parts.map((part) => [part.type, part.value]));
    const year = map.get("year");
    const month = map.get("month");
    const day = map.get("day");
    return year && month && day ? `${year}-${month}-${day}` : null;
  } catch {
    return null;
  }
}

export function parsePlanScheduleAnchor(value: unknown): PlanScheduleAnchor | null {
  if (!isRecord(value)) return null;
  const timezone = typeof value.timezone === "string" ? value.timezone.trim() : "";
  const anchorLocalDate = typeof value.anchor_local_date === "string"
    ? value.anchor_local_date.trim()
    : "";
  const anchorWeekStart = typeof value.anchor_week_start === "string"
    ? value.anchor_week_start.trim()
    : "";
  const anchorWeekEnd = typeof value.anchor_week_end === "string"
    ? value.anchor_week_end.trim()
    : "";
  const anchorDisplayStart = typeof value.anchor_display_start === "string"
    ? value.anchor_display_start.trim()
    : "";
  const generatedAtUtc = typeof value.generated_at_utc === "string"
    ? value.generated_at_utc.trim()
    : "";
  const anchorLocalHuman = typeof value.anchor_local_human === "string"
    ? value.anchor_local_human.trim()
    : "";
  const daysRemaining = typeof value.days_remaining_in_anchor_week === "number" &&
      Number.isInteger(value.days_remaining_in_anchor_week)
      ? value.days_remaining_in_anchor_week
      : null;
  const isPartial = typeof value.is_partial_anchor_week === "boolean"
    ? value.is_partial_anchor_week
    : null;

  if (
    !timezone ||
    !anchorLocalDate ||
    !anchorWeekStart ||
    !anchorWeekEnd ||
    !anchorDisplayStart ||
    !generatedAtUtc ||
    !anchorLocalHuman ||
    daysRemaining == null ||
    isPartial == null
  ) {
    return null;
  }

  return {
    version: 1,
    timezone,
    generated_at_utc: generatedAtUtc,
    anchor_local_date: anchorLocalDate,
    anchor_local_human: anchorLocalHuman,
    anchor_week_start: anchorWeekStart,
    anchor_week_end: anchorWeekEnd,
    anchor_display_start: anchorDisplayStart,
    days_remaining_in_anchor_week: daysRemaining,
    is_partial_anchor_week: isPartial,
    week_starts_on: "monday",
  };
}

export function getPlanWeekCalendar(
  anchor: PlanScheduleAnchor,
  weekOrder: number,
  now = new Date(),
): PlanWeekCalendar | null {
  if (!Number.isInteger(weekOrder) || weekOrder < 1) return null;

  const offsetDays = (weekOrder - 1) * 7;
  const fullWeekStart = addDaysYmd(anchor.anchor_week_start, offsetDays);
  const fullWeekEnd = addDaysYmd(anchor.anchor_week_end, offsetDays);
  if (!fullWeekStart || !fullWeekEnd) return null;

  const startDate = weekOrder === 1 ? anchor.anchor_display_start : fullWeekStart;
  const dayCount = diffDaysInclusive(startDate, fullWeekEnd);
  if (dayCount == null) return null;

  const localToday = getLocalYmdInTimezone(anchor.timezone, now);
  let status: PlanWeekCalendar["status"] = "upcoming";
  let daysRemaining: number | null = null;

  if (localToday) {
    if (compareYmd(localToday, startDate) < 0) {
      status = "upcoming";
    } else if (compareYmd(localToday, fullWeekEnd) > 0) {
      status = "completed";
    } else {
      status = "current";
      daysRemaining = diffDaysInclusive(localToday, fullWeekEnd);
    }
  }

  return {
    weekOrder,
    anchorWeekStart: fullWeekStart,
    anchorWeekEnd: fullWeekEnd,
    startDate,
    endDate: fullWeekEnd,
    dayCount,
    isPartial: weekOrder === 1 && anchor.is_partial_anchor_week,
    status,
    daysRemaining,
  };
}

function formatPlainDate(
  ymd: string,
  options: Intl.DateTimeFormatOptions,
): string {
  const date = dateFromYmdUtc(ymd);
  if (!date) return ymd;
  return new Intl.DateTimeFormat("fr-FR", {
    ...options,
    timeZone: "UTC",
  }).format(date);
}

export function formatPlanDateWithWeekday(ymd: string): string {
  return formatPlainDate(ymd, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function formatPlanDateRange(
  startYmd: string,
  endYmd: string,
): string {
  const start = dateFromYmdUtc(startYmd);
  const end = dateFromYmdUtc(endYmd);
  if (!start || !end) return `${startYmd} au ${endYmd}`;

  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const sameMonth = sameYear && start.getUTCMonth() === end.getUTCMonth();

  if (sameMonth) {
    const startDay = formatPlainDate(startYmd, { day: "numeric" });
    const endLabel = formatPlainDate(endYmd, {
      day: "numeric",
      month: "long",
      ...(sameYear ? {} : { year: "numeric" }),
    });
    return `${startDay} au ${endLabel}`;
  }

  return `${formatPlainDate(startYmd, {
    day: "numeric",
    month: "long",
  })} au ${formatPlainDate(endYmd, {
    day: "numeric",
    month: "long",
    ...(sameYear ? {} : { year: "numeric" }),
  })}`;
}

export function resolveFrenchWeekdayDates(
  week: Pick<PlanWeekCalendar, "startDate" | "endDate">,
  weekdays: string[],
): string[] {
  const uniqueWeekdays = weekdays
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry, index, array) => entry.length > 0 && array.indexOf(entry) === index);
  if (uniqueWeekdays.length === 0) return [];

  const weekStart = dateFromYmdUtc(week.startDate);
  const weekEnd = dateFromYmdUtc(week.endDate);
  if (!weekStart || !weekEnd) return [];

  return uniqueWeekdays.flatMap((weekday) => {
    const index = FRENCH_WEEKDAY_INDEX[weekday];
    if (index == null) return [];
    const monday = dateFromYmdUtc(week.startDate);
    if (!monday) return [];
    const mondayDay = monday.getUTCDay() === 0 ? 6 : monday.getUTCDay() - 1;
    monday.setUTCDate(monday.getUTCDate() - mondayDay + index);
    if (monday.getTime() < weekStart.getTime() || monday.getTime() > weekEnd.getTime()) {
      return [];
    }
    return [formatYmdUtc(monday)];
  });
}
