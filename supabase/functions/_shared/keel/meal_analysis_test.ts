// KEEL W5 — meal_analysis.ts.
//
// The two tests that carry the contract are named for it:
//   * "rejects a matched_commitment_id that is not in the day's plan"
//     -- CONTRACT: a hallucinated uuid would write an evaluation on an
//        arbitrary line of somebody's protocol (`recognized.commitment_id` is
//        the evaluator's explicit binding).
//   * "throws away calories / macros the model returns anyway"
//     -- CONTRACT non-input #4: a photo never produces an energy or macro fact.
//
// Both assert the POSITIVE (the value is gone) AND the audit trail (we can say
// what was removed). A filter whose deletions are invisible is indistinguishable
// from a filter that never ran.

import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";

import {
  buildMealAnalysisPrompt,
  buildRecognizedPayload,
  confidenceBand,
  creditedCommitmentIds,
  FOOD_GROUP_CLASSES,
  type MealAnalysisCommitmentContext,
  MEAL_ANALYSIS_PROMPT_VERSION,
  MEAL_ANALYSIS_SYSTEM_PROMPT,
  mealDisqualification,
  parseMealAnalysis,
  renderMealPhotoAck,
  resolveFoodGroupCredit,
  resolveMealPhotoBinding,
  stripMeasurementFacts,
  studentBindingIn,
} from "./meal_analysis.ts";

const ID_A = "11111111-1111-1111-1111-111111111111";
const ID_B = "22222222-2222-2222-2222-222222222222";
const ID_GHOST = "99999999-9999-9999-9999-999999999999";

function commitment(
  over: Partial<MealAnalysisCommitmentContext> = {},
): MealAnalysisCommitmentContext {
  return {
    id: ID_A,
    title: "Protocol breakfast (eggs + oats + berries)",
    student_instruction: null,
    polarity: "do",
    activity_class: "nutrition",
    slot_key: "breakfast",
    measure: "composition",
    unit: null,
    target_op: "any",
    target_min: null,
    target_max: null,
    food_group_ref: null,
    substance_ref: null,
    evaluation_grain: "occasion",
    autonomy: "swap_within_policy",
    priority: "core",
    content: { composition: ["eggs", "oats", "berries"] },
    ...over,
  };
}

function modelOutput(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    detected_foods: [
      { label: "porridge oats", food_group_ref: "whole_grain", confidence: 0.93 },
    ],
    food_groups_present: ["whole_grain"],
    food_groups_absent: ["berries"],
    portion: { band: "moderate", rationale: "The bowl is two thirds full." },
    commitment_matches: [
      {
        commitment_id: ID_A,
        verdict: "partial",
        rationale: "Oats present, berries missing.",
        confidence: 0.85,
      },
    ],
    overall_confidence: 0.87,
    image_quality: "clear",
    // Un modèle qui suit le prompt répond à la PREMIÈRE question. L'absence de
    // ce champ est elle-même testée (« subject_kind: absent … »), donc le
    // fixture par défaut représente le cas nominal.
    subject_kind: "eaten_meal",
    ...over,
  };
}

// ---------------------------------------------------------------------------
// FILTER 1 — anti-hallucination (THE test the mission asks for)
// ---------------------------------------------------------------------------

Deno.test("anti-hallucination: a commitment_id outside the day's plan is rejected", () => {
  const analysis = parseMealAnalysis(
    modelOutput({
      commitment_matches: [
        { commitment_id: ID_A, verdict: "consistent", rationale: "ok", confidence: 0.9 },
        {
          commitment_id: ID_GHOST,
          verdict: "consistent",
          rationale: "invented",
          confidence: 0.99,
        },
      ],
    }),
    [ID_A, ID_B],
  );

  // The ghost never reaches the matches...
  assertEquals(analysis.commitment_matches.map((m) => m.commitment_id), [ID_A]);
  // ...and it is not silently dropped either: it is named, once.
  assertEquals(analysis.rejected_commitment_ids, [ID_GHOST]);
  assert(analysis.issues.some((i) => i.includes(ID_GHOST)));
});

Deno.test("anti-hallucination: a rejected id can never become the binding", () => {
  // The failure mode this guards: the ghost is the ONLY 'consistent' match, so
  // an unfiltered pipeline would bind `recognized.commitment_id` to a line the
  // student was never prescribed, and the evaluator would grade it.
  const analysis = parseMealAnalysis(
    modelOutput({
      commitment_matches: [
        {
          commitment_id: ID_GHOST,
          verdict: "consistent",
          rationale: "invented",
          confidence: 0.99,
        },
      ],
    }),
    [ID_A],
  );
  const binding = resolveMealPhotoBinding({ analysis });
  assertEquals(binding.kind, "none");

  const payload = buildRecognizedPayload({ analysis, binding, model: "m" });
  assertEquals(payload.commitment_id, undefined);
  assertEquals(payload.rejected_commitment_ids, [ID_GHOST]);
});

Deno.test("anti-hallucination: an empty allowlist rejects every match", () => {
  const analysis = parseMealAnalysis(modelOutput(), []);
  assertEquals(analysis.commitment_matches, []);
  assertEquals(analysis.rejected_commitment_ids, [ID_A]);
});

Deno.test("anti-hallucination: duplicate ids are collapsed, not double-counted", () => {
  const analysis = parseMealAnalysis(
    modelOutput({
      commitment_matches: [
        { commitment_id: ID_A, verdict: "consistent", rationale: "a", confidence: 0.9 },
        { commitment_id: ID_A, verdict: "inconsistent", rationale: "b", confidence: 0.9 },
      ],
    }),
    [ID_A],
  );
  assertEquals(analysis.commitment_matches.length, 1);
  assertEquals(analysis.commitment_matches[0].verdict, "consistent");
  assert(analysis.issues.some((i) => i.includes("duplicate")));
});

Deno.test("an unreadable verdict is dropped, never defaulted to consistent", () => {
  const analysis = parseMealAnalysis(
    modelOutput({
      commitment_matches: [
        { commitment_id: ID_A, verdict: "looks_good", rationale: "", confidence: 1 },
      ],
    }),
    [ID_A],
  );
  assertEquals(analysis.commitment_matches, []);
  assertEquals(resolveMealPhotoBinding({ analysis }).kind, "none");
  assert(analysis.issues.some((i) => i.includes("looks_good")));
});

// ---------------------------------------------------------------------------
// FILTER 2 — measurement (THE other test the mission asks for)
// ---------------------------------------------------------------------------

Deno.test("measurement filter: calories and macros are thrown away and recorded", () => {
  const analysis = parseMealAnalysis(
    modelOutput({
      calories: 640,
      energy_kcal: 640,
      macros: { protein_g: 32, carbs: 60, fat: 21 },
      nutrition_facts: { fiber: 8 },
      estimated_calories: "600-700",
    }),
    [ID_A],
  );

  const serialized = JSON.stringify(analysis);
  // The values are gone from the parsed analysis, whole.
  assert(!serialized.includes("640"), "calorie value survived the filter");
  assert(!serialized.includes("protein_g"), "macro key survived the filter");
  assert(!serialized.includes("600-700"), "calorie range survived the filter");

  // And the deletion is auditable, field by field.
  const dropped = analysis.dropped_measurement_fields;
  assert(dropped.includes("calories"), dropped.join(","));
  assert(dropped.includes("energy_kcal"), dropped.join(","));
  assert(dropped.includes("macros"), dropped.join(","));
  assert(dropped.includes("nutrition_facts"), dropped.join(","));
  assert(dropped.includes("estimated_calories"), dropped.join(","));

  // The legitimate part of the reading is untouched.
  assertEquals(analysis.portion_band, "moderate");
  assertEquals(analysis.commitment_matches.length, 1);
});

Deno.test("measurement filter: a per-food calorie estimate is stripped, the food is kept", () => {
  const analysis = parseMealAnalysis(
    modelOutput({
      detected_foods: [
        {
          label: "porridge oats",
          food_group_ref: "whole_grain",
          confidence: 0.9,
          calories: 210,
          protein_g: 7,
        },
      ],
    }),
    [ID_A],
  );
  assertEquals(analysis.detected_foods.length, 1);
  assertEquals(analysis.detected_foods[0].label, "porridge oats");
  assert(!JSON.stringify(analysis.detected_foods).includes("210"));
  assert(
    analysis.dropped_measurement_fields.includes("detected_foods[0].calories"),
    analysis.dropped_measurement_fields.join(","),
  );
});

Deno.test("measurement filter: a quantified calorie claim inside prose is redacted", () => {
  const analysis = parseMealAnalysis(
    modelOutput({
      portion: {
        band: "large",
        rationale: "A generous bowl, roughly 700 kcal and about 40 g of protein.",
      },
    }),
    [ID_A],
  );
  assert(!analysis.portion_rationale.includes("700"));
  assert(!analysis.portion_rationale.includes("40 g"));
  assert(analysis.portion_rationale.includes("[removed]"));
  assert(analysis.dropped_measurement_fields.length > 0);
});

Deno.test("measurement filter: disarm condition -- unquantified prose is untouched", () => {
  // A belt states when it does NOT fire (doctrine P9). "protein-rich" carries
  // no number, so it is a description, not a measurement.
  const analysis = parseMealAnalysis(
    modelOutput({
      portion: {
        band: "moderate",
        rationale: "A protein-rich plate with 2 visible components, high in fiber.",
      },
    }),
    [ID_A],
  );
  assertEquals(
    analysis.portion_rationale,
    "A protein-rich plate with 2 visible components, high in fiber.",
  );
  assertEquals(analysis.dropped_measurement_fields, []);
});

