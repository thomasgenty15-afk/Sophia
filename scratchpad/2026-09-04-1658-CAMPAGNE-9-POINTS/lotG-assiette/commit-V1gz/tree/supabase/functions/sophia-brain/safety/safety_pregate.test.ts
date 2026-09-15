import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import type { RiskBand } from "../contracts/turn_frame.v1.ts";
import { isAtLeast } from "./safety_thresholds.ts";
import {
  runSafetyPregate,
  SAFETY_PREGATE_VERSION,
  safetyPregateTrace,
} from "./safety_pregate.ts";
import { initialSafetyContext } from "./safety_context.ts";
import { SAFETY_LEXICON } from "./safety_lexicon.ts";
import {
  PREGATE_FALSE_POSITIVES,
  PREGATE_KNOWN_LIMITATIONS,
  PREGATE_TRUE_POSITIVES,
} from "./safety_pregate.fixtures.ts";

Deno.test("pregate: true positives EN + FR reach at least their floor", () => {
  for (const fixture of PREGATE_TRUE_POSITIVES) {
    const out = runSafetyPregate({ user_message: fixture.message });
    assertEquals(
      out.risk_band,
      fixture.expected_band,
      `${fixture.id}: expected ${fixture.expected_band}, got ${out.risk_band} (${
        JSON.stringify(out.matches.map((m) => m.entry_id))
      })`,
    );
    assertEquals(out.detected, true, `${fixture.id}: detected`);
    if (fixture.expected_entry) {
      assert(
        out.matches.some((m) => m.entry_id === fixture.expected_entry),
        `${fixture.id}: expected entry ${fixture.expected_entry}, got ${
          JSON.stringify(out.matches.map((m) => m.entry_id))
        }`,
      );
    }
    assert(out.evidence.length > 0, `${fixture.id}: evidence present`);
    assert(out.reason_codes.length > 0, `${fixture.id}: reason_codes present`);
  }
});

Deno.test("pregate: false positives stay at none", () => {
  for (const fixture of PREGATE_FALSE_POSITIVES) {
    const out = runSafetyPregate({ user_message: fixture.message });
    assertEquals(
      out.risk_band,
      "none",
      `${fixture.id}: fired ${out.risk_band} on ${
        JSON.stringify(out.matches.map((m) => m.entry_id))
      }`,
    );
    assertEquals(out.detected, false, `${fixture.id}: detected`);
    if (fixture.expected_disarm) {
      assert(
        out.disarmed.some((d) => d.condition === fixture.expected_disarm),
        `${fixture.id}: expected disarm ${fixture.expected_disarm}, got ${
          JSON.stringify(out.disarmed)
        }`,
      );
    }
  }
});

Deno.test("pregate: known limitations remain out of scope, on purpose", () => {
  for (const fixture of PREGATE_KNOWN_LIMITATIONS) {
    const out = runSafetyPregate({ user_message: fixture.message });
    assertEquals(
      out.risk_band,
      "none",
      `${fixture.id} started firing (${out.risk_band}). If that is intended, ` +
        "move it out of PREGATE_KNOWN_LIMITATIONS deliberately.",
    );
  }
});

Deno.test("pregate: reason codes stay inside the canonical dispatcher vocabulary", () => {
  // routers/routers.ts branches on these EXACT strings; a free synonym would
  // give a blocked turn nobody can route.
  const canonical = new Set([
    "suicidal_ideation",
    "suicidal_ideation_passive",
    "self_harm_intent",
    "worthlessness_thoughts",
    "hopelessness",
    "emotional_distress",
  ]);
  for (const entry of SAFETY_LEXICON) {
    assert(
      canonical.has(entry.reason_code),
      `${entry.id}: non-canonical reason_code ${entry.reason_code}`,
    );
  }
});

Deno.test("pregate: floors are ordered by cluster severity", () => {
  const expected: Record<string, RiskBand> = {
    suicidal_intent_active: "high",
    self_harm_intent: "high",
    suicidal_ideation_passive: "medium",
    distress_acute: "low",
  };
  for (const entry of SAFETY_LEXICON) {
    assertEquals(
      entry.floor,
      expected[entry.cluster],
      `${entry.id}: floor ${entry.floor} for cluster ${entry.cluster}`,
    );
  }
});

Deno.test("pregate: distress floor blocks nothing (low is traceable, not blocking)", () => {
  const out = runSafetyPregate({ user_message: "je sers a rien" });
  assertEquals(out.risk_band, "low");
  assertEquals(out.allow_side_effects, true);
});

Deno.test("pregate: danger-to-life floors block side effects", () => {
  for (const message of ["j'ai envie de mourir", "i want to kill myself"]) {
    const out = runSafetyPregate({ user_message: message });
    assert(isAtLeast(out.risk_band, "medium"), message);
    assertEquals(out.allow_side_effects, false, message);
  }
});

Deno.test("pregate: imminence and means escalate, never de-escalate", () => {
  const plain = runSafetyPregate({ user_message: "je vais me tuer" });
  assertEquals(plain.risk_band, "high");
  assertEquals(plain.matches[0].escalation, null);

  const imminent = runSafetyPregate({
    user_message: "je vais me tuer ce soir",
  });
  assertEquals(imminent.risk_band, "critical");
  assertEquals(imminent.matches[0].escalation, "imminence");

  const means = runSafetyPregate({
    user_message: "j'ai une corde, je vais me pendre",
  });
  assertEquals(means.risk_band, "critical");

  // Passive ideation escalates on MEANS only: a bedtime marker is not a plan.
  const passiveTonight = runSafetyPregate({
    user_message: "j'ai envie de mourir ce soir",
  });
  assertEquals(passiveTonight.risk_band, "medium");
  const passiveMeans = runSafetyPregate({
    user_message: "j'ai envie de mourir, j'ai les cachets devant moi",
  });
  assertEquals(passiveMeans.risk_band, "high");
});

