import { extractReminderInstruction, slugify } from "./instruction_parser.ts";

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
  const tz = String(value ?? "").trim();
  return tz || "Europe/Paris";
}

export function isEuropeParisTimezone(value: unknown): boolean {
  return normalizeTimezone(value) === "Europe/Paris";
}

export function extractStrictAbsoluteParts(message: string): {
  dateIso: string;
  hhmm: string;
  instruction: string;
} | null {
  const candidate = selectCandidateText(message);
  const match = candidate.match(
    /\b(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)?\s*(\d{1,2})\s+([a-zéû]+)\s+(\d{4})\s+(?:a|à|vers)?\s*(\d{1,2})(?::|h)\s*(\d{0,2})/i,
  );
  if (!match) return null;
  const month = monthNumber(match[2]);
  if (!month) return null;
  const dateIso = `${match[3]}-${String(month).padStart(2, "0")}-${
    String(Number(match[1])).padStart(2, "0")
  }`;
  return {
    dateIso,
    hhmm: parseHHMM(match[4], match[5] || "0"),
    instruction: extractReminderInstruction(candidate),
  };
}

export function weekdayFromCivil(
  year: number,
  month: number,
  day: number,
): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function parisOffsetMinutesForUtcIso(iso: string): number {
  return offsetMinutesForTimezone("Europe/Paris", new Date(iso));
}

export function computeScheduledForFromLocal(params: {
  timezone: string;
  nowIso: string;
  dayOffset: number;
  localTimeHHMM: string;
}): string | null {
  const base = new Date(params.nowIso);
  if (!Number.isFinite(base.getTime())) return null;
  const [hhRaw, mmRaw] = params.localTimeHHMM.split(":");
  const hh = Number(hhRaw);
  const mm = Number(mmRaw);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  const local = localPartsForTimezone(base, params.timezone);
  const target = civilDateAddDays(
    local.year,
    local.month,
    local.day,
    params.dayOffset,
  );
  return localCivilToUtcIso({
    timezone: params.timezone,
    year: target.year,
    month: target.month,
    day: target.day,
    hour: hh,
    minute: mm,
  });
}

