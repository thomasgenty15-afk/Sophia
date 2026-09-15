// PIVOT NUTRITION — le bilan de la semaine: week_review.ts.
//
// Les quatre tests qui portent la décision produit, et qu'il faut relire avant
// de toucher au module:
//   * "le dénominateur est ce qu'on a vu, jamais sept"
//     -- un jour sans déclaration est `unknown`, jamais un échec. C'est la règle
//        la plus répétée du pivot, et c'est aussi celle qu'un calcul de moyenne
//        casse sans le dire.
//   * "on n'interroge jamais ce qui a été mangé"
//     -- Q6_NUTRITION_LAYER §2.5: le monitoring type comptage et la prescription
//        rigide augmentent le risque de TCA (consensus n=87). La question porte
//        sur ce qui MANQUE, un dépassement se constate.
//   * "un compte n'est pas un score"
//     -- MODEL.md §3: sans prescription individuelle, l'adhérence n'a pas
//        d'objet. « 4 des 5 lignes de ton coach, soit 80 % » est composé de
//        nombres tous vrais et reste hors modèle.
//   * "un nombre qu'on n'a pas donné est un nombre inventé"
//     -- `tracking-projection-not-grounded-db`. Un chiffre faux dans la bulle
//        est indiscernable d'un vrai, pour l'élève comme pour le coach.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  acceptComposedWeekReview,
  allowedWeekNumbers,
  buildWeekReviewSystemPrompt,
  computeCoverage,
  computeWeekReview,
  describeWeekReview,
  parseWeekReview,
  pickWeekQuestion,
  renderDeterministicWeekReview,
  WEEK_REVIEW_FACTS_VERSION,
  type WeekFactInput,
  type WeekReviewInput,
  type WeekReviewReading,
  weekReviewPromptBlock,
} from "./week_review.ts";
import type { ActivitySessionInput } from "./activity_session.ts";
import type { CompiledCommitment } from "./protocol_compiler.ts";
import type { FoodGroupRef } from "./tokens.ts";

// ---------------------------------------------------------------------------
// FIXTURES
// ---------------------------------------------------------------------------

const WEEK_DATES = [
  "2026-07-27",
  "2026-07-28",
  "2026-07-29",
  "2026-07-30",
  "2026-07-31",
  "2026-08-01",
  "2026-08-02",
] as const;

function fact(
  localDate: string,
  foodGroups: string[] = [],
  portionBand: string | null = null,
): WeekFactInput {
  return { localDate, foodGroups, portionBand };
}

/** Deux faits par jour sur `days` jours: le minimum qui fait un jour « logué ». */
function loggedDays(days: number, groups: string[] = []): WeekFactInput[] {
  const out: WeekFactInput[] = [];
  for (let i = 0; i < days; i++) {
    out.push(fact(WEEK_DATES[i], groups));
    out.push(fact(WEEK_DATES[i], []));
  }
  return out;
}

/**
 * Une ligne compilée, réduite à ce que le bilan lit. Le reste des colonnes de
 * `CompiledCommitment` n'entre dans aucune branche de ce module — les caster
 * ici évite de recopier trente champs inertes dans chaque test.
 */
function rule(
  group: FoodGroupRef,
  preview: CompiledCommitment["preview"],
  over: Partial<CompiledCommitment> = {},
): CompiledCommitment {
  return {
    food_group_ref: group,
    title: group,
    student_instruction: null,
    priority: "secondary",
    preview,
    ...over,
  } as unknown as CompiledCommitment;
}

