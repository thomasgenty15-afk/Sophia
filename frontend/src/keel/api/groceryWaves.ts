// KEEL — LES VAGUES DE COURSES, côté écran. AUCUNE RÈGLE ICI.
//
// Autorité produit: docs/keel/PIVOT-FOYER.md §3, « la cadence de courses est
// une SORTIE du plan ».
//
// ── CE FICHIER ÉTAIT UN JUMEAU. IL NE L'EST PLUS ──────────────────────────
// Jusqu'au 2026-08-10 il RECOPIAIT l'algorithme de
// `supabase/functions/_shared/keel/grocery_waves.ts` et redéclarait
// `MAX_FRIDGE_DAYS = 3` en dur. Deux définitions d'une même règle physique sont
// une divergence en attente: le jour où le frigo passe à quatre jours, l'une
// des deux ment — et c'est l'écran, jamais relu, qui garde l'ancienne.
//
// L'argument d'alors (« les modules Deno ne sont pas importables par Vite ») ne
// tenait pas à la vérification: la clôture d'imports de `grocery_waves.ts` ne
// contient AUCUN spécificateur `jsr:`/`npm:`/`https:` ni aucun global `Deno.`,
// et `allowImportingTsExtensions` est déjà actif dans `tsconfig.app.json`. Le
// module s'importe tel quel.
//
// ── CE QUE CE FICHIER FAIT ENCORE ─────────────────────────────────────────
// Il RÉEXPORTE, et il branche les types de l'écran (`ShoppingItem`,
// `MealPreparation`, snake_case du JSON) sur la forme du module serveur. La
// conversion elle-même vit côté serveur (`wavePreparationsFromRows`), parce que
// le PDF du frigo et la liste partageable sans compte liront exactement la même
// ligne de base.
//
// SI TU AJOUTES UNE RÈGLE ICI, TU AS RECRÉÉ LE JUMEAU.

import {
  type GroceryWave,
  planGroceryWaves as planWaves,
  type WaveAssignment,
  waveAssignments as assignWaves,
  wavePreparationsFromRows,
} from "../../../../supabase/functions/_shared/keel/grocery_waves.ts";
import type { MealPreparation, ShoppingItem } from "./mealGeneration";

export {
  MAX_FRIDGE_DAYS,
  PERISHABLE_AISLES,
  waveItemCount,
  wavesAreMeaningful,
} from "../../../../supabase/functions/_shared/keel/grocery_waves.ts";
export type {
  GroceryWave,
  WaveAssignment,
} from "../../../../supabase/functions/_shared/keel/grocery_waves.ts";

/** Les entrées telles que l'écran les tient: la ligne de plan, non convertie. */
interface ScreenWaveArgs {
  startsOn: string;
  durationDays: number;
  shoppingList: readonly ShoppingItem[];
  preparations: readonly MealPreparation[];
}

export function planGroceryWaves(args: ScreenWaveArgs): GroceryWave<ShoppingItem>[] {
  return planWaves({
    startsOn: args.startsOn,
    durationDays: args.durationDays,
    shoppingList: args.shoppingList,
    preparations: wavePreparationsFromRows(args.preparations),
  });
}

export function waveAssignments(args: ScreenWaveArgs): WaveAssignment[] {
  return assignWaves({
    startsOn: args.startsOn,
    durationDays: args.durationDays,
    shoppingList: args.shoppingList,
    preparations: wavePreparationsFromRows(args.preparations),
  });
}
