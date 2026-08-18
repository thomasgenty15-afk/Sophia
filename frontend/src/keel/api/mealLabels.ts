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
//
// ── CE QUI A CHANGÉ AU LOT 4 (I18N) ────────────────────────────────────────
// Les ~90 phrases vivaient ICI, dans un `COPY` local. C'était un CATALOGUE
// PARALLÈLE: `t()` ne le voyait pas, `pageSeams.int.test.ts` non plus, et il
// alimente `/app/plan`, `/app/today` ET `/app/household` — donc aucun de ces
// trois écrans ne pouvait basculer en français, quoi qu'on traduise par
// ailleurs. Les valeurs sont maintenant dans le seed (`i18n/en.ts`, namespace
// `meals`), et ce module n'est plus qu'un ACCESSEUR TYPÉ par-dessus `t()`.
//
// Ce que l'accesseur garde et que `t()` n'a pas: la TOLÉRANCE au jeton inconnu.
// `t()` lève, et c'est juste pour une clé écrite à la main; ici les trois
// fonctions du bas reçoivent un jeton venu de la base, et leur repli est une
// décision produit documentée sur chacune.

import { en } from "../i18n/en";
import { type MessageKey, t } from "../i18n/t";

/**
 * L'ORDRE DES RAYONS — celui d'un magasin, pas l'alphabet.
 *
 * Copié de `AISLE_ORDER` du PDF. Le vocabulaire est FERMÉ côté moteur
 * (`SHOPPING_AISLES`), donc cette liste est exhaustive.
 */
export const SHOPPING_AISLE_ORDER = [
  "produce",
  "protein",
  "dairy",
  "grains",
  "frozen",
  "pantry",
  "other",
] as const;

export type MealCopyKey = Extract<MessageKey, `meals.${string}`>;

/**
 * Les clés `meals.*` du seed, À L'EXÉCUTION.
 *
 * Le type ci-dessus est effacé à la compilation, et les trois fonctions du bas
 * composent leur clé à partir d'un jeton venu de la BASE — donc la seule
 * question qu'elles peuvent poser est « cette clé existe-t-elle ? ». Dérivé du
 * seed par le même préfixe que le type, les deux ne peuvent pas diverger.
 */
const MEAL_KEYS: ReadonlySet<string> = new Set(
  Object.keys(en).filter((key) => key.startsWith("meals.")),
);

export function isMealCopyKey(key: string): key is MealCopyKey {
  return MEAL_KEYS.has(key);
}

/**
 * Le texte d'une clé du moteur de repas, dans la langue de la page.
 *
 * `params` suit le contrat de `t()` — trous `{nom}`, et un trou sans valeur
 * lève en DEV. Plusieurs appelants historiques interpolent encore à la main
 * (`mealCopy("…").replace("{n}", …)`); c'est toujours correct, `t()` sans
 * `params` rendant le gabarit tel quel, et `parity.int.test.ts` garantit que
 * les deux langues portent EXACTEMENT les mêmes trous.
 */
export function mealCopy(
  key: MealCopyKey,
  params?: Record<string, string | number>,
): string {
  return t(key, params);
}

/**
 * Le rayon, en mots. Un jeton inconnu rend « Other » au lieu de jeter.
 *
 * C'est l'INVERSE de `labels.ts`, qui jette sur un jeton inconnu, et la
 * différence est assumée: là-bas un jeton inconnu est un bug de vocabulaire
 * qu'il faut voir; ici c'est une carotte, et une carotte qu'on ne sait pas
 * ranger doit rester ACHETABLE plutôt que disparaître de la liste au
 * supermarché.
 */
export function aisleLabel(aisle: string): string {
  const key = `meals.aisle.${aisle}`;
  return isMealCopyKey(key) ? mealCopy(key) : mealCopy("meals.aisle.other");
}

/**
 * « tue » -> « Tuesday ». Rend `null` pour un plat sans jour, ce qui n'est pas
 * une anomalie: la portée « un jour » ne nomme aucun jour, et lui en inventer
 * un serait une prescription d'horaire que le moteur n'a pas faite.
 */
export function dishDayLabel(token: string | null): string | null {
  if (!token) return null;
  const key = `meals.day.${token}`;
  return isMealCopyKey(key) ? mealCopy(key) : token;
}

export function dishSlotLabel(slot: string | null): string | null {
  if (!slot) return null;
  const key = `meals.slot.${slot}`;
  return isMealCopyKey(key) ? mealCopy(key) : slot;
}
