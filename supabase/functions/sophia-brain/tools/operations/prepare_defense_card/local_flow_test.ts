import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  createInitialPrepareDefenseCardLocalState,
  DEFENSE_CARD_SUPPORT_NEED_LABEL,
  localDispatcherSystemPrompt,
  type PrepareDefenseCardLocalDispatcherOutput,
  reducePrepareDefenseCardLocalDispatcherOutput,
} from "./local_flow.ts";
import {
  type PrepareDefenseCardVisibleAgentInput,
  prepareDefenseCardVisibleContractIssues,
} from "./visible_agent.ts";
import { maybeRunPrepareDefenseCardOperation } from "./router.ts";

type AssertNever<T extends never> = T;
type LegacyRequiredDataKey = "required_" extends infer Prefix
  ? Prefix extends string ? `${Prefix}data` : never
  : never;
type _PrepareDefenseCardVisibleInputHasNoLegacyFields = AssertNever<
  Extract<
    keyof PrepareDefenseCardVisibleAgentInput,
    | "user_message"
    | "recent_messages"
    | "local_state"
    | "draft"
    | LegacyRequiredDataKey
  >
>;

function decision(
  patch: Partial<PrepareDefenseCardLocalDispatcherOutput>,
): PrepareDefenseCardLocalDispatcherOutput {
  return {
    flow_action: "answer_current_field",
    confidence: "high",
    risk_score: 0,
    tool_fit: "defense",
    current_stage: "support_need_intake",
    stage: "support_need_intake",
    route_kind: "free_card",
    slot_updates: {},
    platform_field_updates: {},
    tool_fit_state: {
      status: "defense",
      reason: "moment de risque",
      needs_user_confirmation: false,
      why_status: "clear",
    },
    attachment_state: {
      status: "missing",
      kind: null,
      plan_item_id: null,
      candidate_value: null,
      locked_value: null,
      candidate_options: [],
      needs_user_confirmation: false,
      why_status: "missing",
    },
    risk_state: {
      status: "missing",
      label: null,
      description: null,
      timing_hint: null,
      context_hint: null,
      needs_user_confirmation: false,
      why_status: "missing",
    },
    trigger_state: {
      status: "missing",
      type: null,
      candidate_value: null,
      locked_value: null,
      needs_user_confirmation: false,
      why_status: "missing",
    },
    defense_goal_state: {
      status: "missing",
      value: null,
      candidate_value: null,
      locked_value: null,
      needs_user_confirmation: false,
      why_status: "missing",
    },
    defense_response_hint_state: {
      status: "missing",
      strategy_hint: null,
      candidate_value: null,
      locked_value: null,
      needs_user_confirmation: false,
      why_status: "missing",
    },
    support_need_state: {
      field_id: "support_need",
      question_label: DEFENSE_CARD_SUPPORT_NEED_LABEL,
      status: "missing",
      candidate_value: null,
      locked_value: null,
      previous_value: null,
      needs_user_confirmation: false,
      why_status: "missing",
    },
    revision: {
      is_revision: false,
      revision_target: null,
      replacement_value: null,
      replaces_previous_value: false,
    },
    visible_task: {
      kind: "ask_support_need",
    },
    subskill_call: {
      needed: false,
      skill_id: null,
      reason: null,
      context_for_subskill: {},
    },
    handoff_state: null,
    exit_memo: {
      needed: false,
      reason: "none",
      flow_summary: null,
      handoff_hint_for_global_dispatcher: null,
    },
    note_information: null,
    no_chat_mutation: {
      defense_card_created: false,
      pending_confirmation_created: false,
      confirmation_token_created: false,
      db_write_committed: false,
    },
    risk_assessment: {
      risk_score: 0,
      risk_band: "none",
      safety_preempt: false,
      reason_codes: [],
    },
    evidence: [],
    ...patch,
  };
}

function lockedSupportNeed(value: string) {
  return decision({
    flow_action: "handoff_ready",
    support_need_state: {
      field_id: "support_need",
      question_label: DEFENSE_CARD_SUPPORT_NEED_LABEL,
      status: "locked",
      candidate_value: null,
      locked_value: value,
      previous_value: null,
      needs_user_confirmation: false,
      why_status: "clear",
    },
    visible_task: {
      kind: "handoff_ready",
    },
  });
}

