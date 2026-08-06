/**
 * PROPERTY — a restriction-flagged student receives NO adherence pressure on ANY
 * channel.
 *
 * THE INVARIANT:
 *
 *   When `restriction_guard.restriction_flag` is true, every student-facing
 *   channel KEEL owns suppresses every surface in `SUPPRESSED_STUDENT_SURFACES`
 *   — the score, the percentage, the streak, the weight readout, the calorie
 *   readout, the compliance reminder, the digest nudge. On every channel. Not
 *   "softened": absent.
 *
 * WHY "ANY CHANNEL" IS THE HARD PART. A floor that holds on WhatsApp and leaks
 * on the web is not a floor, it is a preference. The channel inventory below is
 * therefore EXPLICIT and asserted to be complete: adding a fifth student-facing
 * KEEL channel without adding it here fails this file, which is the only way a
 * suppression list stays true as a product grows.
 *
 * THE INVENTORY, and the state of each one, measured:
 *
 *   1. whatsapp_proactive_provisioning — `_shared/keel/provision_day.ts`     GATED
 *   2. whatsapp_delivery               — `process-checkins/index.ts`          GATED
 *   3. conversation_turn               — `sophia-brain/routers/routers.ts`    GATED
 *   4. web_student_app                 — `frontend/src/keel/pages/*`      NOT GATED
 *
 * Channel 4 is a REAL, CURRENT GAP and it is pinned at the bottom of this file
 * rather than asserted away. `/app/progress` renders streaks, a `met` count and
 * a rolling weight average — `streak_display` and `weight_readout`, both on the
 * suppression list — and reads no guard on any code path. The floor is armed on
 * the three server channels and open on the fourth.
 */

import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { fromFileUrl } from "https://deno.land/std@0.208.0/path/mod.ts";

import {
  RESTRICTION_GUARD_VERSION,
  type RestrictionGuardResult,
  type RestrictionTriggerCode,
  SUPPRESSED_STUDENT_SURFACES,
  allowedStudentSurfaces,
  assertStudentSurfaceAllowed,
} from "../../../_shared/keel/restriction_guard.ts";
import {
  KEEL_SLOT_REMINDER_SURFACE,
  KEEL_SUNDAY_DIGEST_SURFACE,
  type KeelCommitmentRow,
  deriveKeelDayPlan,
} from "../../../_shared/keel/slot_reminders.ts";
import { runConversationRouters } from "../../routers/routers.ts";
import type { TurnFrame } from "../../contracts/turn_frame.v1.ts";
import {
  allowedNumbersForTask,
  reduceDisorderedEatingGuard,
} from "../../skills/disordered_eating_guard/reducer.ts";
import { adversarialStudents, personaById } from "../personas/personas.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function flagged(
  codes: readonly RestrictionTriggerCode[] = ["rapid_weight_loss"],
): RestrictionGuardResult {
  return {
    guard_version: RESTRICTION_GUARD_VERSION,
    restriction_flag: true,
    triggers: codes.map((code) => ({ code, evidence: { pinned: true } })),
    evaluated_for_date: "2026-08-03",
  };
}

const CLEAR: RestrictionGuardResult = {
  guard_version: RESTRICTION_GUARD_VERSION,
  restriction_flag: false,
  triggers: [],
  evaluated_for_date: "2026-08-03",
};

function commitment(overrides: Partial<KeelCommitmentRow> = {}): KeelCommitmentRow {
  return {
    id: "c1",
    title: "Cruciferous veg",
    student_instruction: null,
    anchor_kind: "slot",
    slot_key: "breakfast",
    slot_kind: "nominal",
    scheduled_days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    required_days_per_week: 7,
    priority: "core",
    status: "active",
    auto_source: null,
    ...overrides,
  };
}

