import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  normalizeWeeklyReviewLocalDispatcherOutput,
  reduceWeeklyReviewLocalDispatcherOutput,
  weeklyReviewLocalDispatcherSystemPromptForTest,
} from "./local_flow.ts";
import { buildWeeklyReviewVisibleAgentUserPrompt } from "./visible_agent.ts";

function weeklyState() {
  return {
    skill_id: "weekly_adaptive_review_v1",
    status: "open",
    weekly_progress_review: {
      week_start_date: "2026-06-01",
      week_end_date: "2026-06-07",
      transformations: [],
    },
    weekly_adaptive_review: {
      week_strategy: { decision: "bridge_week", reason: "charge forte" },
      question: { text: "Comment tu ressors de la semaine ?" },
      item_decisions: [],
    },
    weekly_flow_state: {
      stage: "strategy_ready",
      proposal_status: "none",
      validation_unlock_status: "locked_until_weekly_complete",
      human_signals: {
        objective_delta: "unknown",
        felt_state: "unknown",
      },
      last_visible_summary: "Semaine chargee, alleger serait prudent.",
      last_handoff_summary: null,
      turn_count: 1,
      max_turns: 6,
      updated_at: "2026-06-08T08:00:00.000Z",
    },
  };
}

function baseOutput(overrides: Record<string, unknown> = {}) {
  return {
    flow_action: "answer_weekly_question",
    confidence: "high",
    risk_score: 0,
    weekly_intent: {
      kind: "weekly_answer",
      summary: "User confirme fatigue mais progression legere.",
    },
    human_signal_updates: {
      objective_delta: "slight_progress",
      felt_state: "tired_but_ok",
      dominant_blocker_confirmation: "confirmed",
      user_summary: "fatigue mais progression legere",
    },
    handoff_updates: {
      status: "none",
      requested_adjustment_summary: null,
      revision_summary: null,
      platform_destination: null,
      scope: {
        kind: "none",
        plan_id: null,
        plan_title: null,
        plan_item_ids: [],
        scope_summary: null,
        needs_scope_clarification: false,
      },
    },
    forgotten_progress: {
      status: "none",
      target_hint: null,
      outcome_hint: null,
      evidence: null,
    },
    state_updates: {
      status: "open",
      weekly_stage: "strategy_ready",
      validation_unlock_status: "locked_until_weekly_complete",
      turn_count_increment: 1,
      close_after_visible: false,
    },
    visible_task: {
      kind: "weekly_reading",
      instruction: "Donner la lecture weekly.",
    },
    exit_memo: {
      needed: false,
      reason: "none",
      user_intent_summary: null,
      local_flow_context: {
        skill_id: "weekly_adaptive_review_v1",
        weekly_stage: null,
        week_strategy: null,
        last_weekly_question: null,
        last_visible_summary: null,
        last_handoff_summary: null,
        validation_unlock_status: null,
        committed_effects: [],
      },
      handoff_hint_for_global_dispatcher: {
        likely_intent: "unknown",
        why: null,
        constraints: [],
      },
    },
    evidence: ["test"],
    ...overrides,
  };
}

function noteInformation(
  targetDispatcher = "prepare_attack_card",
  handoffReason = "bridge",
): Record<string, unknown> {
  return {
    source_flow_id: "weekly_adaptive_review_v1",
    source_flow_state_summary:
      "Weekly active, user explicitly asks to prepare a card.",
    handoff_reason: handoffReason,
    target_dispatcher: targetDispatcher,
    handoff_context_for_next_dispatcher: JSON.stringify({
      user_message_summary: "prepare a card from weekly",
      active_flow_summary: "weekly reading already discussed",
      collected_state: { weekly_stage: "strategy_ready" },
      unresolved_questions: [],
      recommended_next_focus: "start target local dispatcher",
    }),
    target_local_dispatcher_hint:
      "Run the target local dispatcher from its own contract.",
    user_words: ["fais moi une carte d'attaque"],
    structured_context: {
      user_message_summary: "prepare a card from weekly",
      active_flow_summary: "weekly reading already discussed",
      collected_state: { weekly_stage: "strategy_ready" },
      unresolved_questions: [],
      recommended_next_focus: "start target local dispatcher",
    },
    risk_score: 0,
    no_chat_mutation: {
      db_write_committed: false,
      potion_session_created: false,
      scheduled_checkin_created: false,
      recurring_reminder_created: false,
      executable_confirmation_generated: false,
    },
  };
}

