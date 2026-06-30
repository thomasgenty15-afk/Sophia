import type {
  WhatsAppOnboardingLocalDecision,
  WhatsAppOnboardingLocalState,
  WhatsAppOnboardingPlanProjection,
  WhatsAppOnboardingPreferenceKey,
  WhatsAppOnboardingPreferenceUpdate,
  WhatsAppOnboardingReducerInput,
  WhatsAppOnboardingReducerResult,
  WhatsAppOnboardingState,
  WhatsAppOnboardingStateMutationAudit,
  WhatsAppOnboardingVisibleTaskKind,
} from "./contract.ts";

export const WHATSAPP_ONBOARDING_STATES = [
  "awaiting_plan_finalization",
  "awaiting_plan_finalization_support",
  "onboarding_pref_tone",
  "onboarding_pref_challenge",
  "onboarding_pref_questions",
  "onboarding_plan_creation_feedback",
  "onboarding_topic_choice",
] as const;

export function isWhatsAppOnboardingLocalState(
  value: unknown,
): value is WhatsAppOnboardingState {
  return (WHATSAPP_ONBOARDING_STATES as readonly string[]).includes(
    String(value ?? "").trim(),
  );
}

export function planReadyForWhatsAppOnboarding(
  projection: WhatsAppOnboardingPlanProjection,
): boolean {
  return projection.status === "active" ||
    projection.status === "ready_pending_activation" ||
    projection.is_plan_ready_for_onboarding === true;
}

export const WHATSAPP_ONBOARDING_SERVER_OWNED_FIELDS = [
  "reason_code",
  "visible_task",
  "flow_action",
  "current_whatsapp_state",
  "next_whatsapp_state",
  "current_preference_key",
  "plan_status",
  "plan_ready",
  "active_subflow_context",
  "note_information",
  "activation_note_information",
  "exit_memo",
  "local_state_summary",
  "previous_flow_summary",
  "updated_at",
] as const;

type WhatsAppOnboardingReducerCoreResult = Omit<
  WhatsAppOnboardingReducerResult,
  "local_state" | "state_mutation_audit"
>;

function parseObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function isVisibleTask(
  value: unknown,
): value is WhatsAppOnboardingVisibleTaskKind {
  return [
    "plan_wait",
    "plan_draft_ready_confirm_on_web",
    "plan_ready_resume_preferences",
    "ask_tone",
    "preference_saved_next_challenge",
    "preference_saved_next_questions",
    "preference_skipped",
    "ask_plan_feedback",
    "ask_topic_choice",
    "complete_to_plan",
    "complete_to_global",
    "blocked_exit_before_plan_ready",
    "stop_after_plan_ready",
    "progress_attempt_blocked",
    "repeat_question",
    "technical_blocked",
    "safety",
  ].includes(String(value ?? ""));
}

function isFlowAction(
  value: unknown,
): value is WhatsAppOnboardingLocalDecision["flow_action"] {
  return [
    "plan_not_ready_wait",
    "plan_ready_resume_preferences",
    "answer_tone",
    "answer_challenge",
    "answer_questions",
    "skip_optional_preference",
    "answer_plan_feedback",
    "answer_topic_choice",
    "repeat_current_question",
    "progress_attempt_during_onboarding",
    "blocked_exit_before_plan_ready",
    "exit_to_global_dispatcher",
    "complete_onboarding",
    "safety_preempt",
    "technical_blocked",
  ].includes(String(value ?? ""));
}

function isPlanStatus(
  value: unknown,
): value is WhatsAppOnboardingPlanProjection["status"] {
  return [
    "not_started",
    "generating",
    "missing",
    "draft_pending_confirmation",
    "ready_pending_activation",
    "active",
    "unknown",
  ].includes(String(value ?? ""));
}

function isReducerStatus(
  value: unknown,
): value is WhatsAppOnboardingReducerResult["status"] {
  return [
    "owned",
    "exit_to_global_dispatcher",
    "inline_tool",
    "safety_preempt",
    "technical_blocked",
  ].includes(String(value ?? ""));
}

