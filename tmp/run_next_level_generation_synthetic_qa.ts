const OUT_DIR = new URL("./next-level-generation-synthetic-qa/", import.meta.url);

type JsonRecord = Record<string, unknown>;

function loadEnvFile(path: URL) {
  const raw = Deno.readTextFileSync(path).split(/\r?\n/);
  for (const line of raw) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!Deno.env.get(key)) Deno.env.set(key, value);
  }
}

function compactPatch(patch: JsonRecord) {
  const next = patch.next_level as JsonRecord;
  return {
    decision: patch.decision,
    decision_reason: patch.decision_reason,
    title: next?.title,
    objective: next?.phase_objective,
    duration_weeks: next?.duration_weeks,
    metric_target: next?.phase_metric_target,
    heartbeat: next?.heartbeat,
    items: ((next?.items ?? []) as JsonRecord[]).map((item) => ({
      temp_id: item.temp_id,
      dimension: item.dimension,
      kind: item.kind,
      title: item.title,
      target_reps: item.target_reps,
      cadence_label: item.cadence_label,
      scheduled_days: item.scheduled_days,
      time_of_day: item.time_of_day,
    })),
    weeks: ((next?.weeks ?? []) as JsonRecord[]).map((week) => ({
      week_order: week.week_order,
      title: week.title,
      target: week.weekly_target_label,
      assignments: ((week.item_assignments ?? []) as JsonRecord[]).map((assignment) =>
        assignment.temp_id
      ),
      success_signal: week.success_signal,
    })),
    future_blueprint_levels: patch.future_blueprint_levels,
    continuity_notes: patch.continuity_notes,
  };
}

loadEnvFile(new URL("../supabase/.env", import.meta.url));
Deno.env.set("MEGA_TEST_MODE", "0");
Deno.env.set("SOPHIA_LLM_RAW_TRACE_ENABLED", "0");
Deno.env.set("SOPHIA_EVAL_MODE", "1");

const {
  buildLevelReviewSchema,
  buildLevelReviewSummary,
  buildNextLevelTransition,
  normalizeLevelReviewAnswers,
} = await import("../supabase/functions/_shared/v2-level-completion.ts");
const { generateNextLevelForPlan } = await import("../supabase/functions/generate-next-level-v1/index.ts");
const { validateNextLevelGenerationPatch } = await import("../supabase/functions/_shared/v2-next-level-generation.ts");

