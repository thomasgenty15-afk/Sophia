// PIVOT NUTRITION — C1: week_plan_generation.ts, ancré sur la DOCTRINE.
//
// Ce que ces tests protègent, dans l'ordre de ce qui tue le produit:
//   * "une conviction inventée est rejetée, nommée, comptée"
//     -- l'élève ne doit jamais suivre une ligne attribuée à une méthode que le
//        coach n'enseigne pas. C'est la défaillance de double autorité.
//   * "aucune ligne ne porte de cible chiffrée"
//     -- règle NEUVE. Tant que Sophia recopiait le coach, un chiffre était le
//        sien. Maintenant qu'elle COMPOSE, elle peut inventer « 150 g de
//        protéines » que personne n'a mesuré.
//   * "ce que Sophia ajoute est une liste CLOSE, jamais de la nourriture"
//   * "un plan qui contredit la doctrine ne part pas"

import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";

import {
  ALLOWED_ACTION_KINDS,
  buildWeekPlanPrompt,
  type CoachPrinciple,
  findNumericTarget,
  focusFor,
  parseWeekPlan,
  STUDENT_GOALS,
  WEEK_PLAN_SYSTEM_PROMPT,
  weekPlanItemsPayload,
} from "./week_plan_generation.ts";
import type { StudentSafetyConstraint } from "./safety_constraints.ts";

const PRINCIPLES: CoachPrinciple[] = [
  {
    belief_key: "satiety_before_arithmetic",
    claim: "Satiety before arithmetic — if you are hungry two hours later, the meal failed.",
    rationale: "Counting fails the week someone stops counting.",
  },
  {
    belief_key: "vegetables_are_the_floor",
    claim: "Vegetables are the floor of a plate, not a garnish.",
    rationale: null,
  },
  {
    belief_key: "weekday_alcohol_costs_sleep",
    claim: "Weekday alcohol costs you the next morning.",
    rationale: null,
  },
];

