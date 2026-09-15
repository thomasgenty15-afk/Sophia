// Mesure ③ — le curseur de prise sature-t-il, et à partir de quel cran ?
import {
  executedPaceFor,
  paceCeilingFor,
} from "../supabase/functions/_shared/keel/weight_pace.ts";

const bodies = [
  { label: "H 70 kg 175 cm 30 ans, on_feet", body: { weightKg: 70, heightCm: 175, gender: "male" as const, ageYears: 30, activityLevel: "on_feet" as const }, isMinor: false },
  { label: "F 60 kg 165 cm 28 ans, sedentary", body: { weightKg: 60, heightCm: 165, gender: "female" as const, ageYears: 28, activityLevel: "sedentary" as const }, isMinor: false },
  { label: "H 90 kg 185 cm 40 ans, trains_hard", body: { weightKg: 90, heightCm: 185, gender: "male" as const, ageYears: 40, activityLevel: "trains_hard" as const }, isMinor: false },
  { label: "mineur 45 kg 155 cm 13 ans", body: { weightKg: 45, heightCm: 155, gender: "male" as const, ageYears: 13, activityLevel: null }, isMinor: true },
];

for (const s of bodies) {
  const subject = { body: s.body, isMinor: s.isMinor };
  for (const dir of ["up", "down"] as const) {
    const ceil = paceCeilingFor(dir, subject);
    if (!ceil) { console.log(`${s.label} ${dir}: pas de corps`); continue; }
    const rows: string[] = [];
    for (const p of [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.7, 1.0]) {
      if (p > ceil.maxKgPerWeek) continue;
      const e = executedPaceFor(dir, subject, p);
      rows.push(
        `${p.toFixed(2)}→delta ${e?.dailyDeltaKcal ?? "null"}kcal (livré ${
          e ? e.kgPerWeek.toFixed(3) : "-"
        }, ${e?.clampedBy})`,
      );
    }
    console.log(`\n${s.label} · ${dir} · max curseur ${ceil.maxKgPerWeek} (${ceil.bound})`);
    for (const r of rows) console.log("   " + r);
  }
}
