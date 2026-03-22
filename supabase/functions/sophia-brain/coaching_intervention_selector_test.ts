import { assertEquals, assertMatch } from "jsr:@std/assert";

import {
  buildCoachingInterventionRuntimeAddon,
  buildFallbackCoachingInterventionDecision,
  buildCoachingInterventionSelectorPrompt,
  buildCoachingInterventionSelectorPromptPayload,
  decideCoachingInterventionGate,
  detectCoachingInterventionTrigger,
  formatCoachingInterventionAddon,
  normalizeCoachingInterventionSelectorOutput,
} from "./coaching_intervention_selector.ts";
import { writeMomentumState } from "./momentum_state.ts";

function tempMemoryWithState(momentumState: string) {
  return writeMomentumState({}, {
    version: 1 as const,
    current_state: momentumState as any,
    dimensions: {
      engagement: { level: "medium" as const },
      progression: { level: "unknown" as const },
      emotional_load: { level: "low" as const },
      consent: { level: "open" as const },
    },
    metrics: {},
    blocker_memory: {
      actions: [],
    },
    signal_log: {
      emotional_turns: [],
      consent_events: [],
      response_quality_events: [],
    },
    stability: {},
    sources: {},
  });
}

Deno.test("coaching_intervention_selector: friction_legere allows standard interventions", () => {
  const decision = decideCoachingInterventionGate({
    tempMemory: tempMemoryWithState("friction_legere"),
  });

  assertEquals(decision.gate, "allow");
  assertEquals(decision.eligible, true);
  assertEquals(decision.intensity_cap, "standard");
});

Deno.test("coaching_intervention_selector: evitement only allows light interventions", () => {
  const decision = decideCoachingInterventionGate({
    tempMemory: tempMemoryWithState("evitement"),
  });

  assertEquals(decision.gate, "allow_light_only");
  assertEquals(decision.eligible, true);
  assertEquals(decision.intensity_cap, "light");
});

Deno.test("coaching_intervention_selector: soutien_emotionnel requires explicit request", () => {
  const blocked = decideCoachingInterventionGate({
    tempMemory: tempMemoryWithState("soutien_emotionnel"),
  });
  const allowed = decideCoachingInterventionGate({
    tempMemory: tempMemoryWithState("soutien_emotionnel"),
    explicit_help_request: true,
  });

  assertEquals(blocked.eligible, false);
  assertEquals(blocked.gate, "explicit_request_only");
  assertEquals(allowed.eligible, true);
  assertEquals(allowed.intensity_cap, "light");
});

Deno.test("coaching_intervention_selector: prompt exposes blocker and technique catalog", () => {
  const prompt = buildCoachingInterventionSelectorPrompt();

  assertMatch(prompt, /startup_inertia/);
  assertMatch(prompt, /environment_mismatch/);
  assertMatch(prompt, /three_second_rule/);
  assertMatch(prompt, /relapse_protocol/);
});

Deno.test("coaching_intervention_selector: detects explicit craving trigger", () => {
  const trigger = detectCoachingInterventionTrigger({
    userMessage: "J'ai envie de fumer, je vais craquer ce soir.",
  });

  assertEquals(trigger?.trigger_kind, "explicit_craving");
  assertEquals(trigger?.blocker_hint, "craving_or_urge");
});

Deno.test("coaching_intervention_selector: payload carries gate decision and compressed context", () => {
  const payload = buildCoachingInterventionSelectorPromptPayload({
    momentum_state: "friction_legere",
    explicit_help_request: false,
    trigger_kind: "explicit_blocker",
    last_user_message: "Je repousse encore mon appel.",
    recent_context_summary: "Action importante reportee deux fois cette semaine.",
    target_action_title: "Appeler le client",
  });

  const parsed = JSON.parse(payload.user_payload);
  assertEquals(payload.gate_decision.gate, "allow");
  assertEquals(parsed.trigger_kind, "explicit_blocker");
  assertEquals(parsed.target_action_title, "Appeler le client");
});

