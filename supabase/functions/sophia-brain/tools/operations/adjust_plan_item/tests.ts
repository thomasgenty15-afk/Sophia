import {
  assertEquals,
  assertRejects,
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
import { runPlanAdjustmentGenerator } from "./generator.ts";
import { renderAdjustPlanDecision } from "./renderer.ts";
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
  AdjustPlanQuestionWriter,
  AdjustPlanSlotFiller,
  AdjustPlanSlotFillerOutput,
} from "./slot_filler.ts";

const SECRET = "s6-test-secret";

Deno.test("adjust_plan_item renderer blocks success language without committed effect", () => {
  const message = renderAdjustPlanDecision({
    state: {
      intent: "draft",
      status: "pending_confirmation",
      reply: "C'est appliqué.",
      scope: { missing_slots: [] },
      change: { missing_slots: [] },
      effect_plan: { blocked_reason: null },
      draft: {
        available: true,
        summary: "Brouillon d'ajustement prêt.",
      },
    } as any,
    effect_result: {
      committed_effects: [],
      failed_effects: [],
    } as any,
  });
  assertEquals(message.includes("C'est appliqué"), false);
  assertStringIncludes(message, "Brouillon d'ajustement prêt");
});

Deno.test("adjust_plan_item renderer blocks legacy committed effect success language", () => {
  const message = renderAdjustPlanDecision({
    state: {
      intent: "apply",
      status: "executed",
      reply: "C'est appliqué.",
      scope: { missing_slots: [] },
      change: { missing_slots: [] },
      effect_plan: { blocked_reason: null },
      draft: { available: false },
    } as any,
    effect_result: {
      committed_effects: [{ type: "adjust_plan_item" }],
      failed_effects: [],
    } as any,
  });
  assertEquals(message.includes("C'est appliqué"), false);
  assertStringIncludes(message, "section Plan");
});

function actionPayload(options: {
  action_request_category?:
    | "feasibility_load"
    | "challenge_intensity"
    | "timing_duration"
    | "method_format"
    | "scope_focus"
    | "replacement_alternative"
    | "support_guardrail";
  adjustment_type?: "reduce" | "clarify" | "pause" | "replace" | "rebalance";
  reason?: "too_heavy" | "bad_fit" | "too_vague" | "context_changed";
  constraints?: string[];
} = {}) {
  return {
    scope_kind: "specific_plan_item",
    action_request_category: {
      status: "identified",
      value: options.action_request_category ?? "feasibility_load",
      evidence: ["structured action request category"],
    },
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
  level_request_category?:
    | "pacing_workload"
    | "difficulty_progression"
    | "sequence_priority"
    | "level_focus"
    | "action_mix"
    | "context_constraints"
    | "recovery_reset";
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
    level_request_category: {
      status: "identified",
      value: options.level_request_category ?? "pacing_workload",
      evidence: ["structured level request category"],
    },
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
    affected_items: {
      status: "identified",
      values: ["Faire le choix du brut", "Préparer tes alternatives d'avance"],
      evidence: ["AI selected concrete level actions"],
    },
  };
}

function wholePlanPayload(options: {
  complete?: boolean;
  constraints?: string[];
  family?:
    | "sequence_order_issue"
    | "missing_bridge_or_level"
    | "direction_change"
    | "success_criteria_change"
    | "future_phase_mismatch"
    | "style_or_method_mismatch"
    | "split_merge_restructure";
} = {}) {
  const complete = options.complete ?? true;
  return {
    scope_kind: "whole_plan",
    whole_plan_change_family: options.family
      ? {
        status: "identified",
        value: options.family,
        evidence: ["test whole-plan family"],
      }
      : { status: "missing", evidence: [] },
    candidate_operation: options.family === "missing_bridge_or_level"
      ? "insert_phase"
      : options.family === "direction_change"
      ? "change_emphasis"
      : options.family === "success_criteria_change"
      ? "change_success_criteria"
      : options.family === "future_phase_mismatch"
      ? "replace_phase"
      : options.family === "style_or_method_mismatch"
      ? "change_emphasis"
      : options.family === "split_merge_restructure"
      ? "split_or_merge_phase"
      : null,
    readiness: options.family ? "draft_ready" : null,
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
    affected_items: {
      status: "identified",
      values: ["Faire le choix du brut", "Préparer tes alternatives d'avance"],
      evidence: ["AI selected concrete plan actions"],
    },
  };
}

