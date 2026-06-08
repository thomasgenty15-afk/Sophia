import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import type { RouteDecision } from "../../contracts/route_decision.v1.ts";
import type {
  StatusRecapLocalDispatcherOutput,
  StatusRecapProjection,
} from "./contract.ts";
import { emptyStatusRecapProjection } from "./projection.ts";
import { decideStatusRecap } from "./reducer.ts";
import { renderStatusRecapDecision } from "./renderer.ts";
import { maybeRunStatusRecapRuntime as maybeRunStatusRecapRuntimeReal } from "./runtime.ts";

function statusRoute(): RouteDecision {
  return {
    route_version: "v1",
    response_owner: "normal_reply",
    selected_handler: "status_only_no_mutation_check",
    blocked_paths: [],
    direct_effects_to_run: [],
    reason_code: "status_only_request_blocks_tool_start",
    memory_used_for_route: false,
    memory_item_ids_used_for_route: [],
    memory_use_kind: "none",
  };
}

function productHelpRoute(): RouteDecision {
  return {
    ...statusRoute(),
    response_owner: "product_help",
    selected_handler: "product_help",
    reason_code: "product_help_where_question",
  };
}

function toolRoute(
  selectedHandler = "create_recurring_reminder",
): RouteDecision {
  return {
    ...statusRoute(),
    response_owner: "tool_skill",
    selected_handler: selectedHandler,
    reason_code: "explicit_tool_command",
  };
}

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

function richTables(): Record<string, Array<Record<string, unknown>>> {
  return {
    user_attack_cards: [{
      id: "attack-1",
      user_id: "user-1",
      status: "active",
      generated_at: "2026-05-29T10:00:00.000Z",
      content: { operation_draft: { title: "Démarrage doc" } },
    }],
    user_defense_cards: [{
      id: "defense-1",
      user_id: "user-1",
      status: "active",
      generated_at: "2026-05-29T11:00:00.000Z",
      content: { title: "Réponse au flou" },
    }],
    scheduled_checkins: [{
      id: "checkin-1",
      user_id: "user-1",
      status: "pending",
      scheduled_for: "2026-05-30T08:21:00.000Z",
      message_payload: { reminder_instruction: "ouvrir le document" },
      event_context: "one_shot_reminder:checkin-1",
    }],
    user_recurring_reminders: [{
      id: "recurring-1",
      user_id: "user-1",
      status: "active",
      message_instruction: "faire le point",
      local_time_hhmm: "09:00",
      scheduled_days: ["mon", "tue", "wed", "thu", "fri"],
    }],
    user_potion_sessions: [{
      id: "potion-1",
      user_id: "user-1",
      potion_type: "focus",
      status: "completed",
      created_at: "2026-05-29T09:00:00.000Z",
    }],
    user_profile_facts: [{
      user_id: "user-1",
      scope: "global",
      status: "active",
      key: "coach.question_tendency",
      value: { value: "low" },
      source_type: "explicit_user",
      reason: "User asked fewer questions.",
      updated_at: "2026-05-29T09:30:00.000Z",
    }],
  };
}

function testStatusDispatcher(action = "answer_status") {
  return async (): Promise<StatusRecapLocalDispatcherOutput> => ({
    flow_action: action as any,
    confidence: "high" as const,
    risk_score: 0,
    status_intent: {
      kind:
        (action === "answer_fait_prevu_fragile"
          ? "fait_prevu_fragile"
          : "durable_status") as StatusRecapLocalDispatcherOutput[
            "status_intent"
          ]["kind"],
      summary: "test status recap",
      requires_db_projection: true,
      requires_effect_history: action === "answer_recent_effects",
    },
    target_objects: ["unknown" as const],
    read_scope: {
      requested_categories: ["all" as const],
      include_cancelled: action === "answer_cancelled_objects",
      include_recent_failed_or_blocked_effects:
        action === "answer_recent_effects",
      format: action === "answer_fait_prevu_fragile"
        ? "fait_prevu_fragile" as const
        : "compact" as const,
    },
    state_updates: {
      status: "active" as const,
      turn_count_increment: 1,
      close_after_visible: false,
    },
    visible_task: {
      kind: action === "answer_fait_prevu_fragile"
        ? "fait_prevu_fragile" as const
        : "status_compact" as const,
      instruction: "test",
    },
    exit_memo: {
      needed: false,
      reason: "none" as const,
      user_intent_summary: null,
      local_flow_context: {
        skill_id: "status_recap" as const,
        last_intent: null,
        last_target_objects: [],
        last_answer_summary: null,
        last_projection_summary: null,
      },
      handoff_hint_for_global_dispatcher: {
        likely_intent: "unknown" as const,
        why: null,
        constraints: [],
      },
    },
    evidence: ["test"],
  });
}

