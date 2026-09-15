import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  canonicalTemplateKey,
  parseModelJson,
  retryFeedback,
  validateImportCommitment,
  validateImportPayload,
} from "./import_rules.ts";

/**
 * Every case in the first block is a line the extractor ACTUALLY produced on
 * `supabase/tests/keel/sample_coach_plan.txt` (a real dietitian's four-week
 * protocol, 19 lines). Three of them were refused by `plan_commitments`, and the
 * coach met the refusal as a Postgres constraint name. Two more were accepted by
 * the database while encoding the wrong question.
 *
 * These tests pin BOTH halves of the fix:
 *   - the gate catches the line (it never reaches a screen unflagged);
 *   - what the coach reads is a question, with no constraint name in it.
 */

const LOCALE = "en-US";

function base(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    template_commitment_key: "line",
    title: "A line",
    polarity: "do",
    activity_class: "nutrition",
    anchor_kind: "free",
    slot_key: null,
    clock_local: null,
    window_start_local: null,
    window_end_local: null,
    measure: "serving",
    unit: "serving",
    target_op: ">=",
    target_min: 1,
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
    content: {},
    content_locale: "en",
    source_span: { quote: "A line." },
    confidence: 0.9,
    ...over,
  };
}

function validate(raw: Record<string, unknown>) {
  return validateImportCommitment(raw, 0, new Set<string>(), LOCALE);
}

/** No verdict shown to a coach may contain the vocabulary of the database. */
function assertNoDatabaseVocabulary(sentences: string[]) {
  for (const s of sentences) {
    for (const forbidden of [
      "plan_commitments",
      "CHECK",
      "constraint",
      "target_op",
      "target_min",
      "target_max",
      "anchor_kind",
      "evaluation_grain",
      "slot_key",
      "substance_ref",
      "snake_case",
      "R1",
      "R7",
      "NOT NULL",
    ]) {
      assert(
        !s.includes(forbidden),
        `a coach-facing sentence leaked "${forbidden}": ${s}`,
      );
    }
  }
}

// ===========================================================================
// A1 — "Breakfast within 90 minutes of waking"
// ===========================================================================

Deno.test("A1: 'Breakfast within 90 minutes of waking' as duration<=90 is caught, three ways", () => {
  // Verbatim shape of the line the extractor produced.
  const v = validate(base({
    title: "Breakfast within 90 minutes of waking",
    measure: "duration",
    unit: "min",
    target_op: "<=",
    target_min: 90,
    target_max: null,
    anchor_kind: "free",
    evaluation_grain: "occasion",
    source_span: { quote: "Breakfast within 90 minutes of waking." },
  }));

  assert(v.blocking, "the database would refuse this row");
  assert(v.needs_review);

  const codes = v.review_questions.map((q) => q.code);
  // (a) the bound is on the wrong side of the comparator...
  assert(codes.includes("target_bound_misplaced"), codes.join(","));
  // (b) ...and an occasion-grain line has no moment to open.
  assert(codes.includes("occasion_without_moment"), codes.join(","));

  assertNoDatabaseVocabulary(v.validation_issues);
  // The question names the line and asks a question a dietitian can answer.
  assertStringIncludes(v.validation_issues.join(" "), "Breakfast within 90 minutes");
  assertStringIncludes(v.validation_issues.join(" "), "?");
});

Deno.test("A1: the semantically correct shape (presence @slot=breakfast) passes clean", () => {
  const v = validate(base({
    title: "Breakfast within 90 minutes of waking",
    activity_class: "nutrition",
    measure: "presence",
    unit: null,
    target_op: "any",
    target_min: null,
    target_max: null,
    anchor_kind: "slot",
    slot_key: "breakfast",
    slot_kind: "nominal",
    evaluation_grain: "occasion",
    required_days_per_week: 7,
    // The deadline is not lost: it lives in display-only content (R5).
    content: { timing_rule: "within 90 minutes of waking" },
  }));

  assertEquals(v.blocking, false);
  assertEquals(v.review_questions, []);
  assertEquals(v.needs_review, false);
});

// ===========================================================================
// A2 — "Lights out by 23:00 on weeknights"
// ===========================================================================

