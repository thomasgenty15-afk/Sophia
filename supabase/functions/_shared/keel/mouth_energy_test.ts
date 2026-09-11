// LOT 1 — CE QUE CHAQUE BOUCHE REÇOIT. Ce que ces tests protègent, dans
// l'ordre de ce que ça coûte quand ça casse:
//
//   * LE TOTAL QUI FAIT SEMBLANT — un plat que personne n'attribue et qui
//     disparaît d'une somme présentée comme la journée. C'est le seul défaut de
//     ce module qui trompe activement quelqu'un, et c'est le mode d'échec que
//     `plan_energy.ts` nomme déjà comme le plus tentant;
//   * LA PART QUI NE SUIT PAS LE COUVERCLE — deux bouches à 612/344 doivent
//     recevoir l'énergie dans CE rapport, pas moitié-moitié;
//   * LA PRÉPARATION NON PLIÉE — 51 % de la protéine hors du calcul, mesuré;
//   * `complete: false` AVEC UN CHIFFRE COMPLET — la combinaison interdite.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  buildCompositionIndex,
  type CompositionRef,
} from "./food_composition.ts";
import { MOUTH_ENERGY_GAPS, mouthDayEnergy } from "./mouth_energy.ts";

// ---------------------------------------------------------------------------
// LE BANC — des valeurs RONDES, pour que l'attendu se calcule de tête
// ---------------------------------------------------------------------------

function ref(over: Partial<CompositionRef> & { slug: string }): CompositionRef {
  return {
    foodGroupRef: "non_starchy_veg",
    label: over.slug,
    // LOT 18 — la provenance par défaut d'un décor de test est le référentiel
    // HUMAIN: c'est ce que ces cas décrivent. Un défaut à `model` ferait lire
    // « le modèle a rempli » à toute la suite existante.
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
  } as CompositionRef;
}

const INDEX = buildCompositionIndex(
  [
    // 100 kcal / 100 g, rendement neutre: 200 g => 200 kcal, de tête.
    ref({ slug: "plain_food", energyKcal: 100 }),
    // Résolu, DENSE, sans poids d'unité: le piège du non-pesé.
    ref({
      slug: "butter",
      foodGroupRef: "other_added_fat",
      energyKcal: 750,
      energyDense: true,
    }),
  ],
  [
    { alias: "plain food", slug: "plain_food" },
    { alias: "butter", slug: "butter" },
  ],
);

const IKU = "m_iku";
const CHR = "m_chr";

/** 200 g d'un aliment à 100 kcal/100 g => 200 kcal. Rien à deviner. */
const PLAIN_200 = [
  { term: "plain food", amount: 200, unit: "g" as const, state: "raw" as const },
];

// ---------------------------------------------------------------------------
// ① LA PART SUIT LE COUVERCLE
// ---------------------------------------------------------------------------

Deno.test("l'énergie se partage dans le rapport du COUVERCLE, pas à parts égales", () => {
  // Le foyer réel `5600347f` après dimensionnement: 612 / 344. C'est ce rapport
  // que le calcul doit rendre — un partage moitié-moitié serait exactement le
  // produit d'avant le chantier.
  const rows = mouthDayEnergy({
    index: INDEX,
    preparations: [],
    dishes: [{
      day: "thu",
      slot: "dinner",
      method: "roast",
      ingredients: PLAIN_200,
      uses: [],
      boxes: [{ memberIds: [IKU], items: [{ grams: 612 }], legacyTotalGrams: null }, { memberIds: [CHR], items: [{ grams: 344 }], legacyTotalGrams: null }],
    }],
  });
  const iku = rows.find((r) => r.memberId === IKU)!;
  const chr = rows.find((r) => r.memberId === CHR)!;
  assertEquals(iku.kcal, Math.round(200 * (612 / 956)));
  assertEquals(chr.kcal, Math.round(200 * (344 / 956)));
  // La somme des parts est l'énergie du plat: rien ne se crée, rien ne se perd.
  assertEquals(iku.kcal! + chr.kcal!, 200);
  assert(iku.complete && chr.complete);
  assertEquals(iku.subject, "the_day");
});

