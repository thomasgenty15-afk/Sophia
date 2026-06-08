import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import type { TurnFrame } from "../../contracts/turn_frame.v1.ts";
import { runConversationRouters } from "../../routers/routers.ts";
import { runProductHelpSkill } from "./skill.ts";
import {
  normalizeProductHelpLocalDispatcherOutput,
  reduceProductHelpLocalDispatcherOutput,
} from "./local_flow.ts";
import { retrieveProductHelpCandidates } from "./retrieval.ts";

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

Deno.test("product_help local dispatcher classifies expected visible actions", () => {
  for (
    const action of [
      "answer_product_question",
      "answer_destination",
      "compare_features",
      "explain_limit",
      "bridge_explanation_only",
      "apply_attempt",
    ]
  ) {
    const output = localDecision({
      flow_action: action,
      visible_task: {
        kind: action === "apply_attempt" ? "apply_attempt" : action,
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

Deno.test("product_help exit_to_global_dispatcher requires exit_memo", () => {
  const reduced = reduce({
    flow_action: "exit_to_global_dispatcher",
    exit_memo: { needed: false, reason: "none" },
  });
  assertEquals(reduced.status, "blocked");
  assertEquals(reduced.reason_code, "product_help_exit_memo_required");
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
    local_dispatcher: async () => localDecision(),
    visible_agent: async () =>
      "Une carte d'attaque sert a preparer le demarrage.",
  });
  assertEquals(output.skill_id, "product_help");
  assertEquals(output.operation_suggestions, []);
  assertEquals(output.effects?.requested, []);
  assertEquals(output.effects?.allowed, []);
  assertEquals(output.effects?.committed, []);
  assertEquals((output.diagnosis as any).local_flow, true);
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
