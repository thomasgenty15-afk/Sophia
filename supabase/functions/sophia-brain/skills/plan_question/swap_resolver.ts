/**
 * KEEL W4.4 — TIER 0: the deterministic swap resolver. PURE: no I/O, no clock,
 * no model, no randomness.
 *
 * THE WHOLE ROI OF THE LANE IS HERE. When a coach sets `autonomy` and
 * `swap_policy` on a line, they have already answered "can I have rice instead
 * of the potatoes?". Routing that question through a model, a plan screen or a
 * coach inbox spends a week of latency re-deciding something already decided,
 * and teaches the student not to ask.
 *
 * PARITY WITH THE EVALUATOR IS THE INVARIANT
 * The rule below is the same rule as `evaluator.ts :: matchFoodGroup`, in the
 * same order:
 *
 *     identical group                        -> match, no swap
 *     autonomy='strict'                      -> veto, whatever the policy says
 *     policy.allowed_groups contains it      -> match, swap applied
 *     class equivalence granted + same class -> match, swap applied
 *     otherwise                              -> no match
 *
 * A Tier-0 "yes" that the evaluator grades `missed` at 23:59 is worse than no
 * Tier 0 at all: the student followed Sophia's answer and was marked down for
 * it. `plan_question_test.ts` drives BOTH modules on the same inputs and pins
 * that they agree — the two implementations are separate because the questions
 * are separate (pre-hoc permission vs post-hoc grading), and the test is what
 * keeps them from drifting.
 *
 * SAFETY OUTRANKS THE POLICY. The allergen check runs before everything,
 * including the identity shortcut: a coach line that names a group the student
 * is medically constrained against is a data bug that must surface as a hard
 * deny and an immediate escalation, not as a cheerful "yes, that's your line".
 */

import { parseFoodGroupRef } from "../../../_shared/keel/tokens.ts";
import type { StudentSafetyConstraint } from "../../../_shared/keel/safety_constraints.ts";
import {
  blockingConstraintFor,
  unresolvableMedicalConstraints,
} from "./allergen_bridge.ts";
import type { PlanQuestionCommitment, Tier0Verdict } from "./contract.ts";

export type Tier0Input = {
  commitment: PlanQuestionCommitment | null;
  /** Raw token as the dispatcher captured it. Never trusted, always resolved. */
  requested_food_group: string | null;
  /** `food_groups.slug -> class`, loaded from the DB by the caller. */
  food_group_classes: Readonly<Record<string, string>>;
  safety_constraints: readonly StudentSafetyConstraint[];
};

/**
 * R7 containment boundary.
 *
 * `parseFoodGroupRef` throws on an unknown slug, and that is correct for a
 * write path. Here the input is a token a language model produced from free
 * text, so a throw would take down a turn on a typo. The rule is NOT relaxed —
 * it is CONTAINED: the throw is caught at this single named function, and it
 * degrades to an explicit `null` that the resolver turns into a named
 * `unresolved_food_group` escalation. What never happens is a guess: an
 * unresolved token is never silently mapped to a nearby group, exactly as the
 * vague-0 plan import degraded `epa_dha` to `needs_review` instead of
 * inventing a substance.
 */
export function resolveFoodGroupToken(raw: string | null | undefined): string | null {
  const token = String(raw ?? "").trim();
  if (token === "") return null;
  try {
    return parseFoodGroupRef(token);
  } catch {
    return null;
  }
}

