import { assertEquals } from "jsr:@std/assert@1";

import {
  type NextLevelGenerationPatch,
  validateNextLevelGenerationPatch,
} from "./v2-next-level-generation.ts";
import type { PlanBlueprintLevel } from "./v2-types.ts";

const expectedNextBlueprint: PlanBlueprintLevel = {
  phase_id: "phase-2",
  level_order: 2,
  title: "Intégrer des jours complets sans consommation",
  intention: "Passer de la réduction quotidienne à des jours off.",
  estimated_duration_weeks: 2,
  preview_summary: "Installer des journées sans cannabis.",
};

function makePatch(
  overrides: Partial<NextLevelGenerationPatch> = {},
): NextLevelGenerationPatch {
  return {
    decision: "keep",
    decision_reason: "La suite reste cohérente.",
    next_level: {
      phase_id: "phase-2",
      level_order: 2,
      title: "Intégrer des jours off",
      phase_objective: "Installer deux jours sans consommation.",
      rationale: "Le sas du soir rend maintenant possible un premier jour off.",
      what_this_phase_targets:
        "Le passage d'un délai le soir à une journée complète.",
      why_this_now: "Le niveau précédent a créé assez de friction.",
      how_this_phase_works: "On prépare puis teste des journées sans cannabis.",
      duration_weeks: 2,
      phase_metric_target: "2 jours sans consommation par semaine.",
      maintained_foundation: ["Garder le sas de décompression"],
      heartbeat: {
        title: "Jours sans consommation",
        unit: "jours/semaine",
        current: null,
        target: 2,
        tracking_mode: "manual",
      },
      items: [
        {
          temp_id: "gen-p2-missions-001",
          dimension: "missions",
          kind: "task",
          title: "Choisir le premier jour off",
          description: "Choisis un jour précis et prépare ta soirée.",
          tracking_type: "boolean",
          activation_order: 1,
          activation_condition: null,
          support_mode: null,
          support_function: null,
          target_reps: null,
          cadence_label: null,
          scheduled_days: null,
          time_of_day: "anytime",
          payload: {},
        },
        {
          temp_id: "gen-p2-missions-002",
          dimension: "missions",
          kind: "task",
          title: "Préparer le deuxième jour off",
          description: "Prépare une activité simple pour le second jour.",
          tracking_type: "boolean",
          activation_order: 2,
          activation_condition: null,
          support_mode: null,
          support_function: null,
          target_reps: null,
          cadence_label: null,
          scheduled_days: null,
          time_of_day: "anytime",
          payload: {},
        },
        {
          temp_id: "gen-p2-habits-001",
          dimension: "habits",
          kind: "habit",
          title: "Faire une soirée sans cannabis",
          description: "Tiens une soirée complète sans fumer.",
          tracking_type: "boolean",
          activation_order: 3,
          activation_condition: null,
          support_mode: null,
          support_function: null,
          target_reps: 2,
          cadence_label: "2 soirs / semaine",
          scheduled_days: null,
          time_of_day: "evening",
          payload: {},
        },
      ],
      weeks: [
        {
          week_order: 1,
          title: "Premier jour off",
          focus: "Préparer puis tester un premier jour.",
          weekly_target_value: 1,
          weekly_target_label: "1 jour sans consommation",
          progression_note: "On commence simple.",
          action_focus: ["Choisir le jour", "Tenir la soirée"],
          item_assignments: [
            { temp_id: "gen-p2-missions-001" },
            { temp_id: "gen-p2-habits-001", weekly_reps: 1 },
          ],
          reps_summary: "1 jour off",
          mission_days: [],
          success_signal: "Un jour sans consommation est passé.",
          status: "current",
        },
        {
          week_order: 2,
          title: "Deuxième jour off",
          focus: "Ajouter un second jour.",
          weekly_target_value: 2,
          weekly_target_label: "2 jours sans consommation",
          progression_note: "On consolide.",
          action_focus: ["Préparer le second jour", "Tenir deux soirs"],
          item_assignments: [
            { temp_id: "gen-p2-missions-002" },
            { temp_id: "gen-p2-habits-001", weekly_reps: 2 },
          ],
          reps_summary: "2 jours off",
          mission_days: [],
          success_signal: "Deux jours sans consommation sont passés.",
          status: "upcoming",
        },
      ],
      review_focus: ["Les jours off ont-ils été tenables ?"],
    },
    future_blueprint_levels: [
      {
        phase_id: "phase-3",
        level_order: 3,
        title: "Gérer le stress à vide",
        intention: "Traverser les journées stressantes sans cannabis.",
        estimated_duration_weeks: 3,
        preview_summary: "Réduire l'usage dans les moments difficiles.",
      },
    ],
    continuity_notes: {
      kept_from_previous_level: ["Le sas reste une base."],
      changed_because_of_review: ["Le niveau suivant reste progressif."],
      protected_global_logic: [
        "L'objectif des jours sans consommation reste central.",
      ],
    },
    ...overrides,
  };
}

