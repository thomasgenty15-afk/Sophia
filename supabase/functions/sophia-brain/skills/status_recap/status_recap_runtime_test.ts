import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { StatusRecapLocalDispatcherOutput } from "./contract.ts";
import { maybeRunStatusRecapRuntime } from "./runtime.ts";

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

function routeDecision() {
  return {
    route_version: "v1",
    response_owner: "conversation_handler",
    selected_handler: "status_recap",
    blocked_paths: [],
    direct_effects_to_run: [],
    reason_code: "skill_entry_signal",
    memory_used_for_route: false,
    memory_item_ids_used_for_route: [],
    memory_use_kind: "none",
  } as any;
}

function dispatcherOutput(): StatusRecapLocalDispatcherOutput {
  return {
    flow_action: "answer_status",
    confidence: "high",
    risk_score: 0,
    status_intent: {
      kind: "durable_status",
      summary: "status recap",
      requires_db_projection: true,
      requires_effect_history: false,
    },
    target_objects: ["unknown"],
    read_scope: {
      requested_categories: ["all"],
      include_cancelled: false,
      include_recent_failed_or_blocked_effects: false,
      format: "compact",
    },
    state_updates: {
      status: "active",
      turn_count_increment: 1,
      close_after_visible: false,
    },
    visible_task: {
      kind: "status_compact",
      instruction: "answer from conversation_context only",
    },
    exit_memo: {
      needed: false,
      reason: "none",
      user_intent_summary: null,
      local_flow_context: {
        skill_id: "status_recap",
        last_intent: null,
        last_target_objects: [],
        last_answer_summary: null,
        last_projection_summary: null,
      },
      handoff_hint_for_global_dispatcher: {
        likely_intent: "unknown",
        why: null,
        constraints: [],
      },
    },
    evidence: ["test"],
  };
}

Deno.test("status_recap_runtime never mutates", async () => {
  const fake = fakeSupabase();
  await maybeRunStatusRecapRuntime({
    supabase: fake.client as any,
    userId: "user_1",
    tempMemory: {},
    userMessage: "sans rien modifier, qu'est-ce qui est en place ?",
    userTimezone: "Europe/Paris",
    turnFrame: null,
    routeDecision: routeDecision(),
    activeOperationIntake: null,
    runLocalDispatcher: async () => dispatcherOutput(),
    runVisibleAgent: async () => "status visible",
  });
  assertEquals(
    fake.calls.some((call) => ["insert", "update", "delete"].includes(call.op)),
    false,
  );
});

Deno.test("status_recap_runtime passes no-source context instead of claiming", async () => {
  const fake = fakeSupabase();
  const runtime = await maybeRunStatusRecapRuntime({
    supabase: fake.client as any,
    userId: "user_1",
    tempMemory: {},
    userMessage: "mon rappel est en place ?",
    userTimezone: "Europe/Paris",
    turnFrame: null,
    routeDecision: routeDecision(),
    activeOperationIntake: null,
    runLocalDispatcher: async () => dispatcherOutput(),
    runVisibleAgent: async (input) => {
      const summary = input.conversation_context.projection_summary;
      assertEquals(summary.one_shot_pending_count, 0);
      assertEquals(input.conversation_context.stage, "no_source");
      return "Je ne vois pas assez de source factuelle pour l'affirmer.";
    },
  });
  assert(runtime);
  assertEquals(
    runtime.content,
    "Je ne vois pas assez de source factuelle pour l'affirmer.",
  );
});

Deno.test("status_recap_runtime returns null when not armed", async () => {
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
