import { assert, assertEquals } from "jsr:@std/assert@1";
import type { RouteDecision } from "../../contracts/route_decision.v1.ts";
import type { EmotionalRepairLocalDispatcherOutput } from "./contract.ts";
import { reduceEmotionalRepairLocalDispatcherOutput } from "./local_flow.ts";
import { runEmotionalRepairSkill } from "./skill.ts";
import { persistConversationSkillRoute } from "../../router/conversation_route_runtime_support.ts";

function turnFrame(risk: "none" | "high" = "none") {
  return {
    source_message_id: "message_test",
    user_id: "user_test",
    safety: { risk_band: risk, reason_codes: [] },
    skill_signals: { entry: {}, lifecycle: {}, exit: {} },
    action_reference: null,
    tool_skill_intents: [],
    tool_skill_opportunity: null,
    direct_effects: [],
    memory_plan: {},
  } as any;
}

function dispatcherOutput(
  patch: Partial<EmotionalRepairLocalDispatcherOutput> = {},
): EmotionalRepairLocalDispatcherOutput {
  return {
    flow_action: "answer_repair",
    confidence: "high",
    risk_score: 0,
    repair_state: {
      intent: "shame_or_guilt",
      phase: "de_shame",
      emotional_dominance: "high",
      context_domain: "work",
      summary: "Le user se punit apres un craquage.",
      user_words: ["j'ai honte"],
      identity_freeze_risk: true,
      emotion_stabilized_enough_for_tool: false,
    },
    constraints: [],
    response_contract: {
      max_questions: 0,
      allow_plan: false,
      allow_tool_suggestion: false,
      allow_potion_suggestion: false,
      allow_concrete_action: false,
      tone: "soft",
    },
    potion_bridge: {
      status: "not_applicable",
      selected_potion: null,
      candidate_potions: [],
      durable_need: { kind: null, summary: null },
      prefill_candidates: {},
      missing_before_handoff: [],
      why_ready_or_blocked: "reparation d'abord",
    },
    visible_task: {
      kind: "de_shame",
      required_data: {
        repair_summary: "Le user se punit apres un craquage.",
        user_words: ["j'ai honte"],
        selected_potion: null,
        potion_label: null,
        bridge_context_summary: null,
      },
    },
    exit_memo: {
      needed: false,
      reason: "none",
      flow_summary: null,
      handoff_hint_for_global_dispatcher: null,
      potion_bridge_context: null,
    },
    no_chat_mutation: {
      potion_session_created: false,
      recurring_reminder_created: false,
      scheduled_checkin_created: false,
      executable_confirmation_generated: false,
      db_write_committed: false,
    },
    evidence: ["test"],
    ...patch,
  };
}

function stabilizedOffer(
  selected_potion: "amour" | "guerison" | "apaisement",
): EmotionalRepairLocalDispatcherOutput {
  return dispatcherOutput({
    flow_action: "potion_bridge_offer",
    repair_state: {
      intent: selected_potion === "apaisement"
        ? "anxiety_or_panic"
        : selected_potion === "guerison"
        ? "shame_or_guilt"
        : "acute_self_attack",
      phase: "stabilize",
      emotional_dominance: "low",
      context_domain: "work",
      summary: "L'emotion est redescendue et le besoin durable est nomme.",
      user_words: ["j'ai besoin d'un truc plus doux"],
      identity_freeze_risk: selected_potion !== "apaisement",
      emotion_stabilized_enough_for_tool: true,
    },
    response_contract: {
      max_questions: 1,
      allow_plan: false,
      allow_tool_suggestion: false,
      allow_potion_suggestion: true,
      allow_concrete_action: false,
      tone: "soft",
    },
    potion_bridge: {
      status: "offered_waiting_consent",
      selected_potion,
      candidate_potions: [{
        potion_type: selected_potion,
        confidence: "high",
        reason: "besoin durable compatible",
      }],
      durable_need: {
        kind: selected_potion === "amour"
          ? "self_kindness"
          : selected_potion === "guerison"
          ? "healing_after_hurt"
          : "pressure_relief",
        summary: "Soutenir la suite sans auto-punition.",
      },
      prefill_candidates: selected_potion === "amour"
        ? {
          love_lack_context: "son erreur de ce matin",
          love_state: "dur",
        }
        : selected_potion === "guerison"
        ? {
          recent_hurt: "le craquage d'hier",
          dominant_feeling: "honte",
        }
        : {
          pressure_source: "la pression de cette semaine",
          pressure_state: "a_cran",
        },
      missing_before_handoff: [],
      why_ready_or_blocked: "La potion soutient le besoin durable nomme.",
    },
    visible_task: {
      kind: "potion_bridge_offer",
      required_data: {
        repair_summary: "L'emotion est redescendue.",
        user_words: ["j'ai besoin d'un truc plus doux"],
        selected_potion,
        potion_label: selected_potion === "amour"
          ? "Potion d'amour"
          : selected_potion === "guerison"
          ? "Potion de guerison"
          : "Potion d'apaisement",
        bridge_context_summary: "Besoin durable stabilise.",
      },
    },
  });
}

