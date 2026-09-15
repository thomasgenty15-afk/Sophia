/**
 * ══════════════════════════════════════════════════════════════════════════
 * L18b — LE REPLI PAR BORNES CESSE D'ÊTRE STRUCTURELLEMENT MORT.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Plan: `scratchpad/2026-08-21-PLAN-DE-MISE-EN-OEUVRE.md`, fiche `L18b`.
 *
 * ── LE DÉFAUT QUE CE FICHIER TIENT ────────────────────────────────────────
 * `fillCompositions` prend son groupe à `answer?.foodGroupRef ?? declaredGroup`.
 * Quand l'appel de secours se TAIT, `answer` est `null`; et `declaredGroup`
 * vient de `DishIngredient.group`, que **0 ligne sur 10 038 ne porte** (mesuré
 * le 2026-08-22). Le repli par bornes — le seul chemin du lot 18 « qui ne peut
 * pas échouer » — n'était donc JAMAIS atteint: le jour où le modèle tombe, le
 * lot 18 ne répare rien.
 *
 * ── ⛔ CE QUE CHAQUE CAS DÉFEND, ET POURQUOI AUCUN NE SUFFIT SEUL ─────────
 *   ① NOMINAL      — modèle muet + sas qui connaît le terme ⇒ le repli MORD
 *   ② ⛔ LE CAS QUI DISCRIMINE — sas qui ne connaît RIEN ⇒ abstention.
 *      Sans lui, « remplir toujours » passerait ①, et le lot serait un
 *      inventeur de nombres déguisé en réparateur.
 *   ③ ⛔ AUCUN MATCHER — le sas connaît `lait`, le plan dit `laitue`:
 *      l'égalité de clé est la SEULE comparaison. 12 faux positifs sur 12
 *      mesurés (`never-hand-roll-a-matcher-here`). Contre-épreuve incluse.
 *   ④ ⛔ AUCUNE VALEUR N'EST REPRISE DU SAS — la ligne remplie porte le
 *      MILIEU DE BANDE et son résidu, jamais l'énergie de la ligne du sas.
 *      Reprendre la valeur, ce serait promouvoir sans les trois observations.
 *   ⑤ ⛔ AUCUN ALIAS — `byAlias` est le MÊME OBJET en sortie qu'en entrée.
 *   ⑥ LA LIGNE DU PLAN GAGNE — le sas comble un `null`, il ne corrige jamais
 *      une déclaration.
 *   ⑦ ⛔ UNE LIGNE ARMÉE PAR LE SAS N'Y RETOURNE PAS COMPTER UN TOUR —
 *      `sightings` décide d'une promotion; un plan où le modèle n'a rien dit
 *      ne certifie rien. Contre-épreuve: un `group_bounds` issu d'une réponse
 *      HORS BANDE, lui, compte.
 *   ⑧ ⛔ ELLE NE LÈVE JAMAIS — client sans `from`, erreur PostgREST, lecture
 *      qui `throw`, charge illisible: tous rendent le comportement d'AVANT.
 *   ⑨ ⛔ VOCABULAIRE FERMÉ — un groupe hors `FOOD_GROUP_REFS` est jeté.
 *   ⑩ LA REQUÊTE EST CELLE QU'ON CROIT — table, colonnes et termes demandés
 *      sont assertés: `select *` mettrait l'énergie du sas à portée du chemin
 *      chaud, et une valeur à portée de main finit par être lue.
 *
 * PURE: aucun appel de modèle, aucune base. Le client et le modèle sont faux.
 */
import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

import {
  buildCompositionIndex,
  type CompositionInput,
  type CompositionRef,
} from "./food_composition.ts";
import {
  type FillAnswer,
  type FillRequest,
  groupBandsFrom,
} from "./composition_fill.ts";
import {
  loadPendingGroups,
  PENDING_TABLE,
  type PendingDbClient,
  repairPlanComposition,
  requestsWithPendingGroups,
} from "./composition_fill_io.ts";
import type { FoodGroupRef } from "./tokens.ts";

