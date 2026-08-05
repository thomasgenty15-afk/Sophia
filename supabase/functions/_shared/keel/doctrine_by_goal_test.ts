// LOT DOCTRINE-BY-GOAL — une doctrine écrite, N doctrines servies.
//
// LE TEST QUI PORTE LE LOT, et il est nommé pour ça:
//   * "deux élèves du même coach, objectifs différents: même voix, croyances
//      différentes, et aucune croyance ciblée ne franchit la frontière"
//
// Les autres tiennent les trois arbitrages qui pourraient l'annuler en silence:
//   * la RÉTROCOMPATIBILITÉ — une doctrine sans aucune portée compile OCTET
//     POUR OCTET à l'identique pour les six variantes, donc un coach existant
//     ne voit strictement rien changer, et le cache n'est pas fragmenté;
//   * le VERROU DES INTERDITS reste global — l'ensemble des règles de la
//     ceinture est identique pour les six variantes, donc la portée ne peut pas
//     désarmer une garde;
//   * la DIRECTION DE L'ÉCHEC — une portée illisible rend l'entrée muette,
//     jamais globale.

import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";

import {
  type CoachDoctrine,
  compileAllDoctrineVariants,
  compileDoctrineBlock,
  doctrineCacheFootprint,
  DOCTRINE_VARIANT_GOALS,
  findDoctrineViolations,
  parseCoachDoctrine,
  variantGoal,
  variantKey,
} from "./doctrine.ts";
import { GOAL_TOKENS, type GoalToken, goalScopeApplies } from "./tokens.ts";
import { ruleAppliesTo } from "./protocol_compiler.ts";

// ---------------------------------------------------------------------------
// LA DOCTRINE D'UN VRAI COACH — la même dans tous les tests de ce fichier.
//
// Elle est écrite comme un coach l'écrirait: une voix, un vocabulaire et un
// interdit COMMUNS, et deux croyances + deux arbitrages qui ne s'adressent
// visiblement pas aux mêmes élèves.
// ---------------------------------------------------------------------------

const ROW = {
  coach_id: "c1",
  version: 3,
  coach_display_name: "Marlow",
  content_locale: "en",
  beliefs: [
    { claim: "You eat protein at every meal, no exceptions." },
    {
      claim: "Do not panic over a plateau on the scale.",
      rationale: "the scale is one signal out of four",
      goal_scope: ["fat_loss"],
    },
    { claim: "Eat more than you think you need.", goal_scope: ["recomposition", "performance"] },
  ],
  forbidden: [{
    token: "six_small_meals",
    surface_forms: ["6 petits repas", "six small meals"],
    reason: "it breaks the window",
    instead: "Three real meals you sit down for.",
  }],
  vocabulary: [{ term: "la fenêtre", meaning: "the eating window" }],
  arbitrations: [
    { situation: "the student says they cracked", coach_answer: "One evening is data.", source: "interview" },
    {
      situation: "the student says the scale has not moved in ten days",
      coach_answer: "Ten days is not a plateau, it is a Tuesday. Show me the waist.",
      goal_scope: ["fat_loss"],
    },
  ],
  foods: { discouraged: [{ term: "seed oil", surface_forms: ["huile de graines"] }] },
  qa: [{ question: "Coffee?", answer: "Black, after food." }],
  voice: { address: "tu", length: "short", emojis: "none", language: "en" },
};

function marlow(): CoachDoctrine {
  const { doctrine } = parseCoachDoctrine(ROW);
  return doctrine;
}

/** La même doctrine, sans une seule portée: l'existant d'avant ce lot. */
function unscoped(): CoachDoctrine {
  const { doctrine } = parseCoachDoctrine({
    ...ROW,
    beliefs: ROW.beliefs.map(({ goal_scope: _drop, ...rest }) => rest),
    arbitrations: ROW.arbitrations.map(({ goal_scope: _drop, ...rest }) => rest),
  });
  return doctrine;
}

// ===========================================================================
// LE TEST QUI PORTE LE LOT
// ===========================================================================