function turnFrame(): TurnFrame {
  return {
    turn_id: "restriction-property",
    source_message_id: "restriction-property.message",
    user_id: "student-under-floor",
    channel: "whatsapp",
    safety: { risk_band: "none", reason_codes: [], evidence: [] },
    direct_effects: [],
    skill_signals: {},
    needs_research: { detected: false, value: false },
    memory_plan: {
      response_intent: "reflection",
      reasoning_complexity: "low",
      context_need: "minimal",
      memory_mode: "none",
      model_tier_hint: "lite",
      context_budget_tier: "tiny",
      targets: [],
      retrieval_policy: "semantic_first",
      plan_confidence: 0.7,
    },
  };
}

// ---------------------------------------------------------------------------
// The floor itself, over the whole power set of surfaces
// ---------------------------------------------------------------------------

Deno.test("PROPERTY: under a raised flag, no suppressed surface survives any request", () => {
  const guard = flagged();
  const surfaces = [...SUPPRESSED_STUDENT_SURFACES];
  // Power set: every combination a caller could ask for at once. 2^9 = 512.
  const combinations = 1 << surfaces.length;
  for (let mask = 0; mask < combinations; mask += 1) {
    const asked = surfaces.filter((_, i) => (mask & (1 << i)) !== 0);
    assertEquals(
      allowedStudentSurfaces(guard, asked),
      [],
      `suppressed surfaces survived: ${asked.join(", ")}`,
    );
    for (const surface of asked) {
      let threw = false;
      try {
        assertStudentSurfaceAllowed(guard, surface);
      } catch {
        threw = true;
      }
      assertEquals(threw, true, `${surface} did not throw under a raised flag`);
    }
  }
  assertEquals(combinations, 512);
});

Deno.test("PROPERTY: with the flag down, nothing is suppressed (disarm condition)", () => {
  // A belt states when it does NOT fire. A floor that also mutes the healthy
  // student is a product outage wearing a safety badge.
  const surfaces = [...SUPPRESSED_STUDENT_SURFACES];
  assertEquals(allowedStudentSurfaces(CLEAR, surfaces), surfaces);
  for (const surface of surfaces) assertStudentSurfaceAllowed(CLEAR, surface);
});

Deno.test("PROPERTY: a surface OUTSIDE the list is never suppressed, flag or no flag", () => {
  // The floor subtracts named surfaces; it does not blank the product. A
  // safety-critical message must still reach a flagged student.
  for (const guard of [flagged(), CLEAR]) {
    assertEquals(
      allowedStudentSurfaces(guard, ["safety_crisis_resources", "coach_message"]),
      ["safety_crisis_resources", "coach_message"],
    );
  }
});

// ---------------------------------------------------------------------------
// CHANNEL 1 — WhatsApp proactive provisioning
// ---------------------------------------------------------------------------

const EVERY_SLOT = [
  "on_waking",
  "breakfast",
  "snack_am",
  "pre_workout",
  "lunch",
  "post_workout",
  "snack_pm",
  "dinner",
  "before_bed",
] as const;

Deno.test("CHANNEL whatsapp_proactive: a flagged student is provisioned nothing, any day, any plan", () => {
  // Every weekday (so the Sunday digest branch is covered) x every slot x
  // several plan sizes. Under the flag the output is empty, always.
  const dates = [
    "2026-08-03", // mon
    "2026-08-05", // wed
    "2026-08-08", // sat
    "2026-08-09", // sun — digest day
  ];
  let checked = 0;
  for (const localDate of dates) {
    for (const slot of EVERY_SLOT) {
      for (const size of [1, 3]) {
        const commitments = Array.from({ length: size }, (_, i) =>
          commitment({ id: `c${i}`, slot_key: slot, title: `Line ${i}` }));
        const plan = deriveKeelDayPlan({
          userId: "student-under-floor",
          planVersionId: "pv1",
          localDate,
          weekStartsOn: "mon",
          commitments,
          studentFirstName: "Ivy",
          locale: "en",
          restriction: flagged(),
        });
        checked += 1;
        assertEquals(plan.items, [], `${localDate}/${slot}: messages were provisioned`);
        assertEquals(plan.restrictionFlag, true);
        assertEquals(
          plan.suppressedSurfaces.sort(),
          [KEEL_SLOT_REMINDER_SURFACE, KEEL_SUNDAY_DIGEST_SURFACE].sort(),
          "the suppression must be NAMED, not merely effective — the execution " +
            "trail is what proves a message was withheld rather than lost",
        );
      }
    }
  }
  assertEquals(checked, dates.length * EVERY_SLOT.length * 2);
});

