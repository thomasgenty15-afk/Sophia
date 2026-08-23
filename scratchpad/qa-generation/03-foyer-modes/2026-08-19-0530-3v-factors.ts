// 3V — le facteur de part des 4 bouches, calculé par le CODE D'AUJOURD'HUI.
// Aucun modèle, aucun run: `householdMouthFactors` est pur.
import { householdMouthFactors } from "../../../supabase/functions/_shared/keel/household_portions.ts";
import { estimatedMaintenanceFor } from "../../../supabase/functions/_shared/keel/weight_pace.ts";

const mouths = [
  { id: "aurele", name: "Aurele", goal: "fat_loss", pace: 0.4, age: "adult", body: { heightCm: 181, weightKg: 92, gender: "male", ageYears: 39, activityLevel: "sedentary" } },
  { id: "solveig", name: "Solveig", goal: "muscle_gain", age: "adult", body: { heightCm: 163, weightKg: 55, gender: "female", ageYears: 33, activityLevel: "trains_hard" } },
  { id: "marceline", name: "Marceline", goal: "muscle_gain", age: "adult", body: { heightCm: 170, weightKg: 74, gender: "female", ageYears: 47, activityLevel: "on_feet" } },
  { id: "theodule", name: "Theodule", goal: null, age: "minor", body: { heightCm: 134, weightKg: 29, gender: "male", ageYears: 9, activityLevel: "on_feet" } },
] as const;

// deno-lint-ignore no-explicit-any
const input: any[] = mouths.map((m) => ({
  member: {
    memberId: m.id,
    displayName: m.name,
    goal: m.goal,
    ageState: m.age,
    body: null,
    eatingSlots: null,
    habits: [],
    habitNote: null,
  },
  restriction: "no_account",
  body: m.body,
  paceKgPerWeek: (m as { pace?: number }).pace ?? null,
}));

// deno-lint-ignore no-explicit-any
const out = householdMouthFactors(input as any, "no_position");
console.log("bouche      maintenance  share    target   applied  clamped  reasons");
const ref = out.get("aurele")!.factor;
for (const m of mouths) {
  const f = out.get(m.id)!;
  const kcal = estimatedMaintenanceFor({ body: m.body as never, isMinor: m.age === "minor" });
  console.log(
    m.name.padEnd(11),
    String(kcal).padStart(6),
    "     ",
    f.share.factor.toFixed(4),
    "  ",
    f.target.factor.toFixed(4),
    "  ",
    f.factor.toFixed(4),
    " ",
    String(f.clamped).padEnd(6),
    " ",
    f.share.reason + "/" + f.target.reason,
    "  rel_aurele=" + (f.factor / ref).toFixed(3),
  );
}
