// FF-051 — LES APPORTS FIXES. Ce que ces tests protègent, dans l'ordre de ce
// qui coûte le plus cher quand ça casse:
//
//   * LE REPAS SUPPRIMÉ À TORT — un yaourt à 16 h qui efface le goûter, ou une
//     faute de frappe qui fait sauter un petit-déjeuner. C'est le pire mode de
//     défaillance de ce chantier: l'élève voit un jour troué et n'a aucun moyen
//     de savoir pourquoi;
//   * LE ZÉRO CRÉDIBLE — un `food_ref` non résolu qui rend « 0 g de protéine ».
//     Zéro traverse toutes les additions sans rien signaler, et le plancher se
//     déclare atteint sur un plan qui empile par-dessus un shaker;
//   * LA PROSE DANS UN COMPARATEUR — `label` utilisé pour matcher. Cicatrice
//     nommée du dépôt (`allergen_ref='diabetes'`, 2026-08-06);
//   * LA CONSIGNE SANS PARSEUR — un modèle de composition COMPLÈTE ce qu'on lui
//     donne. Une règle qui ne vit que dans le prompt n'est pas une garantie;
//   * LA RÉGRESSION MUETTE — un élève sans apport fixe qui reçoit une consigne
//     différente d'hier, donc un bump de version de prompt pour rien.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  FIXED_INTAKE_DAY_TOKENS,
  FIXED_INTAKE_OCCASIONS,
  fixedIntakeInputsFor,
  fixedIntakePromptLines,
  intakeHappensOn,
  MAX_FIXED_INTAKES,
  parseFixedIntakes,
  slotIsTaken,
} from "./fixed_intakes.ts";
import type { FixedIntake } from "./fixed_intakes.ts";
import type { MealBodyContext } from "./meal_body.ts";
import {
  buildMealPrompt,
  EATING_OCCASIONS,
  parseGeneratedMeal,
} from "./meal_generation.ts";
import { findNumericTarget } from "./week_plan_generation.ts";
import { buildCompositionIndex, type CompositionRef } from "./food_composition.ts";
import { verdictFor } from "./meal_verdict.ts";
import { envelopeFor } from "./meal_envelope.ts";

// ---------------------------------------------------------------------------
// LA DUPLICATION EST UNE DÉCISION, PAS UNE DÉRIVE
// ---------------------------------------------------------------------------

Deno.test("les listes recopiées sont ÉGALES à celles d'origine", () => {
  // Ce module ne peut pas importer ces valeurs (cycle au chargement — payé une
  // fois par `protein_anchor.ts`, une seconde fois ici le 2026-08-11). La
  // duplication est donc assumée, et c'est CE test qui la tient: sans lui,
  // ajouter un moment dans `meal_generation.ts` produirait un apport fixe
  // silencieusement rejeté.
  assertEquals([...FIXED_INTAKE_OCCASIONS], [...EATING_OCCASIONS]);
  // `DAY_TOKENS` n'est pas exporté par `meal_generation.ts`: la comparaison se
  // fait donc contre le vocabulaire que le PARSEUR accepte réellement, ce qui
  // est la propriété qui compte.
  for (const d of FIXED_INTAKE_DAY_TOKENS) {
    assertEquals(
      parseGeneratedMeal({
        dishes: [{
          title: "Soup",
          slot: "dinner",
          day: d,
          ingredients: [{ term: "carrots", quantity: "300 g" }],
          method: "Simmer it.",
          why: "It is cold out.",
        }],
        shopping_list: [],
      }, {
        doctrine: null,
        safetyConstraints: [],
        mode: "to_shop",
        scope: "several_days",
        pantry: [],
        beliefKeys: [],
        eatingRhythm: [],
        daysToFill: [...FIXED_INTAKE_DAY_TOKENS],
        awayDays: [],
        cookingTimeMin: null,
        composition: null,
        fixedIntakes: [],
        dayProperties: [],
      }).dishes[0]?.day,
      d,
      `${d} n'est pas un jeton de jour du parseur`,
    );
  }
});

