import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";

import {
  buildOnboardingWeek1AutoValidationMessage,
  buildOnboardingWeek1ValidationPromptMessage,
  isOnboardingCompleteForWeek1Validation,
  nextAllowedAfterRecentWhatsappInteraction,
  onboardingWeek1AutoValidationScheduledFor,
} from "./onboarding_week1_validation.ts";

Deno.test("onboarding week1 validation requires completed onboarding", () => {
  assertEquals(
    isOnboardingCompleteForWeek1Validation({
      onboarding_completed: true,
      whatsapp_state: "active",
    }),
    true,
  );
  assertEquals(
    isOnboardingCompleteForWeek1Validation({
      onboarding_completed: true,
      whatsapp_state: "onboarding_preferences",
    }),
    false,
  );
  assertEquals(
    isOnboardingCompleteForWeek1Validation({
      onboarding_completed: false,
      whatsapp_state: "active",
    }),
    false,
  );
});

Deno.test("onboarding week1 validation waits after recent WhatsApp activity", () => {
  assertEquals(
    nextAllowedAfterRecentWhatsappInteraction(
      { whatsapp_last_inbound_at: "2026-06-15T10:00:00.000Z" },
      new Date("2026-06-15T10:05:00.000Z"),
    ),
    "2026-06-15T10:20:00.000Z",
  );
  assertEquals(
    nextAllowedAfterRecentWhatsappInteraction(
      { whatsapp_last_outbound_at: "2026-06-15T10:00:00.000Z" },
      new Date("2026-06-15T10:25:00.000Z"),
    ),
    null,
  );
});

Deno.test("onboarding week1 validation messages include platform location and summary", () => {
  const prompt = buildOnboardingWeek1ValidationPromptMessage();
  assertStringIncludes(prompt, "valider les actions de ta semaine");
  assertStringIncludes(prompt, "niveau 2 du plan");
  assertStringIncludes(prompt, "haut de la semaine actuelle");
  assertEquals(prompt.includes("Ton plan est pret"), false);

  const auto = buildOnboardingWeek1AutoValidationMessage({
    summaryLines: ["- Sport : lundi et mercredi"],
  });
  assertStringIncludes(auto, "pris la liberte de valider");
  assertStringIncludes(auto, "- Sport : lundi et mercredi");
  assertStringIncludes(auto, "modifier dans ton espace");
});

Deno.test("onboarding week1 auto validation is scheduled at next 07:00 local", () => {
  assertEquals(
    onboardingWeek1AutoValidationScheduledFor({
      timezone: "Europe/Paris",
      promptSentAt: new Date("2026-06-15T12:00:00.000Z"),
    }),
    "2026-06-16T05:00:00.000Z",
  );
});
