import { assert, assertEquals } from "jsr:@std/assert@1";
import { buildPlanRow, collectAdjustmentValidationIssues } from "./index.ts";
import {
  buildPlanContentWithAdjustedLevel,
  castAdjustCurrentLevelPatch,
  validateAdjustCurrentLevelPatch,
} from "../_shared/v2-adjust-level-generation.ts";
import type { PlanContentV3 } from "../_shared/v2-types.ts";

function makeItem(args: {
  tempId: string;
  dimension: "habits" | "missions" | "clarifications";
  kind: "habit" | "task" | "framework";
  timeOfDay?: string | null;
}) {
  return {
    temp_id: args.tempId,
    dimension: args.dimension,
    kind: args.kind,
    title: `Item ${args.tempId}`,
    description: `Description de ${args.tempId}.`,
    tracking_type: "boolean",
    time_of_day: args.timeOfDay ?? null,
    support_mode: null,
    support_function: null,
    activation_order: 1,
    activation_condition: null,
    target_reps: args.dimension === "habits" ? 5 : null,
    cadence_label: args.dimension === "habits" ? "quotidien" : null,
    scheduled_days: null,
    payload: {},
  };
}

function makeWeek(args: {
  order: number;
  assignments: Array<{ temp_id: string; weekly_reps?: number }>;
  target: number;
}) {
  return {
    week_order: args.order,
    title: `Semaine ${args.order}`,
    weekly_target_value: args.target,
    weekly_target_label: `${args.target} réveils tenus`,
    progression_note: "Monter progressivement.",
    action_focus: ["Réveil à heure fixe"],
    item_assignments: args.assignments,
    reps_summary: `${args.target} fois`,
    mission_days: [],
    success_signal: "Le rythme tient.",
  };
}

function makeAdjustedLevelPatch(): Record<string, unknown> {
  return {
    decision_reason: "Recaler le niveau sur le réveil réel à 13h.",
    adjusted_level: {
      phase_id: "phase-1",
      level_order: 1,
      title: "Recaler le rythme depuis 13h",
      phase_objective: "Stabiliser un réveil à 12h30.",
      rationale: "Le user a rechuté ; on repart de la réalité actuelle.",
      what_this_phase_targets: null,
      why_this_now: null,
      how_this_phase_works: null,
      duration_weeks: 2,
      phase_metric_target: "Réveil moyen à 12h30",
      maintained_foundation: ["Le rituel de coupure du soir"],
      heartbeat: {
        title: "Réveils avant 12h30",
        unit: "réveils",
        current: null,
        target: 8,
        tracking_mode: "manual",
      },
      items: [
        makeItem({
          tempId: "gen-p1-habits-001",
          dimension: "habits",
          kind: "habit",
          timeOfDay: "morning",
        }),
        makeItem({
          tempId: "gen-p1-missions-001",
          dimension: "missions",
          kind: "task",
          timeOfDay: "evening",
        }),
        makeItem({
          tempId: "gen-p1-clarifications-001",
          dimension: "clarifications",
          kind: "framework",
        }),
      ],
      weeks: [
        makeWeek({
          order: 1,
          target: 3,
          assignments: [
            { temp_id: "gen-p1-habits-001", weekly_reps: 3 },
            { temp_id: "gen-p1-clarifications-001" },
          ],
        }),
        makeWeek({
          order: 2,
          target: 8,
          assignments: [
            { temp_id: "gen-p1-habits-001", weekly_reps: 5 },
            { temp_id: "gen-p1-missions-001" },
          ],
        }),
      ],
      review_focus: ["Le réveil à 12h30 tient-il sans épuisement ?"],
    },
    continuity_notes: {
      kept_from_previous_level: ["La même famille d'habitude de réveil"],
      changed_because_of_review: ["Point de départ recalé de 10h30 à 13h"],
      protected_global_logic: ["Objectif global 9h30 inchangé"],
    },
  };
}

const VALIDATION_CONTEXT = {
  currentLevelOrder: 1,
  currentPhaseId: "phase-1",
  globalObjective: "Retrouver un réveil stable à 9h30.",
  maxWeeks: 4,
};