Deno.test("deux élèves du même coach: même voix, conseils différents, aucune croyance ne franchit la frontière", () => {
  const d = marlow();
  const fatLoss = compileDoctrineBlock(d, "fat_loss");
  const recomp = compileDoctrineBlock(d, "recomposition");

  // MÊME VOIX. Ce qui fait que le coach se reconnaît dans les deux.
  for (const shared of [
    "== MARLOW'S METHOD",
    "You eat protein at every meal, no exceptions.",
    "six_small_meals",
    "INSTEAD, this coach says: Three real meals you sit down for.",
    `"la fenêtre": the eating window`,
    "One evening is data.",
    "seed oil",
    "Black, after food.",
    `address the student with "tu"`,
  ]) {
    assert(fatLoss.text.includes(shared), `perte de gras devrait porter: ${shared}`);
    assert(recomp.text.includes(shared), `recomposition devrait porter: ${shared}`);
  }

  // CONSEILS DIFFÉRENTS. Ce qui fait que la portée sert à quelque chose.
  assert(fatLoss.text.includes("Do not panic over a plateau"));
  assert(fatLoss.text.includes("Ten days is not a plateau"));
  assert(!fatLoss.text.includes("Eat more than you think you need."));

  assert(recomp.text.includes("Eat more than you think you need."));
  assert(!recomp.text.includes("Do not panic over a plateau"));
  assert(!recomp.text.includes("Ten days is not a plateau"));

  // Et les deux blocs ne sont PAS le même bloc.
  assert(fatLoss.hash !== recomp.hash);
});

Deno.test("contre-factuel: une croyance portée sur fat_loss n'atteint AUCUN autre objectif", () => {
  // « Une garde qu'on n'a pas vue mordre est une garde qu'on croit sur
  // parole. » On la regarde mordre sur les cinq objectifs et sur la default.
  const d = marlow();
  const targeted = "Do not panic over a plateau";
  const global = "You eat protein at every meal, no exceptions.";

  for (const goal of DOCTRINE_VARIANT_GOALS) {
    const text = compileDoctrineBlock(d, goal).text;
    assertEquals(
      text.includes(targeted),
      goal === "fat_loss",
      `la croyance ciblée fat_loss ne doit atteindre que fat_loss (vu sur ${variantKey(goal)})`,
    );
    // Et la preuve inverse, sans laquelle la première ne veut rien dire: une
    // croyance SANS portée atteint bien tout le monde.
    assert(text.includes(global), `la croyance globale doit atteindre ${variantKey(goal)}`);
  }
});

Deno.test("une portée à plusieurs objectifs atteint chacun d'eux, et personne d'autre", () => {
  const d = marlow();
  const claim = "Eat more than you think you need.";
  for (const goal of DOCTRINE_VARIANT_GOALS) {
    assertEquals(
      compileDoctrineBlock(d, goal).text.includes(claim),
      goal === "recomposition" || goal === "performance",
      `portée [recomposition, performance] mal appliquée sur ${variantKey(goal)}`,
    );
  }
});

// ===========================================================================
// RÉTROCOMPATIBILITÉ (§6.6) — et c'est aussi la propriété du cache
// ===========================================================================

Deno.test("doctrine SANS aucune portée: toutes les variantes sont octet pour octet identiques", () => {
  // Deux affirmations en une, et elles sont la même:
  //   1. un coach existant ne voit RIEN changer, quel que soit l'objectif de
  //      l'élève qui lui parle;
  //   2. six variantes identiques = UNE entrée de cache, donc zéro
  //      fragmentation pour l'écrasante majorité des coachs.
  const d = unscoped();
  const variants = compileAllDoctrineVariants(d);
  assertEquals(variants.length, GOAL_TOKENS.length + 1, "une variante par objectif, plus la default");
  const texts = new Set(variants.map((v) => v.compiled.text));
  const hashes = new Set(variants.map((v) => v.compiled.hash));
  assertEquals(texts.size, 1, "une doctrine sans portée doit compiler à UN seul texte");
  assertEquals(hashes.size, 1, "et donc occuper UNE seule entrée de cache");

  const footprint = doctrineCacheFootprint(d);
  // Dérivé du vocabulaire, jamais codé en dur: un sixième objectif est apparu
  // pendant ce lot, et un « 6 » écrit ici aurait fait échouer un test qui a
  // pourtant raison sur le fond.
  const n = GOAL_TOKENS.length + 1;
  assertEquals(footprint, { variants: n, distinctHashes: 1, reuseRatio: (n - 1) / n });
});

