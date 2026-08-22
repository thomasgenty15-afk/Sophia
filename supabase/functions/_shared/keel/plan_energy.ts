/**
 * FF-059 — L'ÉNERGIE D'UN PLAN COMPOSÉ, PAR PLAT ET PAR JOUR.
 *
 * Fiche: `docs/fonctionnalites/composition-des-repas/FF-059-le-chiffre-affiche.md`
 * Cadre: `docs/keel/CALORIE_REVERSAL.md` · Mesures: `docs/keel/PHOTO_QUANTIFICATION.md`
 *
 * ── C'EST UN CALCUL, PAS UNE ESTIMATION, ET C'EST TOUTE LA DÉCISION ────────
 * Le refus d'origine était fondé sur LA PHOTO: −26,6 % de biais, systématique,
 * dans le sens flatteur, et pire sur les gros repas. Ici les quantités ne sont
 * devinées par personne — **le produit les a écrites**, et le parseur les a
 * RECALCULÉES en grammes crus (`DishIngredient.gramsRaw`, FF-038) au lieu de
 * croire l'arithmétique du modèle. Condition « grammages fournis » du banc:
 * MAPE 2,3 %, un cas à 662 kcal contre 661,8 de vérité terrain.
 *
 * ── `basis` EST UNE CONSTANTE DU CHEMIN ────────────────────────────────────
 * `plan_quantities`. Jamais une déclaration du modèle sur lui-même — c'est
 * l'arbitrage de `CALORIE_REVERSAL` §3, transposé: la base est une propriété de
 * L'ENTRÉE, pas une opinion. Le plan porte les quantités, donc la base est
 * acquise. Un champ que le modèle remplirait serait un champ qu'il peut mentir.
 *
 * ── RIEN NE SE STOCKE (R5) ─────────────────────────────────────────────────
 * Ce module ne renvoie aucune valeur destinée à une colonne. Un chiffre stocké
 * survit au plan qui l'a produit et ment le jour où le plan change — le même
 * défaut que la divergence de FF-056. On recalcule, à chaque lecture, depuis
 * les quantités du jour et le référentiel du jour.
 *
 * ── L'ABSTENTION EST PAR PLAT, ET LE JOUR L'AVOUE ──────────────────────────
 * Un plat dont un seul ingrédient manque au référentiel, ou dont une seule
 * quantité n'est pas convertible, ne porte PAS de chiffre. Et la journée qui le
 * contient DIT qu'elle est incomplète. « Un total qui paraît exhaustif et ne
 * l'est pas est pire que pas de total » — c'est le rabbit hole n°3 de la fiche,
 * et c'est le mode de défaillance que ce module est le plus tenté de produire.
 *
 * ⚠️ ── CE MODULE NE DÉCIDE PAS S'IL FAUT AFFICHER ───────────────────────────
 * Il calcule. La question « cet élève a-t-il le droit de voir un chiffre »
 * appartient à `energy_gate.ts`, et l'appelant doit avoir traversé les quatre
 * portes AVANT d'arriver ici. Les fondre ferait une fonction qui, appelée pour
 * une raison, répondrait à l'autre.
 *
 * PURE MODULE: no I/O, no clock, no randomness.
 */

import {
  type CompositionIndex,
  type CompositionInput,
  gramsRawOf,
  isFriedMethod,
  normalizeTerm,
  type NutrientsOrUnknown,
  nutrientsOf,
  resolveIngredient,
  resolveIngredients,
  YIELD_CLASSES,
} from "./food_composition.ts";
import {
  type GroupBand,
  groupBandsFrom,
  MAX_PLAUSIBLE_KCAL_PER_100G,
} from "./composition_fill.ts";
import { foldPreparationsIntoDishes } from "./meal_verdict.ts";
import type { FoodGroupRef } from "./tokens.ts";

// ---------------------------------------------------------------------------
// LE TYPE QUI PORTE SA BASE
// ---------------------------------------------------------------------------

/**
 * LA BASE, ET IL N'Y EN A QU'UNE SUR CE CHEMIN.
 *
 * `photo_estimate` existe dans `CALORIE_REVERSAL.md` et n'a rien à faire ici:
 * la photo est un autre chantier, une autre base, un autre calendrier. Un
 * `EnergyBasis` à deux valeurs dans ce module inviterait un appelant à choisir,
 * alors qu'il n'y a rien à choisir.
 */
export const PLAN_ENERGY_BASIS = "plan_quantities";
export type PlanEnergyBasis = typeof PLAN_ENERGY_BASIS;

/**
 * POURQUOI UN PLAT N'A PAS DE CHIFFRE. Nommé, jamais un `null` nu.
 *
 * Les trois se réparent différemment: `unknown_ingredient` pilote la curation
 * d'alias du référentiel, `missing_quantity` dit que le générateur a rendu une
 * quantité non structurée, `no_ingredients` dit que le plat est vide. Les
 * confondre ferait chercher des alias pour un problème de prompt — la même
 * distinction que `unresolvedTerms` / `unweighedTerms` dans FF-038.
 */
