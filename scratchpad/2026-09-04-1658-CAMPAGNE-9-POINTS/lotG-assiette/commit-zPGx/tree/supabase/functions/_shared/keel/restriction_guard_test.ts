// KEEL — restriction guard tests (BUILD_PLAN W3.2).
//
// Four things are proven here, in this order of importance:
//   1. each of the four triggers fires on its own premise;
//   2. the floor is NOT bypassable — no input, adversarial or otherwise, can
//      talk it down, and the module is structurally incapable of asking a model;
//   3. false-premise / disarm conditions: absent data, short series, innocent
//      homonyms and recovered trajectories leave the flag DOWN;
//   4. incoherent data throws (R7) instead of quietly reporting "safe".
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";

import {
  allowedStudentSurfaces,
  assertStudentSurfaceAllowed,
  evaluateRestrictionGuard,
  RESTRICTION_GUARD_VERSION,
  RESTRICTION_THRESHOLDS,
  restrictionEffect,
  type RestrictionSnapshot,
  SUPPRESSED_STUDENT_SURFACES,
} from "./restriction_guard.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function snapshot(patch: Partial<RestrictionSnapshot> = {}): RestrictionSnapshot {
  return {
    as_of_local_date: "2026-08-03",
    weekly_outcomes: [],
    energy_days: [],
    texts: [],
    ...patch,
  };
}

function note(text: string): RestrictionSnapshot["texts"][number] {
  return {
    source: "protocol_event_student_note",
    text,
    content_locale: "en",
  };
}

function turn(text: string, locale = "en"): RestrictionSnapshot["texts"][number] {
  return { source: "turn_message", text, content_locale: locale };
}

function triggerCodes(result: { triggers: Array<{ code: string }> }): string[] {
  return result.triggers.map((t) => t.code);
}

// ---------------------------------------------------------------------------
// TRIGGER 1 — rapid weight loss
// ---------------------------------------------------------------------------

Deno.test("trigger 1 — loss above 1.2 %/week over the 2-week window raises the flag", () => {
  // 70.0 -> 68.0 kg in 14 days = 2.86 % total = 1.43 %/week > 1.2.
  const result = evaluateRestrictionGuard(snapshot({
    weekly_outcomes: [
      { week_start_date: "2026-07-20", weight_7d_avg_kg: 70.0, self_rated_adherence: null, logging_coverage_days: null },
      { week_start_date: "2026-07-27", weight_7d_avg_kg: 69.0, self_rated_adherence: null, logging_coverage_days: null },
      { week_start_date: "2026-08-03", weight_7d_avg_kg: 68.0, self_rated_adherence: null, logging_coverage_days: null },
    ],
  }));
  assertEquals(result.restriction_flag, true);
  assertEquals(triggerCodes(result), ["rapid_weight_loss"]);
  const evidence = result.triggers[0].evidence;
  assertEquals(evidence.window_start_week, "2026-07-20");
  assertEquals(evidence.window_end_week, "2026-08-03");
  assertEquals(evidence.weekly_loss_pct, 1.43);
  assertEquals(evidence.threshold_weekly_loss_pct, 1.2);
});

Deno.test("trigger 1 — DISARMED just under the threshold (1.0 %/week)", () => {
  const result = evaluateRestrictionGuard(snapshot({
    weekly_outcomes: [
      { week_start_date: "2026-07-20", weight_7d_avg_kg: 70.0, self_rated_adherence: null, logging_coverage_days: null },
      { week_start_date: "2026-08-03", weight_7d_avg_kg: 68.6, self_rated_adherence: null, logging_coverage_days: null },
    ],
  }));
  assertEquals(result.restriction_flag, false);
  assertEquals(result.triggers, []);
});

Deno.test("trigger 1 — DISARMED on a single week (2-week premise absent)", () => {
  // A 3 % drop in ONE week is dramatic, but the trigger's premise is a 2-week
  // trajectory. It must not fire on a window that does not exist yet.
  const result = evaluateRestrictionGuard(snapshot({
    weekly_outcomes: [
      { week_start_date: "2026-07-27", weight_7d_avg_kg: 70.0, self_rated_adherence: null, logging_coverage_days: null },
      { week_start_date: "2026-08-03", weight_7d_avg_kg: 67.9, self_rated_adherence: null, logging_coverage_days: null },
    ],
  }));
  assertEquals(result.restriction_flag, false);
});

