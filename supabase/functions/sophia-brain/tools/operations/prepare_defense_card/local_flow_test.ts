import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  createInitialPrepareDefenseCardLocalState,
  DEFENSE_CARD_PLATFORM_DESTINATION,
  DEFENSE_CARD_SUPPORT_NEED_LABEL,
  defenseCardPlatformDestinationForRoute,
  localDispatcherSystemPrompt,
  mergePrepareDefenseCardLocalState,
  normalizePrepareDefenseCardLocalState,
  type PrepareDefenseCardLocalDispatcherOutput,
  reducePrepareDefenseCardLocalDispatcherOutput,
} from "./local_flow.ts";
import {
  type PrepareDefenseCardVisibleAgentInput,
  prepareDefenseCardVisibleContractIssues,
} from "./visible_agent.ts";
import {
  loadDefenseCardFrameFromTempMemory,
  maybeRunPrepareDefenseCardOperation,
} from "./router.ts";

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

function supportNeedStateForTest(
  patch: Partial<
    ReturnType<
      typeof createInitialPrepareDefenseCardLocalState
    >["support_need_state"]
  >,
): ReturnType<typeof createInitialPrepareDefenseCardLocalState>[
  "support_need_state"
] {
  return {
    ...createInitialPrepareDefenseCardLocalState().support_need_state,
    ...patch,
    field_id: "support_need",
    question_label: DEFENSE_CARD_SUPPORT_NEED_LABEL,
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
      "risk_assessment",
      "evidence",
    ]
  ) {
    assertStringIncludes(prompt, field);
  }

  assertStringIncludes(prompt, "exit_to_global_dispatcher");
  assertStringIncludes(prompt, "exit_to_global_dispatcher");
  assertStringIncludes(prompt, "safety_preempt");
  assertStringIncludes(prompt, "note_information.target_dispatcher=global");
  for (
    const tool of [
      "prepare_attack_card",
      "select_state_potion",
      "create_recurring_reminder",
      "adjust_plan_item",
      "update_coach_preferences",
      "create_one_shot_reminder",
    ]
  ) {
    assertStringIncludes(prompt, tool);
  }
  assertStringIncludes(prompt, "Rythme conversationnel V1");
  assertStringIncludes(prompt, "Exception compact intake");
  assertStringIncludes(prompt, "carte courte/simple/avec ce que tu sais");
  assertStringIncludes(
    prompt,
    "confirm_support_need_proposal ou handoff_ready",
  );
  assertStringIncludes(prompt, "aucune restitution plateforme");
  assertStringIncludes(prompt, "au plus tôt au tour suivant");
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
  assertEquals(result.exit_to_global_dispatcher, false);
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

Deno.test("prepare_defense_card continuation preserves server-owned proposed support_need", () => {
  const previous = {
    ...createInitialPrepareDefenseCardLocalState(),
    support_need_state: supportNeedStateForTest({
      status: "proposed" as const,
      candidate_value: "les soirs où je rentre vidé et que je commande",
      locked_value: null,
      previous_value: null,
      needs_user_confirmation: true,
      why_status: "pending offer",
    }),
  };

  const result = reducePrepareDefenseCardLocalDispatcherOutput({
    previous,
    output: decision({
      flow_action: "answer_current_field",
      support_need_state: {
        field_id: "support_need",
        question_label: DEFENSE_CARD_SUPPORT_NEED_LABEL,
        status: "missing",
        candidate_value: null,
        locked_value: null,
        previous_value: null,
        needs_user_confirmation: false,
        why_status: "dispatcher omitted pending offer",
      },
      visible_task: { kind: "ask_trigger_or_signal" },
    }),
  });

  assertEquals(result.local_state?.support_need_state.status, "proposed");
  assertEquals(
    result.local_state?.support_need_state.candidate_value,
    "les soirs où je rentre vidé et que je commande",
  );
  assertEquals(
    result.state_mutation_audit.preserved_fields.includes(
      "support_need_state",
    ),
    true,
  );
});

