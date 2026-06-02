import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  __test__actionGuidanceCanHandoff,
  __test__currentLevelAffectedItemsOnlyHandoff,
  __test__sanitizeClarificationContent,
  __test__wholePlanGuidanceCanHandoff,
  type AdjustPlanLifecycleDeps,
  maybeRunAdjustPlanItemOperation,
} from "./router.ts";
import type { PlanAdjustmentDraftV1 } from "./generator.ts";
import type { AdjustPlanHandoffDraft } from "./contract.ts";
import {
  buildAdjustPlanHandoffDraft,
  buildAdjustPlanHandoffDraftFromContext,
} from "./handoff.ts";
import { renderAdjustPlanHandoffDraft } from "./renderer.ts";

function draft(
  overrides?: Partial<PlanAdjustmentDraftV1>,
): PlanAdjustmentDraftV1 {
  return {
    operation_type: "adjust_plan_item",
    output_schema: "plan_adjustment_draft_v1",
    draft: {
      title: "Ajustement - action",
      scope_label: "Action test",
      adjustment_type: "reduce",
      execution_strategy: "patch_existing",
      proposed_change: "Réduire l'action test.",
      why_it_helps: "Cela rend l'action tenable.",
      confidence: "high",
      decision_basis: {
        user_problem: "Charge trop élevée.",
        inferred_need: "Réduire l'entrée.",
        confidence: "high",
        evidence: ["message utilisateur"],
        uncertainty: [],
        must_preserve: ["intention"],
      },
      change_rationale: {
        why_this_change: "Moins de friction.",
        expected_mechanism: "Démarrage plus simple.",
        success_condition: "Action démarrée.",
      },
      ack_summary: {
        changed: ["Action test"],
        unchanged: ["Objectif"],
        why_it_helps: "Moins de friction.",
        confidence: "high",
      },
      adjust_plan_result: {
        scope: "action",
        applied_change: {
          summary: "Action réduite.",
          changed_items: [{
            kind: "action",
            capability: "modify_existing_action",
            id: "item-1",
            title: "Action test",
            before: "Long",
            after: "Court",
            reason: "Tenable",
          }],
          preserved_items: [{
            kind: "plan",
            title: "Objectif",
            reason: "Préservé",
          }],
        },
        boundaries: {
          affected_scope: "Action test",
          explicitly_not_affected: ["reste du plan"],
          global_plan_impact: "none",
          explanation: "Ajustement local.",
        },
        rationale: {
          user_problem: "Charge trop élevée.",
          why_this_change: "Moins de friction.",
          expected_effect: "Démarrage plus simple.",
          confidence: "high",
          missing_info: [],
        },
        user_message_brief: "C'est prêt.",
        user_message_detailed: "C'est appliqué.",
      },
      patch: { instruction: "Court" },
      allowed_patch_fields: ["instruction"],
    },
    confirmation_message: "Tu veux appliquer ?",
    execution_message: "C'est appliqué.",
    confirmation_actions: ["yes", "no"],
    ...overrides,
  };
}

function context() {
  return {
    userId: "user-1",
    safetyPregateOutput: { risk_band: "low" as const },
    sourceMessageId: "msg-1",
    requestId: "req-1",
    confirmationSecret: "test-secret",
  };
}

function fullContext(args?: {
  userMessage?: string;
  tempMemory?: any;
  planItemSnapshot?: any[];
  turnFrame?: any;
}) {
  return {
    ...context(),
    userMessage: args?.userMessage ?? "Oui, applique cette version.",
    channel: "web" as const,
    userTimezone: "Europe/Paris",
    history: [],
    tempMemory: args?.tempMemory ?? {},
    planItemSnapshot: args?.planItemSnapshot ?? [{
      id: "item-1",
      title: "Action test",
      dimension: "missions",
      item_type: "action",
      status: "active",
    }],
    turnFrame: args?.turnFrame ?? {
      confirmation_response: { kind: "unknown", confidence_band: "low" },
      tool_skill_intents: [],
    },
    routeDecision: null,
  };
}

function confirmationTurnFrame(kind: string) {
  return {
    confirmation_response: { kind, confidence_band: "high" },
    tool_skill_intents: [],
  };
}

