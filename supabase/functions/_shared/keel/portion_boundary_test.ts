/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-23 · AUDIT DES DOSAGES, LOT 5 — L'ORDRE DU RABOTAGE SUIT
 * L'OBJECTIF, ET L'ÉNERGIE RETIRÉE SE COMPTE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Mesuré par l'audit (`docs/keel/AUDIT-DOSAGES-2026-09-23.md`): le rabotage
 * « le plus gros item d'abord » coupait le féculent de la grosse assiette — là
 * où le partage venait de mettre son surplus d'énergie — et `day_kcal`
 * affichait 100 % pendant que le rabotage retirait jusqu'à 460 kcal par jour.
 *
 * Ce fichier tient les trois ordres (`starch_first`, `least_dense_first`,
 * `largest_first`), le plancher d'identité des légumes (70 %), et les
 * compteurs neufs (`kcal_shaved`, `grams_shaved_unpriced`, `shave_order`,
 * `by_member`, `items_missing_shave_facts`).
 *
 * ⛔ NOMBRES EN DUR, jamais recalculés depuis une constante du module.
 * ⛔ CHAQUE ORDRE A UN CAS QUI MORD ET UN CAS QUI PASSE À CÔTÉ.
 *
 * Les tests d'avant ce lot vivent dans `portion_meal_bounds_test.ts` et
 * `shopping_lot1_test.ts`: `goalOf: () => null` leur rend la règle d'avant
 * (`largest_first`), mot pour mot.
 */
import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import {
  type BoundedBox,
  type BoundedBoxItem,
  emptyPortionBoundaryCounts,
  fitPortionsToBounds,
  isStarchItemGroup,
  SHAVE_ORDERS,
  shaveOrderFor,
} from "./portion_boundary.ts";
import type { StarchGoal } from "./starch_side.ts";
import type { FoodGroupRef } from "./tokens.ts";

// ───────────────────────────────────────────────────────────────────────────
// LES OUTILS DU BANC
// ───────────────────────────────────────────────────────────────────────────

function item(
  grams: number,
  kcalPerG: number | null,
  group: FoodGroupRef | null,
): BoundedBoxItem {
  return { preparationId: null, grams, group, kcalPerG, starch: isStarchItemGroup(group) };
}

function plate(memberId: string, items: BoundedBoxItem[], slot = "lunch"): BoundedBox {
  return { boxId: `${memberId}-${slot}`, day: "mon", slot, memberIds: [memberId], items };
}

