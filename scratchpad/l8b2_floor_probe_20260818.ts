// L8-B — LE PLANCHER `BOX_FACTOR_MIN` EST-IL EXERCE ?
// On balaie le MEME espace de corps que `target_grams_test.ts` et on releve le
// facteur MINIMUM reellement observe. Si aucun corps ne descend sous 0,75, le
// passage de 0,75 a 0,70 n'est prouve par aucun cas qui passe.
const B = "file:///Users/ahmedamara/Dev/Sophia%202/supabase/functions/_shared/keel/";
const { mouthTargetFactor, BOX_FACTOR_MIN } = await import(B + "household_portions.ts");
let min = Infinity, argmin = "", under075 = 0, under070 = 0, n = 0, implausible = 0;
for (const heightCm of [140, 160, 175, 195]) {
  for (const weightKg of [30, 45, 60, 80, 110, 150]) {
    for (const gender of ["male", "female"] as const) {
      for (const ageYears of [18, 30, 45, 70]) {
        for (const pace of [0.1, 0.25, 0.5, 0.75, 1]) {
          const out = mouthTargetFactor({
            ageState: "adult", restrictionFlag: false, coachCounting: "no_position",
            direction: "down", paceKgPerWeek: pace,
            subject: { body: { heightCm, weightKg, gender, ageYears, activityLevel: null }, isMinor: false },
          });
          n++;
          if (out.reason === "implausible_factor") implausible++;
          if (out.reason !== "sized") continue;
          if (out.factor < 0.75) under075++;
          if (out.factor < 0.70) under070++;
          if (out.factor < min) { min = out.factor; argmin = `${heightCm}cm ${weightKg}kg ${gender} ${ageYears}a pace=${pace}`; }
        }
      }
    }
  }
}
console.log(`corps balayes            : ${n}`);
console.log(`BOX_FACTOR_MIN           : ${BOX_FACTOR_MIN}`);
console.log(`facteur MINIMUM observe  : ${min.toFixed(4)}   (${argmin})`);
console.log(`cas < 0,75 (l'ancien min): ${under075}   <- exercent le passage 0,75 -> 0,70`);
console.log(`cas < 0,70 (le nouveau)  : ${under070}`);
console.log(`motif implausible_factor : ${implausible}`);
// Le corps NOMME par L8-A: 30 kg / 195 cm.
const named = mouthTargetFactor({
  ageState: "adult", restrictionFlag: false, coachCounting: "no_position",
  direction: "down", paceKgPerWeek: 1,
  subject: { body: { heightCm: 195, weightKg: 30, gender: "female", ageYears: 30, activityLevel: null }, isMinor: false },
});
console.log(`corps nomme 30kg/195cm   : facteur ${named.factor.toFixed(4)} motif ${named.reason}`);
