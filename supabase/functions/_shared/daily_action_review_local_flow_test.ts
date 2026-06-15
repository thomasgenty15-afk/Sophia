import {
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildInitialDailyActionReviewState,
  type DailyActionReviewTarget,
  stateFromUnknown,
} from "./daily_action_review.ts";
import {
  buildDailyActionReviewLastExitMemo,
  dispatcherSystemPrompt,
  runDailyActionReviewLocalFlow,
  runDailyActionReviewVisibleAgent,
  sanitizeDailyActionReviewLocalDispatcherOutput,
  sanitizeDailyActionReviewVisibleText,
} from "./daily_action_review/local_flow.ts";
import { mergeDailyActionReviewLocalState } from "./daily_action_review/reducer.ts";

function target(id: string, title: string): DailyActionReviewTarget {
  return {
    occurrence_id: id,
    cycle_id: "cycle",
    transformation_id: "transformation",
    plan_id: "plan",
    plan_item_id: `item-${id}`,
    title,
    dimension: "habits",
    kind: "habit",
    tracking_type: "boolean",
    planned_day: "mon",
    original_planned_day: null,
    week_start_date: "2026-06-08",
  };
}

const NO_EXIT_MEMO = {
  needed: false,
  reason: "none",
  user_intent_summary: null,
  local_flow_context: {
    skill_id: "daily_action_review_v1",
    targets: [],
    current_daily_state: null,
    collected_updates_summary: null,
    missing_slots: [],
    committed_effects: [],
  },
  handoff_hint_for_global_dispatcher: {
    likely_intent: "unknown",
    why: null,
    constraints: [],
  },
};

