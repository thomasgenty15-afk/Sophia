import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import type { ClarteDispatcherOutput } from "../contract.ts";
import {
  createInitialClarteState,
  normalizeClarteDispatcherOutput,
  reduceClarteDispatcherOutput,
} from "./clarte_flow.ts";

function decision(
  overrides: Partial<ClarteDispatcherOutput>,
): ClarteDispatcherOutput {
  const fieldState = overrides.field_state ?? {
    status: "missing",
    candidate_value: null,
    locked_value: null,
    previous_value: null,
    needs_user_confirmation: false,
    why_status: "test",
  };
  return {
    flow_action: overrides.flow_action ?? "answer_current_field",
    confidence: overrides.confidence ?? "high",
    selected_potion: "clarte",
    field_id: "plan_meaning_loss_reason",
    field_state: fieldState,
    revision: overrides.revision ?? {
      is_revision: false,
      replacement_value: null,
      replaces_previous_value: false,
    },
    visible_task: overrides.visible_task ?? {
      kind: fieldState.status === "locked"
        ? "handoff_ready"
        : fieldState.status === "proposed"
        ? "confirm_proposal"
        : "ask_deeper",
    },
    subskill_call: overrides.subskill_call ?? {
      needed: false,
      skill_id: null,
      reason: null,
      context_for_subskill: {},
    },
    exit_memo: overrides.exit_memo ?? {
      needed: false,
      reason: "none",
      flow_summary: null,
      collected_value: fieldState.locked_value ?? fieldState.candidate_value,
      handoff_hint_for_global_dispatcher: null,
    },
    risk_assessment: overrides.risk_assessment ?? {
      risk_score: 0,
      risk_band: "none",
      safety_preempt: false,
      reason_codes: [],
    },
    evidence: overrides.evidence ?? ["test"],
  };
}

Deno.test("clarte reducer keeps vague answer missing", () => {
  const state = createInitialClarteState(null);
  const reduced = reduceClarteDispatcherOutput({
    previous: state,
    decision: decision({
      field_state: {
        status: "missing",
        candidate_value: null,
        locked_value: null,
        previous_value: null,
        needs_user_confirmation: false,
        why_status: "Réponse trop vague : je suis en vrac.",
      },
    }),
  });

  assertEquals(reduced.status, "clarifying");
  assertEquals(reduced.visible_task, "ask_deeper");
  assertEquals(reduced.draft, null);
  assertEquals(reduced.clarte_state?.field_state.status, "missing");
});

Deno.test("clarte reducer locks clear answer and builds platform input", () => {
  const value =
    "Je fais les actions, mais je ne sens plus pourquoi elles comptent.";
  const reduced = reduceClarteDispatcherOutput({
    previous: createInitialClarteState(null),
    decision: decision({
      field_state: {
        status: "locked",
        candidate_value: null,
        locked_value: value,
        previous_value: null,
        needs_user_confirmation: false,
        why_status: "Réponse claire.",
      },
    }),
  });

  assertEquals(reduced.status, "handoff_delivered");
  assertEquals(reduced.visible_task, "handoff_ready");
  assertEquals(
    reduced.draft?.recommendation.platform_inputs?.answers[0].question_id,
    "plan_meaning_loss_reason",
  );
  assertEquals(
    reduced.draft?.recommendation.platform_inputs?.answers[0].value,
    value,
  );
});

Deno.test("clarte reducer waits on proposed value then confirms it", () => {
  const proposed =
    "Je fais les actions du plan, mais je ne sens plus pourquoi elles comptent pour moi aujourd’hui.";
  const proposal = reduceClarteDispatcherOutput({
    previous: createInitialClarteState(null),
    decision: decision({
      field_state: {
        status: "proposed",
        candidate_value: proposed,
        locked_value: null,
        previous_value: null,
        needs_user_confirmation: true,
        why_status: "Presque clair.",
      },
    }),
  });

  assertEquals(proposal.status, "clarifying");
  assertEquals(proposal.visible_task, "confirm_proposal");
  assertEquals(proposal.clarte_state?.field_state.candidate_value, proposed);

  const confirmed = reduceClarteDispatcherOutput({
    previous: proposal.clarte_state!,
    decision: decision({ flow_action: "confirm_proposed_field" }),
  });

  assertEquals(confirmed.status, "handoff_delivered");
  assertEquals(confirmed.clarte_state?.field_state.locked_value, proposed);
});

