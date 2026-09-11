import { assertEquals } from "jsr:@std/assert@1";
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import { JOURNAL_EVENT_COLUMNS, loadJournalEvents } from "./tracking_v2_io.ts";

function databaseWithResponses(
  responses: Array<{
    data: Record<string, unknown>[] | null;
    error: { code?: string; message?: string } | null;
  }>,
  columns: string[],
): SupabaseClient {
  return {
    from(table: string) {
      assertEquals(table, "protocol_events");
      return {
        select(selected: string) {
          columns.push(selected);
          const response = responses.shift();
          if (!response) throw new Error("unexpected journal read");
          const query = {
            eq() {
              return query;
            },
            gte() {
              return query;
            },
            lte() {
              return query;
            },
            order() {
              return Promise.resolve(response);
            },
          };
          return query;
        },
      };
    },
  } as unknown as SupabaseClient;
}

Deno.test("journal V2 retries without meal_context before the additive migration", async () => {
  const columns: string[] = [];
  const db = databaseWithResponses([
    {
      data: null,
      error: {
        code: "42703",
        message: "column protocol_events.meal_context does not exist",
      },
    },
    {
      data: [{ id: "event-1", local_date: "2026-09-09" }],
      error: null,
    },
  ], columns);

  const result = await loadJournalEvents(db, {
    userId: "user-1",
    from: "2026-09-07",
    to: "2026-09-13",
  });

  assertEquals(columns.length, 2);
  assertEquals(columns[0], JOURNAL_EVENT_COLUMNS);
  assertEquals(columns[1].includes("meal_context"), false);
  assertEquals(result.error, null);
  assertEquals(result.data?.[0]?.meal_context, null);
});

Deno.test("journal V2 preserves unrelated database errors", async () => {
  const columns: string[] = [];
  const db = databaseWithResponses([
    {
      data: null,
      error: { code: "42501", message: "permission denied" },
    },
  ], columns);

  const result = await loadJournalEvents(db, {
    userId: "user-1",
    from: "2026-09-07",
    to: "2026-09-13",
  });

  assertEquals(columns.length, 1);
  assertEquals(result.error?.code, "42501");
});
