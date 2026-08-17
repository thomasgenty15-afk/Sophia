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
  type MemberHabit,
  parseMemberHabits,
  readHabitText,
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
  eatingSlots: null,
  habits: [],
  habitNote: null,
};

const FILS: PortionMember = {
  memberId: "m-fils",
  displayName: "Thomas",
  goal: "muscle_gain",
  ageState: "adult",
  body: null,
  eatingSlots: null,
  habits: [],
  habitNote: null,
};

Deno.test("SANS HABITUDE, LE BRIEF EST CELUI D'AVANT LE LOT G, À L'OCTET PRÈS", () => {
  // ⚠️ LA SECONDE MOITIÉ DE LA GARANTIE D'ADDITIVITÉ. Les fragments sont vides,
  // la conséquence ne sort pas, et rien d'autre n'a bougé: un foyer qui n'a
  // rien déclaré reçoit le prompt d'hier.
  const brief = buildPortionBrief([MERE, FILS], "one_dish", 0);
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
      "WEIGH IT ONCE, INTO NAMED BOXES.",
      "Nobody weighs anything at mealtime. Everything is weighed at the cooking",
      "session, straight into boxes with a name on the lid, and a meal later just",
      'takes its box out. Every preparation you write carries "boxes": one entry',
      "per box, with the exact member_ids it belongs to and its weight in grams of",
      "READY food.",
      "That is 2 people to weigh out on EVERY preparation: Christèle, Thomas.",
      "Count them before you answer — a person missing from a preparation's boxes",
      "is a person standing at the fridge with nothing that says how much.",
      // ── LOT 4C ③ · CE QUE `grams` DÉSIGNE, ET UNE SEULE BOÎTE PAR BOUCHE ─
      // EN REMPLACEMENT des deux lignes de v14, pas en ajout. Treize bouches se
      // sont retrouvées dans deux boîtes de la même casserole, trois dans
      // aucune, et `grams` ne disait pas s'il valait pour une personne ou pour
      // le bac.
      '"grams" is what ONE person takes out, never the size of the tub. Two people',
      "on the same weight share ONE box that lists both ids; when their shares",
      "differ they get one box each. Every name above is in exactly ONE box of each",
      "preparation -- never two, never none.",
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
  const brief = buildPortionBrief([MERE, FILS], "one_dish", 0);
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
  );
  assert(brief.includes("— usually: elle prend son cafe avant"), brief);
  for (const line of HABIT_CONSEQUENCE) {
    assert(!brief.includes(line), `une note seule arme la conséquence: ${line}`);
  }
});