function adjustPlanIntentTurnFrame(
  userIntent: "adjust" | "update" | "explain_only",
  targetHint: string,
) {
  return {
    confirmation_response: { kind: "unknown", confidence_band: "low" },
    tool_skill_intents: [{
      operation_type: "adjust_plan_item",
      explicitness: "explicit",
      target_hint: targetHint,
      confidence_band: "high",
      ambiguity: "none",
      user_intent: userIntent,
    }],
  };
}

function pendingDraftReview(overrides?: Record<string, unknown>) {
  return {
    operation_id: "op-review",
    operation_type: "adjust_plan_item" as const,
    phase: "draft_review" as const,
    draft: draft(),
    operation_input: {
      scope: { kind: "specific_plan_item", plan_item_id: "item-1" },
    },
    created_at: "2026-05-29T00:00:00.000Z",
    updated_at: "2026-05-29T00:00:00.000Z",
    turn_count: 0,
    revision_history: [],
    ...overrides,
  };
}

function committedEffects(result: { toolSkillRun: Record<string, unknown> }) {
  return Array.isArray(result.toolSkillRun.committed_effects)
    ? result.toolSkillRun.committed_effects as any[]
    : [];
}

function handoffDraft(): AdjustPlanHandoffDraft {
  return {
    operation_type: "adjust_plan_item",
    mode: "platform_handoff",
    no_chat_mutation: true,
    executable_from_chat: false,
    scope: {
      kind: "specific_plan_item",
      target_summary: "Action test",
    },
    user_goal_summary: "L'action test est trop lourde cette semaine.",
    coaching_read:
      "Réduire l'entrée garde l'objectif sans augmenter la charge.",
    recommendation: {
      summary: "Réduire l'action test.",
      recommended_change: "Passe Action test en version courte.",
      preserve: ["l'objectif de fond"],
      avoid: ["changer tout le niveau"],
      platform_destination: "section Plan",
      platform_steps: [
        "Va dans la section Plan.",
        "Ouvre Action test.",
        "Reprends cette version courte.",
      ],
    },
    missing_decisions: [],
  };
}

function handoffDraftForScope(
  scope: AdjustPlanHandoffDraft["scope"]["kind"],
): AdjustPlanHandoffDraft {
  const base = handoffDraft();
  if (scope === "current_level") {
    return {
      ...base,
      scope: { kind: "current_level", target_summary: "niveau actuel" },
      user_goal_summary:
        "La semaine est trop chargée, mais le niveau reste le bon repère.",
      recommendation: {
        ...base.recommendation,
        recommended_change:
          "Garder deux actions et mettre le reste en maintien cette semaine.",
        platform_steps: [
          "Va dans la section Plan.",
          "Ouvre le niveau ou la semaine concernée.",
          "Allège seulement la période concernée.",
        ],
      },
    };
  }
  if (scope === "whole_plan") {
    return {
      ...base,
      scope: { kind: "whole_plan", target_summary: "le plan" },
      user_goal_summary:
        "Le plan doit être réordonné sans jeter les blocs existants.",
      recommendation: {
        ...base.recommendation,
        recommended_change:
          "Mettre la clarification du cap avant la routine énergie, puis le chantier créatif.",
        platform_steps: [
          "Va dans la section Plan.",
          "Ouvre la vue du plan global.",
          "Utilise cette recommandation comme brief de révision.",
        ],
      },
    };
  }
  return base;
}

