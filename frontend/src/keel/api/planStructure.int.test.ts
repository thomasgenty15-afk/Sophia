import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildPlanStructure,
  FAMILY_ORDER,
  FOOD_SECTION_ORDER,
  foodSectionOf,
  PLAN_PART_ORDER,
  type PlanPart,
  type PlanPartShape,
  planPartOf,
  resetUnknownFamilyReports,
  sectionFor,
  type SlotOrder,
} from "./planStructure";
import { ACTIVITY_CLASS_ORDER } from "./todayModel";

// ===========================================================================
// THE STRUCTURE OF A PLAN — one shape, whatever screen reads it
//
// THE DEFECT THIS FILE GUARDS. The same eighteen lines were laid out three
// different ways: the import review had the coach's four food headings, the
// template editor had one flat column, and the student's day had occasions.
// Nothing was WRONG with any of the three, which is exactly why it lasted: a
// coach approved a plan under four headings, reopened it from the template
// list and found a flat list of eighteen rows.
//
// So the tests below are not about how a section looks. They are about the two
// properties that make a partition a partition — TOTAL (no line lost) and
// DISJOINT (no line read twice) — and about the one repartition the founder
// signed off on, line by line, over the real document.
//
// THE FIXTURE is not invented: it is the eighteen lines `plan-import-v1`
// returned on `supabase/tests/keel/sample_coach_plan.txt`, the real four-week
// protocol. If the extraction of that document ever changes shape, this list is
// what has to be re-pulled — never the expectations underneath it.
// ===========================================================================

interface Line extends PlanPartShape {
  title: string;
}

const DOCUMENT: Array<
  [title: string, polarity: string, activity: string, grain: string, slot: string | null]
> = [
  ["Protein at every meal", "do", "nutrition", "day", "any_meal"],
  ["Two servings of non-starchy vegetables every day", "do", "nutrition", "day", null],
  ["Breakfast within 90 minutes of waking", "do", "nutrition", "occasion", "breakfast"],
  ["Drink water through the day", "do", "nutrition", "day", null],
  ["Vitamin D3 5000 IU with breakfast", "do", "supplement", "occasion", "breakfast"],
  ["Iron bisglycinate 25 mg on waking", "do", "supplement", "occasion", "on_waking"],
  ["Magnesium glycinate 400 mg before bed", "do", "supplement", "occasion", "before_bed"],
  ["Omega-3: 2 g of combined EPA+DHA per day", "do", "supplement", "day", null],
  ["Oily fish 3 times a week", "do", "nutrition", "week", null],
  ["Legumes 3 times a week", "do", "nutrition", "week", null],
  ["No alcohol Monday through Friday", "avoid", "nutrition", "day", null],
  ["No added sugar after dinner", "avoid", "nutrition", "day", null],
  ["Zone 2 cardio, 3 sessions a week", "do", "movement", "week", null],
  ["Lights out by 23:00 on weeknights", "do", "sleep", "day", null],
  ["10 minutes of daylight within an hour of waking", "do", "exposure", "occasion", "on_waking"],
  ["Weigh once a week, Saturday morning", "capture", "measurement", "week", null],
  ["Rate your energy 0-10 each evening", "capture", "measurement", "day", null],
  [
    "Photograph your breakfast every day for the first two weeks",
    "capture",
    "measurement",
    "day",
    "breakfast",
  ],
];

const LINES: Line[] = DOCUMENT.map((
  [title, polarity, activity_class, evaluation_grain, slot_key],
) => ({ title, polarity, activity_class, evaluation_grain, slot_key }));

/** The occasions, exactly as migration 20260727090000 seeds them. */
const SLOT_ORDER: readonly SlotOrder[] = [
  { key: "on_waking", sort_order: 10 },
  { key: "breakfast", sort_order: 20 },
  { key: "snack_am", sort_order: 30 },
  { key: "pre_workout", sort_order: 40 },
  { key: "lunch", sort_order: 50 },
  { key: "post_workout", sort_order: 60 },
  { key: "snack_pm", sort_order: 70 },
  { key: "dinner", sort_order: 80 },
  { key: "before_bed", sort_order: 90 },
  { key: "any_meal", sort_order: 100 },
  { key: "any_time", sort_order: 110 },
];

