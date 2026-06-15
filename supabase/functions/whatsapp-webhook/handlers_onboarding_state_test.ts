import { assertEquals } from "jsr:@std/assert@1";

import {
  isWhatsAppOnboardingExpired,
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

Deno.test("handlers_onboarding: WhatsApp onboarding expires after 12h from start", () => {
  const nowMs = new Date("2026-06-15T12:00:00.000Z").getTime();
  assertEquals(
    isWhatsAppOnboardingExpired({
      whatsappState: "onboarding_pref_tone",
      startedAt: "2026-06-14T23:59:59.000Z",
      nowMs,
    }),
    true,
  );
  assertEquals(
    isWhatsAppOnboardingExpired({
      whatsappState: "onboarding_pref_tone",
      startedAt: "2026-06-15T00:00:01.000Z",
      nowMs,
    }),
    false,
  );
  assertEquals(
    isWhatsAppOnboardingExpired({
      whatsappState: "active",
      startedAt: "2026-06-14T23:00:00.000Z",
      nowMs,
    }),
    false,
  );
});

Deno.test("handlers_onboarding: expiration falls back to whatsapp_state_updated_at for legacy rows", () => {
  const nowMs = new Date("2026-06-15T12:00:00.000Z").getTime();
  assertEquals(
    isWhatsAppOnboardingExpired({
      whatsappState: "awaiting_plan_finalization",
      startedAt: null,
      stateUpdatedAt: "2026-06-14T23:30:00.000Z",
      nowMs,
    }),
    true,
  );
});
