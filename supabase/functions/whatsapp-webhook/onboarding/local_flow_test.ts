import { assert, assertEquals } from "jsr:@std/assert@1";
import { createNoteInformation } from "../../sophia-brain/contracts/note_information.v1.ts";
import type {
  WhatsAppOnboardingConversationContext,
  WhatsAppOnboardingLocalDecision,
  WhatsAppOnboardingLocalState,
  WhatsAppOnboardingPlanProjection,
  WhatsAppOnboardingReducerInput,
  WhatsAppOnboardingState,
} from "./contract.ts";
import {
  isWhatsAppOnboardingLocalState,
  readWhatsAppOnboardingLocalState,
  reduceWhatsAppOnboardingDecision,
} from "./state.ts";
import {
  buildWhatsAppOnboardingConversationTrace,
  buildWhatsAppOnboardingLocalDispatcherSystemPrompt,
  normalizeWhatsAppOnboardingDecision,
} from "./local_flow.ts";

const readyPlan: WhatsAppOnboardingPlanProjection = {
  status: "active",
  is_plan_ready_for_onboarding: true,
  why_status: "active_plan_found",
  active_plan_title: "Plan test",
  active_plan_summary: "Plan test",
  active_plan_item_count: 1,
  active_plan_items_user_facing: ["Lister 5 contacts professionnels"],
  active_action_candidates_for_direct_effects: [],
};

const missingPlan: WhatsAppOnboardingPlanProjection = {
  status: "missing",
  is_plan_ready_for_onboarding: false,
  why_status: "no_active_plan",
  active_plan_title: null,
  active_plan_summary: null,
  active_plan_item_count: 0,
  active_plan_items_user_facing: [],
  active_action_candidates_for_direct_effects: [],
};

const draftPlan: WhatsAppOnboardingPlanProjection = {
  status: "draft_pending_confirmation",
  is_plan_ready_for_onboarding: false,
  why_status: "draft_plan_requires_web_confirmation",
  active_plan_title: "Plan test",
  active_plan_summary: "Plan pret en preview",
  active_plan_item_count: 0,
  active_plan_items_user_facing: [],
  active_action_candidates_for_direct_effects: [],
};

const conversationContext: WhatsAppOnboardingConversationContext = {
  state_summary: "test",
  user_words: ["test"],
  stage: "plan_wait",
  plan: {
    status: "active",
    title: "Plan test",
    summary: "Plan test",
    first_items: ["Lister 5 contacts professionnels"],
  },
  preference: {
    key: null,
    label: null,
    value_label: null,
    notes: null,
  },
  missing_or_weak_values: [],
  feedback_summary: null,
  topic_choice_summary: null,
  inline_tool_summary: null,
  tone_constraints: [],
  do_not_say: [],
  evidence_used: ["test"],
};

function decision(
  patch: Partial<WhatsAppOnboardingLocalDecision>,
): WhatsAppOnboardingLocalDecision {
  return {
    flow_action: "plan_not_ready_wait",
    confidence: "high",
    stage: "plan_wait",
    preference_updates: [],
    plan_feedback: { status: "missing", summary: null, needs_followup: false },
    topic_choice: {
      status: "missing",
      handoff_hint_for_global_dispatcher: null,
      handoff_justification_for_global_dispatcher: null,
    },
    visible_task: {
      kind: "plan_wait",
      conversation_context: conversationContext,
    },
    note_information: null,
    exit_memo_request: {
      needed: false,
      exit_reason: "none",
      flow_summary: null,
      handoff_hint_for_global_dispatcher: null,
      handoff_justification_for_global_dispatcher: null,
      plan_required_exit_blocked: false,
    },
    global_effect_policy: {
      allow_global_dispatcher: false,
      allow_track_progress_plan_item: false,
      allow_update_coach_preferences_runtime: false,
      allow_normal_reply: false,
      why: "test",
    },
    no_chat_mutation: {
      plan_created: false,
      plan_item_progress_logged: false,
      pending_confirmation_created: false,
      confirmation_token_created: false,
    },
    risk_assessment: {
      risk_score: 0,
      risk_band: "none",
      safety_preempt: false,
      reason_codes: [],
    },
    evidence: [],
    ...patch,
  };
}

