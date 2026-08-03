// KEEL — meal-plan copy, staged for `frontend/src/keel/i18n/en.ts`.
//
// I18N HAND-OFF. Another wave owns `en.ts` this round, so this file is the
// literal hand-off — the same pattern CardsPage used for W8: the keys below are
// the exact message keys to add, the values are the exact English strings.
// Whoever owns the seed pastes this object in and the call sites swap `c(` for
// `t(`; no key name changes.
//
// The rule that governs every string here: a coach reads product English, never
// our storage vocabulary. No column name, no table name, no function name, no
// enum value. That rule was learned the expensive way — the first dietitian to
// open the import screen was shown three internal identifiers on the product's
// front door — and a CI lint now protects the seed itself.

export const MEAL_COPY = {
  // ---- coach page -------------------------------------------------------
  "meals.title": "Meal plan",
  "meals.subtitle":
    "You write the meals. Your student reads them as suggestions — nothing here is ever scored.",
  "meals.for_student": "For {name}",
  "meals.back_to_student": "Back to this student",
  "meals.loading": "Loading the week...",
  "meals.error": "Something went wrong: {message}",
  "meals.no_plan_title": "No published plan yet",
  "meals.no_plan_body":
    "A meal week hangs off a published plan. Publish this student's plan first, then come back and compose.",

  // ---- the wall, said in words on the screen -----------------------------
  "meals.not_scored_title": "Meals are not scored",
  "meals.not_scored_body":
    "Adherence is measured on the lines you wrote in the plan, and on nothing else. Meals are here to make those lines easy to hit, not to add anything to hit.",

  // ---- the library -------------------------------------------------------
  "meals.library.title": "Your dishes",
  "meals.library.subtitle":
    "Write a dish once. Reuse it across days, weeks and students.",
  "meals.library.empty": "No dishes yet. Write the first one below.",
  "meals.library.new": "Write a dish",
  "meals.library.name_label": "Name of the dish",
  "meals.library.name_placeholder": "Greek yogurt, berries and walnuts",
  "meals.library.description_label": "What is in it (optional)",
  "meals.library.description_placeholder":
    "200g yogurt, a handful of berries, a small handful of walnuts.",
  "meals.library.slot_label": "Usually eaten at",
  "meals.library.slot_any": "No fixed moment",
  "meals.library.groups_label": "What it puts on the plate",
  "meals.library.groups_hint":
    "Tick what the dish actually contains. This is what lets the week below tell you which of your own nutrition lines it covers.",
  "meals.library.save": "Add the dish",
  "meals.library.saving": "Adding...",
  "meals.library.cancel": "Cancel",
  "meals.library.select": "Use this dish",
  "meals.library.selected": "Selected — now click a day",
  "meals.library.clear_selection": "Cancel selection",
  "meals.library.archive": "Remove",
  "meals.library.archive_confirm":
    "Remove this dish? It comes off every day it is on.",
  "meals.library.no_groups": "Nothing ticked",

  // ---- the grid ----------------------------------------------------------
  "meals.grid.title": "The week",
  "meals.grid.slot_column": "Moment of the day",
  "meals.grid.hint_idle":
    "Pick a dish above, then click the days you want it on.",
  "meals.grid.hint_holding":
    "Click any cell to place {title}. Once it is down, Repeat puts it on the other days in one more click.",
  "meals.grid.add_here": "Place here",
  "meals.grid.remove": "Remove",
  "meals.grid.repeat": "Repeat",
  "meals.grid.repeat_weekdays": "Monday to Friday",
  "meals.grid.repeat_week": "Every day",
  "meals.grid.empty_cell": "—",
  "meals.grid.unknown_dish": "Removed dish",
  "meals.grid.placed_one": "Placed on 1 day.",
  "meals.grid.placed_many": "Placed on {count} days.",
  "meals.grid.placed_none": "Already on every day you picked.",
  "meals.grid.placed_partial":
    "Placed on {count} of {requested} days — it was already on the others.",

  // ---- coverage ----------------------------------------------------------
  "meals.coverage.title": "What this week covers",
  "meals.coverage.subtitle":
    "Your own nutrition lines, against the dishes you have placed. This is for you: your student never sees it, and it changes nothing about their adherence.",
  "meals.coverage.no_lines":
    "This plan has no nutrition lines with a food group, so there is nothing to compare the week against.",
  "meals.coverage.empty_day": "Nothing placed",
  "meals.coverage.count": "{placed} of {required}",
  "meals.coverage.equivalent_one": "plus 1 similar",
  "meals.coverage.equivalent_many": "plus {count} similar",
  "meals.coverage.equivalent_hint":
    "A dish from the same family, which counts only if that line allows swaps.",
  "meals.coverage.conflict": "{title} — {count} dish here carries it",
  "meals.coverage.conflict_many": "{title} — {count} dishes here carry it",
  "meals.coverage.not_shown_one": "1 line this grid cannot speak about",
  "meals.coverage.not_shown_many": "{count} lines this grid cannot speak about",
  "meals.coverage.not_shown_hint":
    "These lines name no food group, so no arrangement of dishes can confirm them. They are listed rather than quietly left out.",

  // ---- student side ------------------------------------------------------
  "meals.student.title": "Meal suggestions",
  "meals.student.subtitle":
    "Ideas from your coach for what to eat, and when. Suggestions only — none of this is tracked and none of it counts for or against you.",
  "meals.student.empty":
    "Your coach has not put any meal ideas up yet. Your plan is unaffected.",
  "meals.student.today": "Today",
  "meals.student.loading": "Loading...",
  "meals.student.error": "Your meal suggestions could not be loaded: {message}",
} as const;

export type MealCopyKey = keyof typeof MEAL_COPY;

/** Same interpolation contract as `t()`: `{name}` placeholders, params by key. */
export function c(
  key: MealCopyKey,
  params?: Record<string, string | number>,
): string {
  const template: string = MEAL_COPY[key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = params[name];
    return value === undefined ? whole : String(value);
  });
}
