import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { buildCreateRecurringReminderLocalDispatcherSystemPrompt } from "./local_flow.ts";
import { maybeRunCreateRecurringReminderOperation } from "./router.ts";
import type {
  CreateRecurringReminderLocalDispatcherOutput,
  CreateRecurringReminderLocalFlowAction,
} from "./contract.ts";

function routeDecision() {
  return {
    response_owner: "tool_skill",
    selected_handler: "create_recurring_reminder",
    reason_code: "test",
    direct_effects_to_run: [],
    blocked_paths: [],
  } as any;
}

function localDispatcherOutput(input: {
  flow_action?: CreateRecurringReminderLocalFlowAction;
  frequency?:
    | "daily"
    | "weekly"
    | "specific_days"
    | "weekdays"
    | "custom"
    | null;
  days?: string[];
  time?: string | null;
  message?: string | null;
  missing_fields?:
    CreateRecurringReminderLocalDispatcherOutput["missing_fields"];
  visible_message?: string | null;
}): CreateRecurringReminderLocalDispatcherOutput {
  const action = input.flow_action ?? "handoff_ready";
  const fields = {
    recurrence: {
      status: input.frequency && input.time
        ? "identified" as const
        : "missing" as const,
      frequency: input.frequency ?? null,
      days: input.days ?? [],
      time: input.time ?? null,
      timezone: "Europe/Paris",
      cadence_label: input.frequency === "weekly" && input.days?.length
        ? `chaque semaine, ${input.days.join(", ")}`
        : input.frequency === "daily"
        ? "tous les jours"
        : null,
      confidence: "high" as const,
      evidence: ["test_local_dispatcher"],
    },
    reminder_content: {
      status: input.message ? "identified" as const : "missing" as const,
      message: input.message ?? null,
      subject_hint: input.message ?? null,
      confidence: "high" as const,
      evidence: ["test_local_dispatcher"],
    },
    destination: {
      status: "identified" as const,
      value: "base_de_vie" as const,
      related_plan_item_id: null,
      target_kind: "none" as const,
      target_plan_item_id: null,
      target_action_family_key: null,
      target_generated_temp_id: null,
      target_binding_policy: "none" as const,
      target_lifecycle_policy: "independent" as const,
      target_label: null,
      confidence: "high" as const,
      evidence: ["test_local_dispatcher"],
    },
  };
  const visibleKind = action === "apply_attempt"
    ? "apply_attempt"
    : action === "repeat_handoff"
    ? "repeat_handoff"
    : action === "revise_handoff"
    ? "revise_handoff"
    : action === "handoff_to_one_shot"
    ? "handoff_to_one_shot"
    : action === "clarify_one_shot_vs_recurring"
    ? "clarify_one_shot_vs_recurring"
    : action === "ask_time"
    ? "ask_time"
    : action === "ask_content"
    ? "ask_content"
    : action === "get_info_product" || action === "get_info_db"
    ? "inline_tool_return"
    : "handoff_ready";
  const cadenceSummary = fields.recurrence.cadence_label;
  const timeSummary = input.time ? `${input.time}, Europe/Paris` : null;
  const missing = input.missing_fields ?? [];
  return {
    flow_action: action,
    confidence: "high",
    risk_score: 0,
    recurring_state: {
      phase: action === "handoff_ready" ? "handoff_ready" : "intake",
      user_intent: action === "handoff_to_one_shot"
        ? "one_shot_handoff"
        : "start",
      summary: "test recurring local dispatcher",
      user_words: ["test"],
      one_shot_conflict: action === "handoff_to_one_shot"
        ? "clear_one_shot"
        : action === "clarify_one_shot_vs_recurring"
        ? "ambiguous"
        : "none",
      minimum_fields_ready: Boolean(
        input.frequency && input.time && input.message,
      ),
    },
    fields,
    missing_fields: input.missing_fields ?? [],
    handoff_draft: {
      ready: Boolean(input.frequency && input.time && input.message),
      reminder_summary: input.message ?? null,
      cadence_summary: fields.recurrence.cadence_label,
      time_summary: input.time ? `${input.time}, Europe/Paris` : null,
      content_summary: input.message ?? null,
      platform_destination: "Initiatives",
      preserve: [],
      avoid: [],
    },
    inline_tool: {
      requested: false,
      tool_name: null,
      question_to_answer: null,
      active_flow_context: null,
    },
    visible_task: {
      kind: visibleKind,
      conversation_context: {
        source_flow: "create_recurring_reminder",
        stage_goal: visibleKind,
        current_user_message_summary: "test",
        active_flow_summary:
          "Préparer un rappel récurrent à reprendre dans Initiatives, sans mutation chat.",
        collected_state: {
          fields,
          executable_from_chat: false,
        },
        known_values: {
          recurring_summary: "rappel récurrent",
          cadence_summary: cadenceSummary,
          time_summary: timeSummary,
          content_summary: input.message ?? null,
          platform_destination: "Initiatives",
          revised_value_summary: input.message ?? null,
        },
        missing_or_weak_values: missing,
        question_to_ask: missing[0] ?? null,
        handoff: {
          ready: Boolean(input.frequency && input.time && input.message),
          reminder_summary: input.message ?? null,
          cadence_summary: cadenceSummary,
          time_summary: timeSummary,
          content_summary: input.message ?? null,
          platform_destination: "Initiatives",
          preserve: [],
          avoid: [],
          executable_from_chat: false,
        },
        inline_tool_result: null,
        note_information_summary: null,
        unresolved_questions: missing,
        evidence_used: ["test_local_dispatcher"],
        tone_constraints: ["court", "conversationnel"],
        do_not_say: [
          "créé",
          "programmé",
          "actif",
          "enregistré",
          "je te relancerai",
        ],
      },
    },
    note_information: {
      needed: action === "handoff_to_one_shot" ||
        action === "exit_to_global_dispatcher",
      source_flow_id: "create_recurring_reminder",
      handoff_reason: action === "handoff_to_one_shot"
        ? "one_shot_boundary"
        : action === "exit_to_global_dispatcher"
        ? "topic_change"
        : "none",
      target_dispatcher: action === "handoff_to_one_shot"
        ? "one_shot_reminder"
        : action === "exit_to_global_dispatcher"
        ? "global"
        : null,
      handoff_context_for_next_dispatcher: action === "handoff_to_one_shot"
        ? "demande ponctuelle claire"
        : action === "exit_to_global_dispatcher"
        ? "sortie du flow create_recurring_reminder avant mutation"
        : null,
      user_words: [],
      structured_context: {},
    },
    evidence: ["test_local_dispatcher"],
  };
}

