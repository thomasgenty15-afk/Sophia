import { assertEquals, assertMatch } from "jsr:@std/assert@1";

import {
  allowRelaunchGreetingFromLastMessage,
  applyScheduledCheckinGreetingPolicy,
  applyWhatsappProactiveOpeningPolicy,
  computeScheduledForFromLocal,
} from "./scheduled_checkins.ts";

Deno.test("applyWhatsappProactiveOpeningPolicy strips leading acknowledgement starters", () => {
  const text = applyWhatsappProactiveOpeningPolicy({
    text: "Ça marche, on fait le point sur ta journée ?",
    allowRelaunchGreeting: false,
    fallback: "Comment ça s'est passé aujourd'hui ?",
  });

  assertEquals(text, "On fait le point sur ta journée ?");
});

Deno.test("applyWhatsappProactiveOpeningPolicy strips greeting plus acknowledgement starters", () => {
  const text = applyWhatsappProactiveOpeningPolicy({
    text: "Salut ! Ça marche, comment ça s'est passé aujourd'hui ?",
    allowRelaunchGreeting: false,
    fallback: "Comment ça s'est passé aujourd'hui ?",
  });

  assertEquals(text, "Comment ça s'est passé aujourd'hui ?");
});

Deno.test("applyScheduledCheckinGreetingPolicy keeps allowed relaunch greeting but removes stray acknowledgement", () => {
  const text = applyScheduledCheckinGreetingPolicy({
    text: "Ok, tu me racontes comment ça s'est passé ?",
    allowRelaunchGreeting: true,
  });

  assertMatch(
    text,
    /^(Hello!|Salut !|Hey !|Coucou !) Tu me racontes comment ça s'est passé \?$/,
  );
});

Deno.test("allowRelaunchGreetingFromLastMessage allows salutation after 6 hours", () => {
  const sevenHoursAgo = new Date(Date.now() - 7 * 60 * 60 * 1000)
    .toISOString();

  assertEquals(
    allowRelaunchGreetingFromLastMessage({
      lastInboundAt: sevenHoursAgo,
      thresholdHours: 6,
    }),
    true,
  );
});

Deno.test("allowRelaunchGreetingFromLastMessage skips salutation under 6 hours", () => {
  const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000)
    .toISOString();

  assertEquals(
    allowRelaunchGreetingFromLastMessage({
      lastOutboundAt: fiveHoursAgo,
      thresholdHours: 6,
    }),
    false,
  );
});

Deno.test("applyScheduledCheckinGreetingPolicy omits greeting when relaunch is not allowed", () => {
  const text = applyScheduledCheckinGreetingPolicy({
    text: "Salut ! Petit check-in: on garde juste l'action du jour en vue.",
    allowRelaunchGreeting: false,
  });

  assertEquals(text, "On garde juste l'action du jour en vue.");
});

Deno.test("computeScheduledForFromLocal preserves Europe/Paris reminder times in CEST", () => {
  const now = new Date("2026-05-18T11:30:00.000Z");

  assertEquals(
    computeScheduledForFromLocal({
      timezone: "Europe/Paris",
      dayOffset: 1,
      localTimeHHMM: "07:25",
      now,
    }),
    "2026-05-19T05:25:00.000Z",
  );
  assertEquals(
    computeScheduledForFromLocal({
      timezone: "Europe/Paris",
      dayOffset: 2,
      localTimeHHMM: "18:00",
      now,
    }),
    "2026-05-20T16:00:00.000Z",
  );
  assertEquals(
    computeScheduledForFromLocal({
      timezone: "Europe/Paris",
      dayOffset: 2,
      localTimeHHMM: "08:10",
      now,
    }),
    "2026-05-20T06:10:00.000Z",
  );
});
