/**
 * 2026-09-20 — le plat de table que personne ne mange est retiré ; celui qu'une
 * bouche sans plat à elle mange encore est gardé.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { householdCells } from "./household_cells.ts";
import { tableDishesNobodyEats } from "./table_dish_nobody.ts";

const FULL = [
  { slot: "breakfast" as const, size: null },
  { slot: "snack_am" as const, size: null },
  { slot: "lunch" as const, size: null },
  { slot: "dinner" as const, size: null },
];
const THREE = FULL.filter((o) => o.slot !== "snack_am");

/** Thomas mange à quatre moments et a son plat en milieu de matinée ; les deux autres n'y mangent pas. */
function grid(ownMealSlots: string[] = ["snack_am"]) {
  return householdCells({
    mouths: [
      {
        memberId: "thomas",
        eatingSlots: FULL,
        away: [],
        lightSlots: [],
        diet: null,
        demands: { protein: null, starch: null, vegetables: null },
        ownMealSlots,
        ownMealDays: null,
      },
      ...["christele", "fabrice"].map((memberId) => ({
        memberId,
        eatingSlots: THREE,
        away: [],
        lightSlots: [],
        diet: null,
        demands: { protein: null, starch: null, vegetables: null },
        ownMealSlots: [],
        ownMealDays: null,
      })),
    ],
    baseRegime: null,
    houseRhythm: THREE,
    windowDays: ["mon"],
    gridSlots: ["breakfast", "snack_am", "lunch", "dinner"],
    spentSlots: { day: null, slots: [] },
    cookOnlyDay: null,
  }).cells;
}

Deno.test("le plat de table du seul mangeur qui a son plat est retiré", () => {
  const out = tableDishesNobodyEats({
    dishes: [
      { day: "mon", slot: "snack_am", memberId: "thomas", title: "Lait, banane, avoine" },
      { day: "mon", slot: "snack_am", memberId: null, title: "Petit-suisse, cacahuètes et pêche" },
      { day: "mon", slot: "lunch", memberId: null, title: "Poulet riz" },
    ],
    cells: grid(),
  });
  assertEquals(out.keep, [true, false, true]);
  assertEquals(out.dropped, [
    { day: "mon", slot: "snack_am", title: "Petit-suisse, cacahuètes et pêche" },
  ]);
  assertEquals(out.counters, {
    dishes: 3,
    table_dishes: 2,
    placed: 2,
    dropped: 1,
    kept_fed: 1,
    off_cell: 0,
  });
});

Deno.test("sans plat dédié livré, le plat de table reste : c'est sa nourriture", () => {
  const out = tableDishesNobodyEats({
    dishes: [
      { day: "mon", slot: "snack_am", memberId: null, title: "Petit-suisse, cacahuètes et pêche" },
    ],
    cells: grid(),
  });
  assertEquals(out.keep, [true]);
  assertEquals(out.counters.kept_fed, 1);
  assertEquals(out.counters.dropped, 0);
});

Deno.test("à table pleine, un plat de table est gardé même si une bouche a le sien", () => {
  const out = tableDishesNobodyEats({
    dishes: [
      { day: "mon", slot: "lunch", memberId: "thomas", title: "Son plat" },
      { day: "mon", slot: "lunch", memberId: null, title: "Le plat commun" },
    ],
    cells: grid(["snack_am", "lunch"]),
  });
  assertEquals(out.keep, [true, true]);
  assertEquals(out.counters.kept_fed, 1);
});

Deno.test("un plat dédié n'est jamais retiré, et un plat hors case est laissé aux autres ceintures", () => {
  const out = tableDishesNobodyEats({
    dishes: [
      { day: "mon", slot: "snack_am", memberId: "thomas", title: "Le sien" },
      { day: null, slot: "snack_am", memberId: null, title: "Sans jour" },
      { day: "mon", slot: "before_bed", memberId: null, title: "Case inconnue" },
    ],
    cells: grid(),
  });
  assertEquals(out.keep, [true, true, true]);
  assertEquals(out.counters.off_cell, 2);
  assertEquals(out.counters.dropped, 0);
});

Deno.test("un complément nommé ne libère pas son porteur du plat de table", () => {
  const out = tableDishesNobodyEats({
    dishes: [
      { day: "mon", slot: "snack_am", memberId: "thomas", complementsShared: true, title: "Un plus" },
      { day: "mon", slot: "snack_am", memberId: null, title: "Le plat de table" },
    ],
    cells: grid(),
  });
  assert(out.keep[1], "le porteur d'un complément mange encore le plat de table");
  assertEquals(out.counters.dropped, 0);
});