export function resolveTier0Swap(input: Tier0Input): Tier0Verdict {
  const requested = resolveFoodGroupToken(input.requested_food_group);

  // 1. The requested food is unreadable. Nothing else can be decided from it.
  if (requested === null) {
    return {
      decision: "escalate",
      tier: 0,
      reason_code: "unresolved_food_group",
      prescribed_food_group: null,
      requested_food_group: null,
      detail: input.requested_food_group
        ? `requested token ${JSON.stringify(input.requested_food_group)} is ` +
          "not a food_groups slug"
        : "no requested food group captured",
    };
  }

  // 2. SAFETY FIRST — before identity, before the policy, before autonomy.
  const blocking = blockingConstraintFor(requested, input.safety_constraints);
  if (blocking) {
    return {
      decision: "denied",
      tier: 0,
      reason_code: "allergen_violation",
      constraint_ref: blocking.constraint_ref,
      constraint_severity: blocking.severity,
      requested_food_group: requested,
    };
  }

  // 3. No commitment, or a commitment with nothing to substitute for.
  if (!input.commitment) {
    return {
      decision: "escalate",
      tier: 0,
      reason_code: "commitment_not_identified",
      prescribed_food_group: null,
      requested_food_group: requested,
      detail: "no plan commitment could be tied to the question",
    };
  }
  const prescribed = resolveFoodGroupToken(input.commitment.food_group_ref);
  if (prescribed === null) {
    return {
      decision: "escalate",
      tier: 0,
      reason_code: input.commitment.food_group_ref
        ? "unresolved_food_group"
        : "commitment_has_no_food_group",
      prescribed_food_group: null,
      requested_food_group: requested,
      detail: input.commitment.food_group_ref
        ? `commitment food_group_ref ${
          JSON.stringify(input.commitment.food_group_ref)
        } is not a food_groups slug`
        : `commitment ${input.commitment.id} carries no food_group_ref`,
    };
  }

  // 4. Not a substitution at all.
  if (requested === prescribed) {
    return {
      decision: "allowed",
      tier: 0,
      reason_code: "identical_group",
      swap_applied: false,
      prescribed_food_group: prescribed,
      requested_food_group: requested,
      matched_class: input.food_group_classes[prescribed] ?? null,
    };
  }

  // 5. From here on Tier 0 would AUTHORIZE a substitution. It may only do that
  //    when every medical constraint the student carries is readable by this
  //    runtime. An unreadable one is abstention, never an implicit clearance.
  const unresolvable = unresolvableMedicalConstraints(input.safety_constraints);
  if (unresolvable.length > 0) {
    return {
      decision: "escalate",
      tier: 0,
      reason_code: "unresolvable_medical_constraint",
      prescribed_food_group: prescribed,
      requested_food_group: requested,
      detail:
        "medical constraint(s) not resolvable against the food group vocabulary: " +
        unresolvable.join(", "),
    };
  }

  // 6. The coach pinned the line. The policy is not even consulted — parity
  //    with the evaluator, which vetoes on `strict` before reading the policy.
  if (input.commitment.autonomy === "strict") {
    return {
      decision: "escalate",
      tier: 0,
      reason_code: "autonomy_strict",
      prescribed_food_group: prescribed,
      requested_food_group: requested,
      detail: `commitment ${input.commitment.id} is autonomy='strict'`,
    };
  }

  // 7. Explicit allowlist authored by the coach.
  const policy = input.commitment.swap_policy;
  const allowed = policy?.allowed_groups ?? null;
  if (allowed && allowed.includes(requested)) {
    return {
      decision: "allowed",
      tier: 0,
      reason_code: "explicit_allowlist",
      swap_applied: true,
      prescribed_food_group: prescribed,
      requested_food_group: requested,
      matched_class: input.food_group_classes[requested] ?? null,
    };
  }

  const classEquivalent = input.commitment.autonomy === "flexible" ||
    (input.commitment.autonomy === "swap_within_policy" &&
      policy?.class_equivalent === true);
  if (!classEquivalent) {
    return {
      decision: "escalate",
      tier: 0,
      reason_code: "policy_forbids_class_equivalent",
      prescribed_food_group: prescribed,
      requested_food_group: requested,
      detail: "swap_policy does not grant class equivalence on this line",
    };
  }

  // 8. Class equivalence. An unknown class is a data gap, not a permission:
  //    the `food_groups` read was short, so Tier 0 abstains.
  const prescribedClass = input.food_group_classes[prescribed];
  const requestedClass = input.food_group_classes[requested];
  if (!prescribedClass || !requestedClass) {
    return {
      decision: "escalate",
      tier: 0,
      reason_code: "unresolved_food_group",
      prescribed_food_group: prescribed,
      requested_food_group: requested,
      detail: "food_groups class missing for " +
        (prescribedClass ? requested : prescribed),
    };
  }
  if (prescribedClass !== requestedClass) {
    return {
      decision: "escalate",
      tier: 0,
      reason_code: "different_class",
      prescribed_food_group: prescribed,
      requested_food_group: requested,
      detail: `${requested} is ${requestedClass}, the line prescribes ` +
        `${prescribed} (${prescribedClass})`,
    };
  }
  return {
    decision: "allowed",
    tier: 0,
    reason_code: "class_equivalent",
    swap_applied: true,
    prescribed_food_group: prescribed,
    requested_food_group: requested,
    matched_class: prescribedClass,
  };
}
