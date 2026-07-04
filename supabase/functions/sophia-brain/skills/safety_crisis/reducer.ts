import {
  createNoteInformation,
  type NoteInformation,
  noteInformationRecommendedNextFocus,
  noteInformationSummary,
} from "../../contracts/note_information.v1.ts";
import {
  normalizeSafetyPhase,
  normalizeSafetyRiskBand,
  type SafetyCrisisConversationContext,
  type SafetyCrisisExitMemo,
  type SafetyCrisisLocalDispatcherOutput,
  type SafetyCrisisPhase,
  type SafetyCrisisReduction,
  type SafetyCrisisStateMutationAudit,
  type SafetyCrisisStateMutationRejectedChange,
  type SafetyCrisisStatePatch,
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

const SAFETY_SERVER_OWNED_FIELDS = [
  "phase",
  "risk_band",
  "trigger_summary",
  "immediate_danger",
  "has_means_nearby",
  "user_not_alone",
  "emergency_help_mentioned",
  "human_support_mentioned",
  "emergency_numbers_delivered",
  "consecutive_deescalated_turns",
  "last_user_safety_signal",
  "last_assistant_safety_step",
  "exit_memo",
  "pending_offer",
  "pending_confirmation",
  "last_selected_option",
  "active_subflow_context",
  "handoff_note",
  "note_information",
  "local_state_summary",
  "previous_flow_summary",
] as const;

function hasOwnField(value: unknown, field: string): boolean {
  return Boolean(
    value && typeof value === "object" && !Array.isArray(value) &&
      Object.prototype.hasOwnProperty.call(value, field),
  );
}

function stableJson(value: unknown): string {
  if (value === undefined) return "__undefined__";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return stableJson(a) === stableJson(b);
}

function declaredServerOwnedFields(fields: string[] | undefined): string[] {
  const allowed = new Set<string>(SAFETY_SERVER_OWNED_FIELDS);
  return Array.isArray(fields)
    ? fields.map((field) => String(field ?? "").trim()).filter((field) =>
      allowed.has(field)
    )
    : [];
}

function resolutionRefusalReason(args: {
  previousPhase: SafetyCrisisPhase;
  previousDeescalations: number;
  noCurrentImmediateDanger: boolean;
  meansSafe: boolean;
  humanSupportAvailable: boolean;
  userCurrentlyAlone: boolean;
  currentRiskSignal: boolean;
}): string {
  if (args.previousPhase !== "exit_check") {
    return "missing_previous_exit_check";
  }
  if (args.previousDeescalations < 1) {
    return "not_stabilized_enough";
  }
  if (!args.noCurrentImmediateDanger) {
    return "immediate_danger_absent_missing";
  }
  if (!args.meansSafe) return "means_safe_missing";
  if (!args.humanSupportAvailable || args.userCurrentlyAlone) {
    return "human_support_or_not_alone_missing";
  }
  if (args.currentRiskSignal) return "no_fresh_risk_signal_missing";
  return "missing_resolution_facts";
}

function rejectedChange(
  field: string,
  requestedAction: "modify" | "clear",
  reasonCode: SafetyCrisisStateMutationRejectedChange["reason_code"],
): SafetyCrisisStateMutationRejectedChange {
  return {
    field,
    requested_action: requestedAction,
    reason_code: reasonCode,
  };
}

export function mergeSafetyCrisisLocalState(args: {
  previous: SafetyCrisisWorkingState;
  output?: SafetyCrisisLocalDispatcherOutput | null;
  transition: {
    phase: SafetyCrisisPhase;
    reason_code: string;
    resolved: boolean;
  };
  computed: SafetyCrisisStatePatch;
  now: string;
  constraints?: {
    allow_clear_pending_runtime?: boolean;
  };
}): {
  statePatch: SafetyCrisisStatePatch;
  audit: SafetyCrisisStateMutationAudit;
} {
  void args.now;
  void args.constraints;
  const previous = args.previous ?? {};
  const modifiedDeclared = declaredServerOwnedFields(
    args.output?.modified_fields,
  );
  const clearDeclared = declaredServerOwnedFields(args.output?.clear_fields);
  const next: SafetyCrisisStatePatch = {
    ...args.computed,
    trigger_summary: previous.trigger_summary ??
      args.computed.trigger_summary ?? null,
    local_state_summary: args.computed.summary ?? previous.local_state_summary ??
      null,
    previous_flow_summary: previous.previous_flow_summary ?? null,
  };

  for (
    const field of [
      "pending_offer",
      "pending_confirmation",
      "last_selected_option",
      "active_subflow_context",
      "handoff_note",
      "note_information",
    ] as const
  ) {
    if (hasOwnField(previous, field)) {
      if (
        args.transition.resolved &&
        (field === "pending_offer" ||
          field === "pending_confirmation" ||
          field === "last_selected_option" ||
          field === "active_subflow_context")
      ) {
        next[field] = null;
      } else {
        next[field] = previous[field] as never;
      }
    }
  }

  const appliedFields: string[] = [];
  const preservedFields: string[] = [];
  const clearedFields: string[] = [];
  const restoredFields: string[] = [];
  const rejectedChanges: SafetyCrisisStateMutationRejectedChange[] = [];

  for (const field of SAFETY_SERVER_OWNED_FIELDS) {
    const previousHasField = hasOwnField(previous, field);
    const previousValue = (previous as Record<string, unknown>)[field];
    const nextHasField = hasOwnField(next, field);
    const nextValue = (next as Record<string, unknown>)[field];
    if (previousHasField && (!nextHasField || nextValue === null)) {
      clearedFields.push(field);
    } else if (previousHasField && valuesEqual(previousValue, nextValue)) {
      preservedFields.push(field);
    } else if (nextHasField && !valuesEqual(previousValue, nextValue)) {
      appliedFields.push(field);
    }
  }

  for (const field of clearDeclared) {
    if (!clearedFields.includes(field)) {
      if (hasOwnField(previous, field)) restoredFields.push(field);
      rejectedChanges.push(
        rejectedChange(field, "clear", "transition_not_authorized"),
      );
    }
  }
  for (const field of modifiedDeclared) {
    if (!appliedFields.includes(field)) {
      if (hasOwnField(previous, field)) restoredFields.push(field);
      rejectedChanges.push(
        rejectedChange(field, "modify", "transition_not_authorized"),
      );
    }
  }

  return {
    statePatch: next,
    audit: {
      server_owned_fields: [...SAFETY_SERVER_OWNED_FIELDS],
      modified_fields_declared: modifiedDeclared,
      clear_fields_declared: clearDeclared,
      applied_fields: [...new Set(appliedFields)],
      preserved_fields: [...new Set(preservedFields)],
      restored_fields: [...new Set(restoredFields)],
      cleared_fields: [...new Set(clearedFields)],
      rejected_changes: rejectedChanges,
    },
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
      handoff_reason: "flow_interruption",
      target_dispatcher: "global",
      handoff_context_for_next_dispatcher:
        "Immediate danger is absent, means are safe if relevant, and a human support path is available. Do not resume product/tool work automatically; reanalyze the next user message normally.",
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
      return "prepare a controlled safety exit only if resolution facts are sufficient";
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
    noteInformationSummary(noteInformation),
    noteInformation.handoff_context_for_next_dispatcher,
    noteInformationRecommendedNextFocus(noteInformation)
      ? `focus=${noteInformationRecommendedNextFocus(noteInformation)}`
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
  mustIncludeEmergencyNumbers: boolean;
  emergencyNumbersAlreadyDelivered: boolean;
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
    emergency_numbers_already_delivered: args.emergencyNumbersAlreadyDelivered,
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
      must_include_emergency_numbers: args.mustIncludeEmergencyNumbers,
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
  exitRefusalReason?: string | null;
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
  if (args.phase === "resolved") {
    return {
      kind: "resolved_exit",
      reasonCode: "safety_crisis.resolved_exit",
    };
  }
  if (
    output?.flow_action === "exit_to_global_dispatcher" ||
    output?.flow_action === "wants_to_exit" ||
    output?.exit_request.requested === true
  ) {
    if (args.exitRefusalReason) {
      return {
        kind: "exit_check",
        reasonCode: `safety_crisis.${args.exitRefusalReason}`,
      };
    }
    return {
      kind: "stop_or_cancel",
      reasonCode: "safety_crisis.exit_to_global_dispatcher",
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
  mustIncludeEmergencyNumbers: boolean;
  emergencyNumbersAlreadyDelivered: boolean;
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
      mustIncludeEmergencyNumbers: args.mustIncludeEmergencyNumbers,
      emergencyNumbersAlreadyDelivered: args.emergencyNumbersAlreadyDelivered,
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
  const explicitCorrectionRelease =
    args.signals.clarified_non_immediate === true &&
    args.sourceRiskBand === "none" &&
    previousDeescalations >= 1 &&
    args.signals.immediate_danger !== true &&
    !meansNearby &&
    !currentRiskSignal;
  const canResolve = explicitCorrectionRelease ||
    (previousPhase === "exit_check" &&
      args.sourceRiskBand !== "critical" &&
      args.sourceRiskBand !== "high" &&
      previousDeescalations >= 1 &&
      noCurrentImmediateDanger &&
      meansSafe &&
      humanSupportAvailable &&
      args.signals.user_currently_alone !== true &&
      !currentRiskSignal);
  const exitRequested = args.dispatcherOutput?.flow_action ===
      "exit_to_global_dispatcher" ||
    args.dispatcherOutput?.flow_action === "wants_to_exit" ||
    args.dispatcherOutput?.exit_request.requested === true;
  const exitRefusalReason = exitRequested && !canResolve
    ? resolutionRefusalReason({
      previousPhase,
      previousDeescalations,
      noCurrentImmediateDanger,
      meansSafe,
      humanSupportAvailable,
      userCurrentlyAlone: args.signals.user_currently_alone === true,
      currentRiskSignal,
    })
    : null;

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

  // En desescalade attestee sans nouveau signal de risque, le band precedent
  // ne sert plus de plancher: sans ca le working_state reste fige a high.
  const deescalating = args.signals.deescalation_evidence === true &&
    !currentRiskSignal;
  const riskBand = phase === "resolved" ? "low" : deescalating
    ? maxRisk(args.sourceRiskBand, minimumRiskForPhase(phase))
    : maxRisk(
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
  const task = visibleTaskKindFor({
    phase,
    riskBand,
    dispatcherOutput: args.dispatcherOutput,
    exitRefusalReason,
  });
  // Gestion de phase de la hotline (R5-B01): on delivre les numeros d'urgence
  // une fois par crise (ou lors d'une re-escalade), puis on bascule vers un
  // soutien emotionnel soutenu au lieu de re-reciter la hotline a chaque tour.
  const responseContractForTurn = safetyResponseContract({
    phase,
    riskBand,
    signals: args.signals,
  });
  const contractForcesNumbers =
    responseContractForTurn.must_include_emergency_numbers ||
    task.kind === "safety_escalation";
  const emergencyNumbersAlreadyDelivered =
    previous.emergency_numbers_delivered === true;
  // Re-escalade = transition d'etat qui doit re-surfacer les numeros, meme si la
  // crise n'a jamais totalement redescendu. On s'appuie sur des transitions
  // d'etat PROPRES (pas les signaux bruts par tour, trop bruites: le dispatcher
  // garde self_harm_intent/immediate_danger vrais tant que le moyen est present,
  // meme quand le user se calme). Declencheurs deterministes:
  //  - le risque remonte a critical depuis plus bas;
  //  - immediate_danger repasse a true apres avoir ete faux;
  //  - la phase remonte vers acute_grounding depuis une phase plus basse
  //    (desescalade attestee puis nouveau pic).
  // Entre deux transitions, on ne re-recite pas la hotline (pref user: soutien
  // emotionnel soutenu). La regle prompt visible ("sauf nouvelle aggravation")
  // reste un filet souple si le user decrit une aggravation nette.
  const reEscalated =
    (riskBand === "critical" && previousRiskBand !== "critical") ||
    (args.signals.immediate_danger === true &&
      previous.immediate_danger !== true) ||
    (phase === "acute_grounding" && previousPhase !== "acute_grounding");
  const mustDeliverNumbersThisTurn = contractForcesNumbers &&
    (!emergencyNumbersAlreadyDelivered || reEscalated);
  // On garde le flag tant que le risque reste eleve; on le remet a false des que
  // la crise redescend, pour qu'une future re-escalade re-delivre les numeros.
  const highRiskPhaseNow = phase === "acute_grounding" ||
    riskBand === "critical" || args.signals.immediate_danger === true;
  const emergencyNumbersDelivered = mustDeliverNumbersThisTurn ||
    (emergencyNumbersAlreadyDelivered && highRiskPhaseNow);
  const statePatchBase = {
    phase,
    risk_band: riskBand,
    emergency_numbers_delivered: emergencyNumbersDelivered,
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
  const merged = mergeSafetyCrisisLocalState({
    previous,
    output: args.dispatcherOutput,
    transition: {
      phase,
      reason_code: exitRefusalReason
        ? `safety_crisis.${exitRefusalReason}`
        : phase === "resolved"
        ? "safety_crisis.resolved_exit"
        : `safety_crisis.${phase}`,
      resolved: phase === "resolved",
    },
    computed: statePatchBase,
    now: new Date().toISOString(),
  });
  const visibleTask = buildVisibleTask({
    kind: task.kind,
    phase,
    riskBand,
    signals: args.signals,
    statePatch: merged.statePatch,
    previousState: previous,
    dispatcherOutput: args.dispatcherOutput,
    currentUserMessage: args.currentUserMessage,
    noteInformationInbound: args.noteInformationInbound,
    mustIncludeEmergencyNumbers: mustDeliverNumbersThisTurn,
    emergencyNumbersAlreadyDelivered,
  });

  return {
    phase,
    riskBand,
    statePatch: {
      ...merged.statePatch,
      visible_task: visibleTask,
    },
    visibleTask,
    exitMemo,
    reasonCode: task.reasonCode,
    stateMutationAudit: merged.audit,
  };
}
