/**
 * KEEL W4.4 — the dispatcher prompt branch.
 *
 * One projection per turn. Shipping the KEEL plan AND the legacy
 * `user_plan_items` snapshot in the same payload would let the model pick
 * whichever suits its answer, and the legacy snapshot carries the `current_reps`
 * counter KEEL removed — so the branch is asserted here, not assumed.
 */

import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { buildDispatcherPrompt } from "./dispatcher.prompts.ts";
import { DISPATCHER_V2_SYSTEM_PROMPT } from "./dispatcher.prompts.ts";
import { FOOD_GROUP_REFS } from "../../_shared/keel/tokens.ts";

const legacySnapshot = {
  plan_items: [{ id: "item-1", title: "Marche 20 min", status: "active" }],
};

function payload(keelBlock: string | null) {
  return JSON.parse(buildDispatcherPrompt({
    user_message: "je peux remplacer le riz par des pates ?",
    recent_messages: [],
    plan_snapshot: legacySnapshot,
    keel_plan_context: keelBlock,
  }));
}

Deno.test("KEEL branch: the student payload carries the KEEL plan and NOTHING legacy", () => {
  const parsed = payload("=== KEEL PLAN (SOURCE: plan_commitments) ===\n- Berries");
  assertStringIncludes(parsed.keel_plan_context, "=== KEEL PLAN");
  assertEquals(parsed.plan_snapshot, null);
  assertEquals(parsed.active_action_candidates_for_direct_effects, []);
  // The plan_question signal only exists where the plan does.
  assertEquals(
    typeof parsed.expected_shape.skill_signals.plan_question,
    "object",
  );
});

Deno.test("legacy branch: the payload is unchanged and exposes no plan_question shape", () => {
  const parsed = payload(null);
  assertEquals(parsed.keel_plan_context, null);
  assertEquals(parsed.plan_snapshot, legacySnapshot);
  // No lane advertised to a user who has no commitments to resolve against.
  assertEquals(parsed.expected_shape.skill_signals.plan_question, undefined);
});

Deno.test("the prompt interpolates the closed food_groups list from tokens.ts", () => {
  // Vague-0 correction: the model invented `epa_dha` when the vocabulary lived
  // only in the migration. One source, interpolated, or the two drift.
  for (const slug of ["berries", "whole_grain", "fatty_fish", "nuts_seeds"]) {
    assertStringIncludes(DISPATCHER_V2_SYSTEM_PROMPT, slug);
  }
  assertEquals(FOOD_GROUP_REFS.length > 0, true);
  // And it says what to do when nothing matches: null, never the nearest slug.
  assertStringIncludes(DISPATCHER_V2_SYSTEM_PROMPT, "mets null");
});
