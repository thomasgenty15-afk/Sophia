// ---------------------------------------------------------------------------
// LOT G — LES HABITUDES D'UNE BOUCHE, ET LE TEMPS QUI DÉCIDE LA FORME
//
// Le défaut mesuré: un plan réel a servi des ŒUFS BROUILLÉS SEPT MATINS
// D'AFFILÉE à une femme qui mange une pomme. Ces tests tiennent les deux moitiés
// de la réparation — le champ qui la range, et la consigne qui la fait honorer.
// ---------------------------------------------------------------------------

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  gateMemberHabits,
  HABIT_CONSEQUENCE,
  HABIT_KINDS,
  HABIT_OCCASION_TOKENS,
  HABIT_SLOTS_MAX,
  HABIT_TEXT_MAX_CHARS,
  habitFragment,
  habitNoteFragment,
  ownMealSlots,
  type MemberHabit,
  parseMemberHabits,
  readHabitText,
  parseMemberLight,
} from "./household_habits.ts";
import { EATING_OCCASIONS } from "./meal_generation.ts";
import { DRAFT_NOTE_MAX_CHARS } from "./plan_draft_note.ts";
import {
  buildPortionBrief,
  cookingShapeLines,
  type PortionMember,
  SEPARATE_DISH_MIN_WEEKLY_MINUTES,
  timeAllowsASecondDish,
  weeklyCookingMinutes,
} from "./household_portions.ts";

// ───────────────────────────────────────────────────────────────────────────
// LA RECOPIE DU VOCABULAIRE — PROUVÉE ÉGALE
// ───────────────────────────────────────────────────────────────────────────

Deno.test("le vocabulaire recopié est EXACTEMENT celui du moteur", () => {
  // ⚠️ CE TEST EST LA CONTREPARTIE D'UNE RECOPIE ASSUMÉE. `household_habits.ts`
  // ne peut PAS importer `meal_generation.ts` — `household_portions.ts` importe
  // les habitudes, et `meal_generation.ts` importe les portions: la boucle se
  // referme et l'évaluation du module jette
  // `Cannot access 'EATING_OCCASIONS' before initialization`. Mesuré: SIX
  // fichiers de test tombés d'un coup, sans qu'aucun typecheck ne le voie.
  //
  // Un test, lui, n'est dans aucun cycle: il importe les deux listes et échoue
  // à la première divergence. Sans lui, la copie serait « une table qui
  // raconte ce que les chaînes disaient le jour où on l'a écrite ».
  assertEquals([...HABIT_OCCASION_TOKENS], [...EATING_OCCASIONS]);
  assertEquals(HABIT_SLOTS_MAX, EATING_OCCASIONS.length);
});

Deno.test("le plafond de texte est CELUI de la note de brouillon, pas un jumeau", () => {
  // Trois lectures du même nombre existent (ici, la garde, et le CHECK en
  // base). Deux d'entre elles sont la MÊME constante; la troisième la cite
  // nommément dans la migration.
  assertEquals(HABIT_TEXT_MAX_CHARS, DRAFT_NOTE_MAX_CHARS);
  assertEquals(HABIT_TEXT_MAX_CHARS, 280);
});

// ───────────────────────────────────────────────────────────────────────────
// LA LECTURE DU JSONB
// ───────────────────────────────────────────────────────────────────────────

Deno.test("LE CAS QUI PASSE — celui de l'utilisateur, mot pour mot", () => {
  // ⚠️ « Une garde a besoin d'un cas qui passe »: une règle qu'on n'a vue que
  // refuser est indiscernable d'une garde cassée. Celui-ci est la ligne exacte
  // que l'écran écrira pour la femme du constat.
  const out = parseMemberHabits([
    { slot: "breakfast", kind: "own_usual", usual: "une pomme" },
  ]);
  assertEquals(out, [{ slot: "breakfast", kind: "own_usual", usual: "une pomme" }]);
});

Deno.test("`own_usual` SANS TEXTE est écarté — sinon le modèle invente", () => {
  // La forme la plus chère du défaut qu'on répare: dire « elle mange autre
  // chose » sans dire quoi fait écrire au modèle ce qu'elle mange.
  assertEquals(parseMemberHabits([{ slot: "breakfast", kind: "own_usual" }]), []);
  assertEquals(
    parseMemberHabits([{ slot: "breakfast", kind: "own_usual", usual: "   " }]),
    [],
  );
});

Deno.test("`household_dish` ne survit pas à la lecture — c'est le défaut", () => {
  // Il existe pour qu'un écran puisse RETIRER une habitude; il n'a rien à dire
  // au prompt, où l'absence de ligne dit déjà « elle mange le plat commun ».
  assertEquals(
    parseMemberHabits([{ slot: "breakfast", kind: "household_dish", usual: "" }]),
    [],
  );
  assertEquals(HABIT_KINDS.length, 2);
});

