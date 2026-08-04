// LE FLOW DE CORRECTION — le classifieur local et l'amendement.
//
// Ce que ces tests protègent, en une phrase: un repas mangé une fois ne produit
// qu'un seul fait, même quand l'élève le corrige.
//
// Le défaut d'origine (audit du 2026-08-04): `reduceMealPhotoFlow` existait,
// testé, et n'avait AUCUN appelant. « non c'était du poulet » repartait donc
// dans le routeur global, `log_protocol_event` y voyait une information
// alimentaire, et écrivait une SECONDE ligne `protocol_events`.

import { assert, assertEquals } from "jsr:@std/assert@1";

import { buildAmendedRecognized } from "./meal_photo_amend.ts";
import { classifyMealPhotoIntent } from "./meal_photo_intent.ts";
import { openMealPhotoFlow, reduceMealPhotoFlow } from "./meal_photo_flow.ts";

// ---------------------------------------------------------------------------
// LE CLASSIFIEUR — un LLM injecté, donc aucun appel réseau ici
// ---------------------------------------------------------------------------

const runner = (intent: string, confidence: number) => () =>
  Promise.resolve(JSON.stringify({ intent, confidence }));

Deno.test("intent: une nouvelle photo est DÉTERMINISTE, le modèle n'est pas consulté", async () => {
  let called = false;
  const got = await classifyMealPhotoIntent({
    question: "Was this cooked in oil?",
    detectedFoods: ["pork", "rice"],
    inboundText: "",
    hasMedia: true,
    llmRunner: () => {
      called = true;
      return Promise.resolve("{}");
    },
  });
  assertEquals(got.intent, "new_photo");
  assertEquals(got.confidence, 1);
  assert(!called, "un fait de transport ne se demande pas à un modèle");
});

Deno.test("intent: une correction est reconnue quels que soient les mots", async () => {
  for (
    const text of [
      "non c'était du poulet",
      "ah pardon, plutôt du poulet",
      "chicken actually, not pork",
    ]
  ) {
    const got = await classifyMealPhotoIntent({
      question: null,
      detectedFoods: ["pork", "rice"],
      inboundText: text,
      llmRunner: runner("corrects_analysis", 0.93),
    });
    assertEquals(got.intent, "corrects_analysis", text);
  }
});

Deno.test("intent: sous le seuil de confiance, on retombe sur le comportement d'avant", async () => {
  // `unknown` fait « stay » dans le reducer: le tour repart normalement. Un
  // classifieur incertain ne doit jamais acquérir le pouvoir de supprimer
  // l'enregistrement d'un vrai repas.
  const got = await classifyMealPhotoIntent({
    question: null,
    detectedFoods: ["pork"],
    inboundText: "hmm",
    llmRunner: runner("corrects_analysis", 0.4),
  });
  assertEquals(got.intent, "unknown");
});

Deno.test("intent: `answers_question` est refusé quand aucune question n'a été posée", async () => {
  // Un élève ne peut pas répondre à une question qu'on ne lui a pas posée.
  // Sans cette garde, un modèle complaisant ferme un flow sur une hallucination.
  const got = await classifyMealPhotoIntent({
    question: null,
    detectedFoods: ["pork"],
    inboundText: "oui",
    llmRunner: runner("answers_question", 0.99),
  });
  assertEquals(got.intent, "unknown");
});

Deno.test("intent: le modèle ne peut PAS prétendre qu'une photo est arrivée", async () => {
  // `new_photo` est un fait de transport. Le laisser venir du modèle
  // permettrait à une phrase de fermer un flow en mentant sur son contenu.
  const got = await classifyMealPhotoIntent({
    question: null,
    detectedFoods: ["pork"],
    inboundText: "voilà une autre photo",
    llmRunner: runner("new_photo", 0.99),
  });
  assertEquals(got.intent, "unknown");
});

Deno.test("intent: un LLM qui échoue dégrade vers `unknown`, jamais vers une action", async () => {
  const got = await classifyMealPhotoIntent({
    question: null,
    detectedFoods: ["pork"],
    inboundText: "non c'était du poulet",
    llmRunner: () => Promise.reject(new Error("timeout")),
  });
  assertEquals(got.intent, "unknown");
  assertEquals(got.confidence, 0);
});

Deno.test("intent: une réponse illisible du modèle dégrade vers `unknown`", async () => {
  for (const bad of ["not json at all", '{"intent":"banana","confidence":1}', "{}"]) {
    const got = await classifyMealPhotoIntent({
      question: null,
      detectedFoods: ["pork"],
      inboundText: "non c'était du poulet",
      llmRunner: () => Promise.resolve(bad),
    });
    assertEquals(got.intent, "unknown", bad);
  }
});

// ---------------------------------------------------------------------------
// L'AMENDEMENT — la construction du `recognized` amendé
// ---------------------------------------------------------------------------

const AT = "2026-08-04T12:00:00.000Z";

Deno.test("amend: une correction efface le crédit machine", () => {
  // L'élève vient de dire que la lecture est fausse. Garder un crédit qui en
  // découle, c'est affirmer au coach quelque chose que l'élève a contredit.
  const { recognized, clearsCredit } = buildAmendedRecognized({
    recognized: { kind: "meal_photo_analysis", commitment_id: "c1" },
    amendment: { kind: "correction", studentText: "c'était du poulet", at: AT },
  });
  assertEquals(clearsCredit, true);
  assertEquals(recognized.student_corrected, true);
  assertEquals(recognized.student_amended, true);
});

