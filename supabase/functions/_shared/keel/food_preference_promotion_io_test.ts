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
  /**
   * Les `.update(...)` DIRECTS. Depuis C3 ② il ne doit plus y en avoir aucun:
   * l'écriture passe par la RPC ciblée. On garde le mouchard pour que le retour
   * à l'écrasement de colonne se VOIE, au lieu de repasser en silence.
   */
  updates: Array<Record<string, unknown>>;
  /** Les RPC appelées, avec leurs arguments. */
  rpcs: Array<{ name: string; params: Record<string, unknown> }>;
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
  /** C3 ② — la course: quelqu'un a écrit sur la même clé entre-temps. */
  staleSnapshot?: boolean;
}) {
  const trace: Trace = { inCalls: [], tablesRead: [], updates: [], rpcs: [] };

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

  const rpc = (name: string, params: Record<string, unknown>) => {
    trace.rpcs.push({ name, params });
    if (opts.failWrite) {
      return Promise.resolve({ data: null, error: { message: "write refused" } });
    }
    if (opts.staleSnapshot) {
      return Promise.resolve({
        data: { ok: false, reason: "stale_snapshot" },
        error: null,
      });
    }
    return Promise.resolve({ data: { ok: true, written: true }, error: null });
  };

  return { admin: { from, rpc } as never, trace };
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
    actor: "row_owner",
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
    actor: "row_owner",
  });

  const memoryReads = trace.inCalls.filter((c) => c.table === "memory_items");
  assertEquals(memoryReads.length, 2, "sources ET remplaçants");
  assertEquals(memoryReads[1].ids, [NEW]);
  // Et la conséquence: la ligne démentie part, et l'écriture est faite.
  assertEquals(out[FOOD_PREFERENCES_KEY], []);
  // C3 ② — l'écriture passe par la RPC ciblée, et par elle seule.
  assertEquals(trace.rpcs.length, 1);
  assertEquals(trace.rpcs[0].name, "keel_write_food_preferences");
  assertEquals(trace.updates.length, 0);
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
    actor: "row_owner",
  });

  assert(trace.tablesRead.includes("profiles"), "le prénom doit être lu");
  // La supersession n'est pas plausible: la ligne VRAIE est gardée.
  assertEquals(out[FOOD_PREFERENCES_KEY], ["Theo dislikes porridge for breakfast"]);
  assertEquals(trace.updates.length, 0, "rien à écrire");
  assertEquals(trace.rpcs.length, 0, "rien à écrire");
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
      actor: "row_owner",
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
    actor: "row_owner",
  });
  assertEquals(trace.updates.length, 0);
  assertEquals(trace.rpcs.length, 0);
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
    actor: "row_owner",
  });
  assertEquals(out, before);
  assertEquals(trace.updates.length, 0);
  assertEquals(trace.rpcs.length, 0);
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
    actor: "row_owner",
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
    actor: "row_owner",
  });
  assertEquals(out[FOOD_PREFERENCES_KEY], []);
  assertEquals(trace.rpcs.length, 1);
  assertEquals(trace.updates.length, 0);
});

// ---------------------------------------------------------------------------
// C3 ② — L'ÉCRITURE CIBLÉE, SOUS CONCURRENCE OPTIMISTE
//
// Ce que ces trois cas gardent est la moitié qu'aucun test SQL ne peut voir: le
// module envoie-t-il la BONNE copie comme témoin, et que fait-il du refus.
// ---------------------------------------------------------------------------

Deno.test("C3 ② — LA COLONNE N'EST PLUS ÉCRASÉE: deux clés, et le témoin est la copie LUE", async () => {
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
  const before = kept("Theo likes roasted broccoli", OLD, "2026-07-09");
  // Une clé QUI N'APPARTIENT PAS à ce module, et qui doit rester hors de
  // l'écriture: c'est très exactement celle qu'un titulaire perdait.
  before.eating_rhythm = [{ slot: "dinner" }];

  await reconcileFoodPreferencesFor({
    admin,
    userId: "u1",
    constraints: before,
    source: "test",
    actor: "row_owner",
  });

  assertEquals(trace.updates.length, 0, "plus aucun update direct de la colonne");
  assertEquals(trace.rpcs.length, 1);
  const call = trace.rpcs[0];
  assertEquals(call.name, "keel_write_food_preferences");
  // ⚠️ LE TÉMOIN EST CE QU'ON A LU, pas ce qu'on écrit. L'inverse ferait un
  // prédicat toujours vrai côté base, donc une garde désarmée en silence.
  assertEquals(call.params.p_expected, ["Theo likes roasted broccoli"]);
  assertEquals(call.params.p_preferences, []);
  assertEquals(typeof call.params.p_origins, "object");
  // Et le rythme de repas ne part PAS: il n'est dans aucun argument.
  assert(
    !JSON.stringify(call.params).includes("eating_rhythm"),
    `une clé étrangère est partie à l'écriture: ${JSON.stringify(call.params)}`,
  );
});

Deno.test("C3 ② — UNE COPIE PÉRIMÉE NE RÉESSAIE PAS, et la génération continue", async () => {
  // Quelqu'un a écrit sur la MÊME clé entre la lecture et l'écriture. On ne
  // réessaie pas: réessayer, c'est décider que notre copie gagne.
  const { admin, trace } = fakeAdmin({
    staleSnapshot: true,
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
    actor: "row_owner",
  });
  assertEquals(trace.rpcs.length, 1, "un seul essai, jamais deux");
  // LE PROMPT DE CE RUN-CI reçoit quand même la version corrigée: une
  // préférence rétractée n'a pas à être servie au modèle parce qu'une course a
  // empêché de l'effacer en base.
  assertEquals(out[FOOD_PREFERENCES_KEY], []);
});

