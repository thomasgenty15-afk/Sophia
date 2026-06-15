import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { persistConversationSkillRoute } from "../../router/conversation_route_runtime_support.ts";
import { loadStatePotionHandoffStateFromTempMemory } from "../../tools/operations/select_state_potion/state.ts";
import { createInitialClarteState } from "../../tools/operations/select_state_potion/subskills/clarte_flow.ts";
import type {
  DemotivationRepairBridgePotion,
  DemotivationRepairConversationContext,
  DemotivationRepairLocalDispatcherOutput,
  DemotivationRepairLocalState,
  DemotivationRepairVisibleTask,
} from "./contract.ts";
import {
  demotivationRepairDispatcherOutputExamples,
  localDispatcherSystemPrompt,
  readDemotivationRepairLocalState,
  reduceDemotivationRepairLocalDispatcherOutput,
} from "./local_flow.ts";
import { stagePrompt } from "./visible_agent.ts";

type AssertNever<T extends never> = T;
type _NoDemotivationVisibleRequiredData = AssertNever<
  Extract<keyof DemotivationRepairVisibleTask, "required_data">
>;

Deno.test("demotivation_repair dispatcher prompt documents local field completion rules", () => {
  const prompt = localDispatcherSystemPrompt();
  assert(prompt.includes("Field Completion Rules pour demotivation_repair"));
  assert(prompt.includes("- repair_state.intent:"));
  assert(prompt.includes("- response_contract.max_questions:"));
  assert(prompt.includes("question de clarification ou de reconnexion"));
  assert(prompt.includes("N'utilise action_card_candidate que si"));
  assert(prompt.includes("- potion_bridge.status:"));
  assert(prompt.includes("- exit_memo.needed:"));
  assert(prompt.includes("Aucune session potion"));
  assert(prompt.includes("Transition Rules:"));
  assert(prompt.includes("Cas de sortie observes en QA et obligatoires"));
  assert(prompt.includes("question produit/statut autonome"));
  assert(prompt.includes("demande explicitement de lancer un tool/flow"));

  const examples = demotivationRepairDispatcherOutputExamples();
  assertEquals(examples.length, 2);
  assertEquals(examples[0].case, "continuation_normale");
  assertEquals(examples[1].case, "transition_safety");
  assertEquals(
    (examples[0].output as Record<string, unknown>).reply,
    undefined,
  );
  assertEquals(
    (examples[1].output as Record<string, unknown>).reply,
    undefined,
  );
});

Deno.test("demotivation_repair visible prompt strictly obeys max_questions", () => {
  const prompt = stagePrompt("restore_meaning");
  assert(
    prompt.includes("Respecte strictement conversation_context.max_questions"),
  );
  assert(prompt.includes("si max_questions=0, ne pose aucune question"));
  assert(
    prompt.includes("Si max_questions=1, pose au maximum une seule question"),
  );
});

function potionLabel(potion: DemotivationRepairBridgePotion) {
  if (potion === "clarte") return "Potion de clarté" as const;
  if (potion === "courage") return "Potion de courage" as const;
  return "Potion anti-décrochage" as const;
}

function durableNeed(potion: DemotivationRepairBridgePotion) {
  if (potion === "clarte") return "meaning_reconnection" as const;
  if (potion === "courage") return "courage_through_avoidance" as const;
  return "anti_dropout_anchor" as const;
}

function conversationContext(
  overrides: Partial<DemotivationRepairConversationContext> = {},
): DemotivationRepairConversationContext {
  const base: DemotivationRepairConversationContext = {
    state_summary: "Le décrochage a été clarifié.",
    user_words: ["je décroche"],
    field_or_stage: "restore_meaning",
    known_values: {
      intent: "loss_of_meaning",
      phase: "restore_meaning",
      motivation_state: "loss_of_meaning",
      action_readiness: "none",
      identity_freeze_risk: false,
      motivation_source_diagnosed: true,
    },
    missing_or_weak_values: [],
    selected_candidate: {
      potion: null,
      potion_label: null,
      durable_need_kind: null,
      durable_need_summary: null,
    },
    handoff_data: {
      bridge_context_summary: null,
      target_dispatcher: null,
    },
    tone_constraints: ["energy_preserving"],
    do_not_say: ["ne moralise pas"],
    context_summary: "Le décrochage a été clarifié.",
    evidence_used: ["test"],
    db_context_summary: null,
    memory_context_summary: null,
    max_questions: 1,
  };
  return {
    ...base,
    ...overrides,
    known_values: {
      ...base.known_values,
      ...(overrides.known_values ?? {}),
    },
    selected_candidate: {
      ...base.selected_candidate,
      ...(overrides.selected_candidate ?? {}),
    },
    handoff_data: {
      ...base.handoff_data,
      ...(overrides.handoff_data ?? {}),
    },
  };
}

function prefill(potion: DemotivationRepairBridgePotion) {
  if (potion === "clarte") {
    return {
      plan_meaning_loss_reason:
        "Je fais les actions, mais je ne sens plus pourquoi elles comptent.",
    };
  }
  if (potion === "courage") {
    return {
      avoidance_target: "envoyer le mail de retour",
      blocker_kind: "regard" as const,
    };
  }
  return {
    drift_target: "la marche du soir",
    drift_style: "laisse_filer" as const,
  };
}

