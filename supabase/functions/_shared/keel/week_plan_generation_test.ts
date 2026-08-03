// PIVOT NUTRITION — N1: week_plan_generation.ts.
//
// The three tests that carry the product:
//   * "an invented food line is rejected, named, and counted"
//     -- the rule that decides whether a coach renews. A student following a
//        plan his coach never wrote is the double-authority failure 1.5 calls
//        the killer of hybrid models.
//   * "what Sophia may add is a CLOSED list, never food"
//   * "a plan that contradicts the doctrine does not ship"

import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";

import {
  ALLOWED_ACTION_KINDS,
  buildWeekPlanPrompt,
  type CoachRecommendation,
  focusFor,
  parseWeekPlan,
  STUDENT_GOALS,
  WEEK_PLAN_SYSTEM_PROMPT,
  weekPlanItemsPayload,
} from "./week_plan_generation.ts";
import type { StudentSafetyConstraint } from "./safety_constraints.ts";

const RECOS: CoachRecommendation[] = [
  {
    template_commitment_key: "protein_each_meal",
    title: "Une source de protéines à chaque repas",
    student_instruction: "Viande, poisson, œufs, légumineuses — au choix.",
    activity_class: "nutrition",
    polarity: "do",
    slot_key: "any_meal",
    scheduled_days: null,
    priority: "core",
  },
  {
    template_commitment_key: "veg_two_servings",
    title: "2 portions de légumes par jour",
    student_instruction: null,
    activity_class: "nutrition",
    polarity: "do",
    slot_key: "any_meal",
    scheduled_days: null,
    priority: "core",
  },
  {
    template_commitment_key: "no_alcohol_weekdays",
    title: "Pas d'alcool en semaine",
    student_instruction: null,
    activity_class: "nutrition",
    polarity: "avoid",
    slot_key: null,
    scheduled_days: ["mon", "tue", "wed", "thu", "fri"],
    priority: "secondary",
  },
];

const DOCTRINE = {
  forbidden: [
    {
      token: "six_small_meals",
      surfaceForms: ["6 petits repas", "six petits repas"],
      reason: "ça casse la fenêtre de jeûne",
    },
  ],
};

const PEANUT: StudentSafetyConstraint = {
  id: "c1",
  userId: "u1",
  kind: "allergy",
  allergenRef: "peanut",
  substanceRef: null,
  medicationClass: null,
  severity: "medical",
  declaredBy: "student",
  notes: null,
  contentLocale: "fr-FR",
};

function parse(items: unknown[], over: Record<string, unknown> = {}) {
  return parseWeekPlan(
    { items },
    RECOS.map((r) => r.template_commitment_key),
    {
      doctrine: DOCTRINE,
      safetyConstraints: [],
      maxNutrition: 4,
      ...over,
    },
  );
}

// ---------------------------------------------------------------------------
// RULE 1 — traceability
// ---------------------------------------------------------------------------

Deno.test("an invented food line is rejected, named, and counted", () => {
  const plan = parse([
    {
      kind: "nutrition",
      label: "Une source de protéines à chaque repas",
      rationale: "Ça t'aidera à tenir jusqu'au soir.",
      source_commitment_key: "protein_each_meal",
      days: ["mon", "tue"],
    },
    {
      kind: "nutrition",
      label: "Boire un shaker de caséine avant de dormir",
      rationale: "Inventé de toutes pièces.",
      source_commitment_key: "casein_before_bed",
      days: ["mon"],
    },
  ]);
  assertEquals(plan.items.length, 1);
  assertEquals(plan.items[0].source_commitment_key, "protein_each_meal");
  // Nommée et comptée, jamais retirée en silence.
  assertEquals(plan.rejected_keys, ["casein_before_bed"]);
  assert(plan.issues.some((i) => i.includes("casein_before_bed")));
});

Deno.test("a food line with NO key at all is rejected", () => {
  const plan = parse([
    { kind: "nutrition", label: "Mange plus de fibres", rationale: "x", days: [] },
  ]);
  assertEquals(plan.items, []);
});

Deno.test("one recommendation, one line — a duplicate is collapsed", () => {
  const plan = parse([
    { kind: "nutrition", label: "A", rationale: "", source_commitment_key: "protein_each_meal", days: ["mon"] },
    { kind: "nutrition", label: "B", rationale: "", source_commitment_key: "protein_each_meal", days: ["tue"] },
  ]);
  assertEquals(plan.items.length, 1);
  assert(plan.issues.some((i) => i.includes("duplicate")));
});

Deno.test("the line cap holds — a twelve-line week is abandoned on Wednesday", () => {
  const plan = parse(
    RECOS.map((r) => ({
      kind: "nutrition",
      label: r.title,
      rationale: "",
      source_commitment_key: r.template_commitment_key,
      days: ["mon"],
    })),
    { maxNutrition: 2 },
  );
  assertEquals(plan.items.length, 2);
  assert(plan.issues.some((i) => i.includes("cap")));
});

// ---------------------------------------------------------------------------
// RULE 2 — what Sophia may add
// ---------------------------------------------------------------------------

