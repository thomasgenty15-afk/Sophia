import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  normalizeFeatureOpportunityLocalDispatcherOutput,
  reduceFeatureOpportunityLocalDispatcherOutput,
} from "./local_flow.ts";
import {
  featureOpportunityVisiblePrompt,
  productGuidancePromptLines,
} from "./visible_agent.ts";
import { runFeatureOpportunitySkill } from "./skill.ts";
import type { TurnFrame } from "../../contracts/turn_frame.v1.ts";

function decision(patch: Record<string, unknown> = {}) {
  return normalizeFeatureOpportunityLocalDispatcherOutput({
    flow_action: "recommend_feature",
    confidence: "high",
    risk_score: 0,
    feature: "initiatives",
    opportunity_kind: "recurring_context",
    user_problem_summary: "Difficulty before dinner.",
    trigger_context: "avant chaque diner",
    recommendation: {
      feature: "initiatives",
      why: "The problem repeats around the same context.",
      user_facing_next_step:
        "ouvre les initiatives et decris le moment avant diner.",
    },
    state_updates: {
      status: "active",
      turn_count_increment: 1,
      close_after_visible: false,
    },
    visible_task: {
      kind: "recommend_feature",
      instruction: "Recommend initiatives.",
      conversation_context: {
        feature: "initiatives",
        user_problem_summary: "Difficulty before dinner.",
        trigger_context: "avant chaque diner",
        known_values: {},
        missing_or_weak_values: [],
        recommendation: {},
        evidence_used: [],
        tone_constraints: [],
        do_not_say: [],
      },
    },
    note_information: null,
    evidence: ["avant chaque diner"],
    ...patch,
  });
}

const signalContext = {
  feature: "initiatives" as const,
  opportunity_kind: "recurring_context" as const,
  trigger_context: "avant chaque diner",
  user_problem_summary: "Difficulty before dinner.",
  priority_reason: "Repeated context fits initiatives.",
};

Deno.test("feature opportunity keeps dispatcher context in state", () => {
  const reduced = reduceFeatureOpportunityLocalDispatcherOutput({
    previous: {
      feature: "initiatives",
      opportunity_kind: "recurring_context",
      user_problem_summary: "Difficulty before dinner.",
      trigger_context: "avant chaque diner",
      dispatcher_signal_context: signalContext,
      turn_count: 0,
      max_turns: 3,
    },
    output: decision(),
    userMessage: "Avant chaque diner j'ai du mal a ne pas fumer",
  });

  assertEquals(reduced.status, "continue");
  assertEquals(reduced.local_state?.dispatcher_signal_context, signalContext);
  assertEquals(
    reduced.conversation_context.known_values.dispatcher_signal_context,
    signalContext,
  );
  assertEquals(reduced.effects.requested, []);
  assertEquals(reduced.effects.allowed, []);
  assertEquals(reduced.effects.committed, []);
});

Deno.test("feature opportunity visible guidance carries initiative and coach preference settings", () => {
  const guidance = productGuidancePromptLines().join("\n");

  assert(guidance.includes("instruction/message"));
  assert(guidance.includes("horaire"));
  assert(guidance.includes("jours actifs"));
  assert(guidance.includes("Plan actuel ou Base de vie"));
  assert(guidance.includes("actif/inactif"));
  assert(guidance.includes("coach.tone"));
  assert(guidance.includes("coach.challenge_level"));
  assert(guidance.includes("coach.question_tendency"));
  assert(guidance.includes("Ne promets jamais une sauvegarde"));
});

Deno.test("feature opportunity visible treats committed one-shot reminder as explicit exception", () => {
  const prompt = featureOpportunityVisiblePrompt("recommend_feature");

  assert(prompt.includes("Exception stricte"));
  assert(prompt.includes("one_shot_reminder.committed=true"));
  assert(prompt.includes("confirme-le clairement"));
  assert(prompt.includes("Cette exception ne permet pas"));
  assert(prompt.includes("feature, initiative ou preference"));
});

Deno.test("feature opportunity visible says initiatives and never internal reminder name", async () => {
  const turnFrame: TurnFrame = {
    turn_id: "t1",
    source_message_id: "m1",
    user_id: "u1",
    channel: "web",
    safety: { risk_band: "none", reason_codes: [], evidence: [] },
    direct_effects: [],
    direct_effect_lane: {
      selected_handler: "create_one_shot_reminder",
      toolExecution: "success",
      executedTools: ["create_one_shot_reminder"],
      requested_effects: [],
      allowed_effects: [],
      committed_effects: [{
        type: "create_one_shot_reminder",
        reminder_instruction: "relire mes notes",
      }],
      blocked_effects: [],
      visible_confirmation_hint: "C'est programme.",
    },
    skill_signals: {
      feature_opportunity: {
        detected: true,
        confidence_band: "high",
        context: signalContext,
      },
    },
    memory_plan: {
      context_need: "minimal",
      memory_mode: "none",
      context_budget_tier: "tiny",
      targets: [],
      retrieval_policy: "semantic_first",
    },
  } as TurnFrame;
  const output = await runFeatureOpportunitySkill({
    user_message: "Avant chaque diner j'ai du mal a ne pas fumer",
    context: {
      skill_id: "feature_opportunity",
      user_id: "u1",
      recent_messages: [],
      active_skill_working_state: null,
      turn_frame: turnFrame,
      relevant_memory_items: [],
      plan_items: [],
      product_surfaces: [],
      exclusions: [],
    },
    local_dispatcher: async () => decision(),
    visible_agent: async (input) => {
      assertEquals(
        (input.conversation_context.known_values
          .direct_effect_confirmation_context as any)
          ?.has_committed_one_shot_reminder,
        true,
      );
      assertEquals(input.visible_runtime_context?.recent_user_messages, [
        {
          role: "user",
          content: "Avant chaque diner j'ai du mal a ne pas fumer",
          created_at: null,
        },
      ]);
      assertEquals(
        (input.conversation_context.known_values as any).direct_effect_lane,
        undefined,
      );
      return `Tu peux regarder les initiatives: ${input.conversation_context.recommendation.user_facing_next_step}`;
    },
  });

  assert(output.reply?.includes("initiatives"));
  assertEquals(output.reply?.includes("recurring_reminder"), false);
  assertEquals(output.effects?.requested, []);
  assertEquals(output.effects?.allowed, []);
  assertEquals(output.effects?.committed, []);
});

