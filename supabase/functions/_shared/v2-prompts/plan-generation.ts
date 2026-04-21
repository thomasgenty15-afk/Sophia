/**
 * V2 Plan Generation prompts — Étape 9 du flow canonique.
 *
 * Prend une transformation cristallisée + réponses questionnaire + profil
 * minimal et produit un JSON conforme à PlanContentV2.
 */

import type {
  CurrentLevelRuntime,
  HeartbeatMetric,
  PlanAdjustmentContext,
  PlanBlueprint,
  PlanContentItem,
  PlanTypeClassificationV1,
  PlanContentV2,
  PlanContentV3,
  PlanDimension,
  PlanLevelWeek,
  PlanItemKind,
  PlanPhase,
  SupportFunction,
  SupportMode,
  TrackingType,
} from "../v2-types.ts";

// Re-export for convenience when callers need the output shape
export type {
  CurrentLevelRuntime,
  HeartbeatMetric,
  PlanAdjustmentContext,
  PlanBlueprint,
  PlanContentItem,
  PlanContentV2,
  PlanContentV3,
  PlanLevelWeek,
  PlanPhase,
};

// ---------------------------------------------------------------------------
// Input type — ce qu'on envoie au LLM
// ---------------------------------------------------------------------------

export type PlanGenerationInput = {
  /** UUID du cycle. */
  cycle_id: string;
  /** UUID de la transformation. */
  transformation_id: string;
  /** Titre de la transformation. */
  title: string;
  /** Synthèse interne (détaillée, pour le système). */
  internal_summary: string;
  /** Synthèse user-ready. */
  user_summary: string;
  /** Définition de réussite si disponible. */
  success_definition: string | null;
  /** Contrainte principale si disponible. */
  main_constraint: string | null;
  /** Réponses au questionnaire sur mesure. */
  questionnaire_answers: Record<string, unknown>;
  /** Schéma du questionnaire sur mesure pour décoder les réponses custom. */
  questionnaire_schema?: Record<string, unknown> | null;
  /** Ancienneté du problème déduite du calibrage questionnaire. */
  struggle_duration: string | null;
  /** Niveau de départ concret. */
  starting_point: string | null;
  /** Blocage principal actuel. */
  main_blocker: string | null;
  /** Critère subjectif de transformation réussie. */
  priority_goal: string | null;
  /** Difficulté perçue actuelle. */
  perceived_difficulty: string | null;
  /** Facteur probable dominant. */
  probable_drivers: string | null;
  /** Historique de tentatives passées. */
  prior_attempts: string | null;
  /** Niveau de confiance auto-déclaré (1-5). */
  self_confidence: number | null;
  /** Indicateur concret de réussite. */
  success_indicator: string | null;
  /** Métrique principale déduite automatiquement. */
  metric_label?: string | null;
  metric_unit?: string | null;
  metric_direction?: string | null;
  metric_measurement_mode?: string | null;
  metric_baseline_value?: number | null;
  metric_target_value?: number | null;
  metric_baseline_text?: string | null;
  metric_target_text?: string | null;
  /** Plan précédent à utiliser comme base lors d'une régénération. */
  previous_plan_preview?: PlanContentV3 | null;
  /** Contexte hérité de la transformation précédente dans un parcours en plusieurs parties. */
  previous_transformation_title?: string | null;
  previous_transformation_summary?: string | null;
  previous_transformation_success_definition?: string | null;
  previous_transformation_completion_summary?: string | null;
  previous_transformation_questionnaire_answers?: Record<string, unknown> | null;
  previous_transformation_questionnaire_schema?: Record<string, unknown> | null;
  previous_transformation_plan_preview?: PlanContentV3 | null;
  /** Position courante dans un parcours multi-parties si applicable. */
  journey_part_number?: number | null;
  journey_total_parts?: number | null;
  journey_continuation_hint?: string | null;
  /** Feedback explicite de l'utilisateur sur une version précédente du plan. */
  regeneration_feedback?: string | null;
  /** Feedback technique interne si une première sortie a échoué la validation. */
  system_validation_feedback?: string[] | null;
  /** Classification produit du type de plan. */
  plan_type_classification?: PlanTypeClassificationV1 | null;
  /** Rythme souhaite par l'utilisateur. */
  user_requested_pace?: "cool" | "normal" | "intense" | null;
  /** Durée de référence (V2: choix user 1-3, V3: ignoré — l'IA decide). */
  duration_months?: 1 | 2 | 3;
  /** Âge de l'utilisateur (calculé depuis birth_date). */
  user_age: number | null;
  /** Genre de l'utilisateur. */
  user_gender: string | null;
  /** Fuseau horaire utilisateur au moment de la generation. */
  user_timezone?: string | null;
  /** Date locale utilisateur au format YYYY-MM-DD. */
  user_local_date?: string | null;
  /** Date locale lisible pour le prompt. */
  user_local_human?: string | null;
  /** Debut de la semaine ISO locale courante. */
  anchor_week_start?: string | null;
  /** Fin de la semaine ISO locale courante. */
  anchor_week_end?: string | null;
  /** Nombre de jours restants dans la semaine locale courante. */
  days_remaining_in_anchor_week?: number | null;
  /** Indique si la semaine 1 commence en cours de semaine. */
  is_partial_anchor_week?: boolean | null;
};

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

export const PLAN_GENERATION_SYSTEM_PROMPT =
  `Tu es le module de génération de plan de Sophia, une application de transformation personnelle.

## Ta mission

Tu reçois une transformation cristallisée (titre, synthèses, contraintes), les réponses au questionnaire sur mesure et le profil minimal de l'utilisateur. Tu dois produire un plan d'action complet structuré en 3 dimensions.

## Architecture du plan

Le plan V2 n'est PAS structuré en phases temporelles. Il est structuré en **3 dimensions** :

### 1. Support — Leviers de soutien
Items qui aident, soutiennent, éclairent. Chaque item de support a :
- un \`kind\` : "framework" (protocole structuré) ou "exercise" (pratique ponctuelle)
- un \`support_mode\` obligatoire :
  - "always_available" : outil toujours accessible, pas mis en avant
  - "recommended_now" : outil actuellement au premier plan
  - "unlockable" : accessible après une condition
- un \`support_function\` obligatoire :
  - "practice" : à pratiquer régulièrement
  - "rescue" : à mobiliser dans les moments critiques
  - "understanding" : pour clarifier, comprendre, conscientiser

### 2. Missions — Actions concrètes d'avancée
Items qui font avancer concrètement. Chaque item a :
- un \`kind\` : "task" (action one-shot) ou "milestone" (jalon vérifiable)
- les missions sont le moteur de progression — chaque completion débloque la suite

### 3. Habits — Habitudes à installer
Items répétitifs à ancrer. Chaque item a :
- un \`kind\` : "habit"
- un \`cadence_label\` (ex: "quotidien", "3x/semaine", "chaque matin")
- un \`target_reps\` si pertinent
- un \`time_of_day\` si pertinent ("morning", "afternoon", "evening", "anytime")
- des \`scheduled_days\` si pertinent (ex: ["lundi", "mercredi", "vendredi"])

## Débloquage conditionnel

Les items ne se débloquent PAS parce qu'on est "en semaine 2". Ils se débloquent quand des préconditions sont atteintes.

Chaque item a un champ \`activation_condition\` qui peut être :
- \`null\` → actif dès le départ
- \`{ "type": "immediate" }\` → actif dès le départ (explicite)
- \`{ "type": "after_item_completion", "depends_on": ["gen-xxx-001"] }\` → actif après complétion d'un autre item
- \`{ "type": "after_habit_traction", "depends_on": ["gen-habits-001"], "min_completions": 3 }\` → actif après 3 réussites d'une habitude
- \`{ "type": "after_milestone", "depends_on": ["gen-missions-002"] }\` → actif après un milestone

\`depends_on\` est toujours un tableau de temp_id (même s'il n'y en a qu'un).

Le champ \`activation_order\` (entier >= 1) donne l'ordre global prévu d'activation.

## Caps de charge active au départ

Le plan doit respecter ces limites pour les items actifs **dès le départ** (activation_condition = null ou immediate) :
- **1 mission principale** active maximum (la plus impactante ou accessible)
- **1 mission secondaire** optionnelle si la charge est légère
- **1 à 2 supports** en mode "recommended_now"
- **Maximum 2 habitudes** en construction simultanée
- Tous les autres items doivent avoir une \`activation_condition\` non-nulle

Ces caps existent pour éviter la surcharge et favoriser la traction réelle.

## Règles de génération

### Personnalisation
- Les items doivent être concrets et personnalisés à la situation de l'utilisateur, PAS génériques
- Utilise les informations du questionnaire et de la synthèse interne pour cibler les items
- Adapte le vocabulaire au contexte de l'utilisateur
- Les descriptions doivent expliquer concrètement quoi faire, pas juste énoncer un objectif

### Densité selon la durée
La durée (1, 2 ou 3 mois) modifie la densité et la vitesse de déblocage, PAS la structure :
- **1 mois** : plan intense, moins d'items au total, déblocages rapides, focus resserré
- **2 mois** : plan progressif, rythme modéré, ouverture graduelle
- **3 mois** : plan très progressif, plus d'items au total, déblocages espacés, construction lente

### Habitudes
- Les habitudes suivent une logique de "preuves d'ancrage" (3 réussites sur 5 opportunités) — PAS de streak pur
- La prochaine habitude se débloque quand la précédente a une traction suffisante
- Débloquer la suivante ne veut pas dire abandonner la précédente
- Utilise \`after_habit_traction\` comme activation_condition entre habitudes

### Supports
- Au moins 1 support "always_available" de type "rescue" (outil de secours toujours dispo)
- Au moins 1 support "recommended_now" de type "practice" au départ
- Les supports "understanding" sont souvent one-shot (tracking_type: "boolean")
- Les supports ne doivent pas être du remplissage — chacun doit avoir une utilité claire

### Stratégie
Le bloc strategy du plan doit contenir :
- \`success_definition\` : ce qui constitue une réussite à la fin du plan
- \`main_constraint\` : la contrainte principale à respecter

### temp_id
Chaque item doit avoir un \`temp_id\` unique au format :
- \`"gen-support-001"\`, \`"gen-support-002"\`...
- \`"gen-missions-001"\`, \`"gen-missions-002"\`...
- \`"gen-habits-001"\`, \`"gen-habits-002"\`...

Ces IDs sont utilisés dans les \`activation_condition.depends_on\` pour référencer les dépendances.

## Format de sortie

Tu dois retourner UNIQUEMENT un JSON valide conforme au schéma suivant :

\`\`\`json
{
  "version": 2,
  "cycle_id": "{{cycle_id}}",
  "transformation_id": "{{transformation_id}}",
  "duration_months": 2,
  "title": "Titre du plan",
  "user_summary": "Résumé empathique pour l'utilisateur (2-4 phrases)",
  "internal_summary": "Résumé analytique pour le système (5-10 phrases)",
  "strategy": {
    "success_definition": "string",
    "main_constraint": "string"
  },
  "dimensions": [
    {
      "id": "support",
      "title": "Leviers de soutien",
      "items": [
        {
          "temp_id": "gen-support-001",
          "dimension": "support",
          "kind": "framework",
          "title": "Titre concret",
          "description": "Description détaillée de quoi faire",
          "tracking_type": "boolean",
          "activation_order": 1,
          "activation_condition": null,
          "support_mode": "recommended_now",
          "support_function": "practice",
          "target_reps": null,
          "cadence_label": null,
          "scheduled_days": null,
          "time_of_day": null,
          "payload": {}
        }
      ]
    },
    {
      "id": "missions",
      "title": "Missions",
      "items": [
        {
          "temp_id": "gen-missions-001",
          "dimension": "missions",
          "kind": "task",
          "title": "Action concrète",
          "description": "Ce qu'il faut faire exactement",
          "tracking_type": "boolean",
          "activation_order": 1,
          "activation_condition": null,
          "support_mode": null,
          "support_function": null,
          "target_reps": null,
          "cadence_label": null,
          "scheduled_days": null,
          "time_of_day": null,
          "payload": {}
        }
      ]
    },
    {
      "id": "habits",
      "title": "Habitudes",
      "items": [
        {
          "temp_id": "gen-habits-001",
          "dimension": "habits",
          "kind": "habit",
          "title": "Habitude concrète",
          "description": "Comment pratiquer cette habitude au quotidien",
          "tracking_type": "boolean",
          "activation_order": 1,
          "activation_condition": null,
          "support_mode": null,
          "support_function": null,
          "target_reps": 21,
          "cadence_label": "quotidien",
          "scheduled_days": null,
          "time_of_day": "morning",
          "payload": {}
        }
      ]
    }
  ],
  "timeline_summary": "Résumé de la progression prévue en 1-2 phrases",
  "metadata": {}
}
\`\`\`

### Valeurs autorisées

- \`dimension\` : "support" | "missions" | "habits"
- \`kind\` : "framework" | "exercise" | "task" | "milestone" | "habit"
- \`tracking_type\` : "boolean" | "count" | "scale" | "text" | "milestone"
- \`support_mode\` : "always_available" | "recommended_now" | "unlockable" (obligatoire si dimension = "support", null sinon)
- \`support_function\` : "practice" | "rescue" | "understanding" (obligatoire si dimension = "support", null sinon)
- \`time_of_day\` : "morning" | "afternoon" | "evening" | "anytime" | null
- \`activation_condition.type\` : "immediate" | "after_item_completion" | "after_habit_traction" | "after_milestone"

### Contraintes quantitatives

- Items support : 3 à 8
- Items missions : 3 à 10
- Items habits : 2 à 5
- Au départ (activation_condition null/immediate) : max 1-2 missions, 1-2 supports recommended_now, max 2 habits
- Chaque dimension doit avoir au moins 1 item

### Cohérence de la chaîne de déblocage

- Les \`depends_on\` doivent référencer des \`temp_id\` existants dans le plan
- Pas de dépendance circulaire
- Au moins 1 item par dimension doit être actif dès le départ
- L'activation_order doit être cohérent avec les dépendances

Ne retourne RIEN d'autre que le JSON. Pas de texte avant, pas de texte après, pas de markdown.`;

// ---------------------------------------------------------------------------
// User prompt builder
// ---------------------------------------------------------------------------