function actionOperationInput(options: {
  plan_item_id?: string;
  label?: string;
  action_request_category?:
    | "feasibility_load"
    | "challenge_intensity"
    | "timing_duration"
    | "method_format"
    | "scope_focus"
    | "replacement_alternative"
    | "support_guardrail";
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
  level_request_category?:
    | "pacing_workload"
    | "difficulty_progression"
    | "sequence_priority"
    | "level_focus"
    | "action_mix"
    | "context_constraints"
    | "recovery_reset";
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

function wholePlanOperationInput(
  options: Parameters<typeof wholePlanPayload>[0] = {},
) {
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
  const wholePlanCandidates = input.scope_kind === "whole_plan"
    ? (input.materialization_candidates ?? [])
      .filter((candidate) =>
        candidate.clarification_type !== "clarification" &&
        candidate.dimension !== "clarifications"
      )
      .slice(0, 2)
    : [];
  const changedItems: AdjustPlanResultV1["applied_change"]["changed_items"] =
    wholePlanCandidates.length >= 2
      ? wholePlanCandidates.map((candidate) => ({
        kind: String(candidate.kind ?? candidate.item_type ?? "").includes(
            "habit",
          )
          ? "habit" as const
          : "action" as const,
        capability: "modify_existing_action" as const,
        id: candidate.id,
        title: candidate.title,
        before: candidate.description ?? candidate.cadence_label ?? null,
        after: input.proposed_change,
        reason: input.change_rationale.why_this_change,
      }))
      : [{
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
        trajectory_change: input.scope_kind === "whole_plan"
          ? {
            before: "Le plan avançait trop directement.",
            after: "Le plan ajoute une étape intermédiaire plus progressive.",
            inserted_step: "Étape de consolidation avant la suite.",
            reordered_steps: [
              "Consolider",
              "Reprendre progressivement",
            ],
            preserved_direction: "L'objectif global reste inchangé.",
            coaching_reason:
              "La progression devient plus cohérente avec le rythme du user.",
          }
          : null,
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

Deno.test("adjust_plan_item passes specialized coach guidance into operation input and writer", async () => {
  let coachCalls = 0;
  let writerGuidance: any = null;
  const output = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "web",
    timezone: "Europe/Paris",
    message:
      "Cette action est trop lourde, je veux une version plus simple sans perdre l'intention.",
    trigger_message_id: "m1",
    safety_pregate_risk_band: "none",
    operation_input: actionOperationInput({
      plan_item_id: "walk",
      label: "Faire une marche",
    }),
    adjust_plan_result_writer: async (input) => {
      writerGuidance = input.coaching_guidance ?? null;
      return testAdjustPlanResultWriter(input);
    },
    coach_guidance_runner: async (input) => {
      coachCalls += 1;
      assertEquals(input.scope, "action");
      return {
        scope: input.scope,
        observation:
          "Le blocage porte sur le cout d'entree, pas sur l'objectif de l'action.",
        recommendation:
          "Proposer une version minimale qui garde l'intention de depart.",
        warnings: ["ne pas supprimer l'action initiale"],
        options_to_discuss: ["version mini", "clarification du premier pas"],
        questions_to_clarify: [],
        preserve: ["intention de l'action"],
        avoid: ["remplacement complet non demande"],
        guidelines: ["garder le changement local et reversible"],
        confidence: "high",
      };
    },
  });

  assertEquals(coachCalls, 1);
  assertEquals(output.status, "pending_confirmation");
  assertEquals(
    output.state_patch.intake_state?.coaching_guidance?.recommendation,
    "Proposer une version minimale qui garde l'intention de depart.",
  );
  assertEquals(
    (output.state_patch.operation_input as any)?.coaching_guidance
      ?.warnings?.[0],
    "ne pas supprimer l'action initiale",
  );
  assertEquals(
    (output.state_patch.operation_input as any)?.coaching_guidance_audit
      ?.status,
    "generated",
  );
  assertEquals(
    (output.state_patch.operation_input as any)?.coaching_guidance_audit
      ?.scope,
    "action",
  );
  assertEquals(
    writerGuidance?.guidelines.includes(
      "garder le changement local et reversible",
    ),
    true,
  );
});

Deno.test("adjust_plan result materialization preserves habit nature from candidates", async () => {
  const draft = await runPlanAdjustmentGenerator({
    operation_type: "adjust_plan_item",
    output_schema: "plan_adjustment_draft_v1",
    scope: {
      kind: "current_level",
      title: "Bloc grignotage",
      current_summary: "Bloc grignotage",
    },
    adjustment_type: "reduce",
    reason: { type: "too_heavy", evidence: ["trop de decisions le soir"] },
    reason_change: {
      type: "evening_decision_load",
      evidence: ["le user veut alléger la décision"],
    },
    change_target: {
      value: "decision_load",
      evidence: ["préparer le choix en amont"],
    },
    materialization_candidates: [{
      id: "habit-1",
      title: "Faire le choix du brut",
      description: "Choisir une option brute quand l'envie arrive.",
      status: "active",
      dimension: "habits",
      kind: "habit",
      item_nature: "recurring_habit",
      cadence_label: "3 jours par semaine",
      target_reps: 3,
    }, {
      id: "mission-1",
      title: "Préparer tes alternatives d'avance",
      description: "Préparer les alternatives le dimanche.",
      status: "active",
      dimension: "missions",
      kind: "task",
      item_nature: "one_shot_mission",
    }],
    decision_basis: {
      user_problem: "Le niveau se joue trop le soir.",
      inferred_need: "Déplacer la préparation sans changer la cadence.",
      confidence: "high",
      evidence: ["le user veut garder l'habitude"],
      uncertainty: [],
      must_preserve: ["cadence de l'habitude"],
    },
    allowed_patch_fields: [
      "scope_kind",
      "level_adjustment",
      "load_adjustment",
      "reason_type",
      "reason_change",
      "change_target",
      "confidence",
      "constraints",
    ],
    forbidden_patch_fields: [],
    constraints: ["affected_item:Faire le choix du brut"],
  }, {
    adjust_plan_result_writer: async (input) => ({
      confirmation_message:
        "Rien n'est encore appliqué: je propose de garder la cadence de l'habitude et de déplacer seulement la décision en amont.",
      execution_message:
        "J'ai gardé Faire le choix du brut comme habitude, avec sa cadence, et déplacé seulement la décision en amont.",
      adjust_plan_result: {
        scope: input.scope_kind,
        applied_change: {
          summary: "Décision déplacée sans changer la cadence.",
          changed_items: [{
            kind: "action",
            capability: "modify_existing_action",
            id: "habit-1",
            title: "Faire le choix du brut",
            before: "Choisir une option brute quand l'envie arrive.",
            after:
              "Habitude conservée à 3 jours par semaine; seule l'option par défaut est préparée en amont.",
            reason:
              "Ça réduit la décision au moment de l'envie sans transformer l'habitude en mission ponctuelle.",
          }],
          preserved_items: [{
            kind: "action",
            id: "mission-1",
            title: "Préparer tes alternatives d'avance",
            reason: "La mission de préparation reste distincte.",
          }],
        },
        boundaries: {
          affected_scope: "niveau actuel uniquement",
          explicitly_not_affected: ["plan global"],
          global_plan_impact: "none",
          explanation: "Le changement reste limité au niveau actuel.",
        },
        rationale: {
          user_problem: "Le niveau se joue trop le soir.",
          why_this_change:
            "La décision est préparée avant le moment difficile.",
          expected_effect: "Moins de friction sans changer la fréquence.",
          confidence: "high",
          missing_info: [],
        },
        user_message_brief: "L'habitude garde sa cadence.",
        user_message_detailed:
          "Faire le choix du brut reste une habitude à 3 jours par semaine; seule la décision est préparée en amont.",
      },
    }),
  });

  const changed =
    draft.draft.adjust_plan_result.applied_change.changed_items[0];
  assertEquals(changed.id, "habit-1");
  assertEquals(changed.kind, "habit");
});

Deno.test("adjust_plan action frequency constraints become materializable patch fields", async () => {
  const draft = await runPlanAdjustmentGenerator({
    operation_type: "adjust_plan_item",
    output_schema: "plan_adjustment_draft_v1",
    scope: {
      kind: "specific_plan_item",
      plan_item_id: "habit-1",
      title: "Partager un point positif",
      current_summary: "Partager un point positif",
    },
    adjustment_type: "rebalance",
    reason: {
      type: "too_heavy",
      evidence: ["6 jours par semaine me met la pression"],
    },
    materialization_candidates: [{
      id: "habit-1",
      title: "Partager un point positif",
      description: "Exprimer une gratitude ou un compliment.",
      status: "active",
      dimension: "habits",
      kind: "habit",
      item_nature: "recurring_habit",
      cadence_label: "6 jours / semaine",
      target_reps: 6,
    }],
    decision_basis: {
      user_problem: "La cadence actuelle met trop de pression.",
      inferred_need: "Réduire la fréquence sans toucher au reste du niveau.",
      confidence: "high",
      evidence: ["3 fois par semaine"],
      uncertainty: [],
      must_preserve: ["le reste du niveau"],
    },
    allowed_patch_fields: [
      "difficulty",
      "duration_minutes",
      "instruction",
      "paused",
      "target_reps",
      "cadence_label",
    ],
    forbidden_patch_fields: [],
    constraints: [
      "3 fois par semaine",
      "exact_text:une phrase simple, sans chercher à faire joli",
    ],
  }, {
    adjust_plan_result_writer: async (input) => ({
      confirmation_message:
        "Rien n'est encore appliqué: je propose de passer à 3 fois par semaine avec une phrase simple, sans chercher à faire joli.",
      execution_message:
        "C'est fait: l'habitude passe à 3 fois par semaine avec une phrase simple, sans chercher à faire joli.",
      adjust_plan_result: {
        scope: input.scope_kind,
        applied_change: {
          summary: "Fréquence réduite et consigne simplifiée.",
          changed_items: [{
            kind: "habit",
            id: "habit-1",
            title: "Partager un point positif",
            before: "6 jours / semaine, gratitude ou compliment.",
            after:
              "3 jours / semaine. une phrase simple, sans chercher à faire joli",
            reason: "Réduire la pression sans abandonner l'habitude.",
          }],
          preserved_items: [{
            kind: "action",
            id: "signal-1",
            title: "Convenir d'un signal de pause",
            reason: "Le reste du niveau ne change pas.",
          }],
        },
        boundaries: {
          affected_scope: "action ciblée uniquement",
          explicitly_not_affected: ["signal de pause"],
          global_plan_impact: "none",
          explanation: "Le changement reste limité à l'habitude ciblée.",
        },
        rationale: {
          user_problem: "La cadence actuelle met trop de pression.",
          why_this_change:
            "La fréquence et la consigne sont les deux points demandés.",
          expected_effect: "Moins de friction.",
          confidence: "high",
          missing_info: [],
        },
        user_message_brief: "Fréquence réduite.",
        user_message_detailed:
          "L'habitude passe à 3 jours / semaine avec une phrase simple, sans chercher à faire joli.",
      },
    }),
  });

  assertEquals(draft.draft.patch.target_reps, 3);
  assertEquals(draft.draft.patch.cadence_label, "3 jours / semaine");
  assertEquals(
    draft.draft.patch.instruction,
    "une phrase simple, sans chercher à faire joli",
  );
  assertEquals(
    draft.draft.adjust_plan_result.applied_change.changed_items[0].capability,
    "change_action_frequency",
  );
});

Deno.test("adjust_plan result rejects clarification as a changed item", async () => {
  await assertRejects(
    () =>
      runPlanAdjustmentGenerator({
        operation_type: "adjust_plan_item",
        output_schema: "plan_adjustment_draft_v1",
        scope: {
          kind: "current_level",
          title: "Bloc grignotage",
          current_summary: "Bloc grignotage",
        },
        adjustment_type: "clarify",
        reason: {
          type: "too_vague",
          evidence: ["la question ne convient pas"],
        },
        reason_change: {
          type: "clarification_wording",
          evidence: ["le user parle de la question"],
        },
        change_target: {
          value: "clarification_question",
          evidence: ["il veut modifier la clarification"],
        },
        materialization_candidates: [{
          id: "clarif-1",
          title: "Décoder ton envie de grignoter",
          description: "Clarification du besoin réel.",
          dimension: "clarifications",
          kind: "framework",
          item_nature: "clarification",
          clarification_type: "one_shot",
          clarification_section_labels: [
            "Que ressens-tu juste avant cette envie ?",
            "De quoi as-tu réellement besoin à cet instant ?",
          ],
        }],
        allowed_patch_fields: [
          "scope_kind",
          "level_adjustment",
          "load_adjustment",
          "reason_type",
          "reason_change",
          "change_target",
          "confidence",
          "constraints",
        ],
        forbidden_patch_fields: [],
        constraints: ["affected_item:Décoder ton envie de grignoter"],
      }, {
        adjust_plan_result_writer: async (input) => ({
          confirmation_message:
            "Rien n'est encore appliqué: je propose de modifier la clarification.",
          execution_message: "La clarification a été modifiée.",
          adjust_plan_result: {
            scope: input.scope_kind,
            applied_change: {
              summary: "Clarification réécrite.",
              changed_items: [{
                kind: "action",
                capability: "modify_existing_action",
                id: "clarif-1",
                title: "Décoder ton envie de grignoter",
                before: "Deux questions de clarification.",
                after: "Question unique.",
                reason: "Le user demande une question plus courte.",
              }],
              preserved_items: [],
            },
            boundaries: {
              affected_scope: "niveau actuel uniquement",
              explicitly_not_affected: ["plan global"],
              global_plan_impact: "none",
              explanation: "Le changement reste limité au niveau actuel.",
            },
            rationale: {
              user_problem: "La question est trop vague.",
              why_this_change: "La clarification serait plus directe.",
              expected_effect: "Moins d'ambiguïté.",
              confidence: "high",
              missing_info: [],
            },
            user_message_brief: "Clarification modifiée.",
            user_message_detailed: "La clarification serait modifiée.",
          },
        }),
      }),
    Error,
    "adjust_plan_result_clarification_read_only",
  );
});

Deno.test("adjust_plan result rejects user-facing technical ids", async () => {
  const output = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "web",
    timezone: "Europe/Paris",
    message: "Je veux alléger cette action.",
    plan_snapshot: {
      items: [{
        id: "action-1",
        title: "Partager un point positif",
        description: "Dire une chose positive.",
        status: "active",
        kind: "habit",
      }],
    },
    operation_input: actionOperationInput({
      plan_item_id: "action-1",
      label: "Partager un point positif",
    }),
    trigger_message_id: "m-technical-id-leak",
    safety_pregate_risk_band: "none",
    adjust_plan_result_writer: async () => ({
      confirmation_message:
        "Je propose de modifier l'action ID: 123e4567-e89b-12d3-a456-426614174000.",
      execution_message:
        "J'ai modifié plan_item_id 123e4567-e89b-12d3-a456-426614174000.",
      adjust_plan_result: {
        scope: "action",
        applied_change: {
          summary: "Action allégée.",
          changed_items: [{
            id: "action-1",
            kind: "habit",
            capability: "modify_existing_action",
            title: "Partager un point positif",
            before: "Dire une chose positive.",
            after: "Dire un merci très simple.",
            reason: "Réduit la charge.",
          }],
          preserved_items: [],
        },
        boundaries: {
          affected_scope: "action ciblée",
          explicitly_not_affected: ["reste du plan"],
          global_plan_impact: "none",
          explanation: "Le reste ne change pas.",
        },
        rationale: {
          user_problem: "L'action est trop lourde.",
          why_this_change: "La version courte réduit la charge.",
          expected_effect: "L'action redevient faisable.",
          confidence: "high",
          missing_info: [],
        },
        user_message_brief: "Action allégée.",
        user_message_detailed: "Action allégée.",
      },
    }),
  });

  assertEquals(output.status, "ask_question");
  assertEquals(output.state_patch.missing_slots, [
    "draft_generation_retry_needed",
  ]);
});

Deno.test("adjust_plan level writer excludes pending future actions unless targeted", async () => {
  const seenCandidateTitles: string[] = [];
  await runPlanAdjustmentGenerator({
    operation_type: "adjust_plan_item",
    output_schema: "plan_adjustment_draft_v1",
    scope: {
      kind: "current_level",
      title: "Bloc grignotage",
      current_summary: "Bloc grignotage",
    },
    adjustment_type: "reduce",
    reason: { type: "too_heavy", evidence: ["trop de charge le soir"] },
    reason_change: {
      type: "evening_decision_load",
      evidence: ["le choix arrive trop tard"],
    },
    change_target: {
      value: "decision_load",
      evidence: ["moins de décisions le soir"],
    },
    materialization_candidates: [{
      id: "mission-active",
      title: "Nettoyer ton environnement direct",
      description: "Retirer les produits transformés visibles.",
      status: "active",
      dimension: "missions",
      kind: "task",
      item_nature: "one_shot_mission",
      available_this_week: true,
      availability_status: "available_this_week",
    }, {
      id: "habit-active",
      title: "Faire le choix du brut",
      description: "Choisir un aliment brut si Nina a faim.",
      status: "active",
      dimension: "habits",
      kind: "habit",
      item_nature: "recurring_habit",
      available_this_week: true,
      availability_status: "available_this_week",
    }, {
      id: "future-mission",
      title: "Préparer tes alternatives d'avance",
      description: "Acheter et préparer des collations saines.",
      status: "pending",
      dimension: "missions",
      kind: "task",
      item_nature: "one_shot_mission",
      available_this_week: false,
      availability_status: "available_upcoming_week",
    }],
    allowed_patch_fields: [
      "scope_kind",
      "level_adjustment",
      "load_adjustment",
      "reason_type",
      "reason_change",
      "change_target",
      "confidence",
      "constraints",
    ],
    forbidden_patch_fields: [],
    constraints: [],
  }, {
    adjust_plan_result_writer: async (input) => {
      seenCandidateTitles.push(
        ...(input.materialization_candidates ?? []).map((item) => item.title),
      );
      return {
        confirmation_message:
          "Rien n'est appliqué: je propose d'alléger les items actifs du niveau.",
        execution_message: "Les deux items actifs du niveau ont été ajustés.",
        adjust_plan_result: {
          scope: input.scope_kind,
          applied_change: {
            summary: "Allègement du niveau actuel.",
            changed_items: [{
              kind: "action",
              capability: "modify_existing_action",
              id: "mission-active",
              title: "Nettoyer ton environnement direct",
              before: "Retirer les produits transformés visibles.",
              after: "Limiter l'environnement direct aux zones du soir.",
              reason:
                "Réduit les tentations disponibles quand Nina est fatiguée.",
            }, {
              kind: "habit",
              capability: "modify_existing_action",
              id: "habit-active",
              title: "Faire le choix du brut",
              before: "Choisir un aliment brut si Nina a faim.",
              after: "Utiliser une option brute par défaut sans décision.",
              reason:
                "Garde l'habitude mais retire la décision au pire moment.",
            }],
            preserved_items: [],
          },
          boundaries: {
            affected_scope: "niveau actuel uniquement",
            explicitly_not_affected: ["plan global"],
            global_plan_impact: "none",
            explanation: "Le changement reste dans le niveau courant.",
          },
          rationale: {
            user_problem: "Trop de décisions le soir.",
            why_this_change: "Les items actifs portent la charge du moment.",
            expected_effect: "Moins de friction en fin de journée.",
            confidence: "medium",
            missing_info: [],
          },
          user_message_brief: "Items actifs ajustés.",
          user_message_detailed:
            "Nettoyer ton environnement direct et Faire le choix du brut sont ajustés sans toucher la mission future.",
        },
      };
    },
  });

  assertEquals(
    seenCandidateTitles.includes("Préparer tes alternatives d'avance"),
    false,
  );
  assertEquals(
    seenCandidateTitles.includes("Nettoyer ton environnement direct"),
    true,
  );
  assertEquals(seenCandidateTitles.includes("Faire le choix du brut"), true);
});

const testAdjustPlanQuestionWriter: AdjustPlanQuestionWriter = async (
  input,
) =>
  input.reason_code
    ? "Question générée par le writer IA: quelles actions exactes veux-tu toucher, et de quelle façon ?"
    : "Question générée par le writer IA: quelle précision manque encore pour ajuster proprement ce niveau ?";

Deno.test("adjust_plan_item exposes the global skill plus five sub-skills", () => {
  assertEquals(ADJUST_PLAN_SUB_SKILLS.map((subSkill) => subSkill.id), [
    "scope_router",
    "action_intake",
    "level_intake",
    "whole_plan_intake",
    "handoff_validation",
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

Deno.test("adjust_plan action and level intake require request categories", () => {
  const missingActionCategory = actionOperationInput();
  delete (missingActionCategory.payload as any).action_request_category;
  const action = runAdjustPlanActionSubSkill({
    message: "rends cette action plus simple",
    operation_input: missingActionCategory,
  });
  assertEquals(action.trace.status, "needs_clarification");
  assertEquals(action.trace.missing_slots, [
    "specific_plan_item.action_request_category",
  ]);

  const invalidLevelCategory = levelOperationInput();
  (invalidLevelCategory.payload as any).level_request_category = {
    status: "identified",
    value: "unexpected_category",
    evidence: ["invalid test category"],
  };
  const level = runAdjustPlanLevelSubSkill({
    message: "ce niveau est trop dense cette semaine",
    operation_input: invalidLevelCategory,
  });
  assertEquals(level.trace.status, "needs_clarification");
  assertEquals(level.trace.missing_slots, [
    "current_level.level_request_category",
  ]);
});

Deno.test("adjust_plan propagates action and level request categories to generator constraints", async () => {
  const seenConstraints: string[][] = [];
  const writer: AdjustPlanResultWriter = async (input) => {
    seenConstraints.push(input.user_constraints ?? []);
    return testAdjustPlanResultWriter(input);
  };

  await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "Pas par écrit, je veux plutôt faire cette action en vocal.",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    trigger_message_id: "m-action-category",
    safety_pregate_risk_band: "none",
    adjust_plan_result_writer: writer,
    slot_filler: slotFillerFromOperationInput(
      actionOperationInput({ action_request_category: "method_format" }),
      "action_intake",
    ),
  });

  await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "J'ai décroché, reprends-moi ce niveau proprement.",
    plan_snapshot: {
      items: [
        { id: "a", title: "Faire le choix du brut" },
        { id: "b", title: "Préparer tes alternatives d'avance" },
      ],
    },
    trigger_message_id: "m-level-category",
    safety_pregate_risk_band: "none",
    adjust_plan_result_writer: writer,
    slot_filler: slotFillerFromOperationInput(
      levelOperationInput({ level_request_category: "recovery_reset" }),
      "level_intake",
    ),
  });

  assertEquals(
    seenConstraints[0].includes("action_request_category:method_format"),
    true,
  );
  assertEquals(
    seenConstraints[1].includes("level_request_category:recovery_reset"),
    true,
  );
});

Deno.test("adjust_plan draft validation blocks vague whole-plan diagnostics", () => {
  const validation = runAdjustPlanDraftValidationSubSkill({
    draft: {
      operation_type: "adjust_plan_item",
      output_schema: "plan_adjustment_draft_v1",
      confirmation_message:
        "Je te propose une piste, rien n'est encore appliqué.",
      execution_message: "J'ai ajusté le plan.",
      confirmation_actions: ["yes", "no"],
      draft: {
        title: "Ajustement - plan global",
        scope_label: "plan global",
        adjustment_type: "rebalance",
        execution_strategy: "whole_plan_adjustment",
        proposed_change: "Revoir une phase future.",
        why_it_helps: "La trajectoire sera plus cohérente.",
        confidence: "medium",
        decision_basis: {
          user_problem: "Une phase future ne fait pas sens.",
          inferred_need: "Diagnostiquer avant de modifier.",
          confidence: "medium",
          evidence: [],
          uncertainty: [],
          must_preserve: ["objectif global"],
        },
        change_rationale: {
          why_this_change: "Le user signale une incohérence future.",
          expected_mechanism: "Une clarification évite une mauvaise refonte.",
          success_condition: "La phase future est mieux cadrée.",
        },
        ack_summary: {
          changed: ["phase future"],
          unchanged: ["objectif global"],
          why_it_helps: "Clarifier la trajectoire.",
          confidence: "medium",
        },
        patch: {
          scope_kind: "whole_plan",
          constraints: [
            "whole_plan_change_family:future_phase_mismatch",
            "whole_plan_readiness:diagnose",
          ],
        },
        allowed_patch_fields: ["scope_kind", "constraints"],
        adjust_plan_result: {
          scope: "whole_plan",
          applied_change: {
            summary: "Phase future à revoir.",
            trajectory_change: {
              before: "Une phase future paraît incohérente.",
              after: "La phase future doit être rediagnostiquée.",
              inserted_step: "Diagnostic de la phase future.",
              reordered_steps: ["Diagnostic", "Révision"],
              preserved_direction: "L'objectif global reste stable.",
              coaching_reason:
                "Il faut comprendre le décalage avant de changer le plan.",
            },
            changed_items: [{
              kind: "action",
              capability: "modify_existing_action",
              id: "a1",
              title: "Action 1",
              before: "Avant",
              after: "Après",
              reason: "Exemple 1",
            }, {
              kind: "action",
              capability: "modify_existing_action",
              id: "a2",
              title: "Action 2",
              before: "Avant",
              after: "Après",
              reason: "Exemple 2",
            }],
            preserved_items: [],
          },
          boundaries: {
            affected_scope: "plan global",
            explicitly_not_affected: ["objectif global"],
            global_plan_impact: "indirect",
            explanation: "Trajectoire globale.",
          },
          rationale: {
            user_problem: "Une phase future ne fait pas sens.",
            why_this_change: "Clarifier avant de modifier.",
            expected_effect: "Moins de risque de mauvaise refonte.",
            confidence: "medium",
            missing_info: [],
          },
          user_message_brief: "Phase future à revoir.",
          user_message_detailed: "Phase future à revoir.",
        },
      },
    },
  });

  assertEquals(validation.trace.status, "needs_clarification");
  assertEquals(
    validation.review.issues.includes("whole_plan_diagnostic_not_draft_ready"),
    true,
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

Deno.test("adjust_plan_item covers 5 structured scenarios and blocks legacy patch execution", async () => {
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
      "ready_for_handoff",
      scenario.name,
    );
    assertEquals(
      runAdjustPlanDraftValidationSubSkill({ draft: output.draft! }).trace
        .status,
      "ready_for_handoff",
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
    let writeCount = 0;
    const executed = await executeAdjustPlanItem({
      operation_id: String(output.pending_confirmation?.operation_id),
      user_id: "u1",
      draft: output.draft!,
      token,
      safety_pregate_risk_band: "none",
      pending_confirmation_lookup: async () => ({ consumed: false }),
      token_consumption_check: async (tokenId) =>
        hasConsumedConfirmationTokenForTest(tokenId),
      write_plan_patch: async () => {
        writeCount += 1;
        return {
          plan_patch_id: "patch",
          bridge_plan_item_id: output.draft?.draft.execution_strategy ===
              "bridge_action"
            ? "bridge-item"
            : null,
        };
      },
      secret: SECRET,
    });
    assertEquals(writeCount, 0, scenario.name);
    assertEquals(executed.status, "blocked", scenario.name);
    assertEquals(
      executed.tool_skill_state.status,
      "handoff_delivered",
      scenario.name,
    );
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
    question_writer: testAdjustPlanQuestionWriter,
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
    "Question générée par le writer IA",
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
  assertStringIncludes(
    wholePlanReady.draft?.draft.adjust_plan_result.applied_change
      .trajectory_change?.after ?? "",
    "étape intermédiaire",
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

Deno.test("adjust_plan_item routes temporary two-week load request to current level, not whole plan", async () => {
  const output = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Je veux faire calme sur les deux prochaines semaines dans tout le plan, sans changer l'objectif global.",
    plan_snapshot: {
      items: [{
        id: "signal-1",
        title: "Convenir d'un signal de pause",
        description: "Choisir un signal commun.",
        status: "active",
        kind: "task",
        item_nature: "one_shot_mission",
        available_this_week: true,
      }, {
        id: "positive-1",
        title: "Partager un point positif",
        description: "Partager une phrase positive.",
        status: "active",
        kind: "habit",
        item_nature: "recurring_habit",
        cadence_label: "3 jours / semaine",
        target_reps: 3,
        available_this_week: true,
      }],
    },
    trigger_message_id: "m-temporary-two-week-level",
    safety_pregate_risk_band: "none",
    adjust_plan_result_writer: testAdjustPlanResultWriter,
    slot_filler: slotFillerFromOperationInput(
      wholePlanOperationInput(),
      "whole_plan_intake",
    ),
  });

  assertEquals(output.status, "ask_question");
  assertEquals(
    output.state_patch.intake_state?.target_granularity.value,
    "current_level",
  );
  assertEquals(output.state_patch.intake_state?.scope.kind, "current_level");
  assertEquals(
    output.draft?.draft.execution_strategy,
    "level_adjustment",
  );
  assertEquals(
    output.draft?.draft.adjust_plan_result.scope,
    "level",
  );
  assertEquals(
    ((output.state_patch.intake_state?.payload as any)?.constraints.values ??
      []).some((value: string) => value.startsWith("level_boundary_note:")),
    true,
  );
});

Deno.test("adjust_plan_item keeps structural next-step concern as whole plan", async () => {
  const output = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "J'ai regardé la troisième partie du plan et je pense que la prochaine étape n'est pas cohérente.",
    plan_snapshot: { items: [{ id: "walk", title: "marche" }] },
    trigger_message_id: "m-structural-next-step-whole-plan",
    safety_pregate_risk_band: "none",
    adjust_plan_result_writer: testAdjustPlanResultWriter,
    slot_filler: slotFillerFromOperationInput(
      wholePlanOperationInput(),
      "whole_plan_intake",
    ),
  });

  assertEquals(output.status, "ask_question");
  assertEquals(
    output.state_patch.intake_state?.target_granularity.value,
    "whole_plan",
  );
  assertEquals(output.state_patch.intake_state?.scope.kind, "whole_plan");
  assertEquals(
    output.draft?.draft.execution_strategy,
    "whole_plan_adjustment",
  );
});

Deno.test("adjust_plan_item treats concrete whole-plan trajectory proposal as draft-ready", async () => {
  const partialWholePlanInput = {
    ...wholePlanOperationInput({ complete: false }),
    payload: {
      ...wholePlanPayload({ complete: false }),
      constraints: { status: "missing", values: [], evidence: [] },
      affected_items: { status: "missing", values: [], evidence: [] },
    },
  };
  const output = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Oui, je veux une étape intermédiaire dans la trajectoire globale: d'abord une mission ponctuelle pour définir un protocole de retour au calme, puis une petite habitude de réparation simple avant les conversations sensibles.",
    plan_snapshot: {
      items: [{
        id: "signal-1",
        title: "Convenir d'un signal de pause",
        description: "Choisir un signal commun.",
        status: "active",
        kind: "task",
      }, {
        id: "positive-1",
        title: "Partager un point positif",
        description: "Partager une phrase positive.",
        status: "active",
        kind: "habit",
      }],
    },
    operation_input: partialWholePlanInput,
    trigger_message_id: "m-whole-plan-concrete-trajectory-ready",
    safety_pregate_risk_band: "none",
    adjust_plan_result_writer: testAdjustPlanResultWriter,
    slot_filler: slotFillerFromOperationInput(
      partialWholePlanInput,
      "whole_plan_intake",
      ["whole_plan.affected_items"],
    ),
  });

  const payload = output.state_patch.intake_state?.payload as any;
  assertEquals(output.state_patch.intake_state?.scope.kind, "whole_plan");
  assertEquals(payload?.affected_items?.status, "identified");
  assertEquals(payload?.affected_items?.values?.length >= 2, true);
  assertEquals(
    payload?.constraints?.values?.includes(
      "avoid_repetitive_clarification_when_user_gives_solution",
    ),
    true,
  );
  assertEquals(output.draft?.draft.execution_strategy, "whole_plan_adjustment");
});

Deno.test("adjust_plan_item completes current-level affected items from a concrete user transcript", async () => {
  const partialLevelInput = {
    ...levelOperationInput({ complete: false }),
    payload: {
      ...levelPayload({ complete: false }),
      reason_change: { status: "missing", evidence: [] },
      change_target: { status: "missing", evidence: [] },
      constraints: { status: "missing", values: [], evidence: [] },
      affected_items: { status: "missing", values: [], evidence: [] },
    },
  };
  let seenConstraints: string[] = [];
  const output = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Je suis fatiguée, il faut alléger le niveau actuel. Pour Partager un point positif, passe à 2 jours par semaine avec une phrase neutre, sans créneau. Pour Convenir d'un signal de pause, garde seulement un mot ou un geste simple en 5 minutes. La cartographie reste inchangée.",
    plan_snapshot: {
      items: [{
        id: "signal-1",
        title: "Convenir d'un signal de pause",
        description: "Choisir un signal commun.",
        status: "active",
        kind: "task",
        item_nature: "one_shot_mission",
      }, {
        id: "positive-1",
        title: "Partager un point positif",
        description: "Partager une phrase positive.",
        status: "active",
        kind: "habit",
        item_nature: "recurring_habit",
        cadence_label: "3 jours / semaine",
        target_reps: 3,
      }, {
        id: "map-1",
        title: "Cartographier les déclencheurs",
        description: "Clarification à garder telle quelle.",
        status: "pending",
        kind: "framework",
        item_nature: "clarification",
      }],
    },
    operation_input: partialLevelInput,
    trigger_message_id: "m-level-transcript-completion",
    safety_pregate_risk_band: "none",
    turn_count: 3,
    question_writer: testAdjustPlanQuestionWriter,
    slot_filler: slotFillerFromOperationInput(
      partialLevelInput,
      "level_intake",
      ["current_level.affected_items"],
    ),
    adjust_plan_result_writer: async (input) => {
      seenConstraints = input.user_constraints ?? [];
      return {
        confirmation_message:
          "Rien n'est encore appliqué: je te propose d'alléger ces deux actions du niveau actuel.",
        execution_message:
          "J'ai allégé les deux actions du niveau actuel sans toucher à la cartographie.",
        adjust_plan_result: {
          scope: input.scope_kind,
          applied_change: {
            summary: "Deux actions du niveau actuel sont allégées.",
            changed_items: [{
              kind: "habit",
              capability: "change_action_frequency",
              id: "positive-1",
              title: "Partager un point positif",
              before: "3 jours / semaine, phrase positive.",
              after: "2 jours / semaine, phrase neutre, sans créneau fixe.",
              reason: "Réduit la pression sans abandonner l'habitude.",
            }, {
              kind: "action",
              capability: "modify_existing_action",
              id: "signal-1",
              title: "Convenir d'un signal de pause",
              before: "Choisir un signal commun.",
              after: "Un mot ou un geste simple, en 5 minutes.",
              reason: "Rend l'action plus légère à exécuter.",
            }],
            preserved_items: [{
              kind: "action",
              id: "map-1",
              title: "Cartographier les déclencheurs",
              reason: "Le user a demandé de garder la cartographie inchangée.",
            }],
          },
          boundaries: {
            affected_scope: "niveau actuel uniquement",
            explicitly_not_affected: ["plan global"],
            global_plan_impact: "none",
            explanation: "Le changement reste limité au niveau actuel.",
          },
          rationale: {
            user_problem: "Le niveau actuel est trop chargé.",
            why_this_change:
              "Les deux actions explicitement citées portent l'allègement demandé.",
            expected_effect: "Moins de pression tout en gardant l'objectif.",
            confidence: "high",
            missing_info: [],
          },
          user_message_brief: "Deux actions allégées.",
          user_message_detailed:
            "Partager un point positif passe à 2 jours / semaine avec une phrase neutre; le signal de pause devient un mot ou un geste simple en 5 minutes.",
        },
      };
    },
  });

  assertEquals(output.status, "pending_confirmation");
  assertEquals(output.state_patch.missing_slots, []);
  assertEquals(
    (output.state_patch.intake_state?.payload as any)?.affected_items.values,
    ["Convenir d'un signal de pause", "Partager un point positif"],
  );
  assertEquals(
    output.state_patch.sub_skill_trace?.some((trace) =>
      trace.reason_code === "deterministic_level_transcript_completion"
    ),
    true,
  );
  assertEquals(seenConstraints.includes("2 jours / semaine"), true);
  assertEquals(seenConstraints.includes("instruction:phrase neutre"), true);
  assertEquals(
    seenConstraints.includes("timing:moment libre, sans créneau fixe"),
    true,
  );
  assertEquals(
    seenConstraints.includes("affected_item:Partager un point positif"),
    true,
  );
  assertEquals(
    seenConstraints.includes("affected_item:Convenir d'un signal de pause"),
    true,
  );
});

