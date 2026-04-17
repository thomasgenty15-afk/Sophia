import { assertEquals, assertThrows } from "jsr:@std/assert@1";

import {
  preparePlanDistribution,
  preparePlanDistributionV3,
} from "./v2-plan-distribution.ts";
import type { PlanContentV2, PlanContentV3 } from "./v2-types.ts";

function makePlanFixture(): PlanContentV2 {
  return {
    version: 2,
    cycle_id: "cycle-1",
    transformation_id: "transfo-1",
    duration_months: 2,
    title: "Réduire l'évitement",
    user_summary: "Résumé user.",
    internal_summary: "Résumé interne.",
    strategy: {
      identity_shift: "Je fais face plus tôt.",
      core_principle: "Petit pas au bon moment.",
      success_definition:
        "Traiter les sujets importants sans les repousser des semaines.",
      main_constraint: "Charge mentale variable.",
    },
    dimensions: [
      {
        id: "support",
        title: "Leviers de soutien",
        items: [
          {
            temp_id: "gen-support-001",
            dimension: "support",
            kind: "framework",
            title: "Préparer l'ouverture",
            description: "Clarifier en 3 lignes ce que je veux dire.",
            tracking_type: "boolean",
            activation_order: 1,
            activation_condition: null,
            support_mode: "recommended_now",
            support_function: "practice",
            target_reps: null,
            cadence_label: null,
            scheduled_days: null,
            time_of_day: null,
            payload: { source: "fixture" },
          },
        ],
      },
      {
        id: "missions",
        title: "Missions",
        items: [
          {
            temp_id: "gen-missions-001",
            dimension: "missions",
            kind: "task",
            title: "Envoyer le message",
            description: "Envoyer un message court aujourd'hui.",
            tracking_type: "boolean",
            activation_order: 2,
            activation_condition: {
              type: "after_item_completion",
              depends_on: ["gen-support-001"],
            },
            support_mode: null,
            support_function: null,
            target_reps: null,
            cadence_label: null,
            scheduled_days: null,
            time_of_day: "any_time",
            payload: {},
          },
        ],
      },
      {
        id: "habits",
        title: "Habitudes",
        items: [
          {
            temp_id: "gen-habits-001",
            dimension: "habits",
            kind: "habit",
            title: "Regarder mes messages à heure fixe",
            description:
              "Ouvrir la conversation à heure fixe 3 fois par semaine.",
            tracking_type: "boolean",
            activation_order: 1,
            activation_condition: { type: "immediate" },
            support_mode: null,
            support_function: null,
            target_reps: 6,
            cadence_label: "3x/semaine",
            scheduled_days: ["lundi", "mercredi", "vendredi"],
            time_of_day: "morning",
            payload: {},
          },
        ],
      },
    ],
    timeline_summary: "Ouverture puis passage à l'action.",
    metadata: {},
  };
}

function makeIdFactory(ids: string[]): () => string {
  let index = 0;
  return () => {
    const next = ids[index];
    index += 1;
    if (!next) throw new Error("Ran out of fixture IDs");
    return next;
  };
}

Deno.test("preparePlanDistribution maps temp_ids, resolves depends_on and normalizes plan items", () => {
  const prepared = preparePlanDistribution({
    userId: "user-1",
    planId: "plan-1",
    plan: makePlanFixture(),
    now: "2026-03-23T10:00:00.000Z",
    idFactory: makeIdFactory(["item-1", "item-2", "item-3"]),
  });

  assertEquals(prepared.tempIdMap, {
    "gen-support-001": "item-1",
    "gen-missions-001": "item-2",
    "gen-habits-001": "item-3",
  });

  assertEquals(prepared.items.length, 3);

  const support = prepared.items[0];
  assertEquals(support.id, "item-1");
  assertEquals(support.status, "active");
  assertEquals(support.activated_at, "2026-03-23T10:00:00.000Z");
  assertEquals(support.payload._generation, { temp_id: "gen-support-001" });

  const mission = prepared.items[1];
  assertEquals(mission.status, "pending");
  assertEquals(mission.activation_condition, {
    type: "after_item_completion",
    depends_on: ["item-1"],
  });
  assertEquals(mission.start_after_item_id, "item-1");
  assertEquals(mission.time_of_day, "anytime");

  const habit = prepared.items[2];
  assertEquals(habit.status, "active");
  assertEquals(habit.current_habit_state, "active_building");
  assertEquals(habit.current_reps, 0);
  assertEquals(habit.scheduled_days, ["mon", "wed", "fri"]);

});

