import { assert, assertEquals } from "jsr:@std/assert@1";

import { extractStructuredCalibrationFields } from "./index.ts";
import { buildPlanGenerationUserPrompt } from "../_shared/v2-prompts/plan-generation.ts";
import { QUESTIONNAIRE_SYSTEM_PROMPT } from "../_shared/v2-prompts/questionnaire.ts";

function makeQuestionnaireSchema(): Record<string, unknown> {
  return {
    version: 1,
    transformation_id: "transfo-test",
    metadata: {
      design_principle: "court_adapte_utile_et_mesurable",
      measurement_hints: {
        metric_key: "weight_kg",
        metric_label: "Poids",
        unit: "kg",
        direction: "decrease",
        measurement_mode: "absolute_value",
        baseline_prompt: "Quel est ton poids actuel ?",
        target_prompt: "Quel poids veux-tu atteindre ?",
        suggested_target_value: 75,
        rationale: "Le poids est la metrique principale la plus directe ici.",
        confidence: 0.94,
      },
    },
    questions: [
      {
        id: "sys_q1",
        kind: "multiple_choice",
        question: "Qu'est-ce qui semble le plus alimenter ce sujet aujourd'hui ?",
        capture_goal: "_system_probable_drivers",
        max_selections: 2,
        options: [
          { id: "dr_1", label: "Le stress et la charge mentale" },
          { id: "dr_2", label: "La fatigue et le manque d'énergie" },
          { id: "dr_3", label: "Des habitudes déjà installées" },
          { id: "dr_4", label: "Mon environnement quotidien" },
        ],
      },
      {
        id: "sys_q2",
        kind: "number",
        question: "Quel est ton poids actuel ?",
        capture_goal: "_system_metric_baseline",
        options: [],
        allow_other: false,
        placeholder: "Entre une valeur numerique en kg",
        max_selections: null,
        unit: "kg",
      },
      {
        id: "sys_q3",
        kind: "number",
        question: "Quel poids veux-tu atteindre ?",
        capture_goal: "_system_metric_target",
        options: [],
        allow_other: false,
        placeholder: "Entre une valeur numerique en kg",
        max_selections: null,
        unit: "kg",
        suggested_value: 75,
      },
      {
        id: "q1",
        kind: "multiple_choice",
        question: "Dans quelles situations c'est le plus visible ?",
        capture_goal: "context_pattern",
        max_selections: 2,
        options: [
          { id: "ctx_1", label: "Le soir" },
          { id: "ctx_2", label: "Au travail" },
        ],
      },
      {
        id: "q2",
        kind: "multiple_choice",
        question: "Qu'est-ce qui t'aide le plus quand ça se passe mieux ?",
        capture_goal: "helpful_pattern",
        max_selections: 2,
        options: [
          { id: "help_1", label: "Quand tout est préparé" },
          { id: "help_2", label: "Quand je suis reposé" },
        ],
      },
      {
        id: "q3",
        kind: "multiple_choice",
        question: "Qu'est-ce qui te fait le plus déraper ?",
        capture_goal: "risk_context",
        max_selections: 2,
        options: [
          { id: "risk_1", label: "La faim du soir" },
          { id: "risk_2", label: "Les craquages de fatigue" },
        ],
      },
      {
        id: "sys_q4",
        kind: "multiple_choice",
        question: "Quels blocages te freinent le plus aujourd'hui ?",
        capture_goal: "_system_main_blocker",
        max_selections: 2,
        options: [
          { id: "mb_1", label: "Je craque surtout quand je suis fatigué" },
          { id: "mb_2", label: "Je manque de cadre clair" },
          { id: "mb_3", label: "Je perds vite la motivation" },
          { id: "mb_4", label: "Mon environnement me tire en arrière" },
        ],
      },
      {
        id: "sys_q5",
        kind: "multiple_choice",
        question: "Au-dela du chiffre, à quoi verras-tu que cette transformation est vraiment reussie ?",
        capture_goal: "_system_priority_goal_subjective",
        allow_other: true,
        placeholder: "Autre (si ton critère de réussite ne se trouve pas dans les choix ci-dessus)",
        max_selections: 2,
        options: [
          { id: "pg_1", label: "Retrouver un poids stable sans y penser en permanence" },
          { id: "pg_2", label: "Avoir une alimentation cadrée toute la semaine" },
          { id: "pg_3", label: "Me sentir durablement léger et en contrôle" },
          { id: "pg_4", label: "Retrouver une vraie confiance dans mon corps" },
        ],
      },
      {
        id: "sys_q6",
        kind: "single_choice",
        question: "Depuis combien de temps ton poids est un sujet ?",
        capture_goal: "_system_struggle_duration",
        options: [
          { id: "sd_1", label: "Quelques semaines" },
          { id: "sd_2", label: "Quelques mois" },
          { id: "sd_3", label: "1-2 ans" },
          { id: "sd_4", label: "Plus de 3 ans" },
          { id: "sd_5", label: "Aussi loin que je me souvienne" },
        ],
      },
      {
        id: "sys_q7",
        kind: "single_choice",
        question: "À quel point c'est difficile pour toi aujourd'hui ?",
        capture_goal: "_system_perceived_difficulty",
        options: [
          { id: "pd_1", label: "Très facile" },
          { id: "pd_2", label: "Plutôt facile" },
          { id: "pd_3", label: "Moyennement difficile" },
          { id: "pd_4", label: "Difficile" },
          { id: "pd_5", label: "Très difficile" },
        ],
      },
      {
        id: "sys_q8",
        kind: "text",
        question: "Qu'est-ce que tu as déjà mis en place aujourd'hui pour essayer de perdre du poids ?",
        capture_goal: "_system_existing_efforts",
        options: [],
        allow_other: false,
        placeholder: "Ex: meal prep, marche, suivi, règles perso",
        max_selections: null,
      },
      {
        id: "sys_q9",
        kind: "text",
        question: "Dernière vérif avant qu'on ferme le carnet d'enquête : est-ce qu'on a raté un truc important ?",
        capture_goal: "_system_open_context",
        required: false,
        options: [],
        allow_other: false,
        placeholder: "Ajoute ici tout détail utile",
        max_selections: null,
      },
    ],
  };
}

