import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  cookedWindowVerdict,
  emptyFridgeWindowCounts,
  freezerClaimedWithoutOne,
  FREEZER_WINDOW_DAYS,
  fridgeWindowChecked,
  keptWindowDays,
  preparationHoldsRice,
  RAW_WINDOW_DAYS,
  RAW_WINDOW_NEVER_BINDS_FROM,
  rawWindowDaysFor,
  riceRefsOf,
} from "./fridge_window.ts";
import { MAX_WINDOW_DAYS } from "./meal_plan_window.ts";
import { FOOD_GROUP_REFS } from "./tokens.ts";

// ═══════════════════════════════════════════════════════════════════════════
// ① LA FENÊTRE CUITE — LA BORNE, ÉPINGLÉE PAR DES LITTÉRAUX
// ═══════════════════════════════════════════════════════════════════════════
//
// ⛔ LES TROIS ARGUMENTS SONT DES LITTÉRAUX, `MAX_FRIDGE_DAYS` N'EST PAS
// IMPORTÉE ICI. Un test qui passe la constante qu'il vérifie se re-paramètre
// tout seul et reste vert quand on la change — c'est la cicatrice
// « test paramétré par sa propre constante », et elle a déjà coûté un lot.

Deno.test("décision n° 14 — cuit vendredi, mangé jusqu'au dimanche, pas lundi", () => {
  // Fenêtre lun..dim, rangs 0..6. Vendredi = 4, samedi = 5, dimanche = 6.
  assertEquals(cookedWindowVerdict(4, 4, 3), "within", "vendredi même");
  assertEquals(cookedWindowVerdict(4, 5, 3), "within", "samedi");
  assertEquals(cookedWindowVerdict(4, 6, 3), "within", "dimanche");
  // Lundi suivant = rang 7 dans une fenêtre de sept jours prolongée.
  assertEquals(cookedWindowVerdict(4, 7, 3), "too_late", "lundi est trop tard");
});

Deno.test("MUTATION — l'écart de trois jours est REFUSÉ, pas toléré", () => {
  // ⛔ CE TEST EST L'ARME DU LOT `L0-a`. Il rougit dès que la comparaison
  // redevient `>` : sous `>`, un écart de 3 rendait `within`.
  //   « cuit dimanche (rang 0), mangé mercredi (rang 3) — ça passait. »
  assertEquals(cookedWindowVerdict(0, 3, 3), "too_late");
  assertEquals(cookedWindowVerdict(0, 2, 3), "within");
  // Et la borne suit la constante qu'on lui passe, sans la recopier.
  assertEquals(cookedWindowVerdict(0, 2, 2), "too_late");
  assertEquals(cookedWindowVerdict(0, 1, 2), "within");
});

Deno.test("un lot mangé avant d'être cuisiné n'est pas une violation de fenêtre", () => {
  // C'est une AUTRE règle, et elle a son propre message. Les confondre ferait
  // compter deux fois le même plat et disparaître l'une des deux anomalies.
  assertEquals(cookedWindowVerdict(3, 0, 3), "before_cooking");
  assertEquals(cookedWindowVerdict(1, 0, 3), "before_cooking");
});

Deno.test("les trois populations se somment sur ce qui a été regardé", () => {
  const counts = emptyFridgeWindowCounts();
  assertEquals(counts, { violations: 0, within: 0, not_evaluated: 0 });
  assertEquals(fridgeWindowChecked(counts), 0);
  counts.within = 7;
  counts.violations = 2;
  counts.not_evaluated = 1;
  assertEquals(fridgeWindowChecked(counts), 10);
});

