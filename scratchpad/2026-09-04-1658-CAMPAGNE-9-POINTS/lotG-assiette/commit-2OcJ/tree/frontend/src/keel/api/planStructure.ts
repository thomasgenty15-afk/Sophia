// KEEL — ONE SHAPE FOR A PLAN, WHEREVER IT IS READ.
//
// THE PROBLEM THIS FILE EXISTS TO END. The same eighteen lines were laid out
// three different ways by three different screens:
//
//   - the import review  — FOOD (every day / every week / what we are cutting /
//                          supplements) then ACTIONS by family, observations
//                          quiet and last. The coach signs THIS;
//   - the template editor — one flat list, `lines.map()`, no heading at all;
//   - the student's day   — its own logic: occasions for the anchored lines,
//                          families for the free ones.
//
// A coach who composes a template, imports a document and then opens their
// client's day had to re-learn the plan three times. The founder's sentence:
// "la structure doit etre la meme qu'a la sortie de l'upload".
//
// SO THE STRUCTURE LIVES HERE, ONCE, AND WHOLE. Not just the assembly: the
// PARTITION too (`planPartOf`, `foodSectionOf`, the reading orders). Those used
// to sit in `api/labels.ts`, and while they did, "we share the rule" was true
// and useless — three screens shared the partition and then each built its own
// layout on top of it. A shared predicate is not a shared structure. What this
// module hands back is the finished shape: sections, in order, with their
// headings already resolved to human words.
//
// `labels.ts` keeps what it is for — turning a token into a word — and this
// module calls it. The dependency runs one way, and `labels.ts` names this file
// only in a type import, which is erased at build time.
//
// GENERIC ON PURPOSE. The coach's screens hold `DraftCommitment`, the student's
// day holds `TodayLine` (a commitment plus its derived status and its facts).
// Forcing one of the two to convert into the other would put a lossy mapping on
// the path of every render. The caller passes `shapeOf`, which names the few
// columns the structure reads, and keeps its own objects.
//
// TWO READERS, ONE FUNCTION. A coach reviews a prescription with no day in
// front of them; a student opens one day and eats it in order. That difference
// is an ARGUMENT (`order`), not a second function — two functions is exactly
// how three screens got here, and a month from now they would be three again.
// What NEVER depends on the reader is the partition: a supplement is food on
// every screen, a weigh-in is an observation on every screen, and a family this
// build cannot place is visible-and-apart on every screen.

import {
  activityLabel,
  foodSectionLabel,
  planPartHint,
  planPartLabel,
  studentPartHint,
  studentPartLabel,
} from "./labels";
import { NO_SLOT_BUCKET } from "./types";

// ===========================================================================
// THE PARTITION — the two parts of a plan, and the sub-groups of FOOD
//
// A nutrition plan is not a list. The document this product was built against
// has SIX headings — DAILY NON-NEGOTIABLES, SUPPLEMENTS, WEEKLY TARGETS, WHAT
// WE ARE CUTTING, MOVEMENT AND RECOVERY, WHAT I WANT TO SEE — and the screen
// gave the coach one flat column of eighteen rows in which a magnesium, a
// bedtime and a weekly weigh-in had exactly the same weight. The coach could
// not find the shape of their own plan in it.
//
// So every line is placed in one of THREE parts, and the split is the one a
// coach already has in their head:
//
//   FOOD          what the client EATS. `nutrition` + `supplement`.
//   ACTIONS       what the client DOES. movement, recovery, exposure, sleep,
//                 mind, measurement, other.
//   OBSERVATIONS  what is merely WATCHED — every `capture` line, whatever its
//                 family. Not a thing to hold, so it never enters the count of
//                 things to hold.
//
// WHY SUPPLEMENTS SIT WITH FOOD, and not with the actions. It was argued the
// other way — a capsule is a gesture, like a walk — and the coach's own
// document settles it twice over:
//
//   1. Her SUPPLEMENTS section sits between DAILY NON-NEGOTIABLES and WEEKLY
//      TARGETS, inside the eating protocol, and its rules are eating rules:
//      "with breakfast, with fat", "on an empty stomach", "2 hours away from
//      any dairy". None of that means anything next to a cardio session.
//   2. The line that decides it: "Omega-3: 2 g of EPA+DHA per day — I do not
//      mind whether that comes from a capsule or from the food". One line, and
//      the live extraction typed it `supplement` while the reference fixture
//      types it `nutrition`. If the supplement/nutrition boundary were also the
//      FOOD/ACTIONS boundary, that single line would jump between the two
//      halves of the screen depending on which way the extractor guessed. A
//      partition must not be able to hinge on a coin flip.
//
// INSIDE FOOD, the sub-groups are the coach's headings, not our enums: a coach
// thinks "every day / every week / what we are cutting / supplements", never
// "evaluation_grain=week".
// ===========================================================================

