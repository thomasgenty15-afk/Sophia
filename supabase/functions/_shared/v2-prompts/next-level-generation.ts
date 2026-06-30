import type {
  NextLevelGenerationPromptContext,
} from "../v2-next-level-generation.ts";

export const NEXT_LEVEL_GENERATION_SYSTEM_PROMPT = `Tu es Sophia, coach comportementale produit.

Tu ne génères pas un plan complet.
Tu designs uniquement la prochaine marche détaillée d'un plan V3 existant, puis tu ajustes éventuellement le blueprint des niveaux futurs si c'est nécessaire pour garder la cohérence.

Réponds uniquement en JSON strict, sans markdown, sans commentaire, sans texte hors JSON.`;

function stableJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function summarizeCompletedItems(items: NextLevelGenerationPromptContext["completedLevelItems"]) {
  return items.map((item) => ({
    id: item.id,
    phase_id: item.phase_id,
    phase_order: item.phase_order,
    temp_id: typeof item.payload?._generation === "object" &&
        item.payload._generation !== null &&
        !Array.isArray(item.payload._generation) &&
        typeof (item.payload._generation as Record<string, unknown>).temp_id === "string"
      ? (item.payload._generation as Record<string, unknown>).temp_id
      : null,
    dimension: item.dimension,
    kind: item.kind,
    status: item.status,
    title: item.title,
    description: item.description,
    target_reps: item.target_reps,
    current_reps: item.current_reps,
    cadence_label: item.cadence_label,
    cards_status: item.cards_status,
  }));
}

function summarizePlanContract(context: NextLevelGenerationPromptContext) {
  const plan = context.plan;
  return {
    title: plan.title,
    global_objective: plan.global_objective,
    primary_metric: plan.primary_metric ?? null,
    success_definition: plan.strategy.success_definition,
    main_constraint: plan.strategy.main_constraint,
    identity_shift: plan.strategy.identity_shift,
    core_principle: plan.strategy.core_principle,
    progression_logic: plan.progression_logic ?? null,
    situation_context: plan.situation_context ?? null,
    mechanism_analysis: plan.mechanism_analysis ?? null,
    key_understanding: plan.key_understanding ?? null,
    timeline_summary: plan.timeline_summary,
  };
}

function deriveGenerationPolicy(context: NextLevelGenerationPromptContext) {
  const coherence = context.summary.next_plan_coherence ?? "not_sure";
  const difficulty = context.summary.difficulty_signal ?? "minor";
  const metric = context.summary.global_metric_state ?? "unclear";
  const hasCoherenceReason = Boolean(context.summary.coherence_reason?.trim());
  const hasDifficultyDetails = Boolean(context.summary.difficulty_details?.trim());

  if (coherence === "no" && difficulty === "blocking") {
    return {
      recommended_decision: "redirect_next_level",
      instruction:
        "Le user signale à la fois un problème de direction et un blocage fort. Corrige la direction du prochain niveau et baisse la charge. Ajuste les blueprints futurs seulement si le nouveau niveau rend leur enchaînement incohérent.",
    };
  }
  if (coherence === "no" || hasCoherenceReason) {
    return {
      recommended_decision: "adjust_next_level",
      instruction:
        "Le user trouve la suite incohérente. Garde l'objectif global, mais modifie le prochain niveau pour répondre au vrai blocage exprimé. Ne baisse la charge que si c'est nécessaire.",
    };
  }
  if (difficulty === "blocking" || hasDifficultyDetails || metric === "regressed") {
    return {
      recommended_decision: "lighten_next_level",
      instruction:
        "La direction reste globalement utilisable, mais le vécu du niveau demande plus de simplicité. Le prochain niveau doit être plus accessible, avec plus de soutien et moins de charge.",
    };
  }
  if (context.initialDecision === "lighten" || difficulty === "minor" || coherence === "not_sure") {
    return {
      recommended_decision: "lighten_next_level",
      instruction:
        "Le cap tient, mais il faut doser prudemment. Matérialise le prochain niveau prévu avec une charge légèrement plus simple.",
    };
  }
  return {
    recommended_decision: "keep",
    instruction:
      "La suite paraît cohérente. Matérialise le prochain niveau prévu en restant proche du blueprint, sans réécrire la roadmap.",
  };
}

