/**
 * PROPERTY — a phantom acknowledgement cannot get out.
 *
 * THE INVARIANT, stated once so a future edit has something to break:
 *
 *   For a KEEL student, on a turn that is neither a safety crisis nor held by
 *   the eating-disorder floor, where the student reports a COMPLETED FACT and
 *   the turn commits ZERO durable effects, the rendered text contains NO
 *   acknowledgement claim — for every message in the corpus, every rendering in
 *   the corpus, and every combination of the two.
 *
 * WHY A PROPERTY AND NOT MORE EXAMPLES. `keel_ack_without_effect_guard_test.ts`
 * already pins the guard on chosen inputs. Example tests are answered by
 * example: a lexicon that grows a hole between two of them stays green forever.
 * What follows is the cartesian product — every student report crossed with
 * every way a composer has been observed to say "done" — asserted against the
 * invariant rather than against expected strings. When it goes red it names the
 * exact pair, which is the fastest possible bug report.
 *
 * WHAT IT DOES NOT DO. It does not assert the guard's lexicon is COMPLETE.
 * `detectCompletedFactReport` is a folded lexicon and a lexicon has a boundary
 * by construction; a report phrased outside it is not detected and the guard
 * correctly stays sheathed. That limit is measured here rather than hidden: the
 * corpus is asserted to be detected, so a lexicon regression that stops seeing
 * "I had my magnesium last night" fails HERE, at the detector, instead of
 * silently shrinking the guard's reach.
 */

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { fromFileUrl } from "https://deno.land/std@0.208.0/path/mod.ts";

import {
  acknowledgementClaimSentenceIndexes,
  containsAcknowledgementClaim,
  detectCompletedFactReport,
  guardKeelAckWithoutCommittedEffect,
} from "../../skills/_shared/keel_ack_without_effect_guard.ts";
import { PERSONAS } from "../personas/personas.ts";

// ---------------------------------------------------------------------------
// Corpora
// ---------------------------------------------------------------------------

/**
 * Student turns reporting something ALREADY DONE. English, because the pilot is
 * English; the guard carries a French lexicon too and its own test covers it.
 * Negative reports ("I didn't do my walk") are in here on purpose: they must
 * produce a `missed`, and an acknowledgement without a row is exactly as false
 * on a failure as on a success.
 */
const COMPLETED_FACT_REPORTS: readonly string[] = [
  "I did my 30 minute walk this morning.",
  "I took my magnesium last night.",
  "I ate the salmon and a big salad.",
  "I finished the whole week of breakfasts.",
  "We cooked the batch of lentils yesterday.",
  "I walked to the office instead of driving.",
  "I skipped lunch again today.",
  "I did not do my walk yesterday.",
  "I didn't take the D3 this morning.",
  "I've logged everything I could remember.",
  "I swapped the rice for potatoes at dinner.",
  "I weighed myself this morning.",
  "It's done, both of them.",
];

/**
 * Renderings that CLAIM something was recorded. Written the way composers
 * actually fail: cheerful, short, and often glyph-terminated. The checkmark is
 * an acknowledgement all on its own — that is why it is in here bare.
 */
const ACK_CLAIM_RENDERINGS: readonly string[] = [
  "Logged it, nice work.",
  "Noted. That is your Wednesday done.",
  "I've recorded that against your plan.",
  "Counted it toward your protein line.",
  "Got it, added to your log.",
  "That's now logged ✅",
  "Ticked it off for today.",
  "Marked as done. Keep going!",
  "Taken into account, thanks for telling me.",
  "Consider it done.",
  "Nice — I've logged both of those and ticked off your walk.",
];

/** Renderings that claim NOTHING. The guard must leave every one of them alone. */
const NEUTRAL_RENDERINGS: readonly string[] = [
  "I couldn't tell which line that belongs to — which one is it?",
  "That sounds like a hard morning.",
  "Sam wrote that starch swaps are fine within the same group.",
  "There is not enough on this week to say how it is going.",
  "",
];

/**
 * A sentence the guard MIS-reads as an acknowledgement. See the `PINNED DEFECT`
 * test at the bottom of this file; it is kept next to the corpus so nobody adds
 * it back to `NEUTRAL_RENDERINGS` and gets a mysterious red.
 */
const OVER_TRIGGERING_NEUTRAL_RENDERING =
  "I don't have enough logged this week to say how it is going.";

// ---------------------------------------------------------------------------
// The corpus itself must stay detectable
// ---------------------------------------------------------------------------

Deno.test("property corpus: every report is detected as a completed fact", () => {
  for (const message of COMPLETED_FACT_REPORTS) {
    const detection = detectCompletedFactReport(message);
    assertEquals(
      detection.reports_completed_fact,
      true,
      `the guard no longer sees a completed fact in ${JSON.stringify(message)} ` +
        `(reason_code=${detection.reason_code}) — its reach just shrank silently`,
    );
  }
});

