import { assertEquals } from "jsr:@std/assert@1";

import {
  isWhatsAppPreferenceOnboardingDoneFromTempMemory,
  shouldResumePlanFinalizationForWhatsAppPreferences,
} from "./handlers_onboarding.ts";

Deno.test("handlers_onboarding: WhatsApp preference completion marker is explicit", () => {
  assertEquals(isWhatsAppPreferenceOnboardingDoneFromTempMemory(null), false);
  assertEquals(isWhatsAppPreferenceOnboardingDoneFromTempMemory({}), false);
  assertEquals(
    isWhatsAppPreferenceOnboardingDoneFromTempMemory({
      __whatsapp_onboarding_done: {},
    }),
    false,
  );
  assertEquals(
    isWhatsAppPreferenceOnboardingDoneFromTempMemory({
      __whatsapp_onboarding_done: {
        completed_at: "2026-06-06T16:30:00.000Z",
        source: "whatsapp_topic_choice_received",
      },
    }),
    true,
  );
});

Deno.test("handlers_onboarding: plan finalization state resumes preference onboarding after web onboarding", () => {
  assertEquals(
    shouldResumePlanFinalizationForWhatsAppPreferences({
      whatsappState: "awaiting_plan_finalization",
      onboardingCompleted: true,
      whatsappPreferenceOnboardingDone: false,
    }),
    true,
  );
  assertEquals(
    shouldResumePlanFinalizationForWhatsAppPreferences({
      whatsappState: "awaiting_plan_finalization_support",
      onboardingCompleted: true,
      whatsappPreferenceOnboardingDone: false,
    }),
    true,
  );
  assertEquals(
    shouldResumePlanFinalizationForWhatsAppPreferences({
      whatsappState: "awaiting_plan_finalization",
      onboardingCompleted: true,
      whatsappPreferenceOnboardingDone: true,
    }),
    false,
  );
  assertEquals(
    shouldResumePlanFinalizationForWhatsAppPreferences({
      whatsappState: "onboarding_q1",
      onboardingCompleted: true,
      whatsappPreferenceOnboardingDone: false,
    }),
    false,
  );
});
