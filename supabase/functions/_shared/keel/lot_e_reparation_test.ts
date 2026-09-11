/**
 * ══════════════════════════════════════════════════════════════════════════
 * LOT E — LA RÉPARATION, RENDUE TRANSACTIONNELLE. 2026-09-11.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Quatre défauts mesurés, quatre épreuves. Aucune n'appelle un modèle.
 *
 *   ① `spliceReworkableUnits` recollait un titre sur les mauvaises casseroles;
 *   ② la fusion ne touchait pas `density_check`;
 *   ③ `judgeCandidate` jetait une amélioration qui ne baissait pas le COMPTE;
 *   ④ … et l'ajusteur déterministe du lot D n'avait aucun appelant.
 *
 * Le décor de ① et ② est le plan GAIN `a18f522e-41f9-469e-9c50-1d693d892ce6`,
 * premier appel de réparation, où le modèle a interverti samedi midi et samedi
 * soir (`docs/keel/ENQUETE-DEUX-DIRECTIONS-2026-09-11.md` §3).
 */
import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";
import { spliceReworkableUnits } from "./retry_merge.ts";
import type { GeneratedMeal } from "./meal_generation.ts";
import {
  judgeCandidate,
  magnitudeComparison,
  REPAIR_MAGNITUDE_MIN_GAIN,
  type RepairDefect,
} from "./plan_repair_loop.ts";
import type { GateRefusal } from "./final_plan_gate.ts";

// ---------------------------------------------------------------------------
// LE DÉCOR — les deux cases du samedi de GAIN, avec leurs vraies casseroles
// ---------------------------------------------------------------------------
function ing(term: string) {
  return { term, quantity: "100 g", amount: 100, unit: "g", state: "raw", gramsRaw: 100 };
}
function dish(
  slot: string,
  title: string,
  ingredients: string[],
  uses: string[],
  densityCheck: number | null = null,
) {
  return {
    day: "sat",
    slot,
    title,
    memberId: null,
    method: "",
    ingredients: ingredients.map(ing),
    boxes: [],
    densityCheck,
    uses: uses.map((preparationId) => ({ preparationId, servings: 1, kept: "fridge" })),
  } as unknown as GeneratedMeal["dishes"][number];
}
function pot(id: string, ingredients: string[]) {
  return {
    id,
    title: id,
    servingsMade: 2,
    method: "",
    ingredients: ingredients.map(ing),
  } as unknown as GeneratedMeal["preparations"][number];
}
function meal(
  dishes: unknown[],
  preparations: unknown[],
  shopping: { term: string; quantity: string }[] = [],
): GeneratedMeal {
  return {
    dishes,
    preparations,
    cooking_sessions: [],
    shopping_list: shopping,
    empty_slots: [],
  } as unknown as GeneratedMeal;
}

