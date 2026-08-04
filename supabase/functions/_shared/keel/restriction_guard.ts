/**
 * KEEL — restriction guard (disordered-eating floor).
 *
 * Authority: docs/keel/CONTRACT.md, docs/keel/BUILD_PLAN.md W3.2.
 *
 * WHY THIS MODULE EXISTS
 * ----------------------
 * The central product loop of KEEL — a prescribed food plan, a derived
 * adherence score, and a daily nudge — is, verbatim, category-1 risk in the
 * CDT/Stanford report on AI and eating disorders. The NEDA "Tessa" chatbot was
 * pulled after handing weight-loss advice to people in treatment. A plan
 * runtime that keeps pushing compliance at someone who is restricting is not a
 * degraded experience: it is the harm.
 *
 * So this floor is DETERMINISTIC and sits UNDER the model, never beside it:
 *
 *   - Pure function. Zero I/O, zero imports, zero network, zero env. The caller
 *     assembles a snapshot from the DB and passes it in; nothing here can be
 *     talked out of its conclusion because there is nothing here to talk to.
 *   - No suppression input exists. There is no `override`, no `confidence`, no
 *     `llm_assessment` parameter — by construction, not by convention. Unknown
 *     keys on the snapshot are ignored. A model cannot lower this floor because
 *     the floor does not read models.
 *   - Thresholds are frozen constants, exported so tests pin them.
 *   - R7 everywhere: incoherent data THROWS. A snapshot with a negative weight,
 *     a duplicated day or a non-weekly series is a caller bug, and a guard that
 *     quietly returns `restriction_flag: false` on broken input is worse than
 *     no guard at all — it is a guard that reports safe.
 *
 * WHAT IT DOES NOT DO
 * -------------------
 * It does not diagnose. `restriction_flag` is a routing and suppression signal:
 * stop the adherence pressure, escalate to the human coach, hand the turn to
 * the `disordered_eating_guard` skill. The AI escalates, the coach decides
 * (CONTRACT doctrine) — and here, a clinician decides after that.
 */

// ---------------------------------------------------------------------------
// Version + vocabulary (R1: ASCII snake_case English tokens)
// ---------------------------------------------------------------------------

export const RESTRICTION_GUARD_VERSION = "restriction_guard.v1";

export const RESTRICTION_TRIGGER_CODES = [
  /** Weight loss faster than the safe ceiling over a rolling 2-week window. */
  "rapid_weight_loss",
  /** >= 3 consecutive days of observed energy far under the prescribed target. */
  "energy_deficit_streak",
  /** Compensatory vocabulary in a student note or in the current turn. */
  "compensatory_language",
  /** High self-rated adherence + near-zero logging + accelerating loss. */
  "overclaimed_adherence_with_hidden_logging",
] as const;

export type RestrictionTriggerCode = (typeof RESTRICTION_TRIGGER_CODES)[number];

/**
 * BUILD_PLAN W3.2 thresholds, frozen. Exported so tests pin the numbers and so
 * a future change is a visible product decision, not a silent edit at a call
 * site (the failure mode that killed `time_of_day` in the legacy codebase).
 */
export const RESTRICTION_THRESHOLDS = Object.freeze({
  /** > 1.2 %/week averaged over the window is the ceiling. */
  max_weekly_loss_pct: 1.2,
  /** The window is 2 weeks: one bad week is noise, two is a trajectory. */
  loss_window_days: 14,
  /** Observed energy under target - 25 % counts as a deficit day. */
  energy_deficit_pct: 25,
  /** 3 consecutive deficit days. */
  energy_deficit_consecutive_days: 3,
  /** self_rated_adherence >= 8 ... */
  overclaimed_self_rating_min: 8,
  /** ... while fewer than 3 of 7 days were logged ... */
  hidden_logging_max_days: 3,
  /** ... and the latest weekly loss both rises AND clears this floor. */
  accelerated_loss_min_weekly_pct: 1.0,
});

/**
 * Student-facing surfaces that a raised flag SUSPENDS. Adherence pressure is
 * not just the nudge: the score itself is pressure, and a weight or calorie
 * readout is pressure with a number on it.
 */
