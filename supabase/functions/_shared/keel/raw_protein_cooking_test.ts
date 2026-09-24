/**
 * ⟳ 2026-09-24 — LA VIANDE OU LE POISSON CRU QUE RIEN NE CUIT : les deux cas
 * réels du jour, le cas qui passe, et le branchement dans la lane.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { buildCompositionIndex, type CompositionRef } from "./food_composition.ts";
import { CHASED_CAUSES } from "./plan_repair_loop.ts";
import {
  MUST_BE_COOKED_YIELD_CLASSES,
  rawProteinRepairInstruction,
  uncookedRawProteins,
} from "./raw_protein_cooking.ts";
import { sourceFamily } from "./source_family.ts";

function ref(over: Partial<CompositionRef> & { slug: string }): CompositionRef {
  return {
    foodGroupRef: "poultry",
    label: over.slug,
    source: "ciqual",
    energyKcal: 110,
    proteinG: 23,
    carbsG: null,
    fatG: null,
    fiberG: null,
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

const INDEX = buildCompositionIndex(
  [
    ref({ slug: "chicken_breast", yieldClass: "meat_shrinks" }),
    ref({ slug: "salmon", foodGroupRef: "fatty_fish", yieldClass: "fish_shrinks" }),
    ref({ slug: "tuna_tinned", foodGroupRef: "white_fish", yieldClass: "neutral" }),
    ref({ slug: "ham", foodGroupRef: "lean_protein", yieldClass: "neutral" }),
  ],
  [
    { alias: "blanc de poulet cuit", slug: "chicken_breast" },
    { alias: "saumon", slug: "salmon" },
    { alias: "thon en conserve", slug: "tuna_tinned" },
    { alias: "jambon", slug: "ham" },
  ],
);

const dish = (title: string, kind: string | null, terms: string[]) => ({
  day: "sat",
  slot: "dinner",
  title,
  ingredients: terms.map((term) => ({ term, ref: null, refRefused: false })),
  sameDay: kind === null ? null : { kind },
});

Deno.test("le critère : ce qui fond à la cuisson doit cuire", () => {
  assertEquals([...MUST_BE_COOKED_YIELD_CLASSES].sort(), ["fish_shrinks", "meat_shrinks"]);
});

Deno.test("⛔ `930edb4b` — saumon et poulet « déjà cuits » dans des plats à assembler, jamais cuits", () => {
  const { found } = uncookedRawProteins({
    index: INDEX,
    dishes: [
      dish("Saumon et couscous", "assemble", ["saumon"]),
      dish("Poulet avocat", "reheat_only", ["blanc de poulet cuit"]),
    ],
  });
  assertEquals(found.map((f) => [f.dish, f.slug]), [
    ["Saumon et couscous", "salmon"],
    ["Poulet avocat", "chicken_breast"],
  ]);
});

Deno.test("le cas qui passe : cuit le jour même, ou prêt à manger tel qu'acheté", () => {
  const { found, unknownSameDay } = uncookedRawProteins({
    index: INDEX,
    dishes: [
      dish("Saumon poêlé", "cook_fresh", ["saumon"]),
      dish("Salade de thon", "assemble", ["thon en conserve"]),
      dish("Tartine jambon", "assemble", ["jambon"]),
    ],
  });
  assertEquals(found, []);
  assertEquals(unknownSameDay, 0);
});

Deno.test("un plat sans `same_day` lisible n'est pas refusé, il est compté", () => {
  const { found, unknownSameDay } = uncookedRawProteins({
    index: INDEX,
    dishes: [dish("Poulet mystère", null, ["blanc de poulet cuit"])],
  });
  assertEquals(found, []);
  assertEquals(unknownSameDay, 1);
});

Deno.test("sans référentiel, on ne sait rien, et on ne refuse rien", () => {
  const { found } = uncookedRawProteins({
    index: null,
    dishes: [dish("Saumon", "assemble", ["saumon"])],
  });
  assertEquals(found, []);
});

Deno.test("la consigne nomme les deux sorties, et le nom tel qu'acheté", () => {
  const text = rawProteinRepairInstruction();
  assert(text.includes('"uses"'));
  assert(text.includes("cook_fresh"));
  assert(text.includes("never \"cuit\""));
});

Deno.test("la cause est chassée par la boucle de réparation", () => {
  assert(CHASED_CAUSES.has("raw_protein_uncooked"));
});

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

Deno.test("la lane la pousse à la réparation, et refuse la livraison si elle survit", async () => {
  const handler = stripComments(
    await sourceFamily(new URL("../../generate-household-meal-v1/index.ts", import.meta.url)),
  );
  const upstream = handler.indexOf('cause: "raw_protein_uncooked",');
  const refusal = handler.indexOf("const crusRestants = uncookedRawProteins({");
  const publication = handler.indexOf("const publication = await decidePlanPublication({");
  assert(upstream > 0, "la viande crue n'est plus poussée à la réparation");
  assert(refusal > 0 && refusal < publication, "la livraison ne la refuse plus avant la publication");
  const bloc = handler.slice(refusal, publication);
  assert(bloc.includes('error: "plan_not_deliverable"'), "le refus ne dit plus que le plan n'est pas livrable");
});
