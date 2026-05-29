import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  type AdjustPlanLifecycleDeps,
  executePendingAdjustPlanDraft,
  maybeRunAdjustPlanItemOperation,
} from "./router.ts";
import type { PlanAdjustmentDraftV1 } from "./generator.ts";

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
    turnFrame: null,
    routeDecision: null,
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

function lifecycleDeps(
  writePlanPatch: AdjustPlanLifecycleDeps["writePlanPatch"],
  overrides?: Partial<AdjustPlanLifecycleDeps>,
): AdjustPlanLifecycleDeps {
  return {
    writePlanPatch,
    isExplicitPendingApplyConfirmation: (message) =>
      /\b(applique|valide|execute|exécute)\b/i.test(message),
    isWeeklyMissionCarryOverRequest: () => false,
    weeklyMissionCarryOverContext: () => false,
    isCopyForwardWeeklyRequest: () => false,
    isWeeklyLightRepeatRequest: () => false,
    weeklyAdaptiveReviewStateForTurn: () => null,
    weeklyExactProposalFromConversation: () => null,
    patchPendingAdjustPlanWithWeeklyExactProposal: ({ pending }) => pending,
    buildWeeklyMissionCarryOverPendingReview: () => pendingDraftReview(),
    buildWeeklyCopyForwardPendingReview: () => pendingDraftReview(),
    buildWeeklyLightRepeatPendingReview: () => pendingDraftReview(),
    buildWeeklyExactAdjustPlanPendingReview: () => pendingDraftReview(),
    isAdjustPlanDraftRewriteRequest: () => false,
    renderPendingAdjustPlanDraftQuestionAnswer: () => null,
    revisePendingAdjustPlanDraftDeterministically: () => null,
    normalizeRecommendationText: (value) =>
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
    writeLastResolvedPlanItem: (tempMemory) => tempMemory,
    mergeActiveAdjustPlanOperationInput: ({ active, scoped }) =>
      scoped ?? active,
    operationInputFromLastPlanItem: () => null,
    planItemTitleFromOperationInput: () => null,
    ...overrides,
  };
}

Deno.test("adjust_plan router executes pending draft only through executor writer", async () => {
  let writeCount = 0;
  const result = await executePendingAdjustPlanDraft({
    context: context(),
    nextTempMemory: {
      __pending_adjust_plan_draft_review: { keep: false },
      __active_tool_skill_intake: { operation_type: "adjust_plan_item" },
    },
    pendingRaw: {
      operation_id: "op-1",
      operation_type: "adjust_plan_item",
      draft: draft(),
      operation_input: {
        scope: { kind: "specific_plan_item", plan_item_id: "item-1" },
      },
    },
    deps: {
      writePlanPatch: async ({ patch }) => {
        writeCount += 1;
        assertEquals(patch, { instruction: "Court" });
        return { plan_patch_id: "patch-1" };
      },
    },
  });

  assertEquals(writeCount, 1);
  assertEquals(result.toolExecution, "success");
  assertEquals(result.executedTools, ["adjust_plan_item"]);
  assertEquals(result.toolSkillRun.status, "executed");
  assertEquals(result.toolSkillRun.plan_patch_id, "patch-1");
  assertEquals(committedEffects(result).length, 1);
  assertEquals(committedEffects(result)[0].plan_patch_id, "patch-1");
  assertEquals(
    (result.toolSkillRun.skill_result as any).committed_effects[0]
      .plan_patch_id,
    "patch-1",
  );
  assertEquals(
    result.nextTempMemory.__pending_adjust_plan_draft_review,
    undefined,
  );
  assertEquals(
    result.nextTempMemory.__last_adjust_plan_execution.plan_patch_id,
    "patch-1",
  );
});

Deno.test("adjust_plan router blocks missing specific plan item id before execution", async () => {
  let writeCount = 0;
  const result = await executePendingAdjustPlanDraft({
    context: context(),
    nextTempMemory: { __pending_adjust_plan_draft_review: { keep: false } },
    pendingRaw: {
      operation_id: "op-missing",
      operation_type: "adjust_plan_item",
      draft: draft(),
      operation_input: { scope: { kind: "specific_plan_item" } },
    },
    deps: {
      writePlanPatch: async () => {
        writeCount += 1;
        return { plan_patch_id: "patch-should-not-exist" };
      },
    },
  });

  assertEquals(writeCount, 0);
  assertEquals(result.toolExecution, "blocked");
  assertEquals(result.executedTools, []);
  assertEquals(committedEffects(result), []);
  assertEquals(result.toolSkillRun.status, "not_executed_missing_plan_item_id");
  assertEquals(
    result.nextTempMemory.__pending_adjust_plan_draft_review,
    undefined,
  );
});

