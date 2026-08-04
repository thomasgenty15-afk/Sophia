import fs from "node:fs";

const repo = "/Users/ahmedamara/Dev/Sophia 2";

function readJson(path) {
  return JSON.parse(fs.readFileSync(path, "utf8"));
}

function clean(value, max = 240) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!text) return "Non renseigné";
  return text.length <= max ? text : `${text.slice(0, max - 3).trimEnd()}...`;
}

function summarizePhase(phase) {
  if (!phase) return "Aucun niveau suivant dans le plan actuel.";
  const items = (phase.items ?? []).slice(0, 8).map((item) =>
    `- [${item.dimension}] ${clean(item.title, 90)}: ${clean(item.description, 160)}`
  ).join("\n");
  return [
    `Niveau ${phase.phase_order}: ${clean(phase.title, 120)}`,
    `Objectif: ${clean(phase.phase_objective, 220)}`,
    `Pourquoi maintenant: ${clean(phase.why_this_now ?? phase.rationale, 220)}`,
    `Items:\n${items || "- Aucun item"}`,
  ].join("\n");
}

function findNextBlueprintLevel(plan, currentPhase) {
  return (plan.plan_blueprint?.levels ?? [])
    .filter((level) => level.level_order > currentPhase.phase_order)
    .sort((left, right) => left.level_order - right.level_order)[0] ?? null;
}

function summarizeNextLevel(plan, currentPhase, nextPhase) {
  if (nextPhase) return summarizePhase(nextPhase);
  const blueprintLevel = findNextBlueprintLevel(plan, currentPhase);
  if (!blueprintLevel) return summarizePhase(null);
  return [
    `Niveau ${blueprintLevel.level_order} (blueprint): ${clean(blueprintLevel.title, 120)}`,
    `Objectif prévu: ${clean(blueprintLevel.preview_summary ?? blueprintLevel.intention, 220)}`,
    `Pourquoi maintenant: ${clean(blueprintLevel.intention, 220)}`,
    `Durée estimée: ${blueprintLevel.estimated_duration_weeks} semaines`,
    "Items: à générer maintenant par l'IA à partir du bilan et du plan précédent.",
  ].join("\n");
}

function summarizeItems(items) {
  if (!items.length) return "- Aucun item matériel retrouvé pour ce niveau.";
  return items.slice(0, 20).map((item) => {
    const progress = item.target_reps
      ? `, progression ${item.current_reps ?? 0}/${item.target_reps}`
      : item.current_reps != null
      ? `, progression ${item.current_reps}`
      : "";
    const cadence = item.cadence_label ? `, cadence ${item.cadence_label}` : "";
    return `- [${item.dimension}/${item.kind}] ${clean(item.title, 90)}: statut ${item.status}${progress}${cadence}. ${clean(item.description, 180)}`;
  }).join("\n");
}

