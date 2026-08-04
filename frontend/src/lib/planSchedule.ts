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

// KEEL W1.3 bug 2 — weekday tokens.
//
// The database stores CANONICAL tokens `mon..sun` (CHECK on
// `user_plan_items.scheduled_days` + normaliser SCHEDULED_DAY_ALIASES in
// supabase/functions/_shared/v2-plan-distribution.ts). This module used to
// look those canonical tokens up in a French-only map and return `[]`, so a
// perfectly valid plan silently lost every date recommendation. The French
// aliases stay accepted (legacy rows and LLM output still carry them on the
// FR branch); the canonical tokens are now the primary key set.
//
// Monday-indexed (0 = Monday) because `week_starts_on` is always "monday".
// A Map, not an object literal: an object lookup on "constructor" or
// "toString" returns a prototype member instead of undefined.
const WEEKDAY_INDEX: ReadonlyMap<string, number> = new Map([
  ["mon", 0], ["monday", 0], ["lundi", 0],
  ["tue", 1], ["tuesday", 1], ["mardi", 1],
  ["wed", 2], ["wednesday", 2], ["mercredi", 2],
  ["thu", 3], ["thursday", 3], ["jeudi", 3],
  ["fri", 4], ["friday", 4], ["vendredi", 4],
  ["sat", 5], ["saturday", 5], ["samedi", 5],
  ["sun", 6], ["sunday", 6], ["dimanche", 6],
]);

/** Canonical `mon..sun` token per Monday-based index. */
const CANONICAL_WEEKDAY_TOKENS = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
] as const;

export class UnknownWeekdayTokenError extends Error {
  readonly token: string;

  constructor(token: string) {
    super(
      `planSchedule: unknown weekday token "${token}" ` +
        `(expected one of ${CANONICAL_WEEKDAY_TOKENS.join(", ")})`,
    );
    this.name = "UnknownWeekdayTokenError";
    this.token = token;
  }
}

/**
 * R7 (fail-loud): a token mapping THROWS on unknown input. It never returns
 * `undefined`, `[]`, or a silent fallback — two normalisations that disagree
 * plus one silent drop equals a bug with no error.
 */
export function parseWeekdayToken(token: unknown): number {
  const normalised = String(token ?? "").trim().toLowerCase();
  const index = WEEKDAY_INDEX.get(normalised);
  if (index === undefined) throw new UnknownWeekdayTokenError(String(token ?? ""));
  return index;
}

/**
 * Normalises a list of weekday tokens (canonical or FR alias) to canonical
 * `mon..sun`, de-duplicated by DAY, so that ["mon", "lundi"] is one day and
 * not two. Empty/whitespace entries are dropped; any other unknown token
 * throws (R7).
 */
export function normalizeWeekdayTokens(
  values: readonly (string | null | undefined)[] | null | undefined,
): string[] {
  const seen = new Set<number>();
  const result: string[] = [];
  for (const value of values ?? []) {
    const raw = String(value ?? "").trim();
    if (!raw) continue;
    const index = parseWeekdayToken(raw);
    if (seen.has(index)) continue;
    seen.add(index);
    result.push(CANONICAL_WEEKDAY_TOKENS[index]);
  }
  return result;
}

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

export function getPlanLevelEndDate(
  anchor: PlanScheduleAnchor,
  durationWeeks: number | null | undefined,
): string | null {
  const weekCount = Math.max(1, Math.floor(durationWeeks ?? 1));
  return addDaysYmd(anchor.anchor_week_end, (weekCount - 1) * 7);
}

export function isPlanLevelReviewWindowOpen(args: {
  anchor: PlanScheduleAnchor | null;
  durationWeeks: number | null | undefined;
  now?: Date;
  unlockDaysBeforeEnd?: number;
}): boolean {
  if (!args.anchor) return false;
  const endDate = getPlanLevelEndDate(args.anchor, args.durationWeeks);
  const localToday = getLocalYmdInTimezone(args.anchor.timezone, args.now ?? new Date());
  if (!endDate || !localToday) return false;

  const unlockDate = addDaysYmd(endDate, -(args.unlockDaysBeforeEnd ?? 2));
  return Boolean(unlockDate && compareYmd(localToday, unlockDate) >= 0);
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

/**
 * Resolves weekday tokens (canonical `mon..sun` or FR alias) to the dates
 * they fall on inside `week`. Days outside the week window (partial first
 * week) are dropped — that is a calendar fact, not a token failure.
 *
 * Throws `UnknownWeekdayTokenError` on an unknown token (R7). Historic name
 * kept: the FR branch imports it from several call sites.
 */
export function resolveFrenchWeekdayDates(
  week: Pick<PlanWeekCalendar, "startDate" | "endDate">,
  weekdays: string[],
): string[] {
  const canonicalWeekdays = normalizeWeekdayTokens(weekdays);
  if (canonicalWeekdays.length === 0) return [];

  const weekStart = dateFromYmdUtc(week.startDate);
  const weekEnd = dateFromYmdUtc(week.endDate);
  if (!weekStart || !weekEnd) return [];

  return canonicalWeekdays.flatMap((weekday) => {
    const index = parseWeekdayToken(weekday);
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