Deno.test("preparePlanDistribution rejects unknown dependency temp_ids", () => {
  const plan = makePlanFixture();
  plan.dimensions[1].items[0].activation_condition = {
    type: "after_item_completion",
    depends_on: ["gen-support-999"],
  };

  assertThrows(() =>
    preparePlanDistribution({
      userId: "user-1",
      planId: "plan-1",
      plan,
      idFactory: makeIdFactory(["item-1", "item-2", "item-3"]),
    })
  );
});

Deno.test("activeAtStart uses activation_condition, not activation_order", () => {
  const plan = makePlanFixture();

  // activation_order=1 but non-immediate condition → must be pending
  plan.dimensions[0].items[0].activation_order = 1;
  plan.dimensions[0].items[0].activation_condition = {
    type: "after_milestone",
    depends_on: ["gen-missions-001"],
  };

  // activation_order=3 but null condition → must be active
  plan.dimensions[1].items[0].activation_order = 3;
  plan.dimensions[1].items[0].activation_condition = null;

  const prepared = preparePlanDistribution({
    userId: "user-1",
    planId: "plan-1",
    plan,
    now: "2026-03-23T10:00:00.000Z",
    idFactory: makeIdFactory(["item-1", "item-2", "item-3"]),
  });

  const support = prepared.items[0];
  assertEquals(
    support.status,
    "pending",
    "activation_order=1 with condition should be pending",
  );
  assertEquals(support.activated_at, null);

  const mission = prepared.items[1];
  assertEquals(
    mission.status,
    "active",
    "activation_order=3 with null condition should be active",
  );
  assertEquals(mission.activated_at, "2026-03-23T10:00:00.000Z");

  const habit = prepared.items[2];
  assertEquals(habit.status, "active", "immediate condition should be active");
  assertEquals(habit.current_habit_state, "active_building");
});

// ---------------------------------------------------------------------------
// V3 distribution tests
// ---------------------------------------------------------------------------

function makeV3Fixture(): PlanContentV3 {
  return {
    version: 3,
    cycle_id: "cycle-v3-1",
    transformation_id: "transfo-v3-1",
    duration_months: 3,
    title: "Arrêter de fumer",
    global_objective: "Sortir durablement de la cigarette.",
    user_summary: "Je veux arrêter.",
    internal_summary: "Plan progressif.",
    strategy: {
      identity_shift: "Je suis un non-fumeur.",
      core_principle: "Réduction progressive.",
      success_definition: "0 cigarette/jour.",
      main_constraint: "Stress au travail.",
    },
    inspiration_narrative: "Ton chemin vers la liberté.",
    phases: [
      {
        phase_id: "phase-1",
        phase_order: 1,
        title: "Réduction",
        rationale: "Réduire progressivement.",
        phase_objective: "Créer une première baisse crédible de l'exposition.",
        maintained_foundation: [],
        heartbeat: {
          title: "Cigarettes/jour",
          unit: "cig",
          target: 5,
          current: 10,
          tracking_mode: "manual",
        },
        items: [
          {
            temp_id: "gen-p1-habits-001",
            dimension: "habits",
            kind: "habit",
            title: "Remplacer pause clope par marche",
            description: "Marche de 5 min.",
            tracking_type: "boolean",
            activation_order: 1,
            activation_condition: { type: "immediate" },
            support_mode: null,
            support_function: null,
            target_reps: 14,
            cadence_label: "2x/jour",
            scheduled_days: null,
            time_of_day: "morning",
            payload: {},
          },
          {
            temp_id: "gen-p1-missions-001",
            dimension: "missions",
            kind: "task",
            title: "Jeter les briquets déco",
            description: "Supprimer les déclencheurs visuels.",
            tracking_type: "boolean",
            activation_order: 2,
            activation_condition: {
              type: "after_habit_traction",
              depends_on: ["gen-p1-habits-001"],
              min_completions: 3,
            },
            support_mode: null,
            support_function: null,
            target_reps: null,
            cadence_label: null,
            scheduled_days: null,
            time_of_day: null,
            payload: {},
          },
        ],
      },
      {
        phase_id: "phase-2",
        phase_order: 2,
        title: "Sevrage complet",
        rationale: "Passer à zéro.",
        phase_objective: "Stabiliser des journées sans cigarette.",
        maintained_foundation: ["Maintenir la réduction déjà engagée"],
        heartbeat: {
          title: "Jours sans fumer",
          unit: "jours",
          target: 14,
          current: 0,
          tracking_mode: "inferred",
        },
        items: [
          {
            temp_id: "gen-p2-habits-001",
            dimension: "habits",
            kind: "habit",
            title: "Respiration anti-craving",
            description: "4-7-8 breath.",
            tracking_type: "boolean",
            activation_order: 1,
            activation_condition: { type: "immediate" },
            support_mode: null,
            support_function: null,
            target_reps: 21,
            cadence_label: "3x/jour",
            scheduled_days: null,
            time_of_day: null,
            payload: {},
          },
        ],
      },
    ],
    timeline_summary: "Phase 1: réduction, Phase 2: sevrage.",
    journey_context: null,
    metadata: {},
  };
}