Deno.test("les jours ne se mélangent pas", () => {
  const dish = (day: string) => ({
    day,
    slot: "dinner",
    method: "roast",
    ingredients: PLAIN_200,
    uses: [],
    boxes: [{ memberIds: [IKU], items: [{ grams: 100 }], legacyTotalGrams: null }],
  });
  const rows = mouthDayEnergy({
    index: INDEX,
    preparations: [],
    dishes: [dish("thu"), dish("thu"), dish("fri")],
  });
  assertEquals(rows.length, 2);
  assertEquals(rows.find((r) => r.day === "thu")!.kcal, 400);
  assertEquals(rows.find((r) => r.day === "fri")!.kcal, 200);
});

// ---------------------------------------------------------------------------
// ② LE TOTAL QUI FAIT SEMBLANT — le défaut qui trompe
// ---------------------------------------------------------------------------

Deno.test("un plat SANS couvercle fait basculer le sujet du total", () => {
  // ⛔ LE DÉFAUT QUE CE TEST GARDE. Un plat que personne n'attribue est mangé
  // quand même. L'ignorer en silence rendrait « ta journée: 200 kcal » sur une
  // journée qui en porte deux fois plus — un creux fabriqué, et dans la
  // direction qui décourage.
  const rows = mouthDayEnergy({
    index: INDEX,
    preparations: [],
    dishes: [
      {
        day: "thu",
        slot: "dinner",
        method: "roast",
        ingredients: PLAIN_200,
        uses: [],
        boxes: [{ memberIds: [IKU], items: [{ grams: 100 }], legacyTotalGrams: null }],
      },
      // Cuisiné le jour même: aucun couvercle, donc aucune attribution.
      { day: "thu", slot: "lunch", method: "pan", ingredients: PLAIN_200, uses: [], boxes: [] },
    ],
  });
  const iku = rows.find((r) => r.memberId === IKU)!;
  assertEquals(iku.unattributedDishes, 1);
  assertEquals(iku.subject, "what_could_be_attributed");
  assertEquals(iku.complete, false);
  assert(iku.gaps.includes("no_box"));
  // Le chiffre reste rendu — il parle simplement d'autre chose, et il le dit.
  assertEquals(iku.kcal, 200);
});

Deno.test("un plat sans couvercle touche TOUTES les bouches de ce jour-là", () => {
  // Il ne nomme personne: il rend le total de chacun partiel, pas celui d'un
  // seul. Une implémentation qui l'imputerait à la première bouche rencontrée
  // laisserait l'autre avec un `complete: true` mensonger.
  const rows = mouthDayEnergy({
    index: INDEX,
    preparations: [],
    dishes: [
      {
        day: "thu",
        slot: "dinner",
        method: "roast",
        ingredients: PLAIN_200,
        uses: [],
        boxes: [{ memberIds: [IKU], items: [{ grams: 100 }], legacyTotalGrams: null }, { memberIds: [CHR], items: [{ grams: 100 }], legacyTotalGrams: null }],
      },
      { day: "thu", slot: "lunch", method: "pan", ingredients: PLAIN_200, uses: [], boxes: [] },
    ],
  });
  assertEquals(rows.length, 2);
  for (const row of rows) {
    assertEquals(row.unattributedDishes, 1);
    assertEquals(row.complete, false);
  }
});

Deno.test("un plat non attribué d'un AUTRE jour ne salit pas celui-ci", () => {
  const rows = mouthDayEnergy({
    index: INDEX,
    preparations: [],
    dishes: [
      {
        day: "thu",
        slot: "dinner",
        method: "roast",
        ingredients: PLAIN_200,
        uses: [],
        boxes: [{ memberIds: [IKU], items: [{ grams: 100 }], legacyTotalGrams: null }],
      },
      { day: "fri", slot: "lunch", method: "pan", ingredients: PLAIN_200, uses: [], boxes: [] },
    ],
  });
  const thu = rows.find((r) => r.day === "thu")!;
  assertEquals(thu.unattributedDishes, 0);
  assertEquals(thu.complete, true);
  assertEquals(thu.subject, "the_day");
});

