// ⟳ 2026-09-24 — SORTI DE `StudentWeekPlanPage.tsx` (découpage, lot 4a), À L'IDENTIQUE.
// Les dates de la page: aujourd'hui, le lundi, le libellé d'une semaine,
// d'un jour, et l'âge.
// Le fichier d'origine l'importe; il ré-exporte ce qu'il exportait.

import { formatDate } from "../../i18n/format";
import { t } from "../../i18n/t";

/** Monday of the current week, in local date. */
/** Aujourd'hui, dans le fuseau du navigateur. Borne haute d'une naissance. */
export function todayIso(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

export function currentMonday(): string {
  const d = new Date();
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${
    String(d.getDate()).padStart(2, "0")
  }`;
}

/**
 * « week of 12 Aug » — une mesure sans sa date invite à la croire d'aujourd'hui.
 *
 * La date est rendue SÉPARÉMENT de la valeur, et pas concaténée avec elle: sur
 * une seule ligne, « 88 cm · week of 3 Aug » se lit comme un bloc où le chiffre
 * et sa fraîcheur ont le même poids. Ils ne l'ont pas — la valeur se lit d'un
 * coup d'œil, la date se lit quand on se demande si elle est encore vraie.
 */
export function weekLabel(weekStart: string): string {
  const day = formatDate(weekStart, { year: false });
  return day === weekStart ? weekStart : t("plan.measures.week_of", { date: day });
}

/**
 * LE JOUR D'UNE MESURE — « 7 Aug », et pas « week of 3 Aug ».
 *
 * FF-031: la granularité de stockage n'est plus la semaine, donc la date
 * affichée n'a plus de raison de l'être. Rend `null` quand on ne connaît pas le
 * jour, et l'appelant retombe alors sur le libellé de semaine — dire « lundi »
 * d'une pesée du vendredi était précisément le défaut.
 */
export function dayLabel(localDate: string | null): string | null {
  if (!localDate) return null;
  const day = formatDate(localDate, { year: false });
  return day === localDate ? null : day;
}

/** L'âge en années révolues, ou `null`. Dérivé, jamais stocké. */
export function ageFrom(birthDate: string): number | null {
  const b = birthDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b)) return null;
  const d = new Date(`${b}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let years = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) years -= 1;
  return years >= 0 && years < 130 ? years : null;
}
