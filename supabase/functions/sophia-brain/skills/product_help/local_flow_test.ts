import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import type { TurnFrame } from "../../contracts/turn_frame.v1.ts";
import { runConversationRouters } from "../../routers/routers.ts";
import { runProductHelpSkill } from "./skill.ts";
import {
  normalizeProductHelpLocalDispatcherOutput,
  reduceProductHelpLocalDispatcherOutput,
} from "./local_flow.ts";
import { retrieveProductHelpCandidates } from "./retrieval.ts";
import type { ProductHelpVisibleAgentInput } from "./visible_agent.ts";

type AssertNever<T extends never> = T;
type _ProductHelpVisibleInputHasNoLegacyFields = AssertNever<
  Extract<
    keyof ProductHelpVisibleAgentInput,
    "user_message" | "recent_messages" | "local_state" | "draft"
  >
>;

function localDecision(patch: Record<string, unknown> = {}) {
  return normalizeProductHelpLocalDispatcherOutput({
    flow_action: "answer_product_question",
    confidence: "high",
    risk_score: 0,
    mode: "standalone",
    product_help_intent: {
      kind: "explain_feature",
      summary: "explains attack card",
    },
    target: {
      kind: "feature_catalog",
      feature_id: "resources.attack_card",
      object_type: "attack_card",
      object_ref: null,
      confidence: "high",
    },
    grounding: {
      catalog_feature_ids: ["resources.attack_card"],
      surface_ids: [],
      db_sources_required: false,
      db_sources_used: [],
      active_flow_used: false,
      missing_grounding_reason: null,
    },
    bridge: {
      needed: false,
      operation_type: null,
      kind: null,
      executable: false,
      why: null,
    },
    state_updates: {
      status: "open",
      stage: "answering",
      turn_count_increment: 1,
      close_after_visible: false,
      preserve_parent_flow: true,
    },
    visible_task: {
      kind: "answer_product_question",
      instruction: "answer",
    },
    return_to_parent: {
      needed: false,
      parent_skill_id: null,
      return_summary: null,
      preserve_parent_state: true,
    },
    exit_memo: {
      needed: false,
      reason: "none",
      user_intent_summary: null,
      local_flow_context: {
        skill_id: "product_help",
        mode: "standalone",
        stage: null,
        last_answer_summary: null,
        parent_skill_id: null,
        committed_effects: [],
      },
      handoff_hint_for_global_dispatcher: {
        likely_intent: "unknown",
        why: null,
        constraints: [],
      },
    },
    evidence: ["test"],
    ...patch,
  });
}

function candidates() {
  return retrieveProductHelpCandidates("c'est quoi une carte d'attaque ?");
}

function reduce(patch: Record<string, unknown> = {}) {
  return reduceProductHelpLocalDispatcherOutput({
    previous: null,
    output: localDecision(patch),
    catalogCandidates: candidates(),
    parentFlowContext: null,
    productSurfaces: [],
    recentCommittedEffects: [],
  });
}

Deno.test("product_help local dispatcher prompt documents field completion rules", async () => {
  const source = await Deno.readTextFile(
    new URL("./local_flow.ts", import.meta.url),
  );
  assert(source.includes("Field Completion Rules:"));
  assert(source.includes("- flow_action: decision principale"));
  assert(source.includes("- product_help_intent.kind:"));
  assert(source.includes("- target: decrit la cible produit ou objet."));
  assert(source.includes("- grounding: liste uniquement les sources"));
  assert(source.includes("- bridge: decrit la frontiere"));
  assert(source.includes("- state_updates: etat local minimal."));
  assert(source.includes("- visible_task.conversation_context:"));
  assert(source.includes("- return_to_parent:"));
  assert(source.includes("- exit_memo:"));
  assert(source.includes("- note_information: obligatoire"));
  assert(source.includes("- evidence: indices semantiques"));
  assert(source.includes("Transition Rules:"));
  assert(source.includes("- stop_local_no_handoff:"));
  assert(source.includes("- exit_to_global_dispatcher:"));
  assert(source.includes("- safety_preempt:"));
  assert(source.includes("- handoff_to_local_dispatcher:"));
  assert(source.includes("- inline_status_roundtrip:"));
  assertEquals((source.match(/Example JSON [12]/g) ?? []).length, 2);
});