Deno.test("C3 ② — UNE ÉCRITURE QUI ÉCHOUE NE CASSE PAS LA GÉNÉRATION", async () => {
  // Même posture que la lecture: ce sont des goûts, pas des allergies.
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
    actor: "row_owner",
  });
  // Le filet rend les contraintes D'ORIGINE, pas une moitié de correction.
  assertEquals(out, before);
});

// ---------------------------------------------------------------------------
// C4 — ON NE RÉÉCRIT JAMAIS CE QUE QUELQU'UN A RENSEIGNÉ
//
// ⚠️ LE PIÈGE DE CE LOT EST DANS LE DÉCOR, PAS DANS L'ASSERTION. « N'écrit pas
// pour un tiers » et « n'écrit plus jamais » sont indiscernables tant qu'un
// seul cas est monté. Les deux tests ci-dessous partagent DÉLIBÉRÉMENT le même
// décor — même mémoire, mêmes contraintes, même faux client — et ne diffèrent
// QUE par `actor`. Si le second passait à zéro RPC, le premier deviendrait un
// test qui ne prouve rien, et il tomberait avec lui.
// ---------------------------------------------------------------------------

/** Le décor commun aux deux moitiés: un souvenir rétracté, une ligne à corriger. */
function retractedDecor() {
  return {
    itemsById: {
      [OLD]: {
        id: OLD,
        status: "invalidated",
        normalized_summary: "Theo hates broccoli",
      },
    },
  };
}

Deno.test("C4 — POUR LA LIGNE D'UN TIERS: la correction s'applique, RIEN ne s'écrit", async () => {
  // Depuis L6, le maître du foyer déclenche cette réconciliation pour CHAQUE
  // titulaire à sa table. La personne n'a rien fait: sa ligne ne doit pas
  // bouger, et rien ne pourrait jamais lui expliquer pourquoi sa préférence a
  // disparu. La correction, elle, vaut pour le prompt de CE run.
  const { admin, trace } = fakeAdmin(retractedDecor());
  const before = kept("Theo hates broccoli", OLD, "2026-08-01");
  const out = await reconcileFoodPreferencesFor({
    admin,
    userId: "u-zoe",
    constraints: before,
    source: "test",
    actor: "someone_else",
  });

  // ① LA COMPOSITION RESTE JUSTE: la préférence rétractée ne part pas au modèle.
  assertEquals(out[FOOD_PREFERENCES_KEY], []);
  assert(out !== before, "la correction n'a pas été appliquée du tout");
  // ② AUCUNE LIGNE NE BOUGE — ni par la RPC, ni par un `.update()` de colonne.
  assertEquals(trace.rpcs, [], "la ligne d'un tiers a été écrite");
  assertEquals(trace.updates, [], "la colonne d'un tiers a été écrasée");
  // ③ ET LA MÉMOIRE A BIEN ÉTÉ LUE: sans ça, le zéro écriture ci-dessus serait
  //    celui d'une fonction qui n'a rien fait du tout.
  assert(trace.tablesRead.includes("memory_items"));
});

Deno.test("C4 — LE CAS QUI PASSE: sur SA PROPRE ligne, la correction S'ÉCRIT", async () => {
  // ⚠️ SANS CETTE MOITIÉ, LE TEST DU DESSUS EST VERT SUR UNE FONCTION QUI
  // N'ÉCRIT PLUS JAMAIS RIEN — c'est-à-dire sur un produit où une préférence
  // rétractée reste en base pour toujours, et où la carte, l'export RGPD et les
  // deux autres générateurs continuent de la montrer. Même décor, même
  // rétractation: seul `actor` change.
  const { admin, trace } = fakeAdmin(retractedDecor());
  const out = await reconcileFoodPreferencesFor({
    admin,
    userId: "u-zoe",
    constraints: kept("Theo hates broccoli", OLD, "2026-08-01"),
    source: "test",
    actor: "row_owner",
  });

  assertEquals(out[FOOD_PREFERENCES_KEY], []);
  assertEquals(trace.rpcs.length, 1, "la personne compose SON plan et rien n'est écrit");
  assertEquals(trace.rpcs[0].name, "keel_write_food_preferences");
  assertEquals(trace.rpcs[0].params.p_expected, ["Theo hates broccoli"]);
  assertEquals(trace.rpcs[0].params.p_preferences, []);
  assertEquals(trace.updates, []);
});

Deno.test("C4 — RIEN N'A CHANGÉ POUR UN TIERS: on ne rend pas un objet neuf", async () => {
  // La réconciliation reste une CORRECTION, jamais un ajout: sans souvenir
  // démenti, elle rend les contraintes reçues telles quelles, quel que soit
  // l'acteur. Une branche `someone_else` qui recopierait l'objet ferait croire
  // à un changement là où il n'y en a aucun.
  const { admin, trace } = fakeAdmin({
    itemsById: {
      [OLD]: { id: OLD, status: "active", normalized_summary: "Theo hates broccoli" },
    },
  });
  const before = kept("Theo hates broccoli", OLD, "2026-08-01");
  const out = await reconcileFoodPreferencesFor({
    admin,
    userId: "u-zoe",
    constraints: before,
    source: "test",
    actor: "someone_else",
  });
  assertEquals(out, before);
  assertEquals(trace.rpcs, []);
  assertEquals(trace.updates, []);
});
