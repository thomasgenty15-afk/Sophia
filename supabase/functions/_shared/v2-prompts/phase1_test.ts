import { assert } from "jsr:@std/assert@1";

import { buildPhase1StoryUserPrompt, PHASE1_STORY_SYSTEM_PROMPT } from "./phase1.ts";

Deno.test("PHASE1_STORY_SYSTEM_PROMPT forbids invented act framing", () => {
  assert(
    PHASE1_STORY_SYSTEM_PROMPT.includes('n\'écris jamais "voyage en 3 actes"'),
    "Missing explicit prohibition against invented three-act framing",
  );
  assert(
    PHASE1_STORY_SYSTEM_PROMPT.includes("1/2 ou 2/2"),
    "Missing explicit two-part continuity rule",
  );
});

Deno.test("buildPhase1StoryUserPrompt exposes exact plan levels and only two-part continuity", () => {
  const prompt = buildPhase1StoryUserPrompt({
    context: {
      transformation_title: "Atteindre un poids de forme",
      transformation_summary: "Retrouver un rapport plus stable au poids.",
      focus_context: "Contexte focal.",
      questionnaire_context: null,
      user_first_name: "VV",
      user_age: 58,
      user_gender: "male",
      phase_1_objective: "Stabiliser les soirées",
      phase_1_heartbeat: "Moins de craquages du soir",
      plan_levels_count: 5,
      success_definition: "Retrouver un poids stable",
      main_constraint: "Fatigue du soir",
      inspiration_narrative: null,
      journey_part_number: 1,
      journey_total_parts: 2,
      journey_continuation_hint: "Cette transformation ouvre la première partie d'un parcours en 2 parties.",
      previous_completed_transformation: null,
    },
    deepWhyAnswers: [],
    detailsAnswer: null,
  });

  assert(prompt.includes("Nombre exact de niveaux dans le plan de cette transformation: 5"));
  assert(prompt.includes("Découpage multi-parties de la transformation: 1 / 2"));
  assert(!prompt.includes("3 actes"));
});

Deno.test("buildPhase1StoryUserPrompt hides continuity framing outside a two-part split", () => {
  const prompt = buildPhase1StoryUserPrompt({
    context: {
      transformation_title: "Atteindre un poids de forme",
      transformation_summary: "Retrouver un rapport plus stable au poids.",
      focus_context: "Contexte focal.",
      questionnaire_context: null,
      user_first_name: null,
      user_age: null,
      user_gender: null,
      phase_1_objective: null,
      phase_1_heartbeat: null,
      plan_levels_count: 4,
      success_definition: null,
      main_constraint: null,
      inspiration_narrative: null,
      journey_part_number: 1,
      journey_total_parts: null,
      journey_continuation_hint: null,
      previous_completed_transformation: null,
    },
    deepWhyAnswers: [],
    detailsAnswer: null,
  });

  assert(prompt.includes("Découpage multi-parties de la transformation: Aucun decoupage en 2 parties a mentionner"));
});