const shapeOf = (l: Line): PlanPartShape => l;
const build = (lines: readonly Line[] = LINES, options = {}) =>
  buildPlanStructure(lines, shapeOf, options);

const titlesOf = (lines: readonly Line[]) => lines.map((l) => l.title);
const partTitles = (part: PlanPart) => titlesOf(sectionFor(build(), part)?.lines ?? []);
const subsectionTitles = (part: PlanPart, key: string) =>
  titlesOf(
    sectionFor(build(), part)?.subsections.find((s) => s.key === key)?.lines ?? [],
  );

// ---------------------------------------------------------------------------
// THE EXACT REPARTITION OF THE REAL DOCUMENT
//
// She wrote six headings; the screen gives her back the same six. Twelve food
// lines under four headings, three actions under three families, three
// observations apart — fifteen things to hold, not eighteen.
// ---------------------------------------------------------------------------

describe("the eighteen lines of the coach's own document", () => {
  it("puts everything the client eats on one side, and only that", () => {
    expect(partTitles("food")).toEqual([
      "Protein at every meal",
      "Two servings of non-starchy vegetables every day",
      "Breakfast within 90 minutes of waking",
      "Drink water through the day",
      "Oily fish 3 times a week",
      "Legumes 3 times a week",
      "No alcohol Monday through Friday",
      "No added sugar after dinner",
      "Vitamin D3 5000 IU with breakfast",
      "Iron bisglycinate 25 mg on waking",
      "Magnesium glycinate 400 mg before bed",
      "Omega-3: 2 g of combined EPA+DHA per day",
    ]);
  });

  it("reads the four food headings in the coach's own words", () => {
    expect(subsectionTitles("food", "every_day")).toEqual([
      "Protein at every meal",
      "Two servings of non-starchy vegetables every day",
      "Breakfast within 90 minutes of waking",
      "Drink water through the day",
    ]);
    expect(subsectionTitles("food", "every_week")).toEqual([
      "Oily fish 3 times a week",
      "Legumes 3 times a week",
    ]);
    expect(subsectionTitles("food", "cutting")).toEqual([
      "No alcohol Monday through Friday",
      "No added sugar after dinner",
    ]);
    expect(subsectionTitles("food", "supplements")).toEqual([
      "Vitamin D3 5000 IU with breakfast",
      "Iron bisglycinate 25 mg on waking",
      "Magnesium glycinate 400 mg before bed",
      "Omega-3: 2 g of combined EPA+DHA per day",
    ]);
  });

  it("leaves exactly the things the client DOES on the other, by family", () => {
    expect(partTitles("actions")).toEqual([
      "Zone 2 cardio, 3 sessions a week",
      "10 minutes of daylight within an hour of waking",
      "Lights out by 23:00 on weeknights",
    ]);
    // Family order, not document order: `FAMILY_ORDER` puts movement before
    // exposure before sleep, and the student's day reads them the same way.
    expect(sectionFor(build(), "actions")?.subsections.map((s) => s.key)).toEqual([
      "movement",
      "exposure",
      "sleep",
    ]);
  });

  it("takes the observations out of both counts", () => {
    // A weigh-in, an energy rating and a breakfast photo are not things to
    // hold. Counting them among the twelve food lines or the three actions
    // would tell the coach their client has 18 promises to keep; they have 15.
    expect(partTitles("observations")).toEqual([
      "Weigh once a week, Saturday morning",
      "Rate your energy 0-10 each evening",
      "Photograph your breakfast every day for the first two weeks",
    ]);
    const structure = build();
    expect(structure.total).toBe(18);
    expect(structure.toHold).toBe(15);
    expect(structure.observed).toBe(3);
  });

  it("reads the parts in one order — observations last, wherever they are read", () => {
    expect(build().sections.map((s) => s.part)).toEqual(["food", "actions", "observations"]);
    // `unsorted` is absent because this document has no untypable line, and an
    // empty part is a part this plan does not have — never an "Actions — 0".
    expect(PLAN_PART_ORDER[PLAN_PART_ORDER.length - 1]).toBe("observations");
  });
});