function makeAnswersById(): Record<string, unknown> {
  return {
    sys_q1: ["dr_2"],
    sys_q2: "102",
    sys_q3: "75",
    q1: ["ctx_1"],
    q2: ["help_1"],
    q3: ["risk_2"],
    sys_q4: ["mb_1"],
    sys_q5: ["pg_1"],
    sys_q6: "sd_4",
    sys_q7: "pd_5",
    sys_q8: "Je marche un peu plus et j'essaie de préparer mes repas.",
    sys_q9: "Je craque surtout quand je dors mal plusieurs jours de suite.",
  };
}

function makeAnswersByCaptureGoal(): Record<string, unknown> {
  return {
    q1: ["ctx_1"],
    q2: ["help_1"],
    q3: ["risk_2"],
    _system_metric_baseline: "102",
    _system_metric_target: "75",
    _system_struggle_duration: "Plus de 3 ans",
    _system_main_blocker: "Je craque surtout quand je suis fatigué",
    _system_priority_goal_subjective: "Retrouver un poids stable sans y penser en permanence",
    _system_perceived_difficulty: "Très difficile",
    _system_probable_drivers: "La fatigue et le manque d'énergie",
    _system_existing_efforts: "Je prépare parfois mes repas et je marche davantage.",
    _system_open_context: "Le manque de sommeil aggrave clairement le sujet.",
  };
}

Deno.test("QUESTIONNAIRE_SYSTEM_PROMPT contains all mandatory calibration questions", () => {
  const requiredCaptures = [
    "_system_metric_baseline",
    "_system_metric_target",
    "_system_struggle_duration",
    "_system_main_blocker",
    "_system_priority_goal_subjective",
    "_system_perceived_difficulty",
    "_system_probable_drivers",
    "_system_existing_efforts",
    "_system_open_context",
  ];
  for (const capture of requiredCaptures) {
    assert(
      QUESTIONNAIRE_SYSTEM_PROMPT.includes(capture),
      `Prompt is missing mandatory capture_goal: ${capture}`,
    );
  }
});

