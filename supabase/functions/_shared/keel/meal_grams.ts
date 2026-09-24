// ═══════════════════════════════════════════════════════════════════════════
// REPAS GÉNÉRÉS — LES GRAMMES D'UNE LIGNE ET D'UNE PRÉPARATION
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `meal_generation.ts` (découpage des gros
// fichiers, lot 2d-1). Aucune logique changée, aucun octet de prompt changé.
// `meal_generation.ts` ré-exporte tout ce qui y était exporté : les appelants
// continuent d'importer depuis lui.
//
// Ce qui est ici : `refForIngredient`, `gramsRawForIngredient`, `regramMeal`,
// `preparationReadyGrams` et `preparationReadyKcal`.
//
// `referentialGroupOfLine`, qui était entre `refForIngredient` et
// `gramsRawForIngredient`, est RESTÉ dans `meal_generation.ts` : seul le
// parseur l'appelle. Les deux commentaires d'en-tête au-dessus de
// `refForIngredient` sont venus avec lui, dans l'ordre d'origine.

import {
  type CompositionIndex,
  type CompositionRef,
  type CompositionState,
  type CompositionUnit,
  gramsRawOf,
  resolveCompositionLine,
  yieldFactorOf,
} from "./food_composition.ts";
import { weighableQuantityOf } from "./quantity_from_prose.ts";
import type {
  DishIngredient,
  GeneratedDish,
  MealPreparation,
} from "./meal_types.ts";

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LES GRAMMES CRUS D'UN INGRÉDIENT, SUR UN INDEX DONNÉ — extrait le 2026-08-23.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── POURQUOI CETTE EXTRACTION, ET PAS UNE SECONDE ÉCRITURE ────────────────
 * Le sas de réparation (`LOT 18`, `composition_fill.ts`) enrichit l'index APRÈS
 * que le plan a été parsé. Mesuré le 2026-08-23: `composition` est bien
 * réaffecté (`generate-meal-v1/index.ts`, `composition = filledComposition.index`)
 * et le VERDICT en profite — mais `grams_raw`, lui, avait déjà été calculé sur
 * l'index de BASE, et c'est cette valeur-là qui part en base. Le sas réparait
 * donc un chiffre qu'on regarde et pas celui qu'on écrit.
 *
 * Recopier l'expression au point de réparation aurait fait deux écritures de la
 * même règle — « le défaut le plus cher de ce dépôt ». Il n'y a donc qu'un
 * corps de fonction, appelé par le parseur et par la reprise.
 *
 * ⛔ ELLE REFAIT LES DEUX ÉTAPES, DANS L'ORDRE. La lecture en prose
 * (`weighableQuantityOf`, lot `L-1-b`) d'abord, la résolution ensuite: partir
 * de `amount`/`unit` seuls perdrait les lignes dont la quantité n'existe qu'en
 * prose, c'est-à-dire 3 833 lignes du corpus sur 3 850.
 *
 * PURE: aucun I/O, aucune horloge. `composition === null` ⇒ `null`, comme avant.
 */
/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT C (2026-09-11) — LA RÉFÉRENCE D'UNE LIGNE: L'IDENTIFIANT D'ABORD, LE
 * TERME ENSUITE, ET RIEN DU TOUT QUAND L'IDENTIFIANT A ÉTÉ REFUSÉ.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ UN SEUL CORPS, TROIS LECTEURS. `gramsRawForIngredient`,
 * `preparationReadyGrams` et `preparationReadyKcal` résolvaient chacun par
 * `resolveIngredient(composition, ing.term)`. Trois copies de la même décision
 * auraient divergé au premier ajustement — et c'est celle qu'on relit le moins
 * qui aurait gardé le chemin par terme libre.
 *
 * ⛔ L'ORDRE EST LE CONTRAT: un identifiant ACCEPTÉ gagne sur le terme, sans
 * exception. C'est ce qui ferme le défaut mesuré de l'enquête du 2026-09-11:
 * `resolveIngredient` essaie le slug direct avant les alias, donc le terme
 * français « prune » atteint le slug anglais `prune` (fruit sec, 229 kcal) et
 * aucune erreur de résolution ne peut apparaître. L'identifiant, lui, a été lu
 * dans une liste.
 *
 * ⛔ ET UN IDENTIFIANT REFUSÉ REND `null`, il ne retombe PAS sur le terme.
 * « Sans rapprochement approximatif de secours » est la demande explicite du
 * chantier, et c'est la seule lecture honnête: un modèle qui écrit un
 * identifiant AFFIRME savoir de quel aliment il parle. Le peser quand même par
 * son terme reviendrait au chemin qui a servi du raisin sec (321 kcal/100 g)
 * pour du raisin frais (68,9).
 */
/**
 * ⟳ LOT A (2026-09-11) — LE CORPS EST PARTI DANS `food_composition.ts`.
 *
 * ⛔ POURQUOI IL A DÛ DÉMÉNAGER. Il vivait ici, c'est-à-dire dans le PARSEUR de
 * génération — donc hors de portée de tout ce qui mesure une portion. Trois
 * lecteurs de ce fichier l'appelaient; les quatre qui décident réellement d'une
 * boîte (`preparation_mass`, `plan_proportion_units`, `plan_energy`,
 * `box_densify`) repartaient du libellé. Le module commun de composition est le
 * seul endroit que les deux moitiés partagent.
 *
 * ⚠️ CE N'EST PLUS QU'UNE FAÇADE, et elle reste parce que ~cinq appelants la
 * nomment. Aucune règle n'est écrite ici: `resolveCompositionLine` décide.
 */
export function refForIngredient(
  composition: CompositionIndex | null,
  ing: { term: string; ref: string | null; refRefused: boolean },
): CompositionRef | null {
  return resolveCompositionLine(composition, ing).ref;
}

export function gramsRawForIngredient(
  composition: CompositionIndex | null,
  ing: {
    term: string;
    ref: string | null;
    refRefused: boolean;
    quantity: string | null;
    amount: number | null;
    unit: CompositionUnit | null;
    state: CompositionState | null;
  },
): number | null {
  if (!composition) return null;
  const ref = refForIngredient(composition, ing);
  if (!ref) return null;
  const weighable = weighableQuantityOf({
    amount: ing.amount,
    unit: ing.unit,
    quantity: ing.quantity ?? "",
  });
  return gramsRawOf({
    amount: weighable.amount,
    unit: weighable.unit,
    state: ing.state,
    yieldClass: ref.yieldClass,
    yieldFactor: ref.yieldFactor,
    unitGrams: ref.unitGrams,
  });
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE PLAN, REPESÉ SUR L'INDEX RÉPARÉ — 2026-08-23.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── LE DÉFAUT QUE ÇA FERME, ET IL EST MESURÉ ──────────────────────────────
 * `LOT 18` remplit les termes inconnus APRÈS le parseur. Les deux lanes
 * réaffectent bien leur `composition`, et tout ce qui LIT l'index ensuite
 * (verdict, couverture, énergie) en profite. Mais `grams_raw` est une valeur
 * FIGÉE sur la ligne du plan, écrite par le parseur, sur l'index d'AVANT. La
 * ligne écrite en base ne portait donc jamais le bénéfice du sas — seul le
 * tableau de bord le voyait, et il annonçait une réparation que la donnée
 * n'avait pas reçue.
 *
 * ⛔ ELLE NE TOUCHE QUE `gramsRaw`, ET C'EST TOUTE LA GARDE. Ni `amount`, ni
 * `unit`, ni `state`, ni `quantitySource`: ceux-là sont la DÉCLARATION du
 * modèle, ils partent tels quels en base, et les compteurs d'obéissance à
 * FF-038 continuent de compter exactement la même chose. Un modèle qui cesse
 * d'écrire ses quantités doit rester indiscernable... de lui-même.
 *
 * ⚠️ ELLE MUTE, et c'est le précédent de la lane foyer (`item.grams = grams`,
 * `generate-household-meal-v1/index.ts`). Le plan est un objet de travail que
 * ce fichier construit; en rendre une copie ici obligerait chaque appelant à
 * penser à la réaffecter — c'est-à-dire à pouvoir l'oublier.
 *
 * Rend le nombre de lignes dont les grammes ont CHANGÉ. `0` veut dire « le sas
 * n'a rien apporté à cette ligne-ci », et c'est un compteur, pas un silence:
 * sans lui, un sas débranché ressemblerait à un sas qui n'a rien trouvé.
 */
export function regramMeal(
  meal: { dishes: GeneratedDish[]; preparations: MealPreparation[] },
  composition: CompositionIndex | null,
): number {
  if (!composition) return 0;
  let changed = 0;
  const lists: Array<{ ingredients: DishIngredient[] }> = [
    ...meal.dishes,
    ...meal.preparations,
  ];
  for (const holder of lists) {
    for (const ing of holder.ingredients) {
      const next = gramsRawForIngredient(composition, ing);
      if (next === ing.gramsRaw) continue;
      ing.gramsRaw = next;
      changed++;
    }
  }
  return changed;
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT 4 — CE QU'UNE PRÉPARATION PRODUIT, EN GRAMMES DE PRÊT.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LA NUANCE CRU/PRÊT EST TOUTE LA FONCTION. Les `ingredients` d'une
 * préparation portent `gramsRaw` — du CRU, recalculé par ce parseur — et les
 * boîtes sont en grammes de PRÊT. Comparer les deux directement dirait qu'une
 * casserole de 200 g de riz cru ne peut pas remplir deux boîtes de 250 g, alors
 * qu'elle en remplit largement trois: le riz absorbe, facteur 2,6. Le sens de
 * l'erreur serait toujours le même — accuser des plans justes.
 *
 * ⛔ `null` DÈS QU'UN SEUL INGRÉDIENT MANQUE À L'APPEL, et ce n'est pas de la
 * prudence décorative. Une production reconstruite sur la moitié des lignes est
 * SYSTÉMATIQUEMENT trop basse, donc toute somme de boîtes la dépasserait: on
 * fabriquerait une `issue` nommée sur chaque plan dont un ingrédient n'est pas
 * au référentiel. C'est le patron des trois cas de `gramsRaw`, un cran plus
 * haut: on compte « je ne sais pas » à part, on ne le déguise pas en verdict.
 *
 * Rend `null` quand: le référentiel est absent, un ingrédient ne s'y résout pas,
 * une quantité n'est pas convertible (`gramsRaw === null`), ou la préparation
 * n'a aucun ingrédient — une casserole sans contenu ne produit rien de mesurable.
 */
export function preparationReadyGrams(
  ingredients: readonly DishIngredient[],
  composition: CompositionIndex | null,
): number | null {
  if (composition === null || ingredients.length === 0) return null;
  // ⟳ 2026-09-05 — même règle que `weighedReadyGrams` (`box_densify.ts`): l'eau
  // listée à côté d'un grain absorbant est déjà dans le facteur ×2,6.
  const refs: { ref: CompositionRef; gramsRaw: number }[] = [];
  for (const ing of ingredients) {
    if (ing.gramsRaw === null) return null;
    // ⟳ LOT C (2026-09-11) — `refForIngredient` et plus `resolveIngredient`:
    // l'identifiant rendu par le modèle gagne sur le terme libre, et un
    // identifiant REFUSÉ ne retombe pas sur le terme.
    const ref = refForIngredient(composition, ing);
    if (!ref) return null;
    refs.push({ ref, gramsRaw: ing.gramsRaw });
  }
  const absorbs = refs.some(({ ref }) => ref.yieldClass === "grain_absorbs");
  let total = 0;
  for (const { ref, gramsRaw } of refs) {
    if (absorbs && ref.foodGroupRef === "water") continue;
    total += gramsRaw * yieldFactorOf(ref);
  }
  return total;
}

/**
 * ⟳ 2026-09-10 · LOT 5 — L'ÉNERGIE D'UNE CASSEROLE, MESURÉE COMME SA MASSE.
 *
 * ⛔ ELLE EXISTE POUR UNE VÉRIFICATION, PAS POUR UN CALCUL DE PLUS. Le
 * chantier exige que « le résultat mesuré soit le payload réellement
 * enregistré ». Or la lane du foyer MESURE les plats (`measureDish`, bloc L9),
 * puis REGRAMME les casseroles bien plus bas (croissance et rétrécissement
 * d'identité) — et écrit ensuite la ligne. Entre les deux, deux choses peuvent
 * déplacer la densité réelle du pot:
 *   · un ingrédient PLAFONNÉ par `scaleIngredients` casse la proportionnalité;
 *   · une casserole RETIRÉE emporte ce que des plats y puisaient.
 * Sans une seconde lecture, la ligne écrite porte une énergie mesurée sur un
 * pot qui n'existe plus.
 *
 * ⚠️ MÊME RÉSOLUTION, MÊMES ABSTENTIONS QUE `preparationReadyGrams`: un
 * ingrédient sans grammes ou sans référence rend `null` pour la casserole
 * entière. Un demi-total serait pire qu'aucun — il aurait l'air d'une mesure.
 *
 * ⚠️ ET LA MÊME RÈGLE D'EAU: l'eau listée à côté d'un grain qui absorbe est
 * déjà dans le facteur de rendement, donc elle ne compte ni en masse ni en
 * énergie (elle n'en porte pas, mais l'exclure des deux garde les deux
 * fonctions strictement parallèles).
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function preparationReadyKcal(
  ingredients: readonly DishIngredient[],
  composition: CompositionIndex | null,
): number | null {
  if (composition === null || ingredients.length === 0) return null;
  let total = 0;
  const refs: { ref: CompositionRef; gramsRaw: number }[] = [];
  for (const ing of ingredients) {
    if (ing.gramsRaw === null) return null;
    // ⟳ LOT C (2026-09-11) — `refForIngredient` et plus `resolveIngredient`:
    // l'identifiant rendu par le modèle gagne sur le terme libre, et un
    // identifiant REFUSÉ ne retombe pas sur le terme.
    const ref = refForIngredient(composition, ing);
    if (!ref) return null;
    refs.push({ ref, gramsRaw: ing.gramsRaw });
  }
  const absorbs = refs.some(({ ref }) => ref.yieldClass === "grain_absorbs");
  for (const { ref, gramsRaw } of refs) {
    if (absorbs && ref.foodGroupRef === "water") continue;
    // ⚠️ `energyKcal` EST POUR 100 g CRUS, et `gramsRaw` est cru: les deux se
    // touchent sans facteur de rendement. C'est le rendement qui change la
    // MASSE servie, pas l'énergie — une casserole ne gagne pas de calories en
    // absorbant de l'eau.
    total += (gramsRaw * ref.energyKcal) / 100;
  }
  return total;
}
