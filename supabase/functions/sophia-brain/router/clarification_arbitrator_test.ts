import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";
import { readClarificationLocalState } from "../clarification/state.ts";
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

function localDispatcherJson(args: {
  flow_action?:
    | "ask_disambiguation"
    | "resolved_to_candidate"
    | "get_info_product";
  confidence?: "low" | "medium" | "high";
  selected_candidate_id?: string | null;
  question?: string | null;
  user_words?: string[];
}) {
  const flowAction = args.flow_action ?? "ask_disambiguation";
  const selected = args.selected_candidate_id ?? null;
  const userWords = args.user_words ?? ["message ambigu"];
  return {
    flow_action: flowAction,
    confidence: args.confidence ?? "medium",
    risk_score: 0,
    clarification_state: {
      clarification_id: "clar-test",
      status: flowAction === "resolved_to_candidate" ? "resolved" : "asking",
      source_dispatcher: "global",
      source_flow_id: null,
      ambiguity_kind: "intent",
      ambiguity_axes: ["intent"],
      conflict_summary: "Sophia hesite entre plusieurs directions plausibles.",
      selected_candidate_id: selected,
      selected_candidate_label: null,
      why_selected_or_not: "test dispatcher output",
      user_words: userWords,
      turn_count: 0,
    },
    inline_info: {
      requested: flowAction === "get_info_product",
      kind: flowAction === "get_info_product" ? "product" : null,
      question_to_answer: flowAction === "get_info_product"
        ? args.question ?? userWords[0] ?? null
        : null,
      resume_clarification_goal: null,
    },
    visible_task: {
      kind: flowAction === "resolved_to_candidate"
        ? "resolved_transition"
        : flowAction === "get_info_product"
        ? "inline_info_return"
        : "ask_choice",
      conversation_context: {
        question_goal: "clarifier la direction utile",
        conflict_summary:
          "Sophia hesite entre plusieurs directions plausibles.",
        candidate_labels: [],
        selected_candidate_label: null,
        known_references: [],
        best_reference_guess: null,
        missing_decision: null,
        question_constraints: {
          max_questions: 1,
          should_confirm_guess: false,
          should_offer_options: true,
          must_not_list_all_references: true,
          must_not_explain_internals: true,
        },
        question: args.question ?? null,
        user_words: userWords,
        evidence_used: ["test"],
        do_not_say: ["dispatcher", "candidate_id", "note_information"],
        tone_constraints: ["whatsapp", "court", "tutoiement"],
      },
    },
    note_information: {
      needed: flowAction !== "ask_disambiguation",
      source_flow_id: "clarification",
      source_flow_presentation: "clarification",
      handoff_reason: flowAction === "get_info_product"
        ? "inline_tool"
        : flowAction === "resolved_to_candidate"
        ? "clarification_resolved"
        : "none",
      target_dispatcher: flowAction === "get_info_product"
        ? "product_help"
        : null,
      handoff_context_for_next_dispatcher: null,
      target_local_dispatcher_hint: null,
      structured_context: {},
    },
    evidence: ["test"],
  };
}

Deno.test("clarification_arbitrator: output ask route vers orientation_clarification", async () => {
  const result = await maybeStartDispatcherClarification({
    turnFrame: frame(),
    userMessage: "message ambigu",
    recentMessages: [],
    tempMemory: {},
    llmRunner: async () =>
      localDispatcherJson({
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
    readClarificationLocalState(result.tempMemory)?.no_chat_mutation,
    true,
  );
});

Deno.test("clarification_arbitrator: fallback visible ne reprend pas le vouvoiement", async () => {
  const result = await maybeStartDispatcherClarification({
    turnFrame: frame(),
    userMessage: "message ambigu",
    recentMessages: [],
    tempMemory: {},
    llmRunner: async () =>
      localDispatcherJson({
        question: "Souhaitez-vous préparer votre carte ?",
      }),
    visibleAgent: async () => null,
  });

  assertEquals(result.status, "ask");
  if (result.status !== "ask") throw new Error("expected ask");
  assertEquals(
    result.visibleQuestion,
    "Tu peux préciser ce que tu veux choisir ?",
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
      assertEquals(
        request.db_context_pack.version,
        "clarification_context_pack_v1",
      );
      assertEquals(request.micro_memory_context.budget.max_items, 0);
      return localDispatcherJson({
        question:
          "Tu veux commencer par la carte de défense ou la carte d'attaque ?",
      });
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
    llmRunner: async () =>
      localDispatcherJson({
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
  turnFrame.tool_skill_intents = [{
    operation_type: "adjust_plan_item",
    explicitness: "explicit",
    confidence_band: "high",
    ambiguity: "target_ambiguous",
    user_intent: "adjust",
  }];
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
    llmRunner: async () =>
      localDispatcherJson({
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
    readClarificationLocalState(result.tempMemory)?.source_flow_id,
    "emotional_repair",
  );
  assertEquals(
    readClarificationLocalState(result.tempMemory)?.candidate_signals.map((
      candidate,
    ) => candidate.candidate_id),
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
      return localDispatcherJson({
        question:
          "Qu'est-ce qui pèse le plus : le sens, la fatigue, l'action trop grosse ou le plan ?",
      });
    },
  });

  assertEquals(result.status, "ask");
  if (result.status !== "ask") throw new Error("expected ask");
  assertEquals(
    result.routeDecision.response_owner,
    "orientation_clarification",
  );
  assertEquals(
    readClarificationLocalState(result.tempMemory)?.source_flow_id,
    "demotivation_repair",
  );
  assertEquals(
    readClarificationLocalState(result.tempMemory)?.no_chat_mutation,
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
    llmRunner: async () =>
      localDispatcherJson({
        flow_action: "resolved_to_candidate",
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
  assertEquals(readClarificationLocalState(result.tempMemory), null);
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
    llmRunner: async () =>
      localDispatcherJson({
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
    readClarificationLocalState(result.tempMemory)?.source_flow_id,
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
    llmRunner: async () =>
      localDispatcherJson({
        flow_action: "resolved_to_candidate",
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
  assertEquals(readClarificationLocalState(result.tempMemory), null);
});

Deno.test("clarification_arbitrator: get_info_product appelle inline et garde clarification active", async () => {
  let called = false;
  const result = await maybeStartDispatcherClarification({
    turnFrame: frame(),
    userMessage: "c'est quoi un rappel récurrent ?",
    recentMessages: [],
    tempMemory: {},
    llmRunner: async () =>
      localDispatcherJson({
        flow_action: "get_info_product",
        question: "c'est quoi un rappel récurrent ?",
        user_words: ["c'est quoi un rappel récurrent ?"],
      }),
    runInlineGetInfoProduct: async (args) => {
      called = true;
      assertEquals(args.context.active_flow, "clarification");
      return {
        content: "Un rappel récurrent revient selon un rythme.",
        context: args.context,
        subskillRun: { skill_id: "product_help" },
        runtimeTrace: [{ event: "inline_product_called" }],
      };
    },
  });

  assertEquals(called, true);
  assertEquals(result.status, "ask");
  if (result.status !== "ask") throw new Error("expected ask");
  assertEquals(
    result.visibleQuestion,
    "Un rappel récurrent revient selon un rythme.",
  );
  assertEquals(
    readClarificationLocalState(result.tempMemory)?.skill_id,
    "clarification",
  );
  assertEquals(result.turnFrame.direct_effects, []);
  assertEquals(result.turnFrame.tool_skill_intents, []);
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