export function buildPlanGenerationUserPrompt(
  input: PlanGenerationInput,
): string {
  const profileLines: string[] = [];
  if (input.user_age != null) {
    profileLines.push(`- Âge : ${input.user_age} ans`);
  }
  if (input.user_gender) profileLines.push(`- Genre : ${input.user_gender}`);
  profileLines.push(`- Durée de référence actuelle : ${input.duration_months} mois`);

  const profileBlock = profileLines.join("\n");

  const answersBlock = Object.keys(input.questionnaire_answers).length > 0
    ? `\n\n## Réponses au questionnaire sur mesure\n\n${
      formatAnswers(input.questionnaire_answers, input.questionnaire_schema ?? null)
    }`
    : "";

  const calibrationLines = [
    `- Ancienneté du problème : ${input.struggle_duration ?? "Non renseignée"}`,
    `- Métrique principale : ${input.metric_label ?? "Non renseignée"}${input.metric_unit ? ` (${input.metric_unit})` : ""}`,
    `- Mode de mesure : ${input.metric_measurement_mode ?? "Non renseigné"}`,
    `- Direction attendue : ${input.metric_direction ?? "Non renseignée"}`,
    `- Valeur de départ : ${input.metric_baseline_text ?? input.starting_point ?? "Non renseignée"}`,
    `- Valeur cible : ${input.metric_target_text ?? input.success_indicator ?? "Non renseignée"}`,
    `- Blocage principal : ${input.main_blocker ?? "Non renseigné"}`,
    `- Critère subjectif de réussite : ${
      input.priority_goal ?? "Non renseigné"
    }`,
    `- Difficulté perçue : ${input.perceived_difficulty ?? "Non renseignée"}`,
    `- Facteur probable dominant : ${input.probable_drivers ?? "Non renseigné"}`,
  ];
  if (input.prior_attempts) {
    calibrationLines.push(`- Tentatives passées : ${input.prior_attempts}`);
  }
  if (input.self_confidence != null) {
    calibrationLines.push(`- Confiance (1-5) : ${input.self_confidence}`);
  }
  const calibrationBlock = `\n\n## Calibrage de l'effort initial

${calibrationLines.join("\n")}`;

  const feedbackValue = input.regeneration_feedback?.trim();
  const feedbackBlock = feedbackValue
    ? `\n\n## Feedback utilisateur sur la version précédente du plan

${feedbackValue}`
    : "";

  const previousPlanBlock = input.previous_plan_preview
    ? `\n\n## Plan précédent à prendre comme base

${summarizePreviousPlanForPrompt(input.previous_plan_preview)}`
    : "";

  const constraintsBlock = [
    input.success_definition
      ? `- Définition de réussite : ${input.success_definition}`
      : null,
    input.main_constraint
      ? `- Contrainte principale : ${input.main_constraint}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `## Transformation à planifier

- Titre : ${input.title}
- cycle_id : ${input.cycle_id}
- transformation_id : ${input.transformation_id}
${constraintsBlock ? `${constraintsBlock}\n` : ""}
### Synthèse interne (pour toi)

${input.internal_summary}

### Synthèse utilisateur

${input.user_summary}

## Profil utilisateur

${profileBlock}${calibrationBlock}${answersBlock}

Génère le JSON du plan V2 complet.`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAnswers(
  answers: Record<string, unknown>,
  questionnaireSchema: Record<string, unknown> | null,
): string {
  const questions = extractQuestionDescriptors(questionnaireSchema);
  return Object.entries(answers)
    .map(([key, value]) => formatSingleAnswer(key, value, questions))
    .join("\n\n");
}

type PromptQuestionOptionDescriptor = {
  id: string;
  label: string;
};

type PromptQuestionDescriptor = {
  id: string;
  question: string;
  options: PromptQuestionOptionDescriptor[];
};

const OTHER_PREFIX = "__other__:";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function extractQuestionDescriptors(
  questionnaireSchema: Record<string, unknown> | null,
): Map<string, PromptQuestionDescriptor> {
  const questions = new Map<string, PromptQuestionDescriptor>();
  const rawQuestions = questionnaireSchema?.questions;
  if (!Array.isArray(rawQuestions)) return questions;

  for (const candidate of rawQuestions) {
    if (!isRecord(candidate)) continue;
    const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
    const question = typeof candidate.question === "string"
      ? candidate.question.trim()
      : "";
    if (!id || !question) continue;

    const rawOptions = Array.isArray(candidate.options) ? candidate.options : [];
    const options = rawOptions.flatMap((option): PromptQuestionOptionDescriptor[] => {
      if (!isRecord(option)) return [];
      const optionId = typeof option.id === "string" ? option.id.trim() : "";
      const label = typeof option.label === "string" ? option.label.trim() : "";
      return optionId && label ? [{ id: optionId, label }] : [];
    });

    questions.set(id, { id, question, options });
  }

  return questions;
}

function decodeAnswerToken(
  token: unknown,
  descriptor: PromptQuestionDescriptor | null,
): string | null {
  if (typeof token === "number" && Number.isFinite(token)) {
    return String(token);
  }
  if (typeof token !== "string") return null;

  const trimmed = token.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith(OTHER_PREFIX)) {
    const otherText = trimmed.slice(OTHER_PREFIX.length).trim();
    return otherText || "Autre";
  }

  const matchedOption = descriptor?.options.find((option) => option.id === trimmed);
  return matchedOption?.label ?? trimmed;
}

function formatSingleAnswer(
  key: string,
  value: unknown,
  questions: Map<string, PromptQuestionDescriptor>,
): string {
  const descriptor = questions.get(key) ?? null;
  const label = descriptor?.question ?? key;

  if (Array.isArray(value)) {
    const decodedValues = value
      .map((item) => decodeAnswerToken(item, descriptor))
      .filter((item): item is string => !!item)
      .filter((item, index, array) => array.indexOf(item) === index);

    if (decodedValues.length === 0) {
      return `**${label}** : []`;
    }

    return `**${label}** :\n${decodedValues.map((item) => `  - ${item}`).join("\n")}`;
  }

  const decodedValue = decodeAnswerToken(value, descriptor) ?? String(value);
  return `**${label}** : ${decodedValue}`;
}

function summarizePreviousPlanForPrompt(plan: PlanContentV3): string {
  const phaseBlocks = plan.phases.map((phase) => {
    const itemLines = phase.items.length > 0
      ? phase.items.map((item) =>
        `  - [${item.dimension}] ${item.title}: ${item.description}`
      ).join("\n")
      : "  - Aucun item";

    return [
      `### Niveau ${phase.phase_order} - ${phase.title}`,
      `- Durée : ${phase.duration_guidance || "Non renseignée"}`,
      `- Objectif : ${phase.phase_objective}`,
      `- Pourquoi maintenant : ${phase.why_this_now || phase.rationale}`,
      phase.phase_metric_target
        ? `- Cible du niveau : ${phase.phase_metric_target}`
        : null,
      "- Items :",
      itemLines,
    ].filter(Boolean).join("\n");
  }).join("\n\n");

  const blueprintLevels = Array.isArray(plan.plan_blueprint?.levels)
    ? plan.plan_blueprint.levels
      .map((level) =>
        `- Niveau ${level.level_order}: ${level.title} — ${level.intention}`
      )
      .join("\n")
    : "";

  return [
    `- Titre : ${plan.title}`,
    `- Durée totale : ${plan.duration_months} mois`,
    plan.primary_metric?.label ? `- Métrique principale : ${plan.primary_metric.label}` : null,
    plan.progression_logic ? `- Logique de progression : ${plan.progression_logic}` : null,
    "",
    phaseBlocks,
    blueprintLevels
      ? `\n### Niveaux futurs déjà prévus\n${blueprintLevels}`
      : null,
  ].filter(Boolean).join("\n");
}

// ---------------------------------------------------------------------------
// Type guards for runtime validation of LLM output
// ---------------------------------------------------------------------------

const VALID_DIMENSIONS: ReadonlySet<PlanDimension> = new Set([
  "clarifications",
  "support",
  "missions",
  "habits",
]);
const VALID_KINDS: ReadonlySet<PlanItemKind> = new Set([
  "framework",
  "exercise",
  "task",
  "milestone",
  "habit",
]);
const VALID_TRACKING: ReadonlySet<TrackingType> = new Set([
  "boolean",
  "count",
  "scale",
  "text",
  "milestone",
]);
const VALID_SUPPORT_MODES: ReadonlySet<SupportMode> = new Set([
  "always_available",
  "recommended_now",
  "unlockable",
]);
const VALID_SUPPORT_FUNCTIONS: ReadonlySet<SupportFunction> = new Set([
  "practice",
  "rescue",
  "understanding",
]);

const KINDS_BY_DIMENSION: Record<PlanDimension, ReadonlySet<PlanItemKind>> = {
  clarifications: new Set(["framework", "exercise"]),
  support: new Set(["framework", "exercise"]),
  missions: new Set(["task", "milestone"]),
  habits: new Set(["habit"]),
};

const VALID_ACTIVATION_TYPES: ReadonlySet<string> = new Set([
  "immediate",
  "after_item_completion",
  "after_habit_traction",
  "after_milestone",
]);
const VALID_V3_DIMENSIONS: ReadonlySet<PlanDimension> = new Set([
  "clarifications",
  "missions",
  "habits",
]);
const TEMP_ID_V3_PATTERN =
  /^gen-p(\d+)-(clarifications|missions|habits)-(\d{3})$/;

export type PlanValidationResult = {
  valid: boolean;
  issues: string[];
};

/** Normalize depends_on to a string array (accepts string or string[]). */
function normalizeDependsOn(
  value: unknown,
): { deps: string[]; ok: boolean } {
  if (typeof value === "string") return { deps: [value], ok: true };
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
    return { deps: value as string[], ok: true };
  }
  return { deps: [], ok: false };
}

