/**
 * PIVOT NUTRITION §1.4 — the Monday synthesis, and the cohort completion
 * report.
 *
 * WHAT THIS IS FOR, in the business's own words: "Un coach qui n'ouvre jamais
 * le dashboard mais lit sa synthèse est un client retenu : la valeur est
 * poussée, l'interface sert à configurer." This module produces that pushed
 * value. It is, quite literally, the artefact the coach is paying for.
 *
 * ── THE RULE THAT SHAPES EVERY LINE BELOW ─────────────────────────────────
 * THE NUMBERS ARE COMPUTED, NEVER NARRATED BY A MODEL. This repo has already
 * paid for the alternative: a weekly recap that confabulated its own figures
 * (`tracking-projection-not-grounded-db`, `recap-readonly-routed-to-plan-
 * realignment`). A coach who catches ONE invented number stops trusting every
 * number, and the synthesis is the whole product surface. So:
 *   - every figure here comes from `adherence.ts`, which computes from facts;
 *   - `renderSynthesisText` is a TEMPLATE over those figures, deterministic,
 *     with no model in the loop;
 *   - anything not computable is ABSENT, never estimated.
 *
 * ── WHAT IS DELIBERATELY NOT RECOMPUTED HERE ──────────────────────────────
 * `computeWeekAdherence`, `computeLoggingCoverage` and `summarizePortionBands`
 * already exist and are tested. This module composes them. A second adherence
 * formula living in the synthesis is the pattern the pivot plan lists as
 * adversarial §7.3-(6), applied to the number the coach reads.
 *
 * PURE MODULE: no I/O, no clock (the caller passes `now`), no randomness.
 */

import {
  computeWeekAdherence,
  LOGGING_COVERAGE_MIN_DAYS,
  type WeekAdherenceInput,
  type WeekAdherenceResult,
} from "./adherence.ts";

// ---------------------------------------------------------------------------
// AXIS 1 — CONTACT. How recently did this student say anything at all?
// ---------------------------------------------------------------------------

/**
 * The cohort screen's three states (§1.4 "actif / glisse / silencieux").
 *
 * ⚠️ NAMED `responsive|slipping|silent`, NOT `active|...`, ON PURPOSE.
 * `active` already means something else and something billable in this schema:
 * `coach_clients.status='active'` is the SEAT, and §1.7 defines a billable
 * active student as ">=1 interaction in the month". A student can be a billable
 * `active` seat and `silent` for nine days at the same time — those are not a
 * contradiction, they are two different questions. Reusing the word would
 * guarantee that someone eventually wires the invoice to the cohort screen.
 */
export const CONTACT_STATES = ["responsive", "slipping", "silent"] as const;
export type ContactState = (typeof CONTACT_STATES)[number];

/**
 * The thresholds, in hours. Anchored on §1.3: the re-engagement loop fires at
 * "48-72h de silence", so `slipping` must OPEN at 48h — that is the state the
 * relance acts on. `silent` at 120h (5 days) is the point where a gentle nudge
 * has already been sent and not answered, which is a different coaching
 * situation and the one that belongs in the coach's hands.
 */
export const CONTACT_SLIPPING_AFTER_HOURS = 48;
export const CONTACT_SILENT_AFTER_HOURS = 120;

const HOUR_MS = 60 * 60 * 1000;

/**
 * @param lastInboundAt the last message the STUDENT sent. Not the last message
 *   Sophia sent — a student who receives three nudges and answers none is
 *   silent, and counting outbound would hide exactly the case that matters.
 */
export function classifyContact(
  lastInboundAt: Date | string | null,
  now: Date,
): { state: ContactState; hoursSince: number | null } {
  if (!lastInboundAt) {
    // Never said anything at all: silent, and `null` hours rather than a
    // fabricated "infinity" a renderer might print.
    return { state: "silent", hoursSince: null };
  }
  const last = lastInboundAt instanceof Date ? lastInboundAt : new Date(lastInboundAt);
  if (Number.isNaN(last.getTime())) return { state: "silent", hoursSince: null };
  const hours = (now.getTime() - last.getTime()) / HOUR_MS;
  if (hours >= CONTACT_SILENT_AFTER_HOURS) return { state: "silent", hoursSince: hours };
  if (hours >= CONTACT_SLIPPING_AFTER_HOURS) return { state: "slipping", hoursSince: hours };
  return { state: "responsive", hoursSince: hours };
}

// ---------------------------------------------------------------------------
// AXIS 2 — RISK. The existing KEEL vocabulary, not a new one.
// ---------------------------------------------------------------------------

