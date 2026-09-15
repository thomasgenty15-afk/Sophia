// KEEL — le moteur de matching PARTAGÉ, testé pour lui-même.
//
// POURQUOI CE FICHIER N'EXISTAIT PAS, ET POURQUOI C'EST LE PROBLÈME
// `forbidden_matcher.ts` porte la liste de négation des DEUX verrous — celui de
// l'allergie médicale et celui de l'interdit du coach. Il n'avait aucun test à
// lui: il n'était couvert qu'à travers ses deux appelants, chacun avec SES
// phrases. Résultat mesuré, et il est cher: le cas « l'agent peut EXPLIQUER un
// interdit » n'existait qu'en FRANÇAIS, des deux côtés
// (`doctrine_test.ts` et `keel_output_locks_test.ts` épinglent tous les deux
// « Marc ne fait pas de 6 petits repas »). En français la négation est
// PRÉ-nominale et tombe contre l'objet; en anglais elle est PRÉ-verbale et n'y
// tombe jamais. La phrase que `doctrine.ts` désigne nommément comme celle qui
// doit survivre — "your coach doesn't do six small meals" — était donc rejetée
// en production, dans la langue du produit, avec deux tests verts au-dessus.
//
// Les tests de négation vivent ici désormais, au niveau où la règle est écrite.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  findForbiddenMatches,
  type ForbiddenTerm,
} from "./forbidden_matcher.ts";

const TERMS: ForbiddenTerm[] = [
  {
    ruleId: "six_small_meals",
    token: "six_small_meals",
    surfaceForms: ["six small meals", "6 petits repas", "grazing"],
  },
  { ruleId: "c1", token: "peanut" },
];

function bites(text: string): boolean {
  return findForbiddenMatches(text, TERMS).length > 0;
}

// ---------------------------------------------------------------------------
// FAUX POSITIFS — les phrases légitimes que le verrou ne doit PAS mordre
// ---------------------------------------------------------------------------

Deno.test("EN: a contracted negation is a negation ('not' is not in \"doesn't\")", () => {
  // LA phrase de l'en-tête de doctrine.ts. Un agent qui ne peut pas la dire ne
  // peut pas expliquer la méthode de son propre coach.
  for (
    const explanation of [
      "Your coach doesn't do six small meals.",
      "Your coach does not do six small meals.",
      "We don't do six small meals here.",
      "Marc doesn't do grazing.",
      "That isn't six small meals, that's three plus snacks.",
      "Your coach won't put you on six small meals.",
      "We don't use grazing here.",
    ]
  ) {
    assertEquals(bites(explanation), false, explanation);
  }
});

Deno.test("EN: the typographic apostrophe counts as much as the ASCII one", () => {
  // `normalizeForMatch` retire les diacritiques et minusculise; elle ne
  // normalise PAS les apostrophes. Un générateur produit U+2019 en continu, et
  // une liste qui n'accepte que U+0027 est désarmée une fois sur deux.
  assertEquals(bites("Your coach doesn’t do six small meals."), false);
  assertEquals(bites("You can’t have peanuts."), false);
});

Deno.test("EN: a protective negation about an allergen is not a suggestion", () => {
  for (
    const protective of [
      "Avoid peanuts, they're dangerous for you.",
      "Avoid the peanuts in that sauce.",
      "You can't have peanuts.",
      "You cannot have peanuts.",
      "Look for a peanut-free label.",
      "Your peanut allergy rules that one out.",
    ]
  ) {
    assertEquals(bites(protective), false, protective);
  }
});

Deno.test("EN: the closed negation list beyond the auxiliaries", () => {
  for (
    const explanation of [
      "Rather than six small meals, he keeps three.", // rather than ≡ instead of
      "He stopped recommending six small meals.",
      "Your coach rejects six small meals.",
      "Your coach moved away from six small meals years ago.",
    ]
  ) {
    assertEquals(bites(explanation), false, explanation);
  }
});

