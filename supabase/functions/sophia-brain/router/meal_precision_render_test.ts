// LA CEINTURE DE RENDU — la question de précision, posée par le runtime.
//
// Ce que ces tests protègent:
//   * « une question de précision ne demande JAMAIS une quantité » — ici par
//     construction: la ceinture ne fabrique aucun texte, elle recopie un
//     gabarit fermé;
//   * « deux questions sont un interrogatoire » — si le composeur a déjà posé
//     la sienne, la nôtre est ABANDONNÉE, jamais ajoutée. On perd une
//     précision; on ne perd pas l'élève;
//   * la condition de désarmement (doctrine P9): sans question armée, la
//     ceinture rend le texte inchangé, et elle n'en RETIRE jamais aucune.

import { assert, assertEquals } from "jsr:@std/assert@1";

import { appendMealPrecisionQuestion } from "./run.ts";

const QUESTION = "And what did you have with it?";

Deno.test("la question est ajoutée à une réponse qui n'en porte pas", () => {
  const out = appendMealPrecisionQuestion("Recorded for 2026-08-04: Poultry.", QUESTION);
  assertEquals(out, `Recorded for 2026-08-04: Poultry.\n\n${QUESTION}`);
});

Deno.test("désarmée sans question: le texte ressort intact", () => {
  const text = "Recorded for 2026-08-04: Poultry.";
  for (const question of [null, undefined, "", "   "]) {
    assertEquals(appendMealPrecisionQuestion(text, question), text);
  }
});

Deno.test("si le composeur a déjà posé une question, la nôtre est abandonnée", () => {
  // L'ANTI-INTERROGATOIRE, et il fail-safe: le pire cas est une précision
  // perdue, jamais un élève à deux questions.
  const composed = "Recorded. How did that go for you?";
  let dropped = false;
  const out = appendMealPrecisionQuestion(composed, QUESTION, () => {
    dropped = true;
  });
  assertEquals(out, composed, "aucune seconde question ne doit apparaître");
  assert(dropped, "l'abandon doit être signalé pour que le flow s'ouvre sans question");
});

Deno.test("l'abandon n'est PAS signalé quand la question est bien posée", () => {
  let dropped = false;
  appendMealPrecisionQuestion("Recorded.", QUESTION, () => {
    dropped = true;
  });
  assert(!dropped);
});

Deno.test("une question déjà présente n'est pas doublée (rejeu, ou recopie)", () => {
  const already = `Recorded.\n\n${QUESTION}`;
  const out = appendMealPrecisionQuestion(already, QUESTION);
  assertEquals(out, already);
  assertEquals(out.split("?").length - 1, 1, "une seule question dans le rendu");
});

Deno.test("sur une réponse vide, la question tient seule", () => {
  assertEquals(appendMealPrecisionQuestion("   ", QUESTION), QUESTION);
});

Deno.test("la ceinture ne RETIRE jamais rien du texte reçu", () => {
  // Condition de désarmement, formulée comme une propriété: quelle que soit
  // l'entrée, le texte d'origine survit toujours dans la sortie.
  for (
    const text of [
      "Recorded.",
      "Recorded. And you?",
      "",
      "Recorded for 2026-08-04 (lunch): Poultry and Whole grains.",
    ]
  ) {
    for (const question of [QUESTION, null, ""]) {
      const out = appendMealPrecisionQuestion(text, question);
      assert(
        out.includes(text.trim()),
        `"${text}" a été mutilé par la ceinture`,
      );
    }
  }
});
