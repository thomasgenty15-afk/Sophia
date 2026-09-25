// ═══════════════════════════════════════════════════════════════════════════
// LA PART D'UNE PERSONNE — L'APPLICATION ET LA MESURE FINALE
// ═══════════════════════════════════════════════════════════════════════════
//
// ⟳ 2026-09-24 — sorti tel quel de `portion_sizing.ts` (découpage des gros
// fichiers, lot 2e). Aucune logique changée. `portion_sizing.ts` ré-exporte
// tout ce qui est exporté ici : les appelants continuent d'importer depuis lui.
// Ce module n'importe jamais `portion_sizing.ts`.
//
// Ce qui est ici : ⑥ l'application (`applySizing`, `applySizingForEaters`,
// la part de recette) et ⑥ bis la mesure finale (`finalPortionCheck`).
// `potFactorOf` est parti dans `portion_sizing_core.ts`.

import {
  type CompositionIndex,
  millilitresOfSlug,
} from "./food_composition.ts";
import {
  measurePreparation,
  type WaterTreatment,
  WATER_TREATMENTS,
} from "./preparation_mass.ts";
// ⟳ 2026-09-11 · LOT B — LA MESURE FINALE LIT LES CONTENANTS ÉCRITS, et c'est
// `boxNutrition` qui les lit (items × densité de casserole, protéine comprise).
// Aucun second lecteur: `finalPortionCheck` ne fait qu'y attacher un verdict.
import { type BoxedMouthEnergyDish, boxNutrition } from "./mouth_energy.ts";
import type { EnergyPreparation } from "./plan_energy.ts";
import { weighedReadyGrams } from "./box_densify.ts";
import { ANCHOR_REASONS, type AnchorReason } from "./mouth_anchor.ts";
import type { PlateBounds } from "./portion_plate_bounds.ts";
import type { FoodGroupRef } from "./tokens.ts";
import {
  lidPlanFor,
  potFactorOf,
  SIZING_VERDICTS,
  type SizingVerdict,
  UNMEASURABLE_PORTION_FACTOR,
} from "./portion_sizing_core.ts";

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ L'APPLICATION — lot 4
// ═══════════════════════════════════════════════════════════════════════════

/** Ce que `applySizing` a fait, compté. Toutes les clés, même à zéro. */
export interface ApplyCounts {
  boxes_authored: number;
  /** Plats sans facteur mesurable: la recette part telle quelle, aucune boîte. */
  dishes_unsized: number;
  fresh_scaled: number;
  /** Ingrédient frais dont la quantité n'est qu'en prose: pas d'item de boîte. */
  fresh_unweighed: number;
  pots_scaled: number;
  pots_unreadable: number;
  servings_rewritten: number;
  /** Items écartés parce que le référentiel ne les résout pas. */
  items_unresolved: number;
  /** ⟳ LOT 12 — les couvercles à UN nom (objectif de poids, ou seul mangeur). */
  own_authored: number;
  /** ⟳ LOT 12 — les bacs partagés. Leur total est la SOMME des parts. */
  tubs_authored: number;
  /** ⟳ LOT 12 — les mangeurs non dimensionnés sur un plat pourtant mesuré. */
  eaters_unsized: number;
  /**
   * ⟳ 2026-09-13 · LOT 1 — les mangeurs servis à la PART DE RECETTE.
   *
   * ⛔ LE DÉNOMINATEUR DE `recipe_shares_by`. Un `{}` seul se lit « rien à
   * signaler »; ce nombre dit si la ventilation est vide parce qu'il n'y a rien
   * eu, ou parce que personne ne l'a remplie.
   */
  recipe_shares: number;
  /** ⟳ LOT 1 — la même population, ventilée par motif d'abstention. */
  recipe_shares_by: Record<string, number>;
  /**
   * ⟳ 2026-09-25 — LES MIETTES QUE LE FACTEUR FABRIQUE: items de boîte frais
   * (fruit, légume) que la recette écrite portait à `FRESH_ITEM_CRUMB_BELOW_G`
   * ou plus, et que la part a fait passer dessous (zéro compris). Compté,
   * jamais corrigé ici.
   */
  fresh_crumbs: number;
}

export function applyCounts(): ApplyCounts {
  return {
    boxes_authored: 0,
    dishes_unsized: 0,
    fresh_scaled: 0,
    fresh_unweighed: 0,
    pots_scaled: 0,
    pots_unreadable: 0,
    servings_rewritten: 0,
    items_unresolved: 0,
    own_authored: 0,
    tubs_authored: 0,
    eaters_unsized: 0,
    recipe_shares: 0,
    recipe_shares_by: {},
    fresh_crumbs: 0,
  };
}

/**
 * ⟳ 2026-09-25 — LE MINIMUM NOMMÉ D'UN ÉLÉMENT FRAIS SERVI.
 *
 * ── LE DÉFAUT, MESURÉ ─────────────────────────────────────────────────────
 * Banc des trois foyers, plan A: « pomme 15 g » et « tomate 23 g » dans les
 * boîtes de Camille — des fruits et légumes que la recette écrivait bien
 * plus lourds, rognés par le facteur de sa part.
 *
 * ── CE QUE CE SEUIL FAIT, ET NE FAIT PAS ──────────────────────────────────
 * Il COMPTE (`ApplyCounts.fresh_crumbs`), il ne refuse ni ne corrige rien:
 * on mesure combien il en reste avant d'écrire une règle de produit. Ce que
 * le modèle écrit déjà petit (2 g de coriandre, un filet de citron vert)
 * n'est pas une miette du moteur, et n'est pas compté.
 */
export const FRESH_ITEM_CRUMB_BELOW_G = 30;

/** Les groupes d'un élément frais: fruits et légumes. */
const FRESH_CRUMB_GROUPS: ReadonlySet<FoodGroupRef> = new Set<FoodGroupRef>([
  "berries",
  "citrus",
  "other_fruit",
  "leafy_greens",
  "cruciferous_veg",
  "non_starchy_veg",
]);

/**
 * `true` quand le facteur a fait d'un élément frais une miette: écrit à
 * `FRESH_ITEM_CRUMB_BELOW_G` ou plus, servi en dessous.
 */
function isShrunkCrumb(
  index: CompositionIndex,
  ing: ScalableIngredient,
  writtenG: number,
  servedG: number,
): boolean {
  if (!(writtenG >= FRESH_ITEM_CRUMB_BELOW_G) || !(servedG < FRESH_ITEM_CRUMB_BELOW_G)) {
    return false;
  }
  const slug = typeof ing.ref === "string" ? ing.ref : "";
  const group = slug === "" ? undefined : index.bySlug.get(slug)?.foodGroupRef;
  return group !== undefined && FRESH_CRUMB_GROUPS.has(group);
}
/**
 * ⟳ LOT A (2026-09-11) — L'ITEM DE CONTENANT QUE LE MOTEUR ÉCRIT.
 *
 * ⚠️ DÉCLARÉ ICI ET PAS IMPORTÉ DE `meal_generation.ts` (`BoxItem`): ce module
 * est pur et ne dépend pas du parseur. La forme est structurellement celle de
 * `BoxItem`, et le typecheck du handler le prouve à chaque affectation.
 */
