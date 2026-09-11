// `matchedText` est-il tranché dans le BRUT ou dans le NORMALISÉ ?
// La normalisation retire des marques NFD : les offsets ne coïncident pas
// dès qu'un accent précède la morsure. Épreuve directe.
import { scanDietaryRegime } from "../../supabase/functions/_shared/keel/dietary_regime.ts";
const probes = [
  "Poulet, pâtes, courgette et tomate",
  "Purée de céleri, crème et pâtes",
  "Éé Àà Ùù Ôô Îî — pâtes aux légumes",
  "Éé Àà Ùù Ôô Îî — pâté de campagne",
  "crème brûlée, pâté, céleri rémoulade",
];
for (const p of probes) {
  const s = scanDietaryRegime("vegetarian", { prose: [p] });
  const seen = [...s.breaches, ...s.silencedByHomograph]
    .filter((b) => b.token === "pate")
    .map((b) => JSON.stringify(b.matchedText));
  console.log(`${seen.join(",").padEnd(12)} ← ${p}`);
}