Deno.test("un moment ou un `kind` inconnu est ÉCARTÉ, les autres survivent", () => {
  // Même posture que `parseAwayDays` / `parseEatingRhythm`: on écarte, on ne
  // devine pas, et une entrée fautive ne fait pas tomber la déclaration.
  const out = parseMemberHabits([
    { slot: "brunch", kind: "own_usual", usual: "un oeuf" },
    { slot: "lunch", kind: "whatever", usual: "une soupe" },
    { slot: "dinner", kind: "own_usual", usual: "une soupe" },
  ]);
  assertEquals(out.length, 1);
  assertEquals(out[0].slot, "dinner");
});

Deno.test("l'ordre rendu est celui de la JOURNÉE, pas celui du tableau reçu", () => {
  const out = parseMemberHabits([
    { slot: "dinner", kind: "own_usual", usual: "une soupe" },
    { slot: "breakfast", kind: "own_usual", usual: "une pomme" },
  ]);
  assertEquals(out.map((h) => h.slot), ["breakfast", "dinner"]);
});

Deno.test("deux entrées pour un même moment: la PREMIÈRE gagne, jamais les deux", () => {
  // Deux fragments contradictoires sur la même ligne de brief seraient pires
  // que l'un des deux: le modèle choisirait, et personne ne saurait lequel.
  const out = parseMemberHabits([
    { slot: "breakfast", kind: "own_usual", usual: "une pomme" },
    { slot: "breakfast", kind: "own_usual", usual: "un croissant" },
  ]);
  assertEquals(out.length, 1);
  assertEquals(out[0].usual, "une pomme");
});

Deno.test("ce qui n'est pas un tableau rend `[]`, jamais une exception", () => {
  for (const raw of [null, undefined, {}, "breakfast", 3]) {
    assertEquals(parseMemberHabits(raw), []);
  }
});

// ───────────────────────────────────────────────────────────────────────────
// LE FRAGMENT DE LIGNE, ET SON MARQUEUR
// ───────────────────────────────────────────────────────────────────────────

Deno.test("le fragment porte le moment ET le texte, dans la langue de la personne", () => {
  assertEquals(
    habitFragment([{ slot: "breakfast", kind: "own_usual", usual: "une pomme" }]),
    " — has their own at breakfast: une pomme",
  );
});

Deno.test("LE MARQUEUR CITÉ PAR LA CONSÉQUENCE EXISTE DANS LA LIGNE", () => {
  // ⚠️ LE DÉFAUT QUE CE TEST EMPÊCHE: la conséquence cite `"has their own"`
  // entre guillemets — exactement comme celle du rythme cite
  // `"eats at ... only"`. Un marqueur cité qui ne figure NULLE PART dans le
  // texte servi est une consigne qui ne s'attache à rien, et rien n'échouerait:
  // un prompt n'a pas de compilateur.
  const line = habitFragment([
    { slot: "breakfast", kind: "own_usual", usual: "une pomme" },
  ]);
  const quoted = HABIT_CONSEQUENCE.join(" ");
  assert(quoted.includes('"has their own"'), quoted);
  assert(line.includes("has their own"), line);
});

Deno.test("plusieurs moments tiennent sur une seule ligne", () => {
  const line = habitFragment([
    { slot: "breakfast", kind: "own_usual", usual: "une pomme" },
    { slot: "snack_pm", kind: "own_usual", usual: "un yaourt" },
  ]);
  assertEquals(
    line,
    " — has their own at breakfast: une pomme; at the afternoon snack: un yaourt",
  );
});

Deno.test("aucune habitude ⇒ aucun fragment, et c'est le cas majoritaire", () => {
  assertEquals(habitFragment([]), "");
  assertEquals(habitNoteFragment(null), "");
  assertEquals(habitNoteFragment("   "), "");
});

// ───────────────────────────────────────────────────────────────────────────
// LA GARDE DE TEXTE — EMPRUNTÉE, DANS LES DEUX LANGUES
// ───────────────────────────────────────────────────────────────────────────

Deno.test("une CIBLE CHIFFRÉE est refusée — la garde du brouillon, réutilisée", () => {
  for (const raw of ["30 g de proteine le matin", "200 kcal at breakfast"]) {
    const out = readHabitText({ raw, doctrineForbidden: [], restrictionFlag: false });
    assertEquals(out.usable, null, raw);
    assertEquals(out.refusal, "numeric_target", raw);
  }
});