Deno.test("trigger 1 — rolling: an earlier breached window still counts", () => {
  // Breach between W0 and W2, flat afterwards. The flag is about what happened,
  // not about the tail of the series.
  const result = evaluateRestrictionGuard(snapshot({
    weekly_outcomes: [
      { week_start_date: "2026-07-06", weight_7d_avg_kg: 70.0, self_rated_adherence: null, logging_coverage_days: null },
      { week_start_date: "2026-07-13", weight_7d_avg_kg: 69.0, self_rated_adherence: null, logging_coverage_days: null },
      { week_start_date: "2026-07-20", weight_7d_avg_kg: 67.9, self_rated_adherence: null, logging_coverage_days: null },
      { week_start_date: "2026-07-27", weight_7d_avg_kg: 67.9, self_rated_adherence: null, logging_coverage_days: null },
      { week_start_date: "2026-08-03", weight_7d_avg_kg: 67.9, self_rated_adherence: null, logging_coverage_days: null },
    ],
  }));
  assertEquals(triggerCodes(result), ["rapid_weight_loss"]);
});

Deno.test("trigger 1 — DISARMED when weight is not reported (null is not zero)", () => {
  const result = evaluateRestrictionGuard(snapshot({
    weekly_outcomes: [
      { week_start_date: "2026-07-20", weight_7d_avg_kg: 70.0, self_rated_adherence: null, logging_coverage_days: null },
      { week_start_date: "2026-08-03", weight_7d_avg_kg: null, self_rated_adherence: null, logging_coverage_days: null },
    ],
  }));
  assertEquals(result.restriction_flag, false);
});

Deno.test("trigger 1 — weight GAIN never trips the loss trigger", () => {
  const result = evaluateRestrictionGuard(snapshot({
    weekly_outcomes: [
      { week_start_date: "2026-07-20", weight_7d_avg_kg: 66.0, self_rated_adherence: null, logging_coverage_days: null },
      { week_start_date: "2026-08-03", weight_7d_avg_kg: 70.0, self_rated_adherence: null, logging_coverage_days: null },
    ],
  }));
  assertEquals(result.restriction_flag, false);
});

// ---------------------------------------------------------------------------
// TRIGGER 2 — energy deficit streak
// ---------------------------------------------------------------------------

Deno.test("trigger 2 — 3 consecutive days below target - 25 % raises the flag", () => {
  const result = evaluateRestrictionGuard(snapshot({
    energy_days: [
      { local_date: "2026-08-01", target_kcal: 2000, observed_kcal: 1900 },
      { local_date: "2026-08-02", target_kcal: 2000, observed_kcal: 1400 },
      { local_date: "2026-08-03", target_kcal: 2000, observed_kcal: 1100 },
      { local_date: "2026-08-04", target_kcal: 2000, observed_kcal: 1200 },
    ],
  }));
  assertEquals(triggerCodes(result), ["energy_deficit_streak"]);
  const evidence = result.triggers[0].evidence;
  assertEquals(evidence.streak_start_date, "2026-08-02");
  assertEquals(evidence.streak_end_date, "2026-08-04");
  assertEquals(evidence.consecutive_days, 3);
});

Deno.test("trigger 2 — DISARMED at 2 consecutive days", () => {
  const result = evaluateRestrictionGuard(snapshot({
    energy_days: [
      { local_date: "2026-08-02", target_kcal: 2000, observed_kcal: 1400 },
      { local_date: "2026-08-03", target_kcal: 2000, observed_kcal: 1100 },
      { local_date: "2026-08-04", target_kcal: 2000, observed_kcal: 1900 },
    ],
  }));
  assertEquals(result.restriction_flag, false);
});

Deno.test("trigger 2 — exactly at the boundary (1500 of 2000) is NOT a deficit day", () => {
  // target - 25 % = 1500. Strictly below is the deficit; the boundary is not.
  const result = evaluateRestrictionGuard(snapshot({
    energy_days: [
      { local_date: "2026-08-02", target_kcal: 2000, observed_kcal: 1500 },
      { local_date: "2026-08-03", target_kcal: 2000, observed_kcal: 1500 },
      { local_date: "2026-08-04", target_kcal: 2000, observed_kcal: 1500 },
    ],
  }));
  assertEquals(result.restriction_flag, false);
});