Deno.test("A2: 'clock' with no clock_local, and '<=' carrying target_min, is caught", () => {
  const v = validate(base({
    title: "Lights out by 23:00 on weeknights",
    activity_class: "sleep",
    measure: "clock_time",
    unit: "hhmm",
    target_op: "<=",
    target_min: 2300,
    target_max: null,
    anchor_kind: "clock",
    clock_local: null,
    evaluation_grain: "day",
    scheduled_days: ["mon", "tue", "wed", "thu", "fri"],
  }));

  assert(v.blocking);
  const codes = v.review_questions.map((q) => q.code);
  assert(codes.includes("target_bound_misplaced"), codes.join(","));
  assert(codes.includes("anchor_incomplete"), codes.join(","));
  assertNoDatabaseVocabulary(v.validation_issues);
  assertStringIncludes(v.validation_issues.join(" "), "At what time?");
});

Deno.test("A2: the corrected shape (clock 23:00, bound in target_max as HHMM) passes clean", () => {
  const v = validate(base({
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
  }));

  assertEquals(v.blocking, false);
  assertEquals(v.review_questions, []);
});

// ===========================================================================
// A3 — "10 minutes of daylight within an hour of waking"
// ===========================================================================

Deno.test("A3: a key starting with a digit is canonicalised, not turned into a question", () => {
  // The observed key. A coach must never be asked to rename a line.
  const taken = new Set<string>();
  const key = canonicalTemplateKey(
    "10_minutes_of_daylight_within_an_hour_of_waking",
    "10 minutes of daylight within an hour of waking",
    2,
    taken,
  );
  assert(/^[a-z][a-z0-9_]*$/.test(key), key);
  assert(key.length <= 40, key);
  // The number is not thrown away: "10 min" is what the line is about.
  assertStringIncludes(key, "10");
});

Deno.test("A3: canonicalisation covers an empty, an accented and a numeric-only proposal", () => {
  const taken = new Set<string>();
  assert(/^[a-z][a-z0-9_]*$/.test(canonicalTemplateKey(null, "", 0, taken)));
  assert(/^[a-z][a-z0-9_]*$/.test(canonicalTemplateKey("", "Protéines à chaque repas", 1, taken)));
  assert(/^[a-z][a-z0-9_]*$/.test(canonicalTemplateKey("2000", "2000", 2, taken)));
  assert(/^[a-z][a-z0-9_]*$/.test(canonicalTemplateKey("!!!", "!!!", 3, taken)));
});

Deno.test("A3: two lines never share a key — the publish diff would be ambiguous", () => {
  const taken = new Set<string>();
  const a = canonicalTemplateKey("protein_every_meal", "Protein at every meal", 0, taken);
  const b = canonicalTemplateKey("protein_every_meal", "Protein at every meal", 1, taken);
  const c = canonicalTemplateKey("protein_every_meal", "Protein at every meal", 2, taken);
  assertEquals(new Set([a, b, c]).size, 3);
  for (const k of [a, b, c]) assert(/^[a-z][a-z0-9_]*$/.test(k), k);
});

Deno.test("A3: the daylight line, correctly modelled, passes clean", () => {
  const v = validate(base({
    template_commitment_key: "daylight_10_min",
    title: "10 minutes of daylight within an hour of waking",
    activity_class: "exposure",
    measure: "duration",
    unit: "min",
    target_op: ">=",
    target_min: 10,
    target_max: null,
    anchor_kind: "slot",
    slot_key: "on_waking",
    slot_kind: "nominal",
    evaluation_grain: "occasion",
    required_days_per_week: 7,
    content: { timing_rule: "within an hour of waking" },
  }));
  assertEquals(v.blocking, false);
  assertEquals(v.review_questions, []);
  assertEquals(v.template_commitment_key, "daylight_10_min");
});

// ===========================================================================
// A4a — a relation is not a commitment
// ===========================================================================

Deno.test("A4a: 'Vitamin C with iron' as a targetless dose commitment is caught", () => {
  const v = validate(base({
    title: "Vitamin C with iron",
    activity_class: "supplement",
    measure: "dose",
    unit: null,
    target_op: "any",
    target_min: null,
    target_max: null,
    substance_ref: "vitamin_c",
    evaluation_grain: "day",
  }));

  const codes = v.review_questions.map((q) => q.code);
  assert(codes.includes("targetless_commitment"), codes.join(","));
  assert(v.needs_review);
  assertNoDatabaseVocabulary(v.validation_issues);
  // The question offers the way out: this is a rule about another line.
  assertStringIncludes(
    v.validation_issues.join(" "),
    "rule about another line",
  );
});

