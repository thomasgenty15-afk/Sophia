/**
 * L'ALIMENT PRINCIPAL D'UN PLAT — celui dont l'écran tire l'icône du plat.
 * Module PUR, aucune I/O.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * LA RÈGLE (décision produit du 2026-09-25)
 * ══════════════════════════════════════════════════════════════════════════
 *   1. la protéine la plus lourde du plat: viande, poisson, œufs,
 *      légumineuses, tofu (`AVOID_PROTEIN_GROUPS`, donc sans le yaourt);
 *   2. sans protéine, le végétal le plus lourd: légume, féculent ou fruit;
 *   3. sans végétal, le laitage le plus lourd (le fromage blanc du matin).
 * Rien de tout ça ⇒ `null`, et l'écran n'affiche pas d'icône.
 *
 * ⛔ LA PROTÉINE D'ABORD, ET PAS LE PLUS LOURD TOUT COURT. Au poids cru,
 * 200 g de brocoli pèsent plus que 150 g de poulet: « poulet, riz, brocoli »
 * aurait l'icône du brocoli. La protéine est ce qui nomme le plat.
 *
 * ── CE QUI EST LU — la même lecture que la liste « à éviter » ─────────────
 *   · les lignes du plat ET celles des préparations qu'il utilise (`uses`),
 *     au prorata de la part tirée: en cuisine par lots, le poulet vit dans la
 *     préparation, pas dans le plat;
 *   · une ligne dont le poids est connu et inférieur à `INGREDIENT_MIN_G`
 *     (20 g) est une pincée: elle ne compte pas;
 *   · un poids inconnu compte pour 0 g: la ligne ne gagne que si rien de son
 *     rang n'est pesé;
 *   · les à-côtés (`side_courses`) ne sont PAS lus: le pain servi à côté
 *     n'est pas l'aliment du plat.
 *
 * On pèse la FAMILLE (`foodFamilyOf`), pas le slug: `chicken_breast` et
 * `chicken_leg_meat` s'additionnent. À poids égal, la première famille
 * rencontrée gagne, pour qu'un même plan rende toujours la même icône.
 */

import {
  type CompositionIndex,
  resolveCompositionLine,
} from "./food_composition.ts";
import { INGREDIENT_MIN_G } from "./plan_food_quality.ts";
import {
  AVOID_PROTEIN_GROUPS,
  type AvoidPlan,
  type AvoidPlanDish,
  type AvoidPlanLine,
  type AvoidPlanPreparation,
  foodFamilyOf,
} from "./plan_avoid_list.ts";
import {
  STARCH_PART_GROUPS,
  VEGETABLE_PART_GROUPS,
} from "./pot_share_parts.ts";
import type { FoodGroupRef } from "./tokens.ts";

/** Ce que le plat écrit sous `main_food`. */
export interface DishMainFood {
  /** `food_composition_refs.family`, ou le slug quand la famille manque. */
  family: string;
  /** Le groupe de la ligne: l'écran s'en sert quand la famille n'a pas d'icône. */
  group: FoodGroupRef;
}

const FRUIT_GROUPS: ReadonlySet<FoodGroupRef> = new Set<FoodGroupRef>([
  "berries",
  "citrus",
  "other_fruit",
]);

const PLANT_GROUPS: ReadonlySet<FoodGroupRef> = new Set<FoodGroupRef>([
  ...VEGETABLE_PART_GROUPS,
  ...STARCH_PART_GROUPS,
  ...FRUIT_GROUPS,
]);

const DAIRY_GROUPS: ReadonlySet<FoodGroupRef> = new Set<FoodGroupRef>([
  "dairy_yogurt",
  "dairy_cheese",
]);

/** Les trois rangs, dans l'ordre où on les essaie. */
const TIERS: readonly ReadonlySet<FoodGroupRef>[] = [
  AVOID_PROTEIN_GROUPS,
  PLANT_GROUPS,
  DAIRY_GROUPS,
];

function tierOf(group: FoodGroupRef): number | null {
  const at = TIERS.findIndex((tier) => tier.has(group));
  return at === -1 ? null : at;
}

interface Weighed {
  family: string;
  group: FoodGroupRef;
  tier: number;
  grams: number;
}

export function mainFoodOfDish(
  dish: AvoidPlanDish,
  preps: ReadonlyMap<string, AvoidPlanPreparation>,
  index: CompositionIndex,
): DishMainFood | null {
  const byFamily = new Map<string, Weighed>();
  const visit = (line: AvoidPlanLine, share: number) => {
    const ref = resolveCompositionLine(index, line).ref;
    if (ref === null) return;
    const tier = tierOf(ref.foodGroupRef);
    if (tier === null) return;
    const grams = line.gramsRaw === null ? 0 : line.gramsRaw * share;
    if (line.gramsRaw !== null && grams < INGREDIENT_MIN_G) return;
    const family = foodFamilyOf(ref);
    const known = byFamily.get(family);
    if (known === undefined) {
      byFamily.set(family, { family, group: ref.foodGroupRef, tier, grams });
    } else {
      known.grams += grams;
    }
  };
  for (const line of dish.ingredients) visit(line, 1);
  for (const use of dish.uses) {
    const prep = preps.get(use.preparationId);
    if (prep === undefined) continue;
    const share = Math.min(1, use.servings / prep.servingsMade);
    for (const line of prep.ingredients) visit(line, share);
  }

  // `>` strict et une `Map` parcourue dans l'ordre d'insertion: à égalité,
  // la première famille rencontrée reste.
  let best: Weighed | null = null;
  for (const candidate of byFamily.values()) {
    if (
      best === null ||
      candidate.tier < best.tier ||
      (candidate.tier === best.tier && candidate.grams > best.grams)
    ) {
      best = candidate;
    }
  }
  return best === null ? null : { family: best.family, group: best.group };
}

/**
 * Un `main_food` par plat, dans l'ordre de `plan.dishes`. Sans référentiel,
 * tous les plats valent `null`: on ne devine pas un aliment depuis un titre.
 */
export function mainFoodsOf(
  plan: AvoidPlan,
  index: CompositionIndex | null,
): Array<DishMainFood | null> {
  if (index === null) return plan.dishes.map(() => null);
  const preps = new Map(plan.preparations.map((p) => [p.id, p]));
  return plan.dishes.map((dish) => mainFoodOfDish(dish, preps, index));
}

export interface MainFoodCounts {
  dishes: number;
  /** Plats qui ont reçu un aliment principal. */
  named: number;
  /** Dont ceux nommés par leur protéine (rang 1). */
  by_protein: number;
  /** `true` quand le référentiel manquait: aucun plat n'a pu être nommé. */
  no_index: boolean;
}

/**
 * Le compteur journalisé à chaque génération. Sans lui, un référentiel absent
 * et un plan sans aucun aliment reconnu rendraient le même écran sans icônes.
 */
export function mainFoodCounts(
  foods: ReadonlyArray<DishMainFood | null>,
  index: CompositionIndex | null,
): MainFoodCounts {
  const named = foods.filter((f): f is DishMainFood => f !== null);
  return {
    dishes: foods.length,
    named: named.length,
    by_protein: named.filter((f) => AVOID_PROTEIN_GROUPS.has(f.group)).length,
    no_index: index === null,
  };
}
