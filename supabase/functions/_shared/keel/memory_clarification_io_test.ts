// L'ORDRE DES QUATRE GESTES D'UNE QUESTION — et ce qui reste vrai quand l'un
// d'eux échoue.
//
// `askClarification` fait quatre choses qui peuvent chacune rater: elle libère
// la place, elle compte le budget du jour, elle ÉCRIT la ligne, puis elle
// LIVRE la bulle. Aucun type ne voit leur ordre, et chaque inversion a un prix
// nommé:
//
//   * livrer AVANT d'écrire ⇒ une bulle avec des boutons qui portent un
//     identifiant de ligne qui n'existe pas: chaque tap répond « plus
//     d'actualité », et personne ne peut le distinguer d'une question périmée.
//   * écrire AVANT de compter ⇒ le plafond devient décoratif: la ligne est
//     posée, la question ne part pas, et la place « une seule ouverte » est
//     prise par une question que personne n'a lue.
//   * ne pas fermer la ligne quand la livraison est refusée ⇒ une ligne `open`
//     éternelle qui bloque toutes les questions suivantes de cette personne.
//
// ── LE CLIENT EST UN ENREGISTREUR, PAS UNE BASE ───────────────────────────
// Chaque appel de table est tracé dans l'ordre, et la réponse de chaque table
// est configurable. Ce que ces tests mesurent est donc la SÉQUENCE que le
// module produit, pas ce qu'une base en ferait — c'est le banc en conditions
// réelles qui tient l'autre moitié (§2.6 du plan: « ces bancs ne prouvent
// pas… »).

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  askClarification,
  MEMORY_CLARIFICATION_ASK_REASONS,
  MEMORY_CLARIFICATION_TABLE,
  notifyMemoryWrite,
} from "./memory_clarification_io.ts";
import { MEMORY_CLARIFICATION_DAILY_CAP } from "./daily_ask_budget.ts";
import type {
  DraftNoteClarifyEntry,
  DraftNoteMember,
} from "./draft_note_classify.ts";

const USER = "11111111-1111-4111-8111-111111111111";
const LEA = "22222222-2222-4222-8222-222222222222";
const ZOE = "33333333-3333-4333-8333-333333333333";
const ROW = "44444444-4444-4444-8444-444444444444";

type Op = {
  table: string;
  ops: string[];
  args: unknown[][];
};

interface FakeOpts {
  /** Le nombre de demandes déjà faites aujourd'hui, du même genre. */
  asksToday?: number;
  /** L'insertion de la ligne échoue. */
  insertFails?: boolean;
  /** L'enregistrement au budget échoue. */
  recordFails?: boolean;
  /** La réservation du canal rend « pas de créneau » ⇒ livraison refusée. */
  claimFails?: boolean;
  /** Le profil n'existe pas ⇒ `unknown_user`. */
  noProfile?: boolean;
  /** Toute lecture lève — pour prouver qu'un refus PRÉCOCE ne touche rien. */
  explodes?: boolean;
}