Deno.test("clarte reducer revision replaces locked platform value", () => {
  const oldValue = "Je ne vois plus le lien avec mon pourquoi.";
  const newValue =
    "Je fais les actions, mais je ne sens plus pourquoi elles comptent pour moi aujourd'hui.";
  const previous = {
    ...createInitialClarteState(null),
    field_state: {
      status: "locked" as const,
      candidate_value: null,
      locked_value: oldValue,
      previous_value: null,
      needs_user_confirmation: false,
      why_status: "old",
    },
  };
  const reduced = reduceClarteDispatcherOutput({
    previous,
    decision: decision({
      flow_action: "revise_current_field",
      field_state: {
        status: "locked",
        candidate_value: null,
        locked_value: newValue,
        previous_value: oldValue,
        needs_user_confirmation: false,
        why_status: "revision",
      },
      revision: {
        is_revision: true,
        replacement_value: newValue,
        replaces_previous_value: true,
      },
    }),
  });

  assertEquals(reduced.visible_task, "revision_done");
  assertEquals(reduced.clarte_state?.field_state.locked_value, newValue);
  assertEquals(reduced.clarte_state?.field_state.previous_value, oldValue);
  assertEquals(
    reduced.draft?.recommendation.platform_inputs?.answers[0].value,
    newValue,
  );
});

Deno.test("clarte reducer apply attempt does not mutate locked value", () => {
  const value = "Mon plan est devenu mécanique.";
  const previous = {
    ...createInitialClarteState(null),
    field_state: {
      status: "locked" as const,
      candidate_value: null,
      locked_value: value,
      previous_value: null,
      needs_user_confirmation: false,
      why_status: "locked",
    },
  };
  const reduced = reduceClarteDispatcherOutput({
    previous,
    decision: decision({ flow_action: "apply_attempt" }),
  });

  assertEquals(reduced.status, "apply_attempt");
  assertEquals(reduced.visible_task, "apply_attempt");
  assertEquals(reduced.clarte_state?.field_state.locked_value, value);
  assertStringIncludes(
    reduced.reason_code,
    "no_chat_execution",
  );
});

Deno.test("clarte reducer exposes local safety risk assessment", () => {
  const reduced = reduceClarteDispatcherOutput({
    previous: createInitialClarteState(null),
    decision: decision({
      flow_action: "safety_preempt",
      risk_assessment: {
        risk_score: 9,
        risk_band: "high",
        safety_preempt: true,
        reason_codes: ["local_dispatcher_safety"],
      },
    }),
  });

  assertEquals(reduced.status, "blocked");
  assertEquals(reduced.visible_task, "safety");
  assertEquals(reduced.exit_to_global_dispatcher, false);
  assertEquals(reduced.risk_assessment.risk_score, 9);
  assertEquals(reduced.risk_assessment.safety_preempt, true);
});

Deno.test("clarte reducer stop exits to global dispatcher with note", () => {
  const previous = createInitialClarteState(null);
  const reduced = reduceClarteDispatcherOutput({
    previous,
    decision: decision({
      flow_action: "exit_to_global_dispatcher",
      visible_task: {
        kind: "exit",
      },
      exit_memo: {
        needed: true,
        reason: "topic_change",
        flow_summary: "Potion de clarté arrêtée.",
        collected_value: null,
        handoff_hint_for_global_dispatcher:
          "Le user demande d'arreter le sous-flow clarté.",
      },
    }),
  });

  assertEquals(reduced.status, "topic_change");
  assertEquals(reduced.visible_task, "exit");
  assertEquals(reduced.exit_to_global_dispatcher, true);
  assertEquals(reduced.clarte_state?.last_visible_task, "exit");
  assertEquals(reduced.reason_code, "clarte_flow_topic_change");
});

