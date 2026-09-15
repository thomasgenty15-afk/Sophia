import { assertEquals } from "jsr:@std/assert@1";

import {
  birthdayGreetingEventContext,
  birthdayGreetingScheduledFor,
  birthdayMatchesLocalDate,
  buildBirthdayGreetingMessage,
  isBirthdayGreetingEventContext,
} from "./birthday_checkins.ts";

Deno.test("birthdayMatchesLocalDate matches birth month/day in user timezone", () => {
  const result = birthdayMatchesLocalDate({
    birthDate: "1998-07-02",
    timezone: "Europe/Paris",
    now: new Date("2026-07-01T22:30:00.000Z"),
  });

  assertEquals(result, {
    matches: true,
    localDate: "2026-07-02",
    birthMonthDay: "07-02",
  });
});

Deno.test("birthdayMatchesLocalDate does not match adjacent local date", () => {
  const result = birthdayMatchesLocalDate({
    birthDate: "1998-07-02",
    timezone: "America/New_York",
    now: new Date("2026-07-02T03:30:00.000Z"),
  });

  assertEquals(result, {
    matches: false,
    localDate: "2026-07-01",
    birthMonthDay: "07-02",
  });
});

Deno.test("birthdayGreetingScheduledFor keeps target local time", () => {
  assertEquals(
    birthdayGreetingScheduledFor({
      timezone: "Europe/Paris",
      localTimeHHMM: "09:30",
      now: new Date("2026-07-02T05:00:00.000Z"),
    }),
    "2026-07-02T07:30:00.000Z",
  );
});

Deno.test("birthdayGreetingEventContext is date-scoped", () => {
  const eventContext = birthdayGreetingEventContext("2026-07-02");

  assertEquals(eventContext, "birthday_greeting_v1:2026-07-02");
  assertEquals(isBirthdayGreetingEventContext(eventContext), true);
  assertEquals(isBirthdayGreetingEventContext("action_morning_v2"), false);
});

Deno.test("buildBirthdayGreetingMessage can include first name", () => {
  assertEquals(
    buildBirthdayGreetingMessage({ fullName: "Rose Martin" }),
    "Joyeux anniversaire Rose !\n\nJe pense à toi aujourd'hui. Je te souhaite une journée douce, vivante, et vraiment à toi.",
  );
});
