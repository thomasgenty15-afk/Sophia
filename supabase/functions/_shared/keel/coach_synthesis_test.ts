// PIVOT NUTRITION §1.4 — coach_synthesis.ts.
//
// The tests that carry the product claim, named for it:
//   * "a restriction signal is NEVER dropped by the 3-student cap"
//     -- a cap that can hide a safety finding is a cap that hides the only item
//        on the list that can hurt someone.
//   * "below the coverage gate, no percentage is produced anywhere"
//     -- CONTRACT display gate. A fake average is how a coach stops trusting
//        every number on the page.
//   * "the same week produces the same synthesis, twice"
//     -- the artefact is evidence; evidence that reshuffles is not evidence.

import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";

import {
  buildCoachSynthesis,
  buildStudentLine,
  classifyContact,
  classifyRisk,
  CONTACT_SILENT_AFTER_HOURS,
  CONTACT_SLIPPING_AFTER_HOURS,
  flaggedStudentsPayload,
  metricsPayload,
  renderSynthesisText,
  type StudentWeekInput,
  TO_CATCH_UP_CAP,
} from "./coach_synthesis.ts";
import { computeWeekAdherence, type WeekAdherenceInput } from "./adherence.ts";
import { REENGAGE_AFTER_HOURS } from "./reengagement.ts";

const NOW = new Date("2026-08-03T09:00:00.000Z");
const WEEK = [
  "2026-07-27",
  "2026-07-28",
  "2026-07-29",
  "2026-07-30",
  "2026-07-31",
  "2026-08-01",
  "2026-08-02",
];

function hoursAgo(h: number): string {
  return new Date(NOW.getTime() - h * 3600_000).toISOString();
}

/** A week of `met` on one core line, logged on `loggedDays` days. */
function adherenceInput(
  loggedDays: number,
  status: "met" | "missed" | "partial" = "met",
): WeekAdherenceInput {
  const days = WEEK.slice(0, loggedDays);
  return {
    weekDates: WEEK,
    evaluations: days.map((localDate) => ({
      commitmentId: "c1",
      localDate,
      grain: "day" as const,
      status,
      priority: "core" as const,
      countsTowardAdherence: true,
      expectedEvaluationsPerDay: 1,
    })),
    // The coverage number: >= LOGGED_DAY_MIN_EVENTS (2) makes a day "logged".
    eventCountsByDate: Object.fromEntries(days.map((d) => [d, 2])),
  };
}

function student(over: Partial<StudentWeekInput> = {}): StudentWeekInput {
  return {
    studentUserId: "s1",
    displayName: "Julie",
    lastInboundAt: hoursAgo(3),
    adherence: adherenceInput(7),
    ...over,
  };
}

// ---------------------------------------------------------------------------
// AXIS 1 — contact
// ---------------------------------------------------------------------------

Deno.test("contact: the three states sit on the 48h / 120h thresholds", () => {
  assertEquals(classifyContact(hoursAgo(2), NOW).state, "responsive");
  assertEquals(classifyContact(hoursAgo(47), NOW).state, "responsive");
  // 48h is where the re-engagement loop fires (§1.3), so it must OPEN slipping.
  assertEquals(classifyContact(hoursAgo(CONTACT_SLIPPING_AFTER_HOURS), NOW).state, "slipping");
  assertEquals(classifyContact(hoursAgo(119), NOW).state, "slipping");
  assertEquals(classifyContact(hoursAgo(CONTACT_SILENT_AFTER_HOURS), NOW).state, "silent");
});

Deno.test("contact: only INBOUND counts — three unanswered nudges is still silent", () => {
  // The failure this pins: counting outbound would mark a student who receives
  // relances and answers none as "in touch", hiding the exact case §1.3 exists
  // for. The signature makes it impossible: there is nowhere to pass outbound.
  const line = buildStudentLine(student({ lastInboundAt: hoursAgo(200) }), NOW);
  assertEquals(line.contact, "silent");
});

Deno.test("contact: never having spoken is silent with null hours, not a fake number", () => {
  const c = classifyContact(null, NOW);
  assertEquals(c.state, "silent");
  assertEquals(c.hoursSince, null);
  // And an unparseable timestamp degrades the same way rather than to NaN.
  assertEquals(classifyContact("not-a-date", NOW).state, "silent");
});

