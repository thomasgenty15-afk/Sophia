import type {
  WhatsAppOnboardingLocalDecision,
  WhatsAppOnboardingPlanProjection,
  WhatsAppOnboardingPreferenceKey,
  WhatsAppOnboardingPreferenceUpdate,
  WhatsAppOnboardingReducerInput,
  WhatsAppOnboardingReducerResult,
  WhatsAppOnboardingState,
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
    return value === "low"
      ? "Léger"
      : value === "high"
      ? "Élevé"
      : "Équilibré";
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

export function reduceWhatsAppOnboardingDecision(
  input: WhatsAppOnboardingReducerInput,
): WhatsAppOnboardingReducerResult {
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
        handoff_justification_for_global_dispatcher:
          decision.exit_memo_request
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
      status: "owned",
      reason_code: "whatsapp_onboarding_progress_attempt_blocked",
      next_whatsapp_state: input.whatsappState,
      visible_task: "progress_attempt_blocked",
      preference_writes: [],
      mark_done: false,
      completion_mode: "not_done",
      exit_memo: null,
      note_information: null,
      allow_global_dispatcher: false,
      allow_track_progress_plan_item: false,
      blocked_effects: [
        { type: "track_progress_plan_item", reason_code: "onboarding_active" },
        { type: "global_dispatcher", reason_code: "onboarding_active" },
      ],
      risk_assessment: decision.risk_assessment,
    };
  }

  if (
    decision.flow_action === "get_info_product" ||
    decision.flow_action === "get_info_db"
  ) {
    return {
      status: "inline_tool",
      reason_code: decision.flow_action === "get_info_product"
        ? "whatsapp_onboarding_inline_product_info"
        : "whatsapp_onboarding_inline_status_info",
      next_whatsapp_state: input.whatsappState,
      visible_task: decision.flow_action === "get_info_product"
        ? "inline_product_return"
        : "inline_status_return",
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
  const requestedLocalHandoff = decision.flow_action === "handoff_to_local_flow";
  const requestedStop = decision.flow_action === "stop_local_no_handoff";
  if ((requestedExit || requestedLocalHandoff || requestedStop) && !planReady) {
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

  if (requestedLocalHandoff && planReady) {
    return {
      status: "handoff_to_local_flow",
      reason_code: "whatsapp_onboarding_handoff_to_local_flow",
      next_whatsapp_state: null,
      visible_task: "complete_to_global",
      preference_writes: [],
      mark_done: true,
      completion_mode: "deferred_after_plan_ready",
      exit_memo: {
        reason: decision.exit_memo_request.exit_reason === "none"
          ? "topic_change"
          : decision.exit_memo_request.exit_reason,
        flow_summary: decision.exit_memo_request.flow_summary,
        handoff_hint_for_global_dispatcher:
          decision.exit_memo_request.handoff_hint_for_global_dispatcher ||
          decision.topic_choice.handoff_hint_for_global_dispatcher,
        handoff_justification_for_global_dispatcher:
          decision.exit_memo_request
            .handoff_justification_for_global_dispatcher ||
          decision.topic_choice.handoff_justification_for_global_dispatcher,
        at: nowIso,
      },
      note_information: decision.note_information,
      allow_global_dispatcher: false,
      allow_track_progress_plan_item: false,
      blocked_effects: [
        { type: "track_progress_plan_item", reason_code: "onboarding_handoff" },
        { type: "global_dispatcher", reason_code: "handoff_to_local_flow" },
      ],
      risk_assessment: decision.risk_assessment,
    };
  }

  if (requestedStop && planReady) {
    return {
      status: "stop_local_no_handoff",
      reason_code: "whatsapp_onboarding_local_stop_after_plan_ready",
      next_whatsapp_state: null,
      visible_task: "stop_after_plan_ready",
      preference_writes: [],
      mark_done: true,
      completion_mode: "stopped_after_plan_ready",
      exit_memo: null,
      note_information: null,
      allow_global_dispatcher: false,
      allow_track_progress_plan_item: false,
      blocked_effects: [
        { type: "track_progress_plan_item", reason_code: "onboarding_local_stop" },
        { type: "global_dispatcher", reason_code: "stop_local_no_handoff" },
      ],
      risk_assessment: decision.risk_assessment,
    };
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
        handoff_justification_for_global_dispatcher:
          decision.exit_memo_request
            .handoff_justification_for_global_dispatcher ||
          decision.topic_choice.handoff_justification_for_global_dispatcher,
        at: nowIso,
      },
      note_information: decision.note_information,
      allow_global_dispatcher: true,
      allow_track_progress_plan_item: false,
      blocked_effects: [{ type: "track_progress_plan_item", reason_code: "onboarding_exit" }],
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
        ? [{ type: "track_progress_plan_item", reason_code: "onboarding_complete_exit" }]
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

export function preferenceKeyForState(
  state: WhatsAppOnboardingState,
): WhatsAppOnboardingPreferenceKey | null {
  if (state === "onboarding_pref_tone") return "coach.tone";
  if (state === "onboarding_pref_challenge") return "coach.challenge_level";
  if (state === "onboarding_pref_questions") return "coach.question_tendency";
  return null;
}