interface SizedBoxItem {
  preparationId: string | null;
  term: string;
  grams: number;
  ref: string | null;
  refRefused: boolean;
  /**
   * ⟳ 2026-09-22 — CES GRAMMES-LÀ EN MILLILITRES, quand l'aliment se VERSE.
   * Voir `BoxItem.ml` (`meal_generation.ts`): calculé ici, là où l'identifiant
   * de la ligne est sous la main, jamais retrouvé plus tard par le libellé.
   */
  ml: number | null;
}

interface ScalableIngredient {
  term: string;
  quantity?: string | null;
  amount?: number | null;
  unit?: string | null;
  state?: string | null;
  gramsRaw?: number | null;
  /**
   * ⟳ LOT A (2026-09-11) — NOMMÉS malgré l'index de signature ci-dessous, parce
   * que `itemsAt` les RECOPIE dans l'item de contenant qu'il écrit. Sous
   * `[k: string]: unknown` ils se liraient `unknown`, et le lot deviendrait un
   * `as` sur un type étranger — la cicatrice `as-cast-on-foreign-type-disarms-
   * typecheck`, mot pour mot.
   */
  ref?: string | null;
  refRefused?: boolean;
  [k: string]: unknown;
}

/**
 * ⚠️ SEUL `amount` EST MIS À L'ÉCHELLE — jamais la prose, jamais `gramsRaw`.
 *   · la PROSE (`quantity`) n'est lue qu'en dernier recours par
 *     `resolveIngredients`, et « 1 pincée de sel » ne se multiplie pas;
 *   · `gramsRaw` est un CACHE que `regramMeal` recalcule depuis `amount` juste
 *     après. Le toucher ici ferait deux sources pour un seul nombre, et c'est
 *     celle qu'on regarde le moins qui garderait l'ancienne.
 */
function scaleIngredients<T extends ScalableIngredient>(
  ingredients: readonly T[],
  factor: number,
): { out: T[]; scaled: number; unweighed: number } {
  let scaled = 0;
  let unweighed = 0;
  const out = ingredients.map((ing) => {
    if (
      typeof ing.amount === "number" && Number.isFinite(ing.amount) &&
      ing.amount > 0
    ) {
      scaled++;
      return { ...ing, amount: ing.amount * factor };
    }
    unweighed++;
    return { ...ing };
  });
  return { out, scaled, unweighed };
}

/** La masse SERVIE d'un seul ingrédient, par l'arithmétique du moteur. */
function readyGramsOfOne(
  index: CompositionIndex,
  ing: ScalableIngredient,
): number | null {
  const g = weighedReadyGrams([ing as never], index);
  return g === null || !(g > 0) ? null : g;
}

