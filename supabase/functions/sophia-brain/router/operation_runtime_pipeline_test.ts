import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { RouteDecision } from "../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";
import {
  mergeDirectEffectRuntimeIntoVisibleRuntime,
  runDirectEffectLane,
  runOperationRuntimePipeline,
  turnFrameWithDirectEffectRuntime,
} from "./operation_runtime_pipeline.ts";

function fakeOneShotSupabase(opts: { onUpsert?: (row: any) => void } = {}) {
  return {
    from(table: string) {
      if (table === "profiles") {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({
                    data: { timezone: "Europe/Paris", locale: "fr-FR" },
                    error: null,
                  }),
                };
              },
            };
          },
        };
      }
      if (table === "scheduled_checkins") {
        const selectQuery = {
          eq() {
            return selectQuery;
          },
          like() {
            return selectQuery;
          },
          order() {
            return selectQuery;
          },
          limit() {
            return selectQuery;
          },
          maybeSingle: async () => ({ data: null, error: null }),
          then(resolve: any, reject: any) {
            return Promise.resolve({ data: [], error: null }).then(
              resolve,
              reject,
            );
          },
        };
        return {
          select() {
            return selectQuery;
          },
          upsert(row: any) {
            opts.onUpsert?.(row);
            return {
              select() {
                return {
                  single: async () => ({
                    data: {
                      id: "checkin-1",
                      scheduled_for: row.scheduled_for,
                      event_context: row.event_context,
                    },
                    error: null,
                  }),
                };
              },
            };
          },
        };
      }
      throw new Error(`unexpected_table:${table}`);
    },
  } as any;
}

function baseRouteDecision(
  overrides: Partial<RouteDecision> = {},
): RouteDecision {
  return {
    route_version: "v1",
    response_owner: "normal_reply",
    reason_code: "test",
    direct_effects_to_run: [],
    blocked_paths: [],
    memory_used_for_route: false,
    memory_item_ids_used_for_route: [],
    memory_use_kind: "none",
    ...overrides,
  };
}

function baseTurnFrame(overrides: Partial<TurnFrame> = {}): TurnFrame {
  return {
    turn_id: "turn_op_1",
    source_message_id: "msg_1",
    user_id: "user_1",
    channel: "web",
    safety: { risk_band: "none", reason_codes: [], evidence: [] },
    direct_effects: [],
    skill_signals: {},
    needs_research: { detected: false, value: false },
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
    ...overrides,
  };
}

function basePipelineInput(overrides: Record<string, unknown> = {}) {
  return {
    supabase: {} as any,
    userId: "user_1",
    responseLocale: "en-US",
    userMessage: "test",
    channel: "web" as const,
    userTimezone: "Europe/Paris",
    history: [],
    tempMemory: {},
    state: {},
    planItemSnapshot: [],
    turnFrame: baseTurnFrame(),
    routeDecision: baseRouteDecision(),
    safetyContextOutput: { risk_band: "low" },
    sourceMessageId: "msg_1",
    requestId: "turn_op_1",
    v2Runtime: null,
    ...overrides,
  };
}

Deno.test("operation_runtime_pipeline safety route blocks direct runtime", async () => {
  const result = await runOperationRuntimePipeline(basePipelineInput({
    turnFrame: baseTurnFrame({
      safety: { risk_band: "high", reason_codes: [], evidence: [] },
      direct_effects: [{
        effect_type: "track_progress_plan_item",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: {},
      }],
    }),
    routeDecision: baseRouteDecision({
      response_owner: "safety",
      selected_handler: "safety_crisis",
      direct_effects_to_run: ["track_progress_plan_item"],
    }),
    safetyContextOutput: { risk_band: "high" },
  }));

  assertEquals(result.operationRuntime, null);
});