export function hasRecurringCadenceHint(message: string): boolean {
  const text = normalizeText(message);
  return /\b(tous?|toutes?|chaque)\s+(les?\s+)?(jours?|matins?|soirs?|semaines?|lundis?|mardis?|mercredis?|jeudis?|vendredis?|samedis?|dimanches?)\b/
    .test(
      text,
    ) ||
    /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s*,\s*(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)|\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+et\s+(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/
      .test(
        text,
      ) ||
    weekdayCount(text) >= 2;
}

export function parseOneShotReminderRequest(args: {
  message: string;
  timezone: string;
  nowIso: string;
}): ParsedReminderRequest | null {
  const timezone = normalizeTimezone(args.timezone);
  const now = new Date(args.nowIso);
  if (!Number.isFinite(now.getTime())) return null;
  const candidate = selectCandidateText(args.message);
  if (!candidate.trim()) return null;
  if (hasRecurringCadenceHint(candidate)) return null;

  const relative = parseRelativeTime(candidate, now);
  const absolute = relative ??
    parseAbsoluteOrLocalTime({
      message: candidate,
      timezone,
      nowIso: args.nowIso,
    });
  if (!absolute) return null;

  const instruction = extractReminderInstruction(candidate);
  if (!instruction) return null;

  return {
    scheduledFor: absolute.scheduledFor,
    reminderInstruction: instruction,
    eventContext: `one_shot_reminder:${slugify(instruction) || "generic"}`,
    parseSource: absolute.parseSource,
    parseDetails: {
      algorithm: absolute.algorithm,
      timezone,
      now_utc: now.toISOString(),
      day_offset: absolute.dayOffset,
      local_time_hhmm: absolute.localTimeHHMM,
      scheduled_for_utc: absolute.scheduledFor,
    },
  };
}

export function parseReminderFromMessage(args: {
  message: string;
  timezone: string;
  nowIso: string;
}): ParsedReminderRequest | null {
  return parseOneShotReminderRequest(args);
}

export function parseScheduledForFromMessage(args: {
  message: string;
  timezone: string;
  nowIso: string;
}): string | null {
  const now = new Date(args.nowIso);
  if (!Number.isFinite(now.getTime())) return null;
  const candidate = selectCandidateText(args.message);
  if (!candidate.trim() || hasRecurringCadenceHint(candidate)) return null;
  const relative = parseRelativeTime(candidate, now);
  const absolute = relative ?? parseAbsoluteOrLocalTime({
    message: candidate,
    timezone: normalizeTimezone(args.timezone),
    nowIso: args.nowIso,
  });
  return absolute?.scheduledFor ?? null;
}

export function formatLocalReminderLabel(args: {
  scheduledFor: string;
  timezone?: string | null;
  locale?: string | null;
}): string {
  const timezone = normalizeTimezone(args.timezone);
  const locale = String(args.locale ?? "fr-FR");
  const date = new Date(args.scheduledFor);
  if (!Number.isFinite(date.getTime())) return String(args.scheduledFor);
  return new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function localHHMMForScheduledFor(
  scheduledFor: string,
  timezone?: string | null,
): string | null {
  const date = new Date(scheduledFor);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = localPartsForTimezone(date, normalizeTimezone(timezone));
  return `${String(parts.hour).padStart(2, "0")}:${
    String(parts.minute).padStart(2, "0")
  }`;
}

export function extractTargetHHMMFromMessage(message: string): string | null {
  return extractHHMM(selectCandidateText(message))?.hhmm ?? null;
}

export function parseReminderFromMessageDeterministic(args: {
  message: string;
  timezone: string;
  nowIso: string;
}): ParsedReminderRequest | null {
  return parseOneShotReminderRequest(args);
}

type ParsedTime = {
  scheduledFor: string;
  localTimeHHMM: string;
  dayOffset: number;
  parseSource: ParsedReminderRequest["parseSource"];
  algorithm: string;
};

function parseRelativeTime(message: string, now: Date): ParsedTime | null {
  const text = normalizeText(message);
  let minutes: number | null = null;
  const numeric = text.match(/\bdans\s+(\d{1,3})\s+minutes?\b/);
  if (numeric) minutes = Number(numeric[1]);
  else if (/\bdans\s+un\s+quart\s+d\s+heure\b/.test(text)) minutes = 15;
  else if (/\bdans\s+une?\s+heure\b/.test(text)) minutes = 60;
  if (!minutes || !Number.isFinite(minutes)) return null;
  const scheduled = addMinutes(now.toISOString(), minutes);
  const date = new Date(scheduled);
  return {
    scheduledFor: scheduled,
    localTimeHHMM: `${String(date.getUTCHours()).padStart(2, "0")}:${
      String(date.getUTCMinutes()).padStart(2, "0")
    }`,
    dayOffset: 0,
    parseSource: "local_parser",
    algorithm: "relative_minutes",
  };
}

function parseAbsoluteOrLocalTime(args: {
  message: string;
  timezone: string;
  nowIso: string;
}): ParsedTime | null {
  const now = new Date(args.nowIso);
  const strict = extractStrictAbsoluteParts(args.message);
  const hhmm = strict?.hhmm ?? extractHHMM(args.message)?.hhmm ?? null;
  if (!hhmm) return null;

  const localNow = localPartsForTimezone(now, args.timezone);
  let year = localNow.year;
  let month = localNow.month;
  let day = localNow.day;
  let dayOffset = 0;

  if (strict?.dateIso) {
    const [y, m, d] = strict.dateIso.split("-").map(Number);
    year = y;
    month = m;
    day = d;
    dayOffset = daysBetweenCivil(localNow, { year, month, day });
  } else {
    const text = normalizeText(args.message);
    const numericDate = text.match(
      /\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{4}))?\b/,
    );
    const monthDate = args.message.match(
      /\b(\d{1,2})\s+([a-zéû]+)\s+(\d{4})\b/i,
    );
    if (monthDate) {
      const parsedMonth = monthNumber(monthDate[2]);
      if (!parsedMonth) return null;
      year = Number(monthDate[3]);
      month = parsedMonth;
      day = Number(monthDate[1]);
      dayOffset = daysBetweenCivil(localNow, { year, month, day });
    } else if (numericDate) {
      day = Number(numericDate[1]);
      month = Number(numericDate[2]);
      year = numericDate[3] ? Number(numericDate[3]) : localNow.year;
      dayOffset = daysBetweenCivil(localNow, { year, month, day });
    } else if (
      /\bapres demain|apres-demain|après demain|après-demain\b/.test(text)
    ) {
      dayOffset = 2;
      ({ year, month, day } = civilDateAddDays(year, month, day, 2));
    } else if (/\bdemain\b/.test(text)) {
      dayOffset = 1;
      ({ year, month, day } = civilDateAddDays(year, month, day, 1));
    } else if (/\baujourd hui|aujourd'hui\b/.test(text)) {
      dayOffset = 0;
    } else {
      const [hhRaw, mmRaw] = hhmm.split(":").map(Number);
      const todayIso = localCivilToUtcIso({
        timezone: args.timezone,
        year,
        month,
        day,
        hour: hhRaw,
        minute: mmRaw,
      });
      if (!todayIso) return null;
      if (new Date(todayIso).getTime() <= now.getTime() + 30_000) {
        dayOffset = 1;
        ({ year, month, day } = civilDateAddDays(year, month, day, 1));
      }
    }
  }

  const [hour, minute] = hhmm.split(":").map(Number);
  const scheduledFor = localCivilToUtcIso({
    timezone: args.timezone,
    year,
    month,
    day,
    hour,
    minute,
  });
  if (!scheduledFor) return null;
  return {
    scheduledFor,
    localTimeHHMM: hhmm,
    dayOffset,
    parseSource: strict ? "strict_absolute" : "local_parser",
    algorithm: strict ? "strict_absolute_parts" : "local_hhmm",
  };
}

