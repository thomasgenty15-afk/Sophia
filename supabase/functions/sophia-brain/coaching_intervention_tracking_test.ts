import { assertEquals, assertExists } from "jsr:@std/assert";

import {
  buildTechniqueHistoryForSelector,
  readCoachingInterventionMemory,
  reconcileCoachingInterventionStateFromUserTurn,
  recordCoachingInterventionProposal,
} from "./coaching_intervention_tracking.ts";

Deno.test("coaching_intervention_tracking: proposal creates pending state and history entry", () => {
  const next = recordCoachingInterventionProposal({
    tempMemory: {},
    addon: {
      intervention_id: "coach_test_1",
      eligible: true,
      decision: "propose",
      reason: "fit",
      blocker_type: "urge",
      confidence: 0.9,
      need_clarification: false,
      recommended_technique: "urge_delay",
      technique_candidates: ["urge_delay", "environment_shift"],
      message_angle: "urge_management",
      intensity: "standard",
      follow_up_needed: true,
      follow_up_window_hours: 18,
      trigger_kind: "explicit_craving",
      target_action_title: "Arret cigarette",
      selector_source: "fallback",
    },
  });

  const memory = readCoachingInterventionMemory(next);
  assertExists(memory.pending);
  assertEquals(memory.pending?.technique_id, "urge_delay");
  assertEquals(memory.history.length, 1);
  assertEquals(memory.history[0]?.status, "pending");
});

// ── LLM gate ─────────────────────────────────────────────────────────────────────────────
// `reconcileCoachingInterventionStateFromUserTurn` resolves a pending intervention by calling
// `classifyCoachingInterventionFollowUp`, which is a real `generateWithGemini` round trip
// (`coaching_intervention_tracking.ts:186-262`). Its catch branch returns `{decision:
// "ignore"}` on any failure, so without a model key the pending state simply never resolves
// and the case fails for an environment reason, not a code reason. It is therefore SKIPPED
// when no model key is present. See docs/keel/TESTING.md.
const LLM_KEYS = ["GEMINI_API_KEY", "OPENAI_API_KEY"] as const;
const HAS_LLM = LLM_KEYS.some((k) => (Deno.env.get(k) ?? "").trim().length > 0);
if (!HAS_LLM) {
  console.log(
    `[skip] coaching_intervention_tracking follow-up classifier: needs a model key (${
      LLM_KEYS.join(" or ")
    })`,
  );
}

Deno.test("coaching_intervention_tracking: user follow-up resolves pending as helpful", {
  ignore: !HAS_LLM,
}, async () => {
  const withProposal = recordCoachingInterventionProposal({
    tempMemory: {},
    addon: {
      intervention_id: "coach_test_2",
      eligible: true,
      decision: "propose",
      reason: "fit",
      blocker_type: "start_friction",
      confidence: 0.6,
      need_clarification: false,
      recommended_technique: "three_second_rule",
      technique_candidates: ["three_second_rule", "minimum_version"],
      message_angle: "direct_action_now",
      intensity: "standard",
      follow_up_needed: true,
      follow_up_window_hours: 18,
      trigger_kind: "explicit_blocker",
      target_action_title: "Sport",
      selector_source: "fallback",
    },
  });

  const resolved = await reconcileCoachingInterventionStateFromUserTurn({
    tempMemory: withProposal,
    userMessage: "J'ai testé et ça m'a aidé, j'ai finalement commencé.",
    history: [],
  });

  const memory = readCoachingInterventionMemory(resolved);
  assertEquals(memory.pending, null);
  assertEquals(memory.history[0]?.status, "resolved");
  assertEquals(memory.history[0]?.outcome, "behavior_changed");
  assertEquals(memory.history[0]?.helpful, true);
});

Deno.test("coaching_intervention_tracking: selector history includes pending as not_tried", () => {
  const withProposal = recordCoachingInterventionProposal({
    tempMemory: {},
    addon: {
      intervention_id: "coach_test_3",
      eligible: true,
      decision: "propose",
      reason: "fit",
      blocker_type: "environment_mismatch",
      confidence: 0.6,
      need_clarification: false,
      recommended_technique: "environment_shift",
      technique_candidates: ["environment_shift", "precommitment"],
      message_angle: "environment_reset",
      intensity: "light",
      follow_up_needed: true,
      follow_up_window_hours: 24,
      trigger_kind: "coach_request",
      target_action_title: "Routine du soir",
      selector_source: "fallback",
    },
  });

  const history = buildTechniqueHistoryForSelector(withProposal);
  assertEquals(history.length, 1);
  assertEquals(history[0]?.outcome, "not_tried");
  assertEquals(history[0]?.technique_id, "environment_shift");
});
