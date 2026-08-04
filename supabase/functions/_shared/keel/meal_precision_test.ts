// PRÉCISION DE REPAS — l'évaluation de complétude et la mise à feu.
//
// Les tests qui portent la doctrine, et qui doivent rester lisibles comme des
// phrases:
//   * « une question de précision ne demande JAMAIS une quantité » — sur les
//     gabarits eux-mêmes, en FR et EN;
//   * « un axe ne manque que si une ligne OUVERTE du jour en dépend » — le
//     contre-factuel: sans plan, sans ligne ouverte, ou avec une ligne déjà
//     résolue, on ne demande rien;
//   * « en crise, on ne demande rien » — la bande de safety ferme avant tout.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  ASSUMPTION_SUBJECT_TO_AXIS,
  assessMealPrecision,
  gateMealPrecisionQuestion,
  MEAL_PRECISION_AXES,
  MEAL_PRECISION_DAILY_CAP,
  MEAL_PRECISION_QUESTIONS,
  type MealPrecisionAssessment,
  type PrecisionPlanLine,
  renderMealPrecisionQuestion,
} from "./meal_precision.ts";
import { ASSUMPTION_SUBJECTS } from "./meal_analysis.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function line(over: Partial<PrecisionPlanLine> = {}): PrecisionPlanLine {
  return {
    commitment_id: "c-1",
    polarity: "do",
    food_group_ref: "non_starchy_veg",
    bucket: "lunch",
    status: "unknown",
    grain: "occasion",
    slot_kind: "nominal",
    ...over,
  };
}