Deno.test("prepare_defense_card dispatcher prompt documents real output fields", () => {
  const prompt = localDispatcherSystemPrompt();
  assertStringIncludes(prompt, "Field Completion Rules:");
  assertStringIncludes(prompt, "Transition Rules:");

  for (
    const field of [
      "flow_action",
      "confidence",
      "risk_score",
      "tool_fit",
      "tool_fit_state",
      "current_stage",
      "stage",
      "route_kind",
      "slot_updates",
      "platform_field_updates",
      "attachment_state",
      "risk_state",
      "trigger_state",
      "defense_goal_state",
      "defense_response_hint_state",
      "support_need_state",
      "revision",
      "visible_task.kind",
      "visible_task.conversation_context",
      "subskill_call",
      "handoff_state",
      "exit_memo",
      "note_information",
      "no_chat_mutation",
      "risk_assessment",
      "evidence",
    ]
  ) {
    assertStringIncludes(prompt, field);
  }

  assertStringIncludes(prompt, "stop_local_no_handoff");
  assertStringIncludes(prompt, "exit_to_global_dispatcher");
  assertStringIncludes(prompt, "safety_preempt");
  assertStringIncludes(prompt, "note_information.target_dispatcher=global");
  assertStringIncludes(
    prompt,
    "note_information.target_dispatcher=safety_crisis",
  );
  assertStringIncludes(prompt, DEFENSE_CARD_SUPPORT_NEED_LABEL);
  assertEquals(prompt.includes("handoff_to_local_dispatcher"), false);
  assertEquals(prompt.includes("handoff_to_local_flow"), false);
  assertEquals(prompt.includes("response_contract"), false);
  assertEquals((prompt.match(/Example JSON/g) ?? []).length, 2);
});

Deno.test("prepare_defense_card vague answer does not lock support_need", () => {
  const result = reducePrepareDefenseCardLocalDispatcherOutput({
    previous: createInitialPrepareDefenseCardLocalState(),
    output: decision({
      support_need_state: {
        field_id: "support_need",
        question_label: DEFENSE_CARD_SUPPORT_NEED_LABEL,
        status: "missing",
        candidate_value: null,
        locked_value: null,
        previous_value: null,
        needs_user_confirmation: false,
        why_status: "je suis en vrac is too vague",
      },
      visible_task: {
        kind: "ask_support_need",
      },
    }),
  });
  assertEquals(result.local_state?.support_need_state.status, "missing");
  assertEquals(result.draft, null);
});

Deno.test("prepare_defense_card continuation does not exit on active flow", () => {
  const result = reducePrepareDefenseCardLocalDispatcherOutput({
    previous: createInitialPrepareDefenseCardLocalState(),
    output: decision({
      flow_action: "answer_current_field",
      visible_task: {
        kind: "ask_support_need",
      },
    }),
  });
  assertEquals(result.exit_to_global_dispatcher, false);
  assertEquals(result.stop_local_no_handoff, false);
  assertEquals(result.safety_preempt, false);
  assertEquals(result.visible_task, "ask_support_need");
});

Deno.test("prepare_defense_card preserves dispatcher constraints in visible context", () => {
  const result = reducePrepareDefenseCardLocalDispatcherOutput({
    previous: createInitialPrepareDefenseCardLocalState(),
    output: decision({
      flow_action: "answer_current_field",
      visible_task: {
        kind: "ask_support_need",
        conversation_context: {
          tone_constraints: ["une seule question, pas de coaching"],
          do_not_say: ["ne propose pas de plan d'action rigide"],
          context_summary:
            "Le user veut une défense sobre contre un automatisme du soir.",
          user_words: ["automatisme du soir"],
        },
      },
    }),
  });
  assertEquals(
    result.visible_task_context.tone_constraints,
    ["une seule question, pas de coaching"],
  );
  assertEquals(
    result.visible_task_context.do_not_say,
    ["ne propose pas de plan d'action rigide"],
  );
  assertEquals(
    result.visible_task_context.context_summary,
    "Le user veut une défense sobre contre un automatisme du soir.",
  );
  assertEquals(result.visible_task_context.user_words, ["automatisme du soir"]);
});

Deno.test("prepare_defense_card clear answer locks support_need and prepares handoff", () => {
  const value =
    "Quand je rentre fatigué et que j'ai l'impulsion de commander n'importe quoi.";
  const result = reducePrepareDefenseCardLocalDispatcherOutput({
    previous: createInitialPrepareDefenseCardLocalState(),
    output: lockedSupportNeed(value),
  });
  assertEquals(result.status, "handoff_delivered");
  assertEquals(result.visible_task, "handoff_ready");
  assertEquals(result.local_state?.support_need_state.locked_value, value);
  assertEquals(result.draft?.platform_flow.questionnaire_answers.length, 1);
  assertEquals(
    result.draft?.platform_flow.questionnaire_answers[0]?.field_id,
    "support_need",
  );
  assertEquals(
    result.draft?.platform_flow.questionnaire_answers[0]?.question_label,
    DEFENSE_CARD_SUPPORT_NEED_LABEL,
  );
  assertEquals(
    result.draft?.platform_flow.questionnaire_answers[0]?.value,
    value,
  );
});

