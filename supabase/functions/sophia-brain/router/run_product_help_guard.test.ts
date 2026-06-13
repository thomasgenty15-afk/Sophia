import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  directConversationSkillReplyOverride,
  enforceRecommendationToolVisibleReply,
  recordToolSkillEffectsInLedgerForTest,
  shouldPreserveDirectStatusRecapRoute,
} from "./run.ts";
import { isActiveCardDraftingOperation } from "./active_operation_guards.ts";
import { createEffectLedger, hasCommittedEffect } from "./effect_ledger.ts";
import {
  directSafetyCrisisReplyOverride,
  runtimeSafetyContextForTurn,
  suppressToolSignalsForSafetyRoute,
  withActiveSafetyFlowCaution,
} from "./safety_crisis_runtime.ts";
import { persistConversationSkillRoute } from "./conversation_route_runtime_support.ts";
import {
  isConversationSkillExitToGlobal,
  localFlowExitParentStateForProductHelp,
  shouldRunRecommendationTool,
} from "./recommendation_runtime_support.ts";
import { upsertCoachPreferencesFromDraftForTest } from "../tools/operations/update_coach_preferences/status.ts";

Deno.test("effect ledger maps update_coach_preferences executor commit", () => {
  const ledger = createEffectLedger("turn-ledger-1");
  recordToolSkillEffectsInLedgerForTest({
    ledger,
    toolExecution: "success",
    toolSkillRun: {
      selected_handler: "update_coach_preferences",
      status: "executed",
      operation_id: "op-pref-1",
      committed_effects: [{
        type: "update_coach_preferences",
        operation_id: "op-pref-1",
        preference_keys: ["coach.tone"],
        preferences_update_ids: ["coach.tone"],
      }],
    },
  });

  assertEquals(
    hasCommittedEffect(
      ledger,
      (entry) => entry.effect_type === "coach_preferences.update",
    ),
    true,
  );
  assertEquals(ledger.entries[0]?.db_ref, {
    table: "user_profile_facts",
    key: "coach.tone",
  });
});

Deno.test("conversation skill reply override lets product_help own its factual answer", () => {
  const reply =
    "Le rappel ponctuel que je t'ai programmé se gère côté Initiatives, dans les rappels côté chat pour ce type-là.\n\nPour le modifier ou l'annuler, le plus fiable est de me le redire ici clairement.";
  const overridden = directConversationSkillReplyOverride({
    routeDecision: { response_owner: "product_help" } as any,
    skillOutput: {
      skill_id: "product_help",
      status: "complete",
      response_intent: "how_to",
      reply,
      diagnosis: { feature_id: "one_shot_reminder.chat" },
      recommendation_need: {
        needed: false,
        type: "none",
        urgency: "none",
        constraints: [
          "one_shot_reminder_already_programmed",
          "do_not_restart_reminder_slot_filling",
          "product_help_does_not_execute_operations",
        ],
      },
      operation_suggestions: [],
      memory_trace: {
        memory_used_for_response: false,
        memory_item_ids_used: [],
        correction_detected: false,
        correction_target_item_ids: [],
      },
    },
  });

  assertEquals(overridden, reply);
  assertEquals(
    /Tu veux le modifier|quelle date|quelle heure/i.test(overridden ?? ""),
    false,
  );
});

Deno.test("conversation skill exit to global is detected centrally", () => {
  assertEquals(
    isConversationSkillExitToGlobal({
      skill_id: "demotivation_repair",
      status: "exit",
      response_intent: "exit_to_global_dispatcher",
      reply: "",
      diagnosis: {
        flow_action: "exit_to_global_dispatcher",
        note_information: { target_dispatcher: "global" },
      },
      state_patch: {
        demotivation_repair_exit_memo: {
          reason: "cancelled",
        },
      },
      memory_trace: {
        memory_used_for_response: false,
        memory_item_ids_used: [],
        correction_detected: false,
        correction_target_item_ids: [],
      },
    }),
    true,
  );
});

