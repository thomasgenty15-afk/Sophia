import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

import type { MorningNudgePayloadV2 } from "./morning_nudge_contract.ts";
import {
  createPostMorningNudgeActiveState,
  LAST_POST_MORNING_NUDGE_EXIT_MEMO_KEY,
  normalizePostMorningNudgeSuppressedActionDispatcherOutput,
  POST_MORNING_NUDGE_TEMP_MEMORY_KEY,
  type PostMorningNudgeSuppressedActionDispatcherOutput,
  type PostMorningNudgeSuppressedActionFlowAction,
  type PostMorningNudgeSuppressedActionVisibleTaskKind,
  reducePostMorningNudgeSuppressedActionTurn,
  runPostMorningNudgeLocalRuntime,
  writePostMorningNudgeActiveState,
} from "./post_morning_nudge.ts";

const SOURCE_NUDGE: MorningNudgePayloadV2 = {
  event_context: "morning_nudge_v2",
  nudge_kind: "suppressed_action_nudge",
  posture: "support_softly",
  opens_local_flow: true,
  intended_followup_flow: "suppressed_action",
  coach_intent: "protect_emotion",
  target_action_ids: ["item-walk"],
  target_action_titles: ["Marcher 10 min"],
  target_item_ids: ["item-walk"],
  target_item_titles: ["Marcher 10 min"],
  suppressed_action_ids: ["item-walk"],
  suppressed_action_titles: ["Marcher 10 min"],
  suppression_reason: "high_emotional_load",
  source_reason: "morning_nudge_v2:support_softly",
  source_grounding: "event=morning_nudge_v2\nposture=support_softly",
  sent_at: "2026-06-08T07:00:00.000Z",
};

function activeState(overrides: Record<string, unknown> = {}) {
  return {
    ...createPostMorningNudgeActiveState({
      sourceNudge: SOURCE_NUDGE,
      nowIso: "2026-06-08T07:01:00.000Z",
    })!,
    ...overrides,
  };
}

function decision(args: {
  flow_action: PostMorningNudgeSuppressedActionFlowAction;
  visible_kind: PostMorningNudgeSuppressedActionVisibleTaskKind;
  close?: boolean;
  status?: "active" | "closing" | "closed" | "exit_to_global" | "safety";
  readiness?: PostMorningNudgeSuppressedActionDispatcherOutput[
    "local_assessment"
  ]["action_readiness"];
  main_need?: NonNullable<
    PostMorningNudgeSuppressedActionDispatcherOutput["local_assessment"][
      "main_need"
    ]
  >;
  likely_intent?: PostMorningNudgeSuppressedActionDispatcherOutput[
    "exit_memo"
  ]["handoff_hint_for_global_dispatcher"]["likely_intent"];
}): PostMorningNudgeSuppressedActionDispatcherOutput {
  const root = {
    flow_action: args.flow_action,
    confidence: "high",
    risk_score: 0,
    local_assessment: {
      action_readiness: args.readiness ?? "unknown",
      motivation_need: "none",
      emotional_load: args.main_need === "support" ? "high" : "low",
      user_wants_conversation: args.main_need === "support",
      suppression_still_valid: true,
      target_action_reference: "Marcher 10 min",
      main_need: args.main_need ?? "unknown",
      minimal_save_candidate: args.visible_kind === "offer_minimal_save"
        ? "Marcher deux minutes, sans viser plus"
        : null,
      reopen_step_candidate: args.visible_kind === "reopen_action_gently"
        ? "Sortir juste prendre l'air deux minutes"
        : null,
    },
    state_updates: {
      status: args.status ?? (args.close ? "closed" : "active"),
      turn_count_increment: 1,
      close_after_visible: args.close ?? false,
    },
    visible_task: {
      kind: args.visible_kind,
      instruction: "stage specific suppressed visible prompt",
      data: {
        suppressed_action_titles: ["Marcher 10 min"],
        target_action_titles: ["Marcher 10 min"],
        suppression_reason: "high_emotional_load",
        main_need: args.main_need ?? null,
        minimal_save_candidate: null,
        reopen_step_candidate: null,
      },
    },
    exit_memo: {
      needed: args.flow_action === "exit_to_global_dispatcher" ||
        args.flow_action === "safety_preempt",
      reason: args.flow_action === "exit_to_global_dispatcher"
        ? "explicit_tool_request"
        : args.flow_action === "safety_preempt"
        ? "safety"
        : "none",
      user_intent_summary: args.flow_action === "exit_to_global_dispatcher"
        ? "User asks for another tool."
        : null,
      local_flow_context: {
        skill_id: "post_morning_nudge",
        flow_kind: "suppressed_action",
        source_nudge_summary: "nudge_kind=suppressed_action_nudge",
        target_action_titles: ["Marcher 10 min"],
        suppressed_action_titles: ["Marcher 10 min"],
        suppression_reason: "high_emotional_load",
        last_local_assessment: null,
      },
      handoff_hint_for_global_dispatcher: {
        likely_intent: args.likely_intent ?? "unknown",
        why: args.flow_action === "exit_to_global_dispatcher"
          ? "Explicit tool request."
          : null,
        constraints: [
          "Do not treat this as post_morning_nudge continuation unless selected again.",
          "Remember that the source nudge intentionally suppressed an action instead of pushing it.",
        ],
      },
    },
    evidence: ["test dispatcher output"],
  };
  return normalizePostMorningNudgeSuppressedActionDispatcherOutput(
    root,
    activeState(),
  );
}

