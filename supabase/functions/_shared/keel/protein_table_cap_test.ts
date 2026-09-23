/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-20 — LE PLAFOND PROTÉIQUE, ET LA BORNE DE LA TABLE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Le décor est le plan `911994f7` (3 bouches, 6 jours), relu dans sa base:
 *
 *   · Thomas, 72 kg / 187 cm / 28 ans, prise de masse, 3 386 kcal/jour sur
 *     cinq moments; plancher 1,6 × 72 = 115 g, plafond 2,0 × 72 = 144 g.
 *   · Fabrice, 93 kg / 173 cm / 59 ans, perte, 2 192 kcal sur trois moments;
 *     plancher 1,2 × 89,8 (IMC 30) = 108 g, plafond 2,0 × 89,8 = 180 g.
 *     ⟳ 2026-09-23 — sans compte, il recevait le plancher du MAINTIEN (1,2)
 *     par accident; il reçoit désormais celui de SA perte, qui vaut aussi 1,2
 *     depuis la décision du jour (1,4 avant): 108 g dans les deux lectures.
 *   · Christèle, 58 kg / 169 cm / 55 ans, maintien, 1 981 kcal sur trois
 *     moments; plancher 70 g, plafond 116 g.
 *
 * Avant ce lot, Fabrice réclamait 36 / 58 / 50 g par plat, le modèle écrivait
 * la recette partagée à ce chiffre, et Thomas l'héritait à 3 386 kcal:
 * 214 g/jour mesurés. Les nombres ci-dessous sont ÉCRITS EN DUR, jamais
 * recalculés par la fonction sous test.
 */
import { assert, assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  PROTEIN_CONSEQUENCE,
  proteinBriefFor,
  sharedProteinCaps,
  proteinFragment,
} from "./plan_protein_brief.ts";
import {
  PROTEIN_CEILING_G_PER_KG,
  PROTEIN_FLOOR_G_PER_KG,
  proteinCeilingGFor,
} from "./meal_envelope.ts";

// ── LES BARÈMES, ÉPINGLÉS ───────────────────────────────────────────────────
// ⟳ 2026-09-23 — perte 1,4 → 1,2, décision du propriétaire (« 1,2 g/kg en
// perte »). La perte et le maintien valent le même nombre et restent deux
// lignes: ce sont deux décisions.
Deno.test("épinglage — PROTEIN_FLOOR_G_PER_KG: 1,2 perte, 1,2 maintien, 1,6 masse", () => {
  assertEquals(PROTEIN_FLOOR_G_PER_KG, {
    fat_loss: 1.2,
    maintenance: 1.2,
    muscle_gain: 1.6,
  });
});

Deno.test("épinglage — PROTEIN_CEILING_G_PER_KG vaut 2,0, au-dessus de tout plancher", () => {
  assertEquals(PROTEIN_CEILING_G_PER_KG, 2.0);
  for (const rate of Object.values(PROTEIN_FLOOR_G_PER_KG)) {
    assert(rate < PROTEIN_CEILING_G_PER_KG, `plancher ${rate} ≥ plafond`);
  }
});

// ── LE PLAFOND D'UNE BOUCHE ─────────────────────────────────────────────────
Deno.test("plafond — les trois corps du plan 911994f7", () => {
  assertEquals(
    proteinCeilingGFor({ weightKg: 72, heightCm: 187, ageYears: 28 }),
    144,
  );
  // 93 kg à 1,73 m: IMC 31, poids de référence 30 × 1,73² = 89,8 kg.
  assertEquals(
    proteinCeilingGFor({ weightKg: 93, heightCm: 173, ageYears: 59 }),
    180,
  );
  assertEquals(
    proteinCeilingGFor({ weightKg: 58, heightCm: 169, ageYears: 55 }),
    116,
  );
});

