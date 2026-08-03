// KEEL W9 — ceintures de la resolution de langue de reponse (CONTRACT R3).
//
// Chaque ceinture porte sa CONDITION DE DESARMEMENT (doctrine P9): la seule
// facon legitime de la retirer, jamais "le code a change".

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  appendResponseLanguageBlock,
  buildResponseLanguageBlock,
  isFrenchLocale,
  resolveResponseLocale,
} from "./locale.ts";

Deno.test("R3 — pendant le pilote, toute resolution rend en-US", () => {
  // Desarmement: suppression du early-return de `resolveResponseLocale` le
  // jour ou le multi-langue est livre. C'est le POINT UNIQUE de changement:
  // ce test echouera alors, et c'est le signal attendu.
  assertEquals(resolveResponseLocale({}), "en-US");
  assertEquals(resolveResponseLocale({ persisted: "fr-FR" }), "en-US");
  assertEquals(resolveResponseLocale({ userExplicit: "fr-FR" }), "en-US");
});

Deno.test("R3 — le bloc nomme la langue en clair ET protege les jetons", () => {
  const en = buildResponseLanguageBlock("en-US");
  assert(en.startsWith("RESPONSE_LANGUAGE:"));
  assert(en.includes("English (en-US)"));
  // R1: la consigne de langue ne doit JAMAIS autoriser la traduction des
  // slugs. C'est exactement la faute weekday-francais que KEEL existe pour
  // tuer, reintroduite par la porte de la localisation.
  assert(en.includes("never translate slugs"));

  assert(buildResponseLanguageBlock("fr-FR").includes("French (fr-FR)"));
  // R7: un prefixe inconnu ne jette pas — il degrade en nommant le tag, qui
  // reste une instruction sans ambiguite pour le modele.
  assert(buildResponseLanguageBlock("sw-KE").includes("(sw-KE)"));
});

Deno.test("R3 — appendResponseLanguageBlock place le bloc en DERNIER, et une seule fois", () => {
  const base = "SYSTEM:\n- a rule\n";
  const once = appendResponseLanguageBlock(base, "en-US");
  assert(once.startsWith("SYSTEM:"));
  assert(once.endsWith("or any machine-read identifier (R1)."));

  // Idempotence: un composeur qui passe deux fois (retry, repair prompt) ne
  // doit pas empiler deux blocs contradictoires en queue.
  const twice = appendResponseLanguageBlock(once, "en-US");
  assertEquals(twice, once);
  assertEquals(twice.split("RESPONSE_LANGUAGE:").length - 1, 1);
});

Deno.test("R3 — le gel SURFACE_FORM se lit sur un seul predicat", () => {
  // Desarmement: aucun. Les ceintures a morphologie francaise de
  // BELT_AUDIT.md restent armees derriere ce predicat tant qu'elles existent.
  assert(isFrenchLocale("fr-FR"));
  assert(isFrenchLocale("fr-CA"));
  assert(isFrenchLocale("FR"));
  assertEquals(isFrenchLocale("en-US"), false);
  assertEquals(isFrenchLocale(null), false);
  // Fausse premisse: une locale vide n'est pas francaise. Un fail-open vers
  // "fr" rearmerait des detecteurs francais sur un locuteur anglophone.
  assertEquals(isFrenchLocale(""), false);
});