const testVisibleAgent = async (input: any): Promise<string | null> => {
  assertEquals(Boolean(input.visible_task?.conversation_context), true);
  const context = input.visible_task.conversation_context;
  const handoff = context.handoff ?? {};
  if (input.stage === "clarify_one_shot_vs_recurring") {
    return "Tu veux un rappel ponctuel demain matin ou un rappel récurrent tous les matins ?";
  }
  if (input.stage === "handoff_to_one_shot") {
    return "Ce rappel devient ponctuel. Je laisse le flow de rappel ponctuel le gérer.";
  }
  if (input.stage === "inline_tool_return") {
    return context.inline_tool_result?.reply ??
      "Je n'ai pas pu vérifier ce statut dans ce tour.";
  }
  const content = handoff.content_summary ??
    context.known_values.content_summary;
  const cadence = handoff.cadence_summary ??
    context.known_values.cadence_summary;
  const time = handoff.time_summary ?? context.known_values.time_summary;
  const destination = handoff.platform_destination ??
    context.known_values.platform_destination ?? "Initiatives";
  return `À reprendre dans ${destination} : ${content}, ${cadence}, ${time}. Je ne crée pas de rappel récurrent depuis le chat.`;
};

function baseRuntime(overrides: Record<string, unknown> = {}) {
  return {
    supabase: {} as any,
    userId: "u1",
    userMessage:
      "Crée-moi un rappel tous les lundis à 9h pour préparer ma semaine.",
    channel: "web" as const,
    userTimezone: "Europe/Paris",
    tempMemory: {},
    turnFrame: null,
    routeDecision: routeDecision(),
    safetyContextOutput: { risk_band: "none" as const },
    sourceMessageId: "m1",
    requestId: "r1",
    buildPlatformContext: () => ({}),
    runLocalDispatcher: async () =>
      localDispatcherOutput({
        frequency: "weekly",
        days: ["lundi"],
        time: "09:00",
        message: "préparer ma semaine",
      }),
    runVisibleAgent: testVisibleAgent,
    ...overrides,
  };
}

