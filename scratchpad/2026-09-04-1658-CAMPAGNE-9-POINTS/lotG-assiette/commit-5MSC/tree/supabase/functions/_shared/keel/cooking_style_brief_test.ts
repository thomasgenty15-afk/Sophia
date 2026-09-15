import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildMealPrompt } from "./meal_generation.ts";
import { resolveCookingCapacity } from "./cooking_plan.ts";

// ⟳ 2026-09-05 — LE STYLE N'ATTEIGNAIT PAS LE BRIEF. Mesuré sur un foyer
// « keen » (120 min, recettes soignées, variété): 3 casseroles pour 13 repas
// principaux, le même plat six fois. La lane foyer ne passait ni
// `recipeDifficulty` ni `variety` à `buildMealPrompt`; et le mot seul, quand
// il passait (lane solo), ne disait pas le compromis attendu.

// Copié de `plan_feedback_retained_test.ts` (le même socle d'arguments).
const BASE = {
  firstDayCookable: true,
  hasFreezer: false,
  oneCookingSession: false,
  cookOnlyDay: null,
  soloBoxes: false,
  contentLocale: "en-US",
  budgetAmount: null,
  dietBlock: "",
  doctrineBlock: "",
  coachNoteBlock: null,
  fixedIntakes: [],
  dayProperties: [],
  merge: null,
  boxMemberIds: [],
  weighedMemberIds: [],
  kitchenEquipment: null,
  boxMemberDiets: [],
  boxMemberExclusions: [],
  protocolBlock: "",
  beliefKeys: [],
  goal: "health" as const,
  situation: null,
  context: null,
  mode: "to_shop" as const,
  scope: "day" as const,
  slot: null,
  servings: 1,
  pantry: [],
  safetyConstraints: null,
  safetyConstraintTable: null,
  body: null,
  focusAxis: null,
};

Deno.test("la consigne de variété dit le compromis, pas seulement le mot", () => {
  const varied = buildMealPrompt({ ...BASE, variety: "varied" }).userMessage;
  assert(varied.includes("repetition they accept: varied -- no main dish twice in the week"), varied);
  assert(varied.includes("at least two different preparations"), varied);
  assert(varied.includes("one pot eaten six times is the wrong trade"), varied);
  const repeat = buildMealPrompt({ ...BASE, variety: "repeat" }).userMessage;
  assert(repeat.includes("repetition they accept: repeat -- the same main dish may come back"), repeat);
  const some = buildMealPrompt({ ...BASE, variety: "some" }).userMessage;
  assert(some.includes("never three days in a row"), some);
  const none = buildMealPrompt({ ...BASE, variety: null }).userMessage;
  assert(!none.includes("repetition they accept"), "sans variété déclarée, pas de ligne");
});

Deno.test("le niveau de recette dit ce qu'il autorise: keen = on aime cuisiner", () => {
  const keen = buildMealPrompt({ ...BASE, recipeDifficulty: "keen" }).userMessage;
  assert(keen.includes("recipe level they want: keen -- they LIKE cooking"), keen);
  const simple = buildMealPrompt({ ...BASE, recipeDifficulty: "simple" }).userMessage;
  assert(simple.includes("nothing that needs watching"), simple);
});

Deno.test("le style DÉRIVE la difficulté et la variété — c'est ce que le foyer doit passer", () => {
  const keen = resolveCookingCapacity({
    declared: { cookDays: [], cookingTimeMin: null, recipeDifficulty: null, variety: null, budgetAmount: null, cookingStyle: "keen" } as never,
    style: "keen", runs: 2 as never, freezer: true, windowDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as never, leadDay: false, daysToEat: 7,
  } as never);
  assertEquals(keen.variety, "varied");
  assertEquals(keen.recipeDifficulty, "keen");
  const minimal = resolveCookingCapacity({
    declared: { cookDays: [], cookingTimeMin: null, recipeDifficulty: null, variety: null, budgetAmount: null, cookingStyle: "minimal" } as never,
    style: "minimal", runs: 2 as never, freezer: true, windowDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as never, leadDay: false, daysToEat: 7,
  } as never);
  assertEquals(minimal.variety, "repeat");
});

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
Deno.test("CÂBLAGE — la lane foyer passe la difficulté et la variété DU STYLE au brief", async () => {
  const src = stripComments(await Deno.readTextFile(new URL("../../generate-household-meal-v1/index.ts", import.meta.url)));
  const at = src.indexOf("const built = buildMealPrompt({");
  assert(at > -1);
  // Les arguments du brief courent sur des centaines de lignes: on lit une fenêtre large, pas jusqu'au premier `});`.
  const call = src.slice(at, at + 60000);
  assert(/recipeDifficulty: capacity\.recipeDifficulty,/.test(call), "le brief ne reçoit pas la difficulté du style:\n" + call.slice(0, 300));
  assert(/variety: capacity\.variety,/.test(call), "le brief ne reçoit pas la variété du style");
  // Et la rationale lit le compteur swap, pas le roster seul.
  assert(/swap\.counters\.cells_carrying === 0\)\s*\? "whole_table"/.test(src), "la rationale ne lit plus le plan cuisiné");
});