// ---------------------------------------------------------------------------
// THE TWO PROPERTIES OF A PARTITION
// ---------------------------------------------------------------------------

describe("the partition is total and disjoint", () => {
  it("loses no line: every input is in exactly one section", () => {
    const structure = build();
    const placed = structure.sections.flatMap((s) => s.lines);
    expect(placed).toHaveLength(LINES.length);
    expect(new Set(placed).size).toBe(LINES.length);
    for (const line of LINES) expect(placed).toContain(line);
  });

  it("loses no line inside a part either: sub-sections cover it exactly", () => {
    for (const section of build().sections) {
      if (section.subsections.length === 0) continue;
      const grouped = section.subsections.flatMap((g) => g.lines);
      expect(grouped).toHaveLength(section.count);
      expect(new Set(grouped).size).toBe(section.count);
      // The part's own list IS the sub-sections read in order.
      expect(section.lines).toEqual(grouped);
    }
  });

  it("reads no line twice: the sub-sections of FOOD are mutually exclusive", () => {
    const seen = new Map<Line, string>();
    for (const group of sectionFor(build(), "food")?.subsections ?? []) {
      for (const line of group.lines) {
        expect(seen.get(line)).toBeUndefined();
        seen.set(line, group.key);
      }
    }
    expect(seen.size).toBe(12);
  });

  it("counts what it shows", () => {
    const structure = build();
    const summed = structure.sections.reduce((n, s) => n + s.count, 0);
    expect(summed).toBe(structure.total);
    expect(structure.toHold + structure.observed).toBe(structure.total);
  });

  it("holds on an empty plan rather than inventing empty headings", () => {
    const structure = build([]);
    expect(structure.sections).toEqual([]);
    expect(structure.total).toBe(0);
    expect(structure.toHold).toBe(0);
  });

  it("allocates no line of its own — the caller's objects come back out", () => {
    const structure = build();
    const placed = structure.sections.flatMap((s) => s.lines);
    for (const line of placed) expect(LINES).toContain(line);
  });
});

// ---------------------------------------------------------------------------
// THE REFERENCE READING, PRESERVED TO THE ROW
//
// The import review is the layout the founder signed: it is what a coach reads
// back before publishing, and extracting the module was not allowed to move a
// single row of it. This reproduces the sectioning that screen used to carry
// inline — filter the four parts, then the food headings, then the families —
// and asserts the module hands back the same sequence of headings and the same
// lines under each. If this ever fails, the extraction changed the reference.
// ---------------------------------------------------------------------------

describe("the import review reads exactly as it did before the extraction", () => {
  /** The sectioning PlanImportPage carried inline, verbatim. */
  function legacyLayout(lines: readonly Line[]): Array<[string, string[]]> {
    const inPart = (part: PlanPart) => lines.filter((l) => planPartOf(l) === part);
    const out: Array<[string, string[]]> = [];
    for (const section of FOOD_SECTION_ORDER) {
      const group = inPart("food").filter((l) => foodSectionOf(l) === section);
      if (group.length > 0) out.push([`food/${section}`, titlesOf(group)]);
    }
    for (const family of ACTIVITY_CLASS_ORDER) {
      const group = inPart("actions").filter((l) => l.activity_class === family);
      if (group.length > 0) out.push([`actions/${family}`, titlesOf(group)]);
    }
    const unsorted = inPart("unsorted");
    if (unsorted.length > 0) out.push(["unsorted", titlesOf(unsorted)]);
    const observations = inPart("observations");
    if (observations.length > 0) out.push(["observations", titlesOf(observations)]);
    return out;
  }

  const moduleLayout = (lines: readonly Line[]): Array<[string, string[]]> =>
    build(lines).sections.flatMap((section) =>
      section.subsections.length > 0
        ? section.subsections.map((g): [string, string[]] => [
          `${section.part}/${g.key}`,
          titlesOf(g.lines),
        ])
        : [[section.part, titlesOf(section.lines)] as [string, string[]]]
    );

  it("gives the same headings, in the same order, holding the same rows", () => {
    expect(moduleLayout(LINES)).toEqual(legacyLayout(LINES));
  });

  it("still matches once a line the parser could not type is in the queue", () => {
    const withUnknown: Line[] = [
      ...LINES,
      {
        title: "Herbal tea in the evening",
        polarity: "do",
        activity_class: "hydration",
        evaluation_grain: "day",
        slot_key: null,
      },
    ];
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(moduleLayout(withUnknown)).toEqual(legacyLayout(withUnknown));
    } finally {
      errors.mockRestore();
      resetUnknownFamilyReports();
    }
  });
});

