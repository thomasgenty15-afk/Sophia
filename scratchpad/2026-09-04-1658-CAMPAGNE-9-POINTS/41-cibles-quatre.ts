import { estimatedMaintenanceFor, executedPaceFor } from "../../supabase/functions/_shared/keel/weight_pace.ts";
import { MEAL_KCAL_PER_G_COMPOSED, SLOT_DAY_WEIGHT } from "../../supabase/functions/_shared/keel/mouth_anchor.ts";
const roster = JSON.parse(Deno.readTextFileSync(Deno.args[0]));
let total = 0;
for (const m of roster) {
  const isMinor = m.age_years < 18;
  const body = { heightCm: m.height_cm, weightKg: m.weight_kg, gender: m.gender, ageYears: m.age_years,
    activityLevel: m.activity_level, activityAxes: { day: m.day_activity, sport: m.sport_frequency, asked: true }, appetite: m.appetite };
  const maint = estimatedMaintenanceFor({ body, isMinor });
  let target = maint;
  if (m.goal === "fat_loss" && maint) { const e = executedPaceFor("down", { body, isMinor }, 0.5); if (e) target = e.maintenanceKcal - e.dailyDeltaKcal; }
  total += target ?? 0;
  const lunch = target ? Math.round(target * SLOT_DAY_WEIGHT.lunch) : null;
  console.log(`${m.first_name.padEnd(7)} entretien ${maint?.toFixed(0)}  cible ${target?.toFixed(0)}  déjeuner ${lunch} kcal ≈ ${lunch ? Math.round(lunch / MEAL_KCAL_PER_G_COMPOSED) : "?"} g composés`);
}
console.log(`TABLE   cible/jour ${total.toFixed(0)} kcal · déjeuner ${Math.round(total*SLOT_DAY_WEIGHT.lunch)} kcal ≈ ${Math.round(total*SLOT_DAY_WEIGHT.lunch/MEAL_KCAL_PER_G_COMPOSED)} g composés`);
