// ══════════════════════════════════════════════════════════════════════════
// LA PART STANDARD D'UN PLAT, PAR L'ARITHMÉTIQUE DU PRODUIT — 2026-09-07
//
//   deno run --allow-read 31-energie-solo.ts <refs.json> <aliases.json> <plan.json>
//
// ⛔ AUCUNE ARITHMÉTIQUE N'EST RÉÉCRITE ICI. `dishEnergy`, `weighedReadyGrams`,
// `resolveIngredient` et `loadCompositionIndex` sont IMPORTÉS du moteur. Une
// seconde implémentation en Python aurait mesuré le banc avec son propre
// instrument — et c'est exactement le reproche qu'on veut pouvoir écarter
// quand le lot 2 rendra ses `sizing.rows[]` : les deux chiffres doivent
// coïncider parce qu'ils sortent du MÊME code, pas parce qu'on les a
// rapprochés.
//
// ⚠️ LE CLIENT DE BASE EST UN LEURRE, ET LE LOADER EST LE VRAI. Les deux
// tables sont déjà déversées en JSON par `20-tir-solo.sh`; on rend à
// `loadCompositionIndex` la forme qu'il attend pour que `toRef` — qui n'est
// PAS exporté et qui ÉCARTE les lignes illisibles — s'exécute pour de bon.
import { loadCompositionIndex } from "../../supabase/functions/_shared/keel/food_composition_io.ts";
import { dishEnergy } from "../../supabase/functions/_shared/keel/plan_energy.ts";
import { weighedReadyGrams } from "../../supabase/functions/_shared/keel/box_densify.ts";

const [refsPath, aliasPath, planPath] = Deno.args;
if (!refsPath || !aliasPath || !planPath) {
  console.error("usage: 31-energie-solo.ts <refs.json> <aliases.json> <plan.json>");
  Deno.exit(2);
}
const refRows = JSON.parse(await Deno.readTextFile(refsPath));
const aliasRows = JSON.parse(await Deno.readTextFile(aliasPath));

const fakeDb = {
  from(table: string) {
    const rows = table === "food_composition_refs" ? refRows : aliasRows;
    return {
      select(_columns: string) {
        return {
          range(from: number, to: number) {
            return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
          },
        };
      },
    };
  },
};
// deno-lint-ignore no-explicit-any
const index = await loadCompositionIndex(fakeDb as any);

// deno-lint-ignore no-explicit-any
const plan: any = JSON.parse(await Deno.readTextFile(planPath));
const dishes = plan.dishes ?? [];
// deno-lint-ignore no-explicit-any
const preps: any[] = plan.preparations ?? [];
const prepById = new Map(preps.map((p) => [String(p.id), p]));

// ── LES TIRAGES: COMBIEN DE PLATS TIRENT SUR CHAQUE CASSEROLE ────────────
// ⛔ PAS `servings_made`. Mesuré faux sur les plans réels — `servings: 1` sur
// des pots de 15. La part standard d'un plat vaut donc son frais PLUS la
// recette de la casserole DIVISÉE par le nombre de plats qui la tirent.
const draws = new Map<string, number>();
for (const d of dishes) {
  for (const u of (d.uses ?? [])) {
    const id = String(u?.preparation_id ?? u?.id ?? "");
    if (id) draws.set(id, (draws.get(id) ?? 0) + 1);
  }
}

// deno-lint-ignore no-explicit-any
const scale = (ings: any[], f: number) =>
  ings.map((i) => ({
    ...i,
    amount: typeof i.amount === "number" ? i.amount * f : i.amount,
    // ⚠️ LA PROSE N'EST PAS MISE À L'ÉCHELLE, et elle ne peut pas l'être: elle
    // n'est lue qu'en dernier recours et seulement quand `amount` est nul. Un
    // ingrédient de casserole SANS `amount` est donc compté ENTIER dans chaque
    // part — c'est le seul biais de ce script, et il est compté plus bas.
  }));

const rows = [];
let unscaledProse = 0;
for (const d of dishes) {
  const fresh = d.ingredients ?? [];
  // deno-lint-ignore no-explicit-any
  const parts: any[] = [...fresh];
  const potNames: string[] = [];
  for (const u of (d.uses ?? [])) {
    const id = String(u?.preparation_id ?? u?.id ?? "");
    const p = prepById.get(id);
    if (!p) continue;
    const n = draws.get(id) ?? 1;
    potNames.push(`${p.title} ÷${n}`);
    const ings = p.ingredients ?? [];
    // deno-lint-ignore no-explicit-any
    unscaledProse += ings.filter((i: any) => typeof i.amount !== "number").length;
    parts.push(...scale(ings, 1 / n));
  }
  const e = dishEnergy(index, { method: String(d.method ?? ""), ingredients: parts });
  const cooked = weighedReadyGrams(parts, index);
  rows.push({
    day: d.day ?? null,
    slot: d.slot ?? null,
    title: d.title ?? null,
    member_id: d.member_id ?? null,
    pots: potNames,
    standard_kcal: e.kcal ?? null,
    complete: e.complete ?? null,
    gaps: e.gaps ?? [],
    bounded_kcal: e.boundedKcal ?? 0,
    standard_cooked_g: cooked === null ? null : Math.round(cooked),
    density_kcal_per_100g: (e.kcal && cooked) ? Math.round((e.kcal / cooked) * 1000) / 10 : null,
    boxes: (d.boxes ?? []).length,
  });
}
console.log(JSON.stringify({
  source: "recalculé par 31-energie-solo.ts (arithmétique du moteur importée)",
  refs: refRows.length,
  aliases: aliasRows.length,
  dishes: rows.length,
  pot_ingredients_without_amount: unscaledProse,
  rows,
}, null, 2));
