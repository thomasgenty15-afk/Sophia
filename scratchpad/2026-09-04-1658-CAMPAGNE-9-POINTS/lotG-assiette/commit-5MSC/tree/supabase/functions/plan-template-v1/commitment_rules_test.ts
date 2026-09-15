import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  AUTO_SOURCE,
  COMMITMENT_ENUMS,
  type DraftCommitment,
  validateDraftCommitment,
  validateTemplateCommitments,
} from "./commitment_rules.ts";

/**
 * These tests pin the client/server mirror described in commitment_rules.ts:
 * the review screen validates as the coach types, the server re-validates, and
 * both must reject the SAME lines. Every case below is a CHECK constraint of
 * `plan_commitments` (migration 20260727090000) restated as a test.
 */

// Fixture 1 line 1 of docs/keel/SCHEMA.md — the commissioning use case.
function vitaminD3(): DraftCommitment {
  return {
    template_commitment_key: "vitamin_d3_breakfast",
    title: "Vitamin D3 5000 IU",
    student_instruction: "With your breakfast fat source.",
    content_locale: "en-US",
    polarity: "do",
    activity_class: "supplement",
    anchor_kind: "slot",
    slot_key: "breakfast",
    clock_local: null,
    tolerance_minutes: null,
    window_start_local: null,
    window_end_local: null,
    measure: "dose",
    unit: "IU",
    target_op: ">=",
    target_min: 5000,
    target_max: null,
    substance_ref: "vitamin_d3",
    food_group_ref: null,
    evidence_kind: "self_report",
    evidence_required: false,
    auto_source: null,
    counts_toward_adherence: true,
    evaluation_grain: "occasion",
    slot_kind: "nominal",
    scheduled_days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    required_days_per_week: 7,
    expected_occasions_per_day: 1,
    priority: "core",
    autonomy: "strict",
    flex_eligible: false,
    provenance: "clinician_ordered",
    requires_clinician_signoff: false,
    auto_generated: false,
    source_span: { page: 1, quote: "Vitamine D3 5000 UI au petit-déjeuner" },
  };
}

Deno.test("a valid fixture line produces zero issues", () => {
  assertEquals(validateDraftCommitment(vitaminD3()), []);
});

Deno.test("R7 corollary: measure='dose' without substance_ref is refused", () => {
  const line = { ...vitaminD3(), substance_ref: null };
  const issues = validateDraftCommitment(line);
  assert(
    issues.some((i) => i.includes("plan_commitments_substance_ref_check")),
    `expected the substance_ref CHECK to fire, got ${JSON.stringify(issues)}`,
  );
});

Deno.test("R7 corollary applies to micronutrient too", () => {
  const line = {
    ...vitaminD3(),
    measure: "micronutrient",
    substance_ref: null,
    anchor_kind: "free",
    slot_key: null,
    slot_kind: null,
    evaluation_grain: "day",
  };
  assert(
    validateDraftCommitment(line).some((i) =>
      i.includes("plan_commitments_substance_ref_check")
    ),
  );
});

Deno.test("anchor CHECK: 'slot' forbids clock_local", () => {
  const issues = validateDraftCommitment({ ...vitaminD3(), clock_local: "07:30" });
  assert(issues.some((i) => i.includes("plan_commitments_anchor_check")));
});

Deno.test("anchor CHECK: 'slot' MAY carry a window (fixture 3 exception)", () => {
  const issues = validateDraftCommitment({
    ...vitaminD3(),
    window_start_local: "07:00",
    window_end_local: "09:30",
  });
  assertEquals(issues, []);
});

Deno.test("anchor CHECK: a half window on a slot is refused", () => {
  const issues = validateDraftCommitment({ ...vitaminD3(), window_start_local: "07:00" });
  assert(issues.some((i) => i.includes("BOTH window_start_local and window_end_local")));
});

Deno.test("anchor CHECK: 'free' forbids every anchor column", () => {
  const issues = validateDraftCommitment({
    ...vitaminD3(),
    anchor_kind: "free",
    evaluation_grain: "day",
  });
  assert(issues.some((i) => i.includes("anchor_kind='free' forbids every anchor column")));
});

Deno.test("anchor CHECK: 'window' requires both bounds and forbids the slot", () => {
  const issues = validateDraftCommitment({
    ...vitaminD3(),
    anchor_kind: "window",
    window_start_local: "06:00",
    window_end_local: "10:00",
  });
  assert(issues.some((i) => i.includes("forbids slot_key")));
});

Deno.test("occasion grain CHECK: grain='occasion' cannot ride a 'free' anchor", () => {
  const issues = validateDraftCommitment({
    ...vitaminD3(),
    anchor_kind: "free",
    slot_key: null,
    slot_kind: null,
  });
  assert(issues.some((i) => i.includes("plan_commitments_occasion_anchor_check")));
});

Deno.test("nominal slot CHECK: nominal + any_meal is refused", () => {
  const issues = validateDraftCommitment({ ...vitaminD3(), slot_key: "any_meal" });
  assert(issues.some((i) => i.includes("plan_commitments_nominal_slot_check")));
});