Deno.test("create_recurring_reminder dispatcher prompt documents field completion rules and two examples", () => {
  const prompt = buildCreateRecurringReminderLocalDispatcherSystemPrompt();
  assertEquals(prompt.includes("## Field Completion Rules"), true);
  assertEquals(
    prompt.includes("flow_action: décision principale du tour"),
    true,
  );
  assertEquals(prompt.includes("recurring_state: état métier compact"), true);
  assertEquals(prompt.includes("fields.recurrence:"), true);
  assertEquals(prompt.includes("fields.reminder_content:"), true);
  assertEquals(prompt.includes("fields.destination:"), true);
  assertEquals(prompt.includes("visible_task.conversation_context:"), true);
  assertEquals(prompt.includes("note_information:"), true);
  assertEquals(prompt.includes("## Transition Rules"), true);
  assertEquals(prompt.includes("exit_to_global_dispatcher/cancel_flow"), true);
  assertEquals(prompt.includes("exit_to_global_dispatcher"), true);
  assertEquals(prompt.includes("safety_preempt"), true);
  assertEquals((prompt.match(/Example [12] -/g) ?? []).length, 2);
  assertEquals(prompt.includes("response_contract"), false);
  assertEquals(prompt.includes("exit_memo"), false);
});

Deno.test("create_recurring_reminder router delivers handoff and never creates executable confirmation", async () => {
  const runtime = await maybeRunCreateRecurringReminderOperation(baseRuntime());

  assertEquals(runtime?.toolExecution, "platform_handoff");
  assertEquals(runtime?.executedTools, []);
  assertEquals(runtime?.committedEffects, []);
  assertEquals(
    Boolean(runtime?.nextTempMemory.__pending_tool_skill_confirmation),
    false,
  );
  assertEquals(
    runtime?.nextTempMemory.__recurring_reminder_handoff_state
      ?.executable_from_chat,
    false,
  );
  assertEquals(
    (runtime?.toolSkillRun.platform_handoff as any)?.draft
      ?.operation_type,
    "create_recurring_reminder",
  );
});

Deno.test("create_recurring_reminder surfaces local dispatcher failure diagnostics", async () => {
  const runtime = await maybeRunCreateRecurringReminderOperation(baseRuntime({
    runLocalDispatcher: async (input: any) => {
      input.report_failure?.({
        source: "create_recurring_reminder.local_dispatcher",
        phase: "normalize",
        request_id: "r1",
        user_id: "u1",
        error_name: "SyntaxError",
        error_message: "Unexpected token",
        error_code: "Unexpected",
        raw_output_present: true,
        raw_output_type: "string",
        raw_output_excerpt: "not json",
      });
      return null;
    },
    runVisibleAgent: async () =>
      "Je n'arrive pas à traiter correctement ce tour.",
  }));

  assertEquals(runtime?.toolExecution, "blocked");
  assertEquals(runtime?.toolSkillRun.reason_code, "local_dispatcher_failed");
  assertEquals(
    (runtime?.toolSkillRun as any)?.local_dispatcher_failure?.phase,
    "normalize",
  );
  assertEquals(
    (runtime?.toolSkillRun as any)?.blocked_effects?.[0]?.diagnostic
      ?.raw_output_excerpt,
    "not json",
  );
});