Deno.test("la variante default d'une doctrine sans portée EST le bloc d'avant ce lot", () => {
  // Le test de non-régression: le texte servi aujourd'hui à un élève quelconque
  // est celui que le compilateur d'avant produisait, aux aliments RECOMMANDÉS
  // près — eux ont migré vers le mapping du protocole, qui les dit dans le
  // vocabulaire fermé et les porte jusqu'au générateur de repas.
  const text = compileDoctrineBlock(unscoped(), null).text;
  const expected = [
    "== MARLOW'S METHOD — YOU SPEAK AS THIS COACH'S AGENT ==",
    "-- WHAT THIS COACH BELIEVES --",
    "-- FORBIDDEN: NEVER RECOMMEND, NEVER ENDORSE --",
    "-- THIS COACH'S WORDS — use them, do not translate them away --",
    "-- HOW THIS COACH ANSWERS (follow these, they are his own words) --",
    "-- FOODS THIS COACH DOES NOT PUT ON A PLATE --",
    "-- WHAT THIS COACH HAS ALREADY ANSWERED --",
    "-- VOICE --",
  ];
  let cursor = -1;
  for (const header of expected) {
    const at = text.indexOf(header);
    assert(at > cursor, `section manquante ou déplacée: ${header}`);
    cursor = at;
  }
  // ET UNE SECTION QUI NE DOIT PLUS JAMAIS REVENIR ICI.
  //
  // « Les aliments avec lesquels ce coach construit » se disait à deux
  // endroits: ici en texte libre, et sur `/coach/protocol` en postures sur le
  // vocabulaire fermé. C'est le mapping qui l'emporte — il atteint le
  // générateur de repas par `protocol_loader.ts`, et il est ce contre quoi une
  // photo se compare. La réintroduire ici rouvrirait les deux listes qui
  // divergent.
  assert(
    !text.includes("LEANS ON"),
    "« avec quoi je construis » appartient au mapping du protocole, pas à la doctrine",
  );
  // Les trois croyances, les deux arbitrages: rien n'a été filtré.
  assert(text.includes("Do not panic over a plateau"));
  assert(text.includes("Eat more than you think you need."));
  assert(text.includes("Ten days is not a plateau"));
});

Deno.test("le bloc ne nomme JAMAIS l'objectif de l'élève ni la portée d'une entrée", () => {
  // Si l'objectif entrait dans le texte, les six variantes différeraient
  // toujours — le cache serait fragmenté par six pour tous les coachs, y
  // compris ceux qui n'ont rien ciblé. Et l'élève apprendrait qu'il existe
  // d'autres versions de la méthode de son coach.
  for (const goal of DOCTRINE_VARIANT_GOALS) {
    const text = compileDoctrineBlock(marlow(), goal).text;
    for (const token of GOAL_TOKENS) {
      assert(!text.includes(token), `le bloc ${variantKey(goal)} ne doit pas contenir ${token}`);
    }
    assert(!text.toLowerCase().includes("goal_scope"));
  }
});

Deno.test("la fragmentation d'un coach qui cible: mesurée, pas supposée", () => {
  // LE CHIFFRE DU STATUS, et il est meilleur qu'il n'en a l'air.
  //
  // Marlow a ciblé deux croyances et un arbitrage. Ses six variantes tiennent
  // en TROIS blocs distincts, parce que les objectifs qu'aucune portée ne vise
  // retombent exactement sur la default:
  //   default = health = maintenance   (les entrées globales seules)
  //   fat_loss                          (+ la croyance et l'arbitrage ciblés)
  //   recomposition = performance       (+ la croyance portée sur les deux)
  // La fragmentation ne suit donc PAS le nombre d'objectifs, elle suit le
  // nombre de portées DISTINCTES que le coach a réellement écrites.
  const footprint = doctrineCacheFootprint(marlow());
  assertEquals(footprint.variants, GOAL_TOKENS.length + 1);
  assertEquals(footprint.distinctHashes, 3);
  assertEquals(
    compileDoctrineBlock(marlow(), "performance").hash,
    compileDoctrineBlock(marlow(), "recomposition").hash,
    "deux objectifs sous la même portée partagent leur entrée de cache",
  );
  assertEquals(
    compileDoctrineBlock(marlow(), "health").hash,
    compileDoctrineBlock(marlow(), null).hash,
    "un objectif qu'aucune portée ne vise doit RETOMBER sur la default, pas créer une entrée",
  );
});

// ===========================================================================
// §4 — LE VERROU DES INTERDITS RESTE GLOBAL
// ===========================================================================