Deno.test("adjust_plan_item extends current level unchanged when user asks copy-forward week", async () => {
  const partialLevelInput = {
    ...levelOperationInput({ complete: false }),
    payload: {
      ...levelPayload({ complete: false }),
      adjustment_type: { status: "missing", evidence: [] },
      reason: { status: "missing", evidence: [] },
      reason_change: { status: "missing", evidence: [] },
      change_target: { status: "missing", evidence: [] },
      constraints: { status: "missing", values: [], evidence: [] },
      affected_items: { status: "missing", values: [], evidence: [] },
    },
  };
  const output = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Je veux garder le niveau actuel une semaine de plus. Ne change pas les actions ni le rythme, copie conforme pour consolider.",
    plan_snapshot: {
      items: [{
        id: "signal-1",
        title: "Convenir d'un signal de pause",
        description: "Choisir un signal commun.",
        status: "active",
        kind: "task",
        item_nature: "one_shot_mission",
      }, {
        id: "positive-1",
        title: "Partager un point positif",
        description: "Partager une phrase positive.",
        status: "active",
        kind: "habit",
        item_nature: "recurring_habit",
        cadence_label: "3 jours / semaine",
        target_reps: 3,
      }],
    },
    operation_input: partialLevelInput,
    trigger_message_id: "m-level-copy-forward-week",
    safety_pregate_risk_band: "none",
    adjust_plan_result_writer: testAdjustPlanResultWriter,
    slot_filler: slotFillerFromOperationInput(
      partialLevelInput,
      "level_intake",
      ["current_level.affected_items"],
    ),
  });

  const payload = output.state_patch.intake_state?.payload as any;
  const confirmation = output.draft?.confirmation_message ?? "";
  const execution = output.draft?.execution_message ?? "";
  assertEquals(output.status, "pending_confirmation");
  assertEquals(output.draft?.draft.execution_strategy, "level_adjustment");
  assertEquals(
    payload?.constraints?.values?.includes("extend_current_level_same_plan"),
    true,
  );
  assertEquals(
    payload?.constraints?.values?.includes("preserve_cadence"),
    true,
  );
  assertEquals(/\ball[eé]g/.test(confirmation + "\n" + execution), false);
  assertEquals(
    /mêmes actions|meme actions|mêmes repères|meme reperes|inchang/i.test(
      confirmation,
    ),
    true,
  );
});

