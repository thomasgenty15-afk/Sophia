import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import type { DailyActionReviewTarget } from "./daily_action_review.ts";
import { buildDailyActionReviewInstruction } from "./daily_action_review.ts";
import { isCoachingRecommendationBridgeNote } from "./coaching_parent_bridge.ts";
import { mergeDailyActionReviewLocalState } from "./daily_action_review/reducer.ts";
import {
  dailyReviewDecisionFromLocalDispatcher,
  dispatcherSystemPrompt,
  runDailyActionReviewLocalFlow,
  runDailyActionReviewVisibleAgent,
  sanitizeDailyActionReviewVisibleText,
  sanitizeDailyActionReviewLocalDispatcherOutput,
} from "./daily_action_review/local_flow.ts";
import {
  DAILY_ACTION_REVIEW_VISIBLE_AGENT_SPECS,
  dailyActionReviewVisibleSystemPrompt,
} from "./daily_action_review/visible_agents.ts";

function target(id: string, title: string): DailyActionReviewTarget {
  return {
    occurrence_id: id,
    cycle_id: "cycle",
    transformation_id: "transformation",
    plan_id: "plan",
    plan_item_id: `item-${id}`,
    title,
    description: `${title} description`,
    dimension: "habits",
    kind: "habit",
    tracking_type: "boolean",
    planned_day: "mon",
    original_planned_day: null,
    week_start_date: "2026-06-08",
  };
}

Deno.test("daily action review prompt keeps local exits global-only", () => {
  const prompt = dispatcherSystemPrompt();

  assertStringIncludes(prompt, "Field Completion Rules:");
  assertStringIncludes(prompt, "exit_to_global_dispatcher");
  assertStringIncludes(prompt, "safety_preempt");
  assertEquals(
    prompt.includes(["handoff", "to", "local", "flow"].join("_")),
    false,
  );
  assertEquals(prompt.includes(["prepare", "attack", "card"].join("_")), false);
  assertEquals(prompt.includes(["select", "state", "potion"].join("_")), false);
  assertEquals(prompt.includes("inline_product_help"), false);
});

Deno.test("daily action review prompt is binary and does not expose partial wording", () => {
  const prompt = dispatcherSystemPrompt();

  assertStringIncludes(
    prompt,
    "Chaque target du pending doit finir avec un outcome stabilise",
  );
  assertStringIncludes(
    prompt,
    "Si current_focus_occurrence_ids est complet mais remaining_occurrence_ids n'est pas vide",
  );
  assertStringIncludes(prompt, "explain_target");
  assertStringIncludes(prompt, "titre, la description");
  assertStringIncludes(prompt, "plusieurs targets");
  assertStringIncludes(prompt, "synonyme, paraphrase ou intention d'action");
  assertStringIncludes(prompt, "reason_text et reason_category doivent etre");
  assertStringIncludes(prompt, "craquage/rechute/joint/fume => emotional");
  assertStringIncludes(prompt, "affect_context");
  assertStringIncludes(prompt, "demande explicite d'aide");
  assertStringIncludes(prompt, "handoff_to_child_flow");
  assertStringIncludes(prompt, "daily_action_coaching_recommendation_v1");
  assertStringIncludes(prompt, "resume_daily_after_action_coaching");
  assertStringIncludes(prompt, "garde les deux");
  assertStringIncludes(
    prompt,
    "Ne laisse jamais la reponse locale faire disparaitre le rappel",
  );
  assertStringIncludes(prompt, "Schema minimal attendu");
  assertStringIncludes(prompt, "Omettre quand il vaut 0");
  assertStringIncludes(prompt, "absent pour continuation daily normale");
  assertStringIncludes(prompt, "clarify_daily_question");
  assertEquals(prompt.includes("coaching_recommendation_to_parent"), false);
  assertStringIncludes(
    prompt,
    "next_question_targets contient exactement une target",
  );
  assertStringIncludes(prompt, "scope prioritaire de la reponse suivante");
  assertEquals(prompt.includes('"turn_count_increment":1'), false);
  assertEquals(prompt.includes('"note_information":null'), false);
  assertEquals(prompt.includes('"exit_memo":{"needed":false'), false);
  assertEquals(prompt.includes("repeat_current_question"), false);
  assertEquals(prompt.includes("repeat_question"), false);
  assertEquals(/\bpartial\b/i.test(prompt), false);
  assertEquals(/partiel|partielle|partiellement/i.test(prompt), false);
  assertEquals(prompt.includes("completion_level"), false);
});

Deno.test("daily visible prompts forbid partial wording and ask binary outcome", () => {
  const clarifyPrompt = dailyActionReviewVisibleSystemPrompt(
    "clarify_outcome",
  );
  const explainPrompt = dailyActionReviewVisibleSystemPrompt("explain_target");

  assertStringIncludes(clarifyPrompt, "faite ou pas faite");
  assertStringIncludes(clarifyPrompt, "Ne dis jamais: fait, pas fait ou en partie");
  assertStringIncludes(clarifyPrompt, "Je vois. Du coup");
  assertStringIncludes(explainPrompt, "est-ce que tu l'as faite aujourd'hui");
  assertStringIncludes(explainPrompt, "Ne dis jamais: fait, pas fait ou en partie");
});

Deno.test("daily visible sanitizer removes partial and faisable wording", () => {
  assertEquals(
    sanitizeDailyActionReviewVisibleText(
      "Pour « Ranger », c’est bien : fait, pas fait, ou en partie ?",
    ),
    "Pour « Ranger », c’est bien : fait ou pas fait ?",
  );
  assertEquals(
    sanitizeDailyActionReviewVisibleText(
      "« Journée sans fumer », c’était tenir la journée. Faisable aujourd’hui ?",
    ),
    "« Journée sans fumer », c’était tenir la journée. Est-ce que tu l'as faite aujourd'hui ?",
  );
});

Deno.test("daily visible context carries recent missed update for humane transition", async () => {
  const targets = [
    target("a1", "Journée sans fumer"),
    target("a2", "Respiration cinq minutes"),
  ];
  const state = {
    source: "daily_action_review_v1",
    skill_id: "daily_action_review_v1",
    intent: "clarify_outcome",
    status: "needs_clarification",
    current_focus_occurrence_ids: ["a1", "a2"],
    remaining_occurrence_ids: [],
    asked_occurrence_ids_history: [["a1", "a2"]],
    items: {
      a1: {
        occurrence_id: "a1",
        plan_item_id: "item-a1",
        plan_id: "plan",
        title: "Journée sans fumer",
        action_type: "habit",
        outcome: "missed",
        reason_category: "emotional",
        reason_text: "j'ai fumé après une contrariété",
        still_relevant: true,
        evidence_text: "pas faite",
        matched_user_text: null,
        confidence: "high",
        missing_slots: [],
      },
      a2: {
        occurrence_id: "a2",
        plan_item_id: "item-a2",
        plan_id: "plan",
        title: "Respiration cinq minutes",
        action_type: "habit",
        outcome: null,
        reason_category: null,
        reason_text: null,
        still_relevant: "unknown",
        evidence_text: null,
        matched_user_text: null,
        confidence: "low",
        missing_slots: ["outcome"],
      },
    },
    next_question: null,
    next_question_targets: ["a2"],
    generated_user_message: null,
    should_apply_effects: false,
    constraints: [],
    effect_plan: { allowed: false, effects: [] },
    stop_reason: null,
    action_intelligence_by_occurrence_id: {},
  };
  let visibleUserPrompt = "";

  await runDailyActionReviewVisibleAgent({
    kind: "clarify_outcome",
    targets,
    state: state as any,
    dispatcherOutput: {
      flow_action: "answer_review",
      confidence: "high",
      risk_score: 0,
      target_resolution: {
        resolved_occurrence_ids: ["a1"],
        ambiguous: false,
      },
      item_updates: {
        a1: {
          update_mode: "set",
          outcome: "missed",
          reason_category: "emotional",
          reason_text: "j'ai fumé après une contrariété",
          still_relevant: true,
          evidence_text: "pas faite",
          matched_user_text: null,
          confidence: "high",
          missing_slots: [],
        },
      },
      daily_intent: { kind: "daily_answer" },
      direct_effect_request: {
        requested: false,
        effect_type: null,
        explicitness: "none",
        target_status: "none",
        confidence_band: "low",
        payload_hint: {
          raw_text: null,
          when_hint: null,
          UTC_time: null,
          local_label: null,
          instruction_hint: null,
        },
        reason: null,
      },
      visible_task: {
        kind: "clarify_outcome",
        conversation_context: {
          known_values: {},
          tone_constraints: [],
          do_not_say: [],
          evidence_used: [],
        } as any,
      },
      child_flow: null,
      return_to_parent: null,
      child_flow_context: null,
      note_information: null,
      exit_memo: null as any,
      state_updates: null as any,
      state_change_intent: { modified_fields: [], clear_fields: [] },
      evidence: [],
    } as any,
    llmRunner: async ({ userPrompt }) => {
      visibleUserPrompt = userPrompt;
      return "Je vois. Du coup, pour « Respiration cinq minutes », est-ce que tu l'as faite aujourd'hui ?";
    },
  });

  const prompt = JSON.parse(visibleUserPrompt);
  const recent =
    prompt.visible_task.conversation_context.known_values
      .recent_collected_update;
  assertEquals(recent.outcome, "missed");
  assertEquals(recent.title, "Journée sans fumer");
  assertEquals(
    recent.transition_hint,
    "acknowledge_briefly_then_continue_daily",
  );
});

