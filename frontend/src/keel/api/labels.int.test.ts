import { describe, expect, it } from "vitest";
import {
  autonomyLabel,
  commitmentAmount,
  commitmentQuestions,
  type CommitmentShape,
  commitmentSentence,
  foodSectionLabel,
  gapQuestion,
  planPartHint,
  planPartLabel,
  studentPartLabel,
} from "./labels";
// The PARTITION itself moved to `planStructure.ts` and is tested there
// (`planStructure.int.test.ts`, over the same eighteen-line document). What is
// left here is what this file is for: the WORDS. The two orders are imported to
// prove every part and every food heading has one.
import { FOOD_SECTION_ORDER, PLAN_PART_ORDER } from "./planStructure";
import { en } from "../i18n/en";

// ===========================================================================
// THE READ-BACK TEST
//
// This file guards ONE property, and it is the property the product is judged
// on before any other: a dietitian who has never heard of us opens the import
// screen, reads her own plan back, and understands every line without being
// taught anything.
//
// What she used to read, for "Protein at every meal":
//
//     do · nutrition · presence · occasion · @ any_meal
//     core 98%
//     lean_protein
//
// and, when a line did not fit the schema:
//
//     plan_commitments_target_check: target_op='<=' requires target_max
//
// Every fixture below is a REAL row: the output of plan-import-v1 on
// supabase/tests/keel/sample_coach_plan.txt, the first genuine coach document
// this product was pointed at. The expected strings are what the screen shows.
// If a change to the sentence builder makes one of them read worse, that is not
// a snapshot to update — it is the regression.
// ===========================================================================

/** A row as the extractor produces it; every field defaulted to "not set". */
function line(overrides: Partial<CommitmentShape>): CommitmentShape {
  return {
    polarity: "do",
    anchor_kind: "free",
    slot_key: null,
    clock_local: null,
    window_start_local: null,
    window_end_local: null,
    measure: "presence",
    unit: null,
    target_op: "any",
    target_min: null,
    target_max: null,
    substance_ref: null,
    food_group_ref: null,
    evaluation_grain: "day",
    scheduled_days: null,
    required_days_per_week: 7,
    expected_occasions_per_day: 1,
    ...overrides,
  };
}

// The document, line by line, exactly as plan-import-v1 returned it.
const PLAN: Array<{ title: string; row: CommitmentShape; reads: string }> = [
  {
    title: "Protein at every meal",
    row: line({
      anchor_kind: "slot",
      slot_key: "any_meal",
      food_group_ref: "lean_protein",
      evaluation_grain: "occasion",
      expected_occasions_per_day: 3,
    }),
    reads: "At every meal — protein",
  },
  {
    title: "Two servings of non-starchy vegetables every day",
    row: line({
      measure: "serving",
      unit: "serving",
      target_op: ">=",
      target_min: 2,
      food_group_ref: "non_starchy_veg",
    }),
    reads: "Every day — 2 servings of vegetables",
  },
  {
    // The line that used to block the whole import on a constraint name, and
    // then — once it parsed — read back as the bare tautology "With breakfast".
    title: "Breakfast within 90 minutes of waking",
    row: line({
      anchor_kind: "slot",
      slot_key: "breakfast",
      evaluation_grain: "occasion",
    }),
    reads: "Every day, with breakfast",
  },
  {
    title: "Vitamin D3 5000 IU with breakfast",
    row: line({
      anchor_kind: "slot",
      slot_key: "breakfast",
      measure: "dose",
      unit: "IU",
      target_op: ">=",
      target_min: 5000,
      substance_ref: "vitamin_d3",
      evaluation_grain: "occasion",
    }),
    reads: "With breakfast — 5000 IU",
  },
  {
    title: "No alcohol Monday through Friday",
    row: line({
      polarity: "avoid",
      target_op: "==",
      target_min: 0,
      substance_ref: "alcohol",
      scheduled_days: ["mon", "tue", "wed", "thu", "fri"],
      required_days_per_week: null,
    }),
    reads: "Weekdays — none",
  },
  {
    title: "Rate your energy 0-10 each evening",
    row: line({
      polarity: "capture",
      anchor_kind: "slot",
      slot_key: "dinner",
      measure: "scale",
      unit: "point",
      target_op: "between",
      target_min: 0,
      target_max: 10,
    }),
    reads: "Each evening — rate 0 to 10 · tracked, not scored",
  },
  {
    title: "Weigh once a week, Saturday morning",
    row: line({
      polarity: "capture",
      anchor_kind: "slot",
      slot_key: "breakfast",
      measure: "scale",
      unit: "point",
      evaluation_grain: "week",
      scheduled_days: ["sat"],
      required_days_per_week: 1,
    }),
    reads: "Every Saturday, at breakfast · tracked, not scored",
  },
  {
    title: "Legumes 3 times a week",
    row: line({
      measure: "serving",
      unit: "serving",
      target_op: ">=",
      target_min: 3,
      food_group_ref: "legumes",
      evaluation_grain: "week",
      required_days_per_week: 3,
    }),
    // "and I mean three different days, not three portions on Sunday" — the
    // one thing the coach bothered to spell out, said back to her.
    reads: "3 different days a week — legumes",
  },
  {
    title: "Lights out by 23:00 on weeknights",
    row: line({
      anchor_kind: "clock",
      clock_local: "23:00",
      measure: "clock_time",
      unit: "hhmm",
      target_op: "<=",
      target_max: 2300,
      scheduled_days: ["mon", "tue", "wed", "thu", "fri"],
      required_days_per_week: null,
    }),
    reads: "Weekdays, at 23:00",
  },
  {
    title: "10 minutes of daylight within an hour of waking",
    row: line({
      anchor_kind: "slot",
      slot_key: "on_waking",
      measure: "duration",
      unit: "min",
      target_op: ">=",
      target_min: 10,
      evaluation_grain: "occasion",
    }),
    reads: "On waking — at least 10 minutes",
  },
  {
    title: "Photograph your breakfast every day for the first two weeks",
    row: line({
      polarity: "capture",
      anchor_kind: "slot",
      slot_key: "breakfast",
    }),
    reads: "Every day, at breakfast · tracked, not scored",
  },
  {
    title: "No added sugar after dinner",
    row: line({
      polarity: "avoid",
      anchor_kind: "slot",
      slot_key: "dinner",
      target_op: "==",
      target_min: 0,
      food_group_ref: "sugar_sweets",
    }),
    reads: "With dinner — none",
  },
];

