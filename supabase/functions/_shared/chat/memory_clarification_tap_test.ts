// LE TAP QUI COMPLÈTE UNE NOTE — et les quatre façons dont il peut mentir.
//
// Ce module écrit en mémoire à partir d'un bouton. Sous `service_role`, RLS ne
// contraint rien: tout ce qui empêche une charge forgée d'écrire dans le
// compte d'un autre est ÉCRIT DANS CE FICHIER-LÀ, et donc gardé ici.
//
//   ① la ligne se charge par PROPRIÉTAIRE, jamais par l'identifiant reçu;
//   ② l'index est borné sur les options RÉELLEMENT stockées;
//   ③ la fraîcheur se juge AU TAP, pas au passage d'un cron;
//   ④ « aucun de ceux-là » n'écrit rien, et une écriture ratée laisse la ligne
//      OUVERTE — un accusé optimiste apprendrait que les accusés ne valent rien.
//
// ⛔ ET LES QUATRE REFUS DISENT LA MÊME PHRASE. Un message par cas serait un
// oracle: il dirait à qui tape au hasard laquelle de ses charges forgées a
// désigné quelque chose de réel.

import { assert, assertEquals } from "jsr:@std/assert@1";

import { handleMemoryClarificationTap } from "./memory_clarification_tap.ts";
import {
  memoryClarificationNoneId,
  memoryClarificationPickId,
  type PendingClarification,
  readMemoryClarificationReply,
} from "../keel/memory_clarification.ts";

const USER = "11111111-1111-4111-8111-111111111111";
const LEA = "22222222-2222-4222-8222-222222222222";
const ZOE = "33333333-3333-4333-8333-333333333333";
const ROW = "44444444-4444-4444-8444-444444444444";
const OTHER = "55555555-5555-4555-8555-555555555555";

const NOW = new Date("2026-09-04T18:00:00.000Z");
const LATER = "2026-09-06T18:00:00.000Z";
const PASSED = "2026-09-03T18:00:00.000Z";

const PENDING: PendingClarification = {
  about: "who",
  gate: "preferences",
  kind: "food.exclude",
  text: "poisson",
  subject: null,
  when: null,
  note: "Ma fille n'aime pas le poisson.",
  at: "2026-09-04",
  anchor: "2026-09-07",
};

interface FakeOpts {
  /** `null` = aucune question ouverte pour cette personne. */
  row?: Record<string, unknown> | null;
  /** La RPC d'écriture refuse. */
  writeFails?: boolean;
}