export const SUPPRESSED_STUDENT_SURFACES = Object.freeze([
  "adherence_score",
  "adherence_percentage",
  "coverage_percentage",
  "compliance_reminder",
  "streak_display",
  "weekly_score_digest",
  "weight_readout",
  "calorie_readout",
  "plan_pressure_nudge",
] as const);

export type SuppressedStudentSurface =
  (typeof SUPPRESSED_STUDENT_SURFACES)[number];

// ---------------------------------------------------------------------------
// Snapshot (input) — assembled by the caller from the DB, never by this module
// ---------------------------------------------------------------------------

/** One row of `weekly_reviews`, reduced to what the floor reads. */
export type WeeklyOutcomeSample = {
  /** `weekly_reviews.week_start_date`, YYYY-MM-DD. */
  week_start_date: string;
  /** `outcomes.weight_7d_avg` in kg (R4: SI storage). `null` = not reported. */
  weight_7d_avg_kg: number | null;
  /** `weekly_reviews.self_rated_adherence`, integer 0..10, or null. */
  self_rated_adherence: number | null;
  /**
   * Days logged that week as an INTEGER 0..7 — deliberately not the raw
   * `logging_coverage` numeric, whose "0.42 or 3?" ambiguity is exactly the
   * two-normalizations-that-disagree bug R7 forbids. The caller converts once,
   * loudly, and this module refuses anything that is not a whole day count.
   */
  logging_coverage_days: number | null;
};

/** One day of `commitment_evaluations` for an `energy` commitment. */
export type EnergyDaySample = {
  /** `commitment_evaluations.local_date`, YYYY-MM-DD. */
  local_date: string;
  /** Prescribed target for that day (`expected` snapshot), kcal, > 0. */
  target_kcal: number;
  /**
   * Observed intake, kcal. `null` = UNKNOWN and is never read as a deficit —
   * `unknown` is first-class and excluded from denominators (CONTRACT). A day
   * nobody logged is not a day of restriction.
   */
  observed_kcal: number | null;
};

/** A piece of student prose to scan: a `student_note` or the current turn. */
export type StudentTextSample = {
  source: "protocol_event_student_note" | "turn_message";
  text: string;
  /** R2/R3: prose carries the language it was written in. */
  content_locale: string;
};

export type RestrictionSnapshot = {
  /** The local date the evaluation is anchored on, YYYY-MM-DD. */
  as_of_local_date: string;
  /** Ascending by `week_start_date`, gaps allowed, duplicates are a bug. */
  weekly_outcomes: WeeklyOutcomeSample[];
  /** Ascending by `local_date`, gaps allowed, duplicates are a bug. */
  energy_days: EnergyDaySample[];
  /** Student notes + the current turn message. */
  texts: StudentTextSample[];
};

// ---------------------------------------------------------------------------
// Result (output)
// ---------------------------------------------------------------------------

export type RestrictionEvidence = Record<
  string,
  string | number | boolean | string[]
>;

export type RestrictionTrigger = {
  code: RestrictionTriggerCode;
  /** Structured, coach-readable. Numbers live HERE, never on a student surface. */
  evidence: RestrictionEvidence;
};

export type RestrictionGuardResult = {
  guard_version: typeof RESTRICTION_GUARD_VERSION;
  restriction_flag: boolean;
  /** Ordered by RESTRICTION_TRIGGER_CODES; empty iff the flag is down. */
  triggers: RestrictionTrigger[];
  evaluated_for_date: string;
};

// ---------------------------------------------------------------------------
// R7 machinery — every check below throws; none of them degrades to `false`
// ---------------------------------------------------------------------------

function fail(message: string): never {
  throw new Error(`[keel/restriction_guard] ${message}`);
}

/** Strict YYYY-MM-DD; returns whole days since the epoch (UTC, no DST math). */
function parseIsoDateToDays(value: unknown, field: string): number {
  const raw = String(value ?? "");
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) fail(`${field} is not YYYY-MM-DD: ${JSON.stringify(value)}`);
  const [, y, m, d] = match!;
  const utc = Date.UTC(Number(y), Number(m) - 1, Number(d));
  const back = new Date(utc);
  if (
    back.getUTCFullYear() !== Number(y) ||
    back.getUTCMonth() !== Number(m) - 1 ||
    back.getUTCDate() !== Number(d)
  ) {
    fail(`${field} is not a real calendar date: ${JSON.stringify(value)}`);
  }
  return Math.round(utc / 86_400_000);
}

