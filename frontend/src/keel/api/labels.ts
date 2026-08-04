// KEEL — token to display-label mappers for the student app.
//
// R1: the tokens are data (never translated). R7: every mapping THROWS on an
// unknown token — it never falls back to the raw slug, because a raw slug on
// screen is exactly the silent drop R7 exists to forbid. `t()` already fails
// loudly on an unknown key; these helpers add the missing half, which is
// turning an arbitrary database string into a key `t()` can accept at all.

import { en } from "../i18n/en";
import { t, type MessageKey } from "../i18n/t";
// TYPE-ONLY, and it has to stay that way: the STRUCTURE of a plan lives in
// `planStructure.ts` (which parts exist, which line goes where, in what
// order), and that module calls the mappers below to put words on its
// headings. A type import is erased at build time, so the two files name each
// other on paper without ever forming a runtime cycle.
import type { FoodSection, PlanPart } from "./planStructure";

/**
 * Narrow an arbitrary string to a MessageKey, loudly.
 *
 * Every label of this app is reached through here, so a token the database
 * knows and the i18n seed does not is a hard error at the first render instead
 * of a `slot.snack_am` string shown to a student.
 */
export function messageKey(raw: string): MessageKey {
  if (!Object.prototype.hasOwnProperty.call(en, raw)) {
    throw new Error(`[keel/labels] no message key "${raw}" in the English seed (R7)`);
  }
  return raw as MessageKey;
}

function labelIn(namespace: string, token: string): string {
  return t(messageKey(`${namespace}.${token}`));
}

/** slot_vocabulary.key -> "Breakfast". */
export function slotLabel(slotKey: string): string {
  return labelIn("slot", slotKey);
}

/** commitment_evaluations.status -> "Done". */
export function statusLabel(status: string): string {
  return labelIn("status", status);
}

/** commitment_evaluations.timing_status -> "Outside the planned window". */
export function timingLabel(timing: string): string {
  return labelIn("timing", timing);
}

/** plan_commitments.priority -> "Core". */
export function priorityLabel(priority: string): string {
  return labelIn("priority", priority);
}

/** plan_commitments.activity_class -> "Supplement". */
export function activityLabel(activityClass: string): string {
  return labelIn("activity", activityClass);
}

/**
 * plan_commitments.autonomy / plan_templates.default_autonomy -> "Swaps allowed
 * within the policy".
 *
 * WHY THIS EXISTS. The template editor printed this column's values RAW, in a
 * monospaced select: a coach opening their own library read `swap_within_policy`
 * — a storage slug, in a place where every other field had already been turned
 * into English. It was the last one on the three plan screens. Reaching it
 * through `labelIn` also means an autonomy value added to the enum without a
 * word fails at the first render (R7) instead of leaking as a slug.
 */
export function autonomyLabel(autonomy: string): string {
  return labelIn("autonomy", autonomy);
}

/** planned_deviations.kind -> "Eating out". */
export function deviationKindLabel(kind: string): string {
  return labelIn("deviation.kind", kind);
}

/**
 * meal photo `portion_band` -> "Moderate".
 *
 * The photo's portion axis is a TOKEN, never a number (CONTRACT non-input #4:
 * food identification from an image is reliable, quantification is not). This
 * mapper is the whole render path for it — there is no numeric variant to
 * accidentally reach for.
 */
export function portionBandLabel(band: string): string {
  return labelIn("photo.portion", band);
}

/** meal photo `commitment_matches[].verdict` -> "Looks consistent".
 *
 *  Deliberately NOT the evaluator's vocabulary: this reports EVIDENCE, and the
 *  status badge next to it reports the derived grade. Two different things, two
 *  different word sets, so a reader can never mistake one for the other. */
export function matchVerdictLabel(verdict: string): string {
  return labelIn("photo.verdict", verdict);
}

/** plan_commitments.unit -> "mg" (empty string for the `none` unit). */
export function unitLabel(unit: string | null): string {
  if (unit === null) return "";
  return labelIn("unit", unit);
}

/**
 * The prescribed target of a line, e.g. ">= 5000 IU" or "2-3 servings".
 *
 * This renders the COACH'S PRESCRIPTION, never a derived or photo-inferred
 * quantity (CONTRACT non-input #4 forbids the latter, not the former).
 * `target_op='any'` and a null bound produce an empty label rather than a
 * misleading "0".
 */
