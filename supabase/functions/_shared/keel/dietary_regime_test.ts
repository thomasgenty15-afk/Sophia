import { assert, assertEquals } from "jsr:@std/assert@^1.0.0";
import {
  DIETARY_REGIMES,
  dietaryRegimePromptLine,
  excludedGroupsFor,
  excludedSurfaceFormsFor,
  parseDietaryRegime,
  uncoverableSentinelsFor,
} from "./dietary_regime.ts";
import { FOOD_GROUP_REFS } from "./tokens.ts";

// ===========================================================================
// LES RÉGIMES — ce que ce fichier garde
//
// Pas « la fonction rend un tableau ». Ce qui est testé, ce sont les trois
// façons dont un régime se trahit en production:
//
//   1. la faute INVISIBLE — le nuoc-mâm, la gélatine, le bouillon de volaille
//      d'une soupe « de légumes ». Personne n'appelle ça de la viande.
//   2. la garde MONOLINGUE — le produit sort en fr-FR par défaut, et une
//      liste qui ne connaît que « bacon » laisse passer « lardons ».
//   3. le JETON DU RÉGIME dans la liste d'évitement — le piège `conditionRef`,
//      qui a déjà bâillonné un message d'urgence en run réel.
// ===========================================================================

Deno.test("un régime se lit, et ce qui n'est pas de la liste ne se devine pas", () => {
  assertEquals(parseDietaryRegime("vegan"), "vegan");
  assertEquals(parseDietaryRegime("  VEGAN  "), "vegan");
  assertEquals(parseDietaryRegime("flexitarian"), null);
  assertEquals(parseDietaryRegime(null), null);
  assertEquals(parseDietaryRegime(42), null);
  // Halal et casher ne sont PAS ici, exprès: ils restent sur `religious`.
  // Les accepter rendrait une garantie que ce module ne tient pas.
  assertEquals(parseDietaryRegime("halal"), null);
  assertEquals(parseDietaryRegime("kosher"), null);
});

Deno.test("les groupes exclus sortent du vocabulaire fermé, jamais d'un second", () => {
  // Le dépôt a déjà payé une taxonomie parallèle. Tout ce qui sort d'ici doit
  // être un `FOOD_GROUP_REFS` — sinon la FK et les tests de jetons mentent.
  for (const regime of DIETARY_REGIMES) {
    for (const group of excludedGroupsFor(regime)) {
      assert(
        (FOOD_GROUP_REFS as readonly string[]).includes(group),
        `${regime} exclut ${group}, absent de FOOD_GROUP_REFS`,
      );
    }
  }
});

Deno.test("`lean_protein` n'est JAMAIS exclu — il vaut aussi pour le tofu", () => {
  // LE DÉFAUT QUE CE TEST GARDE. Le groupe désigne aussi bien un blanc de
  // poulet qu'un tofu; l'exclure interdirait le tofu à un végétarien, soit
  // l'exact contraire du but. La garantie repose sur la prose, pas sur lui.
  for (const regime of DIETARY_REGIMES) {
    assertEquals(
      excludedGroupsFor(regime).includes("lean_protein"),
      false,
      `${regime} exclut lean_protein — le tofu tomberait avec le poulet`,
    );
  }
});

Deno.test("les fautes INVISIBLES sont couvertes — c'est là que ça casse", () => {
  const vegan = excludedSurfaceFormsFor("vegan");
  const vegetarian = excludedSurfaceFormsFor("vegetarian");

  // Aucun de ces mots ne dit « viande » ni « poisson », et tous en sont.
  for (const hidden of ["fish sauce", "nuoc-mam", "anchovy", "worcestershire"]) {
    assert(vegetarian.includes(hidden), `végétarien rate: ${hidden}`);
  }
  for (const hidden of ["gelatin", "gélatine", "saindoux", "lard"]) {
    assert(vegetarian.includes(hidden), `végétarien rate: ${hidden}`);
  }
  // Le bouillon de volaille d'une soupe « de légumes ».
  for (const hidden of ["chicken stock", "bouillon de volaille", "fond de volaille"]) {
    assert(vegetarian.includes(hidden), `végétarien rate: ${hidden}`);
  }
  // Le miel n'est pas un produit laitier, et le véganisme l'exclut.
  assert(vegan.includes("honey") && vegan.includes("miel"), "végan rate le miel");
});