Deno.test("prepare_defense_card proposed support_need waits for confirmation", () => {
  const result = reducePrepareDefenseCardLocalDispatcherOutput({
    previous: createInitialPrepareDefenseCardLocalState(),
    output: decision({
      flow_action: "answer_current_field",
      support_need_state: {
        field_id: "support_need",
        question_label: DEFENSE_CARD_SUPPORT_NEED_LABEL,
        status: "proposed",
        candidate_value: "Quand je rentre fatigué et que je pars scroller.",
        locked_value: null,
        previous_value: null,
        needs_user_confirmation: true,
        why_status: "deduced from message",
      },
      visible_task: {
        kind: "confirm_support_need_proposal",
      },
    }),
  });
  assertEquals(result.local_state?.support_need_state.status, "proposed");
  assertEquals(result.draft, null);
});

Deno.test("prepare_defense_card confirmation locks proposed support_need", () => {
  const first = reducePrepareDefenseCardLocalDispatcherOutput({
    previous: createInitialPrepareDefenseCardLocalState(),
    output: decision({
      support_need_state: {
        field_id: "support_need",
        question_label: DEFENSE_CARD_SUPPORT_NEED_LABEL,
        status: "proposed",
        candidate_value: "Quand je rentre fatigué et que je pars scroller.",
        locked_value: null,
        previous_value: null,
        needs_user_confirmation: true,
        why_status: "proposal",
      },
      visible_task: {
        kind: "confirm_support_need_proposal",
      },
    }),
  });
  const second = reducePrepareDefenseCardLocalDispatcherOutput({
    previous: first.local_state,
    output: decision({
      flow_action: "confirm_proposed_field",
      support_need_state: {
        field_id: "support_need",
        question_label: DEFENSE_CARD_SUPPORT_NEED_LABEL,
        status: "locked",
        candidate_value: null,
        locked_value: "Quand je rentre fatigué et que je pars scroller.",
        previous_value: null,
        needs_user_confirmation: false,
        why_status: "user confirmed",
      },
    }),
  });
  assertEquals(second.local_state?.support_need_state.status, "locked");
  assertEquals(second.status, "handoff_delivered");
});

Deno.test("prepare_defense_card short confirmation locks previous proposed support_need", () => {
  const proposedValue =
    "Les soirs où je rentre rincé et que j'ouvre les applis de livraison.";
  const first = reducePrepareDefenseCardLocalDispatcherOutput({
    previous: createInitialPrepareDefenseCardLocalState(),
    output: decision({
      support_need_state: {
        field_id: "support_need",
        question_label: DEFENSE_CARD_SUPPORT_NEED_LABEL,
        status: "proposed",
        candidate_value: proposedValue,
        locked_value: null,
        previous_value: null,
        needs_user_confirmation: true,
        why_status: "proposal",
      },
      visible_task: {
        kind: "confirm_support_need_proposal",
      },
    }),
  });
  const second = reducePrepareDefenseCardLocalDispatcherOutput({
    previous: first.local_state,
    output: decision({
      flow_action: "confirm_proposed_field",
      support_need_state: {
        field_id: "support_need",
        question_label: DEFENSE_CARD_SUPPORT_NEED_LABEL,
        status: "missing",
        candidate_value: null,
        locked_value: null,
        previous_value: null,
        needs_user_confirmation: false,
        why_status: "short confirmation",
      },
      visible_task: {
        kind: "handoff_ready",
      },
    }),
  });
  assertEquals(second.status, "handoff_delivered");
  assertEquals(second.reason_code, "platform_handoff_delivered");
  assertEquals(second.draft?.platform_fields?.status, "complete");
  assertEquals(second.local_state?.support_need_state.status, "locked");
  assertEquals(
    second.local_state?.support_need_state.locked_value,
    proposedValue,
  );
});

