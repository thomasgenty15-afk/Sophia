import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  clarificationEscapeLabel,
  MEMORY_CLARIFICATION_ABOUTS,
  MEMORY_CLARIFICATION_BUTTON_PREFIX,
  MEMORY_CLARIFICATION_MAX_OPTIONS,
  MEMORY_VIEW_BUTTON_PAYLOAD_PREFIX,
  memoryClarificationNoneId,
  memoryClarificationPickId,
  NAVIGATION_BUTTON_PREFIX,
  type PendingClarification,
  readMemoryClarificationReply,
  renderClarificationQuestion,
  resolveClarification,
} from "./memory_clarification.ts";

// ===========================================================================
// LA QUESTION QUI NE BLOQUE PAS — le vocabulaire, le lecteur, la résolution
//
// ── CE QUE CE FICHIER GARDE ───────────────────────────────────────────────
// Une charge de bouton est la SEULE chose que le client contrôle dans ce
// chemin. Elle arrive par `chat-inbound-v1` avec le jeton de la personne, et
// elle décide de ce qui entre dans sa mémoire par un port `service_role`. Tout
// ce qu'elle ne valide pas est une porte ouverte.
//
// ⚠️ L'INDEX PLUTÔT QUE LA VALEUR, et c'est le choix de forme qui porte tout le
// reste: un terme d'aliment peut contenir une barre verticale, une espace, une
// apostrophe. Un index à un chiffre ne le peut pas — et il se compare aux
// options STOCKÉES, jamais à ce que la bulle affichait.
// ===========================================================================

const ROW = "aaaaaaaa-1111-4111-8111-111111111111";
const LEA = "11111111-1111-4111-8111-111111111111";
const NOTE = "Ma fille n'aime pas le poisson.";

function pendingWho(over: Partial<PendingClarification> = {}): PendingClarification {
  return {
    about: "who",
    gate: "preferences",
    kind: "food.exclude",
    text: "poisson",
    subject: null,
    when: null,
    note: NOTE,
    at: "2026-09-04",
    anchor: "2026-09-07",
    ...over,
  };
}

// ---------------------------------------------------------------------------
// 1. Le vocabulaire
// ---------------------------------------------------------------------------

Deno.test("les deux `about`, et la liste est fermée", () => {
  assertEquals([...MEMORY_CLARIFICATION_ABOUTS], ["who", "what"]);
});

Deno.test("quatre options au plus — au-delà c'est un formulaire", () => {
  // Miroir du CHECK `options between 1 and 4` de la migration 20260904090000.
  // Le nombre vit aux DEUX endroits parce que la base est le dernier mot et le
  // module le premier: les laisser diverger ferait refuser en base une question
  // que le code a composée, au moment de l'écrire.
  assertEquals(MEMORY_CLARIFICATION_MAX_OPTIONS, 4);
});

Deno.test("le préfixe de navigation est DISJOINT de celui des réponses", () => {
  // ⛔ SI L'UN ÉTAIT PRÉFIXE DE L'AUTRE, le lecteur des réponses avalerait un
  // bouton « Voir » et le routeur croirait tenir une réponse. Ce dépôt a déjà
  // payé exactement ça sur `never_again_subject`, lu comme `never_again`.
  assert(!MEMORY_CLARIFICATION_BUTTON_PREFIX.startsWith(NAVIGATION_BUTTON_PREFIX));
  assert(!NAVIGATION_BUTTON_PREFIX.startsWith(MEMORY_CLARIFICATION_BUTTON_PREFIX));
  assert(MEMORY_VIEW_BUTTON_PAYLOAD_PREFIX.startsWith(NAVIGATION_BUTTON_PREFIX));
});

// ---------------------------------------------------------------------------
// 2. Le lecteur — il refuse tout ce qu'il n'a pas composé lui-même
// ---------------------------------------------------------------------------

Deno.test("le cas qui passe: un choix, et une échappatoire", () => {
  // Sans cette moitié, tous les refus ci-dessous seraient vrais d'un lecteur
  // qui rend `none` sur tout — c'est-à-dire d'une question intapable.
  assertEquals(readMemoryClarificationReply(memoryClarificationPickId(ROW, 0)), {
    kind: "pick",
    id: ROW,
    index: 0,
  });
  assertEquals(readMemoryClarificationReply(memoryClarificationPickId(ROW, 3)), {
    kind: "pick",
    id: ROW,
    index: 3,
  });
  assertEquals(readMemoryClarificationReply(memoryClarificationNoneId(ROW)), {
    kind: "none_of_them",
    id: ROW,
  });
});

