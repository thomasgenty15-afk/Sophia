import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  MEAL_UNTICK_REASON,
  MEAL_UNTICK_REASONS,
  mealTickKey,
  parseMealUntickReason,
} from "./meal_tick.ts";

Deno.test("la clé est stable, et distincte par position", () => {
  assertEquals(mealTickKey("m-1", 0), "meal_tick:m-1:0");
  assertEquals(mealTickKey("m-1", 3), "meal_tick:m-1:3");
  // Deux jours peuvent porter le MÊME plat en lot: les cocher reste deux
  // gestes distincts, donc la clé ne peut pas être le titre.
  assertEquals(mealTickKey("m-1", 1) === mealTickKey("m-1", 2), false);
});

Deno.test("une identité impossible jette au lieu de produire une clé molle", () => {
  // R7: une clé fabriquée sur du vide ferait collisionner toutes les coches
  // d'un élève sur une seule ligne, en silence.
  assertThrows(() => mealTickKey("", 0));
  assertThrows(() => mealTickKey("   ", 0));
  assertThrows(() => mealTickKey("m-1", -1));
  assertThrows(() => mealTickKey("m-1", 1.5));
});

Deno.test("le motif de décochage est celui que la CHECK accepte", () => {
  // La table contraint disqualified_reason. Un motif inventé ferait échouer
  // chaque décochage.
  assertEquals(MEAL_UNTICK_REASON, "food_not_eaten");
});

Deno.test("FF-057 §3.A — la décoche nue, plus les trois motifs du formulaire", () => {
  // L'ORDRE EST GELÉ: la CHECK de `20260818170000` et le miroir du front
  // (`frontend/src/keel/api/mealTicks.ts`) portent la même liste, et
  // `mealTicks.int.test.ts` relit CE fichier pour le prouver.
  assertEquals([...MEAL_UNTICK_REASONS], [
    "food_not_eaten",
    "ordered",
    "no_time",
    "ate_other",
  ]);
  // La décoche NUE fait partie de la liste: elle précède le formulaire et
  // survit à son oubli (fiche §7). La retirer rendrait obligatoire de répondre.
  assertEquals(MEAL_UNTICK_REASONS.includes(MEAL_UNTICK_REASON), true);
});

Deno.test("un motif hors liste rend null, JAMAIS un repli sur la décoche nue", () => {
  for (const reason of MEAL_UNTICK_REASONS) {
    assertEquals(parseMealUntickReason(reason), reason);
  }
  // ⚠️ LES DEUX VERDICTS DE PHOTO SONT REFUSÉS ICI, alors que la colonne les
  // accepte: ils portent sur une IMAGE, pas sur une case cochée à la main.
  assertEquals(parseMealUntickReason("not_food"), null);
  assertEquals(parseMealUntickReason("unreadable"), null);
  // Un repli sur `food_not_eaten` fabriquerait une décoche muette là où la
  // personne avait dit pourquoi, et personne ne verrait la différence.
  assertEquals(parseMealUntickReason("cheat_meal"), null);
  assertEquals(parseMealUntickReason(""), null);
  assertEquals(parseMealUntickReason(null), null);
  assertEquals(parseMealUntickReason(undefined), null);
  assertEquals(parseMealUntickReason(42), null);
  // Un motif entouré d'espaces est le MÊME motif — une charge de bouton relue
  // n'est pas toujours propre.
  assertEquals(parseMealUntickReason("  no_time  "), "no_time");
});
