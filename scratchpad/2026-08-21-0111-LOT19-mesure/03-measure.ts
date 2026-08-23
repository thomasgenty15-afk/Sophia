/**
 * LOT 19 — LA MESURE. Tout passe par le VRAI résolveur de production.
 *   deno run --allow-read 03-measure.ts <dir>
 */
import {
  buildCompositionIndex,
  type CompositionInput,
  type CompositionRef,
  gramsRawOf,
  condimentMassFor,
  normalizeTerm,
  resolveIngredient,
  type YieldClass,
} from "../../supabase/functions/_shared/keel/food_composition.ts";
import type { FoodGroupRef } from "../../supabase/functions/_shared/keel/tokens.ts";
import { langOf, type Lang } from "./lang.ts";

const dir = Deno.args[0];
const read = (f: string) => JSON.parse(Deno.readTextFileSync(`${dir}/${f}`));
const refRows = read("refs.json") as Record<string, any>[];
const aliasRows = read("aliases.json") as { alias: string; slug: string }[];
const meals = read("meals.json") as Record<string, any>[];

const refs: CompositionRef[] = refRows.map((r) => ({
  slug: String(r.slug), foodGroupRef: String(r.food_group_ref) as FoodGroupRef, label: String(r.label),
  energyKcal: Number(r.energy_kcal),
  proteinG: r.protein_g === null ? null : Number(r.protein_g),
  carbsG: r.carbs_g === null ? null : Number(r.carbs_g),
  fatG: r.fat_g === null ? null : Number(r.fat_g),
  fiberG: r.fiber_g === null ? null : Number(r.fiber_g),
  omega3Marine: r.omega3_marine === true, ironSource: r.iron_source === true,
  calciumSource: r.calcium_source === true, iodineSource: r.iodine_source === true,
  zincSource: r.zinc_source === true, b12Source: r.b12_source === true, folateSource: r.folate_source === true,
  yieldClass: String(r.yield_class) as YieldClass, atwaterDiscount: Number(r.atwater_discount),
  energyDense: r.energy_dense === true,
  unitGrams: r.unit_grams === null ? null : Number(r.unit_grams),
  condimentGrams: r.condiment_grams === null ? null : Number(r.condiment_grams),
}));
const index = buildCompositionIndex(refs, aliasRows);

const asInput = (i: any): CompositionInput => ({
  term: String(i?.term ?? "").trim(),
  amount: i?.amount ?? null,
  unit: i?.unit ?? null,
  state: i?.state ?? null,
});

/** RÉSOLU = `resolveIngredient` rend une ligne. PESÉ = grammes crus calculables (convention des condiments incluse). */
function verdictOf(i: CompositionInput): { resolved: boolean; weighed: boolean } {
  const ref = resolveIngredient(index, i.term);
  if (!ref) return { resolved: false, weighed: false };
  const g = gramsRawOf({ amount: i.amount ?? null, unit: i.unit ?? null, state: i.state ?? null, yieldClass: ref.yieldClass, unitGrams: ref.unitGrams });
  return { resolved: true, weighed: g !== null || condimentMassFor(ref) !== null };
}

type Line = { norm: string; lang: Lang; lane: string; live: boolean; modern: boolean; planId: string; source: "dish" | "preparation"; resolved: boolean; weighed: boolean };
const lines: Line[] = [];
type DayKey = string;
const days = new Map<DayKey, { lane: string; live: boolean; modern: boolean; n: number; allResolved: boolean; allWeighed: boolean }>();