function projectionFromVisibleFacts(input: any): StatusRecapProjection {
  return {
    ...emptyStatusRecapProjection(),
    ...(input.grounded_facts_json?.facts ?? {}),
  };
}

async function testStatusVisibleAgent(input: any): Promise<string> {
  const projection = projectionFromVisibleFacts(input);
  const decision = renderStatusRecapDecision({
    projection,
    decision: {
      skill_id: "status_recap",
      intent: input.stage === "fait_prevu_fragile"
        ? "fait_prevu_fragile"
        : "durable_status",
      target_objects: ["unknown"],
      constraints: [
        "non_mutating",
        "db_grounded",
        "do_not_execute_tool",
        "do_not_claim_without_source",
        "short_reply",
      ],
      projection_used: true,
      missing_sources: [],
      response_contract: {
        max_questions: 0,
        format: input.stage === "fait_prevu_fragile"
          ? "fait_prevu_fragile"
          : "compact",
        allow_human_context_lines: false,
      },
      operation_suggestions: [],
    },
  });
  return decision.reply;
}

function maybeRunStatusRecapRuntime(
  args: Parameters<typeof maybeRunStatusRecapRuntimeReal>[0],
) {
  return maybeRunStatusRecapRuntimeReal({
    ...args,
    runLocalDispatcher: args.runLocalDispatcher ?? testStatusDispatcher(),
    runVisibleAgent: args.runVisibleAgent ?? testStatusVisibleAgent,
  });
}

Deno.test("status_recap_non_mutating", async () => {
  const runtime = await maybeRunStatusRecapRuntime({
    supabase: fakeSupabase(richTables()),
    userId: "user-1",
    userMessage: "sans rien modifier, dis-moi ce qui existe vraiment",
    userTimezone: "Europe/Paris",
    tempMemory: { keep: true },
    turnFrame: null,
    routeDecision: statusRoute(),
    activeOperationIntake: null,
  });
  assert(runtime);
  assertEquals(runtime.toolExecution, "none");
  assertEquals(runtime.executedTools, []);
  assertEquals(runtime.toolSkillRun.selected_handler, "status_recap");
});

Deno.test("durable_status_lists_existing_cards_reminders_preferences", async () => {
  const runtime = await maybeRunStatusRecapRuntime({
    supabase: fakeSupabase(richTables()),
    userId: "user-1",
    userMessage: "qu'est-ce qui est vraiment enregistré ?",
    userTimezone: "Europe/Paris",
    tempMemory: {},
    turnFrame: null,
    routeDecision: statusRoute(),
    activeOperationIntake: null,
  });
  assert(runtime);
  assertStringIncludes(runtime.content, "Démarrage doc");
  assertStringIncludes(runtime.content, "ouvrir le document");
  assertStringIncludes(runtime.content, "moins de questions");
});

Deno.test("cancelled_reminder_included_when_requested", async () => {
  const tables = richTables();
  tables.scheduled_checkins = [{
    id: "cancelled-1",
    user_id: "user-1",
    status: "cancelled",
    scheduled_for: "2026-05-30T08:21:00.000Z",
    message_payload: { reminder_instruction: "ouvrir le document" },
    event_context: "one_shot_reminder:cancelled-1",
    updated_at: "2026-05-29T12:00:00.000Z",
  }];
  const runtime = await maybeRunStatusRecapRuntime({
    supabase: fakeSupabase(tables),
    userId: "user-1",
    userMessage: "ce rappel que tu as annulé, il est toujours actif ?",
    userTimezone: "Europe/Paris",
    tempMemory: {},
    turnFrame: null,
    routeDecision: statusRoute(),
    activeOperationIntake: null,
  });
  assert(runtime);
  assertStringIncludes(runtime.content, "annulé");
  assertStringIncludes(runtime.content, "pas actif");
});

Deno.test("pending_reminder_status_uses_db_time_and_instruction", async () => {
  const runtime = await maybeRunStatusRecapRuntime({
    supabase: fakeSupabase(richTables()),
    userId: "user-1",
    userMessage: "est-ce que j'ai un rappel actif ?",
    userTimezone: "Europe/Paris",
    tempMemory: {},
    turnFrame: null,
    routeDecision: statusRoute(),
    activeOperationIntake: null,
  });
  assert(runtime);
  assertStringIncludes(runtime.content, "10:21");
  assertStringIncludes(runtime.content, "ouvrir le document");
});