Deno.test("feature opportunity legacy product handoff exits only to global", () => {
  const output = normalizeFeatureOpportunityLocalDispatcherOutput({
    flow_action: "handoff_to_product_help",
    confidence: "high",
    risk_score: 0,
    feature: "initiatives",
    opportunity_kind: "recurring_context",
    user_problem_summary: "Question autonome sur les initiatives.",
    trigger_context: "initiative",
    recommendation: {
      feature: "initiatives",
      why: "Repeated context fits initiatives.",
      user_facing_next_step: "ouvre les initiatives.",
    },
    state_updates: {
      status: "active",
      turn_count_increment: 1,
      close_after_visible: false,
    },
    visible_task: {
      kind: "product_help_transition",
      instruction: "Legacy product handoff.",
      conversation_context: {},
    },
    evidence: ["c'est quoi une initiative"],
  });
  const reduced = reduceFeatureOpportunityLocalDispatcherOutput({
    previous: {
      feature: "initiatives",
      opportunity_kind: "recurring_context",
      user_problem_summary: "Difficulty before dinner.",
      trigger_context: "avant chaque diner",
      dispatcher_signal_context: signalContext,
      turn_count: 1,
      max_turns: 3,
    },
    output,
    userMessage: "C'est quoi une initiative ?",
  });

  assertEquals(output.flow_action, "exit_to_global_dispatcher");
  assertEquals(reduced.status, "exit");
  assertEquals(reduced.reason_code, "feature_opportunity_exit_to_global");
  assertEquals(reduced.note_information?.target_dispatcher, "global");
});

Deno.test("feature opportunity high risk exits only to global", () => {
  const reduced = reduceFeatureOpportunityLocalDispatcherOutput({
    previous: {
      feature: "coach_preferences",
      opportunity_kind: "coach_style_feedback",
      user_problem_summary: "User wants fewer questions.",
      trigger_context: "trop de questions",
      dispatcher_signal_context: {
        feature: "coach_preferences",
        opportunity_kind: "coach_style_feedback",
        trigger_context: "trop de questions",
        user_problem_summary: "User wants fewer questions.",
        priority_reason: "Style feedback fits coaching preferences.",
      },
      turn_count: 1,
      max_turns: 3,
    },
    output: decision({
      flow_action: "answer_followup",
      risk_score: 8,
      feature: "coach_preferences",
      opportunity_kind: "coach_style_feedback",
    }),
    userMessage: "Je suis en danger",
  });

  assertEquals(reduced.status, "exit");
  assertEquals(reduced.reason_code, "feature_opportunity_exit_to_global");
  assertEquals(reduced.note_information?.target_dispatcher, "global");
});

Deno.test("feature opportunity coach preferences does not promise persistence", async () => {
  const coachPreferencesContext = {
    feature: "coach_preferences" as const,
    opportunity_kind: "coach_style_feedback" as const,
    trigger_context: "trop de questions",
    user_problem_summary: "User wants fewer questions.",
    priority_reason: "Style feedback fits coaching preferences.",
  };
  const output = await runFeatureOpportunitySkill({
    user_message: "Tu poses trop de questions",
    context: {
      skill_id: "feature_opportunity",
      user_id: "u1",
      recent_messages: [],
      active_skill_working_state: null,
      turn_frame: {
        turn_id: "t1",
        source_message_id: "m1",
        user_id: "u1",
        channel: "web",
        safety: { risk_band: "none", reason_codes: [], evidence: [] },
        direct_effects: [],
        skill_signals: {
          feature_opportunity: {
            detected: true,
            confidence_band: "high",
            context: coachPreferencesContext,
          },
        },
        memory_plan: {
          context_need: "minimal",
          memory_mode: "none",
          context_budget_tier: "tiny",
          targets: [],
          retrieval_policy: "semantic_first",
        },
      } as TurnFrame,
      relevant_memory_items: [],
      plan_items: [],
      product_surfaces: [],
      exclusions: [],
    },
    local_dispatcher: async () =>
      decision({
        feature: "coach_preferences",
        opportunity_kind: "coach_style_feedback",
        user_problem_summary: "User wants fewer questions.",
        trigger_context: "trop de questions",
        recommendation: {
          feature: "coach_preferences",
          why: "This is feedback about Sophia's coaching style.",
          user_facing_next_step:
            "ouvre les preferences de coaching et choisis un style plus direct.",
        },
      }),
    visible_agent: async () =>
      "Tu peux le regler dans les preferences de coaching, sans que je le sauvegarde depuis ce chat.",
  });

  assert(output.reply?.includes("preferences de coaching"));
  assertEquals(output.reply?.includes("j'ai sauvegarde"), false);
  assertEquals(output.effects?.committed, []);
});