/**
 * Exactly the six values of `weekly_reviews.risk_band`
 * (migration 20260727090000). Not extended, not renamed: the column exists, the
 * coach's Monday triage queue reads it, and a seventh value invented here would
 * fail its CHECK at write time.
 */
export const RISK_BANDS = [
  "on_track",
  "watch",
  "at_risk",
  "disengaged",
  "outcome_mismatch",
  "restriction_flag",
] as const;
export type RiskBand = (typeof RISK_BANDS)[number];

export interface StudentWeekInput {
  studentUserId: string;
  displayName?: string | null;
  /** Last INBOUND message from the student. */
  lastInboundAt: Date | string | null;
  /** Everything `computeWeekAdherence` needs. */
  adherence: WeekAdherenceInput;
  /**
   * The deterministic TCA floor (`restriction_guard.ts`). When true, it
   * overrides every other band — see `classifyRisk`.
   */
  restrictionFlag?: boolean;
  /** Optional, from `weekly_reviews.outcomes`: is the outcome moving the wrong way? */
  outcomeMismatch?: boolean;
}

/**
 * The matrix (BUILD_PLAN W7.2), in priority order. The ORDER is the rule:
 *
 *   1. `restriction_flag` OVERRIDES EVERYTHING. A student showing restrictive
 *      signals is not an adherence problem to be nudged harder — adherence
 *      pressure is precisely what must stop. Placing it anywhere but first
 *      would let a good adherence score bury a safety signal.
 *   2. `disengaged` next: below the coverage gate there IS no adherence number,
 *      so no adherence-derived band can be honestly computed. Ranking it second
 *      is not a preference, it is the only band the data supports.
 *   3. then the adherence bands, and `outcome_mismatch` for "following the plan,
 *      going the wrong way" — the case a coach most wants surfaced, because it
 *      means HIS plan needs changing, not the student.
 */
export function classifyRisk(args: {
  contact: ContactState;
  adherence: WeekAdherenceResult;
  restrictionFlag?: boolean;
  outcomeMismatch?: boolean;
}): RiskBand {
  if (args.restrictionFlag) return "restriction_flag";
  if (args.contact === "silent") return "disengaged";
  if (args.adherence.kind === "insufficient_data") return "disengaged";
  if (args.outcomeMismatch) return "outcome_mismatch";

  const pct = args.adherence.corePct ?? args.adherence.overallPct;
  if (pct >= 80) return args.contact === "slipping" ? "watch" : "on_track";
  if (pct >= 60) return "watch";
  return "at_risk";
}

// ---------------------------------------------------------------------------
// The per-student line
// ---------------------------------------------------------------------------

/**
 * Why a student is flagged. R1: ASCII snake_case — the coach's triage UI and
 * the `coach_syntheses.flagged_students` jsonb both branch on it.
 */
export const FLAG_REASONS = [
  "restriction_signal",
  "silent_5d",
  "slipping_contact",
  "coverage_below_gate",
  "adherence_at_risk",
  "outcome_mismatch",
] as const;
export type FlagReason = (typeof FLAG_REASONS)[number];

export interface StudentSynthesisLine {
  studentUserId: string;
  displayName: string | null;
  contact: ContactState;
  hoursSinceContact: number | null;
  adherence: WeekAdherenceResult;
  riskBand: RiskBand;
  flagReason: FlagReason | null;
  /** Rank key: lower sorts first. Deterministic, no ties broken by chance. */
  severity: number;
}

const FLAG_SEVERITY: Readonly<Record<FlagReason, number>> = {
  restriction_signal: 0,
  silent_5d: 1,
  coverage_below_gate: 2,
  adherence_at_risk: 3,
  outcome_mismatch: 4,
  slipping_contact: 5,
};

function flagFor(line: {
  contact: ContactState;
  adherence: WeekAdherenceResult;
  riskBand: RiskBand;
}): FlagReason | null {
  if (line.riskBand === "restriction_flag") return "restriction_signal";
  if (line.contact === "silent") return "silent_5d";
  if (line.adherence.kind === "insufficient_data") return "coverage_below_gate";
  if (line.riskBand === "outcome_mismatch") return "outcome_mismatch";
  if (line.riskBand === "at_risk") return "adherence_at_risk";
  if (line.contact === "slipping") return "slipping_contact";
  return null;
}

