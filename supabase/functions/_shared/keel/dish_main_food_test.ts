/**
 * L'ALIMENT PRINCIPAL D'UN PLAT — `dish_main_food.ts`.
 *
 * Les valeurs attendues sont écrites à la main, jamais recalculées depuis les
 * constantes du module.
 */
import { assertEquals } from "jsr:@std/assert@1";
import {
  buildCompositionIndex,
  type CompositionRef,
} from "./food_composition.ts";
import { mainFoodCounts, mainFoodsOf } from "./dish_main_food.ts";
import { type AvoidPlan, readAvoidPlan } from "./plan_avoid_list.ts";

function ref(over: Partial<CompositionRef> & { slug: string }): CompositionRef {
  return {
    foodGroupRef: "non_starchy_veg",
    label: over.slug,
    source: "ciqual",
    energyKcal: 100,
    proteinG: 2,
    carbsG: 10,
    fatG: 1,
    fiberG: 2,
    omega3Marine: false,
    ironSource: false,
    calciumSource: false,
    iodineSource: false,
    zincSource: false,
    b12Source: false,
    folateSource: false,
    yieldClass: "neutral",
    yieldFactor: null,
    atwaterDiscount: 1,
    energyDense: false,
    unitGrams: null,
    condimentGrams: null,
    ...over,
  };
}

const INDEX = buildCompositionIndex([
  ref({ slug: "chicken_breast", foodGroupRef: "poultry", family: "chicken" }),
  ref({ slug: "chicken_leg_meat", foodGroupRef: "poultry", family: "chicken" }),
  ref({ slug: "beef_mince", foodGroupRef: "red_meat", family: "beef" }),
  ref({ slug: "salmon", foodGroupRef: "fatty_fish", family: "salmon" }),
  ref({ slug: "egg", foodGroupRef: "eggs", family: "eggs" }),
  ref({ slug: "chickpeas", foodGroupRef: "legumes", family: "chickpeas" }),
  ref({ slug: "greek_yogurt", foodGroupRef: "dairy_yogurt" }),
  ref({ slug: "parmesan", foodGroupRef: "dairy_cheese" }),
  ref({ slug: "white_rice", foodGroupRef: "refined_grain", family: "rice" }),
  ref({ slug: "white_pasta", foodGroupRef: "refined_grain", family: "pasta" }),
  ref({ slug: "potato", foodGroupRef: "starchy_veg", family: "potato" }),
  ref({ slug: "oats", foodGroupRef: "whole_grain", family: "oats" }),
  ref({
    slug: "broccoli",
    foodGroupRef: "cruciferous_veg",
    family: "broccoli",
  }),
  ref({
    slug: "tomato_cherry",
    foodGroupRef: "non_starchy_veg",
    family: "tomato",
  }),
  ref({ slug: "passata", foodGroupRef: "non_starchy_veg", family: "tomato" }),
  ref({
    slug: "courgette",
    foodGroupRef: "non_starchy_veg",
    family: "courgette",
  }),
  ref({ slug: "onion", foodGroupRef: "non_starchy_veg", family: "onion" }),
  ref({ slug: "banana", foodGroupRef: "other_fruit", family: "banana" }),
  ref({ slug: "olive_oil", foodGroupRef: "olive_oil" }),
  // Une ligne promue du sas: pas de famille.
  ref({ slug: "filets_de_colin", foodGroupRef: "white_fish", source: "sas" }),
], []);

type Json = Record<string, unknown>;

function line(slug: string, grams: number | null): Json {
  return { term: slug, ref: slug, ref_refused: false, grams_raw: grams };
}

function dish(lines: Json[], uses: Json[] = []): Json {
  return { slot: "dinner", ingredients: lines, uses };
}

function plan(dishes: Json[], preparations: Json[] = []): AvoidPlan {
  return readAvoidPlan(dishes, preparations);
}

function mainOf(dishes: Json[], preparations: Json[] = []) {
  return mainFoodsOf(plan(dishes, preparations), INDEX);
}

// ---------------------------------------------------------------------------
// 1. LA PROTÉINE D'ABORD
// ---------------------------------------------------------------------------

Deno.test("200 g de brocoli ne passent pas devant 150 g de poulet", () => {
  assertEquals(
    mainOf([
      dish([
        line("chicken_breast", 150),
        line("white_rice", 80),
        line("broccoli", 200),
      ]),
    ]),
    [{ family: "chicken", group: "poultry" }],
  );
});

Deno.test("entre deux protéines, la plus lourde", () => {
  assertEquals(
    mainOf([dish([line("egg", 60), line("beef_mince", 120)])]),
    [{ family: "beef", group: "red_meat" }],
  );
});

Deno.test("les légumineuses sont une protéine", () => {
  assertEquals(
    mainOf([dish([line("chickpeas", 90), line("tomato_cherry", 250)])]),
    [{ family: "chickpeas", group: "legumes" }],
  );
});

Deno.test("deux slugs de poulet s'additionnent sous la famille", () => {
  // 70 + 70 = 140 g de poulet contre 100 g de bœuf.
  assertEquals(
    mainOf([dish([
      line("chicken_breast", 70),
      line("beef_mince", 100),
      line("chicken_leg_meat", 70),
    ])]),
    [{ family: "chicken", group: "poultry" }],
  );
});

