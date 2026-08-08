import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import type { TurnFrame } from "../../contracts/turn_frame.v1.ts";
import type { LoadSkillContextInput } from "../_shared/context.ts";
import { emptySafetySignal, type SafetyCrisisVisibleTask } from "./contract.ts";
import { loadSafetyCrisisContext } from "./context_loader.ts";
import {
  dispatcherSystemPrompt,
  normalizeSafetyCrisisLocalDispatcherOutput,
  oneShotDirectEffectFromSafetyCrisisLocalDispatcherOutput,
  safetyCrisisOneShotDirectEffectDecision,
  setSafetyCrisisLocalDispatcherForTest,
} from "./local_dispatcher.ts";
import {
  normalizeLocalOneShotDirectEffectRequest,
  oneShotDirectEffectFromLocalRequest,
} from "../../router/one_shot_local_direct_effect.ts";
import { mergeSafetyCrisisLocalState, reduceSafetyCrisis } from "./reducer.ts";
import { runSafetyCrisisSkill } from "./skill.ts";
import {
  safetyCrisisDeterministicVisibleMessage,
  setSafetyCrisisVisibleAgentForTest,
  visibleSystemPromptForSafetyCrisisTest,
} from "./visible_agent.ts";
import { resolveSafetyResourceNumbers } from "../../../_shared/keel/crisis_resources.ts";
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
    response_locale: "en-US",
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
    response_locale: "en-US",
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
      response_locale: "en-US",
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
    response_locale: "en-US",
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
      response_locale: "en-US",
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
      content_risk: "safe",
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
  // P3-A (alex-safety-escalation R1-B01): AUCUN effet ne se committe depuis
  // un tour de crise — la demande explicite saine est DIFFÉRÉE honnêtement,
  // plus jamais exposée comme effet exécutable (l'ancien contrat committait
  // un rappel trivial au milieu d'une crise suicidaire).
  const crisisDecision = safetyCrisisOneShotDirectEffectDecision(reminder);
  assertEquals(crisisDecision.effect, null);
  assert(crisisDecision.deferred_reason);
  assertEquals(
    oneShotDirectEffectFromSafetyCrisisLocalDispatcherOutput(reminder),
    null,
  );
});

