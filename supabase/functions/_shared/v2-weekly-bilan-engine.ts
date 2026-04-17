/**
 * V2 Weekly Bilan Engine — validator + materializer.
 *
 * - validateWeeklyBilanOutput: parses raw LLM JSON, enforces invariants,
 *   falls back to safe "hold" on any violation.
 * - materializeWeeklyAdjustments: applies load_adjustments to plan_items in DB.
 */

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2.87.3";

import type { WeeklyBilanOutput, WeeklyDecision } from "./v2-types.ts";
import type {
  WeeklyBilanV2Input,
  WeeklyItemSnapshot,
} from "./v2-prompts/weekly-recalibrage.ts";

// ---------------------------------------------------------------------------
// Validation result
// ---------------------------------------------------------------------------

export type WeeklyBilanValidationResult =
  | { valid: true; output: WeeklyBilanOutput }
  | { valid: false; output: WeeklyBilanOutput; violations: string[] };

// ---------------------------------------------------------------------------
// Safe hold fallback
// ---------------------------------------------------------------------------

const HOLD_FALLBACK: WeeklyBilanOutput = {
  decision: "hold",
  reasoning: "invariant violation — hold by default",
  retained_wins: [],
  retained_blockers: [],
  load_adjustments: [],
  suggested_posture_next_week: "steady",
};

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

const VALID_DECISIONS = new Set<WeeklyDecision>([
  "hold",
  "expand",
  "consolidate",
  "reduce",
]);
const VALID_ADJUSTMENT_TYPES = new Set([
  "activate",
  "deactivate",
  "maintenance",
  "replace",
]);
const VALID_POSTURES = new Set([
  "steady",
  "lighter",
  "support_first",
  "reengage",
]);

function extractUuidFromText(text: string): string | null {
  const match = String(text ?? "").match(
    /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
  );
  return match?.[1] ?? null;
}

export function validateWeeklyBilanOutput(
  raw: unknown,
  input: WeeklyBilanV2Input,
): WeeklyBilanValidationResult {
  const violations: string[] = [];

  if (raw == null || typeof raw !== "object") {
    return {
      valid: false,
      output: HOLD_FALLBACK,
      violations: ["output is not an object"],
    };
  }

  const obj = raw as Record<string, unknown>;

  // --- Parse decision ---
  const decision = String(obj.decision ?? "");
  if (!VALID_DECISIONS.has(decision as WeeklyDecision)) {
    violations.push(`invalid decision: "${decision}"`);
  }

  // --- Parse reasoning ---
  const reasoning = typeof obj.reasoning === "string" ? obj.reasoning : "";
  if (!reasoning) {
    violations.push("missing reasoning");
  }

  // --- Parse retained_wins ---
  const retainedWins = Array.isArray(obj.retained_wins)
    ? obj.retained_wins.filter((w): w is string => typeof w === "string")
    : [];

  // --- Parse retained_blockers ---
  const retainedBlockers = Array.isArray(obj.retained_blockers)
    ? obj.retained_blockers.filter((b): b is string => typeof b === "string")
    : [];

  // --- Parse load_adjustments ---
  const rawAdjustments = Array.isArray(obj.load_adjustments)
    ? obj.load_adjustments
    : [];

  type Adjustment = WeeklyBilanOutput["load_adjustments"][number];
  const adjustments: Adjustment[] = [];
  for (const adj of rawAdjustments) {
    if (adj == null || typeof adj !== "object") continue;
    const a = adj as Record<string, unknown>;
    const type = String(a.type ?? "");
    const targetItemId = String(a.target_item_id ?? "");
    const reason = String(a.reason ?? "");
    if (VALID_ADJUSTMENT_TYPES.has(type) && targetItemId && reason) {
      adjustments.push({
        type: type as Adjustment["type"],
        target_item_id: targetItemId,
        reason,
      });
    }
  }

  // --- Parse coaching_note ---
  const coachingNote = typeof obj.coaching_note === "string"
    ? obj.coaching_note
    : undefined;

  // --- Parse suggested_posture_next_week ---
  const posture = String(obj.suggested_posture_next_week ?? "");
  if (!VALID_POSTURES.has(posture)) {
    violations.push(`invalid suggested_posture_next_week: "${posture}"`);
  }

  // --- Build parsed output ---
  const parsed: WeeklyBilanOutput = {
    decision: VALID_DECISIONS.has(decision as WeeklyDecision)
      ? (decision as WeeklyDecision)
      : "hold",
    reasoning: reasoning || "no reasoning provided",
    retained_wins: retainedWins,
    retained_blockers: retainedBlockers,
    load_adjustments: adjustments,
    coaching_note: coachingNote,
    suggested_posture_next_week: VALID_POSTURES.has(posture)
      ? (posture as WeeklyBilanOutput["suggested_posture_next_week"])
      : "steady",
  };

  // --- Invariant checks ---
  const itemIds = new Set(input.items.map((i) => i.id));

  // Max 3 adjustments
  if (parsed.load_adjustments.length > 3) {
    violations.push(
      `too many adjustments: ${parsed.load_adjustments.length} (max 3)`,
    );
  }

  // Reduce + activate is forbidden
  if (parsed.decision === "reduce") {
    const hasActivationLikeChange = parsed.load_adjustments.some(
      (a) => a.type === "activate" || a.type === "replace",
    );
    if (hasActivationLikeChange) {
      violations.push(
        "reduce decision cannot include activate or replace adjustments",
      );
    }
  }

  // Expand requires at least one strong progress item
  if (parsed.decision === "expand") {
    const hasStrongProgress = input.items.some((i) => i.has_strong_progress);
    if (!hasStrongProgress) {
      violations.push(
        "expand decision requires at least one item with strong progress",
      );
    }
  }

  // All target_item_ids must exist
  for (const adj of parsed.load_adjustments) {
    if (!itemIds.has(adj.target_item_id)) {
      violations.push(`unknown target_item_id: "${adj.target_item_id}"`);
    }
    if (adj.type === "replace") {
      const replacementItemId = extractUuidFromText(adj.reason);
      if (!replacementItemId) {
        violations.push(
          `replace adjustment missing replacement item id in reason for "${adj.target_item_id}"`,
        );
      } else if (!itemIds.has(replacementItemId)) {
        violations.push(`unknown replacement item id: "${replacementItemId}"`);
      } else if (replacementItemId === adj.target_item_id) {
        violations.push(
          `replace adjustment cannot target the same item twice: "${adj.target_item_id}"`,
        );
      }
    }
  }

  // No duplicate target_item_ids
  const seenIds = new Set<string>();
  for (const adj of parsed.load_adjustments) {
    if (seenIds.has(adj.target_item_id)) {
      violations.push(`duplicate target_item_id: "${adj.target_item_id}"`);
    }
    seenIds.add(adj.target_item_id);
  }

  if (violations.length > 0) {
    return { valid: false, output: HOLD_FALLBACK, violations };
  }

  return { valid: true, output: parsed };
}

