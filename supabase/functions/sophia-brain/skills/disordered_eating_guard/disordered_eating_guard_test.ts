// `disordered_eating_guard` — flow, resources, validator and routing tests.
//
// The claims under test, in order of what would hurt most if false:
//   1. the flow cannot be opened without the deterministic floor, and cannot be
//      talked out of by the model;
//   2. it NEVER emits a number or a metric word — including when the student
//      asks for one directly;
//   3. it is clinical, not crisis: ED resources + coach, never a suicide line,
//      and `safety_crisis` outranks it when both signals are present;
//   4. it can be left (no trap), and leaving it does NOT lift the suspension;
//   5. false premise: nothing here is armed when the floor is clear.
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";

import {
  evaluateRestrictionGuard,
  type RestrictionGuardResult,
  type RestrictionSnapshot,
} from "../../../_shared/keel/restriction_guard.ts";
import { runConversationRouters } from "../../routers/routers.ts";
import type { TurnFrame } from "../../contracts/turn_frame.v1.ts";
import {
  DISORDERED_EATING_MAX_TURNS,
  FORBIDDEN_METRIC_TERMS,
} from "./contract.ts";
import {
  classifyStudentTurn,
  reduceDisorderedEatingGuard,
} from "./reducer.ts";
import { resolveEatingDisorderResources } from "./resources.ts";
import {
  disorderedEatingDeterministicMessage,
  validateVisibleMessage,
} from "./visible_agent.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function flaggedGuard(): RestrictionGuardResult {
  const snapshot: RestrictionSnapshot = {
    as_of_local_date: "2026-08-03",
    weekly_outcomes: [],
    energy_days: [],
    texts: [{
      source: "protocol_event_student_note",
      text: "I skipped dinner to make up for lunch",
      content_locale: "en",
    }],
  };
  const result = evaluateRestrictionGuard(snapshot);
  assertEquals(result.restriction_flag, true);
  return result;
}

function clearGuard(): RestrictionGuardResult {
  return evaluateRestrictionGuard({
    as_of_local_date: "2026-08-03",
    weekly_outcomes: [],
    energy_days: [],
    texts: [],
  });
}

function reduce(args: {
  state?: Record<string, unknown>;
  message?: string;
  country?: string | null;
}) {
  return reduceDisorderedEatingGuard({
    previousState: args.state ?? {},
    guardResult: flaggedGuard(),
    userMessage: args.message ?? "",
    country: args.country === undefined ? "US" : args.country,
  });
}

/** Second turn onward: a state that has already been through the entry turn. */
const AFTER_ENTRY = {
  phase: "entry",
  turn_count: 1,
  coach_escalated: true,
  resources_delivered: false,
  consecutive_declines: 0,
};

// ---------------------------------------------------------------------------
// 1 — Entry is owned by the floor, and by nothing else
// ---------------------------------------------------------------------------

Deno.test("entry — the reducer REFUSES to run without a raised flag", () => {
  assertThrows(
    () =>
      reduceDisorderedEatingGuard({
        previousState: {},
        guardResult: clearGuard(),
        userMessage: "hi",
        country: "US",
      }),
    Error,
    "without a raised restriction flag",
  );
});

Deno.test("entry — the first turn opens without numbers and escalates to the coach", () => {
  const r = reduce({});
  assertEquals(r.phase, "entry");
  assertEquals(r.visibleTask.kind, "open_without_numbers");
  assertEquals(r.escalateToCoach, true);
  assertEquals(r.status, "continue");
  // Codes travel to the reply path; the numeric evidence never does.
  assertEquals(
    r.visibleTask.conversation_context.known_values.entry_trigger_codes,
    ["compensatory_language"],
  );
  const serialized = JSON.stringify(r.visibleTask);
  assertEquals(serialized.includes("evidence"), false);
});

