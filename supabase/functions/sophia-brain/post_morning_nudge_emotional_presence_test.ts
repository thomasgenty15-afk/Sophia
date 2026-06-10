import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

import type { MorningNudgePayloadV2 } from "./morning_nudge_contract.ts";
import {
  buildPostMorningNudgeLocalHandoffNote,
  createPostMorningNudgeActiveState,
  LAST_POST_MORNING_NUDGE_NOTE_INFORMATION_KEY,
  normalizePostMorningNudgeEmotionalPresenceDispatcherOutput,
  POST_MORNING_NUDGE_TEMP_MEMORY_KEY,
  type PostMorningNudgeEmotionalPresenceDispatcherOutput,
  type PostMorningNudgeEmotionalPresenceFlowAction,
  type PostMorningNudgeEmotionalPresenceVisibleTaskKind,
  reducePostMorningNudgeEmotionalPresenceTurn,
  runPostMorningNudgeLocalRuntime,
  writePostMorningNudgeActiveState,
} from "./post_morning_nudge.ts";

const SOURCE_NUDGE: MorningNudgePayloadV2 = {
  event_context: "morning_nudge_v2",
  nudge_kind: "emotional_presence_nudge",
  posture: "open_door",
  opens_local_flow: true,
  intended_followup_flow: "emotional_presence",
  coach_intent: "support_emotion",
  target_action_ids: [],
  target_action_titles: [],
  target_item_ids: [],
  target_item_titles: [],
  suppressed_action_ids: [],
  suppressed_action_titles: [],
  suppression_reason: null,
  source_reason: "morning_nudge_v2:open_door",
  source_grounding: "event=morning_nudge_v2\nposture=open_door",
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
  flow_action: PostMorningNudgeEmotionalPresenceFlowAction;
  visible_kind: PostMorningNudgeEmotionalPresenceVisibleTaskKind;
  close?: boolean;
  status?: "active" | "closing" | "closed" | "exit_to_global" | "safety";
  support_need?: NonNullable<
    PostMorningNudgeEmotionalPresenceDispatcherOutput["local_assessment"][
      "support_need"
    ]
  >;
  emotional_load?: PostMorningNudgeEmotionalPresenceDispatcherOutput[
    "local_assessment"
  ]["emotional_load"];
  readiness?: PostMorningNudgeEmotionalPresenceDispatcherOutput[
    "local_assessment"
  ]["action_readiness"];
  likely_intent?:
    | "prepare_attack_card"
    | "prepare_defense_card"
    | "select_state_potion"
    | "update_coach_preferences"
    | "product_help"
    | "normal_coaching"
    | "unknown";
  exit_reason?:
    | "topic_change"
    | "explicit_tool_request"
    | "new_goal"
    | "product_help"
    | "status_question"
    | "preference_update"
    | "safety"
    | "unknown";
}): PostMorningNudgeEmotionalPresenceDispatcherOutput {
  const state = activeState();
  const noteInformation = args.flow_action === "exit_to_global_dispatcher" ||
      args.flow_action === "safety_preempt"
    ? buildPostMorningNudgeLocalHandoffNote({
      state,
      reason: args.exit_reason ??
        (args.flow_action === "safety_preempt"
          ? "safety"
          : "explicit_tool_request"),
      userIntentSummary: args.flow_action === "safety_preempt"
        ? "User has a safety signal."
        : "User asks for another global capability.",
      likelyIntent: args.likely_intent ?? "unknown",
      why: args.flow_action === "safety_preempt"
        ? "Safety preemption selected by local dispatcher."
        : "Explicit handoff selected by local dispatcher.",
    }).note_information
    : null;
  const root = {
    flow_action: args.flow_action,
    confidence: "high",
    risk_score: 0,
    local_assessment: {
      action_readiness: args.readiness ?? "not_applicable",
      motivation_need: "none",
      emotional_load: args.emotional_load ?? "low",
      support_need: args.support_need ?? "unknown",
      user_wants_conversation: args.support_need !== "none",
      main_emotion_or_context: args.emotional_load === "high"
        ? "matin difficile"
        : null,
      soft_next_step_candidate: args.visible_kind === "offer_soft_next_step"
        ? "prendre une respiration et nommer ce qui est le plus present"
        : null,
      reactivation_candidate: args.visible_kind === "reactivate_gently"
        ? "retrouver juste une direction pour la matinee"
        : null,
    },
    state_updates: {
      status: args.status ?? (args.close ? "closed" : "active"),
      turn_count_increment: 1,
      close_after_visible: args.close ?? false,
    },
    visible_task: {
      kind: args.visible_kind,
      instruction: "stage specific emotional presence visible prompt",
      conversation_context: {
        known_values: {
          source_nudge_summary: "nudge_kind=emotional_presence_nudge",
          main_emotion_or_context: args.emotional_load === "high"
            ? "matin difficile"
            : null,
          soft_next_step_candidate: args.visible_kind === "offer_soft_next_step"
            ? "prendre une respiration et nommer ce qui est le plus present"
            : null,
          reactivation_candidate: args.visible_kind === "reactivate_gently"
            ? "retrouver juste une direction pour la matinee"
            : null,
          coach_intent: "support_emotion",
        },
        evidence_used: ["test dispatcher output"],
      },
    },
    note_information: noteInformation,
    evidence: ["test dispatcher output"],
  };
  return normalizePostMorningNudgeEmotionalPresenceDispatcherOutput(
    root,
    state,
  );
}

