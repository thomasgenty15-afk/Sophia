export type TemporalPrecision = "part_of_day" | "day" | "week";

export interface TemporalResolution {
  raw: string;
  resolved_start_at: string;
  resolved_end_at: string;
  precision: TemporalPrecision;
  confidence: number;
  timezone: string;
  /** Present pour une date ABSOLUE (« le 18 juillet », « 18/07/2026 ») — jamais pour un relatif. */
  kind?: "absolute_date";
}

export interface TemporalResolutionOptions {
  now?: Date | string;
  timezone?: string | null;
}

const MONTHS: Record<string, number> = {
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

const WEEKDAYS: Record<string, number> = {
  dimanche: 0,
  lundi: 1,
  mardi: 2,
  mercredi: 3,
  jeudi: 4,
  vendredi: 5,
  samedi: 6,
};

function normalize(input: string): string {
  return input
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function partsInZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    second: Number(get("second")),
    weekday: dateInZoneWeekday(date, timeZone),
  };
}

function dateInZoneWeekday(date: Date, timeZone: string): number {
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(date).slice(0, 3);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(label);
}

function offsetMs(timeZone: string, instant: Date): number {
  const p = partsInZone(instant, timeZone);
  const asUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second,
  );
  return asUtc - instant.getTime();
}

function zonedIso(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute = 0,
  second = 0,
  ms = 0,
): string {
  const guess = new Date(
    Date.UTC(year, month - 1, day, hour, minute, second, ms),
  );
  const first = new Date(guess.getTime() - offsetMs(timeZone, guess));
  const secondOffset = offsetMs(timeZone, first);
  return new Date(guess.getTime() - secondOffset).toISOString();
}