Deno.test("plafond — sans poids ou sans âge, `null`; à 60 ans le poids n'est plus plafonné", () => {
  assertEquals(proteinCeilingGFor({ weightKg: null, heightCm: 173, ageYears: 59 }), null);
  assertEquals(proteinCeilingGFor({ weightKg: 93, heightCm: 173, ageYears: null }), null);
  // PROT-AGE: le poids de référence des 60 ans et plus est le poids réel.
  assertEquals(proteinCeilingGFor({ weightKg: 93, heightCm: 173, ageYears: 67 }), 186);
});

// ── LA TABLE ────────────────────────────────────────────────────────────────
const jour = (
  dayToken: string,
  dayTargetKcal: number,
  slots: readonly (readonly [string, number])[],
) => ({
  date: `2026-09-2${["mon", "tue", "wed"].indexOf(dayToken) + 1}`,
  dayToken,
  dayTargetKcal,
  coveredBudgetGrossKcal: dayTargetKcal,
  fixedProteinG: null,
  sideProteinG: 0,
  slots: slots.map(([slot, composeKcal]) => ({ slot, composeKcal })),
});

// Cinq moments, poids 0,25 / 0,10 / 0,40 / 0,10 / 0,35 normalisés sur 1,20.
const THOMAS = jour("mon", 3386, [
  ["breakfast", 705],
  ["snack_am", 282],
  ["lunch", 1129],
  ["snack_pm", 282],
  ["dinner", 988],
]);
const FABRICE = jour("mon", 2192, [["breakfast", 548], ["lunch", 877], ["dinner", 767]]);
const CHRISTELE = jour("mon", 1981, [["breakfast", 495], ["lunch", 793], ["dinner", 693]]);

const TABLE = [
  { memberId: "thomas", ceilingG: 144, floorG: null, days: [THOMAS] },
  { memberId: "fabrice", ceilingG: 180, floorG: null, days: [FABRICE] },
  { memberId: "christele", ceilingG: 116, floorG: null, days: [CHRISTELE] },
];

Deno.test("table — la densité de la table est celle de la bouche la plus vite à son plafond", () => {
  // 144 / 3 386 = 42,5 g pour 1 000 kcal: Thomas borne la table, pas Fabrice
  // (82) ni Christèle (58,6). Les bornes de Fabrice, à SON énergie de case:
  // 548 × 0,04253 = 23,3 → 23; 877 → 37; 767 → 32.
  const caps = sharedProteinCaps(TABLE);
  assertEquals(caps.cells, 5, "cinq cases distinctes sur la journée");
  assertEquals(caps.shared, 3, "les deux goûters de Thomas ne sont pas partagés");
  assertEquals(caps.constrained, 3);
  const fabrice = caps.byMember.get("fabrice")!;
  assertEquals(fabrice.get("mon|breakfast"), 23);
  assertEquals(fabrice.get("mon|lunch"), 37);
  assertEquals(fabrice.get("mon|dinner"), 32);
  // Thomas reçoit sa propre part de plafond: 705 × 0,04253 = 29,98 → 29.
  assertEquals(caps.byMember.get("thomas")!.get("mon|breakfast"), 29);
  assertEquals(caps.byMember.get("thomas")!.get("mon|snack_am"), undefined, "seul à sa case");
});