Deno.test("QUESTIONNAIRE_SYSTEM_PROMPT enforces 12 total questions with measurement fields", () => {
  assert(
    QUESTIONNAIRE_SYSTEM_PROMPT.includes("Exactement 12 questions au total"),
    "Missing exact question-count directive",
  );
  assert(
    QUESTIONNAIRE_SYSTEM_PROMPT.includes("metadata.measurement_hints"),
    "Missing measurement_hints directive",
  );
  assert(
    QUESTIONNAIRE_SYSTEM_PROMPT.includes("sys_q2 -> valeur de départ de la métrique principale"),
    "Missing metric baseline question directive",
  );
  assert(
    QUESTIONNAIRE_SYSTEM_PROMPT.includes("sys_q3 -> valeur cible de la métrique principale"),
    "Missing metric target question directive",
  );
  assert(
    QUESTIONNAIRE_SYSTEM_PROMPT.includes("sys_q8 -> ce que la personne a déjà mis en place"),
    "Missing existing efforts question directive",
  );
  assert(
    QUESTIONNAIRE_SYSTEM_PROMPT.includes("sys_q9 -> dernière porte ouverte si on a raté un truc"),
    "Missing open context question directive",
  );
  assert(
    QUESTIONNAIRE_SYSTEM_PROMPT.includes("Tu DOIS inclure ces 12 questions dans cet ordre précis"),
    "Missing obligation directive for mandatory questions",
  );
});

Deno.test("QUESTIONNAIRE_SYSTEM_PROMPT forces allow_other on success definition question", () => {
  assert(
    QUESTIONNAIRE_SYSTEM_PROMPT.includes("\"allow_other\" doit TOUJOURS être true pour cette question"),
    "Missing allow_other requirement on success definition question",
  );
  assert(
    QUESTIONNAIRE_SYSTEM_PROMPT.includes("Autre (si ton critère de réussite ne se trouve pas dans les choix ci-dessus)"),
    "Missing explicit Autre wording for success definition question",
  );
});

Deno.test("QUESTIONNAIRE_SYSTEM_PROMPT overrides existing_answers skip for the 9 mandatory questions", () => {
  assert(
    QUESTIONNAIRE_SYSTEM_PROMPT.includes("SAUF pour les 9 questions obligatoires"),
    "Missing exception for mandatory questions in existing_answers rule",
  );
});

Deno.test("extractStructuredCalibrationFields resolves new system fields from answer IDs", () => {
  const schema = makeQuestionnaireSchema();
  const answers = makeAnswersById();

  const result = extractStructuredCalibrationFields(answers, schema);

  assertEquals(result.struggle_duration, "Plus de 3 ans");
  assertEquals(result.starting_point, "102 kg");
  assertEquals(result.main_blocker, "Je craque surtout quand je suis fatigué");
  assertEquals(
    result.priority_goal,
    "Retrouver un poids stable sans y penser en permanence",
  );
  assertEquals(result.perceived_difficulty, "Très difficile");
  assertEquals(result.probable_drivers, "La fatigue et le manque d'énergie");
  assertEquals(result.metric_label, "Poids");
  assertEquals(result.metric_unit, "kg");
  assertEquals(result.metric_direction, "decrease");
  assertEquals(result.metric_measurement_mode, "absolute_value");
  assertEquals(result.metric_baseline_value, 102);
  assertEquals(result.metric_target_value, 75);
  assertEquals(result.self_confidence, 1);
  assertEquals(result.success_indicator, "75 kg");
});