export const ENERGY_GAPS = Object.freeze(
  ["unknown_ingredient", "missing_quantity", "no_ingredients"] as const,
);
export type EnergyGap = (typeof ENERGY_GAPS)[number];

// ---------------------------------------------------------------------------
// L17 — L'ABSTENTION SE PÈSE
// ---------------------------------------------------------------------------

/**
 * ══════════════════════════════════════════════════════════════════════════
 * CE QU'UN PLAT A LE DROIT DE LAISSER D'ÉNERGIE NON RÉSOLUE.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * « On s'abstient quand l'énergie NON RÉSOLUE dépasse une part de la cible
 * (~5 %). Jamais parce qu'un ingrédient manque. » Un terme que le référentiel
 * ne connaît pas mais dont le plan a écrit la quantité n'est pas une inconnue
 * sans borne: 12 g de quelque chose ne peut pas valoir 300 kcal, quoi que ce
 * soit. C'est cette borne-là — et elle seule — qui remplace l'abstention.
 *
 * ⛔ LE DÉNOMINATEUR EST LE **PLAT**, ET C'EST UN CHOIX MESURÉ. La phrase dit
 * « la cible », donc la journée; le plat est un dénominateur plus PETIT, donc
 * une règle plus STRICTE — l'erreur va vers l'abstention, la direction que ce
 * module choisit partout ailleurs. Les deux ont été mesurés le 2026-08-22 sur
 * les 182 plans en base: journée ⇒ 145/650 journées calculables, plat ⇒
 * 140/650. Les 5 journées d'écart ne valent pas de casser l'invariant
 * `complete === (kcal !== null)`, qu'une épreuve de ce dépôt tient au niveau du
 * PLAT: un plat qui porterait un chiffre que la journée refuserait ensuite
 * serait exactement le total qui fait semblant.
 *
 * ⚠️ CE QUE CETTE RÈGLE NE PEUT PAS RÉPARER, ÉCRIT ICI POUR QU'ON NE LE
 * REDÉCOUVRE PAS: un ingrédient **résolu mais NON PESÉ** (`missing_quantity`).
 * Le groupe borne une DENSITÉ, jamais une MASSE. « de l'huile d'olive », sans
 * quantité, vaut 9 kcal ou 900 selon ce que quelqu'un a versé, et aucune bande
 * ne le dit. Mesuré: 768 plats sur 1 885 sont bloqués par un non-pesé, et
 * **zéro** d'entre eux ne l'est par des termes tous à 0 kcal/100 g. C'est le
 * périmètre de `L-1-b` (lire la quantité écrite en prose), pas celui-ci.
 */
export const UNRESOLVED_ENERGY_TOLERANCE = 0.05;

/**
 * UN INGRÉDIENT DE PLAN, PLUS LE GROUPE QUE LE MODÈLE A DÉCLARÉ POUR LUI.
 *
 * ⛔ LA CLÉ S'APPELLE `group`, ET SEULEMENT `group` — pas `food_group_ref`, pas
 * `food_group`. C'est le nom du bloc de consigne, du parseur, de la ligne
 * persistée et de `INGREDIENT_GROUP_KEY` (`food_group_write.ts`). Un renommage
 * en chemin est la façon la plus sûre de perdre un champ: `ingredientPayload()`
 * a déjà jeté celui-ci pendant trois générations sans que personne ne compte.
 *
 * ⚠️ ET CE N'EST PAS `shopping_list[].food_group`, qui est **déduit** du
 * référentiel. Celui-ci est **déclaré** par le modèle, puis validé contre la
 * liste fermée. Deux provenances, deux noms.
 *
 * Le type est exactement celui de `fillRequestsFor` (lot 18): un
 * `CompositionInput` et un groupe facultatif. Facultatif parce qu'il l'est
 * VRAIMENT — la borne retombe alors sur le plafond absolu, elle ne disparaît
 * pas.
 */
export type EnergyIngredient = CompositionInput & { group?: FoodGroupRef | null };

/**
 * LES BANDES DE GROUPE, calculées UNE FOIS PAR INDEX.
 *
 * `groupBandsFrom` balaie les 923 lignes du référentiel; l'appeler par plat
 * coûterait 1 885 balayages pour un plan de corpus. La clé est l'index
 * lui-même — un index augmenté (`withFilledRefs`) est un AUTRE objet, donc il
 * obtient ses propres bandes, ce qui est le comportement voulu: on ne veut
 * jamais servir les bandes de l'index de base pour un index rempli.
 *
 * PURETÉ: un cache mémoïsé sur une entrée immuable ne rend jamais deux
 * réponses différentes pour la même entrée. Aucune horloge, aucun tirage.
 */
const BANDS_BY_INDEX = new WeakMap<
  CompositionIndex,
  ReadonlyMap<FoodGroupRef, GroupBand>
>();

function bandsOf(index: CompositionIndex): ReadonlyMap<FoodGroupRef, GroupBand> {
  const hit = BANDS_BY_INDEX.get(index);
  if (hit) return hit;
  const bands = groupBandsFrom(index);
  BANDS_BY_INDEX.set(index, bands);
  return bands;
}

