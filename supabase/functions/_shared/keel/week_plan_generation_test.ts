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
  // Les aliments déconseillés sont vérifiés par le MÊME verrou que les
  // interdits, donc la fixture les porte. `recommended` reste vide ici: un
  // aliment conseillé nommé dans un plan est le comportement attendu, jamais
  // une violation, et le test qui le prouve est plus bas.
  foods: {
    recommended: [],
    discouraged: [
      {
        term: "seed oil",
        surfaceForms: ["seed oils", "sunflower oil", "rapeseed oil"],
        reason: "he cooks with butter and olive oil, nothing else",
      },
    ],
  },
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

Deno.test("numeric guard — energy_unit: the plural and the spelled-out prefix", () => {
  // Ces trois-là traversaient. `kcal` n'avait pas de `s?` (l'alternance
  // matchait « Kcal » puis butait sur le `\b` devant le « s »), et
  // `cal(?:orie)?` ne rattrape pas un préfixe `kilo`. Un chiffre que personne
  // n'a mesuré arrivait à l'élève avec l'autorité du coach.
  assertEquals(findNumericTarget("roughly 1800 Kcals"), "energy_unit");
  assertEquals(findNumericTarget("1800 kilocalories a day"), "energy_unit");
  assertEquals(findNumericTarget("2000 kilojoules"), "energy_unit");
  // Et le contre-test: une masse corporelle en kilos n'est pas une énergie.
  assertEquals(findNumericTarget("2 kilos of vegetables for the week"), null);
  assertEquals(findNumericTarget("Take 10 calm minutes before dinner"), null);
});

Deno.test("numeric guard — macro_percentage knows the SAME macros as its siblings", () => {
  // `fibre|fiber` étaient dans les deux motifs de masse et absentes de celui-ci:
  // « protein 30% » était rejeté, « fibre 20% » passait. Trois listes écrites à
  // la main, dont une seule avait reçu l'ajout.
  assertEquals(findNumericTarget("fibre 20%"), "macro_percentage");
  assertEquals(findNumericTarget("fiber 30%"), "macro_percentage");
  assertEquals(findNumericTarget("fibre at 25 %"), "macro_percentage");
});

