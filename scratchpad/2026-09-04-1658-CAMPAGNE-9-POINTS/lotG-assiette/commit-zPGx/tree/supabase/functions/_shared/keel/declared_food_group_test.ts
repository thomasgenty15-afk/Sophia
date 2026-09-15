// ⟳ LOT `L4` — UNE DANETTE CESSE D'ÊTRE COMPTÉE COMME DE LA PROTÉINE MAIGRE.
//
// ══════════════════════════════════════════════════════════════════════════
// ⛔ LE DÉFAUT, MESURÉ LE 2026-08-22, PAS SUPPOSÉ
// ══════════════════════════════════════════════════════════════════════════
// `augmentedIndexFor` écrivait `foodGroupRef: "lean_protein"` EN DUR sur chaque
// apport DÉCLARÉ. Sur les **7 apports déclarés en base** ce jour-là, un
// **Barleycup malt drink** porte 7 g de protéines pour 152 kcal — **18,4 %** de
// son énergie, contre 80 % pour une poudre. Le défaut ne guettait pas: il
// mordait déjà.
//
// ⛔ ET DEPUIS `L17`, UN GROUPE FAUX BORNE UNE ÉNERGIE. Mesuré sur l'index réel
// (923 lignes), un terme inconnu déclaré `lean_protein` à 150 g:
//   · index de base ................ **201 kcal** — bande `[110,4 ; 133,8]`
//   · + UN apport déclaré (whey) ... **538 kcal** — bande `[111,1 ; 358,4]`  ×2,7
//   · + UN Barleycup ............... **471 kcal**                            ×2,3
// Le référentiel ne porte que **3** lignes `lean_protein`: un intrus y pèse un
// quart de la bande.
//
// ⛔ SECOND COÛT: `lean_protein` porte `zincSource` à **2 lignes sur 3**, soit
// EXACTEMENT `SENTINEL_CARRIER_SHARE = 2/3`. Une déclaration de plus fait 2/4
// et le groupe SORT des porteurs — la boucle de correction cesse de savoir quel
// groupe réparerait un trou de zinc, pour les seuls élèves qui ont rempli le
// produit.
//
// ══════════════════════════════════════════════════════════════════════════
// ⛔ CE QUE CES ÉPREUVES PROTÈGENT, ET POURQUOI UN TEST DE FORME NE SUFFIT PAS
// ══════════════════════════════════════════════════════════════════════════
//   * ⛔ **LA GARDE A UN CAS QUI PASSE.** Un groupe déclaré et valide DOIT
//     traverser jusqu'à l'index. Sans ce cas-là, une garde qui refuserait
//     tout serait indiscernable d'une garde qui marche — la cicatrice
//     « une garde a besoin d'un cas qui passe », payée neuf fois sur cette
//     campagne.
//   * ⛔ **LE REPLI EST TESTÉ PAR SES LECTEURS, PAS PAR SA VALEUR.** Asserter
//     que le repli vaut telle chaîne serait un test de constante — il resterait
//     vert si `groupBandsFrom` se mettait un jour à compter les valeurs hors
//     vocabulaire. On vérifie donc que la BANDE et les PORTEURS DE SENTINELLE
//     ne bougent pas: c'est le comportement, pas le littéral.
//   * ⛔ **RIEN NE SORT DE L'INDEX.** L'énergie et la protéine de la
//     déclaration doivent rester lisibles. Le retrait de la ligne serait une
//     régression qui ferait passer tous les autres tests.
//   * ⛔ **LES DEUX POPULATIONS.** Ce que la déclaration PORTE et ce qui ATTEINT
//     l'index. Sans les deux, un écran qui cesse d'écrire `food_group` est
//     indiscernable d'un lecteur cassé — le défaut exact de `L17-0`.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  declaredGroupReachesIndex,
  DECLARED_INTAKE_GROUP_KEY,
  declaredIntakeGroupCounts,
  declaredIntakeGroupOf,
  UNGROUPED_DECLARED_INTAKE,
  ungroupedFoodGroup,
} from "./declared_food_group.ts";
import { closedGroupOrNull, persistedGroupOf } from "./food_group_write.ts";
import { augmentedIndexFor, parseFixedIntakes } from "./fixed_intakes.ts";
import {
  buildCompositionIndex,
  type CompositionRef,
} from "./food_composition.ts";
import { groupBandsFrom } from "./composition_fill.ts";
import { sentinelCarriersOf } from "./meal_verdict.ts";
import { FOOD_GROUP_REFS, type FoodGroupRef } from "./tokens.ts";

