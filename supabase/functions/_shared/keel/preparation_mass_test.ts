/**
 * LOT B — LE CAS 811 / 901 g, REPRODUIT PUIS FERMÉ.
 *
 * Le décor n'est pas inventé: c'est GAIN `a18f522e-41f9-469e-9c50-1d693d892ce6`,
 * samedi déjeuner, après deuxième réparation. Les quantités sont celles que le
 * modèle a écrites (lues dans la prose `quantity` de la ligne en base, c'est-à-
 * dire AVANT la mise à l'échelle), les tirages sont ceux du plan (2 pour les
 * lentilles, 3 pour le couscous), et les dix fiches du référentiel sont copiées
 * de `food_composition_refs` le 2026-09-11.
 *
 * `docs/keel/ENQUETE-DEUX-DIRECTIONS-2026-09-11.md` § 4 donne les cinq nombres
 * que ce fichier doit retrouver: 20 · 548,5 · 332,5 · 901 — et 811 aplati. Le
 * premier test les rejoue avec l'arithmétique D'AVANT le lot, pour prouver que
 * le décor est bien la case réelle; les suivants tiennent le comportement neuf.
 */
import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";
import {
  buildCompositionIndex,
  type CompositionRef,
} from "./food_composition.ts";
import {
  countWaterTreatments,
  measureFresh,
  measurePlate,
  measurePreparation,
  readyGramsOfUnit,
  waterTreatmentOf,
} from "./preparation_mass.ts";
import { weighedReadyGrams } from "./box_densify.ts";
import { standardPortionOf } from "./portion_sizing.ts";

