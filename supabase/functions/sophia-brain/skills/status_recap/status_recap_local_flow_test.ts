import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { StatusRecapLocalDispatcherOutput } from "./contract.ts";
import {
  STATUS_RECAP_EXIT_MEMO_KEY,
  STATUS_RECAP_FLOW_STATE_KEY,
} from "./local_flow.ts";
import { maybeRunStatusRecapRuntime } from "./runtime.ts";

class FakeQuery {
  #filters: Array<{ key: string; value: unknown; op: "eq" | "like" }> = [];
  #limit: number | null = null;

  constructor(
    private readonly table: string,
    private readonly tables: Record<string, Array<Record<string, unknown>>>,
  ) {}

  select() {
    return this;
  }

  eq(key: string, value: unknown) {
    this.#filters.push({ key, value, op: "eq" });
    return this;
  }

  like(key: string, value: string) {
    this.#filters.push({ key, value, op: "like" });
    return this;
  }

  order() {
    return this;
  }

  limit(value: number) {
    this.#limit = value;
    return this;
  }

  then(
    onFulfilled: (
      value: { data: Record<string, unknown>[]; error: null },
    ) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) {
    const rows = [...(this.tables[this.table] ?? [])].filter((row) =>
      this.#filters.every((filter) => {
        const raw = String(row[filter.key] ?? "");
        if (filter.op === "eq") return row[filter.key] === filter.value;
        const expected = String(filter.value).replace(/%/g, "");
        return raw.startsWith(expected);
      })
    );
    const limited = this.#limit === null ? rows : rows.slice(0, this.#limit);
    return Promise.resolve({ data: limited, error: null }).then(
      onFulfilled,
      onRejected,
    );
  }
}

function fakeSupabase(tables: Record<string, Array<Record<string, unknown>>>) {
  return {
    from(table: string) {
      return new FakeQuery(table, tables);
    },
  } as any;
}

function activeStatusTempMemory() {
  return {
    [STATUS_RECAP_FLOW_STATE_KEY]: {
      skill_id: "status_recap",
      mode: "local_readonly_flow",
      status: "active",
      last_intent: "durable_status",
      last_target_objects: ["unknown"],
      last_projection_summary: {
        attack_card_count: 0,
        defense_card_count: 0,
        one_shot_pending_count: 1,
        one_shot_cancelled_recent_count: 0,
        recurring_reminder_count: 0,
        potion_session_count: 0,
        coach_preference_count: 0,
        recent_effect_history_count: 0,
      },
      last_answer_summary: "rappel actif",
      turn_count: 1,
      max_turns: 3,
      created_at: "2026-06-08T08:00:00.000Z",
      updated_at: "2026-06-08T08:00:00.000Z",
    },
  };
}

function baseDecision(
  overrides: Partial<StatusRecapLocalDispatcherOutput> = {},
): StatusRecapLocalDispatcherOutput {
  return {
    flow_action: "answer_status",
    confidence: "high",
    risk_score: 0,
    status_intent: {
      kind: "durable_status",
      summary: "status local",
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
      instruction: "answer from facts",
    },
    exit_memo: {
      needed: false,
      reason: "none",
      user_intent_summary: null,
      local_flow_context: {
        skill_id: "status_recap",
        last_intent: "durable_status",
        last_target_objects: ["unknown"],
        last_answer_summary: "rappel actif",
        last_projection_summary: "one reminder",
      },
      handoff_hint_for_global_dispatcher: {
        likely_intent: "unknown",
        why: null,
        constraints: [],
      },
    },
    evidence: ["test"],
    ...overrides,
  };
}