// ---------------------------------------------------------------------------
// LE PARSEUR — R4: écarté ET compté, jamais deviné
// ---------------------------------------------------------------------------

const SHAKER = {
  food_ref: "whey_protein_powder",
  label: "mon shaker",
  amount: 30,
  unit: "g",
  slot: "breakfast",
  replaces_meal: true,
  days: ["mon", "tue", "wed", "thu", "fri"],
};

Deno.test("un apport bien formé se lit entièrement", () => {
  const { intakes, discarded } = parseFixedIntakes([SHAKER]);
  assertEquals(discarded, 0);
  assertEquals(intakes.length, 1);
  const i = intakes[0];
  assertEquals(i.foodRef, "whey_protein_powder");
  assertEquals(i.label, "mon shaker");
  assertEquals(i.amount, 30);
  assertEquals(i.unit, "g");
  assertEquals(i.days, ["mon", "tue", "wed", "thu", "fri"]);
  assert(i.placement === "at_slot");
  assertEquals(i.slot, "breakfast");
  assertEquals(i.replacesMeal, true);
});

Deno.test("A5 — un apport S'AJOUTE par défaut, même avec un moment nommé", () => {
  // L'ARBITRAGE DE CE CHANTIER, et il se prend dans le mauvais sens si on ne
  // le prend pas explicitement. « Un café au lait au petit-déjeuner » nomme un
  // moment et ne remplace rien; le défaut inverse punirait d'un repas en moins
  // quelqu'un qui décrit honnêtement ce qu'il mange déjà.
  const { intakes } = parseFixedIntakes([
    { food_ref: "whole_milk", amount: 100, unit: "ml", slot: "breakfast" },
  ]);
  const i = intakes[0];
  assert(i.placement === "at_slot");
  assertEquals(i.replacesMeal, false);

  // Et seul `true` LITTÉRAL remplace: ni "true", ni 1, ni "yes".
  for (const truthy of ["true", 1, "yes", {}]) {
    const { intakes: parsed } = parseFixedIntakes([
      { ...SHAKER, replaces_meal: truthy },
    ]);
    const p = parsed[0];
    assert(p.placement === "at_slot");
    assertEquals(p.replacesMeal, false, `${JSON.stringify(truthy)} a remplacé`);
  }
});

Deno.test("sans moment nommé, l'apport est LOOSE et n'occupe rien", () => {
  const { intakes, discarded } = parseFixedIntakes([
    { food_ref: "plain_yogurt", label: "mon yaourt de 16h", amount: 125, unit: "g" },
  ]);
  assertEquals(discarded, 0);
  assertEquals(intakes[0].placement, "loose");
  assertEquals(slotIsTaken(intakes, "mon", "snack_pm"), false);
});

Deno.test("le malformé tombe SEUL, et il est COMPTÉ", () => {
  // R4. Le compteur est ce qui distingue « il n'a rien déclaré » de « on n'a
  // pas su lire ce qu'il a déclaré ». Sans lui, un champ mal écrit par un futur
  // écran ressemblerait à un champ vide, pour toujours.
  const { intakes, discarded } = parseFixedIntakes([
    { ...SHAKER, food_ref: "" }, // identifiant vide
    { ...SHAKER, amount: 0 }, // un apport de zéro n'est pas un apport
    { ...SHAKER, amount: -30 },
    { ...SHAKER, amount: "beaucoup" },
    { ...SHAKER, unit: "scoops" }, // hors liste fermée
    { ...SHAKER, slot: "brunch" }, // moment inconnu
    { ...SHAKER, days: ["lundi"] }, // jetons entièrement illisibles
    "un shaker", // pas un objet
    null,
    [],
    SHAKER, // …et le bon passe quand même
  ]);
  assertEquals(intakes.length, 1);
  assertEquals(discarded, 10);
});

