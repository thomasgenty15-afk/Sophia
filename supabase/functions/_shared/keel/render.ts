// KEEL render layer — deterministic, zero LLM, zero I/O.
// Authority: docs/keel/CONTRACT.md + docs/keel/SCHEMA.md.
// R1: tokens in, English content out (translation is this layer's job, 'en' only for now).
// R7: every token mapping below throws on unknown input — no silent fallback.

export interface SundayDigestCommitment {
  title: string;
  scheduledDays: string[] | null;
  requiredDaysPerWeek: number | null;
  slotKey: string | null;
  priority: string;
}

export interface SundayDigestArgs {
  commitments: SundayDigestCommitment[];
  weekStartDate: string; // ISO YYYY-MM-DD
  studentFirstName: string;
  locale: string;
}

export interface SlotReminderCommitmentLine {
  title: string;
  /** `plan_commitments.student_instruction` — verbatim, citable, or null. */
  studentInstruction: string | null;
}

export interface SlotReminderArgs {
  slotKey: string;
  commitments: SlotReminderCommitmentLine[];
  locale: string;
}

/**
 * A single FACT about a molecule-register line, for the coach's eyes only.
 *
 * There is deliberately no "verdict" variant and no severity: the coach decides
 * what a fact means. See `renderCoachSafetyNote` for the whole reasoning.
 */
export type CoachSafetyFact =
  | { kind: "above_upper_limit"; ulLabel: string }
  | { kind: "upper_limit_not_comparable"; ulLabel: string; targetUnit: string | null }
  | { kind: "interaction_watchlist"; medicationClass: string; note: string };

// SCHEMA slot_vocabulary seed — global, one vocabulary for meal and non-meal slots.
const SLOT_LABELS: Record<string, string> = {
  on_waking: "on waking",
  breakfast: "at breakfast",
  snack_am: "morning snack",
  pre_workout: "pre-workout",
  lunch: "at lunch",
  post_workout: "post-workout",
  snack_pm: "afternoon snack",
  dinner: "at dinner",
  before_bed: "before bed",
  any_meal: "any meal",
  any_time: "any time",
};

// Same vocabulary, NOMINAL form — a reminder headline needs "Morning snack", not
// "morning snack" glued after a preposition. Deliberately a second map in the SAME
// file rather than a second file: the divergence this repo keeps paying for is two
// vocabularies in two modules, not two grammatical forms side by side. Every key of
// SLOT_LABELS must exist here (pinned by a test).
const SLOT_HEADINGS: Record<string, string> = {
  on_waking: "On waking",
  breakfast: "Breakfast",
  snack_am: "Morning snack",
  pre_workout: "Pre-workout",
  lunch: "Lunch",
  post_workout: "Post-workout",
  snack_pm: "Afternoon snack",
  dinner: "Dinner",
  before_bed: "Before bed",
  any_meal: "Any meal",
  any_time: "Any time",
};

// SCHEMA scheduled_days CHECK vocabulary.
const DAY_LABELS: Record<string, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// SCHEMA plan_commitments.priority CHECK vocabulary, in display order.
const PRIORITY_ORDER = ["core", "secondary", "optional"] as const;
const PRIORITY_HEADINGS: Record<string, string> = {
  core: "Core",
  secondary: "Also on the plan",
  optional: "Optional",
};

// R7: fail loudly — unknown token never degrades into undefined or a fallback label.
function labelFor(map: Record<string, string>, token: string, kind: string): string {
  const label = map[token];
  if (label === undefined) {
    throw new Error(`R7: unknown ${kind} token "${token}"`);
  }
  return label;
}

// R7: strict ISO date parse; anything else throws.
function formatWeekStart(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) {
    throw new Error(`R7: weekStartDate "${isoDate}" is not YYYY-MM-DD`);
  }
  const [, y, m, d] = match;
  const utc = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (
    utc.getUTCFullYear() !== Number(y) ||
    utc.getUTCMonth() !== Number(m) - 1 ||
    utc.getUTCDate() !== Number(d)
  ) {
    throw new Error(`R7: weekStartDate "${isoDate}" is not a real calendar date`);
  }
  return `${DAY_LABELS[["sun", "mon", "tue", "wed", "thu", "fri", "sat"][utc.getUTCDay()]]} ${Number(d)} ${MONTH_LABELS[utc.getUTCMonth()]}`;
}

