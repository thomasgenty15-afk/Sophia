/**
 * § 1 — QUI COMPTE QUOI. Une seule question, deux lecteurs de production.
 *
 *   `boxNutrition`  → ce que le RÉCIPIENT contient (le bac entier)
 *   `dishSlices`    → ce que la BOUCHE mange (silence nommé sur un bac)
 */
import { chargerFixtures, mesurerPortions, troisIndex } from "../../../scripts/2026-09-11-mesure-grille.ts";
import { dishSlices } from "../../../supabase/functions/_shared/keel/mouth_energy.ts";
import { dishEnergy } from "../../../supabase/functions/_shared/keel/food_composition.ts";

const ROOT = decodeURIComponent(new URL("../../../", import.meta.url).pathname);
const FIXTURES = `${ROOT}scratchpad/2026-09-11-FIABILITE-RECETTES/fixtures`;
const gele = JSON.parse(await Deno.readTextFile(Deno.args[0])) as Record<string, unknown>;
const ligne = gele.ligne_ecrite as Record<string, unknown>;
const base = await chargerFixtures(FIXTURES);
const idx = await troisIndex({ ...base, plans: [ligne], contextes: [], echanges: [], journaux: [] }, ligne);
const portions = mesurerPortions({ index: idx.relecture.index, plan: ligne });
const noms = new Map<string,string>();
for (const b of (gele.demande as any).bouches) noms.set(String(b.member_id), String(b.first_name));
console.log("── CE QUE `boxNutrition` REND, CONTENANT PAR CONTENANT ───────────");
for (const p of portions) {
  const qui = p.memberIds.map((m)=>noms.get(m)??m.slice(0,6));
  console.log(
    `${p.jour}/${p.slot}`.padEnd(16),
    `noms=${qui.length}`.padEnd(8),
    `[${qui.join("+")}]`.padEnd(22),
    `${Math.round(p.grammes)} g`.padStart(8),
    p.kcal === null ? "  kcal=null" : `${p.kcal.toFixed(2)} kcal`.padStart(14),
    p.kcal !== null && qui.length > 1 ? `  ÷${qui.length} = ${(p.kcal/qui.length).toFixed(2)}` : "",
  );
}