Deno.test("A4a: co-ingestion comes out as a relation, and relations never gain a target", () => {
  const payload = validateImportPayload(
    [
      base({
        template_commitment_key: "iron_bisglycinate_waking",
        title: "Iron bisglycinate 25 mg on waking",
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
      }),
    ],
    [
      {
        kind: "requires_cofactor",
        subject_key: "iron_bisglycinate_waking",
        object_key: null,
        object_note: null,
        cofactor_ref: "citrus",
        param_minutes: null,
        student_note:
          "Take the iron with a glass of orange juice or a vitamin C tablet — it roughly doubles absorption.",
        source_span: { quote: "WITH a glass of orange juice or a vitamin C tablet." },
        confidence: 0.9,
      },
    ],
    LOCALE,
  );

  assertEquals(payload.blockingCount, 0);
  assertEquals(payload.relations.length, 1);
  assertEquals(payload.relations[0].persistable, true);
  assertEquals(payload.relations[0].review_questions, []);
  // A relation carries no grade: no target field exists on it at all.
  assert(!("target_op" in payload.relations[0]));
});

Deno.test("A4a: 'keep iron 2 h from any dairy' survives as guidance when the other side is not a line", () => {
  const payload = validateImportPayload(
    [
      base({
        template_commitment_key: "iron_bisglycinate_waking",
        title: "Iron bisglycinate 25 mg on waking",
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
      }),
    ],
    [
      {
        kind: "separate_by_minutes",
        subject_key: "iron_bisglycinate_waking",
        object_key: null,
        object_note: "any dairy or calcium supplement",
        cofactor_ref: null,
        param_minutes: 120,
        student_note:
          "Keep at least 2 hours between the iron and any dairy or calcium supplement — they compete.",
        source_span: {
          quote: "keep the iron at least 2 hours away from any dairy or calcium supplement",
        },
        confidence: 0.9,
      },
    ],
    LOCALE,
  );

  const rel = payload.relations[0];
  // The plan has no calcium line, so `commitment_relations` cannot hold this row…
  assertEquals(rel.persistable, false);
  // …and it is NOT dropped: it is the only clinically load-bearing sentence here.
  assertEquals(rel.param_minutes, 120);
  assertStringIncludes(rel.student_note, "2 hours");
  assertEquals(rel.object_note, "any dairy or calcium supplement");
  // Not persistable is not the coach's problem: no question is raised about it.
  assertEquals(rel.review_questions, []);
  // The reason is recorded for us.
  assert(rel.diagnostics.some((d) => d.includes("carried as guidance only")));
  // And it never becomes a blocking commitment.
  assertEquals(payload.blockingCount, 0);
});

Deno.test("A4a: a relation pointing at a key nobody emitted is surfaced, not silently kept", () => {
  const payload = validateImportPayload(
    [base({ template_commitment_key: "iron_waking" })],
    [{
      kind: "co_ingest",
      subject_key: "iron_waking",
      object_key: "vitamin_c_line_that_does_not_exist",
      object_note: null,
      cofactor_ref: null,
      param_minutes: null,
      student_note: "Take them together.",
      source_span: { quote: "…" },
      confidence: 0.8,
    }],
    LOCALE,
  );
  const rel = payload.relations[0];
  assertEquals(rel.persistable, false);
  assert(rel.review_questions.some((q) => q.code === "relation_object_unresolved"));
  assertNoDatabaseVocabulary(rel.review_questions.map((q) => q.question));
});

// ===========================================================================
// A4b — a weekly frequency is not a weekly total
// ===========================================================================

Deno.test("A4b: duration>=30 at grain=week asks the wrong question, and is flagged", () => {
  const v = validate(base({
    title: "Zone 2 cardio, 3 sessions a week, 30 minutes minimum",
    activity_class: "movement",
    measure: "duration",
    unit: "min",
    target_op: ">=",
    target_min: 30,
    anchor_kind: "free",
    evaluation_grain: "week",
    required_days_per_week: 3,
  }));

  // The database ACCEPTS this row — which is exactly why the gate has to be
  // wider than the CHECK constraints.
  assertEquals(v.blocking, false);
  assert(v.needs_review);
  assert(v.review_questions.some((q) => q.code === "weekly_magnitude_summed"));
  assertNoDatabaseVocabulary(v.validation_issues);
  assertStringIncludes(v.validation_issues.join(" "), "each session");
});

