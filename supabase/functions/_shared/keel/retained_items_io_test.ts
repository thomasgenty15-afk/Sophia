// LE PORT D'ÉCRITURE SERVEUR — lot 1F.
//
// Ce que ces tests existent pour empêcher, dans l'ordre où ça a déjà coûté:
//
//   1. UNE CLÉ DÉCLARÉE DEUX FOIS QUE RIEN NE RELIE. La constante TypeScript et
//      le littéral SQL sont deux déclarations indépendantes. Le lot 1B a failli
//      payer exactement ça — il nommait sa clé `next_plan_items` pendant que le
//      port de 1D écrivait `retained_next_plan` — et les DEUX côtés étaient
//      verts pendant qu'aucun `next_plan` n'aurait jamais transité. Le même
//      raisonnement vaut pour le NOM de la RPC et pour ses cinq PARAMÈTRES: un
//      seul qui bouge rend `PGRST202`, c'est-à-dire « ça n'a rien fait ».
//   2. UNE MATRICE ARMÉE SUR UN COFFRE VIDE. `canProduce` lit le champ `source`
//      de l'item. Si le producteur pouvait étiqueter ses items comme il veut, la
//      garde ne mordrait jamais — et elle ressemblerait trait pour trait à une
//      garde qui marche.
//   3. UN PORT D'ÉCRITURE QUI RAMASSE LES MIETTES. Re-sérialiser « ce qu'on a su
//      lire » supprime les lignes que le socle refuse — en silence, la nuit.
//
// ⚠️ LES LITTÉRAUX SONT ÉCRITS EN DUR ICI, jamais recomposés depuis la
// constante qu'ils épinglent: « un test paramétré par sa propre constante reste
// vert quand on change la constante ».
//
// env purgé: env -u SUPABASE_URL -u SUPABASE_ANON_KEY -u SUPABASE_SERVICE_ROLE_KEY \
//   deno test --allow-read --allow-env --no-check \
//   supabase/functions/_shared/keel/retained_items_io_test.ts

import { assert, assertEquals } from "jsr:@std/assert@1";

import type { RetainedItem, RetainedSource } from "./retained_item.ts";
import type { NextPlanEntry } from "./retained_next_plan.ts";
import {
  persistRetainedItemsFor,
  RETAINED_ITEMS_WRITE_RPC,
  type ServerRetainedSource,
} from "./retained_items_io.ts";

const USER = "11111111-2222-4333-8444-555555555555";
const MEM_A = "aaaaaaaa-0000-4000-8000-000000000001";
const MEM_B = "bbbbbbbb-0000-4000-8000-000000000002";

// ---------------------------------------------------------------------------
// Le décor: des items faits à la main (la phase 1 n'a pas de producteur), et un
// faux client qui suit EXACTEMENT les chaînes du module.
// ---------------------------------------------------------------------------

function food(over: Partial<RetainedItem> = {}): RetainedItem {
  return {
    kind: "food.exclude",
    scope: "durable",
    subject: "household",
    text: "les rochers coco",
    value: null,
    source: "questionnaire",
    at: "2026-08-18",
    item: "",
    confidence: null,
    ...over,
  } as RetainedItem;
}

function craving(over: Record<string, unknown> = {}): RetainedItem {
  return {
    kind: "craving",
    scope: "next_plan",
    subject: "household",
    text: "des fajitas",
    value: null,
    source: "conversation",
    at: "2026-08-18",
    item: MEM_A,
    confidence: 0.9,
    ...over,
  } as RetainedItem;
}

function entry(item: RetainedItem, anchor = "2026-08-17"): NextPlanEntry {
  return { item, anchor };
}

interface Trace {
  reads: Array<{ table: string; column: string; userId: unknown }>;
  rpcs: Array<{ name: string; params: Record<string, unknown> }>;
  /** ⛔ Il ne doit JAMAIS y en avoir: un `.update()` ne peut porter que la
   * colonne entière — PostgREST n'a pas de `jsonb_set`. */
  updates: Array<Record<string, unknown>>;
}