Deno.test("clarte reducer topic change exits to global dispatcher", () => {
  const previous = createInitialClarteState(null);
  const reduced = reduceClarteDispatcherOutput({
    previous,
    decision: decision({
      flow_action: "exit_to_global_dispatcher",
      visible_task: {
        kind: "exit",
      },
      exit_memo: {
        needed: true,
        reason: "topic_change",
        flow_summary: "Potion de clarté interrompue.",
        collected_value: null,
        handoff_hint_for_global_dispatcher:
          "Le user demande maintenant un rappel ponctuel.",
      },
    }),
  });

  assertEquals(reduced.status, "topic_change");
  assertEquals(reduced.visible_task, "exit");
  assertEquals(reduced.exit_to_global_dispatcher, true);
  assertEquals(reduced.clarte_state?.last_visible_task, "exit");
  assertEquals(reduced.reason_code, "clarte_flow_topic_change");
});

Deno.test("clarte reducer routes product help inline with local context", () => {
  const reduced = reduceClarteDispatcherOutput({
    previous: createInitialClarteState(null),
    decision: decision({
      flow_action: "get_info_product",
      visible_task: {
        kind: "none",
      },
      subskill_call: {
        needed: true,
        skill_id: "product_help",
        reason: "Le user demande comment fonctionne la Potion de clarté.",
        context_for_subskill: {
          active_flow: "select_state_potion.clarte",
          question_to_answer:
            "Expliquer la Potion de clarté sans quitter le sous-flow actif.",
          active_flow_context: {
            selected_potion: "clarte",
            field_state: { status: "missing" },
          },
        },
      },
    }),
  });

  assertEquals(reduced.get_info_product, true);
  assertEquals(reduced.get_info_db, false);
  assertEquals(reduced.visible_task, "none");
  assertEquals(reduced.status, "collecting");
  assertEquals(reduced.clarte_state?.last_visible_task, "none");
  assertEquals(
    reduced.subskill_context?.active_flow,
    "select_state_potion.clarte",
  );
});

Deno.test("clarte reducer routes status recap inline with local context", () => {
  const reduced = reduceClarteDispatcherOutput({
    previous: createInitialClarteState(null),
    decision: decision({
      flow_action: "get_info_db",
      visible_task: {
        kind: "none",
      },
      subskill_call: {
        needed: true,
        skill_id: "status_recap",
        reason: "Le user demande quelles potions existent deja.",
        context_for_subskill: {
          active_flow: "select_state_potion.clarte",
          question_to_answer:
            "Lister les potions existantes utiles au contexte clarté.",
          active_flow_context: {
            selected_potion: "clarte",
            field_state: { status: "missing" },
          },
        },
      },
    }),
  });

  assertEquals(reduced.get_info_product, false);
  assertEquals(reduced.get_info_db, true);
  assertEquals(reduced.visible_task, "none");
  assertEquals(reduced.status, "collecting");
  assertEquals(
    reduced.subskill_context?.active_flow,
    "select_state_potion.clarte",
  );
});

Deno.test("clarte reducer preserves bridge context on next turn", () => {
  const originBridgeContext = {
    origin_flow: "purpose_anchor",
    selected_potion: "clarte",
    note_information: {
      target_flow: "select_state_potion.clarte",
    },
  };
  const previous = createInitialClarteState(null, originBridgeContext);
  const reduced = reduceClarteDispatcherOutput({
    previous,
    decision: decision({
      field_state: {
        status: "proposed",
        candidate_value: "Je ne comprends plus pourquoi ce plan compte.",
        locked_value: null,
        previous_value: null,
        needs_user_confirmation: true,
        why_status: "Proposition à confirmer.",
      },
    }),
  });

  assertEquals(
    reduced.clarte_state?.origin_bridge_context,
    originBridgeContext,
  );
  assertEquals(
    reduced.state_mutation_audit.preserved_fields.includes(
      "origin_bridge_context",
    ),
    true,
  );
});

Deno.test("clarte reducer preserves filled slot on invalid clarification", () => {
  const value = "Je fais les actions, mais elles n'ont plus de sens pour moi.";
  const previous = {
    ...createInitialClarteState(null),
    field_state: {
      status: "locked" as const,
      candidate_value: null,
      locked_value: value,
      previous_value: null,
      needs_user_confirmation: false,
      why_status: "locked",
    },
  };
  const reduced = reduceClarteDispatcherOutput({
    previous,
    decision: decision({
      field_state: {
        status: "missing",
        candidate_value: null,
        locked_value: null,
        previous_value: null,
        needs_user_confirmation: false,
        why_status: "Clarification invalide.",
      },
    }),
  });

  assertEquals(reduced.clarte_state?.field_state.locked_value, value);
  assertEquals(reduced.visible_task, "handoff_ready");
  assertEquals(
    reduced.state_mutation_audit.restored_fields.includes("field_state"),
    true,
  );
});

