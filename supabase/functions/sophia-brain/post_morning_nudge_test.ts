import { assertEquals } from "jsr:@std/assert@1";

import type { MorningNudgePayloadV2 } from "./morning_nudge_contract.ts";
import {
  buildPostMorningNudgeExitMemo,
  createPostMorningNudgeActiveState,
  LAST_POST_MORNING_NUDGE_EXIT_MEMO_KEY,
  POST_MORNING_NUDGE_TEMP_MEMORY_KEY,
  readPostMorningNudgeActiveState,
  reducePostMorningNudgeTurn,
  resolvePostMorningNudgeDispatcher,
  runPostMorningNudgeLocalRuntime,
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
    resolvePostMorningNudgeDispatcher(state!),
    "post_morning_nudge.action_dispatcher",
  );
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
    dispatcher: async (active) => ({
      dispatcher_id: resolvePostMorningNudgeDispatcher(active),
      flow_action: "continue_local",
      visible_task: { kind: "suppressed_action_support" },
      no_durable_mutation: {
        action_created: false,
        card_created: false,
        potion_created: false,
        reminder_created: false,
        scheduled_checkin_created: false,
        preference_written: false,
        plan_patch_written: false,
      },
    }),
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
});

Deno.test("post morning nudge exit_to_global writes mandatory exit memo", async () => {
  const state = createPostMorningNudgeActiveState({
    sourceNudge: BASE_NUDGE,
  })!;
  const tempMemory = writePostMorningNudgeActiveState({}, state);
  const runtime = await runPostMorningNudgeLocalRuntime({
    tempMemory,
    dispatcher: async (active) => ({
      dispatcher_id: resolvePostMorningNudgeDispatcher(active),
      flow_action: "exit_to_global_dispatcher",
      visible_task: { kind: "exit" },
      exit_memo: buildPostMorningNudgeExitMemo({
        state: active,
        reason: "explicit_tool_request",
        userIntentSummary: "User asks for another tool.",
        likelyIntent: "prepare_defense_card",
        why: "The local dispatcher selected an explicit handoff.",
      }),
      no_durable_mutation: {
        action_created: false,
        card_created: false,
        potion_created: false,
        reminder_created: false,
        scheduled_checkin_created: false,
        preference_written: false,
        plan_patch_written: false,
      },
    }),
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
      LAST_POST_MORNING_NUDGE_EXIT_MEMO_KEY
    ] as any)
      ?.reason,
    "explicit_tool_request",
  );
  assertEquals(
    ((runtime?.toolSkillRun as any)?.exit_memo as any)
      ?.handoff_hint_for_global_dispatcher?.likely_intent,
    "prepare_defense_card",
  );
});

Deno.test("post morning nudge max turns closes local flow", () => {
  const state = {
    ...createPostMorningNudgeActiveState({ sourceNudge: BASE_NUDGE })!,
    turn_count: 2,
    max_turns: 3,
  };
  const reduced = reducePostMorningNudgeTurn({
    state,
    dispatcherOutput: {
      dispatcher_id: "post_morning_nudge.action_dispatcher",
      flow_action: "continue_local",
      visible_task: { kind: "action_followup" },
      no_durable_mutation: {
        action_created: false,
        card_created: false,
        potion_created: false,
        reminder_created: false,
        scheduled_checkin_created: false,
        preference_written: false,
        plan_patch_written: false,
      },
    },
  });

  assertEquals(reduced.nextState?.status, "closed");
  assertEquals(reduced.exitMemo, null);
});
