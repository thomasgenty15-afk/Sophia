import {
  attachPendingRecommendationOperation,
  buildRecommendationFromToolSkillOpportunity,
  computeStreakFromEntries,
  deterministicStaleBilanDecision,
  effectiveResponseOwnerForOperationRuntime,
  isExplicitPendingApplyConfirmation,
  logPlanItemProgressV2,
  mapMomentumStateV2ToCoachingContext,
  maybeRunAdjustPlanItemOperation,
  maybeRunPrepareAttackCardOperation,
  renderAdjustPlanDraftDetails,
  resolveAgentChatModel,
  resolveCoachingTargetPlanItem,
  resolveWeeklyForgottenProgressCandidate,
  writePlanAdjustmentPatch,
} from "./run.ts";
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

Deno.test("deterministicStaleBilanDecision: resumes stale bilan on explicit resume", () => {
  assertEquals(
    deterministicStaleBilanDecision("ok on reprend"),
    "resume_bilan",
  );
});

Deno.test("deterministicStaleBilanDecision: stops for today on defer language", () => {
  assertEquals(
    deterministicStaleBilanDecision("pas maintenant, on voit demain"),
    "stop_for_today",
  );
});

Deno.test("deterministicStaleBilanDecision: leaves unrelated topic unresolved for fallback", () => {
  assertEquals(
    deterministicStaleBilanDecision("au fait j'ai une question sur mon plan"),
    null,
  );
});

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

Deno.test("resolveWeeklyForgottenProgressCandidate: fills action count and weekly date", () => {
  const candidate = resolveWeeklyForgottenProgressCandidate({
    activeSkillState: {
      skill_id: "weekly_adaptive_review_v1",
      weekly_progress_review: {
        week_start_date: "2026-05-11",
        week_end_date: "2026-05-17",
        transformations: [{
          actions: [{
            plan_item_id: "walk",
            title: "Marche 20 minutes",
            deviation: "missed",
            status: "missed",
          }],
        }],
      },
      weekly_adaptive_review: {
        item_decisions: [{
          plan_item_id: "walk",
          title: "Marche 20 minutes",
          current_week_status: "missed",
          family: "habit",
        }],
      },
    },
    userMessage:
      "Ah oui j'ai oublie de dire que j'avais fait Marche 20 minutes mercredi, 2 fois",
  });

  assertEquals(candidate.ready, true);
  assertEquals(candidate.plan_item_id, "walk");
  assertEquals(candidate.count, 2);
  assertEquals(candidate.date_hint, "2026-05-13");
});

Deno.test("resolveWeeklyForgottenProgressCandidate: refuses ambiguous weekly corrections", () => {
  const candidate = resolveWeeklyForgottenProgressCandidate({
    activeSkillState: {
      skill_id: "weekly_adaptive_review_v1",
      weekly_progress_review: {
        week_start_date: "2026-05-11",
        week_end_date: "2026-05-17",
        transformations: [{
          actions: [
            {
              plan_item_id: "walk",
              title: "Marche 20 minutes",
              deviation: "missed",
              status: "missed",
            },
            {
              plan_item_id: "journal",
              title: "Journal du soir",
              deviation: "missed",
              status: "missed",
            },
          ],
        }],
      },
      weekly_adaptive_review: { item_decisions: [] },
    },
    userMessage: "Ah oui j'ai oublie de cocher que je l'avais fait",
  });

  assertEquals(candidate.detected, true);
  assertEquals(candidate.ready, false);
  assertEquals(candidate.reason_code, "missing_or_ambiguous_action");
});