describe("commitmentSentence — the coach reads her own plan back", () => {
  for (const { title, row, reads } of PLAN) {
    it(`"${title}" reads "${reads}"`, () => {
      expect(commitmentSentence(row)).toBe(reads);
    });
  }
});

describe("the sentence never leaks storage vocabulary", () => {
  // Not "these words are ugly": each one is a token whose MEANING on screen is
  // different from its meaning in the schema. "presence" is a measure, not an
  // instruction; "serving" is a unit, not a portion size; "occasion" is a
  // grain, not a moment. Printed raw they read like a partially translated
  // page, which is exactly what the first coach reported.
  const TOKENS = [
    "presence",
    "occasion",
    "capture",
    "polarity",
    "grain",
    "any_meal",
    "lean_protein",
    "non_starchy_veg",
    "sugar_sweets",
    "vitamin_d3",
    "clock_time",
    "target_op",
    "plan_commitments",
  ];

  for (const { title, row } of PLAN) {
    it(`"${title}" carries none of them`, () => {
      const sentence = commitmentSentence(row);
      for (const token of TOKENS) {
        expect(sentence.includes(token)).toBe(false);
      }
      // No bare snake_case slug of any kind, known or not.
      expect(sentence).not.toMatch(/[a-z0-9]_[a-z0-9]/);
    });
  }
});

