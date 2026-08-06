/**
 * These are the OLD provenance-gate tests, TURNED AROUND (2026-07-28).
 *
 * They used to prove that a 5000 IU line above the 4000 IU UL was degraded —
 * dose stripped, student handed a food-first suggestion, coach handed a
 * "Mark as clinician-ordered" button. The product decision is that the coach is
 * the prescriber, so what has to be proved now is the opposite: the line is
 * left exactly as written, and the only thing this module produces is a note
 * for the coach's own eyes.
 */
import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  reviewSafety,
  type SafetyInput,
  type SubstanceInteractionRow,
  type SubstanceLimitRow,
} from "./safety.ts";

// Rows as seeded by migration 20260727090000.
const LIMITS: SubstanceLimitRow[] = [
  { substance_ref: "vitamin_d3", ul_amount: 4000, ul_unit: "IU", per: "day" },
  { substance_ref: "zinc", ul_amount: 40, ul_unit: "mg", per: "day" },
  { substance_ref: "selenium", ul_amount: 400, ul_unit: "mcg", per: "day" },
];
const INTERACTIONS: SubstanceInteractionRow[] = [
  {
    substance_ref: "st_johns_wort",
    medication_class: "ssri",
    severity: "high",
    note: "Combining St. John's wort with SSRIs raises serotonin syndrome risk.",
  },
];

function line(patch: Partial<SafetyInput>): SafetyInput {
  return {
    title: "Vitamin D3 5000 IU",
    substance_ref: "vitamin_d3",
    measure: "dose",
    unit: "IU",
    target_op: ">=",
    target_min: 5000,
    target_max: null,
    ...patch,
  };
}

Deno.test("above the UL: the fact is noted, the prescription is untouched", () => {
  const [f] = reviewSafety([line({})], LIMITS, INTERACTIONS);
  assertEquals(f.reasons, ["exceeds_ul"]);
  assertEquals(f.coach_notes, ["Above the NIH upper limit (4000 IU/day)."]);
  // The target the coach wrote is reported back as they wrote it. Nothing in
  // the finding replaces, hides or conditions it.
  assertEquals(f.target_label, ">= 5000 IU");
});

Deno.test("nothing this module returns can degrade a line", () => {
  const [f] = reviewSafety([line({})], LIMITS, INTERACTIONS);
  // STRUCTURAL. The gate lived on two fields; neither exists anymore, so no
  // caller can rebuild it from this payload — not the frontend, not publish.
  const asRecord = f as unknown as Record<string, unknown>;
  assertEquals("degraded" in asRecord, false);
  assertEquals("student_text" in asRecord, false);
  // And no other boolean crept in to take their place.
  assertEquals(
    Object.values(asRecord).some((v) => typeof v === "boolean"),
    false,
    `a boolean verdict reappeared in the finding: ${JSON.stringify(f)}`,
  );
});

Deno.test("provenance is not read at all — same line, same note, either value", () => {
  // The two values used to produce two different products. `provenance` is not
  // even in `SafetyInput` now, so passing it changes nothing by construction.
  const educational = reviewSafety(
    [{ ...line({}), provenance: "coach_educational" } as SafetyInput],
    LIMITS,
    INTERACTIONS,
  );
  const ordered = reviewSafety(
    [{ ...line({}), provenance: "clinician_ordered" } as SafetyInput],
    LIMITS,
    INTERACTIONS,
  );
  assertEquals(educational, ordered);
});

Deno.test("under the UL is silent", () => {
  const [f] = reviewSafety([line({ target_min: 2000 })], LIMITS, INTERACTIONS);
  assertEquals(f.reasons, []);
  assertEquals(f.coach_notes, []);
});

Deno.test("mass units convert; IU never does", () => {
  // 0.5 g of zinc = 500 mg > 40 mg UL.
  const [mass] = reviewSafety(
    [line({ substance_ref: "zinc", unit: "g", target_min: 0.5, title: "Zinc" })],
    LIMITS,
    INTERACTIONS,
  );
  assertEquals(mass.reasons, ["exceeds_ul"]);
  assertEquals(mass.coach_notes, ["Above the NIH upper limit (40 mg/day)."]);

  // An IU target against a mg UL cannot be compared honestly: it is reported,
  // never resolved as "under the limit" by omission (R7).
  const [incomparable] = reviewSafety(
    [line({ substance_ref: "zinc", unit: "IU", target_min: 10, title: "Zinc" })],
    LIMITS,
    INTERACTIONS,
  );
  assertEquals(incomparable.reasons, ["ul_not_comparable"]);
  assert(incomparable.coach_notes[0].includes("not comparable"));

  // Same line with no unit at all: still named, still not read as a clearance.
  const [unitless] = reviewSafety(
    [line({ substance_ref: "zinc", unit: null, target_min: 10, title: "Zinc" })],
    LIMITS,
    INTERACTIONS,
  );
  assertEquals(unitless.reasons, ["ul_not_comparable"]);
  assert(unitless.coach_notes[0].includes("no unit"));
});