const planContent = {
  version: 3,
  title: "Réduction progressive d'une habitude du soir",
  cycle_id: "cycle-synthetic",
  transformation_id: "transformation-synthetic",
  global_objective:
    "Atteindre 0 jour de consommation par semaine et ne plus utiliser l'habitude du soir comme béquille anti-stress ou anti-ennui.",
  primary_metric: {
    label: "Jours de consommation",
    unit: "jours/semaine",
    current: 5,
    target: 0,
  },
  strategy: {
    success_definition:
      "Le user sait traverser les soirées, les moments d'ennui et les journées stressantes sans revenir automatiquement à l'habitude.",
    main_constraint:
      "La contrainte principale est le stress après le travail, qui fait sauter les bonnes intentions en début de soirée.",
    identity_shift:
      "Passer de 'j'ai besoin de ça pour redescendre' à 'je sais redescendre autrement'.",
    core_principle:
      "Réduire la friction d'abord, puis introduire des jours off seulement quand les soirées sont stabilisées.",
  },
  user_summary:
    "Profil synthétique : adulte actif, soirées fragiles après le travail, tendance à consommer par automatisme quand il y a fatigue ou ennui.",
  internal_summary:
    "Le levier clé est la transition travail-soirée. Le plan doit éviter les sauts brusques et renforcer les alternatives de décompression.",
  progression_logic:
    "N1 casse l'automatisme de début de soirée. N2 introduit des jours off. N3 traite le stress sans béquille. N4 consolide le zéro.",
  situation_context:
    "La consommation n'est pas présentée comme festive mais comme réponse automatique à l'ennui et au stress.",
  mechanism_analysis:
    "Boucle principale : fatigue -> disponibilité mentale basse -> objet visible ou routine connue -> consommation rapide -> soulagement court.",
  key_understanding:
    "Le changement tient si le user a une alternative simple au moment exact du retour à la maison.",
  timeline_summary: "Plan progressif en quatre niveaux de trois semaines environ.",
  journey_context: {
    why_now: "Le user veut reprendre le contrôle sans rupture brutale.",
    important_constraints: ["fatigue du soir", "stress", "ennui", "peur de viser trop haut"],
  },
  metadata: {
    schedule_anchor: {
      version: 1,
      timezone: "Europe/Paris",
      generated_at_utc: "2026-06-19T10:00:00.000Z",
      anchor_week_start: "2026-06-15",
      anchor_week_end: "2026-06-21",
      days_remaining_in_anchor_week: 3,
      is_partial_anchor_week: false,
    },
    plan_adjustment_context: {
      note: "Synthetic QA context. No real user data.",
    },
  },
  current_level_runtime: {
    phase_id: "phase-1",
    level_order: 1,
    title: "Casser l'automatisme du soir",
    phase_objective: "Retarder la première consommation du soir en installant une transition alternative.",
    rationale:
      "Tant que le réflexe de début de soirée reste automatique, les jours complets sans consommation sont trop difficiles.",
    what_this_phase_targets: "Le déclencheur immédiat du retour à la maison.",
    why_this_now: "C'est le prérequis avant d'introduire des journées off.",
    how_this_phase_works:
      "Ranger les déclencheurs visibles, créer un sas de décompression, observer ce qui fait tenir ou décrocher.",
    duration_weeks: 3,
    phase_metric_target:
      "3 soirs par semaine où le user tient un sas de décompression avant toute consommation.",
    maintained_foundation: [],
    heartbeat: {
      title: "Soirs avec sas tenu",
      unit: "soirs/semaine",
      current: null,
      target: 3,
      tracking_mode: "inferred",
    },
    weeks: [
      {
        week_order: 1,
        title: "Préparer le terrain",
        focus: "Ranger les déclencheurs et observer le réflexe.",
        weekly_target_value: 1,
        weekly_target_label: "1 soir avec sas",
        progression_note: "Démarrage sans pression.",
        action_focus: ["ranger", "observer"],
        item_assignments: [
          { temp_id: "gen-p1-missions-001" },
          { temp_id: "gen-p1-habits-001" },
        ],
        reps_summary: "1 essai",
        mission_days: ["mon"],
        success_signal: "Le user sait nommer le moment du réflexe.",
        status: "current",
      },
      {
        week_order: 2,
        title: "Répéter la friction",
        focus: "Tenir le sas plus souvent.",
        weekly_target_value: 2,
        weekly_target_label: "2 soirs avec sas",
        progression_note: "Augmentation légère.",
        action_focus: ["sas", "alternative"],
        item_assignments: [
          { temp_id: "gen-p1-missions-002" },
          { temp_id: "gen-p1-habits-001" },
        ],
        reps_summary: "2 essais",
        mission_days: ["wed"],
        success_signal: "Le user a une alternative d'occupation.",
        status: "upcoming",
      },
      {
        week_order: 3,
        title: "Ancrer",
        focus: "Atteindre 3 soirs et faire le bilan.",
        weekly_target_value: 3,
        weekly_target_label: "3 soirs avec sas",
        progression_note: "Consolidation.",
        action_focus: ["bilan", "stabilisation"],
        item_assignments: [
          { temp_id: "gen-p1-clarifications-001" },
          { temp_id: "gen-p1-habits-001" },
        ],
        reps_summary: "3 essais",
        mission_days: ["sun"],
        success_signal: "Le réflexe n'est plus totalement automatique.",
        status: "upcoming",
      },
    ],
    review_focus: [
      "Le sas a-t-il retardé la première consommation ?",
      "L'ennui ou le stress a-t-il été le plus difficile ?",
    ],
  },
  phases: [
    {
      phase_id: "phase-1",
      phase_order: 1,
      title: "Casser l'automatisme du soir",
      phase_objective: "Retarder la première consommation du soir.",
      rationale: "Préparer le terrain avant les jours off.",
      duration_guidance: "3 semaines",
      duration_weeks: 3,
      what_this_phase_targets: "Automatisme du retour à la maison.",
      why_this_now: "Précondition des jours off.",
      how_this_phase_works: "Friction environnementale + sas.",
      phase_metric_target: "3 soirs/semaine avec sas.",
      maintained_foundation: [],
      heartbeat: {
        title: "Soirs avec sas tenu",
        unit: "soirs/semaine",
        current: null,
        target: 3,
        tracking_mode: "inferred",
      },
      items: [
        {
          temp_id: "gen-p1-missions-001",
          dimension: "missions",
          kind: "task",
          title: "Ranger les déclencheurs",
          description: "Mettre tout le matériel hors de vue dans une boîte fermée.",
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
          temp_id: "gen-p1-habits-001",
          dimension: "habits",
          kind: "habit",
          title: "Faire un sas de décompression",
          description: "Tenir 45 minutes d'activité alternative avant toute décision de consommer.",
          tracking_type: "count",
          activation_order: 2,
          activation_condition: null,
          support_mode: null,
          support_function: null,
          target_reps: 3,
          cadence_label: "3 soirs/semaine",
          scheduled_days: null,
          time_of_day: "evening",
          payload: {},
        },
        {
          temp_id: "gen-p1-missions-002",
          dimension: "missions",
          kind: "task",
          title: "Préparer une alternative anti-ennui",
          description: "Choisir deux activités faciles pour occuper la première heure du soir.",
          tracking_type: "boolean",
          activation_order: 3,
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
          kind: "framework",
          title: "Identifier le déclencheur principal",
          description: "Noter si le décrochage vient plutôt du stress, de l'ennui ou de la fatigue.",
          tracking_type: "boolean",
          activation_order: 4,
          activation_condition: null,
          support_mode: null,
          support_function: null,
          target_reps: null,
          cadence_label: null,
          scheduled_days: null,
          time_of_day: "anytime",
          payload: {},
        },
      ],
    },
  ],
  plan_blueprint: {
    global_objective: "Atteindre 0 jour de consommation par semaine de manière durable.",
    estimated_levels_count: 3,
    levels: [
      {
        phase_id: "phase-2",
        level_order: 2,
        title: "Intégrer des jours complets sans consommation",
        intention:
          "Passer du retardement quotidien à l'introduction de vrais jours off dans la semaine.",
        estimated_duration_weeks: 3,
        preview_summary:
          "Une fois le réflexe du soir cassé, commencer à instaurer des journées entières sans consommation.",
        status: "upcoming",
      },
      {
        phase_id: "phase-3",
        level_order: 3,
        title: "Gérer les moments de stress à vide",
        intention:
          "Traverser les journées stressantes sans utiliser l'habitude comme amortisseur.",
        estimated_duration_weeks: 3,
        preview_summary:
          "Traiter le vrai défi : les émotions difficiles, la fatigue et le stress.",
        status: "upcoming",
      },
      {
        phase_id: "phase-4",
        level_order: 4,
        title: "Le saut vers le zéro",
        intention:
          "Couper les dernières consommations résiduelles et consolider une identité sans cette béquille.",
        estimated_duration_weeks: 3,
        preview_summary: "Atteindre l'arrêt total et sécuriser les nouvelles routines.",
        status: "upcoming",
      },
    ],
  },
};