Deno.test("measurement filter: stripMeasurementFacts does not mutate its input", () => {
  const input = { calories: 500, portion: { band: "small" } };
  const out = stripMeasurementFacts(input);
  assertEquals((input as Record<string, unknown>).calories, 500);
  assertEquals((out.value as Record<string, unknown>).calories, undefined);
});

Deno.test("no numeric portion field exists to be filled", () => {
  // The architecture, asserted: even when the model insists on grams, the typed
  // analysis has nowhere to put them.
  const analysis = parseMealAnalysis(
    modelOutput({
      portion: { band: "moderate", grams: 350, weight_g: 350, rationale: "x" },
    }),
    [ID_A],
  );
  assertEquals(Object.keys(analysis).includes("portion_grams"), false);
  assert(!JSON.stringify(analysis).includes("350"));
});

// ---------------------------------------------------------------------------
// Token discipline (R7)
// ---------------------------------------------------------------------------

Deno.test("an invented food group slug is dropped and named, never persisted", () => {
  const analysis = parseMealAnalysis(
    modelOutput({
      food_groups_present: ["whole_grain", "superfood_blend"],
      detected_foods: [
        { label: "mystery", food_group_ref: "superfood_blend", confidence: 0.5 },
      ],
    }),
    [ID_A],
  );
  // The FK on protocol_events.food_group_ref would have rejected this three
  // layers later, on data that looks valid. It stops here.
  assertEquals(analysis.food_groups_present, ["whole_grain"]);
  assertEquals(analysis.detected_foods[0].food_group_ref, null);
  assert(analysis.issues.some((i) => i.includes("superfood_blend")));
});

Deno.test("food group lists are deduplicated", () => {
  const analysis = parseMealAnalysis(
    modelOutput({ food_groups_present: ["eggs", "eggs", "whole_grain"] }),
    [ID_A],
  );
  assertEquals(analysis.food_groups_present, ["eggs", "whole_grain"]);
});

Deno.test("confidence is clamped into 0..1 and banded without a percentage", () => {
  const analysis = parseMealAnalysis(
    modelOutput({ overall_confidence: 4.2 }),
    [ID_A],
  );
  assertEquals(analysis.overall_confidence, 1);
  assertEquals(analysis.confidence_band, "high");
  assertEquals(confidenceBand(0.7), "moderate");
  assertEquals(confidenceBand(0.2), "low");
  assertEquals(confidenceBand(Number.NaN), "low");
});

Deno.test("a missing confidence is 0, not an optimistic default", () => {
  const analysis = parseMealAnalysis(
    modelOutput({ overall_confidence: undefined }),
    [ID_A],
  );
  assertEquals(analysis.overall_confidence, 0);
  assertEquals(analysis.confidence_band, "low");
});

Deno.test("a non-object model output throws (R7), it does not degrade", () => {
  assertThrows(() => parseMealAnalysis("[1,2,3]", [ID_A]));
  assertThrows(() => parseMealAnalysis("not json at all", [ID_A]));
});

Deno.test("a fenced JSON string is accepted", () => {
  const analysis = parseMealAnalysis(
    "```json\n" + JSON.stringify(modelOutput()) + "\n```",
    [ID_A],
  );
  assertEquals(analysis.commitment_matches.length, 1);
  assertEquals(analysis.prompt_version, MEAL_ANALYSIS_PROMPT_VERSION);
});

// ---------------------------------------------------------------------------
// Binding
// ---------------------------------------------------------------------------

Deno.test("binding: exactly one evidencing line binds it", () => {
  const analysis = parseMealAnalysis(modelOutput(), [ID_A, ID_B]);
  assertEquals(resolveMealPhotoBinding({ analysis }), {
    kind: "unique",
    commitmentId: ID_A,
  });
});

Deno.test("binding: two evidencing lines bind NOTHING (ambiguity is not a met)", () => {
  const analysis = parseMealAnalysis(
    modelOutput({
      commitment_matches: [
        { commitment_id: ID_A, verdict: "consistent", rationale: "a", confidence: 0.9 },
        { commitment_id: ID_B, verdict: "partial", rationale: "b", confidence: 0.7 },
      ],
    }),
    [ID_A, ID_B],
  );
  const binding = resolveMealPhotoBinding({ analysis });
  assertEquals(binding.kind, "ambiguous");
  const payload = buildRecognizedPayload({ analysis, binding, model: "m" });
  assertEquals(payload.commitment_id, undefined);
  assertEquals(payload.ambiguous_commitment_ids, [ID_A, ID_B]);
});

Deno.test("binding: not_visible and inconsistent never bind", () => {
  const analysis = parseMealAnalysis(
    modelOutput({
      commitment_matches: [
        { commitment_id: ID_A, verdict: "not_visible", rationale: "a", confidence: 0.9 },
        { commitment_id: ID_B, verdict: "inconsistent", rationale: "b", confidence: 0.9 },
      ],
    }),
    [ID_A, ID_B],
  );
  assertEquals(resolveMealPhotoBinding({ analysis }).kind, "none");
});

Deno.test("binding: the student's explicit choice beats the model's reading", () => {
  const analysis = parseMealAnalysis(modelOutput(), [ID_A, ID_B]);
  assertEquals(
    resolveMealPhotoBinding({ analysis, explicitCommitmentId: ID_B }),
    { kind: "explicit", commitmentId: ID_B },
  );
});

Deno.test("binding: the student's choice survives a force re-analysis", () => {
  // THE BUG THIS PINS: the first version stored the student's tap only in
  // `commitment_id`, which every re-analysis overwrites. A `force: true` run
  // therefore replaced a human statement with the model's reading, silently.
  const analysis = parseMealAnalysis(modelOutput(), [ID_A, ID_B]);
  const first = buildRecognizedPayload({
    analysis,
    binding: resolveMealPhotoBinding({ analysis, explicitCommitmentId: ID_B }),
    model: "m",
    studentCommitmentId: ID_B,
  });
  assertEquals(first.commitment_id, ID_B);
  assertEquals(first.student_commitment_id, ID_B);

  // Second pass reads the stored payload back, exactly as the edge function does.
  const carried = studentBindingIn(first);
  assertEquals(carried, ID_B);
  const second = buildRecognizedPayload({
    analysis,
    binding: resolveMealPhotoBinding({ analysis, explicitCommitmentId: carried }),
    model: "m",
    studentCommitmentId: carried,
  });
  assertEquals(second.commitment_id, ID_B);
  assertEquals(second.binding, "explicit");
});

Deno.test("studentBindingIn: a model-written commitment_id is NOT a student binding", () => {
  // An analyzed payload's `commitment_id` is the model's conclusion. Promoting
  // it back to "explicit" would launder a machine reading into a human one, and
  // would make it immune to the next re-analysis.
  const analysis = parseMealAnalysis(modelOutput(), [ID_A]);
  const payload = buildRecognizedPayload({
    analysis,
    binding: resolveMealPhotoBinding({ analysis }),
    model: "m",
  });
  assertEquals(payload.commitment_id, ID_A);
  assertEquals(studentBindingIn(payload), null);
});

Deno.test("studentBindingIn: a pre-analysis commitment_id IS a student binding", () => {
  assertEquals(studentBindingIn({ commitment_id: ID_A }), ID_A);
  assertEquals(studentBindingIn({ student_commitment_id: ID_B }), ID_B);
  assertEquals(studentBindingIn(null), null);
  assertEquals(studentBindingIn({}), null);
});

Deno.test("the recognized payload carries no quantity and no unit", () => {
  // A photo is evidence, not a measurement device. The evaluator reads
  // `quantity`/`unit` COLUMNS; this payload must never tempt a writer to fill
  // them from an image.
  const analysis = parseMealAnalysis(modelOutput(), [ID_A]);
  const payload = buildRecognizedPayload({
    analysis,
    binding: resolveMealPhotoBinding({ analysis }),
    model: "gemini-3-flash-preview",
  });
  assertEquals(payload.quantity, undefined);
  assertEquals(payload.unit, undefined);
  assertEquals(payload.kind, "meal_photo_analysis");
  assertEquals(payload.commitment_id, ID_A);
});

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

Deno.test("the prompt carries the day's plan and the allowlist has the same origin", () => {
  const built = buildMealAnalysisPrompt(
    [commitment(), commitment({ id: ID_B, slot_key: null, evaluation_grain: "day" })],
    "breakfast",
  );
  assertEquals(built.allowedCommitmentIds, [ID_A, ID_B]);
  assertEquals(built.slotKey, "breakfast");
  assert(built.userMessage.includes(ID_A));
  assert(built.userMessage.includes(ID_B));
  assert(built.userMessage.includes("commitments_for_this_slot"));
  assert(built.userMessage.includes("other_commitments_today"));
  // R5-legal: `content` is display material the vision layer may read.
  assert(built.userMessage.includes("composition"));
});

Deno.test("the allowlist spans the whole day, not just the photographed slot", () => {
  // A lunch photo legitimately evidences "berries 1 serving/day". Narrowing the
  // allowlist to the slot would make that match impossible to express and push
  // the model to invent an id instead.
  const built = buildMealAnalysisPrompt(
    [
      commitment({ id: ID_A, slot_key: "breakfast" }),
      commitment({ id: ID_B, slot_key: null, evaluation_grain: "day" }),
    ],
    "lunch",
  );
  assertEquals(built.allowedCommitmentIds, [ID_A, ID_B]);
  const analysis = parseMealAnalysis(
    modelOutput({
      commitment_matches: [
        { commitment_id: ID_B, verdict: "consistent", rationale: "berries", confidence: 0.9 },
      ],
    }),
    built.allowedCommitmentIds,
  );
  assertEquals(analysis.rejected_commitment_ids, []);
});