Deno.test("le verrou des interdits est IDENTIQUE pour TOUTES les variantes", () => {
  // C'est la garantie structurelle de §4, et elle se démontre plutôt qu'elle
  // ne se promet: `findDoctrineViolations` ne prend pas d'objectif, donc
  // aucune variante ne peut se retrouver avec moins de règles qu'une autre.
  // N variantes ne peuvent donc PAS multiplier les occasions de mordre.
  const d = marlow();
  const endorsement = "Try six small meals and cook it in seed oil.";
  const reference = findDoctrineViolations(endorsement, d);
  assertEquals(reference.length, 2);

  for (const goal of DOCTRINE_VARIANT_GOALS) {
    // La variante n'a aucun moyen d'atteindre le verrou: le compilé sert au
    // prompt, la ceinture lit la doctrine PARSÉE. On le vérifie tout de même
    // depuis la variante servie, parce que c'est ce qu'un appelant a en main.
    const compiled = compileDoctrineBlock(d, goal);
    assert(compiled.text.includes("six_small_meals"), "l'interdit est dans TOUTES les variantes");
    assert(compiled.text.includes("seed oil"), "l'aliment déconseillé est dans TOUTES les variantes");
    assertEquals(
      findDoctrineViolations(endorsement, d).map((v) => v.token).sort(),
      reference.map((v) => v.token).sort(),
    );
  }
});

Deno.test("un coach ne PEUT PAS restreindre un interdit à un objectif", () => {
  // Une portée écrite sur un interdit est ignorée, et c'est le comportement
  // voulu: un interdit qui ne vaut que pour certains élèves est une
  // préférence, pas un interdit. Le coach le constate immédiatement — sa règle
  // tient partout — plutôt que le jour où l'agent la casse chez un autre élève.
  const { doctrine } = parseCoachDoctrine({
    ...ROW,
    forbidden: [{ token: "keto", surface_forms: ["cétogène"], goal_scope: ["fat_loss"] }],
  });
  for (const goal of DOCTRINE_VARIANT_GOALS) {
    assert(
      compileDoctrineBlock(doctrine, goal).text.includes("keto"),
      `l'interdit doit être présent sur ${variantKey(goal)}`,
    );
  }
  assertEquals(findDoctrineViolations("Go keto for a month.", doctrine).length, 1);
});

// ===========================================================================
// LA DIRECTION DE L'ÉCHEC — une portée qu'on ne sait pas lire
// ===========================================================================

Deno.test("un objectif inexistant rend l'entrée MUETTE, jamais globale", () => {
  const { doctrine, issues } = parseCoachDoctrine({
    ...ROW,
    beliefs: [{ claim: "Bulk hard.", goal_scope: ["bulking"] }],
    arbitrations: [],
  });
  assert(
    issues.some((i) => i.includes("unknown goal") && i.includes("bulking")),
    `le coach doit LIRE le problème, issues=${JSON.stringify(issues)}`,
  );
  for (const goal of DOCTRINE_VARIANT_GOALS) {
    assert(
      !compileDoctrineBlock(doctrine, goal).text.includes("Bulk hard."),
      `une portée illisible ne doit atteindre personne (fuite sur ${variantKey(goal)})`,
    );
  }
});

Deno.test("une portée malformée (objet, nombre, chaînes vides) n'atteint personne non plus", () => {
  for (const bad of [{ fat_loss: true }, 3, ["", "  "], [null]]) {
    const { doctrine, issues } = parseCoachDoctrine({
      ...ROW,
      beliefs: [{ claim: "Silent claim.", goal_scope: bad }],
      arbitrations: [],
    });
    assert(issues.length > 0, `une portée illisible doit se dire: ${JSON.stringify(bad)}`);
    for (const goal of DOCTRINE_VARIANT_GOALS) {
      assert(
        !compileDoctrineBlock(doctrine, goal).text.includes("Silent claim."),
        `fuite sur ${variantKey(goal)} avec goal_scope=${JSON.stringify(bad)}`,
      );
    }
  }
});

Deno.test("une entrée SANS champ goal_scope est globale — l'absence n'est pas une portée vide illisible", () => {
  const { doctrine, issues } = parseCoachDoctrine({
    ...ROW,
    beliefs: [{ claim: "Everyone's claim." }],
    arbitrations: [],
  });
  assertEquals(issues, []);
  for (const goal of DOCTRINE_VARIANT_GOALS) {
    assert(compileDoctrineBlock(doctrine, goal).text.includes("Everyone's claim."));
  }
});

Deno.test("une portée écrite comme une chaîne seule est lue comme une portée d'un objectif", () => {
  const { doctrine } = parseCoachDoctrine({
    ...ROW,
    beliefs: [{ claim: "String scope.", goal_scope: "fat_loss" }],
    arbitrations: [],
  });
  for (const goal of DOCTRINE_VARIANT_GOALS) {
    assertEquals(
      compileDoctrineBlock(doctrine, goal).text.includes("String scope."),
      goal === "fat_loss",
    );
  }
});

// ===========================================================================
// LE CAS OÙ IL NE RESTE RIEN POUR CET ÉLÈVE
// ===========================================================================