// ---------------------------------------------------------------------------
// THE RULES BEHIND THE PARTITION
// ---------------------------------------------------------------------------

describe("planPartOf — the arbitrations, stated as tests", () => {
  it("classifies a supplement as food, whichever way the extractor typed it", () => {
    // The line that settles the arbitration. The coach wrote "2 g of EPA+DHA —
    // capsule or oily fish, I do not mind"; the live extraction typed it
    // `supplement`, the reference fixture types it `nutrition`. If supplements
    // were actions, this ONE line would jump from one half of the screen to
    // the other depending on which way the model guessed.
    const asSupplement = { polarity: "do", activity_class: "supplement", evaluation_grain: "day" };
    const asNutrition = { ...asSupplement, activity_class: "nutrition" };
    expect(planPartOf(asSupplement)).toBe("food");
    expect(planPartOf(asNutrition)).toBe("food");
  });

  it("reads a capture line as an observation whatever its family", () => {
    // A photo of a plate is `nutrition` and still not a thing to hold.
    expect(
      planPartOf({ polarity: "capture", activity_class: "nutrition", evaluation_grain: "day" }),
    ).toBe("observations");
  });

  it("reads a supplement being cut as a cut, not as a supplement to take", () => {
    expect(
      foodSectionOf({ polarity: "avoid", activity_class: "supplement", evaluation_grain: "day" }),
    ).toBe("cutting");
  });

  it("covers every food line with exactly one heading, by construction", () => {
    const foodLines = LINES.filter((l) => planPartOf(l) === "food");
    const grouped = FOOD_SECTION_ORDER.flatMap((s) =>
      foodLines.filter((l) => foodSectionOf(l) === s)
    );
    expect(grouped).toHaveLength(foodLines.length);
    expect(new Set(grouped).size).toBe(foodLines.length);
  });
});

// ---------------------------------------------------------------------------
// R7 — A FAMILY WE CANNOT PLACE IS LOUD, ONCE, AND NEVER FILED UNDER "OTHER"
// ---------------------------------------------------------------------------

describe("an untypable family", () => {
  let errors: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetUnknownFamilyReports();
    errors = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    errors.mockRestore();
    resetUnknownFamilyReports();
  });

  it("is shown apart instead of being filed under a heading the coach never wrote", () => {
    expect(planPartOf({ polarity: "do", activity_class: "", evaluation_grain: "day" }))
      .toBe("unsorted");
    expect(planPartOf({ polarity: "do", activity_class: "hydration", evaluation_grain: "day" }))
      .toBe("unsorted");
    // The trap this guards: "other" is a REAL family of the vocabulary, so a
    // silent fallback into it would look exactly like a coach's own choice.
    expect(planPartOf({ polarity: "do", activity_class: "other", evaluation_grain: "day" }))
      .toBe("actions");
  });

  it("says so once per family per session, not once per render", () => {
    const line = { polarity: "do", activity_class: "hydration", evaluation_grain: "day" };
    for (let i = 0; i < 50; i++) planPartOf(line);
    expect(errors).toHaveBeenCalledTimes(1);
    expect(String(errors.mock.calls[0][0])).toContain("hydration");

    planPartOf({ ...line, activity_class: "mobility" });
    expect(errors).toHaveBeenCalledTimes(2);
  });

  it("keeps its own section, above the observations and inside the count", () => {
    const withUnknown: Line[] = [
      ...LINES,
      {
        title: "Herbal tea in the evening",
        polarity: "do",
        activity_class: "hydration",
        evaluation_grain: "day",
        slot_key: null,
      },
    ];
    const structure = build(withUnknown);
    expect(structure.sections.map((s) => s.part)).toEqual([
      "food",
      "actions",
      "unsorted",
      "observations",
    ]);
    // A line the coach must FIX is a thing to hold until they say otherwise —
    // and it has no sub-heading, because inventing one is what `planPartOf`
    // refused to do one step earlier.
    expect(structure.toHold).toBe(16);
    expect(sectionFor(structure, "unsorted")?.subsections).toEqual([]);
    expect(titlesOf(sectionFor(structure, "unsorted")?.lines ?? []))
      .toEqual(["Herbal tea in the evening"]);
  });
});