Deno.test("emotional_repair local reducer blocks potion while shame dominates", () => {
  const reduced = reduceEmotionalRepairLocalDispatcherOutput({
    previous: null,
    output: dispatcherOutput({
      flow_action: "potion_bridge_offer",
      potion_bridge: {
        status: "offered_waiting_consent",
        selected_potion: "guerison",
        candidate_potions: [{
          potion_type: "guerison",
          confidence: "high",
          reason: "honte",
        }],
        durable_need: {
          kind: "healing_after_hurt",
          summary: "reparer la honte",
        },
        prefill_candidates: {
          recent_hurt: "le craquage",
          dominant_feeling: "honte",
        },
        missing_before_handoff: [],
        why_ready_or_blocked: "honte encore dominante",
      },
    }),
    turn_frame: turnFrame(),
  });

  assertEquals(reduced.potion_bridge_context, null);
  assertEquals(reduced.visible_task.required_data.selected_potion, null);
  assertEquals(reduced.reason_code, "emotional_repair_potion_bridge_blocked");
});

Deno.test("emotional_repair soft_support_only blocks potion bridge", () => {
  const reduced = reduceEmotionalRepairLocalDispatcherOutput({
    previous: null,
    output: stabilizedOffer("amour"),
    explicit_constraints: ["soft_support_only"],
    turn_frame: turnFrame(),
  });

  assertEquals(reduced.potion_bridge_context, null);
  assert(reduced.constraints.includes("no_potion"));
  assert(reduced.constraints.includes("no_tool"));
});

Deno.test("emotional_repair no_potion clears previous bridge offer", () => {
  const offered = reduceEmotionalRepairLocalDispatcherOutput({
    previous: null,
    output: stabilizedOffer("amour"),
    turn_frame: turnFrame(),
  });
  const refused = reduceEmotionalRepairLocalDispatcherOutput({
    previous: offered.local_state,
    output: {
      ...dispatcherOutput({
        flow_action: "soft_presence",
        constraints: ["no_potion"],
        repair_state: {
          ...stabilizedOffer("amour").repair_state,
          emotion_stabilized_enough_for_tool: true,
        },
        visible_task: {
          kind: "soft_presence",
          required_data: {
            repair_summary: "Le user refuse la potion.",
            user_words: ["pas de potion"],
            selected_potion: null,
            potion_label: null,
            bridge_context_summary: null,
          },
        },
      }),
    },
    turn_frame: turnFrame(),
  });

  assertEquals(refused.potion_bridge_context, null);
  assertEquals(refused.local_state?.last_potion_bridge_offer, null);
  assert(refused.constraints.includes("no_potion"));
});

Deno.test("emotional_repair stabilized self-kindness offers amour with information note", () => {
  const reduced = reduceEmotionalRepairLocalDispatcherOutput({
    previous: null,
    output: stabilizedOffer("amour"),
    turn_frame: turnFrame(),
  });

  assertEquals(
    reduced.local_state?.last_potion_bridge_offer?.selected_potion,
    "amour",
  );
  assertEquals(
    reduced.local_state?.last_potion_bridge_offer?.information_note
      .context_for_next_dispatcher?.selected_potion,
    "amour",
  );
  assertEquals(reduced.visible_task.kind, "potion_bridge_offer");
});

