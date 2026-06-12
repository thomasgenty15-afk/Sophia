import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

import type { MorningNudgePayloadV2 } from "./morning_nudge_contract.ts";
import {
  actionDispatcherSystemPrompt,
  buildPostMorningNudgeLocalHandoffNote,
  createPostMorningNudgeActiveState,
  emotionalPresenceDispatcherSystemPrompt,
  LAST_POST_MORNING_NUDGE_NOTE_INFORMATION_KEY,
  normalizePostMorningNudgeActionDispatcherOutput,
  normalizePostMorningNudgeSuppressedActionDispatcherOutput,
  POST_MORNING_NUDGE_TEMP_MEMORY_KEY,
  readPostMorningNudgeActiveState,
  reducePostMorningNudgeActionTurn,
  resolvePostMorningNudgeDispatcher,
  runPostMorningNudgeLocalRuntime,
  suppressedActionDispatcherSystemPrompt,
  writePostMorningNudgeActiveState,
} from "./post_morning_nudge.ts";

const BASE_NUDGE: MorningNudgePayloadV2 = {
  event_context: "morning_nudge_v2",
  nudge_kind: "action_nudge",
  posture: "focus_today",
  opens_local_flow: true,
  intended_followup_flow: "action",
  coach_intent: "motivate_action",
  target_action_ids: ["item-1"],
  target_action_titles: ["Marcher 10 min"],
  target_item_ids: ["item-1"],
  target_item_titles: ["Marcher 10 min"],
  suppressed_action_ids: [],
  suppressed_action_titles: [],
  suppression_reason: null,
  source_reason: "morning_nudge_v2:focus_today",
  source_grounding: "event=morning_nudge_v2",
  sent_at: "2026-03-24T07:00:00.000Z",
};

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

Deno.test("post morning nudge creates active action state from structured payload", () => {
  const state = createPostMorningNudgeActiveState({
    sourceNudge: BASE_NUDGE,
    nowIso: "2026-03-24T07:01:00.000Z",
  });

  assertEquals(state?.skill_id, "post_morning_nudge");
  assertEquals(state?.flow_kind, "action");
  assertEquals(state?.status, "active");
  assertEquals(state?.turn_count, 0);
  assertEquals(state?.max_turns, 3);
  assertEquals(
    state?.activation_note_information.target_dispatcher,
    "post_morning_nudge.action",
  );
  assertEquals(
    resolvePostMorningNudgeDispatcher(state!),
    "post_morning_nudge.action_dispatcher",
  );
});

Deno.test("post morning nudge dispatcher prompts document real field completion rules", () => {
  const prompts = [
    actionDispatcherSystemPrompt(),
    suppressedActionDispatcherSystemPrompt(),
    emotionalPresenceDispatcherSystemPrompt(),
  ];

  for (const prompt of prompts) {
    assertStringIncludes(prompt, "Field Completion Rules:");
    assertStringIncludes(prompt, "Transition Rules:");
    assertStringIncludes(
      prompt,
      "Decision Examples (non-visible, exactly two):",
    );
    assertEquals(countOccurrences(prompt, '"example_id"'), 2);
    assertStringIncludes(prompt, "flow_action");
    assertStringIncludes(prompt, "confidence");
    assertStringIncludes(prompt, "risk_score");
    assertStringIncludes(prompt, "local_assessment");
    assertStringIncludes(prompt, "state_updates");
    assertStringIncludes(prompt, "visible_task.kind");
    assertStringIncludes(prompt, "visible_task.instruction");
    assertStringIncludes(prompt, "visible_task.conversation_context");
    assertStringIncludes(prompt, "note_information");
    assertStringIncludes(prompt, "evidence");
    assertStringIncludes(prompt, "source_flow_id");
    assertStringIncludes(prompt, "source_flow_state_summary");
    assertStringIncludes(prompt, "handoff_context_for_next_dispatcher");
    assertStringIncludes(prompt, "target_local_dispatcher_hint");
    assertStringIncludes(prompt, "no_chat_mutation");
    assertStringIncludes(prompt, "structured_context");
    assertStringIncludes(prompt, "champs top-level inventes");
    assertStringIncludes(prompt, "Ce contrat ne contient pas exit_memo");
    assertStringIncludes(prompt, "ne les ajoute pas");
    assertStringIncludes(prompt, "safety_preempt");
    assertStringIncludes(prompt, "exit_to_global_dispatcher");
    assertStringIncludes(prompt, "Exit global");
  }
});

