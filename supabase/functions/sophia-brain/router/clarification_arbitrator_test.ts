import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";
import { readClarificationState } from "../clarification/state.ts";
import {
  maybeStartActiveSkillClarification,
  maybeStartDispatcherClarification,
} from "./clarification_arbitrator.ts";

function frame(): TurnFrame {
  return {
    turn_id: "turn-1",
    source_message_id: "msg-1",
    user_id: "user-1",
    channel: "web",
    safety: { risk_band: "low", reason_codes: [], evidence: [] },
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
  };
}

Deno.test("clarification_arbitrator: output ask route vers orientation_clarification", async () => {
  const result = await maybeStartDispatcherClarification({
    turnFrame: frame(),
    userMessage: "message ambigu",
    recentMessages: [],
    tempMemory: {},
    llmRunner: async () => ({
      status: "ask",
      confidence: "medium",
      question: "Tu veux plutôt un rappel ponctuel ou récurrent ?",
    }),
  });

  assertEquals(result.status, "ask");
  if (result.status !== "ask") throw new Error("expected ask");
  assertEquals(
    result.routeDecision.response_owner,
    "orientation_clarification",
  );
  assertEquals(
    result.routeDecision.selected_handler,
    "orientation_clarification",
  );
  assertEquals(result.routeDecision.direct_effects_to_run, []);
  assertEquals(result.turnFrame.direct_effects, []);
  assertEquals(result.turnFrame.tool_skill_intents, []);
  assertEquals(
    readClarificationState(result.tempMemory)?.no_chat_mutation,
    true,
  );
});

Deno.test("clarification_arbitrator: attack + defense card intents demandent clarification sans tool skill", async () => {
  const turnFrame = frame();
  turnFrame.direct_effects = [];
  turnFrame.tool_skill_intents = [{
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
  }];

  const result = await maybeStartDispatcherClarification({
    turnFrame,
    userMessage:
      "J'aimerais créer une carte de défense et une carte d'attaque.",
    recentMessages: [],
    tempMemory: {},
    llmRunner: async (input) => {
      const request = JSON.parse(input.user_prompt);
      assertEquals(
        request.candidates.map((candidate: { id: string }) => candidate.id),
        ["prepare_defense_card", "prepare_attack_card"],
      );
      return {
        status: "ask",
        confidence: "medium",
        question:
          "Tu veux commencer par la carte de défense ou la carte d'attaque ?",
      };
    },
  });

  assertEquals(result.status, "ask");
  if (result.status !== "ask") throw new Error("expected ask");
  assertEquals(
    result.routeDecision.response_owner,
    "orientation_clarification",
  );
  assertEquals(result.routeDecision.direct_effects_to_run, []);
  assertEquals(result.turnFrame.tool_skill_intents, []);
  assertEquals(
    result.visibleQuestion,
    "Tu veux commencer par la carte de défense ou la carte d'attaque ?",
  );
});

Deno.test("clarification_arbitrator: clarification supprime les exécutables mais conserve les skills conversationnels", async () => {
  const turnFrame = frame();
  turnFrame.skill_signals = {
    entry: {
      demotivation_repair: {
        detected: true,
        confidence_band: "high",
        reason: "structured_demotivation_repair",
      },
      select_state_potion: {
        detected: true,
        confidence_band: "high",
        reason: "structured_state_potion",
      },
    },
    lifecycle: {},
    exit: {},
  };

  const result = await maybeStartDispatcherClarification({
    turnFrame,
    userMessage: "message ambigu",
    recentMessages: [],
    tempMemory: {},
    llmRunner: async () => ({
      status: "ask",
      confidence: "medium",
      question: "Tu veux plutôt un rappel ponctuel ou récurrent ?",
    }),
  });

  assertEquals(result.status, "ask");
  if (result.status !== "ask") throw new Error("expected ask");
  assertEquals(result.turnFrame.direct_effects, []);
  assertEquals(result.turnFrame.tool_skill_intents, []);
  assertEquals(
    result.turnFrame.skill_signals?.entry?.demotivation_repair,
    {
      detected: true,
      confidence_band: "high",
      reason: "structured_demotivation_repair",
    },
  );
  assertEquals(
    result.turnFrame.skill_signals?.entry?.select_state_potion,
    undefined,
  );
});

Deno.test("clarification_arbitrator: skill actif possède la clarification interne", async () => {
  const turnFrame = frame();
  turnFrame.direct_effects = [];
  turnFrame.tool_skill_intents = [];
  turnFrame.tool_skill_opportunity = {
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
  };
  turnFrame.skill_signals = {
    entry: {
      product_help: {
        detected: true,
        confidence_band: "high",
        reason: "structured_product_help_noise",
      },
    },
  };

  const result = await maybeStartActiveSkillClarification({
    turnFrame,
    activeSkillState: {
      skill_id: "emotional_repair",
      working_state: { phase: "awaiting_clarification" },
    },
    userMessage: "message ambigu dans le flow actif",
    recentMessages: [],
    tempMemory: {},
    llmRunner: async () => ({
      status: "ask",
      confidence: "medium",
      question: "Tu veux plutôt rester sur le soutien ou ajuster le plan ?",
    }),
  });

  assertEquals(result.status, "ask");
  if (result.status !== "ask") throw new Error("expected ask");
  assertEquals(
    result.routeDecision.response_owner,
    "orientation_clarification",
  );
  assertEquals(
    readClarificationState(result.tempMemory)?.owner,
    "emotional_repair",
  );
  assertEquals(
    readClarificationState(result.tempMemory)?.candidates.map((candidate) =>
      candidate.id
    ),
    ["emotional_repair", "adjust_plan_item"],
  );
});