/** Ce qu'un inconnu peut peser, au plus — et ce qu'on lui compte. */
interface UnknownBound {
  /** LE PIRE CAS. C'est lui, et lui seul, qui décide de l'abstention. */
  high: number;
  /** LE MILIEU DE LA BANDE. C'est lui qu'on additionne, et il est compté à part. */
  mid: number;
}

/**
 * LES GRAMMES MAXIMAUX PLAUSIBLES D'UNE LIGNE, quand l'aliment est inconnu.
 *
 * ⛔ ON NE RÉÉCRIT PAS LA FORMULE: on interroge `gramsRawOf` — celle de la
 * production — une fois par classe de rendement, et on garde le PLUS GRAND
 * résultat. Deux écritures d'une même conversion divergent, et c'est celle
 * qu'on regarde le moins qui garde l'ancienne valeur.
 *
 * ⚠️ POURQUOI LE MAXIMUM, ET PAS LA CLASSE DU GROUPE DÉCLARÉ. Un terme inconnu
 * n'a pas de classe de rendement: la deviner depuis le groupe ferait passer
 * une CONVENTION pour une mesure. Prendre le maximum garde la propriété qui
 * compte — c'est une BORNE, jamais une estimation.
 *
 * `null` quand rien n'est convertible (« 2 courgettes », une quantité écrite en
 * prose): une masse inconnue ne se borne pas, et le plat s'éteint comme avant.
 */
function boundGramsOf(ing: EnergyIngredient): number | null {
  let best: number | null = null;
  for (const yieldClass of YIELD_CLASSES) {
    const g = gramsRawOf({
      amount: ing.amount ?? null,
      unit: ing.unit ?? null,
      state: ing.state ?? null,
      yieldClass,
      unitGrams: ing.unitGrams ?? null,
    });
    if (g === null) continue;
    if (best === null || g > best) best = g;
  }
  return best;
}

/**
 * CE QU'UN TERME INCONNU PEUT PESER EN ÉNERGIE.
 *
 * Deux plafonds, et le groupe déclaré est ce qui fait passer de l'un à l'autre:
 *
 *   · groupe DÉCLARÉ et bande connue ⇒ `[p05, p95]` du groupe. C'est là que le
 *     lot gagne: `non_starchy_veg` plafonne à 108 kcal/100 g, `citrus` à 47 —
 *     contre 902 sans déclaration, soit un facteur 8 à 19.
 *   · sinon ⇒ `MAX_PLAUSIBLE_KCAL_PER_100G` (902), le plafond absolu d'une
 *     densité alimentaire. Le lot 18 l'a écrit pour exactement ce cas: « il
 *     reste alors une garde, au lieu d'aucune ».
 *
 * ⚠️ p95 ET PAS max, parce que c'est la bande que ce dépôt a choisie et
 * mesurée (`BAND_HIGH_PCT`). Une bande [min, max] « a l'air d'une garde et n'en
 * est pas une ».
 *
 * `null` = INBORNABLE, et l'appelant s'abstient.
 */
function boundOf(index: CompositionIndex, ing: EnergyIngredient): UnknownBound | null {
  const grams = boundGramsOf(ing);
  if (grams === null) return null;
  const band = ing.group == null ? undefined : bandsOf(index).get(ing.group);
  const high = band ? band.energyHigh : MAX_PLAUSIBLE_KCAL_PER_100G;
  const low = band ? band.energyLow : 0;
  return {
    high: (grams * high) / 100,
    mid: (grams * (low + high)) / 200,
  };
}

export interface DishEnergy {
  /**
   * L'ÉNERGIE D'UNE ASSIETTE, arrondie. `null` quand `complete` est faux.
   *
   * ⚠️ `null` ET PAS UNE SOMME PARTIELLE. Une somme amputée de l'huile a l'air
   * d'un résultat et vaut plusieurs dizaines de pour cent d'écart, toujours
   * dans le même sens. C'est la règle de `nutrientsOf`, tenue jusqu'à l'écran.
   */
  kcal: number | null;
  basis: PlanEnergyBasis;
  complete: boolean;
  /** Ce qui manque, quand `complete` est faux. Vide sinon. */
  gaps: EnergyGap[];
  /** Les termes que le référentiel n'a pas su lire. La worklist de curation. */
  unreadableTerms: string[];
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * L17 — LA PART DE `kcal` QUI VIENT D'UNE BORNE DE GROUPE, ET PAS D'UNE TABLE.
   * ══════════════════════════════════════════════════════════════════════════
   *
   * `0` dans le cas nominal, et c'est ce qu'il doit rester. Non nul = ce plat
   * porte un chiffre dont une part est une CONVENTION bornée, pas une mesure.
   *
   * ⛔ COMPTÉ À PART, JAMAIS FONDU DANS LE TOTAL SANS ÊTRE NOMMÉ. C'est le
   * cinquième seau `group_bounds` du lot 18, et sa raison est écrite là-bas:
   * fondre la borne dans le reste ferait passer « le référentiel ne connaît
   * plus rien » pour « le référentiel travaille » — un point de rupture qui
   * ressemble à un fonctionnement.
   *
   * ⚠️ IL EST DANS `kcal`. La borne n'est pas retirée du total: la retirer
   * rendrait une somme amputée, c'est-à-dire exactement le défaut que
   * l'abstention existe pour éviter. Elle est dans le total ET nommée.
   */
  boundedKcal: number;
  /** Les termes inconnus que leur borne a fait admettre. Vide dans le cas nominal. */
  boundedTerms: string[];
}

