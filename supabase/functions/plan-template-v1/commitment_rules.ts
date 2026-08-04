/**
 * KEEL — plan-template-v1 · commitment coherence rules (pure, zero I/O).
 *
 * THE SERVER IS THE AUTHORITY. The review screen validates as the coach types
 * so the feedback is instant, but nothing reaches `plan_templates.commitments`
 * without passing through this module first.
 *
 * Every rule below mirrors ONE named CHECK constraint of `plan_commitments`
 * (migration 20260727090000). The constraint name is quoted in the issue text,
 * so a rejection here and a rejection by Postgres at publish time are the same
 * sentence — that is the only way a client-side mirror stays honest.
 *
 * Enum membership is NOT re-listed here: it is delegated to the fail-loud
 * parsers of `_shared/keel/tokens.ts` (R7, R1). The frontend selectors are
 * populated from those very lists, shipped by the `vocabulary` action, so the
 * closed vocabularies exist in exactly one place in the codebase.
 */

import {
  ACTIVITY_CLASS,
  ANCHOR_KIND,
  AUTONOMY,
  DAY_TOKENS,
  EVALUATION_GRAIN,
  EVIDENCE_KIND,
  MEASURE,
  parseActivityClass,
  parseAnchorKind,
  parseAutonomy,
  parseDayToken,
  parseEvaluationGrain,
  parseEvidenceKind,
  parseFoodGroupRef,
  parseMeasure,
  parsePolarity,
  parsePriority,
  parseProvenance,
  parseSlotKey,
  parseSlotKind,
  parseSubstanceRef,
  parseTargetOp,
  parseUnit,
  POLARITY,
  PRIORITY,
  PROVENANCE,
  SLOT_KIND,
  SLOT_VOCABULARY,
  TARGET_OP,
  UNIT,
} from "../_shared/keel/tokens.ts";

/**
 * `plan_commitments.auto_source` CHECK vocabulary. It lives here rather than in
 * tokens.ts because tokens.ts does not export it today and that file is not in
 * this lot's perimeter. Kept next to the rule that reads it, and shipped to the
 * UI through `vocabulary` so the selector cannot drift from this list.
 */
export const AUTO_SOURCE = [
  "whoop",
  "oura",
  "apple_health",
  "cgm",
  "scale",
] as const;
export type AutoSource = (typeof AUTO_SOURCE)[number];

/**
 * One editable line of a template. Field names are the COLUMN names of
 * `plan_commitments` verbatim — a template commitment is a clone source, and a
 * renaming layer between the editor and the table is where the two drift.
 */
export interface DraftCommitment {
  template_commitment_key: string | null;
  title: string;
  student_instruction: string | null;
  content_locale: string;

  polarity: string;
  activity_class: string;

  anchor_kind: string;
  slot_key: string | null;
  clock_local: string | null;
  tolerance_minutes: number | null;
  window_start_local: string | null;
  window_end_local: string | null;

  measure: string;
  unit: string | null;
  target_op: string;
  target_min: number | null;
  target_max: number | null;
  substance_ref: string | null;
  food_group_ref: string | null;

  evidence_kind: string;
  evidence_required: boolean;
  auto_source: string | null;
  counts_toward_adherence: boolean;

  evaluation_grain: string;
  slot_kind: string | null;
  scheduled_days: string[] | null;
  required_days_per_week: number | null;
  expected_occasions_per_day: number | null;

  priority: string;
  autonomy: string;
  flex_eligible: boolean;
  provenance: string;
  requires_clinician_signoff: boolean;

  auto_generated: boolean;
  source_span: Record<string, unknown> | null;
}

/** The closed vocabularies the UI needs, sourced from tokens.ts (R1/R7). */
export const COMMITMENT_ENUMS = {
  polarity: POLARITY,
  activity_class: ACTIVITY_CLASS,
  anchor_kind: ANCHOR_KIND,
  slot_key: SLOT_VOCABULARY,
  measure: MEASURE,
  unit: UNIT,
  target_op: TARGET_OP,
  evidence_kind: EVIDENCE_KIND,
  auto_source: AUTO_SOURCE,
  evaluation_grain: EVALUATION_GRAIN,
  slot_kind: SLOT_KIND,
  scheduled_days: DAY_TOKENS,
  priority: PRIORITY,
  autonomy: AUTONOMY,
  provenance: PROVENANCE,
} as const;

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || String(v).trim() === "";
}

