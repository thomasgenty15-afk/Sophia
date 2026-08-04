// Snapshot tests for the KEEL render layer (deterministic, zero I/O — see render.ts).
import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  medicationClassLabel,
  renderCoachSafetyNote,
  renderSlotReminder,
  renderSundayDigest,
  slotHeading,
  slotLabel,
} from "./render.ts";

Deno.test("renderSundayDigest — full protocol, three priorities (snapshot)", () => {
  const text = renderSundayDigest({
    commitments: [
      {
        title: "Vitamin D3 5000 IU",
        scheduledDays: null,
        requiredDaysPerWeek: 7,
        slotKey: "breakfast",
        priority: "core",
      },
      {
        title: "Fatty fish 3x/week",
        scheduledDays: null,
        requiredDaysPerWeek: 3,
        slotKey: null,
        priority: "secondary",
      },
      {
        title: "No alcohol on weekdays",
        scheduledDays: ["mon", "tue", "wed", "thu", "fri"],
        requiredDaysPerWeek: null,
        slotKey: null,
        priority: "secondary",
      },
      {
        title: "Berries 1 serving/day",
        scheduledDays: null,
        requiredDaysPerWeek: null,
        slotKey: null,
        priority: "optional",
      },
    ],
    weekStartDate: "2026-07-27",
    studentFirstName: "Thomas",
    locale: "en",
  });

  assertEquals(
    text,
    [
      "Hi Thomas — here is what your plan holds for the week of Mon 27 Jul.",
      "",
      "Core:",
      "- Vitamin D3 5000 IU (at breakfast, daily)",
      "",
      "Also on the plan:",
      "- Fatty fish 3x/week (3x this week)",
      "- No alcohol on weekdays (Mon, Tue, Wed, Thu, Fri)",
      "",
      "Optional:",
      "- Berries 1 serving/day",
      "",
      "This is just a heads-up — nothing to confirm or validate.",
      "Any days you already know will be off-plan? Just tell me.",
    ].join("\n"),
  );
});

Deno.test("renderSundayDigest — single core commitment (snapshot)", () => {
  const text = renderSundayDigest({
    commitments: [
      {
        title: "Iron bisglycinate 25 mg fasted",
        scheduledDays: null,
        requiredDaysPerWeek: 7,
        slotKey: "on_waking",
        priority: "core",
      },
    ],
    weekStartDate: "2026-08-03",
    studentFirstName: "Rose",
    locale: "en",
  });

  assertEquals(
    text,
    [
      "Hi Rose — here is what your plan holds for the week of Mon 3 Aug.",
      "",
      "Core:",
      "- Iron bisglycinate 25 mg fasted (on waking, daily)",
      "",
      "This is just a heads-up — nothing to confirm or validate.",
      "Any days you already know will be off-plan? Just tell me.",
    ].join("\n"),
  );
});

Deno.test("renderSundayDigest — R7: unknown tokens throw, never fall back", () => {
  const base = {
    title: "X",
    scheduledDays: null,
    requiredDaysPerWeek: null,
    slotKey: null,
    priority: "core",
  };
  assertThrows(
    () =>
      renderSundayDigest({
        commitments: [{ ...base, slotKey: "brunch" }],
        weekStartDate: "2026-07-27",
        studentFirstName: "T",
        locale: "en",
      }),
    Error,
    'unknown slot token "brunch"',
  );
  assertThrows(
    () =>
      renderSundayDigest({
        commitments: [{ ...base, scheduledDays: ["dimanche"] }],
        weekStartDate: "2026-07-27",
        studentFirstName: "T",
        locale: "en",
      }),
    Error,
    'unknown day token "dimanche"',
  );
  assertThrows(
    () =>
      renderSundayDigest({
        commitments: [{ ...base, priority: "vital" }],
        weekStartDate: "2026-07-27",
        studentFirstName: "T",
        locale: "en",
      }),
    Error,
    'unknown priority token "vital"',
  );
  assertThrows(
    () =>
      renderSundayDigest({
        commitments: [base],
        weekStartDate: "27/07/2026",
        studentFirstName: "T",
        locale: "en",
      }),
    Error,
    "not YYYY-MM-DD",
  );
  assertThrows(
    () =>
      renderSundayDigest({
        commitments: [base],
        weekStartDate: "2026-07-27",
        studentFirstName: "T",
        locale: "fr",
      }),
    Error,
    'unsupported render locale "fr"',
  );
});