function dispatcherOutput(
  overrides: Partial<DemotivationRepairLocalDispatcherOutput> = {},
): DemotivationRepairLocalDispatcherOutput {
  const selected = overrides.potion_bridge?.selected_potion ?? "clarte";
  return {
    flow_action: overrides.flow_action ?? "restore_meaning",
    confidence: overrides.confidence ?? "high",
    risk_score: overrides.risk_score ?? 0,
    repair_state: overrides.repair_state ?? {
      intent: selected === "clarte"
        ? "loss_of_meaning"
        : selected === "courage"
        ? "avoidance_loop"
        : "failure_accumulation",
      phase: selected === "clarte" ? "restore_meaning" : "reduce_friction",
      motivation_state: selected === "clarte"
        ? "loss_of_meaning"
        : selected === "courage"
        ? "avoidance"
        : "failure_accumulation",
      action_readiness: selected === "rappel" ? "already_chosen" : "none",
      summary: "Le décrochage a été clarifié.",
      user_words: ["je décroche"],
      identity_freeze_risk: false,
      motivation_source_diagnosed: true,
    },
    constraints: overrides.constraints ?? ["do_not_moralize"],
    response_contract: overrides.response_contract ?? {
      max_questions: 1,
      allow_plan_edit: false,
      allow_tool_suggestion: true,
      allow_potion_suggestion: true,
      allow_attack_card_suggestion: false,
      allow_concrete_action: true,
      tone: "energy_preserving",
    },
    potion_bridge: {
      status: "not_applicable",
      selected_potion: null,
      visible_potion_label: null,
      candidate_potions: [],
      durable_need: { kind: null, summary: null },
      prefill_candidates: {},
      missing_before_handoff: [],
      why_ready_or_blocked: "Non applicable.",
      note_information: null,
      ...overrides.potion_bridge,
    },
    visible_task: overrides.visible_task ?? {
      kind: "restore_meaning",
      conversation_context: conversationContext(),
    },
    state_change_intent: overrides.state_change_intent ?? {
      modified_fields: [],
      clear_fields: [],
      reason: null,
    },
    exit_memo: overrides.exit_memo ?? {
      needed: false,
      reason: "none",
      flow_summary: null,
      handoff_hint_for_global_dispatcher: null,
      potion_bridge_context: null,
      note_information: null,
    },
    evidence: overrides.evidence ?? ["test"],
  };
}

function bridgeOfferOutput(
  potion: DemotivationRepairBridgePotion,
): DemotivationRepairLocalDispatcherOutput {
  return dispatcherOutput({
    flow_action: "potion_bridge_offer",
    potion_bridge: {
      status: "offered_waiting_consent",
      selected_potion: potion,
      visible_potion_label: potionLabel(potion),
      candidate_potions: [{
        potion_type: potion,
        visible_label: potionLabel(potion),
        confidence: "high",
        reason: "Le besoin durable correspond.",
      }],
      durable_need: {
        kind: durableNeed(potion),
        summary: "Besoin durable diagnostiqué.",
      },
      prefill_candidates: prefill(potion),
      missing_before_handoff: [],
      why_ready_or_blocked: "Le diagnostic est assez clair.",
      note_information: {
        source_flow_id: "demotivation_repair",
        handoff_reason: "bridge",
        target_dispatcher: "select_state_potion",
        handoff_context_for_next_dispatcher:
          "Utiliser les candidats fournis sans refaire diagnostiquer l'épisode.",
        target_flow: "select_state_potion",
        user_words: ["je décroche"],
        structured_context: {
          active_flow_summary: "Le décrochage a été clarifié.",
          recommended_next_focus:
            "Entrer directement dans la potion sélectionnée.",
        },
      },
    },
    visible_task: {
      kind: "potion_bridge_offer",
      conversation_context: conversationContext({
        field_or_stage: "potion_bridge_offer",
        selected_candidate: {
          potion,
          potion_label: potionLabel(potion),
          durable_need_kind: durableNeed(potion),
          durable_need_summary: "Besoin durable diagnostiqué.",
        },
        handoff_data: {
          bridge_context_summary: "Le diagnostic est assez clair.",
          target_dispatcher: "select_state_potion",
        },
        context_summary: "Le diagnostic est assez clair.",
      }),
    },
  });
}

function confirmedContext(potion: DemotivationRepairBridgePotion) {
  const offer = reduceDemotivationRepairLocalDispatcherOutput({
    previous: null,
    output: bridgeOfferOutput(potion),
  });
  assert(offer.local_state?.last_potion_bridge_offer);
  const confirmed = reduceDemotivationRepairLocalDispatcherOutput({
    previous: offer.local_state,
    output: dispatcherOutput({
      flow_action: "confirm_potion_bridge",
      potion_bridge: {
        ...bridgeOfferOutput(potion).potion_bridge,
        status: "confirmed_handoff",
      },
      visible_task: {
        kind: "potion_bridge_handoff",
        conversation_context: conversationContext({
          field_or_stage: "potion_bridge_handoff",
          selected_candidate: {
            potion,
            potion_label: potionLabel(potion),
            durable_need_kind: durableNeed(potion),
            durable_need_summary: "Besoin durable diagnostiqué.",
          },
          handoff_data: {
            bridge_context_summary: "Bridge confirmé.",
            target_dispatcher: "select_state_potion",
          },
          context_summary: "Bridge confirmé.",
          max_questions: 0,
        }),
      },
    }),
  });
  assertEquals(confirmed.status, "handoff");
  assert(confirmed.potion_bridge_context);
  return confirmed.potion_bridge_context;
}

Deno.test("demotivation_repair no_potion blocks potion bridge offer", () => {
  const result = reduceDemotivationRepairLocalDispatcherOutput({
    previous: null,
    output: bridgeOfferOutput("clarte"),
    explicit_constraints: ["no_potion"],
  });
  assertEquals(result.status, "continue");
  assertEquals(result.reason_code, "blocked_by_constraint");
  assertEquals(result.local_state?.last_potion_bridge_offer, null);
  assertEquals(
    result.visible_task.conversation_context.selected_candidate.potion,
    null,
  );
  assertEquals((result.visible_task as any).required_data, undefined);
  assertEquals(result.blocked_effects[0]?.type, "select_state_potion");
  assertEquals(result.blocked_effects[0]?.reason_code, "blocked_by_constraint");
  assert(result.state_mutation_audit);
});

