import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import { persistConversationSkillRoute } from "../../router/conversation_route_runtime_support.ts";
import { loadStatePotionHandoffStateFromTempMemory } from "../../tools/operations/select_state_potion/state.ts";
import { createInitialClarteState } from "../../tools/operations/select_state_potion/subskills/clarte_flow.ts";
import type {
  DemotivationRepairBridgePotion,
  DemotivationRepairLocalDispatcherOutput,
  DemotivationRepairLocalState,
} from "./contract.ts";
import { reduceDemotivationRepairLocalDispatcherOutput } from "./local_flow.ts";

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
      required_data: {
        repair_summary: "Le décrochage a été clarifié.",
        user_words: ["je décroche"],
        selected_potion: null,
        potion_label: null,
        bridge_context_summary: null,
      },
    },
    exit_memo: overrides.exit_memo ?? {
      needed: false,
      reason: "none",
      flow_summary: null,
      handoff_hint_for_global_dispatcher: null,
      potion_bridge_context: null,
      note_information: null,
    },
    no_chat_mutation: {
      potion_session_created: false,
      recurring_reminder_created: false,
      scheduled_checkin_created: false,
      executable_confirmation_generated: false,
      db_write_committed: false,
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
        source_flow_presentation:
          "demotivation_repair a clarifié le décrochage motivationnel.",
        handoff_context_for_next_dispatcher:
          "Utiliser les candidats fournis sans refaire diagnostiquer l'épisode.",
        target_flow: "select_state_potion",
        target_local_dispatcher_hint:
          "Entrer directement dans la potion sélectionnée.",
      },
    },
    visible_task: {
      kind: "potion_bridge_offer",
      required_data: {
        repair_summary: "Le décrochage a été clarifié.",
        user_words: ["je décroche"],
        selected_potion: potion,
        potion_label: potionLabel(potion),
        bridge_context_summary: "Le diagnostic est assez clair.",
      },
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
        required_data: {
          repair_summary: "Le décrochage a été clarifié.",
          user_words: ["je décroche"],
          selected_potion: potion,
          potion_label: potionLabel(potion),
          bridge_context_summary: "Bridge confirmé.",
        },
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
  assertEquals(result.reason_code, "demotivation_repair_potion_bridge_blocked");
  assertEquals(result.local_state?.last_potion_bridge_offer, null);
  assertEquals(result.visible_task.required_data.selected_potion, null);
  assertEquals(result.blocked_effects[0]?.type, "select_state_potion");
});

Deno.test("demotivation_repair confirmed clarte bridge carries note and candidate", () => {
  const context = confirmedContext("clarte");
  assertEquals(context.origin_flow, "demotivation_repair");
  assertEquals(context.selected_potion, "clarte");
  assertEquals(context.visible_potion_label, "Potion de clarté");
  assertEquals(context.note_information.target_flow, "select_state_potion");
  assert(
    context.note_information.source_flow_presentation.length > 0,
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
  assertEquals(context.no_chat_mutation.potion_session_created, false);
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
          no_chat_mutation: true,
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
    assertEquals(active.operation_input?.no_chat_mutation, true);
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
