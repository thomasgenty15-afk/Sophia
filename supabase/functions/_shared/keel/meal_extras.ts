/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-10 — LES EXTRAS SONT SUPPRIMÉS. CE QUI RESTE EST « LE REPAS LÉGER »
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ DÉCISION PRODUIT: **le plan dimensionne les aliments qu'il prévoit.** Il ne
 * réserve plus d'énergie pour des accompagnements personnels hors plan.
 *
 * ── CE QUI VIVAIT ICI, ET CE QUI EN EST FAIT ─────────────────────────────
 * Cinq jetons (`bread / cheese / yoghurt / fruit / dessert`) déclarés par
 * MOMENT sur le déjeuner et le dîner, résolus au référentiel CIQUAL
 * (`extrasOf`), et RETRANCHÉS de la cible du moment (`slotPlanTargets`). Avec
 * eux disparaissent `MEAL_EXTRAS`, `EXTRA_BEARING_SLOTS`, `EXTRA_PORTION`,
 * `extraNutrients`, `extrasOf`, `UNANSWERED_EXTRAS_KCAL`, `resolveSlotExtras`
 * et `MEAL_EXTRAS_SOURCES` — ainsi que le repli sur les trois booléens par
 * personne (`takes_bread / takes_cheese / takes_dessert`).
 *
 * ⚠️ ET LE PLANCHER QUI LES ACCOMPAGNAIT MEURT AVEC EUX.
 * `COMPOSED_DISH_MIN_MEAL_SHARE = 0,30` (`mouth_anchor.ts`) n'existait que pour
 * empêcher deux retraits de vider un repas. Il ne restait plus qu'un retrait,
 * celui des APPORTS FIXES, et un plancher qui borne une déclaration explicite
 * ferait composer un repas par-dessus une boisson qu'on sait avalée.
 *
 * ⛔ CE QUI N'EST PAS SUPPRIMÉ, ET IL FAUT LE DIRE: le pain, le fromage et les
 * desserts qui font partie d'une RECETTE ou du PLAN. Leurs kcal et leurs
 * grammes se comptent normalement — ce lot ne retire aucun ingrédient, aucun
 * complément généré par le moteur, et rien du suivi de ce qui est réellement
 * mangé. Il retire une RÉSERVATION faite au nom de quelqu'un.
 *
 * ⚠️ LES ANCIENNES RÉPONSES RESTENT EN BASE (`household_member_habits.slots[]
 * .extras`, `household_member_bodies.takes_*`). Aucune donnée n'est effacée:
 * plus personne ne les LIT, ce qui suffit à les neutraliser.
 *
 * ⚠️ LE NOM DU FICHIER SURVIT À SON CONTENU, EXPRÈS. Le renommer déplacerait
 * huit imports dans un lot qui n'en a pas besoin; ce pavé est là pour qu'un
 * lecteur qui l'ouvre en cherchant les extras sache en une ligne ce qui s'est
 * passé.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

/**
 * LES MOMENTS QUI PEUVENT ÊTRE MARQUÉS « LÉGER » — 2026-09-07.
 *
 * ⛔ TROIS, ET C'EST UNE AUTRE QUESTION QUE CELLE QUI VIENT DE MOURIR. Les
 * extras demandaient « qu'est-ce qui arrive À CÔTÉ du plat » — une réservation
 * hors plan. Le léger demande « ce moment pèse-t-il moins que d'habitude »: il
 * déplace la part d'un moment DANS le plan, il ne réserve rien à côté. Il a un
 * sens partout où le plan compose un vrai repas, petit-déjeuner compris.
 *
 * ⚠️ ET LES COLLATIONS EN SONT EXCLUES, POUR UNE RAISON ARITHMÉTIQUE. Une
 * collation pèse déjà 0,10 de la journée; la marquer légère demanderait au plan
 * de composer quelque chose comme 40 kcal — c'est-à-dire rien, servi comme une
 * décision. « Je ne prends pas de goûter » se dit en ne DÉCLARANT pas le
 * goûter, et cette porte-là existe déjà.
 *
 * ⚠️ CETTE LISTE ET `LIGHT_SLOT_WEIGHT` (`mouth_anchor.ts`) DOIVENT PORTER LES
 * MÊMES CLÉS. Un moment marquable sans poids léger serait une case à cocher qui
 * ne fait rien; un poids sans case serait un poids que rien n'atteint. Un test
 * les compare.
 */
export const LIGHT_BEARING_SLOTS = ["breakfast", "lunch", "dinner"] as const;
export type LightBearingSlot = (typeof LIGHT_BEARING_SLOTS)[number];

export function slotBearsLight(slot: string): boolean {
  return (LIGHT_BEARING_SLOTS as readonly string[]).includes(slot);
}