function assertFinite(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${field} must be a finite number, got ${JSON.stringify(value)}`);
  }
  return value as number;
}

function assertIntegerInRange(
  value: unknown,
  field: string,
  min: number,
  max: number,
): number {
  const n = assertFinite(value, field);
  if (!Number.isInteger(n) || n < min || n > max) {
    fail(`${field} must be an integer in [${min}, ${max}], got ${n}`);
  }
  return n;
}

function assertArray<T>(value: unknown, field: string): T[] {
  if (!Array.isArray(value)) {
    fail(`${field} must be an array, got ${JSON.stringify(value)}`);
  }
  return value as T[];
}

/**
 * Plausible human body mass in kg. A 0, a negative, or a value that is clearly
 * pounds-mislabelled-as-kg must fail the guard rather than silently produce a
 * loss percentage out of a unit bug (R4: display units are a separate axis;
 * storage is SI, and this module only ever sees SI).
 */
const MIN_PLAUSIBLE_WEIGHT_KG = 20;
const MAX_PLAUSIBLE_WEIGHT_KG = 500;

// ---------------------------------------------------------------------------
// Normalization of the snapshot (all validation happens up front, loudly)
// ---------------------------------------------------------------------------

type NormalizedWeek = {
  weekStartDays: number;
  weekStartDate: string;
  weightKg: number | null;
  selfRated: number | null;
  loggedDays: number | null;
};

function normalizeWeeks(input: unknown): NormalizedWeek[] {
  const rows = assertArray<WeeklyOutcomeSample>(input, "weekly_outcomes");
  const out: NormalizedWeek[] = [];
  rows.forEach((row, index) => {
    const field = `weekly_outcomes[${index}]`;
    if (!row || typeof row !== "object") fail(`${field} must be an object`);
    const weekStartDays = parseIsoDateToDays(
      row.week_start_date,
      `${field}.week_start_date`,
    );
    let weightKg: number | null = null;
    if (row.weight_7d_avg_kg !== null && row.weight_7d_avg_kg !== undefined) {
      weightKg = assertFinite(row.weight_7d_avg_kg, `${field}.weight_7d_avg_kg`);
      if (
        weightKg < MIN_PLAUSIBLE_WEIGHT_KG || weightKg > MAX_PLAUSIBLE_WEIGHT_KG
      ) {
        fail(
          `${field}.weight_7d_avg_kg = ${weightKg} is outside the plausible ` +
            `range [${MIN_PLAUSIBLE_WEIGHT_KG}, ${MAX_PLAUSIBLE_WEIGHT_KG}] kg ` +
            `(unit bug? storage is SI kg)`,
        );
      }
    }
    const selfRated =
      row.self_rated_adherence === null || row.self_rated_adherence === undefined
        ? null
        : assertIntegerInRange(
          row.self_rated_adherence,
          `${field}.self_rated_adherence`,
          0,
          10,
        );
    const loggedDays = row.logging_coverage_days === null ||
        row.logging_coverage_days === undefined
      ? null
      : assertIntegerInRange(
        row.logging_coverage_days,
        `${field}.logging_coverage_days`,
        0,
        7,
      );
    out.push({
      weekStartDays,
      weekStartDate: row.week_start_date,
      weightKg,
      selfRated,
      loggedDays,
    });
  });

  for (let i = 1; i < out.length; i++) {
    const gap = out[i].weekStartDays - out[i - 1].weekStartDays;
    if (gap === 0) {
      fail(
        `weekly_outcomes has a duplicate week_start_date ` +
          `${out[i].weekStartDate}`,
      );
    }
    if (gap < 0) {
      fail(
        `weekly_outcomes must be ascending by week_start_date ` +
          `(${out[i - 1].weekStartDate} then ${out[i].weekStartDate})`,
      );
    }
    if (gap % 7 !== 0) {
      fail(
        `weekly_outcomes is not a weekly series: ${gap} days between ` +
          `${out[i - 1].weekStartDate} and ${out[i].weekStartDate}`,
      );
    }
  }
  return out;
}

type NormalizedEnergyDay = {
  dateDays: number;
  localDate: string;
  targetKcal: number;
  observedKcal: number | null;
};

function normalizeEnergyDays(input: unknown): NormalizedEnergyDay[] {
  const rows = assertArray<EnergyDaySample>(input, "energy_days");
  const out: NormalizedEnergyDay[] = [];
  rows.forEach((row, index) => {
    const field = `energy_days[${index}]`;
    if (!row || typeof row !== "object") fail(`${field} must be an object`);
    const dateDays = parseIsoDateToDays(row.local_date, `${field}.local_date`);
    const targetKcal = assertFinite(row.target_kcal, `${field}.target_kcal`);
    if (targetKcal <= 0) {
      fail(`${field}.target_kcal must be > 0, got ${targetKcal}`);
    }
    let observedKcal: number | null = null;
    if (row.observed_kcal !== null && row.observed_kcal !== undefined) {
      observedKcal = assertFinite(row.observed_kcal, `${field}.observed_kcal`);
      if (observedKcal < 0) {
        fail(`${field}.observed_kcal must be >= 0, got ${observedKcal}`);
      }
    }
    out.push({ dateDays, localDate: row.local_date, targetKcal, observedKcal });
  });

  for (let i = 1; i < out.length; i++) {
    const gap = out[i].dateDays - out[i - 1].dateDays;
    if (gap === 0) {
      fail(`energy_days has a duplicate local_date ${out[i].localDate}`);
    }
    if (gap < 0) {
      fail(
        `energy_days must be ascending by local_date ` +
          `(${out[i - 1].localDate} then ${out[i].localDate})`,
      );
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// TRIGGER 1 — rapid weight loss over a rolling 2-week window
// ---------------------------------------------------------------------------

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function weeklyLossPct(
  from: NormalizedWeek,
  to: NormalizedWeek,
): number | null {
  if (from.weightKg === null || to.weightKg === null) return null;
  const weeks = (to.weekStartDays - from.weekStartDays) / 7;
  if (weeks <= 0) return null;
  return ((from.weightKg - to.weightKg) / from.weightKg) * 100 / weeks;
}

function detectRapidWeightLoss(
  weeks: NormalizedWeek[],
): RestrictionTrigger | null {
  const windowDays = RESTRICTION_THRESHOLDS.loss_window_days;
  let worst: { from: NormalizedWeek; to: NormalizedWeek; pct: number } | null =
    null;
  // Rolling: EVERY pair exactly one window apart, not just the latest one. A
  // window that already breached and then flattened still deserves the flag.
  for (const from of weeks) {
    for (const to of weeks) {
      if (to.weekStartDays - from.weekStartDays !== windowDays) continue;
      const pct = weeklyLossPct(from, to);
      if (pct === null) continue;
      if (worst === null || pct > worst.pct) worst = { from, to, pct };
    }
  }
  if (worst === null) return null;
  if (worst.pct <= RESTRICTION_THRESHOLDS.max_weekly_loss_pct) return null;
  return {
    code: "rapid_weight_loss",
    evidence: {
      window_start_week: worst.from.weekStartDate,
      window_end_week: worst.to.weekStartDate,
      window_days: windowDays,
      weekly_loss_pct: round2(worst.pct),
      threshold_weekly_loss_pct: RESTRICTION_THRESHOLDS.max_weekly_loss_pct,
    },
  };
}

// ---------------------------------------------------------------------------
// TRIGGER 2 — >= 3 consecutive days of observed energy under target - 25 %
// ---------------------------------------------------------------------------

function detectEnergyDeficitStreak(
  days: NormalizedEnergyDay[],
): RestrictionTrigger | null {
  const floorRatio = 1 - RESTRICTION_THRESHOLDS.energy_deficit_pct / 100;
  const needed = RESTRICTION_THRESHOLDS.energy_deficit_consecutive_days;
  let streak: NormalizedEnergyDay[] = [];
  let best: NormalizedEnergyDay[] = [];
  for (const day of days) {
    // `unknown` never counts as a deficit AND never bridges a streak: we
    // cannot claim three CONSECUTIVE days through a day nobody observed.
    const isDeficit = day.observedKcal !== null &&
      day.observedKcal < day.targetKcal * floorRatio;
    const contiguous = streak.length > 0 &&
      day.dateDays - streak[streak.length - 1].dateDays === 1;
    streak = isDeficit ? (contiguous ? [...streak, day] : [day]) : [];
    if (streak.length > best.length) best = streak;
  }
  if (best.length < needed) return null;
  return {
    code: "energy_deficit_streak",
    evidence: {
      streak_start_date: best[0].localDate,
      streak_end_date: best[best.length - 1].localDate,
      consecutive_days: best.length,
      required_consecutive_days: needed,
      deficit_threshold_pct: RESTRICTION_THRESHOLDS.energy_deficit_pct,
      observed_ratios_pct: best.map((d) =>
        String(round2((d.observedKcal as number) / d.targetKcal * 100))
      ),
    },
  };
}

// ---------------------------------------------------------------------------
// TRIGGER 3 — compensatory vocabulary (EN + FR)
// ---------------------------------------------------------------------------

/**
 * Diacritic-folding lowercase normalizer. Everything that is not a letter or a
 * digit becomes a space, so "didn't", "n'ai" and "jeûner" collapse to
 * "didn t", "n ai" and "jeuner" — which is why every pattern below is written
 * in folded ASCII and why an accent can never be used to slip past the floor.
 */
function foldText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

type CompensatoryPattern = {
  /** R1: ASCII snake_case token, this is data (it lands in the evidence). */
  token: string;
  tier: "strong" | "contextual";
  pattern: RegExp;
};

/**
 * Two tiers, on purpose.
 *
 * `strong` phrases are compensatory on their own terms and match unconditionally
 * (purging, earning food, deserving food).
 *
 * `contextual` phrases are the ones BUILD_PLAN names as bare tokens — `skip`,
 * `make up for`, `burn off`, `compensate` — and they are ambiguous in ordinary
 * speech ("skip the intro", "I burned 400 kcal on the bike"). They require an
 * eating/compensation object in the phrase itself. This is a deliberate
 * tightening against false positives, and it is the piece with a real
 * false-negative cost, so it is tested in both directions: the compensatory
 * sentence must trip, the innocent homonym must not.
 */
const COMPENSATORY_PATTERNS: readonly CompensatoryPattern[] = [
  {
    token: "purge",
    tier: "strong",
    // `purge` fires on its own; the ONLY exclusions are objects that cannot be
    // a body ("purge my inbox"). The list is deliberately short and literal:
    // when in doubt the guard fires, because one extra clinical turn plus one
    // coach escalation is a cheap error and the other direction is not.
    pattern:
      /\b(purge|purged|purging)\b(?!\s+(my |the |our |his |her |their )?(inbox|mailbox|email|emails|cache|caches|log|logs|list|lists|contacts|photos|files|folder|folders|feed|browser|closet|wardrobe|drawer|garage))|\b(throw up|throwing up|threw up|make myself sick|made myself sick|vomir|vomi|faire vomir)\b/,
  },
  {
    token: "did_not_deserve_food",
    tier: "strong",
    pattern:
      /\b(didn t deserve|did not deserve|don t deserve|do not deserve|didnt deserve|pas merite|merite pas|meritais pas)\b/,
  },
  {
    token: "earn_my_food",
    tier: "strong",
    pattern:
      /\b(earn|earned|earning|earns)\s+(my\s+)?(food|meal|meals|dinner|lunch|breakfast|calories|carbs|my dinner|my lunch)\b/,
  },
  {
    token: "fast_to_compensate",
    tier: "strong",
    pattern:
      /\b(fast|fasting|fasted)\s+(to|and)\s+(compensate|make up|balance it out|cancel it out)\b|\bjeuner pour compenser\b|\bne rien manger (de la journee|demain|aujourd hui)\b/,
  },
  {
    token: "skip_meal",
    tier: "contextual",
    pattern:
      /\b(skip|skipped|skipping|skips)\s+(a |the |my |todays |tomorrows )?(meal|meals|breakfast|lunch|dinner|snack|snacks|food|eating|dinners|lunches)\b|\bsaut\w*\s+(le |un |mon |des |les )?(repas|petit dejeuner|dejeuner|diner|gouter)\b/,
  },
  {
    token: "make_up_for_eating",
    tier: "contextual",
    pattern:
      /\b(make up for|making up for|made up for|makes up for)\s+(it|that|this|yesterday|tonight|last night|the weekend|dinner|lunch|breakfast|the meal|my meal|eating|what i ate|the calories)\b|\b(rattraper|compenser)\s+(ce |cet |le |la |les |mon |ma |mes )?(repas|ecart|exces|diner|dejeuner|gouter|calories|hier soir)\b/,
  },
  {
    token: "burn_off_food",
    tier: "contextual",
    pattern:
      /\b(burn|burned|burnt|burning|work|worked|working)\s+(it|that|this|them|the meal|dinner|lunch|breakfast|the calories|what i ate)\s+off\b|\bburn off\s+(the |that |this |my )?(meal|dinner|lunch|breakfast|calories|food|what i ate)\b|\b(bruler|eliminer)\s+(ce |le |les |mon )?(repas|calories|diner|dejeuner|ecart)\b/,
  },
  {
    token: "compensate_for_eating",
    tier: "contextual",
    pattern:
      /\bcompensate\s+(for\s+)?(it|that|this|eating|the meal|dinner|lunch|breakfast|yesterday|the calories|what i ate)\b/,
  },
];

function detectCompensatoryLanguage(
  texts: StudentTextSample[],
): RestrictionTrigger | null {
  const rows = assertArray<StudentTextSample>(texts, "texts");
  const hits: string[] = [];
  const sources = new Set<string>();
  rows.forEach((row, index) => {
    const field = `texts[${index}]`;
    if (!row || typeof row !== "object") fail(`${field} must be an object`);
    if (
      row.source !== "protocol_event_student_note" &&
      row.source !== "turn_message"
    ) {
      fail(`${field}.source is not a known source: ${JSON.stringify(row.source)}`);
    }
    if (typeof row.text !== "string") {
      fail(`${field}.text must be a string`);
    }
    // R2: prose without its locale is exactly the "guess the language a
    // posteriori" column the contract forbids. Refuse it at the boundary.
    if (typeof row.content_locale !== "string" || row.content_locale.trim() === "") {
      fail(`${field}.content_locale is required (R2) for prose`);
    }
    const folded = foldText(row.text);
    if (folded === "") return;
    for (const candidate of COMPENSATORY_PATTERNS) {
      if (candidate.pattern.test(folded)) {
        if (!hits.includes(candidate.token)) hits.push(candidate.token);
        sources.add(row.source);
      }
    }
  });
  if (hits.length === 0) return null;
  return {
    code: "compensatory_language",
    evidence: {
      matched_tokens: hits,
      sources: [...sources].sort(),
    },
  };
}

// ---------------------------------------------------------------------------
// TRIGGER 4 — overclaimed adherence + hidden logging + accelerating loss
// ---------------------------------------------------------------------------

function detectOverclaimedAdherence(
  weeks: NormalizedWeek[],
): RestrictionTrigger | null {
  if (weeks.length < 3) return null; // needs two consecutive weekly rates
  const latest = weeks[weeks.length - 1];
  if (
    latest.selfRated === null ||
    latest.selfRated < RESTRICTION_THRESHOLDS.overclaimed_self_rating_min
  ) return null;
  if (
    latest.loggedDays === null ||
    latest.loggedDays >= RESTRICTION_THRESHOLDS.hidden_logging_max_days
  ) return null;

  // "Accelerated loss": the latest one-week rate is BOTH higher than the
  // preceding one-week rate AND above the floor. The floor sits below the
  // trigger-1 ceiling on purpose — this pattern (says 8/10, logs almost
  // nothing, is losing faster every week) is the concealment case, and it must
  // fire before the raw rate alone would.
  const previous = weeks[weeks.length - 2];
  const beforeThat = weeks[weeks.length - 3];
  const latestRate = weeklyLossPct(previous, latest);
  const previousRate = weeklyLossPct(beforeThat, previous);
  if (latestRate === null || previousRate === null) return null;
  if (latestRate <= previousRate) return null;
  if (latestRate < RESTRICTION_THRESHOLDS.accelerated_loss_min_weekly_pct) {
    return null;
  }
  return {
    code: "overclaimed_adherence_with_hidden_logging",
    evidence: {
      week: latest.weekStartDate,
      self_rated_adherence: latest.selfRated,
      logged_days: latest.loggedDays,
      required_logged_days_below: RESTRICTION_THRESHOLDS.hidden_logging_max_days,
      previous_weekly_loss_pct: round2(previousRate),
      latest_weekly_loss_pct: round2(latestRate),
      acceleration_floor_pct:
        RESTRICTION_THRESHOLDS.accelerated_loss_min_weekly_pct,
    },
  };
}

// ---------------------------------------------------------------------------
// The floor
// ---------------------------------------------------------------------------

/**
 * Evaluates the four W3.2 triggers over a snapshot. Pure, total on valid input,
 * loud on invalid input.
 *
 * Disarmed by construction when the premise is false: an empty snapshot, a
 * short series, or a series with no observed values yields
 * `restriction_flag: false` with zero triggers. Nothing in the flow is armed by
 * absence of data — silence is never read as a symptom, which is the mirror
 * image of the CONTRACT rule that silence is never read as compliance.
 */
export function evaluateRestrictionGuard(
  snapshot: RestrictionSnapshot,
): RestrictionGuardResult {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    fail("snapshot must be an object");
  }
  const evaluatedForDate = String(snapshot.as_of_local_date ?? "");
  parseIsoDateToDays(evaluatedForDate, "as_of_local_date");

  const weeks = normalizeWeeks(snapshot.weekly_outcomes);
  const energyDays = normalizeEnergyDays(snapshot.energy_days);

  const triggers: RestrictionTrigger[] = [];
  const rapid = detectRapidWeightLoss(weeks);
  if (rapid) triggers.push(rapid);
  const streak = detectEnergyDeficitStreak(energyDays);
  if (streak) triggers.push(streak);
  const language = detectCompensatoryLanguage(snapshot.texts);
  if (language) triggers.push(language);
  const overclaimed = detectOverclaimedAdherence(weeks);
  if (overclaimed) triggers.push(overclaimed);

  return {
    guard_version: RESTRICTION_GUARD_VERSION,
    restriction_flag: triggers.length > 0,
    triggers,
    evaluated_for_date: evaluatedForDate,
  };
}

// ---------------------------------------------------------------------------
// The effect of a raised flag
// ---------------------------------------------------------------------------

/**
 * The `contract_change_requests` row a raised flag produces. `restriction_signal`
 * is one of the two reason codes allowed to carry `urgency='immediate'` and skip
 * the weekly digest (SCHEMA DIALOGUE); the coach hears about this today, not on
 * Sunday.
 */
export type RestrictionContractChangeRequest = {
  user_id: string;
  plan_version_id: string | null;
  commitment_id: null;
  raised_by: "system";
  reason_code: "restriction_signal";
  urgency: "immediate";
  bypasses_digest: true;
  student_words: string | null;
  sophia_summary: string;
  sophia_evidence: {
    guard_version: string;
    evaluated_for_date: string;
    triggers: RestrictionTrigger[];
  };
  /** Not even a draft: the AI proposes nothing about a restriction signal. */
  suggested_option: null;
  status: "open";
  content_locale: "en";
};

export type RestrictionEffect = {
  guard_version: string;
  adherence_pressure_suspended: true;
  suppressed_student_surfaces: readonly SuppressedStudentSurface[];
  forced_conversation_skill_id: "disordered_eating_guard";
  contract_change_request: RestrictionContractChangeRequest;
};

const TRIGGER_SUMMARY: Record<RestrictionTriggerCode, string> = {
  rapid_weight_loss: "weight loss above the safe weekly ceiling over two weeks",
  energy_deficit_streak:
    "three or more consecutive days of intake far below the prescribed target",
  compensatory_language:
    "compensatory language in the student's own words (skipping, purging, earning or burning off food)",
  overclaimed_adherence_with_hidden_logging:
    "high self-rated adherence reported alongside near-absent logging and accelerating loss",
};

/**
 * Produces the effect of a raised flag: adherence pressure OFF, every scored or
 * numeric student surface suppressed, the turn handed to the clinical skill, and
 * one immediate escalation to the human coach outside the digest.
 *
 * Throws when the flag is down (R7): building a suspension out of a clear result
 * would let a caller fabricate the state, and building one from a snapshot that
 * was never evaluated would let a caller fabricate the evidence.
 *
 * The evidence carries the NUMBERS — that is deliberate. The coach needs them;
 * the student must not see them (`SUPPRESSED_STUDENT_SURFACES`), and the
 * conversational skill is forbidden from discussing them at all.
 */
export function restrictionEffect(
  result: RestrictionGuardResult,
  args: {
    user_id: string;
    plan_version_id?: string | null;
    /** Verbatim student words, citable, when the trigger came from prose. */
    student_words?: string | null;
  },
): RestrictionEffect {
  if (!result || typeof result !== "object") fail("result must be an object");
  if (result.guard_version !== RESTRICTION_GUARD_VERSION) {
    fail(
      `result.guard_version ${JSON.stringify(result.guard_version)} is not ` +
        `${RESTRICTION_GUARD_VERSION} — refusing to build an effect from a ` +
        `result this module did not produce`,
    );
  }
  if (result.restriction_flag !== true || result.triggers.length === 0) {
    fail(
      "restrictionEffect called on a result with no raised flag — the " +
        "suspension state is derived from triggers, never asserted by a caller",
    );
  }
  const userId = String(args?.user_id ?? "").trim();
  if (userId === "") fail("args.user_id is required");

  const reasons = result.triggers.map((t) => TRIGGER_SUMMARY[t.code]);
  const sophiaSummary =
    "Restriction signal raised by the deterministic guard: " +
    reasons.join("; ") +
    ". Adherence pressure is suspended for this student (no score, no " +
    "compliance reminder, no numbers shown) until you review this.";

  return {
    guard_version: RESTRICTION_GUARD_VERSION,
    adherence_pressure_suspended: true,
    suppressed_student_surfaces: SUPPRESSED_STUDENT_SURFACES,
    forced_conversation_skill_id: "disordered_eating_guard",
    contract_change_request: {
      user_id: userId,
      plan_version_id: args.plan_version_id ?? null,
      commitment_id: null,
      raised_by: "system",
      reason_code: "restriction_signal",
      urgency: "immediate",
      bypasses_digest: true,
      student_words: args.student_words ?? null,
      sophia_summary: sophiaSummary,
      sophia_evidence: {
        guard_version: result.guard_version,
        evaluated_for_date: result.evaluated_for_date,
        triggers: result.triggers,
      },
      suggested_option: null,
      status: "open",
      content_locale: "en",
    },
  };
}

/**
 * Render-side floor. Every student-facing surface asks this before emitting.
 * Throws rather than returning false: a suppressed surface that ships because a
 * caller ignored a boolean is the whole failure mode, and a thrown error is the
 * only version of it that cannot be ignored (R7).
 */
export function assertStudentSurfaceAllowed(
  result: RestrictionGuardResult,
  surface: string,
): void {
  if (!result || result.restriction_flag !== true) return;
  if ((SUPPRESSED_STUDENT_SURFACES as readonly string[]).includes(surface)) {
    fail(
      `student surface '${surface}' is suspended while restriction_flag is ` +
        `raised (triggers: ${result.triggers.map((t) => t.code).join(", ")})`,
    );
  }
}

/** Non-throwing companion for callers assembling a surface list up front. */
export function allowedStudentSurfaces(
  result: RestrictionGuardResult,
  surfaces: readonly string[],
): string[] {
  if (!result || result.restriction_flag !== true) return [...surfaces];
  return surfaces.filter(
    (s) => !(SUPPRESSED_STUDENT_SURFACES as readonly string[]).includes(s),
  );
}
