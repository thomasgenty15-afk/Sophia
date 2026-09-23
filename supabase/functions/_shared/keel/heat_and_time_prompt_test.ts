/**
 * 2026-09-20 — CHAQUE ÉTAPE QUI CHAUFFE DIT LA CHALEUR ET LE TEMPS. Mesuré à
 * l'écran : des sessions de cuisine sans température ni durée par étape ; le
 * prompt ne les demandait nulle part (seuls `active_minutes`/`total_minutes`
 * existaient). La règle vit dans HOW LONG THINGS TAKE (clé `minutes`), pas dans une section
 * neuve : la liste des clés et le prompt de réparation restent intacts.
 */
import { assert } from "jsr:@std/assert@1";
import { MEAL_PROMPT_SECTIONS, MEAL_SYSTEM_PROMPT } from "./meal_generation.ts";

Deno.test("la chaleur et le temps par étape sont demandés, dans method ET run_through", () => {
  const section = MEAL_PROMPT_SECTIONS.find((s) => s.key === "minutes");
  assert(section !== undefined, "la section minutes a disparu");
  assert(section.text.includes("Every step that applies heat says the HEAT and the TIME"));
  assert(section.text.includes('in "method" and in\n"run_through" alike'));
  assert(section.text.includes("°C in France and most of the world, °F in the United States"));
  assert(section.text.includes("Roast 25 min at 200 °C"));
  assert(section.text.includes('"cook_fresh" or "reheat_only" dish'));
  assert(MEAL_SYSTEM_PROMPT.includes("Every step that applies heat says the HEAT and the TIME"));
});
