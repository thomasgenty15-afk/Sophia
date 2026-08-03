/**
 * PROPERTY — no calorie figure ever reaches a student.
 *
 * THE INVARIANT:
 *
 *   For every model output, every plate, every binding and every rendering
 *   path, no student-facing string produced by KEEL contains an energy or macro
 *   quantity. Not as a field, not in prose, not "roughly", not "internally for
 *   the trend".
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
 * THREE LAYERS ARE CHECKED HERE, because one of them alone proves nothing:
 *   1. INGESTION — `stripMeasurementFacts` deletes measurement fields and
 *      redacts quantified prose, whatever shape the model invents.
 *   2. RENDER — the acknowledgement, the slot reminder and the Sunday digest
 *      add no number of their own. Note the shape of that claim: they add none.
 *      A dose the COACH wrote travels verbatim (R2), and since 2026-07-28
 *      nothing degrades it — see the flipped property near the end of this file.
 *   3. TYPE — `MealAnalysis` has no field that could carry one.
 */

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
 * A quantified energy or macro claim in student-facing prose. Requires a DIGIT
 * next to the word: "a protein-rich plate" is fine and must stay fine, because
 * a detector that also bans the vocabulary would force the product mute rather
 * than honest.
 */
const CALORIE_PROSE = [
  /\d[\d.,]*\s*(kcal|calories|calorie|cals?)\b/i,
  /(kcal|calories|calorie)\s*[:=]?\s*\d/i,
  /\d[\d.,]*\s*(g|gr|grams?|mg)\s*(of\s+)?(protein|carbs?|carbohydrates?|fat|fats|fibre|fiber|sugar|sodium)\b/i,
  /(protein|carbs?|carbohydrates?|fat|fibre|fiber|sugar|sodium)\s*[:=]?\s*\d[\d.,]*\s*(g|gr|grams?|mg)\b/i,
];

function assertNoCalorieFigure(text: string, context: string): void {
  for (const pattern of CALORIE_PROSE) {
    assertEquals(
      pattern.test(text),
      false,
      `${context}: an energy/macro quantity reached a student surface -> ${JSON.stringify(text)}`,
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
    overall_confidence: 0.8,
    confidence_band: args.confidenceBand,
    image_quality: args.imageQuality,
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
