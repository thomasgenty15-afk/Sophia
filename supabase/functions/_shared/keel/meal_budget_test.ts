// KEEL — LE BUDGET D'UN PLAN, DEPUIS LA COLONNE JUSQU'À LA CONSIGNE.
//
// ── CE QUE CES CEINTURES PROTÈGENT, ET POURQUOI ELLES SONT NÉES ────────────
// Le budget a vécu deux ans sous la forme d'un ADJECTIF: `budget_band`, « tight
// / normal / comfortable ». Trois mots saisis une fois dans « À propos de toi »
// puis appliqués en silence à toutes les semaines suivantes, et qui partaient au
// modèle tels quels.
//
// Le mot ne dit rien. « Serré » pour une personne seule et « serré » pour une
// table de cinq ne désignent ni la même somme ni le même arbitrage — or c'est
// l'arbitrage qui est demandé: quand il n'y a pas d'argent, on ne « fait pas
// attention », on renonce à la viande.
//
// Trois choses se cassent séparément, donc s'éprouvent séparément:
//
//   1. LA LECTURE. `Number(null)` vaut 0 et EST fini. Une garde `!= null` sur la
//      valeur brute laisse « budget: 0 » descendre dans le prompt comme une
//      consigne — le dépôt a déjà payé exactement ce piège sur une taille
//      pré-remplie à 0 pour un compte neuf.
//
//   2. LA PRÉSENCE DE LA LIGNE. `budgetBand` était une propriété OPTIONNELLE de
//      l'objet d'arguments: un appelant pouvait l'oublier sans que rien
//      n'échoue, et la consigne disparaissait en silence. C'est la cicatrice
//      `safetyBand` du dépôt. La propriété est désormais REQUISE et sa valeur
//      nullable: l'absence doit être écrite.
//
//   3. CE QU'ON SACRIFIE. « Reste dans le budget » seul laisse le modèle rogner
//      sur les PORTIONS — c'est-à-dire sur la seule chose que le reste du prompt
//      calcule à partir des corps et des directions. L'ordre des renoncements
//      est donc dans la consigne, et l'interdit sur les portions avec lui.

import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { BUDGET_MAX, buildMealPrompt, usableBudget } from "./meal_generation.ts";

function mealArgs(budgetAmount: number | null) {
  return {
    firstDayCookable: true,
    goal: "health",
    situation: null,
    context: null,
    slot: null,
    servings: 4,
    safetyConstraints: null,
    body: null,
    focusAxis: null,
    dietBlock: "",
    doctrineBlock: "d",
    coachNoteBlock: null,
    fixedIntakes: [],
    dayProperties: [],
    merge: null,
    protocolBlock: "",
    beliefKeys: [],
    mode: "to_shop" as const,
    scope: "several_days" as const,
    daysToFill: [],
    eatingRhythm: undefined,
    cookDays: [],
    cookingTimeMin: null,
    recipeDifficulty: null,
    variety: null,
    budgetAmount,
    servingsPerMeal: null,
    dietaryRegime: null,
    seasonCountry: "FR",
    seasonMonth: null,
    dislikes: [],
    foodPreferences: [],
    pantry: [],
    awayDays: [],
    weekStart: "2026-08-10",
    weekEnd: "2026-08-16",
    contentLocale: "fr-FR",
  };
}

// ---------------------------------------------------------------------------
// 1. La lecture de la colonne
// ---------------------------------------------------------------------------

Deno.test("usableBudget rend le montant quand il est utilisable", () => {
  assertEquals(usableBudget(90), 90);
  assertEquals(usableBudget("90"), 90);
  assertEquals(usableBudget(90.5), 90.5);
  assertEquals(usableBudget(BUDGET_MAX), BUDGET_MAX);
});

Deno.test("usableBudget refuse tout ce qui RESSEMBLE à une réponse", () => {
  // Les trois formes de l'absence. `Number(null)` et `Number("")` valent 0 et
  // sont FINIS: c'est la ligne exacte que ce test garde.
  assertEquals(usableBudget(null), null);
  assertEquals(usableBudget(undefined), null);
  assertEquals(usableBudget(""), null);
  // Zéro n'est un budget pour personne, et négatif encore moins.
  assertEquals(usableBudget(0), null);
  assertEquals(usableBudget(-10), null);
  // Le zéro de trop: « 5000 » tapé pour « 500 ». Il ne produirait pas une
  // erreur mais un plan au homard.
  assertEquals(usableBudget(BUDGET_MAX + 1), null);
  // Illisible.
  assertEquals(usableBudget("beaucoup"), null);
  assertEquals(usableBudget(Number.NaN), null);
  assertEquals(usableBudget(Number.POSITIVE_INFINITY), null);
});

// ---------------------------------------------------------------------------
// 2. La consigne, et ce qu'elle interdit
// ---------------------------------------------------------------------------

Deno.test("le prompt porte le MONTANT, pas un adjectif", () => {
  const prompt = buildMealPrompt(mealArgs(120));
  const text = JSON.stringify(prompt);
  assertStringIncludes(text, "budget for this plan: 120");
  // La monnaie n'est PAS nommée: `country` est déjà dans ce prompt, et une
  // table pays → devise tenue de notre côté serait une liste fermée qui
  // refuserait un pays légitime le jour où quelqu'un s'y inscrit.
  assertStringIncludes(text, "in the local currency of");
  // Les trois adjectifs de l'ancienne bande n'ont plus rien à faire ici.
  for (const band of ["budget: tight", "budget: normal", "budget: comfortable"]) {
    assert(!text.includes(band), `l'ancienne bande survit dans le prompt: ${band}`);
  }
});

Deno.test("la consigne dit QUOI SACRIFIER, et dans quel ordre", () => {
  const text = JSON.stringify(buildMealPrompt(mealArgs(60)));
  // L'ordre des renoncements, du moins douloureux au plus.
  const proteins = text.indexOf("expensive proteins first");
  const produce = text.indexOf("out-of-season and imported produce");
  const variety = text.indexOf("then variety");
  assert(proteins > 0, "l'ordre des renoncements a disparu de la consigne");
  assert(proteins < produce, "les protéines doivent tomber AVANT les légumes");
  assert(produce < variety, "la variété est le DERNIER sacrifice, pas le premier");
  // ET L'INTERDIT QUI COMPTE LE PLUS. Sans lui, la façon la plus simple de
  // tenir un budget est de servir moins — donc de défaire le calcul de parts
  // que tout le reste de ce prompt construit à partir des corps.
  assertStringIncludes(text, "NEVER cut the portions themselves");
});

Deno.test("aucune ligne de budget quand il n'y en a pas — et pas un mot de plus", () => {
  const text = JSON.stringify(buildMealPrompt(mealArgs(null)));
  assert(
    !text.includes("budget for this plan"),
    "un plan sans budget déclaré ne doit porter AUCUNE consigne de budget",
  );
  assert(
    !text.includes("NEVER cut the portions"),
    "l'interdit de rogner les portions n'a pas de sens sans budget: il ferait " +
      "croire à une contrainte que personne n'a posée",
  );
});
