/**
 * LA LISTE « À ÉVITER » — `plan_avoid_list.ts` et sa lecture en base.
 *
 * Les valeurs attendues sont écrites à la main, jamais recalculées depuis les
 * constantes du module: un test paramétré par sa propre constante reste vert
 * quand on la change.
 */
import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { buildCompositionIndex, type CompositionRef } from "./food_composition.ts";
import {
  type AvoidPlan,
  avoidedCameBack,
  avoidLineOf,
  avoidListFrom,
  readAvoidPlan,
} from "./plan_avoid_list.ts";
import { loadPreviousHouseholdPlans } from "./plan_avoid_list_io.ts";

// ---------------------------------------------------------------------------
// LE DÉCOR — un référentiel minuscule, avec des familles
// ---------------------------------------------------------------------------

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
  ref({ slug: "turkey_escalope", foodGroupRef: "poultry", family: "turkey" }),
  ref({ slug: "beef_mince", foodGroupRef: "red_meat", family: "beef" }),
  ref({ slug: "salmon", foodGroupRef: "fatty_fish", family: "salmon" }),
  ref({ slug: "cod", foodGroupRef: "white_fish", family: "cod" }),
  ref({ slug: "lentils_dry", foodGroupRef: "legumes", family: "lentils" }),
  ref({ slug: "egg", foodGroupRef: "eggs", family: "eggs" }),
  ref({ slug: "greek_yogurt", foodGroupRef: "dairy_yogurt" }),
  // Une ligne promue du sas: pas de famille.
  ref({ slug: "filets_de_colin", foodGroupRef: "white_fish", source: "sas" }),
  ref({ slug: "white_rice", foodGroupRef: "refined_grain", family: "rice" }),
  ref({ slug: "brown_rice", foodGroupRef: "whole_grain", family: "rice" }),
  ref({ slug: "white_pasta", foodGroupRef: "refined_grain", family: "pasta" }),
  ref({ slug: "potato", foodGroupRef: "starchy_veg", family: "potato" }),
  ref({ slug: "courgette", foodGroupRef: "non_starchy_veg" }),
], []);

type Json = Record<string, unknown>;

/** Une ligne telle que le plan l'écrit (snake_case), 150 g par défaut. */
function line(slug: string, grams: number | null = 150): Json {
  return { term: slug, ref: slug, ref_refused: false, grams_raw: grams };
}

function dish(slot: string, slugs: string[], uses: Json[] = []): Json {
  return { slot, ingredients: slugs.map((s) => line(s)), uses };
}

function plan(dishes: Json[], preparations: Json[] = []): AvoidPlan {
  return readAvoidPlan(dishes, preparations);
}

// ---------------------------------------------------------------------------
// 1. LA FAMILLE, PAS LE SLUG
// ---------------------------------------------------------------------------

Deno.test("deux slugs de poulet dans trois dîners font UNE entrée `chicken`", () => {
  const p = plan([
    dish("dinner", ["chicken_breast", "white_rice"]),
    dish("dinner", ["chicken_leg_meat", "white_pasta"]),
    dish("lunch", ["chicken_breast", "potato"]),
  ]);
  const { list, counters } = avoidListFrom({ previousPlans: [p], index: INDEX });
  assertEquals(list.proteins, ["chicken"]);
  // Riz, pâtes et pommes de terre: une fois chacun, donc pas « beaucoup revenus ».
  assertEquals(list.starches, []);
  assertEquals(counters.main_dishes_read, 3);
  assertEquals(counters.previous_plans, 1);
});

Deno.test("le riz blanc et le riz complet sont le même riz, à travers deux groupes", () => {
  const p = plan([
    dish("dinner", ["cod", "white_rice"]),
    dish("dinner", ["beef_mince", "brown_rice"]),
  ]);
  assertEquals(avoidListFrom({ previousPlans: [p], index: INDEX }).list.starches, ["rice"]);
});

Deno.test("une ligne sans famille (sas) compte sous son slug", () => {
  const p = plan([
    dish("dinner", ["filets_de_colin"]),
    dish("lunch", ["filets_de_colin"]),
  ]);
  assertEquals(avoidListFrom({ previousPlans: [p], index: INDEX }).list.proteins, [
    "filets_de_colin",
  ]);
});

// ---------------------------------------------------------------------------
// 2. CE QUI EST LU, ET CE QUI NE L'EST PAS
// ---------------------------------------------------------------------------