function boolValue(value: unknown): boolean {
  return value === true;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function hasValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function compactSummary(parts: Array<string | null | undefined>): string {
  return uniqueStrings(parts.filter((part): part is string => Boolean(part)))
    .join("; ");
}

export function readWhatsAppOnboardingLocalState(
  value: unknown,
): WhatsAppOnboardingLocalState | null {
  const root = parseObject(value);
  if (Object.keys(root).length === 0) return null;
  const activeSubflow = parseObject(root.active_subflow_context);
  const status = isReducerStatus(activeSubflow.status)
    ? activeSubflow.status
    : null;
  return {
    version: 1,
    reason_code: stringValue(root.reason_code),
    visible_task: isVisibleTask(root.visible_task) ? root.visible_task : null,
    flow_action: isFlowAction(root.flow_action) ? root.flow_action : null,
    current_whatsapp_state: isWhatsAppOnboardingLocalState(
        root.current_whatsapp_state,
      )
      ? root.current_whatsapp_state
      : null,
    next_whatsapp_state:
      isWhatsAppOnboardingLocalState(root.next_whatsapp_state)
        ? root.next_whatsapp_state
        : null,
    current_preference_key: [
        "coach.tone",
        "coach.challenge_level",
        "coach.question_tendency",
      ].includes(String(root.current_preference_key ?? ""))
      ? root.current_preference_key as WhatsAppOnboardingPreferenceKey
      : null,
    plan_status: isPlanStatus(root.plan_status) ? root.plan_status : "unknown",
    plan_ready: boolValue(root.plan_ready),
    active_subflow_context: Object.keys(activeSubflow).length > 0
      ? {
        target_dispatcher: stringValue(activeSubflow.target_dispatcher),
        status,
        reason_code: stringValue(activeSubflow.reason_code),
      }
      : null,
    note_information: parseObject(root.note_information).source_flow_id
      ? root
        .note_information as WhatsAppOnboardingLocalState["note_information"]
      : null,
    activation_note_information:
      parseObject(root.activation_note_information).source_flow_id
        ? root.activation_note_information as WhatsAppOnboardingLocalState[
          "activation_note_information"
        ]
        : null,
    exit_memo: parseObject(root.exit_memo).reason
      ? root.exit_memo as WhatsAppOnboardingLocalState["exit_memo"]
      : null,
    local_state_summary: stringValue(root.local_state_summary) ??
      stringValue(root.reason_code),
    previous_flow_summary: stringValue(root.previous_flow_summary),
    updated_at: stringValue(root.updated_at),
  };
}

function validPreferenceValue(
  key: WhatsAppOnboardingPreferenceKey,
  value: string | null,
): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (key === "coach.tone") {
    return ["soft", "warm_direct", "direct"].includes(raw) ? raw : null;
  }
  if (key === "coach.challenge_level") {
    return ["low", "balanced", "high"].includes(raw) ? raw : null;
  }
  if (key === "coach.question_tendency") {
    return ["low", "normal", "high"].includes(raw) ? raw : null;
  }
  return null;
}

export function coachPreferenceLabel(
  key: WhatsAppOnboardingPreferenceKey,
  value: string,
): string {
  if (key === "coach.tone") {
    return value === "soft"
      ? "Doux"
      : value === "direct"
      ? "Très direct"
      : "Bienveillant ferme";
  }
  if (key === "coach.challenge_level") {
    return value === "low" ? "Léger" : value === "high" ? "Élevé" : "Équilibré";
  }
  if (key === "coach.question_tendency") {
    return value === "low"
      ? "Peu de questions"
      : value === "high"
      ? "Très questionnant"
      : "Normal";
  }
  return value;
}

function nextStateForPreference(
  state: WhatsAppOnboardingState,
): WhatsAppOnboardingState {
  if (state === "onboarding_pref_tone") return "onboarding_pref_challenge";
  if (state === "onboarding_pref_challenge") return "onboarding_pref_questions";
  if (state === "onboarding_pref_questions") {
    return "onboarding_plan_creation_feedback";
  }
  return state;
}

function visibleTaskForPreference(
  state: WhatsAppOnboardingState,
): WhatsAppOnboardingVisibleTaskKind {
  if (state === "onboarding_pref_tone") {
    return "preference_saved_next_challenge";
  }
  if (state === "onboarding_pref_challenge") {
    return "preference_saved_next_questions";
  }
  return "ask_plan_feedback";
}

