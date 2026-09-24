/**
 * CE QU'UNE PART DE CASSEROLE CONTIENT — 2026-09-22.
 *
 * ⛔ Nombres attendus EN DUR, calculés à la main dans le commentaire qui les
 * précède. Rendements du référentiel: viande 0,7, légume 0,9, neutre 1.
 */
import { assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import {
  buildCompositionIndex,
  type CompositionRef,
} from "./food_composition.ts";
import {
  POT_PART_KINDS,
  potSharePartsOf,
  STARCH_PART_GROUPS,
  VEGETABLE_PART_GROUPS,
} from "./pot_share_parts.ts";
import { sourceFamily } from "./source_family.ts";

function ref(over: Partial<CompositionRef> & { slug: string }): CompositionRef {
  return {
    foodGroupRef: "refined_grain",
    label: over.slug,
    source: "ciqual",
    energyKcal: 350,
    proteinG: 8,
    carbsG: 75,
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
    atwaterDiscount: 1.0,
    energyDense: false,
    unitGrams: null,
    condimentGrams: null,
    ...over,
  } as CompositionRef;
}

const INDEX = buildCompositionIndex(
  [
    ref({ slug: "chicken", foodGroupRef: "poultry", yieldClass: "meat_shrinks", energyKcal: 165 }),
    ref({ slug: "red_cabbage", foodGroupRef: "cruciferous_veg", yieldClass: "veg_shrinks", energyKcal: 30 }),
    ref({ slug: "pepper", foodGroupRef: "non_starchy_veg", yieldClass: "veg_shrinks", energyKcal: 25 }),
    ref({ slug: "oil", foodGroupRef: "olive_oil", yieldClass: "neutral", energyKcal: 900 }),
    ref({ slug: "potato", foodGroupRef: "starchy_veg", yieldClass: "neutral", energyKcal: 80 }),
    ref({ slug: "egg", foodGroupRef: "eggs", yieldClass: "neutral", energyKcal: 140 }),
  ],
  [
    { alias: "poulet", slug: "chicken" },
    { alias: "chou rouge", slug: "red_cabbage" },
    { alias: "poivron", slug: "pepper" },
    { alias: "huile", slug: "oil" },
    { alias: "pomme de terre", slug: "potato" },
    { alias: "oeufs", slug: "egg" },
  ],
);

const g = (term: string, amount: number) => ({
  term,
  quantity: `${amount} g`,
  amount,
  unit: "g",
  state: "raw",
});

Deno.test("vocabulaires fermés, en dur", () => {
  assertEquals([...POT_PART_KINDS], ["protein", "starch", "vegetables"]);
  assertEquals([...STARCH_PART_GROUPS].sort(), ["refined_grain", "starchy_veg", "whole_grain"]);
  assertEquals([...VEGETABLE_PART_GROUPS].sort(), ["cruciferous_veg", "leafy_greens", "non_starchy_veg"]);
});

Deno.test("MORD — poulet rôti aux légumes: le poulet par son nom, les légumes sommés, l'huile tue", () => {
  // Cru → cuit: poulet 400 × 0,7 = 280; chou 300 × 0,9 = 270; poivron
  // 100 × 0,9 = 90; huile 20 × 1 = 20. Total prêt 660.
  // Poulet 280/660 = 0,424; légumes 360/660 = 0,545. L'huile compte au
  // dénominateur et ne se nomme pas.
  const parts = potSharePartsOf(INDEX, {
    id: "p",
    ingredients: [g("poulet", 400), g("chou rouge", 300), g("poivron", 100), g("huile", 20)],
  })!;
  assertEquals(parts.length, 2);
  assertEquals(parts[0].kind, "protein");
  assertEquals(parts[0].term, "poulet");
  assertAlmostEquals(parts[0].fraction, 0.424, 1e-9);
  assertEquals(parts[1].kind, "vegetables");
  assertEquals(parts[1].term, null);
  assertAlmostEquals(parts[1].fraction, 0.545, 1e-9);
  // Pour une boîte de 261 g: 110,7 g de poulet et 142,4 g de légumes.
});

Deno.test("une frittata: protéine, féculent et légumes", () => {
  // Œufs 300 → 300; pomme de terre 200 → 200; poivron 100 → 90. Total 590.
  const parts = potSharePartsOf(INDEX, {
    id: "f",
    ingredients: [g("oeufs", 300), g("pomme de terre", 200), g("poivron", 100)],
  })!;
  assertEquals(parts.map((p) => [p.kind, p.term]), [
    ["protein", "oeufs"],
    ["starch", "pomme de terre"],
    ["vegetables", null],
  ]);
  assertAlmostEquals(parts[0].fraction, 0.508, 1e-9);
  assertAlmostEquals(parts[1].fraction, 0.339, 1e-9);
  assertAlmostEquals(parts[2].fraction, 0.153, 1e-9);
});

Deno.test("PASSE À CÔTÉ — une casserole d'une seule famille n'a rien à détailler", () => {
  assertEquals(potSharePartsOf(INDEX, { id: "r", ingredients: [g("pomme de terre", 500), g("huile", 10)] }), []);
});

Deno.test("une ligne qui ne se mesure pas éteint tout le détail: on se tait", () => {
  assertEquals(
    potSharePartsOf(INDEX, { id: "x", ingredients: [g("poulet", 400), g("ingrédient inconnu", 100)] }),
    null,
  );
});

Deno.test("deux lignes du même terme sont fusionnées", () => {
  // Poulet 200 + 200 → 280 prêts; poivron 100 → 90. Total 370; 280/370 = 0,757.
  const parts = potSharePartsOf(INDEX, {
    id: "d",
    ingredients: [g("poulet", 200), g("poulet", 200), g("poivron", 100)],
  })!;
  assertEquals(parts.length, 2);
  assertAlmostEquals(parts[0].fraction, 0.757, 1e-9);
});

// ═══════════════════════════════════════════════════════════════════════════
// CÂBLAGE — les DEUX sorties du générateur portent la composition
// ═══════════════════════════════════════════════════════════════════════════
// La réponse (lue par l'aperçu « Ce que ça donnerait ») et le plan écrit
// (`preparationsWritten`). Une seule des deux ferait un détail qui apparaît dans
// l'aperçu et disparaît une fois le plan adopté. Commentaires retirés avant la
// recherche (`caller-audit-must-strip-comments`).
Deno.test("CÂBLAGE — la réponse et le plan écrit passent tous deux par `withShareParts`", async () => {
  const raw = await sourceFamily(new URL("../../generate-household-meal-v1/index.ts", import.meta.url));
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  assertEquals(src.split("mealPreparationsPayload(meal)").length - 1, 2);
  assertEquals(src.split("withShareParts(mealPreparationsPayload(meal))").length - 1, 2);
  assertEquals(src.includes("share_parts: index === null || src === null ? null : potSharePartsOf(index, {"), true);
});
