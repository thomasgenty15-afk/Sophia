// LA QUESTION ARMÉE — la couverture des templates, MIGRÉE avec le concept.
//
// La consigne du chantier est explicite : « pas de suppression de la couverture
// de test au prétexte que le fichier testait WhatsApp — la couverture MIGRE
// avec le concept ». Les cas ci-dessous sont les descendants directs de
// `template_context_test.ts`, réécrits sur le mécanisme in-app.
//
// Les tests qui portent une décision, et pas seulement une branche :
//   * « une question plus récente supplante l'ancienne » ;
//   * « la question survit à la réponse de Sophia, elle meurt au 3e tour » —
//     les deux règles qui n'ont PAS marché sont dans l'en-tête du module ;
//   * « une réserve n'est pas un accord, EN ET FR » — l'accident du test FR-only ;
//   * « le classifieur rend un payload, jamais un libellé ».

import { assertEquals } from "jsr:@std/assert@1";

import {
  ARMED_QUESTION_MAX_TURNS,
  ARMED_QUESTION_WINDOW_MS,
  type ArmedQuestion,
  classifyArmedQuestionReply,
  findExactButton,
  isObviouslyUnrelated,
  isStillArmed,
} from "./armed_question.ts";

const NOW = "2026-08-04T20:00:00.000Z";

function isoMinus(ms: number): string {
  return new Date(Date.parse(NOW) - ms).toISOString();
}

const BUTTONS = [
  { payload: "KEEL_PULSE_GOOD", label: "All good" },
  { payload: "KEEL_PULSE_OK", label: "So-so" },
  { payload: "KEEL_PULSE_HARD", label: "Rough" },
];

function question(over: Partial<ArmedQuestion> = {}): ArmedQuestion {
  return {
    messageId: "m1",
    content: "How was today?",
    purpose: "keel_daily_pulse",
    buttons: BUTTONS,
    askedAt: isoMinus(60_000),
    inboundTurnsBefore: 0,
    ...over,
  };
}

// ── ARMEMENT / DÉSARMEMENT ──────────────────────────────────────────────────

Deno.test("une question fraîche, sans tour consommé, est armée", () => {
  assertEquals(
    isStillArmed({
      askedAtIso: isoMinus(60_000),
      nowIso: NOW,
      inboundTurnsBefore: 0,
      hasNewerArmedQuestion: false,
    }),
    true,
  );
});

Deno.test("UNE QUESTION PLUS RÉCENTE SUPPLANTE L'ANCIENNE, toujours", () => {
  // Edge case n°3: répondre à une question remontée dans le fil ne la
  // réactive pas. La règle est absolue — même fraîche, même à zéro tour.
  assertEquals(
    isStillArmed({
      askedAtIso: isoMinus(1_000),
      nowIso: NOW,
      inboundTurnsBefore: 0,
      hasNewerArmedQuestion: true,
    }),
    false,
  );
});

Deno.test("la question meurt au 3e tour entrant, pas au 1er", () => {
  // LA règle qui a coûté deux itérations: « fermée dès que Sophia reparle »
  // tuait la question au premier mot de l'élève. Le public écrit en rafale.
  for (let turns = 0; turns < ARMED_QUESTION_MAX_TURNS; turns += 1) {
    assertEquals(
      isStillArmed({
        askedAtIso: isoMinus(60_000),
        nowIso: NOW,
        inboundTurnsBefore: turns,
        hasNewerArmedQuestion: false,
      }),
      true,
      `tour ${turns} doit rester armé`,
    );
  }
  assertEquals(
    isStillArmed({
      askedAtIso: isoMinus(60_000),
      nowIso: NOW,
      inboundTurnsBefore: ARMED_QUESTION_MAX_TURNS,
      hasNewerArmedQuestion: false,
    }),
    false,
  );
});

Deno.test("la fenêtre de péremption a des bornes EXACTES", () => {
  const base = { nowIso: NOW, inboundTurnsBefore: 0, hasNewerArmedQuestion: false };
  assertEquals(isStillArmed({ ...base, askedAtIso: isoMinus(ARMED_QUESTION_WINDOW_MS) }), true);
  assertEquals(isStillArmed({ ...base, askedAtIso: isoMinus(ARMED_QUESTION_WINDOW_MS + 1) }), false);
});

