import {
  reviewWeeklyReviewConfirmation,
  weeklyReviewConfirmationClearsPending,
} from "./confirmation.ts";
import { assertEquals } from "jsr:@std/assert@1";

const pending_patch = {
  requires_confirmation: true,
  operations: [{ op: "insert_bridge_week", details: {} }],
} as any;

Deno.test("approve_pending_weekly_patch_allowed", () => {
  assertEquals(
    reviewWeeklyReviewConfirmation({ user_message: "applique", pending_patch }),
    "approve",
  );
});

Deno.test("explain_pending_weekly_patch_no_apply", () => {
  assertEquals(
    reviewWeeklyReviewConfirmation({
      user_message: "explique pourquoi",
      pending_patch,
    }),
    "explain",
  );
});

Deno.test("revise_pending_weekly_patch_no_apply", () => {
  assertEquals(
    reviewWeeklyReviewConfirmation({
      user_message: "change plutôt la cadence",
      pending_patch,
    }),
    "revise",
  );
});

Deno.test("reject_pending_weekly_patch_clears_or_pauses", () => {
  const decision = reviewWeeklyReviewConfirmation({
    user_message: "pas maintenant",
    pending_patch,
  });
  assertEquals(decision, "reject");
  assertEquals(weeklyReviewConfirmationClearsPending(decision), true);
});

Deno.test("unrelated_preserves_pending_without_apply", () => {
  const decision = reviewWeeklyReviewConfirmation({
    user_message: "au fait, autre question",
    pending_patch,
  });
  assertEquals(decision, "unrelated");
  assertEquals(weeklyReviewConfirmationClearsPending(decision), false);
});