Deno.test("adjust_plan router does not write when materialization blocks execution", async () => {
  let writeCount = 0;
  const blockedDraft = draft({
    draft: {
      ...draft().draft,
      execution_strategy: "level_adjustment",
      adjust_plan_result: {
        ...draft().draft.adjust_plan_result,
        scope: "level",
        applied_change: {
          summary: "Niveau allégé.",
          changed_items: [],
          preserved_items: [],
        },
      },
      patch: { constraints: ["strict_affected_items_only"] },
      allowed_patch_fields: ["constraints"],
    },
  });
  const result = await executePendingAdjustPlanDraft({
    context: context(),
    nextTempMemory: { __pending_adjust_plan_draft_review: { keep: false } },
    pendingRaw: {
      operation_id: "op-blocked",
      operation_type: "adjust_plan_item",
      draft: blockedDraft,
      operation_input: { scope: { kind: "current_level" } },
    },
    deps: {
      writePlanPatch: async () => {
        writeCount += 1;
        return { plan_patch_id: "patch-should-not-exist" };
      },
    },
  });

  assertEquals(writeCount, 0);
  assertEquals(result.toolExecution, "blocked");
  assertEquals(result.executedTools, []);
  assertEquals(committedEffects(result), []);
  assertEquals(
    result.toolSkillRun.reason_code,
    "level_adjustment_capability_or_items_missing",
  );
  assert(!result.nextTempMemory.__last_adjust_plan_execution);
});

Deno.test("adjust_plan router records no committed effect when writer fails", async () => {
  const result = await executePendingAdjustPlanDraft({
    context: context(),
    nextTempMemory: { __pending_adjust_plan_draft_review: { keep: false } },
    pendingRaw: {
      operation_id: "op-writer-fails",
      operation_type: "adjust_plan_item",
      draft: draft(),
      operation_input: {
        scope: { kind: "specific_plan_item", plan_item_id: "item-1" },
      },
    },
    deps: {
      writePlanPatch: async () => {
        throw new Error("writer_failed_for_test");
      },
    },
  });

  assertEquals(result.toolExecution, "blocked");
  assertEquals(result.executedTools, []);
  assertEquals(committedEffects(result), []);
  assert(!/c['’]?est appliqu/i.test(result.content));
  assertEquals(
    result.toolSkillRun.reason_code,
    "writer_failed_for_test",
  );
});

Deno.test("adjust_plan lifecycle approves pending draft through executor", async () => {
  let writeCount = 0;
  const result = await maybeRunAdjustPlanItemOperation({
    context: fullContext({
      userMessage: "Oui, applique cette version.",
      tempMemory: {
        __pending_adjust_plan_draft_review: pendingDraftReview(),
      },
    }),
    deps: lifecycleDeps(async ({ patch }) => {
      writeCount += 1;
      assertEquals(patch, { instruction: "Court" });
      return { plan_patch_id: "patch-approved" };
    }),
  });

  assert(result);
  assertEquals(writeCount, 1);
  assertEquals(result.toolExecution, "success");
  assertEquals(result.executedTools, ["adjust_plan_item"]);
  assertEquals(result.toolSkillRun.status, "executed");
  assertEquals(result.toolSkillRun.plan_patch_id, "patch-approved");
  assertEquals(committedEffects(result).length, 1);
  assertEquals(committedEffects(result)[0].plan_patch_id, "patch-approved");
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
    }),
    deps: lifecycleDeps(async () => {
      writeCount += 1;
      return { plan_patch_id: "patch-should-not-exist" };
    }),
  });

  assert(result);
  assertEquals(writeCount, 0);
  assertEquals(result.toolExecution, "blocked");
  assertEquals(result.executedTools, []);
  assertEquals(committedEffects(result), []);
  assertEquals(result.toolSkillRun.status, "draft_review_cancelled");
  assertEquals(
    result.nextTempMemory.__pending_adjust_plan_draft_review,
    undefined,
  );
});