// ---------------------------------------------------------------------------
// JSON parse helper (for raw LLM text)
// ---------------------------------------------------------------------------

export function parseWeeklyBilanLLMResponse(
  text: string,
  input: WeeklyBilanV2Input,
): WeeklyBilanValidationResult {
  let parsed: unknown;
  try {
    const trimmed = text.trim();
    const jsonStart = trimmed.indexOf("{");
    const jsonEnd = trimmed.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) {
      return {
        valid: false,
        output: HOLD_FALLBACK,
        violations: ["no JSON object found in LLM response"],
      };
    }
    parsed = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1));
  } catch {
    return {
      valid: false,
      output: HOLD_FALLBACK,
      violations: ["failed to parse JSON from LLM response"],
    };
  }

  return validateWeeklyBilanOutput(parsed, input);
}

// ---------------------------------------------------------------------------
// Materializer
// ---------------------------------------------------------------------------

export type MaterializeResult = {
  applied: number;
  skipped: number;
  errors: string[];
};

type AdjustmentType = WeeklyBilanOutput["load_adjustments"][number]["type"];

const TARGET_STATUS_MAP: Record<Exclude<AdjustmentType, "replace">, string> = {
  activate: "active",
  deactivate: "deactivated",
  maintenance: "in_maintenance",
};

const SKIP_IF_ALREADY: Record<Exclude<AdjustmentType, "replace">, Set<string>> =
  {
    activate: new Set(["active"]),
    deactivate: new Set(["deactivated", "cancelled"]),
    maintenance: new Set(["in_maintenance"]),
  };

async function loadCurrentStatuses(
  supabase: SupabaseClient,
  planId: string,
  adjustments: WeeklyBilanOutput["load_adjustments"],
): Promise<Map<string, string>> {
  const itemIds = new Set<string>();

  for (const adjustment of adjustments) {
    itemIds.add(adjustment.target_item_id);
    if (adjustment.type === "replace") {
      const replacementItemId = extractUuidFromText(adjustment.reason);
      if (replacementItemId) itemIds.add(replacementItemId);
    }
  }

  if (itemIds.size === 0) return new Map();

  const { data, error } = await supabase
    .from("user_plan_items")
    .select("id, status")
    .eq("plan_id", planId)
    .in("id", [...itemIds]);

  if (error) throw error;

  return new Map(
    ((data as Array<{ id: string; status: string }> | null) ?? []).map((
      row,
    ) => [row.id, row.status]),
  );
}

