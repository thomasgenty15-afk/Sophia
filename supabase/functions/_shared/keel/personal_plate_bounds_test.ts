/**
 * ══════════════════════════════════════════════════════════════════════════
 * ⟳ 2026-09-24 — LE PLAFOND D'ASSIETTE PROPRE À CHAQUE ADULTE
 * (« l'assiette suit l'entretien »)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Plan: `~/.claude/plans/lexical-gliding-lamport.md`, étapes 1 et 4.
 *
 *     plafond  = 25 % de l'ENTRETIEN × appétit, entre 400 et 550 g
 *     plancher = la moitié du plafond, entre 220 et 250 g
 *
 * Le défaut qu'il ferme: le plafond d'un repas adulte valait 550 g pour tout
 * le monde, donc l'à-côté ne grossissait qu'au-dessus de 550 × 1,15 = 632,5
 * kcal de plat — jamais pour Christèle (entretien 1 920, plat de 658 kcal).
 *
 * ⛔ NOMBRES EN DUR, jamais recalculés depuis une constante du module.
 * ⛔ CHAQUE RÈGLE A UN CAS QUI MORD ET UN CAS QUI PASSE.
 */
import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import {
  dayTargetFor,
  hardCeilingBoundsFor,
  PERSONAL_PLATE_MAX_G_PER_KCAL,
  PERSONAL_PLATE_MAX_HIGHEST_G,
  PERSONAL_PLATE_MAX_LOWEST_G,
  PERSONAL_PLATE_MIN_HIGHEST_G,
  PERSONAL_PLATE_MIN_LOWEST_G,
  PERSONAL_PLATE_MIN_SHARE_OF_MAX,
  PLATE_BOUND_SOURCES,
  personalPlateBoundsFor,
  plateBoundsFor,
} from "./portion_sizing.ts";
import { type AnchorMouth, maintenanceKcalOf } from "./mouth_anchor.ts";
import { type ContractDay, slotContractsFor } from "./slot_nutrition_contract.ts";
import { sideBudgetFor } from "./side_course_budget.ts";
import type { SideCourseSlot, SideCourseSlotInput } from "./side_courses_types.ts";

// ═══════════════════════════════════════════════════════════════════════════
// LES FIXTURES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Christèle: 58 kg, 169 cm, 55 ans, assise + 3-4 séances, en maintien.
 * Mifflin: 10 × 58 + 6,25 × 169 − 5 × 55 − 161 = 1 200,25; bord bas des
 * séances (maintien) 1,60 ⇒ 1 920,4 ⇒ **1 920 kcal**.
 */
const CHRISTELE = {
  heightCm: 169,
  weightKg: 58,
  gender: "female" as const,
  ageYears: 55,
  activityLevel: null,
  activityAxes: { day: "seated" as const, sport: "3_4" as const, asked: true },
  appetite: null,
};

function christele(over: Partial<AnchorMouth> = {}): AnchorMouth {
  return {
    memberId: "m-chris",
    ageState: "adult",
    restriction: "clear",
    body: CHRISTELE,
    direction: null,
    paceKgPerWeek: null,
    declaredSlots: ["breakfast", "lunch", "dinner"],
    conditionRefs: [],
    portionIndex: null,
    ...over,
  } as AnchorMouth;
}

/** Son plafond personnel, en dur: 25 % × 1 920 = 480 g; plancher 240 g. */
const CHRISTELE_PLATE = { maxG: 480, minG: 240 };

/** Maintien: le fromage de base (110), le pain en croissance. */
const FROMAGE: SideCourseSlotInput = {
  courses: [{ kind: "cheese", baseKcal: 110 }],
  growKinds: ["cheese", "bread"],
  refused: false,
  capShare: 0.35,
  light: false,
};