Deno.test("table — la borne mord sur la carte de Fabrice, pas sur les deux autres, et se compte", () => {
  const caps = sharedProteinCaps(TABLE);
  const fabrice = proteinBriefFor({
    memberId: "fabrice",
    dayFloorG: 108,
    perMealFloorG: null,
    abstention: "none",
    days: [FABRICE],
    slotCapG: caps.byMember.get("fabrice"),
  });
  // Sans borne: 108 × 548/2192 = 27, × 877/2192 = 43, × 767/2192 = 38.
  const grammes = Object.fromEntries(fabrice.slots.map((s) => [s.slot, s.gramsPerServing]));
  assertEquals(grammes, { breakfast: 23, lunch: 37, dinner: 32 });
  assertEquals(fabrice.capped, { slots: 3, gramsRemoved: 16 });

  const christele = proteinBriefFor({
    memberId: "christele",
    dayFloorG: 70,
    perMealFloorG: null,
    abstention: "none",
    days: [CHRISTELE],
    slotCapG: caps.byMember.get("christele"),
  });
  assertEquals(
    Object.fromEntries(christele.slots.map((s) => [s.slot, s.gramsPerServing])),
    { breakfast: 17, lunch: 28, dinner: 24 },
  );
  assertEquals(christele.capped, { slots: 0, gramsRemoved: 0 });

  const thomas = proteinBriefFor({
    memberId: "thomas",
    dayFloorG: 115,
    perMealFloorG: 38,
    abstention: "none",
    days: [THOMAS],
    slotCapG: caps.byMember.get("thomas"),
  });
  assertEquals(thomas.capped, { slots: 0, gramsRemoved: 0 });
  assertEquals(thomas.perMealFloorG, 38, "le minimum par repas ne bouge pas");
});

Deno.test("table — le chiffre le plus haut à table ne dépasse plus le plafond de personne", () => {
  // ⛔ LA PROPRIÉTÉ QUE LE LOT FERME: la recette écrite au plus haut chiffre
  // d'une case, héritée à l'énergie de chaque bouche, reste sous le plafond
  // de chacune. Avant: 36 g à 548 kcal hérités à 3 386 kcal = 222 g/jour.
  const caps = sharedProteinCaps(TABLE);
  const briefs = {
    thomas: proteinBriefFor({ memberId: "thomas", dayFloorG: 115, perMealFloorG: 38, abstention: "none", days: [THOMAS], slotCapG: caps.byMember.get("thomas") }),
    fabrice: proteinBriefFor({ memberId: "fabrice", dayFloorG: 108, perMealFloorG: null, abstention: "none", days: [FABRICE], slotCapG: caps.byMember.get("fabrice") }),
    christele: proteinBriefFor({ memberId: "christele", dayFloorG: 70, perMealFloorG: null, abstention: "none", days: [CHRISTELE], slotCapG: caps.byMember.get("christele") }),
  };
  const kcalOf = { thomas: THOMAS, fabrice: FABRICE, christele: CHRISTELE };
  const ceilingOf = { thomas: 144, fabrice: 180, christele: 116 };
  for (const slot of ["breakfast", "lunch", "dinner"]) {
    // La densité la plus haute réclamée à cette case, en g par kcal.
    let densite = 0;
    for (const [id, brief] of Object.entries(briefs)) {
      const ask = brief.slots.find((s) => s.slot === slot)!.gramsPerServing;
      const kcal = kcalOf[id as keyof typeof kcalOf].slots.find((s) => s.slot === slot)!.composeKcal;
      densite = Math.max(densite, ask / kcal);
    }
    for (const [id, day] of Object.entries(kcalOf)) {
      const herite = densite * day.dayTargetKcal;
      assert(
        herite <= ceilingOf[id as keyof typeof ceilingOf] + 1,
        `${slot}: ${id} hériterait ${herite.toFixed(0)} g/jour`,
      );
    }
  }
});

Deno.test("table — une bouche sans plafond ne borne personne, mais reste bornée par les autres", () => {
  const caps = sharedProteinCaps([
    { memberId: "thomas", ceilingG: null, floorG: null, days: [THOMAS] },
    { memberId: "fabrice", ceilingG: 180, floorG: null, days: [FABRICE] },
    { memberId: "christele", ceilingG: 116, floorG: null, days: [CHRISTELE] },
  ]);
  // Sans Thomas, c'est Christèle (58,6 g / 1 000 kcal) qui borne: 548 × 0,05856 = 32.
  assertEquals(caps.byMember.get("fabrice")!.get("mon|breakfast"), 32);
  // Thomas ne borne personne, mais sa carte partage la recette: 705 × 0,05856 = 41.
  assertEquals(caps.byMember.get("thomas")!.get("mon|breakfast"), 41);
});