Deno.test("SOUS PLANCHER TCA, la langue de la métrique est refusée — les DEUX langues", () => {
  // ⚠️ « Garde testée dans une seule langue » est une cicatrice de ce dépôt, et
  // le produit sort en français par défaut (`profiles.locale`). Les deux formes
  // ci-dessous sont MESURÉES, pas supposées.
  for (const raw of ["perte de poids le matin", "I skip breakfast to lose weight"]) {
    const out = readHabitText({ raw, doctrineForbidden: [], restrictionFlag: true });
    assertEquals(out.usable, null, raw);
    assertEquals(out.refusal, "restriction_floor", raw);
  }
  // …et HORS plancher, la même phrase passe: le plancher est une protection
  // ciblée, pas une censure de tout le monde.
  assertEquals(
    readHabitText({
      raw: "perte de poids le matin",
      doctrineForbidden: [],
      restrictionFlag: false,
    }).refusal,
    null,
  );
});

Deno.test("TROU MESURÉ ET NON REFERMÉ: `maigrir` traverse la garde d'ENTRÉE", () => {
  // ⚠️ CE TEST DOCUMENTE UN DÉFAUT, IL NE LE CÉLÈBRE PAS. Mesuré le
  // 2026-08-14: sous plancher TCA, « perte de poids » et « lose weight » sont
  // refusés, « maigrir » ne l'est PAS — il n'est pas dans
  // `FORBIDDEN_METRIC_TERMS` (`nutrition_lexicon.ts`), que
  // `plan_draft_note.ts::restrictionTerms` est seul à lire.
  //
  // CE N'EST PAS UN TROU DES HABITUDES: la même phrase traverse déjà la note de
  // reprise de plan, sur les deux lanes, depuis que cette garde existe. Le
  // réparer veut dire toucher le lexique partagé, ce qui re-stampe le
  // comportement de trois appelants — un lot à part, nommé et laissé ouvert.
  //
  // La ceinture de SORTIE, elle, connaît `maigrir`
  // (`FORBIDDEN_PORTION_TERMS`): ce qui entre n'est donc pas ce qui peut
  // ressortir. Le jour où ce test devient rouge, la garde d'entrée a été
  // réparée — retire-le, ne l'inverse pas.
  const out = readHabitText({
    raw: "je saute le petit-dejeuner pour maigrir",
    doctrineForbidden: [],
    restrictionFlag: true,
  });
  assertEquals(out.refusal, null);
});

Deno.test("LE CAS QUI PASSE SOUS PLANCHER: une pomme reste une pomme", () => {
  // Le plancher TCA ne doit pas refuser une habitude ordinaire, sinon la
  // personne protégée est aussi la seule qu'on ne sait pas nourrir.
  const out = readHabitText({
    raw: "une pomme",
    doctrineForbidden: [],
    restrictionFlag: true,
  });
  assertEquals(out.refusal, null);
  assertEquals(out.usable, "une pomme");
});

Deno.test("UNE CLAUSE TOMBÉE FAIT TOMBER LE TEXTE — pas d'habitude amputée", () => {
  // ⚠️ L'ÉCART ASSUMÉ AVEC `readDraftNote`, qui recolle les clauses gardées.
  // Sur une note de reprise c'est le bon arbitrage; sur une habitude DURABLE,
  // un texte tronqué se relirait chaque semaine sans que personne sache qu'il
  // l'est.
  const out = readHabitText({
    raw: "Une pomme. Et 30 g de proteine.",
    doctrineForbidden: [],
    restrictionFlag: false,
  });
  assertEquals(out.usable, null);
  assertEquals(out.refusal, "numeric_target");
});

Deno.test("`gateMemberHabits` NOMME ce qu'il coupe — jamais un filtre muet", () => {
  const out = gateMemberHabits({
    habits: [
      { slot: "breakfast", kind: "own_usual", usual: "une pomme" },
      { slot: "dinner", kind: "own_usual", usual: "500 kcal max" },
    ] as MemberHabit[],
    // ⚠️ « 300 g de riz » NE serait PAS refusé, et c'est juste: une quantité
    // d'ALIMENT n'est pas une cible nutritionnelle (`findNumericTarget` fait
    // exactement cette distinction). La note fautive doit en être une vraie.
    note: "200 kcal maximum",
    doctrineForbidden: [],
    restrictionFlag: false,
  });
  assertEquals(out.kept.length, 1);
  assertEquals(out.kept[0].slot, "breakfast");
  assertEquals(out.note, null);
  assert(out.issues.some((i) => i.startsWith("habit_withheld:dinner:")), out.issues.join("|"));
  assert(out.issues.some((i) => i.startsWith("habit_note_withheld:")), out.issues.join("|"));
});

Deno.test("`gateMemberHabits` — RIEN à dire ne produit AUCUNE trace", () => {
  const out = gateMemberHabits({
    habits: [],
    note: null,
    doctrineForbidden: [],
    restrictionFlag: false,
  });
  assertEquals(out.kept, []);
  assertEquals(out.note, null);
  assertEquals(out.issues, []);
});

