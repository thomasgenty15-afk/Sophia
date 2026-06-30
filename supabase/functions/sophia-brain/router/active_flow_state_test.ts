import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type ActiveLocalConversationFlowSkillId,
  buildLastLocalFlowExitContext,
  clearActiveConversationSkillState,
  clearLastLocalFlowExitContext,
  clearLegacyRuntimeState,
  clearLegacyRuntimeStateForDirectEffect,
  readActiveFlowState,
  shouldSkipGlobalDispatcherForActiveLocalFlow,
} from "./active_flow_state.ts";
import { ACTIVE_CONVERSATION_SKILL_KEY } from "../skills/_shared/active_skill_state.ts";

function legacyKey(...parts: string[]): string {
  return parts.join("_");
}

const RETAINED_LOCAL_FLOW_IDS: ActiveLocalConversationFlowSkillId[] = [
  "daily_action_review_v1",
  "weekly_adaptive_review_v1",
  "product_help",
  "coaching_recommendation",
  "feature_opportunity",
  "safety_crisis",
];

Deno.test("active_flow_state resumes only retained conversation skills", () => {
  assertEquals(
    (readActiveFlowState({
      __active_skill_state: { skill_id: "weekly_adaptive_review_v1" },
    }).activeSkillState as any)?.skill_id,
    "weekly_adaptive_review_v1",
  );
  assertEquals(
    (readActiveFlowState({
      __active_skill_state: { skill_id: "product_help" },
    }).activeSkillState as any)?.skill_id,
    "product_help",
  );
  assertEquals(
    readActiveFlowState({
      __active_skill_state: { skill_id: legacyKey("removed", "flow") },
    }).activeSkillState,
    null,
  );
});

Deno.test("active_flow_state canonical active conversation key wins over aliases", () => {
  const active = readActiveFlowState({
    [ACTIVE_CONVERSATION_SKILL_KEY]: {
      skill_id: "coaching_recommendation",
      status: "active",
    },
    __active_skill_state: { skill_id: "product_help", status: "active" },
  });

  assertEquals(
    (active.activeSkillState as any)?.skill_id,
    "coaching_recommendation",
  );
});

Deno.test("active_flow_state skips global dispatcher for every retained active local flow", () => {
  for (const skillId of RETAINED_LOCAL_FLOW_IDS) {
    const active = readActiveFlowState({
      __active_skill_state: { skill_id: skillId, status: "active" },
    });
    assertEquals((active.activeSkillState as any)?.skill_id, skillId);
    assertEquals(
      shouldSkipGlobalDispatcherForActiveLocalFlow({
        activeSkillState: active.activeSkillState,
      }),
      true,
    );
  }
});

Deno.test("active_flow_state ignores retained local flows with terminal status", () => {
  for (
    const status of [
      "completed",
      "done",
      "closed",
      "stopped",
      "cancelled",
      "deferred",
      "exit_to_global",
      "exiting",
    ]
  ) {
    const active = readActiveFlowState({
      __active_skill_state: {
        skill_id: "weekly_adaptive_review_v1",
        status,
      },
    });

    assertEquals(active.activeSkillState, null);
    assertEquals(
      shouldSkipGlobalDispatcherForActiveLocalFlow({
        activeSkillState: {
          skill_id: "weekly_adaptive_review_v1",
          status,
        },
      }),
      false,
    );
  }
});

Deno.test("active_flow_state does not skip global dispatcher for unknown legacy flow", () => {
  assertEquals(
    shouldSkipGlobalDispatcherForActiveLocalFlow({
      activeSkillState: { skill_id: "removed_legacy_flow", status: "active" },
    }),
    false,
  );
  assertEquals(
    shouldSkipGlobalDispatcherForActiveLocalFlow({ activeSkillState: null }),
    false,
  );
});

Deno.test("active_flow_state clears all active conversation aliases after local exit", () => {
  const cleaned = clearActiveConversationSkillState({
    [ACTIVE_CONVERSATION_SKILL_KEY]: {
      skill_id: "coaching_recommendation",
      status: "active",
    },
    __active_skill_state: { skill_id: "coaching_recommendation" },
    active_skill_state: { skill_id: "coaching_recommendation" },
    __last_coaching_recommendation_exit_memo: { reason: "topic_change" },
    kept: true,
  });

  assertEquals(cleaned[ACTIVE_CONVERSATION_SKILL_KEY], undefined);
  assertEquals(cleaned.__active_skill_state, undefined);
  assertEquals(cleaned.active_skill_state, undefined);
  assertEquals(cleaned.__last_coaching_recommendation_exit_memo, {
    reason: "topic_change",
  });
  assertEquals(cleaned.kept, true);
});

Deno.test("active_flow_state clears legacy runtime state without resuming it", () => {
  const activeIntakeKey = legacyKey("__active", "tool", "skill", "intake");
  const pendingConfirmationKey = legacyKey(
    "__pending",
    "tool",
    "skill",
    "confirmation",
  );
  const removedConversationKey = legacyKey(
    "__status",
    "recap",
    "flow",
    "state",
    "v1",
  );
  const cleaned = clearLegacyRuntimeState({
    [activeIntakeKey]: { operation_type: "old" },
    [pendingConfirmationKey]: { operation_type: "old" },
    [removedConversationKey]: { skill_id: "old" },
    __active_skill_state: { skill_id: "daily_action_review_v1" },
  });

  assertEquals(cleaned[activeIntakeKey], undefined);
  assertEquals(cleaned[pendingConfirmationKey], undefined);
  assertEquals(cleaned[removedConversationKey], undefined);
  assertEquals(
    (cleaned.__active_skill_state as any).skill_id,
    "daily_action_review_v1",
  );
});

Deno.test("active_flow_state direct-effect cleanup also clears followup consent keys", () => {
  const cleaned = clearLegacyRuntimeStateForDirectEffect({
    __followup_consent_v1: { offered: true },
    kept: true,
  });

  assertEquals(cleaned.__followup_consent_v1, undefined);
  assertEquals(cleaned.kept, true);
});

Deno.test("active_flow_state keeps only retained local exit memos", () => {
  const removedMemoKey = legacyKey("__last", "status", "recap", "exit", "memo");
  const cleaned = clearLastLocalFlowExitContext({
    [removedMemoKey]: { reason: "topic_change" },
    __last_product_help_exit_memo: { reason: "done" },
    kept: true,
  });

  assertEquals(cleaned[removedMemoKey], undefined);
  assertEquals(cleaned.__last_product_help_exit_memo, undefined);
  assertEquals(cleaned.kept, true);
});

Deno.test("active_flow_state exposes and clears coaching recommendation exit memo", () => {
  const context = buildLastLocalFlowExitContext({
    __last_coaching_recommendation_exit_memo: {
      reason: "complete",
      user_intent_summary: "choix de levier termine",
      handoff_hint_for_global_dispatcher: {
        likely_intent: "normal_coaching",
        why: "recommendation-only flow completed",
      },
      at: "2026-06-17T10:00:00.000Z",
    },
  });

  assertEquals(context?.operation_type, "coaching_recommendation");
  assertEquals(context?.reason, "complete");
  assertEquals(
    context?.handoff_hint_for_global_dispatcher,
    "normal_coaching: recommendation-only flow completed",
  );

  const cleaned = clearLastLocalFlowExitContext({
    __last_coaching_recommendation_exit_memo: { reason: "complete" },
    kept: true,
  });
  assertEquals(cleaned.__last_coaching_recommendation_exit_memo, undefined);
  assertEquals(cleaned.kept, true);
});
