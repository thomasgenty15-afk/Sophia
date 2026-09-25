/**
 * ⟳ 2026-09-25 — « QUE DU CAFÉ » : quel plat à soi est un moment déclaré vide.
 * Le cas réel : plan C du banc des trois foyers (`8c7dc643`), « Café noir »,
 * aucun ingrédient, mesuré 0 kcal sans lacune.
 */
import { assertEquals } from "jsr:@std/assert@1";
import {
  declaredEmptyOwnCells,
  OWN_USUAL_EMPTY_MAX_KCAL,
  ownMealCellKey,
} from "./declared_empty_own_dish.ts";

const THOMAS = "d36b4318";
const OWN = new Set([
  ownMealCellKey(THOMAS, "tue", "breakfast"),
  ownMealCellKey(THOMAS, "wed", "breakfast"),
]);
const run = (
  dishes: { memberId: string | null; day: string; slot: string; uses?: unknown[] }[],
  kcal: (number | null)[],
  gaps: string[][] = [],
) =>
  declaredEmptyOwnCells({
    dishes,
    ownMealCells: OWN,
    measure: (i) => ({ kcal: kcal[i], gaps: gaps[i] ?? [] }),
  });

Deno.test("le café noir sans ingrédient, mesuré 0 kcal, est un moment déclaré vide", () => {
  const out = run([
    { memberId: THOMAS, day: "tue", slot: "breakfast" },
    { memberId: THOMAS, day: "wed", slot: "breakfast" },
    { memberId: null, day: "tue", slot: "breakfast" },
  ], [0, 0, 480]);
  assertEquals([...out.cells].sort(), [...OWN].sort());
  assertEquals(out.byMember.get(THOMAS)?.get("tue"), ["breakfast"]);
  assertEquals(out.counters, { own_usual_dishes: 2, empty_cells: 2, unmeasured: 0 });
});

Deno.test("un yaourt et une pomme n'est pas « rien »", () => {
  const out = run([{ memberId: THOMAS, day: "tue", slot: "breakfast" }], [150]);
  assertEquals(out.cells.size, 0);
});

Deno.test("jusqu'au seuil compris, au-delà non", () => {
  assertEquals(run([{ memberId: THOMAS, day: "tue", slot: "breakfast" }], [OWN_USUAL_EMPTY_MAX_KCAL]).cells.size, 1);
  assertEquals(run([{ memberId: THOMAS, day: "tue", slot: "breakfast" }], [OWN_USUAL_EMPTY_MAX_KCAL + 1]).cells.size, 0);
});

Deno.test("« je ne sais pas » n'est jamais « rien » : lacune ou mesure absente", () => {
  const lacune = run([{ memberId: THOMAS, day: "tue", slot: "breakfast" }], [0], [["unresolved"]]);
  assertEquals(lacune.cells.size, 0);
  assertEquals(lacune.counters.unmeasured, 1);
  assertEquals(run([{ memberId: THOMAS, day: "tue", slot: "breakfast" }], [null]).cells.size, 0);
});

Deno.test("un plat qui tire sur une casserole n'est pas « rien », même mesuré bas", () => {
  const out = run([{ memberId: THOMAS, day: "tue", slot: "breakfast", uses: [{ preparationId: "p" }] }], [0]);
  assertEquals(out.cells.size, 0);
});

Deno.test("hors d'une case d'habitude déclarée, rien n'est examiné", () => {
  // Plat à soi pour raison de RÉGIME (la case n'est pas `own_meal`) et plat de table.
  const out = run([
    { memberId: THOMAS, day: "thu", slot: "breakfast" },
    { memberId: null, day: "tue", slot: "breakfast" },
  ], [0, 0]);
  assertEquals(out.cells.size, 0);
  assertEquals(out.counters.own_usual_dishes, 0);
});

Deno.test("deux plats à soi sur la même case : c'est leur somme qui décide", () => {
  const cle = { memberId: THOMAS, day: "tue", slot: "breakfast" };
  assertEquals(run([cle, cle], [0, 20]).cells.size, 1);
  assertEquals(run([cle, cle], [0, 200]).cells.size, 0);
});
