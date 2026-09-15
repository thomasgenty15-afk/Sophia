// VÉRIFICATION L2 — COUNTABLE: aveugle AVANT, voyante APRÈS.
// Textes qui ne portent QU'UN SEUL nombre, pour qu'aucun autre motif ne morde.
import { acceptComposedWeekReview, computeWeekReview } from "../supabase/functions/_shared/keel/week_review.ts";
import { acceptComposedWeekReview as acceptHEAD, computeWeekReview as computeHEAD } from "../supabase/functions/_shared/keel/zz_week_review_HEAD_verif.ts";

const base = {
  weekStart: "2026-08-10", weekEnd: "2026-08-16",
  weekDates: ["2026-08-10","2026-08-11","2026-08-12","2026-08-13","2026-08-14","2026-08-15","2026-08-16"],
  facts: [] as never[], pulses: [] as never[], protocol: null,
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
console.log("permis APRÈS:", [...new Set([0,1,2,3,7,65])].join(","), "| permis AVANT: 0,7\n");

// 5, 9, 300 ne sont permis NI avant NI après. Seul le NOM change la visibilité.
const probes: Array<[string,string]> = [
  ["5 sessions",  "Thanks. You also logged 5 sessions."],
  ["9 workouts",  "Thanks. You also logged 9 workouts."],
  ["300 minutes", "Thanks. You trained for 300 minutes."],
  ["CONTRÔLE 5 meals (nom déjà dans l'ancienne liste)", "Thanks. You also logged 5 meals."],
];
for (const [label, text] of probes) {
  // deno-lint-ignore no-explicit-any
  const before = acceptHEAD(text, readingHEAD as any);
  const after = acceptComposedWeekReview(text, reading);
  console.log(
    `${label.padEnd(52)} AVANT=${(before.ok ? "ACCEPTÉ (aveugle)" : `REFUS ${before.reason}`).padEnd(22)} APRÈS=${after.ok ? "ACCEPTÉ" : `REFUS ${after.reason}`}`,
  );
}