function lifecycleDeps(
  writePlanPatch: AdjustPlanLifecycleDeps["writePlanPatch"],
  overrides?: Partial<AdjustPlanLifecycleDeps>,
): AdjustPlanLifecycleDeps {
  return {
    writePlanPatch,
    isExplicitPendingApplyConfirmation: (message: string) =>
      /\b(applique|valide|execute|exécute)\b/i.test(message),
    isWeeklyMissionCarryOverRequest: () => false,
    weeklyMissionCarryOverContext: () => false,
    isCopyForwardWeeklyRequest: () => false,
    isWeeklyLightRepeatRequest: () => false,
    weeklyAdaptiveReviewStateForTurn: () => null,
    weeklyExactProposalFromConversation: () => null,
    patchPendingAdjustPlanWithWeeklyExactProposal: (
      { pending }: { pending: unknown },
    ) => pending,
    buildWeeklyMissionCarryOverPendingReview: () => pendingDraftReview(),
    buildWeeklyCopyForwardPendingReview: () => pendingDraftReview(),
    buildWeeklyLightRepeatPendingReview: () => pendingDraftReview(),
    buildWeeklyExactAdjustPlanPendingReview: () => pendingDraftReview(),
    isAdjustPlanDraftRewriteRequest: () => false,
    renderPendingAdjustPlanDraftQuestionAnswer: () => null,
    revisePendingAdjustPlanDraftDeterministically: () => null,
    normalizeRecommendationText: (value: unknown) =>
      String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase(),
    wholePlanDraftNuanceLine: () => null,
    renderPendingAdjustPlanDraftDetails: () => "Détails du brouillon.",
    renderLastAdjustPlanDetails: () => null,
    isAdjustPlanExplainOnlyIntent: () => false,
    isAdjustPlanRevisionIntent: () => false,
    operationRouteIsSelected: () => false,
    operationInputFromPlanAdjustmentScope: () => null,
    isVagueWholePlanWeeklyAdjustmentRequest: () => false,
    isPendingAdjustPlanItemRecommendationOperation: () => false,
    isBroaderPlanAdjustmentInput: () => false,
    isAmbivalentAdjustPlanReflectionRequest: () => false,
    isOperationEscapeMessage: () => false,
    hasStrongToolSkillIntent: () => false,
    readLastResolvedPlanItem: () => null,
    resolvePlanItemTargetFromToolSkillIntent: () => null,
    writeLastResolvedPlanItem: (tempMemory: unknown) => tempMemory,
    mergeActiveAdjustPlanOperationInput: (
      { active, scoped }: { active: unknown; scoped: unknown },
    ) => scoped ?? active,
    operationInputFromLastPlanItem: () => null,
    planItemTitleFromOperationInput: () => null,
    ...overrides,
  };
}

Deno.test("adjust_plan legacy pending + ok becomes platform_handoff apply_attempt without writer", async () => {
  let writeCount = 0;
  const result = await maybeRunAdjustPlanItemOperation({
    context: fullContext({
      userMessage: "ok vas-y",
      tempMemory: {
        __pending_adjust_plan_draft_review: pendingDraftReview(),
      },
      turnFrame: confirmationTurnFrame("yes"),
    }),
    deps: lifecycleDeps(
      async () => {
        writeCount += 1;
        throw new Error("writer_failed_for_test");
      },
    ),
  });

  assert(result);
  assertEquals(writeCount, 0);
  assertEquals(result.toolExecution, "platform_handoff");
  assertEquals(result.executedTools, []);
  assertEquals(committedEffects(result), []);
  assertEquals(result.toolSkillRun.status, "apply_attempt");
  assertEquals(
    result.nextTempMemory.__pending_adjust_plan_draft_review,
    undefined,
  );
  assertEquals(
    result.nextTempMemory.__adjust_plan_handoff_state.mode,
    "platform_handoff",
  );
  assertEquals(
    result.nextTempMemory.__adjust_plan_handoff_state.status,
    "apply_attempt",
  );
  assert(!result.nextTempMemory.__last_adjust_plan_execution);
});

Deno.test("adjust_plan legacy pending revise regenerates recommendation without writer", async () => {
  let writeCount = 0;
  const result = await maybeRunAdjustPlanItemOperation({
    context: fullContext({
      userMessage: "rends ça plus léger",
      tempMemory: {
        __pending_adjust_plan_draft_review: pendingDraftReview(),
      },
      turnFrame: adjustPlanIntentTurnFrame("adjust", "rends ça plus léger"),
    }),
    deps: lifecycleDeps(async () => {
      writeCount += 1;
      throw new Error("writer_failed_for_test");
    }),
  });

  assert(result);
  assertEquals(writeCount, 0);
  assertEquals(result.toolExecution, "platform_handoff");
  assertEquals(result.executedTools, []);
  assertEquals(committedEffects(result), []);
  assertEquals(result.toolSkillRun.status, "revise_handoff");
  assertEquals(
    result.nextTempMemory.__adjust_plan_handoff_state.draft.no_chat_mutation,
    true,
  );
  assertEquals(result.content.includes("Version révisée demandée"), false);
  assertStringIncludes(
    result.content,
    "Il ne te reste plus qu'à ouvrir Plan et reprendre cette version là-bas.",
  );
});

