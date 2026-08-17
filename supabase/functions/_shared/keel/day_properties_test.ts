// FF-052 — LES PROPRIÉTÉS DE JOUR. Ce que ces tests protègent, dans l'ordre de
// ce qui coûte le plus cher quand ça casse:
//
//   * LA PROPRIÉTÉ DÉCORATIVE — une déclaration qui ne change RIEN. L'élève
//     organise sa semaine sur la croyance qu'elle est prise en compte, et le
//     produit ne lui doit rien de plus faux. Chaque propriété a donc ici un
//     test de MUTATION: on pose la déclaration, la sortie DOIT bouger;
//   * LA JOURNÉE VIDÉE — `leftovers` qui retire tout, y compris ce qui puisait
//     dans un lot. Seuls les verrous de sécurité vident un repas;
//   * LE JETON INCONNU CONTAGIEUX — une faute de frappe qui emporte les
//     propriétés lisibles du même jour (patron `parseAwayDays`);
//   * LA RÉGRESSION MUETTE — aucune propriété déclarée, et pourtant une
//     consigne différente d'hier: un bump de version de prompt pour rien.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  DAY_PROPERTIES,
  DAY_PROPERTY_DAY_TOKENS,
  dayHasProperty,
  dayPropertyPromptLines,
  daysWithProperty,
  parseDayProperties,
} from "./day_properties.ts";
import {
  buildMealPrompt,
  MEAL_PROMPT_VERSION,
  parseGeneratedMeal,
} from "./meal_generation.ts";

// ---------------------------------------------------------------------------
// LE PARSEUR — patron `parseAwayDays`
// ---------------------------------------------------------------------------

Deno.test("une déclaration lisible se lit entièrement", () => {
  assertEquals(
    parseDayProperties([
      { day: "sun", properties: ["batch_cook"] },
      { day: "mon", properties: ["leftovers"] },
    ]),
    [
      { day: "mon", properties: ["leftovers"] },
      { day: "sun", properties: ["batch_cook"] },
    ],
  );
});

Deno.test("R2 — le jeton inconnu tombe SEUL", () => {
  // Une faute de frappe ne doit pas effacer une déclaration lisible du même
  // jour: c'est exactement la posture de `parseAwayDays`, et la raison y est
  // écrite — une absence illisible qui efface les absences lisibles compose un
  // repas que l'élève a dit ne pas prendre.
  assertEquals(
    parseDayProperties([{ day: "sun", properties: ["batch_cook", "picnic"] }]),
    [{ day: "sun", properties: ["batch_cook"] }],
  );
  // Un jour dont AUCUNE propriété n'est lisible ne dit plus rien: il tombe.
  assertEquals(parseDayProperties([{ day: "sun", properties: ["picnic"] }]), []);
  assertEquals(parseDayProperties([{ day: "sun", properties: [] }]), []);
  // Un jour hors calendrier tombe aussi.
  assertEquals(
    parseDayProperties([{ day: "dimanche", properties: ["batch_cook"] }]),
    [],
  );
  // Et rien de tout ça ne casse sur une entrée qui n'est pas un tableau.
  for (const raw of [null, undefined, {}, "sun", 42]) {
    assertEquals(parseDayProperties(raw), []);
  }
});

Deno.test("l'ordre est celui de la SEMAINE et de la liste, pas de la saisie", () => {
  // Un ordre qui suit la saisie ferait bouger la consigne d'une génération à
  // l'autre pour une déclaration identique — cache de prompt cassé, et test de
  // désarmement impossible à écrire.
  const parsed = parseDayProperties([
    { day: "wed", properties: ["leftovers", "batch_cook"] },
    { day: "mon", properties: ["batch_cook"] },
  ]);
  assertEquals(parsed.map((e) => e.day), ["mon", "wed"]);
  assertEquals(parsed[1].properties, ["batch_cook", "leftovers"]);
});

Deno.test("un même jour déclaré deux fois FUSIONNE, sans doublon", () => {
  assertEquals(
    parseDayProperties([
      { day: "sun", properties: ["batch_cook"] },
      { day: "sun", properties: ["batch_cook", "leftovers"] },
    ]),
    [{ day: "sun", properties: ["batch_cook", "leftovers"] }],
  );
});

Deno.test("les lecteurs répondent sur les bons jours", () => {
  const entries = parseDayProperties([
    { day: "sun", properties: ["batch_cook"] },
    { day: "mon", properties: ["leftovers"] },
  ]);
  assert(dayHasProperty(entries, "sun", "batch_cook"));
  assertEquals(dayHasProperty(entries, "sun", "leftovers"), false);
  assertEquals(dayHasProperty(entries, "tue", "batch_cook"), false);
  // Un plat sans jour nommé ne peut porter aucune propriété: on ne sait pas où
  // il est, et le pénaliser inventerait un fait.
  assertEquals(dayHasProperty(entries, null, "leftovers"), false);
  assertEquals(daysWithProperty(entries, "batch_cook"), ["sun"]);
});

