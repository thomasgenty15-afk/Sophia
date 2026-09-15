// MESURE AVANT — ② meal_declaration_floor.ts (lot S1d).
import { detectDeclaredMeal } from "../supabase/functions/_shared/keel/meal_declaration_floor.ts";

const stamp = new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" });
console.log(`== MESURE AVANT · meal_declaration_floor · ${stamp} CEST ==`);

const show = (h: unknown) => {
  const hit = h as { components?: Array<{ food_group_ref: string }> } | null;
  if (!hit) return "null";
  return JSON.stringify((hit.components ?? []).map((c) => c.food_group_ref));
};

const phrases = [
  "j'ai mangé des œufs brouillés ce matin",
  "j'ai mangé des oeufs brouillés ce matin",
  "j'ai mangé une omelette et du bœuf",
  "j'ai mangé une omelette et du boeuf",
  "j'ai mangé des œufs à midi",
  "j'ai mangé des oeufs à midi",
  "j'ai mangé du bœuf hier soir",
  "j'ai mangé du boeuf hier soir",
];
let divergent = 0;
for (let i = 0; i < phrases.length; i += 2) {
  const a = detectDeclaredMeal(phrases[i]);
  const b = detectDeclaredMeal(phrases[i + 1]);
  const same = show(a) === show(b);
  if (!same) divergent += 1;
  console.log(`  ${JSON.stringify(phrases[i])} => ${show(a)}`);
  console.log(`  ${JSON.stringify(phrases[i + 1])} => ${show(b)}   ${same ? "ACCORD" : "*** DIVERGE ***"}`);
}
console.log(`  couples divergents: ${divergent}/${phrases.length / 2}`);

// ── LES FORMES CONCERNÉES, sur le SOURCE EXÉCUTÉ.
const src = await Deno.readTextFile(
  new URL("../supabase/functions/_shared/keel/meal_declaration_floor.ts", import.meta.url),
);
const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
const found = new Map<string, number>();
for (const m of code.toLowerCase().matchAll(/[a-z]*(?:oe|ae)[a-z]*/g)) {
  found.set(m[0], (found.get(m[0]) ?? 0) + 1);
}
console.log(`\n  formes a digramme dans le CODE: ${found.size} distinctes`);
for (const [tok, n] of [...found].sort()) console.log(`    ${tok} x${n}`);
const all = new Set<string>();
for (const m of src.toLowerCase().matchAll(/[a-z]*(?:oe|ae)[a-z]*/g)) all.add(m[0]);
console.log(`  (fichier entier: ${all.size} distinctes: ${[...all].sort().join(", ")})`);
console.log(`  ligatures litterales dans le fichier: ${[...src.matchAll(/[œŒæÆ]/g)].length}`);

for (const t of ["j'aime bien les pâtes", "je vais manger des oeufs demain"]) {
  console.log(`  temoin ${JSON.stringify(t)} => ${show(detectDeclaredMeal(t))}`);
}
