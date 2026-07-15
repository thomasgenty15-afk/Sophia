import { assertEquals } from "jsr:@std/assert@1";

import {
  decideNextOptinWinbackTouch,
  TOUCH1_DELAY_MS,
  TOUCH2_DELAY_MS,
  TOUCH3_DELAY_MS,
} from "./optin_winback.ts";

const DAY = 24 * 60 * 60 * 1000;
const ANCHOR = new Date("2026-07-01T09:00:00.000Z").getTime();

function at(days: number): number {
  return ANCHOR + days * DAY;
}

Deno.test("delays are 1 / 3 / 5 days", () => {
  assertEquals(TOUCH1_DELAY_MS, 1 * DAY);
  assertEquals(TOUCH2_DELAY_MS, 3 * DAY);
  assertEquals(TOUCH3_DELAY_MS, 5 * DAY);
});

Deno.test("opted_in always resolves, never a touch", () => {
  assertEquals(
    decideNextOptinWinbackTouch({
      anchorAt: ANCHOR,
      now: at(10),
      touch1SentAt: null,
      touch2SentAt: null,
      touch3SentAt: null,
      optedIn: true,
    }),
    "resolved",
  );
  // Even mid-sequence, opting in short-circuits to resolved.
  assertEquals(
    decideNextOptinWinbackTouch({
      anchorAt: ANCHOR,
      now: at(4),
      touch1SentAt: at(1),
      touch2SentAt: at(3),
      touch3SentAt: null,
      optedIn: true,
    }),
    "resolved",
  );
});

Deno.test("no anchor => none", () => {
  assertEquals(
    decideNextOptinWinbackTouch({
      anchorAt: null,
      now: at(10),
      touch1SentAt: null,
      touch2SentAt: null,
      touch3SentAt: null,
      optedIn: false,
    }),
    "none",
  );
});

Deno.test("touch1 due-date: not before T+1, fires at T+1", () => {
  const base = {
    anchorAt: ANCHOR,
    touch1SentAt: null,
    touch2SentAt: null,
    touch3SentAt: null,
    optedIn: false,
  };
  // A few hours in — too early.
  assertEquals(
    decideNextOptinWinbackTouch({ ...base, now: ANCHOR + 5 * 60 * 60 * 1000 }),
    "none",
  );
  // Just under 1 day.
  assertEquals(
    decideNextOptinWinbackTouch({ ...base, now: ANCHOR + DAY - 1 }),
    "none",
  );
  // Exactly 1 day.
  assertEquals(
    decideNextOptinWinbackTouch({ ...base, now: at(1) }),
    "touch1",
  );
});

Deno.test("touch2 never fires before touch1 was sent", () => {
  // 3 days elapsed but touch1 was never sent => still touch1, not touch2.
  assertEquals(
    decideNextOptinWinbackTouch({
      anchorAt: ANCHOR,
      now: at(3),
      touch1SentAt: null,
      touch2SentAt: null,
      touch3SentAt: null,
      optedIn: false,
    }),
    "touch1",
  );
  // 5 days elapsed but nothing sent => still only touch1.
  assertEquals(
    decideNextOptinWinbackTouch({
      anchorAt: ANCHOR,
      now: at(5),
      touch1SentAt: null,
      touch2SentAt: null,
      touch3SentAt: null,
      optedIn: false,
    }),
    "touch1",
  );
});

Deno.test("touch2 due-date: >= T+3 and touch1 sent", () => {
  const base = {
    anchorAt: ANCHOR,
    touch1SentAt: at(1),
    touch2SentAt: null,
    touch3SentAt: null,
    optedIn: false,
  };
  // touch1 sent but only 2 days in — wait.
  assertEquals(
    decideNextOptinWinbackTouch({ ...base, now: at(2) }),
    "none",
  );
  assertEquals(
    decideNextOptinWinbackTouch({ ...base, now: at(3) }),
    "touch2",
  );
});

Deno.test("touch3 never fires before touch2 was sent", () => {
  // 5 days elapsed, touch1 sent but touch2 not => touch2, not touch3.
  assertEquals(
    decideNextOptinWinbackTouch({
      anchorAt: ANCHOR,
      now: at(5),
      touch1SentAt: at(1),
      touch2SentAt: null,
      touch3SentAt: null,
      optedIn: false,
    }),
    "touch2",
  );
});

Deno.test("touch3 due-date: >= T+5 and touch2 sent", () => {
  const base = {
    anchorAt: ANCHOR,
    touch1SentAt: at(1),
    touch2SentAt: at(3),
    touch3SentAt: null,
    optedIn: false,
  };
  // Only 4 days in — wait.
  assertEquals(
    decideNextOptinWinbackTouch({ ...base, now: at(4) }),
    "none",
  );
  assertEquals(
    decideNextOptinWinbackTouch({ ...base, now: at(5) }),
    "touch3",
  );
});

Deno.test("idempotence: an already-sent touch is never returned again", () => {
  // touch1 already sent, 2 days in, touch2 not yet due => none (no re-touch1).
  assertEquals(
    decideNextOptinWinbackTouch({
      anchorAt: ANCHOR,
      now: at(2),
      touch1SentAt: at(1),
      touch2SentAt: null,
      touch3SentAt: null,
      optedIn: false,
    }),
    "none",
  );
  // All three sent => none, forever.
  assertEquals(
    decideNextOptinWinbackTouch({
      anchorAt: ANCHOR,
      now: at(30),
      touch1SentAt: at(1),
      touch2SentAt: at(3),
      touch3SentAt: at(5),
      optedIn: false,
    }),
    "none",
  );
});

Deno.test("at most one touch per pass: T+10 with only touch1 sent yields touch2", () => {
  // Even though both touch2 (>=3d) and touch3 (>=5d) windows are open, touch3
  // is gated on touch2 being sent, so exactly touch2 is returned.
  assertEquals(
    decideNextOptinWinbackTouch({
      anchorAt: ANCHOR,
      now: at(10),
      touch1SentAt: at(1),
      touch2SentAt: null,
      touch3SentAt: null,
      optedIn: false,
    }),
    "touch2",
  );
});

Deno.test("full happy path advances one touch at a time", () => {
  // T+1: touch1
  let state = {
    anchorAt: ANCHOR,
    touch1SentAt: null as number | null,
    touch2SentAt: null as number | null,
    touch3SentAt: null as number | null,
    optedIn: false,
  };
  assertEquals(decideNextOptinWinbackTouch({ ...state, now: at(1) }), "touch1");
  state = { ...state, touch1SentAt: at(1) };

  // T+3: touch2
  assertEquals(decideNextOptinWinbackTouch({ ...state, now: at(3) }), "touch2");
  state = { ...state, touch2SentAt: at(3) };

  // T+5: touch3
  assertEquals(decideNextOptinWinbackTouch({ ...state, now: at(5) }), "touch3");
  state = { ...state, touch3SentAt: at(5) };

  // T+6: done
  assertEquals(decideNextOptinWinbackTouch({ ...state, now: at(6) }), "none");
});
