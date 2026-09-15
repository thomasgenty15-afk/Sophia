/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT 3.1 — LA LIGNE DE COURSES QUE PERSONNE NE CUISINE (audit R4)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⛔ LE DÉFAUT, MESURÉ SUR DEUX PLANS N=4 (2026-09-14,
 * `scratchpad/2026-09-14-B4-FINAL/TABLES.md`): 260 g de `lentils_dry` sur la
 * liste de courses, zéro lentille dans la seule casserole et dans tous les
 * plats écrits. Le compteur `shopping_unattributed: 1` existait — et ne nommait
 * rien: il a fallu ouvrir le JSON du banc pour savoir de quel aliment on parle.
 *
 * ⛔ ET L'AUDIT DES ACHATS SORTAIT CE CAS PAR UN `continue`, SANS UN MOT. Son
 * commentaire disait vrai à moitié: ce n'est pas un défaut d'ACHAT (rien ne
 * manque). Mais la personne PAIE une nourriture que le plan ne cuisinera pas,
 * et B4 demande que grammes, préparations et courses décrivent la même
 * nourriture — dans les DEUX sens.
 *
 * ⚠️ `count`, PAS `refuse`. L'arbitrage du 2026-09-12 est écrit et daté: « un
 * plan entier jeté pour une ligne d'achat est le pire des deux mondes ». La
 * cause sort dans `gaps`, donc à l'écran, et le plan part avec son écart nommé.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  buildCompositionIndex,
  type CompositionIndex,
  type CompositionRef,
} from "./food_composition.ts";
import { shoppingIdentityAudit } from "./final_plan_audit.ts";
import {
  FINAL_GATE_CAUSES,
  FINAL_GATE_POLICY_LOT_4,
} from "./final_plan_gate.ts";

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
  } as CompositionRef;
}

const INDEX: CompositionIndex = buildCompositionIndex(
  [
    ref({ slug: "tofu", foodGroupRef: "tofu_tempeh", energyKcal: 145, proteinG: 16 }),
    ref({ slug: "lentils_dry", foodGroupRef: "legumes", energyKcal: 335, proteinG: 24 }),
    ref({ slug: "olive_oil", foodGroupRef: "olive_oil", energyKcal: 900, fatG: 100 }),
  ],
  [],
);

/** Le cas N=4 mesuré: la casserole aux lentilles a été retirée, la ligne est restée. */
const PLAN_ORPHELIN = {
  dishes: [{
    ingredients: [
      { term: "tofu", amount: 420, unit: "g", state: "raw", ref: "tofu" },
    ],
  }],
  preparations: [],
  shopping_list: [
    { term: "tofu", quantity: "420 g", amount: 420, unit: "g", state: "raw", ref: "tofu" },
    {
      term: "lentilles",
      quantity: "260 g",
      amount: 260,
      unit: "g",
      state: "raw",
      ref: "lentils_dry",
    },
  ],
};

Deno.test("⛔ LA LIGNE ORPHELINE EST NOMMÉE — et elle porte ses grammes", () => {
  const audit = shoppingIdentityAudit({
    index: INDEX,
    plan: PLAN_ORPHELIN,
    pantryTerms: [],
    pantryCoveredG: new Map<string, number>(),
  });
  const orpheline = audit.rows.find((r) => r.identity === "lentils_dry");
  assert(orpheline, "la ligne que personne ne cuisine doit sortir de l'audit");
  assertEquals(orpheline.state, "bought_unused");
  assertEquals(orpheline.neededLines, 0);
  assertEquals(orpheline.boughtRawG, 260);
  // ⛔ LE POINT DU LOT: le motif NOMME l'aliment et sa quantité. `1` ne disait rien.
  assert(orpheline.reason.includes("260"), orpheline.reason);
  assert(orpheline.reason.includes("aucune recette"), orpheline.reason);
});

Deno.test("le cas qui passe: tout ce qui est acheté est cuisiné", () => {
  const audit = shoppingIdentityAudit({
    index: INDEX,
    plan: { ...PLAN_ORPHELIN, shopping_list: [PLAN_ORPHELIN.shopping_list[0]] },
    pantryTerms: [],
    pantryCoveredG: new Map<string, number>(),
  });
  assertEquals(audit.rows.filter((r) => r.state === "bought_unused").length, 0);
  assertEquals(audit.rows.find((r) => r.identity === "tofu")?.state, "covered_measured");
});

Deno.test("⚠️ UN GARDE-MANGER EN TROP RESTE MUET — il ne fait dépenser personne", () => {
  // « J'ai des lentilles chez moi » et le plan n'en veut pas: rien n'est acheté,
  // il n'y a rien à dire. Seule une LIGNE DE COURSES fait payer.
  const audit = shoppingIdentityAudit({
    index: INDEX,
    plan: { ...PLAN_ORPHELIN, shopping_list: [PLAN_ORPHELIN.shopping_list[0]] },
    pantryTerms: ["lentilles"],
    pantryCoveredG: new Map<string, number>(),
  });
  assertEquals(audit.rows.filter((r) => r.state === "bought_unused").length, 0);
});

Deno.test("la cause existe, et elle est `count` — jamais un 422", () => {
  assert((FINAL_GATE_CAUSES as readonly string[]).includes("ingredient_bought_unused"));
  // ⛔ L'ARBITRAGE DU 2026-09-12, ÉPINGLÉ. Le passer à `refuse` ferait jeter un
  // plan entier pour une ligne de courses — ce que ce dépôt a décidé de ne pas
  // faire, par écrit, après deux tirs perdus sur ces causes.
  assertEquals(FINAL_GATE_POLICY_LOT_4.ingredient_bought_unused, "count");
});

Deno.test("⛔ LE CÂBLAGE: la garde refuse bien sur cet état", async () => {
  const src = await Deno.readTextFile(new URL("./final_plan_gate.ts", import.meta.url));
  assert(src.includes('if (row.state === "bought_unused") {'));
  assert(src.includes('refuse("ingredient_bought_unused", {'));
});