function fit(boxes: BoundedBox[], max: number, goalOf: (memberId: string) => StarchGoal | null) {
  return fitPortionsToBounds({
    boxes,
    boundsFor: () => ({ min: 100, max }),
    potReadyGrams: new Map(),
    potMarginPercent: 1,
    goalOf,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ① LES VOCABULAIRES
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("vocabulaire fermé des ordres, et l'ordre de chaque objectif", () => {
  assertEquals([...SHAVE_ORDERS], ["starch_first", "least_dense_first", "largest_first"]);
  assertEquals(shaveOrderFor("fat_loss"), "starch_first");
  assertEquals(shaveOrderFor("maintenance"), "starch_first");
  assertEquals(shaveOrderFor("muscle_gain"), "least_dense_first");
  assertEquals(shaveOrderFor(null), "largest_first");
});

Deno.test("le féculent est la liste de `starchSideOf`: céréales et légumes féculents, rien d'autre", () => {
  for (const g of ["refined_grain", "whole_grain", "starchy_veg"] as const) {
    assert(isStarchItemGroup(g), g);
  }
  for (const g of ["legumes", "poultry", "non_starchy_veg", "dairy_cheese"] as const) {
    assert(!isStarchItemGroup(g), g);
  }
  assertEquals(isStarchItemGroup(null), false, "un item non résolu n'est pas un féculent");
});

Deno.test("les compteurs neufs partent à zéro, les trois ordres compris", () => {
  const c = emptyPortionBoundaryCounts();
  assertEquals(c.kcal_shaved, 0);
  assertEquals(c.grams_shaved_unpriced, 0);
  assertEquals(c.shave_order, { starch_first: 0, least_dense_first: 0, largest_first: 0 });
  assertEquals(c.by_member, {});
  assertEquals(c.items_missing_shave_facts, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// ② LE BANC DE L'AUDIT: 70 g À RETIRER, PRINCIPAL 1,2 kcal/g, FÉCULENT 1,3
// ═══════════════════════════════════════════════════════════════════════════
//
// Casserole principale 320 g à 1,2 kcal/g (groupe non résolu: plancher 50 %,
// 160 g), féculent 300 g à 1,3 (céréale raffinée: plancher 150 g). 620 g pour
// un plafond de 550: 70 g à retirer.

function bancAudit(): BoundedBox[] {
  return [plate("x", [item(320, 1.2, null), item(300, 1.3, "refined_grain")])];
}

Deno.test("MORD — perte et maintien: le féculent d'abord, 70 × 1,3 = 91 kcal retirées", () => {
  for (const goal of ["fat_loss", "maintenance"] as const) {
    const boxes = bancAudit();
    const c = fit(boxes, 550, () => goal);
    assertEquals(boxes[0].items.map((i) => i.grams), [320, 230], goal);
    assertEquals(c.shaved, 1);
    assertEquals(c.grams_shaved, 70);
    assertAlmostEquals(c.kcal_shaved, 91, 1e-9);
    assertEquals(c.grams_shaved_unpriced, 0);
    assertEquals(c.shave_order, { starch_first: 1, least_dense_first: 0, largest_first: 0 });
    assertEquals(c.by_member.x.meals, 1);
    assertEquals(c.by_member.x.grams, 70);
    assertAlmostEquals(c.by_member.x.kcal, 91, 1e-9);
    assertEquals(c.items_missing_shave_facts, 0);
  }
});

Deno.test("MORD — prise: le MOINS dense d'abord, 70 × 1,2 = 84 kcal retirées", () => {
  const boxes = bancAudit();
  const c = fit(boxes, 550, () => "muscle_gain");
  assertEquals(boxes[0].items.map((i) => i.grams), [250, 300]);
  assertAlmostEquals(c.kcal_shaved, 84, 1e-9);
  assertEquals(c.shave_order, { starch_first: 0, least_dense_first: 1, largest_first: 0 });
  assertAlmostEquals(c.by_member.x.kcal, 84, 1e-9);
});

Deno.test("PASSE À CÔTÉ — objectif nul: le plus gros d'abord, la règle d'avant", () => {
  const boxes = bancAudit();
  const c = fit(boxes, 550, () => null);
  assertEquals(boxes[0].items.map((i) => i.grams), [250, 300], "320 g > 300 g");
  assertAlmostEquals(c.kcal_shaved, 84, 1e-9);
  assertEquals(c.shave_order, { starch_first: 0, least_dense_first: 0, largest_first: 1 });
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ LE MOINS DENSE D'ABORD N'EST PAS LE PLUS GROS D'ABORD
// ═══════════════════════════════════════════════════════════════════════════
//
// Riz 300 g à 1,3, courgette 200 g à 0,2 (légume: plancher 70 % = 140 g),
// poulet 150 g à 1,6. 650 g pour un plafond de 560: 90 g à retirer.

function bancTrois(): BoundedBox[] {
  return [
    plate("t", [
      item(300, 1.3, "refined_grain"),
      item(200, 0.2, "non_starchy_veg"),
      item(150, 1.6, "poultry"),
    ]),
  ];
}

Deno.test("MORD — prise: la courgette donne jusqu'à SON plancher de 70 %, puis le riz", () => {
  // Courgette 200 → 140 (60 g, 12 kcal), puis riz 300 → 270 (30 g, 39 kcal).
  const boxes = bancTrois();
  const c = fit(boxes, 560, () => "muscle_gain");
  assertEquals(boxes[0].items.map((i) => i.grams), [270, 140, 150]);
  assertAlmostEquals(c.kcal_shaved, 51, 1e-9);
  // ⛔ LE PLANCHER D'IDENTITÉ DU LÉGUME TIENT: 140 = 70 % de 200.
  assertEquals(boxes[0].items[1].grams, 140);
});

Deno.test("PASSE À CÔTÉ — objectif nul sur le même banc: le riz, le plus gros, donne tout", () => {
  const boxes = bancTrois();
  const c = fit(boxes, 560, () => null);
  assertEquals(boxes[0].items.map((i) => i.grams), [210, 200, 150]);
  assertAlmostEquals(c.kcal_shaved, 117, 1e-9);
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ LE FÉCULENT D'ABORD S'ARRÊTE À SON PLANCHER, ET LES LÉGUMES GARDENT 70 %
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("MORD — perte: le riz à son plancher, puis le plus gros, la courgette arrêtée à 70 %", () => {
  // Riz 100 g (plancher 50), courgette 200 g (plancher 140), poulet 150 g
  // (plancher 75). 450 g pour un plafond de 300: 150 g à retirer.
  //   riz 100 → 50 (50 g, 65 kcal); courgette 200 → 140 (60 g, 12 kcal);
  //   poulet 150 → 110 (40 g, 64 kcal). 141 kcal.
  // ⚠️ Le plus gros d'abord aurait rendu courgette 140, poulet 75, riz 85.
  const boxes = [
    plate("f", [
      item(100, 1.3, "refined_grain"),
      item(200, 0.2, "non_starchy_veg"),
      item(150, 1.6, "poultry"),
    ]),
  ];
  const c = fit(boxes, 300, () => "fat_loss");
  assertEquals(boxes[0].items.map((i) => i.grams), [50, 140, 110]);
  assertAlmostEquals(c.kcal_shaved, 141, 1e-9);
  assertEquals(c.shave_order.starch_first, 1);
});

Deno.test("le compte n'y est pas: rien n'est touché, et aucune énergie ne se compte", () => {
  // Riz 100 (donne 50), courgette 200 (donne 60): 110 g au plus; 150 demandés.
  const boxes = [plate("f", [item(100, 1.3, "refined_grain"), item(200, 0.2, "non_starchy_veg")])];
  const c = fit(boxes, 150, () => "fat_loss");
  assertEquals(boxes[0].items.map((i) => i.grams), [100, 200]);
  assertEquals(c.still_over_max, 1);
  assertEquals(c.kcal_shaved, 0);
  assertEquals(c.shave_order, { starch_first: 0, least_dense_first: 0, largest_first: 0 });
  // Le repas a été jugé: sa bouche a une entrée, à zéro.
  assertEquals(c.by_member.f, { meals: 0, grams: 0, kcal: 0 });
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ UNE DENSITÉ INCONNUE N'EST JAMAIS ZÉRO KCAL
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("densité inconnue: les grammes se comptent à part, jamais comme 0 kcal", () => {
  // Perte: le riz sans densité donne ses 70 g; `kcal_shaved` est une borne
  // basse et le dit par `grams_shaved_unpriced`.
  const boxes = [plate("u", [item(320, 1.2, null), item(300, null, "refined_grain")])];
  const c = fit(boxes, 550, () => "fat_loss");
  assertEquals(boxes[0].items.map((i) => i.grams), [320, 230]);
  assertEquals(c.kcal_shaved, 0);
  assertEquals(c.grams_shaved_unpriced, 70);
  // Prise: une densité inconnue passe APRÈS les connues — on ne sait pas ce
  // qu'elle coûte. Le principal (1,2) donne, même s'il est plus lourd.
  const prise = [plate("u", [item(300, null, null), item(320, 1.2, "poultry")])];
  const cp = fit(prise, 550, () => "muscle_gain");
  assertEquals(prise[0].items.map((i) => i.grams), [300, 250]);
  assertAlmostEquals(cp.kcal_shaved, 84, 1e-9);
  assertEquals(cp.grams_shaved_unpriced, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ PAR BOUCHE, ET L'OBJECTIF DE CHACUNE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("trois bouches, trois objectifs: chaque repas est raboté dans SON ordre", () => {
  const goals: Record<string, StarchGoal | null> = {
    fab: "fat_loss",
    tho: "muscle_gain",
    chr: "maintenance",
  };
  const boxes: BoundedBox[] = [
    plate("fab", [item(320, 1.2, null), item(300, 1.3, "refined_grain")]),
    plate("tho", [item(320, 1.2, null), item(300, 1.3, "refined_grain")]),
    // Dans ses bornes: jugée, pas rabotée — et elle a son entrée à zéro.
    plate("chr", [item(250, 1.2, null), item(200, 1.3, "refined_grain")]),
    // Un bac à deux noms n'est pas une assiette: aucune entrée par bouche.
    {
      boxId: "bac",
      day: "mon",
      slot: "lunch",
      memberIds: ["fab", "tho"],
      items: [item(900, 1.3, "refined_grain")],
    },
  ];
  const c = fit(boxes, 550, (m) => goals[m] ?? null);
  assertEquals(boxes[0].items.map((i) => i.grams), [320, 230]);
  assertEquals(boxes[1].items.map((i) => i.grams), [250, 300]);
  assertEquals(boxes[3].items[0].grams, 900);
  assertEquals(c.tubs_not_judged, 1);
  assertEquals(c.shave_order, { starch_first: 1, least_dense_first: 1, largest_first: 0 });
  assertAlmostEquals(c.kcal_shaved, 175, 1e-9);
  assertEquals(Object.keys(c.by_member).sort(), ["chr", "fab", "tho"]);
  assertEquals(c.by_member.chr, { meals: 0, grams: 0, kcal: 0 });
  assertAlmostEquals(c.by_member.fab.kcal, 91, 1e-9);
  assertAlmostEquals(c.by_member.tho.kcal, 84, 1e-9);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑦ LA GARDE CONTRE LE `as` DU GÉNÉRATEUR
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("MORD — des items sans `kcalPerG` ni `starch` se comptent (le `as` ne les voit pas)", () => {
  // La forme exacte du générateur: `box.items as unknown as BoundedBoxItem[]`.
  const nus = [
    { preparationId: null, grams: 320, group: null },
    { preparationId: null, grams: 300, group: "refined_grain" },
  ] as unknown as BoundedBoxItem[];
  const boxes = [plate("n", nus)];
  const c = fit(boxes, 550, () => "fat_loss");
  assertEquals(c.items_missing_shave_facts, 2);
  // ⚠️ Et voici ce qu'un oubli coûte: l'ordre d'avant et zéro kcal comptée.
  assertEquals(boxes[0].items.map((i) => i.grams), [250, 300]);
  assertEquals(c.kcal_shaved, 0);
  assertEquals(c.grams_shaved_unpriced, 70);
});

Deno.test("PASSE À CÔTÉ — des items complets ne se comptent pas, `null` compris", () => {
  const boxes = [plate("p", [item(320, null, null), item(300, 1.3, "refined_grain")])];
  const c = fit(boxes, 700, () => "fat_loss");
  assertEquals(c.items_missing_shave_facts, 0);
  assertEquals(c.already_in_bounds, 1);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-24 — LE RELEVÉ DES REPAS RABOTÉS (`shavedByMeal`)
// ═══════════════════════════════════════════════════════════════════════════
//
// Il part au registre des à-côtés, qui rend cette énergie au pain et au
// fromage. ⛔ Un par repas RABOTÉ, rien pour un repas dans ses bornes, un bac,
// ou un repas qu'on n'a pas pu raboter; jamais dans les compteurs.

Deno.test("⟳ 2026-09-24 — relevé: seuls les repas rabotés, avec leurs kcal (91 et 84)", () => {
  const goals: Record<string, StarchGoal | null> = { fab: "fat_loss", tho: "muscle_gain" };
  const boxes: BoundedBox[] = [
    plate("fab", [item(320, 1.2, null), item(300, 1.3, "refined_grain")]),
    plate("tho", [item(320, 1.2, null), item(300, 1.3, "refined_grain")], "dinner"),
    // Dans ses bornes: jugé, pas raboté ⇒ pas de ligne.
    plate("chr", [item(250, 1.2, null), item(200, 1.3, "refined_grain")]),
    // Un bac à deux noms: pas une assiette ⇒ pas de ligne.
    {
      boxId: "bac",
      day: "mon",
      slot: "lunch",
      memberIds: ["fab", "tho"],
      items: [item(900, 1.3, "refined_grain")],
    },
  ];
  const c = fit(boxes, 550, (m) => goals[m] ?? null);
  assertEquals(c.shavedByMeal.length, 2);
  assertEquals(c.shavedByMeal.map((s) => [s.memberId, s.day, s.slot]), [
    ["fab", "mon", "lunch"],
    ["tho", "mon", "dinner"],
  ]);
  assertAlmostEquals(c.shavedByMeal[0].kcal, 91, 1e-9);
  assertAlmostEquals(c.shavedByMeal[1].kcal, 84, 1e-9);
  // ⛔ PAS UN COMPTEUR: les compteurs vides ne le portent pas.
  assertEquals("shavedByMeal" in emptyPortionBoundaryCounts(), false);
});

Deno.test("⟳ 2026-09-24 — relevé: un repas qu'on n'a pas pu raboter n'y est PAS (rien n'a été retiré)", () => {
  // 2 000 g pour un plafond de 550: le plancher d'identité ne laisse pas
  // retirer 1 450 g ⇒ intouché, compté `still_over_max`.
  const boxes = [plate("x", [item(1000, 1.2, null), item(1000, 1.3, "refined_grain")])];
  const c = fit(boxes, 550, () => "maintenance");
  assertEquals(c.still_over_max, 1);
  assertEquals(c.shavedByMeal, []);
});