function buildFeedback({
  plan,
  currentPhase,
  nextPhase,
  levelItems,
  answers,
  summary,
  weeklySignals,
  decision,
  decisionReason,
  reviewMode,
}) {
  const futureBlueprint = plan.plan_blueprint?.levels?.length
    ? plan.plan_blueprint.levels.map((level) =>
      `- N${level.level_order} ${clean(level.title, 90)} (${level.estimated_duration_weeks} sem.): ${clean(level.preview_summary ?? level.intention, 160)}`
    ).join("\n")
    : "Aucun blueprint futur explicite.";

  return `Bilan de fin de niveau: le niveau courant est considéré comme terminé et ne doit pas être régénéré comme niveau courant.

Objectif de cet appel IA:
- décider si les réponses imposent de garder, alléger, accélérer ou réorienter la suite
- générer le prochain niveau comme nouveau current_level_runtime
- modifier les niveaux suivants dans le même plan si les informations du bilan l'exigent
- ne pas repartir de zéro: utiliser le plan précédent comme base, conserver ce qui reste pertinent, et changer uniquement ce que le bilan justifie
- raisonner comme un coach: préserver ce qui a donné de la traction, simplifier ce qui a créé de la friction, et ne jamais augmenter la charge si la disponibilité réelle du user baisse

Niveau terminé:
${summarizePhase(currentPhase)}

État réel des actions du niveau terminé:
${summarizeItems(levelItems)}

Prochain niveau prévu avant bilan:
${summarizeNextLevel(plan, currentPhase, nextPhase)}

Blueprint futur avant bilan:
${futureBlueprint}

Mode de bilan: ${reviewMode === "auto_timeout" ? "validation automatique sans questionnaire utilisateur direct" : "questionnaire utilisateur complété"}.

Réponses de bilan:
${Object.entries(answers).map(([key, value]) => `- ${key}: ${value}`).join("\n")}

Synthèse structurée du bilan:
${JSON.stringify(summary, null, 2)}

Signaux hebdo récents à utiliser comme contexte secondaire:
${weeklySignals.length ? weeklySignals.map((s, i) => `- Bilan hebdo ${i + 1}: ${clean(JSON.stringify(s), 900)}`).join("\n") : "- Aucun bilan hebdo récent disponible."}

Décision initiale de Sophia avant génération: ${decision}.
Raison: ${decisionReason}

Contraintes de génération:
- le nouveau current_level_runtime doit commencer après le niveau ${currentPhase.phase_order}
- l'objectif du prochain niveau doit faire avancer explicitement l'objectif global de transformation, via la primary_metric ou un prérequis clairement relié à cette métrique
- le prochain niveau doit rester cohérent avec la logique globale du plan: il ajoute une couche à ce qui précède, prépare correctement ce qui suit, et ne change pas de direction sans signal fort dans le bilan
- si la suite paraît cohérente et les difficultés sont faibles, garde la logique globale et ajuste seulement le dosage
- si la suite ne paraît pas cohérente, explique implicitement ce qui change via le nouveau niveau et le blueprint futur
- réutilise explicitement la fierté déclarée comme signal de ce qui doit être conservé
- si une difficulté bloquante apparaît, simplifie la charge du prochain niveau avant d'ajouter de nouvelles exigences`;
}

function assertIncludes(label, text, needle) {
  if (!text.includes(needle)) {
    throw new Error(`${label}: expected to include "${needle}"`);
  }
}

const planPromptSource = fs.readFileSync(
  `${repo}/supabase/functions/_shared/v2-prompts/plan-generation.ts`,
  "utf8",
);
const completeLevelSource = fs.readFileSync(
  `${repo}/supabase/functions/complete-level-v1/index.ts`,
  "utf8",
);

assertIncludes(
  "global V3 prompt",
  planPromptSource,
  `si le feedback contient un "Bilan de fin de niveau"`,
);
assertIncludes(
  "global V3 prompt",
  planPromptSource,
  "l'objectif du nouveau niveau courant doit contribuer explicitement à l'objectif global de transformation",
);
assertIncludes(
  "complete-level feedback source",
  completeLevelSource,
  "l'objectif du prochain niveau doit faire avancer explicitement l'objectif global de transformation",
);
assertIncludes(
  "complete-level feedback source",
  completeLevelSource,
  "le prochain niveau doit rester cohérent avec la logique globale du plan",
);
assertIncludes(
  "complete-level blueprint fallback source",
  completeLevelSource,
  "const shouldGenerateNextLevel = Boolean(transition.nextRuntime || nextBlueprintLevel)",
);

const roseSnapshot = readJson(
  `${repo}/tests/real-personas/rose/runs/operations/2026-05-21-adjust-plan-whole-plan-taxonomy-r105-short-consolidation-level.snapshot.json`,
);
const rosePlanRow = roseSnapshot.plans.find((plan) => plan.status === "active");
const rosePlan = rosePlanRow.content;
const roseRuntime = rosePlan.current_level_runtime;
const roseCurrentPhase = rosePlan.phases.find((phase) =>
  phase.phase_id === roseRuntime.phase_id ||
  phase.phase_order === roseRuntime.level_order
) ?? rosePlan.phases[0];
const roseNextPhase = rosePlan.phases.find((phase) =>
  phase.phase_order > roseCurrentPhase.phase_order
) ?? null;
const roseNextBlueprint = findNextBlueprintLevel(rosePlan, roseCurrentPhase);
const roseItems = (roseSnapshot.user_plan_items ?? []).filter((item) =>
  item.phase_id === roseCurrentPhase.phase_id
);
const roseFeedback = buildFeedback({
  plan: rosePlan,
  currentPhase: roseCurrentPhase,
  nextPhase: roseNextPhase,
  levelItems: roseItems,
  answers: {
    global_metric_state: "slight_progress",
    next_plan_coherence: "mostly",
    coherence_reason:
      "La suite reste bonne, mais il faut garder plus de respiration entre les conversations sensibles.",
    difficulty_signal: "minor",
    difficulty_details:
      "Le signal de pause aide, mais il est encore fragile quand la discussion part vite.",
    pride:
      "Avoir réussi à poser le signal avant que le ton monte une fois cette semaine.",
  },
  summary: {
    level_kind: "hybrid",
    global_metric_state: "slight_progress",
    next_plan_coherence: "mostly",
    difficulty_signal: "minor",
    pace_signal: "balanced",
    readiness_signal: "ready",
  },
  weeklySignals: (roseSnapshot.system_runtime_snapshots ?? [])
    .slice(0, 2)
    .map((snapshot) => snapshot.payload ?? snapshot),
  decision: "lighten",
  decisionReason:
    "Le niveau suivant garde la direction, mais avec un dosage plus simple à tenir.",
  reviewMode: "user_review",
});

