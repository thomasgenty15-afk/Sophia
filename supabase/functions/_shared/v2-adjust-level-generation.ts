// Adjustment frame for the CURRENT level of an active V3 plan (adjust-plan-v1,
// scope "level"). Distinct from v2-next-level-generation.ts, which materializes
// the NEXT level after a level completes — here the user's reality drifted and
// the level in progress must be re-based without touching the rest of the plan.
//
// The LLM output shape reuses the next-level patch structure (adjusted_level ==
// next_level shape), so validation and phase/runtime builders are reused from
// v2-next-level-generation.ts through a synthetic patch — that module is NOT
// modified.
import type {
  CurrentLevelRuntime,
  PlanContentV3,
  PlanPhase,
} from "./v2-types.ts";
import {
  buildPhaseFromNextLevelPatch,
  buildRuntimeFromNextLevelPatch,
  type NextLevelGenerationPatch,
  validateNextLevelGenerationPatch,
} from "./v2-next-level-generation.ts";

export type AdjustCurrentLevelPatch = {
  decision_reason: string;
  adjusted_level: NextLevelGenerationPatch["next_level"];
  continuity_notes: NextLevelGenerationPatch["continuity_notes"];
};

export type AdjustCurrentLevelValidationContext = {
  currentLevelOrder: number;
  currentPhaseId: string;
  globalObjective: string;
  maxWeeks: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

// Wraps the LLM output into a NextLevelGenerationPatch so the shared validator
// and builders apply. The synthetic decision/future_blueprint_levels fields are
// discarded on reassembly — the blueprint is frozen during a level adjustment.
function toSyntheticNextLevelPatch(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  return {
    decision: "adjust_next_level",
    decision_reason: raw.decision_reason,
    next_level: raw.adjusted_level,
    future_blueprint_levels: [],
    continuity_notes: raw.continuity_notes,
  };
}

export function validateAdjustCurrentLevelPatch(
  raw: unknown,
  context: AdjustCurrentLevelValidationContext,
): { valid: boolean; issues: string[] } {
  const synthetic = toSyntheticNextLevelPatch(raw);
  const base = validateNextLevelGenerationPatch(synthetic, {
    // The shared validator checks level_order === currentLevelOrder + 1 and a
    // gen-p{order+1}- temp_id prefix; shifting by -1 makes it validate the
    // CURRENT level in place.
    currentLevelOrder: context.currentLevelOrder - 1,
    completedPhaseId: context.currentPhaseId,
    expectedNextBlueprint: {
      phase_id: context.currentPhaseId,
      level_order: context.currentLevelOrder,
      title: "",
      intention: "",
      estimated_duration_weeks: context.maxWeeks,
      preview_summary: null,
    },
    existingCompletedTempIds: [],
    globalObjective: context.globalObjective,
  });
  // The LLM sees "adjusted_level" in its output schema; keep retry feedback
  // aligned with what it was asked to produce.
  const issues = base.issues.map((issue) =>
    issue.replaceAll("next_level", "adjusted_level")
  );

  const patch = isRecord(raw) ? raw : {};
  const level = isRecord(patch.adjusted_level) ? patch.adjusted_level : null;
  if (level) {
    const durationWeeks = Number(level.duration_weeks);
    if (Number.isFinite(durationWeeks) && durationWeeks > context.maxWeeks) {
      issues.push(
        `adjusted_level.duration_weeks must be <= ${context.maxWeeks} for a level adjustment (got ${durationWeeks}); keep the adjusted level within the original level's footprint and leave the remaining progression to future levels`,
      );
    }
    const items = Array.isArray(level.items) ? level.items : [];
    const hasClarification = items.some((item) =>
      isRecord(item) && item.dimension === "clarifications"
    );
    if (!hasClarification) {
      issues.push(
        "adjusted_level.items must include at least one clarification",
      );
    }
  }

  return { valid: issues.length === 0, issues };
}

export function castAdjustCurrentLevelPatch(
  raw: unknown,
): AdjustCurrentLevelPatch {
  return raw as AdjustCurrentLevelPatch;
}

// Reassembles the full plan content: only the current level (its phase entry +
// current_level_runtime) changes; everything else — global objective, strategy,
// blueprint, future levels, past — is copied verbatim from the base plan.
export function buildPlanContentWithAdjustedLevel(args: {
  basePlan: PlanContentV3;
  patch: AdjustCurrentLevelPatch;
  adjustedAt: string;
}): PlanContentV3 {
  const synthetic: NextLevelGenerationPatch = {
    decision: "adjust_next_level",
    decision_reason: args.patch.decision_reason,
    next_level: args.patch.adjusted_level,
    future_blueprint_levels: [],
    continuity_notes: args.patch.continuity_notes,
  };
  const adjustedPhase = buildPhaseFromNextLevelPatch(synthetic);
  const adjustedRuntime = buildRuntimeFromNextLevelPatch(synthetic);

  return {
    ...args.basePlan,
    phases: [
      ...args.basePlan.phases.filter((phase) =>
        phase.phase_id !== adjustedPhase.phase_id &&
        phase.phase_order !== adjustedPhase.phase_order
      ),
      adjustedPhase,
    ].sort((left, right) => left.phase_order - right.phase_order),
    current_level_runtime: adjustedRuntime,
    plan_blueprint: args.basePlan.plan_blueprint,
    metadata: {
      ...(args.basePlan.metadata ?? {}),
      last_level_adjustment: {
        adjusted_at: args.adjustedAt,
        decision_reason: args.patch.decision_reason,
        continuity_notes: args.patch.continuity_notes,
      },
    },
  };
}

export const ADJUST_CURRENT_LEVEL_SYSTEM_PROMPT =
  `Tu es Sophia, coach comportementale produit. Tu ne génères pas un plan complet et tu ne crées pas le niveau suivant. Tu réajustes uniquement le NIVEAU EN COURS d'un plan V3 existant pour le recaler sur la réalité actuelle du user, sans toucher aux niveaux futurs, au blueprint, ni à l'objectif global. Le niveau ajusté garde l'ambition et la place du niveau d'origine dans le plan.`;

export function buildAdjustCurrentLevelUserPrompt(input: {
  plan: PlanContentV3;
  currentLevelRuntime: CurrentLevelRuntime;
  currentPhase: PlanPhase;
  adjustmentReason: string;
  userChangeSummary: string | null;
  assistantMessage: string | null;
  regenerationFeedback: string | null;
  effectiveStartDate: string;
  maxWeeks: number;
  userLocalHuman: string | null;
  daysRemainingInAnchorWeek: number | null;
  isPartialAnchorWeek: boolean;
  systemValidationFeedback: string[] | null;
}): string {
  const plan = input.plan;
  const levelOrder = input.currentLevelRuntime.level_order;
  const phaseId = input.currentLevelRuntime.phase_id;

  const planContract = {
    title: plan.title,
    global_objective: plan.global_objective,
    primary_metric: plan.primary_metric ?? null,
    strategy: plan.strategy,
    progression_logic: plan.progression_logic ?? null,
    timeline_summary: plan.timeline_summary,
  };

  const futureBlueprintLevels = (plan.plan_blueprint?.levels ?? []).filter(
    (level) => level.level_order > levelOrder,
  );

  const sections = [
    `# Contrat immuable du plan (à recopier tel quel, jamais à réécrire)\n${
      JSON.stringify(planContract, null, 2)
    }`,
    `# Niveau en cours à réajuster (état actuel)\n## Runtime\n${
      JSON.stringify(input.currentLevelRuntime, null, 2)
    }\n## Phase et items actuels\n${JSON.stringify(input.currentPhase, null, 2)}`,
    `# Niveaux futurs (LECTURE SEULE — tu ne les modifies pas, ton niveau ajusté doit s'enchaîner naturellement avec eux)\n${
      JSON.stringify(futureBlueprintLevels, null, 2)
    }`,
    `# Demande d'ajustement du user\n- Raison analysée : ${input.adjustmentReason}\n${
      input.userChangeSummary
        ? `- Ce qui change (résumé validé avec le user) : ${input.userChangeSummary}\n`
        : ""
    }${
      input.assistantMessage
        ? `- Lecture de Sophia : ${input.assistantMessage}\n`
        : ""
    }${
      input.regenerationFeedback
        ? `- Détails :\n${input.regenerationFeedback}`
        : ""
    }`,
    `# Contexte temporel\n- Date effective de l'ajustement : ${input.effectiveStartDate} (tout ce qui précède est figé)\n${
      input.userLocalHuman ? `- Maintenant pour le user : ${input.userLocalHuman}\n` : ""
    }${
      input.isPartialAnchorWeek && input.daysRemainingInAnchorWeek != null
        ? `- La semaine en cours est PARTIELLE : ${input.daysRemainingInAnchorWeek} jour(s) restant(s). La semaine 1 du niveau ajusté doit rester légère et tenir dans ces jours.`
        : ""
    }`,
    `# Règles dures (non négociables)
- \`adjusted_level.level_order\` = ${levelOrder} et \`adjusted_level.phase_id\` = "${phaseId}" (identiques au niveau actuel).
- \`adjusted_level.duration_weeks\` : entier entre 1 et ${input.maxWeeks}. Un niveau ajusté ne dépasse JAMAIS ${input.maxWeeks} semaines.
- AMBITION PRÉSERVÉE : le niveau ajusté vise un incrément de progression comparable au niveau d'origine, recalé sur la réalité actuelle du user. Il n'absorbe JAMAIS les objectifs des niveaux futurs ; le reliquat de progression vers l'objectif global appartient aux niveaux futurs.
- L'objectif global et le blueprint sont IMMUABLES : tu ne les réécris pas.
- \`items\` : nouveaux \`temp_id\` au format \`gen-p${levelOrder}-{clarifications|missions|habits}-{001...}\`. Au moins 1 habitude, 1 mission et 1 clarification. Nombre total d'items ≤ 2 × duration_weeks (et ≤ 5 minimum garanti).
- \`weeks\` : exactement \`duration_weeks\` entrées, \`week_order\` 1..N. Chaque semaine contient au moins 1 habitude et au moins 1 item non-habitude. Une mission ou clarification n'est assignée qu'à UNE seule semaine. Progression hebdomadaire cumulative ; la dernière semaine atteint la cible du heartbeat.
- \`heartbeat\` : title, unit, target (nombre ≥ 0), current: null, tracking_mode "manual" ou "inferred".
- \`review_focus\` : au moins 1 question de bilan pour la fin du niveau.
- \`continuity_notes\` : kept_from_previous_level, changed_because_of_review, protected_global_logic — au moins 1 entrée chacun.`,
    `# Format de sortie (JSON STRICT, aucun texte hors JSON)
{
  "decision_reason": "string courte et concrète",
  "adjusted_level": {
    "phase_id": "${phaseId}",
    "level_order": ${levelOrder},
    "title": "string",
    "phase_objective": "string",
    "rationale": "string",
    "what_this_phase_targets": "string | null",
    "why_this_now": "string | null",
    "how_this_phase_works": "string | null",
    "duration_weeks": 1,
    "phase_metric_target": "string | null",
    "maintained_foundation": ["string"],
    "heartbeat": { "title": "string", "unit": "string", "current": null, "target": 0, "tracking_mode": "manual" },
    "items": [],
    "weeks": [],
    "review_focus": ["string"]
  },
  "continuity_notes": {
    "kept_from_previous_level": ["string"],
    "changed_because_of_review": ["string"],
    "protected_global_logic": ["string"]
  }
}`,
  ];

  if (input.systemValidationFeedback?.length) {
    sections.push(
      `# Corrections obligatoires (ta sortie précédente a été rejetée)\n${
        input.systemValidationFeedback.map((issue) => `- ${issue}`).join("\n")
      }`,
    );
  }

  return sections.join("\n\n");
}
