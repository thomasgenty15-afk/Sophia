/**
 * KEEL evaluator — branch tests, acceptance fixtures and PROPERTY tests.
 *
 * The property tests at the bottom are the ones that matter: they pin the
 * doctrine (honest logging, silent sensors, no cross-line deduction, sealed
 * non-inputs) rather than a particular arithmetic.
 */
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";

import {
  computeDayScore,
  computeWeekAdherence,
  type AdherenceEvaluation,
} from "./adherence.ts";
import {
  type CommitmentEvaluation,
  convertQuantity,
  type EvaluationSnapshot,
  evaluateSnapshot,
  type EvaluatorCommitment,
  type EvaluatorEvent,
} from "./evaluator.ts";
import { parseEvalStatus, parseTimingStatus } from "./tokens.ts";

// ---------------------------------------------------------------------------
// Fixtures helpers
// ---------------------------------------------------------------------------

const USER = "11111111-1111-1111-1111-111111111111";
const PLAN = "22222222-2222-2222-2222-222222222222";
const AT = "2026-07-27T23:59:00.000Z";

/** class map mirroring the food_groups seed of the P0 migration */
const FOOD_GROUP_CLASSES: Record<string, string> = {
  lean_protein: "protein",
  fatty_fish: "protein",
  white_fish: "protein",
  poultry: "protein",
  eggs: "protein",
  legumes: "legume",
  dairy_yogurt: "dairy",
  whole_grain: "grain",
  refined_grain: "grain",
  cruciferous_veg: "vegetable",
  leafy_greens: "vegetable",
  non_starchy_veg: "vegetable",
  starchy_veg: "vegetable",
  berries: "fruit",
  citrus: "fruit",
  other_fruit: "fruit",
  nuts_seeds: "fat",
  olive_oil: "fat",
  alcohol: "beverage",
  water: "beverage",
};

function commitment(
  over: Partial<EvaluatorCommitment> & { id: string },
): EvaluatorCommitment {
  return {
    planVersionId: PLAN,
    userId: USER,
    polarity: "do",
    anchorKind: "free",
    slotKey: null,
    clockLocal: null,
    toleranceMinutes: null,
    windowStartLocal: null,
    windowEndLocal: null,
    measure: "count",
    unit: "none",
    targetOp: "any",
    targetMin: null,
    targetMax: null,
    tolerancePct: 10,
    substanceRef: null,
    foodGroupRef: null,
    evidenceKind: "self_report",
    evidenceRequired: false,
    autoSource: null,
    countsTowardAdherence: true,
    evaluationGrain: "day",
    slotKind: null,
    scheduledDays: null,
    requiredDaysPerWeek: null,
    expectedOccasionsPerDay: 1,
    priority: "core",
    autonomy: "strict",
    flexEligible: false,
    status: "active",
    swapPolicy: null,
    ...over,
  };
}

function event(over: Partial<EvaluatorEvent> & { id: string }): EvaluatorEvent {
  return {
    localDate: "2026-07-27",
    localTime: "08:00",
    slotKey: null,
    source: "chat",
    quantity: null,
    unit: null,
    substanceRef: null,
    foodGroupRef: null,
    evidenceWeight: 0.8,
    portionBand: null,
    commitmentId: null,
    ...over,
  };
}

function snapshot(over: Partial<EvaluationSnapshot> = {}): EvaluationSnapshot {
  return {
    userId: USER,
    planVersionId: PLAN,
    localDate: "2026-07-27",
    dayOfWeek: "mon",
    weekStartDate: "2026-07-27",
    dayIsClosed: false,
    weekIsClosed: false,
    evaluatedAt: AT,
    commitments: [],
    events: [],
    weekEvents: [],
    plannedDeviations: [],
    foodGroupClasses: FOOD_GROUP_CLASSES,
    ...over,
  };
}

function byId(result: { evaluations: CommitmentEvaluation[] }, id: string) {
  const found = result.evaluations.filter((e) => e.commitmentId === id);
  if (found.length === 0) throw new Error(`no evaluation for ${id}`);
  return found[0];
}

function toAdherence(e: CommitmentEvaluation): AdherenceEvaluation {
  return {
    commitmentId: e.commitmentId,
    localDate: e.localDate,
    grain: e.grain,
    status: e.status,
    priority: e.priority,
    countsTowardAdherence: e.countsTowardAdherence,
    expectedEvaluationsPerDay: e.expectedEvaluationsPerDay,
  };
}

// ===========================================================================
// R6 — named branches, one test each
// ===========================================================================

Deno.test("R6 polarity 'do': absence of fact => unknown (never met by silence)", () => {
  const c = commitment({ id: "c-do" });
  const r = evaluateSnapshot(snapshot({ commitments: [c] }));
  assertEquals(byId(r, "c-do").status, "unknown");
  assertEquals(byId(r, "c-do").resolvedAt, null);
});

Deno.test("R6 polarity 'avoid': absence of fact => met (INVERTED default)", () => {
  const c = commitment({
    id: "c-avoid",
    polarity: "avoid",
    measure: "presence",
    substanceRef: "alcohol",
    targetOp: "==",
    targetMin: 0,
  });
  const r = evaluateSnapshot(snapshot({ commitments: [c] }));
  assertEquals(byId(r, "c-avoid").status, "met");
  assertEquals(byId(r, "c-avoid").timingStatus, "not_applicable");
});

Deno.test("R6 polarity 'avoid': a contrary fact => missed, via substance OR food group", () => {
  const c = commitment({
    id: "c-avoid",
    polarity: "avoid",
    measure: "presence",
    substanceRef: "alcohol",
    targetOp: "==",
    targetMin: 0,
  });
  const viaSubstance = evaluateSnapshot(snapshot({
    commitments: [c],
    events: [event({ id: "e1", substanceRef: "alcohol", quantity: 1, unit: "serving" })],
  }));
  assertEquals(byId(viaSubstance, "c-avoid").status, "missed");

  // 'alcohol' exists in both vocabularies: a beer logged as a food group is the
  // same violation as one logged as a substance.
  const viaFoodGroup = evaluateSnapshot(snapshot({
    commitments: [c],
    events: [event({ id: "e2", foodGroupRef: "alcohol", quantity: 330, unit: "ml" })],
  }));
  assertEquals(byId(viaFoodGroup, "c-avoid").status, "missed");
});

Deno.test("R6 polarity 'capture': the CAPTURE is graded, never the captured value", () => {
  // "Sleep 7-9 h" with 5 h reported: the measurement happened. Grading the
  // value would turn a capture into a demand.
  const c = commitment({
    id: "c-capture",
    polarity: "capture",
    measure: "duration",
    unit: "h",
    targetOp: "between",
    targetMin: 7,
    targetMax: 9,
    countsTowardAdherence: false,
  });
  const r = evaluateSnapshot(snapshot({
    commitments: [c],
    events: [event({ id: "e1", commitmentId: "c-capture", quantity: 5, unit: "h" })],
  }));
  assertEquals(byId(r, "c-capture").status, "met");
  assertEquals(byId(r, "c-capture").observedValue, 5);
});

Deno.test("R6 measure 'dose': sums the reported intakes of the PRESCRIBED preparation only", () => {
  const c = commitment({
    id: "c-d3",
    measure: "dose",
    unit: "IU",
    targetOp: ">=",
    targetMin: 5000,
    substanceRef: "vitamin_d3",
    evaluationGrain: "occasion",
    anchorKind: "slot",
    slotKey: "breakfast",
    slotKind: "nominal",
  });
  const r = evaluateSnapshot(snapshot({
    commitments: [c],
    events: [
      event({ id: "e1", substanceRef: "vitamin_d3", quantity: 2500, unit: "IU", slotKey: "breakfast" }),
      event({ id: "e2", substanceRef: "vitamin_d3", quantity: 2500, unit: "IU", slotKey: "breakfast" }),
      // another preparation entirely: must not be summed into this dose
      event({ id: "e3", substanceRef: "vitamin_k2", quantity: 100, unit: "mcg" }),
    ],
  }));
  const ev = byId(r, "c-d3");
  assertEquals(ev.observedValue, 5000);
  assertEquals(ev.status, "met");
  assertEquals(ev.sourceEventIds, ["e1", "e2"]);
});

Deno.test("R6 measure 'dose': IU is never converted into a mass (R7 fails loudly)", () => {
  const c = commitment({
    id: "c-d3",
    measure: "dose",
    unit: "IU",
    targetOp: ">=",
    targetMin: 5000,
    substanceRef: "vitamin_d3",
  });
  assertThrows(
    () =>
      evaluateSnapshot(snapshot({
        commitments: [c],
        events: [event({ id: "e1", substanceRef: "vitamin_d3", quantity: 125, unit: "mcg" })],
      })),
    Error,
    "cannot convert mcg to IU",
  );
});

Deno.test("R6 measure 'micronutrient': sums EXPLICIT elemental reports across all sources", () => {
  const c = commitment({
    id: "c-omega3",
    measure: "micronutrient",
    unit: "g",
    targetOp: ">=",
    targetMin: 2,
    substanceRef: "omega3_epa_dha",
  });
  const r = evaluateSnapshot(snapshot({
    commitments: [c],
    events: [
      // a capsule (supplement source)
      event({ id: "e1", substanceRef: "omega3_epa_dha", quantity: 1000, unit: "mg" }),
      // and an explicitly reported amount from food (allowed: the student said
      // the number, we did not deduce it)
      event({ id: "e2", substanceRef: "omega3_epa_dha", quantity: 1.5, unit: "g" }),
    ],
  }));
  assertEquals(byId(r, "c-omega3").observedValue, 2.5);
  assertEquals(byId(r, "c-omega3").status, "met");
});

