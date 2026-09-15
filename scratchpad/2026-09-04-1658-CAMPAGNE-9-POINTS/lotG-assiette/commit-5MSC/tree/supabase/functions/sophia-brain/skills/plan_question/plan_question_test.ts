/**
 * `plan_question` — tests (KEEL W4.4).
 *
 * Four properties define the lane, and each one has a section below:
 *
 *   1. TIER 0 — same class + `swap_within_policy` => yes, deterministically,
 *      with no model and no escalation.
 *   2. PARITY — a Tier 0 "yes" is graded `met` by the evaluator. This is the
 *      section that matters most: the two modules answer different questions
 *      (permission now vs grade tonight) and MUST NOT drift, or a student gets
 *      marked down for following Sophia's answer.
 *   3. OUT OF POLICY — a `contract_change_requests` row, `next_digest`.
 *   4. ALLERGEN — hard deny, `urgency='immediate'`, and `suggested_option` is
 *      never applied by anything.
 */

import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  type EvaluationSnapshot,
  type EvaluatorCommitment,
  evaluateSnapshot,
} from "../../../_shared/keel/evaluator.ts";
import type { StudentSafetyConstraint } from "../../../_shared/keel/safety_constraints.ts";
import { findMedicalConstraintViolations } from "../../../_shared/keel/safety_constraints.ts";
import {
  IMMEDIATE_URGENCY_REASON_CODES,
  type PlanQuestionCommitment,
} from "./contract.ts";
import { resolveTier0Swap } from "./swap_resolver.ts";
import {
  assertSuggestedOptionIsDraft,
  assertUrgencyAllowed,
  buildChangeRequest,
} from "./escalation.ts";
import { renderPlanQuestion } from "./renderer.ts";
import { requestedFoodGroupForResolution, resolvePlanQuestion } from "./skill.ts";
import {
  foodGroupsCoveredBy,
  unresolvableMedicalConstraints,
} from "./allergen_bridge.ts";

// ---------------------------------------------------------------------------
// Fixtures — acceptance fixture 3 line 1 (the coeliac breakfast bowl)
// ---------------------------------------------------------------------------

/** `food_groups.slug -> class`, verbatim from the P0 seed. */
const FOOD_GROUP_CLASSES: Record<string, string> = {
  berries: "fruit",
  citrus: "fruit",
  other_fruit: "fruit",
  whole_grain: "grain",
  refined_grain: "grain",
  starchy_veg: "vegetable",
  cruciferous_veg: "vegetable",
  leafy_greens: "vegetable",
  non_starchy_veg: "vegetable",
  dairy_yogurt: "dairy",
  dairy_cheese: "dairy",
  fatty_fish: "protein",
  white_fish: "protein",
  poultry: "protein",
  eggs: "protein",
  legumes: "legume",
  nuts_seeds: "fat",
  olive_oil: "fat",
  alcohol: "beverage",
};

function commitment(
  patch: Partial<PlanQuestionCommitment> = {},
): PlanQuestionCommitment {
  return {
    id: "commitment-breakfast",
    title: "Breakfast: 60 g oats + 150 g yogurt + 100 g berries",
    slot_key: "breakfast",
    food_group_ref: "berries",
    autonomy: "swap_within_policy",
    swap_policy: { class_equivalent: true, allowed_groups: null },
    plan_version_id: "version-1",
    ...patch,
  };
}

function constraint(
  patch: Partial<StudentSafetyConstraint> = {},
): StudentSafetyConstraint {
  return {
    id: "constraint-1",
    userId: "student-1",
    kind: "allergy",
    allergenRef: "shellfish",
    substanceRef: null,
    medicationClass: null,
    conditionRef: null,
    dietRef: null,
    severity: "medical",
    declaredBy: "coach",
    notes: null,
    contentLocale: "en",
    ...patch,
  };
}

function runtime(patch: Record<string, unknown> = {}) {
  return {
    commitment: commitment(),
    food_group_classes: FOOD_GROUP_CLASSES,
    safety_constraints: [] as readonly StudentSafetyConstraint[],
    content_locale: "en",
    ...patch,
  } as Parameters<typeof resolvePlanQuestion>[0]["runtime"];
}