async function runEmotionalPresenceScenario(args: {
  userMessage: string;
  output: PostMorningNudgeEmotionalPresenceDispatcherOutput;
  state?: ReturnType<typeof activeState>;
}) {
  const state = args.state ?? activeState();
  return await runPostMorningNudgeLocalRuntime({
    tempMemory: writePostMorningNudgeActiveState({}, state),
    userId: "user-1",
    userMessage: args.userMessage,
    history: [],
    requestId: "test-request",
    emotionalPresenceDispatcher: async () => args.output,
    emotionalPresenceVisibleAgent: async ({ decision }) =>
      `visible:${decision.visible_task.kind}`,
    nowIso: "2026-06-08T07:02:00.000Z",
  });
}

Deno.test("post morning nudge emotional presence thank you closes", async () => {
  const runtime = await runEmotionalPresenceScenario({
    userMessage: "merci",
    output: decision({
      flow_action: "presence_ack_close",
      visible_kind: "presence_close",
      close: true,
      support_need: "none",
    }),
  });

  assertEquals(
    (runtime?.toolSkillRun as any)?.flow_action,
    "presence_ack_close",
  );
  assertEquals(runtime?.content, "visible:presence_close");
  assertEquals(
    (runtime?.nextTempMemory as any)[POST_MORNING_NUDGE_TEMP_MEMORY_KEY],
    undefined,
  );
});

Deno.test("post morning nudge emotional presence holds space without action pressure", async () => {
  const runtime = await runEmotionalPresenceScenario({
    userMessage: "en vrai ca va pas trop",
    output: decision({
      flow_action: "hold_space_support",
      visible_kind: "hold_space",
      support_need: "listen",
      emotional_load: "high",
    }),
  });

  assertEquals(
    (runtime?.toolSkillRun as any)?.flow_action,
    "hold_space_support",
  );
  assertEquals((runtime?.toolSkillRun as any)?.committed_effects, []);
  assertEquals(
    (runtime?.toolSkillRun as any)?.no_durable_mutation.action_created,
    false,
  );
});

Deno.test("post morning nudge emotional presence vague reply asks support preference", async () => {
  const runtime = await runEmotionalPresenceScenario({
    userMessage: "je sais pas, c'est bizarre",
    output: decision({
      flow_action: "ask_support_preference",
      visible_kind: "ask_support_preference",
      support_need: "clarity",
      emotional_load: "medium",
    }),
  });

  assertEquals(
    (runtime?.toolSkillRun as any)?.visible_task.kind,
    "ask_support_preference",
  );
});

Deno.test("post morning nudge emotional presence offers soft next step without action creation", async () => {
  const runtime = await runEmotionalPresenceScenario({
    userMessage: "donne-moi juste un petit point d'appui",
    output: decision({
      flow_action: "offer_soft_next_step",
      visible_kind: "offer_soft_next_step",
      support_need: "soft_next_step",
      readiness: "wants_direction",
    }),
  });

  assertEquals(
    (runtime?.toolSkillRun as any)?.flow_action,
    "offer_soft_next_step",
  );
  assertEquals(
    (runtime?.toolSkillRun as any)?.no_durable_mutation.action_created,
    false,
  );
});

Deno.test("post morning nudge emotional presence reactivates gently without plan patch", async () => {
  const runtime = await runEmotionalPresenceScenario({
    userMessage: "j'aimerais reprendre un petit cap",
    output: decision({
      flow_action: "reactivate_gently",
      visible_kind: "reactivate_gently",
      support_need: "reactivation",
      readiness: "wants_direction",
    }),
  });

  assertEquals(
    (runtime?.toolSkillRun as any)?.flow_action,
    "reactivate_gently",
  );
  assertEquals(
    (runtime?.toolSkillRun as any)?.no_durable_mutation.plan_patch_written,
    false,
  );
});

Deno.test("post morning nudge emotional presence repeats context", async () => {
  const runtime = await runEmotionalPresenceScenario({
    userMessage: "pourquoi tu m'envoies ca ?",
    output: decision({
      flow_action: "repeat_presence_context",
      visible_kind: "repeat_presence_context",
      support_need: "clarity",
    }),
  });

  assertEquals(
    (runtime?.toolSkillRun as any)?.flow_action,
    "repeat_presence_context",
  );
});

Deno.test("post morning nudge emotional presence action question stays local", async () => {
  const runtime = await runEmotionalPresenceScenario({
    userMessage: "c'etait quoi l'action ?",
    output: decision({
      flow_action: "repeat_presence_context",
      visible_kind: "repeat_presence_context",
      support_need: "clarity",
    }),
  });

  assertEquals(
    (runtime?.toolSkillRun as any)?.reason_code,
    "post_morning_nudge_emotional_presence_local_dispatcher",
  );
  assertStringIncludes(
    JSON.stringify((runtime?.toolSkillRun as any)?.visible_task),
    "emotional_presence_nudge",
  );
});