Deno.test("A4b: counting sessions at grain=week, per-session floor kept as a note, passes clean", () => {
  const v = validate(base({
    title: "Zone 2 cardio, 3 sessions a week (30 minutes minimum)",
    activity_class: "movement",
    measure: "count",
    unit: "session",
    target_op: ">=",
    target_min: 3,
    anchor_kind: "free",
    evaluation_grain: "week",
    required_days_per_week: 3,
    content: { per_session: "30 minutes minimum" },
  }));
  assertEquals(v.blocking, false);
  assertEquals(v.review_questions, []);
});

Deno.test("A4b: a per-day magnitude is untouched — the rule is about week grain only", () => {
  const v = validate(base({
    title: "30 minutes of walking every day",
    activity_class: "movement",
    measure: "duration",
    unit: "min",
    target_op: ">=",
    target_min: 30,
    anchor_kind: "free",
    evaluation_grain: "day",
    required_days_per_week: 7,
  }));
  assertEquals(v.review_questions, []);
});

// ===========================================================================
// The gate itself
// ===========================================================================

Deno.test("no coach-facing sentence ever contains a constraint name, on any rule", () => {
  // One line breaking as many rules at once as the schema allows.
  const v = validate(base({
    title: "",
    polarity: "avoid",
    activity_class: "not_a_class",
    anchor_kind: "clock",
    clock_local: null,
    slot_key: "any_meal",
    slot_kind: "nominal",
    measure: "dose",
    unit: "mg",
    target_op: "<=",
    target_min: 400,
    target_max: null,
    substance_ref: "unobtainium",
    evaluation_grain: "occasion",
    required_days_per_week: 12,
    expected_occasions_per_day: 0,
    content_locale: "",
    source_span: { quote: "" },
    confidence: "n/a",
  }));

  assert(v.blocking);
  assert(v.review_questions.length >= 4, `only ${v.review_questions.length} questions`);
  assertNoDatabaseVocabulary(v.validation_issues);
  assertNoDatabaseVocabulary(v.review_questions.map((q) => q.question));
  // The raw rule text is kept — for us, in `diagnostics`, never in the payload
  // the screen renders.
  assert(v.diagnostics.some((d) => d.includes("plan_commitments_")));
});

Deno.test("every question is a question, and points at a field the editor can focus", () => {
  const v = validate(base({
    title: "Some line",
    anchor_kind: "clock",
    clock_local: null,
    target_op: "<=",
    target_min: 3,
    target_max: null,
  }));
  assert(v.review_questions.length > 0);
  for (const q of v.review_questions) {
    assertStringIncludes(q.question, "?");
    assert(q.code !== "", "every question carries a stable code for i18n");
    assert(q.field !== null, `no field to focus for ${q.code}`);
  }
});

Deno.test("an unmapped rule still produces a sentence, never raw rule text", () => {
  // `autonomy` is not extracted, so no mapper exists for it: the fallback path.
  const v = validate(base({ measure: "rpe", unit: "point", target_op: "any", target_min: null }));
  // (this line trips the semantic rule, not a token rule — the point is only
  //  that nothing raw ever reaches `validation_issues`)
  assertNoDatabaseVocabulary(v.validation_issues);
});

Deno.test("a clean line is clean: no question, no review, key preserved", () => {
  const v = validate(base({
    template_commitment_key: "protein_every_meal",
    title: "Protein at every meal",
    measure: "presence",
    unit: null,
    target_op: "any",
    target_min: null,
    anchor_kind: "slot",
    slot_key: "any_meal",
    slot_kind: "opportunistic",
    evaluation_grain: "occasion",
    expected_occasions_per_day: 3,
    food_group_ref: "lean_protein",
    confidence: 0.9,
  }));
  assertEquals(v.review_questions, []);
  assertEquals(v.blocking, false);
  assertEquals(v.needs_review, false);
  assertEquals(v.template_commitment_key, "protein_every_meal");
});

Deno.test("low confidence alone means review, never blocking", () => {
  const v = validate(base({ confidence: 0.4 }));
  assertEquals(v.blocking, false);
  assertEquals(v.needs_review, true);
  assertEquals(v.review_questions, []);
});