function reduce(args: {
  state: WhatsAppOnboardingState;
  plan: WhatsAppOnboardingPlanProjection;
  decision: Partial<WhatsAppOnboardingLocalDecision>;
  previousLocalState?: WhatsAppOnboardingLocalState | null;
}) {
  const input: WhatsAppOnboardingReducerInput = {
    whatsappState: args.state,
    webOnboardingCompleted: true,
    whatsappPreferencesDone: false,
    planProjection: args.plan,
    decision: decision(args.decision),
    previousLocalState: args.previousLocalState,
    nowIso: "2026-06-08T12:00:00.000Z",
  };
  return reduceWhatsAppOnboardingDecision(input);
}

function previousState(
  patch: Partial<WhatsAppOnboardingLocalState> = {},
): WhatsAppOnboardingLocalState {
  return {
    version: 1,
    reason_code: "previous_reason",
    visible_task: "ask_tone",
    flow_action: "answer_tone",
    current_whatsapp_state: "onboarding_pref_tone",
    next_whatsapp_state: "onboarding_pref_challenge",
    current_preference_key: "coach.tone",
    plan_status: "active",
    plan_ready: true,
    active_subflow_context: null,
    note_information: null,
    activation_note_information: null,
    exit_memo: null,
    local_state_summary: "previous summary",
    previous_flow_summary: "previous flow summary",
    updated_at: "2026-06-08T11:00:00.000Z",
    ...patch,
  };
}

Deno.test("whatsapp_onboarding local states are explicit", () => {
  assertEquals(
    isWhatsAppOnboardingLocalState("awaiting_plan_finalization"),
    true,
  );
  assertEquals(isWhatsAppOnboardingLocalState("onboarding_pref_tone"), true);
  assertEquals(isWhatsAppOnboardingLocalState("normal_reply"), false);
});

Deno.test("whatsapp_onboarding visible task exposes conversation_context without required_data", () => {
  const normalized = normalizeWhatsAppOnboardingDecision({
    flow_action: "answer_tone",
    confidence: "high",
    stage: "pref_tone",
    preference_updates: [],
    plan_feedback: { status: "missing" },
    topic_choice: { status: "missing" },
    visible_task: {
      kind: "ask_tone",
      required_data: { legacy: true },
      conversation_context: conversationContext,
    },
    exit_memo_request: { needed: false, exit_reason: "none" },
    global_effect_policy: {
      allow_global_dispatcher: false,
      allow_track_progress_plan_item: false,
      allow_update_coach_preferences_runtime: false,
      allow_normal_reply: false,
      why: "test",
    },
    no_chat_mutation: {},
    risk_assessment: { risk_score: 0, risk_band: "none" },
  });

  assertEquals(normalized.visible_task.kind, "ask_tone");
  assertEquals(
    normalized.visible_task.conversation_context.state_summary,
    conversationContext.state_summary,
  );
  assertEquals((normalized.visible_task as any).required_data, undefined);
  assertEquals((decision({}).visible_task as any).required_data, undefined);
});

Deno.test("whatsapp_onboarding local dispatcher prompt documents real output fields", () => {
  const prompt = buildWhatsAppOnboardingLocalDispatcherSystemPrompt();
  for (
    const field of [
      "Field Completion Rules:",
      "flow_action",
      "confidence",
      "stage",
      "preference_updates",
      "plan_feedback",
      "topic_choice",
      "visible_task.kind",
      "visible_task.conversation_context",
      "note_information",
      "exit_memo_request",
      "global_effect_policy",
      "no_chat_mutation",
      "risk_assessment",
      "evidence",
      "Transition Rules:",
      "exit_to_global_dispatcher",
      "exit_to_global_dispatcher",
      "safety_preempt",
      "handoff_to_local_flow",
      "draft_pending_confirmation",
      "plan_draft_ready_confirm_on_web",
    ]
  ) {
    assert(prompt.includes(field), `missing prompt rule for ${field}`);
  }
  assertEquals(prompt.split("Example JSON ").length - 1, 2);
});

