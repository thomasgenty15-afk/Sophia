import {
  ACTIVITY_FACTOR, ACTIVITY_FACTORS, CHILD_ACTIVITY_FACTOR, childActivityFactor,
  estimatedMaintenanceKcal, estimatedChildMaintenanceKcal, envelopeFor,
} from "../supabase/functions/_shared/keel/meal_envelope.ts";
import { ACTIVITY_KCAL_PER_KG, maintenanceRange } from "../supabase/functions/_shared/keel/energy_target.ts";
import { ACTIVITY_LEVELS } from "../supabase/functions/_shared/keel/tokens.ts";
import { ageBandOf } from "../supabase/functions/_shared/keel/student_age.ts";

console.log("ACTIVITY_FACTOR (hypothese null) =", ACTIVITY_FACTOR);
console.log("ACTIVITY_FACTORS =", JSON.stringify(ACTIVITY_FACTORS));
console.log("CHILD_ACTIVITY_FACTOR =", CHILD_ACTIVITY_FACTOR);
console.log("ACTIVITY_KCAL_PER_KG =", JSON.stringify(ACTIVITY_KCAL_PER_KG));
console.log("ageBandOf(35) =", ageBandOf(35), "| ageBandOf(12) =", ageBandOf(12), "| ageBandOf(17) =", ageBandOf(17), "| ageBandOf(18) =", ageBandOf(18));

console.log("\n=== 1. LES 4 CRANS ARRIVENT-ILS AU CALCUL ? (adulte 70kg 175cm homme 35a) ===");
const seen = new Set<number>();
for (const a of [null, ...ACTIVITY_LEVELS] as const) {
  const k = estimatedMaintenanceKcal({ weightKg: 70, heightCm: 175, ageBand: ageBandOf(35), gender: "male", activityLevel: a } as never);
  const r = maintenanceRange({ weightKg: 70, activityLevel: a } as never);
  console.log(` ${String(a).padEnd(12)} maintenance=${k}  range=${JSON.stringify(r)}`);
  if (k !== null) seen.add(k);
}
console.log(" valeurs distinctes de maintenance:", seen.size, "(attendu 5 = 4 crans + null)");

console.log("\n=== 2. null RENVOIE-T-IL EXACTEMENT LE COMPORTEMENT D'AVANT ? ===");
console.log(" null -> facteur", ACTIVITY_FACTOR, "; ACTIVITY_FACTOR est-il l'un des 4 crans ?",
  Object.values(ACTIVITY_FACTORS).includes(ACTIVITY_FACTOR) ? "OUI (collision!)" : "non");
console.log(" maintenanceRange(null) =", JSON.stringify(maintenanceRange({ weightKg: 70, activityLevel: null } as never)), " (attendu 28-33 kcal/kg -> 1960-2310)");

console.log("\n=== 3. ENFANT : LE CRAN NE PEUT QUE MONTER ===");
let descentes = 0;
for (const a of [null, ...ACTIVITY_LEVELS] as const) {
  const f = childActivityFactor(a as never);
  const k = estimatedChildMaintenanceKcal({ weightKg: 35, ageYears: 10, gender: "female", activityLevel: a } as never);
  const kNull = estimatedChildMaintenanceKcal({ weightKg: 35, ageYears: 10, gender: "female", activityLevel: null } as never);
  const down = (k !== null && kNull !== null && k < kNull);
  if (down) descentes++;
  console.log(` ${String(a).padEnd(12)} facteur=${f} maintenance=${k} ${down ? "<<< DESCEND !!!" : ""}`);
}
console.log(" descentes:", descentes, "(attendu 0)");

console.log("\n=== 4. envelopeFor : 6e parametre requis, et il change quelque chose ===");
for (const a of [null, "sedentary", "trains_hard"] as const) {
  const e = envelopeFor("fat_loss", { weightKg: 80, heightCm: 178, gender: "male", ageYears: 35, activityLevel: a } as never, "adult", null, null, a as never);
  console.log(` ${String(a).padEnd(12)} ->`, JSON.stringify(e).slice(0, 220));
}