/**
 * The subset of a commitment the structure reads.
 *
 * The first three columns decide the PART and the food sub-group, and they are
 * the whole partition — nothing derived may enter it, or a line would move
 * section because it was graded.
 *
 * `slot_key` is read by ONE thing only: the `occasion` reading order, which the
 * student's day asks for. It never decides where a line is filed, which is why
 * it is optional: a template being composed has no day around it.
 */
export interface PlanPartShape {
  polarity: string;
  activity_class: string;
  evaluation_grain: string;
  slot_key?: string | null;
}

export type PlanPart = "food" | "actions" | "observations" | "unsorted";
export type FoodSection = "every_day" | "every_week" | "cutting" | "supplements";

/**
 * The order the parts are read in, on every screen.
 *
 * OBSERVATIONS LAST, and `unsorted` above them, which is not a detail: a line
 * whose family we could not place is a thing the coach must FIX, so it sits
 * with the plan; a weigh-in is a thing that is merely watched, so it closes the
 * page as a footnote. Putting the footnote above the thing that needs a
 * decision is how the decision gets missed.
 */
export const PLAN_PART_ORDER: readonly PlanPart[] = [
  "food",
  "actions",
  "unsorted",
  "observations",
];

/**
 * The reading order of the food sub-groups.
 *
 * The daily rules first because they are the ones that run today; the weekly
 * targets next; then the two sections that are not about adding something —
 * what is being cut, and the capsules. The coach's own document orders
 * supplements second, but on a screen the coach scans every day, "what my
 * client eats" reads better whole before the protocol that sits beside it.
 */
export const FOOD_SECTION_ORDER: readonly FoodSection[] = [
  "every_day",
  "every_week",
  "cutting",
  "supplements",
];

/**
 * The order the families are read in, inside ACTIONS.
 *
 * It mirrors `ACTIVITY_CLASS` in `_shared/keel/tokens.ts` — one vocabulary, one
 * order, so the coach's editor and the student's day list the same families the
 * same way (R1). `todayModel.ts` carries the same list under the name
 * `ACTIVITY_CLASS_ORDER` for its own per-family tallies; `planStructure.int.test.ts`
 * pins the two together so a family added to one can never be missing from the
 * other. The copy is deliberate: importing it from `todayModel` would make the
 * structure of a plan depend on the model of one day, and a plan being composed
 * has no day at all.
 */
export const FAMILY_ORDER: readonly string[] = [
  "nutrition",
  "supplement",
  "movement",
  "recovery",
  "exposure",
  "sleep",
  "mind",
  "measurement",
  "other",
];

const FOOD_CLASSES: ReadonlySet<string> = new Set(["nutrition", "supplement"]);

const ACTION_CLASSES: ReadonlySet<string> = new Set([
  "movement",
  "recovery",
  "exposure",
  "sleep",
  "mind",
  "measurement",
  "other",
]);

// Loud, once per unknown family per session. Not once per render: this is
// called for every line on every keystroke of the import screen, and a console
// that scrolls is a console nobody reads.
const reportedUnknownClasses = new Set<string>();

/** A session starts having reported nothing. Test seam; no screen calls it. */
export function resetUnknownFamilyReports(): void {
  reportedUnknownClasses.clear();
}

