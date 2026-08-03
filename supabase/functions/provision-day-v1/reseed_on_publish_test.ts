/**
 * KEEL W4.2 — republication tests.
 *
 * These are ORDERING tests, not arithmetic ones. The bug this function exists
 * for ("Thursday's reminder quotes Wednesday's withdrawn prescription") is
 * produced by doing the right writes in the wrong order, or by forgetting one
 * of them. So the fake records a call log, and the assertions are on the log.
 */
import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.208.0/assert/mod.ts";

import type { DbRow, ProvisioningPorts, SeedResult } from "./ports.ts";
import type { SeedRow } from "./provisioning.ts";
import { reseedOnPublish } from "./reseed_on_publish.ts";

const STUDENT = "11111111-1111-1111-1111-111111111111";
const NEW_VERSION = "22222222-2222-2222-2222-222222222222";

function planVersionRow(overrides: DbRow = {}): DbRow {
  return {
    id: NEW_VERSION,
    student_id: STUDENT,
    status: "published",
    timezone: "Europe/Paris",
    anchor_week_start: "2026-07-27",
    duration_weeks: 12,
    week_starts_on: "mon",
    phase_plan: [],
    ...overrides,
  };
}

function commitmentRow(overrides: DbRow = {}): DbRow {
  return {
    id: "commitment-1",
    plan_version_id: NEW_VERSION,
    user_id: STUDENT,
    status: "active",
    slot_kind: "nominal",
    evaluation_grain: "occasion",
    slot_key: "breakfast",
    scheduled_days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
    phase_id: null,
    polarity: "do",
    measure: "dose",
    unit: "IU",
    target_op: ">=",
    target_min: 5000,
    target_max: null,
    tolerance_pct: 10,
    substance_ref: "vitamin_d3",
    food_group_ref: null,
    auto_source: null,
    ...overrides,
  };
}

interface Fake {
  ports: ProvisioningPorts;
  calls: string[];
  seeded: SeedRow[];
  cancelledFrom: string[];
  invalidatedFrom: string[];
}

function fakePorts(args: {
  planVersion?: DbRow | null;
  commitments?: DbRow[];
  invalidated?: number;
  cancelled?: number;
} = {}): Fake {
  const calls: string[] = [];
  const seeded: SeedRow[] = [];
  const cancelledFrom: string[] = [];
  const invalidatedFrom: string[] = [];

  const ports: ProvisioningPorts = {
    loadPublishedPlanVersionsPage() {
      calls.push("loadPublishedPlanVersionsPage");
      return Promise.resolve([]);
    },
    loadPlanVersionById() {
      calls.push("loadPlanVersionById");
      return Promise.resolve(
        args.planVersion === undefined ? planVersionRow() : args.planVersion,
      );
    },
    loadActiveStudentIds() {
      calls.push("loadActiveStudentIds");
      return Promise.resolve(new Set([STUDENT]));
    },
    loadActiveCommitments() {
      calls.push("loadActiveCommitments");
      return Promise.resolve(args.commitments ?? [commitmentRow()]);
    },
    seedEvaluations(rows) {
      calls.push("seedEvaluations");
      seeded.push(...rows);
      const result: SeedResult = {
        requested: rows.length,
        validated: rows.length,
        inserted: rows.length,
        conflicted: 0,
        rejected: 0,
      };
      return Promise.resolve(result);
    },
    sweepDay() {
      calls.push("sweepDay");
      return Promise.resolve({
        missed: 0,
        met: 0,
        not_applicable: 0,
        flex_used: 0,
        held_device_unknown: 0,
      });
    },
    invalidateInflightEvaluations({ fromLocalDate }) {
      calls.push("invalidateInflightEvaluations");
      invalidatedFrom.push(fromLocalDate);
      return Promise.resolve(args.invalidated ?? 3);
    },
    cancelInflightCheckins({ fromIso }) {
      calls.push("cancelInflightCheckins");
      cancelledFrom.push(fromIso);
      return Promise.resolve(args.cancelled ?? 2);
    },
  };

  return { ports, calls, seeded, cancelledFrom, invalidatedFrom };
}

// ---------------------------------------------------------------------------

Deno.test("reseedOnPublish — cancels reminders BEFORE deleting evaluations, then re-seeds", () => {
  const fake = fakePorts();
  return reseedOnPublish({
    ports: fake.ports,
    planVersionId: NEW_VERSION,
    now: new Date("2026-07-28T08:00:00Z"), // 10:00 Paris, day wide open
  }).then((result) => {
    // The visible surface is stopped first: between the two writes a reminder
    // could still fire, and it must not fire for a line whose evaluation has
    // already been deleted.
    assertEquals(fake.calls, [
      "loadPlanVersionById",
      "cancelInflightCheckins",
      "invalidateInflightEvaluations",
      "loadActiveCommitments",
      "seedEvaluations",
    ]);
    assertEquals(result.checkinsCancelled, 2);
    assertEquals(result.evaluationsInvalidated, 3);
    assertEquals(result.seed.inserted, 1);
    assertEquals(result.localDate, "2026-07-28");
    assertEquals(result.sameDaySeedSkippedReason, null);
  });
});