Deno.test("les jetons de jour sont ceux que le PARSEUR accepte", () => {
  // Ce module recopie la liste (cycle au chargement, cf. `fixed_intakes.ts`).
  // La duplication est une décision, et c'est ce test qui la tient.
  for (const d of DAY_PROPERTY_DAY_TOKENS) {
    assertEquals(parseDayProperties([{ day: d, properties: ["leftovers"] }]), [
      { day: d, properties: ["leftovers"] },
    ]);
  }
  assertEquals(DAY_PROPERTY_DAY_TOKENS.length, 7);
});

// ---------------------------------------------------------------------------
// LES BRANCHES — R1: la mutation doit faire bouger la sortie
// ---------------------------------------------------------------------------

const PARSE_BASE = {
  doctrine: null,
  safetyConstraints: [],
  mode: "to_shop" as const,
  scope: "several_days" as const,
  pantry: [],
  beliefKeys: [],
  eatingRhythm: [],
  daysToFill: ["sun", "mon"],
  awayDays: [],
  cookingTimeMin: null,
  composition: null,
  fixedIntakes: [],
  merge: null,
  boxMemberIds: [],
};

const BATCH_PREP = {
  id: "prep_chicken",
  title: "Roast chicken thighs",
  servings_made: 4,
  ingredients: [{ term: "chicken thighs", quantity: "800 g" }],
  method: "Roast them all at once.",
  cook_on: "sun",
  active_minutes: 10,
  total_minutes: 50,
};

function dish(over: Record<string, unknown> = {}) {
  return {
    title: "Chicken and rice",
    slot: "dinner",
    day: "mon",
    ingredients: [{ term: "rice", quantity: "80 g" }],
    method: "Reheat and serve.",
    why: "It is Monday and there is a batch in the fridge.",
    ...over,
  };
}

Deno.test("R1/leftovers — MUTATION: poser la propriété DROP le plat neuf", () => {
  // Le plat ne PUISE dans rien: il repart de zéro un jour où l'élève a dit
  // qu'il finirait ce qui existe. Le lui composer fait jeter la moitié du lot.
  const fresh = dish({ ingredients: [{ term: "salmon", quantity: "2 fillets" }] });

  const without = parseGeneratedMeal(
    { preparations: [BATCH_PREP], dishes: [fresh], shopping_list: [] },
    { ...PARSE_BASE, dayProperties: [] },
  );
  const with_ = parseGeneratedMeal(
    { preparations: [BATCH_PREP], dishes: [fresh], shopping_list: [] },
    {
      ...PARSE_BASE,
      dayProperties: parseDayProperties([{ day: "mon", properties: ["leftovers"] }]),
    },
  );

  // La sortie BOUGE — c'est tout l'objet de R1.
  assertEquals(without.dishes.length, 1);
  assertEquals(with_.dishes.length, 0);
  assert(
    with_.issues.some((i) => i.includes("leftovers day")),
    `issues: ${JSON.stringify(with_.issues)}`,
  );
});

Deno.test("R3 — un jour de restes ne VIDE pas: ce qui puise dans un lot reste", () => {
  // Seuls les verrous de sécurité vident un repas. Un plat qui tire sur une
  // préparation est exactement ce qu'on mange un jour de restes.
  const meal = parseGeneratedMeal({
    preparations: [BATCH_PREP],
    dishes: [
      dish({ uses: [{ preparation_id: "prep_chicken", servings: 1 }] }),
      dish({ title: "Fresh omelette", ingredients: [{ term: "eggs", quantity: "3" }] }),
    ],
    shopping_list: [],
  }, {
    ...PARSE_BASE,
    dayProperties: parseDayProperties([{ day: "mon", properties: ["leftovers"] }]),
  });
  assertEquals(meal.dishes.length, 1);
  assertEquals(meal.dishes[0].title, "Chicken and rice");
});

Deno.test("leftovers ne mord QUE sur son jour", () => {
  const meal = parseGeneratedMeal({
    preparations: [],
    dishes: [dish({ day: "sun" }), dish({ day: "mon" })],
    shopping_list: [],
  }, {
    ...PARSE_BASE,
    dayProperties: parseDayProperties([{ day: "mon", properties: ["leftovers"] }]),
  });
  assertEquals(meal.dishes.length, 1);
  assertEquals(meal.dishes[0].day, "sun");
});