Deno.test("create_recurring_reminder preserves user constraints in visible conversation context", async () => {
  let capturedContext: any = null;
  const runtime = await maybeRunCreateRecurringReminderOperation(baseRuntime({
    runLocalDispatcher: async () => {
      const output = localDispatcherOutput({
        frequency: "daily",
        time: "18:00",
        message: "respirer",
      });
      return {
        ...output,
        handoff_draft: {
          ...output.handoff_draft,
          preserve: ["brouillon seulement", "ne pas créer depuis le chat"],
          avoid: ["confirmation exécutable"],
        },
        visible_task: {
          ...output.visible_task,
          conversation_context: {
            ...output.visible_task.conversation_context,
            handoff: {
              ...output.visible_task.conversation_context.handoff,
              preserve: ["brouillon seulement", "ne pas créer depuis le chat"],
              avoid: ["confirmation exécutable"],
            },
            known_values: {
              ...output.visible_task.conversation_context.known_values,
              user_constraint_summary: "brouillon seulement",
            },
          },
        },
      };
    },
    runVisibleAgent: async (input: any) => {
      capturedContext = input.visible_task.conversation_context;
      return "Je garde la version en brouillon à reprendre dans Initiatives, sans création depuis le chat.";
    },
  }));

  assertEquals(runtime?.toolExecution, "platform_handoff");
  assertEquals(
    capturedContext?.handoff?.preserve?.includes("brouillon seulement"),
    true,
  );
  assertEquals(
    capturedContext?.handoff?.avoid?.includes("confirmation exécutable"),
    true,
  );
});

Deno.test("create_recurring_reminder apply_attempt does not execute and repeats platform destination", async () => {
  const initial = await maybeRunCreateRecurringReminderOperation(baseRuntime());
  const runtime = await maybeRunCreateRecurringReminderOperation(baseRuntime({
    userMessage: "ok programme-le",
    tempMemory: initial?.nextTempMemory,
    routeDecision: null,
    runLocalDispatcher: async () =>
      localDispatcherOutput({
        flow_action: "apply_attempt",
        frequency: "weekly",
        days: ["lundi"],
        time: "09:00",
        message: "préparer ma semaine",
      }),
  }));

  assertEquals(runtime?.toolExecution, "platform_handoff");
  assertEquals(runtime?.executedTools, []);
  assertEquals(runtime?.committedEffects, []);
  assertEquals(runtime?.toolSkillRun.status, "apply_attempt");
  assertEquals(runtime?.content.includes("Initiatives"), true);
  assertEquals(runtime?.content.includes("Destination plateforme"), false);
  assertEquals(
    runtime?.content.includes(
      "Je ne crée pas de rappel récurrent depuis le chat.",
    ),
    true,
  );
});

Deno.test("create_recurring_reminder anti false positive continuation does not exit global", async () => {
  const initial = await maybeRunCreateRecurringReminderOperation(baseRuntime());
  const runtime = await maybeRunCreateRecurringReminderOperation(baseRuntime({
    userMessage: "oui continue, redis-moi juste les infos à reprendre",
    tempMemory: initial?.nextTempMemory,
    routeDecision: null,
    runLocalDispatcher: async () =>
      localDispatcherOutput({
        flow_action: "repeat_handoff",
        frequency: "weekly",
        days: ["lundi"],
        time: "09:00",
        message: "préparer ma semaine",
      }),
  }));

  assertEquals(runtime?.toolExecution, "platform_handoff");
  assertEquals(
    (runtime?.toolSkillRun.local_reducer as any)?.exit_to_global_dispatcher,
    false,
  );
  assertEquals(
    (runtime?.toolSkillRun.local_reducer as any)?.note_information?.needed,
    false,
  );
});