Deno.test("demotivation_repair normal continuation keeps local ownership", () => {
  const result = reduceDemotivationRepairLocalDispatcherOutput({
    previous: null,
    output: dispatcherOutput({
      flow_action: "restore_meaning",
      confidence: "medium",
      response_contract: {
        max_questions: 1,
        allow_plan_edit: false,
        allow_tool_suggestion: false,
        allow_potion_suggestion: false,
        allow_attack_card_suggestion: false,
        allow_concrete_action: false,
        tone: "energy_preserving",
      },
    }),
  });

  assertEquals(result.status, "continue");
  assertEquals(result.exit_to_global_dispatcher, false);
  assertEquals(result.note_information, null);
  assertEquals(result.visible_task.kind, "restore_meaning");
  assertEquals(result.local_state?.status, "active");
});

Deno.test("demotivation_repair user constraints are preserved in visible context", () => {
  const result = reduceDemotivationRepairLocalDispatcherOutput({
    previous: null,
    output: dispatcherOutput({
      flow_action: "reduce_friction",
      constraints: ["do_not_moralize"],
    }),
    explicit_constraints: ["short_reply", "no_plan_edit"],
  });

  assert(result.constraints.includes("short_reply"));
  assert(result.constraints.includes("no_plan_edit"));
  assert(
    result.visible_task.conversation_context.tone_constraints.includes(
      "short_reply",
    ),
  );
  assert(
    result.visible_task.conversation_context.do_not_say.includes(
      "Ne propose pas de modification du plan.",
    ),
  );
});

Deno.test("demotivation_repair restore meaning clarification allows one question", () => {
  const result = reduceDemotivationRepairLocalDispatcherOutput({
    previous: null,
    output: dispatcherOutput({
      flow_action: "restore_meaning",
      response_contract: {
        max_questions: 0,
        allow_plan_edit: false,
        allow_tool_suggestion: false,
        allow_potion_suggestion: false,
        allow_attack_card_suggestion: false,
        allow_concrete_action: false,
        tone: "energy_preserving",
      },
      potion_bridge: {
        ...dispatcherOutput().potion_bridge,
        missing_before_handoff: ["meaning_anchor"],
      },
    }),
  });

  assertEquals(result.visible_task.kind, "restore_meaning");
  assertEquals(result.visible_task.conversation_context.max_questions, 1);
});

Deno.test("demotivation_repair no_questions remains zero questions", () => {
  const result = reduceDemotivationRepairLocalDispatcherOutput({
    previous: null,
    output: dispatcherOutput({
      flow_action: "restore_meaning",
      constraints: ["no_questions"],
      response_contract: {
        max_questions: 1,
        allow_plan_edit: false,
        allow_tool_suggestion: false,
        allow_potion_suggestion: false,
        allow_attack_card_suggestion: false,
        allow_concrete_action: false,
        tone: "energy_preserving",
      },
      potion_bridge: {
        ...dispatcherOutput().potion_bridge,
        missing_before_handoff: ["meaning_anchor"],
      },
    }),
  });

  assertEquals(result.visible_task.kind, "restore_meaning");
  assertEquals(result.visible_task.conversation_context.max_questions, 0);
  assert(
    result.visible_task.conversation_context.do_not_say.includes(
      "Ne pose pas de question.",
    ),
  );
});

Deno.test("demotivation_repair blocks unsupported action card candidate", () => {
  const result = reduceDemotivationRepairLocalDispatcherOutput({
    previous: null,
    output: dispatcherOutput({
      flow_action: "action_card_candidate",
      repair_state: {
        intent: "loss_of_meaning",
        phase: "action_card_ready",
        motivation_state: "loss_of_meaning",
        action_readiness: "ready",
        summary:
          "Le user a retrouve un sens local mais n'a pas demande de support.",
        user_words: [
          "ce tri sert a poser la journee et recuperer du calme",
        ],
        identity_freeze_risk: false,
        motivation_source_diagnosed: true,
      },
      response_contract: {
        max_questions: 0,
        allow_plan_edit: false,
        allow_tool_suggestion: true,
        allow_potion_suggestion: false,
        allow_attack_card_suggestion: true,
        allow_concrete_action: true,
        tone: "energy_preserving",
      },
    }),
  });

  assertEquals(result.status, "continue");
  assertEquals(
    result.reason_code,
    "demotivation_repair_action_card_candidate_blocked",
  );
  assertEquals(result.visible_task.kind, "restore_meaning");
  assertEquals(result.local_state?.last_visible_task, "restore_meaning");
  assertEquals(result.blocked_effects[0]?.type, "action_card");
  assertEquals(result.blocked_effects[0]?.reason_code, "stage_not_mature");
  assert(
    result.visible_task.conversation_context.do_not_say.includes(
      "Ne propose pas de carte ou de support produit dans ce message.",
    ),
  );
});

Deno.test("demotivation_repair allows explicit action card request", () => {
  const result = reduceDemotivationRepairLocalDispatcherOutput({
    previous: null,
    output: dispatcherOutput({
      flow_action: "action_card_candidate",
      repair_state: {
        intent: "concrete_action_emerged",
        phase: "action_card_ready",
        motivation_state: "avoidance",
        action_readiness: "ready",
        summary: "Le user demande une carte pour garder son prochain pas.",
        user_words: ["fais-moi une carte pour garder ce pas"],
        identity_freeze_risk: false,
        motivation_source_diagnosed: true,
      },
      response_contract: {
        max_questions: 0,
        allow_plan_edit: false,
        allow_tool_suggestion: true,
        allow_potion_suggestion: false,
        allow_attack_card_suggestion: true,
        allow_concrete_action: true,
        tone: "energy_preserving",
      },
      evidence: ["demande explicite de carte de soutien"],
    }),
  });

  assertEquals(result.status, "continue");
  assertEquals(result.reason_code, "demotivation_repair_local_continue");
  assertEquals(result.visible_task.kind, "action_card_candidate");
  assertEquals(result.blocked_effects.length, 0);
});

