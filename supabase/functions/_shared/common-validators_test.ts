import { assertEquals, assertThrows } from "std/testing/asserts.ts";
import { validateDispatcher, validateMiniAction } from "./common-validators.ts";

Deno.test("validateDispatcher: accepte un dispatch valide", () => {
  const parsed = validateDispatcher({ targetMode: "architect", riskScore: 3 });
  assertEquals(parsed.targetMode, "architect");
  assertEquals(parsed.riskScore, 3);
});

Deno.test("validateDispatcher: rejette un riskScore hors bornes", () => {
  assertThrows(() => validateDispatcher({ targetMode: "architect", riskScore: 999 }));
  assertThrows(() => validateDispatcher({ targetMode: "architect", riskScore: -1 }));
});

Deno.test("validateMiniAction: accepte une mini-action valide", () => {
  const parsed = validateMiniAction({
    title: "Respiration 5 min",
    description: "Cohérence cardiaque 5 minutes.",
    type: "habitude",
    tracking_type: "boolean",
    time_of_day: "morning",
    targetReps: 7,
    tips: "Mettre un rappel après le café.",
  });

  assertEquals(parsed.type, "habitude");
  assertEquals(parsed.time_of_day, "morning");
});