function sanitizedPreferenceWrites(
  updates: WhatsAppOnboardingPreferenceUpdate[],
): WhatsAppOnboardingPreferenceUpdate[] {
  return updates
    .filter((update) => update.status === "locked")
    .map((update) => {
      const value = validPreferenceValue(update.key, update.locked_value);
      if (!value) return null;
      return {
        ...update,
        locked_value: value,
        label: update.label || coachPreferenceLabel(update.key, value),
        needs_user_confirmation: false,
      };
    })
    .filter(Boolean) as WhatsAppOnboardingPreferenceUpdate[];
}

function baseBlockedEffects(reasonCode: string) {
  return [
    { type: "track_progress_plan_item", reason_code: reasonCode },
    { type: "global_dispatcher", reason_code: reasonCode },
  ];
}

function stateFieldValue(
  state: WhatsAppOnboardingLocalState | null,
  field: string,
): unknown {
  return state ? (state as unknown as Record<string, unknown>)[field] : null;
}

function stateFieldChanged(
  previous: WhatsAppOnboardingLocalState | null,
  next: WhatsAppOnboardingLocalState,
  field: string,
): boolean {
  return JSON.stringify(stateFieldValue(previous, field) ?? null) !==
    JSON.stringify((next as unknown as Record<string, unknown>)[field] ?? null);
}