export function targetLabel(args: {
  target_op: string;
  target_min: number | null;
  target_max: number | null;
  unit: string | null;
}): string {
  if (args.target_op === "any") return "";
  const unit = unitLabel(args.unit);
  const suffix = unit ? ` ${unit}` : "";
  if (args.target_op === "between") {
    if (args.target_min === null || args.target_max === null) return "";
    return `${args.target_min}-${args.target_max}${suffix}`;
  }
  // The CHECK constraint of plan_commitments stores a '<=' bound in target_MAX
  // and every other bound in target_min. Reading target_min for both would
  // silently blank the label of every ceiling line ("no more than 2 coffees").
  const bound = args.target_op === "<=" ? args.target_max : args.target_min;
  if (bound === null) return "";
  if (args.target_op === "==") return `${bound}${suffix}`;
  return `${args.target_op} ${bound}${suffix}`;
}

// ===========================================================================
// THE COACH'S OWN SENTENCE
//
// Everything below exists for ONE screen: the plan import review. The coach
// has just handed us their own document and must be able to RE-READ IT. What
// they were shown instead was our storage vocabulary —
//
//     do · nutrition · presence · occasion · @ any_meal
//
// — six internal tokens, none of which is a word they wrote. This section
// turns a row of `plan_commitments` back into one English sentence built on a
// fixed skeleton:
//
//     WHEN — HOW MUCH ( of ) WHAT
//
// Three deliberate rules, because each fixes a specific way the token line
// lied to its reader:
//
//   - `capture` says "tracked, not scored". A capture line is an observation;
//     the student is NOT graded on it, and a coach reading "do/capture" had no
//     way to know that.
//   - `avoid` says "none", never "0". "presence == 0" is a comparator; "none"
//     is a prescription.
//   - `required_days_per_week` says "different days", not just "3 a week" —
//     that column is exactly the difference between three portions on Sunday
//     and three separate days, and it is why the coach wrote it.
//
// R7 posture, adjusted for WHERE this runs. The mappers above throw on an
// unknown token, and they should: they render data the database already
// accepted. `commitmentSentence` renders a DRAFT — a row the extractor
// produced and Postgres has never seen — so an out-of-vocabulary slug is
// expected input, not an impossible state. It therefore fails LOUD but not
// FATAL: console.error plus an honest "I could not read this line", the same
// split `t()` already makes in production. Throwing here would blank the whole
// import screen because one line came back with a slug we do not know.
// ===========================================================================

/**
 * The subset of `plan_commitments` a sentence is built from. Declared
 * structurally rather than imported from the editor: this module is the
 * bottom of the frontend stack and must not depend on a component.
 */
export interface CommitmentShape {
  polarity: string;
  anchor_kind: string;
  slot_key: string | null;
  clock_local: string | null;
  window_start_local: string | null;
  window_end_local: string | null;
  measure: string;
  unit: string | null;
  target_op: string;
  target_min: number | null;
  target_max: number | null;
  substance_ref: string | null;
  food_group_ref: string | null;
  evaluation_grain: string;
  scheduled_days: string[] | null;
  required_days_per_week: number | null;
  expected_occasions_per_day: number | null;
}

/** food_groups.slug -> "vegetables" (the word, mid-sentence, lowercase). */
export function foodGroupLabel(slug: string): string {
  return labelIn("food_group", slug);
}

/** substances.slug -> "vitamin D3" (the word, mid-sentence, lowercase). */
export function substanceLabel(slug: string): string {
  return labelIn("substance", slug);
}

/**
 * A unit as a WORD, agreeing with its count: "30 minutes", "1 serving".
 *
 * Separate from `unitLabel` on purpose. `unitLabel` renders the badge next to
 * a number in a table; this renders prose, where "30 min" reads as an
 * abbreviation and "30 minutes" reads as a sentence. Symbol units (mg, IU)
 * carry the same string in both keys — the seed decides, not a code branch.
 */
function unitWord(unit: string | null, count: number): string {
  return labelIn(count === 1 ? "unit.one" : "unit.many", unit ?? "none");
}

