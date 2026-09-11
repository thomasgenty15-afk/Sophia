import { loadCompositionIndex } from "../../supabase/functions/_shared/keel/food_composition_io.ts";
import { resolveIngredient } from "../../supabase/functions/_shared/keel/food_composition.ts";
const [refDir, planFile] = Deno.args;
const readNd = (f: string) =>
  Deno.readTextFileSync(f).split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
function fileClient() {
  const cache = new Map<string, unknown[]>();
  const rowsOf = (t: string) => {
    if (!cache.has(t)) cache.set(t, readNd(`${refDir}/${t}.ndjson`));
    return cache.get(t)!;
  };
  return { from(table: string) { return { select(_c: string) { return {
    range(a: number, b: number) {
      return Promise.resolve({ data: rowsOf(table).slice(a, b + 1), error: null });
    } }; } }; } };
}
const index = await loadCompositionIndex(fileClient() as any);
const plan = JSON.parse(Deno.readTextFileSync(planFile));
const bad = new Map<string, string[]>();
for (const d of plan.dishes ?? []) {
  const solo = (d.boxes ?? []).filter((b: any) => (b.member_ids ?? b.memberIds ?? []).length === 1);
  if (solo.length === 0) continue;
  const miss = (d.ingredients ?? [])
    .filter((i: any) => !resolveIngredient(index, String(i.term ?? "")))
    .map((i: any) => i.term);
  if (miss.length) bad.set(`${d.day} ${d.slot} · ${d.title}`, miss);
}
console.log(`── plats à boîte solo dont un terme NE SE RÉSOUT PAS (${plan.dishes?.length} plats) ──`);
if (bad.size === 0) console.log("  aucun — la lacune vient d'ailleurs");
for (const [k, v] of bad) console.log(`  ${k}\n      → ${v.join(", ")}`);
