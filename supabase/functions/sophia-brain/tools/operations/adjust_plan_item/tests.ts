import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  createConfirmationToken,
  hasConsumedConfirmationTokenForTest,
  resetConsumedConfirmationTokensForTest,
} from "../../../confirmation/confirmation_token.ts";
import { executeAdjustPlanItem } from "./executor.ts";
import type {
  AdjustPlanResultV1,
  AdjustPlanResultWriter,
  AdjustPlanResultWriterInput,
} from "./generator.ts";
import {
  ADJUST_PLAN_SUB_SKILLS,
  runAdjustPlanActionSubSkill,
  runAdjustPlanDraftValidationSubSkill,
  runAdjustPlanItemIntake,
  runAdjustPlanLevelSubSkill,
  runAdjustPlanScopeRouterSubSkill,
  runAdjustPlanWholePlanSubSkill,
} from "./intake.ts";
import type {
  AdjustPlanSlotFiller,
  AdjustPlanSlotFillerOutput,
} from "./slot_filler.ts";

const SECRET = "s6-test-secret";

function actionPayload(options: {
  adjustment_type?: "reduce" | "clarify" | "pause" | "replace" | "rebalance";
  reason?: "too_heavy" | "bad_fit" | "too_vague" | "context_changed";
  constraints?: string[];
} = {}) {
  return {
    scope_kind: "specific_plan_item",
    adjustment_type: {
      status: "identified",
      value: options.adjustment_type ?? "reduce",
      evidence: ["structured slot filler"],
    },
    reason: {
      status: "identified",
      value: options.reason ?? "too_heavy",
      evidence: ["structured slot filler"],
    },
    constraints: {
      status: options.constraints?.length ? "identified" : "missing",
      values: options.constraints ?? [],
      evidence: options.constraints?.length ? ["structured constraints"] : [],
    },
  };
}

function levelPayload(options: {
  complete?: boolean;
  constraints?: string[];
  target?:
    | "entry_cost"
    | "number_of_actions"
    | "intensity"
    | "timing"
    | "focus";
} = {}) {
  const complete = options.complete ?? true;
  return {
    scope_kind: "current_level",
    adjustment_type: {
      status: "identified",
      value: "reduce_load",
      evidence: ["structured slot filler"],
    },
    reason: {
      status: "identified",
      value: "fatigue",
      evidence: ["structured slot filler"],
    },
    reason_change: {
      status: complete ? "identified" : "missing",
      value: complete ? "energy_low" : undefined,
      evidence: complete ? ["capacity changed"] : [],
    },
    change_target: {
      status: "identified",
      value: options.target ?? "number_of_actions",
      evidence: ["target chosen by AI slots"],
    },
    constraints: {
      status: "identified",
      values: options.constraints ?? ["preserve_plan_intent"],
      evidence: ["preserve the level goal"],
    },
  };
}

function wholePlanPayload(options: {
  complete?: boolean;
  constraints?: string[];
} = {}) {
  const complete = options.complete ?? true;
  return {
    scope_kind: "whole_plan",
    adjustment_type: {
      status: "identified",
      value: "reduce_global_load",
      evidence: ["structured slot filler"],
    },
    reason: {
      status: "identified",
      value: "context_changed",
      evidence: ["structured slot filler"],
    },
    reason_change: {
      status: complete ? "identified" : "missing",
      value: complete ? "context_changed" : undefined,
      evidence: complete ? ["work context changed"] : [],
    },
    change_target: {
      status: "identified",
      value: "global_load",
      evidence: ["global load is the target"],
    },
    constraints: {
      status: "identified",
      values: options.constraints ?? ["preserve_plan_intent"],
      evidence: ["preserve the main intent"],
    },
  };
}

function actionOperationInput(options: {
  plan_item_id?: string;
  label?: string;
  adjustment_type?: "reduce" | "clarify" | "pause" | "replace" | "rebalance";
  reason?: "too_heavy" | "bad_fit" | "too_vague" | "context_changed";
} = {}) {
  const label = options.label ?? "marche";
  return {
    target_granularity: {
      status: "identified",
      value: "single_action",
      confidence: "high",
      evidence: ["structured router output"],
      negative_evidence: [],
    },
    scope: {
      status: "identified",
      kind: "specific_plan_item",
      plan_item_id: options.plan_item_id ?? "walk",
      label,
      evidence: ["structured scope output"],
    },
    payload: actionPayload(options),
  };
}