/** A number with its unit word: "5000 IU", "2 servings", "30 minutes". */
function quantity(value: number, unit: string | null): string {
  const word = unitWord(unit, value);
  return word === "" ? `${value}` : `${value} ${word}`;
}

// Measures whose target COUNTS occurrences of a thing. They are the ones that
// can be stacked into a single day, which is why `required_days_per_week`
// exists for them and why their weekly cadence must read "different days".
const COUNTING_MEASURES = new Set([
  "serving",
  "portion",
  "exchange",
  "count",
  "reps",
]);

// Measures whose target is the SIZE of one occurrence, plus the two dose
// measures. ">= 5000 IU" is a dose, not a floor to beat, so these render the
// bare quantity where a magnitude renders "at least ...".
const BARE_QUANTITY_MEASURES = new Set([
  ...COUNTING_MEASURES,
  "dose",
  "micronutrient",
]);

const WEEKDAY_TOKENS = ["mon", "tue", "wed", "thu", "fri"];
const WEEKEND_TOKENS = ["sat", "sun"];

function sameDays(days: string[], expected: string[]): boolean {
  return days.length === expected.length && expected.every((d) => days.includes(d));
}

function capitalizeFirst(text: string): string {
  return text.length === 0 ? text : text[0].toUpperCase() + text.slice(1);
}

/** "Monday", "Monday and Friday", "Monday, Wednesday and Friday". */
function namedDays(days: string[]): string {
  const words = days.map((d) => labelIn("day.long", d));
  if (words.length === 1) return words[0];
  const last = words[words.length - 1];
  const head = words.slice(0, -1);
  return t("common.list_pair", { first: head.join(", "), second: last });
}

/**
 * WHICH DAYS — the calendar half of the WHEN clause.
 *
 * `scheduled_days` wins over `required_days_per_week` when both are set: named
 * days are a stricter statement ("Saturday"), a count is a looser one ("one
 * day a week"), and showing the looser one would understate the prescription.
 */
function dayPhrase(c: CommitmentShape): string {
  const days = c.scheduled_days ?? [];
  if (days.length > 0 && days.length < 7) {
    if (sameDays(days, WEEKDAY_TOKENS)) return t("when.weekdays");
    if (sameDays(days, WEEKEND_TOKENS)) return t("when.weekends");
    return t("when.every_named", { days: namedDays(days) });
  }
  if (c.evaluation_grain === "week") {
    const required = c.required_days_per_week;
    if (required === 1) return t("when.one_day_per_week");
    if (required !== null && required > 0 && required < 7) {
      return COUNTING_MEASURES.has(c.measure)
        // The whole point of the column: three DIFFERENT days, not three
        // portions on Sunday. The coach wrote it; the sentence says it.
        ? t("when.different_days_per_week", { count: required })
        : t("when.days_per_week", { count: required });
    }
    return t("when.each_week");
  }
  return t("when.every_day");
}

/**
 * WHERE IN THE DAY — a lowercase fragment, or "" when the line has no anchor.
 *
 * THREE vocabularies, not one, because the same slot key means different things
 * depending on the polarity AND on what the rest of the sentence already says.
 *
 *   `when.at.*`      a do/avoid line: the slot is an ACCOMPANIMENT — "with
 *                    breakfast" means take it there.
 *   `when.observe.*` a capture line whose sentence prints NO day clause: the
 *                    moment has to carry the recurrence by itself, so it reads
 *                    "each evening". One shared table would have made every
 *                    measurement read like an instruction to eat something.
 *   `when.moment.*`  the same capture slot when a day clause IS printed. "Every
 *                    Saturday, each morning at breakfast" quantifies one
 *                    recurrence twice and then contradicts itself — Saturday is
 *                    not every morning. The bare moment ("at breakfast") is the
 *                    half that composes.
 */
function anchorPhrase(c: CommitmentShape, dayClausePrinted: boolean): string {
  const namespace = c.polarity !== "capture"
    ? "when.at"
    : dayClausePrinted
    ? "when.moment"
    : "when.observe";
  if (c.anchor_kind === "slot" && c.slot_key !== null) {
    return labelIn(namespace, c.slot_key);
  }
  if (c.anchor_kind === "clock" && c.clock_local !== null) {
    return t("when.at_clock", { time: c.clock_local });
  }
  if (
    c.anchor_kind === "window" &&
    c.window_start_local !== null &&
    c.window_end_local !== null
  ) {
    return t("when.between_clock", {
      from: c.window_start_local,
      to: c.window_end_local,
    });
  }
  return "";
}

