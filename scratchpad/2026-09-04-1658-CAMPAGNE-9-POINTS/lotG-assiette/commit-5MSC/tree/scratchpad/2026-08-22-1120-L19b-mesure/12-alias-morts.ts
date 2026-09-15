/**
 * L19b — LES ALIAS MORTS, et ce qu'ils CAPTURENT.
 *
 * `resolveIngredient` interroge `bySlug` AVANT `byAlias` (food_composition.ts).
 * Un alias dont la forme normalisée est elle-même un slug ne se déclenche donc
 * JAMAIS : le slug gagne. Deux populations, et seule la seconde est un défaut :
 *
 *   ① MORT INOFFENSIF — l'alias pointe sur le slug que sa propre forme désigne.
 *      Redondant, jamais lu, aucun effet.
 *   ② ⛔ MORT CONTRADICTOIRE — l'alias pointe AILLEURS que la ligne que sa forme
 *      capture. La table porte alors DEUX vérités pour un même mot, et c'est
 *      toujours celle de `bySlug` qui sort. L'un des deux est faux.
 *
 *   deno run --allow-read 12-alias-morts.ts <dir>
 */
import { normalizeTerm } from "../../supabase/functions/_shared/keel/food_composition.ts";
const dir = Deno.args[0];
const read = (f: string) => JSON.parse(Deno.readTextFileSync(`${dir}/${f}`));
const raw = read("refs.json") as Record<string, any>[];
const bySlug = new Map(raw.map((r) => [String(r.slug), r]));
const aliases = read("aliases.json") as { alias: string; slug: string }[];

const inoffensifs: string[] = [];
const contradictoires: string[] = [];
for (const a of aliases) {
  const asSlug = normalizeTerm(a.alias).replace(/ /g, "_");
  if (!bySlug.has(asSlug)) continue;
  const captured = bySlug.get(asSlug)!;
  const declared = bySlug.get(a.slug);
  const line = `${a.alias}\t→ déclaré ${a.slug}` +
    `${declared ? ` (${declared.label}, ${declared.food_group_ref}, ${declared.energy_kcal})` : " (SLUG INEXISTANT)"}` +
    `\tCAPTURÉ par bySlug ${asSlug} (${captured.label}, ${captured.food_group_ref}, ${captured.energy_kcal})`;
  if (asSlug === a.slug) inoffensifs.push(line);
  else contradictoires.push(line);
}
console.log(`alias en base                         : ${aliases.length}`);
console.log(`MORTS (forme = un slug)               : ${inoffensifs.length + contradictoires.length}`);
console.log(`  ① morts INOFFENSIFS (même ligne)    : ${inoffensifs.length}`);
console.log(`  ② ⛔ morts CONTRADICTOIRES          : ${contradictoires.length}`);
console.log("\n── ② LES CONTRADICTOIRES, un par un ──");
for (const l of contradictoires.sort()) console.log("  " + l);
console.log("\n── ① LES INOFFENSIFS ──");
for (const l of inoffensifs.sort()) console.log("  " + l);
