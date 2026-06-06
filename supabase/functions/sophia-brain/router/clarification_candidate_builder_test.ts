import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";
import {
  buildActiveSkillClarificationCandidatesFromTurnFrame,
  buildClarificationCandidatesFromTurnFrame,
} from "./clarification_candidate_builder.ts";

function frame(patch: Partial<TurnFrame>): TurnFrame {
  return {
    turn_id: "turn-1",
    source_message_id: "msg-1",
    user_id: "user-1",
    channel: "web",
    safety: { risk_band: "low", reason_codes: [], evidence: [] },
    direct_effects: [],
    tool_skill_intents: [],
    tool_skill_opportunity: {
      type: "none",
      operation_type: null,
      surface_id: null,
      confidence_band: "low",
      should_offer: false,
      prop_reason: null,
      source_span: null,
      target_hint: null,
      target_status: "none",
      suggested_question_intent: null,
      offer_timing: "never",
      must_not_execute: true,
    },
    skill_signals: {},
    memory_plan: {
      context_need: "minimal",
      memory_mode: "none",
      context_budget_tier: "tiny",
      targets: [],
      retrieval_policy: "semantic_first",
    },
    ...patch,
  };
}

Deno.test("clarification_candidate_builder: one-shot + recurring présents demande clarification", () => {
  const result = buildClarificationCandidatesFromTurnFrame(frame({
    direct_effects: [{
      effect_type: "create_one_shot_reminder",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: {},
    }],
    tool_skill_intents: [{
      operation_type: "create_recurring_reminder",
      explicitness: "explicit",
      confidence_band: "high",
      ambiguity: "none",
      user_intent: "create",
    }],
  }));

  assertEquals(result?.ambiguity_kind, "timing");
  assertEquals(result?.candidates.map((candidate) => candidate.id), [
    "create_one_shot_reminder",
    "create_recurring_reminder",
  ]);
});

Deno.test("clarification_candidate_builder: product_help + prepare_attack_card présents demande clarification", () => {
  const result = buildClarificationCandidatesFromTurnFrame(frame({
    skill_signals: {
      entry: {
        product_help: {
          detected: true,
          confidence_band: "high",
          reason: "structured_product_help",
        },
      },
    },
    tool_skill_opportunity: {
      type: "attack_card",
      operation_type: "prepare_attack_card",
      surface_id: "attack_card",
      confidence_band: "medium",
      should_offer: true,
      prop_reason: "structured_opportunity",
      source_span: null,
      target_hint: null,
      target_status: "identified",
      suggested_question_intent: "offer_attack_card",
      offer_timing: "now",
      must_not_execute: true,
    },
  }));

  assertEquals(result?.ambiguity_kind, "intent");
  assertEquals(result?.candidates.map((candidate) => candidate.id), [
    "product_help",
    "prepare_attack_card",
  ]);
});

Deno.test("clarification_candidate_builder: prepare_defense_card + prepare_attack_card demande clarification", () => {
  const result = buildClarificationCandidatesFromTurnFrame(frame({
    tool_skill_intents: [{
      operation_type: "prepare_defense_card",
      explicitness: "explicit",
      confidence_band: "high",
      ambiguity: "target_ambiguous",
      user_intent: "create",
      operation_input: { target_hint: "moment de risque à clarifier" },
    }, {
      operation_type: "prepare_attack_card",
      explicitness: "explicit",
      confidence_band: "high",
      ambiguity: "target_ambiguous",
      user_intent: "create",
      operation_input: { target_hint: "action à clarifier" },
    }],
  }));

  assertEquals(result?.ambiguity_kind, "intent");
  assertEquals(result?.candidates.map((candidate) => candidate.id), [
    "prepare_defense_card",
    "prepare_attack_card",
  ]);
});

Deno.test("clarification_candidate_builder: prepare_attack_card + adjust_plan_item demande clarification", () => {
  const result = buildClarificationCandidatesFromTurnFrame(frame({
    tool_skill_intents: [{
      operation_type: "prepare_attack_card",
      explicitness: "implied",
      confidence_band: "medium",
      ambiguity: "intent_ambiguous",
      user_intent: "create",
    }, {
      operation_type: "adjust_plan_item",
      explicitness: "explicit",
      confidence_band: "high",
      ambiguity: "none",
      user_intent: "adjust",
      adjust_plan_scope: "current_level",
    }],
  }));

  assertEquals(result?.ambiguity_kind, "intent");
  assertEquals(result?.candidates.map((candidate) => candidate.id), [
    "prepare_attack_card",
    "adjust_plan_item",
  ]);
});