Deno.test("une charge d'une AUTRE famille n'est pas la sienne", () => {
  for (
    const foreign of [
      "KEEL_FEEDBACK_" + ROW + "|cooked|yes",
      "KEEL_WDIV_STEP|" + ROW + "|ack",
      "KEEL_VIEW_ABOUT_YOU|preferences",
      "",
      "   ",
    ]
  ) {
    assertEquals(
      readMemoryClarificationReply(foreign).kind,
      "none",
      `« ${foreign} » a été lue comme une réponse`,
    );
  }
  assertEquals(readMemoryClarificationReply(null).kind, "none");
  assertEquals(readMemoryClarificationReply(undefined).kind, "none");
});

Deno.test("un index qui n'est pas UN chiffre est refusé", () => {
  // ⛔ JAMAIS `Number(x)`: `Number("")` vaut 0 et `Number(" 1 ")` vaut 1. Un
  // index vide lu comme zéro écrirait la PREMIÈRE option sur un tap qui n'a
  // désigné personne — la faute la plus chère possible ici, puisqu'elle attribue
  // un goût à quelqu'un qui n'a pas été nommé.
  for (const bad of ["", " ", "00", "01", "-1", "1.0", "a", "10", " 1"]) {
    assertEquals(
      readMemoryClarificationReply(
        `${MEMORY_CLARIFICATION_BUTTON_PREFIX}PICK|${ROW}|${bad}`,
      ).kind,
      "none",
      `l'index « ${bad} » a été accepté`,
    );
  }
});

Deno.test("un identifiant qui n'est pas un uuid est refusé", () => {
  for (const bad of ["", "abc", ROW.slice(0, -1), ROW + "x"]) {
    assertEquals(
      readMemoryClarificationReply(
        `${MEMORY_CLARIFICATION_BUTTON_PREFIX}PICK|${bad}|0`,
      ).kind,
      "none",
    );
    assertEquals(
      readMemoryClarificationReply(
        `${MEMORY_CLARIFICATION_BUTTON_PREFIX}NONE|${bad}`,
      ).kind,
      "none",
    );
  }
});

Deno.test("le nombre de segments est exact, dans les deux sens", () => {
  const P = MEMORY_CLARIFICATION_BUTTON_PREFIX;
  for (
    const bad of [
      `${P}PICK|${ROW}`, // un segment de trop peu
      `${P}PICK|${ROW}|0|extra`, // un de trop
      `${P}NONE|${ROW}|0`, // l'échappatoire n'en prend que deux
      `${P}PICK`,
      `${P}AUTRE|${ROW}|0`, // un verbe inconnu
    ]
  ) {
    assertEquals(readMemoryClarificationReply(bad).kind, "none", bad);
  }
});

// ---------------------------------------------------------------------------
// 3. La résolution — ce que le tap écrira vraiment
// ---------------------------------------------------------------------------

Deno.test("QUI: l'option devient le SUJET, et la note devient la citation", () => {
  const out = resolveClarification(pendingWho(), LEA, {
    writtenAt: "2026-09-04T18:00:00.000Z",
  });
  assert(out !== null);
  assertEquals(out.durable?.length, 1);
  const item = out.durable![0];
  assertEquals(item.kind, "food.exclude");
  assertEquals(item.subject, `member:${LEA}`);
  assertEquals(item.text, "poisson");
  assertEquals(item.at, "2026-09-04");
  // ⛔ LE PRODUCTEUR RESTE `draft_note`, ET C'EST LA MOITIÉ QUI COMPTE. Le chat
  // n'écrit rien (nomenclature §2.8): ce tap COMPLÈTE une entrée que la
  // personne a elle-même écrite, il n'en crée pas une nouvelle.
  assertEquals(item.source, "draft_note");
  // La citation est SA phrase, pas le libellé du bouton: c'est elle qui rend
  // « Enlever » autre chose qu'un pari, sur la carte.
  assertEquals(item.quote, NOTE);
  assertEquals(item.item, "");
  assertEquals(out.nextPlan, undefined);
  assertEquals(out.memo, undefined);
});

Deno.test("QUOI: l'option devient le TEXTE, le sujet reste celui de la note", () => {
  const out = resolveClarification(
    pendingWho({ about: "what", text: "la viande", subject: "household" }),
    "poulet rôti",
    { writtenAt: "2026-09-04T18:00:00.000Z" },
  );
  assert(out !== null);
  const item = out.durable![0];
  assertEquals(item.text, "poulet rôti");
  assertEquals(item.subject, "household");
  // La citation reste la phrase, jamais l'aliment choisi: « j'ai pas aimé la
  // viande » explique la ligne, « poulet rôti » ne l'explique pas.
  assertEquals(item.quote, NOTE);
});

