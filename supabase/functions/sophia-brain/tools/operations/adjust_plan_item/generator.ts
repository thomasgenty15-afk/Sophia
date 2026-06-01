import {
  generateWithGemini,
  getGeminiFallbackModel,
} from "../../../../_shared/gemini.ts";
import type { PlanAdjustmentGeneratorInput } from "../_shared/operation_payload_builder.ts";
import type { AdjustPlanCoachGuidance } from "./coach_guidance.ts";

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
    trajectory_change?: {
      before: string;
      after: string;
      inserted_step?: string | null;
      reordered_steps?: string[];
      preserved_direction: string;
      coaching_reason: string;
    } | null;
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
      kind: "action" | "habit" | "level" | "plan" | "clarification";
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

export type PlanAdjustmentResultScopeKind = "action" | "level" | "whole_plan";

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
  scope_kind: PlanAdjustmentResultScopeKind;
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
  coaching_guidance?: AdjustPlanCoachGuidance | null;
  user_constraints?: string[];
  materialization_candidates?: Array<{
    id: string;
    title: string;
    description?: string | null;
    status?: string | null;
    dimension?: string | null;
    kind?: string | null;
    item_type?: string | null;
    item_nature?: string | null;
    tracking_type?: string | null;
    cadence_label?: string | null;
    target_reps?: number | null;
    current_reps?: number | null;
    weekly_reps?: number | null;
    weekly_cadence_label?: string | null;
    availability_status?: string | null;
    available_this_week?: boolean | null;
    source_kind?: string | null;
    clarification_type?: string | null;
    clarification_section_labels?: string[];
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

type MaterializationCandidate = NonNullable<
  AdjustPlanResultWriterInput["materialization_candidates"]
>[number];

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
    (String(item.kind ?? "") === "action" ||
      String(item.kind ?? "") === "habit" ||
      String(item.kind ?? "") === "task") &&
    typeof item.id === "string" &&
    item.id.trim().length > 0
  );
  const patchConstraints = Array.isArray(draft.draft.patch?.constraints)
    ? draft.draft.patch.constraints.map((constraint) =>
      String(constraint ?? "").trim()
    ).filter(Boolean)
    : [];
  const requiredConcreteItems = strategy === "level_adjustment" &&
      strictAffectedItemsOnly(patchConstraints) &&
      affectedItemsFromConstraints(patchConstraints).length === 1
    ? 1
    : 2;
  if (
    strategy === "level_adjustment" ||
    strategy === "whole_plan_adjustment"
  ) {
    const materializedWithCapability = concretePlanItems.filter((item) =>
      LEVEL_ADJUSTMENT_CAPABILITIES.includes(item.capability as any)
    );
    if (materializedWithCapability.length < requiredConcreteItems) {
      return strategy === "level_adjustment"
        ? "level_adjustment_capability_or_items_missing"
        : "whole_plan_adjustment_capability_or_items_missing";
    }
  }
  if (concretePlanItems.length < requiredConcreteItems) {
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
  if (start < 0) throw new Error("adjust_plan_result_not_json");
  let depth = 0;
  let inString = false;
  let escaped = false;
  let end = -1;
  for (let index = start; index < cleaned.length; index += 1) {
    const char = cleaned[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = inString;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) {
      end = index;
      break;
    }
  }
  if (end <= start) throw new Error("adjust_plan_result_not_json");
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("adjust_plan_result_not_object");
  }
  return parsed as Record<string, unknown>;
}

