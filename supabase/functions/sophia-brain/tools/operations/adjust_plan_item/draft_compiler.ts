/**
 * Draft Compiler
 *
 * Validates the AI's structured intent (post slot-filler) against the
 * AllowedAdjustmentSet produced by the candidate builder.
 *
 * The compiler is structural. It does not interpret the user message.
 * It only checks that what the AI proposed is allowed by the matrix and
 * the explicit signals.
 *
 * On success, it returns a normalized list of `compiled_affected_items`
 * resolved to plan_item_id + title. On failure, it returns an
 * observable rejection with reason_code so the runtime can return to a
 * clarification step instead of executing a draft based on a forbidden
 * intent.
 */

import {
  type AdjustmentTypePermissionEntry,
  lookupAdjustmentTypePermission,
  type ScopeKind,
} from "./allowed_adjustment_matrix.ts";
import type {
  AllowedAdjustmentItem,
  AllowedAdjustmentSet,
} from "./candidate_builder.ts";

export type CompiledAffectedItem = {
  plan_item_id: string;
  title: string;
  permission: AllowedAdjustmentItem["permission"];
};

export type RejectedAffectedItem = {
  requested_label: string;
  reason_code:
    | "label_unmatched"
    | "item_excluded"
    | "item_requires_explicit_request";
  excluded_reasons?: string[];
};

export type RejectedAdjustmentType = {
  requested_value: string;
  reason_code: "type_forbidden" | "type_requires_explicit_request";
  signal_required?: string;
};

export type CompilerOk = {
  ok: true;
  scope_kind: ScopeKind;
  compiled_affected_items: CompiledAffectedItem[];
  resolved_adjustment_type: AdjustmentTypePermissionEntry | null;
  warnings: string[];
};

export type CompilerError = {
  ok: false;
  scope_kind: ScopeKind;
  reason_code:
    | "items_outside_allowed_set"
    | "no_editable_items_available"
    | "adjustment_type_forbidden"
    | "adjustment_type_requires_explicit_request";
  rejected_items: RejectedAffectedItem[];
  rejected_adjustment_type: RejectedAdjustmentType | null;
  compiled_affected_items: CompiledAffectedItem[];
};

export type CompilerResult = CompilerOk | CompilerError;

export type CompilerInput = {
  allowed_set: AllowedAdjustmentSet;
  proposed_affected_item_labels: string[];
  proposed_adjustment_type?: string | null;
  // For specific_plan_item scope, we usually do not require affected_items
  // because the scope itself targets one item.
  require_affected_items: boolean;
};

function normalizeForMatch(value: string): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function looseEquals(a: string, b: string): boolean {
  const left = normalizeForMatch(a);
  const right = normalizeForMatch(b);
  return Boolean(left && right && (left === right || left.includes(right) || right.includes(left)));
}

function findAllowedItemByLabel(
  set: AllowedAdjustmentSet,
  label: string,
): { item: AllowedAdjustmentItem; bucket: "editable" | "conditional" } | null {
  const editable = set.editable_items.find((item) =>
    looseEquals(item.title, label) ||
    item.plan_item_id === label.trim()
  );
  if (editable) return { item: editable, bucket: "editable" };
  const conditional = set.conditional_items.find((item) =>
    looseEquals(item.title, label) ||
    item.plan_item_id === label.trim()
  );
  if (conditional) return { item: conditional, bucket: "conditional" };
  return null;
}

function findExcludedReasons(
  set: AllowedAdjustmentSet,
  label: string,
): string[] | null {
  const excluded = set.excluded_items.find((item) =>
    looseEquals(item.title, label) ||
    item.plan_item_id === label.trim()
  );
  if (!excluded) return null;
  return excluded.permission_reasons;
}

