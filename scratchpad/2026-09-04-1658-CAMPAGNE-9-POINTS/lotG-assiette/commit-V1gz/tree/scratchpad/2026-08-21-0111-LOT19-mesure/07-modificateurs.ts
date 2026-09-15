/**
 * LOT 19 — LES MODIFICATEURS QUI CHANGENT L'ALIMENT.
 *
 * Le module dit: « Le test d'admission d'une entrée est: la réduction
 * change-t-elle l'aliment ? Si oui, elle n'entre pas. » On l'ÉPROUVE sur les
 * données: pour chaque nom connu du référentiel (slug ou alias) qui contient un
 * mot de la liste FERMÉE des modificateurs, on retire ce mot et on regarde où
 * la forme réduite tombe. Si elle tombe sur un AUTRE groupe d'aliment, ou à
 * plus de 1,5× d'énergie, la réduction change l'aliment.
 *
 * ⚠️ Ça ne casse pas la forme complète (elle est essayée d'abord). Le danger se
 * réalise quand le modèle écrit la forme complète PLUS un mot — « pain complet
 * grillé » — car la forme complète rate alors, et la réduction décide seule.
 */
import {
  buildCompositionIndex, type CompositionRef, normalizeTerm, resolveIngredient, type YieldClass,
} from "../../supabase/functions/_shared/keel/food_composition.ts";
import type { FoodGroupRef } from "../../supabase/functions/_shared/keel/tokens.ts";
const dir = Deno.args[0];
const read = (f: string) => JSON.parse(Deno.readTextFileSync(`${dir}/${f}`));
const refs: CompositionRef[] = (read("refs.json") as Record<string, any>[]).map((r) => ({
  slug: String(r.slug), foodGroupRef: String(r.food_group_ref) as FoodGroupRef, label: String(r.label),
  energyKcal: Number(r.energy_kcal), proteinG: null, carbsG: null, fatG: null, fiberG: null,
  omega3Marine: false, ironSource: false, calciumSource: false, iodineSource: false, zincSource: false,
  b12Source: false, folateSource: false, yieldClass: String(r.yield_class) as YieldClass,
  atwaterDiscount: Number(r.atwater_discount), energyDense: !!r.energy_dense, unitGrams: null, condimentGrams: null,
}));
const aliases = read("aliases.json") as { alias: string; slug: string }[];
const index = buildCompositionIndex(refs, aliases);
const bySlug = new Map(refs.map((r) => [r.slug, r]));

// La liste FERMÉE, recopiée du module (source: food_composition.ts).
const MODS = (Deno.readTextFileSync("../../supabase/functions/_shared/keel/food_composition.ts")
  .split("const PREPARATION_MODIFIERS: readonly string[] = [")[1].split("];")[0]
  .match(/"([a-z']+)"/g) ?? []).map((s) => s.replace(/"/g, ""));
console.log(`modificateurs lus dans le module : ${MODS.length}`);

const names = new Set<string>();
for (const r of refs) names.add(r.slug.replace(/_/g, " "));
for (const a of aliases) names.add(normalizeTerm(a.alias));

type Hit = { mod: string; full: string; from: string; to: string; reason: string };
const hits: Hit[] = [];
for (const name of names) {
  const words = name.split(" ");
  if (words.length < 2) continue;
  const src = resolveIngredient(index, name);
  if (!src) continue;
  for (const m of MODS) {
    if (!words.includes(m)) continue;
    const reduced = words.filter((w) => w !== m).join(" ");
    if (!reduced) continue;
    const dst = resolveIngredient(index, reduced);
    if (!dst || dst.slug === src.slug) continue;
    const ratio = Math.max(src.energyKcal, dst.energyKcal) / Math.max(1, Math.min(src.energyKcal, dst.energyKcal));
    const groupChanged = src.foodGroupRef !== dst.foodGroupRef;
    if (!groupChanged && ratio < 1.5) continue;
    hits.push({
      mod: m, full: name, from: `${src.slug} (${src.foodGroupRef}, ${src.energyKcal})`,
      to: `${dst.slug} (${dst.foodGroupRef}, ${dst.energyKcal})`,
      reason: [groupChanged ? "GROUPE" : "", ratio >= 1.5 ? `×${ratio.toFixed(1)} kcal` : ""].filter(Boolean).join(" + "),
    });
  }
}
const byMod = new Map<string, Hit[]>();
for (const h of hits) (byMod.get(h.mod) ?? byMod.set(h.mod, []).get(h.mod)!).push(h);
console.log(`\nnoms connus éprouvés : ${names.size}`);
console.log(`réductions qui changent l'aliment : ${hits.length}\n`);
console.log("modificateur      cas   exemple");
for (const [m, hs] of [...byMod.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${m.padEnd(16)} ${String(hs.length).padStart(4)}   « ${hs[0].full} » : ${hs[0].from} → ${hs[0].to}  [${hs[0].reason}]`);
}
console.log("\n── LE DÉTAIL DES CAS FRANÇAIS DE `complet` / `entier` / `sec` ──");
for (const h of hits.filter((h) => ["complet","complete","complets","completes","entier","entiere","entiers","entieres","sec","seche","seches","sechees","dried","whole","light","lean"].includes(h.mod))) {
  console.log(`  [${h.mod}] « ${h.full} » : ${h.from} → ${h.to}  [${h.reason}]`);
}
