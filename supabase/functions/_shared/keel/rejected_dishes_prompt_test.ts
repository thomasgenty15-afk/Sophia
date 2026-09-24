/**
 * LA LIGNE DES PLATS REFUSÉS DANS LES DEUX CONSTRUCTEURS DE CONSIGNE — 2026-09-24.
 *
 * `rejected_dishes_wiring_test.ts` prouve que la ligne ENTRE dans l'entrée
 * commune des constructeurs; ce fichier prouve ce qu'ils en FONT: elle est
 * dans la partie utilisateur, juste après « à éviter » et avant les règles de
 * maison, une seule fois; absente, la consigne est celle d'avant à l'octet près.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { buildHouseholdPromptBlocks } from "./household_meal_generation.ts";
import { buildHouseholdPromptBlocksV34 } from "./household_prompt_v34.ts";
import { parseMemberAway, resolveWindowPresence } from "./household_presence.ts";
import { householdCells } from "./household_cells.ts";
import { avoidLineOf } from "./plan_avoid_list.ts";
import { rejectedDishesLine } from "./rejected_dishes.ts";
import type { PortionMember } from "./household_portions.ts";
import type { HouseholdRestriction } from "./household_meal_generation.ts";

const RHYTHM = [
  { slot: "breakfast" as const, size: null },
  { slot: "lunch" as const, size: null },
  { slot: "dinner" as const, size: null },
];
const member = (memberId: string, displayName: string, goal: PortionMember["goal"], ageState: PortionMember["ageState"] = "adult"): PortionMember => ({
  memberId, displayName, goal, ageState, body: null, lightSlots: [], eatingSlots: null, habits: [],
  habitNote: null, requiredDensity: null, proteinBrief: null,
});
const MARC = member("m-marc", "Marc", "fat_loss");
const LEA = member("m-lea", "Léa", null, "minor");
const PRESENCE = resolveWindowPresence({
  members: [{ memberId: "m-marc", displayName: "Marc", away: parseMemberAway([]) }],
  rhythm: RHYTHM,
  windowDays: ["mon", "tue"],
});

const REJECTED = rejectedDishesLine({
  entries: [
    { key: "soupe de courge", title: "Soupe de courge", name: null, household: true, memberIds: [], reason: "fade", at: "2026-09-24", draftId: null },
    { key: "lait, pêche et avoine", title: "Lait, pêche et avoine", name: null, household: false, memberIds: ["m-marc", "m-parti"], reason: "trop sucré", at: "2026-09-23", draftId: null },
  ],
  roster: [{ memberId: "m-marc", name: "Marc" }, { memberId: "m-lea", name: "Léa" }],
})!;
const AVOID = avoidLineOf({ proteins: ["chicken"], starches: ["rice"] })!;
const RESTRICTIONS: HouseholdRestriction[] = [{ memberId: "m-lea", memberDisplayName: "Léa", label: "nutella" }];

function v42(over: Record<string, unknown>) {
  return buildHouseholdPromptBlocks({
    sizingPath: "legacy_measure", ruleHolders: [], traditions: [],
    daysInWindow: ["mon", "tue"], members: [MARC, LEA], envyLine: "un curry",
    restrictions: RESTRICTIONS, presence: PRESENCE, merge: null, cooking: "one_dish", divergingCount: 0,
    weightGroups: 1, dishBearers: [], dedicatedDishesAsked: 0, medicalMouths: [], crossContactUnnamedMedical: 0,
    kitchenEquipment: null, unmerge: null, dietBlock: "", notes: [], voices: [],
    // deno-lint-ignore no-explicit-any
    ...(over as any),
  } as never);
}
function v34(over: Record<string, unknown>) {
  const cells = householdCells({
    mouths: [MARC, LEA].map((m) => ({
      memberId: m.memberId, eatingSlots: null, away: [], lightSlots: [], diet: null,
      demands: { protein: null, starch: null, vegetables: null }, ownMealSlots: [], ownMealDays: null,
    })),
    baseRegime: null, houseRhythm: RHYTHM, windowDays: ["mon"], gridSlots: ["breakfast", "lunch", "dinner"],
    spentSlots: { day: null, slots: [] }, cookOnlyDay: null,
  }).cells;
  return buildHouseholdPromptBlocksV34({
    sizingPath: "portion_v1", members: [MARC, LEA], cells, cardFacts: {}, ruleHolders: [], traditions: [],
    daysInWindow: ["mon"], envyLine: "un curry", restrictions: RESTRICTIONS, presence: PRESENCE, merge: null,
    unmerge: null, cooking: "one_dish", divergingCount: 0, weightGroups: 1, dishBearers: [],
    dedicatedDishesAsked: 0, medicalMouths: [], crossContactUnnamedMedical: 0, kitchenEquipment: null,
    dietBlock: "", notes: [], voices: [],
    // deno-lint-ignore no-explicit-any
    ...(over as any),
  } as never);
}

Deno.test("la ligne elle-même : prénoms, « everyone », bouche partie tue, raisons citées", () => {
  assert(REJECTED.startsWith("DISHES THEY TURNED DOWN"), REJECTED);
  assert(REJECTED.includes("- «Soupe de courge» — for everyone — they said: «fade»"), REJECTED);
  assert(REJECTED.includes("- «Lait, pêche et avoine» — for Marc — they said: «trop sucré»"), REJECTED);
  assert(!REJECTED.includes("m-parti") && !REJECTED.includes("m-marc"), "aucun identifiant ne part au modèle");
});

for (const [name, build] of [["v42", v42], ["v34", v34]] as const) {
  Deno.test(`${name} — la ligne des plats refusés suit « à éviter », avant les règles de maison`, () => {
    const b = build({ avoidLine: AVOID, rejectedDishesLine: REJECTED });
    const u: string = b.userSuffix;
    const avoidAt = u.indexOf(AVOID);
    const rejAt = u.indexOf(REJECTED);
    const rule = u.indexOf("- Léa: never serve nutella");
    assert(avoidAt > 0 && rejAt > avoidAt, `ordre à éviter → refusés (${avoidAt}, ${rejAt})`);
    assert(rule > rejAt, `la ligne passe avant la règle de maison (${rejAt}, ${rule})`);
    assertEquals(b.rejectedLineUsed, true);
    assertEquals(u.split(REJECTED).length - 1, 1, "la ligne une fois, pas deux");
    assert(!(b.systemSuffix ?? "").includes("DISHES THEY TURNED DOWN"), "pas dans le système");
  });

  Deno.test(`${name} — sans plats refusés, la consigne est celle d'avant à l'octet près`, () => {
    const sans = build({ avoidLine: AVOID });
    for (const line of [null, "", "   "]) {
      const b = build({ avoidLine: AVOID, rejectedDishesLine: line });
      assertEquals(b.userSuffix, sans.userSuffix, `rejectedDishesLine=${JSON.stringify(line)}`);
      assertEquals(b.systemSuffix, sans.systemSuffix);
      assertEquals(b.rejectedLineUsed, false);
    }
  });

  Deno.test(`${name} — sans « à éviter », la ligne des refusés tient seule`, () => {
    const b = build({ rejectedDishesLine: REJECTED });
    assert((b.userSuffix as string).includes(REJECTED));
    assertEquals(b.rejectedLineUsed, true);
  });
}