// ---------------------------------------------------------------------------
// ③ LES PRÉPARATIONS SONT PLIÉES
// ---------------------------------------------------------------------------

Deno.test("un plat de REPRISE, sans ingrédient propre, reçoit l'énergie de sa casserole", () => {
  // Le cas de 193 plats sur 1 204 en base. Sans le pliage, ils rendent
  // `no_ingredients` et disparaissent de la journée — 51 % de la protéine hors
  // du calcul, mesuré sur le verdict avant que le pliage existe.
  const rows = mouthDayEnergy({
    index: INDEX,
    preparations: [{
      id: "prep",
      servingsMade: 4,
      // 800 g au total; la reprise en prend 1 part sur 4 => 200 g => 200 kcal.
      ingredients: [{ term: "plain food", amount: 800, unit: "g", state: "raw" }],
    }],
    dishes: [{
      day: "thu",
      slot: "dinner",
      method: "reheat",
      ingredients: [],
      uses: [{ preparationId: "prep", servings: 1 }],
      boxes: [{ memberIds: [IKU], items: [{ grams: 200 }], legacyTotalGrams: null }],
    }],
  });
  assertEquals(rows[0].kcal, 200);
  assertEquals(rows[0].complete, true);
});

// ---------------------------------------------------------------------------
// ④ L'ABSTENTION SE PROPAGE, ET ELLE EST NOMMÉE
// ---------------------------------------------------------------------------

Deno.test("un plat dont l'énergie est inconnue N'EST PAS compté comme zéro", () => {
  // Le beurre est résolu, dense, et sans quantité: `dishEnergy` s'abstient.
  // La bouche garde son autre plat, et la journée dit qu'elle est partielle.
  const rows = mouthDayEnergy({
    index: INDEX,
    preparations: [],
    dishes: [
      {
        day: "thu",
        slot: "dinner",
        method: "roast",
        ingredients: PLAIN_200,
        uses: [],
        boxes: [{ memberIds: [IKU], items: [{ grams: 100 }], legacyTotalGrams: null }],
      },
      {
        day: "thu",
        slot: "dinner",
        method: "pan",
        ingredients: [{ term: "butter", amount: null, unit: null, state: "raw" }],
        uses: [],
        boxes: [{ memberIds: [IKU], items: [{ grams: 20 }], legacyTotalGrams: null }],
      },
    ],
  });
  const iku = rows[0];
  assertEquals(iku.kcal, 200);
  assertEquals(iku.dishesCounted, 1);
  assertEquals(iku.dishesTotal, 2);
  assertEquals(iku.complete, false);
  assert(iku.gaps.includes("dish_incomplete"));
});

Deno.test("un couvercle qui ne pèse rien est NOMMÉ, jamais divisé par zéro", () => {
  const rows = mouthDayEnergy({
    index: INDEX,
    preparations: [],
    dishes: [{
      day: "thu",
      slot: "dinner",
      method: "roast",
      ingredients: PLAIN_200,
      uses: [],
      boxes: [{ memberIds: [IKU], items: [{ grams: 0 }], legacyTotalGrams: null }],
    }],
  });
  assertEquals(rows[0].kcal, null);
  assert(rows[0].gaps.includes("empty_box"));
  assertEquals(rows[0].complete, false);
});

// ---------------------------------------------------------------------------
// v4 — LE BAC COMMUN: UN SILENCE NOMMÉ, JAMAIS UNE DIVISION
// ---------------------------------------------------------------------------

