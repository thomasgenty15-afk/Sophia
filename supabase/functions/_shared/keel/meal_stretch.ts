/**
 * LA SEMAINE D'UNE COMPOSITION — quel jeton de jour tombe quel jour.
 *
 * ---------------------------------------------------------------------------
 * POURQUOI CE MODULE EXISTE CÔTÉ SERVEUR
 * ---------------------------------------------------------------------------
 * La règle vivait uniquement dans `frontend/src/keel/api/mealStretch.ts`, parce
 * que seul l'écran avait besoin de savoir quel plat se mange quel jour. Le
 * rapprochement photo → plat prévu (`planned_dish_match.ts`) en a besoin lui
 * aussi, et côté serveur.
 *
 * La réimplémenter aurait été la faute que ce dépôt paie en boucle: deux
 * implémentations de la même règle divergent sur les bords, et la divergence se
 * voit comme « l'écran coche mardi, la conversation propose mercredi » sans
 * qu'aucune des deux ne soit identifiable comme la menteuse. Ce fichier est le
 * portage FIDÈLE du raisonnement d'en face; le front reste la copie de
 * référence pour l'affichage, celle-ci sert les effets durables.
 *
 * ---------------------------------------------------------------------------
 * LE PROBLÈME, EN UNE PHRASE
 * ---------------------------------------------------------------------------
 * Un plat ne nomme qu'un JOUR DE SEMAINE (« tue »), jamais une date, et
 * ⚠️ PÉRIMÉ AU 2026-08-07: la table PORTE maintenant sa fenêtre (`starts_on`, `duration_days`, `ends_on`). Ce module reste pour les lignes antérieures et pour le découpage par jeton; la source de vérité de « quel plan possède ce jour » est `meal_plan_window.ts` / `api/mealWindow.ts`.
 * 
 * `student_generated_meals` ne porte aucune `week_start`. « Mardi de QUELLE
 * semaine » n'a donc pas de réponse dans les données — il faut une ancre.
 *
 * L'ANCRE EST LA DATE DE COMPOSITION, et c'est le seul point fixe disponible:
 * `generate-meal-v1` remplit sept jours À PARTIR DU JOUR OÙ ON GÉNÈRE
 * (`daysFrom(todayToken, 7)`). Prendre « aujourd'hui » comme ancre paraîtrait
 * équivalent et ne l'est pas: un plan composé mercredi puis relu vendredi
 * verrait mercredi et jeudi renvoyés à la semaine PROCHAINE, alors qu'ils
 * viennent de passer.
 *
 * PURE MODULE: aucun I/O, aucune horloge propre (l'appelant passe les dates).
 */

import { addDays, dayTokenOfDate } from "./local_date.ts";
import { type DayToken } from "./tokens.ts";

/** Les sept jours d'une composition. */
export const STRETCH_DAYS = 7;

/**
 * Le jeton de jour → sa DATE dans cette composition.
 *
 * Sur sept jours consécutifs chaque jeton apparaît exactement une fois, donc la
 * correspondance est totale et sans ambiguïté — c'est précisément ce qui manque
 * quand on regarde un plat isolé.
 */
