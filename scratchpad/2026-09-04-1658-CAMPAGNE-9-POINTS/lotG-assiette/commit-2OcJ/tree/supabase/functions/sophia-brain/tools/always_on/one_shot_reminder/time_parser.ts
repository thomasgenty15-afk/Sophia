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

/**
 * P7-C (paul-p6reval R1-B01): FUSION du tour-réponse à un clarify de
 * méridiem — le clarify d'origine porte l'heure-base ambiguë et le jour
 * (« demain à 7 heures »), la réponse porte le créneau (« du soir », « 19h »,
 * « 19h le soir »). Sans fusion, le dispatcher ré-émettait le texte d'origine
 * (UTC_time vide) et le rappel n'était JAMAIS créable (cul-de-sac observé,
 * 2 tours de réponses explicites → re-clarify).
 * Résolution déterministe, fail-closed : toute réponse qui ne lève pas
 * l'ambiguïté (nouvelle heure basse sans méridiem, pas de créneau) → null,
 * le clarify existant re-pose la question.
 */
export function resolveMeridiemClarifyAnswer(args: {
  answerMessage: string;
  /** when_hint/raw_text du tour d'ORIGINE — porte l'heure-base et le jour. */
  baseWhenHint: string;
  timezone: string;
  nowIso: string;
}): { scheduledFor: string; localTimeHHMM: string } | null {
  const timezone = normalizeTimezone(args.timezone);
  const now = new Date(args.nowIso);
  if (!Number.isFinite(now.getTime())) return null;
  const answer = normalizeText(args.answerMessage);
  const base = normalizeText(args.baseWhenHint);
  const dayOffset = /apres[- ]?demain/.test(base)
    ? 2
    : /\bdemain\b/.test(base)
    ? 1
    : 0;
  const baseHourMatch = base.match(/\b(\d{1,2})\s*(?:h\b|h(\d{2})\b|heures?\b)/);
  const baseHour = baseHourMatch ? Number(baseHourMatch[1]) : null;
  const baseMinute = baseHourMatch?.[2] ? Number(baseHourMatch[2]) : 0;
  const saysEvening = /\b(soir|soiree|ce soir|apres[- ]?midi)\b/.test(answer);
  const saysMorning = /\b(matin|matinee)\b/.test(answer);
  const answerHourMatch = answer.match(
    /\b(\d{1,2})\s*h\s*(\d{2})?\b|\b(\d{1,2})\s+heures?\b/,
  );
  let hour: number | null = null;
  let minute = 0;
  if (answerHourMatch) {
    hour = Number(answerHourMatch[1] ?? answerHourMatch[3]);
    minute = answerHourMatch[2] ? Number(answerHourMatch[2]) : 0;
    if (!Number.isFinite(hour)) return null;
    if (hour >= 1 && hour <= 11) {
      if (saysEvening) hour += 12;
      else if (!saysMorning && hour !== baseHour) {
        // Nouvelle heure basse sans méridiem ≠ heure-base : toujours ambigu.
        return null;
      }
      // hour === baseHour sans méridiem : ambigu aussi (l'user répète l'heure).
      else if (!saysMorning && hour === baseHour) return null;
    }
  } else if (baseHour !== null && (saysEvening || saysMorning)) {
    hour = saysEvening && baseHour >= 1 && baseHour <= 11
      ? baseHour + 12
      : baseHour;
    minute = baseMinute;
  }
  if (hour == null || !Number.isFinite(hour) || hour < 0 || hour > 23) {
    return null;
  }
  const localTimeHHMM = `${String(hour).padStart(2, "0")}:${
    String(minute).padStart(2, "0")
  }`;
  const scheduledFor = computeScheduledForFromLocal({
    timezone,
    nowIso: args.nowIso,
    dayOffset,
    localTimeHHMM,
  });
  return scheduledFor ? { scheduledFor, localTimeHHMM } : null;
}

/**
 * P10-A (nina-hard24 R1-B01, T5): fusion du tour-réponse à un clarify
 * PAST_TIME — symétrie exacte de resolveMeridiemClarifyAnswer (P7-C). Le
 * clarify persiste l'heure d'origine (« cette nuit à 2h du matin ») ; la
 * réponse qui apporte l'INDICE DE JOUR forward (« la nuit qui vient »,
 * « demain », « dans 4h quoi ») doit se COMBINER avec cette heure — jamais
 * retomber sur missing_time (le cul-de-sac auto-contradictoire : « on est
 * après cette heure » + « il me manque le moment exact »). Fail-closed : ni
 * indice de jour dans la réponse ni heure résoluble ⇒ null (clarify
 * inchangé).
 */