Deno.test("adjust_plan_item does not treat generic exactly as a verbatim exact_text constraint", async () => {
  const levelInput = {
    ...levelOperationInput(),
    payload: {
      ...levelPayload({
        constraints: [
          "exact_text:Partager un point positif 2 jours / semaine, phrase neutre, n'importe quand.",
          "user_explicit_frequency_change",
        ],
      }),
      affected_items: {
        status: "identified",
        values: [
          "Partager un point positif",
          "Convenir d'un signal de pause",
        ],
        evidence: ["user named both active actions"],
      },
    },
  };
  const output = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Oui, prépare exactement ces deux changements, je veux juste relire le brouillon.",
    plan_snapshot: {
      items: [{
        id: "signal-1",
        title: "Convenir d'un signal de pause",
        description: "Choisir un signal commun.",
        status: "active",
        kind: "task",
        item_nature: "one_shot_mission",
      }, {
        id: "positive-1",
        title: "Partager un point positif",
        description: "Partager une phrase positive.",
        status: "active",
        kind: "habit",
        item_nature: "recurring_habit",
        cadence_label: "3 jours / semaine",
        target_reps: 3,
      }],
    },
    operation_input: levelInput,
    trigger_message_id: "m-level-generic-exactly",
    safety_pregate_risk_band: "none",
    turn_count: 3,
    slot_filler: slotFillerFromOperationInput(
      levelInput,
      "level_intake",
    ),
    adjust_plan_result_writer: async () => ({
      confirmation_message:
        "Rien n'est encore appliqué: je te propose d'alléger les deux actions du niveau actuel.",
      execution_message: "J'ai allégé les deux actions du niveau actuel.",
      adjust_plan_result: {
        scope: "level",
        applied_change: {
          summary: "Deux actions du niveau actuel sont allégées.",
          changed_items: [{
            kind: "habit",
            capability: "change_action_frequency",
            id: "positive-1",
            title: "Partager un point positif",
            before: "3 jours / semaine, phrase positive.",
            after: "2 jours / semaine, phrase neutre, n'importe quand.",
            reason: "Réduit la pression sans abandonner l'habitude.",
          }, {
            kind: "action",
            capability: "modify_existing_action",
            id: "signal-1",
            title: "Convenir d'un signal de pause",
            before: "Choisir un signal commun.",
            after: "Choisir ensemble un mot ou un geste simple en 5 minutes.",
            reason: "Rend l'action plus légère à exécuter.",
          }],
          preserved_items: [],
        },
        boundaries: {
          affected_scope: "niveau actuel uniquement",
          explicitly_not_affected: ["plan global"],
          global_plan_impact: "none",
          explanation: "Le changement reste limité au niveau actuel.",
        },
        rationale: {
          user_problem: "Le niveau actuel est trop chargé.",
          why_this_change: "Les deux actions ciblées sont allégées.",
          expected_effect: "Moins de pression.",
          confidence: "high",
          missing_info: [],
        },
        user_message_brief: "Deux actions allégées.",
        user_message_detailed:
          "Le point positif passe à 2 jours / semaine; le signal de pause devient une mission de 5 minutes.",
      },
    }),
  });

  assertEquals(output.status, "pending_confirmation");
});

Deno.test("adjust_plan_item skips draft-generation confirmation when user explicitly asks for a review-only draft", async () => {
  const input = {
    ...actionOperationInput({
      plan_item_id: "positive-1",
      label: "Partager un point positif",
    }),
    payload: actionPayload({
      adjustment_type: "rebalance",
      reason: "too_heavy",
      constraints: [
        "2 jours / semaine",
        "frequency_change:2_weekly",
        "user_explicit_frequency_change",
        "instruction:phrase simple",
      ],
    }),
  };
  const output = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Prépare seulement un brouillon pour alléger Partager un point positif à 2 fois cette semaine, sans l'appliquer.",
    plan_snapshot: {
      items: [{
        id: "positive-1",
        title: "Partager un point positif",
        description: "Partager une phrase positive.",
        status: "active",
        kind: "habit",
        item_nature: "recurring_habit",
        cadence_label: "3 jours / semaine",
        target_reps: 3,
      }],
    },
    operation_input: input,
    trigger_message_id: "m-action-review-only-draft",
    safety_pregate_risk_band: "none",
    turn_count: 1,
    force_ai_slot_filling: true,
    slot_filler: slotFillerFromOperationInput(input, "action_intake"),
    adjust_plan_result_writer: async () => ({
      confirmation_message:
        "Rien n'est encore appliqué: je te propose d'alléger l'action à 2 fois cette semaine.",
      execution_message: "J'ai allégé l'action.",
      adjust_plan_result: {
        scope: "action",
        applied_change: {
          summary: "Action allégée.",
          changed_items: [{
            id: "positive-1",
            kind: "habit",
            capability: "change_action_frequency",
            title: "Partager un point positif",
            before: "3 jours / semaine",
            after: "2 jours / semaine, phrase simple",
            reason: "Réduire la pression.",
          }],
          preserved_items: [],
        },
        boundaries: {
          affected_scope: "action ciblée uniquement",
          explicitly_not_affected: ["reste du plan"],
          global_plan_impact: "none",
          explanation: "Le reste ne change pas.",
        },
        rationale: {
          user_problem: "Action trop lourde.",
          why_this_change: "Moins de pression.",
          expected_effect: "Action plus faisable.",
          confidence: "high",
          missing_info: [],
        },
        user_message_brief: "Brouillon prêt.",
        user_message_detailed: "Brouillon prêt.",
      },
    }),
  });

  assertEquals(output.status, "pending_confirmation");
  assertEquals(output.state_patch.missing_slots, []);
  assertStringIncludes(
    output.confirmation?.message ?? "",
    "Rien n'est encore appliqué",
  );
});