Deno.test("product_help local dispatcher classifies expected visible actions", () => {
  for (
    const action of [
      "answer_product_question",
      "answer_destination",
      "compare_features",
      "explain_limit",
      "bridge_explanation_only",
      "apply_attempt",
      "inline_tool_return",
      "stop_local_no_handoff",
    ]
  ) {
    const output = localDecision({
      flow_action: action,
      visible_task: {
        kind: action === "stop_local_no_handoff"
          ? "stop_or_cancel"
          : action === "inline_tool_return"
          ? "inline_tool_return"
          : action === "apply_attempt"
          ? "apply_attempt"
          : action,
        instruction: action,
      },
    });
    assertEquals(output.flow_action, action);
    assertEquals(output.bridge.executable, false);
  }
});

Deno.test("product_help local dispatcher rejects mutation fields", () => {
  assertThrows(
    () =>
      normalizeProductHelpLocalDispatcherOutput({
        ...localDecision(),
        operation_suggestions: [{ operation_type: "prepare_attack_card" }],
      }),
    Error,
    "forbidden_operation_suggestions",
  );
});

Deno.test("product_help visible context preserves user constraints", () => {
  const reduced = reduce({
    flow_action: "answer_product_question",
    visible_task: {
      kind: "answer_product_question",
      instruction: "answer without status recap",
      conversation_context: {
        state_summary: "navigation-only answer requested",
        user_words: ["dis-moi juste ou verifier, pas son statut"],
        field_or_stage: "answering",
        known_values: {
          user_constraint: "navigation_only_no_status_recap",
        },
        missing_or_weak_values: ["real object status is not grounded"],
        selected_candidate: {},
        handoff_data: {},
        tone_constraints: ["navigation_only"],
        do_not_say: ["do not render a status recap"],
        context_summary: "User asks for product navigation, not DB status.",
        evidence_used: ["pas son statut"],
      },
    },
  });
  assertEquals(
    reduced.conversation_context.known_values.user_constraint,
    "navigation_only_no_status_recap",
  );
  assert(reduced.conversation_context.tone_constraints.includes(
    "navigation_only",
  ));
  assert(reduced.conversation_context.do_not_say.includes(
    "do not render a status recap",
  ));
  assertEquals(reduced.exit_to_global_dispatcher, false);
});

Deno.test("product_help apply_attempt remains non-mutating", () => {
  const reduced = reduce({
    flow_action: "apply_attempt",
    product_help_intent: {
      kind: "tool_action_request",
      summary: "user asks product_help to create it",
    },
    visible_task: { kind: "apply_attempt", instruction: "no mutation" },
    bridge: {
      needed: true,
      operation_type: "prepare_attack_card",
      kind: "handoff_needed",
      executable: false,
      why: "tool flow belongs elsewhere",
    },
  });
  assertEquals(reduced.reason_code, "product_help_apply_attempt_no_mutation");
  assertEquals(reduced.blocked_effects, []);
  assertEquals(reduced.exit_to_global_dispatcher, false);
});

Deno.test("product_help inline returns to parent without durable product state", () => {
  const output = localDecision({
    mode: "inline",
    flow_action: "return_to_parent_flow",
    return_to_parent: {
      needed: true,
      parent_skill_id: "adjust_plan_item",
      return_summary: "answered location",
      preserve_parent_state: true,
    },
  });
  const reduced = reduceProductHelpLocalDispatcherOutput({
    previous: null,
    output,
    catalogCandidates: candidates(),
    parentFlowContext: { skill_id: "adjust_plan_item", slot: "kept" },
    productSurfaces: [],
    recentCommittedEffects: [],
  });
  assertEquals(reduced.return_to_parent_flow, true);
  assertEquals(reduced.local_state, null);
});

Deno.test("product_help visible task carries conversation_context", () => {
  const reduced = reduce();
  assertEquals(reduced.conversation_context.known_values.target, {
    kind: "feature_catalog",
    feature_id: "resources.attack_card",
    object_type: "attack_card",
    object_ref: null,
    confidence: "high",
  });
  assert(
    Array.isArray(
      (reduced.conversation_context.known_values as any)
        .catalog_answer_material,
    ),
  );
});

Deno.test("product_help exit_to_global_dispatcher requires note_information", () => {
  const reduced = reduce({
    flow_action: "exit_to_global_dispatcher",
    exit_memo: { needed: false, reason: "none" },
  });
  assertEquals(reduced.status, "blocked");
  assertEquals(reduced.reason_code, "product_help_note_information_required");
});