Deno.test("FR: the pre-nominal negation still passes, determiners included", () => {
  for (
    const explanation of [
      "Marc ne fait pas de 6 petits repas, il tient la fenêtre.",
      "On évite les 6 petits repas ici.",
      "Évite les cacahuètes dans cette sauce.",
      "Prends un plat sans cacahuète.",
    ]
  ) {
    assertEquals(bites(explanation), false, explanation);
  }
});

// ---------------------------------------------------------------------------
// FAUX NÉGATIFS — ce que l'élargissement ne doit SURTOUT pas blanchir
// ---------------------------------------------------------------------------

Deno.test("THE ANCHOR PROPERTY: a negation aimed elsewhere blanches nothing", () => {
  // C'est CE test qui rend l'élargissement de la liste sûr, et pas la liste
  // elle-même. `NEGATION_BEFORE` est ancré sur `$`: négation + verbe +
  // déterminants doivent courir JUSQU'AU token. Dès qu'un autre objet
  // s'intercale, la phrase redevient une recommandation.
  //
  // Si ce test tombe un jour, c'est qu'on a autorisé du texte libre entre la
  // négation et le token — et le verrou est mort sans que rien d'autre bouge.
  for (
    const endorsement of [
      "Don't skip breakfast, have six small meals.",
      "He doesn't like eating three meals; try six small meals.",
      "Your coach doesn't recommend skipping breakfast, but grazing works.",
      "We don't do snacks. We do six small meals.",
      "Never skip lunch — grazing across the afternoon helps.",
      "Rather than skipping breakfast, try six small meals.",
      "He stopped eating late; six small meals suit him now.",
      "Instead of three meals, go for six small meals.",
      "No peanuts at breakfast, but peanut butter at lunch is fine.",
      "You should avoid dairy. Add peanut butter to your oats.",
    ]
  ) {
    assert(bites(endorsement), `should have bitten: ${endorsement}`);
  }
});

Deno.test("a plain endorsement bites, in both languages", () => {
  for (
    const endorsement of [
      "Try six small meals a day.",
      "You could try six small meals through the day.",
      "I'd go with grazing across the day.",
      "Essaie plutôt 6 petits repas répartis dans la journée.",
      "Add peanut butter to your oats.",
    ]
  ) {
    assert(bites(endorsement), `should have bitten: ${endorsement}`);
  }
});

Deno.test("audit mode ignores every exception, contractions included", () => {
  // `allowNegatedMentions: false` est la lecture ABSOLUE du contrat. Elle ne
  // doit rien apprendre des élargissements ci-dessus.
  for (
    const text of [
      "Your coach doesn't do six small meals.",
      "You can't have peanuts.",
      "Look for a peanut-free label.",
    ]
  ) {
    assert(
      findForbiddenMatches(text, TERMS, { allowNegatedMentions: false })
        .length > 0,
      text,
    );
  }
});

// ---------------------------------------------------------------------------
// Le token, ses formes, et ses limites de mot
// ---------------------------------------------------------------------------

Deno.test("a token matches its ordinary surface variations", () => {
  for (
    const text of [
      "Add peanut butter to your oats.",
      "Peanuts are a good snack.", // pluriel
      "PEANUT BUTTER is fine.", // casse
      "A peanut-butter spoon after lunch.", // trait d'union
      "Try some peanut\nbutter with the banana.", // coupure de ligne
      "A peanut's fat profile is fine here.", // possessif
      "Ajoute des cacahuètes.", // diacritiques, via token 'cacahuete'
    ]
  ) {
    const terms: ForbiddenTerm[] = text.includes("cacahu")
      ? [{ ruleId: "c1", token: "cacahuete" }]
      : TERMS;
    assert(findForbiddenMatches(text, terms).length > 0, text);
  }
});

Deno.test("a token does NOT match inside an unrelated word", () => {
  assertEquals(bites("He was peanutty about it."), false);
});

Deno.test("one occurrence is one violation, whatever the needle overlap", () => {
  // Le token `six_small_meals` et la surface form "six small meals" décrivent
  // le même endroit du texte: un seul constat, pas deux.
  const found = findForbiddenMatches("Try six small meals a day.", TERMS);
  assertEquals(found.length, 1);
  assertEquals(found[0].ruleId, "six_small_meals");
});