Deno.test("CHANNEL whatsapp_proactive: with the flag down the same day DOES provision", () => {
  // Falsifiability. Without this, the test above would pass on a function that
  // returns nothing for everyone.
  const plan = deriveKeelDayPlan({
    userId: "student-clear",
    planVersionId: "pv1",
    localDate: "2026-08-09", // sunday: reminder + digest
    weekStartsOn: "mon",
    commitments: [commitment()],
    studentFirstName: "Dan",
    locale: "en",
    restriction: CLEAR,
  });
  assertEquals(plan.restrictionFlag, false);
  assertEquals(plan.suppressedSurfaces, []);
  assertEquals(plan.items.length >= 2, true, "nothing was provisioned for a clear student");
  assertEquals(
    plan.items.some((i) => i.kind === "sunday_digest"),
    true,
  );
});

Deno.test("CHANNEL whatsapp_proactive: the day provisioner consults the floor at all", async () => {
  const source = await Deno.readTextFile(
    fromFileUrl(new URL("../../../_shared/keel/provision_day.ts", import.meta.url)),
  );
  assertEquals(source.includes("evaluateRestrictionForStudent"), true);
  assertEquals(source.includes("restriction_flag"), true);
});

// ---------------------------------------------------------------------------
// CHANNEL 2 — WhatsApp delivery
// ---------------------------------------------------------------------------

/**
 * Provisioning and delivery are separated by hours: a check-in scheduled on
 * Monday morning is sent Monday evening, and the flag can rise in between. So
 * the floor is asked TWICE, and this asserts the second ask exists.
 */
Deno.test("CHANNEL whatsapp_delivery: the sender re-asks the floor at delivery time", async () => {
  const source = await Deno.readTextFile(
    fromFileUrl(new URL("../../../process-checkins/index.ts", import.meta.url)),
  );
  assertEquals(
    source.includes("allowedStudentSurfaces("),
    true,
    "process-checkins no longer re-checks the floor at delivery — a message " +
      "provisioned before the flag rose would ship",
  );
  assertEquals(source.includes("evaluateRestrictionForStudent("), true);
  assertEquals(
    source.includes("keel_restriction_guard_unavailable"),
    true,
    "the unavailable branch is gone: a floor that cannot be evaluated must " +
      "block and say so, never default to sending",
  );
});

// ---------------------------------------------------------------------------
// CHANNEL 3 — the conversation turn
// ---------------------------------------------------------------------------

Deno.test("CHANNEL conversation: a raised flag routes the turn away from every plan lane", () => {
  // Les deux lanes concurrentes de ce cas (`product_help`,
  // `coaching_recommendation`) ont été supprimées en phase A. Ce que la
  // propriété affirme n'a pas bougé — un drapeau de restriction détourne le
  // tour de TOUTE lane plan — donc la table garde un signal encore vivant plus
  // un signal inconnu, qui est le pire cas: le routeur ne doit pas s'y raccrocher.
  const otherLanes: Array<Partial<TurnFrame["skill_signals"]>> = [
    {},
    { plan_question: { detected: true, confidence_band: "high" } },
    { unknown_removed_lane: { detected: true, confidence_band: "high" } } as never,
  ];
  for (const skill_signals of otherLanes) {
    const decision = runConversationRouters({
      turn_frame: { ...turnFrame(), skill_signals: skill_signals as TurnFrame["skill_signals"] },
      safety_context_risk_band: "none",
      restriction_guard: { restriction_flag: true, trigger_codes: ["rapid_weight_loss"] },
      keel_student: true,
    });
    assertEquals(decision.response_owner, "disordered_eating_guard");
    assertEquals(decision.selected_handler, "disordered_eating_guard");
    assertEquals(
      decision.direct_effects_to_run,
      [],
      "a durable effect ran on a turn held by the clinical floor",
    );
  }
});