Deno.test("un bac à PLUSIEURS noms ne rend AUCUN kcal, et le dit", () => {
  const rows = mouthDayEnergy({
    index: INDEX,
    preparations: [],
    dishes: [{
      day: "thu",
      slot: "dinner",
      method: "roast",
      ingredients: PLAIN_200,
      uses: [],
      boxes: [{
        memberIds: [IKU, CHR],
        items: [{ grams: 900 }],
        legacyTotalGrams: null,
      }],
    }],
  });
  assertEquals(rows.length, 2);
  for (const row of rows) {
    // ⛔ LE DÉFAUT QUE CE TEST TIENT: `900 / 2 = 450` par bouche. Ce serait très
    // exactement la division que v3 et v4 existent pour supprimer, revenue par
    // la porte de l'énergie — et le nombre aurait l'air personnel alors qu'il
    // décrit un récipient.
    assertEquals(row.kcal, null);
    assertEquals(row.gaps, ["common_pot"]);
    assertEquals(row.complete, false);
    // ⚠️ ET SES GRAMMES NE SONT LES GRAMMES DE PERSONNE. Les recopier sur chaque
    // mangeur ferait mordre le plafond de vraisemblance sur une assiette qui
    // n'existe pas: 900 g dans une boîte pour deux n'est pas 900 g dans une
    // assiette.
    assertEquals(row.grams, 0);
    assertEquals(row.maxMealGrams, 0);
  }
});

Deno.test("`common_pot` est un jeton du vocabulaire fermé", () => {
  // Un `gap` que `MOUTH_ENERGY_GAPS` ne déclare pas est un silence anonyme de
  // plus, et la chaîne aval (`mouth_anchor`) ne peut pas le distinguer d'un
  // `null`.
  assert(MOUTH_ENERGY_GAPS.includes("common_pot"));
});

Deno.test("le contenant à UN nom garde sa lecture, à côté d'un bac commun", () => {
  // Le cas de référence du document: Fabrice a sa boîte, les trois autres
  // partagent la leur. Une seule bouche a un chiffre, et il est exact.
  const rows = mouthDayEnergy({
    index: INDEX,
    preparations: [],
    dishes: [{
      day: "thu",
      slot: "dinner",
      method: "roast",
      ingredients: PLAIN_200,
      uses: [],
      boxes: [
        { memberIds: [IKU], items: [{ grams: 200 }], legacyTotalGrams: null },
        { memberIds: [CHR, "m-third"], items: [{ grams: 600 }], legacyTotalGrams: null },
      ],
    }],
  });
  const iku = rows.find((r) => r.memberId === IKU)!;
  // 200 g sur 800 g de contenants: un quart de l'énergie du plat.
  assertEquals(iku.kcal, Math.round(200 * (200 / 800)));
  assertEquals(iku.gaps, []);
  assertEquals(iku.grams, 200);
  for (const other of rows.filter((r) => r.memberId !== IKU)) {
    assertEquals(other.kcal, null);
    assertEquals(other.gaps, ["common_pot"]);
  }
});

Deno.test("un `box` v2 replié garde ses grammes par sa SOMME", () => {
  // ⚠️ LECTURE DÉFENSIVE DES PLANS DÉJÀ EN BASE: v2 portait une part par
  // personne et aucune ventilation par composant. La somme est la seule chose
  // vraie qu'on puisse en tirer, et elle est bien une quantité de bac.
  const rows = mouthDayEnergy({
    index: INDEX,
    preparations: [],
    dishes: [{
      day: "thu",
      slot: "dinner",
      method: "roast",
      ingredients: PLAIN_200,
      uses: [],
      boxes: [{ memberIds: [IKU], items: [], legacyTotalGrams: 150 }],
    }],
  });
  assertEquals(rows[0].kcal, 200);
  assertEquals(rows[0].grams, 150);
  assertEquals(rows[0].gaps, []);
});

Deno.test("aucune sortie ne porte un chiffre AVEC une lacune non dite", () => {
  // La combinaison interdite: `complete: true` alors qu'une lacune existe.
  const rows = mouthDayEnergy({
    index: INDEX,
    preparations: [],
    dishes: [
      {
        day: "thu",
        slot: "dinner",
        method: "roast",
        ingredients: PLAIN_200,
        uses: [],
        boxes: [{ memberIds: [IKU], items: [{ grams: 100 }], legacyTotalGrams: null }],
      },
      { day: "thu", slot: "lunch", method: "pan", ingredients: PLAIN_200, uses: [], boxes: [] },
      {
        day: "fri",
        slot: "dinner",
        method: "pan",
        ingredients: [{ term: "butter", amount: null, unit: null, state: "raw" }],
        uses: [],
        boxes: [{ memberIds: [IKU], items: [{ grams: 20 }], legacyTotalGrams: null }],
      },
    ],
  });
  for (const row of rows) {
    if (row.complete) assertEquals(row.gaps.length, 0, JSON.stringify(row));
    else assert(row.gaps.length > 0, JSON.stringify(row));
    for (const g of row.gaps) assert(MOUTH_ENERGY_GAPS.includes(g), g);
  }
});