Deno.test("un jour illisible tombe, l'apport RESTE", () => {
  const { intakes, discarded } = parseFixedIntakes([
    { ...SHAKER, days: ["mon", "lundi", "wed"] },
  ]);
  assertEquals(discarded, 0);
  assertEquals(intakes[0].days, ["mon", "wed"]);
});

Deno.test("les jours sortent dans l'ordre de la SEMAINE, pas de la saisie", () => {
  // Un ordre qui suit la saisie ferait bouger la consigne d'une génération à
  // l'autre pour une déclaration identique — donc casserait le cache de prompt
  // et rendrait le test de désarmement impossible à écrire.
  const { intakes } = parseFixedIntakes([{ ...SHAKER, days: ["fri", "mon", "wed"] }]);
  assertEquals(intakes[0].days, ["mon", "wed", "fri"]);
});

Deno.test("le plafond mord, et l'excédent est COMPTÉ", () => {
  const many = Array.from({ length: MAX_FIXED_INTAKES + 4 }, (_, n) => ({
    ...SHAKER,
    food_ref: `food_${n}`,
  }));
  const { intakes, discarded } = parseFixedIntakes(many);
  assertEquals(intakes.length, MAX_FIXED_INTAKES);
  assertEquals(discarded, 4);
});

Deno.test("le label retombe sur l'identifiant, jamais sur le vide", () => {
  const { intakes } = parseFixedIntakes([{ ...SHAKER, label: "   " }]);
  assertEquals(intakes[0].label, "whey_protein_powder");
});

Deno.test("une entrée qui n'est pas un tableau ne casse rien", () => {
  for (const raw of [null, undefined, {}, "shaker", 42]) {
    assertEquals(parseFixedIntakes(raw), { intakes: [], discarded: 0 });
  }
});

// ---------------------------------------------------------------------------
// BRANCHE 1 — LA NON-DUPLICATION
// ---------------------------------------------------------------------------

function intake(over: Partial<Record<string, unknown>> = {}): FixedIntake {
  return parseFixedIntakes([{ ...SHAKER, ...over }]).intakes[0];
}

Deno.test("un créneau remplacé est PRIS, les autres jours ne le sont pas", () => {
  const intakes = [intake()];
  assert(slotIsTaken(intakes, "mon", "breakfast"));
  assert(slotIsTaken(intakes, "fri", "breakfast"));
  // Le week-end sans shaker garde son petit-déjeuner.
  assertEquals(slotIsTaken(intakes, "sat", "breakfast"), false);
  assertEquals(slotIsTaken(intakes, "sun", "breakfast"), false);
  // …et les autres moments du même jour aussi.
  assertEquals(slotIsTaken(intakes, "mon", "lunch"), false);
  assertEquals(slotIsTaken(intakes, "mon", "dinner"), false);
});

Deno.test("un apport qui NE remplace PAS ne prend rien", () => {
  // Le désarmement d'A5, à l'endroit où il compte.
  const intakes = [intake({ replaces_meal: false })];
  assertEquals(slotIsTaken(intakes, "mon", "breakfast"), false);
});

Deno.test("`days` vide vaut TOUS les jours", () => {
  const intakes = [intake({ days: [] })];
  for (const d of FIXED_INTAKE_DAY_TOKENS) assert(slotIsTaken(intakes, d, "breakfast"));
  assert(intakeHappensOn(intakes[0], null));
});

Deno.test("le jour NON NOMMÉ: la direction de l'erreur est choisie", () => {
  // Un plat sans `day` tombe si le créneau est pris TOUS les jours — on sait
  // alors qu'il est de trop. S'il n'est pris que certains jours, le plat passe:
  // supprimer un repas qu'on n'a pas su situer coûte plus cher que d'en laisser
  // un de trop, que l'élève verra.
  assert(slotIsTaken([intake({ days: [] })], null, "breakfast"));
  assertEquals(slotIsTaken([intake()], null, "breakfast"), false);
  // Et un plat sans créneau ne tombe jamais: on ne sait pas où il est.
  assertEquals(slotIsTaken([intake({ days: [] })], "mon", null), false);
});