// ═══════════════════════════════════════════════════════════════════════════
// ② LA FENÊTRE CRUE — UNE VALEUR PAR GROUPE, ET LES TRENTE SONT ÉCRITES
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("les trente groupes portent une fenêtre crue, et rien d'autre", () => {
  // ⛔ LA TABLE EST LA VÉRITÉ, ce tableau en est le miroir. Un groupe ajouté à
  // `food_groups` sans fenêtre crue doit ROUGIR ICI, sinon la colonne se
  // remplit de `null` que personne ne regarde.
  assertEquals(Object.keys(RAW_WINDOW_DAYS).length, 30);
  assertEquals(FOOD_GROUP_REFS.length, 30);
  for (const slug of FOOD_GROUP_REFS) {
    assert(
      typeof RAW_WINDOW_DAYS[slug] === "number",
      `${slug} n'a pas de fenêtre crue`,
    );
  }
  for (const slug of Object.keys(RAW_WINDOW_DAYS)) {
    assert(
      (FOOD_GROUP_REFS as readonly string[]).includes(slug),
      `${slug} n'est pas un groupe de food_groups`,
    );
  }
});

// ⛔ UN TEST PAR GROUPE, ET LES VALEURS SONT DES LITTÉRAUX. C'est l'arme
// demandée par la fiche : poisson ~1 j · volaille et viande hachée ~2 j ·
// viande en pièce ~3 j · légumes frais ~7 j · œufs, secs, conserves ~très
// long. Une table lue depuis elle-même ne vérifierait rien.
const EXPECTED_RAW_WINDOW: ReadonlyArray<[string, number]> = [
  ["fatty_fish", 1],
  ["white_fish", 1],
  ["shellfish", 1],
  ["fried_food", 1],
  ["poultry", 2],
  ["lean_protein", 2],
  // ⟳ 2026-09-24 — `red_meat` 3 → 2, `leafy_greens` 3 → 5 (migration
  // `20260924210000`, brouillon `59b06fd6`).
  ["red_meat", 2],
  ["leafy_greens", 5],
  ["berries", 3],
  ["tofu_tempeh", 5],
  ["dairy_yogurt", 7],
  ["cruciferous_veg", 7],
  ["non_starchy_veg", 7],
  ["other_fruit", 7],
  ["dairy_cheese", 14],
  ["starchy_veg", 14],
  ["citrus", 14],
  ["other_added_fat", 14],
  ["eggs", 21],
  ["legumes", 21],
  ["whole_grain", 21],
  ["refined_grain", 21],
  ["nuts_seeds", 21],
  ["olive_oil", 21],
  ["sauce_dressing", 21],
  ["sugar_sweets", 21],
  ["alcohol", 21],
  ["sweetened_beverage", 21],
  ["water", 21],
  ["coffee_tea", 21],
];

for (const [slug, days] of EXPECTED_RAW_WINDOW) {
  Deno.test(`fenêtre crue — ${slug} attend au plus ${days} jour(s)`, () => {
    assertEquals(rawWindowDaysFor(slug), days);
  });
}

Deno.test("les trente attendus couvrent les trente groupes", () => {
  // Sans ça, retirer une ligne de `EXPECTED_RAW_WINDOW` désarmerait un groupe
  // en silence — trente tests verts pour vingt-neuf groupes vérifiés.
  assertEquals(EXPECTED_RAW_WINDOW.length, 30);
  assertEquals(
    [...EXPECTED_RAW_WINDOW.map(([s]) => s)].sort(),
    [...FOOD_GROUP_REFS].sort(),
  );
});

Deno.test("la volaille tient MOINS longtemps que le nombre historique", () => {
  // ⛔ LE DÉFAUT ②, MESURÉ SUR LE CAS 04. La date de courses accordait trois
  // jours à TOUT (`MAX_FRIDGE_DAYS`); une volaille fraîche en tient deux.
  // Ce test rougit si quelqu'un remet le poulet à trois.
  assert(rawWindowDaysFor("poultry")! < 3, "le poulet ne peut pas attendre 3 jours");
  assert(rawWindowDaysFor("white_fish")! < rawWindowDaysFor("poultry")!);
  // ⟳ 2026-09-24 — la viande en pièce ne tient plus davantage que la volaille :
  // un filet de porc acheté jeudi pour dimanche a été jugé dangereux
  // (brouillon `59b06fd6`). Ce test rougit si quelqu'un la remet à trois.
  assert(rawWindowDaysFor("red_meat")! <= 2, "une viande crue en pièce ne passe pas deux jours");
});