Deno.test("property corpus: every ack rendering is detected as an ack claim", () => {
  for (const text of ACK_CLAIM_RENDERINGS) {
    assertEquals(
      containsAcknowledgementClaim(text),
      true,
      `no longer recognized as an acknowledgement: ${JSON.stringify(text)}`,
    );
  }
});

Deno.test("property corpus: no neutral rendering is mistaken for an ack claim", () => {
  for (const text of NEUTRAL_RENDERINGS) {
    assertEquals(
      containsAcknowledgementClaim(text),
      false,
      `false positive on a neutral rendering: ${JSON.stringify(text)}`,
    );
  }
});

// ---------------------------------------------------------------------------
// THE PROPERTY
// ---------------------------------------------------------------------------

Deno.test("PROPERTY: zero committed effects => zero acknowledgement, over the whole product", () => {
  let combinations = 0;
  for (const userMessage of COMPLETED_FACT_REPORTS) {
    for (const text of ACK_CLAIM_RENDERINGS) {
      combinations += 1;
      const result = guardKeelAckWithoutCommittedEffect({
        text,
        userMessage,
        isKeelStudent: true,
        committedEffectCount: 0,
      });
      assertEquals(
        result.triggered,
        true,
        `guard stayed sheathed on ${JSON.stringify(userMessage)} / ${JSON.stringify(text)}`,
      );
      assertEquals(
        containsAcknowledgementClaim(result.text),
        false,
        `an acknowledgement survived the guard.\n  message: ${userMessage}\n  ` +
          `rendered: ${text}\n  after guard: ${result.text}`,
      );
      // The degraded output is USEFUL, not mute: it asks the binding question
      // the dispatcher failed to produce. A silent strip recreates the same
      // harm in another shape — the student still thinks it went through.
      assertEquals(
        result.text.trim().length > 0,
        true,
        `guard produced an empty reply for ${JSON.stringify(userMessage)}`,
      );
      assertEquals(
        result.text.includes("?"),
        true,
        `degraded output asks nothing: ${JSON.stringify(result.text)}`,
      );
    }
  }
  assertEquals(
    combinations,
    COMPLETED_FACT_REPORTS.length * ACK_CLAIM_RENDERINGS.length,
  );
  assertEquals(combinations >= 100, true, "the product got smaller, not the bug");
});

Deno.test("PROPERTY: one committed effect disarms the guard entirely", () => {
  for (const userMessage of COMPLETED_FACT_REPORTS) {
    for (const text of ACK_CLAIM_RENDERINGS) {
      for (const committedEffectCount of [1, 2, 7]) {
        const result = guardKeelAckWithoutCommittedEffect({
          text,
          userMessage,
          isKeelStudent: true,
          committedEffectCount,
        });
        assertEquals(result.triggered, false);
        assertEquals(result.reason_code, "disarmed_effect_committed");
        // Untouched: with a row behind it the acknowledgement is TRUE, and a
        // guard that mangles a true sentence is a new defect.
        assertEquals(result.text, text);
      }
    }
  }
});

Deno.test("PROPERTY: every disarm condition really disarms, and names itself", () => {
  const message = COMPLETED_FACT_REPORTS[0];
  const text = ACK_CLAIM_RENDERINGS[0];
  const cases: Array<[string, Parameters<typeof guardKeelAckWithoutCommittedEffect>[0]]> = [
    ["disarmed_not_keel_student", {
      text,
      userMessage: message,
      isKeelStudent: false,
      committedEffectCount: 0,
    }],
    ["disarmed_safety_turn", {
      text,
      userMessage: message,
      isKeelStudent: true,
      committedEffectCount: 0,
      isSafetyTurn: true,
    }],
    ["disarmed_restriction_floor_turn", {
      text,
      userMessage: message,
      isKeelStudent: true,
      committedEffectCount: 0,
      isRestrictionFloorTurn: true,
    }],
    ["disarmed_future_intent", {
      text,
      userMessage: "I will do my walk tonight after work.",
      isKeelStudent: true,
      committedEffectCount: 0,
    }],
    ["disarmed_question", {
      text,
      userMessage: "Did you log my walk?",
      isKeelStudent: true,
      committedEffectCount: 0,
    }],
    ["disarmed_no_ack_claim", {
      text: NEUTRAL_RENDERINGS[0],
      userMessage: message,
      isKeelStudent: true,
      committedEffectCount: 0,
    }],
  ];
  for (const [expected, input] of cases) {
    const result = guardKeelAckWithoutCommittedEffect(input);
    assertEquals(result.triggered, false, expected);
    assertEquals(result.reason_code, expected);
    assertEquals(result.text, input.text);
  }
});

