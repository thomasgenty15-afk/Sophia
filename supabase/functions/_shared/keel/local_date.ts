/**
 * LA JOURNÉE LOCALE DE L'ÉLÈVE — une seule implémentation.
 *
 * Cette fonction existait DEUX fois, à l'identique, dans
 * `meal-photo-upload-v1/index.ts` et dans le webhook WhatsApp (aujourd'hui
 * supprimé). La troisième copie était sur le point d'être écrite pour la
 * génération de repas; c'est le signal habituel qu'elle appartient à `_shared`.
 *
 * POURQUOI ELLE JETTE PLUTÔT QUE DE REPLIER SUR UTC (R7). Un fuseau inconnu qui
 * se résout silencieusement en UTC classe un fait au mauvais jour — et ce dépôt
 * a déjà payé toute une famille de bugs nocturnes qui commencent exactement là.
 * Mieux vaut un tour qui échoue bruyamment qu'un dîner rangé la veille.
 *
 * PURE MODULE: pas d'I/O, pas d'horloge propre (l'appelant passe `now`).
 */

import { type DayToken, parseDayToken } from "./tokens.ts";

/** `YYYY-MM-DD` dans le fuseau donné. Jette sur un fuseau vide ou inconnu. */
export function localDateInZone(timezone: string, now: Date): string {
  const zone = String(timezone ?? "").trim();
  if (!zone) throw new Error("[keel/local_date] empty timezone (R7)");
  let formatted: string;
  try {
    formatted = new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch (error) {
    throw new Error(
      `[keel/local_date] unknown timezone ${JSON.stringify(zone)}`,
      { cause: error },
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(formatted)) {
    throw new Error(
      `[keel/local_date] unresolvable local date for ${JSON.stringify(zone)}`,
    );
  }
  return formatted;
}

/**
 * Le jeton de jour (`mon`..`sun`) d'une date locale.
 *
 * Passe par `parseDayToken`, donc un jour hors vocabulaire jette au lieu de
 * devenir `mon` par défaut — le défaut qui ferait commencer une semaine au
 * mauvais endroit sans que personne ne le voie.
 */
export function dayTokenInZone(timezone: string, now: Date): DayToken {
  const localDate = localDateInZone(timezone, now);
  // `T12:00:00Z` et pas minuit: à minuit, un décalage de fuseau d'une heure
  // renvoie la veille. Midi est à douze heures de chaque bord.
  const weekday = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
  }).format(new Date(`${localDate}T12:00:00Z`));
  return parseDayToken(weekday.toLowerCase());
}

/**
 * Le jeton de jour d'une DATE (et non d'un instant + fuseau).
 *
 * Miroir serveur de `frontend/src/keel/api/dates.ts::dayTokenOf`, et pour la
 * même raison que le reste de ce module: la règle qui dit quel jour de semaine
 * porte une date ne doit exister qu'une fois par côté, sinon les deux dérivent
 * sur les bords (minuit, changement d'heure) là où c'est invérifiable.
 *
 * Midi UTC et pas minuit: à minuit, un décalage d'une heure renvoie la veille.
 */
export function dayTokenOfDate(date: string): DayToken {
  const d = new Date(`${String(date ?? "").trim()}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`[keel/local_date] "${date}" is not a real calendar date`);
  }
  const week: DayToken[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return week[d.getUTCDay()];
}

/** La date décalée de `days` jours. Même ancrage à midi, même raison. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${String(date ?? "").trim()}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`[keel/local_date] "${date}" is not a real calendar date`);
  }
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Le nombre de jours de `from` à `to`, négatif si `to` précède `from`.
 *
 * Même ancrage à midi que `addDays`, et c'est ce qui compte: une soustraction
 * de deux `Date` à minuit rend 0,958 jour la nuit d'un changement d'heure, et
 * un `Math.round` sur un décompte de jours est le genre d'arrondi qui décale
 * une cadence d'un jour deux fois par an sans que rien ne le signale.
 */
export function daysBetween(from: string, to: string): number {
  const a = new Date(`${String(from ?? "").trim()}T12:00:00Z`);
  const b = new Date(`${String(to ?? "").trim()}T12:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) {
    throw new Error(`[keel/local_date] "${from}" → "${to}" is not a real range`);
  }
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * Les jetons de jour à partir d'aujourd'hui, en avançant.
 *
 * C'est ce qui fait qu'un plan demandé un mercredi commence MERCREDI. Sans lui,
 * le modèle repart de lundi par habitude et rend trois jours déjà passés —
 * défaut mesuré, et l'élève lit un plan dont la moitié est périmée à la
 * livraison.
 */
export function daysFrom(start: DayToken, count: number): DayToken[] {
  const week: DayToken[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const at = week.indexOf(start);
  if (at < 0) return week.slice(0, Math.max(0, count));
  const out: DayToken[] = [];
  for (let i = 0; i < Math.max(0, count); i++) {
    out.push(week[(at + i) % 7]);
  }
  return out;
}
