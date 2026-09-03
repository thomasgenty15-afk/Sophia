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
    // LOT M2 — la phrase de la personne. Une écriture serveur sans elle est
    // REFUSÉE (`unquoted`): « sans la citation, Défaire est un pari ».
    quote: "les rochers coco, plus jamais",
    ...over,
  } as RetainedItem;
}

/**
 * ⚠️ `draft_note` DEPUIS LE LOT M1, ET PLUS `conversation`. Le memorizer est
 * retiré des producteurs: `persistRetainedItemsFor` refuse désormais son jeton
 * à la porte (`producer_not_allowed`), et une fixture qui le porterait ferait
 * rougir ces tests pour une raison qui n'est pas la leur.
 *
 * ⚠️ ET `item: MEM_A` EST DÉLIBÉRÉMENT PLUS RICHE QUE LE PRODUCTEUR RÉEL.
 * `draft_note_classify.ts` écrit `item: ""`; le socle, lui, l'autorise à porter
 * un uuid. On garde l'uuid ici parce que c'est la seule façon d'exercer la
 * déduplication par identité — voir l'aveu en tête de `withoutAlreadyStored`:
 * depuis M1, plus aucun producteur VIVANT ne porte d'identifiant, donc ces
 * tests prouvent que le code est juste, PAS que des doublons sont attrapés en
 * production.
 */
function craving(over: Record<string, unknown> = {}): RetainedItem {
  return {
    kind: "craving",
    scope: "next_plan",
    subject: "household",
    text: "des fajitas",
    value: null,
    source: "draft_note",
    at: "2026-08-18",
    item: MEM_A,
    confidence: null,
    quote: "j'aimerais des fajitas la semaine prochaine",
    ...over,
  } as RetainedItem;
}

