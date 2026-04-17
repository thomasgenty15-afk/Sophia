import { assertEquals, assertMatch } from "jsr:@std/assert";

import {
  buildCoachingInterventionRuntimeAddon,
  buildCoachingInterventionSelectorPrompt,
  buildCoachingInterventionSelectorPromptPayload,
  buildFallbackCoachingInterventionDecision,
  buildKnownCoachingBlockersFromMomentumV2,
  type CoachingV2MomentumContext,
  type CoachingV2PlanItemContext,
  decideCoachingInterventionGate,
  detectCoachingInterventionTrigger,
  formatCoachingInterventionAddon,
  normalizeCoachingInterventionSelectorOutput,
} from "./coaching_intervention_selector.ts";
import {
  type StoredMomentumV2,
  writeMomentumStateV2,
} from "./momentum_state.ts";

function defaultV2Internal() {
  return {
    signal_log: {
      emotional_turns: [] as { at: string; level: "high" | "medium" }[],
      consent_events: [] as {
        at: string;
        kind: "accept" | "soft_decline" | "explicit_stop";
      }[],
      response_quality_events: [] as {
        at: string;
        quality: "substantive" | "brief" | "minimal";
      }[],
    },
    stability: {},
    sources: {},
    metrics_cache: {},
  };
}

function buildV2TempMemory(overrides?: Partial<StoredMomentumV2>): any {
  const base: StoredMomentumV2 = {
    version: 2,
    updated_at: new Date().toISOString(),
    current_state: "friction_legere",
    state_reason: "test",
    dimensions: {
      engagement: { level: "medium" },
      execution_traction: { level: "flat" },
      emotional_load: { level: "low" },
      consent: { level: "open" },
      plan_fit: { level: "good" },
      load_balance: { level: "balanced" },
    },
    assessment: { top_blocker: null, top_risk: null, confidence: "medium" },
    active_load: {
      current_load_score: 3,
      mission_slots_used: 1,
      support_slots_used: 1,
      habit_building_slots_used: 1,
      needs_reduce: false,
      needs_consolidate: false,
    },
    posture: { recommended_posture: "simplify", confidence: "medium" },
    blockers: { blocker_kind: null, blocker_repeat_score: 0 },
    memory_links: {
      last_useful_support_ids: [],
      last_failed_technique_ids: [],
    },
    _internal: defaultV2Internal(),
  };
  const merged = { ...base, ...overrides };
  if (overrides?.dimensions) {
    merged.dimensions = { ...base.dimensions, ...overrides.dimensions };
  }
  if (overrides?.assessment) {
    merged.assessment = { ...base.assessment, ...overrides.assessment };
  }
  if (overrides?.active_load) {
    merged.active_load = { ...base.active_load, ...overrides.active_load };
  }
  if (overrides?.blockers) {
    merged.blockers = { ...base.blockers, ...overrides.blockers };
  }
  if (overrides?.posture) {
    merged.posture = { ...base.posture, ...overrides.posture };
  }
  merged._internal = overrides?._internal ?? defaultV2Internal();
  return writeMomentumStateV2({}, merged as StoredMomentumV2);
}

function tempMemoryWithState(momentumState: string) {
  return buildV2TempMemory({ current_state: momentumState as any });
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
    recent_context_summary:
      "Action importante reportee deux fois cette semaine.",
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
      last_user_message:
        "J'ai envie de fumer quand je rentre chez moi, aide-moi.",
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
      coaching_scope: "micro",
      simplify_instead: false,
      dimension_strategy: null,
    },
    source: "fallback",
  });

  const block = formatCoachingInterventionAddon(addon);
  assertMatch(block, /ADDON COACH INTERVENTION/);
  assertMatch(block, /UNE seule technique concrete/i);
  assertMatch(block, /three_second_rule/);
});

// ═══════════════════════════════════════════════════════════════════════════════
// V2 TESTS — dimension-aware coaching (mission, habit, support) + simplify
// ═══════════════════════════════════════════════════════════════════════════════

const MISSION_ITEM: CoachingV2PlanItemContext = {
  id: "item-mission-1",
  dimension: "missions",
  kind: "task",
  title: "Envoyer le dossier de candidature",
  status: "active",
};

const HABIT_ITEM: CoachingV2PlanItemContext = {
  id: "item-habit-1",
  dimension: "habits",
  kind: "habit",
  title: "Mediter 10 minutes le matin",
  status: "active",
};

const SUPPORT_ITEM: CoachingV2PlanItemContext = {
  id: "item-support-1",
  dimension: "support",
  kind: "framework",
  title: "Journal de gratitude",
  status: "active",
};

const V2_MOMENTUM_BALANCED: CoachingV2MomentumContext = {
  plan_fit: "good",
  load_balance: "balanced",
  active_load_score: 3,
  needs_reduce: false,
  blocker_kind: "mission",
  top_risk: null,
  posture: "simplify",
};