/**
 * WHERE A LINE IS READ. Never throws.
 *
 * The label mappers of `labels.ts` throw on an unknown token, and they are
 * right to: they render rows Postgres already accepted. This one also runs on
 * the import screen, over a DRAFT — and a draft whose `activity_class` the
 * parser could not type is the normal case there, the one the coach is on the
 * screen to fix. Throwing would blank the whole review over a line the editor
 * exists to repair.
 *
 * It does not silently pick a side either (R7): an untypable family lands in
 * its own `unsorted` part — visible, counted apart, never filed under a heading
 * the coach never wrote — and it says so on the console, once per family per
 * session. "Once" is what makes it readable; being SILENT, or being filed under
 * `other`, is what makes a mis-typed prescription invisible.
 */
export function planPartOf(c: PlanPartShape): PlanPart {
  // Polarity first, and this order is the whole rule for a capture line: a
  // weekly weigh-in is `measurement`, a breakfast photo is `measurement`, and
  // neither is something the student is asked to hold.
  if (c.polarity === "capture") return "observations";
  if (FOOD_CLASSES.has(c.activity_class)) return "food";
  if (ACTION_CLASSES.has(c.activity_class)) return "actions";
  if (!reportedUnknownClasses.has(c.activity_class)) {
    reportedUnknownClasses.add(c.activity_class);
    console.error(
      `[keel/planStructure] no part of the plan holds the family ` +
        `"${c.activity_class}" — the line is shown unsorted rather than filed ` +
        `under a heading the coach never wrote (R7)`,
    );
  }
  return "unsorted";
}

/**
 * WHICH SUB-GROUP OF FOOD, in the coach's own words.
 *
 * `avoid` wins over the family: "no creatine after 6pm" is a thing being cut,
 * and reading it under "Supplements" — a list of things to take — inverts it.
 */
export function foodSectionOf(c: PlanPartShape): FoodSection {
  if (c.polarity === "avoid") return "cutting";
  if (c.activity_class === "supplement") return "supplements";
  if (c.evaluation_grain === "week") return "every_week";
  return "every_day";
}

// ===========================================================================
// THE STRUCTURE AS A VALUE
// ===========================================================================

/**
 * WHOSE WORDS. The partition is identical in both voices — one line belongs to
 * the same part on every screen — but the headings are not: a coach is signing
 * a prescription ("Food"), a student is opening their own day ("What I eat").
 * Two word sets, one structure; `labels.ts` holds both and this is the switch.
 */
export type PlanVoice = "coach" | "student";

/**
 * THE READING ORDER INSIDE A SUB-SECTION. The one thing the two readers do not
 * share, and the reason it is a parameter and not a second function.
 *
 *   "as_given"  the caller's own order is kept, untouched. The coach's review
 *               sorts its lines by what still needs a decision, and that sort
 *               must survive the sectioning.
 *   "occasion"  the order of the DAY: on waking, breakfast, lunch, before bed,
 *               then the lines that name no moment. A student does not read
 *               their food alphabetically or in the order the extractor emitted
 *               it; they read it forward through their day.
 *
 * "occasion" is a STABLE sort: two lines at the same occasion keep the order
 * they came in, so a caller can still pre-sort within a meal.
 */
export type PlanReadingOrder = "as_given" | "occasion";

/** The occasions of the day, in the vocabulary's own order. */
export interface SlotOrder {
  key: string;
  sort_order: number;
}

/**
 * What keyed a sub-section. Carried so a caller can branch on the KIND without
 * parsing the key — and so the key itself, which is an internal token, never
 * has to be printed to tell "Supplements" (a food sub-group) apart from
 * "Supplement" (a family chip).
 */
export type PlanSubsectionKind = "food_section" | "activity_class";

export interface PlanSubsection<T> {
  kind: PlanSubsectionKind;
  /**
   * The token that grouped these lines — `every_day`, `movement`. INTERNAL:
   * it keys React lists and chips. It is never rendered as text; `label` is.
   */
  key: string;
  /** The heading a human reads. Already resolved — no caller-side lookup. */
  label: string;
  lines: T[];
}

