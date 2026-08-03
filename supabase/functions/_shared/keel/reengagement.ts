/**
 * PIVOT NUTRITION §1.3 — la boucle REMARQUER: the decision to reach out to a
 * student who has gone quiet.
 *
 * "C'est la boucle qui sauve le jour 9 — celle pour laquelle le coach paie."
 * Everything else in the product can be rebuilt from the coach's protocol. This
 * cannot: it is the only part that acts when nobody is asking for anything.
 *
 * ── THE THRESHOLD, AND WHY IT IS NOT 48h ─────────────────────────────────
 * PLAN-NUIT §1.3 says "48-72h de silence → relance douce". This module fires at
 * 72h, and the divergence is deliberate and sourced.
 *
 * `_shared/whatsapp_winback.ts` carries a production lesson, in a comment
 * written when the thresholds were moved from 2/5/9 to 3/6/10 days:
 *
 *   "À 2 jours on relançait encore dans la variance d'un rythme normal ;
 *    à 3 jours le décrochage est un vrai signal."
 *
 * That is measured behaviour from this product's own users, and 48h is inside
 * the variance it names. A relance that fires inside normal rhythm is not a
 * gentle relance — it is the app being needy, on day 2, at which point the
 * student learns that silence gets pinged and the signal is burnt for day 9.
 * We keep the plan's INTENT (catch the slide early, once, gently) and the
 * repo's measured THRESHOLD. Flagged for Thomas in STATUS-MORNING.
 *
 * ── THE PROPERTY THAT MATTERS MORE THAN THE THRESHOLD ────────────────────
 * ONE nudge per episode of silence. §7.4 J4-J5 asserts it as "UNE seule ...
 * pas de spam". Two nudges into silence is how a student who was merely busy
 * becomes a student who mutes the thread — and a muted thread cannot be
 * re-engaged by anything this product does later.
 *
 * PURE MODULE: no I/O, no clock (the caller passes `now`), no randomness.
 */

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

/**
 * Hours of silence before the FIRST nudge. 72, not 48 — see the header.
 * Exported because the job that selects candidates must pre-cut its SQL on the
 * same number, and a query that disagrees with the decider is a query that
 * either wakes people early or never wakes them at all.
 */
export const REENGAGE_AFTER_HOURS = 72;

/**
 * Minimum hours between two nudges in the SAME episode. Set beyond the second
 * escalation of `whatsapp_winback.ts` (6 days) on purpose: this module sends
 * one nudge and then goes quiet, and this constant exists to make "one" a
 * bound rather than an intention.
 */
export const REENGAGE_MIN_GAP_HOURS = 24 * 7;

/**
 * Local hours during which a proactive message may be delivered. Outside it the
 * decision is DEFERRED, never dropped: a student who goes quiet at 23:00 is
 * still owed a nudge, in the morning.
 */
export const QUIET_HOURS_START = 21;
export const QUIET_HOURS_END = 8;

const HOUR_MS = 3600_000;

// ---------------------------------------------------------------------------
// Inputs / outputs
// ---------------------------------------------------------------------------

/**
 * How the message should sound. R1 tokens: the composer branches on these, and
 * the coach synthesis counts them.
 *
 * `lighter` is the "semaine de merde" posture (§1.3, §7.4 J5): the TONE and the
 * CADENCE soften, and the PROTOCOL does not move. That separation is the
 * authority rule §1.5 expressed as a token — there is deliberately no tone
 * value that means "relax the plan", because Sophia has no such power.
 */
export const REENGAGE_TONES = ["gentle", "lighter", "warm_return"] as const;
export type ReengageTone = (typeof REENGAGE_TONES)[number];

export const SKIP_REASONS = [
  "recent_contact",
  "already_nudged_this_episode",
  "quiet_hours",
  "safety_active",
  "restriction_flag",
  "no_active_plan",
  "opted_out",
  "cohort_ended",
] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

export interface ReengageInput {
  /** Last message the STUDENT sent. Null = never spoke. */
  lastInboundAt: Date | string | null;
  /** Last proactive re-engagement WE sent, if any. */
  lastNudgeAt?: Date | string | null;
  /**
   * Whether the current silence has already been nudged. Distinct from
   * `lastNudgeAt` being recent: an episode that was nudged 3 weeks ago and
   * never answered is still THE SAME episode, and must not be nudged again.
   */
  nudgedThisEpisode?: boolean;
  /** Student's local hour, 0..23. The caller resolves the timezone. */
  localHour: number;
  /** Safety band from the pregate. Anything but 'none' stops the nudge. */
  /**
   * REQUIS, pas optionnel — corrigé en C4, même défaut que `decideDailyPulse`:
   * `keel-reengage-v1` ne le renseignait pas, donc la garde ne pouvait pas
   * mordre en production. Voir l'en-tête de `daily_pulse.ts` pour le
   * raisonnement complet.
   */
  safetyBand: "none" | "low" | "medium" | "high" | "critical" | null;
  /** The deterministic TCA floor. Adherence pressure stops entirely. */
  restrictionFlag?: boolean;
  /** Did the student declare a hard week? Softens the tone, never the plan. */
  declaredHardWeek?: boolean;
  hasActivePlan: boolean;
  optedOut?: boolean;
  cohortEnded?: boolean;
  now: Date;
}