Deno.test("une question posée DANS LE FUTUR n'est pas armée", () => {
  // Pattern (e) du gantelet. Sans ce refus, `now - askedAt` négatif passe tous
  // les seuils et une horloge fausse arme n'importe quoi.
  assertEquals(
    isStillArmed({
      askedAtIso: "2026-08-05T00:00:00.000Z",
      nowIso: NOW,
      inboundTurnsBefore: 0,
      hasNewerArmedQuestion: false,
    }),
    false,
  );
});

Deno.test("dates illisibles: désarmé, jamais une exception", () => {
  const base = { inboundTurnsBefore: 0, hasNewerArmedQuestion: false };
  assertEquals(isStillArmed({ ...base, askedAtIso: "pas une date", nowIso: NOW }), false);
  assertEquals(isStillArmed({ ...base, askedAtIso: NOW, nowIso: "pas une date" }), false);
});

// ── CORRESPONDANCE EXACTE ───────────────────────────────────────────────────

Deno.test("le libellé exact est reconnu malgré ponctuation et casse", () => {
  // Le défaut d'origine: « Absolument! » vs « Absolument ! » devenait
  // silencieusement `unrelated`.
  assertEquals(findExactButton(BUTTONS, "All good")?.payload, "KEEL_PULSE_GOOD");
  assertEquals(findExactButton(BUTTONS, "  all GOOD!! ")?.payload, "KEEL_PULSE_GOOD");
  assertEquals(findExactButton(BUTTONS, "Rough.")?.payload, "KEEL_PULSE_HARD");
  assertEquals(findExactButton(BUTTONS, "something else"), null);
  assertEquals(findExactButton(BUTTONS, "   "), null);
  assertEquals(findExactButton([], "All good"), null);
});

// ── PRÉ-FILTRE, BILINGUE ────────────────────────────────────────────────────

Deno.test("STOP n'est jamais une réponse à la question", () => {
  assertEquals(isObviouslyUnrelated("STOP"), true);
  assertEquals(isObviouslyUnrelated("stop please"), true);
});

Deno.test("une RÉSERVE n'est pas un accord — EN ET FR", () => {
  // L'accident du test FR-only: `not` ne couvre pas `doesn't`, et un test qui
  // ne parle qu'une langue laisse la garde inerte dans l'autre.
  const fr = [
    "oui mais pas ce soir",
    "d'accord mais je ne peux pas",
    "ok mais jamais le dimanche",
  ];
  const en = [
    "yes but not tonight",
    "sure but I can't",
    "fine but never on Sundays",
    "ok but that doesn't work for me",
  ];
  for (const text of [...fr, ...en]) {
    assertEquals(isObviouslyUnrelated(text), true, `réserve non détectée: ${text}`);
  }
});

Deno.test("un accord franc n'est PAS pré-filtré — EN et FR", () => {
  const agreements = [
    "oui carrément",
    "c'est tout à fait ça",
    "yes absolutely",
    "yeah that's me",
    "All good",
    // Une négation SANS concession n'est pas une réserve: c'est une réponse.
    "no, it was rough",
    "je n'ai pas eu le temps",
    "I didn't manage it",
  ];
  for (const text of agreements) {
    assertEquals(isObviouslyUnrelated(text), false, `accord filtré à tort: ${text}`);
  }
});

Deno.test("la négation doit venir APRÈS la concession pour être une réserve", () => {
  // « je ne peux pas mais vas-y » EST un accord. Un simple « contient une
  // concession et contient une négation » l'aurait rejeté.
  assertEquals(isObviouslyUnrelated("je ne peux pas mais vas-y"), false);
  assertEquals(isObviouslyUnrelated("I couldn't sleep but yes let's do it"), false);
  assertEquals(isObviouslyUnrelated("vas-y mais pas ce soir"), true);
});

Deno.test("un texte vide est traité comme sans rapport, pas comme un choix", () => {
  assertEquals(isObviouslyUnrelated(""), true);
  assertEquals(isObviouslyUnrelated("   "), true);
});

// ── CLASSIFICATION ──────────────────────────────────────────────────────────