const ninaPlan = {
  title: "Retrouver un poids de forme pour plus de confort au quotidien",
  primary_metric: {
    label: "jours avec collation brute ou sans grignotage",
    unit: "jours/semaine",
  },
  global_objective:
    "enclencher une perte de poids durable, à un rythme réaliste, pour retrouver plus d’aisance corporelle au quotidien.",
  progression_logic:
    "On traite d’abord l’environnement et le grignotage pour stopper la prise de poids et regagner de l’énergie, avant d’introduire du mouvement puis de revoir les repas.",
  phases: [
    {
      phase_id: "nina-p1",
      phase_order: 1,
      title: "Reprendre le contrôle sur le grignotage",
      phase_objective:
        "Casser la boucle du grignotage automatique et réduire la présence des produits transformés.",
      why_this_now:
        "Parce que les produits transformés accessibles maintiennent la boucle stress puis grignotage.",
      rationale:
        "C’est la source principale de calories superflues et de baisse d’énergie.",
      items: [
        {
          dimension: "missions",
          kind: "task",
          title: "Nettoyer ton environnement direct",
          description:
            "Retirer ou cacher les produits transformés les plus tentants.",
        },
        {
          dimension: "habits",
          kind: "habit",
          title: "Faire le choix du brut",
          description:
            "Choisir un aliment brut si Nina a faim entre les repas.",
        },
      ],
    },
    {
      phase_id: "nina-p2",
      phase_order: 2,
      title: "Stabiliser les alternatives simples",
      phase_objective:
        "Rendre les alternatives brutes plus faciles à attraper que les produits industriels.",
      why_this_now:
        "La suite doit consolider l’environnement avant d’ajouter du mouvement.",
      rationale:
        "Après le grignotage automatique, Nina doit rendre le bon choix plus disponible.",
      items: [
        {
          dimension: "missions",
          kind: "task",
          title: "Préparer tes alternatives d’avance",
          description:
            "Acheter et préparer des collations simples pour les moments de fatigue.",
        },
      ],
    },
  ],
  plan_blueprint: {
    global_objective: "Perte de poids durable sans surcharge",
    estimated_levels_count: 1,
    levels: [
      {
        phase_id: "nina-p2",
        level_order: 2,
        title: "Stabiliser les alternatives simples",
        intention: "Consolider l’environnement alimentaire",
        estimated_duration_weeks: 2,
        preview_summary:
          "Préparer des alternatives avant les moments de fatigue.",
      },
    ],
  },
};

const ninaFeedback = buildFeedback({
  plan: ninaPlan,
  currentPhase: ninaPlan.phases[0],
  nextPhase: ninaPlan.phases[1],
  levelItems: [
    {
      dimension: "missions",
      kind: "task",
      title: "Nettoyer ton environnement direct",
      status: "completed",
      description:
        "Retirer ou cacher les produits transformés les plus tentants.",
    },
    {
      dimension: "habits",
      kind: "habit",
      title: "Faire le choix du brut",
      status: "active",
      target_reps: 6,
      current_reps: 3,
      cadence_label: "6 jours / semaine",
      description:
        "Choisir un aliment brut si elle a faim entre les repas.",
    },
  ],
  answers: {
    global_metric_state: "unclear",
    next_plan_coherence: "not_sure",
    coherence_reason:
      "Validation automatique: l'utilisateur n'a pas répondu au bilan avant la fin du niveau.",
    difficulty_signal: "minor",
    difficulty_details:
      "Aucun signal utilisateur direct. Générer la suite prudemment, sans augmenter brutalement la charge.",
    pride:
      "Aucun bilan utilisateur disponible. Conserver ce qui était structurellement pertinent dans le niveau précédent.",
  },
  summary: {
    level_kind: "hybrid",
    global_metric_state: "unclear",
    next_plan_coherence: "not_sure",
    difficulty_signal: "minor",
    pace_signal: "balanced",
    readiness_signal: "need_more_time",
  },
  weeklySignals: [],
  decision: "lighten",
  decisionReason:
    "Le niveau suivant garde la direction, mais avec un dosage plus simple à tenir.",
  reviewMode: "auto_timeout",
});