// ---------------------------------------------------------------------------
// THE TWO READERS — same sections, one ordering argument
// ---------------------------------------------------------------------------

describe("the coach's reading and the student's are the same structure", () => {
  it("gives the two voices the same partition and different words", () => {
    const coach = build(LINES, { voice: "coach" });
    const student = build(LINES, { voice: "student" });
    expect(student.sections.map((s) => s.part)).toEqual(coach.sections.map((s) => s.part));
    for (let i = 0; i < coach.sections.length; i++) {
      expect(student.sections[i].lines).toEqual(coach.sections[i].lines);
      expect(student.sections[i].subsections.map((g) => g.key))
        .toEqual(coach.sections[i].subsections.map((g) => g.key));
    }
    expect(sectionFor(coach, "food")?.label).toBe("Food");
    expect(sectionFor(student, "food")?.label).toBe("What I eat");
  });

  it("keeps the caller's order under `as_given` — the review's sort survives", () => {
    // The import screen sorts what still needs a decision to the top; the
    // sectioning must not undo that inside a heading.
    const reversed = [...LINES].reverse();
    expect(titlesOf(sectionFor(build(reversed), "food")?.subsections[0]?.lines ?? []))
      .toEqual([
        "Drink water through the day",
        "Breakfast within 90 minutes of waking",
        "Two servings of non-starchy vegetables every day",
        "Protein at every meal",
      ]);
  });

  it("reads the day in the order of the day under `occasion`", () => {
    const structure = build(LINES, { order: "occasion", slotOrder: SLOT_ORDER });
    // Supplements, read forward through the day: on waking, breakfast, before
    // bed — then the one that names no moment.
    expect(titlesOf(
      sectionFor(structure, "food")?.subsections.find((s) => s.key === "supplements")?.lines ?? [],
    )).toEqual([
      "Iron bisglycinate 25 mg on waking",
      "Vitamin D3 5000 IU with breakfast",
      "Magnesium glycinate 400 mg before bed",
      "Omega-3: 2 g of combined EPA+DHA per day",
    ]);
    // Same lines, same headings, same counts as the coach's reading — only the
    // order inside a heading moved.
    expect(structure.sections.map((s) => s.part)).toEqual(build().sections.map((s) => s.part));
    expect(structure.toHold).toBe(15);
    for (const section of structure.sections) {
      const coachSection = sectionFor(build(), section.part);
      expect(new Set(section.lines)).toEqual(new Set(coachSection?.lines));
    }
  });

  it("refuses the day's order without the day's vocabulary (R7)", () => {
    expect(() => build(LINES, { order: "occasion" })).toThrow(/slot vocabulary/);
  });

  it("refuses to place a line on an occasion the vocabulary does not know (R7)", () => {
    const invented: Line[] = [{
      title: "Second dinner",
      polarity: "do",
      activity_class: "nutrition",
      evaluation_grain: "day",
      slot_key: "supper",
    }];
    expect(() => build(invented, { order: "occasion", slotOrder: SLOT_ORDER }))
      .toThrow(/supper/);
  });
});

// ---------------------------------------------------------------------------
// ONE VOCABULARY, ONE ORDER
// ---------------------------------------------------------------------------

describe("the families are ordered once for the whole app", () => {
  it("matches the order the student's day tallies them in", () => {
    expect(FAMILY_ORDER).toEqual(ACTIVITY_CLASS_ORDER);
  });

  it("has a place for every family the partition accepts", () => {
    for (const family of FAMILY_ORDER) {
      const part = planPartOf({
        polarity: "do",
        activity_class: family,
        evaluation_grain: "day",
      });
      expect(part === "food" || part === "actions").toBe(true);
    }
  });
});