Deno.test("l'encart va dans l'encart, avec son ancre", () => {
  const out = resolveClarification(
    pendingWho({ gate: "next_plan", kind: "craving", text: "des fajitas" }),
    LEA,
    { writtenAt: "2026-09-04T18:00:00.000Z" },
  );
  assert(out !== null);
  assertEquals(out.durable, undefined);
  assertEquals(out.nextPlan?.length, 1);
  assertEquals(out.nextPlan![0].anchor, "2026-09-07");
  // ⚠️ L'INSTANT D'ÉCRITURE VOYAGE: c'est contre lui que la validation du plan
  // suivant compare pour tuer la ligne (nomenclature §2.5). Sans lui, la vie de
  // l'entrée retombe sur son jour, et l'encart redevient calendaire.
  assertEquals(out.nextPlan![0].writtenAt, "2026-09-04T18:00:00.000Z");
});

Deno.test("une note va au mémo, et son `when` survit", () => {
  const out = resolveClarification(
    pendingWho({
      gate: "notes",
      kind: null,
      text: "danse le mardi soir",
      when: { weekday: "tue", slot: "dinner" },
    }),
    LEA,
    { writtenAt: "2026-09-04T18:00:00.000Z" },
  );
  assert(out !== null);
  assertEquals(out.memo?.length, 1);
  assertEquals(out.memo![0].subject, `member:${LEA}`);
  assertEquals(out.memo![0].when, { weekday: "tue", slot: "dinner" });
  assertEquals(out.memo![0].source, "draft_note");
  assertEquals(out.memo![0].quote, NOTE);
});

Deno.test("une entrée illisible rend `null`, elle n'invente rien", () => {
  // ⛔ LE SOCLE EST LE DERNIER MOT. `resolveClarification` reconstruit un objet
  // et le fait relire par `parseRetainedItem` / `parseMemoLine`: si la ligne
  // stockée a vieilli (une famille retirée, un `when` devenu illisible), on rend
  // `null` et l'appelant clôt la question — plutôt que d'écrire une ligne que
  // personne ne saura relire.
  assertEquals(
    resolveClarification(pendingWho({ kind: null }), LEA, {
      writtenAt: "2026-09-04T18:00:00.000Z",
    }),
    null,
  );
  assertEquals(
    resolveClarification(pendingWho({ text: "" }), LEA, {
      writtenAt: "2026-09-04T18:00:00.000Z",
    }),
    null,
  );
  // Un sujet difforme: la ceinture d'exclusion compare le sujet caractère par
  // caractère, donc une ligne au sujet cassé est INVISIBLE tout en ayant l'air
  // enregistrée.
  assertEquals(
    resolveClarification(pendingWho(), "pas-un-uuid", {
      writtenAt: "2026-09-04T18:00:00.000Z",
    }),
    null,
  );
});

Deno.test("une famille interdite au brouillon est refusée à la résolution", () => {
  // La matrice du socle est la même des deux côtés: ce que `draft_note` ne peut
  // pas produire au classement, il ne peut pas le produire au tap non plus.
  for (const kind of ["portion.adjust", "rhythm.set", "logistics.set"] as const) {
    assertEquals(
      resolveClarification(pendingWho({ kind }), LEA, {
        writtenAt: "2026-09-04T18:00:00.000Z",
      }),
      null,
      `${kind} a été accepté au tap`,
    );
  }
});

// ---------------------------------------------------------------------------
// 4. La question — elle cite la personne, dans sa langue
// ---------------------------------------------------------------------------

Deno.test("la question cite le morceau de phrase, pas la note entière", () => {
  const fr = renderClarificationQuestion({
    about: "who",
    text: "poisson",
    language: "fr",
  });
  assert(fr.includes("poisson"));
  // ⚠️ « c'est pour qui » et « tu parlais de quoi » sont deux questions
  // DIFFÉRENTES: poser l'une pour l'autre demande à la personne de deviner ce
  // qu'on n'a pas compris.
  assert(fr.includes("qui"));
  const what = renderClarificationQuestion({
    about: "what",
    text: "la viande",
    language: "fr",
  });
  assert(what.includes("la viande"));
  assert(!what.includes("qui ?"));
});

Deno.test("les deux langues, et jamais l'anglais par défaut", () => {
  // Ce dépôt a déjà livré une doctrine française qui sortait en anglais.
  const en = renderClarificationQuestion({
    about: "who",
    text: "fish",
    language: "en",
  });
  const fr = renderClarificationQuestion({
    about: "who",
    text: "poisson",
    language: "fr",
  });
  assert(en !== fr);
  assert(en.includes("fish"));
});
