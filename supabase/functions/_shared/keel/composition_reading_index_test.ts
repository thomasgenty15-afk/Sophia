/**
 * ══════════════════════════════════════════════════════════════════════════
 * LA RELECTURE — le même plan doit rendre le même nombre (2026-09-09).
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── LE DÉFAUT QUE CE FICHIER TIENT, MESURÉ SUR UN COMPTE RÉEL ────────────
 * Plan `4d78e95c` (2026-09-08): `emmental râpé` rempli par le sas à 353
 * kcal/100 g À LA GÉNÉRATION — la colonne `composition_energy_sources` du plan
 * porte `model: 0,013` — et `unknown_ingredient` À CHAQUE LECTURE, parce que
 * `loadCompositionIndex` ne lit que `food_composition_refs` et
 * `food_composition_aliases`. Le plan était composé sur un index et relu sur
 * un autre. 79 plans sur 116 portaient au moins un terme inconnu.
 *
 * ── ⛔ CE QUE CHAQUE CAS DÉFEND, ET POURQUOI AUCUN NE SUFFIT SEUL ─────────
 *   ① NOMINAL       — le sas connaît le terme du plan ⇒ il se résout.
 *   ② ⛔ LE CAS QUI DISCRIMINE — sas VIDE ⇒ l'index est l'objet de base, à
 *      l'identité près. Sans lui, « rendre un index quoi qu'il arrive »
 *      passerait ①.
 *   ③ ⛔ LA BORNE EST LE PLAN — on ne demande QUE les termes que ce plan ne
 *      sait pas lire. C'est ce qui sépare une relecture d'une promotion: une
 *      valeur qui voyagerait vers un plan qui n'a jamais vu le terme serait
 *      promue sans ses trois observations.
 *   ④ ⛔ `group_bounds` NE REPASSE JAMAIS — un milieu de bande est une
 *      convention posée pour LE plan qui l'a posée, et son coût vit dans
 *      `residualKcal`. Le relire ailleurs ferait voyager une convention sans
 *      son résidu, c'est-à-dire une convention déguisée en mesure.
 *   ⑤ ⛔ UNE LIGNE PROMUE NE REPASSE PAS — elle vit dans le référentiel.
 *   ⑥ ⛔ AUCUN ALIAS — `byAlias` est le MÊME OBJET en sortie qu'en entrée.
 *   ⑦ ⛔ AUCUN MATCHER — le sas dit `lait`, le plan dit `laitue`: seule
 *      l'égalité de clé compare. Contre-épreuve incluse.
 *   ⑧ ⛔ VOCABULAIRE FERMÉ ET GARDE ABSOLUE — groupe hors `FOOD_GROUP_REFS`,
 *      classe de rendement inconnue, énergie au-dessus du plafond: jetés.
 *   ⑨ ⛔ ELLE NE LÈVE JAMAIS — client sans `from`, erreur PostgREST, lecture
 *      qui `throw`, charge illisible: tous rendent le comportement d'AVANT.
 *   ⑩ LA REQUÊTE EST CELLE QU'ON CROIT — table, colonnes, termes demandés.
 *
 * PURE: aucun appel de modèle, aucune base. Le client est faux.
 */
import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import {
  buildCompositionIndex,
  type CompositionRef,
  resolveIngredient,
} from "./food_composition.ts";
import { filledFromPendingRow } from "./composition_fill.ts";
import {
  indexForReading,
  loadPendingFills,
  PENDING_BY_FORM_VIEW,
  type PendingDbClient,
} from "./composition_fill_io.ts";

function ref(over: Partial<CompositionRef> & { slug: string }): CompositionRef {
  return {
    foodGroupRef: "non_starchy_veg",
    label: over.slug,
    source: "ciqual",
    energyKcal: 100,
    proteinG: 2,
    carbsG: 10,
    fatG: 1,
    fiberG: 2,
    omega3Marine: false,
    ironSource: false,
    calciumSource: false,
    iodineSource: false,
    zincSource: false,
    b12Source: false,
    folateSource: false,
    yieldClass: "neutral",
    yieldFactor: null,
    atwaterDiscount: 1,
    energyDense: false,
    unitGrams: null,
    condimentGrams: null,
    ...over,
  };
}

