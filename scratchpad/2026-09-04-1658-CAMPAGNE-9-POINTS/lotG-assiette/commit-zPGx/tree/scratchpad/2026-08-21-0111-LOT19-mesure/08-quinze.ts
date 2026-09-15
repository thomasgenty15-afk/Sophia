import { buildCompositionIndex, type CompositionRef, resolveIngredient, type YieldClass } from "../../supabase/functions/_shared/keel/food_composition.ts";
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
const index = buildCompositionIndex(refs, read("aliases.json"));
const CASES: [string, string[], string[]][] = [
  ["bagel", ["bagel", "bagels"], ["bagel", "bagels"]],
  ["bread", ["bread", "loaf"], ["pain", "pain frais"]],
  ["bresaola", ["bresaola"], ["bresaola"]],
  ["bulgur_wheat", ["bulgur wheat", "cracked wheat"], ["boulgour de ble", "boulgour"]],
  ["coppa", ["coppa"], ["coppa"]],
  ["galantine", ["galantine"], ["galantine"]],
  ["hot_sauce", ["hot sauce", "chilli sauce"], ["sauce piquante", "sauce pimentee"]],
  ["mixed_seeds", ["mixed seeds", "seed mix"], ["graines melangees", "melange de graines"]],
  ["naan_bread", ["naan bread", "naan"], ["pain naan", "naan"]],
  ["pate", ["pate", "liver pate"], ["pate", "pate de campagne"]],
  ["plum", ["plum", "plums"], ["prune", "prunes"]],
  ["poppy_seeds", ["poppy seeds"], ["graines de pavot", "pavot"]],
  ["salami", ["salami"], ["salami"]],
  ["sunflower_seed_butter", ["sunflower seed butter"], ["puree de graines de tournesol", "beurre de graines de tournesol"]],
  ["turmeric", ["turmeric", "ground turmeric"], ["curcuma", "curcuma moulu"]],
];
console.log("slug                   | forme            | atteint");
for (const [slug, ens, frs] of CASES) {
  for (const [lang, forms] of [["EN", ens], ["FR", frs]] as [string, string[]][]) {
    for (const f of forms) {
      const got = resolveIngredient(index, f);
      const mark = !got ? "∅ RIEN" : got.slug === slug ? "✓" : `≠ ${got.slug} (${got.label}, ${got.energyKcal} kcal)`;
      console.log(`${slug.padEnd(22)} | ${lang} ${f.padEnd(30)} | ${mark}`);
    }
  }
}