function levelOperationInput(options: {
  complete?: boolean;
  label?: string;
  target?:
    | "entry_cost"
    | "number_of_actions"
    | "intensity"
    | "timing"
    | "focus";
} = {}) {
  return {
    target_granularity: {
      status: "identified",
      value: "current_level",
      confidence: "high",
      evidence: ["structured router output"],
      negative_evidence: ["not limited to one action"],
    },
    scope: {
      status: "identified",
      kind: "current_level",
      plan_item_id: null,
      label: options.label ?? "niveau actuel",
      evidence: ["structured scope output"],
    },
    payload: levelPayload(options),
  };
}

function wholePlanOperationInput(options: { complete?: boolean } = {}) {
  return {
    target_granularity: {
      status: "identified",
      value: "whole_plan",
      confidence: "high",
      evidence: ["structured router output"],
      negative_evidence: ["not a local level issue"],
    },
    scope: {
      status: "identified",
      kind: "whole_plan",
      plan_item_id: null,
      label: "plan global",
      evidence: ["structured scope output"],
    },
    payload: wholePlanPayload(options),
  };
}

function slotFillerFromOperationInput(
  operationInput: Record<string, unknown>,
  currentSubSkill: AdjustPlanSlotFillerOutput["current_sub_skill"],
  missingSlots: string[] = [],
): AdjustPlanSlotFiller {
  return async () => ({
    current_sub_skill: currentSubSkill,
    fill_order: [
      "scope",
      "reason_change",
      "change_target",
      "constraints",
      "affected_items",
      "draft_generation",
      "draft_validation",
    ],
    state_patch: {
      target_granularity: operationInput.target_granularity,
      scope: operationInput.scope,
      payload: operationInput.payload,
    },
    missing_slots: missingSlots,
    confidence: missingSlots.length ? "medium" : "high",
    next_question: missingSlots.length
      ? "Question générée par le slot filler IA."
      : null,
    evidence: ["structured AI slot output"],
  });
}

const testAdjustPlanResultWriter: AdjustPlanResultWriter = async (
  input: AdjustPlanResultWriterInput,
) => {
  const changedTitle = input.bridge_action?.title ??
    (input.scope_kind === "level" ? "Niveau actuel" : input.scope_label);
  const changeKind = input.scope_kind === "level"
    ? "level_setting" as const
    : input.scope_kind === "whole_plan"
    ? "plan_setting" as const
    : "action" as const;
  const changedItems: AdjustPlanResultV1["applied_change"]["changed_items"] = [{
    kind: changeKind,
    id: null,
    title: changedTitle,
    before: null,
    after: input.proposed_change,
    reason: input.change_rationale.why_this_change,
  }];
  if (input.scope_kind !== "action") {
    changedItems.push({
      kind: changeKind,
      id: null,
      title: input.scope_kind === "level"
        ? "Charge du niveau"
        : "Rythme global du plan",
      before: "Charge initiale",
      after: input.scope_kind === "level"
        ? "Charge du niveau allégée"
        : "Rythme global ralenti",
      reason: input.change_rationale.expected_mechanism,
    });
  }
  const detailed = input.scope_kind === "action"
    ? "Test writer: une version mini a été créée pour ouvrir l'action sans pression, et l'action d'origine reste prévue après. La version courte aide parce qu'elle donne un premier pas concret avant de reprendre l'action complète."
    : input.scope_kind === "level"
    ? `Test writer: le niveau actuel a été ajusté sans modifier l'objectif global. Exemple 1: ${
      changedItems[0].title
    } change. Exemple 2: ${changedItems[1].title} change aussi.`
    : `Test writer: le plan global a été allégé sans changer l'objectif, sans reconstruire automatiquement toute la trajectoire. Exemple 1: ${
      changedItems[0].title
    } change. Exemple 2: ${changedItems[1].title} change aussi.`;
  return {
    confirmation_message:
      `Test writer confirmation: veux-tu appliquer l'ajustement sur ${input.scope_label} ?`,
    execution_message: detailed,
    adjust_plan_result: {
      scope: input.scope_kind,
      applied_change: {
        summary: `Test writer summary for ${input.scope_label}`,
        changed_items: changedItems,
        preserved_items: [{
          kind: input.scope_kind === "action" ? "action" : "plan",
          id: null,
          title: input.scope_kind === "action"
            ? input.scope_label
            : "Objectif global",
          reason: input.scope_kind === "action"
            ? "L'action d'origine reste après la version mini."
            : "La direction générale reste préservée.",
        }],
      },
      boundaries: {
        affected_scope: input.boundaries_policy.affected_scope,
        explicitly_not_affected:
          input.boundaries_policy.explicitly_not_affected,
        global_plan_impact: input.boundaries_policy.global_plan_impact,
        explanation: input.boundaries_policy.global_plan_impact === "none"
          ? "Le changement reste limité à la cible décidée."
          : "Le changement touche la charge d'ensemble sans changer le cap.",
      },
      rationale: {
        user_problem: input.decision_basis.user_problem,
        why_this_change: input.change_rationale.why_this_change,
        expected_effect: input.change_rationale.expected_mechanism,
        confidence: input.decision_basis.confidence,
        missing_info: input.decision_basis.uncertainty,
      },
      user_message_brief: "Test writer brief.",
      user_message_detailed: detailed,
    },
  };
};