Deno.test("conversation skill normal exit does not force global reroute", () => {
  assertEquals(
    isConversationSkillExitToGlobal({
      skill_id: "safety_crisis",
      status: "exit",
      response_intent: "complete",
      reply: "On s'arrete ici.",
      diagnosis: { flow_action: "complete_flow" },
      memory_trace: {
        memory_used_for_response: false,
        memory_item_ids_used: [],
        correction_detected: false,
        correction_target_item_ids: [],
      },
    }),
    false,
  );
});

Deno.test("conversation skill exit to global suppresses recommendation tools", () => {
  assertEquals(
    shouldRunRecommendationTool({
      skillOutput: {
        skill_id: "emotional_repair",
        status: "exit",
        response_intent: "exit_to_global_dispatcher",
        reply: "",
        recommendation_need: {
          needed: true,
          type: "state_regulation",
          urgency: "medium",
          constraints: [],
        },
        state_patch: {
          emotional_repair_exit_memo: {
            reason: "cancelled",
          },
        },
        memory_trace: {
          memory_used_for_response: false,
          memory_item_ids_used: [],
          correction_detected: false,
          correction_target_item_ids: [],
        },
      },
      userMessage: "stop ici",
      turnFrame: {
        skill_signals: { entry: { product_help: { detected: true } } },
      } as any,
    }),
    false,
  );
});

Deno.test("safety reply override lets safety_crisis own the visible answer", () => {
  const reply = "Je reste sur la securite immediate.";
  const overridden = directSafetyCrisisReplyOverride({
    routeDecision: { response_owner: "safety" } as any,
    skillOutput: {
      skill_id: "safety_crisis",
      status: "continue",
      response_intent: "ground_safety",
      reply,
      recommendation_need: {
        needed: false,
        type: "none",
        urgency: "none",
        constraints: ["no_product_push_during_safety"],
      },
      operation_suggestions: [],
      memory_trace: {
        memory_used_for_response: false,
        memory_item_ids_used: [],
        correction_detected: false,
        correction_target_item_ids: [],
      },
    },
  });

  assertEquals(overridden, reply);
});

Deno.test("safety route suppresses tool signals but preserves one-shot reminder direct effect", () => {
  const result = suppressToolSignalsForSafetyRoute({
    routeDecision: {
      route_version: "v1",
      response_owner: "safety",
      selected_handler: "safety_crisis",
      blocked_paths: [],
      direct_effects_to_run: ["create_one_shot_reminder"],
      reason_code: "safety_override",
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
    } as any,
    turnFrame: {
      tool_skill_intents: [{ operation_type: "select_state_potion" }],
      direct_effects: [{
        effect_type: "create_one_shot_reminder",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: {},
      }],
      flow_opportunity: {
        opportunity_id: "select_state_potion.safety_suppressed",
        target_kind: "tool_skill",
        target_flow: "select_state_potion",
        target_action: "run_select_state_potion",
        confidence: "high",
        priority: 80,
        reason: "state potion opportunity",
        evidence: ["test"],
        seed_context: {},
      },
    } as any,
  });

  assertEquals(result.changed, true);
  assertEquals(result.routeDecision.direct_effects_to_run, [
    "create_one_shot_reminder",
  ]);
  assertEquals(result.turnFrame?.tool_skill_intents, []);
  assertEquals(result.turnFrame?.direct_effects, [{
    effect_type: "create_one_shot_reminder",
    explicitness: "explicit",
    target_status: "identified",
    confidence_band: "high",
    payload_hint: {},
  }]);
  assertEquals(result.turnFrame?.flow_opportunity, null);
  assertEquals(
    result.routeDecision.blocked_paths.some((path) =>
      path.reason_code === "safety_route_suppresses_tool_signals"
    ),
    true,
  );
});

