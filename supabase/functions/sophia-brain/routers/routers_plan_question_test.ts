/**
 * KEEL W4.4 — routing of the `plan_question` lane.
 *
 * The load-bearing assertion is the ORDER: a swap question must not be caught
 * by `plan_realignment`. That misroute sends a student who is following the
 * plan to a plan-adjustment screen for a question the coach already answered
 * when they wrote `autonomy` and `swap_policy` — the same class of misroute
 * this repo already paid for on read-only recaps.
 */

import { assertEquals } from "jsr:@std/assert@1";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";
import { runConversationRouters } from "./routers.ts";

function frame(patch: Partial<TurnFrame> = {}): TurnFrame {
  return {
    turn_id: "turn-1",
    source_message_id: "msg-1",
    user_id: "student-1",
    channel: "web",
    safety: { risk_band: "none", reason_codes: [], evidence: [] },
    direct_effects: [],
    skill_signals: {},
    memory_plan: {
      context_need: "minimal",
      memory_mode: "none",
      context_budget_tier: "tiny",
      targets: [],
      retrieval_policy: "semantic_first",
    },
    ...patch,
  } as TurnFrame;
}

const planQuestionSignal = {
  detected: true,
  confidence_band: "high" as const,
  context: {
    kind: "food_swap" as const,
    requested_food_group: "other_fruit",
    prescribed_food_group: "berries",
    reason: "swap request",
  },
};

Deno.test("plan_question routes for a KEEL student", () => {
  const decision = runConversationRouters({
    turn_frame: frame({ skill_signals: { plan_question: planQuestionSignal } }),
    safety_context_risk_band: "none",
    keel_student: true,
  });
  assertEquals(decision.response_owner, "plan_question");
  assertEquals(decision.reason_code, "plan_question_signal");
});

Deno.test("plan_question does NOT route without the keel_student gate", () => {
  // The gate is computed by the runtime from `profiles.keel_role`, never read
  // from the turn frame: a legacy user has no commitments and no swap policy,
  // so the lane could only answer from nothing.
  for (const gate of [undefined, false]) {
    const decision = runConversationRouters({
      turn_frame: frame({ skill_signals: { plan_question: planQuestionSignal } }),
      safety_context_risk_band: "none",
      keel_student: gate,
    });
    assertEquals(decision.response_owner, "normal_reply");
  }
});

Deno.test("plan_question outranks plan_realignment, and stays under product_help/coaching", () => {
  const realign = {
    detected: true,
    confidence_band: "high" as const,
    context: {
      drift_type: "changed_context" as const,
      scope: "week" as const,
      explicit_adjust_request: false,
      product_execution_allowed: false as const,
      reason: "drift",
    },
  };
  assertEquals(
    runConversationRouters({
      turn_frame: frame({
        skill_signals: { plan_question: planQuestionSignal, plan_realignment: realign },
      }),
      safety_context_risk_band: "none",
      keel_student: true,
    }).response_owner,
    "plan_question",
  );

  // The two lanes above are explicit pulls and keep priority.
  assertEquals(
    runConversationRouters({
      turn_frame: frame({
        skill_signals: {
          plan_question: planQuestionSignal,
          product_help: { detected: true, confidence_band: "high" },
        },
      }),
      safety_context_risk_band: "none",
      keel_student: true,
    }).response_owner,
    "product_help",
  );
});

Deno.test("a low-confidence plan_question signal never opens the lane", () => {
  assertEquals(
    runConversationRouters({
      turn_frame: frame({
        skill_signals: {
          plan_question: { ...planQuestionSignal, confidence_band: "low" },
        },
      }),
      safety_context_risk_band: "none",
      keel_student: true,
    }).response_owner,
    "normal_reply",
  );
});

