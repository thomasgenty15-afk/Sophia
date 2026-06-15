import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { maybeRunPrepareAttackCardOperation } from "./router.ts";
import {
  ATTACK_CARD_PLATFORM_FIELD_DEFINITIONS,
  ATTACK_CARD_TECHNIQUE_LABELS,
  createInitialPrepareAttackCardLocalState,
  dispatcherSystemPrompt,
  type PrepareAttackCardLocalDispatcherOutput,
  type PrepareAttackCardVisibleTaskKind,
  reducePrepareAttackCardLocalDispatcherOutput,
} from "./local_flow.ts";
import {
  type PrepareAttackCardVisibleAgentInput,
  prepareAttackCardVisibleContractIssues,
} from "./visible_agent.ts";

type AssertNever<T extends never> = T;
type _NoLegacyPrepareAttackCardVisibleInputKeys = AssertNever<
  Extract<
    keyof PrepareAttackCardVisibleAgentInput,
    "user_message" | "recent_messages" | "local_state" | "draft"
  >
>;

function decision(
  patch: Partial<PrepareAttackCardLocalDispatcherOutput>,
): PrepareAttackCardLocalDispatcherOutput {
  return {
    flow_action: "answer_current_field",
    confidence: "high",
    stage: "target_intake",
    flow_kind: "free_attack_card",
    target_state: {
      status: "missing",
      kind: null,
      plan_item_id: null,
      candidate_value: null,
      locked_value: null,
      needs_user_confirmation: false,
      why_status: "missing",
    },
    blocker_state: {
      status: "missing",
      blocker_type: null,
      candidate_value: null,
      locked_value: null,
      needs_user_confirmation: false,
      why_status: "missing",
    },
    technique_state: {
      status: "missing",
      technique_key: null,
      technique_label: null,
      explicitly_requested: false,
      candidate_options: [],
      fit_warning: null,
      needs_user_confirmation: false,
      why_status: "missing",
    },
    platform_field_states: [],
    activation_keyword_state: {
      status: "not_applicable",
      candidate_value: null,
      locked_value: null,
      needs_user_confirmation: false,
      why_status: "not applicable",
    },
    revision: {
      is_revision: false,
      revision_target: null,
      field_id: null,
      replacement_value: null,
      replaces_previous_value: false,
    },
    visible_task: {
      kind: "ask_target",
    },
    subskill_call: {
      needed: false,
      skill_id: null,
      reason: null,
      context_for_subskill: {},
    },
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

function visibleInput(
  stage: PrepareAttackCardVisibleTaskKind,
  context = reducePrepareAttackCardLocalDispatcherOutput({
    previous: createInitialPrepareAttackCardLocalState(),
    output: decision({ visible_task: { kind: stage } }),
  }).visible_task_context,
): PrepareAttackCardVisibleAgentInput {
  return {
    user_id: "u1",
    stage,
    visible_task: {
      kind: stage,
      conversation_context: context,
    },
  };
}

Deno.test("prepare_attack_card local dispatcher prompt documents real output field rules", () => {
  const prompt = dispatcherSystemPrompt();
  assert(prompt.includes("Field Completion Rules:"));
  for (
    const field of [
      "flow_action",
      "confidence",
      "stage",
      "flow_kind",
      "target_state",
      "blocker_state",
      "technique_state",
      "platform_field_states",
      "activation_keyword_state",
      "revision",
      "visible_task.kind",
      "visible_task.conversation_context",
      "subskill_call",
      "exit_memo",
      "note_information",
      "risk_assessment",
      "evidence",
    ]
  ) {
    assert(prompt.includes(field), `missing prompt rules for ${field}`);
  }
  assert(prompt.includes("risk_score 0-10"));
  assert(prompt.includes("platform_steps doit rester vide"));
  assert(prompt.includes("preserve_active_flow=true"));
  assert(prompt.includes("question d'etat/ledger read-only"));
  assert(prompt.includes("ce qui est seulement prepare a recopier"));
});

Deno.test("prepare_attack_card local dispatcher prompt documents transition rules without extra examples", () => {
  const prompt = dispatcherSystemPrompt();
  for (
    const action of [
      "exit_to_global_dispatcher",
      "exit_to_global_dispatcher",
      "safety_preempt",
      "handoff_to_local_flow",
      "get_info_product",
      "get_info_db",
      "apply_attempt",
    ]
  ) {
    assert(prompt.includes(action), `missing transition rule for ${action}`);
  }
  const exampleCount = prompt.split("Example JSON ").length - 1;
  assertEquals(exampleCount, 2);
  assert(prompt.includes("continuation normale"));
  assert(prompt.includes("transition critique exit global"));
  assert(prompt.includes("creation maintenant"));
  assert(prompt.includes("frontiere: le chat peut preparer et guider"));
});

function lockedBase() {
  return decision({
    flow_action: "choose_technique",
    stage: "platform_field_intake",
    target_state: {
      status: "locked",
      kind: "personal_action",
      plan_item_id: null,
      candidate_value: null,
      locked_value: "écrire mes mails",
      needs_user_confirmation: false,
      why_status: "clear",
    },
    blocker_state: {
      status: "locked",
      blocker_type: "procrastination",
      candidate_value: null,
      locked_value: "je repousse quand ça semble trop long",
      needs_user_confirmation: false,
      why_status: "clear",
    },
    technique_state: {
      status: "locked",
      technique_key: "ancre_visuelle",
      technique_label: "Ancre visuelle",
      explicitly_requested: true,
      candidate_options: [],
      fit_warning: null,
      needs_user_confirmation: false,
      why_status: "explicit label",
    },
    visible_task: {
      kind: "ask_platform_field",
    },
  });
}

function lockedPlatformField(
  technique: "ancre_visuelle",
  index: number,
  value: string,
) {
  const definition = ATTACK_CARD_PLATFORM_FIELD_DEFINITIONS[technique][index];
  return {
    field_id: definition.field_id,
    technique_key: technique,
    field_label: definition.field_label,
    status: "locked" as const,
    candidate_value: null,
    locked_value: value,
    previous_value: null,
    needs_user_confirmation: false,
    why_status: "clear",
  };
}

Deno.test("prepare_attack_card local reducer does not lock vague target", () => {
  const result = reducePrepareAttackCardLocalDispatcherOutput({
    previous: createInitialPrepareAttackCardLocalState(),
    output: decision({
      target_state: {
        status: "ambiguous",
        kind: "unknown",
        plan_item_id: null,
        candidate_value: "mon action",
        locked_value: null,
        needs_user_confirmation: true,
        why_status: "candidate vague",
      },
      visible_task: {
        kind: "ask_target",
      },
    }),
  });
  assertEquals(result.local_state?.target_state.status, "ambiguous");
  assertEquals(result.local_state?.target_state.locked_value, null);
});

Deno.test("prepare_attack_card visible task exposes conversation_context without required_data", () => {
  const result = reducePrepareAttackCardLocalDispatcherOutput({
    previous: createInitialPrepareAttackCardLocalState(),
    output: decision({
      visible_task: {
        kind: "ask_target",
      },
    }),
  });

  assertEquals((result.visible_task_context as any).required_data, undefined);
});

Deno.test("prepare_attack_card local reducer locks clear target", () => {
  const result = reducePrepareAttackCardLocalDispatcherOutput({
    previous: createInitialPrepareAttackCardLocalState(),
    output: decision({
      target_state: {
        status: "locked",
        kind: "personal_action",
        plan_item_id: null,
        candidate_value: null,
        locked_value: "arrêter de négocier mon sport le soir",
        needs_user_confirmation: false,
        why_status: "clear action",
      },
      visible_task: {
        kind: "ask_blocker",
      },
    }),
  });
  assertEquals(result.local_state?.target_state.status, "locked");
  assertEquals(
    result.local_state?.target_state.locked_value,
    "arrêter de négocier mon sport le soir",
  );
});

Deno.test("prepare_attack_card local reducer keeps target candidate confirmation", () => {
  const result = reducePrepareAttackCardLocalDispatcherOutput({
    previous: createInitialPrepareAttackCardLocalState(),
    output: decision({
      target_state: {
        status: "proposed",
        kind: "plan_item",
        plan_item_id: "plan-1",
        candidate_value: "action du plan",
        locked_value: null,
        needs_user_confirmation: true,
        why_status: "context candidate",
      },
      visible_task: {
        kind: "confirm_target_candidate",
      },
    }),
  });
  assertEquals(result.visible_task, "confirm_target_candidate");
  assertEquals(result.local_state?.target_state.status, "proposed");
});

Deno.test("prepare_attack_card blocker vague remains ask_blocker", () => {
  const result = reducePrepareAttackCardLocalDispatcherOutput({
    previous: createInitialPrepareAttackCardLocalState(),
    output: decision({
      target_state: {
        status: "locked",
        kind: "personal_action",
        plan_item_id: null,
        candidate_value: null,
        locked_value: "écrire le rapport",
        needs_user_confirmation: false,
        why_status: "clear",
      },
      blocker_state: {
        status: "missing",
        blocker_type: null,
        candidate_value: null,
        locked_value: null,
        needs_user_confirmation: false,
        why_status: "unclear",
      },
      visible_task: {
        kind: "ask_blocker",
      },
    }),
  });
  assertEquals(result.visible_task, "ask_blocker");
  assertEquals(result.local_state?.blocker_state.status, "missing");
});

Deno.test("prepare_attack_card explicit technique locks exact label", () => {
  const result = reducePrepareAttackCardLocalDispatcherOutput({
    previous: createInitialPrepareAttackCardLocalState(),
    output: lockedBase(),
  });
  assertEquals(result.local_state?.technique_state.status, "locked");
  assertEquals(
    result.local_state?.technique_state.technique_label,
    "Ancre visuelle",
  );
});

Deno.test("prepare_attack_card ambiguous technique proposes options", () => {
  const result = reducePrepareAttackCardLocalDispatcherOutput({
    previous: createInitialPrepareAttackCardLocalState(),
    output: decision({
      technique_state: {
        status: "ambiguous",
        technique_key: null,
        technique_label: null,
        explicitly_requested: false,
        candidate_options: [{
          technique_key: "texte_recadrage",
          technique_label: "Le texte magique",
          reason: "négociation intérieure",
          recommended: true,
        }, {
          technique_key: "ancre_visuelle",
          technique_label: "Ancre visuelle",
          reason: "signal visible",
          recommended: false,
        }],
        fit_warning: null,
        needs_user_confirmation: true,
        why_status: "several fits",
      },
      visible_task: {
        kind: "ask_or_confirm_technique",
      },
    }),
  });
  assertEquals(result.visible_task, "ask_or_confirm_technique");
  assertEquals(result.local_state?.technique_state.status, "ambiguous");
  assertEquals(result.visible_task_context.selected_candidate, {
    candidate_options: [{
      technique_key: "texte_recadrage",
      technique_label: "Le texte magique",
      reason: "négociation intérieure",
      recommended: true,
    }, {
      technique_key: "ancre_visuelle",
      technique_label: "Ancre visuelle",
      reason: "signal visible",
      recommended: false,
    }],
    allowed_technique_labels: ["Le texte magique", "Ancre visuelle"],
    recommended_technique: {
      technique_key: "texte_recadrage",
      technique_label: "Le texte magique",
      reason: "négociation intérieure",
      recommended: true,
    },
    previous_value: null,
  });
});

Deno.test("prepare_attack_card reducer normalizes ask_target when target and blocker are locked", () => {
  const result = reducePrepareAttackCardLocalDispatcherOutput({
    previous: createInitialPrepareAttackCardLocalState(),
    output: decision({
      flow_action: "confirm_technique_proposal",
      target_state: {
        status: "locked",
        kind: "personal_action",
        plan_item_id: null,
        candidate_value: null,
        locked_value: "dix minutes de rangement le soir",
        needs_user_confirmation: false,
        why_status: "clear",
      },
      blocker_state: {
        status: "locked",
        blocker_type: "procrastination",
        candidate_value: null,
        locked_value: "ce n'est pas urgent, je le ferai demain",
        needs_user_confirmation: false,
        why_status: "clear",
      },
      technique_state: {
        status: "proposed",
        technique_key: "texte_recadrage",
        technique_label: "Le texte magique",
        explicitly_requested: false,
        candidate_options: [{
          technique_key: "texte_recadrage",
          technique_label: "Le texte magique",
          reason: "négociation interne",
          recommended: true,
        }],
        fit_warning: null,
        needs_user_confirmation: true,
        why_status: "best fit",
      },
      visible_task: {
        kind: "ask_target",
      },
    }),
  });
  assertEquals(result.visible_task, "ask_or_confirm_technique");
  assertEquals(
    result.local_state?.last_visible_task,
    "ask_or_confirm_technique",
  );
});

Deno.test("prepare_attack_card reducer normalizes ask_target to platform field when slots are ready", () => {
  const result = reducePrepareAttackCardLocalDispatcherOutput({
    previous: createInitialPrepareAttackCardLocalState(),
    output: {
      ...lockedBase(),
      visible_task: {
        kind: "ask_target",
      },
    },
  });
  assertEquals(result.visible_task, "ask_platform_field");
  assertEquals(
    result.local_state?.current_field_id,
    "commitment_to_keep_alive",
  );
});

Deno.test("prepare_attack_card pre_engagement is not universal", () => {
  assertEquals(
    ATTACK_CARD_PLATFORM_FIELD_DEFINITIONS.pre_engagement.map((field) =>
      field.field_id
    ),
    ["risk_situation", "protected_value"],
  );
});

Deno.test("prepare_attack_card each technique has specific fields", () => {
  assertEquals(
    ATTACK_CARD_PLATFORM_FIELD_DEFINITIONS.texte_recadrage.map((field) =>
      field.field_id
    ),
    ["negotiated_action", "recurring_excuse", "desired_reframe_state"],
  );
  assertEquals(
    ATTACK_CARD_PLATFORM_FIELD_DEFINITIONS.mantra_force.map((field) =>
      field.field_id
    ),
    ["effort_target", "importance_reason", "mantra_tone"],
  );
  assertEquals(
    ATTACK_CARD_PLATFORM_FIELD_DEFINITIONS.preparer_terrain.map((field) =>
      field.field_id
    ),
    ["action_to_simplify", "prep_in_advance", "ready_environment"],
  );
});

Deno.test("prepare_attack_card field vague remains proposed", () => {
  const result = reducePrepareAttackCardLocalDispatcherOutput({
    previous: createInitialPrepareAttackCardLocalState(),
    output: {
      ...lockedBase(),
      platform_field_states: [{
        field_id: "commitment_to_keep_alive",
        technique_key: "ancre_visuelle",
        field_label:
          ATTACK_CARD_PLATFORM_FIELD_DEFINITIONS.ancre_visuelle[0].field_label,
        status: "proposed",
        candidate_value: "rester aligné",
        locked_value: null,
        previous_value: null,
        needs_user_confirmation: true,
        why_status: "needs confirmation",
      }],
      visible_task: {
        kind: "confirm_platform_field_proposal",
      },
    },
  });
  assertEquals(
    result.local_state?.platform_field_states.commitment_to_keep_alive.status,
    "proposed",
  );
});

Deno.test("prepare_attack_card clear field locks", () => {
  const result = reducePrepareAttackCardLocalDispatcherOutput({
    previous: createInitialPrepareAttackCardLocalState(),
    output: {
      ...lockedBase(),
      platform_field_states: [{
        field_id: "commitment_to_keep_alive",
        technique_key: "ancre_visuelle",
        field_label:
          ATTACK_CARD_PLATFORM_FIELD_DEFINITIONS.ancre_visuelle[0].field_label,
        status: "locked",
        candidate_value: null,
        locked_value: "garder mes mails vivants sans les repousser",
        previous_value: null,
        needs_user_confirmation: false,
        why_status: "clear",
      }],
    },
  });
  assertEquals(
    result.local_state?.platform_field_states.commitment_to_keep_alive
      .locked_value,
    "garder mes mails vivants sans les repousser",
  );
});

Deno.test("prepare_attack_card correction replaces value after handoff", () => {
  const first = reducePrepareAttackCardLocalDispatcherOutput({
    previous: createInitialPrepareAttackCardLocalState(),
    output: {
      ...lockedBase(),
      platform_field_states: [{
        field_id: "commitment_to_keep_alive",
        technique_key: "ancre_visuelle",
        field_label:
          ATTACK_CARD_PLATFORM_FIELD_DEFINITIONS.ancre_visuelle[0].field_label,
        status: "locked",
        candidate_value: null,
        locked_value: "ancienne phrase",
        previous_value: null,
        needs_user_confirmation: false,
        why_status: "clear",
      }],
    },
  });
  const second = reducePrepareAttackCardLocalDispatcherOutput({
    previous: first.local_state,
    output: decision({
      flow_action: "revise_current_field",
      technique_state: first.local_state!.technique_state,
      platform_field_states: [{
        field_id: "commitment_to_keep_alive",
        technique_key: "ancre_visuelle",
        field_label:
          ATTACK_CARD_PLATFORM_FIELD_DEFINITIONS.ancre_visuelle[0].field_label,
        status: "locked",
        candidate_value: null,
        locked_value: "nouvelle phrase",
        previous_value: "ancienne phrase",
        needs_user_confirmation: false,
        why_status: "revision",
      }],
      visible_task: {
        kind: "revision_done",
      },
    }),
  });
  assertEquals(
    second.local_state?.platform_field_states.commitment_to_keep_alive
      .locked_value,
    "nouvelle phrase",
  );
});

Deno.test("prepare_attack_card apply_attempt is non-mutant", () => {
  const previous = reducePrepareAttackCardLocalDispatcherOutput({
    previous: createInitialPrepareAttackCardLocalState(),
    output: lockedBase(),
  }).local_state;
  const result = reducePrepareAttackCardLocalDispatcherOutput({
    previous,
    output: decision({
      flow_action: "apply_attempt",
      target_state: {
        status: "locked",
        kind: "personal_action",
        plan_item_id: null,
        candidate_value: null,
        locked_value: "nouvelle cible interdite",
        needs_user_confirmation: false,
        why_status: "should not mutate",
      },
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
  assertEquals(
    result.local_state?.target_state.locked_value,
    "écrire mes mails",
  );
  assert(
    result.state_mutation_audit.rejected_changes.some((change) =>
      change.field === "target_state" &&
      change.reason_code === "blocked_by_constraint"
    ),
  );
});

Deno.test("prepare_attack_card continuation preserves server-owned target", () => {
  const previous = reducePrepareAttackCardLocalDispatcherOutput({
    previous: createInitialPrepareAttackCardLocalState(),
    output: lockedBase(),
  }).local_state;
  const result = reducePrepareAttackCardLocalDispatcherOutput({
    previous,
    output: decision({
      flow_action: "answer_current_field",
      blocker_state: {
        status: "locked",
        blocker_type: "procrastination",
        candidate_value: null,
        locked_value: "je repousse quand ça semble long",
        needs_user_confirmation: false,
        why_status: "clear",
      },
      visible_task: { kind: "ask_platform_field" },
    }),
  });
  assertEquals(
    result.local_state?.target_state.locked_value,
    "écrire mes mails",
  );
  assert(result.state_mutation_audit.preserved_fields.includes("target_state"));
});

Deno.test("prepare_attack_card invalid technique confirmation preserves pending offer", () => {
  const previous = reducePrepareAttackCardLocalDispatcherOutput({
    previous: createInitialPrepareAttackCardLocalState(),
    output: decision({
      flow_action: "choose_technique",
      target_state: {
        status: "locked",
        kind: "personal_action",
        plan_item_id: null,
        candidate_value: null,
        locked_value: "ouvrir le dossier administratif",
        needs_user_confirmation: false,
        why_status: "clear",
      },
      blocker_state: {
        status: "locked",
        blocker_type: "unclear_first_step",
        candidate_value: null,
        locked_value: "je ne sais pas par où commencer",
        needs_user_confirmation: false,
        why_status: "clear",
      },
      technique_state: {
        status: "ambiguous",
        technique_key: null,
        technique_label: null,
        explicitly_requested: false,
        candidate_options: [{
          technique_key: "preparer_terrain",
          technique_label: "Preparer le terrain",
          reason: "reduire la friction",
          recommended: true,
        }],
        fit_warning: null,
        needs_user_confirmation: true,
        why_status: "offer",
      },
      visible_task: { kind: "ask_or_confirm_technique" },
    }),
  }).local_state;
  const result = reducePrepareAttackCardLocalDispatcherOutput({
    previous,
    output: decision({
      flow_action: "confirm_technique_proposal",
      visible_task: { kind: "ask_or_confirm_technique" },
    }),
  });
  assertEquals(
    result.local_state?.technique_state.candidate_options[0]?.technique_key,
    "preparer_terrain",
  );
  assert(
    result.state_mutation_audit.rejected_changes.some((change) =>
      change.field === "technique_state" &&
      change.reason_code === "selected_option_missing"
    ),
  );
});

Deno.test("prepare_attack_card valid technique revision replaces and clears fields", () => {
  const previous = reducePrepareAttackCardLocalDispatcherOutput({
    previous: createInitialPrepareAttackCardLocalState(),
    output: {
      ...lockedBase(),
      platform_field_states: [
        lockedPlatformField("ancre_visuelle", 0, "garder mes mails visibles"),
      ],
    },
  }).local_state;
  const result = reducePrepareAttackCardLocalDispatcherOutput({
    previous,
    output: decision({
      flow_action: "revise_technique",
      technique_state: {
        status: "locked",
        technique_key: "texte_recadrage",
        technique_label: "Le texte magique",
        explicitly_requested: true,
        candidate_options: [],
        fit_warning: null,
        needs_user_confirmation: false,
        why_status: "revision",
      },
      visible_task: { kind: "ask_platform_field" },
    }),
  });
  assertEquals(
    result.local_state?.technique_state.technique_key,
    "texte_recadrage",
  );
  assertEquals(
    result.local_state?.platform_field_states.commitment_to_keep_alive,
    undefined,
  );
  assert(
    result.state_mutation_audit.cleared_fields.includes(
      "platform_field_states",
    ),
  );
});

Deno.test("prepare_attack_card legacy active local state stays readable", () => {
  const previous = reducePrepareAttackCardLocalDispatcherOutput({
    previous: createInitialPrepareAttackCardLocalState(),
    output: lockedBase(),
  }).local_state as any;
  delete previous.subskill_history;
  delete previous.last_handoff_delivered;
  delete previous.current_field_id;
  const result = reducePrepareAttackCardLocalDispatcherOutput({
    previous,
    output: decision({
      flow_action: "answer_current_field",
      visible_task: { kind: "ask_platform_field" },
    }),
  });
  assertEquals(result.local_state?.subskill_history, []);
  assertEquals(result.local_state?.flow_id, "prepare_attack_card");
  assert(
    result.state_mutation_audit.server_owned_fields.includes(
      "current_field_id",
    ),
  );
});

Deno.test("prepare_attack_card non-actionable handoff mention does not deliver draft", () => {
  const result = reducePrepareAttackCardLocalDispatcherOutput({
    previous: createInitialPrepareAttackCardLocalState(),
    output: {
      ...lockedBase(),
      flow_action: "handoff_ready",
      platform_field_states: [],
      visible_task: { kind: "handoff_ready" },
    },
  });
  assertEquals(result.draft, null);
  assertEquals(result.status, "clarifying");
  assert(
    result.state_mutation_audit.rejected_changes.some((change) =>
      change.reason_code === "not_stabilized_enough"
    ),
  );
});

Deno.test("prepare_attack_card destination_short and repeat_handoff keep values", () => {
  const previous = reducePrepareAttackCardLocalDispatcherOutput({
    previous: createInitialPrepareAttackCardLocalState(),
    output: lockedBase(),
  }).local_state;
  const repeat = reducePrepareAttackCardLocalDispatcherOutput({
    previous,
    output: decision({
      flow_action: "repeat_handoff",
      visible_task: {
        kind: "repeat_handoff",
      },
    }),
  });
  assertEquals(repeat.status, "repeat_handoff");
  assertEquals(
    repeat.local_state?.target_state.locked_value,
    "écrire mes mails",
  );
});

Deno.test("prepare_attack_card exit_to_global_dispatcher clears local state", () => {
  const result = reducePrepareAttackCardLocalDispatcherOutput({
    previous: createInitialPrepareAttackCardLocalState(),
    output: decision({
      flow_action: "exit_to_global_dispatcher",
      exit_memo: {
        needed: true,
        reason: "topic_change",
        flow_summary: "abandon carte",
        handoff_hint_for_global_dispatcher: "prioriser",
      },
    }),
  });
  assertEquals(result.exit_to_global_dispatcher, true);
  assertEquals(result.local_state, null);
});

Deno.test("prepare_attack_card technique labels are exact", () => {
  assertEquals(ATTACK_CARD_TECHNIQUE_LABELS, {
    texte_recadrage: "Le texte magique",
    mantra_force: "Mantra de force",
    ancre_visuelle: "Ancre visuelle",
    visualisation_matinale: "Meditation de 5 minutes",
    preparer_terrain: "Preparer le terrain",
    pre_engagement: "Mot de bascule",
  });
});

Deno.test("prepare_attack_card visible guard allows canonical technique options before lock", () => {
  const result = reducePrepareAttackCardLocalDispatcherOutput({
    previous: createInitialPrepareAttackCardLocalState(),
    output: decision({
      flow_action: "choose_technique",
      target_state: {
        status: "locked",
        kind: "personal_action",
        plan_item_id: null,
        candidate_value: null,
        locked_value: "ouvrir le dossier administratif",
        needs_user_confirmation: false,
        why_status: "clear",
      },
      blocker_state: {
        status: "locked",
        blocker_type: "procrastination",
        candidate_value: null,
        locked_value: "trier mes notes au lieu d'ouvrir le dossier",
        needs_user_confirmation: false,
        why_status: "clear",
      },
      technique_state: {
        status: "ambiguous",
        technique_key: null,
        technique_label: null,
        explicitly_requested: false,
        candidate_options: [
          {
            technique_key: "texte_recadrage",
            technique_label: "Le texte magique",
            reason: "recadrer la negociation",
            recommended: true,
          },
          {
            technique_key: "ancre_visuelle",
            technique_label: "Ancre visuelle",
            reason: "rendre le dossier visible",
            recommended: false,
          },
        ],
        fit_warning: null,
        needs_user_confirmation: true,
        why_status: "two useful options",
      },
      visible_task: {
        kind: "ask_or_confirm_technique",
      },
    }),
  });
  const issues = prepareAttackCardVisibleContractIssues(
    "Je vois deux options utiles: Le texte magique ou Ancre visuelle. Laquelle te parle le plus ?",
    visibleInput("ask_or_confirm_technique", result.visible_task_context),
  );
  assertEquals(issues.includes("wrong_technique_label"), false);
});

Deno.test("prepare_attack_card visible guard rejects technique labels outside candidate options", () => {
  const result = reducePrepareAttackCardLocalDispatcherOutput({
    previous: createInitialPrepareAttackCardLocalState(),
    output: decision({
      flow_action: "choose_technique",
      target_state: {
        status: "locked",
        kind: "personal_action",
        plan_item_id: null,
        candidate_value: null,
        locked_value: "ranger mes papiers demain matin",
        needs_user_confirmation: false,
        why_status: "confirmed",
      },
      blocker_state: {
        status: "locked",
        blocker_type: "unclear_first_step",
        candidate_value: null,
        locked_value:
          "je ne sais pas par quelle pile commencer et je repousse quand il y a trop de papiers",
        needs_user_confirmation: false,
        why_status: "confirmed",
      },
      technique_state: {
        status: "ambiguous",
        technique_key: null,
        technique_label: null,
        explicitly_requested: false,
        candidate_options: [{
          technique_key: "preparer_terrain",
          technique_label: "Preparer le terrain",
          reason: "reduire la friction de demarrage",
          recommended: true,
        }, {
          technique_key: "texte_recadrage",
          technique_label: "Le texte magique",
          reason: "recadrer l'evitement",
          recommended: false,
        }, {
          technique_key: "visualisation_matinale",
          technique_label: "Meditation de 5 minutes",
          reason: "anticiper le demarrage du matin",
          recommended: false,
        }],
        fit_warning: null,
        needs_user_confirmation: true,
        why_status: "three useful candidates",
      },
      visible_task: {
        kind: "ask_or_confirm_technique",
      },
    }),
  });
  const issues = prepareAttackCardVisibleContractIssues(
    "Quelle technique preferes-tu : Le texte magique, Mantra de force, Ancre visuelle, Meditation de 5 minutes, Preparer le terrain ou Mot de bascule ?",
    visibleInput("ask_or_confirm_technique", result.visible_task_context),
  );
  assertEquals(
    issues.includes(
      "technique_label_outside_candidate_options:Mantra de force",
    ),
    true,
  );
  assertEquals(
    issues.includes(
      "technique_label_outside_candidate_options:Mot de bascule",
    ),
    true,
  );
});

Deno.test("prepare_attack_card visible guard does not hard reject technique label wording", () => {
  const result = reducePrepareAttackCardLocalDispatcherOutput({
    previous: createInitialPrepareAttackCardLocalState(),
    output: lockedBase(),
  });
  const issues = prepareAttackCardVisibleContractIssues(
    "On va plutôt utiliser Le texte magique pour ce champ.",
    visibleInput("ask_platform_field", result.visible_task_context),
  );
  assertEquals(issues.includes("wrong_technique_label"), false);
});

Deno.test("prepare_attack_card visible guard blocks creation claims", () => {
  const issues = prepareAttackCardVisibleContractIssues(
    "C'est créé dans Cartes d'attaque.",
    visibleInput("apply_attempt"),
  );
  assert(issues.some((issue) => issue.startsWith("forbidden_creation_claim")));
});

Deno.test("prepare_attack_card visible guard accepts non-creation boundary variants", () => {
  const issues = prepareAttackCardVisibleContractIssues(
    "Je ne peux pas la créer ici. Reprends-la dans Cartes d'attaque.",
    visibleInput("apply_attempt"),
  );
  assertEquals(issues, []);
});

Deno.test("prepare_attack_card visible guard blocks revision persistence claims", () => {
  const first = reducePrepareAttackCardLocalDispatcherOutput({
    previous: createInitialPrepareAttackCardLocalState(),
    output: {
      ...lockedBase(),
      platform_field_states: [{
        field_id: "commitment_to_keep_alive",
        technique_key: "ancre_visuelle",
        field_label:
          ATTACK_CARD_PLATFORM_FIELD_DEFINITIONS.ancre_visuelle[0].field_label,
        status: "locked",
        candidate_value: null,
        locked_value: "ancienne phrase",
        previous_value: null,
        needs_user_confirmation: false,
        why_status: "clear",
      }],
    },
  });
  const second = reducePrepareAttackCardLocalDispatcherOutput({
    previous: first.local_state,
    output: decision({
      flow_action: "revise_current_field",
      technique_state: first.local_state!.technique_state,
      platform_field_states: [{
        field_id: "commitment_to_keep_alive",
        technique_key: "ancre_visuelle",
        field_label:
          ATTACK_CARD_PLATFORM_FIELD_DEFINITIONS.ancre_visuelle[0].field_label,
        status: "locked",
        candidate_value: null,
        locked_value: "nouvelle phrase",
        previous_value: "ancienne phrase",
        needs_user_confirmation: false,
        why_status: "revision",
      }],
      visible_task: {
        kind: "revision_done",
      },
    }),
  });
  const fieldLabel =
    ATTACK_CARD_PLATFORM_FIELD_DEFINITIONS.ancre_visuelle[0].field_label;
  const issues = prepareAttackCardVisibleContractIssues(
    `C'est noté. Dans Cartes d'attaque, Ancre visuelle, ${fieldLabel}: nouvelle phrase`,
    visibleInput("revision_done", second.visible_task_context),
  );
  assert(
    issues.some((issue) =>
      issue.startsWith("forbidden_revision_persistence_claim")
    ),
  );
});

Deno.test("prepare_attack_card local runtime exit stores memo for global dispatcher", async () => {
  const runtime = await maybeRunPrepareAttackCardOperation({
    supabase: {} as any,
    userId: "u1",
    userMessage: "laisse tomber la carte, aide-moi plutôt à prioriser ce soir",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {},
    turnFrame: null,
    routeDecision: {
      response_owner: "tool_skill",
      selected_handler: "prepare_attack_card",
    } as any,
    safetyContextOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-exit",
    runLocalDispatcher: async () =>
      decision({
        flow_action: "exit_to_global_dispatcher",
        visible_task: {
          kind: "exit_or_cancel",
        },
        exit_memo: {
          needed: true,
          reason: "topic_change",
          flow_summary: "carte d'attaque mise de côté",
          handoff_hint_for_global_dispatcher: "prioriser ce soir",
        },
      }),
  });
  assertEquals(
    (runtime?.toolSkillRun as any)?.reason_code,
    "prepare_attack_card_local_exit_to_global_dispatcher",
  );
  assertEquals(runtime?.toolExecution, "none");
  assertEquals(
    (runtime?.nextTempMemory as any).__last_prepare_attack_card_exit_memo
      .handoff_hint_for_global_dispatcher,
    "prioriser ce soir",
  );
});

Deno.test("prepare_attack_card local runtime returns no executable confirmation", async () => {
  const output = lockedBase();
  const runtime = await maybeRunPrepareAttackCardOperation({
    supabase: {} as any,
    userId: "u1",
    userMessage: "je veux une ancre visuelle pour écrire mes mails",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {},
    turnFrame: {
      tool_skill_intents: [{
        operation_type: "prepare_attack_card",
        confidence_band: "high",
        explicitness: "explicit",
        ambiguity: "none",
      }],
    } as any,
    routeDecision: {
      response_owner: "tool_skill",
      selected_handler: "prepare_attack_card",
    } as any,
    safetyContextOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-local",
    runLocalDispatcher: async () => output,
    runVisibleAgent: async () => "Je te prépare ça dans Cartes d'attaque.",
  });
  assertEquals(runtime?.executedTools, []);
  assertEquals((runtime?.toolSkillRun as any)?.committed_effects, []);
  assertEquals((runtime?.toolSkillRun as any)?.pending_confirmation, undefined);
  assertEquals((runtime?.toolSkillRun as any)?.platform_handoff, undefined);
});

Deno.test("prepare_attack_card local runtime blocks apply attempt", async () => {
  const runtime = await maybeRunPrepareAttackCardOperation({
    supabase: {} as any,
    userId: "u1",
    userMessage: "ok crée-la",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {},
    turnFrame: {
      tool_skill_intents: [{
        operation_type: "prepare_attack_card",
        confidence_band: "high",
        explicitness: "explicit",
        ambiguity: "none",
      }],
    } as any,
    routeDecision: {
      response_owner: "tool_skill",
      selected_handler: "prepare_attack_card",
    } as any,
    safetyContextOutput: { risk_band: "none" } as any,
    sourceMessageId: "m-apply",
    runLocalDispatcher: async () =>
      decision({
        flow_action: "apply_attempt",
        visible_task: {
          kind: "apply_attempt",
        },
      }),
    runVisibleAgent: async () =>
      "Je ne crée pas la carte depuis le chat. Reprends-la dans Cartes d'attaque.",
  });
  assertEquals(runtime?.executedTools, []);
  assertEquals((runtime?.toolSkillRun as any)?.status, "apply_attempt");
  assertEquals(
    (runtime?.toolSkillRun as any)?.blocked_effects[0].reason_code,
    "chat_creation_disabled_platform_handoff",
  );
});

Deno.test("prepare_attack_card safety_preempt blocks coaching handoff", () => {
  const result = reducePrepareAttackCardLocalDispatcherOutput({
    previous: createInitialPrepareAttackCardLocalState(),
    output: decision({
      flow_action: "safety_preempt",
      risk_assessment: {
        risk_score: 9,
        risk_band: "high",
        safety_preempt: true,
        reason_codes: ["safety"],
      },
      visible_task: {
        kind: "safety",
      },
    }),
  });
  assertEquals(result.status, "blocked");
  assertEquals(result.visible_task, "safety_transition");
});

Deno.test("prepare_attack_card handoff_ready requires locked technique fields", () => {
  const result = reducePrepareAttackCardLocalDispatcherOutput({
    previous: createInitialPrepareAttackCardLocalState(),
    output: {
      ...lockedBase(),
      flow_action: "handoff_ready",
      platform_field_states: [{
        field_id: "commitment_to_keep_alive",
        technique_key: "ancre_visuelle",
        field_label:
          ATTACK_CARD_PLATFORM_FIELD_DEFINITIONS.ancre_visuelle[0].field_label,
        status: "locked",
        candidate_value: null,
        locked_value: "garder l'engagement mail vivant",
        previous_value: null,
        needs_user_confirmation: false,
        why_status: "clear",
      }, {
        field_id: "anchor_location",
        technique_key: "ancre_visuelle",
        field_label:
          ATTACK_CARD_PLATFORM_FIELD_DEFINITIONS.ancre_visuelle[1].field_label,
        status: "locked",
        candidate_value: null,
        locked_value: "sur mon écran",
        previous_value: null,
        needs_user_confirmation: false,
        why_status: "clear",
      }, {
        field_id: "visual_phrase",
        technique_key: "ancre_visuelle",
        field_label:
          ATTACK_CARD_PLATFORM_FIELD_DEFINITIONS.ancre_visuelle[2].field_label,
        status: "locked",
        candidate_value: null,
        locked_value: "un mail envoyé vaut mieux qu'un mail parfait",
        previous_value: null,
        needs_user_confirmation: false,
        why_status: "clear",
      }],
      visible_task: {
        kind: "handoff_ready",
      },
    },
  });
  assertEquals(result.status, "handoff_delivered");
  assertEquals(result.draft?.platform_handoff?.inputs.length, 3);
  assertEquals(
    result.draft?.platform_handoff?.technique_label,
    "Ancre visuelle",
  );
});

Deno.test("prepare_attack_card get_info_product preserves local flow context", () => {
  const result = reducePrepareAttackCardLocalDispatcherOutput({
    previous: createInitialPrepareAttackCardLocalState(),
    output: decision({
      flow_action: "get_info_product",
      visible_task: {
        kind: "none",
      },
      subskill_call: {
        needed: true,
        skill_id: "product_help",
        reason: "Le user demande comment fonctionnent les cartes d'attaque.",
        context_for_subskill: {
          active_flow: "prepare_attack_card",
          question_to_answer:
            "Expliquer quelles cartes d'attaque existent et comment choisir.",
          active_flow_context: {
            flow_kind: "free_attack_card",
            current_field_id: null,
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
  assertEquals(result.subskill_context?.active_flow, "prepare_attack_card");
  assertEquals(
    result.subskill_context?.question_to_answer,
    "Expliquer quelles cartes d'attaque existent et comment choisir.",
  );
});

Deno.test("prepare_attack_card get_info_db preserves local flow context", () => {
  const result = reducePrepareAttackCardLocalDispatcherOutput({
    previous: createInitialPrepareAttackCardLocalState(),
    output: decision({
      flow_action: "get_info_db",
      visible_task: {
        kind: "none",
      },
      subskill_call: {
        needed: true,
        skill_id: "status_recap",
        reason: "Le user demande quelles cartes d'attaque sont actives.",
        context_for_subskill: {
          active_flow: "prepare_attack_card",
          question_to_answer:
            "Lister les cartes d'attaque libres déjà actives pour le user.",
          active_flow_context: {
            target_state: { status: "missing" },
            technique_state: { status: "missing" },
          },
        },
      },
    }),
  });

  assertEquals(result.get_info_product, false);
  assertEquals(result.get_info_db, true);
  assertEquals(result.visible_task, "none");
  assertEquals(result.status, "collecting");
  assertEquals(result.subskill_context?.active_flow, "prepare_attack_card");
  assertEquals(
    result.subskill_context?.question_to_answer,
    "Lister les cartes d'attaque libres déjà actives pour le user.",
  );
});

Deno.test("prepare_attack_card exit_to_global_dispatcher emits global note", () => {
  const result = reducePrepareAttackCardLocalDispatcherOutput({
    previous: createInitialPrepareAttackCardLocalState(),
    output: decision({
      flow_action: "exit_to_global_dispatcher",
      visible_task: {
        kind: "stop_or_cancel",
      },
      exit_memo: {
        needed: true,
        reason: "topic_change",
        flow_summary: "prepare_attack_card stopped before handoff.",
        handoff_hint_for_global_dispatcher: "resume global routing",
      },
    }),
  });

  assertEquals(result.exit_to_global_dispatcher, true);
  assertEquals(result.handoff_to_local_flow, false);
  assertEquals(result.note_information?.target_dispatcher, "global");
  assertEquals(result.visible_task, "exit_ack");
  assertEquals(result.local_state, null);
});

Deno.test("prepare_attack_card reducer emits visible conversation_context", () => {
  const result = reducePrepareAttackCardLocalDispatcherOutput({
    previous: createInitialPrepareAttackCardLocalState(),
    output: lockedBase(),
  });

  assertEquals(
    result.visible_task_context.known_values.target.locked_value,
    "écrire mes mails",
  );
  assertEquals(
    result.visible_task_context.known_values.blocker.locked_value,
    "je repousse quand ça semble trop long",
  );
  assertEquals(
    (result.visible_task_context.handoff_data as any).executable_from_chat,
    undefined,
  );
  assertEquals(
    result.visible_task_context.handoff_data.platform_destination,
    "",
  );
  assertEquals(result.visible_task_context.handoff_data.platform_steps, []);
});

Deno.test("prepare_attack_card intake stages do not expose platform handoff steps", () => {
  const result = reducePrepareAttackCardLocalDispatcherOutput({
    previous: createInitialPrepareAttackCardLocalState(),
    output: decision({
      flow_action: "confirm_candidate",
      target_state: {
        status: "proposed",
        kind: null,
        plan_item_id: null,
        candidate_value: "faire ma déclaration d'impôts demain",
        locked_value: null,
        needs_user_confirmation: true,
        why_status: "target candidate",
      },
      visible_task: {
        kind: "confirm_target_candidate",
      },
    }),
  });

  assertEquals(result.visible_task, "confirm_target_candidate");
  assertEquals(
    result.visible_task_context.handoff_data.platform_destination,
    "",
  );
  assertEquals(result.visible_task_context.handoff_data.platform_steps, []);
});

Deno.test("prepare_attack_card visible guard does not hard reject premature handoff wording", () => {
  const result = reducePrepareAttackCardLocalDispatcherOutput({
    previous: createInitialPrepareAttackCardLocalState(),
    output: decision({
      flow_action: "confirm_candidate",
      target_state: {
        status: "proposed",
        kind: null,
        plan_item_id: null,
        candidate_value: "faire ma déclaration d'impôts demain",
        locked_value: null,
        needs_user_confirmation: true,
        why_status: "target candidate",
      },
      visible_task: {
        kind: "confirm_target_candidate",
      },
    }),
  });
  const issues = prepareAttackCardVisibleContractIssues(
    "Est-ce bien cette cible ? Pour continuer, va dans Cartes d’attaque et reprends le brouillon proposé.",
    {
      user_id: "u1",
      stage: "confirm_target_candidate",
      visible_task: {
        kind: "confirm_target_candidate",
        conversation_context: result.visible_task_context,
      },
    },
  );

  assertEquals(
    issues.some((issue) => issue.startsWith("premature_platform_handoff")),
    false,
  );
});

Deno.test("prepare_attack_card local runtime passes only conversation_context to visible agent", async () => {
  let dispatcherSawInboundNote = false;
  let visibleSawConversationContext = false;
  const runtime = await maybeRunPrepareAttackCardOperation({
    supabase: {} as any,
    userId: "u1",
    userMessage: "Je veux une carte d'attaque pour écrire mes mails.",
    channel: "web",
    userTimezone: "Europe/Paris",
    tempMemory: {},
    turnFrame: null,
    routeDecision: {
      route_version: "v1",
      response_owner: "tool_skill",
      selected_handler: "prepare_attack_card",
      blocked_paths: [],
      direct_effects_to_run: [],
      reason_code: "tool_skill_intent_start",
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
    },
    safetyContextOutput: {
      detected: false,
      risk_band: "none",
      reason_codes: [],
      evidence: [],
      allow_side_effects: true,
      layer_contributions: {},
    } as any,
    sourceMessageId: "m1",
    runLocalDispatcher: async (input) => {
      dispatcherSawInboundNote = Boolean(input.note_information_inbound);
      return decision({
        target_state: {
          status: "locked",
          kind: "personal_action",
          plan_item_id: null,
          candidate_value: null,
          locked_value: "écrire mes mails",
          needs_user_confirmation: false,
          why_status: "clear",
        },
        visible_task: {
          kind: "ask_blocker",
        },
      });
    },
    runVisibleAgent: async (input) => {
      visibleSawConversationContext = Boolean(
        input.visible_task.conversation_context,
      );
      assertEquals(Object.keys(input).sort(), [
        "request_id",
        "stage",
        "trace_event",
        "user_id",
        "visible_task",
      ]);
      return "Qu'est-ce qui te fait repousser ces mails au moment de t'y mettre ?";
    },
  });

  assertEquals(dispatcherSawInboundNote, true);
  assertEquals(visibleSawConversationContext, true);
  assertEquals(runtime?.toolSkillRun.selected_handler, "prepare_attack_card");
});

Deno.test("prepare_attack_card router nominal path uses local dispatcher reducer and visible agent", async () => {
  const source = await Deno.readTextFile(
    "supabase/functions/sophia-brain/tools/operations/prepare_attack_card/router.ts",
  );
  assertEquals(source.includes("runPrepareAttackCardLocalDispatcher"), true);
  assertEquals(
    source.includes("reducePrepareAttackCardLocalDispatcherOutput"),
    true,
  );
  assertEquals(source.includes("runPrepareAttackCardVisibleAgent"), true);
});