Deno.test("weekly dispatcher prompt documents field completion rules and exactly two examples", () => {
  const prompt = weeklyReviewLocalDispatcherSystemPromptForTest();
  assert(prompt.includes("Field Completion Rules:"));
  assert(
    prompt.includes("- flow_action: decision principale du tour courant."),
  );
  assert(
    prompt.includes(
      "- weekly_intent: resume l'intention weekly du message courant.",
    ),
  );
  assert(
    prompt.includes(
      "- visible_task.conversation_context: ce champ existe dans le contrat",
    ),
  );
  assert(
    prompt.includes(
      "- note_information: obligatoire pour exit_to_global_dispatcher",
    ),
  );
  const examples = prompt.match(/Exemple JSON [0-9]/g) ?? [];
  assertEquals(examples.length, 2);
});

Deno.test("weekly local reducer prepares Plan handoff without plan mutation", () => {
  const output = normalizeWeeklyReviewLocalDispatcherOutput(
    baseOutput({
      flow_action: "prepare_plan_handoff",
      weekly_intent: {
        kind: "plan_handoff_request",
        summary: "User wants a lighter next week.",
      },
      handoff_updates: {
        status: "ready",
        requested_adjustment_summary: "Alleger la semaine prochaine dans Plan.",
        revision_summary: null,
        platform_destination: "Plan",
        scope: {
          kind: "whole_week",
          plan_id: null,
          plan_title: null,
          plan_item_ids: [],
          scope_summary: "Toute la semaine",
          needs_scope_clarification: false,
        },
      },
      state_updates: {
        status: "handoff_ready",
        weekly_stage: "plan_handoff",
        validation_unlock_status: "locked_until_weekly_complete",
        turn_count_increment: 1,
        close_after_visible: false,
      },
      visible_task: {
        kind: "plan_handoff_ready",
        instruction: "Redonner la proposition Plan.",
      },
    }),
  );
  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: weeklyState(),
    output,
  });
  assertEquals(reduced.tool_execution, "platform_handoff");
  assertEquals(reduced.weekly_state?.status, "open");
  assertEquals(
    (reduced.weekly_state?.weekly_flow_state as any).proposal_status,
    "handoff_delivered",
  );
  assertEquals((reduced.weekly_state as any).executedTools, undefined);
});

Deno.test("weekly local reducer continues normally with visible-safe context", () => {
  const output = normalizeWeeklyReviewLocalDispatcherOutput(baseOutput());
  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: weeklyState(),
    output,
  });
  assertEquals(reduced.status, "answered");
  assertEquals(reduced.exit_to_global_dispatcher, false);
  assertEquals(reduced.target_dispatcher, "none");
  assertEquals(reduced.note_information, null);
  assertEquals(reduced.visible_task, "weekly_reading");
  assertEquals(
    reduced.conversation_context?.state_summary,
    output.weekly_intent.summary,
  );
  assert(
    reduced.conversation_context?.do_not_say.includes("modifie le plan") ===
      true,
  );
});

Deno.test("weekly local reducer preserves user constraints in conversation context", () => {
  const output = normalizeWeeklyReviewLocalDispatcherOutput(
    baseOutput({
      flow_action: "prepare_plan_handoff",
      weekly_intent: {
        kind: "plan_handoff_request",
        summary: "User wants a lighter week without chat mutation.",
      },
      handoff_updates: {
        status: "ready",
        requested_adjustment_summary:
          "Alleger la semaine prochaine, sans rien modifier depuis le chat.",
        revision_summary: "Garder uniquement les missions les plus utiles.",
        platform_destination: "Plan",
        scope: {
          kind: "whole_week",
          plan_id: null,
          plan_title: null,
          plan_item_ids: [],
          scope_summary: "Toute la semaine prochaine",
          needs_scope_clarification: false,
        },
      },
      visible_task: {
        kind: "plan_handoff_ready",
        instruction: "Presenter le handoff Plan.",
      },
    }),
  );
  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: weeklyState(),
    output,
  });
  assertEquals(
    reduced.conversation_context?.handoff_data.requested_adjustment_summary,
    "Alleger la semaine prochaine, sans rien modifier depuis le chat.",
  );
  assertEquals(
    reduced.conversation_context?.handoff_data.no_chat_mutation,
    true,
  );
  assert(
    reduced.conversation_context?.do_not_say.includes("applique") === true,
  );
});

