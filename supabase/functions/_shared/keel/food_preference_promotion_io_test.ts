// LE BRANCHEMENT — et c'est là que les deux défauts de ce chantier vivaient.
//
// Le module pur porte 38 tests. `food_preference_promotion_io.ts` n'en portait
// AUCUN, et c'est pourtant lui qui a cassé deux fois, en production locale, de
// deux façons que le module pur ne peut pas voir:
//
//   1. les ids envoyés à Postgres étaient fabriqués avec
//      `Object.values(origin).map(String)` — donc `"[object Object]"` depuis que
//      la valeur porte une date. Postgres refusait, le filet fail-soft avalait,
//      et LA RÉCONCILIATION NE TOURNAIT PLUS DU TOUT. Une seule ligne de `warn`
//      dans les logs le disait;
//
//   2. si l'appelant ne charge que les items SOURCES et pas les cibles de
//      `superseded_by_item_id`, le contrôle de plausibilité retombe sur sa
//      branche « remplaçant non chargé » et ne retire plus jamais rien. Vert,
//      et mort.
//
// Les deux ont été trouvés par un run réel, c'est-à-dire par chance. Ces tests
// sont là pour qu'ils soient trouvés par la suite.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  applyFoodPreferenceDecision,
  FOOD_PREFERENCES_KEY,
  FOOD_PREFERENCES_ORIGIN_KEY,
} from "./food_preference_promotion.ts";
import { reconcileFoodPreferencesFor } from "./food_preference_promotion_io.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const OLD = "aaaaaaaa-0000-4000-8000-000000000001";
const NEW = "bbbbbbbb-0000-4000-8000-000000000002";

type Row = Record<string, unknown>;

interface Trace {
  /** Chaque `.in("id", …)` observé, table par table. */
  inCalls: Array<{ table: string; ids: unknown[] }>;
  tablesRead: string[];
  updates: Array<Record<string, unknown>>;
}

/**
 * Un faux client qui suit EXACTEMENT les chaînes du module:
 *   from(t).select(c).eq(..).in(..)            -> await
 *   from("profiles").select(..).eq(..).maybeSingle()
 *   from("student_goals").update(..).eq(..)    -> await
 */
function fakeAdmin(opts: {
  itemsById?: Record<string, Row>;
  fullName?: string | null;
  failItemsRead?: boolean;
  failWrite?: boolean;
}) {
  const trace: Trace = { inCalls: [], tablesRead: [], updates: [] };

  const from = (table: string) => ({
    select: (_cols: string) => {
      trace.tablesRead.push(table);
      let ids: unknown[] = [];
      const node: Record<string, unknown> = {
        eq: () => node,
        in: (_col: string, values: unknown[]) => {
          ids = values;
          trace.inCalls.push({ table, ids: values });
          return node;
        },
        maybeSingle: () =>
          Promise.resolve({
            data: opts.fullName === undefined
              ? { full_name: "Theo" }
              : opts.fullName === null
              ? null
              : { full_name: opts.fullName },
            error: null,
          }),
        then: (resolve: (v: unknown) => unknown) => {
          if (opts.failItemsRead) {
            return resolve({ data: null, error: { message: "boom" } });
          }
          const rows = ids
            .map((id) => (opts.itemsById ?? {})[String(id)])
            .filter(Boolean);
          return resolve({ data: rows, error: null });
        },
      };
      return node;
    },
    update: (patch: Record<string, unknown>) => {
      trace.updates.push(patch);
      const node: Record<string, unknown> = {
        eq: () => node,
        then: (resolve: (v: unknown) => unknown) =>
          resolve({
            error: opts.failWrite ? { message: "write refused" } : null,
          }),
      };
      return node;
    },
  });

  return { admin: { from } as never, trace };
}

/** Une ligne gardée avec son origine datée, comme la carte l'écrit. */
function kept(text: string, sourceId: string, at: string) {
  return applyFoodPreferenceDecision({}, {
    kind: "keep",
    text,
    memoryItemId: sourceId,
    seenAt: at,
  });
}

