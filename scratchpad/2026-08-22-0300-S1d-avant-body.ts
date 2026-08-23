// MESURE AVANT — ① body_measure_floor.ts (lot S1d).
import { detectDeclaredBodyMeasure } from "../supabase/functions/_shared/keel/body_measure_floor.ts";

const stamp = new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" });
console.log(`== MESURE AVANT · body_measure_floor · ${stamp} CEST ==`);

// ── 1. La morsure nommée par la fiche.
const phrases = [
  "je fais 78 kg comme ma sœur",
  "je fais 78 kg comme ma soeur",
  "ma sœur fait 78 kg",
  "ma soeur fait 78 kg",
  "je pèse 78 kg comme ma sœur",
  "je pèse 78 kg comme ma soeur",
];
for (const p of phrases) {
  const hit = detectDeclaredBodyMeasure(p, "metric");
  console.log(`  ${JSON.stringify(p)} => ${hit ? `${hit.kind} ${hit.valueSi}${hit.unit}` : "null"}`);
}

// ── 2. LES FORMES CONCERNÉES, énumérées sur le SOURCE EXÉCUTÉ du module.
const src = await Deno.readTextFile(
  new URL("../supabase/functions/_shared/keel/body_measure_floor.ts", import.meta.url),
);
const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
const found = new Map<string, number>();
for (const m of code.toLowerCase().matchAll(/[a-z]*(?:oe|ae)[a-z]*/g)) {
  found.set(m[0], (found.get(m[0]) ?? 0) + 1);
}
console.log(`\n  formes a digramme dans le CODE (commentaires retires): ${found.size} distinctes`);
for (const [tok, n] of [...found].sort()) console.log(`    ${tok} x${n}`);

// ── 3. Le meme scan SUR LE FICHIER ENTIER (commentaires compris), pour dire
//      combien de bruit le retrait des commentaires enleve.
const all = new Set<string>();
for (const m of src.toLowerCase().matchAll(/[a-z]*(?:oe|ae)[a-z]*/g)) all.add(m[0]);
console.log(`  (fichier entier, commentaires compris: ${all.size} distinctes)`);

// ── 4. Ligatures LITTERALES dans le fichier.
const lig = [...src.matchAll(/[œŒæÆ]/g)].length;
console.log(`  ligatures litterales dans le fichier: ${lig}`);

// ── 5. Le temoin neutre.
for (const t of ["jaime bien les pates", "je fais 78 kg"]) {
  const hit = detectDeclaredBodyMeasure(t, "metric");
  console.log(`  temoin ${JSON.stringify(t)} => ${hit ? `${hit.kind} ${hit.valueSi}${hit.unit}` : "null"}`);
}
