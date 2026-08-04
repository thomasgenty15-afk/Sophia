import { logMemoryObservabilityEvent } from "./memory-observability.ts";

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(
      `${
        msg ? msg + " - " : ""
      }Assertion failed.\nExpected: ${e}\nActual:   ${a}`,
    );
  }
}

function makeFakeSupabase() {
  const calls: {
    insert: Array<{ table: string; row: any }>;
  } = { insert: [] };

  const supabase: any = {
    from: (table: string) => ({
      insert: async (row: any) => {
        calls.insert.push({ table, row });
        return { data: null, error: null };
      },
    }),
  };
  return { supabase, calls };
}

async function withMemoryEnv<T>(
  value: string | null,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = Deno.env.get("MEMORY_OBSERVABILITY_ON");
  try {
    if (value === null) {
      Deno.env.delete("MEMORY_OBSERVABILITY_ON");
    } else {
      Deno.env.set("MEMORY_OBSERVABILITY_ON", value);
    }
    return await fn();
  } finally {
    if (previous == null) {
      Deno.env.delete("MEMORY_OBSERVABILITY_ON");
    } else {
      Deno.env.set("MEMORY_OBSERVABILITY_ON", previous);
    }
  }
}

Deno.test("logMemoryObservabilityEvent: disabled when MEMORY_OBSERVABILITY_ON is absent", async () => {
  await withMemoryEnv(null, async () => {
    const { supabase, calls } = makeFakeSupabase();

    await logMemoryObservabilityEvent({
      supabase,
      userId: "user-1",
      requestId: "req-1",
      turnId: "turn-1",
      channel: "web",
      scope: "web",
      sourceComponent: "context_loader",
      eventName: "memory_context_loaded",
      payload: { items: 1 },
    });

    assertEquals(calls.insert.length, 0);
  });
});

Deno.test("logMemoryObservabilityEvent: enabled by MEMORY_OBSERVABILITY_ON=1", async () => {
  await withMemoryEnv("1", async () => {
    const { supabase, calls } = makeFakeSupabase();

    await logMemoryObservabilityEvent({
      supabase,
      userId: "user-1",
      requestId: "req-1",
      turnId: "turn-1",
      channel: "web",
      scope: "web",
      sourceComponent: "context_loader",
      eventName: "memory_context_loaded",
      payload: { items: 1 },
    });

    assertEquals(calls.insert.length, 1);
    assertEquals(calls.insert[0]?.table, "memory_observability_events");
    assertEquals(calls.insert[0]?.row?.user_id, "user-1");
    assertEquals(calls.insert[0]?.row?.request_id, "req-1");
    assertEquals(calls.insert[0]?.row?.turn_id, "turn-1");
    assertEquals(calls.insert[0]?.row?.channel, "web");
    assertEquals(calls.insert[0]?.row?.scope, "web");
    assertEquals(calls.insert[0]?.row?.source_component, "context_loader");
    assertEquals(calls.insert[0]?.row?.event_name, "memory_context_loaded");
  });
});