Deno.test("numeric guard — a VOLUME is a portion, never a macro target", () => {
  // FAUX POSITIF mesuré: `l` (litre) figurait parmi les unités de macro, et
  // `macro_quantity_reversed` mordait sur une ligne d'hydratation parfaitement
  // légitime dès qu'un mot de macro traînait dans les 20 caractères. Une cible
  // de macro s'écrit en grammes ou en pourcents; jamais en litres.
  //
  // Ce faux positif est le pire des deux: la ligne est retirée du plan en
  // silence, et personne ne voit manquer une ligne qui n'a jamais existé.
  for (
    const ok of [
      "Swap the sugary drink for 1 l of water",
      "Cut the sugar, and drink 2 l of water",
      "Less sugar, more water: 2 l a day",
      "Trade the fat-heavy sauce for 1 l of broth",
    ]
  ) {
    assertEquals(findNumericTarget(ok), null, ok);
  }
  // Le côté faux négatif du même resserrement: les masses mordent toujours.
  assertEquals(findNumericTarget("40 g of sugar a day"), "macro_quantity");
  assertEquals(findNumericTarget("sugar under 40 g"), "macro_quantity_reversed");
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

// --- la conviction du COACH est elle aussi du texte lu par l'élève ---------
//
// Trouvé en conditions réelles (QA agent 5, 2026-08-03) et pas en test: le
// modèle rédigeait un libellé impeccable en le rattachant à une conviction
// chiffrée, `rejected_numeric` restait vide, et l'app affichait quand même
// « 30 g of protein » / « 1800 kcal » / « 40% » dans la citation sous la ligne.
// Le filtre ne lisait que ce que SOPHIA écrit, jamais ce que le COACH a écrit.

const NUMERIC_PRINCIPLES: CoachPrinciple[] = [
  {
    belief_key: "thirty_grams_per_meal",
    claim: "Aim for 30 g of protein at every single meal.",
    rationale: null,
  },
  {
    belief_key: "vegetables_are_the_floor",
    claim: "Vegetables are the floor of a plate, not a garnish.",
    rationale: null,
  },
];

Deno.test("a conviction that CARRIES a number never reaches the student", () => {
  const plan = parseWeekPlan(
    {
      items: [{
        // Le libellé est propre: c'est tout le piège. Rien dans ce que Sophia
        // écrit ne déclenche le filtre d'origine.
        kind: "nutrition",
        label: "Build each meal around a solid protein anchor",
        rationale: "It keeps the day from being a negotiation.",
        source_belief_key: "thirty_grams_per_meal",
        days: ["mon"],
      }],
    },
    NUMERIC_PRINCIPLES,
    { doctrine: DOCTRINE, safetyConstraints: [], maxNutrition: 4 },
  );
  assertEquals(plan.items, []);
  assertEquals(plan.rejected_numeric, ["source_claim:macro_quantity"]);
  assert(plan.issues.some((i) => i.includes("thirty_grams_per_meal")));
});

Deno.test("the numeric conviction is dropped, the clean ones beside it survive", () => {
  // Le rejet est CHIRURGICAL: il ne coûte pas au plan les lignes qui n'ont
  // rien à se reprocher. Sans ce test, la garde pourrait vider tout un plan
  // parce qu'une seule conviction du coach porte un chiffre.
  const plan = parseWeekPlan(
    {
      items: [
        {
          kind: "nutrition",
          label: "Build each meal around an anchor",
          rationale: "",
          source_belief_key: "thirty_grams_per_meal",
          days: ["mon"],
        },
        {
          kind: "nutrition",
          label: "Put vegetables down first",
          rationale: "",
          source_belief_key: "vegetables_are_the_floor",
          days: ["tue"],
        },
      ],
    },
    NUMERIC_PRINCIPLES,
    { doctrine: DOCTRINE, safetyConstraints: [], maxNutrition: 4 },
  );
  assertEquals(plan.items.length, 1);
  assertEquals(plan.items[0].source_belief_key, "vegetables_are_the_floor");
  assertEquals(plan.rejected_numeric, ["source_claim:macro_quantity"]);
});

Deno.test("DISARMED: convictions with no number are left completely alone", () => {
  // Le test prémisse-fausse (P9). Une ceinture qui mord quand le problème
  // n'existe pas est une ceinture qu'on débranche dans la semaine.
  const plan = parse([
    {
      kind: "nutrition",
      label: "Put vegetables down before anything else",
      rationale: "It settles the plate without any counting.",
      source_belief_key: "vegetables_are_the_floor",
      days: ["mon", "thu"],
    },
  ]);
  assertEquals(plan.items.length, 1);
  assertEquals(plan.rejected_numeric, []);
  assertEquals(plan.issues, []);
  // Et la citation voyage intacte: la provenance reste affichable.
  assertEquals(
    plan.items[0].source_belief_claim,
    "Vegetables are the floor of a plate, not a garnish.",
  );
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
    situation: {
      goal: "fat_loss",
      situation: "I eat at a canteen at midday",
      context: "I have a wedding on Tuesday",
      practicalConstraints: {},
    },
    doctrineBlock: "== MARC'S METHOD ==",
    weekStart: "2026-08-03",
    safetyConstraints: null,
  });
  assertEquals(allowedKeys.length, 3);
  assert(userMessage.includes("satiety_before_arithmetic"));
  // La situation STABLE et le contexte DATÉ arrivent dans deux phrases
  // distinctes. Les fondre ferait traiter un mariage comme une habitude de vie
  // — et le laisserait dans le profil longtemps après le mariage.
  assert(userMessage.includes("their situation, in their words: I eat at a canteen"));
  assert(userMessage.includes("THIS WEEK: I have a wedding on Tuesday"));
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