Deno.test("trigger 2 — an UNKNOWN day breaks the streak, it never bridges it", () => {
  // CONTRACT: `unknown` is first-class. A day nobody logged cannot be counted
  // as a deficit day, and it cannot be silently walked through to claim three
  // CONSECUTIVE days either.
  const gapDay = evaluateRestrictionGuard(snapshot({
    energy_days: [
      { local_date: "2026-08-01", target_kcal: 2000, observed_kcal: 1000 },
      { local_date: "2026-08-02", target_kcal: 2000, observed_kcal: null },
      { local_date: "2026-08-03", target_kcal: 2000, observed_kcal: 1000 },
      { local_date: "2026-08-04", target_kcal: 2000, observed_kcal: 1000 },
    ],
  }));
  assertEquals(gapDay.restriction_flag, false);

  const missingRow = evaluateRestrictionGuard(snapshot({
    energy_days: [
      { local_date: "2026-08-01", target_kcal: 2000, observed_kcal: 1000 },
      // 2026-08-02 absent from the series entirely
      { local_date: "2026-08-03", target_kcal: 2000, observed_kcal: 1000 },
      { local_date: "2026-08-04", target_kcal: 2000, observed_kcal: 1000 },
    ],
  }));
  assertEquals(missingRow.restriction_flag, false);
});

Deno.test("trigger 2 — deficit is relative to THAT day's target, not a global one", () => {
  const result = evaluateRestrictionGuard(snapshot({
    energy_days: [
      { local_date: "2026-08-02", target_kcal: 1600, observed_kcal: 1100 },
      { local_date: "2026-08-03", target_kcal: 2600, observed_kcal: 1100 },
      { local_date: "2026-08-04", target_kcal: 1400, observed_kcal: 1100 },
    ],
  }));
  // 1100/1600 = 69 % (deficit), 1100/2600 = 42 % (deficit), 1100/1400 = 79 %
  // (not a deficit) => longest streak is 2, flag stays down.
  assertEquals(result.restriction_flag, false);
});

// ---------------------------------------------------------------------------
// TRIGGER 3 — compensatory language
// ---------------------------------------------------------------------------

Deno.test("trigger 3 — strong compensatory tokens fire (EN)", () => {
  for (
    const text of [
      "I threw up after dinner",
      "I made myself sick again",
      "I didn't deserve to eat today",
      "I have to earn my food first",
      "I'll be fasting to compensate for the weekend",
    ]
  ) {
    const result = evaluateRestrictionGuard(snapshot({ texts: [note(text)] }));
    assertEquals(result.restriction_flag, true, `expected a flag for: ${text}`);
    assertEquals(triggerCodes(result), ["compensatory_language"]);
  }
});

Deno.test("trigger 3 — contextual tokens fire when the object is food (EN)", () => {
  for (
    const text of [
      "I skipped lunch to stay on track",
      "I'm going to skip dinner tonight",
      "I'll make up for it tomorrow",
      "I need to burn off that meal",
      "I have to compensate for what I ate",
    ]
  ) {
    const result = evaluateRestrictionGuard(snapshot({ texts: [turn(text)] }));
    assertEquals(result.restriction_flag, true, `expected a flag for: ${text}`);
  }
});

Deno.test("trigger 3 — French equivalents fire, accents cannot slip past", () => {
  for (
    const text of [
      "j'ai sauté le déjeuner",
      "je vais compenser ce repas demain",
      "je me suis fait vomir",
      "je n'ai pas mérité de manger",
      "je vais jeûner pour compenser",
    ]
  ) {
    const result = evaluateRestrictionGuard(
      snapshot({ texts: [turn(text, "fr")] }),
    );
    assertEquals(result.restriction_flag, true, `expected a flag for: ${text}`);
  }
});

Deno.test("trigger 3 — FALSE PREMISE: innocent homonyms do NOT fire", () => {
  // This is the disarm condition for the contextual tier. A guard that fires
  // here would be turned off by its owner within a week, which is the same
  // outcome as not having one.
  for (
    const text of [
      "can we skip the intro and go straight to week 3",
      "I skipped leg day, my knee hurt",
      "I burned 400 calories on the bike today",
      "the coach made up for the missing session by adding one on Friday",
      "I want to purge my inbox this weekend",
      "we ran out of gas so I had to fast forward the video",
    ]
  ) {
    const result = evaluateRestrictionGuard(snapshot({ texts: [turn(text)] }));
    assertEquals(
      result.restriction_flag,
      false,
      `unexpected flag for innocent text: ${text}`,
    );
  }
});