const alexPlan = {
  title: "Apaiser son esprit pour s'endormir sereinement",
  primary_metric: {
    label: "temps d'endormissement",
    unit: "minutes",
  },
  global_objective:
    "s'endormir régulièrement en moins de 20 minutes sans ressentir le besoin d'être physiquement épuisé.",
  progression_logic:
    "On commence par vider la tête sur papier, puis on repère les pièges d'hypervigilance, avant d'ajuster le rituel du soir.",
  phases: [
    {
      phase_id: "alex-p1",
      phase_order: 1,
      title: "Installer un sas de déchargement mental",
      phase_objective:
        "Créer une rupture claire entre la journée active et la nuit en vidant la tête sur papier.",
      why_this_now:
        "Tant que le cerveau d'Alex a peur d'oublier des choses, il lutte contre le sommeil.",
      rationale:
        "Le premier verrou est d'externaliser les pensées avant d'aller au lit.",
      items: [
        {
          dimension: "missions",
          kind: "task",
          title: "Préparer ta zone de déchargement",
          description:
            "Choisir un carnet physique et un stylo, les poser loin du lit.",
        },
        {
          dimension: "habits",
          kind: "habit",
          title: "Faire le sas de déchargement",
          description:
            "Prendre 5 minutes avec le carnet pour noter to-do, idées et choses à ne pas oublier.",
        },
      ],
    },
    {
      phase_id: "alex-p2",
      phase_order: 2,
      title: "Repérer les pièges de l'hypervigilance",
      phase_objective:
        "Identifier ce qui pousse Alex à rallumer un écran ou retravailler après le sas.",
      why_this_now:
        "Une fois le sas installé, la suite logique est de réduire ce qui le fait sauter.",
      rationale:
        "Le plan avance vers l'endormissement plus court en retirant les relances mentales du soir.",
      items: [
        {
          dimension: "clarifications",
          kind: "exercise",
          title: "Cartographier les relances du soir",
          description:
            "Noter les déclencheurs qui ramènent Alex vers l'écran, le travail ou les listes.",
        },
      ],
    },
  ],
  plan_blueprint: {
    global_objective: "Endormissement plus rapide sans rigidifier le coucher",
    estimated_levels_count: 1,
    levels: [
      {
        phase_id: "alex-p2",
        level_order: 2,
        title: "Repérer les pièges de l'hypervigilance",
        intention:
          "Réduire les relances mentales qui reviennent après le sas.",
        estimated_duration_weeks: 2,
        preview_summary:
          "Comprendre pourquoi Alex rallume un écran ou repart travailler.",
      },
    ],
  },
};

const alexStrongFeedback = buildFeedback({
  plan: alexPlan,
  currentPhase: alexPlan.phases[0],
  nextPhase: alexPlan.phases[1],
  levelItems: [
    {
      dimension: "missions",
      kind: "task",
      title: "Préparer ta zone de déchargement",
      status: "completed",
      description:
        "Le carnet et le stylo sont prêts loin du lit.",
    },
    {
      dimension: "habits",
      kind: "habit",
      title: "Faire le sas de déchargement",
      status: "completed",
      target_reps: 6,
      current_reps: 6,
      cadence_label: "6 soirs / semaine",
      description:
        "Alex a vidé ses pensées sur papier avant le coucher.",
    },
  ],
  answers: {
    global_metric_state: "strong_progress",
    next_plan_coherence: "yes",
    coherence_reason:
      "La suite paraît logique parce que le sas fonctionne et les relances d'écran sont maintenant visibles.",
    difficulty_signal: "no",
    difficulty_details: "Rien de majeur, le carnet a rassuré Alex.",
    pride: "Avoir tenu le sas même les soirs chargés.",
  },
  summary: {
    level_kind: "hybrid",
    global_metric_state: "strong_progress",
    next_plan_coherence: "yes",
    difficulty_signal: "no",
    pace_signal: "balanced",
    readiness_signal: "very_ready",
  },
  weeklySignals: [
    {
      heartbeat: "6 soirs avec sas",
      sleep_latency_trend: "90 minutes vers 35-45 minutes",
    },
  ],
  decision: "shorten",
  decisionReason:
    "Le niveau suivant peut être raccourci pour capitaliser sur l'élan déjà présent.",
  reviewMode: "user_review",
});

