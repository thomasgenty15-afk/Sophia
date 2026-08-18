// ═══════════════════════════════════════════════════════════════════════════
// LOT 2C — LE PRODUCTEUR « CONVERSATION », BRANCHÉ
//
// Ce que ces tests tiennent:
//
//   * ⛔ CE QUI SORT VA PAR LA PORTE, ET SOUS `producer: "conversation"`. Se
//     déclarer `written` contournerait la matrice ENTIÈRE par un seul mot —
//     `canProduce("written", …)` rend `true` pour les huit familles.
//   * ⛔ UN `portion.adjust` N'ATTEINT JAMAIS LA PORTE, même quand le modèle en
//     propose un: il est refusé AVANT, et il est COMPTÉ.
//   * ⛔ RIEN N'ENTRE SANS UN « KEEP »: sans reçu de confirmation, aucun appel
//     modèle, aucune écriture.
//   * ⚠️ LE MODÈLE EST DEMANDÉ PAR `keelGenerationModel()`, hors de toute
//     branche — « le générateur de foyer l'a déjà sauté en silence ».
//
// ⚠️ LE RUNNER INJECTÉ NE CHANGE PAS LE MODÈLE DEMANDÉ: `meta.model` est calculé
// avant la branche et lui est passé tel quel. Ces tests mesurent donc le modèle
// que la production aurait demandé.
// ═══════════════════════════════════════════════════════════════════════════

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  classifyAndPersistConversation,
  CONVERSATION_CLASSIFY_MAX_LINES,
  CONVERSATION_CLASSIFY_SOURCE,
  CONVERSATION_CLASSIFY_TIMEOUT_MS,
  joinKeptLinesToMemory,
} from "./conversation_retained_io.ts";
import { applyFoodPreferenceDecision } from "./food_preference_promotion.ts";

const USER = "44444444-4444-4444-8444-444444444444";
const MEM_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

/** Le `practical_constraints` d'une personne qui a gardé UNE proposition. */
function constraintsWithOneKeep(): Record<string, unknown> {
  return applyFoodPreferenceDecision({}, {
    kind: "keep",
    text: "N'aime pas le brocoli.",
    memoryItemId: MEM_A,
    seenAt: "2026-08-17",
  });
}

interface Trace {
  rpcs: Array<{ name: string; params: Record<string, unknown> }>;
  prompts: Array<{ system: string; user: string; model: string }>;
}

function fakeAdmin(opts: {
  constraints?: Record<string, unknown> | null;
  memoryRows?: Array<Record<string, unknown>>;
  failMemory?: boolean;
}) {
  const trace: Trace = { rpcs: [], prompts: [] };
  const from = (_table: string) => ({
    select: (_columns: string) => ({
      eq: (_col: string, _userId: unknown) => ({
        // La lecture du PORT (`student_goals`).
        maybeSingle: () =>
          Promise.resolve({
            data: { practical_constraints: opts.constraints ?? {} },
            error: null,
          }),
        // La lecture de CE module (`memory_items`), jointe par identifiant.
        in: (_c: string, _ids: unknown) =>
          Promise.resolve(
            opts.failMemory
              ? { data: null, error: { message: "memory down" } }
              : { data: opts.memoryRows ?? [], error: null },
          ),
      }),
    }),
  });
  const rpc = (name: string, params: Record<string, unknown>) => {
    trace.rpcs.push({ name, params });
    return Promise.resolve({ data: { ok: true }, error: null });
  };
  return { admin: { from, rpc }, trace };
}

function runner(items: unknown[], trace: Trace) {
  return (system: string, user: string, meta: { model: string }) => {
    trace.prompts.push({ system, user, model: meta.model });
    return Promise.resolve({ items });
  };
}

const MEMORY_ROW = { id: MEM_A, confidence: 0.82, created_at: "2026-08-17" };

// ---------------------------------------------------------------------------
// LE CAS QUI PASSE — sans lui, toutes les gardes qui suivent seraient des
// gardes cassées qui ressemblent à des gardes qui marchent.
// ---------------------------------------------------------------------------