function fake(opts: FakeOpts = {}) {
  const trace: Op[] = [];
  const rpcs: { name: string; params: Record<string, unknown> }[] = [];

  const replyFor = (table: string, ops: string[]): Record<string, unknown> => {
    const wrote = ops.includes("insert");
    if (table === "profiles") {
      return {
        data: opts.noProfile ? null : {
          timezone: "Europe/Paris",
          chat_last_inbound_at: null,
          proactive_muted_at: null,
          deletion_requested_at: null,
        },
        error: null,
      };
    }
    if (table === "meal_precision_questions") {
      if (wrote) {
        return opts.recordFails
          ? { data: null, error: { message: "ledger down", code: "XX000" } }
          : { data: { id: "ask-1" }, error: null };
      }
      // La lecture de budget: `count`, jamais `data`.
      return { data: null, error: null, count: opts.asksToday ?? 0 };
    }
    if (table === MEMORY_CLARIFICATION_TABLE) {
      if (wrote) {
        return opts.insertFails
          ? { data: null, error: { message: "insert down" } }
          : { data: { id: ROW }, error: null };
      }
      return { data: null, error: null };
    }
    if (table === "chat_messages") {
      return { data: { id: "chat-1" }, error: null };
    }
    return { data: null, error: null };
  };

  const chainFor = (table: string) => {
    const ops: string[] = [];
    const args: unknown[][] = [];
    const entry: Op = { table, ops, args };
    trace.push(entry);
    // deno-lint-ignore no-explicit-any
    const proxy: any = new Proxy({}, {
      get(_target, prop) {
        if (prop === "then") {
          const settled = Promise.resolve(replyFor(table, ops));
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
    from: (table: string) => {
      if (opts.explodes) throw new Error("aucune table ne doit être touchée");
      return chainFor(table);
    },
    rpc: (name: string, params: Record<string, unknown>) => {
      if (opts.explodes) throw new Error("aucune RPC ne doit être appelée");
      rpcs.push({ name, params });
      if (name === "claim_in_app_outbound") {
        return Promise.resolve({
          data: opts.claimFails ? null : "outbound-1",
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };
  // deno-lint-ignore no-explicit-any
  return { admin: admin as any, trace, rpcs };
}

const ENTRY: DraftNoteClarifyEntry = {
  about: "who",
  gate: "preferences",
  kind: "food.exclude",
  text: "poisson",
  subject: null,
  when: null,
  options: [LEA, ZOE],
};

const MEMBERS: DraftNoteMember[] = [
  { memberId: LEA, label: "Léa", ageState: "minor", sex: "female" },
  { memberId: ZOE, label: "Zoé", ageState: "minor", sex: "female" },
];

const ASK = {
  userId: USER,
  source: "draft_note" as const,
  entry: ENTRY,
  note: "Ma fille n'aime pas le poisson.",
  today: "2026-09-04",
  anchor: "2026-09-07",
  members: MEMBERS,
  language: "fr" as const,
  contentLocale: "fr-FR",
};

/** Les tables touchées, dans l'ordre, une fois par appel de `.from()`. */
const tables = (trace: Op[]): string[] => trace.map((op) => op.table);

/** L'index du premier INSERT dans cette table. */
const wroteAt = (trace: Op[], table: string): number =>
  trace.findIndex((op) => op.table === table && op.ops.includes("insert"));

/**
 * Les statuts que les `update` sur la table des questions ont posés, dans
 * l'ordre.
 *
 * ⚠️ IL Y EN A PLUSIEURS PAR APPEL, ET C'EST LA RAISON D'ÊTRE DE CE HELPER.
 * `askClarification` commence par LIBÉRER LA PLACE (une question ouverte plus
 * ancienne passe `expired`) avant de poser la sienne. Un test qui prendrait
 * « le premier update » lirait donc toujours ce balayage-là, et resterait vert
 * même si la clôture qu'il croit mesurer avait disparu.
 */
const closures = (trace: Op[]): string[] =>
  trace
    .filter((op) =>
      op.table === MEMORY_CLARIFICATION_TABLE && op.ops.includes("update")
    )
    .map((op) => String((op.args[0]?.[0] as Record<string, unknown>)?.status ?? ""));

// ===========================================================================
// 1. LE CAS QUI PASSE — sans lui, chaque garde ci-dessous serait une garde
//    cassée qui ressemble à une garde qui marche.
// ===========================================================================

Deno.test("demande: la question part, et la ligne existe avant la bulle", async () => {
  const { admin, trace, rpcs } = fake();
  const out = await askClarification(admin, ASK);

  assertEquals(out.asked, true);
  assertEquals(out.reason, "asked");
  assertEquals(out.id, ROW);

  // ── L'ORDRE, LE SEUL FAIT QU'AUCUN TYPE NE VOIT ────────────────────────
  const rowWritten = wroteAt(trace, MEMORY_CLARIFICATION_TABLE);
  const budgetWritten = wroteAt(trace, "meal_precision_questions");
  const bubbleWritten = wroteAt(trace, "chat_messages");
  assert(rowWritten >= 0, "la ligne n'a jamais été écrite");
  assert(budgetWritten >= 0, "le budget n'a jamais été enregistré");
  assert(bubbleWritten >= 0, "la bulle n'a jamais été écrite");
  assert(
    rowWritten < budgetWritten,
    "LA LIGNE EST ÉCRITE APRÈS LE BUDGET. L'enregistrement au budget porte " +
      "`memclar:<id>`: sans la ligne, il n'y a pas d'identifiant à y mettre.",
  );
  assert(
    budgetWritten < bubbleWritten,
    "LA BULLE PART AVANT D'ÊTRE COMPTÉE. Le plafond devient alors décoratif: " +
      "la personne a déjà lu le message quand on décide s'il avait le droit " +
      "de partir.",
  );

  // La réservation du canal a bien eu lieu, et la bulle porte des boutons.
  const claim = rpcs.find((r) => r.name === "claim_in_app_outbound");
  assert(claim, "le canal n'a jamais été réservé");
  assertEquals(claim?.params.p_message_type, "interactive_buttons");
});

Deno.test("demande: trois boutons — deux prénoms et l'échappatoire", async () => {
  const { admin, trace } = fake();
  await askClarification(admin, ASK);

  const bubble = trace.find((op) =>
    op.table === "chat_messages" && op.ops.includes("insert")
  );
  assert(bubble, "aucune bulle écrite");
  const payload = bubble!.args[0]?.[0] as Record<string, unknown>;
  const metadata = payload.metadata as Record<string, unknown>;
  const buttons = metadata.buttons as { payload: string; label: string }[];

  assertEquals(buttons.length, 3);
  assertEquals(buttons.map((b) => b.label), ["Léa", "Zoé", "Personne de la liste"]);
  // ⛔ CHAQUE BOUTON PORTE L'IDENTIFIANT DE **CETTE** LIGNE. Un payload qui ne
  // le porterait pas rendrait le tap impossible à rattacher.
  for (const button of buttons) {
    assert(
      button.payload.includes(ROW),
      `bouton sans identifiant de ligne: ${button.payload}`,
    );
  }
  // Et la bulle est une RÉPONSE: elle passe le mode silencieux.
  assertEquals(metadata.is_proactive, false);
});

// ===========================================================================
// 2. LES REFUS PRÉCOCES — ils ne doivent RIEN toucher
// ===========================================================================

Deno.test("refus: arguments vides — aucune table n'est ouverte", async () => {
  // ⚠️ `explodes` EST LA MOITIÉ QUI COMPTE. Un refus qui rend le bon motif
  // APRÈS avoir écrit une ligne laisserait une question fantôme qui bloque
  // toutes les suivantes — et le motif rendu serait identique.
  const { admin } = fake({ explodes: true });
  assertEquals(
    await askClarification(admin, { ...ASK, userId: "  " }),
    { asked: false, reason: "bad_args", id: null },
  );
  assertEquals(
    await askClarification(admin, {
      ...ASK,
      entry: { ...ENTRY, options: [] },
    }),
    { asked: false, reason: "bad_args", id: null },
  );
});

Deno.test("refus: un candidat sans prénom — rien n'est écrit", async () => {
  const { admin, trace } = fake();
  const out = await askClarification(admin, {
    ...ASK,
    // Zoé a été retirée du foyer entre la composition et ici.
    members: [MEMBERS[0]],
  });
  assertEquals(out.reason, "no_labels");
  assertEquals(out.id, null);
  assertEquals(
    wroteAt(trace, MEMORY_CLARIFICATION_TABLE),
    -1,
    "UNE LIGNE A ÉTÉ ÉCRITE POUR UNE QUESTION QU'ON NE PEUT PAS POSER. Elle " +
      "prendrait la place « une seule ouverte » sans qu'aucune bulle ne parte.",
  );
});

Deno.test("refus: le plafond du jour — compté AVANT d'écrire", async () => {
  const { admin, trace } = fake({ asksToday: MEMORY_CLARIFICATION_DAILY_CAP });
  const out = await askClarification(admin, ASK);
  assertEquals(out.reason, "daily_cap");
  assertEquals(out.id, null);
  assertEquals(
    wroteAt(trace, MEMORY_CLARIFICATION_TABLE),
    -1,
    "LE PLAFOND EST DÉCORATIF: la ligne est posée, la question ne part pas, " +
      "et la place de « une seule ouverte » est prise par une question que " +
      "personne n'a lue.",
  );
  // La lecture du budget, elle, a bien eu lieu.
  assert(tables(trace).includes("meal_precision_questions"));
});

Deno.test("refus: un cran SOUS le plafond passe encore", async () => {
  // LE CAS QUI PASSE du plafond: sans lui, un `>=` devenu `>` ou un plafond
  // tombé à zéro rendrait le test précédent vert pour la mauvaise raison.
  const { admin } = fake({ asksToday: MEMORY_CLARIFICATION_DAILY_CAP - 1 });
  assertEquals((await askClarification(admin, ASK)).asked, true);
});

// ===========================================================================
// 3. LES PANNES TARDIVES — la ligne ne reste JAMAIS `open`
// ===========================================================================

Deno.test("panne: l'insertion échoue — aucun identifiant rendu", async () => {
  const { admin } = fake({ insertFails: true });
  const out = await askClarification(admin, ASK);
  assertEquals(out.reason, "insert_failed");
  assertEquals(out.id, null);
});

Deno.test("panne: le budget refuse — la ligne est fermée `undelivered`", async () => {
  const { admin, trace } = fake({ recordFails: true });
  const out = await askClarification(admin, ASK);
  assertEquals(out.reason, "ask_record_failed");
  assertEquals(out.id, ROW, "l'identifiant est rendu pour que l'appelant le trace");

  assert(
    closures(trace).includes("undelivered"),
    "LA LIGNE RESTE `open` APRÈS UN ÉCHEC DE BUDGET. Elle bloquerait alors " +
      "toutes les questions suivantes de cette personne, indéfiniment: " +
      "l'index unique ne connaît pas la raison pour laquelle une ligne traîne. " +
      `Statuts posés: ${JSON.stringify(closures(trace))}`,
  );
});

Deno.test("panne: la livraison est refusée — la ligne est fermée aussi", async () => {
  const { admin, trace } = fake({ claimFails: true });
  const out = await askClarification(admin, ASK);
  assertEquals(out.asked, false);
  assertEquals(out.id, ROW);
  assert(
    closures(trace).includes("undelivered"),
    "LA LIGNE RESTE `open` ALORS QUE LA BULLE N'EST JAMAIS PARTIE. " +
      `Statuts posés: ${JSON.stringify(closures(trace))}`,
  );
});

Deno.test("panne: tous les motifs rendus sont dans le vocabulaire déclaré", async () => {
  // ⛔ UN MOTIF HORS LISTE EST UN MOTIF QU'AUCUN TABLEAU DE BORD NE COMPTE.
  const cases: FakeOpts[] = [
    {},
    { asksToday: 9 },
    { insertFails: true },
    { recordFails: true },
    { claimFails: true },
    { noProfile: true },
  ];
  for (const opts of cases) {
    const { admin } = fake(opts);
    const out = await askClarification(admin, ASK);
    assert(
      (MEMORY_CLARIFICATION_ASK_REASONS as readonly string[]).includes(
        out.reason,
      ),
      `motif hors vocabulaire: ${out.reason} (${JSON.stringify(opts)})`,
    );
  }
});

// ===========================================================================
// 4. LA NOTIFICATION — elle ne lève JAMAIS, et elle ouvre la carte
// ===========================================================================

Deno.test("notification: une ligne écrite, une bulle, un bouton « Voir »", async () => {
  const { admin, trace } = fake();
  const out = await notifyMemoryWrite(admin, {
    userId: USER,
    kept: [{ text: "pas de poisson", until: null, kind: "preference", who: "Léa" }],
    language: "fr",
  });
  assertEquals(out.delivered, true);

  const bubble = trace.find((op) =>
    op.table === "chat_messages" && op.ops.includes("insert")
  );
  assert(bubble, "aucune bulle");
  const payload = bubble!.args[0]?.[0] as Record<string, unknown>;
  const metadata = payload.metadata as Record<string, unknown>;
  const buttons = metadata.buttons as { payload: string; label: string }[];
  assertEquals(buttons.length, 1, "une notification pose UN bouton, pas une question");
  assertEquals(buttons[0].label, "Voir");
  assert(
    buttons[0].payload.startsWith("KEEL_VIEW_ABOUT_YOU|"),
    `le bouton ne mène pas à la carte: ${buttons[0].payload}`,
  );
  // La destination suit la ligne: une préférence ouvre le bloc des préférences.
  assertEquals(buttons[0].payload, "KEEL_VIEW_ABOUT_YOU|preferences");
  assert(String(payload.content).includes("Léa"));
});

Deno.test("notification: la destination du bouton suit le genre de la ligne", async () => {
  for (
    const [kind, block] of [
      ["preference", "preferences"],
      ["note", "notes"],
      ["next_plan", "next_plan"],
      ["setting", "settings"],
    ] as const
  ) {
    const { admin, trace } = fake();
    await notifyMemoryWrite(admin, {
      userId: USER,
      kept: [{ text: "quelque chose", until: null, kind, who: null }],
      language: "fr",
    });
    const bubble = trace.find((op) =>
      op.table === "chat_messages" && op.ops.includes("insert")
    );
    const metadata =
      (bubble!.args[0]?.[0] as Record<string, unknown>).metadata as Record<
        string,
        unknown
      >;
    const buttons = metadata.buttons as { payload: string }[];
    assertEquals(
      buttons[0].payload,
      `KEEL_VIEW_ABOUT_YOU|${block}`,
      `un « ${kind} » n'ouvre pas son propre bloc: la personne arrive sur ` +
        `une page où la ligne dont on vient de lui parler n'est pas.`,
    );
  }
});

Deno.test("notification: rien à dire — aucune bulle, aucun motif inventé", async () => {
  const { admin } = fake({ explodes: true });
  assertEquals(
    await notifyMemoryWrite(admin, { userId: USER, kept: [], language: "fr" }),
    { delivered: false, reason: "nothing_written" },
  );
  // Une ligne au texte vide n'est pas une ligne.
  assertEquals(
    (await notifyMemoryWrite(admin, {
      userId: USER,
      kept: [{ text: "   ", until: null, kind: "preference", who: null }],
      language: "fr",
    })).reason,
    "nothing_written",
  );
});

Deno.test("notification: le canal tombe — elle ne lève pas", async () => {
  // ⛔ CE MODULE TOURNE **APRÈS** QUE LE PLAN ET LA MÉMOIRE SONT ÉCRITS. Une
  // panne du canal ferait alors échouer une requête dont tout le travail est
  // fait, et la personne lirait « ça n'a pas marché » sur un plan qui existe.
  const { admin } = fake({ explodes: true });
  const out = await notifyMemoryWrite(admin, {
    userId: USER,
    kept: [{ text: "pas de poisson", until: null, kind: "preference", who: null }],
    language: "fr",
  });
  assertEquals(out.delivered, false);
  assert(out.reason.length > 0, "un refus muet ne se compte pas");
});