// ═══════════════════════════════════════════════════════════════════════════
// ① LE TITRE NE VOYAGE PAS SANS SES CASSEROLES
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ LOT E ① — UNE RÉPARATION QUI INTERVERTIT MIDI ET SOIR EST REFUSÉE", () => {
  // ══════════════════════════════════════════════════════════════════════
  // LE CAS RÉEL, REJOUÉ. GAIN `a18f522e`, premier appel de réparation.
  // ══════════════════════════════════════════════════════════════════════
  //
  // La base: midi tire les lentilles + le couscous, soir tire le saumon + le
  // couscous. La relance rend les DEUX cases, échangées — chaque titre avec les
  // casseroles de l'autre case. Ce qui a été ÉCRIT en base avant ce lot:
  // « Saumon avec couscous, légumes rôtis et amandes » sur
  // `prep_lentil_ratatouille` — **aucun saumon**.
  const base = meal(
    [
      dish("lunch", "Lentilles, couscous, feta", ["feta"], ["prep_lentil_ratatouille", "prep_couscous"]),
      dish("dinner", "Saumon, couscous, légumes rôtis", ["amandes"], ["prep_salmon", "prep_couscous"]),
    ],
    [
      pot("prep_lentil_ratatouille", ["lentilles"]),
      pot("prep_salmon", ["saumon"]),
      pot("prep_couscous", ["couscous"]),
    ],
  );
  const retry = meal(
    [
      // ⚠️ MÊME CASE (`sat/lunch`), MÊME PORTEUR (`null`) — donc apparié par
      // l'ancienne règle. Mais il puise le SAUMON.
      dish("lunch", "Saumon avec couscous, légumes rôtis et amandes", ["amandes"], ["prep_salmon", "prep_couscous"]),
      dish("dinner", "Lentilles, couscous, feta, amandes et pain", ["feta", "pain"], ["prep_lentil_ratatouille", "prep_couscous"]),
    ],
    [
      pot("prep_lentil_ratatouille", ["lentilles"]),
      pot("prep_salmon", ["saumon"]),
      pot("prep_couscous", ["couscous"]),
    ],
  );

  const r = spliceReworkableUnits({
    base,
    retry,
    asks: [
      { dishIndex: 0, freshReworkable: true, reworkablePotIds: [] },
      { dishIndex: 1, freshReworkable: true, reworkablePotIds: [] },
    ],
  });

  // ⛔ LES DEUX CASES SONT REFUSÉES, ET LE MOTIF EST NOMMÉ.
  assertEquals(r.counts.uses_mismatch, 2);
  assertEquals(r.counts.fresh_spliced, 0);
  assertEquals(r.dishesSpliced, []);

  // ⛔ ET LA COMBINAISON INTERDITE N'EXISTE NULLE PART DANS LE PLAN RENDU:
  // aucun plat ne porte « Saumon » en titre tout en puisant les lentilles.
  for (const d of r.meal.dishes) {
    const puiseLentilles = (d.uses ?? []).some((u) =>
      String(u?.preparationId ?? "") === "prep_lentil_ratatouille"
    );
    const titreSaumon = String(d.title ?? "").toLowerCase().includes("saumon");
    assert(
      !(puiseLentilles && titreSaumon),
      `titre saumon sur les lentilles: ${d.title} → ${JSON.stringify(d.uses)}`,
    );
  }
  // La base est intacte, titre pour titre.
  assertEquals(r.meal.dishes[0].title, "Lentilles, couscous, feta");
  assertEquals(r.meal.dishes[1].title, "Saumon, couscous, légumes rôtis");
});

Deno.test("LOT E ① bis — le MÊME ensemble de casseroles reste épissable", () => {
  // ⛔ LA CONTRE-ÉPREUVE. Sans elle, une garde qui refuse TOUT ressemble
  // exactement à une garde qui marche — cicatrice `guards-need-a-passing-case`.
  const base = meal(
    [dish("lunch", "Lentilles et couscous", ["feta"], ["prep_lentils", "prep_couscous"])],
    [pot("prep_lentils", ["lentilles"]), pot("prep_couscous", ["couscous"])],
  );
  const retry = meal(
    // Même case, MÊMES `uses`, frais réécrit: c'est très exactement ce que la
    // relance de densité demande.
    [dish("lunch", "Lentilles et couscous, plus dense", ["feta", "huile"], ["prep_couscous", "prep_lentils"])],
    [pot("prep_lentils", ["lentilles"]), pot("prep_couscous", ["couscous"])],
  );
  const r = spliceReworkableUnits({
    base,
    retry,
    asks: [{ dishIndex: 0, freshReworkable: true, reworkablePotIds: [] }],
  });
  assertEquals(r.counts.uses_mismatch, 0);
  assertEquals(r.counts.fresh_spliced, 1);
  assertEquals(r.meal.dishes[0].title, "Lentilles et couscous, plus dense");
  // ⚠️ L'ORDRE DES `uses` NE COMPTE PAS: c'est un ENSEMBLE. La relance les a
  // rendus dans l'autre ordre et la case passe quand même.
  assertEquals(r.meal.dishes[0].ingredients.map((i) => i.term), ["feta", "huile"]);
});

