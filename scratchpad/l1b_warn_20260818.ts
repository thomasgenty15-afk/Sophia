import { paceCeilingFor, paceWarning, PACE_WARNING_LABELS, PACE_WARN_UP_KG_PER_WEEK } from "../supabase/functions/_shared/keel/weight_pace.ts";
console.log("seuil =", PACE_WARN_UP_KG_PER_WEEK);
console.log("=== paceWarning : la phrase se declenche AU-DELA, pas dessus ===");
for (const [d, v] of [["up",0.45],["up",0.5],["up",0.55],["up",1.0],["down",0.45],["down",1.0]] as const) {
  console.log(` ${d.padEnd(5)} ${String(v).padEnd(5)} -> ${paceWarning(d as never, v)}`);
}
console.log("\n=== les deux langues ===");
console.log(" en:", PACE_WARNING_LABELS.surplus_becomes_fat.en);
console.log(" fr:", PACE_WARNING_LABELS.surplus_becomes_fat.fr);
console.log("\n=== bout en bout: un corps qui depasse le seuil recoit la phrase ===");
for (const [w, isMinor] of [[70,false],[110,false],[180,false],[40,true]] as const) {
  const c = paceCeilingFor("up", { body: { weightKg: w, heightCm: 180, gender: "male", ageYears: isMinor?12:30, activityLevel: null } as never, isMinor });
  console.log(` ${String(w).padStart(3)}kg ${isMinor?"mineur":"adulte"} -> max ${c?.maxKgPerWeek} (${c?.bound}) · phrase: ${paceWarning("up", c?.maxKgPerWeek ?? 0) ?? "aucune"}`);
}