Deno.test("safety reminder admission: escalate, contenu flagged et confiance moyenne ne creent jamais (eva-r9 B01)", () => {
  const safeRequest = {
    requested: true,
    effect_type: "create_one_shot_reminder",
    explicitness: "explicit",
    target_status: "identified",
    confidence_band: "high",
    content_risk: "safe",
    payload_hint: {
      raw_text: "rappelle-moi ce soir a 21h de couper le telephone",
      when_hint: "ce soir a 21h",
      UTC_time: "2026-07-08T19:00:00.000Z",
      local_label: "ce soir a 21:00",
      instruction_hint: "couper le telephone",
    },
    reason: "rappel explicite",
  };

  // P3-A: demande explicite, contenu safe, tour non escalade → DIFFÉRÉE
  // (plus jamais servie depuis un tour de crise — le medium non-crise passe
  // par la route distress_support, hors de ce flow).
  const admitted = safetyCrisisOneShotDirectEffectDecision(dispatcherOutput({
    flow_action: "provide_support_status",
    safety_signals: { immediate_danger: false, uncertainty: "low" },
    direct_effect_request: safeRequest,
  }));
  assertEquals(admitted.effect, null);
  assert(admitted.deferred_reason);

  // Escalade (flow_action ou immediate_danger): jamais servie, et pas de stage
  // boundary non plus (il degraderait le stage d'urgence du reducer).
  for (
    const escalated of [
      { flow_action: "safety_escalate", safety_signals: { uncertainty: "low" } },
      {
        flow_action: "provide_support_status",
        safety_signals: { immediate_danger: true, uncertainty: "low" },
      },
    ]
  ) {
    const decision = safetyCrisisOneShotDirectEffectDecision(dispatcherOutput({
      ...escalated,
      direct_effect_request: safeRequest,
    }));
    assertEquals(decision.effect, null);
    assertEquals(decision.deferred_reason, null);
  }

  // Contenu flagged (substances/moyens): ni cree, ni promis pour apres.
  const flagged = safetyCrisisOneShotDirectEffectDecision(dispatcherOutput({
    flow_action: "provide_support_status",
    safety_signals: { immediate_danger: false, uncertainty: "low" },
    direct_effect_request: { ...safeRequest, content_risk: "flagged" },
  }));
  assertEquals(flagged.effect, null);
  assertEquals(flagged.deferred_reason, null);

  // Confiance moyenne ou jugement de contenu absent: fail-closed pendant la
  // crise, MAIS differe honnetement (le visible dira « pour apres »).
  for (
    const request of [
      { ...safeRequest, confidence_band: "medium" },
      { ...safeRequest, content_risk: null },
    ]
  ) {
    const decision = safetyCrisisOneShotDirectEffectDecision(dispatcherOutput({
      flow_action: "provide_support_status",
      safety_signals: { immediate_danger: false, uncertainty: "low" },
      direct_effect_request: request,
    }));
    assertEquals(decision.effect, null);
    assert(decision.deferred_reason);
  }

  // Anti-faux-positif hors safety: un flow local sans jugement de contenu
  // (content_risk null) reste accepte par la porte partagee; seul "flagged"
  // bloque partout.
  const withoutJudgement = normalizeLocalOneShotDirectEffectRequest({
    ...safeRequest,
    content_risk: undefined,
  });
  assert(oneShotDirectEffectFromLocalRequest(withoutJudgement));
  const sharedFlagged = normalizeLocalOneShotDirectEffectRequest({
    ...safeRequest,
    content_risk: "flagged",
  });
  assertEquals(oneShotDirectEffectFromLocalRequest(sharedFlagged), null);
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
  // W2.D-2 — CONTRACT GAP: `reducer.ts:483` emits `emergency_numbers_already_delivered` in
  // `known_values`, but `SafetyCrisisConversationContext.known_values`
  // (skills/safety_crisis/contract.ts:127-137) does not declare it. The runtime value is real
  // (this assertion passes); only the type is behind. `visible_agent.ts:190` works around the
  // same gap with its own cast. Widening the contract type is the durable fix.
  const knownValues = context.known_values as typeof context.known_values & {
    emergency_numbers_already_delivered?: boolean;
  };
  assertEquals(knownValues.emergency_numbers_already_delivered, true);
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
      // W2.D-2 — `emergency_numbers_delivered` became required on SafetyCrisisStatePatch
      // (reducer.ts:913) after this case was written. This case is about the mutation-audit
      // rejecting server-owned declarations, not about hotline delivery: `false` is the
      // neutral value and leaves the assertions below unchanged.
      emergency_numbers_delivered: false,
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

Deno.test("safety_crisis reducer consumes triage answers: danger denied + alone answered → support phase, never re-triage (rose-r5 B02)", () => {
  // Le user vient de repondre au triage: pas de danger, mais seule.
  const answered = reduceSafetyCrisis({
    previousState: {
      phase: "immediate_risk_check",
      risk_band: "medium",
    },
    sourceRiskBand: "medium",
    signals: emptySafetySignal({
      immediate_danger: false,
      user_currently_alone: true,
      clarified_non_immediate: true,
    }),
    dispatcherOutput: dispatcherOutput({
      flow_action: "answer_safety_check",
      risk_score: 5,
      safety_signals: {
        immediate_danger: false,
        user_currently_alone: true,
        clarified_non_immediate: true,
        uncertainty: "low",
      },
    }),
  });
  // La reponse est consommee: on passe au soutien (adresser la solitude),
  // jamais un retour au meme triage.
  assertEquals(answered.phase, "support_contact");

  // Anti-faux-positif: reponse ambigue (danger inconnu, solitude inconnue)
  // → le triage reste legitime.
  const ambiguous = reduceSafetyCrisis({
    previousState: {
      phase: "immediate_risk_check",
      risk_band: "medium",
    },
    sourceRiskBand: "medium",
    signals: emptySafetySignal({
      clarified_non_immediate: true,
    }),
  });
  assertEquals(ambiguous.phase, "immediate_risk_check");

  // Danger explicite → l'escalade prime toujours sur la consommation.
  const danger = reduceSafetyCrisis({
    previousState: {
      phase: "immediate_risk_check",
      risk_band: "medium",
    },
    sourceRiskBand: "high",
    signals: emptySafetySignal({
      immediate_danger: true,
      user_currently_alone: true,
    }),
  });
  assertEquals(danger.phase, "acute_grounding");
});

// ── P6-B (paul-hard21 R1-B02, T14) ──────────────────────────────────────────

Deno.test("safety_crisis reducer: moyens JAMAIS évoqués ⇒ confirmation explicite atteint exit_check puis resolved (P6-B, paul-hard21 R1-B02)", () => {
  // T15 paul : « je me sens en sécurité, aucune envie de me faire du mal »,
  // copine présente, AUCUN moyen évoqué de toute la crise. Avant le fix :
  // means_safe_missing → sentry infini, différé orphelin.
  const step1 = reduceSafetyCrisis({
    previousState: {
      phase: "stabilizing",
      consecutive_deescalated_turns: 1,
      // has_means_nearby jamais posé (null) — moyens hors du jeu.
    },
    sourceRiskBand: "medium",
    signals: emptySafetySignal({
      immediate_danger: false,
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
  assertEquals(step1.phase, "exit_check");
  const step2 = reduceSafetyCrisis({
    previousState: {
      phase: "exit_check",
      consecutive_deescalated_turns: 2,
    },
    sourceRiskBand: "medium",
    signals: emptySafetySignal({
      immediate_danger: false,
      user_currently_alone: false,
      human_support_available: true,
      clarified_non_immediate: true,
      deescalation_evidence: true,
      uncertainty: "low",
    }),
    dispatcherOutput: dispatcherOutput({
      flow_action: "wants_to_exit",
      exit_request: {
        requested: true,
        why_user_thinks_safe:
          "je me sens en sécurité, aucune envie de me faire du mal, ma copine est là",
        missing_resolution_facts: [],
      },
    }),
  });
  assertEquals(step2.phase, "resolved");
  assertEquals(step2.visibleTask.kind, "resolved_exit");
});

Deno.test("safety_crisis reducer: tours bénins band none SANS signaux locaux ⇒ promotion stabilizing→exit_check→resolved (P7-A, paul-p6reval R1-B03)", () => {
  // T15-T16 paul : la crise est stabilisée (copine présente, « je ferais
  // rien »), le user parle de son rappel kiné et de son recall — le
  // dispatcher local n'émet PLUS aucun signal safety (tout à null). Avant le
  // fix : la sortie exigeait que le tour courant re-confirme les faits →
  // stabilizing infini, différé jamais re-servi.
  const step1 = reduceSafetyCrisis({
    previousState: {
      phase: "stabilizing",
      consecutive_deescalated_turns: 1,
      human_support_mentioned: true,
      // immediate_danger / has_means_nearby jamais posés (idéation passive).
    },
    sourceRiskBand: "none",
    signals: emptySafetySignal({ uncertainty: "low" }),
    dispatcherOutput: dispatcherOutput({
      flow_action: "provide_support_status",
    }),
  });
  assertEquals(step1.phase, "exit_check");
  const step2 = reduceSafetyCrisis({
    previousState: {
      phase: "exit_check",
      consecutive_deescalated_turns: 2,
      human_support_mentioned: true,
    },
    sourceRiskBand: "none",
    signals: emptySafetySignal({ uncertainty: "low" }),
    dispatcherOutput: dispatcherOutput({
      flow_action: "wants_to_exit",
      exit_request: {
        requested: true,
        why_user_thinks_safe: "ça va vraiment mieux, c'était un coup de fatigue",
        missing_resolution_facts: [],
      },
    }),
  });
  assertEquals(step2.phase, "resolved");
});

Deno.test("safety_crisis reducer: déni explicite persisté + bande none ⇒ sortie sans re-confirmation par-tour (P7-A, rose-hard19 R1-B03 paraphrase)", () => {
  // T13 rose : « aucune envie de me faire du mal, zéro » (immediate_danger
  // false PERSISTÉ), T14 : demande du rappel bénin, bande none, signaux
  // locaux muets — la sortie consomme le fait établi.
  const reduced = reduceSafetyCrisis({
    previousState: {
      phase: "exit_check",
      consecutive_deescalated_turns: 1,
      immediate_danger: false,
      user_not_alone: true,
      human_support_mentioned: true,
    },
    sourceRiskBand: "none",
    signals: emptySafetySignal({ uncertainty: "low" }),
    dispatcherOutput: dispatcherOutput({
      flow_action: "wants_to_exit",
      exit_request: {
        requested: true,
        why_user_thinks_safe: "je te l'ai dit, aucune envie de me faire du mal",
        missing_resolution_facts: [],
      },
    }),
  });
  assertEquals(reduced.phase, "resolved");
});

Deno.test("safety_crisis reducer: idéation RÉ-EXPRIMÉE ou bande medium ⇒ aucune promotion, l'état colle (P7-A anti-FP)", () => {
  // Nouveau signal de risque : le compteur retombe, pas de exit_check.
  const reExpressed = reduceSafetyCrisis({
    previousState: {
      phase: "stabilizing",
      consecutive_deescalated_turns: 2,
      human_support_mentioned: true,
    },
    sourceRiskBand: "none",
    signals: emptySafetySignal({
      suicidal_ideation: true,
      uncertainty: "low",
    }),
    dispatcherOutput: dispatcherOutput({
      flow_action: "answer_safety_check",
    }),
  });
  assert(reExpressed.phase !== "exit_check");
  assert(reExpressed.phase !== "resolved");
  // Bande encore medium : pas de crédit de désescalade par bande.
  const stillMedium = reduceSafetyCrisis({
    previousState: {
      phase: "stabilizing",
      consecutive_deescalated_turns: 1,
      human_support_mentioned: true,
    },
    sourceRiskBand: "medium",
    signals: emptySafetySignal({ uncertainty: "low" }),
    dispatcherOutput: dispatcherOutput({
      flow_action: "provide_support_status",
    }),
  });
  assertEquals(stillMedium.phase, "stabilizing");
});

Deno.test("safety_crisis reducer: moyens ÉVOQUÉS ⇒ l'exigence stricte means_safe reste entière (P6-B anti-FP)", () => {
  const blocked = reduceSafetyCrisis({
    previousState: {
      phase: "exit_check",
      consecutive_deescalated_turns: 2,
      has_means_nearby: true,
    },
    sourceRiskBand: "medium",
    signals: emptySafetySignal({
      immediate_danger: false,
      user_currently_alone: false,
      human_support_available: true,
      clarified_non_immediate: true,
      deescalation_evidence: true,
      uncertainty: "low",
    }),
    dispatcherOutput: dispatcherOutput({
      flow_action: "wants_to_exit",
      exit_request: {
        requested: true,
        why_user_thinks_safe: "ça va mieux",
        missing_resolution_facts: [],
      },
    }),
  });
  assert(blocked.phase !== "resolved");
});

Deno.test("safety_crisis reducer: aucune consigne moyens quand aucun moyen évoqué (P6-B, paul-hard21 T14)", () => {
  const reduced = reduceSafetyCrisis({
    previousState: { phase: "support_contact" },
    sourceRiskBand: "medium",
    signals: emptySafetySignal({
      immediate_danger: false,
      user_currently_alone: false,
      clarified_non_immediate: false,
      uncertainty: "medium",
    }),
    dispatcherOutput: dispatcherOutput({
      flow_action: "provide_deescalation_evidence",
    }),
  });
  assertEquals(
    reduced.visibleTask.conversation_context.do_not_say.some((line) =>
      line.includes("no means were ever mentioned")
    ),
    true,
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// FF-020 §8 — LE REPLI DÉTERMINISTE PORTE DES RESSOURCES
//
// 🔴 DÉFAUT MESURÉ (run contrôlé 2026-08-08, clé du modèle coupée, vrai visible
// agent): bande `high`, « je pense a me suicider », modèle indisponible →
// « Une chose d'abord : est-ce que tu es en danger immédiat, là, maintenant ? »
// et RIEN d'autre. §8 exige « la réponse visible existe ET elle contient des
// ressources ». Huit des onze gabarits partaient nus.
//
// Le mécanisme du défaut: le dispatcher local et le visible agent partagent le
// modèle. Sa panne vide les signaux, la phase retombe sur `immediate_risk_check`
// et `must_include_emergency_numbers` passe à false — la panne DÉCLASSAIT une
// crise aiguë en triage muet.
// ═══════════════════════════════════════════════════════════════════════════

const FF020_ALL_VISIBLE_KINDS = [
  "immediate_risk_check",
  "acute_grounding",
  "support_contact",
  "stabilizing",
  "exit_check",
  "resolved_exit",
  "repeat_current_step",
  "product_tool_boundary",
  "stop_or_cancel",
  "safety_transition",
  "safety_escalation",
] as const;

Deno.test("FF-020 §8 — chaque message déterministe porte au moins une ressource, pour chaque pays ET chaque langue", () => {
  // L1 — la boucle balaie maintenant les DEUX langues. Avant, elle balayait
  // 11 kinds × 4 pays = 44 combinaisons, toutes en français, et c'est cette
  // exhaustivité-là qui rendait le monolinguisme invisible: aucun axe de la
  // matrice ne portait la langue.
  for (const locale of ["fr-FR", "en-US"]) {
    const conjunction = locale === "fr-FR" ? "ou" : "or";
    for (const country of ["FR", "US", "GB", null]) {
      const numbers = resolveSafetyResourceNumbers(country, { conjunction });
      for (const kind of FF020_ALL_VISIBLE_KINDS) {
        const message = safetyCrisisDeterministicVisibleMessage(
          kind,
          numbers,
          locale,
        );
        assert(
          message.trim().length > 0,
          `${locale}/${country}/${kind}: message vide (R5)`,
        );
        assert(
          message.includes(numbers.emergency_numbers) ||
            message.includes(numbers.suicide_prevention_number),
          `${locale}/${country}/${kind}: aucune ressource dans le repli (§8) — "${message}"`,
        );
      }
    }
  }
});

/**
 * L1 — LE REPLI PARLE LA LANGUE DE L'ÉLÈVE.
 *
 * 🔴 DÉFAUT MESURÉ (FF-020 §C.1): les onze gabarits étaient des chaînes
 * françaises en dur, `looks_french = true` **33 fois sur 33** (11 kinds × 3
 * pays). Un élève américain dont le modèle tombait lisait « Appelle maintenant
 * le 911… le 988 répond 24h/24 »: les bons numéros, dans une langue qu'il ne
 * lit peut-être pas, sur le chemin de DERNIER recours.
 *
 * Condition de désarmement: aucune tant que le produit livre deux packs. Une
 * troisième langue s'ajoute ici et dans `visible_agent.ts`, dans cet ordre.
 */
Deno.test("L1 §8 — les onze gabarits de repli existent dans les DEUX langues, et ne se mélangent pas", () => {
  // Marqueurs choisis pour ne pas dépendre d'une phrase exacte: des mots
  // qu'une langue a et que l'autre n'a pas, sur des gabarits sans numéro.
  const FRENCH_MARKERS = [
    "danger immédiat",
    "sécurité",
    "à ton rythme",
    "de côté",
    "en danger",
    "d'accord",
    "reprendre",
    "l'essentiel",
    "personne de confiance",
  ];
  const numbers = resolveSafetyResourceNumbers("US", { conjunction: "or" });
  for (const kind of FF020_ALL_VISIBLE_KINDS) {
    const en = safetyCrisisDeterministicVisibleMessage(kind, numbers, "en-US")
      .toLowerCase();
    assertEquals(
      FRENCH_MARKERS.filter((m) => en.includes(m)),
      [],
      `${kind}: du français a fui dans le gabarit anglais — "${en}"`,
    );
    // Et le contrôle inverse, sans quoi la ceinture passerait sur deux packs
    // anglais identiques.
    const fr = safetyCrisisDeterministicVisibleMessage(
      kind,
      resolveSafetyResourceNumbers("FR", { conjunction: "ou" }),
      "fr-FR",
    );
    assert(
      fr !== safetyCrisisDeterministicVisibleMessage(
        kind,
        resolveSafetyResourceNumbers("FR", { conjunction: "ou" }),
        "en-US",
      ),
      `${kind}: FR et EN rendent le MÊME texte — un des deux packs est un alias`,
    );
  }
});

Deno.test("L1 §3 — une locale non livrée ne JETTE pas: elle dégrade sur l'anglais", () => {
  // `localePackKey` throw pour une langue non livrée (R7). Un throw ici serait
  // la panne DANS le gestionnaire de panne (§3): le repli utilise donc
  // `isFrenchLocale`, qui ne jette jamais.
  for (const locale of ["de-DE", "sw-KE", "", "  ", "xx"]) {
    const message = safetyCrisisDeterministicVisibleMessage(
      "safety_escalation",
      resolveSafetyResourceNumbers("US", { conjunction: "or" }),
      locale,
    );
    assert(message.includes("911"), `${locale}: ressource perdue`);
    assertEquals(
      message.includes("Appelle maintenant"),
      false,
      `${locale}: dégrade sur le FRANÇAIS au lieu de l'anglais`,
    );
  }
});

Deno.test("L1 §8 — la ligne de ressources ajoutée est dans la langue du gabarit", () => {
  // `withCrisisResourceLine` est ce qui a fermé le §8 (FF-020 B.1). Elle
  // portait « En cas de danger immédiat : … » en dur — donc une phrase
  // française collée sous un gabarit qui, lui, allait devenir anglais.
  const numbers = resolveSafetyResourceNumbers("US", { conjunction: "or" });
  const en = safetyCrisisDeterministicVisibleMessage(
    "immediate_risk_check",
    numbers,
    "en-US",
  );
  assert(en.includes("If you are in immediate danger: 911 · 988."), en);
  const fr = safetyCrisisDeterministicVisibleMessage(
    "immediate_risk_check",
    resolveSafetyResourceNumbers("FR", { conjunction: "ou" }),
    "fr-FR",
  );
  assert(fr.includes("En cas de danger immédiat : 15 ou 112 · 3114."), fr);
});

Deno.test("FF-020 §8 — les ressources du repli sont celles du PAYS, jamais d'un voisin", () => {
  const us = safetyCrisisDeterministicVisibleMessage(
    "immediate_risk_check",
    resolveSafetyResourceNumbers("US", { conjunction: "or" }),
    "en-US",
  );
  assert(us.includes("911") && us.includes("988"));
  assertEquals(us.includes("3114"), false);
  assertEquals(us.includes("116 123"), false);
  const de = safetyCrisisDeterministicVisibleMessage(
    "stabilizing",
    resolveSafetyResourceNumbers("DE", { conjunction: "ou" }),
    "fr-FR",
  );
  // Pays non ensemencé => jeu international, JAMAIS le 3114 d'un voisin.
  assertEquals(de.includes("3114"), false);
  assertEquals(de.includes("15 ou 112"), false);
  assert(de.includes("112") || de.includes("findahelpline"));
});

Deno.test("FF-020 §8 — la ligne de ressources ne se DOUBLE pas quand le gabarit les cite déjà", () => {
  const numbers = resolveSafetyResourceNumbers("FR", { conjunction: "ou" });
  const escalation = safetyCrisisDeterministicVisibleMessage(
    "safety_escalation",
    numbers,
    "fr-FR",
  );
  assertEquals(escalation.split("15 ou 112").length - 1, 1);
  assertEquals(escalation.split("3114").length - 1, 1);
  assertEquals(escalation.includes("En cas de danger immédiat"), false);
});

Deno.test("FF-020 §3/R1 — le repli reste PUR: ressources vides en entrée, aucun throw, message non vide", () => {
  for (const locale of ["fr-FR", "en-US"]) {
    for (const kind of FF020_ALL_VISIBLE_KINDS) {
      const message = safetyCrisisDeterministicVisibleMessage(kind, {
        emergency_numbers: "",
        suicide_prevention_number: "",
      }, locale);
      assert(
        message.trim().length > 0,
        `${locale}/${kind}: vide sur ressources vides`,
      );
    }
  }
});

Deno.test("FF-020 §8 — le tour de repli du SKILL porte les ressources, pas seulement du texte", async () => {
  try {
    // Le modèle est mort: le dispatcher local ne rend RIEN (comme en vrai —
    // les deux partagent la même clé) et le visible agent échoue.
    setSafetyCrisisLocalDispatcherForTest(async () => null);
    setSafetyCrisisVisibleAgentForTest(async () => null);
    const context = await loadSafetyCrisisContext(contextInput({
      turn_frame: turnFrame({
        safety: {
          risk_band: "high",
          reason_codes: ["suicidal_ideation"],
          evidence: ["ff020"],
        },
      }),
    }));
    const output = await runSafetyCrisisSkill({
      user_message: "je pense a me suicider",
      context: { ...context, student_country: "US" } as never,
    });
    const diagnosis = output.diagnosis as Record<string, unknown>;
    assertEquals(diagnosis.visible_fallback_used, true);
    const reply = String(output.reply ?? "");
    assert(reply.trim().length > 0, "R5: tour de sécurité vide");
    assert(
      reply.includes("911") || reply.includes("988"),
      `§8: aucune ressource dans le tour de repli — "${reply}"`,
    );
    assertEquals(reply.includes("3114"), false);
  } finally {
    setSafetyCrisisLocalDispatcherForTest(null);
    setSafetyCrisisVisibleAgentForTest(null);
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// FF-020 R2 — L'AXE PAYS DU REDUCER, TESTÉ
//
// Les 47 tests de ce fichier appelaient tous `reduceSafetyCrisis` SANS
// `userCountry`/`userLocale` (deux paramètres optionnels). Ils résolvaient donc
// tous, en silence, le défaut déclaré de la branche française — et l'axe que
// W4.2 a câblé n'était vérifié qu'au niveau du résolveur, jamais au niveau du
// reducer qui décide quoi en faire.
// ═══════════════════════════════════════════════════════════════════════════

function ff020Resources(args: {
  userCountry?: string | null;
  userLocale?: string | null;
}) {
  return reduceSafetyCrisis({
    previousState: {},
    sourceRiskBand: "high",
    signals: emptySafetySignal({ immediate_danger: true, uncertainty: "low" }),
    dispatcherOutput: dispatcherOutput({ flow_action: "answer_safety_check" }),
    ...args,
  }).visibleTask.conversation_context.safety_resources;
}

Deno.test("FF-020 R2 — le pays du profil gouverne les ressources du reducer", () => {
  assertEquals(ff020Resources({ userCountry: "US" }).emergency_numbers, "911");
  assertEquals(
    ff020Resources({ userCountry: "US" }).suicide_prevention_number,
    "988",
  );
  assertEquals(
    ff020Resources({ userCountry: "GB" }).emergency_numbers,
    "999 ou 112",
  );
  assertEquals(
    ff020Resources({ userCountry: "FR" }).suicide_prevention_number,
    "3114",
  );
});

Deno.test("FF-020 R2 — le pays gagne sur la locale, et un pays non ensemencé ne prend JAMAIS un voisin", () => {
  // Locale française, pays américain: 911, pas 15.
  assertEquals(
    ff020Resources({ userCountry: "US", userLocale: "fr-FR" })
      .emergency_numbers,
    "911",
  );
  const de = ff020Resources({ userCountry: "DE", userLocale: "fr-FR" });
  assertEquals(de.emergency_numbers, "112");
  assertEquals(de.suicide_prevention_number, "https://findahelpline.com");
});

Deno.test("FF-020 §7/§11 — pays ABSENT: la locale décide, et c'est un ÉCART assumé avec §7", () => {
  // §7 de la fiche dit « Pays absent du profil → jeu ZZ ». Le code retombe
  // d'abord sur la LOCALE (§11 le reconnaît). `profiles.locale` valant
  // `fr-FR` par défaut pour toute la flotte, un élève sans pays reçoit donc
  // les numéros FRANÇAIS. Ce test FIGE le comportement réel pour qu'un
  // arbitrage produit soit un changement visible, pas une dérive.
  const fr = ff020Resources({ userCountry: null, userLocale: "fr-FR" });
  assertEquals(fr.emergency_numbers, "15 ou 112");
  assertEquals(fr.suicide_prevention_number, "3114");
  // Une locale sans pays ensemencé, elle, atterrit bien sur le jeu ZZ.
  const zz = ff020Resources({ userCountry: null, userLocale: "de-DE" });
  assertEquals(zz.emergency_numbers, "112");
  assertEquals(zz.suicide_prevention_number, "https://findahelpline.com");
  // Ni pays ni locale: défaut déclaré de la branche (FR).
  assertEquals(
    ff020Resources({ userCountry: null, userLocale: null }).emergency_numbers,
    "15 ou 112",
  );
});