// P5-A (paul-p4verify T12) — recalibrage volontaire : l'ancien test « safety
// route allows one-shot reminder » codifiait le carve-out V5-1 à band HIGH.
// Doctrine P3-A/P5-A : V5-1 ne vaut que pour la détresse medium NON-crise ;
// à high/critical le rappel explicite est DIFFÉRÉ honnêtement (zéro write,
// payload persisté dans __safety_deferred_reminder pour re-serve post-crise).
Deno.test("operation_runtime_pipeline safety high defers one-shot reminder (P5-A)", async () => {
  const message = "Rappelle-moi dans 40 minutes de respirer et d'appeler Sam.";
  let upserts = 0;
  const tempMemory: Record<string, unknown> = {};
  const result = await runOperationRuntimePipeline(basePipelineInput({
    supabase: fakeOneShotSupabase({ onUpsert: () => upserts++ }),
    userMessage: message,
    tempMemory,
    turnFrame: baseTurnFrame({
      safety: { risk_band: "high", reason_codes: [], evidence: [] },
      direct_effects: [{
        effect_type: "create_one_shot_reminder",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: {
          raw_text: message,
          when_hint: "dans 40 minutes",
          UTC_time: "2026-06-13T08:40:00.000Z",
          local_label: "dans 40 minutes",
          instruction_hint: "respirer et appeler Sam",
        },
      }],
    }),
    routeDecision: baseRouteDecision({
      response_owner: "safety",
      selected_handler: "safety_crisis",
      direct_effects_to_run: ["create_one_shot_reminder"],
    }),
    safetyContextOutput: { risk_band: "high" },
    clientNow: new Date("2026-06-13T08:00:00.000Z"),
  }));

  assertEquals(upserts, 0);
  assertEquals(result.operationRuntime?.executedTools ?? [], []);
  const run = result.operationRuntime?.toolSkillRun as any;
  assertEquals(String(run?.reason ?? ""), "safety_crisis_deferred");
  const deferred = (result.tempMemory as any)?.__safety_deferred_reminder;
  assertEquals(deferred?.mode, "deferred");
  assertEquals(
    deferred?.known_slots?.instruction_hint,
    "respirer et appeler Sam",
  );
});

// P5-A — le shape exact de paul-p4verify T12 : flow local actif, dispatcher
// global sauté, la lane tourne avec une route SYNTHÉTIQUE sans blocage crise
// (direct_effects_to_run porte le create). Le verrou turn-level (codes
// d'idéation du pregate/frame) doit différer sans écrire — plus jamais de
// blocked+committed en parallèle au ledger.
Deno.test("direct_effect_lane defers on ideation codes even without crisis-blocked route (P5-A, paul T12)", async () => {
  const message =
    "des fois je me dis que tout le monde serait mieux sans moi. mets-moi quand même un rappel demain d'acheter des pâtes";
  let upserts = 0;
  const tempMemory: Record<string, unknown> = {};
  const result = await runDirectEffectLane({
    ...basePipelineInput({
      supabase: fakeOneShotSupabase({ onUpsert: () => upserts++ }),
      userMessage: message,
      tempMemory,
      turnFrame: baseTurnFrame({
        safety: {
          risk_band: "medium",
          reason_codes: ["suicidal_ideation_passive"],
          evidence: ["tout le monde serait mieux sans moi"],
        },
        direct_effects: [{
          effect_type: "create_one_shot_reminder",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "high",
          payload_hint: {
            raw_text: message,
            when_hint: "demain",
            UTC_time: "2026-06-14T08:00:00.000Z",
            local_label: "demain matin",
            instruction_hint: "acheter des pâtes",
          },
        }],
      }),
      // Route synthétique de flow local actif : AUCUN blocked_path crise.
      routeDecision: baseRouteDecision({
        response_owner: "coaching_recommendation",
        reason_code: "active_coaching_recommendation_with_local_direct_effects",
        direct_effects_to_run: ["create_one_shot_reminder"],
      }),
      safetyContextOutput: { risk_band: "medium", reason_codes: [] },
      clientNow: new Date("2026-06-13T20:00:00.000Z"),
    }),
  } as any);

  assertEquals(upserts, 0);
  const run = result.operationRuntime?.toolSkillRun as any;
  assertEquals(String(run?.reason ?? ""), "safety_crisis_deferred");
  const deferred = (result.tempMemory as any)?.__safety_deferred_reminder;
  assertEquals(deferred?.mode, "deferred");
  assertEquals(deferred?.known_slots?.instruction_hint, "acheter des pâtes");
});