// ---------------------------------------------------------------------------

Deno.test("LES IDS ENVOYÉS À POSTGRES SONT DES UUID, jamais [object Object]", async () => {
  // LE défaut #1. `Object.values(origin).map(String)` rendait `"[object
  // Object]"`, Postgres répondait `invalid input syntax for type uuid`, et la
  // réconciliation était morte en silence derrière le filet fail-soft.
  const { admin, trace } = fakeAdmin({
    itemsById: {
      [OLD]: { id: OLD, status: "active", normalized_summary: "Likes broccoli" },
    },
  });
  await reconcileFoodPreferencesFor({
    admin,
    userId: "u1",
    constraints: kept("Likes broccoli", OLD, "2026-07-06"),
    source: "test",
  });

  assertEquals(trace.inCalls.length >= 1, true);
  for (const call of trace.inCalls) {
    for (const id of call.ids) {
      assert(
        UUID_RE.test(String(id)),
        `id non-UUID envoyé à ${call.table}: ${JSON.stringify(id)}`,
      );
    }
  }
});

Deno.test("LES REMPLAÇANTS SONT CHARGÉS, sinon la garde de plausibilité est morte", async () => {
  // LE défaut #2. Sans cette lecture, `reconcileFoodPreferences` retombe sur
  // « remplaçant non chargé » et ne retire PLUS JAMAIS rien — un désarmement
  // total, invisible, d'une garde qui reste écrite.
  const { admin, trace } = fakeAdmin({
    itemsById: {
      [OLD]: {
        id: OLD,
        status: "superseded",
        superseded_by_item_id: NEW,
        normalized_summary: "Theo likes roasted broccoli",
      },
      [NEW]: { id: NEW, status: "active", normalized_summary: "Theo hates broccoli" },
    },
  });
  const out = await reconcileFoodPreferencesFor({
    admin,
    userId: "u1",
    constraints: kept("Theo likes roasted broccoli", OLD, "2026-07-09"),
    source: "test",
  });

  const memoryReads = trace.inCalls.filter((c) => c.table === "memory_items");
  assertEquals(memoryReads.length, 2, "sources ET remplaçants");
  assertEquals(memoryReads[1].ids, [NEW]);
  // Et la conséquence: la ligne démentie part, et l'écriture est faite.
  assertEquals(out[FOOD_PREFERENCES_KEY], []);
  assertEquals(trace.updates.length, 1);
});

Deno.test("LE PRÉNOM EST LU, sinon toutes les paires paraissent liées", async () => {
  // Le memorizer préfixe chaque résumé du prénom. Sans `profiles.full_name` en
  // `ignoreTokens`, « Theo hates broccoli » et « Theo dislikes porridge »
  // partagent `theo` — et la garde laisse passer une supersession fausse.
  const { admin, trace } = fakeAdmin({
    fullName: "Theo",
    itemsById: {
      [OLD]: {
        id: OLD,
        status: "superseded",
        superseded_by_item_id: NEW,
        normalized_summary: "Theo dislikes porridge for breakfast",
      },
      [NEW]: { id: NEW, status: "active", normalized_summary: "Theo hates broccoli" },
    },
  });
  const out = await reconcileFoodPreferencesFor({
    admin,
    userId: "u1",
    constraints: kept("Theo dislikes porridge for breakfast", OLD, "2026-07-13"),
    source: "test",
  });

  assert(trace.tablesRead.includes("profiles"), "le prénom doit être lu");
  // La supersession n'est pas plausible: la ligne VRAIE est gardée.
  assertEquals(out[FOOD_PREFERENCES_KEY], ["Theo dislikes porridge for breakfast"]);
  assertEquals(trace.updates.length, 0, "rien à écrire");
});

