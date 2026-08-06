import type { SupabaseClient } from "jsr:@supabase/supabase-js@2"

import { DEFAULT_TIMEZONE } from "./v2-constants.ts"

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
  /**
   * Les 7 prochains jours nommés, résolus en dates ISO. Voir
   * `buildNamedDayCalendar` pour la raison d'être.
   */
  named_day_calendar: Array<
    { iso: string; offset: number; names: string[] }
  >
  prompt_block: string
}

/**
 * LE CALENDRIER DES JOURS NOMMÉS — pour que « jeudi » soit une LECTURE et non
 * un calcul.
 *
 * ── LE DÉFAUT QUE CE BLOC FERME ──────────────────────────────────────────────
 * Le modèle recevait le jour courant uniquement dans `user_local_human`, une
 * phrase en prose (« jeudi 6 août 2026 à 18:07 »). Pour écrire le `local_date`
 * d'une déviation il devait donc faire de l'arithmétique calendaire.
 *
 * MESURÉ, run réel du 2026-08-06 (un JEUDI), 3 passes de « Jeudi soir je mange
 * au restaurant avec des amis. » :
 *
 *     passe 1 → local_date = 2026-08-07  (VENDREDI)   ✘
 *     passe 2 → local_date = 2026-08-06  (jeudi)      ✔
 *
 * L'écart n'est même pas « jeudi prochain » : c'est +1 jour. Une déviation
 * écrite sur le mauvais jour sort le mauvais jour du dénominateur d'adhérence
 * ET y laisse le vrai — deux erreurs pour une, et aucune n'est visible.
 *
 * ── POURQUOI ICI ET PAS DANS UNE LANE ────────────────────────────────────────
 * C'est la doctrine que `declare_deviation/intake.ts` énonce déjà en tête de
 * fichier : « Date resolution belongs to the runtime, which knows the timezone.
 * Every night-time date bug in this repo came from resolving "tomorrow" inside
 * a tool. » Le contrat laissait pourtant passer une date ISO calculée par le
 * modèle, donc la résolution se faisait bel et bien dans le modèle. Ce bloc
 * rend la doctrine exécutable au lieu de la laisser écrite.
 *
 * ── LES DEUX LANGUES, ET POURQUOI LES DEUX ───────────────────────────────────
 * Les noms sortent dans la locale de l'élève ET en anglais. Un élève `fr-FR`
 * peut écrire « Thursday », et un élève `en-GB` « jeudi » — c'est exactement le
 * défaut de [[guard-tested-in-one-language-only]], mais sur la donnée plutôt
 * que sur la garde. Le coût est d'environ 120 tokens, une fois par tour, sur un
 * préfixe stable donc mis en cache.
 */
export function buildNamedDayCalendar(
  now: Date,
  timezone: string,
  locale: string,
): Array<{ iso: string; offset: number; names: string[] }> {
  // Le jour CIVIL de l'élève, une seule fois — c'est le seul moment où la
  // timezone intervient.
  //
  // La fonction est EXPORTÉE, donc un appelant peut lui passer une timezone que
  // `safeTz` n'a pas filtrée. `Intl` lève dans ce cas, et un throw ici ferait
  // tomber le tour entier pour une donnée de confort. On rend un calendrier
  // vide: aucune ligne n'est poussée au prompt et le modèle retombe sur
  // `user_local_human`, exactement comme avant ce bloc.
  let todayParts: Record<string, string>
  try {
    todayParts = partsToMap(
      new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(now),
    )
  } catch {
    return []
  }
  const y = Number(todayParts.year)
  const mo = Number(todayParts.month)
  const d0 = Number(todayParts.day)
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d0)) {
    return []
  }

  // ARITHMÉTIQUE DE CALENDRIER PURE, en UTC, à partir de ce jour civil.
  //
  // Et surtout PAS `now.getTime() + offset * 86_400_000`: ajouter 24 h autour
  // d'un changement d'heure retombe sur le même jour civil ou en saute un, ce
  // qui est très exactement le décalage de ±1 jour que ce bloc existe pour
  // supprimer. `Date.UTC` avec un quantième qui déborde (32 janvier) normalise
  // tout seul, changements d'heure compris — il n'y en a pas en UTC.
  //
  // Le nom du jour se lit alors en UTC: le jour de la semaine est une propriété
  // de la DATE, pas du fuseau où on la regarde.
  const weekdayOf = (utc: Date, loc: string): string => {
    try {
      return new Intl.DateTimeFormat(loc, { timeZone: "UTC", weekday: "long" })
        .format(utc).toLowerCase()
    } catch {
      return ""
    }
  }

  const out: Array<{ iso: string; offset: number; names: string[] }> = []
  for (let offset = 0; offset <= 7; offset++) {
    const utc = new Date(Date.UTC(y, mo - 1, d0 + offset))
    const iso = utc.toISOString().slice(0, 10)
    const names = new Set<string>()
    for (const loc of [locale, "en-GB"]) {
      const name = weekdayOf(utc, loc)
      if (name) names.add(name)
    }
    out.push({ iso, offset, names: [...names] })
  }
  return out
}

function validTzOrNull(raw: unknown): string | null {
  const tz = String(raw ?? "").trim()
  if (!tz) return null
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(new Date())
    return tz
  } catch {
    return null
  }
}

function safeTz(raw: unknown): string {
  return validTzOrNull(raw) ?? DEFAULT_TIMEZONE
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

  const namedDayCalendar = buildNamedDayCalendar(now, tz, locale)

  // Le calendrier sort en TABLEAU, pas en prose: « jeudi » doit se lire dans
  // une colonne, pas se déduire d'une phrase. `aujourd'hui` et `demain` sont
  // marqués parce que ce sont les deux ancres que l'élève emploie le plus, et
  // les deux que le modèle confondait.
  const calendarLines = namedDayCalendar.map((day) => {
    const anchor = day.offset === 0
      ? " (aujourd'hui / today)"
      : day.offset === 1
      ? " (demain / tomorrow)"
      : ""
    return `  ${day.iso} = ${day.names.join(" / ")}${anchor}`
  })

  const promptBlock =
    [
      `now_utc=${nowUtcIso}`,
      `user_timezone=${tz}`,
      `user_locale=${locale}`,
      `user_local_datetime=${localIso}`,
      `user_local_human=${human}`,
      `day_part=${dayPart}`,
      // Un jour nommé se LIT dans cette table. Ne le calcule jamais.
      `named_day_calendar=`,
      ...calendarLines,
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
    named_day_calendar: namedDayCalendar,
    prompt_block: promptBlock,
  }
}

export async function getUserTimeContext(args: {
  supabase: SupabaseClient
  userId: string
  now?: Date
  timezoneOverride?: string | null
  localeOverride?: string | null
}): Promise<UserTimeContext> {
  const { supabase, userId } = args
  const { data } = await supabase
    .from("profiles")
    .select("timezone, locale, tz_follow_device")
    .eq("id", userId)
    .maybeSingle()

  const followsDevice = Boolean((data as any)?.tz_follow_device)
  const profileTz = safeTz((data as any)?.timezone)
  const deviceTz = validTzOrNull(args.timezoneOverride)
  const tz = followsDevice && deviceTz ? deviceTz : profileTz
  const locale = safeLocale(args.localeOverride ?? (data as any)?.locale)

  return buildUserTimeContextFromValues({ now: args.now, timezone: tz, locale })
}

