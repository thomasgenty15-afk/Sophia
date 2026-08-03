// PIVOT NUTRITION — keel_output_locks.ts.
//
// The test that carries the finding this module exists for:
//   * "the medical guarantee applies to EVERY visible text, not one skill"
//     -- CONTRACT states it globally; before this belt it lived in
//        plan_question/renderer.ts alone.
//
// And the one that keeps it shippable:
//   * "a coeliac plan made of gluten-free items is not rejected every turn"
//     -- a belt that rejects legitimate turns gets switched off.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  applyKeelOutputLocks,
  DOCTRINE_BLOCK_FALLBACK_EN,
  MEDICAL_BLOCK_FALLBACK_EN,
} from "./keel_output_locks.ts";
import type { StudentSafetyConstraint } from "../../../_shared/keel/safety_constraints.ts";

function constraint(
  patch: Partial<StudentSafetyConstraint> = {},
): StudentSafetyConstraint {
  return {
    id: "c1",
    userId: "u1",
    kind: "allergy",
    allergenRef: "peanut",
    substanceRef: null,
    medicationClass: null,
    severity: "medical",
    declaredBy: "student",
    notes: null,
    contentLocale: "en",
    ...patch,
  };
}

const DOCTRINE = {
  forbidden: [
    {
      token: "six_small_meals",
      surfaceForms: ["6 petits repas", "six small meals"],
      reason: "it breaks the fasting window",
    },
  ],
};

function run(text: string, over: Record<string, unknown> = {}) {
  return applyKeelOutputLocks({
    text,
    isKeelStudent: true,
    safetyConstraints: [constraint()],
    doctrine: DOCTRINE,
    ...over,
  });
}

// ---------------------------------------------------------------------------
// THE FINDING
// ---------------------------------------------------------------------------

Deno.test("the medical guarantee applies to EVERY visible text, not one skill", () => {
  const result = run("Add a spoon of peanut butter to your morning oats.");
  assertEquals(result.reason, "blocked_medical_constraint");
  assertEquals(result.text, MEDICAL_BLOCK_FALLBACK_EN);
  assertEquals(result.tokens, ["peanut"]);
});

Deno.test("the whole message is replaced, never trimmed of one sentence", () => {
  // A text amputated of its dangerous sentence is still a text that was
  // talking about peanuts to an anaphylactic student, and the surviving
  // context can carry the suggestion on its own.
  const result = run(
    "Great week! Add a spoon of peanut butter to your oats - it is a good protein source and you need more of those.",
  );
  assertEquals(result.text, MEDICAL_BLOCK_FALLBACK_EN);
  assert(!result.text.includes("protein source"));
});

Deno.test("the fallback does NOT name the allergen back to the student", () => {
  // Naming it makes the incident visible and anxiogenic for zero benefit.
  const result = run("Have some peanut butter.");
  assert(!/peanut/i.test(result.text));
});

// ---------------------------------------------------------------------------
// The doctrine lock, and the precedence between the two
// ---------------------------------------------------------------------------

Deno.test("an endorsed coach interdit is replaced by a deferral to the coach", () => {
  const result = run("Try 6 petits repas spread through the day.");
  assertEquals(result.reason, "blocked_coach_interdit");
  assertEquals(result.text, DOCTRINE_BLOCK_FALLBACK_EN);
  assertEquals(result.tokens, ["six_small_meals"]);
});

Deno.test("medical outranks doctrine when a text violates both", () => {
  // The most protective fallback must win, always.
  const result = run("Have peanut butter across 6 petits repas.");
  assertEquals(result.reason, "blocked_medical_constraint");
  assertEquals(result.text, MEDICAL_BLOCK_FALLBACK_EN);
});

// ---------------------------------------------------------------------------
// DISARM CONDITIONS — the half that keeps the belt alive
// ---------------------------------------------------------------------------

Deno.test("a coeliac plan made of gluten-free items is not rejected every turn", () => {
  // SCHEMA.md acceptance fixture 3. Negated mentions pass, via the shared
  // matcher. Without this the belt rejects every legitimate turn and gets
  // switched off within a week.
  const glutenFree = applyKeelOutputLocks({
    text: "Your breakfast is gluten-free oats with berries. Avoid any gluten today.",
    isKeelStudent: true,
    safetyConstraints: [constraint({ allergenRef: "gluten" })],
    doctrine: null,
  });
  assertEquals(glutenFree.reason, "clean");
});

Deno.test("the agent may still EXPLAIN what the coach forbids", () => {
  const result = run("Marc ne fait pas de 6 petits repas, il tient la fenêtre.");
  assertEquals(result.reason, "clean");
});

Deno.test("disarmed outside a KEEL student turn", () => {
  const result = run("Add a spoon of peanut butter.", { isKeelStudent: false });
  assertEquals(result.reason, "disarmed_not_keel_student");
  assert(result.text.includes("peanut butter"));
});

Deno.test("disarmed with no constraints and no doctrine", () => {
  const result = run("Anything at all.", {
    safetyConstraints: [],
    doctrine: null,
  });
  assertEquals(result.reason, "disarmed_no_constraints");
});

Deno.test("disarmed on empty text", () => {
  assertEquals(applyKeelOutputLocks({ text: "  ", isKeelStudent: true }).reason, "disarmed_empty_text");
});

Deno.test("a non-medical severity does not block", () => {
  // Only severity='medical' rejects. A 'preference' dislike must not silence
  // the agent.
  const result = run("Some peanut butter?", {
    safetyConstraints: [constraint({ severity: "preference" })],
    doctrine: null,
  });
  assertEquals(result.reason, "clean");
});

Deno.test("a clean message passes through byte-for-byte", () => {
  const text = "Nice plate - that is exactly what Marc asks for this week.";
  const result = run(text);
  assertEquals(result.reason, "clean");
  assertEquals(result.text, text);
});
