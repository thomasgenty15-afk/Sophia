// THE central test of W3.1: the LLM can RAISE the risk band, never LOWER it
// below the deterministic floor.

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import type { RiskBand, TurnFrame } from "../contracts/turn_frame.v1.ts";
import {
  applySafetyFloor,
  applySafetyFloorToTurnFrame,
  safetyContextWithFloor,
} from "./safety_floor.ts";
import { runSafetyPregate } from "./safety_pregate.ts";
import { initialSafetyContext } from "./safety_context.ts";
import {
  allowsSideEffects,
  blocksDirectEffects,
  blocksToolSkills,
  forcesSafetyCrisisSkill,
  isAtLeast,
} from "./safety_thresholds.ts";

const ALL_BANDS: RiskBand[] = ["none", "low", "medium", "high", "critical"];

function frameWith(
  band: RiskBand,
  reasonCodes: string[] = [],
  evidence: string[] = [],
): TurnFrame {
  return {
    turn_id: "turn_test",
    source_message_id: "msg_test",
    user_id: "user_test",
    channel: "whatsapp",
    safety: { risk_band: band, reason_codes: reasonCodes, evidence },
    direct_effects: [],
    skill_signals: {} as TurnFrame["skill_signals"],
    memory_plan: {} as TurnFrame["memory_plan"],
  };
}

Deno.test("floor: final band is exactly max(llm, floor) over the full matrix", () => {
  for (const llm of ALL_BANDS) {
    for (const floor of ALL_BANDS) {
      const merged = applySafetyFloor({ floor_band: floor, llm_band: llm });
      const expected = isAtLeast(llm, floor) ? llm : floor;
      assertEquals(
        merged.risk_band,
        expected,
        `llm=${llm} floor=${floor}`,
      );
      assert(
        isAtLeast(merged.risk_band, floor),
        `llm=${llm} floor=${floor}: result sank below the floor`,
      );
      assertEquals(
        merged.floor_applied,
        !isAtLeast(llm, floor),
        `llm=${llm} floor=${floor}: floor_applied`,
      );
    }
  }
});

Deno.test("floor: the LLM CAN raise the band", () => {
  const merged = applySafetyFloor({
    floor_band: "low",
    llm_band: "critical",
  });
  assertEquals(merged.risk_band, "critical");
  assertEquals(merged.floor_applied, false);
});

Deno.test("floor: the LLM CANNOT lower the band — a `none` frame on a critical message", () => {
  // The failure this whole lot exists to make impossible: the classifier
  // returns `none` (bad JSON, prompt drift, jailbreak, a bad day) on a message
  // that lexically carries a lethal self-directed phrase.
  const pregate = runSafetyPregate({
    user_message: "je veux me suicider ce soir",
  });
  assertEquals(pregate.risk_band, "critical");

  const llmFrame = frameWith("none", [], []);
  const guarded = applySafetyFloorToTurnFrame(llmFrame, pregate);

  assertEquals(guarded.safety.risk_band, "critical");
  assert(guarded.safety.reason_codes.includes("suicidal_ideation"));
  assert(guarded.safety.evidence.length > 0);
  // And the downstream contract actually blocks.
  assertEquals(blocksDirectEffects(guarded.safety.risk_band), true);
  assertEquals(blocksToolSkills(guarded.safety.risk_band), true);
  assertEquals(forcesSafetyCrisisSkill(guarded.safety.risk_band), true);
  assertEquals(allowsSideEffects(guarded.safety.risk_band), false);
});

Deno.test("floor: an LLM frame cannot argue a self-harm message down to `low`", () => {
  const pregate = runSafetyPregate({ user_message: "i want to hurt myself" });
  const guarded = applySafetyFloorToTurnFrame(
    frameWith("low", ["emotional_distress"]),
    pregate,
  );
  assertEquals(guarded.safety.risk_band, "high");
  assert(guarded.safety.reason_codes.includes("emotional_distress"));
  assert(guarded.safety.reason_codes.includes("self_harm_intent"));
});

