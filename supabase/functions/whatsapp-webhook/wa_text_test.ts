import { assertEquals } from "jsr:@std/assert@1";

import { extractAfterDonePhrase, isDonePhrase } from "./wa_text.ts";

Deno.test("wa_text: recognizes common plan finalization confirmations", () => {
  assertEquals(isDonePhrase("C’est fait"), true);
  assertEquals(isDonePhrase("c'est fait"), true);
  assertEquals(isDonePhrase("cest fait"), true);
  assertEquals(isDonePhrase("fait"), true);
  assertEquals(isDonePhrase("pas encore"), false);
});

Deno.test("wa_text: extracts text after c'est fait confirmation", () => {
  assertEquals(extractAfterDonePhrase("C’est fait, merci"), "merci");
});
