// PIVOT NUTRITION §3.2 — meal_photo_flow.ts.
//
// The tests that carry the doctrine:
//   * "the escape hatch works from EVERY state, unconditionally"
//     -- §3.3bis: a flow that holds a user against their intent is a design
//        bug, not an edge case. This repo has paid for it twice.
//   * "answering the question AMENDS the event, it never logs a second one"
//     -- §7.4 J1 evening. Otherwise the student ate once and the protocol
//        counts twice, inflating the metric that actually predicts outcome.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  MEAL_PHOTO_INTENTS,
  MEAL_PHOTO_MAX_TURNS,
  MEAL_PHOTO_STATES,
  MEAL_PHOTO_TIMEOUT_MINUTES,
  type MealPhotoFlowState,
  openMealPhotoFlow,
  reduceMealPhotoFlow,
} from "./meal_photo_flow.ts";

const NOW = new Date("2026-07-27T20:00:00.000Z");
const EVENT = "evt-1";

function flow(over: Partial<MealPhotoFlowState> = {}): MealPhotoFlowState {
  return {
    state: "awaiting_clarification",
    eventId: EVENT,
    turns: 0,
    openedAt: new Date(NOW.getTime() - 60_000).toISOString(),
    question: "Did you cook these with oil?",
    ...over,
  };
}

// ---------------------------------------------------------------------------
// THE CASE THE FLOW EXISTS FOR
// ---------------------------------------------------------------------------

Deno.test("answering the question AMENDS the event, it never logs a second one", () => {
  const d = reduceMealPhotoFlow({ flow: flow(), intent: "answers_question", now: NOW });
  assertEquals(d.kind, "amend_event");
  if (d.kind !== "amend_event") return;
  assertEquals(d.eventId, EVENT);
  assertEquals(d.amendment, "answer");
  // And the flow closes: the question is answered, there is nothing left to
  // hold the student for.
  assertEquals(d.nextFlow.state, "closed");
});

Deno.test("a correction also amends, and is distinguishable from an answer", () => {
  const d = reduceMealPhotoFlow({ flow: flow(), intent: "corrects_analysis", now: NOW });
  assertEquals(d.kind, "amend_event");
  if (d.kind !== "amend_event") return;
  assertEquals(d.amendment, "correction");
});

// ---------------------------------------------------------------------------
// THE ESCAPE HATCH
// ---------------------------------------------------------------------------

Deno.test("the escape hatch works from EVERY state, unconditionally", () => {
  for (const state of MEAL_PHOTO_STATES) {
    const d = reduceMealPhotoFlow({
      flow: flow({ state }),
      intent: "unrelated",
      now: NOW,
    });
    assertEquals(d.kind, "exit", `state ${state} trapped the student`);
    if (d.kind === "exit") assertEquals(d.reason, "topic_changed");
  }
});

Deno.test("the escape hatch fires BEFORE timeout and max-turns", () => {
  // Ordering matters: if timeout were checked first, an expired flow would
  // report `timeout` for a student who simply changed subject — a wrong reason
  // in the trace, and a step towards checking other things first too.
  const d = reduceMealPhotoFlow({
    flow: flow({
      turns: 99,
      openedAt: new Date(NOW.getTime() - 10 * 3600_000).toISOString(),
    }),
    intent: "unrelated",
    now: NOW,
  });
  if (d.kind === "exit") assertEquals(d.reason, "topic_changed");
});

Deno.test("a crisis turn closes the flow before anything else", () => {
  for (const band of ["low", "medium", "high", "critical"] as const) {
    const d = reduceMealPhotoFlow({
      flow: flow(),
      intent: "answers_question",
      safetyBand: band,
      now: NOW,
    });
    assertEquals(d.kind, "exit", band);
    if (d.kind === "exit") assertEquals(d.reason, "safety");
  }
});

// ---------------------------------------------------------------------------
// BOUNDS
// ---------------------------------------------------------------------------

Deno.test("a new photo closes the old flow instead of capturing the new one", () => {
  const d = reduceMealPhotoFlow({ flow: flow(), intent: "new_photo", now: NOW });
  assertEquals(d.kind, "exit");
  if (d.kind === "exit") assertEquals(d.reason, "new_photo");
});

Deno.test("past the window, it is no longer the same photo", () => {
  const late = new Date(NOW.getTime() + (MEAL_PHOTO_TIMEOUT_MINUTES + 1) * 60_000);
  const d = reduceMealPhotoFlow({ flow: flow(), intent: "answers_question", now: late });
  assertEquals(d.kind, "exit");
  if (d.kind === "exit") assertEquals(d.reason, "timeout");
  // The point: amending a two-hour-old fact on an ambiguous message would
  // overwrite real data with a guess.
});

Deno.test("max turns is a bound, and it is two", () => {
  assertEquals(MEAL_PHOTO_MAX_TURNS, 2);
  const d = reduceMealPhotoFlow({
    flow: flow({ turns: MEAL_PHOTO_MAX_TURNS }),
    intent: "answers_question",
    now: NOW,
  });
  assertEquals(d.kind, "exit");
  if (d.kind === "exit") assertEquals(d.reason, "max_turns");
});

Deno.test("an unclassified message does NOT guess, it waits one turn", () => {
  // §3.3bis: of guess / clarify / proceed-while-saying-so, guessing is the
  // forbidden one. Staying lets the global dispatcher answer normally.
  const d = reduceMealPhotoFlow({ flow: flow(), intent: "unknown", now: NOW });
  assertEquals(d.kind, "stay");
  if (d.kind === "stay") assertEquals(d.nextFlow.turns, 1);

  // ... and it cannot wait forever: the next unknown hits max-turns.
  const again = reduceMealPhotoFlow({
    flow: flow({ turns: 2 }),
    intent: "unknown",
    now: NOW,
  });
  assertEquals(again.kind, "exit");
});

Deno.test("a closed flow never reopens", () => {
  for (const intent of MEAL_PHOTO_INTENTS) {
    const d = reduceMealPhotoFlow({
      flow: flow({ state: "closed" }),
      intent,
      now: NOW,
    });
    assertEquals(d.kind, "exit", intent);
  }
});

// ---------------------------------------------------------------------------
// OPENING
// ---------------------------------------------------------------------------

Deno.test("the opening state says whether a question is outstanding", () => {
  // The renderer must not re-ask a question it never asked.
  const withQuestion = openMealPhotoFlow({ eventId: EVENT, question: "Oil?", now: NOW });
  assertEquals(withQuestion.state, "awaiting_clarification");
  const without = openMealPhotoFlow({ eventId: EVENT, question: null, now: NOW });
  assertEquals(without.state, "awaiting_correction");
  assertEquals(without.turns, 0);
  assertEquals(without.eventId, EVENT);
});

Deno.test("a student can still correct even when no question was asked", () => {
  const d = reduceMealPhotoFlow({
    flow: openMealPhotoFlow({ eventId: EVENT, question: null, now: NOW }),
    intent: "corrects_analysis",
    now: NOW,
  });
  assertEquals(d.kind, "amend_event");
});

Deno.test("this module never reads message text (no semantic regex can hide here)", async () => {
  // §3.1: the reducer receives an already-classified intent. A module that
  // cannot see the text cannot grow a regex that interprets a human.
  const src = await Deno.readTextFile(new URL("./meal_photo_flow.ts", import.meta.url));
  assert(!/\.match\(|RegExp\(|\/\^|toLowerCase\(\)/.test(src), "text inspection crept in");
});