Deno.test("a ceiling target is read from target_max", () => {
  const [f] = reviewSafety(
    [line({ target_op: "<=", target_min: null, target_max: 6000 })],
    LIMITS,
    INTERACTIONS,
  );
  assertEquals(f.reasons, ["exceeds_ul"]);
});

Deno.test("the watchlist notes on its own, with the stored note and no UL claim", () => {
  const [f] = reviewSafety(
    [line({
      title: "St John's wort 300 mg",
      substance_ref: "st_johns_wort",
      unit: "mg",
      target_min: 300,
    })],
    LIMITS,
    INTERACTIONS,
  );
  assertEquals(f.reasons, ["interaction_watchlist"]);
  assertEquals(f.coach_notes.length, 1);
  // A watchlist hit must not be announced as a UL breach.
  assert(!f.coach_notes[0].includes("upper limit"));
  assert(f.coach_notes[0].includes("serotonin syndrome"));
  // The medication class arrives readable, never as the stored slug.
  assert(f.coach_notes[0].includes("SSRIs"));
});

Deno.test("two watchlist rows are two notes, each naming its own medication class", () => {
  const [f] = reviewSafety(
    [line({ substance_ref: "st_johns_wort", unit: "mg", target_min: 300 })],
    LIMITS,
    [
      INTERACTIONS[0],
      {
        substance_ref: "st_johns_wort",
        medication_class: "oral_contraceptives",
        severity: "high",
        note: "St. John's wort induces CYP450 enzymes and can reduce contraceptive efficacy.",
      },
    ],
  );
  assertEquals(f.coach_notes.length, 2);
  assert(f.coach_notes[1].includes("Oral contraceptives"));
  // Storage vocabulary never survives into a sentence a coach reads.
  assertEquals(f.coach_notes.some((n) => n.includes("oral_contraceptives")), false);
});

Deno.test("no coach note carries an internal identifier or a normative verb", () => {
  const findings = reviewSafety(
    [
      line({}),
      line({ substance_ref: "st_johns_wort", unit: "mg", target_min: 300 }),
      line({ substance_ref: "zinc", unit: "IU", target_min: 10 }),
    ],
    LIMITS,
    INTERACTIONS,
  );
  const notes = findings.flatMap((f) => f.coach_notes);
  assert(notes.length >= 3);
  for (const note of notes) {
    // snake_case slug (a column, table or enum value) — token-lint's rule,
    // applied to the text this module composes at runtime.
    assertEquals(
      /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/.test(note),
      false,
      `internal identifier in a coach note: ${note}`,
    );
    assertEquals(
      /\b[a-z][a-z0-9-]*-v\d+\b/.test(note),
      false,
      `edge-function name in a coach note: ${note}`,
    );
    // And nothing normative: a note informs a professional, it does not
    // authorize them.
    for (const banned of ["clinician", "sign-off", "signoff", "approve", "you must"]) {
      assertEquals(
        note.toLowerCase().includes(banned),
        false,
        `"${banned}" in a coach note: ${note}`,
      );
    }
  }
});

Deno.test("a line with no substance_ref is outside the molecule register", () => {
  const [f] = reviewSafety(
    [line({ substance_ref: null, measure: "serving", unit: "serving" })],
    LIMITS,
    INTERACTIONS,
  );
  assertEquals(f.reasons, []);
  assertEquals(f.coach_notes, []);
  assertEquals(f.ul, null);
});

Deno.test("findings keep their index so the UI can pin the note to the line", () => {
  const findings = reviewSafety(
    [line({ target_min: 1000 }), line({}), line({ target_min: 1000 })],
    LIMITS,
    INTERACTIONS,
  );
  assertEquals(findings.map((f) => f.index), [0, 1, 2]);
  assertEquals(findings.map((f) => f.coach_notes.length), [0, 1, 0]);
});