Deno.test("CHANNEL conversation: with the flag down the same turns route normally", () => {
  const decision = runConversationRouters({
    turn_frame: turnFrame(),
    safety_context_risk_band: "none",
    restriction_guard: { restriction_flag: false },
    keel_student: true,
  });
  assertEquals(decision.response_owner === "disordered_eating_guard", false);
});

Deno.test("CHANNEL conversation: the flow's response contract bans numbers in every phase", () => {
  // The reducer is the only thing that opens this flow, and it refuses to open
  // without a raised flag. Every task it can emit carries allow_numbers:false.
  const seenKinds = new Set<string>();
  // Two states on purpose. The FIRST turn of the flow always emits
  // `open_without_numbers` whatever the student said (entry is not negotiable),
  // so running only fresh states would exercise exactly one branch and prove
  // nothing about the others.
  const states = [
    {},
    { phase: "holding" as const, turn_count: 1, coach_escalated: true },
  ];
  for (const persona of adversarialStudents()) {
    for (const userMessage of persona.pressure_vectors) {
      for (const previousState of states) {
        const reduction = reduceDisorderedEatingGuard({
          previousState,
          guardResult: flagged(["rapid_weight_loss", "compensatory_language"]),
          userMessage,
          country: "US",
        });
        seenKinds.add(reduction.visibleTask.kind);
        const contract = reduction.responseContract;
        assertEquals(contract.allow_numbers, false, userMessage);
        assertEquals(contract.allow_adherence_reference, false, userMessage);
        assertEquals(contract.allow_plan_work, false, userMessage);
        assertEquals(contract.allow_product_reference, false, userMessage);
        assertEquals(contract.must_offer_human_coach, true, userMessage);
        // The only digits the visible agent may emit are registry content: the
        // helpline contact, its label, its URL. The validator subtracts these
        // whole strings from the message and then asserts no digit is left —
        // which is how "give them the helpline" and "never say a figure"
        // coexist without a hand-maintained allowlist.
        const allowed = allowedNumbersForTask(reduction.visibleTask);
        assertEquals(
          allowed.length > 0,
          true,
          "the numeric allowlist is empty — the deterministic fallback message " +
            "carries a helpline, so its digits must be allowed or every reply " +
            "fails validation",
        );
        assertEquals(
          allowed.some((n) => /\d/.test(n)),
          true,
          "no allowed string carries a digit: the helpline contact has gone missing",
        );
      }
    }
  }
  assertEquals(
    seenKinds.size >= 2,
    true,
    `the adversarial corpus only ever reaches ${[...seenKinds].join(", ")} — it ` +
      `has stopped exercising the flow`,
  );
});

Deno.test("CHANNEL conversation: the flow cannot be opened without the floor", () => {
  let threw = false;
  try {
    reduceDisorderedEatingGuard({
      previousState: {},
      guardResult: CLEAR,
      userMessage: "how many calories was that",
      country: "US",
    });
  } catch {
    threw = true;
  }
  assertEquals(
    threw,
    true,
    "a clinical flow that can be opened without a raised flag is a flow a " +
      "model can open",
  );
});

// ---------------------------------------------------------------------------
// CHANNEL 4 — the web student app. THE GAP.
// ---------------------------------------------------------------------------

