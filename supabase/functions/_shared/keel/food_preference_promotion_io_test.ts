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
import {
  persistReconciledFoodPreferences,
  reconcileFoodPreferencesFor,
} from "./food_preference_promotion_io.ts";

/**
 * C6 ② — CALCULER PUIS PERSISTER, EN UN GESTE.
 *
 * ⚠️ CE N'EST PAS UN RACCOURCI DE CONFORT: c'est ce que fait un générateur dont
 * la requête ABOUTIT, et c'est le comportement que la quasi-totalité de ce
 * fichier décrit. Le lot C6 ② ne change pas CE QUI est écrit, il change QUAND —
 * donc les cas de bout en bout restent exactement les mêmes, et les seuls tests
 * qui appellent les deux moitiés séparément sont ceux qui parlent de l'ORDRE.
 */
async function reconcileAndPersist(args: {
  admin: Parameters<typeof reconcileFoodPreferencesFor>[0]["admin"];
  userId: string;
  constraints: Record<string, unknown> | null | undefined;
  source: string;
  actor: "row_owner" | "someone_else";
}): Promise<Record<string, unknown>> {
  const out = await reconcileFoodPreferencesFor(args);
  await persistReconciledFoodPreferences(out.pending);
  return out.constraints;
}

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
  await reconcileAndPersist({
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
  const out = await reconcileAndPersist({
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
  const out = await reconcileAndPersist({
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
    const out = await reconcileAndPersist({
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
  const out = await reconcileAndPersist({
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
  const out = await reconcileAndPersist({
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

Deno.test("FAIL-SOFT: une écriture qui LÈVE ne casse rien, et le prompt reste corrigé", async () => {
  // ⚠️ CE TEST AFFIRMAIT L'INVERSE AVANT C6 ②, ET C'EST LA SEULE CHOSE QUE CE
  // LOT RENVERSE. Il exigeait les contraintes D'ORIGINE au motif que « rendre
  // un état qu'on n'a pas su persister ferait diverger le prompt de la base ».
  //
  // TROIS RAISONS DE RENVERSER, ET LA TROISIÈME SUFFIT:
  //   ① ce fichier disait DÉJÀ le contraire à deux pas d'ici — sur une copie
  //      périmée (`stale_snapshot`, C3 ②), la version corrigée est rendue, au
  //      motif exactement inverse: « une préférence rétractée n'a pas à être
  //      servie au modèle parce qu'une course a empêché de l'effacer ». Deux
  //      échecs d'écriture, deux réponses opposées;
  //   ② la divergence est le CAS NOMINAL depuis C4: pour un tiers, on corrige
  //      le prompt sans jamais écrire, et c'est la règle du lot;
  //   ③ et depuis C6 ②, ce n'est plus décidable ici: les contraintes partent au
  //      prompt AVANT que l'écriture soit tentée. Le prix est nommé — la base
  //      garde une préférence démentie une génération de plus, et le journal le
  //      dit (`reconcile_failed`).
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
  const out = await reconcileAndPersist({
    admin,
    userId: "u1",
    constraints: before,
    source: "test",
    actor: "row_owner",
  });
  // LE PROMPT DE CE RUN-CI EST CORRIGÉ: la ligne démentie ne part pas au
  // modèle. C'est la même réponse que sur la copie périmée.
  assertEquals(out[FOOD_PREFERENCES_KEY], []);
  assert(out !== before, "la correction n'a pas été appliquée du tout");
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
  const out = await reconcileAndPersist({
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

  await reconcileAndPersist({
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
  const out = await reconcileAndPersist({
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
  //
  // ⚠️ C6 ② — ET DEPUIS CE LOT, ELLE NE PEUT PLUS RIEN CASSER DU TOUT: le plan
  // est déjà écrit quand elle est tentée. `persistReconciledFoodPreferences`
  // avale et journalise, et l'appelant ne reçoit rien à traiter.
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
  const out = await reconcileAndPersist({
    admin,
    userId: "u1",
    constraints: before,
    source: "test",
    actor: "row_owner",
  });
  // Le prompt reçoit la correction — voir le test renversé plus haut. Ce qui
  // compte ici est qu'AUCUNE exception ne remonte.
  assertEquals(out[FOOD_PREFERENCES_KEY], []);
  assert(out !== before);
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
  const out = await reconcileAndPersist({
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
  const out = await reconcileAndPersist({
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
  const out = await reconcileAndPersist({
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

// ---------------------------------------------------------------------------
// C6 ② — LA LIGNE NE BOUGE PLUS SUR UNE REQUÊTE REFUSÉE
//
// ⚠️ MESURÉ EN HTTP RÉEL LE 2026-08-12: une ligne `student_goals` corrigée à
// `17:30:59` par un appel de `generate-meal-v1` qui a rendu
// `400 window_beyond_this_week`. La personne a bien agi — ce n'est PAS une
// violation de C4 — mais sa ligne bouge sur une requête qu'elle voit comme
// échouée, et rien à l'écran ne le lui dit.
// ---------------------------------------------------------------------------

Deno.test("C6 ② — LA RÉCONCILIATION N'ÉCRIT PLUS RIEN TOUTE SEULE", async () => {
  // ⚠️ C'EST TOUT LE LOT, ET C'EST LA MOITIÉ QU'ON PEUT PROUVER ICI: appelée
  // seule, la fonction corrige et NE TOUCHE PAS LA BASE. Un refus posé après
  // elle — les deux gardes de fenêtre, le 409 de la RPC, une panne de modèle —
  // laisse donc `student_goals` exactement comme elle était.
  const { admin, trace } = fakeAdmin(retractedDecor());
  const out = await reconcileFoodPreferencesFor({
    admin,
    userId: "u-zoe",
    constraints: kept("Theo hates broccoli", OLD, "2026-08-01"),
    source: "test",
    actor: "row_owner",
  });
  // ① LE PROMPT EST CORRIGÉ TOUT DE SUITE — rien de ce que C4 a gagné ne bouge.
  assertEquals(out.constraints[FOOD_PREFERENCES_KEY], []);
  // ② ET LA BASE N'A PAS ÉTÉ TOUCHÉE.
  assertEquals(trace.rpcs, [], "la réconciliation écrit encore toute seule");
  assertEquals(trace.updates, []);
  // ③ MAIS L'ÉCRITURE EST PRÊTE, avec le témoin de concurrence de C3 ② figé sur
  //    la valeur LUE — pas sur celle qu'on écrit, sinon le prédicat serait
  //    toujours faux et la fonction n'écrirait plus jamais.
  assert(out.pending !== null, "rien n'a été préparé: la correction est perdue");
  assertEquals(out.pending?.userId, "u-zoe");
  assertEquals(out.pending?.expected, ["Theo hates broccoli"]);
  assertEquals(out.pending?.preferences, []);

  // ── ET LE CAS QUI PASSE, DANS LE MÊME TEST ────────────────────────────
  // Sans lui, « n'écrit plus toute seule » et « n'écrit plus jamais » sont le
  // même zéro. La requête aboutit: on persiste, et la ligne bouge.
  await persistReconciledFoodPreferences(out.pending);
  assertEquals(trace.rpcs.length, 1);
  assertEquals(trace.rpcs[0].name, "keel_write_food_preferences");
  assertEquals(trace.rpcs[0].params.p_expected, ["Theo hates broccoli"]);
  assertEquals(trace.rpcs[0].params.p_preferences, []);
});

Deno.test("C6 ② — C4 TIENT: pour un TIERS, il n'y a rien à persister non plus", async () => {
  // ⚠️ LE PIÈGE DE CE LOT. En rendant l'écriture différée, on pourrait très
  // bien préparer une écriture pour la ligne d'un tiers et la laisser partir
  // plus tard: C4 serait défait sans qu'une seule assertion de C4 tombe, parce
  // que C4 ne regarde que ce qui se passe PENDANT la réconciliation.
  const { admin, trace } = fakeAdmin(retractedDecor());
  const out = await reconcileFoodPreferencesFor({
    admin,
    userId: "u-zoe",
    constraints: kept("Theo hates broccoli", OLD, "2026-08-01"),
    source: "test",
    actor: "someone_else",
  });
  assertEquals(out.constraints[FOOD_PREFERENCES_KEY], [], "la correction doit s'appliquer");
  assertEquals(
    out.pending,
    null,
    "une écriture a été PRÉPARÉE pour la ligne de quelqu'un d'autre: C4 est " +
      "défait par la porte de derrière.",
  );
  // Et la persister ne fait rien, même si un appelant l'appelle quand même.
  await persistReconciledFoodPreferences(out.pending);
  assertEquals(trace.rpcs, []);
  assertEquals(trace.updates, []);
});

Deno.test("C6 ② — `pending` EST `null` QUAND IL N'Y A RIEN À ÉCRIRE", async () => {
  // Trois chemins y mènent, et aucun n'est un incident. Les confondre ferait
  // journaliser le cas nominal.
  const unchanged = await reconcileFoodPreferencesFor({
    admin: fakeAdmin({
      itemsById: {
        [OLD]: { id: OLD, status: "active", normalized_summary: "Likes fish" },
      },
    }).admin,
    userId: "u1",
    constraints: kept("Likes fish", OLD, "2026-07-06"),
    source: "test",
    actor: "row_owner",
  });
  assertEquals(unchanged.pending, null, "rien n'a changé");

  const nothingKept = await reconcileFoodPreferencesFor({
    admin: fakeAdmin({}).admin,
    userId: "u1",
    constraints: {},
    source: "test",
    actor: "row_owner",
  });
  assertEquals(nothingKept.pending, null, "aucune préférence gardée");

  const unreadable = await reconcileFoodPreferencesFor({
    admin: fakeAdmin({ failItemsRead: true }).admin,
    userId: "u1",
    constraints: kept("Likes fish", OLD, "2026-07-06"),
    source: "test",
    actor: "row_owner",
  });
  assertEquals(unreadable.pending, null, "la mémoire est illisible");
});