// ───────────────────────────────────────────────────────────────────────────
// G5 — LE TEMPS PLAFONNE
// ───────────────────────────────────────────────────────────────────────────

Deno.test("le temps hebdomadaire est jours × durée de SESSION", () => {
  // ⚠️ `cooking_time_min` EST PAR SESSION, vérifié le 2026-08-14 sur trois
  // sources: le prompt (« time per cooking session »), la garde d'intégrité
  // (qui compare la durée au total d'UNE session), et l'écran (six durées de
  // session, 30 min à 3 h). Si ce champ devenait un total hebdomadaire, cette
  // multiplication serait fausse d'un facteur `cookDays.length`.
  assertEquals(weeklyCookingMinutes({ cookDays: ["sun", "wed"], cookingTimeMin: 90 }), 180);
  assertEquals(weeklyCookingMinutes({ cookDays: ["sun"], cookingTimeMin: 60 }), 60);
});

Deno.test("`null` n'est PAS zéro — on ne sait pas, donc on ne refuse pas", () => {
  // Le seuil existe pour refuser une promesse qu'un budget DÉCLARÉ ne tient
  // pas, jamais pour punir un foyer qui n'a pas vu la question.
  assertEquals(weeklyCookingMinutes({ cookDays: [], cookingTimeMin: 90 }), null);
  assertEquals(weeklyCookingMinutes({ cookDays: ["sun"], cookingTimeMin: null }), null);
  assertEquals(weeklyCookingMinutes({ cookDays: ["sun"], cookingTimeMin: 0 }), null);
  assert(timeAllowsASecondDish(null));
});

Deno.test("le seuil est 90 min, et il mord AU-DESSOUS seulement", () => {
  assertEquals(SEPARATE_DISH_MIN_WEEKLY_MINUTES, 90);
  assert(!timeAllowsASecondDish(60), "1 h par semaine ⇒ plat unique");
  assert(timeAllowsASecondDish(90), "le seuil lui-même PASSE");
  assert(timeAllowsASecondDish(180), "le foyer du constat (2 × 90) passe largement");
});

// ───────────────────────────────────────────────────────────────────────────
// G5 — LA LIGNE DE FORME, GÉNÉRALISÉE SANS TOUCHER À LA FUSION
// ───────────────────────────────────────────────────────────────────────────

Deno.test("UNE FUSION REND LA LIGNE DE FORME D'HIER, À L'OCTET PRÈS", () => {
  // ⚠️ LA CONTRAINTE CENTRALE DU LOT G. Une fusion reprend UNE personne, jamais
  // deux: elle passe donc `1`, et doit retomber sur le texte du singulier —
  // celui écrit pour elle, et mesuré sur elle.
  const singular = cookingShapeLines("one_session", 1).join("\n");
  assert(singular.includes("ONE person below cannot be"), singular);
  assert(singular.includes("Two dishes at"), singular);
  assertEquals(cookingShapeLines("one_session", 0).join("\n"), singular);
  assertEquals(
    cookingShapeLines("one_dish", 0).join("\n"),
    "Cook ONE set of preparations for everyone. Do NOT propose separate dishes.",
  );
  // ③ n'a pas de pluriel: il reste RÉSERVÉ à la fusion.
  assertEquals(
    cookingShapeLines("separate_sessions", 1),
    cookingShapeLines("separate_sessions", 3),
  );
});

Deno.test("À DEUX DIVERGENTS, « ONE person » devient FAUX et le texte change", () => {
  // C'était vrai d'une fusion, faux d'une composition. Servi à trois personnes
  // dont les directions s'opposent, le singulier promet UN plat de plus.
  const many = cookingShapeLines("one_session", 2).join("\n");
  assert(!many.includes("ONE person below"), many);
  assert(many.includes("SOME of the people below"), many);
  assert(many.includes("one per person"), many);
});

// ───────────────────────────────────────────────────────────────────────────
// LE BRIEF — CE QUI ENTRE, ET CE QUI N'ENTRE PAS
// ───────────────────────────────────────────────────────────────────────────

const MERE: PortionMember = {
  memberId: "m-mere",
  displayName: "Christèle",
  goal: "maintenance",
  ageState: "adult",
  body: null,
  lightSlots: [],
  eatingSlots: null,
  habits: [],
  habitNote: null,
  requiredDensity: null,
};

const FILS: PortionMember = {
  memberId: "m-fils",
  displayName: "Thomas",
  goal: "muscle_gain",
  ageState: "adult",
  body: null,
  lightSlots: [],
  eatingSlots: null,
  habits: [],
  habitNote: null,
  requiredDensity: null,
};

