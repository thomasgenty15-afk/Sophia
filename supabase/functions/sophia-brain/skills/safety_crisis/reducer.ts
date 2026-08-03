import {
  createNoteInformation,
  type NoteInformation,
  noteInformationRecommendedNextFocus,
  noteInformationSummary,
} from "../../contracts/note_information.v1.ts";
import {
  crisisCountryFromLocale,
  LEGACY_FRENCH_BRANCH_COUNTRY,
  resolveSafetyResourceNumbers,
} from "../../../_shared/keel/crisis_resources.ts";
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
  /** P7-A: bande pregate none/low sans nouveau signal = désescalade attestée
   * même quand le dispatcher local oublie deescalation_evidence (tour bénin
   * « et mon rappel ? » — paul-p6reval T15/T16, rose-hard19 T13/T14). */
  bandDeescalation: boolean;
}): number {
  if (hasNewRiskSignal(args.signals)) return 0;
  if (!args.signals.deescalation_evidence && !args.bandDeescalation) return 0;
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

/**
 * W3.3 — emergency contacts resolved BY COUNTRY (`_shared/keel/crisis_resources.ts`).
 *
 * Priority: explicit country > region subtag of the turn locale > the branch's
 * declared default. A locale that resolves to no seeded country (say 'de-DE')
 * deliberately does NOT fall back to France: it lands on the loud
 * international set, because handing 3114 to a German user is the bug this
 * whole lot exists to remove.
 *
 * The conjunction is French because these sentences are French (R3: the
 * language of the sentence is the caller's business, not the resolver's).
 */
function safetyResourceNumbersFor(args: {
  userCountry?: string | null;
  userLocale?: string | null;
}) {
  const country = args.userCountry
    ? args.userCountry
    : args.userLocale
    ? crisisCountryFromLocale(args.userLocale)
    : LEGACY_FRENCH_BRANCH_COUNTRY;
  return resolveSafetyResourceNumbers(country, { conjunction: "ou" });
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
  benignRecallRequest?: { asked: boolean; facts: string[] } | null;
  userCountry?: string | null;
  userLocale?: string | null;
}): SafetyCrisisConversationContext {
  const safetyResourceNumbers = safetyResourceNumbersFor(args);
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
      benign_recall_request: args.benignRecallRequest ?? null,
    },
    next_focus: nextFocusFor(args.kind),
    // W3.3: resolved by country, never hardcoded. A US student in crisis was
    // being told to call 3114, which does not exist in the US.
    safety_resources: {
      emergency_numbers: safetyResourceNumbers.emergency_numbers,
      suicide_prevention_number:
        safetyResourceNumbers.suicide_prevention_number,
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
      // P6-B (paul-hard21 T14): registre proportionné — aucune consigne sur
      // des MOYENS (« éloigne-toi de », « mets hors de portée ») quand aucun
      // moyen n'a été évoqué dans la conversation.
      ...(args.statePatch.has_means_nearby == null
        ? [
          "do not give instructions about means (moving away from objects, putting things out of reach) when no means were ever mentioned in this conversation",
        ]
        : []),
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
  // P7-A: la résolution PRIME sur le boundary produit — sur le tour où la
  // crise se résout ET où le user demande un effet bénin, le flow sort et le
  // redispatch sert la demande ; annoncer un énième « je diffère » sur ce
  // tour contredirait la sortie (rose-hard19 T14: 3e différé sans mécanisme).
  if (args.phase === "resolved") {
    return {
      kind: "resolved_exit",
      reasonCode: "safety_crisis.resolved_exit",
    };
  }
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
  benignRecallRequest?: { asked: boolean; facts: string[] } | null;
  userCountry?: string | null;
  userLocale?: string | null;
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
      benignRecallRequest: args.benignRecallRequest,
      userCountry: args.userCountry,
      userLocale: args.userLocale,
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
  benignRecallRequest?: { asked: boolean; facts: string[] } | null;
  /** W3.3: ISO 3166-1 alpha-2 of the student, when the turn carries one. */
  userCountry?: string | null;
  /** W3.3: BCP-47 locale of the turn; its region subtag names the country. */
  userLocale?: string | null;
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
  const currentRiskSignal = hasNewRiskSignal(args.signals);
  // P7-A (paul-p6reval R1-B03, rose-hard19 R1-B03): la sortie exigeait que
  // les signaux du TOUR COURANT re-confirment des faits déjà établis — quand
  // le user est passé à autre chose (« et mon rappel kiné ? »), le dispatcher
  // local n'émet plus ces signaux et la machine ne pouvait JAMAIS résoudre.
  // Les faits PERSISTÉS comptent : un immediate_danger=false acquis reste
  // acquis tant que le tour courant ne le contredit pas. Pour une idéation
  // passive où le danger n'a jamais été affirmé ni nié (null des deux côtés),
  // 2 tours consécutifs de désescalade attestée valent absence de danger —
  // même logique que meansNeverInPlay (P6-B).
  // Une lecture INCERTAINE du dispatcher local n'atteste rien: uncertainty
  // high bloque le crédit de désescalade par bande (le plancher tient).
  const bandDeescalation =
    (args.sourceRiskBand === "none" || args.sourceRiskBand === "low") &&
    !currentRiskSignal &&
    args.signals.uncertainty !== "high";
  const consecutiveDeescalatedTurns = nextConsecutiveDeescalatedTurns({
    previous,
    signals: args.signals,
    bandDeescalation,
  });
  const dangerNeverAsserted = previous.immediate_danger == null &&
    args.signals.immediate_danger == null;
  const noCurrentImmediateDanger = args.signals.immediate_danger === false ||
    (previous.immediate_danger === false &&
      args.signals.immediate_danger !== true) ||
    (args.signals.clarified_non_immediate && !meansNearby) ||
    (dangerNeverAsserted && consecutiveDeescalatedTurns >= 2 &&
      !currentRiskSignal);
  // P6-B (paul-hard21 R1-B02): les MOYENS jamais évoqués de toute la crise
  // (aucun signal, aucun fait antérieur) ne bloquent pas la sortie d'une
  // idéation NON-imminente confirmée — exiger que le user parle de moyens
  // pour sortir du flow était le sentry infini observé (refus
  // means_safe_missing sur « je me sens en sécurité, aucune envie de me
  // faire du mal » + tiers présent). Dès qu'un moyen a été évoqué une fois,
  // l'exigence stricte reste entière.
  const meansNeverInPlay = previous.has_means_nearby == null &&
    args.signals.has_means_nearby == null &&
    args.signals.means_moved_away !== true;
  // P7-A: l'absence de danger se lit depuis le fait ÉTABLI (persisté ou
  // jamais-affirmé sur 2 tours désescaladés), plus seulement le signal du
  // tour courant — même relaxation que noCurrentImmediateDanger.
  const meansSafeForExit = meansSafe ||
    (meansNeverInPlay && noCurrentImmediateDanger && !currentRiskSignal);
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
      meansSafeForExit &&
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
      meansSafe: meansSafeForExit,
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
    args.signals.clarified_non_immediate && humanSupportAvailable &&
    meansSafeForExit
  ) {
    phase = "exit_check";
  } else if (
    // P7-A (paul-p6reval R1-B03, rose-hard19 R1-B03): PROMOTION STABILISÉE —
    // les faits de sortie sont tous établis (danger absent — persisté ou
    // jamais affirmé sur 2 tours —, moyens sûrs, soutien humain) et la bande
    // du tour est none/low : la machine avance vers exit_check au lieu de
    // camper en stabilizing. Sans cette branche, l'état collait tant que le
    // dispatcher local n'émettait pas clarified_non_immediate sur un tour où
    // le user parle d'autre chose. Anti-FP : moyens évoqués non sécurisés,
    // nouveau signal ou bande ≥ medium bloquent la promotion.
    (previousPhase === "stabilizing" || previousPhase === "support_contact" ||
      previousPhase === "exit_check") &&
    bandDeescalation && consecutiveDeescalatedTurns >= 1 &&
    noCurrentImmediateDanger && meansSafeForExit && humanSupportAvailable
  ) {
    phase = "exit_check";
  } else if (humanSupportAvailable && !currentRiskSignal) {
    phase = "stabilizing";
  } else if (
    (args.signals.clarified_non_immediate ||
      args.signals.immediate_danger === false) &&
    args.signals.user_currently_alone !== null
  ) {
    // rose-r5 B02: la reponse au triage est CONSOMMEE — danger nie + statut
    // de solitude donne (meme « seule »=oui) ne re-posent JAMAIS la meme
    // question. Le tour suivant appartient au soutien (adresser la solitude,
    // rester avec la personne); le gate side-effects reste actif via la phase.
    phase = "support_contact";
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
  } else if (previousPhase === "entry" && previous.phase == null) {
    // Premiere activation reelle (aucune phase anterieure, pas un etat legacy
    // a phase inconnue) sans aucun fait connu (ideation passive medium): on
    // accueille et on verifie le danger AVANT toute consigne de stabilisation
    // — ouvrir sur un script directif ("reste assis, eloigne les moyens")
    // sur-escalade un tour non imminent (probe chantier S).
    phase = "immediate_risk_check";
  } else {
    phase = "stabilizing";
  }

  // En desescalade attestee sans nouveau signal de risque, le band precedent
  // ne sert plus de plancher: sans ca le working_state reste fige a high.
  // P7-A: la bande pregate none/low compte comme désescalade attestée.
  const deescalating = (args.signals.deescalation_evidence === true ||
    bandDeescalation) &&
    !currentRiskSignal;
  const riskBand = phase === "resolved" ? "low" : deescalating
    ? maxRisk(args.sourceRiskBand, minimumRiskForPhase(phase))
    : maxRisk(
      args.sourceRiskBand,
      previousRiskBand,
      minimumRiskForPhase(phase),
    );
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
    benignRecallRequest: args.benignRecallRequest,
    userCountry: args.userCountry,
    userLocale: args.userLocale,
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
