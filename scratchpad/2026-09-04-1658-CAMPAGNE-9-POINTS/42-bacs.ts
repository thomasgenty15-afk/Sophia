// Les BACS COMMUNS d'un plan : densité de chaque casserole (lot 0), kcal du bac par items, kcal/g, mangeurs.
import { loadCompositionIndex } from "../../supabase/functions/_shared/keel/food_composition_io.ts";
import { boxKcalByItems, potDensities } from "../../supabase/functions/_shared/keel/mouth_energy.ts";
import { weighedReadyGrams } from "../../supabase/functions/_shared/keel/box_densify.ts";
import { dishEnergy } from "../../supabase/functions/_shared/keel/plan_energy.ts";
const [refDir, planFile] = Deno.args;
const readNd = (f: string) => Deno.readTextFileSync(f).split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
const cache = new Map<string, unknown[]>();
const client = { from(t: string) { return { select(_c: string) { return { range(a: number, b: number) { if (!cache.has(t)) cache.set(t, readNd(`${refDir}/${t}.ndjson`)); return Promise.resolve({ data: cache.get(t)!.slice(a, b + 1), error: null }); } }; } }; } };
const index = await loadCompositionIndex(client);
// deno-lint-ignore no-explicit-any
const plan = JSON.parse(Deno.readTextFileSync(planFile)) as any;
// deno-lint-ignore no-explicit-any
const toInput = (i: any) => ({ term: String(i.term ?? ""), amount: Number(i.amount) > 0 ? Number(i.amount) : null, unit: typeof i.unit === "string" ? i.unit : null, state: typeof i.state === "string" ? i.state : null, quantity: typeof i.quantity === "string" ? i.quantity : null });
// deno-lint-ignore no-explicit-any
const preps = (plan.preparations as any[]).map((p) => ({ id: String(p.id), servingsMade: Math.max(1, Number(p.servings_made) || 1), method: String(p.method ?? ""), ingredients: p.ingredients.map(toInput) }));
const dens = potDensities(index, preps as never);
console.log("=== CASSEROLES ===");
for (const p of preps) {
  const e = dishEnergy(index, { method: p.method, ingredients: p.ingredients as never });
  const ready = weighedReadyGrams(p.ingredients as never, index);
  const raw = p.ingredients.reduce((n, i) => n + (i.unit === "g" ? (i.amount ?? 0) : 0), 0);
  // deno-lint-ignore no-explicit-any
  const title = (plan.preparations as any[]).find((x) => x.id === p.id)?.title ?? "";
  console.log(`  ${p.id.padEnd(22)} ${title.slice(0, 30).padEnd(31)} cru ${String(Math.round(raw)).padStart(5)} g · prêt ${ready === null ? "  ?  " : String(Math.round(ready)).padStart(5)} g · ${e.kcal === null ? "kcal ?" : String(Math.round(e.kcal)).padStart(5) + " kcal"} · densité ${dens.get(p.id) === null ? "?" : (dens.get(p.id) ?? 0).toFixed(2)} · ${p.servingsMade} parts${e.complete ? "" : " · INCOMPLET " + JSON.stringify(e.gaps)}`);
}
console.log("=== BACS COMMUNS ===");
// deno-lint-ignore no-explicit-any
for (const d of plan.dishes as any[]) {
  // deno-lint-ignore no-explicit-any
  const boxes = (d.boxes ?? []) as any[]; if (!boxes.length) continue;
  const per = boxKcalByItems(index, { day: d.day, slot: d.slot, method: String(d.method ?? ""), ingredients: d.ingredients.map(toInput) as never, uses: (d.uses ?? []).map((u: { preparation_id: string; servings: number }) => ({ preparationId: String(u.preparation_id), servings: Number(u.servings) || 1 })), boxes: boxes.map((b) => ({ memberIds: (b.member_ids ?? []).map(String), items: (b.items ?? []).map((it: { grams: number; preparation_id?: string | null }) => ({ grams: Number(it.grams) || 0, ...(it.preparation_id === undefined ? {} : { preparationId: typeof it.preparation_id === "string" && it.preparation_id !== "" ? it.preparation_id : null }) })), legacyTotalGrams: null })) }, dens);
  boxes.forEach((b, j) => {
    const n = (b.member_ids ?? []).length; if (n < 2) return;
    const g = b.items.reduce((s: number, i: { grams: number }) => s + (Number(i.grams) || 0), 0);
    const k = per?.[j]?.kcal ?? null;
    console.log(`  ${d.day}/${d.slot.padEnd(9)} ${n} bouches · ${String(g).padStart(5)} g · ${k === null ? "kcal ? (" + per?.[j]?.gap + ")" : Math.round(k) + " kcal · " + (k / g).toFixed(2) + " kcal/g · " + Math.round(k / n) + " kcal/bouche"} · items: ${b.items.map((i: { term: string; grams: number; preparation_id?: string }) => `${i.term} ${i.grams} g${i.preparation_id ? " [" + i.preparation_id + "]" : ""}`).join(", ").slice(0, 110)}`);
  });
}