Deno.test("conversation context preserves user constraints without leaking legacy data", () => {
  const normalized = normalizeWhatsAppOnboardingDecision({
    flow_action: "answer_challenge",
    confidence: "high",
    stage: "pref_challenge",
    preference_updates: [{
      key: "coach.challenge_level",
      status: "locked",
      candidate_value: null,
      locked_value: "balanced",
      label: "Equilibre",
      notes: "Challenge normal, direct seulement si je decroche.",
      needs_user_confirmation: false,
      why_status: "user gave a nuanced constraint",
    }],
    plan_feedback: { status: "missing" },
    topic_choice: { status: "missing" },
    visible_task: {
      kind: "preference_saved_next_questions",
      required_data: { legacy: true },
      conversation_context: {
        ...conversationContext,
        stage: "pref_challenge",
        preference: {
          key: "coach.challenge_level",
          label: "Equilibre",
          value_label: "Equilibre",
          notes: "Challenge normal, direct seulement si je decroche.",
        },
        tone_constraints: [
          "Conserver la nuance: direct seulement si je decroche.",
        ],
        do_not_say: ["Ne pas transformer cette nuance en niveau high."],
      },
    },
    exit_memo_request: { needed: false, exit_reason: "none" },
    global_effect_policy: {
      allow_global_dispatcher: false,
      allow_track_progress_plan_item: false,
      allow_update_coach_preferences_runtime: true,
      allow_normal_reply: false,
      why: "preference locked",
    },
    no_chat_mutation: {},
    risk_assessment: { risk_score: 0, risk_band: "none" },
  });

  assertEquals(
    normalized.visible_task.conversation_context.preference.notes,
    "Challenge normal, direct seulement si je decroche.",
  );
  assertEquals(
    normalized.visible_task.conversation_context.tone_constraints[0],
    "Conserver la nuance: direct seulement si je decroche.",
  );
  assertEquals((normalized.visible_task as any).required_data, undefined);
});

Deno.test("plan missing blocks exit before plan is ready", () => {
  const result = reduce({
    state: "awaiting_plan_finalization",
    plan: missingPlan,
    decision: {
      flow_action: "exit_to_global_dispatcher",
      exit_memo_request: {
        needed: true,
        exit_reason: "frustration",
        flow_summary: "User is annoyed.",
        handoff_hint_for_global_dispatcher: "parler du plan",
        handoff_justification_for_global_dispatcher:
          "The user wants to stop questions.",
        plan_required_exit_blocked: false,
      },
    },
  });
  assertEquals(result.status, "owned");
  assertEquals(
    result.reason_code,
    "whatsapp_onboarding_exit_blocked_before_plan_ready",
  );
  assertEquals(result.next_whatsapp_state, "awaiting_plan_finalization");
  assertEquals(result.visible_task, "blocked_exit_before_plan_ready");
  assertEquals(result.allow_global_dispatcher, false);
});

Deno.test("draft plan asks user to confirm activation on the site", () => {
  const result = reduce({
    state: "awaiting_plan_finalization",
    plan: draftPlan,
    decision: { flow_action: "plan_not_ready_wait" },
  });
  assertEquals(result.status, "owned");
  assertEquals(
    result.reason_code,
    "whatsapp_onboarding_plan_draft_pending_confirmation",
  );
  assertEquals(result.next_whatsapp_state, "awaiting_plan_finalization");
  assertEquals(result.visible_task, "plan_draft_ready_confirm_on_web");
  assertEquals(result.allow_global_dispatcher, false);
  assertEquals(result.allow_track_progress_plan_item, false);
});

Deno.test("draft plan keeps confirmation flow when user says it is done but DB is still draft", () => {
  const result = reduce({
    state: "awaiting_plan_finalization",
    plan: draftPlan,
    decision: { flow_action: "plan_ready_resume_preferences" },
  });
  assertEquals(result.status, "owned");
  assertEquals(
    result.reason_code,
    "whatsapp_onboarding_plan_draft_pending_confirmation",
  );
  assertEquals(result.next_whatsapp_state, "awaiting_plan_finalization");
  assertEquals(result.visible_task, "plan_draft_ready_confirm_on_web");
});

