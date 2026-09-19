import { assert, assertEquals } from "jsr:@std/assert@1";
import { dishDedupeIssue, foldDuplicateDishes } from "./plan_dish_dedupe.ts";

const plat = (day: string | null, slot: string | null, memberId: string | null, title: string) => ({
  day,
  slot,
  memberId,
  title,
});

Deno.test("deux plats de TABLE sur une case : le premier reste, le second est nommé", () => {
  const r = foldDuplicateDishes([
    plat("mon", "snack_pm", null, "Yaourt et fruit"),
    plat("mon", "snack_pm", null, "Compote et amandes"),
    plat("tue", "snack_pm", null, "Fromage blanc"),
  ]);
  assertEquals(r.dishes.map((d) => d.title), ["Yaourt et fruit", "Fromage blanc"]);
  assertEquals(r.dropped, [{
    index: 1,
    day: "mon",
    slot: "snack_pm",
    memberId: null,
    title: "Compote et amandes",
    keptTitle: "Yaourt et fruit",
  }]);
  assertEquals(
    dishDedupeIssue(r.dropped[0]),
    'dishes[1]: second table dish on mon/snack_pm ("Compote et amandes") -- folded, "Yaourt et fruit" kept',
  );
});

Deno.test("deux plats de la MÊME bouche sur une case : même règle ; un plat de table à côté n'est pas touché", () => {
  // Mesuré le 2026-09-19 : `wed/lunch: T,fabrice,fabrice`.
  const r = foldDuplicateDishes([
    plat("wed", "lunch", null, "Table"),
    plat("wed", "lunch", "fabrice", "Le sien"),
    plat("wed", "lunch", "fabrice", "Le sien, bis"),
  ]);
  assertEquals(r.dishes.map((d) => d.title), ["Table", "Le sien"]);
  assertEquals(r.dropped.length, 1);
  assertEquals(r.dropped[0].memberId, "fabrice");
  assertEquals(dishDedupeIssue(r.dropped[0]).startsWith("dishes[2]: second member fabrice dish on wed/lunch"), true);
});

Deno.test("LE CAS QUI PASSE — la table et une bouche sur la même case ne sont pas un doublon", () => {
  const r = foldDuplicateDishes([
    plat("fri", "dinner", null, "Table"),
    plat("fri", "dinner", "fabrice", "Le sien"),
    plat("fri", "dinner", "thomas", "Le sien à lui"),
  ]);
  assertEquals(r.dishes.length, 3);
  assertEquals(r.dropped, []);
});

Deno.test("un plat sans jour ou sans moment n'est JAMAIS plié : c'est le parseur qui le situe", () => {
  const r = foldDuplicateDishes([
    plat(null, "breakfast", null, "Toute la fenêtre"),
    plat(null, "breakfast", null, "Toute la fenêtre, bis"),
    plat("mon", null, null, "La journée"),
    plat("mon", null, null, "La journée, bis"),
  ]);
  assertEquals(r.dishes.length, 4);
  assertEquals(r.dropped, []);
});

Deno.test("l'ORDRE est le seul départage, et il est stable : le même plan replié ne bouge plus", () => {
  const entree = [
    plat("sat", "lunch", null, "A"),
    plat("sat", "lunch", null, "B"),
  ];
  const une = foldDuplicateDishes(entree);
  const deux = foldDuplicateDishes(une.dishes);
  assertEquals(une.dishes.map((d) => d.title), ["A"]);
  assertEquals(deux.dishes, une.dishes);
  assertEquals(deux.dropped, []);
});

Deno.test("⛔ CÂBLAGE — le pli tourne en tête de CHAQUE tour, avant l'instantané de la candidate", async () => {
  // Sans ça, un doublon rendu par une RÉPARATION empoisonnerait l'adresse du
  // tour suivant exactement comme celui du premier jet a empoisonné le sien.
  const src = await Deno.readTextFile(
    new URL("../../generate-household-meal-v1/index.ts", import.meta.url),
  );
  const pli = src.indexOf("foldDuplicateDishes(meal.dishes)");
  const instantane = src.indexOf("const c4Entry: typeof meal = structuredClone(meal);");
  const tete = src.indexOf("for (let c4Round = 0;; c4Round++) {");
  assert(pli > 0, "le pli n'est plus appelé");
  assert(tete > 0 && tete < pli && pli < instantane, "le pli doit vivre dans le tour, avant `c4Entry`");
  assert(src.includes("keel.household_meal.duplicate_dish_folded"), "un pli muet est un pli qu'on ne peut pas compter");
});