Deno.test("product_help gets parent context after local flow exit second pass", () => {
  const note = {
    source_flow_id: "emotional_repair",
    source_flow_presentation: "Emotional repair was active.",
    source_flow_state_summary:
      "User changed topic after a short emotional repair phrase.",
    handoff_reason: "topic_change",
    target_dispatcher: "global",
    handoff_context_for_next_dispatcher: "{}",
    target_local_dispatcher_hint: null,
    user_words: [],
    structured_context: {},
    risk_score: 0,
    no_chat_mutation: {
      db_write_committed: false,
      potion_session_created: false,
      scheduled_checkin_created: false,
      recurring_reminder_created: false,
      executable_confirmation_generated: false,
    },
  };
  const parent = localFlowExitParentStateForProductHelp({
    routeDecision: {
      response_owner: "product_help",
      selected_handler: "product_help",
      local_flow_exit_handoff: {
        source_flow_id: "emotional_repair",
        note_information: note,
      },
    } as any,
    turnFrame: null,
  });

  assertEquals(parent?.skill_id, "emotional_repair");
  assertEquals(parent?.status, "exited_to_global");
  assertEquals(
    (parent?.working_state as any)?.note_information?.source_flow_id,
    "emotional_repair",
  );
});

Deno.test("product_help does not synthesize parent context for normal global entry", () => {
  const parent = localFlowExitParentStateForProductHelp({
    routeDecision: {
      response_owner: "product_help",
      selected_handler: "product_help",
      local_flow_exit_handoff: {
        source_flow_id: "global_dispatcher",
      },
    } as any,
    turnFrame: null,
  });

  assertEquals(parent, null);
});

Deno.test("active safety flow caution keeps at least medium risk", () => {
  const output = withActiveSafetyFlowCaution({
    detected: false,
    risk_band: "none",
    reason_codes: [],
    evidence: [],
    layer_contributions: {},
    allow_side_effects: true,
  } as any, {
    __active_skill_state: {
      skill_id: "safety_crisis",
      status: "active",
      working_state: { phase: "support_contact" },
    },
  });

  assertEquals(output.risk_band, "medium");
  assertEquals(output.detected, true);
  assertEquals(output.allow_side_effects, false);
  assertEquals(
    output.reason_codes.includes("active_safety_flow_caution"),
    true,
  );
});

Deno.test("active safety flow cannot be downgraded by safe reminder exception", () => {
  const result = runtimeSafetyContextForTurn({
    safetyContextOutput: {
      detected: true,
      risk_band: "medium",
      reason_codes: ["active_safety_flow_caution"],
      evidence: [],
      layer_contributions: { heuristic: true },
      allow_side_effects: false,
    } as any,
    routeDecision: {
      response_owner: "tool_skill",
      selected_handler: "create_one_shot_reminder",
      reason_code: "test",
      direct_effects_to_run: ["create_one_shot_reminder"],
      blocked_paths: [],
    } as any,
    turnFrame: {
      safety: { risk_band: "low" },
    } as any,
    tempMemory: {
      __active_skill_state: {
        skill_id: "safety_crisis",
        status: "active",
        working_state: { phase: "support_contact" },
      },
    },
    userMessage: "rappelle-moi de finir le dossier demain",
  });

  assertEquals(result.riskBand, "medium");
  assertEquals(result.safetyContextOutput.risk_band, "medium");
});

Deno.test("state potion opportunity does not append mechanical product copy", () => {
  const response = enforceRecommendationToolVisibleReply({
    responseContent:
      "On fait simple: une pile temporaire, puis un seul message.",
    userMessage:
      "Je suis éparpillé ce matin, je veux juste retrouver un point d'appui.",
    surfaceLabel: "Potion d'etat",
    recommendation: {
      decision: "recommend_operation",
      recommendation_id: "dispatcher_opportunity:state_potion",
      operation_type: "select_state_potion",
      user_facing_offer: "se poser avant de continuer",
    } as any,
  });
  assertEquals(response.includes("Concrètement, je parle"), false);
  assertEquals(response.includes("Potion"), false);
});