Deno.test("adjust_plan lifecycle explain does not execute pending draft", async () => {
  let writeCount = 0;
  const result = await maybeRunAdjustPlanItemOperation({
    context: fullContext({
      userMessage: "Confirme-moi ce que ce brouillon change.",
      tempMemory: {
        __pending_adjust_plan_draft_review: pendingDraftReview(),
      },
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
  assertEquals(result.toolExecution, "none");
  assertEquals(result.executedTools, []);
  assertEquals(committedEffects(result), []);
  assertEquals(result.toolSkillRun.status, "draft_review_details");
  assert(result.nextTempMemory.__pending_adjust_plan_draft_review);
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
  assertEquals(result.toolExecution, "blocked");
  assertEquals(result.executedTools, []);
  assertEquals(committedEffects(result), []);
  assertEquals(result.toolSkillRun.status, "draft_review_updated");
  assertEquals(
    result.nextTempMemory.__pending_adjust_plan_draft_review.draft.draft.patch
      .instruction,
    "Encore plus court",
  );
});

Deno.test("adjust_plan weekly bridge apply uses executor committed effect ledger", async () => {
  let writeCount = 0;
  const result = await maybeRunAdjustPlanItemOperation({
    context: fullContext({
      userMessage: "Oui, applique, on refait la même semaine.",
      tempMemory: {},
      planItemSnapshot: [{
        id: "weekly-item-1",
        title: "Action weekly",
        dimension: "habits",
        item_type: "habit",
        status: "active",
        cadence_label: "2x/semaine",
      }],
    }),
    deps: lifecycleDeps(
      async ({ patch }) => {
        writeCount += 1;
        assertEquals(patch, { instruction: "Court" });
        return {
          plan_patch_id: "patch-weekly",
          bridge_plan_item_id: "weekly-item-1",
        };
      },
      {
        isExplicitPendingApplyConfirmation: () => true,
        isCopyForwardWeeklyRequest: () => true,
        weeklyAdaptiveReviewStateForTurn: () => ({ weekly: true }),
        buildWeeklyCopyForwardPendingReview: () =>
          pendingDraftReview({ operation_id: "op-weekly-bridge" }),
      },
    ),
  });

  assert(result);
  assertEquals(writeCount, 1);
  assertEquals(result.toolExecution, "success");
  assertEquals(result.executedTools, ["adjust_plan_item"]);
  assertEquals(committedEffects(result).length, 1);
  assertEquals(committedEffects(result)[0].plan_patch_id, "patch-weekly");
  assertEquals(
    committedEffects(result)[0].bridge_plan_item_id,
    "weekly-item-1",
  );
});

Deno.test("weekly_adjust_plan_bridge_requires_commit_before_ack", async () => {
  let writeCount = 0;
  const result = await maybeRunAdjustPlanItemOperation({
    context: fullContext({
      userMessage: "Oui, applique, on refait la même semaine.",
      tempMemory: {},
      planItemSnapshot: [{
        id: "weekly-item-1",
        title: "Action weekly",
        dimension: "habits",
        item_type: "habit",
        status: "active",
        cadence_label: "2x/semaine",
      }],
    }),
    deps: lifecycleDeps(
      async () => {
        writeCount += 1;
        throw new Error("weekly_writer_failed_for_test");
      },
      {
        isExplicitPendingApplyConfirmation: () => true,
        isCopyForwardWeeklyRequest: () => true,
        weeklyAdaptiveReviewStateForTurn: () => ({ weekly: true }),
        buildWeeklyCopyForwardPendingReview: () =>
          pendingDraftReview({ operation_id: "op-weekly-bridge-fail" }),
      },
    ),
  });

  assert(result);
  assertEquals(writeCount, 1);
  assertEquals(result.toolExecution, "blocked");
  assertEquals(result.executedTools, []);
  assertEquals(committedEffects(result), []);
  assert(!/c['’]?est appliqu/i.test(result.content));
  assertEquals(
    result.toolSkillRun.reason_code,
    "weekly_writer_failed_for_test",
  );
});