function validate(patch: unknown) {
  return validateNextLevelGenerationPatch(patch, {
    currentLevelOrder: 1,
    completedPhaseId: "phase-1",
    expectedNextBlueprint,
    existingCompletedTempIds: ["gen-p1-missions-001", "gen-p1-habits-001"],
    globalObjective: "Atteindre 0 jour de consommation par semaine.",
  });
}

Deno.test("validateNextLevelGenerationPatch accepts a valid next-level patch", () => {
  assertEquals(validate(makePatch()).valid, true);
});

Deno.test("validateNextLevelGenerationPatch rejects completed-level temp ids", () => {
  const patch = makePatch();
  patch.next_level.items[0].temp_id = "gen-p1-missions-001";
  const result = validate(patch);
  assertEquals(result.valid, false);
  assertEquals(result.issues.some((issue) => issue.includes("gen-p2-")), true);
});

Deno.test("validateNextLevelGenerationPatch rejects unknown week assignment ids", () => {
  const patch = makePatch();
  patch.next_level.weeks[0].item_assignments = [
    { temp_id: "gen-p2-missions-999" },
    { temp_id: "gen-p2-habits-001" },
  ];
  const result = validate(patch);
  assertEquals(result.valid, false);
  assertEquals(
    result.issues.some((issue) => issue.includes("unknown temp_id")),
    true,
  );
});

Deno.test("validateNextLevelGenerationPatch rejects duplicated non-habit weekly assignments", () => {
  const patch = makePatch();
  patch.next_level.weeks[1].item_assignments = [
    { temp_id: "gen-p2-missions-001" },
    { temp_id: "gen-p2-habits-001", weekly_reps: 2 },
  ];
  const result = validate(patch);
  assertEquals(result.valid, false);
  assertEquals(
    result.issues.some((issue) =>
      issue.includes("duplicated across multiple weeks")
    ),
    true,
  );
});

Deno.test("validateNextLevelGenerationPatch rejects invalid time_of_day values", () => {
  const patch = makePatch();
  patch.next_level.items[2].time_of_day = "all_day";
  const result = validate(patch);
  assertEquals(result.valid, false);
  assertEquals(
    result.issues.some((issue) => issue.includes("time_of_day")),
    true,
  );
});

Deno.test("validateNextLevelGenerationPatch rejects DB enum-incompatible item fields", () => {
  const patch = makePatch();
  patch.next_level.items[0].kind = "mission" as never;
  patch.next_level.items[1].tracking_type = "checkbox" as never;
  patch.next_level.items[2].support_mode = "always_on" as never;

  const result = validate(patch);

  assertEquals(result.valid, false);
  assertEquals(
    result.issues.some((issue) => issue.includes(".kind must be one of")),
    true,
  );
  assertEquals(
    result.issues.some((issue) =>
      issue.includes(".tracking_type must be one of")
    ),
    true,
  );
  assertEquals(
    result.issues.some((issue) => issue.includes(".support_mode must be null")),
    true,
  );
});
