// L8-B — LA DIRECTION ET LA MAGNITUDE VIENNENT DE DEUX SUPPORTS DIFFERENTS.
// Preuve deterministe: la chaine apres le roster est pure. On rejoue
// `memberTargetFactor` avec exactement ce que le generateur lui passe.
const B = "file:///Users/ahmedamara/Dev/Sophia%202/supabase/functions/_shared/keel/";
const { memberTargetFactor } = await import(B + "household_portions.ts");

const NINA_BODY = { heightCm: 170, weightKg: 85, gender: "female", ageYears: 34, activityLevel: null };

// `PortionMember.goal` vient du ROSTER: `student_goals.goal` des qu'un compte existe.
// `paceKgPerWeek` vient de la LIGNE de foyer (`household_members`).
const cases = [
  ["ligne=muscle_gain+0.4   compte=maintenance", "maintenance", 0.4],
  ["ligne=muscle_gain+0.4   compte=fat_loss   ", "fat_loss", 0.4],
  ["ligne=fat_loss+0.4      compte=muscle_gain", "muscle_gain", 0.4],
  ["ligne=muscle_gain+0.4   compte=muscle_gain", "muscle_gain", 0.4],
  ["ligne=(aucune cible)    compte=fat_loss   ", "fat_loss", null],
] as const;

console.log("Nina — adulte, compte, corps 170 cm / 85 kg / female\n");
for (const [label, rosterGoal, linePace] of cases) {
  const member = {
    memberId: "nina", displayName: "Nina",
    goal: rosterGoal, ageState: "adult",
    body: { restrictionFlag: false },
    eatingSlots: null, habits: [], habitNote: null,
  };
  const out = memberTargetFactor(member as never, {
    coachCounting: "no_position",
    paceKgPerWeek: linePace,
    body: NINA_BODY as never,
  });
  const pct = out.factor === 1 ? "   —   " : `${((out.factor - 1) * 100 >= 0 ? "+" : "")}${((out.factor - 1) * 100).toFixed(1)} %`;
  console.log(`${label}  ->  facteur ${out.factor.toFixed(4)}  (${pct})   motif ${out.reason}`);
}
