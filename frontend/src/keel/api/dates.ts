// KEEL — local-date arithmetic for the student app. PURE (the only impurity is
// the `Date` a caller passes in; nothing here reads the clock by itself).
//
// Every date this app handles is a LOCAL date in the plan's timezone, as a
// `yyyy-mm-dd` string — the same shape stored in `local_date`. UTC instants are
// converted once, at the edge, by `localDateIn`. This repo has already paid for
// "demain" resolved in the wrong timezone at night; the fix is to never let a
// `Date` object travel past this module.

import type { DayToken } from "./types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * LA MÊME QUESTION, SANS LA SANCTION — et pourquoi les deux existent.
 *
 * `assertIsoDate` jette, et c'est ce qu'on veut d'une date qui ARRIVE dans le
 * calcul. Mais un écran a besoin de demander « est-ce déjà une date ? » AVANT
 * de la faire entrer, parce qu'un `<input type="date">` passe par des valeurs
 * vides et incomplètes pendant qu'on l'édite au clavier.
 *
 * Sans cette porte, la seule façon de poser la question était d'appeler la
 * garde et de rattraper son erreur — ou de ne pas la poser. Mesuré le
 * 2026-08-18 dans `MealBuilder`: la valeur brute du champ partait dans l'état
 * qui nourrit `addDays`, la garde jetait PENDANT LE RENDU, et l'ErrorBoundary
 * emportait la page entière dès qu'on vidait le champ une fraction de seconde.
 * La fenêtre du plan était inéditable au clavier.
 *
 * La garde n'est pas assouplie: elle jette toujours. C'est l'appelant qui
 * cesse de lui donner des demi-dates.
 */
export function isIsoDate(date: string): boolean {
  return ISO_DATE.test(date);
}

/** R7: a malformed date is a throw, never a silently shifted day. */
export function assertIsoDate(date: string): string {
  if (!ISO_DATE.test(date)) {
    throw new Error(`[keel/dates] expected a yyyy-mm-dd local date, got "${date}"`);
  }
  return date;
}

/**
 * The local date in `timeZone` for an instant. `en-CA` is the ISO-shaped
 * formatter locale (yyyy-mm-dd); it is a formatting choice, not a UI locale
 * (R3: these three axes never collapse).
 */
export function localDateIn(timeZone: string, at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
  return assertIsoDate(parts);
}

const DAY_TOKENS: readonly DayToken[] = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
];

/**
 * The `mon..sun` token of a local date. Parsed at UTC noon so no host timezone
 * can shift the weekday by one — the exact class of bug that made
 * `planSchedule.ts` return `[]` for valid day tokens.
 */
export function dayTokenOf(date: string): DayToken {
  assertIsoDate(date);
  const d = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`[keel/dates] "${date}" is not a real calendar date`);
  }
  return DAY_TOKENS[d.getUTCDay()];
}

/** `date` shifted by `days` (negative shifts back), still a local-date string. */
export function addDays(date: string, days: number): string {
  assertIsoDate(date);
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Whole days from `from` to `to` — negative when `to` is earlier.
 *
 * Parsed at UTC noon like the rest of this module, so a DST boundary between
 * the two dates cannot turn 7 days into 6.98 and round down.
 */
export function daysBetween(from: string, to: string): number {
  assertIsoDate(from);
  assertIsoDate(to);
  const a = new Date(`${from}T12:00:00Z`).getTime();
  const b = new Date(`${to}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/**
 * The `n` local dates ending at `endDate`, oldest first. Used for the coverage
 * denominator, which is always the calendar window — never "the days we happen
 * to have rows for".
 */
export function windowEndingAt(endDate: string, days: number): string[] {
  if (days < 1) throw new Error(`[keel/dates] window of ${days} days is empty`);
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) out.push(addDays(endDate, -i));
  return out;
}

/** The start of the calendar week containing `date`, per `week_starts_on`. */
export function weekStartFor(date: string, weekStartsOn: DayToken): string {
  const index = DAY_TOKENS.indexOf(weekStartsOn);
  if (index < 0) {
    throw new Error(`[keel/dates] unknown week_starts_on token "${weekStartsOn}"`);
  }
  assertIsoDate(date);
  const d = new Date(`${date}T12:00:00Z`);
  const delta = (d.getUTCDay() - index + 7) % 7;
  return addDays(date, -delta);
}

export function weekDatesFrom(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}