// ---------------------------------------------------------------------------
// LE DÉCOR — un référentiel minuscule, mais avec de VRAIES bandes
// ---------------------------------------------------------------------------

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
    atwaterDiscount: 1,
    energyDense: false,
    unitGrams: null,
    condimentGrams: null,
    ...over,
  };
}

const REFS: CompositionRef[] = [
  // `citrus`: bande serrée [28,48] ⇒ milieu 38, demi-largeur 10.
  ref({ slug: "lemon", foodGroupRef: "citrus", energyKcal: 28 }),
  ref({ slug: "lime", foodGroupRef: "citrus", energyKcal: 32 }),
  ref({ slug: "orange", foodGroupRef: "citrus", energyKcal: 40 }),
  ref({ slug: "clementine", foodGroupRef: "citrus", energyKcal: 44 }),
  ref({ slug: "grapefruit", foodGroupRef: "citrus", energyKcal: 48 }),
  // `poultry`: bande large, dominante `meat_shrinks`.
  ref({ slug: "chicken_breast", foodGroupRef: "poultry", energyKcal: 110, yieldClass: "meat_shrinks" }),
  ref({ slug: "chicken_thigh", foodGroupRef: "poultry", energyKcal: 160, yieldClass: "meat_shrinks" }),
  ref({ slug: "turkey_breast", foodGroupRef: "poultry", energyKcal: 130, yieldClass: "meat_shrinks" }),
  ref({ slug: "duck_breast", foodGroupRef: "poultry", energyKcal: 200, yieldClass: "neutral" }),
  // ⛔ `lait` EXISTE DANS LE RÉFÉRENTIEL — c'est ce qui rend le cas ③ réel.
  ref({ slug: "lait", foodGroupRef: "dairy_yogurt", energyKcal: 64 }),
  ref({ slug: "yaourt", foodGroupRef: "dairy_yogurt", energyKcal: 60 }),
  ref({ slug: "fromage_blanc", foodGroupRef: "dairy_yogurt", energyKcal: 75 }),
];

const INDEX = buildCompositionIndex(REFS, []);
const BANDS = groupBandsFrom(INDEX);
const g = (slug: string): FoodGroupRef => slug as FoodGroupRef;

/** Le milieu et la demi-largeur de `citrus`, calculés — jamais recopiés. */
const CITRUS = BANDS.get(g("citrus"))!;
const CITRUS_MID = Math.round(((CITRUS.energyLow + CITRUS.energyHigh) / 2) * 10) / 10;
const CITRUS_RESIDUAL = Math.round(((CITRUS.energyHigh - CITRUS.energyLow) / 2) * 10) / 10;

// ---------------------------------------------------------------------------
// LE FAUX CLIENT — il enregistre CE QU'ON LUI DEMANDE, pas seulement ce qu'il rend
// ---------------------------------------------------------------------------

interface FakeCall {
  table: string;
  columns: string;
  column: string;
  values: readonly string[];
}

interface FakeDb extends PendingDbClient {
  calls: FakeCall[];
  written: Record<string, unknown>[][];
}

function fakeDb(opts: {
  rows?: unknown;
  readError?: unknown;
  readThrows?: boolean;
  noFrom?: boolean;
  writeError?: unknown;
} = {}): FakeDb {
  const calls: FakeCall[] = [];
  const written: Record<string, unknown>[][] = [];
  const db: FakeDb = {
    calls,
    written,
    // deno-lint-ignore require-await
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn === "record_food_composition_sightings") {
        written.push((args.p_rows ?? []) as Record<string, unknown>[]);
      }
      return { error: opts.writeError ?? null };
    },
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

const MODEL_SILENT_META = {
  source: "test.composition_fill",
  requestId: "req-l18b",
  userId: "user-l18b",
};