Deno.test("LES DEUX BOUTS — le parseur DROP le plat, la consigne ne suffit pas", () => {
  // Un modèle de composition COMPLÈTE ce qu'on lui donne, c'est son métier.
  // Même posture que `isAway` et que le plafond de plats.
  const meal = parseGeneratedMeal({
    dishes: [
      {
        title: "Scrambled eggs",
        slot: "breakfast",
        day: "mon",
        ingredients: [{ term: "eggs", quantity: "3" }],
        method: "Scramble them.",
        why: "A warm start.",
      },
      {
        title: "Scrambled eggs",
        slot: "breakfast",
        day: "sat",
        ingredients: [{ term: "eggs", quantity: "3" }],
        method: "Scramble them.",
        why: "A warm start.",
      },
    ],
    shopping_list: [],
  }, {
    doctrine: null,
    safetyConstraints: [],
    mode: "to_shop",
    scope: "several_days",
    pantry: [],
    beliefKeys: [],
    eatingRhythm: [],
    daysToFill: ["mon", "sat"],
    awayDays: [],
    cookingTimeMin: null,
    composition: null,
    fixedIntakes: [intake()],
    dayProperties: [],
  });
  // Le lundi tombe, le samedi reste. Un seul plat survit.
  assertEquals(meal.dishes.length, 1);
  assertEquals(meal.dishes[0].day, "sat");
  assert(
    meal.issues.some((i) => i.includes("already taken by a fixed intake")),
    `issues: ${JSON.stringify(meal.issues)}`,
  );
});

// ---------------------------------------------------------------------------
// BRANCHES 2 ET 3 — CE QUE L'APPORT PÈSE
// ---------------------------------------------------------------------------

Deno.test("une entrée par OCCURRENCE, pas une par apport", () => {
  // Un shaker cinq matins de semaine sur une fenêtre de sept jours pèse cinq
  // shakers. Compter une fois ferait dire au verdict « within » sur une
  // journée qui déborde.
  const inputs = fixedIntakeInputsFor([intake()], [...FIXED_INTAKE_DAY_TOKENS]);
  assertEquals(inputs.length, 5);
  assertEquals(inputs[0], {
    term: "whey_protein_powder",
    amount: 30,
    unit: "g",
    state: "raw",
  });
  // Fenêtre INCONNUE: chaque apport compte une fois — jamais zéro, même quand
  // ses jours ne recoupent rien de connu. Zéro serait la faute que R2 nomme.
  assertEquals(fixedIntakeInputsFor([intake()], []).length, 1);
});

function ref(over: Partial<CompositionRef> & { slug: string }): CompositionRef {
  return {
    foodGroupRef: "non_starchy_veg",
    label: over.slug,
    energyKcal: 100,
    proteinG: 2,
    carbsG: 10,
    fatG: 1,
    fiberG: 2,
    omega3Marine: false,
    ironSource: false,
    calciumSource: false,
    iodineSource: false,
    zincSource: false,
    b12Source: false,
    folateSource: false,
    yieldClass: "neutral",
    atwaterDiscount: 1,
    energyDense: false,
    unitGrams: null,
    ...over,
  } as CompositionRef;
}

const INDEX = buildCompositionIndex([
  ref({ slug: "whey_protein_powder", foodGroupRef: "lean_protein", energyKcal: 380, proteinG: 80, carbsG: 8, fatG: 5, fiberG: 0 }),
  ref({ slug: "chicken_breast", foodGroupRef: "poultry", energyKcal: 110, proteinG: 23.4, carbsG: 0, fatG: 1.5, fiberG: 0, yieldClass: "meat_shrinks" }),
  ref({ slug: "white_rice", foodGroupRef: "refined_grain", energyKcal: 350, proteinG: 7, carbsG: 78, fatG: 0.6, fiberG: 1.4, yieldClass: "grain_absorbs" }),
], [{ alias: "whey", slug: "whey_protein_powder" }]);