Deno.test("prepare_defense_card invalid confirmation preserves pending state and audits missing offer", () => {
  const previous = {
    ...createInitialPrepareDefenseCardLocalState(),
    last_visible_task: "ask_support_need" as const,
  };

  const result = reducePrepareDefenseCardLocalDispatcherOutput({
    previous,
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
        why_status: "confirmation without candidate",
      },
      visible_task: { kind: "ask_support_need" },
    }),
  });

  assertEquals(result.local_state?.support_need_state.status, "missing");
  assertEquals(result.draft, null);
  assertEquals(
    result.state_mutation_audit.rejected_changes.some((change) =>
      change.field === "support_need_state" &&
      change.reason_code === "missing_previous_offer"
    ),
    true,
  );
});

Deno.test("prepare_defense_card valid confirmation locks previous candidate even if dispatcher omits it", () => {
  const previous = {
    ...createInitialPrepareDefenseCardLocalState(),
    last_visible_task: "confirm_support_need_proposal" as const,
    support_need_state: supportNeedStateForTest({
      status: "proposed" as const,
      candidate_value:
        "quand je rentre stressé et que je commande compulsivement",
      locked_value: null,
      previous_value: null,
      needs_user_confirmation: true,
      why_status: "candidate offered",
    }),
  };

  const result = reducePrepareDefenseCardLocalDispatcherOutput({
    previous,
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
        why_status: "omitted on confirmation",
      },
      visible_task: { kind: "handoff_ready" },
    }),
  });

  assertEquals(result.local_state?.support_need_state.status, "locked");
  assertEquals(
    result.local_state?.support_need_state.locked_value,
    "quand je rentre stressé et que je commande compulsivement",
  );
  assertEquals(result.status, "handoff_delivered");
  assertEquals(
    result.state_mutation_audit.applied_fields.includes("support_need_state"),
    true,
  );
});

Deno.test("prepare_defense_card non-actionable followup cannot mutate locked support_need", () => {
  const previous = {
    ...createInitialPrepareDefenseCardLocalState(),
    last_visible_task: "handoff_ready" as const,
    last_handoff_delivered: true,
    support_need_state: supportNeedStateForTest({
      status: "locked" as const,
      candidate_value: null,
      locked_value: "les soirs où je rentre vidé et que je commande",
      previous_value: null,
      needs_user_confirmation: false,
      why_status: "locked",
    }),
  };

  const result = reducePrepareDefenseCardLocalDispatcherOutput({
    previous,
    output: decision({
      flow_action: "platform_destination_followup",
      support_need_state: {
        field_id: "support_need",
        question_label: DEFENSE_CARD_SUPPORT_NEED_LABEL,
        status: "locked",
        candidate_value: null,
        locked_value: "mutation implicite inventée",
        previous_value: null,
        needs_user_confirmation: false,
        why_status: "bad mutation",
      },
      visible_task: { kind: "destination_short" },
    }),
  });

  assertEquals(
    result.local_state?.support_need_state.locked_value,
    "les soirs où je rentre vidé et que je commande",
  );
  assertEquals(result.visible_task, "destination_short");
  assertEquals(
    result.state_mutation_audit.restored_fields.includes(
      "support_need_state",
    ),
    true,
  );
  assertEquals(
    result.state_mutation_audit.rejected_changes.some((change) =>
      change.reason_code === "blocked_by_constraint"
    ),
    true,
  );
});

Deno.test("prepare_defense_card legacy active state remains readable with missing new fields", () => {
  const fallback = createInitialPrepareDefenseCardLocalState();
  const legacyState = {
    flow_id: "prepare_defense_card",
    support_need_state: {
      field_id: "support_need",
      question_label: DEFENSE_CARD_SUPPORT_NEED_LABEL,
      status: "locked",
      locked_value: "quand je rentre tard et que je scrolle",
    },
  };

  const normalized = normalizePrepareDefenseCardLocalState(
    legacyState,
    fallback,
  );

  assertEquals(normalized.flow_id, "prepare_defense_card");
  assertEquals(normalized.route_kind, fallback.route_kind);
  assertEquals(normalized.support_need_state.status, "locked");
  assertEquals(
    normalized.support_need_state.locked_value,
    "quand je rentre tard et que je scrolle",
  );
  assertEquals(Array.isArray(normalized.subskill_history), true);
});

