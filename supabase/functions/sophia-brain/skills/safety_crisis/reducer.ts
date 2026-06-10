import {
  createNoteInformation,
  type NoteInformation,
} from "../../contracts/note_information.v1.ts";
import {
  normalizeSafetyPhase,
  normalizeSafetyRiskBand,
  type SafetyCrisisConversationContext,
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

function noChatMutation() {
  return {
    db_write_committed: false,
    potion_session_created: false,
    scheduled_checkin_created: false,
    recurring_reminder_created: false,
    executable_confirmation_generated: false,
  };
}

function exitMemoForResolved(args: {
  statePatch: Omit<SafetyCrisisReduction["statePatch"], "visible_task">;
  dispatcherOutput?: SafetyCrisisLocalDispatcherOutput | null;
  currentUserMessage?: string | null;
}): SafetyCrisisExitMemo {
  const resolutionFacts = {
    immediate_danger: args.statePatch.immediate_danger,
    has_means_nearby: args.statePatch.has_means_nearby,
    user_not_alone: args.statePatch.user_not_alone,
    emergency_help_mentioned: args.statePatch.emergency_help_mentioned,
    human_support_mentioned: args.statePatch.human_support_mentioned,
    phase: args.statePatch.phase,
    risk_band: args.statePatch.risk_band,
  };
  const deferredProductOrToolRequest =
    args.dispatcherOutput?.product_tool_boundary.attempted === true
      ? {
        attempted: true,
        attempt_kind: args.dispatcherOutput.product_tool_boundary.attempt_kind,
        defer_reason: args.dispatcherOutput.product_tool_boundary.defer_reason,
      }
      : null;
  const activeFlowSummary =
    "Safety crisis deescalated; immediate danger absent, means safe, and human support available.";
  return {
    reason: "resolved",
    flow_summary: activeFlowSummary,
    note_information: createNoteInformation({
      source_flow_id: "safety_crisis",
      source_flow_state_summary:
        "Safety crisis deescalated with immediate danger absent, means safe, and a human support path available.",
      handoff_reason: "flow_interruption",
      target_dispatcher: "global",
      handoff_context_for_next_dispatcher:
        "Immediate danger is absent, means are safe if relevant, and a human support path is available. Do not resume product/tool work automatically; reanalyze the next user message normally.",
      target_local_dispatcher_hint: null,
      user_words: args.currentUserMessage ? [args.currentUserMessage] : [],
      structured_context: {
        source_flow: "safety_crisis",
        target_dispatcher: "global",
        handoff_reason: "flow_interruption",
        user_message_summary: args.currentUserMessage ?? null,
        active_flow_summary: activeFlowSummary,
        collected_state: resolutionFacts,
        unresolved_questions: [],
        confidence: args.dispatcherOutput?.confidence ?? "medium",
        evidence: args.dispatcherOutput?.evidence ?? [],
        recommended_next_focus:
          "Reanalyze the next user message normally; do not resume product or tool work automatically.",
        resolution_facts: resolutionFacts,
        deferred_product_or_tool_request: deferredProductOrToolRequest,
        dispatcher_evidence: args.dispatcherOutput?.evidence ?? [],
      },
      risk_score: 0,
      no_chat_mutation: noChatMutation(),
    }),
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

function missingOrWeakValues(args: {
  statePatch: Omit<SafetyCrisisReduction["statePatch"], "visible_task">;
  kind: SafetyCrisisVisibleTaskKind;
}): string[] {
  const missing: string[] = [];
  if (args.statePatch.immediate_danger !== false) {
    missing.push("immediate_danger_absent");
  }
  if (args.statePatch.has_means_nearby !== false) {
    missing.push("means_safe");
  }
  if (
    args.statePatch.user_not_alone !== true &&
    args.statePatch.human_support_mentioned !== true
  ) {
    missing.push("human_support_or_not_alone");
  }
  return args.kind === "exit_check" || args.kind === "resolved_exit"
    ? missing
    : missing.slice(0, 3);
}

function nextFocusFor(kind: SafetyCrisisVisibleTaskKind): string {
  switch (kind) {
    case "immediate_risk_check":
      return "verify immediate danger and whether the user is alone";
    case "acute_grounding":
      return "one immediate safety action: distance means, contact human support, or emergency help";
    case "support_contact":
      return "connect the user to a real human support path";
    case "stabilizing":
      return "keep the user with human support and away from means";
    case "exit_check":
      return "confirm the immediate risk is absent before resolving";
    case "resolved_exit":
      return "close the safety flow gently without resuming product work";
    case "repeat_current_step":
      return "repeat only the current safety step";
    case "product_tool_boundary":
      return "defer product or tool work and return to immediate safety";
    case "stop_or_cancel":
      return "acknowledge the local stop without handing to global on this turn";
    case "safety_transition":
      return "acknowledge the safety transition from the source flow";
    case "safety_escalation":
      return "prioritize emergency or human help now";
  }
}

function summarizeInboundNote(
  noteInformation?: NoteInformation | null,
): string | null {
  if (!noteInformation) return null;
  return [
    `source=${noteInformation.source_flow_id}`,
    `reason=${noteInformation.handoff_reason}`,
    noteInformation.source_flow_state_summary,
    noteInformation.handoff_context_for_next_dispatcher,
    noteInformation.target_local_dispatcher_hint
      ? `hint=${noteInformation.target_local_dispatcher_hint}`
      : "",
  ].map((part) => String(part ?? "").replace(/\s+/g, " ").trim()).filter(
    Boolean,
  ).join(" | ").slice(0, 700) || null;
}

function buildConversationContext(args: {
  kind: SafetyCrisisVisibleTaskKind;
  phase: SafetyCrisisPhase;
  riskBand: SafetyRiskBand;
  responseContract: ReturnType<typeof safetyResponseContract>;
  statePatch: Omit<SafetyCrisisReduction["statePatch"], "visible_task">;
  previousState: SafetyCrisisWorkingState;
  dispatcherOutput?: SafetyCrisisLocalDispatcherOutput | null;
  currentUserMessage?: string | null;
  noteInformationInbound?: NoteInformation | null;
}): SafetyCrisisConversationContext {
  const currentStep = typeof args.previousState.last_assistant_safety_step ===
      "string"
    ? args.previousState.last_assistant_safety_step
    : args.statePatch.last_assistant_safety_step ?? null;
  const userWords = [
    args.currentUserMessage ?? "",
    args.dispatcherOutput?.user_state_summary.paraphrase ?? "",
  ].map((text) => text.trim()).filter(Boolean).slice(0, 2);
  const deferredProductOrToolRequest =
    args.dispatcherOutput?.product_tool_boundary.attempted === true
      ? args.dispatcherOutput.product_tool_boundary.defer_reason ??
        args.dispatcherOutput.product_tool_boundary.attempt_kind
      : null;
  const knownValues = {
    immediate_danger: args.statePatch.immediate_danger,
    has_means_nearby: args.statePatch.has_means_nearby,
    user_not_alone: args.statePatch.user_not_alone,
    human_support_available:
      args.dispatcherOutput?.safety_signals.human_support_available === true ||
        args.statePatch.human_support_mentioned === true
        ? true
        : args.dispatcherOutput?.safety_signals.human_support_available ===
            false
        ? false
        : null,
    emergency_help_contacted:
      args.dispatcherOutput?.safety_signals.emergency_help_contacted === true ||
        args.statePatch.emergency_help_mentioned === true
        ? true
        : args.dispatcherOutput?.safety_signals.emergency_help_contacted ===
            false
        ? false
        : null,
    risk_band: args.riskBand,
    phase: args.phase,
  };
  return {
    state_summary: args.statePatch.summary ??
      `Safety support active; phase=${args.phase}; risk=${args.riskBand}.`,
    user_words: userWords,
    field_or_stage: args.kind,
    known_values: knownValues,
    missing_or_weak_values: missingOrWeakValues({
      statePatch: args.statePatch,
      kind: args.kind,
    }),
    selected_candidate: {},
    handoff_data: {
      deferred_product_or_tool_request: deferredProductOrToolRequest,
      current_step: currentStep,
      inbound_note_summary: summarizeInboundNote(args.noteInformationInbound),
    },
    next_focus: nextFocusFor(args.kind),
    safety_resources: {
      emergency_numbers: "15 ou 112",
      suicide_prevention_number: "3114",
      must_include_emergency_numbers:
        args.responseContract.must_include_emergency_numbers ||
        args.kind === "safety_escalation",
      must_prioritize_human_support:
        args.responseContract.must_prioritize_human_support ||
        args.kind === "support_contact" ||
        args.kind === "safety_escalation",
    },
    tone_constraints: ["short", "calm", "concrete", "one_next_step"],
    do_not_say: [
      "do not mention dispatcher, reducer, DB, JSON, tools, or internal state",
      "do not claim a product action was launched, created, scheduled, saved, or activated",
      "do not say the crisis is resolved unless the stage is resolved_exit",
      "do not present Sophia as human support",
    ],
    context_summary: args.dispatcherOutput?.user_state_summary
      .what_changed_since_previous_turn ??
      null,
    evidence_used: [
      ...(args.dispatcherOutput?.evidence ?? []),
      ...(args.currentUserMessage
        ? [`user_message:${args.currentUserMessage}`]
        : []),
    ].slice(0, 8),
    max_questions: args.responseContract.max_questions,
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
  if (output?.flow_action === "stop_local_no_handoff") {
    return {
      kind: "stop_or_cancel",
      reasonCode: "safety_crisis.stop_local_no_handoff",
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
  currentUserMessage?: string | null;
  noteInformationInbound?: NoteInformation | null;
}): SafetyCrisisVisibleTask {
  const responseContract = safetyResponseContract({
    phase: args.phase,
    riskBand: args.riskBand,
    signals: args.signals,
  });
  return {
    kind: args.kind,
    conversation_context: buildConversationContext({
      kind: args.kind,
      phase: args.phase,
      riskBand: args.riskBand,
      responseContract,
      statePatch: args.statePatch,
      previousState: args.previousState,
      dispatcherOutput: args.dispatcherOutput,
      currentUserMessage: args.currentUserMessage,
      noteInformationInbound: args.noteInformationInbound,
    }),
  };
}

export function reduceSafetyCrisis(args: {
  previousState: SafetyCrisisWorkingState;
  signals: SafetySignal;
  sourceRiskBand: SafetyRiskBand;
  dispatcherOutput?: SafetyCrisisLocalDispatcherOutput | null;
  currentUserMessage?: string | null;
  noteInformationInbound?: NoteInformation | null;
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
    exit_memo: null as SafetyCrisisExitMemo | null,
    summary: phase === "resolved"
      ? "Safety crisis deescalated with immediate danger absent, means safe, and human support available."
      : riskBand === "critical"
      ? "Critical safety support active."
      : "Safety support active.",
  };
  const exitMemo = phase === "resolved"
    ? exitMemoForResolved({
      statePatch: statePatchBase,
      dispatcherOutput: args.dispatcherOutput,
      currentUserMessage: args.currentUserMessage,
    })
    : null;
  statePatchBase.exit_memo = exitMemo;
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
    currentUserMessage: args.currentUserMessage,
    noteInformationInbound: args.noteInformationInbound,
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
