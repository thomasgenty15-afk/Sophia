import {
  clearWeeklyReviewState,
  isWeeklyReviewActive,
  readWeeklyReviewState,
  updateWeeklyReviewStateAfterTurn,
  writeWeeklyReviewState,
} from "./state.ts";
import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

const weeklyState = {
  skill_id: "weekly_adaptive_review_v1",
  status: "open",
  weekly_flow_state: { status: "open" },
};

Deno.test("weekly_state_read_write_roundtrip", () => {
  const tempMemory = writeWeeklyReviewState({ unrelated: true }, weeklyState);
  assertStrictEquals(
    readWeeklyReviewState({ tempMemory }),
    tempMemory.__active_skill_state,
  );
  assertEquals(tempMemory.unrelated, true);
});

Deno.test("weekly_state_clear_preserves_unrelated_temp_memory", () => {
  const tempMemory = writeWeeklyReviewState({ keep: "value" }, weeklyState);
  const cleared = clearWeeklyReviewState(tempMemory);
  assertEquals(cleared.keep, "value");
  assertEquals(cleared.__active_skill_state, undefined);
});

Deno.test("weekly_state_completed_is_no_longer_active_for_routing", () => {
  // R2-B04: un weekly termine ne doit plus capturer le routage; le tour
  // suivant repart vers le dispatcher global (puis normal_reply).
  const completedState = {
    skill_id: "weekly_adaptive_review_v1",
    status: "completed",
    weekly_flow_state: { status: "completed", stage: "closing" },
  };
  const tempMemory = writeWeeklyReviewState({}, completedState);
  assertEquals(readWeeklyReviewState({ tempMemory }), null);
  assertEquals(isWeeklyReviewActive({ tempMemory }), false);
  // active_skill_state fourni directement (chemin router) doit aussi etre inerte.
  assertEquals(
    readWeeklyReviewState({ activeSkillState: completedState }),
    null,
  );
});

Deno.test("weekly_state_open_stays_active_for_routing", () => {
  const tempMemory = writeWeeklyReviewState({}, weeklyState);
  assertEquals(isWeeklyReviewActive({ tempMemory }), true);
  assertStrictEquals(
    readWeeklyReviewState({ tempMemory }),
    tempMemory.__active_skill_state,
  );
});

Deno.test("weekly_state_after_turn_preserves_state_without_text_patch", () => {
  const tempMemory = writeWeeklyReviewState({}, weeklyState);
  const next = updateWeeklyReviewStateAfterTurn({
    tempMemory,
    activeSkillState: null,
    userMessage: "je veux une organisation concrete pour la semaine prochaine",
    responseContent: "Je te propose une organisation de la semaine prochaine.",
    routeDecision: {
      response_owner: "conversation_handler",
      selected_handler: "weekly_adaptive_review_v1",
    } as any,
  });
  assertEquals(
    next.__active_skill_state.weekly_flow_state.proposal_status,
    undefined,
  );
});