Deno.test("what Sophia may add is a CLOSED list, never food", () => {
  const plan = parse([
    { kind: "action", label: "20 min de marche après le déjeuner", rationale: "", action_kind: "walk", days: ["mon"] },
    // Hors liste: une "action" alimentaire déguisée.
    { kind: "action", label: "Ajoute une collation protéinée", rationale: "", action_kind: "snack", days: ["mon"] },
  ]);
  assertEquals(plan.items.length, 1);
  assertEquals(plan.items[0].action_kind, "walk");
  assertEquals(plan.rejected_actions, ["snack"]);
});

Deno.test("at most 2 actions — momentum, not a second plan", () => {
  const plan = parse(
    ALLOWED_ACTION_KINDS.map((k) => ({
      kind: "action",
      label: k,
      rationale: "",
      action_kind: k,
      days: ["mon"],
    })),
  );
  assertEquals(plan.items.filter((i) => i.kind === "action").length, 2);
});

Deno.test("an action never carries a source key, a nutrition line always does", () => {
  const plan = parse([
    { kind: "action", label: "Eau", rationale: "", action_kind: "hydration", days: [] },
    { kind: "nutrition", label: "Légumes", rationale: "", source_commitment_key: "veg_two_servings", days: [] },
  ]);
  const payload = weekPlanItemsPayload(plan);
  assertEquals(payload.find((p) => p.kind === "action")?.source_commitment_key, null);
  assertEquals(payload.find((p) => p.kind === "nutrition")?.source_commitment_key, "veg_two_servings");
});

// ---------------------------------------------------------------------------
// RULE 3 — the two locks
// ---------------------------------------------------------------------------

Deno.test("a plan that contradicts the doctrine does not ship", () => {
  const plan = parse([
    {
      kind: "nutrition",
      label: "Une source de protéines à chaque repas",
      rationale: "Répartis sur 6 petits repas dans la journée.",
      source_commitment_key: "protein_each_meal",
      days: ["mon"],
    },
  ]);
  // Le plan entier est retenu, pas seulement la ligne fautive: un plan à moitié
  // conforme reste un plan qui contredit le coach.
  assertEquals(plan.items, []);
  assertEquals(plan.lock.reason, "blocked_coach_interdit");
});

Deno.test("a plan naming a medical allergen does not ship either", () => {
  const plan = parse(
    [
      {
        kind: "nutrition",
        label: "Une source de protéines à chaque repas",
        rationale: "Par exemple du beurre de peanut sur tes tartines.",
        source_commitment_key: "protein_each_meal",
        days: ["mon"],
      },
    ],
    { safetyConstraints: [PEANUT] },
  );
  assertEquals(plan.items, []);
  assertEquals(plan.lock.reason, "blocked_medical_constraint");
});

Deno.test("a clean plan passes both locks untouched", () => {
  const plan = parse([
    { kind: "nutrition", label: "2 portions de légumes", rationale: "Simple à tenir.", source_commitment_key: "veg_two_servings", days: ["mon", "wed"] },
  ], { safetyConstraints: [PEANUT] });
  assertEquals(plan.items.length, 1);
  assert(plan.lock.reason === "clean" || plan.lock.reason.startsWith("disarmed"));
});

// ---------------------------------------------------------------------------
// Goal shapes the ARRANGEMENT, never the content
// ---------------------------------------------------------------------------

Deno.test("every goal has a named branch (R6)", () => {
  for (const goal of STUDENT_GOALS) {
    const f = focusFor(goal);
    assert(f.maxNutrition >= 3 && f.maxNutrition <= 5, goal);
    assert(f.emphasis.length > 0, goal);
  }
});

Deno.test("the prompt carries the coach's list and forbids inventing", () => {
  const { userMessage, allowedKeys, systemPrompt } = buildWeekPlanPrompt({
    recommendations: RECOS,
    situation: { goal: "fat_loss", situation: "je mange à la cantine le midi", practicalConstraints: {} },
    doctrineBlock: "== MARC'S METHOD ==",
    weekStart: "2026-08-03",
  });
  assertEquals(allowedKeys.length, 3);
  assert(userMessage.includes("protein_each_meal"));
  assert(userMessage.includes("cantine"));
  assert(userMessage.includes("MARC'S METHOD"));
  assert(systemPrompt.includes("You NEVER invent food content"));
  assert(systemPrompt.includes("character for character"));
  // Le plafond de lignes voyage jusqu'au modèle, pas seulement au parseur.
  assert(userMessage.includes("maximum nutrition lines: 4"));
});

Deno.test("unknown day tokens are named, never guessed (R7)", () => {
  const plan = parse([
    { kind: "nutrition", label: "x", rationale: "", source_commitment_key: "veg_two_servings", days: ["mon", "lundi", "MON"] },
  ]);
  assertEquals(plan.items[0].days, ["mon"]);
  assert(plan.issues.some((i) => i.includes("lundi")));
});

Deno.test("a non-JSON model output throws instead of shipping an empty plan", () => {
  assertThrows(() => parseWeekPlan("not json at all", ["k"], {
    doctrine: null, safetyConstraints: [], maxNutrition: 4,
  }));
});