for (const m of meals) {
  const lane = String(m.plan_kind);
  const live = m.retired_at === null || m.retired_at === undefined;
  const modern = String(m.created_at) >= "2026-08-12";
  const planId = String(m.id);
  const preps = (Array.isArray(m.preparations) ? m.preparations : []).map((p: any) => ({
    id: String(p?.id ?? ""),
    servingsMade: Math.max(1, Number(p?.servingsMade ?? p?.servings_made) || 1),
    ingredients: (Array.isArray(p?.ingredients) ? p.ingredients : []).map(asInput).filter((i: CompositionInput) => i.term),
  }));
  const byId = new Map(preps.map((p: any) => [p.id, p]));
  for (const p of preps) for (const i of p.ingredients) {
    const v = verdictOf(i);
    lines.push({ norm: normalizeTerm(i.term), lang: langOf(normalizeTerm(i.term)), lane, live, modern, planId, source: "preparation", ...v });
  }
  for (const d of (Array.isArray(m.dishes) ? m.dishes : [])) {
    for (const i of (Array.isArray(d?.ingredients) ? d.ingredients : []).map(asInput).filter((i: CompositionInput) => i.term)) {
      const v = verdictOf(i);
      lines.push({ norm: normalizeTerm(i.term), lang: langOf(normalizeTerm(i.term)), lane, live, modern, planId, source: "dish", ...v });
    }
  }
  // ── LE JOUR, PLIÉ, comme `planEnergyFor` le fait ──────────────────────────
  for (const d of (Array.isArray(m.dishes) ? m.dishes : [])) {
    const key = `${m.id}|${d?.day ?? "null"}`;
    const folded: CompositionInput[] = (Array.isArray(d?.ingredients) ? d.ingredients : []).map(asInput).filter((i: CompositionInput) => i.term);
    for (const u of (Array.isArray(d?.uses) ? d.uses : [])) {
      const p: any = byId.get(String(u?.preparation_id ?? u?.preparationId ?? ""));
      if (!p) continue;
      const share = (Number(u?.servings) || 1) / p.servingsMade;
      for (const i of p.ingredients) folded.push({ ...i, amount: i.amount === null || i.amount === undefined ? null : i.amount * share });
    }
    const e = days.get(key) ?? { lane, live, modern, n: 0, allResolved: true, allWeighed: true };
    for (const i of folded) {
      const v = verdictOf(i);
      e.n++;
      if (!v.resolved) { e.allResolved = false; e.allWeighed = false; }
      else if (!v.weighed) e.allWeighed = false;
    }
    days.set(key, e);
  }
}

const pct = (a: number, b: number) => b === 0 ? "  n/a " : `${((a / b) * 100).toFixed(1)} %`;
const median = (xs: number[]) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

function block(title: string, sel: (l: Line) => boolean) {
  const ls = lines.filter(sel);
  console.log(`\n── ${title} ──`);
  console.log("langue   | occurrences  résolues  taux    | uniques  résolues  taux");
  for (const lang of ["en", "fr", "neutre", "mixte"] as Lang[]) {
    const sub = ls.filter((l) => l.lang === lang);
    if (!sub.length) continue;
    const u = new Map<string, boolean>();
    for (const l of sub) u.set(l.norm, l.resolved);
    const uv = [...u.values()];
    console.log(
      `${lang.padEnd(8)} | ${String(sub.length).padStart(11)}  ${String(sub.filter((l) => l.resolved).length).padStart(8)}  ${pct(sub.filter((l) => l.resolved).length, sub.length).padStart(6)}  | ${String(u.size).padStart(7)}  ${String(uv.filter(Boolean).length).padStart(8)}  ${pct(uv.filter(Boolean).length, uv.length).padStart(6)}`,
    );
  }
  const u = new Map<string, boolean>(); for (const l of ls) u.set(l.norm, l.resolved);
  console.log(`${"TOTAL".padEnd(8)} | ${String(ls.length).padStart(11)}  ${String(ls.filter((l) => l.resolved).length).padStart(8)}  ${pct(ls.filter((l) => l.resolved).length, ls.length).padStart(6)}  | ${String(u.size).padStart(7)}  ${String([...u.values()].filter(Boolean).length).padStart(8)}  ${pct([...u.values()].filter(Boolean).length, u.size).padStart(6)}`);
}

console.log("═══ TAUX DE RÉSOLUTION PAR INGRÉDIENT ═══");
block("corpus entier (plats + préparations, 2 lanes)", () => true);
block("lane solo", (l) => l.lane === "personal");
block("lane foyer", (l) => l.lane === "household");

console.log("\n═══ RÉSOLU **ET PESÉ** (ce que la porte du jour exige) ═══");
console.log("langue   | occurrences  résolues+pesées  taux");
for (const lang of ["en", "fr", "neutre", "mixte"] as Lang[]) {
  const sub = lines.filter((l) => l.lang === lang);
  if (!sub.length) continue;
  console.log(`${lang.padEnd(8)} | ${String(sub.length).padStart(11)}  ${String(sub.filter((l) => l.weighed).length).padStart(16)}  ${pct(sub.filter((l) => l.weighed).length, sub.length).padStart(6)}`);
}
console.log(`${"TOTAL".padEnd(8)} | ${String(lines.length).padStart(11)}  ${String(lines.filter((l) => l.weighed).length).padStart(16)}  ${pct(lines.filter((l) => l.weighed).length, lines.length).padStart(6)}`);

