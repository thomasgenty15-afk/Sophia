/**
 * FF-023 — L'HISTORIQUE RÉCENT: bornes, fraîcheur, exclusion du tour courant.
 *
 * Chaque test nomme le défaut qu'il empêche de revenir, pas la ligne qu'il
 * couvre.
 */
import {
  assertEquals,
  assertStringIncludes,
} from "jsr:@std/assert@1";

import {
  boundRecentHistory,
  loadRecentChatHistory,
  RECENT_HISTORY_CONTENT_MAX_CHARS,
  RECENT_HISTORY_MESSAGE_LIMIT,
  sanitizeRecentHistoryRows,
} from "./recent_history.ts";

const HOUR = 60 * 60 * 1000;

function iso(offsetMs: number, base = Date.parse("2026-08-08T12:00:00.000Z")) {
  return new Date(base + offsetMs).toISOString();
}

Deno.test("le tour courant est exclu par son id — sinon le modèle le voit deux fois", () => {
  const { messages, excludedCurrent } = sanitizeRecentHistoryRows([
    { id: "a", role: "user", content: "salut", created_at: iso(-2 * HOUR) },
    { id: "b", role: "assistant", content: "salut !", created_at: iso(-HOUR) },
    { id: "c", role: "user", content: "et du coup ?", created_at: iso(0) },
  ], { excludeMessageId: "c" });
  assertEquals(excludedCurrent, 1);
  assertEquals(messages.map((m) => m.content), ["salut", "salut !"]);
});

Deno.test("sans id relu, le client_message_id exclut quand même le tour courant", () => {
  const { messages, excludedCurrent } = sanitizeRecentHistoryRows([
    { id: "a", role: "user", content: "salut", created_at: iso(-HOUR) },
    {
      id: "",
      role: "user",
      content: "et du coup ?",
      created_at: iso(0),
      metadata: { client_message_id: "cm-42" },
    },
  ], { excludeMessageId: null, excludeClientMessageId: "cm-42" });
  assertEquals(excludedCurrent, 1);
  assertEquals(messages.length, 1);
});

Deno.test("le client_message_id n'exclut JAMAIS une ligne assistant", () => {
  // La réponse porte `in_reply_to_client_message_id`, pas `client_message_id`;
  // mais si un jour elle le portait, retirer la réponse de Sophia du fil
  // casserait la continuité qu'on répare ici.
  const { messages, excludedCurrent } = sanitizeRecentHistoryRows([
    {
      id: "a",
      role: "assistant",
      content: "ma réponse",
      created_at: iso(-HOUR),
      metadata: { client_message_id: "cm-42" },
    },
  ], { excludeClientMessageId: "cm-42" });
  assertEquals(excludedCurrent, 0);
  assertEquals(messages.length, 1);
});

Deno.test("les rôles étrangers et les contenus vides sont jetés", () => {
  const { messages } = sanitizeRecentHistoryRows([
    { id: "a", role: "system", content: "consigne interne" },
    { id: "b", role: "user", content: "   " },
    { id: "c", role: "assistant", content: "ok" },
    null,
    "pas un objet",
  ]);
  assertEquals(messages.map((m) => m.content), ["ok"]);
});

Deno.test("un pavé est tronqué PAR MESSAGE — le budget de prompt ne se subit pas", () => {
  const { messages } = sanitizeRecentHistoryRows([
    { id: "a", role: "user", content: "x".repeat(4000) },
  ]);
  assertEquals(messages[0].content.length, RECENT_HISTORY_CONTENT_MAX_CHARS);
});

Deno.test("la borne vaut 20 — la valeur, pas la constante qui la nomme", () => {
  // Un test qui s'écrit `assertEquals(x, LA_CONSTANTE)` reste vert quand on
  // change la constante: il mesure sa propre définition. Le littéral est ici
  // pour que déplacer la borne CASSE quelque chose, et oblige à écrire
  // pourquoi. 20 = la borne des deux autres appelants de `processMessage`.
  assertEquals(RECENT_HISTORY_MESSAGE_LIMIT, 20);
});

