import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import type { TurnFrame } from "../../contracts/turn_frame.v1.ts";
import type { LoadSkillContextInput } from "../_shared/context.ts";
import { emptySafetySignal, type SafetyCrisisVisibleTask } from "./contract.ts";
import { loadSafetyCrisisContext } from "./context_loader.ts";
import {
  dispatcherSystemPrompt,
  normalizeSafetyCrisisLocalDispatcherOutput,
  oneShotDirectEffectFromSafetyCrisisLocalDispatcherOutput,
  setSafetyCrisisLocalDispatcherForTest,
} from "./local_dispatcher.ts";
import { mergeSafetyCrisisLocalState, reduceSafetyCrisis } from "./reducer.ts";
import { runSafetyCrisisSkill } from "./skill.ts";
import {
  setSafetyCrisisVisibleAgentForTest,
  visibleSystemPromptForSafetyCrisisTest,
} from "./visible_agent.ts";
import {
  applySafetyCrisisExitStateIfNeeded,
  buildSafetyCrisisActivationNoteInformation,
  shouldSkipGlobalDispatcherForSafetyLocalTurn,
} from "../../router/safety_crisis_runtime.ts";

function turnFrame(patch: Partial<TurnFrame> = {}): TurnFrame {
  return {
    turn_id: "turn-safety-local",
    source_message_id: "message-safety-local",
    user_id: "user-safety-local",
    channel: "whatsapp",
    safety: { risk_band: "medium", reason_codes: [], evidence: [] },
    direct_effects: [],
    skill_signals: {},
    memory_plan: {
      response_intent: "reflection",
      reasoning_complexity: "low",
      context_need: "minimal",
      memory_mode: "none",
      model_tier_hint: "lite",
      context_budget_tier: "tiny",
      targets: [],
      retrieval_policy: "semantic_first",
      plan_confidence: 0.7,
    },
    ...patch,
  };
}

function contextInput(
  patch: Partial<LoadSkillContextInput> = {},
): LoadSkillContextInput {
  return {
    user_id: "user-safety-local",
    active_skill_working_state: null,
    turn_frame: turnFrame(),
    recent_messages: [],
    memory_runtime: { load: () => [] },
    plan_snapshot: { items: [] },
    product_registry: [],
    ...patch,
  };
}

function dispatcherOutput(patch: Record<string, unknown> = {}) {
  return normalizeSafetyCrisisLocalDispatcherOutput({
    flow_action: "answer_safety_check",
    confidence: "high",
    risk_score: 5,
    safety_signals: {
      suicidal_ideation: false,
      self_harm_intent: false,
      immediate_danger: null,
      has_means_nearby: null,
      means_moved_away: null,
      user_currently_alone: null,
      human_support_available: null,
      emergency_help_contacted: null,
      clarified_non_immediate: false,
      deescalation_evidence: false,
      uncertainty: "high",
    },
    user_state_summary: {
      paraphrase: null,
      current_need: "unclear",
      what_changed_since_previous_turn: null,
    },
    product_tool_boundary: {
      attempted: false,
      attempt_kind: "none",
      defer_reason: null,
    },
    direct_effect_request: {
      requested: false,
      effect_type: null,
      explicitness: "none",
      target_status: "none",
      confidence_band: "low",
      payload_hint: {
        raw_text: null,
        when_hint: null,
        UTC_time: null,
        local_label: null,
        instruction_hint: null,
      },
      reason: null,
    },
    exit_request: {
      requested: false,
      why_user_thinks_safe: null,
      missing_resolution_facts: [],
    },
    state_hints: {
      suggested_trigger_summary: null,
      suggested_last_user_safety_signal: null,
    },
    no_tooling: {
      product_help_called: false,
      status_lookup_called: false,
      legacy_operation_called: false,
      operation_route_created: false,
      pending_confirmation_created: false,
      db_write_committed: false,
    },
    evidence: ["test"],
    ...patch,
  });
}

Deno.test("safety_crisis local dispatcher normalizes null facts and blocks tooling claims", () => {
  const normalized = dispatcherOutput({
    flow_action: "provide_means_status",
    safety_signals: {
      means_moved_away: true,
      uncertainty: "medium",
    },
  });
  assertEquals(normalized.safety_signals.means_moved_away, true);
  assertEquals(normalized.safety_signals.immediate_danger, null);
  assertEquals(normalized.no_tooling.legacy_operation_called, false);

  assertThrows(
    () =>
      dispatcherOutput({
        no_tooling: {
          legacy_operation_called: true,
        },
      }),
    Error,
    "tooling_legacy_operation_called",
  );
});

Deno.test("safety_crisis local dispatcher prompt documents real field completion rules", () => {
  const prompt = dispatcherSystemPrompt();

  assert(prompt.includes("Field Completion Rules:"));
  assert(prompt.includes("- flow_action:"));
  assert(prompt.includes("- confidence:"));
  assert(prompt.includes("- risk_score:"));
  assert(prompt.includes("- safety_signals:"));
  assert(prompt.includes("- user_state_summary:"));
  assert(prompt.includes("- product_tool_boundary:"));
  assert(prompt.includes("- direct_effect_request:"));
  assert(prompt.includes("raw_text = clause exacte du rappel"));
  assert(prompt.includes("when_hint = moment ou delai exploitable"));
  assert(prompt.includes("instruction_hint = uniquement ce qu'il faut rappeler"));
  assert(prompt.includes("sans absorber le besoin safety restant"));
  assert(prompt.includes("- exit_request:"));
  assert(prompt.includes("- state_hints:"));
  assert(prompt.includes("- note_information:"));
  assert(prompt.includes("- no_tooling:"));
  assert(prompt.includes("- visible_task.kind:"));
  assert(prompt.includes("- visible_task.conversation_context:"));
  assert(prompt.includes("- exit_memo et response_contract:"));
  assert(prompt.includes("- evidence:"));
  assert(prompt.includes("Transition Rules:"));
  assert(prompt.includes("exit_to_global_dispatcher"));
  assert(prompt.includes("exit_to_global_dispatcher"));
  assert(prompt.includes("safety_escalate"));
  assert(prompt.includes("create_one_shot_reminder via direct_effect_request"));
  assert(prompt.includes("Aucun handoff local autre que safety"));
  assertEquals(
    (prompt.match(/EXAMPLE_JSON_/g) ?? []).length,
    3,
  );
});