function fake(opts: FakeOpts = {}) {
  const updates: Record<string, unknown>[] = [];
  const rpcs: { name: string; params: Record<string, unknown> }[] = [];

  const row = opts.row === undefined
    ? {
      id: ROW,
      user_id: USER,
      about: "who",
      pending: PENDING,
      options: [LEA, ZOE],
      content_locale: "fr-FR",
      expires_at: LATER,
    }
    : opts.row;

  const chainFor = (table: string) => {
    const ops: string[] = [];
    const args: unknown[][] = [];
    // deno-lint-ignore no-explicit-any
    const proxy: any = new Proxy({}, {
      get(_t, prop) {
        if (prop === "then") {
          let reply: Record<string, unknown> = { data: null, error: null };
          if (ops.includes("update")) {
            updates.push(args[0]?.[0] as Record<string, unknown>);
            reply = { data: [{ id: ROW }], error: null };
          } else if (ops.includes("select")) {
            reply = { data: row, error: null };
          } else if (table === "chat_messages" || table === "profiles") {
            reply = { data: { id: "x" }, error: null };
          }
          const settled = Promise.resolve(reply);
          return settled.then.bind(settled);
        }
        return (...called: unknown[]) => {
          ops.push(String(prop));
          args.push(called);
          return proxy;
        };
      },
    });
    return proxy;
  };

  const admin = {
    from: (table: string) => chainFor(table),
    rpc: (name: string, params: Record<string, unknown>) => {
      rpcs.push({ name, params });
      if (name === "keel_write_retained_items_for") {
        return Promise.resolve({
          data: opts.writeFails
            ? { ok: false, reason: "port_down" }
            : { ok: true, written: true, durable_written: 1 },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };
  // deno-lint-ignore no-explicit-any
  return { admin: admin as any, updates, rpcs };
}

const nameOf = (id: string) =>
  id === LEA ? "Léa" : id === ZOE ? "Zoé" : null;

function reply(payload: string) {
  const parsed = readMemoryClarificationReply(payload);
  assert(parsed.kind !== "none", `charge illisible: ${payload}`);
  return parsed as Exclude<typeof parsed, { kind: "none" }>;
}

const tap = (
  // deno-lint-ignore no-explicit-any
  admin: any,
  payload: string,
  now: Date = NOW,
) =>
  handleMemoryClarificationTap(admin, {
    userId: USER,
    reply: reply(payload),
    language: "fr",
    nameOf,
    now,
  });

/** Les statuts posés par les clôtures, dans l'ordre. */
const closures = (updates: Record<string, unknown>[]): string[] =>
  updates.map((u) => String(u.status ?? ""));

// ===========================================================================
// 1. LE CAS QUI PASSE
// ===========================================================================

Deno.test("tap: la ligne s'écrit, la question se ferme, l'accusé ouvre la carte", async () => {
  const { admin, updates, rpcs } = fake();
  const out = await tap(admin, memoryClarificationPickId(ROW, 0));

  assertEquals(out.handledAs, "keel_memory_clarification_answered");
  assertEquals(closures(updates), ["answered"]);

  // ── L'ÉCRITURE PASSE PAR LE PORT, avec le producteur d'ORIGINE ─────────
  // ⛔ `draft_note`, JAMAIS `conversation`. Le chat n'est pas une source de
  // mémoire (§2.1): ce tap complète une entrée que la personne a écrite
  // elle-même. Basculer le producteur ouvrirait au chat une porte que la
  // matrice des droits ferme.
  const write = rpcs.find((r) => r.name === "keel_write_retained_items_for");
  assert(write, "rien n'a été écrit");

  // La ligne écrite porte le sujet TAPÉ et la citation de la personne.
  const items = write?.params.p_items as Record<string, unknown>[];
  assertEquals(items.length, 1);
  assertEquals(items[0].subject, `member:${LEA}`);
  assertEquals(items[0].text, "poisson");
  assertEquals(items[0].quote, PENDING.note);
  // ⛔ `draft_note`, JAMAIS `conversation`. La RPC ne prend pas le producteur —
  // il arme la garde côté appelant — mais la ligne, elle, porte sa PROVENANCE,
  // et c'est elle que la carte affiche. La marquer `conversation` dirait que le
  // chat est une source de mémoire, ce que §2.1 interdit: ce tap ne fournit que
  // le SLOT manquant d'une phrase que la personne a tapée elle-même, sur son
  // brouillon ou dans le champ libre de son bilan.
  assertEquals(items[0].source, "draft_note");
  assertEquals(items[0].at, PENDING.at, "la ligne prend le jour de la SOURCE");

  // L'accusé nomme la personne et porte le bouton vers la carte.
  assert(out.body.includes("Léa"), `l'accusé ne nomme pas la bouche: ${out.body}`);
  assertEquals(out.buttons.length, 1);
  assertEquals(out.buttons[0].payload, "KEEL_VIEW_ABOUT_YOU|preferences");
});

Deno.test("tap: le second bouton écrit la SECONDE bouche", async () => {
  // Sans ce cas, un index cloué à 0 rendrait le test précédent vert et
  // rangerait toutes les réponses chez la première personne de la liste.
  const { admin, rpcs } = fake();
  const out = await tap(admin, memoryClarificationPickId(ROW, 1));
  assertEquals(out.handledAs, "keel_memory_clarification_answered");
  const write = rpcs.find((r) => r.name === "keel_write_retained_items_for");
  const items = write?.params.p_items as Record<string, unknown>[];
  assertEquals(items[0].subject, `member:${ZOE}`);
  assert(out.body.includes("Zoé"));
});

// ===========================================================================
// 2. LES QUATRE REFUS — même phrase, rien d'écrit
// ===========================================================================

Deno.test("refus: aucune question ouverte", async () => {
  const { admin, rpcs } = fake({ row: null });
  const out = await tap(admin, memoryClarificationPickId(ROW, 0));
  assertEquals(out.handledAs, "keel_memory_clarification_stale");
  assertEquals(rpcs.length, 0, "une écriture a eu lieu sans ligne ouverte");
});

Deno.test("refus: la charge nomme la ligne de QUELQU'UN D'AUTRE", async () => {
  // ⛔ LE CŒUR DE LA GARDE. La ligne chargée est celle du PROPRIÉTAIRE; la
  // charge ne fait que la valider. Si l'identifiant reçu SÉLECTIONNAIT la
  // ligne, un uuid forgé rendrait — et écrirait dans — la question d'un autre.
  const { admin, rpcs, updates } = fake();
  const out = await tap(admin, memoryClarificationPickId(OTHER, 0));
  assertEquals(out.handledAs, "keel_memory_clarification_stale");
  assertEquals(rpcs.length, 0);
  assertEquals(updates.length, 0, "la question d'aujourd'hui a été fermée");
});

Deno.test("refus: la question a passé sa date — jugée AU TAP", async () => {
  // ⚠️ PAS « QUAND LE CRON PASSERA ». Lire la fraîcheur autrement ferait
  // dépendre le produit de l'heure d'un balayage: une question de la semaine
  // dernière serait tapable tant que le pouls n'a pas tourné.
  const { admin, rpcs, updates } = fake({
    row: {
      id: ROW,
      user_id: USER,
      about: "who",
      pending: PENDING,
      options: [LEA, ZOE],
      content_locale: "fr-FR",
      expires_at: PASSED,
    },
  });
  const out = await tap(admin, memoryClarificationPickId(ROW, 0));
  assertEquals(out.handledAs, "keel_memory_clarification_stale");
  assertEquals(rpcs.length, 0);
  assertEquals(closures(updates), ["expired"]);
});

Deno.test("refus: l'index sort des options STOCKÉES", async () => {
  // ⛔ LA BORNE HAUTE NE PEUT VIVRE QU'ICI: le lecteur pur valide la FORME de
  // l'index (`/^\d$/`), il ne connaît pas la longueur de la liste. Une charge
  // qui nomme l'index 3 sur une question à deux boutons a été fabriquée.
  const { admin, rpcs } = fake();
  const out = await tap(admin, memoryClarificationPickId(ROW, 3));
  assertEquals(out.handledAs, "keel_memory_clarification_stale");
  assertEquals(rpcs.length, 0);
});

Deno.test("refus: les quatre disent EXACTEMENT la même phrase", async () => {
  const bodies = new Set<string>();
  for (
    const [opts, payload] of [
      [{ row: null }, memoryClarificationPickId(ROW, 0)],
      [{}, memoryClarificationPickId(OTHER, 0)],
      [{}, memoryClarificationPickId(ROW, 9)],
      [
        {
          row: {
            id: ROW,
            user_id: USER,
            about: "who",
            pending: PENDING,
            options: [LEA, ZOE],
            content_locale: "fr-FR",
            expires_at: PASSED,
          },
        },
        memoryClarificationPickId(ROW, 0),
      ],
    ] as [FakeOpts, string][]
  ) {
    const { admin } = fake(opts);
    bodies.add((await tap(admin, payload)).body);
  }
  assertEquals(
    bodies.size,
    1,
    `LES REFUS SE DISTINGUENT — c'est un oracle: ${JSON.stringify([...bodies])}`,
  );
});

// ===========================================================================
// 3. L'ÉCHAPPATOIRE, ET LA PANNE D'ÉCRITURE
// ===========================================================================

Deno.test("échappatoire: « aucun de ceux-là » n'écrit rien, et se DISTINGUE", async () => {
  const { admin, rpcs, updates } = fake();
  const out = await tap(admin, memoryClarificationNoneId(ROW));
  assertEquals(out.handledAs, "keel_memory_clarification_declined");
  assertEquals(rpcs.length, 0, "un refus explicite a écrit quelque chose");
  assertEquals(closures(updates), ["declined"]);
  // ⚠️ `declined` ET PAS `expired`: c'est ce qui sépare « ce n'est ni l'une ni
  // l'autre » de « je n'ai pas vu la question ». Sans cette distinction, on ne
  // saurait jamais si les relances ratent leur cible ou passent inaperçues.
  assertEquals(out.buttons.length, 0, "un refus n'ouvre pas la carte");
});

Deno.test("panne: le port refuse — la ligne reste OUVERTE, et l'accusé ne ment pas", async () => {
  const { admin, updates } = fake({ writeFails: true });
  const out = await tap(admin, memoryClarificationPickId(ROW, 0));
  assertEquals(out.handledAs, "keel_memory_clarification_write_failed");
  assertEquals(
    updates.length,
    0,
    "LA LIGNE A ÉTÉ FERMÉE SUR UNE PANNE PASSAGÈRE. La question est perdue " +
      "pour de bon, et la personne a tapé pour rien.",
  );
  assert(
    !/noté|enregistré ça/i.test(out.body),
    `UN ACCUSÉ OPTIMISTE SUR UNE ÉCRITURE RATÉE: « ${out.body} ». Il apprend ` +
      "à la personne que les accusés ne veulent rien dire.",
  );
});