// ---------------------------------------------------------------------------
// LE MINI-RÉFÉRENTIEL — les TROIS vraies lignes `lean_protein` de la base
// locale au 2026-08-22, avec leurs vrais nombres. Deux portent le zinc: c'est
// le 2/3 qui rend le seuil `SENTINEL_CARRIER_SHARE` atteint À L'ÉGALITÉ, donc
// le cas le plus fragile — et le seul qui mesure quelque chose.
// ---------------------------------------------------------------------------

function ref(
  slug: string,
  group: string,
  kcal: number,
  protein: number,
  zinc: boolean,
): CompositionRef {
  return {
    slug,
    foodGroupRef: group as FoodGroupRef,
    label: slug,
    source: "ciqual",
    energyKcal: kcal,
    proteinG: protein,
    carbsG: 0,
    fatG: 0,
    fiberG: 0,
    omega3Marine: false,
    ironSource: false,
    calciumSource: false,
    iodineSource: false,
    zincSource: zinc,
    b12Source: false,
    folateSource: false,
    yieldClass: "neutral",
    atwaterDiscount: 1,
    energyDense: false,
    unitGrams: null,
    condimentGrams: null,
  };
}

const BASE = buildCompositionIndex([
  ref("pork_loin", "lean_protein", 123, 21.2, true),
  ref("ham", "lean_protein", 135, 20, true),
  ref("turkey_breast", "lean_protein", 109, 24.1, false),
], []);

/** Une entrée `fixed_intakes` telle qu'elle est en base, en snake_case. */
function rawIntake(
  label: string,
  grams: number,
  protein: number,
  kcal: number,
  group?: string,
): Record<string, unknown> {
  return {
    food_ref: `declared_${label.replace(/\W+/g, "_").toLowerCase()}`,
    label,
    amount: grams,
    unit: "g",
    days: [],
    nutrition: "declared",
    serving_grams: grams,
    protein_g_per_serving: protein,
    energy_kcal_per_serving: kcal,
    ...(group === undefined ? {} : { [DECLARED_INTAKE_GROUP_KEY]: group }),
  };
}

// La Danette du lot: 125 g, 4 g de protéines, 150 kcal — 10,7 % de l'énergie.
const DANETTE = rawIntake("ma Danette", 125, 4, 150);
// Le Barleycup RÉELLEMENT en base: 44 g, 7 g, 152 kcal — 18,4 %.
const BARLEYCUP = rawIntake("Barleycup malt drink", 44, 7, 152);
// Le Zorbax RÉELLEMENT en base: 47 g, 29 g, 187 kcal — 398 kcal/100 g.
const ZORBAX = rawIntake("Zorbax morning shake", 47, 29, 187);

function indexWith(...raw: Record<string, unknown>[]) {
  return augmentedIndexFor(BASE, parseFixedIntakes(raw).intakes);
}

function leanBand(idx: ReturnType<typeof indexWith>) {
  return groupBandsFrom(idx).get("lean_protein");
}

function leanIsZincCarrier(idx: ReturnType<typeof indexWith>): boolean {
  return sentinelCarriersOf(idx).get("zincSource")?.has("lean_protein") ?? false;
}

// ---------------------------------------------------------------------------
// ① LE CŒUR DU LOT — un dessert déclaré n'est plus de la protéine maigre
// ---------------------------------------------------------------------------

Deno.test("une Danette déclarée n'entre PAS dans `lean_protein`", () => {
  const idx = indexWith(DANETTE);
  const written = [...idx.bySlug.values()].find((r) =>
    r.slug.startsWith("declared_")
  );
  assert(written, "l'apport déclaré doit être dans l'index");
  assertEquals(
    written.foodGroupRef as string !== "lean_protein",
    true,
    "une Danette rangée en `lean_protein` est le défaut que ce lot ferme",
  );
  assertEquals(declaredGroupReachesIndex(written.foodGroupRef), false);
});

Deno.test(
  "⛔ LE COMPORTEMENT, PAS LE LITTÉRAL — la bande d'énergie de `lean_protein` ne bouge pas",
  () => {
    const before = leanBand(BASE)!;
    for (const [nom, entree] of [
      ["Danette", DANETTE],
      ["Barleycup", BARLEYCUP],
      ["Zorbax (whey, 398 kcal/100 g)", ZORBAX],
    ] as const) {
      const after = leanBand(indexWith(entree))!;
      assertEquals(
        [after.refs, after.energyLow, after.energyHigh],
        [before.refs, before.energyLow, before.energyHigh],
        `${nom} déplace la bande de \`lean_protein\` — donc la borne d'énergie de L17`,
      );
    }
  },
);