function entry(item: RetainedItem, anchor = "2026-08-17"): NextPlanEntry {
  return { item, anchor, writtenAt: null };
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
    producer: "draft_note",
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

// ===========================================================================
// LOT M7 · LE COMPTEUR DU REPLI DE SÉCURITÉ, SUR CETTE PORTE
// ===========================================================================

Deno.test("M7: un allergène écrit en PRÉFÉRENCE sort dans la ligne du compteur", async () => {
  // ⛔ LE REPLI LE PLUS GRAVE DES DEUX SURFACES. Dans la conversation, un repli
  // ne produit qu'une phrase. Ici, un allergène nommé par la personne est ÉCRIT
  // dans un champ de préférences — un magasin qui alimente un prompt et que
  // RIEN ne vérifie en sortie. La ligne existe, elle a l'air de protéger, et
  // elle ne protège pas.
  //
  // ⚠️ ET CE PRODUCTEUR N'A AUCUN CHEMIN DE RATTRAPAGE: un bilan de fin de plan
  // ne peut pas appeler `declare_safety_constraint`. D'où `fell_back: true` dès
  // que `shaped` — ce n'est pas « l'outil a échoué », c'est « l'outil n'existe
  // pas sur ce chemin ».
  const lines: string[] = [];
  const info = console.info;
  console.info = (...args: unknown[]) => {
    lines.push(String(args[0] ?? ""));
  };
  try {
    const { admin } = fakeAdmin({ constraints: {} });
    const out = await persistRetainedItemsFor({
      admin,
      userId: USER,
      producer: "questionnaire",
      source: "test",
      durable: [food({ text: "je ne mange pas d'arachides" })],
    });
    assertEquals(out.ok, true, "le lot M7 ne doit RIEN bloquer");
    assertEquals(out.durableWritten, 1, "le compteur a changé l'écriture");
  } finally {
    console.info = info;
  }

  const counter = lines
    .map((line) => {
      try {
        return JSON.parse(line) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .find((row) => row?.tag === "keel/safety_fallback");
  assert(counter, "LE COMPTEUR N'A PAS ÉCRIT SA LIGNE sur cette écriture");
  assertEquals(counter.shaped, true, "l'allergène n'a pas été vu");
  assertEquals(counter.slugs, ["peanut"]);
  assertEquals(counter.fell_back, true);
  assertEquals(counter.filed_as_preference, true);
  assertEquals(counter.unreadable, false);
  // ⚠️ ET AUCUN `text` DANS LA LIGNE. Un journal n'est pas l'endroit où
  // recopier ce qu'une personne écrit sur sa santé; les slugs suffisent à
  // décider s'il faut agir, et ils ne désignent personne.
  assertEquals(
    Object.keys(counter).includes("text"),
    false,
    "LA LIGNE RECOPIE LE TEXTE DE LA PERSONNE",
  );
});

Deno.test("M7: une préférence ordinaire ne fait pas mordre le compteur", async () => {
  // LE CAS QUI NE MORD PAS. Sans lui, un compteur qui mord sur tout rendrait un
  // taux de 100 % et ressemblerait pourtant à un compteur qui marche.
  const lines: string[] = [];
  const info = console.info;
  console.info = (...args: unknown[]) => {
    lines.push(String(args[0] ?? ""));
  };
  try {
    const { admin } = fakeAdmin({ constraints: {} });
    await persistRetainedItemsFor({
      admin,
      userId: USER,
      producer: "questionnaire",
      source: "test",
      durable: [food({ text: "les rochers coco" })],
    });
  } finally {
    console.info = info;
  }
  const counter = lines
    .map((line) => {
      try {
        return JSON.parse(line) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .find((row) => row?.tag === "keel/safety_fallback");
  assert(counter, "le DÉNOMINATEUR a disparu: la ligne ne part plus à chaque écriture");
  assertEquals(counter.shaped, false);
  assertEquals(counter.fell_back, false);
});

Deno.test("matrice: un `source` sans droit est REFUSÉ et COMPTÉ", async () => {
  // Le brouillon n'a pas le droit d'écrire un `portion.adjust`: une mesure a
  // besoin d'un sujet, et seul le bilan pose la question avec la liste du foyer
  // sous les yeux (§5 ②). ⚠️ Le véhicule était `conversation` avant le lot M1;
  // ce producteur est désormais refusé À LA PORTE, donc il ne pouvait plus
  // atteindre la matrice — et ce test aurait mesuré l'autre garde.
  const forbidden = {
    kind: "portion.adjust",
    scope: "durable",
    subject: "household",
    text: "les parts étaient trop grosses",
    value: { direction: "down", magnitude: "clear" },
    source: "draft_note",
    at: "2026-08-18",
    item: MEM_A,
    confidence: null,
    quote: "les parts étaient trop grosses",
  } as unknown as RetainedItem;

  const { admin, trace } = fakeAdmin({ constraints: {} });
  const out = await persistRetainedItemsFor({
    admin,
    userId: USER,
    producer: "draft_note",
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

Deno.test("M2: une écriture serveur SANS CITATION est refusée et comptée", async () => {
  // ⛔ *« Sans la citation, "Défaire" est un pari. »* Une ligne qui apparaît sur
  // l'écran de quelqu'un sans dire d'où elle vient ne propose qu'un geste
  // aveugle: enlever, c'est peut-être défaire une erreur du produit, peut-être
  // perdre une chose vraiment demandée trois semaines plus tôt. Devant ce
  // doute on ne touche à rien — et le magasin ne décroît JAMAIS. C'est le
  // mécanisme exact de la boule de neige que ce chantier ferme.
  const { admin, trace } = fakeAdmin({ constraints: {} });
  const out = await persistRetainedItemsFor({
    admin,
    userId: USER,
    producer: "questionnaire",
    source: "test",
    durable: [food({ quote: null } as Partial<RetainedItem>)],
  });

  assertEquals(out.ok, false);
  assertEquals(out.reason, "all_refused");
  assertEquals(out.refused.unquoted, 1, "le refus n'est pas compté");
  assertEquals(out.refused.forbiddenKind, 0, "la mauvaise garde a mordu");
  assertEquals(out.refused.total, 1);
  // ⛔ ET LA BASE N'A PAS ÉTÉ APPELÉE: un refus qui écrit quand même est un
  // refus décoratif.
  assertEquals(trace.rpcs.length, 0);
});

Deno.test("M2: une citation VIDE ou blanche ne compte pas comme une citation", async () => {
  // Le repli le plus vraisemblable d'un producteur pressé: passer `""` pour
  // faire taire le type. Une chaîne blanche ne cite personne.
  for (const empty of ["", "   ", "\n\t"]) {
    const { admin } = fakeAdmin({ constraints: {} });
    const out = await persistRetainedItemsFor({
      admin,
      userId: USER,
      producer: "questionnaire",
      source: "test",
      durable: [food({ quote: empty } as Partial<RetainedItem>)],
    });
    assertEquals(out.refused.unquoted, 1, `${JSON.stringify(empty)} est passé`);
  }
});

Deno.test("M2: le refus ne mord PAS sur les lignes déjà stockées", async () => {
  // ⛔ LA MOITIÉ QUI EMPÊCHE LE LOT D'EFFACER SON PASSÉ. Les lignes écrites
  // AVANT M2 n'ont pas de citation. Si la garde les touchait, une écriture
  // neuve les emporterait — et le symptôme serait un magasin qui rétrécit tout
  // seul, la nuit, sans un mot. Le port ne réécrit jamais le stocké: il
  // concatène. Ce test épingle que le stocké NON CITÉ survit.
  const legacy = {
    kind: "food.exclude",
    scope: "durable",
    subject: "household",
    text: "d'avant le lot M2",
    value: null,
    source: "questionnaire",
    at: "2026-08-11",
    item: "",
    confidence: null,
    // pas de `quote` du tout — la forme d'avant le champ
  };
  const { admin, trace } = fakeAdmin({
    constraints: { retained_items: [legacy] },
  });
  const out = await persistRetainedItemsFor({
    admin,
    userId: USER,
    producer: "questionnaire",
    source: "test",
    durable: [food()],
  });

  assertEquals(out.ok, true);
  assertEquals(out.refused.unquoted, 0);
  const written = trace.rpcs[0].params.p_items as Array<Record<string, unknown>>;
  assertEquals(written.length, 2, "la ligne d'avant M2 a été emportée");
  assertEquals(written[0].text, "d'avant le lot M2");
  // Elle est recopiée TELLE QUELLE: pas de citation inventée, pas de clé
  // ajoutée. Le port n'est pas un ramasse-miettes.
  assertEquals(Object.keys(written[0]).includes("quote"), false);
});

Deno.test("matrice: un item étiqueté d'une AUTRE source est refusé", async () => {
  // ⚠️ SANS CETTE GARDE, LA MATRICE NE VAUT RIEN: le brouillon écrirait un
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
    quote: "trop gros",
  } as unknown as RetainedItem;

  const { admin, trace } = fakeAdmin({ constraints: {} });
  const out = await persistRetainedItemsFor({
    admin,
    userId: USER,
    producer: "draft_note",
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
    quote: "trop gros",
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
    producer: "draft_note",
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
    producer: "draft_note",
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
    producer: "draft_note",
    source: "test",
    nextPlan: [entry(craving()), entry(craving())],
  });
  assertEquals(out.ok, true);
  assertEquals(out.nextPlanWritten, 1);
  assertEquals(out.refused.alreadyStored, 1);
});

Deno.test("fusion: une ligne TAPÉE n'est jamais touchée, et elle bloque sa copie", async () => {
  // ⟳ CE TEST A ÉTÉ RENVERSÉ PAR LE LOT C (2026-09-03), ET LE RENVERSEMENT EST
  // LA MOITIÉ QUI COMPTE. Il exigeait `items.length === 2`: une ligne
  // `questionnaire` identique à une ligne TAPÉE s'ajoutait à côté d'elle, au
  // motif que « `item` vide protège l'entrée ».
  //
  // Ce motif reste vrai, et il est tenu ci-dessous: la ligne tapée est TOUJOURS
  // là, intacte, à sa place. Ce qui a changé est l'autre moitié — elle bloque
  // maintenant sa propre copie automatique.
  //
  // ── POURQUOI MAINTENANT, ET PAS AVANT ────────────────────────────────────
  // Jusqu'au lot C, le champ « Aliments refusés » d'une fiche de bouche
  // écrivait dans `household_food_restrictions`: une ligne tapée et une ligne
  // de bilan ne pouvaient PAS porter le même aliment dans le même magasin. Le
  // lot C les y met toutes les deux, et le doublon devient atteignable par le
  // geste le plus ordinaire du produit — taper « saumon » sur la fiche de son
  // fils, puis cocher « plus jamais » sur le bilan du plan.
  //
  // ⚠️ LE COÛT, dans les mots de ce fichier: « le modèle lirait deux fois la
  // même consigne — ce qui, dans un prompt, la RENFORCE sans que personne ne
  // l'ait demandé ».
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
  assertEquals(
    out.refused.alreadyStored,
    1,
    "le producteur a recopié une ligne que la personne avait tapée",
  );
  assertEquals(out.durableWritten, 0);
  // ⛔ ET LA SIENNE EST INTACTE — PAR CONSTRUCTION, pas par chance. Il n'y
  // avait plus rien à écrire, donc la porte n'a pas été ouverte du tout: aucune
  // écriture ne peut avoir remplacé sa phrase par celle d'une machine. C'est
  // plus fort qu'une comparaison de contenu, qui ne dirait rien du jour où le
  // module réécrirait la colonne pour rien.
  assertEquals(
    trace.rpcs.length,
    0,
    "une écriture est partie alors que tout était refusé: la colonne de la " +
      "personne bouge sur un tour qui n'ajoute rien",
  );
  assertEquals(out.reason, "all_refused");
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

Deno.test("épingle: les cinq paramètres d'origine sont dans CHAQUE migration du port", async () => {
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

Deno.test("épingle: LOT A — la DERNIÈRE migration du port porte les deux paramètres du mémo, et la clé", async () => {
  // ⚠️ SUR LA DERNIÈRE SEULEMENT: celle du 2026-08-18 définit la surcharge à
  // cinq, que celle du lot A supprime. Exiger `p_memo` partout ferait rougir
  // une migration d'histoire; ne l'exiger nulle part laisserait le module
  // envoyer sept paramètres à une fonction qui en prend cinq — `PGRST202`.
  const writers = await writerMigrations();
  assert(writers.length > 0);
  const latest = writers.map((w) => w.name).sort().at(-1)!;
  const sql = writers.find((w) => w.name === latest)!.sql;
  for (const param of ["p_expected_memo", "p_memo"]) {
    assert(
      new RegExp(`\\n\\s*${param}\\s+jsonb`).test(sql),
      `${latest}: le paramètre ${param} n'existe pas dans la migration`,
    );
  }
  assert(sql.includes("array['memo']"), `${latest}: le port n'écrit pas la clé du mémo`);
  assert(sql.includes("'bad_memo'"), `${latest}: un mémo qui n'est pas une liste n'est pas refusé`);
  // Et l'ancienne surcharge est SUPPRIMÉE, pas laissée à côté.
  assert(
    /drop function if exists public\.keel_write_retained_items_for\(uuid, jsonb, jsonb, jsonb, jsonb\)/.test(sql),
    `${latest}: la surcharge à cinq arguments n'est pas supprimée`,
  );
});

Deno.test("épingle: le module envoie EXACTEMENT ces sept paramètres", async () => {
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
    ["p_expected", "p_expected_memo", "p_expected_next", "p_items", "p_memo", "p_next", "p_user"],
  );
  // Sans mémo à écrire, la clé du mémo N'EST PAS TOUCHÉE: NULL des deux côtés.
  assertEquals(trace.rpcs[0].params.p_memo, null);
  assertEquals(trace.rpcs[0].params.p_expected_memo, null);
});

// ===========================================================================
// ⑩ LOT A — LE MÉMO ENTRE PAR LA MÊME PORTE (« ce que Sophia sait »)
// ===========================================================================

const LEA_SUBJECT = "member:aaaaaaaa-0000-4000-8000-000000000001";

function note(over: Record<string, unknown> = {}) {
  return {
    text: "danse le mardi, donc gros repas ce jour-là",
    at: "2026-09-03",
    source: "draft_note" as const,
    quote: "ma fille a danse le mardi soir, il lui faut un vrai repas",
    subject: LEA_SUBJECT,
    when: { weekday: "tue" as const, slot: "dinner" as const },
    ...over,
  };
}

Deno.test("mémo: une note part dans la RPC, avec SON témoin, sans toucher les deux autres clés", async () => {
  const { admin, trace } = fakeAdmin({ constraints: {} });
  const out = await persistRetainedItemsFor({
    admin,
    userId: USER,
    producer: "draft_note",
    source: "test",
    // deno-lint-ignore no-explicit-any
    memo: [note() as any],
  });
  assertEquals(out.ok, true);
  assertEquals(out.memoWritten, 1);
  assertEquals(out.memoStored, 1);
  const params = trace.rpcs[0].params;
  assertEquals(params.p_items, null, "la clé durable a été touchée");
  assertEquals(params.p_next, null, "la clé provisoire a été touchée");
  assertEquals(params.p_expected_memo, null);
  const memo = params.p_memo as Array<Record<string, unknown>>;
  assertEquals(memo.length, 1);
  assertEquals(memo[0].subject, LEA_SUBJECT);
  assertEquals(memo[0].when, { weekday: "tue", slot: "dinner" });
  assertEquals(memo[0].quote, "ma fille a danse le mardi soir, il lui faut un vrai repas");
});

Deno.test("mémo: les neuves DEVANT, les stockées VERBATIM derrière — même une ligne illisible", async () => {
  const stored = [
    { text: "d'avant", at: "2026-09-01", source: "draft_note", quote: "…" },
    "une ligne illisible que le port ne doit PAS jeter",
  ];
  const { admin, trace } = fakeAdmin({ constraints: { memo: stored } });
  const out = await persistRetainedItemsFor({
    admin,
    userId: USER,
    producer: "draft_note",
    source: "test",
    // deno-lint-ignore no-explicit-any
    memo: [note() as any],
  });
  assertEquals(out.memoWritten, 1);
  const params = trace.rpcs[0].params;
  assertEquals(params.p_expected_memo, stored, "le témoin n'est pas la valeur LUE");
  const memo = params.p_memo as unknown[];
  assertEquals(memo.length, 3);
  assertEquals((memo[0] as Record<string, unknown>).text, "danse le mardi, donc gros repas ce jour-là");
  assertEquals(memo[1], stored[0]);
  assertEquals(memo[2], stored[1]);
});

Deno.test("mémo: la MÊME phrase pour la MÊME personne n'entre pas deux fois — et c'est COMPTÉ", async () => {
  const { admin, trace } = fakeAdmin({ constraints: { memo: [note()] } });
  const out = await persistRetainedItemsFor({
    admin,
    userId: USER,
    producer: "draft_note",
    source: "test",
    // deno-lint-ignore no-explicit-any
    memo: [note({ text: "  Danse le MARDI, donc gros repas ce jour-là " }) as any],
  });
  assertEquals(out.ok, false);
  assertEquals(out.reason, "all_refused");
  assertEquals(out.refused.memoDuplicate, 1);
  assertEquals(trace.rpcs.length, 0, "une RPC est partie pour ne rien écrire");
});

Deno.test("mémo: la SIXIÈME pour la même personne est refusée `full` — les cinq restent, la RPC ne part pas", async () => {
  const five = Array.from({ length: 5 }, (_, i) => note({ text: `consigne n°${i}` }));
  const { admin, trace } = fakeAdmin({ constraints: { memo: five } });
  const out = await persistRetainedItemsFor({
    admin,
    userId: USER,
    producer: "draft_note",
    source: "test",
    // deno-lint-ignore no-explicit-any
    memo: [note({ text: "une sixième" }) as any],
  });
  assertEquals(out.reason, "all_refused");
  assertEquals(out.refused.memoFull, 1);
  assertEquals(trace.rpcs.length, 0);
});

Deno.test("mémo: le plafond est PAR PERSONNE — cinq pour Léa laissent entrer une note pour la table", async () => {
  const five = Array.from({ length: 5 }, (_, i) => note({ text: `consigne n°${i}` }));
  const { admin, trace } = fakeAdmin({ constraints: { memo: five } });
  const out = await persistRetainedItemsFor({
    admin,
    userId: USER,
    producer: "draft_note",
    source: "test",
    // deno-lint-ignore no-explicit-any
    memo: [note({ text: "on mange tard le vendredi", subject: "household", when: { weekday: "fri", slot: "dinner" } }) as any],
  });
  assertEquals(out.ok, true);
  assertEquals(out.memoWritten, 1);
  assertEquals((trace.rpcs[0].params.p_memo as unknown[]).length, 6);
});

Deno.test("mémo: une note d'une AUTRE source que le producteur est refusée `foreign_source`", async () => {
  const { admin, trace } = fakeAdmin({ constraints: {} });
  const out = await persistRetainedItemsFor({
    admin,
    userId: USER,
    producer: "draft_note",
    source: "test",
    // deno-lint-ignore no-explicit-any
    memo: [note({ source: "questionnaire" }) as any],
  });
  assertEquals(out.reason, "all_refused");
  assertEquals(out.refused.foreignSource, 1);
  assertEquals(trace.rpcs.length, 0);
});

Deno.test("mémo: une préférence ET une note partent dans LE MÊME appel — un reclassement ne se sépare pas", async () => {
  const { admin, trace } = fakeAdmin({ constraints: {} });
  const out = await persistRetainedItemsFor({
    admin,
    userId: USER,
    producer: "draft_note",
    source: "test",
    durable: [food({ source: "draft_note" })],
    // deno-lint-ignore no-explicit-any
    memo: [note() as any],
  });
  assertEquals(out.ok, true);
  assertEquals(out.durableWritten, 1);
  assertEquals(out.memoWritten, 1);
  assertEquals(trace.rpcs.length, 1);
  assertEquals((trace.rpcs[0].params.p_items as unknown[]).length, 1);
  assertEquals((trace.rpcs[0].params.p_memo as unknown[]).length, 1);
});

Deno.test("mémo: un magasin `memo` qui n'est pas une liste N'EST PAS écrasé", async () => {
  const { admin, trace } = fakeAdmin({ constraints: { memo: { broken: true } } });
  const out = await persistRetainedItemsFor({
    admin,
    userId: USER,
    producer: "draft_note",
    source: "test",
    // deno-lint-ignore no-explicit-any
    memo: [note() as any],
  });
  assertEquals(out.reason, "store_unreadable");
  assertEquals(trace.rpcs.length, 0);
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

Deno.test("épingle: les DEUX producteurs serveur, mesurés à la porte", async () => {
  // ⛔ CE TEST NE COMPARE PLUS DEUX TABLEAUX QU'IL ÉCRIT LUI-MÊME.
  //
  // Sa version précédente construisait `all` et `server` à la main, puis
  // vérifiait leurs LONGUEURS. Elle était donc verte quoi qu'il arrive au
  // module: on pouvait rouvrir un producteur, en fermer un autre, ou vider
  // `SERVER_SOURCES` sans qu'elle bronche — « un test paramétré par sa propre
  // constante reste vert quand on change la constante », et celui-ci n'était
  // même pas paramétré par la bonne.
  //
  // On mesure maintenant LA PORTE: pour chacune des quatre `source` du socle,
  // on APPELLE le port et on regarde s'il refuse `producer_not_allowed`. C'est
  // le seul énoncé qui ne peut pas mentir.
  const EXPECTED: Record<RetainedSource, boolean> = {
    // ⛔ La personne n'est pas un producteur serveur: `canProduce("written", …)`
    // rend `true` pour les huit familles, donc ce jeton contournerait la
    // matrice ENTIÈRE par un seul mot.
    written: false,
    questionnaire: true,
    // ⛔ LOT M1 — le memorizer est retiré. C'est la moitié « écriture » du
    // retrait: la matrice dit « cette famille, non », le port dit « cet
    // appelant, jamais ».
    conversation: false,
    draft_note: true,
  };

  for (const producer of Object.keys(EXPECTED) as RetainedSource[]) {
    const { admin, trace } = fakeAdmin({ constraints: {} });
    const out = await persistRetainedItemsFor({
      admin,
      userId: USER,
      producer: producer as ServerRetainedSource,
      source: "test",
      durable: [food({ source: producer })],
    });
    const allowed = out.reason !== "producer_not_allowed";
    assertEquals(allowed, EXPECTED[producer], `producteur ${producer}`);
    if (!allowed) {
      // ⚠️ ET LA BASE N'A PAS ÉTÉ APPELÉE. Un refus qui écrit quand même serait
      // un refus décoratif.
      assertEquals(trace.rpcs.length, 0, `${producer}: la base a été appelée`);
    }
  }

  // La ceinture de la ceinture: l'ensemble n'est ni vide ni total. Si les
  // quatre étaient refusés, la boucle serait verte en ne mesurant rien.
  const allowedCount = Object.values(EXPECTED).filter(Boolean).length;
  assertEquals(allowedCount, 2);
});

// ===========================================================================
// ⑨ ⛔ LE DOUBLON PAR CONTENU — mesuré le 2026-09-01, corrigé le même jour
//
// « Faute d'un producteur qui en fabrique » ne tenait pas: deux « refais-le »
// portant la même phrase écrivaient deux lignes identiques. Le coût est dans le
// PROMPT — deux fois la même consigne la RENFORCE, ce que personne n'a demandé.
// ===========================================================================

Deno.test("⛔ LA MÊME PHRASE, DEUX FOIS: la seconde n'entre pas", async () => {
  // Le producteur réel écrit `item: ""` — donc AUCUN uuid, donc l'identité
  // d'origine rendait `null` et rien ne mordait. C'est cette forme-là qu'on
  // exerce, pas la forme enrichie du reste du fichier.
  const line = { ...craving(), item: "", text: "Je n'aime pas le poulet" };
  const { admin, trace } = fakeAdmin({
    constraints: { retained_next_plan: [{ item: line, anchor: "2026-08-31" }] },
  });
  const out = await persistRetainedItemsFor({
    admin,
    userId: USER,
    producer: "draft_note",
    source: "test",
    nextPlan: [entry({ ...line })],
  });
  assertEquals(out.nextPlanWritten, 0, "la ligne identique a été réécrite");
  assertEquals(trace.rpcs.length, 0, "une RPC est partie pour ne rien écrire");
});

Deno.test("la casse et les espaces ne font pas deux lignes", async () => {
  const line = { ...craving(), item: "", text: "Je n'aime pas le poulet" };
  const { admin } = fakeAdmin({
    constraints: { retained_next_plan: [{ item: line, anchor: "2026-08-31" }] },
  });
  const out = await persistRetainedItemsFor({
    admin,
    userId: USER,
    producer: "draft_note",
    source: "test",
    nextPlan: [entry({ ...line, text: "  je n'aime PAS   le poulet " })],
  });
  assertEquals(out.nextPlanWritten, 0);
});

Deno.test("⛔ ÉGALITÉ, PAS RESSEMBLANCE — et un AUTRE sujet est une AUTRE ligne", async () => {
  // Sans ce cas, la garde du dessus serait indiscernable d'une garde qui refuse
  // tout. « laitue » ≠ « lait », et la ligne de Tom n'est pas celle du foyer.
  const line = { ...craving(), item: "", text: "Je n'aime pas le poulet" };
  const { admin } = fakeAdmin({
    constraints: { retained_next_plan: [{ item: line, anchor: "2026-08-31" }] },
  });
  const out = await persistRetainedItemsFor({
    admin,
    userId: USER,
    producer: "draft_note",
    source: "test",
    nextPlan: [
      entry({ ...line, text: "Je n'aime pas le poisson" }),
      entry({ ...line, subject: "member:11111111-2222-4333-8444-555555555555" }),
    ],
  });
  assertEquals(out.nextPlanWritten, 2, "deux lignes DIFFÉRENTES ont été fondues");
});

Deno.test("⛔ DEUX RÉPONSES DE PORTION IDENTIQUES COMPTENT DEUX FOIS", async () => {
  // ⛔ RÉGRESSION MESURÉE LE 2026-09-01, ET RÉPARÉE LE MÊME JOUR. Le
  // dédoublonnage par contenu a été ajouté pour un vrai défaut (deux
  // « refais-le » de la même semaine écrivaient deux lignes) — et il a emporté
  // les RÉPONSES DE PORTION avec: deux bilans disant « un peu trop » ne
  // laissaient qu'UNE ligne en base.
  //
  // Ça annule le lot M3, dont c'est toute la raison d'être: « elle redit "un
  // peu trop" DU PLAN CORRIGÉ, et on lui redonne le même −5 %. Elle n'avance
  // jamais. » Un indice qui ne peut pas dépasser un cran ne converge pas.
  const line = {
    ...food(),
    item: "",
    kind: "portion.adjust" as const,
    scope: "durable" as const,
    value: { direction: "down" as const, magnitude: "slight" as const },
    text: "Les portions étaient un peu trop grosses",
    source: "questionnaire" as RetainedSource,
  };
  const { admin } = fakeAdmin({ constraints: { retained_items: [line] } });
  const out = await persistRetainedItemsFor({
    admin,
    userId: USER,
    producer: "questionnaire",
    source: "test",
    durable: [{ ...line }],
  });
  assertEquals(
    out.durableWritten,
    1,
    "la seconde réponse de portion a été fondue: l'indice ne peut plus avancer",
  );
  assertEquals(out.refused.alreadyStored, 0);
});

Deno.test("⛔ ET LE DÉDOUBLONNAGE MORD TOUJOURS SUR LES AUTRES FAMILLES", async () => {
  // Sans ce cas, la garde du dessus serait indiscernable d'un dédoublonnage
  // entièrement retiré.
  const line = { ...craving(), item: "", text: "des fajitas" };
  const { admin } = fakeAdmin({
    constraints: { retained_next_plan: [{ item: line, anchor: "2026-08-31" }] },
  });
  const out = await persistRetainedItemsFor({
    admin,
    userId: USER,
    producer: "draft_note",
    source: "test",
    nextPlan: [entry({ ...line })],
  });
  assertEquals(out.nextPlanWritten, 0);
  // ⚠️ ET LA CHUTE EST COMPTÉE. `produced=1 written=0 refused=0` — trois
  // nombres qui ne s'additionnent pas — se lisait « la porte a échoué ».
  assertEquals(out.refused.alreadyStored, 1);
});

// ===========================================================================
// LOT C · UNE LIGNE TAPÉE PAR LA PERSONNE BLOQUE LA MÊME LIGNE AUTOMATIQUE
//
// ── LE CHEMIN QUE LE LOT C OUVRE ──────────────────────────────────────────
// Jusqu'au 2026-09-03, le champ « Aliments refusés » d'une fiche de bouche
// écrivait dans `household_food_restrictions`: une ligne TAPÉE et une ligne de
// BILAN ne pouvaient pas se rencontrer, elles n'étaient pas dans le même
// magasin. Le lot C les met dans le même (`retained_items`), et l'exemption de
// `written` — écrite pour protéger un geste humain délibéré — laissait alors un
// producteur AUTOMATIQUE recopier ce que la personne avait tapé.
//
// ⚠️ LE COÛT EST DANS LE PROMPT: deux `food.exclude` sur le saumon pèsent plus
// lourd qu'un, et personne n'a demandé ce poids.
// ===========================================================================

Deno.test("LOT C — un `written` DÉJÀ EN BASE bloque le même item d'un producteur", async () => {
  const typed = {
    ...food({ text: "saumon", subject: "member:11111111-1111-4111-8111-111111111111" }),
    source: "written",
    quote: null,
  };
  const { admin } = fakeAdmin({ constraints: { retained_items: [typed] } });
  const out = await persistRetainedItemsFor({
    admin,
    userId: USER,
    producer: "questionnaire",
    source: "test",
    // LE MÊME ALIMENT, LA MÊME BOUCHE, une casse et des espaces différents —
    // c'est la normalisation qui est en jeu, pas l'égalité de chaîne.
    durable: [food({
      text: "  Saumon  ",
      subject: "member:11111111-1111-4111-8111-111111111111",
    })],
  });
  assertEquals(
    out.durableWritten,
    0,
    "le bilan a recopié une ligne que la personne avait tapée: le modèle lit " +
      "deux fois la même consigne, ce qui la renforce sans qu'on l'ait demandé",
  );
  assertEquals(out.refused.alreadyStored, 1);
});

Deno.test("LOT C — …ET IL NE BLOQUE QUE CE QU'IL DIT VRAIMENT", async () => {
  // ⛔ LA MOITIÉ QUI EMPÊCHE LA GARDE DE DEVENIR UN MUR. Sans elle, une clé
  // fabriquée trop large — sur le seul `kind`, ou sur le seul sujet — rendrait
  // le test du dessus vert en bloquant TOUT ce qui suit une ligne tapée. La
  // clé est `(kind, sujet, texte normalisé)`, et chacun des trois compte.
  //
  // ⛔ ET « ÉGALITÉ, JAMAIS RESSEMBLANCE »: « laitue » ≠ « lait », douze faux
  // positifs sur douze mesurés dans ce dépôt. Deux aliments différents sont
  // deux lignes, même quand ils se ressemblent.
  const typed = {
    ...food({ text: "saumon", subject: "member:11111111-1111-4111-8111-111111111111" }),
    source: "written",
    quote: null,
  };
  const { admin } = fakeAdmin({ constraints: { retained_items: [typed] } });
  const out = await persistRetainedItemsFor({
    admin,
    userId: USER,
    producer: "questionnaire",
    source: "test",
    durable: [
      // un AUTRE aliment, la même bouche
      food({
        text: "cabillaud",
        subject: "member:11111111-1111-4111-8111-111111111111",
      }),
      // le même aliment, une AUTRE bouche
      food({
        text: "saumon",
        subject: "member:22222222-2222-4222-8222-222222222222",
      }),
      // le même aliment, la même bouche, une AUTRE famille
      food({
        kind: "food.prefer",
        text: "saumon",
        subject: "member:11111111-1111-4111-8111-111111111111",
      }),
    ],
  });
  assertEquals(
    out.durableWritten,
    3,
    "la garde du lot C bloque plus que ce qu'elle nomme: une ligne tapée fait " +
      "taire des lignes qui parlent d'autre chose, d'une autre bouche ou " +
      "d'une autre polarité",
  );
  assertEquals(out.refused.alreadyStored, 0);
});

Deno.test("LOT C — un `portion.adjust` en base ne bloque toujours RIEN", async () => {
  // ⛔ LA RÉGRESSION DU 2026-09-01, QUI NE DOIT PAS REVENIR PAR CE LOT. Les
  // familles-événements sont exemptées DES DEUX CÔTÉS: deux bilans qui disent
  // « un peu trop » doivent faire AVANCER l'indice, pas se fondre en un.
  const stored = {
    kind: "portion.adjust",
    scope: "durable",
    subject: "household",
    text: "des portions un peu trop grosses",
    value: { direction: "down", magnitude: "slight" },
    source: "questionnaire",
    at: "2026-08-18",
    item: "",
    confidence: null,
    quote: "un peu trop grosses",
  };
  const { admin } = fakeAdmin({ constraints: { retained_items: [stored] } });
  const out = await persistRetainedItemsFor({
    admin,
    userId: USER,
    producer: "questionnaire",
    source: "test",
    durable: [{ ...stored, at: "2026-08-25" } as unknown as RetainedItem],
  });
  assertEquals(out.durableWritten, 1);
  assertEquals(out.refused.alreadyStored, 0);
});
