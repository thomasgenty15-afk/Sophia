// ⟳ LOT `L-1-b` — LA QUANTITÉ ÉCRITE EN CLAIR CESSE D'ÊTRE « AUCUNE QUANTITÉ ».
//
// ══════════════════════════════════════════════════════════════════════════
// ⛔ CE QUE CES ÉPREUVES PROTÈGENT, ET CE N'EST PAS « ÇA MARCHE »
// ══════════════════════════════════════════════════════════════════════════
// Ce lot frôle un refus écrit du dépôt (« ⛔ DÉTERMINISTE, ET AUCUN MATCHER »,
// `meal_generation.ts`). Le refus n'est pas renversé: il vise la lecture
// SÉMANTIQUE de la prose, et ce module ne lit jamais un mot. La frontière n'est
// donc PAS gardée par les cas qui passent — elle est gardée par les cas qui
// DOIVENT ÊTRE REFUSÉS.
//
// ⛔ LA MOITIÉ QUI COMPTE EST `REFUS`. Une garde qui n'a que des cas qui passent
// est une garde à moitié armée: ce dépôt l'a payé six fois cette campagne, et
// AUCUNE de ces six n'a été trouvée par une relecture — toutes par une
// mutation. Si `a handful`, `2 tbsp` ou `1 large onion` se mettent un jour à
// rendre un nombre, ces épreuves rougissent.
//
// ⛔ ET LA DEUXIÈME MOITIÉ EST LE COMPTEUR NÉGATIF. `unquantified_dish_
// ingredients` et `structured_quantity_missing` mesurent l'OBÉISSANCE du modèle
// à FF-038. Réparer la lecture ne doit RIEN leur faire, sinon un modèle qui
// cesse d'obéir devient indiscernable d'un lecteur réparé. La dernière section
// le prouve sur le vrai chemin (`parseGeneratedMeal` → `mealDishesPayload`).

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  persistedQuantitySourceOf,
  QUANTITY_SOURCE_KEY,
  quantityReadCounts,
  quantitySourcePayload,
  readQuantityFromProse,
  weighableQuantityOf,
} from "./quantity_from_prose.ts";
import {
  mealDishesPayload,
  mealPreparationsPayload,
  parseGeneratedMeal,
} from "./meal_generation.ts";
import { foldPreparationsIntoDishes } from "./meal_verdict.ts";

// ---------------------------------------------------------------------------
// ① CE QUI SE LIT — un nombre que le modèle a écrit
// ---------------------------------------------------------------------------

Deno.test("L-1-b ① une masse littérale se lit, ancrée des deux bouts", () => {
  assertEquals(readQuantityFromProse("150 g"), { amount: 150, unit: "g" });
  assertEquals(readQuantityFromProse("80 g"), { amount: 80, unit: "g" });
  // Sans espace, avec espaces en trop, en majuscules: c'est la même écriture du
  // même nombre, jamais un mot de plus.
  assertEquals(readQuantityFromProse("200g"), { amount: 200, unit: "g" });
  assertEquals(readQuantityFromProse("  120   g  "), { amount: 120, unit: "g" });
  assertEquals(readQuantityFromProse("250 G"), { amount: 250, unit: "g" });
});

Deno.test("L-1-b ① un volume littéral se lit, et lui seul", () => {
  assertEquals(readQuantityFromProse("200 ml"), { amount: 200, unit: "ml" });
  assertEquals(readQuantityFromProse("50ml"), { amount: 50, unit: "ml" });
  assertEquals(readQuantityFromProse("30 mL"), { amount: 30, unit: "ml" });
});

Deno.test("L-1-b ① la virgule décimale est une écriture, pas un mot", () => {
  assertEquals(readQuantityFromProse("1,5 g"), { amount: 1.5, unit: "g" });
  assertEquals(readQuantityFromProse("1.5 g"), { amount: 1.5, unit: "g" });
});