Deno.test("extractStructuredCalibrationFields works with direct _system_* keys from the new flow", () => {
  const result = extractStructuredCalibrationFields(
    makeAnswersByCaptureGoal(),
    null,
  );

  assertEquals(result.struggle_duration, "Plus de 3 ans");
  assertEquals(result.starting_point, "102");
  assertEquals(result.main_blocker, "Je craque surtout quand je suis fatigué");
  assertEquals(
    result.priority_goal,
    "Retrouver un poids stable sans y penser en permanence",
  );
  assertEquals(result.perceived_difficulty, "Très difficile");
  assertEquals(result.probable_drivers, "La fatigue et le manque d'énergie");
  assertEquals(result.metric_measurement_mode, null);
  assertEquals(result.metric_baseline_value, 102);
  assertEquals(result.metric_target_value, 75);
  assertEquals(result.self_confidence, 1);
  assertEquals(
    result.success_indicator,
    "75",
  );
});

Deno.test("extractStructuredCalibrationFields still supports legacy calibration keys", () => {
  const result = extractStructuredCalibrationFields(
    {
      _system_struggle_duration: "Plus de 3 ans",
      _system_prior_attempts: "3-5 fois",
      _system_self_confidence: "2",
      _system_success_indicator: "Atteindre 75 kg",
    },
    null,
  );

  assertEquals(result.struggle_duration, "Plus de 3 ans");
  assertEquals(result.prior_attempts, "3-5 fois");
  assertEquals(result.self_confidence, 2);
  assertEquals(result.success_indicator, "Atteindre 75 kg");
});

Deno.test("extractStructuredCalibrationFields returns nulls when no system answers exist", () => {
  const result = extractStructuredCalibrationFields(
    { q1: "Some answer" },
    null,
  );

  assertEquals(result.struggle_duration, null);
  assertEquals(result.starting_point, null);
  assertEquals(result.main_blocker, null);
  assertEquals(result.priority_goal, null);
  assertEquals(result.perceived_difficulty, null);
  assertEquals(result.probable_drivers, null);
});

Deno.test("buildPlanGenerationUserPrompt includes the new calibration block", () => {
  const prompt = buildPlanGenerationUserPrompt({
    cycle_id: "cycle-1",
    transformation_id: "transfo-1",
    title: "Perdre du poids durablement",
    internal_summary: "Synthèse interne.",
    user_summary: "Synthèse user.",
    success_definition: "Retrouver un poids stable",
    main_constraint: "Travail sédentaire",
    questionnaire_answers: { q1: "Le soir" },
    questionnaire_schema: null,
    struggle_duration: "Plus de 3 ans",
    starting_point: "102 kg",
    main_blocker: "Je craque surtout quand je suis fatigué",
    priority_goal: "Retrouver un poids stable sans y penser en permanence",
    perceived_difficulty: "Très difficile",
    probable_drivers: "La fatigue et le manque d'énergie",
    prior_attempts: "3-5 fois",
    self_confidence: 1,
    success_indicator: "75 kg",
    metric_label: "Poids",
    metric_unit: "kg",
    metric_direction: "decrease",
    metric_measurement_mode: "absolute_value",
    metric_baseline_value: 102,
    metric_target_value: 75,
    metric_baseline_text: "102 kg",
    metric_target_text: "75 kg",
    duration_months: 2,
    user_age: 34,
    user_gender: "male",
  });

  assert(prompt.includes("## Calibrage de l'effort initial"), "Missing calibration header");
  assert(prompt.includes("Métrique principale"), "Missing metric label line");
  assert(prompt.includes("Mode de mesure"), "Missing metric measurement_mode line");
  assert(prompt.includes("Direction attendue"), "Missing metric direction line");
  assert(prompt.includes("Valeur de départ"), "Missing baseline line");
  assert(prompt.includes("Valeur cible"), "Missing target line");
  assert(prompt.includes("Blocage principal"), "Missing main_blocker line");
  assert(prompt.includes("Très difficile"), "Missing perceived_difficulty value");
  assert(prompt.includes("Facteur probable dominant"), "Missing probable_drivers line");
});