export function compileAdjustPlanIntent(
  input: CompilerInput,
): CompilerResult {
  const { allowed_set: allowed } = input;
  const compiled: CompiledAffectedItem[] = [];
  const rejected: RejectedAffectedItem[] = [];

  const proposedLabels = (input.proposed_affected_item_labels ?? [])
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);

  for (const label of proposedLabels) {
    const match = findAllowedItemByLabel(allowed, label);
    if (match && match.bucket === "editable") {
      compiled.push({
        plan_item_id: match.item.plan_item_id,
        title: match.item.title,
        permission: match.item.permission,
      });
      continue;
    }
    if (match && match.bucket === "conditional") {
      rejected.push({
        requested_label: label,
        reason_code: "item_requires_explicit_request",
        excluded_reasons: match.item.permission_reasons,
      });
      continue;
    }
    const excludedReasons = findExcludedReasons(allowed, label);
    if (excludedReasons) {
      rejected.push({
        requested_label: label,
        reason_code: "item_excluded",
        excluded_reasons: excludedReasons,
      });
      continue;
    }
    rejected.push({
      requested_label: label,
      reason_code: "label_unmatched",
    });
  }

  const proposedType = String(input.proposed_adjustment_type ?? "").trim();
  let rejectedType: RejectedAdjustmentType | null = null;
  let resolvedType: AdjustmentTypePermissionEntry | null = null;
  if (proposedType) {
    const inAllowed = allowed.allowed_adjustment_types.find((rule) =>
      rule.value === proposedType
    );
    const inConditional = allowed.conditional_adjustment_types.find((rule) =>
      rule.value === proposedType
    );
    const inForbidden = allowed.forbidden_adjustment_types.find((rule) =>
      rule.value === proposedType
    );
    if (inAllowed) {
      resolvedType = inAllowed;
    } else if (inConditional) {
      rejectedType = {
        requested_value: proposedType,
        reason_code: "type_requires_explicit_request",
        signal_required: inConditional.signal_required ?? "explicit_request",
      };
    } else if (inForbidden) {
      rejectedType = {
        requested_value: proposedType,
        reason_code: "type_forbidden",
      };
    } else {
      // Type not in matrix at all for this scope. Look up the static rule
      // table to give a precise reason.
      const generic = lookupAdjustmentTypePermission(
        allowed.scope_kind,
        proposedType,
      );
      if (!generic) {
        rejectedType = {
          requested_value: proposedType,
          reason_code: "type_forbidden",
        };
      } else if (generic.permission === "requires_explicit_request") {
        rejectedType = {
          requested_value: proposedType,
          reason_code: "type_requires_explicit_request",
          signal_required: generic.signal_required ?? "explicit_request",
        };
      } else if (generic.permission === "forbidden") {
        rejectedType = {
          requested_value: proposedType,
          reason_code: "type_forbidden",
        };
      } else {
        resolvedType = generic;
      }
    }
  }

  if (rejectedType) {
    return {
      ok: false,
      scope_kind: allowed.scope_kind,
      reason_code: rejectedType.reason_code === "type_forbidden"
        ? "adjustment_type_forbidden"
        : "adjustment_type_requires_explicit_request",
      rejected_items: rejected,
      rejected_adjustment_type: rejectedType,
      compiled_affected_items: compiled,
    };
  }

  if (rejected.length > 0) {
    return {
      ok: false,
      scope_kind: allowed.scope_kind,
      reason_code: "items_outside_allowed_set",
      rejected_items: rejected,
      rejected_adjustment_type: null,
      compiled_affected_items: compiled,
    };
  }

  if (
    input.require_affected_items &&
    compiled.length === 0 &&
    allowed.editable_items.length === 0
  ) {
    return {
      ok: false,
      scope_kind: allowed.scope_kind,
      reason_code: "no_editable_items_available",
      rejected_items: [],
      rejected_adjustment_type: null,
      compiled_affected_items: [],
    };
  }

  return {
    ok: true,
    scope_kind: allowed.scope_kind,
    compiled_affected_items: compiled,
    resolved_adjustment_type: resolvedType,
    warnings: [],
  };
}