Deno.test("adjust_plan legacy pending repeat keeps destination Plan without writer", async () => {
  let writeCount = 0;
  const result = await maybeRunAdjustPlanItemOperation({
    context: fullContext({
      userMessage: "redis-moi où le faire",
      tempMemory: {
        __pending_adjust_plan_draft_review: pendingDraftReview(),
      },
      turnFrame: adjustPlanIntentTurnFrame(
        "explain_only",
        "redis-moi où le faire",
      ),
    }),
    deps: lifecycleDeps(async () => {
      writeCount += 1;
      throw new Error("writer_failed_for_test");
    }),
  });

  assert(result);
  assertEquals(writeCount, 0);
  assertEquals(result.toolExecution, "platform_handoff");
  assertEquals(result.executedTools, []);
  assertEquals(committedEffects(result), []);
  assertEquals(result.toolSkillRun.status, "repeat_handoff");
  assertStringIncludes(result.content, "section Plan");
});

Deno.test("adjust_plan lifecycle approval produces platform handoff, not execution", async () => {
  let writeCount = 0;
  const result = await maybeRunAdjustPlanItemOperation({
    context: fullContext({
      userMessage: "Oui, applique cette version.",
      tempMemory: {
        __pending_adjust_plan_draft_review: pendingDraftReview(),
      },
      turnFrame: confirmationTurnFrame("yes"),
    }),
    deps: lifecycleDeps(async ({ patch }: { patch: unknown }) => {
      writeCount += 1;
      assertEquals(patch, { instruction: "Court" });
      return { plan_patch_id: "patch-approved" };
    }),
  });

  assert(result);
  assertEquals(writeCount, 0);
  assertEquals(result.toolExecution, "platform_handoff");
  assertEquals(result.executedTools, []);
  assertEquals(result.toolSkillRun.status, "apply_attempt");
  assertEquals(committedEffects(result), []);
  assertEquals(
    result.nextTempMemory.__pending_adjust_plan_draft_review,
    undefined,
  );
});

Deno.test("adjust_plan lifecycle reject clears pending draft review", async () => {
  let writeCount = 0;
  const result = await maybeRunAdjustPlanItemOperation({
    context: fullContext({
      userMessage: "Non, laisse tomber.",
      tempMemory: {
        __pending_adjust_plan_draft_review: pendingDraftReview(),
      },
      turnFrame: confirmationTurnFrame("no"),
    }),
    deps: lifecycleDeps(async () => {
      writeCount += 1;
      return { plan_patch_id: "patch-should-not-exist" };
    }),
  });

  assert(result);
  assertEquals(writeCount, 0);
  assertEquals(result.toolExecution, "platform_handoff");
  assertEquals(result.executedTools, []);
  assertEquals(committedEffects(result), []);
  assertEquals(result.toolSkillRun.status, "cancelled");
  assertEquals(
    result.nextTempMemory.__pending_adjust_plan_draft_review,
    undefined,
  );
});

Deno.test("adjust_plan lifecycle repeat does not execute pending draft", async () => {
  let writeCount = 0;
  const result = await maybeRunAdjustPlanItemOperation({
    context: fullContext({
      userMessage: "redis-moi ce que ce brouillon change.",
      tempMemory: {
        __pending_adjust_plan_draft_review: pendingDraftReview(),
      },
      turnFrame: adjustPlanIntentTurnFrame(
        "explain_only",
        "redis-moi ce que ce brouillon change.",
      ),
    }),
    deps: lifecycleDeps(
      async () => {
        writeCount += 1;
        return { plan_patch_id: "patch-should-not-exist" };
      },
      {
        renderPendingAdjustPlanDraftQuestionAnswer: () =>
          "Ce brouillon réduit seulement l'action test.",
      },
    ),
  });

  assert(result);
  assertEquals(writeCount, 0);
  assertEquals(result.toolExecution, "platform_handoff");
  assertEquals(result.executedTools, []);
  assertEquals(committedEffects(result), []);
  assertEquals(result.toolSkillRun.status, "repeat_handoff");
  assertStringIncludes(result.content, "section Plan");
});

Deno.test("adjust_plan lifecycle deterministic revise updates pending review", async () => {
  let writeCount = 0;
  const revised = draft({
    draft: {
      ...draft().draft,
      patch: { instruction: "Encore plus court" },
    },
    confirmation_message: "Version révisée.",
  });
  const result = await maybeRunAdjustPlanItemOperation({
    context: fullContext({
      userMessage: "Corrige le brouillon, sans appliquer.",
      tempMemory: {
        __pending_adjust_plan_draft_review: pendingDraftReview(),
      },
      turnFrame: adjustPlanIntentTurnFrame(
        "adjust",
        "Corrige le brouillon, sans appliquer.",
      ),
    }),
    deps: lifecycleDeps(
      async () => {
        writeCount += 1;
        return { plan_patch_id: "patch-should-not-exist" };
      },
      {
        isAdjustPlanDraftRewriteRequest: () => true,
        revisePendingAdjustPlanDraftDeterministically: () => revised,
      },
    ),
  });

  assert(result);
  assertEquals(writeCount, 0);
  assertEquals(result.toolExecution, "platform_handoff");
  assertEquals(result.executedTools, []);
  assertEquals(committedEffects(result), []);
  assertEquals(result.toolSkillRun.status, "revise_handoff");
  assertEquals(
    result.nextTempMemory.__adjust_plan_handoff_state.draft.no_chat_mutation,
    true,
  );
});

