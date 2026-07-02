import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { loadRecentEffectHistory } from "./effect_ledger_reader.ts";

function makeQuery(rows: unknown[], error: Error | null = null) {
  const filters: Array<{ col: string; val: unknown }> = [];
  const builder: any = {
    select() {
      return this;
    },
    eq(col: string, val: unknown) {
      filters.push({ col, val });
      return this;
    },
    gte() {
      return this;
    },
    order() {
      return this;
    },
    limit() {
      return this;
    },
    then(
      onFulfilled: (value: { data: unknown[]; error: Error | null }) => unknown,
    ) {
      const filtered = rows.filter((row) => {
        if (!row || typeof row !== "object" || Array.isArray(row)) return true;
        const record = row as Record<string, unknown>;
        return filters.every((filter) =>
          Object.hasOwn(record, filter.col)
            ? record[filter.col] === filter.val
            : true
        );
      });
      return Promise.resolve({ data: filtered, error }).then(onFulfilled);
    },
  };
  return builder;
}

function makeFakeSupabase(
  rowsByTable: Record<string, unknown[]>,
  errorTable?: string,
) {
  return {
    from(table: string) {
      return makeQuery(
        rowsByTable[table] ?? [],
        table === errorTable ? new Error("read failed") : null,
      );
    },
  };
}

Deno.test("reader_loads_recent_entries", async () => {
  const supabase = makeFakeSupabase({
    turn_summary_logs: [
      {
        created_at: "2026-05-29T10:01:00.000Z",
        payload: {
          tag: "effect_ledger",
          entries: [
            {
              turn_id: "turn-1",
              user_id: "user-1",
              source_message_id: "msg-1",
              request_id: "req-1",
              created_at: "2026-05-29T10:01:00.000Z",
              status: "requested",
              effect_type: "one_shot_reminder.create",
              operation_type: "one_shot_reminder",
              operation_id: null,
              tool_id: "create_one_shot_reminder",
              source: "tool_skill",
              reason_code: null,
              payload_summary: { scheduled_for: "2026-05-29T11:20:00.000Z" },
              db_ref: null,
            },
          ],
        },
      },
      {
        created_at: "2026-05-29T10:02:00.000Z",
        payload: {
          tag: "effect_ledger",
          entries: [
            {
              turn_id: "turn-2",
              user_id: "user-1",
              source_message_id: "msg-2",
              request_id: "req-2",
              created_at: "2026-05-29T10:02:00.000Z",
              status: "committed",
              effect_type: "one_shot_reminder.create",
              operation_type: "one_shot_reminder",
              operation_id: "op-2",
              tool_id: "create_one_shot_reminder",
              source: "executor",
              reason_code: null,
              payload_summary: {},
              db_ref: { table: "scheduled_checkins", id: "rem-2" },
            },
          ],
        },
      },
    ],
  });

  const entries = await loadRecentEffectHistory({
    supabase,
    userId: "user-1",
    limit: 10,
    sinceIso: "2026-05-29T00:00:00.000Z",
  });

  assertEquals(entries.length, 2);
  assertEquals(entries[0].turn_id, "turn-2");
  assertEquals(entries[0].status, "committed");
  assertEquals(entries[1].turn_id, "turn-1");
});

Deno.test("reader falls back to conversation_turn_traces", async () => {
  const supabase = makeFakeSupabase({
    conversation_turn_traces: [
      {
        turn_id: "turn-trace",
        user_id: "user-1",
        source_message_id: "msg-1",
        ts: "2026-05-29T10:03:00.000Z",
        effect_ledger: {
          turn_id: "turn-trace",
          entries: [
            {
              status: "blocked",
              effect_type: "final_reply.claim",
              source: "guard",
              reason_code: "uncommitted_card_create_claim",
              payload_summary: {},
            },
          ],
        },
      },
    ],
  }, "turn_summary_logs");

  const entries = await loadRecentEffectHistory({
    supabase,
    userId: "user-1",
    limit: 5,
  });

  assertEquals(entries.length, 1);
  assertEquals(entries[0].status, "blocked");
  assertEquals(entries[0].turn_id, "turn-trace");
});

Deno.test("reader keeps only the requested recent turn window", async () => {
  const rows = Array.from({ length: 6 }, (_, index) => {
    const turn = index + 1;
    return {
      created_at: `2026-05-29T10:0${turn}:00.000Z`,
      payload: {
        tag: "effect_ledger",
        entries: [
          {
            turn_id: `turn-${turn}`,
            user_id: "user-1",
            created_at: `2026-05-29T10:0${turn}:00.000Z`,
            status: "committed",
            effect_type: "one_shot_reminder.create",
            source: "executor",
            payload_summary: {},
            db_ref: { table: "scheduled_checkins", id: `rem-${turn}` },
          },
        ],
      },
    };
  });
  const supabase = makeFakeSupabase({ turn_summary_logs: rows });

  const entries = await loadRecentEffectHistory({
    supabase,
    userId: "user-1",
    limit: 20,
    turnLimit: 5,
  });

  assertEquals(entries.map((entry) => entry.turn_id), [
    "turn-6",
    "turn-5",
    "turn-4",
    "turn-3",
    "turn-2",
  ]);
});

Deno.test("reader filters turn_summary_logs by scope when provided", async () => {
  const supabase = makeFakeSupabase({
    turn_summary_logs: [
      {
        scope: "web",
        created_at: "2026-05-29T10:01:00.000Z",
        payload: {
          tag: "effect_ledger",
          entries: [{
            turn_id: "turn-web",
            user_id: "user-1",
            created_at: "2026-05-29T10:01:00.000Z",
            status: "committed",
            effect_type: "one_shot_reminder.create",
            source: "executor",
            payload_summary: {},
          }],
        },
      },
      {
        scope: "other",
        created_at: "2026-05-29T10:02:00.000Z",
        payload: {
          tag: "effect_ledger",
          entries: [{
            turn_id: "turn-other",
            user_id: "user-1",
            created_at: "2026-05-29T10:02:00.000Z",
            status: "committed",
            effect_type: "one_shot_reminder.create",
            source: "executor",
            payload_summary: {},
          }],
        },
      },
    ],
  });

  const entries = await loadRecentEffectHistory({
    supabase,
    userId: "user-1",
    scope: "web",
    limit: 10,
  });

  assertEquals(entries.map((entry) => entry.turn_id), ["turn-web"]);
});