Deno.test("un groupe inconnu rend null, jamais un défaut", () => {
  assertEquals(rawWindowDaysFor(null), null);
  assertEquals(rawWindowDaysFor(undefined), null);
  assertEquals(rawWindowDaysFor(""), null);
  assertEquals(rawWindowDaysFor("chocolat"), null);
  // Un slug d'une AUTRE table (`food_composition_refs`) n'est pas un groupe.
  assertEquals(rawWindowDaysFor("chicken_breast"), null);
});

Deno.test("au-delà de sept jours, la fenêtre crue ne peut plus mordre", () => {
  // Une fenêtre de plan fait au plus sept jours (`MAX_WINDOW_DAYS`). C'est ce
  // qui rend « 21 » honnête: un seul nombre pour « ça ne contraint rien ».
  assertEquals(RAW_WINDOW_NEVER_BINDS_FROM, 7);
  for (const [slug, days] of EXPECTED_RAW_WINDOW) {
    if (days < RAW_WINDOW_NEVER_BINDS_FROM) continue;
    assert(days >= 7, `${slug} devrait être hors contrainte`);
  }
});



// ═══════════════════════════════════════════════════════════════════════════
// ③ LE CONGÉLATEUR — 2026-09-01
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("`FREEZER_WINDOW_DAYS` vaut 7, et 7 EST le plafond d'un plan", () => {
  // ⛔ DEUX ASSERTIONS ET PAS UNE. Le littéral épingle la valeur (le module est
  // PUR et n'importe pas `MAX_WINDOW_DAYS` — c'est ce qui le rend lisible
  // depuis Vite); la seconde attrape la divergence si le plafond de fenêtre
  // bouge un jour. Sans elle, un plan de 10 jours rouvrirait des trous au
  // milieu de la semaine sans qu'aucun rouge ne le dise.
  assertEquals(FREEZER_WINDOW_DAYS, 7);
  assertEquals(FREEZER_WINDOW_DAYS, MAX_WINDOW_DAYS);
});

Deno.test("la fenêtre ne s'ouvre QUE sur la déclaration ET l'équipement", () => {
  // Les quatre combinaisons, et trois d'entre elles restent au frigo.
  const at = (kept: "fridge" | "freezer", hasFreezer: boolean) =>
    keptWindowDays({ kept, hasFreezer, maxFridgeDays: 3, holdsCookedRice: false });

  assertEquals(at("freezer", true), 7); // la seule qui ouvre
  assertEquals(at("freezer", false), 3); // réclamé sans l'appareil
  assertEquals(at("fridge", true), 3); // avoir un congélateur ne suffit pas
  assertEquals(at("fridge", false), 3); // le cas nominal

  // ⚠️ `3` EST UN LITTÉRAL, pas `MAX_FRIDGE_DAYS`: un test paramétré par sa
  // propre constante reste vert quand on la change.
});

Deno.test("⛔ `hasFreezer` non booléen JETTE — l'ignorance ne s'hérite pas", () => {
  // La posture de `firstDayCookable` dans `addedCookDays`: un appelant qui n'a
  // pas lu l'inventaire passe `false`, il ne laisse pas un `undefined` décider
  // qu'un lot de six jours peut être servi.
  for (const bad of [undefined, null, "true", 1]) {
    let threw = false;
    try {
      keptWindowDays(
        { kept: "freezer", hasFreezer: bad, maxFridgeDays: 3, holdsCookedRice: false } as never,
      );
    } catch {
      threw = true;
    }
    assert(threw, `hasFreezer=${JSON.stringify(bad)} aurait dû jeter`);
  }
});