// P5-A anti-faux-positif — V5-1 préservé : détresse medium NON-crise
// (worthlessness, route distress_support), le rappel bénin explicite est
// SERVI (rose-hard15 T10 / hard17 T4 verts à protéger).
Deno.test("direct_effect_lane still commits reminder on medium non-crisis distress (V5-1 preserved)", async () => {
  const message = "je me sens nulle ce soir... rappelle-moi demain de boire de l'eau";
  let upserts = 0;
  const result = await runDirectEffectLane({
    ...basePipelineInput({
      supabase: fakeOneShotSupabase({ onUpsert: () => upserts++ }),
      userMessage: message,
      turnFrame: baseTurnFrame({
        safety: {
          risk_band: "medium",
          reason_codes: ["worthlessness_thoughts"],
          evidence: ["je me sens nulle"],
        },
        direct_effects: [{
          effect_type: "create_one_shot_reminder",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "high",
          payload_hint: {
            raw_text: message,
            when_hint: "demain",
            UTC_time: "2026-06-14T08:00:00.000Z",
            local_label: "demain matin",
            instruction_hint: "boire de l'eau",
          },
        }],
      }),
      routeDecision: baseRouteDecision({
        response_owner: "normal_reply",
        reason_code: "distress_support_priority",
        direct_effects_to_run: ["create_one_shot_reminder"],
      }),
      safetyContextOutput: { risk_band: "medium", reason_codes: [] },
      clientNow: new Date("2026-06-13T20:00:00.000Z"),
    }),
  } as any);

  assertEquals(upserts, 1);
  assertEquals(result.operationRuntime?.executedTools, [
    "create_one_shot_reminder",
  ]);
});

Deno.test("operation_runtime_pipeline product_help route allows one-shot reminder direct effect", async () => {
  const message =
    "Est-ce que je peux modifier une carte d'attaque, et rappelle-moi dans 40 minutes de relire la doc.";
  const result = await runOperationRuntimePipeline(basePipelineInput({
    supabase: fakeOneShotSupabase(),
    userMessage: message,
    turnFrame: baseTurnFrame({
      direct_effects: [{
        effect_type: "create_one_shot_reminder",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: {
          raw_text: "rappelle-moi dans 40 minutes de relire la doc",
          when_hint: "dans 40 minutes",
          UTC_time: "2026-06-13T08:40:00.000Z",
          local_label: "dans 40 minutes",
          instruction_hint: "relire la doc",
        },
      }],
      skill_signals: {
        product_help: {
          detected: true,
          confidence_band: "high",
          intent: "can_i_do_x",
          evidence: ["modifier une carte d'attaque"],
        } as any,
      },
    }),
    routeDecision: baseRouteDecision({
      response_owner: "product_help",
      selected_handler: "product_help",
      direct_effects_to_run: ["create_one_shot_reminder"],
    }),
    clientNow: new Date("2026-06-13T08:00:00.000Z"),
  }));

  assertEquals(result.operationRuntime?.toolExecution, "success");
  assertEquals(result.operationRuntime?.executedTools, [
    "create_one_shot_reminder",
  ]);
});


Deno.test("operation_runtime_pipeline executes one-shot reminder exactly once per turn outside weekly", async () => {
  // Auto-collision Alex r3 T5 / Nina r1 T7: la lane weekly tournait aussi hors
  // bilan hebdo (des que la route demandait l'effet), puis la lane principale
  // re-executait le meme create dans le meme tour. Hors weekly, une seule
  // execution est permise.
  const upserts: any[] = [];
  const message = "Rappelle-moi demain a 18h de relire la doc.";
  const result = await runOperationRuntimePipeline(basePipelineInput({
    supabase: fakeOneShotSupabase({ onUpsert: (row) => upserts.push(row) }),
    userMessage: message,
    turnFrame: baseTurnFrame({
      direct_effects: [{
        effect_type: "create_one_shot_reminder",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: {
          raw_text: message,
          when_hint: "demain a 18h",
          UTC_time: "2026-06-14T16:00:00.000Z",
          local_label: "demain a 18:00",
          instruction_hint: "relire la doc",
        },
      }],
    }),
    routeDecision: baseRouteDecision({
      direct_effects_to_run: ["create_one_shot_reminder"],
      reason_code: "direct_effects_then_normal_reply",
    }),
    clientNow: new Date("2026-06-13T08:00:00.000Z"),
  }));

  assertEquals(result.operationRuntime?.toolExecution, "success");
  assertEquals(upserts.length, 1);
});

Deno.test("operation_runtime_pipeline active local flow does not parse raw message intake", async () => {
  const message =
    "Est-ce que je peux modifier une carte d'attaque, et rappelle-moi dans 40 minutes de relire la doc.";
  const result = await runOperationRuntimePipeline(basePipelineInput({
    supabase: fakeOneShotSupabase(),
    userMessage: message,
    turnFrame: baseTurnFrame(),
    routeDecision: baseRouteDecision({
      response_owner: "product_help",
      selected_handler: "product_help",
      direct_effects_to_run: [],
      reason_code: "active_product_help",
    }),
    allowDirectEffectMessageIntakeFallback: true,
    clientNow: new Date("2026-06-13T08:00:00.000Z"),
  }));

  assertEquals(result.operationRuntime, null);
  assertEquals(result.routeDecision?.direct_effects_to_run, []);
  assertEquals(result.turnFrame?.direct_effects, []);
});