export function resolvePastTimeClarifyAnswer(args: {
  answerMessage: string;
  /** when_hint/raw_text du tour d'ORIGINE — porte l'heure refusée. */
  baseWhenHint: string;
  timezone: string;
  nowIso: string;
}): { scheduledFor: string; localTimeHHMM: string } | null {
  const timezone = normalizeTimezone(args.timezone);
  const now = new Date(args.nowIso);
  if (!Number.isFinite(now.getTime())) return null;
  const answer = normalizeText(args.answerMessage);
  const base = normalizeText(args.baseWhenHint);
  // Indice de jour forward de la RÉPONSE. Le marqueur nocturne (« la nuit
  // qui vient/arrive », « cette nuit ») vaut confirmation forward: le
  // glissement au lendemain d'une heure passée devient légitime.
  const answerDayOffset = /apres[- ]?demain/.test(answer)
    ? 2
    : /\bdemain\b/.test(answer)
    ? 1
    : /\b(cette nuit|la nuit (qui (vient|arrive)|prochaine)|dans \d+\s?h(eures?)?\b)/
        .test(answer)
    ? "forward" as const
    : null;
  if (answerDayOffset === null) return null;
  // Heure: la réponse d'abord, l'heure-base stockée sinon. Le méridiem se
  // lit dans la MÊME source que l'heure retenue.
  const hourFrom = (text: string): { hour: number; minute: number } | null => {
    const match = text.match(
      /\b(\d{1,2})\s*h\s*(\d{2})?\b|\b(\d{1,2})\s+heures?\b/,
    );
    if (!match) return null;
    let hour = Number(match[1] ?? match[3]);
    const minute = match[2] ? Number(match[2]) : 0;
    if (!Number.isFinite(hour) || hour < 0 || hour > 23) return null;
    const saysEvening = /\b(soir|soiree|apres[- ]?midi)\b/.test(text);
    const saysMorningOrNight = /\b(matin|matinee|mat|nuit)\b/.test(text);
    if (hour >= 1 && hour <= 11) {
      if (saysEvening) hour += 12;
      // Heure basse sans AUCUN méridiem/contexte nocturne: ambigu —
      // fail-closed (la ceinture méridiem reste le filet).
      else if (!saysMorningOrNight) return null;
    }
    return { hour, minute };
  };
  const resolved = hourFrom(answer) ?? hourFrom(base);
  if (!resolved) return null;
  const localTimeHHMM = `${String(resolved.hour).padStart(2, "0")}:${
    String(resolved.minute).padStart(2, "0")
  }`;
  // « forward » sans jour nommé: aujourd'hui si l'heure est encore à venir,
  // sinon demain (le sens de « la nuit qui vient » à 22h pour 02:00).
  let dayOffset: number;
  if (answerDayOffset === "forward") {
    const todayIso = computeScheduledForFromLocal({
      timezone,
      nowIso: args.nowIso,
      dayOffset: 0,
      localTimeHHMM,
    });
    dayOffset = todayIso && new Date(todayIso).getTime() > now.getTime() + 30_000
      ? 0
      : 1;
  } else {
    dayOffset = answerDayOffset;
  }
  const scheduledFor = computeScheduledForFromLocal({
    timezone,
    nowIso: args.nowIso,
    dayOffset,
    localTimeHHMM,
  });
  if (!scheduledFor) return null;
  // Filet: jamais un résultat encore passé (réponse « aujourd'hui » à une
  // heure déjà écoulée reste un clarify).
  if (new Date(scheduledFor).getTime() <= now.getTime() + 30_000) return null;
  return { scheduledFor, localTimeHHMM };
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

/**
 * Vrai si le texte porte un JOUR FUTUR EXPLICITE (demain / après-demain) —
 * par opposition au bump automatique d'un horaire nu déjà passé. Sert à la
 * réparation déterministe d'un UTC_time dispatcher résolu au passé
 * (rose-multiflow RMR-B01): on ne répare que sur futur explicite.
 */
export function hasExplicitFutureDayHint(message: string): boolean {
  const text = normalizeText(message);
  if (/\bapres demain|apres-demain|après demain|après-demain\b/.test(text)) {
    return true;
  }
  return /\bdemain\b/.test(text);
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

/**
 * P4-B: le texte porte-t-il un marqueur de JOUR explicite (demain, ce soir,
 * un jour de semaine, une date) ? Sert à décider si une heure nue doit
 * hériter du jour du rappel remplacé (aucun marqueur = héritage).
 */
export function hasAnyExplicitDayToken(text: string): boolean {
  const normalized = String(text ?? "")
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  return /\b(demain|apres[- ]demain|aujourd|ce soir|ce matin|cet apres[- ]midi|cette nuit|ce midi|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/
    .test(normalized) ||
    /\ble \d{1,2}\b/.test(normalized) ||
    /\b(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\b/
      .test(normalized);
}

/**
 * P4-B (eva-global19 R1-B02): le label d'INTENTION (« ce soir a 20h ») ne
 * peut confirmer un commit que si son jour implicite correspond au
 * scheduled_for EFFECTIF — apres un glissement au lendemain, le label
 * pre-glissement mentait (« ce soir » pour un rappel place demain).
 */
export function localLabelDayConsistent(args: {
  label: string | null | undefined;
  scheduledFor: string;
  timezone?: string | null;
  nowIso: string;
}): boolean {
  const label = String(args.label ?? "")
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  if (!label.trim()) return false;
  const timezone = normalizeTimezone(args.timezone);
  const localDay = (iso: string): string => {
    const date = new Date(iso);
    if (!Number.isFinite(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  };
  const dayOffset = (day: string, offset: number): string => {
    const parsed = Date.parse(`${day}T12:00:00Z`);
    if (!Number.isFinite(parsed)) return "";
    return new Date(parsed + offset * 86_400_000).toISOString().slice(0, 10);
  };
  const today = localDay(args.nowIso);
  const scheduledDay = localDay(args.scheduledFor);
  if (!today || !scheduledDay) return true;
  const saysToday =
    /\b(ce soir|ce matin|cet apres[- ]midi|cette nuit|ce midi|aujourd)\b/.test(
      label,
    );
  const saysAfterTomorrow = /apres[- ]demain/.test(label);
  const saysTomorrow = !saysAfterTomorrow && /\bdemain\b/.test(label);
  if (saysToday && scheduledDay !== today) return false;
  if (saysTomorrow && scheduledDay !== dayOffset(today, 1)) return false;
  if (saysAfterTomorrow && scheduledDay !== dayOffset(today, 2)) return false;
  // Date absolue dans le label (« lundi 13 juillet à 21:00 ») : le numéro de
  // jour doit correspondre au jour local effectif.
  const absoluteDay = label.match(
    /\b(\d{1,2})\s+(janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre)\b/,
  );
  if (absoluteDay) {
    const scheduledDayOfMonth = Number(scheduledDay.slice(8, 10));
    if (Number(absoluteDay[1]) !== scheduledDayOfMonth) return false;
  }
  return true;
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

/**
 * P12-A: index getUTCDay (dimanche=0) de l'UNIQUE jour de semaine nommé du
 * texte — null si zéro ou plusieurs jours (le fan-out multi-jours se résout
 * PAR ITEM, jamais sur le texte combiné), ou si un marqueur d'habitude
 * l'accompagne (« tous les vendredis » = récurrent, hors-scope).
 */
function singleNamedWeekday(normalizedText: string): number | null {
  if (/\b(tous?|toutes?|chaque)\b/.test(normalizedText)) return null;
  const indexByName: Record<string, number> = {
    dimanche: 0,
    lundi: 1,
    mardi: 2,
    mercredi: 3,
    jeudi: 4,
    vendredi: 5,
    samedi: 6,
  };
  const matches = [
    ...normalizedText.matchAll(
      /\b(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\b/g,
    ),
  ];
  const distinct = [...new Set(matches.map((match) => match[1]))];
  return distinct.length === 1 ? indexByName[distinct[0]] ?? null : null;
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
    } else if (singleNamedWeekday(text)) {
      // P12-A (nina-p10reval R1-B02): un jour de semaine NOMMÉ nu
      // (« vendredi à 18h ») se résout nativement à sa PROCHAINE occurrence
      // civile — avant ce trou, le parseur ancrait aujourd'hui et restait
      // muet sur les when_hint isolés du fan-out (l'UTC LLM faux d'un item
      // survivait → phantom). Deux jours nommés ou un marqueur d'habitude
      // restent hors-scope (hasRecurringCadenceHint filtre en amont).
      const targetWeekday = singleNamedWeekday(text)!;
      const currentWeekday =
        new Date(Date.UTC(year, month - 1, day)).getUTCDay();
      let daysAhead = (targetWeekday - currentWeekday + 7) % 7;
      if (daysAhead === 0) {
        const [hhRaw, mmRaw] = hhmm.split(":").map(Number);
        const sameDayIso = localCivilToUtcIso({
          timezone: args.timezone,
          year,
          month,
          day,
          hour: hhRaw,
          minute: mmRaw,
        });
        if (
          !sameDayIso ||
          new Date(sameDayIso).getTime() <= now.getTime() + 30_000
        ) {
          daysAhead = 7;
        }
      }
      dayOffset = daysAhead;
      ({ year, month, day } = civilDateAddDays(year, month, day, daysAhead));
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
