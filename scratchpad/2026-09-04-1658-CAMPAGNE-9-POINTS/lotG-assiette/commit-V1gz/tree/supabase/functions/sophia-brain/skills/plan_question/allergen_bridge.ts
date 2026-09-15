/**
 * KEEL W4.4 — the narrow allergen -> food_group bridge.
 *
 * WHY THIS IS NOT AN ONTOLOGY
 * CONTRACT refuses a nutrient ontology and an interaction engine, and keeps a
 * "narrow watchlist only". This file is the same shape of object for allergens:
 * a flat, closed, hand-written map, not an inference. It answers exactly one
 * question — "does substituting into `food_group X` structurally put the
 * declared allergen on the plate?" — and it answers it only for the slugs it
 * lists.
 *
 * WHY IT IS NEEDED AT ALL
 * `student_safety_constraints.allergen_ref` is a free ASCII slug; `food_groups`
 * is a closed 30-slug vocabulary; the two namespaces do not coincide. Without a
 * bridge, a coeliac's `gluten` constraint never matches a `whole_grain` ->
 * `refined_grain` swap, and Tier 0 approves the exact substitution acceptance
 * fixture 3 exists to forbid. With a naive bridge, `gluten` would be inferred
 * from "grain-ish" and Tier 0 would start guessing on a medical question.
 *
 * THE THIRD STATE IS THE POINT
 * A medical constraint that is neither a `food_groups` slug nor a key of this
 * map is UNRESOLVABLE — not "absent". `unresolvableMedicalConstraints` names
 * them, and `swap_resolver.ts` refuses Tier 0 auto-approval whenever the list
 * is non-empty. Escalating a legitimate banana-for-berries swap is a cheap
 * mistake; approving a substitution against an allergy this code could not read
 * is not. Every new entry here is a coach-visible product decision, never an
 * inference.
 */

import {
  FOOD_GROUP_REFS,
  type FoodGroupRef,
} from "../../../_shared/keel/tokens.ts";
import type { StudentSafetyConstraint } from "../../../_shared/keel/safety_constraints.ts";

const FOOD_GROUP_SET: ReadonlySet<string> = new Set(FOOD_GROUP_REFS);

/**
 * Narrow seed. Keys are the allergen/intolerance slugs actually seen in
 * intake; values are the `food_groups` slugs that structurally contain them.
 *
 * Conservative on purpose: `nuts_seeds` is one group, so a peanut allergy
 * blocks every seed swap. Over-blocking escalates to the coach; under-blocking
 * feeds an allergen. Only the first is recoverable.
 */
export const ALLERGEN_FOOD_GROUPS: Readonly<
  Record<string, readonly FoodGroupRef[]>
> = {
  gluten: ["whole_grain", "refined_grain"],
  wheat: ["whole_grain", "refined_grain"],
  lactose: ["dairy_yogurt", "dairy_cheese"],
  dairy: ["dairy_yogurt", "dairy_cheese"],
  milk: ["dairy_yogurt", "dairy_cheese"],
  casein: ["dairy_yogurt", "dairy_cheese"],
  egg: ["eggs"],
  eggs: ["eggs"],
  fish: ["fatty_fish", "white_fish"],
  shellfish: ["shellfish"],
  crustacean: ["shellfish"],
  mollusc: ["shellfish"],
  peanut: ["nuts_seeds"],
  tree_nut: ["nuts_seeds"],
  nuts: ["nuts_seeds"],
  sesame: ["nuts_seeds"],
  soy: ["tofu_tempeh"],
  soya: ["tofu_tempeh"],
  alcohol: ["alcohol"],
  pork: ["red_meat"],
  red_meat: ["red_meat"],
  meat: ["red_meat", "poultry"],
  legume: ["legumes"],
  legumes: ["legumes"],
};

/** Severities that veto a substitution. `preference` never blocks Tier 0. */
const BLOCKING_SEVERITIES: ReadonlySet<string> = new Set(["medical", "strict"]);

function normalizeSlug(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Food groups a constraint covers, or `null` when this bridge cannot say.
 * `null` is NOT an empty list: it is the third state that makes Tier 0 abstain.
 */
export function foodGroupsCoveredBy(constraintRef: string): FoodGroupRef[] | null {
  const slug = normalizeSlug(constraintRef);
  if (slug === "") return null;
  const mapped = ALLERGEN_FOOD_GROUPS[slug];
  if (mapped) return [...mapped];
  // A constraint that already names a food group is trivially resolvable.
  if (FOOD_GROUP_SET.has(slug)) return [slug as FoodGroupRef];
  return null;
}

export type ConstraintHit = {
  constraint_id: string;
  constraint_ref: string;
  severity: "medical" | "strict";
  food_group: FoodGroupRef;
};

/**
 * Does any blocking constraint land on `foodGroup`? Returns the FIRST hit,
 * medical severity first: the render path treats the two differently (a
 * medical token may never appear in generated text).
 */
export function blockingConstraintFor(
  foodGroup: string,
  constraints: readonly StudentSafetyConstraint[],
): ConstraintHit | null {
  const target = normalizeSlug(foodGroup);
  const hits: ConstraintHit[] = [];
  for (const constraint of constraints) {
    if (!BLOCKING_SEVERITIES.has(constraint.severity)) continue;
    const refs = [constraint.allergenRef, constraint.substanceRef]
      .filter((ref): ref is string => Boolean(ref && ref.trim()));
    for (const ref of refs) {
      const covered = foodGroupsCoveredBy(ref);
      if (!covered) continue;
      if (!covered.includes(target as FoodGroupRef)) continue;
      hits.push({
        constraint_id: constraint.id,
        constraint_ref: normalizeSlug(ref),
        severity: constraint.severity as "medical" | "strict",
        food_group: target as FoodGroupRef,
      });
    }
  }
  if (hits.length === 0) return null;
  return hits.find((hit) => hit.severity === "medical") ?? hits[0];
}

/**
 * Medical-severity constraints this bridge cannot resolve. Non-empty means
 * Tier 0 must not auto-approve a substitution.
 *
 * `medication_class` is deliberately excluded: it constrains substances, not
 * food groups, and its interactions live in the P0 watchlist, not here.
 */
export function unresolvableMedicalConstraints(
  constraints: readonly StudentSafetyConstraint[],
): string[] {
  const unresolved = new Set<string>();
  for (const constraint of constraints) {
    if (constraint.severity !== "medical") continue;
    const refs = [constraint.allergenRef, constraint.substanceRef]
      .filter((ref): ref is string => Boolean(ref && ref.trim()));
    if (refs.length === 0) continue;
    for (const ref of refs) {
      if (foodGroupsCoveredBy(ref) === null) unresolved.add(normalizeSlug(ref));
    }
  }
  return [...unresolved];
}
