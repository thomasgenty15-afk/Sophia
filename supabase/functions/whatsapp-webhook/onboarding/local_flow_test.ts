import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import type { WhatsAppOnboardingPlanProjection } from "./contract.ts";
import {
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

Deno.test("whatsapp onboarding prompt exits to allowed global or coaching targets", () => {
  const prompt = buildWhatsAppOnboardingLocalDispatcherSystemPrompt();

  assertStringIncludes(prompt, "exit_to_global_dispatcher");
  assertStringIncludes(prompt, "utilise global");
  assertStringIncludes(prompt, "target_dispatcher=coaching_recommendation");
  assertEquals(
    prompt.includes(["handoff", "to", "local", "flow"].join("_")),
    false,
  );
  assertEquals(prompt.includes("get_info_product"), false);
  assertEquals(prompt.includes("inline_product_return"), false);
  assertEquals(prompt.includes(["prepare", "attack", "card"].join("_")), false);
  assertEquals(prompt.includes(["select", "state", "potion"].join("_")), false);
});

Deno.test("whatsapp onboarding normalizes legacy product info action to global exit", () => {
  const decision = normalizeWhatsAppOnboardingDecision({
    flow_action: "get_info_product",
    confidence: "high",
    stage: "exit",
    preference_updates: [],
    plan_feedback: { status: "missing", summary: null, needs_followup: false },
    topic_choice: {
      status: "other_topic",
      handoff_hint_for_global_dispatcher: "question produit Sophia",
      handoff_justification_for_global_dispatcher:
        "User asks a product question after onboarding is ready.",
    },
    visible_task: {
      kind: "complete_to_global",
      conversation_context: {},
    },
    note_information: {
      source_flow_id: "whatsapp_onboarding",
      handoff_reason: "explicit_user_request",
      target_dispatcher: "global",
      handoff_context_for_next_dispatcher:
        "User asks a product question after onboarding is ready.",
      structured_context: {
        recommended_next_focus: "product_help",
      },
      confidence: "high",
    },
    exit_memo_request: {
      needed: true,
      exit_reason: "topic_change",
      flow_summary: "Onboarding ready; user asks product help.",
      handoff_hint_for_global_dispatcher: "question produit Sophia",
      handoff_justification_for_global_dispatcher:
        "User asks a product question after onboarding is ready.",
      plan_required_exit_blocked: false,
    },
    global_effect_policy: {
      allow_global_dispatcher: true,
      allow_track_progress_plan_item: false,
      allow_normal_reply: false,
      why: "clear product question after plan ready",
    },
    risk_assessment: {
      risk_score: 0,
      risk_band: "none",
      safety_preempt: false,
      reason_codes: [],
    },
    evidence: ["question produit"],
  }, {
    userMessage: "c'est quoi une carte de defense ?",
    whatsappState: "onboarding_topic_choice",
    planProjection: readyPlan,
  });

  assertEquals(decision.flow_action, "exit_to_global_dispatcher");
  assertEquals(decision.note_information?.target_dispatcher, "global");
});

Deno.test("whatsapp onboarding normalizes removed local handoff to global note", () => {
  const removedHandoff = ["handoff", "to", "local", "flow"].join("_");
  const removedTarget = ["prepare", "attack", "card"].join("_");
  const decision = normalizeWhatsAppOnboardingDecision({
    flow_action: removedHandoff,
    confidence: "high",
    stage: "exit",
    preference_updates: [],
    plan_feedback: { status: "missing", summary: null, needs_followup: false },
    topic_choice: {
      status: "other_topic",
      handoff_hint_for_global_dispatcher: "prepare une carte",
      handoff_justification_for_global_dispatcher:
        "User asks for a removed local flow after onboarding is ready.",
    },
    visible_task: {
      kind: "complete_to_global",
      conversation_context: {},
    },
    note_information: {
      source_flow_id: "whatsapp_onboarding",
      handoff_reason: "bridge",
      target_dispatcher: removedTarget,
      handoff_context_for_next_dispatcher:
        "User asks for a removed local flow after onboarding is ready.",
      structured_context: {
        recommended_next_focus: removedTarget,
      },
      confidence: "high",
    },
    exit_memo_request: {
      needed: true,
      exit_reason: "topic_change",
      flow_summary: "Onboarding ready; user asks for another topic.",
      handoff_hint_for_global_dispatcher: "prepare une carte",
      handoff_justification_for_global_dispatcher:
        "User asks for a removed local flow after onboarding is ready.",
      plan_required_exit_blocked: false,
    },
    global_effect_policy: {
      allow_global_dispatcher: true,
      allow_track_progress_plan_item: false,
      allow_normal_reply: false,
      why: "clear topic change after plan ready",
    },
    risk_assessment: {
      risk_score: 0,
      risk_band: "none",
      safety_preempt: false,
      reason_codes: [],
    },
    evidence: ["prepare une carte"],
  }, {
    userMessage: "prepare une carte",
    whatsappState: "onboarding_topic_choice",
    planProjection: readyPlan,
  });

  assertEquals(decision.flow_action, "exit_to_global_dispatcher");
  assertEquals(decision.note_information?.target_dispatcher, "global");
  assertEquals(
    decision.note_information?.structured_context.target_dispatcher,
    "global",
  );
});
