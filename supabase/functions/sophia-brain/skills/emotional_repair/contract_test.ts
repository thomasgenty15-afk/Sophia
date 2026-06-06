import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  type EmotionalRepairSkillDecision,
  normalizeEmotionalRepairDecision,
} from "./contract.ts";
import { reduceEmotionalRepairTurn } from "./reducer.ts";

function mockRunInput() {
  return {
    user_message: "test",
    context: {
      skill_id: "emotional_repair",
      user_id: "user_test",
      recent_messages: [],
      active_skill_working_state: null,
      turn_frame: {
        source_message_id: "message_test",
        user_id: "user_test",
        safety: { risk_band: "none", reason_codes: [] },
        skill_signals: { entry: {}, lifecycle: {}, exit: {} },
        action_reference: null,
        tool_skill_intents: [],
        tool_skill_opportunity: null,
        direct_effects: [],
        memory_plan: {},
      },
      relevant_memory_items: [],
      plan_items: [],
      product_surfaces: [],
      exclusions: [],
    },
  } as any;
}

function emotionalDecision(
  patch: Partial<EmotionalRepairSkillDecision> = {},
): EmotionalRepairSkillDecision {
  const { response_contract: responseContractPatch, ...rest } = patch;
  return {
    skill_id: "emotional_repair",
    intent: "shame_or_guilt",
    phase: "de_shame",
    emotional_dominance: "high",
    context_domain: "work",
    constraints: [],
    operation_suggestions: [],
    memory_write_candidates: [],
    reply:
      "Je reste avec toi doucement: le raté est réel, mais il ne dit pas qui tu es.",
    state_patch: {},
    ...rest,
    response_contract: {
      max_questions: 0,
      allow_plan: false,
      allow_tool_suggestion: false,
      allow_potion_suggestion: false,
      allow_concrete_action: false,
      tone: "soft",
      ...(responseContractPatch ?? {}),
    },
  };
}

Deno.test("emotional_repair normalizes root and decision-wrapped intake contracts", () => {
  const root = emotionalDecision();
  const wrapped = {
    decision: emotionalDecision({ intent: "anxiety_or_panic" }),
  };

  const rootResult = normalizeEmotionalRepairDecision(root);
  const wrappedResult = normalizeEmotionalRepairDecision(wrapped);

  assertEquals(rootResult.errors, []);
  assertEquals(rootResult.decision?.skill_id, "emotional_repair");
  assertEquals(wrappedResult.errors, []);
  assertEquals(wrappedResult.decision?.intent, "anxiety_or_panic");
});

Deno.test("emotional_repair technical fallback preserves structured no-technique constraints", () => {
  const output = reduceEmotionalRepairTurn({
    run_input: {
      ...mockRunInput(),
      user_message: "Reste avec moi sans technique.",
    },
    intake_decision: null,
    intake_errors: ["invalid_response_contract"],
    intake_trace: {
      raw_type: "object",
      top_level_keys: ["decision"],
      has_decision_wrapper: true,
      selected_envelope: "decision",
    },
    explicit_constraints: ["no_technique", "no_protocol", "no_questions"],
  });

  assertEquals(output.response_intent, "technical_intake_failure");
  assert(output.reply);
  assertEquals(
    /respir|expiration|pieds au sol|protocole|technique|micro[- ]?action|\?/i
      .test(output.reply ?? ""),
    false,
  );
  assert((output.diagnosis as any)?.constraints?.includes("no_technique"));
  assertEquals(
    (output.diagnosis as any)?.intake_trace?.selected_envelope,
    "decision",
  );
  assertEquals(output.effects?.committed ?? [], []);
});

Deno.test("emotional_repair anti-FP keeps explicit micro-action allowed", () => {
  const output = reduceEmotionalRepairTurn({
    run_input: {
      ...mockRunInput(),
      user_message: "Donne-moi une micro-action.",
    },
    intake_decision: emotionalDecision({
      intent: "emotion_lowered_action_blocked",
      phase: "action_card_ready",
      emotional_dominance: "low",
      constraints: ["short_reply"],
      response_contract: {
        max_questions: 0,
        allow_plan: false,
        allow_tool_suggestion: false,
        allow_potion_suggestion: false,
        allow_concrete_action: true,
        tone: "grounded",
      },
      reply: "Micro-action: ouvre seulement le mail, sans répondre encore.",
    }),
    intake_errors: [],
  });

  assertEquals(
    output.reply,
    "Micro-action: ouvre seulement le mail, sans répondre encore.",
  );
  assertEquals(
    (output.diagnosis as any)?.response_contract?.allow_concrete_action,
    true,
  );
});
