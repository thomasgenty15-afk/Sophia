import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

import type { MorningNudgePayloadV2 } from "./morning_nudge_contract.ts";
import {
  createPostMorningNudgeActiveState,
  LAST_POST_MORNING_NUDGE_EXIT_MEMO_KEY,
  normalizePostMorningNudgeActionDispatcherOutput,
  POST_MORNING_NUDGE_TEMP_MEMORY_KEY,
  type PostMorningNudgeActionDispatcherOutput,
  type PostMorningNudgeActionFlowAction,
  type PostMorningNudgeActionVisibleTaskKind,
  reducePostMorningNudgeActionTurn,
  runPostMorningNudgeLocalRuntime,
  writePostMorningNudgeActiveState,
} from "./post_morning_nudge.ts";

const SOURCE_NUDGE: MorningNudgePayloadV2 = {
  event_context: "morning_nudge_v2",
  nudge_kind: "action_nudge",
  posture: "focus_today",
  opens_local_flow: true,
  intended_followup_flow: "action",
  coach_intent: "motivate_action",
  target_action_ids: ["item-walk"],
  target_action_titles: ["Marcher 10 min"],
  target_item_ids: ["item-walk"],
  target_item_titles: ["Marcher 10 min"],
  suppressed_action_ids: [],
  suppressed_action_titles: [],
  suppression_reason: null,
  source_reason: "morning_nudge_v2:focus_today",
  source_grounding: "event=morning_nudge_v2\nposture=focus_today",
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
  flow_action: PostMorningNudgeActionFlowAction;
  visible_kind: PostMorningNudgeActionVisibleTaskKind;
  close?: boolean;
  status?: "active" | "closing" | "closed" | "exit_to_global" | "safety";
  readiness?: PostMorningNudgeActionDispatcherOutput["local_assessment"][
    "action_readiness"
  ];
  motivation?: PostMorningNudgeActionDispatcherOutput["local_assessment"][
    "motivation_need"
  ];
  friction?: string | null;
  likely_intent?: PostMorningNudgeActionDispatcherOutput["exit_memo"][
    "handoff_hint_for_global_dispatcher"
  ]["likely_intent"];
  exit_reason?: PostMorningNudgeActionDispatcherOutput["exit_memo"]["reason"];
}): PostMorningNudgeActionDispatcherOutput {
  const root = {
    flow_action: args.flow_action,
    confidence: "high",
    risk_score: 0,
    local_assessment: {
      action_readiness: args.readiness ?? "unknown",
      motivation_need: args.motivation ?? "unknown",
      emotional_load: "low",
      user_wants_conversation: false,
      target_action_reference: "Marcher 10 min",
      main_friction: args.friction ?? null,
      next_step_candidate: args.visible_kind === "choose_first_step"
        ? "Mettre les chaussures et sortir deux minutes"
        : null,
      scope_reduction_candidate: args.visible_kind === "reduce_scope"
        ? "Marcher deux minutes"
        : null,
    },
    state_updates: {
      status: args.status ?? (args.close ? "closed" : "active"),
      turn_count_increment: 1,
      close_after_visible: args.close ?? false,
    },
    visible_task: {
      kind: args.visible_kind,
      instruction: "stage specific visible prompt",
      data: {
        target_action_titles: ["Marcher 10 min"],
        target_item_titles: ["Marcher 10 min"],
        main_friction: args.friction ?? null,
        next_step_candidate: null,
        scope_reduction_candidate: null,
      },
    },
    exit_memo: {
      needed: args.flow_action === "exit_to_global_dispatcher" ||
        args.flow_action === "safety_preempt",
      reason: args.exit_reason ??
        (args.flow_action === "exit_to_global_dispatcher"
          ? "explicit_tool_request"
          : args.flow_action === "safety_preempt"
          ? "safety"
          : "none"),
      user_intent_summary: args.flow_action === "exit_to_global_dispatcher"
        ? "User asks for another tool."
        : null,
      local_flow_context: {
        skill_id: "post_morning_nudge",
        flow_kind: "action",
        source_nudge_summary: "nudge_kind=action_nudge",
        target_action_titles: ["Marcher 10 min"],
        suppressed_action_titles: [],
        suppression_reason: null,
        last_local_assessment: null,
      },
      handoff_hint_for_global_dispatcher: {
        likely_intent: args.likely_intent ?? "unknown",
        why: args.flow_action === "exit_to_global_dispatcher"
          ? "Explicit tool request."
          : null,
        constraints: [
          "Do not treat this as post_morning_nudge continuation unless selected again.",
        ],
      },
    },
    evidence: ["test dispatcher output"],
  };
  return normalizePostMorningNudgeActionDispatcherOutput(root, activeState());
}

