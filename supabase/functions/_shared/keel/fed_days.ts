/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE DÉNOMINATEUR D'UN PLAN — ET IL A LE DROIT D'ÊTRE UNE FRACTION.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Module PUR, SANS AUCUN IMPORT. C'est délibéré: ses cinq lecteurs vivent dans
 * quatre modules qui s'importent déjà les uns les autres, et une arête de plus
 * vers `window_coverage.ts` (qui importe `mouth_anchor.ts`) risquait un cycle
 * de chargement. Une seule ligne de règle n'a besoin de rien.
 *
 * ── LA DÉCISION DU PROPRIÉTAIRE, 2026-09-09 ───────────────────────────────
 *
 *     « Un jour avec un repas dehors doit recevoir 0,6 journée — enfin, ça
 *       dépend du repas: c'est le besoin calorique du repas, calculé comme
 *       normal en fonction du créneau, tout simplement. »
 *
 * C'est-à-dire: **la part de chaque créneau, celle qui existe déjà**
 * (`SLOT_DAY_WEIGHT`, lue par `dayCoverageOf`). Petit-déjeuner + dîner pèsent
 * 0,25 + 0,35 = 0,60 d'une journée déclarée à 1,00; un déjeuner seul en pèse
 * 0,40; un dîner seul, 0,35. Il n'y a pas de nouvelle règle à écrire — il y a
 * un plancher à retirer.
 *
 * ── CE QUE `Math.max(1, …)` FAISAIT, ET IL LE DISAIT LUI-MÊME ─────────────
 * Les cinq lecteurs écrivaient `Math.max(1, daysCovered)`. Sur une fenêtre de
 * plusieurs jours ce plancher ne mord jamais (la couverture y dépasse 1). Sur
 * une fenêtre d'UN jour il mord toujours, et le commentaire de `meal_verdict.ts`
 * le nommait sans le corriger:
 *
 *     « une fenêtre d'UN jour qui ne porte qu'un dîner a une couverture de
 *       0,35, et ce max la ramène à 1. Ce plan-là se lit donc toujours ~3 fois
 *       plus léger qu'il n'est […] NE LE RETIRE PAS SANS MESURE. Le corpus du
 *       2026-09-04 ne porte aucun plan d'un seul jour. »
 *
 * ⛔ LA MESURE MANQUANTE A ÉTÉ FAITE — 2026-09-09, plan d'un jour, déjeuner
 * dehors, petit-déjeuner + dîner composés (couverture 0,60):
 *
 *     servi par le plan        2 171 kcal
 *     lu par le verdict        2 171 / 1     = 2 171 kcal/j  ⇒ `within`
 *     lu SANS le plancher      2 171 / 0,60  = 3 618 kcal/j  ⇒ `above`
 *     fourchette de la personne              1 950 – 2 200 kcal/j
 *
 * Le verdict trouvait correct un plan qui sert **une journée entière en deux
 * repas** — et le conseil du midi (« vise autour de 700 ») s'ajoutait par
 * dessus, pour 2 871 kcal impliqués contre un plafond de 2 200.
 *
 * ── LE SENS DE L'ERREUR QUE LE PLANCHER PRODUISAIT ────────────────────────
 * Il coupe dans les DEUX sens, et les deux sont mauvais:
 *   · une couverture < 1 lue comme 1 fait paraître le plan **plus léger**
 *     qu'il n'est ⇒ la boucle de correction le GONFLE. C'est la cicatrice
 *     « un dîner seul se voit demander une journée entière — une assiette de
 *     deux kilos » (`dayCoverageOf`), et le plancher la rouvrait pour toute
 *     fenêtre d'un jour.
 *   · le même plan est jugé `within` alors qu'il déborde ⇒ personne ne voit
 *     rien. « Un instrument qui a raison d'une façon qui trompe est pire qu'un
 *     instrument faux. »
 *
 * ⚠️ CE QUI RESTE, ET C'EST TOUT CE QUE LE PLANCHER PROTÉGEAIT VRAIMENT: une
 * division par zéro. Une couverture nulle ou illisible rend `1` — le
 * comportement d'hier — parce qu'un plan qui ne nourrit aucune journée n'a pas
 * de kcal/jour, et qu'`Infinity` rendrait `above` sur tout, donc un rabotage
 * général.
 *
 * PURE: no I/O, no clock, no randomness.
 */

/**
 * Le nombre par lequel on divise l'énergie (et la protéine) de toute une
 * génération pour obtenir un par-jour.
 *
 * ⛔ UNE SEULE ÉCRITURE POUR CINQ LECTEURS — `verdictFor`, `assessCoverage`,
 * `offBandDistance`, `scaleFactorFor` et `scaleFactorsFor`. Ils DOIVENT rendre
 * le même nombre: « le produit ne doit pas juger sur un nombre et corriger sur
 * un autre » est une cicatrice mesurée de ce dépôt (17 % d'écart entre le
 * verdict et l'ancrage, dans le sens qui rabote l'assiette), et un test compare
 * déjà leurs dénominateurs.
 */
export function fedDaysDenominator(daysCovered: number): number {
  const days = Number(daysCovered);
  return Number.isFinite(days) && days > 0 ? days : 1;
}