// ---------------------------------------------------------------------------
// Coach safety note (2026-07-28) — what used to be the provenance degradation.
//
// These tests are the OLD degradation tests, turned around. They used to prove
// that the dose was stripped out of what the student reads; they now prove that
// this module cannot strip anything, and that what is left is a note a
// professional reads and nobody has to answer.
// ---------------------------------------------------------------------------

Deno.test("renderCoachSafetyNote — above the UL states the fact, and only the fact", () => {
  const note = renderCoachSafetyNote({
    kind: "above_upper_limit",
    ulLabel: "4000 IU/day",
  });
  assertEquals(note, "Above the NIH upper limit (4000 IU/day).");

  // The gate is gone: nothing here asks the coach to certify, authorize or
  // sign anything, and nothing announces a consequence for the student.
  for (
    const gone of [
      "clinician",
      "sign-off",
      "signoff",
      "food-first",
      "without the dose",
      "must",
      "needs",
      "cannot",
      "before it can be published",
    ]
  ) {
    assertEquals(
      note.toLowerCase().includes(gone),
      false,
      `"${gone}" survived into the coach note: ${note}`,
    );
  }
});

Deno.test("renderCoachSafetyNote — an unusable comparison is named, never read as a clearance", () => {
  const inIU = renderCoachSafetyNote({
    kind: "upper_limit_not_comparable",
    ulLabel: "40 mg/day",
    targetUnit: "IU",
  });
  assertEquals(
    inIU,
    "Upper limit on record: 40 mg/day. This target is in IU, which is not comparable, " +
      "so no comparison was made.",
  );

  const noUnit = renderCoachSafetyNote({
    kind: "upper_limit_not_comparable",
    ulLabel: "40 mg/day",
    targetUnit: null,
  });
  assertEquals(
    noUnit,
    "Upper limit on record: 40 mg/day. This line carries no unit, so no comparison was made.",
  );
});

Deno.test("renderCoachSafetyNote — the watchlist note is the seed's own prose", () => {
  const note = renderCoachSafetyNote({
    kind: "interaction_watchlist",
    medicationClass: "levothyroxine",
    note: "Iron chelates levothyroxine; separate intake by at least 4 hours.",
  });
  assertEquals(
    note,
    "Interaction watchlist: Levothyroxine — Iron chelates levothyroxine; " +
      "separate intake by at least 4 hours.",
  );
});

Deno.test("medicationClassLabel — no storage slug ever reaches the coach", () => {
  // The seeded classes carry a curated label...
  assertEquals(medicationClassLabel("oral_contraceptives"), "Oral contraceptives");
  assertEquals(medicationClassLabel("ssri"), "SSRIs");
  // ...and a class seeded later still arrives readable rather than as an
  // identifier: this column is free text, and a throw here would take down the
  // coach's screen over a data row.
  assertEquals(medicationClassLabel("beta_blockers"), "Beta blockers");

  const rendered = renderCoachSafetyNote({
    kind: "interaction_watchlist",
    medicationClass: "oral_contraceptives",
    note: "Reduces contraceptive efficacy.",
  });
  assertEquals(rendered.includes("oral_contraceptives"), false);

  // R7 shape check survives: something that is not a slug at all is a data bug.
  assertThrows(
    () => medicationClassLabel("Oral Contraceptives"),
    Error,
    "not an ASCII snake_case slug",
  );
});