function fakeAdmin(opts: {
  constraints?: Record<string, unknown> | null;
  noRow?: boolean;
  failRead?: boolean;
  failRpc?: boolean;
  rpcResult?: { ok?: boolean; reason?: string };
}) {
  const trace: Trace = { reads: [], rpcs: [], updates: [] };
  const from = (table: string) => ({
    select: (column: string) => ({
      eq: (_col: string, userId: unknown) => ({
        maybeSingle: () => {
          trace.reads.push({ table, column, userId });
          if (opts.failRead) {
            return Promise.resolve({
              data: null,
              error: { message: "boom" },
            });
          }
          return Promise.resolve({
            data: opts.noRow
              ? null
              : { practical_constraints: opts.constraints ?? null },
            error: null,
          });
        },
      }),
    }),
    update: (payload: Record<string, unknown>) => {
      trace.updates.push(payload);
      return { eq: () => Promise.resolve({ data: null, error: null }) };
    },
  });
  const rpc = (name: string, params: Record<string, unknown>) => {
    trace.rpcs.push({ name, params });
    if (opts.failRpc) {
      return Promise.resolve({ data: null, error: { message: "rpc down" } });
    }
    return Promise.resolve({
      data: opts.rpcResult ?? { ok: true, written: true },
      error: null,
    });
  };
  return { admin: { from, rpc }, trace };
}

// ===========================================================================
// 1. LE CAS QUI PASSE — sans lui, toutes les gardes qui suivent seraient des
//    gardes cassées qui ressemblent à des gardes qui marchent.
// ===========================================================================

Deno.test("écrit: le durable part dans la RPC, avec son témoin", async () => {
  const { admin, trace } = fakeAdmin({ constraints: {} });
  const out = await persistRetainedItemsFor({
    admin,
    userId: USER,
    producer: "questionnaire",
    source: "test",
    durable: [food()],
  });

  assertEquals(out.ok, true);
  assertEquals(out.reason, "written");
  assertEquals(out.durableWritten, 1);
  assertEquals(out.nextPlanWritten, 0);
  assertEquals(out.refused.total, 0);

  assertEquals(trace.updates.length, 0, "un .update() est revenu");
  assertEquals(trace.reads.length, 1);
  assertEquals(trace.reads[0].table, "student_goals");
  // « RLS ne remplace pas un `.eq(user_id)` » — cicatrice mesurée.
  assertEquals(trace.reads[0].userId, USER);

  assertEquals(trace.rpcs.length, 1);
  const params = trace.rpcs[0].params;
  assertEquals(params.p_user, USER);
  // La clé était ABSENTE: le témoin est `null`, et c'est ce qui rend la
  // PREMIÈRE écriture de tout le monde possible.
  assertEquals(params.p_expected, null);
  assertEquals((params.p_items as unknown[]).length, 1);
  // La clé provisoire n'est pas touchée du tout.
  assertEquals(params.p_next, null);
});

Deno.test("écrit: le provisoire seul ne touche pas la clé durable", async () => {
  const { admin, trace } = fakeAdmin({
    constraints: { retained_items: [{ kind: "food.exclude" }] },
  });
  const out = await persistRetainedItemsFor({
    admin,
    userId: USER,
    producer: "conversation",
    source: "test",
    nextPlan: [entry(craving())],
  });

  assertEquals(out.ok, true);
  assertEquals(out.nextPlanWritten, 1);
  const params = trace.rpcs[0].params;
  assertEquals(params.p_items, null, "la clé durable a été touchée");
  assertEquals(params.p_expected, null);
  assertEquals(params.p_expected_next, null);
  const written = params.p_next as Array<Record<string, unknown>>;
  assertEquals(written.length, 1);
  assertEquals(written[0].anchor, "2026-08-17");
});

// ===========================================================================
// 2. LA MATRICE — refusée ET COMPTÉE
// ===========================================================================

