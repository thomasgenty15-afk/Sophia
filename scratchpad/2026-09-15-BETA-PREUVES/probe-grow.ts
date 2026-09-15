/**
 * LOT 3.3 — À QUI APPARTIENT LE SURPLUS DE 9 g ?
 *
 * Le pot `prep_breakfast_mon` (N=4, Nils absent) produit 1717 g, on y prélève
 * 1718 g — il manque UN gramme. `growIngredientsToReadyMass` rend un facteur de
 * 1,005 et une masse de 1727 g, soit +10 g pour un besoin de +1.
 *
 * Ce script balaie les facteurs un par un avec la MÊME fonction de mesure et la
 * casserole RELUE DANS L'ARTEFACT — pas une liste retapée. Une première version
 * recopiait les six lignes à la main et mesurait 1727 g au facteur 1 : elle
 * décrivait une autre casserole, et aurait conclu de travers.
 */
import { indexDuReferentiel } from "../2026-09-13-CIBLES-PAR-PERSONNE/composer-reference.ts";
import { measurePreparation } from "../../supabase/functions/_shared/keel/preparation_mass.ts";
import { scaleIngredients } from "../../supabase/functions/_shared/keel/portion_scaling.ts";

const index = await indexDuReferentiel();

const ROOT = decodeURIComponent(new URL("../../", import.meta.url).pathname);
const ART = JSON.parse(
  Deno.readTextFileSync(
    `${ROOT}scratchpad/2026-09-11-FIABILITE-RECETTES/sorties-lot-F/campagne-tir9-s1-2026-09-14T04-20-23-468Z.json`,
  ),
) as Record<string, unknown>;
const plan = (ART.ligne_ecrite ?? ART.reponse) as Record<string, unknown>;
const prep = ((plan.preparations as Record<string, unknown>[]) ?? [])
  .find((p) => String(p.id ?? "") === "prep_breakfast_mon");
if (!prep) {
  console.error("⛔ `prep_breakfast_mon` introuvable dans l'artefact");
  Deno.exit(2);
}
const ING = (prep.ingredients as Record<string, unknown>[]) ?? [];
const RECON = JSON.parse(
  Deno.readTextFileSync(`${ROOT}scratchpad/2026-09-15-BETA-PREUVES/reconciliation.json`),
) as { rapport: Record<string, unknown>[] };
const potMesure = (RECON.rapport.find((r) => r.nom === "n4-away-tir9s1")
  ?.per_pot as Record<string, unknown>[])
  ?.find((p) => p.preparation_id === "prep_breakfast_mon");
const DRAWN = Number(potMesure?.drawn_g ?? 0);

const mesure = (items: readonly Record<string, unknown>[]) =>
  measurePreparation(index, {
    id: "prep_breakfast_mon",
    // ⚠️ LA MÉTHODE COMPTE: une friture impute 12 % d'huile, et la mesurer sans
    // elle décrit une autre casserole. C'est l'erreur de la première version.
    method: (prep.method as string | null) ?? null,
    ingredients: [...items] as never,
    waterTreatment: null,
  }).readyG;

const base = mesure(ING);
console.log(
  `casserole relue: ${ING.length} ligne(s) · méthode ${
    prep.method ? "oui" : "aucune"
  } · prêt au facteur 1 : ${base} g · prélevé ${DRAWN} g`,
);
for (const i of ING) console.log(`   ${i.ref ?? i.term} ${i.amount} ${i.unit}`);

let premierSuffisant: { f: number; ready: number } | null = null;
const marches: { f: number; ready: number }[] = [];
for (let f = 1.0; f <= 1.0101; f += 0.0001) {
  const scaled = scaleIngredients(ING as never, f, undefined, Infinity);
  const ready = mesure(scaled.items as never);
  if (ready === null) continue;
  if (marches.length === 0 || marches[marches.length - 1].ready !== ready) {
    marches.push({ f: Number(f.toFixed(4)), ready });
  }
  if (premierSuffisant === null && ready >= DRAWN) {
    premierSuffisant = { f: Number(f.toFixed(4)), ready };
  }
}
console.log("\nles marches de l'escalier (facteur → masse prête) :");
for (const m of marches) console.log(`   ${m.f.toFixed(4)} → ${m.ready} g`);
console.log(
  `\npremier facteur suffisant : ${premierSuffisant?.f ?? "aucun ≤ 1,01"} → ${
    premierSuffisant?.ready ?? "-"
  } g` +
    (premierSuffisant ? ` (surplus ${premierSuffisant.ready - DRAWN} g)` : ""),
);
console.log(
  `la production a rendu : facteur ${potMesure?.fit ? (potMesure.fit as Record<string, unknown>).factor : "?"}` +
    ` → ${potMesure?.ready_after_g} g (surplus ${potMesure?.rest_g} g)`,
);