Deno.test("une bouche absente du plan n'a AUCUNE ligne — elle n'est pas à zéro", () => {
  const rows = mouthDayEnergy({
    index: INDEX,
    preparations: [],
    dishes: [{
      day: "thu",
      slot: "dinner",
      method: "roast",
      ingredients: PLAIN_200,
      uses: [],
      boxes: [{ memberIds: [IKU], items: [{ grams: 100 }], legacyTotalGrams: null }],
    }],
  });
  assertEquals(rows.filter((r) => r.memberId === CHR), []);
});

// ---------------------------------------------------------------------------
// ⑤ LA PURETÉ
// ---------------------------------------------------------------------------

Deno.test("le module est PUR: même entrée, même sortie, entrée intacte", () => {
  const args = {
    index: INDEX,
    preparations: [{
      id: "prep",
      servingsMade: 2,
      ingredients: [{ term: "plain food", amount: 400, unit: "g" as const, state: "raw" as const }],
    }],
    dishes: [{
      day: "thu",
      slot: "dinner",
      method: "reheat",
      ingredients: PLAIN_200,
      uses: [{ preparationId: "prep", servings: 1 }],
      boxes: [{ memberIds: [IKU], items: [{ grams: 300 }], legacyTotalGrams: null }, { memberIds: [CHR], items: [{ grams: 100 }], legacyTotalGrams: null }],
    }],
  };
  const before = JSON.stringify(args.dishes) + JSON.stringify(args.preparations);
  const a = mouthDayEnergy(args);
  const b = mouthDayEnergy(args);
  assertEquals(JSON.stringify(a), JSON.stringify(b));
  assertEquals(JSON.stringify(args.dishes) + JSON.stringify(args.preparations), before);
});

// ---------------------------------------------------------------------------
// ⟳ LOT 0 (2026-09-06) — L'ÉNERGIE D'UNE BOÎTE SUIT SES GRAMMES TIRÉS
// ---------------------------------------------------------------------------
//
// Mesuré sur M07 (campagne du 05/09, cinq bouches) : `uses.servings: 1` sur des
// casseroles de 10–15 parts, 34 417 g tirés par les boîtes contre 5 826 g
// attribués par le pliage (×5,9), 0,2 kcal/g lu. Ces tests tiennent la règle
// et sa mutation évidente (revenir au pliage rougit le premier).

import { boxEnergies, boxKcalByItems, potAttributionGap, potDensities } from "./mouth_energy.ts";

// Une casserole de 1 500 g de « plain food » (100 kcal/100 g, rendement neutre)
// = 1 500 kcal pour 1 500 g prêts → 1 kcal/g. Le modèle dit qu'elle fait 15 parts
// et que le plat n'en prend qu'UNE.
const POT_1500 = {
  id: "pot",
  servingsMade: 15,
  method: "roast",
  ingredients: [{ term: "plain food", amount: 1500, unit: "g" as const, state: "raw" as const }],
};