Deno.test("demotivation_repair allows paraphrased support request", () => {
  const result = reduceDemotivationRepairLocalDispatcherOutput({
    previous: null,
    output: dispatcherOutput({
      flow_action: "action_card_candidate",
      repair_state: {
        intent: "asks_smaller_step",
        phase: "action_card_ready",
        motivation_state: "overwhelm",
        action_readiness: "already_chosen",
        summary:
          "Le user veut formaliser un support pour garder le mini-pas choisi.",
        user_words: ["aide-moi a l'ancrer pour ne pas le perdre"],
        identity_freeze_risk: false,
        motivation_source_diagnosed: true,
      },
      response_contract: {
        max_questions: 0,
        allow_plan_edit: false,
        allow_tool_suggestion: true,
        allow_potion_suggestion: false,
        allow_attack_card_suggestion: true,
        allow_concrete_action: true,
        tone: "energy_preserving",
      },
      evidence: ["demande de support a garder"],
    }),
  });

  assertEquals(result.status, "continue");
  assertEquals(result.reason_code, "demotivation_repair_local_continue");
  assertEquals(result.visible_task.kind, "action_card_candidate");
  assertEquals(result.blocked_effects.length, 0);
});

Deno.test("demotivation_repair no_tool blocks action card candidate", () => {
  const result = reduceDemotivationRepairLocalDispatcherOutput({
    previous: null,
    output: dispatcherOutput({
      flow_action: "action_card_candidate",
      constraints: ["no_tool"],
      repair_state: {
        intent: "concrete_action_emerged",
        phase: "action_card_ready",
        motivation_state: "avoidance",
        action_readiness: "ready",
        summary: "Le user parle d'un pas mais bloque les outils.",
        user_words: ["pas d'outil, juste le prochain pas"],
        identity_freeze_risk: false,
        motivation_source_diagnosed: true,
      },
      response_contract: {
        max_questions: 0,
        allow_plan_edit: false,
        allow_tool_suggestion: true,
        allow_potion_suggestion: false,
        allow_attack_card_suggestion: true,
        allow_concrete_action: true,
        tone: "energy_preserving",
      },
    }),
  });

  assertEquals(result.status, "continue");
  assertEquals(
    result.reason_code,
    "demotivation_repair_action_card_candidate_blocked",
  );
  assertEquals(result.visible_task.kind, "smaller_step");
  assertEquals(result.blocked_effects[0]?.type, "action_card");
  assert(
    result.visible_task.conversation_context.do_not_say.includes(
      "Ne propose pas de carte ou de support produit dans ce message.",
    ),
  );
});

Deno.test("demotivation_repair stop request exits to global with note", () => {
  const result = reduceDemotivationRepairLocalDispatcherOutput({
    previous: null,
    output: dispatcherOutput({
      flow_action: "exit_to_global_dispatcher",
      repair_state: {
        intent: "unclear",
        phase: "exit",
        motivation_state: "unclear",
        action_readiness: "none",
        summary: "Le user veut arreter le flow sans nouveau sujet.",
        user_words: ["pas maintenant"],
        identity_freeze_risk: false,
        motivation_source_diagnosed: false,
      },
      response_contract: {
        max_questions: 0,
        allow_plan_edit: false,
        allow_tool_suggestion: false,
        allow_potion_suggestion: false,
        allow_attack_card_suggestion: false,
        allow_concrete_action: false,
        tone: "grounded",
      },
      visible_task: {
        kind: "exit_or_cancel",
        conversation_context: conversationContext({
          field_or_stage: "exit_or_cancel",
          max_questions: 0,
        }),
      },
    }),
  });

  assertEquals(result.status, "exit");
  assertEquals(result.response_intent, "exit_to_global_dispatcher");
  assertEquals(result.exit_to_global_dispatcher, true);
  assertEquals(result.note_information?.target_dispatcher, "global");
  assertEquals(result.note_information?.user_words, ["pas maintenant"]);
  assert(
    Object.keys(result.note_information?.structured_context ?? {}).length > 0,
  );
  assertEquals(result.local_state, null);
  assertEquals(result.visible_task.kind, "exit_or_cancel");
});

Deno.test("demotivation_repair clear topic change exits with note information", () => {
  const result = reduceDemotivationRepairLocalDispatcherOutput({
    previous: null,
    output: dispatcherOutput({
      flow_action: "exit_to_global_dispatcher",
      repair_state: {
        intent: "unclear",
        phase: "exit",
        motivation_state: "unclear",
        action_readiness: "none",
        summary: "Le user change clairement de sujet.",
        user_words: ["aide-moi plutot a prioriser mes mails"],
        identity_freeze_risk: false,
        motivation_source_diagnosed: false,
      },
      exit_memo: {
        needed: true,
        reason: "topic_change",
        flow_summary: "demotivation_repair s'arrete pour changement de sujet.",
        handoff_hint_for_global_dispatcher:
          "Reanalyser la demande de priorisation hors demotivation_repair.",
        potion_bridge_context: null,
        note_information: null,
      },
      visible_task: {
        kind: "exit_or_cancel",
        conversation_context: conversationContext({
          field_or_stage: "exit_or_cancel",
          handoff_data: {
            bridge_context_summary:
              "Reanalyser la demande de priorisation hors demotivation_repair.",
            target_dispatcher: "global",
          },
          max_questions: 0,
        }),
      },
    }),
  });

  assertEquals(result.status, "exit");
  assertEquals(result.exit_to_global_dispatcher, true);
  assertEquals(result.local_state, null);
  assertEquals(result.note_information?.source_flow_id, "demotivation_repair");
  assertEquals(result.note_information?.target_dispatcher, "global");
  assertEquals(result.note_information?.user_words, [
    "aide-moi plutot a prioriser mes mails",
  ]);
  assertEquals(
    (result.note_information?.structured_context as any)
      ?.recommended_next_focus,
    undefined,
  );
  assert(
    Object.keys(result.note_information?.structured_context ?? {}).length > 0,
  );
});