/**
 * WHEN — the day clause, the moment clause, or both.
 *
 * `hasWhat` is whether ANYTHING follows the anchor in the finished sentence,
 * and it decides whether "Every day" is dropped.
 *
 * "Every day, with breakfast — 5000 IU" says nothing "With breakfast — 5000 IU"
 * does not, so the cadence goes. But when the anchor is the WHOLE sentence,
 * dropping it leaves "With breakfast" under a title that reads "Breakfast
 * within 90 minutes of waking": a fragment that restates the weakest half of
 * the title, adds no fact, and quietly hides the one thing the readback could
 * still have confirmed — that the line runs every day. So a line with nothing
 * after the anchor keeps its cadence. A NAMED day is never dropped either way.
 */
function whenPhrase(c: CommitmentShape, hasWhat: boolean): string {
  const day = dayPhrase(c);
  const dayClausePrinted = day !== t("when.every_day") || !hasWhat;
  const anchor = anchorPhrase(c, dayClausePrinted);
  if (anchor === "") return day;
  if (!dayClausePrinted) return capitalizeFirst(anchor);
  return `${day}, ${anchor}`;
}

/**
 * True when the target number is the SAME FACT as the cadence number.
 *
 * "3 servings a week, on 3 different days" and "3 portions a day, at 3 meals"
 * are each one prescription written twice. Printing both makes the reader
 * multiply them — "At every meal — 3 portions of protein" reads as nine
 * portions, and the document said three. The cadence keeps it, because the
 * cadence is what the student's day is actually built from.
 */
function targetRestatesCadence(c: CommitmentShape): boolean {
  if (!COUNTING_MEASURES.has(c.measure)) return false;
  if (c.evaluation_grain === "week") {
    // The weekly cadence count is `required_days_per_week` when the coach set
    // one, and the number of named days when they named them instead. Any
    // comparator counts here: "one meal out a week, no more than 1 session" is
    // the same sentence twice, whichever direction the bound points.
    const cadence = c.required_days_per_week ?? c.scheduled_days?.length ?? null;
    const bound = c.target_op === "<="
      ? c.target_max
      : c.target_op === ">=" || c.target_op === "=="
      ? c.target_min
      : null;
    return cadence !== null && bound !== null && bound === cadence;
  }
  // Within a day, only a FLOOR is safely redundant with the occasion count. A
  // ceiling is its own prescription ("no more than 2 coffees") even when the
  // numbers happen to coincide, so it is never dropped here.
  if (c.target_op !== ">=" || c.target_min === null) return false;
  return c.target_min === c.expected_occasions_per_day;
}