describe("the two clauses that carry a whole prescription", () => {
  it("says 'different days', not just a count, when the coach asked for it", () => {
    // required_days_per_week IS the difference between three portions on Sunday
    // and three separate days. Dropping the word drops the prescription.
    const weekly = line({
      measure: "serving",
      unit: "serving",
      target_op: ">=",
      target_min: 3,
      food_group_ref: "fatty_fish",
      evaluation_grain: "week",
      required_days_per_week: 3,
    });
    expect(commitmentSentence(weekly)).toContain("3 different days a week");
  });

  it("says 'none', never 'presence == 0'", () => {
    const avoid = line({
      polarity: "avoid",
      target_op: "==",
      target_min: 0,
      substance_ref: "alcohol",
    });
    expect(commitmentSentence(avoid)).toBe("Every day — none");
  });

  it("marks every capture line as tracked, not scored", () => {
    for (const { row } of PLAN) {
      const sentence = commitmentSentence(row);
      expect(sentence.endsWith(" · tracked, not scored")).toBe(
        row.polarity === "capture",
      );
    }
  });

  it("never quantifies the same recurrence twice", () => {
    // "Every Saturday, each morning at breakfast" is not a style problem: the
    // two halves contradict each other, and the reader cannot tell which one is
    // the prescription.
    for (const { row } of PLAN) {
      const sentence = commitmentSentence(row);
      const quantifiers = sentence.match(/\b(each|every)\b/gi) ?? [];
      expect(quantifiers.length).toBeLessThanOrEqual(1);
    }
  });

  it("keeps the cadence when nothing else follows the moment", () => {
    // A line whose whole sentence is its anchor would otherwise print "With
    // breakfast" — a fragment that restates the weakest half of the title and
    // hides that the line runs every day.
    const bare = line({
      anchor_kind: "slot",
      slot_key: "breakfast",
      evaluation_grain: "occasion",
    });
    expect(commitmentSentence(bare)).toBe("Every day, with breakfast");

    // ...and drops it again as soon as there is a real prescription to read.
    const dosed = { ...bare, measure: "dose", unit: "IU", target_op: ">=", target_min: 5000, substance_ref: "vitamin_d3" };
    expect(commitmentSentence(dosed)).toBe("With breakfast — 5000 IU");
  });

  it("prints no ceiling it was not given, rather than the wrong bound", () => {
    // The extractor's classic mistake: a '<=' line whose bound landed in
    // target_min. Reading the other column would print a confident limit the
    // coach never wrote; the line asks "How much, exactly?" instead.
    const broken = line({
      measure: "count",
      unit: "session",
      target_op: "<=",
      target_min: 2,
      target_max: null,
      food_group_ref: "coffee_tea",
    });
    expect(commitmentSentence(broken)).toBe("Every day — coffee or tea");
  });
});

describe("an unreadable line says so instead of blanking the screen", () => {
  it("renders the honest fallback on an unknown slug", () => {
    const rogue = line({ food_group_ref: "quinoa_and_friends" });
    expect(commitmentSentence(rogue)).toBe(en["question.unreadable"]);
  });
});

describe("commitmentQuestions — constraint names never reach the coach", () => {
  it("turns each blocking issue into a decision she can make", () => {
    const questions = commitmentQuestions([
      "plan_commitments_target_check: target_op='<=' requires target_max",
      "plan_commitments_occasion_anchor_check: grain='occasion' needs an anchor that resolves to an occasion",
    ]);
    expect(questions.map((q) => q.question)).toEqual([
      en["question.how_much"],
      en["question.when"],
    ]);
    for (const q of questions) {
      expect(q.question).not.toMatch(/plan_commitments|target_op|grain=/);
    }
  });

  it("hides OUR bugs rather than dressing them as her decision", () => {
    // A missing template key is something the import should never have
    // produced. It still blocks the save (validateDraft is untouched) — it just
    // is not a question anyone can answer.
    expect(
      commitmentQuestions([
        "template_commitment_key: ASCII snake_case, starting with a letter (R1)",
      ]),
    ).toEqual([]);
  });

  it("falls back to an honest sentence on an issue family it does not know", () => {
    const questions = commitmentQuestions(["some_new_check: whatever it says"]);
    expect(questions).toHaveLength(1);
    expect(questions[0].question).toBe(en["question.unreadable"]);
    expect(questions[0].question).not.toContain("some_new_check");
  });

  it("asks each question once, however many lines raise it", () => {
    const questions = commitmentQuestions([
      "plan_commitments_anchor_check: anchor_kind='slot' requires slot_key",
      "plan_commitments_occasion_anchor_check: grain='occasion' needs an anchor",
      "plan_commitments_nominal_slot_check: nominal slot required",
    ]);
    expect(questions).toHaveLength(1);
    expect(questions[0].fix).toBe("slot");
  });
});


describe("every part and section has a label a coach can read", () => {
  it("names them without a token or a column", () => {
    for (const part of PLAN_PART_ORDER) {
      for (const text of [planPartLabel(part), planPartHint(part), studentPartLabel(part)]) {
        expect(text.length).toBeGreaterThan(0);
        expect(text).not.toMatch(/_/);
      }
    }
    for (const section of FOOD_SECTION_ORDER) {
      expect(foodSectionLabel(section)).not.toMatch(/_/);
    }
  });

  it("says 'tracked, not scored' where the observations live", () => {
    expect(planPartHint("observations").toLowerCase()).toContain("tracked, not scored");
  });
});

