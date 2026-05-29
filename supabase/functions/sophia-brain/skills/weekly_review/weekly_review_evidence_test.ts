import { applyWeeklyForgottenProgressAckGuard } from "./guards.ts";
import {
  maybeLogWeeklyForgottenProgressParallel,
  weeklyForgottenProgressHasClearTarget,
} from "./evidence.ts";
import { assertEquals } from "jsr:@std/assert@1";

const weeklyState = {
  skill_id: "weekly_adaptive_review_v1",
  weekly_progress_review: {
    week_start_date: "2026-05-18",
    week_end_date: "2026-05-24",
    transformations: [
      {
        actions: [
          {
            plan_item_id: "item-1",
            title: "Respiration de pause",
            deviation: "missed",
            dimension: "habits",
          },
        ],
      },
    ],
  },
};

Deno.test("forgotten_progress_requires_clear_target", () => {
  assertEquals(
    weeklyForgottenProgressHasClearTarget({
      activeSkillState: weeklyState,
      userMessage: "j'ai oublié de cocher une action faite",
    }),
    true,
  );
  assertEquals(
    weeklyForgottenProgressHasClearTarget({
      activeSkillState: null,
      userMessage: "j'ai oublié de cocher une action faite",
    }),
    false,
  );
});

Deno.test("forgotten_progress_commit_required_for_ack", () => {
  assertEquals(
    applyWeeklyForgottenProgressAckGuard({
      responseContent: "On continue.",
      tempMemory: {},
      loggedMessageId: "m1",
    }),
    "On continue.",
  );
});

Deno.test("low_confidence_progress_no_write", async () => {
  const tempMemory: Record<string, unknown> = {};
  const result = await maybeLogWeeklyForgottenProgressParallel({
    supabase: {} as any,
    userId: "user-1",
    tempMemory,
    activeSkillState: null,
    loggedMessageId: "m1",
    userMessage: "peut-être que j'ai oublié un truc",
  });
  assertEquals(result, { toolExecution: "none", executedTools: [] });
  assertEquals(tempMemory.__weekly_forgotten_progress, undefined);
});