function cadenceLabel(c: SundayDigestCommitment): string | null {
  if (c.scheduledDays !== null) {
    // R7: each day token validated individually.
    return c.scheduledDays.map((d) => labelFor(DAY_LABELS, d, "day")).join(", ");
  }
  if (c.requiredDaysPerWeek !== null) {
    if (c.requiredDaysPerWeek === 7) return "daily";
    return `${c.requiredDaysPerWeek}x this week`;
  }
  return null;
}

/**
 * Sunday digest — STATIC and NON-BLOCKING (SCHEMA `planned_deviations`: elicited by the
 * Sunday digest, "non-blocking, no state machine — the weekly validation gate does not
 * exist in KEEL"). It lists what is coming, invites advance declaration of off-plan days,
 * and carries NO button, NO status, NO validation ask (the student never grades their
 * own paper — CONTRACT doctrine).
 */
export function renderSundayDigest(args: SundayDigestArgs): string {
  // R7: 'en' is the only render locale wired today; anything else must not silently
  // fall back to English as if it were a translation.
  if (args.locale !== "en") {
    throw new Error(`R7: unsupported render locale "${args.locale}"`);
  }
  if (args.commitments.length === 0) {
    // R7 spirit: an empty digest is a caller bug, not a message to send.
    throw new Error("renderSundayDigest: refusing to render a digest with zero commitments");
  }

  const lines: string[] = [];
  lines.push(
    `Hi ${args.studentFirstName} — here is what your plan holds for the week of ${formatWeekStart(args.weekStartDate)}.`,
  );

  for (const priority of PRIORITY_ORDER) {
    const group = args.commitments.filter(
      // R7: validate every priority token, including ones outside the current group.
      (c) => labelFor(PRIORITY_HEADINGS, c.priority, "priority") === PRIORITY_HEADINGS[priority],
    );
    if (group.length === 0) continue;
    lines.push("");
    lines.push(`${PRIORITY_HEADINGS[priority]}:`);
    for (const c of group) {
      const details: string[] = [];
      if (c.slotKey !== null) details.push(labelFor(SLOT_LABELS, c.slotKey, "slot"));
      const cadence = cadenceLabel(c);
      if (cadence !== null) details.push(cadence);
      lines.push(details.length > 0 ? `- ${c.title} (${details.join(", ")})` : `- ${c.title}`);
    }
  }

  lines.push("");
  lines.push("This is just a heads-up — nothing to confirm or validate.");
  lines.push("Any days you already know will be off-plan? Just tell me.");
  return lines.join("\n");
}

/** R7 slot-token lookups, exported so no other module ever redeclares the vocabulary. */
export function slotLabel(slotKey: string): string {
  return labelFor(SLOT_LABELS, slotKey, "slot");
}

export function slotHeading(slotKey: string): string {
  return labelFor(SLOT_HEADINGS, slotKey, "slot");
}

/**
 * Slot reminder (W4.6) — STATIC, no button, no status, no score.
 *
 * This is the single most dangerous student surface KEEL owns: it is, verbatim, the
 * "daily nudge pushing plan compliance" the restriction guard exists to switch off
 * (`SUPPRESSED_STUDENT_SURFACES.compliance_reminder`). Two consequences are baked in
 * here rather than left to the caller:
 *
 *  - NO number, NO score, NO streak, NO "you're at X %". The reminder names what the
 *    coach prescribed for this slot and stops. Grading happens in the evaluator, and
 *    the evaluator's output never travels on this surface.
 *  - NO pressure verb. "Log it whenever you get to it" is the ceiling; nothing here
 *    implies a debt, a miss, or a comparison.
 *
 * One message per SLOT, never one per commitment: three lines anchored at breakfast
 * are one reminder listing three things. Fan-out at the message layer is how the
 * phantom-commit cardinality bug reappears (N acknowledged, 1 committed).
 */
export function renderSlotReminder(args: SlotReminderArgs): string {
  if (args.locale !== "en") {
    throw new Error(`R7: unsupported render locale "${args.locale}"`);
  }
  if (args.commitments.length === 0) {
    // R7 spirit: an empty reminder is a caller bug, not a message to send.
    throw new Error("renderSlotReminder: refusing to render a reminder with zero commitments");
  }
  const lines: string[] = [`${slotHeading(args.slotKey)} — on your plan today:`];
  for (const c of args.commitments) {
    const instruction = c.studentInstruction === null ? "" : c.studentInstruction.trim();
    lines.push(instruction === "" ? `- ${c.title}` : `- ${c.title} — ${instruction}`);
  }
  lines.push("");
  lines.push("Tell me here whenever you get to it.");
  return lines.join("\n");
}