export interface SizingRowForApply {
  /** L'index du plat dans `meal.dishes`. */
  dishIndex: number;
  factor: number;
  /**
   * `false` quand CE couple (plat, bouche) n'a pas pu être dimensionné.
   *
   * ⚠️ IL NE DIT PAS QUI S'EST TU. `sizeDishForMouth` rend `unmeasurable` aussi
   * bien quand l'énergie du PLAT manque que quand la CIBLE de la bouche manque;
   * c'est `recipeShare` qui sépare les deux.
   */
  sized: boolean;
  /**
   * ⟳ 2026-09-13 · LOT 2 — LE MOTIF QUI OUVRE LA PART DE RECETTE, à UNE bouche.
   *
   * ⛔ LE MÊME CHAMP, LA MÊME RÈGLE ET LE MÊME VOCABULAIRE QU'À N BOUCHES
   * (`EaterRowForApply.recipeShare`, lot 1). Les deux chemins ont été écrits
   * séparément une fois; c'est exactement ce qui a laissé `applySizing` derrière
   * pendant un lot entier, alors que le défaut est le même des deux côtés.
   *
   * `null` sur une ligne dimensionnée, et `null` aussi quand le PLAT lui-même
   * n'est pas mesurable: là il n'y a rien de lisible à mettre dans un contenant,
   * et le plat repart sans boîte comme avant — le refus reste légitime.
   *
   * ⛔ REQUIS ET NULLABLE, JAMAIS `?`. Un champ facultatif reprendrait par défaut
   * le comportement d'AVANT ce lot — la seule assiette du titulaire perdue — et
   * ce dépôt paie en boucle les gardes qu'un paramètre facultatif désarme.
   */
  recipeShare: RecipeShareReason | null;
  /**
   * ⟳ 2026-09-23 — LE FÉCULENT À CÔTÉ, À **UNE** BOUCHE (lot 2 de l'audit,
   * arbitrage 5).
   *
   * ⛔ LE MÊME CHAMP ET LA MÊME RÈGLE QU'À N BOUCHES (`EaterRowForApply.starchSide`,
   * lue par `partFactorOf`): la casserole-féculent suit `sideFactor`, le frais
   * du plat et les autres casseroles suivent `mainFactor`. Avant ce champ, la
   * forme d'objectif (part d'énergie du féculent plafonnée en perte) ne
   * pouvait pas atteindre une personne seule: `applySizing` n'avait qu'UN
   * facteur par plat.
   *
   * ⛔ REQUIS ET NULLABLE, JAMAIS `?` — même raison que `recipeShare`. `null` =
   * un seul facteur pour tout le plat, le cas de tout plat d'avant ce lot.
   */
  starchSide: StarchSideServing | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-13 · LOT 1 — LA PART DE RECETTE, ET POURQUOI ELLE EST SERVIE
// ═══════════════════════════════════════════════════════════════════════════
//
// ── LE DÉFAUT QUE CE BLOC FERME, MESURÉ ────────────────────────────────────
// Foyer de quatre, une bouche sans date de naissance (`age_state = unknown`).
// `dayTargetFor` s'abstient — « je ne sais pas » n'est pas « c'est un adulte »
// —, donc sa cible de moment est `null`, donc `sizeDishForMouth` rend
// `unmeasurable`, donc `applySizingForEaters` la RETIRAIT de `lidPlanFor`:
// aucun contenant ne portait son nom. Le plat était pourtant multiplié POUR
// ELLE (`dishSum` compte une ligne non dimensionnée à
// `UNMEASURABLE_PORTION_FACTOR`), et la nourriture était achetée et cuisinée.
// Le refus final `mouth_unfed:not_named` tombait sur ses six cases, et il
// emportait LE PLAN ENTIER DES QUATRE BOUCHES. Tir `perte-l1age` du
// 2026-09-13: `lids.own_expected: 24` contre `apply.own_authored: 18`.
//
// ⛔ CE QUI EST SERVI N'EST PAS UNE CIBLE INVENTÉE. C'est la recette telle que
// le modèle l'a écrite (`UNMEASURABLE_PORTION_FACTOR`), c'est-à-dire la voie
// que `sizeDishForEaters` documente depuis le lot 10 — « un mangeur sans cible
// ne bloque pas la table ». Ce lot ne fait que la raccorder au couvercle.
//
// ⛔ AUCUN GRAMME DE PLUS N'EST CUISINÉ. `dishSum` comptait déjà cette ligne;
// avant ce lot, la différence partait à la poubelle — le plat était mis à
// l'échelle pour trois et les contenants n'en portaient que deux.

/**
 * POURQUOI CETTE BOUCHE REÇOIT LA PART DE RECETTE — nommé, jamais un `1` muet.
 *
 * ⛔ LA LISTE EST DÉRIVÉE DE `ANCHOR_REASONS`, PAS RECOPIÉE. Deux vocabulaires
 * du même silence divergent à la première abstention ajoutée, et c'est celui
 * qu'on relit le moins qui garderait l'ancien mot.
 *
 * ⚠️ `anchored` ET `clamped` EN SONT EXCLUS PAR CONSTRUCTION: ce sont les deux
 * motifs qui rendent une cible, donc une part CALCULÉE. Une ligne qui les
 * porterait dirait « sans cible » d'une bouche qui en a une.
 */
export type RecipeShareReason =
  | Exclude<AnchorReason, "anchored" | "clamped">
  /** La cible du JOUR existe; celle de CE MOMENT n'a pas pu être répartie. */
  | "slot_without_target"
  /** La bouche n'est pas dans la table mesurée. Ne doit jamais sortir. */
  | "mouth_unknown";

export const RECIPE_SHARE_REASONS: readonly RecipeShareReason[] = Object.freeze([
  ...ANCHOR_REASONS.filter(
    (r): r is Exclude<AnchorReason, "anchored" | "clamped"> =>
      r !== "anchored" && r !== "clamped",
  ),
  "slot_without_target",
  "mouth_unknown",
] as const);

/**
 * LE MOTIF D'ABSTENTION D'UNE LIGNE, À PARTIR DE CE QUI A ÉCHOUÉ.
 *
 * ⛔ UN SEUL ENDROIT LE DÉCIDE. L'appelant a la cible du jour, son motif et la
 * cible du moment sous la main; les recoller là-bas ferait deux écritures de la
 * même distinction — « le jour s'est abstenu » contre « le moment n'a rien
 * reçu » — et elles se répondraient différemment au premier cas limite.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function recipeShareReasonFor(args: {
  /** La cible du JOUR de cette bouche. `null` = `dayTargetFor` s'est abstenue. */
  dayKcal: number | null;
  /** Le motif rendu par `dayTargetFor`. `null` = la bouche n'a pas été mesurée. */
  dayReason: AnchorReason | null;
}): RecipeShareReason {
  if (args.dayReason === null) return "mouth_unknown";
  if (args.dayKcal !== null) return "slot_without_target";
  if (args.dayReason === "anchored" || args.dayReason === "clamped") {
    // ⛔ INATTEIGNABLE PAR CONSTRUCTION (`dayTargetFor` ne rend ces deux motifs
    // qu'avec un `kcal` non nul, déjà écarté ci-dessus) — et nommé quand même,
    // parce qu'un `as` sur ce retour désarmerait le typecheck du jour où la
    // fonction changera.
    return "mouth_unknown";
  }
  return args.dayReason;
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE MOTEUR AUTORE LES BOÎTES, MULTIPLIE LE FRAIS ET LES CASSEROLES — lot 4
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ IL RETOURNE DES COPIES. Muter le plan en place ferait dépendre le résultat
 * de l'ordre d'appel, et ce module promet d'être pur.
 *
 * ⛔ AUCUN TERME NEUF. Chaque item de boîte vient soit d'une casserole que le
 * plat TIRE, soit d'un ingrédient que le plat PORTE. Le moteur ne met jamais
 * dans une boîte quelque chose que personne n'a écrit — c'est l'invariant du
 * chantier, et un test le tient.
 *
 * ⚠️ LA BOÎTE EST UNE PRESCRIPTION, PAS UN BAC. Un seul `memberId` dedans: à
 * une bouche, « le contenant EST sa portion » (v4). Le jour où la borne monte,
 * c'est ce point-là qu'il faudra rouvrir — plusieurs noms font basculer la
 * lecture des grammes vers « quantité de bac », et l'écran change de phrase.
 */
export interface EaterRowForApply {
  /** L'index du plat dans `meal.dishes`. */
  dishIndex: number;
  memberId: string;
  factor: number;
  /** `false` quand ce mangeur n'a pas pu être dimensionné sur ce plat. */
  sized: boolean;
  /**
   * ⟳ 2026-09-13 · LOT 1 — LE MOTIF QUI OUVRE LA PART DE RECETTE.
   *
   * `null` sur une ligne dimensionnée, et `null` aussi quand le PLAT lui-même
   * n'est pas mesurable: là il n'y a pas de part de recette à servir, il n'y a
   * rien de lisible du tout, et le plat repart sans contenant comme avant.
   *
   * ⛔ REQUIS ET NULLABLE, JAMAIS `?`. Un champ facultatif prendrait par défaut
   * le comportement d'AVANT ce lot — la bouche retirée du couvercle — et le
   * dépôt paie en boucle les gardes qu'un paramètre facultatif désarme. Chaque
   * appelant doit dire ce qu'il sait.
   */
  recipeShare: RecipeShareReason | null;
  /**
   * ⟳ 2026-09-22 · LOT C — LE FÉCULENT À CÔTÉ, SERVI À SA PROPORTION.
   *
   * Sur une case partagée écrite en deux casseroles (`starch_side.ts`), la
   * casserole-féculent suit `sideFactor`; le frais du plat et les autres
   * casseroles suivent `mainFactor`. L'énergie de la part reste celle de
   * `factor` (`splitStarchSide` la garde exacte). `null` = un seul facteur pour
   * tout le plat — le cas de tout plat d'avant ce lot.
   *
   * ⛔ REQUIS ET NULLABLE, JAMAIS `?`: un champ facultatif reprendrait en
   * silence le facteur unique, c'est-à-dire le défaut exact que ce lot ferme.
   */
  starchSide: StarchSideServing | null;
}

/** Les deux facteurs d'une bouche sur un plat servi en deux proportions. */
export interface StarchSideServing {
  /** La casserole-féculent. */
  preparationId: string;
  /** Le frais du plat et les autres casseroles. */
  mainFactor: number;
  /** La casserole-féculent. */
  sideFactor: number;
}

/**
 * ⟳ 2026-09-22 · LOT C — LE FACTEUR D'UNE LIGNE POUR UNE PARTIE DU PLAT.
 *
 * `potId` = la casserole tirée; `null` = le frais du plat. Sans partage, c'est
 * `factor` partout, octet pour octet le comportement d'avant ce lot.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function partFactorOf(
  row: { factor: number; starchSide: StarchSideServing | null },
  potId: string | null,
): number {
  if (row.starchSide === null) return row.factor;
  return potId !== null && potId === row.starchSide.preparationId
    ? row.starchSide.sideFactor
    : row.starchSide.mainFactor;
}

/**
 * ══════════════════════════════════════════════════════════════════════════
 * LE MOTEUR AUTORE LES COUVERCLES DE TOUTE LA TABLE — lot 12
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ UNE RECETTE, N PARTS, ET LA CASSEROLE EST LEUR SOMME. C'est la seule
 * différence avec le chemin solo, et elle porte tout le reste:
 *
 *     part d'un mangeur  = recette × SON facteur
 *     frais d'un plat    = recette × Σ des facteurs de SES mangeurs
 *     casserole          = recette × Σ_plats (Σ_mangeurs f) ÷ tirages
 *
 * ⚠️ LE FRAIS SE MULTIPLIE PAR LA SOMME, PAS PAR UN FACTEUR MOYEN. Un plat qui
 * nourrit quatre personnes doit CONTENIR quatre parts; le multiplier par la
 * moyenne rendrait une casserole pour une personne et trois assiettes vides.
 *
 * ⛔ AUCUN TERME NEUF, comme au solo: chaque item vient d'une casserole que le
 * plat TIRE ou d'un ingrédient qu'il PORTE.
 *
 * ⚠️ LES COUVERCLES SUIVENT L'OBJECTIF, ET LA RÈGLE EST APPELÉE, PAS RECOPIÉE
 * (`lidPlanFor` → `weighedPortionMembers`). Un mangeur seul au bac reçoit une
 * boîte à son nom: un bac d'un nom mentirait sur ses propres grammes, et
 * l'écran lit `memberIds.length > 1` pour dire « partagé ».
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function applySizingForEaters(args: {
  meal: {
    // deno-lint-ignore no-explicit-any
    dishes: readonly any[];
    // deno-lint-ignore no-explicit-any
    preparations: readonly any[];
  };
  rows: readonly EaterRowForApply[];
  /** Les bouches à qui un objectif de poids ouvre une boîte à elles. */
  weighed: ReadonlySet<string>;
  index: CompositionIndex;
  // deno-lint-ignore no-explicit-any
}): { dishes: any[]; preparations: any[]; counts: ApplyCounts } {
  const counts = applyCounts();
  const byDish = new Map<number, EaterRowForApply[]>();
  for (const r of args.rows) {
    byDish.set(r.dishIndex, [...(byDish.get(r.dishIndex) ?? []), r]);
  }
  /**
   * La somme des facteurs des mangeurs d'un plat, pour UNE partie du plat
   * (`potId`, ou `null` pour le frais). Non dimensionné ⇒ 1.
   *
   * ⟳ 2026-09-22 · LOT C — PAR PARTIE: un plat servi en deux proportions
   * multiplie sa casserole-féculent par la somme des `sideFactor`, le reste par
   * la somme des `mainFactor`. Sans partage, les deux sommes sont la même.
   */
  const dishSum = (i: number, potId: string | null): number => {
    const rows = byDish.get(i) ?? [];
    if (rows.length === 0) return 1;
    return rows.reduce(
      (a, r) => a + (r.sized ? partFactorOf(r, potId) : UNMEASURABLE_PORTION_FACTOR),
      0,
    );
  };

  // ── ① LES TIRAGES, ET LE FACTEUR DE CHAQUE CASSEROLE ────────────────────
  // ⛔ UNE ENTRÉE PAR TIRAGE, PORTANT LA SOMME DES MANGEURS DE CE PLAT. C'est
  // `potFactorAcross` écrit en place: moyenner les facteurs à plat diviserait
  // la casserole par le nombre de bouches.
  const factorsByPot = new Map<string, number[]>();
  const drawsByPot = new Map<string, number>();
  args.meal.dishes.forEach((d, i) => {
    for (const u of d.uses ?? []) {
      const id = String(u?.preparationId ?? "");
      if (!id) continue;
      drawsByPot.set(id, (drawsByPot.get(id) ?? 0) + 1);
      factorsByPot.set(id, [...(factorsByPot.get(id) ?? []), dishSum(i, id)]);
    }
  });

  // ── ② LES CASSEROLES ────────────────────────────────────────────────────
  const potReadyPerDraw = new Map<string, number | null>();
  const preparations = args.meal.preparations.map((p) => {
    const id = String(p.id ?? "");
    const draws = drawsByPot.get(id) ?? 0;
    // ⟳ 2026-09-11 · LOT B — LA MÊME MESURE QUE LE DIMENSIONNEMENT. Avant ce
    // lot, `applySizing` mesurait chaque casserole SÉPARÉMENT pendant que
    // `standardPortionOf` les aplatissait: 727 g écrits contre 657 g annoncés
    // sur GAIN `a18f522e`. Les deux passent désormais par `measurePreparation`,
    // donc par la même règle d'eau, la même résolution et la même abstention.
    const ready = measurePreparation(args.index, {
      id,
      method: p.method ?? null,
      ingredients: (p.ingredients ?? []) as readonly unknown[],
      waterTreatment: p.waterTreatment ?? null,
    }).readyG;
    potReadyPerDraw.set(
      id,
      ready === null || draws === 0 ? null : ready / draws,
    );
    if (ready === null) counts.pots_unreadable++;
    if (draws === 0) return { ...p };
    const f = potFactorOf(factorsByPot.get(id) ?? []);
    const sc = scaleIngredients(
      (p.ingredients ?? []) as ScalableIngredient[],
      f,
    );
    counts.pots_scaled++;
    if (p.servingsMade !== draws) counts.servings_rewritten++;
    return { ...p, ingredients: sc.out, servingsMade: draws };
  });

  // ── ③ LES PLATS: FRAIS × Σ, ET UN COUVERCLE PAR GROUPE ──────────────────
  const dishes = args.meal.dishes.map((d, i) => {
    const all = byDish.get(i) ?? [];
    // ══════════════════════════════════════════════════════════════════════
    // ⟳ 2026-09-13 · LOT 1 — LA PART DE RECETTE ENTRE DANS LE COUVERCLE
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ C'EST LA LIGNE EXACTE DU DÉFAUT. Elle valait `.filter((r) => r.sized)`
    // et retirait du `lidPlanFor` toute bouche sans cible — alors que le plat
    // venait d'être multiplié POUR ELLE deux lignes plus bas (`dishSum` compte
    // une ligne non dimensionnée à `UNMEASURABLE_PORTION_FACTOR`). Résultat
    // mesuré: `lids.own_expected: 24` contre `own_authored: 18`, et un refus
    // `mouth_unfed` qui emportait le plan des quatre bouches.
    //
    // ⚠️ LES DEUX SILENCES NE SE CONFONDENT PAS. `recipeShare !== null` dit
    // « le plat est mesurable, c'est CETTE BOUCHE qui n'a pas de cible » — il y
    // a une part à servir. `recipeShare === null` sur une ligne non
    // dimensionnée dit « le plat lui-même est illisible »: il n'y a rien à
    // mettre dans un contenant, et le plat repart sans boîte comme avant.
    const rows = all.filter((r) => r.sized || r.recipeShare !== null);
    if (rows.length === 0) {
      counts.dishes_unsized++;
      counts.eaters_unsized += all.length;
      return { ...d };
    }
    for (const r of all) {
      if (r.sized) continue;
      if (r.recipeShare === null) {
        // ⛔ LE MANGEUR VRAIMENT PERDU, COMPTÉ ICI AUSSI. Avant ce lot,
        // `eaters_unsized` ne bougeait QUE si le plat entier tombait: un plat
        // à trois mangeurs dont un seul était retiré rendait `0`, et le
        // compteur qui aurait nommé le défaut était aveugle.
        counts.eaters_unsized++;
        continue;
      }
      counts.recipe_shares++;
      counts.recipe_shares_by[r.recipeShare] =
        (counts.recipe_shares_by[r.recipeShare] ?? 0) + 1;
    }
    const sum = dishSum(i, null);
    const sc = scaleIngredients(
      (d.ingredients ?? []) as ScalableIngredient[],
      sum,
    );
    counts.fresh_scaled += sc.scaled;
    counts.fresh_unweighed += sc.unweighed;

    /**
     * Les items d'UNE part. `fOf(potId)` rend le facteur de chaque partie —
     * `null` pour le frais (⟳ 2026-09-22 · LOT C).
     */
    const itemsAt = (fOf: (potId: string | null) => number) => {
      const items: SizedBoxItem[] = [];
      for (const u of d.uses ?? []) {
        const id = String(u?.preparationId ?? "");
        if (!id) continue;
        const perDraw = potReadyPerDraw.get(id);
        if (perDraw === null || perDraw === undefined) {
          counts.items_unresolved++;
          continue;
        }
        const prep = args.meal.preparations.find((p) =>
          String(p.id ?? "") === id
        );
        const grams = Math.round(perDraw * fOf(id));
        if (grams <= 0) {
          counts.items_unresolved++;
          continue;
        }
        items.push({
          preparationId: id,
          term: String(prep?.title ?? id),
          grams,
          // ⟳ LOT A — UN ITEM QUI CITE UNE CASSEROLE N'A PAS DE FICHE: son
          // énergie vient de la casserole entière (`potDensities`), et son
          // `term` est le TITRE de la casserole, pas un aliment.
          ref: null,
          refRefused: false,
          // Et donc aucun volume: « Poulet, riz et courgettes » n'a pas de
          // densité, c'est une casserole. Même abstention que `ref`.
          ml: null,
        });
      }
      for (const ing of (d.ingredients ?? []) as ScalableIngredient[]) {
        const ready = readyGramsOfOne(args.index, ing);
        if (ready === null) {
          counts.items_unresolved++;
          continue;
        }
        const grams = Math.round(ready * fOf(null));
        if (isShrunkCrumb(args.index, ing, ready, grams)) counts.fresh_crumbs++;
        if (grams <= 0) continue;
        items.push({
          preparationId: null,
          term: String(ing.term ?? ""),
          grams,
          // ⟳ LOT A (2026-09-11) — L'IDENTITÉ DE LA LIGNE SUIT DANS LA BOÎTE.
          // « Ne plus retrouver son aliment par son libellé »: cet item EST né
          // de cette ligne-ci, on n'a donc aucune raison de le rechercher.
          ref: ing.ref ?? null,
          refRefused: ing.refRefused === true,
          // ⟳ 2026-09-22 — ET SON VOLUME AVEC, par le même identifiant. C'est
          // ce chemin-ci qui écrit les doses d'un repas sans cuisson — celles
          // où « huile de colza — 6 g » se lisait sans sa cuillère.
          ml: millilitresOfSlug(args.index, ing.ref ?? null, grams),
        });
      }
      return items;
    };

    const plan = lidPlanFor({
      rows: rows.map((r) => ({
        memberId: r.memberId,
        bucket: "",
        factor: r.factor,
        personCookedG: null,
        verdict: "in_bounds" as SizingVerdict,
        unmetKcal: 0,
      })),
      weighed: args.weighed,
    });

    const boxes: {
      id: string;
      memberIds: string[];
      items: { preparationId: string | null; term: string; grams: number }[];
      legacyTotalGrams: null;
    }[] = [];
    const base = `box_${String(d.day ?? "day")}_${
      String(d.slot ?? "slot")
    }_${i}`;
    for (const lid of plan.own) {
      // ⟳ LOT C — LA LIGNE DE CETTE BOUCHE, pour ses deux facteurs. Sans
      // partage, `partFactorOf` rend `lid.factor` sur chaque partie.
      const row = rows.find((r) => r.memberId === lid.memberId);
      const items = itemsAt((potId) =>
        row === undefined ? lid.factor : partFactorOf(row, potId)
      );
      if (items.length === 0) continue;
      boxes.push({
        id: `${base}_${lid.memberId}`,
        memberIds: [lid.memberId],
        items,
        legacyTotalGrams: null,
      });
      counts.own_authored++;
    }
    if (plan.tub !== null) {
      // ⛔ LA SOMME DES PARTS, JAMAIS UNE MOYENNE. Le bac est un RÉCIPIENT: il
      // doit contenir de quoi servir tous ses mangeurs.
      // ⟳ LOT C — LA SOMME PAR PARTIE. Sans partage elle vaut
      // `plan.tub.factorSum` sur chaque partie.
      const tub = plan.tub;
      const tubRows = rows.filter((r) => tub.memberIds.includes(r.memberId));
      const items = itemsAt((potId) =>
        tubRows.reduce((a, r) => a + partFactorOf(r, potId), 0)
      );
      if (items.length > 0) {
        boxes.push({
          id: `${base}_tub`,
          memberIds: [...plan.tub.memberIds],
          items,
          legacyTotalGrams: null,
        });
        counts.tubs_authored++;
      }
    }
    if (boxes.length === 0) {
      counts.dishes_unsized++;
      return { ...d, ingredients: sc.out };
    }
    counts.boxes_authored += boxes.length;
    return { ...d, ingredients: sc.out, boxes };
  });

  return { dishes, preparations, counts };
}

