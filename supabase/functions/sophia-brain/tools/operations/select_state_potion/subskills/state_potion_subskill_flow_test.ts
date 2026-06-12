import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import type {
  StatePotionSubskillDispatcherOutput,
  StatePotionSubskillPotionType,
} from "../contract.ts";
import {
  createInitialStatePotionSubskillState,
  reduceStatePotionSubskillDispatcherOutput,
} from "./state_potion_subskill_flow.ts";

function risk() {
  return {
    risk_score: 0,
    risk_band: "none" as const,
    safety_preempt: false,
    reason_codes: [],
  };
}

function baseDecision(
  patch: Partial<StatePotionSubskillDispatcherOutput>,
): StatePotionSubskillDispatcherOutput {
  return {
    flow_action: "answer_current_field",
    confidence: "high",
    selected_potion: "apaisement",
    current_field_id: "pressure_source",
    field_states: [],
    revision: {
      is_revision: false,
      field_id: null,
      replacement_value: null,
      option_value: null,
      option_label: null,
      replaces_previous_value: false,
    },
    visible_task: {
      kind: "ask_deeper",
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
      collected_value: null,
      handoff_hint_for_global_dispatcher: null,
    },
    no_chat_mutation: {
      potion_session_created: false,
      recurring_reminder_created: false,
      scheduled_checkin_created: false,
      executable_confirmation_generated: false,
    },
    risk_assessment: risk(),
    evidence: ["test"],
    ...patch,
  };
}

const LOCAL_SUBSKILL_POTIONS: Array<
  Exclude<StatePotionSubskillPotionType, "clarte">
> = ["rappel", "courage", "guerison", "amour", "apaisement"];

function originBridgeContext(
  selectedPotion: "amour" | "guerison" | "apaisement",
  prefillCandidates: Record<string, unknown>,
) {
  return {
    origin_flow: "emotional_repair",
    origin_flow_status: "bridge_consented",
    information_note: {
      departed_flow_summary: "Le flow emotional_repair a stabilise l'episode.",
      context_for_next_dispatcher: {
        selected_potion: selectedPotion,
        prefill_candidates: prefillCandidates,
      },
    },
    selected_potion: selectedPotion,
    prefill_candidates: prefillCandidates,
  };
}

function fullyLockedState(
  potion: Exclude<StatePotionSubskillPotionType, "clarte">,
) {
  const previous = createInitialStatePotionSubskillState(potion, null);
  return {
    ...previous,
    field_states: Object.fromEntries(
      previous.field_order.map((fieldId) => {
        const field = previous.field_states[fieldId];
        return [fieldId, {
          ...field,
          status: "locked" as const,
          locked_value: field.input_type === "single_select"
            ? field.option_label ?? "Dur"
            : `reponse ${fieldId}`,
          option_value: field.input_type === "single_select"
            ? field.option_value ?? "dur"
            : field.option_value,
          option_label: field.input_type === "single_select"
            ? field.option_label ?? "Dur"
            : field.option_label,
          candidate_value: null,
          needs_user_confirmation: false,
          why_status: "Champ requis verrouille pour le test.",
        }];
      }),
    ),
    current_field_id: null,
  };
}

Deno.test("state potion subskill reducer locks all fields and builds platform handoff", () => {
  const previous = createInitialStatePotionSubskillState("apaisement", null);
  const reduced = reduceStatePotionSubskillDispatcherOutput({
    previous,
    decision: baseDecision({
      field_states: [{
        ...previous.field_states.pressure_source,
        status: "locked",
        locked_value: "La pile de décisions qui s'accumule depuis ce matin.",
        why_status: "source de pression exploitable",
      }, {
        ...previous.field_states.pressure_state,
        status: "locked",
        locked_value: "Submerge",
        option_value: "submerge",
        option_label: "Submerge",
        why_status: "option canonique",
      }],
      visible_task: {
        kind: "handoff_ready",
      },
    }),
  });

  assertEquals(reduced.status, "handoff_delivered");
  assertEquals(reduced.visible_task, "handoff_ready");
  assertEquals(
    reduced.draft?.recommendation.platform_inputs?.potion_type,
    "apaisement",
  );
  assertEquals(
    reduced.draft?.recommendation.platform_inputs?.answers.length,
    2,
  );
});

