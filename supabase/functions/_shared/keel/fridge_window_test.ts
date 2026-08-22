import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  cookedWindowVerdict,
  emptyFridgeWindowCounts,
  fridgeWindowChecked,
  RAW_WINDOW_DAYS,
  RAW_WINDOW_NEVER_BINDS_FROM,
  rawWindowDaysFor,
} from "./fridge_window.ts";
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
  ["red_meat", 3],
  ["leafy_greens", 3],
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
  assert(rawWindowDaysFor("red_meat")! > rawWindowDaysFor("poultry")!);
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