// ⛔ `lait` EXISTE — c'est ce qui rend le cas ⑦ réel.
const BASE = buildCompositionIndex([
  ref({ slug: "lait", foodGroupRef: "dairy_yogurt", energyKcal: 64 }),
  ref({ slug: "pommes_de_terre", foodGroupRef: "starchy_veg", energyKcal: 80 }),
], []);

/** La ligne du sas telle que PostgREST la rend, colonnes en snake_case. */
function pendingRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  const row: Record<string, unknown> = {
    term: "emmental rape",
    food_group_ref: "dairy_cheese",
    energy_kcal: 353,
    protein_g: 25,
    carbs_g: 0.5,
    fat_g: 27.5,
    fiber_g: 0,
    yield_class: "veg_shrinks",
    fill_source: "model",
    status: "pending",
    ...over,
  };
  // ⟳ 2026-09-10 — LA LECTURE PASSE PAR `food_composition_pending_by_form`, qui
  // rend la ligne SOUS LE NOM par lequel on l'a trouvée. Une ligne sans forme
  // de surface est son propre nom, et c'est le défaut ici.
  return { form: row.term, ...row };
}

interface FakeCall {
  table: string;
  columns: string;
  column: string;
  values: readonly string[];
}

interface FakeDb extends PendingDbClient {
  calls: FakeCall[];
}

function fakeDb(opts: {
  rows?: unknown;
  readError?: unknown;
  readThrows?: boolean;
  noFrom?: boolean;
} = {}): FakeDb {
  const calls: FakeCall[] = [];
  const db: FakeDb = {
    calls,
    // deno-lint-ignore require-await
    rpc: async () => ({ error: null }),
  };
  if (!opts.noFrom) {
    db.from = (table: string) => ({
      select: (columns: string) => ({
        in: (column: string, values: readonly string[]) => {
          calls.push({ table, columns, column, values: [...values] });
          if (opts.readThrows) throw new Error("boom");
          return Promise.resolve({
            data: opts.rows ?? [],
            error: opts.readError ?? null,
          });
        },
      }),
    });
  }
  return db;
}

const PLAN = [
  { term: "pommes de terre", amount: 480, unit: "g" as const },
  { term: "emmental râpé", amount: 95, unit: "g" as const },
];

// ---------------------------------------------------------------------------

Deno.test("① le sas connaît le terme du plan, et le plan sait le lire", async () => {
  // ⛔ LA PRÉMISSE, ARMÉE: sans elle, ce test passerait sur un index qui
  // résolvait déjà — une garde qui n'a jamais rien gardé.
  assertEquals(resolveIngredient(BASE, "emmental râpé"), null);

  const db = fakeDb({ rows: [pendingRow()] });
  const out = await indexForReading({ db, baseIndex: BASE, inputs: PLAN });

  assertEquals(out.asked, 1);
  assertEquals(out.kept, 1);
  const hit = resolveIngredient(out.index, "emmental râpé");
  assert(hit !== null);
  assertEquals(hit.energyKcal, 353);
  // La valeur RELUE est celle de la génération, pas une voisine.
  assertEquals(hit.source, "model");
});

Deno.test("② sas vide ⇒ l'index de base, au MÊME OBJET près", async () => {
  const db = fakeDb({ rows: [] });
  const out = await indexForReading({ db, baseIndex: BASE, inputs: PLAN });
  assertEquals(out.asked, 1);
  assertEquals(out.kept, 0);
  assertStrictEquals(out.index, BASE);
  assertEquals(resolveIngredient(out.index, "emmental râpé"), null);
});