Deno.test("ÉCRIT: une ligne confirmée devient un `RetainedItem` typé, par la PORTE", async () => {
  const { admin, trace } = fakeAdmin({
    constraints: constraintsWithOneKeep(),
    memoryRows: [MEMORY_ROW],
  });
  const out = await classifyAndPersistConversation({
    admin,
    userId: USER,
    constraints: constraintsWithOneKeep(),
    targetWeek: "2026-08-19",
    members: [],
    contentLocale: "fr-FR",
    run: runner([{
      memory_id: MEM_A,
      kind: "food.exclude",
      text: "Pas de brocoli.",
      member_id: null,
      value: null,
    }], trace),
  });

  assertEquals(out.ok, true);
  assertEquals(out.reason, "written");
  assertEquals(out.confirmed, 1);
  assertEquals(out.kept, 1);
  assertEquals(out.refused, 0);

  // ⛔ LA PORTE, ET ELLE SEULE. Écrire `practical_constraints` autrement
  // effacerait ce que la carte vient d'y poser.
  assertEquals(trace.rpcs.length, 1);
  assertEquals(trace.rpcs[0].name, "keel_write_retained_items_for");

  // ⛔ ET LA LIGNE PORTE `source: "conversation"`, JAMAIS `"written"`.
  const written = trace.rpcs[0].params.p_items as Array<Record<string, unknown>>;
  assertEquals(written.length, 1);
  assertEquals(written[0].kind, "food.exclude");
  assertEquals(written[0].source, "conversation");
  assertEquals(written[0].scope, "durable");
  assertEquals(written[0].item, MEM_A);
  // Le jour où ELLE l'a dit, et la confiance du souvenir — portée, pas seuillée.
  assertEquals(written[0].at, "2026-08-17");
  assertEquals(written[0].confidence, 0.82);
});

// ---------------------------------------------------------------------------
// ⛔ LES DEUX INTERDITS QUI TIENNENT LE LOT
// ---------------------------------------------------------------------------

Deno.test("⛔ UN `portion.adjust` N'ATTEINT JAMAIS LA PORTE", async () => {
  const { admin, trace } = fakeAdmin({
    constraints: constraintsWithOneKeep(),
    memoryRows: [MEMORY_ROW],
  });
  const out = await classifyAndPersistConversation({
    admin,
    userId: USER,
    constraints: constraintsWithOneKeep(),
    targetWeek: "2026-08-19",
    members: [],
    contentLocale: "fr-FR",
    run: runner([{
      memory_id: MEM_A,
      kind: "portion.adjust",
      text: "Trop gros.",
      value: { direction: "down", magnitude: "clear" },
    }], trace),
  });

  assertEquals(out.ok, false);
  assertEquals(out.reason, "nothing_to_file");
  // ⚠️ REFUSÉ **ET COMPTÉ**: sans ce nombre, une matrice désarmée ressemble à un
  // modèle qui n'a rien proposé.
  assertEquals(out.classification.refused.forbiddenKind, 1);
  // ⛔ ET AUCUNE ÉCRITURE. La porte n'est même pas appelée: rien ne peut se
  // glisser dans le magasin durable au passage.
  assertEquals(trace.rpcs.length, 0);
});

Deno.test("⛔ SANS « KEEP », NI APPEL MODÈLE NI ÉCRITURE", async () => {
  const { admin, trace } = fakeAdmin({ constraints: {}, memoryRows: [MEMORY_ROW] });
  const out = await classifyAndPersistConversation({
    admin,
    userId: USER,
    constraints: {},
    targetWeek: "2026-08-19",
    members: [],
    contentLocale: "fr-FR",
    run: runner([{ memory_id: MEM_A, kind: "food.exclude", text: "x", value: null }], trace),
  });
  assertEquals(out.ok, false);
  assertEquals(out.reason, "nothing_confirmed");
  // ⚠️ LE MODÈLE N'EST MÊME PAS APPELÉ: on ne paie pas un tour pour classer ce
  // que personne n'a confirmé.
  assertEquals(trace.prompts.length, 0);
  assertEquals(trace.rpcs.length, 0);
});

Deno.test("⚠️ UNE LIGNE ÉCRITE À LA MAIN NE DÉCLENCHE RIEN", async () => {
  // `item: ""` ⇒ elle appartient à la personne. Le memorizer ne la réclame pas,
  // donc il n'a rien à classer et n'appelle pas le modèle.
  const written = applyFoodPreferenceDecision({}, {
    kind: "write",
    text: "Je cuisine surtout le dimanche.",
  });
  const { admin, trace } = fakeAdmin({ constraints: written, memoryRows: [MEMORY_ROW] });
  const out = await classifyAndPersistConversation({
    admin,
    userId: USER,
    constraints: written,
    targetWeek: "2026-08-19",
    members: [],
    contentLocale: "fr-FR",
    run: runner([], trace),
  });
  assertEquals(out.reason, "nothing_confirmed");
  assertEquals(trace.prompts.length, 0);
  assertEquals(trace.rpcs.length, 0);
});