Deno.test("la borne garde les N DERNIERS, pas les N premiers", () => {
  const rows = Array.from({ length: 40 }, (_, i) => ({
    role: "user" as const,
    content: `m${i}`,
    created_at: iso(-(40 - i) * 60 * 1000),
  }));
  const { messages } = boundRecentHistory(rows);
  assertEquals(messages.length, 20);
  assertEquals(messages[messages.length - 1].content, "m39");
  assertEquals(messages[0].content, "m20");
});

Deno.test("une borne de 0 rend ZÉRO message — `slice(-0)` rendait tout", () => {
  const rows = Array.from({ length: 5 }, (_, i) => ({
    role: "user" as const,
    content: `m${i}`,
    created_at: iso(-(5 - i) * 60 * 1000),
  }));
  assertEquals(boundRecentHistory(rows, { limit: 0 }).messages.length, 0);
});

Deno.test("sans ancre, le résultat ne dépend PAS de l'horloge du serveur", () => {
  // LE DÉFAUT QUE CE TEST EMPÊCHE DE REVENIR, et il est déjà arrivé:
  // `boundRecentHistory` retombait sur `Date.now()` quand l'ancre manquait.
  // Ses deux tests étaient verts le 2026-08-08 (jour du commit `1414face`) et
  // rouges le 2026-08-12, SANS QU'UNE SEULE LIGNE N'AIT BOUGÉ des deux côtés.
  // Deux lots les ont classés « rouges préexistants » et sont passés outre.
  const rows = Array.from({ length: 40 }, (_, i) => ({
    role: "user" as const,
    content: `m${i}`,
    created_at: iso(-(40 - i) * 60 * 1000),
  }));
  const realNow = Date.now;
  try {
    Date.now = () => Date.parse("2026-08-08T12:00:00.000Z");
    const auJour = boundRecentHistory(rows).messages.length;
    Date.now = () => Date.parse("2031-01-01T00:00:00.000Z");
    const cinqAnsPlusTard = boundRecentHistory(rows).messages.length;
    assertEquals(auJour, 20);
    assertEquals(cinqAnsPlusTard, 20);
  } finally {
    Date.now = realNow;
  }
});

Deno.test("hors fenêtre de 12 h: coupé, mais le DERNIER échange survit", () => {
  const nowIso = iso(0);
  const rows = [
    { role: "user" as const, content: "il y a trois jours", created_at: iso(-72 * HOUR) },
    { role: "assistant" as const, content: "réponse d'il y a trois jours", created_at: iso(-71 * HOUR) },
    { role: "user" as const, content: "aujourd'hui", created_at: iso(-30 * 60 * 1000) },
  ];
  const { messages, staleDropped } = boundRecentHistory(rows, { nowIso });
  assertEquals(staleDropped, 1);
  // Plancher de continuité: le dernier tour assistant→user reste, même vieux.
  assertEquals(messages.map((m) => m.content), [
    "réponse d'il y a trois jours",
    "aujourd'hui",
  ]);
});

Deno.test("une horloge illisible ne fait pas disparaître l'historique (fail-open)", () => {
  const rows = [
    { role: "user" as const, content: "a", created_at: iso(-HOUR) },
    { role: "assistant" as const, content: "b", created_at: iso(-30 * 60 * 1000) },
  ];
  const { messages, staleDropped } = boundRecentHistory(rows, {
    nowIso: "pas une date",
  });
  assertEquals(messages.length, 2);
  assertEquals(staleDropped, 0);
});

Deno.test("horloge illisible + messages TRÈS vieux: on garde quand même", () => {
  // La preuve que le fail-open est bien un fail-OPEN et pas un hasard de
  // fenêtre: les deux messages ont trois jours, largement hors des 12 h.
  const rows = [
    { role: "user" as const, content: "a", created_at: iso(-72 * HOUR) },
    { role: "user" as const, content: "b", created_at: iso(-71 * HOUR) },
  ];
  const { messages } = boundRecentHistory(rows, { nowIso: "" });
  assertEquals(messages.map((m) => m.content), ["a", "b"]);
});

// ── LE CHARGEUR, CONTRE UN FAUX CLIENT POSTGREST ────────────────────────────