async function runSuppressedScenario(args: {
  userMessage: string;
  output: PostMorningNudgeSuppressedActionDispatcherOutput;
  state?: ReturnType<typeof activeState>;
}) {
  const state = args.state ?? activeState();
  return await runPostMorningNudgeLocalRuntime({
    tempMemory: writePostMorningNudgeActiveState({}, state),
    userId: "user-1",
    userMessage: args.userMessage,
    history: [],
    requestId: "test-request",
    suppressedActionDispatcher: async () => args.output,
    suppressedActionVisibleAgent: async ({ decision }) =>
      `visible:${decision.visible_task.kind}`,
    nowIso: "2026-06-08T07:02:00.000Z",
  });
}

Deno.test("post morning nudge suppressed simple ack closes protectively", async () => {
  const runtime = await runSuppressedScenario({
    userMessage: "merci",
    output: decision({
      flow_action: "protective_close",
      visible_kind: "protective_close",
      close: true,
      readiness: "not_today",
      main_need: "space",
    }),
  });

  assertEquals((runtime?.toolSkillRun as any)?.flow_action, "protective_close");
  assertEquals(runtime?.content, "visible:protective_close");
  assertEquals(
    (runtime?.nextTempMemory as any)[POST_MORNING_NUDGE_TEMP_MEMORY_KEY],
    undefined,
  );
});

Deno.test("post morning nudge suppressed emotional support does not push action", async () => {
  const runtime = await runSuppressedScenario({
    userMessage: "je suis vraiment epuise",
    output: decision({
      flow_action: "support_emotion",
      visible_kind: "soft_support",
      readiness: "needs_support",
      main_need: "support",
    }),
  });

  assertEquals((runtime?.toolSkillRun as any)?.flow_action, "support_emotion");
  assertEquals((runtime?.toolSkillRun as any)?.committed_effects, []);
  assertEquals(
    (runtime?.toolSkillRun as any)?.no_durable_mutation.action_created,
    false,
  );
});

Deno.test("post morning nudge suppressed cannot today confirms no action", async () => {
  const runtime = await runSuppressedScenario({
    userMessage: "je peux pas aujourd'hui",
    output: decision({
      flow_action: "confirm_no_action_today",
      visible_kind: "confirm_no_action_today",
      close: true,
      readiness: "not_today",
      main_need: "rest",
    }),
  });

  assertEquals(
    (runtime?.toolSkillRun as any)?.flow_action,
    "confirm_no_action_today",
  );
  assertEquals(
    (runtime?.toolSkillRun as any)?.no_durable_mutation.plan_patch_written,
    false,
  );
});

Deno.test("post morning nudge suppressed minimal save stays local", async () => {
  const runtime = await runSuppressedScenario({
    userMessage: "j'aimerais quand meme sauver un petit truc",
    output: decision({
      flow_action: "offer_minimal_save",
      visible_kind: "offer_minimal_save",
      readiness: "wants_minimal",
      main_need: "minimal_progress",
    }),
  });

  assertEquals(
    (runtime?.toolSkillRun as any)?.flow_action,
    "offer_minimal_save",
  );
  assertEquals(runtime?.content, "visible:offer_minimal_save");
});

Deno.test("post morning nudge suppressed reopen action gently stays local", async () => {
  const runtime = await runSuppressedScenario({
    userMessage: "non je veux quand meme avancer dessus",
    output: decision({
      flow_action: "reopen_action_gently",
      visible_kind: "reopen_action_gently",
      readiness: "wants_full",
      main_need: "minimal_progress",
    }),
  });

  assertEquals(
    (runtime?.toolSkillRun as any)?.flow_action,
    "reopen_action_gently",
  );
  assertEquals(
    (runtime?.toolSkillRun as any)?.reason_code,
    "post_morning_nudge_suppressed_action_local_dispatcher",
  );
});