export function applySizing(args: {
  meal: {
    // deno-lint-ignore no-explicit-any
    dishes: readonly any[];
    // deno-lint-ignore no-explicit-any
    preparations: readonly any[];
  };
  memberId: string;
  rows: readonly SizingRowForApply[];
  index: CompositionIndex;
  // deno-lint-ignore no-explicit-any
}): { dishes: any[]; preparations: any[]; counts: ApplyCounts } {
  const counts = applyCounts();
  const byIndex = new Map(args.rows.map((r) => [r.dishIndex, r]));

  // ── ① LES TIRAGES, ET LE FACTEUR DE CHAQUE CASSEROLE ────────────────────
  const factorsByPot = new Map<string, number[]>();
  const drawsByPot = new Map<string, number>();
  args.meal.dishes.forEach((d, i) => {
    const row = byIndex.get(i);
    for (const u of d.uses ?? []) {
      const id = String(u?.preparationId ?? "");
      if (!id) continue;
      drawsByPot.set(id, (drawsByPot.get(id) ?? 0) + 1);
      // ⚠️ UN PLAT NON MESURÉ COMPTE POUR 1 DANS LA CASSEROLE. Il est servi tel
      // que le modèle l'a écrit (`UNMEASURABLE_PORTION_FACTOR`), donc il tire
      // sa portion entière. L'omettre ferait cuisiner moins que ce que la
      // table mange.
      factorsByPot.set(id, [
        ...(factorsByPot.get(id) ?? []),
        // ⟳ 2026-09-13 · LOT 2 — LA CONSTANTE, PLUS LE LITTÉRAL `1`. Même
        // valeur, mais c'est ce nombre-là que la part de recette SERT plus bas:
        // les deux doivent bouger ensemble ou pas du tout.
        // ⟳ 2026-09-23 — LE FACTEUR DE CETTE CASSEROLE, féculent à part
        // (`partFactorOf`, la règle d'`applySizingForEaters`).
        row?.sized ? partFactorOf(row, id) : UNMEASURABLE_PORTION_FACTOR,
      ]);
    }
  });

  // ── ② LES CASSEROLES, MULTIPLIÉES ET RE-PORTIONNÉES ─────────────────────
  const potReadyPerDraw = new Map<string, number | null>();
  const preparations = args.meal.preparations.map((p) => {
    const id = String(p.id ?? "");
    const draws = drawsByPot.get(id) ?? 0;
    // ⟳ 2026-09-11 · LOT B — LA MÊME MESURE QUE LE DIMENSIONNEMENT. Avant ce
    // lot, `applySizing` mesurait chaque casserole SÉPARÉMENT pendant que
    // `standardPortionOf` les aplatissait: 727 g écrits contre 657 g annoncés
    // sur GAIN `a18f522e`. Les deux passent désormais par `measurePreparation`,
    // donc par la même règle d'eau, la même résolution et la même abstention.
    const ready = measurePreparation(args.index, {
      id,
      method: p.method ?? null,
      ingredients: (p.ingredients ?? []) as readonly unknown[],
      waterTreatment: p.waterTreatment ?? null,
    }).readyG;
    potReadyPerDraw.set(
      id,
      ready === null || draws === 0 ? null : ready / draws,
    );
    if (ready === null) counts.pots_unreadable++;
    if (draws === 0) return { ...p };
    const f = potFactorOf(factorsByPot.get(id) ?? []);
    const s = scaleIngredients(
      (p.ingredients ?? []) as ScalableIngredient[],
      f,
    );
    counts.pots_scaled++;
    // ⛔ `servingsMade` DEVIENT LE NOMBRE DE TIRAGES, jamais ce que le modèle a
    // écrit. Mesuré faux: `servings: 1` sur des pots que quinze plats tirent.
    if (p.servingsMade !== draws) counts.servings_rewritten++;
    return { ...p, ingredients: s.out, servingsMade: draws };
  });

  // ── ③ LES PLATS: FRAIS MULTIPLIÉ, ET UNE BOÎTE AUTORÉE ──────────────────
  const dishes = args.meal.dishes.map((d, i) => {
    const row = byIndex.get(i);
    // ══════════════════════════════════════════════════════════════════════
    // ⟳ 2026-09-13 · LOT 2 — LA PART DE RECETTE ARRIVE À **UNE** BOUCHE
    // ══════════════════════════════════════════════════════════════════════
    //
    // ⛔ C'EST LA LIGNE EXACTE DU DÉFAUT. Elle valait `if (!row || !row.sized)`,
    // c'est-à-dire le filtre que `applySizingForEaters` a cessé d'appliquer au
    // lot 1 — gardé ici un lot de plus. Un titulaire sans date de naissance
    // (`age_state = unknown`) n'a pas de cible: `sizeDishForMouth` rend
    // `unmeasurable`, et sa SEULE assiette repartait sans contenant, pour un
    // plat parfaitement lisible que la casserole cuisinait quand même.
    //
    // ⚠️ LES DEUX SILENCES NE SE CONFONDENT PAS, ET C'EST TOUT LE LOT.
    // `recipeShare !== null` dit « le plat est mesurable, c'est CETTE BOUCHE qui
    // n'a pas de cible »: il y a une part à servir, celle de la recette.
    // `recipeShare === null` sur une ligne non dimensionnée dit « le plat
    // lui-même est illisible »: il n'y a rien à mettre dans un contenant, et le
    // plat repart sans boîte — le refus reste légitime.
    //
    // ⛔ AUCUN GRAMME DE PLUS N'EST CUISINÉ: le bloc ① comptait déjà cette ligne
    // à `UNMEASURABLE_PORTION_FACTOR`. Avant ce lot, la différence partait à la
    // poubelle.
    if (!row) {
      counts.dishes_unsized++;
      return { ...d };
    }
    if (!row.sized) {
      const share = row.recipeShare;
      // ⛔ PAS DE `as` POUR ÉCRIRE CE MOTIF. Le rétrécissement vient de ce test,
      // pas d'une affirmation: un `as` sur cette valeur rendrait un `null` écrit
      // sous la clé `"null"` le jour où un appelant oublierait le champ, et le
      // typecheck ne dirait rien (`as-cast-on-foreign-type-disarms-typecheck`).
      if (share === null) {
        counts.dishes_unsized++;
        return { ...d };
      }
      // ⚠️ `eaters_unsized` NE BOUGE PAS ICI, ET C'EST EXACT. Il compte « les
      // mangeurs non dimensionnés sur un plat POURTANT MESURÉ » — la population
      // que la part de recette vient précisément de servir. À une bouche, un
      // plat illisible est déjà compté par `dishes_unsized` juste au-dessus.
      counts.recipe_shares++;
      counts.recipe_shares_by[share] = (counts.recipe_shares_by[share] ?? 0) + 1;
    }
    // ⛔ ET LE FACTEUR EST CELUI DE LA LIGNE, jamais un facteur inventé: sur une
    // part de recette il vaut déjà `UNMEASURABLE_PORTION_FACTOR`, posé par
    // `sizeDishForMouth`. Ce lot ne fabrique ni cible, ni âge, ni gramme.
    // ⟳ 2026-09-23 — LE FRAIS SUIT LA PART PRINCIPALE (`partFactorOf(row,
    // null)`): sans partage, c'est `row.factor`, à l'octet.
    const f = partFactorOf(row, null);
    const s = scaleIngredients(
      (d.ingredients ?? []) as ScalableIngredient[],
      f,
    );
    counts.fresh_scaled += s.scaled;
    counts.fresh_unweighed += s.unweighed;

    const items: SizedBoxItem[] = [];
    for (const u of d.uses ?? []) {
      const id = String(u?.preparationId ?? "");
      if (!id) continue;
      const perDraw = potReadyPerDraw.get(id);
      if (perDraw === null || perDraw === undefined) {
        counts.items_unresolved++;
        continue;
      }
      const prep = args.meal.preparations.find((p) =>
        String(p.id ?? "") === id
      );
      // ⟳ 2026-09-23 — la part de CETTE casserole: `sideFactor` pour le féculent.
      const grams = Math.round(perDraw * partFactorOf(row, id));
      if (grams <= 0) {
        counts.items_unresolved++;
        continue;
      }
      // ⟳ LOT A — voir `itemsAt`: un item citant une casserole n'a pas de fiche.
      items.push({
        preparationId: id,
        term: String(prep?.title ?? id),
        grams,
        ref: null,
        refRefused: false,
        ml: null,
      });
    }
    // ⚠️ LE FRAIS EST PESÉ SUR LA RECETTE D'ORIGINE PUIS MULTIPLIÉ, jamais sur
    // la recette déjà mise à l'échelle: deux multiplications par `f` feraient
    // `f²`, et l'erreur serait invisible à facteur 1.
    for (const ing of (d.ingredients ?? []) as ScalableIngredient[]) {
      const ready = readyGramsOfOne(args.index, ing);
      if (ready === null) {
        counts.items_unresolved++;
        continue;
      }
      const grams = Math.round(ready * f);
      if (isShrunkCrumb(args.index, ing, ready, grams)) counts.fresh_crumbs++;
      if (grams <= 0) continue;
      // ⟳ LOT A (2026-09-11) — L'IDENTITÉ DE LA LIGNE SUIT DANS LA BOÎTE.
      items.push({
        preparationId: null,
        term: String(ing.term ?? ""),
        grams,
        ref: ing.ref ?? null,
        refRefused: ing.refRefused === true,
        ml: millilitresOfSlug(args.index, ing.ref ?? null, grams),
      });
    }
    if (items.length === 0) {
      counts.dishes_unsized++;
      return { ...d, ingredients: s.out };
    }
    counts.boxes_authored++;
    return {
      ...d,
      ingredients: s.out,
      boxes: [{
        // ⚠️ L'ID EST DÉRIVÉ DU JOUR, DU CRÉNEAU ET DU RANG — pas d'un compteur
        // global. Deux plans successifs du même jour donnent le même id pour la
        // même case, ce qui rend un diff lisible; un compteur les décalerait
        // tous dès qu'un plat est ajouté au milieu.
        id: `box_${String(d.day ?? "day")}_${String(d.slot ?? "slot")}_${i}`,
        memberIds: [args.memberId],
        items,
        legacyTotalGrams: null,
      }],
    };
  });

  return { dishes, preparations, counts };
}

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ bis — LA MESURE APRÈS APPLICATION, ET ELLE VAUT AUSSI À **UNE** BOUCHE
// ═══════════════════════════════════════════════════════════════════════════
//
// ── LE DÉFAUT QUE CE BLOC FERME, ET IL EST DANS L'ENQUÊTE ─────────────────
// « Le contrôle final appelle un chemin qui s'abstient pour `single_mouth`. Il
// laisse donc passer ce dépassement réel sans reprendre le verdict établi sur
// les 657 g théoriques » (`ENQUETE-DEUX-DIRECTIONS-2026-09-11.md` § 4). Sur GAIN
// `a18f522e`, samedi déjeuner: le moteur annonce **657 g**, `applySizing` écrit
// **727 g**, le plafond est à 700 — et personne ne le dit, parce que le seul
// contrôle qui pesait les assiettes ne tournait qu'à partir de DEUX bouches.
//
// ⛔ CETTE FONCTION N'A AUCUNE EXCEPTION DE POPULATION. Un foyer d'une personne
// et un foyer de cinq traversent la même mesure, avec le même vocabulaire de
// verdict. C'est la ligne du chantier: « même calcul et mêmes contrôles pour une
// personne seule et plusieurs personnes ».
//
// ⛔ ET ELLE MESURE CE QUI EST **ÉCRIT**, pas ce qui était prévu. Elle part des
// `boxes[].items` — les grammes que `applySizing` vient de poser, arrondis
// compris — et de la composition des casseroles telles qu'elles ont été mises à
// l'échelle. Un verdict calculé avant application ne valide pas les quantités
// écrites; c'est très exactement ce que les 727 g ont prouvé.