Deno.test("draft plan blocks unrelated topic with web activation confirmation", () => {
  const result = reduce({
    state: "awaiting_plan_finalization",
    plan: draftPlan,
    decision: {
      flow_action: "exit_to_global_dispatcher",
      exit_memo_request: {
        needed: true,
        exit_reason: "topic_change",
        flow_summary: "User wants to discuss another topic.",
        handoff_hint_for_global_dispatcher: "autre sujet",
        handoff_justification_for_global_dispatcher:
          "The user changed topic before activating the plan.",
        plan_required_exit_blocked: false,
      },
    },
  });
  assertEquals(result.status, "owned");
  assertEquals(
    result.reason_code,
    "whatsapp_onboarding_plan_draft_pending_confirmation",
  );
  assertEquals(result.next_whatsapp_state, "awaiting_plan_finalization");
  assertEquals(result.visible_task, "plan_draft_ready_confirm_on_web");
  assertEquals(result.allow_global_dispatcher, false);
});

Deno.test("plan ready resumes preference onboarding and blocks progress item", () => {
  const result = reduce({
    state: "awaiting_plan_finalization",
    plan: readyPlan,
    decision: { flow_action: "plan_ready_resume_preferences" },
  });
  assertEquals(result.status, "owned");
  assertEquals(result.next_whatsapp_state, "onboarding_pref_tone");
  assertEquals(result.visible_task, "plan_ready_resume_preferences");
  assertEquals(result.allow_track_progress_plan_item, false);
  assertEquals(
    result.blocked_effects.some((effect) =>
      effect.type === "track_progress_plan_item"
    ),
    true,
  );
});

Deno.test("onboarding reducer reads legacy local state without new fields", () => {
  const note = createNoteInformation({
    source_flow_id: "whatsapp_onboarding",
    structured_context: { active_flow_summary: "legacy active flow" },
    handoff_reason: "topic_change",
    target_dispatcher: "global",
    handoff_context_for_next_dispatcher: "Legacy note.",
  });
  const legacy = readWhatsAppOnboardingLocalState({
    reason_code: "legacy_reason",
    visible_task: "ask_tone",
    note_information: note,
  });

  assert(legacy);
  assertEquals(legacy.reason_code, "legacy_reason");
  assertEquals(legacy.visible_task, "ask_tone");
  assertEquals(legacy.note_information?.target_dispatcher, "global");
  assertEquals(legacy.plan_status, "unknown");
});

Deno.test("onboarding continuation preserves server-owned local state", () => {
  const note = createNoteInformation({
    source_flow_id: "whatsapp_onboarding",
    structured_context: { active_flow_summary: "previous handoff context" },
    handoff_reason: "topic_change",
    target_dispatcher: "global",
    handoff_context_for_next_dispatcher: "Previous note.",
  });
  const result = reduce({
    state: "onboarding_pref_challenge",
    plan: readyPlan,
    previousLocalState: previousState({ note_information: note }),
    decision: {
      flow_action: "answer_challenge",
      preference_updates: [{
        key: "coach.challenge_level",
        status: "locked",
        candidate_value: null,
        locked_value: "balanced",
        label: "Equilibre",
        notes: null,
        needs_user_confirmation: false,
        why_status: "user gave a valid challenge preference",
      }],
    },
  });

  assertEquals(result.status, "owned");
  assertEquals(
    result.local_state.note_information?.target_dispatcher,
    "global",
  );
  assert(
    result.state_mutation_audit.preserved_fields.includes("note_information"),
  );
});

Deno.test("onboarding invalid confirmation preserves server-owned local state", () => {
  const note = createNoteInformation({
    source_flow_id: "whatsapp_onboarding",
    structured_context: { active_flow_summary: "previous context" },
    handoff_reason: "topic_change",
    target_dispatcher: "global",
    handoff_context_for_next_dispatcher: "Previous note.",
  });
  const result = reduce({
    state: "onboarding_pref_challenge",
    plan: readyPlan,
    previousLocalState: previousState({ note_information: note }),
    decision: {
      flow_action: "answer_challenge",
      preference_updates: [{
        key: "coach.challenge_level",
        status: "locked",
        candidate_value: null,
        locked_value: "extreme",
        label: "Extreme",
        notes: null,
        needs_user_confirmation: false,
        why_status: "invalid value",
      }],
    },
  });

  assertEquals(result.visible_task, "repeat_question");
  assertEquals(
    result.local_state.note_information?.target_dispatcher,
    "global",
  );
  assert(
    result.state_mutation_audit.preserved_fields.includes("note_information"),
  );
});