// ---------------------------------------------------------------------------
// AXIS 2 — risk, and the order that IS the rule
// ---------------------------------------------------------------------------

Deno.test("risk: a restriction signal OVERRIDES a perfect week", () => {
  // The dangerous case: 100% adherence, in touch daily, and restricting. If
  // adherence were consulted first this student reads as the model student.
  const band = classifyRisk({
    contact: "responsive",
    adherence: computeWeekAdherence(adherenceInput(7)),
    restrictionFlag: true,
  });
  assertEquals(band, "restriction_flag");
});

Deno.test("risk: below the coverage gate the band is disengaged, not invented", () => {
  // There is no adherence number under the gate, so no adherence-derived band
  // can honestly be computed.
  const band = classifyRisk({
    contact: "responsive",
    adherence: computeWeekAdherence(adherenceInput(2)),
  });
  assertEquals(band, "disengaged");
});

Deno.test("risk: silent beats a good adherence number", () => {
  assertEquals(
    classifyRisk({ contact: "silent", adherence: computeWeekAdherence(adherenceInput(7)) }),
    "disengaged",
  );
});

Deno.test("risk: following the plan while the outcome moves the wrong way", () => {
  // The case a coach most wants surfaced: it means HIS plan needs changing.
  assertEquals(
    classifyRisk({
      contact: "responsive",
      adherence: computeWeekAdherence(adherenceInput(7)),
      outcomeMismatch: true,
    }),
    "outcome_mismatch",
  );
});

Deno.test("risk: a good week with full contact is on_track", () => {
  assertEquals(
    classifyRisk({ contact: "responsive", adherence: computeWeekAdherence(adherenceInput(7)) }),
    "on_track",
  );
});

Deno.test("risk: a missed week that IS logged is at_risk, not disengaged", () => {
  // Honest logging must never score worse than hiding: this student reported
  // every day and failed. That is an adherence problem, not disengagement.
  const band = classifyRisk({
    contact: "responsive",
    adherence: computeWeekAdherence(adherenceInput(7, "missed")),
  });
  assertEquals(band, "at_risk");
});

// ---------------------------------------------------------------------------
// THE CAP, and its exemption
// ---------------------------------------------------------------------------

Deno.test("a restriction signal is NEVER dropped by the 3-student cap", () => {
  // Four adherence problems sort above the restriction signal by construction
  // here (they are listed first and the restricting student is last). Without
  // the exemption, the safety finding falls off the end of the list.
  const students: StudentWeekInput[] = [
    student({ studentUserId: "a", lastInboundAt: hoursAgo(300) }),
    student({ studentUserId: "b", lastInboundAt: hoursAgo(280) }),
    student({ studentUserId: "c", lastInboundAt: hoursAgo(260) }),
    student({ studentUserId: "d", lastInboundAt: hoursAgo(240) }),
    student({
      studentUserId: "e",
      displayName: "Nadia",
      lastInboundAt: hoursAgo(1),
      adherence: adherenceInput(7),
      restrictionFlag: true,
    }),
  ];
  const synthesis = buildCoachSynthesis(students, NOW);
  const ids = synthesis.flagged.map((f) => f.studentUserId);
  assert(ids.includes("e"), `restriction signal dropped: ${ids.join(",")}`);
  assertEquals(synthesis.flagged[0].studentUserId, "e", "and it comes first");
});

Deno.test("the cap applies to everything else, and the truncation is stated", () => {
  const students = ["a", "b", "c", "d", "e"].map((id) =>
    student({ studentUserId: id, lastInboundAt: hoursAgo(300) })
  );
  const synthesis = buildCoachSynthesis(students, NOW);
  assertEquals(synthesis.flagged.length, TO_CATCH_UP_CAP);
  // A silent truncation reads as "this is everyone". The payload must not let
  // a reader believe that.
  const m = metricsPayload(synthesis);
  assertEquals(m.flagged_count, 3);
  assertEquals(m.flagged_total_before_cap, 5);
});

