import { assert, assertEquals } from "jsr:@std/assert@1";
import { validateImportPayload } from "./import_rules.ts";

/**
 * THE DEMO PLAN, END TO END.
 *
 * `supabase/tests/keel/sample_coach_plan.txt` is a real four-week protocol written
 * by a dietitian (Dana Whitfield, CN). It is the document the founder pastes into
 * /keel/import, and the screen it produces is the first thing anyone sees of this
 * product. It has to come out with ZERO lines the database would refuse.
 *
 * Two fixtures, one file:
 *
 *   BEFORE — the five lines the extractor actually got wrong on this document.
 *            Three were refused by `plan_commitments` at publish time and the
 *            coach met them as constraint names; two were accepted while encoding
 *            the wrong question. The test asserts the gate now catches all five,
 *            in words a dietitian can act on.
 *
 *   AFTER  — the whole plan modelled the way the MODELLING RULES of
 *            `plan_import.en.ts` prescribe. This is the reference the prompt aims
 *            at, and it is what "0 blocking" means concretely. If a rule is ever
 *            relaxed, this fixture stops being clean and this test says so.
 *
 * What this file does NOT prove: that the model emits the AFTER shape. That is a
 * live run, and it is pinned by re-running the import against this same document
 * (docs/keel/RUNBOOK.md). What it DOES prove is that the AFTER shape is coherent
 * with every CHECK constraint plus the semantic rules, and that the BEFORE shape
 * can no longer reach a coach unflagged.
 */

const LOCALE = "en-US";

type Line = Record<string, unknown>;

function line(over: Line): Line {
  return {
    polarity: "do",
    activity_class: "nutrition",
    anchor_kind: "free",
    slot_key: null,
    clock_local: null,
    window_start_local: null,
    window_end_local: null,
    unit: null,
    target_op: "any",
    target_min: null,
    target_max: null,
    substance_ref: null,
    food_group_ref: null,
    evidence_kind: "self_report",
    evaluation_grain: "day",
    slot_kind: null,
    scheduled_days: null,
    required_days_per_week: null,
    expected_occasions_per_day: 1,
    priority: "core",
    measure: "presence",
    content: {},
    content_locale: "en",
    confidence: 0.85,
    ...over,
  };
}

// ===========================================================================
// BEFORE — what the extractor produced, verbatim
// ===========================================================================

const BEFORE: Line[] = [
  // Refused by plan_commitments: '<=' with the bound in target_min, and an
  // occasion grain on a free anchor. Also semantically wrong: a 90-minute
  // deadline is not a 90-minute activity.
  line({
    template_commitment_key: "breakfast_within_90_minutes_of_waking",
    title: "Breakfast within 90 minutes of waking",
    measure: "duration",
    unit: "min",
    target_op: "<=",
    target_min: 90,
    evaluation_grain: "occasion",
    anchor_kind: "free",
    source_span: { quote: "Breakfast within 90 minutes of waking." },
  }),
  // Refused: anchor_kind 'clock' with no clock_local, plus the same bound error.
  line({
    template_commitment_key: "lights_out_by_23_00_on_weeknights",
    title: "Lights out by 23:00 on weeknights",
    activity_class: "sleep",
    measure: "clock_time",
    unit: "hhmm",
    target_op: "<=",
    target_min: 2300,
    anchor_kind: "clock",
    clock_local: null,
    scheduled_days: ["mon", "tue", "wed", "thu", "fri"],
    source_span: { quote: "Lights out by 23:00 on weeknights." },
  }),
  // Refused on its KEY: a template key must start with a letter.
  line({
    template_commitment_key: "10_minutes_of_daylight_within_an_hour_of_waking",
    title: "10 minutes of daylight within an hour of waking",
    activity_class: "exposure",
    measure: "duration",
    unit: "min",
    target_op: ">=",
    target_min: 10,
    anchor_kind: "slot",
    slot_key: "on_waking",
    slot_kind: "nominal",
    evaluation_grain: "occasion",
    source_span: { quote: "10 minutes of daylight within an hour of waking" },
  }),
  // Accepted by the database, wrong for the coach: a co-ingestion rule turned
  // into a dose commitment with nothing to reach.
  line({
    template_commitment_key: "vitamin_c_with_iron",
    title: "Vitamin C with iron",
    activity_class: "supplement",
    measure: "dose",
    target_op: "any",
    substance_ref: "vitamin_c",
    source_span: { quote: "WITH a glass of orange juice or a vitamin C tablet." },
  }),
  // Accepted by the database, wrong for the student: at week grain the runtime
  // sums, so this reads "30 minutes across the whole week".
  line({
    template_commitment_key: "zone_2_cardio",
    title: "Zone 2 cardio, 3 sessions a week, 30 minutes minimum",
    activity_class: "movement",
    measure: "duration",
    unit: "min",
    target_op: ">=",
    target_min: 30,
    evaluation_grain: "week",
    required_days_per_week: 3,
    source_span: { quote: "Zone 2 cardio, 3 sessions a week, 30 minutes minimum." },
  }),
];