/**
 * `substance_interactions.medication_class` -> the class as a prescriber names it.
 *
 * NOT a closed vocabulary: the column is free text seeded by migration, so a
 * strict throw here would take the coach's screen down the day a row is added.
 * The seeded classes get a curated label; anything else is humanized (underscores
 * out, first letter up). The rule this protects is the one that matters on this
 * surface — `oral_contraceptives` never reaches a human reader — and the shape
 * check still fails loudly on something that is not a slug at all (R7 spirit).
 */
const MEDICATION_CLASS_LABELS: Record<string, string> = {
  anticoagulants: "Anticoagulants",
  oral_contraceptives: "Oral contraceptives",
  ssri: "SSRIs",
  immunosuppressants: "Immunosuppressants",
  warfarin: "Warfarin",
  levothyroxine: "Levothyroxine",
  digoxin: "Digoxin",
};

export function medicationClassLabel(slug: string): string {
  if (!/^[a-z][a-z0-9_]*$/.test(slug)) {
    throw new Error(`R7: medication_class "${slug}" is not an ASCII snake_case slug`);
  }
  const seeded = MEDICATION_CLASS_LABELS[slug];
  if (seeded !== undefined) return seeded;
  const words = slug.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * A factual note about a molecule-register line, shown TO THE COACH ONLY.
 *
 * WHAT THIS REPLACED, AND WHY (product decision, 2026-07-28). Until this date a
 * line above a UL or on the interaction watchlist was DEGRADED at render: the
 * student received an "educational food-first suggestion" with the dose stripped
 * out, and the coach got an alert whose call to action was a button reading
 * "Mark as clinician-ordered". That is the software second-guessing the coach.
 * The coach is the prescriber and the authority on their own plan; the
 * prescription now travels to the student exactly as written, dose included, and
 * nothing on any screen asks the coach to attest to anything before it does.
 *
 * WHAT SURVIVED, AND WHY IT IS NOT THE OLD GATE WEARING A HAT. A UL and an
 * interaction watchlist are facts a professional wants in front of them while
 * they work. So the facts stay, and only the facts:
 *
 *  - COACH-ONLY. This function has no student branch. There is no `studentText`
 *    to return anymore — the module can no longer produce a substitute for a
 *    prescription even if a future caller asked it to.
 *  - INFORMATIVE, NOT NORMATIVE. No "must", no "should", no "needs sign-off",
 *    no severity word, no colour implied. "Above the NIH upper limit (4000
 *    IU/day)" states what is on record; it does not rule on the line.
 *  - NON-BLOCKING BY CONSTRUCTION. The return type is a string. There is no
 *    boolean anywhere in this file for a caller to branch a refusal on.
 *
 * The watchlist note is the seed's OWN prose (`substance_interactions.note`),
 * verbatim: it is written by whoever curated the row, and paraphrasing clinical
 * text in a render layer is how a second, worse vocabulary gets born.
 */
export function renderCoachSafetyNote(fact: CoachSafetyFact): string {
  switch (fact.kind) {
    case "above_upper_limit":
      return `Above the NIH upper limit (${fact.ulLabel}).`;
    case "upper_limit_not_comparable":
      // Never resolved as "under the limit" by omission (R7): we say plainly
      // that no comparison was made, rather than staying silent and letting the
      // silence read as a clearance.
      return fact.targetUnit === null
        ? `Upper limit on record: ${fact.ulLabel}. This line carries no unit, ` +
          `so no comparison was made.`
        : `Upper limit on record: ${fact.ulLabel}. This target is in ${fact.targetUnit}, ` +
          `which is not comparable, so no comparison was made.`;
    case "interaction_watchlist":
      return `Interaction watchlist: ${medicationClassLabel(fact.medicationClass)} — ` +
        `${fact.note.trim()}`;
    default: {
      // R7: an unhandled fact kind is a caller bug, never a silent empty note.
      const exhaustive: never = fact;
      throw new Error(`R7: unknown coach safety fact ${JSON.stringify(exhaustive)}`);
    }
  }
}