Deno.test("adjust_plan_item skips draft-generation confirmation for explicit whole-plan draft", async () => {
  const input = {
    ...wholePlanOperationInput(),
    payload: {
      ...wholePlanPayload({
        constraints: [
          "brouillon seulement",
          "sans appliquer",
          "preserve_plan_intent",
        ],
      }),
    },
  };
  const output = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Propose-moi seulement un brouillon pour alléger tout le plan, sans appliquer.",
    plan_snapshot: {
      items: [{
        id: "choice-1",
        title: "Faire le choix du brut",
        description: "Choisir une option brute.",
        status: "active",
        kind: "task",
        item_nature: "one_shot_mission",
      }, {
        id: "prep-1",
        title: "Préparer tes alternatives d'avance",
        description: "Préparer deux alternatives.",
        status: "active",
        kind: "task",
        item_nature: "one_shot_mission",
      }],
    },
    operation_input: input,
    trigger_message_id: "m-whole-plan-review-only-draft",
    safety_pregate_risk_band: "none",
    turn_count: 1,
    force_ai_slot_filling: true,
    slot_filler: slotFillerFromOperationInput(input, "whole_plan_intake"),
    adjust_plan_result_writer: async () => ({
      confirmation_message:
        "Rien n'est encore appliqué: je te propose d'alléger deux points du plan tout en gardant l'intention globale.",
      execution_message: "J'ai allégé le plan.",
      adjust_plan_result: {
        scope: "whole_plan",
        applied_change: {
          summary: "Deux points du plan sont allégés.",
          trajectory_change: {
            before: "Le plan avançait avec trop de charge.",
            after:
              "Le plan garde son objectif mais passe par une progression plus légère.",
            inserted_step: "Étape d'allègement avant la suite.",
            reordered_steps: [],
            preserved_direction: "L'objectif global reste stable.",
            coaching_reason: "Réduire la charge rend la suite plus tenable.",
          },
          changed_items: [{
            id: "choice-1",
            kind: "action",
            capability: "modify_existing_action",
            title: "Faire le choix du brut",
            before: "Choisir une option brute complète.",
            after: "Choisir une option brute minimale.",
            reason: "Réduit la charge de décision.",
          }, {
            id: "prep-1",
            kind: "action",
            capability: "modify_existing_action",
            title: "Préparer tes alternatives d'avance",
            before: "Préparer deux alternatives détaillées.",
            after: "Préparer une alternative simple.",
            reason: "Garde le cap avec moins de préparation.",
          }],
          preserved_items: [],
        },
        boundaries: {
          affected_scope: "plan global",
          explicitly_not_affected: ["objectif global"],
          global_plan_impact: "indirect",
          explanation: "L'objectif reste le même.",
        },
        rationale: {
          user_problem: "Le plan est trop chargé.",
          why_this_change: "Le plan devient plus tenable.",
          expected_effect: "Moins de charge.",
          confidence: "medium",
          missing_info: [],
        },
        user_message_brief: "Brouillon prêt.",
        user_message_detailed: "Brouillon prêt.",
      },
    }),
  });

  assertEquals(output.status, "pending_confirmation");
  assertEquals(output.state_patch.missing_slots, []);
  assertStringIncludes(
    output.confirmation?.message ?? "",
    "Rien n'est encore appliqué",
  );
});

function fakePreviousDraftPayload() {
  return {
    operation_type: "adjust_plan_item" as const,
    output_schema: "plan_adjustment_draft_v1" as const,
    confirmation_message:
      "On valide cet ajustement de niveau ? Le brouillon allege la cadence.",
    execution_message: "Niveau allege.",
    execution_strategy: "level_adjustment",
    confidence: "medium" as const,
    ack_summary: { changed: ["niveau allege"], unchanged: ["objectif"] },
    adjust_plan_result: {
      scope: "level",
      applied_change: {
        summary: "Niveau allege.",
        changed_items: [
          {
            kind: "habit",
            capability: "modify_existing_action",
            id: "habit-1",
            title: "Partager un point positif",
            before: "3 jours par semaine",
            after: "2 jours par semaine",
            reason: "fatigue",
          },
        ],
        preserved_items: [],
      },
      boundaries: {
        affected_scope: "niveau actuel",
        explicitly_not_affected: ["plan global"],
        global_plan_impact: "none",
        explanation: "Reste au niveau actuel.",
      },
      rationale: {
        user_problem: "fatigue cette semaine",
        why_this_change: "alleger la cadence",
        expected_effect: "moins de pression",
        confidence: "medium" as const,
        missing_info: [],
      },
      user_message_brief: "Niveau allege.",
      user_message_detailed: "On reduit la cadence du point positif.",
    },
  };
}

function fakeWholePlanPreviousDraftPayload(
  family:
    | "sequence_order_issue"
    | "missing_bridge_or_level"
    | "direction_change"
    | "success_criteria_change"
    | "style_or_method_mismatch"
    | "split_merge_restructure",
) {
  return {
    operation_type: "adjust_plan_item" as const,
    output_schema: "plan_adjustment_draft_v1" as const,
    confirmation_message:
      "Je te propose ce changement de trajectoire. Rien n'est encore appliqué.",
    execution_message: "J'ai ajusté la trajectoire du plan.",
    draft: {
      execution_strategy: "whole_plan_adjustment",
      patch: {
        scope_kind: "whole_plan",
        constraints: [
          `whole_plan_change_family:${family}`,
          "whole_plan_readiness:draft_ready",
        ],
      },
      adjust_plan_result: {
        scope: "whole_plan",
        applied_change: {
          summary: "Trajectoire ajustée.",
          trajectory_change: {
            before: "Avant.",
            after: "Après.",
            inserted_step: "Étape.",
            reordered_steps: ["Étape", "Suite"],
            preserved_direction: "Objectif stable.",
            coaching_reason: "Progression plus cohérente.",
          },
          changed_items: [],
          preserved_items: [],
        },
      },
    },
  };
}

Deno.test("adjust_plan_item draft_validation AI approves a pending draft", async () => {
  let aiCalled = false;
  const slotFiller: AdjustPlanSlotFiller = async (): Promise<
    AdjustPlanSlotFillerOutput
  > => {
    aiCalled = true;
    return {
      current_sub_skill: "draft_validation",
      missing_slots: [],
      next_question: null,
      state_patch: {
        draft_review_decision: {
          decision: "approve",
          confidence: "high",
          evidence: ["draft_validation_ai_approve"],
        },
      },
    } as unknown as AdjustPlanSlotFillerOutput;
  };

  const output = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Oui, applique cette version: 2 jours / semaine, phrase neutre, sans creneau.",
    plan_snapshot: {
      items: [{ id: "habit-1", title: "Partager un point positif" }],
    },
    trigger_message_id: "m-shortcut-yes",
    safety_pregate_risk_band: "none",
    slot_filler: slotFiller,
    adjust_plan_result_writer: testAdjustPlanResultWriter,
    operation_input: {
      previous_draft: fakePreviousDraftPayload(),
      revision_request:
        "Oui, applique cette version: 2 jours / semaine, phrase neutre, sans creneau.",
    },
    force_ai_slot_filling: true,
  });

  assertEquals(aiCalled, true);
  assertEquals(output.status, "draft_review_decision");
  assertEquals(output.state_patch.draft_review_decision?.decision, "approve");
  assertEquals(output.state_patch.draft_review_decision?.confidence, "high");
  assertEquals(output.state_patch.missing_slots, []);
  assertEquals(
    output.state_patch.draft_review_decision?.evidence.includes(
      "draft_validation_ai_approve",
    ),
    true,
  );
});

Deno.test("adjust_plan_item treats approval plus new concrete constraint as revision", async () => {
  const slotFiller: AdjustPlanSlotFiller = async (): Promise<
    AdjustPlanSlotFillerOutput
  > => ({
    current_sub_skill: "draft_validation",
    missing_slots: [],
    next_question: null,
    state_patch: {
      draft_review_decision: {
        decision: "approve",
        confidence: "high",
        evidence: ["draft_validation_ai_approve"],
      },
    },
  } as unknown as AdjustPlanSlotFillerOutput);

  const output = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Oui, et concrètement je veux une mission ponctuelle puis une petite habitude avant la suite.",
    plan_snapshot: {
      items: [
        { id: "habit-1", title: "Partager un point positif" },
        { id: "pause-1", title: "Convenir d'un signal de pause" },
      ],
    },
    trigger_message_id: "m-approval-plus-new-constraint",
    safety_pregate_risk_band: "none",
    slot_filler: slotFiller,
    operation_input: {
      previous_draft: fakePreviousDraftPayload(),
      revision_request:
        "Oui, et concrètement je veux une mission ponctuelle puis une petite habitude avant la suite.",
    },
    adjust_plan_result_writer: testAdjustPlanResultWriter,
    question_writer: testAdjustPlanQuestionWriter,
    force_ai_slot_filling: true,
  });

  assertEquals(output.status, "pending_confirmation");
  assertEquals(output.state_patch.draft_review_decision?.decision, "revise");
  assertEquals(
    output.state_patch.draft_review_decision?.apply_after_revision,
    false,
  );
  assertEquals(
    output.state_patch.draft_review_decision?.evidence.includes(
      "approval_with_new_concrete_constraint_requires_revision",
    ),
    true,
  );
});

Deno.test("adjust_plan_item draft_validation AI rejects a pending draft", async () => {
  let aiCalled = false;
  const slotFiller: AdjustPlanSlotFiller = async (): Promise<
    AdjustPlanSlotFillerOutput
  > => {
    aiCalled = true;
    return {
      current_sub_skill: "draft_validation",
      missing_slots: [],
      next_question: null,
      state_patch: {
        draft_review_decision: {
          decision: "reject",
          confidence: "high",
          evidence: ["draft_validation_ai_reject"],
        },
      },
    } as unknown as AdjustPlanSlotFillerOutput;
  };

  const output = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "Non, laisse tomber.",
    plan_snapshot: {
      items: [{ id: "habit-1", title: "Partager un point positif" }],
    },
    trigger_message_id: "m-shortcut-no",
    safety_pregate_risk_band: "none",
    slot_filler: slotFiller,
    operation_input: {
      previous_draft: fakePreviousDraftPayload(),
      revision_request: "Non, laisse tomber.",
    },
    force_ai_slot_filling: true,
  });

  assertEquals(aiCalled, false);
  assertEquals(output.status, "draft_review_decision");
  assertEquals(output.state_patch.draft_review_decision?.decision, "reject");
  assertEquals(
    output.state_patch.draft_review_decision?.evidence.includes(
      "user_cancelled_or_rejected_pending_adjust_plan_draft",
    ),
    true,
  );
});

Deno.test("adjust_plan_item guard: whole-plan family change blocks approval", async () => {
  const slotFiller: AdjustPlanSlotFiller = async (): Promise<
    AdjustPlanSlotFillerOutput
  > => ({
    current_sub_skill: "draft_validation",
    missing_slots: [],
    next_question: null,
    state_patch: {
      draft_review_decision: {
        decision: "approve",
        confidence: "high",
        evidence: ["misclassified_family_change_as_approval"],
      },
      target_granularity: {
        status: "identified",
        value: "whole_plan",
        confidence: "high",
        evidence: ["user changes whole-plan direction"],
        negative_evidence: [],
      },
      scope: {
        status: "identified",
        kind: "whole_plan",
        plan_item_id: null,
        label: "plan global",
        evidence: ["user changes whole-plan direction"],
      },
      payload: wholePlanPayload({ family: "direction_change" }),
    },
  } as unknown as AdjustPlanSlotFillerOutput);

  const output = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Oui mais non, en fait je veux surtout changer la direction du plan vers plus de complicité.",
    plan_snapshot: {
      items: [
        { id: "habit-1", title: "Partager un point positif" },
        { id: "pause-1", title: "Convenir d'un signal de pause" },
      ],
    },
    trigger_message_id: "m-whole-plan-family-change",
    safety_pregate_risk_band: "none",
    slot_filler: slotFiller,
    adjust_plan_result_writer: testAdjustPlanResultWriter,
    operation_input: {
      previous_draft: fakeWholePlanPreviousDraftPayload(
        "sequence_order_issue",
      ),
      revision_request:
        "Oui mais non, en fait je veux surtout changer la direction du plan vers plus de complicité.",
    },
    force_ai_slot_filling: true,
  });

  assertEquals(output.status, "pending_confirmation");
  assertEquals(output.state_patch.draft_review_decision?.decision, "revise");
  assertEquals(
    output.state_patch.draft_review_decision?.apply_after_revision,
    false,
  );
  assertEquals(
    output.state_patch.draft_review_decision?.evidence.some((item) =>
      item.includes(
        "whole_plan_family_changed:sequence_order_issue->direction_change",
      ) || item === "pre_validation_concrete_constraint_requires_revision"
    ),
    true,
  );
});