/** Ce qu'un contenant écrit pèse vraiment, et ce que la borne en dit. */
export interface FinalPortionRow {
  /**
   * ⟳ 2026-09-13 · LOT 2 § 2.4 — LES CONTENANTS DE CE REPAS, PAS UN SEUL.
   *
   * ⛔ `boxId` AU SINGULIER A DISPARU, ET C'EST VOULU. Une assiette partagée
   * entre un plat commun et un complément porte DEUX contenants; rendre l'un
   * d'eux ferait nommer la moitié d'un repas par son identifiant, et l'autre
   * moitié nulle part. Un bac garde un seul identifiant, comme avant.
   */
  boxIds: readonly string[];
  day: string | null;
  slot: string | null;
  memberIds: readonly string[];
  /** La somme des items ÉCRITS, TOUS contenants de ce repas confondus. */
  grams: number;
  /**
   * ⛔ `null` DÈS QU'UN COMPOSANT SE TAIT. Une somme partielle ressemble à un
   * résultat: un repas dont le complément n'est pas lisible n'a pas d'énergie
   * connue, il n'a pas « l'énergie de sa part commune ».
   */
  kcal: number | null;
  proteinG: number | null;
  /** `unmeasurable` quand la mesure se tait ou qu'aucune borne n'est connue. */
  verdict: SizingVerdict;
  /**
   * LES GRAMMES QUE LA BORNE REFUSE. `0` quand elle ne mord pas, NÉGATIF sous
   * le plancher — même convention de signe que `clampToBounds.unmetKcal`.
   */
  overshootG: number;
}