Deno.test("create_recurring_reminder active route apply_attempt bypasses clarification and repeats draft", async () => {
  const initial = await maybeRunCreateRecurringReminderOperation(baseRuntime());
  const runtime = await maybeRunCreateRecurringReminderOperation(baseRuntime({
    userMessage: "ok programme-le",
    tempMemory: initial?.nextTempMemory,
    routeDecision: {
      ...routeDecision(),
      reason_code: "active_handoff_apply_attempt",
    },
    runLocalDispatcher: async () =>
      localDispatcherOutput({
        flow_action: "apply_attempt",
        frequency: "weekly",
        days: ["lundi"],
        time: "09:00",
        message: "préparer ma semaine",
      }),
  }));

  assertEquals(runtime?.toolSkillRun.status, "apply_attempt");
  assertEquals(runtime?.executedTools, []);
  assertEquals(runtime?.committedEffects, []);
  assertEquals(runtime?.content.includes("Initiatives"), true);
  assertEquals(runtime?.content.includes("Destination plateforme"), false);
});

Deno.test("create_recurring_reminder safety preempt blocks local flow with safety note", async () => {
  const initial = await maybeRunCreateRecurringReminderOperation(baseRuntime());
  const runtime = await maybeRunCreateRecurringReminderOperation(baseRuntime({
    userMessage: "je suis en danger, arrête le rappel",
    tempMemory: initial?.nextTempMemory,
    routeDecision: null,
    runLocalDispatcher: async () => {
      const output = localDispatcherOutput({
        flow_action: "safety_preempt",
        frequency: "weekly",
        days: ["lundi"],
        time: "09:00",
        message: "préparer ma semaine",
      });
      return {
        ...output,
        risk_score: 9,
        visible_task: {
          ...output.visible_task,
          kind: "safety",
          conversation_context: {
            ...output.visible_task.conversation_context,
            stage_goal: "safety",
            note_information_summary: {
              target_dispatcher: "safety_crisis",
              handoff_reason: "safety",
            },
          },
        },
        note_information: {
          ...output.note_information,
          needed: true,
          handoff_reason: "safety",
          target_dispatcher: "safety_crisis",
          handoff_context_for_next_dispatcher:
            "Le user exprime un danger; suspendre le flow rappel et reprendre en safety.",
          structured_context: {
            user_message_summary: "danger exprimé",
            active_flow_summary: "rappel récurrent suspendu",
            recommended_next_focus: "safety immédiate",
          },
          risk_score: 9,
        },
      };
    },
    runVisibleAgent: async () => "Je mets le rappel de côté.",
  }));

  assertEquals(runtime?.toolExecution, "blocked");
  assertEquals(
    (runtime?.toolSkillRun.local_reducer as any)?.note_information
      ?.target_dispatcher,
    "safety_crisis",
  );
  assertEquals(
    (runtime?.toolSkillRun.local_reducer as any)?.exit_to_global_dispatcher,
    false,
  );
});

Deno.test("create_recurring_reminder repeat_handoff repeats platform draft", async () => {
  const initial = await maybeRunCreateRecurringReminderOperation(baseRuntime());
  const runtime = await maybeRunCreateRecurringReminderOperation(baseRuntime({
    userMessage: "redis-moi quoi mettre",
    tempMemory: initial?.nextTempMemory,
    routeDecision: null,
    runLocalDispatcher: async () =>
      localDispatcherOutput({
        flow_action: "repeat_handoff",
        frequency: "weekly",
        days: ["lundi"],
        time: "09:00",
        message: "préparer ma semaine",
      }),
  }));

  assertEquals(runtime?.toolExecution, "platform_handoff");
  assertEquals(runtime?.toolSkillRun.status, "repeat_handoff");
  assertEquals(runtime?.content.includes("préparer ma semaine"), true);
  assertEquals(runtime?.content.includes("Initiatives"), true);
});