// ---------------------------------------------------------------------------
// 1. TIER 0 — same class under swap_within_policy => yes, no model
// ---------------------------------------------------------------------------

Deno.test("tier0: same food_groups class under swap_within_policy is allowed with no escalation", () => {
  // Acceptance fixture 3 line 1, verbatim: banana (other_fruit) for the
  // prescribed berries, both FRUIT, `swap_within_policy` + class_equivalent.
  const resolution = resolvePlanQuestion({
    response_locale: "en-US",
    user_id: "student-1",
    question_kind: "food_swap",
    requested_food_group: "other_fruit",
    student_words: "no berries left, can I put a banana in instead?",
    runtime: runtime(),
  });

  assertEquals(resolution.outcome, "tier0_allowed");
  assertEquals(resolution.change_request, null);
  assertEquals(resolution.diagnosis.reason_code, "class_equivalent");
  assertEquals(resolution.diagnosis.escalated_to_coach, false);
  assertEquals(resolution.diagnosis.resolved_without_model, true);
  assertEquals(resolution.diagnosis.prescription_mutated, false);
});

Deno.test("tier0: identity is not a swap, and a coach allowlist beats the class rule", () => {
  const identity = resolveTier0Swap({
    commitment: commitment(),
    requested_food_group: "berries",
    food_group_classes: FOOD_GROUP_CLASSES,
    safety_constraints: [],
  });
  assertEquals(identity.decision, "allowed");
  assertEquals(
    identity.decision === "allowed" ? identity.swap_applied : true,
    false,
  );

  // An explicit allowlist authorizes a CROSS-class substitute the class rule
  // would refuse: the coach's enumeration outranks the generic policy.
  const allowlisted = resolveTier0Swap({
    commitment: commitment({
      swap_policy: { class_equivalent: false, allowed_groups: ["dairy_yogurt"] },
    }),
    requested_food_group: "dairy_yogurt",
    food_group_classes: FOOD_GROUP_CLASSES,
    safety_constraints: [],
  });
  assertEquals(allowlisted.decision, "allowed");
  assertEquals(
    allowlisted.decision === "allowed" ? allowlisted.reason_code : null,
    "explicit_allowlist",
  );
});

Deno.test("tier0: an unreadable slug degrades to a named escalation, never to a neighbouring group", () => {
  const verdict = resolveTier0Swap({
    commitment: commitment(),
    // A model hallucination in the vague-0 style (`epa_dha`). It must NOT be
    // silently resolved to `other_fruit` because it looks fruity.
    requested_food_group: "banana_smoothie",
    food_group_classes: FOOD_GROUP_CLASSES,
    safety_constraints: [],
  });
  assertEquals(verdict.decision, "escalate");
  assertEquals(verdict.reason_code, "unresolved_food_group");
  assertEquals(
    verdict.decision === "escalate" ? verdict.requested_food_group : "x",
    null,
  );
});

// ---------------------------------------------------------------------------
// 2. PARITY — a Tier 0 "yes" is graded `met` by the evaluator
// ---------------------------------------------------------------------------

function evaluatorCommitmentFrom(
  source: PlanQuestionCommitment,
): EvaluatorCommitment {
  return {
    id: source.id,
    planVersionId: source.plan_version_id ?? "version-1",
    userId: "student-1",
    polarity: "do",
    anchorKind: "slot",
    slotKey: source.slot_key,
    clockLocal: null,
    toleranceMinutes: null,
    windowStartLocal: null,
    windowEndLocal: null,
    measure: "serving",
    unit: "serving",
    targetOp: ">=",
    targetMin: 1,
    targetMax: null,
    tolerancePct: 10,
    substanceRef: null,
    foodGroupRef: source.food_group_ref,
    evidenceKind: "self_report",
    evidenceRequired: false,
    autoSource: null,
    countsTowardAdherence: true,
    evaluationGrain: "occasion",
    slotKind: "nominal",
    scheduledDays: null,
    requiredDaysPerWeek: null,
    expectedOccasionsPerDay: 1,
    priority: "core",
    autonomy: source.autonomy,
    flexEligible: false,
    status: "active",
    swapPolicy: source.swap_policy,
  };
}