/**
 * The surgical requirement. A guard that deletes the whole reply to remove one
 * false sentence is a guard nobody keeps switched on.
 */
Deno.test("PROPERTY: only the offending sentences are removed", () => {
  const legitimate = "That sounds like a solid morning.";
  for (const claim of ACK_CLAIM_RENDERINGS) {
    const text = `${legitimate} ${claim}`;
    const before = acknowledgementClaimSentenceIndexes(text).length;
    const result = guardKeelAckWithoutCommittedEffect({
      text,
      userMessage: COMPLETED_FACT_REPORTS[0],
      isKeelStudent: true,
      committedEffectCount: 0,
    });
    assertEquals(result.triggered, true);
    assertEquals(result.stripped_sentences, before);
    assertEquals(
      result.text.includes(legitimate),
      true,
      `the legitimate sentence was collateral damage: ${JSON.stringify(result.text)}`,
    );
  }
});

/**
 * The adversarial personas' own sentences, run through the property. If a
 * persona's pressure vector reports a completed fact, the same invariant holds
 * for it — the corpus above is not a special case.
 */
Deno.test("PROPERTY: persona pressure vectors obey the same invariant", () => {
  let checked = 0;
  for (const persona of PERSONAS) {
    if (persona.role !== "student") continue;
    for (const userMessage of persona.pressure_vectors) {
      if (!detectCompletedFactReport(userMessage).reports_completed_fact) continue;
      checked += 1;
      for (const text of ACK_CLAIM_RENDERINGS) {
        const result = guardKeelAckWithoutCommittedEffect({
          text,
          userMessage,
          isKeelStudent: true,
          committedEffectCount: 0,
        });
        assertEquals(
          containsAcknowledgementClaim(result.text),
          false,
          `${persona.persona_id}: ${userMessage} / ${text} -> ${result.text}`,
        );
      }
    }
  }
  assertEquals(checked > 0, true, "no persona sentence reaches the guard at all");
});

// ---------------------------------------------------------------------------
// Wiring — a pure guard nobody calls is a document, not a floor
// ---------------------------------------------------------------------------

/**
 * PINNED DEFECT (TESTING.md doctrine: a real defect is pinned, never skipped).
 *
 * `ACK_CLAIM_PATTERNS` contains `/ (logged|recorded|noted|marked|tracked|counted)
 * (it|that|this|your|both|them) /`, and "…enough **logged this** week…" matches
 * it. So the honest sentence KEEL is supposed to say when coverage is thin —
 * "I don't have enough logged this week to say how it is going" — is classified
 * as an acknowledgement claim and STRIPPED whenever the same turn reports an
 * uncommitted completed fact.
 *
 * Consequence, small but real and in the wrong direction: on the exact turn
 * where the student reported something that was not written down, the reply
 * loses its "I don't know" and is replaced by the binding question alone. The
 * guard's own doctrine is surgery, not mutilation.
 *
 * Not fixed here: `skills/_shared/keel_ack_without_effect_guard.ts` is outside
 * the W11 perimeter, and this is a one-token fix in the pattern (require a
 * possessive/deictic that is not a time word, or anchor on a subject).
 *
 * DISARM CONDITION: this test goes RED the day the pattern is tightened. That
 * is the signal to delete it and move the sentence back into
 * `NEUTRAL_RENDERINGS` above.
 */
Deno.test("PINNED DEFECT: 'not enough logged this week' is misread as an acknowledgement", () => {
  assertEquals(
    containsAcknowledgementClaim(OVER_TRIGGERING_NEUTRAL_RENDERING),
    true,
    "the over-trigger is gone — fix is landed, delete this PINNED test and " +
      "move the sentence back into NEUTRAL_RENDERINGS",
  );
  const result = guardKeelAckWithoutCommittedEffect({
    text: OVER_TRIGGERING_NEUTRAL_RENDERING,
    userMessage: COMPLETED_FACT_REPORTS[0],
    isKeelStudent: true,
    committedEffectCount: 0,
  });
  assertEquals(result.triggered, true);
  assertEquals(result.stripped_sentences, 1);
  assertEquals(
    result.text.includes("enough logged"),
    false,
    "the honest coverage sentence is removed — that is the pinned defect",
  );
});

Deno.test("wiring: the router actually calls the guard", async () => {
  const source = await Deno.readTextFile(
    fromFileUrl(new URL("../../router/run.ts", import.meta.url)),
  );
  assertEquals(
    source.includes("guardKeelAckWithoutCommittedEffect("),
    true,
    "router/run.ts no longer calls guardKeelAckWithoutCommittedEffect — the " +
      "guard has become a pure function nobody executes, which is how W3.2's " +
      "restriction floor spent a whole wave being a document",
  );
});