Deno.test("entry — the response contract forbids numbers in EVERY task kind", () => {
  const kinds = [
    { state: undefined, message: "" },
    { state: AFTER_ENTRY, message: "what's my score" },
    { state: AFTER_ENTRY, message: "yes please" },
    { state: AFTER_ENTRY, message: "no I'm fine" },
    { state: AFTER_ENTRY, message: "can we move on" },
    { state: AFTER_ENTRY, message: "I fainted this morning" },
    { state: AFTER_ENTRY, message: "mmh" },
  ];
  for (const k of kinds) {
    const r = reduce({ state: k.state, message: k.message });
    assertEquals(r.responseContract.allow_numbers, false);
    assertEquals(r.responseContract.allow_adherence_reference, false);
    assertEquals(r.responseContract.allow_plan_work, false);
    assertEquals(r.responseContract.allow_product_reference, false);
    assertEquals(r.responseContract.use_suicide_crisis_line, false);
    assertEquals(r.responseContract.must_offer_human_coach, true);
  }
});

// ---------------------------------------------------------------------------
// 2 — Turn classification (deterministic, no model)
// ---------------------------------------------------------------------------

Deno.test("classifier — the four decisive signals", () => {
  assertEquals(classifyStudentTurn("what's my score this week"), "asks_for_numbers");
  assertEquals(classifyStudentTurn("how many calories did I have"), "asks_for_numbers");
  assertEquals(classifyStudentTurn("yes please, send it"), "accepts_support");
  assertEquals(classifyStudentTurn("no, I'm fine"), "declines_support");
  assertEquals(classifyStudentTurn("can we talk about something else"), "asks_to_move_on");
  assertEquals(classifyStudentTurn("I fainted at work today"), "reports_acute_medical");
  assertEquals(classifyStudentTurn("hmm"), "unclear");
  assertEquals(classifyStudentTurn(""), "unclear");
});

Deno.test("classifier — a request to leave is never re-read as engagement", () => {
  // "no, let's drop it" carries a decline AND an exit. The exit wins: a flow
  // that reads 'leave me alone' as 'keep going' is the trap this repo has
  // already paid for once.
  assertEquals(classifyStudentTurn("no, let's drop it"), "asks_to_move_on");
});

Deno.test("classifier — acute medical outranks a request to leave", () => {
  assertEquals(
    classifyStudentTurn("I passed out earlier but let's move on"),
    "reports_acute_medical",
  );
  const r = reduce({ state: AFTER_ENTRY, message: "I passed out earlier but let's move on" });
  assertEquals(r.visibleTask.kind, "medical_escalation");
  assertEquals(r.status, "continue");
  assertEquals(r.escalateToCoach, true); // re-escalates even if already sent
});

// ---------------------------------------------------------------------------
// 3 — The numbers invariant
// ---------------------------------------------------------------------------

Deno.test("numbers — a direct request for a figure produces a refusal task", () => {
  const r = reduce({ state: AFTER_ENTRY, message: "just tell me my adherence percentage" });
  assertEquals(r.visibleTask.kind, "numbers_refusal");
  assertEquals(r.responseContract.allow_numbers, false);
});

Deno.test("numbers — the validator rejects any figure that is not a helpline", () => {
  const task = reduce({ state: AFTER_ENTRY, message: "what's my score" }).visibleTask;
  for (
    const message of [
      "You were at 62 last week, but let's not focus on it.",
      "You logged 2 of 7 days.",
      "You've lost 3 kilos.",
      "Your intake was around 1200 yesterday.",
    ]
  ) {
    const v = validateVisibleMessage(message, task);
    assertEquals(v.ok, false, `expected rejection: ${message}`);
  }
});

Deno.test("numbers — the validator rejects metric vocabulary even without a figure", () => {
  const task = reduce({ state: AFTER_ENTRY, message: "what's my score" }).visibleTask;
  for (
    const message of [
      "Your adherence is paused for now.",
      "I won't show your score right now.",
      "Let's not count calories today.",
      "Your streak is on hold.",
      "I'm not going to talk about your weight.",
    ]
  ) {
    const v = validateVisibleMessage(message, task);
    assertEquals(v.ok, false, `expected rejection: ${message}`);
    assert(String(v.reason).startsWith("forbidden_metric_term:"));
  }
});

