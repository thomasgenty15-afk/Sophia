import { assertEquals } from "jsr:@std/assert@1";
import type {
  WhatsAppOnboardingLocalDecision,
  WhatsAppOnboardingPlanProjection,
  WhatsAppOnboardingReducerInput,
  WhatsAppOnboardingState,
} from "./contract.ts";
import {
  isWhatsAppOnboardingLocalState,
  reduceWhatsAppOnboardingDecision,
} from "./state.ts";

const readyPlan: WhatsAppOnboardingPlanProjection = {
  status: "active",
  is_plan_ready_for_onboarding: true,
  why_status: "active_plan_found",
  active_plan_title: "Plan test",
  active_plan_summary: "Plan test",
  active_plan_item_count: 1,
  active_plan_items_user_facing: ["Lister 5 contacts professionnels"],
};

const missingPlan: WhatsAppOnboardingPlanProjection = {
  status: "missing",
  is_plan_ready_for_onboarding: false,
  why_status: "no_active_plan",
  active_plan_title: null,
  active_plan_summary: null,
  active_plan_item_count: 0,
  active_plan_items_user_facing: [],
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
      required_data: { operation_name: "whatsapp_onboarding" },
    },
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
}) {
  const input: WhatsAppOnboardingReducerInput = {
    whatsappState: args.state,
    webOnboardingCompleted: true,
    whatsappPreferencesDone: false,
    planProjection: args.plan,
    decision: decision(args.decision),
    nowIso: "2026-06-08T12:00:00.000Z",
  };
  return reduceWhatsAppOnboardingDecision(input);
}

Deno.test("whatsapp_onboarding local states are explicit", () => {
  assertEquals(isWhatsAppOnboardingLocalState("awaiting_plan_finalization"), true);
  assertEquals(isWhatsAppOnboardingLocalState("onboarding_pref_tone"), true);
  assertEquals(isWhatsAppOnboardingLocalState("normal_reply"), false);
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
  assertEquals(result.reason_code, "whatsapp_onboarding_exit_blocked_before_plan_ready");
  assertEquals(result.next_whatsapp_state, "awaiting_plan_finalization");
  assertEquals(result.visible_task, "blocked_exit_before_plan_ready");
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
    result.blocked_effects.some((effect) => effect.type === "track_progress_plan_item"),
    true,
  );
});

Deno.test("plan ready allows frustration exit with global handoff memo", () => {
  const result = reduce({
    state: "onboarding_pref_tone",
    plan: readyPlan,
    decision: {
      flow_action: "frustration_exit_after_plan_ready",
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
  assertEquals(result.exit_memo?.handoff_hint_for_global_dispatcher, "commencer par le plan");
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
