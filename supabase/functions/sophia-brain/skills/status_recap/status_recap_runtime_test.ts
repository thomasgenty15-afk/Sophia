import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildStatusOnlyNoMutationRuntime,
  maybeRunStatusRecapRuntime,
} from "./runtime.ts";

function fakeSupabase(dataByTable: Record<string, unknown[]> = {}) {
  const calls: Array<{ table: string; op: string }> = [];
  return {
    calls,
    client: {
      from(table: string) {
        calls.push({ table, op: "from" });
        const query = {
          select() {
            calls.push({ table, op: "select" });
            return query;
          },
          eq() {
            calls.push({ table, op: "eq" });
            return query;
          },
          like() {
            calls.push({ table, op: "like" });
            return query;
          },
          order() {
            calls.push({ table, op: "order" });
            return query;
          },
          limit() {
            calls.push({ table, op: "limit" });
            return Promise.resolve({
              data: dataByTable[table] ?? [],
              error: null,
            });
          },
        };
        return query;
      },
    },
  };
}

Deno.test("status_recap_runtime never mutates", async () => {
  const fake = fakeSupabase();
  await buildStatusOnlyNoMutationRuntime({
    supabase: fake.client as any,
    userId: "user_1",
    tempMemory: {},
    userMessage: "sans rien modifier, qu'est-ce qui est en place ?",
  });
  assertEquals(
    fake.calls.some((call) => ["insert", "update", "delete"].includes(call.op)),
    false,
  );
});

Deno.test("status_recap_runtime does not claim reminder in place without DB source", async () => {
  const fake = fakeSupabase();
  const runtime = await buildStatusOnlyNoMutationRuntime({
    supabase: fake.client as any,
    userId: "user_1",
    tempMemory: {},
    userMessage: "mon rappel est en place ?",
  });
  assert(runtime.content.includes("sources DB disponibles"));
  assertEquals(/\bactif,|\ben place :/.test(runtime.content), false);
});

Deno.test("status_recap_runtime maybe wrapper returns null when not armed", async () => {
  const fake = fakeSupabase();
  const runtime = await maybeRunStatusRecapRuntime({
    supabase: fake.client as any,
    userId: "user_1",
    tempMemory: {},
    userMessage: "bonjour",
    userTimezone: "Europe/Paris",
    turnFrame: null,
    routeDecision: null,
    activeOperationIntake: null,
  });
  assertEquals(runtime, null);
});