Deno.test("create_recurring_reminder revise_handoff updates cadence time and content", async () => {
  const initial = await maybeRunCreateRecurringReminderOperation(baseRuntime());
  const runtime = await maybeRunCreateRecurringReminderOperation(baseRuntime({
    userMessage:
      "plutôt tous les lundis à 8h30 pour faire le point prioritaire",
    tempMemory: initial?.nextTempMemory,
    routeDecision: null,
    runLocalDispatcher: async () =>
      localDispatcherOutput({
        flow_action: "revise_handoff",
        frequency: "weekly",
        days: ["lundi"],
        time: "08:30",
        message: "faire le point prioritaire",
      }),
  }));

  assertEquals(runtime?.toolExecution, "platform_handoff");
  assertEquals(runtime?.toolSkillRun.status, "revise_handoff");
  assertEquals(runtime?.content.includes("faire le point prioritaire"), true);
  assertEquals(runtime?.content.includes("08:30"), true);
});

Deno.test("create_recurring_reminder local dispatcher preserves custom cadence in handoff", async () => {
  const runtime = await maybeRunCreateRecurringReminderOperation(baseRuntime({
    userMessage:
      "Prépare un rappel récurrent toutes les deux semaines le mardi à 18h30 pour envoyer mon résumé d'équipe.",
    runLocalDispatcher: async () => {
      const output = localDispatcherOutput({
        frequency: "custom",
        days: ["mardi"],
        time: "18:30",
        message: "envoyer mon résumé d'équipe",
      });
      return {
        ...output,
        fields: {
          ...output.fields,
          recurrence: {
            ...output.fields.recurrence,
            cadence_label: "toutes les deux semaines, mardi",
          },
        },
        handoff_draft: {
          ...output.handoff_draft,
          cadence_summary: "toutes les deux semaines, mardi",
        },
        visible_task: {
          ...output.visible_task,
          conversation_context: {
            ...output.visible_task.conversation_context,
            known_values: {
              ...output.visible_task.conversation_context.known_values,
              cadence_summary: "toutes les deux semaines, mardi",
            },
            handoff: {
              ...output.visible_task.conversation_context.handoff,
              cadence_summary: "toutes les deux semaines, mardi",
            },
          },
        },
      };
    },
  }));

  assertEquals(runtime?.toolExecution, "platform_handoff");
  assertEquals(
    (runtime?.toolSkillRun.platform_handoff as any)?.draft
      ?.cadence_summary,
    "toutes les deux semaines, mardi",
  );
});

Deno.test("create_recurring_reminder initial ambiguity stays in local dispatcher", async () => {
  const runtime = await maybeRunCreateRecurringReminderOperation(baseRuntime({
    userMessage:
      "Je veux que Sophia me relance demain matin, ou peut-être tous les matins à 8h, je ne sais pas encore. Le contenu exact: choisir ma priorité du jour.",
    runLocalDispatcher: async () =>
      localDispatcherOutput({
        flow_action: "clarify_one_shot_vs_recurring",
        frequency: null,
        time: "08:00",
        message: "choisir ma priorité du jour",
        missing_fields: ["recurrence"],
      }),
  }));

  assertEquals(runtime?.toolExecution, "platform_handoff");
  assertEquals(runtime?.executedTools, []);
  assertEquals(runtime?.committedEffects, []);
  assertEquals(runtime?.toolSkillRun.status, "collecting");
  assertEquals(
    runtime?.content.includes("ponctuel") &&
      runtime?.content.includes("récurrent"),
    true,
  );
});

