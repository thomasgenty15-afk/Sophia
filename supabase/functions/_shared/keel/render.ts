// KEEL render layer — deterministic, zero LLM, zero I/O.
// Authority: docs/keel/CONTRACT.md + docs/keel/SCHEMA.md.
// R1: tokens in, LOCALIZED content out — la traduction est le travail de cette
// couche, et elle le fait maintenant vraiment: `en` et `fr` ont chacun leur pack.
// R7: every token mapping below throws on unknown input — no silent fallback,
// y compris pour une LANGUE qu'on n'a pas livrée.

import { type LocalePackKey, localePackKey } from "./locale.ts";

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

/**
 * TOUT CE QUI PORTE LA LANGUE SUR CETTE SURFACE, dans UN objet par locale.
 *
 * Les tables étaient des constantes de module et les phrases des littéraux au
 * fil du code: `renderSundayDigest` et `renderSlotReminder` prenaient pourtant
 * DÉJÀ un `locale` requis, qu'elles n'utilisaient que pour jeter si ce n'était
 * pas `"en"`. Le paramètre existait, la langue non — c'est la forme la plus
 * discrète d'une garde désarmée: elle a l'air branchée en relecture.
 *
 * Regrouper par pack plutôt que d'ajouter des `isFrenchLocale(...)` au fil des
 * lignes: une phrase oubliée dans une branche ne se voit pas, une clé manquante
 * dans un pack ne compile pas.
 */
type RenderPack = {
  /** Forme PRÉPOSITIONNELLE, collée dans une énumération: « at breakfast ». */
  slotLabels: Record<string, string>;
  /**
   * Même vocabulaire, forme NOMINALE — un titre de rappel demande « Breakfast »
   * et pas « at breakfast ». Deux formes grammaticales côte à côte, dans le même
   * fichier: la divergence que ce dépôt paie est deux VOCABULAIRES dans deux
   * modules, pas deux formes voisines. Chaque clé de `slotLabels` doit exister
   * ici (piné par un test).
   */
  slotHeadings: Record<string, string>;
  dayLabels: Record<string, string>;
  monthLabels: readonly string[];
  priorityHeadings: Record<string, string>;
  digestOpening: (firstName: string, weekStart: string) => string;
  digestFooter: readonly string[];
  reminderHeadline: (slotHeading: string) => string;
  reminderFooter: string;
  cadenceDaily: string;
  cadenceTimesThisWeek: (times: number) => string;
  /** « Mon 4 Aug » vs « lun. 4 août » — l'ordre des composants change. */
  weekStartFormat: (dayLabel: string, dayOfMonth: number, monthLabel: string) => string;
};

const RENDER_PACKS: Record<LocalePackKey, RenderPack> = {
  en: {
    // SCHEMA slot_vocabulary seed — global, meal and non-meal slots unified.
    slotLabels: {
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
    },
    slotHeadings: {
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
    },
    // SCHEMA scheduled_days CHECK vocabulary.
    dayLabels: {
      mon: "Mon",
      tue: "Tue",
      wed: "Wed",
      thu: "Thu",
      fri: "Fri",
      sat: "Sat",
      sun: "Sun",
    },
    monthLabels: [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ],
    priorityHeadings: {
      core: "Core",
      secondary: "Also on the plan",
      optional: "Optional",
    },
    digestOpening: (firstName, weekStart) =>
      `Hi ${firstName} — here is what your plan holds for the week of ${weekStart}.`,
    digestFooter: [
      "This is just a heads-up — nothing to confirm or validate.",
      "Any days you already know will be off-plan? Just tell me.",
    ],
    reminderHeadline: (heading) => `${heading} — on your plan today:`,
    reminderFooter: "Tell me here whenever you get to it.",
    cadenceDaily: "daily",
    cadenceTimesThisWeek: (times) => `${times}x this week`,
    weekStartFormat: (dayLabel, dayOfMonth, monthLabel) =>
      `${dayLabel} ${dayOfMonth} ${monthLabel}`,
  },
  fr: {
    // Formes PRÉPOSITIONNELLES: le français contracte (« à + le » = « au »),
    // d'où des libellés portés entiers plutôt qu'assemblés par du code.
    slotLabels: {
      on_waking: "au réveil",
      breakfast: "au petit-déjeuner",
      snack_am: "à la collation du matin",
      pre_workout: "avant l'entraînement",
      lunch: "au déjeuner",
      post_workout: "après l'entraînement",
      snack_pm: "à la collation de l'après-midi",
      dinner: "au dîner",
      before_bed: "avant le coucher",
      any_meal: "à n'importe quel repas",
      any_time: "à n'importe quel moment",
    },
    slotHeadings: {
      on_waking: "Au réveil",
      breakfast: "Petit-déjeuner",
      snack_am: "Collation du matin",
      pre_workout: "Avant l'entraînement",
      lunch: "Déjeuner",
      post_workout: "Après l'entraînement",
      snack_pm: "Collation de l'après-midi",
      dinner: "Dîner",
      before_bed: "Avant le coucher",
      any_meal: "N'importe quel repas",
      any_time: "N'importe quand",
    },
    dayLabels: {
      mon: "lun.",
      tue: "mar.",
      wed: "mer.",
      thu: "jeu.",
      fri: "ven.",
      sat: "sam.",
      sun: "dim.",
    },
    monthLabels: [
      "janv.", "févr.", "mars", "avr.", "mai", "juin",
      "juil.", "août", "sept.", "oct.", "nov.", "déc.",
    ],
    priorityHeadings: {
      core: "L'essentiel",
      secondary: "Aussi au programme",
      optional: "En option",
    },
    digestOpening: (firstName, weekStart) =>
      `Salut ${firstName} — voici ce que ton plan prévoit pour la semaine du ${weekStart}.`,
    digestFooter: [
      "C'est juste pour t'informer — rien à confirmer ni à valider.",
      "Des jours dont tu sais déjà qu'ils seront hors plan ? Dis-le-moi.",
    ],
    reminderHeadline: (heading) => `${heading} — à ton plan aujourd'hui :`,
    reminderFooter: "Dis-le-moi ici quand tu t'en occupes.",
    cadenceDaily: "tous les jours",
    cadenceTimesThisWeek: (times) => `${times}x cette semaine`,
    weekStartFormat: (dayLabel, dayOfMonth, monthLabel) =>
      `${dayLabel} ${dayOfMonth} ${monthLabel}`,
  },
};

