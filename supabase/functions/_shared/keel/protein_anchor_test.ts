// FF-037 — L'ANCRE PROTÉIQUE. Ce que ces tests protègent, dans l'ordre de ce
// qui coûte le plus cher quand ça casse:
//
//   * le FAUX POSITIF du lexique — un plat qui porte une ancre et qu'on
//     signale quand même. Il coûte une génération complète, à chaque fois, et
//     il pourrit l'issue au point que personne ne la lise plus;
//   * la GARDE À MOITIÉ ARMÉE — un lexique qui ne mord qu'en anglais. Ce dépôt
//     a déjà payé « `not` ne couvre pas `doesn't` », et le test qui
//     l'épinglait n'existait qu'en français;
//   * le PLAT PERDU — un constat de composition qui vide une assiette. Seul le
//     verrou de sécurité a ce pouvoir;
//   * le CHIFFRE — une consigne ou une relance qui parle en grammes de
//     nutriment, que le modèle échoue ensuite dans un `why` visible.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  detectProteinAnchor,
  isMainMealSlot,
  MAIN_MEAL_SLOTS,
  PROTEIN_ANCHOR_PROMPT_LINE,
  proteinAnchorRetryInstruction,
  proteinGroupOf,
} from "./protein_anchor.ts";
import { FOOD_GROUP_REFS, PROTEIN_SOURCES } from "./tokens.ts";
import { findNumericTarget } from "./week_plan_generation.ts";
import { MEAL_SYSTEM_PROMPT, parseGeneratedMeal } from "./meal_generation.ts";

// ---------------------------------------------------------------------------
// LE VOCABULAIRE — un sous-ensemble, pas une seconde taxonomie
// ---------------------------------------------------------------------------

Deno.test("PROTEIN_SOURCES est un sous-ensemble strict des trente groupes", () => {
  for (const group of PROTEIN_SOURCES) {
    assert(
      (FOOD_GROUP_REFS as readonly string[]).includes(group),
      `${group} n'est pas un food_group_ref`,
    );
  }
  assert(PROTEIN_SOURCES.length > 0);
  assert(PROTEIN_SOURCES.length < FOOD_GROUP_REFS.length);
});

Deno.test("le fromage et les fruits à coque sont EXCLUS — arbitrage FF-037 §9", () => {
  // Une pincée de parmesan n'est pas une ancre. L'inclure rendrait la garantie
  // vraie pour presque tous les plats, c'est-à-dire vide. La révision passe par
  // le calcul en grammes de FF-039, pas par une intuition — donc ce test doit
  // tomber si quelqu'un les rajoute sans passer par là.
  assert(!(PROTEIN_SOURCES as readonly string[]).includes("dairy_cheese"));
  assert(!(PROTEIN_SOURCES as readonly string[]).includes("nuts_seeds"));
  assertEquals(proteinGroupOf("parmesan"), null);
  assertEquals(proteinGroupOf("almonds"), null);
  assertEquals(proteinGroupOf("peanut butter"), null);
});

// ---------------------------------------------------------------------------
// LES DEUX LANGUES — la cicatrice `not` / `doesn't`, appliquée d'avance
// ---------------------------------------------------------------------------

Deno.test("l'ancre se reconnaît en ANGLAIS", () => {
  assertEquals(proteinGroupOf("chicken thighs"), "poultry");
  assertEquals(proteinGroupOf("salmon fillet"), "fatty_fish");
  assertEquals(proteinGroupOf("tinned tuna"), "white_fish");
  assertEquals(proteinGroupOf("eggs"), "eggs");
  assertEquals(proteinGroupOf("kidney beans"), "legumes");
  assertEquals(proteinGroupOf("greek yogurt"), "dairy_yogurt");
  assertEquals(proteinGroupOf("firm tofu"), "tofu_tempeh");
  assertEquals(proteinGroupOf("beef mince"), "red_meat");
  assertEquals(proteinGroupOf("king prawns"), "shellfish");
  assertEquals(proteinGroupOf("cottage cheese"), "dairy_yogurt");
});

