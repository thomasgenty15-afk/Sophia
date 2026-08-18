/**
 * DIAGNOSTIC — qui sont les « connus mais non pesés » ?
 *
 * On ne devine pas la liste des aliments à qui donner un poids d'unité: on la
 * LIT sur les plans déjà générés. Un `unit_grams` posé au jugé sur des aliments
 * que personne ne compte à l'unité serait de la donnée inventée sans effet.
 */

import { createClient } from "jsr:@supabase/supabase-js@2.87.3";
import { loadCompositionIndex } from "../supabase/functions/_shared/keel/food_composition_io.ts";
import { resolveIngredient } from "../supabase/functions/_shared/keel/food_composition.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const index = await loadCompositionIndex(admin);

const { data: plans, error } = await admin
  .from("student_generated_meals")
  .select("dishes, preparations")
  .order("created_at", { ascending: false })
  .limit(80);
if (error) throw new Error(error.message);

type Ing = { term?: string; amount?: unknown; unit?: unknown; state?: unknown };

/** slug → { unité comptée, nombre d'apparitions, termes vus } */
const bySlug = new Map<string, { unitCount: number; total: number; terms: Set<string> }>();
const unknownTerms = new Map<string, number>();
let seen = 0;

function visit(ing: Ing) {
  const term = String(ing?.term ?? "").trim();
  if (!term) return;
  seen++;
  const ref = resolveIngredient(index, term);
  if (!ref) {
    unknownTerms.set(term, (unknownTerms.get(term) ?? 0) + 1);
    return;
  }
  // Non pesé = pas d'unité exploitable, ou « unit » sans poids d'unité connu.
  const unit = ing.unit === null || ing.unit === undefined ? null : String(ing.unit);
  const weighable = unit === "g" || unit === "ml" || unit === "tbsp" || unit === "tsp" ||
    (unit === "unit" && ref.unitGrams !== null);
  if (weighable) return;
  const e = bySlug.get(ref.slug) ?? { unitCount: 0, total: 0, terms: new Set<string>() };
  e.total++;
  if (unit === "unit") e.unitCount++;
  e.terms.add(term.toLowerCase());
  bySlug.set(ref.slug, e);
}

type Row = { dishes: unknown; preparations: unknown };
for (const row of (plans ?? []) as Row[]) {
  for (const p of (row.preparations ?? []) as Record<string, unknown>[]) {
    for (const i of (p?.ingredients ?? []) as Ing[]) visit(i);
  }
  for (const d of (row.dishes ?? []) as Record<string, unknown>[]) {
    for (const i of (d?.ingredients ?? []) as Ing[]) visit(i);
  }
}

const rows = [...bySlug.entries()].sort((a, b) => b[1].total - a[1].total);
console.log(`ingrédients vus: ${seen} · non pesés: ${rows.reduce((s, r) => s + r[1].total, 0)}`);
console.log(`\n── COMPTÉS À L'UNITÉ sans poids d'unité (candidats unit_grams) ──`);
for (const [slug, e] of rows) {
  if (e.unitCount === 0) continue;
  console.log(`${String(e.unitCount).padStart(4)}×unit  ${slug.padEnd(38)} ${[...e.terms].slice(0, 3).join(", ")}`);
}
console.log(`\n── SANS UNITÉ EXPLOITABLE (contrat de quantités, pas unit_grams) ──`);
for (const [slug, e] of rows.slice(0, 30)) {
  if (e.unitCount > 0) continue;
  console.log(`${String(e.total).padStart(4)}×      ${slug.padEnd(38)} ${[...e.terms].slice(0, 3).join(", ")}`);
}
const unk = [...unknownTerms.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
console.log(`\n── INCONNUS DU RÉFÉRENTIEL (${unknownTerms.size} termes distincts) ──`);
for (const [t, n] of unk) console.log(`${String(n).padStart(4)}×      ${t}`);