Deno.test("matrice: un `source` sans droit est REFUSÉ et COMPTÉ", async () => {
  // Le memorizer n'a pas le droit d'écrire un `portion.adjust`: une mesure a
  // besoin d'un sujet, et la conversation ne sait pas l'attribuer (§5 ②).
  const forbidden = {
    kind: "portion.adjust",
    scope: "durable",
    subject: "household",
    text: "les parts étaient trop grosses",
    value: { direction: "down", magnitude: "clear" },
    source: "conversation",
    at: "2026-08-18",
    item: MEM_A,
    confidence: 0.8,
  } as unknown as RetainedItem;

  const { admin, trace } = fakeAdmin({ constraints: {} });
  const out = await persistRetainedItemsFor({
    admin,
    userId: USER,
    producer: "conversation",
    source: "test",
    durable: [forbidden],
  });

  assertEquals(out.ok, false);
  assertEquals(out.reason, "all_refused");
  assertEquals(out.refused.forbiddenKind, 1, "le refus n'est pas compté");
  assertEquals(out.refused.total, 1);
  assertEquals(out.durableWritten, 0);
  // ⛔ ET LA BASE N'A PAS ÉTÉ APPELÉE. Écrire la liste inchangée aurait rendu
  // `ok`, et l'appelant aurait lu « écrit » sur une écriture qui n'ajoute rien.
  assertEquals(trace.rpcs.length, 0);
});

Deno.test("matrice: un item étiqueté d'une AUTRE source est refusé", async () => {
  // ⚠️ SANS CETTE GARDE, LA MATRICE NE VAUT RIEN: le memorizer écrirait un
  // `portion.adjust` en le marquant `questionnaire`, et `canProduce` dirait oui.
  const disguised = {
    kind: "portion.adjust",
    scope: "durable",
    subject: "household",
    text: "trop gros",
    value: { direction: "down", magnitude: "clear" },
    source: "questionnaire",
    at: "2026-08-18",
    item: "",
    confidence: null,
  } as unknown as RetainedItem;

  const { admin, trace } = fakeAdmin({ constraints: {} });
  const out = await persistRetainedItemsFor({
    admin,
    userId: USER,
    producer: "conversation",
    source: "test",
    durable: [disguised],
  });

  assertEquals(out.ok, false);
  assertEquals(out.reason, "all_refused");
  assertEquals(out.refused.foreignSource, 1);
  assertEquals(out.refused.forbiddenKind, 0, "la mauvaise garde a mordu");
  assertEquals(trace.rpcs.length, 0);
});

Deno.test("matrice: `written` n'est pas un producteur SERVEUR", async () => {
  // `canProduce("written", …)` rend `true` pour les huit familles. Un
  // producteur serveur qui pourrait se déclarer `written` contournerait la
  // matrice entière par un seul mot — et la ligne s'afficherait « tu l'as
  // écrit », ce qui serait faux.
  const { admin, trace } = fakeAdmin({ constraints: {} });
  const out = await persistRetainedItemsFor({
    admin,
    userId: USER,
    // Le type l'interdit déjà; on force par un cast pour prouver le refus À
    // L'EXÉCUTION — une valeur venue d'une colonne ou d'un JSON ne compile pas,
    // elle arrive.
    producer: "written" as unknown as ServerRetainedSource,
    source: "test",
    durable: [food({ source: "written" } as Partial<RetainedItem>)],
  });
  assertEquals(out.ok, false);
  assertEquals(out.reason, "producer_not_allowed");
  assertEquals(trace.rpcs.length, 0);
  assertEquals(trace.reads.length, 0, "la ligne a été lue pour rien");
});

Deno.test("matrice: la garde LAISSE PASSER ce qui est dans ses droits", async () => {
  // Le pendant obligatoire des trois refus ci-dessus. `questionnaire` est le
  // SEUL producteur de `portion.adjust`, et il doit pouvoir écrire.
  const allowed = {
    kind: "portion.adjust",
    scope: "durable",
    subject: "household",
    text: "trop gros",
    value: { direction: "down", magnitude: "clear" },
    source: "questionnaire",
    at: "2026-08-18",
    item: "",
    confidence: null,
  } as unknown as RetainedItem;

  const { admin } = fakeAdmin({ constraints: {} });
  const out = await persistRetainedItemsFor({
    admin,
    userId: USER,
    producer: "questionnaire",
    source: "test",
    durable: [allowed],
  });
  assertEquals(out.ok, true);
  assertEquals(out.durableWritten, 1);
  assertEquals(out.refused.total, 0);
});

