import { assertEquals } from "jsr:@std/assert@1";

import { resolvePendingByReplyContext } from "./wa_db.ts";

type Row = Record<string, any>;

function createAdmin(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const state = {
        rows: [...(tables[table] ?? [])],
        filters: [] as Array<(row: Row) => boolean>,
      };
      const builder = {
        select(_columns: string) {
          return builder;
        },
        eq(key: string, value: unknown) {
          state.filters.push((row) => row[key] === value);
          return builder;
        },
        filter(key: string, op: string, value: unknown) {
          if (key === "payload->>event_context" && op === "eq") {
            state.filters.push((row) => row.payload?.event_context === value);
          }
          return builder;
        },
        order(key: string, options: { ascending?: boolean }) {
          state.rows.sort((a, b) => {
            const result = String(a[key] ?? "").localeCompare(
              String(b[key] ?? ""),
            );
            return options.ascending ? result : -result;
          });
          return builder;
        },
        limit(_value: number) {
          return builder;
        },
        maybeSingle() {
          const rows = state.rows.filter((row) =>
            state.filters.every((filter) => filter(row))
          );
          return Promise.resolve({ data: rows[0] ?? null, error: null });
        },
        update(_patch: unknown) {
          return builder;
        },
      };
      return builder;
    },
  };
}

Deno.test("pending reply context uses outbound event_context instead of latest pending", async () => {
  const admin = createAdmin({
    whatsapp_outbound_messages: [{
      user_id: "u1",
      provider_message_id: "wamid.target",
      updated_at: "2026-07-16T10:00:00.000Z",
      metadata: { event_context: "recurring_reminder:target" },
    }],
    whatsapp_pending_actions: [
      {
        id: "pending-unrelated-newer",
        user_id: "u1",
        kind: "scheduled_checkin",
        status: "pending",
        payload: { event_context: "daily_checkin" },
        created_at: "2026-07-16T10:05:00.000Z",
        expires_at: "2099-07-17T10:00:00.000Z",
      },
      {
        id: "pending-target",
        user_id: "u1",
        kind: "scheduled_checkin",
        status: "pending",
        payload: { event_context: "recurring_reminder:target" },
        created_at: "2026-07-16T10:00:00.000Z",
        expires_at: "2099-07-17T10:00:00.000Z",
      },
    ],
  });

  const pending = await resolvePendingByReplyContext(
    admin,
    "u1",
    "scheduled_checkin",
    "wamid.target",
  );
  assertEquals(pending?.id, "pending-target");
});