/** 2300 -> "23:00". Null when the number is not a wall-clock time. */
function formatClockTarget(value: number): string | null {
  if (!Number.isInteger(value) || value < 0 || value > 2359) return null;
  const hours = Math.floor(value / 100);
  const minutes = value % 100;
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * A clock-time target is a WHEN, not a HOW MUCH.
 *
 * `measure='clock_time'` stores "lights out by 23:00" as the integer 2300, and
 * its unit ('hhmm') has no word. Sent through the ordinary quantity path it
 * came out as "no more than 2300" — a number with no meaning on a page. So it
 * is rendered as a time, and suppressed entirely when the anchor already says
 * it, which is the normal case ("Weekdays, at 23:00").
 */
function clockTargetPhrase(c: CommitmentShape): string {
  if (c.anchor_kind === "clock" && c.clock_local !== null) return "";
  const bound = c.target_op === "<=" ? c.target_max : c.target_min;
  if (bound === null) return "";
  const time = formatClockTarget(bound);
  if (time === null) return "";
  return c.target_op === "<=" ? t("amount.by_time", { time }) : t("amount.at_time", { time });
}

/**
 * HOW MUCH — "", "none", "5000 IU", "at least 30 minutes", "rate 0 to 10".
 *
 * A '<=' line whose `target_max` is missing returns "" rather than falling
 * back to `target_min`. That fallback is the bug this screen is full of: the
 * extractor writes the bound in the wrong column, and reading the other one
 * would print a confident ceiling the coach never wrote. Empty here, and the
 * line asks "How much, exactly?" instead.
 */
function amountPhrase(c: CommitmentShape): string {
  // "presence == 0" is a comparator. A coach prescribes "none".
  if (c.polarity === "avoid") return t("amount.none");
  if (c.target_op === "any") return "";
  // NOTHING IS SCORED ON A CAPTURE LINE, so there is no amount to hit. The
  // only quantity worth printing is the RANGE of the observation itself
  // ("rate 0 to 10"). Anything else the extractor put in the target columns of
  // a measurement — "== 1 point" for a weekly weigh-in — is a number the
  // student is not being asked to reach, and printing it says they are.
  if (c.polarity === "capture" && c.target_op !== "between") return "";
  if (c.measure === "clock_time" || c.unit === "hhmm") return clockTargetPhrase(c);
  if (targetRestatesCadence(c)) return "";

  if (c.target_op === "between") {
    if (c.target_min === null || c.target_max === null) return "";
    if (c.measure === "scale") {
      return t("amount.rate_between", { min: c.target_min, max: c.target_max });
    }
    return t("amount.between", {
      min: c.target_min,
      max: quantity(c.target_max, c.unit),
    });
  }
  if (c.target_op === "<=") {
    if (c.target_max === null) return "";
    return t("amount.at_most", { quantity: quantity(c.target_max, c.unit) });
  }
  if (c.target_min === null) return "";
  if (c.target_op === "==" && c.target_min === 0) return t("amount.none");
  const qty = quantity(c.target_min, c.unit);
  if (c.target_op === "==") return qty;
  return BARE_QUANTITY_MEASURES.has(c.measure) ? qty : t("amount.at_least", { quantity: qty });
}

/**
 * WHAT — the food group, or the substance when no dose carries the identity.
 *
 * An `avoid` line names nothing: "with dinner - none" is the prescription, and
 * repeating the object ("none of sugar and sweets") reads like a translation.
 * A dosed supplement names nothing either — "5000 IU" IS the object, and the
 * title right above already says vitamin D3.
 */
function objectPhrase(c: CommitmentShape, amount: string): string {
  if (c.polarity === "avoid") return "";
  if (c.food_group_ref !== null) return foodGroupLabel(c.food_group_ref);
  if (c.substance_ref !== null && amount === "") return substanceLabel(c.substance_ref);
  return "";
}

/**
 * ONE LINE OF THE COACH'S PLAN, IN THE COACH'S LANGUAGE.
 *
 * "Every day - 2 servings of vegetables", "With breakfast - 5000 IU",
 * "Weekdays - none", "Each evening - rate 0 to 10 - tracked, not scored".
 *
 * Never throws (see the section header): an unreadable line says so.
 */
export function commitmentSentence(c: CommitmentShape): string {
  try {
    // WHAT first: the WHEN clause is shortened only when something follows it.
    const amount = amountPhrase(c);
    const object = objectPhrase(c, amount);
    const what = amount !== "" && object !== ""
      ? t("sentence.amount_of", { amount, object })
      : amount !== ""
      ? amount
      : object;
    const when = whenPhrase(c, what !== "");
    const clauses = [when, what].filter((p) => p !== "");
    const sentence = clauses.join(t("sentence.separator"));
    // A capture line is evidence, not a grade. Saying so on every one of them
    // is the difference between a student who logs and a student who hides.
    return c.polarity === "capture"
      ? `${sentence}${t("sentence.tracked_suffix")}`
      : sentence;
  } catch (err) {
    console.error("[keel/labels] commitmentSentence could not render a line", c, err);
    return t("question.unreadable");
  }
}

/**
 * HOW MUCH, for the student's own screen — "5000 IU", "none", "2 servings".
 *
 * WHY THIS EXISTS, and why `targetLabel` is no longer the student's renderer.
 * `targetLabel` prints the STORAGE TRIPLE (`target_op` + bound + `unit` badge).
 * On the coach's import screen that vocabulary was replaced in W6 because it
 * was unreadable; the student's day kept it, so the same four lines rendered
 * two different ways:
 *
 *     coach                              student
 *     "Weekdays, at 23:00"               "<= 2300 time"
 *     "Weekdays — none"                  "0"
 *     "Every day — 2 servings"           ">= 2 serving"
 *     "3 different days a week"          ">= 3 serving"
 *
 * `<= 2300 time` is the worst of them: `time` is the display of the `hhmm`
 * unit token and 2300 is a clock stored as an integer, so the student was
 * reading two internals glued together. This function is `amountPhrase` — the
 * same one the coach's sentence is built from — exported with the same
 * fail-loud-but-not-fatal posture as `commitmentSentence`: one renderer, so
 * the two screens cannot drift again.
 *
 * It returns "" for a line with nothing to state (a capture line, a target
 * that only restates the cadence already printed in the title). Empty is a
 * result, not a failure: the caller renders no chip at all.
 */
export function commitmentAmount(c: CommitmentShape): string {
  try {
    return amountPhrase(c);
  } catch (err) {
    console.error("[keel/labels] commitmentAmount could not render a line", c, err);
    return "";
  }
}

// ===========================================================================
// THE WORDS OF THE TWO PARTS
//
// The PARTITION itself — which part holds a line, which sub-group of FOOD it
// falls in, in what order the sections are read — moved to `planStructure.ts`
// in W6.5. It had grown into a second module living inside this one, and while
// it lived here three screens could each build their own layout on top of it
// and still claim to "share the rule": the coach signed a plan under four
// headings, the template list showed one flat column, the student's day showed
// occasions. Same partition, three structures.
//
// What stays here is what this file is for: turning a token into the word a
// human reads. `planStructure.ts` calls these; nothing calls it back.
// ===========================================================================

/** "Food", "Actions", "Observations". */
export function planPartLabel(part: PlanPart): string {
  return labelIn("part", part);
}

/** The sentence under the part title: what belongs in it. */
export function planPartHint(part: PlanPart): string {
  return labelIn("part.hint", part);
}

/**
 * The SAME three parts, in the student's voice: "What I eat", "What I do".
 *
 * Two word sets rather than one, because the two readers stand in different
 * places: the coach is looking at a prescription they are about to sign, the
 * student at their own day. What must not differ is the PARTITION — one line
 * belongs to the same part on both screens, which is why both read their
 * sections from `planStructure.ts` and neither has a rule of its own.
 */
export function studentPartLabel(part: PlanPart): string {
  return labelIn("part.student", part);
}

export function studentPartHint(part: PlanPart): string {
  return labelIn("part.student.hint", part);
}

/** "Every day", "What we are cutting". */
export function foodSectionLabel(section: FoodSection): string {
  return labelIn("food_section", section);
}

// ---------------------------------------------------------------------------
// BLOCKING ISSUES -> QUESTIONS THE COACH CAN ANSWER
// ---------------------------------------------------------------------------

/**
 * `validateDraft` mirrors the named CHECK constraints of `plan_commitments`,
 * and it must keep doing exactly that — it is the last thing standing between
 * this screen and a 400 from the server. But its output is written for us:
 *
 *   plan_commitments_target_check: target_op='<=' requires target_max
 *
 * A coach cannot act on that, and should never have to know the sentence
 * exists. This table maps each CONSTRAINT FAMILY (the token before the first
 * colon — stable, because it is the SQL constraint name) to the decision the
 * coach actually has to make.
 *
 * `internal` families are OUR bug, not a question: a missing template key or a
 * missing locale is something the import should never have produced. They are
 * logged and hidden rather than dressed up as a coach decision. They still
 * block the save through `validateDraft`, which is untouched — hiding a
 * question is a display choice, never a permission to publish a broken row.
 */
type IssueFamily = { key: string; fix: "slot" | null } | "internal";

const ISSUE_FAMILIES: Record<string, IssueFamily> = {
  title: { key: "question.title", fix: null },
  content_locale: "internal",
  template_commitment_key: "internal",
  clock_local: { key: "question.time", fix: null },
  window_start_local: { key: "question.window", fix: null },
  window_end_local: { key: "question.window", fix: null },
  plan_commitments_anchor_check: { key: "question.when", fix: "slot" },
  plan_commitments_occasion_anchor_check: { key: "question.when", fix: "slot" },
  plan_commitments_nominal_slot_check: { key: "question.when", fix: "slot" },
  plan_commitments_target_check: { key: "question.how_much", fix: null },
  plan_commitments_substance_ref_check: { key: "question.which_supplement", fix: null },
  plan_commitments_avoid_grain_check: { key: "question.day_or_week", fix: null },
  required_days_per_week: { key: "question.how_many_days", fix: null },
  expected_occasions_per_day: { key: "question.how_many_times", fix: null },
};

export interface CoachQuestion {
  /** Deduplication key + React key. Never rendered. */
  family: string;
  question: string;
  /** The inline control that answers it, when one exists. */
  fix: "slot" | null;
}

/**
 * Turn the raw issue list of one draft into the questions to put on screen.
 *
 * Fail-loud, never raw: a constraint family this table does not know produces
 * an honest "I could not read this line" AND a console.error naming the
 * message. What it must never do is leak the constraint name to the coach —
 * that is the failure this function exists to remove.
 */
export function commitmentQuestions(issues: string[]): CoachQuestion[] {
  const byKey = new Map<string, CoachQuestion>();
  for (const issue of issues) {
    const family = issue.split(":")[0].trim();
    const mapped = ISSUE_FAMILIES[family];
    if (mapped === "internal") {
      console.error(
        `[keel/labels] internal validation issue reached the review screen: ${issue}`,
      );
      continue;
    }
    if (mapped === undefined) {
      console.error(`[keel/labels] no coach question for issue family "${family}": ${issue}`);
      byKey.set("question.unreadable", {
        family: "question.unreadable",
        question: t("question.unreadable"),
        fix: null,
      });
      continue;
    }
    byKey.set(mapped.key, {
      family: mapped.key,
      question: t(messageKey(mapped.key)),
      fix: mapped.fix,
    });
  }
  return [...byKey.values()];
}

// ---------------------------------------------------------------------------
// GAPS -> QUESTIONS
// ---------------------------------------------------------------------------

// The extractor describes a hole the way a report does: "The document asks for
// retesting vitamin D in 8 weeks, but no standalone retest commitment is
// prescribed." That is a finding ABOUT the document. What the coach needs is
// the decision inside it.
//
// Two preambles, because the extractor writes the hole from both ends: the
// positive one names something the document mentions ("asks for retesting
// vitamin D"), the negative one names something it lacks ("sets no explicit
// hydration target"). Both leave a noun phrase the coach can answer yes or no
// to; anything else falls through to the generic question with the full
// sentence underneath.
const GAP_PREAMBLE =
  /^the (?:document|plan)\s+(?:says|states|mentions|notes|asks for|asks|requires|calls for|prescribes|specifies)\s+(?:that\s+)?(?:to\s+)?/i;
const GAP_NEGATIVE_PREAMBLE =
  /^the (?:document|plan)\s+(?:(?:does not|doesn't)\s+(?:specify|prescribe|give|set|include|mention|state|define)|(?:sets|gives|contains|has|includes|provides)\s+no)\s+/i;
const GAP_TAIL = /(?:,?\s*(?:but|although|though|however|while)\b|\s+despite\b).*$/i;
const GAP_SUBJECT_MAX = 90;

/**
 * A gap, read as the question it is: "Retest vitamin D in 8 weeks - do you
 * want that tracked?".
 *
 * The negation is deliberately NOT stripped ("says not to stack them" keeps
 * its "not to"): a shorter title that inverts the coach's meaning is worse
 * than an awkward one. When no subject can be isolated, the generic question
 * is used and the full description carries the detail underneath — the screen
 * never invents a prescription the document does not contain.
 */
export function gapQuestion(description: string): string {
  const subject = description
    .trim()
    .replace(GAP_PREAMBLE, "")
    .replace(GAP_NEGATIVE_PREAMBLE, "")
    .replace(GAP_TAIL, "")
    .replace(/\.\s*$/, "")
    .trim();
  if (subject === "" || subject.length > GAP_SUBJECT_MAX) {
    return t("review.gap_question_generic");
  }
  return t("review.gap_question", { subject: capitalizeFirst(subject) });
}