Deno.test("direct_effect_lane does not execute one-shot reminder from message intake", async () => {
  const message = "Rappelle-moi dans 40 minutes de relire mes notes.";
  const result = await runDirectEffectLane({
    ...basePipelineInput({
      supabase: fakeOneShotSupabase(),
      userMessage: message,
      routeDecision: baseRouteDecision(),
      turnFrame: baseTurnFrame(),
      clientNow: new Date("2026-06-13T08:00:00.000Z"),
    }),
    allowMessageIntakeFallback: true,
  });

  assertEquals(result.operationRuntime, null);
  assertEquals(result.routeDecision?.direct_effects_to_run, []);
});

Deno.test("direct effect runtime merges ledger into visible runtime without deterministic text prefix", () => {
  const directRuntime = {
    content: "C'est programmé.",
    nextTempMemory: {},
    toolExecution: "success" as const,
    executedTools: ["create_one_shot_reminder"],
    toolSkillRun: {
      selected_handler: "create_one_shot_reminder",
      committed_effects: [{
        type: "create_one_shot_reminder",
        id: "checkin-1",
      }],
    },
  };
  const visibleRuntime = {
    content: "On continue.",
    nextTempMemory: {},
    toolExecution: "none" as const,
    executedTools: [],
    toolSkillRun: { selected_handler: "normal_reply" },
  };

  const merged = mergeDirectEffectRuntimeIntoVisibleRuntime({
    directRuntime,
    visibleRuntime,
  });
  const turnFrame = turnFrameWithDirectEffectRuntime(
    baseTurnFrame(),
    directRuntime,
  ) as any;

  assertEquals(merged?.content, "On continue.");
  assertEquals(merged?.toolExecution, "success");
  assertEquals(merged?.executedTools, ["create_one_shot_reminder"]);
  assertEquals(
    (merged?.toolSkillRun as any).direct_effect_lane.committed_effects[0].id,
    "checkin-1",
  );
  assertEquals(
    turnFrame.direct_effect_lane.committed_effects[0].id,
    "checkin-1",
  );
});

Deno.test("dedupe committed → statut terminal superseded_by_dedup, comptabilité soldée (P2-6, eva-global17 R1-B03)", () => {
  const merged = mergeDirectEffectRuntimeIntoVisibleRuntime({
    directRuntime: {
      content: "",
      nextTempMemory: {},
      toolExecution: "success",
      executedTools: ["create_one_shot_reminder"],
      toolSkillRun: {
        requested_effects: [{ type: "create_one_shot_reminder" }],
        allowed_effects: [{ type: "create_one_shot_reminder" }],
        committed_effects: [{
          type: "create_one_shot_reminder",
          id: "chk-1",
          local_label: "21h15",
        }],
        blocked_effects: [],
      },
    },
    visibleRuntime: {
      content: "ok",
      nextTempMemory: {},
      toolExecution: "success",
      executedTools: ["create_one_shot_reminder"],
      toolSkillRun: {
        requested_effects: [{ type: "create_one_shot_reminder" }],
        allowed_effects: [{ type: "create_one_shot_reminder" }],
        committed_effects: [{
          type: "create_one_shot_reminder",
          id: "chk-1",
          local_label: "21h15",
        }],
        blocked_effects: [],
      },
    },
  });
  const run = merged?.toolSkillRun as Record<string, unknown>;
  const committed = run.committed_effects as unknown[];
  const superseded = run.superseded_effects as Array<Record<string, unknown>>;
  // UNE écriture réelle, et le doublon reçoit un statut terminal explicite —
  // requested(2) = committed(1) + superseded(1).
  assertEquals(committed.length, 1);
  assertEquals(superseded.length, 1);
  assertEquals(superseded[0].reason_code, "superseded_by_dedup");
});

// ── P8-E (paul-untested22 R1 T15): re-serve du différé sur go EXPLICITE ──────

