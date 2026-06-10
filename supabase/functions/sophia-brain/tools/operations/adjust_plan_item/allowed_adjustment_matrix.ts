/**
 * Allowed Adjustment Matrix
 *
 * Single source of truth for the structured permission rules that govern
 * what the AI is allowed to propose for an adjust_plan operation.
 *
 * The matrix expresses business invariants as DATA, not as prompt rules.
 * The slot filler prompt should not need to encode these rules anymore;
 * instead the candidate builder removes forbidden items from the AI's view
 * and the draft compiler rejects any AI intent that lands outside the
 * allowed set.
 *
 * Rules captured here:
 *
 * - Clarifications are never editable as plan items.
 * - operation_bridge items are not editable by default (they are drafts/
 *   bridges produced by previous adjustments).
 * - Items with status pending / locked / completed are not editable by
 *   default at the current_level scope. They become editable only when the
 *   user explicitly named the item in the request.
 * - Items with available_this_week=false or availability_status outside
 *   {available_this_week, assigned_no_calendar} are not editable for the
 *   current_level scope by default. Same explicit-targeting override.
 * - For the whole_plan scope we keep all non-clarification items eligible
 *   so the writer can resequence / reduce load globally.
 * - For the specific_plan_item scope the candidate set is the single
 *   targeted item; eligibility checks happen at scope-resolution time.
 * - Adjustment types that are destructive or change the plan shape (pause,
 *   pause_level, restart_plan) require an explicit user signal before they
 *   can be selected. The matrix marks them as "requires_explicit_request".
 */

export type ScopeKind = "specific_plan_item" | "current_level" | "whole_plan";

export type ItemPermission =
  | "editable"
  | "read_only"
  | "requires_explicit_request";

export type ItemPermissionReason =
  | "default_editable"
  | "explicit_user_target"
  | "clarification_not_editable"
  | "operation_bridge_excluded"
  | "status_pending_excluded"
  | "status_locked_excluded"
  | "status_completed_excluded"
  | "not_available_this_week"
  | "availability_status_excluded"
  | "outside_current_level_scope"
  | "global_scope_includes_all_non_clarification";

export type AdjustmentTypePermission =
  | "allowed"
  | "requires_explicit_request"
  | "forbidden";

export type AdjustmentTypePermissionEntry = {
  scope_kind: ScopeKind;
  value: string;
  permission: AdjustmentTypePermission;
  signal_required?: ExplicitSignal;
};

export type ExplicitSignal =
  | "user_explicit_pause_request"
  | "user_explicit_restart_request"
  | "user_explicit_replace_request"
  | "user_explicit_frequency_change";

export type CandidateItemShape = {
  plan_item_id: string;
  title: string;
  description?: string | null;
  status?: string | null;
  dimension?: string | null;
  kind?: string | null;
  item_type?: string | null;
  item_nature?: string | null;
  source_kind?: string | null;
  available_this_week?: boolean | null;
  availability_status?: string | null;
  clarification_type?: string | null;
};

export type AdjustSignals = {
  user_explicitly_named_titles: string[];
  user_explicit_pause_request: boolean;
  user_explicit_restart_request: boolean;
  user_explicit_replace_request: boolean;
  user_explicit_frequency_change: boolean;
};

export const EMPTY_SIGNALS: AdjustSignals = {
  user_explicitly_named_titles: [],
  user_explicit_pause_request: false,
  user_explicit_restart_request: false,
  user_explicit_replace_request: false,
  user_explicit_frequency_change: false,
};

const ADJUSTMENT_TYPE_RULES: AdjustmentTypePermissionEntry[] = [
  // specific_plan_item
  { scope_kind: "specific_plan_item", value: "reduce", permission: "allowed" },
  { scope_kind: "specific_plan_item", value: "clarify", permission: "allowed" },
  {
    scope_kind: "specific_plan_item",
    value: "simplify",
    permission: "allowed",
  },
  {
    scope_kind: "specific_plan_item",
    value: "rebalance",
    permission: "allowed",
  },
  {
    scope_kind: "specific_plan_item",
    value: "replace",
    permission: "requires_explicit_request",
    signal_required: "user_explicit_replace_request",
  },
  {
    scope_kind: "specific_plan_item",
    value: "pause",
    permission: "requires_explicit_request",
    signal_required: "user_explicit_pause_request",
  },
  // current_level
  {
    scope_kind: "current_level",
    value: "reduce_load",
    permission: "allowed",
  },
  {
    scope_kind: "current_level",
    value: "change_focus",
    permission: "allowed",
  },
  {
    scope_kind: "current_level",
    value: "rebalance",
    permission: "allowed",
  },
  {
    scope_kind: "current_level",
    value: "pause_level",
    permission: "requires_explicit_request",
    signal_required: "user_explicit_pause_request",
  },
  // whole_plan
  {
    scope_kind: "whole_plan",
    value: "reduce_global_load",
    permission: "allowed",
  },
  {
    scope_kind: "whole_plan",
    value: "resequence",
    permission: "allowed",
  },
  {
    scope_kind: "whole_plan",
    value: "change_goal",
    permission: "requires_explicit_request",
    signal_required: "user_explicit_replace_request",
  },
  {
    scope_kind: "whole_plan",
    value: "restart_plan",
    permission: "requires_explicit_request",
    signal_required: "user_explicit_restart_request",
  },
];