// ═══════════════════════════════════════════════════════════════════════════
// ② `density_check` MEURT AVEC LA RECETTE QU'IL DÉCRIT
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ LOT E ② — UNE CASSEROLE RÉÉCRITE INVALIDE LE `density_check` DE TOUS SES PLATS", () => {
  // ⛔ LE DÉFAUT: « la fusion ne met pas à jour `densityCheck`. Une déclaration
  // du premier jet reste attachée à une recette remaniée: comparer ce champ
  // final à la mesure finale n'évalue pas la dernière réponse du modèle »
  // (enquête §3). Et ce n'est pas seulement la case demandée: une casserole
  // partagée est tirée par plusieurs assiettes.
  const base = meal(
    [
      dish("lunch", "Couscous A", ["feta"], ["prep_couscous"], 141),
      dish("dinner", "Couscous B", ["pain"], ["prep_couscous"], 159),
      // ⚠️ CELUI-CI NE TIRE RIEN DE RÉÉCRIT: sa déclaration doit SURVIVRE.
      dish("breakfast", "Yaourt et fruits", ["yaourt"], [], 92),
    ],
    [pot("prep_couscous", ["couscous"])],
  );
  const retry = meal(
    [dish("lunch", "Couscous A", ["feta"], ["prep_couscous"], 150)],
    [pot("prep_couscous", ["couscous", "huile"])],
  );
  const r = spliceReworkableUnits({
    base,
    retry,
    asks: [{ dishIndex: 0, freshReworkable: false, reworkablePotIds: ["prep_couscous"] }],
  });
  assertEquals(r.counts.pots_spliced, 1);
  // Les deux plats qui tirent la casserole réécrite perdent leur déclaration.
  assertEquals(r.meal.dishes[0].densityCheck, null);
  assertEquals(r.meal.dishes[1].densityCheck, null);
  // Le troisième, qui ne la tire pas, garde la sienne.
  assertEquals(r.meal.dishes[2].densityCheck, 92);
  assertEquals(r.counts.density_checks_cleared, 2);
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ UNE AMÉLIORATION QUANTIFIÉE SE GARDE, MÊME À COMPTE ÉGAL
// ═══════════════════════════════════════════════════════════════════════════

function defaut(over: Partial<RepairDefect> = {}): RepairDefect {
  return {
    kind: "sizing",
    day: "mon",
    slot: "lunch",
    dish: "Poulet quinoa",
    memberId: null,
    detail: "la densité est sous son plancher",
    repairable: true,
    magnitude: null,
    ...over,
  };
}
function refus(over: Partial<GateRefusal> = {}): GateRefusal {
  return {
    cause: "member_exclusion_served",
    severity: "refuse",
    day: "mon",
    slot: "lunch",
    dish: "Poulet quinoa",
    preparation_id: null,
    member_id: null,
    term: "arachide",
    ...over,
  } as GateRefusal;
}

Deno.test("⛔ LOT E ③ — TROIS DÉFAUTS IMPORTANTS DEVENUS TROIS DÉFAUTS PLUS FAIBLES SE GARDENT", () => {
  // ══════════════════════════════════════════════════════════════════════
  // LE CAS RÉEL, CHIFFRÉ. PERTE, premier rattrapage.
  // ══════════════════════════════════════════════════════════════════════
  //
  // · poulet/quinoa/yaourt : 105,4 → 118,4 pour un minimum de 123 ⇒ 17,6 → 4,6
  // · feta/roquette        : 119,9 → 133,6 pour un minimum de 141 ⇒ 21,1 → 7,4
  // · tomate/pain          : 125,5 → 138,1 pour un minimum de 141 ⇒ 15,5 → 2,9
  //
  // Trois défauts avant, trois après: l'ancienne règle rendait `no_improvement`
  // et la version était JETÉE — après avoir payé un appel modèle de 65 à 114 s.
  const avant = [
    defaut({ slot: "lunch", magnitude: 17.6 }),
    defaut({ slot: "dinner", magnitude: 21.1 }),
    defaut({ day: "tue", slot: "dinner", magnitude: 15.5 }),
  ];
  const apres = [
    defaut({ slot: "lunch", magnitude: 4.6 }),
    defaut({ slot: "dinner", magnitude: 7.4 }),
    defaut({ day: "tue", slot: "dinner", magnitude: 2.9 }),
  ];
  const v = judgeCandidate({
    beforeRefusals: [],
    afterRefusals: [],
    beforeDefects: avant,
    afterDefects: apres,
  });
  assertEquals(v.verdict, "adopt");
  assertEquals(v.magnitude.comparable, true);
  assertEquals(Math.round((v.magnitude.before ?? 0) * 10) / 10, 54.2);
  assertEquals(Math.round((v.magnitude.after ?? 0) * 10) / 10, 14.9);
});

