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

// ⟳ LOT C (2026-09-04) — QUAND LE PLAN PORTE DÉJÀ SES DATES, ON LES LIT.
//
// ⛔ CE N'EST PAS UNE RÈGLE DE PLUS, C'EST L'ARRÊT D'UN SECOND CALCUL. Depuis
// que la cadence de courses REPLIE les vagues (`runs`, `freezer`), l'écran ne
// peut plus les recalculer: il ne connaît ni le style ni le nombre de courses,
// donc il rendrait DEUX vagues là où le serveur en a écrit UNE — et chaque
// ligne porterait quand même la date repliée. Deux vérités dans le même
// panneau.
//
// La ligne, elle, porte la réponse: `buy_on` est posé par la lane à partir du
// module serveur, `freeze_on_purchase` avec. Les grouper N'EST PAS une règle,
// c'est une lecture — le fichier peut donc le faire sans redevenir un jumeau.
//
// `null` quand une seule ligne n'a pas sa date: on retombe alors sur le calcul,
// qui est le comportement d'avant ce lot pour tout plan écrit avant lui.
function assignmentsFromWrittenLines(
  shoppingList: readonly ShoppingItem[],
): WaveAssignment[] | null {
  if (shoppingList.length === 0) return null;
  const byDate = new Map<string, { indices: number[]; freezeIndices: number[] }>();
  for (let at = 0; at < shoppingList.length; at++) {
    const line = shoppingList[at];
    const date = line.buy_on;
    // ⛔ `typeof !== "string"` ET PAS `=== null`. Le type dit `string | null`,
    // la charge du réseau dit ce qu'elle veut: un plan écrit avant que le champ
    // n'existe rend `undefined`, et un `=== null` l'aurait laissé passer — la
    // liste se serait alors groupée sous une clé `undefined`, c'est-à-dire une
    // seule vague sans date. Mesuré: deux tests d'écran rouges, tous deux avec
    // `buyOn: undefined`.
    if (typeof date !== "string" || date === "") return null;
    const bucket = byDate.get(date) ?? { indices: [], freezeIndices: [] };
    bucket.indices.push(at);
    if (line.freeze_on_purchase) bucket.freezeIndices.push(at);
    byDate.set(date, bucket);
  }
  const dates = [...byDate.keys()].sort();
  return dates.map((buyOn) => ({
    buyOn,
    // ⚠️ LA PHRASE NE SE RECONSTRUIT PAS ICI. « pour la cuisson de jeudi » vient
    // du calcul, et la ligne ne la porte pas. `null` sur toutes les vagues est
    // honnête: on n'invente pas une cuisson qu'on n'a pas lue.
    servesCookOn: null,
    indices: byDate.get(buyOn)!.indices,
    freezeIndices: byDate.get(buyOn)!.freezeIndices,
  }));
}

export function planGroceryWaves(args: ScreenWaveArgs): GroceryWave<ShoppingItem>[] {
  return planWaves({
    startsOn: args.startsOn,
    durationDays: args.durationDays,
    shoppingList: args.shoppingList,
    preparations: wavePreparationsFromRows(args.preparations),
    // ⛔ L'ÉCRAN NE DÉCLARE PAS DE CADENCE. Il n'a lu ni le style ni le nombre
    // de courses; `null` dit « je ne sais pas », et le module ne replie rien —
    // exactement comme avant ce lot. Le repli est fait UNE fois, côté serveur.
    runs: null,
    freezer: false,
  });
}

export function waveAssignments(args: ScreenWaveArgs): WaveAssignment[] {
  const written = assignmentsFromWrittenLines(args.shoppingList);
  if (written !== null) return written;
  return assignWaves({
    startsOn: args.startsOn,
    durationDays: args.durationDays,
    shoppingList: args.shoppingList,
    preparations: wavePreparationsFromRows(args.preparations),
    runs: null,
    freezer: false,
  });
}
