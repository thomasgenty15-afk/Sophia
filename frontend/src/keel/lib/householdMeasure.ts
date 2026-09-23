import { type MealCopyKey } from "../api/mealLabels";

// ⟳ 2026-09-22 — UN VOLUME, DIT DANS L'UNITÉ DU GESTE.
//
// ── LE DÉFAUT, VU À L'ÉCRAN ────────────────────────────────────────────────
// La dose par personne d'un repas sans cuisson affichait « huile de colza —
// 6 g ». Le nombre est juste — c'est la grandeur du plan — et il n'est pas
// exécutable: personne ne pèse 6 g d'huile, on en verse une cuillère. Une dose
// qu'on ne sait pas servir ne se sert pas.
//
// ── CE QUE CE MODULE FAIT, ET CE QU'IL NE FAIT PAS ─────────────────────────
// Il traduit un VOLUME (millilitres) en unité de cuisine. Il ne convertit
// AUCUN gramme: la densité vit dans le référentiel, que le front ne peut pas
// lire, et c'est le moteur qui a déjà fait la division (`BoxItem.ml`). Ce qui
// arrive ici est donc un fait, pas une estimation d'écran.
//
// ⛔ IL NE REGARDE AUCUN LIBELLÉ. « laitue » n'est pas « lait », et ce dépôt a
// mesuré douze faux positifs sur douze la dernière fois qu'un matcher maison a
// touché à des noms d'aliments. La seule entrée est un nombre.
//
// ⛔ ET IL NE REMPLACE PAS LE GRAMME À L'ÉCRAN. Les deux se lisent ensemble: le
// gramme reste la grandeur du plan (c'est lui qui a servi au calcul d'énergie),
// la cuillère est le geste. Remplacer l'un par l'autre ferait disparaître le
// seul nombre qui se vérifie.

/** La mesure de cuisine d'un volume: une clé de libellé et son nombre. */
export interface HouseholdMeasure {
  key: MealCopyKey;
  n: number;
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LES DEUX BORNES, ET POURQUOI CELLES-LÀ.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Une cuillère à café fait 5 ml, une cuillère à soupe 15. Le choix de l'unité
 * est un ARBITRAGE D'ARRONDI: on prend celle qui donne un nombre entier proche
 * du volume réel, parce qu'une demi-cuillère écrite « 1,5 » ne se formate pas
 * pareil d'une langue à l'autre et qu'un tiers de cuillère ne se verse pas.
 *
 * · en dessous de 25 ml → cuillères à CAFÉ (jusqu'à 5). 7 ml d'huile donnent
 *   « 1 c. à café », 13 ml en donnent 3 — l'écart est d'une demi-cuillère
 *   d'huile, ce qui est sans conséquence sur une assiette et honnête sous un
 *   « ≈ ».
 * · de 25 à 100 ml → cuillères à SOUPE. Au-delà de 5 cuillères à café, compter
 *   en café devient illisible; en dessous de 25, compter en soupe écraserait
 *   une cuillère à café sur deux.
 * · au-dessus de 100 ml → des MILLILITRES, arrondis au multiple de 5. On ne
 *   sert pas 200 g de boisson de soja à la cuillère: on les verse dans un
 *   verre, et un verre se lit en millilitres.
 *
 * ⚠️ JAMAIS ZÉRO. Un volume trop petit pour une cuillère à café rend quand même
 * « 1 » — « 0 c. à café » se lirait « il n'y en a pas », ce qui est faux: le
 * plan en a mis, et l'énergie du repas les compte.
 */
const TEASPOON_ML = 5;
const TABLESPOON_ML = 15;
const TEASPOON_CEILING_ML = 25;
const SPOON_CEILING_ML = 100;

export function householdMeasureOf(ml: number | null): HouseholdMeasure | null {
  // ⚠️ `null` EST LE CAS MAJORITAIRE et il se rend en SILENCE: un poulet n'a
  // pas de volume, un plan d'avant ce lot n'en porte aucun. Pas de « — », pas
  // de libellé au-dessus du vide.
  if (ml === null || !Number.isFinite(ml) || ml <= 0) return null;
  if (ml < TEASPOON_CEILING_ML) {
    return { key: "meals.boxes.teaspoons", n: Math.max(1, Math.round(ml / TEASPOON_ML)) };
  }
  if (ml < SPOON_CEILING_ML) {
    return {
      key: "meals.boxes.tablespoons",
      n: Math.max(1, Math.round(ml / TABLESPOON_ML)),
    };
  }
  return { key: "meals.boxes.millilitres", n: Math.round(ml / 5) * 5 };
}
