// LE CLASSIFIEUR DU FLOW DE PRÉCISION — ce que ces tests protègent.
//
// Ce module n'avait AUCUN test jusqu'au 2026-08-06, et c'est lui qui décide si
// la parole d'un élève amende un fait, en efface le crédit, ou ne fait rien. Les
// deux défauts corrigés ici avaient tous deux été mesurés en run réel, jamais
// par une probe:
//
//   1. la condition de désarmement du décochage était INATTEIGNABLE — elle
//      reposait sur `answers_question`, interdit sans question posée, alors que
//      `clarifying_question` est NULL sur 100 % des lignes photo;
//   2. « no, that wasn't it, I had pasta » partait en `new_declaration` 6/6,
//      donc sortie de flow, donc rien d'amendé — et un accusé quand même.
//
// Le `llmRunner` injectable rend tout ça testable SANS réseau. On teste ce que
// le module fait d'une réponse de modèle, et ce que le prompt PROMET — pas la
// qualité du modèle, qui se mesure en run réel.

import { assert, assertEquals } from "jsr:@std/assert@1";

import { classifyMealPrecisionIntent } from "./meal_precision_intent.ts";

/** Capture le prompt système et rend le verdict qu'on lui dicte. */
function runnerReturning(intent: string, confidence = 0.9) {
  const seen: { systemPrompt: string; userPrompt: string }[] = [];
  const runner = (systemPrompt: string, userPrompt: string) => {
    seen.push({ systemPrompt, userPrompt });
    return Promise.resolve({ intent, confidence });
  };
  return { runner, seen };
}

const BASE = {
  source: "photo" as const,
  detectedFoods: ["grilled chicken breast", "brown rice"],
  inboundText: "yes, cooked with olive oil",
};

Deno.test("SANS question, `answers_question` devient une CONFIRMATION", async () => {
  // Il retombait sur `unknown` — donc `stay`, donc rien d'écrit. C'était le
  // moins mauvais tant qu'aucun jeton ne portait « l'élève est d'accord ».
  const { runner } = runnerReturning("answers_question");
  const out = await classifyMealPrecisionIntent({
    ...BASE,
    question: null,
    llmRunner: runner,
  });
  assertEquals(out.intent, "confirms_declaration");
});

Deno.test("AVEC une question, `answers_question` reste lui-même", async () => {
  // La condition de désarmement de la correction ci-dessus: on ne réécrit pas
  // un verdict juste.
  const { runner } = runnerReturning("answers_question");
  const out = await classifyMealPrecisionIntent({
    ...BASE,
    question: "Did you cook these with oil?",
    llmRunner: runner,
  });
  assertEquals(out.intent, "answers_question");
});

Deno.test("`confirms_declaration` passe tel quel, dans les deux états", async () => {
  for (const question of [null, "Did you cook these with oil?"]) {
    const { runner } = runnerReturning("confirms_declaration");
    const out = await classifyMealPrecisionIntent({
      ...BASE,
      question,
      llmRunner: runner,
    });
    assertEquals(out.intent, "confirms_declaration");
  }
});

Deno.test("LE PROMPT OFFRE la confirmation quand aucune question n'a été posée", async () => {
  // Sans cette offre, le modèle n'a que `corrects_declaration` pour ranger un
  // acquiescement — c'est comme ça que 4 réponses sur 6 effaçaient le crédit
  // d'une photo correctement lue.
  const { runner, seen } = runnerReturning("confirms_declaration");
  await classifyMealPrecisionIntent({ ...BASE, question: null, llmRunner: runner });
  const prompt = seen[0].systemPrompt;
  assert(prompt.includes('"confirms_declaration"'));
  // Et il dit à quoi l'élève acquiesce: sans ça, le jeton est inintelligible.
  assert(prompt.includes("invited the student to correct her"));
  // `answers_question` reste interdit — on ne répond pas à une question qui
  // n'a pas été posée. C'est la distinction que le nouveau jeton préserve.
  assert(prompt.includes("never use this, Sophia asked no question"));
});

Deno.test("LE PROMPT dit qu'un démenti NOMMANT le remplacement reste une correction", async () => {
  // Mesuré 6/6 déterministe: « no, that wasn't it — I actually had pasta with
  // tomato sauce » partait en `new_declaration`. Le même démenti SANS nommer le
  // plat passait 3/3. C'est « j'ai mangé X » qui basculait le verdict.
  const { runner, seen } = runnerReturning("corrects_declaration");
  await classifyMealPrecisionIntent({
    ...BASE,
    inboundText: "no, that wasn't it — I actually had pasta with tomato sauce",
    question: null,
    llmRunner: runner,
  });
  const prompt = seen[0].systemPrompt;
  assert(prompt.includes("EVEN WHEN it names the replacement food"));
  assert(prompt.includes("one meal being rewritten, not two meals"));
  // Et `new_declaration` est resserré sur ce qu'il désigne vraiment.
  assert(prompt.includes("ADDITIONAL, SEPARATE meal"));
});

Deno.test("`new_photo` ne peut JAMAIS venir du modèle", async () => {
  // Un fait de transport: le laisser passer permettrait à une phrase de fermer
  // un flow en prétendant porter une image.
  const { runner } = runnerReturning("new_photo");
  const out = await classifyMealPrecisionIntent({
    ...BASE,
    question: null,
    llmRunner: runner,
  });
  assertEquals(out.intent, "unknown");
});

Deno.test("une confiance trop basse ne tranche pas", async () => {
  const { runner } = runnerReturning("corrects_declaration", 0.1);
  const out = await classifyMealPrecisionIntent({
    ...BASE,
    question: null,
    llmRunner: runner,
  });
  assertEquals(out.intent, "unknown");
});

Deno.test("une photo dans le tour court-circuite le modèle", async () => {
  let called = false;
  const out = await classifyMealPrecisionIntent({
    ...BASE,
    question: null,
    hasMedia: true,
    llmRunner: () => {
      called = true;
      return Promise.resolve({ intent: "corrects_declaration", confidence: 1 });
    },
  });
  assertEquals(out.intent, "new_photo");
  assertEquals(called, false);
});

Deno.test("un modèle en panne DÉGRADE, il ne jette pas", async () => {
  // R7 à une frontière LLM: le tour repart au chemin normal plutôt que de
  // perdre la parole de l'élève.
  const out = await classifyMealPrecisionIntent({
    ...BASE,
    question: null,
    llmRunner: () => Promise.reject(new Error("boom")),
  });
  assertEquals(out.intent, "unknown");
});
