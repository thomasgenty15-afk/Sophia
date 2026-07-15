import { baseOutput, type RunSkillInput } from "../_shared/skill_helpers.ts";
import { emptyConversationEffects } from "../_shared/conversation_skill_contract.ts";
import type { ConversationSkillOutput } from "../../contracts/skill_output.v1.ts";
import {
  emptySafetySignal,
  normalizeSafetyRiskBand,
  type SafetyCrisisLocalDispatcherOutput,
  type SafetyCrisisDecision,
  type SafetyCrisisSnapshot,
  safetyResponseContract,
} from "./contract.ts";
import { runSafetyCrisisLocalDispatcher } from "./local_dispatcher.ts";
import { reduceSafetyCrisis } from "./reducer.ts";
import {
  runSafetyCrisisVisibleAgentResult,
  safetyCrisisDeterministicVisibleMessage,
} from "./visible_agent.ts";

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

function directEffectLane(input: RunSkillInput) {
  const lane = (input.context.turn_frame as any)?.direct_effect_lane;
  return lane && typeof lane === "object" && !Array.isArray(lane)
    ? lane as Record<string, unknown>
    : null;
}

export async function runSafetyCrisisSkill(
  input: RunSkillInput,
): Promise<ConversationSkillOutput> {
  const snapshot = buildSafetySnapshot(input);
  const workingState = snapshot.previous_state;
  const precomputedLocalDispatcherOutput = (input.context as any)
    ?.precomputed_safety_crisis_local_dispatcher_output as
      | SafetyCrisisLocalDispatcherOutput
      | null
      | undefined;
  const localDispatcherOutput = precomputedLocalDispatcherOutput ??
    await runSafetyCrisisLocalDispatcher({
      user_id: input.context.user_id,
      request_id: input.context.turn_frame.source_message_id,
      user_message: input.user_message,
      recent_messages: input.context.recent_messages,
      source_safety_context: {
        risk_band: snapshot.source_risk_band,
        reason_codes: input.context.turn_frame.safety.reason_codes ?? [],
        evidence: input.context.turn_frame.safety.evidence ?? [],
      },
      previous_active_safety_state: input.context.active_skill_working_state,
      note_information_inbound: input.context.turn_frame.note_information ??
        null,
      prior_phase: typeof workingState.phase === "string"
        ? workingState.phase
        : null,
      prior_known_facts: {
        immediate_danger: workingState.immediate_danger ?? null,
        has_means_nearby: workingState.has_means_nearby ?? null,
        user_not_alone: workingState.user_not_alone ?? null,
        emergency_help_mentioned: workingState.emergency_help_mentioned ??
          null,
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
  // P7-A (paul-p6reval R1-B06): co-demande de recall BÉNIGNE détectée par le
  // runtime (déclencheur déterministe P5-G) — portée jusqu'au visible agent
  // pour être restituée en une ligne ou différée honnêtement, jamais avalée.
  const benignRecallRequest = input.context.benign_recall_request ?? null;
  const reduction = reduceSafetyCrisis({
    previousState: snapshot.previous_state,
    signals: safetySignals,
    sourceRiskBand: snapshot.source_risk_band,
    dispatcherOutput: localDispatcherOutput,
    currentUserMessage: input.user_message,
    noteInformationInbound: input.context.turn_frame.note_information ?? null,
    benignRecallRequest,
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
  const visibleTask = {
    ...reduction.visibleTask,
    conversation_context: {
      ...reduction.visibleTask.conversation_context,
      known_values: {
        ...reduction.visibleTask.conversation_context.known_values,
        direct_effect_lane: directEffectLane(input),
        direct_effect_confirmation_context:
          (input.context.turn_frame as any)?.direct_effect_confirmation_context ??
            null,
      },
    },
  };
  const visibleAgentResult = await runSafetyCrisisVisibleAgentResult({
    user_id: input.context.user_id,
    request_id: input.context.turn_frame.source_message_id,
    visible_task: visibleTask,
  });
  const visibleGenerationFailed = !visibleAgentResult.message;
  // Invariant anti-vide: un tour safety ne rend jamais une reponse vide.
  const deterministicVisibleMessage = visibleGenerationFailed
    ? safetyCrisisDeterministicVisibleMessage(
      reduction.visibleTask.kind,
      reduction.visibleTask.conversation_context.safety_resources,
    )
    : null;
  if (visibleGenerationFailed) {
    console.warn("safety_crisis.visible_generation_failed", {
      "visible_task.kind": reduction.visibleTask.kind,
      reason: visibleAgentResult.failure_reason,
      deterministic_visible_message_used: true,
    });
  }
  const decision: SafetyCrisisDecision = {
    skill_id: "safety_crisis",
    phase: reduction.phase,
    risk_band: reduction.riskBand,
    safety_signals: safetySignals,
    response_contract: responseContract,
    reply: visibleAgentResult.message ?? deterministicVisibleMessage ?? "",
    state_patch: {
      ...reduction.statePatch,
      visible_task: visibleTask,
    },
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
      flow_action: localDispatcherOutput?.flow_action ?? null,
      reducer_reason_code: reduction.reasonCode,
      safety_signals: decision.safety_signals,
      response_contract: decision.response_contract,
      local_dispatcher_ok: Boolean(localDispatcherOutput),
      local_dispatcher_output: localDispatcherOutput,
      local_flow_trace: {
        flow_action: localDispatcherOutput?.flow_action ?? null,
        visible_task: reduction.visibleTask.kind,
        pending_state_present: Boolean(
          (reduction.statePatch as any).pending_offer ||
            (reduction.statePatch as any).pending_confirmation,
        ),
        direct_handoff_flag: Boolean(
          localDispatcherOutput?.direct_effect_request.requested === true &&
            localDispatcherOutput.direct_effect_request.effect_type ===
              "create_one_shot_reminder" &&
            localDispatcherOutput.direct_effect_request.explicitness ===
              "explicit" &&
            localDispatcherOutput.direct_effect_request.target_status ===
              "identified" &&
            Boolean(
              localDispatcherOutput.direct_effect_request.payload_hint
                .when_hint,
            ) &&
            Boolean(
              localDispatcherOutput.direct_effect_request.payload_hint
                .instruction_hint,
            ),
        ),
        selected_option: (reduction.statePatch as any).last_selected_option ??
          null,
        selected_target:
          localDispatcherOutput?.direct_effect_request.payload_hint.raw_text ??
            null,
        candidate_list_summary: [],
        constraint_list: [
          "no_product_push_during_safety",
          "no_tool_suggestion_during_safety",
          "no_memory_persistence_by_default",
        ],
        stabilization_ready: decision.phase === "resolved",
        blocked_effects: localDispatcherOutput?.direct_effect_request
            .requested === true &&
            localDispatcherOutput.direct_effect_request.target_status !==
              "identified"
          ? [{
            effect_type: localDispatcherOutput.direct_effect_request.effect_type,
            reason_code: "selected_option_missing",
          }]
          : [],
        state_mutation_audit: reduction.stateMutationAudit,
      },
      state_mutation_audit: reduction.stateMutationAudit,
      visible_task: reduction.visibleTask,
      visible_agent_ok: visibleAgentResult.visible_agent_ok,
      visible_fallback_used: Boolean(deterministicVisibleMessage),
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
    memory_write_candidates: memoryWriteCandidates,
    effects: emptyConversationEffects(),
    state_patch: decision.state_patch,
  });
}