Deno.test("prepare_defense_card handoff_ready locks previous proposed support_need", () => {
  const proposedValue =
    "Quand je rentre épuisé et que je commande par automatisme.";
  const first = reducePrepareDefenseCardLocalDispatcherOutput({
    previous: createInitialPrepareDefenseCardLocalState(),
    output: decision({
      support_need_state: {
        field_id: "support_need",
        question_label: DEFENSE_CARD_SUPPORT_NEED_LABEL,
        status: "proposed",
        candidate_value: proposedValue,
        locked_value: null,
        previous_value: null,
        needs_user_confirmation: true,
        why_status: "proposal",
      },
      visible_task: {
        kind: "confirm_support_need_proposal",
      },
    }),
  });
  const second = reducePrepareDefenseCardLocalDispatcherOutput({
    previous: first.local_state,
    output: decision({
      flow_action: "handoff_ready",
      support_need_state: {
        field_id: "support_need",
        question_label: DEFENSE_CARD_SUPPORT_NEED_LABEL,
        status: "missing",
        candidate_value: null,
        locked_value: null,
        previous_value: null,
        needs_user_confirmation: false,
        why_status: "handoff-ready confirmation",
      },
      visible_task: {
        kind: "handoff_ready",
      },
    }),
  });
  assertEquals(second.status, "handoff_delivered");
  assertEquals(second.reason_code, "platform_handoff_delivered");
  assertEquals(second.draft?.platform_fields?.status, "complete");
  assertEquals(second.local_state?.support_need_state.status, "locked");
  assertEquals(
    second.local_state?.support_need_state.locked_value,
    proposedValue,
  );
});

Deno.test("prepare_defense_card revision replaces locked support_need", () => {
  const first = reducePrepareDefenseCardLocalDispatcherOutput({
    previous: createInitialPrepareDefenseCardLocalState(),
    output: lockedSupportNeed("ancienne phrase"),
  });
  const second = reducePrepareDefenseCardLocalDispatcherOutput({
    previous: first.local_state,
    output: decision({
      flow_action: "revise_support_need",
      support_need_state: {
        field_id: "support_need",
        question_label: DEFENSE_CARD_SUPPORT_NEED_LABEL,
        status: "locked",
        candidate_value: null,
        locked_value:
          "Quand je rentre stressé, j'ai besoin d'aide à ne pas partir directement dans une commande compulsive.",
        previous_value: "ancienne phrase",
        needs_user_confirmation: false,
        why_status: "revision",
      },
      revision: {
        is_revision: true,
        revision_target: "support_need",
        replacement_value:
          "Quand je rentre stressé, j'ai besoin d'aide à ne pas partir directement dans une commande compulsive.",
        replaces_previous_value: true,
      },
      visible_task: {
        kind: "revision_done",
      },
    }),
  });
  assertEquals(
    second.local_state?.support_need_state.locked_value,
    "Quand je rentre stressé, j'ai besoin d'aide à ne pas partir directement dans une commande compulsive.",
  );
  assertEquals(
    second.local_state?.support_need_state.previous_value,
    "ancienne phrase",
  );
});

Deno.test("prepare_defense_card apply_attempt is non-mutant", () => {
  const result = reducePrepareDefenseCardLocalDispatcherOutput({
    previous: createInitialPrepareDefenseCardLocalState(),
    output: decision({
      flow_action: "apply_attempt",
      visible_task: {
        kind: "apply_attempt",
      },
    }),
  });
  assertEquals(result.status, "apply_attempt");
  assertEquals(
    result.blocked_effects[0].reason_code,
    "chat_creation_disabled_platform_handoff",
  );
});

Deno.test("prepare_defense_card destination_short does not regenerate handoff", () => {
  const previous = reducePrepareDefenseCardLocalDispatcherOutput({
    previous: createInitialPrepareDefenseCardLocalState(),
    output: lockedSupportNeed(
      "Quand je suis fatigué le soir et que je pars scroller.",
    ),
  }).local_state;
  const repeat = reducePrepareDefenseCardLocalDispatcherOutput({
    previous,
    output: decision({
      flow_action: "platform_destination_followup",
      visible_task: {
        kind: "destination_short",
      },
    }),
  });
  assertEquals(repeat.visible_task, "destination_short");
  assertEquals(
    repeat.local_state?.support_need_state.locked_value,
    "Quand je suis fatigué le soir et que je pars scroller.",
  );
});

Deno.test("prepare_defense_card safety_preempt routes to safety stage without draft", () => {
  const result = reducePrepareDefenseCardLocalDispatcherOutput({
    previous: createInitialPrepareDefenseCardLocalState(),
    output: decision({
      flow_action: "safety_preempt",
      risk_assessment: {
        risk_score: 9,
        risk_band: "high",
        safety_preempt: true,
        reason_codes: ["test_safety"],
      },
      visible_task: {
        kind: "safety",
      },
    }),
  });
  assertEquals(result.status, "blocked");
  assertEquals(result.visible_task, "safety");
  assertEquals(result.draft, null);
  assertEquals(result.safety_preempt, true);
  assertEquals(result.note_information?.target_dispatcher, "safety_crisis");
});