Deno.test("③ la borne est le plan: on ne demande que ce qu'il ne sait pas lire", async () => {
  const db = fakeDb({ rows: [pendingRow()] });
  await indexForReading({ db, baseIndex: BASE, inputs: PLAN });
  assertEquals(db.calls.length, 1);
  // `pommes de terre` résout déjà: il n'est PAS demandé. C'est ce qui rend la
  // relecture bornée au plan plutôt qu'à la table.
  assertEquals(db.calls[0].values, ["emmental rape"]);
});

Deno.test("③bis un plan dont tout résout ne lit rien du tout", async () => {
  const db = fakeDb({ rows: [pendingRow()] });
  const out = await indexForReading({
    db,
    baseIndex: BASE,
    inputs: [{ term: "pommes de terre", amount: 480, unit: "g" }],
  });
  assertEquals(db.calls.length, 0);
  assertEquals(out.asked, 0);
  assertStrictEquals(out.index, BASE);
});

Deno.test("④ ⛔ une ligne `group_bounds` ne repasse jamais par la lecture", async () => {
  const db = fakeDb({ rows: [pendingRow({ fill_source: "group_bounds" })] });
  const out = await indexForReading({ db, baseIndex: BASE, inputs: PLAN });
  assertEquals(out.kept, 0);
  assertEquals(resolveIngredient(out.index, "emmental râpé"), null);
  // Contre-épreuve: la MÊME ligne en `model` passe. Sans elle, un refus
  // universel passerait ce test.
  assertEquals(filledFromPendingRow(pendingRow())?.source, "model");
});

Deno.test("⑤ ⛔ `promoted` et `rejected` ne repassent pas, `needs_review` si", async () => {
  for (const status of ["promoted", "rejected"]) {
    const db = fakeDb({ rows: [pendingRow({ status })] });
    const out = await indexForReading({ db, baseIndex: BASE, inputs: PLAN });
    assertEquals(out.kept, 0, `statut ${status}`);
    assertEquals(resolveIngredient(out.index, "emmental râpé"), null);
  }
  // ⛔ LA CONTRE-ÉPREUVE, ET ELLE PORTE TOUT LE SENS DE `rejected`.
  // `needs_review` passe: une garde a mordu sur sa PROMOTION, pas sur son
  // usage par le plan qui la cite. Sans ce cas, « ne rien relire » passerait
  // les deux premiers, et `rejected` n'aurait aucune raison d'exister.
  const db2 = fakeDb({ rows: [pendingRow({ status: "needs_review" })] });
  assertEquals((await indexForReading({ db: db2, baseIndex: BASE, inputs: PLAN })).kept, 1);
});

Deno.test("⑥ ⛔ aucun alias: `byAlias` est le MÊME OBJET", async () => {
  const db = fakeDb({ rows: [pendingRow()] });
  const out = await indexForReading({ db, baseIndex: BASE, inputs: PLAN });
  assertStrictEquals(out.index.byAlias, BASE.byAlias);
});

Deno.test("⑦ ⛔ aucun matcher: `lait` ne peut pas atteindre `laitue`", async () => {
  const db = fakeDb({ rows: [pendingRow({ term: "lait", food_group_ref: "dairy_yogurt" })] });
  const out = await indexForReading({
    db,
    baseIndex: BASE,
    inputs: [{ term: "laitue", amount: 60, unit: "g" }],
  });
  assertEquals(out.kept, 0);
  assertEquals(resolveIngredient(out.index, "laitue"), null);
  // Et `lait` lui-même n'a pas été masqué: le référentiel garde ses 64 kcal.
  assertEquals(resolveIngredient(out.index, "lait")?.energyKcal, 64);
});