Deno.test("numbers — a clean clinical message passes", () => {
  const task = reduce({ state: AFTER_ENTRY, message: "what's my score" }).visibleTask;
  const v = validateVisibleMessage(
    "I'm not going to give you that one. It's paused on your side right now, " +
      "and going back over it isn't something I'll do here. Your coach is the " +
      "person to talk to next.",
    task,
  );
  assertEquals(v, { ok: true, reason: null });
});

Deno.test("numbers — the helpline contact is the ONLY numeric string allowed", () => {
  const task = reduce({ state: AFTER_ENTRY, message: "yes please" }).visibleTask;
  assertEquals(task.kind, "clinical_resources");
  const good =
    "Your coach is the person to talk to next. The National Alliance for " +
    "Eating Disorders takes calls on 1-866-662-1235.";
  assertEquals(validateVisibleMessage(good, task).ok, true);
  // Same message plus one stray figure => rejected.
  const bad = `${good} You were at 62 last week.`;
  assertEquals(
    validateVisibleMessage(bad, task).reason,
    "numeric_value_in_clinical_reply",
  );
});

Deno.test("numbers — every deterministic fallback passes its own validator", () => {
  // A fallback that fails validation would mean the safe path is the broken
  // one. Checked for every task kind and both resource states.
  for (const country of ["US", "GB", "FR", null]) {
    for (
      const message of [
        "",
        "what's my score",
        "yes please",
        "no I'm fine",
        "can we move on",
        "I fainted this morning",
        "mmh",
      ]
    ) {
      const r = reduce({
        state: message === "" ? undefined : AFTER_ENTRY,
        message,
        country,
      });
      const text = disorderedEatingDeterministicMessage(
        r.visibleTask.kind,
        r.visibleTask.conversation_context.clinical_resources.lines,
      );
      const v = validateVisibleMessage(text, r.visibleTask);
      assertEquals(
        v.ok,
        true,
        `fallback for ${r.visibleTask.kind}/${country} rejected: ${v.reason}`,
      );
    }
  }
});

Deno.test("numbers — the forbidden term list stays free of over-broad words", () => {
  // A validator that rejects ordinary sentences gets switched off. These words
  // must NOT be on the list.
  for (const innocuous of ["day", "week", "time", "food", "eat", "plan"]) {
    assertEquals(FORBIDDEN_METRIC_TERMS.includes(innocuous), false);
  }
});

// ---------------------------------------------------------------------------
// 4 — Clinical, not crisis
// ---------------------------------------------------------------------------

Deno.test("clinical — resources come from the W3.3 registry, kind eating_disorder", () => {
  // No seed of our own: a second hardcoded helpline list is a second thing to
  // go stale, on data where stale means a number that no longer answers.
  const us = resolveEatingDisorderResources("us");
  assertEquals(us.country, "US");
  assertEquals(us.fallbackUsed, false);
  assert(us.resources.every((r) => r.kind === "eating_disorder"));
  const gb = resolveEatingDisorderResources("UK"); // alias normalizes
  assertEquals(gb.country, "GB");
  assert(gb.resources[0].label.includes("Beat"));
});

Deno.test("clinical — an unserved country degrades LOUDLY, never to a US default", () => {
  const de = resolveEatingDisorderResources("DE");
  assertEquals(de.fallbackUsed, true);
  assertEquals(de.country, "ZZ");
  assertEquals(de.resolutionSource, "international_fallback_country_unsupported");
  // Degraded, but never empty: a referral that refers nowhere is not a referral.
  assert(de.resources.length > 0);
  assertEquals(resolveEatingDisorderResources(null).resolutionSource, "international_fallback_country_missing");
});

Deno.test("clinical — the fallback is visible in the task, not silent", () => {
  const r = reduce({ state: AFTER_ENTRY, message: "yes please", country: "DE" });
  assertEquals(r.visibleTask.kind, "clinical_resources");
  assertEquals(
    r.visibleTask.conversation_context.clinical_resources.fallback_reason_code,
    "international_fallback_country_unsupported",
  );
  assert(r.visibleTask.conversation_context.clinical_resources.lines.length > 0);
  // A served country carries no fallback marker.
  const us = reduce({ state: AFTER_ENTRY, message: "yes please", country: "US" });
  assertEquals(
    us.visibleTask.conversation_context.clinical_resources.fallback_reason_code,
    null,
  );
});

