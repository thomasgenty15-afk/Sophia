import { assertEquals, assertMatch } from "jsr:@std/assert@1";

import {
  applyScheduledCheckinGreetingPolicy,
  applyWhatsappProactiveOpeningPolicy,
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

  assertMatch(text, /^(Hello!|Salut !|Hey !|Coucou !) Tu me racontes comment ça s'est passé \?$/);
});