function extractHHMM(message: string): { hhmm: string } | null {
  const match = String(message ?? "").match(
    /(?:\b(?:a|à|vers)\s*)?(\d{1,2})\s*(?:h|:)\s*(\d{0,2})\b/i,
  );
  if (!match) return null;
  return { hhmm: parseHHMM(match[1], match[2] || "0") };
}

function selectCandidateText(message: string): string {
  const lines = String(message ?? "").split(/\r?\n/).map((line) => line.trim())
    .filter(Boolean);
  const timedOneShot = lines.filter((line) =>
    hasOneShotMarker(line) && extractHHMM(line) &&
    !hasRecurringCadenceHint(line)
  );
  if (timedOneShot.length > 0) return timedOneShot[timedOneShot.length - 1];
  const timed = lines.filter((line) =>
    extractHHMM(line) && !hasRecurringCadenceHint(line)
  );
  if (timed.length > 0) return timed[timed.length - 1];
  return String(message ?? "");
}

function hasOneShotMarker(message: string): boolean {
  const text = normalizeText(message);
  return /\b(rappel|rappelle|programme|mets|met|dis moi|envoie|unique|ponctuel|une seule fois)\b/
    .test(
      text,
    );
}

function weekdayCount(text: string): number {
  const matches = text.match(
    /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/g,
  );
  return matches ? new Set(matches).size : 0;
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function monthNumber(value: string): number | null {
  const key = normalizeText(value);
  const months: Record<string, number> = {
    janvier: 1,
    fevrier: 2,
    mars: 3,
    avril: 4,
    mai: 5,
    juin: 6,
    juillet: 7,
    aout: 8,
    septembre: 9,
    octobre: 10,
    novembre: 11,
    decembre: 12,
  };
  return months[key] ?? null;
}

function localPartsForTimezone(date: Date, timezone: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

function offsetMinutesForTimezone(timezone: string, date: Date): number {
  const parts = localPartsForTimezone(date, timezone);
  const localAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return Math.round((localAsUtc - date.getTime()) / 60000);
}

function localCivilToUtcIso(args: {
  timezone: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}): string | null {
  if (
    ![args.year, args.month, args.day, args.hour, args.minute].every((n) =>
      Number.isFinite(n)
    )
  ) return null;
  let utcMs = Date.UTC(
    args.year,
    args.month - 1,
    args.day,
    args.hour,
    args.minute,
    0,
    0,
  );
  for (let i = 0; i < 3; i += 1) {
    const offset = offsetMinutesForTimezone(args.timezone, new Date(utcMs));
    utcMs = Date.UTC(
      args.year,
      args.month - 1,
      args.day,
      args.hour,
      args.minute,
      0,
      0,
    ) - offset * 60_000;
  }
  return new Date(utcMs).toISOString();
}

function civilDateAddDays(
  year: number,
  month: number,
  day: number,
  days: number,
): { year: number; month: number; day: number } {
  const date = new Date(Date.UTC(year, month - 1, day + days, 12, 0, 0, 0));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function daysBetweenCivil(
  from: { year: number; month: number; day: number },
  to: { year: number; month: number; day: number },
): number {
  const fromMs = Date.UTC(from.year, from.month - 1, from.day, 12);
  const toMs = Date.UTC(to.year, to.month - 1, to.day, 12);
  return Math.round((toMs - fromMs) / 86_400_000);
}
