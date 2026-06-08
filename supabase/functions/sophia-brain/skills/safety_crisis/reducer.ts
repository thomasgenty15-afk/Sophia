import {
  normalizeSafetyPhase,
  normalizeSafetyRiskBand,
  type SafetyCrisisExitMemo,
  type SafetyCrisisLocalDispatcherOutput,
  type SafetyCrisisPhase,
  type SafetyCrisisReduction,
  type SafetyCrisisVisibleTask,
  type SafetyCrisisVisibleTaskKind,
  type SafetyCrisisWorkingState,
  safetyResponseContract,
  type SafetyRiskBand,
  type SafetySignal,
} from "./contract.ts";

const RISK_RANK: Record<SafetyRiskBand, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

function maxRisk(...bands: SafetyRiskBand[]): SafetyRiskBand {
  return bands.reduce(
    (best, band) => RISK_RANK[band] > RISK_RANK[best] ? band : best,
    "none" as SafetyRiskBand,
  );
}

function minimumRiskForPhase(phase: SafetyCrisisPhase): SafetyRiskBand {
  if (phase === "acute_grounding") return "high";
  if (phase === "immediate_risk_check" || phase === "support_contact") {
    return "high";
  }
  if (phase === "stabilizing" || phase === "exit_check") return "medium";
  if (phase === "resolved") return "low";
  return "medium";
}

function hasNewRiskSignal(signals: SafetySignal): boolean {
  if (signals.immediate_danger === true) return true;
  if (signals.has_means_nearby === true) return true;
  if (signals.suicidal_ideation || signals.self_harm_intent) {
    return !signals.clarified_non_immediate;
  }
  return false;
}

function nextConsecutiveDeescalatedTurns(args: {
  previous: SafetyCrisisWorkingState;
  signals: SafetySignal;
}): number {
  if (hasNewRiskSignal(args.signals)) return 0;
  if (!args.signals.deescalation_evidence) return 0;
  return Number(args.previous.consecutive_deescalated_turns ?? 0) + 1;
}

function exitMemoForResolved(): SafetyCrisisExitMemo {
  return {
    reason: "resolved",
    flow_summary:
      "Safety crisis deescalated; immediate danger absent, means safe, and human support available.",
    handoff_hint_for_global_dispatcher: {
      likely_intent: "unknown",
      constraints: [
        "Do not resume tools automatically.",
        "Do not treat safety resolution as consent for a product action.",
        "Keep the next turn gentle and low-pressure.",
      ],
    },
  };
}

function visibleTaskKindFor(args: {
  phase: SafetyCrisisPhase;
  riskBand: SafetyRiskBand;
  dispatcherOutput?: SafetyCrisisLocalDispatcherOutput | null;
}): { kind: SafetyCrisisVisibleTaskKind; reasonCode: string } {
  const output = args.dispatcherOutput;
  if (
    output?.flow_action === "product_or_tool_attempt" ||
    output?.product_tool_boundary.attempted === true
  ) {
    return {
      kind: "product_tool_boundary",
      reasonCode: "safety_crisis.product_tool_attempt_deferred",
    };
  }
  if (output?.flow_action === "repeat_current_step") {
    return {
      kind: "repeat_current_step",
      reasonCode: "safety_crisis.repeat_current_step",
    };
  }
  if (
    output?.flow_action === "safety_escalate" ||
    args.riskBand === "critical" ||
    Number(output?.risk_score ?? 0) >= 8
  ) {
    return {
      kind: "safety_escalation",
      reasonCode: "safety_crisis.escalated",
    };
  }
  if (args.phase === "resolved") {
    return {
      kind: "resolved_exit",
      reasonCode: "safety_crisis.resolved_exit",
    };
  }
  return {
    kind: args.phase === "entry" ? "immediate_risk_check" : args.phase,
    reasonCode: `safety_crisis.${args.phase}`,
  };
}