Deno.test("pregate: `ne ... plus` is the aggravated reading, not a negation", () => {
  // The single most expensive false negative available: French negates with
  // `ne ... pas`, but `ne ... plus envie de vivre` means the will is GONE.
  const out = runSafetyPregate({ user_message: "je n'ai plus envie de vivre" });
  assertEquals(out.risk_band, "medium");
  assertEquals(out.disarmed.length, 0);
});

Deno.test("pregate: a control-loss escalator re-arms the belt over a negation", () => {
  const negated = runSafetyPregate({
    user_message: "je ne vais pas me faire du mal",
  });
  assertEquals(negated.risk_band, "none");

  const escalated = runSafetyPregate({
    user_message: "je sais pas comment ne pas me faire du mal ce soir",
  });
  assertEquals(escalated.risk_band, "critical");
});

Deno.test("pregate: the floor reads the CURRENT message only", () => {
  // Dispatcher rule 1d-bis (a). A floor fed by history could never be lowered
  // by anything the user says next.
  const out = runSafetyPregate({
    user_message: "ok merci, je vais faire ma marche",
    recent_messages: [
      { role: "user", content: "je veux me suicider" },
      { role: "assistant", content: "je suis la" },
    ],
  });
  assertEquals(out.risk_band, "none");
});

Deno.test("pregate: multi-sentence message takes the max floor", () => {
  const out = runSafetyPregate({
    user_message:
      "j'ai fait ma marche ce matin. je sers a rien. je veux me suicider.",
  });
  assertEquals(out.risk_band, "high");
  assert(out.clusters.includes("distress_acute"));
  assert(out.clusters.includes("suicidal_intent_active"));
});

Deno.test("pregate: pure function, no hidden regex state across calls", () => {
  const message = "i want to kill myself";
  const first = runSafetyPregate({ user_message: message });
  for (let i = 0; i < 5; i += 1) {
    const again = runSafetyPregate({ user_message: message });
    assertEquals(again.risk_band, first.risk_band, `run ${i}`);
    assertEquals(
      again.matches.map((m) => m.entry_id),
      first.matches.map((m) => m.entry_id),
      `run ${i}`,
    );
  }
});

Deno.test("pregate: empty / whitespace / undefined message is neutral", () => {
  for (const message of ["", "   ", "\n\n"]) {
    const out = runSafetyPregate({ user_message: message });
    assertEquals(out.risk_band, "none");
    assertEquals(out.detected, false);
    assertEquals(out.layer_contributions.lexical, false);
  }
});

Deno.test("pregate: diacritics, curly quotes and casing are normalized", () => {
  const variants = [
    "J'ai envie de mourir",
    "j’ai envie de mourir",
    "J'AI ENVIE DE MOURIR",
    "j'ai envie de mourír",
  ];
  for (const message of variants) {
    assertEquals(
      runSafetyPregate({ user_message: message }).risk_band,
      "medium",
      message,
    );
  }
});

Deno.test("pregate trace: carries version, floor and the fired belt", () => {
  const pregate = runSafetyPregate({ user_message: "i want to kill myself" });
  const trace = safetyPregateTrace(pregate, {
    llm_band: "none",
    final_band: "high",
    floor_applied: true,
  });
  assertEquals(trace.version, SAFETY_PREGATE_VERSION);
  assertEquals(trace.detected, true);
  assertEquals(trace.floor_band, "high");
  assertEquals(trace.llm_band, "none");
  assertEquals(trace.final_band, "high");
  assertEquals(trace.floor_applied, true);
  assertEquals(trace.matches[0].entry_id, "en_kill_self");
  // The trace must be JSON-serializable: it is written to a jsonb column.
  assertEquals(typeof JSON.stringify(trace), "string");
});

Deno.test("pregate trace: a disarmed belt is still traced (trigger-rate measurement)", () => {
  const pregate = runSafetyPregate({
    user_message: "i hurt myself at the gym yesterday",
  });
  const trace = safetyPregateTrace(pregate);
  assertEquals(trace.detected, false);
  assertEquals(trace.floor_band, "none");
  assertEquals(trace.disarmed[0].entry_id, "en_self_harm");
  assertEquals(trace.disarmed[0].condition, "effort_or_accident_register");
});

Deno.test("safety context: no longer a stub — it publishes the pregate band", () => {
  const stubbed = initialSafetyContext({ channel: "whatsapp" });
  assertEquals(stubbed.risk_band, "none");
  assertEquals(stubbed.allow_side_effects, true);

  const real = initialSafetyContext({
    channel: "whatsapp",
    user_message: "je veux me suicider ce soir",
  });
  assertEquals(real.risk_band, "critical");
  assertEquals(real.detected, true);
  assertEquals(real.allow_side_effects, false);
  assertEquals(real.layer_contributions.lexical, true);
  assertEquals(real.layer_contributions.dispatcher_llm, false);
  assertEquals(real.reason_codes, ["suicidal_ideation"]);
  assertEquals(real.pregate?.version, SAFETY_PREGATE_VERSION);
});
