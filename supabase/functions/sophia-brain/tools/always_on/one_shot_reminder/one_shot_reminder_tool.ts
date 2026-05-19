import {
  createClient,
  type SupabaseClient,
} from "jsr:@supabase/supabase-js@2.87.3";
import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../../_shared/gemini.ts";
import { getUserTimeContext } from "../../../../_shared/user_time_context.ts";
import type { TurnFrame } from "../../../contracts/turn_frame.v1.ts";
import {
  type DirectEffectGateInput,
  runDirectEffectGate,
} from "../../../routers/direct_effect_gate.ts";

export type OneShotReminderToolOutcome =
  | {
    detected: false;
  }
  | {
    detected: true;
    status: "needs_clarify";
    reason: "missing_time" | "past_time" | "unsupported_time";
    user_message: string;
  }
  | {
    detected: true;
    status: "failed";
    reason: "insert_failed";
    user_message: string;
    error_message: string;
  }
  | {
    detected: true;
    status: "success";
    user_message: string;
    scheduled_for: string;
    scheduled_for_local_label: string;
    reminder_instruction: string;
    event_context: string;
    inserted_checkin_id: string;
    parse_source?:
      | "strict_absolute"
      | "local_parser"
      | "ai_fallback"
      | "payload"
      | "unknown";
  };

export type CreateOneShotReminderV2Outcome =
  | OneShotReminderToolOutcome
  | {
    detected: true;
    status: "blocked";
    reason:
      | "safety_high"
      | "pending_confirmation_active"
      | "duplicate_source_message"
      | "duplicate_db";
    user_message: string;
  };

export type CreateOneShotReminderV2Write = (input: {
  user_id: string;
  scheduled_for: string;
  reminder_instruction: string;
  event_context: string;
  request_text: string;
  timezone: string;
  idempotency_key: string;
}) => Promise<{
  inserted_checkin_id: string;
  scheduled_for?: string;
  event_context?: string;
}>;

type ParsedReminderRequest = {
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
  };
};

type AiReminderFallbackExtraction = {
  is_one_shot?: boolean;
  confidence?: number;
  normalized_request?: string | null;
  reminder_instruction?: string | null;
  scheduled_for_utc?: string | null;
};

let reminderWriteClient: SupabaseClient | null = null;

function isLocalSupabaseUrl(url: string): boolean {
  try {
    const host = new URL(String(url ?? "")).hostname.toLowerCase();
    return host === "127.0.0.1" || host === "localhost" || host === "kong" ||
      host.startsWith("supabase_");
  } catch {
    return false;
  }
}

function isJwtLike(value: string): boolean {
  return String(value ?? "").split(".").length === 3;
}

function base64Url(bytes: Uint8Array): string {
  const raw = btoa(String.fromCharCode(...bytes));
  return raw.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signLocalServiceRoleJwt(secret: string): Promise<string> {
  const encode = (value: unknown) =>
    base64Url(new TextEncoder().encode(JSON.stringify(value)));
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode({
    iss: "supabase-demo",
    role: "service_role",
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365 * 10,
  });
  const toSign = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(toSign),
    ),
  );
  return `${toSign}.${base64Url(signature)}`;
}

async function getReminderWriteClient(
  fallback: SupabaseClient,
): Promise<SupabaseClient> {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  let serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (url && isLocalSupabaseUrl(url) && !isJwtLike(serviceRoleKey)) {
    const jwtSecret = Deno.env.get("JWT_SECRET") ??
      "super-secret-jwt-token-with-at-least-32-characters-long";
    serviceRoleKey = await signLocalServiceRoleJwt(jwtSecret);
  }
  if (!url || !serviceRoleKey) return fallback;

  reminderWriteClient ??= createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return reminderWriteClient;
}

