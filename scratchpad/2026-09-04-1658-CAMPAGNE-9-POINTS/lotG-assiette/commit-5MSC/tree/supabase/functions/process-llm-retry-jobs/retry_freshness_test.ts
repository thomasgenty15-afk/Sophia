import { assertEquals } from "jsr:@std/assert@1";
import {
  completeSkippedJob,
  whatsappRetrySkipReason,
} from "./retry_freshness.ts";

type MessageRow = {
  id: string;
  user_id: string;
  scope: string;
  role: string;
  created_at: string;
};

function fakeAdmin(args: {
  source?: MessageRow | null;
  newer?: MessageRow | null;
}) {
  const updates: Array<{ table: string; patch: Record<string, unknown> }> = [];
  return {
    updates,
    from(table: string) {
      const query = {
        table,
        patch: null as Record<string, unknown> | null,
        filters: new Map<string, unknown>(),
        select(_columns: string) {
          return this;
        },
        update(patch: Record<string, unknown>) {
          this.patch = patch;
          updates.push({ table, patch });
          return this;
        },
        eq(column: string, value: unknown) {
          this.filters.set(column, value);
          return this;
        },
        gt(column: string, value: unknown) {
          this.filters.set(`gt:${column}`, value);
          return this;
        },
        order(_column: string, _opts: unknown) {
          return this;
        },
        limit(_n: number) {
          return this;
        },
        async maybeSingle() {
          if (table !== "chat_messages") return { data: null, error: null };
          if (this.filters.has("id")) {
            return { data: args.source ?? null, error: null };
          }
          return { data: args.newer ?? null, error: null };
        },
      };
      return query;
    },
  };
}

const baseJob = {
  metadata: {
    source_chat_message_id: "msg-source",
    source_chat_message_created_at: "2026-07-08T10:00:00.000Z",
  },
};

const sourceMessage: MessageRow = {
  id: "msg-source",
  user_id: "user-1",
  scope: "whatsapp",
  role: "user",
  created_at: "2026-07-08T10:00:00.000Z",
};

Deno.test("whatsapp retry is skipped when assistant already answered source message", async () => {
  const admin = fakeAdmin({
    source: sourceMessage,
    newer: {
      id: "msg-assistant",
      user_id: "user-1",
      scope: "whatsapp",
      role: "assistant",
      created_at: "2026-07-08T10:00:30.000Z",
    },
  });

  const reason = await whatsappRetrySkipReason(admin, {
    job: baseJob,
    userId: "user-1",
    scope: "whatsapp",
  });

  assertEquals(reason, "already_answered");
});

Deno.test("whatsapp retry is skipped when a newer user message exists", async () => {
  const admin = fakeAdmin({
    source: sourceMessage,
    newer: {
      id: "msg-new-user",
      user_id: "user-1",
      scope: "whatsapp",
      role: "user",
      created_at: "2026-07-08T10:00:30.000Z",
    },
  });

  const reason = await whatsappRetrySkipReason(admin, {
    job: baseJob,
    userId: "user-1",
    scope: "whatsapp",
  });

  assertEquals(reason, "newer_user_message");
});

Deno.test("whatsapp retry proceeds when source message is still unanswered", async () => {
  const admin = fakeAdmin({
    source: sourceMessage,
    newer: null,
  });

  const reason = await whatsappRetrySkipReason(admin, {
    job: baseJob,
    userId: "user-1",
    scope: "whatsapp",
  });

  assertEquals(reason, null);
});

Deno.test("completeSkippedJob records a completed skipped retry", async () => {
  const admin = fakeAdmin({ source: null, newer: null });

  await completeSkippedJob(admin, "job-1", baseJob, "already_answered");

  assertEquals(admin.updates.length, 1);
  assertEquals(admin.updates[0].table, "llm_retry_jobs");
  assertEquals(admin.updates[0].patch.status, "completed");
  assertEquals(
    (admin.updates[0].patch.metadata as Record<string, unknown>).skip_reason,
    "already_answered",
  );
});