/**
 * ⛔ LE MODÈLE MUET — `[]`, la valeur que `askCompositionFill` rend sur TOUTE
 * panne: fournisseur en erreur, timeout, sortie illisible.
 *
 * ⚠️ POURQUOI UNE COUTURE ET PAS L'APPEL RÉEL. Sans `--allow-net`, l'appel réel
 * rend bien `[]` — mais en **15 secondes**, le plafond de sa course (mesuré le
 * 2026-08-22 : `askCompositionFill` seul, sans réseau, 15 s et une fuite de
 * minuteur qui vient de `generateWithGemini`, pas de ce module). Onze bancs
 * coûteraient trois minutes à chaque commit, et un banc trop lent finit
 * désactivé. Le chemin réel reste le DÉFAUT du module: aucun appelant de
 * production ne passe `ask`, et le cas ⑪ le prouve.
 */
// deno-lint-ignore require-await
const MUET = async (): Promise<FillAnswer[]> => [];

function input(
  term: string,
  group?: FoodGroupRef | null,
): CompositionInput & { group?: FoodGroupRef | null } {
  return { term, amount: 100, unit: "g", state: "raw", group: group ?? null };
}

// ═══════════════════════════════════════════════════════════════════════════
// ① NOMINAL — modèle muet, sas qui connaît le terme ⇒ LE REPLI MORD
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("L18b ① le sas donne son groupe, le repli par bornes mord", async () => {
  const db = fakeDb({ rows: [{ term: "yuzu", food_group_ref: "citrus" }] });
  const out = await repairPlanComposition({
    db,
    baseIndex: INDEX,
    inputs: [input("yuzu")],
    energyInputs: [input("yuzu")],
    meta: MODEL_SILENT_META,
    ask: MUET,
  });

  assertEquals(out.counts.no_group, 0, "le terme ne doit plus partir en no_group");
  assertEquals(out.counts.group_bounds, 1, "le repli par bornes doit avoir rempli");
  assertEquals(out.counts.sas_group_armed, 1);
  assertEquals(out.unknowns, 1, "④ se mesure sur l'index de BASE, avant tout remplissage");

  const filled = out.index.bySlug.get("yuzu");
  assert(filled, "l'index augmenté doit porter l'aliment neuf");
  assertEquals(filled.foodGroupRef, "citrus");
  assertEquals(filled.source, "group_bounds");
  // ④ LE MILIEU DE BANDE, calculé — jamais la valeur d'une ligne du sas.
  assertEquals(filled.energyKcal, CITRUS_MID);
  assert(CITRUS_RESIDUAL > 0, "une bande à demi-largeur nulle ne prouverait rien");
});

// ═══════════════════════════════════════════════════════════════════════════
// ② ⛔ LE CAS QUI DISCRIMINE — sas vide ⇒ ABSTENTION, comme avant le lot
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("L18b ② sans le sas, le terme s'abstient exactement comme avant", async () => {
  const db = fakeDb({ rows: [] });
  const out = await repairPlanComposition({
    db,
    baseIndex: INDEX,
    inputs: [input("yuzu")],
    energyInputs: [input("yuzu")],
    meta: MODEL_SILENT_META,
    ask: MUET,
  });
  assertEquals(out.counts.no_group, 1);
  assertEquals(out.counts.group_bounds, 0);
  assertEquals(out.counts.sas_group_armed, 0);
  assertEquals(out.index.bySlug.has("yuzu"), false);
  assertStrictEquals(out.index, INDEX, "rien n'est rempli ⇒ l'index de base est rendu tel quel");
});

// ═══════════════════════════════════════════════════════════════════════════
// ③ ⛔ AUCUN MATCHER — `laitue` ne peut pas atteindre `lait`
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("L18b ③ le sas connaît `lait`, le plan dit `laitue`: rien n'est armé", () => {
  const requests: FillRequest[] = [
    { term: "laitue", declaredGroup: null, occurrences: 1 },
  ];
  const known = new Map<string, FoodGroupRef>([["lait", g("dairy_yogurt")]]);
  const armed = requestsWithPendingGroups(requests, known);
  assertEquals(armed.armedTerms.size, 0, "⛔ `laitue` ≠ `lait`, 12 faux positifs sur 12 mesurés");
  assertEquals(armed.requests[0].declaredGroup, null);
});