Deno.test("prepare_defense_card exit_to_global_dispatcher clears local state", () => {
  const result = reducePrepareDefenseCardLocalDispatcherOutput({
    previous: createInitialPrepareDefenseCardLocalState(),
    output: decision({
      flow_action: "exit_to_global_dispatcher",
      exit_memo: {
        needed: true,
        reason: "topic_change",
        flow_summary: "sortie defense",
        handoff_hint_for_global_dispatcher: "prepare_attack_card",
      },
    }),
  });
  assertEquals(result.exit_to_global_dispatcher, true);
  assertEquals(result.local_state, null);
  assertEquals(result.note_information?.target_dispatcher, "global");
});

Deno.test("prepare_defense_card stop_local_no_handoff does not call global", () => {
  const result = reducePrepareDefenseCardLocalDispatcherOutput({
    previous: createInitialPrepareDefenseCardLocalState(),
    output: decision({
      flow_action: "stop_local_no_handoff",
      visible_task: {
        kind: "stop_or_cancel",
      },
    }),
  });
  assertEquals(result.stop_local_no_handoff, true);
  assertEquals(result.exit_to_global_dispatcher, false);
  assertEquals(result.local_state, null);
});

Deno.test("prepare_defense_card attack correction exits to global with note", () => {
  const result = reducePrepareDefenseCardLocalDispatcherOutput({
    previous: createInitialPrepareDefenseCardLocalState(),
    output: decision({
      flow_action: "exit_to_global_dispatcher",
      exit_memo: {
        needed: true,
        reason: "handoff_to_attack_card",
        flow_summary: "Le besoin relève d'une carte d'attaque.",
        handoff_hint_for_global_dispatcher: "prepare_attack_card",
      },
      visible_task: {
        kind: "handoff_transition",
      },
    }),
  });
  assertEquals(result.exit_to_global_dispatcher, true);
  assertEquals(result.local_state, null);
  assertEquals(
    result.note_information?.target_dispatcher,
    "global",
  );
  assertEquals(
    result.note_information?.target_local_dispatcher_hint,
    "prepare_attack_card",
  );
});

Deno.test("prepare_defense_card forbidden local handoff output is normalized to global exit", () => {
  const result = reducePrepareDefenseCardLocalDispatcherOutput({
    previous: createInitialPrepareDefenseCardLocalState(),
    output: decision({
      flow_action: "handoff_to_local_dispatcher" as any,
      note_information: {
        target_dispatcher: "prepare_attack_card",
        recommended_next_focus: "prepare_attack_card",
      } as any,
      visible_task: {
        kind: "handoff_transition",
      },
    }),
  });
  assertEquals(result.exit_to_global_dispatcher, true);
  assertEquals(
    result.reason_code,
    "prepare_defense_card_local_exit_to_global_dispatcher",
  );
  assertEquals(result.note_information?.target_dispatcher, "global");
});

Deno.test("prepare_defense_card visible guard blocks old renderer patterns", () => {
  const context = reducePrepareDefenseCardLocalDispatcherOutput({
    previous: createInitialPrepareDefenseCardLocalState(),
    output: lockedSupportNeed(
      "Quand je rentre fatigué et que je pars scroller.",
    ),
  }).visible_task_context;
  const issues = prepareDefenseCardVisibleContractIssues(
    "C'est créé. entry_need: test",
    {
      user_id: "u1",
      stage: "handoff_ready",
      conversation_context: context,
    },
  );
  assert(issues.some((issue) => issue.startsWith("forbidden_creation_claim")));
  assert(issues.some((issue) => issue.startsWith("internal_field_exposed")));
});

Deno.test("prepare_defense_card visible guard requires exact destination and label", () => {
  const value = "Quand je rentre fatigué et que je pars scroller.";
  const result = reducePrepareDefenseCardLocalDispatcherOutput({
    previous: createInitialPrepareDefenseCardLocalState(),
    output: lockedSupportNeed(value),
  });
  const issues = prepareDefenseCardVisibleContractIssues(
    `Va dans Cartes de défense. ${DEFENSE_CARD_SUPPORT_NEED_LABEL}: ${value}. Je ne crée pas la carte depuis le chat.`,
    {
      user_id: "u1",
      stage: "handoff_ready",
      conversation_context: result.visible_task_context,
    },
  );
  assertEquals(issues, []);
});