Deno.test("SANS HABITUDE, LE BRIEF EST CELUI D'AVANT LE LOT G, À L'OCTET PRÈS", () => {
  // ⚠️ LA SECONDE MOITIÉ DE LA GARANTIE D'ADDITIVITÉ. Les fragments sont vides,
  // la conséquence ne sort pas, et rien d'autre n'a bougé: un foyer qui n'a
  // rien déclaré reçoit le prompt d'hier.
  const brief = buildPortionBrief([MERE, FILS], "one_dish", 0, 1, "legacy_measure");
  assertEquals(
    brief,
    [
      "HOUSEHOLD SERVING PLAN — one cooking session, portions that differ.",
      "Cook ONE set of preparations for everyone. Do NOT propose separate dishes.",
      "For each person below, give a short serving instruction: how much of which",
      "component goes on their plate, and which side is added or dropped.",
      // ── LOT 4C ② (2026-08-17) · LE CHIFFRE DANS LA CONSIGNE ──────────────
      // Le sujet du test n'a toujours pas changé — « sans habitude, aucun
      // fragment d'habitude » — et les deux lignes de membres plus bas le
      // prouvent toujours. Ces quatre lignes sont servies à TOUT foyer, à une
      // bouche comme à six: 93 notes réelles ne portaient aucun gramme, et
      // c'est la consigne qui manquait, pas le vocabulaire de la ceinture.
      "Every one of those instructions carries a number and a unit: 150 g of the",
      "chicken, 80 g of dry pasta, 2 tbsp of the sauce. All 2 of them, not some.",
      '"A standard portion", "a balanced share", "take your box" tell nobody how',
      "much to put on a plate: write the grams, even when a box already holds them.",
      "",
      "- Christèle: balanced share of every component",
      "- Thomas: larger protein and starch share, same vegetables",
      "",
      // ── LOT 4 (2026-08-17) · CE QUE CETTE ATTENTE A GAGNÉ, ET POURQUOI ────
      // Le sujet du test n'a pas changé — « sans habitude, aucun fragment
      // d'habitude » — et les deux lignes de membres au-dessus le prouvent
      // toujours. Ce qui s'ajoute est le protocole des boîtes, qui est servi à
      // TOUT foyer d'au moins deux bouches (`boxingOrderLines`) et n'a rien à
      // voir avec les habitudes. Le byte-identique « d'avant le LOT G » se lit
      // désormais « d'avant le LOT G, protocole des boîtes compris ».
      // ⚠️ ET IL EST AVANT LES TROIS DERNIÈRES LIGNES, jamais après: l'interdit
      // du « pourquoi » reste la dernière chose lue, et c'est précisément quand
      // le brief se met à porter des nombres par personne que ça compte.
      "WEIGH IT ONCE, INTO BOXES NAMED BY MEAL.",
      "Nobody weighs anything at mealtime. Everything is weighed at the cooking",
      "session, straight into containers, and a meal later just takes its box out.",
      // ── v4 (2026-08-20) · UN CONTENANT PAR GROUPE ───────────────────────
      // La clé passe au pluriel, et l'unité est le GROUPE: chaque bouche à
      // objectif seule, puis tout le reste ensemble.
      'Every dish that takes from a preparation carries "boxes": one container per',
      "GROUP of people eating that meal, each holding everything that group takes",
      "out -- all its preparations together in the same box, not one tub per pan.",
      "That is 2 people to place at every such meal: Christèle, Thomas. Each of",
      "them who eats that meal is named on EXACTLY one of that meal's boxes --",
      "never two, never none.",
      // ── LA RÈGLE DE GROUPEMENT, AVEC LES PRÉNOMS ────────────────────────
      // Thomas vise une prise de muscle: il a sa boîte. Christèle se maintient
      // (`goal: null` sur MERE), donc elle est « tout le reste ».
      "These people each get a box of their OWN, alone on the lid: Thomas.",
      "Everyone else who eats that meal shares ONE box, named with all of them.",
      // ── LES DEUX GRAMMES, ET C'EST TOUTE LA SPEC v4 ─────────────────────
      // ⛔ « Give every share of a meal the SAME ordinary figure » et
      // « "grams" is what THAT person takes out of the box » ONT DISPARU: elles
      // décrivaient une part par personne dans un bac partagé, c'est-à-dire la
      // balance de retour au service, très exactement ce qui a tué v2.
      "When ONE name is on the lid, its grams are that person's portion: they open",
      "it and eat, and nothing is weighed at the table.",
      "When SEVERAL names are on the lid, its grams are how much goes IN the tub for",
      "all of them together. That number aims at nobody: never split it per person,",
      "never write a figure next to a name on a shared lid.",
      // ── 2026-08-19 · LE DÉROULÉ NE PORTE PLUS DE GRAMMES ────────────────
      // Mesuré à l'écran: « répartir six portions de 450 g » sur un foyer de
      // DEUX — un grammage qui ne nommait aucun aliment et ne correspondait à
      // aucune boîte. L'interdit existait pour `member_portions` seulement.
      // Ces cinq lignes sont servies à TOUT foyer, comme les quatre du 4C ②.
      "The cooking session run_through is the ORDER of the gestures, and nothing",
      "else: no weights, no gram figures, no portion counts. Those live in the",
      "boxes, where each one already carries the name of what is in it and whose",
      "it is. A weight written in the run_through names no food and matches no",
      'lid — say "portion it into the named boxes" and let the boxes speak.',
      "A line in member_portions is NOT a box. It is a sentence read aloud at the",
      "table; a box has a weight and a name on it, and it is what stops the weighing",
      "from happening again at every meal. Writing the serving instruction instead",
      "of the boxes leaves the household weighing at every meal, which is the one",
      "thing this plan exists to prevent.",
      "",
      "NEVER state a reason, a goal, a calorie count or anything about a person's",
      "body in these instructions. They are read aloud at the table by the whole",
      "household. Write what to serve, never why.",
    ].join("\n"),
  );
});