Deno.test("adjust_plan repeat_handoff repeats from structured explain intent", async () => {
  const result = await maybeRunAdjustPlanItemOperation({
    context: fullContext({
      userMessage: "Redis-moi quoi faire dans Plan, mais court.",
      tempMemory: {
        __adjust_plan_handoff_state: {
          skill_id: "adjust_plan_item",
          mode: "platform_handoff",
          status: "handoff_delivered",
          draft: handoffDraft(),
          operation_input: {
            scope: { kind: "specific_plan_item", label: "Action test" },
          },
          turn_count: 1,
          max_turns: 6,
          created_at: "2026-06-01T00:00:00.000Z",
          updated_at: "2026-06-01T00:00:00.000Z",
          no_chat_mutation: true,
        },
      },
      turnFrame: adjustPlanIntentTurnFrame(
        "explain_only",
        "Redis-moi quoi faire dans Plan, mais court.",
      ),
    }),
    deps: lifecycleDeps(async () => {
      throw new Error("writer_should_not_run");
    }),
  });

  assert(result);
  assertEquals(result.toolSkillRun.status, "repeat_handoff");
  assertStringIncludes(result.content, "À reprendre dans Plan");
  assertStringIncludes(
    result.content,
    "Il ne te reste plus qu'à ouvrir Plan et reprendre cette version là-bas.",
  );
  assertStringIncludes(result.content, "Ce que je comprends");
});

Deno.test("adjust_plan revise_handoff does not expose mechanical revision prefix", async () => {
  const result = await maybeRunAdjustPlanItemOperation({
    context: fullContext({
      userMessage: "Rends-la encore plus légère, sans abandonner.",
      tempMemory: {
        __adjust_plan_handoff_state: {
          skill_id: "adjust_plan_item",
          mode: "platform_handoff",
          status: "handoff_delivered",
          draft: handoffDraft(),
          operation_input: {
            scope: { kind: "specific_plan_item", label: "Action test" },
          },
          turn_count: 1,
          max_turns: 6,
          created_at: "2026-06-01T00:00:00.000Z",
          updated_at: "2026-06-01T00:00:00.000Z",
          no_chat_mutation: true,
        },
      },
      turnFrame: adjustPlanIntentTurnFrame(
        "adjust",
        "Rends-la encore plus légère, sans abandonner.",
      ),
    }),
    deps: lifecycleDeps(async () => {
      throw new Error("writer_should_not_run");
    }),
  });

  assert(result);
  assertEquals(result.toolSkillRun.status, "revise_handoff");
  assertEquals(result.content.includes("Version révisée demandée"), false);
  assertEquals(result.content.includes("avec cette contrainte"), false);
  assertEquals(result.content.includes("Rends-la encore plus légère"), false);
  assertStringIncludes(result.content, "version plus légère");
  assertStringIncludes(
    result.content,
    "Il ne te reste plus qu'à ouvrir Plan et reprendre cette version là-bas.",
  );
});

Deno.test("adjust_plan revise_handoff rewrites current-level constraints semantically", async () => {
  const result = await maybeRunAdjustPlanItemOperation({
    context: fullContext({
      userMessage: "Plutôt cette semaine seulement, pas le niveau complet.",
      tempMemory: {
        __adjust_plan_handoff_state: {
          skill_id: "adjust_plan_item",
          mode: "platform_handoff",
          status: "handoff_delivered",
          draft: handoffDraftForScope("current_level"),
          operation_input: {
            scope: { kind: "current_level", label: "niveau actuel" },
          },
          turn_count: 1,
          max_turns: 6,
          created_at: "2026-06-01T00:00:00.000Z",
          updated_at: "2026-06-01T00:00:00.000Z",
          no_chat_mutation: true,
        },
      },
      turnFrame: adjustPlanIntentTurnFrame(
        "adjust",
        "Plutôt cette semaine seulement, pas le niveau complet.",
      ),
    }),
    deps: lifecycleDeps(async () => {
      throw new Error("writer_should_not_run");
    }),
  });

  assert(result);
  assertEquals(result.toolSkillRun.status, "revise_handoff");
  assertEquals(result.content.includes("avec cette contrainte"), false);
  assertEquals(result.content.includes("Plutôt cette semaine"), false);
  assertStringIncludes(result.content, "période concernée");
  assertStringIncludes(result.content, "cette semaine seulement");
});