/** Light structural validation of LLM-produced plan JSON. */
export function validatePlanOutput(
  raw: unknown,
): PlanValidationResult {
  const issues: string[] = [];

  if (!raw || typeof raw !== "object") {
    return { valid: false, issues: ["output is not an object"] };
  }

  const plan = raw as Record<string, unknown>;

  if (plan.version !== 2) issues.push("version must be 2");
  if (typeof plan.cycle_id !== "string" || !plan.cycle_id) {
    issues.push("missing or invalid cycle_id");
  }
  if (typeof plan.transformation_id !== "string" || !plan.transformation_id) {
    issues.push("missing or invalid transformation_id");
  }
  if (![1, 2, 3].includes(plan.duration_months as number)) {
    issues.push(
      `invalid duration_months: ${plan.duration_months} (must be 1, 2 or 3)`,
    );
  }
  if (!isNonEmptyString(plan.title)) {
    issues.push("missing title");
  }
  if (!isNonEmptyString(plan.global_objective)) {
    issues.push("missing global_objective");
  }
  if (!isNonEmptyString(plan.user_summary)) {
    issues.push("missing user_summary");
  }
  if (!isNonEmptyString(plan.internal_summary)) {
    issues.push("missing internal_summary");
  }

  if (!plan.strategy || typeof plan.strategy !== "object") {
    issues.push("missing strategy block");
  }

  const dims = plan.dimensions;
  if (!Array.isArray(dims) || dims.length !== 3) {
    issues.push("dimensions must be array of 3");
    return { valid: false, issues };
  }

  const seenTempIds = new Set<string>();

  for (const dim of dims as Array<Record<string, unknown>>) {
    const dimId = dim.id as string;
    if (!VALID_DIMENSIONS.has(dimId as PlanDimension)) {
      issues.push(`invalid dimension id: ${dimId}`);
      continue;
    }

    const items = dim.items;
    if (!Array.isArray(items) || items.length === 0) {
      issues.push(`dimension ${dimId} has no items`);
      continue;
    }

    const allowedKinds = KINDS_BY_DIMENSION[dimId as PlanDimension];

    for (const item of items as Array<Record<string, unknown>>) {
      const tempId = item.temp_id as string;
      if (!tempId || typeof tempId !== "string") {
        issues.push("item missing temp_id");
        continue;
      }
      if (seenTempIds.has(tempId)) {
        issues.push(`duplicate temp_id: ${tempId}`);
      }
      seenTempIds.add(tempId);

      if (item.dimension !== dimId) {
        issues.push(
          `item ${tempId} dimension mismatch: ${item.dimension} vs ${dimId}`,
        );
      }
      if (!VALID_KINDS.has(item.kind as PlanItemKind)) {
        issues.push(`item ${tempId} invalid kind: ${item.kind}`);
      } else if (!allowedKinds.has(item.kind as PlanItemKind)) {
        issues.push(
          `item ${tempId} kind "${item.kind}" not allowed in dimension "${dimId}"`,
        );
      }
      if (!VALID_TRACKING.has(item.tracking_type as TrackingType)) {
        issues.push(
          `item ${tempId} invalid tracking_type: ${item.tracking_type}`,
        );
      }
      if (!item.title || typeof item.title !== "string") {
        issues.push(`item ${tempId} missing title`);
      }

      if (dimId === "support") {
        if (!VALID_SUPPORT_MODES.has(item.support_mode as SupportMode)) {
          issues.push(`item ${tempId} invalid/missing support_mode`);
        }
        if (
          !VALID_SUPPORT_FUNCTIONS.has(
            item.support_function as SupportFunction,
          )
        ) {
          issues.push(`item ${tempId} invalid/missing support_function`);
        }
      }

      // Validate activation_condition structure
      const cond = item.activation_condition as
        | Record<
          string,
          unknown
        >
        | null;
      if (cond && typeof cond === "object") {
        const condType = cond.type as string;
        if (!condType || !VALID_ACTIVATION_TYPES.has(condType)) {
          issues.push(
            `item ${tempId} invalid activation_condition.type: "${condType}"`,
          );
        }
      }
    }
  }

  // Validate activation_condition.depends_on references
  for (const dim of dims as Array<Record<string, unknown>>) {
    const items = (dim.items ?? []) as Array<Record<string, unknown>>;
    for (const item of items) {
      const cond = item.activation_condition as
        | Record<
          string,
          unknown
        >
        | null;
      if (cond && typeof cond === "object" && cond.depends_on != null) {
        const { deps, ok } = normalizeDependsOn(cond.depends_on);
        if (!ok) {
          issues.push(
            `item ${item.temp_id} depends_on must be a string or string[]`,
          );
        } else {
          for (const dep of deps) {
            if (!seenTempIds.has(dep)) {
              issues.push(
                `item ${item.temp_id} depends_on unknown temp_id: ${dep}`,
              );
            }
          }
        }
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

// ===========================================================================
// V3 — Plan par phases + Heartbeat
// ===========================================================================

// ---------------------------------------------------------------------------
// V3 System prompt
// ---------------------------------------------------------------------------

export const PLAN_GENERATION_V3_SYSTEM_PROMPT =
  `Tu es le module de génération de plan de Sophia, une application de transformation personnelle.

## Ta mission

Tu reçois une transformation cristallisée (titre, synthèses, contraintes), les réponses au questionnaire sur mesure, le profil minimal de l'utilisateur, un bloc de calibrage, et éventuellement une classification de type de plan. Tu dois produire un plan d'action complet structuré en **phases séquentielles**.

## Voix et adresse

- Tous les textes destinés à l'utilisateur doivent être rédigés en **tutoiement**.
- N'utilise jamais le vouvoiement dans les champs user-facing du plan.
- Cela inclut notamment : \`title\`, \`user_summary\`, \`inspiration_narrative\`, les \`title\` de phases, les \`phase_objective\`, les \`rationale\`, les \`heartbeat.title\`, ainsi que les \`title\` et \`description\` des items.

## Architecture du plan V3

Le plan V3 est structuré en **phases séquentielles**. Chaque phase regroupe des items de 3 dimensions :
- \`clarifications\`
- \`missions\`
- \`habits\`

Le plan ne doit PAS générer de dimension \`support\`.
\`support\` reste une surface produit externe au plan (labo, atelier, cartes, etc.).
Si une action redirige surtout vers un module d'aide, ne la mets pas dans le plan.
Si une action aide à relire, orienter, comprendre, décider ou clarifier la route, elle peut être une \`clarification\`.

## Phase 1 universelle hors plan

Important : le produit possède déjà un **niveau de plan 1 universel** en dehors du JSON du plan.

Ce niveau de plan 1 universel sert à :
- installer le socle de départ
- clarifier le vrai moteur du changement
- préparer les cartes de défense / attaque et les premiers appuis utiles
- donner du sens avant l'exécution opérationnelle

Conséquence :
- le JSON que tu génères représente la suite du parcours **après** ce niveau de plan 1 universel
- le **premier niveau de plan du plan généré** sera affiché à l'utilisateur comme un **niveau de plan 2**
- mais pour des raisons techniques, dans le JSON tu dois quand même garder \`phase_order\` séquentiel à partir de \`1\`
- donc \`phase_order = 1\` dans le JSON signifie en pratique : **premier niveau de plan du plan généré, affiché comme niveau de plan 2 côté produit**

## Vocabulaire produit obligatoire

Dans toutes les formulations destinées a l'utilisateur :
- parle de **niveau de plan**
- n'utilise pas **phase**
- n'utilise pas **palier**

Important :
- les champs techniques restent \`phase_id\`, \`phase_order\`, \`phase_metric_target\`, etc.
- mais les textes user-facing comme \`progression_logic\`, \`rationale\`, \`what_this_phase_targets\`, \`why_this_now\`, \`how_this_phase_works\` ou les formulations explicatives doivent parler de **niveau de plan**

Implication de génération :
- ne recrée pas dans le plan une pseudo phase de préparation générale ou de fondations abstraites déjà couvertes par le niveau de plan 1 universel
- commence directement par le premier niveau de plan opérationnel crédible **après** ce socle initial
- le premier niveau de plan peut rester doux, mais il doit déjà appartenir à l'exécution réelle de la transformation
- n'utilise pas la première phase du plan pour refaire du meta, de l'orientation vague ou du simple préchauffage sans action concrète si un vrai levier crédible existe

## Lecture globale de la roadmap

Le plan doit aider l'utilisateur a comprendre son probleme, pas seulement a empiler des actions.

Le haut de la roadmap doit donc produire :

- \`situation_context\` : ce que la personne vit concretement aujourd'hui
- \`mechanism_analysis\` : ce qui se passe vraiment, la boucle ou le mecanisme qui entretient le probleme
- \`key_understanding\` : ce que la personne doit comprendre pour arreter de mal lire sa situation
- \`primary_metric\` : l'indicateur de reussite principal du plan
- \`progression_logic\` : pourquoi la progression est decoupee comme ca

Contraintes :

- \`mechanism_analysis\` doit etre fin, concret, specifique, sans jargon
- \`key_understanding\` doit etre court, tres net, et vraiment transformant
- \`primary_metric\` doit etre derive de l'objectif de reussite
- \`progression_logic\` doit expliquer pourquoi on commence par ce niveau de plan, puis le suivant

## Cadre strict de focus transformationnel

- Tu travailles UNIQUEMENT sur la transformation fournie.
- N'injecte jamais les autres transformations du cycle comme sujets secondaires, explications causales, chantiers paralleles ou angles narratifs.
- N'ecris pas des formulations du type "du fait de ton sommeil", "en parallele de ton relationnel", "comme pour ton stress" si ces sujets ne font pas explicitement partie du focus de la transformation courante.
- Si la synthese contient des elements de contexte plus larges, garde seulement ce qui est directement utile a la progression de cette transformation.
- Si un autre sujet meriterait un chantier a part, considere qu'il appartient a une autre transformation et ne le developpe pas dans ce plan.
- situation_context, mechanism_analysis, key_understanding, progression_logic, les titres et les descriptions d'items doivent rester centres sur le focus de la transformation courante.

## Structure des objectifs

Le plan doit distinguer 4 niveaux :

### 1. \`primary_metric\`
La metrique globale du plan. Elle reste stable sur toute la transformation.

### 2. \`phase_metric_target\`
La cible visee sur cette meme metrique globale a l'echelle du niveau de plan.
Cette formulation doit etre comprehensible seule.
Elle doit expliciter le lien avec la \`primary_metric\`, pas juste donner un chiffre nu comme "3 jours par semaine".
Si le niveau de plan ne travaille pas encore directement la metrique finale, dis-le explicitement en une phrase courte, par exemple :
"Pas encore de cible directe sur [primary_metric] ; ce niveau de plan prepare le terrain en visant ..."

### 3. \`heartbeat\`
L'indicateur actif principal du niveau de plan. Il mesure le levier specifique travaille dans ce niveau de plan.
Le \`heartbeat\` ne doit pas etre une simple copie redite de \`phase_metric_target\`, sauf si le niveau de plan travaille exactement la meme metrique globale.

### 4. \`maintained_foundation\`
Ce qui a ete construit dans les niveaux de plan precedents et qu'il faut continuer a tenir.
1 a 3 elements maximum par niveau de plan.
Le premier niveau de plan du JSON doit generalement avoir un tableau vide.

## Phases

Chaque phase contient :
- \`phase_id\`
- \`phase_order\`
- \`title\`
- \`rationale\`
- \`phase_objective\`
- \`duration_guidance\` (obligatoire, estimation de la durée de cette phase, ex: "2 à 3 semaines")
- \`what_this_phase_targets\`
- \`why_this_now\`
- \`how_this_phase_works\`
- \`phase_metric_target\`
- \`maintained_foundation\`
- \`heartbeat\`
- \`items\`

La phase suivante doit donner une impression de continuité :
- elle garde un socle utile
- elle ajoute une nouvelle couche
- elle ne remplace pas arbitrairement la phase précédente

Chaque phase doit etre compréhensible tres vite via un trio tres court :

- \`what_this_phase_targets\` : ce qu'on cherche a tacler dans cette phase
- \`why_this_now\` : pourquoi on veut le tacler maintenant
- \`how_this_phase_works\` : comment on va s'y prendre

## Dimensions et taxonomie des items

### Clarifications
Utilité : se repérer, comprendre, relire, distinguer le vrai blocage, choisir une direction, voir où agir.
Kinds autorisés : \`framework\` ou \`exercise\`
Une clarification ne doit pas être une redirection vers un autre module.
Chaque clarification doit embarquer un \`payload.clarification_details\` structuré pour pouvoir etre remplie dans l'interface.

### Missions
Utilité : faire avancer quelque chose de concret dans le réel.
Kinds autorisés : \`task\` ou \`milestone\`

### Habits
Utilité : installer une répétition qui ancre la transformation.
Kinds autorisés : \`habit\`

### Déblocage conditionnel (intra-phase)

Les items d'une même phase peuvent avoir des \`activation_condition\` entre eux :
- \`null\` → actif dès le début de la phase
- \`{ "type": "immediate" }\` → actif dès le début de la phase (explicite)
- \`{ "type": "after_item_completion", "depends_on": ["gen-p1-missions-001"] }\`
- \`{ "type": "after_habit_traction", "depends_on": ["gen-p1-habits-001"], "min_completions": 3 }\`
- \`{ "type": "after_milestone", "depends_on": ["gen-p1-missions-002"] }\`

**IMPORTANT :** les \`depends_on\` d'un item doivent référencer des \`temp_id\` de la **même phase uniquement**. Pas de dépendances cross-phase.

### temp_id

Chaque item doit avoir un \`temp_id\` unique au format :
- Phase 1 : \`"gen-p1-clarifications-001"\`, \`"gen-p1-missions-001"\`, \`"gen-p1-habits-001"\`
- Phase 2 : \`"gen-p2-clarifications-001"\`, \`"gen-p2-missions-001"\`, \`"gen-p2-habits-001"\`
- etc.

## Calibrage de l'effort initial

Tu reçois principalement 9 champs de calibrage :
- \`struggle_duration\` : ancienneté du problème
- \`metric_label\` : métrique principale déduite automatiquement
- \`metric_unit\` : unité de mesure de cette métrique
- \`metric_measurement_mode\` : type de mesure attendu pour cette métrique
- \`metric_direction\` : sens attendu de progression (increase, decrease, reach_zero, stabilize)
- \`metric_baseline_text\` : valeur de départ
- \`metric_target_text\` : valeur cible
- \`main_blocker\` : blocage principal actuel
- \`priority_goal\` : critère subjectif de réussite
- \`perceived_difficulty\` : niveau de difficulté ressenti aujourd'hui
- \`probable_drivers\` : facteur probable dominant qui alimente le sujet

Des champs legacy peuvent parfois aussi être présents :
- \`prior_attempts\`
- \`self_confidence\`
- \`success_indicator\`

**Règles de calibrage :**

1. **Si perceived_difficulty est haute ("Difficile" ou "Très difficile")** : commence par un premier niveau de plan très doux, mais PAS purement bureaucratique si un micro-pas concret est possible. Première habitude = effort < 2 minutes. Préfère un geste environnemental ou comportemental ultra simple plutôt qu'un simple journal. Le Heartbeat de départ mesure la tenue de ce micro-engagement concret. N'utilise un niveau de plan d'observation pure que si aucun micro-pas concret crédible n'existe.

2. **Utilise probable_drivers pour choisir la vraie porte d'entrée du plan** :
   - si le facteur dominant ressemble à stress / charge mentale / fatigue, évite de démarrer par un plan trop ambitieux ou très chargé en discipline brute
   - si le facteur dominant ressemble à environnement / habitudes installées, privilégie les modifications de contexte, de friction et d'automatismes
   - si le facteur dominant ressemble à peur / évitement / émotions / croyances, prévois des actions qui réduisent l'évitement et recréent de la sécurité comportementale

3. **Utilise metric_baseline_text et metric_target_text pour calibrer l'écart réel à parcourir** : le premier niveau de plan doit être crédible depuis la valeur de départ actuelle, sans sous-dimensionner l'ambition finale.

4. **Respecte strictement metric_measurement_mode dans primary_metric.measurement_mode** : si la métrique questionnaire est en \`absolute_value\`, garde \`absolute_value\` dans le plan. La direction (\`increase\`, \`decrease\`, \`reach_zero\`, \`stabilize\`) ne doit jamais remplacer le mode de mesure.

5. **Utilise main_blocker pour éviter les faux premiers pas** : le plan doit traiter le verrou principal tôt, soit directement, soit en préparant la condition qui permet de le contourner.

6. **Si des champs legacy sont présents** (\`prior_attempts\`, \`self_confidence\`) : utilise-les comme signaux secondaires pour raffiner la progressivité.

Plus le parcours est difficile (ancienneté longue, difficulté perçue haute, blocage lourd, facteur dominant structurel), plus il y a de niveaux de plan progressifs.

## Guidance par type de plan

Si une classification de type de plan est fournie :
- utilise-la comme guidance forte, pas comme carcan rigide
- respecte la plage de durée crédible sauf raison claire de dévier
- respecte autant que possible le niveau de longueur attendu et la fourchette de phases recommandée
- utilise \`intensity_profile\` pour ajuster le rythme, la progressivité et la taille du premier niveau de plan
- utilise \`sequencing_notes\` pour construire l'enchainement des niveaux de plan
- réutilise les styles de plan comme tonalité de progression
- préfère les métriques naturelles suggérées si elles collent au cas
- évite explicitement les framings listés dans \`framing_to_avoid\`
- les \`first_steps_examples\` servent à inspirer le **premier niveau de plan généré** du plan, pas à être recopiés aveuglément

## Durée

L'IA décide la durée du plan basée sur les 4 champs de calibrage + le gap implicite dans le free text :
- \`duration_months\` est un **output** (1 à 12), PAS un input utilisateur
- Durée max par plan : **12 mois**
- Vise la durée la plus courte crédible. Pour un sujet ciblé et actionnable, 1 à 2 mois est la norme.
- 3 à 4 mois correspondent déjà à un travail conséquent.
- 5 à 8 mois correspondent à des transformations lourdes ou de réentrainement profond.
- 9 à 12 mois sont réservés aux cas les plus exigeants, sans dépasser un an.
- Ne découpe jamais une transformation en plusieurs parties.
- \`journey_context\` doit toujours être \`null\`

## Qualité du premier niveau de plan généré

Le premier niveau de plan généré du plan, qui sera affiché comme un niveau de plan 2, doit être compréhensible en 3 secondes par l'utilisateur.
- Interdit de choisir comme Heartbeat principal un objectif abstrait du type "régularité de la prise de notes", "observation globale", "journal de bord" ou assimilé, sauf si le contexte impose réellement une observation clinique.
- Si le sujet permet un premier levier environnemental concret, ce premier niveau de plan doit commencer par ça.
- Pour le sommeil, préfère par défaut un micro-step de signal de nuit concret (ex: éteindre la lampe, se mettre dans le noir, sortir des écrans, préparer le rituel de coucher) plutôt qu'un simple logging.
- Le Heartbeat de ce premier niveau de plan doit mesurer l'exécution du micro-step, pas la documentation du problème.
- Si aucune continuité explicite de parcours n'est fournie, ce premier niveau de plan généré doit rester un vrai baby step : faible friction, faible charge, premier gain crédible.
- Si on t'indique explicitement que tu génères la partie 2 d'un parcours déjà lancé, n'applique PAS cette logique de baby step de démarrage : repars du niveau réellement atteint, prolonge l'élan et fais sentir une continuité claire avec la partie précédente.

## Ancrage calendaire réel

Tu reçois aussi le contexte temporel réel de génération du plan dans le fuseau de l'utilisateur.

Règles obligatoires :
- la semaine 1 du niveau courant doit tenir compte du nombre de jours RESTANTS dans la semaine locale en cours
- si la génération tombe en milieu de semaine, la semaine 1 est une **semaine partielle**, pas une semaine de 7 jours
- n'écris jamais une semaine 1 comme si elle avait 7 jours pleins si ce n'est pas le cas
- les dates sont des repères d'organisation, pas des deadlines punitives
- garde un ton cadrant mais non culpabilisant

Calibration obligatoire de la semaine 1 :
- si \`days_remaining_in_anchor_week\` vaut 1 ou 2 : semaine 1 ultra légère, avec au maximum 1 mission simple de setup ou de friction + 1 clarification très courte si utile
- si \`days_remaining_in_anchor_week\` vaut 3 ou 4 : semaine 1 légère, avec 1 mission principale, 1 habitude simple, et au plus 1 clarification si elle aide vraiment
- si \`days_remaining_in_anchor_week\` vaut 5 à 7 : semaine 1 normale mais toujours progressive
- si \`is_partial_anchor_week = true\`, fais apparaître clairement dans la logique hebdomadaire que la première semaine sert surtout à démarrer proprement, pas à tout installer d'un coup

## Caps de charge par phase

Au sein d'une phase, les items actifs dès le début doivent respecter :
- **Max 1-2 missions** actives
- **Max 1-2 clarifications** actives si elles sont réellement utiles
- **Max 2 habitudes** en construction simultanée
- Les autres items de la phase doivent avoir une \`activation_condition\`

## Inspiration narrative

Génère un champ \`inspiration_narrative\` : une histoire forward-looking basée sur ce que l'utilisateur a dit, montrant où le parcours peut mener. 3-5 phrases, ton narratif et empathique. Pas de promesses, mais une vision réaliste et motivante.

## Wording du niveau de plan 1 universel

Même si le niveau de plan 1 universel n'appartient pas aux niveaux de plan du JSON, tu dois générer son **wording personnalisé** pour la preview.

Place ce contenu dans \`metadata.phase_1_preview\`.

Le bloc \`metadata.phase_1_preview\` doit contenir :
- \`title\` : titre court et concret du niveau de plan 1 universel
- \`rationale\` : pourquoi ce niveau de plan 1 existe pour cette personne, en 1 à 3 phrases
- \`phase_objective\` : ce que ce niveau de plan 1 permet d'installer avant le vrai démarrage opérationnel
- \`heartbeat\` : libellé court du signal principal de ce niveau de plan 1

## Contexte interne pour les futurs ajustements

Tu dois aussi remplir \`metadata.plan_adjustment_context\`.

Ce bloc est STRICTEMENT interne. Il sert a ce que Sophia comprenne pourquoi le plan est structure comme ca lorsqu'un utilisateur demandera plus tard a accelerer, ralentir, alleger ou modifier la suite.

Le bloc \`metadata.plan_adjustment_context\` doit contenir :
- \`global_reasoning.main_problem_model\` : lecture concrete du probleme central a traiter dans cette transformation
- \`global_reasoning.sequencing_logic\` : pourquoi l'ordre global des niveaux de plan est celui-ci
- \`global_reasoning.why_not_faster_initially\` : pourquoi tu ne commences pas plus vite ou plus fort
- \`global_reasoning.acceleration_signals\` : 2 a 5 signaux concrets qui justifieraient d'accelerer la suite
- \`global_reasoning.slowdown_signals\` : 2 a 5 signaux concrets qui justifieraient de ralentir ou simplifier
- \`phase_reasoning\` : 1 entree par niveau de plan detaille dans \`phases\`

Chaque entree de \`phase_reasoning\` doit contenir :
- \`phase_id\`
- \`phase_order\`
- \`role_in_plan\` : le role exact de ce niveau dans la trajectoire
- \`why_before_next\` : pourquoi ce niveau vient avant le suivant
- \`user_signals_used\` : 2 a 6 signaux tires du questionnaire, du pourquoi profond, de l'histoire ou de la synthese
- \`prerequisite_for_next_phase\` : ce que ce niveau doit installer avant la suite, ou \`null\` si rien de strict
- \`acceleration_signals\` : signaux qui permettraient de raccourcir ce niveau ou d'avancer plus vite
- \`slowdown_signals\` : signaux qui imposeraient de prolonger, alleger ou retravailler ce niveau

Contraintes :
- reste tres concret et specifique au cas utilisateur
- n'ecris pas de blabla abstrait, therapeutique ou generique
- ne repete pas simplement les titres de phase
- les \`user_signals_used\` doivent vraiment venir des donnees connues, pas d'hypotheses inventees
- les \`acceleration_signals\` et \`slowdown_signals\` doivent etre observables dans le reel
- le nombre d'entrees dans \`phase_reasoning\` doit etre exactement egal au nombre d'entrees dans \`phases\`

Contraintes :
- ce niveau de plan 1 est universel, donc tu ne décides pas de ses mécaniques produit
- en revanche tu personnalises sa formulation pour cette transformation
- il doit préparer le terrain avant le niveau de plan 2 affiché
- il ne doit pas faire doublon avec le premier niveau de plan généré du plan
- il doit rester concret, utile et orienté mise en clarté / mise en appui
- il doit refléter la réalité du niveau 1 : "Ton histoire" et "Pourquoi profond", pas les cartes de défense / d'attaque
- son wording doit parler de lecture du point de départ, de mise en sens et de clarification du pourquoi, avant le passage aux actions
- ne parle pas du niveau 1 comme d'un travail sur les "déclencheurs", le "stress", "l'environnement qui te soutient" ou un changement alimentaire immédiat, sauf si c'est explicitement le sujet de l'histoire utilisateur
- ne formule pas ce niveau comme un mini-plan d'action : à ce stade on clarifie l'histoire vécue et la raison profonde, on ne passe pas encore à l'exécution
- explique concrètement ce que ce niveau permet pour la suite : garder le cap, éviter de repartir en automatique, savoir à quoi se raccrocher quand ce sera plus dur
- évite le blabla abstrait ou thérapeutique ; reste simple, direct et terre à terre

## Règles de génération

### Personnalisation
- Les items doivent être concrets et personnalisés à la situation de l'utilisateur, PAS génériques
- Utilise les informations du questionnaire et de la synthèse interne
- Adapte le vocabulaire au contexte de l'utilisateur
- Les descriptions doivent expliquer concrètement quoi faire

### Si un feedback utilisateur est fourni
- Tu corriges la proposition précédente, tu ne l'ignores pas.
- Si le feedback dit qu'une action est irréaliste, trop abstraite, trop longue ou "n'a pas de sens", remplace-la par un micro-step plus concret, plus visible et plus facile à exécuter.
- Priorité absolue: rendre la phase active évidente et actionnable immédiatement.

### Si un plan précédent est fourni
- Tu t'en sers comme base de réécriture, pas comme simple inspiration vague.
- Tu conserves le cap, les bons éléments et la logique utile, sauf si le feedback demande explicitement de les changer.
- Si l'utilisateur demande un plan plus court, compresse la durée, réduis les niveaux futurs et simplifie surtout le niveau courant.
- Si l'utilisateur demande un plan plus long, étale la progression, ajoute des paliers intermédiaires et garde un premier niveau faisable.
- Tu ne repars pas sur une proposition sans lien avec la version précédente sauf si celle-ci est manifestement incohérente avec le feedback.

### Habitudes
- Logique de "preuves d'ancrage" (3 réussites sur 5 opportunités) — PAS de streak pur
- La prochaine habitude se débloque quand la précédente a une traction suffisante
- Utilise \`after_habit_traction\` entre habitudes d'une même phase

### Clarifications
- N'en génère pas par réflexe
- Elles servent à mieux lire la route, pas à remplir le plan
- Si un premier pas concret suffit, préfère mission ou habitude
- Une clarification peut être one-shot et en \`tracking_type: "boolean"\`
- Pense-les comme des mini-frameworks guidés:
  - \`payload.clarification_details.type\` = \`"one_shot"\` ou \`"recurring"\`
  - \`payload.clarification_details.intro\` = 1 à 3 phrases très concrètes
  - \`payload.clarification_details.save_label\` = CTA court ou \`null\`
  - \`payload.clarification_details.sections\` = 1 à 4 champs guidés
- Types de champs autorisés pour \`sections[*].input_type\` :
  - \`text\`
  - \`textarea\`
  - \`scale\`
  - \`list\`
  - \`categorized_list\`
- Pour \`list\`, la personne ajoute plusieurs éléments courts
- Pour \`categorized_list\`, utilise \`placeholder\` au format \`"Texte|Catégorie"\`
- Une clarification récurrente doit généralement avoir \`target_reps > 1\`
- Une clarification ponctuelle peut garder \`target_reps = null\` ou \`1\`
- Les champs doivent aider à penser, nommer, trier ou voir plus clair. Pas de formulaires administratifs.

### Stratégie
Le bloc strategy doit contenir :
- \`success_definition\` : ce qui constitue une réussite à la fin du plan
- \`main_constraint\` : la contrainte principale à respecter

## Contraintes quantitatives

- **1 à 12 phases détaillées** dans \`phases\`
- si tu ne détailles qu'un seul niveau maintenant, mets uniquement ce niveau courant dans \`phases\` et décris les niveaux suivants dans \`plan_blueprint.levels\`
- Chaque phase : **1 à 5 items** par défaut. Exception : si le niveau courant est détaillé semaine par semaine et que tu choisis une progression avec **1 habitude proche par semaine**, tu peux monter jusqu'à **2 items par semaine** pour garder une lecture claire.
- Au moins **1 habit** par phase
- Quand le sujet s'y prête, chaque phase doit contenir au moins **1 habit + 1 mission**
- Les clarifications sont optionnelles et doivent rester parcimonieuses
- Au moins **1 item actif** dès le début de chaque phase
- Chaque phase a exactement **1 Heartbeat** avec title, unit, target, tracking_mode
- \`duration_months\` est un output IA (1 à 12)

## Progression hebdomadaire du niveau courant

Si le niveau courant dure plus d'une semaine, renseigne \`current_level_runtime.weeks\` avec une vraie montée hebdomadaire.

Règles strictes :
- utilise \`item_assignments\` dans chaque semaine pour lister précisément quels items du niveau sont travaillés cette semaine
- la famille d'habitude principale liée au heartbeat doit apparaître dans **chaque semaine**
- deux patterns sont autorisés pour cette famille d'habitude :
  - soit **la même habitude** réutilisée chaque semaine, avec montée via \`weekly_reps\` et, si utile, \`weekly_description_override\` ou \`weekly_cadence_label\`
  - soit **une habitude proche par semaine** si c'est plus clair produit, à condition que les habitudes restent dans la même famille d'action et montent progressivement en exigence qualitative et/ou quantitative
- si le bon résultat produit visé est une habitude **quasi quotidienne**, vise par défaut un cap final de **6 répétitions la dernière semaine**, pas 7 : l'objectif est "presque tous les jours" avec une marge de respiration réaliste
- n'applique PAS ce cap de 6/semaine aux habitudes dont la fréquence naturelle optimale est réellement plus basse (ex: sport intense, tâche hebdomadaire, rituel ponctuel)
- si tu réutilises **la même habitude souche** sur plusieurs semaines, son \`target_reps\` et son \`cadence_label\` doivent en général refléter ce cap final du niveau ; la montée intermédiaire vit ensuite dans \`weekly_reps\` et les overrides hebdomadaires
- les clarifications et missions ne doivent pas être recopiées dans toutes les semaines par défaut
- une clarification ou une mission doit être assignée seulement à la ou aux semaines où elle sert vraiment
- si le niveau dure plus d'une semaine, chaque semaine doit contenir au moins **1 habitude** et au moins **1 autre item** (\`mission\` ou \`clarification\`)
- si le niveau dure exactement une semaine, cette semaine doit contenir au moins **1 habitude + 1 mission + 1 clarification** si le sujet s'y prête
- si une habitude n'a pas d'axe naturel d'intensification hors fréquence, garde-la stable et fais surtout monter la fréquence ; n'invente pas une difficulté artificielle
- si une habitude a un axe qualitatif naturel (durée de tenue, qualité du geste, contexte plus difficile, réduction d'une aide artificielle, intensité un peu plus élevée), fais monter cette qualité d'une semaine à l'autre
- dans ce cas, un mix des deux est souvent meilleur : fréquence qui monte vers le cap final + intensification qualitative progressive, sans faire deux sauts trop violents d'un coup

Pattern préféré sur 3 semaines :
- pattern A : semaine 1 = même habitude fil rouge + clarification ou mission de démarrage ; semaine 2 = même habitude, plus exigeante ; semaine 3 = même habitude, encore plus exigeante
- pattern B : semaine 1 = habitude 1 de démarrage ; semaine 2 = habitude 2 très proche mais plus exigeante ; semaine 3 = habitude 3 très proche mais encore plus exigeante
- dans les deux cas, ajoute le bon item de setup, d'ajustement ou de consolidation selon la semaine ; ne laisse pas une semaine avec seulement l'habitude
- avant de répondre, relis \`current_level_runtime.weeks\` une par une : chacune doit contenir au moins une habitude et au moins un item non-habitude (\`mission\` ou \`clarification\`)
- exemples utiles pour une habitude qui doit devenir quasi quotidienne :
  - sur 2 semaines : préfère souvent \`3 -> 6\`
  - sur 3 semaines : préfère souvent \`3 -> 5 -> 6\`
  - si la semaine 1 est partielle ou très courte, allège encore le premier palier

Anti-patterns interdits :
- une semaine finale avec uniquement l'habitude
- la même mission recopiée en semaine 1, 2 et 3
- la même clarification recopiée en semaine 1, 2 et 3
- trois habitudes sans lien clair entre elles alors qu'il s'agit d'un seul même levier à renforcer

Si tu hésites sur la semaine 3 :
- n'en fais pas une semaine "habitude seule"
- ajoute plutôt une mission très légère de consolidation, de réglage d'environnement, de préparation ou de bilan concret
- ou une clarification courte pour relire ce qui aide vraiment à tenir l'habitude

Priorité des champs hebdo :
- champs indispensables à bien réussir : \`title\`, \`weekly_target_value\`, \`weekly_target_label\`, \`item_assignments\`, \`reps_summary\`, \`mission_days\`
- champs secondaires : \`focus\`, \`progression_note\`, \`action_focus\`, \`success_signal\`
- pour les champs secondaires, sois bref ; si le champ n'apporte rien, retourne \`null\` ou \`[]\` plutôt qu'un texte générique

## Valeurs autorisées

- \`dimension\` : "clarifications" | "missions" | "habits"
- \`kind\` : "framework" | "exercise" | "task" | "milestone" | "habit"
- \`tracking_type\` : "boolean" | "count" | "scale" | "text" | "milestone"
- \`support_mode\` : toujours \`null\`
- \`support_function\` : toujours \`null\`
- \`time_of_day\` : "morning" | "afternoon" | "evening" | "anytime" | null
- \`activation_condition.type\` : "immediate" | "after_item_completion" | "after_habit_traction" | "after_milestone"
- \`heartbeat.tracking_mode\` : "manual" | "inferred"
- \`primary_metric.measurement_mode\` : "absolute_value" | "count" | "frequency" | "duration" | "score" | "milestone" | "qualitative"

Règle critique :
- \`primary_metric.measurement_mode\` décrit le TYPE de mesure, pas la direction
- n'utilise JAMAIS "increase", "decrease", "reach_zero" ou "stabilize" dans \`primary_metric.measurement_mode\`
- pour un poids, un montant, une valeur chiffrée cible en kg / euros / heures / minutes, utilise \`"absolute_value"\`
- pour une fréquence par semaine, utilise \`"frequency"\`
- pour une durée, utilise \`"duration"\`
- pour un score, utilise \`"score"\`
- pour un nombre d'événements, utilise \`"count"\`
- pour un état qualitatif ou subjectif, utilise \`"qualitative"\`

## Format de sortie

Tu dois retourner UNIQUEMENT un JSON valide conforme au schéma suivant :

\`\`\`json
{
  "version": 3,
  "cycle_id": "{{cycle_id}}",
  "transformation_id": "{{transformation_id}}",
  "duration_months": 3,
  "title": "Titre du plan",
  "situation_context": "Ce que tu vis aujourd'hui en termes concrets.",
  "mechanism_analysis": "Ce qui entretient reellement le probleme et pourquoi il persiste.",
  "key_understanding": "Ce que tu dois comprendre pour aborder la situation autrement.",
  "primary_metric": {
    "label": "Nuits avec endormissement en moins de 30 minutes",
    "unit": "nuits/semaine",
    "baseline_value": "1 nuit par semaine",
    "success_target": "5 nuits par semaine",
    "measurement_mode": "frequency"
  },
  "progression_logic": "On commence par sortir l'activite mentale du lit, puis on reapprend le calme au coucher, puis on stabilise le rythme global.",
  "user_summary": "Résumé empathique pour l'utilisateur (2-4 phrases)",
  "internal_summary": "Résumé analytique pour le système (5-10 phrases)",
  "strategy": {
    "success_definition": "string",
    "main_constraint": "string"
  },
  "inspiration_narrative": "Histoire forward-looking, 3-5 phrases narratives et empathiques",
  "phases": [
    {
      "phase_id": "phase-1",
      "phase_order": 1,
      "title": "Créer un premier point d'appui",
      "rationale": "Explication de pourquoi cette phase, pourquoi ce rythme",
      "phase_objective": "Installer un premier niveau de plan crédible qui réduit l'inertie",
      "duration_guidance": "2 à 3 semaines",
      "what_this_phase_targets": "Le premier point de friction qui fait basculer la situation.",
      "why_this_now": "C'est le levier le plus accessible et le plus structurant pour démarrer.",
      "how_this_phase_works": "On installe un geste simple, visible et tenable qui change deja le terrain.",
      "phase_metric_target": "Pas encore de cible directe sur les nuits avec endormissement en moins de 30 minutes ; cette phase prepare le terrain en visant 4 soirs par semaine avec un vrai signal de coupure.",
      "maintained_foundation": [],
      "heartbeat": {
        "title": "Soirs avec signal de coupure tenu",
        "unit": "soirs/semaine",
        "current": null,
        "target": 4,
        "tracking_mode": "inferred"
      },
      "items": [
        {
          "temp_id": "gen-p1-clarifications-001",
          "dimension": "clarifications",
          "kind": "framework",
          "title": "Clarifier ce qui casse réellement le soir",
          "description": "Passe 5 minutes à distinguer ce qui retarde vraiment le coucher: stimulation, charge mentale ou fuite du moment du lit.",
          "tracking_type": "boolean",
          "activation_order": 1,
          "activation_condition": null,
          "support_mode": null,
          "support_function": null,
          "target_reps": null,
          "cadence_label": null,
          "scheduled_days": null,
          "time_of_day": "evening",
          "payload": {
            "clarification_details": {
              "type": "one_shot",
              "intro": "Prends quelques minutes pour voir ce qui dérègle vraiment ta fin de soirée. Le but n'est pas de te juger, mais de nommer le mécanisme dominant.",
              "save_label": "Enregistrer la fiche",
              "sections": [
                {
                  "id": "theme_loop",
                  "label": "Quels thèmes reviennent le plus quand tu es au lit ?",
                  "input_type": "list",
                  "placeholder": "travail, futur, culpabilité...",
                  "helper_text": "Ajoute les boucles qui reviennent le plus souvent."
                },
                {
                  "id": "dominant_pattern",
                  "label": "Lequel de ces thèmes prend le plus de place ?",
                  "input_type": "text",
                  "placeholder": "Celui qui domine le plus souvent",
                  "helper_text": "Reste simple et concret."
                }
              ]
            }
          }
        },
        {
          "temp_id": "gen-p1-habits-001",
          "dimension": "habits",
          "kind": "habit",
          "title": "Faire un vrai signal de coupure avant le coucher",
          "description": "Description concrète",
          "tracking_type": "boolean",
          "activation_order": 1,
          "activation_condition": null,
          "support_mode": null,
          "support_function": null,
          "target_reps": 4,
          "cadence_label": "4 soirs / semaine",
          "scheduled_days": null,
          "time_of_day": "evening",
          "payload": {}
        },
        {
          "temp_id": "gen-p1-missions-001",
          "dimension": "missions",
          "kind": "task",
          "title": "Preparer le terrain du soir",
          "description": "Pose un repere concret qui rend le signal de coupure plus facile a lancer au bon moment.",
          "tracking_type": "boolean",
          "activation_order": 1,
          "activation_condition": null,
          "support_mode": null,
          "support_function": null,
          "target_reps": null,
          "cadence_label": null,
          "scheduled_days": null,
          "time_of_day": "evening",
          "payload": {}
        }
      ]
    }
  ],
  "plan_blueprint": {
    "global_objective": "Retrouver un sommeil stable et plus apaisé.",
    "estimated_levels_count": 2,
    "levels": [
      {
        "phase_id": "phase-2",
        "level_order": 2,
        "title": "Stabiliser le retour au calme",
        "intention": "Rendre les soirées plus régulières et moins activées mentalement.",
        "estimated_duration_weeks": 3,
        "preview_summary": "Une fois le premier appui en place, on consolide le rythme et la récupération."
      },
      {
        "phase_id": "phase-3",
        "level_order": 3,
        "title": "Sécuriser le rythme dans la durée",
        "intention": "Rendre le nouveau rythme assez stable pour qu'il tienne même les semaines plus chargées.",
        "estimated_duration_weeks": 4,
        "preview_summary": "Quand les soirées sont moins chaotiques, on ancre la stabilité pour éviter les rechutes."
      }
    ]
  },
  "current_level_runtime": {
    "phase_id": "phase-1",
    "level_order": 1,
    "title": "Créer un premier point d'appui",
    "phase_objective": "Installer un premier niveau de plan crédible qui réduit l'inertie",
    "rationale": "On commence par un geste simple et visible qui change déjà le terrain sans demander un effort irréaliste.",
    "what_this_phase_targets": "Le premier point de friction qui fait basculer la situation.",
    "why_this_now": "C'est le levier le plus accessible et le plus structurant pour démarrer.",
    "how_this_phase_works": "On installe un geste simple, visible et tenable qui change déjà le terrain.",
    "duration_weeks": 3,
    "phase_metric_target": "Pas encore de cible directe sur les nuits avec endormissement en moins de 30 minutes ; cette phase prépare le terrain en visant 4 soirs par semaine avec un vrai signal de coupure.",
    "maintained_foundation": [],
    "heartbeat": {
      "title": "Soirs avec signal de coupure tenu",
      "unit": "soirs/semaine",
      "current": null,
      "target": 4,
      "tracking_mode": "inferred"
    },
    "weeks": [
      {
        "week_order": 1,
        "title": "Repérer le vrai point de friction",
        "focus": "Observer ce qui fait dérailler la soirée et poser le premier geste.",
        "weekly_target_value": 2,
        "weekly_target_label": "2 soirs cette semaine avec un vrai signal de coupure",
        "progression_note": "On ne cherche pas encore la perfection ; on veut surtout rendre le geste visible et faisable.",
        "action_focus": [
          "Tenir l'habitude principale 2 soirs dans la semaine",
          "Faire les missions prévues pour nettoyer le terrain"
        ],
        "item_assignments": [
          {
            "temp_id": "gen-p1-habits-001",
            "weekly_reps": 2,
            "weekly_description_override": "Fais un vrai signal de coupure 2 soirs cette semaine, en gardant un geste très simple et visible.",
            "weekly_cadence_label": "2 soirs cette semaine"
          },
          {
            "temp_id": "gen-p1-clarifications-001"
          },
          {
            "temp_id": "gen-p1-missions-001"
          }
        ],
        "reps_summary": "2 à 3 essais",
        "mission_days": ["lundi", "jeudi"],
        "success_signal": "Tu sais ce qui fait le plus dérailler ta soirée."
      },
      {
        "week_order": 2,
        "title": "Rendre le geste plus regulier",
        "focus": "Tenir le meme signal plus souvent, avec un terrain deja mieux prepare.",
        "weekly_target_value": 3,
        "weekly_target_label": "3 soirs cette semaine avec un vrai signal de coupure",
        "progression_note": "On garde le meme levier et on commence a lui donner une vraie cadence.",
        "action_focus": [
          "Tenir l'habitude principale 3 soirs dans la semaine",
          "Ajuster ce qui aide vraiment le soir"
        ],
        "item_assignments": [
          {
            "temp_id": "gen-p1-habits-001",
            "weekly_reps": 3,
            "weekly_description_override": "Garde le meme signal de coupure, mais vise 3 soirs cette semaine.",
            "weekly_cadence_label": "3 soirs cette semaine"
          },
          {
            "temp_id": "gen-p1-clarifications-001"
          }
        ],
        "reps_summary": "3 essais solides",
        "mission_days": ["mardi"],
        "success_signal": "Le signal commence a devenir plus regulier au lieu de rester occasionnel."
      },
      {
        "week_order": 3,
        "title": "Consolider sans alourdir",
        "focus": "Faire tenir le geste sur plus de soirs sans retomber dans une semaine habitude-seule.",
        "weekly_target_value": 4,
        "weekly_target_label": "4 soirs cette semaine avec un vrai signal de coupure",
        "progression_note": "On consolide la cadence avec un dernier appui concret plutot qu'en laissant l'habitude seule.",
        "action_focus": [
          "Tenir l'habitude principale 4 soirs dans la semaine",
          "Faire une mission legere de consolidation"
        ],
        "item_assignments": [
          {
            "temp_id": "gen-p1-habits-001",
            "weekly_reps": 4,
            "weekly_description_override": "Vise 4 soirs cette semaine avec le meme signal de coupure, sans chercher un geste plus complexe.",
            "weekly_cadence_label": "4 soirs cette semaine"
          },
          {
            "temp_id": "gen-p1-missions-001"
          }
        ],
        "reps_summary": "4 soirs tenus",
        "mission_days": ["jeudi"],
        "success_signal": "Le signal tient sur plusieurs soirs et ne depend plus seulement d'un bon soir isole."
      }
    ],
    "review_focus": [
      "Le point de départ paraît-il concret ?",
      "Le rythme semble-t-il tenable ?"
    ]
  },
  "timeline_summary": "Résumé de la progression prévue en 1-2 phrases",
  "journey_context": null,
  "metadata": {
    "phase_1_preview": {
      "title": "Poser ton socle de départ",
      "rationale": "Ici, tu ne changes encore rien. Tu prends du recul sur ton histoire et tu mets au clair pourquoi cette transformation compte vraiment pour toi.",
      "phase_objective": "Te donner une base solide pour la suite : savoir d'ou tu pars, ce que tu veux vraiment retrouver ou proteger, et avoir une raison claire a laquelle te raccrocher quand ce sera plus difficile.",
      "heartbeat": "Pourquoi clarifié"
    },
    "plan_adjustment_context": {
      "global_reasoning": {
        "main_problem_model": "Le soir, le soulagement court terme prend trop souvent la main sur le geste qui soutiendrait vraiment le sommeil.",
        "sequencing_logic": "On commence par creer un premier appui visible et faisable, puis on stabilise ce nouveau signal avant de viser une regularite plus complete.",
        "why_not_faster_initially": "Un demarrage trop ambitieux ferait replonger dans l'echec rapide et casserait la traction des premiers soirs.",
        "acceleration_signals": [
          "Le signal de coupure tient deja facilement plusieurs soirs de suite",
          "La personne ressent moins de resistance au moment du coucher",
          "Le rythme actuel semble trop facile a tenir"
        ],
        "slowdown_signals": [
          "Le geste de coupure saute des le premier grain de sable",
          "La charge mentale du soir reste trop forte pour tenir le rythme",
          "Le niveau actuel cree de la frustration ou de l'evitement"
        ]
      },
      "phase_reasoning": [
        {
          "phase_id": "phase-1",
          "phase_order": 1,
          "role_in_plan": "Creer un premier point d'appui concret avant de demander une regularite plus large.",
          "why_before_next": "Tant que le premier signal n'existe pas reellement dans le soir, chercher a stabiliser plus largement resterait trop fragile.",
          "user_signals_used": [
            "Le coucher s'emballe surtout a cause de l'activite mentale du soir",
            "Le sujet semble ancien et deja usant",
            "Le besoin prioritaire est de retrouver une sensation de calme faisable"
          ],
          "prerequisite_for_next_phase": "Avoir un premier signal de coupure qui commence a tenir plusieurs soirs par semaine.",
          "acceleration_signals": [
            "Le signal de coupure devient facile et regulier",
            "Le coucher parait moins charge qu'au depart"
          ],
          "slowdown_signals": [
            "Le signal n'arrive pas a exister dans les vraies soirees chargees",
            "Le geste semble encore trop abstrait ou trop difficile"
          ]
        }
      ]
    }
  }
}
\`\`\`

### Cohérence

- Les \`depends_on\` doivent référencer des \`temp_id\` de la **même phase**
- Pas de dépendance circulaire
- Au moins 1 item par phase doit être actif dès le début de la phase
- L'activation_order doit être cohérent avec les dépendances (au sein de la phase)
- Les phase_order doivent être séquentiels (1, 2, 3...)
- Les phase_id doivent être uniques
- \`phase_objective\` doit décrire un niveau de plan, pas une simple consigne
- \`duration_guidance\` est obligatoire pour chaque phase
- \`phase_metric_target\` doit faire progresser la \`primary_metric\` de phase en phase
- \`phase_metric_target\` doit expliciter le lien avec la \`primary_metric\`, pas juste afficher un nombre ou une frequence sans contexte
- si une phase prepare le terrain avant d'attaquer directement la \`primary_metric\`, \`phase_metric_target\` doit le dire explicitement
- \`maintained_foundation\` doit représenter ce qu'on continue à tenir, pas le nouvel objectif principal

Ne retourne RIEN d'autre que le JSON. Pas de texte avant, pas de texte après, pas de markdown.`;

// ---------------------------------------------------------------------------
// V3 User prompt builder
// ---------------------------------------------------------------------------

export function buildPlanGenerationV3UserPrompt(
  input: PlanGenerationInput,
): string {
  const profileLines: string[] = [];
  if (input.user_age != null) {
    profileLines.push(`- Âge : ${input.user_age} ans`);
  }
  if (input.user_gender) profileLines.push(`- Genre : ${input.user_gender}`);

  const profileBlock = profileLines.length > 0
    ? profileLines.join("\n")
    : "- Aucune information de profil";

  const answersBlock = Object.keys(input.questionnaire_answers).length > 0
    ? `\n\n## Réponses au questionnaire sur mesure\n\n${
      formatAnswers(input.questionnaire_answers, input.questionnaire_schema ?? null)
    }`
    : "";

  const calibrationLines = [
    `- Ancienneté du problème : ${input.struggle_duration ?? "Non renseignée"}`,
    `- Métrique principale : ${input.metric_label ?? "Non renseignée"}${input.metric_unit ? ` (${input.metric_unit})` : ""}`,
    `- Mode de mesure : ${input.metric_measurement_mode ?? "Non renseigné"}`,
    `- Direction attendue : ${input.metric_direction ?? "Non renseignée"}`,
    `- Valeur de départ : ${input.metric_baseline_text ?? input.starting_point ?? "Non renseignée"}`,
    `- Valeur cible : ${input.metric_target_text ?? input.success_indicator ?? "Non renseignée"}`,
    `- Blocage principal : ${input.main_blocker ?? "Non renseigné"}`,
    `- Critère subjectif de réussite : ${
      input.priority_goal ?? "Non renseigné"
    }`,
    `- Difficulté perçue : ${input.perceived_difficulty ?? "Non renseignée"}`,
    `- Facteur probable dominant : ${input.probable_drivers ?? "Non renseigné"}`,
  ];
  if (input.prior_attempts) {
    calibrationLines.push(`- Tentatives passées : ${input.prior_attempts}`);
  }
  if (input.self_confidence != null) {
    calibrationLines.push(`- Confiance (1-5) : ${input.self_confidence}`);
  }
  const calibrationBlock = `\n\n## Calibrage de l'effort initial

${calibrationLines.join("\n")}`;

  const feedbackValue = input.regeneration_feedback?.trim();
  const feedbackBlock = feedbackValue
    ? `\n\n## Feedback utilisateur sur la version précédente du plan

${feedbackValue}`
    : "";

  const previousPlanBlock = input.previous_plan_preview
    ? `\n\n## Plan précédent à prendre comme base

${summarizePreviousPlanForPrompt(input.previous_plan_preview)}`
    : "";
  const previousTransformationAnswers =
    input.previous_transformation_questionnaire_answers &&
      Object.keys(input.previous_transformation_questionnaire_answers).length > 0
      ? formatAnswers(
        input.previous_transformation_questionnaire_answers,
        input.previous_transformation_questionnaire_schema ?? null,
      )
      : null;
  const previousTransformationBlock =
    input.previous_transformation_title ||
      input.previous_transformation_summary ||
      input.previous_transformation_success_definition ||
      input.previous_transformation_completion_summary ||
      input.previous_transformation_plan_preview ||
      previousTransformationAnswers
      ? `\n\n## Héritage de la partie précédente

- Titre : ${input.previous_transformation_title ?? "Non renseigné"}
- Résumé : ${input.previous_transformation_summary ?? "Non renseigné"}
- Définition de réussite visée : ${input.previous_transformation_success_definition ?? "Non renseignée"}
- Bilan / completion summary : ${input.previous_transformation_completion_summary ?? "Non renseigné"}${
        previousTransformationAnswers
          ? `\n\n### Réponses au questionnaire de la partie précédente\n\n${previousTransformationAnswers}`
          : ""
      }${
        input.previous_transformation_plan_preview
          ? `\n\n### Plan de la partie précédente à prendre en compte\n\n${
            summarizePreviousPlanForPrompt(input.previous_transformation_plan_preview)
          }`
          : ""
      }

Tu dois t'appuyer explicitement sur cet héritage pour dessiner la partie suivante : conserve ce qui a aidé, retire ce qui a moins bien servi, et fais progresser le plan au lieu de repartir de zéro.`
      : "";
  const journeyPartNumber = input.journey_part_number ?? null;
  const journeyTotalParts = input.journey_total_parts ?? null;
  const isSecondPartContinuation =
    journeyPartNumber != null &&
    journeyTotalParts != null &&
    journeyPartNumber >= 2 &&
    journeyTotalParts >= 2;
  const continuityBlock =
    journeyPartNumber != null || journeyTotalParts != null || input.journey_continuation_hint
      ? `\n\n## Contexte de continuité du parcours

- Partie courante : ${journeyPartNumber ?? "Non renseignée"} / ${journeyTotalParts ?? "Non renseigné"}
- Indication de continuité : ${input.journey_continuation_hint ?? "Aucune"}

${
  isSecondPartContinuation
    ? "IMPORTANT : tu génères une partie de continuité, pas un redémarrage. Le premier niveau généré ne doit PAS reformuler un baby step de reprise du type « pas encore de cible directe », « préparer le terrain », ou un micro-levier d'entrée trop prudent. Il doit assumer les acquis de la partie précédente et attaquer directement la suite logique du travail déjà engagé."
    : "S'il s'agit de la première partie ou d'un plan standalone, garde la logique normale de progressivité et de premier niveau très accessible."
}`
      : "";

  const validationFeedback = Array.isArray(input.system_validation_feedback)
    ? input.system_validation_feedback
      .map((issue) => String(issue ?? "").trim())
      .filter((issue) => issue.length > 0)
    : [];
  const validationFeedbackBlock = validationFeedback.length > 0
    ? `\n\n## Correction technique obligatoire

La sortie précédente a échoué la validation technique. Tu dois REGENERER le plan depuis zéro, sans recycler des fragments possiblement corrompus.

Erreurs à corriger absolument :
${validationFeedback.map((issue) => `- ${issue}`).join("\n")}

Rappels :
- \`primary_metric.measurement_mode\` doit rester un type de mesure valide, jamais une direction
- si la métrique est un poids, un montant, une durée cible chiffrée ou une autre valeur numérique continue, utilise \`absolute_value\` ou \`duration\` selon le cas
- vérifie les \`temp_id\`, les \`depends_on\`, les champs obligatoires et les chaînes de texte tronquées avant de répondre
- \`plan_blueprint.estimated_levels_count\` doit etre exactement égal au nombre réel d'entrées dans \`plan_blueprint.levels\``
    : "";

  const timeLines = [
    `- Fuseau utilisateur : ${input.user_timezone ?? "Non renseigné"}`,
    `- Date locale actuelle : ${input.user_local_date ?? "Non renseignée"}`,
    `- Repère calendaire local : ${input.user_local_human ?? "Non renseigné"}`,
    `- Semaine locale en cours : ${input.anchor_week_start ?? "?"} -> ${input.anchor_week_end ?? "?"}`,
    `- Jours restants dans cette semaine : ${
      typeof input.days_remaining_in_anchor_week === "number"
        ? input.days_remaining_in_anchor_week
        : "Non renseigné"
    }`,
    `- Semaine 1 partielle : ${
      input.is_partial_anchor_week === true
        ? "oui"
        : input.is_partial_anchor_week === false
        ? "non"
        : "non renseigné"
    }`,
  ];
  const timeBlock = `\n\n## Contexte temporel réel\n\n${timeLines.join("\n")}`;

  const classification = input.plan_type_classification;
  const classificationBlock = classification
    ? `\n\n## Guidance de type de plan

- Type détecté : ${classification.type_key}
- Confiance : ${classification.confidence}
- Durée crédible : ${classification.duration_guidance.min_months} à ${classification.duration_guidance.max_months} mois (défaut ${classification.duration_guidance.default_months})
- Niveau de longueur attendu : ${classification.transformation_length_level ?? "Non renseigné"} / 6
- Fourchette de phases attendue : ${classification.recommended_phase_count
      ? `${classification.recommended_phase_count.min} à ${classification.recommended_phase_count.max}`
      : "Non renseignée"}
- Rythme conseillé en fallback uniquement si aucun pace user n'est fourni : ${classification.intensity_profile?.pace ?? "Non renseigné"}
- Ajustement d'intensité en fallback : ${classification.intensity_profile?.rationale ?? "Non renseigné"}
- Structure recommandée : ${classification.journey_strategy?.mode ?? "single_transformation"}
- Durée totale estimée du parcours : ${classification.journey_strategy?.total_estimated_duration_months ?? classification.duration_guidance.default_months} mois
- Raison du découpage : ${classification.journey_strategy?.rationale ?? "Aucune"}
- Transformation 1 : ${classification.journey_strategy?.transformation_1_title ?? "Transformation courante"}
- Objectif associé 1 : ${classification.journey_strategy?.transformation_1_goal ?? "Non renseigné"}
- Transformation 2 : ${classification.journey_strategy?.transformation_2_title ?? "Aucune"}
- Objectif associé 2 : ${classification.journey_strategy?.transformation_2_goal ?? "Aucun"}
- Notes de sequencing : ${classification.sequencing_notes?.join(" | ") || "Aucune"}
- Styles de plan : ${classification.plan_style.join(", ") || "Aucun"}
- Métriques naturelles : ${classification.recommended_metrics.join(", ") || "Aucune"}
- Framings à éviter : ${classification.framing_to_avoid.join(", ") || "Aucun"}
- Premiers pas typiques : ${classification.first_steps_examples.join(", ") || "Aucun"}`
    : "";

  const constraintsBlock = [
    input.success_definition
      ? `- Définition de réussite : ${input.success_definition}`
      : null,
    input.main_constraint
      ? `- Contrainte principale : ${input.main_constraint}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `## Transformation à planifier

- Titre : ${input.title}
- cycle_id : ${input.cycle_id}
- transformation_id : ${input.transformation_id}
${constraintsBlock ? `${constraintsBlock}\n` : ""}
### Synthèse interne (pour toi)

${input.internal_summary}

### Synthèse utilisateur

${input.user_summary}

## Profil utilisateur

${profileBlock}${calibrationBlock}${answersBlock}${classificationBlock}${timeBlock}${continuityBlock}${previousTransformationBlock}${previousPlanBlock}${feedbackBlock}${validationFeedbackBlock}

## Rythme souhaite par l'utilisateur

- Pace user : ${input.user_requested_pace ?? "Non renseigné"}

Rappels importants :
- si \`user_requested_pace\` est renseigné, il est PRIORITAIRE sur \`classification.intensity_profile\`
- dans ce cas, utilise \`classification.intensity_profile\` uniquement comme garde-fou secondaire, pas comme pilote principal
- si \`user_requested_pace\` n'est pas renseigné, alors \`classification.intensity_profile\` peut servir de fallback pour calibrer la densité
- le produit possède déjà un niveau de plan 1 universel hors de ce JSON
- donc le premier niveau de plan que tu génères sera affiché comme un niveau de plan 2 côté utilisateur
- dans la preview onboarding, l'utilisateur voit en détail le niveau de plan 1 universel puis le premier niveau généré du JSON
- les niveaux générés suivants sont montrés surtout sous forme de grandes lignes via \`plan_blueprint\`
- mais dans le JSON tu dois garder des \`phase_order\` techniques séquentiels à partir de 1
- tu dois aussi remplir \`metadata.phase_1_preview\` pour personnaliser l'affichage du niveau de plan 1 universel dans la preview
- pour chaque phase, renseigne \`duration_guidance\`
- \`phase_metric_target\` doit toujours expliciter le lien avec la \`primary_metric\`, meme quand le niveau de plan est encore preparatoire
- la transformation courante doit rester dans une duree totale de 1 a 4 mois
- vise 1 a 3 mois par defaut; n'utilise 4 mois que si le contexte le justifie vraiment
- le pace user ajuste surtout la densite, la progressivite et la charge du plan, pas la duree maximale
- \`duration_guidance\` et \`journey_strategy\` restent des garde-fous utiles, mais ils ne doivent pas annuler un \`user_requested_pace\` explicite
- si la classification recommande deux transformations, tu dois generer uniquement la premiere tranche, coherente avec \`transformation_1_title\` et \`transformation_1_goal\`
- écris tous les textes user-facing en tutoiement
- retourne aussi un \`plan_blueprint\` léger pour l'ensemble des niveaux restants : objectif global, liste des niveaux futurs, intention de chaque niveau, durée estimée
- \`plan_blueprint.levels\` doit contenir uniquement les niveaux FUTURS, donc il ne doit jamais répéter le niveau courant détaillé dans \`current_level_runtime\`
- \`plan_blueprint.estimated_levels_count\` n'est pas une estimation libre : il doit être exactement égal à \`plan_blueprint.levels.length\`
- si \`plan_blueprint.levels\` contient 0 niveau, alors \`plan_blueprint.estimated_levels_count\` doit aussi valoir 0
- le premier niveau de \`plan_blueprint.levels\` doit commencer strictement après \`current_level_runtime.level_order\`
- retourne un \`current_level_runtime\` détaillé uniquement pour le niveau courant
- tu dois aussi remplir \`metadata.plan_adjustment_context\` avec une logique interne exploitable plus tard pour ajuster le niveau courant, les niveaux suivants, ou le plan complet sans perdre le fil
- le premier niveau généré du JSON doit être particulièrement clair et concret car c'est lui qui sera relu en détail avant validation
- si tu génères explicitement la partie 2 d'un parcours déjà engagé, le premier niveau généré doit montrer une continuité assumée avec la partie précédente, pas un redémarrage en baby step
- n'inclus pas le contenu réel de cartes de défense / d'attaque pour les actions du niveau de plan 2 dans ce JSON ; le produit affichera seulement des placeholders à ce stade
- si le niveau courant dure plus d'une semaine, renseigne \`current_level_runtime.weeks\` avec une progression cumulative semaine par semaine
- les semaines servent surtout à préciser le dosage, les répétitions et les jours de mission ; n'invente pas forcément de nouvelles actions chaque semaine
- si \`is_partial_anchor_week = true\`, la semaine 1 correspond uniquement a la portion restante de la semaine locale en cours ; adapte sa charge en conséquence
- si \`days_remaining_in_anchor_week\` est faible, la semaine 1 doit être explicitement plus légère que les suivantes
- \`heartbeat.target\` représente toujours le cap FINAL du niveau de plan
- chaque entrée de \`current_level_runtime.weeks\` doit expliciter la montée hebdomadaire vers ce cap via :
  - \`weekly_target_value\` : la cible chiffrée de la semaine sur la mesure du niveau
  - \`weekly_target_label\` : la version user-facing très claire de cette cible
  - \`progression_note\` : ce qui change dans le dosage cette semaine
  - \`action_focus\` : 1 à 3 rappels courts des actions du niveau à tenir ou renforcer cette semaine
  - \`item_assignments\` : la liste précise des items de la phase présents cette semaine, via leurs \`temp_id\`
- dans un niveau multi-semaines, la famille d'habitude principale du niveau doit être présente dans chaque semaine via \`item_assignments\`
- si tu gardes la même habitude d'une semaine à l'autre, fais-la monter avec \`weekly_reps\` croissants et, si utile, \`weekly_description_override\`
- si cette habitude vise à devenir **quasi quotidienne**, prends **6 répétitions/semaine** comme cap final par défaut, pas 7 ; garde 7/7 comme idéal éventuel, pas comme seuil principal
- dans ce cas, si tu réutilises la même habitude souche sur tout le niveau, fais en sorte que son \`target_reps\` de base reflète ce cap final et que les semaines détaillent la montée via \`weekly_reps\`
- si c'est plus clair produit, tu peux créer jusqu'à **une habitude proche par semaine** ; dans ce cas, les titres et descriptions doivent rester très proches et faire sentir un crescendo net sur le même levier
- si l'intensification la plus naturelle est qualitative (ex: tenir 5 min puis 10 puis 15, geste plus propre, contexte plus difficile, aide un peu moins nécessaire), fais-la monter explicitement d'une semaine à l'autre ; un mix fréquence + qualité est souvent meilleur qu'une hausse de fréquence seule
- clarifications et missions : assigne-les seulement aux semaines concernées ; ne les duplique pas automatiquement dans toutes les semaines
- dans un niveau multi-semaines, chaque semaine doit contenir au moins 1 habitude et au moins 1 mission ou clarification
- pattern par défaut sur 3 semaines : S1 = habitude + setup, S2 = même habitude ou habitude très proche + ajustement, S3 = même famille d'habitude + consolidation
- préflight obligatoire avant envoi : vérifie dans \`current_level_runtime.weeks\` que S1, S2, S3... ne contiennent jamais une habitude seule ; si une semaine est trop légère, ajoute une mission courte de consolidation/setup ou une clarification brève
- exemples de dosage utiles pour une habitude quasi quotidienne : sur 2 semaines, pense souvent \`3 -> 6\` ; sur 3 semaines, pense souvent \`3 -> 5 -> 6\` ; si la semaine 1 est partielle, allège encore le premier palier
- si une mission réduit directement la friction de l'habitude principale du niveau (preparer l'environnement, retirer une tentation, preparer le materiel, poser un repere concret, nettoyer le terrain), cette mission doit apparaitre en semaine 1, avant ou au plus tard en meme temps que la premiere clarification
- si le chemin d'action est deja connu, ne fais pas passer une clarification avant cette mission de setup
- n'utilise une clarification en semaine 1 avant la mission de setup que si cette clarification conditionne reellement le choix de l'action concrete
- interdit : S1 = habitude + clarification, puis S2 = mission de setup evidente qui aurait du rendre l'habitude faisable des le debut
- interdit : semaine 3 avec seulement une habitude
- si \`focus\`, \`progression_note\`, \`action_focus\` ou \`success_signal\` n'apportent rien, préfère \`null\` ou \`[]\` à un texte banal
- la dernière semaine doit atteindre exactement \`heartbeat.target\`
- pour les habitudes quasi quotidiennes, préfère un cap final de \`6\` à \`7\` sauf raison produit forte de faire autrement
- pour une habitude qui vise un rythme quasi quotidien, préfère une montée du type \`3 -> 5 -> 6\` sur 3 semaines, ou \`3 -> 6\` sur 2 semaines, plutôt que de répéter trois fois le même objectif flou
- \`phase_objective\` doit décrire le cap du niveau en langage simple ; le détail de progression hebdomadaire doit vivre dans \`weeks\`
- chaque entrée de \`current_level_runtime.weeks\` doit avoir \`mission_days\` sous forme de tableau de chaînes ; si aucun jour précis n'est utile, retourne \`[]\`, jamais \`null\` ni une chaîne simple
- les niveaux futurs doivent rester légers dans \`plan_blueprint\` et ne pas exposer toute la granularité des actions futures

Génère le JSON du plan V3 complet avec phases et Heartbeat. Décide la durée (1-4 mois) en fonction du calibrage, du rythme souhaité et de la classification amont. Ne découpe jamais la transformation en plusieurs parties dans ce JSON et laisse journey_context à null.`;
}

// ---------------------------------------------------------------------------
// V3 Validator
// ---------------------------------------------------------------------------

const VALID_TRACKING_MODES: ReadonlySet<string> = new Set([
  "manual",
  "inferred",
]);

const VALID_PRIMARY_METRIC_MODES: ReadonlySet<string> = new Set([
  "absolute_value",
  "count",
  "frequency",
  "duration",
  "score",
  "milestone",
  "qualitative",
]);

export type PlanV3ValidationResult = {
  valid: boolean;
  issues: string[];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown, options?: { min?: number; max?: number }): value is string[] {
  if (!Array.isArray(value) || value.some((entry) => !isNonEmptyString(entry))) {
    return false;
  }
  if (options?.min != null && value.length < options.min) return false;
  if (options?.max != null && value.length > options.max) return false;
  return true;
}

function isClarificationExerciseType(value: unknown): value is "one_shot" | "recurring" {
  return value === "one_shot" || value === "recurring";
}

function isClarificationInputType(
  value: unknown,
): value is "text" | "textarea" | "scale" | "list" | "categorized_list" {
  return value === "text" ||
    value === "textarea" ||
    value === "scale" ||
    value === "list" ||
    value === "categorized_list";
}

function validateClarificationPayload(
  payload: unknown,
  tempId: string,
): string[] {
  const issues: string[] = [];

  if (!isPlainObject(payload)) {
    return [`item ${tempId} payload must be an object`];
  }

  const details = payload.clarification_details;
  if (!isPlainObject(details)) {
    return [`item ${tempId} payload.clarification_details must be an object`];
  }

  if (!isClarificationExerciseType(details.type)) {
    issues.push(`item ${tempId} clarification_details.type must be "one_shot" or "recurring"`);
  }
  if (!isNonEmptyString(details.intro)) {
    issues.push(`item ${tempId} clarification_details.intro is required`);
  }
  if (
    details.save_label !== null &&
    details.save_label !== undefined &&
    !isNonEmptyString(details.save_label)
  ) {
    issues.push(`item ${tempId} clarification_details.save_label must be a non-empty string or null`);
  }
  if (!Array.isArray(details.sections) || details.sections.length < 1 || details.sections.length > 4) {
    issues.push(`item ${tempId} clarification_details.sections must contain 1-4 sections`);
    return issues;
  }

  const seenSectionIds = new Set<string>();
  for (const section of details.sections) {
    if (!isPlainObject(section)) {
      issues.push(`item ${tempId} clarification_details.sections entries must be objects`);
      continue;
    }
    if (!isNonEmptyString(section.id)) {
      issues.push(`item ${tempId} clarification section id is required`);
    } else if (seenSectionIds.has(section.id)) {
      issues.push(`item ${tempId} clarification section id "${section.id}" is duplicated`);
    } else {
      seenSectionIds.add(section.id);
    }
    if (!isNonEmptyString(section.label)) {
      issues.push(`item ${tempId} clarification section label is required`);
    }
    if (!isClarificationInputType(section.input_type)) {
      issues.push(`item ${tempId} clarification section input_type is invalid`);
    }
    if (
      section.placeholder !== null &&
      section.placeholder !== undefined &&
      !isNonEmptyString(section.placeholder)
    ) {
      issues.push(`item ${tempId} clarification section placeholder must be a non-empty string or null`);
    }
    if (
      section.helper_text !== null &&
      section.helper_text !== undefined &&
      !isNonEmptyString(section.helper_text)
    ) {
      issues.push(`item ${tempId} clarification section helper_text must be a non-empty string or null`);
    }
  }

  return issues;
}

function validateWeekItemAssignmentsStructure(
  value: unknown,
  contextLabel: string,
): string[] {
  const issues: string[] = [];
  if (value === null || value === undefined) return issues;
  if (!Array.isArray(value)) {
    return [`${contextLabel} item_assignments must be an array or null`];
  }
  for (const assignment of value) {
    if (!isPlainObject(assignment)) {
      issues.push(`${contextLabel} item_assignments entries must be objects`);
      continue;
    }
    if (!isNonEmptyString(assignment.temp_id)) {
      issues.push(`${contextLabel} item_assignments.temp_id is required`);
    }
    if (
      assignment.weekly_reps !== null &&
      assignment.weekly_reps !== undefined &&
      (!Number.isInteger(assignment.weekly_reps) || Number(assignment.weekly_reps) < 0)
    ) {
      issues.push(`${contextLabel} item_assignments.weekly_reps must be an integer >= 0 or null`);
    }
    if (
      assignment.weekly_description_override !== null &&
      assignment.weekly_description_override !== undefined &&
      !isNonEmptyString(assignment.weekly_description_override)
    ) {
      issues.push(`${contextLabel} item_assignments.weekly_description_override must be a non-empty string or null`);
    }
    if (
      assignment.weekly_cadence_label !== null &&
      assignment.weekly_cadence_label !== undefined &&
      !isNonEmptyString(assignment.weekly_cadence_label)
    ) {
      issues.push(`${contextLabel} item_assignments.weekly_cadence_label must be a non-empty string or null`);
    }
  }
  return issues;
}

function validateLevelWeeks(
  weeks: unknown,
  contextLabel: string,
): string[] {
  const issues: string[] = [];
  if (!Array.isArray(weeks)) {
    return [`${contextLabel} weeks must be an array`];
  }
  if (weeks.length === 0) {
    return [`${contextLabel} weeks must contain at least one week`];
  }

  const seenOrders = new Set<number>();
  for (const week of weeks) {
    if (!isPlainObject(week)) {
      issues.push(`${contextLabel} weeks entries must be objects`);
      continue;
    }

    const order = Number(week.week_order);
    if (!Number.isInteger(order) || order < 1) {
      issues.push(`${contextLabel} week_order must be an integer >= 1`);
    } else if (seenOrders.has(order)) {
      issues.push(`${contextLabel} week_order ${order} is duplicated`);
    } else {
      seenOrders.add(order);
    }

    if (!isNonEmptyString(week.title)) {
      issues.push(`${contextLabel} week title is required`);
    }
    if (
      week.focus !== null &&
      week.focus !== undefined &&
      !isNonEmptyString(week.focus)
    ) {
      issues.push(`${contextLabel} week focus must be a non-empty string or null`);
    }
    if (
      week.weekly_target_value !== null &&
      week.weekly_target_value !== undefined &&
      (!Number.isFinite(Number(week.weekly_target_value)) || Number(week.weekly_target_value) < 0)
    ) {
      issues.push(`${contextLabel} weekly_target_value must be a finite number >= 0 or null`);
    }
    if (
      week.weekly_target_label !== null &&
      week.weekly_target_label !== undefined &&
      !isNonEmptyString(week.weekly_target_label)
    ) {
      issues.push(`${contextLabel} weekly_target_label must be a non-empty string or null`);
    }
    if (
      week.progression_note !== null &&
      week.progression_note !== undefined &&
      !isNonEmptyString(week.progression_note)
    ) {
      issues.push(`${contextLabel} progression_note must be a non-empty string or null`);
    }
    if (
      week.action_focus !== null &&
      week.action_focus !== undefined &&
      (!Array.isArray(week.action_focus) || !week.action_focus.every((entry) => isNonEmptyString(entry)))
    ) {
      issues.push(`${contextLabel} action_focus must be a string[] or null`);
    }
    if (
      week.reps_summary !== null &&
      week.reps_summary !== undefined &&
      !isNonEmptyString(week.reps_summary)
    ) {
      issues.push(`${contextLabel} reps_summary must be a non-empty string or null`);
    }
    issues.push(...validateWeekItemAssignmentsStructure(
      week.item_assignments,
      `${contextLabel} week ${Number.isInteger(order) && order > 0 ? order : "unknown"}`,
    ));
    if (
      !Array.isArray(week.mission_days) ||
      !week.mission_days.every((day) => typeof day === "string")
    ) {
      issues.push(`${contextLabel} mission_days must be a string[]`);
    }
    if (
      week.success_signal !== null &&
      week.success_signal !== undefined &&
      !isNonEmptyString(week.success_signal)
    ) {
      issues.push(`${contextLabel} success_signal must be a non-empty string or null`);
    }
  }

  return issues;
}

function validateWeekAssignmentsAgainstPhase(args: {
  weeks: unknown;
  contextLabel: string;
  phaseItems: Array<Record<string, unknown>>;
}): string[] {
  const issues: string[] = [];
  if (!Array.isArray(args.weeks)) return issues;

  const phaseItemsById = new Map<string, Record<string, unknown>>();
  const habitIds = new Set<string>();
  for (const item of args.phaseItems) {
    if (!isPlainObject(item) || !isNonEmptyString(item.temp_id)) continue;
    phaseItemsById.set(item.temp_id, item);
    if (item.dimension === "habits") habitIds.add(item.temp_id);
  }

  const nonHabitUsage = new Map<string, number>();
  const habitWeeklyReps = new Map<string, number[]>();
  const firstAssignedWeekByItem = new Map<string, number>();
  const multiWeek = args.weeks.length > 1;

  for (let index = 0; index < args.weeks.length; index += 1) {
    const week = args.weeks[index];
    if (!isPlainObject(week)) continue;
    const assignments = Array.isArray(week.item_assignments) ? week.item_assignments : [];
    const weekLabel = `${args.contextLabel} week ${index + 1}`;

    if (assignments.length === 0) {
      issues.push(`${weekLabel} item_assignments must contain at least one item`);
      continue;
    }

    const weekHabitIds = new Set<string>();
    let hasNonHabit = false;

    for (const assignment of assignments) {
      if (!isPlainObject(assignment) || !isNonEmptyString(assignment.temp_id)) continue;
      const item = phaseItemsById.get(assignment.temp_id);
      if (!item) {
        issues.push(`${weekLabel} references unknown temp_id "${assignment.temp_id}"`);
        continue;
      }

      if (!firstAssignedWeekByItem.has(assignment.temp_id)) {
        firstAssignedWeekByItem.set(assignment.temp_id, index + 1);
      }

      const isHabit = item.dimension === "habits";
      if (isHabit) {
        weekHabitIds.add(assignment.temp_id);
        if (
          assignment.weekly_reps !== null &&
          assignment.weekly_reps !== undefined &&
          Number.isInteger(assignment.weekly_reps)
        ) {
          const reps = habitWeeklyReps.get(assignment.temp_id) ?? [];
          reps.push(Number(assignment.weekly_reps));
          habitWeeklyReps.set(assignment.temp_id, reps);
        }
      } else {
        hasNonHabit = true;
        nonHabitUsage.set(
          assignment.temp_id,
          (nonHabitUsage.get(assignment.temp_id) ?? 0) + 1,
        );
        if (
          assignment.weekly_reps !== null &&
          assignment.weekly_reps !== undefined
        ) {
          issues.push(`${weekLabel} weekly_reps is only allowed for habit items`);
        }
        if (
          assignment.weekly_description_override !== null &&
          assignment.weekly_description_override !== undefined
        ) {
          issues.push(`${weekLabel} weekly_description_override is only allowed for habit items`);
        }
        if (
          assignment.weekly_cadence_label !== null &&
          assignment.weekly_cadence_label !== undefined
        ) {
          issues.push(`${weekLabel} weekly_cadence_label is only allowed for habit items`);
        }
      }
    }

    if (weekHabitIds.size === 0) {
      issues.push(`${weekLabel} must contain at least one habit`);
    }
    if (multiWeek && !hasNonHabit) {
      issues.push(
        `${weekLabel} must contain at least one mission or clarification in addition to the habit; a multi-week level cannot have a habit-only week. Add a light setup, adjustment, consolidation mission, or a short clarification to this week's item_assignments`,
      );
    }
  }

  if (!multiWeek) {
    const onlyWeek = args.weeks[0];
    if (isPlainObject(onlyWeek) && Array.isArray(onlyWeek.item_assignments)) {
      const assignedDimensions = new Set<string>();
      for (const assignment of onlyWeek.item_assignments) {
        if (!isPlainObject(assignment) || !isNonEmptyString(assignment.temp_id)) continue;
        const item = phaseItemsById.get(assignment.temp_id);
        if (item && typeof item.dimension === "string") {
          assignedDimensions.add(item.dimension);
        }
      }
      if (!assignedDimensions.has("habits")) {
        issues.push(`${args.contextLabel} single-week level must contain at least one habit`);
      }
      if (!assignedDimensions.has("missions")) {
        issues.push(`${args.contextLabel} single-week level must contain at least one mission`);
      }
      if (!assignedDimensions.has("clarifications")) {
        issues.push(`${args.contextLabel} single-week level must contain at least one clarification`);
      }
    }
  }

  for (const [tempId, count] of nonHabitUsage.entries()) {
    if (count > 1) {
      issues.push(`${args.contextLabel} item "${tempId}" is duplicated across multiple weeks; missions and clarifications should be assigned only where needed`);
    }
  }

  for (const [tempId, reps] of habitWeeklyReps.entries()) {
    for (let index = 1; index < reps.length; index += 1) {
      if (reps[index] < reps[index - 1]) {
        issues.push(`${args.contextLabel} habit "${tempId}" weekly_reps must be non-decreasing`);
        break;
      }
    }
  }

  if (multiWeek) {
    const firstWeek = args.weeks[0];
    if (isPlainObject(firstWeek) && Array.isArray(firstWeek.item_assignments)) {
      let firstWeekHasHabit = false;
      let firstWeekHasMission = false;
      let firstWeekHasClarification = false;

      for (const assignment of firstWeek.item_assignments) {
        if (!isPlainObject(assignment) || !isNonEmptyString(assignment.temp_id)) continue;
        const item = phaseItemsById.get(assignment.temp_id);
        if (!item || typeof item.dimension !== "string") continue;
        if (item.dimension === "habits") firstWeekHasHabit = true;
        if (item.dimension === "missions") firstWeekHasMission = true;
        if (item.dimension === "clarifications") firstWeekHasClarification = true;
      }

      const setupMissionWeeks = args.phaseItems
        .filter((item) =>
          item.dimension === "missions" &&
          isNonEmptyString(item.temp_id) &&
          looksLikeSetupMission(item)
        )
        .map((item) => firstAssignedWeekByItem.get(item.temp_id as string))
        .filter((week): week is number => typeof week === "number");
      const earliestSetupMissionWeek = setupMissionWeeks.length > 0
        ? Math.min(...setupMissionWeeks)
        : null;

      if (
        firstWeekHasHabit &&
        firstWeekHasClarification &&
        !firstWeekHasMission &&
        earliestSetupMissionWeek != null &&
        earliestSetupMissionWeek > 1
      ) {
        issues.push(
          `${args.contextLabel} schedules a setup mission too late: when a mission prepares the main habit, it must appear in week 1 before or alongside clarifications`,
        );
      }
    }
  }

  return issues;
}

function normalizeHeuristicText(value: unknown): string {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function looksLikeSetupMission(item: Record<string, unknown>): boolean {
  const haystack = `${normalizeHeuristicText(item.title)} ${normalizeHeuristicText(item.description)}`;
  return /prepar|organis|mettre en place|installer|terrain|ranger|tri|nettoy|placard|frigo|cuisine|bureau|environnement|retir|cacher|carafe|mug|sortir|poser|materiel|repere/.test(
    haystack,
  );
}

function getPhaseMaxItems(phase: Record<string, unknown>): number {
  const weeks = Array.isArray(phase.weeks) ? phase.weeks.length : 0;
  if (weeks > 1) {
    return Math.max(5, weeks * 2);
  }
  return 5;
}

function validatePlanBlueprint(
  blueprint: unknown,
): string[] {
  const issues: string[] = [];
  if (!isPlainObject(blueprint)) {
    return ["plan_blueprint must be an object"];
  }

  if (!isNonEmptyString(blueprint.global_objective)) {
    issues.push("plan_blueprint.global_objective must be a non-empty string");
  }

  const count = Number(blueprint.estimated_levels_count);
  if (!Number.isInteger(count) || count < 0) {
    issues.push("plan_blueprint.estimated_levels_count must be an integer >= 0");
  }

  if (!Array.isArray(blueprint.levels)) {
    issues.push("plan_blueprint.levels must be an array");
    return issues;
  }
  if (Number.isInteger(count) && count !== blueprint.levels.length) {
    issues.push("plan_blueprint.estimated_levels_count must equal plan_blueprint.levels.length");
  }

  const seenPhaseIds = new Set<string>();
  const seenOrders = new Set<number>();
  for (const level of blueprint.levels) {
    if (!isPlainObject(level)) {
      issues.push("plan_blueprint.levels entries must be objects");
      continue;
    }

    if (!isNonEmptyString(level.phase_id)) {
      issues.push("plan_blueprint level phase_id is required");
    } else if (seenPhaseIds.has(level.phase_id)) {
      issues.push(`plan_blueprint phase_id "${level.phase_id}" is duplicated`);
    } else {
      seenPhaseIds.add(level.phase_id);
    }

    const order = Number(level.level_order);
    if (!Number.isInteger(order) || order < 1) {
      issues.push("plan_blueprint level_order must be an integer >= 1");
    } else if (seenOrders.has(order)) {
      issues.push(`plan_blueprint level_order ${order} is duplicated`);
    } else {
      seenOrders.add(order);
    }

    if (!isNonEmptyString(level.title)) {
      issues.push("plan_blueprint level title is required");
    }
    if (!isNonEmptyString(level.intention)) {
      issues.push("plan_blueprint level intention is required");
    }

    const durationWeeks = Number(level.estimated_duration_weeks);
    if (!Number.isInteger(durationWeeks) || durationWeeks < 1 || durationWeeks > 12) {
      issues.push("plan_blueprint estimated_duration_weeks must be an integer between 1 and 12");
    }
    if (
      level.preview_summary !== null &&
      level.preview_summary !== undefined &&
      !isNonEmptyString(level.preview_summary)
    ) {
      issues.push("plan_blueprint preview_summary must be a non-empty string or null");
    }
  }

  return issues;
}

function validateBlueprintAgainstCurrentLevel(args: {
  blueprint: unknown;
  runtime: unknown;
}): string[] {
  const issues: string[] = [];
  if (!isPlainObject(args.blueprint) || !Array.isArray(args.blueprint.levels) || !isPlainObject(args.runtime)) {
    return issues;
  }

  const runtimePhaseId = isNonEmptyString(args.runtime.phase_id) ? args.runtime.phase_id : null;
  const runtimeOrder = Number(args.runtime.level_order);
  if (!Number.isInteger(runtimeOrder) || runtimeOrder < 1) {
    return issues;
  }

  for (const level of args.blueprint.levels) {
    if (!isPlainObject(level)) continue;

    if (runtimePhaseId && level.phase_id === runtimePhaseId) {
      issues.push("plan_blueprint must not include the current_level_runtime phase");
    }

    const order = Number(level.level_order);
    if (Number.isInteger(order) && order <= runtimeOrder) {
      issues.push("plan_blueprint levels must all be strictly after current_level_runtime.level_order");
    }
  }

  return issues;
}

function validateCurrentLevelRuntime(
  runtime: unknown,
): string[] {
  const issues: string[] = [];
  if (!isPlainObject(runtime)) {
    return ["current_level_runtime must be an object"];
  }

  if (!isNonEmptyString(runtime.phase_id)) {
    issues.push("current_level_runtime.phase_id is required");
  }
  const order = Number(runtime.level_order);
  if (!Number.isInteger(order) || order < 1) {
    issues.push("current_level_runtime.level_order must be an integer >= 1");
  }
  if (!isNonEmptyString(runtime.title)) {
    issues.push("current_level_runtime.title is required");
  }
  if (!isNonEmptyString(runtime.phase_objective)) {
    issues.push("current_level_runtime.phase_objective is required");
  }
  if (!isNonEmptyString(runtime.rationale)) {
    issues.push("current_level_runtime.rationale is required");
  }

  const durationWeeks = Number(runtime.duration_weeks);
  if (!Number.isInteger(durationWeeks) || durationWeeks < 1 || durationWeeks > 12) {
    issues.push("current_level_runtime.duration_weeks must be an integer between 1 and 12");
  }
  if (!Array.isArray(runtime.maintained_foundation)) {
    issues.push("current_level_runtime.maintained_foundation must be an array");
  }
  if (!isPlainObject(runtime.heartbeat)) {
    issues.push("current_level_runtime.heartbeat must be an object");
  }
  if (
    !Array.isArray(runtime.review_focus) ||
    !runtime.review_focus.every((entry) => typeof entry === "string")
  ) {
    issues.push("current_level_runtime.review_focus must be a string[]");
  }
  if (durationWeeks > 1) {
    issues.push(...validateLevelWeeks(runtime.weeks, "current_level_runtime"));
    const heartbeatTarget = isPlainObject(runtime.heartbeat)
      ? Number(runtime.heartbeat.target)
      : NaN;
    const weekTargets = Array.isArray(runtime.weeks)
      ? runtime.weeks
        .map((week) => isPlainObject(week) ? Number(week.weekly_target_value) : NaN)
        .filter((value) => Number.isFinite(value))
      : [];
    if (weekTargets.length > 0) {
      for (let index = 1; index < weekTargets.length; index += 1) {
        if (weekTargets[index] < weekTargets[index - 1]) {
          issues.push("current_level_runtime weekly_target_value must be cumulative and non-decreasing");
          break;
        }
      }
      if (Number.isFinite(heartbeatTarget) && weekTargets[weekTargets.length - 1] !== heartbeatTarget) {
        issues.push("current_level_runtime last weekly_target_value must equal heartbeat.target");
      }
    }
  } else if (
    runtime.weeks !== undefined &&
    runtime.weeks !== null &&
    (!Array.isArray(runtime.weeks) || runtime.weeks.length < 1)
  ) {
    issues.push("current_level_runtime.weeks must be omitted or contain at least one week");
  }

  return issues;
}

/** Light structural validation of LLM-produced V3 plan JSON. */
export function validatePlanV3Output(
  raw: unknown,
): PlanV3ValidationResult {
  const issues: string[] = [];

  if (!raw || typeof raw !== "object") {
    return { valid: false, issues: ["output is not an object"] };
  }

  const plan = raw as Record<string, unknown>;

  // Top-level scalars
  if (plan.version !== 3) issues.push("version must be 3");
  if (typeof plan.cycle_id !== "string" || !plan.cycle_id) {
    issues.push("missing or invalid cycle_id");
  }
  if (typeof plan.transformation_id !== "string" || !plan.transformation_id) {
    issues.push("missing or invalid transformation_id");
  }
  const dur = plan.duration_months as number;
  if (typeof dur !== "number" || dur < 1 || dur > 4 || !Number.isInteger(dur)) {
    issues.push(
      `invalid duration_months: ${dur} (must be integer 1-4)`,
    );
  }
  if (!isNonEmptyString(plan.title)) {
    issues.push("missing title");
  }
  if (
    plan.global_objective !== undefined &&
    plan.global_objective !== null &&
    !isNonEmptyString(plan.global_objective)
  ) {
    issues.push("global_objective must be a non-empty string when provided");
  }
  if (!isNonEmptyString(plan.user_summary)) {
    issues.push("missing user_summary");
  }
  if (!isNonEmptyString(plan.internal_summary)) {
    issues.push("missing internal_summary");
  }
  if (!isNonEmptyString(plan.situation_context)) {
    issues.push("missing or empty situation_context");
  }
  if (!isNonEmptyString(plan.mechanism_analysis)) {
    issues.push("missing or empty mechanism_analysis");
  }
  if (!isNonEmptyString(plan.key_understanding)) {
    issues.push("missing or empty key_understanding");
  }
  if (!isNonEmptyString(plan.progression_logic)) {
    issues.push("missing or empty progression_logic");
  }
  if (!isNonEmptyString(plan.timeline_summary)) {
    issues.push("missing or empty timeline_summary");
  }
  if (!isPlainObject(plan.primary_metric)) {
    issues.push("missing primary_metric");
  } else {
    const primaryMetric = plan.primary_metric as Record<string, unknown>;
    if (!isNonEmptyString(primaryMetric.label)) {
      issues.push("primary_metric.label must be a non-empty string");
    }
    if (
      primaryMetric.unit !== null &&
      primaryMetric.unit !== undefined &&
      !isNonEmptyString(primaryMetric.unit)
    ) {
      issues.push("primary_metric.unit must be a non-empty string or null");
    }
    if (
      primaryMetric.baseline_value !== null &&
      primaryMetric.baseline_value !== undefined &&
      !isNonEmptyString(primaryMetric.baseline_value)
    ) {
      issues.push("primary_metric.baseline_value must be a non-empty string or null");
    }
    if (!isNonEmptyString(primaryMetric.success_target)) {
      issues.push("primary_metric.success_target must be a non-empty string");
    }
    if (!VALID_PRIMARY_METRIC_MODES.has(String(primaryMetric.measurement_mode ?? ""))) {
      issues.push("primary_metric.measurement_mode is invalid");
    }
  }
  if (!isPlainObject(plan.metadata)) {
    issues.push("metadata must be an object");
  } else {
    const metadata = plan.metadata as Record<string, unknown>;
    const phase1Preview = metadata.phase_1_preview;
    if (phase1Preview !== undefined) {
      if (!isPlainObject(phase1Preview)) {
        issues.push("metadata.phase_1_preview must be an object when provided");
      } else {
        if (!isNonEmptyString(phase1Preview.title)) {
          issues.push("metadata.phase_1_preview.title must be a non-empty string");
        }
        if (!isNonEmptyString(phase1Preview.rationale)) {
          issues.push("metadata.phase_1_preview.rationale must be a non-empty string");
        }
        if (!isNonEmptyString(phase1Preview.phase_objective)) {
          issues.push("metadata.phase_1_preview.phase_objective must be a non-empty string");
        }
        if (!isNonEmptyString(phase1Preview.heartbeat)) {
          issues.push("metadata.phase_1_preview.heartbeat must be a non-empty string");
        }
      }
    }

    const adjustmentContext = metadata.plan_adjustment_context;
    if (!isPlainObject(adjustmentContext)) {
      issues.push("metadata.plan_adjustment_context must be an object");
    } else {
      const globalReasoning = adjustmentContext.global_reasoning;
      const phaseReasoning = adjustmentContext.phase_reasoning;

      if (!isPlainObject(globalReasoning)) {
        issues.push("metadata.plan_adjustment_context.global_reasoning must be an object");
      } else {
        if (!isNonEmptyString(globalReasoning.main_problem_model)) {
          issues.push(
            "metadata.plan_adjustment_context.global_reasoning.main_problem_model must be a non-empty string",
          );
        }
        if (!isNonEmptyString(globalReasoning.sequencing_logic)) {
          issues.push(
            "metadata.plan_adjustment_context.global_reasoning.sequencing_logic must be a non-empty string",
          );
        }
        if (!isNonEmptyString(globalReasoning.why_not_faster_initially)) {
          issues.push(
            "metadata.plan_adjustment_context.global_reasoning.why_not_faster_initially must be a non-empty string",
          );
        }
        if (!isStringArray(globalReasoning.acceleration_signals, { min: 2, max: 5 })) {
          issues.push(
            "metadata.plan_adjustment_context.global_reasoning.acceleration_signals must contain 2-5 non-empty strings",
          );
        }
        if (!isStringArray(globalReasoning.slowdown_signals, { min: 2, max: 5 })) {
          issues.push(
            "metadata.plan_adjustment_context.global_reasoning.slowdown_signals must contain 2-5 non-empty strings",
          );
        }
      }

      if (!Array.isArray(phaseReasoning)) {
        issues.push("metadata.plan_adjustment_context.phase_reasoning must be an array");
      } else {
        const normalizedPhaseReasoning = phaseReasoning.filter((entry) => isPlainObject(entry));
        if (normalizedPhaseReasoning.length !== phaseReasoning.length) {
          issues.push("metadata.plan_adjustment_context.phase_reasoning entries must be objects");
        }
        if (Array.isArray(plan.phases) && phaseReasoning.length !== plan.phases.length) {
          issues.push(
            "metadata.plan_adjustment_context.phase_reasoning must have one entry per phase",
          );
        }
        normalizedPhaseReasoning.forEach((entry, index) => {
          if (!isNonEmptyString(entry.phase_id)) {
            issues.push(
              `metadata.plan_adjustment_context.phase_reasoning[${index}].phase_id must be a non-empty string`,
            );
          }
          if (
            typeof entry.phase_order !== "number" ||
            !Number.isInteger(entry.phase_order) ||
            entry.phase_order < 1
          ) {
            issues.push(
              `metadata.plan_adjustment_context.phase_reasoning[${index}].phase_order must be an integer >= 1`,
            );
          }
          if (!isNonEmptyString(entry.role_in_plan)) {
            issues.push(
              `metadata.plan_adjustment_context.phase_reasoning[${index}].role_in_plan must be a non-empty string`,
            );
          }
          if (!isNonEmptyString(entry.why_before_next)) {
            issues.push(
              `metadata.plan_adjustment_context.phase_reasoning[${index}].why_before_next must be a non-empty string`,
            );
          }
          if (!isStringArray(entry.user_signals_used, { min: 2, max: 6 })) {
            issues.push(
              `metadata.plan_adjustment_context.phase_reasoning[${index}].user_signals_used must contain 2-6 non-empty strings`,
            );
          }
          if (
            entry.prerequisite_for_next_phase !== null &&
            entry.prerequisite_for_next_phase !== undefined &&
            !isNonEmptyString(entry.prerequisite_for_next_phase)
          ) {
            issues.push(
              `metadata.plan_adjustment_context.phase_reasoning[${index}].prerequisite_for_next_phase must be a non-empty string or null`,
            );
          }
          if (!isStringArray(entry.acceleration_signals, { min: 1, max: 4 })) {
            issues.push(
              `metadata.plan_adjustment_context.phase_reasoning[${index}].acceleration_signals must contain 1-4 non-empty strings`,
            );
          }
          if (!isStringArray(entry.slowdown_signals, { min: 1, max: 4 })) {
            issues.push(
              `metadata.plan_adjustment_context.phase_reasoning[${index}].slowdown_signals must contain 1-4 non-empty strings`,
            );
          }
        });
      }
    }
  }

  if (plan.plan_blueprint !== undefined && plan.plan_blueprint !== null) {
    issues.push(...validatePlanBlueprint(plan.plan_blueprint));
  }
  if (
    plan.current_level_runtime !== undefined &&
    plan.current_level_runtime !== null
  ) {
    issues.push(...validateCurrentLevelRuntime(plan.current_level_runtime));
  }
  if (
    plan.plan_blueprint !== undefined &&
    plan.plan_blueprint !== null &&
    plan.current_level_runtime !== undefined &&
    plan.current_level_runtime !== null
  ) {
    issues.push(...validateBlueprintAgainstCurrentLevel({
      blueprint: plan.plan_blueprint,
      runtime: plan.current_level_runtime,
    }));
  }

  // Strategy
  if (!isPlainObject(plan.strategy)) {
    issues.push("missing strategy block");
  } else {
    const strat = plan.strategy as Record<string, unknown>;
    if (!isNonEmptyString(strat.success_definition)) {
      issues.push("strategy.success_definition must be a non-empty string");
    }
    if (!isNonEmptyString(strat.main_constraint)) {
      issues.push("strategy.main_constraint must be a non-empty string");
    }
    if (
      strat.identity_shift !== null &&
      strat.identity_shift !== undefined &&
      typeof strat.identity_shift !== "string"
    ) {
      issues.push("strategy.identity_shift must be a string or null");
    }
    if (
      strat.core_principle !== null &&
      strat.core_principle !== undefined &&
      typeof strat.core_principle !== "string"
    ) {
      issues.push("strategy.core_principle must be a string or null");
    }
  }

  // Inspiration narrative
  if (!isNonEmptyString(plan.inspiration_narrative)) {
    issues.push("missing or empty inspiration_narrative");
  }

  // Phases
  const phases = plan.phases;
  if (!Array.isArray(phases) || phases.length < 1 || phases.length > 12) {
    issues.push(
      `phases must be an array of 1-12 elements (got ${
        Array.isArray(phases) ? phases.length : typeof phases
      })`,
    );
    return { valid: false, issues };
  }

  const seenPhaseIds = new Set<string>();
  const allTempIds = new Set<string>();
  const tempIdsByPhase = new Map<string, Set<string>>();

  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i] as Record<string, unknown>;
    const phaseId = phase.phase_id as string;
    const phaseLabel = phaseId || `index-${i}`;

    // phase_id
    if (!isNonEmptyString(phaseId)) {
      issues.push(`phase[${i}] missing phase_id`);
    } else if (seenPhaseIds.has(phaseId)) {
      issues.push(`duplicate phase_id: ${phaseId}`);
    } else {
      seenPhaseIds.add(phaseId);
    }

    // phase_order sequential
    if (
      typeof phase.phase_order !== "number" ||
      !Number.isInteger(phase.phase_order) ||
      phase.phase_order !== i + 1
    ) {
      issues.push(
        `phase ${phaseLabel} phase_order should be ${i + 1}, got ${phase.phase_order}`,
      );
    }

    // title + rationale
    if (!isNonEmptyString(phase.title)) {
      issues.push(`phase ${phaseLabel} missing title`);
    }
    if (!isNonEmptyString(phase.rationale)) {
      issues.push(`phase ${phaseLabel} missing rationale`);
    }
    if (!isNonEmptyString(phase.phase_objective)) {
      issues.push(`phase ${phaseLabel} missing phase_objective`);
    }
    if (!isNonEmptyString(phase.duration_guidance)) {
      issues.push(`phase ${phaseLabel} missing duration_guidance`);
    }
    if (
      phase.duration_weeks !== null &&
      phase.duration_weeks !== undefined &&
      (!Number.isInteger(phase.duration_weeks) || Number(phase.duration_weeks) < 1 ||
        Number(phase.duration_weeks) > 12)
    ) {
      issues.push(`phase ${phaseLabel} duration_weeks must be an integer between 1 and 12`);
    }
    if (!isNonEmptyString(phase.what_this_phase_targets)) {
      issues.push(`phase ${phaseLabel} missing what_this_phase_targets`);
    }
    if (!isNonEmptyString(phase.why_this_now)) {
      issues.push(`phase ${phaseLabel} missing why_this_now`);
    }
    if (!isNonEmptyString(phase.how_this_phase_works)) {
      issues.push(`phase ${phaseLabel} missing how_this_phase_works`);
    }
    if (!isNonEmptyString(phase.phase_metric_target)) {
      issues.push(`phase ${phaseLabel} missing phase_metric_target`);
    }
    if (!Array.isArray(phase.maintained_foundation)) {
      issues.push(`phase ${phaseLabel} maintained_foundation must be an array`);
    } else if (
      phase.maintained_foundation.length > 3 ||
      phase.maintained_foundation.some((value) => !isNonEmptyString(value))
    ) {
      issues.push(
        `phase ${phaseLabel} maintained_foundation must contain 0-3 non-empty strings`,
      );
    }

    // Heartbeat
    const hb = phase.heartbeat as Record<string, unknown> | undefined;
    if (!isPlainObject(hb)) {
      issues.push(`phase ${phaseLabel} missing heartbeat`);
    } else {
      if (!isNonEmptyString(hb.title)) {
        issues.push(`phase ${phaseLabel} heartbeat missing title`);
      }
      if (!isNonEmptyString(hb.unit)) {
        issues.push(`phase ${phaseLabel} heartbeat missing unit`);
      }
      if (
        typeof hb.current !== "number" &&
        hb.current !== null &&
        hb.current !== undefined
      ) {
        issues.push(`phase ${phaseLabel} heartbeat current must be number or null`);
      }
      if (
        typeof hb.target !== "number" ||
        !Number.isFinite(hb.target) ||
        hb.target < 0
      ) {
        issues.push(`phase ${phaseLabel} heartbeat target must be a non-negative number`);
      }
      if (!VALID_TRACKING_MODES.has(hb.tracking_mode as string)) {
        issues.push(
          `phase ${phaseLabel} heartbeat invalid tracking_mode: ${hb.tracking_mode}`,
        );
      }
    }
    if (phase.weeks !== undefined && phase.weeks !== null) {
      issues.push(...validateLevelWeeks(phase.weeks, `phase ${phaseLabel}`));
      issues.push(...validateWeekAssignmentsAgainstPhase({
        weeks: phase.weeks,
        contextLabel: `phase ${phaseLabel}`,
        phaseItems: Array.isArray(phase.items)
          ? phase.items.filter((item): item is Record<string, unknown> => isPlainObject(item))
          : [],
      }));
    }

    // Items
    const items = phase.items;
    const phaseMaxItems = getPhaseMaxItems(phase);
    if (!Array.isArray(items) || items.length < 1 || items.length > phaseMaxItems) {
      issues.push(
        `phase ${phaseLabel} must have 1-${phaseMaxItems} items (got ${
          Array.isArray(items) ? items.length : typeof items
        })`,
      );
      continue;
    }

    const phaseTempIds = new Set<string>();
    let hasHabit = false;
    let hasActiveItem = false;

    for (const item of items as Array<Record<string, unknown>>) {
      const tempId = item.temp_id as string;
      if (!tempId || typeof tempId !== "string") {
        issues.push(`phase ${phaseLabel}: item missing temp_id`);
        continue;
      }
      const tempIdMatch = TEMP_ID_V3_PATTERN.exec(tempId);
      if (!tempIdMatch) {
        issues.push(
          `item ${tempId} invalid temp_id format (expected gen-p{N}-{dimension}-{NNN})`,
        );
      } else {
        const [, phaseNumberRaw, dimensionFromId] = tempIdMatch;
        const phaseNumber = Number(phaseNumberRaw);
        if (phaseNumber !== i + 1) {
          issues.push(
            `item ${tempId} temp_id phase number ${phaseNumber} does not match phase_order ${i + 1}`,
          );
        }
        if (item.dimension !== dimensionFromId) {
          issues.push(
            `item ${tempId} temp_id dimension "${dimensionFromId}" does not match item.dimension "${item.dimension}"`,
          );
        }
      }
      if (allTempIds.has(tempId)) {
        issues.push(`duplicate temp_id: ${tempId}`);
      }
      allTempIds.add(tempId);
      phaseTempIds.add(tempId);

      // dimension
      if (!VALID_V3_DIMENSIONS.has(item.dimension as PlanDimension)) {
        issues.push(`item ${tempId} invalid dimension: ${item.dimension}`);
      }

      // kind matches dimension
      const dim = item.dimension as PlanDimension;
      if (!VALID_KINDS.has(item.kind as PlanItemKind)) {
        issues.push(`item ${tempId} invalid kind: ${item.kind}`);
      } else if (
        VALID_V3_DIMENSIONS.has(dim) &&
        !KINDS_BY_DIMENSION[dim].has(item.kind as PlanItemKind)
      ) {
        issues.push(
          `item ${tempId} kind "${item.kind}" not allowed in dimension "${dim}"`,
        );
      }

      if (!VALID_TRACKING.has(item.tracking_type as TrackingType)) {
        issues.push(
          `item ${tempId} invalid tracking_type: ${item.tracking_type}`,
        );
      }
      if (!isNonEmptyString(item.title)) {
        issues.push(`item ${tempId} missing title`);
      }
      if (!isNonEmptyString(item.description)) {
        issues.push(`item ${tempId} missing description`);
      }
      if (dim === "clarifications") {
        issues.push(...validateClarificationPayload(item.payload, tempId));
      } else if (!isPlainObject(item.payload)) {
        issues.push(`item ${tempId} payload must be an object`);
      }

      if (item.support_mode != null) {
        issues.push(`item ${tempId} support_mode must be null in V3`);
      }
      if (item.support_function != null) {
        issues.push(`item ${tempId} support_function must be null in V3`);
      }

      if (item.kind === "habit") hasHabit = true;

      // activation_condition
      const cond = item.activation_condition as
        | Record<string, unknown>
        | null;
      if (cond === null || cond === undefined) {
        hasActiveItem = true;
      } else if (!isPlainObject(cond)) {
        issues.push(`item ${tempId} activation_condition must be an object or null`);
      } else if (cond.type === "immediate") {
        hasActiveItem = true;
      }
      if (isPlainObject(cond) && cond.type) {
        const condType = cond.type as string;
        if (!VALID_ACTIVATION_TYPES.has(condType)) {
          issues.push(
            `item ${tempId} invalid activation_condition.type: "${condType}"`,
          );
        }
        if (
          condType === "after_item_completion" ||
          condType === "after_habit_traction" ||
          condType === "after_milestone"
        ) {
          const { deps, ok } = normalizeDependsOn(cond.depends_on);
          if (!ok || deps.length === 0) {
            issues.push(
              `item ${tempId} activation_condition.depends_on must be a non-empty string or string[]`,
            );
          }
        }
        if (condType === "after_habit_traction") {
          if (
            typeof cond.min_completions !== "number" ||
            !Number.isInteger(cond.min_completions) ||
            cond.min_completions < 1
          ) {
            issues.push(
              `item ${tempId} after_habit_traction requires min_completions >= 1`,
            );
          }
        }
      }
    }

    if (!hasHabit) {
      issues.push(`phase ${phaseLabel} must have at least 1 habit`);
    }
    if (!hasActiveItem) {
      issues.push(
        `phase ${phaseLabel} must have at least 1 item active from start`,
      );
    }

    tempIdsByPhase.set(phaseId, phaseTempIds);
  }

  const adjustmentContext = isPlainObject(plan.metadata)
    ? (plan.metadata as Record<string, unknown>).plan_adjustment_context
    : null;
  if (isPlainObject(adjustmentContext) && Array.isArray(adjustmentContext.phase_reasoning)) {
    const phaseReasoning = adjustmentContext.phase_reasoning.filter((entry) => isPlainObject(entry));
    for (let i = 0; i < phaseReasoning.length; i++) {
      const reasoning = phaseReasoning[i];
      const matchingPhase = phases[i] as Record<string, unknown> | undefined;
      if (!matchingPhase) continue;

      if (reasoning.phase_id !== matchingPhase.phase_id) {
        issues.push(
          `metadata.plan_adjustment_context.phase_reasoning[${i}] phase_id must match phases[${i}].phase_id`,
        );
      }
      if (reasoning.phase_order !== matchingPhase.phase_order) {
        issues.push(
          `metadata.plan_adjustment_context.phase_reasoning[${i}] phase_order must match phases[${i}].phase_order`,
        );
      }
    }
  }

  // Cross-reference: depends_on must be within the same phase
  for (let i = 0; i < phases.length; i++) {
    const phase = phases[i] as Record<string, unknown>;
    const phaseId = phase.phase_id as string;
    const phaseTempIds = tempIdsByPhase.get(phaseId) ?? new Set<string>();
    const items = (phase.items ?? []) as Array<Record<string, unknown>>;

    for (const item of items) {
      const cond = item.activation_condition as
        | Record<string, unknown>
        | null;
      if (cond && typeof cond === "object" && cond.depends_on != null) {
        const { deps, ok } = normalizeDependsOn(cond.depends_on);
        if (!ok) {
          issues.push(
            `item ${item.temp_id} depends_on must be a string or string[]`,
          );
        } else {
          for (const dep of deps) {
            if (!phaseTempIds.has(dep)) {
              if (allTempIds.has(dep)) {
                issues.push(
                  `item ${item.temp_id} depends_on "${dep}" is in a different phase (cross-phase deps not allowed)`,
                );
              } else {
                issues.push(
                  `item ${item.temp_id} depends_on unknown temp_id: ${dep}`,
                );
              }
            }
          }
        }
      }
    }
  }

  const currentLevelRuntime = isPlainObject(plan.current_level_runtime)
    ? plan.current_level_runtime
    : null;

  if (currentLevelRuntime && isNonEmptyString(currentLevelRuntime.phase_id)) {
    const runtimePhase = phases.find((phase) =>
      isPlainObject(phase) && phase.phase_id === currentLevelRuntime.phase_id
    );
    if (isPlainObject(runtimePhase)) {
      issues.push(...validateWeekAssignmentsAgainstPhase({
        weeks: currentLevelRuntime.weeks,
        contextLabel: "current_level_runtime",
        phaseItems: Array.isArray(runtimePhase.items)
          ? runtimePhase.items.filter((item): item is Record<string, unknown> => isPlainObject(item))
          : [],
      }));
    }
  }

  if (plan.journey_context != null) {
    issues.push("journey_context must be null");
  }

  return { valid: issues.length === 0, issues };
}