Deno.test("emotional_repair visible reply is owned by the skill", () => {
  const reply = directConversationSkillReplyOverride({
    routeDecision: {
      route_version: "v1",
      response_owner: "conversation_handler",
      selected_handler: "emotional_repair",
      blocked_paths: [],
      direct_effects_to_run: [],
      reason_code: "emotion_dominates",
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
    } as any,
    skillOutput: {
      skill_id: "emotional_repair",
      status: "continue",
      response_intent: "de_shame",
      reply: "Je garde le fait concret, pas le verdict contre toi.",
      memory_trace: {
        memory_used_for_response: false,
        memory_item_ids_used: [],
        correction_detected: false,
        correction_target_item_ids: [],
      },
    },
  });
  assertEquals(reply, "Je garde le fait concret, pas le verdict contre toi.");
});

Deno.test("product_help route cannot clear active emotional_repair without local arbitration", () => {
  const next = persistConversationSkillRoute(
    {
      __active_skill_state: {
        skill_id: "emotional_repair",
        status: "active",
        working_state: {
          emotional_repair_local_state: {
            stage: "repair",
          },
        },
      },
    },
    {
      route_version: "v1",
      response_owner: "product_help",
      selected_handler: "product_help",
      blocked_paths: [],
      direct_effects_to_run: [],
      reason_code: "global_product_help_selected",
      memory_used_for_route: false,
      memory_item_ids_used_for_route: [],
      memory_use_kind: "none",
    } as any,
    {
      skill_id: "product_help",
      status: "complete",
      response_intent: "how_to",
      reply: "Voici ou trouver les rappels.",
    } as any,
  );

  assertEquals(next.__active_skill_state?.skill_id, "emotional_repair");
  assertEquals(next.__active_skill_state?.status, "active");
});

Deno.test("coach preference DB upsert accepts multi-key patches", async () => {
  const rowsSeen: any[] = [];
  const fakeSupabase = {
    from(table: string) {
      assertEquals(table, "user_profile_facts");
      return {
        upsert(rows: any[], options: any) {
          rowsSeen.push(...rows);
          assertEquals(options.onConflict, "user_id,scope,key");
          return {
            select(columns: string) {
              assertEquals(columns, "key");
              return Promise.resolve({
                data: rows.map((row) => ({ key: row.key })),
                error: null,
              });
            },
          };
        },
      };
    },
  };
  const result = await upsertCoachPreferencesFromDraftForTest({
    supabase: fakeSupabase as any,
    userId: "u1",
    sourceMessageId: "m1",
    draft: {
      operation_type: "update_coach_preferences",
      output_schema: "coach_preferences_patch_draft_v1",
      draft: {
        patch: {
          "coach.tone": "direct",
          "coach.challenge_level": "balanced",
          "coach.question_tendency": "low",
        },
        summary: "ton direct, challenge équilibré, moins de questions.",
      },
      confirmation_message: "Confirmer ?",
      confirmation_actions: ["yes", "no"],
    },
  });
  assertEquals(result.error, null);
  assertEquals(result.data?.keys, [
    "coach.tone",
    "coach.challenge_level",
    "coach.question_tendency",
  ]);
  assertEquals(
    rowsSeen.map((row) => row.value.value),
    ["direct", "balanced", "low"],
  );
});

// ---------------------------------------------------------------------------
// CHANTIER C1 (2026-05-28) — Subordination du status (L4).
// Le bloc `status_recap_request_blocks_tool_start` est gardé par:
//   1. routeDecision.response_owner !== "product_help" (status cède à
//      product_help) — A2-r7 T4, A4-r6 T14, A3-r8 T3.
//   2. !isActiveCardDraftingOperation(activeOperationIntake) (status
//      ne tue pas un flow de carte) — A3-r8 T6/T8.
// Scope limité aux cartes pour ne pas régresser A4-r6 T11 (coach actif).
// ---------------------------------------------------------------------------

