import { baseOutput, type RunSkillInput } from "../_shared/skill_helpers.ts";
import { emptyConversationEffects } from "../_shared/conversation_skill_contract.ts";
import type { ConversationSkillOutput } from "../../contracts/skill_output.v1.ts";
import {
  emptySafetySignal,
  normalizeSafetyRiskBand,
  type SafetyCrisisDecision,
  type SafetyCrisisSnapshot,
  safetyResponseContract,
} from "./contract.ts";
import { runSafetyCrisisLocalDispatcher } from "./local_dispatcher.ts";
import { reduceSafetyCrisis } from "./reducer.ts";
import { runSafetyCrisisVisibleAgentResult } from "./visible_agent.ts";

function workingState(input: RunSkillInput): SafetyCrisisSnapshot[
  "previous_state"
] {
  const raw = input.context.active_skill_working_state?.working_state;
  return raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as SafetyCrisisSnapshot["previous_state"]
    : {};
}

function buildSafetySnapshot(input: RunSkillInput): SafetyCrisisSnapshot {
  return {
    user_message: input.user_message,
    normalized_user_message: "",
    source_message_id: input.context.turn_frame.source_message_id,
    source_risk_band: normalizeSafetyRiskBand(
      input.context.turn_frame.safety.risk_band,
    ),
    previous_state: workingState(input),
  };
}