/**
 * Le pack de rendu d'une locale. R7 par délégation: `localePackKey` jette pour
 * une langue non livrée. C'est le MÊME refus qu'avant (`locale !== "en"`), au
 * même endroit du flux — remplacer un throw par un repli silencieux serait la
 * seule régression possible ici.
 */
function renderPackFor(locale: string): RenderPack {
  return RENDER_PACKS[localePackKey(locale)];
}

// SCHEMA plan_commitments.priority CHECK vocabulary, in display order.
const PRIORITY_ORDER = ["core", "secondary", "optional"] as const;

/**
 * R7: fail loudly — unknown token never degrades into undefined or a fallback.
 *
 * Renommé depuis `labelFor`: il prend une MAP, là où le `labelFor` public de
 * `labels.ts` prend un vocab et un pack. Deux fonctions homonymes aux
 * signatures différentes dans le même domaine se lisent comme un doublon, et
 * quelqu'un finit par « dédupliquer » la mauvaise.
 */
function lookupOrThrow(map: Record<string, string>, token: string, kind: string): string {
  const label = map[token];
  if (label === undefined) {
    throw new Error(`R7: unknown ${kind} token "${token}"`);
  }
  return label;
}

// R7: strict ISO date parse; anything else throws.
function formatWeekStart(isoDate: string, pack: RenderPack): string {
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
  const dayToken = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][utc.getUTCDay()];
  return pack.weekStartFormat(
    pack.dayLabels[dayToken],
    Number(d),
    pack.monthLabels[utc.getUTCMonth()],
  );
}

function cadenceLabel(c: SundayDigestCommitment, pack: RenderPack): string | null {
  if (c.scheduledDays !== null) {
    // R7: each day token validated individually.
    return c.scheduledDays.map((d) => lookupOrThrow(pack.dayLabels, d, "day")).join(", ");
  }
  if (c.requiredDaysPerWeek !== null) {
    if (c.requiredDaysPerWeek === 7) return pack.cadenceDaily;
    return pack.cadenceTimesThisWeek(c.requiredDaysPerWeek);
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
  // R7: une langue sans pack livré JETTE — elle ne retombe pas en silence sur
  // l'anglais comme si c'était une traduction. Même refus qu'avant, désormais
  // porté par `localePackKey` pour qu'il n'existe qu'à un seul endroit.
  const pack = renderPackFor(args.locale);
  if (args.commitments.length === 0) {
    // R7 spirit: an empty digest is a caller bug, not a message to send.
    throw new Error("renderSundayDigest: refusing to render a digest with zero commitments");
  }

  const lines: string[] = [];
  lines.push(
    pack.digestOpening(
      args.studentFirstName,
      formatWeekStart(args.weekStartDate, pack),
    ),
  );

  for (const priority of PRIORITY_ORDER) {
    const group = args.commitments.filter(
      // R7: validate every priority token, including ones outside the current group.
      (c) =>
        lookupOrThrow(pack.priorityHeadings, c.priority, "priority") ===
          pack.priorityHeadings[priority],
    );
    if (group.length === 0) continue;
    lines.push("");
    lines.push(`${pack.priorityHeadings[priority]}:`);
    for (const c of group) {
      const details: string[] = [];
      if (c.slotKey !== null) {
        details.push(lookupOrThrow(pack.slotLabels, c.slotKey, "slot"));
      }
      const cadence = cadenceLabel(c, pack);
      if (cadence !== null) details.push(cadence);
      lines.push(details.length > 0 ? `- ${c.title} (${details.join(", ")})` : `- ${c.title}`);
    }
  }

  lines.push("");
  lines.push(...pack.digestFooter);
  return lines.join("\n");
}

/**
 * R7 slot-token lookups, exported so no other module ever redeclares the
 * vocabulary. `locale` est REQUIS: sans lui ces deux-là rendaient l'anglais à
 * tout appelant, y compris depuis un rendu français.
 */
export function slotLabel(slotKey: string, locale: string): string {
  return lookupOrThrow(renderPackFor(locale).slotLabels, slotKey, "slot");
}

export function slotHeading(slotKey: string, locale: string): string {
  return lookupOrThrow(renderPackFor(locale).slotHeadings, slotKey, "slot");
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
  const pack = renderPackFor(args.locale);
  if (args.commitments.length === 0) {
    // R7 spirit: an empty reminder is a caller bug, not a message to send.
    throw new Error("renderSlotReminder: refusing to render a reminder with zero commitments");
  }
  const lines: string[] = [
    pack.reminderHeadline(
      lookupOrThrow(pack.slotHeadings, args.slotKey, "slot"),
    ),
  ];
  for (const c of args.commitments) {
    const instruction = c.studentInstruction === null ? "" : c.studentInstruction.trim();
    lines.push(instruction === "" ? `- ${c.title}` : `- ${c.title} — ${instruction}`);
  }
  lines.push("");
  lines.push(pack.reminderFooter);
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
