import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  normalizeProductHelpLocalDispatcherOutput,
  reduceProductHelpLocalDispatcherOutput,
} from "./local_flow.ts";
import { getProductHelpFeature } from "./retrieval.ts";

function dispatcherOutput(patch: Record<string, unknown> = {}) {
  return normalizeProductHelpLocalDispatcherOutput({
    flow_action: "answer_product_question",
    confidence: "high",
    risk_score: 0,
    mode: "standalone",
    product_help_intent: {
      kind: "explain_feature",
      summary: "Explains how attack cards work.",
    },
    target: {
      kind: "feature_catalog",
      feature_id: "resources.attack_card",
      object_type: "attack_card",
      object_ref: null,
      confidence: "high",
    },
    grounding: {
      catalog_feature_ids: ["resources.attack_card"],
      surface_ids: [],
      db_sources_required: false,
      db_sources_used: [],
      active_flow_used: false,
      missing_grounding_reason: null,
    },
    bridge: {
      needed: false,
      operation_type: null,
      kind: null,
      executable: false,
      why: null,
    },
    state_updates: {
      status: "answered",
      stage: "answering",
      turn_count_increment: 1,
      close_after_visible: false,
      preserve_parent_flow: true,
    },
    visible_task: {
      kind: "answer_product_question",
      instruction: "Answer the product question only.",
      conversation_context: {},
    },
    return_to_parent: {
      needed: false,
      parent_skill_id: null,
      return_summary: null,
      preserve_parent_state: true,
    },
    note_information: null,
    exit_memo: {
      needed: false,
      reason: "none",
      user_intent_summary: null,
      local_flow_context: {
        skill_id: "product_help",
        mode: "standalone",
        stage: "answering",
        last_answer_summary: null,
        parent_skill_id: null,
        committed_effects: [],
      },
      handoff_hint_for_global_dispatcher: {
        likely_intent: "unknown",
        why: null,
      },
    },
    evidence: ["resources.attack_card"],
    ...patch,
  });
}

Deno.test("product help attack card plan guidance does not make plan preparation conditional", () => {
  const attackCard = getProductHelpFeature("resources.attack_card");
  const planCards = getProductHelpFeature("resources.plan_cards");

  assertEquals(
    attackCard?.how_to.includes("si l'option est disponible"),
    false,
  );
  assertEquals(attackCard?.how_to.includes("si disponible"), false);
  assertEquals(
    attackCard?.locations.some((location) =>
      location.surface === "Dashboard > Plan" &&
      location.user_can_do.some((action) =>
        action.includes("preparer une carte d'attaque")
      )
    ),
    true,
  );
  assertEquals(planCards?.how_to.includes("si l'option est disponible"), false);
  assertEquals(
    planCards?.limits.includes("Ne concerne pas tous les items du plan."),
    false,
  );
});

Deno.test("product help potion explains contextual conversation support instead of generic reminders", () => {
  const potion = getProductHelpFeature("resources.potions");

  assertEquals(potion?.explain.includes("deux temps"), true);
  assertEquals(
    potion?.explain.includes(
      "soutien conversationnel pouvant durer jusqu'a 7 jours",
    ),
    true,
  );
  assertEquals(
    potion?.explain.includes("serie de phrases generiques preparees d'avance"),
    true,
  );
  assertEquals(
    potion?.how_to.includes(
      "Au maximum une ouverture de soutien est preparee par jour",
    ),
    true,
  );
  assertEquals(
    potion?.benefits.includes(
      "Permet une vraie conversation de soutien, pas seulement la reception d'une phrase quotidienne.",
    ),
    true,
  );
  assertEquals(
    potion?.limits.some((limit) =>
      limit.includes("ne garantit pas 7 messages") &&
      limit.includes("Daily ou Weekly")
    ),
    true,
  );
  assertEquals(
    potion?.sophia_must_not_claim.some((claim) =>
      claim.includes("contenu de potion donne dans le chat") &&
      claim.includes("activation du suivi de 7 jours")
    ),
    true,
  );
});

function removedLocalDispatcherAction(): string {
  return ["handoff", "to", "local", "dispatcher"].join("_");
}

Deno.test("product_help answers a simple product question without effects", () => {
  const reduced = reduceProductHelpLocalDispatcherOutput({
    previous: null,
    output: dispatcherOutput(),
    catalogCandidates: [],
    parentFlowContext: null,
    productSurfaces: [],
    recentCommittedEffects: [],
    userMessage: "c'est quoi une carte d'attaque ?",
  });

  assertEquals(reduced.status, "closing");
  assertEquals(reduced.visible_task, "answer_product_question");
  assertEquals(reduced.exit_to_global_dispatcher, false);
  assertEquals(reduced.note_information, null);
  assertEquals(reduced.blocked_effects, []);
});

Deno.test("product_help rejects dispatcher attempts to request effects", () => {
  assertThrows(
    () =>
      normalizeProductHelpLocalDispatcherOutput({
        ...dispatcherOutput(),
        operation_suggestions: [{ type: "anything" }],
      }),
    Error,
    "forbidden_operation_suggestions",
  );
});

Deno.test("product_help strips removed bridge operation fields", () => {
  const output = dispatcherOutput({
    bridge: {
      needed: true,
      operation_type: "removed_operation",
      kind: "explain_only",
      executable: false,
      why: "should not survive normalization",
    },
  });

  assertEquals(output.bridge.operation_type, null);
  assertEquals(output.bridge.kind, "explain_only");
});

