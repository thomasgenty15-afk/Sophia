import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { StatusRecapLocalDispatcherOutput } from "./contract.ts";
import {
  dispatcherSystemPrompt,
  hasActiveStatusRecapFlow,
  normalizeStatusRecapLocalDispatcherOutput,
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

function closingStatusTempMemory() {
  return {
    [STATUS_RECAP_FLOW_STATE_KEY]: {
      ...activeStatusTempMemory()[STATUS_RECAP_FLOW_STATE_KEY],
      status: "closing",
      turn_count: 2,
      last_answer_summary: "premier point status livré",
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

Deno.test("status_recap dispatcher prompt documents field completion rules for its real JSON contract", () => {
  const prompt = dispatcherSystemPrompt();
  assertStringIncludes(prompt, "Field Completion Rules:");
  assertStringIncludes(prompt, "- flow_action:");
  assertStringIncludes(prompt, "- status_intent.kind:");
  assertStringIncludes(prompt, "- read_scope.requested_categories:");
  assertStringIncludes(prompt, "- state_updates.status:");
  assertStringIncludes(prompt, "- visible_task.kind:");
  assertStringIncludes(prompt, "- note_information:");
  assertStringIncludes(prompt, "- exit_memo.needed:");
  assertStringIncludes(prompt, "- evidence:");
  assertStringIncludes(prompt, "Critère d'ownership prioritaire");
  assertStringIncludes(prompt, "réponds direct sur mon rapport");
  assertStringIncludes(prompt, "Transition Rules:");
  assertStringIncludes(prompt, "Exit comportemental");
  assertStringIncludes(prompt, "exit_to_global_dispatcher");
  assertStringIncludes(prompt, "exit_to_global_dispatcher");
  assertStringIncludes(prompt, "safety_preempt");
  assertStringIncludes(prompt, "handoff_to_local_flow");
  assertEquals(prompt.match(/EXAMPLE_JSON_\d_/g)?.length ?? 0, 2);
  assertEquals(prompt.includes("response_contract"), false);
  assertEquals(prompt.includes("grounded_facts_json"), false);
});

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
      assertEquals(input.conversation_context.user_words, ["et les rappels ?"]);
      assertEquals(input.conversation_context.constraints.read_only, true);
      assertEquals(
        input.conversation_context.constraints.no_tool_execution,
        true,
      );
      assertEquals(
        input.conversation_context.filtered_facts.one_shot_reminders.pending
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

Deno.test("status_recap closing state is resumable for local status followups", async () => {
  assertEquals(hasActiveStatusRecapFlow(closingStatusTempMemory()), true);
  const runtime = await maybeRunStatusRecapRuntime({
    supabase: fakeSupabase({
      scheduled_checkins: [{
        id: "cancelled-1",
        user_id: "user-1",
        status: "cancelled",
        scheduled_for: "2026-06-08T07:00:00.000Z",
        message_payload: { reminder_instruction: "relancer le devis" },
        event_context: "one_shot_reminder:cancelled-1",
      }],
    }),
    userId: "user-1",
    userMessage: "et côté rappels annulés ?",
    userTimezone: "Europe/Paris",
    tempMemory: closingStatusTempMemory(),
    turnFrame: null,
    routeDecision: null,
    activeOperationIntake: null,
    runLocalDispatcher: async (input) => {
      assertEquals(input.active_flow_state?.status, "closing");
      return baseDecision({
        flow_action: "answer_cancelled_objects",
        status_intent: {
          kind: "cancelled_objects",
          summary: "cancelled reminder status",
          requires_db_projection: true,
          requires_effect_history: false,
        },
        target_objects: ["one_shot_reminder"],
        read_scope: {
          requested_categories: ["one_shot_reminders"],
          include_cancelled: true,
          include_recent_failed_or_blocked_effects: false,
          format: "object_answer",
        },
        state_updates: {
          status: "closing",
          turn_count_increment: 1,
          close_after_visible: true,
        },
        visible_task: {
          kind: "cancelled_objects",
          instruction: "answer cancelled reminders only",
        },
      });
    },
    runVisibleAgent: async (input) => {
      assertEquals(input.stage, "cancelled_objects");
      assertEquals(
        input.conversation_context.filtered_facts.one_shot_reminders
          .cancelled_recent.length,
        1,
      );
      return "Je vois un rappel annulé : relancer le devis.";
    },
  });
  assert(runtime);
  assertEquals(
    runtime.content,
    "Je vois un rappel annulé : relancer le devis.",
  );
  assertEquals((runtime.toolSkillRun as any).selected_handler, "status_recap");
  assertEquals(
    (runtime.toolSkillRun as any).flow_action,
    "answer_cancelled_objects",
  );
  assertEquals(
    (runtime.nextTempMemory as any)[STATUS_RECAP_FLOW_STATE_KEY].status,
    "active",
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

Deno.test("status_recap exit_to_global_dispatcher stores note for global", async () => {
  const runtime = await maybeRunStatusRecapRuntime({
    supabase: fakeSupabase({}),
    userId: "user-1",
    userMessage: "ok laisse tomber",
    userTimezone: "Europe/Paris",
    tempMemory: activeStatusTempMemory(),
    turnFrame: null,
    routeDecision: null,
    activeOperationIntake: null,
    runLocalDispatcher: async () =>
      baseDecision({
        flow_action: "exit_to_global_dispatcher",
        confidence: "high",
        status_intent: {
          kind: "not_status",
          summary: "user stops status recap",
          requires_db_projection: false,
          requires_effect_history: false,
        },
        state_updates: {
          status: "exit_to_global",
          turn_count_increment: 1,
          close_after_visible: true,
        },
        visible_task: {
          kind: "exit_ack",
          instruction: "leave status_recap for global dispatcher",
        },
        exit_memo: {
          needed: true,
          reason: "topic_change",
          user_intent_summary: "user stops status recap",
          local_flow_context: {
            skill_id: "status_recap",
            last_intent: "durable_status",
            last_target_objects: ["unknown"],
            last_answer_summary: null,
            last_projection_summary: null,
          },
          handoff_hint_for_global_dispatcher: {
            likely_intent: "normal_coaching",
            why: "stop request",
            constraints: [],
          },
        },
      }),
    runVisibleAgent: async () => {
      throw new Error("visible agent should not run on exit_to_global");
    },
  });
  assert(runtime);
  assertEquals(runtime.content, "");
  assertEquals(runtime.toolExecution, "none");
  assertEquals(
    (runtime.nextTempMemory as any)[STATUS_RECAP_FLOW_STATE_KEY].status,
    "exit_to_global",
  );
  assertEquals(
    (runtime.nextTempMemory as any)[STATUS_RECAP_EXIT_MEMO_KEY]
      .note_information.target_dispatcher,
    "global",
  );
  assertEquals(
    (runtime.toolSkillRun as any).reason_code,
    "status_recap_local_exit_to_global_dispatcher",
  );
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
          kind: "exit_ack",
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

Deno.test("status_recap safety_preempt creates safety note and skips visible status answer", async () => {
  const runtime = await maybeRunStatusRecapRuntime({
    supabase: fakeSupabase({}),
    userId: "user-1",
    userMessage: "message safety prioritaire",
    userTimezone: "Europe/Paris",
    tempMemory: activeStatusTempMemory(),
    turnFrame: null,
    routeDecision: null,
    activeOperationIntake: null,
    runLocalDispatcher: async () =>
      baseDecision({
        flow_action: "safety_preempt",
        confidence: "high",
        risk_score: 8,
        status_intent: {
          kind: "safety",
          summary: "safety preempts status",
          requires_db_projection: false,
          requires_effect_history: false,
        },
        state_updates: {
          status: "safety",
          turn_count_increment: 1,
          close_after_visible: true,
        },
        visible_task: {
          kind: "safety",
          instruction: "safety owns next turn",
        },
        exit_memo: {
          needed: true,
          reason: "safety",
          user_intent_summary: "safety concern",
          local_flow_context: {
            skill_id: "status_recap",
            last_intent: "unclear",
            last_target_objects: ["unknown"],
            last_answer_summary: "rappel actif",
            last_projection_summary: "one reminder",
          },
          handoff_hint_for_global_dispatcher: {
            likely_intent: "unknown",
            why: "Safety owns next turn.",
            constraints: [
              "Status recap was read-only and did not mutate anything.",
            ],
          },
        },
      }),
    runVisibleAgent: async () => {
      throw new Error("visible_agent_should_not_run_on_safety");
    },
  });
  assert(runtime);
  assertEquals(runtime.content, "");
  assertEquals((runtime.toolSkillRun as any).status, "safety_preempt");
  assertEquals(
    (runtime.toolSkillRun as any).note_information.target_dispatcher,
    "safety_crisis",
  );
  assertEquals(
    (runtime.nextTempMemory as any)[STATUS_RECAP_EXIT_MEMO_KEY].reason,
    "safety",
  );
});

Deno.test("status_recap handoff_to_local_flow normalizes note_information for local target", () => {
  const output = normalizeStatusRecapLocalDispatcherOutput({
    flow_action: "handoff_to_local_flow",
    confidence: "high",
    risk_score: 0,
    status_intent: {
      kind: "not_status",
      summary: "User asks a reminder flow to take over.",
      requires_db_projection: false,
      requires_effect_history: false,
    },
    target_objects: ["one_shot_reminder"],
    read_scope: {
      requested_categories: ["one_shot_reminders"],
      include_cancelled: false,
      include_recent_failed_or_blocked_effects: false,
      format: "compact",
    },
    state_updates: {
      status: "exit_to_global",
      turn_count_increment: 1,
      close_after_visible: true,
    },
    visible_task: {
      kind: "exit_ack",
      instruction: "handoff without visible status answer",
    },
    note_information: {
      source_flow_id: "status_recap",
      source_flow_state_summary: "Status recap collected reminder context.",
      handoff_reason: "explicit_user_request",
      target_dispatcher: "create_one_shot_reminder",
      handoff_context_for_next_dispatcher:
        "The user moved from status reading to reminder creation.",
      target_local_dispatcher_hint: "Create reminder dispatcher should decide.",
      user_words: ["crée un rappel"],
      structured_context: {
        source_flow: "status_recap",
        target_dispatcher: "create_one_shot_reminder",
        handoff_reason: "explicit_user_request",
        user_message_summary: "create reminder",
        active_flow_summary: "status read-only",
        collected_state: { target_objects: ["one_shot_reminder"] },
        unresolved_questions: [],
        confidence: "high",
        evidence: ["create reminder request"],
        recommended_next_focus: "reminder creation",
      },
      risk_score: 0,
      no_chat_mutation: {
        db_write_committed: false,
        potion_session_created: false,
        scheduled_checkin_created: false,
        recurring_reminder_created: false,
        executable_confirmation_generated: false,
      },
    },
    exit_memo: {
      needed: true,
      reason: "explicit_tool_request",
      user_intent_summary: "create reminder",
      local_flow_context: {
        skill_id: "status_recap",
        last_intent: "object_status",
        last_target_objects: ["one_shot_reminder"],
        last_answer_summary: "one reminder active",
        last_projection_summary: "one reminder",
      },
      handoff_hint_for_global_dispatcher: {
        likely_intent: "one_shot_reminder",
        why: "The current user message asks for creation.",
        constraints: [
          "Status recap was read-only and did not mutate anything.",
        ],
      },
    },
    evidence: ["create reminder request"],
  });
  assertEquals(
    output.note_information?.target_dispatcher,
    "create_one_shot_reminder",
  );
  assertEquals(
    output.note_information?.structured_context.source_flow,
    "status_recap",
  );
  assertEquals(output.exit_memo.needed, true);
});