function gradeSwap(
  source: PlanQuestionCommitment,
  loggedFoodGroup: string,
): string {
  const snapshot: EvaluationSnapshot = {
    userId: "student-1",
    planVersionId: source.plan_version_id ?? "version-1",
    localDate: "2026-07-27",
    dayOfWeek: "mon",
    weekStartDate: "2026-07-27",
    weekIsClosed: false,
    weekEvents: [],
    commitments: [evaluatorCommitmentFrom(source)],
    events: [{
      id: "event-1",
      localDate: "2026-07-27",
      localTime: "08:00",
      slotKey: source.slot_key,
      source: "chat",
      quantity: 1,
      unit: "serving",
      substanceRef: null,
      foodGroupRef: loggedFoodGroup,
      evidenceWeight: 0.8,
      portionBand: null,
      commitmentId: null,
    }],
    plannedDeviations: [],
    foodGroupClasses: FOOD_GROUP_CLASSES,
    evaluatedAt: "2026-07-27T22:00:00.000Z",
    dayIsClosed: true,
  };
  return evaluateSnapshot(snapshot).evaluations[0].status;
}

Deno.test("parity: every Tier 0 verdict agrees with the evaluator's later grade", () => {
  // The matrix that matters. For each (autonomy, policy, requested group), the
  // resolver's "yes" must equal the evaluator's `met`. A row where the two
  // disagree is a student who followed the answer and was marked down.
  const cases: Array<{
    name: string;
    commitment: PlanQuestionCommitment;
    requested: string;
  }> = [
    {
      name: "same class, swap_within_policy + class_equivalent",
      commitment: commitment(),
      requested: "other_fruit",
    },
    {
      name: "same class, strict",
      commitment: commitment({ autonomy: "strict" }),
      requested: "other_fruit",
    },
    {
      name: "same class, swap_within_policy WITHOUT class_equivalent",
      commitment: commitment({
        swap_policy: { class_equivalent: false, allowed_groups: null },
      }),
      requested: "other_fruit",
    },
    {
      name: "different class, flexible",
      commitment: commitment({ autonomy: "flexible" }),
      requested: "whole_grain",
    },
    {
      name: "different class, explicit allowlist",
      commitment: commitment({
        swap_policy: { class_equivalent: false, allowed_groups: ["dairy_yogurt"] },
      }),
      requested: "dairy_yogurt",
    },
    {
      name: "identical group",
      commitment: commitment(),
      requested: "berries",
    },
    {
      name: "different class, swap_within_policy + class_equivalent",
      commitment: commitment(),
      requested: "leafy_greens",
    },
  ];

  for (const testCase of cases) {
    const verdict = resolveTier0Swap({
      commitment: testCase.commitment,
      requested_food_group: testCase.requested,
      food_group_classes: FOOD_GROUP_CLASSES,
      safety_constraints: [],
    });
    const tier0SaysYes = verdict.decision === "allowed";
    const evaluatorSaysMet =
      gradeSwap(testCase.commitment, testCase.requested) === "met";
    assertEquals(
      tier0SaysYes,
      evaluatorSaysMet,
      `parity broken for "${testCase.name}": tier0 allowed=${tier0SaysYes}, ` +
        `evaluator met=${evaluatorSaysMet}`,
    );
  }
});

// ---------------------------------------------------------------------------
// 3. OUT OF POLICY — a change request, and only the digest lane
// ---------------------------------------------------------------------------

Deno.test("out of policy: strict autonomy escalates to the coach at next_digest", () => {
  const resolution = resolvePlanQuestion({
    response_locale: "en-US",
    user_id: "student-1",
    question_kind: "food_swap",
    requested_food_group: "other_fruit",
    student_words: "can I swap the berries for a banana?",
    runtime: runtime({ commitment: commitment({ autonomy: "strict" }) }),
  });

  assertEquals(resolution.outcome, "escalated");
  const request = resolution.change_request!;
  assertEquals(request.raised_by, "sophia");
  assertEquals(request.reason_code, "dislikes_food");
  assertEquals(request.urgency, "next_digest");
  assertEquals(request.bypasses_digest, false);
  assertEquals(request.status, "open");
  assertEquals(request.coach_decision, null);
  assertEquals(request.commitment_id, "commitment-breakfast");
  // The student's words travel verbatim; the AI's reading is a separate field.
  assertEquals(request.student_words, "can I swap the berries for a banana?");
  assertEquals(
    (request.sophia_evidence as Record<string, unknown>).reason_code,
    "autonomy_strict",
  );
  // Nothing was decided and nothing was changed.
  assertEquals(resolution.diagnosis.prescription_mutated, false);
});