Deno.test("L'HABITUDE ENTRE SUR SA LIGNE, ET SA CONSÉQUENCE EST DITE UNE FOIS", () => {
  // ⚠️ LE DÉFAUT MESURÉ, PRIS PAR LES DEUX BOUTS: le FAIT sans la CONSÉQUENCE
  // produit exactement le plan d'origine — le modèle lit « elle a son
  // habitude » et sert le plat du matin quand même.
  const brief = buildPortionBrief(
    [
      {
        ...MERE,
        habits: [{ slot: "breakfast", kind: "own_usual", usual: "une pomme" }],
      },
      FILS,
    ],
    "one_dish",
    0,
    1,
  "legacy_measure",
  );
  assert(
    brief.includes(
      "- Christèle: balanced share of every component — has their own at breakfast: une pomme",
    ),
    brief,
  );
  assert(brief.includes("do NOT serve them the table's"), brief);
  assert(brief.includes("count their own thing in the"), brief);
  // Et l'autre bouche n'est pas marquée: la personne qui n'a rien dit mange le
  // plat de la maison, sans qu'une ligne l'énonce.
  assert(brief.includes("- Thomas: larger protein and starch share, same vegetables\n"), brief);
});

Deno.test("SANS PERSONNE DE MARQUÉE, la conséquence N'EST PAS énoncée", () => {
  // ⚠️ MÊME DISCIPLINE QUE `anyBodyFacts` / `anyRhythm`: une consigne « quand
  // quelqu'un a son habitude… » servie à un foyer où personne n'en a apprend au
  // modèle qu'il existe un marquage, et l'invite à en inventer un.
  const brief = buildPortionBrief([MERE, FILS], "one_dish", 0, 1, "legacy_measure");
  for (const line of HABIT_CONSEQUENCE) {
    assert(!brief.includes(line), `la conséquence sort sans prémisse: ${line}`);
  }
});

