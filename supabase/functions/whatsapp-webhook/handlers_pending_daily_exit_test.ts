import { assertEquals } from "jsr:@std/assert@1";

import {
  buildDailyPendingDirectEffectTimeContext,
  dailyActionReviewCoachingReturnNoteFromTempMemory,
  dailyDispatcherOutputWithDirectEffectConfirmationContextForVisible,
  isExplicitDailyActionReviewResumeText,
  isWeeklyAutoValidationDeclineText,
  isWeeklyAutoValidationPending,
  sanitizeDailyActionReviewExitMemoForPending,
  shouldGenericCheckinYesHandlePending,
} from "./handlers_pending.ts";

Deno.test("weekly auto-validation decline text matches the Non merci! button and variants", () => {
  assertEquals(isWeeklyAutoValidationDeclineText("Non merci!"), true);
  assertEquals(isWeeklyAutoValidationDeclineText("non merci"), true);
  assertEquals(isWeeklyAutoValidationDeclineText("Non, merci !"), true);
  assertEquals(isWeeklyAutoValidationDeclineText("  NON MERCI  "), true);
  // A clear refusal may be followed by a free-form request.
  assertEquals(
    isWeeklyAutoValidationDeclineText("non merci mais explique moi un truc"),
    true,
  );
  assertEquals(isWeeklyAutoValidationDeclineText("pas maintenant"), false);
  assertEquals(isWeeklyAutoValidationDeclineText("oui"), false);
  assertEquals(isWeeklyAutoValidationDeclineText(""), false);
});

Deno.test("weekly auto-validation pending is detected by event_context", () => {
  assertEquals(
    isWeeklyAutoValidationPending({
      payload: { event_context: "weekly_planning_auto_validation_v2" },
    }),
    true,
  );
  assertEquals(
    isWeeklyAutoValidationPending({
      payload: { event_context: "weekly_progress_review_v2" },
    }),
    false,
  );
  assertEquals(isWeeklyAutoValidationPending(null), false);
});

function memo(target: string) {
  return {
    note_information: {
      source_flow_id: "daily_action_review_v1",
      handoff_reason: "topic_change",
      target_dispatcher: target,
      handoff_context_for_next_dispatcher:
        "Daily pauses because the user asks which Sophia lever to use.",
      user_words: ["je bloque je devrais utiliser quoi"],
      structured_context: {
        recommended_next_focus: target,
        constraints: ["recommendation_only", "no mutation"],
      },
      confidence: "high",
    },
    handoff_hint_for_global_dispatcher: {
      likely_intent: "unknown",
      why: "daily exit",
      constraints: [],
    },
  };
}

Deno.test("daily pending exit sanitizer preserves coaching recommendation target", () => {
  const sanitized = sanitizeDailyActionReviewExitMemoForPending(
    memo("coaching_recommendation"),
  );

  assertEquals(
    (sanitized.note_information as any).target_dispatcher,
    "coaching_recommendation",
  );
  assertEquals(
    (sanitized.handoff_hint_for_global_dispatcher as any).likely_intent,
    "coaching_recommendation",
  );
});

Deno.test("daily pending exit sanitizer preserves product help target", () => {
  const sanitized = sanitizeDailyActionReviewExitMemoForPending(
    memo("product_help"),
  );

  assertEquals(
    (sanitized.note_information as any).target_dispatcher,
    "product_help",
  );
  assertEquals(
    (sanitized.handoff_hint_for_global_dispatcher as any).likely_intent,
    "product_help",
  );
});

Deno.test("daily pending exit sanitizer rejects removed local targets", () => {
  const sanitized = sanitizeDailyActionReviewExitMemoForPending(
    memo("prepare_attack_card"),
  );

  assertEquals((sanitized.note_information as any).target_dispatcher, "global");
  assertEquals(
    (sanitized.handoff_hint_for_global_dispatcher as any).likely_intent,
    "unknown",
  );
});

Deno.test("daily pending recognizes coaching recommendation return note", () => {
  const note = dailyActionReviewCoachingReturnNoteFromTempMemory({
    __last_coaching_recommendation_exit_memo: {
      note_information: {
        source_flow_id: "coaching_recommendation",
        handoff_reason: "clarification_resolved",
        target_dispatcher: "daily_action_review_v1",
        handoff_context_for_next_dispatcher:
          "Return to the daily question after recommendation.",
        user_words: ["ok je vais prendre une carte d'attaque"],
        structured_context: {
          bridge_kind: "coaching_recommendation_to_parent",
          return_focus: "return_to_daily_current_question",
          recommended_feature: { primary: "attack_card" },
        },
        confidence: "high",
      },
      at: "2026-06-18T10:00:00.000Z",
    },
  });

  assertEquals(note?.target_dispatcher, "daily_action_review_v1");
  assertEquals(
    (note?.structured_context as any)?.bridge_kind,
    "coaching_recommendation_to_parent",
  );
});

Deno.test("generic checkin yes does not consume daily conversation pending", () => {
  assertEquals(
    shouldGenericCheckinYesHandlePending({
      payload: {
        event_context: "action_evening_review_v2",
        chat_capability: "daily_action_review",
        message_mode: "conversation",
      },
    }),
    false,
  );
});

