/**
 * « QUE DU CAFÉ » : LA PART DU MATIN VA AUSSI AUX À-CÔTÉS — 2026-09-25 (nuit).
 *
 * Rejeu du tir C-3 du banc des trois foyers. Thomas (perte de poids) déclare
 * « un café noir, rien d'autre » le matin. Ses contrats étaient bien réécrits
 * sans le petit-déjeuner (déjeuner 1 008 kcal au lieu de 756), mais son
 * assiette est pleine vers 655 kcal : le reste part aux à-côtés du contrat
 * (353 kcal au déjeuner, 249 au dîner). Le registre des à-côtés pesait encore
 * les demandes construites AVANT le modèle, sur les anciens contrats : ces
 * ~600 kcal par jour n'étaient servies nulle part. Ses jours : 76, 82 et 80 %
 * de sa cible. Après le correctif, même rejeu : 88, 98 et 100 % (le mardi
 * reste court pour une autre raison : un dîner de lentilles à 0,96 kcal/g
 * dépasse son plafond d'assiette et le moteur le rabote).
 *
 * Ce fichier tient : ① la fonction qui construit une demande d'à-côtés ;
 * ② que les demandes tirées d'un contrat réécrit portent la journée entière ;
 * ③ la jointure dans le générateur (ordre des appels, construction unique).
 */
import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import { sideAskOfContract } from "./side_courses.ts";
import { type ContractDay, slotContractsFor } from "./slot_nutrition_contract.ts";
import type { AnchorMouth } from "./mouth_anchor.ts";
import type { SideCourseAlloc, SideCourseSlot, SideCourseSlotInput } from "./side_courses_types.ts";
import { sourceFamilySync } from "./source_family.ts";

const alloc = (kind: SideCourseAlloc["kind"], kcal: number): SideCourseAlloc =>
  ({ kind, kcal, proteinEstG: 0 }) as SideCourseAlloc;

function contrat(over: Partial<Parameters<typeof sideAskOfContract>[0]> = {}) {
  return {
    memberId: "m-thomas",
    dayToken: "tue",
    slot: "lunch",
    sideCourses: [alloc("dessert", 120), alloc("bread", 0)],
    composeKcal: 655.2,
    sideKcal: 120,
    ...over,
  };
}

Deno.test("① une demande par case d'à-côté : les types à 0 kcal ne sont pas demandés", () => {
  const out = sideAskOfContract(contrat(), "fat_loss", () => 3);
  assert(out !== null);
  assertEquals(out.ask.courses.map((c) => c.kind), ["dessert"]);
  assertEquals([out.ask.memberId, out.ask.dayToken, out.ask.slot, out.ask.dayIndex], ["m-thomas", "tue", "lunch", 3]);
  assertEquals(out.ask.goal, "fat_loss");
  assertAlmostEquals(out.mealKcal, 655.2 + 120, 1e-9, "le repas entier: plat + à-côtés");
});

Deno.test("① pas de demande hors déjeuner/dîner, ni sans à-côté à plus de 0 kcal — et l'indice n'est pas lu", () => {
  let lus = 0;
  const indice = () => {
    lus++;
    return 0;
  };
  assertEquals(sideAskOfContract(contrat({ slot: "breakfast" }), "fat_loss", indice), null);
  assertEquals(sideAskOfContract(contrat({ sideCourses: [alloc("bread", 0)] }), "fat_loss", indice), null);
  assertEquals(sideAskOfContract(contrat({ sideCourses: [] }), "fat_loss", indice), null);
  // ⛔ L'appelant compte les jours hors fenêtre dans cette fonction-là: elle
  // ne doit tourner que pour une demande retenue.
  assertEquals(lus, 0);
});

// ── ② sur de vrais contrats ──────────────────────────────────────────────
const CORPS = {
  heightCm: 180,
  weightKg: 90,
  gender: "male" as const,
  ageYears: 34,
  activityLevel: "trains_some" as const,
  activityAxes: { day: "seated" as const, sport: "1_2" as const, asked: true },
  appetite: null,
};
const bouche = {
  memberId: "m-thomas",
  ageState: "adult",
  restriction: "clear",
  body: CORPS,
  direction: "down",
  paceKgPerWeek: 0.5,
  declaredSlots: ["breakfast", "lunch", "dinner"],
  conditionRefs: [],
  portionIndex: null,
} as unknown as AnchorMouth;
const DESSERT: SideCourseSlotInput = {
  courses: [{ kind: "dessert", baseKcal: 100 }],
  growKinds: ["dessert", "bread"],
  refused: false,
  capShare: 0.35,
  light: false,
};