Deno.test("R6 measure 'micronutrient': a MENTION without a number is not a quantity", () => {
  const c = commitment({
    id: "c-omega3",
    measure: "micronutrient",
    unit: "g",
    targetOp: ">=",
    targetMin: 2,
    substanceRef: "omega3_epa_dha",
  });
  const r = evaluateSnapshot(snapshot({
    commitments: [c],
    events: [event({ id: "e1", substanceRef: "omega3_epa_dha", quantity: null })],
  }));
  assertEquals(byId(r, "c-omega3").status, "unknown");
  assertEquals(byId(r, "c-omega3").observedValue, null);
});

Deno.test("R6 food_group_ref: exact match, and class_equivalent swap per policy", () => {
  const base = {
    id: "c-breakfast",
    measure: "serving" as const,
    unit: "serving" as const,
    targetOp: ">=" as const,
    targetMin: 1,
    foodGroupRef: "berries",
    evaluationGrain: "occasion" as const,
    anchorKind: "slot" as const,
    slotKey: "breakfast",
    slotKind: "nominal" as const,
  };

  // strict autonomy: a banana is not berries, whatever the policy says
  const strict = evaluateSnapshot(snapshot({
    commitments: [commitment({
      ...base,
      autonomy: "strict",
      swapPolicy: { class_equivalent: true },
    })],
    events: [event({ id: "e1", foodGroupRef: "other_fruit", quantity: 1, unit: "serving", slotKey: "breakfast" })],
    dayIsClosed: true,
  }));
  assertEquals(byId(strict, "c-breakfast").status, "missed");
  assertEquals(byId(strict, "c-breakfast").observed.swap_applied, false);

  // swap_within_policy + class_equivalent: banana is FRUIT, berries are FRUIT
  const swapped = evaluateSnapshot(snapshot({
    commitments: [commitment({
      ...base,
      autonomy: "swap_within_policy",
      swapPolicy: { class_equivalent: true },
    })],
    events: [event({ id: "e1", foodGroupRef: "other_fruit", quantity: 1, unit: "serving", slotKey: "breakfast" })],
  }));
  assertEquals(byId(swapped, "c-breakfast").status, "met");
  assertEquals(byId(swapped, "c-breakfast").observed.swap_applied, true);
  assertEquals(byId(swapped, "c-breakfast").observed.swapped_from, "other_fruit");

  // swap_within_policy WITHOUT class_equivalent: no swap
  const noPolicy = evaluateSnapshot(snapshot({
    commitments: [commitment({
      ...base,
      autonomy: "swap_within_policy",
      swapPolicy: { class_equivalent: false },
    })],
    events: [event({ id: "e1", foodGroupRef: "other_fruit", quantity: 1, unit: "serving", slotKey: "breakfast" })],
    dayIsClosed: true,
  }));
  assertEquals(byId(noPolicy, "c-breakfast").status, "missed");

  // explicit allowlist, no class equivalence needed
  const allowlisted = evaluateSnapshot(snapshot({
    commitments: [commitment({
      ...base,
      autonomy: "swap_within_policy",
      swapPolicy: { class_equivalent: false, allowed_groups: ["citrus"] },
    })],
    events: [event({ id: "e1", foodGroupRef: "citrus", quantity: 1, unit: "serving", slotKey: "breakfast" })],
  }));
  assertEquals(byId(allowlisted, "c-breakfast").status, "met");
});

Deno.test("R7: an unknown food group in a swap resolution fails loudly", () => {
  const c = commitment({
    id: "c",
    measure: "serving",
    unit: "serving",
    targetOp: ">=",
    targetMin: 1,
    foodGroupRef: "berries",
    autonomy: "flexible",
  });
  assertThrows(
    () =>
      evaluateSnapshot(snapshot({
        commitments: [c],
        events: [event({ id: "e1", foodGroupRef: "unobtainium", quantity: 1, unit: "serving" })],
      })),
    Error,
    "unknown food_group_ref",
  );
});

Deno.test("R6 slot_kind 'nominal': pre-seeded unknown, resolved missed at day close", () => {
  const c = commitment({
    id: "c-dinner",
    evaluationGrain: "occasion",
    anchorKind: "slot",
    slotKey: "dinner",
    slotKind: "nominal",
    measure: "presence",
    foodGroupRef: "lean_protein",
    targetOp: "any",
  });
  const open = evaluateSnapshot(snapshot({ commitments: [c] }));
  assertEquals(byId(open, "c-dinner").status, "unknown");
  assertEquals(byId(open, "c-dinner").slotKey, "dinner");

  const closed = evaluateSnapshot(snapshot({ commitments: [c], dayIsClosed: true }));
  assertEquals(byId(closed, "c-dinner").status, "missed");
  assertEquals(closed.coverageDeficits.length, 0);
});

Deno.test("R6 slot_kind 'opportunistic': no fact => COVERAGE DEFICIT, never a false missed", () => {
  const c = commitment({
    id: "c-veg",
    evaluationGrain: "occasion",
    anchorKind: "slot",
    slotKey: "any_meal",
    slotKind: "opportunistic",
    measure: "serving",
    unit: "serving",
    targetOp: ">=",
    targetMin: 1,
    foodGroupRef: "cruciferous_veg",
    expectedOccasionsPerDay: 2,
  });
  const closed = evaluateSnapshot(snapshot({ commitments: [c], dayIsClosed: true }));
  assertEquals(closed.evaluations.length, 0);
  assertEquals(closed.coverageDeficits, [{
    commitmentId: "c-veg",
    localDate: "2026-07-27",
    reason: "opportunistic_no_fact",
  }]);

  // the evaluation is BORN from the facts, one row per distinct logged slot
  const logged = evaluateSnapshot(snapshot({
    commitments: [c],
    events: [
      event({ id: "e1", foodGroupRef: "cruciferous_veg", quantity: 1, unit: "serving", slotKey: "lunch" }),
      event({ id: "e2", foodGroupRef: "cruciferous_veg", quantity: 1, unit: "serving", slotKey: "dinner" }),
    ],
  }));
  assertEquals(logged.evaluations.length, 2);
  assertEquals(logged.evaluations.map((e) => e.slotKey).sort(), ["dinner", "lunch"]);
  assertEquals(logged.coverageDeficits.length, 0);
});

Deno.test("R6 auto_source: a silent device feed is unknown, NEVER missed — even at day close", () => {
  const c = commitment({
    id: "c-hrv",
    polarity: "capture",
    measure: "count",
    unit: "none",
    targetOp: ">=",
    targetMin: 1,
    autoSource: "whoop",
    evidenceKind: "device",
    countsTowardAdherence: false,
  });
  const r = evaluateSnapshot(snapshot({ commitments: [c], dayIsClosed: true }));
  assertEquals(byId(r, "c-hrv").status, "unknown");
  assertEquals(byId(r, "c-hrv").timingStatus, "unknown");
});

Deno.test("R6 auto_source + counts_toward_adherence=false: out of the adherence denominator", () => {
  // The guardrail in full: a Whoop that did not sync must not sink the score of
  // a perfectly observant student.
  const observant = commitment({
    id: "c-good",
    measure: "serving",
    unit: "serving",
    targetOp: ">=",
    targetMin: 1,
    foodGroupRef: "berries",
  });
  const sensor = commitment({
    id: "c-hrv",
    polarity: "capture",
    measure: "count",
    unit: "none",
    targetOp: ">=",
    targetMin: 1,
    autoSource: "whoop",
    evidenceKind: "device",
    countsTowardAdherence: false,
  });
  const r = evaluateSnapshot(snapshot({
    commitments: [observant, sensor],
    events: [event({ id: "e1", foodGroupRef: "berries", quantity: 1, unit: "serving" })],
    dayIsClosed: true,
  }));
  const score = computeDayScore(r.evaluations.map(toAdherence));
  assertEquals(score, 1);
});

Deno.test("R6 double output: done at the wrong time is met + off_window", () => {
  // Fixture 2 line 2 — morning light 10 min, window 06:00-10:00, taken at 14:00.
  const c = commitment({
    id: "c-light",
    evaluationGrain: "occasion",
    anchorKind: "window",
    windowStartLocal: "06:00",
    windowEndLocal: "10:00",
    measure: "duration",
    unit: "min",
    targetOp: ">=",
    targetMin: 10,
    slotKind: "nominal",
  });
  const r = evaluateSnapshot(snapshot({
    commitments: [c],
    events: [event({ id: "e1", commitmentId: "c-light", quantity: 12, unit: "min", localTime: "14:00" })],
  }));
  assertEquals(byId(r, "c-light").status, "met");
  assertEquals(byId(r, "c-light").timingStatus, "off_window");
});

Deno.test("a window may cross midnight (16:8 eating window 20:00 -> 12:00)", () => {
  const c = commitment({
    id: "c-window",
    anchorKind: "window",
    windowStartLocal: "20:00",
    windowEndLocal: "12:00",
    measure: "boolean",
    unit: "none",
    targetOp: "any",
  });
  const inside = evaluateSnapshot(snapshot({
    commitments: [c],
    events: [event({ id: "e1", commitmentId: "c-window", localTime: "23:30" })],
  }));
  assertEquals(byId(inside, "c-window").timingStatus, "on_time");

  const outside = evaluateSnapshot(snapshot({
    commitments: [c],
    events: [event({ id: "e1", commitmentId: "c-window", localTime: "15:00" })],
  }));
  assertEquals(byId(outside, "c-window").timingStatus, "off_window");
});