Deno.test("L-1-b ② un nombre seul est un DÉNOMBREMENT, pas des grammes", () => {
  // ⛔ `unit: "unit"` et pas `"g"`. « 2 » ne dit pas deux grammes: la masse
  // reste suspendue à `unit_grams` du référentiel (lot `L-1`), et sans lui la
  // pesée s'abstient — ce qui est le bon comportement.
  assertEquals(readQuantityFromProse("1"), { amount: 1, unit: "unit" });
  assertEquals(readQuantityFromProse("2"), { amount: 2, unit: "unit" });
  assertEquals(readQuantityFromProse(" 8 "), { amount: 8, unit: "unit" });
});

Deno.test("L-1-b ③ une fraction seule est de l'arithmétique", () => {
  assertEquals(readQuantityFromProse("1/2"), { amount: 0.5, unit: "unit" });
  assertEquals(readQuantityFromProse("1/4"), { amount: 0.25, unit: "unit" });
  assertEquals(readQuantityFromProse("3 / 4"), { amount: 0.75, unit: "unit" });
});

// ---------------------------------------------------------------------------
// ② ⛔ CE QUI EST REFUSÉ — LA MOITIÉ QUI ARME LA GARDE
// ---------------------------------------------------------------------------

/**
 * ⛔ LA LISTE DE REFUS, ET ELLE EST LE CŒUR DU LOT.
 *
 * Chaque entrée est soit nommée par la fiche `L-1-b`, soit RELEVÉE SUR LE
 * CORPUS le 2026-08-22 avec son nombre d'occurrences. Si l'une d'elles se met à
 * rendre un nombre, l'épreuve rougit — c'est la seule preuve qu'aucun mot n'est
 * lu.
 */
const REFUSEES: readonly (readonly [string, string])[] = [
  // ── nommées par la fiche ────────────────────────────────────────────────
  ["a handful", "article + mot"],
  ["to taste", "aucun nombre"],
  ["une poignée", "article + mot, en français"],
  ["some", "un mot seul"],
  ["1 large onion", "nombre + adjectif + aliment"],
  // ── la poche `tbsp`/`tsp`: ~630 lignes, FERMÉE EXPRÈS (une convention) ──
  ["1 tbsp", "cuillère: une convention, pas une lecture (×256)"],
  ["1 tsp", "cuillère (×241)"],
  ["2 tbsp", "cuillère (×63)"],
  ["3 tbsp", "cuillère (×24)"],
  ["1/2 tsp", "cuillère fractionnée (×28)"],
  ["2 tsp", "cuillère (×13)"],
  // ── les unités COMPTÉES: lire « slices » serait lire un mot (~97 lignes) ─
  ["2 slices", "unité comptée (×76)"],
  ["2 cloves", "unité comptée (×43)"],
  ["4 tranches", "unité comptée, en français (×9)"],
  ["1 slice", "unité comptée (×8)"],
  ["1 wedge", "unité comptée (×9)"],
  // ── les contenants: un bocal n'a pas de masse déclarée ──────────────────
  ["1 can", "contenant (×47)"],
  ["1 tin", "contenant (×19)"],
  ["1 cup", "contenant (×32)"],
  ["1 bowl", "contenant (×9)"],
  ["2 cans", "contenant (×8)"],
  ["1/2 can", "contenant fractionné (×8)"],
  // ── ⛔ LES COMPOSITES: une occasion qui n'en est pas une ────────────────
  ["1 can (400 g)", "composite: la masse est là, la chaîne ne l'est pas"],
  ["75 g dry", "composite: `dry` est un état, et un état ne se devine pas (×10)"],
  ["3/4 cup cooked", "composite (×7)"],
  ["1 tbsp chopped", "composite (×6)"],
  ["1 serving from batch", "composite (×19)"],
  ["1 portion per person", "composite (×11)"],
  ["environ 150 g", "un mot devant le nombre"],
  ["150 g de riz", "un mot derrière l'unité"],
  ["150 g / personne", "un mot derrière l'unité"],
  // ── les portions et les tailles: aucun nombre de masse ───────────────────
  ["1 serving", "portion (×56)"],
  ["1 portion", "portion (×18)"],
  ["1 medium", "taille (×26)"],
  ["1 large", "taille (×21)"],
  ["1 small", "taille (×9)"],
  ["1 small head", "taille + mot (×16)"],
  ["1 bunch", "botte (×26)"],
  ["a small bunch", "article + mot (×22)"],
  ["1 handful", "nombre + mot (×55)"],
  ["2 handfuls", "nombre + mot (×26)"],
  ["2 big handfuls", "nombre + adjectif + mot (×13)"],
  ["a small handful", "article + adjectif + mot (×45)"],
  ["a pinch", "article + mot (×75)"],
  ["pinch", "un mot seul (×16)"],
  ["a few leaves", "aucun nombre (×29)"],
  ["a few sprigs", "aucun nombre (×11)"],
  ["half a lemon", "« half » est un mot (×24)"],
  ["half a lime", "« half » est un mot (×7)"],
  ["share for 3", "un nombre, mais pas une quantité d'aliment (×8)"],
  ["from the batch", "aucun nombre (×8)"],
  ["1 pincée de cannelle", "nombre + mot, en français (×14)"],
  ["à goût", "aucun nombre, en français (×14)"],
  ["small handful", "mot seul (×13)"],
  ["handful", "mot seul (×9)"],
  // ── unités hors du vocabulaire fermé ────────────────────────────────────
  ["2 kg", "hors `COMPOSITION_UNITS` — 2 lignes sur tout le corpus"],
  ["150 mg", "hors vocabulaire fermé"],
  ["1 l", "hors vocabulaire fermé"],
  ["150 grammes", "le mot, pas le symbole"],
  ["150 gr", "abréviation non fermée"],
  // ── les formes dégénérées ───────────────────────────────────────────────
  ["", "vide"],
  ["   ", "blancs seuls"],
  ["g", "une unité sans nombre"],
  ["0", "zéro n'est pas une quantité"],
  ["0 g", "zéro n'est pas une masse"],
  ["0/2", "zéro n'est pas une quantité"],
  ["1/0", "division par zéro"],
  ["1 1/2", "nombre mixte: un espace ne vaut pas une addition"],
  ["-5 g", "un signe n'est pas un chiffre"],
  ["1-2", "un intervalle n'est pas un nombre"],
  ["150 g 200 g", "deux nombres"],
];