Deno.test("⑧ ⛔ vocabulaire fermé et garde absolue", () => {
  assertEquals(filledFromPendingRow(pendingRow({ food_group_ref: "cheeses" })), null);
  assertEquals(filledFromPendingRow(pendingRow({ food_group_ref: null })), null);
  assertEquals(filledFromPendingRow(pendingRow({ yield_class: "melts" })), null);
  assertEquals(filledFromPendingRow(pendingRow({ energy_kcal: 903 })), null);
  assertEquals(filledFromPendingRow(pendingRow({ energy_kcal: -1 })), null);
  assertEquals(filledFromPendingRow(pendingRow({ energy_kcal: "beaucoup" })), null);
  assertEquals(filledFromPendingRow(pendingRow({ term: "" })), null);
  assertEquals(filledFromPendingRow(pendingRow({ term: "x".repeat(81) })), null);
  assertEquals(filledFromPendingRow(null), null);
  // Contre-épreuve: 902 est le plafond, il PASSE. Une borne qui refuse sa
  // propre valeur limite est une borne dont personne ne connaît le sens.
  assertEquals(filledFromPendingRow(pendingRow({ energy_kcal: 902 }))?.ref.energyKcal, 902);
});

Deno.test("⑧bis une macro illisible devient `null`, elle n'annule pas la ligne", () => {
  const f = filledFromPendingRow(pendingRow({ protein_g: null, carbs_g: "", fat_g: -3 }));
  assert(f !== null);
  assertEquals(f.ref.proteinG, null);
  assertEquals(f.ref.carbsG, null);
  assertEquals(f.ref.fatG, null);
  // ⛔ ET AUCUN DRAPEAU DE MICRONUTRIMENT, comme à l'aller: une ligne remplie
  // n'a jamais été dosée.
  assertEquals(f.ref.ironSource, false);
  assertEquals(f.ref.b12Source, false);
  assertEquals(f.ref.unitGrams, null);
  assertEquals(f.ref.condimentGrams, null);
});

Deno.test("⑨ ⛔ les quatre pannes rendent le comportement d'AVANT", async () => {
  for (
    const db of [
      fakeDb({ noFrom: true }),
      fakeDb({ readError: { message: "denied" } }),
      fakeDb({ readThrows: true }),
      fakeDb({ rows: "pas un tableau" }),
    ]
  ) {
    const out = await indexForReading({ db, baseIndex: BASE, inputs: PLAN });
    assertEquals(out.kept, 0);
    assertStrictEquals(out.index, BASE);
    assertEquals(resolveIngredient(out.index, "emmental râpé"), null);
  }
});

Deno.test("⑨bis une ligne qu'on n'a pas demandée est jetée", async () => {
  const db = fakeDb({ rows: [pendingRow({ term: "comte" })] });
  const filled = await loadPendingFills(db, ["emmental rape"]);
  assertEquals(filled.length, 0);
});

Deno.test("⑩ la requête est celle qu'on croit", async () => {
  const db = fakeDb({ rows: [pendingRow()] });
  await loadPendingFills(db, ["emmental rape"]);
  // ⟳ LA VUE, ET LA COLONNE `form`: un plan cite `puree d'amandes` pendant que
  // la valeur vit sous `almond butter`. Interroger `term` ne trouverait que les
  // lignes dont le plan écrit le nom canonique.
  assertEquals(db.calls[0].table, PENDING_BY_FORM_VIEW);
  assertEquals(db.calls[0].column, "form");
  // ⛔ LES COLONNES SONT NOMMÉES. `select *` mettrait `sightings` et
  // `review_reason` à portée d'un calcul d'énergie.
  assert(!db.calls[0].columns.includes("*"));
  for (
    const c of [
      "form",
      "term",
      "label",
      "food_group_ref",
      "energy_kcal",
      "protein_g",
      "carbs_g",
      "fat_g",
      "fiber_g",
      "yield_class",
      "fill_source",
      "status",
    ]
  ) {
    assert(db.calls[0].columns.includes(c), `colonne manquante: ${c}`);
  }
  assert(!db.calls[0].columns.includes("sightings"));
});