Deno.test("direct_effect_lane commits the deferred reminder on explicit re-serve during safety flow tail (P8-E, paul-untested22 T15)", async () => {
  let upserts = 0;
  const tempMemory: Record<string, unknown> = {
    __active_skill_state: {
      skill_id: "safety_crisis",
      status: "active",
      updated_at: new Date("2026-06-13T19:58:00.000Z").toISOString(),
      working_state: { phase: "stabilizing" },
    },
    __safety_deferred_reminder: {
      mode: "deferred",
      exposed_to_dispatcher: true,
      known_slots: {
        raw_text: "rappelle-moi demain d'appeler ma soeur",
        when_hint: "demain matin",
        UTC_time: "2026-06-14T08:00:00.000Z",
        local_label: "demain matin",
        instruction_hint: "appeler ma soeur",
      },
    },
  };
  const result = await runDirectEffectLane({
    ...basePipelineInput({
      supabase: fakeOneShotSupabase({ onUpsert: () => upserts++ }),
      userMessage: "ça va mieux là, merci. du coup remets-le maintenant stp",
      tempMemory,
      // Sous flow safety actif, le dispatcher global est sauté: AUCUN effet
      // au frame — c'était le premier trou (la lane ne tournait même pas).
      turnFrame: baseTurnFrame({
        safety: { risk_band: "none", reason_codes: [], evidence: [] },
        direct_effects: [],
      }),
      routeDecision: baseRouteDecision({
        response_owner: "safety",
        reason_code: "active_safety_conversation_skill",
        direct_effects_to_run: [],
      }),
      safetyContextOutput: { risk_band: "none", reason_codes: [] },
      clientNow: new Date("2026-06-13T20:00:00.000Z"),
    }),
  } as any);

  // Le différé se solde AU MÊME TOUR: commit réel + promesse tenue.
  assertEquals(upserts, 1);
  const run = result.operationRuntime?.toolSkillRun as any;
  assertEquals(
    (run?.committed_effects ?? []).some((e: any) =>
      e?.type === "create_one_shot_reminder"
    ),
    true,
  );
  // Idempotence: le différé est nettoyé après commit.
  assertEquals(
    (result.tempMemory as any)?.__safety_deferred_reminder,
    undefined,
  );
});

Deno.test("le carve-out re-serve ne lève JAMAIS le verrou sur bande medium+ ou sans go explicite (P8-E anti-faux-positif)", async () => {
  const deferredState = () => ({
    __active_skill_state: {
      skill_id: "safety_crisis",
      status: "active",
      updated_at: new Date("2026-06-13T19:58:00.000Z").toISOString(),
      working_state: { phase: "immediate_risk_check" },
    },
    __safety_deferred_reminder: {
      mode: "deferred",
      exposed_to_dispatcher: false,
      known_slots: {
        raw_text: "rappelle-moi demain d'appeler ma soeur",
        when_hint: "demain matin",
        UTC_time: "2026-06-14T08:00:00.000Z",
        local_label: "demain matin",
        instruction_hint: "appeler ma soeur",
      },
    },
  });
  // Bande HIGH: même un go explicite reste différé.
  let upserts = 0;
  const high = await runDirectEffectLane({
    ...basePipelineInput({
      supabase: fakeOneShotSupabase({ onUpsert: () => upserts++ }),
      userMessage: "remets-le maintenant",
      tempMemory: deferredState(),
      turnFrame: baseTurnFrame({
        safety: {
          risk_band: "high",
          reason_codes: ["suicidal_ideation_passive"],
          evidence: ["x"],
        },
        direct_effects: [],
      }),
      routeDecision: baseRouteDecision({
        response_owner: "safety",
        reason_code: "active_safety_conversation_skill",
        direct_effects_to_run: [],
      }),
      safetyContextOutput: {
        risk_band: "high",
        reason_codes: ["suicidal_ideation_passive"],
      },
      clientNow: new Date("2026-06-13T20:00:00.000Z"),
    }),
  } as any);
  assertEquals(upserts, 0);
  assertEquals(high.operationRuntime?.executedTools ?? [], []);

  // Sans go explicite (« oui » seul), la lane ne tourne pas: zéro write.
  const vague = await runDirectEffectLane({
    ...basePipelineInput({
      supabase: fakeOneShotSupabase({ onUpsert: () => upserts++ }),
      userMessage: "oui",
      tempMemory: deferredState(),
      turnFrame: baseTurnFrame({
        safety: { risk_band: "none", reason_codes: [], evidence: [] },
        direct_effects: [],
      }),
      routeDecision: baseRouteDecision({
        response_owner: "safety",
        reason_code: "active_safety_conversation_skill",
        direct_effects_to_run: [],
      }),
      safetyContextOutput: { risk_band: "none", reason_codes: [] },
      clientNow: new Date("2026-06-13T20:00:00.000Z"),
    }),
  } as any);
  assertEquals(upserts, 0);
  assertEquals(vague.operationRuntime, null);
});