Deno.test("adjust_plan revise_handoff rewrites whole-plan constraints semantically", async () => {
  const result = await maybeRunAdjustPlanItemOperation({
    context: fullContext({
      userMessage:
        "Rends la reco plus prudente : je veux tester cet ordre une semaine avant de tout réorganiser.",
      tempMemory: {
        __adjust_plan_handoff_state: {
          skill_id: "adjust_plan_item",
          mode: "platform_handoff",
          status: "handoff_delivered",
          draft: handoffDraftForScope("whole_plan"),
          operation_input: {
            scope: { kind: "whole_plan", label: "le plan" },
          },
          turn_count: 1,
          max_turns: 6,
          created_at: "2026-06-01T00:00:00.000Z",
          updated_at: "2026-06-01T00:00:00.000Z",
          no_chat_mutation: true,
        },
      },
      turnFrame: adjustPlanIntentTurnFrame(
        "adjust",
        "Rends la reco plus prudente : je veux tester cet ordre une semaine avant de tout réorganiser.",
      ),
    }),
    deps: lifecycleDeps(async () => {
      throw new Error("writer_should_not_run");
    }),
  });

  assert(result);
  assertEquals(result.toolSkillRun.status, "revise_handoff");
  assertEquals(result.content.includes("avec cette contrainte"), false);
  assertEquals(result.content.includes("Rends la reco"), false);
  assertStringIncludes(result.content, "révision du plan plus prudente");
  assertStringIncludes(result.content, "tester cet ordre une semaine");
});

Deno.test("adjust_plan active whole-plan inline order becomes revision", async () => {
  const result = await maybeRunAdjustPlanItemOperation({
    context: fullContext({
      userMessage:
        "Aujourd'hui l'ordre est : chantier créatif, routine énergie, clarification du cap. Je veux tester : clarification du cap, routine énergie, chantier créatif.",
      tempMemory: {
        __adjust_plan_handoff_state: {
          skill_id: "adjust_plan_item",
          mode: "platform_handoff",
          status: "handoff_delivered",
          draft: handoffDraftForScope("whole_plan"),
          operation_input: {
            scope: { kind: "whole_plan", label: "le plan" },
          },
          turn_count: 1,
          max_turns: 6,
          created_at: "2026-06-01T00:00:00.000Z",
          updated_at: "2026-06-01T00:00:00.000Z",
          no_chat_mutation: true,
        },
      },
      turnFrame: adjustPlanIntentTurnFrame(
        "adjust",
        "Aujourd'hui l'ordre est : chantier créatif, routine énergie, clarification du cap. Je veux tester : clarification du cap, routine énergie, chantier créatif.",
      ),
    }),
    deps: lifecycleDeps(async () => {
      throw new Error("writer_should_not_run");
    }),
  });

  assert(result);
  assertEquals(result.toolSkillRun.status, "revise_handoff");
  assertEquals(result.executedTools, []);
  assertEquals(committedEffects(result), []);
  assertStringIncludes(result.content, "clarification du cap");
  assertStringIncludes(result.content, "routine énergie");
  assertStringIncludes(result.content, "chantier créatif");
});