Deno.test("prepare_defense_card direct handoff without durable need is blocked with precise reason", () => {
  const previous = {
    ...createInitialPrepareDefenseCardLocalState(),
    last_visible_task: "ask_support_need" as const,
  };
  const result = reducePrepareDefenseCardLocalDispatcherOutput({
    previous,
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
        why_status: "missing support need",
      },
      visible_task: { kind: "handoff_ready" },
    }),
  });

  assertEquals(result.status, "collecting");
  assertEquals(result.reason_code, "durable_need_missing");
  assertEquals(result.draft, null);
});

Deno.test("prepare_defense_card apply attempt is non-mutant and preserves locked state", () => {
  const previous = {
    ...createInitialPrepareDefenseCardLocalState(),
    last_visible_task: "handoff_ready" as const,
    last_handoff_delivered: true,
    support_need_state: supportNeedStateForTest({
      status: "locked" as const,
      candidate_value: null,
      locked_value: "quand je rentre rincé et que je commande",
      previous_value: null,
      needs_user_confirmation: false,
      why_status: "locked",
    }),
  };
  const result = reducePrepareDefenseCardLocalDispatcherOutput({
    previous,
    output: decision({
      flow_action: "apply_attempt",
      support_need_state: {
        field_id: "support_need",
        question_label: DEFENSE_CARD_SUPPORT_NEED_LABEL,
        status: "missing",
        candidate_value: null,
        locked_value: null,
        previous_value: null,
        needs_user_confirmation: false,
        why_status: "dispatcher omitted locked value",
      },
      visible_task: { kind: "apply_attempt" },
    }),
  });

  assertEquals(result.status, "apply_attempt");
  assertEquals(
    result.local_state?.support_need_state.locked_value,
    "quand je rentre rincé et que je commande",
  );
  assertEquals(
    result.blocked_effects[0]?.reason_code,
    "chat_creation_disabled_platform_handoff",
  );
  assertEquals(
    result.state_mutation_audit.preserved_fields.includes(
      "support_need_state",
    ),
    true,
  );
});

Deno.test("prepare_defense_card explicit cancel clears active local flow without draft", () => {
  const previous = {
    ...createInitialPrepareDefenseCardLocalState(),
    last_visible_task: "confirm_support_need_proposal" as const,
    support_need_state: supportNeedStateForTest({
      status: "proposed",
      candidate_value: "quand je rentre vidé et que je commande",
      locked_value: null,
      previous_value: null,
      needs_user_confirmation: true,
      why_status: "candidate pending",
    }),
  };

  const result = reducePrepareDefenseCardLocalDispatcherOutput({
    previous,
    output: decision({
      flow_action: "cancel_flow",
      support_need_state: {
        field_id: "support_need",
        question_label: DEFENSE_CARD_SUPPORT_NEED_LABEL,
        status: "missing",
        candidate_value: null,
        locked_value: null,
        previous_value: null,
        needs_user_confirmation: false,
        why_status: "user cancelled flow",
      },
      visible_task: { kind: "exit_or_cancel" },
    }),
  });

  assertEquals(result.status, "cancelled");
  assertEquals(result.local_state, null);
  assertEquals(result.draft, null);
  assertEquals(result.exit_to_global_dispatcher, false);
  assertEquals(
    result.state_mutation_audit.server_owned_fields.includes(
      "support_need_state",
    ),
    true,
  );
});

Deno.test("prepare_defense_card merge exposes audit for declared modifications", () => {
  const previous = createInitialPrepareDefenseCardLocalState();
  const merged = mergePrepareDefenseCardLocalState({
    previous,
    output: decision({
      slot_updates: {
        attachment: {
          status: "proposed",
          candidate_value: "retour maison",
        },
      },
      attachment_state: {
        ...previous.attachment_state,
        status: "proposed",
        kind: "free_risk_context",
        candidate_value: "retour maison",
        needs_user_confirmation: true,
      },
    }),
  });

  assertEquals(
    merged.audit.modified_fields_declared.includes("attachment"),
    true,
  );
  assertEquals(merged.audit.applied_fields.includes("attachment_state"), true);
});

