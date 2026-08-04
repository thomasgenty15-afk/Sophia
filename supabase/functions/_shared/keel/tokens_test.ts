import { assertEquals, assertThrows } from "jsr:@std/assert@1";

import {
  ACTIVITY_CLASS,
  ANCHOR_KIND,
  assertSubstanceRefRequired,
  AUTONOMY,
  DAY_TOKENS,
  EVAL_STATUS,
  EVALUATION_GRAIN,
  EVIDENCE_KIND,
  MEASURE,
  parseAnchorKind,
  parseDayToken,
  parseEvalStatus,
  parseEvaluationGrain,
  parseEvidenceKind,
  parseMeasure,
  parsePolarity,
  parsePriority,
  parseSlotKey,
  parseSlotKind,
  parseSubstanceRef,
  parseTargetOp,
  parseTimingStatus,
  parseUnit,
  POLARITY,
  PRIORITY,
  SLOT_KIND,
  SLOT_VOCABULARY,
  SUBSTANCE_REFS,
  TARGET_OP,
  TIMING_STATUS,
  UNIT,
} from "./tokens.ts";
import { parseRelationKind, RELATION_KIND } from "./relations.ts";

// ---------------------------------------------------------------------------
// Canonical values are accepted and returned unchanged
// ---------------------------------------------------------------------------

Deno.test("canonical tokens round-trip through their parser", () => {
  for (const d of DAY_TOKENS) assertEquals(parseDayToken(d), d);
  for (const p of POLARITY) assertEquals(parsePolarity(p), p);
  for (const a of ANCHOR_KIND) assertEquals(parseAnchorKind(a), a);
  for (const s of SLOT_VOCABULARY) assertEquals(parseSlotKey(s), s);
  for (const m of MEASURE) assertEquals(parseMeasure(m), m);
  for (const u of UNIT) assertEquals(parseUnit(u), u);
  for (const op of TARGET_OP) assertEquals(parseTargetOp(op), op);
  for (const e of EVIDENCE_KIND) assertEquals(parseEvidenceKind(e), e);
  for (const g of EVALUATION_GRAIN) assertEquals(parseEvaluationGrain(g), g);
  for (const k of SLOT_KIND) assertEquals(parseSlotKind(k), k);
  for (const p of PRIORITY) assertEquals(parsePriority(p), p);
  for (const s of EVAL_STATUS) assertEquals(parseEvalStatus(s), s);
  for (const t of TIMING_STATUS) assertEquals(parseTimingStatus(t), t);
  for (const r of SUBSTANCE_REFS) assertEquals(parseSubstanceRef(r), r);
  for (const r of RELATION_KIND) assertEquals(parseRelationKind(r), r);
});

Deno.test("vocabulary shapes match SCHEMA.md", () => {
  assertEquals(DAY_TOKENS.length, 7);
  assertEquals(SLOT_VOCABULARY.length, 11); // the 11 seed slots
  assertEquals(SUBSTANCE_REFS.length, 40); // flat ~40-slug seed, no ontology
  assertEquals(ACTIVITY_CLASS.length, 9);
  assertEquals(AUTONOMY.length, 3);
});

// ---------------------------------------------------------------------------
// Aliases are normalized on input, never returned as-is
// ---------------------------------------------------------------------------

Deno.test("legacy day aliases normalize to canonical mon..sun", () => {
  assertEquals(parseDayToken("monday"), "mon");
  assertEquals(parseDayToken("lundi"), "mon");
  assertEquals(parseDayToken("dimanche"), "sun"); // the live-French bug class
  assertEquals(parseDayToken("  SATURDAY  "), "sat"); // trim + case-fold
});

Deno.test("unit aliases normalize (IU capitalization preserved)", () => {
  assertEquals(parseUnit("iu"), "IU");
  assertEquals(parseUnit("IU"), "IU");
  assertEquals(parseUnit("grams"), "g");
  assertEquals(parseUnit("minutes"), "min");
  assertEquals(parseUnit("ug"), "mcg");
});

Deno.test("slot, measure, grain and target_op aliases normalize", () => {
  assertEquals(parseSlotKey("anytime"), "any_time");
  assertEquals(parseSlotKey("bedtime"), "before_bed");
  assertEquals(parseMeasure("calories"), "energy");
  assertEquals(parseMeasure("carbs"), "carb");
  assertEquals(parseEvaluationGrain("daily"), "day");
  assertEquals(parseTargetOp("="), "==");
  assertEquals(parseTargetOp("gte"), ">=");
});

Deno.test("substance aliases normalize to seed slugs", () => {
  assertEquals(parseSubstanceRef("coenzyme_q10"), "coq10");
  assertEquals(parseSubstanceRef("whey"), "whey_protein");
  assertEquals(parseSubstanceRef("St Johns Wort"), "st_johns_wort");
});

// ---------------------------------------------------------------------------
// Unknown input THROWS (R7) — never undefined, never []
// ---------------------------------------------------------------------------

Deno.test("unknown tokens throw an explicit Error (R7)", () => {
  assertThrows(() => parseDayToken("someday"), Error, "day");
  assertThrows(() => parseDayToken(""), Error);
  assertThrows(() => parseDayToken(null), Error);
  assertThrows(() => parsePolarity("maybe"), Error, "polarity");
  assertThrows(() => parseSlotKey("brunch"), Error, "slot_key");
  assertThrows(() => parseMeasure("vibes"), Error, "measure");
  assertThrows(() => parseUnit("lb"), Error, "unit"); // R4: no imperial storage
  assertThrows(() => parseTargetOp("!="), Error, "target_op");
  assertThrows(() => parseEvidenceKind("trust_me"), Error);
  assertThrows(() => parseSubstanceRef("vitamin_z"), Error, "substance_ref");
  assertThrows(() => parseRelationKind("synergy"), Error, "relation_kind");
});

// ---------------------------------------------------------------------------
// assertSubstanceRefRequired — R7 corollary of the SQL CHECK
// ---------------------------------------------------------------------------

Deno.test("assertSubstanceRefRequired throws for dose/micronutrient without ref", () => {
  assertThrows(() => assertSubstanceRefRequired("dose", null), Error);
  assertThrows(() => assertSubstanceRefRequired("dose", undefined), Error);
  assertThrows(() => assertSubstanceRefRequired("micronutrient", ""), Error);
  assertThrows(() => assertSubstanceRefRequired("micronutrient", "   "), Error);
});

Deno.test("assertSubstanceRefRequired passes when ref present or not required", () => {
  assertSubstanceRefRequired("dose", "vitamin_d3");
  assertSubstanceRefRequired("micronutrient", "omega3_epa_dha");
  assertSubstanceRefRequired("duration", null); // non-molecule measure: no ref needed
  assertSubstanceRefRequired("presence", undefined);
});