Deno.test("L-1-b ⛔ REFUS — aucune de ces chaînes ne rend un nombre", () => {
  const passees: string[] = [];
  for (const [texte, pourquoi] of REFUSEES) {
    const lu = readQuantityFromProse(texte);
    if (lu !== null) passees.push(`${JSON.stringify(texte)} (${pourquoi}) → ${JSON.stringify(lu)}`);
  }
  assertEquals(
    passees,
    [],
    `⛔ le lecteur a lu un mot: ${passees.length} chaîne(s) refusée(s) rendent un nombre`,
  );
});

Deno.test("L-1-b ⛔ REFUS — la liste ne se vide pas en silence", () => {
  // ⚠️ SANS CETTE ÉPREUVE, VIDER `REFUSEES` RENDRAIT LA GARDE VERTE. Le patron
  // est celui de `V0-E′-bis`: un test qui itère une liste passe trivialement
  // quand la liste est vide, et c'est précisément la forme d'un lot désarmé qui
  // ressemble à un lot qui marche.
  assert(REFUSEES.length >= 60, `la liste de refus est tombée à ${REFUSEES.length}`);
  const nommees = ["a handful", "to taste", "une poignée", "some", "1 large onion"];
  for (const n of nommees) {
    assert(REFUSEES.some(([t]) => t === n), `la fiche nomme ${n}, la liste ne le porte plus`);
  }
});

Deno.test("L-1-b ⛔ REFUS — une entrée non textuelle ne lève pas et ne lit rien", () => {
  assertEquals(readQuantityFromProse(null), null);
  assertEquals(readQuantityFromProse(undefined), null);
  assertEquals(readQuantityFromProse(150), null);
  assertEquals(readQuantityFromProse({ amount: 150 }), null);
  assertEquals(readQuantityFromProse(["150 g"]), null);
});