Deno.test("create_recurring_reminder one-shot clarification exits to one-shot owner", async () => {
  const initial = await maybeRunCreateRecurringReminderOperation(baseRuntime());
  const runtime = await maybeRunCreateRecurringReminderOperation(baseRuntime({
    userMessage: "non finalement juste demain matin",
    tempMemory: initial?.nextTempMemory,
    routeDecision: null,
    runLocalDispatcher: async () =>
      localDispatcherOutput({
        flow_action: "handoff_to_one_shot",
        frequency: null,
        time: null,
        message: null,
      }),
  }));

  assertEquals(runtime?.toolExecution, "none");
  assertEquals(runtime?.executedTools, []);
  assertEquals(runtime?.committedEffects, []);
  assertEquals(runtime?.toolSkillRun.status, "handoff_to_one_shot");
  assertEquals(
    Boolean(runtime?.nextTempMemory.__recurring_reminder_handoff_state),
    false,
  );
  assertEquals(
    (runtime?.toolSkillRun.local_reducer as any)?.note_information
      ?.target_dispatcher,
    "one_shot_reminder",
  );
  assertEquals(
    (runtime?.toolSkillRun.platform_handoff as any)?.draft,
    null,
  );
});

Deno.test("create_recurring_reminder local stop exits to global with note", async () => {
  const initial = await maybeRunCreateRecurringReminderOperation(baseRuntime());
  const runtime = await maybeRunCreateRecurringReminderOperation(baseRuntime({
    userMessage: "laisse tomber",
    tempMemory: initial?.nextTempMemory,
    routeDecision: null,
    runLocalDispatcher: async () =>
      localDispatcherOutput({
        flow_action: "exit_to_global_dispatcher",
        frequency: "weekly",
        days: ["lundi"],
        time: "09:00",
        message: "préparer ma semaine",
      }),
    runVisibleAgent: async () => "Ok, je laisse tomber ce rappel récurrent.",
  }));

  assertEquals(runtime?.toolExecution, "none");
  assertEquals(
    Boolean(runtime?.nextTempMemory.__recurring_reminder_handoff_state),
    false,
  );
  assertEquals(
    (runtime?.toolSkillRun.local_reducer as any)?.exit_to_global_dispatcher,
    true,
  );
  assertEquals(
    (runtime?.toolSkillRun.local_reducer as any)?.note_information
      ?.target_dispatcher,
    "global",
  );
});

Deno.test("create_recurring_reminder initial local activation passes note_information inbound", async () => {
  let inboundNote: Record<string, unknown> | null = null;
  const runtime = await maybeRunCreateRecurringReminderOperation(baseRuntime({
    runLocalDispatcher: async (input: any) => {
      inboundNote = input.note_information_inbound ?? null;
      return localDispatcherOutput({
        frequency: "weekly",
        days: ["lundi"],
        time: "09:00",
        message: "préparer ma semaine",
      });
    },
  }));

  assertEquals(runtime?.toolExecution, "platform_handoff");
  const note = inboundNote as Record<string, unknown> | null;
  assertEquals(note?.["source_flow"], "global_dispatcher");
  assertEquals(note?.["target_dispatcher"], "create_recurring_reminder");
  assertEquals(
    (runtime?.toolSkillRun as any).activation_note_information
      ?.target_dispatcher,
    "create_recurring_reminder",
  );
});

Deno.test("create_recurring_reminder product inline keeps parent flow state and note", async () => {
  const initial = await maybeRunCreateRecurringReminderOperation(baseRuntime());
  const runtime = await maybeRunCreateRecurringReminderOperation(baseRuntime({
    userMessage: "c'est quoi un rappel récurrent ?",
    tempMemory: initial?.nextTempMemory,
    routeDecision: null,
    runLocalDispatcher: async () => {
      const output = localDispatcherOutput({
        flow_action: "get_info_product",
        frequency: "weekly",
        days: ["lundi"],
        time: "09:00",
        message: "préparer ma semaine",
      });
      return {
        ...output,
        inline_tool: {
          requested: true,
          tool_name: "get_info_product",
          question_to_answer: "c'est quoi un rappel récurrent ?",
          active_flow_context: "handoff recurring actif",
        },
        note_information: {
          ...output.note_information,
          needed: true,
          handoff_reason: "inline_tool",
          target_dispatcher: "product_help",
        },
      };
    },
    runInlineGetInfoProduct: async (args: any) => ({
      content: "Un rappel récurrent revient selon un rythme que tu choisis.",
      context: args.context,
      subskillRun: {
        selected_handler: "product_help",
        active_flow_context: args.context,
      },
      runtimeTrace: [{
        component: "create_recurring_reminder",
        event: "get_info_product_called",
      }],
    }),
  }));

  assertEquals(runtime?.toolExecution, "platform_handoff");
  assertEquals(
    Boolean(runtime?.nextTempMemory.__recurring_reminder_handoff_state),
    true,
  );
  assertEquals(
    (runtime?.toolSkillRun.local_reducer as any)?.note_information
      ?.target_dispatcher,
    "product_help",
  );
});

