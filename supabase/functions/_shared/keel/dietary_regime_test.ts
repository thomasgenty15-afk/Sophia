import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@^1.0.0";
import {
  DIETARY_REGIMES,
  dietaryRegimePromptLine,
  excludedGroupsFor,
  excludedSurfaceFormsFor,
  isPlantAnalogue,
  parseDietaryRegime,
  scanDietaryRegime,
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

Deno.test("un ANALOGUE VÉGÉTAL n'est jamais une violation — le défaut du run réel", () => {
  // ── MESURÉ EN RUN RÉEL, 2026-08-11 ─────────────────────────────────────
  // Génération pour un élève végan: le modèle a composé trois plats au
  // « unsweetened soy yogurt » — exactement ce qu'il fallait faire. La garde a
  // mordu dessus, parce que « yogurt » est dans les formes laitières.
  //
  // Une fois le verrou câblé en REJET DUR, ça viderait les plans des végans —
  // les seuls qu'il existe pour protéger. Une garde qui casse sur sa
  // population cible est pire qu'une garde absente: elle a l'air de marcher.
  for (
    const analogue of [
      "unsweetened soy yogurt",
      "soy milk",
      "almond milk",
      "oat milk",
      "coconut cream",
      "vegan cheese",
      "plant-based butter",
      "vegan chicken",
      "soy sausage",
      "yaourt de soja",
      "lait d'amande",
      "fromage végétal",
      "crème de coco",
      "boisson à l'avoine",
    ]
  ) {
    assert(isPlantAnalogue(analogue), `raté comme analogue végétal: ${analogue}`);
  }
});

Deno.test("l'exemption ne DÉSARME PAS le vrai animal", () => {
  // LE RISQUE SYMÉTRIQUE, et c'est lui qui rend l'exemption dangereuse si elle
  // est écrite en sous-chaîne: « riz au lait » contient « riz », et n'est pas
  // pour autant végan.
  for (
    const real of [
      "riz au lait",
      "rice pudding with milk",
      "chicken",
      "poulet rôti",
      "gruyère",
      "beurre doux",
      "yaourt nature",
      "greek yogurt",
      "lardons",
      "saumon",
    ]
  ) {
    assertEquals(
      isPlantAnalogue(real),
      false,
      `désarmé à tort — ${real} devrait rester une violation`,
    );
  }
});

Deno.test("la B12 est signalée incouvrable pour le végan, et pour lui seul", () => {
  // Un plan végan sans B12 est carencé, pas médiocre. Se taire livrerait la
  // carence en silence. Œufs et laitages la portent: le végétarien n'a rien.
  assertEquals(uncoverableSentinelsFor("vegan"), ["b12_source"]);
  assertEquals(uncoverableSentinelsFor("vegetarian"), []);
  assertEquals(uncoverableSentinelsFor("pescatarian"), []);
});

// ═══════════════════════════════════════════════════════════════════════════
// LE GROUPE DÉCLARÉ PAR LE MODÈLE (2026-08-19) — LA CORRECTION HONNÊTE
// ═══════════════════════════════════════════════════════════════════════════
//
// Le compteur de régime restait faux sur une classe résiduelle NOMMÉE:
//   · homonyme        — « butter beans » compté en brèche laitière sur `butter`
//   · marqueur végétal — « Vegan sausage » compté en brèche carnée sur `sausage`
//
// ⛔ LA CORRECTION N'EST PAS UN APPARIEMENT PLUS MALIN. Une liste de plus
// aurait rejoué « laitue ≠ lait ». Le modèle DÉCLARE le groupe, on le valide
// contre la liste fermée, et aucune chaîne n'est interrogée pour en décider.

Deno.test("HOMONYME — « butter beans » déclaré `legumes` n'est plus une brèche laitière", () => {
  const sansGroupe = scanDietaryRegime("vegan", { terms: ["butter beans"] });
  assertEquals(
    sansGroupe.breaches.length,
    1,
    "prémisse: sans groupe déclaré, l'homonyme mord — c'est le défaut mesuré",
  );
  assertEquals(sansGroupe.group.undecided, 1);

  const avecGroupe = scanDietaryRegime("vegan", {
    items: [{ term: "butter beans", group: "legumes" }],
  });
  assertEquals(avecGroupe.breaches, []);
  assertEquals(avecGroupe.silencedByPlantAnalogue.length, 1);
  assertEquals(avecGroupe.group.plantOnly, 1);
});

Deno.test("MARQUEUR VÉGÉTAL — « Vegan sausage » déclaré `tofu_tempeh` ne mord plus", () => {
  const avecGroupe = scanDietaryRegime("vegetarian", {
    items: [{ term: "Vegan sausage", group: "tofu_tempeh" }],
  });
  assertEquals(avecGroupe.breaches, []);
  assertEquals(avecGroupe.group.plantOnly, 1);

  // ⚠️ LA PROSE RESTE LA PROSE. Le groupe est déclaré SUR UN ALIMENT; un titre
  // porte plusieurs aliments et n'a pas de groupe. C'est l'asymétrie déjà
  // écrite pour `isPlantAnalogue`, et elle ne bouge pas.
  const enProse = scanDietaryRegime("vegetarian", {
    prose: ["Vegan sausage and mash"],
  });
  assertEquals(enProse.group.undecided, 0, "aucun aliment déclaré dans une prose");
});

Deno.test("LE GROUPE AJOUTE DE LA COUVERTURE: « coq au vin » déclaré `poultry` mord", () => {
  // Ce que les formes de surface n'attrapaient PAS. `coq` n'est dans aucune
  // liste, et il n'a rien à y faire — l'écrire à la main aurait été une
  // quatorzième forme, puis une quinzième. La déclaration règle la classe.
  const sansGroupe = scanDietaryRegime("vegetarian", { terms: ["coq au vin"] });
  assertEquals(sansGroupe.breaches, [], "prémisse: aucune forme de surface ne porte « coq »");

  const avecGroupe = scanDietaryRegime("vegetarian", {
    items: [{ term: "coq au vin", group: "poultry" }],
  });
  assertEquals(avecGroupe.breaches.length, 1);
  assertEquals(avecGroupe.breaches[0].token, "poultry");
  assertEquals(avecGroupe.group.excluded, 1);
});

Deno.test("⛔ LE GROUPE NE DESSERRE RIEN: `lean_protein` ne blanchit pas le poulet", () => {
  // LE PIÈGE DE CE LOT. `EXCLUDED_GROUPS` est GROSSIER et son en-tête le dit:
  // `lean_protein` désigne aussi bien un blanc de poulet qu'un tofu. En faire
  // un groupe « végétal » aurait désarmé la ceinture sur la viande — c'est-à-
  // dire desserré la seule chose que ce fichier existe pour tenir.
  const scan = scanDietaryRegime("vegan", {
    items: [{ term: "chicken breast", group: "lean_protein" }],
  });
  assertEquals(scan.breaches.length, 1, "le poulet mord toujours sur son mot");
  assertEquals(scan.group.undecided, 1, "`lean_protein` ne tranche pas: on retombe sur la prose");
  assertEquals(scan.group.plantOnly, 0);

  // Les autres groupes ambigus, un par un, avec ce qu'ils cachent.
  for (
    const [group, term] of [
      ["sauce_dressing", "fish sauce"],
      ["other_added_fat", "butter"],
      ["sugar_sweets", "honey"],
      ["coffee_tea", "latte with milk"],
    ] as const
  ) {
    const ambiguous = scanDietaryRegime("vegan", { items: [{ term, group }] });
    assertEquals(
      ambiguous.group.plantOnly,
      0,
      `'${group}' ne doit JAMAIS blanchir: il porte « ${term} »`,
    );
    assert(
      ambiguous.breaches.length > 0,
      `'${group}' a laissé passer « ${term} »`,
    );
  }
});

Deno.test("un groupe déclaré HORS LISTE FERMÉE ne décide rien — il ne peut pas mentir", () => {
  // Le type interdit déjà le slug inventé côté moteur; c'est le PARSEUR de
  // `meal_generation.ts` qui rend `null` sur ce que le modèle invente. Ici on
  // épingle le contrat de repli: `null` ⇒ comportement d'avant ce lot.
  const scan = scanDietaryRegime("vegan", {
    items: [{ term: "chicken stock", group: null }],
  });
  assertEquals(scan.group.undecided, 1);
  assertEquals(scan.breaches.length, 1);
});

Deno.test("`terms` est exactement `items` avec `group: null` — aucun appelant ne change", () => {
  // La preuve d'INNOCUITÉ pour la population qui ne déclare rien. Les deux
  // canaux doivent rendre la même chose, sinon migrer un appelant changerait
  // son comptage en silence.
  const corpus = ["lardons", "soy yoghurt", "butter beans", "tofu", "chicken stock"];
  const viaTerms = scanDietaryRegime("vegan", { terms: corpus });
  const viaItems = scanDietaryRegime("vegan", {
    items: corpus.map((term) => ({ term, group: null })),
  });
  assertEquals(
    viaTerms.breaches.map((b) => b.matchedText),
    viaItems.breaches.map((b) => b.matchedText),
  );
  assertEquals(
    viaTerms.silencedByPlantAnalogue.length,
    viaItems.silencedByPlantAnalogue.length,
  );
  assertEquals(viaTerms.group, viaItems.group);
});

Deno.test("la consigne PORTE la clé de schéma, son compte et son échappatoire", () => {
  // ⛔ « LA PROMESSE ET LA CLÉ DOIVENT SE TOUCHER »: un champ dont la promesse
  // vit dans le message et la clé dans le prompt système sort à 0 %. Mesuré
  // deux fois dans ce dépôt. Ce test tient les trois moitiés du correctif.
  for (const regime of DIETARY_REGIMES) {
    const line = dietaryRegimePromptLine(regime);
    // ① LA CLÉ, littéralement, et où la mettre.
    assertStringIncludes(line, '"group"');
    assertStringIncludes(line, "dishes AND in");
    assertStringIncludes(line, "preparations");
    // ② LE NOMBRE ATTENDU.
    assertStringIncludes(line, "every single one");
    // ③ L'ÉCHAPPATOIRE, NOMMÉE.
    assertStringIncludes(line, "write null");
    // ④ Le vocabulaire fermé est ÉCRIT, pas sous-entendu — sinon le modèle
    //    invente des slugs plausibles, et un slug inventé est refusé en
    //    silence par le parseur.
    for (const group of ["legumes", "tofu_tempeh", "poultry", "dairy_cheese"]) {
      assertStringIncludes(line, group);
    }
    // ⑤ Les deux cas mesurés sont nommés dans la consigne elle-même.
    assertStringIncludes(line, "Butter beans are legumes");
    assertStringIncludes(line, "vegan sausage is tofu_tempeh");
  }
});