Deno.test("state potion subskill consumes high confidence emotional repair bridge as locked", () => {
  const state = createInitialStatePotionSubskillState(
    "amour",
    null,
    originBridgeContext("amour", {
      love_lack_context: {
        candidate_value: "son erreur de ce matin",
        confidence: "high",
        source: "emotional_repair",
      },
      love_state: {
        option_value: "dur",
        option_label: "Dur",
        confidence: "high",
        source: "emotional_repair",
      },
    }),
  );

  assertEquals(state.origin_bridge_context?.origin_flow, "emotional_repair");
  assertEquals(state.field_states.love_lack_context.status, "locked");
  assertEquals(
    state.field_states.love_lack_context.locked_value,
    "son erreur de ce matin",
  );
  assertEquals(state.field_states.love_state.status, "locked");
  assertEquals(state.field_states.love_state.option_value, "dur");
  assertEquals(state.current_field_id, null);
});

Deno.test("state potion subskill consumes medium confidence bridge as proposed", () => {
  const state = createInitialStatePotionSubskillState(
    "guerison",
    null,
    originBridgeContext("guerison", {
      recent_hurt: {
        candidate_value: "le craquage d'hier",
        confidence: "medium",
        source: "emotional_repair",
      },
      dominant_feeling: {
        option_value: "honte",
        option_label: "Honte",
        confidence: "medium",
        source: "emotional_repair",
      },
    }),
  );

  assertEquals(state.field_states.recent_hurt.status, "proposed");
  assertEquals(
    state.field_states.recent_hurt.candidate_value,
    "le craquage d'hier",
  );
  assertEquals(state.field_states.dominant_feeling.status, "proposed");
  assertEquals(state.current_field_id, "recent_hurt");
});

Deno.test("state potion subskill consumes low confidence bridge as clarification without full repeat", () => {
  const state = createInitialStatePotionSubskillState(
    "apaisement",
    null,
    originBridgeContext("apaisement", {
      pressure_source: {
        candidate_value: "la pression",
        confidence: "low",
        source: "emotional_repair",
      },
      pressure_state: {
        option_value: "a_cran",
        option_label: "A cran",
        confidence: "low",
        source: "emotional_repair",
      },
    }),
  );

  assertEquals(state.field_states.pressure_source.status, "missing");
  assertEquals(
    state.field_states.pressure_source.candidate_value,
    "la pression",
  );
  assertEquals(
    state.field_states.pressure_source.detail_sufficiency.status,
    "needs_more_detail",
  );
  assertEquals(state.current_field_id, "pressure_source");
  assert(
    state.field_states.pressure_source.why_status.includes(
      "sans faire repeter tout l'episode",
    ),
  );
});

Deno.test("state potion subskill completed fields always produce a final handoff for every local potion", () => {
  for (const potion of LOCAL_SUBSKILL_POTIONS) {
    const previous = fullyLockedState(potion);
    const reduced = reduceStatePotionSubskillDispatcherOutput({
      previous,
      decision: baseDecision({
        selected_potion: potion,
        flow_action: "platform_destination_followup",
        current_field_id: null,
        visible_task: {
          kind: "destination_short",
        },
      }),
    });

    assertEquals(reduced.status, "handoff_delivered", potion);
    assertEquals(reduced.visible_task, "handoff_ready", potion);
    assert(reduced.draft, potion);
    assertEquals(
      reduced.draft?.recommendation.platform_inputs?.potion_type,
      potion,
    );
    assertEquals(
      reduced.draft?.recommendation.platform_inputs?.answers.length,
      previous.field_order.length,
      potion,
    );
  }
});

Deno.test("state potion subskill already delivered destination followup repeats instead of redelivering", () => {
  const previous = {
    ...fullyLockedState("amour"),
    last_handoff_delivered: true,
  };
  const reduced = reduceStatePotionSubskillDispatcherOutput({
    previous,
    decision: baseDecision({
      selected_potion: "amour",
      flow_action: "platform_destination_followup",
      current_field_id: null,
      visible_task: {
        kind: "destination_short",
      },
    }),
  });

  assertEquals(reduced.status, "repeat_handoff");
  assertEquals(reduced.visible_task, "destination_short");
  assertEquals(reduced.reason_code, "amour_platform_destination_followup");
  assert(reduced.draft);
});