Deno.test(
  "⛔ `lean_protein` RESTE porteur de la sentinelle zinc — le seuil est à l'égalité (2/3)",
  () => {
    assert(leanIsZincCarrier(BASE), "prémisse: 2 lignes sur 3 portent le zinc");
    for (const entree of [DANETTE, BARLEYCUP, ZORBAX]) {
      assert(
        leanIsZincCarrier(indexWith(entree)),
        "un apport déclaré fait tomber `lean_protein` sous 2/3 et éteint le signal zinc",
      );
    }
    // Et l'effet est CUMULATIF: trois apports feraient 2/6 sans ce lot.
    assert(leanIsZincCarrier(indexWith(DANETTE, BARLEYCUP, ZORBAX)));
  },
);

// ---------------------------------------------------------------------------
// ② ⛔ LA GARDE A UN CAS QUI PASSE — un groupe déclaré traverse
// ---------------------------------------------------------------------------

Deno.test(
  "⛔ LE CAS QUI PASSE — un groupe DÉCLARÉ et valide atteint l'index tel quel",
  () => {
    const idx = indexWith(rawIntake("ma Danette", 125, 4, 150, "dairy_yogurt"));
    const written = [...idx.bySlug.values()].find((r) =>
      r.slug.startsWith("declared_")
    )!;
    assertEquals(written.foodGroupRef, "dairy_yogurt");
    assertEquals(declaredGroupReachesIndex(written.foodGroupRef), true);
    // Et il compte VRAIMENT: le groupe déclaré porte sa propre bande.
    const bands = groupBandsFrom(idx);
    assertEquals(
      bands.has("lean_protein"),
      true,
      "le groupe honoré ne doit pas emporter les autres",
    );
  },
);

Deno.test("un groupe déclaré et valide traverse pour CHACUN des 30 slugs", () => {
  for (const slug of FOOD_GROUP_REFS) {
    const idx = indexWith(rawIntake("x", 100, 10, 100, slug));
    const written = [...idx.bySlug.values()].find((r) =>
      r.slug.startsWith("declared_")
    )!;
    assertEquals(written.foodGroupRef, slug, `\`${slug}\` n'a pas traversé`);
  }
});

// ---------------------------------------------------------------------------
// ③ ⛔ RIEN NE SORT DU CALCUL — la régression qui passerait tous les tests ①
// ---------------------------------------------------------------------------

Deno.test(
  "⛔ LA PROTÉINE ET L'ÉNERGIE DÉCLARÉES RESTENT DANS L'INDEX (FF-051)",
  () => {
    const idx = indexWith(ZORBAX);
    const written = idx.bySlug.get("declared_zorbax_morning_shake");
    assert(
      written,
      "retirer la ligne remettrait 29 g de protéine hors du verdict — " +
        "le trou exact que FF-051 existe pour fermer",
    );
    // 187 kcal / 47 g ⇒ 397,9 kcal/100 g · 29 g ⇒ 61,7 g/100 g.
    assertEquals(Math.round(written.energyKcal), 398);
    assertEquals(Math.round(written.proteinG!), 62);
    assertEquals(written.unitGrams, 47);
  },
);

Deno.test("le repli ne touche PAS la branche `referential`", () => {
  const parse = parseFixedIntakes([{
    food_ref: "whey_protein_powder",
    label: "mon shaker",
    amount: 30,
    unit: "g",
    days: [],
  }]);
  assertEquals(parse.intakes.length, 1);
  assertEquals(parse.discarded, 0);
  // Aucune ligne synthétique: rien n'est déclaré.
  assertEquals(augmentedIndexFor(BASE, parse.intakes).bySlug.size, BASE.bySlug.size);
});

// ---------------------------------------------------------------------------
// ④ LA LECTURE DU GROUPE — le vocabulaire fermé, et rien d'autre
// ---------------------------------------------------------------------------