Deno.test("clinical — the validator rejects a suicide line in this flow", () => {
  const task = reduce({ state: AFTER_ENTRY, message: "yes please" }).visibleTask;
  const v = validateVisibleMessage(
    "You can call the suicide prevention line any time. " +
      "The National Alliance for Eating Disorders takes calls on 1-866-662-1235.",
    task,
  );
  assertEquals(v.ok, false);
  assertEquals(v.reason, "suicide_crisis_line_in_clinical_flow");
});

Deno.test("clinical — a resource task that dropped its resource is rejected", () => {
  const task = reduce({ state: AFTER_ENTRY, message: "yes please" }).visibleTask;
  const v = validateVisibleMessage(
    "Your coach is the right person to talk to about this.",
    task,
  );
  assertEquals(v.reason, "resource_task_without_resource");
});

// ---------------------------------------------------------------------------
// 5 — No trap: the conversation exits, the suspension does not
// ---------------------------------------------------------------------------

Deno.test("exit — asking to move on ends the flow in ONE turn", () => {
  const r = reduce({ state: AFTER_ENTRY, message: "can we change the subject" });
  assertEquals(r.status, "exit");
  assertEquals(r.phase, "closed");
  assertEquals(r.visibleTask.kind, "close");
  assertEquals(r.reasonCode, "disordered_eating_guard.student_requested_exit");
});

Deno.test("exit — a second decline closes the flow instead of asking again", () => {
  const first = reduce({ state: AFTER_ENTRY, message: "no, I'm fine" });
  assertEquals(first.visibleTask.kind, "respect_decline_hold");
  assertEquals(first.status, "continue");
  assertEquals(first.statePatch.consecutive_declines, 1);
  // No question at all on a decline: re-asking IS the pressure.
  assertEquals(first.responseContract.max_questions, 0);

  const second = reduce({
    state: { ...AFTER_ENTRY, ...first.statePatch },
    message: "no really, nothing's wrong",
  });
  assertEquals(second.status, "exit");
  assertEquals(second.reasonCode, "disordered_eating_guard.declined_twice");
});

Deno.test("exit — an accepted offer after a decline resets the decline counter", () => {
  const declined = reduce({ state: AFTER_ENTRY, message: "no, I'm fine" });
  const accepted = reduce({
    state: { ...AFTER_ENTRY, ...declined.statePatch },
    message: "actually yes, go ahead",
  });
  assertEquals(accepted.statePatch.consecutive_declines, 0);
  assertEquals(accepted.visibleTask.kind, "clinical_resources");
});

Deno.test("exit — the turn ceiling closes a flow nobody is leaving", () => {
  const r = reduce({
    state: { ...AFTER_ENTRY, turn_count: DISORDERED_EATING_MAX_TURNS - 1 },
    message: "mmh",
  });
  assertEquals(r.status, "exit");
  assertEquals(r.reasonCode, "disordered_eating_guard.max_turns_reached");
});

Deno.test("exit — closing NEVER lifts the suspension", () => {
  // The flag lives on DB facts. The conversation ending changes nothing about
  // it: only a coach review does. The close message says so out loud.
  const r = reduce({ state: AFTER_ENTRY, message: "let's move on" });
  assertEquals(r.status, "exit");
  const text = disorderedEatingDeterministicMessage("close", []);
  assert(text.includes("paused"));
  assert(text.includes("coach"));
  assertEquals(validateVisibleMessage(text, r.visibleTask).ok, true);
  // And the guard result the runtime holds is untouched by any of this.
  assertEquals(flaggedGuard().restriction_flag, true);
});

Deno.test("escalation — the coach is escalated ONCE, not on every turn", () => {
  const entry = reduce({});
  assertEquals(entry.escalateToCoach, true);
  const next = reduce({
    state: { ...AFTER_ENTRY, ...entry.statePatch },
    message: "mmh",
  });
  assertEquals(next.escalateToCoach, false);
});