Deno.test("weekly visible prompt excludes raw user message and recent messages", () => {
  const prompt = buildWeeklyReviewVisibleAgentUserPrompt({
    user_id: "user-weekly-visible",
    request_id: "request-weekly-visible",
    stage: "weekly_reading",
    user_message: "raw weekly answer that must not be injected",
    recent_messages: [{ role: "assistant", content: "raw weekly history" }],
    conversation_context: {
      state_summary: "Weekly state summarized by reducer.",
      user_words: ["fatigue mais progression legere"],
      field_or_stage: "weekly_reading",
      known_values: {},
      missing_or_weak_values: [],
      selected_candidate: {},
      handoff_data: {
        status: "none",
        requested_adjustment_summary: null,
        revision_summary: null,
        platform_destination: null,
        scope: {
          kind: "none",
          plan_id: null,
          plan_title: null,
          plan_item_ids: [],
          scope_summary: null,
          needs_scope_clarification: false,
        },
      },
      next_focus: "weekly_reading",
      tone_constraints: ["court"],
      do_not_say: [],
      context_summary: "Lecture weekly depuis conversation_context.",
      evidence_used: ["weekly_review.local_dispatcher"],
      max_questions: 1,
    } as any,
  });
  const parsed = JSON.parse(prompt);

  assertEquals(Object.keys(parsed).sort(), [
    "conversation_context",
    "hard_constraints",
    "required_json_shape",
    "stage",
    "task",
  ]);
  assert(!prompt.includes("current_user_message"));
  assert(!prompt.includes("recent_messages"));
  assert(!prompt.includes("raw weekly answer"));
  assert(!prompt.includes("raw weekly history"));
});

Deno.test("weekly local reducer blocks global exit without memo", () => {
  const output = normalizeWeeklyReviewLocalDispatcherOutput(
    baseOutput({
      flow_action: "exit_to_global_dispatcher",
      weekly_intent: {
        kind: "explicit_tool_request",
        summary: "User asks for a card.",
      },
      exit_memo: {
        needed: false,
        reason: "none",
        user_intent_summary: null,
        local_flow_context: {
          skill_id: "weekly_adaptive_review_v1",
          weekly_stage: null,
          week_strategy: null,
          last_weekly_question: null,
          last_visible_summary: null,
          last_handoff_summary: null,
          validation_unlock_status: null,
          committed_effects: [],
        },
        handoff_hint_for_global_dispatcher: {
          likely_intent: "prepare_attack_card",
          why: null,
          constraints: [],
        },
      },
      visible_task: {
        kind: "exit_or_cancel",
        instruction: "Exit.",
      },
    }),
  );
  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: weeklyState(),
    output,
  });
  assertEquals(reduced.status, "blocked");
  assertEquals(reduced.reason_code, "weekly_review_note_information_required");
  assertEquals(reduced.exit_to_global_dispatcher, false);
  assertEquals(reduced.tool_execution, "blocked");
});

Deno.test("weekly local reducer blocks local handoff without note_information", () => {
  const output = normalizeWeeklyReviewLocalDispatcherOutput(
    baseOutput({
      flow_action: "handoff_to_local_flow",
      target_dispatcher: "prepare_attack_card",
      weekly_intent: {
        kind: "explicit_tool_request",
        summary: "User asks for an attack card.",
      },
      visible_task: {
        kind: "exit_or_cancel",
        instruction: "Handoff.",
      },
    }),
  );
  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: weeklyState(),
    output,
  });
  assertEquals(reduced.status, "blocked");
  assertEquals(reduced.reason_code, "weekly_review_note_information_required");
  assertEquals(reduced.exit_to_global_dispatcher, false);
  assertEquals(reduced.target_dispatcher, "prepare_attack_card");
});

Deno.test("weekly local reducer hands off to attack card locally with note_information", () => {
  const output = normalizeWeeklyReviewLocalDispatcherOutput(
    baseOutput({
      flow_action: "handoff_to_local_flow",
      target_dispatcher: "prepare_attack_card",
      weekly_intent: {
        kind: "explicit_tool_request",
        summary: "User asks for an attack card.",
      },
      note_information: noteInformation("prepare_attack_card"),
      visible_task: {
        kind: "exit_or_cancel",
        instruction: "Handoff.",
      },
    }),
  );
  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: weeklyState(),
    output,
  });
  assertEquals(reduced.status, "handoff_to_local_flow");
  assertEquals(reduced.exit_to_global_dispatcher, false);
  assertEquals(reduced.target_dispatcher, "prepare_attack_card");
  assertEquals(
    reduced.note_information?.target_dispatcher,
    "prepare_attack_card",
  );
  assertEquals(reduced.weekly_state, null);
});

