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
  summarizeLivability,
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

Deno.test("an unsupported render locale throws (R7) — and `fr` is now SUPPORTED", () => {
  // ── CE TEST PINNAIT LA MOITIÉ VISIBLE DU DÉFAUT ───────────────────────────
  // Il vérifiait que `fr` JETTE. C'était exact, et c'était le bug: le seul
  // appelant de production passait `locale: "en"` EN DUR, donc le corps de
  // `/coach/weekly` ne pouvait être qu'anglais et cette garde était
  // inatteignable. Ce qui est protégé n'a pas changé — une langue NON LIVRÉE
  // jette encore, au lieu de rendre une synthèse à moitié traduite.
  const synthesis = buildCoachSynthesis([student()], NOW);
  assertThrows(() => renderSynthesisText(synthesis, { locale: "de-DE" }));
  assertThrows(() => renderSynthesisText(synthesis, { locale: "es" }));
  // `fr` rend, désormais, et rend quelque chose.
  assert(renderSynthesisText(synthesis, { locale: "fr" }).trim().length > 0);
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

Deno.test("a student logging into a VOID is not accused of 0% (found on real data)", () => {
  // 5 days logged, coverage gate cleared, and NO published plan lines. The
  // adherence formula divides by nothing and returns 0 with evaluableDays=0.
  // Read naively that becomes "at_risk, 0% on core lines" — an accusation sent
  // to the coach about a student who did exactly what was asked.
  const noPlan: StudentWeekInput = student({
    studentUserId: "void",
    displayName: "Julie",
    adherence: {
      weekDates: WEEK,
      evaluations: [],
      eventCountsByDate: Object.fromEntries(WEEK.slice(0, 5).map((d) => [d, 2])),
    },
  });
  const synthesis = buildCoachSynthesis([noPlan], NOW);
  const line = synthesis.lines[0];

  assertEquals(line.riskBand, "watch", "not at_risk: the student did nothing wrong");
  assertEquals(line.flagReason, "no_evaluable_plan");
  // No percentage anywhere — neither in the cohort average nor in the payload.
  assertEquals(synthesis.metrics.meanCoreAdherencePct, null);
  assertEquals(synthesis.metrics.withAdherence, 0);
  const payload = flaggedStudentsPayload(synthesis);
  assertEquals((payload[0].evidence as Record<string, unknown>).core_adherence_pct, null);
  assertEquals((payload[0].evidence as Record<string, unknown>).adherence_gated, true);
  assertEquals((payload[0].evidence as Record<string, unknown>).evaluable_days, 0);

  // And the sentence points at the COACH's action, not the student's failure.
  const text = renderSynthesisText(synthesis, { locale: "en" });
  assert(text.includes("no published plan lines"), text);
  assert(!/\d+%/.test(text), text);
});

Deno.test("a real 0% with evaluated lines IS still at_risk", () => {
  // The disarm side: the fix must not swallow a genuine failing week.
  const failing = student({ adherence: adherenceInput(7, "missed") });
  const synthesis = buildCoachSynthesis([failing], NOW);
  assertEquals(synthesis.lines[0].riskBand, "at_risk");
  assertEquals(synthesis.lines[0].flagReason, "adherence_at_risk");
  assertEquals(synthesis.metrics.meanCoreAdherencePct, 0);
});

// ---------------------------------------------------------------------------
// PIVOT N4 — LA VIVABILITÉ remplace l'adhérence
//
// Le coach RECOMMANDE, l'élève DÉCIDE: « ont-ils suivi ma prescription » n'a
// plus d'objet. « Est-ce que mon programme est tenable » en a un, et c'est le
// seul chiffre sur lequel un coach peut agir — en allégeant.
// ---------------------------------------------------------------------------

Deno.test("livability: a band, never a score out of 100", () => {
  // Une note chiffrée sur trois niveaux subjectifs serait de la fausse
  // précision, et de la gamification — bannie (§1.3).
  const s = summarizeLivability([
    { overall: "good", axis: null },
    { overall: "good", axis: null },
    { overall: "good", axis: null },
    { overall: "mixed", axis: "sleep" },
  ]);
  assertEquals(s.band, "sustainable");
  assertEquals(s.taps, 4);
  assertEquals(s.good, 3);
});

Deno.test("livability: a third of hard days is enough to raise it", () => {
  // On alerte tôt: le coût d'un faux positif (le coach regarde) est très
  // inférieur au coût d'un décrochage.
  const s = summarizeLivability([
    { overall: "good", axis: null },
    { overall: "good", axis: null },
    { overall: "hard", axis: "hunger" },
  ]);
  assertEquals(s.band, "hard");
});

Deno.test("livability: strained sits between the two", () => {
  const s = summarizeLivability([
    { overall: "mixed", axis: "energy" },
    { overall: "mixed", axis: "energy" },
    { overall: "good", axis: null },
  ]);
  assertEquals(s.band, "strained");
});

Deno.test("livability: under 3 taps we claim NOTHING", () => {
  // Deux jours ne font pas une semaine. `unknown` est une réponse honnête.
  const s = summarizeLivability([{ overall: "hard", axis: "sleep" }]);
  assertEquals(s.band, "unknown");
  assertEquals(summarizeLivability([]).band, "unknown");
});

Deno.test("livability: the dominant axis is deterministic on a tie", () => {
  // Deux semaines identiques doivent produire le même axe, sinon la synthèse
  // n'est pas une preuve.
  const pulses = [
    { overall: "hard", axis: "sleep" },
    { overall: "hard", axis: "hunger" },
    { overall: "hard", axis: "energy" },
  ];
  const a = summarizeLivability(pulses);
  const b = summarizeLivability([...pulses].reverse());
  assertEquals(a.dominantAxis, b.dominantAxis);
  assertEquals(a.dominantAxis, "energy"); // ordre alphabétique sur égalité
});

Deno.test("a hard week is FLAGGED, and the line names the axis", () => {
  const synthesis = buildCoachSynthesis([
    student({
      displayName: "Julie",
      dailyPulses: [
        { overall: "hard", axis: "hunger" },
        { overall: "hard", axis: "hunger" },
        { overall: "good", axis: null },
      ],
    }),
  ], NOW);
  const line = synthesis.lines[0];
  assertEquals(line.flagReason, "week_too_hard");
  assertEquals(line.livability.band, "hard");

  const text = renderSynthesisText(synthesis, { locale: "en" });
  assert(text.includes("hunger"), text);
  assert(text.includes("2 hard days out of 3"), text);
});

Deno.test("the narrative leads with how the week FELT, not with adherence", () => {
  const synthesis = buildCoachSynthesis([
    student({ studentUserId: "a", dailyPulses: [
      { overall: "good", axis: null }, { overall: "good", axis: null }, { overall: "good", axis: null },
    ] }),
    student({ studentUserId: "b", dailyPulses: [
      { overall: "hard", axis: "sleep" }, { overall: "hard", axis: "sleep" }, { overall: "mixed", axis: "sleep" },
    ] }),
  ], NOW);
  const text = renderSynthesisText(synthesis, { locale: "en" });
  assert(text.includes("How the week felt"), text);
  assert(text.includes("1 holding up"), text);
  assert(text.includes("1 having a hard time"), text);
  // Et la vivabilité vient AVANT toute mention d'adhérence.
  const feltAt = text.indexOf("How the week felt");
  const adhAt = text.indexOf("adherence");
  assert(feltAt >= 0 && (adhAt === -1 || feltAt < adhAt), text);
});

Deno.test("nobody tapped: the synthesis says so instead of inventing a band", () => {
  const synthesis = buildCoachSynthesis([student({ dailyPulses: [] })], NOW);
  const text = renderSynthesisText(synthesis, { locale: "en" });
  assert(text.includes("Nobody checked in enough"), text);
});

Deno.test("the student's own intentions are reported, without a score", () => {
  const synthesis = buildCoachSynthesis([
    student({ studentUserId: "a", weekPlan: { nutritionLines: 4, actionLines: 2, adopted: true } }),
    student({ studentUserId: "b", weekPlan: null }),
  ], NOW);
  assertEquals(synthesis.metrics.planned, 1);
  const text = renderSynthesisText(synthesis, { locale: "en" });
  assert(text.includes("1 of 2 built themselves a week"), text);
  // Jamais un pourcentage de réalisation: personne ne note.
  assert(!/\d+% of (their|the) plan/i.test(text), text);
});

// LE CAS QUI A CASSÉ CE CHIFFRE EN PRODUCTION, et la raison de la seconde
// source. Depuis que la semaine de méthode a été remplacée par le constructeur
// de repas, plus personne n'adopte: ce bloc affichait 0 pour TOUTE cohorte, sur
// l'artefact que le coach paie pour lire.
Deno.test("des repas composés comptent, même sans semaine adoptée", () => {
  const synthesis = buildCoachSynthesis([
    student({ studentUserId: "a", weekPlan: null, composedMeals: 3 }),
    student({ studentUserId: "b", weekPlan: null, composedMeals: 0 }),
  ], NOW);
  assertEquals(synthesis.metrics.planned, 1);
  assert(
    renderSynthesisText(synthesis, { locale: "en" }).includes("1 of 2 built themselves a week"),
  );
});

// Le silence n'est jamais arrondi vers le haut: sans surface renseignée, la
// phrase disparaît au lieu de rendre un zéro qui se lit comme un constat.
Deno.test("aucune des deux surfaces: la phrase ne sort pas", () => {
  const synthesis = buildCoachSynthesis([
    student({ studentUserId: "a", weekPlan: null }),
  ], NOW);
  assertEquals(synthesis.metrics.planned, 0);
  assert(!renderSynthesisText(synthesis, { locale: "en" }).includes("built themselves a week"));
});

// ---------------------------------------------------------------------------
// QA AGENT 11 (2026-08-03) — les trois défauts trouvés sur une cohorte réelle
// de 7 élèves, chacun avec son test de non-régression et sa condition de
// désarmement.
// ---------------------------------------------------------------------------

/** Un élève qui LOGGE mais n'a aucune ligne à mesurer (l'état normal du 1:N). */
function loggingIntoTheVoid(
  id: string,
  loggedDays: number,
  over: Partial<StudentWeekInput> = {},
): StudentWeekInput {
  return student({
    studentUserId: id,
    displayName: id,
    adherence: {
      weekDates: WEEK,
      evaluations: [],
      eventCountsByDate: Object.fromEntries(
        WEEK.slice(0, loggedDays).map((d) => [d, 2]),
      ),
    },
    ...over,
  });
}

Deno.test("the gate sentence COUNTS both causes instead of deducing one from the other", () => {
  // TROUVÉ EN QA sur une cohorte réelle. `flagReason` porte une PRIORITÉ: un
  // élève dont la semaine a été dure sort en `week_too_hard` même s'il n'a, lui
  // aussi, aucune ligne à mesurer. Compter « sans plan » par le motif et
  // décrire TOUS LES AUTRES comme « ont loggé moins de 4 jours sur 7 » affirmait
  // donc, d'un élève qui avait loggé 5 jours, qu'il n'avait quasiment rien
  // loggé — dans le seul artefact dont toute la valeur est que ses chiffres
  // sont vrais.
  const hardWeekNoPlan = loggingIntoTheVoid("hard", 5, {
    dailyPulses: [
      { overall: "hard", axis: "hunger" },
      { overall: "hard", axis: "hunger" },
      { overall: "good", axis: null },
    ],
  });
  const quietNoPlan = loggingIntoTheVoid("quiet", 5);
  const barelyLogged = loggingIntoTheVoid("barely", 2);

  const synthesis = buildCoachSynthesis(
    [hardWeekNoPlan, quietNoPlan, barelyLogged],
    NOW,
  );
  // La preuve que le piège est bien tendu: l'élève à 5 jours loggés N'EST PAS
  // signalé `no_evaluable_plan`, c'est sa semaine dure qui l'emporte.
  assertEquals(
    synthesis.lines.find((l) => l.studentUserId === "hard")?.flagReason,
    "week_too_hard",
  );

  const text = renderSynthesisText(synthesis, { locale: "en" });
  assert(
    text.includes(
      "2 of 3 students have no published plan to log against, and 1 logged fewer than 4 of 7 days",
    ),
    text,
  );
  // Plus aucune inférence sur un ensemble qu'on n'a pas mesuré.
  assert(!text.includes("the others logged"), text);
  assert(!text.includes("the other logged"), text);
});

Deno.test("the gate sentence does not mention coverage when coverage is not the cause", () => {
  // Condition de désarmement: la ceinture ne mord pas quand le problème
  // n'existe pas. Tout le monde a loggé, personne n'a de plan -> une seule
  // cause nommée, et pas de « 0 logged fewer than 4 of 7 days » décoratif.
  const synthesis = buildCoachSynthesis(
    [loggingIntoTheVoid("a", 6), loggingIntoTheVoid("b", 5)],
    NOW,
  );
  const text = renderSynthesisText(synthesis, { locale: "en" });
  assert(text.includes("no plan lines are published for these students yet"), text);
  assert(!text.includes("fewer than"), text);
});

Deno.test("the gate sentence still says 'nobody logged' when NOBODY logged", () => {
  // L'autre condition de désarmement: la phrase historique reste vraie quand
  // elle est vraie.
  const synthesis = buildCoachSynthesis(
    [loggingIntoTheVoid("a", 1), loggingIntoTheVoid("b", 0)],
    NOW,
  );
  const text = renderSynthesisText(synthesis, { locale: "en" });
  assert(text.includes("nobody logged at least 4 of 7 days"), text);
});

Deno.test("a coach with no students is not told his cohort went quiet", () => {
  // « 0 students: 0 in touch, 0 slipping, 0 silent » + « nobody checked in » +
  // « nobody logged at least 4 of 7 days » est indiscernable d'une semaine où
  // tout le monde s'est tu. C'est un constat d'échec sur des gens qui
  // n'existent pas.
  const text = renderSynthesisText(buildCoachSynthesis([], NOW), { locale: "en" });
  assertEquals(text, "No students in this cohort yet - nothing to report this week.");
  assert(!text.includes("0 in touch"), text);
  assert(!text.includes("nobody logged"), text);
  assert(!text.includes("Nobody checked in"), text);
});

Deno.test("the row CARRIES the livability, it is not only in the sentence", () => {
  // La vivabilité est le chiffre de tête du modèle 1:N. Absente de `metrics`,
  // la phrase « 2 holding up » n'était vérifiable qu'en recalculant la semaine
  // sur les tables sources — ce que l'en-tête du module promet l'inverse.
  const synthesis = buildCoachSynthesis([
    student({
      studentUserId: "a",
      dailyPulses: [
        { overall: "good", axis: null },
        { overall: "good", axis: null },
        { overall: "good", axis: null },
      ],
      weekPlan: { nutritionLines: 3, actionLines: 1, adopted: true },
    }),
    student({
      studentUserId: "b",
      dailyPulses: [
        { overall: "hard", axis: "hunger" },
        { overall: "hard", axis: "hunger" },
        { overall: "mixed", axis: "hunger" },
      ],
    }),
    student({ studentUserId: "c", dailyPulses: [{ overall: "good", axis: null }] }),
  ], NOW);

  const payload = metricsPayload(synthesis) as Record<string, unknown>;
  assertEquals(payload.livability, {
    sustainable: 1,
    strained: 0,
    hard: 1,
    unknown: 1,
  });
  assertEquals(payload.planned, 1);

  // Et le chiffre de la ligne est EXACTEMENT celui de la phrase.
  const text = renderSynthesisText(synthesis, { locale: "en" });
  assert(text.includes("1 holding up"), text);
  assert(text.includes("1 having a hard time"), text);
});
