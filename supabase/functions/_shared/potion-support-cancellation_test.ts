import { assertEquals, assertRejects } from "jsr:@std/assert@1";

import { cancelPotionSupportCampaign } from "./potion-support-cancellation.ts";

type Row = Record<string, unknown>;
type TableName =
  | "user_recurring_reminders"
  | "scheduled_checkins"
  | "whatsapp_pending_actions";
type Filter =
  | { kind: "eq"; column: string; value: unknown }
  | { kind: "in"; column: string; values: unknown[] };

class FakeQuery {
  private action: "select" | "update" | null = null;
  private payload: Row = {};
  private filters: Filter[] = [];
  private returnRows = false;

  constructor(
    private table: TableName,
    private db: FakeDb,
  ) {}

  select(_columns?: string) {
    if (this.action === "update") {
      this.returnRows = true;
    } else {
      this.action = "select";
    }
    return this;
  }

  update(payload: Row) {
    this.action = "update";
    this.payload = payload;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ kind: "eq", column, value });
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push({ kind: "in", column, values });
    return this;
  }

  then(
    resolve: (value: unknown) => unknown,
    reject?: (reason: unknown) => unknown,
  ) {
    return Promise.resolve(this.execute()).then(resolve, reject);
  }

  private execute() {
    if (this.action === "select") {
      if (this.db.selectErrors.has(this.table)) {
        return { data: null, error: new Error(`select failed: ${this.table}`) };
      }
      return {
        data: this.matchingRows().map((row) => structuredClone(row)),
        error: null,
      };
    }
    if (this.action === "update") {
      if (this.db.updateErrors.has(this.table)) {
        return { data: null, error: new Error(`update failed: ${this.table}`) };
      }
      if (this.db.silentUpdateTables.has(this.table)) {
        return { data: this.returnRows ? [] : null, error: null };
      }
      const matches = this.matchingRows();
      for (const row of matches) {
        Object.assign(row, structuredClone(this.payload));
      }
      return {
        data: this.returnRows
          ? matches.map((row) => structuredClone(row))
          : null,
        error: null,
      };
    }
    throw new Error("Fake query executed without an action");
  }

  private matchingRows(): Row[] {
    return this.db.tables[this.table].filter((row) =>
      this.filters.every((filter) => {
        if (filter.kind === "eq") return row[filter.column] === filter.value;
        return filter.values.includes(row[filter.column]);
      })
    );
  }
}

class FakeDb {
  tables: Record<TableName, Row[]>;
  selectErrors = new Set<TableName>();
  updateErrors = new Set<TableName>();
  silentUpdateTables = new Set<TableName>();

  constructor(input?: Partial<Record<TableName, Row[]>>) {
    this.tables = {
      user_recurring_reminders: structuredClone(
        input?.user_recurring_reminders ?? [],
      ),
      scheduled_checkins: structuredClone(input?.scheduled_checkins ?? []),
      whatsapp_pending_actions: structuredClone(
        input?.whatsapp_pending_actions ?? [],
      ),
    };
  }

  from(table: TableName) {
    return new FakeQuery(table, this);
  }
}

function activeCampaignDb() {
  return new FakeDb({
    user_recurring_reminders: [{
      id: "reminder-1",
      user_id: "user-1",
      initiative_kind: "potion_follow_up",
      source_potion_session_id: "potion-session-1",
      status: "active",
      initiative_metadata: {
        unrelated: "preserved",
        potion_support_v1: { version: 1, status: "active" },
      },
    }],
    scheduled_checkins: [
      {
        id: "checkin-1",
        user_id: "user-1",
        recurring_reminder_id: "reminder-1",
        status: "pending",
      },
      {
        id: "checkin-2",
        user_id: "user-1",
        recurring_reminder_id: "reminder-1",
        status: "retrying",
      },
      {
        id: "checkin-sent",
        user_id: "user-1",
        recurring_reminder_id: "reminder-1",
        status: "sent",
      },
    ],
    whatsapp_pending_actions: [
      {
        id: "pending-1",
        scheduled_checkin_id: "checkin-1",
        status: "pending",
      },
      {
        id: "pending-sent-checkin",
        scheduled_checkin_id: "checkin-sent",
        status: "pending",
      },
      {
        id: "pending-already-processed",
        scheduled_checkin_id: "checkin-2",
        status: "processed",
      },
    ],
  });
}