const currentRuntime = planContent.current_level_runtime as JsonRecord;
const currentPhase = (planContent.phases as JsonRecord[])[0];
const nextBlueprint = ((planContent.plan_blueprint as JsonRecord).levels as JsonRecord[])[0];
const futureBlueprint = ((planContent.plan_blueprint as JsonRecord).levels as JsonRecord[]).slice(1);
const completedLevelItems = (currentPhase.items as JsonRecord[]).map((item, index) => ({
  id: `synthetic-item-${index + 1}`,
  user_id: "synthetic-user",
  cycle_id: "cycle-synthetic",
  transformation_id: "transformation-synthetic",
  plan_id: "plan-synthetic",
  phase_id: "phase-1",
  phase_order: 1,
  status: "completed",
  current_reps: item.dimension === "habits" ? 2 : null,
  cards_status: null,
  ...item,
  payload: {
    ...(item.payload as JsonRecord),
    _generation: { temp_id: item.temp_id },
  },
}));

const schema = buildLevelReviewSchema({
  currentLevel: currentRuntime as never,
  items: completedLevelItems as never,
  weeks: (currentRuntime.weeks ?? []) as never,
  primaryMetricLabel: "Jours de consommation",
});

const cases = [
  {
    id: "keep_coherent",
    answers: {
      global_metric_state: "slight_progress",
      next_plan_coherence: "yes",
      difficulty_signal: "no",
      pride: "J'ai réussi à retarder la première consommation plusieurs soirs.",
    },
  },
  {
    id: "incoherent_next_level",
    answers: {
      global_metric_state: "stable",
      next_plan_coherence: "no",
      coherence_reason:
        "Passer directement à des jours complets sans consommation paraît trop brutal. Le vrai blocage reste le début de soirée et l'ennui.",
      difficulty_signal: "minor",
      pride: "J'ai compris que l'automatisme arrive surtout dans la première heure du soir.",
    },
  },
  {
    id: "blocking_difficulty",
    answers: {
      global_metric_state: "regressed",
      next_plan_coherence: "mostly",
      difficulty_signal: "blocking",
      difficulty_details:
        "Le sas saute dès que la journée a été stressante. Dans ces moments, je n'arrive pas à attendre.",
      pride: "Je vois maintenant que le stress est le déclencheur principal.",
    },
  },
];

