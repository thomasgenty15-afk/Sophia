import {
  generateWithGemini,
  getGlobalAiModel,
} from "../../../../_shared/gemini.ts";
import type { PlanAdjustmentGeneratorInput } from "../_shared/operation_payload_builder.ts";

export type LevelAdjustmentCapability =
  | "change_level_duration"
  | "modify_existing_action"
  | "change_action_frequency"
  | "pause_action"
  | "remove_action_from_level"
  | "create_bridge_action"
  | "create_new_level_action"
  | "reorder_actions"
  | "rebalance_level_load";

export const LEVEL_ADJUSTMENT_CAPABILITIES: LevelAdjustmentCapability[] = [
  "change_level_duration",
  "modify_existing_action",
  "change_action_frequency",
  "pause_action",
  "remove_action_from_level",
  "create_bridge_action",
  "create_new_level_action",
  "reorder_actions",
  "rebalance_level_load",
];

export type AdjustPlanResultV1 = {
  scope: "action" | "level" | "whole_plan";
  applied_change: {
    summary: string;
    changed_items: Array<{
      kind: "action" | "habit" | "level_setting" | "plan_setting";
      capability?: LevelAdjustmentCapability | null;
      id?: string | null;
      title: string;
      before?: string | null;
      after: string;
      reason: string;
    }>;
    preserved_items: Array<{
      kind: "action" | "habit" | "level" | "plan";
      id?: string | null;
      title: string;
      reason: string;
    }>;
  };
  boundaries: {
    affected_scope: string;
    explicitly_not_affected: string[];
    global_plan_impact: "none" | "indirect" | "requires_review";
    explanation: string;
  };
  rationale: {
    user_problem: string;
    why_this_change: string;
    expected_effect: string;
    confidence: "low" | "medium" | "high";
    missing_info: string[];
  };
  user_message_brief: string;
  user_message_detailed: string;
};

export type PlanAdjustmentDraftV1 = {
  operation_type: "adjust_plan_item";
  output_schema: "plan_adjustment_draft_v1";
  draft: {
    title: string;
    scope_label: string;
    adjustment_type: PlanAdjustmentGeneratorInput["adjustment_type"];
    execution_strategy?:
      | "patch_existing"
      | "bridge_action"
      | "level_adjustment"
      | "whole_plan_adjustment";
    proposed_change: string;
    why_it_helps: string;
    confidence: "low" | "medium" | "high";
    decision_basis: {
      user_problem: string;
      inferred_need: string;
      confidence: "low" | "medium" | "high";
      evidence: string[];
      uncertainty: string[];
      must_preserve: string[];
    };
    change_rationale: {
      why_this_change: string;
      expected_mechanism: string;
      success_condition: string;
    };
    ack_summary: {
      changed: string[];
      unchanged: string[];
      why_it_helps: string;
      confidence: "low" | "medium" | "high";
      follow_up_needed?: string | null;
    };
    adjust_plan_result: AdjustPlanResultV1;
    patch: Record<string, unknown>;
    bridge_action?: {
      title: string;
      description: string;
      source_relation: "bridge_to_original_action";
      resume_original_after_completion: boolean;
    };
    allowed_patch_fields: string[];
  };
  confirmation_message: string;
  execution_message: string;
  confirmation_actions: ["yes", "no"];
};

const SCHEDULE_FIELDS = new Set([
  "scheduled_day",
  "scheduled_date",
  "schedule",
  "day",
  "date",
  "time",
]);