Deno.test("safety_crisis visible prompt enforces strict safety wording quality", async () => {
  const { runSafetyCrisisVisibleAgentResult } = await import(
    "./visible_agent.ts"
  );
  const visibleTask: SafetyCrisisVisibleTask = {
    kind: "stabilizing" as const,
    conversation_context: {
      state_summary: "Critical safety support active.",
      context_summary: "Support humain disponible, moyens hors de portée.",
      next_focus: "stay_with_support",
      field_or_stage: "stabilizing",
      known_values: {
        phase: "stabilizing",
        risk_band: "medium",
        immediate_danger: false,
        has_means_nearby: false,
        user_not_alone: true,
        human_support_available: true,
        emergency_help_contacted: false,
      },
      missing_or_weak_values: [],
      evidence_used: ["cousine au téléphone"],
      user_words: ["ma cousine est au téléphone"],
      selected_candidate: {},
      tone_constraints: ["short", "calm", "concrete"],
      max_questions: 1,
      safety_resources: {
        emergency_numbers: "15 ou 112",
        suicide_prevention_number: "3114",
        must_prioritize_human_support: true,
        must_include_emergency_numbers: false,
      },
      handoff_data: {
        inbound_note_summary: null,
        current_step: "safety_step=stabilizing",
        deferred_product_or_tool_request: null,
      },
      do_not_say: [],
    },
  };
  const prompt = visibleSystemPromptForSafetyCrisisTest({
    user_id: "user-safety",
    request_id: "req-safety",
    visible_task: visibleTask,
  });
  assert(prompt.includes("pas de mot coupe"));
  assert(prompt.includes("termes simples et standards"));
  assert(prompt.includes("maximum 120 mots"));
  assert(prompt.includes("VISIBLE_SAFETY_CONVERSATION_FLOW_RULES"));
  assert(
    prompt.includes("sans utiliser de message brut ni de recent_messages"),
  );

  setSafetyCrisisVisibleAgentForTest((input) => {
    assertEquals(input.visible_task.kind, "stabilizing");
    return Promise.resolve(
      "Reste assis, loin de la porte. Garde ta cousine au téléphone. Respiration 4/6 si la panique remonte.",
    );
  });
  try {
    const result = await runSafetyCrisisVisibleAgentResult({
      user_id: "user-safety",
      request_id: "req-safety",
      visible_task: visibleTask,
    });
    assertEquals(result.visible_agent_ok, true);
    assertEquals(result.message?.includes("Respiration 4/6"), true);
  } finally {
    setSafetyCrisisVisibleAgentForTest(null);
  }
});

Deno.test("safety_crisis visible product boundary rejects product artifact content", async () => {
  const { runSafetyCrisisVisibleAgentResult } = await import(
    "./visible_agent.ts"
  );
  const visibleTask: SafetyCrisisVisibleTask = {
    kind: "product_tool_boundary",
    conversation_context: {
      state_summary: "Safety support active.",
      context_summary: "Demande de carte differee pendant safety.",
      next_focus: "defer product or tool work and return to immediate safety",
      field_or_stage: "product_tool_boundary",
      known_values: {
        phase: "stabilizing",
        risk_band: "medium",
        immediate_danger: false,
        has_means_nearby: false,
        user_not_alone: false,
        human_support_available: true,
        emergency_help_contacted: false,
      },
      missing_or_weak_values: [],
      evidence_used: ["user asks for a card while safety is active"],
      user_words: ["Tu peux aussi me préparer une carte pour demain matin ?"],
      selected_candidate: {},
      tone_constraints: ["short", "calm", "concrete", "one_next_step"],
      max_questions: 1,
      safety_resources: {
        emergency_numbers: "15 ou 112",
        suicide_prevention_number: "3114",
        must_prioritize_human_support: true,
        must_include_emergency_numbers: false,
      },
      handoff_data: {
        inbound_note_summary: null,
        current_step: "safety_step=stabilizing",
        deferred_product_or_tool_request:
          "demande de carte differee pendant safety",
      },
      do_not_say: [
        "do not claim a product action was launched, created, scheduled, saved, or activated",
      ],
    },
  };
  const prompt = visibleSystemPromptForSafetyCrisisTest({
    user_id: "user-safety",
    request_id: "req-safety",
    visible_task: visibleTask,
  });
  assert(prompt.includes("Ne redige pas le contenu demande"));
  assert(prompt.includes("aucun texte pret a copier-coller"));
  assert(prompt.includes("aucun rappel ne doit etre confirme"));

  setSafetyCrisisVisibleAgentForTest(async () =>
    "Je te propose une carte courte.\n\nCARTE - DEMAIN MATIN\nRespirer, appeler ta cousine."
  );
  try {
    const result = await runSafetyCrisisVisibleAgentResult({
      user_id: "user-safety",
      request_id: "req-safety",
      visible_task: visibleTask,
    });
    assertEquals(result.visible_agent_ok, false);
    assertEquals(result.failure_reason, "product_artifact_generated");
    assertEquals(result.message, null);
  } finally {
    setSafetyCrisisVisibleAgentForTest(null);
  }
});

Deno.test("safety_crisis local dispatcher contract supports required transition actions without generic handoff", () => {
  const normal = dispatcherOutput({
    flow_action: "provide_means_status",
    risk_score: 6,
    safety_signals: {
      immediate_danger: false,
      has_means_nearby: false,
      means_moved_away: true,
      clarified_non_immediate: true,
      deescalation_evidence: true,
      uncertainty: "medium",
    },
    user_state_summary: {
      paraphrase: "moyens eloignes",
      current_need: "contact_human",
      what_changed_since_previous_turn: "moyens eloignes",
    },
    evidence: ["moyens eloignes"],
  });
  assertEquals(normal.flow_action, "provide_means_status");
  assertEquals(normal.safety_signals.means_moved_away, true);
  assertEquals(normal.product_tool_boundary.attempted, false);

  const stop = dispatcherOutput({
    flow_action: "exit_to_global_dispatcher",
    confidence: "medium",
    risk_score: 2,
    safety_signals: {
      immediate_danger: false,
      has_means_nearby: false,
      uncertainty: "medium",
    },
    evidence: ["demande d'arret sans nouveau sujet"],
  });
  assertEquals(stop.flow_action, "exit_to_global_dispatcher");
  assertEquals(stop.exit_request.requested, false);

  const exitGlobal = dispatcherOutput({
    flow_action: "exit_to_global_dispatcher",
    confidence: "medium",
    risk_score: 2,
    safety_signals: {
      immediate_danger: false,
      has_means_nearby: false,
      user_currently_alone: false,
      human_support_available: true,
      clarified_non_immediate: true,
      deescalation_evidence: true,
      uncertainty: "low",
    },
    exit_request: {
      requested: true,
      why_user_thinks_safe:
        "pas de danger immediat, pas de moyens proches, avec quelqu'un",
      missing_resolution_facts: [],
    },
    evidence: ["nouveau sujet avec faits safety solides"],
  });
  assertEquals(exitGlobal.flow_action, "exit_to_global_dispatcher");
  assertEquals(exitGlobal.exit_request.requested, true);

  const safety = dispatcherOutput({
    flow_action: "safety_escalate",
    confidence: "high",
    risk_score: 10,
    safety_signals: {
      suicidal_ideation: true,
      self_harm_intent: true,
      immediate_danger: true,
      has_means_nearby: true,
      user_currently_alone: true,
      uncertainty: "low",
    },
    evidence: ["danger immediat", "moyens proches"],
  });
  assertEquals(safety.flow_action, "safety_escalate");
  assertEquals(safety.risk_score, 10);
  assertEquals(safety.safety_signals.immediate_danger, true);

  const unknownHandoff = dispatcherOutput({
    flow_action: ["handoff", "to", "local", "flow"].join("_"),
  });
  assertEquals(unknownHandoff.flow_action, "answer_safety_check");
});