Deno.test("post morning nudge greeting payload opens no active flow", () => {
  const state = createPostMorningNudgeActiveState({
    sourceNudge: {
      ...BASE_NUDGE,
      nudge_kind: "no_action_greeting",
      opens_local_flow: false,
      intended_followup_flow: null,
      target_action_ids: [],
      target_action_titles: [],
      target_item_ids: [],
      target_item_titles: [],
    },
  });

  assertEquals(state, null);
});

Deno.test("post morning nudge resolver reads state, not user message text", async () => {
  const state = createPostMorningNudgeActiveState({
    sourceNudge: {
      ...BASE_NUDGE,
      nudge_kind: "suppressed_action_nudge",
      intended_followup_flow: "suppressed_action",
      suppressed_action_ids: ["item-1"],
      suppressed_action_titles: ["Marcher 10 min"],
      suppression_reason: "high_emotional_load",
    },
  })!;
  const tempMemory = writePostMorningNudgeActiveState({}, state);
  const readBack = readPostMorningNudgeActiveState({
    ...tempMemory,
    unrelated_user_message: "prepare-moi une carte de defense",
  });

  assertEquals(readBack?.flow_kind, "suppressed_action");
  assertEquals(
    resolvePostMorningNudgeDispatcher(readBack!),
    "post_morning_nudge.suppressed_action_dispatcher",
  );

  const runtime = await runPostMorningNudgeLocalRuntime({
    tempMemory,
    suppressedActionDispatcher: async (
      { active_state, note_information_inbound },
    ) => {
      assertEquals(
        note_information_inbound?.target_dispatcher,
        "post_morning_nudge.suppressed_action",
      );
      return normalizePostMorningNudgeSuppressedActionDispatcherOutput({
        flow_action: "support_emotion",
        confidence: "high",
        risk_score: 0,
        local_assessment: {
          action_readiness: "needs_support",
          motivation_need: "none",
          emotional_load: "high",
          user_wants_conversation: true,
          suppression_still_valid: true,
          target_action_reference: "Marcher 10 min",
          main_need: "support",
          minimal_save_candidate: null,
          reopen_step_candidate: null,
        },
        state_updates: {
          status: "active",
          turn_count_increment: 1,
          close_after_visible: false,
        },
        visible_task: {
          kind: "soft_support",
          conversation_context: {
            known_values: {
              suppressed_action_titles: ["Marcher 10 min"],
              target_action_titles: ["Marcher 10 min"],
              suppression_reason: "high_emotional_load",
              main_need: "support",
              minimal_save_candidate: null,
              reopen_step_candidate: null,
            },
          },
        },
        note_information: null,
        evidence: ["test dispatcher output"],
      }, active_state);
    },
    suppressedActionVisibleAgent: async ({ decision }) =>
      `visible:${decision.visible_task.kind}`,
    nowIso: "2026-03-24T07:02:00.000Z",
  });

  assertEquals(
    (runtime?.toolSkillRun as any)?.runtime_trace?.[0]
      ?.global_dispatcher_skipped_due_post_morning_nudge,
    true,
  );
  assertEquals(
    ((runtime?.nextTempMemory as any)[
      POST_MORNING_NUDGE_TEMP_MEMORY_KEY
    ] as any)
      ?.turn_count,
    1,
  );
  assertEquals(
    ((runtime?.toolSkillRun as any)?.runtime_trace?.[0] as any)
      ?.activation_note_information_consumed,
    true,
  );
});