function component(over: Partial<{
  food_group_ref: string | null;
  substance_ref: string | null;
  commitment_id: string | null;
}> = {}) {
  return {
    food_group_ref: null,
    substance_ref: null,
    commitment_id: null,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// LA LIGNE ROUGE — aucune question ne demande une quantité
// ---------------------------------------------------------------------------

/**
 * Le lexique est volontairement LARGE et bilingue. Il ne sert pas à filtrer une
 * sortie de modèle (ce serait une regex de sens); il éprouve NOS PROPRES
 * constantes, qui sont du texte figé. Une garde sur ses propres constantes est
 * exacte par construction.
 */
const QUANTITY_LEXICON = [
  "how much",
  "how many",
  "how big",
  "gram",
  "gramme",
  "kcal",
  "calorie",
  "portion",
  "serving",
  "combien",
  "quantit",
  "poids",
  "weight",
  "grosse",
  "large or small",
];

Deno.test("aucun gabarit de question ne demande une quantité (FR+EN)", () => {
  const rendered = [
    ...Object.values(MEAL_PRECISION_QUESTIONS),
    renderMealPrecisionQuestion("slot", []),
    renderMealPrecisionQuestion("slot", ["lunch", "dinner"]),
    renderMealPrecisionQuestion("slot", ["lunch", "dinner", "snack_pm"]),
  ];
  for (const question of rendered) {
    const normalized = question.toLowerCase();
    for (const forbidden of QUANTITY_LEXICON) {
      assert(
        !normalized.includes(forbidden),
        `la question "${question}" contient le terme de quantité "${forbidden}"`,
      );
    }
    assert(question.trim().endsWith("?"), `"${question}" n'est pas une question`);
    // Anti-interrogatoire: une seule question par gabarit.
    assertEquals(
      question.split("?").length - 1,
      1,
      `"${question}" porte plus d'une question`,
    );
  }
});

Deno.test("l'axe portion n'existe pas — il ne peut donc pas être demandé", () => {
  assert(!(MEAL_PRECISION_AXES as readonly string[]).includes("portion"));
});

Deno.test("chaque sujet d'hypothèse photo a une place dans le vocabulaire unifié", () => {
  // §P5.3: un seul vocabulaire. Un sujet ajouté côté photo sans axe ici casse
  // ce test au lieu de partir en silence.
  for (const subject of ASSUMPTION_SUBJECTS) {
    assert(
      subject in ASSUMPTION_SUBJECT_TO_AXIS,
      `le sujet photo '${subject}' n'a pas d'axe de précision`,
    );
  }
  assertEquals(ASSUMPTION_SUBJECT_TO_AXIS.cooking_fat, "preparation");
  // `other` est le fourre-tout: le mapper de force donnerait une question
  // choisie au hasard.
  assertEquals(ASSUMPTION_SUBJECT_TO_AXIS.other, null);
});

// ---------------------------------------------------------------------------
// LE CONTRE-FACTUEL — les cas où l'on ne demande RIEN
// ---------------------------------------------------------------------------

Deno.test("sans plan du jour, aucune question", () => {
  const result = assessMealPrecision({
    components: [component({ food_group_ref: "poultry" })],
    slotKey: "lunch",
    planLines: [],
  });
  assertEquals(result.primary, null);
  assertEquals(result.reason_code, "no_open_line_depends_on_it");
});

Deno.test("une ligne déjà résolue ne motive plus rien", () => {
  const result = assessMealPrecision({
    components: [component({ food_group_ref: "poultry" })],
    slotKey: "lunch",
    planLines: [line({ status: "met" }), line({ commitment_id: "c-2", status: "missed" })],
  });
  assertEquals(result.primary, null);
  assertEquals(result.reason_code, "no_open_line_depends_on_it");
});

Deno.test("un repas déjà complet ne déclenche pas d'accompagnement", () => {
  // Le protocole attend un légume; l'élève a nommé un légume. Rien à demander.
  const result = assessMealPrecision({
    components: [
      component({ food_group_ref: "poultry" }),
      component({ food_group_ref: "leafy_greens" }),
    ],
    slotKey: "lunch",
    planLines: [
      line({ commitment_id: "veg", food_group_ref: "non_starchy_veg" }),
      line({ commitment_id: "prot", food_group_ref: "lean_protein" }),
    ],
  });
  assertEquals(result.primary, null);
  assertEquals(result.reason_code, "declaration_is_usable");
});

Deno.test("le swap par CLASSE désarme l'accompagnement (brocoli couvre non_starchy_veg)", () => {
  const result = assessMealPrecision({
    components: [component({ food_group_ref: "cruciferous_veg" })],
    slotKey: "lunch",
    planLines: [line({ food_group_ref: "non_starchy_veg" })],
  });
  assertEquals(result.axes.includes("accompaniment"), false);
});

Deno.test("une ligne d'un AUTRE créneau nominal ne motive rien", () => {
  const result = assessMealPrecision({
    components: [component({ food_group_ref: "poultry" })],
    slotKey: "lunch",
    planLines: [line({ bucket: "dinner", food_group_ref: "non_starchy_veg" })],
  });
  assertEquals(result.primary, null);
  assertEquals(result.reason_code, "no_open_line_depends_on_it");
});

Deno.test("une liaison explicite de l'élève désarme la composition", () => {
  // L'élève a désigné lui-même la ligne du plan: lui demander ce qu'il y avait
  // dedans serait lui redemander ce qu'il vient de dire.
  const result = assessMealPrecision({
    components: [component({ commitment_id: "c-1" })],
    slotKey: "lunch",
    planLines: [line()],
  });
  assertEquals(result.axes.includes("composition"), false);
});

Deno.test("une prise de complément n'est pas un repas sous-décrit", () => {
  const result = assessMealPrecision({
    components: [component({ substance_ref: "vitamin_d3" })],
    slotKey: "breakfast",
    planLines: [line({ bucket: "breakfast" })],
  });
  assertEquals(result.axes.includes("composition"), false);
});

// ---------------------------------------------------------------------------
// LES AXES — chacun avec sa mise
// ---------------------------------------------------------------------------

Deno.test("« du poulet » seul, avec une ligne légumes ouverte → accompaniment", () => {
  const result = assessMealPrecision({
    components: [component({ food_group_ref: "poultry" })],
    slotKey: "lunch",
    planLines: [line({ commitment_id: "veg", food_group_ref: "non_starchy_veg" })],
  });
  assertEquals(result.primary, "accompaniment");
  assertEquals(result.depends_on, ["veg"]);
  assertEquals(
    renderMealPrecisionQuestion("accompaniment"),
    "And what did you have with it?",
  );
});

Deno.test("rien de nommé → composition, et toutes les lignes en dépendent", () => {
  const result = assessMealPrecision({
    components: [component()],
    slotKey: "lunch",
    planLines: [line({ commitment_id: "a" }), line({ commitment_id: "b" })],
  });
  assertEquals(result.primary, "composition");
  assertEquals(result.depends_on, ["a", "b"]);
});

Deno.test("une ligne sur la matière grasse et un aliment qui se cuisine → preparation", () => {
  const result = assessMealPrecision({
    components: [component({ food_group_ref: "poultry" })],
    slotKey: "lunch",
    planLines: [line({ commitment_id: "fat", food_group_ref: "olive_oil" })],
  });
  assertEquals(result.axes.includes("preparation"), true);
  assertEquals(result.primary, "preparation");
});

Deno.test("une ligne `avoid friture` compte pour preparation, pas pour accompaniment", () => {
  const result = assessMealPrecision({
    components: [component({ food_group_ref: "poultry" })],
    slotKey: "lunch",
    planLines: [
      line({ commitment_id: "no-fry", polarity: "avoid", food_group_ref: "fried_food" }),
    ],
  });
  assertEquals(result.axes, ["preparation"]);
});

Deno.test("on ne demande pas comment une pomme a été cuite", () => {
  const result = assessMealPrecision({
    components: [component({ food_group_ref: "other_fruit" })],
    slotKey: "snack_pm",
    planLines: [
      line({
        commitment_id: "fat",
        food_group_ref: "olive_oil",
        bucket: "any_time",
        slot_kind: null,
      }),
    ],
  });
  assertEquals(result.axes.includes("preparation"), false);
});

Deno.test("l'huile déjà nommée désarme preparation", () => {
  const result = assessMealPrecision({
    components: [
      component({ food_group_ref: "poultry" }),
      component({ food_group_ref: "olive_oil" }),
    ],
    slotKey: "lunch",
    planLines: [line({ commitment_id: "fat", food_group_ref: "olive_oil" })],
  });
  assertEquals(result.axes.includes("preparation"), false);
});

Deno.test("deux créneaux nominaux atteignables sans créneau nommé → slot", () => {
  const result = assessMealPrecision({
    components: [component({ food_group_ref: "poultry" })],
    slotKey: null,
    planLines: [
      line({ commitment_id: "l", bucket: "lunch", food_group_ref: "lean_protein" }),
      line({ commitment_id: "d", bucket: "dinner", food_group_ref: "lean_protein" }),
    ],
  });
  assertEquals(result.primary, "slot");
  assertEquals(result.slot_candidates, ["lunch", "dinner"]);
  assertEquals(
    renderMealPrecisionQuestion("slot", result.slot_candidates),
    "Which meal was that, lunch or dinner?",
  );
});

Deno.test("un seul créneau candidat ne justifie pas la question de créneau", () => {
  const result = assessMealPrecision({
    components: [component({ food_group_ref: "poultry" })],
    slotKey: null,
    planLines: [
      line({ commitment_id: "l", bucket: "lunch", food_group_ref: "lean_protein" }),
    ],
  });
  assertEquals(result.axes.includes("slot"), false);
});

Deno.test("au-delà de deux candidats, la question de créneau reste ouverte", () => {
  assertEquals(
    renderMealPrecisionQuestion("slot", ["lunch", "dinner", "snack_pm"]),
    "Which meal was that?",
  );
});

Deno.test("l'ordre de priorité est stable: composition avant accompagnement", () => {
  const result = assessMealPrecision({
    components: [component()],
    slotKey: null,
    planLines: [
      line({ commitment_id: "veg", food_group_ref: "non_starchy_veg" }),
      line({ commitment_id: "fat", food_group_ref: "olive_oil" }),
    ],
  });
  assertEquals(result.primary, "composition");
});

// ---------------------------------------------------------------------------
// LE GATE — l'ordre des refus est le contrat
// ---------------------------------------------------------------------------

function assessment(
  over: Partial<MealPrecisionAssessment> = {},
): MealPrecisionAssessment {
  return {
    axes: ["accompaniment"],
    primary: "accompaniment",
    reason_code: "axis_missing",
    depends_on: ["veg"],
    slot_candidates: [],
    ...over,
  };
}

function gate(over: Partial<Parameters<typeof gateMealPrecisionQuestion>[0]> = {}) {
  return gateMealPrecisionQuestion({
    assessment: assessment(),
    safetyBand: "none",
    futureIntent: false,
    committedEventCount: 1,
    questionsAskedToday: 0,
    flowAlreadyOpen: false,
    ...over,
  });
}

Deno.test("le cas nominal pose la question", () => {
  const result = gate();
  assertEquals(result.ask, true);
  assertEquals(result.axis, "accompaniment");
  assertEquals(result.question, "And what did you have with it?");
  assertEquals(result.reason_code, "ask");
});

Deno.test("en crise, on ne demande rien — quelle que soit la bande", () => {
  for (const band of ["low", "medium", "high", "critical"]) {
    const result = gate({ safetyBand: band });
    assertEquals(result.ask, false, `bande ${band}`);
    assertEquals(result.reason_code, "safety_band");
  }
});

Deno.test("la safety ferme AVANT tout le reste", () => {
  // Même avec un axe, un fait committé et zéro question du jour.
  const result = gate({ safetyBand: "high", questionsAskedToday: 0 });
  assertEquals(result.reason_code, "safety_band");
});

Deno.test("une intention future ne se précise pas", () => {
  const result = gate({ futureIntent: true });
  assertEquals(result.ask, false);
  assertEquals(result.reason_code, "future_intent");
});

Deno.test("pas de question sans ligne à préciser", () => {
  const result = gate({ committedEventCount: 0 });
  assertEquals(result.ask, false);
  assertEquals(result.reason_code, "no_committed_fact");
});

Deno.test("le plafond du jour est de deux questions, toutes sources confondues", () => {
  assertEquals(MEAL_PRECISION_DAILY_CAP, 2);
  assertEquals(gate({ questionsAskedToday: 1 }).ask, true);
  assertEquals(gate({ questionsAskedToday: 2 }).ask, false);
  assertEquals(gate({ questionsAskedToday: 2 }).reason_code, "daily_cap_reached");
  assertEquals(gate({ questionsAskedToday: 9 }).reason_code, "daily_cap_reached");
});

Deno.test("un flow déjà ouvert interdit une seconde question", () => {
  const result = gate({ flowAlreadyOpen: true });
  assertEquals(result.ask, false);
  assertEquals(result.reason_code, "flow_already_open");
});

Deno.test("sans axe, aucune question — et le refus est nommé", () => {
  const result = gate({
    assessment: assessment({ axes: [], primary: null, reason_code: "declaration_is_usable" }),
  });
  assertEquals(result.ask, false);
  assertEquals(result.reason_code, "no_axis");
  assertEquals(result.question, null);
});

// ---------------------------------------------------------------------------
// PRÉMISSE FAUSSE / ÉTAT VIDE (passe adversariale §5.2)
// ---------------------------------------------------------------------------

Deno.test("aucun composant du tout: pas de crash, pas de question sans plan", () => {
  const result = assessMealPrecision({
    components: [],
    slotKey: null,
    planLines: [],
  });
  assertEquals(result.primary, null);
  assertEquals(result.reason_code, "no_open_line_depends_on_it");
});

Deno.test("aucun composant, mais une ligne ouverte: c'est une composition", () => {
  const result = assessMealPrecision({
    components: [],
    slotKey: "lunch",
    planLines: [line()],
  });
  assertEquals(result.primary, "composition");
});

Deno.test("un slug de plan hors vocabulaire ne fait pas tomber l'évaluation", () => {
  const result = assessMealPrecision({
    components: [component({ food_group_ref: "poultry" })],
    slotKey: "lunch",
    planLines: [line({ commitment_id: "x", food_group_ref: "epa_dha" })],
  });
  // La classe est inconnue: la ligne ne peut pas être « couverte » par le
  // poulet, donc elle motive un accompagnement. Ce qui compte est qu'on ne
  // jette pas: une donnée de plan sale ne doit pas faire tomber un tour.
  assertEquals(result.primary, "accompaniment");
});

Deno.test("une bande de safety inconnue est traitée comme non nulle", () => {
  // R7: on ne normalise pas en silence vers `none`. Une valeur qu'on ne
  // comprend pas n'est pas une autorisation.
  const result = gate({ safetyBand: "unrecognised_band" });
  assertEquals(result.ask, false);
  assertEquals(result.reason_code, "safety_band");
});

Deno.test("une bande absente ou nulle vaut `none`", () => {
  assertEquals(gate({ safetyBand: null }).ask, true);
  assertEquals(gate({ safetyBand: undefined }).ask, true);
  assertEquals(gate({ safetyBand: "  NONE  " }).ask, true);
});