Deno.test("out of policy: a different class escalates, and the reply promises no change", () => {
  const resolution = resolvePlanQuestion({
    response_locale: "en-US",
    user_id: "student-1",
    question_kind: "eating_out",
    requested_food_group: "refined_grain",
    student_words: "I'm at a restaurant, they only have white bread",
    runtime: runtime(),
  });
  assertEquals(resolution.outcome, "escalated");
  assertEquals(resolution.change_request?.reason_code, "social_event");
  assertEquals(resolution.change_request?.urgency, "next_digest");
  // The reply states the negative explicitly and claims no mutation.
  assertEquals(
    resolution.reply.toLowerCase().includes("nothing in your plan has changed"),
    true,
  );
  for (const claim of ["i have changed", "i updated", "your plan now"]) {
    assertEquals(resolution.reply.toLowerCase().includes(claim), false);
  }
});

Deno.test("urgency: only allergen_violation and restriction_signal may bypass the digest", () => {
  assertEquals(
    [...IMMEDIATE_URGENCY_REASON_CODES],
    ["allergen_violation", "restriction_signal"],
  );
  // Both directions are code bugs and both throw: a swallowed allergy, and an
  // interruption budget spent on a food preference.
  assertThrows(
    () => assertUrgencyAllowed("dislikes_food", "immediate"),
    Error,
    "reserved for",
  );
  assertThrows(
    () => assertUrgencyAllowed("allergen_violation", "next_digest"),
    Error,
    "bypasses the digest by contract",
  );
  assertUrgencyAllowed("allergen_violation", "immediate");
  assertUrgencyAllowed("restriction_signal", "immediate");
  assertUrgencyAllowed("social_event", "next_digest");
});

// ---------------------------------------------------------------------------
// 4. ALLERGEN — hard deny, immediate, and the draft is never applied
// ---------------------------------------------------------------------------

Deno.test("allergen: a medical constraint on the requested group denies and bypasses the digest", () => {
  const resolution = resolvePlanQuestion({
    response_locale: "en-US",
    user_id: "student-1",
    question_kind: "food_swap",
    requested_food_group: "shellfish",
    student_words: "can I have prawns instead of the salmon?",
    runtime: runtime({
      commitment: commitment({ food_group_ref: "fatty_fish" }),
      safety_constraints: [constraint({ allergenRef: "shellfish" })],
    }),
  });

  assertEquals(resolution.outcome, "hard_deny");
  const request = resolution.change_request!;
  assertEquals(request.reason_code, "allergen_violation");
  assertEquals(request.urgency, "immediate");
  assertEquals(request.bypasses_digest, true);
  assertEquals(
    (request.sophia_evidence as Record<string, unknown>).constraint_ref,
    "shellfish",
  );
  // The reply refuses and never names the medical token (W3.3 validator).
  assertEquals(
    findMedicalConstraintViolations(resolution.reply, [
      constraint({ allergenRef: "shellfish" }),
    ]).length,
    0,
  );
  assertEquals(resolution.reply.toLowerCase().includes("shellfish"), false);
});

Deno.test("allergen: the bridge blocks the coeliac's grain-for-grain swap Tier 0 would otherwise clear", () => {
  // Both are GRAIN under `swap_within_policy` + class_equivalent, so the pure
  // class rule says yes. `gluten` is not a `food_groups` slug, so without the
  // narrow bridge the constraint would never match and Tier 0 would approve
  // exactly the substitution acceptance fixture 3 exists to forbid.
  assertEquals(foodGroupsCoveredBy("gluten"), ["whole_grain", "refined_grain"]);
  const verdict = resolveTier0Swap({
    commitment: commitment({ food_group_ref: "whole_grain" }),
    requested_food_group: "refined_grain",
    food_group_classes: FOOD_GROUP_CLASSES,
    safety_constraints: [
      constraint({ id: "c-gluten", allergenRef: "gluten", kind: "medical" }),
    ],
  });
  assertEquals(verdict.decision, "denied");
  assertEquals(verdict.reason_code, "allergen_violation");
});

