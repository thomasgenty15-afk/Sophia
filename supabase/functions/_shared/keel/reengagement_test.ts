// PIVOT NUTRITION §1.3 — reengagement.ts.
//
// The tests that carry the product claim, named for it:
//   * "ONE nudge per episode of silence, never two"
//     -- §7.4 J4-J5. Two nudges into silence is how a busy student becomes a
//        muted thread, and a muted thread cannot be re-engaged by anything.
//   * "a person in crisis does not get a nutrition nudge"
//     -- this repo has a live incident of a durable effect committing during a
//        crisis turn (p4-safety-deferred-gate-leak). The gate is ordered so no
//        later branch can reach past it.
//   * "the guard rejects guilt, and lets warmth through"
//     -- a guard that rejects the warm phrasings leaves only the cold ones.

import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";

import {
  assertNoGuiltTripping,
  decideReengagement,
  findGuiltTripping,
  GuiltTrippingError,
  isQuietHour,
  REENGAGE_AFTER_HOURS,
  type ReengageInput,
  toneInstruction,
} from "./reengagement.ts";

const NOW = new Date("2026-08-03T12:00:00.000Z");

function hoursAgo(h: number): string {
  return new Date(NOW.getTime() - h * 3600_000).toISOString();
}

function input(over: Partial<ReengageInput> = {}): ReengageInput {
  return {
    lastInboundAt: hoursAgo(80),
    localHour: 10,
    hasActivePlan: true,
    now: NOW,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// The threshold
// ---------------------------------------------------------------------------

Deno.test("the threshold is 72h, not 48h — the repo's measured lesson wins", () => {
  // whatsapp_winback.ts: "À 2 jours on relançait encore dans la variance d'un
  // rythme normal ; à 3 jours le décrochage est un vrai signal."
  assertEquals(REENGAGE_AFTER_HOURS, 72);
  assertEquals(decideReengagement(input({ lastInboundAt: hoursAgo(47) })).decision, "skip");
  assertEquals(decideReengagement(input({ lastInboundAt: hoursAgo(71) })).decision, "skip");
  assertEquals(decideReengagement(input({ lastInboundAt: hoursAgo(72) })).decision, "send");
});

Deno.test("a student who has NEVER spoken is a candidate, not a data gap", () => {
  // The opt-in reply IS the first inbound, so its absence is exactly the case
  // a nudge exists for. Treating null as "no data, skip" would silently lose
  // every student who never answered the welcome.
  const d = decideReengagement(input({ lastInboundAt: null }));
  assertEquals(d.decision, "send");
});

// ---------------------------------------------------------------------------
// ONE per episode
// ---------------------------------------------------------------------------

Deno.test("ONE nudge per episode of silence, never two", () => {
  const first = decideReengagement(input());
  assertEquals(first.decision, "send");

  // Same silence, already nudged: skip, whatever the elapsed time.
  const second = decideReengagement(input({ nudgedThisEpisode: true }));
  assertEquals(second.decision, "skip");
  if (second.decision === "skip") {
    assertEquals(second.reason, "already_nudged_this_episode");
  }
});

Deno.test("an episode nudged three weeks ago is still THE SAME episode", () => {
  // The trap: `lastNudgeAt` is old enough to clear any gap window, but the
  // student still never answered. Elapsed time must not resurrect the nudge.
  const d = decideReengagement(
    input({
      lastInboundAt: hoursAgo(24 * 40),
      lastNudgeAt: hoursAgo(24 * 21),
      nudgedThisEpisode: true,
    }),
  );
  assertEquals(d.decision, "skip");
});

Deno.test("the minimum gap alone also blocks a second nudge", () => {
  // Belt and braces: even if a caller forgets to set nudgedThisEpisode, a
  // recent nudge blocks. The two guards fail differently on purpose.
  const d = decideReengagement(input({ lastNudgeAt: hoursAgo(24) }));
  assertEquals(d.decision, "skip");
});

// ---------------------------------------------------------------------------
// The gates, in order
// ---------------------------------------------------------------------------

Deno.test("a person in crisis does not get a nutrition nudge", () => {
  for (const band of ["low", "medium", "high", "critical"] as const) {
    const d = decideReengagement(input({ safetyBand: band }));
    assertEquals(d.decision, "skip", band);
    if (d.decision === "skip") assertEquals(d.reason, "safety_active");
  }
});

Deno.test("a restriction flag stops the nudge — a relance IS adherence pressure", () => {
  const d = decideReengagement(input({ restrictionFlag: true }));
  assertEquals(d.decision, "skip");
  if (d.decision === "skip") assertEquals(d.reason, "restriction_flag");
});

Deno.test("safety outranks everything below it, including a long silence", () => {
  // Ordering test: 40 days of silence, an ended cohort and no plan would each
  // produce a different skip reason. Safety must be the one reported, or the
  // gate is reachable from below.
  const d = decideReengagement(
    input({
      lastInboundAt: hoursAgo(24 * 40),
      safetyBand: "high",
      cohortEnded: true,
      hasActivePlan: false,
    }),
  );
  if (d.decision === "skip") assertEquals(d.reason, "safety_active");
});

Deno.test("opt-out outranks even safety — it is regulatory", () => {
  const d = decideReengagement(input({ optedOut: true, safetyBand: "high" }));
  if (d.decision === "skip") assertEquals(d.reason, "opted_out");
});

Deno.test("nothing to re-engage TO: no plan, or the cohort is over", () => {
  const noPlan = decideReengagement(input({ hasActivePlan: false }));
  if (noPlan.decision === "skip") assertEquals(noPlan.reason, "no_active_plan");
  const ended = decideReengagement(input({ cohortEnded: true }));
  if (ended.decision === "skip") assertEquals(ended.reason, "cohort_ended");
});

// ---------------------------------------------------------------------------
// Quiet hours DEFER, they do not drop
// ---------------------------------------------------------------------------

Deno.test("quiet hours defer the nudge, they never cancel it", () => {
  // A student who goes quiet at 23:00 is still owed a nudge in the morning.
  // Skipping would silently lose the episode — the phantom-commit class, in
  // the proactive direction.
  const d = decideReengagement(input({ localHour: 23 }));
  assertEquals(d.decision, "defer");
  if (d.decision === "defer") assertEquals(d.untilLocalHour, 8);
});

Deno.test("quiet hours cover the night, and open at 08:00", () => {
  assertEquals(isQuietHour(21), true);
  assertEquals(isQuietHour(2), true);
  assertEquals(isQuietHour(7), true);
  assertEquals(isQuietHour(8), false);
  assertEquals(isQuietHour(20), false);
  // An unknown hour is treated as quiet: never spam on missing data.
  assertEquals(isQuietHour(Number.NaN), true);
});

// ---------------------------------------------------------------------------
// Tone
// ---------------------------------------------------------------------------

Deno.test("a declared hard week softens the TONE, and nothing else", () => {
  const d = decideReengagement(input({ declaredHardWeek: true }));
  assertEquals(d.decision, "send");
  if (d.decision === "send") assertEquals(d.tone, "lighter");

  // §1.5: the protocol is the coach's. There is deliberately no tone value
  // meaning "relax the plan" — the instruction says so out loud.
  const instruction = toneInstruction("lighter");
  assert(instruction.includes("protocol does not change"));
  assert(instruction.includes("do not renegotiate"));
});

Deno.test("the gentle relance never counts the days or asks why", () => {
  const instruction = toneInstruction("gentle");
  assert(instruction.includes("Do not mention how many days"));
  assert(instruction.includes("Do not ask why"));
  assert(instruction.includes("adherence"));
});

Deno.test("a warm return does NOT revisit the absence (§7.4 J6)", () => {
  // Naming the silence at the moment someone returns is the most reliable way
  // to make them leave again.
  const instruction = toneInstruction("warm_return");
  assert(instruction.includes("DO NOT revisit the absence"));
  assert(instruction.includes("where were you"));
});

// ---------------------------------------------------------------------------
// The guilt guard: rejects reproach, lets warmth through
// ---------------------------------------------------------------------------

Deno.test("the guard rejects guilt", () => {
  for (
    const guilty of [
      "You haven't logged anything since Tuesday.",
      "You missed three days this week.",
      "Time to get back on track!",
      "Tu n'as rien envoyé depuis lundi.",
      "Tu as laissé tomber cette semaine, reprends-toi.",
      "Ça fait 5 jours que tu n'as rien posté.",
    ]
  ) {
    assert(findGuiltTripping(guilty).length > 0, `not caught: ${guilty}`);
  }
});

Deno.test("the guard lets warmth through — including negations", () => {
  // DISARM CONDITION: a guard that rejects the warm phrasings leaves only the
  // cold ones. These must all pass.
  for (
    const warm of [
      "Hey - how did the week go?",
      "No pressure at all, just checking in.",
      "Pas de souci si tu n'as pas eu le temps, je suis là quand tu veux.",
      "Coucou, tout va bien de ton côté ?",
      "Si tu veux reprendre tranquillement, dis-moi.",
      "Comment tu te sens en ce moment ?",
    ]
  ) {
    assertEquals(findGuiltTripping(warm), [], `false positive: ${warm}`);
  }
});

Deno.test("assertNoGuiltTripping throws and names the phrase", () => {
  const err = assertThrows(
    () => assertNoGuiltTripping("You missed two days, time to get back on track."),
    GuiltTrippingError,
  ) as GuiltTrippingError;
  assert(err.findings.length >= 1);
  assert(err.message.includes("missed"));
});

Deno.test("every guilt pattern fires on its own — no dead alternative", () => {
  // Two dead branches were found this way. `laiss\s+tomber` could never match
  // "laissé tomber" (the accent sits between the stem and the space), and a
  // pattern starting with an accented letter never fired at all because
  // JavaScript's \b is ASCII-only. Both were invisible: a sibling alternative
  // in the same sentence fired instead, so the test passed while the branch was
  // dead. Each phrase below is chosen to exercise ONE branch only.
  const oneEach: Array<[string, string]> = [
    ["you haven't logged", "You haven't logged this week."],
    ["you missed", "You skipped yesterday."],
    ["shame word", "That is a lazy approach."],
    ["back on track", "Let's get back on track."],
    ["tu n'as pas", "Tu n'as pas envoyé de photo."],
    ["tu as laissé tomber", "Tu as laissé tomber."],
    ["tu as raté", "Tu as raté ta semaine."],
    ["décevant", "C'est décevant."],
    ["reprends-toi", "Allez, reprends-toi."],
    ["ça fait N jours", "Ça fait 5 jours que tu n'as rien posté."],
  ];
  for (const [label, phrase] of oneEach) {
    assert(findGuiltTripping(phrase).length > 0, `${label} branch is dead: ${phrase}`);
  }
});

Deno.test("an empty message is not a violation", () => {
  assertEquals(findGuiltTripping(""), []);
  assertEquals(findGuiltTripping("   "), []);
});
