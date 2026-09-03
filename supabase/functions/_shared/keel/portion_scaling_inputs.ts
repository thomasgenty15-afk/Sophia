/**
 * ══════════════════════════════════════════════════════════════════════════
 * CE QUE LA MISE À L'ÉCHELLE A BESOIN DE SAVOIR DU PLAN — 2026-08-23.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `portion_scaling.ts` sait calculer deux facteurs et réécrire des grammes. Il
 * lui manque cinq nombres sur l'assiette: l'énergie, la protéine, la part de
 * chacune que le facteur peut réellement DÉPLACER, et la lisibilité du plan.
 *
 * ── POURQUOI CE MODULE EXISTE, ET IL A UNE HISTOIRE ───────────────────────
 * Ces cinq nombres étaient calculés **une seule fois dans le dépôt**, dans
 * `scratchpad/qa_scaling_verify_20260811.ts` — un script de mesure, hors
 * production. C'est-à-dire que le module de mise à l'échelle a été écrit,
 * mesuré et validé sur des entrées qu'aucune lane ne savait produire. Il est
 * resté sans consommateur pendant douze jours pour cette raison-là.
 *
 * Recopier le calcul dans `generate-meal-v1` en aurait fait un jumeau du
 * script de QA: le jour où l'un change, la mesure cesse de décrire le produit
 * sans que rien ne le dise. Il vit donc ici, une fois, importé par les deux.
 *
 * PURE: aucun I/O, aucune horloge, aucun aléa.
 *
 * ── ⛔ LES TROIS PIÈGES, TOUS MESURÉS AVANT CE FICHIER ────────────────────
 *
 * ① **LA PART ÉCHELONNABLE N'EST PAS LE PLAT**, et sa frontière ne se
 *    redéfinit PAS ici. `isScalableUnit` est importée, jamais recopiée: elle
 *    couvre `g`, `ml`, `unit` et les cuillères — les dénombrables y sont entrés
 *    le 2026-08-12, après qu'un facteur ×1,81 n'eut rendu que ×1,39 effectif
 *    parce que ~60 % du plat leur échappait. Une seconde liste d'unités
 *    divergerait au premier élargissement, et le facteur se remettrait à porter
 *    sur une assiette qui n'est pas celle qu'on déplace.
 *
 *    Ce qui reste FIXE est donc ce qui ne porte aucune quantité utilisable —
 *    une pincée, « a handful », un ingrédient sans unité. Il compte dans
 *    `computedKcal` (il nourrit) et jamais dans les deux parts mobiles.
 *
 * ② **LE DÉNOMINATEUR DE LISIBILITÉ EST `coverage`, PAS `resolved.length`.**
 *    Le tableau `resolved` ne contient que les termes PESÉS: le sel, le poivre
 *    et « 2 poivrons » sans poids d'unité en sont absents tout en étant
 *    CONNUS. Compter le tableau donnait 69 % là où la couverture donne 96 %,
 *    et la mise à l'échelle s'abstenait sur des condiments.
 *
 * ③ **LES PRÉPARATIONS SONT DÉJÀ PLIÉES À L'ENTRÉE.** Ce module reçoit des
 *    `VerdictDish`, c'est-à-dire la sortie de `foldPreparationsIntoDishes` —
 *    prorata compris. Replier ici ferait un second moteur de prorata, et le
 *    dépôt en a déjà payé un: « un facteur ne porte que sur la part mobile ».
 */

import {
  type CompositionIndex,
  type CompositionInput,
  nutrientsOf,
  resolveIngredient,
  resolveIngredients,
} from "./food_composition.ts";
import { isScalableUnit } from "./portion_scaling.ts";
import { PROTEIN_SOURCES } from "./tokens.ts";
import type { VerdictDish } from "./meal_verdict.ts";

/**
 * Cet aliment appartient-il à un groupe protéique du référentiel ?
 *
 * ⚠️ LA RÉPONSE VIENT DU RÉFÉRENTIEL, JAMAIS D'UNE LISTE DE MOTS. Un matcher
 * maison sur les termes est la cicatrice la plus chère de ce dépôt (« laitue »
 * n'est pas « lait »). Un terme non résolu n'est PAS protéique: on ne devine
 * pas, et le facteur unique reprend alors la main — ce qui est le comportement
 * d'avant, pas une dégradation.
 */
export function proteinFoodPredicate(
  index: CompositionIndex,
): (term: string) => boolean {
  const set = new Set<string>(PROTEIN_SOURCES);
  return (term: string) => {
    const ref = resolveIngredient(index, term);
    return ref ? set.has(String(ref.foodGroupRef)) : false;
  };
}