Deno.test("coach_preferences_ignore_system_defaults_as_user_choices", () => {
  const projection: StatusRecapProjection = {
    ...emptyStatusRecapProjection(),
    coach_preferences: [{
      key: "coach.tone",
      value: { value: "warm_direct" },
      reason: null,
      source_type: "system_default",
      updated_at: null,
    }],
  };
  const decision = renderStatusRecapDecision({
    projection,
    decision: decideStatusRecap({
      userMessage: "quelles préférences coach sont enregistrées ?",
      turnFrame: null,
      routeDecision: statusRoute(),
      projection,
    }),
  });
  assertStringIncludes(decision.reply, "pas de choix utilisateur explicite");
});

Deno.test("coach_preferences_explicit_are_reported", () => {
  const projection: StatusRecapProjection = {
    ...emptyStatusRecapProjection(),
    coach_preferences: [{
      key: "coach.tone",
      value: { value: "direct" },
      reason: "User asked direct style.",
      source_type: "explicit_user",
      updated_at: null,
    }],
  };
  const decision = renderStatusRecapDecision({
    projection,
    decision: decideStatusRecap({
      userMessage: "quelles préférences coach sont enregistrées ?",
      turnFrame: null,
      routeDecision: statusRoute(),
      projection,
    }),
  });
  assertStringIncludes(decision.reply, "ton très direct");
});

Deno.test("fait_prevu_fragile raw text does not arm status runtime", async () => {
  const runtime = await maybeRunStatusRecapRuntime({
    supabase: fakeSupabase(richTables()),
    userId: "user-1",
    userMessage: "fait / prévu / fragile",
    userTimezone: "Europe/Paris",
    tempMemory: {},
    turnFrame: null,
    routeDecision: null,
    activeOperationIntake: null,
  });
  assertEquals(runtime, null);
});

Deno.test("product_help_where_question_returns_null", async () => {
  const runtime = await maybeRunStatusRecapRuntime({
    supabase: fakeSupabase(richTables()),
    userId: "user-1",
    userMessage: "où annuler dans l'app ?",
    userTimezone: "Europe/Paris",
    tempMemory: {},
    turnFrame: null,
    routeDecision: productHelpRoute(),
    activeOperationIntake: null,
  });
  assertEquals(runtime, null);
});

Deno.test("explicit_tool_command_returns_null", async () => {
  const runtime = await maybeRunStatusRecapRuntime({
    supabase: fakeSupabase(richTables()),
    userId: "user-1",
    userMessage: "crée un rappel demain à 9h",
    userTimezone: "Europe/Paris",
    tempMemory: {},
    turnFrame: null,
    routeDecision: toolRoute("create_recurring_reminder"),
    activeOperationIntake: null,
  });
  assertEquals(runtime, null);
});

Deno.test("active_card_draft_returns_null", async () => {
  const runtime = await maybeRunStatusRecapRuntime({
    supabase: fakeSupabase(richTables()),
    userId: "user-1",
    userMessage: "sans rien modifier, la carte parle de mon piège",
    userTimezone: "Europe/Paris",
    tempMemory: {},
    turnFrame: null,
    routeDecision: statusRoute(),
    activeOperationIntake: { operation_type: "prepare_attack_card" },
  });
  assertEquals(runtime, null);
});

Deno.test("human_recap_no_db_does_not_render_status_block", async () => {
  const runtime = await maybeRunStatusRecapRuntime({
    supabase: fakeSupabase(richTables()),
    userId: "user-1",
    userMessage: "récap humain : résume ce que tu dois retenir de mon piège",
    userTimezone: "Europe/Paris",
    tempMemory: {},
    turnFrame: null,
    routeDecision: null,
    activeOperationIntake: null,
  });
  assertEquals(runtime, null);
});

Deno.test("no_claim_without_source", async () => {
  const runtime = await maybeRunStatusRecapRuntime({
    supabase: fakeSupabase({}),
    userId: "user-1",
    userMessage: "sans rien modifier, dis-moi ce qui existe vraiment",
    userTimezone: "Europe/Paris",
    tempMemory: {},
    turnFrame: null,
    routeDecision: statusRoute(),
    activeOperationIntake: null,
  });
  assert(runtime);
  assertStringIncludes(runtime.content, "je ne vois pas assez de source DB");
});

