import { assertEquals } from "jsr:@std/assert@1";

import {
  archivePendingWeekPlansForPlans,
  normalizePlanIds,
} from "./week_plan_lifecycle.ts";

Deno.test("normalizePlanIds deduplicates and drops blank ids", () => {
  assertEquals(normalizePlanIds([" plan-a ", "", "plan-b", "plan-a"]), [
    "plan-a",
    "plan-b",
  ]);
});

Deno.test("archivePendingWeekPlansForPlans updates only pending rows for target plans", async () => {
  const calls: Array<{ op: string; args: unknown[] }> = [];
  const result = { data: [{ id: "week-plan-1" }], error: null, count: 1 };
  const builder = {
    update(...args: unknown[]) {
      calls.push({ op: "update", args });
      return this;
    },
    in(...args: unknown[]) {
      calls.push({ op: "in", args });
      return this;
    },
    eq(...args: unknown[]) {
      calls.push({ op: "eq", args });
      return this;
    },
    select(...args: unknown[]) {
      calls.push({ op: "select", args });
      return Promise.resolve(result);
    },
  };
  const admin = {
    from(table: string) {
      calls.push({ op: "from", args: [table] });
      return builder;
    },
  };

  const count = await archivePendingWeekPlansForPlans(admin as any, {
    planIds: ["plan-a", "plan-a", "plan-b"],
    nowIso: "2026-06-26T10:00:00.000Z",
  });

  assertEquals(count, 1);
  assertEquals(calls, [
    { op: "from", args: ["user_habit_week_plans"] },
    {
      op: "update",
      args: [{
        status: "archived",
        updated_at: "2026-06-26T10:00:00.000Z",
      }, { count: "exact" }],
    },
    { op: "in", args: ["plan_id", ["plan-a", "plan-b"]] },
    { op: "eq", args: ["status", "pending_confirmation"] },
    { op: "select", args: ["id"] },
  ]);
});

Deno.test("archivePendingWeekPlansForPlans skips empty plan ids", async () => {
  let called = false;
  const admin = {
    from() {
      called = true;
      throw new Error("should not query");
    },
  };

  const count = await archivePendingWeekPlansForPlans(admin as any, {
    planIds: ["", "   "],
    nowIso: "2026-06-26T10:00:00.000Z",
  });

  assertEquals(count, 0);
  assertEquals(called, false);
});
