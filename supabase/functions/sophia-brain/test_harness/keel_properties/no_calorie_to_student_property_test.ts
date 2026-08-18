/**
 * PROPERTY — no energy figure WITHOUT A BASIS ever reaches a student.
 *
 * ⚠️ THE INVARIANT WAS TURNED OVER ON 2026-08-12 (FF-059). It used to read "no
 * energy figure ever reaches a student", full stop. It was not deleted, and it
 * was not weakened by accident — the human decision of 2026-08-12 says calories
 * ARE displayed, and `CALORIE_REVERSAL.md` §5 says this test flips rather than
 * disappears. What replaces the ban is a strictly narrower one:
 *
 * THE INVARIANT:
 *
 *   For every model output, every plate, every binding and every rendering
 *   path, no student-facing string produced by KEEL contains an energy or macro
 *   quantity. Not as a field, not in prose, not "roughly", not "internally for
 *   the trend".
 *
 *   The one figure that may reach a student lives in a TYPED FIELD THAT CARRIES
 *   ITS BASIS, and today there is exactly one such basis: `plan_quantities` —
 *   the quantities the product itself WROTE into the plan, recomputed into raw
 *   grams by the parser (MAPE 2,3 %). It is a CALCULATION, and it travels as an
 *   integer in a field, never as a sentence. Layer 4 below is what makes that
 *   claim testable rather than a promise.
 *
 * WHAT DID NOT CHANGE, AND MUST NOT: the PHOTO path. `energy_estimate` with its
 * `photo_estimate` basis (−26,6 % bias, systematic, worst on the biggest meals)
 * is a different chantier, and FF-059 does not open it. Layers 1 to 3 below are
 * untouched, and they are the reason a photo still cannot produce a number.
 *
 * WHY IT IS A HARD LINE AND NOT A PREFERENCE. `docs/keel/PHOTO_QUANTIFICATION.md`
 * measured our own model on our own payload: photo-only calorie estimation is
 * biased -26.6 %, systematically, in the same direction, and WORST on the
 * biggest meals — so a student in surplus reads a reassuring number. Weekly
 * aggregation divides that error by 1.04; deltas are 2.5x worse than levels.
 * The number would not be noisy, it would be wrong in a specific and flattering
 * direction. On top of that, 73 % of eating-disorder patients report a calorie
 * tracker contributed to their disorder (Levinson 2017 — note the "83 %" in the
 * 2025 review is a miscitation, do not propagate it). CONTRACT non-input #4
 * settles it: a photo may evidence presence / composition / portion / serving,
 * never energy or macros, and calorie counts are never displayed as facts.
 *
 * WHAT KEEL SAYS INSTEAD: an ordinal portion band (small / moderate / large /
 * unclear). The token IS the error bar, which is why it needs no number.
 *
 * FOUR LAYERS ARE CHECKED HERE, because one of them alone proves nothing:
 *   1. INGESTION — `stripMeasurementFacts` deletes measurement fields and
 *      redacts quantified prose, whatever shape the model invents.
 *   2. RENDER — the acknowledgement, the slot reminder and the Sunday digest
 *      add no number of their own. Note the shape of that claim: they add none.
 *      A dose the COACH wrote travels verbatim (R2), and since 2026-07-28
 *      nothing degrades it — see the flipped property near the end of this file.
 *   3. TYPE — `MealAnalysis` has no field that could carry one.
 *   4. BASIS (FF-059) — every shape that CAN carry a kcal also carries its
 *      basis, the composer's prompt still forbids the model from writing one,
 *      and the gate chain closes before any number is computed. This is the
 *      layer the product decision buys, and `CALORIE_REVERSAL.md` §5 asks for
 *      it in those words.
 */

import { numericNutritionTargetPatterns } from "../../../_shared/keel/nutrition_lexicon.ts";
import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { fromFileUrl } from "https://deno.land/std@0.208.0/path/mod.ts";

import {
  type MealAnalysis,
  MEAL_ANALYSIS_PROMPT_VERSION,
  PORTION_BANDS,
  parseMealAnalysis,
  renderMealPhotoAck,
  resolveMealPhotoBinding,
  stripMeasurementFacts,
} from "../../../_shared/keel/meal_analysis.ts";
import {
  renderCoachSafetyNote,
  renderSlotReminder,
  renderSundayDigest,
} from "../../../_shared/keel/render.ts";