Deno.test("safety_crisis local dispatcher preserves product/tool constraint and avoids false exit", () => {
  const boundary = dispatcherOutput({
    flow_action: "product_or_tool_attempt",
    product_tool_boundary: {
      attempted: true,
      attempt_kind: "tool_creation",
      defer_reason: "user asks for a reminder while safety is active",
    },
    safety_signals: {
      immediate_danger: false,
      user_currently_alone: true,
      uncertainty: "medium",
    },
    evidence: ["demande de rappel pendant safety"],
  });
  assertEquals(boundary.product_tool_boundary.attempted, true);
  assertEquals(boundary.product_tool_boundary.attempt_kind, "tool_creation");
  assertEquals(
    boundary.product_tool_boundary.defer_reason,
    "user asks for a reminder while safety is active",
  );
  assertEquals(boundary.no_tooling.operation_route_created, false);

  const continueLocal = dispatcherOutput({
    flow_action: "answer_safety_check",
    confidence: "high",
    risk_score: 5,
    safety_signals: {
      immediate_danger: false,
      has_means_nearby: null,
      user_currently_alone: null,
      uncertainty: "medium",
    },
    exit_request: {
      requested: false,
      why_user_thinks_safe: null,
      missing_resolution_facts: ["means_safe", "human_support_available"],
    },
    evidence: ["user wants to keep checking safety"],
  });
  assertEquals(continueLocal.flow_action, "answer_safety_check");
  assertEquals(continueLocal.exit_request.requested, false);
});

Deno.test("safety_crisis local dispatcher exposes explicit one-shot reminder as standard direct effect request", () => {
  const reminder = dispatcherOutput({
    flow_action: "provide_deescalation_evidence",
    confidence: "high",
    risk_score: 4,
    safety_signals: {
      immediate_danger: false,
      has_means_nearby: false,
      user_currently_alone: false,
      human_support_available: true,
      clarified_non_immediate: true,
      deescalation_evidence: true,
      uncertainty: "low",
    },
    direct_effect_request: {
      requested: true,
      effect_type: "create_one_shot_reminder",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: {
        raw_text:
          "mets-moi un rappel dans 30 minutes pour verifier que je tiens",
        when_hint: "dans 30 minutes",
        UTC_time: "2026-06-24T12:30:00.000Z",
        local_label: "dans 30 minutes",
        instruction_hint: "verifier que je tiens",
      },
      reason: "explicit one-shot reminder request during safety flow",
    },
    evidence: ["rappel dans 30 minutes"],
  });

  assertEquals(reminder.direct_effect_request.requested, true);
  assertEquals(
    reminder.direct_effect_request.effect_type,
    "create_one_shot_reminder",
  );
  assertEquals(reminder.direct_effect_request.target_status, "identified");
  assertEquals(
    reminder.direct_effect_request.payload_hint.when_hint,
    "dans 30 minutes",
  );
  assertEquals(
    reminder.direct_effect_request.payload_hint.instruction_hint,
    "verifier que je tiens",
  );
  assertEquals(reminder.product_tool_boundary.attempted, false);
  assertEquals(reminder.no_tooling.db_write_committed, false);
  assertEquals(
    oneShotDirectEffectFromSafetyCrisisLocalDispatcherOutput(reminder)
      ?.payload_hint,
    {
      raw_text:
        "mets-moi un rappel dans 30 minutes pour verifier que je tiens",
      when_hint: "dans 30 minutes",
      UTC_time: "2026-06-24T12:30:00.000Z",
      local_label: "dans 30 minutes",
      instruction_hint: "verifier que je tiens",
    },
  );
  assertEquals(
    oneShotDirectEffectFromSafetyCrisisLocalDispatcherOutput(reminder, {
      turnFrame: turnFrame({
        direct_effects: [{
          effect_type: "create_one_shot_reminder",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "high",
          payload_hint: {
            raw_text:
              "mets-moi un rappel dans 30 minutes pour verifier que je tiens",
            when_hint: "dans 30 minutes",
            UTC_time: "2026-06-24T12:30:00.000Z",
            local_label: "dans 30 minutes",
            instruction_hint: "verifier que je tiens",
          },
        }],
      }),
    }),
    null,
  );
});

Deno.test("safety_crisis reducer escalates immediate danger and means nearby alone", () => {
  const immediate = reduceSafetyCrisis({
    previousState: {},
    sourceRiskBand: "medium",
    signals: emptySafetySignal({ immediate_danger: true }),
    dispatcherOutput: dispatcherOutput({
      flow_action: "safety_escalate",
      risk_score: 9,
      safety_signals: { immediate_danger: true, uncertainty: "medium" },
    }),
  });
  assertEquals(immediate.phase, "acute_grounding");
  assertEquals(immediate.visibleTask.kind, "safety_escalation");
  assertEquals(immediate.riskBand, "high");

  const aloneWithMeans = reduceSafetyCrisis({
    previousState: {},
    sourceRiskBand: "medium",
    signals: emptySafetySignal({
      has_means_nearby: true,
      user_currently_alone: true,
    }),
  });
  assertEquals(aloneWithMeans.phase, "acute_grounding");
  assertEquals(aloneWithMeans.riskBand, "high");
});