export function mergeWhatsAppOnboardingLocalState(params: {
  previous: WhatsAppOnboardingLocalState | null | undefined;
  output: WhatsAppOnboardingReducerCoreResult;
  decision: WhatsAppOnboardingLocalDecision;
  whatsappState: WhatsAppOnboardingState;
  planProjection: WhatsAppOnboardingPlanProjection;
  nowIso: string;
}): {
  local_state: WhatsAppOnboardingLocalState;
  state_mutation_audit: WhatsAppOnboardingStateMutationAudit;
} {
  const previous = params.previous ?? null;
  const currentPreferenceKey = preferenceKeyForState(params.whatsappState);
  const transitionStatus = params.output.status;
  const transitionTarget = params.output.note_information?.target_dispatcher ??
    null;
  const transitionAllowsNote =
    transitionStatus === "exit_to_global_dispatcher" ||
    transitionStatus === "safety_preempt";
  const transitionAllowsExitMemo = Boolean(params.output.exit_memo);
  const transitionAllowsSubflow = transitionAllowsNote;
  const transitionClearsTerminalState = params.output.mark_done &&
    transitionStatus === "owned";

  const next: WhatsAppOnboardingLocalState = {
    version: 1,
    reason_code: params.output.reason_code,
    visible_task: params.output.visible_task,
    flow_action: params.decision.flow_action,
    current_whatsapp_state: params.whatsappState,
    next_whatsapp_state: params.output.next_whatsapp_state,
    current_preference_key: currentPreferenceKey,
    plan_status: params.planProjection.status,
    plan_ready: planReadyForWhatsAppOnboarding(params.planProjection),
    active_subflow_context: transitionAllowsSubflow
      ? {
        target_dispatcher: transitionTarget,
        status: transitionStatus,
        reason_code: params.output.reason_code,
      }
      : transitionClearsTerminalState
      ? null
      : previous?.active_subflow_context ?? null,
    note_information: transitionAllowsNote
      ? params.output.note_information
      : transitionClearsTerminalState
      ? null
      : previous?.note_information ?? null,
    activation_note_information: previous?.activation_note_information ?? null,
    exit_memo: transitionAllowsExitMemo
      ? params.output.exit_memo
      : transitionClearsTerminalState
      ? null
      : previous?.exit_memo ?? null,
    local_state_summary: compactSummary([
      `whatsapp_state=${params.whatsappState}`,
      `flow_action=${params.decision.flow_action}`,
      `status=${params.output.status}`,
      `reason_code=${params.output.reason_code}`,
      `visible_task=${params.output.visible_task}`,
      `plan_status=${params.planProjection.status}`,
      `plan_ready=${planReadyForWhatsAppOnboarding(params.planProjection)}`,
    ]),
    previous_flow_summary: params.output.exit_memo?.flow_summary ??
      previous?.previous_flow_summary ?? null,
    updated_at: params.nowIso,
  };

  const modifiedFields = uniqueStrings(
    params.decision.state_mutation_request?.modified_fields ?? [],
  );
  const clearFields = uniqueStrings(
    params.decision.state_mutation_request?.clear_fields ?? [],
  );
  const allowedDeclaredMutationFields = new Set<string>([
    "reason_code",
    "visible_task",
    "flow_action",
    "current_whatsapp_state",
    "next_whatsapp_state",
    "current_preference_key",
    "plan_status",
    "plan_ready",
    "local_state_summary",
    "updated_at",
  ]);
  if (transitionAllowsNote) {
    allowedDeclaredMutationFields.add("note_information");
  }
  if (transitionAllowsExitMemo) allowedDeclaredMutationFields.add("exit_memo");
  if (transitionAllowsSubflow) {
    allowedDeclaredMutationFields.add("active_subflow_context");
  }
  if (transitionClearsTerminalState) {
    allowedDeclaredMutationFields.add("note_information");
    allowedDeclaredMutationFields.add("exit_memo");
    allowedDeclaredMutationFields.add("active_subflow_context");
  }

  const serverFields = [...WHATSAPP_ONBOARDING_SERVER_OWNED_FIELDS];
  const rejectedChanges: WhatsAppOnboardingStateMutationAudit[
    "rejected_changes"
  ] = [];
  const restoredFields: string[] = [];
  for (const field of modifiedFields) {
    if (!serverFields.includes(field as typeof serverFields[number])) continue;
    if (allowedDeclaredMutationFields.has(field)) continue;
    rejectedChanges.push({
      field,
      operation: "modify",
      reason_code: "server_owned_field_mutation_not_allowed",
    });
    if (hasValue(stateFieldValue(previous, field))) restoredFields.push(field);
  }
  for (const field of clearFields) {
    if (!serverFields.includes(field as typeof serverFields[number])) continue;
    if (
      allowedDeclaredMutationFields.has(field) &&
      ["note_information", "exit_memo", "active_subflow_context"].includes(
        field,
      )
    ) {
      continue;
    }
    rejectedChanges.push({
      field,
      operation: "clear",
      reason_code: "server_owned_field_clear_not_allowed",
    });
    if (hasValue(stateFieldValue(previous, field))) restoredFields.push(field);
  }

  const appliedFields = serverFields.filter((field) =>
    stateFieldChanged(previous, next, field)
  );
  const preservedFields = serverFields.filter((field) =>
    hasValue(stateFieldValue(previous, field)) &&
    !stateFieldChanged(previous, next, field)
  );
  const clearedFields = serverFields.filter((field) =>
    hasValue(stateFieldValue(previous, field)) &&
    !hasValue((next as unknown as Record<string, unknown>)[field])
  );

  return {
    local_state: next,
    state_mutation_audit: {
      server_owned_fields: serverFields,
      modified_fields_declared: modifiedFields,
      clear_fields_declared: clearFields,
      applied_fields: appliedFields,
      preserved_fields: preservedFields,
      restored_fields: uniqueStrings(restoredFields),
      cleared_fields: clearedFields,
      rejected_changes: rejectedChanges,
    },
  };
}