Deno.test("preparePlanDistributionV3 assigns phase_id and phase_order", () => {
  const prepared = preparePlanDistributionV3({
    userId: "user-v3",
    planId: "plan-v3",
    content: makeV3Fixture(),
    now: "2026-03-28T10:00:00.000Z",
    idFactory: makeIdFactory(["i-1", "i-2", "i-3"]),
  });

  assertEquals(prepared.items.length, 3);

  const phase1Items = prepared.items.filter((i) => i.phase_id === "phase-1");
  const phase2Items = prepared.items.filter((i) => i.phase_id === "phase-2");
  assertEquals(phase1Items.length, 2, "Phase 1 should have 2 items");
  assertEquals(phase2Items.length, 1, "Phase 2 should have 1 item");

  for (const item of phase1Items) {
    assertEquals(item.phase_order, 1);
  }
  for (const item of phase2Items) {
    assertEquals(item.phase_order, 2);
  }
});

Deno.test("preparePlanDistributionV3 sets phase 1 items active and phase 2+ items pending", () => {
  const prepared = preparePlanDistributionV3({
    userId: "user-v3",
    planId: "plan-v3",
    content: makeV3Fixture(),
    now: "2026-03-28T10:00:00.000Z",
    idFactory: makeIdFactory(["i-1", "i-2", "i-3"]),
  });

  const habit1 = prepared.items.find((i) => i.title === "Remplacer pause clope par marche")!;
  assertEquals(habit1.status, "active", "Phase 1 immediate item should be active");
  assertEquals(habit1.activated_at, "2026-03-28T10:00:00.000Z");

  const mission1 = prepared.items.find((i) => i.title === "Jeter les briquets déco")!;
  assertEquals(mission1.status, "pending", "Phase 1 item with condition should be pending");

  const habit2 = prepared.items.find((i) => i.title === "Respiration anti-craving")!;
  assertEquals(habit2.status, "pending", "Phase 2 item should be forced pending even with immediate condition");
  assertEquals(habit2.activated_at, null, "Phase 2 item should not have activated_at");
});

Deno.test("preparePlanDistributionV3 resolves intra-phase depends_on", () => {
  const prepared = preparePlanDistributionV3({
    userId: "user-v3",
    planId: "plan-v3",
    content: makeV3Fixture(),
    now: "2026-03-28T10:00:00.000Z",
    idFactory: makeIdFactory(["i-1", "i-2", "i-3"]),
  });

  const mission = prepared.items.find((i) => i.title === "Jeter les briquets déco")!;
  assertEquals(
    (mission.activation_condition as Record<string, unknown>)?.depends_on,
    ["i-1"],
    "depends_on should be resolved from temp_id to real id",
  );
});

Deno.test("preparePlanDistributionV3 maps temp_ids correctly", () => {
  const prepared = preparePlanDistributionV3({
    userId: "user-v3",
    planId: "plan-v3",
    content: makeV3Fixture(),
    idFactory: makeIdFactory(["aa", "bb", "cc"]),
  });

  assertEquals(prepared.tempIdMap, {
    "gen-p1-habits-001": "aa",
    "gen-p1-missions-001": "bb",
    "gen-p2-habits-001": "cc",
  });
});

Deno.test("preparePlanDistributionV3 rejects empty planId", () => {
  assertThrows(() =>
    preparePlanDistributionV3({
      userId: "user-v3",
      planId: "",
      content: makeV3Fixture(),
    })
  );
});

Deno.test("preparePlanDistributionV3 rejects invalid phase_order", () => {
  const content = makeV3Fixture();
  content.phases[0].phase_order = 0;
  assertThrows(() =>
    preparePlanDistributionV3({
      userId: "user-v3",
      planId: "plan-v3",
      content,
    })
  );
});
