import { householdMouthFactors } from "/Users/ahmedamara/Dev/Sophia 2/supabase/functions/_shared/keel/household_portions.ts";
const mouths = [
  { id: "aurele", name: "Aurele", goal: "fat_loss", pace: 0.4, age: "adult", body: { heightCm: 181, weightKg: 92, gender: "male", ageYears: 39, activityLevel: "sedentary" } },
  { id: "solveig", name: "Solveig", goal: "muscle_gain", age: "adult", body: { heightCm: 163, weightKg: 55, gender: "female", ageYears: 33, activityLevel: "trains_hard" } },
  { id: "marceline", name: "Marceline", goal: "muscle_gain", age: "adult", body: { heightCm: 170, weightKg: 74, gender: "female", ageYears: 47, activityLevel: "on_feet" } },
  { id: "theodule", name: "Theodule", goal: null, age: "minor", body: { heightCm: 134, weightKg: 29, gender: "male", ageYears: 9, activityLevel: "on_feet" } },
] as const;
// deno-lint-ignore no-explicit-any
const input: any[] = mouths.map((m) => ({
  member: { memberId: m.id, displayName: m.name, goal: m.goal, ageState: m.age, body: null, eatingSlots: null, habits: [], habitNote: null },
  restriction: "no_account", body: m.body, paceKgPerWeek: (m as { pace?: number }).pace ?? null,
}));
// deno-lint-ignore no-explicit-any
const out = householdMouthFactors(input as any, "no_position");
// deno-lint-ignore no-explicit-any
const noCount = householdMouthFactors(input as any, "no_counting");
const clamp = (x: number) => Math.min(1.45, Math.max(0.55, x));
console.log("bouche      share   objectif(après)      appliqué AVANT  APRÈS   rel.Aurèle avant→après   clamped");
const refBefore = clamp(out.get("aurele")!.share.factor * out.get("aurele")!.target.factor);
const refAfter = out.get("aurele")!.factor;
for (const m of mouths) {
  const f = out.get(m.id)!;
  const pace = (m as { pace?: number }).pace ?? null;
  const before = clamp(pace === null ? f.share.factor : f.share.factor * f.target.factor);
  console.log(
    m.name.padEnd(11), f.share.factor.toFixed(4), " ",
    f.target.factor.toFixed(4), f.target.reason.padEnd(20),
    before.toFixed(4), " ", f.factor.toFixed(4), " ",
    (before / refBefore).toFixed(3), "→", (f.factor / refAfter).toFixed(3), "  ", String(f.clamped),
  );
}
console.log("");
console.log("④ doctrine « on ne compte pas » — facteur appliqué");
for (const m of mouths) {
  const nc = noCount.get(m.id)!;
  console.log(" ", m.name.padEnd(11), "après:", nc.factor.toFixed(4), nc.share.reason + "/" + nc.target.reason);
}
