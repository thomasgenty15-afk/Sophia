/**
 * Candidate Builder
 *
 * Pure function that turns a raw plan_snapshot into a structured
 * AllowedAdjustmentSet given the current scope and explicit user signals.
 *
 * Key invariant: the AI never decides what is editable. The AI only picks
 * inside the editable set produced here. If the AI proposes something that
 * is not in the editable set, the draft compiler rejects with a stable
 * reason_code.
 *
 * The builder is intentionally a pure function with no IO. It is safe to
 * call multiple times per turn (e.g. once for the slot filler input and
 * once for the post-LLM compiler) and to test in isolation.
 */

import {
  adjustmentTypePermissionsFor,
  type AdjustmentTypePermissionEntry,
  type AdjustSignals,
  type CandidateItemShape,
  EMPTY_SIGNALS,
  type ItemPermission,
  type ItemPermissionReason,
  permissionForCurrentLevel,
  permissionForSpecificPlanItem,
  permissionForWholePlan,
  type ScopeKind,
} from "./allowed_adjustment_matrix.ts";

/**
 * Generator-facing materialization candidate shape. The plan adjustment
 * generator (the IA writer) needs richer fields than the slot filler does
 * to make concrete patches. Both shapes start from the same
 * `flattenItem` projection so we never have two flatten implementations
 * drifting apart.
 */
export type GeneratorMaterializationCandidate = {
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
};

export type AllowedAdjustmentItem = {
  plan_item_id: string;
  title: string;
  permission: ItemPermission;
  permission_reasons: ItemPermissionReason[];
  item_nature: string | null;
  dimension: string | null;
  status: string | null;
  available_this_week: boolean | null;
  availability_status: string | null;
};

export type ExcludedAdjustmentItem = {
  plan_item_id: string;
  title: string;
  permission_reasons: ItemPermissionReason[];
};

export type AllowedAdjustmentSet = {
  scope_kind: ScopeKind;
  scope_plan_item_id: string | null;
  editable_items: AllowedAdjustmentItem[];
  conditional_items: AllowedAdjustmentItem[];
  excluded_items: ExcludedAdjustmentItem[];
  allowed_adjustment_types: AdjustmentTypePermissionEntry[];
  conditional_adjustment_types: AdjustmentTypePermissionEntry[];
  forbidden_adjustment_types: AdjustmentTypePermissionEntry[];
  signals: AdjustSignals;
};

function rawPlanItems(planSnapshot: unknown): unknown[] {
  const items = (planSnapshot as any)?.items;
  return Array.isArray(items) ? items : [];
}