Deno.test("clarte reducer invalid confirmation keeps pending field", () => {
  const previous = createInitialClarteState(null);
  const reduced = reduceClarteDispatcherOutput({
    previous,
    decision: decision({
      flow_action: "confirm_proposed_field",
      field_state: {
        status: "locked",
        candidate_value: null,
        locked_value: null,
        previous_value: null,
        needs_user_confirmation: false,
        why_status: "Confirmation sans proposition.",
      },
    }),
  });

  assertEquals(reduced.reason_code, "clarte_pending_confirmation_missing");
  assertEquals(reduced.clarte_state?.field_state.status, "missing");
  assertEquals(
    reduced.state_mutation_audit.rejected_changes.some((item) =>
      item.reason_code === "pending_confirmation_missing"
    ),
    true,
  );
});

Deno.test("clarte reducer explicit revision replaces only the field", () => {
  const originBridgeContext = { origin_flow: "purpose_anchor" };
  const oldValue = "Je ne vois plus le lien avec mon pourquoi.";
  const newValue =
    "Je fais les actions, mais je ne sens plus pourquoi elles comptent.";
  const previous = {
    ...createInitialClarteState(null, originBridgeContext),
    field_state: {
      status: "locked" as const,
      candidate_value: null,
      locked_value: oldValue,
      previous_value: null,
      needs_user_confirmation: false,
      why_status: "old",
    },
  };
  const reduced = reduceClarteDispatcherOutput({
    previous,
    decision: decision({
      flow_action: "revise_current_field",
      revision: {
        is_revision: true,
        replacement_value: newValue,
        replaces_previous_value: true,
      },
    }),
  });

  assertEquals(reduced.clarte_state?.field_state.locked_value, newValue);
  assertEquals(
    reduced.clarte_state?.origin_bridge_context,
    originBridgeContext,
  );
  assertEquals(
    reduced.state_mutation_audit.applied_fields.includes("field_state"),
    true,
  );
});

Deno.test("clarte normalizer does not let another potion replace selection", () => {
  const normalized = normalizeClarteDispatcherOutput({
    flow_action: "answer_current_field",
    confidence: "high",
    selected_potion: "amour",
    field_id: "plan_meaning_loss_reason",
    field_state: {
      status: "missing",
      candidate_value: null,
      locked_value: null,
      previous_value: null,
      needs_user_confirmation: false,
      why_status: "Mention non corrective d'une autre potion.",
    },
    revision: {
      is_revision: false,
      replacement_value: null,
      replaces_previous_value: false,
    },
    visible_task: { kind: "ask_deeper" },
    exit_memo: {
      needed: false,
      reason: "none",
      flow_summary: null,
      collected_value: null,
      handoff_hint_for_global_dispatcher: null,
    },
    risk_assessment: {
      risk_score: 0,
      risk_band: "none",
      safety_preempt: false,
      reason_codes: [],
    },
    evidence: ["test"],
  });

  assertEquals(normalized.selected_potion, "clarte");
});

Deno.test("clarte reducer delivered handoff closes stage with audit", () => {
  const value = "Je veux comprendre pourquoi ce plan ne me parle plus.";
  const reduced = reduceClarteDispatcherOutput({
    previous: createInitialClarteState(null),
    decision: decision({
      field_state: {
        status: "locked",
        candidate_value: null,
        locked_value: value,
        previous_value: null,
        needs_user_confirmation: false,
        why_status: "Réponse claire.",
      },
    }),
  });

  assertEquals(reduced.status, "handoff_delivered");
  assertEquals(reduced.clarte_state?.last_handoff_delivered, true);
  assertEquals(
    reduced.state_mutation_audit.applied_fields.includes(
      "last_handoff_delivered",
    ),
    true,
  );
});
