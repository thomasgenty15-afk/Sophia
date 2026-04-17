import { assertEquals, assertThrows } from "jsr:@std/assert@1";

import {
  calculateAgeFromBirthDate,
  computeNextGenerationAttempt,
  validateGeneratedPlanAgainstContext,
} from "./index.ts";
import type { PlanContentV3 } from "../_shared/v2-types.ts";

function makePlanFixture(): PlanContentV3 {
  return {
    version: 3,
    cycle_id: "cycle-1",
    transformation_id: "transfo-1",
    duration_months: 2,
    title: "Réduire l'évitement",
    global_objective: "Faire face plus tôt aux sujets évités.",
    user_summary: "Résumé user.",
    internal_summary: "Résumé interne.",
    situation_context: "La personne évite des sujets importants jusqu'à ce qu'ils deviennent lourds.",
    mechanism_analysis: "L'évitement soulage à court terme mais alourdit la charge ensuite.",
    key_understanding: "Le premier petit mouvement utile compte plus que l'élan parfait.",
    progression_logic: "On ouvre d'abord le contact, puis on transforme cette ouverture en action visible.",
    primary_metric: {
      label: "Messages envoyés",
      unit: "messages",
      baseline_value: "0 message",
      success_target: "2 messages envoyés",
      measurement_mode: "count",
    },
    strategy: {
      identity_shift: "Je fais face plus tôt.",
      core_principle: "Petit pas au bon moment.",
      success_definition: "Faire face plus tôt.",
      main_constraint: "Charge mentale variable.",
    },
    inspiration_narrative:
      "En avançant sans fuite, les sujets importants redeviennent gérables.",
    phases: [
      {
        phase_id: "phase-1",
        phase_order: 1,
        title: "Réouvrir le contact",
        rationale: "Commencer par de petites preuves d'action.",
        phase_objective: "Réduire le délai avant le premier mouvement utile.",
        what_this_phase_targets: "Le délai avant le premier geste utile.",
        why_this_now: "Sans premier mouvement, tout le reste reste bloqué.",
        how_this_phase_works: "On commence par de très petites preuves d'ouverture.",
        maintained_foundation: [],
        heartbeat: {
          title: "Messages ouverts",
          unit: "messages",
          current: null,
          target: 3,
          tracking_mode: "manual",
        },
        items: [
          {
            temp_id: "gen-p1-clarifications-001",
            dimension: "clarifications",
            kind: "framework",
            title: "Préparer l'ouverture",
            description: "Clarifier en 3 lignes.",
            tracking_type: "boolean",
            activation_order: 1,
            activation_condition: null,
            support_mode: null,
            support_function: null,
            target_reps: null,
            cadence_label: null,
            scheduled_days: null,
            time_of_day: null,
            payload: {
              clarification_details: {
                type: "one_shot",
                intro: "Clarifie en 3 lignes ce qui te fait attendre avant d'ouvrir la conversation.",
                save_label: "Enregistrer la fiche",
                sections: [
                  {
                    id: "blocage",
                    label: "Qu'est-ce qui retarde l'ouverture ?",
                    input_type: "text",
                    placeholder: "Le blocage principal",
                    helper_text: "Reste concret.",
                  },
                ],
              },
            },
          },
          {
            temp_id: "gen-p1-habits-001",
            dimension: "habits",
            kind: "habit",
            title: "Relire mes messages 2 minutes",
            description: "Ouvrir la conversation sans répondre tout de suite.",
            tracking_type: "boolean",
            activation_order: 1,
            activation_condition: null,
            support_mode: null,
            support_function: null,
            target_reps: 5,
            cadence_label: "quotidien",
            scheduled_days: null,
            time_of_day: "evening",
            payload: {},
          },
        ],
      },
      {
        phase_id: "phase-2",
        phase_order: 2,
        title: "Passer à l'action",
        rationale: "Transformer l'ouverture en action concrète.",
        phase_objective: "Passer du repérage à l'action visible.",
        what_this_phase_targets: "Le passage à l'envoi effectif.",
        why_this_now: "Une ouverture sans action visible laisse l'évitement intact.",
        how_this_phase_works: "On convertit l'ouverture en message réellement envoyé.",
        maintained_foundation: ["Réouvrir le contact plus vite"],
        heartbeat: {
          title: "Messages envoyés",
          unit: "messages",
          current: null,
          target: 2,
          tracking_mode: "manual",
        },
        items: [
          {
            temp_id: "gen-p2-missions-001",
            dimension: "missions",
            kind: "task",
            title: "Envoyer le message",
            description: "Envoyer le message aujourd'hui.",
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
            temp_id: "gen-p2-habits-001",
            dimension: "habits",
            kind: "habit",
            title: "Regarder mes messages à heure fixe",
            description: "Ouvrir la conversation à heure fixe.",
            tracking_type: "boolean",
            activation_order: 1,
            activation_condition: { type: "immediate" },
            support_mode: null,
            support_function: null,
            target_reps: 6,
            cadence_label: "3x/semaine",
            scheduled_days: ["mon", "wed", "fri"],
            time_of_day: "morning",
            payload: {},
          },
        ],
      },
      {
        phase_id: "phase-3",
        phase_order: 3,
        title: "Stabiliser",
        rationale: "Installer une cadence soutenable.",
        phase_objective: "Rendre la relation plus simple à tenir dans le temps.",
        what_this_phase_targets: "La stabilité de la cadence relationnelle.",
        why_this_now: "Après les premiers passages à l'action, il faut rendre le rythme tenable.",
        how_this_phase_works: "On transforme les bons gestes en rythme durable.",
        maintained_foundation: [
          "Réouvrir le contact plus vite",
          "Passer à l'action sans laisser traîner",
        ],
        heartbeat: {
          title: "Semaines fluides",
          unit: "semaines",
          current: null,
          target: 2,
          tracking_mode: "manual",
        },
        items: [
          {
            temp_id: "gen-p3-clarifications-001",
            dimension: "clarifications",
            kind: "exercise",
            title: "Préparer le prochain échange",
            description: "Clarifier à l'avance le sujet principal.",
            tracking_type: "boolean",
            activation_order: 1,
            activation_condition: null,
            support_mode: null,
            support_function: null,
            target_reps: null,
            cadence_label: null,
            scheduled_days: null,
            time_of_day: null,
            payload: {
              clarification_details: {
                type: "one_shot",
                intro: "Clarifie à l'avance le sujet que tu veux porter.",
                save_label: "Enregistrer la fiche",
                sections: [
                  {
                    id: "sujet",
                    label: "Quel sujet veux-tu porter ?",
                    input_type: "text",
                    placeholder: "Le sujet principal",
                    helper_text: null,
                  },
                ],
              },
            },
          },
          {
            temp_id: "gen-p3-habits-001",
            dimension: "habits",
            kind: "habit",
            title: "Préparer un point d'attention hebdo",
            description: "Noter le sujet relationnel à traiter cette semaine.",
            tracking_type: "boolean",
            activation_order: 1,
            activation_condition: null,
            support_mode: null,
            support_function: null,
            target_reps: 2,
            cadence_label: "1x/semaine",
            scheduled_days: ["sun"],
            time_of_day: "evening",
            payload: {},
          },
        ],
      },
    ],
    timeline_summary: "Ouverture puis passage à l'action.",
    journey_context: null,
    metadata: {
      plan_adjustment_context: {
        global_reasoning: {
          main_problem_model:
            "L'évitement soulage à court terme mais laisse les sujets prendre trop de poids.",
          sequencing_logic:
            "On crée d'abord une ouverture concrète, puis on transforme cette ouverture en action, puis on stabilise le rythme.",
          why_not_faster_initially:
            "Aller trop vite dès le départ ferait remonter la fuite et casserait le premier appui.",
          acceleration_signals: [
            "Le premier mouvement devient facile",
            "La personne demande explicitement plus de vitesse",
          ],
          slowdown_signals: [
            "Le premier mouvement reste bloqué plusieurs fois",
            "La charge émotionnelle monte dès qu'il faut agir",
          ],
        },
        phase_reasoning: [
          {
            phase_id: "phase-1",
            phase_order: 1,
            role_in_plan: "Créer un premier mouvement visible contre l'évitement.",
            why_before_next:
              "Sans ouverture répétée, demander un envoi concret trop tôt resterait fragile.",
            user_signals_used: [
              "Évitement installé",
              "Besoin de petites preuves d'action",
            ],
            prerequisite_for_next_phase:
              "Avoir déjà rouvert le contact plusieurs fois sans trop de résistance.",
            acceleration_signals: [
              "L'ouverture devient simple",
            ],
            slowdown_signals: [
              "L'ouverture reste évitée presque à chaque fois",
            ],
          },
          {
            phase_id: "phase-2",
            phase_order: 2,
            role_in_plan: "Transformer l'ouverture en action concrète.",
            why_before_next:
              "Il faut d'abord envoyer vraiment avant de vouloir rendre le rythme durable.",
            user_signals_used: [
              "L'action réelle est encore retardée",
              "Le problème principal est le passage à l'acte",
            ],
            prerequisite_for_next_phase:
              "Avoir quelques messages vraiment envoyés.",
            acceleration_signals: [
              "Les messages partent sans trop de délai",
            ],
            slowdown_signals: [
              "Le moment d'envoyer reste très chargé",
            ],
          },
          {
            phase_id: "phase-3",
            phase_order: 3,
            role_in_plan: "Stabiliser une cadence tenable.",
            why_before_next:
              "La stabilité vient après les premières preuves d'action répétées.",
            user_signals_used: [
              "La régularité reste fragile",
              "Le rythme doit devenir tenable",
            ],
            prerequisite_for_next_phase: null,
            acceleration_signals: [
              "Le rythme tient même les semaines chargées",
            ],
            slowdown_signals: [
              "Le rythme retombe dès qu'une semaine se complique",
            ],
          },
        ],
      },
    },
  };
}