Deno.test("C1: isActiveCardDraftingOperation is true for attack/defense card flows", () => {
  assertEquals(
    isActiveCardDraftingOperation({
      operation_type: "prepare_attack_card",
    }),
    true,
  );
  assertEquals(
    isActiveCardDraftingOperation({
      operation_type: "prepare_defense_card",
    }),
    true,
  );
});

Deno.test("C1 anti-régression: isActiveCardDraftingOperation is false for coach/other/none (protège A4-r6 T11)", () => {
  // A4-r6 T11: un intake update_coach_preferences est actif, mais une vraie
  // question de statut doit toujours passer. Le garde C1 ne doit PAS le
  // considérer comme un flow de carte.
  assertEquals(
    isActiveCardDraftingOperation({
      operation_type: "update_coach_preferences",
    }),
    false,
  );
  assertEquals(
    isActiveCardDraftingOperation({
      operation_type: "adjust_plan_item",
    }),
    false,
  );
  assertEquals(isActiveCardDraftingOperation(null), false);
  assertEquals(isActiveCardDraftingOperation(undefined), false);
  assertEquals(isActiveCardDraftingOperation({}), false);
});

Deno.test("status_recap explicit read-only status route is preserved for direct local runtime", () => {
  const routeDecision = {
    route_version: "v1",
    response_owner: "tool_skill",
    selected_handler: "status_recap",
    blocked_paths: [],
    direct_effects_to_run: [],
    reason_code: "status_recap",
    memory_used_for_route: false,
    memory_item_ids_used_for_route: [],
    memory_use_kind: "none",
  } as any;
  const turnFrame = {
    skill_signals: {
      entry: {
        status_recap: {
          detected: true,
          confidence_band: "high",
          reason: "user_requests_factual_status_without_mutation",
        },
      },
      lifecycle: {},
      exit: {},
    },
    tool_skill_intents: [],
    direct_effects: [],
  } as any;

  assertEquals(
    shouldPreserveDirectStatusRecapRoute({ routeDecision, turnFrame }),
    true,
  );
});

Deno.test("status_recap direct route is not preserved over explicit mutable tool intent", () => {
  const routeDecision = {
    route_version: "v1",
    response_owner: "tool_skill",
    selected_handler: "status_recap",
    blocked_paths: [],
    direct_effects_to_run: [],
    reason_code: "status_recap",
    memory_used_for_route: false,
    memory_item_ids_used_for_route: [],
    memory_use_kind: "none",
  } as any;
  const turnFrame = {
    skill_signals: {
      entry: {
        status_recap: {
          detected: true,
          confidence_band: "high",
          reason: "status signal coexists with explicit tool command",
        },
      },
      lifecycle: {},
      exit: {},
    },
    tool_skill_intents: [{
      operation_type: "create_recurring_reminder",
      user_intent: "create",
      confidence_band: "high",
      explicitness: "explicit",
    }],
    direct_effects: [],
  } as any;

  assertEquals(
    shouldPreserveDirectStatusRecapRoute({ routeDecision, turnFrame }),
    false,
  );
});

// ===========================================================================
// CHANTIER D2 (2026-05-28) — Le renderer obéit à explicit_no_status. Le
// composer status_only ne doit pas prendre la main quand l'utilisateur a opté
// hors statut. Voir A2-codex-r8 T7.
// ===========================================================================

// ===========================================================================
// CHANTIER G0 (2026-05-29) — status/recap ne préempte jamais une commande
// d'opération explicite. Voir edgecases-r3 T5 (rappel "14h20 ou 16h10") et
// syncskills-r2 T2 (carte d'attaque). Symétrique de F2 côté opérations.
// ===========================================================================