await Deno.mkdir(OUT_DIR, { recursive: true });
const results = [];
for (const qaCase of cases) {
  const answers = normalizeLevelReviewAnswers(schema, qaCase.answers);
  const summary = buildLevelReviewSummary({ items: completedLevelItems as never, answers });
  const transition = buildNextLevelTransition({
    plan: planContent as never,
    summary,
    currentPhase: currentPhase as never,
  });
  const initialDecisionReason = transition.nextRuntime
    ? transition.preview.reason
    : nextBlueprint
    ? "Le niveau suivant est designé depuis le blueprint futur du plan, avec le bilan de fin de niveau comme signal de calibrage."
    : transition.preview.reason;
  const validationContext = {
    currentLevelOrder: 1,
    completedPhaseId: "phase-1",
    expectedNextBlueprint: nextBlueprint,
    existingCompletedTempIds: completedLevelItems.map((item) =>
      String((item as JsonRecord).temp_id)
    ),
    globalObjective: planContent.global_objective,
  };
  const context = {
    plan: planContent,
    currentLevelRuntime: currentRuntime,
    completedPhase: currentPhase,
    completedLevelItems,
    nextBlueprintLevel: nextBlueprint,
    futureBlueprintLevels: futureBlueprint,
    reviewSchema: schema,
    answers,
    summary,
    weeklySignals: [
      {
        source: "synthetic_qa_signal",
        signal: qaCase.id,
        note: qaCase.id === "keep_coherent"
          ? "Le cap tient, le user accepte la suite."
          : qaCase.id === "incoherent_next_level"
          ? "Le user craint un saut trop brutal vers les jours off."
          : "Le stress rend la marche suivante trop dure sans soutien.",
      },
    ],
    initialDecision: transition.preview.decision,
    initialDecisionReason,
    reviewMode: "user_review",
    transformationContext: {
      source: "synthetic_qa_no_real_user_data",
      original_data_summary:
        "Données synthétiques : objectif de réduction progressive, difficulté de stress/ennui le soir, besoin de progression douce.",
      important_constraints: ["stress du soir", "ennui", "peur du saut trop brutal"],
    },
  };
  const outPath = new URL(`${qaCase.id}.json`, OUT_DIR);
  try {
    const patch = await generateNextLevelForPlan({
      requestId: `synthetic-next-level-qa:${qaCase.id}:${Date.now()}`,
      userId: "synthetic-user-no-db",
      context: context as never,
      validationContext: validationContext as never,
    });
    const validation = validateNextLevelGenerationPatch(patch, validationContext as never);
    const output = {
      id: qaCase.id,
      answers,
      summary,
      transition_preview: transition.preview,
      validation,
      patch,
      compact: compactPatch(patch as unknown as JsonRecord),
    };
    await Deno.writeTextFile(outPath, JSON.stringify(output, null, 2));
    results.push({
      id: qaCase.id,
      outPath: outPath.pathname,
      ok: true,
      validation,
      compact: output.compact,
    });
  } catch (error) {
    const output = {
      id: qaCase.id,
      answers,
      summary,
      transition_preview: transition.preview,
      ok: false,
      error_name: error instanceof Error ? error.name : null,
      error_message: error instanceof Error ? error.message : String(error),
    };
    await Deno.writeTextFile(outPath, JSON.stringify(output, null, 2));
    results.push({
      id: qaCase.id,
      outPath: outPath.pathname,
      ok: false,
      error_name: output.error_name,
      error_message: output.error_message,
    });
  }
}

const summaryPath = new URL("summary.json", OUT_DIR);
await Deno.writeTextFile(summaryPath, JSON.stringify({
  generated_at: new Date().toISOString(),
  source: "synthetic_only_no_real_user_data",
  results,
}, null, 2));
console.log(JSON.stringify({ ok: true, summaryPath: summaryPath.pathname, results }, null, 2));
