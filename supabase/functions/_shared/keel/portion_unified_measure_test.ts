/**
 * LOT B — UN SEUL LECTEUR, DES PRÉLÈVEMENTS RÉELS, ET UNE CIBLE EXPLICITE.
 *
 * Ce fichier tient les quatre propriétés que le lot promet en plus de la règle
 * d'eau (testée, elle, dans `preparation_mass_test.ts`):
 *
 *   B3  le dimensionnement, les applicateurs de boîtes et le densifieur lisent
 *       la MÊME mesure de casserole;
 *   B4  les kcal d'une boîte viennent des items PRÉSENTS DANS CETTE BOÎTE, pas
 *       d'une part conventionnelle `1 / servingsMade`;
 *   B5  après `applySizing` et ses arrondis, on remesure ce qui est ÉCRIT —
 *       **à une bouche comme à cinq**, sans exception `single_mouth`;
 *   B6  la cible du moteur est explicite: personne ne la reconstruit depuis le
 *       milieu d'une bande asymétrique;
 *   B7  `Dpréf` reste `Dmin × REPAIR_DENSITY_HEADROOM` (arbitrage A15), et
 *       `100 × E / Gpréf` sort À CÔTÉ, avec sa divergence.
 */
import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";
import {
  buildCompositionIndex,
  type CompositionRef,
} from "./food_composition.ts";
import {
  applySizing,
  clampToBounds,
  densityCorridorFor,
  drawsByPreparation,
  finalPortionCheck,
  type PlateBounds,
  plateBoundsFor,
  REPAIR_DENSITY_HEADROOM,
  sizeDishForMouth,
  standardPortionOf,
} from "./portion_sizing.ts";
import { boxNutrition, potDensities, potProteinPerGram } from "./mouth_energy.ts";
import { densityFromComposition } from "./box_densify.ts";
import { measurePreparation } from "./preparation_mass.ts";
import { slotPlanTargets } from "./mouth_anchor.ts";

function ref(over: Partial<CompositionRef> & { slug: string }): CompositionRef {
  return {
    foodGroupRef: "refined_grain",
    label: over.slug,
    source: "ciqual",
    energyKcal: 350,
    proteinG: 7,
    carbsG: 78,
    fatG: 1,
    fiberG: 1,
    omega3Marine: false,
    ironSource: false,
    calciumSource: false,
    iodineSource: false,
    zincSource: false,
    b12Source: false,
    folateSource: false,
    yieldClass: "neutral",
    yieldFactor: null,
    atwaterDiscount: 1.0,
    energyDense: false,
    unitGrams: null,
    condimentGrams: null,
    ...over,
  } as CompositionRef;
}

const INDEX = buildCompositionIndex([
  ref({ slug: "rice", yieldClass: "grain_absorbs" }),
  ref({ slug: "lentils", foodGroupRef: "legumes", energyKcal: 330, proteinG: 25, yieldClass: "legume_absorbs" }),
  ref({ slug: "water", foodGroupRef: "water", energyKcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 }),
  ref({ slug: "oil", foodGroupRef: "olive_oil", energyKcal: 900, proteinG: 0, carbsG: 0, fatG: 100, fiberG: 0, energyDense: true }),
  ref({ slug: "chicken", foodGroupRef: "poultry", energyKcal: 121, proteinG: 23, carbsG: 0, fatG: 2.6, fiberG: 0, yieldClass: "meat_shrinks" }),
], []);

function g(term: string, amount: number, unit: "g" | "ml" = "g") {
  return { term, amount, unit, state: unit === "ml" ? null : ("raw" as const) };
}