Deno.test("post morning nudge visible task carries conversation context", async () => {
  const state = createPostMorningNudgeActiveState({
    sourceNudge: BASE_NUDGE,
  })!;
  const runtime = await runPostMorningNudgeLocalRuntime({
    tempMemory: writePostMorningNudgeActiveState({}, state),
    actionDispatcher: async ({ active_state }) =>
      normalizePostMorningNudgeActionDispatcherOutput({
        flow_action: "choose_first_step",
        confidence: "high",
        risk_score: 0,
        local_assessment: {
          action_readiness: "blocked",
          motivation_need: "light",
          emotional_load: "low",
          user_wants_conversation: true,
          target_action_reference: "Marcher 10 min",
          main_friction: "ne sait pas commencer",
          next_step_candidate: "Mettre les chaussures",
          scope_reduction_candidate: null,
        },
        state_updates: {
          status: "active",
          turn_count_increment: 1,
          close_after_visible: false,
        },
        visible_task: {
          kind: "choose_first_step",
          conversation_context: {
            state_summary: "custom context",
            user_words: ["je commence par quoi"],
            known_values: {
              target_action_titles: ["Marcher 10 min"],
              target_item_titles: ["Marcher 10 min"],
              main_friction: "ne sait pas commencer",
              next_step_candidate: "Mettre les chaussures",
              scope_reduction_candidate: null,
            },
            tone_constraints: ["sans pression", "une seule marche"],
          },
        },
        note_information: null,
        evidence: ["test dispatcher output"],
      }, active_state),
    actionVisibleAgent: async ({ decision }) =>
      String(
        decision.visible_task.conversation_context.known_values
          .next_step_candidate,
      ),
  });

  assertEquals(runtime?.content, "Mettre les chaussures");
  assertEquals(
    (runtime?.toolSkillRun as any)?.visible_task.conversation_context
      .known_values.target_action_titles,
    ["Marcher 10 min"],
  );
  assertEquals(
    (runtime?.toolSkillRun as any)?.visible_task.conversation_context
      .tone_constraints,
    ["sans pression", "une seule marche"],
  );
});

Deno.test("post morning nudge exit_to_global writes mandatory note information", async () => {
  const state = createPostMorningNudgeActiveState({
    sourceNudge: BASE_NUDGE,
  })!;
  const tempMemory = writePostMorningNudgeActiveState({}, state);
  const runtime = await runPostMorningNudgeLocalRuntime({
    tempMemory,
    actionDispatcher: async ({ active_state }) =>
      normalizePostMorningNudgeActionDispatcherOutput({
        flow_action: "exit_to_global_dispatcher",
        confidence: "high",
        risk_score: 0,
        local_assessment: {
          action_readiness: "unknown",
          motivation_need: "unknown",
          emotional_load: "low",
          user_wants_conversation: false,
          target_action_reference: "Marcher 10 min",
          main_friction: null,
          next_step_candidate: null,
          scope_reduction_candidate: null,
        },
        state_updates: {
          status: "exit_to_global",
          turn_count_increment: 1,
          close_after_visible: true,
        },
        visible_task: {
          kind: "exit_or_cancel",
          conversation_context: {
            known_values: {
              target_action_titles: ["Marcher 10 min"],
              target_item_titles: ["Marcher 10 min"],
              main_friction: null,
              next_step_candidate: null,
              scope_reduction_candidate: null,
            },
          },
        },
        note_information: buildPostMorningNudgeLocalHandoffNote({
          state: active_state,
          reason: "explicit_tool_request",
          userIntentSummary: "User asks for another tool.",
          likelyIntent: "prepare_defense_card",
          why: "The local dispatcher selected an explicit handoff.",
        }).note_information,
        evidence: ["test dispatcher output"],
      }, active_state),
    actionVisibleAgent: async () => "should not render",
  });

  assertEquals(
    (runtime?.toolSkillRun as any)?.reason_code,
    "post_morning_nudge_local_exit_to_global_dispatcher",
  );
  assertEquals(
    (runtime?.nextTempMemory as any)[POST_MORNING_NUDGE_TEMP_MEMORY_KEY],
    undefined,
  );
  assertEquals(
    ((runtime?.nextTempMemory as any)[
      LAST_POST_MORNING_NUDGE_NOTE_INFORMATION_KEY
    ] as any)
      ?.reason,
    "explicit_tool_request",
  );
  assertEquals(
    ((runtime?.toolSkillRun as any)?.note_information as any)
      ?.target_dispatcher,
    "prepare_defense_card",
  );
});