export async function runSafetyCrisisSkill(
  input: RunSkillInput,
): Promise<ConversationSkillOutput> {
  const snapshot = buildSafetySnapshot(input);
  const workingState = snapshot.previous_state;
  const localDispatcherOutput = await runSafetyCrisisLocalDispatcher({
    user_id: input.context.user_id,
    request_id: input.context.turn_frame.source_message_id,
    user_message: input.user_message,
    recent_messages: input.context.recent_messages,
    source_safety_pregate: {
      risk_band: snapshot.source_risk_band,
      reason_codes: input.context.turn_frame.safety.reason_codes ?? [],
      evidence: input.context.turn_frame.safety.evidence ?? [],
    },
    previous_active_safety_state: input.context.active_skill_working_state,
    note_information_inbound: input.context.turn_frame.note_information ?? null,
    prior_phase: typeof workingState.phase === "string"
      ? workingState.phase
      : null,
    prior_known_facts: {
      immediate_danger: workingState.immediate_danger ?? null,
      has_means_nearby: workingState.has_means_nearby ?? null,
      user_not_alone: workingState.user_not_alone ?? null,
      emergency_help_mentioned: workingState.emergency_help_mentioned ?? null,
      human_support_mentioned: workingState.human_support_mentioned ?? null,
      consecutive_deescalated_turns:
        workingState.consecutive_deescalated_turns ?? 0,
      last_user_safety_signal: workingState.last_user_safety_signal ?? null,
      last_assistant_safety_step: workingState.last_assistant_safety_step ??
        null,
    },
    channel: input.context.turn_frame.channel,
    timezone: null,
    turn_frame: input.context.turn_frame,
  });
  const dispatcherResult = localDispatcherOutput
    ? {
      ok: true,
      signals: localDispatcherOutput.safety_signals,
      paraphrase: localDispatcherOutput.user_state_summary.paraphrase,
      reason: "safety_crisis_local_dispatcher",
    }
    : {
      ok: false,
      signals: emptySafetySignal({ uncertainty: "high" }),
      paraphrase: null,
      reason: "safety_crisis_local_dispatcher_failed_no_legacy_fallback",
    };
  const safetySignals = emptySafetySignal(dispatcherResult.signals);
  const reduction = reduceSafetyCrisis({
    previousState: snapshot.previous_state,
    signals: safetySignals,
    sourceRiskBand: snapshot.source_risk_band,
    dispatcherOutput: localDispatcherOutput,
    currentUserMessage: input.user_message,
    noteInformationInbound: input.context.turn_frame.note_information ?? null,
  });
  console.info("safety_crisis.reducer_result", {
    source_risk_band: snapshot.source_risk_band,
    computed_risk_band: reduction.riskBand,
    phase: reduction.phase,
    "visible_task.kind": reduction.visibleTask.kind,
    no_tooling: true,
    exit_memo: reduction.exitMemo,
  });
  if (reduction.visibleTask.kind === "product_tool_boundary") {
    console.info("safety_crisis.product_tool_attempt_deferred", {
      source_risk_band: snapshot.source_risk_band,
      computed_risk_band: reduction.riskBand,
      phase: reduction.phase,
      "visible_task.kind": reduction.visibleTask.kind,
      no_tooling: true,
    });
  }
  if (reduction.reasonCode === "safety_crisis.escalated") {
    console.info("safety_crisis.escalated", {
      source_risk_band: snapshot.source_risk_band,
      computed_risk_band: reduction.riskBand,
      phase: reduction.phase,
      "visible_task.kind": reduction.visibleTask.kind,
      no_tooling: true,
    });
  }
  if (reduction.exitMemo) {
    console.info("safety_crisis.resolved_exit", {
      source_risk_band: snapshot.source_risk_band,
      computed_risk_band: reduction.riskBand,
      phase: reduction.phase,
      "visible_task.kind": reduction.visibleTask.kind,
      no_tooling: true,
      exit_memo: reduction.exitMemo,
    });
  }
  const responseContract = safetyResponseContract({
    phase: reduction.phase,
    riskBand: reduction.riskBand,
    signals: safetySignals,
  });
  const visibleAgentResult = await runSafetyCrisisVisibleAgentResult({
    user_id: input.context.user_id,
    request_id: input.context.turn_frame.source_message_id,
    visible_task: reduction.visibleTask,
  });
  const visibleGenerationFailed = !visibleAgentResult.message;
  if (visibleGenerationFailed) {
    console.warn("safety_crisis.visible_generation_failed", {
      "visible_task.kind": reduction.visibleTask.kind,
      reason: visibleAgentResult.failure_reason,
      deterministic_visible_message_used: false,
    });
  }
  const decision: SafetyCrisisDecision = {
    skill_id: "safety_crisis",
    phase: reduction.phase,
    risk_band: reduction.riskBand,
    safety_signals: safetySignals,
    response_contract: responseContract,
    reply: visibleAgentResult.message ?? "",
    state_patch: reduction.statePatch,
  };
  const status = decision.phase === "resolved" ||
      reduction.visibleTask.kind === "stop_or_cancel"
    ? "exit"
    : "continue";
  const memoryWriteCandidates: [] = [];

  return baseOutput("safety_crisis", {
    status,
    response_intent: decision.phase === "resolved"
      ? "deescalate_and_exit"
      : decision.phase === "acute_grounding"
      ? "ground_safety"
      : "continue_safety_flow",
    reply: decision.reply,
    diagnosis: {
      phase: decision.phase,
      source_risk_band: snapshot.source_risk_band,
      risk_band: decision.risk_band,
      safety_signals: decision.safety_signals,
      response_contract: decision.response_contract,
      local_dispatcher_ok: Boolean(localDispatcherOutput),
      local_dispatcher_output: localDispatcherOutput,
      visible_task: reduction.visibleTask,
      visible_agent_ok: visibleAgentResult.visible_agent_ok,
      visible_fallback_used: false,
      visible_generation_failed: visibleGenerationFailed,
      visible_failure_reason: visibleAgentResult.failure_reason,
      exit_memo: reduction.exitMemo,
      local_dispatcher_result_ok: dispatcherResult.ok,
      local_dispatcher_result_reason: dispatcherResult.reason ?? null,
      local_dispatcher_result_paraphrase: dispatcherResult.paraphrase ?? null,
    },
    recommendation_need: {
      needed: false,
      type: "none",
      urgency: "none",
      constraints: [
        "no_product_push_during_safety",
        "no_tool_suggestion_during_safety",
        "no_memory_persistence_by_default",
      ],
    },
    operation_suggestions: [],
    memory_write_candidates: memoryWriteCandidates,
    effects: emptyConversationEffects(),
    state_patch: decision.state_patch,
  });
}