function tokenIssue(
  issues: string[],
  label: string,
  value: unknown,
  parse: (v: unknown) => unknown,
): void {
  try {
    parse(value);
  } catch (err) {
    issues.push(`${label}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Validate one draft line. Returns the list of blocking issues, empty when the
 * line would be accepted by every CHECK of `plan_commitments`.
 *
 * NOT a sanitizer: nothing is corrected, nothing is defaulted. A line the coach
 * has not finished is a line that stays in the queue, visibly, with its reason.
 */
export function validateDraftCommitment(raw: unknown): string[] {
  const issues: string[] = [];
  const c = (typeof raw === "object" && raw !== null ? raw : {}) as Record<
    string,
    unknown
  >;

  // --- prose + locale (R2) ---------------------------------------------------
  if (isBlank(c.title)) issues.push("title: required (plan_commitments.title NOT NULL)");
  if (isBlank(c.content_locale)) {
    issues.push("content_locale: required (R2 — a prose row carries its locale)");
  }

  // --- closed vocabularies (R1/R7) ------------------------------------------
  tokenIssue(issues, "polarity", c.polarity, parsePolarity);
  tokenIssue(issues, "activity_class", c.activity_class, parseActivityClass);
  tokenIssue(issues, "anchor_kind", c.anchor_kind, parseAnchorKind);
  tokenIssue(issues, "measure", c.measure, parseMeasure);
  tokenIssue(issues, "target_op", c.target_op, parseTargetOp);
  tokenIssue(issues, "evidence_kind", c.evidence_kind, parseEvidenceKind);
  tokenIssue(issues, "evaluation_grain", c.evaluation_grain, parseEvaluationGrain);
  tokenIssue(issues, "priority", c.priority, parsePriority);
  tokenIssue(issues, "autonomy", c.autonomy, parseAutonomy);
  tokenIssue(issues, "provenance", c.provenance, parseProvenance);
  if (!isBlank(c.unit)) tokenIssue(issues, "unit", c.unit, parseUnit);
  if (!isBlank(c.slot_key)) tokenIssue(issues, "slot_key", c.slot_key, parseSlotKey);
  if (!isBlank(c.slot_kind)) tokenIssue(issues, "slot_kind", c.slot_kind, parseSlotKind);
  if (!isBlank(c.substance_ref)) {
    tokenIssue(issues, "substance_ref", c.substance_ref, parseSubstanceRef);
  }
  if (!isBlank(c.food_group_ref)) {
    tokenIssue(issues, "food_group_ref", c.food_group_ref, parseFoodGroupRef);
  }
  if (!isBlank(c.auto_source) && !AUTO_SOURCE.includes(String(c.auto_source) as AutoSource)) {
    issues.push(
      `auto_source: unknown token ${JSON.stringify(c.auto_source)}. ` +
        `Expected one of: ${AUTO_SOURCE.join(", ")}`,
    );
  }
  if (c.scheduled_days != null) {
    if (!Array.isArray(c.scheduled_days)) {
      issues.push("scheduled_days: must be an array of day tokens");
    } else {
      for (const d of c.scheduled_days) {
        tokenIssue(issues, "scheduled_days", d, parseDayToken);
      }
    }
  }

  // --- time literals ---------------------------------------------------------
  for (const field of ["clock_local", "window_start_local", "window_end_local"] as const) {
    const v = c[field];
    if (!isBlank(v) && !HHMM.test(String(v))) {
      issues.push(`${field}: expected HH:MM (24h), got ${JSON.stringify(v)}`);
    }
  }

  const anchorKind = String(c.anchor_kind ?? "");
  const hasSlot = !isBlank(c.slot_key);
  const hasClock = !isBlank(c.clock_local);
  const hasTolerance = c.tolerance_minutes != null && c.tolerance_minutes !== "";
  const hasWinStart = !isBlank(c.window_start_local);
  const hasWinEnd = !isBlank(c.window_end_local);

  // --- CHECK plan_commitments_anchor_check ----------------------------------
  // Each anchor_kind requires its columns and forbids the others. The single
  // documented exception (fixture 3): a 'slot' anchor MAY also carry a window,
  // which feeds timing_status while the slot stays the key.
  if (anchorKind === "slot") {
    if (!hasSlot) issues.push("plan_commitments_anchor_check: anchor_kind='slot' requires slot_key");
    if (hasClock || hasTolerance) {
      issues.push("plan_commitments_anchor_check: anchor_kind='slot' forbids clock_local / tolerance_minutes");
    }
    if (hasWinStart !== hasWinEnd) {
      issues.push("plan_commitments_anchor_check: a slot window needs BOTH window_start_local and window_end_local");
    }
  } else if (anchorKind === "clock") {
    if (!hasClock) issues.push("plan_commitments_anchor_check: anchor_kind='clock' requires clock_local");
    if (hasSlot || hasWinStart || hasWinEnd) {
      issues.push("plan_commitments_anchor_check: anchor_kind='clock' forbids slot_key and the window columns");
    }
  } else if (anchorKind === "window") {
    if (!hasWinStart || !hasWinEnd) {
      issues.push("plan_commitments_anchor_check: anchor_kind='window' requires window_start_local and window_end_local");
    }
    if (hasSlot || hasClock || hasTolerance) {
      issues.push("plan_commitments_anchor_check: anchor_kind='window' forbids slot_key, clock_local and tolerance_minutes");
    }
  } else if (anchorKind === "free") {
    if (hasSlot || hasClock || hasTolerance || hasWinStart || hasWinEnd) {
      issues.push("plan_commitments_anchor_check: anchor_kind='free' forbids every anchor column");
    }
  }

  // --- CHECK plan_commitments_target_check ----------------------------------
  const op = String(c.target_op ?? "");
  const min = c.target_min == null || c.target_min === "" ? null : Number(c.target_min);
  const max = c.target_max == null || c.target_max === "" ? null : Number(c.target_max);
  if (min !== null && Number.isNaN(min)) issues.push("target_min: not a number");
  if (max !== null && Number.isNaN(max)) issues.push("target_max: not a number");
  if (op === ">=" || op === "==") {
    if (min === null) issues.push(`plan_commitments_target_check: target_op='${op}' requires target_min`);
    if (max !== null) issues.push(`plan_commitments_target_check: target_op='${op}' forbids target_max`);
  } else if (op === "<=") {
    if (max === null) issues.push("plan_commitments_target_check: target_op='<=' requires target_max");
    if (min !== null) issues.push("plan_commitments_target_check: target_op='<=' forbids target_min");
  } else if (op === "between") {
    if (min === null || max === null) {
      issues.push("plan_commitments_target_check: target_op='between' requires target_min and target_max");
    } else if (min > max) {
      issues.push("plan_commitments_target_check: target_min must be <= target_max");
    }
  } else if (op === "any") {
    if (min !== null || max !== null) {
      issues.push("plan_commitments_target_check: target_op='any' forbids target_min and target_max");
    }
  }

  // --- CHECK plan_commitments_substance_ref_check (R7 corollary) ------------
  const measure = String(c.measure ?? "");
  if ((measure === "dose" || measure === "micronutrient") && isBlank(c.substance_ref)) {
    issues.push(
      `plan_commitments_substance_ref_check: measure='${measure}' requires substance_ref ` +
        "(R7 — the molecule register has no anonymous line)",
    );
  }

  // --- CHECK plan_commitments_occasion_anchor_check -------------------------
  const grain = String(c.evaluation_grain ?? "");
  if (grain === "occasion" && anchorKind === "free") {
    issues.push(
      "plan_commitments_occasion_anchor_check: evaluation_grain='occasion' needs an anchor that resolves to an occasion (never 'free')",
    );
  }

  // --- CHECK plan_commitments_nominal_slot_check ----------------------------
  if (String(c.slot_kind ?? "") === "nominal" && String(c.slot_key ?? "") === "any_meal") {
    issues.push(
      "plan_commitments_nominal_slot_check: slot_kind='nominal' forbids slot_key='any_meal' (a nominal slot must be pre-seedable at day open)",
    );
  }

  // --- CHECK plan_commitments_avoid_grain_check -----------------------------
  if (String(c.polarity ?? "") === "avoid" && grain !== "day" && grain !== "week") {
    issues.push(
      "plan_commitments_avoid_grain_check: polarity='avoid' evaluates at day or week grain only (R6 — inverted default is meaningless per occasion)",
    );
  }

  // --- CHECK required_days_per_week / expected_occasions_per_day ------------
  const req = c.required_days_per_week;
  if (req != null && req !== "") {
    const n = Number(req);
    if (!Number.isInteger(n) || n < 0 || n > 7) {
      issues.push("required_days_per_week: must be an integer between 0 and 7 (the DENOMINATOR)");
    }
  }
  const occ = c.expected_occasions_per_day;
  if (occ != null && occ !== "") {
    const n = Number(occ);
    if (!Number.isInteger(n) || n < 1) {
      issues.push("expected_occasions_per_day: must be an integer >= 1");
    }
  }

  return issues;
}

/**
 * Template-level invariant: `template_commitment_key` is the join key each
 * student clone carries back to the template (`plan_commitments.
 * template_commitment_key`). Two lines sharing a key would make the diff at
 * publish time ambiguous — the class of bug that produces a phantom update.
 */
export function validateTemplateCommitments(
  commitments: unknown,
): { index: number; issues: string[] }[] {
  if (!Array.isArray(commitments)) {
    return [{ index: -1, issues: ["commitments: must be an array"] }];
  }
  const out: { index: number; issues: string[] }[] = [];
  const seen = new Map<string, number>();
  commitments.forEach((raw, index) => {
    const issues = validateDraftCommitment(raw);
    const key = (raw as Record<string, unknown> | null)?.template_commitment_key;
    if (typeof key !== "string" || key.trim() === "") {
      // plan-publish-v1 refuses the same line later ("a template line must be
      // addressable by a per-student diff"). Refusing it HERE means the coach
      // hears about it while saving, not at the moment they publish.
      issues.push(
        "template_commitment_key: required — a template line must be addressable by the per-student diff",
      );
    } else if (!/^[a-z][a-z0-9_]*$/.test(key)) {
      issues.push(
        `template_commitment_key: ${JSON.stringify(key)} is not an ASCII snake_case token (R1)`,
      );
    } else {
      const first = seen.get(key);
      if (first !== undefined) {
        issues.push(
          `template_commitment_key: duplicate of line ${first + 1} — the publish diff would be ambiguous`,
        );
      } else {
        seen.set(key, index);
      }
    }
    if (issues.length > 0) out.push({ index, issues });
  });
  return out;
}
