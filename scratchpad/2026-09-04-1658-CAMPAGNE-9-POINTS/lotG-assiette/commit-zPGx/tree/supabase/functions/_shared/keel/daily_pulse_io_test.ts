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

import {
  loadAskCadence,
  PULSE_ASKED_METADATA_KEY,
  PULSE_QUESTION_PURPOSE,
  wasPulseSentToday,
} from "./daily_pulse_io.ts";

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
    await wasPulseSentToday(db, {
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
    await wasPulseSentToday(db, {
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
    await wasPulseSentToday(db, { ...args, localDate: "2026-08-03" }),
    true,
    "the student's local evening",
  );
  assertEquals(
    await wasPulseSentToday(db, { ...args, localDate: "2026-08-04" }),
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
    await wasPulseSentToday(db, {
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
  await wasPulseSentToday(db, {
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
    await wasPulseSentToday(db, {
      userId: "u1",
      localDate: "2026-08-03",
      timezone: null,
      now: NOW,
    }),
    true,
  );
});

// ---------------------------------------------------------------------------
// THE CADENCE STATE — and the flag the whole thing hangs on
// ---------------------------------------------------------------------------

type OutRow = { local_date: string; asked?: boolean | undefined };
type CheckinRow = { local_date: string; overall: string };

/**
 * A fake covering BOTH chains `loadAskCadence` walks:
 *   outbound_messages:      select .eq .eq .gte                       -> await
 *   student_daily_checkins: select .eq .gte .lte .order .limit        -> await
 */
function cadenceDb(args: { asks: OutRow[]; checkins: CheckinRow[] }) {
  const outbound = args.asks.map((a) => ({
    created_at: `${a.local_date}T18:10:00.000Z`,
    metadata: {
      purpose: PULSE_QUESTION_PURPOSE,
      local_date: a.local_date,
      // `undefined` models a LEGACY row: written before the flag existed.
      ...(a.asked === undefined ? {} : { [PULSE_ASKED_METADATA_KEY]: a.asked }),
    },
  }));
  const checkins = [...args.checkins].sort((a, b) => (a.local_date < b.local_date ? 1 : -1));

  const chain = (rows: unknown[]) => {
    const node: Record<string, unknown> = {
      eq: () => node,
      gte: () => node,
      lte: () => node,
      order: () => node,
      limit: (n: number) => ({
        then: (r: (v: unknown) => unknown) => r({ data: rows.slice(0, n), error: null }),
      }),
      then: (r: (v: unknown) => unknown) => r({ data: rows, error: null }),
    };
    return node;
  };

  return {
    from: (table: string) => ({
      select: () => chain(table === "outbound_messages" ? outbound : checkins),
    }),
  };
}

const CADENCE_ARGS = {
  userId: "u1",
  localDate: "2026-08-10",
  timezone: "Europe/Paris",
  now: new Date("2026-08-10T18:10:00Z"),
};

Deno.test("A RECAP IS NOT AN ASK — without this, the question dies in silence", async () => {
  // ⚠️ The single most load-bearing test of the redesign.
  //
  // The evening fact and the evening question go out under the SAME purpose
  // (`keel_daily_pulse` is in `GUARANTEED_PURPOSES`; a fresh purpose would be
  // silently capped). If the ledger could not tell them apart, every recap
  // would read as a question asked: `daysSinceLastAsk` would sit at 0 forever
  // and the question would NEVER be asked again — while the job kept reporting
  // one delivery per student per day. A product that stopped measuring, with a
  // green report.
  const db = cadenceDb({
    asks: [
      { local_date: "2026-08-08", asked: false }, // recap only
      { local_date: "2026-08-09", asked: false }, // recap only
      { local_date: "2026-08-07", asked: true }, // the last real question
    ],
    checkins: [],
  });
  const state = await loadAskCadence(db, CADENCE_ARGS);
  assertEquals(state.daysSinceLastAsk, 3, "counted from the ASK, not the recap");
});

Deno.test("a legacy row with no flag counts as an ask: history is not restarted", async () => {
  // Every row written before this batch WAS a question — the evening message
  // was nothing else. Reading a missing flag as "not an ask" would reset the
  // cadence for the entire base on the first tick after deploy.
  const db = cadenceDb({
    asks: [{ local_date: "2026-08-09", asked: undefined }],
    checkins: [],
  });
  assertEquals((await loadAskCadence(db, CADENCE_ARGS)).daysSinceLastAsk, 1);
});

Deno.test("never asked reads as never, and the last answer still comes through", async () => {
  const db = cadenceDb({
    asks: [],
    checkins: [{ local_date: "2026-08-05", overall: "hard" }],
  });
  const state = await loadAskCadence(db, CADENCE_ARGS);
  assertEquals(state.daysSinceLastAsk, null);
  assertEquals(state.lastAnsweredLevel, "hard");
  assertEquals(state.unansweredStreak, 0);
});

Deno.test("the unanswered streak counts asks AFTER the last answer", async () => {
  const db = cadenceDb({
    asks: [
      { local_date: "2026-08-04", asked: true },
      { local_date: "2026-08-07", asked: true },
      { local_date: "2026-08-10", asked: true },
    ],
    checkins: [{ local_date: "2026-08-04", overall: "good" }],
  });
  const state = await loadAskCadence(db, CADENCE_ARGS);
  assertEquals(state.unansweredStreak, 2, "08-07 and 08-10, not 08-04");
  assertEquals(state.lastAnsweredLevel, "good");
  assertEquals(state.daysSinceLastAsk, 0);
});

Deno.test("a student who NEVER answered reaches the back-off too", async () => {
  // Otherwise we would question a permanently silent student every three days,
  // forever — the exact harassment the cadence exists to end.
  const db = cadenceDb({
    asks: [
      { local_date: "2026-08-01", asked: true },
      { local_date: "2026-08-04", asked: true },
      { local_date: "2026-08-07", asked: true },
    ],
    checkins: [],
  });
  assertEquals((await loadAskCadence(db, CADENCE_ARGS)).unansweredStreak, 3);
});

Deno.test("a question dated in the FUTURE is ignored, not counted", async () => {
  // Replays with a simulated clock write days ahead of the student's real life.
  // Counting them would make `daysSinceLastAsk` negative and freeze the cadence
  // for the whole window.
  const db = cadenceDb({
    asks: [
      { local_date: "2026-08-12", asked: true },
      { local_date: "2026-08-08", asked: true },
    ],
    checkins: [],
  });
  assertEquals((await loadAskCadence(db, CADENCE_ARGS)).daysSinceLastAsk, 2);
});

Deno.test("an unreadable history ASKS rather than goes quiet", async () => {
  // The fallback leans the opposite way from `loadDayFacts`, on purpose: losing
  // one evening's FACT costs a sentence, losing the MEASURE indefinitely costs
  // the product. Each fallback leans towards what cannot be recovered.
  const broken = {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            gte: () => ({
              then: (r: (v: unknown) => unknown) =>
                r({ data: null, error: { message: "boom" } }),
            }),
          }),
        }),
      }),
    }),
  };
  const state = await loadAskCadence(broken, CADENCE_ARGS);
  assertEquals(state.daysSinceLastAsk, null, "null means 'never asked' means 'ask'");
});