Deno.test("allergen: an unreadable medical constraint makes Tier 0 abstain instead of approving", () => {
  const exotic = constraint({ id: "c-x", allergenRef: "nightshade_family" });
  assertEquals(unresolvableMedicalConstraints([exotic]), ["nightshade_family"]);

  const verdict = resolveTier0Swap({
    commitment: commitment(),
    requested_food_group: "other_fruit", // same class, would normally pass
    food_group_classes: FOOD_GROUP_CLASSES,
    safety_constraints: [exotic],
  });
  assertEquals(verdict.decision, "escalate");
  assertEquals(verdict.reason_code, "unresolvable_medical_constraint");

  // A `preference`-severity constraint is NOT a medical unknown and must not
  // disable Tier 0 — over-blocking every swap would kill the lane.
  const preference = constraint({
    id: "c-p",
    kind: "dislike",
    allergenRef: "nightshade_family",
    severity: "preference",
  });
  assertEquals(
    resolveTier0Swap({
      commitment: commitment(),
      requested_food_group: "other_fruit",
      food_group_classes: FOOD_GROUP_CLASSES,
      safety_constraints: [preference],
    }).decision,
    "allowed",
  );
});

Deno.test("suggested_option is a draft that nothing applies", () => {
  const resolution = resolvePlanQuestion({
    response_locale: "en-US",
    user_id: "student-1",
    question_kind: "food_swap",
    requested_food_group: "leafy_greens",
    student_words: "can I put spinach in instead of the berries?",
    runtime: runtime(),
  });
  const request = resolution.change_request!;
  const option = request.suggested_option as Record<string, unknown>;

  // 1. It is marked as a draft, in the row itself.
  assertEquals(option.applied, false);
  assertEquals(option.never_auto_applied, true);
  assertEquals(option.kind, "coach_review_only");
  assertEquals(request.status, "open");
  assertEquals(request.coach_decision, null);
  assertEquals(resolution.diagnosis.suggested_option_is_draft, true);

  // 2. It carries NO applicable instruction: no column, no operation verb, no
  //    target id. There is nothing here an executor could mistake for a patch.
  const serialized = JSON.stringify(option);
  for (const forbidden of ["plan_commitments", "update", "patch", "column"]) {
    assertEquals(
      serialized.toLowerCase().includes(forbidden),
      false,
      `suggested_option must not read as an instruction (found "${forbidden}")`,
    );
  }

  // 3. The invariant is re-checkable by any holder of the row, and a row that
  //    lost its draft markers is refused.
  assertSuggestedOptionIsDraft(request);
  assertThrows(
    () =>
      assertSuggestedOptionIsDraft({
        ...request,
        suggested_option: { ...option, applied: true },
      }),
    Error,
    "must carry applied=false",
  );
  assertThrows(
    () =>
      assertSuggestedOptionIsDraft(
        { ...request, coach_decision: "ok" } as unknown as typeof request,
      ),
    Error,
    "Sophia never decides for the coach",
  );
});

Deno.test("structural: the lane writes nothing — no DB client, no plan_commitments, no effect", async () => {
  // Half 1: the modules that build the decision and the escalation never name
  // the prescription table nor a client. Escalation is a ROW, not a write.
  // Comments are stripped first: the doc comments say "this module never
  // writes to plan_commitments", and a textual match on them would make the
  // assertion fail for stating its own invariant.
  const stripComments = (source: string) =>
    source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  for (
    const file of ["swap_resolver.ts", "escalation.ts", "renderer.ts", "contract.ts"]
  ) {
    const code = stripComments(
      await Deno.readTextFile(new URL(`./${file}`, import.meta.url)),
    );
    for (const forbidden of ["plan_commitments", "supabase-js", "SupabaseClient"]) {
      assertEquals(
        code.includes(forbidden),
        false,
        `${file} must not reference ${forbidden} outside comments`,
      );
    }
  }

  // Half 2: an allowed verdict escalates nothing, and building a request for
  // one is refused rather than silently filling the coach's inbox with noise.
  assertThrows(
    () =>
      buildChangeRequest({
        user_id: "student-1",
        question_kind: "food_swap",
        verdict: {
          decision: "allowed",
          tier: 0,
          reason_code: "class_equivalent",
          swap_applied: true,
          prescribed_food_group: "berries",
          requested_food_group: "other_fruit",
          matched_class: "fruit",
        },
        commitment: commitment(),
        student_words: "banana?",
        content_locale: "en",
      }),
    Error,
    "escalates nothing",
  );
});