// ---------------------------------------------------------------------------
// The detector — one place, used by every layer below
// ---------------------------------------------------------------------------

/**
 * A quantified energy or macro claim in student-facing prose.
 *
 * QUATRIÈME COPIE, SUPPRIMÉE. Cette propriété est la plus transverse du dépôt
 * — « aucun chiffre d'énergie ni de macro n'atteint un élève » — et sa liste
 * était 100 % anglaise. Le jour où le produit répond en français, elle serait
 * devenue aveugle sur « 38 g de protéines »: une propriété verte qui ne
 * regarde plus rien, ce qui est pire que pas de propriété du tout.
 *
 * Elle délègue maintenant à l'union EN+FR. Le principe qu'elle protège ne
 * bouge pas: il faut un CHIFFRE à côté du mot. « une assiette riche en
 * protéines » reste licite et doit le rester — un détecteur qui bannirait le
 * vocabulaire forcerait le produit à être muet plutôt qu'honnête.
 */
function assertNoCalorieFigure(text: string, context: string): void {
  for (const pattern of numericNutritionTargetPatterns()) {
    assertEquals(
      pattern.re.test(text),
      false,
      `${context}: an energy/macro quantity reached a student surface (${pattern.name}) -> ${JSON.stringify(text)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// LAYER 1 — ingestion
// ---------------------------------------------------------------------------

/**
 * Field names a model invents for the same forbidden thing. The parser
 * normalizes keys (camelCase split, non-alphanumerics collapsed), so this
 * corpus is the property: shape does not matter, the quantity is gone.
 */
const MEASUREMENT_FIELD_NAMES: readonly string[] = [
  "calories",
  "Calories",
  "total_calories",
  "totalKcal",
  "energy",
  "energy_kcal",
  "estimated_calories",
  "macros",
  "macro_protein",
  "macronutrients",
  "protein_g",
  "carbs",
  "carbohydrates",
  "fat_grams",
  "fiber_mg",
  "sodium",
  "nutrition_facts",
  "nutritionalInfo",
  "nutrients",
];

Deno.test("PROPERTY: every measurement field name is deleted and recorded, at any depth", () => {
  for (const field of MEASUREMENT_FIELD_NAMES) {
    for (
      const shape of [
        { [field]: 812 },
        { detected_foods: [{ label: "salmon", [field]: 412 }] },
        { analysis: { nested: { deeper: { [field]: "about 900" } } } },
      ]
    ) {
      const { value, dropped } = stripMeasurementFacts(shape);
      assertEquals(
        JSON.stringify(value).includes(field),
        false,
        `field "${field}" survived: ${JSON.stringify(value)}`,
      );
      assertEquals(
        dropped.length >= 1,
        true,
        `field "${field}" was dropped silently — the audit trail is the ` +
          `difference between enforcing the contract and hiding a violation`,
      );
    }
  }
});

Deno.test("PROPERTY: quantified energy prose is redacted wherever it hides", () => {
  const claims = [
    "That is roughly 850 calories.",
    "About 900 kcal on the plate.",
    "Around 620 calories, maybe more with the oil.",
    "protein: 42 g, fat 30g",
    "~750 kcal",
    "Approximately 1,200 calories for the day.",
    // ── FR, AJOUTÉ LE 2026-08-12 (FF-059) ─────────────────────────────────
    // Le détecteur délègue déjà à l'union EN+FR de `nutrition_lexicon`, et le
    // commentaire de tête le dit — mais le CORPUS de ce test était 100 %
    // anglais, donc rien ne prouvait que la moitié française mordait. La
    // cicatrice `guard-tested-in-one-language-only` dit exactement ça: une
    // garde passait par accident de grammaire, et personne ne l'a vu parce
    // qu'aucun cas ne l'exerçait dans l'autre langue.
    //
    // « environ 600 kcal » est LA phrase du §8 de FF-059, mot pour mot: la
    // décision du 2026-08-12 ouvre le chiffre dans un CHAMP TYPÉ, et ferme
    // définitivement la porte de la prose. Elle se teste donc dans la langue
    // dans laquelle elle a été écrite.
    "Ça fait environ 600 kcal.",
    "À peu près 850 calories dans l'assiette.",
    "Autour de 620 calories, un peu plus avec l'huile.",
    "protéines : 42 g, lipides 30g",
    "Environ 1 200 calories sur la journée.",
  ];
  for (const claim of claims) {
    for (
      const shape of [
        { portion_rationale: claim },
        { commitment_matches: [{ commitment_id: "c1", rationale: claim }] },
        { notes: [claim] },
      ]
    ) {
      const { value } = stripMeasurementFacts(shape);
      assertNoCalorieFigure(JSON.stringify(value), "stripMeasurementFacts");
    }
  }
});

Deno.test("PROPERTY: non-quantified nutrition vocabulary is NOT redacted (disarm condition)", () => {
  // A belt states when it does not fire. Banning the words too would push the
  // product from honest to mute, which is a different failure, not a safer one.
  const kept = [
    "A protein-rich plate with plenty of fibre.",
    "High in fat, low in vegetables.",
    "Half the plate is non-starchy veg.",
  ];
  for (const text of kept) {
    const { value, dropped } = stripMeasurementFacts({ portion_rationale: text });
    assertEquals((value as { portion_rationale: string }).portion_rationale, text);
    assertEquals(dropped.length, 0);
  }
});

Deno.test("PROPERTY: a full model payload stuffed with calories parses clean", () => {
  const raw = JSON.stringify({
    detected_foods: [
      { label: "grilled salmon", food_group_ref: "fatty_fish", confidence: 0.9, calories: 412 },
      { label: "roast potatoes", food_group_ref: "starchy_veg", confidence: 0.8, kcal: 260 },
    ],
    food_groups_present: ["fatty_fish", "starchy_veg"],
    food_groups_absent: [],
    portion: { band: "large", rationale: "A large plate, roughly 850 calories in total." },
    commitment_matches: [
      {
        commitment_id: "c_fish",
        verdict: "consistent",
        rationale: "Salmon present, about 40 g of protein.",
        confidence: 0.9,
      },
    ],
    overall_confidence: 0.85,
    image_quality: "clear",
    total_calories: 850,
    macros: { protein_g: 40, fat_g: 30, carbs_g: 55 },
  });

  const analysis = parseMealAnalysis(raw, ["c_fish"]);
  const serialized = JSON.stringify(analysis);
  assertNoCalorieFigure(serialized, "parseMealAnalysis output");
  assertEquals(
    analysis.dropped_measurement_fields.length >= 3,
    true,
    `the drops must be auditable, got ${JSON.stringify(analysis.dropped_measurement_fields)}`,
  );
  // The ordinal survives — that is the whole trade: no number, a band.
  assertEquals(analysis.portion_band, "large");
  assertEquals(analysis.prompt_version, MEAL_ANALYSIS_PROMPT_VERSION);
});

// ---------------------------------------------------------------------------
// LAYER 2 — render
// ---------------------------------------------------------------------------

const VERDICTS = ["consistent", "partial", "inconsistent", "not_visible"] as const;
const QUALITIES = ["clear", "partial", "unusable"] as const;
const BANDS = ["low", "moderate", "high"] as const;

function analysisFor(args: {
  verdicts: readonly (typeof VERDICTS)[number][];
  portionBand: (typeof PORTION_BANDS)[number];
  imageQuality: (typeof QUALITIES)[number];
  confidenceBand: (typeof BANDS)[number];
}): MealAnalysis {
  return {
    detected_foods: [
      { label: "grilled salmon", food_group_ref: "fatty_fish", confidence: 0.9 },
      { label: "roast potatoes", food_group_ref: "starchy_veg", confidence: 0.7 },
    ],
    food_groups_present: ["fatty_fish", "starchy_veg"],
    food_groups_absent: [],
    portion_band: args.portionBand,
    portion_rationale: "A generously filled plate.",
    commitment_matches: args.verdicts.map((verdict, i) => ({
      commitment_id: `c${i + 1}`,
      verdict,
      rationale: "visible on the plate",
      confidence: 0.8,
    })),
    // PIVOT P0.3: les deux champs du contrat v3. La propriété testée par ce
    // fichier — AUCUN chiffre calorique n'atteint l'élève — doit tenir AVEC
    // eux, puisqu'ils portent de la prose libre issue du modèle.
    assumptions: [
      {
        subject: "cooking_fat",
        assumption: "The potatoes were probably roasted in oil.",
        basis: "standard_default",
      },
    ],
    clarifying_question: "Did you use any oil on those potatoes?",
    overall_confidence: 0.8,
    confidence_band: args.confidenceBand,
    image_quality: args.imageQuality,
    // Un repas réellement servi: c'est le cas où le rendu est le plus bavard,
    // donc celui où un chiffre aurait le plus d'occasions de fuir. Les trois
    // refus (`not_food`, `food_not_eaten`, `unreadable`) sont couverts par
    // `meal_analysis_test.ts`, qui vérifie qu'aucun ne porte de chiffre.
    subject_kind: "eaten_meal",
    rejected_commitment_ids: [],
    dropped_measurement_fields: [],
    issues: [],
    prompt_version: MEAL_ANALYSIS_PROMPT_VERSION,
  };
}

Deno.test("PROPERTY: the photo acknowledgement never carries a quantity, over the whole product", () => {
  const titles = {
    c1: "Fatty fish 3x per week",
    c2: "Cruciferous veg 2 servings/day",
    c3: "Protein at every main meal",
  };
  let combinations = 0;
  const verdictSets: (typeof VERDICTS)[number][][] = [
    [],
    ["consistent"],
    ["consistent", "consistent"],
    ["consistent", "partial", "inconsistent"],
    ["inconsistent"],
    ["not_visible", "not_visible"],
  ];

  for (const verdicts of verdictSets) {
    for (const portionBand of PORTION_BANDS) {
      for (const imageQuality of QUALITIES) {
        for (const confidenceBand of BANDS) {
          for (const explicit of [null, "c1"]) {
            const analysis = analysisFor({
              verdicts,
              portionBand,
              imageQuality,
              confidenceBand,
            });
            const binding = resolveMealPhotoBinding({
              analysis,
              explicitCommitmentId: explicit,
            });
            const text = renderMealPhotoAck({
              analysis,
              binding,
              credit: null,
              commitmentTitles: titles,
              // ROUGE PREEXISTANT (hors chantier i18n): `hasPrescription` et
              // `tickedDish` sont REQUIS depuis que le rendu a cesse de deduire
              // « pas de prescription » d'un `commitmentTitles` vide. Les deux cas
              // ici portent une prescription et ne cochent rien.
              hasPrescription: true,
              tickedDish: null,
              locale: "en",
            });
            combinations += 1;
            assertNoCalorieFigure(text, "renderMealPhotoAck");
            // No percentage either: the confidence NUMBER never reaches the
            // student, only the band exists for that.
            assertEquals(
              /\d+\s*%/.test(text),
              false,
              `a percentage reached the student: ${text}`,
            );
            assertEquals(
              /\b0\.\d+\b/.test(text),
              false,
              `a raw confidence value reached the student: ${text}`,
            );
          }
        }
      }
    }
  }
  assertEquals(combinations, verdictSets.length * 4 * 3 * 3 * 2);
});

Deno.test("PROPERTY: an ambiguous plate credits nothing and says so", () => {
  // The cardinality half of the honesty rule, on the photo path: two evidenced
  // lines bind NOTHING, and the acknowledgement must not name them as counted.
  const analysis = analysisFor({
    verdicts: ["consistent", "consistent"],
    portionBand: "moderate",
    imageQuality: "clear",
    confidenceBand: "high",
  });
  const binding = resolveMealPhotoBinding({ analysis, explicitCommitmentId: null });
  assertEquals(binding.kind, "ambiguous");
  const text = renderMealPhotoAck({
    analysis,
    binding,
    credit: null,
    commitmentTitles: { c1: "Fatty fish 3x per week", c2: "Protein at every main meal" },
    hasPrescription: true,
    tickedDish: null,
    locale: "en",
  });
  assertEquals(text.includes("Counted toward"), false, text);
  assertStringIncludes(text, "tell me which one to count");
});

Deno.test("PROPERTY: slot reminders and the Sunday digest introduce no number of their own", () => {
  // Digit-free inputs on purpose: the assertion below is that the RENDERER
  // introduces no number of its own. A coach title that reads "Vitamin D3" is
  // the coach's content and travels verbatim (R2) — that is not KEEL producing
  // a quantity, and conflating the two would make this property untestable.
  const reminder = renderSlotReminder({
    slotKey: "breakfast",
    locale: "en",
    commitments: [
      { title: "Vitamin D", studentInstruction: "with food" },
      { title: "Cruciferous veg", studentInstruction: null },
    ],
  });
  assertNoCalorieFigure(reminder, "renderSlotReminder");
  assertEquals(
    /\d/.test(reminder),
    false,
    `the reminder invented a digit from calorie-free inputs: ${reminder}`,
  );
  // No score, no streak, no percentage: the evaluator's output never travels
  // on this surface.
  for (const banned of ["%", "streak", "adherence", "score"]) {
    assertEquals(reminder.toLowerCase().includes(banned), false, banned);
  }

  const digest = renderSundayDigest({
    locale: "en",
    studentFirstName: "Dan",
    weekStartDate: "2026-08-03",
    commitments: [
      {
        title: "Protein at every main meal",
        scheduledDays: ["mon", "wed", "fri"],
        requiredDaysPerWeek: null,
        slotKey: "any_meal",
        priority: "core",
      },
      {
        title: "Fatty fish",
        scheduledDays: null,
        requiredDaysPerWeek: 3,
        slotKey: null,
        priority: "secondary",
      },
    ],
  });
  assertNoCalorieFigure(digest, "renderSundayDigest");
  for (const banned of ["%", "streak", "adherence", "score", "calorie"]) {
    assertEquals(digest.toLowerCase().includes(banned), false, `${banned} in digest`);
  }
});

Deno.test("PROPERTY: a supplement DOSE is not a calorie figure — it travels intact", () => {
  // THE FLIPPED TEST (2026-07-28). This slot used to hold "the degraded
  // provenance path shows the student no dose at all": a 5000 IU line above the
  // 4000 IU UL was rewritten for the student as a food-first suggestion with
  // the number removed. The gate is gone — the coach is the prescriber — so the
  // property to hold is the one that was being violated by the gate itself.
  //
  // THIS DOES NOT WEAKEN THE CALORIE INVARIANT, and the distinction is the
  // whole point of the file. The harm measured in PHOTO_QUANTIFICATION.md is a
  // number KEEL ESTIMATED being shown as a fact. A prescribed dose is neither
  // estimated nor ours: it is the coach's sentence, and hiding it from the
  // person who has to take it is a safety problem of its own.
  const reminder = renderSlotReminder({
    slotKey: "breakfast",
    locale: "en",
    commitments: [{
      title: "Vitamin D3 5000 IU",
      studentInstruction: "Take 5000 IU of D3 with your breakfast fat.",
    }],
  });
  assertStringIncludes(reminder, "5000 IU");
  // Still no ENERGY or MACRO quantity, on this surface as on every other.
  assertNoCalorieFigure(reminder, "renderSlotReminder (dosed line)");

  // And the coach-only note carries the fact without touching the prescription.
  const note = renderCoachSafetyNote({ kind: "above_upper_limit", ulLabel: "4000 IU/day" });
  assertStringIncludes(note, "4000 IU/day");
  assertNoCalorieFigure(note, "renderCoachSafetyNote");
});

// ---------------------------------------------------------------------------
// LAYER 3 — the type itself
// ---------------------------------------------------------------------------

/**
 * Structural, not behavioural: the acknowledgement cannot print a calorie it has
 * no field to hold. This reads the source because that is the only way to
 * assert the ABSENCE of a field — and if someone adds `energy_kcal` to
 * `MealAnalysis` to "keep it internally for the trend", this is the test that
 * stops it. `PHOTO_QUANTIFICATION.md` closes that door explicitly: an internal
 * number that only feeds a trend produces a false trend.
 */
Deno.test("PROPERTY: the MealAnalysis interface carries no energy or macro field", () => {
  const source = Deno.readTextFileSync(
    fromFileUrl(new URL("../../../_shared/keel/meal_analysis.ts", import.meta.url)),
  );
  const start = source.indexOf("export interface MealAnalysis {");
  assertEquals(start >= 0, true, "MealAnalysis interface not found — did it move?");
  // Comments are stripped first: the interface DOCUMENTS the ban
  // ("dropped_measurement_fields: paths of calorie/macro fields this parser
  // deleted"), and a checker that reads its own doctrine as a violation is
  // useless. Only declarations are inspected.
  const body = source
    .slice(start, source.indexOf("\n}", start))
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  for (
    const banned of [
      "calorie",
      "kcal",
      "energy",
      "macro_",
      "protein_",
      "carb_",
      "fat_",
    ]
  ) {
    assertEquals(
      body.toLowerCase().includes(banned),
      false,
      `MealAnalysis grew a "${banned}" field — a photo never produces an energy ` +
        `or macro fact (CONTRACT non-input #4), not even internally`,
    );
  }
  // The ordinal replacement is there, and stays there.
  assertStringIncludes(body, "portion_band: PortionBand;");
});

