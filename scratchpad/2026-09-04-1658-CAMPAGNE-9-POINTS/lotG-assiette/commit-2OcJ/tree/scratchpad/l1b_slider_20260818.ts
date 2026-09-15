import {
  paceCeilingFor, ceilingFromBounds, roundPace, MAX_KG_PER_WEEK,
  MAX_WEEKLY_BODY_FRACTION, ENERGY_FLOOR_KCAL, energyFloorFor,
  KCAL_PER_KG_BODY_MASS, MINOR_MAX_DAILY_DELTA_FRACTION, scaleDirectionOf,
} from "../supabase/functions/_shared/keel/weight_pace.ts";
import { MAX_DAILY_DEFICIT_KCAL, MAX_SURPLUS_FRACTION, estimatedMaintenanceKcal } from "../supabase/functions/_shared/keel/meal_envelope.ts";

console.log("MAX_KG_PER_WEEK", MAX_KG_PER_WEEK, "| BODY_FRACTION", MAX_WEEKLY_BODY_FRACTION,
  "| FLOORS", JSON.stringify(ENERGY_FLOOR_KCAL), "| A1 deficit", MAX_DAILY_DEFICIT_KCAL,
  "| MAX_SURPLUS_FRACTION", MAX_SURPLUS_FRACTION, "| MINOR frac", MINOR_MAX_DAILY_DELTA_FRACTION);

// --- 1. BALAYAGE REEL : quelle borne gagne, sur des corps reels ------------
const won: Record<string, number> = { absolute_cap: 0, body_fraction: 0, energy_floor: 0 };
const wonBy: Record<string, string[]> = { absolute_cap: [], body_fraction: [], energy_floor: [] };
let over1kg = 0; let maxSeen = 0; let nulls = 0; let total = 0;
for (const dir of ["down", "up"] as const) {
  for (const isMinor of [false, true]) {
    for (let w = 25; w <= 220; w += 1) {
      for (const h of [140, 160, 175, 195]) {
        for (const g of ["male", "female", "other", null] as const) {
          for (const act of ["sedentary","on_feet","trains_some","trains_hard",null] as const) {
            const ageYears = isMinor ? 12 : 35;
            const r = paceCeilingFor(dir, { body: { weightKg: w, heightCm: h, gender: g, ageYears, activityLevel: act } as never, isMinor });
            total++;
            if (r === null) { nulls++; continue; }
            won[r.bound]++;
            if (wonBy[r.bound].length < 3) wonBy[r.bound].push(`${dir} ${isMinor?"minor":"adult"} ${w}kg ${h}cm ${g} ${act} -> ${r.maxKgPerWeek} kg/sem (${r.dailyDeltaKcal} kcal/j)`);
            if (r.maxKgPerWeek > MAX_KG_PER_WEEK) over1kg++;
            if (r.maxKgPerWeek > maxSeen) maxSeen = r.maxKgPerWeek;
          }
        }
      }
    }
  }
}
console.log("\n=== BALAYAGE SUR CORPS REELS ===");
console.log("cas:", total, "| null:", nulls, "| max rendu:", maxSeen, "| depassements de 1 kg:", over1kg);
for (const b of Object.keys(won)) {
  console.log(` ${b.padEnd(14)} gagne ${String(won[b]).padStart(6)} fois`);
  for (const s of wonBy[b]) console.log(`      ex. ${s}`);
}

// --- 2. LES TROIS BORNES SUR NOMBRES NUS ---------------------------------
console.log("\n=== ceilingFromBounds : chaque borne a-t-elle un cas ou elle gagne ? ===");
console.log(" cap gagne   :", JSON.stringify(ceilingFromBounds(0.3, 0.8, 0.9)));
console.log(" body gagne  :", JSON.stringify(ceilingFromBounds(1.0, 0.4, 0.9)));
console.log(" floor gagne :", JSON.stringify(ceilingFromBounds(1.0, 0.8, 0.2)));
console.log(" egalite cap=floor  ->", JSON.stringify(ceilingFromBounds(0.5, 0.8, 0.5)));
console.log(" egalite body=floor ->", JSON.stringify(ceilingFromBounds(1.0, 0.5, 0.5)));
console.log(" egalite triple     ->", JSON.stringify(ceilingFromBounds(0.5, 0.5, 0.5)));

// --- 3. roundPace ---------------------------------------------------------
console.log("\n=== roundPace ===");
for (const v of [0.4750, 0.4545, 0.999, 1.0, 0.049, 0.0]) console.log(` ${v} -> ${roundPace(v)}`);

// --- 4. le cas du design : 60 kg -----------------------------------------
console.log("\n=== le cas du design : 60 kg, femme, 165 cm, adulte, perte ===");
const c = paceCeilingFor("down", { body: { weightKg: 60, heightCm: 165, gender: "female", ageYears: 35, activityLevel: null } as never, isMinor: false });
console.log(" ", JSON.stringify(c), " maintenance =", estimatedMaintenanceKcal({ weightKg: 60, heightCm: 165, ageBand: "adult", gender: "female", activityLevel: null } as never));
console.log("  plancher femme =", energyFloorFor("female"), "-> cible =", (c ? "?" : ""));
