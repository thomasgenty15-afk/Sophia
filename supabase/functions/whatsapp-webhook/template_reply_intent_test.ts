import { assertEquals } from "jsr:@std/assert@1";

import {
  isCheckinLaterFallbackText,
  isNaturalOptInAgreementText,
} from "./template_reply_intent.ts";

Deno.test("natural opt-in agreement accepts isolated conversational agreements", () => {
  for (
    const text of [
      "oui carrément",
      "ok c'est parti",
      "oui c'est bien moi !",
      "yes",
      "carrément",
      "absolument",
      "c'est moi",
      "ouais",
      "c’est bien moi !",
    ]
  ) {
    assertEquals(isNaturalOptInAgreementText(text), true, text);
  }
});

Deno.test("natural opt-in agreement rejects ambiguous or unsafe messages", () => {
  for (
    const text of [
      "stop",
      "stop pour ce soir",
      "t'as pas fait un mauvais numéro ?",
      "ok mais pas maintenant",
      "oui mais pas maintenant",
      "je dis oui à ton autre question",
    ]
  ) {
    assertEquals(isNaturalOptInAgreementText(text), false, text);
  }
});

Deno.test("check-in later fallback covers weekly and free-form reminder refusals", () => {
  for (
    const text of [
      "La semaine prochaine!",
      "à la semaine prochaine",
      "on voit ça la semaine prochaine",
      "pas ce soir je suis crevé",
      "pas aujourd'hui merci",
    ]
  ) {
    assertEquals(isCheckinLaterFallbackText(text), true, text);
  }
  assertEquals(isCheckinLaterFallbackText("oui carrément"), false);
});
