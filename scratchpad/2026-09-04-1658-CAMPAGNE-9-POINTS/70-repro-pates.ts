// Reproduction hors ligne du faux positif « pâtes » lu comme « pâté ».
import { scanDietaryRegime } from "../../supabase/functions/_shared/keel/dietary_regime.ts";
import { normalizeForMatch, tokenPattern } from "../../supabase/functions/_shared/keel/forbidden_matcher.ts";

console.log("— normalisation —");
for (const w of ["pâtes", "pâte", "pâté", "pâtés", "pates", "pate"]) {
  console.log(`  ${w.padEnd(7)} → ${normalizeForMatch(w)}`);
}
console.log("— le motif du jeton `pate` —");
console.log("  ", tokenPattern("pate"));
for (const w of ["pâtes", "pâté", "pâtés", "pâte"]) {
  const m = normalizeForMatch(w).match(tokenPattern("pate"));
  console.log(`  ${w.padEnd(7)} mordu=${m !== null}`);
}

console.log("\n— la surface, telle qu'un plan l'écrit —");
const cases: Array<[string, Parameters<typeof scanDietaryRegime>[1]]> = [
  ["prose: titre du plat", { prose: ["Poulet, pâtes, courgette et tomate"] }],
  ["prose: nom de préparation", { prose: ["Pâtes aux légumes"] }],
  ["prose: méthode", { prose: ["Cuire les pâtes 8 minutes, égoutter."] }],
  ["item nu, sans groupe", { items: [{ term: "pâtes", group: null }] }],
  ["item avec groupe grain", { items: [{ term: "pâtes", group: "refined_grain" }] }],
  ["item: pâtes complètes", { items: [{ term: "pâtes complètes", group: null }] }],
  ["CONTRE-ÉPREUVE pâté", { items: [{ term: "pâté de campagne", group: null }] }],
  ["CONTRE-ÉPREUVE pâtés", { items: [{ term: "pâtés en croûte", group: null }] }],
];
for (const [label, fields] of cases) {
  const s = scanDietaryRegime("vegetarian", fields);
  console.log(
    `  ${label.padEnd(28)} brèches=${s.breaches.length}` +
      ` éteint_homographe=${s.silencedByHomograph.length}` +
      ` éteint_analogue=${s.silencedByPlantAnalogue.length}` +
      ` éteint_ORTHO=${s.silencedBySpelling.length}` +
      (s.breaches.length ? `  ← ${JSON.stringify(s.breaches)}` : ""),
  );
}