function body(over: Partial<MealBodyContext> = {}): MealBodyContext {
  return {
    heightCm: 175,
    ageBand: "30_44",
    gender: "male",
    latestWeight: { weekStart: "2026-08-03", value: 80 },
    latestWaist: null,
    restrictionFlag: false,
    ...over,
  };
}

const PER_KG = envelopeFor("muscle_gain", body(), "30_44", false, null);

const DISH = {
  slot: "dinner",
  method: "Roast it.",
  ingredients: [
    { term: "chicken breast", amount: 200, unit: "g" as const, state: "raw" as const },
    { term: "white rice", amount: 100, unit: "g" as const, state: "raw" as const },
  ],
};

Deno.test("la protéine de l'apport COMPTE — le plancher est atteint plus tôt", () => {
  const without = verdictFor({
    dishes: [DISH],
    envelope: PER_KG,
    index: INDEX,
    daysCovered: 1,
    uncoverableSentinels: [],
    fixedIntakeInputs: [],
  });
  const with_ = verdictFor({
    dishes: [DISH],
    envelope: PER_KG,
    index: INDEX,
    daysCovered: 1,
    uncoverableSentinels: [],
    // Le plat seul porte ~54 g; le plancher d'un homme de 80 kg en prise de
    // muscle est à 128 g. Un shaker de 100 g de whey (80 % de protéine) le
    // franchit — et c'est TOUT l'objet de ce chantier: sans lui, le plan
    // devrait empiler 75 g de protéine de plus par-dessus un moment déjà mangé.
    fixedIntakeInputs: fixedIntakeInputsFor(
      [intake({ amount: 100, days: [] })],
      ["mon"],
    ),
  });
  assertEquals(without.protein, "under");
  assertEquals(with_.protein, "met");
});

Deno.test("l'énergie de l'apport COMPTE aussi", () => {
  const under = verdictFor({
    dishes: [DISH],
    envelope: PER_KG,
    index: INDEX,
    daysCovered: 1,
    uncoverableSentinels: [],
    fixedIntakeInputs: [],
  });
  assertEquals(under.energy, "below");
  // Dix shakers sur la journée: l'énergie bouge, dans le bon sens.
  const loaded = verdictFor({
    dishes: [DISH],
    envelope: PER_KG,
    index: INDEX,
    daysCovered: 1,
    uncoverableSentinels: [],
    fixedIntakeInputs: Array.from({ length: 10 }, () => ({
      term: "whey_protein_powder",
      amount: 300,
      unit: "g" as const,
      state: "raw" as const,
    })),
  });
  assertEquals(loaded.energy, "above");
});

Deno.test("R2 — un apport NON RÉSOLU propage de l'INCONNU, pas du zéro", () => {
  // Le zéro traverse toutes les additions sans rien signaler: le plancher
  // serait jugé ATTEINT sur un plan qui empile par-dessus un shaker de 30 g
  // qu'on n'a pas su lire.
  const v = verdictFor({
    dishes: [DISH],
    envelope: PER_KG,
    index: INDEX,
    daysCovered: 1,
    uncoverableSentinels: [],
    fixedIntakeInputs: [{
      term: "huel_black_edition",
      amount: 100,
      unit: "g",
      state: "raw",
    }],
  });
  assertEquals(v.protein, "not_computable");
  assertEquals(v.energy, "not_computable");
  // …et il est COMPTÉ dans la worklist: c'est ce qui le fera apparaître dans
  // la curation d'alias, plutôt que de disparaître.
  assertEquals(v.resolution.total, 3);
  assertEquals(v.resolution.resolved, 2);
});