export function buildStudentLine(
  input: StudentWeekInput,
  now: Date,
): StudentSynthesisLine {
  const contact = classifyContact(input.lastInboundAt, now);
  const adherence = computeWeekAdherence(input.adherence);
  const riskBand = classifyRisk({
    contact: contact.state,
    adherence,
    restrictionFlag: input.restrictionFlag,
    outcomeMismatch: input.outcomeMismatch,
  });
  const flagReason = flagFor({ contact: contact.state, adherence, riskBand });
  return {
    studentUserId: input.studentUserId,
    displayName: input.displayName ?? null,
    contact: contact.state,
    hoursSinceContact: contact.hoursSince,
    adherence,
    riskBand,
    flagReason,
    severity: flagReason === null ? 99 : FLAG_SEVERITY[flagReason],
  };
}

// ---------------------------------------------------------------------------
// The synthesis
// ---------------------------------------------------------------------------

export interface CohortMetrics {
  studentCount: number;
  responsive: number;
  slipping: number;
  silent: number;
  /** Students whose coverage cleared the gate, i.e. who HAVE an adherence number. */
  withAdherence: number;
  /** Mean core adherence over those students only, integer percent, or null. */
  meanCoreAdherencePct: number | null;
}

export interface CoachSynthesis {
  metrics: CohortMetrics;
  /** Every student, most severe first. */
  lines: StudentSynthesisLine[];
  /** The ones the coach should act on. See `TO_CATCH_UP_CAP`. */
  flagged: StudentSynthesisLine[];
}

/**
 * §1.4 asks for "les 3 élèves à rattraper". Three is the point: a list of
 * fifteen is a list nobody acts on.
 */
export const TO_CATCH_UP_CAP = 3;

/**
 * Build the synthesis.
 *
 * THE CAP HAS AN EXEMPTION, and it is not a detail. A `restriction_signal` is a
 * safety finding; a cap that can silently drop one because three adherence
 * problems happened to sort above it would be a cap that hides the only item on
 * the list that can hurt someone. So every restriction signal is always
 * included, and the cap applies to what remains. A truncation is never silent
 * either — `metrics` carries the full counts, so a reader can always see that
 * the list is a selection rather than the whole picture.
 */
export function buildCoachSynthesis(
  students: readonly StudentWeekInput[],
  now: Date,
): CoachSynthesis {
  const lines = students.map((s) => buildStudentLine(s, now));

  // Deterministic order: severity, then contact recency (longest silence
  // first), then id. No tie is ever broken by array order — two runs of the
  // same week must produce the same synthesis, or the artefact is not evidence.
  lines.sort((a, b) =>
    a.severity - b.severity ||
    (b.hoursSinceContact ?? Number.MAX_SAFE_INTEGER) -
      (a.hoursSinceContact ?? Number.MAX_SAFE_INTEGER) ||
    a.studentUserId.localeCompare(b.studentUserId)
  );

  const withAdherence = lines.filter((l) => l.adherence.kind === "adherence");
  const coreValues = withAdherence
    .map((l) => (l.adherence.kind === "adherence" ? l.adherence.corePct ?? l.adherence.overallPct : null))
    .filter((v): v is number => v !== null);

  const metrics: CohortMetrics = {
    studentCount: lines.length,
    responsive: lines.filter((l) => l.contact === "responsive").length,
    slipping: lines.filter((l) => l.contact === "slipping").length,
    silent: lines.filter((l) => l.contact === "silent").length,
    withAdherence: withAdherence.length,
    meanCoreAdherencePct: coreValues.length > 0
      ? Math.round(coreValues.reduce((a, b) => a + b, 0) / coreValues.length)
      : null,
  };

  const flaggedAll = lines.filter((l) => l.flagReason !== null);
  const safety = flaggedAll.filter((l) => l.flagReason === "restriction_signal");
  const rest = flaggedAll.filter((l) => l.flagReason !== "restriction_signal");
  const flagged = [...safety, ...rest.slice(0, TO_CATCH_UP_CAP)];

  return { metrics, lines, flagged };
}

// ---------------------------------------------------------------------------
// Rendering — a template, never a model
// ---------------------------------------------------------------------------

function nameOf(line: StudentSynthesisLine): string {
  return line.displayName?.trim() || "A student";
}

/**
 * The order of the sections is imposed by the evidence, not by aesthetics
 * (docs/keel/PHOTO_QUANTIFICATION.md §5, Peterson 2014, n=220): logging
 * FREQUENCY predicts outcome strongly (p<0.0001) while log COMPLETENESS does
 * not (p>0.05). So coverage leads, adherence follows, and the students to catch
 * up come before any aggregate a coach cannot act on.
 */
