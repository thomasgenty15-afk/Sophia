/**
 * KEEL — plan-template-v1 · molecule-register safety NOTES, server side.
 *
 * WHAT THIS MODULE IS SINCE 2026-07-28. It reads the two seeded reference
 * tables (`substance_limits`, `substance_interactions`) against the lines the
 * coach is editing, and returns the facts it found. That is all it does.
 *
 * WHAT IT STOPPED BEING, BY PRODUCT DECISION. It used to be the "provenance
 * safety gate": a line above a UL or on the interaction watchlist WITHOUT
 * `provenance='clinician_ordered'` was degraded — the student received an
 * educational food-first suggestion with the dose stripped out, and the coach
 * was shown a button reading "Mark as clinician-ordered" to undo it. The coach
 * is the prescriber. The software does not put a condition in front of what
 * they wrote, so the gate is gone: `provenance` and `requires_clinician_signoff`
 * are NOT READ here anymore (the columns still exist — see the header of
 * migration 20260727090000 — nothing reads them to degrade anything).
 *
 * THREE PROPERTIES HOLD THIS FILE HONEST, and they are structural rather than
 * a matter of wording:
 *
 *  - NO STUDENT BRANCH. `SafetyFinding` has no `student_text` and no substitute
 *    copy of any kind. The prescription that reaches the student is the coach's
 *    `student_instruction`, verbatim, and nothing in this module can touch it.
 *  - NO VERDICT. There is no `degraded`, no `blocking`, no severity ranking —
 *    no boolean at all for a caller to branch a refusal on. A finding is a list
 *    of facts; what they mean is the coach's call.
 *  - NO INTERNAL VOCABULARY. The note text is composed by `renderCoachSafetyNote`
 *    (`_shared/keel/render.ts`), which is also where medication classes get a
 *    readable label. `oral_contraceptives` never reaches a human reader.
 */

import { renderCoachSafetyNote } from "../_shared/keel/render.ts";

export interface SubstanceLimitRow {
  substance_ref: string;
  ul_amount: number;
  ul_unit: string;
  per: string;
}

export interface SubstanceInteractionRow {
  substance_ref: string;
  medication_class: string;
  severity: string;
  note: string;
}

/**
 * The subset of a draft line the notes are computed from. Columns only (R5).
 *
 * `provenance` is deliberately absent: a field that is not in this type cannot
 * quietly become a condition on the prescription again.
 */
export interface SafetyInput {
  title: string;
  substance_ref: string | null;
  measure: string;
  unit: string | null;
  target_op: string;
  target_min: number | null;
  target_max: number | null;
}

export type SafetyReason =
  | "exceeds_ul"
  | "ul_not_comparable"
  | "interaction_watchlist";

export interface SafetyFinding {
  index: number;
  reasons: SafetyReason[];
  ul: { amount: number; unit: string; per: string } | null;
  target_label: string | null;
  watchlist: SubstanceInteractionRow[];
  /** One factual, coach-only line per fact. Never shown to the student. */
  coach_notes: string[];
}

/**
 * Mass conversions only. IU is substance-specific and deliberately NOT
 * convertible: 5000 IU of D3 and 5000 IU of vitamin A are different molecules
 * on different scales. A comparison we cannot make honestly is reported as
 * `ul_not_comparable` — never resolved as "under the limit" by omission (R7).
 */
const MASS_TO_MG: Record<string, number> = { g: 1000, mg: 1, mcg: 0.001 };

function toComparable(
  amount: number,
  unit: string,
  ulUnit: string,
): number | null {
  if (unit === ulUnit) return amount;
  const from = MASS_TO_MG[unit];
  const to = MASS_TO_MG[ulUnit];
  if (from === undefined || to === undefined) return null;
  return (amount * from) / to;
}

export function targetLabel(c: SafetyInput): string | null {
  const unit = c.unit && c.unit !== "none" ? ` ${c.unit}` : "";
  if (c.target_op === "between" && c.target_min != null && c.target_max != null) {
    return `${c.target_min}–${c.target_max}${unit}`;
  }
  if (c.target_op === "<=" && c.target_max != null) return `<= ${c.target_max}${unit}`;
  if (c.target_min != null) return `${c.target_op} ${c.target_min}${unit}`;
  return null;
}

/**
 * The prescribed amount compared against the UL. `target_min` for the ">=",
 * "==" and "between" operators; `target_max` for "<=" (a ceiling of 6000 IU
 * still authorizes 6000 IU). `any` has no amount, so no comparison.
 */
function prescribedAmount(c: SafetyInput): number | null {
  if (c.target_op === "<=") return c.target_max;
  return c.target_min;
}

export function reviewSafety(
  commitments: SafetyInput[],
  limits: SubstanceLimitRow[],
  interactions: SubstanceInteractionRow[],
): SafetyFinding[] {
  const limitBySlug = new Map(limits.map((l) => [l.substance_ref, l]));
  const watchBySlug = new Map<string, SubstanceInteractionRow[]>();
  for (const row of interactions) {
    const list = watchBySlug.get(row.substance_ref) ?? [];
    list.push(row);
    watchBySlug.set(row.substance_ref, list);
  }

  return commitments.map((c, index) => {
    const empty: SafetyFinding = {
      index,
      reasons: [],
      ul: null,
      target_label: targetLabel(c),
      watchlist: [],
      coach_notes: [],
    };
    if (!c.substance_ref) return empty;

    const reasons: SafetyReason[] = [];
    const notes: string[] = [];
    const limit = limitBySlug.get(c.substance_ref) ?? null;
    const amount = prescribedAmount(c);
    const ulLabel = limit ? `${limit.ul_amount} ${limit.ul_unit}/${limit.per}` : null;

    if (limit && ulLabel !== null && amount != null) {
      const comparable = c.unit ? toComparable(amount, c.unit, limit.ul_unit) : null;
      if (comparable === null) {
        reasons.push("ul_not_comparable");
        notes.push(renderCoachSafetyNote({
          kind: "upper_limit_not_comparable",
          ulLabel,
          targetUnit: c.unit,
        }));
      } else if (comparable > limit.ul_amount) {
        reasons.push("exceeds_ul");
        notes.push(renderCoachSafetyNote({ kind: "above_upper_limit", ulLabel }));
      }
    }

    // One note per watchlist row, each carrying that row's own stored prose.
    // Collapsing several rows into one sentence loses which medication class
    // the note is actually about — the fact the coach is reading it for.
    const watchlist = watchBySlug.get(c.substance_ref) ?? [];
    if (watchlist.length > 0) {
      reasons.push("interaction_watchlist");
      for (const w of watchlist) {
        notes.push(renderCoachSafetyNote({
          kind: "interaction_watchlist",
          medicationClass: w.medication_class,
          note: w.note,
        }));
      }
    }

    return {
      ...empty,
      reasons,
      ul: limit
        ? { amount: limit.ul_amount, unit: limit.ul_unit, per: limit.per }
        : null,
      watchlist,
      coach_notes: notes,
    };
  });
}
