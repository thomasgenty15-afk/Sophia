import { logBrainTrace } from "./brain-trace.ts";

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

function resetPing() {
  const anyGlobal = globalThis as any;
  try {
    delete anyGlobal.__sophiaBrainTracePinged;
  } catch {
    anyGlobal.__sophiaBrainTracePinged = undefined;
  }
}

function makeFakeSupabase() {
  const calls: {
    rpc: Array<{ fn: string; args: any }>;
    insert: Array<{ table: string; row: any }>;
  } = { rpc: [], insert: [] };

  const supabase: any = {
    rpc: async (fn: string, args: any) => {
      calls.rpc.push({ fn, args });
      return { data: null, error: null };
    },
    from: (table: string) => ({
      insert: async (row: any) => {
        calls.insert.push({ table, row });
        return { data: null, error: null };
      },
    }),
  };
  return { supabase, calls };
}

Deno.test("logBrainTrace: non-eval does not persist into conversation_eval_events (prod uses turn_summary_logs)", async () => {
  resetPing();
  const { supabase, calls } = makeFakeSupabase();

  await logBrainTrace({
    supabase,
    userId: "user-1",
    meta: { requestId: "req-1", forceBrainTrace: true },
    event: "brain:request_start",
    level: "info",
    phase: "io",
    payload: { hello: "world" },
  });

  // Non-eval: should not do a direct insert into conversation_eval_events,
  // and should not call RPC (we persist production traces inside turn_summary_logs).
  assertEquals(calls.insert.length, 0, "no direct insert");
  assertEquals(calls.rpc.length, 0, "no rpc");
});

Deno.test("logBrainTrace: eval persists via direct insert into conversation_eval_events", async () => {
  resetPing();
  const { supabase, calls } = makeFakeSupabase();

  await logBrainTrace({
    supabase,
    userId: "user-1",
    meta: { requestId: "req-2", evalRunId: "eval-1" },
    event: "brain:request_start",
    level: "info",
    phase: "io",
    payload: { ok: true },
  });

  // Eval: should not use RPC.
  assertEquals(calls.rpc.length, 0, "no rpc in eval mode");

  // Should insert the event (and likely the ping) into conversation_eval_events.
  assert(calls.insert.length >= 1, "insert called");
  assert(
    calls.insert.some((c) =>
      c.table === "conversation_eval_events" &&
      c.row?.request_id === "req-2" &&
      c.row?.eval_run_id === "eval-1" &&
      c.row?.source === "brain-trace" &&
      c.row?.event === "brain:request_start"
    ),
    "insert contains main event",
  );
  assert(
    calls.insert.some((c) =>
      c.table === "conversation_eval_events" &&
      c.row?.request_id === "req-2" &&
      c.row?.eval_run_id === "eval-1" &&
      c.row?.source === "brain-trace" &&
      c.row?.event === "brain_trace_ping"
    ),
    "insert contains ping",
  );
});

Deno.test("logBrainTrace: requestId missing -> does not persist", async () => {
  resetPing();
  const { supabase, calls } = makeFakeSupabase();

  await logBrainTrace({
    supabase,
    userId: "user-1",
    meta: { forceBrainTrace: true },
    event: "brain:request_start",
    level: "info",
    phase: "io",
    payload: { ok: true },
  });

  assertEquals(calls.rpc.length, 0, "no rpc");
  assertEquals(calls.insert.length, 0, "no insert");
});