Deno.test("table — seule à sa case, une bouche garde sa demande entière", () => {
  const caps = sharedProteinCaps([{ memberId: "fabrice", ceilingG: 180, floorG: null, days: [FABRICE] }]);
  assertEquals(caps.shared, 0);
  assertEquals(caps.constrained, 0);
  const brief = proteinBriefFor({
    memberId: "fabrice",
    dayFloorG: 108,
    perMealFloorG: null,
    abstention: "none",
    days: [FABRICE],
    slotCapG: caps.byMember.get("fabrice"),
  });
  assertEquals(brief.slots.reduce((n, s) => n + s.gramsPerServing, 0), 108);
  assertEquals(brief.capped, { slots: 0, gramsRemoved: 0 });
});

Deno.test("table — une énergie de case illisible retire la bouche des deux côtés", () => {
  const caps = sharedProteinCaps([
    { memberId: "thomas", ceilingG: 144, floorG: null, days: [{ ...THOMAS, slots: [{ slot: "breakfast", composeKcal: null }, ...THOMAS.slots.slice(1)] }] },
    { memberId: "fabrice", ceilingG: 180, floorG: null, days: [FABRICE] },
    { memberId: "christele", ceilingG: 116, floorG: null, days: [CHRISTELE] },
  ]);
  // Thomas ne borne plus: sa journée n'a pas d'énergie lisible.
  assertEquals(caps.byMember.get("fabrice")!.get("mon|breakfast"), 32);
  assertEquals(caps.byMember.get("thomas")?.get("mon|breakfast"), undefined);
});

Deno.test("consigne — la troisième échappatoire est nommée au modèle", () => {
  const texte = PROTEIN_CONSEQUENCE.join(" ");
  assert(texte.includes("Reach the figure, then stop."));
  assert(texte.includes("overshoots"));
});


// ── ⟳ 2026-09-21 — LE PLANCHER GAGNE SUR LE PLAFOND ─────────────────────────
// Les vrais planchers du plan `3e121b21`: Thomas 115 (1,6 × 72), Fabrice 108
// (1,2 × 89,8 de référence, IMC 30 — ⟳ 2026-09-23: l'ancienne note disait
// « 1,4 × 77 », faux sur les deux facteurs), Christèle 70 (1,2 × 58). La densité-plancher de
// Fabrice (108 / 2 192 = 49,3 g pour 1 000 kcal) dépasse la densité-plafond
// de Thomas (144 / 3 386 = 42,5): sans ce lot, la table était bornée SOUS le
// plancher de Fabrice, sa carte disait « 37 g, not more » et il mangeait à
// 1,1 g/kg. Les nombres ci-dessous sont écrits en dur.
const TABLE_AVEC_PLANCHERS = [
  { memberId: "thomas", ceilingG: 144, floorG: 115, days: [THOMAS] },
  { memberId: "fabrice", ceilingG: 180, floorG: 108, days: [FABRICE] },
  { memberId: "christele", ceilingG: 116, floorG: 70, days: [CHRISTELE] },
];

Deno.test("plancher gagne — la densité de la table est celle du plancher de Fabrice, et ça se compte", () => {
  const caps = sharedProteinCaps(TABLE_AVEC_PLANCHERS);
  assertEquals(caps.shared, 3);
  assertEquals(caps.constrained, 3);
  assertEquals(caps.floorWins, 3, "les trois cases partagées croisent plancher et plafond");
  assertEquals([...caps.floorCells].sort(), ["mon|breakfast", "mon|dinner", "mon|lunch"]);
  // 49,27 g / 1 000 kcal, arrondi vers le haut à l'énergie de chaque case.
  const fabrice = caps.byMember.get("fabrice")!;
  assertEquals(fabrice.get("mon|breakfast"), 27);
  assertEquals(fabrice.get("mon|lunch"), 44);
  assertEquals(fabrice.get("mon|dinner"), 38);
  const thomas = caps.byMember.get("thomas")!;
  assertEquals(thomas.get("mon|breakfast"), 35);
  assertEquals(thomas.get("mon|lunch"), 56);
  assertEquals(thomas.get("mon|dinner"), 49);
  assertEquals(thomas.get("mon|snack_am"), undefined, "seul à sa case: pas de borne de table");
  const christele = caps.byMember.get("christele")!;
  assertEquals(christele.get("mon|lunch"), 40);
});