Deno.test("la protéine d'une PRÉPARATION compte, au prorata de la part tirée", () => {
  // 600 g de saumon pour 4 parts: chaque dîner en tire 150 g. 40 g de bœuf
  // pour 4 parts: 10 g par dîner, une pincée — pas l'aliment du plat.
  const p = plan(
    [
      dish("dinner", ["courgette"], [{ preparation_id: "pot", servings: 1 }]),
      dish("dinner", ["courgette"], [{ preparation_id: "pot", servings: 1 }]),
    ],
    [{
      id: "pot",
      servings_made: 4,
      ingredients: [line("salmon", 600), line("beef_mince", 40)],
    }],
  );
  assertEquals(avoidListFrom({ previousPlans: [p], index: INDEX }).list.proteins, ["salmon"]);
});

Deno.test("un poids inconnu compte; un poids connu sous 20 g ne compte pas", () => {
  const p = plan([
    { slot: "dinner", ingredients: [line("beef_mince", null)], uses: [] },
    { slot: "dinner", ingredients: [line("beef_mince", null)], uses: [] },
    { slot: "dinner", ingredients: [line("lentils_dry", 15)], uses: [] },
    { slot: "dinner", ingredients: [line("lentils_dry", 15)], uses: [] },
  ]);
  assertEquals(avoidListFrom({ previousPlans: [p], index: INDEX }).list.proteins, ["beef"]);
});

Deno.test("les petits-déjeuners sont ignorés, et le yaourt n'est jamais listé", () => {
  const p = plan([
    dish("breakfast", ["egg"]),
    dish("breakfast", ["egg"]),
    dish("breakfast", ["egg"]),
    dish("dinner", ["greek_yogurt", "courgette"]),
    dish("dinner", ["greek_yogurt", "courgette"]),
  ]);
  const { list, counters } = avoidListFrom({ previousPlans: [p], index: INDEX });
  assertEquals(list, { proteins: [], starches: [] });
  assertEquals(counters.main_dishes_read, 2);
});

Deno.test("une ligne que le référentiel ne connaît pas est comptée, jamais devinée", () => {
  const p = plan([
    { slot: "dinner", ingredients: [line("dragon_meat")], uses: [] },
  ]);
  assertEquals(avoidListFrom({ previousPlans: [p], index: INDEX }).counters.unresolved_lines, 1);
});

// ---------------------------------------------------------------------------
// 3. LE CLASSEMENT: 3 PROTÉINES + 2 FÉCULENTS
// ---------------------------------------------------------------------------

Deno.test("au plus 3 protéines et 2 féculents; vu une seule fois n'entre pas", () => {
  const p = plan([
    dish("dinner", ["chicken_breast", "white_rice"]),
    dish("dinner", ["chicken_breast", "white_rice"]),
    dish("dinner", ["chicken_breast", "white_rice"]),
    dish("dinner", ["chicken_breast", "white_pasta"]),
    dish("lunch", ["beef_mince", "white_pasta"]),
    dish("lunch", ["beef_mince", "potato"]),
    dish("lunch", ["beef_mince", "potato"]),
    dish("lunch", ["salmon"]),
    dish("lunch", ["salmon"]),
    dish("lunch", ["cod"]),
    dish("lunch", ["cod"]),
    dish("lunch", ["lentils_dry"]),
  ]);
  const { list } = avoidListFrom({ previousPlans: [p], index: INDEX });
  // Saumon et cabillaud à égalité (2 plats, même plan): l'ordre alphabétique.
  assertEquals(list.proteins, ["chicken", "beef", "cod"]);
  // Pâtes et pommes de terre à égalité: l'ordre alphabétique.
  assertEquals(list.starches, ["rice", "pasta"]);
});

Deno.test("à égalité, le plan le plus RÉCENT passe devant l'alphabet", () => {
  const recent = plan([
    dish("dinner", ["chicken_breast", "beef_mince", "salmon"]),
    dish("dinner", ["chicken_breast", "beef_mince", "salmon"]),
  ]);
  const older = plan([
    dish("dinner", ["chicken_breast", "beef_mince", "cod"]),
    dish("dinner", ["chicken_breast", "beef_mince", "cod"]),
  ]);
  const { list } = avoidListFrom({ previousPlans: [recent, older], index: INDEX });
  assertEquals(list.proteins, ["beef", "chicken", "salmon"]);
});

