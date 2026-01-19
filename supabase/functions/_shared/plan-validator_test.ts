import { assertEquals, assertThrows } from "std/testing/asserts.ts";
import { validatePlan } from "./plan-validator.ts";

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
            tracking_type: "boolean",
            time_of_day: "night",
            targetReps: 7,
          },
          {
            id: "a2",
            type: "mission",
            title: "Préparer la chambre",
            description: "Rendre la chambre propice au sommeil.",
            tracking_type: "boolean",
            time_of_day: "evening",
          },
          {
            id: "a3",
            type: "framework",
            title: "Journal de décharge mentale",
            description: "Écrire 3 points qui tournent en boucle.",
            tracking_type: "boolean",
            time_of_day: "night",
            targetReps: 3,
            frameworkDetails: {
              type: "recurring",
              intro: "Vide ta RAM mentale avant de dormir.",
              sections: [{ id: "s1", label: "Ce qui tourne en boucle", inputType: "textarea", placeholder: "Je pense à..." }],
            },
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
            tracking_type: "boolean",
            time_of_day: "morning",
            targetReps: 7,
          },
          {
            id: "b2",
            type: "mission",
            title: "Préparer une routine du soir",
            tracking_type: "boolean",
            time_of_day: "evening",
          },
          {
            id: "b3",
            type: "framework",
            title: "Bilan de mi-parcours",
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
            tracking_type: "boolean",
            time_of_day: "afternoon",
            targetReps: 7,
          },
          {
            id: "c2",
            type: "mission",
            title: "Optimiser l'environnement",
            tracking_type: "boolean",
            time_of_day: "any_time",
          },
          {
            id: "c3",
            type: "framework",
            title: "Plan anti-obstacle",
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
            tracking_type: "boolean",
            time_of_day: "morning",
            targetReps: 7,
          },
          {
            id: "d2",
            type: "mission",
            title: "Planifier la suite",
            tracking_type: "boolean",
            time_of_day: "any_time",
          },
          {
            id: "d3",
            type: "framework",
            title: "Contrat d'engagement",
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

Deno.test("validatePlan: rejette une action sans tracking_type", () => {
  const badPlan: any = {
    grimoireTitle: "X",
    strategy: "Y",
    identity: "I",
    deepWhy: "W",
    goldenRules: "G",
    vitalSignal: { name: "KPI", type: "number" },
    maintenanceCheck: { question: "Q", frequency: "weekly", type: "reflection" },
    estimatedDuration: "4 semaines",
    phases: [
      {
        id: "1",
        title: "Phase",
        actions: [
          {
            id: "a1",
            type: "habitude",
            title: "Action sans tracking",
            time_of_day: "morning",
            // tracking_type manquant
          },
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
    estimatedDuration: "4 semaines",
    phases: [
      {
        id: "1",
        title: "Phase",
        actions: [
          {
            id: "a1",
            type: "habitude",
            title: "Action",
            tracking_type: "boolean",
            time_of_day: "midnight", // invalide
          },
        ],
      },
    ],
  };

  assertThrows(() => validatePlan(badPlan));
});