Deno.test("safety and the restriction floor both outrank plan_question", () => {
  // Nothing is more urgent than a danger to life, and a swap answer during a
  // restriction flag is adherence pressure — the exact thing the floor suspends.
  assertEquals(
    runConversationRouters({
      turn_frame: frame({
        safety: { risk_band: "high", reason_codes: [], evidence: [] },
        skill_signals: { plan_question: planQuestionSignal },
      }),
      safety_context_risk_band: "high",
      keel_student: true,
    }).response_owner,
    "safety",
  );

  assertEquals(
    runConversationRouters({
      turn_frame: frame({ skill_signals: { plan_question: planQuestionSignal } }),
      safety_context_risk_band: "none",
      keel_student: true,
      restriction_guard: { restriction_flag: true, trigger_codes: ["compensatory_language"] },
    }).response_owner,
    "disordered_eating_guard",
  );
});

// ---------------------------------------------------------------------------
// Fail-open belt: the route exists, the runtime handler does not (yet)
// ---------------------------------------------------------------------------

Deno.test("routing — plan_question is ARMED and EXECUTED, never served as a normal reply", async () => {
  // W4.7 — THE BELT IS INVERTED.
  //
  // W4.4 asserted the opposite of what it asserts now, and the flip is the
  // point: the belt's condition was "the day a lot arms `keel_student` without
  // wiring the handler, this line is the alarm". The handler is wired, so the
  // test must now prove BOTH halves of the invariant at once — a version that
  // still checked "nothing arms the gate" would go green on a lane that had
  // silently gone inert again (the failure mode W2 found in
  // `ultimate.int.test.ts`, where the verification proved the reverse of what
  // it claimed).
  //
  //   1. The gate IS armed, on EVERY `runConversationRouters` call site — a
  //      gate posed on the nominal path only is a holed gate (lesson P3), and
  //      a flow-exit re-dispatch would otherwise lose the lane on the very
  //      turn it matters.
  //   2. The owner IS executed by `run.ts` (`runPlanQuestionSkill`), and the
  //      fall-through into the generic companion composer stays closed. "Can I
  //      swap rice for pasta?" has one correct answer, already written by the
  //      coach in `autonomy` + `swap_policy`; a model improvising a "yes" that
  //      the evaluator grades `missed` at 23:59 is worse than having no lane.
  const runSource = await Deno.readTextFile(
    new URL("../router/run.ts", import.meta.url),
  );

  // (1) Every call site arms the KEEL gate, through the single shared builder.
  const callSites = runSource.split("runConversationRouters({").slice(1);
  assertEquals(callSites.length, 4, "run.ts call-site count changed");
  for (const site of callSites) {
    const args = site.slice(0, site.indexOf("});"));
    assertEquals(
      args.includes("...keelRoutingInputs()"),
      true,
      "a runConversationRouters call site stopped arming the KEEL inputs: " +
        "plan_question becomes unreachable on that path",
    );
  }
  assertEquals(
    /const keelRoutingInputs = \(\) => \(\{[\s\S]{0,400}?keel_student:/.test(
      runSource,
    ),
    true,
    "keelRoutingInputs no longer supplies keel_student",
  );

  // (2) The owner is handled, and the handler calls the skill.
  const handlerIndex = runSource.indexOf(
    'if (routeDecision.response_owner === "plan_question") {',
  );
  assertEquals(
    handlerIndex > 0,
    true,
    "run.ts lost its plan_question handler branch",
  );
  assertEquals(
    runSource.slice(handlerIndex).includes("runPlanQuestionSkill({"),
    true,
    "the plan_question branch no longer executes the skill — the route would " +
      "fall through to the generic composer",
  );
  // The runtime channel is built from the DATABASE, never from the turn frame:
  // the commitment, the swap policy and the safety constraints must not travel
  // through the dispatcher LLM on their way to a permission decision.
  assertEquals(
    runSource.includes("loadPlanQuestionRuntime({"),
    true,
    "plan_question_runtime is no longer loaded from the database",
  );

  // (3) The inverted belt: reaching the composer with this owner still throws.
  assertEquals(
    /finalResponseOwner === "plan_question"[\s\S]{0,200}?throw new Error\(/.test(
      runSource,
    ),
    true,
    "run.ts lost the inverted anti-fail-open belt on the plan_question route",
  );
});
