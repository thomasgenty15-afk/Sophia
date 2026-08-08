/**
 * FF-023 R4 — CE QUE LE COACH N'A PAS DIT EST ANNONCÉ COMME TEL.
 *
 * Mesuré 3/3 en run réel le 2026-08-08, sur une doctrine CHARGÉE et complète
 * qui ne mentionne pas les compléments alimentaires:
 *
 *   « Your coach doesn't use a supplements-first approach. »
 *   « Yes — this coach does have a view: supplements are not the center. »
 *
 * Le modèle déduisait la position du coach du reste du bloc. La règle qui
 * l'interdit existait — dans `NO_COACH_METHOD_BLOCK`, c'est-à-dire dans le
 * bloc servi UNIQUEMENT quand il n'y a pas de doctrine. Écrite pour le cas
 * rare, absente du cas normal.
 */
import { assert, assertStringIncludes } from "jsr:@std/assert@1";

import { compileDoctrineBlock, parseCoachDoctrine } from "./doctrine.ts";
import {
  doctrineBlockFor,
  NO_COACH_METHOD_BLOCK,
  NO_DOCTRINE_FOR_THIS_GOAL_BLOCK,
} from "./doctrine_loader.ts";

/** Une doctrine RÉELLE, passée par le vrai parseur — jamais un objet forgé. */
function doctrine() {
  return parseCoachDoctrine({
    coach_id: "c1",
    version: 1,
    coach_display_name: "Marlow",
    content_locale: "en",
    beliefs: [{ claim: "Every meal is built on a protein anchor." }],
    forbidden: [],
    vocabulary: [],
    arbitrations: [],
    qa: [],
    voice: { tone: "Direct, warm, never preachy." },
    foods: { recommended: [], discouraged: [] },
  }).doctrine;
}

Deno.test("le bloc doctrine PORTE la règle du silence, pas seulement les replis", () => {
  const text = compileDoctrineBlock(doctrine(), null).text;
  assertStringIncludes(text, "SILENCE IS NOT A POSITION");
  assertStringIncludes(text, "answer in your own name");
});

Deno.test("la règle arrive AVANT les croyances — elle doit survivre à la queue", () => {
  const text = compileDoctrineBlock(doctrine(), null).text;
  const rule = text.indexOf("SILENCE IS NOT A POSITION");
  const beliefs = text.indexOf("-- WHAT THIS COACH BELIEVES --");
  assert(rule >= 0 && beliefs > rule, "la règle doit précéder les sections");
});

Deno.test("les DEUX replis portaient déjà la règle — elle n'existe plus à un seul endroit", () => {
  // Non-régression croisée: si un jour quelqu'un retire la règle des replis en
  // se disant qu'elle est « déjà dans le bloc compilé », ce test tombe. Les
  // trois chemins servent des blocs DIFFÉRENTS; la garantie doit tenir sur les
  // trois.
  // Le bloc est composé de lignes courtes: le texte réel coupe la phrase.
  assertStringIncludes(NO_COACH_METHOD_BLOCK, "Never invent a");
  assertStringIncludes(NO_DOCTRINE_FOR_THIS_GOAL_BLOCK, "in your own name");
  const compiled = compileDoctrineBlock(doctrine(), null);
  const served = doctrineBlockFor({
    reason: "loaded",
    compiled,
    doctrine: doctrine(),
    goal: null,
  } as never);
  assertStringIncludes(served, "SILENCE IS NOT A POSITION");
});