Deno.test("computeNextGenerationAttempt increments from existing versions/attempts", () => {
  assertEquals(computeNextGenerationAttempt([]), 1);
  assertEquals(
    computeNextGenerationAttempt([
      { version: 1, generation_attempts: 1 },
      { version: 2, generation_attempts: 2 },
    ]),
    3,
  );
});

Deno.test("calculateAgeFromBirthDate handles birthdays correctly", () => {
  assertEquals(
    calculateAgeFromBirthDate("1990-03-24", "2026-03-23T10:00:00.000Z"),
    35,
  );
  assertEquals(
    calculateAgeFromBirthDate("1990-03-23", "2026-03-23T10:00:00.000Z"),
    36,
  );
  assertEquals(
    calculateAgeFromBirthDate(null, "2026-03-23T10:00:00.000Z"),
    null,
  );
});

Deno.test("validateGeneratedPlanAgainstContext accepts matching plan fixture", () => {
  const plan = makePlanFixture();
  const validated = validateGeneratedPlanAgainstContext(plan, {
    cycleId: "cycle-1",
    transformationId: "transfo-1",
  });

  assertEquals(validated.cycle_id, "cycle-1");
  assertEquals(validated.transformation_id, "transfo-1");
});

Deno.test("validateGeneratedPlanAgainstContext rejects mismatched trusted ids", () => {
  const plan = makePlanFixture();
  plan.cycle_id = "cycle-2";

  assertThrows(() =>
    validateGeneratedPlanAgainstContext(plan, {
      cycleId: "cycle-1",
      transformationId: "transfo-1",
    })
  );
});