Deno.test("product_help exit_to_global_dispatcher creates standard note from exit memo", () => {
  const reduced = reduce({
    flow_action: "exit_to_global_dispatcher",
    exit_memo: {
      needed: true,
      reason: "topic_change",
      user_intent_summary: "user wants another topic",
      local_flow_context: {
        skill_id: "product_help",
        mode: "standalone",
        stage: "answering",
        last_answer_summary: "attack card explained",
        parent_skill_id: null,
        committed_effects: [],
      },
      handoff_hint_for_global_dispatcher: {
        likely_intent: "normal_coaching",
        why: "clear topic change",
        constraints: [],
      },
    },
  });
  assertEquals(reduced.status, "exit");
  assertEquals(reduced.exit_to_global_dispatcher, true);
  assertEquals(reduced.note_information?.source_flow_id, "product_help");
  assertEquals(reduced.note_information?.target_dispatcher, "global");
});

Deno.test("product_help stop_local_no_handoff closes locally without global", () => {
  const reduced = reduce({
    flow_action: "stop_local_no_handoff",
    product_help_intent: {
      kind: "close",
      summary: "user stops product help",
    },
  });
  assertEquals(reduced.status, "closing");
  assertEquals(reduced.visible_task, "stop_or_cancel");
  assertEquals(reduced.exit_to_global_dispatcher, false);
  assertEquals(reduced.handoff_to_local_dispatcher, false);
});

Deno.test("product_help follow-up continuation does not exit falsely", () => {
  const reduced = reduce({
    flow_action: "answer_product_question",
    product_help_intent: {
      kind: "how_to",
      summary: "user continues asking how product help works",
    },
    visible_task: {
      kind: "answer_product_question",
      instruction: "continue local product help",
      conversation_context: {
        state_summary: "User continues product help.",
        user_words: ["ok et comment je m'en sers apres ?"],
        field_or_stage: "answering",
        known_values: {},
        missing_or_weak_values: [],
        selected_candidate: {},
        handoff_data: {},
        tone_constraints: [],
        do_not_say: [],
        context_summary: "Continuation, not exit.",
        evidence_used: ["follow-up product question"],
      },
    },
    exit_memo: {
      needed: false,
      reason: "none",
      user_intent_summary: null,
      local_flow_context: {
        skill_id: "product_help",
        mode: "standalone",
        stage: "answering",
        last_answer_summary: "previous product answer",
        parent_skill_id: null,
        committed_effects: [],
      },
      handoff_hint_for_global_dispatcher: {
        likely_intent: "unknown",
        why: null,
        constraints: [],
      },
    },
  });
  assertEquals(reduced.exit_to_global_dispatcher, false);
  assertEquals(reduced.handoff_to_local_dispatcher, false);
  assertEquals(reduced.note_information, null);
  assertEquals(reduced.visible_task, "answer_product_question");
});

Deno.test("product_help handoff_to_local_dispatcher requires and carries note", () => {
  const reduced = reduce({
    flow_action: "handoff_to_local_dispatcher",
    product_help_intent: {
      kind: "tool_action_request",
      summary: "user wants an attack card flow",
    },
    bridge: {
      needed: true,
      operation_type: "prepare_attack_card",
      kind: "handoff_needed",
      executable: false,
      why: "target flow must take over",
    },
    exit_memo: {
      needed: true,
      reason: "explicit_tool_request",
      user_intent_summary: "prepare an attack card",
      local_flow_context: {
        skill_id: "product_help",
        mode: "standalone",
        stage: "bridge_explained",
        last_answer_summary: "attack card explained",
        parent_skill_id: null,
        committed_effects: [],
      },
      handoff_hint_for_global_dispatcher: {
        likely_intent: "prepare_attack_card",
        why: "explicit tool request",
        constraints: [],
      },
    },
  });
  assertEquals(reduced.status, "handoff");
  assertEquals(reduced.handoff_to_local_dispatcher, true);
  assertEquals(
    reduced.note_information?.target_dispatcher,
    "prepare_attack_card",
  );
});

Deno.test("product_help safety_preempt creates safety note without global", () => {
  const reduced = reduce({
    flow_action: "safety_preempt",
    risk_score: 8,
    product_help_intent: {
      kind: "safety",
      summary: "safety signal",
    },
  });
  assertEquals(reduced.status, "safety");
  assertEquals(reduced.exit_to_global_dispatcher, false);
  assertEquals(reduced.handoff_to_local_dispatcher, true);
  assertEquals(reduced.note_information?.target_dispatcher, "safety_crisis");
});