// ---------------------------------------------------------------------------
// LA JOINTURE, ET LE MODÈLE
// ---------------------------------------------------------------------------

Deno.test("LA JOINTURE EST PAR IDENTIFIANT, et une ligne sans souvenir TOMBE SEULE", () => {
  const refs = [
    { memoryItemId: MEM_A, text: "Pas de brocoli.", at: "2026-08-17" },
    { memoryItemId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", text: "Autre.", at: "2026-08-16" },
  ];
  // Souvenir INTROUVABLE ≠ souvenir démenti (purge RGPD, `limit` court). Ce
  // module ne fait qu'AJOUTER: ne rien ajouter est toujours sûr.
  const joined = joinKeptLinesToMemory({ refs, rows: [MEMORY_ROW] });
  assertEquals(joined.length, 1);
  assertEquals(joined[0].memoryItemId, MEM_A);
  assertEquals(joined[0].confidence, 0.82);

  // ⚠️ UNE CONFIANCE ILLISIBLE NE SE REMPLACE PAS PAR UNE VALEUR: le socle
  // l'exige pour cette source, et en inventer une fabriquerait sa mesure.
  assertEquals(
    joinKeptLinesToMemory({ refs, rows: [{ id: MEM_A, confidence: null }] }).length,
    0,
  );
  // ⚠️ ET UN `at` ABSENT FAIT TOMBER LA LIGNE, pas une date inventée: sans lui
  // on ne saurait pas écrire « je l'ai retenu de mardi ».
  assertEquals(
    joinKeptLinesToMemory({
      refs: [{ memoryItemId: MEM_A, text: "x", at: null }],
      rows: [MEMORY_ROW],
    }).length,
    0,
  );
});

Deno.test("LE MODÈLE EST DEMANDÉ, ET LE PROMPT PORTE LES LIGNES CONFIRMÉES", async () => {
  const { admin, trace } = fakeAdmin({
    constraints: constraintsWithOneKeep(),
    memoryRows: [MEMORY_ROW],
  });
  await classifyAndPersistConversation({
    admin,
    userId: USER,
    constraints: constraintsWithOneKeep(),
    targetWeek: "2026-08-19",
    members: [],
    contentLocale: "fr-FR",
    run: runner([], trace),
  });
  assertEquals(trace.prompts.length, 1);
  // ⚠️ NON VIDE: `keelGenerationModel()` est appelé hors de toute branche, donc
  // « a-t-il été sauté ? » est MESURABLE et pas affirmé.
  assert(trace.prompts[0].model.trim().length > 0);
  assert(trace.prompts[0].user.includes(MEM_A), "l'id à recopier n'est pas donné");
  assert(trace.prompts[0].user.includes("N'aime pas le brocoli."));
  assert(trace.prompts[0].user.includes("fr-FR"), "la langue n'est pas dite");
});

Deno.test("UNE MÉMOIRE ILLISIBLE EST NOMMÉE, PAS AVALÉE", async () => {
  const { admin, trace } = fakeAdmin({
    constraints: constraintsWithOneKeep(),
    failMemory: true,
  });
  const out = await classifyAndPersistConversation({
    admin,
    userId: USER,
    constraints: constraintsWithOneKeep(),
    targetWeek: "2026-08-19",
    members: [],
    contentLocale: "fr-FR",
    run: runner([], trace),
  });
  assertEquals(out.ok, false);
  assertEquals(out.reason, "memory_unreadable");
  assertEquals(trace.rpcs.length, 0);
});

Deno.test("LES DEUX CONSTANTES SONT ÉPINGLÉES À LEURS LITTÉRAUX", () => {
  // ⚠️ ÉCRITS EN DUR: un test paramétré par sa propre constante reste vert
  // quand on change la constante.
  assertEquals(CONVERSATION_CLASSIFY_SOURCE, "keel-conversation-classify");
  assertEquals(CONVERSATION_CLASSIFY_TIMEOUT_MS, 45000);
  assertEquals(CONVERSATION_CLASSIFY_MAX_LINES, 40);
  // Et la trace n'est PAS le jeton de la matrice: les confondre ferait dépendre
  // une règle de sécurité du nom d'une fonction (contrat §8 point 1).
  // ⚠️ Élargi en `string`: les deux littéraux sont si étroits que la
  // comparaison directe ne COMPILE pas (TS2367). Le compilateur tient déjà la
  // distinction; cette ligne tient le jour où l'un des deux serait élargi.
  const trace: string = CONVERSATION_CLASSIFY_SOURCE;
  assertEquals(trace === "conversation", false);
});