Deno.test("BEFORE: the five defects of the real import are all caught", () => {
  const out = validateImportPayload(BEFORE, [], LOCALE);

  // TWO lines the database still refuses, not three: the third defect was the
  // template key, and a key is a handle, not a prescription — it is repaired
  // silently rather than turned into a question nobody should be asked.
  assertEquals(out.blockingCount, 2);
  // Four lines reach the coach flagged; the key-only one comes out clean.
  assertEquals(out.needsReviewCount, 4);

  const byKey = new Map(
    out.commitments.map((c) => [c.title, c.review_questions.map((q) => q.code)]),
  );
  assert(
    byKey.get("Breakfast within 90 minutes of waking")?.includes("target_bound_misplaced"),
  );
  assert(
    byKey.get("Breakfast within 90 minutes of waking")?.includes("occasion_without_moment"),
  );
  assert(byKey.get("Lights out by 23:00 on weeknights")?.includes("anchor_incomplete"));
  assert(byKey.get("Vitamin C with iron")?.includes("targetless_commitment"));
  assert(
    byKey.get("Zone 2 cardio, 3 sessions a week, 30 minutes minimum")?.includes(
      "weekly_magnitude_summed",
    ),
  );

  // The key defect never becomes a question: a coach is not asked to rename a
  // line they never named.
  const daylight = out.commitments.find((c) => c.title.startsWith("10 minutes"));
  assert(daylight);
  assert(/^[a-z][a-z0-9_]*$/.test(daylight.template_commitment_key));
  assertEquals(daylight.review_questions.length, 0);

  // Not one sentence the coach reads contains a constraint name.
  for (const c of out.commitments) {
    for (const s of c.validation_issues) {
      assert(!s.includes("plan_commitments"), s);
      assert(!s.includes("_check:"), s);
    }
  }
});

// ===========================================================================
// AFTER — the whole plan, modelled per the MODELLING RULES
// ===========================================================================