Deno.test("adjust_plan_item exposes the global skill plus five sub-skills", () => {
  assertEquals(ADJUST_PLAN_SUB_SKILLS.map((subSkill) => subSkill.id), [
    "scope_router",
    "action_intake",
    "level_intake",
    "whole_plan_intake",
    "draft_validation",
  ]);

  const rawMessageOnly = runAdjustPlanScopeRouterSubSkill({
    message: "reduis ma marche",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
  });
  assertEquals(rawMessageOnly.scope.status, "missing");
  assertEquals(rawMessageOnly.trace.missing_slots, ["scope"]);

  const actionInput = actionOperationInput();
  const actionScope = runAdjustPlanScopeRouterSubSkill({
    message: "réduis ma marche",
    operation_input: actionInput,
  });
  assertEquals(actionScope.scope.kind, "specific_plan_item");
  assertEquals(
    runAdjustPlanActionSubSkill({
      message: "réduis ma marche",
      operation_input: actionInput,
    }).trace.status,
    "ready",
  );
  assertEquals(
    runAdjustPlanLevelSubSkill({
      message: "le niveau est trop chargé",
      operation_input: levelOperationInput(),
    }).trace.status,
    "ready",
  );
  assertEquals(
    runAdjustPlanWholePlanSubSkill({
      message: "le plan global est trop lourd",
      operation_input: wholePlanOperationInput(),
    }).trace.status,
    "ready",
  );
});

Deno.test("adjust_plan_item can use AI slot filler to route and fill multiple slots", async () => {
  const output = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "Là ça ne tient plus, il faut rendre ça plus réaliste.",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    trigger_message_id: "m-ai-slots",
    safety_pregate_risk_band: "none",
    adjust_plan_result_writer: testAdjustPlanResultWriter,
    slot_filler: slotFillerFromOperationInput(
      wholePlanOperationInput(),
      "whole_plan_intake",
    ),
  });
  assertEquals(output.status, "ask_question");
  assertEquals(output.state_patch.intake_state?.scope.kind, "whole_plan");
  assertEquals(
    output.state_patch.intake_state?.selected_sub_skill,
    "whole_plan_intake",
  );
  assertEquals(
    output.state_patch.intake_state?.target_granularity.value,
    "whole_plan",
  );
  assertEquals(
    output.state_patch.tool_skill_state?.current_sub_skill,
    "draft_validation",
  );
  assertEquals(
    output.state_patch.sub_skill_trace?.some((trace) =>
      trace.reason_code === "ai_slot_filler"
    ),
    true,
  );
  assertEquals(output.state_patch.missing_slots, [
    "materialized_changed_items",
  ]);
});