function runner(payload: unknown) {
  return () => Promise.resolve(JSON.stringify(payload));
}

Deno.test("classifieur: le libellé exact court-circuite le modèle", async () => {
  let called = false;
  const result = await classifyArmedQuestionReply({
    question: question(),
    inboundText: "Rough",
    llmRunner: () => {
      called = true;
      return Promise.resolve("{}");
    },
  });
  assertEquals(result, { choice: "KEEL_PULSE_HARD", confidence: 1 });
  assertEquals(called, false, "aucun appel de modèle pour un libellé exact");
});

Deno.test("classifieur: REND UN PAYLOAD, jamais un libellé", async () => {
  // La correction structurelle par rapport à `classifyTemplateReplyChoice`, qui
  // rendait le libellé et obligeait chaque appelant à le remapper.
  const result = await classifyArmedQuestionReply({
    question: question(),
    inboundText: "honestly it was a hard one",
    llmRunner: runner({ choice: "Rough", confidence: 0.95 }),
  });
  assertEquals(result.choice, "KEEL_PULSE_HARD");
});

Deno.test("classifieur: une réponse peu sûre devient unrelated", async () => {
  const result = await classifyArmedQuestionReply({
    question: question(),
    inboundText: "hmm",
    llmRunner: runner({ choice: "Rough", confidence: 0.4 }),
  });
  assertEquals(result.choice, "unrelated");
});

Deno.test("classifieur: un choix hors liste devient unrelated", async () => {
  // Un modèle qui invente un bouton ne doit JAMAIS voir sa réponse exécutée.
  const result = await classifyArmedQuestionReply({
    question: question(),
    inboundText: "let's cancel everything",
    llmRunner: runner({ choice: "Delete my account", confidence: 0.99 }),
  });
  assertEquals(result.choice, "unrelated");
});

Deno.test("classifieur: un modèle qui rend du bruit ne casse rien", async () => {
  for (const junk of ["", "not json", "```json\n{bad}\n```", "null"]) {
    const result = await classifyArmedQuestionReply({
      question: question(),
      inboundText: "maybe",
      llmRunner: () => Promise.resolve(junk),
    });
    assertEquals(["unknown", "unrelated"].includes(result.choice), true, junk);
  }
});

Deno.test("classifieur: une panne de modèle rend unknown, jamais un choix", async () => {
  const result = await classifyArmedQuestionReply({
    question: question(),
    inboundText: "yes",
    llmRunner: () => Promise.reject(new Error("boom")),
  });
  assertEquals(result, { choice: "unknown", confidence: 0 });
});

Deno.test("classifieur: sans boutons, il n'y a rien à choisir", async () => {
  const result = await classifyArmedQuestionReply({
    question: question({ buttons: [] }),
    inboundText: "yes",
    llmRunner: runner({ choice: "whatever", confidence: 1 }),
  });
  assertEquals(result, { choice: "unrelated", confidence: 0 });
});

Deno.test("classifieur: le pré-filtre bat le modèle, même très sûr de lui", async () => {
  const result = await classifyArmedQuestionReply({
    question: question(),
    inboundText: "yes but not tonight",
    llmRunner: runner({ choice: "All good", confidence: 1 }),
  });
  assertEquals(result, { choice: "unrelated", confidence: 1 });
});

Deno.test("classifieur: la QUESTION POSÉE est bien transmise au modèle", async () => {
  // Le commentaire d'origine de `LastTemplateContext`: le texte rendu « était
  // calculé puis jeté », et le classifieur devait décider sans voir ce qui
  // avait été demandé. Ce test interdit la régression.
  let seen: string | null = null;
  await classifyArmedQuestionReply({
    question: question({ content: "What was hard today?" }),
    inboundText: "sleep mostly",
    llmRunner: (_system, user) => {
      seen = user;
      return Promise.resolve(JSON.stringify({ choice: "unrelated", confidence: 1 }));
    },
  });
  const payload = JSON.parse(String(seen));
  assertEquals(payload.question_posee, "What was hard today?");
  assertEquals(payload.boutons_possibles, ["All good", "So-so", "Rough"]);
  assertEquals(payload.reponse_utilisateur, "sleep mostly");
});
