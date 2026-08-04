/**
 * PIVOT C5 — the coach's words for `coach_syntheses.flagged_students.reason_code`.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS LIVES IN ITS OWN FILE
 * ---------------------------------------------------------------------------
 * The reason codes are a CLOSED vocabulary owned by the engine
 * (`supabase/functions/_shared/keel/coach_synthesis.ts`, `FLAG_REASONS`). This
 * screen is the only place a human ever reads them, so the two lists have to
 * stay in step — and they had not. Found in QA on 2026-08-03: the screen was
 * keyed on `silent_contact`, `hard_week`, `low_coverage` and `restriction_flag`
 * while the engine emits `silent_5d`, `week_too_hard`, `coverage_below_gate`
 * and `restriction_signal`. Six codes out of eight fell through to the raw
 * token, and a coach with a silent student read the literal string
 * `silent_5d` on his Monday screen.
 *
 * The one that mattered: `restriction_signal`. Its copy — "handle directly" —
 * was written, shipped, and unreachable, because it was filed under a key the
 * engine never produces.
 *
 * A separate module is what makes the drift TESTABLE: `flagReasons.int.test.ts`
 * reads the engine file and asserts a bijection with the keys below. Adding a
 * reason code without its coach-words now fails a test instead of surfacing as
 * jargon in front of a paying coach.
 */

/**
 * One line per code. R2 on the prose: what was OBSERVED, never a diagnosis of
 * the person — "Barely logged anything", not "Not committed".
 */
export const FLAG_REASON_COPY: Record<string, string> = {
  // Safety first, and the only line that names the coach's action: adherence
  // pressure stops here (§3.4), so there is nothing for Sophia to nudge.
  restriction_signal: "Restriction signals — handle directly",
  silent_5d: "Has not written in days",
  slipping_contact: "Going quiet",
  week_too_hard: "Reported a hard week",
  coverage_below_gate: "Barely logged anything",
  no_evaluable_plan: "Nothing to measure against yet",
  adherence_at_risk: "Struggling on the core lines",
  outcome_mismatch: "Following the plan, going the wrong way",
};

/**
 * R7: an unknown code is shown RAW rather than hidden or renamed. A coach
 * seeing `some_new_code` can report it; a coach seeing nothing cannot.
 */
export function flagReasonCopy(code: string): string {
  return FLAG_REASON_COPY[code] ?? code;
}