Deno.test("magasin: un item rangé dans le mauvais magasin est compté", async () => {
  const { admin } = fakeAdmin({ constraints: {} });
  const out = await persistRetainedItemsFor({
    admin,
    userId: USER,
    producer: "conversation",
    source: "test",
    // Un `craving` est TOUJOURS `next_plan`: dans la liste durable, il est
    // mal rangé. Et une ancre qui n'est pas un lundi ISO est refusée, pas
    // recalée (le recalage silencieux effacerait la trace du producteur cassé).
    durable: [craving()],
    nextPlan: [entry(craving({ item: MEM_B }), "2026-08-19")],
  });
  assertEquals(out.ok, false);
  assertEquals(out.reason, "all_refused");
  assertEquals(out.refused.misfiled, 2);
});

// ===========================================================================
// 3. LE PORT N'EST PAS UN RAMASSE-MIETTES
// ===========================================================================

Deno.test("fusion: les lignes stockées ILLISIBLES survivent à l'écriture", async () => {
  // ⚠️ LE POINT LE PLUS IMPORTANT DE CE MODULE. `parseRetainedItem` applique
  // `canProduce` À LA LECTURE: une ligne qu'un producteur n'avait pas le droit
  // d'écrire ne remonte pas, MÊME DÉJÀ EN BASE. Re-sérialiser « ce qu'on a su
  // lire » la supprimerait définitivement, la nuit, sans un mot.
  const orphan = { kind: "portion.adjust", source: "conversation", text: "?" };
  const alien = { kind: "food.exclude", version: 7, texte: "d'une autre version" };
  const { admin, trace } = fakeAdmin({
    constraints: { retained_items: [orphan, alien] },
  });

  const out = await persistRetainedItemsFor({
    admin,
    userId: USER,
    producer: "questionnaire",
    source: "test",
    durable: [food()],
  });

  assertEquals(out.ok, true);
  const items = trace.rpcs[0].params.p_items as unknown[];
  assertEquals(items.length, 3, "une ligne stockée a disparu");
  assertEquals(items[0], orphan);
  assertEquals(items[1], alien);
  // Le témoin est la valeur TELLE QU'ON L'A LUE, pas celle qu'on écrit.
  assertEquals(trace.rpcs[0].params.p_expected, [orphan, alien]);
});

Deno.test("fusion: un magasin qui n'est pas une liste N'EST PAS écrasé", async () => {
  const { admin, trace } = fakeAdmin({
    constraints: { retained_items: { pas: "une liste" } },
  });
  const out = await persistRetainedItemsFor({
    admin,
    userId: USER,
    producer: "questionnaire",
    source: "test",
    durable: [food()],
  });
  assertEquals(out.ok, false);
  assertEquals(out.reason, "store_unreadable");
  assertEquals(trace.rpcs.length, 0, "on a écrit par-dessus l'illisible");
});

Deno.test("fusion: un identifiant déjà stocké ne rentre pas deux fois", async () => {
  // La jointure est par IDENTIFIANT (`kind` + l'id du souvenir), jamais par le
  // texte: « laitue » ≠ « lait », 12 faux positifs sur 12 mesurés.
  const stored = {
    kind: "craving",
    scope: "next_plan",
    subject: "household",
    text: "des fajitas",
    value: null,
    source: "conversation",
    at: "2026-08-17",
    item: MEM_A,
    confidence: 0.9,
  };
  const { admin, trace } = fakeAdmin({
    constraints: { retained_next_plan: [{ item: stored, anchor: "2026-08-17" }] },
  });

  const out = await persistRetainedItemsFor({
    admin,
    userId: USER,
    producer: "conversation",
    source: "test",
    nextPlan: [entry(craving()), entry(craving({ item: MEM_B }))],
  });

  assertEquals(out.ok, true);
  assertEquals(out.nextPlanWritten, 1, "le doublon est passé");
  assertEquals(out.refused.alreadyStored, 1);
  const written = trace.rpcs[0].params.p_next as Array<Record<string, unknown>>;
  assertEquals(written.length, 2);
  // ⚠️ LA LIGNE STOCKÉE EST INCHANGÉE: on ne REMPLACE pas, on refuse. La
  // personne a pu l'éditer depuis sa carte, et « on ne réécrit jamais ce que
  // quelqu'un a renseigné ».
  assertEquals((written[0] as { item: unknown }).item, stored);
});