export function renderSynthesisText(
  synthesis: CoachSynthesis,
  opts: { coachName?: string | null; locale: string },
): string {
  if (opts.locale !== "en") {
    // R7: an unsupported render locale fails loudly rather than silently
    // shipping English to a French coach as if it were a choice.
    throw new Error(`R7: unsupported synthesis locale "${opts.locale}"`);
  }
  const m = synthesis.metrics;
  const out: string[] = [];

  out.push(
    `${m.studentCount} student${m.studentCount === 1 ? "" : "s"} this week: ` +
      `${m.responsive} in touch, ${m.slipping} slipping, ${m.silent} silent.`,
  );

  if (m.meanCoreAdherencePct !== null) {
    out.push(
      `Average adherence on core lines: ${m.meanCoreAdherencePct}% ` +
        `(${m.withAdherence} of ${m.studentCount} logged enough for a number).`,
    );
  } else {
    // The gate, stated rather than filled with a fake average.
    out.push(
      `No adherence figure this week: nobody logged at least ` +
        `${LOGGING_COVERAGE_MIN_DAYS} of 7 days.`,
    );
  }

  if (synthesis.flagged.length === 0) {
    out.push("Nobody needs catching up. That is the whole report.");
    return out.join("\n");
  }

  out.push("");
  out.push("To catch up:");
  for (const line of synthesis.flagged) {
    out.push(`- ${nameOf(line)}: ${describeFlag(line)}`);
  }
  return out.join("\n");
}

/**
 * One sentence per flagged student, grounded in the computed value. Every
 * branch names WHAT was observed, never a diagnosis of the person.
 */
export function describeFlag(line: StudentSynthesisLine): string {
  const days = line.hoursSinceContact === null
    ? null
    : Math.floor(line.hoursSinceContact / 24);
  switch (line.flagReason) {
    case "restriction_signal":
      // Deliberately carries NO adherence figure and NO nudge suggestion: the
      // product rule is that adherence pressure STOPS here (§3.4 garde-fou TCA).
      return "restrictive signals this week. I have paused adherence prompts for them - this one is yours to handle.";
    case "silent_5d":
      return days === null
        ? "has never replied since being added."
        : `no message for ${days} day${days === 1 ? "" : "s"}.`;
    case "coverage_below_gate": {
      const cov = line.adherence.loggingCoverage;
      return `only logged ${cov.loggedDays} of 7 days - not enough to say how the week went.`;
    }
    case "outcome_mismatch":
      return "following the plan, but the outcome is moving the wrong way.";
    case "adherence_at_risk": {
      const pct = line.adherence.kind === "adherence"
        ? (line.adherence.corePct ?? line.adherence.overallPct)
        : null;
      return pct === null
        ? "struggling on the core lines."
        : `${pct}% on core lines.`;
    }
    case "slipping_contact":
      return days === null
        ? "has gone quiet."
        : `quiet for ${days} day${days === 1 ? "" : "s"}.`;
    default:
      return "needs a look.";
  }
}

/**
 * The `flagged_students` jsonb written on `coach_syntheses`. R1: keys AND
 * values are ASCII tokens; the evidence carries the computed numbers so the
 * row can be re-read later without recomputing a past week.
 */
export function flaggedStudentsPayload(
  synthesis: CoachSynthesis,
): Array<Record<string, unknown>> {
  return synthesis.flagged.map((line) => ({
    student_user_id: line.studentUserId,
    reason_code: line.flagReason,
    risk_band: line.riskBand,
    contact_state: line.contact,
    evidence: {
      hours_since_contact: line.hoursSinceContact === null
        ? null
        : Math.round(line.hoursSinceContact),
      logged_days: line.adherence.loggingCoverage.loggedDays,
      core_adherence_pct: line.adherence.kind === "adherence"
        ? line.adherence.corePct
        : null,
      // Explicit, so a reader of the row never has to infer why a percentage is
      // missing: absent-because-gated and absent-because-bug look identical
      // otherwise.
      adherence_gated: line.adherence.kind === "insufficient_data",
    },
  }));
}

/** The `metrics` jsonb written on `coach_syntheses`. */
export function metricsPayload(synthesis: CoachSynthesis): Record<string, unknown> {
  const m = synthesis.metrics;
  return {
    student_count: m.studentCount,
    responsive: m.responsive,
    slipping: m.slipping,
    silent: m.silent,
    with_adherence: m.withAdherence,
    mean_core_adherence_pct: m.meanCoreAdherencePct,
    flagged_count: synthesis.flagged.length,
    // A cap that truncates must say so, or the list reads as "everything".
    flagged_total_before_cap: synthesis.lines.filter((l) => l.flagReason !== null).length,
  };
}