Deno.test("onboarding rejects dispatcher clear of server-owned fields on continuation", () => {
  const note = createNoteInformation({
    source_flow_id: "whatsapp_onboarding",
    structured_context: { active_flow_summary: "previous context" },
    handoff_reason: "topic_change",
    target_dispatcher: "global",
    handoff_context_for_next_dispatcher: "Previous note.",
  });
  const result = reduce({
    state: "onboarding_pref_challenge",
    plan: readyPlan,
    previousLocalState: previousState({ note_information: note }),
    decision: {
      flow_action: "answer_challenge",
      state_mutation_request: {
        modified_fields: [],
        clear_fields: ["note_information"],
      },
      preference_updates: [{
        key: "coach.challenge_level",
        status: "locked",
        candidate_value: null,
        locked_value: "balanced",
        label: "Equilibre",
        notes: null,
        needs_user_confirmation: false,
        why_status: "user gave a valid challenge preference",
      }],
    },
  });

  assertEquals(
    result.local_state.note_information?.target_dispatcher,
    "global",
  );
  assert(
    result.state_mutation_audit.restored_fields.includes("note_information"),
  );
  assertEquals(
    result.state_mutation_audit.rejected_changes[0]?.reason_code,
    "server_owned_field_clear_not_allowed",
  );
});

Deno.test("onboarding valid local completion clears previous handoff state", () => {
  const note = createNoteInformation({
    source_flow_id: "whatsapp_onboarding",
    structured_context: { active_flow_summary: "previous context" },
    handoff_reason: "topic_change",
    target_dispatcher: "global",
    handoff_context_for_next_dispatcher: "Previous note.",
  });
  const result = reduce({
    state: "onboarding_topic_choice",
    plan: readyPlan,
    previousLocalState: previousState({
      note_information: note,
      active_subflow_context: {
        target_dispatcher: "global",
        status: "exit_to_global_dispatcher",
        reason_code: "previous_exit",
      },
    }),
    decision: {
      flow_action: "answer_topic_choice",
      topic_choice: {
        status: "plan",
        handoff_hint_for_global_dispatcher: null,
        handoff_justification_for_global_dispatcher: null,
      },
    },
  });

  assertEquals(result.status, "owned");
  assertEquals(result.mark_done, true);
  assertEquals(result.local_state.note_information, null);
  assertEquals(result.local_state.active_subflow_context, null);
  assert(
    result.state_mutation_audit.cleared_fields.includes("note_information"),
  );
});

Deno.test("whatsapp_onboarding trace captures local dispatcher decision and blocked effects", () => {
  const localDecision = decision({
    flow_action: "plan_ready_resume_preferences",
    confidence: "high",
    stage: "plan_ready_resume",
    evidence: ["plan actif detecte", "user veut continuer"],
  });
  const reduced = reduce({
    state: "awaiting_plan_finalization",
    plan: readyPlan,
    decision: localDecision,
  });
  const trace = buildWhatsAppOnboardingConversationTrace({
    requestId: "qa-request-1",
    userId: "00000000-0000-0000-0000-000000000001",
    sourceMessageId: "wamid.test",
    whatsappState: "awaiting_plan_finalization",
    webOnboardingCompleted: true,
    whatsappPreferencesDone: false,
    planProjection: readyPlan,
    decision: localDecision,
    reduced,
    dispatcherLatencyMs: 123,
    totalLatencyMs: 456,
    visibleStatus: "completed",
  });

  assertEquals(trace.turn_id, "qa-request-1");
  assertEquals(trace.source_message_id, "wamid.test");
  assertEquals(trace.response_owner, "tool_skill");
  assertEquals(trace.route_decision.selected_handler, "whatsapp_onboarding");
  assertEquals(
    trace.route_decision.reason_code,
    "whatsapp_onboarding_plan_ready_resume_preferences",
  );
  assertEquals(
    trace.route_decision.active_flow_arbitration?.decision,
    "local_flow_owns_turn",
  );
  assertEquals(
    (trace.skill_run as any).local_flow.flow_action,
    "plan_ready_resume_preferences",
  );
  assertEquals(
    (trace.skill_run as any).local_flow.visible_task,
    "plan_ready_resume_preferences",
  );
  assertEquals(
    (trace.skill_run as any).local_flow.next_whatsapp_state,
    "onboarding_pref_tone",
  );
  assertEquals(
    (trace.skill_run as any).local_flow.allow_track_progress_plan_item,
    false,
  );
  assertEquals(
    (trace.effect_ledger as any).blocked_effects.some((effect: any) =>
      effect.type === "track_progress_plan_item"
    ),
    true,
  );
  assert(
    (trace.skill_run as any).local_flow.state_mutation_audit
      .server_owned_fields.includes("note_information"),
  );
  assert(
    (trace.tool_skill_run as any).state_mutation_audit.server_owned_fields
      .includes("note_information"),
  );
});