export type AdjustPlanResultWriterInput = {
  scope_label: string;
  scope_kind: "action" | "level" | "whole_plan";
  adjustment_type: PlanAdjustmentGeneratorInput["adjustment_type"];
  execution_strategy: NonNullable<
    PlanAdjustmentDraftV1["draft"]["execution_strategy"]
  >;
  proposed_change: string;
  patch: Record<string, unknown>;
  bridge_action?: PlanAdjustmentDraftV1["draft"]["bridge_action"];
  decision_basis: PlanAdjustmentDraftV1["draft"]["decision_basis"];
  change_rationale: PlanAdjustmentDraftV1["draft"]["change_rationale"];
  ack_summary: PlanAdjustmentDraftV1["draft"]["ack_summary"];
  boundaries_policy: {
    affected_scope: string;
    global_plan_impact: "none" | "indirect" | "requires_review";
    explicitly_not_affected: string[];
  };
  level_adjustment_contract?: {
    allowed_capabilities: LevelAdjustmentCapability[];
    materialization_required: boolean;
    rules: string[];
  };
  user_constraints?: string[];
  materialization_candidates?: Array<{
    id: string;
    title: string;
    description?: string | null;
  }>;
};

export type AdjustPlanResultWriterOutput = {
  confirmation_message: string;
  execution_message: string;
  adjust_plan_result: AdjustPlanResultV1;
};

export type AdjustPlanResultWriter = (
  input: AdjustPlanResultWriterInput,
) => Promise<AdjustPlanResultWriterOutput>;

export type PlanAdjustmentGeneratorOptions = {
  adjust_plan_result_writer?: AdjustPlanResultWriter;
  request_id?: string | null;
  user_id?: string | null;
};

export function planAdjustmentMaterializationBlockReason(
  draft: PlanAdjustmentDraftV1,
): string | null {
  const strategy = draft.draft.execution_strategy;
  if (
    strategy !== "level_adjustment" &&
    strategy !== "whole_plan_adjustment"
  ) {
    return null;
  }
  const changedItems =
    draft.draft.adjust_plan_result?.applied_change?.changed_items ?? [];
  const concretePlanItems = changedItems.filter((item) =>
    (item.kind === "action" || item.kind === "habit") &&
    typeof item.id === "string" &&
    item.id.trim().length > 0
  );
  if (
    strategy === "level_adjustment" ||
    strategy === "whole_plan_adjustment"
  ) {
    const materializedWithCapability = concretePlanItems.filter((item) =>
      LEVEL_ADJUSTMENT_CAPABILITIES.includes(item.capability as any)
    );
    if (materializedWithCapability.length < 2) {
      return strategy === "level_adjustment"
        ? "level_adjustment_capability_or_items_missing"
        : "whole_plan_adjustment_capability_or_items_missing";
    }
  }
  if (concretePlanItems.length < 2) {
    return strategy === "level_adjustment"
      ? "level_adjustment_materialized_items_missing"
      : "whole_plan_adjustment_materialized_items_missing";
  }
  return null;
}

export function validatePlanPatch(
  patch: Record<string, unknown>,
  allowed: string[],
): void {
  if (Object.keys(patch).length === 0) throw new Error("plan_patch_empty");
  for (const key of Object.keys(patch)) {
    if (SCHEDULE_FIELDS.has(key)) throw new Error("plan_patch_schedule_field");
    if (!allowed.includes(key)) throw new Error("plan_patch_forbidden_field");
  }
}

