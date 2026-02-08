import { persistTurnSummaryLog } from "./turn_summary_writer.ts";

function assert(cond: unknown, msg?: string) {
  if (!cond) throw new Error(msg ?? "Assertion failed");
}

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(
      `${msg ? msg + " — " : ""}Assertion failed.\nExpected: ${e}\nActual:   ${a}`,
    );
  }
}

function makeFakeSupabase() {
  const calls: { rpc: Array<{ fn: string; args: any }> } = { rpc: [] };
  const supabase: any = {
    rpc: async (fn: string, args: any) => {
      calls.rpc.push({ fn, args });
      return { data: null, error: null };
    },
  };
  return { supabase, calls };
}

Deno.test("persistTurnSummaryLog: writes one row via log_turn_summary_log RPC", async () => {
  const { supabase, calls } = makeFakeSupabase();

  const metrics: any = {
    request_id: "req-123",
    user_id: "2e4eba1c-a49c-43e1-a308-8dc6362e5d33",
    channel: "web",
    scope: "web_onboarding",
    latency_ms: { total: 100, dispatcher: 10, context: 5, agent: 20 },
    dispatcher: {
      model: "gemini-x",
      signals: {
        safety: "NONE",
        intent: "SMALL_TALK",
        intent_conf: 0.6,
        interrupt: "NONE",
        topic_depth: "LIGHT",
        flow_resolution: "NONE",
      },
    },
    context: { profile: "companion", elements: ["temporal"], tokens: 123 },
    routing: {
      target_dispatcher: "companion",
      target_initial: "companion",
      target_final: "companion",
      risk_score: 0,
    },
    agent: { model: "gemini-x", outcome: "text", tool: undefined },
    state_flags: { checkup_active: false, toolflow_active: false },
    details: { brain_trace_events: [{ event: "brain:request_start" }] },
    aborted: false,
    abort_reason: undefined,
  };

  await persistTurnSummaryLog({
    metrics,
    supabase,
    config: { awaitEnabled: true, timeoutMs: 50, retries: 0 },
  });

  assertEquals(calls.rpc.length, 1, "one rpc call");
  assertEquals(calls.rpc[0]?.fn, "log_turn_summary_log", "rpc name");
  assertEquals(calls.rpc[0]?.args?.p_request_id, "req-123", "request id");
  assertEquals(calls.rpc[0]?.args?.p_user_id, metrics.user_id, "user id");
  assertEquals(calls.rpc[0]?.args?.p_channel, "web", "channel");
  assertEquals(calls.rpc[0]?.args?.p_scope, "web_onboarding", "scope");
  assert(
    calls.rpc[0]?.args?.p_payload?.tag === "turn_summary",
    "payload tag is turn_summary",
  );
});

Deno.test("persistTurnSummaryLog: missing request_id -> no RPC", async () => {
  const { supabase, calls } = makeFakeSupabase();
  await persistTurnSummaryLog({
    metrics: {
      request_id: null,
      user_id: "u",
      channel: "web",
      scope: "s",
      latency_ms: {},
      dispatcher: {},
      context: {},
      routing: {},
      agent: {},
      state_flags: {},
    } as any,
    supabase,
    config: { awaitEnabled: true, timeoutMs: 50, retries: 0 },
  });
  assertEquals(calls.rpc.length, 0, "no rpc call");
});