Deno.test("validateAdjustCurrentLevelPatch accepts a valid adjusted level", () => {
  const result = validateAdjustCurrentLevelPatch(
    makeAdjustedLevelPatch(),
    VALIDATION_CONTEXT,
  );
  assertEquals(result.issues, []);
  assert(result.valid);
});

Deno.test("validateAdjustCurrentLevelPatch rejects a level longer than maxWeeks", () => {
  const patch = makeAdjustedLevelPatch();
  const level = patch.adjusted_level as Record<string, unknown>;
  level.duration_weeks = 6;
  const weeks = level.weeks as Array<Record<string, unknown>>;
  for (let order = 3; order <= 6; order += 1) {
    weeks.push(makeWeek({
      order,
      target: 8,
      assignments: [
        { temp_id: "gen-p1-habits-001", weekly_reps: 5 },
        { temp_id: "gen-p1-clarifications-001" },
      ],
    }));
  }
  const result = validateAdjustCurrentLevelPatch(patch, VALIDATION_CONTEXT);
  assert(!result.valid);
  assert(
    result.issues.some((issue) =>
      issue.includes("adjusted_level.duration_weeks must be <= 4")
    ),
    `expected max-weeks issue, got: ${result.issues.join(" | ")}`,
  );
});

Deno.test("validateAdjustCurrentLevelPatch requires at least one clarification", () => {
  const patch = makeAdjustedLevelPatch();
  const level = patch.adjusted_level as Record<string, unknown>;
  level.duration_weeks = 1;
  level.items = [
    makeItem({
      tempId: "gen-p1-habits-001",
      dimension: "habits",
      kind: "habit",
    }),
    makeItem({
      tempId: "gen-p1-missions-001",
      dimension: "missions",
      kind: "task",
    }),
  ];
  level.weeks = [
    makeWeek({
      order: 1,
      target: 8,
      assignments: [
        { temp_id: "gen-p1-habits-001", weekly_reps: 5 },
        { temp_id: "gen-p1-missions-001" },
      ],
    }),
  ];
  const result = validateAdjustCurrentLevelPatch(patch, VALIDATION_CONTEXT);
  assertEquals(result.issues, [
    "adjusted_level.items must include at least one clarification",
  ]);
});

Deno.test("validateAdjustCurrentLevelPatch pins the level to the current order and remaps messages", () => {
  const patch = makeAdjustedLevelPatch();
  (patch.adjusted_level as Record<string, unknown>).level_order = 2;
  const result = validateAdjustCurrentLevelPatch(patch, VALIDATION_CONTEXT);
  assert(!result.valid);
  assert(
    result.issues.some((issue) =>
      issue.includes("adjusted_level.level_order must be 1")
    ),
    `expected remapped level_order issue, got: ${result.issues.join(" | ")}`,
  );
  assert(
    result.issues.every((issue) => !issue.includes("next_level")),
    "issues must be remapped to adjusted_level wording",
  );
});

Deno.test("buildPlanContentWithAdjustedLevel replaces only the current level", () => {
  const basePlan = {
    version: 3,
    cycle_id: "cycle-1",
    transformation_id: "transfo-1",
    title: "Retrouver mon sommeil",
    global_objective: "Retrouver un réveil stable à 9h30.",
    phases: [
      {
        phase_id: "phase-1",
        phase_order: 1,
        title: "Ancien niveau 1",
        phase_objective: "Réveil à 10h.",
        rationale: "Base initiale.",
        items: [],
      },
      {
        phase_id: "phase-2",
        phase_order: 2,
        title: "Niveau 2 futur",
        phase_objective: "Réveil à 9h30.",
        rationale: "Suite du plan.",
        items: [],
      },
    ],
    plan_blueprint: {
      global_objective: "Retrouver un réveil stable à 9h30.",
      estimated_levels_count: 1,
      levels: [
        {
          phase_id: "phase-2",
          level_order: 2,
          title: "Niveau 2 futur",
          intention: "Continuer vers 9h30.",
          estimated_duration_weeks: 3,
          preview_summary: null,
          status: "upcoming",
        },
      ],
    },
    current_level_runtime: {
      phase_id: "phase-1",
      level_order: 1,
      title: "Ancien niveau 1",
    },
    metadata: { schedule_anchor: { anchor_week_start: "2026-06-29" } },
  } as unknown as PlanContentV3;

  const patch = castAdjustCurrentLevelPatch(makeAdjustedLevelPatch());
  const adjusted = buildPlanContentWithAdjustedLevel({
    basePlan,
    patch,
    adjustedAt: "2026-07-03T14:00:00.000Z",
  });

  assertEquals(adjusted.global_objective, basePlan.global_objective);
  assertEquals(adjusted.plan_blueprint, basePlan.plan_blueprint);
  assertEquals(adjusted.phases.length, 2);
  assertEquals(adjusted.phases[0].title, "Recaler le rythme depuis 13h");
  assertEquals(adjusted.phases[1], basePlan.phases[1]);
  assertEquals(adjusted.current_level_runtime?.level_order, 1);
  assertEquals(adjusted.current_level_runtime?.weeks?.[0]?.status, "current");
  assertEquals(adjusted.current_level_runtime?.weeks?.[1]?.status, "upcoming");
  const lastAdjustment = (adjusted.metadata as Record<string, unknown>)
    .last_level_adjustment as Record<string, unknown>;
  assertEquals(
    lastAdjustment.adjusted_at,
    "2026-07-03T14:00:00.000Z",
  );
  assertEquals(
    (basePlan.metadata as Record<string, unknown>).last_level_adjustment,
    undefined,
  );
});