Deno.test("product_help unknown removed local action falls back without ownership transfer", () => {
  const output = dispatcherOutput({
    flow_action: removedLocalDispatcherAction(),
  });
  assertEquals(output.flow_action, "clarify_product_question");
  assertEquals(output.note_information, null);

  const reduced = reduceProductHelpLocalDispatcherOutput({
    previous: null,
    output,
    catalogCandidates: [],
    parentFlowContext: null,
    productSurfaces: [],
    recentCommittedEffects: [],
    userMessage: "je bloque, je dois utiliser quoi ?",
  });

  assertEquals(reduced.exit_to_global_dispatcher, false);
  assertEquals(reduced.return_to_parent_flow, false);
  assertEquals(reduced.note_information, null);
});

Deno.test("product_help exits to global for real status questions", () => {
  const reduced = reduceProductHelpLocalDispatcherOutput({
    previous: null,
    output: dispatcherOutput({
      product_help_intent: {
        kind: "object_status_question",
        summary: "User asks what is currently active.",
      },
      grounding: {
        catalog_feature_ids: [],
        surface_ids: [],
        db_sources_required: true,
        db_sources_used: [],
        active_flow_used: false,
        missing_grounding_reason: "product_help cannot inspect live status",
      },
    }),
    catalogCandidates: [],
    parentFlowContext: null,
    productSurfaces: [],
    recentCommittedEffects: [],
    userMessage: "qu'est-ce que j'ai d'actif ?",
  });

  assertEquals(reduced.status, "exit");
  assertEquals(reduced.exit_to_global_dispatcher, true);
  assertEquals(reduced.note_information?.target_dispatcher, "global");
  assertEquals(reduced.blocked_effects, []);
});

Deno.test("product_help exits to global for product action requests", () => {
  const output = dispatcherOutput({
    flow_action: "exit_to_global_dispatcher",
    product_help_intent: {
      kind: "tool_action_request",
      summary: "User asks Sophia to create a card.",
    },
    visible_task: {
      kind: "exit_ack",
      instruction: "Exit without answering the target request.",
      conversation_context: {},
    },
    note_information: {
      source_flow_id: "product_help",
      handoff_reason: "explicit_user_request",
      target_dispatcher: "global",
      handoff_context_for_next_dispatcher:
        "User asks for a product action; global must reclassify.",
      structured_context: {
        user_message_summary: "User asks for a product action.",
        recommended_next_focus: "global",
      },
      confidence: "high",
    },
    exit_memo: {
      needed: true,
      reason: "explicit_tool_request",
      user_intent_summary: "User asks for a product action.",
      local_flow_context: {
        skill_id: "product_help",
        mode: "standalone",
        stage: "closing",
        last_answer_summary: null,
        parent_skill_id: null,
        committed_effects: [],
      },
      handoff_hint_for_global_dispatcher: {
        likely_intent: "normal_coaching",
        why: "product action requests leave product_help",
      },
    },
  });
  const reduced = reduceProductHelpLocalDispatcherOutput({
    previous: null,
    output,
    catalogCandidates: [],
    parentFlowContext: null,
    productSurfaces: [],
    recentCommittedEffects: [],
    userMessage: "fais-moi une carte",
  });

  assertEquals(reduced.status, "exit");
  assertEquals(reduced.exit_to_global_dispatcher, true);
  assertEquals(reduced.note_information?.target_dispatcher, "global");
});

Deno.test("product_help safety_preempt exits to safety_crisis", () => {
  const reduced = reduceProductHelpLocalDispatcherOutput({
    previous: null,
    output: dispatcherOutput({
      flow_action: "safety_preempt",
      risk_score: 8,
      product_help_intent: {
        kind: "safety",
        summary: "Safety signal.",
      },
    }),
    catalogCandidates: [],
    parentFlowContext: null,
    productSurfaces: [],
    recentCommittedEffects: [],
    userMessage: "je risque de me faire du mal",
  });

  assertEquals(reduced.status, "safety");
  assertEquals(reduced.exit_to_global_dispatcher, false);
  assertEquals(reduced.note_information?.target_dispatcher, "safety_crisis");
});

Deno.test("product_help visible context omits raw user_words and carries direct effect confirmation context", () => {
  const reduced = reduceProductHelpLocalDispatcherOutput({
    previous: null,
    output: dispatcherOutput({
      visible_task: {
        kind: "answer_product_question",
        instruction: "Answer the product question only.",
        conversation_context: {
          user_words: ["ou est ma carte ?"],
          known_values: { feature_id: "resources.attack_card" },
        },
      },
    }),
    catalogCandidates: [],
    parentFlowContext: null,
    productSurfaces: [],
    recentCommittedEffects: [{
      type: "create_one_shot_reminder",
      id: "reminder-1",
      summary: "relire mes notes",
    }],
    directEffectConfirmationContext: {
      has_committed_one_shot_reminder: true,
      has_requested_one_shot_reminder: true,
      one_shot_reminder: {
        committed: true,
        local_label: "demain à 9h",
        reminder_instruction: "relire mes notes",
      },
      confirmation_text: null,
      committed_effects: [],
      requested_effects: [],
      blocked_effects: [],
      do_not_recreate: true,
      do_not_reroute: true,
      do_not_redemand: true,
      do_not_confirm_without_commit: true,
      remaining_user_need_must_continue: true,
    },
    userMessage: "ou est ma carte ?",
  });

  assertEquals("user_words" in (reduced.conversation_context as any), false);
  assertEquals(
    (reduced.conversation_context.known_values
      .direct_effect_confirmation_context as any)
      .has_committed_one_shot_reminder,
    true,
  );
  assertEquals(
    (reduced.conversation_context.known_values.grounded_sources as any[])[0]
      .id,
    "reminder-1",
  );
});
