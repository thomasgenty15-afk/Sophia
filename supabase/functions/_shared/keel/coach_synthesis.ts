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
  type PortionBandSummary,
  summarizePortionBands,
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
 * Y a-t-il un CHIFFRE d'adhérence défendable ?
 *
 * FOUND ON REAL DATA (2026-08-03, run d'intégration sur la base locale): un
 * élève qui logge 5 jours sur 7 mais dont le coach n'a PUBLIÉ AUCUN plan
 * franchit la barrière de couverture, n'a aucune évaluation, et
 * `computeWeekAdherence` rend alors `overallPct: 0` avec `evaluableDays: 0`.
 * Lu naïvement, ça produit « at_risk, 0 % sur les lignes core » — une
 * ACCUSATION envoyée au coach à propos d'un élève qui a fait exactement ce
 * qu'on lui demandait.
 *
 * Le 0 % n'est pas un mauvais score, c'est une division par rien. `evaluableDays`
 * est le seul champ qui distingue les deux, donc c'est lui qui décide. Même
 * doctrine que le reste du contrat: `unknown` n'est jamais écrasé en échec par
 * du silence — ici le silence est celui du COACH, pas de l'élève.
 */
export function hasAdherenceNumber(result: WeekAdherenceResult): boolean {
  return result.kind === "adherence" && result.evaluableDays > 0;
}

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
// AXIS 1bis — VIVABILITÉ (PIVOT N4)
// ---------------------------------------------------------------------------

/**
 * Ce que les taps de la semaine disent du protocole.
 *
 * PAS UN SCORE SUR 100. Une note chiffrée serait de la fausse précision sur
 * trois niveaux subjectifs, et de la gamification — bannie (§1.3). Une bande
 * se lit d'un coup d'œil, se compare de semaine en semaine, et surtout mappe
 * sur quelque chose que le coach peut ACTIONNER : une semaine « dure » qui se
 * répète, c'est un protocole à alléger, et c'est lui qui décide.
 */
export const LIVABILITY_BANDS = ["sustainable", "strained", "hard", "unknown"] as const;
export type LivabilityBand = (typeof LIVABILITY_BANDS)[number];

/** Sous ce nombre de taps, on ne prétend rien: 2 jours ne font pas une semaine. */
export const LIVABILITY_MIN_TAPS = 3;

export interface LivabilitySummary {
  band: LivabilityBand;
  taps: number;
  good: number;
  mixed: number;
  hard: number;
  /** L'axe qui lâche le plus souvent. Plus actionnable qu'une moyenne. */
  dominantAxis: string | null;
}

export function summarizeLivability(
  pulses: ReadonlyArray<{ overall: string; axis: string | null }>,
): LivabilitySummary {
  let good = 0, mixed = 0, hard = 0;
  const axisCounts = new Map<string, number>();
  for (const p of pulses) {
    if (p.overall === "good") good++;
    else if (p.overall === "mixed") mixed++;
    else if (p.overall === "hard") hard++;
    if (p.axis) axisCounts.set(p.axis, (axisCounts.get(p.axis) ?? 0) + 1);
  }
  const taps = good + mixed + hard;

  let dominantAxis: string | null = null;
  let best = 0;
  // Tri déterministe sur l'égalité: deux semaines identiques doivent produire
  // le même axe, sinon la synthèse n'est pas une preuve.
  for (const axis of [...axisCounts.keys()].sort()) {
    const n = axisCounts.get(axis) ?? 0;
    if (n > best) {
      best = n;
      dominantAxis = axis;
    }
  }

  if (taps < LIVABILITY_MIN_TAPS) {
    return { band: "unknown", taps, good, mixed, hard, dominantAxis };
  }
  // Un tiers de journées dures suffit à sortir du « soutenable »: on préfère
  // alerter tôt qu'attendre la majorité, parce que le coût d'un faux positif
  // (le coach regarde) est très inférieur au coût d'un décrochage.
  if (hard / taps >= 1 / 3) {
    return { band: "hard", taps, good, mixed, hard, dominantAxis };
  }
  if ((hard + mixed) / taps > 0.5) {
    return { band: "strained", taps, good, mixed, hard, dominantAxis };
  }
  return { band: "sustainable", taps, good, mixed, hard, dominantAxis };
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
   * The `portion_band` COLUMN of every fact logged this week, `null` for facts
   * that carry none (a text log, a tap). Never read from `recognized` jsonb.
   *
   * THIS IS THE PAYOFF OF THE kcal ARBITRATION (P0.0bis). Having refused to
   * show the coach a calorie figure, we owe him an answer to the question the
   * figure was standing in for -- "is this student eating a lot or a little?".
   * Three ordinal bands answer it on ground the model is actually good on
   * (classification), where a kcal estimate answers it on ground it is
   * measurably bad on (regression, -26.6% systematic bias).
   */
  portionBands?: readonly (string | null | undefined)[];
  /**
   * PIVOT N4 — LA VIVABILITÉ. Les taps du soir de la semaine.
   *
   * C'est la métrique qui remplace l'adhérence dans le modèle 1:N. Le coach
   * RECOMMANDE et l'élève DÉCIDE, donc « a-t-il suivi la prescription » n'a
   * plus d'objet — mais « est-ce que ce protocole est tenable pour lui »
   * en a un, et c'est celle sur laquelle un coach peut agir.
   */
  dailyPulses?: ReadonlyArray<{ overall: string; axis: string | null }>;
  /** Combien de lignes l'élève s'était fixées cette semaine, et de quel type. */
  weekPlan?: { nutritionLines: number; actionLines: number; adopted: boolean } | null;
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
  // Rien de prescrit => rien à noter. `watch` et pas `at_risk`: l'élève n'a
  // rien fait de mal, et c'est au coach d'agir (publier le plan).
  if (!hasAdherenceNumber(args.adherence)) return "watch";
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
  /** L'élève logge, mais aucune ligne n'est publiée pour lui. */
  "no_evaluable_plan",
  /** PIVOT N4: le protocole n'est pas tenable pour cette personne. */
  "week_too_hard",
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
  /** PIVOT N4: ce que les taps disent du protocole. */
  livability: LivabilitySummary;
  /** PIVOT N4: ce que l'élève s'était fixé. Null s'il n'a pas fait de plan. */
  weekPlan: { nutritionLines: number; actionLines: number; adopted: boolean } | null;
  /** The week's plate readout. `total: 0` when no photo carried a band. */
  portions: PortionBandSummary;
  /** Rank key: lower sorts first. Deterministic, no ties broken by chance. */
  severity: number;
}

const FLAG_SEVERITY: Readonly<Record<FlagReason, number>> = {
  restriction_signal: 0,
  silent_5d: 1,
  // Juste après le silence: un élève qui logge dans le vide décroche vite, et
  // la correction ne coûte au coach qu'une publication de plan.
  no_evaluable_plan: 2,
  // Juste après: une semaine dure est un signal d'abandon imminent, et la
  // correction (alléger) appartient au coach.
  week_too_hard: 2,
  coverage_below_gate: 3,
  adherence_at_risk: 4,
  outcome_mismatch: 5,
  slipping_contact: 6,
};

function flagFor(line: {
  contact: ContactState;
  adherence: WeekAdherenceResult;
  riskBand: RiskBand;
  livability?: LivabilityBand;
}): FlagReason | null {
  if (line.riskBand === "restriction_flag") return "restriction_signal";
  if (line.contact === "silent") return "silent_5d";
  // PIVOT N4: une semaine dure passe AVANT les motifs d'adhérence — c'est le
  // signal qui prédit l'abandon, et le seul sur lequel le coach peut agir en
  // allégeant. L'adhérence, elle, n'existe plus dans le modèle 1:N.
  if (line.livability === "hard") return "week_too_hard";
  if (line.adherence.kind === "insufficient_data") return "coverage_below_gate";
  if (!hasAdherenceNumber(line.adherence)) return "no_evaluable_plan";
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
  const livability = summarizeLivability(input.dailyPulses ?? []);
  const flagReason = flagFor({
    contact: contact.state,
    adherence,
    riskBand,
    livability: livability.band,
  });
  return {
    studentUserId: input.studentUserId,
    displayName: input.displayName ?? null,
    contact: contact.state,
    hoursSinceContact: contact.hoursSince,
    adherence,
    riskBand,
    flagReason,
    livability,
    weekPlan: input.weekPlan ?? null,
    portions: summarizePortionBands(input.portionBands ?? []),
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
  /**
   * PIVOT N4 — la vivabilité de la cohorte. Combien d'élèves tiennent, combien
   * sont tendus, combien sont en difficulté. C'est ce qui remplace l'adhérence
   * comme chiffre de tête: le coach recommande, donc « ont-ils suivi » n'a plus
   * d'objet, mais « est-ce que mon programme est tenable » en a un.
   */
  livability: { sustainable: number; strained: number; hard: number; unknown: number };
  /** Combien d'élèves se sont fixé un plan cette semaine. */
  planned: number;
  /** Every plate the cohort logged this week, by band. */
  portions: PortionBandSummary;
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

  const withAdherence = lines.filter((l) => hasAdherenceNumber(l.adherence));
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
    livability: {
      sustainable: lines.filter((l) => l.livability.band === "sustainable").length,
      strained: lines.filter((l) => l.livability.band === "strained").length,
      hard: lines.filter((l) => l.livability.band === "hard").length,
      unknown: lines.filter((l) => l.livability.band === "unknown").length,
    },
    planned: lines.filter((l) => l.weekPlan?.adopted).length,
    portions: summarizePortionBands(
      students.flatMap((s) => [...(s.portionBands ?? [])]),
    ),
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

  // PIVOT N4 — LA VIVABILITÉ EN DEUXIÈME, JUSTE APRÈS LE CONTACT.
  //
  // Elle prend la place qu'occupait l'adhérence. Dans le modèle 1:N le coach
  // RECOMMANDE et l'élève DÉCIDE: « ont-ils suivi ma prescription » n'a plus
  // d'objet, alors que « est-ce que mon programme est tenable » en a un — et
  // c'est le seul chiffre sur lequel un coach peut agir en allégeant.
  const liv = m.livability;
  const rated = liv.sustainable + liv.strained + liv.hard;
  if (rated > 0) {
    const parts: string[] = [];
    if (liv.sustainable > 0) parts.push(`${liv.sustainable} holding up`);
    if (liv.strained > 0) parts.push(`${liv.strained} strained`);
    if (liv.hard > 0) parts.push(`${liv.hard} having a hard time`);
    out.push(`How the week felt: ${parts.join(", ")}.`);
  } else {
    out.push("Nobody checked in enough this week to say how it felt.");
  }

  if (m.planned > 0) {
    out.push(
      `${m.planned} of ${m.studentCount} set themselves a plan for the week.`,
    );
  }

  if (m.meanCoreAdherencePct !== null) {
    out.push(
      `Average adherence on core lines: ${m.meanCoreAdherencePct}% ` +
        `(${m.withAdherence} of ${m.studentCount} logged enough for a number).`,
    );
  } else {
    // The gate, stated rather than filled with a fake average — AND stated
    // with the RIGHT reason. Saying "nobody logged 4 of 7 days" to a coach
    // whose student logged 5 is a false statement in the one artefact whose
    // whole value is that its numbers can be trusted. The two causes are
    // distinguishable (`no_evaluable_plan` vs `coverage_below_gate`), so they
    // are distinguished.
    const noPlan = synthesis.lines.filter((l) => l.flagReason === "no_evaluable_plan").length;
    if (noPlan > 0 && noPlan === m.studentCount) {
      out.push(
        "No adherence figure this week: no plan lines are published for " +
          (m.studentCount === 1 ? "this student" : "these students") + " yet.",
      );
    } else if (noPlan > 0) {
      const others = m.studentCount - noPlan;
      out.push(
        `No adherence figure this week: ${noPlan} of ${m.studentCount} students ` +
          `${noPlan === 1 ? "has" : "have"} no published plan, and ` +
          `${others === 1 ? "the other logged" : "the others logged"} fewer than ` +
          `${LOGGING_COVERAGE_MIN_DAYS} of 7 days.`,
      );
    } else {
      out.push(
        `No adherence figure this week: nobody logged at least ` +
          `${LOGGING_COVERAGE_MIN_DAYS} of 7 days.`,
      );
    }
  }

  // The plate readout. Third, per PHOTO_QUANTIFICATION.md 5: coverage first
  // (the metric that predicts outcome), adherence second, portions third.
  // Emitted only when plates were actually seen -- "0 plates: 0 small" is
  // noise dressed as data.
  const p = m.portions;
  if (p.total > 0) {
    out.push(
      `${p.total} plate${p.total === 1 ? "" : "s"} seen: ` +
        `${p.small} small, ${p.moderate} moderate, ${p.large} large` +
        (p.unclear > 0 ? `, ${p.unclear} unclear` : "") + ".",
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
    case "week_too_hard":
      // Nommé côté COACH: l'action est d'alléger, et elle est la sienne.
      return line.livability.dominantAxis
        ? `${line.livability.hard} hard days out of ${line.livability.taps} - it is ${line.livability.dominantAxis} that keeps giving way.`
        : `${line.livability.hard} hard days out of ${line.livability.taps} this week.`;
    case "no_evaluable_plan":
      // Nommé côté COACH, parce que l'action est la sienne.
      return "is logging, but has no published plan lines to log against - publish their plan and this becomes measurable.";
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
      core_adherence_pct: hasAdherenceNumber(line.adherence) &&
          line.adherence.kind === "adherence"
        ? line.adherence.corePct
        : null,
      // Explicit, so a reader of the row never has to infer why a percentage is
      // missing: absent-because-gated and absent-because-bug look identical
      // otherwise.
      adherence_gated: !hasAdherenceNumber(line.adherence),
      evaluable_days: line.adherence.kind === "adherence"
        ? line.adherence.evaluableDays
        : 0,
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
    portions: {
      total: m.portions.total,
      small: m.portions.small,
      moderate: m.portions.moderate,
      large: m.portions.large,
      unclear: m.portions.unclear,
      decidable: m.portions.decidable,
    },
    flagged_count: synthesis.flagged.length,
    // A cap that truncates must say so, or the list reads as "everything".
    flagged_total_before_cap: synthesis.lines.filter((l) => l.flagReason !== null).length,
  };
}