Deno.test("LOT 0 — une boîte qui cite une casserole vaut ses grammes × la densité de la casserole, pas 1/15 du pot", () => {
  const dish = {
    day: "thu",
    slot: "dinner",
    method: "reheat",
    ingredients: [],
    uses: [{ preparationId: "pot", servings: 1 }],
    boxes: [
      { memberIds: [IKU], items: [{ grams: 600, preparationId: "pot" }], legacyTotalGrams: null },
      { memberIds: [CHR], items: [{ grams: 400, preparationId: "pot" }], legacyTotalGrams: null },
    ],
  };
  const rows = mouthDayEnergy({ index: INDEX, preparations: [POT_1500], dishes: [dish] });
  const iku = rows.find((r) => r.memberId === IKU)!;
  const chr = rows.find((r) => r.memberId === CHR)!;
  // Le pliage aurait donné 100 kcal (1/15 de 1 500) à partager : 60 et 40.
  assertEquals(iku.kcal, 600);
  assertEquals(chr.kcal, 400);
  assert(iku.complete && chr.complete);
  // Et `uses.servings` ne change plus rien : 1 ou 5, la boîte pèse ce qu'elle pèse.
  const five = mouthDayEnergy({
    index: INDEX,
    preparations: [POT_1500],
    dishes: [{ ...dish, uses: [{ preparationId: "pot", servings: 5 }] }],
  });
  assertEquals(five.find((r) => r.memberId === IKU)!.kcal, 600);
});

Deno.test("LOT 0 — le frais du plat se partage au prorata des grammes FRAIS des boîtes, la casserole au prorata des grammes tirés", () => {
  const dish = {
    day: "thu",
    slot: "dinner",
    method: "roast",
    // 200 g de frais pour tout le plat = 200 kcal.
    ingredients: PLAIN_200,
    uses: [{ preparationId: "pot", servings: 1 }],
    boxes: [
      { memberIds: [IKU], items: [{ grams: 300, preparationId: "pot" }, { grams: 150, preparationId: null }], legacyTotalGrams: null },
      { memberIds: [CHR], items: [{ grams: 300, preparationId: "pot" }, { grams: 50, preparationId: null }], legacyTotalGrams: null },
    ],
  };
  const per = boxKcalByItems(INDEX, dish, potDensities(INDEX, [POT_1500]))!;
  // Casserole : 300 kcal chacune. Frais : 200 × 150/200 = 150 et 200 × 50/200 = 50.
  assertEquals(Math.round(per[0].kcal!), 450);
  assertEquals(Math.round(per[1].kcal!), 350);
  // Rien ne se crée : la somme est casserole tirée + frais du plat.
  assertEquals(Math.round(per[0].kcal! + per[1].kcal!), 600 + 200);
});

Deno.test("LOT 0 — une casserole illisible rend `dish_incomplete` sur les boîtes qui la citent, jamais zéro", () => {
  const rows = mouthDayEnergy({
    index: INDEX,
    preparations: [{
      id: "mystery",
      servingsMade: 4,
      method: "roast",
      ingredients: [{ term: "something the referential does not know", amount: 500, unit: "g", state: "raw" }],
    }],
    dishes: [{
      day: "thu",
      slot: "dinner",
      method: "reheat",
      ingredients: [],
      uses: [{ preparationId: "mystery", servings: 1 }],
      boxes: [{ memberIds: [IKU], items: [{ grams: 300, preparationId: "mystery" }], legacyTotalGrams: null }],
    }],
  });
  assertEquals(rows[0].kcal, null);
  assertEquals(rows[0].complete, false);
  assert(rows[0].gaps.includes("dish_incomplete"));
});

Deno.test("LOT 0 — sans `preparationId` sur les items (archive d'avant v4), le pliage s'applique comme avant", () => {
  // Le même décor que « un plat de REPRISE… » : 800 g, 1 part sur 4 → 200 kcal.
  const rows = mouthDayEnergy({
    index: INDEX,
    preparations: [{
      id: "prep",
      servingsMade: 4,
      ingredients: [{ term: "plain food", amount: 800, unit: "g", state: "raw" }],
    }],
    dishes: [{
      day: "thu",
      slot: "dinner",
      method: "reheat",
      ingredients: [],
      uses: [{ preparationId: "prep", servings: 1 }],
      boxes: [{ memberIds: [IKU], items: [{ grams: 200 }], legacyTotalGrams: null }],
    }],
  });
  assertEquals(rows[0].kcal, 200);
  // Et `boxKcalByItems` dit explicitement qu'il ne s'applique pas.
  assertEquals(
    boxKcalByItems(INDEX, {
      day: "thu",
      slot: "dinner",
      method: "reheat",
      ingredients: [],
      uses: [],
      boxes: [{ memberIds: [IKU], items: [{ grams: 200 }], legacyTotalGrams: null }],
    }, new Map()),
    null,
  );
});