Deno.test("LA LIGNE LIBRE N'ARME PAS LA CONSÉQUENCE — elle ne marque personne", () => {
  // Une note dit une tendance; elle ne dispense pas du plat commun. Énoncer la
  // conséquence pour elle ferait retirer un repas à quelqu'un qui n'a rien
  // demandé.
  const brief = buildPortionBrief(
    [{ ...MERE, habitNote: "elle prend son cafe avant" }, FILS],
    "one_dish",
    0,
    1,
  "legacy_measure",
  );
  assert(brief.includes("— usually: elle prend son cafe avant"), brief);
  for (const line of HABIT_CONSEQUENCE) {
    assert(!brief.includes(line), `une note seule arme la conséquence: ${line}`);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// 2026-08-19 — UN REPAS DÉCLARÉ À SOI EST UN PLAT, ET IL A UNE PLACE.
//
// ── LE DÉFAUT, MESURÉ SUR LE RUN DE 19h03 ─────────────────────────────────
// Une bouche déclare « à midi, ma salade froide ». Le brief le dit au modèle,
// et le modèle obéit: SIX salades, une par déjeuner. Aucune n'atteint l'écran.
// Seul un écart de RÉGIME rendait porteur de plat, donc: pas de clé
// `for_member_id` dans le schéma, et surtout aucune place dans le budget.
// 24 plats écrits, plafond à 18, les six siennes coupées en silence.
// « Elle est où la salade froide de thon ? »
// ═══════════════════════════════════════════════════════════════════════════

Deno.test("⛔ `ownMealSlots` et la phrase du brief lisent la MÊME chose", () => {
  const habits = [
    { slot: "lunch", kind: "own_usual", usual: "une salade froide" },
    { slot: "dinner", kind: "household_dish", usual: "" },
    // ⚠️ UN TEXTE VIDE N'EST PAS UNE DÉCLARATION. Le compter ouvrirait un
    // budget de plats pour un repas que personne n'a décrit.
    { slot: "breakfast", kind: "own_usual", usual: "   " },
  ] as const;
  assertEquals(ownMealSlots(habits), ["lunch"]);
  // LA GARANTIE QUI COMPTE: la phrase et la décision ne peuvent pas diverger.
  // C'est très exactement ce désaccord-là qui a produit le défaut.
  const said = habitFragment(habits);
  assertEquals(said.includes("lunch"), true);
  assertEquals(said.includes("breakfast"), false);
  assertEquals(ownMealSlots(habits).length > 0, said !== "");
});

Deno.test("⚠️ LE CAS QUI PASSE — sans repas à soi, aucun moment, aucune phrase", () => {
  // Le chemin MAJORITAIRE. Sans ce cas, une règle qui rendrait tout le monde
  // porteur de plat ressemblerait trait pour trait à la règle juste — et
  // ouvrirait un budget de plats dédiés pour un foyer qui n'en veut aucun.
  const habits = [{ slot: "dinner", kind: "household_dish", usual: "" }] as const;
  assertEquals(ownMealSlots(habits), []);
  assertEquals(habitFragment(habits), "");
  assertEquals(ownMealSlots([]), []);
});

Deno.test("⛔ la consigne RÉCLAME le plat et nomme sa clé", () => {
  const said = HABIT_CONSEQUENCE.join(" ");
  // Sans la demande, le modèle écrivait le plat quand même — mais rien ne lui
  // faisait de place, et rien ne lui disait à qui l'attribuer.
  assert(said.includes("for_member_id"), `la clé n'est pas nommée: ${said}`);
  assert(/dish of its own/i.test(said), "le plat n'est pas réclamé");
  // ⚠️ ET LES DEUX MOITIÉS D'ORIGINE RESTENT. « Cook for the others as usual »
  // empêche le modèle de retirer le moment à TOUTE LA TABLE; la ligne des
  // courses empêche que sa salade ne soit achetée par personne.
  assert(said.includes("Cook for the others as usual"));
  assert(said.includes("shopping list"));
});

// ===========================================================================
// ⟳ 2026-09-10 — LE SECOND LECTEUR DES EXTRAS A ÉTÉ SUPPRIMÉ
//
// ⛔ NEUF CAS ONT DISPARU D'ICI. `parseMemberExtras` lisait
// `household_member_habits.slots[].extras` — les cinq jetons de ce qui était
// pris À CÔTÉ du plat — pour les retrancher de la cible du repas. Décision
// produit du 2026-09-10: le plan dimensionne les aliments qu'il prévoit.
//
// ⚠️ LA COLONNE N'EST PAS TOUCHÉE, ET LES RÉPONSES DÉJÀ ÉCRITES Y RESTENT.
// C'est la LECTURE qui est retirée; c'est ce qui suffit à les neutraliser, et
// le cas ci-dessous le prouve: le parseur du « léger », qui lit la MÊME
// colonne, continue de fonctionner sur une entrée qui porte encore des extras.
// ===========================================================================

Deno.test("⛔ UNE ENTRÉE QUI PORTE ENCORE DES EXTRAS SE LIT SANS EUX", () => {
  // Une ligne d'avant ce lot. Le parseur du léger la lit; celui de la prose la
  // lit; personne ne lit `extras`, et rien ne casse.
  const slots = [
    { slot: "dinner", kind: "own_usual", usual: "du poisson", extras: ["bread"], light: true },
  ];
  assertEquals(parseMemberLight(slots), { dinner: true });
  assertEquals(parseMemberHabits(slots).map((h) => h.usual), ["du poisson"]);
  // Et le module n'exporte plus de lecteur d'extras.
  const src = Deno.readTextFileSync(
    new URL("./household_habits.ts", import.meta.url),
  );
  assert(
    !src.includes("parseMemberExtras"),
    "`parseMemberExtras` est revenue dans household_habits.ts",
  );
});

// ---------------------------------------------------------------------------
// ⟳ 2026-09-04 · LE BRIEF DE SERVICE N'INVITE PLUS À ÉCRIRE UN ÉCHANGE
// ---------------------------------------------------------------------------

Deno.test("⛔ le brief ne dit plus « the swaps »: un échange est une BOÎTE", () => {
  // ── POURQUOI CE MOT NE PEUT PAS RESTER ────────────────────────────────
  // Le bloc de régime ordonne désormais qu'un échange soit une seconde entrée
  // dans `boxes`, et dit en toutes lettres « never a portion_note, never a dish
  // of its own ». Cette ligne-ci invitait le modèle à écrire « the swaps » DANS
  // l'instruction de service, c'est-à-dire dans `member_portions` — exactement
  // l'échappatoire que l'autre bloc ferme.
  //
  // ⛔ DEUX ORDRES CONTRADICTOIRES DANS UN SEUL PROMPT: ce dépôt a mesuré
  // lequel gagne, et c'est toujours celui qu'on ne relit pas. Le plat dédié en
  // a fait les frais onze fois sur douze.
  //
  // ⚠️ LA BRANCHE N'EST ATTEINTE QU'À PARTIR DE DEUX GROUPES PESÉS
  // (`weightGroups >= 2`): c'est là que le moteur dimensionne, donc là que la
  // phrase remplace le gramme. Un `1` ne rend pas ces lignes du tout — et une
  // assertion posée sur un brief à un seul groupe resterait verte quoi qu'on
  // écrive dans la branche.
  const sized = buildPortionBrief([MERE, FILS], "one_dish", 0, 2, "legacy_measure");
  assert(
    sized.includes("the manner, the order, the sides and the care"),
    "la branche des deux groupes n'a pas été atteinte: le test ne mesure rien\n" +
      sized,
  );
  assertEquals(
    sized.includes("the swaps"),
    false,
    "le brief de service réinvite le modèle à écrire les échanges dans " +
      "`member_portions`, pendant que le bloc de régime les lui interdit",
  );
});

// ---------------------------------------------------------------------------
// « CE MOMENT-LÀ PÈSE MOINS QUE D'HABITUDE » — 2026-09-07
// ---------------------------------------------------------------------------

Deno.test("`light` se lit sur les trois repas, et le premier gagne", () => {
  assertEquals(
    parseMemberLight([
      { slot: "dinner", kind: "household_dish", usual: "", light: true },
      { slot: "breakfast", light: false },
    ]),
    { dinner: true, breakfast: false },
  );
  // Deux entrées d'un même moment sont une erreur d'écrivain: en fusionner les
  // réponses inventerait une déclaration que personne n'a faite.
  assertEquals(
    parseMemberLight([{ slot: "lunch", light: true }, { slot: "lunch", light: false }]),
    { lunch: true },
  );
});

Deno.test("⛔ LES TROIS ÉTATS NE SE CONFONDENT PAS: absent ≠ false ≠ true", () => {
  // C'est tout le lot. Un écran qui confond « pas posé » et « répondu non »
  // repose la question à quelqu'un qui a déjà répondu.
  assertEquals(parseMemberLight([{ slot: "dinner", kind: "own_usual", usual: "x" }]), {});
  assertEquals(parseMemberLight([{ slot: "dinner", light: false }]), { dinner: false });
  assertEquals(parseMemberLight([{ slot: "dinner", light: true }]), { dinner: true });
});

Deno.test("une COLLATION ne se marque pas légère — la lecture refuse ce que la base refuse", () => {
  // Une collation pèse déjà 0,10 de la journée; la marquer légère demanderait
  // au plan de composer ~40 kcal. La contrainte SQL le refuse aussi: si les
  // deux divergeaient, la plus permissive des deux déciderait.
  assertEquals(parseMemberLight([{ slot: "snack_pm", light: true }]), {});
  assertEquals(parseMemberLight([{ slot: "before_bed", light: true }]), {});
  assertEquals(parseMemberLight([{ slot: "snack_am", light: true }]), {});
});

Deno.test("seul un VRAI booléen compte — « yes », 1 et « true » sont écartés", () => {
  assertEquals(parseMemberLight([{ slot: "dinner", light: "yes" }]), {});
  assertEquals(parseMemberLight([{ slot: "dinner", light: 1 }]), {});
  assertEquals(parseMemberLight([{ slot: "dinner", light: "true" }]), {});
  assertEquals(parseMemberLight([{ slot: "dinner", light: null }]), {});
});

Deno.test("une entrée SANS PROSE porte quand même son `light`", () => {
  // ⚠️ LE CAS QUI SÉPARE LES DEUX PARSEURS. `parseMemberHabits` écarte cette
  // même entrée, et c'est correct pour lui: elle n'a rien à dire au modèle.
  const slots = [{ slot: "dinner", kind: "household_dish", usual: "", light: true }];
  assertEquals(parseMemberLight(slots), { dinner: true });
  assertEquals(parseMemberHabits(slots), []);
});

Deno.test("une forme illisible rend `{}`, jamais une exception", () => {
  assertEquals(parseMemberLight(null), {});
  assertEquals(parseMemberLight("light"), {});
  assertEquals(parseMemberLight([null, "light", 3, { slot: "dinner", light: true }]), {
    dinner: true,
  });
});
