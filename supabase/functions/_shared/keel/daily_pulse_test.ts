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
  pulseTemplateButtonComponents,
  readPulseReply,
  renderPulseAck,
  renderPulseAxisQuestion,
  renderPulseQuestion,
} from "./daily_pulse.ts";

function input(over: Partial<PulseDecisionInput> = {}): PulseDecisionInput {
  return {
    localHour: 20,
    answeredToday: false,
    askedToday: false,
    minutesSinceLastExchange: null,
    safetyBand: null,
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

Deno.test("silence is not a request for a reminder: one ASK per day", () => {
  // Regression, QA agent 7 (2026-08-03). The window is two hours wide and the
  // cron is hourly, so there are two ticks inside it. With `answeredToday` as
  // the only gate, a student who did not answer got "How was today?" at 20:10
  // AND at 21:10 — proven in local with two `keel_daily_pulse` outbound rows on
  // the same local day for one silent student.
  const d = decideDailyPulse(input({ answeredToday: false, askedToday: true }));
  assertEquals(d.decision, "skip");
  if (d.decision === "skip") assertEquals(d.reason, "already_asked_today");

  // ...AND ITS DISARMING CONDITION. The belt must not bite when the premise is
  // false: nothing sent today means the question still goes out. A gate that
  // can only ever say no is a gate that silently kills the feature.
  assertEquals(
    decideDailyPulse(input({ answeredToday: false, askedToday: false })).decision,
    "send",
  );
  // And it does not leak across days: `askedToday` is computed against the
  // student's local date, so a question sent yesterday leaves today open.
  assertEquals(
    decideDailyPulse(input({ localHour: 21, askedToday: false })).decision,
    "send",
  );
});

Deno.test("answered outranks asked: the two make different days for the coach", () => {
  const d = decideDailyPulse(input({ answeredToday: true, askedToday: true }));
  assertEquals(d.decision, "skip");
  // "He answered" and "we asked and got nothing" are not the same day, and the
  // job's counter is what tells them apart.
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

  // ...and "nothing to follow" still outranks both day-gates. A student with no
  // adopted plan is not "already asked", he is out of scope entirely.
  const p = decideDailyPulse(
    input({ hasActivePlan: false, answeredToday: true, askedToday: true }),
  );
  if (p.decision === "skip") assertEquals(p.reason, "no_active_plan");
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

Deno.test("the labels are PINNED: they must match the approved Meta template", () => {
  // These five strings exist twice: here, and in the `keel_daily_pulse_v1`
  // template submitted to Meta (docs/nutrition-pivot/META-TEMPLATES.md).
  // Inside the 24h window our code renders the message; outside it Meta's
  // template does. A rename here that "reads better" silently gives the same
  // student two different products depending on the hour — and the template
  // cannot be re-approved as fast as a string is edited.
  assertEquals(renderPulseQuestion().body, "How was today?");
  assertEquals(pulseLevelButtons().map((b) => b.title), [
    "All good",
    "So-so",
    "Rough",
  ]);
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

// ---------------------------------------------------------------------------
// Le repli template hors fenêtre 24h
// ---------------------------------------------------------------------------

Deno.test("the template payloads follow the SAME order as the native buttons", () => {
  // Le contrat le plus silencieux du pivot. Meta ne renvoie pas le libellé du
  // bouton tapé, il renvoie le payload attaché à son INDEX. Deux boutons
  // inversés entre le template et le rendu natif = « Rough » enregistré pour
  // un élève qui a tapé « All good », sans erreur et sans trace.
  const buttons = pulseLevelButtons();
  const components = pulseTemplateButtonComponents(buttons) as Array<
    Record<string, unknown>
  >;
  assertEquals(components.length, buttons.length);
  components.forEach((component, index) => {
    assertEquals(component.type, "button");
    assertEquals(component.sub_type, "quick_reply");
    // L'index part en CHAÎNE chez Meta. Un nombre y est refusé.
    assertEquals(component.index, String(index));
    const params = component.parameters as Array<Record<string, unknown>>;
    assertEquals(params.length, 1);
    assertEquals(params[0].type, "payload");
    assertEquals(params[0].payload, buttons[index].id);
  });
});

Deno.test("the template carries the payloads the reader actually accepts", () => {
  // Un payload que `readPulseReply` ne sait pas lire est un tap perdu: l'élève
  // a répondu, le produit n'a rien enregistré.
  const components = pulseTemplateButtonComponents(pulseLevelButtons()) as Array<
    Record<string, unknown>
  >;
  for (const component of components) {
    const params = component.parameters as Array<Record<string, unknown>>;
    const reply = readPulseReply(String(params[0].payload));
    assert(reply, `payload ${params[0].payload} unreadable`);
  }
});

Deno.test("PRÉMISSE FAUSSE: no buttons, no components — never a bare index", () => {
  assertEquals(pulseTemplateButtonComponents([]), []);
});