Deno.test("plan ready frustration exits through global note", () => {
  const note = createNoteInformation({
    source_flow_id: "whatsapp_onboarding",
    structured_context: {
      active_flow_summary: "preferences active; plan ready",
    },
    handoff_reason: "topic_change",
    target_dispatcher: "global",
    handoff_context_for_next_dispatcher:
      "User refuses onboarding questions after plan ready.",
    user_words: ["tes questions me saoulent"],
  });
  const result = reduce({
    state: "onboarding_pref_tone",
    plan: readyPlan,
    decision: {
      flow_action: "exit_to_global_dispatcher",
      note_information: note,
      exit_memo_request: {
        needed: true,
        exit_reason: "frustration",
        flow_summary: "User refuses onboarding questions after plan ready.",
        handoff_hint_for_global_dispatcher: "commencer par le plan",
        handoff_justification_for_global_dispatcher:
          "The plan is ready and the user wants to skip preference questions.",
        plan_required_exit_blocked: false,
      },
    },
  });
  assertEquals(result.status, "exit_to_global_dispatcher");
  assertEquals(result.next_whatsapp_state, null);
  assertEquals(result.mark_done, true);
  assertEquals(result.completion_mode, "deferred_after_plan_ready");
  assertEquals(result.visible_task, "complete_to_global");
  assertEquals(result.allow_global_dispatcher, true);
  assertEquals(result.exit_memo?.reason, "frustration");
  assertEquals(result.note_information?.target_dispatcher, "global");
});

Deno.test("clear topic change after plan ready exits with note_information", () => {
  const note = createNoteInformation({
    source_flow_id: "whatsapp_onboarding",
    structured_context: {
      active_flow_summary: "preferences active; plan ready",
    },
    handoff_reason: "topic_change",
    target_dispatcher: "global",
    handoff_context_for_next_dispatcher:
      "User wants to prioritize a different topic after onboarding plan is ready.",
    user_words: ["laisse ca aide-moi a prioriser"],
  });
  const result = reduce({
    state: "onboarding_pref_tone",
    plan: readyPlan,
    decision: {
      flow_action: "exit_to_global_dispatcher",
      note_information: note,
      exit_memo_request: {
        needed: true,
        exit_reason: "topic_change",
        flow_summary: "User changes topic after plan ready.",
        handoff_hint_for_global_dispatcher: "prioriser",
        handoff_justification_for_global_dispatcher:
          "The user asked to prioritize instead of continuing onboarding.",
        plan_required_exit_blocked: false,
      },
    },
  });
  assertEquals(result.status, "exit_to_global_dispatcher");
  assertEquals(result.next_whatsapp_state, null);
  assertEquals(result.note_information?.target_dispatcher, "global");
  assertEquals(result.allow_global_dispatcher, true);
});