Deno.test("validateGeneratedPlanAgainstContext rejects a level that delays a setup mission after clarifications", () => {
  const plan = makePlanFixture();
  plan.phases[0].duration_weeks = 2;
  plan.phases[0].items = [
    {
      temp_id: "gen-p1-habits-001",
      dimension: "habits",
      kind: "habit",
      title: "Boire de l'eau a la place du sucre",
      description: "Remplacer une boisson sucree par de l'eau ou du the.",
      tracking_type: "boolean",
      activation_order: 1,
      activation_condition: null,
      support_mode: null,
      support_function: null,
      target_reps: 3,
      cadence_label: "3 jours",
      scheduled_days: null,
      time_of_day: "anytime",
      payload: {},
    },
    {
      temp_id: "gen-p1-clarifications-001",
      dimension: "clarifications",
      kind: "exercise",
      title: "Cartographier tes envies de sucre",
      description: "Identifier quand l'envie frappe le plus fort.",
      tracking_type: "boolean",
      activation_order: 1,
      activation_condition: null,
      support_mode: null,
      support_function: null,
      target_reps: null,
      cadence_label: null,
      scheduled_days: null,
      time_of_day: null,
      payload: {
        clarification_details: {
          type: "one_shot",
          intro: "Observe tes envies.",
          save_label: "Enregistrer la fiche",
          sections: [
            {
              id: "envies",
              label: "Quand l'envie monte-t-elle ?",
              input_type: "text",
              placeholder: "Exemple",
              helper_text: null,
            },
          ],
        },
      },
    },
    {
      temp_id: "gen-p1-missions-001",
      dimension: "missions",
      kind: "task",
      title: "Nettoyer ton environnement direct",
      description: "Retire ou cache les boissons sucrees pour preparer le terrain.",
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
  ];
  plan.phases[0].weeks = [
    {
      week_order: 1,
      title: "Semaine 1",
      weekly_target_value: 3,
      weekly_target_label: "3 jours sans boisson sucree",
      progression_note: "Demarre petit.",
      action_focus: ["Remplacer une boisson sucree", "Observer les envies"],
      item_assignments: [
        { temp_id: "gen-p1-habits-001", weekly_reps: 3 },
        { temp_id: "gen-p1-clarifications-001" },
      ],
      reps_summary: "3 jours",
      mission_days: [],
      success_signal: "Trois jours tenus",
    },
    {
      week_order: 2,
      title: "Semaine 2",
      weekly_target_value: 4,
      weekly_target_label: "4 jours sans boisson sucree",
      progression_note: "Solidifie l'environnement.",
      action_focus: ["Continuer l'habitude", "Nettoyer l'environnement"],
      item_assignments: [
        { temp_id: "gen-p1-habits-001", weekly_reps: 4 },
        { temp_id: "gen-p1-missions-001" },
      ],
      reps_summary: "4 jours",
      mission_days: ["samedi"],
      success_signal: "L'environnement soutient l'habitude",
    },
  ];
  plan.current_level_runtime = {
    phase_id: "phase-1",
    level_order: 1,
    title: plan.phases[0].title,
    phase_objective: plan.phases[0].phase_objective,
    rationale: plan.phases[0].rationale,
    what_this_phase_targets: "Boissons sucrees et automatisme du soir",
    why_this_now: "Le setup environnemental doit venir d'abord.",
    how_this_phase_works: "On simplifie le terrain avant d'analyser plus finement.",
    duration_weeks: 2,
    phase_metric_target: "4 jours sans boisson sucree",
    maintained_foundation: [],
    heartbeat: plan.phases[0].heartbeat,
    weeks: plan.phases[0].weeks!,
    review_focus: [],
  };

  assertThrows(
    () =>
      validateGeneratedPlanAgainstContext(plan, {
        cycleId: "cycle-1",
        transformationId: "transfo-1",
      }),
    Error,
    "setup mission too late",
  );
});

Deno.test("validateGeneratedPlanAgainstContext rejects a multi-week habit-only week with actionable guidance", () => {
  const plan = makePlanFixture();
  plan.phases[0].duration_weeks = 3;
  plan.phases[0].items = [
    {
      temp_id: "gen-p1-habits-001",
      dimension: "habits",
      kind: "habit",
      title: "Boire un verre d'eau avant le sucre",
      description: "Faire un premier geste de rupture avant la boisson sucree.",
      tracking_type: "boolean",
      activation_order: 1,
      activation_condition: null,
      support_mode: null,
      support_function: null,
      target_reps: 5,
      cadence_label: "5 fois cette semaine",
      scheduled_days: null,
      time_of_day: "anytime",
      payload: {},
    },
    {
      temp_id: "gen-p1-missions-001",
      dimension: "missions",
      kind: "task",
      title: "Rendre l'eau visible",
      description: "Poser une gourde ou une bouteille a l'endroit critique.",
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
      temp_id: "gen-p1-clarifications-001",
      dimension: "clarifications",
      kind: "exercise",
      title: "Repérer les heures fragiles",
      description: "Voir quand la tentation apparait le plus vite.",
      tracking_type: "boolean",
      activation_order: 2,
      activation_condition: null,
      support_mode: null,
      support_function: null,
      target_reps: null,
      cadence_label: null,
      scheduled_days: null,
      time_of_day: null,
      payload: {
        clarification_details: {
          type: "one_shot",
          intro: "Repere les moments critiques.",
          save_label: "Enregistrer la fiche",
          sections: [
            {
              id: "heures",
              label: "A quels moments c'est le plus dur ?",
              input_type: "text",
              placeholder: "Exemple",
              helper_text: null,
            },
          ],
        },
      },
    },
  ];
  plan.phases[0].weeks = [
    {
      week_order: 1,
      title: "Semaine 1",
      weekly_target_value: 3,
      weekly_target_label: "3 fois cette semaine",
      progression_note: "On installe le geste.",
      action_focus: ["Boire un verre d'eau", "Rendre l'eau visible"],
      item_assignments: [
        { temp_id: "gen-p1-habits-001", weekly_reps: 3 },
        { temp_id: "gen-p1-missions-001" },
      ],
      reps_summary: "3 fois",
      mission_days: ["lundi"],
      success_signal: "Le geste existe.",
    },
    {
      week_order: 2,
      title: "Semaine 2",
      weekly_target_value: 4,
      weekly_target_label: "4 fois cette semaine",
      progression_note: "On voit mieux les moments fragiles.",
      action_focus: ["Tenir le geste", "Repérer les heures fragiles"],
      item_assignments: [
        { temp_id: "gen-p1-habits-001", weekly_reps: 4 },
        { temp_id: "gen-p1-clarifications-001" },
      ],
      reps_summary: "4 fois",
      mission_days: [],
      success_signal: "Les situations difficiles deviennent plus visibles.",
    },
    {
      week_order: 3,
      title: "Semaine 3",
      weekly_target_value: 5,
      weekly_target_label: "5 fois cette semaine",
      progression_note: "On vise la consolidation.",
      action_focus: ["Tenir le geste plus souvent"],
      item_assignments: [
        { temp_id: "gen-p1-habits-001", weekly_reps: 5 },
      ],
      reps_summary: "5 fois",
      mission_days: [],
      success_signal: "Le geste devient plus naturel.",
    },
  ];
  plan.current_level_runtime = {
    phase_id: "phase-1",
    level_order: 1,
    title: plan.phases[0].title,
    phase_objective: plan.phases[0].phase_objective,
    rationale: plan.phases[0].rationale,
    what_this_phase_targets: plan.phases[0].what_this_phase_targets,
    why_this_now: plan.phases[0].why_this_now,
    how_this_phase_works: plan.phases[0].how_this_phase_works,
    duration_weeks: 3,
    phase_metric_target: "5 fois cette semaine",
    maintained_foundation: [],
    heartbeat: plan.phases[0].heartbeat,
    weeks: plan.phases[0].weeks!,
    review_focus: [],
  };

  assertThrows(
    () =>
      validateGeneratedPlanAgainstContext(plan, {
        cycleId: "cycle-1",
        transformationId: "transfo-1",
      }),
    Error,
    "habit-only week",
  );
});

Deno.test("validateGeneratedPlanAgainstContext rejects missing internal adjustment context", () => {
  const plan = makePlanFixture();
  plan.metadata = {};

  assertThrows(
    () =>
      validateGeneratedPlanAgainstContext(plan, {
        cycleId: "cycle-1",
        transformationId: "transfo-1",
      }),
    Error,
    "metadata.plan_adjustment_context must be an object",
  );
});

Deno.test("validateGeneratedPlanAgainstContext trims mission_days to assigned one-shot items", () => {
  const plan = makePlanFixture();
  plan.phases[0].items.push({
    temp_id: "gen-p1-missions-001",
    dimension: "missions",
    kind: "task",
    title: "Envoyer un premier message",
    description: "Faire le premier pas cette semaine.",
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
  });
  plan.phases[0].weeks = [
    {
      week_order: 1,
      title: "Semaine 1",
      weekly_target_value: 3,
      weekly_target_label: "3 jours sans boisson sucree",
      progression_note: "Demarre petit.",
      action_focus: ["Remplacer une boisson sucree", "Observer les envies"],
      item_assignments: [
        { temp_id: "gen-p1-habits-001", weekly_reps: 3 },
        { temp_id: "gen-p1-clarifications-001" },
        { temp_id: "gen-p1-missions-001" },
      ],
      reps_summary: "3 jours",
      mission_days: ["jeudi", "samedi", "dimanche"],
      success_signal: "Trois jours tenus",
    },
  ];
  plan.current_level_runtime = {
    phase_id: "phase-1",
    level_order: 1,
    title: plan.phases[0].title,
    phase_objective: plan.phases[0].phase_objective,
    rationale: plan.phases[0].rationale,
    what_this_phase_targets: plan.phases[0].what_this_phase_targets,
    why_this_now: plan.phases[0].why_this_now,
    how_this_phase_works: plan.phases[0].how_this_phase_works,
    duration_weeks: 1,
    phase_metric_target: plan.phases[0].phase_metric_target,
    maintained_foundation: [],
    heartbeat: plan.phases[0].heartbeat,
    weeks: plan.phases[0].weeks!,
    review_focus: [],
  };

  const normalized = validateGeneratedPlanAgainstContext(plan, {
    cycleId: "cycle-1",
    transformationId: "transfo-1",
  });

  assertEquals(normalized.current_level_runtime?.weeks[0]?.mission_days, ["jeudi", "samedi"]);
});

Deno.test("validateGeneratedPlanAgainstContext canonicalizes the final habit week to 6 reps", () => {
  const plan = makePlanFixture();
  plan.phases[0].duration_weeks = 2;
  plan.phases[0].heartbeat = {
    title: "Soirs avec ouverture",
    unit: "soirs/semaine",
    current: null,
    target: 5,
    tracking_mode: "manual",
  };
  plan.phases[0].items.push({
    temp_id: "gen-p1-missions-001",
    dimension: "missions",
    kind: "task",
    title: "Poser un rappel visible",
    description: "Préparer le terrain pour ouvrir la conversation sans attendre.",
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
  });
  plan.phases[0].items[1] = {
    ...plan.phases[0].items[1],
    target_reps: 5,
    cadence_label: "5 fois cette semaine",
  };
  plan.phases[0].weeks = [
    {
      week_order: 1,
      title: "Semaine 1",
      weekly_target_value: 3,
      weekly_target_label: "3 soirs cette semaine avec ouverture",
      progression_note: "On rend le geste visible.",
      action_focus: ["Ouvrir 3 soirs", "Préparer le rappel"],
      item_assignments: [
        { temp_id: "gen-p1-habits-001", weekly_reps: 3, weekly_cadence_label: "3 fois cette semaine" },
        { temp_id: "gen-p1-missions-001" },
      ],
      reps_summary: "3 fois",
      mission_days: ["jeudi"],
      success_signal: "Le geste commence a exister.",
    },
    {
      week_order: 2,
      title: "Semaine 2",
      weekly_target_value: 5,
      weekly_target_label: "5 soirs cette semaine avec ouverture",
      progression_note: "On vise une vraie cadence.",
      action_focus: ["Tenir l'habitude", "Garder le terrain simple"],
      item_assignments: [
        {
          temp_id: "gen-p1-habits-001",
          weekly_reps: 5,
          weekly_cadence_label: "5 fois cette semaine",
          weekly_description_override: "Ouvre la conversation 5 fois cette semaine, meme sans repondre.",
        },
        { temp_id: "gen-p1-clarifications-001" },
      ],
      reps_summary: "5 fois",
      mission_days: ["mardi"],
      success_signal: "L'ouverture devient plus naturelle.",
    },
  ];
  plan.current_level_runtime = {
    phase_id: "phase-1",
    level_order: 1,
    title: plan.phases[0].title,
    phase_objective: plan.phases[0].phase_objective,
    rationale: plan.phases[0].rationale,
    what_this_phase_targets: plan.phases[0].what_this_phase_targets,
    why_this_now: plan.phases[0].why_this_now,
    how_this_phase_works: plan.phases[0].how_this_phase_works,
    duration_weeks: 2,
    phase_metric_target: "5 soirs avec ouverture",
    maintained_foundation: [],
    heartbeat: plan.phases[0].heartbeat,
    weeks: plan.phases[0].weeks!,
    review_focus: [],
  };

  const validated = validateGeneratedPlanAgainstContext(plan, {
    cycleId: "cycle-1",
    transformationId: "transfo-1",
  });

  assertEquals(validated.phases[0].heartbeat.target, 6);
  assertEquals(validated.phases[0].items[1].target_reps, 6);
  assertEquals(validated.phases[0].items[1].cadence_label, "6 fois cette semaine");
  assertEquals(validated.phases[0].weeks?.[1].weekly_target_value, 6);
  assertEquals(validated.phases[0].weeks?.[1].weekly_target_label, "6 soirs cette semaine avec ouverture");
  assertEquals(validated.phases[0].weeks?.[1].reps_summary, "6 fois");
  assertEquals(validated.phases[0].weeks?.[1].item_assignments?.[0].weekly_reps, 6);
  assertEquals(validated.phases[0].weeks?.[1].item_assignments?.[0].weekly_cadence_label, "6 fois cette semaine");
  assertEquals(
    validated.phases[0].weeks?.[1].item_assignments?.[0].weekly_description_override,
    "Ouvre la conversation 6 fois cette semaine, meme sans repondre.",
  );
  assertEquals(validated.current_level_runtime?.heartbeat.target, 6);
  assertEquals(validated.current_level_runtime?.weeks?.[1].weekly_target_value, 6);
});

Deno.test("validateGeneratedPlanAgainstContext accepts a multi-week level with one close habit per week", () => {
  const plan = makePlanFixture();
  plan.phases[0].duration_weeks = 3;
  plan.phases[0].items = [
    {
      temp_id: "gen-p1-habits-001",
      dimension: "habits",
      kind: "habit",
      title: "Attendre 5 minutes avant de grignoter",
      description: "Quand l'envie monte, attends 5 minutes avant de decider si tu manges.",
      tracking_type: "boolean",
      activation_order: 1,
      activation_condition: null,
      support_mode: null,
      support_function: null,
      target_reps: 3,
      cadence_label: "3 fois cette semaine",
      scheduled_days: null,
      time_of_day: "anytime",
      payload: {},
    },
    {
      temp_id: "gen-p1-habits-002",
      dimension: "habits",
      kind: "habit",
      title: "Attendre 10 minutes avant de grignoter",
      description: "Quand l'envie monte, attends 10 minutes avant de decider si tu manges.",
      tracking_type: "boolean",
      activation_order: 2,
      activation_condition: {
        type: "after_habit_traction",
        depends_on: ["gen-p1-habits-001"],
        min_completions: 3,
      },
      support_mode: null,
      support_function: null,
      target_reps: 4,
      cadence_label: "4 fois cette semaine",
      scheduled_days: null,
      time_of_day: "anytime",
      payload: {},
    },
    {
      temp_id: "gen-p1-habits-003",
      dimension: "habits",
      kind: "habit",
      title: "Attendre 15 minutes avant de grignoter",
      description: "Quand l'envie monte, attends 15 minutes avant de decider si tu manges.",
      tracking_type: "boolean",
      activation_order: 3,
      activation_condition: {
        type: "after_habit_traction",
        depends_on: ["gen-p1-habits-002"],
        min_completions: 4,
      },
      support_mode: null,
      support_function: null,
      target_reps: 5,
      cadence_label: "5 fois cette semaine",
      scheduled_days: null,
      time_of_day: "anytime",
      payload: {},
    },
    {
      temp_id: "gen-p1-missions-001",
      dimension: "missions",
      kind: "task",
      title: "Nettoyer ton environnement direct",
      description: "Range les snacks hors de vue pour rendre la pause plus facile.",
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
      temp_id: "gen-p1-clarifications-001",
      dimension: "clarifications",
      kind: "exercise",
      title: "Repérer les moments où l'envie monte",
      description: "Note quand l'envie de grignoter arrive le plus souvent.",
      tracking_type: "boolean",
      activation_order: 2,
      activation_condition: {
        type: "after_item_completion",
        depends_on: ["gen-p1-missions-001"],
      },
      support_mode: null,
      support_function: null,
      target_reps: null,
      cadence_label: null,
      scheduled_days: null,
      time_of_day: null,
      payload: {
        clarification_details: {
          type: "one_shot",
          intro: "Repere tes moments sensibles.",
          save_label: "Enregistrer la fiche",
          sections: [
            {
              id: "moments",
              label: "Quand l'envie monte-t-elle le plus ?",
              input_type: "text",
              placeholder: "Exemple",
              helper_text: null,
            },
          ],
        },
      },
    },
    {
      temp_id: "gen-p1-missions-002",
      dimension: "missions",
      kind: "task",
      title: "Preparer un plan de pause visible",
      description: "Pose un repere concret pour lancer la pause sans negocier.",
      tracking_type: "boolean",
      activation_order: 3,
      activation_condition: {
        type: "after_habit_traction",
        depends_on: ["gen-p1-habits-002"],
        min_completions: 4,
      },
      support_mode: null,
      support_function: null,
      target_reps: null,
      cadence_label: null,
      scheduled_days: null,
      time_of_day: "anytime",
      payload: {},
    },
  ];
  plan.phases[0].weeks = [
    {
      week_order: 1,
      title: "Semaine 1",
      weekly_target_value: 3,
      weekly_target_label: "3 envies cette semaine avec 5 minutes d'attente",
      progression_note: "On installe le premier delai, sans chercher plus.",
      action_focus: ["Tenir 5 minutes", "Nettoyer l'environnement"],
      item_assignments: [
        { temp_id: "gen-p1-habits-001", weekly_reps: 3 },
        { temp_id: "gen-p1-missions-001" },
      ],
      reps_summary: "3 pauses de 5 minutes",
      mission_days: ["jeudi"],
      success_signal: "La pause existe vraiment avant le grignotage.",
    },
    {
      week_order: 2,
      title: "Semaine 2",
      weekly_target_value: 4,
      weekly_target_label: "4 envies cette semaine avec 10 minutes d'attente",
      progression_note: "On garde la meme logique, avec un delai plus exigeant.",
      action_focus: ["Tenir 10 minutes", "Repérer les moments sensibles"],
      item_assignments: [
        { temp_id: "gen-p1-habits-002", weekly_reps: 4 },
        { temp_id: "gen-p1-clarifications-001" },
      ],
      reps_summary: "4 pauses de 10 minutes",
      mission_days: ["mardi"],
      success_signal: "Tu vois mieux les moments ou la regle tient moins bien.",
    },
    {
      week_order: 3,
      title: "Semaine 3",
      weekly_target_value: 5,
      weekly_target_label: "5 envies cette semaine avec 15 minutes d'attente",
      progression_note: "On allonge le delai et on pose un repere visible pour tenir.",
      action_focus: ["Tenir 15 minutes", "Rendre la pause plus automatique"],
      item_assignments: [
        { temp_id: "gen-p1-habits-003", weekly_reps: 5 },
        { temp_id: "gen-p1-missions-002" },
      ],
      reps_summary: "5 pauses de 15 minutes",
      mission_days: ["lundi"],
      success_signal: "Le delai devient plus naturel, meme quand l'envie monte vite.",
    },
  ];
  plan.current_level_runtime = {
    phase_id: "phase-1",
    level_order: 1,
    title: "Installer un vrai delai avant le grignotage",
    phase_objective: "Construire une pause de plus en plus solide avant l'impulsion.",
    rationale: "On travaille le meme levier semaine apres semaine, avec un delai qui s'allonge.",
    what_this_phase_targets: "L'automatisme qui fait grignoter sans pause.",
    why_this_now: "Creer un delai concret change tout de suite le terrain decisionnel.",
    how_this_phase_works: "On fait monter progressivement la duree d'attente sur le meme geste.",
    duration_weeks: 3,
    phase_metric_target: "5 envies de grignotage gerees avec 15 minutes de pause avant decision.",
    maintained_foundation: [],
    heartbeat: {
      title: "Envies avec pause tenue",
      unit: "envies/semaine",
      current: null,
      target: 5,
      tracking_mode: "manual",
    },
    weeks: plan.phases[0].weeks!,
    review_focus: [],
  };

  const validated = validateGeneratedPlanAgainstContext(plan, {
    cycleId: "cycle-1",
    transformationId: "transfo-1",
  });

  assertEquals(validated.phases[0].items.length, 6);
  assertEquals(validated.current_level_runtime?.weeks[2]?.item_assignments?.[0]?.temp_id, "gen-p1-habits-003");
});