Deno.test("post morning nudge suppressed vague answer clarifies softly", async () => {
  const runtime = await runSuppressedScenario({
    userMessage: "je sais pas",
    output: decision({
      flow_action: "ask_suppressed_action_clarification",
      visible_kind: "ask_suppressed_action_clarification",
      readiness: "unclear",
      main_need: "unknown",
    }),
  });

  assertEquals(
    (runtime?.toolSkillRun as any)?.visible_task.kind,
    "ask_suppressed_action_clarification",
  );
});

Deno.test("post morning nudge suppressed repeat context explains protection", async () => {
  const runtime = await runSuppressedScenario({
    userMessage: "pourquoi tu ne me parles pas de mon action ?",
    output: decision({
      flow_action: "repeat_protective_context",
      visible_kind: "repeat_protective_context",
      readiness: "unclear",
      main_need: "clarity",
    }),
  });

  assertEquals(
    (runtime?.toolSkillRun as any)?.flow_action,
    "repeat_protective_context",
  );
});

Deno.test("post morning nudge suppressed negative feedback closes", async () => {
  const runtime = await runSuppressedScenario({
    userMessage: "pas maintenant, ca me met la pression",
    output: decision({
      flow_action: "negative_nudge_feedback",
      visible_kind: "negative_feedback_close",
      close: true,
      readiness: "not_today",
      main_need: "space",
    }),
  });

  assertEquals(
    (runtime?.toolSkillRun as any)?.flow_action,
    "negative_nudge_feedback",
  );
  assertEquals((runtime?.toolSkillRun as any)?.close_after_visible, true);
});

Deno.test("post morning nudge suppressed defense card request exits to global", async () => {
  const runtime = await runSuppressedScenario({
    userMessage: "prepare-moi une carte de defense pour ne pas craquer",
    output: decision({
      flow_action: "exit_to_global_dispatcher",
      visible_kind: "exit_or_cancel",
      status: "exit_to_global",
      likely_intent: "prepare_defense_card",
    }),
  });

  assertEquals(runtime?.content, "");
  assertEquals(
    ((runtime?.nextTempMemory as any)[
      LAST_POST_MORNING_NUDGE_EXIT_MEMO_KEY
    ] as any)
      ?.handoff_hint_for_global_dispatcher?.likely_intent,
    "prepare_defense_card",
  );
});

Deno.test("post morning nudge suppressed attack card request exits to global", async () => {
  const runtime = await runSuppressedScenario({
    userMessage: "prepare-moi une carte d'attaque pour m'y mettre",
    output: decision({
      flow_action: "exit_to_global_dispatcher",
      visible_kind: "exit_or_cancel",
      status: "exit_to_global",
      likely_intent: "prepare_attack_card",
    }),
  });

  assertEquals(
    (runtime?.toolSkillRun as any)?.reason_code,
    "post_morning_nudge_local_exit_to_global_dispatcher",
  );
  assertEquals(
    ((runtime?.toolSkillRun as any)?.exit_memo as any)
      ?.handoff_hint_for_global_dispatcher?.likely_intent,
    "prepare_attack_card",
  );
});

Deno.test("post morning nudge suppressed active flow skips global dispatcher", async () => {
  const runtime = await runSuppressedScenario({
    userMessage: "je suis vraiment epuise",
    output: decision({
      flow_action: "support_emotion",
      visible_kind: "soft_support",
      readiness: "needs_support",
      main_need: "support",
    }),
  });

  assertEquals(
    (runtime?.toolSkillRun as any)?.runtime_trace?.[0]
      ?.global_dispatcher_skipped_due_post_morning_nudge,
    true,
  );
  assertStringIncludes(
    JSON.stringify((runtime?.toolSkillRun as any)?.runtime_trace),
    "post_morning_nudge.suppressed_action_dispatcher",
  );
});

Deno.test("post morning nudge suppressed local exit enables global second pass", async () => {
  const runtime = await runSuppressedScenario({
    userMessage: "prepare-moi une carte de defense",
    output: decision({
      flow_action: "exit_to_global_dispatcher",
      visible_kind: "exit_or_cancel",
      status: "exit_to_global",
      likely_intent: "prepare_defense_card",
    }),
  });

  assertEquals(
    (runtime?.toolSkillRun as any)?.runtime_trace?.[0]
      ?.exit_to_global_dispatcher,
    true,
  );
  assertEquals((runtime?.toolSkillRun as any)?.ai_call_count, 1);
});

Deno.test("post morning nudge suppressed max turns closes local flow", () => {
  const state = activeState({ turn_count: 2, max_turns: 3 });
  const reduced = reducePostMorningNudgeSuppressedActionTurn({
    state,
    output: decision({
      flow_action: "support_emotion",
      visible_kind: "soft_support",
      readiness: "needs_support",
      main_need: "support",
    }),
  });

  assertEquals(reduced.nextState?.status, "closed");
  assertEquals(reduced.closeAfterVisible, true);
});