Deno.test("`declaredIntakeGroupOf` ne lève jamais et ne devine jamais", () => {
  assertEquals(declaredIntakeGroupOf(null), null);
  assertEquals(declaredIntakeGroupOf("dairy_yogurt"), null);
  assertEquals(declaredIntakeGroupOf([]), null);
  assertEquals(declaredIntakeGroupOf({}), null);
  assertEquals(declaredIntakeGroupOf({ food_group: "" }), null);
  assertEquals(declaredIntakeGroupOf({ food_group: "   " }), null);
  assertEquals(declaredIntakeGroupOf({ food_group: 12 }), null);
  // ⛔ Un slug INVENTÉ n'est pas un groupe, et ne retombe pas sur `lean_protein`.
  assertEquals(declaredIntakeGroupOf({ food_group: "protein" }), null);
  assertEquals(declaredIntakeGroupOf({ food_group: "dessert" }), null);
  assertEquals(declaredIntakeGroupOf({ food_group: "  sugar_sweets " }), "sugar_sweets");
});

Deno.test(
  "⛔ UN SEUL VOCABULAIRE — la lecture d'un apport et celle d'un ingrédient sont le même parseur",
  () => {
    for (const slug of FOOD_GROUP_REFS) {
      assertEquals(closedGroupOrNull(slug), slug);
      assertEquals(declaredIntakeGroupOf({ food_group: slug }), slug);
      assertEquals(persistedGroupOf({ group: slug }), slug);
    }
    for (const faux of ["protein", "veg", "dessert", "", "  ", "proteines"]) {
      assertEquals(closedGroupOrNull(faux), null, `\`${faux}\` a traversé`);
      assertEquals(declaredIntakeGroupOf({ food_group: faux }), null);
    }
    // ⚠️ MESURÉ, PAS SUPPOSÉ. La première écriture de cette épreuve attendait
    // `null` sur `"LEAN_PROTEIN "` puis sur `"lean protein"`, et elle est
    // tombée DEUX FOIS: `normalizeToken` (`tokens.ts:43`) rabat la casse ET
    // remplace les espaces. C'est une politesse d'entrée du parseur partagé.
    // Ce qui compte n'est pas qu'elle existe, c'est qu'elle soit LA MÊME des
    // deux côtés — très exactement ce qu'une seconde lecture maison aurait
    // fait diverger au premier ajustement.
    for (const politesse of ["LEAN_PROTEIN ", " Lean_Protein", "lean protein"]) {
      assertEquals(closedGroupOrNull(politesse), "lean_protein");
      assertEquals(declaredIntakeGroupOf({ food_group: politesse }), "lean_protein");
      assertEquals(persistedGroupOf({ group: politesse }), "lean_protein");
    }
  },
);

Deno.test(
  "⛔ UNE DÉCLARATION AU GROUPE INVENTÉ N'EST PAS JETÉE — ses trois nombres valent",
  () => {
    const parse = parseFixedIntakes([rawIntake("x", 100, 20, 200, "dessert")]);
    assertEquals(parse.discarded, 0, "un mot mal écrit ne coûte pas une protéine");
    assertEquals(parse.intakes.length, 1);
    const idx = augmentedIndexFor(BASE, parse.intakes);
    assertEquals(idx.bySlug.size, BASE.bySlug.size + 1);
    assertEquals(leanIsZincCarrier(idx), true);
  },
);

// ---------------------------------------------------------------------------
// ⑤ LE NEUTRE — prouvé hors vocabulaire, et traité comme une absence
// ---------------------------------------------------------------------------

Deno.test("le neutre n'est PAS un groupe, et aucun lecteur ne le prend pour un", () => {
  assertEquals(
    (FOOD_GROUP_REFS as readonly string[]).includes(UNGROUPED_DECLARED_INTAKE),
    false,
  );
  assertEquals(closedGroupOrNull(UNGROUPED_DECLARED_INTAKE), null);
  assertEquals(declaredGroupReachesIndex(ungroupedFoodGroup()), false);
  // `groupBandsFrom` le saute: aucune bande ne naît du neutre.
  const idx = indexWith(DANETTE, BARLEYCUP, ZORBAX);
  assertEquals(
    groupBandsFrom(idx).has(ungroupedFoodGroup()),
    false,
    "le neutre a fabriqué une bande — un groupe fantôme bornerait une énergie",
  );
});

// ---------------------------------------------------------------------------
// ⑥ ⛔ LES DEUX POPULATIONS — la cicatrice `L17-0`, au même endroit
// ---------------------------------------------------------------------------