export function buildNextLevelGenerationUserPrompt(
  context: NextLevelGenerationPromptContext & {
    systemValidationFeedback?: string[] | null;
  },
): string {
  const generationPolicy = deriveGenerationPolicy(context);
  const expectedNextOrder = context.currentLevelRuntime.level_order + 1;
  const expectedTempPrefix = `gen-p${expectedNextOrder}-`;
  const validationFeedback = context.systemValidationFeedback?.length
    ? `
Feedback de validation du précédent essai:
${context.systemValidationFeedback.map((issue) => `- ${issue}`).join("\n")}

Corrige ces points dans le JSON suivant.`
    : "";

  return `Objectif: générer uniquement le niveau ${expectedNextOrder} détaillé du plan V3 existant.

Tu dois produire un patch de transition, pas un plan complet.

Contrat global non modifiable:
${stableJson(summarizePlanContract(context))}

Contexte profond et données originales utiles:
${stableJson(context.transformationContext)}

Niveau terminé:
${stableJson({
    runtime: context.currentLevelRuntime,
    phase: context.completedPhase,
    real_items: summarizeCompletedItems(context.completedLevelItems),
  })}

Blueprint du prochain niveau à matérialiser:
${stableJson(context.nextBlueprintLevel)}

Blueprints futurs après le prochain niveau:
${stableJson(context.futureBlueprintLevels)}

Bilan utilisateur de fin de niveau:
${stableJson({
    review_mode: context.reviewMode,
    schema: context.reviewSchema,
    answers: context.answers,
    summary: context.summary,
    initial_decision: context.initialDecision,
    initial_decision_reason: context.initialDecisionReason,
    generation_policy: generationPolicy,
  })}

Signaux hebdomadaires récents:
${stableJson(context.weeklySignals)}

Instructions de décision:
- Si tout est cohérent et sans difficulté majeure: decision="keep", matérialise le prochain niveau proche du blueprint.
- Si le user dit que la suite ne colle pas: decision="adjust_next_level", corrige la direction du prochain niveau.
- Si le niveau a été difficile mais la direction reste cohérente: decision="lighten_next_level", simplifie la charge du prochain niveau.
- Si la suite ne colle pas et le niveau a vraiment bloqué: decision="redirect_next_level" ou "adjust_future_sequence", corrige direction et charge.
- Si changer le prochain niveau casse la cohérence des niveaux suivants, ajuste future_blueprint_levels. Sinon garde-les proches de l'existant.

Contraintes absolues:
- Ne change jamais l'objectif global, la primary_metric, la success_definition, ni la logique de progression globale.
- Respecte la logique de progression à partir du niveau terminé, pas depuis le début du plan.
- Le prochain niveau doit avoir phase_id="${context.nextBlueprintLevel.phase_id}" et level_order=${expectedNextOrder}.
- Tous les items du prochain niveau doivent avoir un temp_id qui commence par "${expectedTempPrefix}".
- Ne réutilise jamais les temp_id du niveau terminé.
- Les semaines du prochain niveau doivent référencer uniquement les temp_id des items du prochain niveau.
- Une habitude peut apparaître chaque semaine.
- Une mission, clarification ou support est un item ponctuel: il ne doit être assigné qu'à une seule semaine.
- Chaque semaine doit contenir au moins une habitude et au moins une mission, clarification ou support.
- Si duration_weeks=N, génère au moins N items non-habits distincts (missions/clarifications/support) disponibles pour les semaines.
- Assigne un item non-habit différent par semaine: semaine 1 -> non-habit A, semaine 2 -> non-habit B, semaine 3 -> non-habit C, etc.
- Les habitudes peuvent être répétées sur plusieurs semaines; les missions/clarifications/supports ne peuvent pas l'être.
- time_of_day doit être null, "anytime", "morning", "afternoon" ou "evening"; n'utilise jamais "all_day".
- Les future_blueprint_levels doivent contenir uniquement les niveaux strictement après le niveau ${expectedNextOrder}, dans l'ordre contigu.
- Ne génère pas de cartes d'attaque/défense ici.

Exemple d'assignation valide si duration_weeks=3:
- items non-habits: "${expectedTempPrefix}missions-001", "${expectedTempPrefix}clarifications-001", "${expectedTempPrefix}missions-002"
- semaine 1: "${expectedTempPrefix}missions-001" + une habitude
- semaine 2: "${expectedTempPrefix}clarifications-001" + une habitude
- semaine 3: "${expectedTempPrefix}missions-002" + une habitude
- ne remets jamais "${expectedTempPrefix}missions-001" ou "${expectedTempPrefix}clarifications-001" dans une deuxième semaine.

Format JSON strict attendu:
{
  "decision": "keep|adjust_next_level|lighten_next_level|redirect_next_level|adjust_future_sequence",
  "decision_reason": "raison courte et concrète",
  "next_level": {
    "phase_id": "${context.nextBlueprintLevel.phase_id}",
    "level_order": ${expectedNextOrder},
    "title": "titre du niveau",
    "phase_objective": "objectif du niveau",
    "rationale": "pourquoi ce niveau maintenant",
    "what_this_phase_targets": "cible comportementale ou null",
    "why_this_now": "raison contextuelle ou null",
    "how_this_phase_works": "mécanique concrète ou null",
    "duration_weeks": 1,
    "phase_metric_target": "cible liée à la métrique ou null",
    "maintained_foundation": ["acquis à conserver"],
    "heartbeat": {
      "title": "métrique hebdo du niveau",
      "unit": "unité",
      "current": null,
      "target": 1,
      "tracking_mode": "manual|inferred"
    },
    "items": [
      {
        "temp_id": "${expectedTempPrefix}missions-001",
        "dimension": "missions",
        "kind": "task",
        "title": "mission concrète",
        "description": "description actionnable",
        "tracking_type": "boolean",
        "activation_order": 1,
        "activation_condition": null,
        "support_mode": null,
        "support_function": null,
        "target_reps": null,
        "cadence_label": null,
        "scheduled_days": null,
        "time_of_day": "anytime",
        "payload": {}
      },
      {
        "temp_id": "${expectedTempPrefix}clarifications-001",
        "dimension": "clarifications",
        "kind": "framework",
        "title": "clarification ponctuelle",
        "description": "description actionnable",
        "tracking_type": "boolean",
        "activation_order": 2,
        "activation_condition": null,
        "support_mode": null,
        "support_function": null,
        "target_reps": null,
        "cadence_label": null,
        "scheduled_days": null,
        "time_of_day": "anytime",
        "payload": {}
      },
      {
        "temp_id": "${expectedTempPrefix}habits-001",
        "dimension": "habits",
        "kind": "habit",
        "title": "habitude répétable",
        "description": "description actionnable",
        "tracking_type": "count",
        "activation_order": 3,
        "activation_condition": null,
        "support_mode": null,
        "support_function": null,
        "target_reps": 2,
        "cadence_label": "2 fois/semaine",
        "scheduled_days": null,
        "time_of_day": "evening",
        "payload": {}
      }
    ],
    "weeks": [
      {
        "week_order": 1,
        "title": "titre semaine",
        "focus": "focus",
        "weekly_target_value": 1,
        "weekly_target_label": "cible lisible",
        "progression_note": "note de progression",
        "action_focus": ["focus action"],
        "item_assignments": [
          { "temp_id": "${expectedTempPrefix}missions-001" }
        ],
        "reps_summary": "résumé reps ou null",
        "mission_days": [],
        "success_signal": "signal de réussite",
        "status": "current"
      }
    ],
    "review_focus": ["question de bilan future"]
  },
  "future_blueprint_levels": [],
  "continuity_notes": {
    "kept_from_previous_level": ["ce qui est conservé"],
    "changed_because_of_review": ["ce qui change"],
    "protected_global_logic": ["comment la logique globale est protégée"]
  }
}
${validationFeedback}`;
}
