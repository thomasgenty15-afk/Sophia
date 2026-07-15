import { assertEquals } from "jsr:@std/assert@1";

import { cancelPotionSupportCampaign } from "./potion-support-cancellation.ts";

type RecordedUpdate = { table: string; payload: Record<string, unknown> };

class FakeQuery {
  private action: "select" | "update" | null = null;
  private payload: Record<string, unknown> = {};

  constructor(
    private table: string,
    private updates: RecordedUpdate[],
  ) {}

  select(_columns?: string) {
    this.action = "select";
    return this;
  }
  update(payload: Record<string, unknown>) {
    this.action = "update";
    this.payload = payload;
    return this;
  }
  eq(_column: string, _value: unknown) {
    return this;
  }
  in(_column: string, _values: unknown[]) {
    return this;
  }

  then(
    resolve: (value: unknown) => unknown,
    reject?: (reason: unknown) => unknown,
  ) {
    if (this.action === "update") {
      this.updates.push({ table: this.table, payload: this.payload });
      return Promise.resolve({ data: null, error: null }).then(resolve, reject);
    }
    const data = this.table === "user_recurring_reminders"
      ? [{
        id: "reminder-1",
        status: "active",
        initiative_metadata: {
          potion_support_v1: { version: 1, status: "active" },
        },
      }]
      : this.table === "scheduled_checkins"
      ? [{ id: "checkin-1" }, { id: "checkin-2" }]
      : [];
    return Promise.resolve({ data, error: null }).then(resolve, reject);
  }
}

function fakeAdmin(updates: RecordedUpdate[]) {
  return {
    from(table: string) {
      return new FakeQuery(table, updates);
    },
  } as any;
}

Deno.test("potion support safety cancellation is terminal across reminder, slots and pending consent", async () => {
  const updates: RecordedUpdate[] = [];
  await cancelPotionSupportCampaign({
    admin: fakeAdmin(updates),
    userId: "user-1",
    reason: "cancelled_safety",
    nowIso: "2026-07-15T10:00:00.000Z",
  });

  const reminder = updates.find((entry) =>
    entry.table === "user_recurring_reminders"
  );
  assertEquals(reminder?.payload.status, "archived");
  assertEquals(
    (reminder?.payload.initiative_metadata as any)?.potion_support_v1?.status,
    "cancelled_safety",
  );
  assertEquals(
    updates.find((entry) => entry.table === "scheduled_checkins")?.payload
      .status,
    "cancelled",
  );
  assertEquals(
    updates.find((entry) => entry.table === "whatsapp_pending_actions")
      ?.payload.status,
    "cancelled",
  );
});

Deno.test("resolved potion support completes instead of becoming resumable", async () => {
  const updates: RecordedUpdate[] = [];
  await cancelPotionSupportCampaign({
    admin: fakeAdmin(updates),
    userId: "user-1",
    recurringReminderId: "reminder-1",
    reason: "completed_resolved",
  });
  assertEquals(
    updates.find((entry) => entry.table === "user_recurring_reminders")
      ?.payload.status,
    "completed",
  );
});