Deno.test("demotivation_repair anti false positive keeps owner on local revision", () => {
  const result = reduceDemotivationRepairLocalDispatcherOutput({
    previous: null,
    output: dispatcherOutput({
      flow_action: "revise_repair_context",
      repair_state: {
        intent: "loss_of_meaning",
        phase: "restore_meaning",
        motivation_state: "loss_of_meaning",
        action_readiness: "none",
        summary: "Le user nuance la source du decrochage.",
        user_words: ["non c'est surtout que je ne vois plus le sens"],
        identity_freeze_risk: false,
        motivation_source_diagnosed: true,
      },
    }),
  });

  assertEquals(result.status, "continue");
  assertEquals(result.exit_to_global_dispatcher, false);
  assertEquals(result.note_information, null);
  assertEquals(result.local_state?.status, "active");
});

Deno.test("demotivation_repair candidate potion is not a visible consent offer", () => {
  const candidate = bridgeOfferOutput("clarte");
  const result = reduceDemotivationRepairLocalDispatcherOutput({
    previous: null,
    output: dispatcherOutput({
      flow_action: "potion_bridge_offer",
      potion_bridge: {
        ...candidate.potion_bridge,
        status: "candidate",
      },
      visible_task: {
        kind: "potion_bridge_offer",
        conversation_context: conversationContext({
          field_or_stage: "potion_bridge_offer",
          selected_candidate: {
            potion: "clarte",
            potion_label: "Potion de clarté",
            durable_need_kind: "meaning_reconnection",
            durable_need_summary: "Besoin durable probable.",
          },
        }),
      },
    }),
  });

  assertEquals(result.status, "continue");
  assertEquals(result.reason_code, "invalid_status_transition");
  assertEquals(result.visible_task.kind, "restore_meaning");
  assertEquals(
    result.visible_task.conversation_context.selected_candidate.potion,
    null,
  );
  assert(
    result.visible_task.conversation_context.do_not_say.some((rule) =>
      rule === "Ne propose pas de potion dans ce message."
    ),
  );
  assertEquals(result.local_state?.last_potion_bridge_offer, null);
  assertEquals(
    result.blocked_effects[0]?.reason_code,
    "invalid_status_transition",
  );
});

Deno.test("demotivation_repair visible potion offer is persisted for confirmation", () => {
  const result = reduceDemotivationRepairLocalDispatcherOutput({
    previous: null,
    output: bridgeOfferOutput("clarte"),
  });

  assertEquals(result.status, "continue");
  assertEquals(result.reason_code, "demotivation_repair_local_continue");
  assertEquals(result.visible_task.kind, "potion_bridge_offer");
  assertEquals(
    result.visible_task.conversation_context.selected_candidate.potion,
    "clarte",
  );
  assertEquals(
    result.local_state?.last_potion_bridge_offer?.selected_potion,
    "clarte",
  );
});

Deno.test("demotivation_repair potion bridge offer covers direct and paraphrased potion families", () => {
  const cases: Array<{
    potion: DemotivationRepairBridgePotion;
    userWords: string[];
  }> = [
    {
      potion: "clarte",
      userWords: [
        "je ne vois plus pourquoi je fais ces actions",
        "le lien au sens s'est eteint",
      ],
    },
    {
      potion: "courage",
      userWords: [
        "je repousse parce que j'ai peur du regard",
        "je garde le plan mais le passage inconfortable me bloque",
      ],
    },
    {
      potion: "rappel",
      userWords: [
        "je décroche de ma routine du soir",
        "je laisse filer la marche quand l'elan baisse",
      ],
    },
  ];

  for (const item of cases) {
    const output = bridgeOfferOutput(item.potion);
    const result = reduceDemotivationRepairLocalDispatcherOutput({
      previous: null,
      output: {
        ...output,
        repair_state: {
          ...output.repair_state,
          user_words: item.userWords,
        },
        evidence: item.userWords,
      },
    });

    assertEquals(result.visible_task.kind, "potion_bridge_offer");
    assertEquals(
      result.local_state?.last_potion_bridge_offer?.selected_potion,
      item.potion,
    );
    assertEquals(
      result.local_state?.last_potion_bridge_offer?.visible_potion_label,
      potionLabel(item.potion),
    );
  }
});

Deno.test("demotivation_repair confirmation without persisted offer does not handoff", () => {
  const result = reduceDemotivationRepairLocalDispatcherOutput({
    previous: null,
    output: dispatcherOutput({
      flow_action: "confirm_potion_bridge",
      potion_bridge: {
        ...bridgeOfferOutput("clarte").potion_bridge,
        status: "confirmed_handoff",
      },
    }),
  });

  assertEquals(result.status, "continue");
  assertEquals(result.potion_bridge_context, null);
  assertEquals(result.note_information, null);
  assertEquals(result.local_state?.last_potion_bridge_offer, null);
  assertEquals(result.reason_code, "missing_previous_offer");
  assertEquals(
    result.blocked_effects[0]?.reason_code,
    "missing_previous_offer",
  );
});

Deno.test("demotivation_repair continuation preserves server-owned bridge offer", () => {
  const offered = reduceDemotivationRepairLocalDispatcherOutput({
    previous: null,
    output: bridgeOfferOutput("clarte"),
  });
  const result = reduceDemotivationRepairLocalDispatcherOutput({
    previous: offered.local_state,
    output: dispatcherOutput({
      flow_action: "restore_meaning",
      state_change_intent: {
        modified_fields: [],
        clear_fields: ["last_potion_bridge_offer"],
        reason: "dispatcher omitted stale pending offer",
      },
    }),
  });

  assertEquals(result.status, "continue");
  assertEquals(
    result.local_state?.last_potion_bridge_offer?.selected_potion,
    "clarte",
  );
  assert(
    result.state_mutation_audit.restored_fields.includes(
      "last_potion_bridge_offer",
    ),
  );
  assertEquals(
    result.state_mutation_audit.rejected_changes[0]?.reason_code,
    "server_owned_clear_requires_authorized_transition",
  );
});