Deno.test("avoid grain CHECK: polarity='avoid' at occasion grain is refused", () => {
  const issues = validateDraftCommitment({
    ...vitaminD3(),
    polarity: "avoid",
    measure: "presence",
    substance_ref: "alcohol",
  });
  assert(issues.some((i) => i.includes("plan_commitments_avoid_grain_check")));
});

Deno.test("target CHECK: each operator requires exactly its own columns", () => {
  const cases: Array<[Record<string, unknown>, string]> = [
    [{ target_op: ">=", target_min: null }, "requires target_min"],
    [{ target_op: ">=", target_min: 10, target_max: 20 }, "forbids target_max"],
    [{ target_op: "<=", target_min: 10, target_max: null }, "requires target_max"],
    [{ target_op: "between", target_min: 9, target_max: 7 }, "target_min must be <= target_max"],
    [{ target_op: "any", target_min: 5 }, "forbids target_min and target_max"],
  ];
  for (const [patch, expected] of cases) {
    const issues = validateDraftCommitment({ ...vitaminD3(), ...patch });
    assert(
      issues.some((i) => i.includes(expected)),
      `patch ${JSON.stringify(patch)} should report "${expected}", got ${JSON.stringify(issues)}`,
    );
  }
});

Deno.test("'between' accepts min <= max", () => {
  const issues = validateDraftCommitment({
    ...vitaminD3(),
    target_op: "between",
    target_min: 7,
    target_max: 9,
  });
  assertEquals(issues, []);
});

Deno.test("R7: an unknown token is named, never silently dropped", () => {
  const issues = validateDraftCommitment({ ...vitaminD3(), substance_ref: "unobtainium" });
  assert(issues.some((i) => i.startsWith("substance_ref:")));
  assert(issues.some((i) => i.includes("unobtainium")));
});

Deno.test("R7: a French weekday alias is accepted on input (tokens.ts aliases)", () => {
  // The alias exists precisely because 'dimanche' has already shipped in this
  // repo's jsonb. It normalizes; it does not become an issue.
  const issues = validateDraftCommitment({
    ...vitaminD3(),
    scheduled_days: ["lundi", "dimanche"],
  });
  assertEquals(issues, []);
});

Deno.test("R2: a line with no content_locale is refused", () => {
  const issues = validateDraftCommitment({ ...vitaminD3(), content_locale: "" });
  assert(issues.some((i) => i.includes("content_locale")));
});

Deno.test("required_days_per_week stays inside 0..7 — it IS the denominator", () => {
  assert(
    validateDraftCommitment({ ...vitaminD3(), required_days_per_week: 8 })
      .some((i) => i.includes("required_days_per_week")),
  );
});

Deno.test("time literals must be HH:MM", () => {
  const issues = validateDraftCommitment({
    ...vitaminD3(),
    anchor_kind: "clock",
    slot_key: null,
    slot_kind: null,
    clock_local: "25:00",
  });
  assert(issues.some((i) => i.includes("clock_local: expected HH:MM")));
});

Deno.test("auto_source is a closed vocabulary", () => {
  assert(
    validateDraftCommitment({ ...vitaminD3(), auto_source: "fitbit" })
      .some((i) => i.includes("auto_source")),
  );
  for (const src of AUTO_SOURCE) {
    assertEquals(validateDraftCommitment({ ...vitaminD3(), auto_source: src }), []);
  }
});

Deno.test("duplicate template_commitment_key is refused (ambiguous publish diff)", () => {
  const findings = validateTemplateCommitments([vitaminD3(), vitaminD3()]);
  assertEquals(findings.length, 1);
  assertEquals(findings[0].index, 1);
  assert(findings[0].issues.some((i) => i.includes("duplicate of line 1")));
});

Deno.test("a template line with no key is refused at SAVE, not at publish", () => {
  const findings = validateTemplateCommitments([
    { ...vitaminD3(), template_commitment_key: null },
  ]);
  assertEquals(findings.length, 1);
  assert(findings[0].issues.some((i) => i.includes("template_commitment_key: required")));
});

Deno.test("a template key must be an ASCII snake_case token (R1)", () => {
  const findings = validateTemplateCommitments([
    { ...vitaminD3(), template_commitment_key: "Vitamine D3 !" },
  ]);
  assert(findings[0].issues.some((i) => i.includes("not an ASCII snake_case token")));
});

Deno.test("a non-array commitments payload is refused loudly", () => {
  const findings = validateTemplateCommitments("nope");
  assertEquals(findings, [{ index: -1, issues: ["commitments: must be an array"] }]);
});

Deno.test("COMMITMENT_ENUMS ships every axis the editor must offer", () => {
  // If an axis disappears from this list, a selector silently becomes a free
  // text field — the exact way a closed vocabulary (R7) leaks.
  const axes = [
    "polarity",
    "activity_class",
    "anchor_kind",
    "slot_key",
    "measure",
    "unit",
    "target_op",
    "evidence_kind",
    "auto_source",
    "evaluation_grain",
    "slot_kind",
    "scheduled_days",
    "priority",
    "autonomy",
    "provenance",
  ];
  for (const axis of axes) {
    const values = (COMMITMENT_ENUMS as Record<string, readonly string[]>)[axis];
    assert(Array.isArray(values) && values.length > 0, `enum ${axis} is missing or empty`);
  }
});