Deno.test("state potion subskill asks one detail question for sparse free text before handoff", () => {
  const previous = createInitialStatePotionSubskillState("amour", null);
  const reduced = reduceStatePotionSubskillDispatcherOutput({
    previous,
    decision: baseDecision({
      selected_potion: "amour",
      flow_action: "answer_current_field",
      current_field_id: "love_lack_context",
      field_states: [{
        ...previous.field_states.love_lack_context,
        status: "locked",
        locked_value: "mon echec de vendredi",
        why_status: "Valeur copiable mais pauvre.",
        detail_sufficiency: {
          status: "needs_more_detail",
          reason: "On ne sait pas ce qui rend cet échec encore dur.",
          followup_question:
            "Qu'est-ce qui te revient le plus quand tu repenses à cet échec ?",
          followup_asked: false,
          followup_answered: false,
          evidence: ["mon echec de vendredi"],
        },
      }, {
        ...previous.field_states.love_state,
        status: "locked",
        locked_value: "Dur",
        option_value: "dur",
        option_label: "Dur",
        why_status: "Option canonique donnée.",
      }],
      visible_task: {
        kind: "handoff_ready",
      },
    }),
  });

  assertEquals(reduced.status, "clarifying");
  assertEquals(reduced.visible_task, "ask_deeper");
  assertEquals(reduced.reason_code, "amour_field_needs_more_detail");
  assertEquals(reduced.draft, null);
  assertEquals(
    reduced.potion_subskill_state?.current_field_id,
    "love_lack_context",
  );
  assertEquals(
    reduced.potion_subskill_state?.field_states.love_lack_context
      .detail_sufficiency.followup_asked,
    true,
  );
});

Deno.test("state potion subskill detail followup answer finalizes without a second detail loop", () => {
  const previous = createInitialStatePotionSubskillState("amour", null);
  const awaitingDetail: typeof previous = {
    ...previous,
    field_states: {
      ...previous.field_states,
      love_lack_context: {
        ...previous.field_states.love_lack_context,
        status: "locked" as const,
        locked_value: "mon echec de vendredi",
        candidate_value: null,
        needs_user_confirmation: false,
        why_status: "Valeur copiable mais pauvre.",
        detail_sufficiency: {
          status: "needs_more_detail",
          reason: "On ne sait pas ce qui rend cet échec encore dur.",
          followup_question:
            "Qu'est-ce qui te revient le plus quand tu repenses à cet échec ?",
          followup_asked: true,
          followup_answered: false,
          evidence: ["mon echec de vendredi"],
        },
      },
      love_state: {
        ...previous.field_states.love_state,
        status: "locked" as const,
        locked_value: "Dur",
        option_value: "dur",
        option_label: "Dur",
        needs_user_confirmation: false,
        why_status: "Option canonique donnée.",
      },
    },
    current_field_id: "love_lack_context",
  };
  const reduced = reduceStatePotionSubskillDispatcherOutput({
    previous: awaitingDetail,
    decision: baseDecision({
      selected_potion: "amour",
      flow_action: "answer_current_field",
      current_field_id: "love_lack_context",
      field_states: [{
        ...awaitingDetail.field_states.love_lack_context,
        status: "locked",
        locked_value:
          "mon echec de vendredi, surtout le fait d'avoir abandonné alors que ça comptait pour moi",
        why_status: "Le user a répondu au creusement unique.",
        detail_sufficiency: {
          status: "sufficient",
          reason: "Le contexte et ce qui pèse sont maintenant explicites.",
          followup_question: null,
          followup_asked: true,
          followup_answered: true,
          evidence: ["j'ai abandonné alors que ça comptait"],
        },
      }],
      visible_task: {
        kind: "handoff_ready",
      },
    }),
  });

  assertEquals(reduced.status, "handoff_delivered");
  assertEquals(reduced.visible_task, "handoff_ready");
  assert(reduced.draft);
  assertEquals(
    reduced.potion_subskill_state?.field_states.love_lack_context
      .detail_sufficiency.followup_answered,
    true,
  );
});

Deno.test("amour field answer locks natural self-harshness and delivers handoff", () => {
  const previous = createInitialStatePotionSubskillState("amour", null);
  const withContext: typeof previous = {
    ...previous,
    field_states: {
      ...previous.field_states,
      love_lack_context: {
        ...previous.field_states.love_lack_context,
        status: "locked" as const,
        locked_value: "mon echec de vendredi",
        candidate_value: null,
        needs_user_confirmation: false,
        why_status: "Contexte donne par le user.",
      },
    },
    current_field_id: "love_state",
  };

  const reduced = reduceStatePotionSubskillDispatcherOutput({
    previous: withContext,
    decision: baseDecision({
      selected_potion: "amour",
      flow_action: "answer_current_field",
      current_field_id: "love_state",
      field_states: [{
        ...withContext.field_states.love_state,
        status: "locked",
        locked_value: "Dur",
        option_value: "dur",
        option_label: "Dur",
        why_status: "`je me parle tres durement` verrouille l'option dur.",
      }],
      visible_task: {
        kind: "handoff_ready",
      },
    }),
  });

  assertEquals(reduced.status, "handoff_delivered");
  assertEquals(
    reduced.potion_subskill_state?.field_states.love_state.locked_value,
    "Dur",
  );
  assertEquals(
    reduced.draft?.recommendation.platform_inputs?.answers.map((answer) =>
      answer.question_id
    ),
    ["love_lack_context", "love_state"],
  );
});

