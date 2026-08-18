/**
 * DIAGNOSTIC — combien de masse vit dans les PRÉPARATIONS ?
 *
 * `verdictDishesOf` (generate-meal-v1/index.ts) ne mappe que `m.dishes`. Ni
 * `m.preparations`, ni le lien `dish.uses` qui les rattache. Tout ce qu'un
 * batch cooking porte est donc invisible au verdict — et c'est justement là que
 * la protéine est cuisinée d'avance.
 */

import { createClient } from "jsr:@supabase/supabase-js@2.87.3";
import { loadCompositionIndex } from "../supabase/functions/_shared/keel/food_composition_io.ts";
import { resolveIngredients } from "../supabase/functions/_shared/keel/food_composition.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const index = await loadCompositionIndex(admin);

const { data, error } = await admin
  .from("student_generated_meals")
  .select("id, dishes, preparations")
  .order("created_at", { ascending: false })
  .limit(80);
if (error) throw new Error(error.message);

// ⚠️ LA BASE STOCKE EN SNAKE_CASE. Le type en mémoire est `servingsMade` /
// `preparationId`; la ligne écrite dit `servings_made` / `preparation_id`. Lire
// la forme mémoire sur une ligne de base rend ZÉRO, ce qui se lit exactement
// comme « aucune préparation ne porte de masse » — première version de ce
// diagnostic, et elle a menti dans le sens rassurant.
type Ing = { term?: string; amount?: unknown; unit?: unknown; state?: unknown };
type Prep = { id?: string; servings_made?: unknown; ingredients?: Ing[] };
type Use = { preparation_id?: string; servings?: unknown };
type Dish = { ingredients?: Ing[]; uses?: Use[] };

function sum(list: Ing[]) {
  const r = resolveIngredients(index, list as never);
  let kcal = 0, prot = 0;
  for (const x of r.resolved) {
    kcal += (x.ref.energyKcal * x.gramsRaw) / 100;
    prot += ((x.ref.proteinG ?? 0) * x.gramsRaw) / 100;
  }
  return { kcal, prot };
}

let plansWithPreps = 0, plans = 0;
let dishKcal = 0, dishProt = 0, prepKcal = 0, prepProt = 0;
const shares: number[] = [];

for (const row of (data ?? []) as { id: string; dishes: Dish[]; preparations: Prep[] }[]) {
  const dishes = row.dishes ?? [];
  const preps = new Map<string, Prep>();
  for (const p of row.preparations ?? []) preps.set(String(p.id), p);
  if (dishes.length === 0) continue;
  plans++;
  if (preps.size > 0) plansWithPreps++;

  let dk = 0, dp = 0, pk = 0, pp = 0;
  for (const d of dishes) {
    const own = sum(d.ingredients ?? []);
    dk += own.kcal;
    dp += own.prot;
    for (const u of d.uses ?? []) {
      const p = preps.get(String(u.preparation_id));
      if (!p) continue;
      const share = (Number(u.servings) || 1) / Math.max(1, Number(p.servings_made) || 1);
      const s = sum(
        (p.ingredients ?? []).map((i) => ({
          ...i,
          amount: i.amount === null || i.amount === undefined
            ? null
            : Number(i.amount) * share,
        })),
      );
      pk += s.kcal;
      pp += s.prot;
    }
  }
  dishKcal += dk; dishProt += dp; prepKcal += pk; prepProt += pp;
  if (dk + pk > 0) shares.push(pk / (dk + pk));
}

shares.sort((a, b) => a - b);
const pct = (x: number) => `${Math.round(x * 100)} %`;
console.log(`plans lus: ${plans} · dont avec préparations: ${plansWithPreps}`);
console.log(`\néNERGIE  plats ${Math.round(dishKcal)} · préparations ${Math.round(prepKcal)}`);
console.log(`         part invisible au verdict: ${pct(prepKcal / (dishKcal + prepKcal))}`);
console.log(`PROTÉINE plats ${Math.round(dishProt)} g · préparations ${Math.round(prepProt)} g`);
console.log(`         part invisible au verdict: ${pct(prepProt / (dishProt + prepProt))}`);
if (shares.length) {
  const q = (f: number) => pct(shares[Math.min(shares.length - 1, Math.floor(f * shares.length))]);
  console.log(`\npar plan, part d'énergie en préparation — médiane ${q(0.5)} · p75 ${q(0.75)} · max ${pct(shares[shares.length - 1])}`);
  console.log(`plans dont PLUS DE LA MOITIÉ de l'énergie est invisible: ${shares.filter((s) => s > 0.5).length}/${shares.length}`);
}