// ---------------------------------------------------------------------------
// 6 — Routing
// ---------------------------------------------------------------------------

function turnFrame(patch: Record<string, unknown> = {}): TurnFrame {
  return {
    safety: { risk_band: "none", reason_codes: [], evidence: [] },
    direct_effects: [],
    skill_signals: {},
    memory_plan: { context_need: "minimal", memory_mode: "none" },
    source_message_id: "m1",
    channel: "web",
    ...patch,
    // deno-lint-ignore no-explicit-any
  } as any as TurnFrame;
}

Deno.test("routing — a raised flag owns the turn and blocks every pressure lane", () => {
  const decision = runConversationRouters({
    turn_frame: turnFrame({
      skill_signals: {
        coaching_recommendation: { detected: true, confidence_band: "high" },
        product_help: { detected: true, confidence_band: "high" },
      },
      direct_effects: [{
        effect_type: "track_progress_plan_item",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
      }],
    }),
    safety_context_risk_band: "none",
    restriction_guard: { restriction_flag: true },
  });
  assertEquals(decision.response_owner, "disordered_eating_guard");
  assertEquals(decision.reason_code, "restriction_flag_priority");
  // Zero durable effects: a progress tick committed here IS adherence pressure.
  assertEquals(decision.direct_effects_to_run, []);
  const blocked = decision.blocked_paths.map((b) => b.path);
  for (
    const path of [
      "product_help",
      "coaching_recommendation",
      "plan_realignment",
      "presence_conversation",
      "normal_reply",
      "direct_effects.track_progress_plan_item",
    ]
  ) {
    assert(blocked.includes(path), `expected ${path} to be blocked`);
  }
});

Deno.test("routing — safety_crisis OUTRANKS the restriction flag", () => {
  // Both signals at once: a suicidal crisis is not deferred behind a nutrition
  // guard, whatever the floor says.
  for (const band of ["high", "critical"] as const) {
    const decision = runConversationRouters({
      turn_frame: turnFrame({
        safety: { risk_band: band, reason_codes: [], evidence: [] },
      }),
      safety_context_risk_band: "none",
      restriction_guard: { restriction_flag: true },
    });
    assertEquals(decision.response_owner, "safety");
  }
  const ideation = runConversationRouters({
    turn_frame: turnFrame({
      safety: {
        risk_band: "medium",
        reason_codes: ["suicidal_ideation_passive"],
        evidence: [],
      },
    }),
    safety_context_risk_band: "none",
    restriction_guard: { restriction_flag: true },
  });
  assertEquals(ideation.response_owner, "safety");
});

Deno.test("routing — the flag OUTRANKS distress support and every product lane", () => {
  const decision = runConversationRouters({
    turn_frame: turnFrame({
      safety: {
        risk_band: "medium",
        reason_codes: ["worthlessness_thoughts"],
        evidence: [],
      },
    }),
    safety_context_risk_band: "none",
    restriction_guard: { restriction_flag: true },
  });
  assertEquals(decision.response_owner, "disordered_eating_guard");
});

Deno.test("routing — an active flow continues even without a fresh flag", () => {
  const decision = runConversationRouters({
    turn_frame: turnFrame(),
    active_skill_state: {
      skill_id: "disordered_eating_guard",
      status: "active",
    },
    safety_context_risk_band: "none",
    restriction_guard: { restriction_flag: false },
  });
  assertEquals(decision.response_owner, "disordered_eating_guard");
  assertEquals(decision.reason_code, "active_disordered_eating_guard");
  assertEquals(decision.direct_effects_to_run, []);
});

Deno.test("routing — FALSE PREMISE: a clear floor changes nothing", () => {
  // The disarm condition of the whole belt. Same turn, flag down: the ordinary
  // route wins, exactly as before this lot existed.
  for (
    const guard of [
      undefined,
      null,
      { restriction_flag: false },
    ]
  ) {
    const decision = runConversationRouters({
      turn_frame: turnFrame({
        skill_signals: {
          product_help: { detected: true, confidence_band: "high" },
        },
      }),
      safety_context_risk_band: "none",
      restriction_guard: guard,
    });
    assertEquals(decision.response_owner, "product_help");
  }
});