Deno.test("l'ancre se reconnaît en FRANÇAIS, accents et ligature compris", () => {
  assertEquals(proteinGroupOf("cuisses de poulet"), "poultry");
  assertEquals(proteinGroupOf("filet de saumon"), "fatty_fish");
  assertEquals(proteinGroupOf("thon en boîte"), "white_fish");
  assertEquals(proteinGroupOf("oeufs"), "eggs");
  // La ligature: `normalizeForMatch` décompose en NFD et retire les
  // diacritiques, mais `œ` (U+0153) n'est PAS une lettre accentuée. Les deux
  // orthographes sont écrites dans le lexique, et c'est ce test qui le tient.
  assertEquals(proteinGroupOf("œufs"), "eggs");
  assertEquals(proteinGroupOf("haricots rouges"), "legumes");
  assertEquals(proteinGroupOf("pois chiches"), "legumes");
  assertEquals(proteinGroupOf("yaourt grec"), "dairy_yogurt");
  assertEquals(proteinGroupOf("fromage blanc"), "dairy_yogurt");
  assertEquals(proteinGroupOf("boeuf haché"), "red_meat");
  assertEquals(proteinGroupOf("bœuf haché"), "red_meat");
  assertEquals(proteinGroupOf("crevettes"), "shellfish");
});

// ---------------------------------------------------------------------------
// LES FAUX AMIS — les mots qui portent une protéine et pas l'aliment
// ---------------------------------------------------------------------------

Deno.test("« green beans » n'est pas une légumineuse", () => {
  // 17 occurrences dans les plats déjà en base. Le lexique n'a donc PAS
  // « beans » nu, et ce test est ce qui empêche quelqu'un de l'ajouter « pour
  // couvrir plus de cas ».
  assertEquals(proteinGroupOf("green beans"), null);
  assertEquals(proteinGroupOf("haricots verts"), null);
});

Deno.test("un bouillon, un fond et des nouilles aux œufs ne sont pas des ancres", () => {
  // « egg noodles » apparaît cinq fois dans les plats déjà générés: sans la
  // liste de disqualification, le plat qui avait le plus besoin de la consigne
  // serait exactement celui qui y échapperait.
  assertEquals(proteinGroupOf("chicken stock"), null);
  assertEquals(proteinGroupOf("beef broth"), null);
  assertEquals(proteinGroupOf("egg noodles"), null);
  assertEquals(proteinGroupOf("fish sauce"), null);
  assertEquals(proteinGroupOf("bouillon de volaille"), null);
  assertEquals(proteinGroupOf("fond de veau"), null);
  // …et la disqualification ne déborde pas: le poulet reste du poulet.
  assertEquals(proteinGroupOf("chicken thigh"), "poultry");
});

Deno.test("un terme vide ou purement végétal ne rend rien", () => {
  assertEquals(proteinGroupOf(""), null);
  assertEquals(proteinGroupOf("   "), null);
  assertEquals(proteinGroupOf("courgette"), null);
  assertEquals(proteinGroupOf("olive oil"), null);
  assertEquals(proteinGroupOf("rolled oats"), null);
});

// ---------------------------------------------------------------------------
// LES CRÉNEAUX
// ---------------------------------------------------------------------------

Deno.test("seuls les trois repas sont des repas principaux", () => {
  assertEquals([...MAIN_MEAL_SLOTS], ["breakfast", "lunch", "dinner"]);
  assert(isMainMealSlot("breakfast"));
  assert(isMainMealSlot("lunch"));
  assert(isMainMealSlot("dinner"));
  assert(!isMainMealSlot("snack_am"));
  assert(!isMainMealSlot("snack_pm"));
  assert(!isMainMealSlot("before_bed"));
  assert(!isMainMealSlot("snack"));
  // Un créneau absent ne peut pas être PROUVÉ principal: le pénaliser
  // inventerait un fait, et un fait inventé au parseur devient une relance
  // facturée.
  assert(!isMainMealSlot(null));
});

// ---------------------------------------------------------------------------
// AUCUN CHIFFRE — ni dans la consigne, ni dans la relance
// ---------------------------------------------------------------------------

Deno.test("la consigne et la relance ne portent AUCUN chiffre de nutrition", () => {
  const retry = proteinAnchorRetryInstruction(["Pasta with tomatoes"]);
  for (const [name, text] of [
    ["consigne", PROTEIN_ANCHOR_PROMPT_LINE],
    ["relance", retry],
  ] as const) {
    assertEquals(findNumericTarget(text), null, `${name} mord sur le filtre`);
    assertEquals(
      text.match(/\d/),
      null,
      `${name} contient un chiffre: ${text}`,
    );
  }
});