function dailyGlobalNote(userWords: string[]) {
  return {
    source_flow_id: "daily_action_review_v1",
    source_flow_presentation:
      "Daily review collects evidence for targeted actions.",
    source_flow_state_summary: "Daily review stopped before commit.",
    handoff_reason: "topic_change",
    target_dispatcher: "global",
    handoff_context_for_next_dispatcher:
      "The user stopped the active daily review; global dispatcher may resume from this note.",
    target_local_dispatcher_hint: null,
    user_words: userWords,
    structured_context: {
      source_flow: "daily_action_review_v1",
      collected_state: { committed_effects: [] },
      unresolved_questions: [],
      recommended_next_focus: "resume normal routing after daily stop",
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

Deno.test("daily action review dispatcher prompt documents field completion rules for the real contract", () => {
  const prompt = dispatcherSystemPrompt();

  assertStringIncludes(prompt, "Field Completion Rules:");
  assertStringIncludes(prompt, "- flow_action:");
  assertStringIncludes(prompt, "- target_resolution:");
  assertStringIncludes(prompt, "- item_updates:");
  assertStringIncludes(prompt, "- visible_task.conversation_context:");
  assertStringIncludes(prompt, "- note_information:");
  assertStringIncludes(prompt, "- exit_memo:");
  assertStringIncludes(prompt, "Transition rules:");
  assertStringIncludes(prompt, "exit_to_global_dispatcher pour arret du daily");
  assertStringIncludes(prompt, "exit_to_global_dispatcher");
  assertStringIncludes(prompt, "safety_preempt");
  assertStringIncludes(prompt, "handoff_to_local_flow");
  assertStringIncludes(prompt, "Anti-faux-positif exit");
  assertStringIncludes(prompt, '"flow_action":"answer_review"');
  assertStringIncludes(prompt, '"flow_action":"safety_preempt"');
});

Deno.test("daily action review local dispatcher receives inbound activation note", async () => {
  const targets = [target("a1", "Marcher 10 min")];
  const state = buildInitialDailyActionReviewState(targets);
  let capturedInboundNote: unknown = null;

  const result = await runDailyActionReviewLocalFlow({
    text: "Pas maintenant.",
    targets,
    previousState: state,
    noteInformationInbound: {
      source_flow_id: "process_checkins.action_evening_review_v2",
      target_dispatcher: "daily_action_review_v1",
      handoff_reason: "bridge",
      structured_context: {
        target_occurrence_ids: ["a1"],
      },
    },
    dispatcherRunner: async ({ userPrompt }) => {
      capturedInboundNote = JSON.parse(userPrompt).note_information_inbound;
      return {
        flow_action: "exit_to_global_dispatcher",
        confidence: "high",
        risk_score: 0,
        target_resolution: {
          resolved_occurrence_ids: [],
          ambiguous: false,
          why: "User stops daily.",
        },
        item_updates: {},
        daily_intent: {
          kind: "stop",
          summary: "User stops daily.",
        },
        state_updates: {
          status_hint: "stopped",
          turn_count_increment: 1,
          close_after_visible: true,
        },
        visible_task: {
          kind: "stop_close",
          instruction: "Close locally.",
        },
        note_information: dailyGlobalNote(["Pas maintenant."]),
        exit_memo: {
          ...NO_EXIT_MEMO,
          needed: true,
          reason: "topic_change",
          user_intent_summary: "User stops daily.",
        },
        evidence: ["stop"],
      };
    },
    visibleRunner: async () =>
      "D'accord, je laisse ce daily ouvert sans rien noter.",
  });

  assertEquals(
    (capturedInboundNote as any)?.source_flow_id,
    "process_checkins.action_evening_review_v2",
  );
  assertEquals(result.exitToGlobalDispatcher, true);
});

Deno.test("daily action review local dispatcher complete answer becomes commit-ready without visible precommit wording", async () => {
  const targets = [target("a1", "Marcher 10 min")];
  const state = buildInitialDailyActionReviewState(targets);

  const result = await runDailyActionReviewLocalFlow({
    text: "Oui, j'ai marché 10 minutes.",
    targets,
    previousState: state,
    dispatcherRunner: async () => ({
      flow_action: "answer_review",
      confidence: "high",
      risk_score: 0,
      target_resolution: {
        resolved_occurrence_ids: ["a1"],
        ambiguous: false,
        why: "Single target answered.",
      },
      item_updates: {
        a1: {
          update_mode: "set",
          outcome: "completed",
          reason_category: "none",
          reason_text: null,
          still_relevant: true,
          evidence_text: "j'ai marché 10 minutes",
          matched_user_text: "Oui, j'ai marché 10 minutes.",
          confidence: "high",
          missing_slots: [],
        },
      },
      daily_intent: {
        kind: "daily_answer",
        summary: "Action completed.",
      },
      state_updates: {
        status_hint: "complete",
        turn_count_increment: 1,
        close_after_visible: false,
      },
      visible_task: {
        kind: "commit_success",
        instruction: "Confirm only after writer commit.",
      },
      exit_memo: NO_EXIT_MEMO,
      evidence: ["completed single target"],
    }),
    visibleRunner: async () => {
      throw new Error("visible_agent_should_wait_for_commit");
    },
  });

  assertEquals(result.shouldApplyEffects, true);
  assertEquals(result.state.effect_plan.allowed, true);
  assertEquals(result.state.effect_plan.effects[0]?.occurrence_id, "a1");
  assertEquals(result.generatedUserMessage, null);
});

Deno.test("daily action review local dispatcher asks which action when two targets are ambiguous", async () => {
  const targets = [
    target("a1", "Marcher 10 min"),
    target("a2", "Ranger le bureau"),
  ];
  const state = buildInitialDailyActionReviewState(targets);

  const result = await runDailyActionReviewLocalFlow({
    text: "Je l'ai fait.",
    targets,
    previousState: state,
    dispatcherRunner: async () => ({
      flow_action: "clarify_which_action",
      confidence: "high",
      risk_score: 0,
      target_resolution: {
        resolved_occurrence_ids: [],
        ambiguous: true,
        why: "Two active targets and singular reference.",
      },
      item_updates: {},
      daily_intent: {
        kind: "daily_clarification",
        summary: "Ambiguous target.",
      },
      state_updates: {
        status_hint: "needs_clarification",
        turn_count_increment: 1,
        close_after_visible: false,
      },
      visible_task: {
        kind: "clarify_which_action",
        instruction: "Ask which target.",
      },
      exit_memo: NO_EXIT_MEMO,
      evidence: ["ambiguous reference"],
    }),
    visibleRunner: async () =>
      "Tu parles de la marche ou du rangement du bureau ?",
  });

  assertEquals(result.shouldApplyEffects, false);
  assertEquals(result.state.effect_plan.allowed, false);
  assertEquals(
    result.generatedUserMessage,
    "Tu parles de la marche ou du rangement du bureau ?",
  );
});

Deno.test("daily action review local dispatcher exit requires memo and ignores unknown item ids", () => {
  const targets = [target("a1", "Marcher 10 min")];
  const output = sanitizeDailyActionReviewLocalDispatcherOutput({
    targets,
    raw: {
      flow_action: "exit_to_global_dispatcher",
      confidence: "high",
      risk_score: 0,
      target_resolution: {
        resolved_occurrence_ids: ["unknown"],
        ambiguous: false,
        why: "Tool request.",
      },
      item_updates: {
        unknown: {
          update_mode: "set",
          outcome: "completed",
          reason_category: "none",
          reason_text: null,
          still_relevant: true,
          evidence_text: "bad id",
          matched_user_text: "bad id",
          confidence: "high",
          missing_slots: [],
        },
      },
      daily_intent: {
        kind: "explicit_tool_request",
        summary: "User asks for a defense card.",
      },
      state_updates: {
        status_hint: "collecting",
        turn_count_increment: 1,
        close_after_visible: false,
      },
      visible_task: {
        kind: "exit_or_cancel",
        instruction: "No local visible message.",
      },
      exit_memo: {
        needed: true,
        reason: "explicit_tool_request",
        user_intent_summary: "User asks for a defense card.",
        local_flow_context: {
          skill_id: "daily_action_review_v1",
          targets: [{ occurrence_id: "a1" }],
          current_daily_state: "collecting",
          collected_updates_summary: null,
          missing_slots: ["outcome"],
          committed_effects: [],
        },
        handoff_hint_for_global_dispatcher: {
          likely_intent: "prepare_defense_card",
          why: "Explicit card request.",
          constraints: [
            "Do not mark daily as completed unless daily_action_review later commits an entry.",
          ],
        },
      },
      evidence: ["tool request"],
    },
  });
  const memo = buildDailyActionReviewLastExitMemo({
    output,
    at: "2026-06-08T10:00:00.000Z",
  });

  assertEquals(Object.keys(output.item_updates), []);
  assertEquals(output.exit_memo.needed, true);
  assertEquals(
    output.exit_memo.handoff_hint_for_global_dispatcher.likely_intent,
    "prepare_defense_card",
  );
  assertEquals(memo.at, "2026-06-08T10:00:00.000Z");
  assertEquals(
    (memo.note_information as any)?.source_flow_id,
    "daily_action_review_v1",
  );
  assertEquals(
    (memo.note_information as any)?.target_dispatcher,
    "global",
  );
});

Deno.test("daily action review stop exits through local dispatcher with note", async () => {
  const targets = [target("a1", "Marcher 10 min")];
  const state = buildInitialDailyActionReviewState(targets);

  const result = await runDailyActionReviewLocalFlow({
    text: "Pas maintenant, oublie.",
    targets,
    previousState: state,
    dispatcherRunner: async () => ({
      flow_action: "exit_to_global_dispatcher",
      confidence: "high",
      risk_score: 0,
      target_resolution: {
        resolved_occurrence_ids: [],
        ambiguous: false,
        why: "User stops local daily without a new topic.",
      },
      item_updates: {},
      daily_intent: {
        kind: "stop",
        summary: "User wants to stop the daily.",
      },
      state_updates: {
        status_hint: "stopped",
        turn_count_increment: 1,
        close_after_visible: true,
      },
      visible_task: {
        kind: "stop_close",
        instruction: "Close locally.",
        conversation_context: {
          state_summary: "User stopped daily.",
          user_words: ["Pas maintenant, oublie."],
          field_or_stage: "stop_close",
          known_values: {},
          missing_or_weak_values: [],
          selected_candidate: null,
          handoff_data: null,
          tone_constraints: ["short"],
          do_not_say: ["noted"],
          context_summary: "Stop without handoff.",
          evidence_used: ["Pas maintenant, oublie."],
        },
      },
      note_information: dailyGlobalNote(["Pas maintenant, oublie."]),
      exit_memo: {
        ...NO_EXIT_MEMO,
        needed: true,
        reason: "topic_change",
        user_intent_summary: "User wants to stop the daily.",
      },
      evidence: ["stop requested"],
    }),
    visibleRunner: async ({ userPrompt }) => {
      const parsed = JSON.parse(userPrompt);
      assertEquals(
        parsed.visible_task.conversation_context.field_or_stage,
        "stop_close",
      );
      return "D'accord, je ne note rien pour ce daily.";
    },
  });

  assertEquals(result.exitToGlobalDispatcher, true);
  assertEquals(result.state.status, "stopped");
  assertEquals(
    result.dispatcherOutput.note_information?.target_dispatcher,
    "global",
  );
  assertEquals(result.generatedUserMessage, null);
});

Deno.test("daily action review safety preempt creates safety note and skips visible local reply", async () => {
  const targets = [target("a1", "Marcher 10 min")];
  const state = buildInitialDailyActionReviewState(targets);

  const result = await runDailyActionReviewLocalFlow({
    text: "Je risque de me faire du mal.",
    targets,
    previousState: state,
    dispatcherRunner: async () => ({
      flow_action: "safety_preempt",
      confidence: "high",
      risk_score: 8,
      target_resolution: {
        resolved_occurrence_ids: [],
        ambiguous: false,
        why: "Safety signal.",
      },
      item_updates: {},
      daily_intent: {
        kind: "safety",
        summary: "User signals self-harm risk.",
      },
      state_updates: {
        status_hint: "stopped",
        turn_count_increment: 1,
        close_after_visible: true,
      },
      visible_task: {
        kind: "safety",
        instruction: "Do not continue daily.",
      },
      exit_memo: {
        ...NO_EXIT_MEMO,
        needed: true,
        reason: "safety",
        user_intent_summary: "User signals self-harm risk.",
      },
      evidence: ["me faire du mal"],
    }),
    visibleRunner: async () => {
      throw new Error("safety_preempt_should_not_render_daily_visible_agent");
    },
  });

  assertEquals(result.exitToGlobalDispatcher, true);
  assertEquals(result.generatedUserMessage, null);
  assertEquals(
    result.dispatcherOutput.note_information?.target_dispatcher,
    "safety_crisis",
  );
  assertEquals(
    result.dispatcherOutput.note_information?.handoff_reason,
    "safety",
  );
});

Deno.test("daily action review handoff to local flow creates target dispatcher note", () => {
  const targets = [target("a1", "Marcher 10 min")];
  const output = sanitizeDailyActionReviewLocalDispatcherOutput({
    targets,
    raw: {
      flow_action: "handoff_to_local_flow",
      confidence: "high",
      risk_score: 1,
      target_resolution: {
        resolved_occurrence_ids: [],
        ambiguous: false,
        why: "User asks for a potion instead of continuing the daily.",
      },
      item_updates: {},
      daily_intent: {
        kind: "explicit_tool_request",
        summary: "User asks for a potion.",
      },
      state_updates: {
        status_hint: "blocked",
        turn_count_increment: 1,
        close_after_visible: false,
      },
      visible_task: {
        kind: "exit_or_cancel",
        instruction: "Hand off to potion flow.",
      },
      exit_memo: {
        ...NO_EXIT_MEMO,
        needed: true,
        reason: "explicit_tool_request",
        user_intent_summary: "User asks for a potion.",
        handoff_hint_for_global_dispatcher: {
          likely_intent: "select_state_potion",
          why: "Potion request should be owned by the potion local flow.",
          constraints: [
            "Daily has not mutated anything unless committed_effects is non-empty.",
          ],
        },
      },
      evidence: ["potion request"],
    },
  });

  assertEquals(
    output.note_information?.target_dispatcher,
    "select_state_potion",
  );
  assertEquals(output.note_information?.handoff_reason, "bridge");
  assertEquals(output.exit_memo.needed, true);
});

Deno.test("daily action review preserves user constraint in visible conversation context", () => {
  const targets = [target("a1", "Marcher 10 min")];
  const output = sanitizeDailyActionReviewLocalDispatcherOutput({
    targets,
    raw: {
      flow_action: "clarify_reason",
      confidence: "medium",
      risk_score: 0,
      target_resolution: {
        resolved_occurrence_ids: ["a1"],
        ambiguous: false,
        why: "Outcome is missed but reason is missing.",
      },
      item_updates: {
        a1: {
          update_mode: "set",
          outcome: "missed",
          reason_category: "unclear",
          reason_text: null,
          still_relevant: "unknown",
          evidence_text: "je ne l'ai pas fait",
          matched_user_text:
            "Je ne l'ai pas fait, mais reponds juste court stp.",
          confidence: "medium",
          missing_slots: ["reason", "still_relevant"],
        },
      },
      daily_intent: {
        kind: "daily_answer",
        summary: "User missed the action and asks for a short reply.",
      },
      state_updates: {
        status_hint: "needs_clarification",
        turn_count_increment: 1,
        close_after_visible: false,
      },
      visible_task: {
        kind: "clarify_reason",
        instruction: "Ask the reason briefly.",
        conversation_context: {
          state_summary: "Action missed; reason missing.",
          user_words: ["Je ne l'ai pas fait, mais reponds juste court stp."],
          field_or_stage: "clarify_reason",
          known_values: {
            outcome: "missed",
            user_constraint: "reponds juste court",
          },
          missing_or_weak_values: ["reason", "still_relevant"],
          selected_candidate: { occurrence_id: "a1", title: "Marcher 10 min" },
          handoff_data: null,
          tone_constraints: ["short", "no lecture"],
          do_not_say: ["noted", "registered"],
          context_summary: "Need reason only; user requested brevity.",
          evidence_used: ["je ne l'ai pas fait", "reponds juste court"],
        },
      },
      exit_memo: NO_EXIT_MEMO,
      evidence: ["missed action", "short response constraint"],
    },
  });

  assertEquals(
    output.visible_task.conversation_context.known_values.user_constraint,
    "reponds juste court",
  );
  assertEquals(output.visible_task.conversation_context.tone_constraints, [
    "short",
    "no lecture",
  ]);
});

Deno.test("daily action review does not exit when user continues but needs clarification", async () => {
  const targets = [target("a1", "Marcher 10 min")];
  const state = buildInitialDailyActionReviewState(targets);

  const result = await runDailyActionReviewLocalFlow({
    text: "J'ai essaye mais pas vraiment jusqu'au bout.",
    targets,
    previousState: state,
    dispatcherRunner: async () => ({
      flow_action: "clarify_completion_level",
      confidence: "medium",
      risk_score: 0,
      target_resolution: {
        resolved_occurrence_ids: ["a1"],
        ambiguous: false,
        why: "User is still answering the daily but completion level is weak.",
      },
      item_updates: {
        a1: {
          update_mode: "set",
          outcome: "partial",
          reason_category: "unclear",
          reason_text: null,
          still_relevant: true,
          evidence_text: "J'ai essaye mais pas vraiment jusqu'au bout.",
          matched_user_text: "J'ai essaye mais pas vraiment jusqu'au bout.",
          confidence: "medium",
          missing_slots: ["completion_level"],
        },
      },
      daily_intent: {
        kind: "daily_answer",
        summary: "User continues the daily with a partial answer.",
      },
      state_updates: {
        status_hint: "needs_clarification",
        turn_count_increment: 1,
        close_after_visible: false,
      },
      visible_task: {
        kind: "clarify_completion_level",
        instruction: "Ask what was actually done.",
      },
      note_information: null,
      exit_memo: NO_EXIT_MEMO,
      evidence: ["partial daily answer"],
    }),
    visibleRunner: async () => "Tu as fait quelle partie exactement ?",
  });

  assertEquals(result.exitToGlobalDispatcher, false);
  assertEquals(result.state.status, "needs_clarification");
  assertEquals(
    result.generatedUserMessage,
    "Tu as fait quelle partie exactement ?",
  );
});

Deno.test("daily action review visible agent receives only conversation_context and strips serialization quotes", async () => {
  const targets = [target("a1", "Marcher 10 min")];
  const state = buildInitialDailyActionReviewState(targets);
  const visible = await runDailyActionReviewVisibleAgent({
    kind: "clarify_outcome",
    targets,
    state,
    dispatcherOutput: sanitizeDailyActionReviewLocalDispatcherOutput({
      targets,
      raw: {
        flow_action: "clarify_outcome",
        confidence: "medium",
        risk_score: 0,
        target_resolution: {
          resolved_occurrence_ids: ["a1"],
          ambiguous: false,
          why: "Outcome missing.",
        },
        item_updates: {},
        daily_intent: {
          kind: "daily_clarification",
          summary: "Outcome unclear.",
        },
        state_updates: {
          status_hint: "needs_clarification",
          turn_count_increment: 1,
          close_after_visible: false,
        },
        visible_task: {
          kind: "clarify_outcome",
          instruction: "Ask outcome.",
          conversation_context: {
            state_summary: "Outcome unclear for Marcher 10 min.",
            user_words: ["bof"],
            field_or_stage: "clarify_outcome",
            known_values: { targets: [{ title: "Marcher 10 min" }] },
            missing_or_weak_values: ["outcome"],
            selected_candidate: { title: "Marcher 10 min" },
            handoff_data: null,
            tone_constraints: ["short"],
            do_not_say: ["noted"],
            context_summary: "Need outcome only.",
            evidence_used: ["bof"],
          },
        },
        exit_memo: NO_EXIT_MEMO,
        evidence: ["unclear"],
      },
    }),
    llmRunner: async ({ userPrompt }) => {
      const parsed = JSON.parse(userPrompt);
      assertEquals(Object.keys(parsed), ["visible_task"]);
      assertEquals(
        parsed.visible_task.conversation_context.field_or_stage,
        "clarify_outcome",
      );
      return '"Tu veux que je le compte fait, partiel ou pas fait ?"';
    },
  });

  assertEquals(visible, "Tu veux que je le compte fait, partiel ou pas fait ?");
  assertEquals(
    sanitizeDailyActionReviewVisibleText('"C\'est noté."'),
    "C'est noté.",
  );
  assertEquals(
    sanitizeDailyActionReviewVisibleText(
      '["Bravo pour la respiration et les papiers."]',
    ),
    "Bravo pour la respiration et les papiers.",
  );
  assertEquals(
    sanitizeDailyActionReviewVisibleText(
      '{"content":"Bravo pour la respiration."}',
    ),
    "Bravo pour la respiration.",
  );
});

Deno.test("daily action review merge preserves server-owned fields on continuation", () => {
  const targets = [
    target("a1", "Marcher 10 min"),
    target("a2", "Ranger le bureau"),
  ];
  const previous = buildInitialDailyActionReviewState(targets);
  previous.remaining_occurrence_ids = ["a2"];
  previous.asked_occurrence_ids_history = [["a1"]];

  const reduced = mergeDailyActionReviewLocalState({
    previous,
    targets,
    decision: {
      skill_id: "daily_action_review_v1",
      intent: "clarify_outcome",
      status: "needs_clarification",
      target_occurrence_ids: ["a1"],
      item_updates: {},
      constraints: previous.constraints,
      next_question: null,
      next_question_targets: ["a1"],
      generated_user_message: null,
      should_apply_effects: false,
      stop_reason: null,
      effect_plan: { allowed: false, effects: [] },
    },
  });

  assertEquals(reduced.state.remaining_occurrence_ids, ["a2"]);
  assertEquals(reduced.state.asked_occurrence_ids_history, [["a1"]]);
  assertEquals(
    reduced.state_mutation_audit.preserved_fields.includes(
      "remaining_occurrence_ids",
    ),
    true,
  );
});

Deno.test("daily action review invalid confirmation keeps server-owned runtime state", () => {
  const targets = [target("a1", "Marcher 10 min")];
  const previous = buildInitialDailyActionReviewState(targets);

  const reduced = mergeDailyActionReviewLocalState({
    previous,
    targets,
    decision: {
      skill_id: "daily_action_review_v1",
      intent: "answer_review",
      status: "complete",
      target_occurrence_ids: ["a1"],
      item_updates: {},
      constraints: previous.constraints,
      next_question: null,
      next_question_targets: ["a1"],
      generated_user_message: null,
      should_apply_effects: true,
      stop_reason: null,
      effect_plan: { allowed: true, effects: [] },
    },
  });

  assertEquals(reduced.state.status, "collecting");
  assertEquals(reduced.state.effect_plan.allowed, false);
  assertEquals(
    reduced.state_mutation_audit.rejected_changes.some((change) =>
      change.field === "effect_plan" &&
      change.reason_code === "not_stabilized_enough"
    ),
    true,
  );
});

Deno.test("daily action review valid correction transition can clear an item", () => {
  const targets = [target("a1", "Marcher 10 min")];
  const previous = buildInitialDailyActionReviewState(targets);
  previous.items.a1 = {
    ...previous.items.a1,
    outcome: "missed",
    reason_category: "forgot",
    reason_text: "oubli",
    still_relevant: true,
    missing_slots: [],
  };

  const reduced = mergeDailyActionReviewLocalState({
    previous,
    targets,
    decision: {
      skill_id: "daily_action_review_v1",
      intent: "correction",
      status: "needs_clarification",
      target_occurrence_ids: ["a1"],
      item_updates: {
        a1: {
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
      item_update_modes: { a1: "clear" },
      constraints: previous.constraints,
      next_question: null,
      next_question_targets: ["a1"],
      generated_user_message: null,
      should_apply_effects: false,
      stop_reason: null,
      effect_plan: { allowed: false, effects: [] },
    },
  });

  assertEquals(reduced.state.items.a1.outcome, null);
  assertEquals(
    reduced.state_mutation_audit.cleared_fields.includes("items.a1"),
    true,
  );
});

Deno.test("daily action review old active state remains readable without audit fields", () => {
  const targets = [target("a1", "Marcher 10 min")];
  const oldState = {
    skill_id: "daily_action_review_v1",
    status: "collecting",
    items: {
      a1: {
        outcome: "partial",
        reason_category: "unclear",
        missing_slots: ["completion_level"],
      },
    },
  };

  const parsed = stateFromUnknown(oldState, targets);

  assertEquals(parsed.skill_id, "daily_action_review_v1");
  assertEquals(parsed.items.a1.outcome, "partial");
  assertEquals(parsed.state_mutation_audit, undefined);
  assertEquals(parsed.blocked_effects, []);
});

Deno.test("daily action review old active state with unknown enum falls back safely", () => {
  const targets = [target("a1", "Marcher 10 min")];
  const oldState = {
    skill_id: "daily_action_review_v1",
    status: "waiting_for_confirmation",
    stop_reason: "legacy_done",
    items: {},
  };

  const parsed = stateFromUnknown(oldState, targets);

  assertEquals(parsed.status, "collecting");
  assertEquals(parsed.stop_reason, null);
  assertEquals(parsed.current_focus_occurrence_ids, ["a1"]);
  assertEquals(parsed.effect_plan.allowed, false);
});

Deno.test("daily action review direct local handoff exposes diagnosis flag", async () => {
  const targets = [target("a1", "Marcher 10 min")];
  const state = buildInitialDailyActionReviewState(targets);

  const result = await runDailyActionReviewLocalFlow({
    text: "Fais-moi une potion pour tenir.",
    targets,
    previousState: state,
    dispatcherRunner: async () => ({
      flow_action: "handoff_to_local_flow",
      confidence: "high",
      risk_score: 0,
      target_resolution: {
        resolved_occurrence_ids: [],
        ambiguous: false,
        why: "Direct potion request.",
      },
      item_updates: {},
      daily_intent: {
        kind: "explicit_tool_request",
        summary: "Potion request.",
      },
      state_updates: {
        status_hint: "blocked",
        turn_count_increment: 1,
        close_after_visible: false,
      },
      visible_task: {
        kind: "exit_or_cancel",
        instruction: "Hand off.",
      },
      exit_memo: {
        ...NO_EXIT_MEMO,
        needed: true,
        reason: "explicit_tool_request",
        user_intent_summary: "Potion request.",
        handoff_hint_for_global_dispatcher: {
          likely_intent: "select_state_potion",
          why: "Direct request.",
          constraints: [],
        },
      },
      evidence: ["potion"],
    }),
    visibleRunner: async () => {
      throw new Error("handoff_should_not_render_daily_visible_agent");
    },
  });

  assertEquals(result.exitToGlobalDispatcher, true);
  assertEquals(result.diagnosis.direct_handoff_flag, true);
  assertEquals(result.diagnosis.flow_action, "handoff_to_local_flow");
});

Deno.test("daily action review non-actionable mention does not trigger handoff and exposes audit", async () => {
  const targets = [target("a1", "Marcher 10 min")];
  const state = buildInitialDailyActionReviewState(targets);

  const result = await runDailyActionReviewLocalFlow({
    text: "Je pensais a une potion hier, mais pour l'action je ne sais pas.",
    targets,
    previousState: state,
    dispatcherRunner: async () => ({
      flow_action: "clarify_outcome",
      confidence: "medium",
      risk_score: 0,
      target_resolution: {
        resolved_occurrence_ids: ["a1"],
        ambiguous: false,
        why: "User mentions potion but continues daily.",
      },
      item_updates: {},
      daily_intent: {
        kind: "daily_clarification",
        summary: "Daily outcome still unclear.",
      },
      state_updates: {
        status_hint: "needs_clarification",
        turn_count_increment: 1,
        close_after_visible: false,
      },
      visible_task: {
        kind: "clarify_outcome",
        instruction: "Ask outcome.",
      },
      note_information: null,
      exit_memo: NO_EXIT_MEMO,
      evidence: ["pour l'action je ne sais pas"],
    }),
    visibleRunner: async () => "Pour l'action, tu veux la compter comment ?",
  });

  assertEquals(result.exitToGlobalDispatcher, false);
  assertEquals(result.diagnosis.direct_handoff_flag, false);
  assertEquals(
    result.diagnosis.state_mutation_audit?.server_owned_fields.includes(
      "effect_plan",
    ),
    true,
  );
});

Deno.test("daily action review explicit constraint rejects server-owned clear", () => {
  const targets = [target("a1", "Marcher 10 min")];
  const previous = buildInitialDailyActionReviewState(targets);

  const reduced = mergeDailyActionReviewLocalState({
    previous,
    targets,
    decision: {
      skill_id: "daily_action_review_v1",
      intent: "clarify_outcome",
      status: "needs_clarification",
      target_occurrence_ids: ["a1"],
      item_updates: {},
      state_change_intent: {
        clear_fields: ["current_focus_occurrence_ids"],
      },
      constraints: previous.constraints,
      next_question: null,
      next_question_targets: ["a1"],
      generated_user_message: null,
      should_apply_effects: false,
      stop_reason: null,
      effect_plan: { allowed: false, effects: [] },
    },
  });

  assertEquals(reduced.state.current_focus_occurrence_ids, ["a1"]);
  assertEquals(
    reduced.state_mutation_audit.restored_fields.includes(
      "current_focus_occurrence_ids",
    ),
    true,
  );
  assertEquals(
    reduced.state_mutation_audit.rejected_changes.some((change) =>
      change.reason_code === "blocked_by_constraint"
    ),
    true,
  );
});

Deno.test("daily action review explicit correction only replaces the addressed item", () => {
  const targets = [
    target("a1", "Marcher 10 min"),
    target("a2", "Ranger le bureau"),
  ];
  const previous = buildInitialDailyActionReviewState(targets);
  previous.items.a1 = {
    ...previous.items.a1,
    outcome: "missed",
    reason_category: "forgot",
    reason_text: "j'ai oublie",
    still_relevant: true,
    evidence_text: "j'ai oublie",
    confidence: "medium",
    missing_slots: [],
  };
  previous.items.a2 = {
    ...previous.items.a2,
    outcome: "completed",
    reason_category: "none",
    reason_text: null,
    still_relevant: true,
    evidence_text: "bureau range",
    confidence: "high",
    missing_slots: [],
  };

  const reduced = mergeDailyActionReviewLocalState({
    previous,
    targets,
    decision: {
      skill_id: "daily_action_review_v1",
      intent: "correction",
      status: "collecting",
      target_occurrence_ids: ["a1"],
      item_updates: {
        a1: {
          outcome: "completed",
          reason_category: "none",
          reason_text: null,
          still_relevant: true,
          evidence_text: "en fait je l'ai fait",
          matched_user_text: "En fait j'ai marche.",
          confidence: "high",
          missing_slots: [],
        },
      },
      item_update_modes: { a1: "revise" },
      constraints: previous.constraints,
      next_question: null,
      next_question_targets: ["a1"],
      generated_user_message: null,
      should_apply_effects: false,
      stop_reason: null,
      effect_plan: { allowed: false, effects: [] },
    },
  });

  assertEquals(reduced.state.items.a1.outcome, "completed");
  assertEquals(reduced.state.items.a1.evidence_text, "en fait je l'ai fait");
  assertEquals(reduced.state.items.a2.outcome, "completed");
  assertEquals(reduced.state.items.a2.evidence_text, "bureau range");
  assertEquals(
    reduced.state_mutation_audit.applied_fields.includes("items.a1"),
    true,
  );
  assertEquals(
    reduced.state_mutation_audit.applied_fields.includes("items.a2"),
    false,
  );
});

Deno.test("daily action review explicit refusal stops without durable effect", () => {
  const targets = [target("a1", "Marcher 10 min")];
  const previous = buildInitialDailyActionReviewState(targets);
  previous.items.a1 = {
    ...previous.items.a1,
    outcome: "completed",
    reason_category: "none",
    reason_text: null,
    still_relevant: true,
    evidence_text: "j'ai marche",
    confidence: "high",
    missing_slots: [],
  };

  const reduced = mergeDailyActionReviewLocalState({
    previous,
    targets,
    decision: {
      skill_id: "daily_action_review_v1",
      intent: "stop",
      status: "stopped",
      target_occurrence_ids: ["a1"],
      item_updates: {},
      constraints: previous.constraints,
      next_question: null,
      next_question_targets: [],
      generated_user_message: null,
      should_apply_effects: false,
      stop_reason: "user_stopped",
      effect_plan: { allowed: false, effects: [] },
    },
  });

  assertEquals(reduced.state.status, "stopped");
  assertEquals(reduced.state.stop_reason, "user_stopped");
  assertEquals(reduced.state.should_apply_effects, false);
  assertEquals(reduced.state.effect_plan.allowed, false);
  assertEquals(reduced.state.effect_plan.effects, []);
});

Deno.test("daily action review terminal state preserves stop reason against mutation", () => {
  const targets = [target("a1", "Marcher 10 min")];
  const previous = buildInitialDailyActionReviewState(targets);
  previous.status = "complete";
  previous.stop_reason = "all_required_slots_filled";
  previous.items.a1 = {
    ...previous.items.a1,
    outcome: "completed",
    reason_category: "none",
    reason_text: null,
    still_relevant: true,
    evidence_text: "j'ai marche",
    confidence: "high",
    missing_slots: [],
  };

  const reduced = mergeDailyActionReviewLocalState({
    previous,
    targets,
    decision: {
      skill_id: "daily_action_review_v1",
      intent: "clarify_outcome",
      status: "collecting",
      target_occurrence_ids: ["a1"],
      item_updates: {},
      constraints: previous.constraints,
      next_question: null,
      next_question_targets: ["a1"],
      generated_user_message: null,
      should_apply_effects: false,
      stop_reason: null,
      effect_plan: { allowed: false, effects: [] },
    },
  });

  assertEquals(reduced.state.status, "complete");
  assertEquals(reduced.state.stop_reason, "all_required_slots_filled");
  assertEquals(
    reduced.state_mutation_audit.restored_fields.includes("stop_reason"),
    true,
  );
  assertEquals(
    reduced.state_mutation_audit.rejected_changes.some((change) =>
      change.field === "stop_reason" &&
      change.reason_code === "invalid_status_transition"
    ),
    true,
  );
});