Deno.test("⛔ DEUX POPULATIONS: ce que la déclaration porte, ce qui atteint l'index", () => {
  // Le cas NOMINAL du 2026-08-22: 7 déclarés en base, AUCUN ne nomme de groupe.
  const rien = declaredIntakeGroupCounts(
    [DANETTE, BARLEYCUP, ZORBAX],
    [ungroupedFoodGroup(), ungroupedFoodGroup(), ungroupedFoodGroup()],
  );
  assertEquals(rien, {
    declared: 3,
    declaresGroup: 0,
    valid: 0,
    refused: 0,
    reachesIndex: 0,
    ungrouped: 3,
  });

  // Un écran qui écrit le groupe: les deux populations montent ENSEMBLE.
  const plein = declaredIntakeGroupCounts(
    [
      rawIntake("a", 100, 4, 150, "dairy_yogurt"),
      rawIntake("b", 100, 7, 152, "coffee_tea"),
      rawIntake("c", 100, 29, 187, "lean_protein"),
    ],
    ["dairy_yogurt", "coffee_tea", "lean_protein"],
  );
  assertEquals(plein.declaresGroup, 3);
  assertEquals(plein.valid, 3);
  assertEquals(plein.reachesIndex, 3);
  assertEquals(plein.ungrouped, 0);

  // ⛔ UN ÉCRAN QUI ÉCRIT UN SLUG INVENTÉ: `refused` le dit, `reachesIndex` non.
  const faux = declaredIntakeGroupCounts(
    [rawIntake("a", 100, 4, 150, "dessert")],
    [ungroupedFoodGroup()],
  );
  assertEquals([faux.declaresGroup, faux.valid, faux.refused], [1, 0, 1]);
  assertEquals(faux.reachesIndex, 0);

  // ⛔ LE CAS QUI SÉPARE LES DEUX POPULATIONS, et la RAISON du compteur:
  // la déclaration porte le groupe, et il n'atteint PAS l'index. C'est la
  // forme exacte du défaut `L17-0` (242 déclarés, 0 persistés).
  const perdu = declaredIntakeGroupCounts(
    [rawIntake("a", 100, 4, 150, "dairy_yogurt")],
    [ungroupedFoodGroup()],
  );
  assertEquals([perdu.declaresGroup, perdu.valid, perdu.reachesIndex], [1, 1, 0]);

  // ⛔ ET L'INVERSE, qui dirait qu'un SECOND écrivain existe.
  const jumeau = declaredIntakeGroupCounts([DANETTE], ["lean_protein"]);
  assertEquals([jumeau.declaresGroup, jumeau.reachesIndex], [0, 1]);

  // ⚠️ `declared` EST LE DÉNOMINATEUR: sans lui, 0 sur rien et 0 sur huit
  // sont le même nombre.
  assertEquals(declaredIntakeGroupCounts([], []).declared, 0);
  assertEquals(
    declaredIntakeGroupCounts([{ nutrition: "referential" }, "x", null], []).declared,
    0,
  );
});

Deno.test("le compteur ne compte QUE les apports en composition déclarée", () => {
  const counts = declaredIntakeGroupCounts(
    [
      { food_ref: "apple", nutrition: "referential", food_group: "other_fruit" },
      { food_ref: "pear", food_group: "other_fruit" },
      rawIntake("c", 100, 29, 187, "lean_protein"),
    ],
    ["lean_protein"],
  );
  assertEquals([counts.declared, counts.declaresGroup, counts.reachesIndex], [1, 1, 1]);
});

// ---------------------------------------------------------------------------
// ⑦ LE BOUT EN BOUT — le jsonb réel de la base traverse le parseur et l'index
// ---------------------------------------------------------------------------

Deno.test(
  "⛔ LES 7 APPORTS DÉCLARÉS RÉELS DU 2026-08-22: 0 en `lean_protein`",
  () => {
    const reels = [
      rawIntake("shaker du soir", 30, 24, 120),
      rawIntake("Vanilla whey shake", 31, 24, 118),
      rawIntake("Barleycup malt drink", 44, 7, 152),
      rawIntake("whey shaker after training", 30, 24, 120),
      rawIntake("Zorbax morning shake", 47, 29, 187),
      rawIntake("the evening tub", 32, 24, 128),
      rawIntake("ma Danette", 125, 4, 150),
    ];
    let enLeanProtein = 0;
    for (const brut of reels) {
      const idx = indexWith(brut);
      const written = [...idx.bySlug.values()].find((r) =>
        r.slug.startsWith("declared_")
      )!;
      if (written.foodGroupRef as string === "lean_protein") enLeanProtein++;
      // Chacun, SEUL, laisse la bande et la sentinelle intactes.
      assertEquals(leanBand(idx)!.refs, leanBand(BASE)!.refs);
      assert(leanIsZincCarrier(idx));
    }
    assertEquals(enLeanProtein, 0, "7 apports déclarés, 0 doit porter `lean_protein`");
  },
);