/** Les cinq nombres, plus la lisibilité, plus le drapeau d'abstention. */
export interface ScalingInputs {
  /** L'énergie de TOUTE la fenêtre, préparations pliées comprises. */
  computedKcal: number;
  computedProteinG: number;
  /** L'énergie portée par les aliments protéiques PESABLES. */
  proteinFoodKcal: number;
  /** L'énergie portée par le reste de ce qui est pesable. */
  otherScalableKcal: number;
  /** La protéine portée par les aliments protéiques PESABLES. */
  proteinFoodProteinG: number;
  /** `connus / total`, la garde de lisibilité de `scaleFactorsFor`. */
  resolvedShare: number;
  /**
   * Un aliment DENSE connu et non pesé quelque part dans le plan.
   *
   * ⛔ L'APPELANT DOIT S'ABSTENIR QUAND IL EST VRAI, et ce n'est pas de la
   * prudence décorative: 82 lignes d'huile sans quantité ont déjà été mesurées
   * dans ce dépôt. Une énergie amputée de sa matière grasse fait croire à un
   * plan trop léger, et la mise à l'échelle l'agrandirait pour de bon.
   */
  unweighedDense: boolean;
  /** Le nombre d'ingrédients lus. `0` ⇒ il n'y avait rien à mesurer. */
  ingredients: number;
}

/**
 * Les entrées de la mise à l'échelle, lues sur un plan DÉJÀ PLIÉ.
 *
 * ⚠️ `dishes` DOIT VENIR DE `foldPreparationsIntoDishes`. Passer les seuls
 * `dish.ingredients` rendrait une assiette amputée de tout le batch cooking —
 * mesuré à 41 % de l'énergie et 51 % de la protéine hors des plats.
 */
export function scalingInputsFor(args: {
  index: CompositionIndex;
  dishes: readonly VerdictDish[];
  isProteinFood: (term: string) => boolean;
}): ScalingInputs {
  const { index, dishes, isProteinFood } = args;

  let computedKcal = 0;
  let computedProteinG = 0;
  let proteinFoodKcal = 0;
  let otherScalableKcal = 0;
  let proteinFoodProteinG = 0;
  let known = 0;
  let ingredients = 0;
  let unweighedDense = false;

  /** L'énergie et la protéine d'un sous-ensemble, plus ce qu'on en sait. */
  const sum = (list: readonly CompositionInput[]) => {
    const r = resolveIngredients(index, list);
    const n = nutrientsOf(r.resolved);
    return {
      // ⚠️ `nutrientsOf` rend `"unknown"` sur une liste VIDE — c'est le cas
      // nominal ici (un plat sans aliment protéique pesable), et il vaut zéro,
      // pas une abstention.
      kcal: n === "unknown" ? 0 : n.energyKcal,
      proteinG: n === "unknown" || n.proteinG === null ? 0 : n.proteinG,
      // Voir le piège ② de l'en-tête: les CONNUS, pas les pesés.
      known: r.total - r.unresolvedTerms.length,
      dense: r.unweighedEnergyDense,
    };
  };

  for (const dish of dishes) {
    const own = dish.ingredients;
    // ⚠️ LE MÊME PRÉDICAT QUE `scaleIngredients`, importé. Deux listes d'unités
    // divergent au premier élargissement, et le facteur se remettrait alors à
    // porter sur une assiette qui n'est pas celle qu'on déplace.
    const scalable = own.filter((i) =>
      isScalableUnit(i.unit) && typeof i.amount === "number"
    );
    const proteinList = scalable.filter((i) => isProteinFood(i.term));
    const otherList = scalable.filter((i) => !isProteinFood(i.term));
    const fixedList = own.filter((i) =>
      !(isScalableUnit(i.unit) && typeof i.amount === "number")
    );

    const p = sum(proteinList);
    const o = sum(otherList);
    const fixed = sum(fixedList);

    ingredients += own.length;
    known += p.known + o.known + fixed.known;
    if (p.dense || o.dense || fixed.dense) unweighedDense = true;

    computedKcal += p.kcal + o.kcal + fixed.kcal;
    computedProteinG += p.proteinG + o.proteinG + fixed.proteinG;
    proteinFoodKcal += p.kcal;
    otherScalableKcal += o.kcal;
    proteinFoodProteinG += p.proteinG;
  }

  return {
    computedKcal,
    computedProteinG,
    proteinFoodKcal,
    otherScalableKcal,
    proteinFoodProteinG,
    // ⚠️ `1` SUR UN PLAN VIDE, et c'est sans conséquence: `scaleFactorsFor`
    // s'abstient de toute façon sur une énergie nulle. Rendre `0` ferait
    // ressembler un plan vide à un plan illisible, et les deux ne se réparent
    // pas au même endroit.
    resolvedShare: ingredients === 0 ? 1 : known / ingredients,
    unweighedDense,
    ingredients,
  };
}