Deno.test("safety_crisis reducer requires exit_check facts before resolved exit", () => {
  const vagueExit = reduceSafetyCrisis({
    previousState: {
      phase: "exit_check",
      consecutive_deescalated_turns: 1,
    },
    sourceRiskBand: "medium",
    signals: emptySafetySignal({
      deescalation_evidence: true,
      uncertainty: "high",
    }),
    dispatcherOutput: dispatcherOutput({
      flow_action: "wants_to_exit",
      exit_request: {
        requested: true,
        why_user_thinks_safe: "ca va",
        missing_resolution_facts: [
          "immediate_danger_absent",
          "means_safe",
          "human_support_available",
        ],
      },
    }),
  });
  assert(vagueExit.phase !== "resolved");

  const resolved = reduceSafetyCrisis({
    previousState: {
      phase: "exit_check",
      consecutive_deescalated_turns: 1,
    },
    sourceRiskBand: "medium",
    signals: emptySafetySignal({
      immediate_danger: false,
      has_means_nearby: false,
      user_currently_alone: false,
      human_support_available: true,
      clarified_non_immediate: true,
      deescalation_evidence: true,
      uncertainty: "low",
    }),
    dispatcherOutput: dispatcherOutput({
      flow_action: "provide_deescalation_evidence",
    }),
  });
  assertEquals(resolved.phase, "resolved");
  assertEquals(resolved.visibleTask.kind, "resolved_exit");
  assertEquals(resolved.exitMemo?.reason, "resolved");
  assertEquals(
    resolved.exitMemo?.note_information.target_dispatcher,
    "global",
  );
  assertEquals(
    resolved.exitMemo?.note_information.structured_context.source_flow,
    "safety_crisis",
  );
  assertEquals(
    resolved.exitMemo?.note_information.structured_context
      .recommended_next_focus,
    "Reanalyze the next user message normally; do not resume product or tool work automatically.",
  );
  assertEquals(
    resolved.visibleTask.conversation_context.known_values.immediate_danger,
    false,
  );
  assertEquals(
    resolved.visibleTask.conversation_context.safety_resources
      .emergency_numbers,
    "15 ou 112",
  );
});

Deno.test("safety_crisis reducer provides visible-agent-safe conversation_context", () => {
  const reduced = reduceSafetyCrisis({
    previousState: {
      phase: "acute_grounding",
      last_assistant_safety_step: "safety_step=acute_grounding",
    },
    sourceRiskBand: "high",
    signals: emptySafetySignal({
      immediate_danger: true,
      has_means_nearby: true,
      user_currently_alone: true,
      uncertainty: "low",
    }),
    dispatcherOutput: dispatcherOutput({
      flow_action: "safety_escalate",
      risk_score: 9,
      evidence: ["user says they may act now"],
    }),
    currentUserMessage: "je risque de passer a l'acte",
  });

  const context = reduced.visibleTask.conversation_context;
  assertEquals(reduced.visibleTask.kind, "safety_escalation");
  assertEquals(context.user_words[0], "je risque de passer a l'acte");
  assertEquals(context.known_values.has_means_nearby, true);
  assertEquals(context.safety_resources.must_include_emergency_numbers, true);
  assertEquals(context.selected_candidate, {});
});

Deno.test("safety_crisis does not repeat emergency numbers once delivered while risk stays critical (R5-B01)", () => {
  const reduced = reduceSafetyCrisis({
    previousState: {
      phase: "acute_grounding",
      risk_band: "critical",
      immediate_danger: true,
      emergency_numbers_delivered: true,
      last_assistant_safety_step: "safety_step=acute_grounding",
    },
    sourceRiskBand: "critical",
    signals: emptySafetySignal({
      immediate_danger: true,
      has_means_nearby: true,
      user_currently_alone: true,
      uncertainty: "low",
    }),
    dispatcherOutput: dispatcherOutput({
      flow_action: "safety_escalate",
      risk_score: 9,
      evidence: ["still in crisis, no new escalation"],
    }),
    currentUserMessage: "ouais c'est bon t'inquiete",
  });
  const context = reduced.visibleTask.conversation_context;
  // Numeros deja donnes + pas de re-escalade -> on ne re-recite pas la hotline.
  assertEquals(context.safety_resources.must_include_emergency_numbers, false);
  assertEquals(
    context.known_values.emergency_numbers_already_delivered,
    true,
  );
  // Le flag reste vrai tant que le risque est eleve.
  assertEquals(reduced.statePatch.emergency_numbers_delivered, true);
});

Deno.test("safety_crisis re-delivers emergency numbers on re-escalation (R5-B01)", () => {
  const reduced = reduceSafetyCrisis({
    previousState: {
      phase: "stabilizing",
      risk_band: "medium",
      immediate_danger: false,
      // Numeros deja donnes plus tot, mais la crise etait redescendue.
      emergency_numbers_delivered: true,
      last_assistant_safety_step: "safety_step=stabilizing",
    },
    sourceRiskBand: "critical",
    signals: emptySafetySignal({
      immediate_danger: true,
      has_means_nearby: true,
      user_currently_alone: true,
      uncertainty: "low",
    }),
    dispatcherOutput: dispatcherOutput({
      flow_action: "safety_escalate",
      risk_score: 9,
      evidence: ["risk climbs back up"],
    }),
    currentUserMessage: "non ca remonte, j'ai de nouveau ces idees",
  });
  const context = reduced.visibleTask.conversation_context;
  // Re-escalade -> on re-delivre les numeros.
  assertEquals(context.safety_resources.must_include_emergency_numbers, true);
  assertEquals(reduced.statePatch.emergency_numbers_delivered, true);
});

Deno.test("safety_crisis re-delivers emergency numbers on phase re-escalation within sustained crisis (R5-B01)", () => {
  // Crise jamais totalement redescendue (risque reste critical, immediate_danger
  // deja vrai) mais la phase remonte immediate_risk_check -> acute_grounding:
  // c'est une intensification qui doit re-surfacer les numeros de facon
  // deterministe, sans dependre de l'heuristique de prompt.
  const reduced = reduceSafetyCrisis({
    previousState: {
      phase: "immediate_risk_check",
      risk_band: "critical",
      immediate_danger: true,
      emergency_numbers_delivered: true,
      last_assistant_safety_step: "safety_step=immediate_risk_check",
    },
    sourceRiskBand: "critical",
    signals: emptySafetySignal({
      immediate_danger: true,
      has_means_nearby: true,
      user_currently_alone: true,
      uncertainty: "low",
    }),
    dispatcherOutput: dispatcherOutput({
      flow_action: "safety_escalate",
      risk_score: 9,
      evidence: ["sharp intensification, holding the means now"],
    }),
    currentUserMessage: "ca monte d'un coup, je tiens la boite, je vais le faire",
  });
  const context = reduced.visibleTask.conversation_context;
  assertEquals(reduced.phase, "acute_grounding");
  assertEquals(context.safety_resources.must_include_emergency_numbers, true);
});

