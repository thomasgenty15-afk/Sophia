import { validatePlan } from "./plan-validator.ts";

// NOTE: This file runs in Supabase Edge Runtime (Deno),
// but our TS linter environment may not include Deno lib typings.
declare const Deno: any;

function assertEquals(actual: unknown, expected: unknown, msg?: string) {
  if (actual !== expected) {
    throw new Error(msg ?? `assertEquals failed: expected=${String(expected)} actual=${String(actual)}`);
  }
}

function assertThrows(fn: () => unknown, msg?: string) {
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  if (!threw) {
    throw new Error(msg ?? "assertThrows failed: function did not throw");
  }
}

Deno.test("validatePlan: accepte un plan valide", () => {
  const goodPlan = {
    grimoireTitle: "Le Protocole Phénix",
    strategy: "Approche progressive et durable.",
    sophiaKnowledge: "Utilisateur motivé, manque de structure.",
    context_problem: "Contexte initial court.",
    identity: "Je suis quelqu'un qui tient ses engagements.",
    deepWhy: "Retrouver de l'énergie et de la clarté.",
    goldenRules: "1) Petit pas. 2) Régularité. 3) Pas de perfection.",
    vitalSignal: {
      name: "Sommeil (heures)",
      unit: "h",
      type: "number",
      tracking_type: "counter",
    },
    maintenanceCheck: {
      question: "Est-ce que je reste aligné ?",
      frequency: "weekly",
      type: "reflection",
    },
    estimatedDuration: "2 mois",
    phases: [
      {
        id: "1",
        title: "Stabilisation",
        actions: [
          {
            id: "a1",
            type: "habitude",
            title: "Couvre-feu digital",
            description: "Couper les écrans 30 min avant de dormir.",
            questType: "main",
            tracking_type: "boolean",
            time_of_day: "night",
            targetReps: 6,
          },
          {
            id: "a2",
            type: "mission",
            title: "Préparer la chambre",
            description: "Rendre la chambre propice au sommeil.",
            questType: "side",
            tracking_type: "boolean",
            time_of_day: "evening",
          },
        ],
      },
      {
        id: "2",
        title: "Ancrage",
        actions: [
          {
            id: "b1",
            type: "habitude",
            title: "Lumière du matin",
            questType: "main",
            tracking_type: "boolean",
            time_of_day: "morning",
            targetReps: 6,
          },
          {
            id: "b2",
            type: "framework",
            title: "Bilan de mi-parcours",
            questType: "side",
            tracking_type: "boolean",
            time_of_day: "any_time",
            targetReps: 1,
            frameworkDetails: {
              type: "one_shot",
              intro: "Évalue ce qui marche et ce qui coince.",
              sections: [{ id: "s1", label: "Ce qui marche", inputType: "textarea", placeholder: "..." }],
            },
          },
        ],
      },
      {
        id: "3",
        title: "Consolidation",
        actions: [
          {
            id: "c1",
            type: "habitude",
            title: "Cohérence cardiaque",
            questType: "main",
            tracking_type: "boolean",
            time_of_day: "afternoon",
            targetReps: 6,
          },
          {
            id: "c2",
            type: "framework",
            title: "Plan anti-obstacle",
            questType: "side",
            tracking_type: "boolean",
            time_of_day: "any_time",
            targetReps: 1,
            frameworkDetails: {
              type: "one_shot",
              intro: "Prépare des réponses simples aux obstacles.",
              sections: [{ id: "s1", label: "Obstacle → réponse", inputType: "categorized_list", placeholder: "Obstacle...|Réponse..." }],
            },
          },
        ],
      },
      {
        id: "4",
        title: "Autonomie",
        actions: [
          {
            id: "d1",
            type: "habitude",
            title: "Heure fixe de réveil",
            questType: "main",
            tracking_type: "boolean",
            time_of_day: "morning",
            targetReps: 6,
          },
          {
            id: "d2",
            type: "framework",
            title: "Contrat d'engagement",
            questType: "side",
            tracking_type: "boolean",
            time_of_day: "any_time",
            targetReps: 1,
            frameworkDetails: {
              type: "one_shot",
              intro: "Écris ton engagement minimaliste pour tenir sur la durée.",
              sections: [{ id: "s1", label: "Mon engagement", inputType: "textarea", placeholder: "Je m'engage à..." }],
            },
          },
        ],
      },
    ],
  };

  const parsed = validatePlan(goodPlan);
  assertEquals(parsed.grimoireTitle, "Le Protocole Phénix");
  // Default safety: si tracking_type absent sur vitalSignal, il serait "counter".
  assertEquals(parsed.vitalSignal.tracking_type, "counter");
});

