/**
 * ⟳ 2026-09-25 — LA FENÊTRE DU FRIGO DITE AU MODÈLE EST CELLE DU CODE (v43).
 *
 * « Cooked on Thursday means eaten by Sunday » partait pendant que
 * `cookedWindowVerdict` (`gap >= MAX_FRIDGE_DAYS`) jetait le plat du dimanche:
 * 24 plats écartés sur 8 plans. Le nombre de la consigne (`PROMPT_FRIDGE_DAYS`)
 * ne peut pas importer `MAX_FRIDGE_DAYS` (import circulaire, évaluation au
 * chargement): ce test les tient égaux.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import { MAX_FRIDGE_DAYS } from "./meal_budget.ts";
import {
  keepingWindowLine,
  MEAL_PROMPT_SECTIONS,
  PROMPT_FRIDGE_DAYS,
} from "./meal_prompt_text.ts";
import { cookedWindowVerdict } from "./fridge_window.ts";

Deno.test("le nombre de la consigne est celui du code", () => {
  assertEquals(PROMPT_FRIDGE_DAYS, MAX_FRIDGE_DAYS);
});

Deno.test("la phrase dit le dernier jour que le code accepte, et pas un de plus", () => {
  const text = MEAL_PROMPT_SECTIONS.find((s) => s.key === "keeping_window")!.text.replace(/\s+/g, " ");
  assert(text.includes("Cooked on Thursday means eaten by Saturday"), text);
  assert(!text.includes("by Sunday"), text);
  // Jeudi = rang 0: samedi (rang 2) passe, dimanche (rang 3) est jeté.
  assertEquals(cookedWindowVerdict(0, 2, MAX_FRIDGE_DAYS), "within");
  assertEquals(cookedWindowVerdict(0, 3, MAX_FRIDGE_DAYS), "too_late");
});

Deno.test("la phrase suit le nombre (littéraux, pas la constante)", () => {
  assertEquals(
    keepingWindowLine(3).replace(/\s+/g, " "),
    "A cooked batch is eaten on the day it is cooked or on one of the next two days. Cooked on Thursday means eaten by Saturday, and that is the end of it.",
  );
  assert(keepingWindowLine(4).includes("eaten by Sunday"));
  assert(keepingWindowLine(1).includes("on the day it is cooked. Cooked on\nThursday means eaten by Thursday"));
});
