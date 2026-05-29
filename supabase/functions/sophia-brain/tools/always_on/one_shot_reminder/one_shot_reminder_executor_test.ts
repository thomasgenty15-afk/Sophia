import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { executeOneShotReminderEffects } from "./executor.ts";

function fakeSupabase() {
  return {
    from(table: string) {
      return {
        upsert(row: any) {
          assertEquals(table, "scheduled_checkins");
          return {
            select() {
              return {
                single: async () => ({
                  data: {
                    id: "created-1",
                    scheduled_for: row.scheduled_for,
                    event_context: row.event_context,
                  },
                  error: null,
                }),
              };
            },
          };
        },
        update() {
          return {
            in: async () => ({ error: null }),
          };
        },
      };
    },
  } as any;
}

Deno.test("create_with_time_and_instruction_commits", async () => {
  const result = await executeOneShotReminderEffects({
    supabase: fakeSupabase(),
    userId: "user-1",
    effect_plan: {
      requested_effects: [],
      allowed_effects: [{
        type: "create_one_shot_reminder",
        scheduled_for: "2026-05-29T14:05:00.000Z",
        local_label: "vendredi 29 mai à 16:05",
        reminder_instruction: "fermer le doc",
      }],
      blocked_effects: [],
      reason_code: "ready",
    },
  });
  assertEquals(result.committed_effects.length, 1);
  assertEquals(result.committed_effects[0].id, "created-1");
});

Deno.test("cancel_targeted_reminder_commits", async () => {
  const result = await executeOneShotReminderEffects({
    supabase: fakeSupabase(),
    userId: "user-1",
    effect_plan: {
      requested_effects: [],
      allowed_effects: [{
        type: "cancel_one_shot_reminder",
        target_reminder_ids: ["reminder-1"],
        target_local_labels: ["vendredi 29 mai à 16:05"],
      }],
      blocked_effects: [],
      reason_code: "ready",
    },
  });
  assertEquals(result.committed_effects[0].target_reminder_ids, ["reminder-1"]);
});

Deno.test("no_done_language_without_commit", async () => {
  const result = await executeOneShotReminderEffects({
    supabase: fakeSupabase(),
    userId: "user-1",
    effect_plan: {
      requested_effects: [],
      allowed_effects: [{
        type: "create_one_shot_reminder",
        scheduled_for: "",
        reminder_instruction: "fermer le doc",
      }],
      blocked_effects: [],
      reason_code: "ready",
    },
  });
  assertEquals(result.committed_effects.length, 0);
  assertEquals(result.failed_effects[0].reason_code, "missing_time");
});