const AFTER: Line[] = [
  line({
    template_commitment_key: "protein_every_meal",
    title: "Protein at every meal (palm-sized portion, 3x a day)",
    measure: "serving",
    unit: "serving",
    target_op: ">=",
    target_min: 1,
    food_group_ref: "lean_protein",
    anchor_kind: "slot",
    slot_key: "any_meal",
    slot_kind: "opportunistic",
    evaluation_grain: "occasion",
    expected_occasions_per_day: 3,
    required_days_per_week: 7,
    content: { portion_cue: "palm-sized", examples: ["chicken", "fish", "eggs", "greek yogurt", "tofu", "lentils"] },
    source_span: { quote: "Protein at every meal. Aim for a palm-sized portion — 3 times a day." },
  }),
  line({
    template_commitment_key: "non_starchy_veg_daily",
    title: "Two servings of non-starchy vegetables every day",
    measure: "serving",
    unit: "serving",
    target_op: ">=",
    target_min: 2,
    food_group_ref: "non_starchy_veg",
    evaluation_grain: "day",
    required_days_per_week: 7,
    content: { portion_cue: "one fist = one serving", frozen_ok: true },
    source_span: { quote: "Two servings of non-starchy vegetables every day." },
  }),
  // M4: the 90 minutes is a deadline, kept in content — not a duration target.
  line({
    template_commitment_key: "breakfast_within_90min",
    title: "Breakfast within 90 minutes of waking",
    measure: "presence",
    target_op: "any",
    anchor_kind: "slot",
    slot_key: "breakfast",
    slot_kind: "nominal",
    evaluation_grain: "occasion",
    required_days_per_week: 7,
    content: { timing_rule: "within 90 minutes of waking" },
    source_span: { quote: "Breakfast within 90 minutes of waking." },
  }),
  line({
    template_commitment_key: "vitamin_d3_breakfast",
    title: "Vitamin D3 5000 IU with breakfast",
    activity_class: "supplement",
    measure: "dose",
    unit: "IU",
    target_op: ">=",
    target_min: 5000,
    substance_ref: "vitamin_d3",
    anchor_kind: "slot",
    slot_key: "breakfast",
    slot_kind: "nominal",
    evaluation_grain: "occasion",
    required_days_per_week: 7,
    content: { with_fat: true, clinician: "Dr. Reyes signed off on this dose given your 21 ng/mL" },
    source_span: { quote: "Vitamin D3, 5000 IU, with breakfast (with fat — do not take it on an empty stomach)." },
  }),
  line({
    template_commitment_key: "iron_bisglycinate_waking",
    title: "Iron bisglycinate 25 mg on waking, fasted",
    activity_class: "supplement",
    measure: "dose",
    unit: "mg",
    target_op: ">=",
    target_min: 25,
    substance_ref: "iron_bisglycinate",
    anchor_kind: "slot",
    slot_key: "on_waking",
    slot_kind: "nominal",
    evaluation_grain: "occasion",
    required_days_per_week: 7,
    content: { fasted: true },
    source_span: { quote: "Iron bisglycinate 25 mg, first thing on waking, on an empty stomach" },
  }),
  line({
    template_commitment_key: "magnesium_glycinate_bed",
    title: "Magnesium glycinate 400 mg before bed",
    activity_class: "supplement",
    measure: "dose",
    unit: "mg",
    target_op: ">=",
    target_min: 400,
    substance_ref: "magnesium_glycinate",
    anchor_kind: "slot",
    slot_key: "before_bed",
    slot_kind: "nominal",
    evaluation_grain: "occasion",
    required_days_per_week: 7,
    source_span: { quote: "Magnesium glycinate 400 mg before bed." },
  }),
  // Multi-source target => micronutrient, not dose (NON-NEGOTIABLE 3).
  line({
    template_commitment_key: "omega3_epa_dha_daily",
    title: "Omega-3: 2 g of combined EPA+DHA per day, any source",
    activity_class: "nutrition",
    measure: "micronutrient",
    unit: "g",
    target_op: ">=",
    target_min: 2,
    substance_ref: "omega3_epa_dha",
    evaluation_grain: "day",
    required_days_per_week: 7,
    content: { any_source: "capsule or oily fish" },
    source_span: { quote: "Omega-3: 2 g of combined EPA+DHA per day." },
  }),
  line({
    template_commitment_key: "oily_fish_weekly",
    title: "Oily fish 3 times a week",
    measure: "serving",
    unit: "serving",
    target_op: ">=",
    target_min: 3,
    food_group_ref: "fatty_fish",
    evaluation_grain: "week",
    required_days_per_week: 3,
    source_span: { quote: "Oily fish 3 times a week (salmon, mackerel, sardines, trout)." },
  }),
  line({
    template_commitment_key: "legumes_weekly",
    title: "Legumes 3 times a week, on three different days",
    measure: "serving",
    unit: "serving",
    target_op: ">=",
    target_min: 3,
    food_group_ref: "legumes",
    evaluation_grain: "week",
    required_days_per_week: 3,
    content: { coach_note: "three different days, not three portions on Sunday" },
    source_span: { quote: "Legumes 3 times a week — and I mean three different days, not three portions on Sunday." },
  }),
  line({
    template_commitment_key: "no_alcohol_weekdays",
    title: "No alcohol Monday through Friday",
    polarity: "avoid",
    measure: "presence",
    target_op: "==",
    target_min: 0,
    substance_ref: "alcohol",
    evidence_kind: "none_implicit",
    evaluation_grain: "day",
    scheduled_days: ["mon", "tue", "wed", "thu", "fri"],
    source_span: { quote: "No alcohol Monday through Friday." },
  }),
  line({
    template_commitment_key: "no_added_sugar_after_dinner",
    title: "No added sugar after dinner",
    polarity: "avoid",
    measure: "presence",
    target_op: "==",
    target_min: 0,
    food_group_ref: "sugar_sweets",
    evidence_kind: "none_implicit",
    evaluation_grain: "day",
    required_days_per_week: 7,
    content: { exception: "fruit is fine" },
    source_span: { quote: "No added sugar after dinner. Fruit is fine." },
  }),
  // M6: sessions are counted; the 30-minute floor is a note, not a target.
  line({
    template_commitment_key: "zone2_cardio_weekly",
    title: "Zone 2 cardio, 3 sessions a week (30 minutes minimum)",
    activity_class: "movement",
    measure: "count",
    unit: "session",
    target_op: ">=",
    target_min: 3,
    evaluation_grain: "week",
    required_days_per_week: 3,
    content: { per_session: "30 minutes minimum", coach_note: "do not stack all three at the weekend" },
    source_span: { quote: "Zone 2 cardio, 3 sessions a week, 30 minutes minimum." },
  }),
  // M1 + M5: the bound is a ceiling, stored in target_max as numeric HHMM.
  line({
    template_commitment_key: "lights_out_2300",
    title: "Lights out by 23:00 on weeknights",
    activity_class: "sleep",
    measure: "clock_time",
    unit: "hhmm",
    target_op: "<=",
    target_min: null,
    target_max: 2300,
    anchor_kind: "clock",
    clock_local: "23:00",
    evaluation_grain: "day",
    scheduled_days: ["mon", "tue", "wed", "thu", "fri"],
    source_span: { quote: "Lights out by 23:00 on weeknights." },
  }),
  // M4 the other way round: here the 10 minutes IS what is performed.
  line({
    template_commitment_key: "daylight_10_min",
    title: "10 minutes of daylight within an hour of waking",
    activity_class: "exposure",
    measure: "duration",
    unit: "min",
    target_op: ">=",
    target_min: 10,
    anchor_kind: "slot",
    slot_key: "on_waking",
    slot_kind: "nominal",
    evaluation_grain: "occasion",
    required_days_per_week: 7,
    content: { timing_rule: "within an hour of waking" },
    source_span: { quote: "10 minutes of daylight within an hour of waking" },
  }),
  line({
    template_commitment_key: "weigh_weekly_saturday",
    title: "Weigh once a week, Saturday morning",
    polarity: "capture",
    activity_class: "measurement",
    measure: "count",
    unit: "none",
    target_op: ">=",
    target_min: 1,
    evidence_kind: "numeric_entry",
    evaluation_grain: "day",
    scheduled_days: ["sat"],
    content: { protocol: "after the bathroom, before eating" },
    source_span: { quote: "Weigh once a week, Saturday morning, after the bathroom, before eating." },
  }),
  // A capture line is complete with no target: the recording IS the evaluation.
  line({
    template_commitment_key: "energy_rating_evening",
    title: "Rate your energy 0-10 each evening",
    polarity: "capture",
    activity_class: "measurement",
    measure: "scale",
    unit: "point",
    target_op: "any",
    evidence_kind: "numeric_entry",
    anchor_kind: "slot",
    slot_key: "before_bed",
    slot_kind: "nominal",
    evaluation_grain: "occasion",
    required_days_per_week: 7,
    content: { range: "0-10" },
    source_span: { quote: "Rate your energy 0-10 each evening." },
  }),
  line({
    template_commitment_key: "breakfast_photo",
    title: "Photograph your breakfast every day (first two weeks)",
    polarity: "capture",
    activity_class: "measurement",
    measure: "count",
    unit: "none",
    target_op: ">=",
    target_min: 1,
    evidence_kind: "photo",
    anchor_kind: "slot",
    slot_key: "breakfast",
    slot_kind: "nominal",
    evaluation_grain: "occasion",
    required_days_per_week: 7,
    content: { duration: "first two weeks only" },
    source_span: { quote: "Photograph your breakfast every day for the first two weeks." },
  }),
];