Deno.test("daily action review binds short answers to single next question target before batch focus", () => {
  const targets = [
    target("a1", "Ranger deux papiers administratifs"),
    target("a2", "Préparer la pochette documents"),
  ];
  const previousState = {
    source: "daily_action_review_v1",
    skill_id: "daily_action_review_v1",
    intent: "clarify_outcome",
    status: "needs_clarification",
    current_focus_occurrence_ids: ["a1", "a2"],
    remaining_occurrence_ids: ["a1", "a2"],
    asked_occurrence_ids_history: [["a1", "a2"]],
    items: Object.fromEntries(targets.map((item) => [
      item.occurrence_id,
      {
        occurrence_id: item.occurrence_id,
        plan_item_id: item.plan_item_id,
        plan_id: item.plan_id,
        plan_label: null,
        title: item.title,
        action_type: "habit",
        outcome: null,
        reason_category: null,
        reason_text: null,
        still_relevant: "unknown",
        evidence_text: null,
        matched_user_text: null,
        confidence: "low",
        missing_slots: ["outcome"],
      },
    ])),
    next_question:
      "Pour « Ranger deux papiers administratifs », c’est fait ou pas fait ?",
    next_question_targets: ["a1"],
    generated_user_message:
      "Pour « Ranger deux papiers administratifs », c’est fait ou pas fait ?",
    should_apply_effects: false,
    constraints: [],
    effect_plan: { allowed: false, effects: [] },
    stop_reason: null,
    action_intelligence_by_occurrence_id: {},
  };
  const output = sanitizeDailyActionReviewLocalDispatcherOutput({
    targets,
    raw: {
      flow_action: "answer_review",
      confidence: "high",
      target_resolution: {
        resolved_occurrence_ids: [],
        ambiguous: false,
      },
      item_updates: {
        a1: {
          update_mode: "set",
          outcome: "missed",
          reason_category: "fatigue",
          reason_text: "j’étais trop fatiguée",
          still_relevant: true,
          evidence_text:
            "Non, pas fait : j’étais trop fatiguée et j’ai remis ça à plus tard.",
          confidence: "high",
          missing_slots: [],
        },
      },
      daily_intent: { kind: "daily_answer" },
      visible_task: {
        kind: "clarify_outcome",
        conversation_context: {},
      },
      evidence: ["pas fait", "fatigue", "encore pertinent"],
    },
  });
  const decision = dailyReviewDecisionFromLocalDispatcher({
    output,
    state: previousState as any,
    targets,
  });

  assertEquals(decision.target_occurrence_ids, ["a1"]);

  const merged = mergeDailyActionReviewLocalState({
    previous: previousState as any,
    decision,
    targets,
  }).state;

  assertEquals(merged.items.a1.outcome, "missed");
  assertEquals(merged.items.a1.reason_category, "fatigue");
  assertEquals(merged.items.a1.still_relevant, true);
  assertEquals(merged.items.a1.missing_slots, []);
  assertEquals(merged.items.a2.outcome, null);
  assertEquals(merged.items.a2.missing_slots, ["outcome"]);
});

Deno.test("daily action review prompt preserves one-shot direct effect in multi-intent daily turns", () => {
  const prompt = dispatcherSystemPrompt();

  assertStringIncludes(
    prompt,
    "direct_effect_request est independant de flow_action",
  );
  assertStringIncludes(
    prompt,
    "flow_action=answer_review avec item_updates daily ET direct_effect_request complet",
  );
  assertStringIncludes(
    prompt,
    "Ne laisse jamais commit_success, answer_review ou clarify_* absorber ou faire disparaitre le rappel ponctuel",
  );
  assertStringIncludes(prompt, '"flow_action":"answer_review"');
  assertStringIncludes(
    prompt,
    '"direct_effect_request":{"requested":true,"effect_type":"create_one_shot_reminder"',
  );
  assertStringIncludes(prompt, '"raw_text":"Rappelle-moi dans 37 minutes');
  assertStringIncludes(
    prompt,
    '"instruction_hint":"finir les dix minutes de rangement"',
  );
  assertStringIncludes(prompt, '"flow_action":"clarify_outcome"');
  assertStringIncludes(prompt, '"raw_text":"rappelle-moi dans 42 minutes');
});

Deno.test("daily action review has dedicated visible agent specs", () => {
  assertEquals(Object.keys(DAILY_ACTION_REVIEW_VISIBLE_AGENT_SPECS).sort(), [
    "clarify_daily_question",
    "clarify_outcome",
    "clarify_reason",
    "clarify_still_relevant",
    "clarify_which_action",
    "commit_success",
    "explain_target",
    "recap_daily_state",
  ]);
  assertStringIncludes(
    DAILY_ACTION_REVIEW_VISIBLE_AGENT_SPECS.clarify_which_action.source,
    "clarify_which_action",
  );
  assertStringIncludes(
    DAILY_ACTION_REVIEW_VISIBLE_AGENT_SPECS.commit_success.roleLines.join("\n"),
    "committed_effects",
  );
  assertStringIncludes(
    DAILY_ACTION_REVIEW_VISIBLE_AGENT_SPECS.commit_success.roleLines.join("\n"),
    "commit_summary.is_multi_target_commit=true",
  );
  assertStringIncludes(
    DAILY_ACTION_REVIEW_VISIBLE_AGENT_SPECS.commit_success.roleLines.join("\n"),
    "nombre exact",
  );
});

Deno.test("daily action review visible keeps canonical one-shot confirmation rules after stage rules", () => {
  const prompt = dailyActionReviewVisibleSystemPrompt("clarify_outcome");
  const stageIndex = prompt.lastIndexOf("Clarifie seulement l'outcome");
  const oneShotIndex = prompt.lastIndexOf(
    "confirme naturellement le rappel une seule fois",
  );

  assertEquals(stageIndex >= 0, true);
  assertEquals(oneShotIndex > stageIndex, true);
});

Deno.test("daily action review opening prompt uses visible rules and binary wording", () => {
  const prompt = buildDailyActionReviewInstruction([
    target("a1", "Marcher 10 min"),
  ]);

  assertStringIncludes(prompt, "VISIBLE_OUTPUT_STYLE_RULES");
  assertEquals(/partiel|partielle|partiellement/i.test(prompt), false);
  assertEquals(/\bpartial\b/i.test(prompt), false);
});

Deno.test("daily action review explains a target locally without mutating review state", async () => {
  const targets = [target("a1", "Faire un sas de decompression")];
  let visibleSystemPrompt = "";
  let visibleUserPrompt = "";

  const result = await runDailyActionReviewLocalFlow({
    text: "C'est quoi le sas de decompression ?",
    targets,
    previousState: {
      source: "daily_action_review_v1",
      skill_id: "daily_action_review_v1",
      intent: "clarify_outcome",
      status: "needs_clarification",
      current_focus_occurrence_ids: ["a1"],
      remaining_occurrence_ids: [],
      asked_occurrence_ids_history: [["a1"]],
      items: {
        a1: {
          occurrence_id: "a1",
          plan_item_id: "item-a1",
          plan_id: "plan",
          plan_label: null,
          title: "Faire un sas de decompression",
          action_type: "habit",
          outcome: null,
          reason_category: null,
          reason_text: null,
          still_relevant: "unknown",
          evidence_text: null,
          matched_user_text: null,
          confidence: "low",
          missing_slots: ["outcome"],
        },
      },
      next_question: "Tu l'as faite ou pas faite aujourd'hui ?",
      next_question_targets: ["a1"],
      generated_user_message: null,
      should_apply_effects: false,
      constraints: [],
      effect_plan: { allowed: false, effects: [] },
      stop_reason: null,
      action_intelligence_by_occurrence_id: {},
    },
    dispatcherRunner: () =>
      Promise.resolve({
        flow_action: "explain_target",
        confidence: "high",
        risk_score: 0,
        target_resolution: {
          resolved_occurrence_ids: ["a1"],
          ambiguous: false,
          why: "User asks what the selected action means.",
        },
        item_updates: {},
        daily_intent: {
          kind: "action_question",
          summary: "User asks for an explanation of the selected action.",
        },
        state_updates: {
          status_hint: "needs_clarification",
          turn_count_increment: 1,
          close_after_visible: false,
        },
        visible_task: {
          kind: "explain_target",
          instruction:
            "Explain the selected action briefly, then resume binary collection.",
          conversation_context: {},
        },
        note_information: null,
        exit_memo: { needed: false, reason: "none" },
        evidence: ["c'est quoi le sas"],
      }),
    visibleRunner: ({ systemPrompt, userPrompt }) => {
      visibleSystemPrompt = systemPrompt;
      visibleUserPrompt = userPrompt;
      return Promise.resolve(
        "Le sas, c'est juste une transition courte avant de reprendre. Tu l'as faite ou pas faite aujourd'hui ?",
      );
    },
  });

  assertStringIncludes(visibleSystemPrompt, "Stage: explain_target.");
  assertStringIncludes(visibleUserPrompt, "Faire un sas de decompression");
  assertEquals(result.shouldApplyEffects, false);
  assertEquals(result.missingOccurrenceIds, ["a1"]);
  assertEquals(
    result.generatedUserMessage,
    "Le sas, c'est juste une transition courte avant de reprendre. Tu l'as faite ou pas faite aujourd'hui ?",
  );
});