// ---------------------------------------------------------------------------
// LAYER 4 — the basis (FF-059)
//
// This is the layer the 2026-08-12 decision buys. Layers 1-3 prove a photo
// produces no number; they say nothing about the one number that IS allowed.
// What follows is the shape of that permission, and it is deliberately narrow:
// a typed field that carries its basis, computed AFTER the model wrote the
// plan, behind four gates, never in a sentence.
// ---------------------------------------------------------------------------

/** Read a source file next to `_shared/keel/`, comments stripped. */
function keelSource(file: string): string {
  return Deno.readTextFileSync(
    fromFileUrl(new URL(`../../../_shared/keel/${file}`, import.meta.url)),
  );
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

Deno.test("PROPERTY: every shape that can carry a kcal also carries its basis", () => {
  // Structural, like layer 3, and for the same reason: this asserts the
  // PRESENCE of a field on every output shape, which no behavioural test can do
  // for shapes that do not exist yet. If someone adds a fourth energy shape
  // without a `basis`, this is what stops it.
  const source = stripComments(keelSource("plan_energy.ts"));
  for (const shape of ["DishEnergy", "DayEnergy", "PlanEnergy"]) {
    const start = source.indexOf(`export interface ${shape} {`);
    assertEquals(start >= 0, true, `${shape} not found — did it move?`);
    const body = source.slice(start, source.indexOf("\n}", start));
    assertStringIncludes(
      body,
      "basis:",
      `${shape} can hold a kcal and does not carry its basis — that is exactly ` +
        `the naked number CALORIE_REVERSAL forbids`,
    );
  }
  // And there is exactly ONE basis on this path. A second value would be a
  // choice, and the whole point is that the plan's quantities are not a choice:
  // the product wrote them.
  assertStringIncludes(source, 'export const PLAN_ENERGY_BASIS = "plan_quantities"');
});

Deno.test("PROPERTY: the composer's prompt still forbids the model from writing a number", () => {
  // THE RABBIT HOLE OF FF-059, IN ONE TEST. The figure is COMPUTED from the
  // quantities, after generation, by a table. It is never something the model
  // says. Opening the prompt would re-open the hallucinated number — with a
  // basis stamped on it, which is worse than the ban it replaced.
  const prompt = keelSource("meal_generation.ts");
  for (
    const line of [
      "No calories.",
      "No macro grams.",
      "No percentages of anything nutritional.",
    ]
  ) {
    assertStringIncludes(
      prompt,
      line,
      `the composer's prompt lost "${line}" — FF-059 computes the figure from ` +
        `the plan's quantities and never asks the model for one`,
    );
  }
});

Deno.test("PROPERTY: a closed gate sends no number at all", () => {
  // Not "the client hides it": the response has nothing in it. This reads the
  // edge function's refusal helper, because the property is an ABSENCE and the
  // only way to assert an absence is to look at the shape that produces it.
  const fn = stripComments(
    Deno.readTextFileSync(
      fromFileUrl(new URL("../../../meal-energy-v1/index.ts", import.meta.url)),
    ),
  );
  const start = fn.indexOf("function closed(");
  assertEquals(start >= 0, true, "the refusal helper moved — re-read this guard");
  const body = fn.slice(start, fn.indexOf("\n}", start));
  for (const banned of ["kcal", "plans", "basis", "dishes", "days"]) {
    assertEquals(
      body.includes(banned),
      false,
      `a closed gate leaks "${banned}" — a refusal must carry a reason and ` +
        `nothing else, or the number is one devtools tab away`,
    );
  }
  // Every refusal names itself. A bare `false` cannot be told apart from a
  // guard that never ran.
  assertStringIncludes(body, "show: false");
  assertStringIncludes(body, "reason");
});

Deno.test("PROPERTY: the target reaches a generator ONLY through the gate, and only as grams (R6, retourné le 2026-08-18)", () => {
  // ══════════════════════════════════════════════════════════════════════════
  // R6 — RETOURNÉ, PAS SUPPRIMÉ. Décision produit de l'utilisateur, 2026-08-18,
  // écrite dans `docs/keel/CALORIE_REVERSAL.md` §7.
  // ══════════════════════════════════════════════════════════════════════════
  //
  // L'invariant d'origine était: « aucune cible n'atteint un générateur ». Il
  // portait la phrase de `energy_target.ts` — « un plan qui vise un chiffre est
  // un régime chiffré ». Cette phrase est renversée: la cible contraint
  // désormais les GRAMMAGES, et rien d'autre.
  //
  // L'invariant devient donc, et c'est plus étroit, pas plus large:
  //
  //   ① la cible n'atteint un générateur QUE par la porte `canSizeFromTarget`,
  //      qui n'a qu'un seul appelant relu (`_shared/keel/household_portions.ts`);
  //   ② aucun générateur ne touche à la FOURCHETTE affichée (`maintenanceRange`)
  //      ni aux INTERRUPTEURS d'affichage (`canShowTarget`) — masquer un chiffre
  //      ne doit pas changer le dîner, et une fourchette est une surface de
  //      lecture, pas une entrée de composition;
  //   ③ la cible elle-même ne connaît toujours aucun objectif.
  //
  // ⚠️ ET LE CAS QUI PASSE EST ASSERTÉ (dernier bloc). Sans lui, ce test
  // resterait vert sur un lot L8 entièrement débranché — c'est-à-dire qu'il
  // ressemblerait trait pour trait à une garde qui marche.
  //
  // Cherché sur les TROIS générateurs, parce qu'un seul oublié suffit.
  for (
    const fn of [
      "generate-meal-v1",
      "generate-household-meal-v1",
      "generate-week-plan-v1",
    ]
  ) {
    const source = stripComments(
      Deno.readTextFileSync(
        fromFileUrl(new URL(`../../../${fn}/index.ts`, import.meta.url)),
      ),
    );
    for (
      const banned of [
        "energy_target",
        "maintenanceRange",
        "canShowTarget",
        // ⛔ LA PORTE NE S'ASSEMBLE PAS DANS UN GÉNÉRATEUR. Un générateur qui
        // appellerait la chaîne lui-même en choisirait les entrées — c'est-à-dire
        // qu'il choisirait de quel ÂGE et de quel PLANCHER il se sert. La porte a
        // UN appelant relu, et il est pur.
        "canSizeFromTarget",
        "energySafetyGates",
      ]
    ) {
      assertEquals(
        source.includes(banned),
        false,
        `${fn} touche à "${banned}" — depuis le renversement du 2026-08-18 la ` +
          `cible dimensionne les GRAMMAGES, et elle le fait par ` +
          `\`memberTargetFactor\` / \`sizeBoxesFromTarget\` (purs, gardés), ` +
          `jamais en assemblant la chaîne ni en lisant la fourchette affichée.`,
      );
    }
  }
  // Et la cible elle-même ne connaît aucun objectif: c'est une MAINTENANCE, pas
  // un déficit. Un déficit dérivé serait une prescription à quelqu'un que
  // personne n'a examiné. ⚠️ CE BLOC N'EST PAS RENVERSÉ: ce qui a changé est ce
  // que le GÉNÉRATEUR a le droit de faire, pas ce que cette fonction calcule.
  const target = stripComments(keelSource("energy_target.ts"));
  for (const banned of ["fat_loss", "muscle_gain", "deficit", "remaining"]) {
    assertEquals(target.includes(banned), false, `energy_target.ts: "${banned}"`);
  }

  // ── LE CAS QUI PASSE — la porte EST franchie, et à un seul endroit ───────
  // ⚠️ SANS CE BLOC, LES DEUX PRÉCÉDENTS SONT VERTS SUR UN LOT MORT. Un test qui
  // n'énumère que des interdits reste vert quand le lot qu'il encadre n'existe
  // plus: c'est la forme la plus chère du défaut, mesurée deux fois cette
  // semaine sur ce chantier.
  const sizing = stripComments(keelSource("household_portions.ts"));
  assertEquals(
    sizing.includes("canSizeFromTarget("),
    true,
    "le dimensionnement par la cible ne passe plus par la porte — soit le lot " +
      "L8 a été débranché, soit quelqu'un a déplacé l'appel hors du module pur.",
  );
  assertEquals(
    sizing.includes("energySafetyGates("),
    true,
    "la chaîne ①②③ n'est plus évaluée par bouche dans le module de portions " +
      "(clause C8): sans elle, la porte ② se referme sur le verdict du compte " +
      "maître, et un enfant de douze ans est dimensionné parce que son parent " +
      "est adulte.",
  );
});

Deno.test("PROPERTY: the gate chain is the only door, and gate ① has no key", () => {
  // The single most expensive failure of this chantier would be a number
  // reaching a student under `restriction_flag`. Two structural facts hold it:
  // the floor is read FIRST, and its branch takes no other argument.
  const gate = stripComments(keelSource("energy_gate.ts"));
  const floor = gate.indexOf("input.restrictionFlag)");
  const minor = gate.indexOf("weekPlanAgeGate(");
  const doctrine = gate.indexOf('input.coachCounting === "no_counting"');
  const student = gate.indexOf("!input.studentSwitch");
  assertEquals(floor >= 0 && minor > floor && doctrine > minor && student > doctrine, true, [
    "the four gates are no longer in order — the order IS the contract:",
    "a student under the TCA floor whose coach also counts must be told",
    "nothing, and must be recorded as `restriction_floor`, not as their",
    "coach's decision.",
  ].join(" "));

  // And nothing else in the product may decide this. One caller, one door.
  const callers: string[] = [];
  for (
    const dir of [
      new URL("../../../_shared/keel/", import.meta.url),
      new URL("../../../", import.meta.url),
    ]
  ) {
    for (const entry of Deno.readDirSync(fromFileUrl(dir))) {
      if (!entry.isFile && !entry.isDirectory) continue;
      const path = fromFileUrl(new URL(entry.name, dir));
      const files = entry.isDirectory
        ? (() => {
          try {
            return [...Deno.readDirSync(path)]
              .filter((f) => f.isFile && f.name.endsWith(".ts"))
              .map((f) => `${path}/${f.name}`);
          } catch {
            return [];
          }
        })()
        : entry.name.endsWith(".ts")
        ? [path]
        : [];
      for (const file of files) {
        // La garde elle-même, et les TESTS. Un test n'est pas un appelant au
        // sens de cette propriété: il ne peut mettre aucun chiffre devant
        // personne. Les compter ferait rougir ce test à chaque banc ajouté,
        // c'est-à-dire qu'on finirait par le désarmer pour avoir la paix.
        if (file.endsWith("energy_gate.ts") || file.endsWith("_test.ts")) continue;
        let text: string;
        try {
          text = stripComments(Deno.readTextFileSync(file));
        } catch {
          continue;
        }
        if (text.includes("canShowEnergy(")) callers.push(file.split("/").slice(-2).join("/"));
      }
    }
  }
  assertEquals(
    callers.sort(),
    ["meal-energy-v1/index.ts"],
    "someone else calls canShowEnergy — every extra caller is another place " +
      "the four gates can be assembled wrongly",
  );
});