Deno.test("routing — the flag is NOT reachable through the turn frame", () => {
  // The dispatcher LLM writes the turn frame. If it could raise or lower this
  // flag from there, the floor would be a suggestion. There is deliberately no
  // `skill_signals.disordered_eating_guard`, and a forged one is inert.
  const decision = runConversationRouters({
    turn_frame: turnFrame({
      skill_signals: {
        // deno-lint-ignore no-explicit-any
        disordered_eating_guard: { detected: true, confidence_band: "critical" } as any,
      },
      // deno-lint-ignore no-explicit-any
      restriction_guard: { restriction_flag: true } as any,
    }),
    safety_context_risk_band: "none",
  });
  assertEquals(decision.response_owner, "normal_reply");
});

// ---------------------------------------------------------------------------
// Fail-open belt: the route exists, the runtime handler does not (yet)
// ---------------------------------------------------------------------------

Deno.test("routing — the floor is ARMED and EXECUTED in conversation, never served as a normal reply", async () => {
  // W4.7 — THE BELT IS INVERTED, and the flip is the point.
  //
  // W3.2 asserted "nothing arms the floor yet, and if anything did, run.ts
  // refuses loudly". Its disarm condition was explicit: the throw disappears
  // when the handler exists. The handler exists, so this test now proves the
  // OPPOSITE — a version still asserting "no call site arms restriction_guard"
  // would go green on a floor that had silently gone inert again, which is
  // exactly the class of self-defeating verification W2 found in
  // `ultimate.int.test.ts`.
  //
  //   1. The floor IS armed, on EVERY `runConversationRouters` call site.
  //   2. The owner IS executed by `run.ts` (`runDisorderedEatingGuardSkill`),
  //      and the fall-through into the generic companion composer stays
  //      closed. Degrading a suspension of adherence pressure into a normal
  //      adherence reply is the harm, not a shortfall.
  const runSource = await Deno.readTextFile(
    new URL("../../router/run.ts", import.meta.url),
  );

  // (1) Every call site arms the floor, through the single shared builder.
  const callSites = runSource.split("runConversationRouters({").slice(1);
  assertEquals(callSites.length, 4, "run.ts call-site count changed");
  for (const site of callSites) {
    const args = site.slice(0, site.indexOf("});"));
    assert(
      args.includes("...keelRoutingInputs()"),
      "a runConversationRouters call site stopped arming the KEEL inputs: the " +
        "restriction floor is inert on that path",
    );
  }
  assert(
    /const keelRoutingInputs = \(\) => \(\{[\s\S]{0,400}?restriction_guard:/.test(
      runSource,
    ),
    "keelRoutingInputs no longer supplies restriction_guard",
  );
  // The floor is computed from the DATABASE, never read from the turn frame:
  // the entry condition of a clinical flow must not travel through a model.
  assert(
    runSource.includes("evaluateRestrictionForStudent("),
    "run.ts no longer evaluates the restriction guard against the database",
  );

  // (2) The owner is handled, and the handler executes the skill.
  const handlerIndex = runSource.indexOf(
    'if (routeDecision.response_owner === "disordered_eating_guard") {',
  );
  assert(handlerIndex > 0, "run.ts lost its disordered_eating_guard branch");
  assert(
    runSource.slice(handlerIndex).includes("runDisorderedEatingGuardSkill({"),
    "the disordered_eating_guard branch no longer executes the skill — the " +
      "route would fall through to the generic composer",
  );

  // (3) The inverted belt: reaching the composer with this owner still throws.
  assert(
    /finalResponseOwner === "disordered_eating_guard"[\s\S]{0,200}?throw new Error\(/
      .test(runSource),
    "run.ts lost the inverted anti-fail-open belt on the " +
      "disordered_eating_guard route",
  );
});