Deno.test("renderAdjustPlanDraftDetails includes broader changed and preserved examples", () => {
  const content = renderAdjustPlanDraftDetails({
    draft: {
      draft: {
        adjust_plan_result: {
          applied_change: {
            changed_items: [
              {
                title: "Faire le choix du brut",
                before: "6 jours par semaine",
                after: "3 jours par semaine",
                reason: "Réduire la pression.",
              },
              {
                title: "Préparer tes alternatives d'avance",
                before: "Plusieurs options.",
                after: "Une option simple.",
                reason: "Réduire la logistique.",
              },
              {
                title: "Faire le point sur le signal de pause",
                before: "Bilan complet.",
                after: "Bilan court avec une seule question.",
                reason: "Garder l'apprentissage sans alourdir.",
              },
            ],
            preserved_items: [{
              title: "Cartographier les moments de tension",
              reason: "Cette observation reste utile.",
            }],
          },
        },
      },
    },
  }, { preferExamples: true });

  assertStringIncludes(
    content ?? "",
    "Faire le point sur le signal de pause",
  );
  assertStringIncludes(
    content ?? "",
    "Cartographier les moments de tension",
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

Deno.test("resolveAgentChatModel: sentry mode keeps default flash model", () => {
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
    String(getGlobalAiModel("gemini-2.5-flash")).trim(),
  );
  assertEquals(selected.source, "non_companion_default");
  assertEquals(selected.tier, "default");
});

Deno.test("resolveAgentChatModel: companion uses memory plan tier when confidence is sufficient", () => {
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

  assertEquals(selected.model, "gpt-5.4-nano");
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

Deno.test("resolveAgentChatModel: low-confidence memory plan falls back to current default", () => {
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

  assertEquals(
    selected.model,
    String(getGlobalAiModel("gemini-2.5-flash")).trim(),
  );
  assertEquals(selected.source, "companion_default");
  assertEquals(selected.tier, "default");
});

Deno.test("attack card opportunity keeps identified target through recommendation consent", async () => {
  const turnFrame: any = {
    turn_id: "turn-attack-opportunity",
    source_message_id: "msg-1",
    user_id: "u1",
    channel: "whatsapp",
    safety: { risk_band: "none", reason_codes: [], evidence: [] },
    direct_effects: [],
    tool_skill_intents: [],
    tool_skill_opportunity: {
      type: "attack_card",
      operation_type: "prepare_attack_card",
      surface_id: "attack_card",
      confidence_band: "high",
      should_offer: true,
      prop_reason:
        "user completed the action but mentions recurring startup friction",
      source_span: "j'ai tourné autour pendant 45 minutes avant de commencer",
      target_hint: "Envoyer le dossier",
      target_status: "identified",
      suggested_question_intent: "offer_attack_card",
      offer_timing: "now",
      must_not_execute: true,
    },
    skill_signals: {},
    memory_plan: {
      context_need: "minimal",
      memory_mode: "light",
      context_budget_tier: "small",
      targets: [],
      retrieval_policy: "semantic_first",
    },
  };
  const planItemSnapshot = [{
    id: "dossier",
    title: "Envoyer le dossier",
    status: "active",
    item_type: "task",
    dimension: "missions",
    streak_current: 0,
    last_entry_at: null,
  }] as any;
  const recommendation = buildRecommendationFromToolSkillOpportunity({
    turnFrame,
    surfaceLabel: "Carte d'attaque",
    planItemSnapshot,
    requestId: "req-1",
  });
  const tempMemory = attachPendingRecommendationOperation({
    tempMemory: {},
    recommendation,
    surfaceLabel: "Carte d'attaque",
    planItemSnapshot,
    requestId: "req-1",
  });
  assertEquals(
    tempMemory.__pending_recommendation_operation.operation_input.target
      .plan_item_id,
    "dossier",
  );

  const result = await maybeRunPrepareAttackCardOperation({
    supabase: {} as any,
    userId: "u1",
    userMessage: "oui",
    channel: "whatsapp",
    userTimezone: "Europe/Paris",
    tempMemory,
    turnFrame: {
      ...turnFrame,
      confirmation_response: { kind: "yes", confidence_band: "high" },
    },
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "msg-2",
    requestId: "req-2",
    planSnapshot: { items: planItemSnapshot },
  });

  assertEquals(result?.toolSkillRun?.status, "pending_confirmation");
  assertEquals(result?.toolExecution, "blocked");
  assertEquals(
    (result?.nextTempMemory.__pending_tool_skill_confirmation as any)?.target
      ?.plan_item_id,
    "dossier",
  );
  assertEquals(
    (result?.nextTempMemory.__active_tool_skill_intake as any)?.missing_slots,
    undefined,
  );
  assertStringIncludes(
    result?.content ?? "",
    "Je te propose cette carte d'attaque avant de la creer.",
  );
});

Deno.test("tool skill opportunity recommendation requires high confidence and immediate timing", () => {
  const baseTurnFrame: any = {
    turn_id: "turn-medium-opportunity",
    source_message_id: "msg-1",
    user_id: "u1",
    channel: "whatsapp",
    safety: { risk_band: "none", reason_codes: [], evidence: [] },
    direct_effects: [],
    tool_skill_intents: [],
    tool_skill_opportunity: {
      type: "attack_card",
      operation_type: "prepare_attack_card",
      surface_id: "attack_card",
      confidence_band: "medium",
      should_offer: true,
      prop_reason: "medium signal should not interrupt the conversation",
      source_span: "démarrage un peu flou",
      target_hint: "Envoyer le dossier",
      target_status: "identified",
      suggested_question_intent: "offer_attack_card",
      offer_timing: "now",
      must_not_execute: true,
    },
    skill_signals: {},
    memory_plan: {
      context_need: "minimal",
      memory_mode: "light",
      context_budget_tier: "small",
      targets: [],
      retrieval_policy: "semantic_first",
    },
  };

  assertEquals(
    buildRecommendationFromToolSkillOpportunity({
      turnFrame: baseTurnFrame,
      surfaceLabel: "Carte d'attaque",
      requestId: "req-1",
    }),
    null,
  );

  assertEquals(
    buildRecommendationFromToolSkillOpportunity({
      turnFrame: {
        ...baseTurnFrame,
        tool_skill_opportunity: {
          ...baseTurnFrame.tool_skill_opportunity,
          confidence_band: "high",
          offer_timing: "after_current_pending",
        },
      },
      surfaceLabel: "Carte d'attaque",
      requestId: "req-1",
    }),
    null,
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
    safetyPregateOutput: { risk_band: "none" } as any,
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
      confirmation_response: { kind: "yes", confidence_band: "high" },
      tool_skill_intents: [{
        operation_type: "adjust_plan_item",
        user_intent: "explain_only",
        confidence_band: "high",
      }],
    } as any,
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "msg-adjust",
    requestId: "req-adjust",
    planItemSnapshot: [],
  });

  assertEquals(result?.toolExecution, "none");
  assertEquals(result?.executedTools, []);
  assertEquals(result?.toolSkillRun?.status, "draft_review_details");
  assertStringIncludes(result?.content ?? "", "Brouillon");
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
      confirmation_response: { kind: "yes", confidence_band: "high" },
      tool_skill_intents: [{
        operation_type: "adjust_plan_item",
        user_intent: "explain_only",
        confidence_band: "high",
      }],
    } as any,
    routeDecision: null,
    safetyPregateOutput: { risk_band: "none" } as any,
    sourceMessageId: "msg-whole-detail",
    requestId: "req-whole-detail",
    planItemSnapshot: [],
  });

  assertEquals(result?.toolExecution, "none");
  assertEquals(result?.executedTools, []);
  assertStringIncludes(result?.content ?? "", "ne supprime pas");
  assertStringIncludes(result?.content ?? "", "après le retour au calme");
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
    safetyPregateOutput: { risk_band: "none" } as any,
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

Deno.test("writePlanAdjustmentPatch: materializes level frequency changes into structured fields", async () => {
  const habit = basePlanItem({
    id: "habit-1",
    title: "Partager un point positif",
    dimension: "habits",
    kind: "habit",
    description: "une phrase simple, sans chercher à faire joli",
    cadence_label: "3 jours / semaine",
    target_reps: 3,
    time_of_day: "evening",
  });
  const task = basePlanItem({
    id: "task-1",
    title: "Convenir d'un signal de pause",
    dimension: "missions",
    kind: "task",
    description: "Ancienne discussion longue",
    cadence_label: null,
    target_reps: null,
    time_of_day: "anytime",
  });
  const { client, state } = createTrackingSupabaseMock({
    user_cycles: [],
    user_transformations: [],
    user_plans_v2: [],
    user_plan_items: [habit, task],
    user_plan_item_entries: [],
    user_metrics: [],
    system_runtime_snapshots: [],
  });
  await writePlanAdjustmentPatch({
    supabase: client as any,
    userId: "u1",
    operationInput: {
      scope: {
        kind: "current_level",
      },
    },
    operationId: "op-1",
    requestId: "req-1",
    sourceMessageId: "msg-1",
    draft: {
      operation_type: "adjust_plan_item",
      output_schema: "plan_adjustment_draft_v1",
      confirmation_actions: ["yes", "no"],
      confirmation_message: "Confirmer ?",
      execution_message: "C'est fait.",
      draft: {
        title: "Ajustement - niveau",
        scope_label: "Niveau courant",
        adjustment_type: "reduce_load" as any,
        execution_strategy: "level_adjustment",
        proposed_change: "Alléger le niveau",
        why_it_helps: "Moins de charge.",
        confidence: "medium",
        decision_basis: {
          user_problem: "Trop chargé.",
          inferred_need: "Alléger.",
          confidence: "medium",
          evidence: [],
          uncertainty: [],
          must_preserve: [],
        },
        change_rationale: {
          why_this_change: "Moins de charge.",
          expected_mechanism: "Moins de friction.",
          success_condition: "Action faisable.",
        },
        ack_summary: {
          changed: [],
          unchanged: [],
          why_it_helps: "Moins de charge.",
          confidence: "medium",
        },
        patch: {
          scope_kind: "current_level",
          level_adjustment: "reduce_load",
        },
        allowed_patch_fields: ["scope_kind", "level_adjustment"],
        adjust_plan_result: {
          scope: "level",
          applied_change: {
            summary: "Alléger deux actions.",
            changed_items: [
              {
                id: "habit-1",
                kind: "habit",
                capability: "change_action_frequency",
                title: "Partager un point positif",
                before: "3 jours / semaine",
                after:
                  "2 jours / semaine, une phrase neutre, quand ça se présente naturellement, sans créneau imposé",
                reason: "Réduire la charge.",
              },
              {
                id: "task-1",
                kind: "action",
                capability: "modify_existing_action",
                title: "Convenir d'un signal de pause",
                before: "Ancienne discussion longue",
                after:
                  "choisir un mot ou un geste simple en 5 minutes, moment libre sans créneau",
                reason: "Simplifier la mission.",
              },
            ],
            preserved_items: [],
          },
          boundaries: {
            affected_scope: "niveau actuel uniquement",
            explicitly_not_affected: ["objectif global"],
            global_plan_impact: "none",
            explanation: "Le reste ne change pas.",
          },
          rationale: {
            user_problem: "Trop chargé.",
            why_this_change: "Moins de charge.",
            expected_effect: "Plus faisable.",
            confidence: "medium",
            missing_info: [],
          },
          user_message_brief: "J'ai allégé le niveau.",
          user_message_detailed: "J'ai allégé le niveau.",
        },
      },
    },
  });

  const updatedHabit = state.user_plan_items.find((item) =>
    item.id === "habit-1"
  );
  assertEquals(updatedHabit.target_reps, 2);
  assertEquals(updatedHabit.cadence_label, "2 jours / semaine");
  assertEquals(updatedHabit.description, "une phrase neutre");
  assertEquals(updatedHabit.time_of_day, "anytime");

  const updatedTask = state.user_plan_items.find((item) =>
    item.id === "task-1"
  );
  assertEquals(
    updatedTask.description,
    "choisir un mot ou un geste simple en 5 minutes, moment libre sans créneau",
  );
  assertEquals(updatedTask.time_of_day, "anytime");
  assertEquals(state.system_runtime_snapshots.length, 1);
  assertEquals(
    state.system_runtime_snapshots[0].payload.materialized_plan_item_ids,
    ["habit-1", "task-1"],
  );
});

Deno.test("writePlanAdjustmentPatch: materializes broad pause with V2 item status", async () => {
  const habit = basePlanItem({
    id: "habit-1",
    title: "Partager un point positif",
    dimension: "habits",
    kind: "habit",
    cadence_label: "3 jours / semaine",
    target_reps: 3,
  });
  const task = basePlanItem({
    id: "task-1",
    title: "Faire le point sur le signal de pause",
    dimension: "missions",
    kind: "task",
    status: "pending",
    description: "Bilan initial.",
  });
  const { client, state } = createTrackingSupabaseMock({
    user_cycles: [],
    user_transformations: [],
    user_plans_v2: [],
    user_plan_items: [habit, task],
    user_plan_item_entries: [],
    user_metrics: [],
    system_runtime_snapshots: [],
  });
  const regenerationCalls: unknown[] = [];

  const result = await writePlanAdjustmentPatch({
    supabase: client as any,
    userId: "u1",
    operationInput: {
      scope: { kind: "whole_plan" },
    },
    operationId: "op-pause",
    requestId: "req-pause",
    sourceMessageId: "msg-pause",
    regenerateAdjustedPlan: async (input) => {
      regenerationCalls.push(input);
      return {
        plan_id: "adjusted-plan-1",
        roadmap_changed: true,
      };
    },
    draft: {
      operation_type: "adjust_plan_item",
      output_schema: "plan_adjustment_draft_v1",
      confirmation_actions: ["yes", "no"],
      confirmation_message: "Confirmer ?",
      execution_message: "C'est fait.",
      draft: {
        title: "Ajustement - plan",
        scope_label: "Plan global",
        adjustment_type: "reduce" as any,
        execution_strategy: "whole_plan_adjustment",
        proposed_change: "Alléger le plan",
        why_it_helps: "Moins de charge.",
        confidence: "medium",
        decision_basis: {
          user_problem: "Trop chargé.",
          inferred_need: "Alléger.",
          confidence: "medium",
          evidence: [],
          uncertainty: [],
          must_preserve: [],
        },
        change_rationale: {
          why_this_change: "Moins de charge.",
          expected_mechanism: "Moins de friction.",
          success_condition: "Plan faisable.",
        },
        ack_summary: {
          changed: [],
          unchanged: [],
          why_it_helps: "Moins de charge.",
          confidence: "medium",
        },
        patch: {
          scope_kind: "whole_plan",
          plan_adjustment: "reduce_global_load",
        },
        allowed_patch_fields: ["scope_kind", "plan_adjustment"],
        adjust_plan_result: {
          scope: "whole_plan",
          applied_change: {
            summary: "Alléger deux éléments.",
            changed_items: [
              {
                id: "habit-1",
                kind: "habit",
                capability: "change_action_frequency",
                title: "Partager un point positif",
                before: "3 jours / semaine",
                after: "2 jours / semaine sans horaire fixe",
                reason: "Réduire la charge.",
              },
              {
                id: "task-1",
                kind: "action",
                capability: "pause_action",
                title: "Faire le point sur le signal de pause",
                before: "Bilan initial.",
                after: "Décalé après deux semaines.",
                reason: "Alléger le plan immédiat.",
              },
            ],
            preserved_items: [],
          },
          boundaries: {
            affected_scope: "plan global",
            explicitly_not_affected: ["objectif global"],
            global_plan_impact: "indirect",
            explanation: "Le fond ne change pas.",
          },
          rationale: {
            user_problem: "Trop chargé.",
            why_this_change: "Moins de charge.",
            expected_effect: "Plus faisable.",
            confidence: "medium",
            missing_info: [],
          },
          user_message_brief: "J'ai allégé le plan.",
          user_message_detailed: "J'ai allégé le plan.",
        },
      },
    },
  });

  const updatedHabit = state.user_plan_items.find((item) =>
    item.id === "habit-1"
  );
  assertEquals(updatedHabit.target_reps, 2);
  assertEquals(updatedHabit.time_of_day, "anytime");

  const updatedTask = state.user_plan_items.find((item) =>
    item.id === "task-1"
  );
  assertEquals(updatedTask.status, "in_maintenance");
  assertEquals(regenerationCalls.length, 1);
  assertEquals((regenerationCalls[0] as any).transformationId, "transfo-1");
  assertEquals((regenerationCalls[0] as any).scopeKind, "whole_plan");
  assertEquals(result.adjusted_plan_id, "adjusted-plan-1");
  assertEquals(result.roadmap_changed, true);
  assertEquals(state.system_runtime_snapshots.length, 1);
  assertEquals(
    state.system_runtime_snapshots[0].payload.adjusted_plan_id,
    "adjusted-plan-1",
  );
});

Deno.test("writePlanAdjustmentPatch: materializes action frequency timing and instruction", async () => {
  const habit = basePlanItem({
    id: "habit-1",
    title: "Partager un point positif",
    dimension: "habits",
    kind: "habit",
    description: "une phrase simple, sans chercher à faire joli",
    cadence_label: "3 jours / semaine",
    target_reps: 3,
    time_of_day: "evening",
  });
  const { client, state } = createTrackingSupabaseMock({
    user_cycles: [],
    user_transformations: [],
    user_plans_v2: [],
    user_plan_items: [habit],
    user_plan_item_entries: [],
    user_metrics: [],
    system_runtime_snapshots: [],
  });

  await writePlanAdjustmentPatch({
    supabase: client as any,
    userId: "u1",
    operationInput: {
      scope: {
        kind: "specific_plan_item",
        plan_item_id: "habit-1",
      },
    },
    operationId: "op-action",
    requestId: "req-action",
    sourceMessageId: "msg-action",
    draft: {
      operation_type: "adjust_plan_item",
      output_schema: "plan_adjustment_draft_v1",
      confirmation_actions: ["yes", "no"],
      confirmation_message: "Confirmer ?",
      execution_message: "C'est fait.",
      draft: {
        title: "Ajustement - action",
        scope_label: "Partager un point positif",
        adjustment_type: "reduce" as any,
        execution_strategy: "patch_existing",
        proposed_change:
          "Passer l'action à 2 jours / semaine, phrase neutre, sans créneau fixe.",
        why_it_helps: "Moins de charge.",
        confidence: "medium",
        decision_basis: {
          user_problem: "Trop chargé.",
          inferred_need: "Alléger.",
          confidence: "medium",
          evidence: [],
          uncertainty: [],
          must_preserve: [],
        },
        change_rationale: {
          why_this_change: "Moins de charge.",
          expected_mechanism: "Moins de friction.",
          success_condition: "Action faisable.",
        },
        ack_summary: {
          changed: [],
          unchanged: [],
          why_it_helps: "Moins de charge.",
          confidence: "medium",
        },
        patch: {
          target_reps: 2,
          cadence_label: "2 jours / semaine",
        },
        allowed_patch_fields: ["target_reps", "cadence_label"],
        adjust_plan_result: {
          scope: "action",
          applied_change: {
            summary: "Alléger l'action.",
            changed_items: [{
              id: "habit-1",
              kind: "habit",
              capability: "change_action_frequency",
              title: "Partager un point positif",
              before: "3 jours / semaine, le soir",
              after: "2 jours / semaine, phrase neutre, sans créneau fixe",
              reason: "Réduire la charge.",
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
            user_problem: "Trop chargé.",
            why_this_change: "Moins de charge.",
            expected_effect: "Plus faisable.",
            confidence: "medium",
            missing_info: [],
          },
          user_message_brief: "Action allégée.",
          user_message_detailed: "Action allégée.",
        },
      },
    },
  });

  const updatedHabit = state.user_plan_items.find((item) =>
    item.id === "habit-1"
  );
  assertEquals(updatedHabit.target_reps, 2);
  assertEquals(updatedHabit.cadence_label, "2 jours / semaine");
  assertEquals(updatedHabit.description, "phrase neutre");
  assertEquals(updatedHabit.time_of_day, "anytime");
});