Deno.test("a slot anchor is a time statement too: D3 at breakfast taken at dinner is met + off_window", () => {
  const c = commitment({
    id: "c-d3",
    evaluationGrain: "occasion",
    anchorKind: "slot",
    slotKey: "breakfast",
    slotKind: "nominal",
    measure: "dose",
    unit: "IU",
    targetOp: ">=",
    targetMin: 5000,
    substanceRef: "vitamin_d3",
  });
  const r = evaluateSnapshot(snapshot({
    commitments: [c],
    events: [event({ id: "e1", substanceRef: "vitamin_d3", quantity: 5000, unit: "IU", slotKey: "dinner" })],
  }));
  assertEquals(byId(r, "c-d3").status, "met");
  assertEquals(byId(r, "c-d3").timingStatus, "off_window");
});

Deno.test("planned_deviations: not_applicable (out of the denominator) or flex_used (in it)", () => {
  const plain = commitment({
    id: "c-plain",
    measure: "serving",
    unit: "serving",
    targetOp: ">=",
    targetMin: 1,
    foodGroupRef: "berries",
  });
  const flexible = commitment({ ...plain, id: "c-flex", flexEligible: true });

  const r = evaluateSnapshot(snapshot({
    commitments: [plain, flexible],
    dayIsClosed: true,
    plannedDeviations: [{ localDate: "2026-07-27", slotKey: null, consumedFlex: true }],
  }));
  assertEquals(byId(r, "c-plain").status, "not_applicable");
  assertEquals(byId(r, "c-flex").status, "flex_used");

  // not_applicable leaves the denominator; flex_used stays in it and scores 1.
  const score = computeDayScore(r.evaluations.map(toAdherence));
  assertEquals(score, 1);
});

Deno.test("planned_deviations: a slot-scoped deviation only covers that slot", () => {
  const breakfast = commitment({
    id: "c-bkf",
    evaluationGrain: "occasion",
    anchorKind: "slot",
    slotKey: "breakfast",
    slotKind: "nominal",
    measure: "presence",
    foodGroupRef: "eggs",
    targetOp: "any",
  });
  const dinner = commitment({ ...breakfast, id: "c-din", slotKey: "dinner" });
  const r = evaluateSnapshot(snapshot({
    commitments: [breakfast, dinner],
    dayIsClosed: true,
    plannedDeviations: [{ localDate: "2026-07-27", slotKey: "dinner", consumedFlex: false }],
  }));
  assertEquals(byId(r, "c-bkf").status, "missed");
  assertEquals(byId(r, "c-din").status, "not_applicable");
});

Deno.test("scheduled_days filters the day; a paused commitment is skipped entirely", () => {
  const weekdayOnly = commitment({
    id: "c-weekday",
    scheduledDays: ["mon", "tue", "wed", "thu", "fri"],
  });
  const paused = commitment({ id: "c-paused", status: "paused" });

  const monday = evaluateSnapshot(snapshot({
    commitments: [weekdayOnly, paused],
    dayOfWeek: "mon",
  }));
  assertEquals(monday.evaluations.map((e) => e.commitmentId), ["c-weekday"]);
  assertEquals(monday.skipped, [{ commitmentId: "c-paused", reason: "commitment_not_active" }]);

  const sunday = evaluateSnapshot(snapshot({
    commitments: [weekdayOnly],
    dayOfWeek: "sun",
    localDate: "2026-08-02",
  }));
  assertEquals(sunday.evaluations.length, 0);
  assertEquals(sunday.skipped, [{ commitmentId: "c-weekday", reason: "not_scheduled_today" }]);
});

Deno.test("grain 'week': one row anchored on the week start, missed only once the week closes", () => {
  const c = commitment({
    id: "c-fish",
    evaluationGrain: "week",
    measure: "serving",
    unit: "serving",
    targetOp: ">=",
    targetMin: 3,
    requiredDaysPerWeek: 3,
    foodGroupRef: "fatty_fish",
    priority: "secondary",
  });
  const open = evaluateSnapshot(snapshot({ commitments: [c], dayIsClosed: true }));
  assertEquals(byId(open, "c-fish").localDate, "2026-07-27");
  assertEquals(byId(open, "c-fish").status, "unknown");

  const done = evaluateSnapshot(snapshot({
    commitments: [c],
    weekEvents: [
      event({ id: "w1", localDate: "2026-07-27", foodGroupRef: "fatty_fish", quantity: 1, unit: "serving" }),
      event({ id: "w2", localDate: "2026-07-29", foodGroupRef: "fatty_fish", quantity: 1, unit: "serving" }),
      event({ id: "w3", localDate: "2026-07-31", foodGroupRef: "fatty_fish", quantity: 1, unit: "serving" }),
    ],
  }));
  assertEquals(byId(done, "c-fish").status, "met");
  assertEquals(byId(done, "c-fish").observed.distinct_days, 3);

  const missed = evaluateSnapshot(snapshot({ commitments: [c], weekIsClosed: true }));
  assertEquals(byId(missed, "c-fish").status, "missed");
});

Deno.test("R7: the evaluator refuses a malformed date or local time", () => {
  assertThrows(
    () => evaluateSnapshot(snapshot({ localDate: "27/07/2026" })),
    Error,
    "snapshot.localDate must be YYYY-MM-DD",
  );
  const c = commitment({
    id: "c",
    anchorKind: "window",
    windowStartLocal: "06:00",
    windowEndLocal: "10:00",
    measure: "boolean",
    unit: "none",
    targetOp: "any",
  });
  assertThrows(
    () =>
      evaluateSnapshot(snapshot({
        commitments: [c],
        events: [event({ id: "e1", commitmentId: "c", localTime: "8h" })],
      })),
    Error,
    "local time must be HH:MM",
  );
});

Deno.test("convertQuantity: inside a family only", () => {
  assertEquals(convertQuantity(1000, "mg", "g"), 1);
  assertEquals(convertQuantity(1.5, "h", "min"), 90);
  assertEquals(convertQuantity(1, "l", "ml"), 1000);
  assertThrows(() => convertQuantity(1, "g", "ml"), Error, "cannot convert");
  assertThrows(() => convertQuantity(1, "serving", "g"), Error, "cannot convert");
});

// ===========================================================================
// PROPERTY TEST 3 — NON-INPUT #3: no cross-line deduction
// ===========================================================================

Deno.test("PROPERTY: a logged food NEVER creates a micronutrient fact or evaluation", () => {
  // The commissioning case, verbatim from SCHEMA.md fixture 1: line 5 is
  // "fatty fish 3x/week" (a food line) and line 2 is "omega-3 2 g EPA+DHA"
  // (a nutrient line). They are the coach's TWO DISTINCT prescriptions. A
  // salmon serving satisfies line 5 and must leave line 2 strictly untouched.
  const omega3 = commitment({
    id: "c-omega3",
    measure: "micronutrient",
    unit: "g",
    targetOp: ">=",
    targetMin: 2,
    substanceRef: "omega3_epa_dha",
  });
  const fish = commitment({
    id: "c-fish",
    measure: "serving",
    unit: "serving",
    targetOp: ">=",
    targetMin: 1,
    foodGroupRef: "fatty_fish",
  });

  const salmon = event({
    id: "e-salmon",
    foodGroupRef: "fatty_fish",
    quantity: 1,
    unit: "serving",
    slotKey: "dinner",
  });

  const r = evaluateSnapshot(snapshot({
    commitments: [omega3, fish],
    events: [salmon],
    dayIsClosed: true,
  }));

  // the food line is satisfied
  assertEquals(byId(r, "c-fish").status, "met");
  assertEquals(byId(r, "c-fish").sourceEventIds, ["e-salmon"]);

  // the nutrient line saw NOTHING: no observed value, no source event, and the
  // status is the day-close `missed` of an unlogged line — not a derived met.
  const nutrient = byId(r, "c-omega3");
  assertEquals(nutrient.observedValue, null);
  assertEquals(nutrient.sourceEventIds, []);
  assertEquals(nutrient.observed.matched_event_count, 0);
  assertEquals(nutrient.status, "missed");

  // and the same holds for EVERY food group in the seed: no food, ever,
  // contributes a number to a micronutrient line.
  for (const slug of Object.keys(FOOD_GROUP_CLASSES)) {
    const sweep = evaluateSnapshot(snapshot({
      commitments: [omega3],
      events: [event({ id: `e-${slug}`, foodGroupRef: slug, quantity: 500, unit: "g" })],
    }));
    assertEquals(byId(sweep, "c-omega3").observedValue, null, `food group ${slug} leaked into a micronutrient line`);
    assertEquals(byId(sweep, "c-omega3").sourceEventIds, []);
  }
});

// ===========================================================================
// PROPERTY TEST 4 — NON-INPUT #1: relation rows are sealed out
// ===========================================================================