Deno.test("an unknown slot token throws at prompt build time (R7)", () => {
  assertThrows(() => buildMealAnalysisPrompt([commitment()], "brunch"));
});

Deno.test("a null slot is legal: the student may photograph without naming a meal", () => {
  const built = buildMealAnalysisPrompt([commitment()], null);
  assertEquals(built.slotKey, null);
  assertEquals(built.allowedCommitmentIds, [ID_A]);
});

Deno.test("the system prompt forbids calories explicitly and closes the slug list", () => {
  const built = buildMealAnalysisPrompt([commitment()], "breakfast");
  assert(built.systemPrompt.includes("YOU ARE NOT A CALORIE COUNTER"));
  assert(built.systemPrompt.includes("cruciferous_veg"));
  assert(built.systemPrompt.includes("NEVER invent, guess, complete or reformat a uuid"));
  // No French, no localized token in a Class A prompt (R1).
  assertEquals(/[^\x20-\x7e\n]/.test(built.systemPrompt), false);
});

Deno.test("an empty plan yields an empty allowlist, so every match is rejected", () => {
  const built = buildMealAnalysisPrompt([], "dinner");
  assertEquals(built.allowedCommitmentIds, []);
  const analysis = parseMealAnalysis(modelOutput(), built.allowedCommitmentIds);
  assertEquals(analysis.commitment_matches, []);
  assertEquals(analysis.rejected_commitment_ids, [ID_A]);
});

Deno.test("aucune prescription: le prompt demande de DÉCRIRE, pas de comparer", () => {
  // LE DÉFAUT QUE ÇA FERME: le builder envoyait toujours « THE STUDENT PLAN IN
  // CONTEXT » suivi de « Analyze the photo against this plan », avec un bloc
  // vide. Dans le modèle KEEL la liste est vide pour TOUS les élèves: on
  // demandait au modèle de comparer une assiette à rien, ce qui n'a pas de
  // réponse juste — et le pousse à en inventer une.
  const built = buildMealAnalysisPrompt([], "dinner");
  assert(!built.userMessage.includes("THE STUDENT PLAN IN CONTEXT"), built.userMessage);
  assert(!built.userMessage.includes("against this plan"), built.userMessage);
  assert(built.userMessage.includes("NO PRESCRIPTION IS IN CONTEXT"), built.userMessage);
  assert(built.userMessage.includes("Report what is ON THE PLATE"), built.userMessage);
  // Le créneau reste dit: il situe le repas sans rien lui comparer.
  assert(built.userMessage.includes("dinner"), built.userMessage);
  // Et le prompt système porte la même règle, pour les deux moitiés du verrou.
  assert(built.systemPrompt.includes("NOTHING TO COMPARE THE PLATE TO"));
});

Deno.test("aucune prescription et aucun créneau: la phrase le dit, sans inventer", () => {
  const built = buildMealAnalysisPrompt([], null);
  assertEquals(built.slotKey, null);
  assert(built.userMessage.includes("did not say which meal this is"), built.userMessage);
});

Deno.test("avec prescription, le bloc de plan revient intact (mode 1:1)", () => {
  const built = buildMealAnalysisPrompt([commitment()], "breakfast");
  assert(built.userMessage.includes("THE STUDENT PLAN IN CONTEXT"), built.userMessage);
  assert(built.userMessage.includes("Analyze the photo against this plan"), built.userMessage);
  assert(!built.userMessage.includes("NO PRESCRIPTION"), built.userMessage);
});

Deno.test("an unusable image yields an empty, low-confidence reading", () => {
  const analysis = parseMealAnalysis(
    {
      detected_foods: [],
      food_groups_present: [],
      food_groups_absent: [],
      portion: { band: "unclear", rationale: "The frame is too dark." },
      commitment_matches: [],
      overall_confidence: 0.1,
      image_quality: "unusable",
    },
    [ID_A],
  );
  assertEquals(analysis.image_quality, "unusable");
  assertEquals(analysis.confidence_band, "low");
  assertEquals(resolveMealPhotoBinding({ analysis }).kind, "none");
});

// ---------------------------------------------------------------------------
// CREDIT BY CONTENT — `protocol_events.food_group_ref`
//
// THE DEFECT THESE PIN: both upload paths hardcoded `food_group_ref: null` and
// nothing ever filled it, so a photo of berries could not credit "berries 1
// serving/day". The photo was the most expensive gesture in the product and it
// bought nothing.
// ---------------------------------------------------------------------------

const ID_C = "33333333-3333-3333-3333-333333333333";

/** A day's plan line that the evaluator's food_group branch can reach. */
function foodLine(
  id: string,
  group: string,
  over: Partial<MealAnalysisCommitmentContext> = {},
): MealAnalysisCommitmentContext {
  return commitment({
    id,
    title: `${group} line`,
    measure: "serving",
    unit: "serving",
    target_op: ">=",
    target_min: 1,
    food_group_ref: group,
    content: null,
    ...over,
  });
}

function analysisWithGroups(
  groups: string[],
  over: Record<string, unknown> = {},
) {
  return parseMealAnalysis(
    modelOutput({
      food_groups_present: groups,
      food_groups_absent: [],
      commitment_matches: [],
      ...over,
    }),
    [ID_A, ID_B, ID_C],
  );
}

Deno.test("credit: exactly ONE detected group on the day's plan is written", () => {
  const credit = resolveFoodGroupCredit({
    analysis: analysisWithGroups(["berries", "coffee_tea"]),
    commitmentsToday: [foodLine(ID_A, "berries"), foodLine(ID_B, "leafy_greens")],
  });
  // `coffee_tea` is on the plate but not on the plan: it is not a candidate.
  assertEquals(credit.candidateGroups, ["berries"]);
  assertEquals(credit.foodGroupRef, "berries");
  assertEquals(credit.commitmentIds, [ID_A]);
  assertEquals(credit.reason, "credited");
  assertEquals(credit.issues, []);
});

Deno.test("credit: one group credits EVERY day line that references it", () => {
  // Not a fan-out: one fact, one column, and the evaluator's food_group branch
  // legitimately reaches both lines with it -- exactly as a manual tap would.
  const credit = resolveFoodGroupCredit({
    analysis: analysisWithGroups(["berries"]),
    commitmentsToday: [foodLine(ID_A, "berries"), foodLine(ID_B, "berries")],
  });
  assertEquals(credit.foodGroupRef, "berries");
  assertEquals(credit.commitmentIds, [ID_A, ID_B]);
});

Deno.test("credit: TWO prescribed groups on one plate credit NOTHING", () => {
  // THE arbitration. `protocol_events.food_group_ref` is one column; splitting
  // a plate into N facts is the fan-out cardinality class this repo has paid
  // for. Two candidates resolve to null -- and the acknowledgement says so.
  const credit = resolveFoodGroupCredit({
    analysis: analysisWithGroups(["berries", "leafy_greens"]),
    commitmentsToday: [foodLine(ID_A, "berries"), foodLine(ID_B, "leafy_greens")],
  });
  assertEquals(credit.foodGroupRef, null);
  assertEquals(credit.commitmentIds, []);
  assertEquals(credit.candidateGroups, ["berries", "leafy_greens"]);
  assertEquals(credit.reason, "several_groups_in_plan");
});

Deno.test("credit: SEVERAL groups the plan never asks for still credit nothing", () => {
  // Nothing to disambiguate with, and one column: the plate is ambiguous and
  // the row stays null. This is the ONLY case where a detected group is not
  // written, and it is a cardinality limit, not a judgement about the plan.
  const credit = resolveFoodGroupCredit({
    analysis: analysisWithGroups(["sugar_sweets", "fried_food"]),
    commitmentsToday: [foodLine(ID_A, "berries")],
  });
  assertEquals(credit.foodGroupRef, null);
  assertEquals(credit.candidateGroups, []);
  assertEquals(credit.reason, "several_groups_none_in_plan");
});

Deno.test("credit: an unreadable plate credits nothing and says which case it is", () => {
  const credit = resolveFoodGroupCredit({
    analysis: analysisWithGroups([]),
    commitmentsToday: [foodLine(ID_A, "berries")],
  });
  assertEquals(credit.foodGroupRef, null);
  assertEquals(credit.reason, "no_group_detected");
});

Deno.test("credit: an empty plan still RECORDS what the plate showed", () => {
  // D1's arbitration, in its purest form: the fact says what was eaten. A plate
  // of berries is a plate of berries whether or not a coach asked for one; the
  // row is written and credits no line, which the reason states.
  const credit = resolveFoodGroupCredit({
    analysis: analysisWithGroups(["berries"]),
    commitmentsToday: [],
  });
  assertEquals(credit.foodGroupRef, "berries");
  assertEquals(credit.commitmentIds, []);
  assertEquals(credit.reason, "recorded_not_in_plan");
});

