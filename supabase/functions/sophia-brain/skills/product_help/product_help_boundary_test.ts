import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  normalizeProductHelpLocalDispatcherOutput,
  reduceProductHelpLocalDispatcherOutput,
} from "./local_flow.ts";

Deno.test("product_help boundary keeps bridge-shaped output non executable", () => {
  const output = normalizeProductHelpLocalDispatcherOutput({
    flow_action: "bridge_explanation_only",
    confidence: "high",
    risk_score: 0,
    mode: "standalone",
    product_help_intent: {
      kind: "can_i_do_x",
      summary: "User asks whether a Sophia feature can help.",
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
      needed: true,
      operation_type: null,
      kind: "explain_only",
      executable: false,
      why: "explain only",
    },
    state_updates: {
      status: "answered",
      stage: "bridge_explained",
      turn_count_increment: 1,
      close_after_visible: false,
      preserve_parent_flow: true,
    },
    visible_task: {
      kind: "bridge_explanation_only",
      instruction: "Explain the destination without starting anything.",
      conversation_context: {},
    },
    return_to_parent: {
      needed: false,
      parent_skill_id: null,
      return_summary: null,
      preserve_parent_state: true,
    },
    note_information: null,
    exit_memo: {
      needed: false,
      reason: "none",
      user_intent_summary: null,
      local_flow_context: {
        skill_id: "product_help",
        mode: "standalone",
        stage: "bridge_explained",
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
    evidence: ["feature_catalog"],
  });

  assertEquals(output.bridge.operation_type, null);
  assertEquals(output.bridge.kind, "explain_only");

  const reduced = reduceProductHelpLocalDispatcherOutput({
    previous: null,
    output,
    catalogCandidates: [],
    parentFlowContext: null,
    productSurfaces: [],
    recentCommittedEffects: [],
    userMessage: "Sophia peut m'aider avec quelle option ?",
  });

  assertEquals(reduced.exit_to_global_dispatcher, false);
  assertEquals(reduced.blocked_effects, []);
  assertEquals(reduced.note_information, null);
});
