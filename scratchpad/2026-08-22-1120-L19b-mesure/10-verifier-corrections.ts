import { buildCompositionIndex, type CompositionRef, type YieldClass } from "../../supabase/functions/_shared/keel/food_composition.ts";
import type { FoodGroupRef } from "../../supabase/functions/_shared/keel/tokens.ts";
const dir = Deno.args[0];
const read = (f: string) => JSON.parse(Deno.readTextFileSync(`${dir}/${f}`));
const raw = read("refs.json") as Record<string, any>[];
const bySlug = new Map(raw.map((r) => [String(r.slug), r]));
const aliases = new Map((read("aliases.json") as { alias: string; slug: string }[]).map((a) => [a.alias, a.slug]));
const lines = Deno.readTextFileSync("corrections.tsv").split("\n").filter((l) => l.trim() && !l.startsWith("#")).map((l) => l.split("\t"));
const out = ["alias\tslug actuel\t→ slug proposé\tlibellé actuel\tlibellé proposé\tgroupe actuel → proposé\tkcal actuel → proposé\tunit_g actuel → proposé\tpreuve"];
let ok = 0;
for (const [alias, cur, next, why] of lines) {
  const has = aliases.get(alias);
  if (has === undefined) { console.log(`⛔ ${alias} : n'existe pas en base`); continue; }
  if (has !== cur) { console.log(`⛔ ${alias} : pointe sur ${has}, pas sur ${cur}`); continue; }
  const a = bySlug.get(cur), b = bySlug.get(next);
  if (!b) { console.log(`⛔ ${alias} : slug proposé inexistant ${next}`); continue; }
  ok++;
  out.push([alias, cur, next, a.label, b.label, `${a.food_group_ref} → ${b.food_group_ref}`,
    `${a.energy_kcal} → ${b.energy_kcal}`, `${a.unit_grams ?? "—"} → ${b.unit_grams ?? "—"}`, why].join("\t"));
}
console.log(`corrections vérifiées : ${ok}/${lines.length}`);
Deno.writeTextFileSync("corrections-verifiees.tsv", out.join("\n") + "\n");