Deno.test("trigger 3 — evidence names the matched tokens and their sources", () => {
  const result = evaluateRestrictionGuard(snapshot({
    texts: [
      note("skipped breakfast"),
      turn("I'll burn off that dinner later"),
    ],
  }));
  const evidence = result.triggers[0].evidence;
  assertEquals(evidence.matched_tokens, ["skip_meal", "burn_off_food"]);
  assertEquals(evidence.sources, ["protocol_event_student_note", "turn_message"]);
});

// ---------------------------------------------------------------------------
// TRIGGER 4 — overclaimed adherence + hidden logging + accelerating loss
// ---------------------------------------------------------------------------

const OVERCLAIM_WEEKS = [
  { week_start_date: "2026-07-20", weight_7d_avg_kg: 70.0, self_rated_adherence: 9, logging_coverage_days: 2 },
  { week_start_date: "2026-07-27", weight_7d_avg_kg: 69.5, self_rated_adherence: 9, logging_coverage_days: 2 },
  // 69.5 -> 68.7 = 1.15 %/week, up from 0.71 %/week, above the 1.0 floor.
  { week_start_date: "2026-08-03", weight_7d_avg_kg: 68.7, self_rated_adherence: 9, logging_coverage_days: 2 },
];

Deno.test("trigger 4 — self-rating >= 8 + coverage < 3/7 + accelerating loss", () => {
  const result = evaluateRestrictionGuard(
    snapshot({ weekly_outcomes: OVERCLAIM_WEEKS }),
  );
  assertEquals(triggerCodes(result), [
    "overclaimed_adherence_with_hidden_logging",
  ]);
  const evidence = result.triggers[0].evidence;
  assertEquals(evidence.self_rated_adherence, 9);
  assertEquals(evidence.logged_days, 2);
  assertEquals(evidence.latest_weekly_loss_pct, 1.15);
  assertEquals(evidence.previous_weekly_loss_pct, 0.71);
});

Deno.test("trigger 4 — DISARMED when the student is actually logging (3/7)", () => {
  const weeks = OVERCLAIM_WEEKS.map((w) => ({ ...w, logging_coverage_days: 3 }));
  assertEquals(
    evaluateRestrictionGuard(snapshot({ weekly_outcomes: weeks }))
      .restriction_flag,
    false,
  );
});

Deno.test("trigger 4 — DISARMED when the self-rating is honest (7)", () => {
  const weeks = OVERCLAIM_WEEKS.map((w) => ({ ...w, self_rated_adherence: 7 }));
  assertEquals(
    evaluateRestrictionGuard(snapshot({ weekly_outcomes: weeks }))
      .restriction_flag,
    false,
  );
});

Deno.test("trigger 4 — DISARMED when the loss is DECELERATING", () => {
  const weeks = [
    { ...OVERCLAIM_WEEKS[0], weight_7d_avg_kg: 70.0 },
    { ...OVERCLAIM_WEEKS[1], weight_7d_avg_kg: 69.2 }, // 1.14 %/week
    { ...OVERCLAIM_WEEKS[2], weight_7d_avg_kg: 68.9 }, // 0.43 %/week
  ];
  assertEquals(
    evaluateRestrictionGuard(snapshot({ weekly_outcomes: weeks }))
      .restriction_flag,
    false,
  );
});

Deno.test("trigger 4 — DISARMED with fewer than 3 weekly points (no two rates)", () => {
  assertEquals(
    evaluateRestrictionGuard(
      snapshot({ weekly_outcomes: OVERCLAIM_WEEKS.slice(1) }),
    ).restriction_flag,
    false,
  );
});

// ---------------------------------------------------------------------------
// Multiple triggers, and the global disarm condition
// ---------------------------------------------------------------------------