Deno.test("seuls les DEUX plans les plus récents sont relus", () => {
  const turkeyPlan = plan([dish("dinner", ["turkey_escalope"]), dish("dinner", ["turkey_escalope"])]);
  const empty = plan([dish("dinner", ["courgette"])]);
  const { list, counters } = avoidListFrom({
    previousPlans: [empty, empty, turkeyPlan],
    index: INDEX,
  });
  assertEquals(list.proteins, []);
  assertEquals(counters.previous_plans, 2);
});

// ---------------------------------------------------------------------------
// 4. CE QUE LA PERSONNE VEUT N'EST JAMAIS LISTÉ
// ---------------------------------------------------------------------------

Deno.test("un aliment à garder retire TOUTE sa famille, et la suivante prend la place", () => {
  const p = plan([
    dish("dinner", ["chicken_breast"]),
    dish("dinner", ["chicken_breast"]),
    dish("dinner", ["chicken_breast"]),
    dish("dinner", ["beef_mince"]),
    dish("dinner", ["beef_mince"]),
  ]);
  // Le garde-manger porte des cuisses; le plan d'avant, des filets.
  const { list, counters } = avoidListFrom({
    previousPlans: [p],
    index: INDEX,
    keepSlugs: ["chicken_leg_meat"],
  });
  assertEquals(list.proteins, ["beef"]);
  assertEquals(counters.kept_out, 1);
});

Deno.test("cas qui passe: rien à garder, rien de retiré", () => {
  const p = plan([dish("dinner", ["beef_mince"]), dish("dinner", ["beef_mince"])]);
  const { list, counters } = avoidListFrom({ previousPlans: [p], index: INDEX, keepSlugs: [] });
  assertEquals(list.proteins, ["beef"]);
  assertEquals(counters.kept_out, 0);
});

// ---------------------------------------------------------------------------
// 5. LES CAS VIDES
// ---------------------------------------------------------------------------

Deno.test("aucun plan d'avant ⇒ liste vide, compteurs à zéro", () => {
  const { list, counters } = avoidListFrom({ previousPlans: [], index: INDEX });
  assertEquals(list, { proteins: [], starches: [] });
  assertEquals(counters, {
    previous_plans: 0,
    main_dishes_read: 0,
    kept_out: 0,
    unresolved_lines: 0,
    no_index: false,
  });
});

Deno.test("référentiel absent ⇒ liste vide, et le compteur le DIT", () => {
  const p = plan([dish("dinner", ["beef_mince"]), dish("dinner", ["beef_mince"])]);
  const { list, counters } = avoidListFrom({ previousPlans: [p], index: null });
  assertEquals(list, { proteins: [], starches: [] });
  assertEquals(counters.no_index, true);
  assertEquals(counters.previous_plans, 1);
});

// ---------------------------------------------------------------------------
// 6. LA PHRASE
// ---------------------------------------------------------------------------

Deno.test("la phrase nomme les familles en mots, protéines puis féculents", () => {
  assertEquals(
    avoidLineOf({ proteins: ["chicken", "cured_meat"], starches: ["sweet_potato", "rice"] }),
    "EATEN A LOT IN THEIR RECENT PLANS — when you can, do not build a dish around: " +
      "chicken, cured meat (proteins); sweet potato, rice (starches). If the household " +
      "asked for one of them above, what they asked for wins.",
  );
});

Deno.test("la phrase sans protéine ne parle que des féculents", () => {
  assertEquals(
    avoidLineOf({ proteins: [], starches: ["pasta"] }),
    "EATEN A LOT IN THEIR RECENT PLANS — when you can, do not build a dish around: " +
      "pasta (starches). If the household asked for one of them above, what they " +
      "asked for wins.",
  );
});

Deno.test("liste vide ⇒ pas de phrase du tout", () => {
  assertEquals(avoidLineOf({ proteins: [], starches: [] }), null);
});

// ---------------------------------------------------------------------------
// 7. LE COMPTEUR SUR LE PLAN PRODUIT
// ---------------------------------------------------------------------------

