// ══════════════════════════════════════════════════════════════════════════
// ⟳ LOT C (2026-09-11) — CE QUE LA PERSONNE LIT EST CE QUE LE MOTEUR A CALCULÉ
// ══════════════════════════════════════════════════════════════════════════
//
// ⛔ LE DÉFAUT QUE CE FICHIER FERME, MESURÉ SUR LES DEUX PLANS DE LA CAMPAGNE:
// **64 lignes d'ingrédient sur 96** affichaient une quantité qui n'était plus
// celle du calcul. `readIngredients` gardait `quantity` et ne transmettait
// aucune quantité structurée; `CookingSessions.tsx`, `DishCard.tsx` et
// `PlanDayBlock.tsx` rendaient `ing.quantity` directement. Résultat lu à la
// cuisine: « 360 g de cuisses de poulet » pour un calcul à **458,66 g**, et
// « 2 cuillères à soupe » d'huile pour **0,770** — un rapport huile/lentilles
// faux d'un facteur **2,6**, donc une recette déséquilibrée dans la casserole.
//
// ⛔ LA RÈGLE VIT DANS `_shared/keel/quantity_render.ts`, ET PAS ICI. C'est le
// module que le MOTEUR appelle pour régénérer `quantity` avant d'écrire. Deux
// implémentations de la même règle divergeraient, et ce dépôt sait laquelle
// des deux garde l'ancienne: celle qu'on relit le moins. Ce fichier ne fait
// qu'une chose — donner la LANGUE de l'écran à une fonction pure.
//
// ⚠️ LA LANGUE VIENT DE `uiLocale()`, DONC DE L'ÉCRAN. Le moteur, lui, écrit
// avec `content_locale`, donc avec `profiles.locale`. Les deux coïncident dans
// le cas nominal, et quand elles divergent — un francophone qui lit l'anglais —
// c'est l'écran qui gagne pour l'AFFICHAGE, ce qui est le bon arbitrage: la
// donnée structurée est la même des deux côtés, seul son habillage change.
//
// ⚠️ AUCUNE REFONTE VISUELLE. Décision de périmètre n° 8 du plan: on change la
// SOURCE du texte, pas sa place ni son style. Les anciens plans restent
// lisibles — sans donnée structurée, `renderQuantity` rend le texte persisté
// tel quel, et son `readState` vaut `historic_text`.
import {
  type QuantityReadState,
  type RenderableQuantity,
  renderQuantity,
} from "../../../../supabase/functions/_shared/keel/quantity_render.ts";
import { uiLocale } from "../i18n/runtime";

export type { QuantityReadState };

/**
 * Le texte d'une quantité d'ingrédient, ou `null` quand il n'y a rien à lire.
 *
 * ⛔ `null` ET PAS LA CHAÎNE VIDE: les trois écrans écrivent
 * `{texte && <span>…</span>}`, et une chaîne vide y rendrait une puce vide.
 */
export function ingredientQuantityText(line: RenderableQuantity): string | null {
  return renderQuantity(line, uiLocale()).text;
}

/**
 * D'OÙ VIENT CE TEXTE — exporté pour être ÉPROUVÉ, pas pour être affiché.
 *
 * ⚠️ AUCUN ÉCRAN NE LE REND, et c'est délibéré. « Quantité d'un ancien plan »
 * est une information d'ingénierie; l'écrire à côté d'une recette
 * transformerait un détail d'implémentation en doute sur le dîner. Les tests
 * du lot s'en servent pour distinguer « réparé » de « laissé tel quel », ce
 * qu'une simple égalité de chaînes ne sait pas faire.
 */
export function ingredientQuantityState(
  line: RenderableQuantity,
): QuantityReadState {
  return renderQuantity(line, uiLocale()).readState;
}