Deno.test("credit: a line the evaluator reaches by substance_ref is NOT a candidate", () => {
  // `matchEvent` tests `measure IN ('dose','micronutrient')` BEFORE the food
  // group branch and returns there. Counting such a line as a candidate would
  // make the acknowledgement promise a credit the evaluator never gives -- and
  // it would also let a second group turn a real credit into a null.
  const credit = resolveFoodGroupCredit({
    analysis: analysisWithGroups(["fatty_fish", "berries"]),
    commitmentsToday: [
      foodLine(ID_A, "berries"),
      foodLine(ID_B, "fatty_fish", {
        measure: "micronutrient",
        substance_ref: "omega_3_epa_dha",
      }),
    ],
  });
  assertEquals(credit.candidateGroups, ["berries"]);
  assertEquals(credit.foodGroupRef, "berries");
  assertEquals(credit.commitmentIds, [ID_A]);
});

Deno.test("credit: an avoid line keyed on substance_ref is reached through THAT slug", () => {
  // `matchEvent`'s avoid branch accepts `event.foodGroupRef === substance_ref`,
  // because `alcohol` lives in both vocabularies. Keying this line on its
  // `food_group_ref` instead would silently hide every photographed violation
  // of an "avoid alcohol" line -- the fact would simply never be written.
  const credit = resolveFoodGroupCredit({
    analysis: analysisWithGroups(["alcohol"]),
    commitmentsToday: [
      foodLine(ID_A, "berries", {
        polarity: "avoid",
        substance_ref: "alcohol",
        measure: "presence",
        target_op: "any",
        target_min: null,
      }),
    ],
  });
  assertEquals(credit.candidateGroups, ["alcohol"]);
  assertEquals(credit.foodGroupRef, "alcohol");
  assertEquals(credit.commitmentIds, [ID_A]);
});

Deno.test("credit: a molecule-only substance line is unreachable, and that is not drift", () => {
  // 'magnesium_glycinate' is not a food group and never will be: no photo fact
  // can reach that line. Naming it as an issue would be noise on every single
  // analysis of every student who takes a supplement.
  const credit = resolveFoodGroupCredit({
    analysis: analysisWithGroups(["berries"]),
    commitmentsToday: [
      foodLine(ID_A, "berries"),
      foodLine(ID_B, "berries", {
        polarity: "avoid",
        substance_ref: "magnesium_glycinate",
        measure: "presence",
        target_op: "any",
        target_min: null,
      }),
    ],
  });
  assertEquals(credit.foodGroupRef, "berries");
  assertEquals(credit.commitmentIds, [ID_A]);
  assertEquals(credit.issues, []);
});

Deno.test("credit: an avoid line WITHOUT substance_ref does receive the contrary fact", () => {
  // A true fact is written whether it flatters the student or not. "No added
  // sugar in the evening" + a photo of dessert is the coach's whole point;
  // withholding it would be dishonest bookkeeping, not kindness.
  const credit = resolveFoodGroupCredit({
    analysis: analysisWithGroups(["sugar_sweets"]),
    commitmentsToday: [
      foodLine(ID_A, "sugar_sweets", {
        polarity: "avoid",
        measure: "presence",
        target_op: "any",
        target_min: null,
      }),
    ],
  });
  assertEquals(credit.foodGroupRef, "sugar_sweets");
  assertEquals(credit.commitmentIds, [ID_A]);
});

Deno.test("credit: a plan slug outside the closed list is NAMED, never credited", () => {
  const credit = resolveFoodGroupCredit({
    analysis: analysisWithGroups(["berries"]),
    commitmentsToday: [
      foodLine(ID_A, "superfood_blend"),
      foodLine(ID_B, "berries"),
    ],
  });
  assertEquals(credit.foodGroupRef, "berries");
  assertEquals(credit.commitmentIds, [ID_B]);
  assertEquals(credit.issues.length, 1);
  assert(credit.issues[0].includes("superfood_blend"), credit.issues.join(","));
});

// ---------------------------------------------------------------------------
// D1 — the resolution is the EVALUATOR's, and the written slug is the plate's
// ---------------------------------------------------------------------------

Deno.test("credit D1: broccoli against a non_starchy_veg line under 'flexible' IS credited", () => {
  // THE red measured in a real run. `matchFoodGroup` credits this without
  // hesitation (same `vegetable` class, autonomy='flexible'); the literal
  // intersection used to answer `no_group_in_plan` and write NOTHING, so the
  // most expensive gesture in the product bought nothing again.
  const credit = resolveFoodGroupCredit({
    analysis: analysisWithGroups(["cruciferous_veg"]),
    commitmentsToday: [foodLine(ID_A, "non_starchy_veg", { autonomy: "flexible" })],
  });
  // The group WRITTEN is the one SEEN, never the one prescribed: the fact does
  // not adopt the plan's vocabulary.
  assertEquals(credit.foodGroupRef, "cruciferous_veg");
  assertEquals(credit.commitmentIds, [ID_A]);
  assertEquals(credit.reason, "credited");
});

Deno.test("credit D1: a class-equivalent swap under 'strict' credits no line, and the fact is still written", () => {
  // `matchFoodGroup`: autonomy='strict' vetoes every swap whatever the policy
  // says. The plate is still recorded -- what was eaten does not depend on what
  // the coach allows.
  const credit = resolveFoodGroupCredit({
    analysis: analysisWithGroups(["other_fruit"]),
    commitmentsToday: [foodLine(ID_A, "berries", { autonomy: "strict" })],
  });
  assertEquals(credit.foodGroupRef, "other_fruit");
  assertEquals(credit.commitmentIds, []);
  assertEquals(credit.reason, "recorded_not_in_plan");
});

Deno.test("credit D1: 'swap_within_policy' needs the coach's class_equivalent flag", () => {
  const line = (over: Record<string, unknown>) =>
    foodLine(ID_A, "berries", { autonomy: "swap_within_policy", ...over });

  const withoutPolicy = resolveFoodGroupCredit({
    analysis: analysisWithGroups(["other_fruit"]),
    commitmentsToday: [line({ content: null })],
  });
  assertEquals(withoutPolicy.commitmentIds, []);
  assertEquals(withoutPolicy.foodGroupRef, "other_fruit");

  const withPolicy = resolveFoodGroupCredit({
    analysis: analysisWithGroups(["other_fruit"]),
    commitmentsToday: [line({ content: { swap_policy: { class_equivalent: true } } })],
  });
  assertEquals(withPolicy.commitmentIds, [ID_A]);
  assertEquals(withPolicy.reason, "credited");
});

Deno.test("credit D1: the coach's enumerated substitutes are honoured across classes", () => {
  // `allowed_groups` is checked BEFORE class equivalence in `matchFoodGroup`,
  // and it is not bounded by the class: a coach may allow yogurt for berries.
  const credit = resolveFoodGroupCredit({
    analysis: analysisWithGroups(["dairy_yogurt"]),
    commitmentsToday: [
      foodLine(ID_A, "berries", {
        autonomy: "swap_within_policy",
        content: { swap_policy: { allowed_groups: ["dairy_yogurt"] } },
      }),
    ],
  });
  assertEquals(credit.foodGroupRef, "dairy_yogurt");
  assertEquals(credit.commitmentIds, [ID_A]);
});

Deno.test("credit D1: an avoid line keyed on a substance is matched LITERALLY, never by class", () => {
  // The evaluator's avoid branch compares slugs, full stop. Resolving a class
  // there would invent transgressions: a photo of wine is not a photo of a
  // sweetened beverage, even though both are `beverage`.
  const credit = resolveFoodGroupCredit({
    analysis: analysisWithGroups(["sweetened_beverage"]),
    commitmentsToday: [
      foodLine(ID_A, "berries", {
        polarity: "avoid",
        substance_ref: "alcohol",
        autonomy: "flexible",
        measure: "presence",
        target_op: "any",
        target_min: null,
      }),
    ],
  });
  assertEquals(credit.foodGroupRef, "sweetened_beverage");
  assertEquals(credit.commitmentIds, []);
});

Deno.test("credit D1: the tie-break between several groups uses the SAME resolution", () => {
  // Two groups on the plate, one column. Only `cruciferous_veg` reaches a line
  // -- and it reaches it by class, which the literal intersection could not
  // see: before D1 this plate wrote null.
  const credit = resolveFoodGroupCredit({
    analysis: analysisWithGroups(["cruciferous_veg", "coffee_tea"]),
    commitmentsToday: [foodLine(ID_A, "non_starchy_veg", { autonomy: "flexible" })],
  });
  assertEquals(credit.candidateGroups, ["cruciferous_veg"]);
  assertEquals(credit.foodGroupRef, "cruciferous_veg");
  assertEquals(credit.reason, "credited");
});

