import type { SupabaseClient } from "jsr:@supabase/supabase-js@2"

export type UserTimeContext = {
  now_utc: string
  user_timezone: string
  user_locale: string
  user_local_datetime: string // ISO-like: YYYY-MM-DDTHH:mm:ss
  user_local_human: string
  user_local_date: string // YYYY-MM-DD
  user_local_time: string // HH:mm:ss
  user_local_hour: number // 0..23
  day_part: "night" | "morning" | "afternoon" | "evening"
  prompt_block: string
}

function safeTz(raw: unknown): string {
  const tz = String(raw ?? "").trim()
  return tz || "Europe/Paris"
}

function safeLocale(raw: unknown): string {
  const loc = String(raw ?? "").trim()
  return loc || "fr-FR"
}

function clampHour(h: number): number {
  if (!Number.isFinite(h)) return 12
  return Math.max(0, Math.min(23, Math.floor(h)))
}

function partsToMap(parts: Intl.DateTimeFormatPart[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const p of parts) {
    if (p.type === "literal") continue
    out[p.type] = p.value
  }
  return out
}

export function buildUserTimeContextFromValues(args: {
  now?: Date
  timezone?: string | null
  locale?: string | null
}): UserTimeContext {
  const now = args.now ?? new Date()
  const tz = safeTz(args.timezone)
  const locale = safeLocale(args.locale)

  const nowUtcIso = now.toISOString()

  // Stable ISO-like local datetime (not localized): use en-CA parts (YYYY-MM-DD)
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
  const m = partsToMap(dtf.formatToParts(now))
  const y = m.year || "1970"
  const mo = m.month || "01"
  const d = m.day || "01"
  const hh = m.hour || "00"
  const mm = m.minute || "00"
  const ss = m.second || "00"
  const localIso = `${y}-${mo}-${d}T${hh}:${mm}:${ss}`

  const human = (() => {
    try {
      return new Intl.DateTimeFormat(locale, { timeZone: tz, dateStyle: "full", timeStyle: "short" }).format(now)
    } catch {
      return new Intl.DateTimeFormat("fr-FR", { timeZone: tz, dateStyle: "full", timeStyle: "short" }).format(now)
    }
  })()

  const hour = clampHour(Number(hh))
  const dayPart: UserTimeContext["day_part"] =
    hour < 6 ? "night" : hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"

  const promptBlock =
    [
      `now_utc=${nowUtcIso}`,
      `user_timezone=${tz}`,
      `user_locale=${locale}`,
      `user_local_datetime=${localIso}`,
      `user_local_human=${human}`,
      `day_part=${dayPart}`,
    ].join("\n")

  return {
    now_utc: nowUtcIso,
    user_timezone: tz,
    user_locale: locale,
    user_local_datetime: localIso,
    user_local_human: human,
    user_local_date: `${y}-${mo}-${d}`,
    user_local_time: `${hh}:${mm}:${ss}`,
    user_local_hour: hour,
    day_part: dayPart,
    prompt_block: promptBlock,
  }
}

export async function getUserTimeContext(args: {
  supabase: SupabaseClient
  userId: string
  now?: Date
}): Promise<UserTimeContext> {
  const { supabase, userId } = args
  const { data } = await supabase
    .from("profiles")
    .select("timezone, locale")
    .eq("id", userId)
    .maybeSingle()

  const tz = safeTz((data as any)?.timezone)
  const locale = safeLocale((data as any)?.locale)

  return buildUserTimeContextFromValues({ now: args.now, timezone: tz, locale })
}