Deno.test("le constat de réclamation est SÉPARÉ de la décision de fenêtre", () => {
  // Il ne sonne que sur la combinaison « déclaré sans l'appareil ».
  assertEquals(freezerClaimedWithoutOne({ kept: "freezer", hasFreezer: false }), true);
  assertEquals(freezerClaimedWithoutOne({ kept: "freezer", hasFreezer: true }), false);
  assertEquals(freezerClaimedWithoutOne({ kept: "fridge", hasFreezer: false }), false);
  assertEquals(freezerClaimedWithoutOne({ kept: "fridge", hasFreezer: true }), false);
});

Deno.test("une part congelée traverse la semaine, une part au frigo non", () => {
  // Le couple qui a coûté le lot: cuit dimanche (rang 0), mangé samedi (rang 6).
  assertEquals(cookedWindowVerdict(0, 6, 3), "too_late");
  assertEquals(cookedWindowVerdict(0, 6, 7), "within");
  // Et la fenêtre du frigo n'a pas bougé d'un jour: J+2 passe, J+3 non.
  assertEquals(cookedWindowVerdict(0, 2, 3), "within");
  assertEquals(cookedWindowVerdict(0, 3, 3), "too_late");
});

// ⟳ 2026-09-25 — LE RIZ CUIT: LE JOUR MÊME OU LE LENDEMAIN.
Deno.test("riz: la fenêtre vaut 2 au frigo, le congélateur déclaré et présent gagne", () => {
  const at = (kept: "fridge" | "freezer", hasFreezer: boolean, rice: boolean) =>
    keptWindowDays({ kept, hasFreezer, maxFridgeDays: 3, holdsCookedRice: rice });
  assertEquals(at("fridge", false, true), 2);
  assertEquals(at("fridge", true, true), 2, "avoir un congélateur ne suffit pas");
  assertEquals(at("freezer", false, true), 2, "réclamé sans l'appareil");
  assertEquals(at("freezer", true, true), 7, "congelé le jour de la cuisson");
  // Le jour même et le lendemain passent, le surlendemain non.
  assertEquals(cookedWindowVerdict(0, 0, 2), "within");
  assertEquals(cookedWindowVerdict(0, 1, 2), "within");
  assertEquals(cookedWindowVerdict(0, 2, 2), "too_late");
  // ⚠️ `Math.min`: une fenêtre générale plus courte que celle du riz gagne.
  assertEquals(keptWindowDays({ kept: "fridge", hasFreezer: false, maxFridgeDays: 1, holdsCookedRice: true }), 1);
});

Deno.test("⛔ `holdsCookedRice` non booléen JETTE", () => {
  for (const bad of [undefined, null, "true", 1]) {
    let threw = false;
    try {
      keptWindowDays({ kept: "fridge", hasFreezer: false, maxFridgeDays: 3, holdsCookedRice: bad } as never);
    } catch {
      threw = true;
    }
    assert(threw, `holdsCookedRice=${JSON.stringify(bad)} aurait dû jeter`);
  }
});

Deno.test("riz: les identifiants viennent de la famille du référentiel, pas du libellé", () => {
  const bySlug = new Map([
    ["white_rice", { slug: "white_rice", family: "rice" }],
    ["brown_rice", { slug: "brown_rice", family: "rice" }],
    ["rice_pudding_cake", { slug: "rice_pudding_cake", family: null }],
    ["quinoa", { slug: "quinoa", family: "quinoa" }],
  ]);
  assertEquals(riceRefsOf({ bySlug }), ["brown_rice", "white_rice"]);
  const refs = new Set(riceRefsOf({ bySlug }));
  assertEquals(preparationHoldsRice([{ ref: "quinoa" }, { ref: "white_rice" }], refs), true);
  assertEquals(preparationHoldsRice([{ ref: "rice_pudding_cake" }, { ref: null }, {}], refs), false);
});