Deno.test("collectAdjustmentValidationIssues flags an over-long adjusted current level", () => {
  const issues = collectAdjustmentValidationIssues(
    {
      current_level_runtime: {
        duration_weeks: 6,
        weeks: Array.from({ length: 6 }, (_, index) => ({
          week_order: index + 1,
        })),
      },
    },
    4,
  );
  assertEquals(issues.length, 2);
  assert(issues[0].includes("duration_weeks must be <= 4"));
  assert(issues[1].includes("at most 4 weeks"));
});

Deno.test("collectAdjustmentValidationIssues accepts a level within the cap", () => {
  const issues = collectAdjustmentValidationIssues(
    {
      current_level_runtime: {
        duration_weeks: 4,
        weeks: Array.from({ length: 4 }, (_, index) => ({
          week_order: index + 1,
        })),
      },
    },
    4,
  );
  assertEquals(issues, []);
});

Deno.test("collectAdjustmentValidationIssues ignores plans without a runtime", () => {
  assertEquals(collectAdjustmentValidationIssues({}, 4), []);
  assertEquals(collectAdjustmentValidationIssues(null, 4), []);
});

Deno.test("buildPlanRow decouples version from generation_attempts", () => {
  const plan = { cycle_id: "cy", transformation_id: "tr", title: "T" } as never;
  const args = {
    userId: "u", planId: "p", plan, now: "2026-07-03T00:00:00Z",
    status: "draft" as const, generationFeedback: null,
    generationInputSnapshot: {}, generationReason: "plan_adjustment",
  };
  // High version (102nd generation) must NOT drag generation_attempts past the
  // DB CHECK (<= 50); attempts stays the small real retry count.
  const high = buildPlanRow({ ...args, version: 102, llmAttempts: 1 });
  assertEquals(high.version, 102, "version keeps climbing (unique ordering)");
  assertEquals(high.generation_attempts, 1, "attempts = real retry count, small");
  assert(high.generation_attempts <= 50, "attempts respects the DB CHECK");

  // A genuine 2-try generation records 2, still tiny.
  assertEquals(buildPlanRow({ ...args, version: 7, llmAttempts: 2 })
    .generation_attempts, 2);

  // Defensive clamp: even an absurd attempt count is capped at 50 and floored at 1.
  assertEquals(buildPlanRow({ ...args, version: 3, llmAttempts: 999 })
    .generation_attempts, 50);
  assertEquals(buildPlanRow({ ...args, version: 3, llmAttempts: 0 })
    .generation_attempts, 1);

  // last_generation_reason default keys off version, not attempts.
  assertEquals(buildPlanRow({ ...args, version: 1, llmAttempts: 1,
    generationReason: null }).last_generation_reason, "initial_generation");
  assertEquals(buildPlanRow({ ...args, version: 2, llmAttempts: 1,
    generationReason: null }).last_generation_reason, "regeneration");
});