Deno.test("PROPERTY: the evaluator module does not import the relation vocabulary", async () => {
  // Path resolved from THIS module, never from the cwd (a test that reads its
  // target by cwd-relative path breaks depending on where you launch it — this
  // repo has already paid for that one).
  const source = await Deno.readTextFile(new URL("./evaluator.ts", import.meta.url));
  const importRe =
    /(?:import[^;]*?from\s*|import\s*\(\s*|export[^;]*?from\s*)['"]([^'"]*relation[^'"]*)['"]/g;
  const hits = [...source.matchAll(importRe)].map((m) => m[1]);
  assertEquals(hits, [], "the evaluator must not import the relation vocabulary module");
});

Deno.test("PROPERTY: results are IDENTICAL with and without relation rows on the snapshot", () => {
  const iron = commitment({
    id: "c-iron",
    evaluationGrain: "occasion",
    anchorKind: "slot",
    slotKey: "on_waking",
    slotKind: "nominal",
    measure: "dose",
    unit: "mg",
    targetOp: ">=",
    targetMin: 25,
    substanceRef: "iron_bisglycinate",
  });
  const calcium = commitment({
    id: "c-calcium",
    evaluationGrain: "occasion",
    anchorKind: "slot",
    slotKey: "dinner",
    slotKind: "nominal",
    measure: "dose",
    unit: "mg",
    targetOp: ">=",
    targetMin: 500,
    substanceRef: "calcium_citrate",
  });
  const events = [
    // taken 90 minutes apart instead of the prescribed 120: no practitioner
    // grades that as missed, and neither does this evaluator.
    event({ id: "e1", substanceRef: "iron_bisglycinate", quantity: 25, unit: "mg", slotKey: "on_waking", localTime: "07:00" }),
    event({ id: "e2", substanceRef: "calcium_citrate", quantity: 500, unit: "mg", slotKey: "dinner", localTime: "08:30" }),
  ];

  const bare = evaluateSnapshot(snapshot({ commitments: [iron, calcium], events }));

  // Same snapshot with relation rows bolted on. They are not part of the input
  // type; if any branch ever started reading them, this deep-equality fails.
  const withRows = evaluateSnapshot({
    ...snapshot({ commitments: [iron, calcium], events }),
    relationRows: [
      { commitment_a: "c-iron", commitment_b: "c-calcium", relation_kind: "separate_by_minutes", param_minutes: 120 },
      { commitment_a: "c-iron", commitment_b: null, relation_kind: "requires_cofactor", cofactor_ref: "citrus" },
      { commitment_a: "c-iron", commitment_b: "c-calcium", relation_kind: "antagonist", param_minutes: null },
    ],
  } as unknown as EvaluationSnapshot);

  assertEquals(withRows, bare);
  assertEquals(byId(bare, "c-iron").status, "met");
  assertEquals(byId(bare, "c-calcium").status, "met");
});

// ===========================================================================
// PROPERTY TEST 1 — "the honest never scores below the concealer"
// ===========================================================================

/** Deterministic LCG: a sweep that is reproducible, not a flaky dice roll. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

Deno.test("PROPERTY: logging a NON-CONFORMING meal never lowers the day score (300 scenarios)", () => {
  // Scope, stated precisely because the boundary is a product fact, not a test
  // convenience: the property is asserted over the lines that sit in the
  // denominator whether or not the student logs — polarity do/capture, slot_kind
  // nominal (or day-grain), and LOWER-BOUND targets ('>=' / 'any'). The three
  // structural exceptions are pinned by their own tests right below, each with
  // its reason: upper-bound caps, polarity 'avoid', and 'opportunistic' lines.
  const rand = lcg(20260727);
  const groups = ["berries", "cruciferous_veg", "lean_protein", "whole_grain", "nuts_seeds"];
  const priorities = ["core", "secondary", "optional"] as const;

  for (let scenario = 0; scenario < 300; scenario++) {
    const lineCount = 1 + Math.floor(rand() * 4);
    const commitments: EvaluatorCommitment[] = [];
    const sharedEvents: EvaluatorEvent[] = [];

    for (let i = 0; i < lineCount; i++) {
      const group = groups[Math.floor(rand() * groups.length)];
      const isCapture = rand() < 0.25;
      const occasion = rand() < 0.5;
      // ONE draw for the comparator, so op and bound can never disagree.
      const lowerBound = rand() < 0.85;
      commitments.push(commitment({
        id: `c${i}`,
        polarity: isCapture ? "capture" : "do",
        priority: priorities[Math.floor(rand() * priorities.length)],
        measure: "serving",
        unit: "serving",
        targetOp: lowerBound ? ">=" : "any",
        targetMin: lowerBound ? 1 + Math.floor(rand() * 3) : null,
        targetMax: null,
        foodGroupRef: group,
        evaluationGrain: occasion ? "occasion" : "day",
        anchorKind: occasion ? "slot" : "free",
        slotKey: occasion ? "lunch" : null,
        slotKind: occasion ? "nominal" : null,
      }));
      // some lines already have partial evidence from earlier in the day
      if (rand() < 0.5) {
        sharedEvents.push(event({
          id: `s${scenario}-${i}`,
          foodGroupRef: group,
          quantity: 1,
          unit: "serving",
          slotKey: "lunch",
        }));
      }
    }

    // The non-conforming meal: it happened either way. The concealer says
    // nothing about it; the honest student logs it as it was.
    const nonConforming = event({
      id: `bad-${scenario}`,
      foodGroupRef: groups[Math.floor(rand() * groups.length)],
      quantity: 1,
      unit: "serving",
      slotKey: "dinner",
    });

    const base = snapshot({ commitments, dayIsClosed: true });
    const concealer = evaluateSnapshot({ ...base, events: sharedEvents });
    const honest = evaluateSnapshot({ ...base, events: [...sharedEvents, nonConforming] });

    const concealerScore = computeDayScore(concealer.evaluations.map(toAdherence)) ?? 0;
    const honestScore = computeDayScore(honest.evaluations.map(toAdherence)) ?? 0;

    assert(
      honestScore >= concealerScore - 1e-9,
      `scenario ${scenario}: honest ${honestScore} < concealer ${concealerScore}`,
    );
  }
});

Deno.test("PROPERTY exception 1/3 — an upper-bound cap: the report IS the grade", () => {
  // "<=" is an inverted target: logging the fact that breaks the cap lowers the
  // score, by construction. This is the prescription speaking, not a scoring
  // artifact; it is pinned here so nobody "fixes" it into silence-tolerance.
  const cap = commitment({
    id: "c-cap",
    measure: "dose",
    unit: "mg",
    targetOp: "<=",
    targetMax: 200,
    substanceRef: "caffeine",
    tolerancePct: 0,
  });
  const concealed = evaluateSnapshot(snapshot({ commitments: [cap], dayIsClosed: true }));
  const honest = evaluateSnapshot(snapshot({
    commitments: [cap],
    events: [event({ id: "e1", substanceRef: "caffeine", quantity: 400, unit: "mg" })],
    dayIsClosed: true,
  }));
  assertEquals(byId(concealed, "c-cap").status, "missed"); // unlogged at close
  assertEquals(byId(honest, "c-cap").status, "missed");
  // Equal here, and never worse: an unlogged cap line still closes as missed.
  assertEquals(
    computeDayScore(honest.evaluations.map(toAdherence)),
    computeDayScore(concealed.evaluations.map(toAdherence)),
  );
});

Deno.test("PROPERTY exception 2/3 — polarity 'avoid': the inverted default is the prescription", () => {
  const avoid = commitment({
    id: "c-avoid",
    polarity: "avoid",
    measure: "presence",
    substanceRef: "alcohol",
    targetOp: "==",
    targetMin: 0,
  });
  const concealed = evaluateSnapshot(snapshot({ commitments: [avoid], dayIsClosed: true }));
  const honest = evaluateSnapshot(snapshot({
    commitments: [avoid],
    events: [event({ id: "e1", substanceRef: "alcohol", quantity: 1, unit: "serving" })],
    dayIsClosed: true,
  }));
  assertEquals(byId(concealed, "c-avoid").status, "met");
  assertEquals(byId(honest, "c-avoid").status, "missed");
  // R6 states this explicitly ("absence of fact => met"). An avoid line asks a
  // yes/no question about a prohibition: answering "yes I drank" IS the miss.
  // The counterweight is not in the score, it is in planned_deviations declared
  // in advance (=> not_applicable / flex_used), which the student controls.
});

Deno.test("PROPERTY exception 3/3 — 'opportunistic': the guard is COVERAGE, not the score", () => {
  // An opportunistic line with no fact leaves the denominator (R6: never a
  // false missed), so a concealer can hold a high day_score on fewer lines.
  // That is exactly why coverage and adherence are TWO NUMBERS, NEVER MERGED:
  // the concealer's day carries strictly fewer resolved evaluations, and the
  // 4/7 display gate is computed on events, not on grades.
  const opportunistic = commitment({
    id: "c-veg",
    evaluationGrain: "occasion",
    anchorKind: "slot",
    slotKey: "any_meal",
    slotKind: "opportunistic",
    measure: "serving",
    unit: "serving",
    targetOp: ">=",
    targetMin: 2,
    foodGroupRef: "cruciferous_veg",
  });
  const nominal = commitment({
    id: "c-berries",
    measure: "serving",
    unit: "serving",
    targetOp: ">=",
    targetMin: 1,
    foodGroupRef: "berries",
  });
  const shared = [event({ id: "ok", foodGroupRef: "berries", quantity: 1, unit: "serving" })];

  const concealer = evaluateSnapshot(snapshot({
    commitments: [opportunistic, nominal],
    events: shared,
    dayIsClosed: true,
  }));
  const honest = evaluateSnapshot(snapshot({
    commitments: [opportunistic, nominal],
    events: [
      ...shared,
      event({ id: "bad", foodGroupRef: "cruciferous_veg", quantity: 1, unit: "serving", slotKey: "lunch" }),
    ],
    dayIsClosed: true,
  }));

  const concealerScore = computeDayScore(concealer.evaluations.map(toAdherence)) ?? 0;
  const honestScore = computeDayScore(honest.evaluations.map(toAdherence)) ?? 0;
  assert(honestScore < concealerScore, "the single-number gap is real and must stay visible");

  // ...and the concealer pays for it on the OTHER number, every time.
  assertEquals(concealer.coverageDeficits.length, 1);
  assertEquals(honest.coverageDeficits.length, 0);
  assert(honest.evaluations.length > concealer.evaluations.length);
});

// ===========================================================================
// PROPERTY TEST 5 — the three acceptance fixtures of SCHEMA.md
// ===========================================================================

/** Every column of commitment_evaluations must be present and token-valid. */
function assertCompleteEvaluation(e: CommitmentEvaluation, label: string) {
  const required: [string, unknown][] = [
    ["userId", e.userId],
    ["commitmentId", e.commitmentId],
    ["planVersionId", e.planVersionId],
    ["localDate", e.localDate],
    ["grain", e.grain],
    ["expected", e.expected],
    ["observed", e.observed],
    ["status", e.status],
    ["timingStatus", e.timingStatus],
    ["evidence", e.evidence],
    ["sourceEventIds", e.sourceEventIds],
    ["priority", e.priority],
    ["expectedEvaluationsPerDay", e.expectedEvaluationsPerDay],
  ];
  for (const [name, value] of required) {
    assert(value !== undefined && value !== null, `${label}: missing field ${name}`);
  }
  // nullable-but-declared columns must be present as keys, not absent
  assert("slotKey" in e, `${label}: slotKey key absent`);
  assert("observedValue" in e, `${label}: observedValue key absent`);
  assert("confidence" in e, `${label}: confidence key absent`);
  assert("resolvedAt" in e, `${label}: resolvedAt key absent`);
  assert("resolvedBy" in e, `${label}: resolvedBy key absent`);
  // R7: the two output vocabularies re-parsed
  parseEvalStatus(e.status);
  parseTimingStatus(e.timingStatus);
}

const FIXTURE_1: EvaluatorCommitment[] = [
  commitment({
    id: "f1-1", // Vitamin D3 5000 IU, breakfast
    measure: "dose", unit: "IU", targetOp: ">=", targetMin: 5000, substanceRef: "vitamin_d3",
    evaluationGrain: "occasion", anchorKind: "slot", slotKey: "breakfast", slotKind: "nominal",
    requiredDaysPerWeek: 7, priority: "core",
  }),
  commitment({
    id: "f1-2", // Omega-3 2 g EPA+DHA, any source
    measure: "micronutrient", unit: "g", targetOp: ">=", targetMin: 2,
    substanceRef: "omega3_epa_dha", evaluationGrain: "day", anchorKind: "free",
    requiredDaysPerWeek: 7, priority: "core",
  }),
  commitment({
    id: "f1-3", // Magnesium glycinate 400 mg, before bed
    measure: "dose", unit: "mg", targetOp: ">=", targetMin: 400, substanceRef: "magnesium_glycinate",
    evaluationGrain: "occasion", anchorKind: "slot", slotKey: "before_bed", slotKind: "nominal",
    priority: "secondary",
  }),
  commitment({
    id: "f1-4", // Cruciferous veg 2 servings/day
    measure: "serving", unit: "serving", targetOp: ">=", targetMin: 2,
    foodGroupRef: "cruciferous_veg", evaluationGrain: "day", anchorKind: "slot",
    slotKey: "any_meal", slotKind: "opportunistic", expectedOccasionsPerDay: 2,
    evidenceKind: "photo", priority: "core",
  }),
  commitment({
    id: "f1-5", // Fatty fish 3x/week
    measure: "serving", unit: "serving", targetOp: ">=", targetMin: 3,
    foodGroupRef: "fatty_fish", evaluationGrain: "week", anchorKind: "free",
    requiredDaysPerWeek: 3, evidenceKind: "photo", priority: "secondary",
  }),
  commitment({
    id: "f1-6", // Berries 1 serving/day
    measure: "serving", unit: "serving", targetOp: ">=", targetMin: 1,
    foodGroupRef: "berries", evaluationGrain: "day", anchorKind: "free", priority: "optional",
  }),
  commitment({
    id: "f1-7", // Protocol breakfast (composition lives in `content`, NOT read here)
    measure: "presence", unit: "none", targetOp: "any",
    evaluationGrain: "occasion", anchorKind: "slot", slotKey: "breakfast", slotKind: "nominal",
    scheduledDays: ["mon", "tue", "wed", "thu", "fri"], evidenceKind: "photo", priority: "secondary",
  }),
  commitment({
    id: "f1-8", // Iron bisglycinate 25 mg fasted
    measure: "dose", unit: "mg", targetOp: ">=", targetMin: 25, substanceRef: "iron_bisglycinate",
    evaluationGrain: "occasion", anchorKind: "slot", slotKey: "on_waking", slotKind: "nominal",
    priority: "core",
  }),
  commitment({
    id: "f1-9", // No alcohol on weekdays
    polarity: "avoid", measure: "presence", substanceRef: "alcohol", targetOp: "==", targetMin: 0,
    evaluationGrain: "day", anchorKind: "free", scheduledDays: ["mon", "tue", "wed", "thu", "fri"],
    evidenceKind: "none_implicit", priority: "secondary",
  }),
  commitment({
    id: "f1-10", // 16:8 eating window kept
    measure: "boolean", unit: "none", targetOp: "any",
    evaluationGrain: "day", anchorKind: "window", windowStartLocal: "20:00", windowEndLocal: "12:00",
    priority: "core",
  }),
];

const FIXTURE_2: EvaluatorCommitment[] = [
  commitment({
    id: "f2-1", // Cold exposure 3 min <= 11 C
    measure: "duration", unit: "min", targetOp: ">=", targetMin: 3,
    evaluationGrain: "occasion", anchorKind: "slot", slotKey: "on_waking", slotKind: "nominal",
    scheduledDays: ["mon", "wed", "fri"],
  }),
  commitment({
    id: "f2-2", // Morning light 10 min, window 06:00-10:00
    measure: "duration", unit: "min", targetOp: ">=", targetMin: 10,
    evaluationGrain: "occasion", anchorKind: "window", windowStartLocal: "06:00",
    windowEndLocal: "10:00", slotKind: "nominal",
  }),
  commitment({
    id: "f2-3", // In bed by 23:00
    measure: "clock_time", unit: "hhmm", targetOp: "<=", targetMax: 2300,
    evaluationGrain: "day", anchorKind: "clock", clockLocal: "23:00", toleranceMinutes: 15,
    evidenceKind: "device", autoSource: "oura",
  }),
  commitment({
    id: "f2-4", // Sleep 7-9 h — OUTCOME axis
    polarity: "capture", measure: "duration", unit: "h", targetOp: "between",
    targetMin: 7, targetMax: 9, evaluationGrain: "day", anchorKind: "free",
    evidenceKind: "device", autoSource: "oura", countsTowardAdherence: false,
  }),
  commitment({
    id: "f2-5", // Zone-2 cardio 3x/week
    measure: "count", unit: "session", targetOp: ">=", targetMin: 3,
    evaluationGrain: "week", anchorKind: "free", requiredDaysPerWeek: 3,
  }),
  commitment({
    id: "f2-6", // Daily HRV reading — OUTCOME axis
    polarity: "capture", measure: "count", unit: "none", targetOp: ">=", targetMin: 1,
    evaluationGrain: "day", anchorKind: "free", evidenceKind: "device",
    autoSource: "whoop", countsTowardAdherence: false,
  }),
];

const FIXTURE_3: EvaluatorCommitment[] = [
  commitment({
    id: "f3-1", // Breakfast plate, slot + window, mon/wed/fri
    measure: "composition", unit: "none", targetOp: "any",
    evaluationGrain: "occasion", anchorKind: "slot", slotKey: "breakfast",
    windowStartLocal: "07:00", windowEndLocal: "09:30", slotKind: "nominal",
    scheduledDays: ["mon", "wed", "fri"], autonomy: "swap_within_policy",
    swapPolicy: { class_equivalent: true }, foodGroupRef: "berries",
  }),
  commitment({
    id: "f3-2", // Dinner per plan
    measure: "composition", unit: "none", targetOp: "any",
    evaluationGrain: "occasion", anchorKind: "slot", slotKey: "dinner",
    windowStartLocal: "18:00", windowEndLocal: "20:30", slotKind: "nominal",
    autonomy: "swap_within_policy", swapPolicy: { class_equivalent: true },
    foodGroupRef: "lean_protein",
  }),
  commitment({
    id: "f3-3", // Zero gluten — medical severity
    polarity: "avoid", measure: "presence", substanceRef: "gluten", targetOp: "==", targetMin: 0,
    evaluationGrain: "day", anchorKind: "free", autonomy: "strict",
  }),
  commitment({
    id: "f3-4", // Dinner before 20:30
    measure: "presence", unit: "none", targetOp: "any",
    evaluationGrain: "occasion", anchorKind: "window", windowStartLocal: "18:00",
    windowEndLocal: "20:30", slotKind: "nominal", autonomy: "flexible",
    foodGroupRef: "lean_protein",
  }),
  commitment({
    id: "f3-5", // Bloating 0-10 daily
    polarity: "capture", measure: "scale", unit: "point", targetOp: "between",
    targetMin: 0, targetMax: 10, evaluationGrain: "day", anchorKind: "free",
    evidenceKind: "numeric_entry", countsTowardAdherence: false,
  }),
];

Deno.test("PROPERTY: the 3 acceptance fixtures of SCHEMA.md evaluate with no missing field", () => {
  const fixtures: [string, EvaluatorCommitment[]][] = [
    ["fixture 1 (epigenetics)", FIXTURE_1],
    ["fixture 2 (biohacker)", FIXTURE_2],
    ["fixture 3 (coeliac)", FIXTURE_3],
  ];
  let total = 0;
  for (const [label, commitments] of fixtures) {
    for (const dayIsClosed of [false, true]) {
      const r = evaluateSnapshot(snapshot({
        commitments,
        dayOfWeek: "mon",
        dayIsClosed,
        weekIsClosed: dayIsClosed,
        events: [
          event({ id: "e1", substanceRef: "vitamin_d3", quantity: 5000, unit: "IU", slotKey: "breakfast", localTime: "07:40" }),
          event({ id: "e2", substanceRef: "omega3_epa_dha", quantity: 2.2, unit: "g", localTime: "12:30" }),
          event({ id: "e3", foodGroupRef: "cruciferous_veg", quantity: 2, unit: "serving", slotKey: "lunch", localTime: "12:30" }),
          event({ id: "e4", foodGroupRef: "berries", quantity: 1, unit: "serving", slotKey: "breakfast", localTime: "07:40" }),
          event({ id: "e5", commitmentId: "f2-2", quantity: 12, unit: "min", localTime: "07:10" }),
          event({ id: "e6", commitmentId: "f2-3", quantity: 2245, unit: "hhmm", localTime: "22:45", source: "integration" }),
          event({ id: "e7", foodGroupRef: "lean_protein", quantity: 1, unit: "serving", slotKey: "dinner", localTime: "19:15" }),
        ],
        weekEvents: [
          event({ id: "w1", foodGroupRef: "fatty_fish", quantity: 3, unit: "serving", localDate: "2026-07-29" }),
        ],
      }));
      assert(r.evaluations.length > 0, `${label}: produced no evaluation`);
      for (const e of r.evaluations) assertCompleteEvaluation(e, `${label}/${e.commitmentId}`);
      total += r.evaluations.length;
    }
  }
  assert(total >= 30, `expected the three fixtures to produce evaluations on both passes, got ${total}`);
});

Deno.test("fixture 1: the plan of a compliant Monday scores, and the gate stays honest", () => {
  const week = ["2026-07-27", "2026-07-28", "2026-07-29", "2026-07-30", "2026-07-31", "2026-08-01", "2026-08-02"];
  const r = evaluateSnapshot(snapshot({
    commitments: FIXTURE_1,
    dayOfWeek: "mon",
    dayIsClosed: true,
    events: [
      event({ id: "e1", substanceRef: "vitamin_d3", quantity: 5000, unit: "IU", slotKey: "breakfast" }),
      event({ id: "e2", substanceRef: "omega3_epa_dha", quantity: 2.2, unit: "g" }),
      event({ id: "e3", substanceRef: "magnesium_glycinate", quantity: 400, unit: "mg", slotKey: "before_bed" }),
      event({ id: "e4", foodGroupRef: "cruciferous_veg", quantity: 2, unit: "serving", slotKey: "lunch" }),
      event({ id: "e5", foodGroupRef: "berries", quantity: 1, unit: "serving", slotKey: "breakfast" }),
      event({ id: "e6", substanceRef: "iron_bisglycinate", quantity: 25, unit: "mg", slotKey: "on_waking" }),
      event({ id: "e7", commitmentId: "f1-7", slotKey: "breakfast", source: "photo" }),
      event({ id: "e8", commitmentId: "f1-10", localTime: "11:30" }),
    ],
  }));
  assertEquals(byId(r, "f1-1").status, "met");
  assertEquals(byId(r, "f1-2").status, "met");
  assertEquals(byId(r, "f1-9").status, "met"); // avoid, nothing logged
  assertEquals(byId(r, "f1-10").timingStatus, "on_time");

  // One day of logging out of seven: the gate must refuse to show a percentage.
  const gated = computeWeekAdherence({
    weekDates: week,
    evaluations: r.evaluations.map(toAdherence),
    eventCountsByDate: { "2026-07-27": 8 },
  });
  assertEquals(gated.kind, "insufficient_data");
  assert(!("overallPct" in gated));
});

// ===========================================================================
// C1 — SLOT SCOPING of a nominal occasion line (the food-group aliasing bug)
// ===========================================================================

/** "Protein at dinner" — the most common nutrition recommendation there is. */
function proteinAtDinner(over: Partial<EvaluatorCommitment> = {}): EvaluatorCommitment {
  return commitment({
    id: "c-protein-dinner",
    evaluationGrain: "occasion",
    slotKind: "nominal",
    anchorKind: "slot",
    slotKey: "dinner",
    measure: "serving",
    unit: "serving",
    targetOp: ">=",
    targetMin: 1,
    foodGroupRef: "eggs",
    ...over,
  });
}

Deno.test("C1 FILTERS: an egg logged at BREAKFAST does not satisfy 'protein at DINNER'", () => {
  const c = proteinAtDinner();
  const breakfastEgg = event({
    id: "e-bkf",
    foodGroupRef: "eggs",
    quantity: 1,
    unit: "serving",
    slotKey: "breakfast",
    localTime: "07:40",
  });

  // Day still open: the dinner line has no fact of its own => unknown, and
  // crucially NOT `met` + `off_window`, which credited breakfast to dinner.
  const open = evaluateSnapshot(snapshot({ commitments: [c], events: [breakfastEgg] }));
  assertEquals(byId(open, "c-protein-dinner").status, "unknown");
  assertEquals(byId(open, "c-protein-dinner").observed.matched_event_count, 0);
  assertEquals(byId(open, "c-protein-dinner").sourceEventIds, []);

  // Day closed: the nominal branch resolves it missed, as it would with no log.
  const closed = evaluateSnapshot(
    snapshot({ commitments: [c], events: [breakfastEgg], dayIsClosed: true }),
  );
  assertEquals(byId(closed, "c-protein-dinner").status, "missed");

  // Same fact at dinner: met, on_time. The line is satisfiable, not unreachable.
  const atDinner = evaluateSnapshot(snapshot({
    commitments: [c],
    events: [event({ ...breakfastEgg, slotKey: "dinner", localTime: "19:15" })],
  }));
  assertEquals(byId(atDinner, "c-protein-dinner").status, "met");
  assertEquals(byId(atDinner, "c-protein-dinner").timingStatus, "on_time");
});

Deno.test("C1 FILTERS: one fact is never credited to two nominal occasion lines", () => {
  const breakfast = proteinAtDinner({ id: "c-bkf", slotKey: "breakfast" });
  const dinner = proteinAtDinner();
  const r = evaluateSnapshot(snapshot({
    commitments: [breakfast, dinner],
    dayIsClosed: true,
    events: [event({ id: "e1", foodGroupRef: "eggs", quantity: 1, unit: "serving", slotKey: "breakfast" })],
  }));
  assertEquals(byId(r, "c-bkf").status, "met");
  assertEquals(byId(r, "c-protein-dinner").status, "missed");
});

Deno.test("C1 does NOT filter: a WINDOW line done outside its window stays met + off_window", () => {
  // R6, verbatim: "done, but at the wrong time" must remain expressible. An
  // action with a window has no slot to be scoped by, and a late action is done.
  const c = commitment({
    id: "c-window-food",
    evaluationGrain: "occasion",
    slotKind: "nominal",
    anchorKind: "window",
    windowStartLocal: "18:00",
    windowEndLocal: "20:30",
    measure: "serving",
    unit: "serving",
    targetOp: ">=",
    targetMin: 1,
    foodGroupRef: "eggs",
  });
  const r = evaluateSnapshot(snapshot({
    commitments: [c],
    events: [event({ id: "e1", foodGroupRef: "eggs", quantity: 1, unit: "serving", localTime: "22:10" })],
  }));
  assertEquals(byId(r, "c-window-food").status, "met");
  assertEquals(byId(r, "c-window-food").timingStatus, "off_window");
});

Deno.test("C1 does NOT filter: a SUBSTANCE line keeps met + off_window (D3 swallowed at dinner)", () => {
  // A substance_ref is an IDENTITY, not a category: there is one D3 line, and
  // "I took the D3" late is taken. Filtering it would produce the unjust
  // `missed` the contract exists to forbid.
  const c = commitment({
    id: "c-d3-scope",
    evaluationGrain: "occasion",
    slotKind: "nominal",
    anchorKind: "slot",
    slotKey: "breakfast",
    measure: "dose",
    unit: "IU",
    targetOp: ">=",
    targetMin: 5000,
    substanceRef: "vitamin_d3",
  });
  const r = evaluateSnapshot(snapshot({
    commitments: [c],
    dayIsClosed: true,
    events: [event({ id: "e1", substanceRef: "vitamin_d3", quantity: 5000, unit: "IU", slotKey: "dinner" })],
  }));
  assertEquals(byId(r, "c-d3-scope").status, "met");
  assertEquals(byId(r, "c-d3-scope").timingStatus, "off_window");
});

Deno.test("C1 does NOT filter: day grain, opportunistic, any_meal, or a slotless fact", () => {
  // (a) grain='day': the day is the occasion. Where inside it is not the target.
  const dayLine = proteinAtDinner({ id: "c-day", evaluationGrain: "day", slotKey: "dinner" });
  // (b) slot_kind='opportunistic': the evaluation is BORN from the fact, and is
  //     emitted under the slot the student actually logged.
  const opportunistic = proteinAtDinner({ id: "c-oppo", slotKind: "opportunistic" });
  // (c) 'any_meal' asserts nothing about timing, by construction.
  const anyMeal = proteinAtDinner({ id: "c-any", slotKey: "any_meal" });

  const breakfastEgg = event({
    id: "e1",
    foodGroupRef: "eggs",
    quantity: 1,
    unit: "serving",
    slotKey: "breakfast",
  });
  const r = evaluateSnapshot(snapshot({
    commitments: [dayLine, opportunistic, anyMeal],
    events: [breakfastEgg],
  }));
  assertEquals(byId(r, "c-day").status, "met");
  assertEquals(byId(r, "c-oppo").status, "met");
  assertEquals(byId(r, "c-oppo").slotKey, "breakfast");
  assertEquals(byId(r, "c-any").status, "met");

  // (d) a fact with NO slot: "we do not know when" must not become "it did not
  //     happen". It matches, and the timing is honestly unknown.
  const slotless = evaluateSnapshot(snapshot({
    commitments: [proteinAtDinner()],
    events: [event({ ...breakfastEgg, slotKey: null })],
  }));
  assertEquals(byId(slotless, "c-protein-dinner").status, "met");
  assertEquals(byId(slotless, "c-protein-dinner").timingStatus, "unknown");
});

// ===========================================================================
// C3 — required_days_per_week counts DAYS, not portions
// ===========================================================================

const LEGUMES_3X_WEEK = commitment({
  id: "c-legumes",
  evaluationGrain: "week",
  measure: "serving",
  unit: "serving",
  targetOp: ">=",
  targetMin: 3,
  requiredDaysPerWeek: 3,
  foodGroupRef: "legumes",
  priority: "secondary",
});

function legumeServing(id: string, localDate: string): EvaluatorEvent {
  return event({ id, localDate, foodGroupRef: "legumes", quantity: 1, unit: "serving" });
}

Deno.test("C3: 'legumes 3x/week' is NOT met by three portions on the SAME day", () => {
  const r = evaluateSnapshot(snapshot({
    commitments: [LEGUMES_3X_WEEK],
    weekIsClosed: true,
    weekEvents: [
      legumeServing("w1", "2026-07-29"),
      legumeServing("w2", "2026-07-29"),
      legumeServing("w3", "2026-07-29"),
    ],
  }));
  const e = byId(r, "c-legumes");
  // Something WAS reported: partial, never a missed — and never a met.
  assertEquals(e.status, "partial");
  assertEquals(e.observed.distinct_days, 1);
  // The observed VALUE stays the measurement, in the unit of `expected`.
  assertEquals(e.observedValue, 3);
  assertEquals(e.expected.unit, "serving");
  assertEquals(e.expected.required_days_per_week, 3);
});

Deno.test("C3: the same three portions across three days ARE met", () => {
  const r = evaluateSnapshot(snapshot({
    commitments: [LEGUMES_3X_WEEK],
    weekIsClosed: true,
    weekEvents: [
      legumeServing("w1", "2026-07-27"),
      legumeServing("w2", "2026-07-29"),
      legumeServing("w3", "2026-07-31"),
    ],
  }));
  assertEquals(byId(r, "c-legumes").status, "met");
  assertEquals(byId(r, "c-legumes").observed.distinct_days, 3);
});

Deno.test("C3: the day requirement only DOWNGRADES — it never rescues a short week", () => {
  // Two days, one serving each: under target AND under the day requirement.
  const short = evaluateSnapshot(snapshot({
    commitments: [LEGUMES_3X_WEEK],
    weekIsClosed: true,
    weekEvents: [legumeServing("w1", "2026-07-27"), legumeServing("w2", "2026-07-29")],
  }));
  assertEquals(byId(short, "c-legumes").status, "partial");

  // Nothing logged at all stays a missed at week close, not a partial.
  const nothing = evaluateSnapshot(snapshot({
    commitments: [LEGUMES_3X_WEEK],
    weekIsClosed: true,
  }));
  assertEquals(byId(nothing, "c-legumes").status, "missed");
});

Deno.test("C3: a DAILY line carrying required_days_per_week=7 is untouched by the day rule", () => {
  // SCHEMA fixture 1 lines 1-4 and 6 all carry required_days_per_week=7 while
  // being graded on a dose or a serving count. Applying the day rule there would
  // compare a distinct-day count against a 5000 IU target.
  const d3 = commitment({
    id: "c-d3-daily",
    evaluationGrain: "occasion",
    slotKind: "nominal",
    anchorKind: "slot",
    slotKey: "breakfast",
    measure: "dose",
    unit: "IU",
    targetOp: ">=",
    targetMin: 5000,
    substanceRef: "vitamin_d3",
    requiredDaysPerWeek: 7,
    scheduledDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
  });
  const r = evaluateSnapshot(snapshot({
    commitments: [d3],
    events: [event({ id: "e1", substanceRef: "vitamin_d3", quantity: 5000, unit: "IU", slotKey: "breakfast" })],
  }));
  assertEquals(byId(r, "c-d3-daily").status, "met");
  assertEquals(byId(r, "c-d3-daily").observed.distinct_days, 1);
});

// ===========================================================================
// P — measure IN ('portion','serving'): THE ORDINAL BAND BRANCH (R6)
//
// Authority: docs/keel/PHOTO_QUANTIFICATION.md §2 and §4, CONTRACT NON-INPUT #4
// ("a photo may evidence presence/composition/portion/serving; it never
// produces a micronutrient or energy/macro_* fact").
//
// The band was already computed on every meal photo and buried in `recognized`
// jsonb, which R5 forbids the evaluator to read. These tests pin what the column
// may now do — and, at greater length, what it may NEVER do.
// ===========================================================================

/** "sweets <= 1 serving/day" — an UPPER-BOUND cap, the only gating direction. */
const SWEETS_CAP = commitment({
  id: "c-sweets-cap",
  measure: "serving",
  unit: "serving",
  targetOp: "<=",
  targetMin: null,
  targetMax: 1,
  tolerancePct: 0,
  foodGroupRef: "sugar_sweets",
  evaluationGrain: "day",
});

/** "veg >= 2 servings/day" — a LOWER-BOUND floor, structurally un-gateable. */
const VEG_FLOOR = commitment({
  id: "c-veg-floor",
  measure: "serving",
  unit: "serving",
  targetOp: ">=",
  targetMin: 2,
  tolerancePct: 0,
  foodGroupRef: "non_starchy_veg",
  evaluationGrain: "day",
});

function plate(
  id: string,
  group: string,
  band: EvaluatorEvent["portionBand"],
  over: Partial<EvaluatorEvent> = {},
): EvaluatorEvent {
  return event({
    id,
    source: "photo",
    foodGroupRef: group,
    // A photo NEVER carries a number. This is the whole point: the band travels
    // alone, and `quantity`/`unit` stay null on the fact as they do on the row.
    quantity: null,
    unit: null,
    portionBand: band,
    evidenceWeight: 1,
    ...over,
  });
}

Deno.test("P1: a `large` band on an UPPER-BOUND cap pulls met down to partial", () => {
  // The student declared one serving (inside the cap) and the plate visibly
  // contradicts it. `evidence` ranks photo (5) above self-report (2), so the
  // image is allowed to qualify the number — DOWNWARD only, and only to
  // `partial`: a band is not a measurement and cannot close the case as
  // `missed`.
  const declared = event({
    id: "tap",
    source: "quick_tap",
    foodGroupRef: "sugar_sweets",
    quantity: 1,
    unit: "serving",
  });
  const withoutPhoto = evaluateSnapshot(snapshot({
    commitments: [SWEETS_CAP],
    events: [declared],
  }));
  assertEquals(byId(withoutPhoto, "c-sweets-cap").status, "met");

  const withPhoto = evaluateSnapshot(snapshot({
    commitments: [SWEETS_CAP],
    events: [declared, plate("p1", "sugar_sweets", "large")],
  }));
  assertEquals(byId(withPhoto, "c-sweets-cap").status, "partial");
  // NOT a number: the gate changed the GRADE, never the measurement.
  assertEquals(byId(withPhoto, "c-sweets-cap").observedValue, 1);
});

Deno.test("P2: `small`, `moderate` and `unclear` never move a grade, in either direction", () => {
  // The disarm condition of the belt, asserted rather than promised (doctrine
  // P9). `moderate` is the band that confirms nothing and contradicts nothing;
  // `unclear` is "I looked and cannot rank"; `small` is consistent with a cap.
  const declared = event({
    id: "tap",
    source: "quick_tap",
    foodGroupRef: "sugar_sweets",
    quantity: 1,
    unit: "serving",
  });
  for (const band of ["small", "moderate", "unclear"] as const) {
    const r = evaluateSnapshot(snapshot({
      commitments: [SWEETS_CAP],
      events: [declared, plate(`p-${band}`, "sugar_sweets", band)],
    }));
    assertEquals(
      byId(r, "c-sweets-cap").status,
      "met",
      `band ${band} must not gate a cap`,
    );
  }
});

Deno.test("P3: NO band gates a LOWER-BOUND line — the concealer must never win", () => {
  // THE load-bearing restriction. If a `small` band could downgrade a floor
  // line, sending the photo would cost points that hiding the plate would not —
  // PROPERTY TEST 1 ("logging a non-conforming meal never lowers the day score")
  // would be false, and the product would pay a student for concealment.
  const base = evaluateSnapshot(snapshot({
    commitments: [VEG_FLOOR],
    events: [event({
      id: "tap",
      source: "quick_tap",
      foodGroupRef: "non_starchy_veg",
      quantity: 2,
      unit: "serving",
    })],
  }));
  assertEquals(byId(base, "c-veg-floor").status, "met");

  for (const band of ["small", "moderate", "large", "unclear"] as const) {
    const r = evaluateSnapshot(snapshot({
      commitments: [VEG_FLOOR],
      events: [
        event({
          id: "tap",
          source: "quick_tap",
          foodGroupRef: "non_starchy_veg",
          quantity: 2,
          unit: "serving",
        }),
        plate(`p-${band}`, "non_starchy_veg", band),
      ],
    }));
    assertEquals(
      byId(r, "c-veg-floor").status,
      "met",
      `band ${band} must not gate a floor`,
    );
  }
});

Deno.test("P4: a band NEVER lifts a grade — a big plate is not a met", () => {
  // The symmetric refusal, and the one that keeps the calorie question closed.
  // Two unquantified photos against ">= 2 servings" stay `partial` whatever the
  // plates looked like: `large` means "the plate looked big", never "the student
  // ate two servings". Turning the band into a count is the calorie mistake in
  // a different hat (PHOTO_QUANTIFICATION.md §3: bias -26.6%, aggregation
  // divides the error by 1.04).
  for (const band of ["small", "moderate", "large", "unclear"] as const) {
    const r = evaluateSnapshot(snapshot({
      commitments: [VEG_FLOOR],
      dayIsClosed: true,
      events: [
        plate(`a-${band}`, "non_starchy_veg", band),
        plate(`b-${band}`, "non_starchy_veg", band),
      ],
    }));
    const e = byId(r, "c-veg-floor");
    assertEquals(e.status, "partial", `band ${band} must not lift a floor`);
    // And the reason it stays partial: there is still NO number on the row.
    assertEquals(e.observedValue, null);
  }
});

Deno.test("P5: the DISTRIBUTION travels on every evaluation, `unclear` outside `decidable`", () => {
  // "11 plates seen: 2 small, 5 moderate, 4 large" is the coach's answer to
  // "is he eating a lot or a little?", with no kcal in it. It is an OBSERVATION
  // recorded next to `observedValue`, never inside it.
  const r = evaluateSnapshot(snapshot({
    commitments: [VEG_FLOOR],
    events: [
      plate("p1", "non_starchy_veg", "small"),
      plate("p2", "non_starchy_veg", "moderate"),
      plate("p3", "non_starchy_veg", "moderate"),
      plate("p4", "non_starchy_veg", "large"),
      plate("p5", "non_starchy_veg", "unclear"),
      // A tap with no band at all: counted as a match, never as a plate.
      event({
        id: "tap",
        source: "quick_tap",
        foodGroupRef: "non_starchy_veg",
        quantity: 1,
        unit: "serving",
      }),
    ],
  }));
  const e = byId(r, "c-veg-floor");
  assertEquals(e.observed.portion_bands, {
    small: 1,
    moderate: 2,
    large: 1,
    unclear: 1,
    observed: 5,
    decidable: 4,
  });
  assertEquals(e.observed.matched_event_count, 6);
});

Deno.test("P6: a line that is not band-graded ignores bands entirely", () => {
  // NON-INPUT #4 in the other direction: the band exists for portion/serving.
  // A dose line with a photo attached is graded on the dose and nothing else.
  const d3 = commitment({
    id: "c-d3",
    measure: "dose",
    unit: "IU",
    targetOp: "<=",
    targetMax: 5000,
    substanceRef: "vitamin_d3",
    tolerancePct: 0,
  });
  const r = evaluateSnapshot(snapshot({
    commitments: [d3],
    events: [event({
      id: "e1",
      source: "photo",
      substanceRef: "vitamin_d3",
      quantity: 5000,
      unit: "IU",
      portionBand: "large",
    })],
  }));
  assertEquals(byId(r, "c-d3").status, "met");
});

Deno.test("P7: R7 — an off-vocabulary band throws, it is never counted as `unclear`", () => {
  assertThrows(
    () =>
      evaluateSnapshot(snapshot({
        commitments: [VEG_FLOOR],
        events: [plate("p1", "non_starchy_veg", "huge" as never)],
      })),
    Error,
    "unknown portion_band",
  );
});

Deno.test("PROPERTY: adding a BANDED photo never lowers the day score (240 scenarios)", () => {
  // PROPERTY TEST 1, re-run with the new input. The band is the first evaluator
  // input a student can produce by being MORE forthcoming, so the concealer
  // property has to be re-proved against it rather than assumed to survive.
  // Scope is identical to PROPERTY TEST 1: lower-bound / 'any' targets, do or
  // capture, nominal or day grain. Upper-bound caps are the documented
  // exception ("the report IS the grade") and are excluded here as they are
  // there.
  const rand = lcg(20260728);
  const groups = ["berries", "cruciferous_veg", "lean_protein", "non_starchy_veg"];
  const bands = ["small", "moderate", "large", "unclear"] as const;
  const priorities = ["core", "secondary", "optional"] as const;

  for (let scenario = 0; scenario < 240; scenario++) {
    const lineCount = 1 + Math.floor(rand() * 3);
    const commitments: EvaluatorCommitment[] = [];
    const sharedEvents: EvaluatorEvent[] = [];
    for (let i = 0; i < lineCount; i++) {
      const group = groups[Math.floor(rand() * groups.length)];
      const lowerBound = rand() < 0.8;
      commitments.push(commitment({
        id: `c${i}`,
        polarity: rand() < 0.25 ? "capture" : "do",
        priority: priorities[Math.floor(rand() * priorities.length)],
        measure: rand() < 0.5 ? "serving" : "portion",
        unit: "serving",
        targetOp: lowerBound ? ">=" : "any",
        targetMin: lowerBound ? 1 + Math.floor(rand() * 3) : null,
        foodGroupRef: group,
        evaluationGrain: "day",
      }));
      if (rand() < 0.5) {
        sharedEvents.push(event({
          id: `s${scenario}-${i}`,
          foodGroupRef: group,
          quantity: 1,
          unit: "serving",
        }));
      }
    }

    const photo = plate(
      `photo-${scenario}`,
      groups[Math.floor(rand() * groups.length)],
      bands[Math.floor(rand() * bands.length)],
    );

    const base = snapshot({ commitments, dayIsClosed: true });
    const silent = evaluateSnapshot({ ...base, events: sharedEvents });
    const honest = evaluateSnapshot({ ...base, events: [...sharedEvents, photo] });

    const silentScore = computeDayScore(silent.evaluations.map(toAdherence)) ?? 0;
    const honestScore = computeDayScore(honest.evaluations.map(toAdherence)) ?? 0;
    assert(
      honestScore >= silentScore - 1e-9,
      `scenario ${scenario}: with photo ${honestScore} < without ${silentScore}`,
    );
  }
});

// ===========================================================================
// U — the STRUCTURALLY UNOBSERVABLE line: unknown, never missed
//
// Authority: docs/keel/Q6_NUTRITION_LAYER.md:37 — "laissée ouverte, cette ligne
// revient `missed` tous les jours, à vie, pour un élève qui mange parfaitement".
// ===========================================================================

const FIBRE_OPEN = commitment({
  id: "c-fibre",
  measure: "fiber",
  unit: "g",
  targetOp: ">=",
  targetMin: 30,
  // no substance_ref, no food_group_ref: NO branch of matchEvent can reach it
  evaluationGrain: "day",
});

Deno.test("U1: an unreachable macro line resolves `unknown` at day close, never `missed`", () => {
  const r = evaluateSnapshot(snapshot({
    commitments: [FIBRE_OPEN],
    dayIsClosed: true,
    events: [
      // A student eating perfectly: lentils and oats, both logged.
      event({ id: "e1", foodGroupRef: "legumes", quantity: 1, unit: "serving" }),
      event({ id: "e2", foodGroupRef: "whole_grain", quantity: 1, unit: "serving" }),
    ],
  }));
  const e = byId(r, "c-fibre");
  assertEquals(e.status, "unknown");
  // And `unknown` is excluded from the denominator, so the line cannot drag a
  // perfect day down: the score is that of the OTHER lines, or null.
  assertEquals(computeDayScore(r.evaluations.map(toAdherence)), null);
});

Deno.test("U2: DISARM — the same measure WITH a food_group_ref stays observable", () => {
  // The exemption covers exactly the lines nothing can satisfy, and it
  // disappears the instant one can. `fiber` + `whole_grain` IS matchable by the
  // food-group branch, so silence is real silence and closes as `missed`.
  const reachable = commitment({
    ...FIBRE_OPEN,
    id: "c-fibre-grain",
    foodGroupRef: "whole_grain",
  });
  const nothing = evaluateSnapshot(snapshot({
    commitments: [reachable],
    dayIsClosed: true,
  }));
  assertEquals(byId(nothing, "c-fibre-grain").status, "missed");

  // And a fact on it grades normally — `partial`, because a serving of oats
  // carries no gram figure (which is the honest answer, not a bug).
  const logged = evaluateSnapshot(snapshot({
    commitments: [reachable],
    dayIsClosed: true,
    events: [event({ id: "e1", foodGroupRef: "whole_grain" })],
  }));
  assertEquals(byId(logged, "c-fibre-grain").status, "partial");
});

Deno.test("U3: DISARM — an EXPLICIT binding makes the unreachable line reachable", () => {
  // A student who taps the line carries `commitment_id` on the fact, which
  // matches before any heuristic. The exemption is only ever consulted when
  // there is NO match at all, so a bound fact grades normally.
  const r = evaluateSnapshot(snapshot({
    commitments: [FIBRE_OPEN],
    dayIsClosed: true,
    events: [event({
      id: "e1",
      commitmentId: "c-fibre",
      quantity: 32,
      unit: "g",
    })],
  }));
  assertEquals(byId(r, "c-fibre").status, "met");
});

Deno.test("U4: an ordinary unmatched nominal line still closes as `missed`", () => {
  // The falsifiability test of the exemption: it must NOT have widened into
  // "any line with no fact is unknown", which would delete the nominal branch.
  const walk = commitment({
    id: "c-walk",
    measure: "duration",
    unit: "min",
    targetOp: ">=",
    targetMin: 30,
    evaluationGrain: "day",
  });
  const r = evaluateSnapshot(snapshot({ commitments: [walk], dayIsClosed: true }));
  assertEquals(byId(r, "c-walk").status, "missed");
});