Deno.test("status_recap active followup answers locally and keeps read-only invariants", async () => {
  let visibleStage = "";
  const runtime = await maybeRunStatusRecapRuntime({
    supabase: fakeSupabase({
      scheduled_checkins: [{
        id: "checkin-1",
        user_id: "user-1",
        status: "pending",
        scheduled_for: "2026-06-09T07:00:00.000Z",
        message_payload: { reminder_instruction: "ouvrir le doc" },
        event_context: "one_shot_reminder:checkin-1",
      }],
    }),
    userId: "user-1",
    userMessage: "et les rappels ?",
    userTimezone: "Europe/Paris",
    tempMemory: activeStatusTempMemory(),
    turnFrame: null,
    routeDecision: null,
    activeOperationIntake: null,
    runLocalDispatcher: async () =>
      baseDecision({
        flow_action: "answer_object_status",
        status_intent: {
          kind: "object_status",
          summary: "reminder status",
          requires_db_projection: true,
          requires_effect_history: false,
        },
        target_objects: ["one_shot_reminder", "recurring_reminder"],
        read_scope: {
          requested_categories: ["one_shot_reminders", "recurring_reminders"],
          include_cancelled: false,
          include_recent_failed_or_blocked_effects: false,
          format: "object_answer",
        },
        visible_task: {
          kind: "object_status",
          instruction: "answer reminders only",
        },
      }),
    runVisibleAgent: async (input) => {
      visibleStage = input.stage;
      assertEquals(
        (input.grounded_facts_json.facts as any).one_shot_reminders.pending
          .length,
        1,
      );
      return "Rappels ponctuels : actif, 09:00 ouvrir le doc.";
    },
  });
  assert(runtime);
  assertEquals(visibleStage, "object_status");
  assertEquals(runtime.toolExecution, "none");
  assertEquals(runtime.executedTools, []);
  assertEquals(
    (runtime.toolSkillRun as any).flow_action,
    "answer_object_status",
  );
  assertEquals(
    (runtime.nextTempMemory as any)[STATUS_RECAP_FLOW_STATE_KEY].turn_count,
    2,
  );
});

Deno.test("status_recap repeat and explain sources stay local", async () => {
  for (
    const [flowAction, visibleTask] of [
      ["repeat_last_status", "repeat_status"],
      ["explain_sources", "explain_sources"],
    ] as const
  ) {
    const runtime = await maybeRunStatusRecapRuntime({
      supabase: fakeSupabase({}),
      userId: "user-1",
      userMessage: flowAction,
      userTimezone: "Europe/Paris",
      tempMemory: activeStatusTempMemory(),
      turnFrame: null,
      routeDecision: null,
      activeOperationIntake: null,
      runLocalDispatcher: async () =>
        baseDecision({
          flow_action: flowAction,
          visible_task: { kind: visibleTask, instruction: "local followup" },
          status_intent: {
            kind: "durable_status",
            summary: flowAction,
            requires_db_projection: true,
            requires_effect_history: false,
          },
        }),
      runVisibleAgent: async (input) => `stage:${input.stage}`,
    });
    assert(runtime);
    assertEquals(runtime.content, `stage:${visibleTask}`);
    assertEquals(runtime.toolExecution, "none");
    assertEquals((runtime.toolSkillRun as any).flow_action, flowAction);
  }
});

Deno.test("status_recap exit_to_global_dispatcher stores required exit memo without local mutation", async () => {
  const runtime = await maybeRunStatusRecapRuntime({
    supabase: fakeSupabase({}),
    userId: "user-1",
    userMessage: "ok crée-le",
    userTimezone: "Europe/Paris",
    tempMemory: activeStatusTempMemory(),
    turnFrame: null,
    routeDecision: null,
    activeOperationIntake: null,
    runLocalDispatcher: async () =>
      baseDecision({
        flow_action: "exit_to_global_dispatcher",
        status_intent: {
          kind: "not_status",
          summary: "user asks creation",
          requires_db_projection: false,
          requires_effect_history: false,
        },
        state_updates: {
          status: "exit_to_global",
          turn_count_increment: 1,
          close_after_visible: true,
        },
        visible_task: {
          kind: "exit_or_cancel",
          instruction: "no local message",
        },
        exit_memo: {
          needed: true,
          reason: "explicit_tool_request",
          user_intent_summary: "create the reminder from status context",
          local_flow_context: {
            skill_id: "status_recap",
            last_intent: "durable_status",
            last_target_objects: ["one_shot_reminder"],
            last_answer_summary: "rappel actif",
            last_projection_summary: "one reminder",
          },
          handoff_hint_for_global_dispatcher: {
            likely_intent: "one_shot_reminder",
            why: "Current user message asks to create instead of read status.",
            constraints: [
              "Status recap was read-only and did not mutate anything.",
            ],
          },
        },
      }),
    runVisibleAgent: async () => {
      throw new Error("visible_agent_should_not_run_on_exit");
    },
  });
  assert(runtime);
  assertEquals(runtime.content, "");
  assertEquals(runtime.toolExecution, "none");
  assertEquals(runtime.executedTools, []);
  assertEquals(
    (runtime.nextTempMemory as any)[STATUS_RECAP_EXIT_MEMO_KEY].reason,
    "explicit_tool_request",
  );
  assertEquals(
    (runtime.toolSkillRun as any).reason_code,
    "status_recap_local_exit_to_global_dispatcher",
  );
});