Deno.test("adjust_plan_item covers 5 structured scenarios and executes confirmed patches", async () => {
  const scenarios = [
    {
      name: "action_reduce",
      message: "L'entrée est trop lourde, je veux une version plus légère.",
      plan: { items: [{ id: "walk", title: "marche" }] },
      slot_filler: slotFillerFromOperationInput(
        actionOperationInput({ adjustment_type: "reduce" }),
        "action_intake",
      ),
      source: "direct_user_request" as const,
      expectMaterialization: false,
      expectBridge: true,
    },
    {
      name: "action_clarify",
      message: "Je ne comprends pas quoi faire concrètement.",
      plan: { items: [{ id: "walk", title: "marche" }] },
      slot_filler: slotFillerFromOperationInput(
        actionOperationInput({
          adjustment_type: "clarify",
          reason: "too_vague",
        }),
        "action_intake",
      ),
      source: "direct_user_request" as const,
      expectMaterialization: false,
      expectBridge: false,
    },
    {
      name: "whole_plan_reduce",
      message: "Le rythme général ne tient plus dans mon contexte.",
      plan: { items: [{ id: "walk", title: "marche" }] },
      slot_filler: slotFillerFromOperationInput(
        wholePlanOperationInput(),
        "whole_plan_intake",
      ),
      source: "direct_user_request" as const,
      expectMaterialization: true,
      expectBridge: false,
    },
    {
      name: "level_pause",
      message: "Ce bloc est trop intense pour cette semaine.",
      plan: { items: [] },
      slot_filler: slotFillerFromOperationInput(
        levelOperationInput(),
        "level_intake",
      ),
      source: "direct_user_request" as const,
      expectMaterialization: true,
      expectBridge: false,
    },
    {
      name: "recommendation_action_reduce",
      message: "recommendation",
      plan: { items: [] },
      operation_input: actionOperationInput({ adjustment_type: "reduce" }),
      source: "recommendation_tool" as const,
      expectMaterialization: false,
      expectBridge: true,
    },
  ];
  for (const scenario of scenarios) {
    resetConsumedConfirmationTokensForTest();
    const output = await runAdjustPlanItemIntake({
      user_id: "u1",
      channel: "whatsapp",
      timezone: "Europe/Paris",
      message: scenario.message,
      plan_snapshot: scenario.plan,
      operation_input: scenario.operation_input,
      source: scenario.source,
      trigger_message_id: `m-${scenario.name}`,
      safety_pregate_risk_band: "none",
      adjust_plan_result_writer: testAdjustPlanResultWriter,
      slot_filler: scenario.slot_filler,
    });
    if (scenario.expectMaterialization) {
      assertEquals(output.status, "ask_question", scenario.name);
      assertEquals(output.state_patch.missing_slots, [
        "materialized_changed_items",
      ], scenario.name);
      assertEquals(
        output.state_patch.sub_skill_trace?.find((trace) =>
          trace.sub_skill_id === "draft_validation"
        )?.status,
        "needs_clarification",
        scenario.name,
      );
      continue;
    }
    assertEquals(output.status, "pending_confirmation", scenario.name);
    assertEquals(
      output.state_patch.sub_skill_trace?.find((trace) =>
        trace.sub_skill_id === "draft_validation"
      )?.status,
      "ready_for_confirmation",
      scenario.name,
    );
    assertEquals(
      runAdjustPlanDraftValidationSubSkill({ draft: output.draft! }).trace
        .status,
      "ready_for_confirmation",
      scenario.name,
    );
    if (scenario.expectBridge) {
      assertEquals(output.draft?.draft.execution_strategy, "bridge_action");
      assertEquals(
        output.draft?.draft.bridge_action?.source_relation,
        "bridge_to_original_action",
      );
      assertStringIncludes(
        output.draft?.draft.ack_summary.why_it_helps ?? "",
        "reprendre l'action",
      );
      assertStringIncludes(
        output.draft?.draft.adjust_plan_result.user_message_detailed ?? "",
        "version mini",
      );
      assertEquals(
        output.draft?.draft.adjust_plan_result.boundaries.global_plan_impact,
        "none",
      );
    }
    const token = await createConfirmationToken({
      user_id: "u1",
      operation_id: String(output.pending_confirmation?.operation_id),
      operation_type: "adjust_plan_item",
      draft: output.draft,
      source_message_id: "yes",
      pending_confirmation_id: "pending",
      secret: SECRET,
    });
    const executed = await executeAdjustPlanItem({
      operation_id: String(output.pending_confirmation?.operation_id),
      user_id: "u1",
      draft: output.draft!,
      token,
      safety_pregate_risk_band: "none",
      pending_confirmation_lookup: async () => ({ consumed: false }),
      token_consumption_check: async (tokenId) =>
        hasConsumedConfirmationTokenForTest(tokenId),
      write_plan_patch: async () => ({
        plan_patch_id: "patch",
        bridge_plan_item_id: output.draft?.draft.execution_strategy ===
            "bridge_action"
          ? "bridge-item"
          : null,
      }),
      secret: SECRET,
    });
    assertEquals(executed.status, "executed", scenario.name);
    if (executed.status === "executed") {
      assertEquals(
        executed.tool_skill_state.status,
        "completed",
        scenario.name,
      );
    }
    if (
      executed.status === "executed" &&
      output.draft?.draft.execution_strategy === "bridge_action"
    ) {
      assertEquals(executed.bridge_plan_item_id, "bridge-item", scenario.name);
    }
  }
});

