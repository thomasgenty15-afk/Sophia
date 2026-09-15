// MESURE AVANT — ③ safety_lexicon.ts / safety_pregate (lot S1d).
import { normalizeForSafety } from "../supabase/functions/sophia-brain/safety/safety_lexicon.ts";
import { runSafetyPregate } from "../supabase/functions/sophia-brain/safety/safety_pregate.ts";

const stamp = new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" });
console.log(`== MESURE AVANT · safety_lexicon · ${stamp} CEST ==`);

// ── 0. LE MÉCANISME, mesuré et pas supposé: que devient la ligature ?
for (const t of ["ma sœur", "ma sŒur", "un nævus", "MA SŒUR"]) {
  console.log(`  normalizeForSafety(${JSON.stringify(t)}) = ${JSON.stringify(normalizeForSafety(t))}`);
}
console.log(`  => la ligature SURVIT (aucun filtre non-alnum): c'est le jeton ASCII qui rate.`);

// ── 1. La morsure nommée par la fiche.
const paires: Array<[string, string]> = [
  ["ma sœur veut en finir", "ma soeur veut en finir"],
  ["ma sœur pense au suicide", "ma soeur pense au suicide"],
  ["ma sœur veut mourir", "ma soeur veut mourir"],
];
let divergent = 0;
for (const [lig, dig] of paires) {
  const a = runSafetyPregate({ user_message: lig });
  const b = runSafetyPregate({ user_message: dig });
  const fa = a.disarmed.some((d) => d.condition === "third_party_referent");
  const fb = b.disarmed.some((d) => d.condition === "third_party_referent");
  const same = fa === fb && a.risk_band === b.risk_band && a.detected === b.detected;
  if (!same) divergent += 1;
  console.log(`  ${JSON.stringify(lig)} => THIRD_PARTY=${fa} band=${a.risk_band} detected=${a.detected}`);
  console.log(`  ${JSON.stringify(dig)} => THIRD_PARTY=${fb} band=${b.risk_band} detected=${b.detected}   ${same ? "ACCORD" : "*** DIVERGE ***"}`);
}
console.log(`  couples divergents: ${divergent}/${paires.length}`);

// ── 2. LES FORMES CONCERNÉES, sur le SOURCE EXÉCUTÉ.
const src = await Deno.readTextFile(
  new URL("../supabase/functions/sophia-brain/safety/safety_lexicon.ts", import.meta.url),
);
const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
const found = new Map<string, number>();
for (const m of code.toLowerCase().matchAll(/[a-z]*(?:oe|ae)[a-z]*/g)) {
  found.set(m[0], (found.get(m[0]) ?? 0) + 1);
}
console.log(`\n  formes a digramme dans le CODE: ${found.size} distinctes`);
for (const [tok, n] of [...found].sort()) console.log(`    ${tok} x${n}`);
console.log(`  ligatures litterales dans le fichier: ${[...src.matchAll(/[œŒæÆ]/g)].length}`);

// ── 3. Le meme scan sur safety_pregate.ts et safety_thresholds.ts
for (const f of ["safety_pregate.ts", "safety_thresholds.ts", "safety_floor.ts", "safety_context.ts"]) {
  const s = await Deno.readTextFile(new URL(`../supabase/functions/sophia-brain/safety/${f}`, import.meta.url));
  const c = s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
  const t = new Set([...c.toLowerCase().matchAll(/[a-z]*(?:oe|ae)[a-z]*/g)].map((m) => m[0]));
  console.log(`  ${f}: ${t.size ? [...t].sort().join(", ") : "(aucune)"}`);
}

// ── 4. Le temoin neutre.
for (const t of ["j'ai mangé des œufs ce matin", "ma sœur cuisine bien"]) {
  const o = runSafetyPregate({ user_message: t });
  console.log(`  temoin ${JSON.stringify(t)} => detected=${o.detected} band=${o.risk_band}`);
}