Deno.test("clarification_candidate_builder: emotional_repair + state potion + attack card demande clarification", () => {
  const result = buildClarificationCandidatesFromTurnFrame(frame({
    skill_signals: {
      entry: {
        emotional_repair: {
          detected: true,
          confidence_band: "medium",
          reason: "structured_emotional_need",
        },
        prepare_attack_card: {
          detected: true,
          confidence_band: "medium",
          reason: "structured_micro_action_need",
        },
      },
    },
    tool_skill_opportunity: {
      type: "state_potion",
      operation_type: "select_state_potion",
      surface_id: "potion.state",
      confidence_band: "medium",
      should_offer: true,
      prop_reason: "structured_state_regulation",
      source_span: null,
      target_hint: null,
      target_status: "none",
      suggested_question_intent: "offer_state_potion",
      offer_timing: "now",
      must_not_execute: true,
    },
  }));

  assertEquals(result?.ambiguity_kind, "target");
  assertEquals(result?.candidates.map((candidate) => candidate.id), [
    "emotional_repair",
    "prepare_attack_card",
    "select_state_potion",
  ]);
});

Deno.test("clarification_candidate_builder: ancien skill execution actif est ignoré", () => {
  const deprecatedActionBreakdownSkillId = "execution" + "_breakdown";
  const result = buildActiveSkillClarificationCandidatesFromTurnFrame({
    activeSkillState: { skill_id: deprecatedActionBreakdownSkillId },
    turnFrame: frame({
      skill_signals: {
        entry: {
          product_help: {
            detected: true,
            confidence_band: "high",
            reason: "structured_product_help_noise",
          },
        },
      },
      tool_skill_opportunity: {
        type: "plan_adjustment",
        operation_type: "adjust_plan_item",
        surface_id: "plan_item.reduce",
        confidence_band: "high",
        should_offer: true,
        prop_reason: "structured_adjust_plan",
        source_span: null,
        target_hint: null,
        target_status: "identified",
        suggested_question_intent: "offer_plan_adjustment",
        offer_timing: "now",
        must_not_execute: true,
      },
    }),
  });

  assertEquals(result, null);
});

Deno.test("clarification_candidate_builder: skill_signal select_state_potion est normalisé en operation candidate", () => {
  const result = buildActiveSkillClarificationCandidatesFromTurnFrame({
    activeSkillState: { skill_id: "emotional_repair" },
    turnFrame: frame({
      skill_signals: {
        entry: {
          select_state_potion: {
            detected: true,
            confidence_band: "medium",
            reason: "structured_state_regulation",
          },
          prepare_attack_card: {
            detected: true,
            confidence_band: "medium",
            reason: "structured_micro_action_need",
          },
        },
      },
    }),
  });

  assertEquals(result?.owner, "emotional_repair");
  assertEquals(
    result?.candidates.map((candidate) => ({
      id: candidate.id,
      label: candidate.label,
      operation_type: candidate.operation_type ?? null,
    })),
    [
      {
        id: "emotional_repair",
        label: "un soutien émotionnel",
        operation_type: null,
      },
      {
        id: "select_state_potion",
        label: "changer d'état avec une potion",
        operation_type: "select_state_potion",
      },
      {
        id: "prepare_attack_card",
        label: "préparer une carte d'attaque",
        operation_type: "prepare_attack_card",
      },
    ],
  );
});

Deno.test("clarification_candidate_builder: skill actif emotional conserve une potion explicite du message", () => {
  const result = buildActiveSkillClarificationCandidatesFromTurnFrame({
    activeSkillState: { skill_id: "emotional_repair" },
    userMessage:
      "Je suis tendu et vidé ; je ne sais pas si je veux poser ce que je ressens, changer d'état avec une potion, ou choisir un petit geste concret.",
    turnFrame: frame({
      skill_signals: {
        entry: {
          prepare_attack_card: {
            detected: true,
            confidence_band: "medium",
            reason: "structured_micro_action_need",
          },
        },
      },
      tool_skill_intents: [{
        operation_type: "adjust_plan_item",
        explicitness: "implied",
        confidence_band: "medium",
        ambiguity: "intent_ambiguous",
        user_intent: "adjust",
        adjust_plan_scope: "current_level",
      }],
    }),
  });

  assertEquals(result?.owner, "emotional_repair");
  assertEquals(result?.ambiguity_kind, "target");
  assertEquals(
    result?.candidates.map((candidate) => ({
      id: candidate.id,
      operation_type: candidate.operation_type ?? null,
    })),
    [
      { id: "emotional_repair", operation_type: null },
      { id: "select_state_potion", operation_type: "select_state_potion" },
      { id: "adjust_plan_item", operation_type: "adjust_plan_item" },
      { id: "prepare_attack_card", operation_type: "prepare_attack_card" },
    ],
  );
});