Deno.test("handoff to another local flow requires note and blocks global normal", () => {
  const note = createNoteInformation({
    source_flow_id: "whatsapp_onboarding",
    structured_context: {
      active_flow_summary: "preferences active; plan ready",
    },
    handoff_reason: "bridge",
    target_dispatcher: "product_help",
    handoff_context_for_next_dispatcher:
      "User asks a product help question after onboarding plan is ready.",
  });
  const result = reduce({
    state: "onboarding_pref_tone",
    plan: readyPlan,
    decision: {
      flow_action: "handoff_to_local_flow",
      note_information: note,
      exit_memo_request: {
        needed: true,
        exit_reason: "topic_change",
        flow_summary: "User asks product help after plan ready.",
        handoff_hint_for_global_dispatcher: "product_help",
        handoff_justification_for_global_dispatcher:
          "The user asks where the onboarding settings are managed.",
        plan_required_exit_blocked: false,
      },
    },
  });
  assertEquals(result.status, "handoff_to_local_flow");
  assertEquals(result.note_information?.target_dispatcher, "product_help");
  assertEquals(result.allow_global_dispatcher, false);
  assertEquals(
    result.blocked_effects.some((effect) =>
      effect.type === "global_dispatcher"
    ),
    true,
  );
});

Deno.test("handoff without note_information is refused with precise reason", () => {
  const result = reduce({
    state: "onboarding_pref_tone",
    plan: readyPlan,
    decision: {
      flow_action: "handoff_to_local_flow",
      note_information: null,
      exit_memo_request: {
        needed: true,
        exit_reason: "topic_change",
        flow_summary: "User asks for another local flow.",
        handoff_hint_for_global_dispatcher: "product_help",
        handoff_justification_for_global_dispatcher:
          "The user asks a product question.",
        plan_required_exit_blocked: false,
      },
    },
  });

  assertEquals(result.status, "owned");
  assertEquals(result.reason_code, "direct_handoff_note_information_missing");
  assertEquals(result.allow_global_dispatcher, false);
  assert(
    result.blocked_effects.some((effect) =>
      effect.reason_code === "note_information_missing"
    ),
  );
});

Deno.test("progress attempt during onboarding exits for direct track progress", () => {
  const result = reduce({
    state: "onboarding_pref_tone",
    plan: readyPlan,
    decision: {
      flow_action: "progress_attempt_during_onboarding",
    },
  });
  assertEquals(result.status, "exit_to_global_dispatcher");
  assertEquals(result.visible_task, "stop_after_plan_ready");
  assertEquals(result.next_whatsapp_state, "onboarding_pref_tone");
  assertEquals(result.allow_global_dispatcher, true);
  assertEquals(result.allow_track_progress_plan_item, true);
  assertEquals(
    result.blocked_effects.some((effect) =>
      effect.type === "track_progress_plan_item"
    ),
    false,
  );
});

Deno.test("safety preempt routes with note and blocks global normal effects", () => {
  const note = createNoteInformation({
    source_flow_id: "whatsapp_onboarding",
    structured_context: { active_flow_summary: "onboarding active" },
    handoff_reason: "safety",
    target_dispatcher: "safety_crisis",
    handoff_context_for_next_dispatcher:
      "User message contains safety content during onboarding.",
  });
  const result = reduce({
    state: "onboarding_pref_tone",
    plan: readyPlan,
    decision: {
      flow_action: "safety_preempt",
      note_information: note,
      risk_assessment: {
        risk_score: 8,
        risk_band: "high",
        safety_preempt: true,
        reason_codes: ["test_safety"],
      },
    },
  });
  assertEquals(result.status, "safety_preempt");
  assertEquals(result.note_information?.target_dispatcher, "safety_crisis");
  assertEquals(result.allow_global_dispatcher, false);
  assertEquals(result.allow_track_progress_plan_item, false);
  assertEquals(
    result.blocked_effects.some((effect) =>
      effect.type === "global_dispatcher"
    ),
    true,
  );
});

Deno.test("tone preference write advances to challenge without global effects", () => {
  const result = reduce({
    state: "onboarding_pref_tone",
    plan: readyPlan,
    decision: {
      flow_action: "answer_tone",
      preference_updates: [{
        key: "coach.tone",
        status: "locked",
        candidate_value: null,
        locked_value: "warm_direct",
        label: "Bienveillant ferme",
        notes: null,
        needs_user_confirmation: false,
        why_status: "user chose a warm direct mix",
      }],
    },
  });
  assertEquals(result.next_whatsapp_state, "onboarding_pref_challenge");
  assertEquals(result.visible_task, "preference_saved_next_challenge");
  assertEquals(result.preference_writes[0]?.key, "coach.tone");
  assertEquals(result.preference_writes[0]?.locked_value, "warm_direct");
  assertEquals(result.allow_global_dispatcher, false);
});