const V2_MOMENTUM_OVERLOADED: CoachingV2MomentumContext = {
  plan_fit: "poor",
  load_balance: "overloaded",
  active_load_score: 9,
  needs_reduce: true,
  blocker_kind: "global",
  top_risk: "load",
  posture: "reduce_load",
};

Deno.test("V2: mission blocker produces micro coaching with dimension strategy", () => {
  const gate = decideCoachingInterventionGate({
    momentum_state: "friction_legere",
    v2_momentum: V2_MOMENTUM_BALANCED,
  });
  const fallback = buildFallbackCoachingInterventionDecision({
    input: {
      momentum_state: "friction_legere",
      explicit_help_request: true,
      trigger_kind: "explicit_blocker",
      last_user_message:
        "Je bloque sur mon dossier, je sais pas par quoi commencer.",
      target_plan_item: MISSION_ITEM,
      v2_momentum: V2_MOMENTUM_BALANCED,
      known_blockers: [{
        blocker_type: "overwhelm_or_blur",
        confidence: "medium",
      }],
      technique_history: [],
    },
    gateDecision: gate,
  });

  assertEquals(fallback.eligible, true);
  assertEquals(fallback.coaching_scope, "micro");
  assertEquals(fallback.simplify_instead, false);
  assertEquals(fallback.decision, "propose");
  assertMatch(fallback.dimension_strategy ?? "", /missions/);
  assertMatch(fallback.dimension_strategy ?? "", /prochain pas executable/);
  assertMatch(fallback.dimension_strategy ?? "", /clarifier/);
});

Deno.test("V2: habit blocker produces micro coaching with habit-specific strategy", () => {
  const gate = decideCoachingInterventionGate({
    momentum_state: "friction_legere",
    v2_momentum: V2_MOMENTUM_BALANCED,
  });
  const fallback = buildFallbackCoachingInterventionDecision({
    input: {
      momentum_state: "friction_legere",
      explicit_help_request: true,
      trigger_kind: "explicit_blocker",
      last_user_message:
        "Je repousse encore ma meditation, j'y arrive pas le matin.",
      target_plan_item: HABIT_ITEM,
      v2_momentum: V2_MOMENTUM_BALANCED,
      known_blockers: [{
        blocker_type: "startup_inertia",
        confidence: "medium",
      }],
      technique_history: [],
    },
    gateDecision: gate,
  });

  assertEquals(fallback.eligible, true);
  assertEquals(fallback.coaching_scope, "micro");
  assertEquals(fallback.simplify_instead, false);
  assertMatch(fallback.dimension_strategy ?? "", /habits/);
  assertMatch(fallback.dimension_strategy ?? "", /friction/);
});

Deno.test("V2: support blocker produces micro coaching with support-specific strategy", () => {
  const gate = decideCoachingInterventionGate({
    momentum_state: "friction_legere",
    v2_momentum: V2_MOMENTUM_BALANCED,
  });
  const fallback = buildFallbackCoachingInterventionDecision({
    input: {
      momentum_state: "friction_legere",
      explicit_help_request: true,
      trigger_kind: "coach_request",
      last_user_message:
        "Le journal de gratitude, je sais pas trop comment l'utiliser.",
      target_plan_item: SUPPORT_ITEM,
      v2_momentum: V2_MOMENTUM_BALANCED,
      known_blockers: [{
        blocker_type: "overwhelm_or_blur",
        confidence: "low",
      }],
      technique_history: [],
    },
    gateDecision: gate,
  });

  assertEquals(fallback.eligible, true);
  assertEquals(fallback.coaching_scope, "micro");
  assertMatch(fallback.dimension_strategy ?? "", /support/);
  assertMatch(fallback.dimension_strategy ?? "", /utilite concrete/);
  assertMatch(fallback.dimension_strategy ?? "", /utile/);
});

Deno.test("V2: overloaded momentum triggers simplify_instead with structural scope", () => {
  const gate = decideCoachingInterventionGate({
    momentum_state: "friction_legere",
    v2_momentum: V2_MOMENTUM_OVERLOADED,
  });
  const fallback = buildFallbackCoachingInterventionDecision({
    input: {
      momentum_state: "friction_legere",
      explicit_help_request: true,
      trigger_kind: "explicit_blocker",
      last_user_message: "J'arrive plus a suivre, c'est trop.",
      target_plan_item: MISSION_ITEM,
      v2_momentum: V2_MOMENTUM_OVERLOADED,
      known_blockers: [{
        blocker_type: "overwhelm_or_blur",
        confidence: "high",
      }],
      technique_history: [],
    },
    gateDecision: gate,
  });

  assertEquals(fallback.eligible, true);
  assertEquals(fallback.simplify_instead, true);
  assertEquals(fallback.coaching_scope, "structural");
  assertEquals(fallback.reason, "selector_fallback_simplify_due_to_overload");
  assertEquals(fallback.intensity, "light");
  assertEquals(fallback.recommended_technique, null);
  assertEquals(fallback.technique_candidates, []);
});

