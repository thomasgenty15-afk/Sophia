import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import type { TurnFrame } from "../../contracts/turn_frame.v1.ts";
import type { LoadSkillContextInput } from "../_shared/context.ts";
import { emptySafetySignal } from "./contract.ts";
import { loadSafetyCrisisContext } from "./context_loader.ts";
import {
  normalizeSafetyCrisisLocalDispatcherOutput,
  setSafetyCrisisLocalDispatcherForTest,
} from "./local_dispatcher.ts";
import { reduceSafetyCrisis } from "./reducer.ts";
import { runSafetyCrisisSkill } from "./skill.ts";
import { setSafetyCrisisVisibleAgentForTest } from "./visible_agent.ts";

function turnFrame(patch: Partial<TurnFrame> = {}): TurnFrame {
  return {
    turn_id: "turn-safety-local",
    source_message_id: "message-safety-local",
    user_id: "user-safety-local",
    channel: "whatsapp",
    safety: { risk_band: "medium", reason_codes: [], evidence: [] },
    direct_effects: [],
    tool_skill_intents: [],
    tool_skill_opportunity: {
      type: "none",
      operation_type: null,
      surface_id: null,
      confidence_band: "low",
      should_offer: false,
      prop_reason: null,
      source_span: null,
      target_hint: null,
      target_status: "none",
      suggested_question_intent: null,
      offer_timing: "never",
      must_not_execute: true,
    },
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
      status_recap_called: false,
      tool_skill_called: false,
      operation_suggestion_created: false,
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
  assertEquals(normalized.no_tooling.tool_skill_called, false);

  assertThrows(
    () =>
      dispatcherOutput({
        no_tooling: {
          tool_skill_called: true,
        },
      }),
    Error,
    "tooling_tool_skill_called",
  );
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
    assertEquals(output.operation_suggestions?.length, 0);
    assertEquals(output.effects?.requested.length, 0);
    assertEquals(output.effects?.allowed.length, 0);
    assertEquals(output.effects?.committed.length, 0);
    assertEquals(output.recommendation_need?.needed, false);
  } finally {
    setSafetyCrisisLocalDispatcherForTest(null);
    setSafetyCrisisVisibleAgentForTest(null);
  }
});