Deno.test("a healthy cohort flags nobody, and says so", () => {
  // DISARM CONDITION (doctrine P9): the belt states when it does NOT fire.
  const synthesis = buildCoachSynthesis(
    [student({ studentUserId: "a" }), student({ studentUserId: "b" })],
    NOW,
  );
  assertEquals(synthesis.flagged, []);
  const text = renderSynthesisText(synthesis, { locale: "en" });
  assert(text.includes("Nobody needs catching up"));
});

// ---------------------------------------------------------------------------
// THE NUMBERS — computed, gated, never invented
// ---------------------------------------------------------------------------

Deno.test("below the coverage gate, no percentage is produced anywhere", () => {
  const synthesis = buildCoachSynthesis(
    [student({ studentUserId: "a", adherence: adherenceInput(2) })],
    NOW,
  );
  assertEquals(synthesis.metrics.meanCoreAdherencePct, null);
  assertEquals(synthesis.metrics.withAdherence, 0);

  const text = renderSynthesisText(synthesis, { locale: "en" });
  assert(!/\d+%/.test(text), `a percentage leaked: ${text}`);
  assert(text.includes("No adherence figure this week"));

  // And the row explains WHY it is missing: gated and buggy look identical
  // otherwise.
  const payload = flaggedStudentsPayload(synthesis);
  assertEquals((payload[0].evidence as Record<string, unknown>).adherence_gated, true);
  assertEquals((payload[0].evidence as Record<string, unknown>).core_adherence_pct, null);
});

Deno.test("the average is taken over students who HAVE a number, not over all", () => {
  // Counting a gated student as 0% would invent a failure out of silence --
  // the silence-to-`missed` error the contract refuses everywhere else.
  const synthesis = buildCoachSynthesis(
    [
      student({ studentUserId: "a", adherence: adherenceInput(7) }), // 100%
      student({ studentUserId: "b", adherence: adherenceInput(2) }), // gated
    ],
    NOW,
  );
  assertEquals(synthesis.metrics.withAdherence, 1);
  assertEquals(synthesis.metrics.meanCoreAdherencePct, 100);
});

Deno.test("the restriction line carries NO adherence figure and NO nudge", () => {
  // §3.4 garde-fou TCA: adherence pressure stops. A line reading "Nadia: 40% on
  // core lines, restrictive signals" would be the pressure, in the coach's ear.
  const synthesis = buildCoachSynthesis(
    [student({ studentUserId: "e", displayName: "Nadia", restrictionFlag: true })],
    NOW,
  );
  const text = renderSynthesisText(synthesis, { locale: "en" });
  const line = text.split("\n").find((l) => l.startsWith("- Nadia")) ?? "";
  assert(line.includes("restrictive signals"), line);
  assert(!/\d+%/.test(line), `an adherence figure leaked into a safety line: ${line}`);
  assert(line.includes("paused adherence prompts"), line);
});

Deno.test("the same week produces the same synthesis, twice", () => {
  // Ties must never be broken by array order: a synthesis that reshuffles
  // between two runs is not evidence of anything.
  const students = [
    student({ studentUserId: "b", lastInboundAt: hoursAgo(300) }),
    student({ studentUserId: "a", lastInboundAt: hoursAgo(300) }),
    student({ studentUserId: "c", lastInboundAt: hoursAgo(300) }),
  ];
  const first = buildCoachSynthesis(students, NOW);
  const second = buildCoachSynthesis([...students].reverse(), NOW);
  assertEquals(
    first.flagged.map((f) => f.studentUserId),
    second.flagged.map((f) => f.studentUserId),
  );
  assertEquals(
    renderSynthesisText(first, { locale: "en" }),
    renderSynthesisText(second, { locale: "en" }),
  );
});

Deno.test("the header counts every contact state, and they sum to the cohort", () => {
  const synthesis = buildCoachSynthesis(
    [
      student({ studentUserId: "a", lastInboundAt: hoursAgo(1) }),
      student({ studentUserId: "b", lastInboundAt: hoursAgo(60) }),
      student({ studentUserId: "c", lastInboundAt: hoursAgo(300) }),
      student({ studentUserId: "d", lastInboundAt: null }),
    ],
    NOW,
  );
  const m = synthesis.metrics;
  assertEquals([m.responsive, m.slipping, m.silent], [1, 1, 2]);
  assertEquals(m.responsive + m.slipping + m.silent, m.studentCount);
  assert(renderSynthesisText(synthesis, { locale: "en" }).includes("4 students this week"));
});