Deno.test("amour destination followup still merges provided field values before deciding final handoff", () => {
  const previous = createInitialStatePotionSubskillState("amour", null);
  const withContext: typeof previous = {
    ...previous,
    field_states: {
      ...previous.field_states,
      love_lack_context: {
        ...previous.field_states.love_lack_context,
        status: "locked" as const,
        locked_value: "mon echec de vendredi",
        candidate_value: null,
        needs_user_confirmation: false,
        why_status: "Contexte donne par le user.",
      },
    },
    current_field_id: "love_state",
  };

  const reduced = reduceStatePotionSubskillDispatcherOutput({
    previous: withContext,
    decision: baseDecision({
      selected_potion: "amour",
      flow_action: "platform_destination_followup",
      current_field_id: "love_state",
      field_states: [{
        ...withContext.field_states.love_state,
        status: "locked",
        locked_value: "Dur",
        option_value: "dur",
        option_label: "Dur",
        why_status: "Valeur exploitable mal classee en followup.",
      }],
      visible_task: {
        kind: "destination_short",
      },
    }),
  });

  assertEquals(reduced.status, "handoff_delivered");
  assertEquals(
    reduced.reason_code,
    "amour_handoff_delivered_from_destination_followup",
  );
  assert(reduced.draft);
});

Deno.test("state potion subskill reducer waits on proposed field then advances after confirmation", () => {
  const previous = createInitialStatePotionSubskillState("courage", null);
  const proposed = reduceStatePotionSubskillDispatcherOutput({
    previous,
    decision: baseDecision({
      selected_potion: "courage",
      current_field_id: "avoidance_target",
      field_states: [{
        ...previous.field_states.avoidance_target,
        status: "proposed",
        candidate_value: "Envoyer le message que je repousse.",
        needs_user_confirmation: true,
        why_status: "presque clair",
      }],
      visible_task: {
        kind: "confirm_proposal",
      },
    }),
  });
  assertEquals(proposed.status, "clarifying");
  assertEquals(proposed.visible_task, "confirm_proposal");

  const confirmed = reduceStatePotionSubskillDispatcherOutput({
    previous: proposed.potion_subskill_state!,
    decision: baseDecision({
      selected_potion: "courage",
      flow_action: "confirm_proposed_field",
      current_field_id: "avoidance_target",
    }),
  });
  assertEquals(confirmed.status, "clarifying");
  assertEquals(
    confirmed.potion_subskill_state?.field_states.avoidance_target
      .locked_value,
    "Envoyer le message que je repousse.",
  );
  assertEquals(
    confirmed.potion_subskill_state?.current_field_id,
    "blocker_kind",
  );
});

Deno.test("state potion subskill reducer apply_attempt does not mutate locked fields", () => {
  const previous = createInitialStatePotionSubskillState("amour", null);
  const withValue = {
    ...previous,
    field_states: {
      ...previous.field_states,
      love_lack_context: {
        ...previous.field_states.love_lack_context,
        status: "locked" as const,
        locked_value: "La partie de moi que je juge après cet échec.",
      },
    },
  };
  const reduced = reduceStatePotionSubskillDispatcherOutput({
    previous: withValue,
    decision: baseDecision({
      selected_potion: "amour",
      flow_action: "apply_attempt",
      current_field_id: "love_state",
      field_states: [{
        ...previous.field_states.love_lack_context,
        status: "locked",
        locked_value: "Autre valeur à ignorer",
      }],
      visible_task: {
        kind: "apply_attempt",
      },
    }),
  });
  assertEquals(reduced.status, "apply_attempt");
  assertEquals(
    reduced.potion_subskill_state?.field_states.love_lack_context
      .locked_value,
    "La partie de moi que je juge après cet échec.",
  );
  assertEquals(reduced.risk_assessment.safety_preempt, false);
  assert(reduced.draft === null);
});

