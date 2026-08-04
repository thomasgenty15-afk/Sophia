/**
 * KEEL W7.5 — tests of the fleet pass of `evaluate-adherence-v1`.
 *
 * The headline test is `ORDERING`: it asserts, over real IANA zones and every
 * UTC tick of two DST seasons, that the `:45` evaluation always graded the same
 * local day the `:55` sweep is about to close. That property is the whole
 * reason the fix works, and it is the one a comment cannot prove.
 */

import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";

import {
  type FleetPorts,
  parseMode,
  planWindowStateFor,
  runFleetPass,
  type Row,
  type StudentEvaluationOutcome,
} from "./fleet.ts";
import {
  localDateInTimezone,
  parseProvisionPlanVersion,
} from "../provision-day-v1/provisioning.ts";
import { isSweepWindow } from "../provision-day-v1/sweep_gate.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function planRow(overrides: Row = {}): Row {
  return {
    id: `pv-${overrides.student_id ?? "x"}`,
    student_id: "student-a",
    timezone: "Europe/Paris",
    anchor_week_start: "2026-07-20",
    duration_weeks: 12,
    week_starts_on: "mon",
    phase_plan: null,
    ...overrides,
  };
}

interface FakeCall {
  studentId: string;
  localDate: string;
}

function fakePorts(args: {
  rows: Row[];
  activeIds?: string[];
  outcome?: (call: FakeCall) => StudentEvaluationOutcome | Promise<StudentEvaluationOutcome>;
  calls?: FakeCall[];
  pages?: number[];
}): FleetPorts {
  const calls = args.calls ?? [];
  const active = new Set(
    args.activeIds ?? args.rows.map((r) => String(r.student_id)),
  );
  return {
    loadPublishedPlanVersionsPage({ afterStudentId, limit, studentId }) {
      let rows = [...args.rows].sort((a, b) =>
        String(a.student_id) < String(b.student_id) ? -1 : 1
      );
      if (studentId) rows = rows.filter((r) => String(r.student_id) === studentId);
      if (afterStudentId) {
        rows = rows.filter((r) => String(r.student_id) > afterStudentId);
      }
      return Promise.resolve(rows.slice(0, limit));
    },
    loadActiveStudentIds(ids) {
      return Promise.resolve(new Set(ids.filter((id) => active.has(id))));
    },
    async evaluateStudentDay(call) {
      calls.push(call);
      if (args.outcome) return await args.outcome(call);
      return {
        ok: true,
        evaluations: 3,
        inserted: 3,
        updated: 0,
        preserved_human_resolution: 0,
        withheld_week_grain: 0,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// THE ORDERING INVARIANT — in every timezone, not only in UTC
// ---------------------------------------------------------------------------

Deno.test("ORDERING: the :45 evaluation grades the day the :55 sweep closes, in every zone", () => {
  // Offsets covering the whole range, including the three quarter-hour zones
  // (India +5:30, Nepal +5:45, Chatham +12:45) and both hemispheres' DST.
  const zones = [
    "Pacific/Midway", // -11:00
    "Pacific/Honolulu", // -10:00
    "America/Anchorage", // -09:00 / -08:00
    "America/Los_Angeles", // -08:00 / -07:00
    "America/Denver",
    "America/Chicago",
    "America/New_York",
    "America/St_Johns", // -03:30 / -02:30
    "America/Sao_Paulo",
    "Atlantic/Azores",
    "UTC",
    "Europe/London",
    "Europe/Paris",
    "Africa/Lagos",
    "Europe/Athens",
    "Europe/Moscow",
    "Asia/Tehran", // +03:30
    "Asia/Dubai",
    "Asia/Kabul", // +04:30
    "Asia/Karachi",
    "Asia/Kolkata", // +05:30
    "Asia/Kathmandu", // +05:45
    "Asia/Dhaka",
    "Asia/Yangon", // +06:30
    "Asia/Bangkok",
    "Asia/Shanghai",
    "Australia/Eucla", // +08:45
    "Asia/Tokyo",
    "Australia/Darwin", // +09:30
    "Australia/Brisbane",
    "Australia/Adelaide", // +09:30 / +10:30
    "Australia/Sydney",
    "Australia/Lord_Howe", // +10:30 / +11:00
    "Pacific/Norfolk",
    "Pacific/Auckland",
    "Pacific/Chatham", // +12:45 / +13:45
    "Pacific/Apia",
    "Pacific/Kiritimati", // +14:00
  ];

  let sweeps = 0;
  for (const day of ["2026-01-15", "2026-07-15"]) { // both DST seasons
    for (let hour = 0; hour < 24; hour++) {
      const sweepTick = new Date(`${day}T${String(hour).padStart(2, "0")}:55:00Z`);
      const evalTick = new Date(`${day}T${String(hour).padStart(2, "0")}:45:00Z`);
      for (const zone of zones) {
        if (!isSweepWindow(zone, sweepTick)) continue;
        sweeps++;
        assertEquals(
          localDateInTimezone(zone, evalTick),
          localDateInTimezone(zone, sweepTick),
          `${zone} @ ${day} ${hour}h UTC: the evaluation 10 minutes before the ` +
            "sweep resolved a DIFFERENT local date — the sweep would close a day " +
            "the evaluator never graded",
        );
      }
    }
  }
  // Every zone must have had its day closed at least once per season, or the
  // test proved nothing.
  assertEquals(sweeps, zones.length * 2);
});

Deno.test("ORDERING: the fleet pass has NO local-hour gate (every student, every tick)", async () => {
  // Three students whose local hours are 09h, 16h and 00h at the same instant.
  // A pass that gated on a window would evaluate none of them.
  const rows = [
    planRow({ student_id: "a", timezone: "Europe/Paris" }),
    planRow({ student_id: "b", timezone: "America/Los_Angeles" }),
    planRow({ student_id: "c", timezone: "Pacific/Auckland" }),
  ];
  const calls: FakeCall[] = [];
  const report = await runFleetPass({
    ports: fakePorts({ rows, calls }),
    now: new Date("2026-07-27T12:00:00Z"),
  });
  assertEquals(report.students_evaluated, 3);
  assertEquals(report.skipped_by_reason, {});
  assertEquals(
    calls.map((c) => `${c.studentId}:${c.localDate}`).sort(),
    ["a:2026-07-27", "b:2026-07-27", "c:2026-07-28"],
  );
});

// ---------------------------------------------------------------------------
// Fleet selection
// ---------------------------------------------------------------------------

Deno.test("fleet: each student is evaluated on HIS OWN current local date", async () => {
  // 2026-07-28T04:30Z — Paris is already the 28th, Los Angeles is still the 27th.
  const rows = [
    planRow({ student_id: "paris", timezone: "Europe/Paris" }),
    planRow({ student_id: "la", timezone: "America/Los_Angeles" }),
  ];
  const calls: FakeCall[] = [];
  await runFleetPass({
    ports: fakePorts({ rows, calls }),
    now: new Date("2026-07-28T04:30:00Z"),
  });
  assertEquals(
    Object.fromEntries(calls.map((c) => [c.studentId, c.localDate])),
    { paris: "2026-07-28", la: "2026-07-27" },
  );
});

Deno.test("fleet: a non-student account is skipped by reason, never evaluated", async () => {
  const rows = [
    planRow({ student_id: "a" }),
    planRow({ student_id: "b" }),
  ];
  const calls: FakeCall[] = [];
  const report = await runFleetPass({
    ports: fakePorts({ rows, activeIds: ["a"], calls }),
    now: new Date("2026-07-27T12:00:00Z"),
  });
  assertEquals(report.students_evaluated, 1);
  assertEquals(report.skipped_by_reason.not_keel_student, 1);
  assertEquals(calls.map((c) => c.studentId), ["a"]);
});

Deno.test("fleet: an unusable timezone skips THAT student, named, and the pass continues", async () => {
  const rows = [
    planRow({ student_id: "a" }),
    planRow({ student_id: "b", timezone: "GMT+1" }),
    planRow({ student_id: "c" }),
  ];
  const calls: FakeCall[] = [];
  const report = await runFleetPass({
    ports: fakePorts({ rows, calls }),
    now: new Date("2026-07-27T12:00:00Z"),
  });
  assertEquals(report.students_evaluated, 2);
  assertEquals(report.skipped_by_reason.invalid_timezone, 1);
  assertEquals(report.errored_students, 0);
  assert(report.warnings.some((w) => w.includes("b:") && w.includes("GMT+1")));
  assertEquals(calls.map((c) => c.studentId), ["a", "c"]);
});

Deno.test("fleet: a date outside the coach's calendar is skipped, not graded", async () => {
  const rows = [
    planRow({ student_id: "future", anchor_week_start: "2026-09-01" }),
    planRow({ student_id: "over", anchor_week_start: "2026-01-05", duration_weeks: 4 }),
    planRow({ student_id: "live" }),
  ];
  const calls: FakeCall[] = [];
  const report = await runFleetPass({
    ports: fakePorts({ rows, calls }),
    now: new Date("2026-07-27T12:00:00Z"),
  });
  assertEquals(calls.map((c) => c.studentId), ["live"]);
  assertEquals(report.skipped_by_reason.plan_not_started, 1);
  assertEquals(report.skipped_by_reason.plan_duration_elapsed, 1);
});

Deno.test("fleet: the plan window is the SAME derivation the provisioning pass uses", () => {
  const pv = parseProvisionPlanVersion(
    planRow({ student_id: "a", anchor_week_start: "2026-07-20", duration_weeks: 2 }),
  );
  assertEquals(planWindowStateFor(pv, "2026-07-19"), "plan_not_started");
  assertEquals(planWindowStateFor(pv, "2026-07-20"), "in_window");
  assertEquals(planWindowStateFor(pv, "2026-08-02"), "in_window");
  assertEquals(planWindowStateFor(pv, "2026-08-03"), "plan_duration_elapsed");
});

Deno.test("fleet: one student's throw is isolated, counted and named", async () => {
  const rows = ["a", "b", "c"].map((id) => planRow({ student_id: id }));
  const calls: FakeCall[] = [];
  const report = await runFleetPass({
    ports: fakePorts({
      rows,
      calls,
      outcome: (call) => {
        if (call.studentId === "b") throw new Error("boom");
        return {
          ok: true,
          evaluations: 1,
          inserted: 1,
          updated: 0,
          preserved_human_resolution: 0,
          withheld_week_grain: 0,
        };
      },
    }),
    now: new Date("2026-07-27T12:00:00Z"),
  });
  assertEquals(report.students_evaluated, 2);
  assertEquals(report.errored_students, 1);
  assert(report.warnings.some((w) => w.startsWith("b:") && w.includes("boom")));
});

Deno.test("fleet: a named refusal from the per-student path is a skip with its reason", async () => {
  const rows = [planRow({ student_id: "a" })];
  const report = await runFleetPass({
    ports: fakePorts({
      rows,
      outcome: () => ({ ok: false, reason: "no_published_plan_version" }),
    }),
    now: new Date("2026-07-27T12:00:00Z"),
  });
  assertEquals(report.students_evaluated, 0);
  assertEquals(report.errored_students, 0);
  assertEquals(report.skipped_by_reason.no_published_plan_version, 1);
});

Deno.test("fleet: a malformed plan version does not stall the cursor nor the page", async () => {
  const rows = [
    planRow({ student_id: "a" }),
    planRow({ student_id: "b", timezone: null }), // requiredText -> throws
    planRow({ student_id: "c" }),
  ];
  const calls: FakeCall[] = [];
  const report = await runFleetPass({
    ports: fakePorts({ rows, calls }),
    now: new Date("2026-07-27T12:00:00Z"),
  });
  assertEquals(calls.map((c) => c.studentId), ["a", "c"]);
  assertEquals(report.errored_students, 1);
  assertEquals(report.exhausted, true);
});

// ---------------------------------------------------------------------------
// Bounds — a truncated pass says so, and resumes without losing a student
// ---------------------------------------------------------------------------

Deno.test("fleet: the student bound truncates LOUDLY and returns a resumable cursor", async () => {
  const rows = ["a", "b", "c", "d", "e", "f"].map((id) => planRow({ student_id: id }));
  const calls: FakeCall[] = [];
  const report = await runFleetPass({
    ports: fakePorts({ rows, calls }),
    now: new Date("2026-07-27T12:00:00Z"),
    maxStudents: 4,
    concurrency: 2,
  });
  assertEquals(report.truncated_by, "max_students");
  assertEquals(report.exhausted, false);
  assertEquals(report.students_evaluated, 4);
  assertEquals(report.next_after_student_id, "d");

  // Resume: no student is lost, none is skipped over.
  const calls2: FakeCall[] = [];
  const report2 = await runFleetPass({
    ports: fakePorts({ rows, calls: calls2 }),
    now: new Date("2026-07-27T12:00:00Z"),
    afterStudentId: report.next_after_student_id!,
  });
  assertEquals(report2.exhausted, true);
  assertEquals(report2.truncated_by, null);
  assertEquals(
    [...calls, ...calls2].map((c) => c.studentId),
    ["a", "b", "c", "d", "e", "f"],
  );
});

Deno.test("fleet: the wall-clock bound truncates and never advances past unfinished work", async () => {
  const rows = ["a", "b", "c", "d"].map((id) => planRow({ student_id: id }));
  let ticks = 0;
  const calls: FakeCall[] = [];
  const report = await runFleetPass({
    ports: fakePorts({ rows, calls }),
    now: new Date("2026-07-27T12:00:00Z"),
    budgetMs: 10,
    concurrency: 1,
    clock: () => (ticks += 6), // 0, 6, 12... -> over budget after 2 students
  });
  assertEquals(report.truncated_by, "budget_ms");
  assertEquals(report.exhausted, false);
  assert(report.students_evaluated < 4);
  // The cursor is the LAST student actually evaluated, never further.
  assertEquals(
    report.next_after_student_id,
    calls[calls.length - 1].studentId,
  );
});

Deno.test("fleet: a targeted replay scans only that student and is exhaustive", async () => {
  const rows = ["a", "b", "c"].map((id) => planRow({ student_id: id }));
  const calls: FakeCall[] = [];
  const report = await runFleetPass({
    ports: fakePorts({ rows, calls }),
    now: new Date("2026-07-27T12:00:00Z"),
    studentId: "b",
  });
  assertEquals(calls.map((c) => c.studentId), ["b"]);
  assertEquals(report.exhausted, true);
  assertEquals(report.next_after_student_id, null);
});

Deno.test("fleet: the tally reports written rows, not just a count of students", async () => {
  const rows = ["a", "b"].map((id) => planRow({ student_id: id }));
  const report = await runFleetPass({
    ports: fakePorts({
      rows,
      outcome: () => ({
        ok: true,
        evaluations: 5,
        inserted: 2,
        updated: 3,
        preserved_human_resolution: 1,
        withheld_week_grain: 1,
      }),
    }),
    now: new Date("2026-07-27T12:00:00Z"),
  });
  assertEquals(report.students_evaluated, 2);
  assertEquals(report.evaluations_computed, 10);
  assertEquals(report.rows_inserted, 4);
  assertEquals(report.rows_updated, 6);
  assertEquals(report.rows_preserved_human_resolution, 2);
  // The week-grain rows the pass deliberately did NOT write are a number in the
  // tally, never a silence.
  assertEquals(report.rows_withheld_week_grain, 2);
});

// ---------------------------------------------------------------------------
// Mode parsing (R7)
// ---------------------------------------------------------------------------

Deno.test("parseMode: fleet, its alias, and nothing else", () => {
  assertEquals(parseMode("fleet"), "fleet");
  assertEquals(parseMode(" FLEET "), "fleet");
  // The body the already-deployed cron posts must keep working.
  assertEquals(parseMode("due"), "fleet");
  for (const bad of ["provision", "sweep", "", null, undefined, 42]) {
    assertThrows(() => parseMode(bad), Error, "unknown mode");
  }
});