console.log("\n═══ LA JOURNÉE ═══");
for (const [scope, filt] of [["TOUS LES PLANS", (_x: any) => true], ["PLANS VIVANTS (retired_at is null)", (x: any) => x.live], ["PLANS DU 2026-08-12 OU APRÈS (contrat de quantités en place)", (x: any) => x.modern]] as [string, (x: any) => boolean][]) {
console.log(`\n### ${scope}`);
for (const lane of ["personal", "household"]) {
  const ds = [...days.values()].filter((d) => d.lane === lane && d.n > 0 && filt(d));
  const ns = ds.map((d) => d.n);
  const ll = lines.filter((l) => l.lane === lane && filt(l));
  const R = ll.filter((l) => l.resolved).length / ll.length;
  const W = ll.filter((l) => l.weighed).length / ll.length;
  const n = median(ns);
  console.log(`\nlane ${lane}`);
  console.log(`  journées                         ${ds.length}`);
  console.log(`  ingrédients par journée (pliés)  médiane ${n}   moyenne ${(ns.reduce((a, b) => a + b, 0) / ns.length).toFixed(1)}   min ${Math.min(...ns)}   max ${Math.max(...ns)}`);
  console.log(`  journées 100 % RÉSOLUES          ${ds.filter((d) => d.allResolved).length}/${ds.length} = ${pct(ds.filter((d) => d.allResolved).length, ds.length)}`);
  console.log(`  journées 100 % résolues ET PESÉES ${ds.filter((d) => d.allWeighed).length}/${ds.length} = ${pct(ds.filter((d) => d.allWeighed).length, ds.length)}   <- la porte réelle`);
  console.log(`  p(résolu)=${(R * 100).toFixed(1)} %  ⇒ p^n = ${(Math.pow(R, n) * 100).toFixed(1)} %`);
  console.log(`  p(résolu ET pesé)=${(W * 100).toFixed(1)} %  ⇒ p^n = ${(Math.pow(W, n) * 100).toFixed(1)} %`);
}
}

console.log("\n═══ TOP 30 DES CHAÎNES QUI RATENT ═══");
const miss = new Map<string, { n: number; lang: Lang; lanes: Set<string> }>();
for (const l of lines) if (!l.resolved) { const e = miss.get(l.norm) ?? { n: 0, lang: l.lang, lanes: new Set<string>() }; e.n++; e.lanes.add(l.lane); miss.set(l.norm, e); }
console.log(`chaînes uniques qui ratent : ${miss.size}   occurrences perdues : ${lines.filter((l) => !l.resolved).length}`);
let i = 0;
for (const [k, v] of [...miss.entries()].sort((a, b) => b[1].n - a[1].n)) {
  if (++i > 30) break;
  console.log(`${String(v.n).padStart(4)}  ${v.lang.padEnd(6)}  ${k}`);
}

console.log("\n═══ RÉSOLUS MAIS NON PESÉS — top 20 ═══");
const unw = new Map<string, number>();
for (const l of lines) if (l.resolved && !l.weighed) unw.set(l.norm, (unw.get(l.norm) ?? 0) + 1);
console.log(`uniques : ${unw.size}   occurrences : ${lines.filter((l) => l.resolved && !l.weighed).length}`);
i = 0;
for (const [k, n] of [...unw.entries()].sort((a, b) => b[1] - a[1])) { if (++i > 20) break; console.log(`${String(n).padStart(4)}  ${k}`); }

console.log("\n═══ LES ÉCHECS SONT-ILS INDÉPENDANTS ? (répartition PAR PLAN) ═══");
for (const lane of ["personal", "household"]) {
  const byPlan = new Map<string, { n: number; w: number; r: number }>();
  for (const l of lines.filter((l) => l.lane === lane)) {
    const e = byPlan.get(l.planId) ?? { n: 0, w: 0, r: 0 };
    e.n++; if (l.weighed) e.w++; if (l.resolved) e.r++;
    byPlan.set(l.planId, e);
  }
  const rates = [...byPlan.values()].map((e) => e.w / e.n);
  const bins = [0, 0, 0, 0, 0];
  for (const r of rates) bins[Math.min(4, Math.floor(r * 5))]++;
  console.log(`\nlane ${lane} — part des lignes PESÉES, par plan (${rates.length} plans)`);
  console.log(`   0-20 %: ${bins[0]}   20-40 %: ${bins[1]}   40-60 %: ${bins[2]}   60-80 %: ${bins[3]}   80-100 %: ${bins[4]}`);
  const rr = [...byPlan.values()].map((e) => e.r / e.n);
  const b2 = [0, 0, 0, 0, 0];
  for (const r of rr) b2[Math.min(4, Math.floor(r * 5))]++;
  console.log(`lane ${lane} — part des lignes RÉSOLUES, par plan`);
  console.log(`   0-20 %: ${b2[0]}   20-40 %: ${b2[1]}   40-60 %: ${b2[2]}   60-80 %: ${b2[3]}   80-100 %: ${b2[4]}`);
}