export async function materializeWeeklyAdjustments(
  supabase: SupabaseClient,
  planId: string,
  adjustments: WeeklyBilanOutput["load_adjustments"],
  existingItems?: WeeklyItemSnapshot[],
): Promise<MaterializeResult> {
  const result: MaterializeResult = { applied: 0, skipped: 0, errors: [] };

  const statusByItemId = new Map<string, string>();
  if (existingItems) {
    for (const item of existingItems) {
      statusByItemId.set(item.id, item.status);
    }
  } else {
    const fetchedStatuses = await loadCurrentStatuses(
      supabase,
      planId,
      adjustments,
    );
    for (const [id, status] of fetchedStatuses.entries()) {
      statusByItemId.set(id, status);
    }
  }

  for (const adj of adjustments) {
    try {
      if (adj.type === "replace") {
        const subResult = await applyReplace(
          supabase,
          planId,
          adj.target_item_id,
          adj.reason,
          statusByItemId,
        );
        result.applied += subResult.applied;
        result.skipped += subResult.skipped;
        result.errors.push(...subResult.errors);
        continue;
      }

      const targetStatus = TARGET_STATUS_MAP[adj.type];
      const skipSet = SKIP_IF_ALREADY[adj.type];
      const currentStatus = statusByItemId.get(adj.target_item_id);

      if (currentStatus && skipSet.has(currentStatus)) {
        result.skipped++;
        continue;
      }

      const now = new Date().toISOString();
      const updatePayload: Record<string, unknown> = {
        status: targetStatus,
        updated_at: now,
      };
      if (adj.type === "activate") {
        updatePayload.activated_at = now;
      }

      const { error } = await supabase
        .from("user_plan_items")
        .update(updatePayload)
        .eq("id", adj.target_item_id)
        .eq("plan_id", planId);

      if (error) {
        result.errors.push(
          `${adj.type} ${adj.target_item_id}: ${error.message}`,
        );
      } else {
        result.applied++;
        statusByItemId.set(adj.target_item_id, targetStatus);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`${adj.type} ${adj.target_item_id}: ${msg}`);
    }
  }

  return result;
}

// Replace = deactivate old + activate new.
// The "reason" field for replace adjustments should contain the new item ID.
async function applyReplace(
  supabase: SupabaseClient,
  planId: string,
  deactivateItemId: string,
  reason: string,
  statusByItemId: Map<string, string>,
): Promise<MaterializeResult> {
  const result: MaterializeResult = { applied: 0, skipped: 0, errors: [] };
  const now = new Date().toISOString();
  const activateItemId = extractUuidFromText(reason);

  if (!activateItemId) {
    result.errors.push(
      `replace-activate ${deactivateItemId}: missing replacement item id`,
    );
    return result;
  }
  if (activateItemId === deactivateItemId) {
    result.errors.push(
      `replace-activate ${deactivateItemId}: replacement item cannot equal source item`,
    );
    return result;
  }

  const currentDeactivateStatus = statusByItemId.get(deactivateItemId);
  if (
    currentDeactivateStatus &&
    new Set(["deactivated", "cancelled"]).has(currentDeactivateStatus)
  ) {
    result.skipped++;
  } else {
    const { error: deactivateError } = await supabase
      .from("user_plan_items")
      .update({ status: "deactivated", updated_at: now })
      .eq("id", deactivateItemId)
      .eq("plan_id", planId);

    if (deactivateError) {
      result.errors.push(
        `replace-deactivate ${deactivateItemId}: ${deactivateError.message}`,
      );
    } else {
      result.applied++;
      statusByItemId.set(deactivateItemId, "deactivated");
    }
  }

  const currentActivateStatus = statusByItemId.get(activateItemId);
  if (
    currentActivateStatus && new Set(["active"]).has(currentActivateStatus)
  ) {
    result.skipped++;
  } else {
    const { error: activateError } = await supabase
      .from("user_plan_items")
      .update({ status: "active", activated_at: now, updated_at: now })
      .eq("id", activateItemId)
      .eq("plan_id", planId);

    if (activateError) {
      result.errors.push(
        `replace-activate ${activateItemId}: ${activateError.message}`,
      );
    } else {
      result.applied++;
      statusByItemId.set(activateItemId, "active");
    }
  }

  return result;
}