Deno.test("renderer: the allowed reply states no number, no percentage, no plan change", () => {
  const render = renderPlanQuestion({
    locale: "en-US",
    verdict: {
      decision: "allowed",
      tier: 0,
      reason_code: "class_equivalent",
      swap_applied: true,
      prescribed_food_group: "berries",
      requested_food_group: "other_fruit",
      matched_class: "fruit",
    },
    change_request: null,
    safety_constraints: [],
  });
  assertEquals(render.medical_validator_tripped, false);
  assertEquals(/\d+\s*%/.test(render.reply), false);
  assertEquals(render.reply.toLowerCase().includes("i changed"), false);
  assertEquals(render.reply.toLowerCase().includes("updated your plan"), false);
});

// ---------------------------------------------------------------------------
// FF-016 — « À LA PLACE DE » NE PEUT PAS ÊTRE LA MÊME CHOSE.
//
// Le défaut mesuré n'est pas dans le resolver: il est dans ce que le resolver
// REÇOIT. Sur la traduction anglaise d'une question de substitution, le
// dispatcher recopie le groupe PRESCRIT dans le champ « demandé » (2 fois sur
// 3, run réel du 2026-08-08), et l'identité qui en résulte répond OUI avant la
// politique, avant l'autonomie, et sans jamais avoir vu l'aliment que l'élève
// allait réellement manger.
// ---------------------------------------------------------------------------

Deno.test("FF-016: sur un food_swap, un « demandé » égal au prescrit est une non-lecture", () => {
  // C'est la valeur EXACTE relue dans `conversation_turn_traces` sur
  // « Can I swap the potatoes for rice tonight? » chez l'élève cœliaque.
  assertEquals(
    requestedFoodGroupForResolution("food_swap", "starchy_veg", "starchy_veg"),
    null,
  );
  // La casse ne sauve pas le modèle de lui-même.
  assertEquals(
    requestedFoodGroupForResolution("food_swap", "Starchy_Veg", "starchy_veg"),
    null,
  );
  // Une vraie substitution traverse intacte.
  assertEquals(
    requestedFoodGroupForResolution("food_swap", "refined_grain", "starchy_veg"),
    "refined_grain",
  );
  // Sans prescrit, il n'y a rien à comparer: on ne jette pas ce qu'on a.
  assertEquals(
    requestedFoodGroupForResolution("food_swap", "refined_grain", null),
    "refined_grain",
  );
  // HORS food_swap, l'identité est une QUESTION DE CONFIRMATION, et « oui,
  // c'est exactement ce que la ligne demande » en est la bonne réponse.
  assertEquals(
    requestedFoodGroupForResolution("other", "lean_protein", "lean_protein"),
    "lean_protein",
  );
  assertEquals(
    requestedFoodGroupForResolution("eating_out", "lean_protein", "lean_protein"),
    "lean_protein",
  );
});

Deno.test("FF-016: la non-lecture dégrade en escalade nommée, jamais en OUI", () => {
  // Le bout à bout: ce que le dispatcher a produit, passé par le nettoyage,
  // puis par le resolver — et le cœliaque ne reçoit plus « yes, log it ».
  const verdict = resolveTier0Swap({
    commitment: commitment({ food_group_ref: "starchy_veg" }),
    requested_food_group: requestedFoodGroupForResolution(
      "food_swap",
      "starchy_veg",
      "starchy_veg",
    ),
    food_group_classes: FOOD_GROUP_CLASSES,
    safety_constraints: [
      {
        id: "c-gluten",
        userId: "student-1",
        kind: "allergy",
        allergenRef: "gluten",
        substanceRef: null,
        medicationClass: null,
        conditionRef: null,
        dietRef: null,
        severity: "medical",
        declaredBy: "student",
        notes: null,
        contentLocale: "en",
      },
    ],
  });
  assertEquals(verdict.decision, "escalate");
  assertEquals(verdict.reason_code, "unresolved_food_group");
});