function contratsDuJour(emptySlots: string[]) {
  const day: ContractDay = {
    dayToken: "tue",
    date: "2026-09-29",
    coveredSlots: ["breakfast", "lunch", "dinner"],
    lockedSlots: [],
    fixedKcalBySlot: null,
    sides: new Map<SideCourseSlot, SideCourseSlotInput>([["lunch", DESSERT], ["dinner", DESSERT]]),
    emptySlots,
  };
  return slotContractsFor({
    mouth: bouche,
    coachCounting: "no_position",
    rhythmSlots: ["breakfast", "lunch", "dinner"],
    days: [day],
    lightSlots: [],
    ageYears: 34,
  });
}

function demandes(emptySlots: string[]) {
  const set = contratsDuJour(emptySlots);
  const asks = set.contracts
    .map((c) => sideAskOfContract(c, "fat_loss", () => 0))
    .filter((x) => x !== null);
  return { set, asks };
}

Deno.test("② petit-déjeuner déclaré vide : les demandes du déjeuner et du dîner portent la journée entière", () => {
  const avant = demandes([]);
  const apres = demandes(["breakfast"]);
  const jour = apres.set.contracts[0].dayTargetKcal!;
  assert(jour > 0);
  assertEquals(apres.asks.map((a) => a.ask.slot).sort(), ["dinner", "lunch"]);
  const repas = (xs: typeof apres.asks) => xs.reduce((n, a) => n + a.mealKcal, 0);
  const aCotes = (xs: typeof apres.asks) =>
    xs.reduce((n, a) => n + a.ask.courses.reduce((m, c) => m + c.kcal, 0), 0);
  // Sans moment vide, le matin garde sa part: déjeuner + dîner < la journée.
  assert(repas(avant.asks) < jour - 100, `avant: ${repas(avant.asks)} contre ${jour}`);
  // Avec le matin vide, déjeuner + dîner (plats + à-côtés) = la journée.
  assertAlmostEquals(repas(apres.asks), jour, 0.5);
  // Et les à-côtés demandés ne diminuent pas: c'est eux qui portent ce que
  // l'assiette ne tient pas.
  assert(aCotes(apres.asks) >= aCotes(avant.asks) - 1e-9);
});

// ── ③ la jointure dans le générateur ─────────────────────────────────────
const SRC = sourceFamilySync(
  new URL("../../generate-household-meal-v1/index.ts", import.meta.url),
);

Deno.test("③ la réécriture passe AVANT le registre des à-côtés du tour", () => {
  const tour = SRC.indexOf("for (let c4Round = 0;; c4Round++) {");
  assert(tour > 0);
  const identifie = SRC.indexOf('await identifyFoods({ withPlanLines: false, source: "side_course_identify" });', tour);
  const reecrit = SRC.indexOf("applyDeclaredEmptyContracts();", tour);
  const registre = SRC.indexOf("sideLedger = buildSideLedgerFor(meal, NO_BOUNDARY_DEFICIT);", tour);
  const dimension = SRC.indexOf("const portionSizing = await (async () => {", tour);
  assert(identifie > 0 && reecrit > 0 && registre > 0 && dimension > 0);
  assert(identifie < reecrit, "après l'identification des à-côtés");
  assert(reecrit < registre, "avant le registre qui pèse les à-côtés");
  assert(registre < dimension, "et donc avant le dimensionnement");
  assertEquals(SRC.split("applyDeclaredEmptyContracts();").length - 1, 1, "un seul appel");
});

Deno.test("③ une seule construction des demandes, et la réécriture refait celles de la personne", () => {
  assertEquals(SRC.split("sideCourseAsks.push(").length - 1, 1, "un seul ajout, dans la boucle des contrats");
  assertEquals(SRC.split("sideAskOfContract(").length - 1, 2, "la boucle des contrats et la réécriture");
  const i = SRC.indexOf("const applyDeclaredEmptyContracts = (): DeclaredEmptyOutcome => {");
  const fin = SRC.indexOf('tag: "keel.household_meal.declared_empty",', i);
  const corps = SRC.slice(i, fin);
  assert(corps.includes("sideAskOfContract(c, goal,"), "les demandes viennent du contrat réécrit");
  assert(corps.includes("sideMealKcalByKey.set("), "le repas entier de la case suit");
  assert(corps.includes("sideCourseAsks.splice("), "les anciennes demandes sont remplacées en place");
});