// ═══════════════════════════════════════════════════════════════════════════
// B3 — UN SEUL LECTEUR
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("B3 — la casserole a UNE masse et UNE densité dans tout le moteur", () => {
  // Une casserole de lentilles (eau CONSERVÉE) et une de riz (eau ABSORBÉE):
  // les deux règles sont exercées, et les trois lecteurs doivent s'accorder.
  const pots = [
    { id: "p_lentils", method: "mijoter", ingredients: [g("lentils", 200), g("water", 400, "ml"), g("oil", 20)] },
    { id: "p_rice", method: "bouillir", ingredients: [g("rice", 100), g("water", 300, "ml")] },
  ];
  const measures = pots.map((p) => measurePreparation(INDEX, p));
  assertEquals(measures[0].water, "kept");
  assertEquals(measures[1].water, "absorbed");
  assertEquals(measures[0].readyG, 200 * 2.4 + 400 + 20);
  assertEquals(measures[1].readyG, 260);

  // ① `potDensities` — l'applicateur de boîtes (`mouth_energy.ts`).
  const dens = potDensities(
    INDEX,
    pots.map((p) => ({ id: p.id, servingsMade: 1, method: p.method, ingredients: p.ingredients })),
  );
  // ② `densityFromComposition` — le densifieur (`box_densify.ts`).
  // deno-lint-ignore no-explicit-any
  const densify = densityFromComposition(INDEX, pots as any);
  for (const [i, p] of pots.entries()) {
    const attendu = measures[i].kcal! / measures[i].readyG!;
    assertEquals(dens.get(p.id), attendu, `potDensities ${p.id}`);
    assertEquals(
      densify({ term: p.id, grams: 100, preparationId: p.id }).kcalPerGram,
      attendu,
      `densityFromComposition ${p.id}`,
    );
  }
  // ③ `applySizing` — ce qu'il ÉCRIT dans la boîte, à facteur 1 et un tirage.
  const applied = applySizing({
    meal: {
      dishes: [{ day: "mon", slot: "dinner", method: "", ingredients: [], uses: [{ preparationId: "p_rice" }] }],
      preparations: pots.map((p) => ({ ...p, servingsMade: 1 })),
    },
    memberId: "m1",
    rows: [{ dishIndex: 0, factor: 1, sized: true }],
    index: INDEX,
  });
  assertEquals(applied.dishes[0].boxes[0].items[0].grams, 260);
});

