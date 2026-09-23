/**
 * 2026-09-20 — six œufs pour des plats, trois blancs pour un gâteau ⇒ neuf
 * œufs, une seule ligne. Les grammes deviennent des œufs au poids d'un blanc,
 * arrondis au supérieur.
 */
import { assertEquals } from "jsr:@std/assert@1";
import { foldEggWhitesIntoEggs } from "./shopping_eggs.ts";

const render = (amount: number, unit: string) => unit === "unit" ? String(amount) : `${amount} ${unit}`;

function line(over: Record<string, unknown>) {
  return {
    term: "x",
    quantity: null,
    ref: null,
    amount: null,
    unit: null,
    buy_on: "2026-09-21",
    ...over,
  } as { term: string; quantity: string | null; ref: string | null; amount: number | null; unit: string | null; buy_on?: string | null };
}

Deno.test("6 œufs + 3 blancs (99 g) = 9 œufs, une seule ligne", () => {
  const out = foldEggWhitesIntoEggs({
    lines: [
      line({ term: "œufs entiers", ref: "whole_eggs", amount: 6, unit: "unit", quantity: "6" }),
      line({ term: "blancs d’œufs", ref: "egg_white", amount: 99, unit: "g", quantity: "99 g" }),
      line({ term: "riz", ref: "white_rice", amount: 500, unit: "g", quantity: "500 g" }),
    ],
    whiteGrams: 33,
    eggsTerm: "œufs",
    render,
  });
  assertEquals(out.lines.map((l) => [l.term, l.ref, l.amount, l.unit, l.quantity]), [
    ["œufs entiers", "whole_eggs", 9, "unit", "9"],
    ["riz", "white_rice", 500, "g", "500 g"],
  ]);
  assertEquals(out.counters.eggs_added, 3);
  assertEquals(out.counters.whites_from_grams, 1);
  assertEquals(out.counters.waves_folded, 1);
});

Deno.test("les grammes s'arrondissent AU SUPÉRIEUR : 1 304 g de blancs = 40 œufs", () => {
  const out = foldEggWhitesIntoEggs({
    lines: [
      line({ term: "œufs entiers", ref: "whole_eggs", amount: 28, unit: "unit" }),
      line({ term: "blancs d’œufs", ref: "egg_white", amount: 1304, unit: "g" }),
    ],
    whiteGrams: 33,
    eggsTerm: "œufs",
    render,
  });
  // 1304 / 33 = 39,5 → 40
  assertEquals(out.lines.length, 1);
  assertEquals(out.lines[0].amount, 68);
  assertEquals(out.lines[0].quantity, "68");
});

Deno.test("sans ligne d'œufs dans la vague, la ligne des blancs devient la ligne d'œufs", () => {
  const out = foldEggWhitesIntoEggs({
    lines: [
      line({ term: "blancs d’œufs", ref: "egg_white", amount: 66, unit: "g" }),
    ],
    whiteGrams: 33,
    eggsTerm: "œufs",
    render,
  });
  assertEquals(out.lines.map((l) => [l.term, l.ref, l.amount, l.unit, l.quantity]), [
    ["œufs", "whole_eggs", 2, "unit", "2"],
  ]);
  assertEquals(out.counters.eggs_lines_created, 1);
});

Deno.test("le pli se fait PAR VAGUE d'achat, jamais en travers", () => {
  const out = foldEggWhitesIntoEggs({
    lines: [
      line({ term: "œufs entiers", ref: "whole_eggs", amount: 6, unit: "unit", buy_on: "2026-09-21" }),
      line({ term: "blancs d’œufs", ref: "egg_white", amount: 33, unit: "g", buy_on: "2026-09-21" }),
      line({ term: "blancs d’œufs", ref: "egg_white", amount: 4, unit: "unit", buy_on: "2026-09-24" }),
    ],
    whiteGrams: 33,
    eggsTerm: "œufs",
    render,
  });
  assertEquals(out.lines.map((l) => [l.ref, l.amount, l.buy_on]), [
    ["whole_eggs", 7, "2026-09-21"],
    ["whole_eggs", 4, "2026-09-24"],
  ]);
  assertEquals(out.counters.waves_folded, 2);
  assertEquals(out.counters.whites_from_units, 1);
});

Deno.test("sans poids unitaire connu, les grammes de blancs restent tels quels et sont comptés", () => {
  const out = foldEggWhitesIntoEggs({
    lines: [
      line({ term: "œufs entiers", ref: "whole_eggs", amount: 6, unit: "unit", quantity: "6" }),
      line({ term: "blancs d’œufs", ref: "egg_white", amount: 99, unit: "g", quantity: "99 g" }),
    ],
    whiteGrams: null,
    eggsTerm: "œufs",
    render,
  });
  assertEquals(out.lines.length, 2);
  assertEquals(out.lines[0].amount, 6);
  assertEquals(out.counters.whites_no_unit_grams, 1);
  assertEquals(out.counters.eggs_added, 0);
});

Deno.test("une ligne d'œufs illisible (en grammes) saute le pli, sans rien perdre", () => {
  const out = foldEggWhitesIntoEggs({
    lines: [
      line({ term: "œufs", ref: "whole_eggs", amount: 300, unit: "g" }),
      line({ term: "blancs d’œufs", ref: "egg_white", amount: 99, unit: "g" }),
    ],
    whiteGrams: 33,
    eggsTerm: "œufs",
    render,
  });
  assertEquals(out.lines.length, 2);
  assertEquals(out.counters.eggs_unreadable, 1);
  assertEquals(out.counters.eggs_added, 0);
});

Deno.test("sans blancs, rien ne bouge", () => {
  const lines = [line({ term: "œufs entiers", ref: "whole_eggs", amount: 6, unit: "unit", quantity: "6" })];
  const out = foldEggWhitesIntoEggs({ lines, whiteGrams: 33, eggsTerm: "œufs", render });
  assertEquals(out.lines, lines);
  assertEquals(out.counters.whites_lines, 0);
});