Deno.test("post morning nudge emotional presence negative feedback closes", async () => {
  const runtime = await runEmotionalPresenceScenario({
    userMessage: "pas maintenant",
    output: decision({
      flow_action: "negative_nudge_feedback",
      visible_kind: "negative_feedback_close",
      close: true,
      support_need: "space",
    }),
  });

  assertEquals(
    (runtime?.toolSkillRun as any)?.flow_action,
    "negative_nudge_feedback",
  );
  assertEquals((runtime?.toolSkillRun as any)?.close_after_visible, true);
});

Deno.test("post morning nudge emotional presence preference update exits to global", async () => {
  const runtime = await runEmotionalPresenceScenario({
    userMessage: "a partir de maintenant pose-moi moins de questions",
    output: decision({
      flow_action: "exit_to_global_dispatcher",
      visible_kind: "exit_or_cancel",
      status: "exit_to_global",
      likely_intent: "update_coach_preferences",
      exit_reason: "preference_update",
    }),
  });

  assertEquals(runtime?.content, "");
  assertEquals(
    ((runtime?.nextTempMemory as any)[
      LAST_POST_MORNING_NUDGE_NOTE_INFORMATION_KEY
    ] as any)
      ?.recommended_next_focus,
    "update_coach_preferences",
  );
});

Deno.test("post morning nudge emotional presence potion request exits to global", async () => {
  const runtime = await runEmotionalPresenceScenario({
    userMessage: "je veux une potion de clarte",
    output: decision({
      flow_action: "exit_to_global_dispatcher",
      visible_kind: "exit_or_cancel",
      status: "exit_to_global",
      likely_intent: "select_state_potion",
    }),
  });

  assertEquals(
    (runtime?.toolSkillRun as any)?.reason_code,
    "post_morning_nudge_local_exit_to_global_dispatcher",
  );
  assertEquals(
    ((runtime?.toolSkillRun as any)?.local_handoff_note as any)
      ?.recommended_next_focus,
    "select_state_potion",
  );
});

Deno.test("post morning nudge emotional presence active flow skips global dispatcher", async () => {
  const runtime = await runEmotionalPresenceScenario({
    userMessage: "en vrai ca va pas trop",
    output: decision({
      flow_action: "hold_space_support",
      visible_kind: "hold_space",
      support_need: "listen",
      emotional_load: "high",
    }),
  });

  assertEquals(
    (runtime?.toolSkillRun as any)?.runtime_trace?.[0]
      ?.global_dispatcher_skipped_due_post_morning_nudge,
    true,
  );
  assertStringIncludes(
    JSON.stringify((runtime?.toolSkillRun as any)?.runtime_trace),
    "post_morning_nudge.emotional_presence_dispatcher",
  );
});

Deno.test("post morning nudge emotional presence local exit enables global second pass", async () => {
  const runtime = await runEmotionalPresenceScenario({
    userMessage: "je veux une potion de clarte",
    output: decision({
      flow_action: "exit_to_global_dispatcher",
      visible_kind: "exit_or_cancel",
      status: "exit_to_global",
      likely_intent: "select_state_potion",
    }),
  });

  assertEquals(
    (runtime?.toolSkillRun as any)?.runtime_trace?.[0]
      ?.exit_to_global_dispatcher,
    true,
  );
  assertEquals((runtime?.toolSkillRun as any)?.ai_call_count, 1);
  assertStringIncludes(
    JSON.stringify((runtime?.toolSkillRun as any)?.local_handoff_note),
    "no hidden target action",
  );
});

Deno.test("post morning nudge emotional presence safety preempt routes with safety note", async () => {
  const runtime = await runEmotionalPresenceScenario({
    userMessage: "je ne suis pas en securite",
    output: decision({
      flow_action: "safety_preempt",
      visible_kind: "safety",
      status: "safety",
      support_need: "listen",
      emotional_load: "high",
    }),
  });

  assertEquals(runtime?.content, "");
  assertEquals(
    (runtime?.toolSkillRun as any)?.reason_code,
    "post_morning_nudge_safety_preempt",
  );
  assertEquals(
    ((runtime?.toolSkillRun as any)?.note_information as any)
      ?.target_dispatcher,
    "safety_crisis",
  );
  assertEquals(
    (runtime?.toolSkillRun as any)?.runtime_trace?.[0]
      ?.global_dispatcher_skipped_due_post_morning_nudge,
    true,
  );
});

Deno.test("post morning nudge emotional presence max turns closes local flow", () => {
  const state = activeState({ turn_count: 2, max_turns: 3 });
  const reduced = reducePostMorningNudgeEmotionalPresenceTurn({
    state,
    output: decision({
      flow_action: "hold_space_support",
      visible_kind: "hold_space",
      support_need: "listen",
      emotional_load: "high",
    }),
  });

  assertEquals(reduced.nextState?.status, "closed");
  assertEquals(reduced.closeAfterVisible, true);
});