Deno.test("V2: overloaded momentum caps gate to allow_light_only", () => {
  const gate = decideCoachingInterventionGate({
    momentum_state: "friction_legere",
    v2_momentum: V2_MOMENTUM_OVERLOADED,
  });

  assertEquals(gate.gate, "allow_light_only");
  assertEquals(gate.eligible, true);
  assertEquals(gate.intensity_cap, "light");
  assertMatch(gate.reason, /load_overloaded/);
});

Deno.test("V2: stalled plan item produces structural scope", () => {
  const stalledItem: CoachingV2PlanItemContext = {
    ...MISSION_ITEM,
    status: "stalled",
  };
  const gate = decideCoachingInterventionGate({
    momentum_state: "friction_legere",
    v2_momentum: { ...V2_MOMENTUM_BALANCED, plan_fit: "poor" },
  });
  const fallback = buildFallbackCoachingInterventionDecision({
    input: {
      momentum_state: "friction_legere",
      explicit_help_request: true,
      trigger_kind: "explicit_blocker",
      last_user_message: "Ca fait une semaine que je n'avance plus.",
      target_plan_item: stalledItem,
      v2_momentum: { ...V2_MOMENTUM_BALANCED, plan_fit: "poor" },
      known_blockers: [{ blocker_type: "startup_inertia", confidence: "high" }],
      technique_history: [],
    },
    gateDecision: gate,
  });

  assertEquals(fallback.coaching_scope, "structural");
});

Deno.test("V2: buildKnownCoachingBlockersFromMomentumV2 maps mission blocker", () => {
  const momentum = buildV2TempMemory({
    blockers: { blocker_kind: "mission", blocker_repeat_score: 4 },
  });
  const blockers = buildKnownCoachingBlockersFromMomentumV2(
    momentum.__momentum_state_v2 as StoredMomentumV2,
  );

  assertEquals(blockers.length >= 1, true);
  assertEquals(blockers[0].confidence, "medium");
});

Deno.test("V2: addon formatter includes plan item and simplify notice", () => {
  const addon = buildCoachingInterventionRuntimeAddon({
    input: {
      momentum_state: "friction_legere",
      explicit_help_request: true,
      trigger_kind: "explicit_blocker",
      last_user_message: "C'est trop, j'arrive plus.",
      target_plan_item: MISSION_ITEM,
      v2_momentum: V2_MOMENTUM_OVERLOADED,
    },
    output: {
      eligible: true,
      gate: "allow_light_only",
      decision: "propose",
      reason: "selector_fallback_simplify_due_to_overload",
      blocker_type: "overwhelm_or_blur",
      confidence: "medium",
      need_clarification: false,
      recommended_technique: "minimum_version",
      technique_candidates: ["minimum_version"],
      message_angle: "gentle_experiment",
      intensity: "light",
      follow_up_needed: false,
      follow_up_window_hours: null,
      coaching_scope: "structural",
      simplify_instead: true,
      dimension_strategy: "Dimension missions (kind=task): strategies...",
    },
    source: "fallback",
  });

  const block = formatCoachingInterventionAddon(addon);
  assertMatch(block, /ADDON COACH INTERVENTION/);
  assertMatch(block, /SURCHARGE DETECTEE/);
  assertMatch(block, /structural/);
  assertMatch(block, /dimension=missions/);
  assertMatch(block, /Envoyer le dossier/);
});

Deno.test("V2: prompt includes dimension strategies and coaching_scope field", () => {
  const prompt = buildCoachingInterventionSelectorPrompt();

  assertMatch(prompt, /missions.*task.*milestone/);
  assertMatch(prompt, /habits.*habit/);
  assertMatch(prompt, /support.*framework/);
  assertMatch(prompt, /coaching_scope/);
  assertMatch(prompt, /simplify_instead/);
  assertMatch(prompt, /dimension_strategy/);
});

Deno.test("V2: normalization preserves coaching_scope and simplify_instead from LLM output", () => {
  const normalized = normalizeCoachingInterventionSelectorOutput({
    eligible: true,
    gate: "allow",
    decision: "propose",
    reason: "structural_overload",
    blocker_type: "overwhelm_or_blur",
    confidence: "high",
    need_clarification: false,
    recommended_technique: null,
    technique_candidates: [],
    message_angle: "gentle_experiment",
    intensity: "light",
    follow_up_needed: false,
    follow_up_window_hours: null,
    coaching_scope: "structural",
    simplify_instead: true,
    dimension_strategy: "missions: clarifier",
  }, {
    fallback_gate: decideCoachingInterventionGate({
      momentum_state: "friction_legere",
    }),
  });

  assertEquals(normalized.coaching_scope, "structural");
  assertEquals(normalized.simplify_instead, true);
  assertEquals(normalized.dimension_strategy, "missions: clarifier");
  assertEquals(normalized.recommended_technique, null);
  assertEquals(normalized.technique_candidates, []);
});