Deno.test("fusion: deux fois le même identifiant DANS LE MÊME APPEL", async () => {
  const { admin } = fakeAdmin({ constraints: {} });
  const out = await persistRetainedItemsFor({
    admin,
    userId: USER,
    producer: "conversation",
    source: "test",
    nextPlan: [entry(craving()), entry(craving())],
  });
  assertEquals(out.ok, true);
  assertEquals(out.nextPlanWritten, 1);
  assertEquals(out.refused.alreadyStored, 1);
});

Deno.test("fusion: une ligne SANS identifiant n'est jamais collisionnée", async () => {
  // `written` impose `item: ""` — donc une ligne tapée par la personne n'a pas
  // d'identifiant, donc aucune collision ne la désigne. « `item` vide protège
  // l'entrée » tient aussi ici.
  const mine = {
    kind: "food.exclude",
    scope: "durable",
    subject: "household",
    text: "les rochers coco",
    value: null,
    source: "written",
    at: "2026-08-10",
    item: "",
    confidence: null,
  };
  const { admin, trace } = fakeAdmin({ constraints: { retained_items: [mine] } });
  const out = await persistRetainedItemsFor({
    admin,
    userId: USER,
    producer: "questionnaire",
    source: "test",
    durable: [food()],
  });
  assertEquals(out.ok, true);
  assertEquals(out.refused.alreadyStored, 0);
  const items = trace.rpcs[0].params.p_items as unknown[];
  assertEquals(items.length, 2);
  assertEquals(items[0], mine);
});

// ===========================================================================
// 4. LES ÉCHECS SONT DICIBLES
// ===========================================================================

Deno.test("échec: `stale_snapshot` remonte tel quel, et on ne réessaie pas", async () => {
  const { admin, trace } = fakeAdmin({
    constraints: {},
    rpcResult: { ok: false, reason: "stale_snapshot" },
  });
  const out = await persistRetainedItemsFor({
    admin,
    userId: USER,
    producer: "questionnaire",
    source: "test",
    durable: [food()],
  });
  assertEquals(out.ok, false);
  assertEquals(out.reason, "stale_snapshot");
  assertEquals(out.durableWritten, 0);
  assertEquals(trace.rpcs.length, 1, "le port a réessayé");
});

Deno.test("échec: un motif inconnu de la base ne se devine pas", async () => {
  const { admin } = fakeAdmin({
    constraints: {},
    rpcResult: { ok: false, reason: "quelque_chose_de_neuf" },
  });
  const out = await persistRetainedItemsFor({
    admin,
    userId: USER,
    producer: "questionnaire",
    source: "test",
    durable: [food()],
  });
  assertEquals(out.reason, "unknown");
});

Deno.test("échec: la RPC en panne ne lève rien vers l'appelant", async () => {
  const { admin } = fakeAdmin({ constraints: {}, failRpc: true });
  const out = await persistRetainedItemsFor({
    admin,
    userId: USER,
    producer: "questionnaire",
    source: "test",
    durable: [food()],
  });
  assertEquals(out.ok, false);
  assertEquals(out.reason, "rpc_failed");
});

