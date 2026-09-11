import { assert, assertEquals } from "jsr:@std/assert@1";

import { LIGHT_BEARING_SLOTS, slotBearsLight } from "./meal_extras.ts";
import { LIGHT_SLOT_WEIGHT, SLOT_DAY_WEIGHT } from "./mouth_anchor.ts";

// ===========================================================================
// ⟳ 2026-09-10 — LES EXTRAS SONT SUPPRIMÉS, ET CE FICHIER GARDE LEUR ABSENCE
//
// ⛔ CE QUI VIVAIT ICI: dix-huit cas sur `MEAL_EXTRAS`, `EXTRA_PORTION`,
// `extrasOf`, `UNANSWERED_EXTRAS_KCAL` et `resolveSlotExtras` — la réservation
// d'énergie pour du pain, du fromage ou un dessert pris HORS PLAN. Décision
// produit: le plan dimensionne les aliments qu'il prévoit, et rien d'autre.
//
// ⚠️ CE QUI RESTE EST « LE REPAS LÉGER », et ce n'est PAS la même question: il
// déplace la part d'un moment DANS le plan au lieu de réserver à côté.
// ===========================================================================

Deno.test("⛔ AUCUN SYMBOLE D'EXTRA NE SURVIT DANS LE MODULE", () => {
  // ⚠️ UNE ÉPREUVE D'ABSENCE, PAS UN IMPORT. Importer un symbole supprimé ne
  // compile pas — donc aucun test ne pourrait dire « il est bien parti ». On
  // relit la source, comme le dépôt le fait déjà pour les listes-gardes.
  const src = Deno.readTextFileSync(
    new URL("./meal_extras.ts", import.meta.url),
  );
  // Les identifiants exportés, pas les mots: le pavé d'en-tête RACONTE la
  // suppression et doit pouvoir les nommer.
  for (const token of [
    "export const MEAL_EXTRAS",
    "export const EXTRA_BEARING_SLOTS",
    "export const EXTRA_PORTION",
    "export const MEAL_EXTRAS_SOURCES",
    "export const UNANSWERED_EXTRAS_KCAL",
    "export function extrasOf",
    "export function extraNutrients",
    "export function resolveSlotExtras",
    "export function slotBearsExtras",
  ]) {
    assert(!src.includes(token), `« ${token} » est revenu dans meal_extras.ts`);
  }
});

Deno.test("le léger porte TROIS moments, et pas les collations", () => {
  assertEquals([...LIGHT_BEARING_SLOTS], ["breakfast", "lunch", "dinner"]);
  for (const slot of LIGHT_BEARING_SLOTS) assert(slotBearsLight(slot));
  // Une collation pèse déjà 0,10 de la journée: la marquer légère demanderait
  // au plan de composer ~40 kcal, c'est-à-dire rien, servi comme une décision.
  for (const slot of ["snack_am", "snack_pm", "before_bed", "snack"]) {
    assert(!slotBearsLight(slot), `${slot} ne devrait pas porter le léger`);
  }
});

Deno.test("⛔ CHAQUE MOMENT MARQUABLE A UN POIDS, ET IL EST PLUS PETIT", () => {
  // Un moment marquable sans poids serait une case qui ne fait rien; un poids
  // sans case, un poids que rien n'atteint.
  assertEquals(
    [...LIGHT_BEARING_SLOTS].sort(),
    Object.keys(LIGHT_SLOT_WEIGHT).sort(),
  );
  for (const slot of LIGHT_BEARING_SLOTS) {
    const light = LIGHT_SLOT_WEIGHT[slot as keyof typeof LIGHT_SLOT_WEIGHT];
    const usual = SLOT_DAY_WEIGHT[slot as keyof typeof SLOT_DAY_WEIGHT];
    assert(light < usual, `${slot}: ${light} n'est pas sous ${usual}`);
  }
});