Deno.test("validatePlan: rejette une phase sans 1 main + 1 side", () => {
  const badPlan: any = {
    grimoireTitle: "X",
    strategy: "Y",
    identity: "I",
    deepWhy: "W",
    goldenRules: "G",
    vitalSignal: { name: "KPI", type: "number" },
    maintenanceCheck: { question: "Q", frequency: "weekly", type: "reflection" },
    estimatedDuration: "2 mois",
    phases: [
      {
        id: "1",
        title: "Phase 1",
        actions: [
          { id: "a1", type: "habitude", title: "A", questType: "main", tracking_type: "boolean", time_of_day: "night", targetReps: 4 },
          { id: "a2", type: "mission", title: "B", questType: "main", tracking_type: "boolean", time_of_day: "any_time" },
        ],
      },
      {
        id: "2",
        title: "Phase 2",
        actions: [
          { id: "b1", type: "habitude", title: "A", questType: "main", tracking_type: "boolean", time_of_day: "night", targetReps: 5 },
          { id: "b2", type: "mission", title: "B", questType: "side", tracking_type: "boolean", time_of_day: "any_time" },
        ],
      },
      {
        id: "3",
        title: "Phase 3",
        actions: [
          { id: "c1", type: "habitude", title: "A", questType: "main", tracking_type: "boolean", time_of_day: "night", targetReps: 6 },
          { id: "c2", type: "mission", title: "B", questType: "side", tracking_type: "boolean", time_of_day: "any_time" },
        ],
      },
      {
        id: "4",
        title: "Phase 4",
        actions: [
          { id: "d1", type: "habitude", title: "A", questType: "main", tracking_type: "boolean", time_of_day: "night", targetReps: 6 },
          { id: "d2", type: "mission", title: "B", questType: "side", tracking_type: "boolean", time_of_day: "any_time" },
        ],
      },
    ],
  };
  assertThrows(() => validatePlan(badPlan));
});

Deno.test("validatePlan: rejette une action sans tracking_type", () => {
  const badPlan: any = {
    grimoireTitle: "X",
    strategy: "Y",
    identity: "I",
    deepWhy: "W",
    goldenRules: "G",
    vitalSignal: { name: "KPI", type: "number" },
    maintenanceCheck: { question: "Q", frequency: "weekly", type: "reflection" },
    estimatedDuration: "2 mois",
    phases: [
      {
        id: "1",
        title: "Phase",
        actions: [
          {
            id: "a1",
            type: "habitude",
            title: "Action sans tracking",
            questType: "main",
            time_of_day: "morning",
            // tracking_type manquant
            targetReps: 4,
          },
          {
            id: "a2",
            type: "mission",
            title: "Side",
            questType: "side",
            tracking_type: "boolean",
            time_of_day: "any_time",
          },
        ],
      },
      {
        id: "2",
        title: "Phase",
        actions: [
          { id: "b1", type: "habitude", title: "A", questType: "main", tracking_type: "boolean", time_of_day: "night", targetReps: 5 },
          { id: "b2", type: "mission", title: "B", questType: "side", tracking_type: "boolean", time_of_day: "any_time" },
        ],
      },
      {
        id: "3",
        title: "Phase",
        actions: [
          { id: "c1", type: "habitude", title: "A", questType: "main", tracking_type: "boolean", time_of_day: "night", targetReps: 6 },
          { id: "c2", type: "mission", title: "B", questType: "side", tracking_type: "boolean", time_of_day: "any_time" },
        ],
      },
      {
        id: "4",
        title: "Phase",
        actions: [
          { id: "d1", type: "habitude", title: "A", questType: "main", tracking_type: "boolean", time_of_day: "night", targetReps: 6 },
          { id: "d2", type: "mission", title: "B", questType: "side", tracking_type: "boolean", time_of_day: "any_time" },
        ],
      },
    ],
  };

  assertThrows(() => validatePlan(badPlan));
});

Deno.test("validatePlan: rejette un time_of_day invalide", () => {
  const badPlan: any = {
    grimoireTitle: "X",
    strategy: "Y",
    identity: "I",
    deepWhy: "W",
    goldenRules: "G",
    vitalSignal: { name: "KPI", type: "number" },
    maintenanceCheck: { question: "Q", frequency: "weekly", type: "reflection" },
    estimatedDuration: "2 mois",
    phases: [
      {
        id: "1",
        title: "Phase",
        actions: [
          {
            id: "a1",
            type: "habitude",
            title: "Action",
            questType: "main",
            tracking_type: "boolean",
            time_of_day: "midnight", // invalide
            targetReps: 4,
          },
          {
            id: "a2",
            type: "mission",
            title: "Side",
            questType: "side",
            tracking_type: "boolean",
            time_of_day: "any_time",
          },
        ],
      },
      {
        id: "2",
        title: "Phase",
        actions: [
          { id: "b1", type: "habitude", title: "A", questType: "main", tracking_type: "boolean", time_of_day: "night", targetReps: 5 },
          { id: "b2", type: "mission", title: "B", questType: "side", tracking_type: "boolean", time_of_day: "any_time" },
        ],
      },
      {
        id: "3",
        title: "Phase",
        actions: [
          { id: "c1", type: "habitude", title: "A", questType: "main", tracking_type: "boolean", time_of_day: "night", targetReps: 6 },
          { id: "c2", type: "mission", title: "B", questType: "side", tracking_type: "boolean", time_of_day: "any_time" },
        ],
      },
      {
        id: "4",
        title: "Phase",
        actions: [
          { id: "d1", type: "habitude", title: "A", questType: "main", tracking_type: "boolean", time_of_day: "night", targetReps: 6 },
          { id: "d2", type: "mission", title: "B", questType: "side", tracking_type: "boolean", time_of_day: "any_time" },
        ],
      },
    ],
  };

  assertThrows(() => validatePlan(badPlan));
});