Deno.test("B3 — mesurer l'assiette et mesurer les composants appliqués donnent le même nombre", () => {
  // ⛔ C'EST LE CRITÈRE DE FIN DU LOT, écrit en une assertion. Deux casseroles
  // aux règles d'eau OPPOSÉES, deux plats qui les tirent, et le verdict d'avant
  // application doit décrire ce que l'application écrit.
  const meal = {
    dishes: [
      { day: "mon", slot: "lunch", method: "", ingredients: [g("oil", 10)], uses: [{ preparationId: "p_lentils" }, { preparationId: "p_rice" }] },
      { day: "tue", slot: "lunch", method: "", ingredients: [], uses: [{ preparationId: "p_lentils" }] },
      { day: "wed", slot: "lunch", method: "", ingredients: [], uses: [{ preparationId: "p_rice" }] },
    ],
    preparations: [
      { id: "p_lentils", method: "mijoter", servingsMade: 1, ingredients: [g("lentils", 200), g("water", 400, "ml"), g("oil", 20)] },
      { id: "p_rice", method: "bouillir", servingsMade: 1, ingredients: [g("rice", 300), g("water", 900, "ml")] },
    ],
  };
  const draws = drawsByPreparation(meal.dishes);
  assertEquals(draws.get("p_lentils"), 2);
  assertEquals(draws.get("p_rice"), 2);

  const std = standardPortionOf({
    index: INDEX,
    dish: meal.dishes[0],
    uses: meal.dishes[0].uses,
    preparations: meal.preparations,
    drawsByPrep: draws,
  });
  const applied = applySizing({
    meal,
    memberId: "m1",
    rows: meal.dishes.map((_, i) => ({ dishIndex: i, factor: 1, sized: true })),
    index: INDEX,
  });
  const ecrit = applied.dishes[0].boxes[0].items.reduce(
    (n: number, it: { grams: number }) => n + it.grams,
    0,
  );
  // ⚠️ L'ÉGALITÉ EST AU GRAMME PRÈS, et l'écart résiduel est celui des ARRONDIS
  // que `applySizing` pose item par item — jamais une règle différente.
  assert(
    Math.abs(ecrit - std.cookedG!) <= applied.dishes[0].boxes[0].items.length,
    `mesuré ${std.cookedG} g, écrit ${ecrit} g`,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// B4 — LES PRÉLÈVEMENTS PERSONNALISÉS
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("B4 — deux boîtes qui tirent DIFFÉREMMENT de la même casserole n'ont pas les mêmes kcal", () => {
  // ⛔ LE DÉFAUT DU RAPPORT D'ORIGINE (§ 1 de l'enquête): il divisait les kcal
  // d'une part CONVENTIONNELLE (`uses.servings / servingsMade`) par la masse
  // d'une AUTRE (les boîtes personnalisées). Une boîte vaut ce que SES items
  // pèsent, et rien d'autre.
  const dish = {
    day: "mon",
    slot: "dinner",
    method: "",
    ingredients: [],
    uses: [{ preparationId: "p_rice", servings: 1 }],
    boxes: [
      { id: "b_grande", memberIds: ["m_grand"], items: [{ grams: 390, preparationId: "p_rice" }], legacyTotalGrams: null },
      { id: "b_petite", memberIds: ["m_petit"], items: [{ grams: 130, preparationId: "p_rice" }], legacyTotalGrams: null },
    ],
  };
  const preparations = [
    { id: "p_rice", servingsMade: 2, method: "bouillir", ingredients: [g("rice", 200), g("water", 600, "ml")] },
  ];
  const per = boxNutrition({ index: INDEX, dishes: [dish], preparations });
  assertEquals(per.length, 2);
  const grande = per.find((b) => b.boxId === "b_grande")!;
  const petite = per.find((b) => b.boxId === "b_petite")!;

  // La casserole: 200 g de riz ⇒ 520 g prêts, 700 kcal ⇒ 1,346 kcal/g.
  assertEquals(measurePreparation(INDEX, preparations[0]).readyG, 520);
  assertEquals(grande.kcal, 390 * (700 / 520));
  assertEquals(petite.kcal, 130 * (700 / 520));
  // ⛔ ET SURTOUT PAS LA MOITIÉ CHACUNE. `servingsMade: 2` donnerait 350 kcal
  // aux deux; les grammes réellement tirés en donnent 525 et 175.
  assertEquals(Math.round(grande.kcal!), 525);
  assertEquals(Math.round(petite.kcal!), 175);
  assertEquals(grande.kcal! / petite.kcal!, 3);
  assert(grande.kcal !== 350 && petite.kcal !== 350, "aucune part égale n'est fabriquée");

  // La protéine suit le MÊME prélèvement. 200 g de riz ⇒ 14 g sur 520 g prêts.
  const prot = potProteinPerGram(INDEX, preparations).get("p_rice")!;
  assertEquals(grande.proteinG, Math.round(390 * prot * 10) / 10);
  assertEquals(petite.proteinG, Math.round(130 * prot * 10) / 10);
  assertEquals(grande.proteinG! / petite.proteinG!, 3);
});

// ═══════════════════════════════════════════════════════════════════════════
// B5 — LA MESURE APRÈS APPLICATION, ACTIVE À **UNE** BOUCHE
// ═══════════════════════════════════════════════════════════════════════════

/** Les bornes d'un dîner d'adulte, pour une part de moment donnée. */
function bornes(slotTargetKcal: number | null): PlateBounds {
  return plateBoundsFor({
    ageYears: 35,
    slot: "dinner",
    slotTargetKcal,
    light: false,
    appetite: null,
  });
}

Deno.test("B5 — un foyer d'UNE bouche est mesuré, pas exempté", () => {
  const meal = {
    dishes: [{
      day: "mon",
      slot: "dinner",
      method: "",
      ingredients: [],
      uses: [{ preparationId: "p_rice" }],
    }],
    preparations: [
      { id: "p_rice", method: "bouillir", servingsMade: 1, ingredients: [g("rice", 400), g("water", 1200, "ml")] },
    ],
  };
  const applied = applySizing({
    meal,
    memberId: "m_seul",
    rows: [{ dishIndex: 0, factor: 1, sized: true }],
    index: INDEX,
  });
  // 400 g de riz ⇒ 1 040 g prêts. Le plafond d'un dîner d'adulte est 700 g.
  const check = finalPortionCheck({
    index: INDEX,
    dishes: applied.dishes.map((d) => ({
      day: d.day,
      slot: d.slot,
      method: d.method,
      ingredients: d.ingredients,
      uses: (d.uses ?? []).map((u: { preparationId: string }) => ({ preparationId: u.preparationId, servings: 1 })),
      boxes: d.boxes,
    })),
    preparations: applied.preparations.map((p) => ({
      id: p.id,
      servingsMade: p.servingsMade ?? 1,
      method: p.method,
      ingredients: p.ingredients,
    })),
    plateFor: () => bornes(null),
  });
  // ⛔ AUCUNE ABSTENTION `single_mouth`. C'est le trou du § 4 de l'enquête:
  // « le contrôle final appelle un chemin qui s'abstient pour `single_mouth` ».
  assertEquals(check.measured, true);
  assertEquals(check.reason, "remeasured_after_apply");
  assertEquals(check.boxes, 1);
  assertEquals(check.judged, 1);
  assertEquals(check.verdicts.over_max, 1, "1 040 g écrits contre un plafond de 700");
  assertEquals(check.outOfBounds.length, 1);
  assertEquals(check.outOfBounds[0].grams, 1040);
  assertEquals(check.outOfBounds[0].limit, 700);
  assertEquals(check.outOfBounds[0].bound, "max");
  // ⚠️ LE JOURNAL NE NOMME PERSONNE: pas de `member_id` dans les dépassements.
  assertEquals(
    Object.keys(check.outOfBounds[0]).sort(),
    ["bound", "day", "grams", "limit", "slot"],
  );
  // Et l'eau du riz est comptée comme absorbée, une fois, sur sa casserole.
  assertEquals(check.water.absorbed, 1);
  assertEquals(check.water.undetermined, 0);
});

Deno.test("B5 — la remesure porte sur les grammes ÉCRITS, pas sur la part annoncée", () => {
  // ⛔ C'EST EXACTEMENT LE CAS DES 727 g: le moteur annonce une masse, la borne
  // rabote le facteur, l'applicateur écrit — et c'est l'ÉCRIT qu'on juge.
  const meal = {
    dishes: [{
      day: "mon",
      slot: "dinner",
      method: "",
      ingredients: [],
      uses: [{ preparationId: "p_rice" }],
    }],
    preparations: [
      { id: "p_rice", method: "bouillir", servingsMade: 1, ingredients: [g("rice", 400), g("water", 1200, "ml")] },
    ],
  };
  const draws = drawsByPreparation(meal.dishes);
  const std = standardPortionOf({
    index: INDEX,
    dish: meal.dishes[0],
    uses: meal.dishes[0].uses,
    preparations: meal.preparations,
    drawsByPrep: draws,
  });
  assertEquals(std.cookedG, 1040);
  const b = bornes(null);
  const sized = clampToBounds({
    sized: sizeDishForMouth({ standard: std, targetKcal: 1400, bounds: b }),
    standard: std,
    bounds: b,
  });
  assertEquals(sized.personCookedG, 700, "la borne rabote l'annonce à 700 g");

  const applied = applySizing({
    meal,
    memberId: "m_seul",
    rows: [{ dishIndex: 0, factor: sized.factor, sized: true }],
    index: INDEX,
  });
  const check = finalPortionCheck({
    index: INDEX,
    dishes: applied.dishes.map((d) => ({
      day: d.day,
      slot: d.slot,
      method: d.method,
      ingredients: d.ingredients,
      uses: (d.uses ?? []).map((u: { preparationId: string }) => ({ preparationId: u.preparationId, servings: 1 })),
      boxes: d.boxes,
    })),
    preparations: applied.preparations.map((p) => ({
      id: p.id,
      servingsMade: p.servingsMade ?? 1,
      method: p.method,
      ingredients: p.ingredients,
    })),
    plateFor: () => b,
  });
  assertEquals(check.measured, true);
  assertEquals(check.rows[0].grams, 700, "l'écrit retombe sur la borne");
  assertEquals(check.verdicts.in_bounds, 1);
  assertEquals(check.rows[0].overshootG, 0);
});

Deno.test("B5 — sans référentiel, la mesure s'ABSTIENT et le dit; un bac n'est jamais jugé", () => {
  const vide = finalPortionCheck({
    index: null,
    dishes: [],
    preparations: [],
    plateFor: () => bornes(null),
  });
  assertEquals(vide.measured, false);
  assertEquals(vide.reason, "composition_unavailable");

  const bac = finalPortionCheck({
    index: INDEX,
    dishes: [{
      day: "mon",
      slot: "dinner",
      method: "",
      ingredients: [],
      uses: [{ preparationId: "p_rice", servings: 1 }],
      boxes: [{
        id: "b_tub",
        memberIds: ["m1", "m2"],
        items: [{ grams: 1040, preparationId: "p_rice" }],
        legacyTotalGrams: null,
      }],
    }],
    preparations: [{ id: "p_rice", servingsMade: 1, method: "bouillir", ingredients: [g("rice", 400), g("water", 1200, "ml")] }],
    plateFor: () => bornes(null),
  });
  // ⛔ LES GRAMMES D'UN BAC SONT UNE QUANTITÉ DE RÉCIPIENT (v4): les comparer à
  // un plafond d'assiette ferait rougir un bac parfaitement correct.
  assertEquals(bac.measured, true);
  assertEquals(bac.boxes, 1);
  assertEquals(bac.judged, 0);
  assertEquals(bac.tubsNotJudged, 1);
  assertEquals(bac.verdicts.unmeasurable, 1);
  assertEquals(bac.verdicts.over_max, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// B6 — LA CIBLE EST EXPLICITE, JAMAIS LE MILIEU DE LA BANDE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("B6 — PERTE: cible 2 454, bande 2 454–2 602, et 2 528 n'est PAS la cible", () => {
  // Les nombres sont ceux de PERTE `5fad22ce`: le plafond de déficit relève le
  // bord BAS de la bande, qui n'est donc pas centrée sur ce que le moteur vise.
  const CIBLE = 2454;
  const BANDE = { low: 2454, high: 2602 };
  const MILIEU = (BANDE.low + BANDE.high) / 2;
  assertEquals(MILIEU, 2528, "le milieu de la bande affichée");
  assert(MILIEU !== CIBLE, "et il n'est pas la cible du moteur");
  assertEquals(Math.round(((MILIEU - CIBLE) / CIBLE) * 1000) / 10, 3, "l'écart apparent de ~3 %");

  // ⛔ LA SUBSTITUTION EST OBSERVABLE, ET C'EST CE QUI REND CE TEST UTILE. Si le
  // couloir ou les bornes cessaient de lire la cible qu'on leur donne, les deux
  // branches rendraient le même objet et ce test resterait vert pour rien.
  const partDe = (jour: number) =>
    slotPlanTargets({
      targetKcal: jour,
      coveredSlots: ["dinner"],
      wholeSlots: ["breakfast", "lunch", "dinner"],
      lightSlots: [],
      slotFixedKcal: null,
    }).bySlot.get("dinner")!;
  const surCible = partDe(CIBLE);
  const surMilieu = partDe(MILIEU);
  assert(surCible < surMilieu, `${surCible} contre ${surMilieu}`);

  const bCible = bornes(surCible);
  const bMilieu = bornes(surMilieu);
  const cCible = densityCorridorFor({ targetKcal: surCible, bounds: bCible })!;
  const cMilieu = densityCorridorFor({ targetKcal: surMilieu, bounds: bMilieu })!;
  // ⚠️ SUR CE DÎNER-LÀ, LA TABLE D'ÂGE RABAT LES DEUX BORNES AU MÊME PLAFOND
  // (700 g): ce sont donc les DENSITÉS qui portent l'écart, et elles le portent
  // entièrement. C'est ce qui rend la substitution invisible à qui ne regarde
  // que les grammes — et parfaitement lisible à qui regarde la consigne.
  assertEquals(bCible.max, bMilieu.max, "la table rabat les deux au même plafond");
  assert(
    cCible.minPer100G < cMilieu.minPer100G &&
      cCible.preferredPer100G < cMilieu.preferredPer100G,
    `couloir sur cible ${cCible.minPer100G}–${cCible.preferredPer100G}, sur milieu ${cMilieu.minPer100G}–${cMilieu.preferredPer100G}`,
  );
  // Et là où la table ne mord pas, les BORNES bougent aussi.
  const petitCible = plateBoundsFor({ ageYears: 35, slot: "snack", slotTargetKcal: 200, light: false, appetite: null });
  const petitMilieu = plateBoundsFor({ ageYears: 35, slot: "snack", slotTargetKcal: 206, light: false, appetite: null });
  assert(petitCible.max < petitMilieu.max, "une part plus grosse ouvre une assiette plus grosse");

  // Et la part du moment somme la CIBLE, pas le milieu: `slotPlanTargets` fait
  // autorité et ne reconstruit rien.
  const toutes = slotPlanTargets({
    targetKcal: CIBLE,
    coveredSlots: ["breakfast", "lunch", "dinner"],
    wholeSlots: ["breakfast", "lunch", "dinner"],
    lightSlots: [],
    slotFixedKcal: null,
  });
  const somme = [...toutes.bySlot.values()].reduce((a, b) => a + b, 0);
  assert(Math.abs(somme - CIBLE) <= 1, `les parts somment ${somme}, pas ${MILIEU}`);
});

// ═══════════════════════════════════════════════════════════════════════════
// B7 — `Dpréf` RESTE A15, ET LA CIBLE SORT À CÔTÉ
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("B7 — `preferredPer100G` reste `Dmin × 1,10`; `100 × E / Gpréf` sort À CÔTÉ", () => {
  // Le cas d'A15: un déjeuner de 1 120 kcal. `100 × E / Gpréf` rend un nombre
  // qu'aucun plat de ce dépôt n'atteint (les plats réels vivent entre 113 et
  // 156); `Dmin × 1,10` reste tenable.
  const b = plateBoundsFor({
    ageYears: 35,
    slot: "lunch",
    slotTargetKcal: 1120,
    light: false,
    appetite: null,
  });
  const c = densityCorridorFor({ targetKcal: 1120, bounds: b })!;

  assertEquals(
    c.preferredPer100G,
    Math.min(c.maxPer100G, Math.max(c.minPer100G, Math.round((1120 / b.max) * 100 * REPAIR_DENSITY_HEADROOM))),
    "la consigne reste ancrée au BAS du couloir, avec sa marge",
  );
  assertEquals(c.targetAnchoredPer100G, Math.round((1120 / b.preferred) * 100));
  assertEquals(c.anchorDivergencePer100G, c.targetAnchoredPer100G - c.preferredPer100G);
  // ⛔ LA DIVERGENCE EST RÉELLE ET ELLE EST DU CÔTÉ QU'A15 DÉCRIT: la formule
  // demandée exige PLUS que ce qu'on demande, et c'est pour ça qu'on ne la
  // substitue pas.
  assert(
    c.anchorDivergencePer100G > 0,
    `témoin ${c.targetAnchoredPer100G}, consigne ${c.preferredPer100G}`,
  );
  assert(
    c.targetAnchoredPer100G > 156,
    "le nombre d'A15 dépasse ce que les plats réels de ce dépôt atteignent",
  );

  // ⚠️ LE TÉMOIN N'EST NI RABATTU DANS LE COULOIR NI PLAFONNÉ: c'est ce qui le
  // rend lisible. Le projeter le rendrait égal à la consigne exactement là où
  // il diverge le plus.
  assert(c.targetAnchoredPer100G > c.maxPer100G || c.targetAnchoredPer100G > c.preferredPer100G);

  // Sur une cible modeste, les deux se rejoignent et la divergence tombe.
  const petit = plateBoundsFor({
    ageYears: 35,
    slot: "snack",
    slotTargetKcal: 200,
    light: false,
    appetite: null,
  });
  const cPetit = densityCorridorFor({ targetKcal: 200, bounds: petit })!;
  assert(
    Math.abs(cPetit.anchorDivergencePer100G) < Math.abs(c.anchorDivergencePer100G),
    "la divergence suit la taille de la cible",
  );
});