const alexBlockingFeedback = buildFeedback({
  plan: alexPlan,
  currentPhase: alexPlan.phases[0],
  nextPhase: alexPlan.phases[1],
  levelItems: [
    {
      dimension: "missions",
      kind: "task",
      title: "Préparer ta zone de déchargement",
      status: "completed",
      description:
        "Le carnet est prêt mais reste peu utilisé.",
    },
    {
      dimension: "habits",
      kind: "habit",
      title: "Faire le sas de déchargement",
      status: "stalled",
      target_reps: 6,
      current_reps: 1,
      cadence_label: "6 soirs / semaine",
      description:
        "Alex oublie le sas quand les idées de projet reviennent tard.",
    },
  ],
  answers: {
    global_metric_state: "stable",
    next_plan_coherence: "no",
    coherence_reason:
      "Le prochain niveau va trop vite: le sas n'est pas encore assez stable pour analyser les pièges.",
    difficulty_signal: "blocking",
    difficulty_details:
      "Le moment de coupure est trop ambitieux et Alex rallume l'écran presque tout de suite.",
    pride: "Avoir préparé le carnet et compris que le problème est le moment de démarrage.",
  },
  summary: {
    level_kind: "hybrid",
    global_metric_state: "stable",
    next_plan_coherence: "no",
    difficulty_signal: "blocking",
    pace_signal: "too_heavy",
    readiness_signal: "need_more_time",
  },
  weeklySignals: [
    {
      blocker: "écran rallumé après le sas",
      load_balance: "too_heavy",
    },
  ],
  decision: "extend",
  decisionReason:
    "Le niveau suivant est allongé d'une semaine pour garder un rythme plus respirable.",
  reviewMode: "user_review",
});

const finalLevelPlan = {
  title: "Consolider une routine déjà stable",
  primary_metric: {
    label: "jours stables",
    unit: "jours/semaine",
  },
  global_objective:
    "maintenir une routine stable sans ajouter de nouvelles exigences.",
  phases: [
    {
      phase_id: "final-p1",
      phase_order: 1,
      title: "Consolider la routine",
      phase_objective:
        "Stabiliser ce qui fonctionne déjà et clôturer le plan proprement.",
      why_this_now:
        "Il n'y a plus de nouveau niveau à ouvrir, seulement une validation de fin.",
      rationale:
        "La progression attendue est terminée.",
      items: [
        {
          dimension: "habits",
          kind: "habit",
          title: "Garder le geste stable",
          description:
            "Maintenir le geste clé sans chercher à ajouter une couche.",
        },
      ],
    },
  ],
  plan_blueprint: {
    global_objective: "Plan terminé",
    estimated_levels_count: 0,
    levels: [],
  },
};

const finalLevelFeedback = buildFeedback({
  plan: finalLevelPlan,
  currentPhase: finalLevelPlan.phases[0],
  nextPhase: null,
  levelItems: [
    {
      dimension: "habits",
      kind: "habit",
      title: "Garder le geste stable",
      status: "completed",
      target_reps: 5,
      current_reps: 5,
      cadence_label: "5 jours / semaine",
      description:
        "Le geste clé est tenu sans surcharge.",
    },
  ],
  answers: {
    global_metric_state: "strong_progress",
    next_plan_coherence: "yes",
    coherence_reason:
      "Il n'y a pas de niveau suivant à ouvrir dans ce plan.",
    difficulty_signal: "no",
    difficulty_details: "Rien de majeur.",
    pride: "Avoir stabilisé le geste jusqu'au bout du plan.",
  },
  summary: {
    level_kind: "habit",
    global_metric_state: "strong_progress",
    next_plan_coherence: "yes",
    difficulty_signal: "no",
    pace_signal: "balanced",
    readiness_signal: "very_ready",
  },
  weeklySignals: [],
  decision: "keep",
  decisionReason:
    "Le dernier niveau est terminé. Il n'y a pas de niveau suivant à générer.",
  reviewMode: "user_review",
});