Deno.test("an unsupported render locale throws (R7)", () => {
  const synthesis = buildCoachSynthesis([student()], NOW);
  assertThrows(() => renderSynthesisText(synthesis, { locale: "fr" }));
});

Deno.test("the payload keys are ASCII snake_case tokens (R1)", () => {
  const synthesis = buildCoachSynthesis(
    [student({ studentUserId: "a", lastInboundAt: hoursAgo(300) })],
    NOW,
  );
  const payload = flaggedStudentsPayload(synthesis);
  assertEquals(payload[0].reason_code, "silent_5d");
  assertEquals(payload[0].contact_state, "silent");
  assertEquals(payload[0].risk_band, "disengaged");
  for (const key of Object.keys(payload[0])) {
    assert(/^[a-z0-9_]+$/.test(key), `non-token key: ${key}`);
  }
});

Deno.test("risk_band values stay inside the SQL CHECK of weekly_reviews", async () => {
  // A seventh band invented here would fail the CHECK at write time, in
  // production, on a Monday morning.
  const migration = await Deno.readTextFile(
    new URL(
      "../../../migrations/20260727090000_keel_p0_commitments.sql",
      import.meta.url,
    ),
  );
  const block = migration.slice(migration.indexOf("risk_band text check"));
  for (
    const band of [
      "on_track",
      "watch",
      "at_risk",
      "disengaged",
      "outcome_mismatch",
      "restriction_flag",
    ]
  ) {
    assert(block.includes(`'${band}'`), `${band} is not in the SQL CHECK`);
  }
});

Deno.test("the plate readout is emitted, and only when plates were seen", () => {
  // The payoff of the kcal arbitration: having refused the calorie figure, the
  // synthesis owes the coach an answer to the question it stood in for.
  const withPlates = buildCoachSynthesis(
    [
      student({
        studentUserId: "a",
        portionBands: ["small", "moderate", "moderate", "large", null, "unclear"],
      }),
    ],
    NOW,
  );
  assertEquals(withPlates.metrics.portions.total, 5);
  assertEquals(withPlates.metrics.portions.moderate, 2);
  const text = renderSynthesisText(withPlates, { locale: "en" });
  assert(text.includes("5 plates seen: 1 small, 2 moderate, 1 large, 1 unclear."), text);
  // And still not one calorie anywhere.
  assert(!/kcal|calorie/i.test(text));

  // No plates -> the line is absent. "0 plates: 0 small" is noise dressed as data.
  const noPlates = buildCoachSynthesis([student({ studentUserId: "b" })], NOW);
  assertEquals(noPlates.metrics.portions.total, 0);
  assert(!renderSynthesisText(noPlates, { locale: "en" }).includes("plates seen"));
});

Deno.test("the two re-engagement thresholds cannot silently drift apart", () => {
  // §7.3-(6). Two modules now encode "when has a student gone quiet":
  // `reengagement.ts` decides whether to send, `coach_synthesis.ts` decides
  // what the coach's cohort screen shows. They are DIFFERENT questions and are
  // allowed to differ -- but not by accident. `slipping` must open no later
  // than the nudge fires, or the coach reads "in touch" about a student the
  // system has already decided to chase.
  assert(
    CONTACT_SLIPPING_AFTER_HOURS <= REENGAGE_AFTER_HOURS,
    `slipping opens at ${CONTACT_SLIPPING_AFTER_HOURS}h but the nudge fires at ` +
      `${REENGAGE_AFTER_HOURS}h: the coach would see "in touch" for a student ` +
      `already being chased`,
  );
  // And `silent` must sit strictly beyond the nudge, or the cohort screen calls
  // someone silent before anyone has tried to reach them.
  assert(CONTACT_SILENT_AFTER_HOURS > REENGAGE_AFTER_HOURS);
});
