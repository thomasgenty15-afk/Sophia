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
  void message;
  return null;
}

export function weekdayFromCivil(
  year: number,
  month: number,
  day: number,
): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function parisOffsetMinutesForUtcIso(iso: string): number {
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? 60 : 60;
}

export function computeScheduledForFromLocal(params: {
  timezone: string;
  nowIso: string;
  dayOffset: number;
  localTimeHHMM: string;
}): string | null {
  void params.timezone;
  const base = new Date(params.nowIso);
  if (!Number.isFinite(base.getTime())) return null;
  const [hhRaw, mmRaw] = params.localTimeHHMM.split(":");
  const hh = Number(hhRaw);
  const mm = Number(mmRaw);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  const scheduled = new Date(base);
  scheduled.setUTCDate(scheduled.getUTCDate() + params.dayOffset);
  scheduled.setUTCHours(hh, mm, 0, 0);
  return scheduled.toISOString();
}

export function hasRecurringCadenceHint(message: string): boolean {
  void message;
  return false;
}

export function parseOneShotReminderRequest(args: {
  message: string;
  timezone: string;
  nowIso: string;
}): ParsedReminderRequest | null {
  void args.message;
  void args.timezone;
  void args.nowIso;
  return null;
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
  return parseReminderFromMessage(args)?.scheduledFor ?? null;
}

export function formatLocalReminderLabel(args: {
  scheduledFor: string;
  timezone?: string | null;
  locale?: string | null;
}): string {
  void args.timezone;
  void args.locale;
  return new Date(args.scheduledFor).toISOString();
}

export function localHHMMForScheduledFor(
  scheduledFor: string,
  timezone?: string | null,
): string | null {
  void timezone;
  const date = new Date(scheduledFor);
  if (!Number.isFinite(date.getTime())) return null;
  return `${String(date.getUTCHours()).padStart(2, "0")}:${
    String(date.getUTCMinutes()).padStart(2, "0")
  }`;
}

export function extractTargetHHMMFromMessage(message: string): string | null {
  void message;
  return null;
}
