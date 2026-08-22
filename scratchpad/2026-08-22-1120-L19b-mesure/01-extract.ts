/**
 * LOT 19 — ÉTAPE 1 : le corpus d'ingrédients RÉELS, passé par le VRAI résolveur.
 *
 * Aucune réimplémentation: on importe `buildCompositionIndex` et
 * `resolveIngredient` du module de production.
 *
 *   deno run --allow-read 01-extract.ts <dir>
 */
import {
  buildCompositionIndex,
  type CompositionRef,
  normalizeTerm,
  resolveIngredient,
  type YieldClass,
} from "../../supabase/functions/_shared/keel/food_composition.ts";
import type { FoodGroupRef } from "../../supabase/functions/_shared/keel/tokens.ts";

const dir = Deno.args[0];
const read = (f: string) => JSON.parse(Deno.readTextFileSync(`${dir}/${f}`));

const refRows = read("refs.json") as Record<string, unknown>[];
const aliasRows = read("aliases.json") as { alias: string; slug: string }[];
const meals = read("meals.json") as Array<Record<string, any>>;

const refs: CompositionRef[] = refRows.map((r) => ({
  slug: String(r.slug),
  foodGroupRef: String(r.food_group_ref) as FoodGroupRef,
  label: String(r.label),
  energyKcal: Number(r.energy_kcal),
  proteinG: r.protein_g === null ? null : Number(r.protein_g),
  carbsG: r.carbs_g === null ? null : Number(r.carbs_g),
  fatG: r.fat_g === null ? null : Number(r.fat_g),
  fiberG: r.fiber_g === null ? null : Number(r.fiber_g),
  omega3Marine: r.omega3_marine === true,
  ironSource: r.iron_source === true,
  calciumSource: r.calcium_source === true,
  iodineSource: r.iodine_source === true,
  zincSource: r.zinc_source === true,
  b12Source: r.b12_source === true,
  folateSource: r.folate_source === true,
  yieldClass: String(r.yield_class) as YieldClass,
  atwaterDiscount: Number(r.atwater_discount),
  energyDense: r.energy_dense === true,
  unitGrams: r.unit_grams === null ? null : Number(r.unit_grams),
  condimentGrams: r.condiment_grams === null ? null : Number(r.condiment_grams),
}));

const index = buildCompositionIndex(refs, aliasRows);

type Row = {
  raw: string;
  norm: string;
  source: "dish" | "preparation" | "shopping_list" | "pantry";
  lane: string;
  mealId: string;
  locale: string;
  day: string | null;
  slot: string | null;
  hasAmount: boolean;
  slug: string | null;
};

const rows: Row[] = [];

for (const m of meals) {
  const lane = String(m.plan_kind);
  const locale = String(m.content_locale ?? "");
  const dishes = Array.isArray(m.dishes) ? m.dishes : [];
  const preps = Array.isArray(m.preparations) ? m.preparations : [];
  const push = (
    term: unknown,
    source: Row["source"],
    day: string | null,
    slot: string | null,
    hasAmount: boolean,
  ) => {
    const raw = String(term ?? "").trim();
    if (!raw) return;
    const ref = resolveIngredient(index, raw);
    rows.push({
      raw,
      norm: normalizeTerm(raw),
      source,
      lane,
      mealId: String(m.id),
      locale,
      day,
      slot,
      hasAmount,
      slug: ref ? ref.slug : null,
    });
  };
  for (const d of dishes) {
    for (const i of (Array.isArray(d?.ingredients) ? d.ingredients : [])) {
      push(i?.term, "dish", d?.day ?? null, d?.slot ?? null, i?.amount !== null && i?.amount !== undefined);
    }
  }
  for (const p of preps) {
    for (const i of (Array.isArray(p?.ingredients) ? p.ingredients : [])) {
      push(i?.term, "preparation", p?.cook_on ?? null, null, i?.amount !== null && i?.amount !== undefined);
    }
  }
  for (const s of (Array.isArray(m.shopping_list) ? m.shopping_list : [])) {
    push(s?.term, "shopping_list", null, null, false);
  }
  for (const s of (Array.isArray(m.pantry) ? m.pantry : [])) {
    push(s?.term, "pantry", null, null, false);
  }
}

Deno.writeTextFileSync(`${dir}/terms.json`, JSON.stringify(rows));

const core = rows.filter((r) => r.source === "dish" || r.source === "preparation");
const uniq = new Map<string, { n: number; slug: string | null; raws: Set<string> }>();
for (const r of core) {
  const e = uniq.get(r.norm) ?? { n: 0, slug: r.slug, raws: new Set<string>() };
  e.n++;
  e.raws.add(r.raw);
  uniq.set(r.norm, e);
}
console.log(`lignes d'ingrédient (plats+préparations) : ${core.length}`);
console.log(`chaînes normalisées uniques              : ${uniq.size}`);
console.log(`résolues (occurrences)                   : ${core.filter((r) => r.slug).length}`);
console.log(`résolues (uniques)                       : ${[...uniq.values()].filter((e) => e.slug).length}`);
console.log(`lignes shopping_list                     : ${rows.filter((r) => r.source === "shopping_list").length}`);
console.log(`lignes pantry                            : ${rows.filter((r) => r.source === "pantry").length}`);