Deno.test("safety_crisis reducer preserves server-owned runtime fields on continuation", () => {
  const reduced = reduceSafetyCrisis({
    previousState: {
      phase: "support_contact",
      trigger_summary: "previous trigger",
      pending_offer: { kind: "call_support" },
      pending_confirmation: { kind: "safety_check" },
      last_selected_option: { option_id: "brother_sms" },
      active_subflow_context: { source: "previous" },
      previous_flow_summary: "handoff from emotional repair",
    },
    sourceRiskBand: "medium",
    signals: emptySafetySignal({
      immediate_danger: false,
      has_means_nearby: false,
      uncertainty: "medium",
    }),
    dispatcherOutput: dispatcherOutput({
      flow_action: "provide_means_status",
      state_hints: {
        suggested_trigger_summary: "malicious replacement",
        suggested_last_user_safety_signal: "means away",
      },
      modified_fields: [
        "trigger_summary",
        "pending_offer",
        "pending_confirmation",
      ],
      clear_fields: ["active_subflow_context"],
    }),
  });

  assertEquals((reduced.statePatch as any).trigger_summary, "previous trigger");
  assertEquals((reduced.statePatch as any).pending_offer, {
    kind: "call_support",
  });
  assertEquals((reduced.statePatch as any).pending_confirmation, {
    kind: "safety_check",
  });
  assertEquals((reduced.statePatch as any).last_selected_option, {
    option_id: "brother_sms",
  });
  assertEquals((reduced.statePatch as any).active_subflow_context, {
    source: "previous",
  });
  assert(
    reduced.stateMutationAudit.preserved_fields.includes("pending_offer"),
  );
  assert(
    reduced.stateMutationAudit.restored_fields.includes(
      "active_subflow_context",
    ),
  );
  assertEquals(
    reduced.stateMutationAudit.rejected_changes.some((change) =>
      change.field === "active_subflow_context" &&
      change.reason_code === "transition_not_authorized"
    ),
    true,
  );
});

Deno.test("safety_crisis reducer keeps pending confirmation on invalid confirmation or exit", () => {
  const reduced = reduceSafetyCrisis({
    previousState: {
      phase: "support_contact",
      consecutive_deescalated_turns: 0,
      pending_confirmation: { kind: "confirm_safe_exit" },
    },
    sourceRiskBand: "medium",
    signals: emptySafetySignal({
      deescalation_evidence: true,
      uncertainty: "high",
    }),
    dispatcherOutput: dispatcherOutput({
      flow_action: "exit_to_global_dispatcher",
      exit_request: {
        requested: true,
        why_user_thinks_safe: "ca va",
        missing_resolution_facts: [
          "immediate_danger_absent",
          "means_safe",
          "human_support_available",
        ],
      },
      clear_fields: ["pending_confirmation"],
    }),
  });

  assertEquals(reduced.visibleTask.kind, "exit_check");
  assertEquals(reduced.reasonCode, "safety_crisis.missing_previous_exit_check");
  assertEquals((reduced.statePatch as any).pending_confirmation, {
    kind: "confirm_safe_exit",
  });
  assert(
    reduced.stateMutationAudit.restored_fields.includes(
      "pending_confirmation",
    ),
  );
});

Deno.test("safety_crisis reducer clears pending runtime fields only on valid resolved transition", () => {
  const reduced = reduceSafetyCrisis({
    previousState: {
      phase: "exit_check",
      consecutive_deescalated_turns: 1,
      pending_offer: { kind: "support_check" },
      pending_confirmation: { kind: "confirm_safe_exit" },
      last_selected_option: { option_id: "with_cousin" },
      active_subflow_context: { source: "safety" },
    },
    sourceRiskBand: "medium",
    signals: emptySafetySignal({
      immediate_danger: false,
      has_means_nearby: false,
      user_currently_alone: false,
      human_support_available: true,
      clarified_non_immediate: true,
      deescalation_evidence: true,
      uncertainty: "low",
    }),
    dispatcherOutput: dispatcherOutput({
      flow_action: "provide_deescalation_evidence",
      clear_fields: ["pending_offer", "pending_confirmation"],
    }),
  });

  assertEquals(reduced.phase, "resolved");
  assertEquals((reduced.statePatch as any).pending_offer, null);
  assertEquals((reduced.statePatch as any).pending_confirmation, null);
  assertEquals((reduced.statePatch as any).last_selected_option, null);
  assertEquals((reduced.statePatch as any).active_subflow_context, null);
  assert(
    reduced.stateMutationAudit.cleared_fields.includes("pending_confirmation"),
  );
});

Deno.test("safety_crisis reducer accepts explicit user correction for the corrected safety fact only", () => {
  const reduced = reduceSafetyCrisis({
    previousState: {
      phase: "acute_grounding",
      has_means_nearby: true,
      immediate_danger: true,
      pending_offer: { kind: "call_support" },
      last_selected_option: { option_id: "move_meds" },
    },
    sourceRiskBand: "medium",
    signals: emptySafetySignal({
      immediate_danger: false,
      means_moved_away: true,
      has_means_nearby: false,
      uncertainty: "low",
    }),
    dispatcherOutput: dispatcherOutput({
      flow_action: "provide_means_status",
      safety_signals: {
        immediate_danger: false,
        means_moved_away: true,
        has_means_nearby: false,
        uncertainty: "low",
      },
      evidence: ["user says the meds are now away"],
    }),
  });

  assertEquals(reduced.statePatch.has_means_nearby, false);
  assertEquals(reduced.statePatch.immediate_danger, false);
  assertEquals((reduced.statePatch as any).pending_offer, {
    kind: "call_support",
  });
  assertEquals((reduced.statePatch as any).last_selected_option, {
    option_id: "move_meds",
  });
});

Deno.test("safety_crisis reducer lets clear happen on valid explicit exit but not before", () => {
  const reduced = reduceSafetyCrisis({
    previousState: {
      phase: "exit_check",
      consecutive_deescalated_turns: 1,
      pending_confirmation: { kind: "confirm_safe_exit" },
      active_subflow_context: { source: "previous_safety_check" },
    },
    sourceRiskBand: "medium",
    signals: emptySafetySignal({
      immediate_danger: false,
      has_means_nearby: false,
      user_currently_alone: false,
      human_support_available: true,
      clarified_non_immediate: true,
      deescalation_evidence: true,
      uncertainty: "low",
    }),
    dispatcherOutput: dispatcherOutput({
      flow_action: "exit_to_global_dispatcher",
      exit_request: {
        requested: true,
        why_user_thinks_safe:
          "pas de danger immediat, moyens eloignes, frere disponible",
        missing_resolution_facts: [],
      },
      clear_fields: ["pending_confirmation", "active_subflow_context"],
    }),
  });

  assertEquals(reduced.phase, "resolved");
  assertEquals(reduced.visibleTask.kind, "resolved_exit");
  assertEquals((reduced.statePatch as any).pending_confirmation, null);
  assertEquals((reduced.statePatch as any).active_subflow_context, null);
  assert(
    reduced.stateMutationAudit.cleared_fields.includes(
      "active_subflow_context",
    ),
  );
});

