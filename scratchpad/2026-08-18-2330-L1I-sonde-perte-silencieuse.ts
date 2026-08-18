// SONDE DU LOT 1I — LA PERTE SILENCIEUSE, REJOUÉE.
//
// Rejeu de la sonde du vérificateur, sur le module CORRIGÉ.
//
//   $ cd frontend && npx vite-node ../scratchpad/2026-08-18-2330-L1I-sonde-perte-silencieuse.ts
//
// Ce qu'elle mesure: la CHARGE UTILE envoyée à `keel_write_retained_items`.
// Le défaut ne se voyait ni à la lecture ni à l'écran — il se voyait là, parce
// que la RPC remplace la CLÉ ENTIÈRE et que la charge utile était composée
// depuis les seules lignes PARSÉES.
//
// AVANT correctif: STOCKÉ 2 → ÉCRIT 1 (durable), NEXT_PLAN STOCKÉ 2 → ÉCRIT 1.
// APRÈS:          STOCKÉ 2 → ÉCRIT 2 sur les deux magasins.

import {
  knownStoreFrom,
  NEXT_PLAN_ITEMS_KEY,
  RETAINED_ITEMS_KEY,
  writePortArgsFor,
} from "../frontend/src/keel/api/retainedItems";

const DAY = "2026-08-18";
const MEMORY = "3f2b1a90-0000-4000-8000-0000000000aa";

/** Une ligne du memorizer. `portion.adjust` lui est INTERDIT: refusée à la lecture. */
const lisible = {
  kind: "food.exclude",
  scope: "durable",
  subject: "household",
  text: "les rochers coco",
  value: null,
  source: "conversation",
  at: DAY,
  item: MEMORY,
  confidence: 0.82,
};
const illisible = { ...lisible, kind: "portion.adjust", value: { direction: "down", magnitude: "clear" } };

const craving = {
  kind: "craving",
  scope: "next_plan",
  subject: "household",
  text: "des fajitas",
  value: null,
  source: "written",
  at: DAY,
  item: "",
  confidence: null,
};

const pc: Record<string, unknown> = {
  [RETAINED_ITEMS_KEY]: [lisible, illisible],
  [NEXT_PLAN_ITEMS_KEY]: [
    { item: craving, anchor: "2026-08-24" },
    { item: craving, anchor: "pas-un-jour" },
  ],
  food_preferences: ["  Travaille de nuit 3× / semaine.  "],
};

const store = knownStoreFrom(pc, true);

// LE GESTE: retirer l'ancienne note. Il ne parle d'AUCUN item, et c'est le
// point — n'importe quel geste effaçait les lignes illisibles.
const args = writePortArgsFor({
  store,
  items: store.items,
  nextPlan: store.nextPlan,
  notes: { legacyNotes: [], legacyOrigin: {} },
});

const stockeItems = (pc[RETAINED_ITEMS_KEY] as unknown[]).length;
const ecritItems = (args.p_items as unknown[]).length;
const stockeNext = (pc[NEXT_PLAN_ITEMS_KEY] as unknown[]).length;
const ecritNext = (args.p_next as unknown[]).length;

console.log(`STOCKÉ: ${stockeItems} → ÉCRIT: ${ecritItems}`);
console.log(`NEXT_PLAN STOCKÉ: ${stockeNext} → ÉCRIT: ${ecritNext}`);
console.log(`  lu par l'écran (durable)  : ${store.items.length}`);
console.log(`  refusé à la lecture       : ${store.refused.total}`);
console.log(`  gardé tel quel (opaque)   : ${store.opaqueItems.length}`);
console.log(
  `  la ligne opaque réémise TELLE QUELLE: ${
    JSON.stringify((args.p_items as unknown[])[1]) === JSON.stringify(illisible)
  }`,
);

// DÉFAUT 2 — les trois `expected` sont du jsonb BRUT.
console.log(`p_expected_notes ENVOYÉ  : ${JSON.stringify(args.p_expected_notes)}`);
console.log(`  (la liste reconstruite serait: ${JSON.stringify(store.legacyNotes)})`);
console.log(
  `  BRUT ≠ reconstruit       : ${
    JSON.stringify(args.p_expected_notes) !== JSON.stringify(store.legacyNotes)
  }`,
);

const ok = ecritItems === 2 && ecritNext === 2 &&
  JSON.stringify(args.p_expected_notes) === JSON.stringify(pc.food_preferences);
console.log(ok ? "\nSONDE VERTE" : "\nSONDE ROUGE");
if (!ok) process.exit(1);
