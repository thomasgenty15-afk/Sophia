import { paceCeilingFor, MAX_KG_PER_WEEK, KCAL_PER_KG_BODY_MASS } from "../supabase/functions/_shared/keel/weight_pace.ts";
import { MAX_SURPLUS_FRACTION, MAX_DAILY_DEFICIT_KCAL} from "../supabase/functions/_shared/keel/meal_envelope.ts";

console.log("MAX_SURPLUS_FRACTION =", MAX_SURPLUS_FRACTION, "| A1 =", MAX_DAILY_DEFICIT_KCAL);

type Row = { dir: string; who: string; bounds: Record<string, number>; max: number; min: number; zeros: number; n: number };
const rows: Row[] = [];
for (const dir of ["down", "up"] as const) {
  for (const who of ["adult", "minor"] as const) {
    const r: Row = { dir, who, bounds: { absolute_cap: 0, body_fraction: 0, energy_floor: 0 }, max: -1, min: 99, zeros: 0, n: 0 };
    for (let w = 25; w <= 250; w += 1) for (const h of [140,160,175,195]) for (const g of ["male","female","other",null] as const) for (const a of ["sedentary","on_feet","trains_some","trains_hard",null] as const) {
      const res = paceCeilingFor(dir, { body: { weightKg: w, heightCm: h, gender: g, ageYears: who === "minor" ? 12 : 35, activityLevel: a } as never, isMinor: who === "minor" });
      if (!res) continue;
      r.n++; r.bounds[res.bound]++; r.max = Math.max(r.max, res.maxKgPerWeek); r.min = Math.min(r.min, res.maxKgPerWeek);
      if (res.maxKgPerWeek === 0) r.zeros++;
    }
    rows.push(r);
  }
}
for (const r of rows) console.log(`${r.dir.padEnd(5)} ${r.who.padEnd(6)} n=${String(r.n).padStart(6)} max=${r.max} min=${r.min} zeros=${r.zeros} bounds=${JSON.stringify(r.bounds)}`);

console.log("\n=== Peut-on ATTEINDRE absolute_cap ? l'algebre ===");
console.log("down adulte : delta<=A1=500 kcal/j -> kg/sem <= 500*7/7700 =", (500*7/7700).toFixed(4), "< 1 -> JAMAIS");
console.log("up          : delta = maintenance*"+MAX_SURPLUS_FRACTION+" ; pour depasser 1 kg/sem il faut delta > 1100 kcal/j");
console.log("              => maintenance >", (1100/MAX_SURPLUS_FRACTION).toFixed(0), "kcal/j -> hors humain");
console.log("minor down  : delta = maintenance*0.10 -> meme borne");

console.log("\n=== quel poids fait gagner body_fraction (down, adulte, 175cm, female, null) ? ===");
for (let w = 25; w <= 70; w += 5) {
  const res = paceCeilingFor("down", { body: { weightKg: w, heightCm: 175, gender: "female", ageYears: 35, activityLevel: null } as never, isMinor: false });
  console.log(` ${String(w).padStart(3)} kg -> ${JSON.stringify(res)}`);
}
console.log("\n=== prise : le maximum atteignable, spec dit ~0,5 kg/sem ===");
for (const w of [50, 70, 90, 120, 180, 250]) {
  const res = paceCeilingFor("up", { body: { weightKg: w, heightCm: 185, gender: "male", ageYears: 30, activityLevel: "trains_hard" } as never, isMinor: false });
  console.log(` ${String(w).padStart(3)} kg trains_hard -> ${JSON.stringify(res)}`);
}
