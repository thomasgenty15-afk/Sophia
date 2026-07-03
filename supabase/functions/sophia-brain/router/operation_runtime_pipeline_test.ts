import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { RouteDecision } from "../contracts/route_decision.v1.ts";
import type { TurnFrame } from "../contracts/turn_frame.v1.ts";
import {
  mergeDirectEffectRuntimeIntoVisibleRuntime,
  runDirectEffectLane,
  runOperationRuntimePipeline,
  turnFrameWithDirectEffectRuntime,
} from "./operation_runtime_pipeline.ts";
import { normalizeWeeklyReviewLocalDispatcherOutput } from "../skills/weekly_review/local_flow.ts";

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

Deno.test("operation_runtime_pipeline safety route allows one-shot reminder", async () => {
  const message = "Rappelle-moi dans 40 minutes de respirer et d'appeler Sam.";
  const result = await runOperationRuntimePipeline(basePipelineInput({
    supabase: fakeOneShotSupabase(),
    userMessage: message,
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

  assertEquals(result.operationRuntime?.toolExecution, "success");
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

Deno.test("operation_runtime_pipeline active weekly commits local one-shot before visible weekly", async () => {
  const message =
    "Le plus dur c'est de choisir, et rappelle-moi demain a 18h de relire cette version allegee.";
  const activeWeeklyState = {
    skill_id: "weekly_adaptive_review_v1",
    status: "open",
    weekly_progress_review: {
      transformations: [],
    },
    weekly_adaptive_review: {
      week_strategy: { decision: "advance", reason: "test" },
    },
    weekly_flow_state: {
      stage: "solution_fit",
      validation_unlock_status: "locked_until_weekly_complete",
      weekly_gates: {
        week_experience_status: "captured",
        action_review_status: "captured",
        global_progress_status: "captured",
        felt_progress_status: "captured",
        solution_fit_status: "captured",
        synthesis_status: "missing",
        closure_status: "missing",
      },
      child_flow: { status: "none" },
      detour_candidate: { kind: "none" },
      turn_count: 2,
      max_turns: 6,
    },
  };
  let visibleInput: any = null;
  const result = await runOperationRuntimePipeline(basePipelineInput({
    supabase: fakeOneShotSupabase(),
    userMessage: message,
    tempMemory: {
      __active_skill_state: activeWeeklyState,
    },
    turnFrame: baseTurnFrame(),
    routeDecision: baseRouteDecision({
      response_owner: "weekly_adaptive_review_v1",
      selected_handler: "weekly_adaptive_review_v1",
      reason_code: "active_weekly_adaptive_review",
      active_flow_arbitration: {
        decision: "continue_active",
        active_owner: "weekly_adaptive_review_v1",
        selected_owner: "weekly_adaptive_review_v1",
        resume_policy: "resume_active",
        reason_code: "active_weekly_adaptive_review",
      },
    }),
    clientNow: new Date("2026-06-13T08:00:00.000Z"),
    weeklyReviewLocalDispatcher: async () =>
      normalizeWeeklyReviewLocalDispatcherOutput({
        flow_action: "confirm_weekly_diagnostic",
        confidence: "high",
        weekly_intent: {
          kind: "weekly_answer",
          summary: "User identifies decision overload and asks a reminder.",
        },
        human_signal_updates: {
          objective_delta: "slight_progress",
          felt_progress: "neutral",
          felt_state: "stable",
        },
        direct_effect_request: {
          requested: true,
          effect_type: "create_one_shot_reminder",
          explicitness: "explicit",
          target_status: "identified",
          confidence_band: "high",
          payload_hint: {
            raw_text:
              "rappelle-moi demain a 18h de relire cette version allegee",
            when_hint: "demain a 18h",
            UTC_time: "2026-06-14T16:00:00.000Z",
            local_label: "demain a 18:00",
            instruction_hint: "relire cette version allegee",
          },
          reason: "explicit one-shot reminder during weekly",
        },
        weekly_gates: {
          global_progress_status: "captured",
          felt_progress_status: "captured",
          solution_fit_status: "captured",
        },
        state_updates: {
          status: "open",
          weekly_stage: "solution_fit",
        },
        visible_task: {
          kind: "qualify_solution_fit",
          instruction: "Continue weekly after committed reminder context.",
        },
        evidence: ["rappelle-moi demain a 18h"],
      }),
    weeklyReviewVisibleAgent: async (input: any) => {
      visibleInput = input;
      return "C'est programme. On continue le point weekly.";
    },
  }));

  assertEquals(result.operationRuntime?.toolExecution, "success");
  assertEquals(result.operationRuntime?.executedTools, [
    "create_one_shot_reminder",
  ]);
  assertEquals(
    visibleInput?.direct_effect_confirmation_context
      ?.has_committed_one_shot_reminder,
    true,
  );
  assertEquals(
    result.routeDecision?.response_owner,
    "weekly_adaptive_review_v1",
  );
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
