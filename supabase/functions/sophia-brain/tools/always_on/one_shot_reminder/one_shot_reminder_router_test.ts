import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { maybeRunOneShotReminderDirectEffect } from "./router.ts";

function fakeSupabase(options?: {
  pending?: Array<{ id: string; scheduled_for: string }>;
  failInsert?: boolean;
}) {
  const pending = options?.pending ?? [];
  return {
    from(table: string) {
      if (table === "profiles") {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({
                    data: { timezone: "Europe/Paris", locale: "fr-FR" },
                  }),
                };
              },
            };
          },
        };
      }
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    like() {
                      return {
                        order() {
                          return {
                            limit: async () => ({ data: pending, error: null }),
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
        upsert(row: any) {
          return {
            select() {
              return {
                single: async () => options?.failInsert
                  ? ({ data: null, error: { message: "boom" } })
                  : ({
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

Deno.test("create_with_time_and_instruction_commits_success", async () => {
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase(),
    userId: "user-1",
    message: "rappelle-moi demain à 16h05 de fermer le doc",
    now: new Date("2026-05-29T10:00:00.000Z"),
  });
  assertEquals(result.status, "success");
  assertEquals(result.committed_effects.length, 1);
  assertEquals(result.executed_tools, ["create_one_shot_reminder"]);
});

Deno.test("create_missing_time_blocks", async () => {
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase(),
    userId: "user-1",
    message: "rappelle-moi de fermer le doc",
    now: new Date("2026-05-29T10:00:00.000Z"),
  });
  assertEquals(result.committed_effects.length, 0);
  assert(result.status === "needs_clarify" || result.status === "ignored");
});

Deno.test("cancel_no_reminder_no_done_language", async () => {
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase({ pending: [] }),
    userId: "user-1",
    message: "annule mon rappel de 16h05",
    now: new Date("2026-05-29T10:00:00.000Z"),
  });
  assertEquals(result.committed_effects.length, 0);
  assertEquals(result.status, "no_reminder");
});

Deno.test("no_tool_blocks_create", async () => {
  const result = await maybeRunOneShotReminderDirectEffect({
    supabase: fakeSupabase(),
    userId: "user-1",
    message: "pas d'outil, rappelle-moi demain à 16h05 de fermer le doc",
    noMutationRequested: true,
    now: new Date("2026-05-29T10:00:00.000Z"),
  });
  assertEquals(result.committed_effects.length, 0);
  assertEquals(result.status, "blocked");
});

Deno.test("legacy_tool_not_used_by_prod_runtime", async () => {
  const files = [
    "supabase/functions/sophia-brain/router/run.ts",
    "supabase/functions/sophia-brain/router/turn_intent_arbitrator.ts",
    "supabase/functions/sophia-brain/agents/companion.ts",
  ];
  for (const file of files) {
    const text = await Deno.readTextFile(file);
    assert(!text.includes("one_shot_reminder_tool.ts"), file);
  }
});