Deno.test("⛔ LOT E ③ — UN GAIN SOUS LE SEUIL NE REMPLACE PAS UNE VERSION RELUE", () => {
  // ⛔ LA CONTRE-ÉPREUVE DU SEUIL. Sans elle, `REPAIR_MAGNITUDE_MIN_GAIN`
  // pourrait valoir zéro sans que rien ne rougisse.
  const avant = [defaut({ magnitude: 100 })];
  const apres = [defaut({ magnitude: 100 - 100 * REPAIR_MAGNITUDE_MIN_GAIN / 2 })];
  const v = judgeCandidate({
    beforeRefusals: [],
    afterRefusals: [],
    beforeDefects: avant,
    afterDefects: apres,
  });
  assertEquals(v.verdict, "no_improvement");
  assertEquals(v.magnitude.comparable, true);
});

Deno.test("⛔ LOT E ③ — L'AMPLEUR NE RACHÈTE JAMAIS UNE RÉGRESSION DE SÉCURITÉ", () => {
  // ⛔ LA GARDE QUI PASSE AVANT TOUT. Une candidate qui divise l'écart par dix
  // et met un allergène dans une assiette est REFUSÉE.
  const v = judgeCandidate({
    beforeRefusals: [],
    afterRefusals: [refus()],
    beforeDefects: [defaut({ magnitude: 100 })],
    afterDefects: [defaut({ magnitude: 1 })],
  });
  assertEquals(v.verdict, "safety_regression");
});

Deno.test("⛔ LOT E ③ — TROIS ÉCARTS DE DENSITÉ DEVENUS TROIS ALLERGÈNES NE SONT PAS « PLUS FAIBLES »", () => {
  // Une nature PLUS GRAVE qui devient plus nombreuse n'est pas une amélioration,
  // quelle que soit l'ampleur. `REPAIR_DEFECT_KINDS` est ordonnée du plus grave
  // au moins grave, et c'est cet ordre-là qui décide.
  const avant = [
    defaut({ kind: "sizing", slot: "lunch", magnitude: 50 }),
    defaut({ kind: "sizing", slot: "dinner", magnitude: 50 }),
  ];
  const apres = [
    defaut({ kind: "safety", slot: "lunch", magnitude: 1 }),
    defaut({ kind: "safety", slot: "dinner", magnitude: 1 }),
  ];
  const v = judgeCandidate({
    beforeRefusals: [],
    afterRefusals: [],
    beforeDefects: avant,
    afterDefects: apres,
  });
  assertEquals(v.verdict, "no_improvement");
});

Deno.test("LOT E ③ — sans magnitude, la décision reste celle d'avant: le COMPTE", () => {
  // ⚠️ LE COMPORTEMENT D'AVANT CE LOT, CONSERVÉ AU CARACTÈRE PRÈS quand on ne
  // sait pas chiffrer. On ne devine pas une ampleur.
  const v = judgeCandidate({
    beforeRefusals: [],
    afterRefusals: [],
    beforeDefects: [defaut(), defaut({ slot: "dinner" })],
    afterDefects: [defaut(), defaut({ slot: "dinner" })],
  });
  assertEquals(v.verdict, "no_improvement");
  assertEquals(v.magnitude.comparable, false);
  assertEquals(v.magnitude.note, "magnitude_unknown");
});

Deno.test("LOT E ③ — deux jeux de défauts qui ne parlent pas des mêmes cases sont INCOMPARABLES", () => {
  const c = magnitudeComparison(
    [defaut({ slot: "lunch", magnitude: 20 })],
    [defaut({ slot: "dinner", magnitude: 2 })],
  );
  assertEquals(c.comparable, false);
  assertEquals(c.note, "cells_differ");
});

Deno.test("LOT E ③ — un compte qui GROSSIT n'est jamais une amélioration", () => {
  const v = judgeCandidate({
    beforeRefusals: [],
    afterRefusals: [],
    beforeDefects: [defaut({ magnitude: 100 })],
    afterDefects: [defaut({ magnitude: 1 }), defaut({ slot: "dinner", magnitude: 1 })],
  });
  assertEquals(v.verdict, "no_improvement");
  assertEquals(v.magnitude.comparable, false);
  assertEquals(v.magnitude.note, "count_differs");
});