Deno.test("adjust_plan_item whole-plan success criteria rewrite stays revision and no auto-apply", async () => {
  const output = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Non, ce brouillon n'est pas le bon. Ne l'applique surtout pas. Je veux que tu reformules un brouillon centre sur les indicateurs de succes du plan, avec une progression vers comprehension mutuelle et lien preserve, sans toucher l'ordre des actions pour l'instant.",
    plan_snapshot: {
      items: [
        {
          id: "pause-1",
          title: "Convenir d'un signal de pause",
          description: "Choisir un signal commun.",
          status: "active",
          kind: "task",
          item_nature: "one_shot_mission",
        },
        {
          id: "positive-1",
          title: "Partager un point positif",
          description: "Partager une phrase positive.",
          status: "active",
          kind: "habit",
          item_nature: "recurring_habit",
        },
      ],
    },
    trigger_message_id: "m-whole-plan-success-criteria-no-apply",
    safety_pregate_risk_band: "none",
    operation_input: {
      previous_draft: fakeWholePlanPreviousDraftPayload(
        "sequence_order_issue",
      ),
      revision_request:
        "Non, ce brouillon n'est pas le bon. Ne l'applique surtout pas. Je veux que tu reformules un brouillon centre sur les indicateurs de succes du plan.",
      ...wholePlanOperationInput({ family: "sequence_order_issue" }),
    },
    adjust_plan_result_writer: testAdjustPlanResultWriter,
    question_writer: testAdjustPlanQuestionWriter,
    force_ai_slot_filling: false,
  });

  assertEquals(output.status, "pending_confirmation");
  assertEquals(output.state_patch.draft_review_decision?.decision, "revise");
  assertEquals(
    output.state_patch.draft_review_decision?.apply_after_revision,
    false,
  );
  assertEquals(
    output.state_patch.draft_review_decision?.evidence.some((item) =>
      item === "explicit_no_apply_revision_requires_new_draft" ||
      item === "pre_validation_concrete_constraint_requires_revision" ||
      item.startsWith("whole_plan_family_changed:")
    ),
    true,
  );
  assertStringIncludes(
    output.draft?.confirmation_message ?? "",
    "critères de réussite",
  );
  assertStringIncludes(
    JSON.stringify(output.state_patch.operation_input ?? {}),
    "whole_plan_change_family:success_criteria_change",
  );
});

Deno.test("adjust_plan_item whole-plan success criteria can draft without named affected items", async () => {
  const operationInput = wholePlanOperationInput({
    family: "success_criteria_change",
  });
  (operationInput.payload as any).affected_items = {
    status: "missing",
    values: [],
    evidence: [],
  };

  const output = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Formule-le comme ca : reussir le plan, c est traverser une discussion tendue sans perdre le lien, avec moins de disputes comme indicateur secondaire.",
    plan_snapshot: {
      items: [
        {
          id: "pause-1",
          title: "Convenir d'un signal de pause",
          description: "Choisir un signal commun.",
          status: "active",
          kind: "task",
          item_nature: "one_shot_mission",
        },
        {
          id: "positive-1",
          title: "Partager un point positif",
          description: "Partager une phrase positive.",
          status: "active",
          kind: "habit",
          item_nature: "recurring_habit",
        },
      ],
    },
    trigger_message_id: "m-whole-plan-success-criteria-no-named-items",
    safety_pregate_risk_band: "none",
    operation_input: operationInput,
    adjust_plan_result_writer: testAdjustPlanResultWriter,
    question_writer: testAdjustPlanQuestionWriter,
    force_ai_slot_filling: false,
  });

  assertEquals(output.status, "pending_confirmation");
  assertEquals(output.state_patch.missing_slots, []);
  assertStringIncludes(
    output.draft?.confirmation_message ?? "",
    "critères de réussite",
  );
  assertStringIncludes(
    JSON.stringify(output.state_patch.operation_input ?? {}),
    "Convenir d'un signal de pause",
  );
});

Deno.test("adjust_plan_item whole-plan family constraint drafts without retry marker", async () => {
  const operationInput = wholePlanOperationInput({
    family: "success_criteria_change",
  });
  const constraints = (operationInput.payload as any).constraints;
  constraints.values = constraints.values.filter((value: string) =>
    value !== "whole_plan_directional_draft_ready"
  );

  const output = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Oui, c'est dans cette direction, mais garde moins de disputes comme repere secondaire. Le critere principal doit etre la comprehension mutuelle et le lien preserve apres une discussion tendue. Ne l'applique pas encore.",
    plan_snapshot: {
      items: [
        {
          id: "pause-1",
          title: "Convenir d'un signal de pause",
          description: "Choisir un signal commun.",
          status: "active",
          kind: "task",
          item_nature: "one_shot_mission",
        },
        {
          id: "positive-1",
          title: "Partager un point positif",
          description: "Partager une phrase positive.",
          status: "active",
          kind: "habit",
          item_nature: "recurring_habit",
        },
      ],
    },
    trigger_message_id: "m-whole-plan-family-no-retry-marker",
    safety_pregate_risk_band: "none",
    operation_input: operationInput,
    adjust_plan_result_writer: testAdjustPlanResultWriter,
    question_writer: testAdjustPlanQuestionWriter,
    force_ai_slot_filling: false,
  });

  assertEquals(output.status, "pending_confirmation");
  assertEquals(output.state_patch.missing_slots, []);
  assertStringIncludes(
    output.draft?.confirmation_message ?? "",
    "repère secondaire",
  );
});

Deno.test("adjust_plan_item whole-plan concrete answer upgrades diagnose readiness", async () => {
  const operationInput = wholePlanOperationInput({
    family: "success_criteria_change",
  });
  (operationInput.payload as any).readiness = "diagnose";
  (operationInput.payload as any).constraints = {
    status: "identified",
    values: [
      "whole_plan_change_family:success_criteria_change",
      "whole_plan_candidate_operation:change_success_criteria",
      "whole_plan_readiness:diagnose",
      "whole_plan_directional_draft_ready",
    ],
    evidence: ["previous coach asked to diagnose first"],
  };
  (operationInput.payload as any).affected_items = {
    status: "missing",
    values: [],
    evidence: [],
  };

  const output = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Je veux que ca devienne le critere principal. Garde moins de disputes comme repere secondaire, mais la vraie reussite c est la comprehension mutuelle et le lien preserve apres une discussion tendue.",
    plan_snapshot: {
      items: [
        {
          id: "pause-1",
          title: "Convenir d'un signal de pause",
          description: "Choisir un signal commun.",
          status: "active",
          kind: "task",
          item_nature: "one_shot_mission",
        },
        {
          id: "positive-1",
          title: "Partager un point positif",
          description: "Partager une phrase positive.",
          status: "active",
          kind: "habit",
          item_nature: "recurring_habit",
        },
      ],
    },
    trigger_message_id: "m-whole-plan-success-criteria-diagnose-upgrade",
    safety_pregate_risk_band: "none",
    operation_input: operationInput,
    adjust_plan_result_writer: testAdjustPlanResultWriter,
    question_writer: testAdjustPlanQuestionWriter,
    force_ai_slot_filling: false,
  });

  assertEquals(output.status, "pending_confirmation");
  assertEquals(output.state_patch.missing_slots, []);
  const operationInputText = JSON.stringify(
    output.state_patch.operation_input ?? {},
  );
  assertStringIncludes(operationInputText, "whole_plan_readiness:draft_ready");
  assertEquals(
    operationInputText.includes("whole_plan_readiness:diagnose"),
    false,
  );
});

Deno.test("adjust_plan_item whole-plan pre-validation concrete revision regenerates draft", async () => {
  const output = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Oui c'est la bonne direction, mais je veux garder moins de disputes comme repere secondaire, pas comme critere principal. Ne l'applique pas encore, montre-moi juste la version ajustee.",
    plan_snapshot: {
      items: [
        {
          id: "pause-1",
          title: "Convenir d'un signal de pause",
          description: "Choisir un signal commun.",
          status: "active",
          kind: "task",
          item_nature: "one_shot_mission",
        },
        {
          id: "positive-1",
          title: "Partager un point positif",
          description: "Partager une phrase positive.",
          status: "active",
          kind: "habit",
          item_nature: "recurring_habit",
        },
      ],
    },
    trigger_message_id: "m-whole-plan-prevalidation-concrete-revision",
    safety_pregate_risk_band: "none",
    operation_input: {
      previous_draft: fakeWholePlanPreviousDraftPayload(
        "success_criteria_change",
      ),
      revision_request:
        "Oui c'est la bonne direction, mais je veux garder moins de disputes comme repere secondaire.",
      ...wholePlanOperationInput({ family: "success_criteria_change" }),
    },
    adjust_plan_result_writer: testAdjustPlanResultWriter,
    question_writer: testAdjustPlanQuestionWriter,
    force_ai_slot_filling: false,
  });

  assertEquals(output.status, "pending_confirmation");
  assertEquals(output.state_patch.draft_review_decision?.decision, "revise");
  assertEquals(
    output.state_patch.draft_review_decision?.apply_after_revision,
    false,
  );
  assertEquals(
    output.state_patch.draft_review_decision?.evidence.some((item) =>
      [
        "explicit_no_apply_revision_requires_new_draft",
        "pre_validation_concrete_constraint_requires_revision",
      ].includes(item)
    ),
    true,
  );
  assertStringIncludes(
    JSON.stringify(output.state_patch.operation_input ?? {}),
    "whole_plan_change_family:success_criteria_change",
  );
});

Deno.test("adjust_plan_item whole-plan approval-like constraint revises without applying", async () => {
  const output = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Oui, mais je ne veux pas que ca baisse le niveau. Je veux que ca reste ambitieux, juste moins mental. Garde la discussion apres l experience, pas avant. Ne l'applique pas encore.",
    plan_snapshot: {
      items: [
        {
          id: "pause-1",
          title: "Convenir d'un signal de pause",
          description: "Choisir un signal commun.",
          status: "active",
          kind: "task",
          item_nature: "one_shot_mission",
        },
        {
          id: "positive-1",
          title: "Partager un point positif",
          description: "Partager une phrase positive.",
          status: "active",
          kind: "habit",
          item_nature: "recurring_habit",
        },
      ],
    },
    trigger_message_id: "m-whole-plan-approval-like-constraint-revises",
    safety_pregate_risk_band: "none",
    operation_input: {
      previous_draft: fakeWholePlanPreviousDraftPayload(
        "style_or_method_mismatch",
      ),
      revision_request:
        "Oui, mais je veux que ca reste ambitieux, juste moins mental. Ne l'applique pas encore.",
      ...wholePlanOperationInput({ family: "style_or_method_mismatch" }),
    },
    adjust_plan_result_writer: testAdjustPlanResultWriter,
    question_writer: testAdjustPlanQuestionWriter,
    force_ai_slot_filling: false,
  });

  assertEquals(output.status, "pending_confirmation");
  assertEquals(output.state_patch.draft_review_decision?.decision, "revise");
  assertEquals(
    output.state_patch.draft_review_decision?.apply_after_revision,
    false,
  );
  assertEquals(
    output.state_patch.draft_review_decision?.evidence.includes(
      "pre_validation_concrete_constraint_requires_revision",
    ),
    true,
  );
  assertStringIncludes(output.draft?.confirmation_message ?? "", "ambition");
});