Deno.test("emotional_repair confirmed bridge emits potion context without mutation", () => {
  const offered = reduceEmotionalRepairLocalDispatcherOutput({
    previous: null,
    output: stabilizedOffer("guerison"),
    turn_frame: turnFrame(),
  });
  const confirmed = reduceEmotionalRepairLocalDispatcherOutput({
    previous: offered.local_state,
    output: {
      ...stabilizedOffer("guerison"),
      flow_action: "confirm_potion_bridge",
      potion_bridge: {
        ...stabilizedOffer("guerison").potion_bridge,
        status: "confirmed_handoff",
      },
    },
    turn_frame: turnFrame(),
  });

  assertEquals(confirmed.status, "handoff");
  assertEquals(
    confirmed.potion_bridge_context?.origin_flow,
    "emotional_repair",
  );
  assertEquals(confirmed.potion_bridge_context?.selected_potion, "guerison");
  assertEquals(
    confirmed.potion_bridge_context?.prefill_candidates.recent_hurt
      ?.candidate_value,
    "le craquage d'hier",
  );
  assertEquals(
    confirmed.potion_bridge_context?.no_chat_mutation.potion_session_created,
    false,
  );
});

Deno.test("emotional_repair safety preempt wins over local bridge", () => {
  const reduced = reduceEmotionalRepairLocalDispatcherOutput({
    previous: null,
    output: stabilizedOffer("apaisement"),
    turn_frame: turnFrame("high"),
  });

  assertEquals(reduced.status, "safety");
  assertEquals(reduced.potion_bridge_context, null);
  assertEquals(reduced.visible_task.kind, "safety");
});

Deno.test("emotional_repair handoff persists select_state_potion owner directly", async () => {
  const offered = reduceEmotionalRepairLocalDispatcherOutput({
    previous: null,
    output: stabilizedOffer("amour"),
    turn_frame: turnFrame(),
  }).local_state;
  const output = await runEmotionalRepairSkill({
    user_message: "oui",
    context: {
      skill_id: "emotional_repair",
      user_id: "user_test",
      recent_messages: [],
      active_skill_working_state: {
        skill_id: "emotional_repair",
        working_state: { emotional_repair_local_state: offered },
      },
      turn_frame: turnFrame(),
      relevant_memory_items: [],
      plan_items: [],
      product_surfaces: [],
      exclusions: [],
    } as any,
    local_dispatcher: async () => ({
      ...stabilizedOffer("amour"),
      flow_action: "confirm_potion_bridge",
      potion_bridge: {
        ...stabilizedOffer("amour").potion_bridge,
        status: "confirmed_handoff",
      },
    }),
    visible_agent: async () =>
      "Oui. Je passe la suite vers la Potion d'amour sans te refaire raconter l'episode.",
  });
  const route: RouteDecision = {
    route_version: "v1",
    response_owner: "conversation_handler",
    selected_handler: "emotional_repair",
    blocked_paths: [],
    direct_effects_to_run: [],
    reason_code: "active_skill_continue",
    memory_used_for_route: false,
    memory_item_ids_used_for_route: [],
    memory_use_kind: "none",
  };
  const temp = persistConversationSkillRoute(
    { __active_skill_state: { skill_id: "emotional_repair" } },
    route,
    output,
  );

  assertEquals(temp.__active_skill_state, undefined);
  assertEquals(
    temp.__active_tool_skill_intake?.skill_id,
    "select_state_potion",
  );
  assertEquals(
    temp.__active_tool_skill_intake?.active_subskill_id,
    "select_state_potion.amour",
  );
  assertEquals(
    temp.__active_tool_skill_intake?.origin_bridge_context?.information_note
      ?.context_for_next_dispatcher?.selected_potion,
    "amour",
  );
});
