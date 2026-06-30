import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  type ConversationTurnTrace,
  logConversationTurn,
  setConversationTraceSinkForTest,
  setConversationTraceWriteClientForTest,
} from "./trace_logger.ts";

function makeTrace(
  overrides: Partial<ConversationTurnTrace> = {},
): ConversationTurnTrace {
  return {
    turn_id: "t1",
    user_id: "u1",
    source_message_id: "m1",
    ts: "2026-05-04T10:00:00.000Z",
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
    ...overrides,
  };
}

Deno.test("trace logger writes to injectable sink", async () => {
  const traces: ConversationTurnTrace[] = [];
  setConversationTraceSinkForTest((trace) => {
    traces.push(trace);
  });
  await logConversationTurn(makeTrace());
  setConversationTraceSinkForTest(null);
  assertEquals(traces.length, 1);
  assertEquals(traces[0].turn_id, "t1");
  assertEquals(traces[0].dispatcher_run.memory_plan?.memory_mode, "none");
});

Deno.test("trace logger does not persist duplicated safety column", async () => {
  const inserts: Array<Record<string, unknown>> = [];
  const client = {
    from(table: string) {
      assertEquals(table, "conversation_turn_traces");
      return {
        insert(payload: Record<string, unknown>) {
          inserts.push(payload);
          return Promise.resolve({ error: null });
        },
      };
    },
  };

  setConversationTraceWriteClientForTest(client as never);
  try {
    await logConversationTurn(
      makeTrace({
        effect_ledger: { counts: { committed: 0 } },
        tool_skill_run: { selected_handler: "product_help" },
      }),
      { supabase: {} },
    );
  } finally {
    setConversationTraceWriteClientForTest(null);
  }

  assertEquals(inserts.length, 1);
  assertEquals("safety_context" in inserts[0], false);
  assertEquals("safety_pregate" in inserts[0], false);
  assertEquals("effect_ledger" in inserts[0], true);
  assertEquals(inserts[0].tool_skill_run, { selected_handler: "product_help" });
  assertEquals((inserts[0].turn_frame as Record<string, unknown>).safety, {
    risk_band: "none",
    reason_codes: [],
    evidence: [],
  });
});
