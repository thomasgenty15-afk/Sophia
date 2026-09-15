import { addDays, dayTokenOf, localDateIn } from "./dates";
import { type DayToken } from "./types";

// LA SEMAINE D'UNE COMPOSITION — quel jeton de jour tombe quel jour.
//
// ===========================================================================
// LES DEUX DÉFAUTS QUE CE MODULE FERME, ET ILS AVAIENT LA MÊME CAUSE
// ===========================================================================
// Un plat ne nomme qu'un JOUR DE SEMAINE (« tue »), jamais une date, et
// ⚠️ PÉRIMÉ AU 2026-08-07: la table PORTE maintenant sa fenêtre (`starts_on`, `duration_days`, `ends_on`). Ce module reste pour les lignes antérieures et pour le découpage par jeton; la source de vérité de « quel plan possède ce jour » est `meal_plan_window.ts` / `api/mealWindow.ts`.
// 
// `student_generated_meals` ne porte aucune `week_start`. Tant que personne ne
// résolvait ce jeton en date, deux choses étaient impossibles:
//
//  1. AFFICHER LE PLAN DANS SON ORDRE. Le rendu parcourait lundi→dimanche, en
//     dur. Une composition faite un MERCREDI remplit `wed, thu, fri, sat, sun,
//     mon, tue` — les deux derniers étant la semaine SUIVANTE. Affichés en
//     tête, ils se lisaient comme des jours déjà passés, et l'élève ouvrait son
//     plan sur ce qui ressemblait à du retard.
//
//  2. RATTRAPER UNE COCHE. Une case n'existait que sur les plats du jour, parce
//     qu'une coche datée de MAINTENANT sur le dîner de vendredi serait une
//     preuve fabriquée. Le raisonnement était juste; la conclusion était trop
//     large. Ce qu'il faut interdire, c'est de dater un fait dans le FUTUR —
//     pas de rapporter aujourd'hui ce qu'on a mangé hier.
//
// L'ANCRE EST LA DATE DE COMPOSITION, et c'est le seul point fixe disponible:
// le moteur remplit sept jours À PARTIR DU JOUR OÙ ON GÉNÈRE (`daysFrom(
// todayToken, 7)` dans `generate-meal-v1`). Prendre « aujourd'hui » comme ancre
// paraîtrait équivalent et ne l'est pas: un plan composé mercredi puis rouvert
// vendredi verrait mercredi et jeudi renvoyés à la semaine prochaine, alors
// qu'ils viennent de passer.

/** Les sept jours d'une composition. */
export const STRETCH_DAYS = 7;

/**
 * Le premier jour du plan, en date locale.
 *
 * `createdAt` absent = la composition vient d'être faite dans cet onglet, donc
 * elle commence aujourd'hui. C'est vrai par construction et pas un repli
 * approximatif: le seul appelant qui n'a pas de `created_at` est celui qui
 * vient de recevoir la réponse du moteur.
 */
export function stretchStartDate(createdAt: string | null): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!createdAt) return localDateIn(zone);
  const at = new Date(createdAt);
  if (Number.isNaN(at.getTime())) return localDateIn(zone);
  return localDateIn(zone, at);
}

/**
 * Les jetons de jour dans L'ORDRE DU PLAN, à partir de son premier jour.
 *
 * Mercredi rend `wed, thu, fri, sat, sun, mon, tue`. C'est la correction du
 * défaut 1: le plan se lit dans l'ordre où on le vit, et ce qui appartient à la
 * semaine suivante se retrouve en bas, là où on le comprend comme tel.
 */
export function stretchDayOrder(startDate: string): DayToken[] {
  return Array.from(
    { length: STRETCH_DAYS },
    (_, i) => dayTokenOf(addDays(startDate, i)),
  );
}

/**
 * Le jeton de jour → sa DATE dans cette composition.
 *
 * Sur sept jours consécutifs chaque jeton apparaît exactement une fois, donc la
 * correspondance est totale et sans ambiguïté — c'est précisément ce qui manque
 * quand on regarde un plat isolé.
 */
export function stretchDates(startDate: string): Record<DayToken, string> {
  const out = {} as Record<DayToken, string>;
  for (let i = 0; i < STRETCH_DAYS; i++) {
    const date = addDays(startDate, i);
    out[dayTokenOf(date)] = date;
  }
  return out;
}

/**
 * La date à laquelle un plat de ce jeton se mange, ou `null` si le jeton n'est
 * pas dans la fenêtre.
 *
 * Un plat sans jour (`null`) rend `fallback`: il ne vise aucun moment de la
 * semaine, donc le seul jour honnête où le rapporter est celui où on le
 * rapporte.
 */
export function dishDate(
  day: string | null,
  dates: Record<DayToken, string>,
  fallback: string,
): string | null {
  if (!day) return fallback;
  return dates[day as DayToken] ?? null;
}

/**
 * Ce plat est-il RAPPORTABLE aujourd'hui ?
 *
 * PASSÉ ET AUJOURD'HUI: oui. On rattrape le déjeuner d'hier ce matin, et le
 * fait reste daté du jour où il a eu lieu — c'est un rapport, pas une
 * approximation.
 *
 * FUTUR: non, et c'est la seule interdiction qui compte. Cocher lundi le dîner
 * de vendredi écrirait un « j'ai mangé » daté de vendredi, dans la table même
 * qui nourrit la couverture que le coach lit. Ce n'est pas une imprécision,
 * c'est une preuve fabriquée.
 *
 * Une date inconnue (`null`) n'est pas rapportable: on ne sait pas de quel jour
 * on parlerait.
 */
export function isReportable(date: string | null, today: string): boolean {
  return date !== null && date <= today;
}