Deno.test("post morning nudge local close keeps no side effects", async () => {
  const state = createPostMorningNudgeActiveState({
    sourceNudge: BASE_NUDGE,
  })!;
  const runtime = await runPostMorningNudgeLocalRuntime({
    tempMemory: writePostMorningNudgeActiveState({}, state),
    actionDispatcher: async ({ active_state }) =>
      normalizePostMorningNudgeActionDispatcherOutput({
        flow_action: "cancel_flow",
        confidence: "high",
        risk_score: 0,
        local_assessment: {
          action_readiness: "not_today",
          motivation_need: "none",
          emotional_load: "low",
          user_wants_conversation: false,
          target_action_reference: "Marcher 10 min",
          main_friction: null,
          next_step_candidate: null,
          scope_reduction_candidate: null,
        },
        state_updates: {
          status: "closed",
          turn_count_increment: 1,
          close_after_visible: true,
        },
        visible_task: {
          kind: "exit_or_cancel",
          conversation_context: {
            known_values: {
              target_action_titles: ["Marcher 10 min"],
              target_item_titles: ["Marcher 10 min"],
              main_friction: null,
              next_step_candidate: null,
              scope_reduction_candidate: null,
            },
          },
        },
        note_information: null,
        evidence: ["test dispatcher output"],
      }, active_state),
    actionVisibleAgent: async ({ decision }) =>
      `visible:${decision.visible_task.kind}`,
  });

  assertEquals(runtime?.content, "visible:exit_or_cancel");
  assertEquals(
    (runtime?.toolSkillRun as any)?.flow_action_category,
    "exit_to_global_dispatcher",
  );
  assertEquals(
    (runtime?.toolSkillRun as any)?.runtime_trace?.[0]
      ?.global_dispatcher_skipped_due_post_morning_nudge,
    true,
  );
  assertEquals((runtime?.toolSkillRun as any)?.local_handoff_note, null);
});

Deno.test("post morning nudge max turns closes action flow", () => {
  const state = {
    ...createPostMorningNudgeActiveState({ sourceNudge: BASE_NUDGE })!,
    turn_count: 2,
    max_turns: 3,
  };
  const reduced = reducePostMorningNudgeActionTurn({
    state,
    output: normalizePostMorningNudgeActionDispatcherOutput({
      flow_action: "choose_first_step",
      confidence: "high",
      risk_score: 0,
      local_assessment: {
        action_readiness: "blocked",
        motivation_need: "light",
        emotional_load: "low",
        user_wants_conversation: true,
        target_action_reference: "Marcher 10 min",
        main_friction: null,
        next_step_candidate: "Mettre les chaussures",
        scope_reduction_candidate: null,
      },
      state_updates: {
        status: "active",
        turn_count_increment: 1,
        close_after_visible: false,
      },
      visible_task: {
        kind: "choose_first_step",
        conversation_context: {
          known_values: {
            target_action_titles: ["Marcher 10 min"],
            target_item_titles: ["Marcher 10 min"],
            main_friction: null,
            next_step_candidate: "Mettre les chaussures",
            scope_reduction_candidate: null,
          },
        },
      },
      note_information: null,
      evidence: ["test dispatcher output"],
    }, state),
  });

  assertEquals(reduced.nextState?.status, "closed");
  assertEquals(reduced.handoffNote, null);
});