Deno.test("coaching_intervention_selector: fallback can propose a technique without llm", () => {
  const gate = decideCoachingInterventionGate({
    momentum_state: "friction_legere",
  });
  const fallback = buildFallbackCoachingInterventionDecision({
    input: {
      momentum_state: "friction_legere",
      explicit_help_request: true,
      trigger_kind: "coach_request",
      last_user_message: "J'ai envie de fumer quand je rentre chez moi, aide-moi.",
      target_action_title: "Arret cigarette",
      known_blockers: [{
        blocker_type: "craving_or_urge",
        confidence: "high",
      }],
      technique_history: [],
    },
    gateDecision: gate,
  });

  assertEquals(fallback.decision, "propose");
  assertEquals(fallback.recommended_technique, "urge_delay");
  assertEquals(fallback.message_angle, "urge_management");
});

Deno.test("coaching_intervention_selector: fallback deprioritizes recently ineffective technique", () => {
  const gate = decideCoachingInterventionGate({
    momentum_state: "friction_legere",
  });
  const fallback = buildFallbackCoachingInterventionDecision({
    input: {
      momentum_state: "friction_legere",
      explicit_help_request: true,
      trigger_kind: "coach_request",
      last_user_message: "Je veux une astuce pour quand j'ai envie de fumer.",
      known_blockers: [{
        blocker_type: "craving_or_urge",
        confidence: "high",
      }],
      technique_history: [{
        technique_id: "urge_delay",
        blocker_type: "craving_or_urge",
        outcome: "tried_not_helpful",
        last_used_at: new Date().toISOString(),
      }],
    },
    gateDecision: gate,
  });

  assertEquals(fallback.recommended_technique, "environment_shift");
});

Deno.test("coaching_intervention_selector: normalization falls back to blocker candidates", () => {
  const normalized = normalizeCoachingInterventionSelectorOutput({
    eligible: true,
    gate: "allow",
    decision: "propose",
    reason: "fit",
    blocker_type: "craving_or_urge",
    confidence: "medium",
    need_clarification: false,
    recommended_technique: null,
    technique_candidates: [],
    message_angle: "urge_management",
    intensity: "standard",
    follow_up_needed: true,
  }, {
    technique_history: [{
      technique_id: "urge_delay",
      blocker_type: "craving_or_urge",
      outcome: "tried_helpful",
    }],
  });

  assertEquals(normalized.recommended_technique, "urge_delay");
  assertEquals(normalized.technique_candidates[0], "urge_delay");
  assertEquals(normalized.follow_up_window_hours, 18);
});

Deno.test("coaching_intervention_selector: blocked gate forces skip and clears technique", () => {
  const normalized = normalizeCoachingInterventionSelectorOutput({
    eligible: false,
    gate: "blocked",
    decision: "propose",
    blocker_type: "startup_inertia",
    recommended_technique: "three_second_rule",
    technique_candidates: ["three_second_rule"],
    intensity: "standard",
    follow_up_needed: true,
  }, {
    fallback_gate: decideCoachingInterventionGate({
      momentum_state: "pause_consentie",
    }),
  });

  assertEquals(normalized.decision, "skip");
  assertEquals(normalized.recommended_technique, null);
  assertEquals(normalized.technique_candidates.length, 0);
  assertEquals(normalized.follow_up_needed, false);
});

Deno.test("coaching_intervention_selector: addon formatter gives companion a single-technique instruction", () => {
  const addon = buildCoachingInterventionRuntimeAddon({
    input: {
      momentum_state: "friction_legere",
      explicit_help_request: true,
      trigger_kind: "coach_request",
      last_user_message: "Je repousse encore mon sport.",
      target_action_title: "Sport",
    },
    output: {
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
    },
    source: "fallback",
  });

  const block = formatCoachingInterventionAddon(addon);
  assertMatch(block, /ADDON COACH INTERVENTION/);
  assertMatch(block, /UNE seule technique concrete/i);
  assertMatch(block, /three_second_rule/);
});