const AFTER_RELATIONS = [
  {
    kind: "requires_cofactor",
    subject_key: "iron_bisglycinate_waking",
    object_key: null,
    object_note: null,
    cofactor_ref: "citrus",
    param_minutes: null,
    student_note:
      "Take the iron with a glass of orange juice or a vitamin C tablet — vitamin C roughly doubles absorption.",
    source_span: { quote: "WITH a glass of orange juice or a vitamin C tablet." },
    confidence: 0.9,
  },
  {
    kind: "separate_by_minutes",
    subject_key: "iron_bisglycinate_waking",
    object_key: null,
    object_note: "any dairy or calcium supplement",
    cofactor_ref: null,
    param_minutes: 120,
    student_note:
      "Keep at least 2 hours between the iron and any dairy or calcium supplement — they compete. Iron first, milk 2 hours later.",
    source_span: {
      quote: "keep the iron at least 2 hours away from any dairy or calcium supplement",
    },
    confidence: 0.95,
  },
];

Deno.test("AFTER: the whole plan produces ZERO lines the database would refuse", () => {
  const out = validateImportPayload(AFTER, AFTER_RELATIONS, LOCALE);

  const offenders = out.commitments
    .filter((c) => c.review_questions.length > 0)
    .map((c) => `${c.title}: ${c.diagnostics.join(" | ")}`);
  assertEquals(offenders, [], offenders.join("\n"));

  assertEquals(out.blockingCount, 0);
  assertEquals(out.needsReviewCount, 0);
  assertEquals(out.commitments.length, 17);
});