/**
 * PINNED DEFECT (TESTING.md doctrine: a real defect is pinned, never skipped).
 *
 * `/app/progress` is a student-facing KEEL channel and it consults NO guard.
 * Read the page: it renders `computeStreaks`, a `met` count, four weeks of
 * regularity and a rolling weight average. `streak_display` and
 * `weight_readout` are both in `SUPPRESSED_STUDENT_SURFACES`. A student the
 * deterministic floor has flagged is silenced on WhatsApp and in chat, then
 * opens the web app and reads her streak and her weight.
 *
 * This is not a hypothetical: the suppression list was written for exactly
 * these two surfaces, and W4.5 built the page before W4.6 wired the floor.
 *
 * Not fixed here: `frontend/src/keel/` is outside the W11 perimeter, and the
 * fix is a product decision (server-side gate on the progress read? a flag on
 * the snapshot payload? a whole-page substitution?) rather than a patch.
 *
 * DISARM CONDITION: this test goes RED as soon as either page imports or reads
 * a restriction signal. That is the signal to delete it, move the channel into
 * the GATED inventory at the top of this file, and add a behavioural test.
 */
Deno.test("PINNED DEFECT: the web student app is NOT gated by the restriction floor", async () => {
  const pages = ["ProgressPage.tsx", "TodayPage.tsx"];
  const clientPath = "../../../../../frontend/src/keel/api/keelClient.ts";
  const sources: string[] = [];
  for (const page of pages) {
    sources.push(
      await Deno.readTextFile(
        fromFileUrl(new URL(`../../../../../frontend/src/keel/pages/${page}`, import.meta.url)),
      ),
    );
  }
  sources.push(
    await Deno.readTextFile(fromFileUrl(new URL(clientPath, import.meta.url))),
  );

  for (const [i, source] of sources.entries()) {
    const name = i < pages.length ? pages[i] : "keelClient.ts";
    assertEquals(
      /restriction_flag|restrictionFlag|restriction_guard/.test(source),
      false,
      `${name} now reads a restriction signal — the gap is closed. Delete this ` +
        `PINNED test, move web_student_app into the GATED inventory at the top ` +
        `of this file, and replace it with a behavioural assertion.`,
    );
  }

  // And the surfaces really are the suppressed ones — so the pin names a
  // concrete leak rather than a vague worry.
  const progress = sources[0];
  assertEquals(progress.includes("computeStreaks"), true);
  assertEquals(progress.includes("weightAverage"), true);
  for (const surface of ["streak_display", "weight_readout"]) {
    assertEquals(
      (SUPPRESSED_STUDENT_SURFACES as readonly string[]).includes(surface),
      true,
      `${surface} must be on the suppression list for this pin to mean anything`,
    );
  }
});

// ---------------------------------------------------------------------------
// The inventory must stay complete
// ---------------------------------------------------------------------------

/**
 * The list of student-facing KEEL channels, declared. A new one that is not
 * added here fails this test — which is the only mechanism that keeps a
 * suppression guarantee true as surfaces are added.
 */
const KEEL_STUDENT_CHANNELS = [
  { channel: "whatsapp_proactive_provisioning", gated: true },
  { channel: "whatsapp_delivery", gated: true },
  { channel: "conversation_turn", gated: true },
  { channel: "web_student_app", gated: false },
] as const;

Deno.test("inventory: three of the four student channels are gated, and the fourth is named", () => {
  assertEquals(KEEL_STUDENT_CHANNELS.length, 4);
  assertEquals(KEEL_STUDENT_CHANNELS.filter((c) => c.gated).length, 3);
  assertEquals(
    KEEL_STUDENT_CHANNELS.filter((c) => !c.gated).map((c) => c.channel),
    ["web_student_app"],
    "the ungated channel changed — update the PINNED test above and TESTING.md",
  );
});

Deno.test("inventory: the restrictor persona's expected triggers are the ones this file pins", () => {
  const ivy = personaById("student_restrictor_marchetti");
  assertEquals(ivy.expected_restriction_triggers.includes("rapid_weight_loss"), true);
  assertEquals(ivy.risk_class, "restriction");
});
