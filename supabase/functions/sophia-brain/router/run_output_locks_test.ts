// PIVOT NUTRITION §3.3 — the output belt, tested AT THE RUNTIME SEAM.
//
// Why this file exists separately from keel_output_locks_test.ts: that one
// proves the belt WORKS. This one proves the belt is actually REACHED by the
// function every visible message passes through. The defect being fixed was
// never a broken validator — it was a correct validator wired into one skill
// out of N, while the contract stated the guarantee globally. A module test
// alone would not have caught that, and would not catch its return.

import { assert, assertEquals } from "jsr:@std/assert@1";

import {
  finalVisibleText,
  type KeelTurnContext,
  withKeelDoctrineBlock,
} from "./run.ts";
import {
  DOCTRINE_BLOCK_FALLBACK_EN,
  MEDICAL_BLOCK_FALLBACK_EN,
} from "../skills/_shared/keel_output_locks.ts";
import { FALLBACK_PRUDENCE_BLOCK } from "../../_shared/keel/doctrine_loader.ts";
import { compileDoctrineBlock } from "../../_shared/keel/doctrine.ts";

function keel(over: Partial<KeelTurnContext> = {}): KeelTurnContext {
  return {
    role: "student",
    is_student: true,
    country: "FR",
    content_locale: "fr-FR",
    local_date: "2026-08-03",
    plan_context: null,
    plan_version_id: null,
    plan_block: null,
    plan_context_reason_code: "keel_student_plan_context",
    restriction: null,
    restriction_unavailable_reason: null,
    safety_constraints: [
      {
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
      },
    ],
    safety_constraints_unavailable_reason: null,
    doctrine: null,
    ...over,
  };
}

const DOCTRINE_CTX = keel({
  safety_constraints: [],
  doctrine: {
    doctrine: {
      coachId: "coach-1",
      version: 1,
      coachDisplayName: "Marc",
      beliefs: [],
      forbidden: [
        { token: "six_small_meals", surfaceForms: ["6 petits repas"], reason: null },
      ],
      vocabulary: [],
      arbitrations: [],
      voice: {},
      contentLocale: "fr-FR",
    },
    compiled: null,
    coachId: "coach-1",
    reason: "loaded",
    issues: [],
  },
});

Deno.test("the medical lock is reached on the GENERAL reply path", () => {
  // Before this wiring, only skills/plan_question ran this check. Any other
  // route — normal reply, meal photo ack, proactive — delivered untouched.
  const out = finalVisibleText(
    "Add a spoon of peanut butter to your oats.",
    null,
    null,
    "what should I eat",
    [],
    keel(),
  );
  assertEquals(out, MEDICAL_BLOCK_FALLBACK_EN);
});

Deno.test("the doctrine lock is reached on the GENERAL reply path", () => {
  const out = finalVisibleText(
    "Essaie 6 petits repas dans la journée.",
    null,
    null,
    "j'ai faim tout le temps",
    [],
    DOCTRINE_CTX,
  );
  assertEquals(out, DOCTRINE_BLOCK_FALLBACK_EN);
});

Deno.test("the belt runs on a SAFETY route too", () => {
  // A crisis turn is the last place to suggest a medical allergen, so the belt
  // sits OUTSIDE the `if (!isSafetyRoute(...))` block that skips the cosmetic
  // guards.
  const out = finalVisibleText(
    "Have some peanut butter, it will help.",
    { response_owner: "safety_crisis" } as never,
    null,
    "je vais mal",
    [],
    keel(),
  );
  assertEquals(out, MEDICAL_BLOCK_FALLBACK_EN);
});

Deno.test("a legitimate message is untouched by the belt", () => {
  const out = finalVisibleText(
    "Nice plate - that is what your coach asks for this week.",
    null,
    null,
    "voilà mon dej",
    [],
    keel(),
  );
  assert(out.includes("Nice plate"));
});

Deno.test("a non-KEEL turn is not touched at all", () => {
  const out = finalVisibleText(
    "Add a spoon of peanut butter to your oats.",
    null,
    null,
    "hello",
    [],
    keel({ is_student: false, role: null, safety_constraints: null }),
  );
  assert(out.includes("peanut butter"));
});

// ---------------------------------------------------------------------------
// THE OTHER HALF OF THE DOUBLE LOCK: the doctrine must actually reach the
// composer. Without it the belt is a bouncer in front of an empty room -- it
// stops the agent contradicting the coach, it does not make it speak like him.
// ---------------------------------------------------------------------------

Deno.test("the doctrine block is injected AT THE HEAD of the composer context", () => {
  const doctrine = DOCTRINE_CTX.doctrine!.doctrine!;
  const compiled = compileDoctrineBlock(doctrine);
  const ctx = withKeelDoctrineBlock("=== PLAN ===\nweek 2", {
    ...DOCTRINE_CTX,
    doctrine: { ...DOCTRINE_CTX.doctrine!, compiled },
  });
  assert(ctx.includes("six_small_meals"));
  // AT THE HEAD: the prompt budget truncates by the TAIL, so a doctrine
  // appended at the end vanishes silently on exactly the richest turns.
  assert(
    ctx.indexOf("MARC'S METHOD") < ctx.indexOf("=== PLAN ==="),
    "the doctrine must precede the plan, or truncation eats it first",
  );
});

Deno.test("no doctrine loaded -> the PRUDENCE block, never an empty layer", () => {
  // An empty layer gets filled by the model's general nutrition culture, which
  // is precisely the voice this product does not sell.
  const ctx = withKeelDoctrineBlock("=== PLAN ===", {
    ...DOCTRINE_CTX,
    doctrine: {
      doctrine: null,
      compiled: null,
      coachId: null,
      reason: "no_published_doctrine",
      issues: [],
    },
  });
  assert(ctx.includes(FALLBACK_PRUDENCE_BLOCK));
  assert(ctx.includes("Do NOT give prescriptive nutrition advice"));
});

Deno.test("a non-KEEL turn keeps its context byte-for-byte", () => {
  const ctx = "=== LEGACY FR CONTEXT ===";
  assertEquals(
    withKeelDoctrineBlock(ctx, keel({ is_student: false, role: null })),
    ctx,
  );
});