const REMINDER_REQUEST_PREFIX_REGEX =
  /\b(?:rappelle(?:-|\s)?moi|tu\s+peux\s+me\s+rappeler|peux-tu\s+me\s+rappeler|peux\s+tu\s+me\s+rappeler|tu\s+peux\s+m['’]envoyer\s+un\s+rappel|peux-tu\s+m['’]envoyer\s+un\s+rappel|peux\s+tu\s+m['’]envoyer\s+un\s+rappel|tu\s+peux\s+me\s+faire\s+un\s+rappel|peux-tu\s+me\s+faire\s+un\s+rappel|peux\s+tu\s+me\s+faire\s+un\s+rappel|tu\s+pourrais\s+me\s+faire\s+un\s+rappel|tu\s+pourrais\s+m['’]envoyer\s+un\s+rappel|est(?:-|\s)?ce\s+que\s+tu\s+peux\s+me\s+faire\s+un\s+rappel|est(?:-|\s)?ce\s+que\s+tu\s+peux\s+m['’]envoyer\s+un\s+rappel|envoie(?:-|\s)?moi\s+un\s+rappel|fais(?:-|\s)?moi\s+un\s+rappel|mets(?:-|\s)?moi\s+un\s+rappel|dis(?:-|\s)?moi|préviens(?:-|\s)?moi|previens(?:-|\s)?moi|fais(?:-|\s)?moi\s+signe|remind\s+me)\b([\s\S]*)$/i;

function compactText(value: unknown, maxLen = 240): string {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return text.length <= maxLen
    ? text
    : `${text.slice(0, maxLen - 1).trimEnd()}…`;
}

function safeTrim(value: unknown): string {
  return String(value ?? "").trim();
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const message = typeof record.message === "string" ? record.message : "";
    const details = typeof record.details === "string" ? record.details : "";
    const code = typeof record.code === "string" ? record.code : "";
    return [code, message, details].filter(Boolean).join(" | ") ||
      JSON.stringify(record);
  }
  return String(error);
}

function slugify(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

function extractReminderClause(message: string): string {
  const match = message.match(REMINDER_REQUEST_PREFIX_REGEX);
  return compactText(match?.[1] ?? "");
}

function isMemoryRecallReminderPhrase(message: string): boolean {
  const clause = extractReminderClause(message)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
  if (!clause) return false;
  return /^(ce\s+(?:qui|que|qu['’]|dont)|quoi|comment|pourquoi|le\s+bon|la\s+bonne|les\s+bons?|les\s+bonnes)\b/
    .test(clause);
}

function isRecurringReminderRequest(message: string): boolean {
  const text = String(message ?? "").toLowerCase();
  if (!/\brappel|rappelle|remind\b/.test(text)) return false;
  return hasRecurringCadenceHint(text);
}

function hasRecurringCadenceHint(message: string): boolean {
  const text = String(message ?? "").toLowerCase();
  const weekdaysMentioned = text.match(
    /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)s?\b/g,
  ) ?? [];
  return /\b(tous?\s+les|toutes?\s+les|chaque|quotidien|quotidienne|tous?\s+les\s+jours|chaque\s+jour|jours?\s+de\s+semaine|du\s+lundi\s+au\s+vendredi|hebdo|hebdomadaire)\b/i
    .test(text) || new Set(weekdaysMentioned).size >= 2;
}

function hasResolvableOneShotTimeHint(message: string): boolean {
  const text = String(message ?? "");
  return /\bdans\s+un\s+quart\s+d['’]heure\b/i.test(text) ||
    /\bdans\s+une\s+demi(?:-|\s)heure\b/i.test(text) ||
    /\bdans\s+(?:une?|1)\s+(?:minutes?|min|heures?|h|jours?)\b/i.test(text) ||
    /\bdans\s+\d{1,3}\s*(?:minutes?|min|heures?|h|jours?)\b/i.test(text) ||
    /\b(aujourd['’]hui|ce\s+soir|cet\s+apr[eè]s-midi|demain|apr[eè]s-demain)\b/i
      .test(text);
}

export function isLikelyOneShotReminderRequest(message: string): boolean {
  const text = compactText(message, 500);
  if (!text) return false;
  if (isMemoryRecallReminderPhrase(text)) return false;
  const reminderClause = extractReminderClause(text);
  if (reminderClause) return !hasRecurringCadenceHint(reminderClause);
  if (isRecurringReminderRequest(text)) return false;
  if (!/\brappel|rappelle|remind\b/i.test(text)) return false;
  return hasResolvableOneShotTimeHint(text);
}

function addMinutes(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60 * 1000).toISOString();
}

function parseHHMM(rawHour: string, rawMinute?: string): string {
  const hh = Math.max(0, Math.min(23, Number(rawHour)));
  const mm = Math.max(0, Math.min(59, Number(rawMinute ?? "0")));
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function normalizeTimezone(value: unknown): string {
  const raw = safeTrim(value) || "Europe/Paris";
  return raw.toLowerCase() === "europe/paris" ? "Europe/Paris" : raw;
}

function isEuropeParisTimezone(value: unknown): boolean {
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

function extractStrictAbsoluteParts(message: string): {
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

function weekdayFromCivil(year: number, month: number, day: number): number {
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

function parisOffsetMinutesForUtcIso(iso: string): number {
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

function computeScheduledForFromLocal(params: {
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
  const localYear = Number(
    localParts.find((p) => p.type === "year")?.value ?? year,
  );
  const localMonth = Number(
    localParts.find((p) => p.type === "month")?.value ?? month,
  );
  const localDay = Number(
    localParts.find((p) => p.type === "day")?.value ?? day,
  );
  const localHour = Number(
    localParts.find((p) => p.type === "hour")?.value ?? "0",
  );
  const localMinute = Number(
    localParts.find((p) => p.type === "minute")?.value ?? "0",
  );

  const minuteDelta = (hh - localHour) * 60 + (mm - localMinute);
  const dayDelta = Date.UTC(year, month - 1, day + dayOffset) -
    Date.UTC(localYear, localMonth - 1, localDay);
  const corrected = new Date(
    targetUtcGuess.getTime() + minuteDelta * 60_000 + dayDelta,
  );
  return corrected.toISOString();
}

function parseScheduledForFromAbsoluteHint(args: {
  message: string;
  timezone: string;
  nowIso: string;
}): string | null {
  const parts = extractStrictAbsoluteParts(args.message);
  if (!parts) return null;

  const scheduledFor = computeScheduledForFromLocal({
    timezone: args.timezone,
    dayOffset: parts.dayOffset,
    localTimeHHMM: parts.localTimeHHMM,
    now: new Date(args.nowIso),
  });
  return scheduledFor;
}

function parseScheduledForFromRelativeHint(args: {
  message: string;
  nowIso: string;
}): string | null {
  const text = String(args.message ?? "").toLowerCase();

  if (/\bdans\s+un\s+quart\s+d['’]heure\b/i.test(text)) {
    return addMinutes(args.nowIso, 15);
  }
  if (/\bdans\s+une\s+demi(?:-|\s)heure\b/i.test(text)) {
    return addMinutes(args.nowIso, 30);
  }

  const minuteMatch = text.match(/\bdans\s+(\d{1,3})\s*(?:minutes?|min)\b/i);
  if (minuteMatch) {
    return addMinutes(args.nowIso, Number(minuteMatch[1]));
  }
  if (/\bdans\s+une?\s+(?:minutes?|min)\b/i.test(text)) {
    return addMinutes(args.nowIso, 1);
  }

  const hourMatch = text.match(/\bdans\s+(\d{1,2})\s*(?:heures?|h)\b/i);
  if (hourMatch) {
    return addMinutes(args.nowIso, Number(hourMatch[1]) * 60);
  }
  if (/\bdans\s+une?\s+(?:heures?|h)\b/i.test(text)) {
    return addMinutes(args.nowIso, 60);
  }

  const dayMatch = text.match(/\bdans\s+(\d{1,2})\s*jours?\b/i);
  if (dayMatch) {
    const target = new Date(
      new Date(args.nowIso).getTime() +
        Number(dayMatch[1]) * 24 * 60 * 60 * 1000,
    );
    return target.toISOString();
  }

  return null;
}

function extractReminderInstruction(message: string): string {
  const full = compactText(message, 500);
  const clause = extractReminderClause(full) || full;

  let explicitTarget = clause.match(
      /\b(?:de\s+manière\s+à\s+ce\s+que|de\s+maniere\s+à\s+ce\s+que|de\s+maniere\s+a\s+ce\s+que|de\s+façon\s+à\s+ce\s+que|de\s+facon\s+a\s+ce\s+que|pour\s+que)\s+je\s+fasse\s+(.+)$/i,
    )?.[1]
    ? `faire ${
      clause.match(
        /\b(?:de\s+manière\s+à\s+ce\s+que|de\s+maniere\s+à\s+ce\s+que|de\s+maniere\s+a\s+ce\s+que|de\s+façon\s+à\s+ce\s+que|de\s+facon\s+a\s+ce\s+que|pour\s+que)\s+je\s+fasse\s+(.+)$/i,
      )?.[1] ?? ""
    }`
    : undefined;
  explicitTarget = explicitTarget ??
    clause.match(
      /\bpour\s+me\s+(?:dire|rappeler|faire\s+penser)(?:\s+de)?\s+(.+)$/i,
    )?.[1] ??
    clause.match(/\bqu['’]?\s*il\s+faut\s+que\s+je\s+(.+)$/i)?.[1] ??
    clause.match(/\bqu\s+il\s+faut\s+que\s+je\s+(.+)$/i)?.[1] ??
    clause.match(/\bil\s+faut\s+que\s+je\s+(.+)$/i)?.[1] ??
    clause.match(/\bd['’]\s*(.+)$/i)?.[1] ??
    clause.match(/\bde\s+(.+)$/i)?.[1] ??
    clause.match(/\bpour\s+(.+)$/i)?.[1] ??
    "";

  const cleaned = compactText(
    explicitTarget
      .replace(/\bmanière\s+à\s+ce\s+que\s+je\s+fasse\s+/gi, "faire ")
      .replace(/\bmaniere\s+à\s+ce\s+que\s+je\s+fasse\s+/gi, "faire ")
      .replace(/\bmaniere\s+a\s+ce\s+que\s+je\s+fasse\s+/gi, "faire ")
      .replace(/\bfaçon\s+à\s+ce\s+que\s+je\s+fasse\s+/gi, "faire ")
      .replace(/\bfacon\s+a\s+ce\s+que\s+je\s+fasse\s+/gi, "faire ")
      .replace(/\bpour\s+que\s+je\s+fasse\s+/gi, "faire ")
      .replace(/\bce\s+que\s+je\s+fasse\s+/gi, "faire ")
      .replace(/^me\s+bouge\b/i, "me bouger")
      .replace(/\s*,?\s+mais\s+si\b[\s\S]*$/i, "")
      .replace(/\s*,?\s+mais\b[\s\S]*$/i, "")
      .replace(/\b(?:stp|s['’]il te plaît|s'il te plait|please)\b/gi, " ")
      .replace(/\s*(?:[?!.]+|[:;]-?[)(DPp/]+)+\s*$/g, "")
      .replace(/\s*(?:<3|xd|xD|XD)+\s*$/g, "")
      .replace(/[?!.]+$/g, ""),
    140,
  );
  if (cleaned) return cleaned;
  return "ce que tu as prévu";
}

export function parseOneShotReminderRequest(args: {
  message: string;
  timezone: string;
  nowIso: string;
}): ParsedReminderRequest | null {
  const message = compactText(args.message, 500);
  if (!message) return null;
  const reminderClause = extractReminderClause(message) || message;
  if (hasRecurringCadenceHint(reminderClause)) return null;
  const candidateMessage = reminderClause;

  const absoluteScheduledFor = parseScheduledForFromAbsoluteHint({
    message: candidateMessage,
    timezone: args.timezone,
    nowIso: args.nowIso,
  });
  const relativeScheduledFor = parseScheduledForFromRelativeHint({
    message: candidateMessage,
    nowIso: args.nowIso,
  });
  const scheduledFor = absoluteScheduledFor ?? relativeScheduledFor;
  if (!scheduledFor) return null;

  const reminderInstruction = extractReminderInstruction(candidateMessage);
  const reminderSlug = slugify(reminderInstruction) || "generic";
  const eventContext = `one_shot_reminder:${reminderSlug}`;
  return {
    scheduledFor,
    reminderInstruction,
    eventContext,
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

  const normalized = message
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  const explicit = extractStrictAbsoluteParts(normalized);
  const scheduledFor = explicit
    ? computeScheduledForFromLocal({
      timezone: args.timezone,
      dayOffset: explicit.dayOffset,
      localTimeHHMM: explicit.localTimeHHMM,
      now: new Date(args.nowIso),
    })
    : parseScheduledForFromAbsoluteHint({
      message,
      timezone: args.timezone,
      nowIso: args.nowIso,
    });
  if (!scheduledFor) return null;

  const reminderInstruction = extractReminderInstruction(message);
  const reminderSlug = slugify(reminderInstruction) || "generic";
  return {
    scheduledFor,
    reminderInstruction,
    eventContext: `one_shot_reminder:${reminderSlug}`,
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

function parseAiReminderFallbackOutput(
  raw: unknown,
): AiReminderFallbackExtraction | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const jsonCandidate = text.match(/\{[\s\S]*\}/)?.[0] ?? text;
  try {
    const parsed = JSON.parse(jsonCandidate);
    return parsed && typeof parsed === "object"
      ? parsed as AiReminderFallbackExtraction
      : null;
  } catch {
    return null;
  }
}

async function inferOneShotReminderRequestWithAi(args: {
  message: string;
  timezone: string;
  nowIso: string;
  requestId?: string;
}): Promise<ParsedReminderRequest | null> {
  const systemPrompt = [
    "Tu es un extracteur ultra strict de rappels ponctuels.",
    "Tu dois detecter si le message utilisateur demande un rappel one-shot (non recurrent), puis normaliser la demande.",
    "Retourne uniquement du JSON valide.",
    'Schema: {"is_one_shot":true|false,"confidence":0..1,"normalized_request":"...","reminder_instruction":"...","scheduled_for_utc":"ISO8601|null"}',
    "Règles:",
    "- true uniquement si la demande est bien un rappel ponctuel demande a Sophia.",
    "- false si c'est recurrent, ambigu, ou si le user ne demande pas vraiment un rappel.",
    '- normalized_request doit reformuler en francais simple type: "Rappelle-moi dans 10 minutes de faire mes pompes".',
    "- reminder_instruction doit etre bref et actionnable.",
    "- scheduled_for_utc doit etre un ISO UTC seulement si l'heure est deduisible de facon fiable depuis le message + maintenant + timezone.",
    `- Maintenant UTC: ${args.nowIso}`,
    `- Timezone utilisateur: ${args.timezone}`,
  ].join("\n");

  try {
    const raw = await generateWithGemini(
      systemPrompt,
      compactText(args.message, 500),
      0.1,
      true,
      [],
      "auto",
      {
        requestId: args.requestId,
        model: getGlobalAiModel("gemini-2.5-flash"),
        source: "one_shot_reminder_tool:fallback",
      },
    );
    const parsed = parseAiReminderFallbackOutput(raw);
    if (!parsed?.is_one_shot) return null;
    const confidence = Number(parsed.confidence ?? 0);
    if (!Number.isFinite(confidence) || confidence < 0.72) return null;

    const normalizedRequest = compactText(parsed.normalized_request ?? "", 240);
    if (normalizedRequest) {
      const reparsed = parseOneShotReminderRequest({
        message: normalizedRequest,
        timezone: args.timezone,
        nowIso: args.nowIso,
      });
      if (reparsed) return reparsed;
    }

    const reminderInstruction = compactText(
      parsed.reminder_instruction ?? "",
      140,
    );
    const scheduledForRaw = safeTrim(parsed.scheduled_for_utc ?? "");
    const scheduledMs = scheduledForRaw
      ? new Date(scheduledForRaw).getTime()
      : NaN;
    if (!reminderInstruction || !Number.isFinite(scheduledMs)) return null;

    return {
      scheduledFor: new Date(scheduledMs).toISOString(),
      reminderInstruction,
      eventContext: `one_shot_reminder:${
        slugify(reminderInstruction) || "generic"
      }`,
      parseSource: "ai_fallback",
    };
  } catch {
    return null;
  }
}

function formatLocalReminderLabel(args: {
  scheduledFor: string;
  timezone: string;
  locale: string;
}): string {
  if (isEuropeParisTimezone(args.timezone)) {
    const offset = parisOffsetMinutesForUtcIso(args.scheduledFor);
    const localTotalMinutes = utcTotalMinutesFromIso(args.scheduledFor) +
      offset;
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

export async function maybeCreateOneShotReminder(params: {
  supabase: SupabaseClient;
  userId: string;
  message: string;
  requestId?: string;
}): Promise<OneShotReminderToolOutcome> {
  if (!isLikelyOneShotReminderRequest(params.message)) {
    return { detected: false };
  }

  const tctx = await getUserTimeContext({
    supabase: params.supabase,
    userId: params.userId,
  });
  const strictParts = extractStrictAbsoluteParts(params.message);
  const strictScheduledFor = strictParts
    ? computeScheduledForFromLocal({
      timezone: tctx.user_timezone,
      dayOffset: strictParts.dayOffset,
      localTimeHHMM: strictParts.localTimeHHMM,
      now: new Date(tctx.now_utc),
    })
    : null;
  const hardParsed: ParsedReminderRequest | null = strictParts
    ? {
      scheduledFor: strictScheduledFor ?? "",
      reminderInstruction: extractReminderInstruction(params.message),
      eventContext: `one_shot_reminder:${
        slugify(extractReminderInstruction(params.message)) || "generic"
      }`,
      parseSource: "strict_absolute",
      parseDetails: {
        algorithm: "strict_absolute_hard_path_pure_calendar_v2",
        timezone: normalizeTimezone(tctx.user_timezone),
        now_utc: new Date(tctx.now_utc).toISOString(),
        day_offset: strictParts.dayOffset,
        local_time_hhmm: strictParts.localTimeHHMM,
        scheduled_for_utc: strictScheduledFor ?? "",
      },
    }
    : null;
  const localParsed = hardParsed ?? parseStrictAbsoluteReminderRequest({
    message: params.message,
    timezone: tctx.user_timezone,
    nowIso: tctx.now_utc,
  }) ?? parseOneShotReminderRequest({
    message: params.message,
    timezone: tctx.user_timezone,
    nowIso: tctx.now_utc,
  });
  const parsed = localParsed ??
    (strictParts ? null : await inferOneShotReminderRequestWithAi({
      message: params.message,
      timezone: tctx.user_timezone,
      nowIso: tctx.now_utc,
      requestId: params.requestId,
    }));
  if (!parsed) {
    return {
      detected: true,
      status: "needs_clarify",
      reason: "missing_time",
      user_message: compactText(params.message, 500),
    };
  }

  const scheduledMs = new Date(parsed.scheduledFor).getTime();
  const nowMs = new Date(tctx.now_utc).getTime();
  if (!Number.isFinite(scheduledMs) || scheduledMs <= nowMs + 30_000) {
    return {
      detected: true,
      status: "needs_clarify",
      reason: "past_time",
      user_message: compactText(params.message, 500),
    };
  }

  try {
    const writeClient = await getReminderWriteClient(params.supabase);
    const { data, error } = await writeClient
      .from("scheduled_checkins")
      .upsert({
        user_id: params.userId,
        origin: "rendez_vous",
        event_context: parsed.eventContext,
        draft_message: null,
        message_mode: "dynamic",
        message_payload: {
          source: "companion_one_shot_reminder_tool",
          reminder_kind: "one_shot",
          reminder_instruction: parsed.reminderInstruction,
          instruction:
            `Rappel ponctuel demandé explicitement par l'utilisateur. Rappelle-lui de ${parsed.reminderInstruction}.`,
          event_grounding: compactText(
            `L'utilisateur a demandé explicitement un rappel ponctuel à propos de: ${parsed.reminderInstruction}.`,
            240,
          ),
          request_text: compactText(params.message, 500),
          user_timezone: tctx.user_timezone,
          parse_source: parsed.parseSource ?? "unknown",
          parse_details: parsed.parseDetails ?? null,
        },
        scheduled_for: parsed.scheduledFor,
        status: "pending",
      } as any, {
        onConflict: "user_id,event_context,scheduled_for",
      })
      .select("id,scheduled_for,event_context")
      .single();
    if (error) throw error;

    const actualScheduledFor = String(
      (data as any)?.scheduled_for ?? parsed.scheduledFor,
    );
    return {
      detected: true,
      status: "success",
      user_message: compactText(params.message, 500),
      scheduled_for: actualScheduledFor,
      scheduled_for_local_label: formatLocalReminderLabel({
        scheduledFor: actualScheduledFor,
        timezone: tctx.user_timezone,
        locale: tctx.user_locale,
      }),
      reminder_instruction: parsed.reminderInstruction,
      event_context: String(
        (data as any)?.event_context ?? parsed.eventContext,
      ),
      inserted_checkin_id: String((data as any)?.id ?? ""),
      parse_source: parsed.parseSource ?? "unknown",
    };
  } catch (error) {
    console.warn(JSON.stringify({
      tag: "one_shot_reminder_insert_failed",
      request_id: params.requestId ?? null,
      error: compactText(errorText(error), 300) || "insert_failed",
    }));
    return {
      detected: true,
      status: "failed",
      reason: "insert_failed",
      user_message: compactText(params.message, 500),
      error_message: compactText(
        errorText(error),
        180,
      ) || "insert_failed",
    };
  }
}

export async function runCreateOneShotReminderV2(params: {
  turn_frame: TurnFrame;
  message: string;
  timezone: string;
  locale?: string;
  nowIso: string;
  pending_tool_skill_confirmation?: unknown;
  recent_writes_idempotency?:
    DirectEffectGateInput["recent_writes_idempotency"];
  db_idempotency_check?: DirectEffectGateInput["db_idempotency_check"];
  write_reminder: CreateOneShotReminderV2Write;
}): Promise<CreateOneShotReminderV2Outcome> {
  if (isMemoryRecallReminderPhrase(params.message)) {
    return { detected: false };
  }
  const hasDispatcherSignal = params.turn_frame.direct_effects.some((effect) =>
    effect.effect_type === "create_one_shot_reminder"
  );
  if (!hasDispatcherSignal && !isLikelyOneShotReminderRequest(params.message)) {
    return { detected: false };
  }

  const gate = await runDirectEffectGate({
    effect_type: "create_one_shot_reminder",
    turn_frame: params.turn_frame,
    pending_tool_skill_confirmation: params.pending_tool_skill_confirmation,
    recent_writes_idempotency: params.recent_writes_idempotency ??
      { source_message_ids: [] },
    db_idempotency_check: params.db_idempotency_check ?? (async () => false),
  });
  if (gate.decision === "blocked") {
    return {
      detected: true,
      status: "blocked",
      reason: gate.reason_code,
      user_message: compactText(params.message, 500),
    };
  }
  if (gate.decision === "needs_clarify") {
    return {
      detected: true,
      status: "needs_clarify",
      reason: gate.reason_code === "past_time" ? "past_time" : "missing_time",
      user_message: compactText(params.message, 500),
    };
  }

  const payload = gate.effect_payload ?? {};
  const parsedFromPayload = typeof payload.scheduled_for === "string" &&
      typeof payload.reminder_instruction === "string"
    ? {
      scheduledFor: payload.scheduled_for,
      reminderInstruction: payload.reminder_instruction,
      eventContext: String(
        payload.event_context ??
          `one_shot_reminder:${slugify(payload.reminder_instruction)}`,
      ),
      parseSource: "payload" as const,
    }
    : null;
  const parsed = parsedFromPayload ?? parseOneShotReminderRequest({
    message: params.message,
    timezone: params.timezone,
    nowIso: params.nowIso,
  });
  if (!parsed) {
    return {
      detected: true,
      status: "needs_clarify",
      reason: "missing_time",
      user_message: compactText(params.message, 500),
    };
  }

  const scheduledMs = new Date(parsed.scheduledFor).getTime();
  const nowMs = new Date(params.nowIso).getTime();
  if (!Number.isFinite(scheduledMs) || scheduledMs <= nowMs + 30_000) {
    return {
      detected: true,
      status: "needs_clarify",
      reason: "past_time",
      user_message: compactText(params.message, 500),
    };
  }

  try {
    const written = await params.write_reminder({
      user_id: params.turn_frame.user_id,
      scheduled_for: parsed.scheduledFor,
      reminder_instruction: parsed.reminderInstruction,
      event_context: parsed.eventContext,
      request_text: compactText(params.message, 500),
      timezone: params.timezone,
      idempotency_key: gate.idempotency_key,
    });
    const scheduledFor = written.scheduled_for ?? parsed.scheduledFor;
    return {
      detected: true,
      status: "success",
      user_message: compactText(params.message, 500),
      scheduled_for: scheduledFor,
      scheduled_for_local_label: formatLocalReminderLabel({
        scheduledFor,
        timezone: params.timezone,
        locale: params.locale ?? "fr-FR",
      }),
      reminder_instruction: parsed.reminderInstruction,
      event_context: written.event_context ?? parsed.eventContext,
      inserted_checkin_id: written.inserted_checkin_id,
      parse_source: parsed.parseSource ?? "unknown",
    };
  } catch (error) {
    return {
      detected: true,
      status: "failed",
      reason: "insert_failed",
      user_message: compactText(params.message, 500),
      error_message: compactText(
        error instanceof Error ? error.message : String(error),
        180,
      ) || "insert_failed",
    };
  }
}

export function buildOneShotReminderAddon(
  outcome: OneShotReminderToolOutcome,
): string {
  if (!outcome.detected) return "";

  if (outcome.status === "success") {
    return [
      "",
      "=== ADDON ONE-SHOT REMINDER TOOL ===",
      "- Le reminder tool a deja reussi.",
      `- Confirmation DB: scheduled_checkin_id=${
        outcome.inserted_checkin_id || "ok"
      }.`,
      `- Heure locale programmee: ${outcome.scheduled_for_local_label}.`,
      `- Objet du rappel: ${outcome.reminder_instruction}.`,
      `- Parse source: ${outcome.parse_source ?? "unknown"}.`,
      "- Tu peux confirmer clairement que le rappel est programme.",
      "- IMPORTANT: confirme seulement la programmation en base / dans le systeme. Ne promets rien de plus que ce succes confirme.",
      "- Si le message user contenait un autre sujet, reponds aussi a ce sujet.",
      "",
    ].join("\n");
  }

  if (outcome.status === "needs_clarify") {
    return [
      "",
      "=== ADDON ONE-SHOT REMINDER TOOL ===",
      "- Le user demande bien un rappel ponctuel, mais l'horaire exact n'a pas pu etre resolu de facon fiable.",
      `- Raison: ${outcome.reason}.`,
      "- N'annonce PAS que le rappel est programme.",
      "- Demande une seule precision courte sur l'heure / le moment exact.",
      "",
    ].join("\n");
  }

  return [
    "",
    "=== ADDON ONE-SHOT REMINDER TOOL ===",
    "- Une tentative de programmation de rappel ponctuel a echoue.",
    `- Erreur technique: ${outcome.error_message}.`,
    "- N'annonce PAS que le rappel est programme.",
    "- Dis simplement qu'il y a eu un souci technique pour le programmer maintenant.",
    "",
  ].join("\n");
}

export function summarizeOneShotReminderOutcome(
  outcome: OneShotReminderToolOutcome,
): {
  executedTools: string[];
  toolExecution: "none" | "blocked" | "success" | "failed" | "uncertain";
} {
  if (!outcome.detected) {
    return { executedTools: [], toolExecution: "none" };
  }
  if (outcome.status === "success") {
    return {
      executedTools: ["create_one_shot_reminder"],
      toolExecution: "success",
    };
  }
  if (outcome.status === "needs_clarify") {
    return {
      executedTools: [],
      toolExecution: "blocked",
    };
  }
  return {
    executedTools: ["create_one_shot_reminder"],
    toolExecution: "failed",
  };
}