Deno.test("adjust_plan_item does not infer slots from raw timing language", async () => {
  for (
    const message of [
      "change ma marche a mardi",
      "decale ma marche demain",
      "change l'horaire de cette action",
    ]
  ) {
    const output = await runAdjustPlanItemIntake({
      user_id: "u1",
      channel: "whatsapp",
      timezone: "Europe/Paris",
      message,
      plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
      trigger_message_id: `m-${message}`,
      safety_pregate_risk_band: "none",
      adjust_plan_result_writer: testAdjustPlanResultWriter,
    });
    assertEquals(output.status, "ask_question", message);
    assertEquals(output.state_patch.missing_slots, ["scope"], message);
  }
  const ready = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "rends cette action plus simple à commencer",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    trigger_message_id: "m-ready",
    safety_pregate_risk_band: "none",
    adjust_plan_result_writer: testAdjustPlanResultWriter,
    slot_filler: slotFillerFromOperationInput(
      actionOperationInput({ adjustment_type: "reduce" }),
      "action_intake",
    ),
  });
  if (ready.status !== "pending_confirmation") {
    throw new Error("expected_pending");
  }
  const blocked = await executeAdjustPlanItem({
    operation_id: String(ready.pending_confirmation?.operation_id),
    user_id: "u1",
    draft: {
      ...ready.draft!,
      draft: {
        ...ready.draft!.draft,
        patch: { scheduled_day: "mardi" },
      },
    },
    safety_pregate_risk_band: "none",
    pending_confirmation_lookup: async () => ({ consumed: false }),
    token_consumption_check: async () => false,
    write_plan_patch: async () => ({ plan_patch_id: "bad" }),
    secret: SECRET,
  });
  assertEquals(blocked.status, "blocked");
});

