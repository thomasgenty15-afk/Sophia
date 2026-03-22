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
      eligible: true,
      gate: "allow",
      decision: "propose",
      reason: "fit",
      blocker_type: "craving_or_urge",
      confidence: "high",
      need_clarification: false,
      recommended_technique: "urge_delay",
      technique_candidates: ["urge_delay", "environment_shift"],
      message_angle: "urge_management",
      intensity: "standard",
      follow_up_needed: true,
      follow_up_window_hours: 18,
      trigger_kind: "explicit_craving",
      explicit_help_request: true,
      target_action_title: "Arret cigarette",
      selector_source: "fallback",
      decided_at: new Date().toISOString(),
    },
  });

  const memory = readCoachingInterventionMemory(next);
  assertExists(memory.pending);
  assertEquals(memory.pending?.technique_id, "urge_delay");
  assertEquals(memory.history.length, 1);
  assertEquals(memory.history[0]?.status, "pending");
});

Deno.test("coaching_intervention_tracking: user follow-up resolves pending as helpful", async () => {
  const withProposal = recordCoachingInterventionProposal({
    tempMemory: {},
    addon: {
      eligible: true,
      gate: "allow",
      decision: "propose",
      reason: "fit",
      blocker_type: "startup_inertia",
      confidence: "medium",
      need_clarification: false,
      recommended_technique: "three_second_rule",
      technique_candidates: ["three_second_rule", "minimum_version"],
      message_angle: "direct_action_now",
      intensity: "standard",
      follow_up_needed: true,
      follow_up_window_hours: 18,
      trigger_kind: "explicit_blocker",
      explicit_help_request: false,
      target_action_title: "Sport",
      selector_source: "fallback",
      decided_at: new Date().toISOString(),
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
      eligible: true,
      gate: "allow",
      decision: "propose",
      reason: "fit",
      blocker_type: "environment_mismatch",
      confidence: "medium",
      need_clarification: false,
      recommended_technique: "environment_shift",
      technique_candidates: ["environment_shift", "precommitment"],
      message_angle: "environment_reset",
      intensity: "light",
      follow_up_needed: true,
      follow_up_window_hours: 24,
      trigger_kind: "coach_request",
      explicit_help_request: true,
      target_action_title: "Routine du soir",
      selector_source: "fallback",
      decided_at: new Date().toISOString(),
    },
  });

  const history = buildTechniqueHistoryForSelector(withProposal);
  assertEquals(history.length, 1);
  assertEquals(history[0]?.outcome, "not_tried");
  assertEquals(history[0]?.technique_id, "environment_shift");
});
