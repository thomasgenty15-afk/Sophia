import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildMealPrompt, MAX_FRIDGE_DAYS } from "./meal_generation.ts";
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
  groceryCadence: null,
  standardRecipe: false,
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
  goal: "maintenance" as const,
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
  lightSlots: [],
  focusAxis: null,
};

Deno.test("la consigne de variété dit le compromis, pas seulement le mot", () => {
  const varied = buildMealPrompt({ budgetFloor: null, ...BASE, variety: "varied" }).userMessage;
  assert(varied.includes("repetition they accept: varied -- no main dish twice in the week"), varied);
  assert(varied.includes("at least two different preparations"), varied);
  assert(varied.includes("one pot eaten six times is the wrong trade"), varied);
  const repeat = buildMealPrompt({ budgetFloor: null, ...BASE, variety: "repeat" }).userMessage;
  assert(repeat.includes("repetition they accept: repeat -- the same main dish may come back"), repeat);
  const some = buildMealPrompt({ budgetFloor: null, ...BASE, variety: "some" }).userMessage;
  assert(some.includes("never three days in a row"), some);
  const none = buildMealPrompt({ budgetFloor: null, ...BASE, variety: null }).userMessage;
  assert(!none.includes("repetition they accept"), "sans variété déclarée, pas de ligne");
});

Deno.test("le niveau de recette dit ce qu'il autorise: keen = on aime cuisiner", () => {
  const keen = buildMealPrompt({ budgetFloor: null, ...BASE, recipeDifficulty: "keen" }).userMessage;
  assert(keen.includes("recipe level they want: keen -- they LIKE cooking"), keen);
  const simple = buildMealPrompt({ budgetFloor: null, ...BASE, recipeDifficulty: "simple" }).userMessage;
  assert(simple.includes("nothing that needs watching"), simple);
});

Deno.test("le style DÉRIVE la difficulté et la variété — c'est ce que le foyer doit passer", () => {
  const keen = resolveCookingCapacity({
    declared: { cookDays: [], cookingTimeMin: null, recipeDifficulty: null, variety: null, budgetAmount: null, cookingStyle: "keen" } as never,
    style: "keen", runs: 2 as never, freezer: true, windowDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as never, leadDay: false, daysToEat: 7,
    oneCookingSession: false, maxFridgeDays: MAX_FRIDGE_DAYS,
  } as never);
  assertEquals(keen.variety, "varied");
  assertEquals(keen.recipeDifficulty, "keen");
  const minimal = resolveCookingCapacity({
    declared: { cookDays: [], cookingTimeMin: null, recipeDifficulty: null, variety: null, budgetAmount: null, cookingStyle: "minimal" } as never,
    style: "minimal", runs: 2 as never, freezer: true, windowDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as never, leadDay: false, daysToEat: 7,
    oneCookingSession: false, maxFridgeDays: MAX_FRIDGE_DAYS,
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

// ⟳ 2026-09-07 — UNE RECETTE SE CUISINE UNE FOIS DANS LA FENÊTRE. Mesuré: trois
// casseroles de muffins aux œufs (lundi, mercredi, vendredi), six matins
// identiques, « never three days in a row » respecté à la lettre par un
// renommage. La règle nomme l'échappatoire et compte les petits-déjeuners.
Deno.test("⛔ une recette n'est cuisinée qu'une fois dans la fenêtre — dit avec la ligne des lots", () => {
  const week = buildMealPrompt({ ...BASE, scope: "several_days", daysToFill: ["mon", "tue", "wed", "thu", "fri", "sat"] } as never).userMessage;
  assert(week.includes("a recipe is cooked ONCE in the stretch"), week);
  assert(week.includes("no two cooking sessions make the same preparation"), week);
  // L'ÉCHAPPATOIRE MESURÉE EST NOMMÉE, et les petits-déjeuners comptent.
  assert(week.includes("renaming it by its day"), week);
  assert(week.includes("Breakfasts count like any other meal"), week);
  // ET LE LOT RESTE LE GESTE VOULU: la phrase des lots précède, intacte.
  assert(week.indexOf("must therefore come from BATCHES") < week.indexOf("a recipe is cooked ONCE"), week);
  // LE CAS QUI PASSE: sur UN jour, il n'y a pas de fenêtre à varier — pas de ligne.
  const day = buildMealPrompt({ ...BASE, scope: "day" } as never).userMessage;
  assert(!day.includes("a recipe is cooked ONCE"), day);
});