function buildVisibleTask(args: {
  kind: SafetyCrisisVisibleTaskKind;
  phase: SafetyCrisisPhase;
  riskBand: SafetyRiskBand;
  signals: SafetySignal;
  statePatch: Omit<SafetyCrisisReduction["statePatch"], "visible_task">;
  previousState: SafetyCrisisWorkingState;
  dispatcherOutput?: SafetyCrisisLocalDispatcherOutput | null;
}): SafetyCrisisVisibleTask {
  const responseContract = safetyResponseContract({
    phase: args.phase,
    riskBand: args.riskBand,
    signals: args.signals,
  });
  const currentStep = typeof args.previousState.last_assistant_safety_step ===
      "string"
    ? args.previousState.last_assistant_safety_step
    : args.statePatch.last_assistant_safety_step ?? null;
  return {
    kind: args.kind,
    required_data: {
      risk_band: args.riskBand,
      phase: args.phase,
      emergency_numbers: "15 ou 112",
      suicide_prevention_number: "3114",
      must_include_emergency_numbers:
        responseContract.must_include_emergency_numbers ||
        args.kind === "safety_escalation",
      must_prioritize_human_support:
        responseContract.must_prioritize_human_support ||
        args.kind === "support_contact" ||
        args.kind === "safety_escalation",
      max_questions: responseContract.max_questions,
      known_facts: {
        immediate_danger: args.statePatch.immediate_danger,
        has_means_nearby: args.statePatch.has_means_nearby,
        user_not_alone: args.statePatch.user_not_alone,
        human_support_available:
          args.signals.human_support_available === true ||
            args.statePatch.human_support_mentioned === true
            ? true
            : args.signals.human_support_available === false
            ? false
            : null,
        emergency_help_contacted:
          args.signals.emergency_help_contacted === true ||
            args.statePatch.emergency_help_mentioned === true
            ? true
            : args.signals.emergency_help_contacted === false
            ? false
            : null,
      },
      current_step: currentStep,
      deferred_product_or_tool_request:
        args.dispatcherOutput?.product_tool_boundary.attempted === true
          ? args.dispatcherOutput.product_tool_boundary.defer_reason ??
            args.dispatcherOutput.product_tool_boundary.attempt_kind
          : null,
    },
  };
}