export function lookupAdjustmentTypePermission(
  scopeKind: ScopeKind,
  value: string | null | undefined,
): AdjustmentTypePermissionEntry | null {
  if (!value) return null;
  return ADJUSTMENT_TYPE_RULES.find((rule) =>
    rule.scope_kind === scopeKind && rule.value === value
  ) ?? null;
}

export function adjustmentTypePermissionsFor(
  scopeKind: ScopeKind,
): AdjustmentTypePermissionEntry[] {
  return ADJUSTMENT_TYPE_RULES.filter((rule) => rule.scope_kind === scopeKind);
}

function isClarificationItem(item: CandidateItemShape): boolean {
  const dimension = String(item.dimension ?? "").trim();
  const itemNature = String(item.item_nature ?? "").trim();
  const itemType = String(item.item_type ?? "").trim();
  const kind = String(item.kind ?? "").trim();
  return (
    dimension === "clarifications" ||
    itemNature === "clarification" ||
    itemType === "clarification" ||
    kind === "clarification" ||
    Boolean(item.clarification_type)
  );
}

function isOperationBridgeItem(item: CandidateItemShape): boolean {
  return String(item.source_kind ?? "").trim() === "operation_bridge";
}

function normalizeTitle(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export function userExplicitlyNamedItem(
  item: CandidateItemShape,
  signals: AdjustSignals,
): boolean {
  const title = normalizeTitle(item.title);
  if (!title) return false;
  return signals.user_explicitly_named_titles.some((named) => {
    const namedNorm = normalizeTitle(named);
    if (!namedNorm) return false;
    return title.includes(namedNorm) || namedNorm.includes(title);
  });
}

/**
 * Single-item permission decision for the current_level scope.
 *
 * Returns the permission and the reason chain.
 */
export function permissionForCurrentLevel(
  item: CandidateItemShape,
  signals: AdjustSignals,
): { permission: ItemPermission; reasons: ItemPermissionReason[] } {
  const reasons: ItemPermissionReason[] = [];
  if (isClarificationItem(item)) {
    return {
      permission: "read_only",
      reasons: ["clarification_not_editable"],
    };
  }
  if (isOperationBridgeItem(item)) {
    return {
      permission: "read_only",
      reasons: ["operation_bridge_excluded"],
    };
  }
  const explicit = userExplicitlyNamedItem(item, signals);
  const status = String(item.status ?? "").trim();
  if (status === "completed") {
    return {
      permission: "read_only",
      reasons: ["status_completed_excluded"],
    };
  }
  if (status === "locked") {
    return {
      permission: "read_only",
      reasons: ["status_locked_excluded"],
    };
  }
  if (status === "pending") {
    if (explicit) {
      reasons.push("explicit_user_target", "status_pending_excluded");
      return { permission: "requires_explicit_request", reasons };
    }
    return {
      permission: "read_only",
      reasons: ["status_pending_excluded"],
    };
  }
  if (status === "active") {
    reasons.push("default_editable");
    if (explicit) reasons.unshift("explicit_user_target");
    return { permission: "editable", reasons };
  }
  if (item.available_this_week === false) {
    if (explicit) {
      reasons.push("explicit_user_target", "not_available_this_week");
      return { permission: "requires_explicit_request", reasons };
    }
    return {
      permission: "read_only",
      reasons: ["not_available_this_week"],
    };
  }
  const availability = String(item.availability_status ?? "").trim();
  if (
    availability &&
    availability !== "available_this_week" &&
    availability !== "assigned_no_calendar"
  ) {
    if (explicit) {
      reasons.push("explicit_user_target", "availability_status_excluded");
      return { permission: "requires_explicit_request", reasons };
    }
    return {
      permission: "read_only",
      reasons: ["availability_status_excluded"],
    };
  }
  reasons.push("default_editable");
  if (explicit) reasons.unshift("explicit_user_target");
  return { permission: "editable", reasons };
}

export function permissionForWholePlan(
  item: CandidateItemShape,
  _signals: AdjustSignals,
): { permission: ItemPermission; reasons: ItemPermissionReason[] } {
  if (isClarificationItem(item)) {
    return {
      permission: "read_only",
      reasons: ["clarification_not_editable"],
    };
  }
  return {
    permission: "editable",
    reasons: ["global_scope_includes_all_non_clarification"],
  };
}

export function permissionForSpecificPlanItem(
  item: CandidateItemShape,
  targetPlanItemId: string | null,
): { permission: ItemPermission; reasons: ItemPermissionReason[] } {
  if (!targetPlanItemId) {
    return {
      permission: "read_only",
      reasons: ["outside_current_level_scope"],
    };
  }
  if (item.plan_item_id !== targetPlanItemId) {
    return {
      permission: "read_only",
      reasons: ["outside_current_level_scope"],
    };
  }
  if (isClarificationItem(item)) {
    return {
      permission: "read_only",
      reasons: ["clarification_not_editable"],
    };
  }
  return { permission: "editable", reasons: ["explicit_user_target"] };
}