export type ReengageDecision =
  | { decision: "send"; tone: ReengageTone; hoursSilent: number }
  | { decision: "skip"; reason: SkipReason; hoursSilent: number | null }
  | { decision: "defer"; untilLocalHour: number; hoursSilent: number };

function toMs(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  const ms = d.getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Decide whether to nudge, and in what tone.
 *
 * THE ORDER OF THE GATES IS THE CONTRACT. Each one is checked before any that
 * could override it:
 *
 *   1. opted_out       — regulatory. Never overridable by anything below.
 *   2. safety_active   — a person in crisis does not get a nutrition nudge.
 *                        This repo has a documented incident of a durable
 *                        effect committing during a crisis turn
 *                        (`p4-safety-deferred-gate-leak`); the gate goes near
 *                        the top so no later branch can reach past it.
 *   3. restriction_flag— §3.4 TCA guard: adherence pressure STOPS. A relance
 *                        is adherence pressure wearing a friendly tone.
 *   4. cohort_ended /
 *      no_active_plan  — nothing to re-engage them TO. A nudge here is the
 *                        product talking about itself.
 *   5. recent_contact  — the threshold.
 *   6. already_nudged  — ONE per episode.
 *   7. quiet_hours     — DEFER, not skip: the nudge is still owed.
 */
export function decideReengagement(input: ReengageInput): ReengageDecision {
  const nowMs = input.now.getTime();
  const lastInboundMs = toMs(input.lastInboundAt);
  const hoursSilent = lastInboundMs === null
    ? null
    : (nowMs - lastInboundMs) / HOUR_MS;

  if (input.optedOut) return { decision: "skip", reason: "opted_out", hoursSilent };

  const band = input.safetyBand ?? "none";
  if (band !== "none") {
    return { decision: "skip", reason: "safety_active", hoursSilent };
  }
  if (input.restrictionFlag) {
    return { decision: "skip", reason: "restriction_flag", hoursSilent };
  }
  if (input.cohortEnded) {
    return { decision: "skip", reason: "cohort_ended", hoursSilent };
  }
  if (!input.hasActivePlan) {
    return { decision: "skip", reason: "no_active_plan", hoursSilent };
  }

  // A student who has NEVER spoken is treated as silent-forever rather than
  // as "no data": the opt-in reply is the first inbound, so its absence is
  // exactly the case a nudge exists for.
  const silent = hoursSilent ?? Number.POSITIVE_INFINITY;
  if (silent < REENGAGE_AFTER_HOURS) {
    return { decision: "skip", reason: "recent_contact", hoursSilent };
  }

  if (input.nudgedThisEpisode) {
    return { decision: "skip", reason: "already_nudged_this_episode", hoursSilent };
  }
  const lastNudgeMs = toMs(input.lastNudgeAt);
  if (
    lastNudgeMs !== null &&
    (nowMs - lastNudgeMs) / HOUR_MS < REENGAGE_MIN_GAP_HOURS
  ) {
    return { decision: "skip", reason: "already_nudged_this_episode", hoursSilent };
  }

  if (isQuietHour(input.localHour)) {
    return {
      decision: "defer",
      untilLocalHour: QUIET_HOURS_END,
      hoursSilent: silent,
    };
  }

  return {
    decision: "send",
    tone: input.declaredHardWeek ? "lighter" : "gentle",
    hoursSilent: silent,
  };
}

export function isQuietHour(localHour: number): boolean {
  const h = Math.floor(localHour);
  if (!Number.isFinite(h)) return true; // unknown hour -> treat as quiet, never spam
  return h >= QUIET_HOURS_START || h < QUIET_HOURS_END;
}

// ---------------------------------------------------------------------------
// The wording guard — "zéro culpabilisation" made checkable
// ---------------------------------------------------------------------------

/**
 * Constructions that turn a relance into a reproach. Checked on the GENERATED
 * text, deterministically, for the same reason the interdits are: "don't guilt
 * the student" is an excellent instruction and a worthless guarantee.
 *
 * The mechanism is documented in this repo's own notes
 * (`proactive-tone-no-ungrounded-tenderness`, and the winback doctrine "la
 * honte précède le silence"): a student who feels judged goes quiet, and a
 * quiet student is the churn the coach is paying us to prevent. So a guilt-
 * tripping relance is not merely off-tone — it produces the exact outcome the
 * feature exists to avoid.
 *
 * EN + FR: the legacy branch still generates French.
 */
const GUILT_PATTERNS: readonly RegExp[] = [
  /\b(you\s+(haven'?t|have\s+not)\s+(logged|sent|posted|tracked))\b/i,
  /\b(you\s+(missed|skipped|forgot))\b/i,
  /\b(disappoint\w*|shame\w*|lazy|excuses?)\b/i,
  /\b(get\s+back\s+on\s+track|no\s+excuses|be\s+honest\s+with\s+yourself)\b/i,
  /\b(tu\s+n'?as\s+(pas|rien)\s+(envoy|logg|not|fait))/i,
  // `laiss\s+tomber` could never match "laissé tomber" (the accent sits between
  // "laiss" and the space), and the bare stems matched inside unrelated words.
  // Both were dead or over-broad alternatives hiding behind a sibling that
  // happened to fire.
  /\btu\s+as\s+(rat[ée]|manqu[ée]|oubli[ée]|laiss[ée]?\s+tomber)/i,
  /\b(d[ée]cevant|honte|paresseu|excuses?\b)/i,
  /\b(reprends?[- ]toi|il\s+faut\s+que\s+tu)/i,
  // NO leading \b here: JavaScript's \b is ASCII-only, so `\bç` never matches
  // at the start of "Ça fait 5 jours...". Any pattern beginning with an
  // accented letter must anchor on a non-letter instead, or it silently never
  // fires — a guard that cannot match is worse than no guard, because it reads
  // as covered.
  /(?:^|[^\p{L}])(ç|c)a\s+fait\s+\d+\s+jours?\s+que\s+tu\s+n/iu,
];

export interface GuiltFinding {
  pattern: string;
  matchedText: string;
  index: number;
}

/**
 * Find guilt-tripping constructions in a proactive message.
 *
 * DISARM CONDITION (doctrine P9 — a belt states when it does NOT fire): this
 * checks CONSTRUCTIONS aimed at the student ("you haven't logged"), not the
 * mere presence of a negative word. "No pressure at all" and "pas de souci si
 * tu n'as pas eu le temps" contain negations and must pass, or the guard makes
 * the warm phrasings impossible and only the cold ones survive.
 */
export function findGuiltTripping(text: string): GuiltFinding[] {
  const haystack = String(text ?? "");
  if (!haystack.trim()) return [];
  const findings: GuiltFinding[] = [];
  for (const pattern of GUILT_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(haystack)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex += 1;
        continue;
      }
      findings.push({
        pattern: pattern.source,
        matchedText: m[0],
        index: m.index,
      });
    }
  }
  return findings.sort((a, b) => a.index - b.index);
}

export class GuiltTrippingError extends Error {
  readonly findings: GuiltFinding[];
  constructor(findings: GuiltFinding[]) {
    super(
      `[keel/reengagement] Proactive message guilt-trips the student: ` +
        findings.map((f) => `"${f.matchedText}"`).join(", ") +
        ". Output rejected; regenerate.",
    );
    this.name = "GuiltTrippingError";
    this.findings = findings;
  }
}

export function assertNoGuiltTripping(text: string): void {
  const findings = findGuiltTripping(text);
  if (findings.length === 0) return;
  console.error("keel.reengagement.guilt_tripping", {
    finding_count: findings.length,
    matched: findings.map((f) => f.matchedText).join(" | "),
  });
  throw new GuiltTrippingError(findings);
}

/**
 * The instruction handed to the composer for each tone.
 *
 * `warm_return` is the J6 case (§7.4): the student comes back on their own.
 * The rule that matters there is NOT to revisit the absence — "reprise
 * chaleureuse SANS revenir sur l'épisode". Naming the silence at the moment
 * someone returns is the single most reliable way to make them leave again.
 */
export function toneInstruction(tone: ReengageTone): string {
  switch (tone) {
    case "gentle":
      return [
        "The student has been quiet for a few days. Send ONE short, warm message.",
        "Do not mention how many days it has been. Do not ask why.",
        "Do not reference logging, adherence, streaks or the plan's demands.",
        "Open a door: something specific and easy they could reply to.",
      ].join(" ");
    case "lighter":
      return [
        "The student has told you they are having a hard time.",
        "Soften the TONE and the CADENCE. The protocol does not change and you do not renegotiate it.",
        "No coaching push, no target, no adherence talk. One short message.",
        "Acknowledge without dramatising, and leave them the initiative.",
      ].join(" ");
    case "warm_return":
      return [
        "The student is coming back on their own after a silence.",
        "Welcome them warmly and DO NOT revisit the absence: no 'where were you', no 'glad you're back after X days', no recap of what was missed.",
        "Pick up exactly where they are, as if the conversation had not stopped.",
      ].join(" ");
  }
}