export function reduceSafetyCrisis(args: {
  previousState: SafetyCrisisWorkingState;
  signals: SafetySignal;
  sourceRiskBand: SafetyRiskBand;
  dispatcherOutput?: SafetyCrisisLocalDispatcherOutput | null;
}): SafetyCrisisReduction {
  const previous = args.previousState;
  const previousPhase = normalizeSafetyPhase(previous.phase);
  const previousRiskBand = normalizeSafetyRiskBand(previous.risk_band);
  const previousDeescalations = Number(
    previous.consecutive_deescalated_turns ?? 0,
  );
  const meansNearby = args.signals.has_means_nearby === true ||
    (previous.has_means_nearby === true &&
      args.signals.means_moved_away !== true &&
      args.signals.has_means_nearby !== false);
  const meansSafe = args.signals.means_moved_away === true ||
    args.signals.has_means_nearby === false ||
    (previous.has_means_nearby === false &&
      args.signals.has_means_nearby !== true);
  const userKnownAlone = args.signals.user_currently_alone === true ||
    (previous.user_not_alone === false &&
      args.signals.user_currently_alone !== false);
  const userNotAlone = args.signals.user_currently_alone === false ||
    previous.user_not_alone === true;
  const humanSupportAvailable = args.signals.human_support_available === true ||
    args.signals.emergency_help_contacted === true ||
    previous.human_support_mentioned === true ||
    userNotAlone;
  const noCurrentImmediateDanger = args.signals.immediate_danger === false ||
    (args.signals.clarified_non_immediate && !meansNearby);
  const currentRiskSignal = hasNewRiskSignal(args.signals);
  const canResolve = previousPhase === "exit_check" &&
    args.sourceRiskBand !== "critical" &&
    args.sourceRiskBand !== "high" &&
    previousDeescalations >= 1 &&
    noCurrentImmediateDanger &&
    meansSafe &&
    humanSupportAvailable &&
    args.signals.user_currently_alone !== true &&
    !currentRiskSignal;

  let phase: SafetyCrisisPhase;
  if (canResolve) {
    phase = "resolved";
  } else if (args.signals.immediate_danger === true) {
    phase = "acute_grounding";
  } else if (meansNearby && userKnownAlone) {
    phase = "acute_grounding";
  } else if (meansNearby) {
    phase = "immediate_risk_check";
  } else if (
    meansSafe && !userNotAlone && !args.signals.clarified_non_immediate
  ) {
    phase = "support_contact";
  } else if (meansSafe && !humanSupportAvailable) {
    phase = "support_contact";
  } else if (
    args.signals.clarified_non_immediate && humanSupportAvailable && meansSafe
  ) {
    phase = "exit_check";
  } else if (humanSupportAvailable && !currentRiskSignal) {
    phase = "stabilizing";
  } else if (args.signals.clarified_non_immediate) {
    phase = "immediate_risk_check";
  } else if (
    args.sourceRiskBand === "critical" || args.sourceRiskBand === "high"
  ) {
    phase = "immediate_risk_check";
  } else if (previousPhase === "support_contact") {
    phase = "support_contact";
  } else if (previousPhase === "exit_check") {
    phase = "exit_check";
  } else {
    phase = "stabilizing";
  }

  const riskBand = phase === "resolved" ? "low" : maxRisk(
    args.sourceRiskBand,
    previousRiskBand,
    minimumRiskForPhase(phase),
  );
  const consecutiveDeescalatedTurns = nextConsecutiveDeescalatedTurns({
    previous,
    signals: args.signals,
  });
  const immediateDanger = args.signals.immediate_danger ??
    previous.immediate_danger ?? null;
  const hasMeansNearby = args.signals.means_moved_away === true
    ? false
    : args.signals.has_means_nearby === true
    ? true
    : args.signals.has_means_nearby === false
    ? false
    : previous.has_means_nearby ?? null;
  const userNotAlonePatch = args.signals.user_currently_alone === false
    ? true
    : args.signals.user_currently_alone === true
    ? false
    : previous.user_not_alone ?? null;
  const emergencyHelpMentioned = Boolean(
    previous.emergency_help_mentioned ||
      args.signals.emergency_help_contacted ||
      riskBand === "critical" ||
      args.signals.immediate_danger === true,
  );
  const humanSupportMentioned = Boolean(
    previous.human_support_mentioned || humanSupportAvailable,
  );
  const exitMemo = phase === "resolved" ? exitMemoForResolved() : null;
  const statePatchBase = {
    phase,
    risk_band: riskBand,
    trigger_summary: previous.trigger_summary ??
      args.dispatcherOutput?.state_hints.suggested_trigger_summary ??
      (args.signals.suicidal_ideation || args.signals.self_harm_intent ||
          args.signals.immediate_danger === true
        ? "Safety crisis signal detected."
        : null),
    immediate_danger: immediateDanger,
    has_means_nearby: hasMeansNearby,
    user_not_alone: userNotAlonePatch,
    emergency_help_mentioned: emergencyHelpMentioned,
    human_support_mentioned: humanSupportMentioned,
    consecutive_deescalated_turns: consecutiveDeescalatedTurns,
    last_user_safety_signal:
      args.dispatcherOutput?.state_hints.suggested_last_user_safety_signal ??
        `phase=${phase}; risk=${riskBand}; deescalation=${args.signals.deescalation_evidence}`,
    last_assistant_safety_step: `safety_step=${phase}`,
    exit_memo: exitMemo,
    summary: phase === "resolved"
      ? "Safety crisis deescalated with immediate danger absent, means safe, and human support available."
      : riskBand === "critical"
      ? "Critical safety support active."
      : "Safety support active.",
  };
  const task = visibleTaskKindFor({
    phase,
    riskBand,
    dispatcherOutput: args.dispatcherOutput,
  });
  const visibleTask = buildVisibleTask({
    kind: task.kind,
    phase,
    riskBand,
    signals: args.signals,
    statePatch: statePatchBase,
    previousState: previous,
    dispatcherOutput: args.dispatcherOutput,
  });

  return {
    phase,
    riskBand,
    statePatch: {
      ...statePatchBase,
      visible_task: visibleTask,
    },
    visibleTask,
    exitMemo,
    reasonCode: task.reasonCode,
  };
}
