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

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-25 — LA JOURNÉE PARTIELLE, LE PLAT À SOI, ET LE BAS SOUS LE HAUT
// ═══════════════════════════════════════════════════════════════════════════
// Banc des trois foyers, plan B: Inès absente mercredi soir portait tout son
// plafond du jour sur ses deux repas (7,50 g pour 100 kcal au lieu de 4,8), et
// sur la case partagée le bas de Karim passait au-dessus de son haut à elle.

Deno.test("⟳ 2026-09-25 — journée partielle: le plafond du jour se proratise avant d'être divisé", () => {
  // Inès: plafond 120 g, présente seulement au petit-déjeuner et au déjeuner
  // (1 000 kcal composés, 50 % de son jour). Karim: plafond 300 g sur 3 400.
  const ines = {
    memberId: "ines",
    ceilingG: 120,
    floorG: null,
    days: [{
      dayToken: "wed",
      coveredFraction: 0.5,
      slots: [{ slot: "breakfast", composeKcal: 400 }, { slot: "lunch", composeKcal: 600 }],
    }],
  };
  const karim = {
    memberId: "karim",
    ceilingG: 300,
    floorG: null,
    days: [{
      dayToken: "wed",
      coveredFraction: 1,
      slots: [
        { slot: "breakfast", composeKcal: 900 },
        { slot: "lunch", composeKcal: 1300 },
        { slot: "dinner", composeKcal: 1200 },
      ],
    }],
  };
  // Proratisé: 120 × 0,5 / 1 000 = 6,0 g pour 100 kcal, sous Karim (8,82):
  // Inès borne la table, 600 × 0,06 = 36 g au déjeuner.
  assertEquals(sharedProteinCaps([ines, karim]).byMember.get("ines")!.get("wed|lunch"), 36);
  // La règle d'avant divisait tout le plafond par deux repas (12,0): Karim
  // bornait, 600 × 0,0882 = 52 g — la moitié de trop pour elle.
  const avant = sharedProteinCaps([
    { ...ines, days: [{ ...ines.days[0], coveredFraction: undefined }] },
    karim,
  ]);
  assertEquals(avant.byMember.get("ines")!.get("wed|lunch"), 52);
  // Une part illisible: Inès ne borne personne ce jour-là.
  const illisible = sharedProteinCaps([
    { ...ines, days: [{ ...ines.days[0], coveredFraction: null }] },
    karim,
  ]);
  assertEquals(illisible.byMember.get("ines")!.get("wed|lunch"), 52);
});

Deno.test("⟳ 2026-09-25 — journée partielle: un plancher proratisé ne gagne plus à tort", () => {
  // Inès en prise: plancher 100 g sur le jour, présente à 50 %. Sans prorata,
  // 100 / 1 000 = 10 g pour 100 kcal gagnait sur le plafond de Karim (5,88).
  const ines = {
    memberId: "ines",
    ceilingG: null,
    floorG: 100,
    days: [{
      dayToken: "wed",
      coveredFraction: 0.5,
      slots: [{ slot: "breakfast", composeKcal: 400 }, { slot: "lunch", composeKcal: 600 }],
    }],
  };
  const karim = {
    memberId: "karim",
    ceilingG: 200,
    floorG: null,
    days: [{
      dayToken: "wed",
      coveredFraction: 1,
      slots: [
        { slot: "breakfast", composeKcal: 900 },
        { slot: "lunch", composeKcal: 1300 },
        { slot: "dinner", composeKcal: 1200 },
      ],
    }],
  };
  const avec = sharedProteinCaps([ines, karim]);
  assertEquals(avec.floorWins, 0, "5 g pour 100 kcal proratisés ne dépassent pas 5,88");
  const sans = sharedProteinCaps([
    { ...ines, days: [{ ...ines.days[0], coveredFraction: undefined }] },
    karim,
  ]);
  assertEquals(sans.floorWins, 2, "la règle d'avant: le plancher entier sur deux repas gagnait");
});

Deno.test("⟳ 2026-09-25 — le plat à soi ne partage pas la recette de la table", () => {
  const caps = sharedProteinCaps([
    { ...TABLE[0], ownDishCells: new Set(["mon|breakfast"]) },
    TABLE[1],
    TABLE[2],
  ]);
  // Thomas mange son plat à lui au petit-déjeuner: il ne borne plus Fabrice
  // ni Christèle à cette case (Christèle, 116 / 1 981 = 58,6 g/1 000 kcal, la
  // borne désormais: 548 × 0,05856 = 32,09 → 32).
  assertEquals(caps.byMember.get("fabrice")!.get("mon|breakfast"), 32);
  assertEquals(caps.byMember.get("thomas")!.get("mon|breakfast"), undefined, "sa case n'est plus partagée");
});