Deno.test("L18b ③bis contre-épreuve — le sas connaît `laitue`, et là il arme", () => {
  const requests: FillRequest[] = [
    { term: "laitue", declaredGroup: null, occurrences: 1 },
  ];
  const known = new Map<string, FoodGroupRef>([
    ["lait", g("dairy_yogurt")],
    ["laitue", g("leafy_greens")],
  ]);
  const armed = requestsWithPendingGroups(requests, known);
  assertEquals(armed.armedTerms.has("laitue"), true);
  assertEquals(armed.requests[0].declaredGroup, "leafy_greens");
});

// ═══════════════════════════════════════════════════════════════════════════
// ④ ⛔ AUCUNE VALEUR N'EST REPRISE DU SAS
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("L18b ④ l'énergie du sas n'atteint jamais l'assiette", async () => {
  // La ligne du sas porte une valeur ÉLOIGNÉE du milieu de bande. Si elle
  // arrivait dans l'index, le chiffre serait 401 et pas le milieu.
  const db = fakeDb({
    rows: [{ term: "yuzu", food_group_ref: "citrus", energy_kcal: 401, protein_g: 99 }],
  });
  const out = await repairPlanComposition({
    db,
    baseIndex: INDEX,
    inputs: [input("yuzu")],
    energyInputs: [input("yuzu")],
    meta: MODEL_SILENT_META,
    ask: MUET,
  });
  const filled = out.index.bySlug.get("yuzu")!;
  assertEquals(filled.energyKcal, CITRUS_MID);
  assert(filled.energyKcal !== 401, "⛔ promouvoir sans les trois observations");
  // ⛔ AUCUNE MACRO: le milieu d'une bande d'énergie n'en dérive aucune.
  assertEquals(filled.proteinG, null);
  assertEquals(filled.carbsG, null);
  assertEquals(filled.fatG, null);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑤ ⛔ AUCUN ALIAS — `byAlias` est le MÊME OBJET
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("L18b ⑤ `byAlias` est le même objet en sortie qu'en entrée", async () => {
  const db = fakeDb({ rows: [{ term: "yuzu", food_group_ref: "citrus" }] });
  const out = await repairPlanComposition({
    db,
    baseIndex: INDEX,
    inputs: [input("yuzu")],
    energyInputs: [input("yuzu")],
    meta: MODEL_SILENT_META,
    ask: MUET,
  });
  assertStrictEquals(out.index.byAlias, INDEX.byAlias);
  assertEquals(out.index.byAlias.size, INDEX.byAlias.size);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑥ LA LIGNE DU PLAN GAGNE — le sas comble un `null`, il ne corrige rien
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("L18b ⑥ un groupe déclaré sur la ligne n'est jamais écrasé par le sas", async () => {
  const db = fakeDb({ rows: [{ term: "yuzu", food_group_ref: "citrus" }] });
  const out = await repairPlanComposition({
    db,
    baseIndex: INDEX,
    inputs: [input("yuzu", g("poultry"))],
    energyInputs: [input("yuzu", g("poultry"))],
    meta: MODEL_SILENT_META,
    ask: MUET,
  });
  const filled = out.index.bySlug.get("yuzu")!;
  assertEquals(filled.foodGroupRef, "poultry", "la ligne du plan décide");
  assertEquals(out.counts.sas_group_armed, 0, "rien n'a été armé: il y avait déjà un groupe");
  const poultry = BANDS.get(g("poultry"))!;
  assertEquals(filled.energyKcal, Math.round(((poultry.energyLow + poultry.energyHigh) / 2) * 10) / 10);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑦ ⛔ UNE LIGNE ARMÉE PAR LE SAS N'Y RETOURNE PAS COMPTER UN TOUR
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("L18b ⑦ un plan où le modèle s'est tu ne fait pas monter `sightings`", async () => {
  const db = fakeDb({ rows: [{ term: "yuzu", food_group_ref: "citrus" }] });
  const out = await repairPlanComposition({
    db,
    baseIndex: INDEX,
    inputs: [input("yuzu")],
    energyInputs: [input("yuzu")],
    meta: MODEL_SILENT_META,
    ask: MUET,
  });
  assertEquals(out.counts.group_bounds, 1, "le repli a bien rempli l'assiette");
  assertEquals(out.counts.sas_write_skipped_reused_group, 1);
  assertEquals(out.counts.sas_written, 0);
  assertEquals(
    db.written.length,
    0,
    "⛔ la RPC ne doit même pas être appelée: `sightings` certifierait une valeur que ce plan n'a jamais vue",
  );
});

Deno.test("L18b ⑦bis contre-épreuve — un `group_bounds` sans armement compte, lui", async () => {
  // Le terme porte son groupe SUR LA LIGNE: rien n'est armé par le sas, donc
  // rien n'est retiré de l'écriture. C'est le comportement d'avant `L18b`.
  const db = fakeDb({ rows: [] });
  const out = await repairPlanComposition({
    db,
    baseIndex: INDEX,
    inputs: [input("yuzu", g("citrus"))],
    energyInputs: [input("yuzu", g("citrus"))],
    meta: MODEL_SILENT_META,
    ask: MUET,
  });
  assertEquals(out.counts.group_bounds, 1);
  assertEquals(out.counts.sas_write_skipped_reused_group, 0);
  assertEquals(out.counts.sas_written, 1);
  assertEquals(db.written.length, 1);
  assertEquals(db.written[0][0].term, "yuzu");
  assertEquals(db.written[0][0].fill_source, "group_bounds");
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑧ ⛔ ELLE NE LÈVE JAMAIS — quatre pannes, quatre fois le comportement d'avant
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("L18b ⑧ les quatre pannes de lecture rendent le comportement d'AVANT", async () => {
  const pannes: { nom: string; db: FakeDb }[] = [
    { nom: "client sans `from`", db: fakeDb({ noFrom: true }) },
    { nom: "erreur PostgREST", db: fakeDb({ readError: { message: "denied" } }) },
    { nom: "la lecture lève", db: fakeDb({ readThrows: true }) },
    { nom: "charge illisible", db: fakeDb({ rows: "pas un tableau" }) },
  ];
  for (const p of pannes) {
    const out = await repairPlanComposition({
      db: p.db,
      baseIndex: INDEX,
      inputs: [input("yuzu")],
      energyInputs: [input("yuzu")],
      meta: MODEL_SILENT_META,
      ask: MUET,
    });
    assertEquals(out.counts.no_group, 1, `${p.nom}: l'abstention d'avant`);
    assertEquals(out.counts.sas_group_armed, 0, p.nom);
    assertEquals(out.index.bySlug.has("yuzu"), false, p.nom);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑨ ⛔ VOCABULAIRE FERMÉ — un groupe inconnu est jeté, pas rapproché
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("L18b ⑨ un groupe hors vocabulaire est jeté", async () => {
  const db = fakeDb({
    rows: [
      { term: "yuzu", food_group_ref: "agrumes" },
      { term: "sudachi", food_group_ref: null },
      { term: "kabosu", food_group_ref: "citrus" },
    ],
  });
  const known = await loadPendingGroups(db, ["yuzu", "sudachi", "kabosu"]);
  assertEquals([...known.keys()], ["kabosu"]);
  assertEquals(known.get("kabosu"), "citrus");
});

Deno.test("L18b ⑨bis une ligne qu'on n'a pas demandée est jetée", async () => {
  const db = fakeDb({
    rows: [
      { term: "kabosu", food_group_ref: "citrus" },
      { term: "lait", food_group_ref: "dairy_yogurt" },
    ],
  });
  const known = await loadPendingGroups(db, ["kabosu"]);
  assertEquals([...known.keys()], ["kabosu"]);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑩ LA REQUÊTE EST CELLE QU'ON CROIT — table, colonnes, termes
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("L18b ⑩ deux colonnes, la table du sas, et les termes de la worklist", async () => {
  const db = fakeDb({ rows: [] });
  await repairPlanComposition({
    db,
    baseIndex: INDEX,
    inputs: [input("yuzu"), input("sudachi"), input("yuzu")],
    energyInputs: [input("yuzu")],
    meta: MODEL_SILENT_META,
    ask: MUET,
  });
  assertEquals(db.calls.length, 1, "⛔ UNE requête par plan, jamais une par terme");
  assertEquals(db.calls[0].table, PENDING_TABLE);
  assertEquals(db.calls[0].table, "food_composition_pending");
  assertEquals(
    db.calls[0].columns,
    "term,food_group_ref",
    "⛔ jamais `*`: l'énergie du sas ne doit pas être à portée du chemin chaud",
  );
  assertEquals(db.calls[0].column, "term");
  assertEquals([...db.calls[0].values].sort(), ["sudachi", "yuzu"], "dédoublonnés");
});

Deno.test("L18b ⑩bis un plan dont tout résout ne lit ni ne paie rien", async () => {
  const db = fakeDb({ rows: [{ term: "yuzu", food_group_ref: "citrus" }] });
  const out = await repairPlanComposition({
    db,
    baseIndex: INDEX,
    inputs: [input("lemon")],
    energyInputs: [input("lemon")],
    meta: MODEL_SILENT_META,
    ask: MUET,
  });
  assertEquals(db.calls.length, 0, "aucune worklist ⇒ aucune requête");
  assertEquals(out.counts.requested, 0);
  assertEquals(out.counts.sas_group_armed, 0);
  assertEquals(out.counts.sas_write_skipped_reused_group, 0);
});

// ═══════════════════════════════════════════════════════════════════════════
// ⑪ ⛔ LA COUTURE NE DOIT PAS DEVENIR LE CHEMIN — le défaut est la production
// ═══════════════════════════════════════════════════════════════════════════
//
// ⚠️ CES DEUX CAS LISENT DU TEXTE, ET C'EST ASSUMÉ. Ils ne peuvent pas être
// écrits autrement: prouver « le défaut appelle le vrai modèle » en l'appelant
// coûte 15 s par cas, et prouver « aucune lane ne passe de stub » demande de
// regarder les lanes. Le repositoire connaît le prix d'une couture de test
// laissée branchée en production (`agent_used`, `MEGA_TEST_STUB`): on l'assère.

const IO_SOURCE = Deno.readTextFileSync(
  new URL("./composition_fill_io.ts", import.meta.url),
);

Deno.test("L18b ⑪ le défaut de `ask` est `askCompositionFill`, le vrai appel", () => {
  assert(
    IO_SOURCE.includes("(args.ask ?? askCompositionFill)("),
    "⛔ le défaut de la couture DOIT rester l'appel de production",
  );
});

Deno.test("L18b ⑪bis aucune lane de génération ne passe de couture", () => {
  for (
    const lane of [
      "../../generate-meal-v1/index.ts",
      "../../generate-household-meal-v1/index.ts",
    ]
  ) {
    const src = Deno.readTextFileSync(new URL(lane, import.meta.url));
    const i = src.indexOf("repairPlanComposition({");
    assert(i > 0, `${lane}: la lane doit appeler repairPlanComposition`);
    const bloc = src.slice(i, i + 2000);
    assert(
      !/\bask\s*:/.test(bloc),
      `⛔ ${lane} passe une couture au chemin chaud`,
    );
  }
});