function readString(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function readBoolean(value: unknown): boolean | null {
  if (value === true) return true;
  if (value === false) return false;
  return null;
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value
      .map((entry) => String(entry ?? "").trim())
      .filter(Boolean)
    : [];
}

function flattenRawItem(raw: unknown): {
  source: Record<string, unknown>;
  payload: Record<string, unknown>;
  id: string;
  title: string;
} | null {
  const item = (raw && typeof raw === "object")
    ? raw as Record<string, unknown>
    : null;
  if (!item) return null;
  const payload = (item.payload && typeof item.payload === "object")
    ? item.payload as Record<string, unknown>
    : {};
  const id = readString(item.id ?? payload.id);
  const title = readString(item.title ?? payload.title);
  if (!id || !title) return null;
  return { source: item, payload, id, title };
}

function flattenItem(raw: unknown): CandidateItemShape | null {
  const flat = flattenRawItem(raw);
  if (!flat) return null;
  const { source: item, payload, id, title } = flat;
  return {
    plan_item_id: id,
    title,
    description: readString(item.description ?? payload.description),
    status: readString(item.status ?? payload.status),
    dimension: readString(item.dimension ?? payload.dimension),
    kind: readString(item.kind ?? payload.kind),
    item_type: readString(item.item_type ?? payload.item_type),
    item_nature: readString(item.item_nature ?? payload.item_nature),
    source_kind: readString(item.source_kind ?? payload.source_kind),
    available_this_week: readBoolean(
      item.available_this_week ?? payload.available_this_week,
    ),
    availability_status: readString(
      item.availability_status ?? payload.availability_status,
    ),
    clarification_type: readString(
      item.clarification_type ?? payload.clarification_type,
    ),
  };
}

/**
 * Adapter for the plan adjustment generator. The generator needs more
 * fields than the slot filler does (cadence_label, target_reps, etc).
 * It still starts from the same flatten step so the slot filler input
 * and the generator input are always derived from the same source of
 * truth.
 */
export function projectPlanItemsForGenerator(
  planSnapshot: unknown,
): GeneratorMaterializationCandidate[] {
  return rawPlanItems(planSnapshot).flatMap((raw): GeneratorMaterializationCandidate[] => {
    const flat = flattenRawItem(raw);
    if (!flat) return [];
    const { source: item, payload, id, title } = flat;
    return [{
      id,
      title,
      description: readString(item.description ?? payload.description),
      status: readString(item.status ?? payload.status),
      dimension: readString(item.dimension ?? payload.dimension),
      kind: readString(item.kind ?? payload.kind),
      item_type: readString(item.item_type ?? payload.item_type),
      item_nature: readString(item.item_nature ?? payload.item_nature),
      tracking_type: readString(item.tracking_type ?? payload.tracking_type),
      cadence_label: readString(item.cadence_label ?? payload.cadence_label),
      target_reps: readNumber(item.target_reps ?? payload.target_reps),
      current_reps: readNumber(item.current_reps ?? payload.current_reps),
      weekly_reps: readNumber(item.weekly_reps ?? payload.weekly_reps),
      weekly_cadence_label: readString(
        item.weekly_cadence_label ?? payload.weekly_cadence_label,
      ),
      availability_status: readString(
        item.availability_status ?? payload.availability_status,
      ),
      available_this_week: readBoolean(
        item.available_this_week ?? payload.available_this_week,
      ),
      source_kind: readString(item.source_kind ?? payload.source_kind),
      clarification_type: readString(
        item.clarification_type ?? payload.clarification_type,
      ),
      clarification_section_labels: readStringList(
        item.clarification_section_labels ?? payload.clarification_section_labels,
      ),
    }];
  });
}

function planCandidates(planSnapshot: unknown): CandidateItemShape[] {
  return rawPlanItems(planSnapshot)
    .map(flattenItem)
    .filter((item): item is CandidateItemShape => item !== null);
}

function toAllowedItem(
  item: CandidateItemShape,
  permission: { permission: ItemPermission; reasons: ItemPermissionReason[] },
): AllowedAdjustmentItem {
  return {
    plan_item_id: item.plan_item_id,
    title: item.title,
    permission: permission.permission,
    permission_reasons: permission.reasons,
    item_nature: item.item_nature ?? null,
    dimension: item.dimension ?? null,
    status: item.status ?? null,
    available_this_week: item.available_this_week ?? null,
    availability_status: item.availability_status ?? null,
  };
}

function toExcludedItem(
  item: CandidateItemShape,
  reasons: ItemPermissionReason[],
): ExcludedAdjustmentItem {
  return {
    plan_item_id: item.plan_item_id,
    title: item.title,
    permission_reasons: reasons,
  };
}

function partitionAdjustmentTypes(
  scopeKind: ScopeKind,
  signals: AdjustSignals,
): {
  allowed: AdjustmentTypePermissionEntry[];
  conditional: AdjustmentTypePermissionEntry[];
  forbidden: AdjustmentTypePermissionEntry[];
} {
  const all = adjustmentTypePermissionsFor(scopeKind);
  const allowed: AdjustmentTypePermissionEntry[] = [];
  const conditional: AdjustmentTypePermissionEntry[] = [];
  const forbidden: AdjustmentTypePermissionEntry[] = [];
  for (const rule of all) {
    if (rule.permission === "allowed") {
      allowed.push(rule);
      continue;
    }
    if (rule.permission === "forbidden") {
      forbidden.push(rule);
      continue;
    }
    if (rule.permission === "requires_explicit_request") {
      const signal = rule.signal_required;
      if (signal && signals[signal]) {
        allowed.push({ ...rule, permission: "allowed" });
      } else {
        conditional.push(rule);
      }
    }
  }
  return { allowed, conditional, forbidden };
}

export type CandidateBuilderInput = {
  plan_snapshot: unknown;
  scope_kind: ScopeKind;
  scope_plan_item_id?: string | null;
  signals?: Partial<AdjustSignals>;
};

export function buildAllowedAdjustmentSet(
  input: CandidateBuilderInput,
): AllowedAdjustmentSet {
  const signals: AdjustSignals = {
    ...EMPTY_SIGNALS,
    ...(input.signals ?? {}),
    user_explicitly_named_titles: Array.isArray(
        input.signals?.user_explicitly_named_titles,
      )
      ? input.signals!.user_explicitly_named_titles!.filter((title) =>
        typeof title === "string" && title.trim().length > 0
      )
      : EMPTY_SIGNALS.user_explicitly_named_titles,
  };
  const candidates = planCandidates(input.plan_snapshot);
  const editable: AllowedAdjustmentItem[] = [];
  const conditional: AllowedAdjustmentItem[] = [];
  const excluded: ExcludedAdjustmentItem[] = [];

  for (const candidate of candidates) {
    const decision = input.scope_kind === "current_level"
      ? permissionForCurrentLevel(candidate, signals)
      : input.scope_kind === "whole_plan"
      ? permissionForWholePlan(candidate, signals)
      : permissionForSpecificPlanItem(
        candidate,
        input.scope_plan_item_id ?? null,
      );
    if (decision.permission === "editable") {
      editable.push(toAllowedItem(candidate, decision));
    } else if (decision.permission === "requires_explicit_request") {
      conditional.push(toAllowedItem(candidate, decision));
    } else {
      excluded.push(toExcludedItem(candidate, decision.reasons));
    }
  }

  const adjustmentTypes = partitionAdjustmentTypes(input.scope_kind, signals);

  return {
    scope_kind: input.scope_kind,
    scope_plan_item_id: input.scope_plan_item_id ?? null,
    editable_items: editable,
    conditional_items: conditional,
    excluded_items: excluded,
    allowed_adjustment_types: adjustmentTypes.allowed,
    conditional_adjustment_types: adjustmentTypes.conditional,
    forbidden_adjustment_types: adjustmentTypes.forbidden,
    signals,
  };
}

/**
 * Project the AllowedAdjustmentSet into a compact shape that is safe to
 * pass to the slot filler AI prompt. The AI only sees titles + ids + the
 * permission tag, never the raw plan internals.
 */
export function projectAllowedSetForAi(set: AllowedAdjustmentSet): {
  scope_kind: ScopeKind;
  scope_plan_item_id: string | null;
  editable_items: Array<
    { plan_item_id: string; title: string; item_nature: string | null }
  >;
  conditional_items: Array<{
    plan_item_id: string;
    title: string;
    requires: string;
  }>;
  excluded_items: Array<{ plan_item_id: string; title: string; why: string }>;
  allowed_adjustment_types: string[];
  conditional_adjustment_types: Array<{ value: string; requires: string }>;
  forbidden_adjustment_types: string[];
} {
  return {
    scope_kind: set.scope_kind,
    scope_plan_item_id: set.scope_plan_item_id,
    editable_items: set.editable_items.map((item) => ({
      plan_item_id: item.plan_item_id,
      title: item.title,
      item_nature: item.item_nature,
    })),
    conditional_items: set.conditional_items.map((item) => ({
      plan_item_id: item.plan_item_id,
      title: item.title,
      requires: item.permission_reasons.join("|"),
    })),
    excluded_items: set.excluded_items.map((item) => ({
      plan_item_id: item.plan_item_id,
      title: item.title,
      why: item.permission_reasons.join("|"),
    })),
    allowed_adjustment_types: set.allowed_adjustment_types.map((rule) =>
      rule.value
    ),
    conditional_adjustment_types: set.conditional_adjustment_types.map((
      rule,
    ) => ({
      value: rule.value,
      requires: rule.signal_required ?? "explicit_request",
    })),
    forbidden_adjustment_types: set.forbidden_adjustment_types.map((rule) =>
      rule.value
    ),
  };
}
