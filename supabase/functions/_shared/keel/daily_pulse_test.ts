// PIVOT NUTRITION — N2: daily_pulse.ts.
//
// The test that carries the product decision:
//   * "activity never suppresses the question"
//     -- photos say WHAT was eaten, the tap says WHETHER THE PROTOCOL IS
//        LIVABLE. Letting one suppress the other hides exactly the case we are
//        looking for: a student who logs perfectly and is exhausted.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  decideDailyPulse,
  needsAxisFollowUp,
  type PulseDecisionInput,
  PULSE_AXES,
  PULSE_LEVELS,
  pulseAxisButtonId,
  pulseAxisButtons,
  pulseLevelButtonId,
  pulseLevelButtons,
  readPulseReply,
  renderPulseAck,
  renderPulseAxisQuestion,
  renderPulseQuestion,
} from "./daily_pulse.ts";

function input(over: Partial<PulseDecisionInput> = {}): PulseDecisionInput {
  return {
    localHour: 20,
    answeredToday: false,
    minutesSinceLastExchange: null,
    hasActivePlan: true,
    ...over,
  };
}

// ---------------------------------------------------------------------------
// THE DECISION
// ---------------------------------------------------------------------------

Deno.test("activity never suppresses the question, it only changes the envelope", () => {
  // A student who sent three photos today has great coverage and may be
  // exhausted. The photos and the tap measure different things.
  const busy = decideDailyPulse(input({ minutesSinceLastExchange: 5 }));
  assertEquals(busy.decision, "send");
  if (busy.decision === "send") assertEquals(busy.mode, "attach");

  const quiet = decideDailyPulse(input({ minutesSinceLastExchange: 400 }));
  assertEquals(quiet.decision, "send");
  if (quiet.decision === "send") assertEquals(quiet.mode, "standalone");

  // Never a `skip` for being active — that is the whole point.
  for (const mins of [0, 1, 29, 30, 31, 1000]) {
    assertEquals(
      decideDailyPulse(input({ minutesSinceLastExchange: mins })).decision,
      "send",
      `${mins} min`,
    );
  }
});

Deno.test("one tap per day", () => {
  const d = decideDailyPulse(input({ answeredToday: true }));
  assertEquals(d.decision, "skip");
  if (d.decision === "skip") assertEquals(d.reason, "already_answered_today");
});

Deno.test("the evening window is 20h-22h local, and outside it nothing happens", () => {
  for (const h of [20, 21]) {
    assertEquals(decideDailyPulse(input({ localHour: h })).decision, "send", `${h}h`);
  }
  for (const h of [8, 19, 22, 23]) {
    const d = decideDailyPulse(input({ localHour: h }));
    assertEquals(d.decision, "skip", `${h}h`);
    if (d.decision === "skip") assertEquals(d.reason, "outside_window");
  }
  // An unreadable hour never sends: no spam on missing data.
  assertEquals(decideDailyPulse(input({ localHour: Number.NaN })).decision, "skip");
});

Deno.test("a crisis turn gets no 'how was your day'", () => {
  for (const band of ["low", "medium", "high", "critical"] as const) {
    const d = decideDailyPulse(input({ safetyBand: band }));
    assertEquals(d.decision, "skip", band);
    if (d.decision === "skip") assertEquals(d.reason, "safety_active");
  }
});

Deno.test("the gate order holds: opt-out outranks safety outranks the rest", () => {
  const d = decideDailyPulse(
    input({ optedOut: true, safetyBand: "high", hasActivePlan: false, answeredToday: true }),
  );
  if (d.decision === "skip") assertEquals(d.reason, "opted_out");

  const s = decideDailyPulse(
    input({ safetyBand: "high", hasActivePlan: false, answeredToday: true }),
  );
  if (s.decision === "skip") assertEquals(s.reason, "safety_active");
});

// ---------------------------------------------------------------------------
// THE BUTTONS — Meta's hard limits
// ---------------------------------------------------------------------------

Deno.test("exactly 3 buttons, titles under 20 chars (Meta's cap)", () => {
  for (const set of [pulseLevelButtons(), pulseAxisButtons()]) {
    assertEquals(set.length, 3);
    for (const b of set) {
      assert(b.title.length <= 20, `${b.title} is ${b.title.length} chars`);
      assert(b.id.length > 0);
    }
  }
});

Deno.test("button ids round-trip through the reply reader", () => {
  for (const level of PULSE_LEVELS) {
    assertEquals(readPulseReply(pulseLevelButtonId(level)), { kind: "level", level });
  }
  for (const axis of PULSE_AXES) {
    assertEquals(readPulseReply(pulseAxisButtonId(axis)), { kind: "axis", axis });
  }
});

Deno.test("the reader is DETERMINISTIC and refuses free text", () => {
  // §3.1: exact identifiers are deterministic; meaning goes to the LLM. A text
  // fallback would let a conversational 'moyen' be read as a tap answer.
  for (const notAButton of ["moyen", "Ça roule", "", null, undefined, "KEEL_PULSE_", "KEEL_PULSE_WAT"]) {
    assertEquals(readPulseReply(notAButton as string).kind, "none", String(notAButton));
  }
});

// ---------------------------------------------------------------------------
// THE AXIS FOLLOW-UP
// ---------------------------------------------------------------------------

Deno.test("the axis is asked ONLY when something went wrong", () => {
  assertEquals(needsAxisFollowUp("good"), false);
  assertEquals(needsAxisFollowUp("mixed"), true);
  assertEquals(needsAxisFollowUp("hard"), true);
});

Deno.test("the two questions render with their buttons", () => {
  const q = renderPulseQuestion();
  assertEquals(q.body, "How was today?");
  assertEquals(q.buttons.map((b) => b.title), ["All good", "So-so", "Rough"]);
  const a = renderPulseAxisQuestion();
  assertEquals(a.body, "What was hard?");
  assertEquals(a.buttons.map((b) => b.title), ["Energy", "Hunger", "Sleep"]);
});

Deno.test("every button title fits Meta's 20-character ceiling", () => {
  // `whatsapp-send` tronque silencieusement au-delà. Un libellé tronqué serait
  // à la fois moche et DIFFÉRENT de celui du template Meta approuvé, donc deux
  // expériences selon qu'on est dans la fenêtre 24h ou non.
  for (const b of [...pulseLevelButtons(), ...pulseAxisButtons()]) {
    assert(b.title.length <= 20, `${b.title} is ${b.title.length} chars`);
  }
});

Deno.test("the ack never comments, consoles or bounces back", () => {
  // 'Dur' followed by 'courage, demain ira mieux' is ungrounded tenderness —
  // proscribed by the repo's own doctrine, and unbearable daily.
  const acks = [
    renderPulseAck("good", null),
    renderPulseAck("hard", "hunger"),
    renderPulseAck("mixed", "sleep"),
  ];
  for (const ack of acks) {
    assert(ack.length <= 20, ack);
    assert(!/courage|demain|bravo|dommage|essaie/i.test(ack), ack);
  }
});
