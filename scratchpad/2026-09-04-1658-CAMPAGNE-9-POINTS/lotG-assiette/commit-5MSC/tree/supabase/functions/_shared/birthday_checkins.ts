import { computeScheduledForFromLocal } from "./scheduled_checkins.ts";

const DEFAULT_TIMEZONE = "Europe/Paris";

export const BIRTHDAY_GREETING_EVENT_CONTEXT_PREFIX = "birthday_greeting_v1";
export const BIRTHDAY_GREETING_MORNING_LOCAL_TIME = "09:30";
export const BIRTHDAY_GREETING_EVENING_LOCAL_TIME = "18:30";

function cleanText(value: unknown, fallback = ""): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function localDateYmdInTimezone(
  timezoneRaw: unknown,
  now = new Date(),
): string {
  const timezone = cleanText(timezoneRaw, DEFAULT_TIMEZONE);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) =>
    String(parts.find((part) => part.type === type)?.value ?? "").padStart(
      2,
      "0",
    );
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function monthDay(value: string): string | null {
  const match = cleanText(value).match(/^\d{4}-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return `${match[1]}-${match[2]}`;
}

export function birthdayGreetingEventContext(localDate: string): string {
  return `${BIRTHDAY_GREETING_EVENT_CONTEXT_PREFIX}:${localDate}`;
}

export function isBirthdayGreetingEventContext(value: unknown): boolean {
  return cleanText(value).startsWith(
    `${BIRTHDAY_GREETING_EVENT_CONTEXT_PREFIX}:`,
  );
}

export function birthdayMatchesLocalDate(params: {
  birthDate: unknown;
  timezone: string;
  now?: Date;
}): { matches: boolean; localDate: string; birthMonthDay: string | null } {
  const localDate = localDateYmdInTimezone(params.timezone, params.now);
  const birthMonthDay = monthDay(cleanText(params.birthDate));
  return {
    matches: Boolean(birthMonthDay && birthMonthDay === monthDay(localDate)),
    localDate,
    birthMonthDay,
  };
}

export function birthdayGreetingScheduledFor(params: {
  timezone: string;
  localTimeHHMM: string;
  now?: Date;
}): string {
  return computeScheduledForFromLocal({
    timezone: cleanText(params.timezone, DEFAULT_TIMEZONE),
    dayOffset: 0,
    localTimeHHMM: params.localTimeHHMM,
    now: params.now,
  });
}

export function buildBirthdayGreetingMessage(params: {
  fullName?: unknown;
} = {}): string {
  const firstName = cleanText(params.fullName).split(/\s+/)[0] ?? "";
  const namePart = firstName ? ` ${firstName}` : "";
  return `Joyeux anniversaire${namePart} !\n\nJe pense à toi aujourd'hui. Je te souhaite une journée douce, vivante, et vraiment à toi.`;
}
