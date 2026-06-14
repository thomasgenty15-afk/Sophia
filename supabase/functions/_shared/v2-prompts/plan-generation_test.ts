import { assert } from "jsr:@std/assert@1";

import {
  buildPlanGenerationV3UserPrompt,
  PLAN_GENERATION_V3_SYSTEM_PROMPT,
  type PlanGenerationInput,
} from "./plan-generation.ts";

function makePlanGenerationInput(
  overrides: Partial<PlanGenerationInput> = {},
): PlanGenerationInput {
  return {
    cycle_id: "cycle-1",
    transformation_id: "transformation-1",
    title: "Retrouver un sommeil stable",
    internal_summary:
      "La personne veut stabiliser son sommeil sans se mettre une pression irréaliste.",
    user_summary:
      "Tu veux retrouver des nuits plus régulières sans transformer chaque réveil raté en échec.",
    success_definition: "Se réveiller plus régulièrement avec moins de dette de sommeil.",
    main_constraint: "La fatigue actuelle rend les grands changements difficiles.",
    questionnaire_answers: {},
    questionnaire_schema: null,
    struggle_duration: "Depuis plusieurs mois",
    starting_point: "Réveil très irrégulier",
    main_blocker: "Coucher tardif et fatigue accumulée",
    priority_goal: "Me réveiller plus tôt sans m'épuiser",
    perceived_difficulty: "Difficile",
    probable_drivers: "Rythme de sommeil décalé",
    prior_attempts: "Essais de réveil très tôt abandonnés après une nuit courte",
    self_confidence: 2,
    success_indicator: "4 réveils plus réguliers par semaine",
    metric_label: "Réveils à heure cible",
    metric_unit: "réveils/semaine",
    metric_direction: "increase",
    metric_measurement_mode: "count",
    metric_baseline_value: null,
    metric_target_value: null,
    metric_baseline_text: "1 réveil régulier par semaine",
    metric_target_text: "4 réveils réguliers par semaine",
    previous_plan_preview: null,
    previous_transformation_title: null,
    previous_transformation_summary: null,
    previous_transformation_success_definition: null,
    previous_transformation_completion_summary: null,
    previous_transformation_questionnaire_answers: null,
    previous_transformation_questionnaire_schema: null,
    previous_transformation_plan_preview: null,
    journey_part_number: null,
    journey_total_parts: null,
    journey_continuation_hint: null,
    regeneration_feedback: null,
    system_validation_feedback: null,
    plan_type_classification: null,
    user_requested_pace: "normal",
    duration_months: 2,
    user_age: 32,
    user_gender: null,
    user_timezone: "Europe/Paris",
    user_local_date: "2026-06-14",
    user_local_human: "dimanche 14 juin 2026 à 15:30",
    user_local_datetime: "2026-06-14T15:30:00",
    user_local_time: "15:30:00",
    user_local_hour: 15,
    user_day_part: "afternoon",
    anchor_week_start: "2026-06-08",
    anchor_week_end: "2026-06-14",
    days_remaining_in_anchor_week: 1,
    is_partial_anchor_week: true,
    ...overrides,
  };
}

Deno.test("PLAN_GENERATION_V3_SYSTEM_PROMPT guards against impossible same-day wake actions", () => {
  assert(
    PLAN_GENERATION_V3_SYSTEM_PROMPT.includes(
      'ne demande jamais de "se lever tôt aujourd\'hui"',
    ),
    "Missing explicit guard against same-day early wake actions after the wake window has passed",
  );
});

Deno.test("buildPlanGenerationV3UserPrompt exposes local time and same-day feasibility rules", () => {
  const prompt = buildPlanGenerationV3UserPrompt(makePlanGenerationInput());

  assert(prompt.includes("- Date-heure locale actuelle : 2026-06-14T15:30:00"));
  assert(prompt.includes("- Heure locale actuelle : 15:30:00"));
  assert(prompt.includes("- Moment de la journée : afternoon"));
  assert(
    prompt.includes(
      "si une action de démarrage serait impossible aujourd'hui parce que son bon créneau est passé, fais commencer cette action demain",
    ),
    "Missing explicit tomorrow-start rule when today's action window has passed",
  );
});