Deno.test("generic checkin yes can consume daily template gate pending", () => {
  assertEquals(
    shouldGenericCheckinYesHandlePending({
      payload: {
        event_context: "action_evening_review_v2",
        chat_capability: "daily_action_review",
        message_mode: "template_gate",
      },
    }),
    true,
  );
});

Deno.test("generic checkin yes can still consume template pending", () => {
  assertEquals(
    shouldGenericCheckinYesHandlePending({
      payload: {
        event_context: "weekly_progress_review_v2",
        message_mode: "dynamic",
      },
    }),
    true,
  );
});

Deno.test("daily pending builds canonical direct effect time context", () => {
  const context = buildDailyPendingDirectEffectTimeContext({
    now: new Date("2026-06-24T17:20:00.000Z"),
    timezone: "Europe/Paris",
    locale: "fr-FR",
  });

  assertEquals(context.now_utc, "2026-06-24T17:20:00.000Z");
  assertEquals(context.user_timezone, "Europe/Paris");
  assertEquals(context.user_locale, "fr-FR");
  assertEquals(context.user_local_datetime, "2026-06-24T19:20:00");
  assertEquals(context.user_local_human.includes("2026"), true);
});

Deno.test("daily pending injects committed one-shot context into visible dispatcher output", () => {
  const dispatcherOutput = {
    flow_action: "clarify_outcome",
    confidence: "medium",
    risk_score: 0,
    target_resolution: {
      resolved_occurrence_ids: ["occ-1"],
      ambiguous: false,
    },
    item_updates: {},
    daily_intent: { kind: "daily_clarification", summary: "" },
    direct_effect_request: {
      requested: true,
      effect_type: "create_one_shot_reminder",
      explicitness: "explicit",
      target_status: "identified",
      confidence_band: "high",
      payload_hint: {
        raw_text: "rappelle-moi dans 31 minutes de finir le rangement",
        when_hint: "dans 31 minutes",
        UTC_time: "2026-06-26T14:46:00.000Z",
        local_label: "dans 31 minutes",
        instruction_hint: "finir le rangement",
      },
      reason: "rappel ponctuel explicite",
    },
    state_updates: {
      status_hint: "collecting",
      item_updates: {},
      current_focus_occurrence_ids: [],
      remaining_occurrence_ids: [],
      clear_fields: [],
    },
    visible_task: {
      kind: "clarify_outcome",
      instruction: "",
      conversation_context: {
        state_summary: "",
        field_or_stage: "clarify_outcome",
        known_values: {},
        missing_or_weak_values: [],
        selected_candidate: null,
        handoff_data: null,
        affect_context: {
          emotional_intensity: "none",
          fragile_signal: false,
          suggested_tone: "neutral",
          evidence: [],
        },
        tone_constraints: [],
        do_not_say: [],
        context_summary: null,
        evidence_used: [],
      },
    },
    child_flow: null,
    return_to_parent: null,
    child_flow_context: null,
    note_information: null,
    exit_memo: {
      needed: false,
      reason: null,
      user_intent_summary: null,
      local_flow_context: {
        source_flow_id: "daily_action_review_v1",
        status: "active",
        completed_slots: [],
        pending_slots: [],
        state_summary: null,
        user_words: [],
      },
      handoff_hint_for_global_dispatcher: {
        likely_intent: "unknown",
        why: null,
      },
      note_information: null,
    },
    state_change_intent: {
      modified_fields: [],
      clear_fields: [],
    },
    evidence: [],
  } as any;
  const context = {
    has_committed_one_shot_reminder: true,
    has_requested_one_shot_reminder: true,
    one_shot_reminder: {
      committed: true,
      local_label: "dans 31 minutes",
      reminder_instruction: "finir le rangement",
    },
    confirmation_text: null,
    committed_effects: [],
    requested_effects: [],
    blocked_effects: [],
    do_not_recreate: true,
    do_not_reroute: true,
    do_not_redemand: true,
    do_not_confirm_without_commit: true,
    remaining_user_need_must_continue: true,
  };

  const visibleOutput =
    dailyDispatcherOutputWithDirectEffectConfirmationContextForVisible(
      dispatcherOutput,
      context,
    ) as any;

  assertEquals(
    visibleOutput.visible_task.conversation_context.known_values
      .direct_effect_confirmation_context.one_shot_reminder.committed,
    true,
  );
  assertEquals(
    visibleOutput.visible_task.conversation_context.known_values
      .direct_effect_confirmation_context.one_shot_reminder.local_label,
    "dans 31 minutes",
  );
});

Deno.test("daily resume text is recognized when user gives daily outcomes", () => {
  assertEquals(
    isExplicitDailyActionReviewResumeText(
      "Merci, on reprend le daily: ranger est fait; sas est fait.",
    ),
    true,
  );
});

Deno.test("daily resume text is not triggered by generic coaching agreement", () => {
  assertEquals(
    isExplicitDailyActionReviewResumeText(
      "Oui, choisis le levier le plus simple pour ce blocage.",
    ),
    false,
  );
});