Deno.test("la consigne est réellement dans le prompt système", () => {
  // Une constante exportée que personne n'injecte est une consigne qui
  // n'existe pas — la classe de défaut la plus fréquente de ce dépôt.
  assert(MEAL_SYSTEM_PROMPT.includes(PROTEIN_ANCHOR_PROMPT_LINE));
});

Deno.test("la relance NOMME les plats, et dédoublonne", () => {
  const retry = proteinAnchorRetryInstruction([
    "Pasta with tomatoes",
    "Pasta with tomatoes",
    "  ",
    "Vegetable soup",
  ]);
  assert(retry.includes('"Pasta with tomatoes"'));
  assert(retry.includes('"Vegetable soup"'));
  assertEquals(retry.split("Pasta with tomatoes").length - 1, 1);
});

// ---------------------------------------------------------------------------
// LE DÉTECTEUR SUR UNE LISTE
// ---------------------------------------------------------------------------

Deno.test("un seul ingrédient protéique suffit, où qu'il soit dans la liste", () => {
  assert(detectProteinAnchor([
    { term: "olive oil" },
    { term: "onion" },
    { term: "chicken breast" },
  ]));
  assert(!detectProteinAnchor([{ term: "olive oil" }, { term: "onion" }]));
  assert(!detectProteinAnchor([]));
});

// ---------------------------------------------------------------------------
// DE BOUT EN BOUT, DANS LE PARSEUR
// ---------------------------------------------------------------------------

const DOCTRINE = { forbidden: [], foods: { recommended: [], discouraged: [] } };

function parse(payload: Record<string, unknown>, over: Record<string, unknown> = {}) {
  return parseGeneratedMeal(payload, {
    doctrine: DOCTRINE,
    safetyConstraints: [],
    mode: "to_shop",
    scope: "day",
    pantry: [],
    beliefKeys: [],
    eatingRhythm: [],
    daysToFill: ["mon"],
    awayDays: [],
    cookingTimeMin: null,
    // FF-038: REQUIS. `null` = pas de référentiel, donc pas de grammes —
    // et les trois champs structurés sont quand même lus. Les cas qui
    // testent le recalcul passent un index.
    composition: null,
    fixedIntakes: [],
    dayProperties: [],
    merge: null,
    ...over,
  });
}

function dish(over: Record<string, unknown> = {}) {
  return {
    title: "Chicken and rice bowl",
    slot: "dinner",
    day: "mon",
    ingredients: [{ term: "chicken thighs", quantity: "150 g" }, { term: "rice", quantity: "60 g" }],
    method: "Roast the thighs, boil the rice, put them in a bowl.",
    why: "It is quick on the evening you said is short.",
    honours_belief_keys: [],
    ...over,
  };
}

Deno.test("un dîner sans ancre porte l'issue ET reste dans l'assiette", () => {
  const meal = parse({
    dishes: [dish({
      title: "Pasta with tomatoes",
      ingredients: [{ term: "pasta", quantity: "100 g" }, { term: "tomatoes", quantity: "3" }],
    })],
    shopping_list: [],
  });
  // PASS-WITH-ISSUE: le plat est là.
  assertEquals(meal.dishes.length, 1);
  assertEquals(meal.dishes[0].title, "Pasta with tomatoes");
  assertEquals(meal.protein_anchor_missing, ["Pasta with tomatoes"]);
  assert(meal.issues.some((i) => i.includes("protein_source_missing")));
});

Deno.test("une collation sans protéine n'est JAMAIS pénalisée", () => {
  const meal = parse({
    dishes: [dish({
      title: "An apple",
      slot: "snack_pm",
      ingredients: [{ term: "apple", quantity: "1" }],
    })],
    shopping_list: [],
  });
  assertEquals(meal.protein_anchor_missing, []);
  assertEquals(meal.issues.filter((i) => i.includes("protein_source_missing")), []);
});