Deno.test("AFTER: every key is unique and R1-shaped", () => {
  const out = validateImportPayload(AFTER, [], LOCALE);
  const keys = out.commitments.map((c) => c.template_commitment_key);
  assertEquals(new Set(keys).size, keys.length);
  for (const k of keys) assert(/^[a-z][a-z0-9_]*$/.test(k) && k.length <= 40, k);
});

Deno.test("AFTER: the two iron rules travel as relations, and only one is storable today", () => {
  const out = validateImportPayload(AFTER, AFTER_RELATIONS, LOCALE);
  assertEquals(out.relations.length, 2);

  const cofactor = out.relations[0];
  assertEquals(cofactor.kind, "requires_cofactor");
  assertEquals(cofactor.persistable, true);

  // "2 hours away from any dairy" has no counterparty commitment in this plan,
  // and `commitment_relations.commitment_b` is a FK — so it cannot be a row.
  // It is still carried, and it still reaches the student.
  const separate = out.relations[1];
  assertEquals(separate.kind, "separate_by_minutes");
  assertEquals(separate.persistable, false);
  assertEquals(separate.param_minutes, 120);
  assertEquals(separate.review_questions, []);

  // Neither of them is a commitment, and neither of them blocks the import.
  assertEquals(out.blockingCount, 0);
});

Deno.test("AFTER: the three supplement lines still carry what the safety gate reads", () => {
  // The UL degradation (D3 5000 IU, magnesium 400 mg, iron on a levothyroxine
  // watchlist) is computed downstream from measure + substance_ref + target.
  // This test exists so that a change to the extraction cannot quietly take the
  // safety gate's inputs away.
  const out = validateImportPayload(AFTER, [], LOCALE);
  const supplements = out.commitments.filter((c) => c.measure === "dose");
  assertEquals(supplements.length, 3);
  for (const s of supplements) {
    assert(s.substance_ref !== null, `${s.title} lost its substance`);
    assert(s.target_min !== null, `${s.title} lost its dose`);
    assert(s.unit !== null, `${s.title} lost its unit`);
  }
  assertEquals(
    supplements.map((s) => `${s.substance_ref}:${s.target_min}${s.unit}`).sort(),
    ["iron_bisglycinate:25mg", "magnesium_glycinate:400mg", "vitamin_d3:5000IU"],
  );
});