Deno.test("demotivation_repair invalid confirmation preserves pending offer", () => {
  const offered = reduceDemotivationRepairLocalDispatcherOutput({
    previous: null,
    output: bridgeOfferOutput("courage"),
  });
  const result = reduceDemotivationRepairLocalDispatcherOutput({
    previous: offered.local_state,
    output: dispatcherOutput({
      flow_action: "confirm_potion_bridge",
      potion_bridge: {
        ...bridgeOfferOutput("clarte").potion_bridge,
        status: "confirmed_handoff",
      },
      state_change_intent: {
        modified_fields: [],
        clear_fields: ["last_potion_bridge_offer"],
        reason: "confirmation locale",
      },
    }),
  });

  assertEquals(result.status, "continue");
  assertEquals(result.reason_code, "selected_option_mismatch");
  assertEquals(result.potion_bridge_context, null);
  assertEquals(
    result.local_state?.last_potion_bridge_offer?.selected_potion,
    "courage",
  );
  assert(
    result.state_mutation_audit.restored_fields.includes(
      "last_potion_bridge_offer",
    ),
  );
});

Deno.test("demotivation_repair valid confirmation clears offer and stores active handoff context", () => {
  const offered = reduceDemotivationRepairLocalDispatcherOutput({
    previous: null,
    output: bridgeOfferOutput("rappel"),
  });
  const output = bridgeOfferOutput("rappel");
  const result = reduceDemotivationRepairLocalDispatcherOutput({
    previous: offered.local_state,
    output: {
      ...output,
      flow_action: "confirm_potion_bridge",
      potion_bridge: {
        ...output.potion_bridge,
        status: "confirmed_handoff",
      },
      state_change_intent: {
        modified_fields: ["active_potion_handoff_context"],
        clear_fields: ["last_potion_bridge_offer"],
        reason: "consentement au bridge potion",
      },
    },
  });

  assertEquals(result.status, "handoff");
  assertEquals(result.local_state?.last_potion_bridge_offer, null);
  assertEquals(
    result.local_state?.active_potion_handoff_context?.selected_potion,
    "rappel",
  );
  assert(
    result.state_mutation_audit.cleared_fields.includes(
      "last_potion_bridge_offer",
    ),
  );
  assert(
    result.state_mutation_audit.applied_fields.includes(
      "active_potion_handoff_context",
    ),
  );
});

Deno.test("demotivation_repair old active state without active handoff field is readable", () => {
  const offered = reduceDemotivationRepairLocalDispatcherOutput({
    previous: null,
    output: bridgeOfferOutput("clarte"),
  });
  const oldState = { ...offered.local_state } as any;
  delete oldState.active_potion_handoff_context;

  const read = readDemotivationRepairLocalState({
    working_state: {
      demotivation_repair_local_state: oldState,
    },
  });

  assert(read);
  assertEquals(read.active_potion_handoff_context, null);
  assertEquals(read.last_potion_bridge_offer?.selected_potion, "clarte");
});

Deno.test("demotivation_repair partial legacy offer is not confirmable by default", () => {
  const offered = reduceDemotivationRepairLocalDispatcherOutput({
    previous: null,
    output: bridgeOfferOutput("clarte"),
  });
  const partialLegacyState = {
    ...offered.local_state!,
    last_potion_bridge_offer: {
      selected_potion: "clarte",
    },
  } as any;

  const result = reduceDemotivationRepairLocalDispatcherOutput({
    previous: partialLegacyState,
    output: dispatcherOutput({
      flow_action: "confirm_potion_bridge",
      potion_bridge: {
        ...bridgeOfferOutput("clarte").potion_bridge,
        status: "confirmed_handoff",
      },
    }),
  });

  assertEquals(result.status, "continue");
  assertEquals(result.reason_code, "missing_previous_offer");
  assertEquals(result.potion_bridge_context, null);
  assertEquals(result.local_state?.last_potion_bridge_offer, null);
});

Deno.test("demotivation_repair legacy repair state with missing or old enum fields is normalized", () => {
  const read = readDemotivationRepairLocalState({
    working_state: {
      demotivation_repair_local_state: {
        skill_id: "demotivation_repair",
        mode: "local_repair_flow",
        status: "active",
        repair_state: {
          intent: "old_demotivation_intent",
          phase: "old_phase",
          motivation_state: "old_state",
          summary: "",
        },
        last_visible_task: "restore_meaning",
        last_potion_bridge_offer: null,
        previous_repair_summary: null,
        turn_count: 2,
        max_turns: 6,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:01:00.000Z",
      },
    },
  });

  assert(read);
  assertEquals(read.repair_state.intent, "unclear");
  assertEquals(read.repair_state.phase, "diagnose");
  assertEquals(read.repair_state.motivation_state, "unclear");
  assertEquals(read.repair_state.action_readiness, "none");
  assertEquals(
    read.repair_state.summary,
    "Réparation motivationnelle en cours.",
  );
  assertEquals(read.last_potion_bridge_offer, null);
});