function vendredi(sides: ContractDay["sides"]): ContractDay {
  return {
    dayToken: "fri",
    date: "2026-09-25",
    coveredSlots: ["breakfast", "lunch", "dinner"],
    lockedSlots: [],
    fixedKcalBySlot: null,
    sides,
    emptySlots: [],
  };
}

function contratsDeChristele(ageYears: number | null, mouth = christele()) {
  return slotContractsFor({
    mouth,
    coachCounting: "no_position",
    rhythmSlots: ["breakfast", "lunch", "dinner"],
    days: [vendredi(new Map<SideCourseSlot, SideCourseSlotInput>([["lunch", FROMAGE]]))],
    lightSlots: [],
    ageYears,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ① LES CONSTANTES
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⟳ 2026-09-24 — les six nombres du plafond personnel, épinglés", () => {
  assertEquals(PERSONAL_PLATE_MAX_G_PER_KCAL, 0.25);
  assertEquals(PERSONAL_PLATE_MAX_LOWEST_G, 400);
  assertEquals(PERSONAL_PLATE_MAX_HIGHEST_G, 550);
  assertEquals(PERSONAL_PLATE_MIN_SHARE_OF_MAX, 0.5);
  assertEquals(PERSONAL_PLATE_MIN_LOWEST_G, 220);
  assertEquals(PERSONAL_PLATE_MIN_HIGHEST_G, 250);
  // Le motif `personal` a sa place dans le vocabulaire fermé du compteur.
  assertEquals([...PLATE_BOUND_SOURCES], ["target", "table", "personal", "no_target"]);
});

// ═══════════════════════════════════════════════════════════════════════════
// ② personalPlateBoundsFor
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("personnel — Christèle, entretien 1 920: 480 g de plafond, 240 g de plancher", () => {
  assertEquals(
    personalPlateBoundsFor({ ageYears: 55, maintenanceKcal: 1920, appetite: null }),
    { maxG: 480, minG: 240 },
  );
  // Le fixture rend bien 1 920: le reste du fichier en dépend.
  assertEquals(maintenanceKcalOf(christele()).kcal, 1920);
  assertEquals(dayTargetFor(christele(), "no_position").kcal, 1920);
});

Deno.test("personnel — Thomas, 2 860: 715 g ramené au plafond commun de 550, plancher 250", () => {
  assertEquals(
    personalPlateBoundsFor({ ageYears: 28, maintenanceKcal: 2860, appetite: null }),
    { maxG: 550, minG: 250 },
  );
});

Deno.test("personnel — petit appétit, 1 900 × 0,25 × 0,9 = 427,5 ⇒ 428 g, plancher 214 relevé à 220", () => {
  // ⚠️ L'arrondi: 427,5 exactement en flottant, `Math.round` monte à 428.
  assertEquals(
    personalPlateBoundsFor({ ageYears: 40, maintenanceKcal: 1900, appetite: "small" }),
    { maxG: 428, minG: 220 },
  );
  // LE CAS QUI MORD: le même entretien sans appétit déclaré fait 475 g.
  assertEquals(
    personalPlateBoundsFor({ ageYears: 40, maintenanceKcal: 1900, appetite: null }),
    { maxG: 475, minG: 238 },
  );
});

Deno.test("personnel — 1 400 kcal: 350 g relevé au plancher du plafond, 400 g", () => {
  assertEquals(
    personalPlateBoundsFor({ ageYears: 30, maintenanceKcal: 1400, appetite: null }),
    { maxG: 400, minG: 220 },
  );
});

Deno.test("personnel — grand appétit, 2 580 × 0,25 × 1,1 = 709,5 ⇒ 550 / 250 (Fabrice)", () => {
  assertEquals(
    personalPlateBoundsFor({ ageYears: 45, maintenanceKcal: 2580, appetite: "large" }),
    { maxG: 550, minG: 250 },
  );
});

Deno.test("personnel — mineur, âge inconnu, entretien inconnu: `null`, la table seule", () => {
  assertEquals(personalPlateBoundsFor({ ageYears: 15, maintenanceKcal: 2400, appetite: null }), null);
  assertEquals(personalPlateBoundsFor({ ageYears: 17, maintenanceKcal: 2400, appetite: null }), null);
  assertEquals(personalPlateBoundsFor({ ageYears: null, maintenanceKcal: 2400, appetite: null }), null);
  assertEquals(personalPlateBoundsFor({ ageYears: 40, maintenanceKcal: null, appetite: null }), null);
  assertEquals(personalPlateBoundsFor({ ageYears: 40, maintenanceKcal: 0, appetite: null }), null);
  assertEquals(personalPlateBoundsFor({ ageYears: 40, maintenanceKcal: Number.NaN, appetite: null }), null);
  // LE CAS QUI PASSE: 18 ans révolus, c'est un adulte.
  assertEquals(
    personalPlateBoundsFor({ ageYears: 18, maintenanceKcal: 2400, appetite: null }),
    { maxG: 550, minG: 250 },
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ plateBoundsFor, AVEC LES BORNES DE LA PERSONNE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("bornes — le déjeuner de Christèle (768 kcal): 480 g, et c'est SON plafond qui décide", () => {
  //   bmax = min(768 ; 550) = 550 ; table Gmax = 550 ; personnel 480 ⇒ 480
  //   bmin = min(768/1,35 ; 250) = 250 ; Gmin = min(250 ; 240) = 240
  //   visée (250 + 550)/2 = 400, dans [240 ; 480]
  const b = plateBoundsFor({
    ageYears: 55,
    slot: "lunch",
    slotTargetKcal: 768,
    light: false,
    appetite: null,
    personal: CHRISTELE_PLATE,
  });
  assertEquals([b.min, b.max, b.preferred, b.boundSource], [240, 480, 400, "personal"]);
  assertEquals(b.physicalMax, 550, "la capacité d'estomac de la tranche ne bouge pas");
  // LE CAS QUI MORD: sans elles, la table, comme avant.
  const t = plateBoundsFor({
    ageYears: 55,
    slot: "lunch",
    slotTargetKcal: 768,
    light: false,
    appetite: null,
    personal: null,
  });
  assertEquals([t.min, t.max, t.preferred, t.boundSource], [250, 550, 400, "table"]);
});

Deno.test("bornes — une collation ne lit PAS le plafond personnel", () => {
  // Goûter de 192 kcal (10 % de 1 920): même objet avec ou sans.
  const args = { ageYears: 55, slot: "snack_pm", slotTargetKcal: 192, light: false, appetite: null };
  const avec = plateBoundsFor({ ...args, personal: CHRISTELE_PLATE });
  assertEquals(avec, plateBoundsFor({ ...args, personal: null }));
  assertEquals([avec.min, avec.max, avec.boundSource], [80, 192, "target"]);
  // ⚠️ `personalPlateBoundsFor` ne rend jamais moins de 400 / 220, donc au-dessus
  // de la table des collations (80 – 300): la règle ne se voit qu'avec des
  // bornes que le calcul ne produit pas. Un goûter de 400 kcal sous un plafond
  // de 150 g reste à 300 g: la collation ne lit pas ces bornes-là non plus.
  const gouter = { ageYears: 55, slot: "snack_pm", slotTargetKcal: 400, light: false, appetite: null };
  const serre = plateBoundsFor({ ...gouter, personal: { maxG: 150, minG: 60 } });
  assertEquals([serre.min, serre.max, serre.boundSource], [80, 300, "table"]);
  // LE CAS QUI MORD: les mêmes bornes sur un REPAS le rabattent.
  const repas = plateBoundsFor({ ...gouter, slot: "dinner", personal: { maxG: 150, minG: 60 } });
  assertEquals([repas.min, repas.max, repas.boundSource], [60, 150, "personal"]);
});

Deno.test("bornes — la part décide encore quand elle tient sous le plafond: `target`", () => {
  // Petit-déjeuner de 480 kcal: 480 g au plus, la part et le plafond se
  // touchent; c'est la part qui décide, comme avant.
  const b = plateBoundsFor({
    ageYears: 55,
    slot: "breakfast",
    slotTargetKcal: 480,
    light: false,
    appetite: null,
    personal: CHRISTELE_PLATE,
  });
  assertEquals([b.min, b.max, b.boundSource], [240, 480, "target"]);
});

Deno.test("bornes — à égalité avec la table (550 g), le motif reste `table`: rien n'a changé", () => {
  const args = { ageYears: 28, slot: "dinner", slotTargetKcal: 900, light: false, appetite: null };
  const avec = plateBoundsFor({ ...args, personal: { maxG: 550, minG: 250 } });
  assertEquals(avec, plateBoundsFor({ ...args, personal: null }));
  assertEquals([avec.min, avec.max, avec.boundSource], [250, 550, "table"]);
});

Deno.test("bornes — ⛔ l'appétit ne compte qu'UNE fois: petit appétit ⇒ 428 g, pas 385", () => {
  // Le plafond personnel (428 = 1 900 × 0,25 × 0,9) porte déjà l'appétit.
  //   table: Gmax = min(0,9 × 550 ; 550) = 495 ; Gmin = min(0,9 × 250) = 225
  //   personnel: Gmax = min(495 ; 428) = 428 ; Gmin = min(225 ; 220) = 220
  //   ⚠️ 0,9 × 428 = 385 serait le double comptage, sous les 400 g décidés.
  const b = plateBoundsFor({
    ageYears: 40,
    slot: "lunch",
    slotTargetKcal: 768,
    light: false,
    appetite: "small",
    personal: { maxG: 428, minG: 220 },
  });
  assertEquals([b.min, b.max, b.preferred, b.boundSource], [220, 428, 360, "personal"]);
  assertEquals(b.appetiteFactor, 0.9);
});

Deno.test("bornes — sans part lisible, la table de la PERSONNE: 240 – 480", () => {
  const b = plateBoundsFor({
    ageYears: 55,
    slot: "dinner",
    slotTargetKcal: null,
    light: false,
    appetite: null,
    personal: CHRISTELE_PLATE,
  });
  assertEquals([b.min, b.max, b.preferred, b.boundSource], [240, 480, 360, "no_target"]);
});

Deno.test("bornes — le repli à 700 g garde SA table pour le plafond; le plancher personnel s'applique", () => {
  // Déjeuner de 900 kcal qui déborde: le repli laisse passer l'énergie de la
  // journée jusqu'à 700 g, plafond personnel ou pas.
  const r = hardCeilingBoundsFor({
    ageYears: 55,
    slot: "lunch",
    slotTargetKcal: 900,
    light: false,
    appetite: null,
    personal: CHRISTELE_PLATE,
  });
  assertEquals([r.min, r.max, r.boundSource], [240, 700, "table"]);
  // LE CAS QUI MORD: sans bornes personnelles, le plancher de la table.
  const t = hardCeilingBoundsFor({
    ageYears: 55,
    slot: "lunch",
    slotTargetKcal: 900,
    light: false,
    appetite: null,
    personal: null,
  });
  assertEquals([t.min, t.max], [250, 700]);
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ slotContractsFor — LE DÉJEUNER DE CHRISTÈLE
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("contrat — le déjeuner de Christèle: son plafond déclenche le PAIN, le plat vaut 552 kcal", () => {
  // ══════════════════════════════════════════════════════════════════════════
  // 1 920 kcal, trois moments (0,25 · 0,40 · 0,35):
  //   déjeuner   0,40 × 1 920 = 768
  //   plat plein 480 × 1,15 = 552   (et non 550 × 1,15 = 632,5)
  //   besoin     768 − 110 − 552 = 106 ≥ 50 ⇒ le PAIN, 106 kcal
  //   part max   0,35 × 768 = 268,8 ; place 268,8 − 110 = 158,8 ⇒ 106 passe
  // ══════════════════════════════════════════════════════════════════════════
  const set = contratsDeChristele(55);
  assertEquals(set.dayTargetKcal, 1920);
  const dej = set.contracts.find((c) => c.slot === "lunch");
  assert(dej !== undefined);
  assertEquals(dej.mealTargetKcal, 768);
  assertAlmostEquals(dej.composeKcal!, 552, 1e-9);
  assertAlmostEquals(dej.sideKcal, 216, 1e-9);
  assertAlmostEquals(dej.sideGrowthKcal, 106, 1e-9);
  assertEquals(dej.sideCourses.map((c) => [c.kind, c.kcal]), [["cheese", 110], ["bread", 106]]);
  assertEquals(dej.overflow, "none");
  assertEquals(
    [dej.bounds!.min, dej.bounds!.max, dej.bounds!.preferred, dej.bounds!.boundSource],
    [240, 480, 400, "personal"],
  );
  // Le couloir du plat: ⌈100 × 552/480⌉ = 115, la visée du gabarit 125.
  assertEquals([dej.corridor!.minPer100G, dej.corridor!.preferredPer100G], [115, 125]);
  assertEquals(set.counters.side_grown_kcal, 106);
  // Le dîner (672 kcal, sans à-côté ce jour-là) est borné par le même plafond.
  const diner = set.contracts.find((c) => c.slot === "dinner")!;
  assertEquals([diner.bounds!.min, diner.bounds!.max, diner.bounds!.boundSource], [240, 480, "personal"]);
});

Deno.test("contrat — CONTRE-ÉPREUVE: la table seule (âge inconnu du contrat) ne met PAS de pain", () => {
  //   plat plein 550 × 1,15 = 632,5 ; besoin 768 − 110 − 632,5 = 25,5 < 50
  //   ⇒ pas de pain: le fromage s'étend de 25,5 (135,5), le plat vaut 632,5.
  const set = contratsDeChristele(null);
  const dej = set.contracts.find((c) => c.slot === "lunch")!;
  assertAlmostEquals(dej.composeKcal!, 632.5, 1e-9);
  assertEquals(dej.sideCourses.map((c) => c.kind), ["cheese"]);
  assertAlmostEquals(dej.sideCourses[0].kcal, 135.5, 1e-9);
  assertEquals([dej.bounds!.min, dej.bounds!.max, dej.bounds!.boundSource], [250, 550, "table"]);
  // Et la même arithmétique, pièce par pièce, avec `personal: null`.
  const b = plateBoundsFor({
    ageYears: 55,
    slot: "lunch",
    slotTargetKcal: 768,
    light: false,
    appetite: null,
    personal: null,
  });
  const budget = sideBudgetFor({
    mealKcal: 768,
    dishCapKcal: (b.max * 115) / 100,
    input: FROMAGE,
    isMinor: false,
  });
  assertEquals(budget.courses.map((c) => c.kind), ["cheese"]);
  assertAlmostEquals(budget.dishKcal, 632.5, 1e-9);
});

Deno.test("contrat — ⛔ le plafond suit l'ENTRETIEN, pas la cible: en perte, 489 g et non 400", () => {
  // Christèle en perte à 0,5 kg/sem: entretien 1 956 (bord milieu des
  // séances, 1,63), cible 1 406. Déjeuner 0,40 × 1 406 = 562,4 kcal.
  //   entretien: 0,25 × 1 956 = 489 g   ← ce que le plan décide
  //   cible:     0,25 × 1 406 = 351,5 ⇒ 400 g (plancher du plafond)
  // Une lecture de la cible rapetisserait l'assiette de qui perd du poids.
  const perte = christele({ direction: "down", paceKgPerWeek: 0.5 });
  assertEquals(maintenanceKcalOf(perte).kcal, 1956);
  assertEquals(dayTargetFor(perte, "no_position").kcal, 1406);
  const set = slotContractsFor({
    mouth: perte,
    coachCounting: "no_position",
    rhythmSlots: ["breakfast", "lunch", "dinner"],
    days: [vendredi(null)],
    lightSlots: [],
    ageYears: 55,
  });
  const dej = set.contracts.find((c) => c.slot === "lunch")!;
  assertAlmostEquals(dej.composeKcal!, 562.4, 1e-9);
  assertEquals([dej.bounds!.min, dej.bounds!.max, dej.bounds!.boundSource], [245, 489, "personal"]);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⟳ 2026-09-25 — L'OBJECTIF NE RAPETISSE PLUS L'ASSIETTE: LA MASSE SUIT LA PART
//                À L'ENTRETIEN (`massKcal`)
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("bornes — `massKcal` n'agrandit l'assiette que de ce que l'objectif lui retirait", () => {
  const base = { ageYears: 55, slot: "breakfast", slotTargetKcal: 300, light: false, appetite: null, personal: CHRISTELE_PLATE };
  assertEquals(plateBoundsFor(base).max, 300, "sans elle: la part de la cible, la règle d'avant");
  assertEquals(plateBoundsFor({ ...base, massKcal: null }).max, 300);
  assertEquals(plateBoundsFor({ ...base, massKcal: 450 }).max, 450, "la part à l'entretien");
  assertEquals(plateBoundsFor({ ...base, massKcal: 900 }).max, 480, "jamais au-delà du plafond personnel");
  assertEquals(plateBoundsFor({ ...base, massKcal: 200 }).max, 300, "jamais EN DESSOUS de la part de la cible");
  assertEquals(plateBoundsFor({ ...base, massKcal: 450 }).min, plateBoundsFor(base).min, "le plancher reste celui de la part");
});

Deno.test("contrats — Christèle en perte: son petit-déjeuner se dimensionne sur sa part À L'ENTRETIEN", () => {
  const perte = christele({ direction: "down", paceKgPerWeek: 0.5 });
  const cible = dayTargetFor(perte, "no_position").kcal!;
  const entretienKcal = maintenanceKcalOf(perte).kcal!;
  const plafond = personalPlateBoundsFor({ ageYears: 55, maintenanceKcal: entretienKcal, appetite: null })!.maxG;
  assert(cible < entretienKcal, `prémisse: la cible (${cible}) est sous l'entretien (${entretienKcal})`);
  const set = slotContractsFor({
    mouth: perte,
    coachCounting: "no_position",
    rhythmSlots: ["breakfast", "lunch", "dinner"],
    days: [vendredi(null)],
    lightSlots: [],
    ageYears: 55,
  });
  const matin = set.contracts.find((c) => c.slot === "breakfast")!;
  const part = matin.composeKcal!;
  const alEntretien = (part * entretienKcal) / cible;
  assertEquals(matin.bounds!.max, Math.round(Math.min(alEntretien, plafond)));
  assert(matin.bounds!.max > Math.round(part), "l'assiette n'est plus rapetissée par l'objectif");
  // ⛔ ET À L'ENTRETIEN, RIEN NE BOUGE: la part EST la part à l'entretien.
  const entretien = slotContractsFor({
    mouth: christele(),
    coachCounting: "no_position",
    rhythmSlots: ["breakfast", "lunch", "dinner"],
    days: [vendredi(null)],
    lightSlots: [],
    ageYears: 55,
  }).contracts.find((c) => c.slot === "breakfast")!;
  const plafondEntretien = personalPlateBoundsFor({
    ageYears: 55,
    maintenanceKcal: maintenanceKcalOf(christele()).kcal,
    appetite: null,
  })!.maxG;
  assertEquals(entretien.bounds!.max, Math.round(Math.min(entretien.composeKcal!, plafondEntretien)));
});