Deno.test("RIEN À RÉCONCILIER: aucune lecture de memory_items", async () => {
  // Ce court-circuit s'exécute à CHAQUE génération de semaine et de repas pour
  // tout élève qui n'a rien gardé. Le perdre coûterait une requête par
  // génération, pour rien.
  for (
    const constraints of [
      {},
      { [FOOD_PREFERENCES_KEY]: [] },
      // Gardé, mais sans aucune origine: rien n'est rattachable.
      { [FOOD_PREFERENCES_KEY]: ["typed by hand"], [FOOD_PREFERENCES_ORIGIN_KEY]: {} },
    ]
  ) {
    const { admin, trace } = fakeAdmin({});
    const out = await reconcileFoodPreferencesFor({
      admin,
      userId: "u1",
      constraints,
      source: "test",
    });
    assertEquals(trace.tablesRead, [], JSON.stringify(constraints));
    assertEquals(out, constraints);
  }
});

Deno.test("RIEN N'A CHANGÉ: aucune écriture", async () => {
  // Une écriture par génération sur un jsonb inchangé est du bruit pur, et elle
  // toucherait `updated_at` de `student_goals` sans raison.
  const { admin, trace } = fakeAdmin({
    itemsById: {
      [OLD]: { id: OLD, status: "active", normalized_summary: "Likes fish" },
    },
  });
  const before = kept("Likes fish", OLD, "2026-07-06");
  const out = await reconcileFoodPreferencesFor({
    admin,
    userId: "u1",
    constraints: before,
    source: "test",
  });
  assertEquals(trace.updates.length, 0);
  assertEquals(out, before);
});

Deno.test("FAIL-SOFT: une lecture qui échoue ne casse pas la génération", async () => {
  // Ce sont des goûts, pas des allergies. La posture inverse (THROW) est celle
  // de `safety_constraints.ts`, et elle est délibérément réservée au médical:
  // un élève ne doit pas se voir refuser sa semaine pour une préférence.
  const { admin, trace } = fakeAdmin({ failItemsRead: true });
  const before = kept("Likes fish", OLD, "2026-07-06");
  const out = await reconcileFoodPreferencesFor({
    admin,
    userId: "u1",
    constraints: before,
    source: "test",
  });
  assertEquals(out, before);
  assertEquals(trace.updates.length, 0);
});

Deno.test("FAIL-SOFT: une écriture refusée rend les contraintes D'ORIGINE", async () => {
  // Et surtout PAS les contraintes réconciliées: rendre un état qu'on n'a pas
  // su persister ferait diverger le prompt de la base, et l'écart ne serait
  // visible nulle part.
  const { admin } = fakeAdmin({
    failWrite: true,
    itemsById: {
      [OLD]: {
        id: OLD,
        status: "superseded",
        superseded_by_item_id: NEW,
        normalized_summary: "Theo likes roasted broccoli",
      },
      [NEW]: { id: NEW, status: "active", normalized_summary: "Theo hates broccoli" },
    },
  });
  const before = kept("Theo likes roasted broccoli", OLD, "2026-07-09");
  const out = await reconcileFoodPreferencesFor({
    admin,
    userId: "u1",
    constraints: before,
    source: "test",
  });
  assertEquals(out, before);
});

Deno.test("un profil illisible ne bloque PAS la réconciliation", async () => {
  // Sans prénom, la garde est plus PERMISSIVE (elle laisse passer une paire
  // qui ne partage que le prénom), jamais plus destructrice. Perdre la
  // réconciliation entière pour un `full_name` absent serait le mauvais
  // arbitrage.
  const { admin, trace } = fakeAdmin({
    fullName: null,
    itemsById: {
      [OLD]: {
        id: OLD,
        status: "superseded",
        superseded_by_item_id: NEW,
        normalized_summary: "Theo likes roasted broccoli",
      },
      [NEW]: { id: NEW, status: "active", normalized_summary: "Theo hates broccoli" },
    },
  });
  const out = await reconcileFoodPreferencesFor({
    admin,
    userId: "u1",
    constraints: kept("Theo likes roasted broccoli", OLD, "2026-07-09"),
    source: "test",
  });
  assertEquals(out[FOOD_PREFERENCES_KEY], []);
  assertEquals(trace.updates.length, 1);
});