Deno.test("R1/batch_cook — MUTATION: poser la propriété ajoute l'issue", () => {
  // ON COMPTE, ON N'INVENTE PAS: fabriquer une préparation produirait une
  // recette que personne n'a rédigée. L'asymétrie avec `leftovers` est écrite
  // dans la fiche §4.
  const payload = { preparations: [], dishes: [dish()], shopping_list: [] };
  const without = parseGeneratedMeal(payload, { ...PARSE_BASE, dayProperties: [] });
  const with_ = parseGeneratedMeal(payload, {
    ...PARSE_BASE,
    dayProperties: parseDayProperties([{ day: "sun", properties: ["batch_cook"] }]),
  });

  assertEquals(without.issues.filter((i) => i.includes("batch-cooking")), []);
  assertEquals(with_.issues.filter((i) => i.includes("batch-cooking")).length, 1);
  // …et le plat n'est PAS retiré: une session manquante n'est pas la faute du
  // dîner.
  assertEquals(with_.dishes.length, 1);
});

Deno.test("batch_cook se TAIT quand la session est là", () => {
  const meal = parseGeneratedMeal({
    preparations: [BATCH_PREP],
    dishes: [dish({ uses: [{ preparation_id: "prep_chicken", servings: 1 }] })],
    shopping_list: [],
  }, {
    ...PARSE_BASE,
    dayProperties: parseDayProperties([{ day: "sun", properties: ["batch_cook"] }]),
  });
  assertEquals(meal.issues.filter((i) => i.includes("batch-cooking")), []);
});

Deno.test("batch_cook ne réclame rien HORS de la fenêtre demandée", () => {
  // Sinon chaque plan porterait l'issue, pour toujours, et personne ne la
  // lirait plus — le mode de défaillance des gardes trop bavardes.
  const meal = parseGeneratedMeal({
    preparations: [],
    dishes: [dish()],
    shopping_list: [],
  }, {
    ...PARSE_BASE,
    daysToFill: ["mon"],
    dayProperties: parseDayProperties([{ day: "sat", properties: ["batch_cook"] }]),
  });
  assertEquals(meal.issues.filter((i) => i.includes("batch-cooking")), []);
});

Deno.test("R4 — deux propriétés le MÊME jour: les deux branches s'appliquent", () => {
  // On cuisine un lot ET on mange ce qui existe. Aucune priorité, aucune des
  // deux n'a besoin de connaître l'autre.
  const both = parseDayProperties([
    { day: "sun", properties: ["batch_cook", "leftovers"] },
  ]);
  const meal = parseGeneratedMeal({
    preparations: [],
    dishes: [
      dish({ day: "sun", title: "Fresh soup" }),
      dish({ day: "sun", title: "From the fridge", uses: [{ preparation_id: "nope", servings: 1 }] }),
    ],
    shopping_list: [],
  }, { ...PARSE_BASE, daysToFill: ["sun"], dayProperties: both });

  // `leftovers` mord: le plat neuf tombe.
  assert(!meal.dishes.some((d) => d.title === "Fresh soup"));
  // `batch_cook` mord aussi: aucune préparation n'a été cuite ce jour-là.
  assertEquals(meal.issues.filter((i) => i.includes("batch-cooking")).length, 1);
});

Deno.test("un `uses` qui pointe une préparation INEXISTANTE ne sauve pas le plat", () => {
  // Le `uses` est vidé plus bas par le parseur (préparation inconnue). Le plat
  // survit au drop `leftovers` parce que le MODÈLE a dit qu'il puisait —
  // mais il n'en tire rien, et l'issue de préparation inconnue le dit.
  //
  // Ce test acte le comportement plutôt que de le laisser se découvrir: la
  // garde `leftovers` lit l'INTENTION du modèle, pas le résultat du parseur,
  // et retirer un plat sur une référence cassée le punirait deux fois.
  const meal = parseGeneratedMeal({
    preparations: [],
    dishes: [dish({ uses: [{ preparation_id: "ghost", servings: 1 }] })],
    shopping_list: [],
  }, {
    ...PARSE_BASE,
    dayProperties: parseDayProperties([{ day: "mon", properties: ["leftovers"] }]),
  });
  assertEquals(meal.dishes.length, 1);
  assertEquals(meal.dishes[0].uses, []);
  assert(meal.issues.some((i) => i.includes("unknown preparation")));
});

// ---------------------------------------------------------------------------
// LA CONSIGNE
// ---------------------------------------------------------------------------

const PROMPT_ARGS = {
  safetyConstraints: null,
  body: null,
  focusAxis: null,
  doctrineBlock: "",
  coachNoteBlock: null,
  protocolBlock: "",
  beliefKeys: [],
  goal: "health",
  situation: null,
  context: null,
  mode: "to_shop" as const,
  scope: "several_days" as const,
  pantry: [],
  cookDays: [],
  todayToken: "sun",
  today: null,
  country: null,
  daysToFill: ["sun", "mon"],
  eatingRhythm: [],
  awayDays: [],
  slot: null,
  servings: 1,
  fixedIntakes: [],
  merge: null,
};