Deno.test("explicit preference correction replaces only current field", () => {
  const previous = previousState({
    current_preference_key: "coach.challenge_level",
    local_state_summary: "tone already collected",
  });
  const result = reduce({
    state: "onboarding_pref_challenge",
    plan: readyPlan,
    previousLocalState: previous,
    decision: {
      flow_action: "answer_challenge",
      preference_updates: [{
        key: "coach.challenge_level",
        status: "locked",
        candidate_value: null,
        locked_value: "high",
        label: "Élevé",
        notes: "Correction explicite: finalement challenge assez direct.",
        needs_user_confirmation: false,
        why_status: "user corrected the current challenge preference",
      }],
    },
  });

  assertEquals(result.status, "owned");
  assertEquals(result.preference_writes.length, 1);
  assertEquals(result.preference_writes[0]?.key, "coach.challenge_level");
  assertEquals(result.preference_writes[0]?.locked_value, "high");
  assertEquals(
    result.local_state.current_preference_key,
    "coach.challenge_level",
  );
  assertEquals(result.local_state.note_information, previous.note_information);
  assertEquals(result.allow_global_dispatcher, false);
});

Deno.test("explicit preference refusal skips current preference without handoff", () => {
  const result = reduce({
    state: "onboarding_pref_questions",
    plan: readyPlan,
    previousLocalState: previousState({
      current_preference_key: "coach.question_tendency",
    }),
    decision: {
      flow_action: "skip_optional_preference",
    },
  });

  assertEquals(result.status, "owned");
  assertEquals(result.reason_code, "whatsapp_onboarding_preference_skipped");
  assertEquals(result.next_whatsapp_state, "onboarding_plan_creation_feedback");
  assertEquals(result.preference_writes.length, 0);
  assertEquals(result.allow_global_dispatcher, false);
  assertEquals(
    result.blocked_effects.some((effect) =>
      effect.type === "global_dispatcher"
    ),
    true,
  );
});

Deno.test("clear continuation does not false-positive exit or stop", () => {
  const result = reduce({
    state: "onboarding_pref_challenge",
    plan: readyPlan,
    decision: {
      flow_action: "answer_challenge",
      preference_updates: [{
        key: "coach.challenge_level",
        status: "locked",
        candidate_value: null,
        locked_value: "balanced",
        label: "Equilibre",
        notes: "Normal, direct seulement si je decroche.",
        needs_user_confirmation: false,
        why_status: "user continues onboarding with a clear preference",
      }],
    },
  });
  assertEquals(result.status, "owned");
  assertEquals(result.next_whatsapp_state, "onboarding_pref_questions");
  assertEquals(result.visible_task, "preference_saved_next_questions");
  assertEquals(result.allow_global_dispatcher, false);
  assertEquals(result.note_information, null);
});

Deno.test("invalid preference value repeats question instead of writing", () => {
  const result = reduce({
    state: "onboarding_pref_challenge",
    plan: readyPlan,
    decision: {
      flow_action: "answer_challenge",
      preference_updates: [{
        key: "coach.challenge_level",
        status: "locked",
        candidate_value: null,
        locked_value: "extreme",
        label: "Extreme",
        notes: null,
        needs_user_confirmation: false,
        why_status: "invalid value",
      }],
    },
  });
  assertEquals(result.next_whatsapp_state, "onboarding_pref_challenge");
  assertEquals(result.visible_task, "repeat_question");
  assertEquals(result.preference_writes.length, 0);
});

Deno.test("topic choice plan completes onboarding locally", () => {
  const result = reduce({
    state: "onboarding_topic_choice",
    plan: readyPlan,
    decision: {
      flow_action: "answer_topic_choice",
      topic_choice: {
        status: "plan",
        handoff_hint_for_global_dispatcher: null,
        handoff_justification_for_global_dispatcher: null,
      },
    },
  });
  assertEquals(result.status, "owned");
  assertEquals(result.next_whatsapp_state, null);
  assertEquals(result.mark_done, true);
  assertEquals(result.completion_mode, "completed");
  assertEquals(result.visible_task, "complete_to_plan");
});