Deno.test("prepare_defense_card clear answer locks support_need and prepares handoff", () => {
  const value =
    "Quand je rentre fatigué et que j'ai l'impulsion de commander n'importe quoi.";
  const previous = {
    ...createInitialPrepareDefenseCardLocalState(),
    last_visible_task: "ask_trigger_or_signal" as const,
  };
  const result = reducePrepareDefenseCardLocalDispatcherOutput({
    previous,
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

Deno.test("prepare_defense_card handoff preserves concrete defense response", () => {
  const supportNeed =
    "Le moment où je passe la porte après le boulot, vidée, avec l'envie de partir vers le joint réflexe.";
  const defenseAction =
    "Poser les clés dans la salle de bain, lancer une douche de cinq minutes, et me dire: je passe d'abord par l'eau, après je déciderai.";
  const previous = {
    ...createInitialPrepareDefenseCardLocalState(),
    last_visible_task: "ask_defense_goal_or_response" as const,
  };
  const result = reducePrepareDefenseCardLocalDispatcherOutput({
    previous,
    output: decision({
      flow_action: "handoff_ready",
      route_kind: "plan_item_card",
      attachment_state: {
        ...previous.attachment_state,
        status: "locked",
        kind: "plan_item",
        plan_item_id: "item-joint-reflexe",
        locked_value: "Cibler le joint réflexe",
        needs_user_confirmation: false,
      },
      risk_state: {
        ...previous.risk_state,
        status: "locked",
        label: "Retour du travail / passage de la porte",
        description: supportNeed,
        timing_hint: "retour du travail",
        context_hint: "passage de la porte",
        needs_user_confirmation: false,
      },
      defense_response_hint_state: {
        status: "locked",
        strategy_hint: "replace_action",
        candidate_value: null,
        locked_value: defenseAction,
        needs_user_confirmation: false,
        why_status: "Parade concrete fournie par le user.",
      },
      support_need_state: {
        field_id: "support_need",
        question_label: DEFENSE_CARD_SUPPORT_NEED_LABEL,
        status: "locked",
        candidate_value: null,
        locked_value: supportNeed,
        previous_value: null,
        needs_user_confirmation: false,
        why_status: "Situation claire.",
      },
      visible_task: {
        kind: "handoff_ready",
      },
    }),
  });

  assertEquals(result.status, "handoff_delivered");
  assertEquals(result.draft?.prepared_fields?.risk_context, supportNeed);
  assertEquals(result.draft?.prepared_fields?.defense_action, defenseAction);
  assertEquals(
    result.visible_task_context.handoff_data.defense_action,
    defenseAction,
  );
  assertStringIncludes(
    result.draft?.recommendation.card_draft_summary ?? "",
    defenseAction,
  );
});

Deno.test("prepare_defense_card confirmation can preserve newly provided defense response hint", () => {
  const supportNeed =
    "les soirs ou je rentre vide et que j'ouvre Deliveroo sans reflechir";
  const defenseAction =
    "poser mon sac, boire un verre d'eau, puis sortir un truc simple du frigo avant de regarder mon telephone";
  const previous = {
    ...createInitialPrepareDefenseCardLocalState(),
    support_need_state: {
      field_id: "support_need" as const,
      question_label:
        DEFENSE_CARD_SUPPORT_NEED_LABEL as typeof DEFENSE_CARD_SUPPORT_NEED_LABEL,
      status: "proposed" as const,
      candidate_value: supportNeed,
      locked_value: null,
      previous_value: null,
      needs_user_confirmation: true,
      why_status: "proposition initiale",
    },
    last_visible_task: "ask_defense_goal_or_response" as const,
  };

  const result = reducePrepareDefenseCardLocalDispatcherOutput({
    previous,
    output: decision({
      flow_action: "confirm_proposed_field",
      defense_response_hint_state: {
        status: "locked",
        strategy_hint: "replace_action",
        candidate_value: null,
        locked_value: defenseAction,
        needs_user_confirmation: false,
        why_status: "parade concrete fournie par le user",
      },
      support_need_state: {
        field_id: "support_need",
        question_label: DEFENSE_CARD_SUPPORT_NEED_LABEL,
        status: "locked",
        candidate_value: null,
        locked_value: supportNeed,
        previous_value: null,
        needs_user_confirmation: false,
        why_status: "confirmed",
      },
      visible_task: {
        kind: "handoff_ready",
      },
    }),
  });

  assertEquals(result.status, "handoff_delivered");
  assertEquals(
    result.local_state?.defense_response_hint_state.locked_value,
    defenseAction,
  );
  assertEquals(result.draft?.prepared_fields?.defense_action, defenseAction);
  assertEquals(
    result.state_mutation_audit.restored_fields.includes(
      "defense_response_hint_state",
    ),
    false,
  );
});

Deno.test("prepare_defense_card plan item route uses plan item destination", () => {
  const previous = {
    ...createInitialPrepareDefenseCardLocalState({
      operationInput: {
        target: {
          kind: "plan_item",
          plan_item_id: "item-defense",
          title: "Rangement du soir",
        },
        risk_behavior: "relacher le soir",
      },
    }),
    last_visible_task: "ask_support_need" as const,
  };
  const result = reducePrepareDefenseCardLocalDispatcherOutput({
    previous,
    output: decision({
      flow_action: "handoff_ready",
      route_kind: "plan_item_card",
      tool_fit_state: {
        status: "defense",
        reason: "moment critique sur une action du plan",
        needs_user_confirmation: false,
        why_status: "defense clear",
      },
      attachment_state: {
        ...previous.attachment_state,
        status: "locked",
        locked_value: "Rangement du soir",
        needs_user_confirmation: false,
      },
      risk_state: {
        ...previous.risk_state,
        status: "locked",
        label: "relacher le soir",
        description: "relacher le soir",
        needs_user_confirmation: false,
      },
      support_need_state: {
        field_id: "support_need",
        question_label: DEFENSE_CARD_SUPPORT_NEED_LABEL,
        status: "locked",
        candidate_value: null,
        locked_value:
          "m'aider à protéger le rangement quand je fatigue le soir",
        previous_value: null,
        needs_user_confirmation: false,
        why_status: "confirmed",
      },
      visible_task: { kind: "handoff_ready" },
    }),
  });

  assertEquals(result.status, "handoff_delivered");
  assertEquals(
    result.draft?.recommendation.platform_destination,
    defenseCardPlatformDestinationForRoute("plan_item_card"),
  );
  assert(
    !String(result.draft?.recommendation.platform_destination).includes(
      "libres",
    ),
  );
  assertEquals(
    result.visible_task_context.handoff_data.platform_destination,
    defenseCardPlatformDestinationForRoute("plan_item_card"),
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

Deno.test("prepare_defense_card first-turn proposed value asks enrichment before platform confirmation", () => {
  const value =
    "Les soirs où je rentre tard et vidé, pour ne pas commander par automatisme.";
  const result = reducePrepareDefenseCardLocalDispatcherOutput({
    previous: createInitialPrepareDefenseCardLocalState(),
    output: decision({
      flow_action: "confirm_proposed_field",
      support_need_state: {
        field_id: "support_need",
        question_label: DEFENSE_CARD_SUPPORT_NEED_LABEL,
        status: "proposed",
        candidate_value: value,
        locked_value: null,
        previous_value: null,
        needs_user_confirmation: true,
        why_status: "proposal needs user confirmation",
      },
      visible_task: {
        kind: "confirm_support_need_proposal",
      },
    }),
  });
  assertEquals(result.status, "collecting");
  assertEquals(result.visible_task, "ask_trigger_or_signal");
  assertEquals(result.local_state?.support_need_state.status, "proposed");
  assertEquals(
    result.visible_task_context.handoff_data.support_need_value,
    null,
  );
  assertEquals(
    result.visible_task_context.handoff_data.platform_destination,
    "",
  );
  assertEquals(result.visible_task_context.handoff_data.platform_steps, []);
  assertEquals(
    result.visible_task_context.known_values.support_need.candidate_value,
    null,
  );
  assertEquals(
    result.visible_task_context.do_not_say.includes(
      DEFENSE_CARD_SUPPORT_NEED_LABEL,
    ),
    true,
  );
  assertEquals(result.visible_task_context.do_not_say.includes(value), false);
  assertEquals(result.draft, null);
});

Deno.test("prepare_defense_card first-turn locked value is downgraded until enrichment", () => {
  const result = reducePrepareDefenseCardLocalDispatcherOutput({
    previous: createInitialPrepareDefenseCardLocalState(),
    output: decision({
      flow_action: "handoff_ready",
      support_need_state: {
        field_id: "support_need",
        question_label: DEFENSE_CARD_SUPPORT_NEED_LABEL,
        status: "locked",
        candidate_value: null,
        locked_value:
          "Les soirs où je rentre tard et vidé, pour ne pas commander par automatisme.",
        previous_value: null,
        needs_user_confirmation: false,
        why_status: "clear from user",
      },
      visible_task: {
        kind: "handoff_ready",
      },
    }),
  });
  assertEquals(result.status, "collecting");
  assertEquals(result.visible_task, "ask_trigger_or_signal");
  assertEquals(result.local_state?.support_need_state.status, "proposed");
  assertEquals(
    result.visible_task_context.handoff_data.support_need_value,
    null,
  );
  assertEquals(
    result.visible_task_context.handoff_data.platform_destination,
    "",
  );
  assertEquals(
    result.local_state?.support_need_state.candidate_value,
    "Les soirs où je rentre tard et vidé, pour ne pas commander par automatisme.",
  );
  assertEquals(result.draft, null);
});

Deno.test("prepare_defense_card visible guard forbids first-turn restitution", () => {
  const result = reducePrepareDefenseCardLocalDispatcherOutput({
    previous: createInitialPrepareDefenseCardLocalState(),
    output: decision({
      flow_action: "confirm_proposed_field",
      support_need_state: {
        field_id: "support_need",
        question_label: DEFENSE_CARD_SUPPORT_NEED_LABEL,
        status: "proposed",
        candidate_value:
          "Les soirs où je rentre vidé, pour éviter de commander n'importe quoi.",
        locked_value: null,
        previous_value: null,
        needs_user_confirmation: true,
        why_status: "proposal needs user confirmation",
      },
      visible_task: {
        kind: "confirm_support_need_proposal",
      },
    }),
  });
  const issues = prepareDefenseCardVisibleContractIssues(
    `Pour ton champ ${DEFENSE_CARD_SUPPORT_NEED_LABEL}, tu peux recopier cette formulation dans ${DEFENSE_CARD_PLATFORM_DESTINATION}.`,
    {
      user_id: "u1",
      stage: result.visible_task,
      conversation_context: result.visible_task_context,
    },
  );
  assertEquals(
    issues.some((issue) => issue.startsWith("forbidden_early_restitution:")),
    true,
  );
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
  const enriched = {
    ...createInitialPrepareDefenseCardLocalState(),
    last_visible_task: "ask_trigger_or_signal" as const,
  };
  const previous = reducePrepareDefenseCardLocalDispatcherOutput({
    previous: enriched,
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

Deno.test("prepare_defense_card exit_to_global_dispatcher emits global note", () => {
  const result = reducePrepareDefenseCardLocalDispatcherOutput({
    previous: createInitialPrepareDefenseCardLocalState(),
    output: decision({
      flow_action: "exit_to_global_dispatcher",
      visible_task: {
        kind: "stop_or_cancel",
      },
      exit_memo: {
        needed: true,
        reason: "topic_change",
        flow_summary: "prepare_defense_card stopped before handoff.",
        handoff_hint_for_global_dispatcher: "resume global routing",
      },
    }),
  });
  assertEquals(result.exit_to_global_dispatcher, true);
  assertEquals(result.local_state, null);
  assertEquals(result.note_information?.target_dispatcher, "global");
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
    (result.note_information as any)?.structured_context
      ?.recommended_next_focus,
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
    safetyContextOutput: { risk_band: "none" } as any,
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
    safetyContextOutput: { risk_band: "none" } as any,
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
    safetyContextOutput: { risk_band: "none" } as any,
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
    safetyContextOutput: { risk_band: "none" } as any,
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
      __active_defense_card_handoff: {
        operation_type: "prepare_defense_card",
        skill_id: "prepare_defense_card",
        mode: "platform_handoff",
        status: "collecting",
        local_state: {
          ...createInitialPrepareDefenseCardLocalState(),
          last_visible_task: "ask_trigger_or_signal",
        },
        executable_from_chat: false,
      },
    },
    turnFrame: {} as any,
    routeDecision: {
      response_owner: "tool_skill",
      selected_handler: "prepare_defense_card",
    } as any,
    safetyContextOutput: { risk_band: "none" } as any,
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

Deno.test("prepare_defense_card writes a dedicated post-handoff state", async () => {
  const runtime = await maybeRunPrepareDefenseCardOperation({
    supabase: {} as any,
    userId: "u1",
    userMessage: "Oui, ça me va.",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __active_defense_card_handoff: {
        operation_type: "prepare_defense_card",
        skill_id: "prepare_defense_card",
        mode: "platform_handoff",
        status: "collecting",
        local_state: {
          ...createInitialPrepareDefenseCardLocalState(),
          last_visible_task: "ask_trigger_or_signal",
        },
        executable_from_chat: false,
      },
    },
    turnFrame: {} as any,
    routeDecision: {
      response_owner: "tool_skill",
      selected_handler: "prepare_defense_card",
      reason_code: "active_prepare_defense_card_local_dispatcher",
    } as any,
    safetyContextOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-dedicated-handoff",
    runLocalDispatcher: async () =>
      lockedSupportNeed(
        "Quand je rentre lessivé et que je veux commander par réflexe.",
      ),
    runVisibleAgent: async () => "Voici la formulation à reprendre.",
  });

  assertEquals(runtime?.toolExecution, "platform_handoff");
  assertEquals(
    (runtime?.nextTempMemory as any).__active_defense_card_handoff
      ?.skill_id,
    "prepare_defense_card",
  );
  assertEquals(
    (runtime?.nextTempMemory as any).__active_tool_skill_intake?.skill_id,
    "prepare_defense_card",
  );
});

Deno.test("prepare_defense_card resumes from dedicated handoff when generic intake was cleared", async () => {
  const previousState = createInitialPrepareDefenseCardLocalState();
  const runtime = await maybeRunPrepareDefenseCardOperation({
    supabase: {} as any,
    userId: "u1",
    userMessage: "Finalement je veux une carte d'attaque.",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {
      __active_defense_card_handoff: {
        operation_type: "prepare_defense_card",
        skill_id: "prepare_defense_card",
        mode: "platform_handoff",
        status: "handoff_delivered",
        local_state: previousState,
        turn_count: 3,
        max_turns: 8,
        created_at: "2026-06-12T10:00:00.000Z",
        updated_at: "2026-06-12T10:05:00.000Z",
        executable_from_chat: false,
      },
    },
    turnFrame: {
      tool_skill_intents: [{
        operation_type: "prepare_attack_card",
        confidence_band: "high",
        explicitness: "explicit",
        ambiguity: "none",
        user_intent: "create",
      }],
    } as any,
    routeDecision: {
      response_owner: "tool_skill",
      selected_handler: "prepare_defense_card",
      reason_code: "active_prepare_defense_card_local_dispatcher",
    } as any,
    safetyContextOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-dedicated-exit",
    runLocalDispatcher: async () =>
      decision({
        flow_action: "exit_to_global_dispatcher",
        tool_fit: "attack_better",
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
    (runtime?.nextTempMemory as any).__active_defense_card_handoff,
    undefined,
  );
});

Deno.test("prepare_defense_card frame loader prefers dedicated handoff state", () => {
  const handoff = {
    operation_type: "prepare_defense_card",
    skill_id: "prepare_defense_card",
    mode: "platform_handoff",
    status: "handoff_delivered",
    turn_count: 2,
    max_turns: 8,
    created_at: "2026-06-12T10:00:00.000Z",
    updated_at: "2026-06-12T10:01:00.000Z",
    executable_from_chat: false,
  };
  const frame = loadDefenseCardFrameFromTempMemory({
    __active_defense_card_handoff: handoff,
    __active_tool_skill_intake: null,
  });

  assertEquals((frame.active as any)?.skill_id, "prepare_defense_card");
  assertEquals((frame.active as any)?.turn_count, 2);
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
        executable_from_chat: false,
      },
    },
    turnFrame: {} as any,
    routeDecision: {
      response_owner: "tool_skill",
      selected_handler: "prepare_defense_card",
      reason_code: "active_prepare_defense_card_local_dispatcher",
    } as any,
    safetyContextOutput: { risk_band: "none" } as any,
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