Deno.test("amend: une RÉPONSE ne détruit aucun crédit", () => {
  // « oui, à l'huile d'olive » lève une hypothèse; ça ne contredit rien.
  const { clearsCredit, recognized } = buildAmendedRecognized({
    recognized: { commitment_id: "c1" },
    amendment: { kind: "answer", studentText: "oui à l'huile d'olive", at: AT },
  });
  assertEquals(clearsCredit, false);
  assertEquals(recognized.student_amended, true);
  assertEquals(recognized.student_corrected, undefined);
});

Deno.test("amend: la liaison EXPLICITE de l'élève survit à une correction", () => {
  // `student_commitment_id` est déjà sa parole, posée à l'upload. Une
  // correction de la lecture machine ne doit pas détruire ce qu'il a déclaré
  // lui-même.
  const { clearsCredit } = buildAmendedRecognized({
    recognized: { commitment_id: "c1", student_commitment_id: "c1" },
    amendment: { kind: "correction", studentText: "en fait du poulet", at: AT },
  });
  assertEquals(clearsCredit, false);
});

Deno.test("amend: les amendements s'empilent, le second n'efface pas le premier", () => {
  const first = buildAmendedRecognized({
    recognized: {},
    amendment: { kind: "correction", studentText: "du poulet", at: AT },
  });
  const second = buildAmendedRecognized({
    recognized: first.recognized,
    amendment: { kind: "answer", studentText: "et sans huile", at: AT },
  });
  const list = second.recognized.amendments as Array<Record<string, unknown>>;
  assertEquals(list.length, 2);
  assertEquals(list[0].student_text, "du poulet");
  assertEquals(list[1].student_text, "et sans huile");
});

Deno.test("amend: un `recognized` absent ou corrompu ne fait pas perdre l'amendement", () => {
  // Une analyse qui a échoué laisse `recognized` à null. Les mots de l'élève
  // doivent quand même atterrir sur sa ligne.
  for (const bad of [null, undefined]) {
    const { recognized } = buildAmendedRecognized({
      recognized: bad as null,
      amendment: { kind: "correction", studentText: "du poulet", at: AT },
    });
    const list = recognized.amendments as Array<unknown>;
    assertEquals(list.length, 1);
  }
});

// ---------------------------------------------------------------------------
// LA CHAÎNE COMPLÈTE — classifieur → reducer → décision d'amendement
// ---------------------------------------------------------------------------

Deno.test("chaîne: « non c'était du poulet » amende, et n'écrit PAS un second fait", async () => {
  const now = new Date("2026-08-04T12:05:00.000Z");
  const flow = openMealPhotoFlow({
    eventId: "evt-1",
    question: "Was this cooked in oil?",
    now: new Date("2026-08-04T12:00:00.000Z"),
  });

  const { intent } = await classifyMealPhotoIntent({
    question: flow.question,
    detectedFoods: ["pork", "rice"],
    inboundText: "non c'était du poulet",
    llmRunner: runner("corrects_analysis", 0.95),
  });
  const decision = reduceMealPhotoFlow({ flow, intent, now });

  assertEquals(decision.kind, "amend_event");
  if (decision.kind === "amend_event") {
    assertEquals(decision.eventId, "evt-1");
    assertEquals(decision.amendment, "correction");
  }
});

Deno.test("chaîne: un tour de crise ferme le flow avant toute autre chose", async () => {
  const flow = openMealPhotoFlow({
    eventId: "evt-1",
    question: "Was this cooked in oil?",
    now: new Date("2026-08-04T12:00:00.000Z"),
  });
  const { intent } = await classifyMealPhotoIntent({
    question: flow.question,
    detectedFoods: ["pork"],
    inboundText: "oui à l'huile",
    llmRunner: runner("answers_question", 0.99),
  });
  const decision = reduceMealPhotoFlow({
    flow,
    intent,
    safetyBand: "high",
    now: new Date("2026-08-04T12:01:00.000Z"),
  });
  // On ne demande pas à quelqu'un en détresse s'il a mis de l'huile.
  assertEquals(decision.kind, "exit");
  if (decision.kind === "exit") assertEquals(decision.reason, "safety");
});

Deno.test("chaîne: passé 30 minutes, ce n'est plus la même photo", async () => {
  const flow = openMealPhotoFlow({
    eventId: "evt-1",
    question: null,
    now: new Date("2026-08-04T12:00:00.000Z"),
  });
  const { intent } = await classifyMealPhotoIntent({
    question: null,
    detectedFoods: ["pork"],
    inboundText: "c'était du poulet en fait",
    llmRunner: runner("corrects_analysis", 0.95),
  });
  const decision = reduceMealPhotoFlow({
    flow,
    intent,
    now: new Date("2026-08-04T12:31:00.000Z"),
  });
  assertEquals(decision.kind, "exit");
  if (decision.kind === "exit") assertEquals(decision.reason, "timeout");
});

Deno.test("chaîne: l'incertitude laisse le tour à son chemin normal", async () => {
  // La garde de non-régression: quand le classifieur doute, le flow reste
  // ouvert et RIEN n'est amendé — le tour repart exactement comme avant
  // l'existence de ce câblage.
  const flow = openMealPhotoFlow({
    eventId: "evt-1",
    question: null,
    now: new Date("2026-08-04T12:00:00.000Z"),
  });
  const { intent } = await classifyMealPhotoIntent({
    question: null,
    detectedFoods: ["pork"],
    inboundText: "bof",
    llmRunner: runner("corrects_analysis", 0.3),
  });
  assertEquals(intent, "unknown");
  const decision = reduceMealPhotoFlow({
    flow,
    intent,
    now: new Date("2026-08-04T12:01:00.000Z"),
  });
  assertEquals(decision.kind, "stay");
});