Deno.test("no_product_how_to_language", async () => {
  const runtime = await maybeRunStatusRecapRuntime({
    supabase: fakeSupabase(richTables()),
    userId: "user-1",
    userMessage: "est-ce que le rappel est actif ?",
    userTimezone: "Europe/Paris",
    tempMemory: {},
    turnFrame: null,
    routeDecision: statusRoute(),
    activeOperationIntake: null,
  });
  assert(runtime);
  assertEquals(runtime.content.includes("clique"), false);
  assertEquals(runtime.content.includes("dans l'app"), false);
});

Deno.test("no_done_language_without_past_source", async () => {
  const runtime = await maybeRunStatusRecapRuntime({
    supabase: fakeSupabase({}),
    userId: "user-1",
    userMessage: "qu'est-ce que tu as créé ?",
    userTimezone: "Europe/Paris",
    tempMemory: {},
    turnFrame: null,
    routeDecision: statusRoute(),
    activeOperationIntake: null,
  });
  assert(runtime);
  assertEquals(runtime.content.includes("j'ai créé"), false);
  assertEquals(runtime.content.includes("C'est fait"), false);
});

Deno.test("status_projection_prefers_db_current_state", async () => {
  const tables = richTables();
  tables.scheduled_checkins = [{
    id: "cancelled-1",
    user_id: "user-1",
    status: "cancelled",
    scheduled_for: "2026-05-30T08:21:00.000Z",
    message_payload: { reminder_instruction: "ouvrir le document" },
    event_context: "one_shot_reminder:cancelled-1",
    updated_at: "2026-05-29T12:00:00.000Z",
  }];
  tables.turn_summary_logs = [{
    user_id: "user-1",
    created_at: "2026-05-29T10:00:00.000Z",
    payload: {
      tag: "effect_ledger",
      entries: [{
        turn_id: "turn-1",
        user_id: "user-1",
        source_message_id: "msg-1",
        request_id: "req-1",
        created_at: "2026-05-29T10:00:00.000Z",
        status: "committed",
        effect_type: "one_shot_reminder.create",
        operation_type: "one_shot_reminder",
        operation_id: "op-1",
        tool_id: "create_one_shot_reminder",
        source: "executor",
        reason_code: null,
        payload_summary: {},
        db_ref: { table: "scheduled_checkins", id: "cancelled-1" },
      }],
    },
  }];
  const runtime = await maybeRunStatusRecapRuntime({
    supabase: fakeSupabase(tables),
    userId: "user-1",
    userMessage: "récap exact du rappel créé/annulé",
    userTimezone: "Europe/Paris",
    tempMemory: {},
    turnFrame: null,
    routeDecision: statusRoute(),
    activeOperationIntake: null,
  });
  assert(runtime);
  assertStringIncludes(runtime.content, "créé puis annulé");
  assertStringIncludes(runtime.content, "pas actif");
  assertEquals(runtime.content.includes("actif, 10:21"), false);
});

Deno.test("status_projection_does_not_claim_object_from_requested_only", async () => {
  const tables = {
    turn_summary_logs: [{
      user_id: "user-1",
      created_at: "2026-05-29T10:00:00.000Z",
      payload: {
        tag: "effect_ledger",
        entries: [{
          turn_id: "turn-1",
          user_id: "user-1",
          source_message_id: "msg-1",
          request_id: "req-1",
          created_at: "2026-05-29T10:00:00.000Z",
          status: "requested",
          effect_type: "one_shot_reminder.create",
          operation_type: "one_shot_reminder",
          operation_id: null,
          tool_id: "create_one_shot_reminder",
          source: "tool_skill",
          reason_code: null,
          payload_summary: { scheduled_for: "2026-05-30T08:21:00.000Z" },
          db_ref: null,
        }],
      },
    }],
  };
  const runtime = await maybeRunStatusRecapRuntime({
    supabase: fakeSupabase(tables),
    userId: "user-1",
    userMessage: "qu'est-ce que tu as créé ?",
    userTimezone: "Europe/Paris",
    tempMemory: {},
    turnFrame: null,
    routeDecision: statusRoute(),
    activeOperationIntake: null,
  });
  assert(runtime);
  assertStringIncludes(runtime.content, "aucun actif visible");
  assertEquals(runtime.content.includes("j'ai créé"), false);
  assertEquals(runtime.content.includes("créé puis annulé"), false);
});