// The template editor printed this column's values RAW — a coach opening their
// own library read `swap_within_policy` in a monospaced select, the last
// storage slug visible on the three plan screens.
describe("autonomyLabel — the latitude of a line, in words", () => {
  it("never hands back the slug it was given", () => {
    for (const token of ["strict", "swap_within_policy", "flexible"]) {
      const text = autonomyLabel(token);
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toMatch(/_/);
      expect(text).not.toBe(token);
    }
  });

  // R7: the next value added to the enum fails at the first render rather than
  // leaking as a slug — which is exactly how this one survived.
  it("throws on a value the seed has no word for", () => {
    expect(() => autonomyLabel("negotiated")).toThrow(/no message key/);
  });
});

describe("gapQuestion — a hole in the document is a decision, not a finding", () => {
  it("reads the positive form as its subject", () => {
    expect(
      gapQuestion(
        "The document asks for retesting vitamin D in 8 weeks, but no standalone retest commitment is prescribed.",
      ),
    ).toBe("Retesting vitamin D in 8 weeks — do you want that tracked?");
  });

  it("reads the negative form as its subject", () => {
    expect(gapQuestion("The document sets no explicit hydration target.")).toBe(
      "Explicit hydration target — do you want that tracked?",
    );
  });

  it("keeps a negation rather than inverting the coach's meaning", () => {
    const q = gapQuestion("The document says not to stack all three sessions at the weekend.");
    expect(q).toBe("Not to stack all three sessions at the weekend — do you want that tracked?");
  });

  it("falls back to the generic question rather than inventing a subject", () => {
    expect(gapQuestion("   ")).toBe(en["review.gap_question_generic"]);
  });
});

// ---------------------------------------------------------------------------
// commitmentAmount — the STUDENT reads the same phrase as the coach
//
// Before this function existed the student's day and the coach's import screen
// rendered the same four rows two different ways, because the student's chip
// was still built from `targetLabel` (the storage triple: `target_op` + bound +
// `unit` badge). Measured on the real published plan:
//
//     coach                        student
//     "Weekdays, at 23:00"         "<= 2300 time"
//     "Weekdays — none"            "0"
//     "Every day — 2 servings"     ">= 2 serving"
//
// `time` is the display string of the `hhmm` unit token and 2300 is a clock
// stored as an integer. Every case below is one of those rows.
// ---------------------------------------------------------------------------

describe("commitmentAmount — one renderer for both screens", () => {
  it("a clock ceiling never prints the stored integer or the unit token", () => {
    const bedtime = line({
      anchor_kind: "clock",
      clock_local: "23:00",
      measure: "clock_time",
      unit: "hhmm",
      target_op: "<=",
      target_max: 2300,
      scheduled_days: ["mon", "tue", "wed", "thu", "fri"],
    });
    const amount = commitmentAmount(bedtime);
    expect(amount).not.toContain("2300");
    expect(amount).not.toContain("time");
    expect(amount).not.toContain("<=");
  });

  it("an avoid line says none, never the comparator's zero", () => {
    const noSugar = line({
      polarity: "avoid",
      anchor_kind: "slot",
      slot_key: "dinner",
      target_op: "==",
      target_min: 0,
      food_group_ref: "sugar_sweets",
    });
    expect(commitmentAmount(noSugar)).toBe(en["amount.none"]);
    expect(commitmentAmount(noSugar)).not.toBe("0");
  });

  it("a counted target agrees with its number", () => {
    const veg = line({
      measure: "serving",
      unit: "serving",
      target_op: ">=",
      target_min: 2,
      food_group_ref: "non_starchy_veg",
    });
    expect(commitmentAmount(veg)).toContain("servings");
    expect(commitmentAmount(veg)).not.toContain(">=");
  });

  it("a dose travels verbatim — the coach's number is the coach's number", () => {
    const d3 = line({
      anchor_kind: "slot",
      slot_key: "breakfast",
      measure: "dose",
      unit: "IU",
      target_op: ">=",
      target_min: 5000,
      substance_ref: "vitamin_d3",
    });
    expect(commitmentAmount(d3)).toContain("5000 IU");
  });

  it("no chip ever carries an operator or a raw unit slug", () => {
    for (const { row } of PLAN) {
      const amount = commitmentAmount(row);
      for (const forbidden of [">=", "<=", "==", " time", "hhmm", "presence"]) {
        expect(amount).not.toContain(forbidden);
      }
    }
  });

  it("an unreadable line renders no chip rather than throwing at the student", () => {
    const rogue = line({ unit: "not_a_unit", target_op: ">=", target_min: 1, measure: "dose" });
    expect(commitmentAmount(rogue)).toBe("");
  });
});