export const FINAL_PORTION_REASONS = [
  "remeasured_after_apply",
  "composition_unavailable",
  "no_box",
] as const;
export type FinalPortionReason = (typeof FINAL_PORTION_REASONS)[number];

export interface FinalPortionCheck {
  measured: boolean;
  reason: FinalPortionReason;
  /** Tous les contenants rencontrés, jugés ou non. Le dénominateur. */
  boxes: number;
  /**
   * ⟳ 2026-09-13 · LOT 2 § 2.4 — LES REPAS: les contenants d'UNE bouche,
   * regroupés par jour et moment. C'est l'unité de `judged` et de `verdicts`.
   */
  meals: number;
  /**
   * ⟳ 2026-09-13 · LOT 2 § 2.4 — CEUX QUI PORTENT PLUS D'UN CONTENANT.
   *
   * ⛔ SANS CE NOMBRE, LE REGROUPEMENT EST INVISIBLE: à zéro, il rend exactement
   * les mêmes verdicts que le jugement contenant par contenant, et on ne saurait
   * pas si la règle ne mord pas ou si elle n'est pas branchée.
   */
  multiBoxMeals: number;
  /** Les repas dont on a pu comparer la masse à une borne. */
  judged: number;
  verdicts: Record<SizingVerdict, number>;
  /** Ce qu'on a décidé de l'eau de chaque casserole du plan. */
  water: Record<WaterTreatment, number>;
  /**
   * LES BACS, COMPTÉS À PART ET JAMAIS JUGÉS. Les grammes d'un contenant à
   * plusieurs noms sont une quantité de RÉCIPIENT, pas la portion de quelqu'un:
   * les comparer à un plafond d'assiette ferait rougir un bac correct (v4).
   */
  tubsNotJudged: number;
  /**
   * LES DÉPASSEMENTS, SANS `member_id`. C'est cette liste qui va au journal:
   * le seau d'un jour et d'un moment dit assez pour lire, et pas assez pour
   * nommer (précédent `residualGaps`, retiré pour avoir porté un identifiant).
   */
  outOfBounds: readonly {
    day: string | null;
    slot: string | null;
    grams: number;
    limit: number;
    bound: "min" | "max";
  }[];
  /** Les lignes complètes, pour l'appelant qui doit AGIR — jamais pour un log. */
  rows: readonly FinalPortionRow[];
}

