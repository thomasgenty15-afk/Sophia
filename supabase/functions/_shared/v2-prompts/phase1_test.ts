import { assert } from "jsr:@std/assert@1";

import {
  buildPhase1StoryUserPrompt,
  PHASE1_STORY_SYSTEM_PROMPT,
  validatePhase1DeepWhyOutput,
} from "./phase1.ts";

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

Deno.test("validatePhase1DeepWhyOutput allows collective couple vous", () => {
  const result = validatePhase1DeepWhyOutput({
    deep_why_questions: [
      {
        id: "importance_now",
        question:
          "Qu'est-ce qui te fait dire que c'est le moment ou jamais de retrouver cette complicité dans ton couple ?",
        suggested_answers: [
          "Je sens qu'on s'éloigne et je veux protéger ce qu'on a construit ensemble.",
          "Je veux retrouver une manière plus douce de se parler au quotidien.",
        ],
      },
      {
        id: "daily_pain",
        question:
          "Comment ce climat de tension pèse-t-il concrètement sur tes journées et sur ton moral ?",
        suggested_answers: [
          "Je rentre avec la boule au ventre et ça m'épuise avant même la soirée.",
          "Je me sens seule alors qu'on partage encore la même vie.",
        ],
      },
      {
        id: "past_blocker",
        question:
          "Qu'est-ce qui a fait que tes précédentes tentatives pour apaiser les choses ont échoué ?",
        suggested_answers: [
          "J'ai peur qu'en abordant les vrais problèmes, on déclenche une crise.",
          "Je n'ai pas réussi à ouvrir le dialogue sans qu'on se braque.",
        ],
      },
      {
        id: "success_state",
        question:
          "Une fois que vous saurez désamorcer les tensions ensemble, qu'est-ce qui changera concrètement dans ton sentiment de sécurité ?",
        suggested_answers: [
          "Je me sentirais soulagée de pouvoir exprimer un désaccord sans craindre une explosion.",
          "On retrouverait des moments de rire sans que chaque mot soit pesé.",
        ],
      },
    ],
  });

  assert(result.valid, result.issues.join(", "));
});

Deno.test("validatePhase1DeepWhyOutput still rejects direct vouvoiement", () => {
  const result = validatePhase1DeepWhyOutput({
    deep_why_questions: [
      {
        id: "importance_now",
        question: "Qu'est-ce qui vous donne envie de changer maintenant ?",
        suggested_answers: [
          "Je veux retrouver de l'élan dans ma vie.",
          "Je sens que c'est important pour mon avenir.",
        ],
      },
      {
        id: "daily_pain",
        question: "Comment ce problème pèse-t-il sur tes journées ?",
        suggested_answers: [
          "Je me sens fatigué avant même de commencer.",
          "Je perds confiance quand je vois que rien ne change.",
        ],
      },
      {
        id: "past_blocker",
        question: "Qu'est-ce qui t'a bloqué dans tes tentatives précédentes ?",
        suggested_answers: [
          "J'ai manqué d'énergie au moment de tenir.",
          "Je ne savais pas par où commencer.",
        ],
      },
      {
        id: "success_state",
        question: "Qu'est-ce qui te ferait sentir vraiment soulagé une fois ce cap franchi ?",
        suggested_answers: [
          "Je me sentirais plus stable dans mon quotidien.",
          "Je pourrais avancer sans me sentir constamment en retard.",
        ],
      },
    ],
  });

  assert(!result.valid);
  assert(result.issues.some((issue) => issue.includes("question[0] must use tutoiement only")));
});
