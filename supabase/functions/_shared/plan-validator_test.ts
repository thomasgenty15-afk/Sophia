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
    estimatedDuration: "8 semaines",
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