/**
 * LA MESURE FINALE D'UN PLAN ÉCRIT — grammes, kcal et protéine des items posés.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-13 · LOT 2 § 2.4 — LE VERDICT PORTE SUR LE **REPAS**, PAS SUR UN
 *                CONTENANT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ CE QU'IL FAISAIT, ET CE QUE ÇA DISAIT DE FAUX. Une assiette partagée entre
 * un plat commun et un complément (`splitPlateWithComplement`) s'écrit en DEUX
 * contenants au même nom, au même jour, au même moment — 216 g + 9 g pour un
 * plancher de 225. Jugés séparément, les deux sortaient `under_min`: **deux
 * fausses alarmes sur un repas exactement conforme**, et l'énergie réellement
 * servie — la somme — n'était mesurée nulle part. C'est la même erreur que
 * `fitPortionsToBounds` commettait en remontant la part commune.
 *
 * ⛔ ET LA SOMME EST HONNÊTE OU ELLE N'EST PAS. Un composant dont l'énergie ou
 * la protéine se tait rend la somme `null`: un repas n'a pas « l'énergie de sa
 * part commune », il a une énergie inconnue.
 *
 * @param plateFor les bornes de CE REPAS — `(memberId, day, slot)`, la clé qui
 * les a déjà décidées chez l'appelant. `null` = on ne sait pas ce que cette
 * assiette devrait peser, donc on ne juge pas et on le compte (`unmeasurable`).
 * ⛔ REQUIS ET NULLABLE, jamais `?`: un défaut ferait de « pas de borne » la
 * réponse silencieuse de tous les appelants, c'est-à-dire laisserait ce contrôle
 * construit et désarmé — le mode d'échec n° 1 du dépôt.
 *
 * PURE: no I/O, no clock, no randomness.
 */