function addDaysLocal(
  local: { year: number; month: number; day: number },
  days: number,
) {
  const d = new Date(Date.UTC(local.year, local.month - 1, local.day + days));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

function localRange(
  timeZone: string,
  local: { year: number; month: number; day: number },
  startHour: number,
  endHour: number,
  precision: TemporalPrecision,
  raw: string,
  confidence = 0.9,
): TemporalResolution {
  const endDay = endHour >= 24 ? addDaysLocal(local, 1) : local;
  const normalizedEndHour = endHour >= 24 ? endHour - 24 : endHour;
  return {
    raw,
    resolved_start_at: zonedIso(
      timeZone,
      local.year,
      local.month,
      local.day,
      startHour,
    ),
    resolved_end_at: zonedIso(
      timeZone,
      endDay.year,
      endDay.month,
      endDay.day,
      normalizedEndHour,
    ),
    precision,
    confidence,
    timezone: timeZone,
  };
}

function previousWeekday(localWeekday: number, targetWeekday: number): number {
  const delta = (localWeekday - targetWeekday + 7) % 7;
  return delta === 0 ? 7 : delta;
}

export function resolveTemporalReferences(
  input: string,
  opts: TemporalResolutionOptions = {},
): TemporalResolution[] {
  const timeZone = String(opts.timezone || "Europe/Paris").trim() ||
    "Europe/Paris";
  const now = opts.now instanceof Date
    ? opts.now
    : new Date(opts.now ?? Date.now());
  const localNow = partsInZone(now, timeZone);
  const today = {
    year: localNow.year,
    month: localNow.month,
    day: localNow.day,
  };
  const text = normalize(input);
  const out: TemporalResolution[] = [];
  const push = (res: TemporalResolution) => {
    if (!out.some((r) => r.raw === res.raw)) out.push(res);
  };

  if (/\bavant hier matin\b/.test(text)) {
    push(
      localRange(
        timeZone,
        addDaysLocal(today, -2),
        5,
        12,
        "part_of_day",
        "avant hier matin",
        0.9,
      ),
    );
  } else if (/\bavant hier\b/.test(text)) {
    push(
      localRange(
        timeZone,
        addDaysLocal(today, -2),
        0,
        24,
        "day",
        "avant hier",
        0.88,
      ),
    );
  } else if (/\bhier soir\b/.test(text)) {
    push(
      localRange(
        timeZone,
        addDaysLocal(today, -1),
        18,
        24,
        "part_of_day",
        "hier soir",
        0.92,
      ),
    );
  } else if (/\bhier\b/.test(text)) {
    push(
      localRange(timeZone, addDaysLocal(today, -1), 0, 24, "day", "hier", 0.9),
    );
  }
  if (/\bce matin\b/.test(text)) {
    push(localRange(timeZone, today, 5, 12, "part_of_day", "ce matin", 0.9));
  }
  if (/\baujourd'hui\b/.test(text)) {
    push(
      localRange(timeZone, today, 0, 24, "day", "aujourd'hui", 0.9),
    );
  }
  if (/\bdans deux jours\b/.test(text)) {
    push(
      localRange(
        timeZone,
        addDaysLocal(today, 2),
        0,
        24,
        "day",
        "dans deux jours",
        0.88,
      ),
    );
  }
  if (/\ble lendemain\b/.test(text)) {
    push(
      localRange(
        timeZone,
        addDaysLocal(today, 1),
        0,
        24,
        "day",
        "le lendemain",
        0.72,
      ),
    );
  }
  if (/\bla semaine derniere\b/.test(text)) {
    const daysSinceMonday = (localNow.weekday + 6) % 7;
    const start = addDaysLocal(today, -(daysSinceMonday + 7));
    const end = addDaysLocal(start, 7);
    push({
      raw: "la semaine derniere",
      resolved_start_at: zonedIso(
        timeZone,
        start.year,
        start.month,
        start.day,
        0,
      ),
      resolved_end_at: zonedIso(timeZone, end.year, end.month, end.day, 0),
      precision: "week",
      confidence: 0.86,
      timezone: timeZone,
    });
  }
  if (/\bil y a deux semaines\b/.test(text)) {
    const daysSinceMonday = (localNow.weekday + 6) % 7;
    const start = addDaysLocal(today, -(daysSinceMonday + 14));
    const end = addDaysLocal(start, 7);
    push({
      raw: "il y a deux semaines",
      resolved_start_at: zonedIso(
        timeZone,
        start.year,
        start.month,
        start.day,
        0,
      ),
      resolved_end_at: zonedIso(timeZone, end.year, end.month, end.day, 0),
      precision: "week",
      confidence: 0.82,
      timezone: timeZone,
    });
  }

  // Dates ABSOLUES francaises (alex-r1 B01): « le 18 juillet », « 18 juillet
  // 2026 », « 18/07 », « a partir du 18/07/2026 ». Sans annee explicite, on
  // choisit l'occurrence la plus PROCHE de maintenant (les events confies
  // peuvent etre passes comme futurs).
  const closestYear = (month: number, day: number): number => {
    let best = today.year;
    let bestDist = Infinity;
    for (const year of [today.year - 1, today.year, today.year + 1]) {
      const candidate = Date.UTC(year, month - 1, day);
      const ref = Date.UTC(today.year, today.month - 1, today.day);
      const dist = Math.abs(candidate - ref);
      if (dist < bestDist) {
        bestDist = dist;
        best = year;
      }
    }
    return best;
  };
  const pushAbsolute = (
    raw: string,
    day: number,
    month: number,
    year: number | null,
    confidence: number,
  ) => {
    if (month < 1 || month > 12 || day < 1 || day > 31) return;
    const resolvedYear = year ?? closestYear(month, day);
    push({
      ...localRange(
        timeZone,
        { year: resolvedYear, month, day },
        0,
        24,
        "day",
        raw,
        confidence,
      ),
      kind: "absolute_date",
    });
  };
  const monthNames = Object.keys(MONTHS).join("|");
  const namedDateRe = new RegExp(
    `\\b(?:le |du |au |a partir du )?([1-9]|[12][0-9]|3[01]|1er)(?:er)? (${monthNames})(?: (20[0-9]{2}))?\\b`,
    "g",
  );
  for (const match of text.matchAll(namedDateRe)) {
    const day = Number(String(match[1]).replace("er", "")) || 1;
    const month = MONTHS[match[2]];
    const year = match[3] ? Number(match[3]) : null;
    pushAbsolute(match[0].trim(), day, month, year, year ? 0.95 : 0.9);
  }
  const numericDateRe =
    /\b(?:le |du |au |a partir du )?(0?[1-9]|[12][0-9]|3[01])\/(0?[1-9]|1[0-2])(?:\/(20[0-9]{2}))?\b/g;
  for (const match of text.matchAll(numericDateRe)) {
    pushAbsolute(
      match[0].trim(),
      Number(match[1]),
      Number(match[2]),
      match[3] ? Number(match[3]) : null,
      match[3] ? 0.95 : 0.88,
    );
  }

  for (const [rawDay, weekday] of Object.entries(WEEKDAYS)) {
    const day = normalize(rawDay);
    const lastRe = new RegExp(`\\b${day} dernier\\b`);
    const morningRe = new RegExp(`\\b${day} matin\\b`);
    const afternoonRe = new RegExp(`\\b${day} apres[- ]midi\\b`);
    const eveningRe = new RegExp(`\\b${day} soir\\b`);
    if (lastRe.test(text)) {
      const local = addDaysLocal(
        today,
        -previousWeekday(localNow.weekday, weekday),
      );
      push(localRange(timeZone, local, 0, 24, "day", `${day} dernier`, 0.88));
    } else if (morningRe.test(text)) {
      const local = addDaysLocal(
        today,
        -previousWeekday(localNow.weekday, weekday),
      );
      push(
        localRange(timeZone, local, 5, 12, "part_of_day", `${day} matin`, 0.84),
      );
    } else if (afternoonRe.test(text)) {
      const local = addDaysLocal(
        today,
        -previousWeekday(localNow.weekday, weekday),
      );
      push(
        localRange(
          timeZone,
          local,
          12,
          18,
          "part_of_day",
          `${day} apres-midi`,
          0.84,
        ),
      );
    } else if (eveningRe.test(text)) {
      const local = addDaysLocal(
        today,
        -previousWeekday(localNow.weekday, weekday),
      );
      push(
        localRange(timeZone, local, 18, 24, "part_of_day", `${day} soir`, 0.84),
      );
    }
  }

  return out;
}
