import { assertEquals } from "jsr:@std/assert@1";

import {
  buildPlanActivatedConfirmationPayload,
  isFirstPlanActivation,
  planActivatedConfirmationText,
  planActivatedFirstName,
} from "./index.ts";

// Scenario: "Laurène" finalizes her plan on the website. The draft plan flips
// draft -> active and a static (no-AI) WhatsApp confirmation must go out.

Deno.test("planActivatedFirstName keeps only the first token", () => {
  assertEquals(planActivatedFirstName("Laurène Dupont"), "Laurène");
  assertEquals(planActivatedFirstName("  Laurène   Marie  "), "Laurène");
  assertEquals(planActivatedFirstName("Laurène"), "Laurène");
  assertEquals(planActivatedFirstName(null), "");
  assertEquals(planActivatedFirstName("   "), "");
});

Deno.test("planActivatedConfirmationText uses the founder-approved copy", () => {
  assertEquals(
    planActivatedConfirmationText("Laurène"),
    "Ça y est Laurène, ton plan est validé et lancé ! 🎉",
  );
  // No first name known: drop the orphan comma.
  assertEquals(
    planActivatedConfirmationText(""),
    "Ça y est, ton plan est validé et lancé ! 🎉",
  );
});

Deno.test("isFirstPlanActivation only fires on draft/generated -> active", () => {
  assertEquals(isFirstPlanActivation("draft"), true);
  assertEquals(isFirstPlanActivation("generated"), true);
  // Re-activation / adjustment: already active or paused -> no re-send.
  assertEquals(isFirstPlanActivation("active"), false);
  assertEquals(isFirstPlanActivation("paused"), false);
});

// (a) An opted-in user whose plan flips draft -> active gets a payload whose
// purpose is "plan_activated" and whose body contains the validated phrase.
Deno.test("buildPlanActivatedConfirmationPayload builds the confirmation on first activation", () => {
  const payload = buildPlanActivatedConfirmationPayload({
    previousStatus: "draft",
    userId: "user-laurene",
    fullName: "Laurène Dupont",
    planId: "plan-1",
  });

  assertEquals(payload !== null, true);
  assertEquals(payload!.purpose, "plan_activated");
  assertEquals(payload!.message.type, "text");
  assertEquals(
    payload!.message.body.includes("ton plan est validé et lancé"),
    true,
  );
  assertEquals(
    payload!.message.body,
    "Ça y est Laurène, ton plan est validé et lancé ! 🎉",
  );
  // (c) require_opted_in:true => whatsapp-send drops a non-opted-in user.
  assertEquals(payload!.require_opted_in, true);
  assertEquals(payload!.metadata_extra.plan_id, "plan-1");
  assertEquals(payload!.metadata_extra.kind, "plan_activated_confirmation");
});

Deno.test("buildPlanActivatedConfirmationPayload falls back to comma-free copy without a name", () => {
  const payload = buildPlanActivatedConfirmationPayload({
    previousStatus: "generated",
    userId: "user-anon",
    fullName: null,
    planId: "plan-2",
  });

  assertEquals(payload !== null, true);
  assertEquals(
    payload!.message.body,
    "Ça y est, ton plan est validé et lancé ! 🎉",
  );
});

// (b) Idempotence: a second activation while the plan is already "active" (or
// "paused") returns no payload => no second message.
Deno.test("buildPlanActivatedConfirmationPayload is idempotent on re-activation", () => {
  assertEquals(
    buildPlanActivatedConfirmationPayload({
      previousStatus: "active",
      userId: "user-laurene",
      fullName: "Laurène Dupont",
      planId: "plan-1",
    }),
    null,
  );
  assertEquals(
    buildPlanActivatedConfirmationPayload({
      previousStatus: "paused",
      userId: "user-laurene",
      fullName: "Laurène Dupont",
      planId: "plan-1",
    }),
    null,
  );
});