Deno.test("daily action review passes affect context and tone constraints to visible agent", async () => {
  const targets = [target("a1", "Marcher 10 min")];
  let visibleUserPrompt = "";

  await runDailyActionReviewLocalFlow({
    text: "Je suis lessive, je ne sais meme pas si j'y arrive.",
    targets,
    previousState: {
      source: "daily_action_review_v1",
      skill_id: "daily_action_review_v1",
      intent: "clarify_outcome",
      status: "needs_clarification",
      current_focus_occurrence_ids: ["a1"],
      remaining_occurrence_ids: [],
      asked_occurrence_ids_history: [["a1"]],
      items: {
        a1: {
          occurrence_id: "a1",
          plan_item_id: "item-a1",
          plan_id: "plan",
          plan_label: null,
          title: "Marcher 10 min",
          action_type: "habit",
          outcome: null,
          reason_category: null,
          reason_text: null,
          still_relevant: "unknown",
          evidence_text: null,
          matched_user_text: null,
          confidence: "low",
          missing_slots: ["outcome"],
        },
      },
      next_question: "Tu l'as faite ou pas faite aujourd'hui ?",
      next_question_targets: ["a1"],
      generated_user_message: null,
      should_apply_effects: false,
      constraints: [],
      effect_plan: { allowed: false, effects: [] },
      stop_reason: null,
      action_intelligence_by_occurrence_id: {
        a1: {
          source_memory_item_ids: ["mem-1"],
          recent_observations: ["fatigue recurrente le soir"],
          recurring_patterns: ["decrochage quand la journee est chargee"],
          last_weekly_interpretation: null,
          freshness_summary: "recent_data_available",
          suggested_tone: "supportive_investigate",
          risk_of_overcoaching: "medium",
        },
      },
    },
    dispatcherRunner: () =>
      Promise.resolve({
        flow_action: "clarify_outcome",
        confidence: "medium",
        risk_score: 0,
        target_resolution: {
          resolved_occurrence_ids: ["a1"],
          ambiguous: false,
          why: "User has not given a done/not done answer yet.",
        },
        item_updates: {},
        daily_intent: {
          kind: "daily_clarification",
          summary: "User sounds depleted and outcome is still missing.",
        },
        state_updates: {
          status_hint: "needs_clarification",
          turn_count_increment: 1,
          close_after_visible: false,
        },
        visible_task: {
          kind: "clarify_outcome",
          instruction: "Clarify whether the action was done.",
          conversation_context: {},
        },
        note_information: null,
        exit_memo: { needed: false, reason: "none" },
        evidence: ["lessive"],
      }),
    visibleRunner: ({ userPrompt }) => {
      visibleUserPrompt = userPrompt;
      return Promise.resolve("Pour aujourd'hui, elle est faite ou pas faite ?");
    },
  });

  const parsed = JSON.parse(visibleUserPrompt);
  const context = parsed.visible_task.conversation_context;
  assertEquals(context.affect_context.fragile_signal, true);
  assertEquals(context.affect_context.emotional_intensity, "medium");
  assertEquals(
    context.affect_context.suggested_tone,
    "supportive_investigate",
  );
  assertEquals(context.tone_constraints.includes("low_pressure"), true);
  assertEquals(
    Boolean(context.known_values.action_intelligence_by_occurrence_id.a1),
    true,
  );
});

