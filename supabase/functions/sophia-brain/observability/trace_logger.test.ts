import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  type ConversationTurnTrace,
  logConversationTurn,
  setConversationTraceSinkForTest,
} from "./trace_logger.ts";

Deno.test("trace logger writes to injectable sink", async () => {
  const traces: ConversationTurnTrace[] = [];
  setConversationTraceSinkForTest((trace) => {
    traces.push(trace);
  });
  await logConversationTurn({
    turn_id: "t1",
    user_id: "u1",
    source_message_id: "m1",
    ts: "2026-05-04T10:00:00.000Z",
    safety_context: {
      detected: false,
      risk_band: "none",
      reason_codes: [],
      evidence: [],
      layer_contributions: {
        lexical: false,
        heuristic: false,
        dispatcher_llm: false,
      },
      allow_side_effects: true,
    },
    dispatcher_run: {
      latency_ms: 1,
      tokens_in: 2,
      tokens_out: 3,
      prompt_version: "dispatcher_v2_prompt_2026_05",
      model_used: "heuristic-dispatcher-v2",
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
    },
    turn_frame: {
      turn_id: "t1",
      source_message_id: "m1",
      user_id: "u1",
      channel: "whatsapp",
      safety: { risk_band: "none", reason_codes: [], evidence: [] },
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
    },
    route_decision: {
      route_version: "v1",
      response_owner: "normal_reply",
      blocked_paths: [],
      direct_effects_to_run: [],
      reason_code: "normal_reply_default",
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
    },
    direct_effects: [],
    confirmation_token_outcomes: [],
    memory_write_candidates_emitted: 0,
    response_owner: "normal_reply",
    total_latency_ms: 4,
  });
  setConversationTraceSinkForTest(null);
  assertEquals(traces.length, 1);
  assertEquals(traces[0].turn_id, "t1");
  assertEquals(traces[0].dispatcher_run.memory_plan?.memory_mode, "none");
});
