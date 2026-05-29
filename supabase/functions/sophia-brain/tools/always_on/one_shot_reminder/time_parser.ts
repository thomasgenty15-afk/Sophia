import {
  compactText,
  extractReminderInstruction,
  safeTrim,
  slugify,
} from "./instruction_parser.ts";

export type ParsedReminderRequest = {
  scheduledFor: string;
  reminderInstruction: string;
  eventContext: string;
  parseSource?: "strict_absolute" | "local_parser" | "ai_fallback" | "payload";
  parseDetails?: {
    algorithm: string;
    timezone: string;
    now_utc: string;
    day_offset: number;
    local_time_hhmm: string;
    scheduled_for_utc?: string;
    [key: string]: unknown;
  };
};

export function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60 * 1000).toISOString();
}

export function parseHHMM(rawHour: string, rawMinute?: string): string {
  const hh = Math.max(0, Math.min(23, Number(rawHour)));
  const mm = Math.max(0, Math.min(59, Number(rawMinute ?? "0")));
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function normalizeTimezone(value: unknown): string {
  const raw = safeTrim(value) || "Europe/Paris";
  return raw.toLowerCase() === "europe/paris" ? "Europe/Paris" : raw;
}

export function isEuropeParisTimezone(value: unknown): boolean {
  return normalizeTimezone(value) === "Europe/Paris";
}

function strictAbsoluteDayOffset(dayHint: string): number {
  const normalized = safeTrim(dayHint)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  if (normalized.includes("apres-demain")) return 2;
  if (normalized.includes("demain")) return 1;
  return 0;
}

export function extractStrictAbsoluteParts(message: string): {
  dayHint: string;
  dayOffset: number;
  localTimeHHMM: string;
} | null {
  const normalized = compactText(message, 500)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  const match = normalized.match(
    /\b(aujourd'hui|aujourd’hui|ce soir|cet apres-midi|demain|apres-demain)\b(?:\s+(?:vers|a))?\s*(\d{1,2})(?:\s*h\s*|:)(\d{2})?/i,
  );
  if (!match) return null;
  return {
    dayHint: match[1],
    dayOffset: strictAbsoluteDayOffset(match[1]),
    localTimeHHMM: parseHHMM(match[2], match[3]),
  };
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function daysFromCivil(year: number, month: number, day: number): number {
  let y = year;
  let m = month;
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  m += m > 2 ? -3 : 9;
  const doy = Math.floor((153 * m + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function civilFromDays(
  days: number,
): { year: number; month: number; day: number } {
  let z = Math.floor(days) + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) -
      Math.floor(doe / 146096)) / 365,
  );
  let year = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp + (mp < 10 ? 3 : -9);
  year += month <= 2 ? 1 : 0;
  return { year, month, day };
}

function positiveModulo(value: number, modulo: number): number {
  return ((value % modulo) + modulo) % modulo;
}

export function weekdayFromCivil(year: number, month: number, day: number): number {
  return positiveModulo(daysFromCivil(year, month, day) + 4, 7);
}

function lastSundayOfMonthDay(year: number, month: number): number {
  const lastDay = daysInMonth(year, month);
  return lastDay - weekdayFromCivil(year, month, lastDay);
}

function parseUtcIsoParts(iso: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const match = safeTrim(iso).match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/,
  );
  if (!match) throw new Error("Invalid UTC ISO date");
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
  };
}

function utcTotalMinutesFromIso(iso: string): number {
  const parts = parseUtcIsoParts(iso);
  return daysFromCivil(parts.year, parts.month, parts.day) * 1440 +
    parts.hour * 60 + parts.minute;
}

function utcIsoFromTotalMinutes(totalMinutes: number): string {
  const days = Math.floor(totalMinutes / 1440);
  const minutesOfDay = positiveModulo(Math.floor(totalMinutes), 1440);
  const { year, month, day } = civilFromDays(days);
  const hour = Math.floor(minutesOfDay / 60);
  const minute = minutesOfDay % 60;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${
    String(day).padStart(2, "0")
  }T${String(hour).padStart(2, "0")}:${
    String(minute).padStart(2, "0")
  }:00.000Z`;
}

export function parisOffsetMinutesForUtcIso(iso: string): number {
  const parts = parseUtcIsoParts(iso);
  const utcTotal = daysFromCivil(parts.year, parts.month, parts.day) * 1440 +
    parts.hour * 60 + parts.minute;
  const dstStartDay = lastSundayOfMonthDay(parts.year, 3);
  const dstEndDay = lastSundayOfMonthDay(parts.year, 10);
  const dstStart = daysFromCivil(parts.year, 3, dstStartDay) * 1440 + 60;
  const dstEnd = daysFromCivil(parts.year, 10, dstEndDay) * 1440 + 60;
  return utcTotal >= dstStart && utcTotal < dstEnd ? 120 : 60;
}

function parisOffsetMinutesForLocal(
  year: number,
  month: number,
  day: number,
  hour: number,
): number {
  if (month >= 4 && month <= 9) return 120;
  if (month <= 2 || month >= 11) return 60;
  if (month === 3) {
    const startDay = lastSundayOfMonthDay(year, 3);
    return day > startDay || (day === startDay && hour >= 3) ? 120 : 60;
  }
  const endDay = lastSundayOfMonthDay(year, 10);
  return day < endDay || (day === endDay && hour < 3) ? 120 : 60;
}

function computeEuropeParisScheduledForFromLocal(params: {
  dayOffset: number;
  localTimeHHMM: string;
  now: Date;
}): string {
  const match = safeTrim(params.localTimeHHMM).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) throw new Error("Invalid local_time_hhmm");
  const hh = Math.max(0, Math.min(23, Number(match[1])));
  const mm = Math.max(0, Math.min(59, Number(match[2])));
  const nowIso = params.now.toISOString();
  const nowOffset = parisOffsetMinutesForUtcIso(nowIso);
  const nowLocalTotalMinutes = utcTotalMinutesFromIso(nowIso) + nowOffset;
  const nowLocalDay = Math.floor(nowLocalTotalMinutes / 1440);
  const targetLocalDay = nowLocalDay + params.dayOffset;
  const targetLocalDate = civilFromDays(targetLocalDay);
  const targetOffset = parisOffsetMinutesForLocal(
    targetLocalDate.year,
    targetLocalDate.month,
    targetLocalDate.day,
    hh,
  );
  const targetUtcTotalMinutes = targetLocalDay * 1440 + hh * 60 + mm -
    targetOffset;
  return utcIsoFromTotalMinutes(targetUtcTotalMinutes);
}

export function computeScheduledForFromLocal(params: {
  timezone: string;
  dayOffset: number;
  localTimeHHMM: string;
  now?: Date;
}): string {
  const tz = normalizeTimezone(params.timezone);
  const dayOffset = Number.isFinite(Number(params.dayOffset))
    ? Math.max(0, Math.floor(Number(params.dayOffset)))
    : 1;
  if (isEuropeParisTimezone(tz)) {
    return computeEuropeParisScheduledForFromLocal({
      dayOffset,
      localTimeHHMM: params.localTimeHHMM,
      now: params.now ?? new Date(),
    });
  }

  const match = safeTrim(params.localTimeHHMM).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) throw new Error("Invalid local_time_hhmm");
  const hh = Math.max(0, Math.min(23, Number(match[1])));
  const mm = Math.max(0, Math.min(59, Number(match[2])));

  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const now = params.now ?? new Date();
  const nowParts = dtf.formatToParts(now);
  const year = Number(nowParts.find((p) => p.type === "year")?.value ?? "1970");
  const month = Number(nowParts.find((p) => p.type === "month")?.value ?? "1");
  const day = Number(nowParts.find((p) => p.type === "day")?.value ?? "1");

  const targetUtcGuess = new Date(
    Date.UTC(year, month - 1, day + dayOffset, hh, mm, 0),
  );
  const localParts = dtf.formatToParts(targetUtcGuess);
  const localYear = Number(localParts.find((p) => p.type === "year")?.value ?? year);
  const localMonth = Number(localParts.find((p) => p.type === "month")?.value ?? month);
  const localDay = Number(localParts.find((p) => p.type === "day")?.value ?? day);
  const localHour = Number(localParts.find((p) => p.type === "hour")?.value ?? "0");
  const localMinute = Number(localParts.find((p) => p.type === "minute")?.value ?? "0");

  const minuteDelta = (hh - localHour) * 60 + (mm - localMinute);
  const dayDelta = Date.UTC(year, month - 1, day + dayOffset) -
    Date.UTC(localYear, localMonth - 1, localDay);
  return new Date(
    targetUtcGuess.getTime() + minuteDelta * 60_000 + dayDelta,
  ).toISOString();
}

export function hasRecurringCadenceHint(message: string): boolean {
  const text = String(message ?? "").toLowerCase();
  const weekdaysMentioned = text.match(
    /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)s?\b/g,
  ) ?? [];
  return /\b(tous?\s+les|toutes?\s+les|chaque|quotidien|quotidienne|tous?\s+les\s+jours|chaque\s+jour|jours?\s+de\s+semaine|du\s+lundi\s+au\s+vendredi|hebdo|hebdomadaire|routine|rituel|pendant \d+ jours?)\b/i
    .test(text) || new Set(weekdaysMentioned).size >= 2;
}

function parseScheduledForFromAbsoluteHint(args: {
  message: string;
  timezone: string;
  nowIso: string;
}): string | null {
  const parts = extractStrictAbsoluteParts(args.message);
  if (!parts) {
    const normalized = compactText(args.message, 500)
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();
    const explicitOneShot =
      /\b(nouveau rappel|rappel ponctuel|cree un nouveau rappel|creer un nouveau rappel|programme un rappel|programme moi|rappelle moi|mets moi un rappel)\b/
        .test(normalized);
    const timeMatch = normalized.match(
      /\b(?:a|vers|pour)?\s*(\d{1,2})\s*h\s*(\d{2})\b|\b(?:a|vers|pour)?\s*(\d{1,2}):(\d{2})\b/,
    );
    if (!explicitOneShot || !timeMatch) return null;
    const localTimeHHMM = parseHHMM(
      timeMatch[1] ?? timeMatch[3],
      timeMatch[2] ?? timeMatch[4],
    );
    const today = computeScheduledForFromLocal({
      timezone: args.timezone,
      dayOffset: 0,
      localTimeHHMM,
      now: new Date(args.nowIso),
    });
    const todayMs = new Date(today).getTime();
    const nowMs = new Date(args.nowIso).getTime();
    return Number.isFinite(todayMs) && todayMs > nowMs + 30_000
      ? today
      : computeScheduledForFromLocal({
        timezone: args.timezone,
        dayOffset: 1,
        localTimeHHMM,
        now: new Date(args.nowIso),
      });
  }

  return computeScheduledForFromLocal({
    timezone: args.timezone,
    dayOffset: parts.dayOffset,
    localTimeHHMM: parts.localTimeHHMM,
    now: new Date(args.nowIso),
  });
}

function parseScheduledForFromRelativeHint(args: {
  message: string;
  nowIso: string;
}): string | null {
  const text = String(args.message ?? "").toLowerCase();

  if (/\bdans\s+un\s+quart\s+d['’]heure\b/i.test(text)) return addMinutes(args.nowIso, 15);
  if (/\bdans\s+une\s+demi(?:-|\s)heure\b/i.test(text)) return addMinutes(args.nowIso, 30);

  const minuteMatch = text.match(/\bdans\s+(\d{1,3})\s*(?:minutes?|min)\b/i);
  if (minuteMatch) return addMinutes(args.nowIso, Number(minuteMatch[1]));
  if (/\bdans\s+une?\s+(?:minutes?|min)\b/i.test(text)) return addMinutes(args.nowIso, 1);

  const hourMatch = text.match(/\bdans\s+(\d{1,2})\s*(?:heures?|h)\b/i);
  if (hourMatch) return addMinutes(args.nowIso, Number(hourMatch[1]) * 60);
  if (/\bdans\s+une?\s+(?:heures?|h)\b/i.test(text)) return addMinutes(args.nowIso, 60);

  const dayMatch = text.match(/\bdans\s+(\d{1,2})\s*jours?\b/i);
  if (dayMatch) {
    return new Date(
      new Date(args.nowIso).getTime() + Number(dayMatch[1]) * 24 * 60 * 60 * 1000,
    ).toISOString();
  }

  return null;
}

export function parseOneShotReminderRequest(args: {
  message: string;
  timezone: string;
  nowIso: string;
}): ParsedReminderRequest | null {
  const message = compactText(args.message, 500);
  if (!message) return null;
  if (hasRecurringCadenceHint(message)) return null;

  const scheduledFor = parseScheduledForFromAbsoluteHint(args) ??
    parseScheduledForFromRelativeHint(args);
  if (!scheduledFor) return null;

  const reminderInstruction = extractReminderInstruction(message);
  return {
    scheduledFor,
    reminderInstruction,
    eventContext: `one_shot_reminder:${slugify(reminderInstruction) || "generic"}`,
    parseSource: "local_parser",
  };
}

function parseStrictAbsoluteReminderRequest(args: {
  message: string;
  timezone: string;
  nowIso: string;
}): ParsedReminderRequest | null {
  const message = compactText(args.message, 500);
  if (!message || hasRecurringCadenceHint(message)) return null;
  if (!/\brappelle|rappel|remind\b/i.test(message)) return null;

  const explicit = extractStrictAbsoluteParts(message);
  const scheduledFor = explicit
    ? computeScheduledForFromLocal({
      timezone: args.timezone,
      dayOffset: explicit.dayOffset,
      localTimeHHMM: explicit.localTimeHHMM,
      now: new Date(args.nowIso),
    })
    : parseScheduledForFromAbsoluteHint(args);
  if (!scheduledFor) return null;

  const reminderInstruction = extractReminderInstruction(message);
  return {
    scheduledFor,
    reminderInstruction,
    eventContext: `one_shot_reminder:${slugify(reminderInstruction) || "generic"}`,
    parseSource: "strict_absolute",
    parseDetails: explicit
      ? {
        algorithm: "strict_absolute_local",
        timezone: normalizeTimezone(args.timezone),
        now_utc: new Date(args.nowIso).toISOString(),
        day_offset: explicit.dayOffset,
        local_time_hhmm: explicit.localTimeHHMM,
        scheduled_for_utc: scheduledFor,
      }
      : undefined,
  };
}

export function parseReminderFromMessageDeterministic(args: {
  message: string;
  timezone: string;
  nowIso: string;
}): ParsedReminderRequest | null {
  const strictParts = extractStrictAbsoluteParts(args.message);
  if (strictParts) {
    const scheduledFor = computeScheduledForFromLocal({
      timezone: args.timezone,
      dayOffset: strictParts.dayOffset,
      localTimeHHMM: strictParts.localTimeHHMM,
      now: new Date(args.nowIso),
    });
    if (scheduledFor) {
      const instruction = extractReminderInstruction(args.message);
      return {
        scheduledFor,
        reminderInstruction: instruction,
        eventContext: `one_shot_reminder:${slugify(instruction) || "generic"}`,
        parseSource: "strict_absolute",
      };
    }
  }
  return parseStrictAbsoluteReminderRequest(args) ?? parseOneShotReminderRequest(args);
}

export function parseScheduledForFromMessage(args: {
  message: string;
  timezone: string;
  nowIso: string;
}): string | null {
  return parseReminderFromMessageDeterministic(args)?.scheduledFor ?? null;
}

export function formatLocalReminderLabel(args: {
  scheduledFor: string;
  timezone: string;
  locale: string;
}): string {
  if (isEuropeParisTimezone(args.timezone)) {
    const offset = parisOffsetMinutesForUtcIso(args.scheduledFor);
    const localTotalMinutes = utcTotalMinutesFromIso(args.scheduledFor) + offset;
    const localDay = Math.floor(localTotalMinutes / 1440);
    const localMinutesOfDay = positiveModulo(localTotalMinutes, 1440);
    const local = civilFromDays(localDay);
    const weekdays = [
      "dimanche",
      "lundi",
      "mardi",
      "mercredi",
      "jeudi",
      "vendredi",
      "samedi",
    ];
    const months = [
      "janvier",
      "février",
      "mars",
      "avril",
      "mai",
      "juin",
      "juillet",
      "août",
      "septembre",
      "octobre",
      "novembre",
      "décembre",
    ];
    const hour = Math.floor(localMinutesOfDay / 60);
    const minute = localMinutesOfDay % 60;
    return `${weekdays[weekdayFromCivil(local.year, local.month, local.day)]} ${
      String(local.day).padStart(2, "0")
    } ${months[local.month - 1]} à ${String(hour).padStart(2, "0")}:${
      String(minute).padStart(2, "0")
    }`;
  }

  return new Intl.DateTimeFormat(args.locale || "fr-FR", {
    timeZone: args.timezone,
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(args.scheduledFor));
}

export function localHHMMForScheduledFor(
  scheduledFor: string,
  timezone: string,
): string | null {
  try {
    if (isEuropeParisTimezone(timezone)) {
      const offset = parisOffsetMinutesForUtcIso(scheduledFor);
      const localTotal = utcTotalMinutesFromIso(scheduledFor) + offset;
      const minutesOfDay = positiveModulo(localTotal, 1440);
      const hour = Math.floor(minutesOfDay / 60);
      const minute = minutesOfDay % 60;
      return `${String(hour).padStart(2, "0")}:${
        String(minute).padStart(2, "0")
      }`;
    }
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(scheduledFor));
    const hh = parts.find((p) => p.type === "hour")?.value ?? "";
    const mm = parts.find((p) => p.type === "minute")?.value ?? "";
    return hh && mm ? `${hh}:${mm}` : null;
  } catch {
    return null;
  }
}

export function extractTargetHHMMFromMessage(message: string): string | null {
  const text = compactText(message, 500)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  const match = text.match(/\b(\d{1,2})\s*h\s*(\d{2})\b/) ??
    text.match(/\b(\d{1,2}):(\d{2})\b/) ??
    text.match(/\b(\d{1,2})\s*h\b/);
  if (!match) return null;
  return parseHHMM(match[1], match[2]);
}