Deno.test("daily action review visible agent receives mandatory runtime context pack", async () => {
  const targets = [target("a1", "Marcher 10 min")];
  let visibleSystemPrompt = "";
  let visibleUserPrompt = "";

  await runDailyActionReviewLocalFlow({
    text: "Je ne sais plus ce que tu demandes.",
    targets,
    previousState: {
      source: "daily_action_review_v1",
      skill_id: "daily_action_review_v1",
      intent: "clarify_outcome",
      status: "needs_clarification",
      current_focus_occurrence_ids: ["a1"],
      remaining_occurrence_ids: [],
      asked_occurrence_ids_history: [["a1"]],
      items: {
        a1: {
          occurrence_id: "a1",
          plan_item_id: "item-a1",
          plan_id: "plan",
          plan_label: null,
          title: "Marcher 10 min",
          action_type: "habit",
          outcome: null,
          reason_category: null,
          reason_text: null,
          still_relevant: "unknown",
          evidence_text: null,
          matched_user_text: null,
          confidence: "low",
          missing_slots: ["outcome"],
        },
      },
      next_question: "Tu l'as faite ou pas faite aujourd'hui ?",
      next_question_targets: ["a1"],
      generated_user_message: null,
      should_apply_effects: false,
      constraints: [],
      effect_plan: { allowed: false, effects: [] },
      stop_reason: null,
      action_intelligence_by_occurrence_id: {},
    },
    recentMessages: [
      { role: "user", content: "u1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "u2" },
      { role: "user", content: "u3" },
      { role: "user", content: "u4" },
      { role: "user", content: "u5" },
      { role: "user", content: "u6" },
    ],
    dispatcherRunner: () =>
      Promise.resolve({
        flow_action: "clarify_daily_question",
        confidence: "high",
        target_resolution: {
          resolved_occurrence_ids: ["a1"],
          ambiguous: false,
        },
        item_updates: {},
        daily_intent: { kind: "daily_clarification" },
        visible_task: {
          kind: "clarify_daily_question",
          conversation_context: {
            tone_constraints: ["short"],
          },
        },
        evidence: ["question unclear"],
      }),
    visibleRunner: ({ systemPrompt, userPrompt }) => {
      visibleSystemPrompt = systemPrompt;
      visibleUserPrompt = userPrompt;
      return Promise.resolve(
        "Je te demande juste si tu l'as faite ou pas faite aujourd'hui.",
      );
    },
  });

  assertStringIncludes(visibleSystemPrompt, "VISIBLE_OUTPUT_STYLE_RULES");
  assertStringIncludes(visibleSystemPrompt, "VISIBLE_CONVERSATION_FLOW_RULES");
  assertStringIncludes(visibleSystemPrompt, "tutoiement");
  const parsed = JSON.parse(visibleUserPrompt);
  assertStringIncludes(
    parsed.visible_runtime_context.style_rules,
    "VISIBLE_OUTPUT_STYLE_RULES",
  );
  assertEquals(
    parsed.visible_runtime_context.recent_user_messages.map((
      message: { content: string },
    ) => message.content),
    ["u2", "u3", "u4", "u5", "u6"],
  );
});

Deno.test("daily action review commit_success receives runtime commit summary for multi-target closure", async () => {
  const targets = [
    { ...target("a1", "Action plan A"), plan_id: "plan-a" },
    { ...target("a2", "Deuxieme action plan A"), plan_id: "plan-a" },
    { ...target("b1", "Action plan B"), plan_id: "plan-b" },
  ];
  const state = {
    source: "daily_action_review_v1",
    skill_id: "daily_action_review_v1",
    intent: "answer_review",
    status: "complete",
    current_focus_occurrence_ids: ["a1", "a2", "b1"],
    remaining_occurrence_ids: [],
    asked_occurrence_ids_history: [["a1", "a2", "b1"]],
    items: Object.fromEntries(targets.map((item) => [
      item.occurrence_id,
      {
        occurrence_id: item.occurrence_id,
        plan_item_id: item.plan_item_id,
        plan_id: item.plan_id,
        plan_label: null,
        title: item.title,
        action_type: "habit",
        outcome: "missed",
        reason_category: "forgot",
        reason_text: "oubli",
        still_relevant: true,
        evidence_text: "pas faite",
        matched_user_text: null,
        confidence: "high",
        missing_slots: [],
      },
    ])),
    next_question: null,
    next_question_targets: [],
    generated_user_message: null,
    should_apply_effects: true,
    effect_plan: { allowed: false, effects: [] },
    stop_reason: "all_required_slots_filled",
    action_intelligence_by_occurrence_id: {},
  };
  let visibleSystemPrompt = "";
  let visibleUserPrompt = "";

  await runDailyActionReviewVisibleAgent({
    kind: "commit_success",
    targets,
    state: state as any,
    committedEffects: targets.map((item) => ({
      type: "log_daily_action_review" as const,
      occurrence_id: item.occurrence_id,
      plan_item_id: item.plan_item_id,
      entry_id: `entry-${item.occurrence_id}`,
      outcome: "missed" as const,
      reason_category: "forgot" as const,
      source: "daily_action_review_v1" as const,
      commit_status: "inserted" as const,
    })),
    llmRunner: async ({ systemPrompt, userPrompt }) => {
      visibleSystemPrompt = systemPrompt;
      visibleUserPrompt = userPrompt;
      return "C'est bon, j'ai le point pour les 3 actions du jour.";
    },
  });

  assertStringIncludes(
    visibleSystemPrompt,
    "commit_summary.is_multi_target_commit=true",
  );
  assertStringIncludes(visibleSystemPrompt, "nombre exact");
  const prompt = JSON.parse(visibleUserPrompt);
  const summary =
    prompt.visible_task.conversation_context.known_values.commit_summary;
  assertEquals(summary.committed_effects_count, 3);
  assertEquals(summary.committed_targets_count, 3);
  assertEquals(summary.plans_count, 2);
  assertEquals(summary.is_multi_target_commit, true);
  assertEquals(summary.is_final_daily_commit, true);
});

Deno.test("daily action review visible agent receives canonical one-shot confirmation context", async () => {
  const targets = [target("a1", "Marcher 10 min")];
  const state = {
    source: "daily_action_review_v1",
    skill_id: "daily_action_review_v1",
    intent: "answer_review",
    status: "needs_clarification",
    current_focus_occurrence_ids: ["a1"],
    remaining_occurrence_ids: [],
    asked_occurrence_ids_history: [["a1"]],
    items: {
      a1: {
        occurrence_id: "a1",
        plan_item_id: "item-a1",
        plan_id: "plan",
        plan_label: null,
        title: "Marcher 10 min",
        action_type: "habit",
        outcome: null,
        reason_category: null,
        reason_text: null,
        still_relevant: "unknown",
        evidence_text: null,
        matched_user_text: null,
        confidence: "low",
        missing_slots: ["outcome"],
      },
    },
    next_question: "Tu l'as faite ou pas faite aujourd'hui ?",
    next_question_targets: ["a1"],
    generated_user_message: null,
    should_apply_effects: false,
    constraints: [],
    effect_plan: { allowed: false, effects: [] },
    stop_reason: null,
    action_intelligence_by_occurrence_id: {},
  };
  let visibleSystemPrompt = "";
  let visibleUserPrompt = "";

  await runDailyActionReviewVisibleAgent({
    kind: "clarify_outcome",
    targets,
    state: state as any,
    dispatcherOutput: {
      flow_action: "clarify_outcome",
      confidence: "medium",
      risk_score: 0,
      target_resolution: {
        resolved_occurrence_ids: ["a1"],
        ambiguous: false,
      },
      item_updates: {},
      daily_intent: { kind: "daily_clarification" },
      direct_effect_request: {
        requested: true,
        effect_type: "create_one_shot_reminder",
        explicitness: "explicit",
        target_status: "identified",
        confidence_band: "high",
        payload_hint: {
          raw_text: "rappelle-moi dans 42 minutes de marcher",
          when_hint: "dans 42 minutes",
          UTC_time: "2026-06-26T13:20:00.000Z",
          local_label: "dans 42 minutes",
          instruction_hint: "marcher",
        },
        reason: "rappel ponctuel explicite",
      },
      visible_task: {
        kind: "clarify_outcome",
        conversation_context: {
          known_values: {
            direct_effect_confirmation_context: {
              has_committed_one_shot_reminder: true,
              has_requested_one_shot_reminder: true,
              one_shot_reminder: {
                committed: true,
                local_label: "dans 42 minutes",
                reminder_instruction: "marcher",
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
            },
          },
        },
      },
      evidence: ["rappel ponctuel explicite"],
    } as any,
    llmRunner: async ({ systemPrompt, userPrompt }) => {
      visibleSystemPrompt = systemPrompt;
      visibleUserPrompt = userPrompt;
      return "Je te le rappellerai dans 42 minutes. Et pour marcher, c'est fait ou pas fait ?";
    },
  });

  assertStringIncludes(
    visibleSystemPrompt,
    "confirme naturellement le rappel une seule fois",
  );
  const prompt = JSON.parse(visibleUserPrompt);
  const context = prompt.visible_task.conversation_context.known_values
    .direct_effect_confirmation_context;
  assertEquals(context.has_committed_one_shot_reminder, true);
  assertEquals(context.one_shot_reminder.committed, true);
  assertEquals(context.one_shot_reminder.local_label, "dans 42 minutes");
  assertEquals(context.one_shot_reminder.reminder_instruction, "marcher");
});

Deno.test("daily action review normalizes legacy partial output as completed", () => {
  const output = sanitizeDailyActionReviewLocalDispatcherOutput({
    targets: [target("a1", "Marcher 10 min")],
    raw: {
      flow_action: "answer_review",
      confidence: "high",
      risk_score: 0,
      target_resolution: {
        resolved_occurrence_ids: ["a1"],
        ambiguous: false,
        why: "User reports concrete progress.",
      },
      item_updates: {
        a1: {
          update_mode: "set",
          outcome: "partial",
          reason_category: "other",
          reason_text: "old model output",
          still_relevant: true,
          evidence_text: "j'en ai fait une partie",
          matched_user_text: "j'en ai fait une partie",
          confidence: "high",
          missing_slots: ["completion_level", "reason"],
        },
      },
      daily_intent: {
        kind: "daily_answer",
        summary: "User reports concrete progress.",
      },
      state_updates: {
        status_hint: "complete",
        turn_count_increment: 1,
        close_after_visible: false,
      },
      visible_task: {
        kind: "commit_success",
        instruction: "",
        conversation_context: {},
      },
      note_information: null,
      exit_memo: { needed: false, reason: "none" },
      evidence: ["concrete progress"],
    },
  });

  assertEquals(output.item_updates.a1.outcome, "completed");
  assertEquals(output.item_updates.a1.missing_slots, []);
});

Deno.test("daily action review accepts sparse dispatcher output for normal continuation", () => {
  const output = sanitizeDailyActionReviewLocalDispatcherOutput({
    targets: [target("a1", "Marcher 10 min")],
    raw: {
      flow_action: "answer_review",
      confidence: "high",
      target_resolution: {
        resolved_occurrence_ids: ["a1"],
        ambiguous: false,
      },
      item_updates: {
        a1: {
          update_mode: "set",
          outcome: "completed",
          evidence_text: "oui, je l'ai fait",
          confidence: "high",
        },
      },
      daily_intent: { kind: "daily_answer" },
      visible_task: {
        kind: "commit_success",
        conversation_context: {
          tone_constraints: ["short"],
          do_not_say: ["dire que c'est enregistre avant commit"],
        },
      },
      evidence: ["completed action evidence"],
    },
  });

  assertEquals(output.risk_score, 0);
  assertEquals(output.note_information, null);
  assertEquals(output.exit_memo.needed, false);
  assertEquals(output.state_updates.turn_count_increment, 1);
  assertEquals(output.state_updates.close_after_visible, false);
  assertEquals(output.visible_task.instruction, "");
  assertEquals(output.item_updates.a1.outcome, "completed");
  assertEquals(output.item_updates.a1.reason_category, null);
  assertEquals(output.item_updates.a1.reason_text, null);
  assertEquals(output.item_updates.a1.still_relevant, "unknown");
  assertEquals(output.item_updates.a1.missing_slots, []);
});

Deno.test("daily action review asks remaining target instead of rendering success before commit", async () => {
  const targets = [
    target("done-1", "Faire un sas de decompression"),
    target("done-2", "Ranger le materiel"),
    target("missing-3", "Cibler le joint reflexe"),
  ];
  const previousState = {
    source: "daily_action_review_v1",
    skill_id: "daily_action_review_v1",
    intent: "answer_review",
    status: "needs_clarification",
    current_focus_occurrence_ids: ["done-1", "done-2"],
    remaining_occurrence_ids: ["missing-3"],
    asked_occurrence_ids_history: [["done-1", "done-2"]],
    items: {
      "done-1": {
        occurrence_id: "done-1",
        plan_item_id: "item-done-1",
        plan_id: "plan",
        plan_label: null,
        title: "Faire un sas de decompression",
        action_type: "habit",
        outcome: "completed",
        reason_category: "none",
        reason_text: null,
        still_relevant: "unknown",
        evidence_text: "les deux actions sont faites",
        matched_user_text: "les deux actions sont faites",
        confidence: "high",
        missing_slots: [],
      },
      "done-2": {
        occurrence_id: "done-2",
        plan_item_id: "item-done-2",
        plan_id: "plan",
        plan_label: null,
        title: "Ranger le materiel",
        action_type: "mission",
        outcome: "completed",
        reason_category: "none",
        reason_text: null,
        still_relevant: "unknown",
        evidence_text: "les deux actions sont faites",
        matched_user_text: "les deux actions sont faites",
        confidence: "high",
        missing_slots: [],
      },
      "missing-3": {
        occurrence_id: "missing-3",
        plan_item_id: "item-missing-3",
        plan_id: "plan",
        plan_label: null,
        title: "Cibler le joint reflexe",
        action_type: "clarification",
        outcome: null,
        reason_category: null,
        reason_text: null,
        still_relevant: "unknown",
        evidence_text: null,
        matched_user_text: null,
        confidence: "low",
        missing_slots: ["outcome"],
      },
    },
    next_question: "C'est note pour les deux actions.",
    next_question_targets: ["done-1", "done-2"],
    generated_user_message: "C'est note pour les deux actions.",
    should_apply_effects: false,
    constraints: [],
    effect_plan: { allowed: false, effects: [] },
    stop_reason: null,
    action_intelligence_by_occurrence_id: {},
  };
  let visibleSystemPrompt = "";
  let visibleUserPrompt = "";

  const result = await runDailyActionReviewLocalFlow({
    text: "Note-les comme faites, merci.",
    targets,
    previousState,
    dispatcherRunner: () =>
      Promise.resolve({
        flow_action: "answer_review",
        confidence: "high",
        risk_score: 0,
        target_resolution: {
          resolved_occurrence_ids: ["done-1", "done-2"],
          ambiguous: false,
          why: "User confirms the current focus.",
        },
        item_updates: {
          "done-1": {
            update_mode: "set",
            outcome: "completed",
            reason_category: "none",
            reason_text: null,
            still_relevant: true,
            evidence_text: "Note-les comme faites",
            matched_user_text: "Note-les comme faites, merci.",
            confidence: "high",
            missing_slots: [],
          },
          "done-2": {
            update_mode: "set",
            outcome: "completed",
            reason_category: "none",
            reason_text: null,
            still_relevant: true,
            evidence_text: "Note-les comme faites",
            matched_user_text: "Note-les comme faites, merci.",
            confidence: "high",
            missing_slots: [],
          },
        },
        daily_intent: {
          kind: "daily_answer",
          summary: "User confirms the current focus.",
        },
        state_updates: {
          status_hint: "complete",
          turn_count_increment: 1,
          close_after_visible: false,
        },
        visible_task: {
          kind: "commit_success",
          instruction: "",
          conversation_context: {},
        },
        note_information: null,
        exit_memo: { needed: false, reason: "none" },
        evidence: ["current focus complete"],
      }),
    visibleRunner: ({ systemPrompt, userPrompt }) => {
      visibleSystemPrompt = systemPrompt;
      visibleUserPrompt = userPrompt;
      return Promise.resolve("Il me reste juste Cibler le joint reflexe.");
    },
  });

  assertStringIncludes(visibleSystemPrompt, "Stage: clarify_outcome.");
  assertStringIncludes(visibleUserPrompt, "Cibler le joint reflexe");
  const visiblePayload = JSON.parse(visibleUserPrompt);
  assertEquals(
    visiblePayload.visible_task.conversation_context.known_values.targets.map((
      item: { occurrence_id: string },
    ) => item.occurrence_id),
    ["missing-3"],
  );
  assertEquals(result.shouldApplyEffects, false);
  assertEquals(result.state.current_focus_occurrence_ids, ["missing-3"]);
  assertEquals(result.state.remaining_occurrence_ids, []);
  assertEquals(result.state.asked_occurrence_ids_history, [
    ["done-1", "done-2"],
    ["missing-3"],
  ]);
  assertEquals(result.state.next_question_targets, ["missing-3"]);
  assertEquals(result.state.items["missing-3"].missing_slots, ["outcome"]);
  assertEquals(
    result.generatedUserMessage,
    "Il me reste juste Cibler le joint reflexe.",
  );
});

Deno.test("daily action review preserves current focus until every focused target has outcome", async () => {
  const targets = [
    target("a1", "Journee sans cannabis"),
    target("a2", "Organiser une soiree zero vide"),
    target("a3", "Respiration minute avant envie"),
    target("a4", "Preparer une alternative du soir"),
  ];
  const previousState = {
    source: "daily_action_review_v1",
    skill_id: "daily_action_review_v1",
    intent: "clarify_still_relevant",
    status: "needs_clarification",
    current_focus_occurrence_ids: ["a1", "a2"],
    remaining_occurrence_ids: ["a3", "a4"],
    asked_occurrence_ids_history: [["a1", "a2"]],
    items: {
      a1: {
        occurrence_id: "a1",
        plan_item_id: "item-a1",
        plan_id: "plan",
        plan_label: null,
        title: "Journee sans cannabis",
        action_type: "habit",
        outcome: "missed",
        reason_category: null,
        reason_text: "j'ai craque dans l'apres-midi",
        still_relevant: "unknown",
        evidence_text: "j'ai craque dans l'apres-midi",
        matched_user_text: "j'ai craque dans l'apres-midi",
        confidence: "high",
        missing_slots: ["still_relevant"],
      },
      a2: {
        occurrence_id: "a2",
        plan_item_id: "item-a2",
        plan_id: "plan",
        plan_label: null,
        title: "Organiser une soiree zero vide",
        action_type: "mission",
        outcome: null,
        reason_category: null,
        reason_text: null,
        still_relevant: "unknown",
        evidence_text: null,
        matched_user_text: null,
        confidence: "low",
        missing_slots: ["outcome"],
      },
      a3: {
        occurrence_id: "a3",
        plan_item_id: "item-a3",
        plan_id: "plan-2",
        plan_label: null,
        title: "Respiration minute avant envie",
        action_type: "habit",
        outcome: null,
        reason_category: null,
        reason_text: null,
        still_relevant: "unknown",
        evidence_text: null,
        matched_user_text: null,
        confidence: "low",
        missing_slots: ["not_asked", "outcome"],
      },
      a4: {
        occurrence_id: "a4",
        plan_item_id: "item-a4",
        plan_id: "plan-2",
        plan_label: null,
        title: "Preparer une alternative du soir",
        action_type: "mission",
        outcome: null,
        reason_category: null,
        reason_text: null,
        still_relevant: "unknown",
        evidence_text: null,
        matched_user_text: null,
        confidence: "low",
        missing_slots: ["not_asked", "outcome"],
      },
    },
    next_question:
      "Est-ce que la journee sans cannabis reste pertinente pour demain ?",
    next_question_targets: ["a1"],
    generated_user_message:
      "Est-ce que la journee sans cannabis reste pertinente pour demain ?",
    should_apply_effects: false,
    constraints: [],
    effect_plan: { allowed: false, effects: [] },
    stop_reason: null,
    action_intelligence_by_occurrence_id: {},
  };
  let visibleUserPrompt = "";

  const result = await runDailyActionReviewLocalFlow({
    text: "Oui, ça reste pertinent pour demain.",
    targets,
    previousState,
    dispatcherRunner: () =>
      Promise.resolve({
        flow_action: "answer_review",
        confidence: "high",
        target_resolution: {
          resolved_occurrence_ids: ["a1"],
          ambiguous: false,
        },
        item_updates: {
          a1: {
            update_mode: "set",
            outcome: "missed",
            reason_text: null,
            still_relevant: true,
            evidence_text: "ça reste pertinent pour demain",
            confidence: "high",
            missing_slots: [],
          },
        },
        daily_intent: { kind: "daily_answer" },
        visible_task: {
          kind: "clarify_outcome",
          conversation_context: { tone_constraints: ["short"] },
        },
        evidence: ["still relevant"],
      }),
    visibleRunner: ({ userPrompt }) => {
      visibleUserPrompt = userPrompt;
      return Promise.resolve(
        "Et pour Organiser une soiree zero vide, tu l'as faite ou pas faite ?",
      );
    },
  });

  const visiblePayload = JSON.parse(visibleUserPrompt);
  assertEquals(result.state.current_focus_occurrence_ids, ["a1", "a2"]);
  assertEquals(result.state.remaining_occurrence_ids, ["a3", "a4"]);
  assertEquals(result.state.next_question_targets, ["a2"]);
  assertEquals(
    result.state.items.a1.reason_text,
    "j'ai craque dans l'apres-midi",
  );
  assertEquals(result.state.items.a1.reason_category, "emotional");
  assertEquals(
    result.state.items.a1.evidence_text,
    "j'ai craque dans l'apres-midi",
  );
  assertEquals(
    visiblePayload.visible_task.conversation_context.known_values.targets.map((
      item: { occurrence_id: string },
    ) => item.occurrence_id),
    ["a2"],
  );
  assertEquals(
    visiblePayload.visible_task.conversation_context.selected_candidate.title,
    "Organiser une soiree zero vide",
  );
  assertEquals(result.generatedUserMessage?.includes("zero vide"), true);
});

Deno.test("daily action review blocks spillover update for unmentioned remaining target", () => {
  const targets = [
    target("a1", "Journee sans fumer"),
    target("a2", "Respiration cinq minutes"),
    target("a3", "Ranger deux papiers administratifs"),
    target("a4", "Preparer la pochette documents"),
  ];
  const previous = {
    status: "needs_clarification",
    stop_reason: null,
    current_focus_occurrence_ids: ["a3", "a4"],
    remaining_occurrence_ids: [],
    asked_occurrence_ids_history: [["a1", "a2"], ["a3", "a4"]],
    next_question: "Pour Ranger deux papiers administratifs, c'est fait ?",
    next_question_targets: ["a3"],
    generated_user_message:
      "Pour Ranger deux papiers administratifs, c'est fait ?",
    should_apply_effects: false,
    effect_plan: { allowed: false, effects: [] },
    items: {
      a1: {
        occurrence_id: "a1",
        plan_item_id: "item-a1",
        plan_id: "plan",
        plan_label: null,
        title: "Journee sans fumer",
        action_type: "habit",
        outcome: "missed",
        reason_category: "emotional",
        reason_text: "j'ai fume apres une contrariete",
        still_relevant: true,
        evidence_text: "j'ai fume apres une contrariete",
        matched_user_text: "j'ai fume apres une contrariete",
        confidence: "high",
        missing_slots: [],
      },
      a2: {
        occurrence_id: "a2",
        plan_item_id: "item-a2",
        plan_id: "plan",
        plan_label: null,
        title: "Respiration cinq minutes",
        action_type: "habit",
        outcome: "missed",
        reason_category: "forgot",
        reason_text: "j'ai oublie quand l'envie est montee",
        still_relevant: true,
        evidence_text: "j'ai oublie quand l'envie est montee",
        matched_user_text: "j'ai oublie quand l'envie est montee",
        confidence: "high",
        missing_slots: [],
      },
      a3: {
        occurrence_id: "a3",
        plan_item_id: "item-a3",
        plan_id: "plan-2",
        plan_label: null,
        title: "Ranger deux papiers administratifs",
        action_type: "mission",
        outcome: null,
        reason_category: null,
        reason_text: null,
        still_relevant: "unknown",
        evidence_text: null,
        matched_user_text: null,
        confidence: "low",
        missing_slots: ["outcome"],
      },
      a4: {
        occurrence_id: "a4",
        plan_item_id: "item-a4",
        plan_id: "plan-2",
        plan_label: null,
        title: "Preparer la pochette documents",
        action_type: "mission",
        outcome: null,
        reason_category: null,
        reason_text: null,
        still_relevant: "unknown",
        evidence_text: null,
        matched_user_text: null,
        confidence: "low",
        missing_slots: ["outcome"],
      },
    },
  } as any;

  const reduced = mergeDailyActionReviewLocalState({
    previous,
    targets,
    decision: {
      skill_id: "daily_action_review_v1",
      intent: "answer_review",
      status: "complete",
      target_occurrence_ids: ["a3", "a4"],
      item_updates: {
        a3: {
          outcome: "missed",
          reason_category: "fatigue",
          reason_text: "j'etais trop fatiguee",
          still_relevant: true,
          evidence_text: "j'etais trop fatiguee",
          matched_user_text: "Non, pas fait : j'etais trop fatiguee.",
          confidence: "high",
          missing_slots: [],
        },
        a4: {
          outcome: "missed",
          reason_category: "fatigue",
          reason_text: "j'etais trop fatiguee",
          still_relevant: true,
          evidence_text: "j'etais trop fatiguee",
          matched_user_text: "Non, pas fait : j'etais trop fatiguee.",
          confidence: "high",
          missing_slots: [],
        },
      },
      item_update_modes: { a3: "set", a4: "set" },
      constraints: [],
      next_question: null,
      next_question_targets: ["a3", "a4"],
      generated_user_message: null,
      should_apply_effects: true,
      stop_reason: null,
      effect_plan: { allowed: true, effects: [] },
    },
  });

  assertEquals(reduced.state.items.a3.outcome, "missed");
  assertEquals(reduced.state.items.a4.outcome, null);
  assertEquals(reduced.state.should_apply_effects, false);
  assertEquals(reduced.state.status, "needs_clarification");
  assertEquals(reduced.state.next_question_targets, ["a4"]);
  assertEquals(
    reduced.state_mutation_audit.rejected_changes.some((change) =>
      change.field === "items.a4" &&
      change.reason_code === "selected_option_missing"
    ),
    true,
  );
});

Deno.test("daily action review allows explicit global update for remaining targets", () => {
  const targets = [
    target("a1", "Journee sans fumer"),
    target("a2", "Respiration cinq minutes"),
    target("a3", "Ranger deux papiers administratifs"),
    target("a4", "Preparer la pochette documents"),
  ];
  const previous = {
    status: "needs_clarification",
    stop_reason: null,
    current_focus_occurrence_ids: ["a3", "a4"],
    remaining_occurrence_ids: [],
    asked_occurrence_ids_history: [["a1", "a2"], ["a3", "a4"]],
    next_question: "Pour Ranger deux papiers administratifs, c'est fait ?",
    next_question_targets: ["a3"],
    generated_user_message:
      "Pour Ranger deux papiers administratifs, c'est fait ?",
    should_apply_effects: false,
    effect_plan: { allowed: false, effects: [] },
    items: {
      a1: {
        occurrence_id: "a1",
        plan_item_id: "item-a1",
        plan_id: "plan",
        plan_label: null,
        title: "Journee sans fumer",
        action_type: "habit",
        outcome: "missed",
        reason_category: "emotional",
        reason_text: "j'ai fume apres une contrariete",
        still_relevant: true,
        evidence_text: "j'ai fume apres une contrariete",
        matched_user_text: "j'ai fume apres une contrariete",
        confidence: "high",
        missing_slots: [],
      },
      a2: {
        occurrence_id: "a2",
        plan_item_id: "item-a2",
        plan_id: "plan",
        plan_label: null,
        title: "Respiration cinq minutes",
        action_type: "habit",
        outcome: "missed",
        reason_category: "forgot",
        reason_text: "j'ai oublie quand l'envie est montee",
        still_relevant: true,
        evidence_text: "j'ai oublie quand l'envie est montee",
        matched_user_text: "j'ai oublie quand l'envie est montee",
        confidence: "high",
        missing_slots: [],
      },
      a3: {
        occurrence_id: "a3",
        plan_item_id: "item-a3",
        plan_id: "plan-2",
        plan_label: null,
        title: "Ranger deux papiers administratifs",
        action_type: "mission",
        outcome: null,
        reason_category: null,
        reason_text: null,
        still_relevant: "unknown",
        evidence_text: null,
        matched_user_text: null,
        confidence: "low",
        missing_slots: ["outcome"],
      },
      a4: {
        occurrence_id: "a4",
        plan_item_id: "item-a4",
        plan_id: "plan-2",
        plan_label: null,
        title: "Preparer la pochette documents",
        action_type: "mission",
        outcome: null,
        reason_category: null,
        reason_text: null,
        still_relevant: "unknown",
        evidence_text: null,
        matched_user_text: null,
        confidence: "low",
        missing_slots: ["outcome"],
      },
    },
  } as any;

  const reduced = mergeDailyActionReviewLocalState({
    previous,
    targets,
    decision: {
      skill_id: "daily_action_review_v1",
      intent: "answer_review",
      status: "complete",
      target_occurrence_ids: ["a3", "a4"],
      item_updates: {
        a3: {
          outcome: "missed",
          reason_category: "fatigue",
          reason_text: "trop fatiguee",
          still_relevant: true,
          evidence_text: "les deux dernieres pas faites, trop fatiguee",
          matched_user_text:
            "Les deux dernieres pas faites, meme raison : trop fatiguee. Je les garde.",
          confidence: "high",
          missing_slots: [],
        },
        a4: {
          outcome: "missed",
          reason_category: "fatigue",
          reason_text: "trop fatiguee",
          still_relevant: true,
          evidence_text: "les deux dernieres pas faites, trop fatiguee",
          matched_user_text:
            "Les deux dernieres pas faites, meme raison : trop fatiguee. Je les garde.",
          confidence: "high",
          missing_slots: [],
        },
      },
      item_update_modes: { a3: "set", a4: "set" },
      constraints: [],
      next_question: null,
      next_question_targets: ["a3", "a4"],
      generated_user_message: null,
      should_apply_effects: true,
      stop_reason: null,
      effect_plan: { allowed: true, effects: [] },
    },
  });

  assertEquals(reduced.state.items.a3.outcome, "missed");
  assertEquals(reduced.state.items.a4.outcome, "missed");
  assertEquals(reduced.state.should_apply_effects, true);
  assertEquals(reduced.state.status, "complete");
  assertEquals(reduced.state.effect_plan.effects.length, 4);
});

Deno.test("daily action review visible clarification stages require explicit target title", () => {
  for (
    const kind of [
      "clarify_outcome",
      "clarify_reason",
      "clarify_still_relevant",
    ] as const
  ) {
    const lines = DAILY_ACTION_REVIEW_VISIBLE_AGENT_SPECS[kind].roleLines.join(
      "\n",
    );
    assertStringIncludes(lines, "cite explicitement ce titre");
    assertStringIncludes(lines, "N'utilise pas seulement un pronom");
  }
});

Deno.test("daily action review reducer removes stale reason missing slot after reason capture", () => {
  const targets = [target("a1", "Ranger le materiel")];
  const previous = {
    status: "needs_clarification",
    stop_reason: null,
    items: {
      a1: {
        occurrence_id: "a1",
        plan_item_id: "item-a1",
        plan_id: "plan",
        plan_label: null,
        title: "Ranger le materiel",
        action_type: "mission",
        outcome: "missed",
        reason_category: "fatigue",
        reason_text: "trop crevee / fatigue",
        still_relevant: true,
        evidence_text: "La fatigue, vraiment.",
        matched_user_text: "La fatigue, vraiment.",
        confidence: "high",
        missing_slots: ["reason"],
      },
    },
    current_focus_occurrence_ids: ["a1"],
    remaining_occurrence_ids: [],
    asked_occurrence_ids_history: [["a1"]],
    next_question: "Tu peux me dire la raison ?",
    next_question_targets: ["a1"],
    generated_user_message: "Tu peux me dire la raison ?",
    should_apply_effects: false,
    effect_plan: { allowed: false, effects: [] },
  } as any;

  const reduced = mergeDailyActionReviewLocalState({
    previous,
    targets,
    decision: {
      skill_id: "daily_action_review_v1",
      intent: "clarify_reason",
      status: "needs_clarification",
      target_occurrence_ids: ["a1"],
      item_updates: {},
      item_update_modes: {},
      constraints: [],
      next_question: null,
      next_question_targets: [],
      generated_user_message: null,
      should_apply_effects: false,
      stop_reason: null,
      effect_plan: { allowed: false, effects: [] },
    },
  });

  assertEquals(reduced.state.items.a1.reason_category, "fatigue");
  assertEquals(reduced.state.items.a1.reason_text, "trop crevee / fatigue");
  assertEquals(reduced.state.items.a1.missing_slots, []);
  assertEquals(reduced.state.should_apply_effects, true);
  assertEquals(reduced.state.status, "complete");
});

Deno.test("daily action review reducer infers clear reason categories from reason text", () => {
  const targets = [
    target("fatigue-1", "Ranger le materiel"),
    target("fatigue-2", "Faire un sas"),
    target("fatigue-3", "Cibler le joint"),
    target("forgot-1", "Marcher 10 min"),
    target("external-1", "Preparer le sac"),
    target("emotional-1", "Journee sans cannabis"),
    target("unclear-1", "Lire deux pages"),
  ];
  const item = (id: string, reasonText: string) => ({
    occurrence_id: id,
    plan_item_id: `item-${id}`,
    plan_id: "plan",
    plan_label: null,
    title: id,
    action_type: "mission",
    outcome: "missed",
    reason_category: null,
    reason_text: reasonText,
    still_relevant: true,
    evidence_text: reasonText,
    matched_user_text: reasonText,
    confidence: "high",
    missing_slots: [],
  });
  const previous = {
    status: "needs_clarification",
    stop_reason: null,
    items: {
      "fatigue-1": item("fatigue-1", "j'etais epuisee"),
      "fatigue-2": item("fatigue-2", "epuisement"),
      "fatigue-3": item("fatigue-3", "j'etais HS"),
      "forgot-1": item("forgot-1", "j'ai oublie"),
      "external-1": item("external-1", "un imprevu au travail"),
      "emotional-1": item("emotional-1", "j'ai craque dans l'apres-midi"),
      "unclear-1": item("unclear-1", "pas le bon moment"),
    },
    current_focus_occurrence_ids: targets.map((entry) => entry.occurrence_id),
    remaining_occurrence_ids: [],
    asked_occurrence_ids_history: [
      targets.map((entry) => entry.occurrence_id),
    ],
    should_apply_effects: false,
    effect_plan: { allowed: false, effects: [] },
  } as any;

  const reduced = mergeDailyActionReviewLocalState({
    previous,
    targets,
    decision: {
      skill_id: "daily_action_review_v1",
      intent: "answer_review",
      status: "needs_clarification",
      target_occurrence_ids: targets.map((entry) => entry.occurrence_id),
      item_updates: {},
      item_update_modes: {},
      constraints: [],
      next_question: null,
      next_question_targets: [],
      generated_user_message: null,
      should_apply_effects: false,
      stop_reason: null,
      effect_plan: { allowed: false, effects: [] },
    },
  });

  assertEquals(reduced.state.items["fatigue-1"].reason_category, "fatigue");
  assertEquals(reduced.state.items["fatigue-2"].reason_category, "fatigue");
  assertEquals(reduced.state.items["fatigue-3"].reason_category, "fatigue");
  assertEquals(reduced.state.items["forgot-1"].reason_category, "forgot");
  assertEquals(reduced.state.items["external-1"].reason_category, "external");
  assertEquals(
    reduced.state.items["emotional-1"].reason_category,
    "emotional",
  );
  assertEquals(reduced.state.items["unclear-1"].reason_category, null);
  assertEquals(
    reduced.state.items["unclear-1"].reason_text,
    "pas le bon moment",
  );
});

Deno.test("daily action review overrides still relevant stage when outcome is missing", async () => {
  const targets = [target("a1", "Cibler le joint reflexe")];
  const previousState = {
    source: "daily_action_review_v1",
    skill_id: "daily_action_review_v1",
    intent: "clarify_outcome",
    status: "needs_clarification",
    current_focus_occurrence_ids: ["a1"],
    remaining_occurrence_ids: [],
    asked_occurrence_ids_history: [["a1"]],
    items: {
      a1: {
        occurrence_id: "a1",
        plan_item_id: "item-a1",
        plan_id: "plan",
        plan_label: null,
        title: "Cibler le joint reflexe",
        action_type: "clarification",
        outcome: null,
        reason_category: null,
        reason_text: null,
        still_relevant: "unknown",
        evidence_text: null,
        matched_user_text: null,
        confidence: "low",
        missing_slots: ["outcome"],
      },
    },
    next_question: "Tu l'as faite ou pas faite aujourd'hui ?",
    next_question_targets: ["a1"],
    generated_user_message: null,
    should_apply_effects: false,
    constraints: [],
    effect_plan: { allowed: false, effects: [] },
    stop_reason: null,
    action_intelligence_by_occurrence_id: {},
  };
  let visibleSystemPrompt = "";

  const result = await runDailyActionReviewLocalFlow({
    text: "La raison utile pour le bilan : fatigue.",
    targets,
    previousState,
    dispatcherRunner: () =>
      Promise.resolve({
        flow_action: "clarify_still_relevant",
        confidence: "medium",
        risk_score: 0,
        target_resolution: {
          resolved_occurrence_ids: ["a1"],
          ambiguous: false,
          why: "Dispatcher incorrectly asks relevance.",
        },
        item_updates: {
          a1: {
            update_mode: "none",
            outcome: "unclear",
            reason_category: null,
            reason_text: null,
            still_relevant: "unknown",
            evidence_text: null,
            matched_user_text: null,
            confidence: "low",
            missing_slots: ["outcome"],
          },
        },
        daily_intent: {
          kind: "daily_clarification",
          summary: "Outcome is still missing.",
        },
        state_updates: {
          status_hint: "needs_clarification",
          turn_count_increment: 1,
          close_after_visible: false,
        },
        visible_task: {
          kind: "clarify_still_relevant",
          instruction: "",
          conversation_context: {},
        },
        note_information: null,
        exit_memo: { needed: false, reason: "none" },
        evidence: ["outcome still missing"],
      }),
    visibleRunner: ({ systemPrompt }) => {
      visibleSystemPrompt = systemPrompt;
      return Promise.resolve("Tu l'as faite ou pas faite aujourd'hui ?");
    },
  });

  assertStringIncludes(visibleSystemPrompt, "Stage: clarify_outcome.");
  assertEquals(result.shouldApplyEffects, false);
  assertEquals(result.state.items.a1.missing_slots, ["outcome"]);
  assertEquals(
    result.generatedUserMessage,
    "Tu l'as faite ou pas faite aujourd'hui ?",
  );
});

Deno.test("daily action review normalizes removed local handoff to global exit", () => {
  const removedHandoff = ["handoff", "to", "local", "flow"].join("_");
  const removedTarget = ["prepare", "defense", "card"].join("_");
  const removedLikelyIntent = ["select", "state", "potion"].join("_");
  const output = sanitizeDailyActionReviewLocalDispatcherOutput({
    targets: [target("a1", "Marcher 10 min")],
    raw: {
      flow_action: removedHandoff,
      confidence: "high",
      risk_score: 0,
      target_resolution: {
        resolved_occurrence_ids: [],
        ambiguous: false,
        why: "User asks for a removed local flow.",
      },
      item_updates: {},
      daily_intent: {
        kind: "off_topic",
        summary: "User asks for a removed local flow.",
      },
      state_updates: {
        status_hint: "blocked",
        turn_count_increment: 1,
        close_after_visible: true,
      },
      visible_task: {
        kind: "exit_or_cancel",
        instruction: "Exit to global.",
        conversation_context: {},
      },
      note_information: {
        source_flow_id: "daily_action_review_v1",
        handoff_reason: "bridge",
        target_dispatcher: removedTarget,
        handoff_context_for_next_dispatcher:
          "Daily exits because user asked for a removed local flow.",
        structured_context: {
          recommended_next_focus: removedTarget,
          target_flow: removedLikelyIntent,
        },
        confidence: "high",
      },
      exit_memo: {
        needed: true,
        reason: "normal_coaching",
        user_intent_summary: "User asks for a removed local flow.",
        local_flow_context: {
          skill_id: "daily_action_review_v1",
          targets: [],
          current_daily_state: "blocked",
          collected_updates_summary: null,
          missing_slots: [],
          committed_effects: [],
        },
        handoff_hint_for_global_dispatcher: {
          likely_intent: removedLikelyIntent,
          why: "Removed local flow.",
        },
      },
      evidence: ["prepare une carte"],
    },
  });

  assertEquals(output.flow_action, "exit_to_global_dispatcher");
  assertEquals(output.note_information?.target_dispatcher, "global");
});

Deno.test("daily action review maps legacy stop and defer tokens to global exit", () => {
  for (const legacyAction of ["user_stopped", "cancel_flow", "defer_flow"]) {
    const output = sanitizeDailyActionReviewLocalDispatcherOutput({
      targets: [target("a1", "Marcher 10 min")],
      raw: {
        flow_action: legacyAction,
        confidence: "high",
        target_resolution: {
          resolved_occurrence_ids: [],
          ambiguous: false,
        },
        item_updates: {},
        daily_intent: {
          kind: "stop",
          summary: "User wants to stop daily.",
        },
        note_information: {
          source_flow_id: "daily_action_review_v1",
          handoff_reason: "flow_interruption",
          target_dispatcher: "global",
          handoff_context_for_next_dispatcher:
            "User wants to stop the daily check.",
          structured_context: {
            recommended_next_focus: "normal_conversation",
          },
          confidence: "high",
        },
        exit_memo: {
          needed: true,
          reason: "unknown",
          user_intent_summary: "User wants to stop daily.",
          local_flow_context: {
            skill_id: "daily_action_review_v1",
            targets: [],
            current_daily_state: "interrupted",
            collected_updates_summary: null,
            missing_slots: [],
            committed_effects: [],
          },
          handoff_hint_for_global_dispatcher: {
            likely_intent: "unknown",
            why: "Daily stop/refusal is handled by global.",
          },
        },
        evidence: ["stop"],
      },
    });

    assertEquals(output.flow_action, "exit_to_global_dispatcher");
  }
});

Deno.test("daily action review maps legacy repeat question tokens to clarify daily question", () => {
  const output = sanitizeDailyActionReviewLocalDispatcherOutput({
    targets: [target("a1", "Marcher 10 min")],
    raw: {
      flow_action: "repeat_current_question",
      confidence: "high",
      target_resolution: {
        resolved_occurrence_ids: ["a1"],
        ambiguous: false,
      },
      item_updates: {},
      daily_intent: {
        kind: "daily_clarification",
        summary: "User asks to understand the current daily question.",
      },
      visible_task: {
        kind: "repeat_question",
        conversation_context: {
          tone_constraints: ["short"],
        },
      },
      evidence: ["tu peux repeter"],
    },
  });

  assertEquals(output.flow_action, "clarify_daily_question");
  assertEquals(output.visible_task.kind, "clarify_daily_question");
});

Deno.test("daily action review can hand off to daily action coaching child flow", () => {
  const output = sanitizeDailyActionReviewLocalDispatcherOutput({
    targets: [target("a1", "Marcher 10 min")],
    raw: {
      flow_action: "handoff_to_child_flow",
      confidence: "high",
      target_resolution: {
        resolved_occurrence_ids: ["a1"],
        ambiguous: false,
        why: "User asks for help succeeding with the current daily action.",
      },
      item_updates: {},
      daily_intent: {
        kind: "daily_clarification",
        summary: "User asks for help with the daily action.",
      },
      child_flow: "daily_action_coaching_recommendation_v1",
      return_to_parent: {
        parent_flow_id: "daily_action_review_v1",
        return_focus: "resume_daily_after_action_coaching",
        preserve_parent_state: true,
      },
      child_flow_context: {
        source_flow_id: "daily_action_review_v1",
        parent_flow_id: "daily_action_review_v1",
        return_focus: "resume_daily_after_action_coaching",
        action_context: {
          occurrence_id: "a1",
          plan_item_id: "item-a1",
          plan_id: "plan",
          title: "Marcher 10 min",
          description: "Marcher 10 min description",
          action_type: "habit",
          outcome: null,
          reason_category: null,
          reason_text: null,
        },
        help_request_summary:
          "User asks for help succeeding with this daily action.",
      },
      evidence: ["tu peux m'aider a reussir demain"],
    },
  });

  assertEquals(output.flow_action, "handoff_to_child_flow");
  assertEquals(output.note_information, null);
  assertEquals(output.child_flow, "daily_action_coaching_recommendation_v1");
  assertEquals(
    output.return_to_parent?.parent_flow_id,
    "daily_action_review_v1",
  );
  assertEquals(
    output.return_to_parent?.return_focus,
    "resume_daily_after_action_coaching",
  );
  assertEquals(output.child_flow_context, {
    source_flow_id: "daily_action_review_v1",
    parent_flow_id: "daily_action_review_v1",
    return_focus: "resume_daily_after_action_coaching",
    action_context: {
      occurrence_id: "a1",
      plan_item_id: "item-a1",
      plan_id: "plan",
      title: "Marcher 10 min",
      description: "Marcher 10 min description",
      action_type: "habit",
      outcome: null,
      reason_category: null,
      reason_text: null,
    },
    help_request_summary:
      "User asks for help succeeding with this daily action.",
    affect_context: null,
    confidence: 0.86,
  });
  assertEquals(
    Object.hasOwn(
      output.child_flow_context as Record<string, unknown>,
      "failure_mode",
    ),
    false,
  );
  assertEquals(
    Object.hasOwn(
      output.child_flow_context as Record<string, unknown>,
      "priority_features",
    ),
    false,
  );
  const decision = dailyReviewDecisionFromLocalDispatcher({
    output,
    state: {
      status: "collecting",
      intent: "open_review",
      items: {},
      current_focus_occurrence_ids: ["a1"],
      next_question: null,
      next_question_targets: [],
      generated_user_message: null,
      should_apply_effects: false,
      stop_reason: null,
      effect_plan: { allowed: false, effects: [] },
      turn_count: 0,
      max_turns: 4,
    } as any,
    targets: [target("a1", "Marcher 10 min")],
  });
  assertEquals(decision.effect_plan.allowed, false);
});

Deno.test("daily action review repair ambiguous coaching child flow when target is missing", () => {
  const output = sanitizeDailyActionReviewLocalDispatcherOutput({
    targets: [
      target("a1", "Marcher 10 min"),
      target("a2", "Ranger le bureau"),
    ],
    raw: {
      flow_action: "handoff_to_child_flow",
      confidence: "medium",
      target_resolution: {
        resolved_occurrence_ids: [],
        ambiguous: true,
        why: "User asks for help but the action is ambiguous.",
      },
      item_updates: {},
      daily_intent: {
        kind: "daily_clarification",
        summary: "User asks for help but target is ambiguous.",
      },
      child_flow: "coaching_recommendation",
      return_to_parent: {
        parent_flow_id: "daily_action_review_v1",
        return_focus: "resume_daily_after_coaching_recommendation",
        preserve_parent_state: true,
      },
      child_flow_context: {
        coaching_type: "plan_action",
        confidence: 0.63,
        reason: "User asks for help but the target action is unclear.",
        action_context: {
          source: "plan",
          plan_item_id: null,
          action_title: null,
        },
        needs_type_confirmation: false,
      },
      evidence: ["tu peux m'aider pour celle que je rate toujours"],
    },
  });

  assertEquals(output.flow_action, "handoff_to_child_flow");
  assertEquals(output.child_flow_context?.coaching_type, "ambiguous");
  assertEquals(output.child_flow_context?.needs_type_confirmation, true);
  assertEquals(output.child_flow_context?.action_context, {
    source: "ambiguous",
    plan_item_id: null,
    action_title: null,
  });
});

Deno.test("daily action review missed reason alone does not hand off to coaching", () => {
  const output = sanitizeDailyActionReviewLocalDispatcherOutput({
    targets: [target("a1", "Marcher 10 min")],
    raw: {
      flow_action: "answer_review",
      confidence: "high",
      target_resolution: {
        resolved_occurrence_ids: ["a1"],
        ambiguous: false,
        why: "User reports the daily action was missed and gives the reason.",
      },
      item_updates: {
        a1: {
          update_mode: "set",
          outcome: "missed",
          reason_category: "forgot",
          reason_text: "j'ai oublié",
          still_relevant: true,
          evidence_text: "j'ai oublié",
          matched_user_text: "Pas faite, j'ai oublié. Oui, ça reste pertinent.",
          confidence: "high",
          missing_slots: [],
        },
      },
      daily_intent: {
        kind: "daily_answer",
        summary: "User missed the action because they forgot.",
      },
      visible_task: {
        kind: "commit_success",
        conversation_context: {},
      },
      evidence: ["j'ai oublié", "ça reste pertinent"],
    },
  });

  assertEquals(output.flow_action, "answer_review");
  assertEquals(output.child_flow, null);
  assertEquals(output.child_flow_context, null);
  assertEquals(output.note_information, null);
  assertEquals(output.item_updates.a1.reason_category, "forgot");
});

Deno.test("daily action review forgotten reply remains daily answer, not coaching", () => {
  const output = sanitizeDailyActionReviewLocalDispatcherOutput({
    targets: [target("a1", "Marcher 10 min")],
    raw: {
      flow_action: "answer_review",
      confidence: "high",
      risk_score: 0,
      target_resolution: {
        resolved_occurrence_ids: ["a1"],
        ambiguous: false,
        why: "User reports completion.",
      },
      item_updates: {
        a1: {
          update_mode: "set",
          outcome: "completed",
          reason_category: "none",
          reason_text: null,
          still_relevant: true,
          evidence_text: "je l'ai fait",
          matched_user_text: "je l'ai fait mais j'ai oublie de te repondre",
          confidence: "high",
          missing_slots: [],
        },
      },
      daily_intent: {
        kind: "daily_answer",
        summary: "User completed the action and only forgot to reply.",
      },
      state_updates: {
        status_hint: "complete",
        turn_count_increment: 1,
        close_after_visible: false,
      },
      visible_task: {
        kind: "commit_success",
        instruction: "",
        conversation_context: {},
      },
      note_information: null,
      exit_memo: { needed: false, reason: "none" },
      evidence: ["completed action"],
    },
  });

  assertEquals(output.flow_action, "answer_review");
  assertEquals(output.note_information, null);
});

Deno.test("daily action review product question exits global, not product child or coaching bridge", () => {
  const output = sanitizeDailyActionReviewLocalDispatcherOutput({
    targets: [target("a1", "Marcher 10 min")],
    raw: {
      flow_action: "exit_to_global_dispatcher",
      confidence: "high",
      risk_score: 0,
      target_resolution: {
        resolved_occurrence_ids: [],
        ambiguous: false,
        why: "",
      },
      item_updates: {},
      daily_intent: {
        kind: "off_topic",
        summary: "User asks what an attack card is.",
      },
      state_updates: {
        status_hint: "collecting",
        turn_count_increment: 1,
        close_after_visible: false,
      },
      visible_task: {
        kind: "exit_or_cancel",
        instruction: "",
        conversation_context: {},
      },
      note_information: {
        target_dispatcher: "global",
        structured_context: {
          recommended_next_focus: "product_help",
        },
      },
      exit_memo: {
        needed: true,
        reason: "product_help",
        user_intent_summary: "User asks what an attack card is.",
        local_flow_context: {
          skill_id: "daily_action_review_v1",
          targets: [],
          current_daily_state: "collecting",
          collected_updates_summary: null,
          missing_slots: [],
          committed_effects: [],
        },
        handoff_hint_for_global_dispatcher: {
          likely_intent: "product_help",
          why: "Product question.",
        },
      },
      evidence: ["product question"],
    },
  });

  assertEquals(output.note_information?.target_dispatcher, "global");
  assertEquals(
    isCoachingRecommendationBridgeNote(output.note_information),
    false,
  );
});

Deno.test("daily action review reducer repairs missing canonical items only", () => {
  const targets = [
    target("a1", "Marcher 10 min"),
    target("a2", "Ranger le bureau"),
  ];
  const previous = {
    status: "collecting",
    stop_reason: null,
    items: {
      a1: {
        occurrence_id: "a1",
        plan_item_id: "item-a1",
        plan_id: "plan",
        plan_label: null,
        title: "Marcher 10 min",
        action_type: "habit",
        outcome: null,
        reason_category: null,
        reason_text: null,
        still_relevant: "unknown",
        evidence_text: null,
        matched_user_text: null,
        confidence: "low",
        missing_slots: ["outcome"],
      },
    },
    current_focus_occurrence_ids: ["a1"],
    should_apply_effects: true,
    effect_plan: {
      allowed: true,
      effects: [],
    },
  } as any;

  const reduced = mergeDailyActionReviewLocalState({
    previous,
    targets,
    decision: {
      skill_id: "daily_action_review_v1",
      intent: "answer_review",
      status: "complete",
      target_occurrence_ids: ["a1"],
      item_updates: {
        a1: {
          outcome: "completed",
          reason_category: "none",
          reason_text: null,
          still_relevant: "unknown",
          evidence_text: "j'ai marche",
          matched_user_text: "j'ai marche",
          confidence: "high",
          missing_slots: [],
        },
      },
      item_update_modes: { a1: "set" },
      constraints: [],
      next_question: null,
      next_question_targets: ["a1"],
      generated_user_message: null,
      should_apply_effects: true,
      stop_reason: null,
      effect_plan: { allowed: true, effects: [] },
    },
  });

  assertEquals(Boolean(reduced.state.items.a2), true);
  assertEquals(reduced.state.items.a2.plan_item_id, "item-a2");
  assertEquals(reduced.state.items.a2.title, "Ranger le bureau");
  assertEquals(reduced.state.items.a2.outcome, null);
  assertEquals(reduced.state.items.a2.missing_slots, ["outcome"]);
  assertEquals(reduced.state.remaining_occurrence_ids, undefined);
  assertEquals(reduced.state.constraints, undefined);
  assertEquals(reduced.state.should_apply_effects, false);
  assertEquals(reduced.state.effect_plan.allowed, false);
  assertEquals(
    reduced.state_mutation_audit.restored_fields.includes("items.a2"),
    true,
  );
  assertEquals(
    reduced.state_mutation_audit.restored_fields.includes(
      "remaining_occurrence_ids",
    ),
    false,
  );
  assertEquals(
    reduced.state_mutation_audit.restored_fields.includes("constraints"),
    false,
  );
  assertEquals(
    reduced.state_mutation_audit.applied_fields.includes("effect_plan"),
    true,
  );
});

Deno.test("daily action review reducer preserves existing fields when dispatcher patch is sparse", () => {
  const targets = [target("a1", "Marcher 10 min")];
  const previous = {
    status: "needs_clarification",
    stop_reason: null,
    items: {
      a1: {
        occurrence_id: "a1",
        plan_item_id: "item-a1",
        plan_id: "plan",
        plan_label: null,
        title: "Marcher 10 min",
        action_type: "habit",
        outcome: "missed",
        reason_category: "forgot",
        reason_text: "j'ai oublie",
        still_relevant: true,
        evidence_text: "j'ai oublie",
        matched_user_text: "j'ai oublie",
        confidence: "medium",
        missing_slots: [],
      },
    },
    current_focus_occurrence_ids: ["a1"],
    remaining_occurrence_ids: [],
    asked_occurrence_ids_history: [["a1"]],
    next_question: "Tu veux corriger ?",
    next_question_targets: ["a1"],
    generated_user_message: "Tu veux corriger ?",
    constraints: ["one_question_max"],
    should_apply_effects: false,
    effect_plan: { allowed: false, effects: [] },
  } as any;

  const reduced = mergeDailyActionReviewLocalState({
    previous,
    targets,
    decision: {
      skill_id: "daily_action_review_v1",
      intent: "clarify_outcome",
      status: "needs_clarification",
      target_occurrence_ids: ["a1"],
      item_updates: {},
      item_update_modes: {},
      constraints: [],
      next_question: null,
      next_question_targets: [],
      generated_user_message: null,
      should_apply_effects: false,
      stop_reason: null,
      effect_plan: { allowed: false, effects: [] },
    },
  });

  assertEquals(reduced.state.items.a1.reason_text, "j'ai oublie");
  assertEquals(reduced.state.items.a1.evidence_text, "j'ai oublie");
  assertEquals(reduced.state.next_question, "Tu veux corriger ?");
  assertEquals(reduced.state.generated_user_message, "Tu veux corriger ?");
  assertEquals(reduced.state.current_focus_occurrence_ids, ["a1"]);
});