function reduceWhatsAppOnboardingDecisionCore(
  input: WhatsAppOnboardingReducerInput,
): WhatsAppOnboardingReducerCoreResult {
  const decision = input.decision;
  const planReady = planReadyForWhatsAppOnboarding(input.planProjection);
  const nowIso = input.nowIso ?? new Date().toISOString();
  const blockedEffects = baseBlockedEffects(
    "whatsapp_onboarding_local_flow_owned_turn",
  );

  if (decision.flow_action === "safety_preempt") {
    return {
      status: "safety_preempt",
      reason_code: "whatsapp_onboarding_safety_preempt",
      next_whatsapp_state: null,
      visible_task: "safety",
      preference_writes: [],
      mark_done: false,
      completion_mode: "not_done",
      exit_memo: {
        reason: "safety",
        flow_summary: decision.exit_memo_request.flow_summary,
        handoff_hint_for_global_dispatcher:
          decision.exit_memo_request.handoff_hint_for_global_dispatcher,
        handoff_justification_for_global_dispatcher: decision.exit_memo_request
          .handoff_justification_for_global_dispatcher,
        at: nowIso,
      },
      note_information: decision.note_information,
      allow_global_dispatcher: false,
      allow_track_progress_plan_item: false,
      blocked_effects: [
        { type: "track_progress_plan_item", reason_code: "safety_preempt" },
        { type: "global_dispatcher", reason_code: "safety_preempt" },
      ],
      risk_assessment: decision.risk_assessment,
    };
  }

  if (decision.flow_action === "technical_blocked") {
    return {
      status: "technical_blocked",
      reason_code: "whatsapp_onboarding_local_dispatcher_technical_blocked",
      next_whatsapp_state: input.whatsappState,
      visible_task: "technical_blocked",
      preference_writes: [],
      mark_done: false,
      completion_mode: "not_done",
      exit_memo: null,
      note_information: null,
      allow_global_dispatcher: false,
      allow_track_progress_plan_item: false,
      blocked_effects: blockedEffects,
      risk_assessment: decision.risk_assessment,
    };
  }

  if (decision.flow_action === "progress_attempt_during_onboarding") {
    return {
      status: "exit_to_global_dispatcher",
      reason_code: "whatsapp_onboarding_progress_attempt_direct_effect_allowed",
      next_whatsapp_state: input.whatsappState,
      visible_task: "stop_after_plan_ready",
      preference_writes: [],
      mark_done: false,
      completion_mode: "not_done",
      exit_memo: decision.exit_memo_request.needed
        ? {
          reason: "topic_change",
          flow_summary: decision.exit_memo_request.flow_summary,
          handoff_hint_for_global_dispatcher:
            decision.exit_memo_request.handoff_hint_for_global_dispatcher ??
              "track_progress_plan_item",
          handoff_justification_for_global_dispatcher:
            decision.exit_memo_request
              .handoff_justification_for_global_dispatcher ??
              "User reported completed progress during WhatsApp onboarding.",
          at: nowIso,
        }
        : null,
      note_information: decision.note_information,
      allow_global_dispatcher: true,
      allow_track_progress_plan_item: true,
      blocked_effects: [],
      risk_assessment: decision.risk_assessment,
    };
  }

  if (
    (input.whatsappState === "awaiting_plan_finalization" ||
      input.whatsappState === "awaiting_plan_finalization_support") &&
    input.planProjection.status === "draft_pending_confirmation"
  ) {
    return {
      status: "owned",
      reason_code: "whatsapp_onboarding_plan_draft_pending_confirmation",
      next_whatsapp_state: input.whatsappState,
      visible_task: "plan_draft_ready_confirm_on_web",
      preference_writes: [],
      mark_done: false,
      completion_mode: "not_done",
      exit_memo: null,
      note_information: null,
      allow_global_dispatcher: false,
      allow_track_progress_plan_item: false,
      blocked_effects: blockedEffects,
      risk_assessment: decision.risk_assessment,
    };
  }

  const requestedExit = decision.flow_action === "exit_to_global_dispatcher";
  if (requestedExit && !planReady) {
    return {
      status: "owned",
      reason_code: "whatsapp_onboarding_exit_blocked_before_plan_ready",
      next_whatsapp_state: input.whatsappState,
      visible_task: "blocked_exit_before_plan_ready",
      preference_writes: [],
      mark_done: false,
      completion_mode: "not_done",
      exit_memo: null,
      note_information: null,
      allow_global_dispatcher: false,
      allow_track_progress_plan_item: false,
      blocked_effects: blockedEffects,
      risk_assessment: decision.risk_assessment,
    };
  }

  if (requestedExit && planReady) {
    const targetDispatcher = String(
      decision.note_information?.target_dispatcher ?? "",
    ).trim();
    if (!targetDispatcher) {
      return {
        status: "owned",
        reason_code: "exit_note_information_missing",
        next_whatsapp_state: input.whatsappState,
        visible_task: "repeat_question",
        preference_writes: [],
        mark_done: false,
        completion_mode: "not_done",
        exit_memo: null,
        note_information: null,
        allow_global_dispatcher: false,
        allow_track_progress_plan_item: false,
        blocked_effects: [
          {
            type: "global_dispatcher",
            reason_code: "note_information_missing",
          },
          ...blockedEffects,
        ],
        risk_assessment: decision.risk_assessment,
      };
    }
  }

  if (requestedExit && planReady) {
    return {
      status: "exit_to_global_dispatcher",
      reason_code: "whatsapp_onboarding_local_exit_to_global_dispatcher",
      next_whatsapp_state: null,
      visible_task: "complete_to_global",
      preference_writes: [],
      mark_done: true,
      completion_mode: "deferred_after_plan_ready",
      exit_memo: {
        reason: decision.exit_memo_request.exit_reason === "none"
          ? "frustration"
          : decision.exit_memo_request.exit_reason,
        flow_summary: decision.exit_memo_request.flow_summary,
        handoff_hint_for_global_dispatcher:
          decision.exit_memo_request.handoff_hint_for_global_dispatcher ||
          decision.topic_choice.handoff_hint_for_global_dispatcher,
        handoff_justification_for_global_dispatcher: decision.exit_memo_request
          .handoff_justification_for_global_dispatcher ||
          decision.topic_choice.handoff_justification_for_global_dispatcher,
        at: nowIso,
      },
      note_information: decision.note_information,
      allow_global_dispatcher: true,
      allow_track_progress_plan_item: false,
      blocked_effects: [{
        type: "track_progress_plan_item",
        reason_code: "onboarding_exit",
      }],
      risk_assessment: decision.risk_assessment,
    };
  }

  if (
    input.whatsappState === "awaiting_plan_finalization" ||
    input.whatsappState === "awaiting_plan_finalization_support"
  ) {
    if (!planReady) {
      return {
        status: "owned",
        reason_code: "whatsapp_onboarding_plan_not_ready",
        next_whatsapp_state: input.whatsappState,
        visible_task: decision.flow_action === "blocked_exit_before_plan_ready"
          ? "blocked_exit_before_plan_ready"
          : "plan_wait",
        preference_writes: [],
        mark_done: false,
        completion_mode: "not_done",
        exit_memo: null,
        note_information: null,
        allow_global_dispatcher: false,
        allow_track_progress_plan_item: false,
        blocked_effects: blockedEffects,
        risk_assessment: decision.risk_assessment,
      };
    }
    return {
      status: "owned",
      reason_code: "whatsapp_onboarding_plan_ready_resume_preferences",
      next_whatsapp_state: "onboarding_pref_tone",
      visible_task: "plan_ready_resume_preferences",
      preference_writes: [],
      mark_done: false,
      completion_mode: "not_done",
      exit_memo: null,
      note_information: null,
      allow_global_dispatcher: false,
      allow_track_progress_plan_item: false,
      blocked_effects: blockedEffects,
      risk_assessment: decision.risk_assessment,
    };
  }

  if (
    input.whatsappState === "onboarding_pref_tone" ||
    input.whatsappState === "onboarding_pref_challenge" ||
    input.whatsappState === "onboarding_pref_questions"
  ) {
    const writes = sanitizedPreferenceWrites(decision.preference_updates);
    if (decision.flow_action === "skip_optional_preference") {
      return {
        status: "owned",
        reason_code: "whatsapp_onboarding_preference_skipped",
        next_whatsapp_state: nextStateForPreference(input.whatsappState),
        visible_task: "preference_skipped",
        preference_writes: [],
        mark_done: false,
        completion_mode: "not_done",
        exit_memo: null,
        note_information: null,
        allow_global_dispatcher: false,
        allow_track_progress_plan_item: false,
        blocked_effects: blockedEffects,
        risk_assessment: decision.risk_assessment,
      };
    }
    if (writes.length === 0) {
      return {
        status: "owned",
        reason_code: "whatsapp_onboarding_preference_needs_repeat",
        next_whatsapp_state: input.whatsappState,
        visible_task: "repeat_question",
        preference_writes: [],
        mark_done: false,
        completion_mode: "not_done",
        exit_memo: null,
        note_information: null,
        allow_global_dispatcher: false,
        allow_track_progress_plan_item: false,
        blocked_effects: blockedEffects,
        risk_assessment: decision.risk_assessment,
      };
    }
    return {
      status: "owned",
      reason_code: "whatsapp_onboarding_preference_saved",
      next_whatsapp_state: nextStateForPreference(input.whatsappState),
      visible_task: visibleTaskForPreference(input.whatsappState),
      preference_writes: writes,
      mark_done: false,
      completion_mode: "not_done",
      exit_memo: null,
      note_information: null,
      allow_global_dispatcher: false,
      allow_track_progress_plan_item: false,
      blocked_effects: blockedEffects,
      risk_assessment: decision.risk_assessment,
    };
  }

  if (input.whatsappState === "onboarding_plan_creation_feedback") {
    return {
      status: "owned",
      reason_code: "whatsapp_onboarding_plan_feedback_received",
      next_whatsapp_state: "onboarding_topic_choice",
      visible_task: "ask_topic_choice",
      preference_writes: [],
      mark_done: false,
      completion_mode: "not_done",
      exit_memo: null,
      note_information: null,
      allow_global_dispatcher: false,
      allow_track_progress_plan_item: false,
      blocked_effects: blockedEffects,
      risk_assessment: decision.risk_assessment,
    };
  }

  if (input.whatsappState === "onboarding_topic_choice") {
    const toGlobal = decision.topic_choice.status === "other_topic" ||
      decision.flow_action === "exit_to_global_dispatcher";
    return {
      status: toGlobal ? "exit_to_global_dispatcher" : "owned",
      reason_code: toGlobal
        ? "whatsapp_onboarding_complete_to_global_dispatcher"
        : "whatsapp_onboarding_complete_to_plan",
      next_whatsapp_state: null,
      visible_task: toGlobal ? "complete_to_global" : "complete_to_plan",
      preference_writes: [],
      mark_done: true,
      completion_mode: "completed",
      exit_memo: toGlobal
        ? {
          reason: "completed",
          flow_summary: decision.exit_memo_request.flow_summary,
          handoff_hint_for_global_dispatcher:
            decision.topic_choice.handoff_hint_for_global_dispatcher ||
            decision.exit_memo_request.handoff_hint_for_global_dispatcher,
          handoff_justification_for_global_dispatcher:
            decision.topic_choice.handoff_justification_for_global_dispatcher ||
            decision.exit_memo_request
              .handoff_justification_for_global_dispatcher,
          at: nowIso,
        }
        : null,
      note_information: toGlobal ? decision.note_information : null,
      allow_global_dispatcher: toGlobal,
      allow_track_progress_plan_item: false,
      blocked_effects: toGlobal
        ? [{
          type: "track_progress_plan_item",
          reason_code: "onboarding_complete_exit",
        }]
        : blockedEffects,
      risk_assessment: decision.risk_assessment,
    };
  }

  return {
    status: "technical_blocked",
    reason_code: "whatsapp_onboarding_unknown_state",
    next_whatsapp_state: input.whatsappState,
    visible_task: "technical_blocked",
    preference_writes: [],
    mark_done: false,
    completion_mode: "not_done",
    exit_memo: null,
    note_information: null,
    allow_global_dispatcher: false,
    allow_track_progress_plan_item: false,
    blocked_effects: blockedEffects,
    risk_assessment: decision.risk_assessment,
  };
}

export function reduceWhatsAppOnboardingDecision(
  input: WhatsAppOnboardingReducerInput,
): WhatsAppOnboardingReducerResult {
  const core = reduceWhatsAppOnboardingDecisionCore(input);
  const nowIso = input.nowIso ?? new Date().toISOString();
  const merged = mergeWhatsAppOnboardingLocalState({
    previous: input.previousLocalState ?? null,
    output: core,
    decision: input.decision,
    whatsappState: input.whatsappState,
    planProjection: input.planProjection,
    nowIso,
  });
  return {
    ...core,
    ...merged,
  };
}

export function preferenceKeyForState(
  state: WhatsAppOnboardingState,
): WhatsAppOnboardingPreferenceKey | null {
  if (state === "onboarding_pref_tone") return "coach.tone";
  if (state === "onboarding_pref_challenge") return "coach.challenge_level";
  if (state === "onboarding_pref_questions") return "coach.question_tendency";
  return null;
}
