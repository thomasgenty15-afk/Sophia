import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  acceptComposedNudge,
  buildReengageSystemPrompt,
  buildReengageUserPrompt,
  REENGAGE_MAX_CHARS,
  sanitizeComposedNudge,
} from "./reengage_composer.ts";
import { renderReengageNudge } from "./reengagement.ts";

// LA CEINTURE D'UN TEXTE QUE PERSONNE NE RELIT.
//
// Tant que la relance était un template approuvé chez Meta, le contrôle était
// humain et en amont: un texte figé, relu une fois, envoyé mille fois. Depuis
// qu'elle est composée, chaque élève reçoit une phrase que personne n'a lue
// avant lui. Ce fichier EST la relecture.
//
// Il ne peut pas être écrit « après », en observant ce que le modèle produit:
// ce qu'il faut refuser est précisément ce qu'on n'arrive pas à obtenir sur
// commande. Les cas ci-dessous sont donc écrits à la main, à partir des règles
// que `toneInstruction` énonce depuis le premier jour et que rien ne vérifiait.

const OK = "Hi Iris - no rush, just checking in. How is the week going?";

Deno.test("un message conforme passe", () => {
  const verdict = acceptComposedNudge(OK);
  assert(verdict.ok, `refusé à tort: ${JSON.stringify(verdict)}`);
});

Deno.test("le texte de secours passe sa propre ceinture", () => {
  // Si le repli ne passait pas, l'échec de composition produirait un envoi
  // refusé — et la boucle serait muette pour toute la population qu'elle vise.
  const verdict = acceptComposedNudge(renderReengageNudge("Iris"));
  assert(verdict.ok, "le repli déterministe doit toujours être délivrable");
});

Deno.test("la culpabilisation est refusée (ceinture héritée, sur le nouveau chemin)", () => {
  const verdict = acceptComposedNudge(
    "Hi Iris, you haven't logged anything lately. Ready to get back on track?",
  );
  assert(!verdict.ok);
  assertEquals(verdict.reason, "guilt_tripping");
});

Deno.test("nommer la durée du silence est refusé — EN, la langue qu'on envoie", () => {
  // `findGuiltTripping` avait un motif FRANÇAIS pour ce cas (« ça fait 5 jours
  // que tu n'... ») et AUCUN en anglais, alors que le pilote ne produit que de
  // l'anglais. La garde existait dans la langue qu'on n'envoie plus.
  for (
    const text of [
      "Hi Iris! It's been a few days - how are things?",
      "Hi Iris, it has been 5 days. How are you?",
      "Hi Iris, I haven't heard from you. How is it going?",
      "Hi Iris - since we last spoke, how have things been?",
      "Hi Iris, two weeks of silence! How are you?",
    ]
  ) {
    const verdict = acceptComposedNudge(text);
    assert(!verdict.ok, `aurait dû être refusé: ${text}`);
    assertEquals(verdict.reason, "names_the_silence", text);
  }
});

Deno.test("CONDITION DE DÉSARMEMENT — une durée qui ne parle pas du silence passe", () => {
  // Doctrine P9: toute ceinture porte sa condition de désarmement, et se teste
  // sur la prémisse fausse. Sans ces cas, le motif le plus simple (« \d+ jours »)
  // aurait été accepté en revue, et il aurait interdit de demander à quelqu'un
  // comment vont ses journées — c'est-à-dire la seule chose qu'on veut demander.
  for (
    const text of [
      "Hi Iris - how have the last few days been for you?",
      "Hi Iris, how did the week go?",
      "Hi Iris, no pressure at all - here if you want to pick things up.",
      "Hi Iris, anything you want to look at in the next two weeks?",
    ]
  ) {
    const verdict = acceptComposedNudge(text);
    assert(verdict.ok, `refusé à tort: ${text} → ${JSON.stringify(verdict)}`);
  }
});

Deno.test("le français reste couvert pour le jour où le verrou du pilote saute", () => {
  for (
    const text of [
      "Salut Iris, ça fait quelques jours ! Comment vas-tu ?",
      "Salut Iris, depuis notre dernière conversation, comment ça va ?",
    ]
  ) {
    const verdict = acceptComposedNudge(text);
    assert(!verdict.ok, `aurait dû être refusé: ${text}`);
    assertEquals(verdict.reason, "names_the_silence", text);
  }
});

Deno.test("un pavé est refusé", () => {
  const long = `Hi Iris, ${"I hope things are going well for you. ".repeat(12)}`;
  const verdict = acceptComposedNudge(long);
  assert(!verdict.ok);
  // Les deux motifs sont acceptables — ils disent la même chose. Ce qui compte
  // est que ça ne parte pas.
  assert(
    verdict.reason === "too_long" || verdict.reason === "too_many_sentences",
    `motif inattendu: ${verdict.reason}`,
  );
});

Deno.test("les artefacts de prompt sont refusés, pas rafistolés", () => {
  for (
    const text of [
      "Hi Iris, **how is the week going?**",
      "## Message\nHi Iris, how is the week going?",
      "Hi Iris, see [your plan](https://example.test) when you can.",
      "Hi {{1}}, how is the week going?",
    ]
  ) {
    const verdict = acceptComposedNudge(text);
    assert(!verdict.ok, `aurait dû être refusé: ${text}`);
    assertEquals(verdict.reason, "prompt_artefact", text);
  }
});

Deno.test("le nettoyage précède le jugement — un bon message entre guillemets passe", () => {
  // NETTOYER PUIS JUGER, JAMAIS L'INVERSE. Un modèle qui rend son message entre
  // guillemets est le comportement le plus banal qui soit; le refuser pour ça
  // ferait retomber tout le monde sur le texte de secours, et le repli
  // deviendrait le cas nominal sans que personne ne le voie.
  const verdict = acceptComposedNudge(`"${OK}"`);
  assert(verdict.ok);
  assertEquals(verdict.text, OK);
});

Deno.test("le préfixe de rôle et les retours à la ligne sont retirés", () => {
  assertEquals(sanitizeComposedNudge("Sophia: Hi Iris,\n\nhow are you?"), "Hi Iris, how are you?");
  assertEquals(sanitizeComposedNudge("  Assistant:   Hello  there  "), "Hello there");
});

Deno.test("un message vide ne part pas", () => {
  const verdict = acceptComposedNudge("   \n  ");
  assert(!verdict.ok);
  assertEquals(verdict.reason, "empty");
});

Deno.test("le prompt porte la doctrine du coach et ses interdits", () => {
  const prompt = buildReengageSystemPrompt({
    doctrineBlock: "COACH METHOD: protein first, no scales.",
    tone: "gentle",
  });
  assert(prompt.includes("COACH METHOD: protein first, no scales."));
  // Les trois interdits qui protègent l'élève, littéralement dans le prompt.
  assert(prompt.includes("Never say how long it has been"));
  assert(prompt.includes("logging, tracking, adherence"));
  assert(prompt.includes("State no fact about this student"));
  assert(prompt.includes(String(REENGAGE_MAX_CHARS)));
  // L'instruction de ton, telle qu'elle existe depuis le premier jour.
  assert(prompt.includes("Do not mention how many days it has been."));
});

Deno.test("sans prénom, le prompt interdit d'en inventer un", () => {
  const user = buildReengageUserPrompt("  ");
  assert(user.includes("do not invent one"));
  assert(!user.includes("undefined"));
});
