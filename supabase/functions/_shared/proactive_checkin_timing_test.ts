import { assertEquals } from "jsr:@std/assert@1";

import {
  randomEveningReviewLocalTime,
  randomMorningEncouragementLocalTime,
} from "./proactive_checkin_timing.ts";

function minutes(value: string): number {
  const [hh, mm] = value.split(":").map(Number);
  return hh * 60 + mm;
}

Deno.test("randomMorningEncouragementLocalTime is stable and stays between 08:00 and 10:00", () => {
  const first = randomMorningEncouragementLocalTime({
    userId: "user-a",
    localDate: "2026-05-20",
  });
  const second = randomMorningEncouragementLocalTime({
    userId: "user-a",
    localDate: "2026-05-20",
  });

  assertEquals(first, second);
  const value = minutes(first);
  if (value < minutes("08:00") || value > minutes("10:00")) {
    throw new Error(`morning time out of range: ${first}`);
  }
});

Deno.test("randomMorningEncouragementLocalTime varies across users or dates", () => {
  const values = new Set([
    randomMorningEncouragementLocalTime({
      userId: "user-a",
      localDate: "2026-05-20",
    }),
    randomMorningEncouragementLocalTime({
      userId: "user-b",
      localDate: "2026-05-20",
    }),
    randomMorningEncouragementLocalTime({
      userId: "user-a",
      localDate: "2026-05-21",
    }),
  ]);

  if (values.size < 2) {
    throw new Error("expected morning encouragement time variance");
  }
});

Deno.test("randomEveningReviewLocalTime stays between 19:00 and 21:30", () => {
  const value = randomEveningReviewLocalTime({
    userId: "user-a",
    localDate: "2026-05-20",
  });
  const numeric = minutes(value);

  if (numeric < minutes("19:00") || numeric > minutes("21:30")) {
    throw new Error(`evening review time out of range: ${value}`);
  }
});