export interface DayEnergy {
  /** Jeton `mon`..`sun`, ou `null` pour un plat sans jour. */
  day: string | null;
  /**
   * LA SOMME DES PLATS CALCULABLES DE CE JOUR.
   *
   * ⚠️ Elle est rendue MÊME quand `complete` est faux, et c'est le §8 de la
   * fiche mot pour mot: « ce plat n'affiche pas de chiffre / ET le total du
   * jour dit qu'il est incomplet ». Ce qui rend ça honnête plutôt que trompeur
   * est le couple `dishesCounted` / `dishesTotal`, qui n'est pas décoratif:
   * c'est lui que la copie doit rendre, pas seulement le mot « incomplet ».
   *
   * `null` quand AUCUN plat du jour n'est calculable — un « 0 kcal » se lirait
   * « cette journée ne nourrit pas », le sens exactement inverse.
   */
  kcal: number | null;
  basis: PlanEnergyBasis;
  complete: boolean;
  dishesCounted: number;
  dishesTotal: number;
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * L8 ③ — COMBIEN DE REPAS DE CE JOUR ÉCHAPPENT AU PLAN.
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Les cases où CETTE bouche mange dehors (`presenceStateFor` ⇒ `eating_out`).
   * `0` = le plan a composé toute sa journée, le cas nominal.
   *
   * ⛔ POURQUOI CE CHAMP EXISTE, ET CE QU'IL CORRIGE. Si un repas sur trois est
   * pris dehors, « ta journée : 1 400 · ta fourchette : 1 900–2 200 » est FAUX,
   * et faux dans le sens qui décourage: la personne lit un déficit alors qu'elle
   * a peut-être mangé un burger. Le nombre ne change pas de VALEUR — il change
   * de SUJET. Il ne parle plus de la journée mais de ce que le plan a produit,
   * et il le dit: « sur les 2 repas que j'ai composés ».
   *
   * ⚠️ ET C'EST POURQUOI IL EST ICI ET PAS À L'ÉCRAN. `dishesCounted` /
   * `dishesTotal` disent déjà « je n'ai pas su lire tous les plats »; ce champ-ci
   * dit « il manquait des plats à lire ». Les deux incomplétudes ne se réparent
   * pas au même endroit (l'une par le référentiel, l'autre par personne — c'est
   * la vie de quelqu'un), et un écran qui n'en verrait qu'une nommerait la
   * mauvaise.
   */
  mealsOut: number;
  /**
   * DE QUOI CE NOMBRE PARLE. Nommé, jamais dérivé à l'écran: deux surfaces qui
   * calculeraient `mealsOut > 0` finiraient par ne plus dire la même chose du
   * même jour.
   *
   *   `the_day`         — la journée entière. `mealsOut === 0`.
   *   `what_the_plan_made` — ce que le plan a composé, et rien d'autre.
   */
  subject: "the_day" | "what_the_plan_made";
  /**
   * FF-059 — CE QUI S'AJOUTE À L'ASSIETTE DE CETTE BOUCHE, ce jour-là.
   *
   * `0` dans le cas nominal (plan personnel, ou bouche dont le besoin EST le
   * tronc). Non nul dans un foyer où les portions divergent — et c'est très
   * exactement la bifurcation par objectif, enfin lisible en nombre.
   *
   * ⚠️ IL EST DANS `kcal`, et il est aussi rendu À PART. L'écran doit pouvoir
   * dire « le plat, plus ce qui va dans ton assiette », parce qu'un total qui
   * fond les deux ferait croire que le plat est plus gros qu'il n'est — et deux
   * personnes autour de la même casserole liraient deux chiffres pour le même
   * plat sans que rien n'explique pourquoi.
   */
  addonKcal: number;
  /**
   * L17 — LA PART DE `kcal` DE CETTE JOURNÉE QUI VIENT D'UNE BORNE DE GROUPE.
   *
   * La somme des `DishEnergy.boundedKcal` des plats COMPTÉS du jour. `0` dans
   * le cas nominal. C'est le compteur qui dit si le lot a mordu, et il est
   * rendu à côté du total — jamais dedans sans nom. Voir `DishEnergy.boundedKcal`.
   */
  boundedKcal: number;
}

export interface PlanEnergy {
  basis: PlanEnergyBasis;
  /** Un par plat, dans l'ordre d'entrée. Les index se correspondent. */
  dishes: DishEnergy[];
  /** Un par jour rencontré, dans l'ordre de première apparition. */
  days: DayEnergy[];
}

// ---------------------------------------------------------------------------
// L'ENTRÉE
// ---------------------------------------------------------------------------

/** Un plat, réduit à ce dont le calcul a besoin. */
export interface EnergyDish {
  day: string | null;
  method: string;
  ingredients: readonly EnergyIngredient[];
  /** Ce que ce plat prélève sur des préparations déjà faites (FF-038). */
  uses: readonly { preparationId: string; servings: number }[];
}

export interface EnergyPreparation {
  id: string;
  servingsMade: number;
  ingredients: readonly EnergyIngredient[];
}

// ---------------------------------------------------------------------------
// LE CALCUL
// ---------------------------------------------------------------------------

function emptyDish(gap: EnergyGap, unreadableTerms: string[] = []): DishEnergy {
  return {
    kcal: null,
    basis: PLAN_ENERGY_BASIS,
    complete: false,
    gaps: [gap],
    unreadableTerms,
    boundedKcal: 0,
    boundedTerms: [],
  };
}

/**
 * L'énergie d'UN plat, préparations déjà pliées dedans.
 *
 * ── LA COMPLÉTUDE EST BINAIRE, ET PLUS STRICTE QUE CELLE DU VERDICT ────────
 * FF-039 s'abstient sous 80 % de résolution, parce qu'il rend une DIRECTION
 * (`within` / `above` / `below`) et qu'une direction survit à une marge. Ici on
 * rend un NOMBRE que quelqu'un va lire comme sa journée: la moindre lacune le
 * rend faux, et faux dans une direction (toujours vers le bas, puisqu'un
 * ingrédient manquant ne retire jamais d'énergie).
 *
 * ⟳ L17 — LE SEUIL N'EST PLUS 100 % SUR LES TERMES INCONNUS. Un terme que le
 * référentiel ne lit pas mais dont le plan a écrit la quantité est BORNÉ par
 * son groupe (ou, à défaut de groupe déclaré, par le plafond absolu d'une
 * densité alimentaire): si tout ce qu'il peut peser tient sous
 * `UNRESOLVED_ENERGY_TOLERANCE` du plat, il ne l'éteint plus, et sa part est
 * comptée à part dans `boundedKcal`. Le seuil reste 100 % sur
 * `unweighedTerms` — une MASSE inconnue n'a pas de borne.
 *
 * `coverage` de FF-038 n'est PAS lu ici: il compte les termes connus, pesés ou
 * non, ce qui est la bonne question pour une porte de verdict et la mauvaise
 * pour une somme.
 */
export function dishEnergy(
  index: CompositionIndex,
  dish: { method: string; ingredients: readonly EnergyIngredient[] },
): DishEnergy {
  return dishEnergyAtTolerance(index, dish, UNRESOLVED_ENERGY_TOLERANCE);
}

/**
 * LA MÊME CHOSE, AVEC LA TOLÉRANCE ÉCRITE EN TOUTES LETTRES.
 *
 * ⛔ ELLE N'EXISTE PAS POUR LA PRODUCTION — `dishEnergy` est le seul chemin, et
 * il ne prend aucun paramètre facultatif: une garde qu'un appelant peut oublier
 * de passer est une garde désarmée, et ce dépôt le paie en boucle.
 *
 * Elle existe pour qu'on puisse MUTER LE SEUIL et mesurer ce que ça change.
 * `tolerance = 0` doit reproduire, au plat près, le comportement d'avant ce
 * lot: c'est la seule preuve qu'un gain vient bien de la borne et pas d'un
 * autre changement arrivé le même jour.
 */
export function dishEnergyAtTolerance(
  index: CompositionIndex,
  dish: { method: string; ingredients: readonly EnergyIngredient[] },
  tolerance: number,
): DishEnergy {
  const named = dish.ingredients.filter((i) => String(i?.term ?? "").trim() !== "");
  if (named.length === 0) return emptyDish("no_ingredients");

  const r = resolveIngredients(index, named);

  // ── ① LES TERMES INCONNUS — bornés, ou l'abstention d'avant ─────────────
  let boundHigh = 0;
  let boundMid = 0;
  const boundedTerms: string[] = [];
  if (r.unresolvedTerms.length > 0) {
    for (const ing of named) {
      // LE MÊME PRÉDICAT QUE `resolveIngredients`, appelé sur la même fonction:
      // rejouer « ce terme est-il connu ? » à la main ferait deux réponses le
      // jour où le résolveur change.
      if (resolveIngredient(index, ing.term) !== null) continue;
      const b = boundOf(index, ing);
      // ⛔ UN SEUL INBORNABLE ÉTEINT LE PLAT. Ignorer celui-là et borner les
      // autres rendrait une somme amputée qui a l'air d'un résultat — le mode
      // de défaillance que ce module existe pour ne pas produire.
      if (b === null) return emptyDish("unknown_ingredient", [...r.unresolvedTerms].sort());
      boundHigh += b.high;
      boundMid += b.mid;
      boundedTerms.push(normalizeTerm(ing.term));
    }
  }

  // ── ② LES TERMES NON PESÉS — inchangé, et c'est délibéré ────────────────
  // Le groupe borne une densité, pas une masse. « de l'huile d'olive » sans
  // quantité vaut 9 kcal ou 900 selon ce que quelqu'un a versé.
  if (r.unweighedTerms.length > 0) {
    return emptyDish("missing_quantity", [...r.unweighedTerms].sort());
  }
  if (r.resolved.length === 0) return emptyDish("no_ingredients");

  const n: NutrientsOrUnknown = nutrientsOf(r.resolved, {
    // L'imputation d'huile de friture (12 % du poids cuit) est une CONVENTION
    // avouée de FF-038. On la garde: sans elle un beignet se compte comme le
    // même plat à la vapeur, ce qui est l'erreur de sens que ce chantier
    // existe pour ne pas commettre.
    friedMethod: isFriedMethod(dish.method),
  });
  if (n === "unknown") return emptyDish("no_ingredients");

  // ── ③ LA PESÉE DE L'ABSTENTION ─────────────────────────────────────────
  // Le pire cas de l'inconnu contre le total que le plat porterait avec lui.
  // `>` et pas `>=`: à tolérance 0, un plat SANS inconnu (`boundHigh === 0`)
  // doit rester calculable — sinon la mutation du seuil éteindrait tout le
  // corpus et ne mesurerait plus rien.
  if (boundHigh > tolerance * (n.energyKcal + boundHigh)) {
    return emptyDish("unknown_ingredient", [...r.unresolvedTerms].sort());
  }

  const bounded = Math.round(boundMid);
  return {
    kcal: n.energyKcal + bounded,
    basis: PLAN_ENERGY_BASIS,
    complete: true,
    gaps: [],
    unreadableTerms: [],
    boundedKcal: bounded,
    boundedTerms: boundedTerms.sort(),
  };
}

// ---------------------------------------------------------------------------
// FF-059 — L'ADD-ON D'UNE BOUCHE, dans un foyer
// ---------------------------------------------------------------------------

/**
 * UN ADD-ON, tel que `generated_from.household.member_deltas` le porte.
 *
 * Un slug de `food_composition_refs` et des grammes CRUS. Pas de prose, pas de
 * raison, pas d'objectif — c'est le contrat de `memberDeltasPayload`, et c'est
 * ce qui rend cet objet lisible sans rien révéler du corps de personne.
 */
export interface MemberAddon {
  foodRef: string;
  grams: number;
}

/**
 * CE QUI S'AJOUTE À L'ASSIETTE D'UNE BOUCHE, PAR JOUR.
 *
 * ── POURQUOI C'EST UNE GRANDEUR DE JOUR ET PAS DE PLAT ─────────────────────
 * Le delta de FF-043 comble un écart QUOTIDIEN — `m.envelope.energy.low -
 * trunk.energy.low`, deux bandes journalières. Il n'est attaché à aucun plat, et
 * l'attacher à un plat au hasard inventerait un rattachement que le moteur n'a
 * jamais fait.
 *
 * ⚠️ ── LES DENSITÉS DU CATALOGUE NE SERVENT PAS ICI ─────────────────────────
 * `DELTA_CATALOGUE` porte des `kcalPer100g` que son propre commentaire déclare
 * bons « à DIMENSIONNER un ajout, jamais à afficher un chiffre ». On repasse
 * donc par le référentiel, comme pour n'importe quel ingrédient — sinon
 * l'add-on serait le seul nombre de l'écran calculé sur un ordre de grandeur.
 *
 * `complete: false` dès qu'un `food_ref` n'est pas résolvable: le total du jour
 * dira alors qu'il lui manque quelque chose, au lieu de compter l'add-on à
 * zéro et de rendre une journée qui a l'air maigre.
 */
export function memberAddonEnergy(
  index: CompositionIndex,
  addons: readonly MemberAddon[],
): DishEnergy {
  if (addons.length === 0) {
    // AUCUN ADD-ON EST UN RÉSULTAT, PAS UNE ABSENCE. Le tronc est dimensionné
    // sur le MIN de toutes les bouches: celle qui a le plus petit besoin n'a
    // rien à ajouter, et sa journée est COMPLÈTE à zéro. Rendre `null` ici
    // ferait dire « incomplet » à la seule personne dont l'assiette est
    // exactement le plat.
    return {
      kcal: 0,
      basis: PLAN_ENERGY_BASIS,
      complete: true,
      gaps: [],
      unreadableTerms: [],
      boundedKcal: 0,
      boundedTerms: [],
    };
  }
  return dishEnergy(index, {
    // Aucune méthode: un add-on n'est pas cuisiné, il est ajouté. Passer une
    // méthode de plat ici lui imputerait l'huile de friture du plat.
    method: "",
    ingredients: addons.map((a) => ({
      term: a.foodRef,
      amount: a.grams,
      unit: "g" as const,
      // Les grammes du delta sont CRUS — `DELTA_CATALOGUE` les dimensionne sur
      // des `kcalPer100g` « pour 100 g CRUS ». Sans ce `state`, le riz (×2,6)
      // s'abstiendrait.
      state: "raw" as const,
    })),
  });
}

/**
 * L'énergie d'un plan entier — par plat, puis par jour.
 *
 * @param servings LE NOMBRE DE BOUCHES QUE LES QUANTITÉS COUVRENT.
 *
 *   Le contrat du générateur est explicite (« A PORTION IS ONE PERSON'S
 *   PLATE »): toute quantité écrite est pour le nombre de personnes à table.
 *   Diviser est donc obligatoire, pas cosmétique — sur un plan de foyer à
 *   quatre, ne pas diviser rendrait un chiffre quatre fois trop grand, et il
 *   aurait l'air d'un chiffre.
 *
 *   REQUIS, jamais optionnel, et un `servings` non entier ≥ 1 LÈVE. Un défaut à
 *   1 serait la version désarmée de ce paramètre: elle ne casserait aucun
 *   appelant existant et rendrait le mauvais nombre au premier foyer.
 */
export function planEnergy(args: {
  index: CompositionIndex;
  dishes: readonly EnergyDish[];
  preparations: readonly EnergyPreparation[];
  servings: number;
  /**
   * FF-059 — LES ADD-ONS DE **CETTE** BOUCHE, par jour.
   *
   * REQUIS, jamais optionnel, et `[]` est une valeur pleine qui veut dire
   * « rien à ajouter » — pas « on ne sait pas ». Un plan personnel passe `[]`;
   * un foyer passe les deltas du lecteur, et personne d'autre.
   *
   * ⚠️ CEUX DU LECTEUR, ET D'EUX SEULS. Un add-on est dimensionné sur le corps
   * et l'objectif de quelqu'un: rendre ceux des autres bouches ferait lire à
   * table, en kcal, le déficit de sa mère. « Ce qui touche le corps est à soi »
   * est déjà la règle du domaine, et c'est ici qu'elle se tient.
   */
  addons: readonly MemberAddon[];
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * L8 ③ — LES REPAS QUE **CE LECTEUR** PREND DEHORS, par jour.
   * ══════════════════════════════════════════════════════════════════════════
   *
   * `{ mon: 1 }` = un midi hors du plan le lundi. Un jour absent de la table
   * vaut zéro. Le jeton de jour est le même que `EnergyDish.day` — `null` inclus,
   * pour un plat sans jour.
   *
   * ⚠️ REQUIS, JAMAIS OPTIONNEL, et `new Map()` est une valeur PLEINE qui veut
   * dire « cette personne mange tous ses repas ici » — pas « on ne sait pas ».
   * Un `?` aurait laissé les appelants continuer d'annoncer une JOURNÉE là où le
   * plan n'a fait que deux repas sur trois, sans qu'aucun compilateur ne les
   * recense. C'est la cicatrice `optional-gate-params-are-disarmed-gates`, et
   * elle a déjà coûté `servings` et `addons` dans cette même signature.
   *
   * ⚠️ CEUX DU LECTEUR, ET D'EUX SEULS — même règle qu'`addons` juste au-dessus.
   * Le jeudi midi de sa mère ne change pas ce que SON assiette a reçu.
   */
  mealsOutByDay: ReadonlyMap<string | null, number>;
}): PlanEnergy {
  return planEnergyAtTolerance(args, UNRESOLVED_ENERGY_TOLERANCE);
}

/**
 * LE PLAN ENTIER, AVEC LA TOLÉRANCE ÉCRITE EN TOUTES LETTRES.
 *
 * Même raison que `dishEnergyAtTolerance`, à l'échelle d'un corpus: c'est ce
 * qui permet de rejouer les 182 plans en base à `0` et à
 * `UNRESOLVED_ENERGY_TOLERANCE`, et de montrer que le taux RETOMBE. Un gain
 * qu'on ne sait pas faire disparaître n'est pas attribué, il est raconté.
 */
export function planEnergyAtTolerance(
  args: {
    index: CompositionIndex;
    dishes: readonly EnergyDish[];
    preparations: readonly EnergyPreparation[];
    servings: number;
    addons: readonly MemberAddon[];
    mealsOutByDay: ReadonlyMap<string | null, number>;
  },
  tolerance: number,
): PlanEnergy {
  const { index, dishes, preparations, servings } = args;
  if (!Number.isInteger(servings) || servings < 1) {
    throw new Error(
      `[keel/plan_energy] servings must be an integer >= 1, got ${JSON.stringify(servings)}`,
    );
  }
  if (!Array.isArray(args.addons)) {
    throw new Error("[keel/plan_energy] addons is required (pass [] for none)");
  }
  if (!(args.mealsOutByDay instanceof Map)) {
    throw new Error(
      "[keel/plan_energy] mealsOutByDay is required (pass an empty Map for none)",
    );
  }
  const addon = memberAddonEnergy(index, args.addons);

  // LE PLIAGE D'ABORD. En cuisine en lot, 41 % de l'énergie et 51 % de la
  // protéine vivent dans les préparations, pas dans les plats (mesuré le
  // 2026-08-12 sur 80 générations). Un calcul qui ne lirait que
  // `dish.ingredients` rendrait un chiffre amputé de moitié — avec sa base, sa
  // complétude à `true`, et l'air parfaitement juste.
  const folded = foldPreparationsIntoDishes({
    dishes: dishes.map((d) => ({
      slot: null,
      method: d.method,
      ingredients: d.ingredients,
      uses: d.uses,
    })),
    preparations: preparations.map((p) => ({
      id: p.id,
      servingsMade: p.servingsMade,
      ingredients: p.ingredients,
    })),
  });

  const perDish = folded.map((f) => {
    const e = dishEnergyAtTolerance(
      index,
      { method: f.method, ingredients: f.ingredients },
      tolerance,
    );
    if (e.kcal === null) return e;
    // La division par `servings` se fait ICI, sur le plat déjà plié: elle porte
    // donc aussi la part de préparation, qui est écrite pour la table elle
    // aussi.
    //
    // ⚠️ `boundedKcal` SE DIVISE AUSSI, et pour la même raison: il est DANS
    // `kcal`. Le laisser entier ferait dire à un foyer de quatre que la borne
    // vaut quatre fois ce qu'elle vaut dans l'assiette — et le seul compteur
    // qui dit si ce lot a mordu deviendrait faux.
    return {
      ...e,
      kcal: Math.round(e.kcal / servings),
      boundedKcal: Math.round(e.boundedKcal / servings),
    };
  });

  // ── LES JOURS, DANS L'ORDRE DE PREMIÈRE APPARITION ──────────────────────
  // Pas triés par jeton: un plan « jeu → ven → sam » se lirait « ven → jeu →
  // sam » avec un tri alphabétique, et un plan sans jour (`null`) n'aurait pas
  // de place dans l'ordre de la semaine. L'ordre d'entrée est celui que
  // l'écran affiche déjà.
  const order: (string | null)[] = [];
  const byDay = new Map<string | null, DayEnergy>();
  for (const [i, dish] of dishes.entries()) {
    const day = dish.day;
    let entry = byDay.get(day);
    if (!entry) {
      entry = {
        day,
        kcal: null,
        basis: PLAN_ENERGY_BASIS,
        complete: true,
        dishesCounted: 0,
        dishesTotal: 0,
        mealsOut: 0,
        subject: "the_day",
        addonKcal: 0,
        boundedKcal: 0,
      };
      byDay.set(day, entry);
      order.push(day);
    }
    entry.dishesTotal++;
    const e = perDish[i];
    if (e.complete && e.kcal !== null) {
      entry.kcal = (entry.kcal ?? 0) + e.kcal;
      entry.boundedKcal += e.boundedKcal;
      entry.dishesCounted++;
    } else {
      entry.complete = false;
    }
  }

  // ── L'ADD-ON S'AJOUTE AU JOUR, PAS AU PLAT ──────────────────────────────
  // Le delta comble un écart QUOTIDIEN et n'est attaché à aucun plat. Le
  // rattacher à l'un d'eux inventerait un lien que le moteur n'a jamais fait —
  // et ferait lire deux chiffres différents pour la même casserole à deux
  // personnes assises côte à côte.
  //
  // ⚠️ SUR UN JOUR DONT AUCUN PLAT N'EST LISIBLE, IL NE FABRIQUE PAS UN TOTAL.
  // `kcal` reste `null`: « 180 kcal » sur une journée dont on n'a su lire aucun
  // repas serait le total qui fait semblant, dans sa version la plus trompeuse.
  for (const entry of byDay.values()) {
    entry.addonKcal = addon.kcal ?? 0;
    if (!addon.complete) entry.complete = false;
    if (entry.kcal !== null && addon.kcal !== null) entry.kcal += addon.kcal;
    // ── L8 ③ · LE SUJET DU NOMBRE ─────────────────────────────────────────
    // ⚠️ IL NE TOUCHE NI `kcal`, NI `complete`, NI `dishesCounted`. Un repas
    // pris dehors n'est pas un plat qu'on n'a pas su lire: le total du plan
    // reste exact sur ce qu'il couvre, et `complete` continue de parler de la
    // LECTURE. Les confondre ferait dire « journée illisible » à un plan
    // parfaitement lisible, et le seul geste qu'on proposerait alors — curer le
    // référentiel — ne réparerait rien.
    const out = Math.max(0, Math.round(Number(args.mealsOutByDay.get(entry.day) ?? 0)));
    entry.mealsOut = Number.isFinite(out) ? out : 0;
    entry.subject = entry.mealsOut > 0 ? "what_the_plan_made" : "the_day";
  }

  return {
    basis: PLAN_ENERGY_BASIS,
    dishes: perDish,
    days: order.map((d) => byDay.get(d)!),
  };
}
