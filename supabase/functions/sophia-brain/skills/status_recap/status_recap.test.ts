import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { RouteDecision } from "../../contracts/route_decision.v1.ts";
import type { StatusRecapLocalDispatcherOutput } from "./contract.ts";
import { maybeRunStatusRecapRuntime } from "./runtime.ts";
import {
  statusRecapCoverageRequirements,
  statusRecapRestitutionGuidance,
  type StatusRecapVisibleAgentInput,
} from "./visible_agent.ts";

type AssertNever<T extends never> = T;
type _StatusRecapVisibleInputHasNoLegacyFields = AssertNever<
  Extract<
    keyof StatusRecapVisibleAgentInput,
    | "user_message"
    | "recent_messages"
    | "local_state"
    | "draft"
    | "dispatcher_instruction"
  >
>;

function statusRoute(): RouteDecision {
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

function decision(
  patch: Partial<StatusRecapLocalDispatcherOutput> = {},
): StatusRecapLocalDispatcherOutput {
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
    ...patch,
  };
}

Deno.test("status_recap runtime passes filtered conversation_context to visible agent", async () => {
  let dispatcherSawNote = false;
  let visibleContext: Record<string, unknown> | null = null;
  let visibleInput: Record<string, unknown> | null = null;
  const runtime = await maybeRunStatusRecapRuntime({
    supabase: fakeSupabase(richTables()),
    userId: "user-1",
    userMessage:
      "Fais-moi un point factuel sur ce qui existe vraiment dans mon espace.",
    userTimezone: "Europe/Paris",
    tempMemory: { keep: true },
    turnFrame: null,
    routeDecision: statusRoute(),
    activeOperationIntake: null,
    runLocalDispatcher: async (input) => {
      dispatcherSawNote = Boolean(input.note_information_inbound);
      assertEquals(input.db_context_pack.source_policy.read_only, true);
      assertEquals(input.micro_memory_context, []);
      return decision();
    },
    runVisibleAgent: async (input) => {
      visibleInput = input as unknown as Record<string, unknown>;
      visibleContext = input.conversation_context as unknown as Record<
        string,
        unknown
      >;
      const facts = input.conversation_context.filtered_facts;
      assertEquals(facts.attack_cards[0].title, "Démarrage doc");
      assertEquals(
        facts.one_shot_reminders.pending[0].instruction,
        "ouvrir le document",
      );
      assertEquals(
        statusRecapCoverageRequirements(input.conversation_context).includes(
          "mentionner les préférences coach explicites présentes",
        ),
        true,
      );
      assertEquals(
        input.conversation_context.constraints
          .micro_memory_raw_available_to_visible_agent,
        false,
      );
      return "status visible from local visible agent";
    },
  });

  assert(runtime);
  assertEquals(dispatcherSawNote, true);
  assertEquals(runtime.content, "status visible from local visible agent");
  assertEquals(runtime.toolExecution, "none");
  assertEquals(runtime.executedTools, []);
  assertEquals((runtime.toolSkillRun as any).selected_handler, "status_recap");
  assertEquals(
    (runtime.toolSkillRun as any).visible_task.kind,
    "status_compact",
  );
  assertEquals(Boolean(visibleContext), true);
  assertEquals("user_message" in ((visibleInput as any) ?? {}), false);
  assertEquals("recent_messages" in ((visibleInput as any) ?? {}), false);
  assertEquals("local_state" in ((visibleInput as any) ?? {}), false);
  assertEquals(
    "dispatcher_instruction" in ((visibleInput as any) ?? {}),
    false,
  );
  assertEquals(
    "current_user_message" in ((visibleContext as any) ?? {}),
    false,
  );
  assertEquals(
    "dispatcher_instruction" in ((visibleContext as any) ?? {}),
    false,
  );
});

Deno.test("status_recap does not activate for product help or explicit tool command", async () => {
  const productRuntime = await maybeRunStatusRecapRuntime({
    supabase: fakeSupabase(richTables()),
    userId: "user-1",
    userMessage: "où annuler dans l'app ?",
    userTimezone: "Europe/Paris",
    tempMemory: {},
    turnFrame: null,
    routeDecision: productHelpRoute(),
    activeOperationIntake: null,
  });
  assertEquals(productRuntime, null);

  const toolRuntime = await maybeRunStatusRecapRuntime({
    supabase: fakeSupabase(richTables()),
    userId: "user-1",
    userMessage: "crée un rappel demain à 9h",
    userTimezone: "Europe/Paris",
    tempMemory: {},
    turnFrame: null,
    routeDecision: toolRoute("create_recurring_reminder"),
    activeOperationIntake: null,
  });
  assertEquals(toolRuntime, null);
});

Deno.test("status_recap first activation creates inbound note_information", async () => {
  let inboundTarget: string | null = null;
  const runtime = await maybeRunStatusRecapRuntime({
    supabase: fakeSupabase({}),
    userId: "user-1",
    userMessage: "Sans rien changer, fais le point factuel.",
    userTimezone: "Europe/Paris",
    tempMemory: {},
    turnFrame: null,
    routeDecision: statusRoute(),
    activeOperationIntake: null,
    runLocalDispatcher: async (input) => {
      inboundTarget = input.note_information_inbound?.target_dispatcher ?? null;
      return decision();
    },
    runVisibleAgent: async (input) => {
      assertEquals(
        input.conversation_context.handoff_data.inbound_source_flow_id,
        "global_dispatcher",
      );
      return "no source visible";
    },
  });

  assert(runtime);
  assertEquals(inboundTarget, "status_recap");
  assertEquals(
    (runtime.toolSkillRun as any).note_information_inbound.target_dispatcher,
    "status_recap",
  );
});

Deno.test("status_recap raw fait/prevision wording does not arm runtime without route signal", async () => {
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

Deno.test("status_recap compact restitution stays free-form and reserves fait prévu fragile for explicit stage", () => {
  const compactGuidance = statusRecapRestitutionGuidance("status_compact").join(
    "\n",
  );
  assert(
    compactGuidance.includes(
      "n'utilise pas les labels imposés Fait, Prévu, Fragile",
    ),
  );
  assert(
    compactGuidance.includes(
      "ne l'appelle pas fragile sauf si le contexte parle vraiment",
    ),
  );
  assert(
    compactGuidance.includes("pas des templates à recopier"),
  );

  const explicitGuidance = statusRecapRestitutionGuidance(
    "fait_prevu_fragile",
  ).join("\n");
  assert(
    explicitGuidance.includes(
      "utilise exactement les trois lignes Fait, Prévu, Fragile",
    ),
  );
});