Deno.test("⟳ 2026-09-25 — aucune demande de protéines sur ce qu'une bouche a déclaré manger", () => {
  const brief = proteinBriefFor({
    memberId: "christele",
    dayFloorG: 70,
    perMealFloorG: null,
    abstention: "none",
    days: [CHRISTELE],
    ownDishCells: new Set(["mon|breakfast"]),
  });
  const grammes = Object.fromEntries(brief.slots.map((s) => [s.slot, s.gramsPerServing]));
  // Le petit-déjeuner garde sa part du jour (non reversée): 70 × 793/1981 = 28,
  // 70 × 693/1981 = 24.
  assertEquals(grammes, { lunch: 28, dinner: 24 });
});

Deno.test("⟳ 2026-09-25 — sur une case partagée, aucun bas de convive au-dessus du haut d'un autre", () => {
  // La propriété du plan B, sur un décor à deux: Karim (prise, plancher 150 g,
  // plafond 180 g, 3 000 kcal) et Inès (perte, plafond 110 g, 1 600 kcal,
  // absente au dîner: 62,5 % du jour).
  const karimDay = {
    date: "2026-09-30",
    dayToken: "wed",
    dayTargetKcal: 3000,
    coveredBudgetGrossKcal: 3000,
    fixedProteinG: null,
    sideProteinG: 0,
    slots: [
      { slot: "breakfast", composeKcal: 750 },
      { slot: "lunch", composeKcal: 1200 },
      { slot: "dinner", composeKcal: 1050 },
    ],
  };
  const inesDay = {
    date: "2026-09-30",
    dayToken: "wed",
    dayTargetKcal: 1600,
    coveredBudgetGrossKcal: 1000,
    fixedProteinG: null,
    sideProteinG: 0,
    slots: [{ slot: "breakfast", composeKcal: 400 }, { slot: "lunch", composeKcal: 600 }],
  };
  const frac = (d: typeof karimDay) => Math.min(1, d.coveredBudgetGrossKcal / d.dayTargetKcal);
  const caps = sharedProteinCaps([
    {
      memberId: "karim",
      ceilingG: 180,
      floorG: 150,
      days: [{ dayToken: "wed", coveredFraction: frac(karimDay), slots: karimDay.slots }],
    },
    {
      memberId: "ines",
      ceilingG: 110,
      floorG: 70,
      days: [{ dayToken: "wed", coveredFraction: frac(inesDay), slots: inesDay.slots }],
    },
  ]);
  const karim = proteinBriefFor({
    memberId: "karim",
    dayFloorG: 150,
    perMealFloorG: 50,
    abstention: "none",
    days: [karimDay],
    slotCapG: caps.byMember.get("karim"),
    tableFloorCells: caps.floorCells,
    dayCeilingG: 180,
  });
  const ines = proteinBriefFor({
    memberId: "ines",
    dayFloorG: 70,
    perMealFloorG: null,
    abstention: "none",
    days: [inesDay],
    slotCapG: caps.byMember.get("ines"),
    tableFloorCells: caps.floorCells,
    dayCeilingG: 110,
  });
  for (const slot of ["breakfast", "lunch"]) {
    const k = karim.slots.find((s) => s.slot === slot)!;
    const i = ines.slots.find((s) => s.slot === slot)!;
    // En densité (g pour 100 kcal): le bas de l'un ne dépasse pas le haut de
    // l'autre, à 1 g d'arrondi près ramené à la part.
    const bas = (a: typeof k) => a.gramsPerServing / a.kcalPerServing;
    const haut = (a: typeof k) => (a.gramsMax ?? Infinity) / a.kcalPerServing;
    assert(bas(k) <= haut(i) + 1 / i.kcalPerServing, `${slot}: Karim ${k.gramsPerServing}/${k.kcalPerServing} > Inès max ${i.gramsMax}/${i.kcalPerServing}`);
    assert(bas(i) <= haut(k) + 1 / k.kcalPerServing, `${slot}: Inès ${i.gramsPerServing}/${i.kcalPerServing} > Karim max ${k.gramsMax}/${k.kcalPerServing}`);
  }
  // Et plus aucun « no main dish under » dans la phrase de Karim.
  assert(!proteinFragment(karim).includes("no main dish under"), proteinFragment(karim));
});