export function stretchDates(
  startDate: string,
  /**
   * La vraie longueur de la fenêtre. Sept par défaut — l'hypothèse que ce
   * module portait quand un plan durait toujours une semaine. Depuis
   * `20260807090000_meal_plan_window`, la ligne la connaît, et un plan de
   * quatre jours ne doit pas résoudre les trois jetons qu'il ne possède pas.
   */
  durationDays: number = STRETCH_DAYS,
): Record<string, string> {
  const out: Record<string, string> = {};
  const days = Math.min(STRETCH_DAYS, Math.max(1, durationDays));
  for (let i = 0; i < days; i++) {
    const date = addDays(startDate, i);
    out[dayTokenOfDate(date)] = date;
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
  day: string | null | undefined,
  dates: Record<string, string>,
  fallback: string,
): string | null {
  const token = String(day ?? "").trim();
  if (!token) return fallback;
  return dates[token] ?? null;
}

/**
 * Ce plat est-il RAPPORTABLE ce jour-là ?
 *
 * PASSÉ ET AUJOURD'HUI: oui. On rattrape le déjeuner d'hier ce matin, et le
 * fait reste daté du jour où il a eu lieu — c'est un rapport, pas une
 * approximation.
 *
 * FUTUR: non, et c'est la seule interdiction qui compte. Cocher lundi le dîner
 * de vendredi écrirait un « j'ai mangé » daté de vendredi, dans la table même
 * qui nourrit la couverture que le coach lit. Ce n'est pas une imprécision,
 * c'est une preuve fabriquée.
 */
export function isReportable(date: string | null, today: string): boolean {
  return date !== null && date <= today;
}

/** Un plat, réduit à ce que le fenêtrage regarde. */
export interface StretchableDish {
  day?: string | null;
  slot?: string | null;
}

export interface DishOnDate<T> {
  dish: T;
  dishIndex: number;
  /** La date à laquelle ce plat se mange dans cette composition. */
  date: string;
}

/**
 * LES PLATS CANDIDATS D'UN JOUR — le seul point d'entrée que les appelants
 * doivent connaître.
 *
 * Rend les plats dont la date résolue est EXACTEMENT `onDate`, en conservant
 * leur index d'origine: c'est lui qui identifie la coche (`mealTickKey`), et le
 * perdre en filtrant cocherait le mauvais plat.
 */
export function dishesForDate<T extends StretchableDish>(args: {
  dishes: readonly T[];
  /** Premier jour de la fenêtre (`starts_on`), en date locale de l'élève. */
  startDate: string;
  /**
   * Combien de jours la fenêtre couvre. Par défaut sept — ce que ce module a
   * supposé jusqu'au 2026-08-07, quand un plan commençait toujours aujourd'hui
   * et durait toujours une semaine.
   *
   * Le passer VRAIMENT est ce qui empêche un plan de quatre jours de résoudre
   * les trois jetons qu'il ne possède pas: sans ça, le lundi de la semaine
   * SUIVANTE rapprocherait une photo contre le plan de cette semaine-ci.
   */
  durationDays?: number;
  onDate: string;
  /**
   * Un plat SANS jour (`day: null`) tombe-t-il le jour demandé ?
   *
   * ── LE DÉFAUT MESURÉ LE 2026-08-05, ET POURQUOI LE DÉFAUT EST `false` ────
   * `dishDate(null, …)` rend le `fallback`, c'est-à-dire le jour demandé. Un
   * plat sans jour tombe donc TOUS les jours — et comme le chargeur prend la
   * dernière composition sans borne d'âge, une composition du 15 juillet
   * cochait automatiquement aujourd'hui, `confident` 3/3. Ce n'est pas
   * théorique: **9 plats réels de la base** portent `day: null`, tous issus de
   * compositions `scope='day'` (« génère-moi un repas »). Ils étaient
   * éternellement rapprochables.
   *
   * Le repli reste JUSTE pour rapporter (l'élève qui coche à la main un plat
   * sans jour le rapporte le jour où il le fait). Il est FAUX pour rapprocher
   * sans demander: un plat qui ne vise aucun jour ne peut pas servir de preuve
   * qu'on l'a mangé aujourd'hui plutôt qu'il y a trois semaines.
   */
  includeUndated?: boolean;
}): Array<DishOnDate<T>> {
  const dates = stretchDates(args.startDate, args.durationDays);
  const out: Array<DishOnDate<T>> = [];
  args.dishes.forEach((dish, dishIndex) => {
    if (!args.includeUndated && !String(dish.day ?? "").trim()) return;
    const date = dishDate(dish.day, dates, args.onDate);
    if (date === args.onDate) out.push({ dish, dishIndex, date });
  });
  return out;
}
