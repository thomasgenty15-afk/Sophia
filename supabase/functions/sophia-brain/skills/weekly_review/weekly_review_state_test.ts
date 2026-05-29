import {
  clearWeeklyReviewState,
  readWeeklyReviewState,
  updateWeeklyReviewStateAfterTurn,
  writeWeeklyReviewState,
} from "./state.ts";
import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";

const weeklyState = {
  skill_id: "weekly_adaptive_review_v1",
  status: "open",
  weekly_flow_state: { status: "open" },
  pending_weekly_patch: { id: "patch-1" },
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

Deno.test("weekly_state_after_turn_updates_without_overwriting_pending_patch", () => {
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
    next.__active_skill_state.pending_weekly_patch,
    weeklyState.pending_weekly_patch,
  );
  assertEquals(
    next.__active_skill_state.weekly_flow_state.proposal_status,
    "discussed_not_applied",
  );
});