Deno.test("safety_crisis reducer tolerates old enum or partial state without default durable action", () => {
  const reduced = reduceSafetyCrisis({
    previousState: {
      phase: "old_unknown_phase" as any,
      risk_band: "legacy_risk" as any,
      pending_confirmation: { kind: "legacy_pending" },
    },
    sourceRiskBand: "low",
    signals: emptySafetySignal({
      uncertainty: "high",
    }),
    dispatcherOutput: dispatcherOutput({
      flow_action: "answer_safety_check",
      evidence: ["unclear legacy continuation"],
    }),
  });

  assertEquals(reduced.phase, "stabilizing");
  assertEquals((reduced.statePatch as any).pending_confirmation, {
    kind: "legacy_pending",
  });
  assertEquals(reduced.visibleTask.kind, "stabilizing");
  assertEquals(reduced.stateMutationAudit.rejected_changes.length, 0);
});

Deno.test("safety_crisis merge audit rejects server-owned mutation declarations as non-authoritative", () => {
  const merged = mergeSafetyCrisisLocalState({
    previous: {
      phase: "support_contact",
      pending_offer: { id: "offer-1" },
    },
    output: dispatcherOutput({
      modified_fields: ["pending_offer"],
      clear_fields: ["pending_offer"],
    }),
    transition: {
      phase: "support_contact",
      reason_code: "safety_crisis.support_contact",
      resolved: false,
    },
    computed: {
      phase: "support_contact",
      risk_band: "medium",
      immediate_danger: null,
      has_means_nearby: false,
      user_not_alone: null,
      emergency_help_mentioned: false,
      human_support_mentioned: false,
      consecutive_deescalated_turns: 0,
      last_user_safety_signal: "support needed",
      last_assistant_safety_step: "safety_step=support_contact",
      trigger_summary: null,
      exit_memo: null,
      summary: "Safety support active.",
    },
    now: "2026-06-15T00:00:00.000Z",
  });

  assertEquals((merged.statePatch as any).pending_offer, { id: "offer-1" });
  assertEquals(merged.audit.restored_fields.includes("pending_offer"), true);
  assertEquals(merged.audit.rejected_changes.length, 2);
});

Deno.test("safety_crisis skill defers product or tool attempts with no effects", async () => {
  try {
    setSafetyCrisisLocalDispatcherForTest(async () =>
      dispatcherOutput({
        flow_action: "product_or_tool_attempt",
        safety_signals: {
          immediate_danger: false,
          has_means_nearby: false,
          user_currently_alone: true,
          uncertainty: "medium",
        },
        product_tool_boundary: {
          attempted: true,
          attempt_kind: "tool_creation",
          defer_reason: "user asks for a regulation product during safety",
        },
      })
    );
    setSafetyCrisisVisibleAgentForTest(async (input) => {
      assertEquals(input.visible_task.kind, "product_tool_boundary");
      return "Je laisse cette demande de cote maintenant. Es-tu en securite immediate ?";
    });
    const context = await loadSafetyCrisisContext(contextInput({
      active_skill_working_state: {
        version: 1,
        skill_id: "safety_crisis",
        status: "active",
        turn_count: 1,
        started_at: "2026-06-08T00:00:00.000Z",
        updated_at: "2026-06-08T00:00:00.000Z",
        user_id: "user-safety-local",
        scope: "whatsapp",
        working_state: {
          phase: "support_contact",
          has_means_nearby: false,
          user_not_alone: false,
        },
      },
      turn_frame: turnFrame({
        safety: {
          risk_band: "medium",
          reason_codes: ["active_safety_flow_caution"],
          evidence: [],
        },
      }),
    }));
    const output = await runSafetyCrisisSkill({
      user_message: "ok lance une potion pour m'aider",
      context,
    });
    assertEquals(output.status, "continue");
    assertEquals(
      (output.state_patch?.visible_task as any)?.kind,
      "product_tool_boundary",
    );
    assertEquals(
      (output.state_patch?.visible_task as any)?.conversation_context
        ?.handoff_data?.deferred_product_or_tool_request,
      "user asks for a regulation product during safety",
    );
    assertEquals((output.diagnosis as any)?.visible_agent_ok, true);
    assertEquals((output.diagnosis as any)?.visible_fallback_used, false);
    assertEquals(output.effects?.requested.length, 0);
    assertEquals(output.effects?.allowed.length, 0);
    assertEquals(output.effects?.committed.length, 0);
    assertEquals(output.recommendation_need?.needed, false);
  } finally {
    setSafetyCrisisLocalDispatcherForTest(null);
    setSafetyCrisisVisibleAgentForTest(null);
  }
});

Deno.test("safety_crisis skill reads legacy active state and exposes mutation audit", async () => {
  try {
    setSafetyCrisisLocalDispatcherForTest(async () =>
      dispatcherOutput({
        flow_action: "provide_support_status",
        safety_signals: {
          immediate_danger: false,
          has_means_nearby: false,
          user_currently_alone: false,
          human_support_available: true,
          clarified_non_immediate: true,
          deescalation_evidence: true,
          uncertainty: "low",
        },
      })
    );
    setSafetyCrisisVisibleAgentForTest(async (input) => {
      assertEquals(input.visible_task.kind, "exit_check");
      return "Reste avec ton frere. Est-ce que tu confirmes que le danger immediat est absent ?";
    });
    const context = await loadSafetyCrisisContext(contextInput({
      active_skill_working_state: {
        version: 1,
        skill_id: "safety_crisis",
        status: "active",
        user_id: "user-safety-local",
        scope: "whatsapp",
        turn_count: 2,
        started_at: "2026-06-15T00:00:00.000Z",
        updated_at: "2026-06-15T00:05:00.000Z",
        working_state: {
          phase: "support_contact",
          has_means_nearby: false,
          user_not_alone: false,
        },
      },
      turn_frame: turnFrame({
        safety: { risk_band: "medium", reason_codes: [], evidence: [] },
      }),
    }));
    const output = await runSafetyCrisisSkill({
      user_message: "mon frere est avec moi maintenant",
      context,
    });

    assertEquals(output.status, "continue");
    assertEquals((output.diagnosis as any)?.state_mutation_audit != null, true);
    assertEquals(
      Array.isArray(
        (output.diagnosis as any)?.state_mutation_audit?.server_owned_fields,
      ),
      true,
    );
  } finally {
    setSafetyCrisisLocalDispatcherForTest(null);
    setSafetyCrisisVisibleAgentForTest(null);
  }
});