Deno.test("prepare_defense_card visible guard blocks revision persistence claims", () => {
  const first = reducePrepareDefenseCardLocalDispatcherOutput({
    previous: createInitialPrepareDefenseCardLocalState(),
    output: lockedSupportNeed("ancienne phrase"),
  });
  const value = "Quand je rentre stressé et que je commande compulsivement.";
  const result = reducePrepareDefenseCardLocalDispatcherOutput({
    previous: first.local_state,
    output: decision({
      flow_action: "revise_support_need",
      support_need_state: {
        field_id: "support_need",
        question_label: DEFENSE_CARD_SUPPORT_NEED_LABEL,
        status: "locked",
        candidate_value: null,
        locked_value: value,
        previous_value: "ancienne phrase",
        needs_user_confirmation: false,
        why_status: "revision",
      },
      visible_task: {
        kind: "revision_done",
      },
    }),
  });
  const issues = prepareDefenseCardVisibleContractIssues(
    `C'est entendu, j'ai bien pris en compte cette nouvelle formulation. Dans Cartes de défense, ${DEFENSE_CARD_SUPPORT_NEED_LABEL}: ${value}`,
    {
      user_id: "u1",
      stage: "handoff_ready",
      conversation_context: result.visible_task_context,
    },
  );
  assert(
    issues.some((issue) =>
      issue.startsWith("forbidden_revision_persistence_claim")
    ),
  );
});

Deno.test("prepare_defense_card apply_attempt guard accepts clear no-create wording", () => {
  const value = "Quand je rentre fatigué et que je pars scroller.";
  const result = reducePrepareDefenseCardLocalDispatcherOutput({
    previous: createInitialPrepareDefenseCardLocalState(),
    output: lockedSupportNeed(value),
  });
  const issues = prepareDefenseCardVisibleContractIssues(
    `Je ne crée pas cette carte directement. Reprends-la dans Cartes de défense avec ${DEFENSE_CARD_SUPPORT_NEED_LABEL}: ${value}`,
    {
      user_id: "u1",
      stage: "apply_attempt",
      conversation_context: result.visible_task_context,
    },
  );
  assertEquals(issues, []);
});

Deno.test("prepare_defense_card local runtime uses dispatcher and visible prompt only", async () => {
  let visibleInput: Record<string, unknown> | null = null;
  let dispatcherInput: Record<string, unknown> | null = null;
  const runtime = await maybeRunPrepareDefenseCardOperation({
    supabase: {} as any,
    userId: "u1",
    userMessage:
      "Je veux préparer une carte de défense parce que je craque le soir et je finis par scroller.",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {},
    turnFrame: {
      tool_skill_intents: [{
        operation_type: "prepare_defense_card",
        confidence_band: "high",
        explicitness: "explicit",
        ambiguity: "none",
      }],
    } as any,
    routeDecision: {
      response_owner: "tool_skill",
      selected_handler: "prepare_defense_card",
    } as any,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-local",
    runLocalDispatcher: async (input) => {
      dispatcherInput = input as unknown as Record<string, unknown>;
      return lockedSupportNeed(
        "Quand je craque le soir et que je pars scroller au lieu de dormir.",
      );
    },
    runVisibleAgent: async (input) => {
      visibleInput = input as unknown as Record<string, unknown>;
      return `Reprends cette carte de défense dans Cartes de défense. ${DEFENSE_CARD_SUPPORT_NEED_LABEL}: Quand je craque le soir et que je pars scroller au lieu de dormir. Je ne crée pas la carte depuis le chat.`;
    },
  });
  assertEquals(runtime?.executedTools, []);
  assertEquals((runtime?.toolSkillRun as any)?.pending_confirmation, null);
  assertEquals((runtime?.toolSkillRun as any)?.committed_effects, []);
  assertEquals((runtime?.toolSkillRun as any)?.ai_call_count, 2);
  assertStringIncludes(
    JSON.stringify((runtime?.toolSkillRun as any)?.runtime_trace ?? []),
    "local_dispatcher called",
  );
  assertEquals(Boolean((visibleInput as any)?.conversation_context), true);
  assertEquals("user_message" in ((visibleInput as any) ?? {}), false);
  assertEquals("recent_messages" in ((visibleInput as any) ?? {}), false);
  assertEquals("local_state" in ((visibleInput as any) ?? {}), false);
  assertEquals("draft" in ((visibleInput as any) ?? {}), false);
  const legacyRequiredDataKey = ["required", "data"].join("_");
  assertEquals(legacyRequiredDataKey in ((visibleInput as any) ?? {}), false);
  assertEquals(
    legacyRequiredDataKey in
      (((visibleInput as any)?.conversation_context as any) ?? {}),
    false,
  );
  assertEquals(
    ((dispatcherInput as any)?.note_information_inbound as any)
      ?.target_dispatcher,
    "prepare_defense_card",
  );
});

