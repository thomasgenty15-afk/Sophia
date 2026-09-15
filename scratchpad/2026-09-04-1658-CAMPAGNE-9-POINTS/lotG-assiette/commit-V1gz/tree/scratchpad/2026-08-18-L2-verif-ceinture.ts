// VÉRIFICATION L2 — la ceinture energy_number et la liste COUNTABLE.
// Module pur, aucune base.
import {
  acceptComposedWeekReview, allowedWeekNumbers, computeWeekReview,
} from "../supabase/functions/_shared/keel/week_review.ts";
import {
  acceptComposedWeekReview as acceptHEAD, computeWeekReview as computeHEAD,
} from "../supabase/functions/_shared/keel/zz_week_review_HEAD_verif.ts";

const base = {
  weekStart: "2026-08-10",
  weekEnd: "2026-08-16",
  weekDates: ["2026-08-10","2026-08-11","2026-08-12","2026-08-13","2026-08-14","2026-08-15","2026-08-16"],
  facts: [] as never[],
  pulses: [] as never[],
  protocol: null,
};
const sessions = [
  { localDate: "2026-08-10", kind: "strength", durationMin: 45, intensity: "hard" },
  { localDate: "2026-08-10", kind: "cardio", durationMin: 20, intensity: "easy" },
  { localDate: "2026-08-12", kind: "mobility", durationMin: null, intensity: null },
];
// deno-lint-ignore no-explicit-any
const reading = computeWeekReview({ ...base, activity: sessions } as any);
// deno-lint-ignore no-explicit-any
const readingHEAD = computeHEAD({ ...base } as any);

console.log("résumé activité :", JSON.stringify(reading.activity));
console.log("nombres permis  :", [...allowedWeekNumbers(reading)].sort((a, b) => a - b).join(","));
console.log("");

const cases: Array<[string, string]> = [
  ["kcal (séance)",      "Thanks — that's saved. Those 3 sessions cost you about 450 kcal."],
  ["calories (mot)",     "Thanks — that's saved. You burned roughly 300 calories training."],
  ["kilojoules",         "Thanks — that's saved. That is about 1800 kilojoules of energy burned."],
  ["Kcals pluriel",      "Thanks — that's saved. Around 500 Kcals went out this week."],
  ["CAS PASSANT nominal","Thanks — that's saved. You also logged 3 training sessions across 2 days."],
  ["CAS PASSANT minutes","Thanks — that's saved. You also logged 3 training sessions across 2 days, 65 minutes on 2 of them."],
  ["INVENTÉ: 5 sessions","Thanks — that's saved. You also logged 5 sessions across 2 days."],
  ["INVENTÉ: 9 workouts","Thanks — that's saved. You also logged 9 workouts across 2 days."],
  ["INVENTÉ: 300 minutes","Thanks — that's saved. You trained for 300 minutes across 2 days."],
];
console.log("── APRÈS le lot (module modifié) ──");
for (const [label, text] of cases) {
  const v = acceptComposedWeekReview(text, reading);
  console.log(`  ${label.padEnd(22)} → ${v.ok ? "OK (accepté)" : `REFUS ${v.reason} [${v.detail}]`}`);
}
console.log("");
console.log("── AVANT le lot (week_review.ts tel qu'il est à HEAD) ──");
for (const [label, text] of cases) {
  // deno-lint-ignore no-explicit-any
  const v = acceptHEAD(text, readingHEAD as any);
  console.log(`  ${label.padEnd(22)} → ${v.ok ? "OK (accepté)" : `REFUS ${v.reason} [${v.detail}]`}`);
}