Deno.test("safety_crisis skill exposes direct handoff flag only for actionable one-shot reminder", async () => {
  try {
    setSafetyCrisisLocalDispatcherForTest(async () =>
      dispatcherOutput({
        flow_action: "provide_deescalation_evidence",
        safety_signals: {
          immediate_danger: false,
          has_means_nearby: false,
          user_currently_alone: false,
          human_support_available: true,
          clarified_non_immediate: true,
          deescalation_evidence: true,
          uncertainty: "low",
        },
        direct_effect_request: {
          requested: true,
          effect_type: "create_one_shot_reminder",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "high",
          payload_hint: {
            raw_text:
              "rappelle-moi dans 30 minutes de verifier que je suis en securite",
            when_hint: "dans 30 minutes",
            UTC_time: "2026-06-24T12:30:00.000Z",
            local_label: "dans 30 minutes",
            instruction_hint: "verifier que je suis en securite",
          },
          reason: "explicit reminder",
        },
      })
    );
    setSafetyCrisisVisibleAgentForTest(async () =>
      "On garde la securite en premier."
    );
    const context = await loadSafetyCrisisContext(contextInput());
    const output = await runSafetyCrisisSkill({
      user_message:
        "rappelle-moi dans 30 minutes de verifier que je suis en securite",
      context,
    });
    assertEquals(
      (output.diagnosis as any)?.local_flow_trace?.direct_handoff_flag,
      true,
    );
    assertEquals(
      (output.diagnosis as any)?.local_flow_trace?.selected_target,
      "rappelle-moi dans 30 minutes de verifier que je suis en securite",
    );

    setSafetyCrisisLocalDispatcherForTest(async () =>
      dispatcherOutput({
        flow_action: "answer_safety_check",
        direct_effect_request: {
          requested: false,
          effect_type: null,
          explicitness: "none",
          target_status: "none",
          confidence_band: "low",
          payload_hint: {
            raw_text: null,
            when_hint: null,
            UTC_time: null,
            local_label: null,
            instruction_hint: null,
          },
          reason: null,
        },
      })
    );
    const nonActionable = await runSafetyCrisisSkill({
      user_message: "je vais essayer de me rappeler de respirer",
      context,
    });
    assertEquals(
      (nonActionable.diagnosis as any)?.local_flow_trace?.direct_handoff_flag,
      false,
    );
  } finally {
    setSafetyCrisisLocalDispatcherForTest(null);
    setSafetyCrisisVisibleAgentForTest(null);
  }
});

Deno.test("safety_crisis first activation note is consumed by local dispatcher and filtered into conversation_context", async () => {
  const rawUserMessage = "je risque de me faire du mal maintenant";
  const note = buildSafetyCrisisActivationNoteInformation({
    userMessage: rawUserMessage,
    sourceMessageId: "message-first-safety",
    requestId: "request-first-safety",
    safetyContextOutput: {
      detected: true,
      risk_band: "high",
      reason_codes: ["explicit_suicidal_thoughts"],
      evidence: ["safety context evidence"],
      allow_side_effects: false,
      layer_contributions: {},
    } as any,
  });
  let dispatcherSawInboundNote = false;
  try {
    setSafetyCrisisLocalDispatcherForTest(async (input) => {
      dispatcherSawInboundNote =
        input.note_information_inbound?.target_dispatcher ===
          "safety_crisis";
      assertEquals(
        input.note_information_inbound?.structured_context
          ?.target_dispatcher,
        "safety_crisis",
      );
      return dispatcherOutput({
        flow_action: "answer_safety_check",
        safety_signals: {
          suicidal_ideation: true,
          immediate_danger: true,
          uncertainty: "medium",
        },
      });
    });
    setSafetyCrisisVisibleAgentForTest(async (input) => {
      const summary = input.visible_task.conversation_context.handoff_data
        .inbound_note_summary;
      assert(summary);
      assert(summary.includes("source=global"));
      assert(summary.includes("reason=safety"));
      assert(!summary.includes(rawUserMessage));
      assert(!summary.includes("user_words"));
      assert(!summary.includes("structured_context"));
      return "Tu es en danger immediat la maintenant ? Si oui, appelle le 15 ou 112, ou le 3114.";
    });
    const context = await loadSafetyCrisisContext(contextInput({
      turn_frame: turnFrame({
        note_information: note,
        safety: {
          risk_band: "high",
          reason_codes: ["explicit_suicidal_thoughts"],
          evidence: ["safety context evidence"],
        },
      }),
    }));
    const output = await runSafetyCrisisSkill({
      user_message: rawUserMessage,
      context,
    });

    assertEquals(dispatcherSawInboundNote, true);
    assertEquals((output.diagnosis as any)?.visible_agent_ok, true);
    assertEquals(
      (output.state_patch?.visible_task as any)?.conversation_context
        ?.handoff_data?.inbound_note_summary.includes(rawUserMessage),
      false,
    );
  } finally {
    setSafetyCrisisLocalDispatcherForTest(null);
    setSafetyCrisisVisibleAgentForTest(null);
  }
});

Deno.test("safety_crisis visible generation failure falls back to deterministic safety message", async () => {
  try {
    setSafetyCrisisLocalDispatcherForTest(async () =>
      dispatcherOutput({
        flow_action: "answer_safety_check",
        safety_signals: {
          immediate_danger: true,
          uncertainty: "medium",
        },
      })
    );
    setSafetyCrisisVisibleAgentForTest(async () => null);
    const context = await loadSafetyCrisisContext(contextInput({
      turn_frame: turnFrame({
        safety: {
          risk_band: "high",
          reason_codes: ["self_harm_risk"],
          evidence: ["test"],
        },
      }),
    }));
    const output = await runSafetyCrisisSkill({
      user_message: "je ne suis pas en securite",
      context,
    });
    assertEquals((output.diagnosis as any)?.visible_agent_ok, false);
    assertEquals((output.diagnosis as any)?.visible_fallback_used, true);
    assertEquals((output.diagnosis as any)?.visible_generation_failed, true);
    assert((output.reply ?? "").length > 0);
  } finally {
    setSafetyCrisisLocalDispatcherForTest(null);
    setSafetyCrisisVisibleAgentForTest(null);
  }
});

Deno.test("safety_crisis runtime skips global dispatcher while safety owns the turn", () => {
  assertEquals(
    shouldSkipGlobalDispatcherForSafetyLocalTurn({
      activeSkillState: {
        skill_id: "safety_crisis",
        status: "active",
        working_state: { phase: "acute_grounding" },
      },
      safetyContextOutput: { risk_band: "low", reason_codes: [] },
    }),
    true,
  );
  assertEquals(
    shouldSkipGlobalDispatcherForSafetyLocalTurn({
      activeSkillState: null,
      safetyContextOutput: { risk_band: "high", reason_codes: [] },
    }),
    true,
  );
  assertEquals(
    shouldSkipGlobalDispatcherForSafetyLocalTurn({
      activeSkillState: null,
      safetyContextOutput: { risk_band: "low", reason_codes: [] },
    }),
    false,
  );
});