Deno.test("the render layer can no longer produce a substitute for a prescription", async () => {
  // STRUCTURAL, not a wording check. The degradation was dangerous because a
  // second student-facing text existed AT ALL; the proof it is gone is that no
  // export of this module can emit one, and that the survivor returns a plain
  // string — there is no `studentText` field left for a caller to reach for,
  // and no boolean for a caller to branch a refusal on.
  const mod = await import("./render.ts");
  assertEquals("renderProvenanceDegradation" in mod, false);
  assertEquals(
    typeof mod.renderCoachSafetyNote({ kind: "above_upper_limit", ulLabel: "4000 IU/day" }),
    "string",
  );
});

Deno.test("the prescription reaches the student with its dose, verbatim", () => {
  // THE FLIPPED TEST. What used to be asserted here is that a 5000 IU line
  // above the 4000 IU UL reached the student as "go food-first", dose removed.
  // The student surface is `renderSlotReminder`, and what it must now prove is
  // the opposite: the coach's own sentence travels whole.
  const text = renderSlotReminder({
    slotKey: "breakfast",
    commitments: [{
      title: "Vitamin D3 5000 IU",
      studentInstruction: "Take 5000 IU of D3 with your breakfast fat.",
    }],
    locale: "en",
  });
  assertEquals(
    text,
    "Breakfast — on your plan today:\n" +
      "- Vitamin D3 5000 IU — Take 5000 IU of D3 with your breakfast fat.\n" +
      "\n" +
      "Tell me here whenever you get to it.",
  );
  assertEquals(text.includes("5000 IU"), true);
  assertEquals(text.includes("food-first"), false);
  assertEquals(text.includes("clinician"), false);
});

// ---------------------------------------------------------------------------
// W4.6 — slot reminder
// ---------------------------------------------------------------------------

Deno.test("renderSlotReminder — one message for the whole slot (snapshot)", () => {
  const text = renderSlotReminder({
    slotKey: "breakfast",
    locale: "en",
    commitments: [
      {
        title: "Vitamin D3 5000 IU",
        studentInstruction: "With your first meal, alongside a fat source.",
      },
      { title: "Protocol breakfast (eggs+oats+berries)", studentInstruction: null },
    ],
  });
  assertEquals(
    text,
    [
      "Breakfast — on your plan today:",
      "- Vitamin D3 5000 IU — With your first meal, alongside a fat source.",
      "- Protocol breakfast (eggs+oats+berries)",
      "",
      "Tell me here whenever you get to it.",
    ].join("\n"),
  );
});

Deno.test("renderSlotReminder — no score, no percentage, no pressure verb", () => {
  const text = renderSlotReminder({
    slotKey: "lunch",
    locale: "en",
    commitments: [{ title: "Cruciferous veg 2 servings", studentInstruction: null }],
  });
  assertEquals(/\d+\s?%/.test(text), false);
  assertEquals(/\b(streak|adherence|missed|behind|must|should)\b/i.test(text), false);
});

Deno.test("renderSlotReminder — R7: unknown slot and empty list both throw", () => {
  assertThrows(
    () =>
      renderSlotReminder({
        slotKey: "brunch",
        locale: "en",
        commitments: [{ title: "x", studentInstruction: null }],
      }),
    Error,
    'unknown slot token "brunch"',
  );
  assertThrows(
    () => renderSlotReminder({ slotKey: "lunch", locale: "en", commitments: [] }),
    Error,
    "zero commitments",
  );
  assertThrows(
    () =>
      renderSlotReminder({
        slotKey: "lunch",
        locale: "fr",
        commitments: [{ title: "x", studentInstruction: null }],
      }),
    Error,
    "unsupported render locale",
  );
});

Deno.test("slotHeading covers every slot label key (no vocabulary drift)", () => {
  for (
    const slot of [
      "on_waking",
      "breakfast",
      "snack_am",
      "pre_workout",
      "lunch",
      "post_workout",
      "snack_pm",
      "dinner",
      "before_bed",
      "any_meal",
      "any_time",
    ]
  ) {
    assertEquals(typeof slotLabel(slot), "string");
    assertEquals(typeof slotHeading(slot), "string");
  }
  assertThrows(() => slotHeading("brunch"), Error, "unknown slot token");
});