function fakeAdmin(result: { data?: unknown; error?: unknown; throws?: boolean }) {
  const calls: Record<string, unknown> = {};
  const builder: Record<string, unknown> = {};
  const chain = (name: string) => (...args: unknown[]) => {
    calls[name] = args;
    return builder;
  };
  builder.select = chain("select");
  builder.eq = (col: string, val: unknown) => {
    calls[`eq:${col}`] = val;
    return builder;
  };
  builder.in = chain("in");
  builder.order = (col: string, opts: unknown) => {
    const seen = (calls.orders as string[] | undefined) ?? [];
    seen.push(`${col}:${JSON.stringify(opts)}`);
    calls.orders = seen;
    return builder;
  };
  builder.limit = (n: number) => {
    calls.limit = n;
    if (result.throws) throw new Error("boom");
    return Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
  };
  return {
    calls,
    client: {
      from: (table: string) => {
        calls.table = table;
        return builder;
      },
    } as never,
  };
}

Deno.test("le chargeur relit le fil dans le bon ordre et scope sur l'app", async () => {
  const { client, calls } = fakeAdmin({
    data: [
      { id: "c", role: "user", content: "récent", created_at: iso(-60 * 1000) },
      { id: "b", role: "assistant", content: "milieu", created_at: iso(-2 * 60 * 1000) },
      { id: "a", role: "user", content: "ancien", created_at: iso(-3 * 60 * 1000) },
    ],
  });
  const out = await loadRecentChatHistory(client, {
    userId: "u1",
    scope: "app",
    nowIso: iso(0),
  });
  assertEquals(calls.table, "chat_messages");
  assertEquals(calls["eq:user_id"], "u1");
  assertEquals(calls["eq:scope"], "app");
  assertEquals(out.messages.map((m) => m.content), ["ancien", "milieu", "récent"]);
  assertEquals(out.diagnostics.kept, 3);
  assertEquals(out.diagnostics.error, null);
});

Deno.test("un tri SECONDAIRE départage les timestamps égaux — l'ordre ne bouge plus", () => {
  // MESURÉ: deux messages concurrents du même élève portent le même
  // `created_at` à la milliseconde. Sans second critère, PostgreSQL rend
  // l'ordre qu'il veut, et il n'a aucune raison de rendre le même deux fois.
  const { client, calls } = fakeAdmin({ data: [] });
  return loadRecentChatHistory(client, { userId: "u1", scope: "app" }).then(() => {
    assertEquals(calls.orders, [
      'created_at:{"ascending":false}',
      'id:{"ascending":false}',
    ]);
  });
});

Deno.test("une lecture REFUSÉE rend [] et son motif — jamais un vide silencieux", async () => {
  const { client } = fakeAdmin({ error: { message: "permission denied" } });
  const out = await loadRecentChatHistory(client, { userId: "u1", scope: "app" });
  assertEquals(out.messages, []);
  assertStringIncludes(String(out.diagnostics.error), "permission denied");
});

Deno.test("une exception de transport rend [] et son motif", async () => {
  const { client } = fakeAdmin({ throws: true });
  const out = await loadRecentChatHistory(client, { userId: "u1", scope: "app" });
  assertEquals(out.messages, []);
  assertStringIncludes(String(out.diagnostics.error), "boom");
});

Deno.test("les lignes PHOTO sont de l'historique comme les autres (R1)", async () => {
  const { client } = fakeAdmin({
    data: [
      {
        id: "ack",
        role: "assistant",
        content: "Saved — chicken and rice, noted.",
        created_at: iso(-60 * 1000),
      },
      {
        id: "photo",
        role: "user",
        content: "[photo]",
        created_at: iso(-2 * 60 * 1000),
        metadata: { kind: "media" },
      },
      { id: "a", role: "user", content: "mon frère déménage", created_at: iso(-3 * 60 * 1000) },
    ],
  });
  const out = await loadRecentChatHistory(client, {
    userId: "u1",
    scope: "app",
    nowIso: iso(0),
  });
  assertEquals(out.messages.map((m) => m.content), [
    "mon frère déménage",
    "[photo]",
    "Saved — chicken and rice, noted.",
  ]);
});