Deno.test("buildPlanGenerationUserPrompt uses fallback text for null new calibration fields", () => {
  const prompt = buildPlanGenerationUserPrompt({
    cycle_id: "cycle-1",
    transformation_id: "transfo-1",
    title: "Test",
    internal_summary: "Synthèse.",
    user_summary: "Synthèse.",
    success_definition: null,
    main_constraint: null,
    questionnaire_answers: {},
    questionnaire_schema: null,
    struggle_duration: null,
    starting_point: null,
    main_blocker: null,
    priority_goal: null,
    perceived_difficulty: null,
    probable_drivers: null,
    prior_attempts: null,
    self_confidence: null,
    success_indicator: null,
    metric_label: null,
    metric_unit: null,
    metric_direction: null,
    metric_baseline_value: null,
    metric_target_value: null,
    metric_baseline_text: null,
    metric_target_text: null,
    duration_months: 1,
    user_age: null,
    user_gender: null,
  });

  assert(prompt.includes("Non renseignée"), "Missing fallback for null calibration fields");
  assert(prompt.includes("Non renseigné"), "Missing fallback for null calibration fields");
});

Deno.test("Full chain: questionnaire answers -> extraction -> plan prompt contains new calibration", () => {
  const schema = makeQuestionnaireSchema();
  const answers = makeAnswersById();
  const calibration = extractStructuredCalibrationFields(answers, schema);

  assertEquals(calibration.main_blocker, "Je craque surtout quand je suis fatigué");
  assertEquals(calibration.probable_drivers, "La fatigue et le manque d'énergie");
  assertEquals(calibration.metric_baseline_text, "102 kg");
  assertEquals(calibration.metric_target_text, "75 kg");

  const prompt = buildPlanGenerationUserPrompt({
    cycle_id: "cycle-chain",
    transformation_id: "transfo-chain",
    title: "Perte de poids",
    internal_summary: "Synthèse interne détaillée.",
    user_summary: "Synthèse user empathique.",
    success_definition: "75 kg",
    main_constraint: "Grignotage nocturne",
    questionnaire_answers: answers,
    questionnaire_schema: schema,
    ...calibration,
    duration_months: 2,
    user_age: 30,
    user_gender: "female",
  });

  assert(prompt.includes("## Calibrage de l'effort initial"), "Missing calibration header");
  assert(prompt.includes("Je craque surtout quand je suis fatigué"), "Missing main_blocker");
  assert(prompt.includes("La fatigue et le manque d'énergie"), "Missing probable_drivers");
  assert(prompt.includes("102 kg"), "Missing baseline metric text");
  assert(prompt.includes("75 kg"), "Missing target metric text");
});

Deno.test("buildPlanGenerationUserPrompt decodes custom questionnaire answers with human labels", () => {
  const schema = makeQuestionnaireSchema();
  const prompt = buildPlanGenerationUserPrompt({
    cycle_id: "cycle-readable",
    transformation_id: "transfo-readable",
    title: "Perte de poids",
    internal_summary: "Synthèse interne.",
    user_summary: "Synthèse user.",
    success_definition: null,
    main_constraint: null,
    questionnaire_answers: {
      q1: ["ctx_1"],
      q2: ["help_1", "__other__:Quand j'ai bien dormi"],
    },
    questionnaire_schema: schema,
    struggle_duration: null,
    starting_point: null,
    main_blocker: null,
    priority_goal: null,
    perceived_difficulty: null,
    probable_drivers: null,
    prior_attempts: null,
    self_confidence: null,
    success_indicator: null,
    metric_label: null,
    metric_unit: null,
    metric_direction: null,
    metric_measurement_mode: null,
    metric_baseline_value: null,
    metric_target_value: null,
    metric_baseline_text: null,
    metric_target_text: null,
    duration_months: 2,
    user_age: null,
    user_gender: null,
  });

  assert(prompt.includes("Dans quelles situations c'est le plus visible ?"), "Missing custom question text");
  assert(prompt.includes("Le soir"), "Missing decoded option label");
  assert(prompt.includes("Quand tout est préparé"), "Missing decoded multi-choice label");
  assert(prompt.includes("Quand j'ai bien dormi"), "Missing decoded other text");
  assert(!prompt.includes("ctx_1"), "Raw option id leaked into prompt");
  assert(!prompt.includes("help_1"), "Raw option id leaked into prompt");
});