function parseJsonObject(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  const text = String(raw ?? "").trim();
  let cleaned = text;
  if (cleaned.startsWith("```")) {
    const firstLineEnd = cleaned.indexOf("\n");
    cleaned = firstLineEnd >= 0 ? cleaned.slice(firstLineEnd + 1) : "";
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("adjust_plan_result_not_json");
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("adjust_plan_result_not_object");
  }
  return parsed as Record<string, unknown>;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function exactDurationMinutes(constraints: string[] = []): number | null {
  for (const constraint of constraints) {
    if (!constraint.startsWith("duration_minutes:")) continue;
    const value = Number(constraint.slice("duration_minutes:".length));
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

function readableFocusConstraint(constraints: string[] = []): string | null {
  const raw = constraints.find((constraint) => constraint.startsWith("focus:"));
  if (!raw) return null;
  return raw.slice("focus:".length).split("_").join(" ").trim() || null;
}

function validChangeKind(value: unknown): value is
  | "action"
  | "habit"
  | "level_setting"
  | "plan_setting" {
  return value === "action" || value === "habit" ||
    value === "level_setting" || value === "plan_setting";
}

function validPreservedKind(value: unknown): value is
  | "action"
  | "habit"
  | "level"
  | "plan" {
  return value === "action" || value === "habit" || value === "level" ||
    value === "plan";
}

function validLevelCapability(
  value: unknown,
): value is LevelAdjustmentCapability {
  return LEVEL_ADJUSTMENT_CAPABILITIES.includes(value as any);
}

function normalizeGeneratedResult(
  raw: unknown,
  input: AdjustPlanResultWriterInput,
): AdjustPlanResultWriterOutput {
  const root = parseJsonObject(raw);
  const confirmationMessage = String(root.confirmation_message ?? "").trim();
  const executionMessage = String(root.execution_message ?? "").trim();
  const result = root.adjust_plan_result as any;
  if (!confirmationMessage) throw new Error("confirmation_message_missing");
  if (!executionMessage) throw new Error("execution_message_missing");
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("adjust_plan_result_missing");
  }
  if (result.scope !== input.scope_kind) {
    throw new Error("adjust_plan_result_scope_mismatch");
  }
  const changed = Array.isArray(result.applied_change?.changed_items)
    ? result.applied_change.changed_items
    : [];
  const preserved = Array.isArray(result.applied_change?.preserved_items)
    ? result.applied_change.preserved_items
    : [];
  const normalized: AdjustPlanResultV1 = {
    scope: result.scope,
    applied_change: {
      summary: String(result.applied_change?.summary ?? "").trim(),
      changed_items: changed.map((item: any) => ({
        kind: validChangeKind(item?.kind) ? item.kind : "action",
        capability: validLevelCapability(item?.capability)
          ? item.capability
          : null,
        id: item?.id == null ? null : String(item.id),
        title: String(item?.title ?? "").trim(),
        before: item?.before == null ? null : String(item.before).trim(),
        after: String(item?.after ?? "").trim(),
        reason: String(item?.reason ?? "").trim(),
      })).filter((item: any) => item.title && item.after && item.reason),
      preserved_items: preserved.map((item: any) => ({
        kind: validPreservedKind(item?.kind) ? item.kind : "plan",
        id: item?.id == null ? null : String(item.id),
        title: String(item?.title ?? "").trim(),
        reason: String(item?.reason ?? "").trim(),
      })).filter((item: any) => item.title && item.reason),
    },
    boundaries: {
      affected_scope: String(result.boundaries?.affected_scope ?? "").trim(),
      explicitly_not_affected: stringArray(
        result.boundaries?.explicitly_not_affected,
      ),
      global_plan_impact: result.boundaries?.global_plan_impact === "none" ||
          result.boundaries?.global_plan_impact === "indirect" ||
          result.boundaries?.global_plan_impact === "requires_review"
        ? result.boundaries.global_plan_impact
        : input.boundaries_policy.global_plan_impact,
      explanation: String(result.boundaries?.explanation ?? "").trim(),
    },
    rationale: {
      user_problem: String(result.rationale?.user_problem ?? "").trim(),
      why_this_change: String(result.rationale?.why_this_change ?? "").trim(),
      expected_effect: String(result.rationale?.expected_effect ?? "").trim(),
      confidence: result.rationale?.confidence === "low" ||
          result.rationale?.confidence === "medium" ||
          result.rationale?.confidence === "high"
        ? result.rationale.confidence
        : input.decision_basis.confidence,
      missing_info: stringArray(result.rationale?.missing_info),
    },
    user_message_brief: String(result.user_message_brief ?? "").trim(),
    user_message_detailed: String(result.user_message_detailed ?? "").trim(),
  };
  if (!normalized.applied_change.summary) {
    throw new Error("adjust_plan_result_summary_missing");
  }
  if (normalized.applied_change.changed_items.length === 0) {
    throw new Error("adjust_plan_result_changed_items_missing");
  }
  if (
    input.scope_kind !== "action" &&
    normalized.applied_change.changed_items.length < 2
  ) {
    throw new Error("adjust_plan_result_changed_items_insufficient");
  }
  if (input.scope_kind !== "action") {
    const invalidMaterializedCapability = normalized.applied_change
      .changed_items.some((item) =>
        (item.kind === "action" || item.kind === "habit") &&
        item.id &&
        !validLevelCapability(item.capability)
      );
    if (invalidMaterializedCapability) {
      throw new Error("adjust_plan_result_changed_items_capability_missing");
    }
  }
  if (
    !normalized.boundaries.affected_scope || !normalized.boundaries.explanation
  ) {
    throw new Error("adjust_plan_result_boundaries_missing");
  }
  if (
    input.scope_kind === "level" &&
    normalized.boundaries.global_plan_impact !== "none"
  ) {
    throw new Error("adjust_plan_result_level_boundary_invalid");
  }
  if (!normalized.user_message_brief || !normalized.user_message_detailed) {
    throw new Error("adjust_plan_result_user_message_missing");
  }
  return {
    confirmation_message: confirmationMessage,
    execution_message: executionMessage,
    adjust_plan_result: normalized,
  };
}

export async function generateAdjustPlanResultWithAi(
  input: AdjustPlanResultWriterInput,
  meta?: { request_id?: string | null; user_id?: string | null },
): Promise<AdjustPlanResultWriterOutput> {
  const systemPrompt = [
    "Tu es le writer interne du tool adjust_plan de Sophia.",
    "Tu reçois une décision structurée déjà prise par le tool. Tu ne changes pas le patch et tu n'inventes pas de modification supplémentaire.",
    "Tu dois produire uniquement du JSON valide.",
    "Tu dois produire deux messages distincts: confirmation_message avant toute écriture, execution_message après écriture confirmée.",
    "confirmation_message doit demander l'accord ou proposer l'ajustement. Il ne doit jamais dire que le changement est déjà fait, créé, ajouté, appliqué ou enregistré.",
    "confirmation_message est un message de review du brouillon: il doit permettre au user de valider dans les grandes lignes avant toute écriture.",
    "confirmation_message doit dire explicitement que rien n'est encore appliqué ou écrire clairement que c'est une proposition avant validation.",
    "Dans confirmation_message, explique clairement ce que tu proposes de changer, pourquoi ce choix aide, et ce qui ne sera pas touché.",
    "Pour un ajustement de niveau ou de plan global, confirmation_message doit citer deux exemples concrets de changements prévus, pas seulement une catégorie générale.",
    "Respecte strictement user_constraints: si une durée, un focus, une exclusion, une priorité, un moment de journée ou une durée de contexte est donnée, elle doit apparaître dans les messages et ne doit jamais être contredite.",
    "En révision de brouillon, corrige seulement ce que le user conteste, conserve les contraintes déjà validées, et ne repars pas sur une ancienne valeur par défaut.",
    "Si le user demande des détails avant validation, user_message_detailed doit répondre directement: deux changements précis, ce qui ne bouge pas, le niveau de confiance en mots simples, et la durée/périmètre quand il s'agit du niveau ou du plan global.",
    "Pour un ajustement de niveau, cite explicitement les priorités utilisateur si elles existent dans user_constraints.",
    "Pour un ajustement de plan global, indique la durée de contexte si elle existe dans user_constraints et ce qui reste stable dans la direction du plan.",
    "Si tu n'as pas assez d'information pour dire précisément ce qui changerait, ne fais pas semblant: le brouillon doit indiquer les informations manquantes.",
    "execution_message doit être le message post-exécution: naturel, humain, précis, et expliquer ce qui a changé, ce qui ne change pas, pourquoi cette modification aide, et le niveau de confiance sans vocabulaire technique.",
    "Pour un ajustement de niveau ou de plan global, execution_message doit citer deux exemples concrets de ce qui a changé, en langage simple.",
    "Pour un ajustement de niveau ou de plan global, adjust_plan_result.applied_change.changed_items doit contenir au moins deux exemples concrets et distincts.",
    "Pour un ajustement de niveau ou de plan global, respecte strictement level_adjustment_contract: chaque changement concret doit choisir une capability autorisée et cibler une action/habitude existante par id depuis materialization_candidates.",
    "Pour un ajustement de niveau ou de plan global, n'utilise jamais level_setting/plan_setting comme faux exemple si aucune action réelle n'est modifiée. Si les actions exactes manquent, le JSON sera rejeté.",
    "Aucune phrase de réponse n'est fournie: rédige le message toi-même à partir des faits.",
    "N'utilise pas les noms d'enums, les clés JSON, les mots patch, scope, confidence, payload, current_level, whole_plan, lighter, global_load, reason_change ou change_target dans les messages destinés à l'utilisateur.",
    "Pour un ajustement de niveau, indique clairement que le changement reste limité au niveau actuel et ne modifie pas le plan global.",
    "Pour une action réduite, indique clairement la version mini créée, son rôle de pont, et que l'action d'origine reste prévue après.",
  ].join("\n");
  const baseUserPrompt = {
    task: "generate_adjust_plan_user_result",
    required_json_shape: {
      confirmation_message: "string",
      execution_message: "string",
      adjust_plan_result: {
        scope: input.scope_kind,
        applied_change: {
          summary: "string",
          changed_items: [{
            kind: "action|habit|level_setting|plan_setting",
            capability: "LevelAdjustmentCapability|null",
            id: "string|null",
            title: "string",
            before: "string|null",
            after: "string",
            reason: "string",
          }],
          changed_items_rule: input.scope_kind === "action"
            ? "one concrete changed item is acceptable"
            : "minimum two concrete changed items, each usable as an example in execution_message",
          preserved_items: [{
            kind: "action|habit|level|plan",
            id: "string|null",
            title: "string",
            reason: "string",
          }],
        },
        boundaries: {
          affected_scope: "string",
          explicitly_not_affected: ["string"],
          global_plan_impact: input.boundaries_policy.global_plan_impact,
          explanation: "string",
        },
        rationale: {
          user_problem: "string",
          why_this_change: "string",
          expected_effect: "string",
          confidence: input.decision_basis.confidence,
          missing_info: ["string"],
        },
        user_message_brief: "string",
        user_message_detailed: "string",
      },
    },
    facts: input,
    user_constraints: input.user_constraints ?? [],
    level_adjustment_contract: input.level_adjustment_contract ?? null,
    materialization_candidates: input.materialization_candidates ?? [],
  };
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const userPrompt = JSON.stringify({
      ...baseUserPrompt,
      previous_generation_error: attempt === 0
        ? null
        : lastError instanceof Error
        ? lastError.message
        : String(lastError),
      retry_instruction: attempt === 0
        ? null
        : "Corrige le JSON en respectant strictement user_constraints et sans contradiction.",
    });
    const raw = await generateWithGemini(
      systemPrompt,
      userPrompt,
      attempt === 0 ? 0.25 : 0.1,
      true,
      [],
      "auto",
      {
        requestId: meta?.request_id ?? undefined,
        userId: meta?.user_id ?? undefined,
        model: getGlobalAiModel("gemini-2.5-flash"),
        source: "adjust_plan_item.result_writer",
        forceRealAi: true,
        reasoningEffort: "low",
      },
    );
    try {
      return normalizeGeneratedResult(raw, input);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function runPlanAdjustmentGenerator(
  input: PlanAdjustmentGeneratorInput,
  options: PlanAdjustmentGeneratorOptions = {},
): Promise<PlanAdjustmentDraftV1> {
  if (!input.allowed_patch_fields.length) {
    throw new Error("plan_adjustment_allowed_patch_fields_missing");
  }
  const scopeLabel = input.scope.title ?? input.scope.current_summary;
  const scopeKind = String(input.scope.kind);
  const isActionScope = scopeKind === "specific_plan_item";
  const isLevelScope = scopeKind === "current_level" ||
    scopeKind === "current_phase";
  const isWholePlanScope = scopeKind === "whole_plan";
  const confidence = input.decision_basis?.confidence ??
    (isActionScope ? "high" : "medium");
  const reasonChange = input.reason_change?.type ?? input.reason.type;
  const changeTarget = input.change_target?.value ??
    (isActionScope
      ? "entry_cost"
      : isLevelScope
      ? "level_load"
      : "global_load");
  const actionDurationMinutes = exactDurationMinutes(input.constraints) ?? 5;
  const patch = isActionScope && input.adjustment_type === "reduce"
    ? {
      difficulty: "low",
      duration_minutes: actionDurationMinutes,
      ...(readableFocusConstraint(input.constraints)
        ? {
          instruction: `Version mini centrée sur ${
            readableFocusConstraint(input.constraints)
          }.`,
        }
        : {}),
    }
    : isActionScope && input.adjustment_type === "clarify"
    ? { instruction: `Version claire: ${scopeLabel}` }
    : isActionScope && input.adjustment_type === "pause"
    ? { paused: true }
    : isActionScope
    ? { difficulty: "medium" }
    : isLevelScope
    ? {
      scope_kind: "current_level",
      level_adjustment: input.adjustment_type === "pause"
        ? "pause_level"
        : input.adjustment_type === "reduce"
        ? "reduce_load"
        : "rebalance",
      load_adjustment: input.adjustment_type === "reduce" ? "lighter" : "same",
      reason_type: input.reason.type,
      reason_change: reasonChange,
      change_target: changeTarget,
      confidence,
      constraints: input.constraints,
    }
    : {
      scope_kind: "whole_plan",
      plan_adjustment: input.adjustment_type === "reduce"
        ? "reduce_global_load"
        : input.adjustment_type === "replace"
        ? "change_goal"
        : "resequence",
      load_adjustment: input.adjustment_type === "reduce"
        ? "lighter"
        : "review",
      reason_type: input.reason.type,
      reason_change: reasonChange,
      change_target: changeTarget,
      confidence,
      constraints: input.constraints,
    };
  validatePlanPatch(patch, input.allowed_patch_fields);
  const proposed = isLevelScope
    ? input.adjustment_type === "pause"
      ? "mettre le niveau actuel en pause"
      : input.adjustment_type === "reduce"
      ? "alleger la charge du niveau actuel sans supprimer l'intention"
      : "reequilibrer le niveau actuel"
    : isWholePlanScope
    ? input.adjustment_type === "reduce"
      ? "reduire la charge globale du plan"
      : input.adjustment_type === "replace"
      ? "changer l'objectif directeur du plan"
      : "reordonner le plan dans son ensemble"
    : input.adjustment_type === "reduce"
    ? "creer une action pont plus petite avant de reprendre l'action initiale"
    : input.adjustment_type === "clarify"
    ? "rendre l'action plus concrete"
    : input.adjustment_type === "pause"
    ? "mettre l'action en pause"
    : "ajuster le plan de facon minimale";
  const bridgeAction = isActionScope && input.adjustment_type === "reduce"
    ? {
      title: `Version mini - ${scopeLabel}`,
      description: `Action pont vers "${scopeLabel}" : faire une version de ${
        String(actionDurationMinutes)
      } minute(s)${
        readableFocusConstraint(input.constraints)
          ? ` centrée sur ${readableFocusConstraint(input.constraints)}`
          : ""
      }, assez petite pour relancer le mouvement avant de reprendre l'action initiale.`,
      source_relation: "bridge_to_original_action" as const,
      resume_original_after_completion: true,
    }
    : undefined;
  const executionStrategy = bridgeAction
    ? "bridge_action" as const
    : isLevelScope
    ? "level_adjustment" as const
    : isWholePlanScope
    ? "whole_plan_adjustment" as const
    : "patch_existing" as const;
  const defaultDecisionBasis = {
    user_problem: isActionScope
      ? `${scopeLabel} bloque parce que l'entree est trop lourde.`
      : isLevelScope
      ? `Le niveau actuel semble trop lourd ou mal calibre.`
      : `Le plan global semble moins tenable dans le contexte actuel.`,
    inferred_need: bridgeAction
      ? "reduire le cout d'entree sans supprimer l'action complete"
      : isLevelScope
      ? "preserver le coeur du niveau et reduire la charge autour"
      : isWholePlanScope
      ? "preserver la direction globale et rendre l'ensemble plus tenable"
      : "ajuster l'action sans perdre son intention",
    confidence,
    evidence: [
      ...input.reason.evidence,
      ...(input.reason_change?.evidence ?? []),
      ...(input.change_target?.evidence ?? []),
    ].filter(Boolean),
    uncertainty: isActionScope ? [] : ["details fins a confirmer dans le plan"],
    must_preserve: input.constraints.includes("preserve_plan_intent")
      ? ["intention du plan"]
      : [],
  };
  const decisionBasis = input.decision_basis ?? defaultDecisionBasis;
  const changeRationale = bridgeAction
    ? {
      why_this_change: `Créer une version mini de ${
        String(actionDurationMinutes)
      } minute(s)${
        readableFocusConstraint(input.constraints)
          ? ` centrée sur ${readableFocusConstraint(input.constraints)}`
          : ""
      } réduit le coût d'entrée sans supprimer "${scopeLabel}".`,
      expected_mechanism:
        "Une fois le chantier commencé, reprendre l'action complète devient plus simple parce qu'il y a déjà un élan et un point de reprise concret.",
      success_condition:
        "La version mini est terminée sans te braquer, puis l'action complète reste disponible juste après.",
    }
    : isLevelScope
    ? {
      why_this_change:
        `Alléger ${changeTarget} répond au problème "${reasonChange}" tout en gardant le cœur du niveau.`,
      expected_mechanism:
        "La charge autour baisse, donc le niveau redevient faisable sans effacer l'intention principale.",
      success_condition:
        "Le niveau peut être repris avec moins de friction, puis réaugmenté seulement si l'énergie et le contexte suivent.",
    }
    : isWholePlanScope
    ? {
      why_this_change:
        `Réduire ${changeTarget} répond au problème "${reasonChange}" sans changer la direction du plan.`,
      expected_mechanism:
        "Le plan garde ses rails, mais la charge baisse pour redevenir compatible avec le contexte actuel.",
      success_condition:
        "Le plan paraît tenable sans reconstruction complète ni changement d'objectif implicite.",
    }
    : {
      why_this_change:
        `Ajuster "${scopeLabel}" traite le blocage identifié sans changer le reste du plan.`,
      expected_mechanism:
        "Le changement réduit la friction locale tout en gardant l'intention.",
      success_condition: "L'action redevient faisable.",
    };
  const ackSummary = bridgeAction
    ? {
      changed: [
        `création de "${bridgeAction.title}"`,
        `format mini de ${String(actionDurationMinutes)} minutes`,
      ],
      unchanged: [
        `"${scopeLabel}" reste prévue après la version mini`,
        "l'intention de rangement n'est pas supprimée",
      ],
      why_it_helps: changeRationale.expected_mechanism,
      confidence,
      follow_up_needed: null,
    }
    : isLevelScope
    ? {
      changed: [
        `niveau actuel: charge ajustée vers "${String(patch.load_adjustment)}"`,
        `cible de changement: ${changeTarget}`,
      ],
      unchanged: [
        "le cœur du niveau reste préservé",
        "chaque action n'est pas réécrite automatiquement",
      ],
      why_it_helps: changeRationale.expected_mechanism,
      confidence,
      follow_up_needed: confidence === "high"
        ? null
        : "identifier ensuite les actions exactes à alléger si tu veux une modification fine",
    }
    : isWholePlanScope
    ? {
      changed: [
        `plan global: ${String(patch.plan_adjustment)}`,
        `cible de changement: ${changeTarget}`,
      ],
      unchanged: [
        "l'objectif/direction reste préservé sauf demande contraire explicite",
        "le plan canonique n'est pas reconstruit automatiquement",
      ],
      why_it_helps: changeRationale.expected_mechanism,
      confidence,
      follow_up_needed: confidence === "high"
        ? null
        : "identifier ensuite les semaines ou blocs les plus lourds pour affiner",
    }
    : {
      changed: [`ajustement de "${scopeLabel}"`],
      unchanged: ["le reste du plan n'est pas touché"],
      why_it_helps: changeRationale.expected_mechanism,
      confidence,
      follow_up_needed: null,
    };
  const scopeForResult = isLevelScope
    ? "level" as const
    : isWholePlanScope
    ? "whole_plan" as const
    : "action" as const;
  const boundariesPolicy = isLevelScope
    ? {
      affected_scope: "niveau actuel uniquement",
      global_plan_impact: "none" as const,
      explicitly_not_affected: [
        "objectif global",
        "structure complète du plan",
        "autres niveaux",
      ],
    }
    : isWholePlanScope
    ? {
      affected_scope: "plan dans son ensemble",
      global_plan_impact: "indirect" as const,
      explicitly_not_affected: ["objectif principal", "identité du plan"],
    }
    : {
      affected_scope: "action ciblée uniquement",
      global_plan_impact: "none" as const,
      explicitly_not_affected: [
        "objectif global",
        "autres actions du plan",
        "structure complète du plan",
      ],
    };
  const resultInput: AdjustPlanResultWriterInput = {
    scope_label: scopeLabel,
    scope_kind: scopeForResult,
    adjustment_type: input.adjustment_type,
    execution_strategy: executionStrategy,
    proposed_change: proposed,
    patch,
    ...(bridgeAction ? { bridge_action: bridgeAction } : {}),
    decision_basis: decisionBasis,
    change_rationale: changeRationale,
    ack_summary: ackSummary,
    boundaries_policy: boundariesPolicy,
    user_constraints: input.constraints,
    ...(isLevelScope || isWholePlanScope
      ? {
        level_adjustment_contract: {
          allowed_capabilities: LEVEL_ADJUSTMENT_CAPABILITIES,
          materialization_required: true,
          rules: [
            "Choisir une capability autorisée avant confirmation.",
            isLevelScope
              ? "Cibler uniquement des actions/habitudes existantes du niveau via leur id."
              : "Cibler uniquement des actions/habitudes existantes du plan via leur id.",
            "Ne pas inventer de rappel, notification, action ou réglage absent du plan.",
            "Ne pas annoncer d'application si les actions exactes à modifier ne sont pas matérialisées.",
          ],
        },
      }
      : {}),
    materialization_candidates: input.materialization_candidates ?? [],
  };
  const writer = options.adjust_plan_result_writer ??
    ((writerInput: AdjustPlanResultWriterInput) =>
      generateAdjustPlanResultWithAi(writerInput, {
        request_id: options.request_id,
        user_id: options.user_id,
      }));
  const generated = normalizeGeneratedResult(
    await writer(resultInput),
    resultInput,
  );
  return {
    operation_type: "adjust_plan_item",
    output_schema: "plan_adjustment_draft_v1",
    draft: {
      title: `Ajustement - ${scopeLabel}`,
      scope_label: scopeLabel,
      adjustment_type: input.adjustment_type,
      execution_strategy: executionStrategy,
      proposed_change: proposed,
      why_it_helps: bridgeAction
        ? "La version mini sert de pont: elle allege l'entree sans effacer l'action de depart."
        : isLevelScope
        ? "Le changement agit au niveau du bloc courant, sans pretendre modifier une seule action."
        : isWholePlanScope
        ? "Le changement traite la trajectoire globale du plan au lieu de forcer une cible action."
        : "Le changement reste minimal et preserve l'intention du plan.",
      confidence,
      decision_basis: decisionBasis,
      change_rationale: changeRationale,
      ack_summary: ackSummary,
      adjust_plan_result: generated.adjust_plan_result,
      patch,
      ...(bridgeAction ? { bridge_action: bridgeAction } : {}),
      allowed_patch_fields: input.allowed_patch_fields,
    },
    confirmation_message: generated.confirmation_message,
    execution_message: generated.execution_message,
    confirmation_actions: ["yes", "no"],
  };
}