Deno.test("la garde vaut dans les DEUX langues", () => {
  // `profiles.locale` vaut fr-FR par défaut sur ce produit: une liste qui ne
  // connaît que l'anglais est une liste désarmée pour la majorité des élèves.
  const vegetarian = excludedSurfaceFormsFor("vegetarian");
  const pairs: [string, string][] = [
    ["bacon", "lardons"],
    ["ham", "jambon"],
    ["chicken", "poulet"],
    ["fish", "poisson"],
    ["shrimp", "crevette"],
    ["beef", "boeuf"],
  ];
  for (const [en, fr] of pairs) {
    assert(vegetarian.includes(en), `manque en anglais: ${en}`);
    assert(vegetarian.includes(fr), `manque en français: ${fr}`);
  }

  const vegan = excludedSurfaceFormsFor("vegan");
  for (const [en, fr] of [["cheese", "fromage"], ["egg", "oeuf"], ["milk", "lait"]]) {
    assert(vegan.includes(en), `manque en anglais: ${en}`);
    assert(vegan.includes(fr), `manque en français: ${fr}`);
  }
});

Deno.test("le NOM du régime n'est jamais dans ce qu'on exclut", () => {
  // LE PIÈGE `conditionRef`, et il a déjà mordu en réel: armer une ceinture
  // sur « diabetes » avait remplacé un message d'urgence par un refus poli.
  // Ici, « vegan » dans la liste ferait rejeter toute réponse qui décrit un
  // plat comme végan — les bonnes réponses, et seulement pour les végans.
  for (const regime of DIETARY_REGIMES) {
    const forms = excludedSurfaceFormsFor(regime);
    for (const name of [...DIETARY_REGIMES, "vegetarien", "végétarien", "vegetalien"]) {
      assertEquals(
        forms.includes(name),
        false,
        `${regime} s'exclut lui-même via ${name}`,
      );
    }
  }
});

Deno.test("le végan exclut strictement plus que le végétarien, qui exclut plus que le pescatarien", () => {
  const vegan = new Set(excludedSurfaceFormsFor("vegan"));
  const vegetarian = excludedSurfaceFormsFor("vegetarian");
  const pescatarian = excludedSurfaceFormsFor("pescatarian");

  for (const form of vegetarian) {
    assert(vegan.has(form), `végan devrait exclure ${form}`);
  }
  const vegetarianSet = new Set(vegetarian);
  for (const form of pescatarian) {
    assert(vegetarianSet.has(form), `végétarien devrait exclure ${form}`);
  }
  // Et le pescatarien mange du poisson: la relation n'est pas symétrique.
  assertEquals(pescatarian.includes("salmon"), false);
  assert(vegetarian.includes("salmon"));
});

Deno.test("la sortie est STABLE — un ordre qui bouge casse le cache et les tests", () => {
  for (const regime of DIETARY_REGIMES) {
    const a = excludedSurfaceFormsFor(regime);
    const b = excludedSurfaceFormsFor(regime);
    assertEquals(a, b);
    assertEquals(a, [...a].sort(), "la sortie doit être triée");
    // Dédupliquée: `chorizo` et `sardine` sont dans deux familles.
    assertEquals(new Set(a).size, a.length, "des doublons subsistent");
  }
});

Deno.test("la consigne NOMME les familles au lieu de compter sur la culture du modèle", () => {
  const vegan = dietaryRegimePromptLine("vegan");
  for (const named of ["no meat", "no fish", "no eggs", "no dairy", "no honey"]) {
    assert(vegan.includes(named), `la consigne végan ne nomme pas: ${named}`);
  }
  // Et elle dit où la règle se perd d'habitude.
  for (const regime of DIETARY_REGIMES) {
    const line = dietaryRegimePromptLine(regime);
    assert(line.includes("stocks, sauces, fats and garnishes"), regime);
    assert(line.includes("fish sauce"), regime);
  }
  // Le pescatarien n'est pas privé de poisson par une consigne trop large.
  assert(dietaryRegimePromptLine("pescatarian").includes("Fish and seafood are fine"));
});

Deno.test("la B12 est signalée incouvrable pour le végan, et pour lui seul", () => {
  // Un plan végan sans B12 est carencé, pas médiocre. Se taire livrerait la
  // carence en silence. Œufs et laitages la portent: le végétarien n'a rien.
  assertEquals(uncoverableSentinelsFor("vegan"), ["b12_source"]);
  assertEquals(uncoverableSentinelsFor("vegetarian"), []);
  assertEquals(uncoverableSentinelsFor("pescatarian"), []);
});