async function runActionScenario(args: {
  userMessage: string;
  output: PostMorningNudgeActionDispatcherOutput;
  state?: ReturnType<typeof activeState>;
}) {
  const state = args.state ?? activeState();
  return await runPostMorningNudgeLocalRuntime({
    tempMemory: writePostMorningNudgeActiveState({}, state),
    userId: "user-1",
    userMessage: args.userMessage,
    history: [],
    requestId: "test-request",
    actionDispatcher: async () => args.output,
    actionVisibleAgent: async ({ decision }) =>
      `visible:${decision.visible_task.kind}`,
    nowIso: "2026-06-08T07:02:00.000Z",
  });
}

Deno.test("post morning nudge action simple ack closes", async () => {
  const runtime = await runActionScenario({
    userMessage: "ok je m'y mets",
    output: decision({
      flow_action: "quick_close_ready",
      visible_kind: "quick_close",
      close: true,
      readiness: "ready",
      motivation: "none",
    }),
  });

  assertEquals(
    (runtime?.toolSkillRun as any)?.flow_action,
    "quick_close_ready",
  );
  assertEquals(runtime?.content, "visible:quick_close");
  assertEquals(
    (runtime?.nextTempMemory as any)[POST_MORNING_NUDGE_TEMP_MEMORY_KEY],
    undefined,
  );
  assertEquals((runtime?.toolSkillRun as any)?.committed_effects, []);
});

Deno.test("post morning nudge action ready answer has no relaunch question", async () => {
  const runtime = await runActionScenario({
    userMessage: "yes je lance ca",
    output: decision({
      flow_action: "quick_close_ready",
      visible_kind: "quick_close",
      close: true,
      readiness: "ready",
      motivation: "none",
    }),
  });

  assertEquals(
    (runtime?.toolSkillRun as any)?.visible_task.kind,
    "quick_close",
  );
  assertEquals((runtime?.toolSkillRun as any)?.close_after_visible, true);
});

Deno.test("post morning nudge action light hesitation motivates lightly", async () => {
  const runtime = await runActionScenario({
    userMessage: "j'ai un peu la flemme",
    output: decision({
      flow_action: "motivate_light",
      visible_kind: "gentle_boost",
      readiness: "hesitant",
      motivation: "light",
      friction: "flemme ce matin",
    }),
  });

  assertEquals((runtime?.toolSkillRun as any)?.flow_action, "motivate_light");
  assertEquals(runtime?.content, "visible:gentle_boost");
});

Deno.test("post morning nudge action first step stays local", async () => {
  const runtime = await runActionScenario({
    userMessage: "je commence par quoi ?",
    output: decision({
      flow_action: "choose_first_step",
      visible_kind: "choose_first_step",
      readiness: "blocked",
      motivation: "light",
    }),
  });

  assertEquals(
    (runtime?.toolSkillRun as any)?.flow_action,
    "choose_first_step",
  );
  assertEquals(
    (runtime?.toolSkillRun as any)?.reason_code,
    "post_morning_nudge_action_local_dispatcher",
  );
});

Deno.test("post morning nudge action overload reduces scope without plan mutation", async () => {
  const runtime = await runActionScenario({
    userMessage: "c'est trop gros pour ce matin",
    output: decision({
      flow_action: "reduce_scope",
      visible_kind: "reduce_scope",
      readiness: "overloaded",
      motivation: "medium",
      friction: "trop gros",
    }),
  });

  assertEquals((runtime?.toolSkillRun as any)?.flow_action, "reduce_scope");
  assertEquals(
    (runtime?.toolSkillRun as any)?.no_durable_mutation.plan_patch_written,
    false,
  );
});

Deno.test("post morning nudge action concrete blocker gets blocker help", async () => {
  const runtime = await runActionScenario({
    userMessage: "j'ai que 10 minutes",
    output: decision({
      flow_action: "handle_blocker",
      visible_kind: "blocker_help",
      readiness: "blocked",
      motivation: "light",
      friction: "10 minutes disponibles",
    }),
  });

  assertEquals((runtime?.toolSkillRun as any)?.flow_action, "handle_blocker");
  assertEquals(runtime?.content, "visible:blocker_help");
});

Deno.test("post morning nudge action not today closes protectively", async () => {
  const runtime = await runActionScenario({
    userMessage: "je peux pas aujourd'hui",
    output: decision({
      flow_action: "support_not_today",
      visible_kind: "not_today_protective_close",
      close: true,
      readiness: "not_today",
      motivation: "none",
    }),
  });

  assertEquals(
    (runtime?.toolSkillRun as any)?.flow_action,
    "support_not_today",
  );
  assertEquals(
    (runtime?.nextTempMemory as any)[POST_MORNING_NUDGE_TEMP_MEMORY_KEY],
    undefined,
  );
});