Deno.test("R5 — DÉSARMEMENT: rien de déclaré, consigne identique AU CARACTÈRE PRÈS", () => {
  boxMemberIds: [],
  assertEquals(dayPropertyPromptLines([]), []);

  const empty = buildMealPrompt({ ...PROMPT_ARGS, dayProperties: [] });
  const declared = parseDayProperties([
    { day: "sun", properties: ["batch_cook"] },
    { day: "mon", properties: ["leftovers"] },
  ]);
  const with_ = buildMealPrompt({ ...PROMPT_ARGS, dayProperties: declared });

  // La branche EXISTE — sans ça le désarmement serait vrai parce que rien ne
  // marche, le piège de tous les tests de désarmement.
  assert(with_.userMessage !== empty.userMessage);
  assert(with_.userMessage.includes("-- WHAT THOSE DAYS ARE FOR --"));

  // Et il est TOTAL: aucune trace du lot dans la consigne vide.
  assert(!empty.userMessage.includes("THOSE DAYS"));
  assert(!empty.userMessage.includes("cook in bulk"));
  // Le retrait du bloc rend EXACTEMENT la chaîne d'avant. Le bloc est spreadé
  // dans une liste jointe par « \n »: sa contribution est ses lignes jointes
  // PLUS le séparateur qui le suit.
  assertEquals(
    with_.userMessage.replace(dayPropertyPromptLines(declared).join("\n") + "\n", ""),
    empty.userMessage,
  );
});

Deno.test("la consigne nomme les jours et dit le NÉGATIF là où il faut", () => {
  const lines = dayPropertyPromptLines(
    parseDayProperties([
      { day: "sun", properties: ["batch_cook"] },
      { day: "mon", properties: ["leftovers"] },
    ]),
  ).join("\n");
  assert(lines.includes("Sunday"));
  assert(lines.includes("Monday"));
  assert(lines.includes("compose NO new dish"));
  // Une seule propriété déclarée ⇒ une seule ligne: pas de titre orphelin pour
  // l'autre.
  const onlyBatch = dayPropertyPromptLines(
    parseDayProperties([{ day: "sun", properties: ["batch_cook"] }]),
  ).join("\n");
  assert(!onlyBatch.includes("compose NO new dish"));
});

// ---------------------------------------------------------------------------
// LA VERSION DE PROMPT — R6: UN SEUL BUMP
// ---------------------------------------------------------------------------

Deno.test("R6 — un seul bump par lot, et la version reste lisible", () => {
  // FF-051 et FF-052 touchent tous deux la consigne, et n'ont eu qu'UN bump
  // (`v7_fixed_intakes_and_days`) : deux bumps successifs auraient invalidé
  // deux fois le cache et rendu illisible toute comparaison avant/après.
  //
  // ── POURQUOI CETTE ASSERTION A CHANGÉ DE FORME (2026-08-11) ──────────────
  // Elle figeait la chaîne exacte `meal.en.v7_fixed_intakes_and_days`. Un
  // troisième lot est arrivé derrière (`v8_distinct_health_direction`) et l'a
  // fait tomber — alors que rien de ce que ce test garde n'était cassé. Un
  // test qui rougit à chaque bump légitime entraîne à ignorer le rouge, ce qui
  // coûte plus cher que ce qu'il protège.
  //
  // Ce qui est gardé désormais: la FORME de la version (donc le cache reste
  // segmentable et comparable) et le fait qu'elle AVANCE. Que la version nomme
  // les deux lots de FF-051/FF-052 est un fait d'histoire, il vit dans le git
  // log — pas dans une chaîne qu'un lot ultérieur devra réécrire.
  assert(MEAL_PROMPT_VERSION.startsWith("meal.en."), "préfixe attendu ailleurs");
  const version = MEAL_PROMPT_VERSION.slice("meal.en.".length);
  const match = version.match(/^v(\d+)_[a-z0-9_]+$/);
  assert(match, `version illisible: ${MEAL_PROMPT_VERSION}`);
  assert(
    Number(match![1]) >= 7,
    `la version a reculé sous v7: ${MEAL_PROMPT_VERSION}`,
  );
});

Deno.test("la liste des propriétés est FERMÉE et chacune a sa branche", () => {
  // Deux, pas quatre. `market` et `guests` ont été instruites et non retenues
  // (fiche §3): une propriété sans branche est PIRE que son absence.
  assertEquals([...DAY_PROPERTIES], ["batch_cook", "leftovers"]);
  for (const p of DAY_PROPERTIES) {
    const lines = dayPropertyPromptLines([{ day: "sun", properties: [p] }]);
    assert(lines.length > 0, `${p} n'a aucune ligne de consigne`);
  }
});