function hasUserFacingTechnicalLeak(value: string): boolean {
  const normalized = value.toLowerCase();
  return [
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
    /\b(?:id|uuid|plan_item_id|operation_id|payload|scope_kind|current_level|whole_plan|changed_items|preserved_items)\b/i,
    /\b(?:reason_change|change_target|global_load|level_setting|plan_setting|materialization_candidates)\b/i,
    /\b(?:confidence|execution_strategy|patch|enum|json|database|db)\b/i,
    /\(\s*id\s*:/i,
    /\bid\s*:/i,
  ].some((pattern) => pattern.test(value)) ||
    normalized.includes("source_kind=") ||
    normalized.includes("status=active");
}

function assertNoUserFacingTechnicalLeak(args: {
  field: string;
  value: string;
}): void {
  if (hasUserFacingTechnicalLeak(args.value)) {
    throw new Error(`${args.field}_technical_leak`);
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function lowerTextParts(parts: string[]): string {
  return parts.map((part) => part.toLowerCase()).join("\n");
}

function hasNoPauseConstraint(input: AdjustPlanResultWriterInput): boolean {
  const text = lowerTextParts([
    ...(input.user_constraints ?? []),
    ...(input.decision_basis?.evidence ?? []),
    ...(input.decision_basis?.must_preserve ?? []),
  ]);
  return text.includes("pas mettre en pause") ||
    text.includes("pas de pause") ||
    text.includes("ne pas mettre en pause") ||
    text.includes("sans pause");
}

function changedItemMentionsPause(item: {
  capability?: LevelAdjustmentCapability | null;
  after?: string;
  reason?: string;
}): boolean {
  const text = lowerTextParts([item.after ?? "", item.reason ?? ""]);
  return item.capability === "pause_action" ||
    text.includes("mis en pause") ||
    text.includes("mise en pause") ||
    text.includes("en pause");
}

function explicitFrequencyChangeRequested(
  input: AdjustPlanResultWriterInput,
): boolean {
  const text = lowerTextParts([
    input.change_rationale.why_this_change,
    input.change_rationale.expected_mechanism,
    input.decision_basis.user_problem,
    input.decision_basis.inferred_need,
    input.change_rationale.success_condition,
    ...(input.user_constraints ?? []),
    ...(input.decision_basis.evidence ?? []),
  ]);
  return [
    "fréquence",
    "frequence",
    "cadence",
    "rythme",
    "nombre de jours",
    "jours / semaine",
    "jours par semaine",
    "fois / semaine",
    "fois par semaine",
    "moins souvent",
    "plus souvent",
    "répétition",
    "repetition",
  ].some((marker) => text.includes(marker));
}

function affectedItemsFromConstraints(constraints: string[] = []): string[] {
  return constraints.map((constraint) => {
    const prefix = "affected_item:";
    return constraint.startsWith(prefix) ? constraint.slice(prefix.length) : "";
  }).map((item) => item.trim()).filter(Boolean);
}

function preservedItemsFromConstraints(constraints: string[] = []): string[] {
  return constraints.map((constraint) => {
    const prefix = "preserve:";
    return constraint.startsWith(prefix) ? constraint.slice(prefix.length) : "";
  }).map((item) => item.trim()).filter(Boolean);
}

function strictAffectedItemsOnly(constraints: string[] = []): boolean {
  return constraints.includes("strict_affected_items_only");
}

function isClarificationCandidate(
  candidate?: MaterializationCandidate | null,
): boolean {
  if (!candidate) return false;
  return [
    candidate.dimension,
    candidate.kind,
    candidate.item_type,
    candidate.item_nature,
    candidate.clarification_type,
  ].map((value) => String(value ?? "").trim()).some((value) =>
    value === "clarifications" ||
    value === "clarification" ||
    value === "framework"
  );
}

function candidateChangeKind(
  candidate?: MaterializationCandidate | null,
): "action" | "habit" | null {
  if (!candidate || isClarificationCandidate(candidate)) return null;
  const values = [
    candidate.dimension,
    candidate.kind,
    candidate.item_type,
    candidate.item_nature,
  ].map((value) => String(value ?? "").trim());
  if (
    values.includes("habits") ||
    values.includes("habit") ||
    values.includes("recurring_habit")
  ) {
    return "habit";
  }
  return "action";
}

function candidatePreservedKind(
  candidate?: MaterializationCandidate | null,
): "action" | "habit" | "clarification" | null {
  if (!candidate) return null;
  if (isClarificationCandidate(candidate)) return "clarification";
  return candidateChangeKind(candidate);
}

function candidateMatchesUserAffectedItem(
  candidate: MaterializationCandidate,
  constraints: string[] = [],
): boolean {
  return affectedItemsFromConstraints(constraints).some((affectedItem) =>
    titleMatchesAffectedItem(candidate.title, affectedItem)
  );
}

function isEditableCurrentLevelCandidate(
  candidate: MaterializationCandidate,
  constraints: string[] = [],
): boolean {
  if (isClarificationCandidate(candidate)) return false;
  if (String(candidate.source_kind ?? "").trim() === "operation_bridge") {
    return false;
  }
  if (candidateMatchesUserAffectedItem(candidate, constraints)) return true;
  const status = String(candidate.status ?? "").trim();
  if (status === "pending" || status === "locked" || status === "completed") {
    return false;
  }
  if (status === "active") return true;
  if (candidate.available_this_week === false) return false;
  const availability = String(candidate.availability_status ?? "").trim();
  if (
    availability &&
    availability !== "available_this_week" &&
    availability !== "assigned_no_calendar"
  ) {
    return false;
  }
  return true;
}

function materializationCandidatesForWriter(
  input: PlanAdjustmentGeneratorInput,
  scopeKind: "action" | "level" | "whole_plan",
): MaterializationCandidate[] {
  const candidates = input.materialization_candidates ?? [];
  if (scopeKind === "level") {
    return candidates.filter((candidate) =>
      isEditableCurrentLevelCandidate(candidate, input.constraints) ||
      (isClarificationCandidate(candidate) &&
        candidateMatchesUserAffectedItem(candidate, input.constraints))
    );
  }
  if (scopeKind === "whole_plan") {
    return candidates.filter((candidate) =>
      !isClarificationCandidate(candidate)
    );
  }
  return candidates;
}

function findMaterializationCandidate(
  input: AdjustPlanResultWriterInput,
  item: { id?: unknown; title?: unknown },
): MaterializationCandidate | null {
  const candidates = input.materialization_candidates ?? [];
  const id = String(item.id ?? "").trim();
  if (id) {
    const byId = candidates.find((candidate) => candidate.id === id);
    if (byId) return byId;
  }
  const title = String(item.title ?? "").trim();
  if (!title) return null;
  return candidates.find((candidate) =>
    titleMatchesAffectedItem(candidate.title, title)
  ) ?? null;
}

function preservedCandidateTitlesFromConstraints(
  input: AdjustPlanResultWriterInput,
): MaterializationCandidate[] {
  const constraints = input.user_constraints ?? [];
  const candidates = input.materialization_candidates ?? [];
  return candidates.filter((candidate) =>
    constraints.some((constraint) => {
      const lower = constraint.toLowerCase();
      return titleMatchesAffectedItem(candidate.title, constraint) &&
        (lower.includes("ne bouge pas") ||
          lower.includes("inchangé") ||
          lower.includes("inchangée") ||
          lower.includes("reste identique") ||
          lower.includes("pas modifier") ||
          lower.includes("ne modifie pas"));
    })
  );
}

function titleMatchesAffectedItem(
  title: string,
  affectedItem: string,
): boolean {
  const a = title.toLowerCase().trim();
  const b = affectedItem.toLowerCase().trim();
  return Boolean(a && b && (a.includes(b) || b.includes(a)));
}

function allowsSingleLevelChangedItem(
  input: AdjustPlanResultWriterInput,
): boolean {
  return input.scope_kind === "level" &&
    affectedItemsFromConstraints(input.user_constraints).length === 1;
}

function exactDurationMinutes(constraints: string[] = []): number | null {
  for (const constraint of constraints) {
    const normalized = constraint.startsWith("duration_minutes:")
      ? constraint.slice("duration_minutes:".length)
      : constraint.startsWith("duration:")
      ? constraint.slice("duration:".length).replace(/\s*minutes?\s*$/i, "")
      : "";
    if (!normalized) continue;
    const value = Number(normalized);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

function readableFocusConstraint(constraints: string[] = []): string | null {
  const raw = constraints.find((constraint) => constraint.startsWith("focus:"));
  if (!raw) return null;
  return raw.slice("focus:".length).split("_").join(" ").trim() || null;
}

function exactTextConstraints(constraints: string[] = []): string[] {
  const prefixes = ["exact_text:", "verbatim_required:", "verbatim:"];
  return constraints.flatMap((constraint) => {
    const prefix = prefixes.find((candidate) =>
      constraint.startsWith(candidate)
    );
    if (!prefix) return [];
    let value = constraint.slice(prefix.length).trim();
    const wrappers: Array<[string, string]> = [
      ['"', '"'],
      ["'", "'"],
      ["“", "”"],
      ["«", "»"],
    ];
    for (const [open, close] of wrappers) {
      if (value.startsWith(open) && value.endsWith(close)) {
        value = value.slice(open.length, -close.length).trim();
        break;
      }
    }
    const wordCount = value.split(" ").map((word) =>
      word.trim()
    ).filter(Boolean)
      .length;
    if (prefix === "exact_text:" && wordCount < 6) return [];
    return value ? [value] : [];
  });
}

function normalizeFrequencyText(value: string): string {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function weeklyRepsFromText(value: string): number | null {
  const normalized = normalizeFrequencyText(value);
  const digitMatch = normalized.match(/\b([1-7])\s*(?:fois|jour|jours)\b/);
  if (digitMatch) return Number(digitMatch[1]);
  const words: Record<string, number> = {
    un: 1,
    une: 1,
    deux: 2,
    trois: 3,
    quatre: 4,
    cinq: 5,
    six: 6,
    sept: 7,
  };
  for (const [word, reps] of Object.entries(words)) {
    if (new RegExp(`\\b${word}\\s*(?:fois|jour|jours)\\b`).test(normalized)) {
      return reps;
    }
  }
  return null;
}

function exactWeeklyReps(constraints: string[] = []): number | null {
  for (const constraint of constraints) {
    const reps = weeklyRepsFromText(constraint);
    if (reps) return reps;
  }
  return null;
}

function actionInstructionConstraint(
  constraints: string[] = [],
): string | null {
  const exact = exactTextConstraints(constraints)[0];
  if (exact) return exact;
  const focus = readableFocusConstraint(constraints);
  if (focus) return `Version mini centrée sur ${focus}.`;
  const freeForm = constraints.map((constraint) => {
    const text = constraint.trim();
    if (!text || text === "ask_confirmation_before_write") return "";
    if (text.startsWith("affected_item:")) return "";
    if (text.startsWith("duration_minutes:")) return "";
    if (text.startsWith("frequency:")) return "";
    if (text.startsWith("negative_constraint:")) return "";
    if (weeklyRepsFromText(text)) return "";
    const normalized = normalizeFrequencyText(text);
    if (
      normalized.includes("preserve") ||
      normalized.includes("inchang") ||
      normalized.includes("ne bouge pas")
    ) return "";
    return text.replace(/^(?:style|instruction):\s*/i, "").trim();
  }).find((constraint) =>
    constraint.split(" ").map((word) => word.trim()).filter(Boolean).length >=
      4
  );
  if (freeForm) return freeForm;
  return null;
}

function buildActionPatch(
  input: PlanAdjustmentGeneratorInput,
): Record<string, unknown> {
  const weeklyReps = exactWeeklyReps(input.constraints);
  const instruction = actionInstructionConstraint(input.constraints);
  const patch: Record<string, unknown> = input.adjustment_type === "reduce"
    ? {
      difficulty: "low",
      duration_minutes: exactDurationMinutes(input.constraints) ?? 5,
    }
    : input.adjustment_type === "clarify"
    ? {
      instruction: `Version claire: ${
        input.scope.title ?? input.scope.current_summary
      }`,
    }
    : input.adjustment_type === "pause"
    ? { paused: true }
    : { difficulty: "medium" };
  if (weeklyReps) {
    patch.target_reps = weeklyReps;
    patch.cadence_label = `${weeklyReps} jours / semaine`;
  }
  if (instruction) patch.instruction = instruction;
  return patch;
}

function normalizedUserConstraintsForWriter(
  constraints: string[] = [],
): string[] {
  return constraints.filter((constraint) => {
    if (!constraint.startsWith("exact_text:")) return true;
    const value = constraint.slice("exact_text:".length).trim();
    const wordCount = value.split(" ").map((word) =>
      word.trim()
    ).filter(Boolean)
      .length;
    return wordCount >= 6;
  });
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
  | "plan"
  | "clarification" {
  return value === "action" || value === "habit" || value === "level" ||
    value === "plan" || value === "clarification";
}

function validLevelCapability(
  value: unknown,
): value is LevelAdjustmentCapability {
  return LEVEL_ADJUSTMENT_CAPABILITIES.includes(value as any);
}

function normalizeChangedItemCapability(
  item: {
    kind?: unknown;
    capability?: unknown;
    id?: unknown;
  },
  input: AdjustPlanResultWriterInput,
): LevelAdjustmentCapability | null {
  const candidate = findMaterializationCandidate(input, item);
  const kind = candidateChangeKind(candidate) ??
    (validChangeKind(item.kind) ? item.kind : "action");
  const capability = validLevelCapability(item.capability)
    ? item.capability
    : null;
  if (input.scope_kind === "action") {
    if (explicitFrequencyChangeRequested(input)) {
      return "change_action_frequency";
    }
    return capability;
  }
  if ((kind === "action" || kind === "habit") && (item.id || candidate?.id)) {
    if (
      capability === "change_level_duration" ||
      capability === "rebalance_level_load"
    ) {
      return "modify_existing_action";
    }
    return capability ?? "modify_existing_action";
  }
  return capability;
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
  assertNoUserFacingTechnicalLeak({
    field: "confirmation_message",
    value: confirmationMessage,
  });
  assertNoUserFacingTechnicalLeak({
    field: "execution_message",
    value: executionMessage,
  });
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("adjust_plan_result_missing");
  }
  const rawScope = String(result.scope ?? "").trim();
  const normalizedScope = rawScope === "current_level" ? "level" : rawScope ===
      "specific_plan_item"
    ? "action"
    : rawScope;
  if (normalizedScope !== input.scope_kind) {
    throw new Error("adjust_plan_result_scope_mismatch");
  }
  const changed = Array.isArray(result.applied_change?.changed_items)
    ? result.applied_change.changed_items
    : [];
  const preserved = Array.isArray(result.applied_change?.preserved_items)
    ? result.applied_change.preserved_items
    : [];
  const changedClarificationItems: AdjustPlanResultV1["applied_change"][
    "preserved_items"
  ] = [];
  const normalizedChangedItems = changed.flatMap((item: any) => {
    const candidate = findMaterializationCandidate(input, item);
    const sourceKind = candidateChangeKind(candidate);
    const title = String(candidate?.title ?? item?.title ?? "").trim();
    const after = String(item?.after ?? "").trim();
    const reason = String(item?.reason ?? "").trim();
    if (isClarificationCandidate(candidate)) {
      if (title) {
        changedClarificationItems.push({
          kind: "clarification",
          id: candidate?.id ?? (item?.id == null ? null : String(item.id)),
          title,
          reason: reason || "clarification_read_only",
        });
      }
      return [];
    }
    const normalizedItem = {
      kind: sourceKind ?? (validChangeKind(item?.kind) ? item.kind : "action"),
      capability: normalizeChangedItemCapability(item, input),
      id: candidate?.id ?? (item?.id == null ? null : String(item.id)),
      title,
      before: item?.before == null
        ? candidate?.description ?? null
        : String(item.before).trim(),
      after,
      reason,
    };
    return normalizedItem.title && normalizedItem.after && normalizedItem.reason
      ? [normalizedItem]
      : [];
  });
  const normalizedPreservedItems = [
    ...preserved.map((item: any) => {
      const candidate = findMaterializationCandidate(input, item);
      const sourceKind = candidatePreservedKind(candidate);
      return {
        kind: sourceKind ??
          (validPreservedKind(item?.kind) ? item.kind : "plan"),
        id: candidate?.id ?? (item?.id == null ? null : String(item.id)),
        title: String(candidate?.title ?? item?.title ?? "").trim(),
        reason: String(item?.reason ?? "").trim(),
      };
    }),
    ...changedClarificationItems,
  ].filter((item: any) => item.title && item.reason);
  const normalized: AdjustPlanResultV1 = {
    scope: normalizedScope as AdjustPlanResultV1["scope"],
    applied_change: {
      summary: String(result.applied_change?.summary ?? "").trim(),
      trajectory_change: result.applied_change?.trajectory_change &&
          typeof result.applied_change.trajectory_change === "object" &&
          !Array.isArray(result.applied_change.trajectory_change)
        ? {
          before: String(
            result.applied_change.trajectory_change.before ?? "",
          ).trim(),
          after: String(
            result.applied_change.trajectory_change.after ?? "",
          ).trim(),
          inserted_step:
            result.applied_change.trajectory_change.inserted_step == null
              ? null
              : String(
                result.applied_change.trajectory_change.inserted_step,
              ).trim(),
          reordered_steps: stringArray(
            result.applied_change.trajectory_change.reordered_steps,
          ),
          preserved_direction: String(
            result.applied_change.trajectory_change.preserved_direction ?? "",
          ).trim(),
          coaching_reason: String(
            result.applied_change.trajectory_change.coaching_reason ?? "",
          ).trim(),
        }
        : null,
      changed_items: normalizedChangedItems,
      preserved_items: normalizedPreservedItems,
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
  if (changedClarificationItems.length > 0) {
    throw new Error("adjust_plan_result_clarification_read_only");
  }
  if (normalized.applied_change.changed_items.length === 0) {
    throw new Error("adjust_plan_result_changed_items_missing");
  }
  if (!normalized.applied_change.summary) {
    normalized.applied_change.summary = normalized.applied_change.changed_items
      .map((item) => item.title)
      .filter(Boolean)
      .join(", ");
  }
  if (input.scope_kind === "whole_plan") {
    const trajectory = normalized.applied_change.trajectory_change;
    if (
      !trajectory?.before ||
      !trajectory.after ||
      !trajectory.preserved_direction ||
      !trajectory.coaching_reason
    ) {
      throw new Error("adjust_plan_result_trajectory_change_missing");
    }
  }
  const allowSingleLevelChangedItem = allowsSingleLevelChangedItem(input);
  if (
    input.scope_kind !== "action" &&
    !allowSingleLevelChangedItem &&
    normalized.applied_change.changed_items.length < 2
  ) {
    throw new Error("adjust_plan_result_changed_items_insufficient");
  }
  if (
    input.scope_kind === "level" &&
    allowSingleLevelChangedItem &&
    normalized.applied_change.changed_items.length < 1
  ) {
    throw new Error("adjust_plan_result_changed_items_missing");
  }
  const preservedTitles = preservedItemsFromConstraints(input.user_constraints);
  const changedPreservedItem = normalized.applied_change.changed_items.find((
    changedItem,
  ) =>
    preservedTitles.some((preservedTitle) =>
      titleMatchesAffectedItem(changedItem.title, preservedTitle)
    )
  );
  if (changedPreservedItem) {
    throw new Error("adjust_plan_result_changes_preserved_item");
  }
  const strictAffectedTitles = affectedItemsFromConstraints(
    input.user_constraints,
  );
  if (
    strictAffectedItemsOnly(input.user_constraints) &&
    strictAffectedTitles.length > 0
  ) {
    const changedOutsideAffected = normalized.applied_change.changed_items.find(
      (changedItem) =>
        !strictAffectedTitles.some((affectedTitle) =>
          titleMatchesAffectedItem(changedItem.title, affectedTitle)
        ),
    );
    if (changedOutsideAffected) {
      throw new Error("adjust_plan_result_changes_non_affected_item");
    }
  }
  for (const candidate of preservedCandidateTitlesFromConstraints(input)) {
    const alreadyChanged = normalized.applied_change.changed_items.some((
      item,
    ) => titleMatchesAffectedItem(item.title, candidate.title));
    const alreadyPreserved = normalized.applied_change.preserved_items.some((
      item,
    ) => titleMatchesAffectedItem(item.title, candidate.title));
    if (!alreadyChanged && !alreadyPreserved) {
      normalized.applied_change.preserved_items.push({
        kind: candidatePreservedKind(candidate) ?? "action",
        id: candidate.id ?? null,
        title: candidate.title,
        reason:
          "Le user a explicitement demandé que cette action ne change pas.",
      });
    }
  }
  if (
    hasNoPauseConstraint(input) &&
    normalized.applied_change.changed_items.some(changedItemMentionsPause)
  ) {
    throw new Error("adjust_plan_result_contradicts_no_pause_constraint");
  }
  if (
    !explicitFrequencyChangeRequested(input) &&
    normalized.applied_change.changed_items.some((item) =>
      item.capability === "change_action_frequency"
    )
  ) {
    throw new Error("adjust_plan_result_frequency_change_not_requested");
  }
  for (const exactText of exactTextConstraints(input.user_constraints)) {
    const changedItemHasExactText = normalized.applied_change.changed_items
      .some((item) => item.after.includes(exactText));
    if (!changedItemHasExactText) {
      throw new Error("adjust_plan_result_missing_exact_text_in_changed_item");
    }
    if (!confirmationMessage.includes(exactText)) {
      throw new Error("confirmation_message_missing_exact_text");
    }
    if (!executionMessage.includes(exactText)) {
      throw new Error("execution_message_missing_exact_text");
    }
    if (!normalized.user_message_detailed.includes(exactText)) {
      throw new Error("user_message_detailed_missing_exact_text");
    }
  }
  if (input.scope_kind !== "action") {
    const unmatchedConcreteItem = normalized.applied_change.changed_items.some((
      item,
    ) =>
      (item.kind === "action" || item.kind === "habit") &&
      !findMaterializationCandidate(input, item)
    );
    if (unmatchedConcreteItem) {
      throw new Error("adjust_plan_result_changed_items_candidate_missing");
    }
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
  assertNoUserFacingTechnicalLeak({
    field: "user_message_brief",
    value: normalized.user_message_brief,
  });
  assertNoUserFacingTechnicalLeak({
    field: "user_message_detailed",
    value: normalized.user_message_detailed,
  });
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
  const writerUserConstraints = normalizedUserConstraintsForWriter(
    input.user_constraints ?? [],
  );
  const systemPrompt = [
    "Tu es le writer interne du tool adjust_plan de Sophia.",
    "Tu reçois une décision structurée déjà prise par le tool. Tu ne changes pas le patch et tu n'inventes pas de modification supplémentaire.",
    "Tu dois produire uniquement du JSON strict valide, parsable par JSON.parse: pas de markdown, pas de commentaire, pas de texte hors JSON.",
    'Dans les chaînes JSON, tout guillemet interne doit être échappé avec \\". Si tu écris une expression entre guillemets dans un message, échappe ces guillemets.',
    "Tu dois produire deux messages distincts: confirmation_message avant toute écriture, execution_message après écriture confirmée.",
    'Tu tutoies toujours l\'utilisateur. N\'utilise "vous", "votre" ou "vos" que si tu parles explicitement du couple ou de plusieurs personnes, jamais pour t\'adresser directement à l\'utilisateur.',
    'Quand confirmation_message ou execution_message parle de toi, utilise la premiere personne du singulier ("je", "me", "moi"), jamais "Sophia".',
    "Les IDs techniques, UUID, plan_item_id, operation_id, clés JSON, noms de champs internes, statuts internes, noms d'enums et détails d'implémentation sont strictement interdits dans confirmation_message, execution_message, user_message_brief et user_message_detailed.",
    "Les identifiants ne servent qu'au JSON interne dans changed_items.id et preserved_items.id. Pour parler au user, utilise uniquement les titres lisibles des actions, niveaux, étapes ou phases.",
    "confirmation_message doit demander l'accord ou proposer l'ajustement. Il ne doit jamais dire que le changement est déjà fait, créé, ajouté, appliqué ou enregistré.",
    "confirmation_message est un message de review du brouillon: il doit permettre au user de valider dans les grandes lignes avant toute écriture.",
    "confirmation_message doit dire explicitement que rien n'est encore appliqué ou écrire clairement que c'est une proposition avant validation.",
    "Dans confirmation_message, explique clairement ce que tu proposes de changer, pourquoi ce choix aide, et ce qui ne sera pas touché.",
    "Pour un ajustement de niveau ou de plan global, confirmation_message doit citer deux exemples concrets de changements prévus, pas seulement une catégorie générale.",
    "Exception: si user_constraints contient un seul affected_item, ne propose qu'un seul changement concret pour cet item et cite le reste comme inchangé.",
    "Respecte strictement user_constraints: si une durée, un focus, une exclusion, une priorité, un moment de journée ou une durée de contexte est donnée, elle doit apparaître dans les messages et ne doit jamais être contredite.",
    "Si user_constraints contient une valeur exacte pour un item ciblé (ex: option par défaut, fréquence à conserver, question unique, durée), cette valeur doit apparaître dans changed_items.after et dans confirmation_message/execution_message.",
    "Quand le user parle d'un rythme temporaire ou de cette semaine, dis 'ramener/mettre cette semaine à X' plutôt que 'passer de Y à X', sauf si Y est explicitement la charge de cette même semaine.",
    "Si user_constraints contient exact_text:<texte>, tu dois copier exactement <texte> dans changed_items.after, confirmation_message, execution_message et user_message_detailed. Interdiction de reformuler, raccourcir, traduire, remplacer par un synonyme ou changer la ponctuation.",
    "Le plan_snapshot est la source de vérité: status est l'état runtime en base, tandis que available_this_week/availability_status décrivent ce qui est disponible dans la semaine courante.",
    "Ne présente jamais status=active comme preuve qu'une action est dans la semaine courante; utilise available_this_week ou week_scope.",
    "Ne change jamais la nature d'une action en 'ponctuelle' si plan_snapshot indique item_nature=one_shot_mission, dimension=missions, item_type=task ou cadence_label d'action unique. Dans ce cas, explique plutôt le déplacement, la simplification, le timing ou la charge modifiée.",
    "Ne transforme jamais une fréquence sans t'appuyer sur target_reps, cadence_label, weekly_reps ou weekly_cadence_label depuis plan_snapshot/materialization_candidates.",
    "Les habits/habitudes restent des habitudes: si materialization_candidates indique dimension=habits, kind=habit ou item_nature=recurring_habit, changed_items.kind doit être habit et tu dois raisonner à partir de cadence_label/target_reps. Ne présente pas une préparation ou décision ponctuelle comme si elle remplaçait la fréquence de l'habitude.",
    "Si tu déplaces une préparation liée à une habitude sur un jour précis, précise que seul le support/la préparation/la décision est déplacé; l'habitude conserve sa cadence sauf demande explicite de changer la fréquence.",
    "Si le problème est la fatigue décisionnelle ou la volonté le soir, ne réduis pas la fréquence de l'habitude par défaut. Allège plutôt la décision, le choix par défaut, l'environnement ou la charge d'exécution. Ne change la fréquence/cadence/nombre de jours que si le user l'a demandé explicitement.",
    "Les clarifications sont en lecture seule dans adjust_plan: si materialization_candidates indique dimension=clarifications, kind=framework, item_nature=clarification ou clarification_type, ne mets jamais cet item dans changed_items.",
    "Une clarification peut seulement apparaître dans preserved_items et servir de contexte. Ne réécris jamais ses questions, ses sections, sa description ou son clarification_details via adjust_plan.",
    "Si la demande du user vise uniquement une clarification, ne fabrique pas une modification: le résultat sera rejeté. Il faut cibler une habitude, une mission ou une action modifiable du plan.",
    "Pour un ajustement de niveau actuel, materialization_candidates contient uniquement les items éditables maintenant. Ne parle pas comme si une mission future/pending était déjà activée ou comme si elle aidait cette semaine si elle n'apparaît pas dans materialization_candidates.",
    "N'ajoute jamais un horaire, un jour précis ou une préparation du dimanche si ce n'est pas demandé par le user dans cette conversation ou explicitement présent dans l'item éditable ciblé.",
    "Évite de choisir des items source_kind=operation_bridge comme exemples de modification quand des items source_kind=plan_generated existent dans le périmètre: les bridges ne sont pas le plan de base.",
    "Si user_constraints contient affected_item:<titre>, les changed_items doivent rester strictement dans ces titres ciblés. Les autres actions doivent aller dans preserved_items si elles sont mentionnées.",
    'Si le user dit seulement "signal de pause" ou demande que le signal soit plus court/simple/5 minutes, cible l\'action de mise en place du signal, par exemple "Convenir d\'un signal de pause". Ne cible "Faire le point sur le signal de pause" que si le user parle explicitement de bilan, faire le point, review, retour d\'experience ou evaluation.',
    "Si user_constraints ou evidence dit de ne pas mettre en pause, aucune changed_item ne doit utiliser pause_action ni dire mis/en pause.",
    "Si adjustment_type vaut replace, présente le changement comme un remplacement de l'action ciblée. Ne dis pas que l'action complète, l'ancienne version ou la forme initiale reste prévue ensuite, sauf demande explicite du user.",
    "Pour replace sur une action ciblée, execution_message doit dire que la nouvelle formulation remplace l'ancienne dans le niveau, pas qu'elle sert de version mini ou de pont.",
    "En révision de brouillon, corrige seulement ce que le user conteste, conserve les contraintes déjà validées, et ne repars pas sur une ancienne valeur par défaut.",
    "Une demande temporaire de calme/allegement/rythme sur cette semaine, deux prochaines semaines ou quelques jours est un ajustement de niveau, pas une refonte du plan global. Ne parle pas de changer la trajectoire globale dans ce cas.",
    "Si user_constraints contient level_boundary_note:<texte>, explique en langage simple que l'ajustement porte sur le niveau actuel; si la periode demandee depasse la fin du niveau, ce repere devra etre gardé pour le prochain niveau au moment de sa creation. Ne transforme pas cette note en changement de plan global.",
    "Si coaching_guidance est fourni, utilise-le comme source qualitative de coaching: observation, recommendation, warnings, preserve, avoid et guidelines doivent guider le brouillon.",
    "coaching_guidance n'est pas une validation bloquante: ne dis jamais au user qu'un coach specialise a valide ou refuse. Integre simplement ses recommandations dans ta proposition.",
    "Respecte les warnings et avoid de coaching_guidance: ne propose pas une option explicitement marquee comme a eviter sauf si le dernier message user la demande clairement.",
    "Respecte preserve de coaching_guidance: ce qui doit rester stable doit apparaitre comme inchangé ou preserve dans le brouillon.",
    "Pour action, lis action_request_category dans user_constraints comme classification de la demande: feasibility_load=alleger/rendre faisable; challenge_intensity=augmenter l'ambition; timing_duration=changer moment/duree/frequence; method_format=changer la maniere; scope_focus=recentrer/decouper; replacement_alternative=remplacer; support_guardrail=ajouter aide/preparation/plan B.",
    "Pour level, lis level_request_category dans user_constraints comme classification de la demande: pacing_workload=rythme/charge; difficulty_progression=difficulte/progression; sequence_priority=ordre/priorite; level_focus=centre du niveau; action_mix=composition d'actions; context_constraints=contrainte externe; recovery_reset=reprendre apres retard/decrochage/confusion.",
    "Les request_category action/level guident l'interpretation de la demande, mais ne remplacent jamais adjustment_type, change_target, affected_items, user_constraints concretes ni materialization_candidates.",
    "Pour whole_plan, si coaching_guidance parle de prerequis, sequence, phase future ou coherence globale, raisonne en trajectoire et non en patch arbitraire d'actions courantes.",
    "Pour whole_plan, lis whole_plan_change_family dans user_constraints. Cette famille determine la trajectoire a materialiser: sequence_order_issue=reordonner/ralentir; missing_bridge_or_level=ajouter une phase ou un niveau pont; direction_change=changer l'axe du plan; success_criteria_change=changer les criteres de reussite; future_phase_mismatch=reprendre une phase future; style_or_method_mismatch=changer la methode; maintenance_or_consolidation_gap=ajouter consolidation; global_capacity_change=changer le rythme global; plan_no_longer_relevant=re-diagnostiquer avant refonte.",
    "Pour whole_plan, si whole_plan_readiness vaut diagnose, ne fabrique pas une application definitive: le brouillon doit signaler les informations manquantes et ne pas demander une execution immediate.",
    "Pour whole_plan, si whole_plan_candidate_operation est insert_phase, le trajectory_change doit nommer la phase inseree, son role et son critere de passage.",
    "Pour whole_plan, si whole_plan_candidate_operation est change_emphasis, le trajectory_change doit expliciter ancienne emphase, nouvelle emphase et ce qui reste stable.",
    "Pour un ajustement de niveau ou de plan global, user_message_detailed doit détailler au moins deux changed_items avec le titre exact, avant, après, et pourquoi ça aide. Utilise les champs before/after/reason des changed_items et ne te contente jamais d'un résumé général.",
    "Si le user demande des détails avant validation, user_message_detailed doit répondre directement: deux changements précis avec avant/après/pourquoi, ce qui ne bouge pas, le niveau de confiance en mots simples, et la durée/périmètre quand il s'agit du niveau ou du plan global.",
    "Pour un ajustement de niveau, cite explicitement les priorités utilisateur si elles existent dans user_constraints.",
    "Pour un ajustement de plan global, indique la durée de contexte si elle existe dans user_constraints et ce qui reste stable dans la direction du plan.",
    "Pour whole_plan, le coeur de la réponse doit être une trajectoire: direction actuelle, direction proposée, étape insérée/réordonnée, prérequis de coaching, et ce qui reste stable. Les changed_items ne sont que des ancres matérielles internes pour exécuter/régénérer le plan; ne présente jamais le changement global comme seulement deux actions modifiées.",
    "Pour whole_plan, adjust_plan_result.applied_change.trajectory_change est obligatoire et doit contenir before, after, inserted_step ou reordered_steps, preserved_direction et coaching_reason.",
    "Si tu n'as pas assez d'information pour dire précisément ce qui changerait, ne fais pas semblant: le brouillon doit indiquer les informations manquantes.",
    "execution_message doit être le message post-exécution: naturel, humain, précis, et expliquer ce qui a changé, ce qui ne change pas, pourquoi cette modification aide, et le niveau de confiance sans vocabulaire technique.",
    "Pour un ajustement de niveau ou de plan global, execution_message doit citer deux exemples concrets de ce qui a changé, en langage simple.",
    "Pour un ajustement de niveau ou de plan global, adjust_plan_result.applied_change.changed_items doit contenir au moins deux exemples concrets et distincts.",
    "Pour un ajustement de niveau ou de plan global, respecte strictement level_adjustment_contract: chaque changement concret doit choisir une capability autorisée et cibler une action/habitude existante par id depuis materialization_candidates.",
    "Pour un ajustement de niveau ou de plan global, n'utilise jamais level_setting/plan_setting comme faux exemple si aucune action réelle n'est modifiée. Si les actions exactes manquent, le JSON sera rejeté.",
    "Aucune phrase de réponse n'est fournie: rédige le message toi-même à partir des faits.",
    "N'utilise pas les noms d'enums, les clés JSON, les mots id, uuid, plan_item_id, operation_id, patch, scope, confidence, payload, current_level, whole_plan, action_request_category, level_request_category, changed_items, preserved_items, lighter, global_load, reason_change ou change_target dans les messages destinés à l'utilisateur.",
    "Pour un ajustement de niveau, indique clairement que le changement reste limité au niveau actuel et ne modifie pas le plan global.",
    "Pour un ajustement de niveau, ne parle pas de version mini, de pont, ni de repousser une version complète, sauf si le user demande explicitement une action-pont. Le niveau se modifie en ajustant des actions/habitudes existantes, leur fréquence, leur durée, leur timing ou leur ordre.",
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
          trajectory_change: input.scope_kind === "whole_plan"
            ? {
              before:
                "string describing the current trajectory in user language",
              after:
                "string describing the proposed trajectory in user language",
              inserted_step:
                "string|null for the new global step to insert before/after another step",
              reordered_steps: [
                "string names of phases/steps to reorder, user-facing",
              ],
              preserved_direction:
                "string describing what remains stable in the plan direction",
              coaching_reason:
                "string explaining why this trajectory makes coaching sense",
            }
            : null,
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
            : input.scope_kind === "whole_plan"
            ? "minimum two concrete materialization anchors for execution; they support the trajectory but must not be presented as the whole change"
            : "minimum two concrete changed items, each usable as an example in execution_message",
          preserved_items: [{
            kind: "action|habit|level|plan|clarification",
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
    facts: {
      scope_label: input.scope_label,
      scope_kind: input.scope_kind,
      adjustment_type: input.adjustment_type,
      execution_strategy: input.execution_strategy,
      proposed_change: input.proposed_change,
      bridge_action: input.bridge_action ?? null,
      decision_basis: input.decision_basis,
      change_rationale: input.change_rationale,
      boundaries_policy: input.boundaries_policy,
      coaching_guidance: input.coaching_guidance ?? null,
      user_constraints: writerUserConstraints,
    },
    user_constraints: writerUserConstraints,
    exact_text_constraints: exactTextConstraints(writerUserConstraints),
    level_adjustment_contract: input.level_adjustment_contract ?? null,
    coaching_guidance: input.coaching_guidance ?? null,
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
      retry_instruction: attempt === 0 ? null : [
        "Corrige uniquement la sortie JSON. Elle doit être du JSON strict valide, sans markdown ni texte hors JSON.",
        "Si l'erreur concerne une fuite technique, retire tous les IDs/UUID/champs internes des messages destinés au user et garde-les uniquement dans changed_items.id/preserved_items.id.",
        "Si l'erreur concerne whole_plan, ajoute une vraie trajectory_change et rédige les messages autour de la trajectoire globale, pas autour de deux actions.",
        "Respecte strictement user_constraints, les types réels des items, les clarifications read-only, et ne change pas la fréquence d'une habitude si le user ne l'a pas demandé explicitement.",
      ].join(" "),
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
        model: getGeminiFallbackModel("gemini-2.5-flash"),
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
  const scopedCandidate = input.scope.plan_item_id
    ? (input.materialization_candidates ?? []).find((candidate) =>
      candidate.id === input.scope.plan_item_id
    ) ?? null
    : null;
  if (isActionScope && isClarificationCandidate(scopedCandidate)) {
    throw new Error("adjust_plan_scope_clarification_read_only");
  }
  const confidence = input.decision_basis?.confidence ??
    (isActionScope ? "high" : "medium");
  const reasonChange = input.reason_change?.type ?? input.reason.type;
  const changeTarget = input.change_target?.value ??
    (isActionScope
      ? "entry_cost"
      : isLevelScope
      ? "level_load"
      : "global_load");
  const patch = isActionScope ? buildActionPatch(input) : isLevelScope
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
  const actionDurationMinutes = typeof patch.duration_minutes === "number"
    ? patch.duration_minutes
    : exactDurationMinutes(input.constraints) ?? 5;
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
  const writerMaterializationCandidates = materializationCandidatesForWriter(
    input,
    scopeForResult,
  );
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
    materialization_candidates: writerMaterializationCandidates,
    coaching_guidance: (input.coaching_guidance ?? null) as
      | AdjustPlanCoachGuidance
      | null,
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