Deno.test("adjust_plan current-level handoff hides internal diagnostic wording", () => {
  const draft = buildAdjustPlanHandoffDraftFromContext({
    userMessage:
      "Cette semaine est trop chargée au niveau actuel, je veux l'alléger.",
    operationInput: {
      scope: { kind: "current_level", label: "niveau actuel" },
    },
    coachingGuidance: {
      observation:
        "La demande ne remet pas en cause le niveau; techniquement, il manque encore le contenu précis à alléger.",
      recommendation:
        "Orienter la réponse vers un allègement temporaire. Le sous-skill doit surtout distinguer ce qui peut être réduit sans changer le niveau.",
      trajectory_hypothesis:
        "La trajectoire reste celle du niveau actuel avec une baisse temporaire de charge.",
      questions_to_clarify: [
        "Quelles parties de la semaine doivent être allégées ?",
      ],
    },
  });

  assertEquals(draft.user_goal_summary.includes("techniquement"), false);
  assertEquals(draft.user_goal_summary.includes("il manque"), false);
  assertEquals(
    draft.recommendation.recommended_change.includes("sous-skill"),
    false,
  );
  assertEquals(
    draft.recommendation.recommended_change.includes("Orienter la réponse"),
    false,
  );
  assertStringIncludes(draft.user_goal_summary, "La demande ne remet pas");
  assertStringIncludes(
    draft.recommendation.recommended_change,
    "allègement temporaire",
  );
  assertEquals(draft.missing_decisions.length, 1);
});

Deno.test("adjust_plan handoff sanitizer produces grammatical coaching text", () => {
  const draft = buildAdjustPlanHandoffDraftFromContext({
    userMessage: "Je veux alléger Respiration de pause.",
    operationInput: {
      scope: { kind: "specific_plan_item", label: "Respiration de pause" },
    },
    coachingGuidance: {
      observation:
        "Respiration de pause bloque parce que l'entrée est trop lourde.",
      recommendation:
        "Orienter la réponse vers une baisse temporaire de charge.",
      trajectory_hypothesis:
        "Traiter cela comme un problème de friction locale.",
      preserve: ["L'intention de pause et de respiration"],
      avoid: [
        "Ne pas traiter cela comme un manque de motivation globale",
        "Ne pas abandonner l'action",
      ],
      questions_to_clarify: [],
    },
  });
  const rendered = renderAdjustPlanHandoffDraft(draft);

  assertStringIncludes(rendered, "Je te conseille une baisse temporaire");
  assertStringIncludes(
    rendered,
    "Éviter de traiter cela comme un manque de motivation globale",
  );
  assertEquals(rendered.includes("Je te conseille de une"), false);
  assertEquals(rendered.includes("Je te conseille de un"), false);
  assertEquals(rendered.includes("Éviter de Je te conseille"), false);
  assertStringIncludes(
    rendered,
    "Il ne te reste plus qu'à ouvrir Plan et reprendre cette version là-bas.",
  );
});

Deno.test("adjust_plan action handoff uses coach preserve avoid and non-operational Plan steps", () => {
  const handoff = buildAdjustPlanHandoffDraft({
    draft: draft({
      draft: {
        ...draft().draft,
        scope_label: "Respiration de pause",
        adjust_plan_result: {
          ...draft().draft.adjust_plan_result,
          applied_change: {
            ...draft().draft.adjust_plan_result.applied_change,
            preserved_items: [{
              kind: "plan",
              title: "Le reste du plan",
              reason: "Non concerné",
            }],
          },
          boundaries: {
            ...draft().draft.adjust_plan_result.boundaries,
            explicitly_not_affected: [
              "L’objectif global",
              "Les autres actions du plan",
              "La structure complète du plan",
            ],
          },
        },
      },
    }),
    operationInput: {
      scope: { kind: "specific_plan_item", label: "Respiration de pause" },
      coaching_guidance: {
        preserve: [
          "La respiration lente",
          "Le minuteur de deux minutes",
          "Le fait que ce soit une vraie pause, pas une performance",
        ],
        avoid: [
          "Ne pas abandonner l'action",
          "Ne pas ajouter une structure plus lourde",
        ],
      },
    },
  });
  const rendered = renderAdjustPlanHandoffDraft(handoff);

  assertStringIncludes(rendered, "La respiration lente");
  assertStringIncludes(rendered, "Éviter d'abandonner l'action");
  assertEquals(rendered.includes("Applique l'ajustement recommandé"), false);
  assertStringIncludes(rendered, "Reprends l'ajustement recommandé");
});

Deno.test("adjust_plan legacy pending handoff trace does not expose executable operation id", async () => {
  const result = await maybeRunAdjustPlanItemOperation({
    context: fullContext({
      userMessage: "ok vas-y",
      tempMemory: {
        __pending_adjust_plan_draft_review: pendingDraftReview(),
      },
      turnFrame: confirmationTurnFrame("yes"),
    }),
    deps: lifecycleDeps(async () => {
      throw new Error("writer_should_not_run");
    }),
  });

  assert(result);
  assertEquals(result.toolExecution, "platform_handoff");
  assertEquals(result.toolSkillRun.status, "apply_attempt");
  assertEquals(result.toolSkillRun.operation_id, null);
  assertEquals(result.executedTools, []);
  assertEquals(committedEffects(result), []);
});