Deno.test("une doctrine entièrement ciblée ailleurs: vide POUR CET OBJECTIF, pas absente", () => {
  // Les deux ne se disent pas pareil, et la différence n'est pas cosmétique:
  // le repli « on n'a pas pu lire la méthode de ton coach » est faux ici, et
  // un prompt qui affirme une cause fausse la fait ressortir mot pour mot.
  const { doctrine } = parseCoachDoctrine({
    coach_id: "c1",
    version: 1,
    content_locale: "en",
    beliefs: [{ claim: "Only for fat loss.", goal_scope: ["fat_loss"] }],
    arbitrations: [],
    forbidden: [],
    vocabulary: [],
    foods: {},
    qa: [],
    voice: {},
  });

  const health = compileDoctrineBlock(doctrine, "health");
  assertEquals(health.isEmpty, true);
  assertEquals(health.emptyForGoal, true);

  const fatLoss = compileDoctrineBlock(doctrine, "fat_loss");
  assertEquals(fatLoss.isEmpty, false);
  assertEquals(fatLoss.emptyForGoal, false);
});

Deno.test("une doctrine RÉELLEMENT vide n'est pas « vide pour cet objectif »", () => {
  const { doctrine } = parseCoachDoctrine({
    coach_id: "c1",
    version: 1,
    content_locale: "en",
    beliefs: [],
    arbitrations: [],
    forbidden: [],
    vocabulary: [],
    foods: {},
    qa: [],
    voice: {},
  });
  for (const goal of DOCTRINE_VARIANT_GOALS) {
    const compiled = compileDoctrineBlock(doctrine, goal);
    assertEquals(compiled.isEmpty, true);
    assertEquals(compiled.emptyForGoal, false, `${variantKey(goal)}: pas de méthode ≠ méthode ailleurs`);
  }
});

// ===========================================================================
// L'IDENTITÉ DE LA VARIANTE — ce qui rend la sélection traçable
// ===========================================================================

Deno.test("le compilé porte la variante qui l'a produit", () => {
  for (const goal of DOCTRINE_VARIANT_GOALS) {
    assertEquals(compileDoctrineBlock(marlow(), goal).goal, goal);
  }
});

Deno.test("variantKey / variantGoal font l'aller-retour, et refusent l'inconnu", () => {
  for (const goal of DOCTRINE_VARIANT_GOALS) {
    assertEquals(variantGoal(variantKey(goal)), goal);
  }
  assertEquals(variantKey(null), "default");
  assertEquals(variantGoal(""), null);
  // R7: un jeton de variante inconnu ne retombe pas silencieusement sur la
  // default — ce serait servir la mauvaise doctrine sans que rien n'échoue.
  assertThrows(() => variantGoal("bulking"));
});

Deno.test("la compilation d'une variante est déterministe", () => {
  for (const goal of DOCTRINE_VARIANT_GOALS) {
    assertEquals(
      compileDoctrineBlock(marlow(), goal).hash,
      compileDoctrineBlock(marlow(), goal).hash,
    );
  }
});

Deno.test("l'ordre des objectifs dans une portée ne change RIEN au bloc servi", () => {
  const a = parseCoachDoctrine({
    ...ROW,
    beliefs: [{ claim: "Both.", goal_scope: ["fat_loss", "health"] }],
  }).doctrine;
  const b = parseCoachDoctrine({
    ...ROW,
    beliefs: [{ claim: "Both.", goal_scope: ["health", "fat_loss"] }],
  }).doctrine;
  for (const goal of DOCTRINE_VARIANT_GOALS) {
    assertEquals(compileDoctrineBlock(a, goal).hash, compileDoctrineBlock(b, goal).hash);
  }
});

// ===========================================================================
// UNE SEULE SÉMANTIQUE DE PORTÉE DANS TOUT LE PRODUIT
// ===========================================================================

Deno.test("la portée de la doctrine et celle du mapping alimentaire décident PAREIL", () => {
  // Deux modules portent une portée par objectif. Le jour où l'un des deux
  // lirait « portée inconnue » comme « pour tout le monde », un coach verrait
  // sa restriction tenir sur ses aliments et fuir sur ses croyances.
  const scopes: readonly (readonly GoalToken[])[] = [
    [],
    ["fat_loss"],
    ["fat_loss", "health"],
    [...GOAL_TOKENS],
  ];
  for (const scope of scopes) {
    for (const goal of DOCTRINE_VARIANT_GOALS) {
      assertEquals(
        ruleAppliesTo(scope, goal),
        goalScopeApplies(scope, goal),
        `désaccord sur scope=${JSON.stringify(scope)} goal=${variantKey(goal)}`,
      );
    }
  }
});
