import {
  estimatedMaintenanceKcal,
  goalEnergyBandOf,
} from "../supabase/functions/_shared/keel/meal_envelope.ts";

const maint = estimatedMaintenanceKcal({
  weightKg: 72,
  heightCm: 187,
  ageBand: "18_29",
  gender: "male",
  activityLevel: null,
  activityAxes: { day: "seated", sport: "3_4", asked: true },
  appetite: null,
});
console.log("entretien estimé:", maint);
console.log("bande muscle_gain:", JSON.stringify(goalEnergyBandOf(maint, "muscle_gain")));
console.log("bande maintenance:", JSON.stringify(goalEnergyBandOf(maint, "maintenance")));