Deno.test("product_help real object status without grounding is prudent", () => {
  const reduced = reduce({
    flow_action: "answer_product_question",
    product_help_intent: {
      kind: "object_status_question",
      summary: "asks if reminder exists",
    },
    target: {
      kind: "user_object",
      feature_id: "initiatives",
      object_type: "one_shot_reminder",
      object_ref: null,
      confidence: "medium",
    },
    grounding: {
      catalog_feature_ids: ["initiatives"],
      surface_ids: [],
      db_sources_required: true,
      db_sources_used: [],
      active_flow_used: false,
      missing_grounding_reason: "no committed source",
    },
  });
  assertEquals(reduced.visible_task, "explain_limit");
});

Deno.test("product_help skill nominal path uses local dispatcher and visible agent", async () => {
  let inboundNoteTarget: string | null = null;
  let inboundNoteSource: string | null = null;
  let visibleInput: Record<string, unknown> | null = null;
  const output = await runProductHelpSkill({
    user_message: "c'est quoi une carte d'attaque ?",
    context: {
      skill_id: "product_help",
      user_id: "user_test",
      recent_messages: [],
      active_skill_working_state: null,
      turn_frame: frame(),
      relevant_memory_items: [],
      plan_items: [],
      product_surfaces: [],
      exclusions: [],
    } as any,
    local_dispatcher: async (input) => {
      inboundNoteTarget = input.note_information_inbound?.target_dispatcher ??
        null;
      inboundNoteSource = input.note_information_inbound?.source_flow_id ??
        null;
      return localDecision();
    },
    visible_agent: async (input) => {
      visibleInput = input as unknown as Record<string, unknown>;
      return "Une carte d'attaque sert a preparer le demarrage.";
    },
  });
  assertEquals(output.skill_id, "product_help");
  assertEquals(output.operation_suggestions, []);
  assertEquals(output.effects?.requested, []);
  assertEquals(output.effects?.allowed, []);
  assertEquals(output.effects?.committed, []);
  assertEquals((output.diagnosis as any).local_flow, true);
  assertEquals(inboundNoteSource, "global");
  assertEquals(inboundNoteTarget, "product_help");
  assertEquals(Boolean((visibleInput as any)?.conversation_context), true);
  assertEquals("user_message" in ((visibleInput as any) ?? {}), false);
  assertEquals("recent_messages" in ((visibleInput as any) ?? {}), false);
  assertEquals("local_state" in ((visibleInput as any) ?? {}), false);
});

function frame(patch: Partial<TurnFrame> = {}): TurnFrame {
  return {
    turn_id: "t1",
    source_message_id: "m1",
    user_id: "u1",
    channel: "whatsapp",
    safety: { risk_band: "none", reason_codes: [], evidence: [] },
    conversation_risk: {
      score: 0,
      threshold: 8,
      should_exit_flows: false,
      reason_codes: [],
      previous_scores: [],
      matrix: [],
      context_summary: null,
    },
    direct_effects: [],
    tool_skill_intents: [],
    flow_opportunity: null,
    skill_signals: {},
    memory_plan: {
      response_intent: "reflection",
      reasoning_complexity: "low",
      context_need: "minimal",
      memory_mode: "none",
      model_tier_hint: "lite",
      context_budget_tier: "tiny",
      targets: [],
      retrieval_policy: "semantic_first",
      plan_confidence: 0.7,
    },
    ...patch,
  };
}

Deno.test("active product_help routes to local owner on followup", () => {
  const route = runConversationRouters({
    turn_frame: frame(),
    active_skill_state: {
      skill_id: "product_help",
      status: "active",
      working_state: {
        product_help_local_state: {
          skill_id: "product_help",
          status: "open",
          mode: "standalone",
          product_help_state: {
            stage: "answering",
            last_intent: "explain_feature",
            last_target: {},
            last_answer_summary: "attack card explained",
            last_catalog_feature_ids: ["resources.attack_card"],
            last_locations: [],
            parent_flow_context: null,
            turn_count: 1,
            max_turns: 3,
            updated_at: "2026-06-08T10:00:00.000Z",
          },
        },
      },
    },
    safety_pregate_risk_band: "none",
  });
  assertEquals(route.response_owner, "product_help");
  assertEquals(route.selected_handler, "product_help");
  assertEquals(
    route.reason_code,
    "active_product_help_local_dispatcher_continue",
  );
});