Deno.test("plancher gagne — Fabrice n'est plus borné sous son plancher; le plafond de Thomas cède, et ça se compte", () => {
  const caps = sharedProteinCaps(TABLE_AVEC_PLANCHERS);
  const fabrice = proteinBriefFor({
    memberId: "fabrice",
    dayFloorG: 108,
    perMealFloorG: null,
    abstention: "none",
    days: [FABRICE],
    slotCapG: caps.byMember.get("fabrice"),
    tableFloorCells: caps.floorCells,
    dayCeilingG: 180,
  });
  assertEquals(fabrice.capped, { slots: 0, gramsRemoved: 0 }, "son plancher passe entier");
  assertEquals(fabrice.ceilingYielded, { slots: 0, grams: 0 });
  const dej = fabrice.slots.find((s) => s.slot === "lunch")!;
  assertEquals(dej.gramsPerServing, 43);
  assertEquals(dej.gramsMax, 44);
  assertEquals(dej.kcalPerServing, 875);
  assert(proteinFragment(fabrice).includes("43 to 44 g per 875 kcal in the lunch dish"), proteinFragment(fabrice));

  const thomas = proteinBriefFor({
    memberId: "thomas",
    dayFloorG: 115,
    perMealFloorG: 38,
    abstention: "none",
    days: [THOMAS],
    slotCapG: caps.byMember.get("thomas"),
    tableFloorCells: caps.floorCells,
    dayCeilingG: 144,
  });
  // Sa borne haute suit la table sur les trois cases partagées: 35, 56, 49 —
  // au-dessus de son propre plafond réparti (30, 48, 42): 5 + 8 + 7 = 20 g.
  assertEquals(thomas.ceilingYielded, { slots: 3, grams: 20 });
  assertEquals(thomas.capped, { slots: 0, gramsRemoved: 0 });
  const dejT = thomas.slots.find((s) => s.slot === "lunch")!;
  assertEquals(dejT.gramsPerServing, 38);
  assertEquals(dejT.gramsMax, 56);
  // Ses collations, seules, gardent son propre plafond réparti: 12 g pour 282 kcal.
  const am = thomas.slots.find((s) => s.slot === "snack_am")!;
  assertEquals(am.gramsPerServing, 10);
  assertEquals(am.gramsMax, 12);

  const christele = proteinBriefFor({
    memberId: "christele",
    dayFloorG: 70,
    perMealFloorG: null,
    abstention: "none",
    days: [CHRISTELE],
    slotCapG: caps.byMember.get("christele"),
    tableFloorCells: caps.floorCells,
    dayCeilingG: 116,
  });
  const dejC = christele.slots.find((s) => s.slot === "lunch")!;
  assertEquals(dejC.gramsPerServing, 28);
  assertEquals(dejC.gramsMax, 40, "la table (40) reste sous son propre plafond (46)");
  assertEquals(christele.ceilingYielded, { slots: 0, grams: 0 });
});

Deno.test("plancher gagne — LE CAS QUI PASSE: sans plancher lisible, rien ne change", () => {
  const sans = sharedProteinCaps(TABLE);
  assertEquals(sans.floorWins, 0);
  assertEquals(sans.floorCells.size, 0);
  assertEquals(sans.byMember.get("fabrice")!.get("mon|lunch"), 37, "la borne d'avant, au gramme");
});