Deno.test("prepare_defense_card dispatcher failure does not build visible fallback", async () => {
  const runtime = await maybeRunPrepareDefenseCardOperation({
    supabase: {} as any,
    userId: "u1",
    userMessage: "Je veux préparer une carte de défense.",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {},
    turnFrame: {
      tool_skill_intents: [{
        operation_type: "prepare_defense_card",
        confidence_band: "high",
        explicitness: "explicit",
        ambiguity: "none",
      }],
    } as any,
    routeDecision: {
      response_owner: "tool_skill",
      selected_handler: "prepare_defense_card",
    } as any,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-dispatcher-fail",
    runLocalDispatcher: async () => null,
    runVisibleAgent: async () => {
      throw new Error("visible agent must not be called");
    },
  });
  assertEquals(runtime?.content, "");
  assertEquals(runtime?.toolExecution, "blocked");
  assertEquals(
    (runtime?.toolSkillRun as any)?.reason_code,
    "prepare_defense_card_local_dispatcher_failed",
  );
  assertEquals((runtime?.toolSkillRun as any)?.ai_call_count, 1);
});

Deno.test("prepare_defense_card visible failure does not build visible fallback", async () => {
  const runtime = await maybeRunPrepareDefenseCardOperation({
    supabase: {} as any,
    userId: "u1",
    userMessage:
      "Je veux préparer une carte de défense parce que je craque le soir.",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {},
    turnFrame: {
      tool_skill_intents: [{
        operation_type: "prepare_defense_card",
        confidence_band: "high",
        explicitness: "explicit",
        ambiguity: "none",
      }],
    } as any,
    routeDecision: {
      response_owner: "tool_skill",
      selected_handler: "prepare_defense_card",
    } as any,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-visible-fail",
    runLocalDispatcher: async () =>
      lockedSupportNeed(
        "Quand je craque le soir et que je pars scroller au lieu de dormir.",
      ),
    runVisibleAgent: async () => null,
  });
  assertEquals(runtime?.content, "");
  assertEquals(runtime?.toolExecution, "blocked");
  assertEquals(
    (runtime?.toolSkillRun as any)?.reason_code,
    "prepare_defense_card_visible_agent_failed",
  );
  assertEquals((runtime?.toolSkillRun as any)?.ai_call_count, 2);
});

Deno.test("prepare_defense_card local runtime accepts explicit turn_frame intent even when route stayed normal", async () => {
  const runtime = await maybeRunPrepareDefenseCardOperation({
    supabase: {} as any,
    userId: "u1",
    userMessage: "Je veux une carte de défense, je suis en vrac.",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {},
    turnFrame: {
      tool_skill_intents: [{
        operation_type: "prepare_defense_card",
        confidence_band: "high",
        explicitness: "explicit",
        ambiguity: "target_ambiguous",
        user_intent: "create",
        operation_input: {
          target_hint: "moment de vrac",
        },
      }],
    } as any,
    routeDecision: {
      response_owner: "normal_reply",
      selected_handler: undefined,
      blocked_paths: [{ path: "tool_skills", reason_code: "target_ambiguous" }],
    } as any,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-normal-route",
    runLocalDispatcher: async () =>
      decision({
        flow_action: "answer_current_field",
        visible_task: {
          kind: "ask_support_need",
        },
      }),
    runVisibleAgent: async () =>
      "Pour la carte de défense, dans quel moment précis tu veux être protégé ?",
  });
  assertEquals(runtime?.toolExecution, "blocked");
  assertEquals(
    (runtime?.toolSkillRun as any)?.selected_handler,
    "prepare_defense_card",
  );
  assertEquals((runtime?.toolSkillRun as any)?.ai_call_count, 2);
});

Deno.test("prepare_defense_card local runtime exits to global only on explicit local exit", async () => {
  const runtime = await maybeRunPrepareDefenseCardOperation({
    supabase: {} as any,
    userId: "u1",
    userMessage: "non je veux une carte d'attaque",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __active_tool_skill_intake: {
        operation_type: "prepare_defense_card",
        skill_id: "prepare_defense_card",
        mode: "platform_handoff",
        status: "collecting",
        no_chat_mutation: true,
      },
    },
    turnFrame: {} as any,
    routeDecision: {
      response_owner: "tool_skill",
      selected_handler: "prepare_defense_card",
    } as any,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-exit",
    runLocalDispatcher: async () =>
      decision({
        flow_action: "exit_to_global_dispatcher",
        exit_memo: {
          needed: true,
          reason: "handoff_to_attack_card",
          flow_summary: "user wants attack",
          handoff_hint_for_global_dispatcher: "prepare_attack_card",
        },
      }),
    runVisibleAgent: async () => {
      throw new Error("visible agent should not run on local exit");
    },
  });
  assertEquals(runtime?.content, "");
  assertEquals(runtime?.toolExecution, "none");
  assertEquals(
    (runtime?.toolSkillRun as any)?.reason_code,
    "prepare_defense_card_local_exit_to_global_dispatcher",
  );
  assertEquals(
    (runtime?.nextTempMemory as any).__last_prepare_defense_card_exit_memo
      .handoff_hint_for_global_dispatcher,
    "prepare_attack_card",
  );
  assertEquals((runtime?.toolSkillRun as any)?.ai_call_count, 1);
});