Deno.test("clarification_candidate_builder: demotivation actif expose des candidats internes de source", () => {
  const result = buildActiveSkillClarificationCandidatesFromTurnFrame({
    activeSkillState: {
      skill_id: "demotivation_repair",
      working_state: { phase: "sorting_demotivation_source" },
    },
    turnFrame: frame({}),
  });

  assertEquals(result?.owner, "demotivation_repair");
  assertEquals(result?.ambiguity_kind, "intent");
  assertEquals(
    result?.candidates.map((candidate) => ({
      id: candidate.id,
      label: candidate.label,
      operation_type: candidate.operation_type ?? null,
    })),
    [
      {
        id: "demotivation_loss_of_meaning",
        label: "une perte de sens",
        operation_type: null,
      },
      {
        id: "demotivation_fatigue",
        label: "de la fatigue",
        operation_type: null,
      },
      {
        id: "prepare_attack_card",
        label: "préparer une carte d'attaque",
        operation_type: "prepare_attack_card",
      },
      {
        id: "adjust_plan_item",
        label: "un plan mal calibré",
        operation_type: "adjust_plan_item",
      },
    ],
  );
  assertEquals(
    result?.known_context.candidate_sources,
    [
      {
        id: "demotivation_loss_of_meaning",
        source: "active_skill_internal",
        confidence_band: "medium",
      },
      {
        id: "demotivation_fatigue",
        source: "active_skill_internal",
        confidence_band: "medium",
      },
      {
        id: "prepare_attack_card",
        source: "active_skill_internal",
        confidence_band: "medium",
      },
      {
        id: "adjust_plan_item",
        source: "active_skill_internal",
        confidence_band: "medium",
      },
    ],
  );
});

Deno.test("clarification_candidate_builder: demotivation diagnostic est une paraphrase de phase valide", () => {
  const result = buildActiveSkillClarificationCandidatesFromTurnFrame({
    activeSkillState: {
      skill_id: "demotivation_repair",
      working_state: { phase: "diagnose" },
    },
    turnFrame: frame({}),
  });

  assertEquals(result?.owner, "demotivation_repair");
  assertEquals(result?.candidates.map((candidate) => candidate.id), [
    "demotivation_loss_of_meaning",
    "demotivation_fatigue",
    "prepare_attack_card",
    "adjust_plan_item",
  ]);
});

Deno.test("clarification_candidate_builder: demotivation hors phase de clarification ne force rien", () => {
  const result = buildActiveSkillClarificationCandidatesFromTurnFrame({
    activeSkillState: {
      skill_id: "demotivation_repair",
      working_state: { phase: "reduce_friction" },
    },
    turnFrame: frame({}),
  });

  assertEquals(result, null);
});

Deno.test("clarification_candidate_builder: weekly actif expose recap ou ajustement sans patch", () => {
  const result = buildActiveSkillClarificationCandidatesFromTurnFrame({
    activeSkillState: {
      skill_id: "weekly_adaptive_review_v1",
      working_state: { phase: "weekly_review_discussion" },
    },
    turnFrame: frame({}),
  });

  assertEquals(result?.owner, "weekly_adaptive_review_v1");
  assertEquals(result?.ambiguity_kind, "handoff_readiness");
  assertEquals(
    result?.candidates.map((candidate) => ({
      id: candidate.id,
      label: candidate.label,
      operation_type: candidate.operation_type ?? null,
    })),
    [
      {
        id: "weekly_recap",
        label: "faire un récap clair de la semaine",
        operation_type: null,
      },
      {
        id: "adjust_plan_item",
        label: "ajuster le plan",
        operation_type: "adjust_plan_item",
      },
    ],
  );
});

Deno.test("clarification_candidate_builder: weekly hors phase de discussion ne force rien", () => {
  const result = buildActiveSkillClarificationCandidatesFromTurnFrame({
    activeSkillState: {
      skill_id: "weekly_adaptive_review_v1",
      working_state: { phase: "ready_for_confirmation" },
    },
    turnFrame: frame({}),
  });

  assertEquals(result, null);
});

Deno.test("clarification_candidate_builder: un seul signal clair ne demande rien", () => {
  const result = buildClarificationCandidatesFromTurnFrame(frame({
    tool_skill_intents: [{
      operation_type: "create_recurring_reminder",
      explicitness: "explicit",
      confidence_band: "high",
      ambiguity: "none",
      user_intent: "create",
    }],
  }));

  assertEquals(result, null);
});

Deno.test("clarification_candidate_builder: safety préempte la clarification produit", () => {
  const result = buildClarificationCandidatesFromTurnFrame(frame({
    safety: { risk_band: "critical", reason_codes: ["safety"], evidence: [] },
    skill_signals: {
      entry: {
        product_help: { detected: true, confidence_band: "high" },
      },
    },
    tool_skill_opportunity: {
      type: "attack_card",
      operation_type: "prepare_attack_card",
      surface_id: "attack_card",
      confidence_band: "high",
      should_offer: true,
      prop_reason: null,
      source_span: null,
      target_hint: null,
      target_status: "identified",
      suggested_question_intent: "offer_attack_card",
      offer_timing: "now",
      must_not_execute: true,
    },
  }));

  assertEquals(result, null);
});