// ---------------------------------------------------------------------------
// ③ L'ARBITRAGE — le structuré gagne TOUJOURS
// ---------------------------------------------------------------------------

Deno.test("L-1-b le structuré gagne, et la prose n'est même pas lue", () => {
  assertEquals(
    weighableQuantityOf({ amount: 200, unit: "g", quantity: "1 bowl" }),
    { amount: 200, unit: "g", source: "structured" },
  );
  // Même quand la prose dirait autre chose de lisible: on ne relit pas une
  // déclaration qui tient debout.
  assertEquals(
    weighableQuantityOf({ amount: 2, unit: "unit", quantity: "150 g" }),
    { amount: 2, unit: "unit", source: "structured" },
  );
});

Deno.test("L-1-b la prose ne sert QUE lorsque la paire structurée est inutilisable", () => {
  assertEquals(
    weighableQuantityOf({ amount: null, unit: null, quantity: "150 g" }),
    { amount: 150, unit: "g", source: "prose" },
  );
  // `amount` sans `unit` est inutilisable pour `gramsRawOf`: la prose reprend.
  assertEquals(
    weighableQuantityOf({ amount: 150, unit: null, quantity: "150 g" }),
    { amount: 150, unit: "g", source: "prose" },
  );
  // `unit` sans `amount`, idem.
  assertEquals(
    weighableQuantityOf({ amount: null, unit: "g", quantity: "3" }),
    { amount: 3, unit: "unit", source: "prose" },
  );
});

Deno.test("L-1-b ⛔ trois provenances et pas deux — `null` n'est pas `prose`", () => {
  // Le zéro ambigu de ce dépôt est là: « personne n'a écrit » et « on n'a pas
  // su lire » appellent deux corrections opposées.
  assertEquals(
    weighableQuantityOf({ amount: null, unit: null, quantity: "a handful" }),
    { amount: null, unit: null, source: null },
  );
  assertEquals(
    weighableQuantityOf({ amount: null, unit: null, quantity: null }),
    { amount: null, unit: null, source: null },
  );
  assertEquals(
    weighableQuantityOf({ amount: 0, unit: "g", quantity: "to taste" }),
    { amount: null, unit: null, source: null },
  );
});

// ---------------------------------------------------------------------------
// ④ LA CLÉ ET SES DEUX POPULATIONS
// ---------------------------------------------------------------------------

Deno.test("L-1-b la clé de provenance n'a qu'un site d'écriture", () => {
  assertEquals(QUANTITY_SOURCE_KEY, "quantity_source");
  assertEquals(quantitySourcePayload("prose"), { quantity_source: "prose" });
  // ⚠️ ÉCRITE MÊME À `null`: une clé absente ne se distingue pas d'un lot
  // débranché.
  assertEquals(quantitySourcePayload(null), { quantity_source: null });
  assert(QUANTITY_SOURCE_KEY in quantitySourcePayload(null));
});

Deno.test("L-1-b la provenance persistée est relue contre la liste fermée", () => {
  assertEquals(persistedQuantitySourceOf({ quantity_source: "prose" }), "prose");
  assertEquals(persistedQuantitySourceOf({ quantity_source: "structured" }), "structured");
  assertEquals(persistedQuantitySourceOf({ quantity_source: "devine" }), null);
  assertEquals(persistedQuantitySourceOf({ quantity_source: null }), null);
  assertEquals(persistedQuantitySourceOf({}), null);
  assertEquals(persistedQuantitySourceOf(null), null);
});

Deno.test("L-1-b ⛔ les deux populations ne se fondent jamais", () => {
  const counts = quantityReadCounts({
    dishes: [
      {
        ingredients: [
          { term: "rice", quantity_source: "structured" },
          { term: "olive oil", quantity_source: "prose" },
          { term: "salt", quantity_source: null },
        ],
      },
    ],
    preparations: [
      { ingredients: [{ term: "chicken", quantity_source: "prose" }] },
    ],
  });
  assertEquals(counts, {
    ecrit_structure: 1,
    recupere_en_prose: 2,
    illisible: 1,
    lines: 4,
  });
  // ⛔ Le dénominateur n'est pas décoratif: `recupere_en_prose: 0` sur un plan
  // vide et sur un plan de 200 lignes seraient le même nombre sans lui.
  assertEquals(counts.ecrit_structure + counts.recupere_en_prose + counts.illisible, counts.lines);
});

