// ⚠️ `jsr:@std/assert@1` ET PAS `std/testing/asserts.ts`: la carte d'import
// `std/` vit dans `supabase/functions/deno.json`, et le gate lance les tests
// depuis la RACINE du dépôt, où elle n'est pas résolue. Mesuré: vert lancé
// depuis `supabase/functions`, `TS2307` depuis la racine.
import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  buildFoodTermsExtractPrompt,
  cleanFoodTerm,
  FOOD_TERMS_EXTRACT_SYSTEM_PROMPT,
  foodTermsFrom,
  parseFoodTermsAnswer,
  splitFoodTerms,
} from "./food_terms_extract.ts";

// ===========================================================================
// DU TEXTE LIBRE AUX BULLES — 2026-09-20
//
// Ce que ce fichier garde: la relecture ne lève jamais, le repli sans modèle
// rend le texte de la personne et pas « rien », et la promesse du prompt touche
// sa clé de schéma. Chaque cas a son contraire: un parseur qui rendrait
// toujours `parsed: true` passerait le cas nominal, et tomberait sur le cas
// illisible.
// ===========================================================================

Deno.test("cleanFoodTerm: minuscules, bords, accents GARDÉS", () => {
  assertEquals(cleanFoodTerm("  Cacahuète. "), "cacahuète");
  assertEquals(cleanFoodTerm("\"thon\""), "thon");
  assertEquals(cleanFoodTerm("fruits   de mer"), "fruits de mer");
  assertEquals(cleanFoodTerm(""), "");
  assertEquals(cleanFoodTerm(null), "");
});

Deno.test("splitFoodTerms: virgules, « et », « and », retours à la ligne", () => {
  assertEquals(
    splitFoodTerms("champignons, thon et mangue"),
    ["champignons", "thon", "mangue"],
  );
  assertEquals(
    splitFoodTerms("peanuts; shellfish and kiwi\nmilk"),
    ["peanuts", "shellfish", "kiwi", "milk"],
  );
});

Deno.test("splitFoodTerms: ⛔ « et » N'EST PAS coupé à l'intérieur d'un mot", () => {
  // « poulet » et « crevette » contiennent « et » — seule la forme entourée
  // d'espaces sépare. Sans cette garde, « poulet » deviendrait « poul ».
  assertEquals(splitFoodTerms("poulet, crevette"), ["poulet", "crevette"]);
});

Deno.test("splitFoodTerms: dédoublonne et plafonne à vingt", () => {
  assertEquals(splitFoodTerms("thon, Thon, thon."), ["thon"]);
  // ⛔ LE LITTÉRAL, PAS LA CONSTANTE. Écrit d'abord avec `FOOD_TERMS_MAX` des
  // deux côtés — le test restait vert quel que soit le plafond, c'est-à-dire
  // ne gardait rien (cicatrice `test-parameterized-by-its-own-constant`, et
  // le garde `constant_pinning_gate_test.ts` l'a vu). La valeur est épinglée
  // dans `constant_pins_test.ts`; ici on prouve que le plafond MORD.
  const many = Array.from({ length: 25 }, (_, i) => `a${i}`).join(", ");
  assertEquals(splitFoodTerms(many).length, 20);
});

Deno.test("parseFoodTermsAnswer: le cas nominal", () => {
  const out = parseFoodTermsAnswer('{"foods": ["Champignon", "thon", "mangue"]}');
  assertEquals(out.parsed, true);
  assertEquals(out.terms, ["champignon", "thon", "mangue"]);
});

Deno.test("parseFoodTermsAnswer: une liste vide LISIBLE est une réponse", () => {
  const out = parseFoodTermsAnswer('{"foods": []}');
  assertEquals(out.parsed, true);
  assertEquals(out.terms, []);
});

Deno.test("parseFoodTermsAnswer: ⛔ l'illisible ne lève pas, il dit `parsed: false`", () => {
  for (const raw of ["", "pas du json", "{}", '{"foods": "thon"}', '{"foods": [1, 2]}', null, 42]) {
    const out = parseFoodTermsAnswer(raw);
    assertEquals(out.parsed, false, `raw=${String(raw)}`);
    assertEquals(out.terms, []);
  }
});

Deno.test("foodTermsFrom: le modèle fait foi, même vide", () => {
  const got = foodTermsFrom("champignons, thon", { parsed: true, terms: ["champignon"] });
  assertEquals(got, { via: "model", terms: ["champignon"] });
  const empty = foodTermsFrom("je ne sais pas", { parsed: true, terms: [] });
  assertEquals(empty, { via: "model", terms: [] });
});

Deno.test("foodTermsFrom: ⛔ sans modèle, le texte de la personne — jamais rien", () => {
  const got = foodTermsFrom("champignons, thon et mangue", null);
  assertEquals(got, { via: "split", terms: ["champignons", "thon", "mangue"] });
  const unreadable = foodTermsFrom("cacahuètes", { parsed: false, terms: [] });
  assertEquals(unreadable, { via: "split", terms: ["cacahuètes"] });
});

Deno.test("le prompt: la promesse et la clé `foods` se touchent", () => {
  // Cicatrice chiffrée: 0 % de conformité quand elles sont éloignées. La
  // phrase qui dit CE QU'ON MET DANS LA LISTE nomme la clé dans les 300
  // caractères.
  const p = FOOD_TERMS_EXTRACT_SYSTEM_PROMPT;
  const key = p.indexOf('"foods"');
  const promise = p.indexOf("the list of food names you extracted");
  assert(key >= 0 && promise >= 0);
  assert(Math.abs(promise - key) < 300, `distance ${Math.abs(promise - key)}`);
});

Deno.test("le prompt utilisateur nomme l'intention et borne le texte", () => {
  const allergy = buildFoodTermsExtractPrompt({ text: "x", kind: "allergy", locale: "fr" });
  assert(allergy.includes("ALLERGIC"));
  const dislike = buildFoodTermsExtractPrompt({ text: "x", kind: "dislike", locale: "fr" });
  assert(dislike.includes("DO NOT LIKE"));
  const long = buildFoodTermsExtractPrompt({ text: "a".repeat(1000), kind: "dislike", locale: "fr" });
  assert(long.length < 600);
});