export interface PlanSection<T> {
  part: PlanPart;
  /** "Food" / "What I eat", per `voice`. */
  label: string;
  /** The sentence under the heading: what belongs in this part. */
  hint: string;
  /**
   * FOOD: the coach's four headings. ACTIONS: the families.
   * OBSERVATIONS and UNSORTED: empty — neither has a sub-group, and inventing
   * one would give a weigh-in a category it does not have.
   */
  subsections: PlanSubsection<T>[];
  /** Every line of the part, once, in the order the sub-sections read them. */
  lines: T[];
  count: number;
}

export interface PlanStructure<T> {
  /**
   * In `PLAN_PART_ORDER`, with the EMPTY PARTS DROPPED. An empty part is not
   * "0 lines", it is a part this plan does not have: a coach whose document
   * has no movement in it must not be shown an "Actions — 0" heading and left
   * wondering what they forgot.
   */
  sections: PlanSection<T>[];
  /** Every line handed in, counted once. */
  total: number;
  /**
   * THE SIZE OF THE PLAN — `total` minus the observations.
   *
   * A weigh-in, an energy rating and a breakfast photo are watched, never held,
   * and the import screen already says so in as many words. The headline number
   * on every screen must agree with that: a fifteen-line plan does not become
   * an eighteen-line plan because three of its lines are captures.
   */
  toHold: number;
  /** The observations, counted apart — shown beside `toHold`, never inside it. */
  observed: number;
}

export interface PlanStructureOptions {
  /** Default `coach`: this module was extracted from the coach's review screen. */
  voice?: PlanVoice;
  /** Default `as_given`. `occasion` needs `slotOrder`. */
  order?: PlanReadingOrder;
  /**
   * The slot vocabulary, required by the `occasion` order. Passing it is how a
   * screen says "I have a day around me"; a template editor has none, and that
   * is precisely why the two readings differ in this and nothing else.
   */
  slotOrder?: readonly SlotOrder[];
}

function sectionLabels(part: PlanPart, voice: PlanVoice): { label: string; hint: string } {
  return voice === "student"
    ? { label: studentPartLabel(part), hint: studentPartHint(part) }
    : { label: planPartLabel(part), hint: planPartHint(part) };
}

/**
 * THE ORDER OF THE DAY, applied to one sub-section.
 *
 * R7 at the boundary, the same posture `buildTodayView` takes: a `slot_key` the
 * vocabulary does not know THROWS. Sorting it silently to one end would move a
 * prescribed line to a place nobody can explain, and the alternative everybody
 * reaches for — treating it as "no occasion" — hides the drift entirely.
 *
 * A line that names no occasion is not late and not early: it has no moment, so
 * it reads after the ones that do.
 */
