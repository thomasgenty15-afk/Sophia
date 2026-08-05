// KEEL — les libellés du MOTEUR DE REPAS, et pourquoi ils ne sont pas dans
// `labels.ts`.
//
// `api/labels.ts` traduit les jetons d'un PLAN PUBLIÉ, et il JETTE sur un jeton
// inconnu — à raison: un slug brut affiché à un élève est exactement le drop
// silencieux que R7 interdit. Mais son vocabulaire de créneaux est celui de
// `slot_vocabulary` (`on_waking`, `snack_am`, `snack_pm`, `before_bed`, ...),
// et celui du générateur de repas est plus court et distinct (`breakfast`,
// `lunch`, `dinner`, `snack`).
//
// Ajouter `snack` à la table des créneaux pour faire passer un plat mélangerait
// deux vocabulaires que la base tient séparés, et rendrait `slotLabel`
// tolérant à un jeton qu'aucun plan ne contient. Les deux tables restent donc
// distinctes, chacune fermée sur son propre vocabulaire.

const COPY = {
  "meals.result.in_pantry": "You have it",
  "meals.result.method": "How",
  // Les sessions: le moment où l'on cuisine. Le déroulé est ce qu'on lit avant
  // de commencer, et aucun plat ne peut le porter — l'ordre des gestes se joue
  // ENTRE les préparations.
  "meals.sessions.title": "Your cooking sessions",
  "meals.sessions.subtitle":
    "Cook on these days and the rest of the week is assembling, not cooking.",
  "meals.sessions.makes": "— {n} servings",
  // Un plat qui puise dans une préparation n'affiche ni sa recette ni ses
  // quantités: les répéter ferait racheter et recuire ce qui est déjà prêt.
  "meals.result.from_prep": "From {title} — cooked on {day}.",
  // Le lot: ce qu'une seule session de cuisine produit, et les jours qu'elle
  // nourrit. Dit AVANT les quantités, sinon « 1,200 g » se lit comme une
  // portion.
  "meals.result.batch_makes": "Cooked once — makes {n} servings",
  "meals.result.batch_covers": "covers {days}",
  // Le jour de restes: la seule chose à faire est de sortir la boîte, donc la
  // carte n'affiche ni les ingrédients ni la recette. Les répéter ferait
  // racheter et recuire ce qui est déjà au frigo.
  "meals.result.from_batch": "From the batch you cooked on {day} — reheat a portion.",
  "meals.day.mon": "Monday",
  "meals.day.tue": "Tuesday",
  "meals.day.wed": "Wednesday",
  "meals.day.thu": "Thursday",
  "meals.day.fri": "Friday",
  "meals.day.sat": "Saturday",
  "meals.day.sun": "Sunday",
  "meals.slot.breakfast": "Breakfast",
  "meals.slot.snack_am": "Mid-morning",
  "meals.slot.lunch": "Lunch",
  "meals.slot.snack_pm": "Afternoon",
  "meals.slot.dinner": "Dinner",
  "meals.slot.before_bed": "Before bed",
  // LEGACY, gardé exprès. Plus aucun écran ne propose ce créneau, mais des
  // plats déjà composés le portent: le retirer les afficherait « snack », en
  // brut, dans une interface par ailleurs traduite.
  "meals.slot.snack": "Snack",
  // LA CASE. « I ate this » au passé et à la première personne: c'est l'élève
  // qui rapporte un fait, pas le produit qui lui demande de valider une
  // consigne. « Done » aurait fait du dîner une tâche.
  "meals.tick.label": "I ate this",
  "meals.tick.failed": "That did not save. Tap it again.",
} as const;

export type MealCopyKey = keyof typeof COPY;

export function mealCopy(key: MealCopyKey): string {
  return COPY[key];
}

/**
 * « tue » -> « Tuesday ». Rend `null` pour un plat sans jour, ce qui n'est pas
 * une anomalie: la portée « un jour » ne nomme aucun jour, et lui en inventer
 * un serait une prescription d'horaire que le moteur n'a pas faite.
 */
export function dishDayLabel(token: string | null): string | null {
  if (!token) return null;
  const key = `meals.day.${token}` as MealCopyKey;
  return key in COPY ? mealCopy(key) : token;
}

export function dishSlotLabel(slot: string | null): string | null {
  if (!slot) return null;
  const key = `meals.slot.${slot}` as MealCopyKey;
  return key in COPY ? mealCopy(key) : slot;
}