Deno.test("adjust_plan_item whole-plan split/merge accepts repeated enum answer", async () => {
  const output = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "La difference principale, c'est la difficulte du contenu. Niveau besoins = petits sujets neutres. Niveau sujets sensibles = argent, famille, intimite. Je veux que le plan fasse une vraie marche entre les deux, pas deux phases floues.",
    plan_snapshot: {
      items: [
        {
          id: "pause-1",
          title: "Convenir d'un signal de pause",
          description: "Choisir un signal commun.",
          status: "active",
          kind: "task",
          item_nature: "one_shot_mission",
        },
        {
          id: "positive-1",
          title: "Partager un point positif",
          description: "Partager une phrase positive.",
          status: "active",
          kind: "habit",
          item_nature: "recurring_habit",
        },
      ],
    },
    trigger_message_id: "m-whole-plan-split-merge-enum-answer",
    safety_pregate_risk_band: "none",
    operation_input: wholePlanOperationInput(),
    adjust_plan_result_writer: testAdjustPlanResultWriter,
    question_writer: testAdjustPlanQuestionWriter,
    force_ai_slot_filling: false,
  });

  assertEquals(output.status, "pending_confirmation");
  assertEquals(output.state_patch.missing_slots, []);
  assertStringIncludes(
    output.draft?.confirmation_message ?? "",
    "séparation",
  );
  assertStringIncludes(
    JSON.stringify(output.state_patch.operation_input ?? {}),
    "whole_plan_change_family:split_merge_restructure",
  );
});

Deno.test("adjust_plan_item whole-plan split/merge does not add bridge when user rejects it", async () => {
  const output = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Ca me va, mais je veux eviter une etape pont en plus si ce n est pas necessaire. Je prefere garder deux niveaux distincts : besoins simples, puis sujets sensibles.",
    plan_snapshot: {
      items: [
        {
          id: "pause-1",
          title: "Convenir d'un signal de pause",
          description: "Choisir un signal commun.",
          status: "active",
          kind: "task",
          item_nature: "one_shot_mission",
        },
        {
          id: "positive-1",
          title: "Partager un point positif",
          description: "Partager une phrase positive.",
          status: "active",
          kind: "habit",
          item_nature: "recurring_habit",
        },
      ],
    },
    trigger_message_id: "m-whole-plan-split-merge-rejects-bridge",
    safety_pregate_risk_band: "none",
    operation_input: wholePlanOperationInput({
      family: "split_merge_restructure",
    }),
    adjust_plan_result_writer: testAdjustPlanResultWriter,
    question_writer: testAdjustPlanQuestionWriter,
    force_ai_slot_filling: false,
  });

  assertEquals(output.status, "pending_confirmation");
  assertStringIncludes(
    JSON.stringify(output.state_patch.operation_input ?? {}),
    "whole_plan_change_family:split_merge_restructure",
  );
  assertStringIncludes(
    JSON.stringify(output.state_patch.operation_input ?? {}),
    "split_merge_no_bridge_step",
  );
  assertStringIncludes(
    output.draft?.confirmation_message ?? "",
    "sans ajouter d'étape pont",
  );
  assertEquals(
    (output.draft?.confirmation_message ?? "").includes(
      "j'insère une étape intermédiaire",
    ),
    false,
  );
});

Deno.test("adjust_plan_item whole-plan passage criterion stays split/merge and drafts", async () => {
  const output = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Marque la separation par un critere de passage : on passe aux sujets sensibles seulement quand on arrive a faire une demande simple sans tension forte deux fois d'affilee. Ne l'applique pas encore, montre-moi le brouillon.",
    plan_snapshot: {
      items: [
        {
          id: "pause-1",
          title: "Convenir d'un signal de pause",
          description: "Choisir un signal commun.",
          status: "active",
          kind: "task",
          item_nature: "one_shot_mission",
        },
        {
          id: "positive-1",
          title: "Partager un point positif",
          description: "Partager une phrase positive.",
          status: "active",
          kind: "habit",
          item_nature: "recurring_habit",
        },
      ],
    },
    trigger_message_id: "m-whole-plan-split-merge-passage-criterion",
    safety_pregate_risk_band: "none",
    operation_input: wholePlanOperationInput({
      family: "split_merge_restructure",
    }),
    adjust_plan_result_writer: testAdjustPlanResultWriter,
    question_writer: testAdjustPlanQuestionWriter,
    force_ai_slot_filling: false,
  });

  assertEquals(output.status, "pending_confirmation");
  const operationInput = JSON.stringify(
    output.state_patch.operation_input ?? {},
  );
  assertStringIncludes(
    operationInput,
    "whole_plan_change_family:split_merge_restructure",
  );
  assertStringIncludes(
    operationInput,
    "split_merge_transition_criterion:two_consecutive_simple_requests_without_high_tension",
  );
  assertStringIncludes(
    output.draft?.confirmation_message ?? "",
    "deux demandes simples d'affilée",
  );
});

Deno.test("adjust_plan_item whole-plan direction change names complicity axis", async () => {
  const output = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Je veux changer l'axe global du plan : garder l'apaisement comme base, mais orienter la suite vers plus de complicite, de plaisir simple et d'initiatives positives de lien.",
    plan_snapshot: {
      items: [
        {
          id: "pause-1",
          title: "Convenir d'un signal de pause",
          description: "Choisir un signal commun.",
          status: "active",
          kind: "task",
          item_nature: "one_shot_mission",
        },
        {
          id: "positive-1",
          title: "Partager un point positif",
          description: "Partager une phrase positive.",
          status: "active",
          kind: "habit",
          item_nature: "recurring_habit",
        },
      ],
    },
    trigger_message_id: "m-whole-plan-direction-complicity-axis",
    safety_pregate_risk_band: "none",
    operation_input: wholePlanOperationInput(),
    adjust_plan_result_writer: testAdjustPlanResultWriter,
    question_writer: testAdjustPlanQuestionWriter,
    force_ai_slot_filling: false,
  });

  assertEquals(output.status, "pending_confirmation");
  const operationInput = JSON.stringify(
    output.state_patch.operation_input ?? {},
  );
  assertStringIncludes(
    operationInput,
    "whole_plan_change_family:direction_change",
  );
  assertStringIncludes(
    operationInput,
    "direction_axis:complicity_and_simple_pleasure",
  );
  assertStringIncludes(
    output.draft?.confirmation_message ?? "",
    "complicité",
  );
});

Deno.test("adjust_plan_item whole-plan value preference without additions stays change emphasis", async () => {
  const output = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Je veux ajuster le plan global : il me donne une impression de performance, comme si je devais cocher des cases. Je veux garder l'objectif de couple, mais réorienter le cap vers chaleur et fiabilité, sans ajouter d'actions.",
    plan_snapshot: {
      items: [
        {
          id: "pause-1",
          title: "Convenir d'un signal de pause",
          description: "Choisir un signal commun.",
          status: "active",
          kind: "task",
          item_nature: "one_shot_mission",
        },
        {
          id: "positive-1",
          title: "Partager un point positif",
          description: "Partager une phrase positive.",
          status: "active",
          kind: "habit",
          item_nature: "recurring_habit",
        },
      ],
    },
    trigger_message_id: "m-whole-plan-value-preference-no-add",
    safety_pregate_risk_band: "none",
    operation_input: wholePlanOperationInput(),
    adjust_plan_result_writer: testAdjustPlanResultWriter,
    question_writer: testAdjustPlanQuestionWriter,
    force_ai_slot_filling: false,
  });

  assertEquals(output.status, "pending_confirmation");
  const operationInput = JSON.stringify(
    output.state_patch.operation_input ?? {},
  );
  assertStringIncludes(
    operationInput,
    "whole_plan_change_family:value_preference_conflict",
  );
  assertStringIncludes(
    operationInput,
    "whole_plan_candidate_operation:change_emphasis",
  );
  if (
    operationInput.includes("whole_plan_change_family:missing_bridge_or_level")
  ) {
    throw new Error("sans ajouter d'actions must not insert a bridge level");
  }
  if (
    (output.draft?.confirmation_message ?? "").includes("niveau intermédiaire")
  ) {
    throw new Error(
      "value preference change must not propose an intermediate level",
    );
  }
  assertStringIncludes(
    output.draft?.confirmation_message ?? "",
    "moins de performance",
  );
  assertStringIncludes(
    output.draft?.confirmation_message ?? "",
    "plus de chaleur et de fiabilité",
  );
});

Deno.test("adjust_plan_item whole-plan repair reconnection step is concrete", async () => {
  const output = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Je préfère ajouter une étape explicite, mais pas un truc lourd : reconnaître brièvement ce qui s'est passé, puis proposer un petit geste de retour au contact.",
    plan_snapshot: {
      items: [
        {
          id: "pause-1",
          title: "Convenir d'un signal de pause",
          description: "Choisir un signal commun.",
          status: "active",
          kind: "task",
          item_nature: "one_shot_mission",
        },
        {
          id: "positive-1",
          title: "Partager un point positif",
          description: "Partager une phrase positive.",
          status: "active",
          kind: "habit",
          item_nature: "recurring_habit",
        },
      ],
    },
    trigger_message_id: "m-whole-plan-repair-reconnection-step",
    safety_pregate_risk_band: "none",
    operation_input: wholePlanOperationInput(),
    adjust_plan_result_writer: testAdjustPlanResultWriter,
    question_writer: testAdjustPlanQuestionWriter,
    force_ai_slot_filling: false,
  });

  assertEquals(output.status, "pending_confirmation");
  const operationInput = JSON.stringify(
    output.state_patch.operation_input ?? {},
  );
  assertStringIncludes(
    operationInput,
    "insert_phase_kind:repair_reconnection_after_tension",
  );
  assertStringIncludes(
    output.draft?.confirmation_message ?? "",
    "reconnaître brièvement la tension",
  );
  assertStringIncludes(
    output.draft?.confirmation_message ?? "",
    "geste de retour au contact",
  );
  if (
    (output.draft?.confirmation_message ?? "").includes("niveau intermédiaire")
  ) {
    throw new Error(
      "repair reconnection draft must not call this a generic intermediate level",
    );
  }
  if (
    (output.draft?.confirmation_message ?? "").includes(
      "avec un niveau intermédiaire avec",
    )
  ) {
    throw new Error(
      "repair reconnection draft must not use generic duplicate copy",
    );
  }
});

Deno.test("adjust_plan_item whole-plan dispute bridge is not sensitive-topics split", async () => {
  const output = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "J'ai relu la suite du plan et je trouve qu'il manque une marche. On passe trop vite vers comprendre les tensions, alors que j'aimerais d'abord apprendre à se retrouver après une dispute.",
    plan_snapshot: {
      items: [
        {
          id: "pause-1",
          title: "Convenir d'un signal de pause",
          description: "Choisir un signal commun.",
          status: "active",
          kind: "task",
          item_nature: "one_shot_mission",
        },
        {
          id: "positive-1",
          title: "Partager un point positif",
          description: "Partager une phrase positive.",
          status: "active",
          kind: "habit",
          item_nature: "recurring_habit",
        },
      ],
    },
    trigger_message_id: "m-whole-plan-dispute-bridge",
    safety_pregate_risk_band: "none",
    operation_input: wholePlanOperationInput(),
    adjust_plan_result_writer: testAdjustPlanResultWriter,
    question_writer: testAdjustPlanQuestionWriter,
    force_ai_slot_filling: false,
  });

  assertEquals(output.status, "pending_confirmation");
  const operationInput = JSON.stringify(
    output.state_patch.operation_input ?? {},
  );
  assertStringIncludes(
    operationInput,
    "whole_plan_change_family:missing_bridge_or_level",
  );
  assertStringIncludes(
    operationInput,
    "insert_phase_kind:repair_reconnection_after_tension",
  );
  assertStringIncludes(
    output.draft?.confirmation_message ?? "",
    "réparation",
  );
  const confirmation = output.draft?.confirmation_message ?? "";
  for (const forbidden of ["argent", "famille", "intimité"]) {
    if (confirmation.includes(forbidden)) {
      throw new Error(`dispute repair bridge must not mention ${forbidden}`);
    }
  }
});