Deno.test("reseedOnPublish — invalidation starts at the publication's LOCAL day", () => {
  const fake = fakePorts();
  // 2026-07-28T23:30Z is already the 29th in Paris. Anchoring the invalidation
  // on a UTC date would leave a full local day of the retired prescription in
  // flight.
  return reseedOnPublish({
    ports: fake.ports,
    planVersionId: NEW_VERSION,
    now: new Date("2026-07-28T23:30:00Z"),
  }).then((result) => {
    assertEquals(result.localDate, "2026-07-29");
    assertEquals(fake.invalidatedFrom, ["2026-07-29"]);
  });
});

Deno.test("reseedOnPublish — reminders are cancelled from NOW, not from midnight", () => {
  const fake = fakePorts();
  const now = new Date("2026-07-28T08:00:00Z");
  return reseedOnPublish({ ports: fake.ports, planVersionId: NEW_VERSION, now })
    .then(() => {
      // A reminder that already fired is a message the student has read.
      // Cancelling its row would corrupt the trace of what was actually sent.
      assertEquals(fake.cancelledFrom, [now.toISOString()]);
    });
});

Deno.test("reseedOnPublish — publishing at 23:58 does not seed a day nobody will sweep", () => {
  // The 23:55 sweep has already run. Rows seeded now would sit `unknown`
  // forever: no sweep will ever come back for this date.
  const fake = fakePorts();
  return reseedOnPublish({
    ports: fake.ports,
    planVersionId: NEW_VERSION,
    now: new Date("2026-07-28T21:58:00Z"), // 23:58 Paris
  }).then((result) => {
    assertEquals(result.sameDaySeedSkippedReason, "day_already_closing");
    assertEquals(result.seed.inserted, 0);
    assertEquals(fake.calls.includes("seedEvaluations"), false);
    // The two invalidations still happen: the retired prescription must stop
    // being live immediately, whatever the hour.
    assertEquals(fake.calls.includes("cancelInflightCheckins"), true);
    assertEquals(fake.calls.includes("invalidateInflightEvaluations"), true);
  });
});

Deno.test("reseedOnPublish — R7: refuses to run on a version that is not published", () => {
  const fake = fakePorts({ planVersion: planVersionRow({ status: "draft" }) });
  return assertRejects(
    () =>
      reseedOnPublish({
        ports: fake.ports,
        planVersionId: NEW_VERSION,
        now: new Date("2026-07-28T08:00:00Z"),
      }),
    Error,
    'has status "draft"',
  ).then(() => {
    // Nothing was destroyed on behalf of a plan nobody published.
    assertEquals(fake.calls, ["loadPlanVersionById"]);
  });
});

Deno.test("reseedOnPublish — a missing plan version throws instead of no-opping", () => {
  const fake = fakePorts({ planVersion: null });
  return assertRejects(
    () =>
      reseedOnPublish({
        ports: fake.ports,
        planVersionId: NEW_VERSION,
        now: new Date("2026-07-28T08:00:00Z"),
      }),
    Error,
    "not found",
  ).then(() => undefined);
});

Deno.test("reseedOnPublish — the re-seed obeys the same R6 branches as the daily pass", () => {
  const fake = fakePorts({
    commitments: [
      commitmentRow({ id: "nominal-line" }),
      commitmentRow({
        id: "opportunistic-line",
        slot_kind: "opportunistic",
        evaluation_grain: "day",
        slot_key: "any_meal",
      }),
      commitmentRow({
        id: "weekly-line",
        evaluation_grain: "week",
        slot_kind: null,
        slot_key: null,
      }),
    ],
  });
  return reseedOnPublish({
    ports: fake.ports,
    planVersionId: NEW_VERSION,
    now: new Date("2026-07-28T08:00:00Z"),
  }).then((result) => {
    assertEquals(fake.seeded.map((r) => r.commitment_id), ["nominal-line"]);
    assertEquals(result.skippedByReason, {
      slot_kind_not_nominal: 2,
    });
  });
});

Deno.test("reseedOnPublish — replaying it is harmless (every step is idempotent)", () => {
  const fake = fakePorts({ invalidated: 0, cancelled: 0 });
  const now = new Date("2026-07-28T08:00:00Z");
  return reseedOnPublish({ ports: fake.ports, planVersionId: NEW_VERSION, now })
    .then(() =>
      reseedOnPublish({ ports: fake.ports, planVersionId: NEW_VERSION, now })
    )
    .then((second) => {
      assertEquals(second.evaluationsInvalidated, 0);
      assertEquals(second.checkinsCancelled, 0);
      // The seed call is made again; the RPC absorbs it via ON CONFLICT DO
      // NOTHING (proved in the SQL acceptance test, not here).
      assertEquals(fake.seeded.length, 2);
    });
});