Deno.test("l'apport n'est dans AUCUN plat — la densité ne bouge pas", () => {
  // Un shaker n'a pas de méthode de cuisson et sa densité n'a aucun sens. Le
  // mettre dans un plat fausserait la moyenne des densités.
  const without = verdictFor({
    dishes: [DISH],
    envelope: PER_KG,
    index: INDEX,
    daysCovered: 1,
    uncoverableSentinels: [],
    fixedIntakeInputs: [],
  });
  const with_ = verdictFor({
    dishes: [DISH],
    envelope: PER_KG,
    index: INDEX,
    daysCovered: 1,
    uncoverableSentinels: [],
    fixedIntakeInputs: fixedIntakeInputsFor([intake({ days: [] })], ["mon"]),
  });
  assertEquals(with_.density, without.density);
});

Deno.test("R3 — sous restriction, la branche 1 SURVIT et l'enveloppe n'existe pas", () => {
  // Aucun chemin spécial n'a été écrit: c'est `Envelope` qui rend l'état
  // illégal irreprésentable. En `per_portion`, il n'y a pas de champ `energy`.
  const restricted = envelopeFor(
    "muscle_gain",
    body({ restrictionFlag: true }),
    "30_44",
    true,
    null,
  );
  assertEquals(restricted.mode, "per_portion");
  const v = verdictFor({
    dishes: [DISH],
    envelope: restricted,
    index: INDEX,
    daysCovered: 1,
    uncoverableSentinels: [],
    fixedIntakeInputs: fixedIntakeInputsFor([intake({ days: [] })], ["mon"]),
  });
  // L'énergie n'est pas calculée puis tue: elle n'est jamais produite.
  assertEquals(v.energy, "not_computable");
  // Et la non-duplication, elle, est côté ALIMENT: elle ne lit ni le corps, ni
  // l'objectif, ni l'enveloppe. L'élève sous plancher est le dernier à qui le
  // produit doit proposer deux petits-déjeuners.
  assert(slotIsTaken([intake({ days: [] })], "mon", "breakfast"));
});

// ---------------------------------------------------------------------------
// LA CONSIGNE — R5, R6, et la frontière du chiffre
// ---------------------------------------------------------------------------

const PROMPT_ARGS = {
  safetyConstraints: null,
  body: null,
  focusAxis: null,
  doctrineBlock: "",
  coachNoteBlock: null,
  protocolBlock: "",
  beliefKeys: [],
  goal: "muscle_gain",
  situation: null,
  context: null,
  mode: "to_shop" as const,
  scope: "several_days" as const,
  pantry: [],
  cookDays: [],
  todayToken: "mon",
  today: null,
  country: null,
  daysToFill: ["mon", "sat"],
  eatingRhythm: [],
  awayDays: [],
  slot: null,
  servings: 1,
  dayProperties: [],
};

Deno.test("R6 — DÉSARMEMENT: sans apport, la consigne est identique AU CARACTÈRE PRÈS", () => {
  // La seule preuve qui vaut. Une comparaison « à peu près » laisse passer une
  // ligne vide, un titre de section orphelin, un saut de ligne — et chacun de
  // ces trois coûte un bump de version de prompt pour rien.
  // Le bloc rend un tableau VIDE, pas un tableau d'une chaîne vide: c'est ce
  // qui fait que le spread `...fixedIntakePromptLines(...)` n'ajoute
  // strictement rien — ni ligne, ni saut de ligne, ni titre orphelin.
  assertEquals(fixedIntakePromptLines([]), []);

  const empty = buildMealPrompt({ ...PROMPT_ARGS, fixedIntakes: [] });
  const withIntake = buildMealPrompt({ ...PROMPT_ARGS, fixedIntakes: [intake()] });

  // La branche EXISTE — sans ça, le désarmement serait vrai parce que rien ne
  // marche, ce qui est le piège de tous les tests de désarmement.
  assert(withIntake.userMessage !== empty.userMessage);
  assert(withIntake.userMessage.includes("WHAT THEY ALREADY HAVE"));

  // …et elle est TOTALE: la consigne vide ne porte aucune trace du lot.
  assert(!empty.userMessage.includes("WHAT THEY ALREADY HAVE"));
  assert(!empty.userMessage.includes("ALREADY"));
  assert(!empty.userMessage.includes("fixed intake"));
  // Le retrait de l'apport rend EXACTEMENT la chaîne d'avant, au caractère
  // près: c'est la seule comparaison qui attrape une ligne vide de trop.
  // Le bloc est SPREADÉ dans la liste des sections, jointe par « \n »: sa
  // contribution exacte est donc ses lignes jointes PLUS le séparateur qui le
  // suit. Retirer l'un sans l'autre laisserait la ligne vide qu'on traque.
  const removed = withIntake.userMessage.replace(
    fixedIntakePromptLines([intake()]).join("\n") + "\n",
    "",
  );
  assertEquals(removed, empty.userMessage);
});