Deno.test("the retry correction carries the questions, and names no constraint to the model's reader", () => {
  const payload = validateImportPayload(
    [base({
      title: "Lights out by 23:00 on weeknights",
      measure: "clock_time",
      unit: "hhmm",
      target_op: "<=",
      target_min: 2300,
      anchor_kind: "clock",
      clock_local: null,
      evaluation_grain: "day",
    })],
    [],
    LOCALE,
  );
  const feedback = retryFeedback(payload);
  assertStringIncludes(feedback, "Lights out by 23:00");
  assertStringIncludes(feedback, "At what time?");
  // The model — unlike the coach — is allowed the precise rule text.
  assertStringIncludes(feedback, "rules broken:");
  assertStringIncludes(feedback, "do not invent targets");
});

Deno.test("nothing to correct means no retry", () => {
  const payload = validateImportPayload([base()], [], LOCALE);
  assertEquals(payload.blockingCount, 0);
  assertEquals(retryFeedback(payload), "");
});

Deno.test("a payload with no relations key parses to an empty relations array", () => {
  const out = parseModelJson('{"commitments":[],"gaps":[]}');
  assertEquals(out.relations, []);
  assertEquals(out.commitments, []);
  assertEquals(out.unparsed_spans, []);
});

Deno.test("fenced JSON is still read", () => {
  const out = parseModelJson('```json\n{"commitments":[{"title":"x"}],"relations":[]}\n```');
  assertEquals(out.commitments.length, 1);
});

// ---------------------------------------------------------------------------
// A pinned line whose moment is not qualified — the silent-inert-plan class
//
// MEASURED on a live import of `sample_coach_plan.txt`: the extractor returned
// `slot_kind: null` on all eighteen lines, publish accepted them, and
// `provision-day-v1` then skipped every one of them (`slot_kind_not_nominal`),
// seeding ZERO rows. The student's day never opened and the response was 200.
// These tests pin the belt AND both of its disarm conditions — a belt that also
// fires on the legal shapes is a belt somebody deletes.
// ---------------------------------------------------------------------------

Deno.test("slot-anchored line with no slot_kind is flagged for review, not blocked", () => {
  const v = validate(base({
    title: "Vitamin D3 5000 IU with breakfast",
    anchor_kind: "slot",
    slot_key: "breakfast",
    slot_kind: null,
    measure: "dose",
    unit: "IU",
    target_op: ">=",
    target_min: 5000,
    substance_ref: "vitamin_d3",
  }));
  assertEquals(v.needs_review, true);
  assertEquals(v.blocking, false);
  assertStringIncludes(v.validation_issues.join(" "), "Vitamin D3 5000 IU with breakfast");
  assertStringIncludes(v.validation_issues.join(" "), "?");
  assertNoDatabaseVocabulary(v.validation_issues);
});

Deno.test("disarm 1 — a free-anchored line has no moment to qualify", () => {
  const v = validate(base({
    title: "Omega-3 2 g per day",
    anchor_kind: "free",
    slot_key: null,
    slot_kind: null,
    measure: "dose",
    unit: "g",
    target_op: ">=",
    target_min: 2,
    substance_ref: "omega3_epa_dha",
  }));
  assertEquals(v.review_questions.filter((q) => q.code === "slot_kind_unset"), []);
});

Deno.test("disarm 2 — 'any_meal' forbids 'nominal', so null is its correct value", () => {
  const v = validate(base({
    title: "Protein at every meal",
    anchor_kind: "slot",
    slot_key: "any_meal",
    slot_kind: null,
    measure: "presence",
    unit: null,
    target_op: "any",
    target_min: null,
    evaluation_grain: "occasion",
    expected_occasions_per_day: 3,
    food_group_ref: "lean_protein",
  }));
  assertEquals(v.review_questions.filter((q) => q.code === "slot_kind_unset"), []);
  assertEquals(v.needs_review, false);
});

Deno.test("an answered moment raises nothing", () => {
  const v = validate(base({
    title: "Vitamin D3 5000 IU with breakfast",
    anchor_kind: "slot",
    slot_key: "breakfast",
    slot_kind: "nominal",
    measure: "dose",
    unit: "IU",
    target_op: ">=",
    target_min: 5000,
    substance_ref: "vitamin_d3",
  }));
  assertEquals(v.review_questions.filter((q) => q.code === "slot_kind_unset"), []);
  assertEquals(v.needs_review, false);
});