Deno.test("state potion subskill stop exits to global dispatcher with note", () => {
  const previous = createInitialStatePotionSubskillState("amour", null);
  const reduced = reduceStatePotionSubskillDispatcherOutput({
    previous,
    decision: baseDecision({
      selected_potion: "amour",
      flow_action: "exit_to_global_dispatcher",
      current_field_id: null,
      visible_task: {
        kind: "exit",
      },
      exit_memo: {
        needed: true,
        reason: "topic_change",
        flow_summary: "Potion amour arrêtée.",
        collected_value: null,
        handoff_hint_for_global_dispatcher:
          "Le user demande d'arreter le sous-flow potion.",
      },
    }),
  });

  assertEquals(reduced.status, "topic_change");
  assertEquals(reduced.visible_task, "exit");
  assertEquals(reduced.exit_to_global_dispatcher, true);
  assertEquals(reduced.potion_subskill_state?.last_visible_task, "exit");
  assertEquals(reduced.reason_code, "amour_flow_topic_change");
});

Deno.test("state potion subskill topic change exits to global dispatcher", () => {
  const previous = createInitialStatePotionSubskillState("courage", null);
  const reduced = reduceStatePotionSubskillDispatcherOutput({
    previous,
    decision: baseDecision({
      selected_potion: "courage",
      flow_action: "exit_to_global_dispatcher",
      current_field_id: null,
      visible_task: {
        kind: "exit",
      },
      exit_memo: {
        needed: true,
        reason: "topic_change",
        flow_summary: "Potion de courage interrompue.",
        collected_value: null,
        handoff_hint_for_global_dispatcher:
          "Le user demande maintenant un rappel ponctuel.",
      },
    }),
  });

  assertEquals(reduced.status, "topic_change");
  assertEquals(reduced.visible_task, "exit");
  assertEquals(reduced.exit_to_global_dispatcher, true);
  assertEquals(reduced.potion_subskill_state?.last_visible_task, "exit");
  assertEquals(reduced.reason_code, "courage_flow_topic_change");
});

Deno.test("state potion subskill safety preempt stays local safety path", () => {
  const previous = createInitialStatePotionSubskillState("apaisement", null);
  const reduced = reduceStatePotionSubskillDispatcherOutput({
    previous,
    decision: baseDecision({
      selected_potion: "apaisement",
      flow_action: "safety_preempt",
      current_field_id: null,
      visible_task: {
        kind: "safety",
      },
      exit_memo: {
        needed: true,
        reason: "safety",
        flow_summary: "Potion d'apaisement interrompue par safety.",
        collected_value: null,
        handoff_hint_for_global_dispatcher:
          "Preempter vers le dispatcher local safety.",
      },
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
  assertEquals(reduced.potion_subskill_state?.last_visible_task, "safety");
  assertEquals(reduced.risk_assessment.safety_preempt, true);
});

Deno.test("state potion subskill routes product help inline with local context", () => {
  const previous = createInitialStatePotionSubskillState("rappel", null);
  const reduced = reduceStatePotionSubskillDispatcherOutput({
    previous,
    decision: baseDecision({
      selected_potion: "rappel",
      flow_action: "get_info_product",
      visible_task: {
        kind: "none",
      },
      subskill_call: {
        needed: true,
        skill_id: "product_help",
        reason: "Le user demande comment marche cette potion.",
        context_for_subskill: {
          active_flow: "select_state_potion.rappel",
          question_to_answer:
            "Expliquer la Potion rappel sans quitter le sous-flow actif.",
          active_flow_context: {
            selected_potion: "rappel",
            current_field_id: previous.current_field_id,
          },
        },
      },
    }),
  });

  assertEquals(reduced.get_info_product, true);
  assertEquals(reduced.get_info_db, false);
  assertEquals(reduced.visible_task, "none");
  assertEquals(reduced.status, "collecting");
  assertEquals(reduced.potion_subskill_state?.last_visible_task, "none");
  assertEquals(
    reduced.subskill_context?.active_flow,
    "select_state_potion.rappel",
  );
});

Deno.test("state potion subskill routes status recap inline with local context", () => {
  const previous = createInitialStatePotionSubskillState("courage", null);
  const reduced = reduceStatePotionSubskillDispatcherOutput({
    previous,
    decision: baseDecision({
      selected_potion: "courage",
      flow_action: "get_info_db",
      visible_task: {
        kind: "none",
      },
      subskill_call: {
        needed: true,
        skill_id: "status_recap",
        reason: "Le user demande quelles potions sont deja actives.",
        context_for_subskill: {
          active_flow: "select_state_potion.courage",
          question_to_answer:
            "Dire quelles potions existent deja avant de continuer courage.",
          active_flow_context: {
            selected_potion: "courage",
            current_field_id: previous.current_field_id,
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
    "select_state_potion.courage",
  );
});