function byOccasion<T>(
  lines: readonly T[],
  shapeOf: (item: T) => PlanPartShape,
  slotOrder: readonly SlotOrder[],
): T[] {
  const rank = new Map(slotOrder.map((s) => [s.key, s.sort_order]));
  const NO_OCCASION = Number.MAX_SAFE_INTEGER;
  const rankOf = (item: T): number => {
    const key = shapeOf(item).slot_key;
    if (key === null || key === undefined || key === NO_SLOT_BUCKET) return NO_OCCASION;
    const found = rank.get(key);
    if (found === undefined) {
      throw new Error(
        `[keel/plan-structure] a line sits on the occasion "${key}", absent from ` +
          `the slot vocabulary — refusing to place a prescribed line by guesswork (R7)`,
      );
    }
    return found;
  };
  // `map` + index keeps the sort stable across engines and, more to the point,
  // keeps it stable across a caller's own pre-sort.
  return lines
    .map((item, index) => ({ item, index, rank: rankOf(item) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.item);
}

/**
 * THE PLAN, IN SECTIONS. Pure: no clock, no I/O, no allocation of new lines —
 * every `T` in the result is one the caller passed in.
 *
 * PARTITION, NOT A FILTER. Summing `section.count` over the result equals
 * `total`, and every input line appears in exactly one section (and, where the
 * part has sub-sections, in exactly one of them). A line that fell out would be
 * a prescription nobody ever sees; the tests pin the count for that reason, and
 * the throw below pins it at runtime.
 *
 * STABLE WITHIN A GROUP under `as_given`: input order is preserved inside every
 * sub-section, so a caller that has already sorted its lines (by attention on
 * the import screen) keeps that sort.
 */
export function buildPlanStructure<T>(
  items: readonly T[],
  shapeOf: (item: T) => PlanPartShape,
  options: PlanStructureOptions = {},
): PlanStructure<T> {
  const voice = options.voice ?? "coach";
  const order = options.order ?? "as_given";
  if (order === "occasion" && !options.slotOrder) {
    throw new Error(
      `[keel/plan-structure] the "occasion" reading order is the order of the ` +
        `day and cannot be built without the slot vocabulary (R7)`,
    );
  }
  const read = (lines: readonly T[]): T[] =>
    order === "occasion" ? byOccasion(lines, shapeOf, options.slotOrder!) : [...lines];

  const byPart = new Map<PlanPart, T[]>();
  for (const item of items) {
    const part = planPartOf(shapeOf(item));
    const bucket = byPart.get(part);
    if (bucket) bucket.push(item);
    else byPart.set(part, [item]);
  }

  const sections: PlanSection<T>[] = [];
  for (const part of PLAN_PART_ORDER) {
    const lines = read(byPart.get(part) ?? []);
    if (lines.length === 0) continue;

    let subsections: PlanSubsection<T>[] = [];
    if (part === "food") {
      subsections = FOOD_SECTION_ORDER
        .map((section: FoodSection): PlanSubsection<T> => ({
          kind: "food_section",
          key: section,
          label: foodSectionLabel(section),
          lines: lines.filter((l) => foodSectionOf(shapeOf(l)) === section),
        }))
        .filter((g) => g.lines.length > 0);
    } else if (part === "actions") {
      subsections = FAMILY_ORDER
        .map((activityClass): PlanSubsection<T> => ({
          kind: "activity_class",
          key: activityClass,
          label: activityLabel(activityClass),
          lines: lines.filter((l) => shapeOf(l).activity_class === activityClass),
        }))
        .filter((g) => g.lines.length > 0);
    }

    // A sub-grouping that lost a line is a bug in the grouping rule, not a
    // display detail: the line would vanish off a screen that claims to show
    // the whole plan. `foodSectionOf` is total and `FAMILY_ORDER` mirrors the
    // enum, so this can only fire on a vocabulary drift — and then it fires
    // loudly, with the part named (R7).
    if (subsections.length > 0) {
      const grouped = subsections.reduce((n, g) => n + g.lines.length, 0);
      if (grouped !== lines.length) {
        throw new Error(
          `[keel/plan-structure] the part "${part}" holds ${lines.length} lines ` +
            `but its sub-sections account for ${grouped} — refusing to render a ` +
            `plan with a line missing from it (R7)`,
        );
      }
    }

    // The part's own list follows the sub-sections' reading order, so
    // `section.lines` and the flattened sub-sections are the same sequence.
    const ordered = subsections.length > 0 ? subsections.flatMap((g) => g.lines) : lines;

    sections.push({
      part,
      ...sectionLabels(part, voice),
      subsections,
      lines: ordered,
      count: ordered.length,
    });
  }

  const observed = (byPart.get("observations") ?? []).length;
  const placed = sections.reduce((n, s) => n + s.count, 0);
  if (placed !== items.length) {
    throw new Error(
      `[keel/plan-structure] the partition lost a line: ${placed} placed out of ` +
        `${items.length} handed in — refusing to show a plan that is missing one (R7)`,
    );
  }
  return {
    sections,
    total: items.length,
    toHold: items.length - observed,
    observed,
  };
}

/** The section for one part, or null when this plan has no line in it. */
export function sectionFor<T>(
  structure: PlanStructure<T>,
  part: PlanPart,
): PlanSection<T> | null {
  return structure.sections.find((s) => s.part === part) ?? null;
}