Deno.test("create_recurring_reminder db inline empty result stays nonempty and preserves parent flow", async () => {
  const initial = await maybeRunCreateRecurringReminderOperation(baseRuntime());
  const runtime = await maybeRunCreateRecurringReminderOperation(baseRuntime({
    userMessage: "combien de rappels récurrents actifs j'ai ?",
    tempMemory: initial?.nextTempMemory,
    routeDecision: null,
    runLocalDispatcher: async () => {
      const output = localDispatcherOutput({
        flow_action: "get_info_db",
        frequency: "weekly",
        days: ["lundi"],
        time: "09:00",
        message: "préparer ma semaine",
      });
      return {
        ...output,
        inline_tool: {
          requested: true,
          tool_name: "get_info_db",
          question_to_answer: "combien de rappels récurrents actifs j'ai ?",
          active_flow_context: "handoff recurring actif",
        },
        note_information: {
          ...output.note_information,
          needed: true,
          handoff_reason: "inline_tool",
          target_dispatcher: "status_recap",
        },
      };
    },
    runInlineGetInfoDb: async (args: any) => ({
      content: "",
      context: args.context,
      subskillRun: {
        selected_handler: "status_recap",
        reason_code: "empty_status_runtime",
        active_flow_context: args.context,
      },
      runtimeTrace: [{
        component: "create_recurring_reminder",
        event: "get_info_db_called",
      }],
    }),
  }));

  assertEquals(runtime?.toolExecution, "platform_handoff");
  assertEquals(Boolean(runtime?.content?.trim()), true);
  assertEquals(
    Boolean(runtime?.nextTempMemory.__recurring_reminder_handoff_state),
    true,
  );
  assertEquals(
    (runtime?.toolSkillRun.local_reducer as any)?.visible_task?.kind,
    "inline_tool_return",
  );
  assertEquals(
    (runtime?.toolSkillRun.local_reducer as any)?.note_information
      ?.target_dispatcher,
    "status_recap",
  );
});

Deno.test("create_recurring_reminder exit carries note_information", async () => {
  const initial = await maybeRunCreateRecurringReminderOperation(baseRuntime());
  const runtime = await maybeRunCreateRecurringReminderOperation(baseRuntime({
    userMessage: "laisse ça, aide-moi à prioriser",
    tempMemory: initial?.nextTempMemory,
    routeDecision: null,
    runLocalDispatcher: async () => {
      const output = localDispatcherOutput({
        flow_action: "exit_to_global_dispatcher",
        frequency: "weekly",
        days: ["lundi"],
        time: "09:00",
        message: "préparer ma semaine",
      });
      return {
        ...output,
        note_information: {
          ...output.note_information,
          needed: true,
          handoff_reason: "topic_change",
          target_dispatcher: "global",
          handoff_context_for_next_dispatcher:
            "Le user veut quitter le rappel et prioriser.",
        },
      };
    },
    runVisibleAgent: async () => "Ok, je mets ce rappel de côté.",
  }));

  assertEquals(runtime?.toolExecution, "none");
  assertEquals(
    (runtime?.toolSkillRun.local_reducer as any)?.exit_to_global_dispatcher,
    true,
  );
  assertEquals(
    (runtime?.toolSkillRun.local_reducer as any)?.note_information
      ?.target_dispatcher,
    "global",
  );
});
