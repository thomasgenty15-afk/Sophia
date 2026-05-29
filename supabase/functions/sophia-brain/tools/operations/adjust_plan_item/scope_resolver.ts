import type {
  AdjustPlanDecisionDraft,
  AdjustPlanResolvedScope,
  AdjustPlanRouterPlanItemSnapshot,
} from "./contract.ts";

function normalizeTitle(value: unknown): string {
  const decomposed = String(value ?? "").normalize("NFD").toLowerCase();
  const chars: string[] = [];
  let previousWasSpace = true;
  for (const char of decomposed) {
    const code = char.codePointAt(0) ?? 0;
    const isCombiningMark = code >= 0x0300 && code <= 0x036f;
    const isAlphaNum = (code >= 97 && code <= 122) ||
      (code >= 48 && code <= 57);
    if (isCombiningMark) continue;
    if (isAlphaNum) {
      chars.push(char);
      previousWasSpace = false;
      continue;
    }
    if (!previousWasSpace) {
      chars.push(" ");
      previousWasSpace = true;
    }
  }
  return chars.join("").trim();
}

function byId(
  items: AdjustPlanRouterPlanItemSnapshot[],
): Map<string, AdjustPlanRouterPlanItemSnapshot> {
  return new Map(items.map((item) => [String(item.id).trim(), item]));
}

function isCompleted(item: AdjustPlanRouterPlanItemSnapshot): boolean {
  return ["done", "completed", "archived"].includes(
    String(item.status ?? "").trim().toLowerCase(),
  );
}

function isSupport(item: AdjustPlanRouterPlanItemSnapshot): boolean {
  const nature = String(item.item_nature ?? item.item_type ?? "").trim()
    .toLowerCase();
  const dimension = String(item.dimension ?? "").trim().toLowerCase();
  return nature === "support" || nature === "guardrail" ||
    dimension === "support";
}

export function resolveAdjustPlanScope(args: {
  decision: AdjustPlanDecisionDraft;
  plan_snapshot?: { items?: AdjustPlanRouterPlanItemSnapshot[] } | null;
}): AdjustPlanResolvedScope {
  const items = args.plan_snapshot?.items ?? [];
  const requested = args.decision.scope;
  const missing = [...requested.missing_slots];
  const blockedItemReasons: string[] = [];

  if (requested.kind === "unknown") {
    return {
      kind: "unknown",
      plan_item_ids: [],
      target_hint: requested.target_hint,
      confidence: "low",
      missing_slots: [...new Set([...missing, "scope"])],
      blocked_reason: "scope_unknown",
      resolved_items: [],
      blocked_item_reasons: [],
    };
  }

  if (
    requested.kind === "current_level" || requested.kind === "whole_plan" ||
    requested.kind === "current_week"
  ) {
    const resolvedItems = requested.kind === "current_week"
      ? items.filter((item) =>
        item.available_this_week === true ||
        item.availability_status === "available"
      )
      : [];
    return {
      kind: requested.kind,
      plan_item_ids: resolvedItems.map((item) => item.id),
      target_hint: requested.target_hint,
      confidence: requested.confidence === "low"
        ? "medium"
        : requested.confidence,
      missing_slots: missing,
      blocked_reason: null,
      resolved_items: resolvedItems,
      blocked_item_reasons: [],
    };
  }

  const itemById = byId(items);
  let resolvedItems = requested.plan_item_ids
    .map((id) => itemById.get(String(id).trim()))
    .filter((item): item is AdjustPlanRouterPlanItemSnapshot => Boolean(item));

  if (requested.plan_item_ids.length > 0 && resolvedItems.length === 0) {
    return {
      kind: requested.kind,
      plan_item_ids: [],
      target_hint: requested.target_hint,
      confidence: "low",
      missing_slots: [...new Set([...missing, "scope"])],
      blocked_reason: "scope_ids_not_found",
      resolved_items: [],
      blocked_item_reasons: [],
    };
  }

  if (resolvedItems.length === 0 && requested.target_hint) {
    const normalizedHint = normalizeTitle(requested.target_hint);
    const titleMatches = items.filter((item) =>
      normalizeTitle(item.title) === normalizedHint
    );
    if (titleMatches.length === 1) {
      resolvedItems = titleMatches;
    } else if (titleMatches.length > 1) {
      return {
        kind: requested.kind,
        plan_item_ids: [],
        target_hint: requested.target_hint,
        confidence: "low",
        missing_slots: [...new Set([...missing, "scope"])],
        blocked_reason: "scope_title_ambiguous",
        resolved_items: [],
        blocked_item_reasons: [],
      };
    }
  }

  if (resolvedItems.length === 0) {
    return {
      kind: requested.kind,
      plan_item_ids: [],
      target_hint: requested.target_hint,
      confidence: "low",
      missing_slots: [...new Set([...missing, "scope"])],
      blocked_reason: "scope_unresolved",
      resolved_items: [],
      blocked_item_reasons: [],
    };
  }

  for (const item of resolvedItems) {
    if (isCompleted(item)) blockedItemReasons.push(`completed:${item.id}`);
    if (isSupport(item)) blockedItemReasons.push(`support:${item.id}`);
  }

  return {
    kind: requested.kind,
    plan_item_ids: resolvedItems.map((item) => item.id),
    target_hint: requested.target_hint,
    confidence: requested.confidence,
    missing_slots: missing,
    blocked_reason: null,
    resolved_items: resolvedItems,
    blocked_item_reasons: blockedItemReasons,
  };
}
