/**
 * « ÇA VAUT AUSSI POUR… » — `dish_match.ts`.
 *
 * Le cas d'origine, mesuré le 2026-09-24: trois matins aux œufs, la même raison
 * tapée trois fois. Les valeurs attendues sont écrites à la main.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  buildDishMatchPrompt,
  type DishMatchDish,
  dishMatchCandidates,
  readDishMatches,
} from "./dish_match.ts";

const PAUL = "m-paul";
const NAMES = new Map([[PAUL, "Paul"]]);

function dish(day: string, slot: string, title: string, terms: string[], over: Partial<DishMatchDish> = {}): DishMatchDish {
  return {
    day,
    slot,
    title,
    memberId: null,
    boxes: [{ memberIds: [PAUL] }],
    ingredients: terms.map((term) => ({ term })),
    ...over,
  };
}

const PLAN: DishMatchDish[] = [
  dish("thu", "breakfast", "Frittata aux champignons, pain, petit-suisse", ["œufs", "champignons", "pain"]),
  dish("fri", "breakfast", "Œufs durs, flocons d'avoine, pomme", ["œufs", "flocons d'avoine", "pomme"]),
  dish("sat", "breakfast", "Œufs durs, flocons d'avoine, pomme", ["œufs", "flocons d'avoine", "pomme"]),
  dish("fri", "lunch", "Dinde, champignons, orge", ["dinde", "champignons", "orge"]),
  dish("fri", "dinner", "Poulet, pâtes, tomate", ["poulet", "pâtes"], { complementsShared: true }),
  dish("sat", "dinner", "", ["x"]),
];

Deno.test("les candidats: un par titre, le plat barré et les compléments exclus", () => {
  const out = dishMatchCandidates({
    dishes: PLAN,
    struckTitle: "frittata aux champignons, pain, petit-suisse",
    names: NAMES,
  });
  assertEquals(out.map((c) => c.title), ["Œufs durs, flocons d'avoine, pomme", "Dinde, champignons, orge"]);
  assertEquals(out[0].id, 1);
  assertEquals(out[0].occurrences.map((o) => o.day), ["fri", "sat"]);
  assertEquals(out[0].who, ["Paul"]);
  assertEquals(out[0].terms, ["œufs", "flocons d'avoine", "pomme"]);
});

Deno.test("la consigne: la raison, le plat visé, le moment, et la liste numérotée", () => {
  const candidates = dishMatchCandidates({ dishes: PLAN, struckTitle: PLAN[0].title!, names: NAMES });
  const prompt = buildDishMatchPrompt({
    reason: "Pas d'«oeufs» le matin",
    struck: { title: PLAN[0].title!, day: "thu", slot: "breakfast", who: ["Paul"] },
    candidates,
  });
  assert(prompt.includes('«Pas d\'"oeufs" le matin»'), prompt);
  assert(prompt.includes("(breakfast on thu, for Paul)"), prompt);
  assert(prompt.includes("1 — «Œufs durs, flocons d'avoine, pomme» — breakfast on fri, sat — for Paul — œufs"), prompt);
  assert(prompt.includes("2 — «Dinde, champignons, orge» — lunch on fri — for Paul"), prompt);
});

Deno.test("la réponse: seuls les numéros de la liste, sans doublon, dans l'ordre de la liste", () => {
  const candidates = dishMatchCandidates({ dishes: PLAN, struckTitle: PLAN[0].title!, names: NAMES });
  const read = readDishMatches('{"matches": [2, "1", 1, 99, "x"]}', candidates);
  assertEquals(read.matches.map((c) => c.id), [1, 2]);
  assertEquals(read.unknown, 2);
  assertEquals(read.malformed, false);
  assertEquals(readDishMatches({ matches: [] }, candidates).matches, []);
});

Deno.test("la réponse illisible ne propose rien, et le dit", () => {
  const candidates = dishMatchCandidates({ dishes: PLAN, struckTitle: PLAN[0].title!, names: NAMES });
  assertEquals(readDishMatches("pas du json", candidates).malformed, true);
  assertEquals(readDishMatches({ other: [1] }, candidates).malformed, true);
  assertEquals(readDishMatches("[1, 2]", candidates).malformed, true);
});

Deno.test("au-delà du plafond, les suivants sont comptés et jetés", () => {
  const many: DishMatchDish[] = Array.from({ length: 15 }, (_, i) => dish("mon", "lunch", `Plat ${i}`, ["x"]));
  const candidates = dishMatchCandidates({ dishes: many, struckTitle: "autre", names: NAMES });
  const read = readDishMatches({ matches: candidates.map((c) => c.id) }, candidates);
  assertEquals(read.matches.length, 12);
  assertEquals(read.overCap, 3);
});