Deno.test("triggers accumulate and keep their declared order", () => {
  const result = evaluateRestrictionGuard(snapshot({
    weekly_outcomes: [
      { week_start_date: "2026-07-20", weight_7d_avg_kg: 70.0, self_rated_adherence: null, logging_coverage_days: null },
      { week_start_date: "2026-08-03", weight_7d_avg_kg: 68.0, self_rated_adherence: null, logging_coverage_days: null },
    ],
    energy_days: [
      { local_date: "2026-08-01", target_kcal: 2000, observed_kcal: 1000 },
      { local_date: "2026-08-02", target_kcal: 2000, observed_kcal: 1000 },
      { local_date: "2026-08-03", target_kcal: 2000, observed_kcal: 1000 },
    ],
    texts: [note("I skipped dinner")],
  }));
  assertEquals(triggerCodes(result), [
    "rapid_weight_loss",
    "energy_deficit_streak",
    "compensatory_language",
  ]);
});

Deno.test("FALSE PREMISE — an empty snapshot leaves the flag DOWN", () => {
  // Absence of data is never evidence of restriction. This is the mirror of the
  // CONTRACT rule that silence is never evidence of compliance.
  const result = evaluateRestrictionGuard(snapshot());
  assertEquals(result.restriction_flag, false);
  assertEquals(result.triggers, []);
  assertEquals(result.guard_version, RESTRICTION_GUARD_VERSION);
  assertEquals(result.evaluated_for_date, "2026-08-03");
});

Deno.test("FALSE PREMISE — a healthy student with full data stays clear", () => {
  const result = evaluateRestrictionGuard(snapshot({
    weekly_outcomes: [
      { week_start_date: "2026-07-20", weight_7d_avg_kg: 70.0, self_rated_adherence: 7, logging_coverage_days: 6 },
      { week_start_date: "2026-07-27", weight_7d_avg_kg: 69.7, self_rated_adherence: 8, logging_coverage_days: 7 },
      { week_start_date: "2026-08-03", weight_7d_avg_kg: 69.5, self_rated_adherence: 8, logging_coverage_days: 6 },
    ],
    energy_days: [
      { local_date: "2026-08-01", target_kcal: 2000, observed_kcal: 1950 },
      { local_date: "2026-08-02", target_kcal: 2000, observed_kcal: 2100 },
      { local_date: "2026-08-03", target_kcal: 2000, observed_kcal: 1800 },
    ],
    texts: [turn("felt good this week, hit my protein most days")],
  }));
  assertEquals(result.restriction_flag, false);
});

// ---------------------------------------------------------------------------
// NON-BYPASSABILITY — the point of the whole module
// ---------------------------------------------------------------------------

Deno.test("non-bypassable — adversarial fields on the snapshot change nothing", () => {
  // Everything a model could plausibly emit to talk the floor down, injected
  // straight into the input. The guard has no parameter for any of it.
  const hostile = {
    ...snapshot({ texts: [note("I threw up after dinner")] }),
    restriction_flag: false,
    triggers: [],
    guard_version: "restriction_guard.v0_disabled",
    llm_assessment: { restriction_flag: false, confidence: "high" },
    override: true,
    guard_disabled: true,
    safety_review: "cleared_by_model",
    suppress_triggers: ["compensatory_language"],
    thresholds: { max_weekly_loss_pct: 99 },
  } as unknown as RestrictionSnapshot;
  const result = evaluateRestrictionGuard(hostile);
  assertEquals(result.restriction_flag, true);
  assertEquals(triggerCodes(result), ["compensatory_language"]);
  assertEquals(result.guard_version, RESTRICTION_GUARD_VERSION);
});

Deno.test("non-bypassable — thresholds are frozen at runtime", () => {
  assert(Object.isFrozen(RESTRICTION_THRESHOLDS));
  assert(Object.isFrozen(SUPPRESSED_STUDENT_SURFACES));
  const before = RESTRICTION_THRESHOLDS.max_weekly_loss_pct;
  try {
    (RESTRICTION_THRESHOLDS as unknown as Record<string, number>)
      .max_weekly_loss_pct = 99;
  } catch {
    // strict mode throws; sloppy mode silently ignores. Either is fine.
  }
  assertEquals(RESTRICTION_THRESHOLDS.max_weekly_loss_pct, before);
});