Deno.test("post morning nudge action meaning doubt does not launch potion", async () => {
  const runtime = await runActionScenario({
    userMessage: "je vois plus trop pourquoi je fais ca",
    output: decision({
      flow_action: "meaning_reconnect",
      visible_kind: "meaning_reconnect",
      readiness: "hesitant",
      motivation: "medium",
    }),
  });

  assertEquals(
    (runtime?.toolSkillRun as any)?.flow_action,
    "meaning_reconnect",
  );
  assertEquals((runtime?.toolSkillRun as any)?.executedTools, undefined);
  assertEquals(runtime?.executedTools, []);
});

Deno.test("post morning nudge action explicit potion request exits to global", async () => {
  const runtime = await runActionScenario({
    userMessage: "je veux une potion de clarte",
    output: decision({
      flow_action: "exit_to_global_dispatcher",
      visible_kind: "exit_or_cancel",
      status: "exit_to_global",
      likely_intent: "select_state_potion",
    }),
  });

  assertEquals(runtime?.content, "");
  assertEquals(
    (runtime?.toolSkillRun as any)?.reason_code,
    "post_morning_nudge_local_exit_to_global_dispatcher",
  );
  assertEquals(
    ((runtime?.nextTempMemory as any)[
      LAST_POST_MORNING_NUDGE_EXIT_MEMO_KEY
    ] as any)
      ?.handoff_hint_for_global_dispatcher?.likely_intent,
    "select_state_potion",
  );
});

Deno.test("post morning nudge action explicit card request exits to global", async () => {
  const runtime = await runActionScenario({
    userMessage: "prepare-moi une carte d'attaque",
    output: decision({
      flow_action: "exit_to_global_dispatcher",
      visible_kind: "exit_or_cancel",
      status: "exit_to_global",
      likely_intent: "prepare_attack_card",
    }),
  });

  assertEquals(runtime?.content, "");
  assertEquals(
    ((runtime?.toolSkillRun as any)?.exit_memo as any)
      ?.handoff_hint_for_global_dispatcher?.likely_intent,
    "prepare_attack_card",
  );
});

Deno.test("post morning nudge action negative nudge feedback closes", async () => {
  const runtime = await runActionScenario({
    userMessage: "pas maintenant, ca me met la pression",
    output: decision({
      flow_action: "negative_nudge_feedback",
      visible_kind: "negative_feedback_close",
      close: true,
      readiness: "not_today",
    }),
  });

  assertEquals(
    (runtime?.toolSkillRun as any)?.flow_action,
    "negative_nudge_feedback",
  );
  assertEquals((runtime?.toolSkillRun as any)?.close_after_visible, true);
});

Deno.test("post morning nudge action cancel closes", async () => {
  const runtime = await runActionScenario({
    userMessage: "laisse tomber",
    output: decision({
      flow_action: "cancel_flow",
      visible_kind: "exit_or_cancel",
      close: true,
    }),
  });

  assertEquals((runtime?.toolSkillRun as any)?.flow_action, "cancel_flow");
  assertEquals(
    (runtime?.nextTempMemory as any)[POST_MORNING_NUDGE_TEMP_MEMORY_KEY],
    undefined,
  );
});

Deno.test("post morning nudge action active flow skips global dispatcher", async () => {
  const runtime = await runActionScenario({
    userMessage: "j'ai un peu la flemme",
    output: decision({
      flow_action: "motivate_light",
      visible_kind: "gentle_boost",
    }),
  });

  assertEquals(
    (runtime?.toolSkillRun as any)?.runtime_trace?.[0]
      ?.global_dispatcher_skipped_due_post_morning_nudge,
    true,
  );
  assertStringIncludes(
    JSON.stringify((runtime?.toolSkillRun as any)?.runtime_trace),
    "post_morning_nudge.action_dispatcher",
  );
});

Deno.test("post morning nudge action local exit enables global second pass", async () => {
  const runtime = await runActionScenario({
    userMessage: "prepare-moi une carte d'attaque pour m'y mettre",
    output: decision({
      flow_action: "exit_to_global_dispatcher",
      visible_kind: "exit_or_cancel",
      status: "exit_to_global",
      likely_intent: "prepare_attack_card",
    }),
  });

  assertEquals(
    (runtime?.toolSkillRun as any)?.runtime_trace?.[0]
      ?.exit_to_global_dispatcher,
    true,
  );
  assertEquals((runtime?.toolSkillRun as any)?.ai_call_count, 1);
});

Deno.test("post morning nudge action max turns closes local flow", () => {
  const state = activeState({ turn_count: 2, max_turns: 3 });
  const reduced = reducePostMorningNudgeActionTurn({
    state,
    output: decision({
      flow_action: "motivate_light",
      visible_kind: "gentle_boost",
    }),
  });

  assertEquals(reduced.nextState?.status, "closed");
  assertEquals(reduced.closeAfterVisible, true);
});