Deno.test("credit D1: FOOD_GROUP_CLASSES is byte-aligned with the migration seed", () => {
  // Drift here is not a style problem: a wrong class silently changes which
  // swaps this module believes the evaluator resolves. The migration is the
  // truth, so the test reads the migration.
  const sql = Deno.readTextFileSync(
    new URL(
      "../../../migrations/20260727090000_keel_p0_commitments.sql",
      import.meta.url,
    ),
  );
  const seeded: Record<string, string> = {};
  for (
    const m of sql.matchAll(
      /^\s*\('([a-z_]+)',\s*'(protein|legume|dairy|grain|vegetable|fruit|fat|discretionary|beverage)',/gm,
    )
  ) {
    seeded[m[1]] = m[2];
  }
  assertEquals(
    Object.keys(seeded).length,
    Object.keys(FOOD_GROUP_CLASSES).length,
  );
  assertEquals(FOOD_GROUP_CLASSES, seeded);
});

Deno.test("credit: the result carries an identity, never a quantity (non-input #4)", () => {
  const credit = resolveFoodGroupCredit({
    analysis: analysisWithGroups(["berries"]),
    commitmentsToday: [foodLine(ID_A, "berries")],
  });
  const keys = Object.keys(credit);
  assertEquals(keys.includes("quantity"), false);
  assertEquals(keys.includes("unit"), false);
  assertEquals(keys.includes("portion"), false);
  assert(!/\d/.test(JSON.stringify(credit.foodGroupRef)));
});

Deno.test("credit: the recognized payload records WHY nothing was credited", () => {
  const analysis = analysisWithGroups(["berries", "leafy_greens"]);
  const credit = resolveFoodGroupCredit({
    analysis,
    commitmentsToday: [foodLine(ID_A, "berries"), foodLine(ID_B, "leafy_greens")],
  });
  const payload = buildRecognizedPayload({
    analysis,
    binding: resolveMealPhotoBinding({ analysis }),
    model: "m",
    credit,
  });
  assertEquals(
    (payload.food_group_credit as Record<string, unknown>).reason,
    "several_groups_in_plan",
  );
  assertEquals(
    (payload.food_group_credit as Record<string, unknown>).food_group_ref,
    null,
  );
});

// ---------------------------------------------------------------------------
// creditedCommitmentIds — the evaluator's precedence, in one place
// ---------------------------------------------------------------------------

Deno.test("credited lines: an explicit binding SUPPRESSES the food group credit", () => {
  // `matchEvent` opens with `if (event.commitmentId !== null)` and returns null
  // for every other line. A bound photo credits exactly one commitment, whatever
  // else is on the plate -- so the acknowledgement must not claim two.
  const analysis = analysisWithGroups(["berries"]);
  const credit = resolveFoodGroupCredit({
    analysis,
    commitmentsToday: [foodLine(ID_A, "berries")],
  });
  assertEquals(credit.commitmentIds, [ID_A]);
  assertEquals(
    creditedCommitmentIds({
      binding: { kind: "explicit", commitmentId: ID_B },
      credit,
    }),
    [ID_B],
  );
});

Deno.test("credited lines: an ambiguous binding falls back to the food group credit", () => {
  const analysis = analysisWithGroups(["berries"]);
  const credit = resolveFoodGroupCredit({
    analysis,
    commitmentsToday: [foodLine(ID_A, "berries")],
  });
  assertEquals(
    creditedCommitmentIds({
      binding: { kind: "ambiguous", commitmentIds: [ID_B, ID_C] },
      credit,
    }),
    [ID_A],
  );
  assertEquals(
    creditedCommitmentIds({ binding: { kind: "none" }, credit: null }),
    [],
  );
});

// ---------------------------------------------------------------------------
// THE ACKNOWLEDGEMENT — no announcement without a committed effect
//
// THE DEFECT THESE PIN: `renderMealPhotoAck` emitted "That looks consistent
// with X" for every verdict, and its signature did not even carry the binding,
// so it was STRUCTURALLY unable to know that a full plate (3 lines evidenced =>
// `ambiguous` => zero credit) had credited nothing.
// ---------------------------------------------------------------------------

const TITLES = {
  [ID_A]: "Berries 1 serving/day",
  [ID_B]: "Leafy greens 2 servings/day",
  [ID_C]: "Protocol breakfast",
};

function ack(over: {
  analysis: ReturnType<typeof parseMealAnalysis>;
  binding: Parameters<typeof creditedCommitmentIds>[0]["binding"];
  credit?: ReturnType<typeof resolveFoodGroupCredit> | null;
  /** Défaut `true`: ces cas-là sont ceux du mode 1:1, qui a des lignes. */
  hasPrescription?: boolean;
}): string {
  return renderMealPhotoAck({
    analysis: over.analysis,
    binding: over.binding,
    credit: over.credit ?? null,
    commitmentTitles: TITLES,
    hasPrescription: over.hasPrescription ?? true,
    tickedDish: null,
    locale: "en",
  });
}

Deno.test("ack: an ambiguous plate never announces the lines it did not credit", () => {
  const analysis = parseMealAnalysis(
    modelOutput({
      detected_foods: [
        { label: "grilled salmon", food_group_ref: "fatty_fish", confidence: 0.9 },
        { label: "spinach salad", food_group_ref: "leafy_greens", confidence: 0.9 },
      ],
      food_groups_present: ["fatty_fish", "leafy_greens"],
      commitment_matches: [
        { commitment_id: ID_A, verdict: "consistent", rationale: "a", confidence: 0.9 },
        { commitment_id: ID_B, verdict: "consistent", rationale: "b", confidence: 0.9 },
        { commitment_id: ID_C, verdict: "partial", rationale: "c", confidence: 0.8 },
      ],
    }),
    [ID_A, ID_B, ID_C],
  );
  const binding = resolveMealPhotoBinding({ analysis });
  assertEquals(binding.kind, "ambiguous");
  const message = ack({ analysis, binding, credit: null });

  // THE regression: the old renderer said this three times.
  assert(!message.includes("looks consistent"), message);
  // All three are named as NOT counted, with the way out.
  assert(message.includes(TITLES[ID_A]), message);
  assert(message.includes(TITLES[ID_B]), message);
  assert(message.includes(TITLES[ID_C]), message);
  assert(message.includes("tell me which one to count"), message);
  assert(!message.includes("Counted toward"), message);
});

Deno.test("ack: a unique binding names the ONE line the row now carries", () => {
  const analysis = parseMealAnalysis(
    modelOutput({
      commitment_matches: [
        { commitment_id: ID_A, verdict: "consistent", rationale: "a", confidence: 0.9 },
      ],
    }),
    [ID_A, ID_B],
  );
  const binding = resolveMealPhotoBinding({ analysis });
  assertEquals(binding.kind, "unique");
  const message = ack({ analysis, binding });
  assert(message.includes(`Counted toward "${TITLES[ID_A]}".`), message);
  assert(!message.includes("tell me which one"), message);
});

Deno.test("ack: an explicit binding says the student's line, and only theirs", () => {
  const analysis = parseMealAnalysis(
    modelOutput({
      commitment_matches: [
        { commitment_id: ID_A, verdict: "consistent", rationale: "a", confidence: 0.9 },
      ],
    }),
    [ID_A, ID_B],
  );
  const message = ack({
    analysis,
    binding: { kind: "explicit", commitmentId: ID_B },
  });
  assert(message.includes(`Logged against "${TITLES[ID_B]}", as you asked.`), message);
  // The model's own reading is named as NOT counted, because it is not.
  assert(message.includes(TITLES[ID_A]), message);
  assert(message.includes("not counted this photo toward it"), message);
});

Deno.test("ack: a food group credit is announced, and it is the one on the row", () => {
  // Binding `none` (no line was judged consistent), credit by content.
  const analysis = analysisWithGroups(["berries"]);
  const credit = resolveFoodGroupCredit({
    analysis,
    commitmentsToday: [foodLine(ID_A, "berries")],
  });
  const message = ack({ analysis, binding: { kind: "none" }, credit });
  assert(message.includes(`Counted toward "${TITLES[ID_A]}".`), message);
  assert(!message.includes("on file for your coach"), message);
});

Deno.test("ack: nothing credited says exactly that, and nothing more", () => {
  const analysis = analysisWithGroups(["sugar_sweets"]);
  const credit = resolveFoodGroupCredit({
    analysis,
    commitmentsToday: [foodLine(ID_A, "berries")],
  });
  const message = ack({ analysis, binding: { kind: "none" }, credit });
  assert(
    message.includes("I have not attached it to a line on your plan"),
    message,
  );
  assert(!message.includes("Counted toward"), message);
  assert(!message.includes("Logged against"), message);
});

Deno.test("ack: evidence AGAINST a line is reported, and is not a credit", () => {
  const analysis = parseMealAnalysis(
    modelOutput({
      commitment_matches: [
        { commitment_id: ID_A, verdict: "inconsistent", rationale: "a", confidence: 0.9 },
      ],
    }),
    [ID_A],
  );
  const message = ack({ analysis, binding: resolveMealPhotoBinding({ analysis }) });
  assert(message.includes(`It does not line up with "${TITLES[ID_A]}".`), message);
  assert(!message.includes("Counted toward"), message);
  // "does not line up" is already the honest statement; do not pile the
  // "nothing attached" sentence on top of it.
  assert(!message.includes("on file for your coach"), message);
});

// ---------------------------------------------------------------------------
// SANS PRESCRIPTION — le cas NORMAL du modèle KEEL, et celui qui parlait faux
//
// Le coach écrit une doctrine pour sa cohorte et ne publie rien par élève
// (docs/keel/MODEL.md). Il n'y a donc aucune ligne, et l'accusé disait quand
// même « I have not attached it to a line on your plan » — un manque annoncé à
// quelqu'un qui n'a rien manqué, désignant un écran que personne ne remplira.
// ---------------------------------------------------------------------------

Deno.test("ack sans prescription: on DÉCRIT l'assiette, on ne parle d'aucune ligne", () => {
  const analysis = analysisWithGroups(["berries"]);
  const message = renderMealPhotoAck({
    analysis,
    binding: { kind: "none" },
    credit: resolveFoodGroupCredit({ analysis, commitmentsToday: [] }),
    commitmentTitles: {},
    hasPrescription: false,
    tickedDish: null,
    locale: "en",
  });
  assert(message.startsWith("I see "), message);
  // AUCUNE des quatre phrases de prescription.
  assert(!message.includes("on your plan"), message);
  assert(!message.includes("Counted toward"), message);
  assert(!message.includes("Logged against"), message);
  assert(!message.includes("tell me which one to count"), message);
});

Deno.test("ack sans prescription: le DOUTE reste dit — il porte sur l'assiette", () => {
  // La question de précision ne parle pas d'une ligne: elle demande comment le
  // plat a été fait. La faire tomber avec les phrases de plan aurait rendu le
  // chemin normal muet sur la seule chose que l'élève peut corriger.
  const analysis = parseMealAnalysis(
    modelOutput({
      commitment_matches: [],
      // La mise, exigée par le FILTRE 3: une question sans hypothèse ni doute
      // d'image serait tombée avant d'arriver au rendu.
      assumptions: [
        { subject: "cooking_fat", assumption: "Probably oil.", basis: "standard_default" },
      ],
      clarifying_question: "Did you cook these with any oil or butter?",
    }),
    [],
  );
  const message = renderMealPhotoAck({
    analysis,
    binding: { kind: "none" },
    credit: null,
    commitmentTitles: {},
    hasPrescription: false,
    tickedDish: null,
    locale: "en",
  });
  assert(message.includes("Did you cook these with any oil or butter?"), message);
  assert(!message.includes("on your plan"), message);
});

Deno.test("ack: hasPrescription est REQUIS, il ne se déduit pas", () => {
  // Le raccourci tentant était `Object.keys(commitmentTitles).length === 0`. Il
  // confond « aucune prescription n'existe » et « l'assiette n'a rien matché »,
  // qui méritent deux phrases différentes. Un défaut silencieux ferait taire
  // les crédits du mode 1:1 sans que rien n'échoue.
  const analysis = analysisWithGroups(["berries"]);
  const args = {
    analysis,
    binding: { kind: "none" },
    commitmentTitles: TITLES,
    locale: "en",
  } as unknown as Parameters<typeof renderMealPhotoAck>[0];
  assertThrows(() => renderMealPhotoAck(args));
});

Deno.test("ack: an unusable image claims nothing at all", () => {
  const analysis = parseMealAnalysis(
    {
      detected_foods: [],
      food_groups_present: [],
      food_groups_absent: [],
      portion: { band: "unclear", rationale: "Too dark." },
      commitment_matches: [],
      overall_confidence: 0.1,
      image_quality: "unusable",
      subject_kind: "eaten_meal",
    },
    [ID_A],
  );
  const message = ack({ analysis, binding: { kind: "none" } });
  assert(message.includes("I have not logged what is on it"), message);
  // « toward your plan » supposait un plan par élève, qui n'existe pas.
  assert(!message.includes("your plan"), message);
  assert(!message.includes("Counted toward"), message);
  // L'ancienne phrase promettait « It is saved either way » — et la ligne
  // qu'elle décrivait comptait ensuite comme un repas. La photo est bien
  // conservée en base, mais l'élève doit être dit ce qui lui importe: elle ne
  // compte pas. Ne jamais réintroduire la promesse inverse.
  assert(!message.toLowerCase().includes("saved either way"), message);
});

Deno.test("ack: no percentage, no calorie, no evaluator status word, ever", () => {
  const analysis = parseMealAnalysis(
    modelOutput({
      calories: 640,
      commitment_matches: [
        { commitment_id: ID_A, verdict: "consistent", rationale: "a", confidence: 0.9 },
        { commitment_id: ID_B, verdict: "partial", rationale: "b", confidence: 0.4 },
      ],
      overall_confidence: 0.2,
    }),
    [ID_A, ID_B],
  );
  const credit = resolveFoodGroupCredit({
    analysis,
    commitmentsToday: [foodLine(ID_A, "whole_grain")],
  });
  const message = ack({
    analysis,
    binding: resolveMealPhotoBinding({ analysis }),
    credit,
  });
  assert(!message.includes("%"), message);
  assert(!message.includes("640"), message);
  assert(!/\bkcal\b/i.test(message), message);
  for (const word of [" met", "missed", "partial", "not_applicable", "unknown"]) {
    assert(!message.includes(word), `${word} leaked into the ack: ${message}`);
  }
  // Low confidence is still named rather than hidden.
  assert(message.includes("I am not confident about this reading"), message);
});

Deno.test("ack: the binding is a REQUIRED argument, so it cannot be forgotten", () => {
  // The structural half of the fix: the old signature could not express the
  // binding at all, which is why it could not tell a credit from an
  // announcement. A type error here is the point.
  const analysis = analysisWithGroups(["berries"]);
  const args = {
    analysis,
    commitmentTitles: TITLES,
    locale: "en",
  } as unknown as Parameters<typeof renderMealPhotoAck>[0];
  // Passing no binding at runtime throws rather than rendering a claim.
  assertThrows(() => renderMealPhotoAck(args));
});

Deno.test("ack: an unsupported locale still throws (R7)", () => {
  const analysis = analysisWithGroups(["berries"]);
  assertThrows(() =>
    renderMealPhotoAck({
      analysis,
      binding: { kind: "none" },
      commitmentTitles: TITLES,
      hasPrescription: true,
      tickedDish: null,
      locale: "fr",
    })
  );
});

// ---------------------------------------------------------------------------
// The ANTI-OMISSION block (prompt v2)
// ---------------------------------------------------------------------------
//
// Measured on 85 real calls of the production vision model
// (docs/keel/PHOTO_QUANTIFICATION.md §3): the model reproduces the VISIBLE part
// of a meal to +2.0% and adds no provision whatsoever for what a photograph
// cannot show. On the five OMIT cases its own `assumptions` field said "no added
// fat was counted" -- with `confidence: high` -- while the true error was
// -28.0%. Naming the invisible in the prompt moves the energy bias from -26.6%
// to -11.6% at zero token cost.
//
// Here it serves COMPOSITION, never energy. These tests pin both halves: the
// block is present, and it did not smuggle the calorie question back in.

Deno.test("prompt v2: the invisible is named, by category", () => {
  const p = MEAL_ANALYSIS_SYSTEM_PROMPT;
  for (const cue of ["cooking fat", "sauces", "sugar", "salt"]) {
    assert(p.includes(cue), `anti-omission block must name ${cue}`);
  }
  // And it must forbid the assumption, not merely mention the category: the
  // measured failure was the model asserting "no added fat" with high
  // confidence, which is worse than silence.
  assert(p.includes("Do NOT assume"));
});

Deno.test("prompt v2: naming the invisible NEVER authorizes a number", () => {
  const p = MEAL_ANALYSIS_SYSTEM_PROMPT;
  assert(p.includes("NONE of this authorizes a number"));
  // The hard rule above it is untouched: the calorie ban is still absolute.
  assert(p.includes("YOU ARE NOT A CALORIE COUNTER"));
  assert(p.includes("the answer is \"unclear\""));
});

Deno.test("prompt v3: the version moved, so an older reading is distinguishable", () => {
  // `analyze-meal-photo-v1` decides idempotence on the STORED version. A prompt
  // that changed behaviour without moving its version would make a v2 and a v3
  // reading indistinguishable on the row, and a benchmark re-run unauditable.
  // v3 (pivot P0.3) added `assumptions[]` and `clarifying_question`.
  assertEquals(MEAL_ANALYSIS_PROMPT_VERSION, "meal_analysis.en.v3");
});

// ---------------------------------------------------------------------------
// P0.3 (pivot nutrition) — assumptions[] and clarifying_question
//
// The arbitration these tests pin (docs/nutrition-pivot/PROGRESS.md, P0.0bis):
// PLAN-NUIT §3.5 asks for three things — kcal/macro RANGES, assumptions, and
// one question. Two are implemented; the ranges are refused on this repo's own
// measurement. So the tests below assert BOTH halves:
//   * the two new fields work, and
//   * they did not become a back door for the number that was refused.
// ---------------------------------------------------------------------------

Deno.test("assumptions: the invisible is named, with its basis kept honest", () => {
  const analysis = parseMealAnalysis(
    modelOutput({
      assumptions: [
        {
          subject: "cooking_fat",
          assumption: "The chicken was seared in a fat, judging by the browning.",
          basis: "visible_cue",
        },
        {
          subject: "sauce_dressing",
          assumption: "The salad was probably dressed.",
          basis: "standard_default",
        },
      ],
    }),
    [ID_A],
  );
  assertEquals(analysis.assumptions.length, 2);
  assertEquals(analysis.assumptions[0].subject, "cooking_fat");
  assertEquals(analysis.assumptions[0].basis, "visible_cue");
  assertEquals(analysis.assumptions[1].basis, "standard_default");
  assertEquals(analysis.issues.length, 0);
});

Deno.test("assumptions: an unknown subject is kept as `other`, never dropped", () => {
  // Losing "there is a sauce under this" over a token spelling is worse than a
  // coarse subject: the sentence is composition evidence a coach line may need.
  const analysis = parseMealAnalysis(
    modelOutput({
      assumptions: [
        { subject: "dressing", assumption: "There is a sauce underneath.", basis: "visible_cue" },
      ],
    }),
    [ID_A],
  );
  assertEquals(analysis.assumptions.length, 1);
  assertEquals(analysis.assumptions[0].subject, "other");
  assertEquals(analysis.assumptions[0].assumption, "There is a sauce underneath.");
  assert(analysis.issues.some((i) => i.includes("assumptions[0].subject")));
});

Deno.test("assumptions: an unreadable basis defaults to the WEAKER claim", () => {
  // Defaulting the other way would promote a guess into evidence. A student can
  // correct a default; they cannot correct something the system claims to have
  // seen.
  const analysis = parseMealAnalysis(
    modelOutput({
      assumptions: [
        { subject: "cooking_fat", assumption: "Probably some oil.", basis: "i_reckon" },
      ],
    }),
    [ID_A],
  );
  assertEquals(analysis.assumptions[0].basis, "standard_default");
  assert(analysis.issues.some((i) => i.includes("assumptions[0].basis")));
});

Deno.test("assumptions: a quantified claim inside an assumption is REDACTED", () => {
  // The measurement filter runs on the whole payload before any field is read,
  // so a calorie cannot ride in on a field added after the filter was written.
  // This is the regression that matters for P0.3: two new free-text fields are
  // two new places a number could have survived.
  const analysis = parseMealAnalysis(
    modelOutput({
      assumptions: [
        {
          subject: "cooking_fat",
          assumption: "Seared in oil, which adds about 90 kcal to the plate.",
          basis: "visible_cue",
        },
      ],
    }),
    [ID_A],
  );
  assert(!/90\s*kcal/i.test(analysis.assumptions[0].assumption));
  assert(analysis.assumptions[0].assumption.includes("[removed]"));
  assert(analysis.dropped_measurement_fields.length > 0);
});

Deno.test("assumptions: an `impact_kcal` field is deleted, not stored", () => {
  // PLAN-NUIT §3.5 shapes an assumption as {sujet, hypothese, impact_kcal}.
  // The third key is the calorie question wearing a different hat; if the model
  // emits it anyway, it must not reach the row.
  const analysis = parseMealAnalysis(
    modelOutput({
      assumptions: [
        {
          subject: "cooking_fat",
          assumption: "Pan, plus standard oil.",
          basis: "standard_default",
          impact_kcal: 100,
        },
      ],
    }),
    [ID_A],
  );
  assertEquals(
    (analysis.assumptions[0] as unknown as Record<string, unknown>).impact_kcal,
    undefined,
  );
  assert(analysis.dropped_measurement_fields.some((f) => f.includes("impact_kcal")));
});

Deno.test("clarifying_question: kept when an assumption gives it a stake", () => {
  const analysis = parseMealAnalysis(
    modelOutput({
      assumptions: [
        { subject: "cooking_fat", assumption: "Maybe oil.", basis: "standard_default" },
      ],
      clarifying_question: "Did you cook these with any oil or butter?",
    }),
    [ID_A],
  );
  assertEquals(analysis.clarifying_question, "Did you cook these with any oil or butter?");
});

Deno.test("clarifying_question: kept when the image is not clear", () => {
  const analysis = parseMealAnalysis(
    modelOutput({
      image_quality: "partial",
      clarifying_question: "Is there anything under the rice I cannot see?",
    }),
    [ID_A],
  );
  assertEquals(analysis.clarifying_question, "Is there anything under the rice I cannot see?");
});

Deno.test("clarifying_question: DROPPED when nothing is at stake", () => {
  // "Clarify only if the ambiguity changes the action" (§3.3bis), enforced
  // rather than requested. A clear image with nothing assumed has no doubt to
  // resolve, so the question is an interrogation and the drop is recorded.
  const analysis = parseMealAnalysis(
    modelOutput({
      image_quality: "clear",
      assumptions: [],
      clarifying_question: "What kind of rice is that?",
    }),
    [ID_A],
  );
  assertEquals(analysis.clarifying_question, null);
  assert(analysis.issues.some((i) => i.includes("clarifying_question: dropped")));
});

Deno.test("clarifying_question: two questions is a defect, the first is kept", () => {
  const analysis = parseMealAnalysis(
    modelOutput({
      image_quality: "partial",
      clarifying_question: ["Was there oil?", "And how much rice?"],
    }),
    [ID_A],
  );
  assertEquals(analysis.clarifying_question, "Was there oil?");
  assert(analysis.issues.some((i) => i.includes("kept the first")));
});

Deno.test("clarifying_question: a question asking for a quantity is redacted", () => {
  const analysis = parseMealAnalysis(
    modelOutput({
      image_quality: "partial",
      clarifying_question: "Roughly 300 kcal of rice there, or more?",
    }),
    [ID_A],
  );
  assert(!/300\s*kcal/i.test(String(analysis.clarifying_question)));
  assert(analysis.dropped_measurement_fields.length > 0);
});

Deno.test("recognized payload carries assumptions + question for coach/webhook", () => {
  const analysis = parseMealAnalysis(
    modelOutput({
      assumptions: [
        { subject: "cooking_fat", assumption: "Maybe oil.", basis: "standard_default" },
      ],
      clarifying_question: "Cooked with oil?",
    }),
    [ID_A],
  );
  const payload = buildRecognizedPayload({
    analysis,
    binding: { kind: "explicit", commitmentId: ID_A },
    model: "test-model",
  });
  assertEquals((payload.assumptions as unknown[]).length, 1);
  assertEquals(payload.clarifying_question, "Cooked with oil?");
  assertEquals(payload.analysis_version, "meal_analysis.en.v3");
});

// ---- the acknowledgement: ONE uncertainty form, never two ------------------

Deno.test("ack: the clarifying question supersedes the generic caveat", () => {
  const analysis = parseMealAnalysis(
    modelOutput({
      overall_confidence: 0.2, // -> confidence_band "low"
      assumptions: [
        { subject: "cooking_fat", assumption: "Maybe oil.", basis: "standard_default" },
      ],
      clarifying_question: "Did you cook these with oil?",
    }),
    [ID_A],
  );
  const text = renderMealPhotoAck({
    analysis,
    binding: { kind: "explicit", commitmentId: ID_A },
    commitmentTitles: { [ID_A]: "Protocol breakfast" },
    hasPrescription: true,
    tickedDish: null,
    locale: "en",
  });
  assert(text.includes("Did you cook these with oil?"));
  // Not stacked: one form of doubt per message (§3.3bis, anti-interrogatoire).
  assert(!text.includes("I am not confident"));
  assert(!text.includes("Tell me if that is wrong"));
});

Deno.test("ack: a standard_default assumption is stated with a correction door", () => {
  const analysis = parseMealAnalysis(
    modelOutput({
      assumptions: [
        {
          subject: "cooking_fat",
          assumption: "I assumed the broccoli was tossed in oil.",
          basis: "standard_default",
        },
      ],
    }),
    [ID_A],
  );
  const text = renderMealPhotoAck({
    analysis,
    binding: { kind: "explicit", commitmentId: ID_A },
    commitmentTitles: { [ID_A]: "Protocol breakfast" },
    hasPrescription: true,
    tickedDish: null,
    locale: "en",
  });
  assert(text.includes("I assumed the broccoli was tossed in oil."));
  assert(text.includes("Tell me if that is wrong."));
});

Deno.test("ack: a visible_cue assumption is NOT surfaced to the student", () => {
  // Asking someone to confirm what the photo plainly shows is noise, and noise
  // is what makes a student stop reading the acknowledgement.
  const analysis = parseMealAnalysis(
    modelOutput({
      overall_confidence: 0.9,
      assumptions: [
        { subject: "cooking_fat", assumption: "Seared, visibly.", basis: "visible_cue" },
      ],
    }),
    [ID_A],
  );
  const text = renderMealPhotoAck({
    analysis,
    binding: { kind: "explicit", commitmentId: ID_A },
    commitmentTitles: { [ID_A]: "Protocol breakfast" },
    hasPrescription: true,
    tickedDish: null,
    locale: "en",
  });
  assert(!text.includes("Seared, visibly."));
  assert(!text.includes("Tell me if that is wrong"));
});

Deno.test("ack: still carries no number, whatever the new fields contain", () => {
  const analysis = parseMealAnalysis(
    modelOutput({
      image_quality: "partial",
      assumptions: [
        { subject: "cooking_fat", assumption: "Oil, roughly 2 tablespoons.", basis: "standard_default" },
      ],
      clarifying_question: "Was that around 150 kcal of oil?",
    }),
    [ID_A],
  );
  const text = renderMealPhotoAck({
    analysis,
    binding: { kind: "explicit", commitmentId: ID_A },
    commitmentTitles: { [ID_A]: "Protocol breakfast" },
    hasPrescription: true,
    tickedDish: null,
    locale: "en",
  });
  assert(!/kcal|calorie/i.test(text));
});

Deno.test("prompt v3: the two new fields are specified, the calorie ban is not", () => {
  const p = MEAL_ANALYSIS_SYSTEM_PROMPT;
  assert(p.includes("assumptions"));
  assert(p.includes("clarifying_question"));
  assert(p.includes("visible_cue"));
  assert(p.includes("standard_default"));
  // The ban that P0.0bis kept, still verbatim in the prompt.
  assert(p.includes("YOU ARE NOT A CALORIE COUNTER"));
  assert(p.includes("NONE of this authorizes a number"));
  // And the question rule is stated as a stake, not as a style preference.
  assert(p.includes("One question maximum"));
});

// ---------------------------------------------------------------------------
// FILTER 3 — le filtre de SUJET
//
// Le défaut que ces tests ferment a été MESURÉ (QA AGENT-3, P1-4): la même
// capture d'écran d'app de livraison, analysée deux fois de suite, a rendu
// `partial` avec six groupes alimentaires au premier run et `unusable` au
// second. Le premier n'a rien crédité par accident. Ce qui suit rend le
// comportement déterministe, quel que soit l'humeur du modèle ce jour-là.
// ---------------------------------------------------------------------------

Deno.test("subject: `food_not_eaten` vide l'analyse — un menu n'est pas un repas", () => {
  // Le cas dangereux, et le seul que le prompt seul ne suffisait pas à tenir:
  // les aliments détectés sont RÉELS, donc tout l'aval veut les créditer.
  const analysis = parseMealAnalysis(
    modelOutput({ subject_kind: "food_not_eaten" }),
    [ID_A],
  );
  assertEquals(analysis.subject_kind, "food_not_eaten");
  assertEquals(analysis.detected_foods.length, 0);
  assertEquals(analysis.food_groups_present.length, 0);
  assertEquals(analysis.food_groups_absent.length, 0);
  assertEquals(analysis.commitment_matches.length, 0);
  assertEquals(analysis.assumptions.length, 0);
  assertEquals(analysis.clarifying_question, null);
  assertEquals(analysis.portion_band, "unclear");
  // Vidé, jamais en silence: l'audit doit porter la trace du désaccord avec le
  // prompt, sinon on ne saura jamais que le prompt doit être corrigé.
  assert(
    analysis.issues.some((i) => i.includes("food_not_eaten")),
    analysis.issues.join(" | "),
  );
  assertEquals(mealDisqualification(analysis), "food_not_eaten");
});

Deno.test("subject: `not_food` vide l'analyse et disqualifie", () => {
  const analysis = parseMealAnalysis(
    modelOutput({ subject_kind: "not_food" }),
    [ID_A],
  );
  assertEquals(analysis.detected_foods.length, 0);
  assertEquals(analysis.commitment_matches.length, 0);
  assertEquals(mealDisqualification(analysis), "not_food");
});

Deno.test("subject: le crédit par contenu ne peut plus partir d'un menu", () => {
  // La preuve de bout en bout: `resolveFoodGroupCredit` lit l'analyse, et
  // l'analyse vidée ne peut plus rien lui donner à créditer. C'est ce chemin
  // exact qui aurait crédité une commande jamais mangée.
  const commitments: MealAnalysisCommitmentContext[] = [{
    id: ID_A,
    title: "Whole grain at breakfast",
    student_instruction: null,
    polarity: "do",
    activity_class: "nutrition",
    slot_key: "breakfast",
    measure: "presence",
    unit: null,
    target_op: "at_least",
    target_min: 1,
    target_max: null,
    food_group_ref: "whole_grain",
    substance_ref: null,
    evaluation_grain: "day",
    autonomy: "flexible",
    priority: "core",
    content: null,
  }];

  const eaten = parseMealAnalysis(modelOutput({}), [ID_A]);
  const menu = parseMealAnalysis(
    modelOutput({ subject_kind: "food_not_eaten" }),
    [ID_A],
  );

  // Même entrée modèle, même plan: seul le sujet change.
  assertEquals(
    resolveFoodGroupCredit({ analysis: eaten, commitmentsToday: commitments })
      .foodGroupRef,
    "whole_grain",
  );
  assertEquals(
    resolveFoodGroupCredit({ analysis: menu, commitmentsToday: commitments })
      .foodGroupRef,
    null,
  );
});

Deno.test("subject: absent ou inconnu retombe sur `eaten_meal`, et le dit", () => {
  // Le sens du repli est un arbitrage, pas un hasard: une analyse dégradée ne
  // doit pas coûter à l'élève le crédit d'un repas qu'il a vraiment mangé.
  // C'est le même arbitrage que « a saved photo with no verdict beats a lost
  // photo » côté upload.
  const raw = modelOutput({});
  delete (raw as Record<string, unknown>).subject_kind;
  const missing = parseMealAnalysis(raw, [ID_A]);
  assertEquals(missing.subject_kind, "eaten_meal");
  assertEquals(missing.detected_foods.length, 1);
  assertEquals(mealDisqualification(missing), null);
  assert(
    missing.issues.some((i) => i.startsWith("subject_kind:")),
    missing.issues.join(" | "),
  );

  const unknown = parseMealAnalysis(
    modelOutput({ subject_kind: "restaurant_menu" }),
    [ID_A],
  );
  assertEquals(unknown.subject_kind, "eaten_meal");
  assert(unknown.issues.some((i) => i.includes("restaurant_menu")));
});

Deno.test("subject: `image_quality` et `subject_kind` sont deux axes indépendants", () => {
  // LE défaut d'origine: une photo NETTE d'un menu recevait « I could not read
  // that photo », parce que le seul canal disponible pour dire « ceci n'est pas
  // un repas » était la qualité d'image.
  const sharpMenu = parseMealAnalysis(
    modelOutput({ image_quality: "clear", subject_kind: "food_not_eaten" }),
    [ID_A],
  );
  assertEquals(sharpMenu.image_quality, "clear");
  assertEquals(mealDisqualification(sharpMenu), "food_not_eaten");

  const message = ack({ analysis: sharpMenu, binding: { kind: "none" } });
  assert(!message.toLowerCase().includes("could not read"), message);
  assert(message.toLowerCase().includes("not eaten yet"), message);
});

Deno.test("subject: une lecture partielle n'est PAS jetée", () => {
  // `unusable` AVEC des aliments identifiés reste une lecture partielle d'un
  // vrai repas. Les deux conditions sont requises pour disqualifier, sans quoi
  // on perdrait une assiette réelle sur une photo médiocre.
  const partial = parseMealAnalysis(
    modelOutput({ image_quality: "unusable" }),
    [ID_A],
  );
  assertEquals(partial.detected_foods.length, 1);
  assertEquals(mealDisqualification(partial), null);

  const empty = parseMealAnalysis(
    modelOutput({
      image_quality: "unusable",
      detected_foods: [],
      food_groups_present: [],
      commitment_matches: [],
    }),
    [ID_A],
  );
  assertEquals(mealDisqualification(empty), "unreadable");
});

Deno.test("subject: les trois refus donnent trois phrases distinctes", () => {
  const say = (over: Record<string, unknown>) =>
    ack({
      analysis: parseMealAnalysis(modelOutput(over), [ID_A]),
      binding: { kind: "none" },
    });

  const notFood = say({ subject_kind: "not_food" });
  const notEaten = say({ subject_kind: "food_not_eaten" });
  const unreadable = say({
    image_quality: "unusable",
    detected_foods: [],
    food_groups_present: [],
    commitment_matches: [],
  });

  assertEquals(new Set([notFood, notEaten, unreadable]).size, 3);
  // Aucune des trois ne prétend avoir compté quoi que ce soit, et aucune ne
  // porte de chiffre (la garde d'affichage du contrat vaut aussi ici).
  for (const m of [notFood, notEaten, unreadable]) {
    assert(!m.includes("Counted toward"), m);
    assert(!/\d/.test(m), m);
  }
});

Deno.test("prompt v3: le filtre de sujet est spécifié avant tout le reste", () => {
  const p = MEAL_ANALYSIS_SYSTEM_PROMPT;
  assert(p.includes("subject_kind"));
  assert(p.includes("eaten_meal"));
  assert(p.includes("food_not_eaten"));
  assert(p.includes("not_food"));
  // Le cas dangereux est nommé explicitement, avec l'instinct qu'il faut
  // combattre — c'est ce qui distingue une consigne d'une liste de tokens.
  assert(p.includes("has not eaten the menu"));
  // Et la question du sujet est posée AVANT la règle des calories, parce que
  // c'est une garde: ce qui n'est pas un repas n'a pas à être analysé du tout.
  assert(p.indexOf("subject_kind") < p.indexOf("YOU ARE NOT A CALORIE COUNTER"));
});

// ---------------------------------------------------------------------------
// LE PLAT PRÉVU, COCHÉ — l'effet durable doit s'annoncer
//
// `binding` garde contre « un accusé sans effet ». `tickedDish` garde contre le
// défaut symétrique: « un effet sans accusé ». Une coche est une ligne écrite
// dans `protocol_events`; la taire laisserait l'élève découvrir une case cochée
// qu'il n'a pas cochée, sans savoir ni pourquoi ni comment la retirer.
// ---------------------------------------------------------------------------

Deno.test("ack: le plat coché est NOMMÉ, avec la porte de correction", () => {
  const analysis = analysisWithGroups(["berries"]);
  const message = renderMealPhotoAck({
    analysis,
    binding: { kind: "none" },
    credit: null,
    commitmentTitles: {},
    hasPrescription: false,
    tickedDish: "Greek yogurt oats with banana",
    locale: "en",
  });
  assert(message.includes("Greek yogurt oats with banana"), message);
  assert(message.includes("ticked it off"), message);
  // La porte est dans la MÊME phrase: une question séparée serait la seconde
  // forme de doute que §3.3bis interdit d'empiler.
  assert(message.includes("Tell me if that was not it"), message);
});

Deno.test("ack: sans coche, aucune phrase de plat prévu", () => {
  const analysis = analysisWithGroups(["berries"]);
  const message = renderMealPhotoAck({
    analysis,
    binding: { kind: "none" },
    credit: null,
    commitmentTitles: {},
    hasPrescription: false,
    tickedDish: null,
    locale: "en",
  });
  assert(!message.includes("ticked"), message);
  assert(!message.includes("planned"), message);
});

Deno.test("ack: tickedDish est REQUIS — l'absence n'est pas une réponse", () => {
  const analysis = analysisWithGroups(["berries"]);
  const args = {
    analysis,
    binding: { kind: "none" },
    commitmentTitles: {},
    hasPrescription: false,
    locale: "en",
  } as unknown as Parameters<typeof renderMealPhotoAck>[0];
  assertThrows(() => renderMealPhotoAck(args));
});