// ---------------------------------------------------------------------------
// 2. SANS PROTÉINE, LE VÉGÉTAL LE PLUS LOURD
// ---------------------------------------------------------------------------

Deno.test("sans protéine, la tomate de deux lignes passe devant les pâtes", () => {
  // 120 + 100 = 220 g de tomate contre 100 g de pâtes.
  assertEquals(
    mainOf([dish([
      line("white_pasta", 100),
      line("tomato_cherry", 120),
      line("passata", 100),
      line("parmesan", 30),
    ])]),
    [{ family: "tomato", group: "non_starchy_veg" }],
  );
});

Deno.test("des pommes de terre sautées sont des pommes de terre, pas de l'oignon", () => {
  assertEquals(
    mainOf([
      dish([line("potato", 300), line("onion", 50), line("olive_oil", 15)]),
    ]),
    [{ family: "potato", group: "starchy_veg" }],
  );
});

Deno.test("un porridge à la banane: le fruit, quand il pèse plus que les flocons", () => {
  assertEquals(
    mainOf([
      dish([line("oats", 50), line("banana", 100), line("greek_yogurt", 150)]),
    ]),
    [{ family: "banana", group: "other_fruit" }],
  );
});

Deno.test("sans végétal, le laitage", () => {
  assertEquals(
    mainOf([dish([line("greek_yogurt", 200)])]),
    [{ family: "greek_yogurt", group: "dairy_yogurt" }],
  );
});

Deno.test("rien de reconnu ⇒ null", () => {
  assertEquals(mainOf([dish([line("olive_oil", 15), line("inconnu", 200)])]), [
    null,
  ]);
});

// ---------------------------------------------------------------------------
// 3. CE QUI EST LU, ET CE QUI NE L'EST PAS
// ---------------------------------------------------------------------------

Deno.test("la protéine d'une PRÉPARATION compte, au prorata de la part tirée", () => {
  // 600 g de saumon pour 4 parts: 150 g dans ce plat. Le plat lui-même ne
  // porte que 200 g de courgette.
  assertEquals(
    mainOf(
      [dish([line("courgette", 200)], [{
        preparation_id: "pot",
        servings: 1,
      }])],
      [{ id: "pot", servings_made: 4, ingredients: [line("salmon", 600)] }],
    ),
    [{ family: "salmon", group: "fatty_fish" }],
  );
});

Deno.test("une pincée de protéine (moins de 20 g) ne nomme pas le plat", () => {
  // 40 g de bœuf pour 4 parts: 10 g dans ce plat.
  assertEquals(
    mainOf(
      [dish([line("courgette", 200)], [{
        preparation_id: "pot",
        servings: 1,
      }])],
      [{ id: "pot", servings_made: 4, ingredients: [line("beef_mince", 40)] }],
    ),
    [{ family: "courgette", group: "non_starchy_veg" }],
  );
});

Deno.test("un poids inconnu compte pour 0 g, mais une protéine non pesée reste une protéine", () => {
  assertEquals(
    mainOf([dish([line("egg", null), line("broccoli", 200)])]),
    [{ family: "eggs", group: "eggs" }],
  );
  assertEquals(
    mainOf([dish([line("egg", null), line("beef_mince", 100)])]),
    [{ family: "beef", group: "red_meat" }],
  );
});

Deno.test("à poids égal, la première famille rencontrée", () => {
  assertEquals(
    mainOf([dish([line("salmon", 120), line("chicken_breast", 120)])]),
    [{ family: "salmon", group: "fatty_fish" }],
  );
});

Deno.test("une ligne sans famille (sas) est nommée par son slug", () => {
  assertEquals(
    mainOf([dish([line("filets_de_colin", 150)])]),
    [{ family: "filets_de_colin", group: "white_fish" }],
  );
});

Deno.test("les à-côtés ne sont pas lus", () => {
  const withSide = {
    ...dish([line("courgette", 200)]),
    side_courses: [{
      kind: "bread",
      term: "pain",
      ref: "white_pasta",
      grams: 300,
    }],
  };
  assertEquals(mainOf([withSide]), [{
    family: "courgette",
    group: "non_starchy_veg",
  }]);
});

// ---------------------------------------------------------------------------
// 4. SANS RÉFÉRENTIEL, ET LE COMPTEUR
// ---------------------------------------------------------------------------

Deno.test("sans référentiel, chaque plat vaut null et le compteur le dit", () => {
  const p = plan([
    dish([line("chicken_breast", 150)]),
    dish([line("potato", 300)]),
  ]);
  const foods = mainFoodsOf(p, null);
  assertEquals(foods, [null, null]);
  assertEquals(mainFoodCounts(foods, null), {
    dishes: 2,
    named: 0,
    by_protein: 0,
    no_index: true,
  });
});

Deno.test("le compteur distingue les plats nommés par leur protéine", () => {
  const foods = mainOf([
    dish([line("chicken_breast", 150)]),
    dish([line("potato", 300)]),
    dish([line("olive_oil", 15)]),
  ]);
  assertEquals(mainFoodCounts(foods, INDEX), {
    dishes: 3,
    named: 2,
    by_protein: 1,
    no_index: false,
  });
});