Deno.test("demotivation_repair explicit correction replaces only the pending bridge target", () => {
  const offered = reduceDemotivationRepairLocalDispatcherOutput({
    previous: null,
    output: bridgeOfferOutput("clarte"),
  });
  const result = reduceDemotivationRepairLocalDispatcherOutput({
    previous: offered.local_state,
    output: {
      ...bridgeOfferOutput("courage"),
      repair_state: {
        ...bridgeOfferOutput("courage").repair_state,
        user_words: [
          "non ce n'est pas une question de sens, c'est la peur du regard",
        ],
      },
      state_change_intent: {
        modified_fields: [
          "last_potion_bridge_offer",
          "selected_bridge_target",
        ],
        clear_fields: [],
        reason: "correction explicite du besoin durable",
      },
    },
  });

  assertEquals(result.status, "continue");
  assertEquals(
    result.local_state?.last_potion_bridge_offer?.selected_potion,
    "courage",
  );
  assertEquals(
    result.local_state?.last_potion_bridge_offer?.durable_need.kind,
    "courage_through_avoidance",
  );
  assertEquals(
    result.local_state?.active_potion_handoff_context,
    null,
  );
  assertEquals(result.state_mutation_audit.rejected_changes.length, 0);
  assert(
    result.state_mutation_audit.applied_fields.includes(
      "selected_bridge_target",
    ),
  );
});

Deno.test("demotivation_repair topic change with pending offer exits and clears audit", () => {
  const offered = reduceDemotivationRepairLocalDispatcherOutput({
    previous: null,
    output: bridgeOfferOutput("clarte"),
  });
  const result = reduceDemotivationRepairLocalDispatcherOutput({
    previous: offered.local_state,
    output: dispatcherOutput({
      flow_action: "exit_to_global_dispatcher",
      repair_state: {
        intent: "unclear",
        phase: "exit",
        motivation_state: "unclear",
        action_readiness: "none",
        summary: "Le user change de sujet.",
        user_words: ["en fait aide-moi a revoir mon planning"],
        identity_freeze_risk: false,
        motivation_source_diagnosed: false,
      },
      visible_task: {
        kind: "exit_or_cancel",
        conversation_context: conversationContext({
          field_or_stage: "exit_or_cancel",
          max_questions: 0,
        }),
      },
    }),
  });

  assertEquals(result.status, "exit");
  assertEquals(result.local_state, null);
  assert(
    result.state_mutation_audit.cleared_fields.includes(
      "last_potion_bridge_offer",
    ),
  );
});

Deno.test("demotivation_repair inline detour preserves pending offer for parent flow", () => {
  const offered = reduceDemotivationRepairLocalDispatcherOutput({
    previous: null,
    output: bridgeOfferOutput("rappel"),
  });
  const result = reduceDemotivationRepairLocalDispatcherOutput({
    previous: offered.local_state,
    output: dispatcherOutput({
      flow_action: "get_info_product",
      visible_task: {
        kind: "inline_tool_return",
        conversation_context: conversationContext({
          field_or_stage: "inline_tool_return",
          max_questions: 0,
        }),
      },
    }),
  });

  assertEquals(result.status, "continue");
  assertEquals(result.note_information?.target_dispatcher, "product_help");
  assertEquals(
    result.local_state?.last_potion_bridge_offer?.selected_potion,
    "rappel",
  );
  assert(
    result.state_mutation_audit.preserved_fields.includes(
      "last_potion_bridge_offer",
    ),
  );
});

Deno.test("demotivation_repair non-actionable potion mention does not handoff", () => {
  const output = bridgeOfferOutput("clarte");
  const result = reduceDemotivationRepairLocalDispatcherOutput({
    previous: null,
    output: {
      ...output,
      flow_action: "answer_repair",
      potion_bridge: {
        ...output.potion_bridge,
        status: "candidate",
      },
    },
  });

  assertEquals(result.status, "continue");
  assertEquals(result.potion_bridge_context, null);
  assertEquals(result.note_information, null);
  assertEquals(result.local_state?.last_potion_bridge_offer, null);
  assertEquals(
    result.state_mutation_audit.server_owned_fields.includes(
      "last_potion_bridge_offer",
    ),
    true,
  );
});

Deno.test("demotivation_repair explicit no_potion clears pending offer", () => {
  const offered = reduceDemotivationRepairLocalDispatcherOutput({
    previous: null,
    output: bridgeOfferOutput("clarte"),
  });
  const result = reduceDemotivationRepairLocalDispatcherOutput({
    previous: offered.local_state,
    output: dispatcherOutput({
      flow_action: "restore_meaning",
      constraints: ["no_potion"],
      state_change_intent: {
        modified_fields: [],
        clear_fields: ["last_potion_bridge_offer"],
        reason: "user blocks potion support",
      },
    }),
  });

  assertEquals(result.local_state?.last_potion_bridge_offer, null);
  assert(
    result.state_mutation_audit.cleared_fields.includes(
      "last_potion_bridge_offer",
    ),
  );
  assertEquals(result.state_mutation_audit.rejected_changes.length, 0);
});

Deno.test("demotivation_repair confirmed clarte bridge carries note and candidate", () => {
  const context = confirmedContext("clarte");
  assertEquals(context.origin_flow, "demotivation_repair");
  assertEquals(context.selected_potion, "clarte");
  assertEquals(context.visible_potion_label, "Potion de clarté");
  assertEquals(context.note_information.source_flow_id, "demotivation_repair");
  assertEquals(
    context.note_information.target_dispatcher,
    "select_state_potion",
  );
  assertEquals(context.note_information.target_flow, "select_state_potion");
  assert(
    Object.keys(context.note_information.structured_context).length > 0,
  );
  assert(
    context.note_information.handoff_context_for_next_dispatcher.length > 0,
  );
  assertEquals(
    context.prefill_candidates.plan_meaning_loss_reason?.candidate_value,
    "Je fais les actions, mais je ne sens plus pourquoi elles comptent.",
  );
  assertEquals(
    context.prefill_candidates.plan_meaning_loss_reason?.confidence,
    "high",
  );
  assertEquals(
    context.note_information.target_dispatcher,
    "select_state_potion",
  );
});