Deno.test("L-1-b ⛔ les préparations comptent autant que les plats", () => {
  // 32 % des lignes d'ingrédient de la base vivent dans les préparations
  // (3 202 sur 10 053). Un compteur qui les oublie sous-compte d'un tiers.
  const sansPrep = quantityReadCounts({
    dishes: [{ ingredients: [{ quantity_source: "prose" }] }],
    preparations: [],
  });
  const avecPrep = quantityReadCounts({
    dishes: [{ ingredients: [{ quantity_source: "prose" }] }],
    preparations: [{ ingredients: [{ quantity_source: "prose" }, { quantity_source: null }] }],
  });
  assertEquals(sansPrep.lines, 1);
  assertEquals(avecPrep.lines, 3);
  assertEquals(avecPrep.recupere_en_prose, 2);
});

Deno.test("L-1-b le compteur ne lève jamais sur une forme inattendue", () => {
  assertEquals(
    quantityReadCounts({ dishes: [null, 3, { ingredients: "nope" }], preparations: [undefined] }),
    { ecrit_structure: 0, recupere_en_prose: 0, illisible: 0, lines: 0 },
  );
});

// ---------------------------------------------------------------------------
// ⑤ ⛔ LE PRORATA — la prose se lit AVANT le pliage, jamais après
// ---------------------------------------------------------------------------

Deno.test("L-1-b ⛔ la prose d'une préparation passe PAR le prorata, pas à côté", () => {
  // ⛔ LE PIÈGE QUE CETTE ÉPREUVE FERME, ET IL EST GROS. Un lot de poulet fait
  // pour 4 dîners, dont la masse n'est écrite qu'en prose: si la prose était
  // relue APRÈS le pliage, chacun des 4 plats compterait 600 g au lieu de 150.
  // ×4, et toujours dans le sens qui gonfle — la cicatrice « un facteur ne
  // porte que sur la part mobile », à l'endroit où elle mord.
  const folded = foldPreparationsIntoDishes({
    dishes: [
      { slot: null, method: "", ingredients: [], uses: [{ preparationId: "p1", servings: 1 }] },
    ],
    preparations: [
      { id: "p1", servingsMade: 4, ingredients: [{ term: "chicken breast", quantity: "600 g" }] },
    ],
  });
  const ligne = folded[0].ingredients[0];
  assertEquals(ligne.amount, 150);
  assertEquals(ligne.unit, "g");
  // ⛔ LA PROSE EST CONSOMMÉE. Si elle survivait au pliage, un lecteur aval la
  // relirait et poserait 600 g par-dessus les 150.
  assertEquals(ligne.quantity, null);
  // ⛔ ET LA PROVENANCE SURVIT, sinon les deux populations se fondent au pliage.
  assertEquals(ligne.quantitySource, "prose");
});

Deno.test("L-1-b le pliage ne touche pas une quantité structurée", () => {
  const folded = foldPreparationsIntoDishes({
    dishes: [
      { slot: null, method: "", ingredients: [], uses: [{ preparationId: "p1", servings: 2 }] },
    ],
    preparations: [
      {
        id: "p1",
        servingsMade: 4,
        ingredients: [
          { term: "rice", amount: 400, unit: "g", state: "raw", quantity: "400 g" },
          // Rien de lisible d'aucun côté: `null` reste `null` au passage du
          // prorata (règle R2 — un 0 traverse toutes les additions sans rien dire).
          { term: "salt", quantity: "to taste" },
        ],
      },
    ],
  });
  assertEquals(folded[0].ingredients[0].amount, 200);
  assertEquals(folded[0].ingredients[0].quantitySource, "structured");
  assertEquals(folded[0].ingredients[1].amount, null);
  assertEquals(folded[0].ingredients[1].quantitySource, null);
});