Deno.test("adjust_plan clarification sanitizer removes invisible draft wording", () => {
  assertEquals(
    __test__sanitizeClarificationContent(
      "Je dois reprendre le brouillon proprement. Pour alléger Respiration du soir, tu veux toucher à la durée ?",
    ),
    "Pour alléger Respiration du soir, tu veux toucher à la durée ?",
  );
  assertEquals(
    __test__sanitizeClarificationContent(
      "Je dois d’abord verrouiller la dernière précision pour reprendre le brouillon proprement : peux-tu me donner l’ordre actuel ?",
    ),
    "peux-tu me donner l’ordre actuel ?",
  );
  assertEquals(
    __test__sanitizeClarificationContent(
      "avant de te le montrer. Quelle partie de Respiration de pause tu veux alléger ?",
    ),
    "Quelle partie de Respiration de pause tu veux alléger ?",
  );
});

Deno.test("adjust_plan current-level affected-items-only gap can hand off without filling slots", () => {
  assertEquals(
    __test__currentLevelAffectedItemsOnlyHandoff({
      missingSlots: ["current_level.affected_items"],
      operationInput: {
        scope: { kind: "current_level" },
        payload: {
          scope_kind: "current_level",
          adjustment_type: { status: "identified", value: "reduce_load" },
        },
      },
    }),
    true,
  );
  assertEquals(
    __test__currentLevelAffectedItemsOnlyHandoff({
      missingSlots: ["current_level.change_target"],
      operationInput: { scope: { kind: "current_level" } },
    }),
    false,
  );
});

Deno.test("adjust_plan action guidance can hand off when no clarification remains", () => {
  assertEquals(
    __test__actionGuidanceCanHandoff({
      missingSlots: ["draft_generation_retry_needed"],
      operationInput: {
        scope: { kind: "specific_plan_item", label: "Respiration de pause" },
        coaching_guidance: {
          confidence: "high",
          recommendation:
            "Réduire Respiration de pause à une version de deux minutes les jours chargés.",
          questions_to_clarify: [],
        },
      },
    }),
    true,
  );
  assertEquals(
    __test__actionGuidanceCanHandoff({
      missingSlots: ["draft_generation_retry_needed"],
      operationInput: {
        scope: { kind: "specific_plan_item", label: "Respiration de pause" },
        coaching_guidance: {
          confidence: "high",
          recommendation: "Alléger Respiration de pause.",
          questions_to_clarify: [
            "Qu'est-ce qu'il faut garder dans la version courte ?",
          ],
        },
      },
    }),
    false,
  );
  assertEquals(
    __test__actionGuidanceCanHandoff({
      missingSlots: [
        "specific_plan_item.action_request_category",
        "specific_plan_item.reason",
      ],
      operationInput: {
        scope: { kind: "specific_plan_item", label: "Respiration de pause" },
        coaching_guidance: {
          confidence: "high",
          recommendation:
            "Réduire Respiration de pause à une version de deux minutes, une seule fois les jours chargés.",
          questions_to_clarify: [
            "Quel aspect de l'action faut-il alléger ?",
          ],
        },
      },
    }),
    true,
  );
});

Deno.test("adjust_plan whole-plan structured reorder guidance can hand off despite retry slot", () => {
  assertEquals(
    __test__wholePlanGuidanceCanHandoff({
      missingSlots: ["draft_generation_retry_needed"],
      operationInput: {
        scope: { kind: "whole_plan" },
        coaching_guidance: {
          readiness: "diagnose",
          candidate_operation: "reorder",
          change_family: "sequence_order_issue",
          recommendation:
            "Revoir l'ordre global en mettant d'abord les fondations, puis les actions plus exigeantes.",
          questions_to_clarify: [],
        },
      },
    }),
    true,
  );
  assertEquals(
    __test__wholePlanGuidanceCanHandoff({
      missingSlots: ["scope"],
      operationInput: {
        scope: { kind: "whole_plan" },
        coaching_guidance: {
          candidate_operation: "reorder",
          change_family: "sequence_order_issue",
          recommendation: "Revoir l'ordre global.",
          questions_to_clarify: [],
        },
      },
    }),
    false,
  );
});