Deno.test("weekly local reducer exits to global only with note_information", () => {
  const output = normalizeWeeklyReviewLocalDispatcherOutput(
    baseOutput({
      flow_action: "exit_to_global_dispatcher",
      target_dispatcher: "global",
      weekly_intent: {
        kind: "off_topic",
        summary: "User switches to an unrelated prioritization topic.",
      },
      note_information: noteInformation("global", "topic_change"),
      visible_task: {
        kind: "exit_or_cancel",
        instruction: "Exit to global.",
      },
    }),
  );
  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: weeklyState(),
    output,
  });
  assertEquals(reduced.status, "exit");
  assertEquals(reduced.exit_to_global_dispatcher, true);
  assertEquals(reduced.target_dispatcher, "global");
  assertEquals(reduced.note_information?.target_dispatcher, "global");
});

Deno.test("weekly local reducer routes safety without global dispatcher", () => {
  const output = normalizeWeeklyReviewLocalDispatcherOutput(
    baseOutput({
      flow_action: "safety_preempt",
      target_dispatcher: "safety_crisis",
      risk_score: 8,
      weekly_intent: {
        kind: "safety",
        summary: "User message raises safety risk.",
      },
      note_information: noteInformation("safety_crisis", "safety"),
      visible_task: {
        kind: "safety",
        instruction: "Safety transition.",
      },
    }),
  );
  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: weeklyState(),
    output,
  });
  assertEquals(reduced.status, "safety");
  assertEquals(reduced.exit_to_global_dispatcher, false);
  assertEquals(reduced.target_dispatcher, "safety_crisis");
  assertEquals(reduced.note_information?.target_dispatcher, "safety_crisis");
});

Deno.test("weekly local reducer does not exit when user continues weekly", () => {
  const output = normalizeWeeklyReviewLocalDispatcherOutput(
    baseOutput({
      flow_action: "answer_weekly_question",
      target_dispatcher: "global",
      weekly_intent: {
        kind: "weekly_answer",
        summary: "User asks to continue the weekly reading.",
      },
      exit_memo: {
        needed: true,
        reason: "topic_change",
        user_intent_summary: "legacy memo should not force exit",
        local_flow_context: {
          skill_id: "weekly_adaptive_review_v1",
          weekly_stage: "strategy_ready",
          week_strategy: null,
          last_weekly_question: null,
          last_visible_summary: null,
          last_handoff_summary: null,
          validation_unlock_status: null,
          committed_effects: [],
        },
        handoff_hint_for_global_dispatcher: {
          likely_intent: "normal_coaching",
          why: "legacy memo should not own routing",
          constraints: [],
        },
      },
    }),
  );
  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: weeklyState(),
    output,
  });
  assertEquals(reduced.status, "answered");
  assertEquals(reduced.exit_to_global_dispatcher, false);
  assertEquals(reduced.target_dispatcher, "none");
});

Deno.test("weekly local reducer stops locally without global handoff", () => {
  const output = normalizeWeeklyReviewLocalDispatcherOutput(
    baseOutput({
      flow_action: "stop_local_no_handoff",
      weekly_intent: {
        kind: "stop",
        summary: "User wants to stop the weekly.",
      },
      visible_task: {
        kind: "stop_or_cancel",
        instruction: "Stop locally.",
      },
    }),
  );
  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: weeklyState(),
    output,
  });
  assertEquals(reduced.status, "closed");
  assertEquals(reduced.exit_to_global_dispatcher, false);
  assertEquals(reduced.target_dispatcher, "none");
  assertEquals(reduced.visible_task, "stop_or_cancel");
  assertEquals(reduced.weekly_state?.status, "stopped");
});

Deno.test("weekly local completion unlocks validation and stays non executable", () => {
  const output = normalizeWeeklyReviewLocalDispatcherOutput(
    baseOutput({
      flow_action: "complete_weekly_no_change",
      weekly_intent: {
        kind: "weekly_confirmation",
        summary: "User confirms no change is needed.",
      },
      state_updates: {
        status: "completed",
        weekly_stage: "closing",
        validation_unlock_status: "available",
        turn_count_increment: 1,
        close_after_visible: true,
      },
      visible_task: {
        kind: "complete_no_change",
        instruction: "Close weekly.",
      },
    }),
  );
  const reduced = reduceWeeklyReviewLocalDispatcherOutput({
    previousWeeklyState: weeklyState(),
    output,
  });
  assertEquals(reduced.status, "closed");
  assertEquals(reduced.tool_execution, "none");
  assertEquals(reduced.weekly_state?.status, "completed");
  assertEquals(
    (reduced.weekly_state?.weekly_flow_state as any).validation_unlock_status,
    "available",
  );
  assertEquals(
    (reduced.weekly_state?.validation_unlock as any).status,
    "available",
  );
});