function input(over: Partial<WeekReviewInput> = {}): WeekReviewInput {
  return {
    weekStart: WEEK_DATES[0],
    weekEnd: WEEK_DATES[6],
    weekDates: WEEK_DATES,
    facts: [],
    pulses: [],
    rules: [],
    goal: "fat_loss",
    previouslyAskedGroup: null,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// LA COUVERTURE — le seuil existait déjà, on ne s'en invente pas un second
// ---------------------------------------------------------------------------

Deno.test("un jour logué demande DEUX faits, pas un", () => {
  const one = computeCoverage([fact(WEEK_DATES[0])], WEEK_DATES);
  assertEquals(one.observedDays, 1);
  assertEquals(one.loggedDays, 0, "un seul fait ne fait pas une journée lue");

  const two = computeCoverage(
    [fact(WEEK_DATES[0]), fact(WEEK_DATES[0])],
    WEEK_DATES,
  );
  assertEquals(two.loggedDays, 1);
});

Deno.test("la couverture bascule à 4 jours logués, et pas avant", () => {
  assertEquals(computeCoverage(loggedDays(3), WEEK_DATES).sufficient, false);
  assertEquals(computeCoverage(loggedDays(4), WEEK_DATES).sufficient, true);
});

Deno.test("un fait daté hors fenêtre ne fabrique pas de couverture", () => {
  const coverage = computeCoverage(
    [fact("2026-07-20"), fact("2026-07-20"), fact("2026-09-01")],
    WEEK_DATES,
  );
  assertEquals(coverage.observedDays, 0);
  assertEquals(coverage.totalFacts, 0, "on ne rattache pas au jour le plus proche");
});

Deno.test("un fait qui nomme deux fois le même groupe est UNE observation", () => {
  // La colonne `food_group_ref` ET `recognized.food_groups_present` peuvent
  // s'accorder sur la même ligne. Compter deux fois créditerait l'élève pour la
  // richesse du parsing, pas pour ce qu'il a mangé.
  const reading = computeWeekReview(input({
    facts: [
      ...loggedDays(5),
      fact(WEEK_DATES[0], ["leafy_greens", "leafy_greens"]),
    ],
    rules: [rule("leafy_greens", { kind: "encourage", group: "leafy_greens", perDay: 1 })],
  }));
  assertEquals(reading.alignment[0].seen, 1);
});

// ---------------------------------------------------------------------------
// L'ALIGNEMENT — ce que la méthode du coach devient sur une vraie semaine
// ---------------------------------------------------------------------------

Deno.test("un groupe encouragé jamais vu est `absent`", () => {
  const reading = computeWeekReview(input({
    facts: loggedDays(5),
    rules: [rule("fatty_fish", { kind: "encourage", group: "fatty_fish", perDay: 1 })],
  }));
  assertEquals(reading.alignment[0].status, "absent");
  assertEquals(reading.alignment[0].seen, 0);
});

Deno.test("un groupe encouragé vu sur la moitié des jours LUS est honoré", () => {
  // 4 jours logués, vu 2: la part est 0,5 — le seuil, atteint.
  const facts = [
    ...loggedDays(4),
    fact(WEEK_DATES[0], ["leafy_greens"]),
    fact(WEEK_DATES[1], ["leafy_greens"]),
  ];
  const reading = computeWeekReview(input({
    facts,
    rules: [rule("leafy_greens", { kind: "encourage", group: "leafy_greens", perDay: 1 })],
  }));
  assertEquals(reading.alignment[0].daysSeen, 2);
  assertEquals(reading.alignment[0].status, "honoured");
});

Deno.test("le dénominateur est les jours LUS, pas sept", () => {
  // Vu 3 jours sur 4 lus => honoré. Si le calcul divisait par 7, la même
  // semaine tomberait à 0,43 et l'élève lirait « en dessous » pour des journées
  // dont on ne sait rien. C'est le test qui porte la règle du pivot.
  const facts = [
    ...loggedDays(4),
    fact(WEEK_DATES[0], ["legumes"]),
    fact(WEEK_DATES[1], ["legumes"]),
    fact(WEEK_DATES[2], ["legumes"]),
  ];
  const reading = computeWeekReview(input({
    facts,
    rules: [rule("legumes", { kind: "encourage", group: "legumes", perDay: 1 })],
  }));
  assertEquals(reading.coverage.loggedDays, 4);
  assertEquals(reading.alignment[0].status, "honoured");
});

Deno.test("une cible hebdomadaire garde son nombre, une cible journalière est ramenée aux jours lus", () => {
  const facts = [...loggedDays(4), fact(WEEK_DATES[0], ["fatty_fish"]), fact(
    WEEK_DATES[1],
    ["fatty_fish"],
  )];

  const weekly = computeWeekReview(input({
    facts,
    rules: [rule("fatty_fish", {
      kind: "portions",
      group: "fatty_fish",
      direction: "at_least",
      portions: 2,
      period: "week",
    })],
  }));
  assertEquals(weekly.alignment[0].status, "honoured", "2 vues pour 2 demandées");

  const daily = computeWeekReview(input({
    facts,
    rules: [rule("fatty_fish", {
      kind: "portions",
      group: "fatty_fish",
      direction: "at_least",
      portions: 1,
      period: "day",
    })],
  }));
  // 1/jour sur 4 jours lus = 4 attendues, 2 vues.
  assertEquals(daily.alignment[0].status, "short");
});

Deno.test("un plafond dépassé est `over`, un évitement respecté est `honoured`", () => {
  const reading = computeWeekReview(input({
    facts: [
      ...loggedDays(4),
      fact(WEEK_DATES[0], ["alcohol"]),
      fact(WEEK_DATES[1], ["alcohol"]),
      fact(WEEK_DATES[2], ["alcohol"]),
    ],
    rules: [
      rule("alcohol", {
        kind: "portions",
        group: "alcohol",
        direction: "at_most",
        portions: 2,
        period: "week",
      }),
      rule("sugar_sweets", { kind: "exclude", group: "sugar_sweets" }),
    ],
  }));
  const alcohol = reading.alignment.find((i) => i.group === "alcohol");
  const sweets = reading.alignment.find((i) => i.group === "sugar_sweets");
  assertEquals(alcohol?.status, "over");
  assertEquals(sweets?.status, "honoured", "jamais vu = évitement tenu");
});

Deno.test("« à chaque repas » n'est décidable que par l'absence", () => {
  // Un fait ne dit pas combien de repas la journée portait. Rendre `honoured`
  // sur une présence serait un verdict que la donnée ne soutient pas.
  const absent = computeWeekReview(input({
    facts: loggedDays(4),
    rules: [rule("lean_protein", { kind: "every_meal", group: "lean_protein" })],
  }));
  assertEquals(absent.alignment[0].status, "absent");

  const present = computeWeekReview(input({
    facts: [...loggedDays(4), fact(WEEK_DATES[0], ["lean_protein"])],
    rules: [rule("lean_protein", { kind: "every_meal", group: "lean_protein" })],
  }));
  assertEquals(present.alignment[0].status, "unknown");
});

Deno.test("les règles d'horaire sont COMPTÉES, pas jugées", () => {
  const reading = computeWeekReview(input({
    facts: loggedDays(4),
    rules: [
      rule("coffee_tea", { kind: "not_after", group: "coffee_tea", cutoff: "16:00" }),
      rule("eggs", { kind: "at_slot", group: "eggs", slot: "breakfast" as never }),
    ],
  }));
  assertEquals(reading.alignment.length, 0);
  assertEquals(reading.unevaluatedRules, 2, "silencieuses = invérifiables plus tard");
});

// ---------------------------------------------------------------------------
// LA BRANCHE
// ---------------------------------------------------------------------------

Deno.test("sous le seuil de couverture, la semaine alimentaire n'est PAS lue", () => {
  const reading = computeWeekReview(input({
    facts: [...loggedDays(3), fact(WEEK_DATES[0], ["leafy_greens"])],
    rules: [rule("fatty_fish", { kind: "encourage", group: "fatty_fish", perDay: 1 })],
  }));
  assertEquals(reading.branch, "insufficient_data");
  assertEquals(reading.question, null, "aucune question sur une semaine non lue");
});

Deno.test("sans mapping du coach on compte, on ne compare pas", () => {
  const reading = computeWeekReview(input({ facts: loggedDays(5) }));
  assertEquals(reading.branch, "no_method");
});

Deno.test("des lignes toutes `unknown` ne font pas un « on_track »", () => {
  const reading = computeWeekReview(input({
    facts: [...loggedDays(4), fact(WEEK_DATES[0], ["lean_protein"])],
    rules: [rule("lean_protein", { kind: "every_meal", group: "lean_protein" })],
  }));
  assertEquals(reading.branch, "no_method", "un dénominateur vide n'est pas un succès");
});

Deno.test("les trois bandes se séparent sur la part de lignes honorées", () => {
  const seen = (group: FoodGroupRef) => [
    fact(WEEK_DATES[0], [group]),
    fact(WEEK_DATES[1], [group]),
  ];
  const groups: FoodGroupRef[] = ["legumes", "leafy_greens", "berries", "nuts_seeds"];
  const rules = groups.map((g) => rule(g, { kind: "encourage", group: g, perDay: 1 }));

  const all = computeWeekReview(input({
    facts: [...loggedDays(4), ...groups.flatMap(seen)],
    rules,
  }));
  assertEquals(all.branch, "on_track");

  const half = computeWeekReview(input({
    facts: [...loggedDays(4), ...seen("legumes"), ...seen("leafy_greens")],
    rules,
  }));
  assertEquals(half.branch, "mixed");

  const none = computeWeekReview(input({ facts: loggedDays(4), rules }));
  assertEquals(none.branch, "off_track");
});

// ---------------------------------------------------------------------------
// LA QUESTION — au plus une, et sur ce qui manque
// ---------------------------------------------------------------------------

Deno.test("on n'interroge JAMAIS un dépassement", () => {
  // La décision produit la plus dure du lot: « pourquoi as-tu mangé X » est un
  // interrogatoire, « qu'est-ce qui a rendu X difficile » est du coaching.
  const reading = computeWeekReview(input({
    facts: [
      ...loggedDays(4),
      fact(WEEK_DATES[0], ["alcohol"]),
      fact(WEEK_DATES[1], ["alcohol"]),
      fact(WEEK_DATES[2], ["alcohol"]),
    ],
    rules: [
      rule("alcohol", {
        kind: "portions",
        group: "alcohol",
        direction: "at_most",
        portions: 1,
        period: "week",
      }),
      rule("legumes", { kind: "encourage", group: "legumes", perDay: 1 }),
    ],
  }));
  assertEquals(reading.branch, "off_track");
  assertEquals(reading.question?.group, "legumes");
});

Deno.test("`absent` passe avant `short`, et `core` avant `secondary`", () => {
  const items = [
    {
      group: "berries" as FoodGroupRef,
      label: "Berries",
      ask: { kind: "at_least", portions: 1, per: "day" } as const,
      seen: 1,
      daysSeen: 1,
      status: "short" as const,
      rationale: null,
      priority: "core",
    },
    {
      group: "legumes" as FoodGroupRef,
      label: "Legumes",
      ask: { kind: "at_least", portions: 1, per: "day" } as const,
      seen: 0,
      daysSeen: 0,
      status: "absent" as const,
      rationale: null,
      priority: "secondary",
    },
  ];
  assertEquals(pickWeekQuestion(items, null)?.group, "legumes");

  const twoAbsent = [
    { ...items[1], group: "berries" as FoodGroupRef, priority: "secondary" },
    { ...items[1], group: "legumes" as FoodGroupRef, priority: "core" },
  ];
  assertEquals(pickWeekQuestion(twoAbsent, null)?.group, "legumes", "core d'abord");
});

Deno.test("jamais deux semaines de suite sur le même groupe", () => {
  const facts = loggedDays(4);
  const rules = [
    rule("fatty_fish", { kind: "encourage", group: "fatty_fish", perDay: 1 }),
    rule("legumes", { kind: "encourage", group: "legumes", perDay: 1 }),
  ];
  const first = computeWeekReview(input({ facts, rules }));
  const second = computeWeekReview(
    input({ facts, rules, previouslyAskedGroup: first.question!.group }),
  );
  assert(first.question);
  assert(second.question);
  assert(
    second.question.group !== first.question.group,
    "reposer la même question sept jours plus tard est du harcèlement de mesure",
  );
});

Deno.test("une semaine sans écart ne pose AUCUNE question", () => {
  const reading = computeWeekReview(input({
    facts: [
      ...loggedDays(4),
      fact(WEEK_DATES[0], ["legumes"]),
      fact(WEEK_DATES[1], ["legumes"]),
    ],
    rules: [rule("legumes", { kind: "encourage", group: "legumes", perDay: 1 })],
  }));
  assertEquals(reading.branch, "on_track");
  assertEquals(reading.question, null, "une question polie à la fin d'un bon bilan est une taxe");
});

// ---------------------------------------------------------------------------
// LE REPLI DÉTERMINISTE — il part TOUJOURS
// ---------------------------------------------------------------------------

Deno.test("le repli n'est jamais vide, quelle que soit la branche", () => {
  const cases: WeekReviewReading[] = [
    computeWeekReview(input({ facts: loggedDays(2) })),
    computeWeekReview(input({ facts: loggedDays(5) })),
    computeWeekReview(input({
      facts: [...loggedDays(4), fact(WEEK_DATES[0], ["legumes"]), fact(WEEK_DATES[1], ["legumes"])],
      rules: [rule("legumes", { kind: "encourage", group: "legumes", perDay: 1 })],
    })),
    computeWeekReview(input({
      facts: loggedDays(4),
      rules: [rule("legumes", { kind: "encourage", group: "legumes", perDay: 1 })],
    })),
  ];
  for (const reading of cases) {
    const text = renderDeterministicWeekReview(reading);
    assert(text.trim().length > 0, `branche ${reading.branch} sans texte`);
  }
});

Deno.test("sous le seuil, le repli ne reproche rien et ne demande rien", () => {
  const text = renderDeterministicWeekReview(
    computeWeekReview(input({ facts: loggedDays(2) })),
  );
  assert(!text.includes("?"), "pas de question sur une semaine non lue");
  assert(
    !/\blog\s+more\b|\bshould\b|\bneed to\b/i.test(text),
    "« tu n'as pas assez logué » est un reproche passif",
  );
});

Deno.test("le repli n'ouvre JAMAIS sur un évitement tenu", () => {
  // Trouvé en run réel le 2026-08-06 sur un vrai protocole de coach: le bilan
  // s'ouvrait sur « sweetened_beverage: 0 of the 5 days I saw, which is what
  // your coach asks for ». Un décompte à zéro se lit comme un échec, et
  // féliciter quelqu'un de ne pas avoir bu de soda est creux.
  const reading = computeWeekReview(input({
    facts: [...loggedDays(4), fact(WEEK_DATES[0], ["legumes"]), fact(WEEK_DATES[1], ["legumes"])],
    rules: [
      rule("sweetened_beverage", { kind: "exclude", group: "sweetened_beverage" }),
      rule("legumes", { kind: "encourage", group: "legumes", perDay: 1 }),
    ],
  }));
  const text = renderDeterministicWeekReview(reading);
  assert(!text.includes("Sweetened beverages:"), text);
  assert(text.includes("Legumes:"), text);
});

Deno.test("un slug de base de données ne sort jamais dans la bulle", () => {
  // `CompiledCommitment.title` retombe sur le slug brut quand le coach n'a posé
  // aucun terme. Mesuré en réel: « sweetened_beverage: 0 of the 5 days ».
  const reading = computeWeekReview(input({
    facts: loggedDays(4),
    rules: [rule("sweetened_beverage", {
      kind: "encourage",
      group: "sweetened_beverage",
      perDay: 1,
    })],
  }));
  assertEquals(reading.alignment[0].label, "Sweetened beverages");

  // Le mot du COACH gagne toujours: c'est la moitié du produit.
  const coachTerm = computeWeekReview(input({
    facts: loggedDays(4),
    rules: [
      rule("leafy_greens", { kind: "encourage", group: "leafy_greens", perDay: 1 }, {
        title: "green volume",
      }),
    ],
  }));
  assertEquals(coachTerm.alignment[0].label, "green volume");
});

Deno.test("le repli ne porte AUCUN déictique temporel", () => {
  // Le formulaire peut être rempli le mardi suivant, et ce module n'a pas
  // d'horloge. « Cette semaine » serait alors faux, avec des chiffres justes.
  const cases = [
    computeWeekReview(input({ facts: loggedDays(5) })),
    computeWeekReview(input({
      facts: loggedDays(4),
      rules: [rule("legumes", { kind: "encourage", group: "legumes", perDay: 1 })],
    })),
    computeWeekReview(input({
      facts: [...loggedDays(4), fact(WEEK_DATES[0], ["legumes"]), fact(WEEK_DATES[1], ["legumes"])],
      rules: [rule("legumes", { kind: "encourage", group: "legumes", perDay: 1 })],
    })),
  ];
  for (const reading of cases) {
    const text = renderDeterministicWeekReview(reading);
    assert(!/\bthis week\b/i.test(text), `${reading.branch}: ${text}`);
  }
});

Deno.test("le repli porte le dénominateur honnête", () => {
  const reading = computeWeekReview(input({
    facts: [...loggedDays(4), fact(WEEK_DATES[0], ["legumes"]), fact(WEEK_DATES[1], ["legumes"])],
    rules: [rule("legumes", { kind: "encourage", group: "legumes", perDay: 1 })],
  }));
  const text = renderDeterministicWeekReview(reading);
  assert(text.includes("of the 4 days I saw"), text);
});

// ---------------------------------------------------------------------------
// LE BLOC DE CONTEXTE
// ---------------------------------------------------------------------------

Deno.test("le bloc porte ses dates et interdit « cette semaine »", () => {
  const block = weekReviewPromptBlock(
    computeWeekReview(input({ facts: loggedDays(5) })),
  );
  assert(block.includes(WEEK_DATES[0]));
  assert(block.includes(WEEK_DATES[6]));
  assert(block.includes("never say 'this week'"), block);
});

Deno.test("le bloc refuse le vocabulaire de note et protège les jours muets", () => {
  const block = weekReviewPromptBlock(
    computeWeekReview(input({ facts: loggedDays(5) })),
  );
  assert(/NOT adherence/.test(block));
  assert(/unknown, not failures/.test(block));
});

Deno.test("sous le seuil, le bloc interdit de décrire l'alimentation", () => {
  const block = weekReviewPromptBlock(
    computeWeekReview(input({
      facts: loggedDays(2),
      rules: [rule("legumes", { kind: "encourage", group: "legumes", perDay: 1 })],
    })),
  );
  assert(block.includes("BELOW THE READING THRESHOLD"));
  assert(!block.includes("Legumes"), "aucune ligne d'alignement sous le seuil");
});

Deno.test("le « pourquoi » du coach voyage VERBATIM dans le bloc", () => {
  // C'est lui qui doit sortir quand l'élève demande pourquoi ça compte. Un
  // agent qui explique la nutrition à sa façon enseigne contre le coach dont il
  // porte le nom.
  const why = "Oily fish is the only reliable EPA source in a normal week.";
  const block = weekReviewPromptBlock(computeWeekReview(input({
    facts: loggedDays(5),
    rules: [
      rule("fatty_fish", { kind: "encourage", group: "fatty_fish", perDay: 1 }, {
        student_instruction: why,
        title: "Oily fish",
      }),
    ],
  })));
  assert(block.includes(why), block);
});

Deno.test("le bloc rappelle la question déjà posée pour qu'elle ne se repose pas", () => {
  const reading = computeWeekReview(input({
    facts: loggedDays(4),
    rules: [rule("legumes", { kind: "encourage", group: "legumes", perDay: 1 })],
  }));
  const block = weekReviewPromptBlock(reading);
  assert(block.includes("YOU ALREADY ASKED THEM ABOUT"));
  assert(block.includes("Do not ask it again"));
});

Deno.test("le poids ne rentre jamais dans le bloc, les axes 1-5 oui", () => {
  const block = weekReviewPromptBlock(
    computeWeekReview(input({ facts: loggedDays(5) })),
    { energy: 2, sleep: 4 },
  );
  assert(block.includes("energy 2/5"));
  assert(block.includes("sleep 4/5"));
  assert(!/weight|kg|waist/i.test(block));
});

// ---------------------------------------------------------------------------
// LA CEINTURE
// ---------------------------------------------------------------------------

function readingWithQuestion(): WeekReviewReading {
  return computeWeekReview(input({
    facts: [...loggedDays(4), fact(WEEK_DATES[0], ["legumes"])],
    rules: [
      rule("legumes", { kind: "encourage", group: "legumes", perDay: 1 }),
      rule("fatty_fish", { kind: "encourage", group: "fatty_fish", perDay: 1 }),
    ],
  }));
}

function readingWithoutQuestion(): WeekReviewReading {
  return computeWeekReview(input({
    facts: [...loggedDays(4), fact(WEEK_DATES[0], ["legumes"]), fact(WEEK_DATES[1], ["legumes"])],
    rules: [rule("legumes", { kind: "encourage", group: "legumes", perDay: 1 })],
  }));
}

Deno.test("un nombre qu'on n'a pas donné est un nombre inventé", () => {
  const reading = readingWithQuestion();
  const bad = acceptComposedWeekReview(
    "You logged 19 meals this week. What made fish hard?",
    reading,
  );
  assertEquals(bad.ok, false);
  if (!bad.ok) assertEquals(bad.reason, "invented_number");
});

Deno.test("les cibles du coach sont citables — sinon le repli devient le cas nominal", () => {
  const reading = computeWeekReview(input({
    facts: [...loggedDays(4), fact(WEEK_DATES[0], ["fatty_fish"])],
    rules: [rule("fatty_fish", {
      kind: "portions",
      group: "fatty_fish",
      direction: "at_least",
      portions: 3,
      period: "week",
    })],
  }));
  assert(allowedWeekNumbers(reading).has(3), "la demande du coach est une vérité de plus");
});

Deno.test("un compte ne devient jamais un score", () => {
  const reading = readingWithoutQuestion();
  for (
    const text of [
      "Legumes on 2 of the 4 days I saw — that's 50% of your coach's lines.",
      "Your adherence held up this week.",
      "That's a 4 day streak on legumes.",
    ]
  ) {
    const verdict = acceptComposedWeekReview(text, reading);
    assertEquals(verdict.ok, false, text);
    if (!verdict.ok) {
      assert(
        verdict.reason === "adherence_language" || verdict.reason === "invented_number",
        `${text} -> ${verdict.reason}`,
      );
    }
  }
});

Deno.test("le bulletin sur la semaine est refusé, le compliment sur un ALIMENT passe", () => {
  const reading = readingWithoutQuestion();
  const bad = acceptComposedWeekReview(
    "Legumes on 2 of the 4 days I saw. Great week.",
    reading,
  );
  assertEquals(bad.ok, false);
  if (!bad.ok) assertEquals(bad.reason, "qualifies_the_week");

  const ok = acceptComposedWeekReview(
    "Legumes came up on 2 of the 4 days I saw, and they are a good source of fibre.",
    reading,
  );
  assertEquals(ok.ok, true, "la condition de désarmement: qualifier un aliment reste permis");
});

Deno.test("la cardinalité de la question mord dans les deux sens", () => {
  const withQ = readingWithQuestion();
  const withoutQ = readingWithoutQuestion();

  const missing = acceptComposedWeekReview("Legumes came up once.", withQ);
  assertEquals(missing.ok, false);
  if (!missing.ok) assertEquals(missing.reason, "missing_question");

  const twice = acceptComposedWeekReview(
    "Legumes came up once. What made fish hard? Want to talk it through?",
    withQ,
  );
  assertEquals(twice.ok, false);
  if (!twice.ok) assertEquals(twice.reason, "too_many_questions");

  const unexpected = acceptComposedWeekReview(
    "Legumes on 2 of the 4 days I saw. How did that feel?",
    withoutQ,
  );
  assertEquals(unexpected.ok, false);
  if (!unexpected.ok) assertEquals(unexpected.reason, "unexpected_question");
});

Deno.test("une question qui interroge un aliment MANGÉ n'est pas ce qu'on demande au modèle", () => {
  // La garde est dans le prompt, pas dans la ceinture — un texte ne se juge pas
  // sur l'intention. Ce test verrouille la CONSIGNE, qui est ce que le prompt
  // peut vraiment garantir.
  const system = buildWeekReviewSystemPrompt({
    doctrineBlock: "== METHOD ==",
    reading: readingWithQuestion(),
  });
  assert(system.includes("Never ask why they ate something."), system);
});

Deno.test("un texte accepté reste un texte accepté", () => {
  const reading = readingWithQuestion();
  const verdict = acceptComposedWeekReview(
    "Legumes came up on 1 of the 4 days I saw. I did not see any oily fish at all — what made that one hard?",
    reading,
  );
  assertEquals(verdict.ok, true, JSON.stringify(verdict));
});

Deno.test("« tu as raté » est refusé — un jour muet n'est pas un manquement", () => {
  // C'est le mot exact qu'un bilan hebdomadaire produit tout seul (« you
  // missed fish twice »), et c'est précisément celui que la règle du pivot
  // interdit: on ne sait rien des jours non déclarés. La ceinture partagée de
  // culpabilisation le couvre déjà, ce test l'ancre sur CETTE surface.
  for (
    const text of [
      "You missed fish on 2 of the 4 days I saw. What made that one hard?",
      "You skipped it again. What made that one hard?",
      "You haven't logged much. What made that one hard?",
    ]
  ) {
    const verdict = acceptComposedWeekReview(text, readingWithQuestion());
    assertEquals(verdict.ok, false, text);
    if (!verdict.ok) assertEquals(verdict.reason, "guilt_tripping", text);
  }
});

// ---------------------------------------------------------------------------
// LE PROMPT
// ---------------------------------------------------------------------------

Deno.test("sous le seuil, le prompt dit au modèle qu'il ne sait RIEN de l'alimentation", () => {
  const described = describeWeekReview(computeWeekReview(input({ facts: loggedDays(2) })));
  assert(described.includes("THERE IS NO READING OF THEIR EATING"));
});

Deno.test("sans question, le prompt l'interdit explicitement", () => {
  const system = buildWeekReviewSystemPrompt({
    doctrineBlock: "== METHOD ==",
    reading: readingWithoutQuestion(),
  });
  assert(system.includes("Ask NOTHING"), system);
});

// ---------------------------------------------------------------------------
// LA SÉRIALISATION — un jsonb relu doit valoir l'original
// ---------------------------------------------------------------------------

Deno.test("aller-retour jsonb: la lecture relue est la lecture calculée", () => {
  const reading = readingWithQuestion();
  const round = parseWeekReview(JSON.parse(JSON.stringify(reading)));
  assertEquals(round, reading);
});

Deno.test("une version inconnue rend null plutôt qu'une phrase", () => {
  const reading = readingWithQuestion();
  assertEquals(
    parseWeekReview({ ...JSON.parse(JSON.stringify(reading)), version: "week_review_v0" }),
    null,
  );
  assertEquals(parseWeekReview(null), null);
  assertEquals(parseWeekReview("nope"), null);
});

Deno.test("un token hors vocabulaire dans NOTRE jsonb rend null", () => {
  const raw = JSON.parse(JSON.stringify(readingWithQuestion()));
  raw.alignment[0].group = "kombucha";
  assertEquals(parseWeekReview(raw), null);
  assertEquals(WEEK_REVIEW_FACTS_VERSION, "week_review_v1");
});

// ---------------------------------------------------------------------------
// LES SÉANCES — le consommateur du log d'activité (2026-08-18)
//
// Ces tests portent la condition d'existence de `student_activity_sessions`:
// « on ne collecte une donnée que si quelque chose en aval la consomme »
// (`onboarding.ts:36`). L'aval, c'est ce module. Et les deux bornes de la
// décision produit: on ne règle rien depuis une séance, et aucun nombre
// d'énergie n'en sort.
// ---------------------------------------------------------------------------

function withSessions(
  sessions: ActivitySessionInput[] | null,
  over: Partial<WeekReviewInput> = {},
): WeekReviewReading {
  return computeWeekReview(input({
    facts: [...loggedDays(4), fact(WEEK_DATES[0], ["legumes"])],
    rules: [
      rule("legumes", { kind: "encourage", group: "legumes", perDay: 1 }),
      rule("fatty_fish", { kind: "encourage", group: "fatty_fish", perDay: 1 }),
    ],
    activity: sessions,
    ...over,
  }));
}

function trained(localDate: string): ActivitySessionInput {
  return { localDate, kind: "strength", durationMin: 45, intensity: "moderate" };
}

Deno.test("un appelant qui ne charge pas les séances rend `null`, pas zéro", () => {
  // C'est le cas de TOUS les tests ci-dessus, et il doit le rester: `activity`
  // est optionnel, et son absence ne doit pas se mettre à raconter une semaine
  // sans mouvement.
  assertEquals(computeWeekReview(input()).activity, null);
  assertEquals(withSessions(null).activity, null);
});

Deno.test("une semaine lue sans séance est un compte à zéro — qui ne s'imprime jamais", () => {
  const reading = withSessions([]);
  assertEquals(reading.activity?.sessions, 0);
  const text = renderDeterministicWeekReview(reading);
  assert(!/session/i.test(text), `un zéro s'est imprimé: ${text}`);
});

Deno.test("le fait des séances entre dans le repli déterministe", () => {
  const text = renderDeterministicWeekReview(
    withSessions([trained(WEEK_DATES[0]), trained(WEEK_DATES[0]), trained(WEEK_DATES[3])]),
  );
  assert(text.includes("3 training sessions"), text);
  assert(text.includes("2 days"), text);
});

Deno.test("le fait des séances passe AVANT la question, jamais après", () => {
  const reading = withSessions([trained(WEEK_DATES[0])]);
  assert(reading.question !== null, "la fixture doit poser une question");
  const text = renderDeterministicWeekReview(reading);
  assert(
    text.indexOf("training session") < text.indexOf("?"),
    `une phrase collée derrière la question dit qu'on n'attend pas de réponse: ${text}`,
  );
});

Deno.test("sous le seuil alimentaire, les séances se disent QUAND MÊME", () => {
  // C'est la semaine où ça compte le plus: rien de photographié, mais trois
  // séances loguées. La couverture alimentaire ne gouverne pas le mouvement.
  const reading = computeWeekReview(input({
    facts: loggedDays(2),
    activity: [trained(WEEK_DATES[0]), trained(WEEK_DATES[1]), trained(WEEK_DATES[2])],
  }));
  assertEquals(reading.branch, "insufficient_data");
  const text = renderDeterministicWeekReview(reading);
  assert(text.includes("3 training sessions"), text);
  const block = weekReviewPromptBlock(reading);
  assert(block.includes("TRAINING THEY LOGGED THEMSELVES"), block);
});

Deno.test("le bloc interdit de convertir une séance en calories, et de la prescrire", () => {
  const block = weekReviewPromptBlock(withSessions([trained(WEEK_DATES[0])]));
  assert(/NEVER turn this into calories/i.test(block), block);
  assert(/do not prescribe/i.test(block), block);
  assert(/not rest days and not missed sessions/i.test(block), block);
});

Deno.test("le bloc ne dit RIEN des séances quand il n'y en a pas", () => {
  for (const reading of [withSessions([]), withSessions(null)]) {
    const block = weekReviewPromptBlock(reading);
    assert(!/TRAINING THEY LOGGED/i.test(block), block);
  }
});

Deno.test("les comptes de séances sont citables par le modèle", () => {
  const reading = withSessions([
    trained(WEEK_DATES[0]),
    trained(WEEK_DATES[1]),
    { localDate: WEEK_DATES[2], kind: "cardio", durationMin: null, intensity: null },
  ]);
  const allowed = allowedWeekNumbers(reading);
  assert(allowed.has(3), "3 séances");
  assert(allowed.has(90), "90 minutes déclarées");
  assert(allowed.has(2), "2 séances portant une durée");
  const ok = acceptComposedWeekReview(
    "Thanks — that's saved. You logged 3 training sessions. What made fish hard?",
    reading,
  );
  assertEquals(ok.ok, true, JSON.stringify(ok));
});

Deno.test("un compte de séances inventé est refusé", () => {
  const reading = withSessions([trained(WEEK_DATES[0])]);
  const bad = acceptComposedWeekReview(
    "Thanks — that's saved. You logged 6 sessions. What made fish hard?",
    reading,
  );
  assertEquals(bad.ok, false);
  if (!bad.ok) assertEquals(bad.reason, "invented_number");
});

Deno.test("une séance chiffrée en calories est REFUSÉE, pas corrigée", () => {
  const reading = withSessions([trained(WEEK_DATES[0])]);
  for (
    const text of [
      "Thanks — that's saved. That session burned about 400 kcal. What made fish hard?",
      "Thanks — that's saved. That is roughly 350 calories. What made fish hard?",
      "Thanks — that's saved. Around 1500 kilojoules there. What made fish hard?",
    ]
  ) {
    const verdict = acceptComposedWeekReview(text, reading);
    assertEquals(verdict.ok, false, text);
    if (!verdict.ok) assertEquals(verdict.reason, "energy_number", text);
  }
});

Deno.test("la ceinture d'énergie a un cas qui PASSE — sinon elle bloque tout", () => {
  const reading = withSessions([trained(WEEK_DATES[0])]);
  const ok = acceptComposedWeekReview(
    "Thanks — that's saved. You logged 1 training session. What made fish hard?",
    reading,
  );
  assertEquals(ok.ok, true, JSON.stringify(ok));
});

Deno.test("le prompt système porte l'interdit d'énergie, adossé à sa ceinture", () => {
  const system = buildWeekReviewSystemPrompt({
    doctrineBlock: "== METHOD ==",
    reading: withSessions([trained(WEEK_DATES[0])]),
  });
  assert(/Never state calories, kcal, kilojoules/i.test(system), system);
});

Deno.test("aller-retour jsonb: le compte de séances survit au gel", () => {
  const reading = withSessions([trained(WEEK_DATES[0]), trained(WEEK_DATES[2])]);
  assertEquals(parseWeekReview(JSON.parse(JSON.stringify(reading))), reading);
});

Deno.test("un gel ANTÉRIEUR à ce lot relit `null`, jamais zéro", () => {
  // La raison est la même, mot pour mot, que pour `evidence`: lire un bloc
  // absent à zéro affirmerait « aucune séance cette semaine-là ». C'est aussi
  // ce qui permet d'ajouter le champ sans bumper la version.
  const raw = JSON.parse(JSON.stringify(withSessions([trained(WEEK_DATES[0])])));
  delete raw.activity;
  const round = parseWeekReview(raw);
  assert(round !== null, "un gel sans le bloc doit rester lisible");
  assertEquals(round?.activity, null);
  assertEquals(round?.version, WEEK_REVIEW_FACTS_VERSION);
});

Deno.test("aucune énergie n'entre dans la lecture, quoi qu'on lui donne", () => {
  const reading = withSessions([trained(WEEK_DATES[0]), trained(WEEK_DATES[1])]);
  const serialized = JSON.stringify(reading.activity).toLowerCase();
  for (const forbidden of ["kcal", "calorie", "energy", "burn"]) {
    assert(!serialized.includes(forbidden), `${forbidden} dans le gel: ${serialized}`);
  }
});