// ---------------------------------------------------------------------------
// LE RÉFÉRENTIEL — dix lignes, copiées de la base, pas inventées
// ---------------------------------------------------------------------------
function ref(over: Partial<CompositionRef> & { slug: string }): CompositionRef {
  return {
    foodGroupRef: "non_starchy_veg",
    label: over.slug,
    source: "ciqual",
    energyKcal: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    fiberG: 0,
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

const REFS: CompositionRef[] = [
  ref({ slug: "lentils_dry", foodGroupRef: "legumes", energyKcal: 331.3, proteinG: 25.4, carbsG: 50.6, fatG: 1.3, fiberG: 7.6, yieldClass: "legume_absorbs" }),
  ref({ slug: "tomato", energyKcal: 19.3, proteinG: 0.9, carbsG: 2.5, fatG: 0.3, fiberG: 1.2, unitGrams: 100 }),
  ref({ slug: "courgette", energyKcal: 16.5, proteinG: 1.2, carbsG: 1.8, fatG: 0.3, fiberG: 1.1, yieldClass: "veg_shrinks", unitGrams: 200 }),
  ref({ slug: "onion", energyKcal: 38.4, proteinG: 1.1, carbsG: 6.2, fatG: 0.6, fiberG: 1.7, yieldClass: "veg_shrinks", unitGrams: 110 }),
  ref({ slug: "olive_oil", foodGroupRef: "olive_oil", energyKcal: 900, proteinG: 0, carbsG: 0, fatG: 99.9, fiberG: 0, energyDense: true }),
  ref({ slug: "water", foodGroupRef: "water", condimentGrams: 1 }),
  ref({ slug: "couscous", foodGroupRef: "refined_grain", energyKcal: 352, proteinG: 10.9, carbsG: 71.6, fatG: 1.2, fiberG: 3.4, yieldClass: "grain_absorbs" }),
  ref({ slug: "salt", foodGroupRef: "sauce_dressing", condimentGrams: 0.5 }),
  ref({ slug: "black_pepper", foodGroupRef: "sauce_dressing", energyKcal: 330, proteinG: 13.3, carbsG: 39.5, fatG: 7.5, fiberG: 25.7, condimentGrams: 0.5 }),
  ref({ slug: "herbs_parsley", foodGroupRef: "leafy_greens", energyKcal: 43, proteinG: 3.7, carbsG: 3.5, fatG: 0.6, fiberG: 4.3, condimentGrams: 5 }),
  ref({ slug: "almonds", foodGroupRef: "nuts_seeds", energyKcal: 599.9, proteinG: 18.8, carbsG: 9.5, fatG: 51.3, fiberG: 12.5, atwaterDiscount: 0.72, energyDense: true }),
  ref({ slug: "rice", foodGroupRef: "refined_grain", energyKcal: 350, proteinG: 7, carbsG: 78, fatG: 1, fiberG: 1, yieldClass: "grain_absorbs" }),
  ref({ slug: "chicken_breast", foodGroupRef: "poultry", energyKcal: 121, proteinG: 23, carbsG: 0, fatG: 2.6, fiberG: 0, yieldClass: "meat_shrinks" }),
];

const ALIASES = [
  { alias: "lentilles vertes", slug: "lentils_dry" },
  { alias: "tomates", slug: "tomato" },
  { alias: "oignon", slug: "onion" },
  { alias: "huile d'olive", slug: "olive_oil" },
  { alias: "eau", slug: "water" },
  { alias: "sel", slug: "salt" },
  { alias: "poivre noir", slug: "black_pepper" },
  { alias: "persil", slug: "herbs_parsley" },
  { alias: "amandes", slug: "almonds" },
];

const INDEX = buildCompositionIndex(REFS, ALIASES);

// ---------------------------------------------------------------------------
// LE PLAT RÉEL — samedi déjeuner, GAIN `a18f522e`
// ---------------------------------------------------------------------------
/** Les quantités que le modèle a écrites, avant toute mise à l'échelle. */
const LENTIL_POT = {
  id: "prep_lentil_ratatouille",
  method: "Faire revenir l'oignon dans l'huile, ajouter les tomates, la courgette, les lentilles, l'eau, le sel et le poivre, puis mijoter environ 40 minutes.",
  ingredients: [
    { term: "lentilles vertes sèches", amount: 240, unit: "g", state: "raw" },
    { term: "tomates", amount: 120, unit: "g", state: "raw" },
    { term: "courgette", amount: 100, unit: "g", state: "raw" },
    { term: "oignon", amount: 60, unit: "g", state: "raw" },
    { term: "huile d'olive", amount: 5, unit: "tbsp", state: "raw" },
    { term: "eau", amount: 180, unit: "ml", state: null },
    { term: "sel", amount: null, unit: null, state: "raw" },
    { term: "poivre noir", amount: null, unit: null, state: "raw" },
  ],
};

const COUSCOUS_POT = {
  id: "prep_couscous",
  method: "Verser l'eau bouillante sur le couscous avec le sel, couvrir cinq minutes, égrener avec l'huile et le persil.",
  ingredients: [
    { term: "couscous sec", amount: 360, unit: "g", state: "raw" },
    { term: "eau", amount: 450, unit: "ml", state: null },
    { term: "huile d'olive", amount: 3, unit: "tbsp", state: "raw" },
    { term: "persil", amount: null, unit: null, state: "raw" },
    { term: "sel", amount: null, unit: null, state: "raw" },
  ],
};

const SAT_LUNCH = {
  day: "sat",
  slot: "lunch",
  method: "",
  ingredients: [
    { term: "amandes", amount: 15, unit: "g", state: "raw" },
    { term: "huile d'olive", amount: 1, unit: "tsp", state: "raw" },
  ],
  uses: [
    { preparationId: "prep_lentil_ratatouille" },
    { preparationId: "prep_couscous" },
  ],
};

/** 2 tirages sur les lentilles, 3 sur le couscous — ceux du plan réel. */
const DRAWS = new Map<string, number>([
  ["prep_lentil_ratatouille", 2],
  ["prep_couscous", 3],
]);

/** La part de casserole telle que le moteur la compose: `amount` ÷ tirages. */
// deno-lint-ignore no-explicit-any
function perDraw(lines: readonly any[], draws: number): any[] {
  return lines.map((i) =>
    typeof i.amount === "number" ? { ...i, amount: i.amount / draws } : { ...i }
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ① LE DÉFAUT LUI-MÊME
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("① LA FIXTURE **EST** LE CAS DE L'ENQUÊTE — 20 · 548,5 · 332,5 · 901 · 811", () => {
  // ══════════════════════════════════════════════════════════════════════
  // ⛔ CE BLOC REJOUE L'ARITHMÉTIQUE **D'AVANT** LE LOT B, et il est ici pour
  // une seule raison: prouver que ce décor est bien la case réelle, et pas une
  // reconstitution approximative. Les cinq nombres du § 4 de l'enquête doivent
  // tomber EXACTEMENT. Le comportement neuf est testé juste en dessous.
  // ══════════════════════════════════════════════════════════════════════
  const lentils = measurePreparation(INDEX, {
    ...LENTIL_POT,
    ingredients: perDraw(LENTIL_POT.ingredients, 2),
  });
  const couscous = measurePreparation(INDEX, {
    ...COUSCOUS_POT,
    ingredients: perDraw(COUSCOUS_POT.ingredients, 3),
  });
  // ⛔ LA LIGNE QUI PORTE TOUT LE LOT: les lentilles n'absorbent pas au sens de
  // `grain_absorbs`, donc leur eau PÈSE; le couscous absorbe, donc la sienne ne
  // se compte pas deux fois. Deux casseroles, deux décisions.
  assertEquals(lentils.water, "kept");
  assertEquals(couscous.water, "absorbed");
  assertEquals(lentils.readyG, 548.5, "la part de lentilles, eau comprise");
  assertEquals(couscous.readyG, 332.5, "la part de couscous, eau déjà dans le ×2,6");
  assertEquals(measureFresh(INDEX, SAT_LUNCH).readyG, 20, "le frais du plat");
  assertEquals(20 + 548.5 + 332.5, 901, "la somme des composants de l'enquête");

  // Et la liste APLATIE — le défaut lui-même. Donner DEUX casseroles à un
  // lecteur d'UNE unité de cuisson efface l'eau de celle qui n'absorbe pas.
  const aplati = [
    ...SAT_LUNCH.ingredients,
    ...perDraw(LENTIL_POT.ingredients, 2),
    ...perDraw(COUSCOUS_POT.ingredients, 3),
  ];
  // deno-lint-ignore no-explicit-any
  assertEquals(weighedReadyGrams(aplati as any, INDEX), 811);
  assertEquals(901 - 811, 90, "les 90 g sont l'eau des lentilles: 180 ml ÷ 2 tirages");
});

Deno.test("① LA SOMME DES COMPOSANTS EST LA MESURE DE L'ASSIETTE — la preuve du lot B", () => {
  // ⛔ LA PART D'UNE CASSEROLE EST LA CASSEROLE ENTIÈRE ÷ SES TIRAGES, condiments
  // compris — la MÊME division que `applySizing` écrit dans la boîte. Le biais
  // de la pincée (une ligne sans `amount` comptée entière dans chaque part) est
  // CORRIGÉ, et c'est ce qui fait tomber la part de 901 à 896,8 g.
  const fresh = measureFresh(INDEX, SAT_LUNCH).readyG!;
  const lentils = measurePreparation(INDEX, LENTIL_POT).readyG! / 2;
  const couscous = measurePreparation(INDEX, COUSCOUS_POT).readyG! / 3;
  assertEquals(lentils, 548, "1 096 g ÷ 2 tirages");
  assertEquals(Math.round(couscous * 100) / 100, 328.83, "986,5 g ÷ 3 tirages");

  const plate = measurePlate({
    index: INDEX,
    dish: SAT_LUNCH,
    uses: SAT_LUNCH.uses,
    preparations: [LENTIL_POT, COUSCOUS_POT],
    drawsByPrep: DRAWS,
  });
  assertEquals(
    plate.readyG,
    fresh + lentils + couscous,
    "l'assiette entière doit rendre EXACTEMENT la somme de ses composants",
  );

  // Et le lecteur de production, celui que la lane appelle vraiment.
  const std = standardPortionOf({
    index: INDEX,
    dish: SAT_LUNCH,
    uses: SAT_LUNCH.uses,
    preparations: [LENTIL_POT, COUSCOUS_POT],
    drawsByPrep: DRAWS,
  });
  assertEquals(std.cookedG, 897, "`standardPortionOf` mesurait 811 g avant le lot B");
  assert(
    std.cookedG! - 811 === 86,
    "les 86 g retrouvés sont l'eau des lentilles, moins les condiments qui ne se comptent plus en double",
  );
});

Deno.test("① les tirages ne SUR-TIRENT plus la casserole", () => {
  // ⛔ LE DÉFAUT QUE LA CORRECTION DU BIAIS FERME EN PASSANT: trois parts
  // biaisées de couscous réclamaient 997,5 g d'une casserole qui en produit
  // 986,5. Une casserole ne peut pas donner plus qu'elle ne contient.
  const entier = measurePreparation(INDEX, COUSCOUS_POT).readyG!;
  const part = measurePlate({
    index: INDEX,
    dish: { method: "", ingredients: [] },
    uses: [{ preparationId: "prep_couscous" }],
    preparations: [COUSCOUS_POT],
    drawsByPrep: DRAWS,
  }).readyG!;
  assertEquals(Math.round(part * 3 * 100) / 100, Math.round(entier * 100) / 100);
  assertEquals(
    measurePreparation(INDEX, {
      ...COUSCOUS_POT,
      ingredients: perDraw(COUSCOUS_POT.ingredients, 3),
    }).readyG! * 3,
    997.5,
    "l'arithmétique d'avant réclamait 997,5 g pour 986,5 produits",
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ② LES TRAITEMENTS DE L'EAU
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("② une soupe garde son eau, un pilaf ne la compte pas deux fois", () => {
  const soupe = {
    id: "p_soupe",
    ingredients: [
      { term: "courgette", amount: 200, unit: "g", state: "raw" },
      { term: "eau", amount: 500, unit: "ml", state: null },
    ],
  };
  const pilaf = {
    id: "p_pilaf",
    ingredients: [
      { term: "rice", amount: 100, unit: "g", state: "raw" },
      { term: "eau", amount: 200, unit: "ml", state: null },
    ],
  };
  assertEquals(waterTreatmentOf(INDEX, soupe), "kept");
  assertEquals(waterTreatmentOf(INDEX, pilaf), "absorbed");
  assertEquals(measurePreparation(INDEX, soupe).readyG, 200 * 0.9 + 500);
  assertEquals(measurePreparation(INDEX, pilaf).readyG, 260);
});

Deno.test("② `discarded` ne se DEVINE pas — il se déclare, et rien ne le déclare aujourd'hui", () => {
  // ⛔ AUCUN MATCHER MAISON SUR LA MÉTHODE. « égrener », « égoutter »,
  // « drain », « strain »… un matcher artisanal a mesuré 12 faux positifs sur
  // 12 dans ce dépôt. La méthode du couscous dit « égrener avec l'huile » et ne
  // doit surtout PAS se lire comme un égouttage.
  assertEquals(
    waterTreatmentOf(INDEX, COUSCOUS_POT),
    "absorbed",
    "« égrener » n'est pas « égoutter »: la prose n'est pas lue",
  );
  const pates = {
    id: "p_pates",
    method: "Cuire les pâtes puis égoutter.",
    ingredients: [
      { term: "courgette", amount: 100, unit: "g", state: "raw" },
      { term: "eau", amount: 1000, unit: "ml", state: null },
    ],
  };
  assertEquals(
    waterTreatmentOf(INDEX, pates),
    "kept",
    "sans déclaration structurée, on ne retire rien: trois états honnêtes valent mieux que quatre dont un ment",
  );
  // Le champ existe, il est atteignable, et c'est le SEUL chemin vers `discarded`.
  assertEquals(
    waterTreatmentOf(INDEX, { ...pates, waterTreatment: "discarded" as const }),
    "discarded",
  );
  assertEquals(
    measurePreparation(INDEX, { ...pates, waterTreatment: "discarded" as const }).readyG,
    90,
    "l'eau jetée ne pèse pas",
  );
});

Deno.test("② deux signaux qui se contredisent rendent la masse INCONNUE, jamais un chiffre", () => {
  const contradiction = {
    id: "p_riz_egoutte",
    ingredients: [
      { term: "rice", amount: 100, unit: "g", state: "raw" },
      { term: "eau", amount: 300, unit: "ml", state: null },
    ],
    waterTreatment: "discarded" as const,
  };
  const m = measurePreparation(INDEX, contradiction);
  assertEquals(m.water, "undetermined");
  assertEquals(m.readyG, null);
  assert(m.gaps.includes("water_undetermined"), `le silence doit être nommé: ${m.gaps}`);
  // ⚠️ L'ÉNERGIE, ELLE, RESTE LISIBLE: l'eau ne porte aucune calorie. Les deux
  // ne s'éteignent pas aux mêmes conditions, et les fondre perdrait l'une.
  assertEquals(m.kcal, 350);
});

Deno.test("② aucun `undetermined` fabriqué dans le cas nominal", () => {
  // ⛔ UNE RÉGRESSION DE COUVERTURE SERAIT PIRE QUE LE DÉFAUT. Sur les deux
  // casseroles du plan réel plus les quatre décors de ce fichier, le compteur
  // doit rester à zéro tant que personne ne déclare rien.
  const mesures = [LENTIL_POT, COUSCOUS_POT].map((p) => measurePreparation(INDEX, p));
  const counts = countWaterTreatments(mesures);
  assertEquals(counts.undetermined, 0);
  assertEquals(counts.kept, 1);
  assertEquals(counts.absorbed, 1);
  assertEquals(counts.discarded, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ CE QUI NE DOIT PAS BOUGER
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("③ le biais de la pincée est CORRIGÉ — la part est la casserole ÷ tirages", () => {
  // ⛔ CE QUI VIVAIT ICI: `standardPortionOf` divisait `amount` ligne par ligne
  // et laissait passer ENTIÈRE toute ligne sans `amount` (une pincée de sel, un
  // brin de persil, pesés par convention). Chaque part portait donc TOUS les
  // condiments de la casserole.
  const entier = measurePreparation(INDEX, LENTIL_POT).readyG!;
  assertEquals(entier, 1096, "1 095 g de lignes pesées + 1 g de condiments");
  const biaisee = measurePreparation(INDEX, {
    ...LENTIL_POT,
    ingredients: perDraw(LENTIL_POT.ingredients, 2),
  }).readyG!;
  assertEquals(biaisee, 548.5, "1 095 ÷ 2 + 1 — l'arithmétique d'avant");

  // ⛔ ET CE QUE LE LOT B POSE: la même division que `applySizing` écrit dans la
  // boîte (`readyG ÷ draws`), condiments compris. Les deux côtés du moteur ne
  // peuvent plus donner deux masses au même assemblage.
  const part = measurePlate({
    index: INDEX,
    dish: { method: "", ingredients: [] },
    uses: [{ preparationId: "prep_lentil_ratatouille" }],
    preparations: [LENTIL_POT],
    drawsByPrep: DRAWS,
  }).readyG!;
  assertEquals(part, entier / 2);
  assert(biaisee > part, "l'ancienne part était plus grosse que le tirage réel");
});

Deno.test("③ une casserole citée mais absente éteint le plat, et le trou est NOMMÉ", () => {
  const plate = measurePlate({
    index: INDEX,
    dish: SAT_LUNCH,
    uses: [...SAT_LUNCH.uses, { preparationId: "prep_disparue" }],
    preparations: [LENTIL_POT, COUSCOUS_POT],
    drawsByPrep: DRAWS,
  });
  assertEquals(plate.kcal, null);
  assertEquals(plate.missingPots, ["prep_disparue"]);
  assert(plate.gaps.includes("missing_preparation"));
  // La MASSE des composants connus reste lisible: elle ne prétend rien sur le
  // contenu absent, et `standardPortionOf` la rendait déjà.
  assertEquals(Math.round(plate.readyG!), 897);
});

Deno.test("③ `readyGramsOfUnit` et `weighedReadyGrams` sont la MÊME règle", () => {
  const lignes = [
    { term: "rice", amount: 100, unit: "g" as const, state: "raw" as const },
    { term: "eau", amount: 200, unit: "ml" as const, state: null },
  ];
  assertEquals(readyGramsOfUnit(INDEX, lignes), 260);
  // deno-lint-ignore no-explicit-any
  assertEquals(weighedReadyGrams(lignes as any, INDEX), 260);
  assertEquals(readyGramsOfUnit(INDEX, []), null);
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ LA PROTÉINE, AU PRORATA RÉELLEMENT SERVI
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("④ la protéine d'une assiette plie les casseroles, au prorata de leurs tirages", () => {
  // ⛔ CICATRICE `preparations-must-be-folded-into-dishes`: sans le pliage,
  // 51 % de la protéine sort du verdict (111/32/26 g par jour sans, 167/133/126
  // avec). Ce test tient le pliage par son arithmétique, pas par un souvenir.
  const plate = measurePlate({
    index: INDEX,
    dish: SAT_LUNCH,
    uses: SAT_LUNCH.uses,
    preparations: [LENTIL_POT, COUSCOUS_POT],
    drawsByPrep: DRAWS,
  });
  const fresh = measureFresh(INDEX, SAT_LUNCH).proteinG!;
  const lentils = measurePreparation(INDEX, LENTIL_POT).proteinG! / 2;
  const couscous = measurePreparation(INDEX, COUSCOUS_POT).proteinG! / 3;
  assertEquals(
    plate.proteinG,
    Math.round((fresh + lentils + couscous) * 10) / 10,
    "la protéine de l'assiette est la somme de ses composants, au prorata des tirages",
  );
  // Le frais seul (15 g d'amandes) ne porte que 2,8 g: sans le pliage, on
  // déclarerait ça comme la protéine de l'assiette.
  assertEquals(fresh, 2.8);
  assert(
    plate.proteinG! > 10 * fresh,
    `le pliage doit dominer: ${plate.proteinG} contre ${fresh}`,
  );
});

Deno.test("④ un terme inconnu éteint la protéine même quand sa borne laisse passer l'énergie", () => {
  // Une borne de groupe donne une DENSITÉ ÉNERGÉTIQUE, jamais des grammes de
  // protéine. La compter à zéro rendrait une somme amputée qui a l'air d'un
  // résultat.
  const pot = {
    id: "p_inconnu",
    ingredients: [
      { term: "chicken_breast", amount: 300, unit: "g", state: "raw" as const },
      { term: "zataar-maison", amount: 2, unit: "g", state: "raw" as const, group: "sauce_dressing" },
    ],
  };
  const m = measurePreparation(INDEX, pot);
  assert(m.kcal !== null, "la borne de groupe laisse passer l'énergie");
  assertEquals(m.proteinG, null, "mais pas la protéine");
});
