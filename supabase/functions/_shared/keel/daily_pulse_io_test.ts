// PIVOT NUTRITION — N2: daily_pulse_io.ts.
//
// The test that carries the product decision:
//   * "a question that went out is a question asked, answered or not"
//     -- the evening window is two hours wide and the cron is hourly, so there
//        are TWO ticks inside it. Before this gate existed, the only thing that
//        moved was the student's ANSWER: a silent student was asked again one
//        hour later. Proven in local on 2026-08-03 with two `keel_daily_pulse`
//        outbound rows on the same local day for one student who never replied.
//        Silence is not a request for a reminder.

import { assert, assertEquals } from "jsr:@std/assert@1";

import { PULSE_QUESTION_PURPOSE, wasPulseAskedToday } from "./daily_pulse_io.ts";

// ---------------------------------------------------------------------------
// A fake matching the exact chain the module uses:
//   from(t).select(c).eq(..).eq(..).gte(..)  -> awaited
// ---------------------------------------------------------------------------
function fakeDb(rows: Array<Record<string, unknown>>) {
  const seen: Array<[string, unknown]> = [];
  const make = () => {
    let data = [...rows];
    const node: Record<string, unknown> = {
      eq: (col: string, val: unknown) => {
        seen.push([col, val]);
        data = data.filter((r) =>
          String(col === "metadata->>purpose" ? r.purpose : r[col] ?? "") ===
            String(val)
        );
        return node;
      },
      gte: (col: string, val: string) => {
        data = data.filter((r) => String(r[col] ?? "") >= val);
        return node;
      },
      then: (resolve: (v: unknown) => unknown) => resolve({ data, error: null }),
    };
    return node;
  };
  return {
    db: { from: () => ({ select: () => make() }) },
    seen,
  };
}

const NOW = new Date("2026-08-03T18:10:00Z");

Deno.test("a question already sent today closes the day, answer or no answer", async () => {
  const { db } = fakeDb([
    {
      user_id: "u1",
      purpose: PULSE_QUESTION_PURPOSE,
      // 20:10 Paris on 2026-08-03 — the first tick of the window.
      created_at: "2026-08-03T18:10:00.000Z",
    },
  ]);
  assertEquals(
    await wasPulseAskedToday(db, {
      userId: "u1",
      localDate: "2026-08-03",
      timezone: "Europe/Paris",
      now: NOW,
    }),
    true,
  );
});

Deno.test("...and its disarming condition: nothing sent today leaves the day open", async () => {
  // Premise-false test. A belt that can only say no would silently kill the
  // whole feature, and it would look exactly like a working belt.
  const { db } = fakeDb([
    {
      user_id: "u1",
      purpose: PULSE_QUESTION_PURPOSE,
      // Yesterday evening, Paris time. Different local day, no hold on today.
      created_at: "2026-08-02T18:10:00.000Z",
    },
  ]);
  assertEquals(
    await wasPulseAskedToday(db, {
      userId: "u1",
      localDate: "2026-08-03",
      timezone: "Europe/Paris",
      now: NOW,
    }),
    false,
  );
});

Deno.test("the day is the STUDENT'S day, not UTC's", async () => {
  // 2026-08-04T00:30Z is 20:30 on 2026-08-03 in New York: the whole American
  // evening window sits on the NEXT UTC date. Bucketing on UTC would file this
  // question under 08-04 and re-ask an hour later on 08-03.
  const { db } = fakeDb([
    {
      user_id: "u1",
      purpose: PULSE_QUESTION_PURPOSE,
      created_at: "2026-08-04T00:30:00.000Z",
    },
  ]);
  const args = {
    userId: "u1",
    timezone: "America/New_York",
    now: new Date("2026-08-04T01:10:00Z"),
  };
  assertEquals(
    await wasPulseAskedToday(db, { ...args, localDate: "2026-08-03" }),
    true,
    "the student's local evening",
  );
  assertEquals(
    await wasPulseAskedToday(db, { ...args, localDate: "2026-08-04" }),
    false,
    "the UTC date is a different day and must not be credited",
  );
});

Deno.test("only the QUESTION closes the day, not the ack that follows a tap", async () => {
  // `keel_daily_pulse_ack` and `keel_daily_pulse_axis` are replies to the
  // student, not asks. Counting them would be harmless today (a tap implies an
  // answer, which already gates) but wrong the day the ack path is reused.
  const { db } = fakeDb([
    { user_id: "u1", purpose: "keel_daily_pulse_ack", created_at: "2026-08-03T18:20:00.000Z" },
    { user_id: "u1", purpose: "keel_daily_pulse_axis", created_at: "2026-08-03T18:21:00.000Z" },
  ]);
  assertEquals(
    await wasPulseAskedToday(db, {
      userId: "u1",
      localDate: "2026-08-03",
      timezone: "Europe/Paris",
      now: NOW,
    }),
    false,
  );
});

Deno.test("the query is scoped to the student and to the pulse purpose", async () => {
  const { db, seen } = fakeDb([]);
  await wasPulseAskedToday(db, {
    userId: "u1",
    localDate: "2026-08-03",
    timezone: "Europe/Paris",
    now: NOW,
  });
  // Cross-tenant reads are a global red line in this repo: the scope is not
  // decoration, it is the guarantee.
  assert(seen.some(([c, v]) => c === "user_id" && v === "u1"), "scoped by user");
  assert(
    seen.some(([c, v]) => c === "metadata->>purpose" && v === PULSE_QUESTION_PURPOSE),
    "scoped by purpose",
  );
});

Deno.test("a missing timezone falls back to the UTC day instead of throwing", async () => {
  // No timezone is a data gap, not a reason to spam or to crash: the job counts
  // these students and moves on.
  const { db } = fakeDb([
    { user_id: "u1", purpose: PULSE_QUESTION_PURPOSE, created_at: "2026-08-03T18:10:00.000Z" },
  ]);
  assertEquals(
    await wasPulseAskedToday(db, {
      userId: "u1",
      localDate: "2026-08-03",
      timezone: null,
      now: NOW,
    }),
    true,
  );
});