// ---------------------------------------------------------------------------
// ⑥ ⛔ LE COMPTEUR NÉGATIF — sur le VRAI chemin d'écriture
// ---------------------------------------------------------------------------

function planAvecUneLigneEnProse() {
  return parseGeneratedMeal(
    {
      dishes: [
        {
          title: "Rice bowl",
          slot: "dinner",
          day: "2026-08-22",
          method: "boil",
          why: "protein",
          ingredients: [
            // ⛔ LA LIGNE DU LOT: le modèle a écrit la copie en prose et PAS la
            // copie structurée. C'est 3 833 lignes sur 3 850 dans la base.
            { term: "chicken breast", quantity: "150 g", state: "raw" },
            // La ligne obéissante, pour que le compteur ait ses deux populations.
            { term: "olive oil", quantity: "10 g", amount: 10, unit: "g", state: "raw" },
            // La ligne que rien ne rattrape.
            { term: "salt", quantity: "to taste" },
          ],
        },
      ],
      preparations: [],
      cooking_sessions: [],
      shopping_list: [],
    },
    {
      doctrine: null,
      safetyConstraints: [],
      mode: "to_shop",
      scope: "day",
      pantry: [],
      beliefKeys: [],
      eatingRhythm: [],
      daysToFill: ["mon"],
      awayDays: [],
      cookingTimeMin: null,
      // ⚠️ `composition: null` — SANS RÉFÉRENTIEL, ET C'EST VOULU. Ce qu'on
      // teste ici est la PROVENANCE et les COMPTEURS, pas la pesée: `gramsRaw`
      // reste `null` faute d'index, et la ligne récupérée doit quand même
      // porter `quantity_source: "prose"`. Un test qui aurait besoin d'un
      // référentiel pour voir la provenance mesurerait deux choses à la fois.
      composition: null,
      fixedIntakes: [],
      dayProperties: [],
      merge: null,
      boxMemberIds: [],
      weighedMemberIds: [],
      boxMemberDiets: [],
    },
  );
}

Deno.test("L-1-b ⛔ `unquantified_dish_ingredients` CONTINUE de compter la prose", () => {
  const meal = planAvecUneLigneEnProse();
  // ⛔ 2 sur 3, exactement comme AVANT le lot. Ce compteur mesure l'obéissance
  // du modèle à FF-038 (`== SAY THE SAME QUANTITY TWICE ==`); le réparer côté
  // lecture ferait croire que le modèle s'est amélioré, et rendrait un modèle
  // qui cesse d'obéir indiscernable d'une lecture réparée.
  assertEquals(meal.unquantified_dish_ingredients, { ingredients: 3, unquantified: 2 });
});

Deno.test("L-1-b ⛔ la base garde la DÉCLARATION, jamais la lecture", () => {
  const meal = planAvecUneLigneEnProse();
  const lignes = mealDishesPayload(meal)[0].ingredients as Record<string, unknown>[];
  // ⛔ `amount is null` reste vrai sur la ligne récupérée: la mesure SQL qui a
  // ouvert ce lot (3 850 lignes) doit rester reproductible pour toujours.
  assertEquals(lignes[0].amount, null);
  assertEquals(lignes[0].unit, null);
  assertEquals(lignes[1].amount, 10);
  // ⛔ Et la provenance dit ce qui s'est passé, sur la ligne elle-même.
  assertEquals(lignes[0][QUANTITY_SOURCE_KEY], "prose");
  assertEquals(lignes[1][QUANTITY_SOURCE_KEY], "structured");
  assertEquals(lignes[2][QUANTITY_SOURCE_KEY], null);
});

Deno.test("L-1-b les deux populations se comptent sur la charge écrite", () => {
  const meal = planAvecUneLigneEnProse();
  const counts = quantityReadCounts({
    dishes: mealDishesPayload(meal),
    preparations: mealPreparationsPayload(meal),
  });
  assertEquals(counts, {
    ecrit_structure: 1,
    recupere_en_prose: 1,
    illisible: 1,
    lines: 3,
  });
});