Deno.test("adjust_plan_item uses scope-specific intake payloads from structured AI slots", async () => {
  const level = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "Ce bloc ne passe plus.",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    trigger_message_id: "m-level",
    safety_pregate_risk_band: "none",
    adjust_plan_result_writer: testAdjustPlanResultWriter,
    slot_filler: slotFillerFromOperationInput(
      levelOperationInput({ complete: false }),
      "level_intake",
      ["current_level.reason_change"],
    ),
  });
  assertEquals(level.status, "ask_question");
  assertEquals(level.state_patch.missing_slots, [
    "current_level.reason_change",
  ]);

  const levelReady = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "Ce niveau me vide, il faut baisser le nombre d'actions.",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    trigger_message_id: "m-level-ready",
    safety_pregate_risk_band: "none",
    adjust_plan_result_writer: testAdjustPlanResultWriter,
    slot_filler: slotFillerFromOperationInput(
      levelOperationInput({ target: "number_of_actions" }),
      "level_intake",
    ),
  });
  assertEquals(levelReady.status, "ask_question");
  assertEquals(levelReady.state_patch.missing_slots, [
    "materialized_changed_items",
  ]);
  assertStringIncludes(
    levelReady.next_question?.question ?? "",
    "changer sa fréquence",
  );
  assertStringIncludes(
    levelReady.next_question?.question ?? "",
    "actions exactes",
  );
  assertEquals(
    levelReady.state_patch.intake_state?.scope.kind,
    "current_level",
  );
  assertEquals(
    levelReady.state_patch.intake_state?.payload?.scope_kind,
    "current_level",
  );
  assertEquals(
    (levelReady.state_patch.intake_state?.payload as any)?.adjustment_type
      .value,
    "reduce_load",
  );
  assertEquals(
    (levelReady.state_patch.intake_state?.payload as any)?.reason_change.status,
    "identified",
  );
  assertEquals(
    (levelReady.state_patch.intake_state?.payload as any)?.change_target.status,
    "identified",
  );
  assertEquals(levelReady.draft?.draft.execution_strategy, "level_adjustment");
  assertEquals(levelReady.draft?.draft.confidence, "medium");
  assertStringIncludes(
    levelReady.draft?.draft.ack_summary.changed.join(" ") ?? "",
    "cible de changement",
  );
  assertEquals(levelReady.draft?.draft.adjust_plan_result.scope, "level");
  assertEquals(
    levelReady.draft?.draft.adjust_plan_result.applied_change.changed_items
      .length,
    2,
  );
  assertEquals(
    levelReady.draft?.draft.adjust_plan_result.boundaries.affected_scope,
    "niveau actuel uniquement",
  );
  assertEquals(
    levelReady.draft?.draft.adjust_plan_result.boundaries.global_plan_impact,
    "none",
  );
  assertStringIncludes(
    levelReady.draft?.draft.adjust_plan_result.user_message_detailed ?? "",
    "sans modifier l'objectif global",
  );

  const wholePlan = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "Le plan n'est plus réaliste.",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    trigger_message_id: "m-whole-plan",
    safety_pregate_risk_band: "none",
    adjust_plan_result_writer: testAdjustPlanResultWriter,
    slot_filler: slotFillerFromOperationInput(
      wholePlanOperationInput({ complete: false }),
      "whole_plan_intake",
      ["whole_plan.reason_change"],
    ),
  });
  assertEquals(wholePlan.status, "ask_question");
  assertEquals(wholePlan.state_patch.missing_slots, [
    "whole_plan.reason_change",
  ]);

  const wholePlanReady = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Le contexte de travail change tout, mais je veux garder l'objectif.",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    trigger_message_id: "m-whole-plan-ready",
    safety_pregate_risk_band: "none",
    adjust_plan_result_writer: testAdjustPlanResultWriter,
    slot_filler: slotFillerFromOperationInput(
      wholePlanOperationInput(),
      "whole_plan_intake",
    ),
  });
  assertEquals(wholePlanReady.status, "ask_question");
  assertEquals(wholePlanReady.state_patch.missing_slots, [
    "materialized_changed_items",
  ]);
  assertEquals(
    wholePlanReady.state_patch.intake_state?.scope.kind,
    "whole_plan",
  );
  assertEquals(
    wholePlanReady.state_patch.intake_state?.payload?.scope_kind,
    "whole_plan",
  );
  assertEquals(
    (wholePlanReady.state_patch.intake_state?.payload as any)?.adjustment_type
      .value,
    "reduce_global_load",
  );
  assertEquals(
    (wholePlanReady.state_patch.intake_state?.payload as any)?.reason_change
      .status,
    "identified",
  );
  assertEquals(
    (wholePlanReady.state_patch.intake_state?.payload as any)?.change_target
      .status,
    "identified",
  );
  assertEquals(
    wholePlanReady.draft?.draft.execution_strategy,
    "whole_plan_adjustment",
  );
  assertEquals(wholePlanReady.draft?.draft.confidence, "medium");
  assertStringIncludes(
    wholePlanReady.draft?.draft.ack_summary.unchanged.join(" ") ?? "",
    "objectif",
  );
  assertEquals(
    wholePlanReady.draft?.draft.adjust_plan_result.scope,
    "whole_plan",
  );
  assertEquals(
    wholePlanReady.draft?.draft.adjust_plan_result.applied_change.changed_items
      .length,
    2,
  );
  assertEquals(
    wholePlanReady.draft?.draft.adjust_plan_result.boundaries
      .global_plan_impact,
    "indirect",
  );
  assertStringIncludes(
    wholePlanReady.draft?.draft.adjust_plan_result.user_message_detailed ?? "",
    "sans reconstruire automatiquement",
  );

  const wholePlanBeatsLevelMentions = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "Ce n'est pas seulement le niveau actuel, tout va trop vite.",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    trigger_message_id: "m-whole-plan-beats-level",
    safety_pregate_risk_band: "none",
    adjust_plan_result_writer: testAdjustPlanResultWriter,
    slot_filler: slotFillerFromOperationInput(
      wholePlanOperationInput(),
      "whole_plan_intake",
    ),
  });
  assertEquals(wholePlanBeatsLevelMentions.status, "ask_question");
  assertEquals(
    wholePlanBeatsLevelMentions.state_patch.intake_state?.scope.kind,
    "whole_plan",
  );

  const fuzzyBlockBeatsActionMatch = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "Je ne sais pas si c'est une action précise, tout le bloc bloque.",
    plan_snapshot: {
      items: [{
        id: "clean-env",
        title: "Nettoyer ton environnement direct",
        description: "Bloc grignotages et organisation de l'environnement",
      }],
    },
    trigger_message_id: "m-fuzzy-block",
    safety_pregate_risk_band: "none",
    adjust_plan_result_writer: testAdjustPlanResultWriter,
    slot_filler: slotFillerFromOperationInput(
      {
        ...levelOperationInput(),
        target_granularity: {
          status: "identified",
          value: "action_cluster",
          confidence: "high",
          evidence: ["block-level clue"],
          negative_evidence: ["not just one action"],
        },
      },
      "level_intake",
    ),
  });
  assertEquals(fuzzyBlockBeatsActionMatch.status, "ask_question");
  assertEquals(
    fuzzyBlockBeatsActionMatch.state_patch.intake_state?.target_granularity
      .value,
    "action_cluster",
  );
  assertEquals(
    fuzzyBlockBeatsActionMatch.state_patch.intake_state?.scope.kind,
    "current_level",
  );
  assertEquals(
    fuzzyBlockBeatsActionMatch.draft?.draft.execution_strategy,
    "level_adjustment",
  );

  const fuzzyProgramBeatsActionMatch = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "Avec le boulot, dans le programme tout arrive trop vite.",
    plan_snapshot: {
      items: [{
        id: "clean-env",
        title: "Nettoyer ton environnement direct",
        description: "Première mission du programme",
      }],
    },
    trigger_message_id: "m-fuzzy-program",
    safety_pregate_risk_band: "none",
    adjust_plan_result_writer: testAdjustPlanResultWriter,
    slot_filler: slotFillerFromOperationInput(
      wholePlanOperationInput(),
      "whole_plan_intake",
    ),
  });
  assertEquals(fuzzyProgramBeatsActionMatch.status, "ask_question");
  assertEquals(
    fuzzyProgramBeatsActionMatch.state_patch.intake_state?.target_granularity
      .value,
    "whole_plan",
  );
  assertEquals(
    fuzzyProgramBeatsActionMatch.state_patch.intake_state?.scope.kind,
    "whole_plan",
  );
  assertEquals(
    fuzzyProgramBeatsActionMatch.draft?.draft.execution_strategy,
    "whole_plan_adjustment",
  );
});