Deno.test("non-bypassable — the module is structurally incapable of asking a model", () => {
  // A behavioural test cannot prove the absence of an LLM call; reading the
  // source can. Zero imports means zero network, zero env, zero model.
  const source = Deno.readTextFileSync(
    new URL("./restriction_guard.ts", import.meta.url),
  );
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  const forbidden = [
    /\bimport\s/,
    /\brequire\s*\(/,
    /\bfetch\s*\(/,
    /Deno\.env/,
    /generateWithGemini/,
    /supabase/i,
    /\bMath\.random\b/,
    /\bDate\.now\b/,
  ];
  for (const pattern of forbidden) {
    assertEquals(
      pattern.test(code),
      false,
      `restriction_guard.ts must not contain ${pattern}`,
    );
  }
});

Deno.test("non-bypassable — the effect cannot be fabricated from a clear result", () => {
  const clear = evaluateRestrictionGuard(snapshot());
  assertThrows(
    () => restrictionEffect(clear, { user_id: "u1" }),
    Error,
    "no raised flag",
  );
  // Nor from a hand-rolled object claiming a flag this module never raised.
  assertThrows(
    () =>
      restrictionEffect(
        {
          guard_version: "restriction_guard.v0",
          restriction_flag: true,
          triggers: [{ code: "rapid_weight_loss", evidence: {} }],
          evaluated_for_date: "2026-08-03",
          // deno-lint-ignore no-explicit-any
        } as any,
        { user_id: "u1" },
      ),
    Error,
    "did not produce",
  );
});

// ---------------------------------------------------------------------------
// EFFECT — suspension + immediate escalation
// ---------------------------------------------------------------------------

Deno.test("effect — adherence pressure off, coach escalated immediately, no draft", () => {
  const result = evaluateRestrictionGuard(snapshot({
    texts: [note("I skipped dinner to make up for lunch")],
  }));
  const effect = restrictionEffect(result, {
    user_id: "student-1",
    plan_version_id: "pv-1",
    student_words: "I skipped dinner to make up for lunch",
  });
  assertEquals(effect.adherence_pressure_suspended, true);
  assertEquals(effect.forced_conversation_skill_id, "disordered_eating_guard");

  const ccr = effect.contract_change_request;
  assertEquals(ccr.raised_by, "system");
  assertEquals(ccr.reason_code, "restriction_signal");
  assertEquals(ccr.urgency, "immediate");
  assertEquals(ccr.bypasses_digest, true);
  assertEquals(ccr.suggested_option, null); // the AI proposes nothing here
  assertEquals(ccr.status, "open");
  assertEquals(ccr.content_locale, "en");
  assertEquals(ccr.plan_version_id, "pv-1");
  // The COACH gets the evidence, numbers included.
  assertEquals(ccr.sophia_evidence.triggers, result.triggers);
  assert(ccr.sophia_summary.includes("compensatory language"));
});

Deno.test("effect — every scored or numeric student surface is suspended", () => {
  const result = evaluateRestrictionGuard(snapshot({
    texts: [note("I threw up after dinner")],
  }));
  for (const surface of SUPPRESSED_STUDENT_SURFACES) {
    assertThrows(
      () => assertStudentSurfaceAllowed(result, surface),
      Error,
      "suspended",
    );
  }
  // A surface that carries no adherence pressure still renders.
  assertStudentSurfaceAllowed(result, "conversation_reply");
  assertEquals(
    allowedStudentSurfaces(result, [
      "adherence_percentage",
      "conversation_reply",
      "coach_message",
    ]),
    ["conversation_reply", "coach_message"],
  );
});

Deno.test("effect — a clear result suspends nothing", () => {
  const clear = evaluateRestrictionGuard(snapshot());
  for (const surface of SUPPRESSED_STUDENT_SURFACES) {
    assertStudentSurfaceAllowed(clear, surface); // must not throw
  }
  assertEquals(allowedStudentSurfaces(clear, ["adherence_score"]), [
    "adherence_score",
  ]);
});

Deno.test("effect — user_id is required", () => {
  const result = evaluateRestrictionGuard(snapshot({
    texts: [note("I threw up after dinner")],
  }));
  assertThrows(
    () => restrictionEffect(result, { user_id: "  " }),
    Error,
    "user_id is required",
  );
});

// ---------------------------------------------------------------------------
// R7 — incoherent data throws instead of reporting "safe"
// ---------------------------------------------------------------------------

Deno.test("R7 — a bad as_of_local_date throws", () => {
  assertThrows(
    () => evaluateRestrictionGuard(snapshot({ as_of_local_date: "03/08/2026" })),
    Error,
    "as_of_local_date is not YYYY-MM-DD",
  );
  assertThrows(
    () => evaluateRestrictionGuard(snapshot({ as_of_local_date: "2026-02-30" })),
    Error,
    "not a real calendar date",
  );
});

Deno.test("R7 — a non-weekly outcome series throws", () => {
  assertThrows(
    () =>
      evaluateRestrictionGuard(snapshot({
        weekly_outcomes: [
          { week_start_date: "2026-07-20", weight_7d_avg_kg: 70, self_rated_adherence: null, logging_coverage_days: null },
          { week_start_date: "2026-07-25", weight_7d_avg_kg: 69, self_rated_adherence: null, logging_coverage_days: null },
        ],
      })),
    Error,
    "not a weekly series",
  );
});

Deno.test("R7 — an unsorted or duplicated series throws", () => {
  assertThrows(
    () =>
      evaluateRestrictionGuard(snapshot({
        weekly_outcomes: [
          { week_start_date: "2026-07-27", weight_7d_avg_kg: 69, self_rated_adherence: null, logging_coverage_days: null },
          { week_start_date: "2026-07-20", weight_7d_avg_kg: 70, self_rated_adherence: null, logging_coverage_days: null },
        ],
      })),
    Error,
    "ascending",
  );
  assertThrows(
    () =>
      evaluateRestrictionGuard(snapshot({
        energy_days: [
          { local_date: "2026-08-01", target_kcal: 2000, observed_kcal: 1000 },
          { local_date: "2026-08-01", target_kcal: 2000, observed_kcal: 1000 },
        ],
      })),
    Error,
    "duplicate local_date",
  );
});

Deno.test("R7 — an implausible weight throws (unit bug, not a 100 % loss)", () => {
  // 154 "kg" that is really 154 lb of a 70 kg person would otherwise read as a
  // gain; 0 would read as a 100 % loss. Both are caller bugs, both must be loud.
  for (const weight of [0, -70, 154_000, 3]) {
    assertThrows(
      () =>
        evaluateRestrictionGuard(snapshot({
          weekly_outcomes: [
            { week_start_date: "2026-07-20", weight_7d_avg_kg: weight, self_rated_adherence: null, logging_coverage_days: null },
          ],
        })),
      Error,
      "plausible range",
    );
  }
});

Deno.test("R7 — coverage as a 0..1 ratio throws instead of silently meaning 0 days", () => {
  // The whole reason the input is an integer day count: 0.42 read as "days"
  // would make every student look like they log nothing.
  assertThrows(
    () =>
      evaluateRestrictionGuard(snapshot({
        weekly_outcomes: [
          { week_start_date: "2026-07-20", weight_7d_avg_kg: 70, self_rated_adherence: 9, logging_coverage_days: 0.42 },
        ],
      })),
    Error,
    "logging_coverage_days must be an integer",
  );
});

Deno.test("R7 — a non-positive energy target throws", () => {
  assertThrows(
    () =>
      evaluateRestrictionGuard(snapshot({
        energy_days: [
          { local_date: "2026-08-01", target_kcal: 0, observed_kcal: 1000 },
        ],
      })),
    Error,
    "target_kcal must be > 0",
  );
});

Deno.test("R7 — prose without content_locale throws (R2 at the boundary)", () => {
  assertThrows(
    () =>
      evaluateRestrictionGuard(snapshot({
        texts: [
          // deno-lint-ignore no-explicit-any
          { source: "turn_message", text: "hello" } as any,
        ],
      })),
    Error,
    "content_locale is required",
  );
});

Deno.test("R7 — an unknown text source throws", () => {
  assertThrows(
    () =>
      evaluateRestrictionGuard(snapshot({
        texts: [
          // deno-lint-ignore no-explicit-any
          { source: "coach_note", text: "hi", content_locale: "en" } as any,
        ],
      })),
    Error,
    "not a known source",
  );
});

Deno.test("R7 — missing arrays throw rather than defaulting to empty", () => {
  assertThrows(
    // deno-lint-ignore no-explicit-any
    () => evaluateRestrictionGuard({ as_of_local_date: "2026-08-03" } as any),
    Error,
    "weekly_outcomes must be an array",
  );
});