Deno.test("clarification_arbitrator: demotivation actif peut demander une clarification interne", async () => {
  const turnFrame = frame();
  turnFrame.direct_effects = [];
  turnFrame.tool_skill_intents = [];

  const result = await maybeStartActiveSkillClarification({
    turnFrame,
    activeSkillState: {
      skill_id: "demotivation_repair",
      working_state: { phase: "sorting_demotivation_source" },
    },
    userMessage: "j'hésite sur ce qui me bloque",
    recentMessages: [],
    tempMemory: {},
    llmRunner: async (input) => {
      const request = JSON.parse(input.user_prompt);
      assertEquals(
        request.candidates.map((candidate: { id: string }) => candidate.id),
        [
          "demotivation_loss_of_meaning",
          "demotivation_fatigue",
          "prepare_attack_card",
          "adjust_plan_item",
        ],
      );
      return {
        status: "ask",
        confidence: "medium",
        question:
          "Qu'est-ce qui pèse le plus : le sens, la fatigue, l'action trop grosse ou le plan ?",
      };
    },
  });

  assertEquals(result.status, "ask");
  if (result.status !== "ask") throw new Error("expected ask");
  assertEquals(
    result.routeDecision.response_owner,
    "orientation_clarification",
  );
  assertEquals(
    readClarificationState(result.tempMemory)?.owner,
    "demotivation_repair",
  );
  assertEquals(
    readClarificationState(result.tempMemory)?.no_chat_mutation,
    true,
  );
});

Deno.test("clarification_arbitrator: résolution interne demotivation revient au skill owner", async () => {
  const turnFrame = frame();
  turnFrame.direct_effects = [];
  turnFrame.tool_skill_intents = [];

  const result = await maybeStartActiveSkillClarification({
    turnFrame,
    activeSkillState: {
      skill_id: "demotivation_repair",
      working_state: { phase: "diagnose" },
    },
    userMessage: "c'est surtout la fatigue",
    recentMessages: [],
    tempMemory: {},
    llmRunner: async () => ({
      status: "resolved",
      selected_candidate_id: "demotivation_fatigue",
      confidence: "high",
    }),
  });

  assertEquals(result.status, "resolved");
  if (result.status !== "resolved") throw new Error("expected resolved");
  assertEquals(result.output.selected_candidate_id, "demotivation_repair");
  assertEquals(
    result.output.handoff_notes?.known_slots
      ?.clarified_internal_candidate_id,
    "demotivation_fatigue",
  );
  assertEquals(readClarificationState(result.tempMemory), null);
  assertEquals(result.turnFrame.direct_effects, []);
  assertEquals(result.turnFrame.tool_skill_intents, []);
});

Deno.test("clarification_arbitrator: weekly actif peut clarifier recap ou ajustement", async () => {
  const turnFrame = frame();
  turnFrame.direct_effects = [];
  turnFrame.tool_skill_intents = [];

  const result = await maybeStartActiveSkillClarification({
    turnFrame,
    activeSkillState: {
      skill_id: "weekly_adaptive_review_v1",
      working_state: { phase: "weekly_review_discussion" },
    },
    userMessage: "j'hésite entre récap et ajuster",
    recentMessages: [],
    tempMemory: {},
    llmRunner: async () => ({
      status: "ask",
      confidence: "medium",
      question: "Tu veux un récap clair ou préparer un ajustement du plan ?",
    }),
  });

  assertEquals(result.status, "ask");
  if (result.status !== "ask") throw new Error("expected ask");
  assertEquals(
    result.routeDecision.selected_handler,
    "orientation_clarification",
  );
  assertEquals(
    readClarificationState(result.tempMemory)?.owner,
    "weekly_adaptive_review_v1",
  );
  assertEquals(result.routeDecision.direct_effects_to_run, []);
});

Deno.test("clarification_arbitrator: invalid model output fallback reste une question neutre", async () => {
  const result = await maybeStartDispatcherClarification({
    turnFrame: frame(),
    userMessage: "message ambigu",
    recentMessages: [],
    tempMemory: {},
    llmRunner: async () => "not-json",
  });

  assertEquals(result.status, "ask");
  if (result.status !== "ask") throw new Error("expected ask");
  assertEquals(
    result.visibleQuestion,
    "Tu veux plutôt un rappel ponctuel, ou un rappel récurrent ?",
  );
});

Deno.test("clarification_arbitrator: output resolved ne crée aucun effet immédiat", async () => {
  const result = await maybeStartDispatcherClarification({
    turnFrame: frame(),
    userMessage: "message ambigu",
    recentMessages: [],
    tempMemory: {},
    llmRunner: async () => ({
      status: "resolved",
      selected_candidate_id: "create_recurring_reminder",
      confidence: "high",
    }),
  });

  assertEquals(result.status, "resolved");
  if (result.status !== "resolved") throw new Error("expected resolved");
  assertEquals(
    result.selectedCandidate?.operation_type,
    "create_recurring_reminder",
  );
  assertEquals(result.turnFrame.direct_effects, []);
  assertEquals(result.turnFrame.tool_skill_intents, []);
  assertEquals(readClarificationState(result.tempMemory), null);
});

Deno.test("clarification_arbitrator: aucun appel LLM sous safety critique", async () => {
  let called = false;
  const unsafe = frame();
  unsafe.safety = {
    risk_band: "critical",
    reason_codes: ["safety"],
    evidence: [],
  };
  const result = await maybeStartDispatcherClarification({
    turnFrame: unsafe,
    userMessage: "message ambigu",
    recentMessages: [],
    tempMemory: {},
    llmRunner: async () => {
      called = true;
      return {};
    },
  });

  assertEquals(result.status, "none");
  assertEquals(called, false);
});
