import {
  baseOutput,
  type RunSkillInput,
  statementCandidate,
} from "../_shared/skill_helpers.ts";
import { emptyConversationEffects } from "../_shared/conversation_skill_contract.ts";
import type { ConversationSkillOutput } from "../../contracts/skill_output.v1.ts";
import {
  type SafetyCrisisDecision,
  safetyResponseContract,
} from "./contract.ts";
import {
  buildSafetyCrisisIntakeInput,
  buildSafetySnapshot,
  hasSafetyCrisisIntakeRunnerForTest,
  runSafetyCrisisStructuredIntake,
} from "./intake.ts";
import { runSafetyCrisisLocalDispatcher } from "./local_dispatcher.ts";
import {
  applyConservativeSafetyOverrides,
  inferStructuredSafetySignals,
} from "./signals.ts";
import { reduceSafetyCrisis } from "./reducer.ts";
import { renderSafetyReply } from "./renderer.ts";
import { runSafetyCrisisVisibleAgent } from "./visible_agent.ts";

function fallbackReplyForVisibleTask(args: {
  visibleTaskKind: string;
  legacyReply: string;
  currentStep?: string | null;
}): string {
  if (args.visibleTaskKind === "product_tool_boundary") {
    return "Je laisse cette demande de cote maintenant. Reste avec moi sur la securite immediate: est-ce que tu es en danger maintenant ?";
  }
  if (args.visibleTaskKind === "repeat_current_step") {
    return args.currentStep
      ? `On reprend juste ce pas: ${args.currentStep}. Est-ce que c'est fait ?`
      : args.legacyReply;
  }
  return args.legacyReply;
}

export async function runSafetyCrisisSkill(
  input: RunSkillInput,
): Promise<ConversationSkillOutput> {
  const snapshot = buildSafetySnapshot(input);
  const workingState = snapshot.previous_state;
  const legacyIntakeRunnerForTest = hasSafetyCrisisIntakeRunnerForTest();
  const localDispatcherOutput = legacyIntakeRunnerForTest
    ? null
    : await runSafetyCrisisLocalDispatcher({
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
  const intakeResult = localDispatcherOutput
    ? {
      ok: true,
      signals: localDispatcherOutput.safety_signals,
      paraphrase: localDispatcherOutput.user_state_summary.paraphrase,
      reason: "safety_crisis_local_dispatcher",
    }
    : await runSafetyCrisisStructuredIntake(
      buildSafetyCrisisIntakeInput({ input, snapshot }),
    );
  const intakeSignals = inferStructuredSafetySignals({
    snapshot,
    intakeResult,
  });
  const safetySignals = localDispatcherOutput
    ? intakeSignals
    : applyConservativeSafetyOverrides({
      snapshot,
      signals: intakeSignals,
    });
  const reduction = reduceSafetyCrisis({
    previousState: snapshot.previous_state,
    signals: safetySignals,
    sourceRiskBand: snapshot.source_risk_band,
    dispatcherOutput: localDispatcherOutput,
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
  const visibleReply = legacyIntakeRunnerForTest
    ? null
    : await runSafetyCrisisVisibleAgent({
      user_id: input.context.user_id,
      request_id: input.context.turn_frame.source_message_id,
      user_message: input.user_message,
      recent_messages: input.context.recent_messages,
      visible_task: reduction.visibleTask,
    });
  // Legacy technical fallback only: nominal visible copy comes from
  // safety_crisis.visible_agent after reducer-owned task selection.
  const legacyRenderedFallback = visibleReply ? null : renderSafetyReply({
    phase: reduction.phase,
    signals: safetySignals,
    previousState: snapshot.previous_state,
    riskBand: reduction.riskBand,
  });
  const fallbackReply = legacyRenderedFallback
    ? fallbackReplyForVisibleTask({
      visibleTaskKind: reduction.visibleTask.kind,
      legacyReply: legacyRenderedFallback.reply,
      currentStep: reduction.visibleTask.required_data.current_step,
    })
    : "";
  const decision: SafetyCrisisDecision = {
    skill_id: "safety_crisis",
    phase: reduction.phase,
    risk_band: reduction.riskBand,
    safety_signals: safetySignals,
    response_contract: responseContract,
    reply: visibleReply ?? fallbackReply,
    state_patch: reduction.statePatch,
  };
  const status = decision.phase === "resolved" ? "exit" : "continue";
  const memoryWriteCandidates = [
    statementCandidate(
      `Safety mode active; phase=${decision.phase}; risk=${decision.risk_band}.`,
      snapshot.source_message_id,
      decision.risk_band === "critical" || decision.risk_band === "high"
        ? 4
        : 3,
      false,
    ),
  ];

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
      exit_memo: reduction.exitMemo,
      intake_ok: intakeResult.ok,
      intake_reason: intakeResult.reason ?? null,
      intake_paraphrase: intakeResult.paraphrase ?? null,
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
