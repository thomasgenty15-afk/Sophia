/**
 * LE PALIER D'UNITÉ, REJOUÉ SUR LES DEUX CASSEROLES REFUSÉES — AVEC LE VRAI
 * RÉFÉRENTIEL (la base locale, `loadCompositionIndex`, comme le handler).
 *
 * Le rejeu sur l'instantané JSON (`rejouer-palier.ts`) mesurait 832 g pour
 * `prep_cod` là où le journal du handler disait 1 041 g : ce n'était pas le
 * même référentiel. Ici on charge celui de la base, on vérifie d'abord que la
 * masse au facteur 1 est celle du journal, puis on rejoue la croissance.
 *
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… deno run -A rejouer-palier-db.ts
 */
import { createClient } from "jsr:@supabase/supabase-js@2.87.3";
import { loadCompositionIndex } from "../../supabase/functions/_shared/keel/food_composition_io.ts";
import { measurePreparation } from "../../supabase/functions/_shared/keel/preparation_mass.ts";
import { growIngredientsToReadyMass } from "../../supabase/functions/_shared/keel/portion_scaling.ts";

const URL_ = (Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321").trim();
const SVC = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
if (!SVC) { console.error("⛔ SUPABASE_SERVICE_ROLE_KEY manquant"); Deno.exit(2); }
const admin = createClient(URL_, SVC, { auth: { persistSession: false } });
const index = await loadCompositionIndex(admin as never, { lang: "fr" });

const CAS = [
  {
    tir: "06", prep: "prep_cod", drawn: 1066, readyJournal: 1041,
    method: "Déposer le cabillaud avec les herbes séchées sur une plaque, cuire au four jusqu'à ce qu'il soit opaque, puis refroidir rapidement et répartir au réfrigérateur.",
    ingredients: [
      { term: "filet de cabillaud", quantity: "8 unités", amount: 8, unit: "unit", state: "raw", ref: "cod", part: "main", gramsRaw: null },
      { term: "herbes séchées", quantity: "une pincée", amount: null, unit: null, state: "raw", ref: "dried_herbs", part: "seasoning", gramsRaw: null },
    ],
  },
  {
    tir: "13", prep: "prep_egg_batch", drawn: 363, readyJournal: 352,
    method: "Battre les œufs, les cuire doucement à la poêle jusqu'à ce qu'ils soient juste pris, puis répartir en deux portions et réfrigérer.",
    ingredients: [
      { term: "blancs d'œufs", quantity: "12 blancs d'œufs", amount: 12, unit: "unit", state: "raw", part: "main", ref: "egg_white", gramsRaw: null },
      { term: "œufs entiers", quantity: "2 œufs entiers", amount: 2, unit: "unit", state: "raw", part: "main", ref: "whole_eggs", gramsRaw: null },
    ],
  },
];

for (const c of CAS) {
  const mesure = (items: readonly Record<string, unknown>[]) =>
    measurePreparation(index, { id: c.prep, method: c.method, ingredients: [...items] as never, waterTreatment: null }).readyG;
  const base = mesure(c.ingredients);
  console.log(`\n══ tir ${c.tir} · ${c.prep} · prêt au facteur 1 : ${base} g (journal ${c.readyJournal} g) · prélevé ${c.drawn} g`);
  for (const f of [1.024, 1.059, 1.095, 1.125, 1.25]) {
    const items = c.ingredients.map((i) => i.unit === "unit" && i.amount !== null ? { ...i, amount: Math.round(i.amount * f), quantity: `${Math.round(i.amount * f)}${i.quantity.slice(String(i.amount).length)}` } : i);
    console.log(`   sonde ×${f}: ${items.map((i) => i.amount).join("/")} → ${mesure(items)} g`);
  }
  const fit = growIngredientsToReadyMass(c.ingredients as never, c.drawn, mesure as never);
  console.log(`   → facteur ${fit.factor.toFixed(3)} · paliers d'unité ${fit.unitBumps} · lignes changées ${fit.changed} · prêt ${fit.readyAfterG} g · manque ${fit.shortfallG} g · pesées ${fit.attempts}`);
  for (const [k, i] of fit.items.entries()) {
    if (i.amount !== c.ingredients[k].amount) console.log(`   ✎ ${i.term}: ${c.ingredients[k].quantity} → ${i.quantity}`);
  }
}