Deno.test("la consigne dit en NÉGATIF ce qui est pris", () => {
  const { userMessage } = buildMealPrompt({
    ...PROMPT_ARGS,
    fixedIntakes: [intake()],
    dayProperties: [],
  });
  assert(userMessage.includes("-- WHAT THEY ALREADY HAVE --"));
  assert(userMessage.includes("mon shaker"));
  assert(userMessage.includes("those moments are TAKEN"));
  assert(userMessage.includes("no breakfast on Monday"));
  // Et un apport qui ne remplace rien ne prend rien, dans la prose non plus.
  const kept = buildMealPrompt({
    ...PROMPT_ARGS,
    fixedIntakes: [intake({ replaces_meal: false })],
    dayProperties: [],
  });
  assert(!kept.userMessage.includes("those moments are TAKEN"));
  assert(kept.userMessage.includes("do not repeat what they already have"));
});

Deno.test("R1 — le LABEL ne sert JAMAIS à matcher", () => {
  // Cicatrice nommée: le 2026-08-06, des lignes difformes ont armé la ceinture
  // de sortie sur « diabetes » et un message d'urgence a été remplacé par un
  // refus poli, en run réel. Un label piégé ne doit toucher que la prose.
  const piege = intake({ label: "breakfast dinner lunch eggs chicken" });
  // Il n'occupe que SON créneau, quoi qu'il raconte.
  assert(slotIsTaken([piege], "mon", "breakfast"));
  assertEquals(slotIsTaken([piege], "mon", "dinner"), false);
  assertEquals(slotIsTaken([piege], "mon", "lunch"), false);
  // Et le calcul passe par `food_ref`, pas par lui.
  assertEquals(
    fixedIntakeInputsFor([piege], ["mon"])[0].term,
    "whey_protein_powder",
  );
});

Deno.test("la consigne ne porte AUCUN chiffre sur la personne", () => {
  // « 30 g » est un chiffre sur un ALIMENT — même famille que « 400 g de
  // cuisses de poulet » dans une recette, et ce que CONTRACT.md autorise. Ce
  // que l'apport apporte à SON plancher ne sort jamais du moteur.
  const lines = fixedIntakePromptLines([
    intake(),
    intake({ food_ref: "plain_yogurt", label: "yaourt", slot: null, days: [] }),
  ]).join("\n");
  assertEquals(findNumericTarget(lines), null);
  for (const word of ["kcal", "calorie", "your target", "deficit", "surplus calorique"]) {
    assert(!lines.toLowerCase().includes(word), `« ${word} » dans la consigne`);
  }
});

Deno.test("la consigne interdit de METTRE L'APPORT DANS LES COURSES", () => {
  // Un apport fixe est déjà mangé: le faire acheter serait la duplication
  // déplacée d'un cran, et celle-là coûte de l'argent.
  const lines = fixedIntakePromptLines([intake()]).join("\n");
  assert(lines.includes("do not put them in the shopping list"));
});