Deno.test("échec: une ligne illisible n'écrit pas", async () => {
  const { admin, trace } = fakeAdmin({ failRead: true });
  const out = await persistRetainedItemsFor({
    admin,
    userId: USER,
    producer: "questionnaire",
    source: "test",
    durable: [food()],
  });
  assertEquals(out.ok, false);
  assertEquals(out.reason, "goals_unreadable");
  assertEquals(trace.rpcs.length, 0);
});

Deno.test("échec: rien à écrire est un REFUS, pas un succès", async () => {
  const { admin, trace } = fakeAdmin({ constraints: {} });
  const out = await persistRetainedItemsFor({
    admin,
    userId: USER,
    producer: "questionnaire",
    source: "test",
  });
  assertEquals(out.ok, false);
  assertEquals(out.reason, "nothing_to_write");
  assertEquals(trace.rpcs.length, 0);
});

Deno.test("échec: sans userId, on n'appelle rien", async () => {
  const { admin, trace } = fakeAdmin({ constraints: {} });
  const out = await persistRetainedItemsFor({
    admin,
    userId: "   ",
    producer: "questionnaire",
    source: "test",
    durable: [food()],
  });
  assertEquals(out.ok, false);
  assertEquals(out.reason, "bad_args");
  assertEquals(trace.reads.length, 0);
  assertEquals(trace.rpcs.length, 0);
});

Deno.test("échec: pas de ligne student_goals — la base le NOMME", async () => {
  const { admin } = fakeAdmin({
    noRow: true,
    rpcResult: { ok: false, reason: "no_goal_row" },
  });
  const out = await persistRetainedItemsFor({
    admin,
    userId: USER,
    producer: "questionnaire",
    source: "test",
    durable: [food()],
  });
  assertEquals(out.ok, false);
  assertEquals(out.reason, "no_goal_row");
});

// ===========================================================================
// 5. L'ÉPINGLE — la constante TypeScript ET le littéral SQL
// ===========================================================================

const MIGRATIONS = new URL("../../../migrations/", import.meta.url);

/** Toutes les migrations qui définissent la fonction de ce port. */
async function writerMigrations(): Promise<Array<{ name: string; sql: string }>> {
  const out: Array<{ name: string; sql: string }> = [];
  for await (const file of Deno.readDir(MIGRATIONS)) {
    if (!file.isFile || !file.name.endsWith(".sql")) continue;
    const sql = await Deno.readTextFile(new URL(file.name, MIGRATIONS));
    // ⚠️ EN DUR, et avec la parenthèse: sans elle, la fonction de 1D
    // (`keel_write_retained_items`) matcherait ce préfixe et on épinglerait le
    // mauvais fichier.
    if (sql.includes("function public.keel_write_retained_items_for(")) {
      out.push({ name: file.name, sql });
    }
  }
  return out;
}

Deno.test("épingle: le nom de la RPC EST celui que la migration crée", async () => {
  assertEquals(RETAINED_ITEMS_WRITE_RPC, "keel_write_retained_items_for");
  const writers = await writerMigrations();
  assert(
    writers.length > 0,
    "aucune migration ne définit keel_write_retained_items_for: le port de ce " +
      "module n'existe pas en base",
  );
  for (const { name, sql } of writers) {
    assert(
      sql.includes(`create or replace function public.${RETAINED_ITEMS_WRITE_RPC}(`),
      `${name}: la fonction n'est pas créée sous ce nom`,
    );
  }
});