const DOCTRINE = {
  forbidden: [
    {
      token: "six_small_meals",
      surfaceForms: ["6 small meals", "six small meals"],
      reason: "it breaks the fasting window",
      instead: "Three meals you actually finish. Grazing hides how much you eat.",
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
  contentLocale: "en-GB",
};

function parse(items: unknown[], over: Record<string, unknown> = {}) {
  return parseWeekPlan({ items }, PRINCIPLES, {
    doctrine: DOCTRINE,
    safetyConstraints: [],
    maxNutrition: 4,
    ...over,
  });
}

// ---------------------------------------------------------------------------
// RÈGLE 1 — traçabilité à une conviction
// ---------------------------------------------------------------------------

Deno.test("an invented conviction is rejected, named, and counted", () => {
  const plan = parse([
    {
      kind: "nutrition",
      label: "Build lunch around something that keeps you full until dinner",
      rationale: "Your canteen makes this the easiest one to hold.",
      source_belief_key: "satiety_before_arithmetic",
      days: ["mon", "tue"],
    },
    {
      kind: "nutrition",
      label: "Drink a casein shake before bed",
      rationale: "Invented whole cloth.",
      source_belief_key: "casein_before_bed",
      days: ["mon"],
    },
  ]);
  assertEquals(plan.items.length, 1);
  assertEquals(plan.items[0].source_belief_key, "satiety_before_arithmetic");
  // Nommée et comptée, jamais retirée en silence.
  assertEquals(plan.rejected_keys, ["casein_before_bed"]);
  assert(plan.issues.some((i) => i.includes("casein_before_bed")));
});

Deno.test("a food line with NO key at all is rejected", () => {
  const plan = parse([
    { kind: "nutrition", label: "Eat more fibre", rationale: "x", days: [] },
  ]);
  assertEquals(plan.items, []);
});

Deno.test("the conviction TEXT travels with the line, frozen at generation", () => {
  // L'élève n'a pas le droit de lire `coach_doctrines`: si le texte ne voyage
  // pas avec la ligne, l'app ne peut pas montrer d'où elle vient, et la seule
  // chose qui rend l'interprétation jugeable disparaît.
  const plan = parse([
    {
      kind: "nutrition",
      label: "Vegetables first on the plate",
      rationale: "",
      source_belief_key: "vegetables_are_the_floor",
      days: ["mon"],
    },
  ]);
  assertEquals(
    plan.items[0].source_belief_claim,
    "Vegetables are the floor of a plate, not a garnish.",
  );
  assertEquals(
    weekPlanItemsPayload(plan)[0].source_belief_claim,
    "Vegetables are the floor of a plate, not a garnish.",
  );
});

Deno.test("one conviction, one line — a duplicate is collapsed", () => {
  const plan = parse([
    { kind: "nutrition", label: "A", rationale: "", source_belief_key: "satiety_before_arithmetic", days: ["mon"] },
    { kind: "nutrition", label: "B", rationale: "", source_belief_key: "satiety_before_arithmetic", days: ["tue"] },
  ]);
  assertEquals(plan.items.length, 1);
  assert(plan.issues.some((i) => i.includes("duplicate")));
});

Deno.test("the line cap holds — a twelve-line week is abandoned on Wednesday", () => {
  const plan = parse(
    PRINCIPLES.map((p) => ({
      kind: "nutrition",
      label: p.claim,
      rationale: "",
      source_belief_key: p.belief_key,
      days: ["mon"],
    })),
    { maxNutrition: 2 },
  );
  assertEquals(plan.items.length, 2);
  assert(plan.issues.some((i) => i.includes("cap")));
});

// ---------------------------------------------------------------------------
// RÈGLE 2 — pas de cible chiffrée
//
// Chaque motif est testé SEUL. La leçon vient du garde anti-culpabilité de ce
// dépôt, qui portait deux branches mortes qu'une suite globale n'a jamais vues:
// un motif qui ne mord jamais passe tous les tests d'ensemble.
// ---------------------------------------------------------------------------

Deno.test("numeric guard — energy_unit bites on its own", () => {
  assertEquals(findNumericTarget("Aim for 1800 kcal a day"), "energy_unit");
  assertEquals(findNumericTarget("about 500 calories at lunch"), "energy_unit");
  assertEquals(findNumericTarget("2,000 kJ"), "energy_unit");
});

Deno.test("numeric guard — macro_quantity bites on its own", () => {
  assertEquals(findNumericTarget("30 g of protein at breakfast"), "macro_quantity");
  assertEquals(findNumericTarget("120 grams of carbs"), "macro_quantity");
});

Deno.test("numeric guard — macro_quantity_reversed bites on its own", () => {
  assertEquals(findNumericTarget("protein: 30 g"), "macro_quantity_reversed");
  assertEquals(findNumericTarget("keep fat under 60 g"), "macro_quantity_reversed");
});

Deno.test("numeric guard — macro_percentage bites on its own", () => {
  assertEquals(findNumericTarget("40% carbs"), "macro_percentage");
  assertEquals(findNumericTarget("protein around 30 %"), "macro_percentage");
});

Deno.test("numeric guard — a CADENCE is not a target and must survive", () => {
  // Si ces phrases mordaient, le générateur serait incapable d'écrire une
  // ligne utile: il ne resterait que des consignes sans forme.
  for (
    const ok of [
      "Three meals a day, no grazing",
      "Two vegetables at dinner",
      "Eat within an hour of waking",
      "1 large plate, not two small ones",
      "Take 10 calm minutes before dinner",
    ]
  ) {
    assertEquals(findNumericTarget(ok), null, ok);
  }
});

Deno.test("a numeric target in the RATIONALE is caught too", () => {
  // La cible dans la justification est lue par l'élève exactement comme dans
  // le libellé; ne filtrer que le libellé déplacerait le problème d'un champ.
  const plan = parse([
    {
      kind: "nutrition",
      label: "More protein at breakfast",
      rationale: "Aim for 30 g of protein to start the day.",
      source_belief_key: "satiety_before_arithmetic",
      days: ["mon"],
    },
  ]);
  assertEquals(plan.items, []);
  assertEquals(plan.rejected_numeric, ["macro_quantity"]);
});

// ---------------------------------------------------------------------------
// RÈGLE 3 — ce que Sophia peut ajouter
// ---------------------------------------------------------------------------

Deno.test("what Sophia may add is a CLOSED list, never food", () => {
  const plan = parse([
    { kind: "action", label: "A short walk after lunch", rationale: "", action_kind: "walk", days: ["mon"] },
    // Hors liste: une "action" alimentaire déguisée.
    { kind: "action", label: "Add a protein snack", rationale: "", action_kind: "snack", days: ["mon"] },
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
    { kind: "action", label: "Water", rationale: "", action_kind: "hydration", days: [] },
    { kind: "nutrition", label: "Vegetables first", rationale: "", source_belief_key: "vegetables_are_the_floor", days: [] },
  ]);
  const payload = weekPlanItemsPayload(plan);
  assertEquals(payload.find((p) => p.kind === "action")?.source_belief_key, null);
  assertEquals(payload.find((p) => p.kind === "nutrition")?.source_belief_key, "vegetables_are_the_floor");
});

// ---------------------------------------------------------------------------
// RÈGLE 4 — les deux verrous
// ---------------------------------------------------------------------------

Deno.test("a plan that contradicts the doctrine does not ship", () => {
  const plan = parse([
    {
      kind: "nutrition",
      label: "Keep lunch filling",
      rationale: "Spread it over six small meals across the day.",
      source_belief_key: "satiety_before_arithmetic",
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
        label: "Keep breakfast filling",
        rationale: "Peanut butter on your toast, for instance.",
        source_belief_key: "satiety_before_arithmetic",
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
    {
      kind: "nutrition",
      label: "Vegetables first on the plate",
      rationale: "Easy to hold at the canteen.",
      source_belief_key: "vegetables_are_the_floor",
      days: ["mon", "wed"],
    },
  ], { safetyConstraints: [PEANUT] });
  assertEquals(plan.items.length, 1);
  assert(plan.lock.reason === "clean" || plan.lock.reason.startsWith("disarmed"));
});

// ---------------------------------------------------------------------------
// L'objectif façonne l'AGENCEMENT, jamais la méthode
// ---------------------------------------------------------------------------

Deno.test("every goal has a named branch (R6)", () => {
  for (const goal of STUDENT_GOALS) {
    const f = focusFor(goal);
    assert(f.maxNutrition >= 3 && f.maxNutrition <= 5, goal);
    assert(f.emphasis.length > 0, goal);
  }
});

Deno.test("the prompt carries the convictions and forbids numbers", () => {
  const { userMessage, allowedKeys, systemPrompt } = buildWeekPlanPrompt({
    principles: PRINCIPLES,
    situation: { goal: "fat_loss", situation: "I eat at a canteen at midday", practicalConstraints: {} },
    doctrineBlock: "== MARC'S METHOD ==",
    weekStart: "2026-08-03",
  });
  assertEquals(allowedKeys.length, 3);
  assert(userMessage.includes("satiety_before_arithmetic"));
  assert(userMessage.includes("canteen"));
  assert(userMessage.includes("MARC'S METHOD"));
  // Le prompt doit dire que le coach n'a PAS écrit de plan — c'était l'erreur
  // de modèle qui rendait la génération impossible.
  assert(systemPrompt.includes("did NOT write a per-student meal plan"));
  assert(systemPrompt.includes("character for character"));
  assert(systemPrompt.includes("NEVER PUT A NUMBER ON FOOD"));
  // Le plafond de lignes voyage jusqu'au modèle, pas seulement au parseur.
  assert(userMessage.includes("maximum nutrition lines: 4"));
});

Deno.test("unknown day tokens are named, never guessed (R7)", () => {
  const plan = parse([
    { kind: "nutrition", label: "x", rationale: "", source_belief_key: "vegetables_are_the_floor", days: ["mon", "lundi", "MON"] },
  ]);
  assertEquals(plan.items[0].days, ["mon"]);
  assert(plan.issues.some((i) => i.includes("lundi")));
});

Deno.test("a non-JSON model output throws instead of shipping an empty plan", () => {
  assertThrows(() =>
    parseWeekPlan("not json at all", PRINCIPLES, {
      doctrine: null,
      safetyConstraints: [],
      maxNutrition: 4,
    })
  );
});