export function finalPortionCheck(args: {
  index: CompositionIndex | null;
  dishes: readonly BoxedMouthEnergyDish[];
  preparations: readonly EnergyPreparation[];
  plateFor: (meal: {
    memberIds: readonly string[];
    day: string | null;
    slot: string | null;
  }) => PlateBounds | null;
}): FinalPortionCheck {
  const verdicts = Object.fromEntries(
    SIZING_VERDICTS.map((v) => [v, 0]),
  ) as Record<SizingVerdict, number>;
  const water = Object.fromEntries(
    WATER_TREATMENTS.map((w) => [w, 0]),
  ) as Record<WaterTreatment, number>;
  const empty = (reason: FinalPortionReason): FinalPortionCheck => ({
    measured: false,
    reason,
    boxes: 0,
    meals: 0,
    multiBoxMeals: 0,
    judged: 0,
    verdicts,
    water,
    tubsNotJudged: 0,
    outOfBounds: [],
    rows: [],
  });
  if (args.index === null) return empty("composition_unavailable");
  for (const prep of args.preparations) {
    water[measurePreparation(args.index, prep).water]++;
  }
  const measured = boxNutrition({
    index: args.index,
    dishes: args.dishes,
    preparations: args.preparations,
  });
  if (measured.length === 0) {
    return { ...empty("no_box"), water };
  }

  // ── LES REPAS: LES CONTENANTS D'UNE BOUCHE, PAR JOUR ET PAR MOMENT ───────
  // ⚠️ UN BAC N'EST JAMAIS DANS UN REPAS: il garde sa ligne à lui, et il n'est
  // pas jugé. L'ordre de rencontre fait l'ordre des lignes rendues.
  type Groupe = { boxes: typeof measured; tub: boolean };
  const groupes: Groupe[] = [];
  const parRepas = new Map<string, Groupe>();
  let tubs = 0;
  for (const box of measured) {
    if (box.memberIds.length !== 1) {
      tubs++;
      groupes.push({ boxes: [box], tub: true });
      continue;
    }
    const key = `${box.memberIds[0]}|${box.day ?? ""}|${box.slot ?? ""}`;
    const deja = parRepas.get(key);
    if (deja) {
      (deja.boxes as typeof measured[number][]).push(box);
      continue;
    }
    const neuf: Groupe = { boxes: [box], tub: false };
    parRepas.set(key, neuf);
    groupes.push(neuf);
  }

  const rows: FinalPortionRow[] = [];
  const outOfBounds: {
    day: string | null;
    slot: string | null;
    grams: number;
    limit: number;
    bound: "min" | "max";
  }[] = [];
  let judged = 0;
  let meals = 0;
  let multiBoxMeals = 0;
  for (const groupe of groupes) {
    const premier = groupe.boxes[0];
    if (!groupe.tub) {
      meals++;
      if (groupe.boxes.length > 1) multiBoxMeals++;
    }
    // ⛔ LE TOTAL RÉELLEMENT SERVI: grammes, énergie, protéine. `null` dès qu'un
    // composant se tait — et jamais un composant compté deux fois, puisque
    // chaque contenant n'appartient qu'à un groupe.
    let grams = 0;
    let kcal: number | null = 0;
    let proteinG: number | null = 0;
    for (const box of groupe.boxes) {
      grams += box.grams;
      kcal = kcal === null || box.kcal === null ? null : kcal + box.kcal;
      proteinG = proteinG === null || box.proteinG === null
        ? null
        : proteinG + box.proteinG;
    }
    const bounds = groupe.tub
      ? null
      : args.plateFor({
        memberIds: premier.memberIds,
        day: premier.day,
        slot: premier.slot,
      });
    let verdict: SizingVerdict = "unmeasurable";
    let overshoot = 0;
    if (bounds !== null && grams > 0) {
      judged++;
      if (grams > bounds.max) {
        verdict = "over_max";
        overshoot = Math.round(grams - bounds.max);
        outOfBounds.push({
          day: premier.day,
          slot: premier.slot,
          grams: Math.round(grams),
          limit: bounds.max,
          bound: "max",
        });
      } else if (grams < bounds.min) {
        verdict = "under_min";
        overshoot = Math.round(grams - bounds.min);
        outOfBounds.push({
          day: premier.day,
          slot: premier.slot,
          grams: Math.round(grams),
          limit: bounds.min,
          bound: "min",
        });
      } else verdict = "in_bounds";
    }
    verdicts[verdict]++;
    rows.push({
      boxIds: groupe.boxes.map((b) => b.boxId),
      day: premier.day,
      slot: premier.slot,
      memberIds: premier.memberIds,
      grams: Math.round(grams),
      kcal: kcal === null ? null : Math.round(kcal),
      // ⚠️ LE DIXIÈME DE GRAMME EST LE BARÈME DE `boxNutrition`; la somme le
      // garde, et on le rétablit après l'addition de flottants.
      proteinG: proteinG === null ? null : Math.round(proteinG * 10) / 10,
      verdict,
      overshootG: overshoot,
    });
  }
  return {
    measured: true,
    reason: "remeasured_after_apply",
    boxes: measured.length,
    meals,
    multiBoxMeals,
    judged,
    verdicts,
    water,
    tubsNotJudged: tubs,
    outOfBounds,
    rows,
  };
}
