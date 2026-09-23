/**
 * 2026-09-20 — le pli des blancs d'œufs est câblé APRÈS la datation des
 * courses (les vagues existent) et AVANT la garde finale (elle relit la liste
 * pliée), avec un journal qui s'écrit même sans blancs.
 */
import { assert } from "jsr:@std/assert@1";

const HANDLER = await Deno.readTextFile(
  new URL("../../generate-household-meal-v1/index.ts", import.meta.url),
);

Deno.test("le pli des œufs vit entre la datation des courses et la garde finale", () => {
  const redated = HANDLER.indexOf('tag: "keel.household_meal.shopping_redated"');
  const fold = HANDLER.indexOf("const eggFold = foldEggWhitesIntoEggs({");
  const gate = HANDLER.indexOf('tag: "keel.household_meal.final_gate"');
  const payload = HANDLER.indexOf("shopping_list: mealShoppingPayload(meal)");
  assert(redated > 0 && fold > 0 && gate > 0 && payload > 0, "un des quatre sites a disparu");
  assert(redated < fold, "le pli précède la datation : les vagues n'existent pas encore");
  assert(fold < gate, "la garde finale ne relit pas la liste pliée");
  assert(fold < payload, "la charge utile part avant le pli");
});

Deno.test("le poids d'un blanc vient du référentiel, et le journal est toujours écrit", () => {
  const fold = HANDLER.indexOf("const eggFold = foldEggWhitesIntoEggs({");
  const before = HANDLER.slice(fold - 600, fold);
  assert(before.includes("ref: EGG_WHITE_REF,"), "le poids n'est pas lu sur `egg_white`");
  assert(before.includes(".ref?.unitGrams ?? null"), "le poids ne vient pas de `unit_grams`");
  assert(HANDLER.includes('tag: "keel.household_meal.shopping_eggs"'));
  assert(HANDLER.includes("meal.shopping_list = eggFold.lines;"));
});
