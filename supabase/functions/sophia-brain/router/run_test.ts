import {
  attachPendingRecommendationOperation,
  buildSafetyLocalOwnershipFrame,
  computeStreakFromEntries,
  currentTurnConversationSkillOverrideForOrientation,
  currentTurnSupportsOrientationToolResolution,
  effectiveResponseOwnerForOperationRuntime,
  mapMomentumStateV2ToCoachingContext,
  maybeRunAdjustPlanItemOperation,
  resolveAgentChatModel,
  resolveCoachingTargetPlanItem,
  resolveOrientationClarificationConversationSkillHandler,
  resolveOrientationClarificationToolSkillHandler,
  shouldBypassOrientationClarificationForExplicitToolRoute,
  shouldDeferConversationRiskFlowExitToLocalDispatcher,
} from "./run.ts";
import { isExplicitPendingApplyConfirmation } from "../skills/weekly_review/runtime.ts";
import { logPlanItemProgressV2 } from "../tools/always_on/track_progress_plan_item/db.ts";
import { getGlobalAiModel } from "../../_shared/gemini.ts";
import { writeMomentumStateV2 } from "../momentum_state.ts";
import type {
  UserCycleRow,
  UserPlanItemRow,
  UserPlanV2Row,
  UserTransformationRow,
} from "../../_shared/v2-types.ts";

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${msg ? `${msg} - ` : ""}expected ${JSON.stringify(expected)} but got ${
        JSON.stringify(actual)
      }`,
    );
  }
}

function assertStringIncludes(actual: string, expected: string, msg?: string) {
  if (!actual.includes(expected)) {
    throw new Error(
      `${msg ? `${msg} - ` : ""}expected ${JSON.stringify(actual)} to include ${
        JSON.stringify(expected)
      }`,
    );
  }
}

function orientationTurnFrame(patch: Record<string, unknown> = {}): any {
  return {
    turn_id: "turn-orientation",
    source_message_id: "msg-orientation",
    user_id: "u1",
    channel: "web",
    safety: { risk_band: "none", reason_codes: [], evidence: [] },
    confirmation_response: { kind: "unknown", confidence_band: "low" },
    direct_effects: [],
    tool_skill_intents: [],
    flow_opportunity: null,
    skill_signals: { entry: {}, lifecycle: {}, exit: {} },
    memory_plan: {
      context_need: "minimal",
      memory_mode: "none",
      context_budget_tier: "tiny",
      targets: [],
      retrieval_policy: "taxonomy_first",
    },
    ...patch,
  };
}

Deno.test("isExplicitPendingApplyConfirmation blocks detail requests before validation", () => {
  assertEquals(
    isExplicitPendingApplyConfirmation(
      "Avant que je valide, confirme-moi juste que ca garde le signal de pause.",
    ),
    false,
  );
  assertEquals(
    isExplicitPendingApplyConfirmation(
      "Oui, valide cet ajustement et applique-le.",
    ),
    true,
  );
  assertEquals(
    isExplicitPendingApplyConfirmation(
      "Stop, on n'applique rien sur ce brouillon. Garde le plan tel quel.",
    ),
    false,
  );
  assertEquals(
    isExplicitPendingApplyConfirmation(
      "Ajoute juste cette nuance au brouillon. Ne valide toujours pas.",
    ),
    false,
  );
});

Deno.test("explicit central tool routes bypass orientation clarification", () => {
  const bypass = shouldBypassOrientationClarificationForExplicitToolRoute({
    routeDecision: {
      route_version: "v1",
      response_owner: "tool_skill",
      selected_handler: "prepare_attack_card",
      blocked_paths: [],
      direct_effects_to_run: [],
      reason_code: "central_arbitrator_explicit_attack_card_creation",
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
    },
    turnFrame: {
      turn_id: "t",
      source_message_id: "m",
      user_id: "u",
      channel: "web",
      safety: { risk_band: "none", reason_codes: [], evidence: [] },
      confirmation_response: { kind: "unknown", confidence_band: "low" },
      direct_effects: [],
      tool_skill_intents: [{
        operation_type: "prepare_attack_card",
        explicitness: "explicit",
        confidence_band: "high",
        ambiguity: "none",
        user_intent: "create",
      }],
      flow_opportunity: null,
      skill_signals: { entry: {}, lifecycle: {}, exit: {} },
      memory_plan: {
        context_need: "minimal",
        memory_mode: "none",
        context_budget_tier: "tiny",
        targets: [],
        retrieval_policy: "taxonomy_first",
      },
    } as any,
  });

  assertEquals(bypass, true);
});

Deno.test("ambiguous tool routes can still enter orientation clarification", () => {
  const bypass = shouldBypassOrientationClarificationForExplicitToolRoute({
    routeDecision: {
      route_version: "v1",
      response_owner: "tool_skill",
      selected_handler: "prepare_attack_card",
      blocked_paths: [],
      direct_effects_to_run: [],
      reason_code: "clarification_required",
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
    },
    turnFrame: {
      turn_id: "t",
      source_message_id: "m",
      user_id: "u",
      channel: "web",
      safety: { risk_band: "none", reason_codes: [], evidence: [] },
      confirmation_response: { kind: "unknown", confidence_band: "low" },
      direct_effects: [],
      tool_skill_intents: [{
        operation_type: "prepare_attack_card",
        explicitness: "explicit",
        confidence_band: "high",
        ambiguity: "intent_ambiguous",
        user_intent: "create",
      }],
      flow_opportunity: null,
      skill_signals: { entry: {}, lifecycle: {}, exit: {} },
      memory_plan: {
        context_need: "minimal",
        memory_mode: "none",
        context_budget_tier: "tiny",
        targets: [],
        retrieval_policy: "taxonomy_first",
      },
    } as any,
  });

  assertEquals(bypass, false);
});

Deno.test("safety active ownership builds direct local frame without global routing", () => {
  const result = buildSafetyLocalOwnershipFrame({
    turnId: "turn-safety-direct",
    sourceMessageId: "message-safety-direct",
    userId: "user-safety-direct",
    channel: "whatsapp",
    activeSkillState: {
      skill_id: "safety_crisis",
      status: "active",
      working_state: { phase: "support_contact" },
    },
    safetyContextOutput: {
      detected: true,
      risk_band: "medium",
      reason_codes: ["active_safety_flow_caution"],
      evidence: ["active safety context"],
      allow_side_effects: false,
      layer_contributions: {},
    } as any,
    conversationRiskHistory: [1, 2],
    userMessage: "ok",
    requestId: "request-safety-direct",
  });

  assertEquals(result.routeDecision.response_owner, "safety");
  assertEquals(result.routeDecision.selected_handler, "safety_crisis");
  assertEquals(
    result.routeDecision.reason_code,
    "safety_local_flow_owns_turn",
  );
  assertEquals(result.routeDecision.direct_effects_to_run, []);
  assertEquals(
    result.routeDecision.blocked_paths.map((path) => path.path).sort(),
    ["global_dispatcher", "global_router"],
  );
  assertEquals(result.turnFrame.tool_skill_intents, []);
  assertEquals(result.turnFrame.direct_effects, []);
  assertEquals(result.turnFrame.note_information, null);
  assertEquals(result.noteInformationCreated, false);
});

Deno.test("safety first activation direct local frame carries activation note", () => {
  const result = buildSafetyLocalOwnershipFrame({
    turnId: "turn-safety-first",
    sourceMessageId: "message-safety-first",
    userId: "user-safety-first",
    channel: "web",
    activeSkillState: null,
    safetyContextOutput: {
      detected: true,
      risk_band: "high",
      reason_codes: ["explicit_suicidal_thoughts"],
      evidence: ["safety context evidence"],
      allow_side_effects: false,
      layer_contributions: {},
    } as any,
    conversationRiskHistory: [],
    userMessage: "je risque de me faire du mal",
    requestId: "request-safety-first",
  });

  assertEquals(result.noteInformationCreated, true);
  assertEquals(
    result.turnFrame.note_information?.target_dispatcher,
    "safety_crisis",
  );
  assertEquals(result.turnFrame.note_information?.handoff_reason, "safety");
  assertEquals(result.routeDecision.response_owner, "safety");
  assertEquals(result.routeDecision.selected_handler, "safety_crisis");
});

Deno.test("conversation risk flow exit is deferred to active emotional repair dispatcher", () => {
  const defer = shouldDeferConversationRiskFlowExitToLocalDispatcher({
    activeSkillState: {
      skill_id: "emotional_repair",
      status: "active",
      working_state: {
        summary: "emotional repair active",
      },
    },
    conversationRisk: {
      score: 9,
      threshold: 8,
      should_exit_flows: true,
      reason_codes: ["topic_change"],
      previous_scores: [0],
      matrix: [],
      context_summary: null,
      flow_exit_context: {
        interrupted_flow_type: "conversation_skill",
        restart_scope: "same_message",
        active_conversation_skill_id: "emotional_repair",
        active_tool_skill_type: null,
        known_slots: null,
        pending_confirmation: null,
        last_user_message: "je change de sujet",
      },
    } as any,
  });

  assertEquals(defer, true);
});

Deno.test("conversation risk flow exit can clear when no local dispatcher is active", () => {
  const defer = shouldDeferConversationRiskFlowExitToLocalDispatcher({
    activeSkillState: null,
    conversationRisk: {
      score: 9,
      threshold: 8,
      should_exit_flows: true,
      reason_codes: ["topic_change"],
      previous_scores: [0],
      matrix: [],
      context_summary: null,
      flow_exit_context: {
        interrupted_flow_type: "none",
        restart_scope: "same_message",
        active_conversation_skill_id: null,
        active_tool_skill_type: null,
        known_slots: null,
        pending_confirmation: null,
        last_user_message: "je change de sujet",
      },
    } as any,
  });

  assertEquals(defer, false);
});

Deno.test("competing attack and defense card routes do not bypass orientation clarification", () => {
  const bypass = shouldBypassOrientationClarificationForExplicitToolRoute({
    routeDecision: {
      route_version: "v1",
      response_owner: "tool_skill",
      selected_handler: "prepare_defense_card",
      blocked_paths: [],
      direct_effects_to_run: [],
      reason_code: "central_arbitrator_defense_card_structured_intent",
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
    },
    turnFrame: {
      turn_id: "t",
      source_message_id: "m",
      user_id: "u",
      channel: "web",
      safety: { risk_band: "none", reason_codes: [], evidence: [] },
      confirmation_response: { kind: "unknown", confidence_band: "low" },
      direct_effects: [],
      tool_skill_intents: [{
        operation_type: "prepare_attack_card",
        explicitness: "explicit",
        confidence_band: "high",
        ambiguity: "none",
        user_intent: "create",
      }, {
        operation_type: "prepare_defense_card",
        explicitness: "explicit",
        confidence_band: "high",
        ambiguity: "none",
        user_intent: "create",
      }],
      flow_opportunity: null,
      skill_signals: { entry: {}, lifecycle: {}, exit: {} },
      memory_plan: {
        context_need: "minimal",
        memory_mode: "none",
        context_budget_tier: "tiny",
        targets: [],
        retrieval_policy: "taxonomy_first",
      },
    } as any,
  });

  assertEquals(bypass, false);
});

Deno.test("orientation clarification resolved to state potion resumes tool skill", () => {
  assertEquals(
    resolveOrientationClarificationToolSkillHandler({
      status: "resolved",
      selectedCandidateId: "select_state_potion",
      selectedCandidateOperationType: "select_state_potion",
    }),
    "select_state_potion",
  );
  assertEquals(
    resolveOrientationClarificationToolSkillHandler({
      status: "resolved",
      selectedCandidateId: "emotional_repair",
      selectedCandidateOperationType: null,
    }),
    null,
  );
});

Deno.test("orientation clarification resolved to supported conversation skill resumes skill handler", () => {
  assertEquals(
    resolveOrientationClarificationConversationSkillHandler({
      status: "resolved",
      selectedCandidateId: "demotivation_repair",
    }),
    "demotivation_repair",
  );
  assertEquals(
    resolveOrientationClarificationConversationSkillHandler({
      status: "resolved",
      selectedCandidateId: "emotional_repair",
    }),
    "emotional_repair",
  );
  assertEquals(
    resolveOrientationClarificationConversationSkillHandler({
      status: "ask",
      selectedCandidateId: "demotivation_repair",
    }),
    null,
  );
  assertEquals(
    resolveOrientationClarificationConversationSkillHandler({
      status: "resolved",
      selectedCandidateId: "execution" + "_breakdown",
    }),
    null,
  );
  assertEquals(
    resolveOrientationClarificationConversationSkillHandler({
      status: "resolved",
      selectedCandidateId: "select_state_potion",
    }),
    null,
  );
});

Deno.test("orientation clarification: current conversation signal can override stale tool resolution", () => {
  const turnFrame = orientationTurnFrame({
    skill_signals: {
      entry: {
        demotivation_repair: {
          detected: true,
          confidence_band: "high",
          reason: "structured_demotivation_repair",
        },
      },
      lifecycle: {},
      exit: {},
    },
  });

  assertEquals(
    currentTurnSupportsOrientationToolResolution({
      turnFrame,
      operationType: "select_state_potion",
    }),
    false,
  );
  assertEquals(
    currentTurnConversationSkillOverrideForOrientation({
      status: "resolved",
      turnFrame,
      resolvedToolSkillHandler: "select_state_potion",
    }),
    "demotivation_repair",
  );
});

Deno.test("orientation clarification: selected tool candidate prevents conversation override", () => {
  const turnFrame = orientationTurnFrame({
    skill_signals: {
      entry: {
        emotional_repair: {
          detected: true,
          confidence_band: "high",
          reason: "structured_emotional_repair",
        },
      },
      lifecycle: {},
      exit: {},
    },
  });

  assertEquals(
    currentTurnSupportsOrientationToolResolution({
      turnFrame,
      operationType: "select_state_potion",
    }),
    false,
  );
  assertEquals(
    currentTurnConversationSkillOverrideForOrientation({
      status: "resolved",
      turnFrame,
      resolvedToolSkillHandler: "select_state_potion",
      selectedCandidateOperationType: "select_state_potion",
      selectedCandidateConfidence: "high",
    }),
    null,
  );
});

Deno.test("orientation clarification: explicit current tool signal prevents conversation override", () => {
  const turnFrame = orientationTurnFrame({
    skill_signals: {
      entry: {
        demotivation_repair: {
          detected: true,
          confidence_band: "high",
          reason: "structured_demotivation_repair",
        },
        select_state_potion: {
          detected: true,
          confidence_band: "medium",
          reason: "structured_state_potion",
        },
      },
      lifecycle: {},
      exit: {},
    },
  });

  assertEquals(
    currentTurnSupportsOrientationToolResolution({
      turnFrame,
      operationType: "select_state_potion",
    }),
    true,
  );
  assertEquals(
    currentTurnConversationSkillOverrideForOrientation({
      status: "resolved",
      turnFrame,
      resolvedToolSkillHandler: "select_state_potion",
    }),
    null,
  );
});

Deno.test("resolveAgentChatModel: explicit override wins", () => {
  const selected = resolveAgentChatModel({
    effectiveMode: "companion",
    explicitModel: "gpt-5.4-mini",
    memoryPlan: {
      response_intent: "inventory",
      reasoning_complexity: "high",
      context_need: "dossier",
      memory_mode: "dossier",
      model_tier_hint: "deep",
      context_budget_tier: "large",
      targets: [],
      retrieval_policy: "semantic_first",
      plan_confidence: 0.99,
    },
  });

  assertEquals(selected.model, "gpt-5.4-mini");
  assertEquals(selected.source, "explicit_override");
  assertEquals(selected.tier, "explicit");
});

Deno.test("resolveAgentChatModel: sentry mode keeps global default model", () => {
  const selected = resolveAgentChatModel({
    effectiveMode: "sentry",
    memoryPlan: {
      response_intent: "reflection",
      reasoning_complexity: "high",
      context_need: "dossier",
      memory_mode: "broad",
      model_tier_hint: "deep",
      context_budget_tier: "large",
      targets: [],
      retrieval_policy: "semantic_first",
      plan_confidence: 0.95,
    },
  });

  assertEquals(
    selected.model,
    String(getGlobalAiModel()).trim(),
  );
  assertEquals(selected.source, "non_companion_default");
  assertEquals(selected.tier, "default");
});

Deno.test("resolveAgentChatModel: companion low-confidence default uses mini", () => {
  const selected = resolveAgentChatModel({
    effectiveMode: "companion",
    memoryPlan: {
      response_intent: "direct_answer",
      reasoning_complexity: "low",
      context_need: "minimal",
      memory_mode: "light",
      model_tier_hint: "lite",
      context_budget_tier: "tiny",
      targets: [],
      retrieval_policy: "semantic_first",
      plan_confidence: 0.4,
    },
  });

  assertEquals(selected.model, "gpt-5.4-mini");
  assertEquals(selected.source, "companion_default");
  assertEquals(selected.tier, "default");
});

Deno.test("resolveAgentChatModel: companion standard tier uses mini", () => {
  const selected = resolveAgentChatModel({
    effectiveMode: "companion",
    memoryPlan: {
      response_intent: "direct_answer",
      reasoning_complexity: "medium",
      context_need: "targeted",
      memory_mode: "light",
      model_tier_hint: "standard",
      context_budget_tier: "small",
      targets: [],
      retrieval_policy: "semantic_first",
      plan_confidence: 0.81,
    },
  });

  assertEquals(selected.model, "gpt-5.4-mini");
  assertEquals(selected.source, "memory_plan_standard");
  assertEquals(selected.tier, "standard");
});

Deno.test("resolveAgentChatModel: companion lite tier uses mini", () => {
  const selected = resolveAgentChatModel({
    effectiveMode: "companion",
    memoryPlan: {
      response_intent: "problem_solving",
      reasoning_complexity: "medium",
      context_need: "targeted",
      memory_mode: "light",
      model_tier_hint: "lite",
      context_budget_tier: "small",
      targets: [],
      retrieval_policy: "semantic_first",
      plan_confidence: 0.81,
    },
  });

  assertEquals(selected.model, "gpt-5.4-mini");
  assertEquals(selected.source, "memory_plan_lite");
  assertEquals(selected.tier, "lite");
});

Deno.test("effectiveResponseOwnerForOperationRuntime: operation runtime owns tool skill replies", () => {
  assertEquals(
    effectiveResponseOwnerForOperationRuntime({
      routeDecision: { response_owner: "normal_reply" },
      toolSkillRun: {
        selected_handler: "prepare_attack_card",
        status: "pending_confirmation_updated",
      },
    }),
    "tool_skill",
  );
  assertEquals(
    effectiveResponseOwnerForOperationRuntime({
      routeDecision: { response_owner: "product_help" },
      toolSkillRun: null,
    }),
    "product_help",
  );
});

Deno.test("adjust plan routing: ambivalent reflection does not start adjustment intake", async () => {
  const result = await maybeRunAdjustPlanItemOperation({
    supabase: {} as any,
    userId: "u1",
    userMessage:
      "Une partie de moi se dit qu'il faudrait tout baisser à 1, voire laisser tomber, mais je ne suis pas sûre. Est-ce que c'est une bonne idée ou juste une réaction de fatigue ?",
    channel: "whatsapp",
    userTimezone: "Europe/Paris",
    history: [],
    tempMemory: {},
    turnFrame: {
      tool_skill_intents: [{
        operation_type: "adjust_plan_item",
        confidence_band: "high",
        user_intent: "adjust",
        ambiguity: "none",
      }],
    } as any,
    routeDecision: {
      response_owner: "tool_skill",
      selected_handler: "adjust_plan_item",
    } as any,
    safetyContextOutput: { risk_band: "none" } as any,
    sourceMessageId: "msg-ambivalent",
    requestId: "req-ambivalent",
    planItemSnapshot: [],
    forceFullAi: true,
  });

  assertEquals(result, null);
});

Deno.test("adjust plan draft review answers pre-confirmation detail request without executing", async () => {
  const draft: any = {
    operation_type: "adjust_plan_item",
    output_schema: "plan_adjustment_draft_v1",
    confirmation_message:
      "Je n'ai encore rien appliqué. Je te propose de réduire Faire le choix du brut à 3 jours par semaine et de simplifier Préparer tes alternatives d'avance en une option simple. Le plan global ne change pas. Tu veux que je l'applique ?",
    execution_message: "C'est fait.",
    confirmation_actions: ["yes", "no"],
    draft: {
      title: "Ajustement - niveau actuel",
      scope_label: "niveau actuel",
      adjustment_type: "reduce",
      execution_strategy: "level_adjustment",
      proposed_change: "Alléger le niveau actuel.",
      why_it_helps: "La pression baisse sans changer le plan global.",
      confidence: "medium",
      decision_basis: {
        user_problem: "Le niveau actuel est trop intense.",
        inferred_need: "Réduire la charge sans changer le cap.",
        confidence: "medium",
        evidence: ["test"],
        uncertainty: [],
        must_preserve: ["plan global"],
      },
      change_rationale: {
        why_this_change: "Le user veut moins de pression.",
        expected_mechanism: "Moins de fréquence rend le niveau tenable.",
        success_condition: "Le user garde l'élan.",
      },
      ack_summary: {
        changed: ["fréquence réduite", "préparation simplifiée"],
        unchanged: ["plan global"],
        why_it_helps: "Moins de pression.",
        confidence: "medium",
      },
      adjust_plan_result: {
        scope: "level",
        applied_change: {
          summary: "Deux changements ciblés dans le niveau actuel.",
          changed_items: [
            {
              kind: "habit",
              capability: "change_action_frequency",
              id: "brut",
              title: "Faire le choix du brut",
              before: "6 jours par semaine",
              after: "3 jours par semaine",
              reason: "Réduire la pression et l'effet culpabilité.",
            },
            {
              kind: "action",
              capability: "modify_existing_action",
              id: "alternatives",
              title: "Préparer tes alternatives d'avance",
              before: "Préparer plusieurs options.",
              after: "Prévoir une option simple.",
              reason: "Réduire la logistique.",
            },
            {
              kind: "action",
              capability: "modify_existing_action",
              id: "bilan-signal",
              title: "Faire le point sur le signal de pause",
              before: "Bilan complet en fin de semaine.",
              after: "Bilan court avec une seule question.",
              reason: "Garder l'apprentissage sans alourdir le niveau.",
            },
          ],
          preserved_items: [
            {
              kind: "plan",
              id: null,
              title: "Cartographier les moments de tension",
              reason:
                "Cette observation reste utile pour comprendre le rythme.",
            },
            {
              kind: "plan",
              id: null,
              title: "Plan global",
              reason: "Le changement reste limité au niveau actuel.",
            },
          ],
        },
        boundaries: {
          affected_scope: "niveau actuel uniquement",
          explicitly_not_affected: ["plan global"],
          global_plan_impact: "none",
          explanation: "Le plan global ne change pas.",
        },
        rationale: {
          user_problem: "Trop de pression.",
          why_this_change: "Réduire la fréquence et la préparation.",
          expected_effect: "Le niveau devient plus tenable.",
          confidence: "medium",
          missing_info: [],
        },
        user_message_brief: "Brouillon prêt.",
        user_message_detailed: "Brouillon détaillé.",
      },
      patch: { scope_kind: "current_level" },
      allowed_patch_fields: ["scope_kind"],
    },
  };
  const result = await maybeRunAdjustPlanItemOperation({
    supabase: {} as any,
    userId: "u1",
    userMessage:
      "Avant que je dise oui, tu peux me dire concrètement les deux changements ?",
    channel: "whatsapp",
    userTimezone: "Europe/Paris",
    history: [],
    tempMemory: {
      __pending_adjust_plan_draft_review: {
        operation_type: "adjust_plan_item",
        phase: "draft_review",
        operation_id: "op-adjust",
        draft,
        operation_input: {
          scope: {
            kind: "current_level",
            title: "niveau actuel",
            current_summary: "niveau actuel",
          },
        },
        turn_count: 0,
      },
    },
    turnFrame: {
      tool_skill_intents: [{
        operation_type: "adjust_plan_item",
        user_intent: "explain_only",
        confidence_band: "high",
      }],
    } as any,
    routeDecision: null,
    safetyContextOutput: { risk_band: "none" } as any,
    sourceMessageId: "msg-adjust",
    requestId: "req-adjust",
    planItemSnapshot: [],
  });

  assertEquals(result?.toolExecution, "none");
  assertEquals(result?.executedTools, []);
  assertEquals(result?.toolSkillRun?.status, "draft_review_details");
  assertStringIncludes(result?.content ?? "", "brouillon actuel");
  assertStringIncludes(
    result?.content ?? "",
    "Faire le point sur le signal de pause",
  );
  assertStringIncludes(
    result?.content ?? "",
    "Cartographier les moments de tension",
  );
  assertEquals(
    Boolean((result?.nextTempMemory as any).__pending_adjust_plan_draft_review),
    true,
  );
});

Deno.test("adjust plan whole-plan detail request answers directly without repeating full draft", async () => {
  const draft: any = {
    operation_type: "adjust_plan_item",
    output_schema: "plan_adjustment_draft_v1",
    confirmation_message:
      "Je peux te proposer un ajustement du plan global. Rien n'est encore appliqué tant que tu ne valides pas clairement.",
    execution_message: "C'est fait.",
    confirmation_actions: ["yes", "no"],
    draft: {
      title: "Ajuster la trajectoire du plan",
      scope_label: "plan global",
      execution_strategy: "whole_plan_adjustment",
      proposed_change: "Réparer légèrement avant discussion de fond.",
      adjust_plan_result: {
        scope: "whole_plan",
        applied_change: {
          summary: "Phase future retravaillée.",
          trajectory_change: {
            before: "La phase future entrait directement par les reproches.",
            after:
              "La phase future garde son objectif de clarté, mais son entrée devient plus progressive: réparation légère avant discussion de fond.",
            inserted_step:
              "Une phase de réparation légère après petite tension.",
            preserved_direction: "L'objectif global du plan reste stable.",
            coaching_reason:
              "Cela rend l'entrée dans les sujets sensibles plus progressive.",
          },
          changed_items: [],
          preserved_items: [],
        },
      },
    },
  };
  const result = await maybeRunAdjustPlanItemOperation({
    supabase: {} as any,
    userId: "u1",
    userMessage:
      "Avant validation, confirme-moi juste que ça ne supprime pas la discussion de fond, ça la décale après le retour au calme.",
    channel: "whatsapp",
    userTimezone: "Europe/Paris",
    history: [],
    tempMemory: {
      __pending_adjust_plan_draft_review: {
        operation_type: "adjust_plan_item",
        phase: "draft_review",
        operation_id: "op-whole-detail",
        draft,
        operation_input: {
          scope: { kind: "whole_plan", title: "plan global" },
        },
        turn_count: 0,
      },
    },
    turnFrame: {
      tool_skill_intents: [{
        operation_type: "adjust_plan_item",
        user_intent: "explain_only",
        confidence_band: "high",
      }],
    } as any,
    routeDecision: null,
    safetyContextOutput: { risk_band: "none" } as any,
    sourceMessageId: "msg-whole-detail",
    requestId: "req-whole-detail",
    planItemSnapshot: [],
  });

  assertEquals(result?.toolExecution, "none");
  assertEquals(result?.executedTools, []);
  assertStringIncludes(result?.content ?? "", "ne supprime pas");
  assertStringIncludes(result?.content ?? "", "après le retour au calme");
});

Deno.test("adjust plan whole-plan pre-validation progression concern gets coaching answer", async () => {
  const draft: any = {
    operation_type: "adjust_plan_item",
    output_schema: "plan_adjustment_draft_v1",
    confirmation_message:
      "Je peux préparer cet ajustement du plan global. Rien n'est encore appliqué.",
    execution_message: "C'est fait.",
    confirmation_actions: ["yes", "no"],
    draft: {
      title: "Ajuster la trajectoire du plan",
      scope_label: "plan global",
      execution_strategy: "whole_plan_adjustment",
      proposed_change:
        "Réorienter le plan vers chaleur, fiabilité et réparation rapide.",
      adjust_plan_result: {
        scope: "whole_plan",
        applied_change: {
          trajectory_change: {
            before:
              "Le plan pouvait être vécu comme une suite de cases à cocher.",
            after:
              "Le plan garde les mêmes appuis, mais leur rôle devient plus clair: soutenir la présence fiable, les petits moments positifs et la réparation après maladresse.",
            inserted_step:
              "Une lecture moins performative des actions existantes.",
            preserved_direction: "L'objectif global du plan reste stable.",
            coaching_reason:
              "Changer le sens et les critères implicites du plan sans augmenter la charge.",
          },
          changed_items: [],
          preserved_items: [],
        },
      },
    },
  };
  const result = await maybeRunAdjustPlanItemOperation({
    supabase: {} as any,
    userId: "u1",
    userMessage:
      "Et si ça devient trop mou, est-ce que ça veut dire que je perds l'idée de progression du plan ? Je veux éviter de juste faire au feeling.",
    channel: "whatsapp",
    userTimezone: "Europe/Paris",
    history: [],
    tempMemory: {
      __pending_adjust_plan_draft_review: {
        operation_type: "adjust_plan_item",
        phase: "draft_review",
        operation_id: "op-whole-progression",
        draft,
        operation_input: {
          scope: { kind: "whole_plan", title: "plan global" },
        },
        turn_count: 0,
      },
    },
    turnFrame: {
      tool_skill_intents: [{
        operation_type: "adjust_plan_item",
        user_intent: "explain_only",
        confidence_band: "high",
      }],
    } as any,
    routeDecision: null,
    safetyContextOutput: { risk_band: "none" } as any,
    sourceMessageId: "msg-whole-progression",
    requestId: "req-whole-progression",
    planItemSnapshot: [],
  });

  assertEquals(result?.toolExecution, "none");
  assertEquals(result?.executedTools, []);
  assertEquals(result?.toolSkillRun?.status, "draft_review_details");
  assertStringIncludes(result?.content ?? "", "pas de rendre le plan flou");
  assertStringIncludes(result?.content ?? "", "garde une progression");
  if ((result?.content ?? "").includes("Le brouillon prévoit bien")) {
    throw new Error("progression concern should not get a generic draft recap");
  }
});

Deno.test("adjust plan whole-plan no-extra-actions confirmation is concrete", async () => {
  const draft: any = {
    operation_type: "adjust_plan_item",
    output_schema: "plan_adjustment_draft_v1",
    confirmation_message:
      "Je peux préparer cet ajustement du plan global. Rien n'est encore appliqué.",
    execution_message: "C'est fait.",
    confirmation_actions: ["yes", "no"],
    draft: {
      title: "Ajuster la trajectoire du plan",
      scope_label: "plan global",
      execution_strategy: "whole_plan_adjustment",
      proposed_change: "Ajouter une marche de réparation légère.",
      adjust_plan_result: {
        scope: "whole_plan",
        applied_change: {
          trajectory_change: {
            before:
              "La suite du plan passait trop vite de la tension à l'analyse.",
            after:
              "Le plan ajoute un passage court après dispute avant d'analyser le fond.",
            inserted_step:
              "Reconnaître brièvement la tension, puis proposer un petit geste de retour au contact.",
            preserved_direction: "L'objectif global du plan reste stable.",
            coaching_reason:
              "Le user demande une marche de réparation relationnelle.",
          },
          changed_items: [],
          preserved_items: [],
        },
      },
    },
  };
  const result = await maybeRunAdjustPlanItemOperation({
    supabase: {} as any,
    userId: "u1",
    userMessage:
      "Avant de valider, confirme-moi que ça ne rajoute pas trois nouvelles actions, juste une petite marche dans le plan.",
    channel: "whatsapp",
    userTimezone: "Europe/Paris",
    history: [],
    tempMemory: {
      __pending_adjust_plan_draft_review: {
        operation_type: "adjust_plan_item",
        phase: "draft_review",
        operation_id: "op-whole-no-extra-actions",
        draft,
        operation_input: {
          scope: { kind: "whole_plan", title: "plan global" },
        },
        turn_count: 0,
      },
    },
    turnFrame: {
      tool_skill_intents: [{
        operation_type: "adjust_plan_item",
        user_intent: "explain_only",
        confidence_band: "high",
      }],
    } as any,
    routeDecision: null,
    safetyContextOutput: { risk_band: "none" } as any,
    sourceMessageId: "msg-whole-no-extra-actions",
    requestId: "req-whole-no-extra-actions",
    planItemSnapshot: [],
  });

  assertEquals(result?.toolExecution, "none");
  assertEquals(result?.executedTools, []);
  assertEquals(result?.toolSkillRun?.status, "draft_review_details");
  assertStringIncludes(result?.content ?? "", "ne rajoute pas");
  assertStringIncludes(result?.content ?? "", "Reconnaître brièvement");
  if ((result?.content ?? "").includes("change surtout l'axe du plan")) {
    throw new Error("no-extra-actions answer should not stay generic");
  }
});

Deno.test("adjust plan whole-plan repair progression concern stays specific", async () => {
  const draft: any = {
    operation_type: "adjust_plan_item",
    output_schema: "plan_adjustment_draft_v1",
    confirmation_message:
      "Je peux préparer cet ajustement du plan global. Rien n'est encore appliqué.",
    execution_message: "C'est fait.",
    confirmation_actions: ["yes", "no"],
    draft: {
      title: "Ajuster la trajectoire du plan",
      scope_label: "plan global",
      execution_strategy: "whole_plan_adjustment",
      proposed_change: "Ajouter une marche de réparation légère.",
      adjust_plan_result: {
        scope: "whole_plan",
        applied_change: {
          trajectory_change: {
            before:
              "La suite du plan passait trop vite de la tension à l'analyse.",
            after:
              "Le plan ajoute un passage court après dispute avant d'analyser le fond.",
            inserted_step:
              "Reconnaître brièvement la tension, puis proposer un petit geste de retour au contact.",
            preserved_direction: "L'objectif global du plan reste stable.",
            coaching_reason:
              "Le user demande une marche de réparation relationnelle.",
          },
          changed_items: [],
          preserved_items: [],
        },
      },
    },
  };
  const result = await maybeRunAdjustPlanItemOperation({
    supabase: {} as any,
    userId: "u1",
    userMessage:
      "Avec cette marche prévue, on garde quand même l'idée de progression ? Je ne veux pas que ça devienne au feeling.",
    channel: "whatsapp",
    userTimezone: "Europe/Paris",
    history: [],
    tempMemory: {
      __pending_adjust_plan_draft_review: {
        operation_type: "adjust_plan_item",
        phase: "draft_review",
        operation_id: "op-whole-repair-progression",
        draft,
        operation_input: {
          scope: { kind: "whole_plan", title: "plan global" },
        },
        turn_count: 0,
      },
    },
    turnFrame: {
      tool_skill_intents: [{
        operation_type: "adjust_plan_item",
        user_intent: "explain_only",
        confidence_band: "high",
      }],
    } as any,
    routeDecision: null,
    safetyContextOutput: { risk_band: "none" } as any,
    sourceMessageId: "msg-whole-repair-progression",
    requestId: "req-whole-repair-progression",
    planItemSnapshot: [],
  });

  assertEquals(result?.toolExecution, "none");
  assertEquals(result?.executedTools, []);
  assertEquals(result?.toolSkillRun?.status, "draft_review_details");
  assertStringIncludes(result?.content ?? "", "garde une progression");
  assertStringIncludes(result?.content ?? "", "Reconnaître brièvement");
  if ((result?.content ?? "").includes("signes concrets de chaleur")) {
    throw new Error("repair progression answer should not use warmth template");
  }
  if ((result?.content ?? "").includes("Avant:")) {
    throw new Error(
      "repair progression answer should not dump full trajectory",
    );
  }
});

Deno.test("adjust plan whole-plan pre-validation nuance updates draft without executing", async () => {
  const draft: any = {
    operation_type: "adjust_plan_item",
    output_schema: "plan_adjustment_draft_v1",
    confirmation_message:
      "Je peux te proposer un ajustement du plan global. Rien n'est encore appliqué tant que tu ne valides pas clairement.",
    execution_message: "C'est fait.",
    confirmation_actions: ["yes", "no"],
    draft: {
      title: "Ajuster la trajectoire du plan",
      scope_label: "plan global",
      execution_strategy: "whole_plan_adjustment",
      proposed_change: "Réparer légèrement avant discussion de fond.",
      adjust_plan_result: {
        scope: "whole_plan",
        applied_change: {
          trajectory_change: {
            after:
              "La phase future garde son objectif de clarté, mais son entrée devient plus progressive.",
          },
          changed_items: [],
          preserved_items: [],
        },
      },
    },
  };
  const result = await maybeRunAdjustPlanItemOperation({
    supabase: {} as any,
    userId: "u1",
    userMessage:
      "Ajoute cette nuance au brouillon : on garde la discussion de fond, mais elle vient seulement après un retour au calme. Ne valide toujours pas.",
    channel: "whatsapp",
    userTimezone: "Europe/Paris",
    history: [],
    tempMemory: {
      __pending_adjust_plan_draft_review: {
        operation_type: "adjust_plan_item",
        phase: "draft_review",
        operation_id: "op-whole-nuance",
        draft,
        operation_input: {
          scope: { kind: "whole_plan", title: "plan global" },
        },
        turn_count: 0,
      },
    },
    turnFrame: {
      confirmation_response: { kind: "no", confidence_band: "high" },
      tool_skill_intents: [{
        operation_type: "adjust_plan_item",
        user_intent: "adjust",
        confidence_band: "high",
      }],
    } as any,
    routeDecision: null,
    safetyContextOutput: { risk_band: "none" } as any,
    sourceMessageId: "msg-whole-nuance",
    requestId: "req-whole-nuance",
    planItemSnapshot: [],
  });

  assertEquals(result?.toolExecution, "blocked");
  assertEquals(result?.executedTools, []);
  assertEquals(result?.toolSkillRun?.status, "draft_review_updated");
  assertStringIncludes(result?.content ?? "", "Nuance intégrée");
  assertStringIncludes(result?.content ?? "", "Je n'applique rien");
  assertEquals(
    Boolean((result?.nextTempMemory as any).__pending_adjust_plan_draft_review),
    true,
  );
});

Deno.test("adjust plan whole-plan pre-validation nuance strips command wrapper", async () => {
  const draft: any = {
    operation_type: "adjust_plan_item",
    output_schema: "plan_adjustment_draft_v1",
    confirmation_message:
      "Je peux préparer cet ajustement du plan global. Rien n'est encore appliqué.",
    execution_message: "C'est fait.",
    confirmation_actions: ["yes", "no"],
    draft: {
      title: "Ajuster la trajectoire du plan",
      scope_label: "plan global",
      execution_strategy: "whole_plan_adjustment",
      proposed_change: "Ajouter une étape légère de réparation.",
      adjust_plan_result: {
        scope: "whole_plan",
        applied_change: {
          trajectory_change: {
            after:
              "Reconnaître brièvement la tension, puis revenir au contact.",
          },
          changed_items: [],
          preserved_items: [],
        },
      },
    },
  };
  const result = await maybeRunAdjustPlanItemOperation({
    supabase: {} as any,
    userId: "u1",
    userMessage:
      "Ok, ajoute juste au brouillon que cette étape doit rester légère : une phrase de reconnaissance suffit, pas une longue discussion. Ne valide pas encore.",
    channel: "whatsapp",
    userTimezone: "Europe/Paris",
    history: [],
    tempMemory: {
      __pending_adjust_plan_draft_review: {
        operation_type: "adjust_plan_item",
        phase: "draft_review",
        operation_id: "op-whole-clean-nuance",
        draft,
        operation_input: {
          scope: { kind: "whole_plan", title: "plan global" },
        },
        turn_count: 0,
      },
    },
    turnFrame: {
      confirmation_response: { kind: "no", confidence_band: "high" },
      tool_skill_intents: [{
        operation_type: "adjust_plan_item",
        user_intent: "adjust",
        confidence_band: "high",
      }],
    } as any,
    routeDecision: null,
    safetyContextOutput: { risk_band: "none" } as any,
    sourceMessageId: "msg-whole-clean-nuance",
    requestId: "req-whole-clean-nuance",
    planItemSnapshot: [],
  });

  assertEquals(result?.toolExecution, "blocked");
  assertEquals(result?.executedTools, []);
  assertEquals(result?.toolSkillRun?.status, "draft_review_updated");
  assertStringIncludes(result?.content ?? "", "Nuance intégrée");
  assertStringIncludes(
    result?.content ?? "",
    "cette étape doit rester légère",
  );
  const content = result?.content ?? "";
  for (const forbidden of ["Ok, ajoute", "Ne valide", "discussion. encore"]) {
    if (content.includes(forbidden)) {
      throw new Error(`nuance reply leaked command wrapper: ${forbidden}`);
    }
  }
});

Deno.test("resolveCoachingTargetPlanItem: matches exact active plan item title", () => {
  const matched = resolveCoachingTargetPlanItem({
    planItems: [
      {
        id: "pi-1",
        user_id: "u1",
        cycle_id: "c1",
        transformation_id: "t1",
        plan_id: "p1",
        dimension: "missions",
        kind: "task",
        status: "active",
        title: "Envoyer le dossier",
        description: null,
        tracking_type: "boolean",
        activation_order: 1,
        activation_condition: null,
        current_habit_state: null,
        support_mode: null,
        support_function: null,
        target_reps: null,
        current_reps: null,
        cadence_label: null,
        scheduled_days: null,
        time_of_day: null,
        start_after_item_id: null,
        phase_id: null,
        payload: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        activated_at: null,
        completed_at: null,
        last_entry_at: null,
        recent_entries: [],
      },
    ],
    actionHint: "Envoyer le dossier",
  });

  assertEquals(matched, {
    id: "pi-1",
    dimension: "missions",
    kind: "task",
    title: "Envoyer le dossier",
    status: "active",
  });
});

Deno.test("resolveCoachingTargetPlanItem: falls back to top blocker title when hint is absent", () => {
  const matched = resolveCoachingTargetPlanItem({
    planItems: [
      {
        id: "pi-2",
        user_id: "u1",
        cycle_id: "c1",
        transformation_id: "t1",
        plan_id: "p1",
        dimension: "support",
        kind: "framework",
        status: "stalled",
        title: "Journal de gratitude",
        description: null,
        tracking_type: "boolean",
        activation_order: 2,
        activation_condition: null,
        current_habit_state: null,
        support_mode: "recommended_now",
        support_function: "understanding",
        target_reps: null,
        current_reps: null,
        cadence_label: null,
        scheduled_days: null,
        time_of_day: null,
        start_after_item_id: null,
        phase_id: null,
        payload: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        activated_at: null,
        completed_at: null,
        last_entry_at: null,
        recent_entries: [],
      },
    ],
    fallbackTitle: "Journal de gratitude",
  });

  assertEquals(matched, {
    id: "pi-2",
    dimension: "support",
    kind: "framework",
    title: "Journal de gratitude",
    status: "stalled",
  });
});

Deno.test("mapMomentumStateV2ToCoachingContext: exposes plan fit and load balance", () => {
  const tempMemory = writeMomentumStateV2({}, {
    version: 2,
    updated_at: new Date().toISOString(),
    current_state: "friction_legere",
    state_reason: "test",
    dimensions: {
      engagement: { level: "medium" },
      execution_traction: { level: "flat" },
      emotional_load: { level: "low" },
      consent: { level: "open" },
      plan_fit: { level: "poor" },
      load_balance: { level: "overloaded" },
    },
    assessment: {
      top_blocker: "Envoyer le dossier",
      top_risk: "load",
      confidence: "medium",
    },
    active_load: {
      current_load_score: 8,
      mission_slots_used: 3,
      support_slots_used: 1,
      habit_building_slots_used: 1,
      needs_reduce: true,
      needs_consolidate: false,
    },
    posture: { recommended_posture: "reduce_load", confidence: "medium" },
    blockers: { blocker_kind: "mission", blocker_repeat_score: 4 },
    memory_links: {
      last_useful_support_ids: [],
      last_failed_technique_ids: [],
    },
    _internal: {
      signal_log: {
        emotional_turns: [],
        consent_events: [],
        response_quality_events: [],
      },
      stability: {},
      sources: {},
      metrics_cache: {},
    },
  });

  assertEquals(mapMomentumStateV2ToCoachingContext(tempMemory), {
    plan_fit: "poor",
    load_balance: "overloaded",
    active_load_score: 8,
    needs_reduce: true,
    blocker_kind: "mission",
    top_risk: "load",
    posture: "reduce_load",
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// V2 Plan Item Snapshot Tests
// ═══════════════════════════════════════════════════════════════════════════════

function makeEntry(kind: string): any {
  return {
    id: crypto.randomUUID(),
    user_id: "u1",
    cycle_id: "c1",
    transformation_id: "t1",
    plan_id: "p1",
    plan_item_id: "pi1",
    entry_kind: kind,
    outcome: kind === "skip" ? "skipped" : "done",
    value_numeric: null,
    note: null,
    effective_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    source: "test",
    payload: {},
  };
}

Deno.test("computeStreakFromEntries: counts consecutive positive entries", () => {
  const entries = [
    makeEntry("checkin"),
    makeEntry("progress"),
    makeEntry("partial"),
    makeEntry("skip"),
    makeEntry("checkin"),
  ];
  assertEquals(computeStreakFromEntries(entries), 3);
});

Deno.test("computeStreakFromEntries: returns 0 when first entry is negative", () => {
  const entries = [
    makeEntry("skip"),
    makeEntry("checkin"),
    makeEntry("checkin"),
  ];
  assertEquals(computeStreakFromEntries(entries), 0);
});

Deno.test("computeStreakFromEntries: returns 0 for empty entries", () => {
  assertEquals(computeStreakFromEntries([]), 0);
});

Deno.test("computeStreakFromEntries: handles all positive entries", () => {
  const entries = [
    makeEntry("checkin"),
    makeEntry("progress"),
    makeEntry("checkin"),
  ];
  assertEquals(computeStreakFromEntries(entries), 3);
});

Deno.test("computeStreakFromEntries: blocker breaks streak", () => {
  const entries = [
    makeEntry("checkin"),
    makeEntry("blocker"),
    makeEntry("checkin"),
  ];
  assertEquals(computeStreakFromEntries(entries), 1);
});

Deno.test("computeStreakFromEntries: support_feedback is neutral (not positive, not negative) — breaks streak", () => {
  const entries = [
    makeEntry("checkin"),
    makeEntry("support_feedback"),
    makeEntry("checkin"),
  ];
  // support_feedback is neither positive nor negative, so it breaks the streak
  assertEquals(computeStreakFromEntries(entries), 1);
});

type MockDbState = Record<string, any[]>;

class MockQueryBuilder {
  private filters: Array<(row: Record<string, unknown>) => boolean> = [];
  private orders: Array<{ field: string; ascending: boolean }> = [];
  private rowLimit: number | null = null;
  private action: "select" | "update" = "select";
  private patch: Record<string, unknown> | null = null;

  constructor(private state: MockDbState, private table: string) {}

  select(_columns: string) {
    this.action = "select";
    return this;
  }

  insert(payload: Record<string, unknown> | Record<string, unknown>[]) {
    const rows = Array.isArray(payload) ? payload : [payload];
    this.state[this.table] ??= [];
    this.state[this.table].push(...structuredClone(rows));
    return Promise.resolve({ data: null, error: null });
  }

  update(patch: Record<string, unknown>) {
    this.action = "update";
    this.patch = patch;
    return this;
  }

  eq(field: string, value: unknown) {
    this.filters.push((row) => row[field] === value);
    return this;
  }

  in(field: string, values: unknown[]) {
    const allowed = new Set(values);
    this.filters.push((row) => allowed.has(row[field]));
    return this;
  }

  order(field: string, options?: { ascending?: boolean }) {
    this.orders.push({ field, ascending: options?.ascending !== false });
    return this;
  }

  limit(count: number) {
    this.rowLimit = count;
    return this;
  }

  maybeSingle() {
    const rows = this.runSelect();
    return Promise.resolve({ data: rows[0] ?? null, error: null });
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?:
      | ((
        value: { data: unknown; error: null },
      ) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    const promise = this.action === "update"
      ? this.runUpdate()
      : Promise.resolve({ data: this.runSelect(), error: null });
    return promise.then(onfulfilled, onrejected);
  }

  private matches(row: Record<string, unknown>) {
    return this.filters.every((filter) => filter(row));
  }

  private runSelect() {
    const rows = [...(this.state[this.table] ?? [])]
      .filter((row) => this.matches(row));

    for (const order of this.orders) {
      rows.sort((a, b) => {
        const left = a?.[order.field];
        const right = b?.[order.field];
        if (left === right) return 0;
        if (left == null) return order.ascending ? -1 : 1;
        if (right == null) return order.ascending ? 1 : -1;
        return order.ascending
          ? String(left).localeCompare(String(right))
          : String(right).localeCompare(String(left));
      });
    }

    return this.rowLimit == null ? rows : rows.slice(0, this.rowLimit);
  }

  private runUpdate() {
    for (const row of this.state[this.table] ?? []) {
      if (this.matches(row)) {
        Object.assign(row, structuredClone(this.patch ?? {}));
      }
    }
    return Promise.resolve({ data: null, error: null });
  }
}

function createTrackingSupabaseMock(seed: MockDbState) {
  const state = structuredClone(seed);
  return {
    state,
    client: {
      from(table: string) {
        state[table] ??= [];
        return new MockQueryBuilder(state, table);
      },
    },
  };
}

function baseCycle(): UserCycleRow {
  return {
    id: "cycle-1",
    user_id: "u1",
    status: "active",
    raw_intake_text: "test",
    intake_language: "fr",
    validated_structure: null,
    duration_months: 3,
    birth_date_snapshot: null,
    gender_snapshot: null,
    requested_pace: null,
    active_transformation_id: "transfo-1",
    version: 1,
    created_at: "2026-03-20T08:00:00.000Z",
    updated_at: "2026-03-24T08:00:00.000Z",
    completed_at: null,
    archived_at: null,
  };
}

function baseTransformation(): UserTransformationRow {
  return {
    id: "transfo-1",
    cycle_id: "cycle-1",
    priority_order: 1,
    status: "active",
    title: "Transformation test",
    internal_summary: "internal",
    user_summary: "user",
    success_definition: null,
    main_constraint: null,
    questionnaire_schema: null,
    questionnaire_answers: null,
    completion_summary: null,
    handoff_payload: null,
    base_de_vie_payload: null,
    unlocked_principles: null,
    created_at: "2026-03-20T08:00:00.000Z",
    updated_at: "2026-03-24T08:00:00.000Z",
    activated_at: "2026-03-20T08:00:00.000Z",
    completed_at: null,
  };
}

function basePlan(): UserPlanV2Row {
  return {
    id: "plan-1",
    user_id: "u1",
    cycle_id: "cycle-1",
    transformation_id: "transfo-1",
    status: "active",
    version: 2,
    title: "Plan test",
    content: {},
    generation_attempts: 1,
    last_generation_reason: null,
    generation_feedback: null,
    generation_input_snapshot: null,
    activated_at: "2026-03-20T08:00:00.000Z",
    completed_at: null,
    archived_at: null,
    created_at: "2026-03-20T08:00:00.000Z",
    updated_at: "2026-03-24T08:00:00.000Z",
  };
}

function basePlanItem(
  overrides: Partial<UserPlanItemRow> = {},
): UserPlanItemRow {
  return {
    id: "item-1",
    user_id: "u1",
    cycle_id: "cycle-1",
    transformation_id: "transfo-1",
    plan_id: "plan-1",
    dimension: "habits",
    kind: "habit",
    status: "active",
    title: "Meditation du soir",
    description: null,
    tracking_type: "boolean",
    activation_order: 1,
    activation_condition: null,
    current_habit_state: "active_building",
    support_mode: null,
    support_function: null,
    target_reps: 5,
    current_reps: 1,
    cadence_label: "daily",
    scheduled_days: null,
    time_of_day: null,
    start_after_item_id: null,
    phase_id: null,
    payload: {},
    created_at: "2026-03-20T08:00:00.000Z",
    updated_at: "2026-03-24T08:00:00.000Z",
    activated_at: "2026-03-20T08:00:00.000Z",
    completed_at: null,
    ...overrides,
  };
}

Deno.test("logPlanItemProgressV2: writes V2 plan item entry and emits event", async () => {
  const { client, state } = createTrackingSupabaseMock({
    user_cycles: [baseCycle()],
    user_transformations: [baseTransformation()],
    user_plans_v2: [basePlan()],
    user_plan_items: [basePlanItem()],
    user_plan_item_entries: [],
    user_metrics: [],
    system_runtime_snapshots: [],
  });

  const result = await logPlanItemProgressV2({
    supabase: client as any,
    userId: "u1",
    planItemId: "item-1",
    status: "completed",
    value: 1,
    dateHint: "2026-03-24",
    source: "web",
    sourceMessageId: "msg-1",
  });

  assertEquals(result.mode, "logged");
  assertEquals(state.user_plan_item_entries.length, 1);
  assertEquals(state.user_plan_item_entries[0].plan_item_id, "item-1");
  assertEquals(state.user_plan_item_entries[0].entry_kind, "checkin");
  assertEquals(state.system_runtime_snapshots.length, 1);
  assertEquals(
    state.system_runtime_snapshots[0].snapshot_type,
    "plan_item_entry_logged_v2",
  );
  assertEquals(
    state.system_runtime_snapshots[0].payload.plan_item_id,
    "item-1",
  );
});