Deno.test("prepare_defense_card explicit local route is not blocked by unrelated pending memory", async () => {
  const runtime = await maybeRunPrepareDefenseCardOperation({
    supabase: {} as any,
    userId: "u1",
    userMessage: "Finalement je veux une carte d'attaque.",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __pending_tool_skill_confirmation: {
        operation_type: "prepare_attack_card",
      },
      __active_tool_skill_intake: {
        operation_type: "prepare_defense_card",
        skill_id: "prepare_defense_card",
        mode: "platform_handoff",
        status: "collecting",
        no_chat_mutation: true,
      },
    },
    turnFrame: {} as any,
    routeDecision: {
      response_owner: "tool_skill",
      selected_handler: "prepare_defense_card",
      reason_code: "active_prepare_defense_card_local_dispatcher",
    } as any,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-pending-mismatch",
    runLocalDispatcher: async () =>
      decision({
        flow_action: "exit_to_global_dispatcher",
        exit_memo: {
          needed: true,
          reason: "handoff_to_attack_card",
          flow_summary: "user wants attack",
          handoff_hint_for_global_dispatcher: "prepare_attack_card",
        },
      }),
    runVisibleAgent: async () => {
      throw new Error("visible agent should not run on local exit");
    },
  });
  assertEquals(runtime?.toolExecution, "none");
  assertEquals(
    (runtime?.toolSkillRun as any)?.reason_code,
    "prepare_defense_card_local_exit_to_global_dispatcher",
  );
  assertEquals(
    (runtime?.nextTempMemory as any).__last_prepare_defense_card_exit_memo
      .reason,
    "handoff_to_attack_card",
  );
});

Deno.test("prepare_defense_card get_info_product preserves local flow context", () => {
  const result = reducePrepareDefenseCardLocalDispatcherOutput({
    previous: createInitialPrepareDefenseCardLocalState(),
    output: decision({
      flow_action: "get_info_product",
      visible_task: {
        kind: "none",
      },
      subskill_call: {
        needed: true,
        skill_id: "product_help",
        reason: "Le user demande comment fonctionnent les cartes de défense.",
        context_for_subskill: {
          active_flow: "prepare_defense_card",
          question_to_answer:
            "Expliquer les cartes de défense sans quitter le flow actif.",
          active_flow_context: {
            route_kind: "free_card",
            support_need_state: { status: "missing" },
          },
        },
      },
    }),
  });

  assertEquals(result.get_info_product, true);
  assertEquals(result.get_info_db, false);
  assertEquals(result.visible_task, "none");
  assertEquals(result.status, "collecting");
  assertEquals(result.local_state?.last_visible_task, "none");
  assertEquals(result.subskill_context?.active_flow, "prepare_defense_card");
  assertEquals(
    result.subskill_context?.question_to_answer,
    "Expliquer les cartes de défense sans quitter le flow actif.",
  );
});

Deno.test("prepare_defense_card get_info_db preserves local flow context", () => {
  const result = reducePrepareDefenseCardLocalDispatcherOutput({
    previous: createInitialPrepareDefenseCardLocalState(),
    output: decision({
      flow_action: "get_info_db",
      visible_task: {
        kind: "none",
      },
      subskill_call: {
        needed: true,
        skill_id: "status_recap",
        reason: "Le user demande quelles cartes de défense sont actives.",
        context_for_subskill: {
          active_flow: "prepare_defense_card",
          question_to_answer:
            "Lister les cartes de défense déjà actives pour le user.",
          active_flow_context: {
            route_kind: "free_card",
            attachment_state: { status: "missing" },
          },
        },
      },
    }),
  });

  assertEquals(result.get_info_product, false);
  assertEquals(result.get_info_db, true);
  assertEquals(result.visible_task, "none");
  assertEquals(result.status, "collecting");
  assertEquals(result.subskill_context?.active_flow, "prepare_defense_card");
  assertEquals(
    result.subskill_context?.question_to_answer,
    "Lister les cartes de défense déjà actives pour le user.",
  );
});