Deno.test("un plat qui PUISE dans une préparation hérite de son ancre", () => {
  // Le prompt système demande explicitement qu'un plat de lot NE RÉPÈTE PAS sa
  // recette. Ne regarder que `dish.ingredients` ferait donc signaler tous les
  // plats de batch — c'est-à-dire l'architecture qu'on a demandée.
  const meal = parse({
    preparations: [{
      id: "prep_chicken",
      title: "Roast chicken thighs",
      servings_made: 4,
      ingredients: [{ term: "chicken thighs", quantity: "1.2 kg" }],
      method: "Roast them.",
      active_minutes: 10,
      total_minutes: 50,
      cook_on: "mon",
    }],
    dishes: [dish({
      title: "Chicken wrap",
      ingredients: [{ term: "wholemeal wrap", quantity: "1" }, { term: "salad leaves", quantity: "a handful" }],
      uses: [{ preparation_id: "prep_chicken", servings: 1 }],
    })],
    shopping_list: [],
  });
  assertEquals(meal.protein_anchor_missing, []);
});

Deno.test("condition de désarmement: un plan entièrement ancré ne déclenche RIEN", () => {
  // ── LE RÉFÉRENTIEL DU DÉSARMEMENT EST LA VERSION COURANTE DU PRODUIT ────
  // Pas les octets d'avant le chantier. FF-038 a ajouté ses propres constats
  // (quantités structurées absentes, référentiel indisponible) et ils
  // s'appliquent à TOUT LE MONDE, versionnés par `MEAL_PROMPT_VERSION`. Ce que
  // ce test tient, c'est que l'ANCRE PROTÉIQUE, elle, n'ajoute rien quand elle
  // est satisfaite — et le filtre nommé est ce qui empêche le test de devenir
  // vert par accident au prochain constat ajouté ailleurs.
  const meal = parse({ dishes: [dish()], shopping_list: [] });
  assertEquals(meal.protein_anchor_missing, []);
  assertEquals(meal.issues.filter((i) => i.includes("protein_source_missing")), []);
  assertEquals(meal.rejected_numeric, []);
  assertEquals(meal.dishes.length, 1);
});

Deno.test("le plancher TCA ne change RIEN — indiscernabilité par égalité de chaînes", () => {
  // L'ancre est côté ALIMENT (présence), pas côté personne (quantité). Le
  // plancher retire ce qui SE VISE; « ce plat porte du poisson » ne se vise
  // pas. Il n'existe donc aucune branche à emprunter — et ce test est là pour
  // que personne n'en ajoute une, parce qu'une branche spéciale est un endroit
  // où le statut de l'élève devient observable dans la sortie.
  //
  // Le parseur ne prend aucun `restrictionFlag`, ce qui EST la garantie: la
  // preuve se fait donc sur l'objet complet, pour deux appels identiques dont
  // rien ne distingue l'élève.
  const payload = {
    dishes: [dish({
      title: "Vegetable soup",
      ingredients: [{ term: "carrots", quantity: "300 g" }, { term: "leeks", quantity: "2" }],
    })],
    shopping_list: [],
  };
  const flagged = parse(structuredClone(payload));
  const notFlagged = parse(structuredClone(payload));
  assertEquals(JSON.stringify(flagged), JSON.stringify(notFlagged));
  assertEquals(flagged.protein_anchor_missing, ["Vegetable soup"]);
});

Deno.test("un verrou de sortie qui mord vide aussi le constat d'ancre", () => {
  // Relancer pour une ancre alors que la semaine entière vient d'être vidée
  // par un allergène ferait réparer la mauvaise chose — et à la deuxième
  // sortie sale on aurait dépensé deux générations pour rien.
  const meal = parse({
    dishes: [dish({
      title: "Peanut noodles",
      ingredients: [{ term: "noodles", quantity: "100 g" }, { term: "peanuts", quantity: "30 g" }],
    })],
    shopping_list: [],
  }, {
    safetyConstraints: [{
      id: "c1",
      userId: "u1",
      kind: "allergy",
      allergenRef: "peanut",
      substanceRef: null,
      medicationClass: null,
      conditionRef: null,
      dietRef: null,
      severity: "medical",
      declaredBy: "student",
      notes: null,
      contentLocale: "en-GB",
    }],
  });
  assertEquals(meal.dishes, []);
  assertEquals(meal.protein_anchor_missing, []);
});