Deno.test("compteur: le saumon revenu dans deux dîners est vu, dans l'ordre de la liste", () => {
  const produced = plan([
    dish("dinner", ["salmon", "white_rice"]),
    dish("dinner", ["salmon", "potato"]),
    dish("lunch", ["lentils_dry", "white_rice"]),
    dish("breakfast", ["white_pasta"]),
  ]);
  assertEquals(
    avoidedCameBack({
      plan: produced,
      index: INDEX,
      list: { proteins: ["beef", "salmon"], starches: ["pasta"] },
    }),
    { given: 3, came_back: ["salmon"], main_dishes: 3, dishes_with_avoided: 2 },
  );
});

Deno.test("compteur, cas qui passe: aucun aliment de la liste ⇒ rien de revenu", () => {
  const produced = plan([
    dish("dinner", ["cod", "potato"]),
    dish("lunch", ["lentils_dry", "white_rice"]),
  ]);
  assertEquals(
    avoidedCameBack({
      plan: produced,
      index: INDEX,
      list: { proteins: ["chicken"], starches: ["pasta"] },
    }),
    { given: 2, came_back: [], main_dishes: 2, dishes_with_avoided: 0 },
  );
});

Deno.test("compteur: liste vide ⇒ `given: 0`, jamais un « rien n'est revenu » trompeur", () => {
  const produced = plan([dish("dinner", ["chicken_breast"])]);
  const out = avoidedCameBack({
    plan: produced,
    index: INDEX,
    list: { proteins: [], starches: [] },
  });
  assertEquals(out.given, 0);
  assertEquals(out.main_dishes, 1);
});

// ---------------------------------------------------------------------------
// 8. LA LECTURE EN BASE — faux client strict
// ---------------------------------------------------------------------------

/** Rejoue la chaîne et note chaque appel, dans l'ordre. */
function fakeAdmin(result: { data?: unknown; error?: { message: string } | null }) {
  const calls: string[] = [];
  const chain: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of ["select", "eq", "is", "lt", "neq", "order"]) {
    chain[method] = (...args: unknown[]) => {
      calls.push(`${method}(${args.map((a) => JSON.stringify(a)).join(",")})`);
      return chain;
    };
  }
  chain.limit = (...args: unknown[]) => {
    calls.push(`limit(${args.map((a) => JSON.stringify(a)).join(",")})`);
    return Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
  };
  const client = {
    from(table: string) {
      calls.push(`from(${JSON.stringify(table)})`);
      if (table !== "student_generated_meals") throw new Error(`table inattendue: ${table}`);
      return chain;
    },
  };
  return { client, calls };
}

Deno.test("lecture: les filtres exacts, l'exclusion du plan remplacé, deux plans au plus", async () => {
  const { client, calls } = fakeAdmin({
    data: [
      {
        id: "p2",
        starts_on: "2026-09-14",
        dishes: [dish("dinner", ["salmon"])],
        preparations: [],
      },
    ],
  });
  const plans = await loadPreviousHouseholdPlans(client as never, {
    ownerUserId: "u1",
    householdId: "h1",
    beforeStartsOn: "2026-09-21",
    excludeId: "p3",
  });
  assertEquals(calls, [
    'from("student_generated_meals")',
    'select("id, starts_on, dishes, preparations")',
    'eq("user_id","u1")',
    'eq("household_id","h1")',
    'eq("plan_kind","household")',
    'is("retired_at",null)',
    'lt("starts_on","2026-09-21")',
    'neq("id","p3")',
    'order("starts_on",{"ascending":false})',
    "limit(2)",
  ]);
  assertEquals(plans.length, 1);
  assertEquals(plans[0].dishes[0].ingredients[0].ref, "salmon");
});

Deno.test("lecture: sans plan remplacé, aucun `neq`", async () => {
  const { client, calls } = fakeAdmin({ data: [] });
  await loadPreviousHouseholdPlans(client as never, {
    ownerUserId: "u1",
    householdId: "h1",
    beforeStartsOn: "2026-09-21",
    excludeId: null,
  });
  assert(!calls.some((c) => c.startsWith("neq(")), calls.join(" "));
});

Deno.test("lecture: une erreur REMONTE — c'est l'appelant qui décide de continuer", async () => {
  const { client } = fakeAdmin({ error: { message: "boom" } });
  await assertRejects(() =>
    loadPreviousHouseholdPlans(client as never, {
      ownerUserId: "u1",
      householdId: "h1",
      beforeStartsOn: "2026-09-21",
      excludeId: null,
    })
  );
});
