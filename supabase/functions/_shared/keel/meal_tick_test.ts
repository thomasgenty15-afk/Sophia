import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { MEAL_UNTICK_REASON, mealTickKey } from "./meal_tick.ts";

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
  // La table contraint disqualified_reason IN ('not_food','food_not_eaten',
  // 'unreadable'). Un motif inventé ferait échouer chaque décochage.
  assertEquals(MEAL_UNTICK_REASON, "food_not_eaten");
});