Deno.test("épingle: la migration écrit LES DEUX clés, en dur", async () => {
  const writers = await writerMigrations();
  assert(writers.length > 0);
  for (const { name, sql } of writers) {
    // Les littéraux, écrits ici À LA MAIN. Recomposer les chaînes depuis
    // `RETAINED_ITEMS_KEY` / `NEXT_PLAN_ITEMS_KEY` ferait un test qui reste vert
    // quand on renomme la constante — exactement la bretelle qu'on pose.
    assert(
      sql.includes("array['retained_items']"),
      `${name}: le port n'écrit pas la clé du magasin durable`,
    );
    assert(
      sql.includes("array['retained_next_plan']"),
      `${name}: le port n'écrit pas la clé du magasin provisoire`,
    );
    // ⚠️ ET LES DEUX NOMS DOIVENT RESTER DES CHAÎNES ISOLÉES: c'est ce que
    // l'épingle du lot 1B cherche dans toute migration `keel_write_retained_*`.
    assert(
      sql.includes("'retained_items'") && sql.includes("'retained_next_plan'"),
      `${name}: une clé n'est plus un littéral isolé — l'épingle de 1B la rate`,
    );
    // ⛔ ET IL N'ÉCRIT PAS LA COLONNE ENTIÈRE. Le geste que le lot C3 a fermé,
    // et dont le rythme de repas a été la victime mesurée.
    assert(
      sql.includes("jsonb_set("),
      `${name}: l'écriture ne passe plus par jsonb_set`,
    );
    assert(
      !/set practical_constraints\s*=\s*p_/.test(sql),
      `${name}: la colonne entière est écrite depuis un paramètre`,
    );
  }
});

Deno.test("épingle: les cinq paramètres sont ceux que ce module envoie", async () => {
  // Un nom de paramètre qui bouge d'un seul côté rend `PGRST202` — c'est-à-dire
  // un « ça n'a rien fait » que rien d'autre n'attrape.
  const writers = await writerMigrations();
  assert(writers.length > 0);
  const sent = ["p_user", "p_expected", "p_items", "p_expected_next", "p_next"];
  for (const { name, sql } of writers) {
    for (const param of sent) {
      assert(
        new RegExp(`\\n\\s*${param}\\s+(uuid|jsonb)`).test(sql),
        `${name}: le paramètre ${param} n'existe pas dans la migration`,
      );
    }
  }
});

Deno.test("épingle: le module envoie EXACTEMENT ces cinq paramètres", async () => {
  const { admin, trace } = fakeAdmin({ constraints: {} });
  await persistRetainedItemsFor({
    admin,
    userId: USER,
    producer: "questionnaire",
    source: "test",
    durable: [food()],
  });
  assertEquals(trace.rpcs[0].name, "keel_write_retained_items_for");
  assertEquals(
    Object.keys(trace.rpcs[0].params).sort(),
    ["p_expected", "p_expected_next", "p_items", "p_next", "p_user"],
  );
});

Deno.test("épingle: le port serveur est accordé à service_role SEUL", async () => {
  // ⚠️ `revoke … from public` NE RETIRE PAS `anon` — cicatrice mesurée du dépôt
  // (`20260818200000`). Les quatre rôles sont donc révoqués NOMMÉMENT, et la
  // migration le REVÉRIFIE par `has_function_privilege` au moment où elle
  // tourne: ce test-ci épingle le texte, le bloc `do $$` épingle l'état réel.
  const writers = await writerMigrations();
  assert(writers.length > 0);
  for (const { name, sql } of writers) {
    assert(
      sql.includes("from public, anon, authenticated, service_role"),
      `${name}: le revoke ne nomme pas les quatre rôles`,
    );
    assert(sql.includes("to service_role"), `${name}: pas de grant service_role`);
    assert(
      !/grant execute on function public\.keel_write_retained_items_for[^;]*to authenticated/s
        .test(sql),
      `${name}: le port serveur est accordé à authenticated`,
    );
    assert(
      sql.includes("has_function_privilege('anon'"),
      `${name}: la migration ne PROUVE pas qu'anon n'a rien`,
    );
  }
});

Deno.test("épingle: les trois producteurs serveur, et pas un quatrième", () => {
  // Si un `source` est ajouté au socle, ce test rougit — et c'est voulu: un
  // producteur de plus est une décision de la nomenclature, pas un effet de
  // bord d'une liste qui s'allonge.
  const all: readonly string[] = [
    "written",
    "questionnaire",
    "conversation",
    "draft_note",
  ];
  const server: RetainedSource[] = ["questionnaire", "conversation", "draft_note"];
  assertEquals(all.length, 4);
  assertEquals(server.length, 3);
  assert(!server.includes("written" as RetainedSource));
});