const cases = [
  {
    label: "Rose questionnaire rempli",
    feedback: roseFeedback,
    expectedMode: "questionnaire utilisateur complété",
    expectedItem: "Convenir d'un signal de pause",
    expectedNext: roseNextPhase?.title ?? roseNextBlueprint?.title,
  },
  {
    label: "Nina questionnaire absent",
    feedback: ninaFeedback,
    expectedMode: "validation automatique sans questionnaire utilisateur direct",
    expectedItem: "Faire le choix du brut",
    expectedNext: "Stabiliser les alternatives simples",
  },
  {
    label: "Alex progrès fort",
    feedback: alexStrongFeedback,
    expectedMode: "questionnaire utilisateur complété",
    expectedItem: "Faire le sas de déchargement",
    expectedNext: "Repérer les pièges de l'hypervigilance",
    expectedDecision: "shorten",
  },
  {
    label: "Alex blocage explicite",
    feedback: alexBlockingFeedback,
    expectedMode: "questionnaire utilisateur complété",
    expectedItem: "Faire le sas de déchargement",
    expectedNext: "Repérer les pièges de l'hypervigilance",
    expectedDecision: "extend",
    expectedExtra: "si une difficulté bloquante apparaît, simplifie la charge du prochain niveau",
  },
  {
    label: "Fin de plan sans prochain niveau",
    feedback: finalLevelFeedback,
    expectedMode: "questionnaire utilisateur complété",
    expectedItem: "Garder le geste stable",
    expectedNext: "Aucun niveau suivant dans le plan actuel.",
    expectedDecision: "keep",
    expectedExtra: "Aucun blueprint futur explicite.",
  },
];

for (const testCase of cases) {
  assertIncludes(testCase.label, testCase.feedback, "Bilan de fin de niveau");
  assertIncludes(testCase.label, testCase.feedback, testCase.expectedMode);
  assertIncludes(testCase.label, testCase.feedback, "État réel des actions du niveau terminé");
  assertIncludes(testCase.label, testCase.feedback, testCase.expectedItem);
  assertIncludes(testCase.label, testCase.feedback, testCase.expectedNext);
  assertIncludes(
    testCase.label,
    testCase.feedback,
    "l'objectif du prochain niveau doit faire avancer explicitement l'objectif global de transformation",
  );
  assertIncludes(
    testCase.label,
    testCase.feedback,
    "le prochain niveau doit rester cohérent avec la logique globale du plan",
  );
  if (testCase.expectedDecision) {
    assertIncludes(
      testCase.label,
      testCase.feedback,
      `Décision initiale de Sophia avant génération: ${testCase.expectedDecision}.`,
    );
  }
  if (testCase.expectedExtra) {
    assertIncludes(testCase.label, testCase.feedback, testCase.expectedExtra);
  }
}

assertIncludes(
  "Nina auto timeout",
  ninaFeedback,
  "Aucun bilan utilisateur disponible",
);
assertIncludes(
  "Nina weekly fallback",
  ninaFeedback,
  "Aucun bilan hebdo récent disponible",
);

console.log(JSON.stringify({
  ok: true,
  mutation: "none: fixture/source read only; no Supabase client; no edge function invoke",
  tests: cases.map((testCase) => ({
    label: testCase.label,
    feedback_chars: testCase.feedback.length,
    mode_ok: testCase.feedback.includes(testCase.expectedMode),
    item_state_ok: testCase.feedback.includes(testCase.expectedItem),
    next_level_ok: testCase.feedback.includes(testCase.expectedNext),
    global_objective_constraint_ok: testCase.feedback.includes(
      "l'objectif du prochain niveau doit faire avancer explicitement l'objectif global de transformation",
    ),
    plan_coherence_constraint_ok: testCase.feedback.includes(
      "le prochain niveau doit rester cohérent avec la logique globale du plan",
    ),
  })),
}, null, 2));