Deno.test("safety_crisis first activation note_information carries doctrine fields", () => {
  const note = buildSafetyCrisisActivationNoteInformation({
    userMessage: "je risque de me faire du mal maintenant",
    sourceMessageId: "message-first-safety",
    requestId: "request-first-safety",
    safetyContextOutput: {
      detected: true,
      risk_band: "high",
      reason_codes: ["explicit_suicidal_thoughts"],
      evidence: ["safety context evidence"],
      allow_side_effects: false,
      layer_contributions: {},
    } as any,
  });

  assertEquals(note.source_flow_id, "global");
  assertEquals(note.target_dispatcher, "safety_crisis");
  assertEquals(note.handoff_reason, "safety");
  assertEquals(note.structured_context.source_flow, "global");
  assertEquals(note.structured_context.target_dispatcher, "safety_crisis");
  assertEquals(note.structured_context.handoff_reason, "safety");
  assertEquals(
    note.structured_context.user_message_summary,
    "je risque de me faire du mal maintenant",
  );
  assertEquals(
    (note.structured_context.collected_state as any).first_activation,
    true,
  );
  assertEquals(note.structured_context.unresolved_questions, [
    "immediate_danger_absent",
    "means_safe",
    "human_support_available",
  ]);
  assertEquals(
    note.structured_context.recommended_next_focus,
    "Assess immediate danger, means proximity, whether the user is alone, and human or emergency support.",
  );
});

Deno.test("safety_crisis resolved exit stores note_information for next dispatcher", () => {
  const now = "2026-06-09T00:00:00.000Z";
  const reduction = reduceSafetyCrisis({
    previousState: {
      phase: "exit_check",
      consecutive_deescalated_turns: 1,
    },
    sourceRiskBand: "medium",
    signals: emptySafetySignal({
      immediate_danger: false,
      has_means_nearby: false,
      user_currently_alone: false,
      human_support_available: true,
      clarified_non_immediate: true,
      deescalation_evidence: true,
      uncertainty: "low",
    }),
    dispatcherOutput: dispatcherOutput({
      flow_action: "provide_deescalation_evidence",
    }),
    currentUserMessage: "je suis avec ma cousine et loin des medicaments",
  });
  const next = applySafetyCrisisExitStateIfNeeded({
    tempMemory: {},
    selectedSkillId: "safety_crisis",
    skillOutput: {
      skill_id: "safety_crisis",
      status: "exit",
      response_intent: "deescalate_and_exit",
      reply: "ok",
      state_patch: reduction.statePatch,
    } as any,
    previous: {
      skill_id: "safety_crisis",
      status: "active",
      working_state: {},
    },
    workingState: reduction.statePatch as any,
    now,
  });
  assertEquals(
    (next?.__last_safety_crisis_exit_memo as any)?.note_information
      ?.target_dispatcher,
    "global",
  );
  assertEquals((next as any)?.__active_skill_state, undefined);
});

Deno.test("safety_crisis reducer releases flow on explicit correction with risk none", () => {
  const released = reduceSafetyCrisis({
    previousState: {
      phase: "support_contact",
      risk_band: "high",
      consecutive_deescalated_turns: 1,
    },
    sourceRiskBand: "none",
    signals: emptySafetySignal({
      clarified_non_immediate: true,
      deescalation_evidence: true,
      immediate_danger: false,
      uncertainty: "low",
    }),
    dispatcherOutput: dispatcherOutput({
      flow_action: "provide_deescalation_evidence",
    }),
  });
  assertEquals(released.phase, "resolved");
  assertEquals(released.riskBand, "low");
  assertEquals(released.visibleTask.kind, "resolved_exit");
});

Deno.test("safety_crisis reducer keeps flow latched on correction without prior deescalated turn", () => {
  const stillActive = reduceSafetyCrisis({
    previousState: {
      phase: "acute_grounding",
      risk_band: "high",
      consecutive_deescalated_turns: 0,
    },
    sourceRiskBand: "none",
    signals: emptySafetySignal({
      clarified_non_immediate: true,
      deescalation_evidence: true,
      uncertainty: "medium",
    }),
    dispatcherOutput: dispatcherOutput({
      flow_action: "provide_deescalation_evidence",
    }),
  });
  assert(stillActive.phase !== "resolved");
});

Deno.test("safety_crisis reducer lets working risk band descend on attested deescalation", () => {
  const descending = reduceSafetyCrisis({
    previousState: {
      phase: "exit_check",
      risk_band: "high",
      consecutive_deescalated_turns: 2,
      human_support_mentioned: true,
    },
    sourceRiskBand: "none",
    signals: emptySafetySignal({
      deescalation_evidence: true,
      human_support_available: true,
      uncertainty: "low",
    }),
    dispatcherOutput: dispatcherOutput({
      flow_action: "provide_support_status",
    }),
  });
  assert(descending.riskBand !== "high");
  assert(descending.riskBand !== "critical");
});

Deno.test("safety_crisis reducer keeps risk band floor without deescalation evidence", () => {
  const latched = reduceSafetyCrisis({
    previousState: {
      phase: "exit_check",
      risk_band: "high",
      consecutive_deescalated_turns: 0,
    },
    sourceRiskBand: "none",
    signals: emptySafetySignal({
      uncertainty: "high",
    }),
    dispatcherOutput: dispatcherOutput({
      flow_action: "provide_support_status",
    }),
  });
  assertEquals(latched.riskBand, "high");
});

Deno.test("safety_crisis first activation without known facts opens on risk check, not stabilizing directives (chantier Y)", () => {
  // Premiere activation (aucune phase anterieure), ideation passive medium,
  // aucun fait connu (moyens/solitude/support inconnus): le premier beat doit
  // etre accueil + verification du danger — pas le script directif de
  // stabilisation ("reste assis, eloigne-toi des moyens"), qui sur-escalade
  // un tour non imminent (observe en probe chantier S).
  const reduced = reduceSafetyCrisis({
    previousState: {},
    sourceRiskBand: "medium",
    signals: emptySafetySignal({}),
    dispatcherOutput: dispatcherOutput({
      flow_action: "answer_safety_check",
      evidence: ["ça changerait pas grand-chose si j'étais plus là"],
    }),
  });

  assertEquals(reduced.phase, "immediate_risk_check");
  assertEquals(reduced.visibleTask.kind, "immediate_risk_check");
});