Deno.test("adjust_plan_item whole-plan implicit return-in-link bridge is repair step", async () => {
  const output = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Je viens de relire la prochaine partie du plan. Ce qui me manque, ce n est pas analyser la dispute, c est une mini marche pour revenir en lien apres un accrochage avant de reparler du fond.",
    plan_snapshot: {
      items: [
        {
          id: "pause-1",
          title: "Convenir d'un signal de pause",
          description: "Choisir un signal commun.",
          status: "active",
          kind: "task",
          item_nature: "one_shot_mission",
        },
        {
          id: "positive-1",
          title: "Partager un point positif",
          description: "Partager une phrase positive.",
          status: "active",
          kind: "habit",
          item_nature: "recurring_habit",
        },
      ],
    },
    trigger_message_id: "m-whole-plan-return-in-link",
    safety_pregate_risk_band: "none",
    operation_input: wholePlanOperationInput(),
    adjust_plan_result_writer: testAdjustPlanResultWriter,
    question_writer: testAdjustPlanQuestionWriter,
    force_ai_slot_filling: false,
  });

  assertEquals(output.status, "pending_confirmation");
  const operationInput = JSON.stringify(
    output.state_patch.operation_input ?? {},
  );
  assertStringIncludes(
    operationInput,
    "whole_plan_change_family:missing_bridge_or_level",
  );
  assertStringIncludes(
    operationInput,
    "insert_phase_kind:repair_reconnection_after_tension",
  );
  assertStringIncludes(output.draft?.confirmation_message ?? "", "réparation");
  const confirmation = output.draft?.confirmation_message ?? "";
  for (const forbidden of ["argent", "famille", "intimité"]) {
    if (confirmation.includes(forbidden)) {
      throw new Error(`return-in-link bridge must not mention ${forbidden}`);
    }
  }
});

Deno.test("adjust_plan_item whole-plan missing bridge materializes short consolidation level", async () => {
  const output = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Je veux vraiment ajouter un niveau court en plus, un sas d'une semaine avant les sujets sensibles, avec deux actions: observer ce qui apaise et faire une demande simple sans débat.",
    plan_snapshot: {
      items: [
        {
          id: "pause-1",
          title: "Convenir d'un signal de pause",
          description: "Choisir un signal commun.",
          status: "active",
          kind: "task",
          item_nature: "one_shot_mission",
        },
        {
          id: "positive-1",
          title: "Partager un point positif",
          description: "Partager une phrase positive.",
          status: "active",
          kind: "habit",
          item_nature: "recurring_habit",
        },
      ],
    },
    trigger_message_id: "m-whole-plan-short-consolidation-level",
    safety_pregate_risk_band: "none",
    operation_input: wholePlanOperationInput(),
    adjust_plan_result_writer: testAdjustPlanResultWriter,
    question_writer: testAdjustPlanQuestionWriter,
    force_ai_slot_filling: false,
  });

  assertEquals(output.status, "pending_confirmation");
  const operationInput = JSON.stringify(
    output.state_patch.operation_input ?? {},
  );
  assertStringIncludes(
    operationInput,
    "whole_plan_change_family:missing_bridge_or_level",
  );
  assertStringIncludes(
    output.draft?.confirmation_message ?? "",
    "niveau court de consolidation",
  );
  assertStringIncludes(
    output.draft?.confirmation_message ?? "",
    "observer ce qui apaise",
  );
  assertStringIncludes(
    output.draft?.confirmation_message ?? "",
    "demande simple sans débat",
  );
});

Deno.test("adjust_plan_item whole-plan ne valide pas revises without applying", async () => {
  const output = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Ne valide pas. Le brouillon doit nommer explicitement l'axe complicite/plaisir simple et expliquer que les prochains niveaux auront des initiatives positives, pas seulement le signal de pause.",
    plan_snapshot: {
      items: [
        {
          id: "pause-1",
          title: "Convenir d'un signal de pause",
          description: "Choisir un signal commun.",
          status: "active",
          kind: "task",
          item_nature: "one_shot_mission",
        },
        {
          id: "positive-1",
          title: "Partager un point positif",
          description: "Partager une phrase positive.",
          status: "active",
          kind: "habit",
          item_nature: "recurring_habit",
        },
      ],
    },
    trigger_message_id: "m-whole-plan-ne-valide-pas-revises",
    safety_pregate_risk_band: "none",
    operation_input: {
      previous_draft: fakeWholePlanPreviousDraftPayload("direction_change"),
      revision_request:
        "Ne valide pas. Le brouillon doit nommer explicitement l'axe complicite/plaisir simple.",
      ...wholePlanOperationInput({ family: "direction_change" }),
    },
    adjust_plan_result_writer: testAdjustPlanResultWriter,
    question_writer: testAdjustPlanQuestionWriter,
    force_ai_slot_filling: false,
  });

  assertEquals(output.status, "pending_confirmation");
  assertEquals(output.state_patch.draft_review_decision?.decision, "revise");
  assertEquals(
    output.state_patch.draft_review_decision?.apply_after_revision,
    false,
  );
  assertStringIncludes(
    output.draft?.confirmation_message ?? "",
    "complicité",
  );
});

Deno.test("adjust_plan_item correction_to_pending is handled by the AI slot filler", async () => {
  let aiCalled = false;
  const slotFiller: AdjustPlanSlotFiller = async (): Promise<
    AdjustPlanSlotFillerOutput
  > => {
    aiCalled = true;
    return {
      current_sub_skill: "level_intake",
      missing_slots: [],
      next_question: "Quelle est la nouvelle cadence souhaitee ?",
      state_patch: { decision: "revise", confidence: "medium" },
    } as unknown as AdjustPlanSlotFillerOutput;
  };

  const output = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "Plutot 1 jour par semaine, le mardi.",
    plan_snapshot: {
      items: [{ id: "habit-1", title: "Partager un point positif" }],
    },
    trigger_message_id: "m-shortcut-correction",
    safety_pregate_risk_band: "none",
    slot_filler: slotFiller,
    question_writer: testAdjustPlanQuestionWriter,
    operation_input: {
      previous_draft: fakePreviousDraftPayload(),
      revision_request: "Plutot 1 jour par semaine, le mardi.",
    },
    force_ai_slot_filling: true,
  });

  assertEquals(aiCalled, true);
  assertEquals(
    output.state_patch.sub_skill_trace?.some((trace) =>
      trace.reason_code === "deterministic_approve_shortcut" ||
      trace.reason_code === "deterministic_reject_shortcut"
    ),
    false,
  );
});

Deno.test("adjust_plan_item pre-validation question stays in AI draft_validation", async () => {
  let aiCalled = false;
  const slotFiller: AdjustPlanSlotFiller = async (): Promise<
    AdjustPlanSlotFillerOutput
  > => {
    aiCalled = true;
    return {
      current_sub_skill: "level_intake",
      missing_slots: [],
      next_question: null,
      state_patch: { decision: "explain", confidence: "medium" },
    } as unknown as AdjustPlanSlotFillerOutput;
  };

  const output = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Avant que je dise oui, tu peux me dire concretement les deux changements ?",
    plan_snapshot: {
      items: [{ id: "habit-1", title: "Partager un point positif" }],
    },
    trigger_message_id: "m-shortcut-question-mark",
    safety_pregate_risk_band: "none",
    slot_filler: slotFiller,
    question_writer: testAdjustPlanQuestionWriter,
    operation_input: {
      previous_draft: fakePreviousDraftPayload(),
      revision_request:
        "Avant que je dise oui, tu peux me dire concretement les deux changements ?",
    },
    force_ai_slot_filling: true,
  });

  assertEquals(aiCalled, true);
  assertEquals(
    output.state_patch.sub_skill_trace?.some((trace) =>
      trace.reason_code === "deterministic_approve_shortcut"
    ),
    false,
  );
});

Deno.test("adjust_plan_item guard: pre-validation detail request cannot approve a pending draft", async () => {
  let aiCalled = false;
  const slotFiller: AdjustPlanSlotFiller = async (): Promise<
    AdjustPlanSlotFillerOutput
  > => {
    aiCalled = true;
    return {
      current_sub_skill: "draft_validation",
      missing_slots: [],
      next_question: null,
      state_patch: {
        draft_review_decision: {
          decision: "approve",
          confidence: "high",
          evidence: ["misclassified by AI"],
        },
      },
    } as unknown as AdjustPlanSlotFillerOutput;
  };

  const output = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Avant validation, confirme que Faire le point reste inchangé et que l'objectif global ne bouge pas.",
    plan_snapshot: {
      items: [{ id: "habit-1", title: "Partager un point positif" }],
    },
    trigger_message_id: "m-prevalidation-detail",
    safety_pregate_risk_band: "none",
    slot_filler: slotFiller,
    operation_input: {
      previous_draft: fakePreviousDraftPayload(),
      revision_request:
        "Avant validation, confirme que Faire le point reste inchangé et que l'objectif global ne bouge pas.",
    },
    force_ai_slot_filling: true,
  });

  assertEquals(aiCalled, true);
  assertEquals(output.status, "draft_review_decision");
  assertEquals(output.state_patch.draft_review_decision?.decision, "explain");
  assertEquals(
    output.state_patch.draft_review_decision?.evidence.includes(
      "pre_validation_detail_request_blocks_approval",
    ),
    true,
  );
});

Deno.test("adjust_plan_item guard: pre-validation revision cannot auto-apply after regeneration", async () => {
  const slotFiller: AdjustPlanSlotFiller = async (): Promise<
    AdjustPlanSlotFillerOutput
  > => ({
    current_sub_skill: "draft_validation",
    missing_slots: [],
    next_question: null,
    state_patch: {
      draft_review_decision: {
        decision: "revise",
        confidence: "high",
        evidence: ["correction before validation"],
        apply_after_revision: true,
      },
      target_granularity: {
        status: "identified",
        value: "current_level",
        confidence: "high",
        evidence: ["current level"],
        negative_evidence: [],
      },
      scope: {
        status: "identified",
        kind: "current_level",
        plan_item_id: null,
        label: "niveau actuel",
        evidence: ["current level"],
      },
      payload: levelPayload(),
    },
  } as unknown as AdjustPlanSlotFillerOutput);

  const output = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message:
      "Corrige juste ça avant validation: les 5 minutes concernent seulement le signal de pause.",
    plan_snapshot: {
      items: [{
        id: "signal-1",
        title: "Convenir d'un signal de pause",
        description: "Choisir un signal commun.",
        status: "active",
        kind: "task",
        item_nature: "one_shot_mission",
      }, {
        id: "positive-1",
        title: "Partager un point positif",
        description: "Partager une phrase positive.",
        status: "active",
        kind: "habit",
        item_nature: "recurring_habit",
      }],
    },
    trigger_message_id: "m-prevalidation-revision-no-auto-apply",
    safety_pregate_risk_band: "none",
    slot_filler: slotFiller,
    operation_input: {
      previous_draft: fakePreviousDraftPayload(),
      revision_request:
        "Corrige juste ça avant validation: les 5 minutes concernent seulement le signal de pause.",
    },
    adjust_plan_result_writer: testAdjustPlanResultWriter,
    question_writer: testAdjustPlanQuestionWriter,
    force_ai_slot_filling: true,
  });

  assertEquals(
    output.state_patch.draft_review_decision?.decision,
    "revise",
  );
  assertEquals(
    output.state_patch.draft_review_decision?.apply_after_revision,
    false,
  );
  assertEquals(
    output.state_patch.draft_review_decision?.evidence.includes(
      "pre_validation_detail_request_blocks_apply_after_revision",
    ),
    true,
  );
});

Deno.test("adjust_plan_item yes without previous_draft stays in normal intake", async () => {
  let aiCalled = false;
  const slotFiller: AdjustPlanSlotFiller = async (): Promise<
    AdjustPlanSlotFillerOutput
  > => {
    aiCalled = true;
    return {
      current_sub_skill: "scope_router",
      missing_slots: ["scope"],
      next_question: "Quelle est la cible de l'ajustement ?",
      state_patch: {},
    } as unknown as AdjustPlanSlotFillerOutput;
  };

  const output = await runAdjustPlanItemIntake({
    user_id: "u1",
    channel: "whatsapp",
    timezone: "Europe/Paris",
    message: "Oui",
    plan_snapshot: { items: [{ id: "habit-1", title: "marche" }] },
    trigger_message_id: "m-shortcut-no-pending",
    safety_pregate_risk_band: "none",
    slot_filler: slotFiller,
    question_writer: testAdjustPlanQuestionWriter,
    operation_input: {},
    force_ai_slot_filling: true,
  });

  assertEquals(aiCalled, true);
  assertEquals(
    output.state_patch.sub_skill_trace?.some((trace) =>
      trace.reason_code === "deterministic_approve_shortcut"
    ),
    false,
  );
});