Deno.test("demotivation_repair handoff_to_local_flow produces real select_state_potion bridge", () => {
  const offered = reduceDemotivationRepairLocalDispatcherOutput({
    previous: null,
    output: bridgeOfferOutput("courage"),
  });
  const output = bridgeOfferOutput("courage");
  const reduced = reduceDemotivationRepairLocalDispatcherOutput({
    previous: offered.local_state,
    output: {
      ...output,
      flow_action: "handoff_to_local_flow",
      potion_bridge: {
        ...output.potion_bridge,
        status: "confirmed_handoff",
      },
      visible_task: {
        ...output.visible_task,
        kind: "potion_bridge_handoff",
      },
    },
  });

  assertEquals(reduced.status, "handoff");
  assertEquals(reduced.response_intent, "handoff_to_select_state_potion");
  assertEquals(reduced.potion_bridge_context?.selected_potion, "courage");
  assertEquals(
    reduced.note_information?.target_dispatcher,
    "select_state_potion",
  );
  assertEquals(
    reduced.visible_task.conversation_context.handoff_data.target_dispatcher,
    "select_state_potion",
  );
});

Deno.test("demotivation_repair blocked potion wording removes visible candidate", () => {
  const output = bridgeOfferOutput("clarte");
  const reduced = reduceDemotivationRepairLocalDispatcherOutput({
    previous: null,
    output: {
      ...output,
      response_contract: {
        ...output.response_contract,
        allow_tool_suggestion: false,
        allow_potion_suggestion: false,
      },
      potion_bridge: {
        ...output.potion_bridge,
        status: "offered_waiting_consent",
      },
    },
  });

  assertEquals(
    reduced.reason_code,
    "blocked_by_constraint",
  );
  assertEquals(
    reduced.visible_task.conversation_context.selected_candidate.potion,
    null,
  );
  assertEquals(
    reduced.visible_task.conversation_context.handoff_data.target_dispatcher,
    null,
  );
  assertEquals(reduced.local_state?.last_potion_bridge_offer, null);
  assertEquals(
    reduced.blocked_effects[0]?.reason_code,
    "blocked_by_constraint",
  );
});

Deno.test("demotivation_repair courage and anti-dropout bridge fields are scoped", () => {
  const courage = confirmedContext("courage");
  assertEquals(courage.selected_potion, "courage");
  assertEquals(
    courage.prefill_candidates.avoidance_target?.candidate_value,
    "envoyer le mail de retour",
  );
  assertEquals(courage.prefill_candidates.blocker_kind?.option_value, "regard");

  const rappel = confirmedContext("rappel");
  assertEquals(rappel.selected_potion, "rappel");
  assertEquals(rappel.visible_potion_label, "Potion anti-décrochage");
  assertEquals(
    rappel.prefill_candidates.drift_target?.candidate_value,
    "la marche du soir",
  );
  assertEquals(
    rappel.prefill_candidates.drift_style?.option_value,
    "laisse_filer",
  );
});

Deno.test("demotivation_repair safety preempt wins", () => {
  const result = reduceDemotivationRepairLocalDispatcherOutput({
    previous: null,
    output: bridgeOfferOutput("clarte"),
    turn_frame: {
      safety: { risk_band: "critical", reason_codes: ["test"], evidence: [] },
    } as any,
  });
  assertEquals(result.status, "safety");
  assertEquals(result.potion_bridge_context, null);
  assertEquals(result.local_state, null);
  assertEquals(result.note_information?.target_dispatcher, "safety_crisis");
  assertEquals(result.exit_to_global_dispatcher, false);
});

Deno.test("demotivation_repair handoff starts select_state_potion subskills directly", () => {
  const routeDecision = {
    response_owner: "conversation_handler",
    selected_handler: "demotivation_repair",
  } as any;
  for (const potion of ["clarte", "courage", "rappel"] as const) {
    const context = confirmedContext(potion);
    const next = persistConversationSkillRoute({}, routeDecision, {
      skill_id: "demotivation_repair",
      status: "handoff",
      response_intent: "handoff_to_select_state_potion",
      memory_trace: {
        memory_used_for_response: false,
        memory_item_ids_used: [],
        correction_detected: false,
        correction_target_item_ids: [],
      },
      state_patch: {
        demotivation_repair_potion_handoff: {
          selected_potion: potion,
          potion_bridge_context: context,
          note_information: context.note_information,
        },
      },
    } as any);
    const active = loadStatePotionHandoffStateFromTempMemory(next);
    assert(active);
    assertEquals(active.active_subskill_id, `select_state_potion.${potion}`);
    assertEquals(
      active.origin_bridge_context?.origin_flow,
      "demotivation_repair",
    );
    assertEquals(
      (active.origin_bridge_context?.note_information as any)
        ?.target_dispatcher,
      "select_state_potion",
    );
    assertEquals(
      (active.operation_input?.note_information as any)?.source_flow_id,
      "demotivation_repair",
    );
    if (potion === "clarte") {
      assertEquals(active.clarte_state?.field_state.status, "locked");
      assertEquals(
        active.clarte_state?.field_state.locked_value,
        "Je fais les actions, mais je ne sens plus pourquoi elles comptent.",
      );
    } else {
      assertEquals(
        active.potion_subskill_state?.origin_bridge_context?.origin_flow,
        "demotivation_repair",
      );
    }
  }
});

Deno.test("clarte bridge confidence maps to locked proposed or clarification", () => {
  const baseContext = {
    origin_flow: "demotivation_repair",
    selected_potion: "clarte",
    note_information: {
      source_flow_presentation: "source",
      handoff_context_for_next_dispatcher: "context",
      target_flow: "select_state_potion",
    },
  };
  const stateForConfidence = (confidence: "high" | "medium" | "low") =>
    createInitialClarteState(null, {
      ...baseContext,
      prefill_candidates: {
        plan_meaning_loss_reason: {
          candidate_value: "mon plan est devenu mécanique",
          confidence,
          source: "demotivation_repair",
        },
      },
    });
  assertEquals(stateForConfidence("high").field_state.status, "locked");
  assertEquals(stateForConfidence("medium").field_state.status, "proposed");
  assertEquals(stateForConfidence("low").field_state.status, "missing");
});