Deno.test("LOT 0 — `boxEnergies` (l'écran) lit la même règle que l'ancre", () => {
  const per = boxEnergies({
    index: INDEX,
    preparations: [POT_1500],
    dishes: [{
      day: "thu",
      slot: "dinner",
      method: "reheat",
      ingredients: [],
      uses: [{ preparationId: "pot", servings: 1 }],
      boxes: [{ id: "b1", memberIds: [IKU], items: [{ grams: 600, preparationId: "pot" }], legacyTotalGrams: null }],
    }],
  });
  assertEquals(per[0].boxId, "b1");
  assertEquals(Math.round(per[0].kcal!), 600);
  assertEquals(per[0].gap, null);
});

Deno.test("LOT 0 — le compteur d'attribution dit de combien `uses.servings` se trompe", () => {
  const gap = potAttributionGap({
    index: INDEX,
    preparations: [POT_1500],
    dishes: [{
      day: "thu",
      slot: "dinner",
      method: "reheat",
      ingredients: [],
      uses: [{ preparationId: "pot", servings: 1 }],
      boxes: [
        { memberIds: [IKU], items: [{ grams: 600, preparationId: "pot" }], legacyTotalGrams: null },
        { memberIds: [CHR], items: [{ grams: 400, preparationId: "pot" }], legacyTotalGrams: null },
      ],
    }],
  });
  // Tiré 1 000 g ; attribué 1 500 × 1/15 = 100 g → ×10.
  assertEquals(gap.drawnGrams, 1000);
  assertEquals(gap.attributedGrams, 100);
  assertEquals(gap.ratio, 10);
  assertEquals(gap.potsUnreadable, 0);
});

Deno.test("LOT 0 — un frais non résolu se juge contre la BOÎTE (casserole comprise), pas contre le frais seul", () => {
  // 4 g d'un légume inconnu, borné par la bande de son groupe, à côté de 600 g de
  // casserole à 1 kcal/g et 30 g de frais connu : ≈ 3 % de la boîte → lisible. Le
  // même frais seul dans sa boîte → bien plus de 5 % → illisible, comme avant.
  // ⚠️ Un frais composé du SEUL terme inconnu rend `no_ingredients` (rien de résolu
  // à quoi accrocher une borne) : le cas réel a toujours un frais connu à côté.
  // La bande de groupe d'un inconnu est LARGE (≈ 4,5 kcal/g au milieu sur ce banc) :
  // 4 g suffisent à faire une garniture inconnue ; 20 g feraient 12 % de la boîte.
  const leaves = { term: "mystery leaves", amount: 4, unit: "g" as const, state: "raw" as const, group: "non_starchy_veg" as const };
  const known = { term: "plain food", amount: 30, unit: "g" as const, state: "raw" as const };
  const withPot = boxKcalByItems(INDEX, {
    day: "thu",
    slot: "dinner",
    method: "roast",
    ingredients: [known, leaves],
    uses: [{ preparationId: "pot", servings: 1 }],
    boxes: [{ memberIds: [IKU], items: [{ grams: 600, preparationId: "pot" }, { grams: 34, preparationId: null }], legacyTotalGrams: null }],
  }, potDensities(INDEX, [POT_1500]))!;
  assertEquals(withPot[0].gap, null);
  assert(withPot[0].kcal! >= 630 && withPot[0].kcal! <= 660, String(withPot[0].kcal));
  const alone = boxKcalByItems(INDEX, {
    day: "thu",
    slot: "dinner",
    method: "roast",
    ingredients: [known, leaves],
    uses: [],
    boxes: [{ memberIds: [IKU], items: [{ grams: 34, preparationId: null }], legacyTotalGrams: null }],
  }, new Map())!;
  assertEquals(alone[0].gap, "dish_incomplete");
});