Deno.test("floor: the substance-craving cap (rule 1c) does not bypass the floor", () => {
  // Rule 1c caps craving/relapse turns at `medium`. That cap constrains the
  // LLM's output; it must never pull a turn back UNDER the floor when the same
  // message also carries an explicit self-directed lethal phrase.
  const pregate = runSafetyPregate({
    user_message: "j'ai envie de fumer et je veux me suicider",
  });
  const guarded = applySafetyFloorToTurnFrame(
    frameWith("medium", ["substance_use_urge"]),
    pregate,
  );
  assertEquals(guarded.safety.risk_band, "high");
  assert(guarded.safety.reason_codes.includes("substance_use_urge"));
  assert(guarded.safety.reason_codes.includes("suicidal_ideation"));
});

Deno.test("floor: reason codes are unioned, never replaced", () => {
  const pregate = runSafetyPregate({ user_message: "je sers a rien" });
  const guarded = applySafetyFloorToTurnFrame(
    frameWith("medium", ["hopelessness"], ["a quoi bon"]),
    pregate,
  );
  // The LLM sits higher, so the band is untouched...
  assertEquals(guarded.safety.risk_band, "medium");
  // ...but the deterministic vocabulary is still carried to the routers.
  assert(guarded.safety.reason_codes.includes("hopelessness"));
  assert(guarded.safety.reason_codes.includes("worthlessness_thoughts"));
  assertEquals(
    new Set(guarded.safety.reason_codes).size,
    guarded.safety.reason_codes.length,
    "reason codes must be de-duplicated",
  );
});

Deno.test("floor: idempotent — applying it twice changes nothing", () => {
  const pregate = runSafetyPregate({ user_message: "i want to kill myself" });
  const once = applySafetyFloorToTurnFrame(frameWith("none"), pregate);
  const twice = applySafetyFloorToTurnFrame(once, pregate);
  assertEquals(twice.safety.risk_band, once.safety.risk_band);
  assertEquals(twice.safety.reason_codes, once.safety.reason_codes);
  assertEquals(twice.safety.evidence, once.safety.evidence);
  assertEquals(twice, once);
});

Deno.test("floor: a `none` pregate is a no-op, frame identity preserved", () => {
  const pregate = runSafetyPregate({ user_message: "rappelle-moi ma marche" });
  const frame = frameWith("medium", ["emotional_distress"]);
  assertEquals(applySafetyFloorToTurnFrame(frame, pregate), frame);
  assertEquals(applySafetyFloorToTurnFrame(frame, null), frame);
  assertEquals(applySafetyFloorToTurnFrame(frame, undefined), frame);
});

Deno.test("floor: a distress floor (`low`) never blocks a legitimate turn", () => {
  const pregate = runSafetyPregate({ user_message: "je n'en peux plus" });
  assertEquals(pregate.risk_band, "low");
  const guarded = applySafetyFloorToTurnFrame(frameWith("none"), pregate);
  assertEquals(guarded.safety.risk_band, "low");
  assertEquals(blocksDirectEffects(guarded.safety.risk_band), false);
  assertEquals(blocksToolSkills(guarded.safety.risk_band), false);
});

Deno.test("floor: the runtime safety context is ratcheted too", () => {
  const context = initialSafetyContext({
    channel: "whatsapp",
    user_message: "i want to kill myself tonight",
  });
  assertEquals(context.risk_band, "critical");
  assertEquals(context.allow_side_effects, false);

  // A downstream layer that tries to relax the context is overruled.
  const relaxed = {
    ...context,
    risk_band: "none" as RiskBand,
    allow_side_effects: true,
  };
  const ratcheted = safetyContextWithFloor(relaxed, context.risk_band);
  assertEquals(ratcheted.risk_band, "critical");
  assertEquals(ratcheted.allow_side_effects, false);
  assertEquals(ratcheted.detected, true);
});

Deno.test("floor: end-to-end — every true-positive family survives a `none` frame", () => {
  const messages: Array<[string, RiskBand]> = [
    ["je veux me suicider", "high"],
    ["je veux me faire du mal ce soir", "critical"],
    ["j'ai envie de mourir", "medium"],
    ["je sers a rien", "low"],
    ["i want to kill myself", "high"],
    ["i want to hurt myself", "high"],
    ["i just want to die", "medium"],
    ["i'm worthless", "low"],
  ];
  for (const [message, expected] of messages) {
    const pregate = runSafetyPregate({ user_message: message });
    const guarded = applySafetyFloorToTurnFrame(frameWith("none"), pregate);
    assertEquals(guarded.safety.risk_band, expected, message);
  }
});