Deno.test("potion support safety cancellation is terminal, verified and reports affected ids", async () => {
  const db = activeCampaignDb();
  const outcome = await cancelPotionSupportCampaign({
    admin: db as any,
    userId: "user-1",
    reason: "cancelled_safety",
    nowIso: "2026-07-15T10:00:00.000Z",
  });

  assertEquals(outcome, {
    reason: "cancelled_safety",
    matchedReminderIds: ["reminder-1"],
    terminalizedReminderIds: ["reminder-1"],
    alreadyTerminalReminderIds: [],
    cancelledReminderIds: ["reminder-1"],
    cancelledCheckinIds: ["checkin-1", "checkin-2"],
    cancelledPendingActionIds: ["pending-1", "pending-sent-checkin"],
    counts: {
      matchedReminders: 1,
      terminalizedReminders: 1,
      alreadyTerminalReminders: 0,
      cancelledCheckins: 2,
      cancelledPendingActions: 2,
    },
    verification: {
      passed: true,
      checkedAt: "2026-07-15T10:00:00.000Z",
      activeReminderIds: [],
      activeCheckinIds: [],
      pendingActionIds: [],
    },
  });
  assertEquals(db.tables.user_recurring_reminders[0].status, "archived");
  assertEquals(
    (db.tables.user_recurring_reminders[0].initiative_metadata as any)
      .potion_support_v1.terminal_reason,
    "cancelled_safety",
  );
  assertEquals(
    db.tables.scheduled_checkins.map((row) => [row.id, row.status]),
    [
      ["checkin-1", "cancelled"],
      ["checkin-2", "cancelled"],
      ["checkin-sent", "sent"],
    ],
  );
  assertEquals(
    db.tables.whatsapp_pending_actions.map((row) => [row.id, row.status]),
    [
      ["pending-1", "cancelled"],
      ["pending-sent-checkin", "cancelled"],
      ["pending-already-processed", "processed"],
    ],
  );
});

Deno.test("potion support cancellation is idempotent and an absent scope is verified", async () => {
  const db = activeCampaignDb();
  await cancelPotionSupportCampaign({
    admin: db as any,
    userId: "user-1",
    recurringReminderId: "reminder-1",
    reason: "cancelled_user_boundary",
    nowIso: "2026-07-15T10:00:00.000Z",
  });

  const second = await cancelPotionSupportCampaign({
    admin: db as any,
    userId: "user-1",
    recurringReminderId: "reminder-1",
    reason: "cancelled_user_boundary",
    nowIso: "2026-07-16T10:00:00.000Z",
  });
  assertEquals(second.terminalizedReminderIds, []);
  assertEquals(second.alreadyTerminalReminderIds, ["reminder-1"]);
  assertEquals(second.cancelledCheckinIds, []);
  assertEquals(second.cancelledPendingActionIds, []);
  assertEquals(second.verification.passed, true);
  assertEquals(
    (db.tables.user_recurring_reminders[0].initiative_metadata as any)
      .potion_support_v1.terminal_at,
    "2026-07-15T10:00:00.000Z",
  );

  const absent = await cancelPotionSupportCampaign({
    admin: db as any,
    userId: "user-1",
    recurringReminderId: "missing-reminder",
    reason: "cancelled_safety",
    nowIso: "2026-07-16T11:00:00.000Z",
  });
  assertEquals(absent.counts, {
    matchedReminders: 0,
    terminalizedReminders: 0,
    alreadyTerminalReminders: 0,
    cancelledCheckins: 0,
    cancelledPendingActions: 0,
  });
  assertEquals(absent.verification.passed, true);
});

Deno.test("potion support cancellation rejects a silent reminder update", async () => {
  const db = activeCampaignDb();
  db.silentUpdateTables.add("user_recurring_reminders");

  await assertRejects(
    () =>
      cancelPotionSupportCampaign({
        admin: db as any,
        userId: "user-1",
        recurringReminderId: "reminder-1",
        reason: "cancelled_safety",
      }),
    Error,
    "update affected no row",
  );
  assertEquals(db.tables.user_recurring_reminders[0].status, "active");
  assertEquals(db.tables.scheduled_checkins[0].status, "pending");
});

Deno.test("resolved potion support completes instead of becoming resumable", async () => {
  const db = activeCampaignDb();
  const outcome = await cancelPotionSupportCampaign({
    admin: db as any,
    userId: "user-1",
    recurringReminderId: "reminder-1",
    reason: "completed_resolved",
    nowIso: "2026-07-15T10:00:00.000Z",
  });
  assertEquals(db.tables.user_recurring_reminders[0].status, "completed");
  assertEquals(outcome.verification.passed, true);
});

Deno.test("potion support cancellation surfaces select and update errors", async (t) => {
  await t.step("initial select", async () => {
    const db = activeCampaignDb();
    db.selectErrors.add("user_recurring_reminders");
    await assertRejects(
      () =>
        cancelPotionSupportCampaign({
          admin: db as any,
          userId: "user-1",
          reason: "cancelled_safety",
        }),
      Error,
      "reminder selection",
    );
  });

  await t.step("check-in update", async () => {
    const db = activeCampaignDb();
    db.updateErrors.add("scheduled_checkins");
    await assertRejects(
      () =>
        cancelPotionSupportCampaign({
          admin: db as any,
          userId: "user-1",
          reason: "cancelled_safety",
        }),
      Error,
      "check-in cancellation",
    );
  });
});
